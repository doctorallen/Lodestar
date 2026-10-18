'use strict';
// The autopilot. installBot runs in the page and adds Bot, which plays
// through the same controls a thumb does (Input.bot) and the same actions
// the screens' buttons run (UI.acts):
//   Bot.dive({ biome, depth }) plays one dive: it fights what it meets,
//   mines what its pick can break, goes down the shaft until `depth`, and
//   heads for a lodeline when it's there, when the cargo is nearly full, or
//   when it's hurt. Returns how it ended.
//   Bot.home() spends the haul like a player might: equips anything better,
//   forges a better pick, casters, plate and a charm when it can (striking
//   the anvil fairly), forges the stones its circuits want and sockets them
//   (an Arc in the gauntlet, a Bolt or Lance in the other hand, with an
//   element and glyphs as it finds them), salvages the rest, unseals relics,
//   feeds spare ore to the star and spends attunements.
//   Bot.career({ dives }) does both over and over from a fresh save.

function installBot() {
  const STEP = 1 / 60;

  // steps on foot from the diver to every tile, round a clime's lava and
  // vents (the generator never lets them cut anything off)
  function stepsFromMe(d) {
    const f = d.floor;
    if (f.botAvoid === undefined) {
      f.botAvoid = null;
      if (f.hazKind === 'burn' || f.hazKind === 'vent') {
        f.botAvoid = new Uint8Array(f.w * f.h);
        if (f.haz) for (let i = 0; i < f.haz.length; i++) if (f.haz[i]) f.botAvoid[i] = 1;
        if (f.hazKind === 'vent') for (const v of f.hazPts) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!dx || !dy) f.botAvoid[(v.y + dy) * f.w + v.x + dx] = 1;
      }
    }
    const x = Math.floor(d.p.x / TILE), y = Math.floor(d.p.y / TILE), plain = floorDistances(f.tiles, f.w, f.h, x, y);
    if (!f.botAvoid) { plain.plain = plain; return plain; }
    // walked round; but what's on them (an enemy, a drop) is still seen
    const safe = floorDistances(f.tiles, f.w, f.h, x, y, f.botAvoid);
    safe.plain = plain;
    return safe;
  }
  // the next tile on the way to (tx, ty): walk back down the distances from it
  function towards(d, steps, tx, ty) {
    const f = d.floor;
    let i = ty * f.w + tx;
    if (steps[i] < 0) return null;
    while (steps[i] > 1) {
      const x = i % f.w, y = (i - x) / f.w;
      let next = -1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = (y + dy) * f.w + x + dx;
        if (steps[j] >= 0 && steps[j] < steps[i]) { next = j; break; }
      }
      if (next < 0) break;
      i = next;
    }
    return { x: (i % f.w + 0.5) * TILE, y: (Math.floor(i / f.w) + 0.5) * TILE };
  }
  function walkTo(d, x, y) {
    const dx = x - d.p.x, dy = y - d.p.y, m = Math.hypot(dx, dy);
    Input.bot.x = m > 1.5 ? dx / m : 0; Input.bot.y = m > 1.5 ? dy / m : 0;
    return m;
  }
  function goTile(d, steps, tx, ty) {
    if (steps[ty * d.floor.w + tx] < 0 && steps.plain) steps = steps.plain;
    const n = towards(d, steps, tx, ty);
    if (!n) return false;
    if (steps[ty * d.floor.w + tx] <= 1) walkTo(d, (tx + 0.5) * TILE, (ty + 0.5) * TILE);
    else walkTo(d, n.x, n.y);
    return true;
  }

  // the nearest ore the pick can break, with an open tile beside it
  function oreToMine(d, steps, skip = new Set()) {
    const f = d.floor, pick = Save.data.equip.pick;
    if (!pick) return null;
    let best = null, bd = 1e9;
    for (let i = 0; i < f.w * f.h; i++) {
      if (f.tiles[i] !== TILE_ORE || T.ores[f.ore[i] - 1].tier > pick.base.power || skip.has(i)) continue;
      const x = i % f.w, y = (i - x) / f.w;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const j = (y + dy) * f.w + x + dx;
        if (steps[j] >= 0 && steps[j] < bd) { bd = steps[j]; best = { ox: x, oy: y, sx: x + dx, sy: y + dy }; }
      }
    }
    return bd < 40 ? best : null;
  }

  function dive({ biome = 0, depth = 3, maxTime = 900, greed = false } = {}) {
    UI.close();
    startDive(biome);
    const d = Game.dive;
    Input.bot = { x: 0, y: 0 };
    let t = 0, stuck = 0, lastX = 0, lastY = 0, ended = null;
    // a watchdog: no kill, ore or new floor for a while and the bot gives up
    // on whatever it was after
    const skipOre = new Set(), skipFoe = new Set();
    let progressT = 0, progress = '', aim = null, iter = 0;
    const result = () => ({ biome, depth: d.depth, clime: d.clime, kills: d.kills, cargo: cargoUsed(d), items: d.items.length, hp: Math.round(d.p.hp), time: Math.round(t) });
    while (t < maxTime) {
      if (Game.dive !== d) { ended = UI.report && UI.report.recalled ? 'recalled' : UI.report && UI.report.banked ? 'extracted' : 'died'; break; }
      if (Game.modal) UI.close();
      const p = d.p, st = d.stats, steps = stepsFromMe(d);
      Input.bot = { x: 0, y: 0 };
      const now = [d.kills, cargoUsed(d), d.depth, d.items.length].join();
      if (now !== progress) { progress = now; progressT = t; }
      else if (t - progressT > 20 && aim) { (aim.ore !== undefined ? skipOre.add(aim.ore) : skipFoe.add(aim.foe)); aim = null; progressT = t; }
      // (what's under the sand, the water or on the roof can't be fought yet)
      const foe = d.enemies.filter((e) => !e.dead && !e.hid && !skipFoe.has(e) && (e.aggro || dist(e.x, e.y, p.x, p.y) < 70) && steps.plain[Math.floor(e.y / TILE) * d.floor.w + Math.floor(e.x / TILE)] >= 0)
        .sort((a, b) => dist(a.x, a.y, p.x, p.y) - dist(b.x, b.y, p.x, p.y))[0];
      const full = cargoUsed(d) >= st.cargo * (greed ? 1 : 0.85), hurt = !greed && p.hp < st.maxHp * 0.35;
      const leave = (full || hurt || d.depth >= depth || !(d.floor.ways || []).length) && d.floor.pad && !d.padDark;
      const action = actionHere();
      Bot.why = [action, !!foe, full, hurt, leave, d.depth, depth, !!d.floor.pad].join(',');
      // stranded (no lodeline here, full, hurt or out of time): recall
      const late = d.pull < 0.3, stranded = (!d.floor.pad || d.padDark) && (full || hurt || late) && (!(d.floor.ways || []).length || hurt || late || d.depth >= depth);
      if (d.channel) { /* hold still while the lodeline lifts */ }
      else if (stranded && (!foe || late)) UI.acts.recall();
      else if (action === 'extract' && leave) { Input.bot.act = true; }
      else if (action === 'way' && !leave && (!d.floor.pad || d.depth < depth || full || hurt)) { Input.bot.act = true; }
      else if (foe && !(hurt && d.floor.pad)) {
        const m = dist(foe.x, foe.y, p.x, p.y);
        aim = { foe };
        if (m > 14) goTile(d, steps, Math.floor(foe.x / TILE), Math.floor(foe.y / TILE));
        // tap, don't hold: alternate presses make combos; dash out of a tell
        const tap = (iter++ & 1) === 0, mf = firstForm(Save.data.equip.main), mainClose = !Save.data.equip.main || mf === 'arc' || mf === 'glaive';
        Input.bot.main = tap && (mainClose ? m < 30 : m < 120);
        Input.bot.off = !tap && m < 120 && !!Save.data.equip.off;
        if (d.enemies.some((e) => !e.dead && e.state === 'windup' && (e.hid ? dist(e.aimX, e.aimY, p.x, p.y) : dist(e.x, e.y, p.x, p.y)) < 50) && p.dashCd <= 0) { const a = norm(p.x - foe.x, p.y - foe.y); Input.bot.x = -a.y; Input.bot.y = a.x; Input.bot.dash = true; }
      } else if (leave) goTile(d, steps, d.floor.pad.x, d.floor.pad.y);
      else {
        const ore = !full && oreToMine(d, steps, skipOre);
        if (ore) {
          aim = { ore: ore.oy * d.floor.w + ore.ox };
          const near = steps[ore.sy * d.floor.w + ore.sx] <= 1;
          // stand a little in from the middle of the tile beside it, towards it
          const m = near ? walkTo(d, (ore.sx + 0.5) * TILE + (ore.ox - ore.sx) * 3, (ore.sy + 0.5) * TILE + (ore.oy - ore.sy) * 3) : (goTile(d, steps, ore.sx, ore.sy), 99);
          if (m < 4) { Input.bot.x = 0; Input.bot.y = 0; p.fx = ore.ox - ore.sx; p.fy = ore.oy - ore.sy; Input.bot.mine = true; }
        } else {
          // on: the nearer way (the lair's last of all), or home
          // the lair only with a weapon of the biome's own tier or better
          const main = Save.data.equip.main, ready = main && main.tier >= 1 + d.biome * 2;
          const lair = (w) => !ready && d.ways[d.floor.ways.indexOf(w)] === 'lair' ? 1e6 : 0;
          const ways = (d.floor.ways || []).slice().sort((a, b) => steps[a.y * d.floor.w + a.x] + lair(a) - steps[b.y * d.floor.w + b.x] - lair(b));
          const to = (d.depth >= depth || full || !ways.length) ? (d.floor.pad && !d.padDark ? d.floor.pad : ways[0]) : ways[0];
          if (to) goTile(d, steps, to.x, to.y);
        }
      }
      // a ring or a shadow on the ground underfoot (a skink, a dropper): out
      const under = d.enemies.find((e) => !e.dead && e.hid && e.state === 'windup' && dist(e.aimX, e.aimY, p.x, p.y) < 22);
      if (under && p.dashCd <= 0 && !d.channel) { const a = norm(p.x - under.aimX + 0.01, p.y - under.aimY); Input.bot.x = a.x; Input.bot.y = a.y; Input.bot.dash = true; }
      // grab drops nearby
      const drop = d.drops.find((dr) => dist(dr.x, dr.y, p.x, p.y) < 80 && !dr.warned && steps.plain[Math.floor(dr.y / TILE) * d.floor.w + Math.floor(dr.x / TILE)] >= 0);
      if (drop && !foe) {
        const tx = Math.floor(drop.x / TILE), ty = Math.floor(drop.y / TILE);
        if (steps.plain[ty * d.floor.w + tx] <= 1) walkTo(d, drop.x, drop.y); else goTile(d, steps, tx, ty);
      }
      for (let k = 0; k < 6; k++) { Game.step(STEP); t += STEP; if (Game.dive !== d) break; }
      // unstick: if not moving while trying to, jiggle
      if (Math.hypot(p.x - lastX, p.y - lastY) < 0.05 && (Input.bot.x || Input.bot.y)) stuck++; else stuck = 0;
      lastX = p.x; lastY = p.y;
      if (stuck > 30) { Input.bot.x = Math.random() * 2 - 1; Input.bot.y = Math.random() * 2 - 1; for (let k = 0; k < 20; k++) Game.step(STEP); stuck = 0; }
    }
    Input.bot = null;
    const o = oreToMine(d, stepsFromMe(d));
    const why = Bot.why + ` at ${Math.round(d.p.x)},${Math.round(d.p.y)} ore ${JSON.stringify(o)} target ${JSON.stringify(d.target)} mine ${JSON.stringify(d.p.mine)} bot ${JSON.stringify(Input.bot)}`;
    if (!ended) { if (Game.dive === d) abandonDive(); ended = 'timeout'; }
    return Object.assign(result(), { ended, why: ended === 'timeout' ? why : '' });
  }

  // what a player might do at home with the haul
  function home() {
    const s = Save.data, acts = UI.acts, log = [];
    UI.closeCard();
    // unseal relics
    for (const r of s.items.filter((i) => i.kind === 'relic')) { UI.openCard(r, 'stash', r.uid); acts.unseal(); Reveal.done(); UI.closeCard(); log.push('unsealed'); }
    const best = () => {
      // equip anything better than what's worn (casters: below)
      for (const it of s.items.slice()) {
        const slot = compareSlot(s.equip, it);
        if (!slot || it.kind === 'caster') continue;
        if (itemWorth(it) > itemWorth(s.equip[slot]) * 1.05) { UI.openCard(it, 'stash', it.uid); acts.equip(slot); log.push('equip ' + it.name); }
      }
    };
    best();
    // forge: the best ore it has enough of, bound with the part it has most of
    const forge = (bpId, oreId) => {
      const bp = BLUEPRINTS[bpId], part = PART_STACK_IDS.filter((id) => bindsWith(bpId, id) && (s.stash[id] || 0) >= bp.parts).sort((a, b) => s.stash[b] - s.stash[a])[0];
      if ((bp.parts && !part) || (s.stash[oreId] || 0) < bp.ore || (bp.exotic && !s.stash[bp.exotic])) return false;
      Object.assign(UI.forge, { field: false, bp: bpId, ore: oreId, part: part || null, exotic: null });
      acts.craft();
      if (Anvil.job) { Anvil.finish(1); Reveal.done(); }
      return true;
    };
    UI.forge.field = false;
    // a pick that breaks the next ore up
    const pick = s.equip.pick, pickOre = T.ores.find((o) => o.tier === (pick ? pick.base.power : 1));
    if (pickOre && forge(s.blueprints.includes('drill') ? 'drill' : 'pick', pickOre.id)) log.push('forged ' + pickOre.name + ' pick');
    // casters (a gauntlet in the main hand, a staff or a wand in the off),
    // plate and a charm, in the best ore it has plenty of
    const offBp = s.blueprints.includes('staff') ? 'staff' : 'wand';
    for (const [bpId, slot] of [['gauntlet', 'main'], [offBp, 'off'], ['plate', 'armor'], ['charm', 'charm']]) {
      const bp = BLUEPRINTS[bpId], ore = T.ores.slice().reverse().find((o) => (s.stash[o.id] || 0) >= bp.ore + 6);
      const cur = s.equip[slot];
      if (ore && (!cur || cur.tier < ore.tier || (bp.kind === 'caster' && cur.bp !== bpId)) && forge(bpId, ore.id)) log.push('forged ' + bpId + ' in ' + ore.name);
    }
    UI.closeCard();
    best();
    // the casters: the best of each kind into its hand, its circuit moved over
    for (const [slot, bpId] of [['main', 'gauntlet'], ['off', offBp]]) {
      const cur = s.equip[slot], better = s.items.filter((it) => it.kind === 'caster' && it.bp === bpId && itemWorth(it) > (cur && cur.bp === bpId ? itemWorth(cur) * 1.05 : 0)).sort((a, b) => itemWorth(b) - itemWorth(a))[0];
      if (better) { UI.openCard(better, 'stash', better.uid); acts.equip(slot); log.push('equip ' + better.name); }
    }
    UI.closeCard();
    log.push(...circuits(forge));
    // salvage what's left that isn't a stone
    for (const it of s.items.filter((i) => i.kind !== 'stone' && i.kind !== 'relic')) { UI.openCard(it, 'stash', it.uid); acts.salvage(); }
    UI.closeCard();
    // feed ore the bot doesn't need for its next pick
    const keep = T.ores.find((o) => o.tier === (s.equip.pick ? s.equip.pick.base.power : 1));
    for (const o of T.ores) {
      const have = s.stash[o.id] || 0, spare = have - (keep && o.id === keep.id ? BLUEPRINTS.pick.ore : 14);
      if (spare >= 10) for (let k = 0; k < Math.floor(spare / 10); k++) acts.feed(o.id + ':10');
    }
    for (const id of ['vitality', 'proximity', 'capacity', 'vitality', 'clarity', 'stride', 'capacity']) if (attunePointsLeft(s) > 0) acts.attune(id);
    Save.save();
    UI.close();
    return log;
  }

  // The circuits a player might build: the gauntlet an Arc (Quicken,
  // Amplify, Chain), the other hand a Lance if it has one, else a Bolt
  // (Pierce or Split, Amplify), each with an Element if it has the exotic.
  // It forges the stones it wants from what's in the stash (a Form again
  // when its ore is a tier better), with home's forge(bp, ore), then
  // sockets them.
  function circuits(forge) {
    const s = Save.data, log = [];
    const want = {
      main: ['arc', 'el', 'quicken', 'amplify', 'chain', 'linger'],
      off: [s.blueprints.includes('form_lance') ? 'lance' : 'bolt', 'el', s.blueprints.includes('form_lance') ? 'split' : 'pierce', 'amplify', 'echo', 'chain'],
    };
    const elements = ['shock', 'frost', 'ember', 'blight'];
    const have = (id) => s.items.filter((x) => x.kind === 'stone' && x.stone === id).concat(['main', 'off'].flatMap((k) => (s.equip[k] ? s.equip[k].slots.filter((x) => x && x.stone === id) : [])));
    const bestOre = (bp) => T.ores.slice().reverse().find((o) => (s.stash[o.id] || 0) >= bp.ore + 4);
    const make = (id) => {
      const bpId = BP_IDS.find((b) => BLUEPRINTS[b].stone === id);
      if (!bpId || !s.blueprints.includes(bpId)) return false;
      const ore = bestOre(BLUEPRINTS[bpId]);
      if (!ore) return false;
      const top = Math.max(0, ...have(id).map((x) => x.tier));
      if (top >= ore.tier) return false;
      if (forge(bpId, ore.id)) { log.push(`forged ${id} stone in ${ore.name}`); return true; }
      return false;
    };
    for (const k of ['main', 'off']) {
      const it = s.equip[k];
      if (!it) continue;
      const n = it.slots.length;
      for (const id of want[k].slice(0, n)) {
        if (id !== 'el') { make(id); continue; }
        // an element: one this hand hasn't, from an exotic it has
        const own = elements.filter((e) => have(e).length);
        if (own.length < 2) { const e = elements.find((x) => !have(x).length && s.stash[STONE_ELEMENTS[x]]); if (e) make(e); }
      }
    }
    // socket: every stone back to the stash, then each hand's best
    for (const k of ['main', 'off']) { const it = s.equip[k]; if (!it) continue; it.slots.forEach((x, i) => { if (x) { s.items.push(x); it.slots[i] = null; } }); }
    const take = (id) => { const st = s.items.filter((x) => x.kind === 'stone' && x.stone === id).sort((a, b) => b.tier - a.tier)[0]; if (st) s.items.splice(s.items.indexOf(st), 1); return st || null; };
    const used = [];
    for (const k of ['main', 'off']) {
      const it = s.equip[k];
      if (!it) continue;
      let i = 0;
      for (const id of want[k]) {
        if (i >= it.slots.length) break;
        let st;
        if (id === 'el') { const e = elements.find((x) => !used.includes(x) && s.items.some((y) => y.stone === x)) || elements.find((x) => s.items.some((y) => y.stone === x)); st = e ? take(e) : null; if (st) used.push(e); }
        else st = take(id);
        if (st) it.slots[i++] = st;
      }
    }
    Save.save();
    return log;
  }

  function career({ dives = 20 } = {}) {
    const out = [];
    for (let n = 0; n < dives; n++) {
      const s = Save.data;
      const biome = [2, 1, 0].find((i) => biomeOpen(s, i));
      const deep = s.deepest[T.biomes[biome].id] || 0;
      const r = dive({ biome, depth: Math.max(2, Math.min(deep + 1, 6)) });
      r.home = home();
      r.mag = magnitudeOf(s.star);
      r.pick = s.equip.pick ? s.equip.pick.base.power : 0;
      r.hands = ['main', 'off'].map((k) => (s.equip[k] ? `${s.equip[k].name} t${s.equip[k].tier} [${s.equip[k].slots.map((x) => (x ? x.stone : '-')).join(' ')}]` : 'fist')).join(' / ');
      r.maxHp = computeStats(s.equip, s.attune).maxHp;
      out.push(r);
    }
    return out;
  }

  window.Bot = { dive, home, career, circuits };
}

module.exports = { installBot };
