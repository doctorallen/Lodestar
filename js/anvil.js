'use strict';
// ---------------------------------------------------------------------------
// The anvil, and the reveal. Forging is three hammer strikes: a marker
// sweeps a bar, faster each strike but slowing as it drags through the
// glowing zone, and a tap strikes. In the zone is good, dead in its
// marked middle perfect. The strikes add up to a quality
// (0–3) that shifts the rarity odds (T.anvil.odds), so a perfect forge can
// even come out legendary; it sets a caster's slots, and raises a stone's
// tier. Then the piece rises from the anvil in its rarity's light (Reveal),
// and its card opens. The ingot glows hotter with every strike.
// ---------------------------------------------------------------------------

// The anvil's scene, laid out in px (it's drawn at AP art px to each).
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
  job: null, // { bp, ore, part, exotic, field, rng, k, ph, strikes, zone, ... }
  sprite: null,

  start(job) {
    const A = T.anvil;
    job.rng = Save.rng();
    job.k = 0; job.ph = 0; job.strikes = []; job.hammer = 0; job.sparks = []; job.flash = 0; job.doneT = -1;
    job.zone = job.rng.f(0.22, 0.78);
    this.job = job;
    UI.show('screen-anvil');
    setTextIfChanged('anvil-call', 'Tap as the marker crosses the glow');
    const bp = BLUEPRINTS[job.bp];
    setTextIfChanged('anvil-what', `${bp.name}${bp.kind === 'stone' ? ' stone' : ''} in ${T.ores[ORE_INDEX[job.ore]].name}${job.part ? ', bound with ' + partName(job.part).toLowerCase() : ''}${job.exotic ? ', with ' + exoticName(job.exotic).toLowerCase() : ''}${job.imprint ? ', imprinted with ' + LEGENDARIES[job.imprint].name : ''}`);
    this.draw();
  },

  // where the marker is on the bar (0–1): ph runs 0–2, there and back
  marker() { const ph = this.job.ph; return ph < 1 ? ph : 2 - ph; },
  zoneHalf() { return (T.anvil.zone - T.anvil.shrink * this.job.k) / 2; },
  inZone() { return Math.abs(this.marker() - this.job.zone) <= this.zoneHalf(); },

  update(dt) {
    const j = this.job;
    if (!j) return;
    // the marker sweeps, dragging as it crosses the zone
    if (j.doneT < 0) j.ph = (j.ph + dt * T.anvil.speeds[Math.min(j.k, 2)] * (this.inZone() ? T.anvil.drag : 1)) % 2;
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
    snd('anvil', { grade });
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
    // a power from the Codex, struck into the piece
    if (j.imprint) {
      if (q >= 2 || j.rng.chance(T.imprint.chance)) { item.power = j.imprint; item.name = LEGENDARIES[j.imprint].name; item.imprinted = true; }
      else j.imprintLost = true;
    }
    this.job = null;
    // a caster forged with an elemental exotic: its Element's stone with it
    const extra = item.withStone;
    delete item.withStone;
    const list = j.field ? Game.dive.items : Save.data.items;
    list.push(item);
    if (extra) list.push(extra);
    if (!j.field) Save.save();
    Reveal.show(item, j.field ? 'cargo' : 'stash', 'screen-forge', q);
    if (j.imprintLost) UI.toast("The imprint didn't take");
    if (extra) UI.toast(`And a ${extra.name}`, 'magic');
    return item;
  },

  draw() {
    const j = this.job, c = $('anvil-canvas');
    if (!j || !c) return;
    // laid out in ANVIL_W × ANVIL_H, drawn at the art's size (AP art px to
    // each), a rectangle at a time in whole art px
    const W = ap(ANVIL_W), H = ap(ANVIL_H);
    if (c.width !== W) { c.width = W; c.height = H; }
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    const rect = (rx, ry, rw, rh) => { const x0 = ap(rx), y0 = ap(ry); x.fillRect(x0, y0, Math.max(1, ap(rx + rw) - x0), Math.max(1, ap(ry + rh) - y0)); };
    // the forge's dark, the furnace's glow behind
    x.fillStyle = '#07080a'; x.fillRect(0, 0, W, H);
    const g = x.createRadialGradient(ap(60), ap(44), ap(4), ap(60), ap(44), ap(70));
    g.addColorStop(0, 'rgba(255,140,60,' + (0.22 + j.flash * 0.25) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    if (!this.sprite) this.sprite = buildArtSprite(ANVIL_ROWS);
    x.drawImage(this.sprite.c, Math.round(ap(60) - this.sprite.w / 2), ap(50) - 1);
    // the ingot, hotter with each strike
    const ramp = ART.ores[j.ore], heat = j.strikes.length / 3;
    x.fillStyle = mix(ramp[2], '#fff4d8', heat * 0.6 + j.flash * 0.3); rect(50, 46, 20, 4);
    x.fillStyle = mix(ramp[3], '#ffffff', heat * 0.7); x.fillRect(ap(51), ap(46), ap(18), 1);
    x.fillStyle = ramp[0]; x.fillRect(ap(50), ap(50) - 1, ap(20), 1);
    // the hammer, falling on a strike
    const hy = 14 + Math.round(j.hammer * 22);
    x.fillStyle = ART.pal.wood[2]; rect(78, hy - 2, 2, 18);
    x.fillStyle = ART.pal.steel[2]; rect(70, hy + 14, 16, 7);
    x.fillStyle = ART.pal.steel[3]; x.fillRect(ap(70), ap(hy + 14), ap(16), 1);
    x.fillStyle = ART.pal.steel[0]; x.fillRect(ap(70), ap(hy + 21) - 1, ap(16), 1);
    for (const s of j.sparks) { x.fillStyle = s.t > 0.4 ? '#ffffff' : '#ffb347'; x.fillRect(ap(s.x), ap(s.y), 1, 1); }
    // the bar: the zone (brighter while the marker's in it), its middle
    // marked above and below, the marker
    const bx = 10, by = 70, bw = 100, half = this.zoneHalf();
    x.fillStyle = '#1a1c24'; rect(bx, by, bw, 6);
    if (j.doneT < 0 && j.strikes.length < 3) {
      const z0 = bx + (j.zone - half) * bw, z1 = bx + (j.zone + half) * bw;
      const p0 = bx + (j.zone - half * T.anvil.perfect) * bw, p1 = Math.max(p0 + 1, bx + (j.zone + half * T.anvil.perfect) * bw);
      x.fillStyle = this.inZone() ? '#a8823c' : '#7a6234'; rect(z0, by, z1 - z0, 6);
      x.fillStyle = '#ffd890'; rect(p0, by, p1 - p0, 6);
      x.fillStyle = '#ffd34d'; x.fillRect(ap(p0), ap(by - 3), ap(p1) - ap(p0), 1); x.fillRect(ap(p0), ap(by + 8), ap(p1) - ap(p0), 1);
      x.fillStyle = '#ffffff'; x.fillRect(ap(bx + this.marker() * bw), ap(by - 2), 1, ap(10));
    }
    // three pips: how each strike went
    for (let k = 0; k < 3; k++) {
      const gr = j.strikes[k];
      x.fillStyle = gr === 'perfect' ? '#ffd34d' : gr === 'good' ? '#c8d2dc' : gr === 'miss' ? '#4a2420' : '#22252e';
      rect(48 + k * 9, 4, 6, 6);
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
    snd('reveal', { rarity: item.kind === 'relic' ? 'relic' : item.rarity });
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
