'use strict';
// ---------------------------------------------------------------------------
// The Spectrum: what the star's light can touch. A seed-star makes anything
// from anything; what it can't do is shine on a world it doesn't know. Its
// light has six bands, one for each of the world's ores, and a band's depth
// is how much of that ore the star has been given at its altar: ore is the
// world's body, and each kind the star tastes is a band it learns to shine
// in. Magnitude (deeds.js) is how far the light reaches; the Spectrum is
// what it can light. Kindling a territory needs both: the star must reach
// it, and carry its land's band (bandGateOre): the Choir's land stays dark
// to a star that hasn't tasted Resonite.
//
// The Meridian's marks (T.spectrum.mark, a depth) are the Charter's spec:
// the light the colony can live under. Its sleepers wait in orbit until
// every band stands at its mark. Nobody comes down before.
//
//   BANDS, bandOf(ore)             the six bands, by their ore
//   bandGiven(ore), bandDepth(ore) ore given, and the depth it stands at
//   bandMark(), bandAtMark(ore)    the Meridian's mark, and a band at it
//   bandGateOre(t)                 the ore a territory's kindling needs
//   spireBlock(id)                 why a spire can't hold there yet, or null
//   giveOre(ore, n)                ore from the stash into the star
//   spectrumComplete()             every band at its mark
//   spectrumBarsHtml(small)        the six bars, for the top bar and screens
// Numbers are in T.spectrum.
// ---------------------------------------------------------------------------

const BANDS = [
  { id: 'iron', ore: 'ferrite', name: 'Iron', opens: 'rim' },
  { id: 'lumen', ore: 'lumenite', name: 'Lumen', opens: null },
  { id: 'chord', ore: 'resonite', name: 'Chord', opens: 'choir' },
  { id: 'glass', ore: 'aetherglass', name: 'Glass', opens: null },
  { id: 'sigil', ore: 'sigilite', name: 'Sigil', opens: 'underforge' },
  { id: 'star', ore: 'starmetal', name: 'Star', opens: 'edge' },
  // the seventh: night-glass, the dark's residue, which the Charter's spec
  // doesn't list and the star has no band for. It can be fed. Nothing says
  // what it is. (Hidden until some is carried; never part of the spec.)
  { id: 'umbra', ore: 'nightglass', name: 'Umbra', opens: null, seventh: true },
];
const NIGHTGLASS = 'nightglass';
// The seventh band shows once any night-glass has been carried home or given.
function umbraSeen() { const s = Save.data; return bandGiven(NIGHTGLASS) > 0 || (s.stash[NIGHTGLASS] || 0) > 0 || !!s.umbraSeen; }
// The bands the spec knows (the six), and those to show.
function specBands() { return BANDS.filter((b) => !b.seventh); }
function shownBands() { return BANDS.filter((b) => !b.seventh || umbraSeen()); }
const BAND_BY_ORE = Object.fromEntries(BANDS.map((b) => [b.ore, b]));
function bandOf(ore) { return BAND_BY_ORE[ore] || null; }
// The band's colour: its ore's bright tone (art.js).
function bandColor(ore) { return ART.ores[ore] ? ART.ores[ore][2] : ore === NIGHTGLASS ? ART.exotics[NIGHTGLASS] || '#8f7bd6' : '#f0c050'; }

function bandsState() { const s = Save.data; return s.bands || (s.bands = {}); }
function bandGiven(ore) { return bandsState()[ore] || 0; }
// The depth a band stands at: the last of T.spectrum.depths reached.
function bandDepth(ore) {
  const D = T.spectrum.depths, n = bandGiven(ore);
  let d = 0;
  while (d < D.length - 1 && n >= D[d + 1]) d++;
  return d;
}
function bandDepthOf(n) { const D = T.spectrum.depths; let d = 0; while (d < D.length - 1 && n >= D[d + 1]) d++; return d; }
function bandMaxDepth() { return T.spectrum.depths.length - 1; }
function bandMark() { return T.spectrum.mark; }
function bandAtMark(ore) { return bandDepth(ore) >= bandMark(); }
// Ore to the band's next depth (0 at the deepest).
function bandToNext(ore) { const D = T.spectrum.depths, d = bandDepth(ore); return d >= D.length - 1 ? 0 : D[d + 1] - bandGiven(ore); }
// How far through the marks the band is (0-1), for a bar.
function bandFill(ore) { return Math.min(1, bandGiven(ore) / T.spectrum.depths[bandMark()]); }
function spectrumComplete() { return specBands().every((b) => bandAtMark(b.ore)); }

// The ore whose band a territory's kindling needs: the Edge's is Starmetal,
// the Choir's Resonite, the Underforge's Sigilite; the Rim's land needs
// nothing the star didn't land knowing (Iron, the survey's).
function bandGateOre(t) {
  if (!t || t.home) return null;
  if (t.edge) return 'starmetal';
  const biome = T.biomes[t.biome] ? T.biomes[t.biome].id : 'rim';
  const b = BANDS.find((x) => x.opens === biome);
  return b && b.opens !== 'rim' ? b.ore : null;
}
// Why a spire can't hold in territory id yet: the star's reach (deeds.js
// starHoldsSpire), or a band it hasn't tasted; null when it can.
function spireBlock(id) {
  if (!starHoldsSpire(id)) return { why: 'reach', mag: spireMagFor(id) };
  const ore = bandGateOre(terrOf(id));
  if (ore && bandDepth(ore) < 1) return { why: 'band', ore };
  return null;
}
// The block in words: over the view, and short for the button.
function spireBlockLine(b) {
  return b.why === 'reach' ? `The star must reach magnitude ${b.mag} to hold a spire here` : `The star must taste ${stuffName(b.ore)} before it can light this land`;
}
function spireBlockShort(b) { return b.why === 'reach' ? `MAGNITUDE ${b.mag}` : `NEEDS ${stuffName(b.ore).toUpperCase()}`; }
// The land a band's first depth opens, in words, or ''.
function bandOpensWord(ore) {
  const b = bandOf(ore);
  if (!b || !b.opens || b.opens === 'rim') return '';
  return b.opens === 'edge' ? 'the Edge' : T.biomes.find((x) => x.id === b.opens).name;
}

// Ore from the stash into the star: the band deepens, the star remarks on
// the first taste of each kind (story.js), and a depth reached says what
// it opened. Returns how much went.
function giveOre(ore, n) {
  const s = Save.data, have = s.stash[ore] || 0, k = Math.min(have, n | 0);
  if (!bandOf(ore) || k <= 0) return 0;
  const d0 = bandDepth(ore);
  s.stash[ore] -= k;
  if (!s.stash[ore]) delete s.stash[ore];
  bandsState()[ore] = bandGiven(ore) + k;
  s.oreGiven = (s.oreGiven || 0) + k;
  const d1 = bandDepth(ore), b = bandOf(ore);
  Story.say('firstGive');
  Story.starTaste(ore);
  if (typeof snd === 'function') snd('starFeed', { n: k, tier: ORE_INDEX[ore] !== undefined ? T.ores[ORE_INDEX[ore]].tier : 6, rate: 8 });
  if (typeof spawnSparks === 'function' && Game.dive && Game.dive.hub) {
    const R = ART.ores[ore] || [bandColor(ore), bandColor(ore), bandColor(ore), '#d8c8ff'];
    spawnSparks(STAR_AT.x * TILE, STAR_AT.y * TILE + 4, [R[2], R[3], '#ffffff'], Math.min(40, 8 + k));
  }
  if (d1 > d0) {
    const opens = d0 < 1 && d1 >= 1 ? bandOpensWord(ore) : '';
    UI.toast(`${b.name.toUpperCase()} · DEPTH ${d1}${!b.seventh && d1 >= bandMark() ? ' · AT THE MARK' : ''}${opens ? ` · ${opens} is open to the star` : ''}${b.seventh ? ' · the day at home a shade dimmer' : ''}`, 'legendary');
    if (typeof snd === 'function') snd('starGrow', { mag: 1 + d1 });
    if (spectrumComplete()) Story.say('spectrumWhole');
    if (b.seventh && d1 === 1) Story.say('umbra');
  }
  Save.save();
  return k;
}

// The six bars: each band's fill towards the mark, the mark drawn across,
// its colour its ore's; dim where nothing's been given. small: the top
// bar's.
function spectrumBarsHtml(small) {
  const D = T.spectrum.depths, mk = D[bandMark()], top = D[D.length - 1];
  return `<span class="spec${small ? ' small' : ''}">${shownBands().map((b) => {
    const n = bandGiven(b.ore), h = Math.round(Math.min(1, n / top) * 100), mark = Math.round(mk / top * 100);
    // (the seventh bar carries no mark: nobody drew one)
    return `<i class="${n ? '' : 'none'}${!b.seventh && bandAtMark(b.ore) ? ' mark' : ''}${b.seventh ? ' seventh' : ''}" title="${b.name}"><b style="height:${h}%;background:${bandColor(b.ore)}"></b>${b.seventh ? '' : `<u style="bottom:${mark}%"></u>`}</i>`;
  }).join('')}</span>`;
}
// The Spectrum as a list, for the star's screen and the uplink: each band,
// its ore, its depth and the mark, and (give: true) a button to give what
// the stash holds of its ore.
function spectrumRowsHtml(give) {
  const s = Save.data;
  return shownBands().map((b) => {
    const n = bandGiven(b.ore), d = bandDepth(b.ore), have = s.stash[b.ore] || 0, next = bandToNext(b.ore), col = bandColor(b.ore);
    const opens = bandOpensWord(b.ore);
    const sub = b.seventh ? (!n ? 'unlisted · the star has no name for it' : `depth ${d} · unlisted${next ? ` · ${next} more to depth ${d + 1}` : ''}`) : !n ? `not yet tasted${opens ? ` · ${opens} is dark to it` : ''}` : d >= bandMark() ? `depth ${d} · at the Meridian's mark` : `depth ${d} · ${next} more to depth ${d + 1}${d < 1 && opens ? ` · opens ${opens}` : ''}`;
    const btn = give && have ? `<button class="mini give" data-act="giveOre" data-arg="${b.ore}">GIVE ${have}</button>` : '';
    return `<div class="row static band"><span class="pip" style="background:${col}"></span><span class="row-text"><span class="row-name">${b.name.toUpperCase()} <span class="dim">· ${esc(stuffName(b.ore))}</span></span><span class="row-sub">${esc(sub)}</span><span class="band-bar"><span style="width:${Math.round(bandFill(b.ore) * 100)}%;background:${col}"></span></span></span>${btn}</div>`;
  }).join('');
}
