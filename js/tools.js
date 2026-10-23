'use strict';
// ---------------------------------------------------------------------------
// Tools. The diver carries one, chosen at the portal before setting out, and
// each changes what can be seen or done out there: where the light is,
// where the ore is, what's coming, the lay of the land, a
// spire's light called down where there's none, cores likelier. The
// Compass is carried from the start; the rest are made once, at the forge,
// as the star grows (their recipes are in blueprints.js; T.tools: the
// magnitude each needs, and what it costs).
// ---------------------------------------------------------------------------

const TOOLS = {
  compass: { name: 'Lodestone Compass', icon: 'compass', text: 'Points to the spire, or the nearest kindled land.' },
  oresense: { name: 'Ore Sense', icon: 'lens', text: 'Nearby veins glint through the dark.' },
  radar: { name: 'Threat Radar', icon: 'radar', text: "Marks what's out there at the view's edge." },
  map: { name: "Surveyor's Map", icon: 'map', text: 'Draws each place as you walk it.' },
  lens: { name: 'Capture Lens', icon: 'lure', text: 'Creatures leave cores half again as often.' },
  beacon: { name: 'Lode Beacon', icon: 'beacon', text: "Once a sortie, call a spire's light down where you stand." },
};
const TOOL_IDS = ['compass', 'oresense', 'radar', 'beacon', 'map', 'lens'];

const _toolIcons = {};
function toolIconUrl(id) {
  if (!_toolIcons[id]) _toolIcons[id] = art2Sprite(TOOL_ROWS[TOOLS[id].icon], undefined, { fine: false }).c.toDataURL();
  return _toolIcons[id];
}

function toolOwned(id) { return (Save.data.tools || []).includes(id); }
function toolOpen(id) { return magnitudeOf(Save.data.star) >= T.tools[id].mag; }
// Makes a tool from the stash (its recipe at the forge): once, when it's
// known and the star has grown enough. It's carried next.
function makeTool(id) {
  const rid = 'tool_' + id;
  if (toolOwned(id) || !toolOpen(id) || !Save.data.blueprints.includes(rid) || !recipePay(recipeCost(rid), Save.data.stash)) return false;
  Save.data.tools.push(id);
  Save.data.tool = id;
  Save.save();
  return true;
}

// ---------------------------------------------------------------------------
// In a dive
// ---------------------------------------------------------------------------

// Every step: the map remembers what's been seen, the compass and the ore
// sense look again now and then, a planted beacon falls.
function updateTools(dt) {
  const d = Game.dive, f = d.floor, p = d.p, tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
  if ((d.toolT = (d.toolT || 0) - dt) <= 0) {
    d.toolT = 0.4;
    if (d.tool === 'map') {
      const R = T.tools.map.sight;
      if (!d.seen || d.seen.length !== f.w * f.h) d.seen = new Uint8Array(f.w * f.h);
      for (let y = Math.max(0, ty - R); y <= Math.min(f.h - 1, ty + R); y++)
        for (let x = Math.max(0, tx - R); x <= Math.min(f.w - 1, tx + R); x++)
          if ((x - tx) * (x - tx) + (y - ty) * (y - ty) <= R * R) d.seen[y * f.w + x] = 1;
    }
    if (d.tool === 'compass') d.compass = compassTarget(d, tx, ty);
    if (d.tool === 'oresense') d.oreNear = nearestOre(d, tx, ty);
  }
  const b = d.beacon;
  if (b && !b.landed && (b.t += dt) >= T.tools.beacon.land) landBeacon(d);
}

// Where the compass points: the nearest lit lodeline on foot, else the
// nearest way on.
function compassTarget(d, tx, ty) {
  const f = d.floor, steps = floorDistances(f.tiles, f.w, f.h, tx, ty);
  if (d.sortie && !d.deep) return compassTargetWorld(d, steps);
  const far = (t) => { const s = steps[t.y * f.w + t.x]; return s < 0 ? 1e9 : s; };
  if (f.pad && !d.padDark) return { x: f.pad.x, y: f.pad.y, col: ART.pal.star[3], home: true };
  const ways = (f.ways || []).map((w, i) => ({ x: w.x, y: w.y, col: ZONE_SIGNS[d.ways[i]] || '#ffffff' })).sort((a, b) => far(a) - far(b));
  if (ways[0]) return ways[0];
  // nowhere to go on: point at the dark lodeline anyway
  return f.pad ? { x: f.pad.x, y: f.pad.y, col: '#6a6458' } : null;
}

// The nearest unmined vein the pick can break.
function nearestOre(d, tx, ty) {
  const f = d.floor, pick = Save.data.equip.pick ? Save.data.equip.pick.base.power : 1;
  let best = null, bd = 1e9;
  for (let i = 0; i < f.tiles.length; i++) {
    if (f.tiles[i] !== TILE_ORE) continue;
    const o = T.ores[f.ore[i] - 1];
    if (o && o.tier > pick) continue;
    const x = i % f.w, y = Math.floor(i / f.w), m = (x - tx) * (x - tx) + (y - ty) * (y - ty);
    if (m < bd) { bd = m; best = { x, y, ore: o ? o.id : 'ferrite' }; }
  }
  return best;
}

// Plants the beacon: it lands after a few seconds, and lights a lodeline.
function plantBeacon() {
  const d = Game.dive, p = d.p, f = d.floor, tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
  if (d.tool !== 'beacon' || d.beaconUsed || d.beacon || d.hub) return false;
  if (d.zone === 'lair' && d.keeper && !d.keeper.dead) { UI.toast("The Keeper's hold is too strong here"); return false; }
  if (f.pad && !d.padDark) { UI.toast(d.deep ? 'The light already reaches here' : 'A spire already stands here'); return false; }
  if (d.sortie && !d.deep && (f.heart && Math.hypot(f.heart.x - tx, f.heart.y - ty) < 2 || (f.stones || []).some((s) => Math.hypot(s.x - tx, s.y - ty) < 2))) { UI.toast('Not so close to that'); return false; }
  if ((d.fieldForge && Math.hypot(d.fieldForge.x - tx, d.fieldForge.y - ty) < 2) || (d.rift && d.rift.open && [d.rift, d.rift.pair].some((r) => r && Math.hypot(r.x - tx, r.y - ty) < 2))) { UI.toast('Not so close to that'); return false; }
  if (floorTile(f, tx, ty) !== TILE_FLOOR) { UI.toast('The beacon needs open ground'); return false; }
  d.beacon = { x: tx, y: ty, t: 0, landed: false };
  for (const e of d.enemies) if (!e.dead && dist(e.x, e.y, p.x, p.y) < T.tools.beacon.noise) wake(d, e, true);
  UI.toast(d.deep ? "The beacon is calling the star's light down" : "The beacon is calling a spire's light down", 'legendary');
  snd('beacon');
  return true;
}
function landBeacon(d, quiet) {
  const f = d.floor, b = d.beacon;
  b.landed = true;
  d.beaconUsed = true;
  if (f.pad) { f.tiles[f.pad.y * f.w + f.pad.x] = TILE_FLOOR; repaintAround(f, f.pad.x, f.pad.y); }
  f.tiles[b.y * f.w + b.x] = TILE_PAD;
  f.pad = { x: b.x, y: b.y };
  d.padDark = false;
  repaintAround(f, b.x, b.y);
  if (quiet) return;
  for (const e of d.enemies) if (!e.dead && dist(e.x, e.y, (b.x + 0.5) * TILE, (b.y + 0.5) * TILE) < T.tools.beacon.noise) wake(d, e, true);
  UI.toast(d.deep ? 'The light lands: rise here' : "A spire's light lands: bank here, or stand in it", 'legendary');
  snd('beaconLand');
  buzz(40);
}

// ---------------------------------------------------------------------------
// Drawn over the lit scene, so they read in any dark
// ---------------------------------------------------------------------------

// A small arrowhead at x, y pointing along a.
function toolArrow(x, y, a, col, size = 3) {
  const c = View.ctx, ux = Math.cos(a), uy = Math.sin(a);
  c.fillStyle = col;
  for (let k = 0; k <= size; k++)
    for (let s = -(size - k); s <= size - k; s++)
      c.fillRect(Math.round(x + ux * k - uy * s * 0.6), Math.round(y + uy * k + ux * s * 0.6), 1, 1);
}

// A pip at the edge of the view in the direction of a world point.
function edgePip(px, py, wx, wy, ox, oy, col, size) {
  const sx = wx * AP + ox, sy = wy * AP + oy, m = 5;
  if (sx >= m && sy >= m && sx < View.w - m && sy < View.h - m) return false;
  const a = Math.atan2(sy - py, sx - px), cx = clamp(sx, m, View.w - 1 - m), cy = clamp(sy, m, View.h - 1 - m);
  toolArrow(cx - Math.cos(a) * size, cy - Math.sin(a) * size, a, col, size);
  return true;
}

function drawToolHud(d, ox, oy) {
  if (d.hub || d.dying) return;
  const p = d.p, px = Math.round(p.x * AP) + ox, py = Math.round(p.y * AP) + oy - ap(8), c = View.ctx, blink = Math.sin(Game.realT * 6) > 0;
  // a beacon falling: a column of light narrowing on its spot
  if (d.beacon && !d.beacon.landed) {
    const b = d.beacon, k = b.t / T.tools.beacon.land, bx = Math.round((b.x + 0.5) * ATILE) + ox, by = Math.round((b.y + 0.5) * ATILE) + oy;
    c.fillStyle = ART.pal.star[3];
    for (let y = by - ap(60); y < by; y += 2) if ((y + Math.floor(Game.realT * 45)) % 4 < 2) c.fillRect(bx, y, 1, 1);
    c.globalAlpha = 0.6;
    const r = Math.round((10 * (1 - k) + 2) * AP), n = Math.round(16 * AP);
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; c.fillRect(Math.round(bx + Math.cos(a) * r), Math.round(by + Math.sin(a) * r * 0.6), 1, 1); }
    c.globalAlpha = 1;
  }
  if (d.tool === 'compass' && d.compass) {
    const t = d.compass, wx = (t.x + 0.5) * TILE, wy = (t.y + 0.5) * TILE, m = dist(wx, wy, p.x, p.y);
    if (m > TILE * 2.5) {
      const a = Math.atan2(wy - p.y, wx - p.x);
      c.globalAlpha = t.home ? 1 : 0.85;
      toolArrow(px + Math.cos(a) * 14 * AP, py + Math.sin(a) * 11 * AP, a, t.col, 4);
      c.globalAlpha = 1;
    }
  }
  if (d.tool === 'oresense') {
    const R = T.tools.oresense.reach * TILE, f = d.floor;
    const x0 = Math.max(0, Math.floor((p.x - R) / TILE)), x1 = Math.min(f.w - 1, Math.floor((p.x + R) / TILE));
    const y0 = Math.max(0, Math.floor((p.y - R) / TILE)), y1 = Math.min(f.h - 1, Math.floor((p.y + R) / TILE));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * f.w + x;
        if (f.tiles[i] !== TILE_ORE) continue;
        const o = T.ores[f.ore[i] - 1], ramp = ART.ores[o ? o.id : 'ferrite'], h = (x * 7 + y * 13) % 5;
        if (((Game.realT * 2 + h) | 0) % 3 === 0) continue;
        c.fillStyle = ramp[3];
        c.fillRect(x * ATILE + ox + ap(3 + h), y * ATILE + oy + ap(4 + ((h * 3) % 6)), 1, 1);
        c.fillRect(x * ATILE + ox + ap(9 - h), y * ATILE + oy + ap(10 - h), 1, 1);
      }
    const o = d.oreNear;
    if (o) edgePip(px, py, (o.x + 0.5) * TILE, (o.y + 0.5) * TILE, ox, oy, ART.ores[o.ore][3], 3);
  }
  if (d.tool === 'radar') {
    const R = T.tools.radar.reach * TILE;
    for (const e of d.enemies) {
      if (e.dead || e.type === 'dummy' || T.enemies[e.type].rooted || dist(e.x, e.y, p.x, p.y) > R) continue;
      const col = e.type === 'hollow' ? '#b070ff' : e.boss ? '#ff3a2a' : e.elite ? ELITE_COLS[e.elite] : e.aggro ? '#ff7a5a' : '#a05a4a';
      if (e.type === 'hollow' && !blink) continue;
      edgePip(px, py, e.x, e.y, ox, oy, col, e.boss || e.type === 'hollow' ? 4 : 3);
    }
  }
  if (d.tool === 'map' && d.seen) drawSiteMap(d);
}

// The map: what's been seen of the site, in the view's top-right corner: a
// pixel for each MAP_Q × MAP_Q tiles (each tile, at 24 px tiles, so it's
// about as big on the screen as it was).
const MAP_Q = AP > 1 ? 1 : 2;
function drawSiteMap(d) {
  // (a tile is a pixel of the map, AF of the view's at fine grain)
  const f = d.floor, c = View.ctx, s = d.seen, q = MAP_Q, P = AF, mw = Math.ceil(f.w / q) * P, mh = Math.ceil(f.h / q) * P, x0 = View.w - mw - 4 * P, y0 = 4 * P;
  c.globalAlpha = 0.8; c.fillStyle = '#000'; c.fillRect(x0 - P, y0 - P, mw + 2 * P, mh + 2 * P); c.globalAlpha = 1;
  c.fillStyle = '#3a3630'; c.fillRect(x0 - P, y0 - P, mw + 2 * P, P); c.fillRect(x0 - P, y0 + mh, mw + 2 * P, P);
  c.fillStyle = '#8a8478';
  for (let y = 0; y < mh / P; y++)
    for (let x = 0; x < mw / P; x++) {
      let open = false;
      for (let j = 0; j < q && !open; j++) for (let i = 0; i < q && !open; i++) {
        const tx = x * q + i, ty = y * q + j, k = ty * f.w + tx;
        if (tx < f.w && ty < f.h && s[k] && !TILE_SOLID[f.tiles[k]]) open = true;
      }
      if (open) c.fillRect(x0 + x * P, y0 + y * P, P, P);
    }
  const m = (4 - q) * P, mark = (t, col) => { if (t && s[t.y * f.w + t.x]) { c.fillStyle = col; c.fillRect(x0 + (Math.floor(t.x / q) - 1) * P, y0 + (Math.floor(t.y / q) - 1) * P, m, m); } };
  (f.ways || []).forEach((w, i) => mark(w, ZONE_SIGNS[d.ways[i]] || '#fff'));
  if (f.pad && !d.padDark) mark(f.pad, ART.pal.star[3]);
  for (const s of f.stones || []) mark(s, '#c8c0a0');
  for (const e of f.exits || []) mark(e, isKindled(e.to) ? ART.pal.star[2] : '#8a84a0');
  if (d.fieldForge) mark(d.fieldForge, '#ff8a3a');
  if (d.rift && d.rift.open) { mark(d.rift, RIFT_PAL.riftedge[0]); if (d.rift.pair) mark(d.rift.pair, RIFT_PAL.riftedge[0]); }
  if (Math.sin(Game.realT * 8) > -0.3) { const px = x0 + Math.floor(d.p.x / TILE / q) * P, py = y0 + Math.floor(d.p.y / TILE / q) * P; c.fillStyle = '#ffffff'; c.fillRect(px, py, (q > 1 ? 1 : 2) * P, (q > 1 ? 1 : 2) * P); }
}
