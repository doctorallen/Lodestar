'use strict';
// ---------------------------------------------------------------------------
// Bringing a new Kindler in a little at a time.
//
// Unlocks. A new game starts with the essentials: walking, mining, the two
// spells, the portal and the openings, the forge (FRAMES and CUTTERS) and the
// locker (what's worn). Each other system wakes when its moment comes, and
// stays awake (Save.data.onboard.open). Every unlock is worked out from
// progress (ONBOARD_WHEN), so an old save, or one that skipped ahead, never
// finds anything locked: a save from before this file opens with
// everything awake. A station not yet awake stands dark at the outpost,
// with no button. When one wakes, Wick says so once.
//   spells     changing the rig's cores (the locker's drawer, CORES, CODEX):
//              the first core beyond the first ones, researched or forged
//   modules    sockets on the cards, the locker's modules, the tuning
//              bench: the first module caught
//   altar      the star's altar and ATTUNE: the first light of a deed
//   supplies   SUPPLIES, MEND and LIGHT, MAKE: the first ore brought home
//              (after the first walkthrough's cutter, if it's running)
//   gear       ARMOR and CHARMS: the first thing forged
//   tools      TOOLS and the tools at the portal: magnitude 2
//   buildings  BUILDINGS: magnitude 2
//   wick       WICK (the tab and the locker's): the Drone Bay built
//   uplink     the Meridian uplink: magnitude 2, an echo or a shard
//
// The first landing. After the opening, Wick offers to walk the Kindler
// through it (WALK ME THROUGH IT / I KNOW THE DRILL). Walked through, a
// line of Wick's sits over the view with a marker on the world: out of an
// opening, a vein mined, a fight (spell A, spell B, the dash), a pick's
// Ferrite and a part, home, and a Ferrite pick at the forge (whose own
// tutorial takes over: tutor.js); then NEXT. The guided land is eased: its
// Ferrite gives two a vein, and the foe Wick calls up always leaves a part.
// ---------------------------------------------------------------------------

const ONBOARD_KEYS = ['spells', 'modules', 'altar', 'supplies', 'gear', 'tools', 'buildings', 'wick', 'uplink'];
const ONBOARD_WHEN = {
  spells: (s) => s.items.some((x) => x.kind === 'stone') || s.blueprints.some((id) => BLUEPRINTS[id] && BLUEPRINTS[id].kind === 'stone' && !BLUEPRINTS[id].start) || magnitudeOf(s.star) >= 2,
  modules: (s) => (s.modsFound || 0) > 0 || s.items.some((x) => x.kind === 'module') || SLOTS.some((k) => s.equip[k] && (s.equip[k].sockets || []).some(Boolean)),
  altar: (s) => s.star > 0 || lightWaiting() > 0 || (s.shards || []).length > 0,
  supplies: (s) => (T.ores.some((o) => s.stash[o.id] > 0) && !Guide.on()) || Object.values(s.supplies || {}).some((n) => n > 0) || (s.built || []).length > 0 || magnitudeOf(s.star) >= 2,
  gear: (s) => (s.crafts || 0) > 0 || !!s.equip.armor || !!s.equip.charm || s.items.some((x) => x.kind === 'armor' || x.kind === 'charm') || magnitudeOf(s.star) >= 2,
  tools: (s) => magnitudeOf(s.star) >= 2 || (s.tools || []).length > 1,
  buildings: (s) => magnitudeOf(s.star) >= 2 || (s.built || []).length > 0,
  wick: (s) => (s.built || []).includes('bay') || Object.keys(s.wickUps || {}).length > 0,
  uplink: (s) => magnitudeOf(s.star) >= 2 || (s.echoes || []).length > 0 || (s.shards || []).length > 0,
};
// Which station each unlock wakes (the rest are always awake).
const ONBOARD_STATION = { runes: 'modules', altar: 'altar', wreck: 'uplink' };

function onboardState() {
  const s = Save.data;
  if (!s.onboard || typeof s.onboard !== 'object') s.onboard = { mode: null, guide: null, open: {}, seen: {} };
  const o = s.onboard;
  o.open = o.open || {}; o.seen = o.seen || {};
  return o;
}
// Whether a system is awake. (Before a save is loaded, everything is.)
function onboardHas(key) {
  if (!Save.data) return true;
  const o = onboardState();
  if (o.open[key]) return true;
  if (ONBOARD_WHEN[key] && ONBOARD_WHEN[key](Save.data)) { o.open[key] = true; if (Onboard.live) Onboard.woke(key); return true; }
  return false;
}
// A station at the outpost, awake (the forge, locker and portal always are).
function stationAwake(id) { return !ONBOARD_STATION[id] || onboardHas(ONBOARD_STATION[id]); }

const Onboard = {
  live: false, checkT: 0,
  // On loading: a save from before this file (it has no onboard) has
  // everything awake and every tutorial seen; any save has whatever its
  // progress has earned, quietly.
  load(s, raw) {
    if (raw && !raw.onboard) {
      s.onboard = { mode: 'old', guide: null, open: {}, seen: {} };
      for (const k of ONBOARD_KEYS) s.onboard.open[k] = true;
      for (const k of Object.keys(TUTORS)) s.onboard.seen[k] = true;
    }
    onboardState();
    Onboard.live = false;
    for (const k of ONBOARD_KEYS) onboardHas(k);
    Onboard.live = true;
  },
  // For the tests: everything awake, no tutorial waiting, no offer.
  testAll() {
    const o = onboardState();
    o.mode = o.mode || 'free'; o.guide = null;
    for (const k of ONBOARD_KEYS) o.open[k] = true;
    for (const k of Object.keys(TUTORS)) o.seen[k] = true;
    Save.save();
  },
  // A system woke during play: Wick says so, once.
  woke(key) {
    Save.saveField('onboard');
    Story.say('wake_' + key);
  },
  // Twice a second: anything that's woken.
  tick(dt) {
    if (!Save.data || (Onboard.checkT -= dt) > 0) return;
    Onboard.checkT = 0.5;
    for (const k of ONBOARD_KEYS) onboardHas(k);
  },

  // After the opening, the first time: Wick offers to walk you through.
  offer() {
    const o = onboardState();
    if (o.mode) return false;
    UI.show('screen-onboard');
    const img = $('onboard-wick');
    if (img && !img.src) img.src = wickPortraitUrl();
    return true;
  },
  // The offer closed without a choice (a test, or a stray close): free.
  closed(screen) {
    if (screen === 'screen-onboard' && !onboardState().mode) onboardState().mode = 'free';
  },
};

// Wick's face, for the lines that point: his shell and band, the cyan eye lit.
let _wickPortrait = null;
function wickPortraitUrl() {
  if (_wickPortrait) return _wickPortrait;
  const [c, x] = makeCanvas(19, 19), S = wickSprite();
  x.drawImage(S.c, 2, 1); x.globalCompositeOperation = 'lighter'; x.drawImage(S.ec, 2, 1); x.globalCompositeOperation = 'source-over';
  x.fillStyle = '#7ff4ff'; x.fillRect(2 + S.cx + 1, 1 + S.cy, 2, 1);
  return (_wickPortrait = c.toDataURL());
}

// ---------------------------------------------------------------------------
// The guided first landing
// ---------------------------------------------------------------------------
// Each step: where it shows (home or out), Wick's line (a function, for a
// count), the button that pulses, where the marker stands, and when it's
// done. Steps run in order; a step whose place isn't here waits.
const GUIDE_STEPS = [
  { id: 'out', home: true, say: () => 'Walk out an opening. The lit one is gentle.', mark: () => guideExitMark(Game.dive, guideStarter()), done: (d) => !!d.sortie },
  { id: 'ore', say: () => 'Ore glows. Stand by a vein and hold MINE.', btn: 'btn-mine', mark: (d) => guideOreMark(d), done: (d) => guideOre(d) > 0 },
  { id: 'arc', say: () => 'Company. Tap ARC: that\'s spell A.', btn: 'btn-main', mark: (d) => guideFoeMark(d), start: (d) => guideFoe(d), done: (d) => guideCasts(d, 'main') > 0 },
  { id: 'bolt', say: () => 'Now BOLT, from the other wrist.', btn: 'btn-off', mark: (d) => guideFoeMark(d), start: (d) => guideFoe(d), done: (d) => guideCasts(d, 'off') > 0 },
  { id: 'dash', say: () => 'DASH to slip clear of it.', btn: 'btn-dash', mark: (d) => guideFoeMark(d), start: (d) => guideFoe(d), done: (d) => d.p.dashT > 0 },
  { id: 'finish', say: () => 'Finish it. It\'ll leave a part.', btn: 'btn-main', mark: (d) => guideFoeMark(d), done: (d) => !guideFoes(d).length && guideParts(d) > 0, start: (d) => guideFoe(d, true) },
  { id: 'haul', say: (d) => (guideParts(d) ? `${BLUEPRINTS.pick.ore} Ferrite makes a better cutter. ${Math.min(BLUEPRINTS.pick.ore, guideFerrite(d))}/${BLUEPRINTS.pick.ore}` : 'A creature part too. Fight one.'), btn: 'btn-mine', mark: (d) => (guideParts(d) ? guideOreMark(d, 'ferrite') : guideFoeMark(d)), start: (d) => guideFoe(d, true), done: (d) => guideFerrite(d) >= BLUEPRINTS.pick.ore && guideParts(d) > 0 },
  { id: 'home', say: () => 'That will do. Back the way we came, or II, then RECALL.', mark: (d) => guideExitMark(d, 0), done: (d) => !!d.hub },
  { id: 'forge', home: true, say: () => (guidePickStashed() ? 'Wear it: EQUIP it at the locker.' : 'To the forge. A Ferrite cutter breaks Lumenite.'), mark: () => guideStationMark(guidePickStashed() ? 'locker' : 'forge'), done: () => guidePickMade() },
  { id: 'free', home: true, say: () => "That's the loop. NEXT, up there, says where to go.", done: (d, g) => g.t > 7 },
];

const Guide = {
  on() { const o = Save.data && Save.data.onboard; return !!(o && o.guide); },
  step() { const o = onboardState(); return GUIDE_STEPS.find((s) => s.id === o.guide) || null; },
  t: 0, startedFor: null,
  begin() { const o = onboardState(); o.mode = 'guided'; o.guide = GUIDE_STEPS[0].id; Guide.t = 0; Save.save(); },
  stop() { const o = onboardState(); o.guide = null; Save.saveField('onboard'); $('guide').hidden = true; document.body.classList.remove('guiding'); for (const b of document.querySelectorAll('.guide-pulse')) b.classList.remove('guide-pulse'); },
  // The step to show here: the guide's own, or, while it waits for the
  // other place, the way there (out of the outpost, or home).
  shown(d) {
    const st = Guide.step();
    if (!st || !d) return null;
    if (!!st.home === !!d.hub) return st;
    return GUIDE_STEPS.find((s) => s.id === (d.hub ? 'out' : 'home'));
  },
  // Every step of the game.
  update(dt) {
    const el = $('guide'), d = Game.dive;
    const st = Guide.on() && d && !Intro.on && !Intro.hub && !d.dying ? Guide.step() : null;
    const show = st && !Game.modal ? Guide.shown(d) : null;
    for (const b of document.querySelectorAll('.guide-pulse')) if (!show || b.id !== show.btn) b.classList.remove('guide-pulse');
    if (!show) {
      if (!el.hidden) el.hidden = true;
      document.body.classList.remove('guiding');
      return;
    }
    Guide.t += dt;
    if (show === st) {
      const key = st.id + ':' + d.terr + ':' + !!d.hub;
      if (Guide.startedFor !== key) { Guide.startedFor = key; Guide.t = 0; d.casts = {}; if (st.start) st.start(d); }
      // (a foe called up again, once a second, if the last one fell)
      else if (st.start && Math.floor(Guide.t) !== Math.floor(Guide.t - dt)) st.start(d);
    }
    // (a step can be done from either place: out of the outpost, say)
    if (st.done(d, Guide)) {
      const next = GUIDE_STEPS[GUIDE_STEPS.indexOf(st) + 1];
      Guide.t = 0; Guide.startedFor = null;
      if (!next) { Guide.stop(); Save.save(); return; }
      onboardState().guide = next.id;
      snd('tap');
      Save.saveField('onboard');
      return;
    }
    const line = show.say(d), img = el.querySelector('img');
    if (!img.getAttribute('src')) img.src = wickPortraitUrl();
    const span = el.querySelector('.guide-line');
    if (span.textContent !== line) span.textContent = line;
    if (el.hidden) el.hidden = false;
    document.body.classList.add('guiding');
    if (show.btn && $(show.btn) && !$(show.btn).hidden) $(show.btn).classList.add('guide-pulse');
  },
  // Where the marker stands now, in world px, or null.
  mark(d) {
    const st = Guide.on() && !Game.modal && !d.dying ? Guide.shown(d) : null;
    return st && st.mark ? st.mark(d) : null;
  },
};

// The starter: the land the outpost's own spire lights.
function guideStarter() { const t = worldMap().terrs.find((x) => x.starter); return t ? t.id : null; }
// An opening on this floor towards `to` (the outpost: 0), as a mark.
function guideExitMark(d, to) {
  const f = d.floor, e = (f.exits || []).find((x) => x.to === to) || (d.hub ? (f.exits || [])[0] : null);
  return e ? { x: (e.x + 0.5) * TILE, y: (e.y + 0.5) * TILE } : null;
}
function guideStationMark(id) { const s = HUB_STATIONS.find((x) => x.id === id); return { x: (s.x + 0.5) * TILE, y: (s.y + 0.5) * TILE }; }
// The nearest vein the pick breaks (of one ore, if asked) with open ground
// beside it.
function guideOreMark(d, ore) {
  const f = d.floor, p = d.p, pick = Save.data.equip.pick, power = pick ? pick.base.power : 1;
  if (d.guideOre && d.guideOre.floor === f && f.tiles[d.guideOre.i] === TILE_ORE && Game.realT - d.guideOre.at < 1) return d.guideOre.m;
  let best = null, bd = Infinity;
  for (let ty = 1; ty < f.h - 1; ty++) for (let tx = 1; tx < f.w - 1; tx++) {
    const i = ty * f.w + tx;
    if (f.tiles[i] !== TILE_ORE) continue;
    const o = T.ores[f.ore[i] - 1];
    if (o.tier > power || (ore && o.id !== ore)) continue;
    if (![[0, 1], [0, -1], [1, 0], [-1, 0]].some(([a, b]) => !TILE_SOLID[floorTile(f, tx + a, ty + b)])) continue;
    const dd = dist2((tx + 0.5) * TILE, (ty + 0.5) * TILE, p.x, p.y);
    if (dd < bd) { bd = dd; best = i; }
  }
  const m = best === null ? null : { x: (best % f.w + 0.5) * TILE, y: (Math.floor(best / f.w) + 0.5) * TILE };
  d.guideOre = { floor: f, i: best, at: Game.realT, m };
  return m;
}
function guideOre(d) { return T.ores.reduce((n, o) => n + (d.cargo[o.id] || 0), 0); }
function guideFerrite(d) { return d.cargo.ferrite || 0; }
function guideParts(d) { return partsHave(d.cargo, 'any') + partsHave(Save.data.stash, 'any'); }
function guideCasts(d, slot) { return (d.casts && d.casts[slot]) || 0; }
function guideFoes(d) { return d.enemies.filter((e) => e.guide && !e.dead); }
function guideFoeMark(d) { const e = guideFoes(d)[0]; return e ? { x: e.x, y: e.y - 6 } : null; }
// A foe for the fight's steps, on open ground a few tiles ahead (if none
// stands); `last`: only while no part has come yet.
function guideFoe(d, last) {
  if (guideFoes(d).length || (d.guideFoes || 0) >= 6 || (last && guideParts(d) > 0)) return;
  const f = d.floor, p = d.p;
  for (let r = 5; r >= 2; r--) for (let a = 0; a < 16; a++) {
    const an = Math.atan2(p.fy, p.fx) + (a % 2 ? 1 : -1) * Math.ceil(a / 2) * 0.4, x = p.x + Math.cos(an) * r * TILE, y = p.y + Math.sin(an) * r * TILE;
    if (bodyHits(f, x, y, 7) || rockBetween(f, p.x, p.y, x, y)) continue;
    const e = makeEnemy('crawler', x, y, 1, null);
    e.aggro = true; e.guide = true;
    d.enemies.push(e);
    d.guideFoes = (d.guideFoes || 0) + 1;
    return;
  }
}
// (straight line, tile by tile)
function rockBetween(f, x0, y0, x1, y1) {
  const n = Math.ceil(dist(x0, y0, x1, y1) / (TILE / 2));
  for (let i = 1; i < n; i++) if (TILE_SOLID[floorTile(f, Math.floor(lerp(x0, x1, i / n) / TILE), Math.floor(lerp(y0, y1, i / n) / TILE))]) return true;
  return false;
}
function guidePickMade() { const p = Save.data.equip.pick; return !!(p && p.tier >= 1); }
function guidePickStashed() { return Save.data.items.some((x) => x.kind === 'pick' && x.tier >= 1); }
// Mining in the guided land: Ferrite gives two a vein.
function onboardOreBonus(d, o) { const st = Guide.on() && Guide.step(); return st && !d.hub && (st.id === 'ore' || st.id === 'haul' || st.id === 'arc' || st.id === 'bolt' || st.id === 'dash' || st.id === 'finish') && o.id === 'ferrite' ? 1 : 0; }

// Over the lit scene: the marker, a ring and a chevron where to go, or an
// arrow at the view's edge towards it. At home with no guide, the NEXT
// goal's station is marked the same way, faintly.
function drawGuideMarks(d, ox, oy) {
  let m = Guide.mark(d), col = '#ffd27a';
  if (!m && d.hub && !Guide.on() && !Intro.hub) { m = nextGoalMark(); col = '#c9a2ff'; }
  if (!m || d.dying) return;
  const px = Math.round(d.p.x * AP) + ox, py = Math.round(d.p.y * AP) + oy - ap(8);
  if (edgePip(px, py, m.x, m.y, ox, oy, col, 7)) return;
  const x = Math.round(m.x * AP) + ox, y = Math.round(m.y * AP) + oy, t = Game.realT, ph = (t * 0.8) % 1;
  ringDots(x, y, (8 + ph * 10) * AP, col, 0.9 * (1 - ph), true);
  const bob = Math.round(Math.sin(t * 4) * 2), c = View.ctx;
  c.fillStyle = col;
  for (let j = 0; j < 4; j++) c.fillRect(x - 3 + j, y - ap(26) + bob + j, 7 - j * 2, 1);
}
// The station that the NEXT goal names, if it's one at home.
function nextGoalMark() {
  const s = Save.data;
  if (Story.shardsHeld() > Story.shardsSet() || (lightWaiting() && stationAwake('altar'))) return guideStationMark('altar');
  return null;
}

Object.assign(UI.acts, {
  guideYes: () => { UI.close(); Guide.begin(); },
  guideNo: () => { onboardState().mode = 'free'; Save.save(); UI.close(); UI.tip('hub', 'Walk out any opening, or take the portal'); },
});
