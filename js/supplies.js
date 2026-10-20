'use strict';
// ---------------------------------------------------------------------------
// Supplies: consumables made from ore, so old ore has a use once the next
// region's is found. Five kinds, each in three grades, one from each
// region's ore (the Rim's makes the plain ones, the Underforge's the best):
// a Mending Injector, a Lightcell, a Flare, a Ward Cell and a Blast Charge.
// The numbers are T.supplies.
//
// Made at home at the fabricator (SUPPLIES, beside FORGE), from the stash;
// the simple ones (field: true) can be made out in the world from the ore
// carried (MAKE, in the cargo screen). They're carried on the belt
// (Save.data.supplies, by id: 'injector2'), up to T.supplies.most of each
// kind, safe whatever happens, and spent when used.
//
// One quick-use slot on the deck: the button uses the chosen kind (its best
// grade), and the small one beside it moves on to the next kind carried. Q
// uses, R moves on, on a keyboard.
//
// CONSUMABLE_RECIPES is plain data (the category 'Consumables'), so any
// forge screen can list them; makeSupply(id, field) makes one.
// ---------------------------------------------------------------------------

const SUPPLY_KINDS = {
  injector: { name: 'Mending Injector', short: 'MEND', field: true, col: '#7ff0a0', text: (g) => `Heals ${Math.round(T.supplies.injector.heal[g - 1] * 100)}% of your health at once.` },
  cell: { name: 'Lightcell', short: 'LIGHT', field: true, col: '#ffd36a', text: (g) => `Gives back ${Math.round(T.supplies.cell.light[g - 1] * 100)}% of your light, in dark land or a Deep.` },
  flare: { name: 'Flare', short: 'FLARE', field: true, col: '#ff7a4a', text: (g) => `Set at your feet, it lights ${T.supplies.flare.r[g - 1]} tiles round for ${T.supplies.flare.life[g - 1]} s. Standing in it, your light doesn't drain.` },
  ward: { name: 'Ward Cell', short: 'WARD', field: false, col: '#8fc4ff', text: (g) => `A ward that soaks ${T.supplies.ward.soak[g - 1]} damage for ${T.supplies.ward.time} s.` },
  charge: { name: 'Blast Charge', short: 'CHARGE', field: false, col: '#ffb030', text: (g) => `Set at your feet, it arms in a moment and blasts the first thing that comes near: ${supplyChargeDmg(g)} damage to all round it.` },
};
const SUPPLY_ORDER = ['injector', 'cell', 'flare', 'ward', 'charge'];
const SUPPLY_GRADES = ['I', 'II', 'III'];
// Each grade's ore, [the plainer, the rarer]: a region's two.
const SUPPLY_ORE = [['ferrite', 'lumenite'], ['resonite', 'aetherglass'], ['sigilite', 'starmetal']];
// What each kind takes of its grade's two ores.
const SUPPLY_COST = { injector: [6, 0], cell: [0, 5], flare: [3, 2], ward: [4, 2], charge: [5, 1] };
// Every recipe, as data: { id, kind, grade, name, cost: { ore: n }, field, category }.
const CONSUMABLE_RECIPES = SUPPLY_ORDER.flatMap((kind) => [1, 2, 3].map((g) => {
  const [a, b] = SUPPLY_COST[kind], [lo, hi] = SUPPLY_ORE[g - 1], cost = {};
  if (a) cost[lo] = a;
  if (b) cost[hi] = b;
  return { id: kind + g, kind, grade: g, name: `${SUPPLY_KINDS[kind].name} ${SUPPLY_GRADES[g - 1]}`, cost, field: SUPPLY_KINDS[kind].field, category: 'Consumables' };
}));
function supplyRecipe(id) { return CONSUMABLE_RECIPES.find((r) => r.id === id) || null; }
function supplyChargeDmg(g) { const S = T.supplies.charge; return Math.round(S.dmg * Math.pow(T.enemies.hpGrowth, S.lvl[g - 1] - 1)); }

function supplyBelt() { const s = Save.data; if (!s.supplies || typeof s.supplies !== 'object') s.supplies = {}; return s.supplies; }
function supplyCount(kind) { const b = supplyBelt(); return [1, 2, 3].reduce((n, g) => n + (b[kind + g] || 0), 0); }
// The best grade of a kind on the belt, as its id, or null.
function supplyBest(kind) { const b = supplyBelt(); for (const g of [3, 2, 1]) if (b[kind + g] > 0) return kind + g; return null; }
// The kinds on the belt, in order.
function suppliesCarried() { return SUPPLY_ORDER.filter((k) => supplyCount(k) > 0); }
// The kind the deck's slot holds: the one chosen, or the first carried.
function supplyChosen() {
  const s = Save.data, have = suppliesCarried();
  if (!have.length) return null;
  if (!have.includes(s.supplySel)) s.supplySel = have[0];
  return s.supplySel;
}

// Can this be made from `src` (the stash, or the cargo in the field)?
// Returns the reason it can't, or ''.
function supplyBlock(r, src, field) {
  if (field && !r.field) return 'at home only';
  if (supplyCount(r.kind) >= T.supplies.most) return `you carry ${T.supplies.most}`;
  for (const k in r.cost) if ((src[k] || 0) < r.cost[k]) return `need ${r.cost[k]} ${stuffName(k)}`;
  return '';
}
// Makes one: paid from the stash at home, or from the cargo in the field.
function makeSupply(id, field) {
  const r = supplyRecipe(id), d = Game.dive, src = field ? d && d.cargo : Save.data.stash;
  if (!r || !src || supplyBlock(r, src, field)) return false;
  for (const k in r.cost) { src[k] -= r.cost[k]; if (!src[k]) delete src[k]; }
  const b = supplyBelt();
  b[id] = (b[id] || 0) + 1;
  if (!Save.data.supplySel) Save.data.supplySel = r.kind;
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
  if (!d || d.hub || d.dying || d.warp || Game.modal) return false;
  const id = supplyBest(kind);
  if (!id) return false;
  const g = Number(id.slice(-1)), p = d.p, S = T.supplies;
  supplyFloorCheck(d);
  if (kind === 'injector') {
    if (p.hp >= d.stats.maxHp) { UI.toast('Your health is full'); return false; }
    const n = Math.round(d.stats.maxHp * S.injector.heal[g - 1]);
    healPlayer(n);
    d.nums.push({ x: p.x + 8, y: p.y - 30, v: n, t: 0.9, plus: true, col: '#7ff0a0' });
    spawnSparks(p.x, p.y - 10, ['#c8ffd8', '#7ff0a0', '#ffffff'], 14);
    snd('heal');
  } else if (kind === 'cell') {
    if ((d.kindled && !d.deep) || d.pull >= 1) { UI.toast('Your light is full'); return false; }
    d.pull = Math.min(1, d.pull + S.cell.light[g - 1]);
    spawnSparks(p.x, p.y - 14, [ART.pal.star[3], ART.pal.star[2], '#ffffff'], 16);
    snd('waystone');
  } else if (kind === 'flare') {
    (d.flares = d.flares || []).push({ x: p.x, y: p.y + 2, t: S.flare.life[g - 1], life: S.flare.life[g - 1], r: S.flare.r[g - 1] * TILE });
    snd('beacon');
  } else if (kind === 'ward') {
    p.ward = Math.max(p.ward, S.ward.soak[g - 1]); p.wardT = S.ward.time; p.wardS = null;
    d.fx.push({ kind: 'ward', x: p.x, y: p.y - 6, t: 0.3, max: 0.3 });
    snd('seal');
  } else if (kind === 'charge') {
    (d.charges = d.charges || []).push({ x: p.x, y: p.y + 1, arm: S.charge.arm, dmg: supplyChargeDmg(g) });
    snd('pickup');
  }
  const b = supplyBelt();
  if (!--b[id]) delete b[id];
  Save.saveField('supplies');
  buzz(15);
  UI.tip('supply', 'Supplies are made from ore at the fabricator (SUPPLIES), or the simple ones from your cargo (MAKE)');
  return true;
}
// The slot moves on to the next kind carried.
function cycleSupply() {
  const have = suppliesCarried(), cur = supplyChosen();
  if (have.length < 2) return;
  Save.data.supplySel = have[(have.indexOf(cur) + 1) % have.length];
  snd('tap');
}

// Standing in a flare's light, your light doesn't drain (game.js updatePull).
function inFlare(d) { return !!(d.flares && d.flares.some((f) => dist(f.x, f.y, d.p.x, d.p.y) < f.r)); }

// Every step: flares burn down, charges arm and wait.
// (what was set down stays on its floor: a new place starts clear)
function supplyFloorCheck(d) { if (d.supplyFloor !== d.floor) { d.supplyFloor = d.floor; d.flares = []; d.charges = []; } }
function updateSupplies(d, dt) {
  supplyFloorCheck(d);
  if (d.flares && d.flares.length) { for (const f of d.flares) f.t -= dt; d.flares = d.flares.filter((f) => f.t > 0); }
  if (!d.charges || !d.charges.length) return;
  const S = T.supplies.charge;
  for (const c of d.charges) {
    if (c.arm > 0) { c.arm -= dt; continue; }
    if (!d.enemies.some((e) => !e.dead && !e.hid && e.type !== 'dummy' && dist(e.x, e.y, c.x, c.y) < S.trigger + e.r)) continue;
    c.gone = true;
    for (const e of d.enemies) if (!e.dead && !e.hid && e.type !== 'dummy' && dist(e.x, e.y, c.x, c.y) < S.r + e.r) { const a = norm(e.x - c.x, e.y - c.y); hurtEnemy(e, c.dmg, { heavy: true, knock: { x: a.x * 160, y: a.y * 160 } }); }
    d.fx.push({ kind: 'blast', x: c.x, y: c.y - 4, r: S.r, t: 0.35, max: 0.35 });
    spawnSparks(c.x, c.y - 4, ['#ffb030', '#ff7a3a', '#fff0c0'], 24);
    snd('thunder');
    buzz(40);
  }
  d.charges = d.charges.filter((c) => !c.gone);
}

// ---------------------------------------------------------------------------
// Drawn: flares and charges on the ground, among the actors
// ---------------------------------------------------------------------------
function supplyProps(d) {
  const out = [];
  for (const f of d.flares || []) out.push({ hubDraw: drawFlareProp, flare: f, hidden: true, y: f.y });
  for (const c of d.charges || []) out.push({ hubDraw: drawChargeProp, charge: c, hidden: true, y: c.y });
  return out;
}
function drawFlareProp(d, a, ox, oy, lights) {
  const f = a.flare, x = Math.round(f.x * AP) + ox, y = Math.round(f.y * AP) + oy, t = Game.realT, k = Math.min(1, f.t / 4);
  // the stick, planted, and its sputtering head
  drawShadow(x, y, 2);
  for (let i = 0; i < 9; i++) { dot(x, y - i, i < 2 ? '#3a1a10' : i % 3 ? '#b8402a' : '#e0c8a0'); dot(x + 1, y - i, i < 2 ? '#2a120a' : '#7a2a1a'); }
  const fl = 0.7 + 0.3 * Math.sin(t * 23 + f.x), hy = y - 10;
  for (const [i, j, c, a2] of [[0, 0, '#fff6dc', 1], [1, 0, '#fff0c0', 1], [0, -1, '#ffd27a', fl], [1, -1, '#ffb347', fl], [-1, 0, '#ff8a3a', fl], [2, 0, '#ff8a3a', fl], [0, 1, '#ff7a3a', 1], [1, 1, '#ff7a3a', 1], [0, -2, '#ff8a3a', fl * 0.7]]) dot(x + i, hy + j, c, true, a2);
  for (let i = 0; i < 6; i++) { const ph = (t * 1.3 + i / 6) % 1; dot(Math.round(x + Math.sin(i * 2.1 + ph * 5) * 3), Math.round(hy - 2 - ph * 14), i % 2 ? '#ff7a3a' : '#ffd27a', true, (1 - ph) * k); }
  // where its light reaches, faintly on the ground
  const R = f.r * AP, n = Math.round(R * 1.4);
  for (let i = 0; i < n; i++) if ((i + Math.floor(t * 4)) % 5 === 0) { const an = (i / n) * Math.PI * 2; dot(Math.round(x + Math.cos(an) * R), Math.round(y + Math.sin(an) * R * 0.6), '#ff9a50', true, 0.35 * k); }
  lights.push({ x, y: hy, r: f.r * 1.15, i: 1.3 * fl * (0.4 + 0.6 * k), c: rgb01('#ffb070') });
}
function drawChargeProp(d, a, ox, oy, lights) {
  const c = a.charge, x = Math.round(c.x * AP) + ox, y = Math.round(c.y * AP) + oy, armed = c.arm <= 0;
  drawShadow(x, y, 4);
  for (let i = -4; i <= 4; i++) for (let j = -3; j <= 0; j++) { if (Math.abs(i) === 4 && j < -1) continue; dot(x + i, y + j, j === -3 ? '#5a5a6a' : Math.abs(i) === 4 || j === 0 ? '#16161e' : j === -2 ? '#4a4a58' : '#30303c'); }
  for (const i of [-3, -1, 1, 3]) dot(x + i, y - 1, '#c8862a');
  if (on) { dot(x, y - 4, armed ? '#ff4a2a' : '#ffb030', true); dot(x, y - 5, armed ? '#ff8a6a' : '#ffd27a', true, 0.7); lights.push({ x, y: y - 4, r: TILE * 0.6, i: 0.6, c: rgb01(armed ? '#ff4a2a' : '#ffb030') }); }
}

// ---------------------------------------------------------------------------
// Icons: each kind drawn small, in its colour, with pips for its grade
// ---------------------------------------------------------------------------
const SUPPLY_ROWS = {
  injector: ['........oo.', '.......oMMo', '......oggo.', '.....oggo..', '....oggo...', '...oggo....', '..oMgo.....', '.oMMo......', '.wo........', 'w..........', '...........'],
  cell: ['...oMMMo...', '..oMMMMMo..', '..ogGGGgo..', '..ogGwGgo..', '..ogGGGgo..', '..ogGGGgo..', '..ogGwGgo..', '..ogGGGgo..', '..oMMMMMo..', '...ooooo...', '...........'],
  flare: ['....wG.....', '...GwgG....', '....Gg.....', '....oMo....', '....ogo....', '....ogo....', '....ogo....', '....ogo....', '....oMo....', '.....o.....', '...........'],
  ward: ['....ooo....', '..ooGGGoo..', '.oGgggggGo.', '.oggwwwggo.', '.oggwGwggo.', '.oggwwwggo.', '.oGgggggGo.', '..ooGGGoo..', '....ooo....', '...........', '...........'],
  charge: ['...........', '.....w.....', '....oGo....', '..ooMMMoo..', '.oMMMMMMMo.', '.oMgggggMMo', '.oMMMMMMMo.', '..ooooooo..', '...........', '...........', '...........'],
};
const _supplyIcons = {};
function supplyIconUrl(id) {
  if (_supplyIcons[id]) return _supplyIcons[id];
  const kind = id.replace(/\d$/, ''), g = Number(id.slice(-1)) || 0, rows = SUPPLY_ROWS[kind], col = SUPPLY_KINDS[kind].col;
  const pal = { o: '#14141c', M: '#8a8ea0', g: mix(col, '#000000', 0.25), G: col, w: '#ffffff' };
  const [c, x] = makeCanvas(13, 13);
  rows.forEach((row, j) => [...row].forEach((ch, i) => { if (pal[ch]) { x.fillStyle = pal[ch]; x.fillRect(i + 1, j + 1, 1, 1); } }));
  for (let k = 0; k < g; k++) { x.fillStyle = '#ffe48a'; x.fillRect(11 - k * 2, 11, 1, 1); }
  return (_supplyIcons[id] = c.toDataURL());
}

// ---------------------------------------------------------------------------
// The deck's quick-use slot, every frame (UI.frame)
// ---------------------------------------------------------------------------
function drawSupplyDeck(d) {
  const btn = $('btn-supply'), nxt = $('btn-supply-next');
  if (!btn) return;
  const kind = d && !d.hub && !d.dying ? supplyChosen() : null, many = kind && suppliesCarried().length > 1;
  if (btn.hidden !== !kind) btn.hidden = !kind;
  if (nxt.hidden !== !many) nxt.hidden = !many;
  if (!kind) return;
  const id = supplyBest(kind), key = `${id}:${supplyCount(kind)}`;
  if (btn.dataset.key !== key) {
    btn.dataset.key = key;
    btn.innerHTML = `<img class="btn-icon" src="${supplyIconUrl(id)}" alt=""><span>${SUPPLY_KINDS[kind].short} ${SUPPLY_GRADES[Number(id.slice(-1)) - 1]}</span><b class="supply-n">×${supplyCount(kind)}</b>`;
    btn.setAttribute('aria-label', `Use a ${SUPPLY_KINDS[kind].name} ${SUPPLY_GRADES[Number(id.slice(-1)) - 1]}, ${supplyCount(kind)} carried`);
  }
}
if (typeof document !== 'undefined' && document.getElementById('btn-supply')) {
  $('btn-supply').addEventListener('pointerdown', (e) => { e.preventDefault(); if (!Game.modal) useSupply(supplyChosen()); });
  $('btn-supply-next').addEventListener('pointerdown', (e) => { e.preventDefault(); if (!Game.modal) cycleSupply(); });
  window.addEventListener('keydown', (e) => {
    if (e.repeat || Game.modal || !Game.dive || Game.dive.hub) return;
    if (e.code === 'KeyQ') useSupply(supplyChosen());
    else if (e.code === 'KeyR') cycleSupply();
  });
}

// ---------------------------------------------------------------------------
// Making them: the SUPPLIES screen at home, and MAKE in the cargo screen
// ---------------------------------------------------------------------------
// The rows for each kind: what it does, how many are carried, and a MAKE for
// each grade with what it costs. field: from the cargo, the simple ones only.
function supplyRows(field) {
  const d = Game.dive, src = field ? (d && d.cargo) || {} : Save.data.stash;
  return SUPPLY_ORDER.filter((k) => !field || SUPPLY_KINDS[k].field).map((kind) => {
    const K = SUPPLY_KINDS[kind], n = supplyCount(kind);
    const grades = [1, 2, 3].map((g) => {
      const r = supplyRecipe(kind + g), why = supplyBlock(r, src, field);
      // (in the field, only what can be made: the rest is noise)
      if (field && why && why.startsWith('need')) return '';
      const cost = Object.keys(r.cost).map((k) => costTag(k, r.cost[k], src[k] || 0)).join(' ');
      return `<div class="supply-grade"><span class="supply-g">${SUPPLY_GRADES[g - 1]}</span><span class="supply-cost">${cost}<small>${esc(K.text(g))}</small></span><button class="mini" data-act="makeSupply" data-arg="${r.id}${field ? ':field' : ''}" ${why ? 'disabled' : ''}>${why && !why.startsWith('need') ? esc(why.toUpperCase()) : 'MAKE'}</button></div>`;
    }).join('');
    if (field && !grades) return '';
    return `<div class="supply-kind"><div class="row static"><img class="icon" src="${supplyIconUrl(supplyBest(kind) || kind + '1')}" alt=""><span class="row-text"><span class="row-name">${esc(K.name)}</span><span class="row-sub">Carried: ${n}/${T.supplies.most}${n ? ' · ' + [1, 2, 3].filter((g) => supplyBelt()[kind + g]).map((g) => `${SUPPLY_GRADES[g - 1]} ×${supplyBelt()[kind + g]}`).join(', ') : ''}</span></span></div>${grades}</div>`;
  }).join('');
}
function drawSupplies() {
  $('supplies-body').innerHTML = `<p class="note">Old ore makes supplies: the Rim's the plain ones (I), the Choir's better (II), the Underforge's the best (III). They ride on your belt, ${T.supplies.most} of each kind, safe whatever happens. Out there, the slot on the deck uses one; the small button beside it picks the next kind.</p>${supplyRows(false)}`;
}
// The cargo screen's MAKE section (ui.js drawCargo).
function supplyMakeHtml() {
  const rows = supplyRows(true), belt = suppliesCarried();
  const have = belt.length ? `<p class="note">On your belt: ${belt.map((k) => `${SUPPLY_KINDS[k].name} ×${supplyCount(k)}`).join(', ')}.</p>` : '';
  return `<h3>MAKE · SUPPLIES FROM YOUR ORE</h3>${have}${rows || '<p class="note">Nothing you carry makes a supply here. Injectors, Lightcells and Flares can be made from ore in the field.</p>'}`;
}

Object.assign(UI.acts, {
  makeSupply: (arg) => {
    const [id, where] = String(arg).split(':');
    if (makeSupply(id, where === 'field')) { UI.toast(`Made: ${supplyRecipe(id).name}`, 'legendary'); UI.redraw(); }
  },
  supplies: () => UI.show('screen-supplies'),
});
