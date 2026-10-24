'use strict';
// ---------------------------------------------------------------------------
// Ore in the Kindler's hands. If ore is the world's body, the splinter can
// use it before it's home, and the push-your-luck gets a second side:
// spend the world, or carry it up. Three uses, all from the cargo screen,
// all costing the ore of the land you stand in (the star's light here must
// be of here; T.field):
//   Plant light   spend `plant.cost` of the land's ore: the splinter sets a
//                 pocket of the star's light where you stand, a few tiles
//                 across, for a minute or two. Your light fills in it, and
//                 the lattice with it. It fades.
//   Surge a band  spend `surge.cost` of the ore of the band a cast is in:
//                 the next cast of it is cast a depth above its band
//                 (surge.mult harder).
//   Raise the spire  a spire is raised from the land's own ore: `spire`
//                 of its first ore carried to the heart (game.js, where
//                 PLANT THE SPIRE is pressed; frontier.js kindleTerritory
//                 takes it). Kindling needs the player to have mined this
//                 land, not just crossed it.
// And the seventh band's residue: night-glass, which elites and the Hollow
// leave (combat.js), the one substance the star has no band for
// (spectrum.js).
// ---------------------------------------------------------------------------

// The land's ore: the first of its biome's two (the deeper one serves too,
// if that's what's carried).
function landOres(d) { const b = T.biomes[clamp(d.biome || 0, 0, T.biomes.length - 1)]; return b.ores; }
// The ore of the land the cargo holds most of, or its first.
function landOreCarried(d) { const [a, b] = landOres(d); return (d.cargo[b] || 0) > (d.cargo[a] || 0) ? b : a; }
// Pays `n` of the land's ore from the cargo (the first ore first). False if short.
function fieldPay(d, n) {
  const ores = landOres(d), have = ores.reduce((s, o) => s + (d.cargo[o] || 0), 0);
  if (have < n) return false;
  for (const o of ores) { const k = Math.min(n, d.cargo[o] || 0); if (k) { d.cargo[o] -= k; if (!d.cargo[o]) delete d.cargo[o]; n -= k; } }
  return true;
}
function fieldCanPay(d, n) { return landOres(d).reduce((s, o) => s + (d.cargo[o] || 0), 0) >= n; }
// What the spire here costs, and whether the cargo has it.
function spireOreCost(d) { return { ore: landOres(d)[0], n: T.field.spire }; }
function spireOreShort(d) { const c = spireOreCost(d); return Math.max(0, c.n - (d.cargo[c.ore] || 0)); }

// --- Plant light ---------------------------------------------------------------
function plantLight(d) {
  const P = T.field.plant;
  if (!d || d.hub || !d.sortie || d.kindled) return false;
  if (!fieldCanPay(d, P.cost)) { UI.toast(`Plant light: ${P.cost} of this land's ore`); return false; }
  fieldPay(d, P.cost);
  (d.pockets = d.pockets || []).push({ x: d.p.x, y: d.p.y, t: 0, max: P.time });
  spawnSparks(d.p.x, d.p.y - 6, [ART.pal.star[3], ART.pal.star[2], '#ffffff'], 24);
  UI.toast('A pocket of the star\'s light. It fades', 'legendary');
  Story.say('firstPlant');
  if (typeof snd === 'function') snd('beaconLand');
  buzz(30);
  saveRun(d);
  return true;
}
// Each step: the pockets fade; standing in one, your light fills.
function updatePockets(d, dt) {
  if (!d.pockets || !d.pockets.length) return;
  const P = T.field.plant, p = d.p;
  for (const k of d.pockets) {
    k.t += dt;
    if (!d.kindled && dist(p.x, p.y, k.x, k.y) < P.r * TILE && d.pull < 1) d.pull = Math.min(1, d.pull + P.refill * dt);
  }
  d.pockets = d.pockets.filter((k) => k.t < k.max);
}
// Standing in a pocket of planted light (the light meter rests there).
function inPocket(d) { const P = T.field.plant; return !!(d.pockets && d.pockets.some((k) => dist(d.p.x, d.p.y, k.x, k.y) < P.r * TILE)); }
// The pockets on the ground, under everyone: a ring of gold, fading.
function drawPockets(d, ox, oy, lights) {
  if (!d.pockets || !d.pockets.length) return;
  const P = T.field.plant, G = ART.pal.star;
  for (const k of d.pockets) {
    const left = 1 - k.t / k.max, a = Math.min(1, left * 3), x = Math.round(k.x * AP) + ox, y = Math.round(k.y * AP) + oy, R = P.r * ATILE;
    const n = Math.round(R * 1.4);
    for (let i = 0; i < n; i++) {
      if ((i + Math.floor(Game.realT * 5)) % 3 === 0) continue;
      const ang = (i / n) * Math.PI * 2 + Game.realT * 0.2;
      dot(Math.round(x + Math.cos(ang) * R), Math.round(y + Math.sin(ang) * R * 0.6), i % 2 ? G[3] : G[2], true, 0.7 * a);
    }
    for (let i = 0; i < 6; i++) { const ph = (Game.realT * 0.4 + i / 6) % 1, ang = i * 1.7 + ph; dot(Math.round(x + Math.cos(ang) * (3 + ph * 10) * AP), Math.round(y - ph * 22 * AP), G[3], true, (1 - ph) * a); }
    lights.push({ x, y, r: TILE * (P.r + 1), i: 0.9 * a, c: rgb01(G[2]) });
  }
}

// --- Surge a band -----------------------------------------------------------------
// The cast's band's ore, from the cargo: the next cast of it a depth above.
function surgeCast(d, slot) {
  const S = T.field.surge, c = facetsState().casts[slot === 'off' ? 1 : 0];
  if (!d || d.hub || !c) return false;
  const ore = c.band, have = d.cargo[ore] || 0;
  if (!landOres(d).includes(ore)) { UI.toast(`A surge is cast in the ore of this land: cast ${slot === 'off' ? 'B' : 'A'} is in ${bandName(ore)}`); return false; }
  if (have < S.cost) { UI.toast(`Surge: ${S.cost} ${stuffName(ore)} carried`); return false; }
  d.cargo[ore] -= S.cost; if (!d.cargo[ore]) delete d.cargo[ore];
  d.surge = d.surge || {};
  d.surge[slot] = (d.surge[slot] || 0) + 1;
  UI.toast(`${bandName(ore).toUpperCase()} surges: the next ${slot === 'off' ? 'B' : 'A'} is cast a depth above`, 'legendary');
  Story.say('firstSurge');
  if (typeof snd === 'function') snd('starFeedStart', {});
  saveRun(d);
  return true;
}
// A cast's surge, spent as it's cast (circuits.js castHand): its multiplier.
function surgeTake(d, slot) {
  if (!d.surge || !d.surge[slot]) return 1;
  d.surge[slot]--;
  return T.field.surge.mult;
}

// The cargo screen's SPEND HERE section (ui.js drawCargo), in dark land.
function fieldSpendHtml(d) {
  if (!d || d.hub || !d.sortie || d.kindled) return '';
  const P = T.field.plant, S = T.field.surge, ores = landOres(d), have = ores.reduce((s, o) => s + (d.cargo[o] || 0), 0), oreName = ores.map((o) => stuffName(o)).join(' or ');
  const F = facetsState(), casts = F.casts.map((c, i) => {
    const slot = i ? 'off' : 'main', here = ores.includes(c.band), n = d.cargo[c.band] || 0, ok = here && n >= S.cost;
    return `<div class="row static"><span class="pip" style="background:${bandColor(c.band)}"></span><span class="row-text"><span class="row-name">SURGE · ${esc(bandName(c.band).toUpperCase())} <span class="dim">· cast ${i ? 'B' : 'A'}</span></span><span class="row-sub">${here ? `${S.cost} ${esc(stuffName(c.band))} · the next cast a depth above${d.surge && d.surge[slot] ? ` · ${d.surge[slot]} ready` : ''}` : `cast in ${esc(bandName(c.band))}: not this land's ore`}</span></span><button class="mini" data-act="fieldSurge" data-arg="${slot}" ${ok ? '' : 'disabled'}>SURGE</button></div>`;
  }).join('');
  const sp = spireOreCost(d), short = spireOreShort(d), ts = terrPeek(d.terr) || {};
  return `<h3>SPEND HERE · ${esc(oreName)}</h3>
    <div class="row static"><span class="pip" style="background:${ART.pal.star[3]}"></span><span class="row-text"><span class="row-name">PLANT LIGHT</span><span class="row-sub">${P.cost} of this land's ore · a pocket of the star's light where you stand, ${P.time} s</span></span><button class="mini" data-act="fieldPlant" ${have >= P.cost ? '' : 'disabled'}>PLANT</button></div>
    ${casts}
    <p class="note">${d.deep ? 'The spire is raised at the heart above.' : `The spire here is raised from ${sp.n} ${esc(stuffName(sp.ore))}${short ? `: ${short} more to carry` : ', carried'}${ts.done ? '' : ', once its heart goal is done'}.`}</p>`;
}

Object.assign(UI.acts, {
  fieldPlant: () => { if (plantLight(Game.dive)) UI.redraw(); },
  fieldSurge: (slot) => { if (surgeCast(Game.dive, slot)) UI.redraw(); },
});
