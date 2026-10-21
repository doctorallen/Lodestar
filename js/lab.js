'use strict';
// ---------------------------------------------------------------------------
// The paint lab: the painted look's options as settings to flip in play
// (docs/PAINTED.md, The paint lab). A sheet over the deck (screen-lab,
// from PAUSE → PAINT LAB), the room still showing above it, each row
// applied at once: the floor painted again round you, or sprites rebuilt,
// or nothing when the option is per frame. Kept in the save with the sound
// (settings.paint), so it survives START OVER; every default is today's
// look (T.lab), so with the lab untouched nothing changes. ?lab=calm,form,
// brush:broad in the address sets it before the game loads.
//
// The painters and the light read Lab.get(key) at the one point each option
// branches, so a rejected option goes by deleting its branch and its row.
// ---------------------------------------------------------------------------

// The rows, in the sheet's order: key (T.lab's), name, a line under it,
// values (a choice cycles through them; else on/off), and what a flip
// does: paint (the floor again), sprites (figures again).
const LAB_ROWS = [
  { key: 'calm', name: 'CALM FIELDS', sub: 'long strokes in quiet ground; detail at feet and beds', paint: true },
  { key: 'form', name: 'FORM STROKES', sub: 'strokes down the faces, one big plane, lit cracks', paint: true },
  { key: 'warm', name: 'WARM LIGHT', sub: 'amber in the beam, violet in the dark' },
  { key: 'lose', name: 'LOST EDGES', sub: 'figures and caps melt on the shadow side', sprites: true },
  { key: 'air', name: 'AIR', sub: 'motes and haze beyond the beam' },
  { key: 'brush', name: 'BRUSH', sub: 'how big the strokes', values: ['today', 'broad', 'fine'], paint: true },
  { key: 'finish', name: 'FINISH', sub: 'how much the paint shows', values: ['paint', 'flat', 'ink', 'wash'], paint: true },
  { key: 'lamp', name: 'LAMP', sub: 'a beam the way you face, or a glow all round', values: ['beam', 'glow'] },
];

const Lab = {
  // The setting as it stands: the save's, else the default.
  get(key) {
    if (key === 'lamp') return lampIsBeam() ? 'beam' : 'glow';
    const s = Save.data && Save.data.settings && Save.data.settings.paint;
    const v = s && s[key] !== undefined ? s[key] : T.lab[key];
    return v;
  },
  on(key) { return Lab.get(key) === true; },
  set(key, v, { save = true } = {}) {
    if (key === 'lamp') { if ((v === 'beam') !== lampIsBeam()) UI.acts.lampSet(); return; }
    const s = Save.data.settings || (Save.data.settings = {}), p = s.paint || (s.paint = {});
    if (p[key] === v) return;
    p[key] = v;
    if (save) Save.saveField('settings');
    Lab.apply(key);
  },
  // The row's next value: on to off, or the next of the choice.
  cycle(key) {
    const row = LAB_ROWS.find((r) => r.key === key);
    if (!row) return;
    if (row.values) Lab.set(key, row.values[(row.values.indexOf(Lab.get(key)) + 1) % row.values.length]);
    else Lab.set(key, !Lab.get(key));
  },
  reset() {
    const s = Save.data.settings || (Save.data.settings = {});
    s.paint = {};
    Save.saveField('settings');
    Lab.apply('all');
  },
  // Any row off today's look?
  changed() { return LAB_ROWS.some((r) => r.key !== 'lamp' && Lab.get(r.key) !== T.lab[r.key]); },
  // What a flip means for what's drawn: the floor painted again (the
  // painters read the lab as they paint), the ramp cache cleared, and the
  // figures rebuilt. Nothing for an option that's read every frame.
  apply(key) {
    const row = LAB_ROWS.find((r) => r.key === key);
    const paint = key === 'all' || (row && row.paint), sprites = key === 'all' || (row && row.sprites);
    if (sprites) labRebuildSprites();
    if (paint) labRepaintFloor();
  },
  // ?lab=calm,form,brush:broad,finish:wash (a bare key switches it on;
  // `off` after a colon switches it off). Kept in the save as a tap would.
  fromQuery(search) {
    const m = /[?&]lab=([^&]*)/.exec(search || '');
    if (!m) return;
    for (const part of decodeURIComponent(m[1]).split(',')) {
      if (!part) continue;
      const [key, val] = part.split(':'), row = LAB_ROWS.find((r) => r.key === key);
      if (!row) continue;
      if (row.values) { if (row.values.includes(val)) Lab.set(key, val, { save: false }); }
      else Lab.set(key, val !== 'off' && val !== 'false', { save: false });
    }
  },
};

// The floor painted again for the lab, as a kindling paints it again
// (render.js paintFloor): the chunks fill back in from the view out at the
// lazy painter's pace. The outpost too.
function labRepaintFloor() {
  const d = Game.dive;
  if (!d || !View.floorFor || View.floorFor !== d.floor) return;
  if (typeof pntLookClear === 'function') pntLookClear();
  paintFloor(d.floor);
  if (!d.hub) fpWarm(d);
}

// The figures built again: the creatures' sprites, the Kindler's frames,
// the flora's pieces (their caps lose an edge too).
function labRebuildSprites() {
  const d = Game.dive;
  if (typeof fpClearSprites === 'function') fpClearSprites();
  if (typeof kdClearFrames === 'function') kdClearFrames();
  if (typeof pflClearSprites === 'function') pflClearSprites();
  if (d && !d.hub) fpWarm(d);
}

// The sheet's rows, as they stand.
function drawLab() {
  const host = $('lab-rows');
  if (!host) return;
  host.textContent = '';
  for (const r of LAB_ROWS) {
    const v = Lab.get(r.key), on = r.values ? v !== r.values[0] : v === true;
    const row = document.createElement('div');
    row.className = 'row lab-row' + (on ? ' on' : '');
    const text = document.createElement('div'); text.className = 'row-text';
    const name = document.createElement('span'); name.className = 'row-name'; name.textContent = r.name;
    const sub = document.createElement('span'); sub.className = 'row-sub'; sub.textContent = r.sub;
    text.appendChild(name); text.appendChild(sub);
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'lab-' + r.key; b.dataset.act = 'labSet'; b.dataset.arg = r.key;
    b.className = 'toggle lab-toggle' + (r.values ? ' choice' : on ? ' on' : '');
    b.textContent = r.values ? String(v).toUpperCase() : on ? 'ON' : 'OFF';
    b.setAttribute('aria-label', r.name + (r.values ? ': ' + v + ', tap for the next' : ''));
    if (!r.values) b.setAttribute('aria-pressed', on ? 'true' : 'false');
    row.appendChild(text); row.appendChild(b);
    host.appendChild(row);
  }
  $('lab-reset').disabled = !Lab.changed();
}
