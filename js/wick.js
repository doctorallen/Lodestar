'use strict';
// ---------------------------------------------------------------------------
// Wick, the drone: awake with the Kindler, dry and kind. He flies at the
// Kindler's shoulder (render.js drawDrone) and says his lines (story.js).
// His upgrades went with the benches; what he does in the world comes back
// with the veins (docs/VEINS.md).
// ---------------------------------------------------------------------------

// Wick's state in the world (made the first time it's wanted).
function wickState(d) {
  return d.wk || (d.wk = { fx: [] });
}
// Where Wick is (world px): beside the Kindler's shoulder (render.js).
function wickAt(d) { return d.drone ? { x: d.drone.x, y: d.drone.y } : { x: d.p.x - 6, y: d.p.y - T.wick.up }; }

// Each step.
function updateWick(d, dt) {
  if (d.dying) return;
  const W = wickState(d);
  for (const f of W.fx) f.t -= dt;
  W.fx = W.fx.filter((f) => f.t > 0);
}

// Wick's effects in the world, lit with the rest (render.js): none yet.
function drawWickAir() {}
// A second lamp from behind the Kindler: none yet.
function addWickLamp() {}
