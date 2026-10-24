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
//   land when it carries a good haul (BOT_HAUL: there's no limit, so it
//   sets its own), it's hurt, or the light is low;
//   then it banks at a spire and travels home, or walks home. Returns how
//   it ended.
//   Bot.home() spends the haul like a player might: the forge studies
//   what's new, it equips any better base, forges a better pick, then
//   keeps every slot up (the rig's frame, plate and a charm, the one
//   furthest behind first, in the best ore it can pay for, striking the
//   anvil fairly), forges the cores its spells want and sets them (spell A
//   an Arc, B a Bolt or Lance, each with an element and Mods as it finds
//   them), setting the best cores, upgrading those behind its gear from
//   ore to spare, salvages the rest (spare cores into ore),
//   unseals relics, sets any shard and feeds the light its deeds earned to
//   the star (held at the altar), makes supplies from old ore at the
//   fabricator, builds the outpost's buildings and fits Wick's upgrades
//   as the stash can spare them (upgrading the Refinery, and refining ore
//   for its next pick once it stands), and spends attunements. Out there it
//   uses its supplies (an injector when hurt, a Lightcell when its light
//   is low), goes back for the pack a fall left before anything else,
//   and only kindles where the star's light reaches.
//   Bot.career({ sorties }) does both over and over from a fresh save.

function installBot() {
  const STEP = 1 / 60;
  // the haul it turns back with (the old cargo limit)
  const BOT_HAUL = 40;

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

  // How well a spell does against a foe: its element against the foe's
  // nature (as Wick would show it, or the truth once hit), twice as good
  // for Force against a warded shell.
  function handScore(sp, foe) {
    const g = spellGroup(sp), els = g && g.els.length ? g.els : ['force'];
    let k = elementMult(foe, els);
    if (foe.ward > 0 && els.includes('force')) k *= 2;
    return k;
  }

  // what last hurt the diver, for the report of a fall; and the packs a
  // fall left, recovered and lost
  if (!window.__botHurt) {
    window.__botHurt = true;
    const orig = window.hurtPlayer;
    window.hurtPlayer = function (dmg, from) { Bot.lastHurt = from && from.type ? from.type + (from.elite ? '*' : '') : from && from.vx !== undefined ? 'shot' : 'other'; return orig(dmg, from); };
    const rec = window.recoverCache, leave = window.leaveCache, use = window.useSupply;
    window.recoverCache = function (d, c) { const n = rec(d, c); if (!Save.data.cache) Bot.packs.recovered++; return n; };
    window.leaveCache = function (d) { const r = leave(d); if (r.cache) Bot.packs.left++; if (r.old) Bot.packs.lost++; return r; };
    window.useSupply = function (k) { const ok = use(k); if (ok) Bot.packs.used[k] = (Bot.packs.used[k] || 0) + 1; return ok; };
  }

  // The world's next step out: the dark territory next to lit land (the
  // outpost or a kindled territory) with the lowest enemy level, and where
  // to set out from to reach it: walking out of the outpost, or a spire
  // beside it.
  function plan(deepOdds = 0) {
    const L = worldMap(), lit = (id) => isKindled(id), c = Save.data.cache;
    // the pack a fall left, first: from the spire nearest it (but after two
    // falls going back for packs, it leaves them to the dark, as a player
    // would, until it comes home well again)
    if (c && terrOf(c.terr) && (Save.data.botChase || 0) < 2) {
      const t = terrOf(c.terr), deep = c.site > 0;
      if (hasSpire(t.id)) return { target: t.id, spire: t.id, deep, cache: true };
      if (t.nb.includes(0)) return { target: t.id, walk: t.id, deep, cache: true };
      const sp = t.nb.find((n) => hasSpire(n));
      if (sp !== undefined) return { target: t.id, spire: sp, deep, cache: true };
      const via = t.nb.find((n) => lit(n) && terrOf(n).nb.includes(0));
      if (via !== undefined) return { target: t.id, walk: via, deep, cache: true };
    }
    // at its edge, as a player pushes: the hardest it's ready for (a level
    // more each time it comes home twice from its edge), else the gentlest;
    // only where the star's light can hold a spire, and it has tasted the
    // land's band (spectrum.js); a land dark to it for its band is still
    // worth a sortie for its ore, which is what the star needs
    const best = Save.data.botBest || 1, edge = L.terrs.filter((t) => !t.home && !lit(t.id) && t.nb.some(lit)).sort((a, b) => terrLevel(a) - terrLevel(b) || a.id - b.id);
    const front = edge.filter((t) => !spireBlock(t.id)), banded = edge.filter((t) => { const b = spireBlock(t.id); return b && b.why === 'band'; });
    // now and then (and whenever no land it can kindle is left), a Deep
    // under lit land, the ones not yet reached first: their light, and ore
    // (not one it has fallen in twice with the gear it has now)
    const deeps = L.terrs.filter((t) => !t.home && t.deep && lit(t.id) && (hasSpire(t.id) || t.ring === 1) && deepZone(t, t.deep) !== 'lair' && !botBeaten(t.id));
    const fresh = deeps.filter((t) => !deepReached(t.id));
    // (and not into a region whose ore its pick can't break yet: a player
    // gets the pick first)
    const power = cutPower();
    const mineable = (t) => T.ores[ORE_INDEX[T.biomes[t.biome].ores[0]]].tier <= power;
    const ready = front.filter((t) => terrLevel(t) <= best && mineable(t));
    // (a land dark to the star for its band is worth a sortie for its ore
    // before a Deep is: it's what opens the next ring)
    if (deeps.length && (Math.random() < deepOdds * (fresh.length ? 2 : 1) || (!front.length && !banded.some(mineable)))) {
      const t = (fresh.length ? fresh : deeps).sort((a, b) => terrLevel(b) - terrLevel(a))[0];
      return hasSpire(t.id) ? { target: t.id, spire: t.id, deep: true } : { target: t.id, walk: t.id, deep: true };
    }
    const target = ready[ready.length - 1] || front.find(mineable) || front[0] || banded.find(mineable) || edge[0] || L.terrs.filter((t) => !t.home).sort((a, b) => terrLevel(b) - terrLevel(a))[0];
    if (target.nb.includes(0)) return { target: target.id, walk: target.id };
    const spire = target.nb.find((n) => hasSpire(n));
    if (spire !== undefined) return { target: target.id, spire };
    // lit only by the outpost's own light: walk out into it and across
    const via = target.nb.find((n) => lit(n) && terrOf(n).nb.includes(0));
    return { target: target.id, walk: via !== undefined ? via : target.nb.find((n) => terrOf(n).ring === 1) || 1 };
  }
  // Falls by where, with the gear worn at the time: a player stops going
  // back to a Deep that has beaten them twice, until their gear is better.
  const gearSum = () => facetTier() * 4;
  function botBeaten(id) { const f = (Save.data.botFalls || {})[id]; return !!f && f.n >= 2 && f.gear >= gearSum(); }
  function botFell(id) { const F = Save.data.botFalls || (Save.data.botFalls = {}), g = gearSum(), f = F[id]; F[id] = { n: f && f.gear >= g ? f.n + 1 : 1, gear: g }; }
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
    const result = () => ({ target, ring: terrOf(target).ring, level: terrLevel(terrOf(target)), clime: terrOf(target).clime, kills: d.kills, cargo: cargoCount(d) + Object.values((d.banked && d.banked.stuff) || {}).reduce((a, b) => a + b, 0), items: d.items.length, hp: Math.round(d.p.hp), time: Math.round(t), deep: !!(d.tally && d.tally.deeps), kindled: kindledCount() - kindled0, lastHurt: Bot.lastHurt, hollow: d.enemies.some((e) => e.type === 'hollow' && !e.dead) });
    const at = (x, y) => { const w = d.floor.w; return y * w + x; };
    while (t < maxTime) {
      if (Game.dive !== d) { ended = UI.report && UI.report.recalled ? 'recalled' : UI.report && UI.report.banked ? 'home' : 'died'; break; }
      if (Game.modal) UI.close();
      if (d.warp) { for (let k = 0; k < 6; k++) Game.step(STEP); t += 0.1; continue; }
      const p = d.p, st = d.stats, f = d.floor, steps = stepsFromMe(d), ts = terrPeek(d.terr) || {}, T0 = terrOf(d.terr);
      Input.bot = { x: 0, y: 0 };
      const now = [d.kills, cargoCount(d), d.terr, d.deep && d.deep.site, (ts.lit || []).length, ts.done, ts.state].join();
      if (now !== progress) { progress = now; progressT = t; }
      else if (t - progressT > 20 && aim) { (aim.ore !== undefined ? skipOre.add(aim.ore) : skipFoe.add(aim.foe)); aim = null; progressT = t; }
      const hollow = d.enemies.find((e) => !e.dead && e.type === 'hollow');
      // (what's under the sand, the water or on the roof can't be fought yet)
      const foe = d.enemies.filter((e) => !e.dead && !e.hid && !skipFoe.has(e) && e.type !== 'hollow' && dist(e.x, e.y, p.x, p.y) < (e.aggro ? 110 : 70) && steps.plain[at(Math.floor(e.x / TILE), Math.floor(e.y / TILE))] >= 0)
        .sort((a, b) => dist(a.x, a.y, p.x, p.y) - dist(b.x, b.y, p.x, p.y))[0];
      const foeM = foe ? dist(foe.x, foe.y, p.x, p.y) : 1e9, close = foe && (foeM < 40 || (foe.state === 'windup' && foeM < 70));
      // dim: no more light than the walk back to lit land takes, and a bit
      const lead = d.deep ? 0.3 : (() => { const g = compassTargetWorld(d, steps), n = g ? steps[at(g.x, g.y)] : 30; return (Math.max(0, n) / 3.2 + 3) / T.world.light; })();
      const full = cargoCount(d) >= BOT_HAUL * 0.92, hurt = p.hp < st.maxHp * 0.3 && !supplyCount('injector'), dim = !d.kindled && d.pull < lead;
      if (!d.kindled && (full || hurt || dim || (t > 420 && d.terr === target))) back = true;
      if (d.terr === target && d.kindled && !P.deep) back = true;
      // back in lit land with light again: push out once more, if it's fit
      const canPush = pushes < 3 && p.hp > st.maxHp * 0.6 && t < 360 && cargoCount(d) < BOT_HAUL * 0.7;
      const action = actionHere();
      let goal = null; // where to walk, if not fighting or mining
      let act = false, mine = true;
      if (d.channel) { mine = false; /* hold still */ }
      // stranded: hurt with no light, or in a Deep with no lit way up
      else if (!d.kindled && ((hurt && d.pull <= 0) || (d.deep && (d.pull <= 0.08 || d.zone === 'lair' || (back && hurt)) && !(f.pad && !d.padDark && steps[at(f.pad.x, f.pad.y)] >= 0 && steps[at(f.pad.x, f.pad.y)] < 15))) && (!foe || d.pull <= 0.08 || hurt)) UI.acts.recall();
      else if (d.lat !== null && d.lat !== undefined) {
        // the Lattice: not played yet; back up its cleft (lattice.js)
        mine = false;
        if (action === 'way') act = true;
        else if (f.ways && f.ways[0]) goal = f.ways[0];
        else UI.acts.recall();
      } else if (d.deep) {
        // a Deep, as the old expeditions: on through its portal, or up its
        // lodeline when it's time (never down the cleft into the Lattice)
        const up = f.pad && !d.padDark ? f.pad : null;
        if ((back || d.deep.site >= d.deep.of) && up) { if (action === 'extract') act = true; else goal = up; mine = false; }
        else if (action === 'way' && (back || !full) && d.ways[wayHere(d)] !== 'lattice') act = true;
        else if (f.ways && f.ways[0] && (back || !full)) { goal = f.ways[0]; if (back) mine = false; }
        else if (up) goal = up;
      } else if (d.kindled) {
        mine = false;
        if (P.deep && d.terr === target && !deepTried && f.ways && f.ways[0] && !back) {
          if (action === 'way') { act = true; deepTried = true; } else goal = f.ways[0];
        } else if (back || d.terr === target) {
          // bank, push out again if it's fit, or go home: at a spire, travel
          // home; else walk home
          const spire = f.pad && hasSpire(d.terr), carrying = cargoCount(d) > 0 || d.items.length;
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
          // (not where a spire couldn't hold yet)
          const fit = d.pull > 0.3 && p.hp > st.maxHp * 0.5 && !spireBlock(d.terr);
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
      // the pack a fall left, when it lies here: before anything else
      const pk = cacheHere(d);
      if (pk && !d.channel && !(hollow && dist(hollow.x, hollow.y, p.x, p.y) < 60)) { const at = cacheSpot(d, pk); goal = { x: Math.floor(at.x / TILE), y: Math.floor(at.y / TILE) }; act = false; mine = false; }
      // supplies: an injector when hurt, a Lightcell when the light's low
      if (!d.channel || d.hold) {
        if (p.hp < st.maxHp * 0.35 && supplyCount('injector')) useSupply('injector');
        else if (!d.kindled && d.pull < 0.2 && supplyCount('cell')) useSupply('cell');
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
        // With the choice, not the spell whose element the foe resists (and
        // Force for a warded shell)
        const rig = Save.data.equip.main, spA = rigSpell(rig, 0), spB = rigSpell(rig, 1);
        const tap = (iter++ & 1) === 0, mf = spellForm(spA), mainClose = !rig || mf === 'arc' || mf === 'glaive';
        const inMain = mainClose ? m < 30 : m < 120, inOff = m < 120 && !!rig;
        const sm = handScore(spA, foe), so = handScore(spB, foe);
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
    // (two falls running and it steps back a level, to gear up before trying
    // again)
    if (ended === 'died') {
      sv.botWins = 0;
      if (P.cache) sv.botChase = (sv.botChase || 0) + 1;
      if (d.deep || P.deep) botFell(d.terr);
      if ((sv.botLosses = (sv.botLosses || 0) + 1) >= 2) { sv.botBest = Math.max(1, (sv.botBest || 1) - 1); sv.botLosses = 0; }
    } else if (ended === 'home') {
      sv.botChase = 0; sv.botLosses = 0;
      if (lv >= (sv.botBest || 1) && (sv.botWins = (sv.botWins || 0) + 1) >= 2) { sv.botBest = (sv.botBest || 1) + 1; sv.botWins = 0; }
    }
    const r = result();
    if (!ended) { if (Game.dive === d) { loseDive(false); UI.close(); } ended = 'timeout'; }
    // a fall wakes at a spire: home from there to spend the haul
    if (Game.dive && !Game.dive.hub) { const w = Game.dive; UI.close(); w.cargo = {}; goHome('spire'); }
    UI.close();
    return Object.assign(r, { ended, why });
  }

  // Home, as a player would spend it: the star turned (its casts from the
  // best facets it has), supplies from old ore, the light its deeds earned
  // fed, the ore the bands need given, and the attunements spent.
  function home() {
    const s = Save.data, acts = UI.acts, log = [];
    UI.close();
    log.push(...turnStar());
    log.push(...makeSupplies());
    const fed = feedStar();
    if (fed) log.push(`fed the star ${fed}`);
    log.push(...giveBands());
    for (const id of ['vitality', 'proximity', 'vitality', 'clarity', 'stride', 'proximity']) if (attunePointsLeft(s) > 0) acts.attune(id);
    Save.save();
    UI.close();
    return log;
  }

  // The star turned as a player might: cast A an Arc (a Glaive once it
  // has one) in the deepest band, cast B a Lance if it has one, else a
  // Bolt, in the next band; the extra facets Quicken and Amplify first,
  // then the Readings and the shards of old light, best first.
  function turnStar() {
    const F = facetsState(), log = [], bands = bandsCastable().sort((a, b) => bandDepth(b) - bandDepth(a));
    const want = [F.shapes.includes('glaive') ? 'glaive' : 'arc', F.shapes.includes('lance') ? 'lance' : 'bolt'];
    want.forEach((shape, i) => { if (F.casts[i].shape !== shape) { faceSet(i, 'shape', shape); log.push(`cast ${i ? 'B' : 'A'}: ${shape}`); } });
    bands.slice(0, 2).forEach((ore, i) => { const c = F.casts[i] || F.casts[0]; if (c.band !== ore && bandDepth(ore) > bandDepth(c.band)) { faceSet(i, 'band', ore); log.push(`cast ${i ? 'B' : 'A'} in ${ore}`); } });
    const order = ['quicken', 'amplify', 'chain', 'echo', 'split', 'pierce', 'linger'];
    const pool = extraFacets().sort((x, y) => (x.kind === 'legend' ? -1 : x.kind === 'mod' ? order.indexOf(x.id) : 50) - (y.kind === 'legend' ? -1 : y.kind === 'mod' ? order.indexOf(y.id) : 50));
    let k = 0;
    for (let i = 0; i < 2; i++) for (let slot = 0; slot < facetExtraSlots(); slot++) {
      const x = pool[k++];
      if (!x) break;
      if (!facetSame(F.casts[i].extra[slot], x)) { faceSet(i, slot, x); log.push(`faced ${facetName(x)}`); }
    }
    return log;
  }

  // Feeding the star as a player does: at the altar, a shard set first if
  // one came home, then FEED THE STAR held until all the light has gone up.
  // Returns how much went.
  function feedStar() {
    const s = Save.data, d = Game.dive, alt = HUB_STATIONS.find((x) => x.id === 'altar');
    if (!d || !d.hub) return 0;
    UI.close();
    const had = s.star, bot = Input.bot;
    d.p.x = (alt.x + 0.5) * TILE; d.p.y = (alt.y + 0.5) * TILE + 10;
    if (Story.shardsHeld() > Story.shardsSet()) { Input.bot = { x: 0, y: 0, act: true }; Game.step(1 / 60); UI.close(); }
    Input.bot = { x: 0, y: 0, act: true, actHeld: true };
    for (let i = 0; i < 3600 && lightWaiting() > 0; i++) Game.step(1 / 60);
    Input.bot.actHeld = false;
    for (let i = 0; i < 90; i++) Game.step(1 / 60);
    UI.close();
    Input.bot = bot;
    return s.star - had;
  }

  // Ore into the star, as a player would (spectrum.js): the band a dark
  // frontier land needs first, to depth 1; then, once its pick is past an
  // ore, that ore towards the mark, keeping 30 back for gear and supplies.
  function giveBands() {
    const s = Save.data, out = [], L = worldMap(), lit = (id) => isKindled(id);
    const need = new Set(L.terrs.filter((t) => !t.home && !lit(t.id) && t.nb.some(lit)).map((t) => { const b = spireBlock(t.id); return b && b.why === 'band' ? b.ore : null; }).filter(Boolean));
    for (const ore of need) { const n = Math.min(s.stash[ore] || 0, Math.max(0, T.spectrum.depths[1] - bandGiven(ore))); if (n > 0 && giveOre(ore, n)) out.push(`gave the star ${n} ${ore}`); }
    const power = s.equip.pick ? s.equip.pick.base.power : 1;
    for (const o of T.ores) {
      if (o.tier >= power || bandAtMark(o.id)) continue;
      const n = Math.min(Math.max(0, (s.stash[o.id] || 0) - 30), Math.max(0, T.spectrum.depths[bandMark()] - bandGiven(o.id)));
      if (n > 0 && giveOre(o.id, n)) out.push(`gave the star ${n} ${o.id}`);
    }
    return out;
  }

  // Supplies from old ore, as a player might: the region's ore behind the
  // one its pick is working through is spare, the current one's is kept
  // back for gear (30 of it). Injectors most, then Lightcells.
  function makeSupplies() {
    const s = Save.data, log = [], power = cutPower(), region = Math.floor((power - 1) / 2);
    const want = [['injector', 4], ['cell', 2]];
    const spare = (ore) => { const i = ORE_INDEX[ore], r = Math.floor(i / 2); return (s.stash[ore] || 0) - (r >= region ? 30 : 0); };
    for (const [kind, n] of want) {
      while (supplyCount(kind) < n) {
        const c = supplyCost(s.stash);
        if (!c.ok || spare(c.ore) < c.n || !makeSupply(kind, false)) break;
        log.push('made ' + SUPPLY_KINDS[kind].name);
      }
    }
    return log;
  }

  function career({ sorties = 20 } = {}) {
    const out = [];
    for (let n = 0; n < sorties; n++) {
      const s = Save.data, f0 = facetCount();
      Bot.n = n + 1;
      const r = sortie();
      r.mods = facetCount() - f0;
      r.home = home();
      r.mag = magnitudeOf(s.star);
      r.pick = s.equip.pick ? s.equip.pick.base.power : 0;
      r.hands = s.equip.main ? `${s.equip.main.name} t${s.equip.main.tier} [${s.equip.main.spells.map(spellName).join(' / ')}]` : 'fist';
      r.maxHp = computeStats(s.equip, s.attune).maxHp;
      r.gearTier = ['main', 'armor', 'charm', 'pick'].map((k) => (s.equip[k] ? s.equip[k].tier : 0));
      const F = facetsState();
      r.socketed = rigCores(s.equip.main).length; r.sockets = s.equip.main.spells.reduce((a, sp) => a + spellParts(sp).length, 0);
      r.modTiers = rigCores(s.equip.main).map((m) => m.tier); r.modRarities = '';
      r.found = facetCount(); r.merges = 0; r.prints = F.legends.length; r.patterns = knownPatterns().length; r.shapes = F.shapes.length; r.turns = F.mods.length;
      r.kindledAll = kindledCount();
      r.bands = Object.assign({}, Save.data.bands);
      r.star = s.star;
      r.packs = JSON.parse(JSON.stringify(Bot.packs));
      r.rolled = JSON.parse(JSON.stringify(Bot.rolled));
      r.built = Object.assign({}, Bot.built);
      r.supplies = Object.assign({}, s.supplies || {});
      out.push(r);
    }
    return out;
  }

  // how many facets the star knows, of every kind
  const facetCount = () => { const F = facetsState(); return F.shapes.length + F.mods.length + F.legends.length + knownPatterns().length; };
  window.Bot = { sortie, plan, home, career, turnStar, feedStar, makeSupplies, packs: { recovered: 0, left: 0, lost: 0, used: {} }, rolled: {}, built: {}, n: 0 };
}

module.exports = { installBot };
