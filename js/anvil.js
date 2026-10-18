'use strict';
// ---------------------------------------------------------------------------
// The anvil, and the reveal. Forging is three hammer strikes: a marker
// sweeps a bar, faster each strike, and a tap strikes. In the glowing zone
// is good, dead in its middle perfect. The strikes add up to a quality
// (0–3) that shifts the rarity odds (T.anvil.odds), so a perfect forge can
// even come out legendary; for a core, a good forge raises its tier. Then
// the piece rises from the anvil in its rarity's light (Reveal), and its
// card opens. The ingot glows hotter with every strike.
// ---------------------------------------------------------------------------

const ANVIL_W = 120, ANVIL_H = 84;
const ANVIL_ROWS = [
  '..WWWWWWWWWWWWWWWWWWWW....',
  'WWWWWWWWWWWWWWWWWWWWWWWWW.',
  '.wWWWWWWWWWWWWWWWWWWWWWw..',
  '.....wwwwwwwwwwwwwww......',
  '.......wwwwwwwwwww........',
  '.......wwwwwwwwwww........',
  '......wwwwwwwwwwwww.......',
  '....wwwwwwwwwwwwwwwww.....',
];

const Anvil = {
  job: null, // { bp, ore, part, exotic, field, rng, k, t, strikes, zone, ... }
  sprite: null,

  start(job) {
    const A = T.anvil;
    job.rng = Save.rng();
    job.k = 0; job.t = 0; job.strikes = []; job.hammer = 0; job.sparks = []; job.flash = 0; job.doneT = -1;
    job.zone = job.rng.f(0.22, 0.78);
    this.job = job;
    UI.show('screen-anvil');
    setTextIfChanged('anvil-call', 'Tap to strike when the marker crosses the glow');
    setTextIfChanged('anvil-what', `${BLUEPRINTS[job.bp].name} in ${T.ores[ORE_INDEX[job.ore]].name}, bound with ${partName(job.part).toLowerCase()}${job.exotic ? ', with ' + exoticName(job.exotic).toLowerCase() : ''}`);
    this.draw();
  },

  marker() {
    const j = this.job, s = T.anvil.speeds[Math.min(j.k, 2)];
    const ph = (j.t * s) % 2;
    return ph < 1 ? ph : 2 - ph;
  },
  zoneHalf() { return (T.anvil.zone - T.anvil.shrink * this.job.k) / 2; },

  update(dt) {
    const j = this.job;
    if (!j) return;
    if (j.doneT < 0) j.t += dt;
    j.hammer = Math.max(0, j.hammer - dt * 5);
    j.flash = Math.max(0, j.flash - dt * 3);
    for (const s of j.sparks) { s.t -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 140 * dt; }
    j.sparks = j.sparks.filter((s) => s.t > 0);
    if (j.doneT >= 0 && (j.doneT -= dt) <= 0) { j.doneT = -1; this.finish(); return; }
    this.draw();
  },

  strike() {
    const j = this.job;
    if (!j || j.doneT >= 0 || j.strikes.length >= 3) return;
    const m = this.marker(), half = this.zoneHalf(), off = Math.abs(m - j.zone);
    const grade = off <= half * T.anvil.perfect ? 'perfect' : off <= half ? 'good' : 'miss';
    j.strikes.push(grade);
    j.hammer = 1; j.flash = grade === 'miss' ? 0.2 : 1;
    const n = grade === 'perfect' ? 26 : grade === 'good' ? 14 : 4;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + FX_R.f(-1.3, 1.3), sp = FX_R.f(30, grade === 'perfect' ? 110 : 70);
      j.sparks.push({ x: 60, y: 47, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: FX_R.f(0.3, 0.7) });
    }
    setTextIfChanged('anvil-call', grade === 'perfect' ? 'PERFECT' : grade === 'good' ? 'GOOD' : 'MISS');
    buzz(grade === 'miss' ? 10 : grade === 'good' ? 25 : 45);
    j.k++;
    j.zone = j.rng.f(0.22, 0.78);
    if (j.strikes.length >= 3) j.doneT = 0.6;
  },

  quality() {
    const j = this.job;
    return Math.min(3, Math.floor(j.strikes.reduce((a, g) => a + (g === 'perfect' ? 1 : g === 'good' ? 0.5 : 0), 0)));
  },

  // Makes the piece and shows it off. Also how the autopilot forges: q is
  // the quality to forge at, without the strikes.
  finish(q = this.quality()) {
    const j = this.job;
    const item = forgeItem(j.rng, j.bp, j.ore, j.part, j.exotic, q);
    this.job = null;
    if (j.field) Game.dive.items.push(item);
    else { Save.data.items.push(item); Save.save(); }
    Reveal.show(item, j.field ? 'cargo' : 'stash', 'screen-forge', q);
    return item;
  },

  draw() {
    const j = this.job, c = $('anvil-canvas');
    if (!j || !c) return;
    if (c.width !== ANVIL_W) { c.width = ANVIL_W; c.height = ANVIL_H; }
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    // the forge's dark, the furnace's glow behind
    x.fillStyle = '#07080a'; x.fillRect(0, 0, ANVIL_W, ANVIL_H);
    const g = x.createRadialGradient(60, 44, 4, 60, 44, 70);
    g.addColorStop(0, 'rgba(255,140,60,' + (0.22 + j.flash * 0.25) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, ANVIL_W, ANVIL_H);
    if (!this.sprite) this.sprite = buildArtSprite(ANVIL_ROWS);
    x.drawImage(this.sprite.c, 60 - this.sprite.w / 2, 50);
    // the ingot, hotter with each strike
    const ramp = ART.ores[j.ore], heat = j.strikes.length / 3;
    x.fillStyle = mix(ramp[2], '#fff4d8', heat * 0.6 + j.flash * 0.3); x.fillRect(50, 46, 20, 4);
    x.fillStyle = mix(ramp[3], '#ffffff', heat * 0.7); x.fillRect(51, 46, 18, 1);
    x.fillStyle = ramp[0]; x.fillRect(50, 49, 20, 1);
    // the hammer, falling on a strike
    const hy = 14 + Math.round((1 - j.hammer) * 0 + j.hammer * 22);
    x.fillStyle = ART.pal.wood[2]; x.fillRect(78, hy - 2, 2, 18);
    x.fillStyle = ART.pal.steel[2]; x.fillRect(70, hy + 14, 16, 7);
    x.fillStyle = ART.pal.steel[3]; x.fillRect(70, hy + 14, 16, 1);
    for (const s of j.sparks) { x.fillStyle = s.t > 0.4 ? '#ffffff' : '#ffb347'; x.fillRect(Math.round(s.x), Math.round(s.y), 1, 1); }
    // the bar: the zone, its middle, the marker
    const bx = 10, by = 70, bw = 100, half = this.zoneHalf();
    x.fillStyle = '#1a1c24'; x.fillRect(bx, by, bw, 6);
    if (j.doneT < 0 && j.strikes.length < 3) {
      x.fillStyle = '#7a6234'; x.fillRect(Math.round(bx + (j.zone - half) * bw), by, Math.round(half * 2 * bw), 6);
      x.fillStyle = '#ffd890'; x.fillRect(Math.round(bx + (j.zone - half * T.anvil.perfect) * bw), by, Math.max(1, Math.round(half * T.anvil.perfect * 2 * bw)), 6);
      x.fillStyle = '#ffffff'; x.fillRect(Math.round(bx + this.marker() * bw), by - 2, 1, 10);
    }
    // three pips: how each strike went
    for (let k = 0; k < 3; k++) {
      const gr = j.strikes[k];
      x.fillStyle = gr === 'perfect' ? '#ffd34d' : gr === 'good' ? '#c8d2dc' : gr === 'miss' ? '#4a2420' : '#22252e';
      x.fillRect(48 + k * 9, 4, 6, 6);
    }
  },
};

// The moment a piece arrives: it rises in a beam of its rarity's colour,
// then (on a tap, or by itself) its card opens over `back`.
const Reveal = {
  item: null, where: null, back: null, shownAt: 0,
  show(item, where, back, q) {
    this.item = item; this.where = where; this.back = back;
    const col = ART.rarity[item.rarity] || '#ffffff';
    $('reveal-body').innerHTML = `
      <div class="reveal-beam" style="--col:${col}"></div>
      <img class="reveal-icon" src="${itemIconUrl(item)}" alt="">
      <div class="reveal-name r-${item.rarity}">${esc(item.name)}</div>
      <div class="reveal-sub">${esc(itemKindLine(item))}${q !== undefined ? ` · ${['A rough forge', 'A fair forge', 'A fine forge', 'A masterwork'][q]}` : ''}</div>`;
    UI.show('screen-reveal');
    this.shownAt = Game.realT;
    buzz(item.rarity === 'legendary' || item.rarity === 'set' ? 60 : 25);
  },
  done() {
    const it = this.item;
    if (!it) return;
    this.item = null;
    if (this.back) UI.show(this.back); else UI.close();
    UI.openCard(it, this.where, it.uid);
  },
};
