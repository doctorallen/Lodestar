'use strict';
// ---------------------------------------------------------------------------
// The world map: the SET OUT screen at the outpost's portal, and TRAVEL at a
// spire. The world (world.js) drawn in pixel art, one map px for every
// layout px, scaled up by whole device pixels: each territory in its
// clime's colours, kindled ones lit and ringed in gold, dark ones dimmed,
// the Edge unknown until walked, and lodelines running from the star to
// each spire. A tap on a territory shows its card below; the card says
// what's there and where the diver can go from here.
//
// The map's ground is worked out once for a world (its texture) and again
// only when a territory changes state; each frame then lays that down and
// draws the lodelines and marks over it, a few times a second.
// ---------------------------------------------------------------------------

const MAP_CLIMES = {
  home: ['#d9a062', '#c88d52'], badlands: ['#c98448', '#b06f3b'], bloomfen: ['#66733a', '#525e2d'],
  frost: ['#c3c1de', '#a9a7cb'], cinder: ['#4e3a34', '#3e2e2a'],
};
const MAP_INK = '#0b0912', MAP_DARK = '#151224', MAP_FOG = '#2c2347', MAP_GOLD = '#f3c35b';
const MAP_GOAL_TEXT = {
  waystones: ['Light the waystones', 'Light three old waystones, then hold the last in its light for a while as the dark comes.'],
  rift: ['Seal the tear', 'A rift sits on the heart of this land. Seal it, early and safe or late and rich.'],
};
// 3 × 5 marks: a goal, the unknown
const MAP_MARKS = {
  waystones: ['.....', 'g.g.g', 'g.g.g', '.....'],
  rift: ['...m.', '..m..', '.mc..', '.m...'],
  unknown: ['.qq.', '...q', '..q.', '....', '..q.'],
};
const MAP_MARK_COLS = { g: '#d8d0ee', m: '#ff5ad8', c: '#7ff3ff', q: '#7b6aa8' };

const WorldMapView = { base: null, key: '', tex: null, texSeed: null, raf: 0, frame: 0, bound: false };

// The texture of the ground, for a world: two tones in clusters, fog over
// dark land, an ember now and then in the ash.
function mapTexture(L) {
  if (WorldMapView.texSeed === L.seed) return WorldMapView.tex;
  const M = L.M, tone = new Uint8Array(M * M), fog = new Uint8Array(M * M), spark = new Uint8Array(M * M), s = hashInts(L.seed, 0x7e47);
  for (let y = 0; y < M; y++)
    for (let x = 0; x < M; x++) {
      const i = y * M + x;
      tone[i] = worldNoise(x / 4.2, y / 4.2, s) + (worldNoise(x / 1.7, y / 1.7, s + 1) - 0.5) * 0.25 > 0.55 ? 1 : 0;
      fog[i] = worldNoise(x / 6, y / 6, s + 2) > 0.62 ? 1 : 0;
      spark[i] = (hashInts(x, y, s + 3) & 255) < 7 ? 1 : 0;
    }
  WorldMapView.texSeed = L.seed;
  return (WorldMapView.tex = { tone, fog, spark });
}

// The map's ground for the world as it stands, kept until a state changes.
function mapBase(L) {
  const key = L.seed + ':' + L.terrs.map((t) => terrStateWord(t.id)[0] + ((terrPeek(t.id) || {}).visits ? 1 : 0)).join('');
  if (WorldMapView.key === key && WorldMapView.base) return WorldMapView.base;
  const M = L.M, img = new ImageData(M, M), px = img.data, tex = mapTexture(L), id = L.idMap;
  const state = L.terrs.map((t) => terrStateWord(t.id)), seen = L.terrs.map((t) => t.home || !t.edge || !!(terrPeek(t.id) || {}).visits);
  const lit = state.map((s) => s === 'kindled' || s === 'home');
  const mixRgb = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const ink = rgbOf(MAP_INK), dark = rgbOf(MAP_DARK), fog = rgbOf(MAP_FOG), gold = rgbOf(MAP_GOLD);
  for (let y = 0; y < M; y++)
    for (let x = 0; x < M; x++) {
      const i = y * M + x, a = id[i];
      let c;
      if (a < 0) c = ink;
      else {
        const t = L.terrs[a], cols = MAP_CLIMES[t.home ? 'home' : t.clime] || MAP_CLIMES.badlands;
        c = rgbOf(cols[tex.tone[i]]);
        if (t.clime === 'cinder' && tex.spark[i] && seen[a]) c = rgbOf('#ff7a3d');
        if (!seen[a]) { c = mixRgb(dark, ink, 0.3); if (tex.fog[i]) c = mixRgb(c, fog, 0.6); }
        else if (state[a] === 'dark') { c = mixRgb(c, dark, 0.7); if (tex.fog[i]) c = mixRgb(c, fog, 0.5); }
        else if (state[a] === 'contested') c = mixRgb(c, dark, 0.45);
        // borders: gold where lit land meets the dark
        const r = x + 1 < M ? id[i + 1] : -1, dn = y + 1 < M ? id[i + M] : -1;
        const o = r !== a ? r : dn !== a ? dn : a;
        if (o !== a) c = o < 0 ? ink : lit[a] !== lit[o] ? gold : lit[a] ? mixRgb(c, ink, 0.45) : ink;
      }
      px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2]; px[i * 4 + 3] = 255;
    }
  WorldMapView.key = key;
  return (WorldMapView.base = img);
}

// The canvas, at a whole number of device pixels to a map pixel.
function sizeWorldMap() {
  const cv = $('world-map'), L = worldMap(), M = L.M, dpr = window.devicePixelRatio || 1;
  if (cv.width !== M) { cv.width = M; cv.height = M; }
  // (held sideways, small enough that the card shows below it)
  const avail = Math.min(420, $('map-wrap').clientWidth || 360, Math.max(200, window.innerHeight * 0.6));
  const k = Math.max(1, Math.floor((avail * dpr) / M)), css = (k * M) / dpr + 'px';
  if (cv.style.width !== css) { cv.style.width = css; cv.style.height = css; }
  if (!WorldMapView.bound) {
    WorldMapView.bound = true;
    cv.addEventListener('click', (e) => {
      if (Game.realT - UI.openedAt < T.ui.tapGuard) return;
      const r = cv.getBoundingClientRect(), x = Math.floor(((e.clientX - r.left) * M) / r.width), y = Math.floor(((e.clientY - r.top) * M) / r.height);
      // (on the Lattice's layer, the nearest known gallery: lattice.js)
      if (UI.mapLayer === 'lattice') { const g = latticeNodeAt(x + 0.5, y + 0.5); if (g >= 0) { UI.mapSelLat = g; drawLatticeCard(); drawWorldMap(); } return; }
      const id = x >= 0 && y >= 0 && x < M && y < M ? worldMap().idMap[y * M + x] : -1;
      if (id >= 0) {
        UI.mapSel = id; drawMapCard(); drawWorldMap();
        // a card out of sight below the map is brought up into view
        const card = $('map-card'), cr = card.getBoundingClientRect();
        if (cr.top > window.innerHeight - 60 && card.scrollIntoView) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }
}

// One frame of the map: the ground, then what moves and the marks.
function drawWorldMap() {
  const cv = $('world-map'), L = worldMap(), M = L.M, x = cv.getContext('2d'), C = M / 2, fr = WorldMapView.frame;
  x.putImageData(mapBase(L), 0, 0);
  const px = (a, b, col) => { x.fillStyle = col; x.fillRect(Math.round(a), Math.round(b), 1, 1); };
  const at = (t) => [Math.round(t.cx), Math.round(t.cy)];
  // the Lattice's layer: the tunnels under the darkened land (lattice.js)
  if (UI.mapLayer === 'lattice') { drawLatticeMap(x, M, px, fr, Math.floor(fr / 3) % 2 === 0); return; }
  // lodelines from the star to each spire, a few pixels marching outwards
  for (const t of L.terrs) {
    if (t.home || !hasSpire(t.id)) continue;
    let [x0, y0] = [Math.round(C), Math.round(C)];
    const [x1, y1] = at(t), dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy, k = 0;
    for (;;) {
      if (k > 3) { if ((k - fr) % 5 === 0) px(x0, y0, '#fff3c4'); else if (k % 2 === 0) px(x0, y0, '#d9a440'); }
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
      k++;
    }
  }
  const on = Math.floor(fr / 3) % 2 === 0;
  for (const t of L.terrs) {
    const [cx, cy] = at(t), s = terrPeek(t.id) || {}, seen = !t.edge || s.visits;
    if (t.home) {
      // the Lodestar
      const D = ['...w...', '..wyw..', '.yyYyy.', 'yyYYYyy', '.yyYyy.', '..yoy..', '...o...'];
      D.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') px(cx - 3 + i, cy - 3 + j, { w: '#ffffff', y: '#f3c35b', Y: on ? '#fff6d5' : '#ffe7a0', o: '#b9802a' }[ch]); }));
      continue;
    }
    if (hasSpire(t.id)) {
      // a spire: dark stone, a gold tip
      for (let j = 0; j < 5; j++) { px(cx - 1, cy - j, '#2a2638'); px(cx, cy - j, '#3d3852'); }
      px(cx, cy - 2, '#f3c35b'); px(cx - 1, cy - 5, '#f3c35b'); px(cx, cy - 5, '#fff3c4'); px(cx, cy - 6, '#f3c35b');
    } else if (s.state === 'contested') {
      const c = on ? '#ff5ad8' : '#f3c35b';
      for (let j = 0; j < 6; j++) px(cx, cy - j, '#d9d2ee');
      for (const [i, j] of [[1, 5], [2, 5], [3, 5], [1, 4], [2, 4]]) px(cx + i, cy - j, c);
    } else if (!isKindled(t.id)) {
      const mark = MAP_MARKS[seen && s.visits ? t.goal : !seen ? 'unknown' : null];
      if (mark) mark.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') px(cx - 2 + i, cy - 2 + j, MAP_MARK_COLS[ch]); }));
    }
  }
  // the pack a fall left (deeds.js)
  drawMapCache(px, at, on);
  // where the diver is, blinking
  const d = Game.dive;
  if (d && d.sortie && d.terr && on) { const [cx, cy] = at(L.terrs[d.terr]); for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) px(cx + 3 + i, cy + 1 + j, '#ffffff'); }
  // the chosen territory: a ring of marching dots round it
  const sel = L.terrs[UI.mapSel];
  if (sel) for (let a = 0; a < 18; a++) if ((a + fr) % 2) { const an = (a / 18) * Math.PI * 2 + fr * 0.06; px(sel.cx + Math.cos(an) * 9, sel.cy + Math.sin(an) * 7, '#ffffff'); }
}

// A few frames a second while the map is open.
function animateWorldMap() {
  cancelAnimationFrame(WorldMapView.raf);
  let last = 0;
  const tick = (now) => {
    if (UI.screen !== 'screen-setout') return;
    if (now - last > 140) { last = now; WorldMapView.frame++; try { drawWorldMap(); } catch (e) { noteError(e); return; } }
    WorldMapView.raf = requestAnimationFrame(tick);
  };
  WorldMapView.raf = requestAnimationFrame(tick);
}

// What lives in a territory, each with what it fears (▲) and shrugs off
// (▼, a bar for all but), in its clime (natures.js kindNatures): the
// clime's own creature first, then the kinds found everywhere. The cores
// are chosen at the locker, so the map is where this has to be read.
const MAP_COMMON_KINDS = ['crawler', 'wisp', 'construct', 'snapjaw', 'spitter'];
function mapFaunaRows(t) {
  const sig = foeOfClime(t.clime), kinds = (sig ? [sig] : []).concat(MAP_COMMON_KINDS);
  const glyph = { W: '▲', R: '▼', I: '▬' };
  return kinds.map((k) => {
    // (a filled pill in the element's colour with dark text: coloured text
    // on the dark card was hard to read)
    const nat = kindNatures(k, t.clime, null).slice(0, 3).map((m) => `<b class="${m.v === 'W' ? 'w' : 'r'}" style="background:${NATURE_COLS[m.el]}">${glyph[m.v]} ${esc(CIRCUIT_ELEMENTS[m.el].name)}</b>`).join('');
    return `<div class="fauna"><span class="fname">${esc(foeWord(k))}</span><span class="nat">${nat || '<b class="r">—</b>'}</span></div>`;
  }).join('');
}

// The chosen territory's card, and where the diver can go from here.
function drawMapCard() {
  const L = worldMap(), t = L.terrs[UI.mapSel] || L.terrs[0], s = terrPeek(t.id) || {}, d = Game.dive, mode = UI.mapMode;
  const word = terrStateWord(t.id), seen = !t.edge || s.visits;
  const pill = `<span class="pill ${seen ? word : 'edge'}">${seen ? word.toUpperCase() : 'UNKNOWN'}</span>`;
  const row = (a, b) => `<div class="trow"><span>${a}</span><span>${b}</span></div>`;
  let h = `<div class="nm">${esc(t.name.toUpperCase())}</div><div class="sub">${t.home ? 'Ring 0 · home' : `Ring ${t.ring} · ${esc(seen ? climeName(t.clime) : 'beyond the light')}`}${pill}</div>`;
  if (t.home) h += `<div class="goal">Home. Every station is here.</div>`;
  else if (!seen) h += `<div class="goal">Unknown until walked.</div>` + row('ENEMIES', `level ${terrLevel(t)}+`);
  else {
    const ores = T.biomes[t.biome].ores.map((id) => T.ores[ORE_INDEX[id]].name).join(', ');
    // (in dark land the dark has grown with the star: frontier.js darkLevelFloor)
    const grown = word !== 'kindled' && darkLevelFloor() > terrLevel(t);
    h += row('ENEMIES', `level ${grown ? darkLevelFloor() : terrLevel(t)}${grown ? ' · the dark has grown' : ''}`) + mapFaunaRows(t) + row('ORE', ores + (t.edge ? ' (rich)' : ''));
    const g = MAP_GOAL_TEXT[t.goal];
    if (s.starter) h += `<div class="goal"><b>Kindled</b> by the outpost's own spire.</div>`;
    else if (word === 'kindled') h += `<div class="goal"><b>Kindled.</b> Its spire banks and travels.</div>`;
    else if (!s.visits) h += row('HEART GOAL', 'unknown');
    else {
      const prog = s.done ? 'Done: plant the spire.' : t.goal === 'waystones' ? `${(s.lit || []).length}/3 lit` : '';
      h += `<div class="goal"><b>To kindle: ${esc(g[0])}</b>${prog ? ` · <span class="r-legendary">${prog}</span>` : ''}</div>` + row('THEN', `plant the spire (${T.world.plant} s)`);
    }
    if (s.visits && t.deep) h += row('A DEEP', `a hole down, ${t.deep} site${t.deep > 1 ? 's' : ''}${deepZone(t, t.deep) === 'lair' ? ", the Keeper's Lair at the bottom" : deepReached(t.id) && galleryUnder(t.id) >= 0 ? ', a cleft into the Lattice at the bottom' : ''}`);
    // what its deeds would give the star (deeds.js)
    if (word !== 'kindled' && !s.starter) h += row('KINDLING IT', `+${heartLightFor(t)} heartlight${starHoldsSpire(t.id) ? '' : ` · its spire needs magnitude ${spireMagFor(t.id)}`}`);
    if (s.visits && t.deep) h += row('ITS DEEP\'S END', deepReached(t.id) ? 'reached' : `+${deepLightFor(t)} deeplight, the first time`);
  }
  // the pack a fall left here
  const pack = Save.data.cache;
  if (pack && pack.terr === t.id) h += `<div class="goal"><b class="r-legendary">YOUR PACK</b> is here${pack.lat >= 0 ? ', in the Lattice beneath' : pack.site ? `, in its Deep (site ${pack.site})` : ''}.</div>`;
  const btns = [];
  if (mode === 'travel') {
    if (d && d.terr === t.id && !(d.lat !== null && d.lat !== undefined)) btns.push('<p class="note">You are here.</p>');
    else if (t.home) btns.push('<button class="btn primary" data-act="travelTo" data-arg="0">TRAVEL HOME</button>');
    else if (hasSpire(t.id)) btns.push(`<button class="btn primary" data-act="travelTo" data-arg="${t.id}">TRAVEL TO ITS SPIRE</button>`);
  } else {
    if (!t.home && hasSpire(t.id)) btns.push(`<button class="btn primary" data-act="setOutSpire" data-arg="${t.id}">SET OUT TO ITS SPIRE</button>`);
    // only land that borders the outpost's can be walked out into (most of
    // ring 1, but now and then a cell squeezes between two others)
    if (t.nb.includes(0)) btns.push(`<button class="btn ${hasSpire(t.id) ? '' : 'primary'}" data-act="setOutWalk" data-arg="${t.id}">WALK OUT INTO IT</button>`);
  }
  if (!btns.length && !t.home) btns.push(`<p class="note">${mode === 'travel' ? 'No spire here yet.' : 'Reach it on foot.'}</p>`);
  $('map-card').innerHTML = `<div class="tcard">${h}${btns.length ? `<div class="menu">${btns.join('')}</div>` : ''}</div>`;
}

// The screen: the map, its card, and at the outpost what's next (one goal),
// the tool to carry and the tools.
function drawSetOut() {
  const s = Save.data, travel = UI.mapMode === 'travel';
  $('setout-title').textContent = travel ? 'TRAVEL' : 'SET OUT';
  // the Lattice's layer, once a gallery has been walked (lattice.js); the
  // map opens on it from down there
  const lay = $('map-layers'), known = latticeKnown(), d = Game.dive, inLat = d && d.sortie && d.lat !== null && d.lat !== undefined;
  if (!known) UI.mapLayer = 'surface';
  else if (UI.mapLayer === undefined || UI.openedLayer !== UI.openedAt) { UI.mapLayer = inLat ? 'lattice' : 'surface'; UI.openedLayer = UI.openedAt; if (inLat) UI.mapSelLat = d.lat; }
  lay.hidden = !known;
  if (known) lay.innerHTML = [['surface', 'THE SURFACE'], ['lattice', 'THE LATTICE']].map(([k, w]) => `<button class="chip ${UI.mapLayer === k ? 'on' : ''}" data-act="mapLayer" data-arg="${k}">${w}</button>`).join('');
  sizeWorldMap();
  drawWorldMap();
  if (UI.mapLayer === 'lattice') drawLatticeCard(); else drawMapCard();
  animateWorldMap();
  if (travel) { $('setout-body').innerHTML = `<p class="note">Tap a spire, or the star for home. Your cargo banks first.</p>`; return; }
  // (the tools wake at magnitude 2: onboard.js; each made is always on)
  $('setout-body').innerHTML = nextGoalHtml() + (onboardHas('tools') ? drawToolRows() : '');
}

// At home, what's next over the view (#hud-goal), a line. True if shown.
// (worked out twice a second, not every frame)
function drawNextHud() {
  if (Intro.on || Intro.hub) return false;
  const el = $('hud-goal');
  if (!(Game.realT < (el.nextAt || 0) && el.dataset.next)) {
    el.nextAt = Game.realT + 0.5;
    const html = `<b>NEXT</b><div>${esc(nextGoal())}</div>`;
    if (el.dataset.html !== html) { el.dataset.html = html; el.innerHTML = html; }
    el.dataset.next = '1';
  }
  return true;
}

// The heart goal over the view, in dark land (#hud-goal). True if shown.
function drawGoalHud(d) {
  const lines = goalLines(d);
  if (!lines) return false;
  const marks = lines.filter((l) => '◆◇◈'.includes(l[0])), done = marks.filter((l) => l[0] === '◆').length;
  const html = `<b>${d.lat !== null && d.lat !== undefined ? 'THE LATTICE' : 'TO KINDLE'}${marks.length ? `<span class="sum">${done}/${marks.length}</span>` : ''}</b>` + lines.map((l) => `<div class="${l[0] === '◆' ? 'done' : l[0] === '◇' || l[0] === '◈' ? '' : 'dim'}">${esc(l)}</div>`).join('');
  const el = $('hud-goal');
  el.dataset.next = '';
  if (el.dataset.html !== html) { el.dataset.html = html; el.innerHTML = html; }
  return true;
}

Object.assign(UI.acts, {
  setOutSpire: (id) => { UI.close(); startSortie({ terr: Number(id), spire: true }); },
  setOutWalk: (id) => { UI.close(); startSortie({ terr: Number(id), from: 0 }); },
  // (a relit cold spire in the Lattice is 'L' and its gallery: lattice.js)
  travelTo: (id) => { UI.close(); travelFrom(Game.dive, isLatSpire(id) ? id : Number(id)); },
  setOutLat: (id) => { UI.close(); startSortie({ lat: Number(id), spire: true }); },
  mapLayer: (layer) => { UI.mapLayer = layer; drawSetOut(); },
});
