'use strict';
// ---------------------------------------------------------------------------
// Deeds: the star grows from what the Kindler does, not from ore.
//
// Each deed gives light, in motes the Kindler carries home and feeds to the
// star at its altar (hub.js, the hold-to-feed ritual), a point each:
//   heartlight  kindling a territory (planting its spire). Bound to the
//               Kindler the moment the spire stands: safe from any fall.
//   deeplight   the deep places: first reaching a Deep's last site (its deep
//               vein, or its Keeper's lair), each ancient forge found, each
//               echo. It rides in the cargo, so a fall leaves it in the
//               pack.
//   shards      a Keeper's heart-shard, set at the altar as before (story.js).
// How much each gives is T.deeds; the magnitudes are T.star.levels.
//
// The star is the world's gate: a spire holds only where its light reaches,
// so planting one in ring r needs magnitude T.star.ringMag[r].
//
// A fall leaves the whole cargo where the Kindler fell: their pack, with a faint beacon over it, in that territory or that site of its
// Deep, marked on the world map. Walking to it picks it up, once. Fall again
// before then and the old pack is lost: there's only ever one, the newest.
// It's kept in the save (Save.data.cache).
//
// What's been found, so a deed pays once: Save.data.found ({ deeps: {terr},
// forges: {'terr:site'} }). Echoes pay as each is found (story.js keeps them).
// ---------------------------------------------------------------------------

// The light, in the order the star takes it (heartlight last, the crescendo).
const LIGHT_IDS = ['deeplight', 'heartlight'];
const LIGHT_KINDS = {
  heartlight: { name: 'Heartlight', ramp: ['#8a4a12', '#e09a36', '#ffd987', '#fff8e0'], text: 'Safe from any fall. Feed it to the star.' },
  deeplight: { name: 'Deeplight', ramp: ['#2c1c66', '#5a6ae0', '#86ecff', '#effdff'], text: 'Rides in the cargo. Feed it to the star.' },
};
function isLight(id) { return !!LIGHT_KINDS[id]; }
// (a drop of it on the ground, in its own colour: render.js drawDrop)
for (const id of LIGHT_IDS) ART.exotics[id] = LIGHT_KINDS[id].ramp[2];
// (and night-glass, the seventh band's: a dull violet)
ART.exotics.nightglass = '#8f7bd6';

// The light waiting at the altar (in the stash).
function lightWaiting() { const s = Save.data.stash; return LIGHT_IDS.reduce((n, id) => n + (s[id] || 0), 0); }

// A mote of light, as an icon: a bright core in a soft four-pointed glint.
const LIGHT_ICON_ROWS = [
  '.....a.....',
  '.....b.....',
  '....bcb....',
  '...bcdcb...',
  'abbcdddcbba',
  '...bcdcb...',
  '....bcb....',
  '.....b.....',
  '.....a.....',
];
const _lightIcons = {};
function lightIconUrl(id) {
  if (_lightIcons[id]) return _lightIcons[id];
  const R = LIGHT_KINDS[id].ramp, rows = LIGHT_ICON_ROWS, [c, x] = makeCanvas(rows[0].length + 2, rows.length + 2);
  rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') { x.fillStyle = R['abcd'.indexOf(ch)]; x.fillRect(i + 1, j + 1, 1, 1); } }));
  return (_lightIcons[id] = c.toDataURL());
}

// ---------------------------------------------------------------------------
// What a deed is worth
// ---------------------------------------------------------------------------
function heartLightFor(t) { return T.deeds.heart[Math.min(T.deeds.heart.length - 1, t.ring)] || 0; }
function deepLightFor(t) { return t.deep ? (T.deeds.deepEnd[Math.min(T.deeds.deepEnd.length - 1, t.ring)] || 0) + T.deeds.deepSite * (t.deep - 1) : 0; }
function foundState() { const s = Save.data, f = s.found || (s.found = {}); f.deeps = f.deeps || {}; f.forges = f.forges || {}; return f; }
function deepReached(id) { return !!foundState().deeps[id]; }

// The star's reach: the magnitude a spire needs in this territory's ring.
function spireMagFor(id) { const t = terrOf(id); return t ? T.star.ringMag[Math.min(T.star.ringMag.length - 1, t.ring)] || 1 : 1; }
function starHoldsSpire(id) { return magnitudeOf(Save.data.star) >= spireMagFor(id); }
// The light still wanted for magnitude m (0 once it's there).
function lightToMag(m) { const need = T.star.levels[m - 1]; return need === undefined ? 0 : Math.max(0, need - Save.data.star); }

// Light earned out in the world: heartlight straight to the stash (bound),
// deeplight into the cargo. A burst of motes rises from `at` (world px) into
// the Kindler, and a toast says what it was for.
function grantLight(d, id, n, why, at) {
  if (!n || !d) return;
  const s = Save.data;
  if (id === 'heartlight') { s.stash[id] = (s.stash[id] || 0) + n; Save.saveField('stash'); }
  else d.cargo[id] = (d.cargo[id] || 0) + n;
  const tl = d.tally || (d.tally = {}), L = tl.light || (tl.light = {});
  L[id] = (L[id] || 0) + n;
  UI.toast(`+${n} ${LIGHT_KINDS[id].name.toUpperCase()} · ${why}`, 'legendary');
  const fx = d.lightFx || (d.lightFx = []), from = at || { x: d.p.x, y: d.p.y - 30 };
  for (let i = 0; i < Math.min(28, 6 + n); i++) fx.push({ id, x: from.x + FX_R.f(-10, 10), y: from.y + FX_R.f(-8, 8), t: -i * 0.035, seed: FX_R.f(1000) });
  if (typeof snd === 'function') snd(id === 'heartlight' ? 'waystonesBurn' : 'resStone');
  Story.say(id === 'heartlight' ? 'firstHeartlight' : 'firstDeeplight');
}

// A territory kindled: its heart's light, bound to the Kindler.
function deedKindled(d, t) {
  const h = d.floor.heart;
  grantLight(d, 'heartlight', heartLightFor(t), `${t.name} kindled`, { x: (h.x + 0.5) * TILE, y: (h.y + 0.5) * TILE - 30 });
}
// A Deep's last site, reached for the first time.
function deedDeepEnd(d, t) {
  const f = foundState();
  if (f.deeps[t.id]) return;
  f.deeps[t.id] = true;
  Save.saveField('found');
  grantLight(d, 'deeplight', deepLightFor(t), "the Deep's end, reached");
  // and the star learns the next Shape, from the world's depth (facets.js)
  const shape = nextShapeToLearn();
  if (shape) learnShape(shape, "from the Deep's end");
}
// An echo found.
function deedEcho(d) { grantLight(d, 'deeplight', T.deeds.echo, 'an echo found'); }

// ---------------------------------------------------------------------------
// The pack left by a fall
// ---------------------------------------------------------------------------
function cacheCount(c) {
  if (!c) return 0;
  return Object.values(c.cargo || {}).reduce((a, b) => a + b, 0) + (c.items || []).length + (c.blueprints || []).length;
}
// Where the diver is, as a cache would name it.
function cacheWhere(d) {
  if (d.lat !== null && d.lat !== undefined) return `${latticeNode(d.lat).name}, in the Lattice`;
  const t = terrOf(d.terr);
  return t ? (d.deep ? `the Deep under ${t.name}, site ${d.deep.site}` : t.name) : 'out in the world';
}
// A fall: the cargo stays where it fell, and an older pack is lost.
// Returns { cache, old } (either may be null).
function leaveCache(d) {
  const s = Save.data, old = s.cache || null;
  s.cache = null;
  const cargo = {};
  for (const k in d.cargo) if (d.cargo[k] > 0) cargo[k] = d.cargo[k];
  const c = { terr: d.terr, site: d.deep ? d.deep.site : 0, lat: d.lat !== null && d.lat !== undefined ? d.lat : -1, x: d.p.x, y: d.p.y, cargo, items: d.items.slice(), blueprints: d.blueprints.map((b) => b.id), where: cacheWhere(d) };
  d.cargo = {}; d.items = []; d.blueprints = [];
  if (cacheCount(c)) s.cache = c;
  return { cache: s.cache, old };
}
// The pack, if it lies here (a territory, or this site of its Deep).
function cacheHere(d) {
  const c = Save.data.cache;
  if (!c || !d || !d.sortie || d.terr !== c.terr || (d.deep ? d.deep.site : 0) !== c.site) return null;
  // (a pack in the Lattice lies in its gallery, not in the land over it)
  const lat = d.lat !== null && d.lat !== undefined ? d.lat : -1, cl = c.lat === undefined ? -1 : c.lat;
  if (lat !== cl) return null;
  return c;
}
// Where the pack stands on this floor: where it fell, or the nearest open
// ground to it (the site may be built again differently, or a vein mined).
function cacheSpot(d, c) {
  if (d.cacheAt && d.cacheAt.floor === d.floor && d.cacheAt.c === c) return d.cacheAt;
  const f = d.floor, ok = (x, y) => !bodyHits(f, x, y, T.player.radius + 1) && !hazardNear(f, Math.floor(x / TILE), Math.floor(y / TILE), 0);
  let at = ok(c.x, c.y) ? { x: c.x, y: c.y } : null;
  const tx = Math.floor(c.x / TILE), ty = Math.floor(c.y / TILE);
  for (let r = 1; r < 30 && !at; r++)
    for (let j = -r; j <= r && !at; j++)
      for (let i = -r; i <= r && !at; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        const x = (tx + i + 0.5) * TILE, y = (ty + j + 0.5) * TILE;
        if (tx + i > 0 && ty + j > 0 && tx + i < f.w - 1 && ty + j < f.h - 1 && ok(x, y)) at = { x, y };
      }
  at = at || { x: d.p.x, y: d.p.y };
  return (d.cacheAt = { floor: f, c, x: at.x, y: at.y });
}
// Arriving anywhere (frontier.js: entering a territory or a Deep's site,
// however it's built, the loading's resumed sortie among them): the pack,
// if it lies here, is placed on this floor at once.
function placeCacheHere(d) {
  d.cacheAt = null; d.cacheTried = false;
  const c = cacheHere(d);
  if (c) cacheSpot(d, c);
}
// Picking the pack up: all of it goes back into the cargo.
function recoverCache(d, c) {
  const n = cacheCount(c);
  for (const k of Object.keys(c.cargo)) d.cargo[k] = (d.cargo[k] || 0) + c.cargo[k];
  for (const id of c.blueprints || []) d.blueprints.push({ id });
  d.items.push(...(c.items || []));
  Save.data.cache = null;
  d.cacheAt = null;
  UI.toast(`Your pack, recovered: ${n} thing${n === 1 ? '' : 's'}`, 'legendary');
  if (n) { snd('bank'); buzz(30); Story.say('firstRecover'); }
  // (the recovered cargo rides in the run's save, so closing the page now
  // can't lose it, nor bring the pack back)
  saveRun(d);
  Save.saveField('cache');
  return n;
}

// ---------------------------------------------------------------------------
// Every step of a sortie: the pack, ancient forges found, the light rising.
// ---------------------------------------------------------------------------
function updateDeeds(d, dt) {
  if (d.lightFx && d.lightFx.length) {
    for (const m of d.lightFx) m.t += dt / 0.9;
    d.lightFx = d.lightFx.filter((m) => m.t < 1);
  }
  if (d.dying || d.warp || !d.sortie) return;
  const c = cacheHere(d);
  if (c) {
    const at = cacheSpot(d, c), m = dist(d.p.x, d.p.y, at.x, at.y);
    if (m < T.deeds.cache.reach) { if (!d.cacheTried) { d.cacheTried = true; recoverCache(d, c); } }
    else if (m > T.deeds.cache.reach * 2) d.cacheTried = false;
  }
  // an ancient forge, found: once each, ever
  const ff = d.fieldForge;
  if (ff && dist(d.p.x, d.p.y, (ff.x + 0.5) * TILE, (ff.y + 0.5) * TILE) < TILE * 3) {
    const f = foundState(), key = `${d.terr}:${d.deep ? d.deep.site : 0}`;
    if (!f.forges[key]) { f.forges[key] = true; Save.saveField('found'); grantLight(d, 'deeplight', T.deeds.forge, 'an ancient forge found', { x: (ff.x + 0.5) * TILE, y: (ff.y + 0.5) * TILE - 20 }); }
  }
}

// ---------------------------------------------------------------------------
// Drawn
// ---------------------------------------------------------------------------
// The Kindler's pack: a Charter-blue pack fallen on its side, its strap's
// amber light still on, a little mast with a blinking tip. Feet at its base.
let _packSprite = null;
function packSprite() {
  if (_packSprite) return _packSprite;
  const W = 17, H = 15, P = pixBuf(W, H), solid = new Uint8Array(W * H);
  const B = ['#141c34', '#22305a', '#33487e', '#4a66a8'], put = (x, y, col, glow) => { putPx(P, x, y, col, glow); solid[y * W + x] = 1; };
  // the body, rounded, lit from the top left
  for (let y = 5; y < 14; y++) for (let x = 2; x < 15; x++) {
    if ((y === 5 || y === 13) && (x === 2 || x === 14)) continue;
    put(x, y, y === 5 || x === 2 ? B[3] : y >= 12 || x === 14 ? B[0] : x < 6 ? B[2] : B[1]);
  }
  // the flap, and its seam
  for (let x = 3; x < 14; x++) put(x, 8, B[0]);
  for (let x = 4; x < 13; x++) put(x, 7, B[2]);
  // the strap with its amber light, and the seed-star on the flap
  for (let y = 5; y < 14; y++) put(10, y, y === 9 || y === 10 ? '#ffb030' : '#0e1424', y === 9 || y === 10);
  put(6, 10, '#ffe48a', true); put(5, 10, '#c89a40'); put(7, 10, '#c89a40'); put(6, 9, '#c89a40'); put(6, 11, '#c89a40');
  // the mast
  for (let y = 1; y < 5; y++) put(12, y, '#5a6070');
  put(12, 0, '#ffc860', true);
  // a strap trailing on the ground
  for (const [x, y] of [[1, 13], [0, 14], [15, 13], [16, 14]]) put(x, y, B[0]);
  if (typeof pflRepaintProp === 'function') pflRepaintProp(P, solid, B, 0x9ac7);
  const s = spriteFromBuf(P);
  s.ax = 8; s.ay = H - 1; s.tip = { x: 12, y: 0 };
  return (_packSprite = artFine(s));
}
function drawCachePack(d, a, ox, oy, lights) {
  const at = a.at, fx = Math.round(at.x * AP) + ox, fy = Math.round(at.y * AP) + oy, spr = packSprite(), x = fx - spr.ax, y = fy - spr.ay, B = T.deeds.cache.beacon;
  drawShadow(fx, fy, 6);
  drawArtSprite(spr, x, y);
  // the faint beacon: a thin column of light over it, rising, and the tip's blink
  const t = Game.realT, blink = Math.floor(t * 1.6) % 2 === 0;
  if (blink) dot(x + spr.tip.x, y + spr.tip.y, '#fff2c8', true);
  for (let i = 0; i < 34; i++) {
    const k = ((i / 34) + t * 0.35) % 1, yy = Math.round(y + spr.tip.y - 2 - k * ap(60));
    if ((i * 7 + Math.floor(t * 9)) % 5 === 0) continue;
    dot(x + spr.tip.x, yy, k < 0.4 ? '#fff2c8' : k < 0.7 ? '#ffd27a' : '#ffb347', true, 0.8 * (1 - k));
    if (k < 0.5 && i % 3 === 0) dot(x + spr.tip.x + 1, yy, '#ffb347', true, 0.4 * (1 - k));
  }
  // and a slow ring of light going out over the ground round it
  const ph = (t * 0.5) % 1;
  ringDots(fx, fy - 1, (6 + ph * 14) * AP, '#ffc860', 0.5 * (1 - ph), true);
  lights.push({ x: x + spr.tip.x, y: y + 2, r: TILE * B[0], i: B[1] * (0.85 + 0.15 * Math.sin(t * 3)), c: rgb01('#ffc070') });
  paintOcclude(x, y - 4, spr.w, spr.h + 4, fy, ox, oy);
}
// The light rising out of a deed into the Kindler, over everything.
function drawLightFx(d, a, ox, oy, lights) {
  const p = d.p;
  for (const m of d.lightFx || []) {
    if (m.t < 0) continue;
    const R = LIGHT_KINDS[m.id].ramp, u = m.t * m.t, tx = p.x, ty = p.y - 14;
    const wx = lerp(m.x, tx, u) + Math.sin(m.seed + m.t * 8) * 6 * (1 - m.t), wy = lerp(m.y, ty, u) - Math.sin(m.t * Math.PI) * 18;
    const x = Math.round(wx * AP) + ox, y = Math.round(wy * AP) + oy;
    dot(x, y, R[3], true); dot(x - 1, y, R[2], true, 0.8); dot(x + 1, y, R[2], true, 0.8); dot(x, y + 1, R[1], true, 0.6);
  }
  if ((d.lightFx || []).length) lights.push({ x: Math.round(p.x * AP) + ox, y: Math.round((p.y - 14) * AP) + oy, r: TILE * 2, i: 0.6, c: rgb01(LIGHT_KINDS[d.lightFx[0].id].ramp[2]) });
}
// What deeds stand among the actors.
function deedProps(d) {
  const out = [], c = !d.hub && cacheHere(d);
  if (c) { const at = cacheSpot(d, c); out.push({ hubDraw: drawCachePack, at, hidden: true, y: at.y }); }
  if (d.lightFx && d.lightFx.length) out.push({ hubDraw: drawLightFx, hidden: true, y: 1e9 });
  return out;
}
// Over the lit scene: where the pack lies, named, or a pip at the edge of
// the view towards it.
function drawDeedsHud(d, ox, oy) {
  const c = !d.hub && !d.dying && cacheHere(d);
  if (!c) return;
  const at = cacheSpot(d, c), px = Math.round(d.p.x * AP) + ox, py = Math.round(d.p.y * AP) + oy - ap(8);
  if (!edgePip(px, py, at.x, at.y, ox, oy, '#ffc860', 4)) {
    const lab = exitLabel('YOUR PACK', '#ffc860'), x = Math.round(at.x * AP) + ox, y = Math.round(at.y * AP) + oy;
    View.ctx.globalAlpha = 0.9;
    View.ctx.drawImage(lab, clamp(x - (lab.width >> 1), 1, View.w - lab.width - 1), y - ap(34));
    View.ctx.globalAlpha = 1;
  }
}
// On the world map: the pack's territory, a small amber pack blinking by
// its middle (worldmap.js drawWorldMap).
function drawMapCache(px, at, on) {
  const c = Save.data.cache;
  if (!c) return;
  const t = worldMap().terrs[c.terr];
  if (!t) return;
  const [cx, cy] = at(t), col = on ? '#ffc860' : '#c87a20';
  for (const [i, j] of [[-4, 2], [-3, 2], [-2, 2], [-4, 3], [-3, 3], [-2, 3], [-3, 1]]) px(cx + i, cy + j, j === 1 ? '#fff2c8' : col);
}

// ---------------------------------------------------------------------------
// What's next: one goal at a time, the plainest first (a shard to set, the
// light waiting, the pack, land to kindle, the star to grow, a Deep, a
// Keeper). Said at the portal and over the view at home.
// ---------------------------------------------------------------------------
function nextGoal() {
  const s = Save.data, mag = magnitudeOf(s.star), wait = lightWaiting();
  if (Story.shardsHeld() > Story.shardsSet()) return 'Set the shard at the altar.';
  if (wait && lightToMag(mag + 1) && wait >= lightToMag(mag + 1)) return `Feed the star: ${wait} light waiting.`;
  if (s.cache) return `Get your pack back, in ${s.cache.where}.`;
  if (wait) return `Feed the star: ${wait} light waiting.`;
  // ore brought home and not yet given: the star has to taste it (spectrum.js)
  const held = T.ores.filter((o) => (s.stash[o.id] || 0) >= T.spectrum.depths[1] && bandToNext(o.id) > 0);
  if (held.length) { const o = held.find((x) => bandDepth(x.id) < 1) || held[0]; return `Give the star the ${o.name} you carried home: each ore it tastes is a band of its light${bandDepth(o.id) < 1 && bandOpensWord(o.id) ? `, and ${bandOpensWord(o.id)} is dark to it` : ''}.`; }
  if (!s.world) return 'Walk out into the land and kindle it.';
  const L = worldMap(), lit = (id) => isKindled(id);
  const front = L.terrs.filter((t) => !t.home && !lit(t.id) && t.nb.some(lit)).sort((a, b) => terrLevel(a) - terrLevel(b));
  // (open: the star reaches it and has tasted its land's band; band: it
  // hasn't tasted the band; shut: out of its reach. spectrum.js)
  const open = front.find((t) => !spireBlock(t.id)), band = front.filter((t) => { const b = spireBlock(t.id); return b && b.why === 'band'; }), shut = front.filter((t) => { const b = spireBlock(t.id); return b && b.why === 'reach'; });
  const deep = L.terrs.filter((t) => t.deep && !deepReached(t.id) && (terrPeek(t.id) || {}).visits).sort((a, b) => terrLevel(a) - terrLevel(b))[0];
  const keep = L.terrs.find((t) => t.gate && regionReached(t.biome) && !(s.shards || []).includes(t.biome));
  if (open) return `Kindle ${open.name}: +${heartLightFor(open)} heartlight.`;
  if (deep) return `Reach the Deep's end under ${deep.name}: +${deepLightFor(deep)} deeplight.`;
  // a cold spire seen in the Lattice and not yet relit (lattice.js)
  const cold = typeof latticeMap === 'function' && latticeKnown() ? latticeMap().nodes.find((n) => n.spire && !latLit(n.id) && (latPeek(n.id) || {}).visits) : null;
  if (cold) return `Relight the cold spire in ${cold.name}: +${T.deeds.coldSpire} deeplight.`;
  if (keep) return `Take the Keeper's shard, under ${keep.name}.`;
  if (band.length) { const ore = bandGateOre(band[0]), have = s.stash[ore] || 0, need = T.spectrum.depths[1] - bandGiven(ore); return have >= need ? `Give the star ${stuffName(ore)} at the altar: ${bandOpensWord(ore)} is dark to it.` : `Bring the star ${need} ${stuffName(ore)}: ${bandOpensWord(ore)} is dark to it. Mine it in ${band[0].name}.`; }
  if (shut.length) { const r = Math.min(...shut.map((t) => t.ring)), m = T.star.ringMag[r]; return `Ring ${r} needs magnitude ${m}: ${lightToMag(m)} more light.`; }
  return 'Kindle the land, all the way to the Edge.';
}
function nextGoalHtml() {
  return `<h3>NEXT</h3><div class="next-steps"><p>${esc(nextGoal())}</p></div>`;
}

// A sortie's tally, as it goes: kills by kind, tears sealed (frontier.js
// keeps the rest: kindled, Deeps).
function tallyKill(d, e) {
  const t = d.tally || (d.tally = {}), k = t.kills || (t.kills = {});
  k[e.type] = (k[e.type] || 0) + 1;
}
function tallySeal(d) { const t = d.tally || (d.tally = {}); t.sealed = (t.sealed || 0) + 1; }

// ---------------------------------------------------------------------------
// An older save's star: its points were ore's (T.star.levels were then
// [0, 60, 250, 900, 3000, 6000, 10000, 15000]). Rescaled so it keeps its
// magnitude, and as far through it.
// ---------------------------------------------------------------------------
const STAR_LEVELS_ORE = [0, 60, 250, 900, 3000, 6000, 10000, 15000];
function rescaleStar(s) {
  if (s.starScale === T.star.scale) return;
  const O = STAR_LEVELS_ORE, N = T.star.levels, p = Math.max(0, s.star || 0);
  let m = 0;
  for (const v of O) if (p >= v) m++;
  const lo = O[m - 1], hi = O[m];
  s.star = hi === undefined ? N[m - 1] : N[m - 1] + Math.floor(((p - lo) / (hi - lo)) * (N[m] - N[m - 1]));
  s.starScale = T.star.scale;
  // (ore kept from the star belonged to feeding it ore)
  delete s.keepOre;
}
