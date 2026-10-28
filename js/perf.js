'use strict';
// ---------------------------------------------------------------------------
// A readout over the frame, with ?perf in the address: which path draws
// (the GPU, or the 2D canvases), what a frame costs and how the animation
// frames are spaced (what the player feels), the ground painted in-frame,
// the batch's draws, and the first error, if there was one. For seeing
// what a phone sees, where no profiler reaches (docs/RENDERING.md).
// ---------------------------------------------------------------------------
const PerfSamples = Tycho.loop.Samples;
const Perf = { on: /[?&]perf\b/.test(location.search), gap: new PerfSamples(180), ms: new PerfSamples(180), pnt: new PerfSamples(180), last: 0, lines: [], n: 0 };
function perfGap(now) {
  if (!Perf.on) return;
  if (Perf.last) Perf.gap.add(now - Perf.last);
  Perf.last = now;
}
function perfNote(list, ms) { if (Perf.on) list.add(ms); }
const perfPct = (a, p) => a.pct(p);
// Drawn into the overlay as the frame ends; its words made anew every half second.
function perfDraw() {
  if (!Perf.on || !View.overCtx) return;
  if (!(Perf.n++ % 30)) {
    const f1 = (v) => v.toFixed(1), long = Perf.gap.count((g) => g > 20);
    Perf.lines = [
      `${Gpu.on ? 'GPU' : '2D'} FRAME ${f1(perfPct(Perf.ms, 0.5))} P95 ${f1(perfPct(Perf.ms, 0.95))} MAX ${f1(perfPct(Perf.ms, 1))}`,
      `GAP ${f1(perfPct(Perf.gap, 0.5))} P95 ${f1(perfPct(Perf.gap, 0.95))} LONG ${long} OF ${Perf.gap.list.length}`,
      `PAINT P95 ${f1(perfPct(Perf.pnt, 0.95))} DRAWS ${Gpu.stats.draws} QUADS ${Gpu.stats.quads} UP ${Gpu.stats.uploads}`,
    ];
    if (typeof Errors !== 'undefined' && Errors.length) Perf.lines.push(('ERR ' + Errors[0].split('\n')[0]).toUpperCase().replace(/[^A-Z0-9 .\-?]/g, ' ').slice(0, 40));
  }
  const o = View.overCtx, step = 8 * AF;
  Perf.lines.forEach((l, i) => drawPixelText(o, l, View.w / 2, 12 * AF + i * step, '#ffe060', 1));
}
