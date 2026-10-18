'use strict';
// ---------------------------------------------------------------------------
// Tools. The diver carries one, chosen at the ledge before setting out, and
// each changes what can be seen or done down there: where the way home is,
// where the ore is, what's coming, the lay of the site, a pocket more, a
// lodeline called down where there's none. The Compass is carried from the
// start; the rest are made once, from the stash, as the star grows
// (T.tools: the magnitude each needs, and what it costs).
// ---------------------------------------------------------------------------

const TOOLS = {
  compass: { name: 'Lodeline Compass', icon: 'compass', text: 'An arrow to the nearest lodeline, or where none reaches, to the nearest way on.' },
  oresense: { name: 'Ore Sense', icon: 'lens', text: 'Veins nearby glint through the dark, and an arrow points to the nearest beyond the view.' },
  radar: { name: 'Threat Radar', icon: 'radar', text: 'Marks at the edge of the view for what is out there: red for the dangerous, violet for the Hollow.' },
  map: { name: "Surveyor's Map", icon: 'map', text: 'Draws each site as you walk it, with its ways and lodeline once seen.' },
  satchel: { name: 'Deep Satchel', icon: 'satchel', text: 'One more pocket slot, so more comes home whatever happens.' },
  beacon: { name: 'Lode Beacon', icon: 'beacon', text: 'Once an expedition: call a lodeline down where you stand. It takes a few seconds to land, and its light draws everything near.' },
};
const TOOL_IDS = Object.keys(TOOLS);

const _toolIcons = {};
function toolIconUrl(id) {
  if (!_toolIcons[id]) _toolIcons[id] = art2Sprite(TOOL_ROWS[TOOLS[id].icon]).c.toDataURL();
  return _toolIcons[id];
}

function toolOwned(id) { return (Save.data.tools || []).includes(id); }
function toolOpen(id) { return magnitudeOf(Save.data.star) >= T.tools[id].mag; }
function toolAffordable(id) { const s = Save.data.stash, c = T.tools[id].cost; return Object.keys(c).every((k) => (s[k] || 0) >= c[k]); }
function makeTool(id) {
  if (toolOwned(id) || !toolOpen(id) || !toolAffordable(id)) return false;
  const s = Save.data.stash, c = T.tools[id].cost;
  for (const k in c) { s[k] -= c[k]; if (!s[k]) delete s[k]; }
  Save.data.tools.push(id);
  Save.data.tool = id;
  Save.save();
  return true;
}
function toolCostText(id) { const c = T.tools[id].cost; return Object.keys(c).map((k) => `${c[k]} ${stuffName(k)}`).join(', '); }

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
  const far = (t) => { const s = steps[t.y * f.w + t.x]; return s < 0 ? 1e9 : s; };
  if (f.pad && !d.padDark) return { x: f.pad.x, y: f.pad.y, col: ART.pal.star[3], home: true };
  const ways = (f.ways || []).map((w, i) => ({ x: w.x, y: w.y, col: ZONE_SIGNS[d.ways[i]] || '#ffffff' })).sort((a, b) => far(a) - far(b));
  return ways[0] || null;
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
  if (d.tool !== 'beacon' || d.beaconUsed || d.hub) return false;
  if (d.zone === 'lair' && d.padDark) { UI.toast("The Keeper's hold is too strong here"); return false; }
  if (floorTile(f, tx, ty) !== TILE_FLOOR) { UI.toast('The beacon needs open ground'); return false; }
  d.beaconUsed = true;
  d.beacon = { x: tx, y: ty, t: 0, landed: false };
  for (const e of d.enemies) if (!e.dead && dist(e.x, e.y, p.x, p.y) < T.tools.beacon.noise) wake(d, e);
  UI.toast('The beacon is calling a lodeline down', 'legendary');
  return true;
}
function landBeacon(d) {
  const f = d.floor, b = d.beacon;
  b.landed = true;
  if (f.pad) { f.tiles[f.pad.y * f.w + f.pad.x] = TILE_FLOOR; repaintAround(f, f.pad.x, f.pad.y); }
  f.tiles[b.y * f.w + b.x] = TILE_PAD;
  f.pad = { x: b.x, y: b.y };
  d.padDark = false;
  repaintAround(f, b.x, b.y);
  for (const e of d.enemies) if (!e.dead && dist(e.x, e.y, (b.x + 0.5) * TILE, (b.y + 0.5) * TILE) < T.tools.beacon.noise) wake(d, e);
  UI.toast('A lodeline lands', 'legendary');
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
  const sx = wx + ox, sy = wy + oy, m = 4;
  if (sx >= m && sy >= m && sx < View.w - m && sy < View.h - m) return false;
  const a = Math.atan2(sy - py, sx - px), cx = clamp(sx, m, View.w - 1 - m), cy = clamp(sy, m, View.h - 1 - m);
  toolArrow(cx - Math.cos(a) * size, cy - Math.sin(a) * size, a, col, size);
  return true;
}

function drawToolHud(d, ox, oy) {
  if (d.hub || d.dying) return;
  const p = d.p, px = Math.round(p.x + ox), py = Math.round(p.y + oy) - 8, c = View.ctx, blink = Math.sin(Game.realT * 6) > 0;
  // a beacon falling: a column of light narrowing on its spot
  if (d.beacon && !d.beacon.landed) {
    const b = d.beacon, k = b.t / T.tools.beacon.land, bx = Math.round((b.x + 0.5) * TILE + ox), by = Math.round((b.y + 0.5) * TILE + oy);
    c.fillStyle = ART.pal.star[3];
    for (let y = by - 60; y < by; y += 2) if ((y + Math.floor(Game.realT * 30)) % 4 < 2) c.fillRect(bx, y, 1, 1);
    c.globalAlpha = 0.6;
    const r = Math.round(10 * (1 - k)) + 2;
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; c.fillRect(Math.round(bx + Math.cos(a) * r), Math.round(by + Math.sin(a) * r * 0.6), 1, 1); }
    c.globalAlpha = 1;
  }
  if (d.tool === 'compass' && d.compass) {
    const t = d.compass, wx = (t.x + 0.5) * TILE, wy = (t.y + 0.5) * TILE, m = dist(wx, wy, p.x, p.y);
    if (m > TILE * 2.5) {
      const a = Math.atan2(wy - p.y, wx - p.x);
      c.globalAlpha = t.home ? 1 : 0.85;
      toolArrow(px + Math.cos(a) * 14, py + Math.sin(a) * 11, a, t.col, 3);
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
        c.fillRect(Math.round(x * TILE + ox + 3 + h), Math.round(y * TILE + oy + 4 + ((h * 3) % 6)), 1, 1);
        c.fillRect(Math.round(x * TILE + ox + 9 - h), Math.round(y * TILE + oy + 10 - h), 1, 1);
      }
    const o = d.oreNear;
    if (o) edgePip(px, py, (o.x + 0.5) * TILE, (o.y + 0.5) * TILE, ox, oy, ART.ores[o.ore][3], 2);
  }
  if (d.tool === 'radar') {
    const R = T.tools.radar.reach * TILE;
    for (const e of d.enemies) {
      if (e.dead || e.type === 'dummy' || T.enemies[e.type].rooted || dist(e.x, e.y, p.x, p.y) > R) continue;
      const col = e.type === 'hollow' ? '#b070ff' : e.boss ? '#ff3a2a' : e.elite ? ELITE_COLS[e.elite] : e.aggro ? '#ff7a5a' : '#a05a4a';
      if (e.type === 'hollow' && !blink) continue;
      edgePip(px, py, e.x, e.y, ox, oy, col, e.boss || e.type === 'hollow' ? 3 : 2);
    }
  }
  if (d.tool === 'map' && d.seen) drawSiteMap(d);
}

// The map: what's been seen of the site, a pixel a tile, in the view's corner.
function drawSiteMap(d) {
  const f = d.floor, c = View.ctx, s = d.seen, x0 = View.w - f.w - 3, y0 = 12;
  c.globalAlpha = 0.55; c.fillStyle = '#000'; c.fillRect(x0 - 1, y0 - 1, f.w + 2, f.h + 2); c.globalAlpha = 1;
  c.fillStyle = '#6a6458';
  for (let y = 0; y < f.h; y++)
    for (let x = 0; x < f.w; x++) {
      const i = y * f.w + x;
      if (s[i] && !TILE_SOLID[f.tiles[i]]) c.fillRect(x0 + x, y0 + y, 1, 1);
    }
  const mark = (t, col) => { if (t && s[t.y * f.w + t.x]) { c.fillStyle = col; c.fillRect(x0 + t.x - 1, y0 + t.y - 1, 3, 3); } };
  (f.ways || []).forEach((w, i) => mark(w, ZONE_SIGNS[d.ways[i]] || '#fff'));
  if (f.pad && !d.padDark) mark(f.pad, ART.pal.star[3]);
  if (d.fieldForge) mark(d.fieldForge, '#ff8a3a');
  if (d.rift && d.rift.open) { mark(d.rift, RIFT_PAL.riftedge[0]); if (d.rift.pair) mark(d.rift.pair, RIFT_PAL.riftedge[0]); }
  if (Math.sin(Game.realT * 8) > -0.3) { c.fillStyle = '#ffffff'; c.fillRect(x0 + Math.floor(d.p.x / TILE), y0 + Math.floor(d.p.y / TILE), 1, 1); }
}
