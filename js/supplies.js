'use strict';
// ---------------------------------------------------------------------------
// Supplies: two consumables made from ore, so old ore has a use once the
// next region's is found: the Mending Injector (health) and the Lightcell
// (light). The Refinery makes both stronger, level by level (structures.js
// refineryLevel; the numbers are T.supplies).
//
// Made at home at the fabricator (SUPPLIES, beside FORGE), from the stash,
// or out in the world from the ore carried (MAKE, in the cargo screen).
// Either way one is paid in the plainest ore there's enough of, the higher
// tiers costing fewer (T.supplies.cost). They're carried on the belt
// (Save.data.supplies: { injector: n, cell: n }), up to T.supplies.most of
// each, safe whatever happens, and spent when used.
//
// Each has its own button on the deck (its icon and how many), and a key:
// Q for an injector, R for a Lightcell.
// ---------------------------------------------------------------------------

const SUPPLY_KINDS = {
  injector: { name: 'Mending Injector', short: 'MEND', col: '#7ff0a0', btn: 'btn-mend', key: 'KeyQ', text: (lv) => `Heals ${supplyPct('injector', lv)}% of your health.` },
  cell: { name: 'Lightcell', short: 'LIGHT', col: '#ffd36a', btn: 'btn-cell', key: 'KeyR', text: (lv) => `Gives back ${supplyPct('cell', lv)}% of your light.` },
};
const SUPPLY_ORDER = ['injector', 'cell'];

// How strong one is at a Refinery level (0: none), in percent.
function supplyPct(kind, lv = refineryLevel()) {
  const v = kind === 'injector' ? T.supplies.injector.heal : T.supplies.cell.light;
  return Math.round(v[clamp(lv, 0, v.length - 1)] * 100);
}
// Both, at a level, in a few words (the Refinery's upgrade row).
function supplyPowerText(lv) { return `injectors heal ${supplyPct('injector', lv)}%, Lightcells ${supplyPct('cell', lv)}%`; }

function supplyBelt() { const s = Save.data; if (!s.supplies || typeof s.supplies !== 'object') s.supplies = {}; return s.supplies; }
function supplyCount(kind) { return supplyBelt()[kind] || 0; }

// What one costs from `src` (the stash, or the cargo in the field): the
// plainest ore there's enough of, or else the one nearest to enough.
// Returns { ore, n, ok }.
function supplyCost(src) {
  const C = T.supplies.cost, opts = T.ores.map((o, i) => ({ ore: o.id, n: C[Math.min(i, C.length - 1)] }));
  const ok = opts.find((o) => (src[o.ore] || 0) >= o.n);
  if (ok) return Object.assign(ok, { ok: true });
  const near = opts.reduce((a, o) => ((src[o.ore] || 0) / o.n > (src[a.ore] || 0) / a.n ? o : a), opts[0]);
  return Object.assign(near, { ok: false });
}
// Can one be made from `src`? Returns the reason it can't, or ''.
function supplyBlock(kind, src) {
  if (supplyCount(kind) >= T.supplies.most) return `you carry ${T.supplies.most}`;
  const c = supplyCost(src);
  return c.ok ? '' : `need ${c.n} ${stuffName(c.ore)}`;
}
// Makes one: paid from the stash at home, or from the cargo in the field.
function makeSupply(kind, field) {
  const d = Game.dive, src = field ? d && d.cargo : Save.data.stash;
  if (!SUPPLY_KINDS[kind] || !src || supplyBlock(kind, src)) return false;
  const c = supplyCost(src);
  src[c.ore] -= c.n;
  if (!src[c.ore]) delete src[c.ore];
  const b = supplyBelt();
  b[kind] = (b[kind] || 0) + 1;
  // (in the field the cargo it came from is saved with the run, so closing
  // the page can't make it twice)
  if (field) { saveRun(d); Save.saveField('supplies'); } else Save.save();
  snd('forgeFire');
  return true;
}

// ---------------------------------------------------------------------------
// Using one, out in the world
// ---------------------------------------------------------------------------
function useSupply(kind) {
  const d = Game.dive;
  if (!d || d.hub || d.dying || d.warp || Game.modal || !SUPPLY_KINDS[kind]) return false;
  if (!supplyCount(kind)) { UI.toast(`No ${SUPPLY_KINDS[kind].name}s: make them at SUPPLIES, or from ore in CARGO`); return false; }
  const p = d.p, k = supplyPct(kind) / 100;
  if (kind === 'injector') {
    if (p.hp >= d.stats.maxHp) { UI.toast('Your health is full'); return false; }
    const n = Math.round(d.stats.maxHp * k);
    healPlayer(n);
    d.nums.push({ x: p.x + 8, y: p.y - 30, v: n, t: 0.9, plus: true, col: '#7ff0a0' });
    spawnSparks(p.x, p.y - 10, ['#c8ffd8', '#7ff0a0', '#ffffff'], 14);
    snd('heal');
  } else {
    if ((d.kindled && !d.deep) || d.pull >= 1) { UI.toast('Your light is full'); return false; }
    d.pull = Math.min(1, d.pull + k);
    spawnSparks(p.x, p.y - 14, [ART.pal.star[3], ART.pal.star[2], '#ffffff'], 16);
    snd('waystone');
  }
  const b = supplyBelt();
  if (!--b[kind]) delete b[kind];
  Save.saveField('supplies');
  buzz(15);
  return true;
}

// ---------------------------------------------------------------------------
// Icons: each kind drawn small, in its colour
// ---------------------------------------------------------------------------
const SUPPLY_ROWS = {
  injector: ['........oo.', '.......oMMo', '......oggo.', '.....oggo..', '....oggo...', '...oggo....', '..oMgo.....', '.oMMo......', '.wo........', 'w..........', '...........'],
  cell: ['...oMMMo...', '..oMMMMMo..', '..ogGGGgo..', '..ogGwGgo..', '..ogGGGgo..', '..ogGGGgo..', '..ogGwGgo..', '..ogGGGgo..', '..oMMMMMo..', '...ooooo...', '...........'],
};
const _supplyIcons = {};
function supplyIconUrl(kind) {
  if (_supplyIcons[kind]) return _supplyIcons[kind];
  const rows = SUPPLY_ROWS[kind], col = SUPPLY_KINDS[kind].col;
  const pal = { o: '#14141c', M: '#8a8ea0', g: mix(col, '#000000', 0.25), G: col, w: '#ffffff' };
  const [c, x] = makeCanvas(13, 13);
  rows.forEach((row, j) => [...row].forEach((ch, i) => { if (pal[ch]) { x.fillStyle = pal[ch]; x.fillRect(i + 1, j + 1, 1, 1); } }));
  return (_supplyIcons[kind] = c.toDataURL());
}

// ---------------------------------------------------------------------------
// The deck's two buttons, every frame (UI.frame): shown out in the world,
// dim when there are none
// ---------------------------------------------------------------------------
function drawSupplyDeck(d) {
  const out = !!(d && !d.hub && !d.dying);
  for (const kind of SUPPLY_ORDER) {
    const K = SUPPLY_KINDS[kind], btn = $(K.btn);
    if (!btn) continue;
    if (btn.hidden !== !out) btn.hidden = !out;
    if (!out) continue;
    const n = supplyCount(kind), key = String(n);
    if (btn.dataset.key === key) continue;
    btn.dataset.key = key;
    btn.classList.toggle('empty', !n);
    btn.innerHTML = `<img class="btn-icon" src="${supplyIconUrl(kind)}" alt=""><span>${K.short}</span><b class="supply-n">${n}</b>`;
    btn.setAttribute('aria-label', `Use a ${K.name}, ${n} carried`);
  }
}
if (typeof document !== 'undefined' && document.getElementById('btn-mend')) {
  for (const kind of SUPPLY_ORDER) $(SUPPLY_KINDS[kind].btn).addEventListener('pointerdown', (e) => { e.preventDefault(); if (!Game.modal) useSupply(kind); });
  window.addEventListener('keydown', (e) => {
    if (e.repeat || Game.modal || !Game.dive || Game.dive.hub) return;
    const kind = SUPPLY_ORDER.find((k) => SUPPLY_KINDS[k].key === e.code);
    if (kind) useSupply(kind);
  });
}

// ---------------------------------------------------------------------------
// Making them: the SUPPLIES screen at home, and MAKE in the cargo screen
// ---------------------------------------------------------------------------
// A row for each kind: what it does, how many are carried, and MAKE with
// what it costs. field: from the cargo.
function supplyRows(field) {
  const d = Game.dive, src = field ? (d && d.cargo) || {} : Save.data.stash;
  // (in the field, only what can be made: the rest is noise)
  return SUPPLY_ORDER.filter((kind) => !field || !supplyBlock(kind, src)).map((kind) => {
    const K = SUPPLY_KINDS[kind], n = supplyCount(kind), why = supplyBlock(kind, src), c = supplyCost(src);
    const full = why.startsWith('you carry');
    return `<div class="row static supply-row"><img class="icon" src="${supplyIconUrl(kind)}" alt=""><span class="row-text"><span class="row-name">${esc(K.name)} · ${n}/${T.supplies.most}</span><span class="row-sub">${esc(K.text())}</span>${full ? '' : `<span class="cost-list">${costTag(c.ore, c.n, src[c.ore] || 0)}</span>`}</span><button class="mini" data-act="makeSupply" data-arg="${kind}${field ? ':field' : ''}" ${why ? 'disabled' : ''}>${full ? 'FULL' : 'MAKE'}</button></div>`;
  }).join('');
}
function drawSupplies() {
  $('supplies-body').innerHTML = `<p class="note">Paid in your plainest ore. Higher ores cost fewer.</p>${supplyRows(false)}${refineHtml()}`;
}
// The cargo screen's MAKE section (ui.js drawCargo).
function supplyMakeHtml() {
  return `<h3>MAKE · FROM YOUR ORE</h3>${supplyRows(true) || `<p class="note">Each takes ${T.supplies.cost[0]} ${stuffName(T.ores[0].id)}, or fewer of a higher ore.</p>`}`;
}

// An older save's supplies: graded injectors and Lightcells ('injector2')
// merged into the one kind each, and Flares, Ward Cells and Blast Charges
// (gone) refunded as ore, T.supplies.refund of their grade's plainer ore.
function migrateOldSupplies(s) {
  const b = s.supplies && typeof s.supplies === 'object' ? s.supplies : {}, out = {}, ore = ['ferrite', 'resonite', 'sigilite'];
  for (const id of Object.keys(b)) {
    const n = Math.max(0, Math.floor(Number(b[id]) || 0)), m = /^([a-z]+)([123])?$/.exec(id);
    if (!n || !m) continue;
    if (SUPPLY_KINDS[m[1]]) out[m[1]] = Math.min(T.supplies.most, (out[m[1]] || 0) + n);
    else if (m[2]) { const k = ore[Number(m[2]) - 1]; s.stash[k] = (s.stash[k] || 0) + n * T.supplies.refund; }
  }
  s.supplies = out;
  delete s.supplySel;
}

Object.assign(UI.acts, {
  makeSupply: (arg) => {
    const [kind, where] = String(arg).split(':');
    if (makeSupply(kind, where === 'field')) { UI.toast(`Made: ${SUPPLY_KINDS[kind].name}`, 'legendary'); UI.redraw(); }
  },
  supplies: () => UI.show('screen-supplies'),
});
