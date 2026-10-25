'use strict';
// ---------------------------------------------------------------------------
// The map (DESIGN.md, The star's screen): the world as the light has
// reached it, a layer at a time (the surface, the Deep: deep.js). The
// ground in each region's own colour, the rock, the lit land in gold, the
// veins, the nodes as marks you can read, the shafts once seen, the
// regions' names once walked, the Kindler. Pinch (or the wheel) to zoom,
// drag to pan; tap a node and a card names it, with TRAVEL THERE to go:
// the light is seen running the veins from where he stands to the node
// (mapGo, MapView.trip, T.map.trip), and then he stands there. From THE
// STAR in the top bar. And the minimap, always, in the view's
// corner (miniDraw, at the end).
// ---------------------------------------------------------------------------

const MapView = { z: 1, cx: 0, cy: 0, layer: 0, sel: -1, bases: null, pointers: new Map(), tap: null, raf: 0, inited: false, opened: 0, trip: null };

// The floor the map shows (and a layer's floor).
function mapFloorOf(L) { const d = Game.dive; return L && d.world ? d.world.deep : d.floor.layer ? d.world.surface : d.floor; }
function mapFloor() { return mapFloorOf(MapView.layer); }
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
  if (MapView.trip) return;
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

// A layer's ground, a pixel a tile, drawn once and kept until the light
// changes: { cv, px } (the pixels too, for the minimap).
function mapBaseOf(L) {
  const d = Game.dive, f = mapFloorOf(L), G = d.litGs ? d.litGs[L] : d.litG, key = `${L}/${d.vSig}/${f.w}`;
  const B = MapView.bases || (MapView.bases = {});
  if (B[L] && B[L].key === key) return B[L];
  const [cv, g] = makeCanvas(f.w, f.h), img = g.createImageData(f.w, f.h), px = new Uint32Array(img.data.buffer), fade = T.star.lightFade;
  const u32 = (rgb) => ((255 << 24) | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0]) >>> 0;
  const lit = ['#5a4418', '#8c6a26', '#c49a3a', '#e8c060'].map((h) => u32(rgbOf(h))), litRock = u32(rgbOf('#3a2c14'));
  // each region's ground and rock in its own colours, darkened for the dark
  const looks = (f.regions || [null]).map((r) => { const b = r ? climeBaseLook(f, r.clime) : artBiome(f); return { open: u32(rgbOf(mix(b.floor[2], '#000000', L ? 0.15 : 0.4))), rock: u32(rgbOf(mix(b.rock[2], L ? '#ffffff' : '#000000', L ? 0.12 : 0.45))) }; });
  for (let i = 0; i < f.w * f.h; i++) {
    const solid = TILE_SOLID[f.tiles[i]], lk = looks[f.regions ? f.climeIdx[i] : 0];
    let c = solid ? lk.rock : lk.open;
    if (G) { const k = clamp(1 - G[i] / fade, 0, 1); if (k > 0) c = solid ? litRock : lit[Math.min(3, Math.floor(k * 3.99))]; }
    px[i] = c;
  }
  g.putImageData(img, 0, 0);
  return (B[L] = { cv, px, key });
}
function mapBase() { return mapBaseOf(MapView.layer).cv; }

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
    for (const q of d.thread.pts.concat(d.hold ? [] : [[d.p.x, d.p.y, d.layer | 0]])) { if ((q[2] | 0) !== L) { pen = false; continue; } const [x, y] = at(q[0], q[1]); if (pen) g.lineTo(x, y); else g.moveTo(x, y); pen = true; }
    g.stroke(); g.setLineDash([]);
  }
  // the light running the veins to the node he's travelling to
  if (MapView.trip) mapDrawTrip(g, at, k, s);
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
    const sub = i === 0 ? 'The middle of the world' : `${far} strides from the star · ${n.l ? 'the Deep' : 'the surface'}`;
    if (MapView.trip && MapView.trip.to === i) card = `<div class="row static on map-card"><span class="row-text"><span class="row-name">${esc(name)}</span><span class="row-sub">The light carries you along the veins…</span></span></div>`;
    else card = `<div class="row static on map-card"><span class="row-text"><span class="row-name">${esc(name)}${where ? ` <span class="r-legendary">· ${esc(where)}</span>` : ''}</span><span class="row-sub">${esc(sub)}${why ? ` · ${esc(why)}` : ''}</span></span><button class="mini" data-act="mapCancel">BACK</button><button class="mini go${why ? '' : ' primary'}" data-act="mapGo"${why ? ' disabled' : ''}>TRAVEL THERE ➜</button></div>`;
  } else card = `<p class="note center">Tap a lit node to travel there along the veins. Pinch to zoom.</p>`;
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
    MapView.layer = d.layer | 0; MapView.sel = -1; MapView.trip = null;
    if (!MapView.z || MapView.z === 1) { const f = mapFloor(); MapView.cx = f.w / 2; MapView.cy = f.h / 2; }
  }
  mapDrawCanvas();
  mapBody();
}
// The tabs and the card's buttons (ui.js UI.acts).
function mapLayerSet(l) { MapView.layer = +l; MapView.sel = -1; const f = mapFloor(); MapView.cx = clamp(MapView.cx, 0, f.w); MapView.cy = clamp(MapView.cy, 0, f.h); mapDrawCanvas(); mapBody(); }
// TRAVEL THERE: the light runs the veins from where he stands to the node
// (mapTripPath), over the map, and when it arrives so does he.
function mapGo() {
  const d = Game.dive, i = MapView.sel, V = veinsState();
  if (i < 0 || MapView.trip) return;
  const n = V.nodes[i];
  if (!n || !d.vLive[i] || d.thread || d.hold) { UI.toast(d.thread ? 'Not with the thread in hand' : d.hold ? 'Not while the hold runs' : "Can't stand there"); return; }
  const pts = mapTripPath(d, i), M = T.map.trip;
  let len = 0;
  const cum = [0];
  for (let k = 1; k < pts.length; k++) { len += (pts[k][2] | 0) === (pts[k - 1][2] | 0) ? Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]) : 0; cum.push(len); }
  MapView.trip = { to: i, pts, cum, len, t0: performance.now(), dur: clamp(len / TILE / M.speed, M.min, M.max) * 1000 };
  // the map framed on the way
  const f = mapFloor();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x / TILE); y0 = Math.min(y0, y / TILE); x1 = Math.max(x1, x / TILE); y1 = Math.max(y1, y / TILE); }
  MapView.z = clamp(Math.min(f.w / (x1 - x0 + 24), f.h / (y1 - y0 + 24)), 1, 8);
  MapView.cx = (x0 + x1) / 2; MapView.cy = (y0 + y1) / 2;
  mapClampView();
  snd('starFeedStart', {});
  mapBody();
  mapTripFrame();
}
// The light's way: from where he stands to the nearest point of the living
// light on his layer (a node, or a point along a vein), then the shortest
// way through the living veins to the node. [[x, y, l]…].
function mapTripPath(d, to) {
  const V = veinsState(), live = d.vLive, L = d.layer | 0, p = d.p;
  // the nearest living node, or point on a living vein, on his layer
  let near = { d: Infinity, node: -1, vein: null, i: 0, u: 0, x: p.x, y: p.y };
  for (let i = 0; i < V.nodes.length; i++) { const n = V.nodes[i]; if (!live[i] || (n.l | 0) !== L) continue; const m = dist(p.x, p.y, n.x, n.y); if (m < near.d) near = { d: m, node: i, vein: null, i: 0, u: 0, x: n.x, y: n.y }; }
  for (const v of V.veins) {
    if (!veinLiving(live, v)) continue;
    for (let i = 1; i < v.pts.length; i++) {
      if (!veinSegOn(v.pts, i, L)) continue;
      const [ax, ay] = v.pts[i - 1], [bx, by] = v.pts[i], dx = bx - ax, dy = by - ay, LL = dx * dx + dy * dy || 1;
      const u = clamp(((p.x - ax) * dx + (p.y - ay) * dy) / LL, 0, 1), x = ax + dx * u, y = ay + dy * u, m = dist(p.x, p.y, x, y);
      if (m < near.d - 0.01) near = { d: m, node: -1, vein: v, i, u, x, y };
    }
  }
  // the shortest way through the graph: from the node he's at, or from
  // both ends of the vein he's by
  const N = V.nodes.length, best = new Array(N).fill(Infinity), via = new Array(N).fill(null), done = new Array(N).fill(false);
  const segLen = (P, a, b) => { let m = 0; for (let k = a + 1; k <= b; k++) if ((P[k][2] | 0) === (P[k - 1][2] | 0)) m += Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]); return m; };
  let head = [];
  if (near.node >= 0) { best[near.node] = 0; head = [[near.x, near.y, L]]; }
  else if (near.vein) {
    const v = near.vein, P = v.pts, at = [near.x, near.y, L], toA = P.slice(0, near.i).reverse(), toB = P.slice(near.i);
    const la = segLen([at].concat(toA), 0, toA.length), lb = segLen([at].concat(toB), 0, toB.length);
    best[v.a] = la; via[v.a] = { from: -1, pts: [at].concat(toA) };
    best[v.b] = lb; via[v.b] = { from: -1, pts: [at].concat(toB) };
    head = [[p.x, p.y, L]];
  } else return [[p.x, p.y, L], [V.nodes[to].x, V.nodes[to].y, V.nodes[to].l | 0]];
  for (;;) {
    let k = -1;
    for (let i = 0; i < N; i++) if (!done[i] && best[i] < Infinity && (k < 0 || best[i] < best[k])) k = i;
    if (k < 0 || k === to) break;
    done[k] = true;
    for (const v of V.veins) {
      if (!veinLiving(live, v) || (v.a !== k && v.b !== k)) continue;
      const o = v.a === k ? v.b : v.a, m = best[k] + v.len;
      if (m < best[o]) { best[o] = m; via[o] = { from: k, pts: v.a === k ? v.pts : v.pts.slice().reverse() }; }
    }
  }
  if (best[to] === Infinity) return [[p.x, p.y, L], [V.nodes[to].x, V.nodes[to].y, V.nodes[to].l | 0]];
  const legs = [];
  for (let i = to; via[i]; i = via[i].from) legs.unshift(via[i].pts);
  legs.unshift([[p.x, p.y, L], [near.x, near.y, L]]);
  return legs.flat();
}
function mapTripFrame() {
  const R = MapView.trip;
  if (!R) return;
  if (UI.screen !== 'screen-map') { MapView.trip = null; return; }
  const u = clamp((performance.now() - R.t0) / R.dur, 0, 1);
  // the view follows the light when zoomed in, and the layer it's on
  const at = mapTripAt(R, u);
  if ((at[2] | 0) !== MapView.layer) { MapView.layer = at[2] | 0; mapClampView(); }
  mapDrawCanvas();
  if (u >= 1) { mapTripArrive(); return; }
  requestAnimationFrame(mapTripFrame);
}
// Where along the way the light is at u (0..1, eased in and out).
function mapTripAt(R, u) {
  const e = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u), m = e * R.len, P = R.pts, C = R.cum;
  let i = 1;
  while (i < P.length - 1 && C[i] < m) i++;
  const a = P[i - 1], b = P[i], seg = C[i] - C[i - 1], t = seg > 0 ? clamp((m - C[i - 1]) / seg, 0, 1) : 1;
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), b[2] | 0];
}
function mapTripArrive() {
  const d = Game.dive, R = MapView.trip, i = R ? R.to : -1;
  MapView.trip = null;
  if (i < 0) return;
  if (veinsTravel(d, i)) { UI.close(); UI.toast(i === 0 ? 'At the star' : 'At the node'); MapView.sel = -1; }
  else { UI.toast("Can't stand there"); mapBody(); }
}
// The light on the map: the way behind it brightened, a head with a tail
// of a few beads, and a glow.
function mapDrawTrip(g, at, k, s) {
  const R = MapView.trip, L = MapView.layer, u = clamp((performance.now() - R.t0) / R.dur, 0, 1), head = mapTripAt(R, u), m = (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u)) * R.len;
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath();
  let pen = false;
  for (let i = 0; i < R.pts.length && R.cum[i] <= m; i++) { const q = R.pts[i]; if ((q[2] | 0) !== L) { pen = false; continue; } const [x, y] = at(q[0], q[1]); if (pen) g.lineTo(x, y); else g.moveTo(x, y); pen = true; }
  if ((head[2] | 0) === L) { const [x, y] = at(head[0], head[1]); if (pen) g.lineTo(x, y); }
  // (a glow under a white core, so it reads over a lit vein)
  g.strokeStyle = 'rgba(255,211,77,0.45)'; g.lineWidth = Math.max(5 * k, s * 1.2); g.stroke();
  g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(1.8 * k, s * 0.4); g.stroke();
  if ((head[2] | 0) !== L) return;
  // the tail: beads back along the way
  for (let n = 1; n <= 6; n++) {
    const b = mapTripAt(R, Math.max(0, u - n * 0.012));
    if ((b[2] | 0) !== L) break;
    const [x, y] = at(b[0], b[1]);
    g.fillStyle = `rgba(255,226,138,${0.8 - n * 0.11})`; g.beginPath(); g.arc(x, y, (4 - n * 0.4) * k, 0, Math.PI * 2); g.fill();
  }
  const [x, y] = at(head[0], head[1]), r = 14 * k;
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, 'rgba(255,240,200,0.9)'); gr.addColorStop(0.35, 'rgba(255,211,77,0.45)'); gr.addColorStop(1, 'rgba(255,211,77,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y, 3.2 * k, 0, Math.PI * 2); g.fill();
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

// ---------------------------------------------------------------------------
// The minimap: the land round the Kindler in the view's top right corner,
// always, a pixel a tile (T.mini.tiles square), drawn as it's walked: what
// he's seen of each layer is kept in the save (seen[l], the tiles' bits
// packed), and the living light shows of itself. The ground in its
// region's colour, the lit land gold, the veins, the thread, the nodes,
// the shafts seen, the Kindler at the middle, and at the edge the way to
// the nearest living light when it's off the map.
// ---------------------------------------------------------------------------
const Mini = { cv: null, g: null, key: '', lookT: 0, saveT: 0, dirty: false };
// What's been seen of layer l: a bit a tile.
function miniSeen(d, l = d.layer | 0) {
  const f = mapFloorOf(l), n = Math.ceil((f.w * f.h) / 8);
  d.seenGs = d.seenGs || [];
  let S = d.seenGs[l];
  if (S && S.length === n) return S;
  S = new Uint8Array(n);
  const raw = Save.data.seen && Save.data.seen[l];
  if (typeof raw === 'string') { try { const b = atob(raw); for (let i = 0; i < Math.min(n, b.length); i++) S[i] = b.charCodeAt(i); } catch (e) { /* unread: seen again by walking */ } }
  d.seenGs[l] = S;
  return S;
}
const miniSeenAt = (S, i) => (S[i >> 3] >> (i & 7)) & 1;
function miniSeenPack(S) { let s = ''; for (let i = 0; i < S.length; i += 4096) s += String.fromCharCode.apply(null, S.subarray(i, i + 4096)); return btoa(s); }
// Each step: what's round him is seen (every T.mini.every s), and the save
// keeps it now and then (T.mini.save s).
function miniStep(d, dt) {
  const M = T.mini, f = d.floor;
  if (!d.litG) return;
  if ((Mini.lookT -= dt) <= 0) {
    Mini.lookT = M.every;
    const S = miniSeen(d), R = M.sight, tx = Math.floor(d.p.x / TILE), ty = Math.floor(d.p.y / TILE);
    for (let y = Math.max(0, ty - R); y <= Math.min(f.h - 1, ty + R); y++)
      for (let x = Math.max(0, tx - R); x <= Math.min(f.w - 1, tx + R); x++)
        if ((x - tx) * (x - tx) + (y - ty) * (y - ty) <= R * R) { const i = y * f.w + x; S[i >> 3] |= 1 << (i & 7); }
    Mini.dirty = true; Mini.key = '';
  }
  if (Mini.dirty && (Mini.saveT -= dt) <= 0) { Mini.saveT = M.save; miniSave(d); }
}
function miniSave(d) {
  if (!d.seenGs) return;
  const s = Save.data;
  s.seen = Array.isArray(s.seen) ? s.seen : [];
  for (let l = 0; l < d.seenGs.length; l++) if (d.seenGs[l]) s.seen[l] = miniSeenPack(d.seenGs[l]);
  Save.saveField('seen');
  Mini.dirty = false;
}
// The picture, redrawn when he's moved a tile, the light changed, the
// thread grew or the ground was seen; the Kindler's blink is drawn over
// it each frame. Two px a tile (MINI_PX).
const MINI_PX = 2;
function miniPaint(d, x0, y0) {
  const M = T.mini, n = M.tiles, P = MINI_PX, W = n * P, L = d.layer | 0, f = d.floor, V = veinsState(), live = d.vLive, S = miniSeen(d), G = d.litG, base = mapBaseOf(L).px;
  if (!Mini.cv) { [Mini.cv, Mini.g] = makeCanvas(W, W); [Mini.tcv, Mini.tg] = makeCanvas(n, n); Mini.img = Mini.tg.createImageData(n, n); Mini.px = new Uint32Array(Mini.img.data.buffer); Mini.g.imageSmoothingEnabled = false; }
  const g = Mini.g, px = Mini.px, back = 0xe60a0806, out = 0xe6000000;
  // the ground: seen, or in the living light; the rest the dark
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const wx = x0 + x, wy = y0 + y;
    if (wx < 0 || wy < 0 || wx >= f.w || wy >= f.h) { px[y * n + x] = out; continue; }
    const i = wy * f.w + wx;
    px[y * n + x] = miniSeenAt(S, i) || (G && G[i] < 0) ? base[i] : back;
  }
  Mini.tg.putImageData(Mini.img, 0, 0);
  g.clearRect(0, 0, W, W);
  g.drawImage(Mini.tcv, 0, 0, W, W);
  const at = (x, y) => [(x / TILE - x0) * P, (y / TILE - y0) * P];
  // a line, in whole pixels: a dot each half tile along it (every other, dashed)
  const line = (pts, col, w, dashed) => {
    g.fillStyle = col;
    let k = 0;
    for (let i = 1; i < pts.length; i++) {
      if ((pts[i - 1][2] | 0) !== L || (pts[i][2] | 0) !== L) continue;
      const [ax, ay] = at(pts[i - 1][0], pts[i - 1][1]), [bx, by] = at(pts[i][0], pts[i][1]), len = Math.hypot(bx - ax, by - ay), m = Math.max(1, Math.ceil(len / (P * 0.5)));
      for (let j = 0; j <= m; j++, k++) { if (dashed && k % 4 >= 2) continue; const x = Math.round(ax + ((bx - ax) * j) / m), y = Math.round(ay + ((by - ay) * j) / m); if (x >= -w && y >= -w && x < W && y < W) g.fillRect(x, y, w, w); }
    }
  };
  for (const v of V.veins) line(v.pts, veinLiving(live, v) ? '#ffe28a' : v.cut ? '#a04040' : '#6a5a3a', veinLiving(live, v) ? 2 : 1, false);
  if (d.thread) line(d.thread.pts.concat(d.hold ? [] : [[d.p.x, d.p.y, L]]), '#ffd34d', 2, true);
  // a mark: a square with a dark edge
  const mark = (x, y, r, col) => { x = Math.round(x); y = Math.round(y); g.fillStyle = '#0a0806'; g.fillRect(x - r - 1, y - r - 1, 2 * r + 3, 2 * r + 3); g.fillStyle = col; g.fillRect(x - r, y - r, 2 * r + 1, 2 * r + 1); };
  // the shafts seen, the nodes (the star largest), the hold
  const shaftsSeen = Save.data.shaftsSeen || {};
  for (let i = 0; f.shafts && i < f.shafts.length; i++) { if (!shaftsSeen[i]) continue; const sh = f.shafts[i], [x, y] = at((sh.x + 0.5) * TILE, (sh.y + 0.5) * TILE); mark(x, y, 1, '#9ab0d0'); g.fillStyle = '#07060a'; g.fillRect(Math.round(x), Math.round(y), 1, 1); }
  for (let i = 0; i < V.nodes.length; i++) {
    const nd = V.nodes[i];
    if ((nd.l | 0) !== L) continue;
    const [x, y] = at(nd.x, nd.y);
    if (i === 0) { const sx = Math.round(x), sy = Math.round(y); g.fillStyle = '#0a0806'; g.fillRect(sx - 3, sy - 2, 7, 5); g.fillRect(sx - 2, sy - 3, 5, 7); g.fillStyle = '#fff7dc'; g.fillRect(sx - 2, sy - 1, 5, 3); g.fillRect(sx - 1, sy - 2, 3, 5); }
    else mark(x, y, 1, live[i] ? '#ffd34d' : '#a04040');
  }
  if (d.hold) { const [x, y] = at(d.hold.x, d.hold.y); mark(x, y, 1, Math.sin(Game.realT * 6) > 0 ? '#fff7dc' : '#ffd34d'); }
  // the way to the nearest living light when it's off the map
  const near = veinsNearestLiving(d, d.p.x, d.p.y), nd = V.nodes[near.i];
  if (nd && (nd.l | 0) === L) {
    const [x, y] = at(nd.x, nd.y), h = W / 2;
    if (x < 0 || y < 0 || x >= W || y >= W) {
      const dx = x - h, dy = y - h, k = Math.max(Math.abs(dx), Math.abs(dy)) / (h - 4);
      mark(h + dx / k, h + dy / k, 1, '#ffd34d');
    }
  }
  // the frame
  g.fillStyle = '#4a4438'; g.fillRect(0, 0, W, 1); g.fillRect(0, W - 1, W, 1); g.fillRect(0, 0, 1, W); g.fillRect(W - 1, 0, 1, W);
  // (on the GPU, a texture of its own, uploaded now: painted this often it
  // would fill the atlas with dead pictures and have it rebuilt)
  if (Gpu.on) { Mini.cv.gpuOwn = true; gpuOwnTex(Mini.cv, g.getImageData(0, 0, W, W), 0, W); } else gpuDirty(Mini.cv);
}
// Each frame, on the overlay (render.js): the picture, and the Kindler
// blinking at its middle.
function miniDraw(d, o) {
  if (!d.litG || Intro.on || Game.modal) return;
  const M = T.mini, n = M.tiles, W = n * MINI_PX, cx = Math.round(d.p.x / TILE - 0.5), cy = Math.round(d.p.y / TILE - 0.5), x0 = cx - (n >> 1), y0 = cy - (n >> 1);
  const key = `${d.layer | 0}/${d.vSig}/${x0}/${y0}/${d.thread ? d.thread.pts.length : 0}/${d.hold ? Math.floor(Game.realT * 2) : 0}`;
  if (Mini.key !== key) { miniPaint(d, x0, y0); Mini.key = key; }
  const X = View.w - W * AF - 4 * AF, Y = 4 * AF, mx = X + (W >> 1) * AF, my = Y + (W >> 1) * AF;
  o.drawImage(Mini.cv, X, Y, W * AF, W * AF);
  if (Math.sin(Game.realT * 8) > -0.3) {
    o.fillStyle = '#0a0806'; o.fillRect(mx - 2 * AF, my - 2 * AF, 5 * AF, 5 * AF);
    o.fillStyle = '#8fc4ff'; o.fillRect(mx - AF, my - AF, 3 * AF, 3 * AF);
  }
}
