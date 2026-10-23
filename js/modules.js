'use strict';
// ---------------------------------------------------------------------------
// Cores on the ground, and what leaves them. A core is its kind and its
// tier (patterns.js: what a pattern is, what the suit reads, the stacks
// and the merge). Here: what a kill leaves in cores (an elite the core its
// affix names; a warden or a Keeper a legendary, with a power), a sealed
// relic and an ancient forge (a legendary), research (what the forge
// studies, and the recipes it reveals), old saves (gear from before
// modules turned into bases and modules, then modules into threads and
// legendary cores: migrateGearSave, migrateCoreSave; patterns.js takes
// them on from there), and how a core on the ground looks: the crystal,
// its capture and the tether as it's taken. Never say outright that the
// dark is alive.
// ---------------------------------------------------------------------------

const FOE_WORDS = { crawler: 'Crawler', wisp: 'Wisp', construct: 'Stalker', snapjaw: 'Snapjaw', spitter: 'Spitter', warden: 'Warden', keeper: 'Keeper', hollow: 'Hollow' };
const foeWord = (type) => FOE_WORDS[type] || (typeof FOE_NAMES !== 'undefined' && FOE_NAMES[type] ? FOE_NAMES[type][0] : 'creature');

// Where a core came from, in words: "Caught from a Warden, Bloomfen";
// "Printed at the replicator".
function coreSource(c) {
  const s = c.src;
  if (!s) return '';
  if (s.was) return `From ${s.was}, made before cores carried power`;
  if (s.relic) return 'Opened from a sealed relic';
  if (s.forge) return 'Found by an ancient forge';
  if (s.merged) return 'Folded from three at the tuning bench';
  if (s.forged) return c.pattern ? 'Printed at the replicator' : 'Made at the replicator';
  if (!s.foe) return '';
  const who = foeWord(s.foe), where = [s.clime ? climeName(s.clime) : '', s.deep ? 'a Deep' : ''].filter(Boolean).join(', ');
  const what = s.foe === 'keeper' ? 'the Keeper' : s.foe === 'warden' ? 'a Warden' : `${s.elite ? 'an elite' : /^[AEIOU]/.test(who) ? 'an' : 'a'} ${who}`;
  return `Caught from ${what}${where ? ', ' + where : ''}`;
}

// ---------------------------------------------------------------------------
// Drops
// ---------------------------------------------------------------------------
// What a kill leaves in cores: a Keeper or a warden a legendary (or more:
// T.cores.legend), an elite the core its first affix names (T.cores.elite
// of the time), anything else nothing. Rolled with the dive's rng.
function coreDrops(d, e) {
  const C = T.cores, rng = d.rng, tier = dropTier(d);
  const src = { foe: e.type, clime: d.clime || null, elite: !!e.elite, deep: !!d.deep };
  const out = [];
  if (e.type === 'keeper') { for (let i = 0; i < C.legend.keeper; i++) out.push(legendaryCore(rng, Math.min(T.ores.length, tier + 1), src)); return out; }
  if (e.boss) { for (let i = 0; i < C.legend.boss; i++) out.push(legendaryCore(rng, Math.min(T.ores.length, tier + 1), src)); return out; }
  const stone = eliteCoreFor(e);
  if (stone && rng.chance(C.elite)) out.push(makeStone(stone, Math.min(T.ores.length, tier), { src }));
  return out;
}

// A core lies by each ancient forge once ever (a forge's floor is rebuilt
// each time it's entered): true the first time for this floor.
function forgeFindOnce(d) {
  const s = Save.data, key = `${d.seed}:${d.depth}`;
  s.forgeFinds = s.forgeFinds || [];
  if (s.forgeFinds.includes(key)) return false;
  s.forgeFinds.push(key);
  return true;
}

// A sealed relic opens at the Lodestar into a legendary core.
function unsealRelic(rng, relic) { return legendaryCore(rng, relic.tier, { relic: true }); }

// ---------------------------------------------------------------------------
// A cost: { threads, ore: { id, n } | null, stuff: [{ id, n }] }. What's
// short of it in `src`, and paying it.
// ---------------------------------------------------------------------------
function benchShort(cost, src) {
  const out = [];
  if ((src.thread || 0) < cost.threads) out.push({ id: 'thread', n: cost.threads - (src.thread || 0) });
  if (cost.ore && (src[cost.ore.id] || 0) < cost.ore.n) out.push({ id: cost.ore.id, n: cost.ore.n - (src[cost.ore.id] || 0) });
  for (const s of cost.stuff || []) if ((src[s.id] || 0) < s.n) out.push({ id: s.id, n: s.n - (src[s.id] || 0) });
  return out;
}
function benchPay(cost, src) {
  if (benchShort(cost, src).length) return false;
  const take = (id, n) => { if (!n) return; src[id] -= n; if (!src[id]) delete src[id]; };
  take('thread', cost.threads);
  if (cost.ore) take(cost.ore.id, cost.ore.n);
  for (const s of cost.stuff || []) take(s.id, s.n);
  return true;
}

// ---------------------------------------------------------------------------
// Research
// ---------------------------------------------------------------------------
// Whether a research's thing is at home: an ore, a part (any grade) or an
// exotic in the stash, or a kind of creature's pattern read by the suit
// (patterns.js; 'any': the first pattern of all).
function researchHas(s, r) {
  const k = r.id.split(':')[0];
  if (k === 'ore' || k === 'ex') return (s.stash[r.of] || 0) > 0;
  if (k === 'part') return [1, 2, 3].some((g) => (s.stash[partId(r.of, g)] || 0) > 0);
  const known = PATTERN_KINDS.filter((kind) => ((s.scans || {})[kind] || 0) >= T.patterns.scans);
  return r.of === 'any' ? known.length > 0 : known.includes(r.of);
}
// What the forge has yet to study, of what's at home.
function researchDue(s = Save.data) {
  const done = new Set(s.studied || []);
  return RESEARCH.filter((r) => !done.has(r.id) && researchHas(s, r));
}
// The forge studies everything new at home: each one's recipes are known
// from now on. Returns [{ r, opened (the recipes it revealed that weren't
// known) }], the finds that revealed something.
function researchStudy(s = Save.data) {
  const out = [];
  s.studied = s.studied || [];
  for (const r of researchDue(s)) {
    s.studied.push(r.id);
    const opened = r.opens.filter((id) => BLUEPRINTS[id] && !s.blueprints.includes(id));
    for (const id of opened) s.blueprints.push(id);
    if (opened.length) out.push({ r, opened });
  }
  return out;
}
// What a research studied, in words, and its icon.
function researchWhat(r) {
  const k = r.id.split(':')[0];
  if (k === 'ore' || k === 'ex') return stuffName(r.of);
  if (k === 'part') return PARTS[r.of].name.charAt(0).toUpperCase() + PARTS[r.of].name.slice(1);
  return r.of === 'any' ? 'A pattern read' : `The ${foeWord(r.of)}'s pattern`;
}
function researchIconUrl(r) {
  const k = r.id.split(':')[0];
  if (k === 'part') return stuffIconUrl(partId(r.of, 1));
  if (k === 'scan') return stoneIconUrl('bolt');
  return stuffIconUrl(r.of);
}

// ---------------------------------------------------------------------------
// An old save: gear from before modules
// ---------------------------------------------------------------------------
// A piece with rolled affixes becomes a base of its recipe and tier (its
// numbers kept), and what it rolled becomes a module of its rarity in its
// first socket (or with `spill`, if it has none or it's `loose`): its
// affixes, its power or its set piece, so nothing it did is lost.
function migrateOldPiece(it, spill, loose) {
  if (!it || !KIND_SLOT[it.kind] || Array.isArray(it.sockets)) return it;
  const bpId = it.bp && BLUEPRINTS[it.bp] && BLUEPRINTS[it.bp].kind === it.kind ? it.bp : KIND_BLUEPRINT[it.kind];
  const keepName = /^(Scrap Gauntlet|Cracked Wand|Rusty Pick)$/.test(it.name || '');
  const base = { uid: it.uid, kind: it.kind, bp: bpId, tier: it.tier, q: 0, rarity: 'common', base: it.base || baseStats(it.kind, it.tier, BLUEPRINTS[bpId]), affixes: [], sockets: [null] };
  if (it.kind === 'caster') { base.slots = Array.isArray(it.slots) ? it.slots : [null, null, null]; if (it.links && it.links.length) base.links = it.links; }
  if (it.fav) base.fav = true;
  base.name = keepName ? it.name : baseName(base);
  const affixes = (it.affixes || []).filter((a) => a && AFFIXES[a.id]).map((a) => ({ id: a.id, v: a.v }));
  const power = it.power && LEGENDARIES[it.power] ? it.power : null, set = typeof it.set === 'string' ? it.set : null;
  if (affixes.length || power || set) {
    const rarity = power ? 'legendary' : set ? 'set' : RARITIES.includes(it.rarity) ? it.rarity : 'magic';
    const m = { uid: newItemUid(), kind: 'module', fits: it.kind, tier: Math.max(1, it.tier || 1), rarity, affixes, src: { was: it.name || 'an old piece' } };
    if (power) m.power = power;
    if (set) m.set = set;
    m.name = it.name || 'Old pattern';
    if (base.sockets.length && !loose) base.sockets[0] = m; else spill.push(m);
  }
  return base;
}
// Turns an old save's gear (worn, stashed, and in a sortie's cargo and
// pocket) into bases and modules. The save's blueprints are its known
// recipes already, and its relics open into modules now. True if anything
// changed.
function migrateGearSave(s) {
  if ((s.v || 0) >= 6) return false;
  const spill = [];
  for (const k of Object.keys(s.equip || {})) s.equip[k] = migrateOldPiece(s.equip[k], spill);
  // (a stashed or carried piece's module lies beside it, where it's seen)
  s.items = (s.items || []).map((it) => migrateOldPiece(it, spill, true));
  s.items.push(...spill.splice(0));
  if (s.run) {
    s.run.items = (s.run.items || []).map((it) => migrateOldPiece(it, spill, true));
    s.run.items.push(...spill.splice(0));
    for (const e of s.run.pocket || []) if (e.item) e.item = migrateOldPiece(e.item, spill);
    s.items.push(...spill.splice(0));
  }
  // every recipe an old forge made from the start is still known
  s.blueprints = (s.blueprints || []).concat(BP_IDS.filter((id) => BLUEPRINTS[id].start && !(s.blueprints || []).includes(id)));
  s.studied = s.studied || [];
  s.v = 6;
  return true;
}

// ---------------------------------------------------------------------------
// An old save: modules into cores (version 8)
// ---------------------------------------------------------------------------
// Modules and sockets are gone: each module unravels into the threads it
// would have salvaged for, except a legendary, which becomes a legendary
// core of a random kind with its power (nothing that changed how you play
// is lost). Every base loses its sockets; a frame's spells gain the extra
// part its ore gives (frameExtra), and a second Mod a frame no longer has
// goes to the stash. True if anything changed.
function migrateCoreSave(s) {
  if ((s.v || 0) >= 8) return false;
  const stash = s.stash = s.stash && typeof s.stash === 'object' ? s.stash : {};
  const threadsOf = (m) => { const S = T.cores.salvage; return (S[m.rarity] || S.common) + S.perTier * (Math.max(1, m.tier || 1) - 1); };
  const fromModule = (m, into) => {
    if (m.power && LEGENDARIES[m.power]) {
      const c = legendaryCore(new Rng(hashInts(m.uid || 1, 0x8c, 1)), Math.max(1, m.tier || 1), { was: m.name || 'a module' });
      c.power = m.power;
      if (m.fav) c.fav = true;
      into.push(c);
    } else stash.thread = (stash.thread || 0) + threadsOf(m);
  };
  const fixBase = (it, into) => {
    if (!it || typeof it !== 'object') return it;
    if (it.kind === 'module') { fromModule(it, into); return null; }
    if (Array.isArray(it.sockets)) { for (const m of it.sockets) if (m) fromModule(m, into); delete it.sockets; }
    if (it.kind === 'caster' && Array.isArray(it.spells)) {
      const extra = frameExtra(it.tier || 1, it.q || 0, !!it.shard, oreOfTier(it.tier || 1).id);
      it.extra = extra;
      for (const sp of it.spells) {
        if (!sp || !Array.isArray(sp.mods)) continue;
        const want = extra === 'glyph' ? 2 : 1;
        while (sp.mods.length > want) { const m = sp.mods.pop(); if (m) into.push(m); }
        while (sp.mods.length < want) sp.mods.push(null);
        if (extra === 'element' && !('el2' in sp)) sp.el2 = null;
        if (extra === 'form' && !('form2' in sp)) sp.form2 = null;
        if (extra !== 'element' && 'el2' in sp) { if (sp.el2) into.push(sp.el2); delete sp.el2; }
        if (extra !== 'form' && 'form2' in sp) { if (sp.form2) into.push(sp.form2); delete sp.form2; }
      }
    }
    return it;
  };
  const fixList = (list) => { const into = []; const out = (list || []).map((x) => fixBase(x, into)).filter(Boolean); return out.concat(into); };
  const eq = s.equip = s.equip || {}, spill = [];
  for (const k of Object.keys(eq)) eq[k] = fixBase(eq[k], spill);
  s.items = fixList(s.items).concat(spill);
  if (s.run) { s.run.items = fixList(s.run.items); if (s.run.cargo && s.run.cargo.thread === undefined) { /* threads stay where they are */ } }
  // every core carries its bonus field now
  for (const c of s.items) if (c && c.kind === 'stone') { if (!('bonus' in c)) c.bonus = null; if (!c.rarity || c.rarity === 'magic' && !c.bonus) c.rarity = 'common'; }
  s.coresFound = s.coresFound || s.modsFound || 0;
  delete s.modsFound;
  s.v = 8;
  return true;
}

// ---------------------------------------------------------------------------
// Looks: the crystal on the ground, the capture and the tether
// ---------------------------------------------------------------------------
// The crystal on the ground (painted, as the other drops): a lattice point
// standing on a dark scatter, its faces in the rarity's tones.
const _coreDrops = new Map();
function coreDropSprite(col) {
  let s = _coreDrops.get(col);
  if (s) return s;
  const r = [mix(col, '#000000', 0.62), mix(col, '#000000', 0.3), col, mix(col, '#ffffff', 0.5)], W = '#ffffff';
  const S = new PntSpr(9, 13, 0x1a77);
  for (let x = 1; x <= 7; x++) S.px(x, 12, r[0]);
  // a six-sided point: lit left faces, a bright edge, shaded right
  for (let y = 0; y < 12; y++) {
    const half = y < 3 ? y + 1 : y > 9 ? 12 - y : 3;
    for (let i = -half; i <= half; i++) {
      // the faces glow (the captured pattern's own light, so the crystal
      // is seen in the dark); only the shaded edge doesn't
      const c = i < -1 ? r[3] : i < 1 ? (i === -1 ? r[3] : r[2]) : i < 2 ? r[1] : r[0];
      S.px(4 + i, y, c, c !== r[0]);
    }
  }
  S.px(3, 3, W, true); S.px(3, 4, r[3], true);
  s = artFine(S.done());
  _coreDrops.set(col, s);
  return s;
}
// Drawn for a drop that's a core (render.js drawDrop): it settles out of
// its capture, rings the ground in its colour a few times so it's seen
// after the fight, then glints now and then.
// (settled once its capture has collapsed: the capture runs on the world's
// time, which a kill's hit-stop slows)
const coreSettled = (dr) => !dr.cap || dr.cap.t <= dr.cap.max * 0.22;
function drawCoreDrop(dr, fx, fy, col) {
  if (!coreSettled(dr)) return;
  if (dr.settleT === undefined) dr.settleT = dr.t;
  const s = coreDropSprite(col);
  drawShadow(fx, fy + ap(3), 2.5);
  const since = dr.t - dr.settleT;
  if (since < 2.4) {
    // a ring on the ground, out from its foot, every 0.8 s
    const ph = (since % 0.8) / 0.8, r = ap(4 + ph * 10);
    ringDots(fx, fy + ap(3), r, col, (1 - ph) * (1 - since / 2.4) * 0.9, true);
  }
  drawArtSprite(s, fx - 4, fy - 8);
  const ph = (Game.realT + (dr.x % 7) * 0.31) % 1.8;
  if (ph < 0.16) {
    const a = 1 - ph / 0.16, gx = fx - 1, gy = fy - 6;
    dot(gx, gy, '#ffffff', true, a);
    for (const [i, j] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) dot(gx + i, gy + j, '#ffffff', true, a * 0.6);
    for (const [i, j] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) dot(gx + i, gy + j, col, true, a * 0.35);
  }
}

// Where a creature fell, its energy draws in and collapses into the
// core; taken, the capture field's tether pulls a few motes to the
// Kindler.
function coreCaptureFx(d, x, y, col) { const fx = { kind: 'capture', x, y, col, t: 0.7, max: 0.7, s: (x * 7 + y * 13) | 0 }; d.fx.push(fx); return fx; }
function coreTetherFx(d, x, y, col) { d.fx.push({ kind: 'tether', x, y, col, t: 0.32, max: 0.32 }); }
// (render.js drawCombatFx) k runs 1 to 0 over the effect.
function drawCoreFx(fx, cx, cy, k, lights, ox, oy) {
  if (fx.kind === 'capture') {
    // the pattern's energy spirals in (bold motes, each with a short tail,
    // so it reads over a death's burst), then collapses with a white flash
    // and a ring thrown out in the rarity's colour as the core forms
    const t = 1 - k, draw = Math.min(1, t / 0.78), n = 12, oy = cy - ap(5);
    if (draw < 1) {
      const e = draw * draw;
      for (let i = 0; i < n; i++) {
        for (let tail = 0; tail < 3; tail++) {
          const q = Math.max(0, e - tail * 0.05), a = (i / n) * Math.PI * 2 + fx.s * 0.37 + q * 3.2, r = (1 - q) * (20 + (i % 3) * 5) * AP;
          const x = Math.round(cx + Math.cos(a) * r), y = Math.round(oy + Math.sin(a) * r * 0.7), c = tail ? fx.col : i % 3 ? fx.col : '#ffffff', al = (0.5 + 0.5 * draw) * (1 - tail * 0.3);
          // (a dark foot under each, so it reads on a lit floor)
          if (!tail) { dot(x, y + 2, '#000000', false, al * 0.45); dot(x + 1, y + 2, '#000000', false, al * 0.45); }
          dot(x, y, c, true, al);
          if (!tail) { dot(x + 1, y, c, true, al); dot(x, y + 1, c, true, al); dot(x + 1, y + 1, c, true, al); }
        }
      }
    } else {
      const f = (t - 0.78) / 0.22, r = ap(3 + f * 12);
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (Math.abs(i) + Math.abs(j) <= 2) dot(cx + i, oy + j, '#ffffff', true, 1 - f);
      ringDots(cx, oy, r, fx.col, 1 - f, true);
      ringDots(cx, oy, Math.max(1, r - ap(2)), '#ffffff', (1 - f) * 0.5, true);
    }
    lights.push({ x: cx, y: oy, r: TILE * (0.8 + draw * 1.2), i: draw < 1 ? 0.4 + 0.5 * draw : 1.2 * (1 - (t - 0.78) / 0.22), c: rgb01(fx.col) });
    return;
  }
  // the tether: a line of the field's light, motes running along it home
  const p = Game.dive.p, px = Math.round(p.x * AP) + ox, py = Math.round((p.y - 8) * AP) + oy;
  const n = Math.max(4, Math.round(Math.hypot(px - cx, py - cy) / 3));
  for (let i = 0; i <= n; i++) if (i % 2 === 0) dot(Math.round(cx + ((px - cx) * i) / n), Math.round(cy + ((py - cy) * i) / n), fx.col, true, 0.5 * k);
  for (let m = 0; m < 5; m++) {
    const t = Math.min(1, (1 - k) * 1.3 + m * 0.1), x = Math.round(cx + (px - cx) * t), y = Math.round(cy - ap(5) + (py - cy + ap(5)) * t), c = m % 2 ? '#ffffff' : fx.col;
    for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) dot(x + i, y + j, c, true, 1 - t * 0.4);
  }
  lights.push({ x: px, y: py, r: TILE, i: 0.5 * k, c: rgb01(fx.col) });
}
