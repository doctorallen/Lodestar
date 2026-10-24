'use strict';
// ---------------------------------------------------------------------------
// The map (DESIGN.md, The star's screen): the world as the light has
// reached it, a layer at a time (the surface, the Deep: deep.js). The
// ground in each region's own colour, the rock, the lit land in gold, the
// veins, the nodes as marks you can read, the shafts once seen, the
// regions' names once walked, the Kindler. Pinch (or the wheel) to zoom,
// drag to pan; tap a node and a card names it, with STAND THERE to go.
// From THE STAR in the top bar.
// ---------------------------------------------------------------------------

const MapView = { z: 1, cx: 0, cy: 0, layer: 0, sel: -1, base: null, baseKey: '', pointers: new Map(), tap: null, raf: 0, inited: false, opened: 0 };

// The floor the map shows.
function mapFloor() { const d = Game.dive; return MapView.layer && d.world ? d.world.deep : d.floor.layer ? d.world.surface : d.floor; }
// Canvas px for each tile at the zoom, and the floor's top left on the canvas.
function mapScale() { const cv = $('map-cv'), f = mapFloor(); return (cv.width / f.w) * MapView.z; }
function mapOrigin() { const cv = $('map-cv'), s = mapScale(); return { s, ox: cv.width / 2 - MapView.cx * s, oy: cv.height / 2 - MapView.cy * s }; }

function mapInit() {
  if (MapView.inited) return;
  MapView.inited = true;
  const cv = $('map-cv');
  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cv.setPointerCapture(e.pointerId); mapPointer(e, 'down'); });
  cv.addEventListener('pointermove', (e) => mapPointer(e, 'move'));
  cv.addEventListener('pointerup', (e) => mapPointer(e, 'up'));
  cv.addEventListener('pointercancel', (e) => mapPointer(e, 'cancel'));
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(), k = cv.width / r.width; mapZoomAt(Math.exp(-e.deltaY * 0.0015), (e.clientX - r.left) * k, (e.clientY - r.top) * k); }, { passive: false });
}
// The canvas at the screen's pixels, so a tile's pixels stay whole.
function mapFit() {
  const cv = $('map-cv'), r = cv.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round((r.width || 360) * dpr));
  if (cv.width !== w || cv.height !== w) { cv.width = w; cv.height = w; }
}
function mapZoomAt(k, px, py) {
  const { s, ox, oy } = mapOrigin(), f = mapFloor();
  const z = clamp(MapView.z * k, 1, 12), s2 = (($('map-cv').width) / f.w) * z;
  // the tile under the finger stays under it
  const tx = (px - ox) / s, ty = (py - oy) / s;
  MapView.z = z;
  MapView.cx = tx - (px - $('map-cv').width / 2) / s2; MapView.cy = ty - (py - $('map-cv').height / 2) / s2;
  mapClampView();
  mapQueue();
}
function mapClampView() {
  const f = mapFloor(), cv = $('map-cv'), s = mapScale(), half = cv.width / 2 / s;
  MapView.cx = clamp(MapView.cx, Math.min(half, f.w - half), Math.max(half, f.w - half));
  MapView.cy = clamp(MapView.cy, Math.min(half, f.h - half), Math.max(half, f.h - half));
}
function mapPointer(e, kind) {
  const cv = $('map-cv'), r = cv.getBoundingClientRect(), k = cv.width / r.width, x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k, P = MapView.pointers;
  if (kind === 'down') { P.set(e.pointerId, { x, y }); if (P.size === 1) MapView.tap = { x, y, t: performance.now() }; else MapView.tap = null; return; }
  if (kind === 'move') {
    const p = P.get(e.pointerId);
    if (!p) return;
    if (P.size === 1) {
      const { s } = mapOrigin();
      MapView.cx -= (x - p.x) / s; MapView.cy -= (y - p.y) / s;
      if (MapView.tap && Math.hypot(x - MapView.tap.x, y - MapView.tap.y) > 10 * k) MapView.tap = null;
      p.x = x; p.y = y;
      mapClampView(); mapQueue();
    } else if (P.size === 2) {
      const [a, b] = [...P.values()], other = a === p ? b : a;
      const d0 = Math.hypot(p.x - other.x, p.y - other.y), d1 = Math.hypot(x - other.x, y - other.y);
      const mx0 = (p.x + other.x) / 2, my0 = (p.y + other.y) / 2;
      p.x = x; p.y = y;
      const mx1 = (p.x + other.x) / 2, my1 = (p.y + other.y) / 2, { s } = mapOrigin();
      MapView.cx -= (mx1 - mx0) / s; MapView.cy -= (my1 - my0) / s;
      if (d0 > 8) mapZoomAt(d1 / d0, mx1, my1); else { mapClampView(); mapQueue(); }
    }
    return;
  }
  // up or cancel
  const was = P.size;
  P.delete(e.pointerId);
  if (kind === 'up' && was === 1 && MapView.tap && performance.now() - MapView.tap.t < 400 && Game.realT - UI.openedAt >= T.ui.tapGuard) mapTapAt(x, y);
  MapView.tap = null;
}
// A tap: the node nearest it, if one is near; a card names it.
function mapTapAt(x, y) {
  const d = Game.dive, V = veinsState(), { s, ox, oy } = mapOrigin(), L = MapView.layer, k = $('map-cv').width / 360;
  let best = -1, bd = 18 * k;
  for (let i = 0; i < V.nodes.length; i++) {
    const n = V.nodes[i];
    if ((n.l | 0) !== L) continue;
    const m = Math.hypot(ox + (n.x / TILE) * s - x, oy + (n.y / TILE) * s - y);
    if (m < bd) { bd = m; best = i; }
  }
  if (best >= 0 && !d.vLive[best]) { UI.toast('That node is dark: mend the vein to it'); best = -1; }
  MapView.sel = best;
  snd('tap');
  mapQueue(); mapBody();
}
function mapQueue() { if (MapView.raf) return; MapView.raf = requestAnimationFrame(() => { MapView.raf = 0; if (UI.screen === 'screen-map') mapDrawCanvas(); }); }

// The ground, a pixel a tile, drawn once and kept until the light changes.
function mapBase() {
  const d = Game.dive, f = mapFloor(), G = d.litGs ? d.litGs[MapView.layer] : d.litG, key = `${MapView.layer}/${d.vSig}/${f.w}`;
  if (MapView.base && MapView.baseKey === key) return MapView.base;
  const [cv, g] = makeCanvas(f.w, f.h), img = g.createImageData(f.w, f.h), px = new Uint32Array(img.data.buffer), fade = T.star.lightFade;
  const u32 = (rgb) => ((255 << 24) | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0]) >>> 0;
  const lit = ['#5a4418', '#8c6a26', '#c49a3a', '#e8c060'].map((h) => u32(rgbOf(h))), litRock = u32(rgbOf('#3a2c14'));
  // each region's ground and rock in its own colours, darkened for the dark
  const looks = (f.regions || [null]).map((r) => { const b = r ? climeBaseLook(f, r.clime) : artBiome(f); return { open: u32(rgbOf(mix(b.floor[2], '#000000', MapView.layer ? 0.15 : 0.4))), rock: u32(rgbOf(mix(b.rock[2], MapView.layer ? '#ffffff' : '#000000', MapView.layer ? 0.12 : 0.45))) }; });
  for (let i = 0; i < f.w * f.h; i++) {
    const solid = TILE_SOLID[f.tiles[i]], lk = looks[f.regions ? f.climeIdx[i] : 0];
    let c = solid ? lk.rock : lk.open;
    if (G) { const k = clamp(1 - G[i] / fade, 0, 1); if (k > 0) c = solid ? litRock : lit[Math.min(3, Math.floor(k * 3.99))]; }
    px[i] = c;
  }
  g.putImageData(img, 0, 0);
  MapView.base = cv; MapView.baseKey = key;
  return cv;
}

function mapDrawCanvas() {
  const d = Game.dive;
  if (!d) return;
  mapFit();
  const cv = $('map-cv'), g = cv.getContext('2d'), f = mapFloor(), V = veinsState(), live = d.vLive, L = MapView.layer, k = cv.width / 360;
  mapClampView();
  const { s, ox, oy } = mapOrigin();
  g.fillStyle = '#07060a'; g.fillRect(0, 0, cv.width, cv.height);
  g.imageSmoothingEnabled = false;
  g.drawImage(mapBase(), ox, oy, f.w * s, f.h * s);
  const at = (x, y) => [ox + (x / TILE) * s, oy + (y / TILE) * s];
  // the veins on this layer
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const v of V.veins) {
    g.strokeStyle = veinLiving(live, v) ? '#ffe28a' : v.cut ? '#a04040' : '#6a5a3a';
    g.lineWidth = Math.max(1.2 * k, s * 0.35);
    g.beginPath();
    let pen = false;
    for (let i = 0; i < v.pts.length; i++) {
      const q = v.pts[i];
      if ((q[2] | 0) !== L) { pen = false; continue; }
      const [x, y] = at(q[0], q[1]);
      if (pen) g.lineTo(x, y); else g.moveTo(x, y);
      pen = true;
    }
    g.stroke();
  }
  // the thread in hand
  if (d.thread) {
    g.strokeStyle = '#ffd34d'; g.lineWidth = Math.max(1 * k, s * 0.25); g.setLineDash([3 * k, 3 * k]);
    g.beginPath();
    let pen = false;
    for (const q of d.thread.pts.concat([[d.p.x, d.p.y, d.layer | 0]])) { if ((q[2] | 0) !== L) { pen = false; continue; } const [x, y] = at(q[0], q[1]); if (pen) g.lineTo(x, y); else g.moveTo(x, y); pen = true; }
    g.stroke(); g.setLineDash([]);
  }
  // the regions' names, once walked
  const seen = Save.data.regionsSeen || {};
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `${Math.round(10 * k)}px ui-monospace, Menlo, monospace`;
  for (let i = 0; f.regions && i < f.regions.length; i++) {
    if (!seen[`${L}:${i}`]) continue;
    const r = f.regions[i], [x, y] = at((r.x + 0.5) * TILE, (r.y + 0.5) * TILE);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillText(r.name.toUpperCase(), x + k, y + k);
    g.fillStyle = 'rgba(232,220,190,0.8)'; g.fillText(r.name.toUpperCase(), x, y);
  }
  // the shafts once seen: a ring with a notch down (above) or up (below)
  const shaftsSeen = Save.data.shaftsSeen || {};
  for (let i = 0; f.shafts && i < f.shafts.length; i++) {
    if (!shaftsSeen[i]) continue;
    const sh = f.shafts[i], [x, y] = at((sh.x + 0.5) * TILE, (sh.y + 0.5) * TILE), r = 4 * k;
    g.strokeStyle = '#9ab0d0'; g.lineWidth = 1.2 * k; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#9ab0d0'; g.beginPath();
    if (L) { g.moveTo(x - r * 0.6, y + r * 0.3); g.lineTo(x + r * 0.6, y + r * 0.3); g.lineTo(x, y - r * 0.5); }
    else { g.moveTo(x - r * 0.6, y - r * 0.3); g.lineTo(x + r * 0.6, y - r * 0.3); g.lineTo(x, y + r * 0.5); }
    g.closePath(); g.fill();
  }
  // the nodes: a mark each, the star's largest, the one picked ringed
  for (let i = 0; i < V.nodes.length; i++) {
    const n = V.nodes[i];
    if ((n.l | 0) !== L) continue;
    const [x, y] = at(n.x, n.y), isLive = !!live[i], r = (i === 0 ? 7 : 5) * k;
    if (i === 0) {
      g.strokeStyle = '#fff7dc'; g.lineWidth = 1.5 * k;
      for (let a = 0; a < 4; a++) { g.beginPath(); g.moveTo(x + Math.cos((a * Math.PI) / 2) * r * 0.9, y + Math.sin((a * Math.PI) / 2) * r * 0.9); g.lineTo(x + Math.cos((a * Math.PI) / 2) * r * 1.7, y + Math.sin((a * Math.PI) / 2) * r * 1.7); g.stroke(); }
    }
    g.fillStyle = '#0a0806'; g.beginPath(); g.arc(x, y, r + 1.5 * k, 0, Math.PI * 2); g.fill();
    g.fillStyle = isLive ? (i === 0 ? '#fff7dc' : '#ffd34d') : '#5a5048'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    if (isLive) { g.fillStyle = '#fffbe8'; g.beginPath(); g.arc(x - r * 0.25, y - r * 0.25, r * 0.35, 0, Math.PI * 2); g.fill(); }
    else { g.strokeStyle = '#a04040'; g.lineWidth = 1.2 * k; g.beginPath(); g.arc(x, y, r * 0.55, 0, Math.PI * 2); g.stroke(); }
    if (i === MapView.sel) { g.strokeStyle = '#ffffff'; g.lineWidth = 1.8 * k; g.beginPath(); g.arc(x, y, r + 5 * k, 0, Math.PI * 2); g.stroke(); }
  }
  // the Kindler, where he stands (on this layer)
  if ((d.layer | 0) === L) {
    const [x, y] = at(d.p.x, d.p.y);
    g.fillStyle = '#0a0806'; g.beginPath(); g.arc(x, y, 5 * k, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#8fc4ff'; g.beginPath(); g.arc(x, y, 3.5 * k, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(143,196,255,0.7)'; g.lineWidth = 1.2 * k; g.beginPath(); g.arc(x, y, 8 * k, 0, Math.PI * 2); g.stroke();
  }
}

// The words under the map: the layer tabs, the picked node's card, the
// light's reach, then the shapes and Wick (shapes.js).
function mapBody() {
  const d = Game.dive, V = veinsState(), live = d.vLive, L = MapView.layer, S = T.story;
  const mag = magnitudeOf(), A = T.magnitude.at, next = A[mag] !== undefined ? ` · ${Math.max(0, Math.ceil(A[mag] - (d.vWorth || 0)))} strides to magnitude ${mag + 1}` : '';
  const cuts = V.veins.filter((v) => v.cut).length, set = V.nodes.length - 1;
  const tabs = d.world ? `<div class="menu sound-row map-layers"><button class="btn${L ? '' : ' primary'}" data-act="mapLayer" data-arg="0">THE SURFACE</button><button class="btn${L ? ' primary' : ''}" data-act="mapLayer" data-arg="1">THE DEEP</button></div>` : '';
  let card = '';
  const i = MapView.sel;
  if (i >= 0 && V.nodes[i]) {
    const n = V.nodes[i], f = mapFloor(), far = Math.round(dist(n.x, n.y, V.nodes[0].x, V.nodes[0].y) / TILE), where = f.regions ? climeName(climeAtPx(f, n.x, n.y)) : '';
    const name = i === 0 ? 'The star' : `Node ${i}`, here = (d.layer | 0) === (n.l | 0) && dist(d.p.x, d.p.y, n.x, n.y) < TILE * 3;
    const why = d.thread ? 'Not with the thread in hand' : d.hold ? 'Not while the hold runs' : !live[i] ? 'Dark: mend the vein to it' : here ? 'You stand here' : '';
    card = `<div class="row static on map-card"><span class="row-text"><span class="row-name">${esc(name)}${where ? ` <span class="r-legendary">· ${esc(where)}</span>` : ''}</span><span class="row-sub">${i === 0 ? 'The middle of the world' : `${far} strides from the star · ${n.l ? 'the Deep' : 'the surface'}`}${why ? ` · ${esc(why)}` : ''}</span></span><button class="mini" data-act="mapCancel">BACK</button><button class="mini${why ? '' : ' primary'}" data-act="mapGo"${why ? ' disabled' : ''}>STAND THERE</button></div>`;
  } else card = `<p class="note center">Tap a lit node to stand there. Pinch to zoom.</p>`;
  $('map-body').innerHTML = tabs + card
    + `<p class="note center">The light reaches ${Math.round(d.vWorth || 0)} strides · magnitude ${mag}${esc(next)} · ${set} node${set === 1 ? '' : 's'} set${cuts ? `, ${cuts} vein${cuts > 1 ? 's' : ''} cut` : ''}.</p>`
    + shapesHtml()
    + `<h3>WICK</h3><p class="note">The star's core: ${Save.data.core} of ${T.star.core}. Above, the Meridian: ${S.sleepers} asleep until the world lives.</p><div class="menu"><button class="btn quiet" data-act="replayIntro">THE LANDING AGAIN</button></div>`;
}

// The screen opening (ui.js UI.redraw): the layer he's on, the view kept
// from last time (whole world the first).
function drawMap() {
  const d = Game.dive;
  if (!d) return;
  mapInit();
  if (MapView.opened !== UI.openedAt) {
    MapView.opened = UI.openedAt;
    MapView.layer = d.layer | 0; MapView.sel = -1;
    if (!MapView.z || MapView.z === 1) { const f = mapFloor(); MapView.cx = f.w / 2; MapView.cy = f.h / 2; }
  }
  mapDrawCanvas();
  mapBody();
}
// The tabs and the card's buttons (ui.js UI.acts).
function mapLayerSet(l) { MapView.layer = +l; MapView.sel = -1; const f = mapFloor(); MapView.cx = clamp(MapView.cx, 0, f.w); MapView.cy = clamp(MapView.cy, 0, f.h); mapDrawCanvas(); mapBody(); }
function mapGo() {
  const d = Game.dive, i = MapView.sel;
  if (i < 0) return;
  if (veinsTravel(d, i)) { UI.close(); UI.toast(i === 0 ? 'At the star' : 'At the node'); MapView.sel = -1; }
  else UI.toast(d.thread ? 'Not with the thread in hand' : d.hold ? 'Not while the hold runs' : "Can't stand there");
}
// A shaft seen: within T.deep.seen tiles of the Kindler (regions.js
// regionsStep calls it each step).
function mapSeeShafts(d) {
  const f = d.floor;
  if (!f.shafts) return;
  const s = Save.data, R = T.deep.seen * TILE;
  for (let i = 0; i < f.shafts.length; i++) {
    const sh = f.shafts[i];
    if (Math.abs(sh.x * TILE - d.p.x) > R || Math.abs(sh.y * TILE - d.p.y) > R) continue;
    if (!s.shaftsSeen) s.shaftsSeen = {};
    if (!s.shaftsSeen[i]) { s.shaftsSeen[i] = true; Save.saveField('shaftsSeen'); UI.toast('A shaft: the Deep is under here', 'tip'); }
  }
}
