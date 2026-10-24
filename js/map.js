'use strict';
// ---------------------------------------------------------------------------
// The map (DESIGN.md, The star's screen): the world as the light has
// reached it. One canvas, a pixel a tile: the open ground, the rock, the
// lit land in gold, the veins and nodes, the Kindler. Tap a living node to
// stand there (the veins are lit and quiet, so the walk is spared). From
// MAP in the top bar.
// ---------------------------------------------------------------------------

function drawMap() {
  const d = Game.dive;
  if (!d) return;
  const f = d.floor, cv = $('map-cv'), w = f.w, h = f.h;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const g = cv.getContext('2d'), img = g.createImageData(w, h), px = new Uint32Array(img.data.buffer), G = d.litG;
  const u32 = (hex, a = 255) => { const [r, gg, b] = rgbOf(hex); return ((a << 24) | (b << 16) | (gg << 8) | r) >>> 0; };
  const rock = u32('#1a1518'), open = u32('#2b2328'), lit = [u32('#5a4418'), u32('#8c6a26'), u32('#c49a3a'), u32('#e8c060')], fade = T.star.lightFade;
  for (let i = 0; i < w * h; i++) {
    const solid = TILE_SOLID[f.tiles[i]];
    let c = solid ? rock : open;
    if (G) { const k = clamp(1 - G[i] / fade, 0, 1); if (k > 0) c = solid ? u32('#3a2c14', 255) : lit[Math.min(3, Math.floor(k * 3.99))]; }
    px[i] = c;
  }
  g.putImageData(img, 0, 0);
  // the veins and the nodes
  const V = veinsState(), live = d.vLive;
  g.lineWidth = 1;
  for (const v of V.veins) {
    g.strokeStyle = veinLiving(live, v) ? '#ffe28a' : v.cut ? '#8a3a3a' : '#6a5a3a';
    g.beginPath();
    v.pts.forEach(([x, y], i) => { const tx = x / TILE, ty = y / TILE; if (i) g.lineTo(tx, ty); else g.moveTo(tx, ty); });
    g.stroke();
  }
  for (let i = 0; i < V.nodes.length; i++) {
    const n = V.nodes[i], x = Math.round(n.x / TILE), y = Math.round(n.y / TILE);
    if (n.old && !live[i]) { g.strokeStyle = '#8f7bd6'; g.strokeRect(x - 1.5, y - 1.5, 4, 4); continue; }
    g.fillStyle = i === 0 ? '#fff7dc' : live[i] ? '#ffd34d' : '#7a6a4a'; g.fillRect(x - 1, y - 1, 3, 3);
  }
  // the Kindler
  g.fillStyle = '#8fc4ff'; g.fillRect(Math.round(d.p.x / TILE) - 1, Math.round(d.p.y / TILE) - 1, 3, 3);
  const mag = magnitudeOf(), A = T.magnitude.at, next = A[mag] !== undefined ? ` · ${Math.max(0, Math.ceil(A[mag] - (d.vWorth || 0)))} strides to magnitude ${mag + 1}` : '';
  const cuts = V.veins.filter((v) => v.cut).length, S = T.story;
  const olds = V.nodes.filter((n, i) => n.old && !live[i]).length, set = V.nodes.filter((n, i) => i && !n.old).length;
  $('map-body').innerHTML = `<p class="note center">The light reaches ${Math.round(d.vWorth || 0)} strides · magnitude ${mag}${esc(next)}</p><p class="note center">Tap a lit node to stand there. ${set} node${set === 1 ? '' : 's'} set${cuts ? `, ${cuts} vein${cuts > 1 ? 's' : ''} cut` : ''}${olds ? `, ${olds} old node${olds > 1 ? 's' : ''} dark (the violet marks)` : ''}.</p>`
    + shapesHtml()
    + `<h3>WICK</h3><p class="note">The star's core: ${Save.data.core} of ${T.star.core}. Above, the Meridian: ${S.sleepers} asleep until the world lives.</p><div class="menu"><button class="btn quiet" data-act="replayIntro">THE LANDING AGAIN</button></div>`;
}

// A tap on the map: the living node nearest it, if one is near.
function mapTap(e) {
  const d = Game.dive;
  if (!d || Game.realT - UI.openedAt < T.ui.tapGuard) return;
  const cv = $('map-cv'), r = cv.getBoundingClientRect(), tx = ((e.clientX - r.left) / r.width) * cv.width, ty = ((e.clientY - r.top) / r.height) * cv.height;
  const V = veinsState();
  let best = -1, bd = 7;
  for (let i = 0; i < V.nodes.length; i++) { const m = Math.hypot(V.nodes[i].x / TILE - tx, V.nodes[i].y / TILE - ty); if (m < bd && d.vLive[i]) { bd = m; best = i; } }
  if (best < 0) return;
  if (veinsTravel(d, best)) { snd('tap'); UI.close(); UI.toast(best === 0 ? 'At the star' : 'At the node'); }
  else UI.toast(d.thread ? 'Not with the thread in hand' : d.hold ? 'Not while the hold runs' : "Can't stand there");
}
