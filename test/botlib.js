'use strict';
// The autopilot. installBot runs in the page and adds Bot, which plays
// through the same controls a thumb does (Input.bot) and the same actions
// the screens' buttons run (UI.acts):
//   Bot.sortie() plays one sortie: it picks the dark territory beside lit
//   land with the lowest enemy level (Bot.plan), sets out to it (walking
//   out of the outpost, or from a spire beside it), fights what it meets,
//   works the heart goal while it has the light and health for it (the
//   waystones, the tear, planting the spire), mines what its pick can
//   break, now and then goes down into a Deep, and turns back towards lit
//   land when the cargo is nearly full, it's hurt, or the light is low;
//   then it banks at a spire and travels home, or walks home. Returns how
//   it ended.
//   Bot.home() spends the haul like a player might: equips anything better,
//   forges a better pick, casters, plate and a charm when it can (striking
//   the anvil fairly), forges the stones its circuits want and sockets them
//   (an Arc in the gauntlet, a Bolt or Lance in the other hand, with an
//   element and glyphs as it finds them), salvages the rest, unseals relics,
//   feeds spare ore to the star and spends attunements.
//   Bot.career({ sorties }) does both over and over from a fresh save.

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

  // How well a hand's circuit does against a foe: its first group's
  // elements against the foe's nature (as Wick would show it, or the truth
  // once hit), twice as good for Force against a warded shell.
  function handScore(it, foe) {
    const P = it ? parseCircuit(it.slots, it.links) : null, g = P && P.groups[0], els = g && g.els.length ? g.els : ['force'];
    let k = elementMult(foe, els);
    if (foe.ward > 0 && els.includes('force')) k *= 2;
    return k;
  }

  // what last hurt the diver, for the report of a fall
  if (!window.__botHurt) {
    window.__botHurt = true;
    const orig = window.hurtPlayer;
    window.hurtPlayer = function (dmg, from) { Bot.lastHurt = from && from.type ? from.type + (from.elite ? '*' : '') : from && from.vx !== undefined ? 'shot' : 'other'; return orig(dmg, from); };
  }

  // The world's next step out: the dark territory next to lit land (the
  // outpost or a kindled territory) with the lowest enemy level, and where
  // to set out from to reach it: walking out of the outpost, or a spire
  // beside it.
  function plan(deepOdds = 0) {
    const L = worldMap(), lit = (id) => isKindled(id);
    // now and then, a Deep under lit land, for its ore
    const deeps = L.terrs.filter((t) => !t.home && t.deep && lit(t.id) && (hasSpire(t.id) || t.ring === 1) && deepZone(t, t.deep) !== 'lair');
    if (deeps.length && Math.random() < deepOdds) {
      const t = deeps.sort((a, b) => terrLevel(b) - terrLevel(a))[0];
      return hasSpire(t.id) ? { target: t.id, spire: t.id, deep: true } : { target: t.id, walk: t.id, deep: true };
    }
    // at its edge, as a player pushes: the hardest it's ready for (a level
    // more each time it comes home twice from its edge), else the gentlest
    const best = Save.data.botBest || 1, front = L.terrs.filter((t) => !t.home && !lit(t.id) && t.nb.some(lit)).sort((a, b) => terrLevel(a) - terrLevel(b) || a.id - b.id);
    const ready = front.filter((t) => terrLevel(t) <= best);
    const target = ready[ready.length - 1] || front[0] || L.terrs.filter((t) => !t.home).sort((a, b) => terrLevel(b) - terrLevel(a))[0];
    if (target.nb.includes(0)) return { target: target.id, walk: target.id };
    const spire = target.nb.find((n) => hasSpire(n));
    if (spire !== undefined) return { target: target.id, spire };
    // lit only by the outpost's own light: walk out into it and across
    const via = target.nb.find((n) => lit(n) && terrOf(n).nb.includes(0));
    return { target: target.id, walk: via !== undefined ? via : target.nb.find((n) => terrOf(n).ring === 1) || 1 };
  }
  // the opening of this territory that leads (over the fewest territories,
  // through lit land where it can) towards `to`
  function exitTowards(d, to) {
    const L = worldMap(), hops = new Map([[to, 0]]), q = [to];
    for (let i = 0; i < q.length; i++) for (const n of L.terrs[q[i]].nb) if (!hops.has(n) && n !== 0) { hops.set(n, hops.get(q[i]) + 1); q.push(n); }
    return d.floor.exits.slice().sort((a, b) => (hops.has(a.to) ? hops.get(a.to) : 99) - (hops.has(b.to) ? hops.get(b.to) : 99))[0];
  }

  // One sortie: out to the plan's territory, its goal and its ore, a Deep
  // now and then, and back to a spire (or the outpost) to bank and go home.
  // Returns how it ended.
  function sortie({ maxTime = 900, deepOdds = 0.4 } = {}) {
    UI.close();
    const P = plan(Save.data.equip.pick && Save.data.equip.pick.base.power >= 2 ? deepOdds * 0.6 : 0);
    if (P.walk !== undefined) startSortie({ terr: P.walk, from: 0 }); else startSortie({ terr: P.spire, spire: true });
    const d = Game.dive, kindled0 = kindledCount();
    Input.bot = { x: 0, y: 0 };
    let t = 0, stuck = 0, lastX = 0, lastY = 0, ended = null, back = false, deepTried = false, iter = 0, pushes = 0, target = P.target;
    // (not with the gear it started with)
    const ready = Save.data.equip.pick && Save.data.equip.pick.base.power >= 2;
    const wantDeep = ready && (P.deep || Math.random() < deepOdds);
    const skipOre = new Set(), skipFoe = new Set();
    let progressT = 0, progress = '', aim = null;
    Bot.lastHurt = null;
    const result = () => ({ target, ring: terrOf(target).ring, level: terrLevel(terrOf(target)), clime: terrOf(target).clime, kills: d.kills, cargo: cargoUsed(d) + Object.values((d.banked && d.banked.stuff) || {}).reduce((a, b) => a + b, 0), items: d.items.length, hp: Math.round(d.p.hp), time: Math.round(t), deep: !!(d.tally && d.tally.deeps), kindled: kindledCount() - kindled0, lastHurt: Bot.lastHurt, hollow: d.enemies.some((e) => e.type === 'hollow' && !e.dead) });
    const at = (x, y) => { const w = d.floor.w; return y * w + x; };
    while (t < maxTime) {
      if (Game.dive !== d) { ended = UI.report && UI.report.recalled ? 'recalled' : UI.report && UI.report.banked ? 'home' : 'died'; break; }
      if (Game.modal) UI.close();
      if (d.warp) { for (let k = 0; k < 6; k++) Game.step(STEP); t += 0.1; continue; }
      const p = d.p, st = d.stats, f = d.floor, steps = stepsFromMe(d), ts = terrPeek(d.terr) || {}, T0 = terrOf(d.terr);
      Input.bot = { x: 0, y: 0 };
      const now = [d.kills, cargoUsed(d), d.terr, d.deep && d.deep.site, (ts.lit || []).length, ts.done, ts.state].join();
      if (now !== progress) { progress = now; progressT = t; }
      else if (t - progressT > 20 && aim) { (aim.ore !== undefined ? skipOre.add(aim.ore) : skipFoe.add(aim.foe)); aim = null; progressT = t; }
      const hollow = d.enemies.find((e) => !e.dead && e.type === 'hollow');
      // (what's under the sand, the water or on the roof can't be fought yet)
      const foe = d.enemies.filter((e) => !e.dead && !e.hid && !skipFoe.has(e) && e.type !== 'hollow' && dist(e.x, e.y, p.x, p.y) < (e.aggro ? 110 : 70) && steps.plain[at(Math.floor(e.x / TILE), Math.floor(e.y / TILE))] >= 0)
        .sort((a, b) => dist(a.x, a.y, p.x, p.y) - dist(b.x, b.y, p.x, p.y))[0];
      const foeM = foe ? dist(foe.x, foe.y, p.x, p.y) : 1e9, close = foe && (foeM < 40 || (foe.state === 'windup' && foeM < 70));
      // dim: no more light than the walk back to lit land takes, and a bit
      const lead = d.deep ? 0.3 : (() => { const g = compassTargetWorld(d, steps), n = g ? steps[at(g.x, g.y)] : 30; return (Math.max(0, n) / 3.2 + 3) / T.world.light; })();
      const full = cargoUsed(d) >= st.cargo * 0.92, hurt = p.hp < st.maxHp * 0.3, dim = !d.kindled && d.pull < lead;
      if (!d.kindled && (full || hurt || dim || (t > 420 && d.terr === target))) back = true;
      if (d.terr === target && d.kindled && !P.deep) back = true;
      // back in lit land with light again: push out once more, if it's fit
      const canPush = pushes < 3 && p.hp > st.maxHp * 0.6 && t < 360 && cargoUsed(d) < st.cargo * 0.7;
      const action = actionHere();
      let goal = null; // where to walk, if not fighting or mining
      let act = false, mine = true;
      if (d.channel) { mine = false; /* hold still */ }
      // stranded: hurt with no light, or in a Deep with no lit way up
      else if (!d.kindled && ((hurt && d.pull <= 0) || (d.deep && (d.pull <= 0 || d.zone === 'lair' || (back && hurt)) && !(f.pad && !d.padDark && steps[at(f.pad.x, f.pad.y)] >= 0 && steps[at(f.pad.x, f.pad.y)] < 15))) && (!foe || d.pull <= 0 || hurt)) UI.acts.recall();
      else if (d.deep) {
        // a Deep, as the old expeditions: on through its portal, or up its
        // lodeline when it's time
        const up = f.pad && !d.padDark ? f.pad : null;
        if ((back || d.deep.site >= d.deep.of) && up) { if (action === 'extract') act = true; else goal = up; mine = false; }
        else if (action === 'way' && (back || !full)) act = true;
        else if (f.ways && f.ways[0] && (back || !full)) { goal = f.ways[0]; if (back) mine = false; }
        else if (up) goal = up;
      } else if (d.kindled) {
        mine = false;
        if (P.deep && d.terr === target && !deepTried && f.ways && f.ways[0] && !back) {
          if (action === 'way') { act = true; deepTried = true; } else goal = f.ways[0];
        } else if (back || d.terr === target) {
          // bank, push out again if it's fit, or go home: at a spire, travel
          // home; else walk home
          const spire = f.pad && hasSpire(d.terr), carrying = cargoUsed(d) > 0 || d.items.length;
          if (canPush && !(spire && carrying)) { back = false; pushes++; target = plan(0).target; }
          else if (spire) { if (action === 'extract') { if (carrying) act = true; else travelFrom(d, 0); } else goal = f.pad; }
          else { const e = f.exits.find((x) => x.to === 0) || exitTowards(d, 0); goal = e; }
        } else goal = exitTowards(d, target);
      } else {
        // dark land
        if (back || d.terr !== target) { goal = d.terr === target || back ? compassTargetWorld(d, steps) : exitTowards(d, target); if (back) mine = false; }
        else {
          // the heart goal, while there's light and health for it (or
          // first, the Deep under it, if that's what it came for)
          const fit = d.pull > 0.3 && p.hp > st.maxHp * 0.5;
          if (wantDeep && !deepTried && f.ways && f.ways[0] && deepZone(T0, T0.deep) !== 'lair' && d.pull > 0.7 && !full && p.hp > st.maxHp * 0.6) deepTried = 'go';
          if (deepTried === 'go') { /* below */ }
          else if (T0.goal === 'waystones' && !ts.done && fit) {
            if (d.hold) { const s = f.stones[d.hold.k]; goal = { x: s.x, y: s.y + 1 }; }
            else { const k = [0, 1, 2].find((k) => !(ts.lit || []).includes(k)); const s = f.stones[k]; if (action === 'stone' && !close) act = true; else goal = { x: s.x, y: s.y + 1 }; }
            mine = !d.hold;
          } else if (T0.goal === 'rift' && !ts.done && fit && d.rift && d.rift.open) {
            if (action === 'rift' && !close) act = true; else goal = { x: d.rift.x, y: d.rift.y + 1 };
          } else if (ts.done && fit) {
            if (action === 'plant' && !close) act = true; else goal = { x: f.heart.x, y: f.heart.y + 1 };
          }
          if (deepTried === 'go' && !d.deep) { if (action === 'way') { act = true; deepTried = true; } else goal = f.ways[0]; mine = false; }
          else if (deepTried === 'go') deepTried = true;
        }
      }
      Bot.why = [d.terr, target, !!d.deep, d.kindled, back, action, !!foe, !!hollow, full, hurt, dim].join(',');
      if (act) Input.bot.act = true;
      else if (d.channel) { /* hold still while it fills */ }
      else if (hollow && !d.kindled && dist(hollow.x, hollow.y, p.x, p.y) < 90 && !(foe && dist(foe.x, foe.y, p.x, p.y) < 20)) {
        // run from the Hollow, towards lit land
        const g = d.deep ? (f.pad && !d.padDark ? f.pad : f.ways[0]) : compassTargetWorld(d, steps);
        if (g) goTile(d, steps, g.x, g.y);
        if (p.dashCd <= 0 && dist(hollow.x, hollow.y, p.x, p.y) < 30) Input.bot.dash = true;
      } else if (foe && (close || (!back && !goal))) {
        const m = dist(foe.x, foe.y, p.x, p.y);
        aim = { foe };
        if (m > 14) goTile(d, steps, Math.floor(foe.x / TILE), Math.floor(foe.y / TILE));
        // tap, don't hold: alternate presses make combos; dash out of a tell.
        // With the choice, not the hand whose elements the foe resists (and
        // Force for a warded shell)
        const tap = (iter++ & 1) === 0, mf = firstForm(Save.data.equip.main), mainClose = !Save.data.equip.main || mf === 'arc' || mf === 'glaive';
        const inMain = mainClose ? m < 30 : m < 120, inOff = m < 120 && !!Save.data.equip.off;
        const sm = handScore(Save.data.equip.main, foe), so = handScore(Save.data.equip.off, foe);
        // (a hand the foe shrugs off rests while the other can reach it)
        const skip = inMain && inOff ? (sm < 0.8 && so > sm * 1.3 ? 'main' : so < 0.8 && sm > so * 1.3 ? 'off' : null) : null;
        // (still a tap at a time: a button down two turns running is a hold,
        // which charges)
        Input.bot.main = inMain && skip !== 'main' && tap;
        Input.bot.off = inOff && skip !== 'off' && !tap;
        if (d.enemies.some((e) => !e.dead && e.state === 'windup' && (e.hid ? dist(e.aimX, e.aimY, p.x, p.y) : dist(e.x, e.y, p.x, p.y)) < 50) && p.dashCd <= 0) { const a = norm(p.x - foe.x, p.y - foe.y); Input.bot.x = -a.y; Input.bot.y = a.x; Input.bot.dash = true; }
      } else {
        const ore = mine && !full && !d.kindled && oreToMine(d, steps, skipOre);
        if (ore && !act && (!goal || steps[at(ore.sx, ore.sy)] < 6)) {
          aim = { ore: at(ore.ox, ore.oy) };
          const near = steps[at(ore.sx, ore.sy)] <= 1;
          const m = near ? walkTo(d, (ore.sx + 0.5) * TILE + (ore.ox - ore.sx) * 3, (ore.sy + 0.5) * TILE + (ore.oy - ore.sy) * 3) : (goTile(d, steps, ore.sx, ore.sy), 99);
          if (m < 4) { Input.bot.x = 0; Input.bot.y = 0; p.fx = ore.ox - ore.sx; p.fy = ore.oy - ore.sy; Input.bot.mine = true; }
        } else if (goal) {
          aim = null;
          if (goal.to !== undefined && steps[at(goal.x, goal.y)] <= 2) walkTo(d, (goal.x + 0.5 - goal.nx) * TILE, (goal.y + 0.5 - goal.ny) * TILE);
          else goTile(d, steps, goal.x, goal.y);
        }
      }
      // a ring or a shadow on the ground underfoot (a skink, a dropper): out
      const under = d.enemies.find((e) => !e.dead && e.hid && e.state === 'windup' && dist(e.aimX, e.aimY, p.x, p.y) < 22);
      if (under && p.dashCd <= 0 && !d.channel) { const a = norm(p.x - under.aimX + 0.01, p.y - under.aimY); Input.bot.x = a.x; Input.bot.y = a.y; Input.bot.dash = true; }
      // grab drops nearby
      const drop = !hollow && d.drops.find((dr) => dist(dr.x, dr.y, p.x, p.y) < 80 && !dr.warned && steps.plain[at(Math.floor(dr.x / TILE), Math.floor(dr.y / TILE))] >= 0);
      if (drop && !foe && !d.channel && !act && !back && !goal) {
        const tx = Math.floor(drop.x / TILE), ty = Math.floor(drop.y / TILE);
        if (steps.plain[at(tx, ty)] <= 1) walkTo(d, drop.x, drop.y); else goTile(d, steps, tx, ty);
      }
      for (let k = 0; k < 6; k++) { Game.step(STEP); t += STEP; if (Game.dive !== d || d.warp) break; }
      // unstick: if not moving while trying to, jiggle
      if (Math.hypot(p.x - lastX, p.y - lastY) < 0.05 && (Input.bot.x || Input.bot.y)) stuck++; else stuck = 0;
      lastX = p.x; lastY = p.y;
      if (stuck > 30) { Input.bot.x = Math.random() * 2 - 1; Input.bot.y = Math.random() * 2 - 1; for (let k = 0; k < 20; k++) Game.step(STEP); stuck = 0; }
    }
    Input.bot = null;
    const why = ended ? '' : Bot.why + ` at ${Math.round(d.p.x)},${Math.round(d.p.y)}`;
    // two good sorties at its edge and it's ready for a level more; a fall
    // and it starts counting again
    const lv = terrLevel(terrOf(target)), sv = Save.data;
    if (ended === 'died') sv.botWins = 0;
    else if (ended === 'home' && lv >= (sv.botBest || 1) && (sv.botWins = (sv.botWins || 0) + 1) >= 2) { sv.botBest = (sv.botBest || 1) + 1; sv.botWins = 0; }
    const r = result();
    if (!ended) { if (Game.dive === d) abandonDive(); ended = 'timeout'; }
    // a fall wakes at a spire: home from there to spend the haul
    if (Game.dive && !Game.dive.hub) { const w = Game.dive; UI.close(); w.cargo = {}; goHome('spire'); }
    UI.close();
    return Object.assign(r, { ended, why });
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
      const bp = BLUEPRINTS[bpId], ore = T.ores.slice().reverse().find((o) => (s.stash[o.id] || 0) - (pickOre && o.id === pickOre.id ? BLUEPRINTS.pick.ore : 0) >= bp.ore + 6);
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
    // the elements, best first: by how often the kinds it meets fear them
    // and how seldom they shrug them off
    const worth = (el) => ['crawler', 'wisp', 'construct', 'snapjaw', 'spitter'].reduce((n, t) => { const v = (natureTable(t) || {})[el]; return n + T.enemies[t].weight * (v ? T.circuits.resist[v] : 1); }, 0);
    const elements = ['shock', 'frost', 'ember', 'blight'].sort((a, b) => worth(b) - worth(a));
    const have = (id) => s.items.filter((x) => x.kind === 'stone' && x.stone === id).concat(['main', 'off'].flatMap((k) => (s.equip[k] ? s.equip[k].slots.filter((x) => x && x.stone === id) : [])));
    // (keeping back what the next pick takes)
    const pickOre = T.ores.find((o) => o.tier === (s.equip.pick ? s.equip.pick.base.power : 1));
    const bestOre = (bp) => T.ores.slice().reverse().find((o) => (s.stash[o.id] || 0) - (pickOre && o.id === pickOre.id ? BLUEPRINTS.pick.ore : 0) >= bp.ore + 4);
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

  function career({ sorties = 20 } = {}) {
    const out = [];
    for (let n = 0; n < sorties; n++) {
      const s = Save.data;
      const r = sortie();
      r.home = home();
      r.mag = magnitudeOf(s.star);
      r.pick = s.equip.pick ? s.equip.pick.base.power : 0;
      r.hands = ['main', 'off'].map((k) => (s.equip[k] ? `${s.equip[k].name} t${s.equip[k].tier} [${s.equip[k].slots.map((x) => (x ? x.stone : '-')).join(' ')}]` : 'fist')).join(' / ');
      r.maxHp = computeStats(s.equip, s.attune).maxHp;
      r.kindledAll = kindledCount();
      out.push(r);
    }
    return out;
  }

  window.Bot = { sortie, plan, home, career, circuits };
}

module.exports = { installBot };
