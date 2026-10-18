'use strict';
// The autopilot. installBot runs in the page and adds Bot, which plays
// through the same controls a thumb does (Input.bot) and the same actions
// the screens' buttons run (UI.acts):
//   Bot.dive({ biome, depth }) plays one dive: it fights what it meets,
//   mines what its pick can break, goes down the shaft until `depth`, and
//   heads for a lodeline when it's there, when the cargo is nearly full, or
//   when it's hurt. Returns how it ended.
//   Bot.home() spends the haul like a player might: equips anything better,
//   forges a better pick, a blade and plate when it can (striking the anvil
//   fairly), salvages the rest, unseals relics, feeds spare ore to the star
//   and spends attunements.
//   Bot.career({ dives }) does both over and over from a fresh save.

function installBot() {
  const STEP = 1 / 60;

  // steps on foot from the diver to every tile
  function stepsFromMe(d) {
    const f = d.floor;
    return floorDistances(f.tiles, f.w, f.h, Math.floor(d.p.x / TILE), Math.floor(d.p.y / TILE));
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
    const result = () => ({ biome, depth: d.depth, kills: d.kills, cargo: cargoUsed(d), items: d.items.length, hp: Math.round(d.p.hp), time: Math.round(t) });
    while (t < maxTime) {
      if (Game.dive !== d) { ended = UI.report && UI.report.banked ? 'extracted' : 'died'; break; }
      if (Game.modal) UI.close();
      const p = d.p, st = d.stats, steps = stepsFromMe(d);
      Input.bot = { x: 0, y: 0 };
      const now = [d.kills, cargoUsed(d), d.depth, d.items.length].join();
      if (now !== progress) { progress = now; progressT = t; }
      else if (t - progressT > 20 && aim) { (aim.ore !== undefined ? skipOre.add(aim.ore) : skipFoe.add(aim.foe)); aim = null; progressT = t; }
      const foe = d.enemies.filter((e) => !e.dead && !skipFoe.has(e) && (e.aggro || dist(e.x, e.y, p.x, p.y) < 70) && steps[Math.floor(e.y / TILE) * d.floor.w + Math.floor(e.x / TILE)] >= 0)
        .sort((a, b) => dist(a.x, a.y, p.x, p.y) - dist(b.x, b.y, p.x, p.y))[0];
      const full = !greed && cargoUsed(d) >= st.cargo * 0.85, hurt = !greed && p.hp < st.maxHp * 0.35;
      const leave = (full || hurt || d.depth >= depth) && d.floor.pad;
      const action = actionHere();
      Bot.why = [action, !!foe, full, hurt, leave, d.depth, depth, !!d.floor.pad].join(',');
      if (action === 'extract' && leave) { Input.bot.act = true; }
      else if (action === 'descend' && !leave && (!d.floor.pad || d.depth < depth || full || hurt)) { Input.bot.act = true; }
      else if (foe && !(hurt && d.floor.pad)) {
        const m = dist(foe.x, foe.y, p.x, p.y);
        aim = { foe };
        if (m > 14) goTile(d, steps, Math.floor(foe.x / TILE), Math.floor(foe.y / TILE));
        // tap, don't hold: alternate presses make combos; dash out of a tell
        const tap = (iter++ & 1) === 0, mainFocus = Save.data.equip.main && Save.data.equip.main.kind === 'focus';
        Input.bot.main = tap && (mainFocus ? m < 120 : m < 40);
        Input.bot.off = !tap && m < 120 && !!Save.data.equip.off;
        if (d.enemies.some((e) => !e.dead && e.state === 'windup' && dist(e.x, e.y, p.x, p.y) < 50) && p.dashCd <= 0) { const a = norm(p.x - foe.x, p.y - foe.y); Input.bot.x = -a.y; Input.bot.y = a.x; Input.bot.dash = true; }
      } else if (leave) goTile(d, steps, d.floor.pad.x, d.floor.pad.y);
      else {
        const ore = !full && oreToMine(d, steps, skipOre);
        if (ore) {
          aim = { ore: ore.oy * d.floor.w + ore.ox };
          const near = steps[ore.sy * d.floor.w + ore.sx] <= 1;
          // stand a little in from the middle of the tile beside it, towards it
          const m = near ? walkTo(d, (ore.sx + 0.5) * TILE + (ore.ox - ore.sx) * 3, (ore.sy + 0.5) * TILE + (ore.oy - ore.sy) * 3) : (goTile(d, steps, ore.sx, ore.sy), 99);
          if (m < 4) { Input.bot.x = 0; Input.bot.y = 0; p.fx = ore.ox - ore.sx; p.fy = ore.oy - ore.sy; Input.bot.mine = true; }
        } else if (d.depth >= depth || full) goTile(d, steps, (d.floor.pad || d.floor.shaft).x, (d.floor.pad || d.floor.shaft).y);
        else goTile(d, steps, d.floor.shaft.x, d.floor.shaft.y);
      }
      // grab drops nearby
      const drop = d.drops.find((dr) => dist(dr.x, dr.y, p.x, p.y) < 80 && !dr.warned && steps[Math.floor(dr.y / TILE) * d.floor.w + Math.floor(dr.x / TILE)] >= 0);
      if (drop && !foe) {
        const tx = Math.floor(drop.x / TILE), ty = Math.floor(drop.y / TILE);
        if (steps[ty * d.floor.w + tx] <= 1) walkTo(d, drop.x, drop.y); else goTile(d, steps, tx, ty);
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
    const forge = (kind) => { acts.craft(kind); if (Anvil.job) { Anvil.finish(1); Reveal.done(); } };
    UI.forge.field = false;
    const best = () => {
      // equip anything better than what's worn
      for (const it of s.items.slice()) {
        const slot = compareSlot(s.equip, it);
        if (!slot) continue;
        if (itemWorth(it) > itemWorth(s.equip[slot]) * 1.05) { UI.openCard(it, 'stash', it.uid); acts.equip(slot); log.push('equip ' + it.name); }
      }
    };
    best();
    // forge: a pick that breaks the next ore, then a blade and plate in the best ore
    const pick = s.equip.pick, pickOre = T.ores.find((o) => o.tier === (pick ? pick.base.power : 1));
    if (pickOre && (s.stash[pickOre.id] || 0) >= craftCost('pick')) { UI.forge.ore = pickOre.id; forge('pick'); log.push('forged ' + pickOre.name + ' pick'); }
    for (const kind of ['blade', 'armor', 'charm']) {
      const ore = T.ores.slice().reverse().find((o) => (s.stash[o.id] || 0) >= craftCost(kind) + 6);
      const cur = kind === 'blade' ? s.equip.main : s.equip[kind];
      if (ore && (!cur || cur.tier < ore.tier)) { UI.forge.ore = ore.id; forge(kind); log.push('forged ' + kind + ' in ' + ore.name); }
    }
    UI.closeCard();
    best();
    // salvage what's left that isn't a core
    for (const it of s.items.filter((i) => i.kind !== 'core' && i.kind !== 'relic')) { UI.openCard(it, 'stash', it.uid); acts.salvage(); }
    UI.closeCard();
    // feed ore the bot doesn't need for its next pick
    const keep = T.ores.find((o) => o.tier === (s.equip.pick ? s.equip.pick.base.power : 1));
    for (const o of T.ores) {
      const have = s.stash[o.id] || 0, spare = have - (keep && o.id === keep.id ? craftCost('pick') : 10);
      if (spare >= 10) for (let k = 0; k < Math.floor(spare / 10); k++) acts.feed(o.id + ':10');
    }
    for (const id of ['vitality', 'might', 'capacity', 'vitality', 'might', 'stride', 'capacity']) if (attunePointsLeft(s) > 0) acts.attune(id);
    Save.save();
    UI.close();
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
      r.blade = s.equip.main ? `${s.equip.main.name} t${s.equip.main.tier}` : 'fists';
      r.maxHp = computeStats(s.equip, s.attune).maxHp;
      out.push(r);
    }
    return out;
  }

  window.Bot = { dive, home, career };
}

module.exports = { installBot };
