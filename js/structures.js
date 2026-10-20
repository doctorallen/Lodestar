'use strict';
// ---------------------------------------------------------------------------
// The outpost's buildings. The Charter planned more of the base than came
// down with the seed: a plot for each building is in the outpost's plan
// from the first day (floor.js outpostPlots: the same spots every visit, a
// deck slab with its corner lights, hubground.js), and each is built once
// at the forge's BUILDINGS tab (its recipe in blueprints.js, its cost and
// its numbers in T.structures). The Meridian drops the module on its plot,
// and it comes down on its thrusters the first time the plot is in view.
// Each does one clear thing:
//   bay       the Drone Bay: Wick can be fitted with upgrades (wick.js)
//   refinery  old ore refined up a grade, at the fabricator (supplies.js)
//   relay     the Forward Relay: a quicker, gentler recall, quicker
//             banking and travel at a spire (game.js)
//   quarters  the Settlers' Quarters: a contract more on the board, each
//             settled pays threads besides (contracts.js), and settlers
//             (story.js)
// They're painted in hubart.js (structureSprite), stand among the walkers
// (hub.js hubProps), cast shadows from the star (pshadow.js) and grow
// starstone with the star, as the stations do.
// ---------------------------------------------------------------------------

const STRUCTURES = {
  bay: {
    short: 'Drone Bay', label: 'DRONE BAY', line: 'bld_bay',
    text: () => "Wick's own hangar. Once it stands, Wick can be fitted with upgrades at the forge's WICK tab: a scanner, a lamp, a shield and a spark.",
  },
  refinery: {
    short: 'Refinery', label: 'REFINERY', line: 'bld_refinery',
    text: () => `Refines old ore up a grade at the fabricator (SUPPLIES): ${T.structures.refinery.n} of an ore and ${T.structures.refinery.threads} threads make 1 of the next ore up. For when a recipe is short of its ore.`,
  },
  relay: {
    short: 'Relay', label: 'RELAY', line: 'bld_relay',
    text: () => `Carries the outpost's reach out to the spires: an emergency recall takes half the time and loses half as much, and banking or travelling at a spire is quicker.`,
  },
  quarters: {
    short: 'Quarters', label: 'QUARTERS', line: 'bld_quarters',
    text: () => `Room for more of the colony, and work for you: a ${['', 'fourth', 'fifth'][T.structures.quarters.contracts] || 'further'} contract on the board, posted by the settlers, and every contract settled pays ${T.structures.quarters.pay} threads besides. ${T.structures.quarters.settlers} more settlers come to live here.`,
  },
};

// Built (or coming down to its plot).
function structureBuilt(id, s = Save.data) { return !!(s && Array.isArray(s.built) && s.built.includes(id)); }
// Standing on its plot: built, and not still coming down.
function structureStands(id) { return structureBuilt(id) && Save.data.landing !== id; }
function structureOpen(id) { return magnitudeOf(Save.data.star) >= T.structures[id].mag; }
// The buildings standing, in order (what the outpost's shadows are baked for).
function structuresStanding() { return STRUCTURE_IDS.filter(structureStands); }

// Builds one from the stash: once, when the star has grown enough. It comes
// down to its plot the next time the plot is in view.
function buildStructure(id) {
  const s = Save.data, rid = 'bld_' + id;
  if (structureBuilt(id) || !structureOpen(id) || !s.blueprints.includes(rid) || !recipePay(recipeCost(rid), s.stash)) return false;
  s.built = (s.built || []).concat(id);
  // (one at a time comes down; another built meanwhile simply stands)
  if (!s.landing) s.landing = id;
  Save.save();
  return true;
}

// Where a building's plot is, as a word from the star ("north of the star").
function structurePlotWhere(id) {
  const d = Game.dive, f = d && d.hub ? d.floor : null, p = f && f.site && f.site.plots ? f.site.plots[STRUCTURE_IDS.indexOf(id)] : null;
  if (!p) return 'by the star';
  const a = Math.atan2(p.y - OUTPOST_CRADLE.y, p.x - OUTPOST_CRADLE.x), k = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
  return ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'][k] + ' of the star';
}

// ---------------------------------------------------------------------------
// At home: on their plots, and coming down to them
// ---------------------------------------------------------------------------
// Where a plot's feet are on the view (art px).
function plotAt(p, ox, oy) { return { x: Math.round(p.x * ATILE) + ox, y: Math.round(p.y * ATILE) + oy + ap(3) }; }

// What stands at home (hub.js hubProps): each building on its plot, and
// the one coming down.
function structureProps(d) {
  const S = d.floor.site, out = [];
  if (!S || !S.plots) return out;
  STRUCTURE_IDS.forEach((id, k) => {
    const p = S.plots[k];
    if (!p || !structureBuilt(id)) return;
    const landing = Save.data.landing === id;
    out.push({ structure: id, plot: p, landing, hubDraw: drawStructure, hidden: true, y: p.y * TILE + 3 });
  });
  return out;
}

// What can't be walked through (hub.js outpostSolids): each building
// standing, its base as an ellipse on the ground ending just behind its
// feet ([half its width, half its depth], world px).
const STRUCTURE_BASE = { bay: [19, 6], refinery: [20, 7], relay: [14, 5], quarters: [21, 6] };
function structureSolids(S) {
  const out = [];
  STRUCTURE_IDS.forEach((id, k) => {
    const p = S.plots && S.plots[k], b = STRUCTURE_BASE[id];
    if (p && structureStands(id)) out.push({ id, x: p.x * TILE, y: p.y * TILE - b[1], rx: b[0], ry: b[1] });
  });
  return out;
}

// Each step at home: the one coming down starts once its plot is in view,
// and lands.
function updateStructures(d, dt) {
  const s = Save.data, L = T.structures.land;
  if (!s.landing) { d.landing = null; return; }
  const k = STRUCTURE_IDS.indexOf(s.landing), p = d.floor.site && d.floor.site.plots ? d.floor.site.plots[k] : null;
  if (!p || !structureBuilt(s.landing)) { s.landing = null; return; }
  if (!d.landing) {
    // (in view, with nothing in front of it: a screen, the opening)
    const x = p.x * ATILE - View.camX, y = p.y * ATILE - View.camY;
    if (Game.modal || Intro.hub || x < 20 || x > View.w - 20 || y < 60 || y > View.h - 10) return;
    d.landing = { id: s.landing, t: 0 };
    snd('lander', {});
  }
  if ((d.landing.t += dt) < L.time) return;
  // down: dust out round it, and it stands
  const id = d.landing.id;
  d.landing = null; s.landing = null;
  Save.save();
  // it stands now: solid, and anyone on its plot steps off it to the front
  d.floor.solids = outpostSolids(d.floor);
  const o = d.floor.solids.find((x) => x.id === id), P = d.p;
  if (o && ((P.x - o.x) / (o.rx + T.player.radius)) ** 2 + ((P.y - o.y) / (o.ry + T.player.radius)) ** 2 < 1) P.y = o.y + o.ry + T.player.radius + 2;
  spawnSparks((p.x + 0.5) * TILE - 8, p.y * TILE, ['#c8b89a', '#8a7a64', '#5a4e40'], 14);
  spawnSparks((p.x + 0.5) * TILE + 8, p.y * TILE, ['#c8b89a', '#8a7a64', '#5a4e40'], 14);
  snd('introTouchdown', {});
  buzz(20);
  Story.say(STRUCTURES[id].line);
}

// A building on its plot: its lights and moving parts, starstone growing
// up it, the rock in front drawn back over it. One coming down: high over
// its plot, slowing as it nears the ground on its thrusters, its shadow
// on the ground growing under it.
function drawStructure(d, a, ox, oy, lights) {
  const id = a.structure, spr = structureSprite(id), at = plotAt(a.plot, ox, oy), t = Game.realT;
  let lift = 0;
  if (a.landing) {
    const L = T.structures.land, k = d.landing && d.landing.id === id ? clamp(d.landing.t / L.time, 0, 1) : 0;
    if (!d.landing || d.landing.id !== id) return;
    lift = Math.round(L.high * (1 - k) * (1 - k));
    drawShadow(at.x, at.y - 2, Math.round(spr.w * 0.25 + spr.w * 0.2 * k), 0);
    // the thrusters: two jets under it, white at the nozzle
    for (const sx of [-spr.w * 0.3, spr.w * 0.3]) {
      const jx = Math.round(at.x + sx), jy = at.y - lift, n = 6 + Math.round(10 * (1 - k));
      for (let i = 0; i < n; i++) {
        const w = Math.max(0, 2 - Math.floor(i / 4)), f = FX_R.f(-0.5, 0.5);
        for (let j = -w; j <= w; j++) dot(jx + j + Math.round(f), jy + i, i < 2 ? '#fff6dc' : i < 6 ? '#ffd27a' : '#ff9a34', true, 1 - i / (n + 2));
      }
      lights.push({ x: jx, y: jy + 4, r: TILE * 1.6, i: 0.9, c: rgb01('#ffb347') });
    }
  }
  const x = at.x - spr.ax, y = at.y - spr.ay - lift;
  drawArtSprite(spr, x, y);
  if (id === 'bay') {
    // the mast's light, blinking; the cradle glowing Wick's violet
    if (Math.floor(t * 1.4) % 3 === 0) { dot(x + spr.beacon.x, y + spr.beacon.y, '#ff6a40', true); lights.push({ x: x + spr.beacon.x, y: y + spr.beacon.y, r: TILE * 0.7, i: 0.4, c: rgb01('#ff6a40') }); }
    lights.push({ x: x + spr.cradle.x, y: y + spr.cradle.y, r: TILE * 1.2, i: 0.5 + 0.12 * Math.sin(t * 2.4), c: rgb01('#c9a2ff') });
  } else if (id === 'refinery') {
    // the melt's light through the glass, flickering; heat off the chimney
    lights.push({ x: x + spr.glass.x, y: y + spr.glass.y + 6, r: TILE * 1.5, i: 0.75 + 0.12 * Math.sin(t * 9) + 0.08 * Math.sin(t * 21), c: rgb01('#ff9a34') });
    for (let i = 0; i < 4; i++) {
      const ph = (t * 0.55 + i / 4) % 1, cx = x + spr.stack.x + Math.round(Math.sin(i * 2.3 + ph * 4) * 2 + ph * 3), cy = y + spr.stack.y - Math.round(ph * 18);
      dot(cx, cy, i % 2 ? '#5a5a62' : ph < 0.35 ? '#ffb347' : '#902a0a', i % 2 === 0, (1 - ph) * (i % 2 ? 0.5 : 0.9));
    }
  } else if (id === 'relay') {
    // the crystal's light, pulsing, and its signal going up in rings
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
    lights.push({ x: x + spr.crystal.x, y: y + spr.crystal.y, r: TILE * (1.6 + pulse * 0.6), i: 0.6 + pulse * 0.3, c: rgb01(HART.star[4]) });
    for (let k = 0; k < 2; k++) {
      const ph = (t * 0.45 + k / 2) % 1, rr = Math.round(3 + ph * 12);
      for (let i = -rr; i <= rr; i += 2) dot(x + spr.crystal.x + i, y + spr.crystal.y - 6 - Math.round(ph * 22) + Math.round((i * i) / (rr * 3 + 1)), HART.star[5], true, (1 - ph) * 0.55);
    }
    spr.lamps.forEach(([lx, ly], i) => { if (Math.floor(t * 2 + i * 0.5) % 4 !== 0) dot(x + lx, y + ly, HART.amber[3], true); });
  } else if (id === 'quarters') {
    for (const [lx, ly] of spr.lamps) lights.push({ x: x + lx, y: y + ly, r: TILE * 1.1, i: 0.45, c: rgb01('#ffc070') });
  }
  if (!lift) drawStarstone(spr, x, y, 'bld' + id, lights);
  paintOcclude(x, y - 4, spr.w, spr.h + 4, at.y, ox, oy);
}

// The buildings' names over them, as the stations' are (hub.js).
function drawStructureLabels(d, ox, oy) {
  const S = d.floor.site;
  if (!S || !S.plots) return;
  STRUCTURE_IDS.forEach((id, k) => {
    const p = S.plots[k];
    if (!p || !structureStands(id)) return;
    const spr = structureSprite(id), at = plotAt(p, ox, oy);
    if (at.x < 0 || at.x > View.w) return;
    const m = dist(p.x * TILE, p.y * TILE, d.p.x, d.p.y) / TILE, al = clamp(1.1 - (m - 2) / 4, 0.45, 1);
    drawLabel(STRUCTURES[id].label, at.x, at.y - spr.ay - 9, m < 2.5 ? '#fff2c8' : '#c8bca0', al);
  });
}

// A building's icon for the forge: its sprite, half size.
const _structureIcons = {};
function structureIconUrl(id) {
  if (_structureIcons[id]) return _structureIcons[id];
  const spr = structureSprite(id), n = Math.max(spr.w, spr.h), c = document.createElement('canvas');
  c.width = c.height = Math.ceil(n / 2) + 2;
  const x = c.getContext('2d'), w = spr.w / 2, h = spr.h / 2;
  x.imageSmoothingEnabled = true;
  x.drawImage(spr.c, (c.width - w) / 2, c.height - h - 1, w, h);
  x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.5;
  x.drawImage(spr.ec, (c.width - w) / 2, c.height - h - 1, w, h);
  return (_structureIcons[id] = c.toDataURL());
}

// ---------------------------------------------------------------------------
// What they do
// ---------------------------------------------------------------------------
// The Refinery: the ores that can be refined, each into the next ore up,
// that ore having been brought home already. [{ from, to }]
function refineRoutes(s = Save.data) {
  const out = [];
  for (let i = 0; i + 1 < T.ores.length; i++) {
    const a = T.ores[i], b = T.ores[i + 1];
    if (!(s.studied || []).includes('ore:' + b.id) && !(s.stash[b.id] > 0)) continue;
    out.push({ from: a.id, to: b.id });
  }
  return out;
}
// Refines one: n of an ore and the threads into one of the next up.
function refineOre(from) {
  const s = Save.data, R = T.structures.refinery, r = refineRoutes().find((x) => x.from === from);
  if (!structureStands('refinery') || !r || (s.stash[from] || 0) < R.n || (s.stash.thread || 0) < R.threads) return false;
  s.stash[from] -= R.n; if (!s.stash[from]) delete s.stash[from];
  s.stash.thread -= R.threads; if (!s.stash.thread) delete s.stash.thread;
  s.stash[r.to] = (s.stash[r.to] || 0) + 1;
  Save.save();
  return true;
}
// The REFINE section of the fabricator's SUPPLIES screen (supplies.js).
function refineHtml() {
  const s = Save.data, R = T.structures.refinery;
  if (!structureBuilt('refinery')) return '';
  if (!structureStands('refinery')) return '<h3>REFINE</h3><p class="note">The Refinery is coming down to its plot. Go and see it land.</p>';
  const rows = refineRoutes().map((r) => {
    const ok = (s.stash[r.from] || 0) >= R.n && (s.stash.thread || 0) >= R.threads;
    return `<div class="row static refine-row"><img class="icon" src="${stuffIconUrl(r.to)}" alt=""><span class="row-text"><span class="row-name">1 ${esc(stuffName(r.to))}</span><span class="cost-list">${costTag(r.from, R.n, s.stash[r.from] || 0)} ${costTag('thread', R.threads, s.stash.thread || 0)}</span></span><button class="mini" data-act="refine" data-arg="${r.from}" ${ok ? '' : 'disabled'}>REFINE</button></div>`;
  }).join('');
  return `<h3>REFINE <span class="dim">· THE REFINERY</span></h3><p class="note">${R.n} of an ore and ${R.threads} threads make 1 of the next ore up, for a recipe that's short.</p>${rows || '<p class="note">Bring home a second ore, and the Refinery can make it from the first.</p>'}`;
}

// The Forward Relay: an emergency recall's time and share, banking's time.
function relayRecallTime() { return T.leave.recall * (structureStands('relay') ? T.structures.relay.recall : 1); }
function relayLoss() { return structureStands('relay') ? T.structures.relay.loss : 1; }
function relayBankTime() { return T.leave.extract * (structureStands('relay') ? T.structures.relay.bank : 1); }

// The Settlers' Quarters: the contracts on the board, and what each pays
// besides.
function contractsPosted() { return T.contracts.posted + (structureStands('quarters') ? T.structures.quarters.contracts : 0); }
function contractThreads() { return structureStands('quarters') ? T.structures.quarters.pay : 0; }

Object.assign(UI.acts, {
  refine: (from) => { if (refineOre(from)) { UI.toast(`Refined: 1 ${stuffName(refineRoutes().find((r) => r.from === from).to)}`, 'legendary'); snd('forgePress', {}); UI.redraw(); } },
});
