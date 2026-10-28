'use strict';
// ---------------------------------------------------------------------------
// Reactions. Every element a hit carries leaves its status on the foe for a
// few seconds (T.circuits.react.status; longer when the caster's ore is
// attuned to it): Force a stagger mark, Shock a charge that builds to
// overload, Frost a chill that slows, Ember a burn, Blight a poison. A second
// element hitting a foe that still carries another's status reacts, in
// either order, and two elements on one Form react on their own:
//   Shatter  force + frost   ×1.6 on the chilled; the frozen burst
//   Conduct  frost + shock   the shock leaps to every chilled foe near
//   Steam    frost + ember   a cloud: foes in it lose the diver for 2 s
//   Brittle  frost + blight  +25% from everything
//   Pyre     ember + blight  the poison left bursts at once
//   Flare    ember + shock   blinds, and breaks wind-ups
//   Scatter  ember + force   burning ground flung the way of the knock
//   Jolt     force + shock   the stagger adds 2 overload
// and an element on itself stacks:
//   Overload  five shocks stun for a second
//   Freeze    three chills freeze solid
//   Inferno   burns stack, and spread
//   Plague    poison spreads on a hit, not only when its host falls
//   Stun      a second heavy Force hit stuns
// Each reaction's name flashes once over its target in the pixel hand, and
// Wick says what it was the first time. The statuses are Tycho's
// (FOE_STATUS), and so is the reacting (FOE_REACT, Tycho.harm.react, with
// this file's REACT_DO): both are stages of hurtEnemy's pipeline
// (combat.js), the reactions before the damage lands and the statuses
// after (foeStatusesLeft).
// ---------------------------------------------------------------------------

// Each reaction's name and colour (a function, as the colours are drawn
// from the elements').
const REACTIONS = {
  shatter: { name: 'Shatter', col: () => '#e8f8ff' },
  conduct: { name: 'Conduct', col: () => ELEMENT_COLS.shock },
  steam: { name: 'Steam', col: () => '#dfe8f0' },
  brittle: { name: 'Brittle', col: () => ELEMENT_COLS.blight },
  pyre: { name: 'Pyre', col: () => ELEMENT_COLS.ember },
  flare: { name: 'Flare', col: () => '#fff2a0' },
  scatter: { name: 'Scatter', col: () => ELEMENT_COLS.ember },
  jolt: { name: 'Jolt', col: () => ELEMENT_COLS.shock },
  overload: { name: 'Overload', col: () => ELEMENT_COLS.shock },
  freeze: { name: 'Freeze', col: () => ELEMENT_COLS.frost },
  inferno: { name: 'Inferno', col: () => ELEMENT_COLS.ember },
  plague: { name: 'Plague', col: () => ELEMENT_COLS.blight },
  stun: { name: 'Stun', col: () => ELEMENT_COLS.force },
};
// Which pair makes which (REACT_PAIRS, in circuits.js), as Tycho's table.
const REACT_TABLE = new Tycho.harm.Reactions(REACT_PAIRS);

// What a hit leaves on a foe, on Tycho's statuses (Tycho.harm.Statuses),
// each where the foe keeps it: the mark of each element (e.st[el], which
// the next element reacts with; as it wears off, that element's stacks go
// too), the chill (e.slowT), a burn and a poison (e.burn and e.blight, each
// eating at it, a number every half second; burns stack to the Inferno's
// most, a poison takes the stronger), the brittle, the frozen and the heavy
// blow ringing, a stun and a loss (worn by the foe's own step, enemies.js),
// and the stacks of shock and chill that overload and freeze.
const FOE_STATUS = new Tycho.harm.Statuses([
  ...CORE_ELEMENTS.map((el) => ({ id: el, at: ['st', el], time: () => T.circuits.react.status, wear: 'clear', ends: (e) => { if (e.stk) e.stk[el] = 0; } })),
  { id: 'chill', at: 'slowT', time: () => T.onHit.chillTime, wear: 'clamp' },
  { id: 'burn', dose: 'dps', time: () => T.elements.burnTime, every: 0.5, stack: 'add', most: () => T.circuits.react.inferno.most, spread: { r: () => T.circuits.react.inferno.r } },
  { id: 'poison', at: 'blight', dose: 'dps', time: () => T.elements.blightTime, every: 0.5, stack: 'refresh', spread: { r: () => T.circuits.react.plague.r } },
  { id: 'brittle', at: 'brittleT', time: () => T.circuits.react.status, stack: 'set', wear: 'down' },
  { id: 'frozen', at: 'frozenT', stack: 'set', wear: 'down' },
  { id: 'heavy', at: 'heavyT', time: () => T.circuits.react.status, stack: 'set', wear: 'down' },
  { id: 'stun', at: 'stunT' },
  { id: 'lost', at: 'lostT' },
  { id: 'shockStack', at: ['stk', 'shock'], stack: 'count', most: () => T.circuits.react.overload.stacks },
  { id: 'frostStack', at: ['stk', 'frost'], stack: 'count', most: () => T.circuits.react.freeze.stacks },
]);

// Whether a foe still carries an element's status.
function carries(e, el) {
  if (FOE_STATUS.has(e, el)) return true;
  if (el === 'frost') return FOE_STATUS.has(e, 'chill') || FOE_STATUS.has(e, 'frozen');
  if (el === 'ember') return FOE_STATUS.has(e, 'burn');
  if (el === 'blight') return FOE_STATUS.has(e, 'poison');
  return false;
}
const reactReady = (e, id) => !(e.rcd && e.rcd[id] > Game.t);
// How long a stun, a freeze, a blinding or a loss holds a foe: a boss a
// share of it, the Hollow none.
const reactControl = (e, t) => (e.type === 'hollow' ? 0 : e.boss ? t * T.circuits.react.control : t);

// A reaction's name over its target, once (not again while it shows).
function reactWord(e, word, col) {
  const d = Game.dive, W = T.circuits.react.word;
  e.reactWordAt = Game.realT;
  if (d.nums.some((n) => n.foe === e && n.word === word && n.t > W - 0.4)) return;
  d.nums.push({ x: e.x, y: e.y - 26, word, col, t: W, foe: e });
}
// A reaction fired: its name, its wait before it can fire on this foe
// again, and Wick's word the first time.
function reactFired(e, id) {
  (e.rcd || (e.rcd = {}))[id] = Game.t + T.circuits.react.cd;
  reactWord(e, REACTIONS[id].name.toUpperCase(), REACTIONS[id].col());
  snd('react', { x: e.x, y: e.y });
  Story.say('react_' + id);
}

// What each pair does, given the hit (h.to the foe, h.kinds its elements,
// h.amount the damage after its nature, h.blow the rest); it may add flat
// damage to h.extra, and sends what it does to the foes about as blows of
// its own (h.send). Each returns the hit's multiplier, or null when there
// was nothing for it to do.
const REACT_DO = {
  shatter(h) {
    const d = Game.dive, R = T.circuits.react.shatter, e = h.to, S = FOE_STATUS;
    d.fx.push({ kind: 'shatter', x: e.x, y: e.y - 6, t: 0.3, max: 0.3 });
    if (S.has(e, 'frozen')) {
      // the frozen burst, and the shards hurt what's round them
      S.clear(e, 'frozen'); e.stunT = Math.min(e.stunT, 0.05);
      d.fx.push({ kind: 'iceBurst', x: e.x, y: e.y - 6, r: R.burst, t: 0.35, max: 0.35 });
      for (const q of d.enemies) if (!q.dead && q !== e && dist(q.x, q.y, e.x, e.y) < R.burst + q.r) h.send(q, { amount: h.amount * R.burstMult, kinds: ['frost'], noProc: true, spell: true });
    }
    // the chill is spent (a frost hit lays its own again)
    S.clear(e, 'chill');
    S.clear(e, 'frost');
    S.clear(e, 'frostStack');
    if (!h.kinds.includes('force')) S.clear(e, 'force');
    return R.mult;
  },
  conduct(h) {
    const d = Game.dive, R = T.circuits.react.conduct, e = h.to, share = h.amount / h.kinds.length;
    let n = 0;
    for (const q of d.enemies) {
      if (q.dead || q === e || !carries(q, 'frost') || dist(q.x, q.y, e.x, e.y) > R.range) continue;
      d.fx.push({ kind: 'arc', x: e.x, y: e.y - 5, x2: q.x, y2: q.y - 5, t: 0.2, max: 0.2, col: ELEMENT_COLS.shock });
      h.send(q, { amount: share * R.mult, kinds: ['shock'], noProc: true, spell: true });
      n++;
    }
    return n ? 1 : null;
  },
  steam(h) {
    const d = Game.dive, R = T.circuits.react.steam, e = h.to, S = FOE_STATUS;
    d.fx.push({ kind: 'steam', x: e.x, y: e.y - 4, r: R.r, t: R.cloud, max: R.cloud });
    for (const q of d.enemies) if (!q.dead && dist(q.x, q.y, e.x, e.y) < R.r + q.r) reactLose(q, R.lost);
    // the chill and the burn cancel out
    S.clear(e, 'chill'); S.clear(e, 'burn');
    S.clear(e, 'frost'); S.clear(e, 'ember');
    return 1;
  },
  brittle(h) {
    FOE_STATUS.give(h.to, 'brittle');
    return 1;
  },
  pyre(h) {
    const e = h.to, b = FOE_STATUS.get(e, 'poison');
    if (!b) return null;
    // the poison left, all at once, as fire
    h.extra = (h.extra || 0) + b.dps * b.t * T.circuits.react.pyre.mult * elementMultFor(e, 'ember');
    FOE_STATUS.clear(e, 'poison');
    FOE_STATUS.clear(e, 'blight');
    castFxSpot(e.x, e.y - 4, 'ember', 1.5);
    return 1;
  },
  flare(h) {
    const d = Game.dive, R = T.circuits.react.flare, e = h.to;
    d.fx.push({ kind: 'flare', x: e.x, y: e.y - 8, r: R.r, t: 0.3, max: 0.3 });
    for (const q of d.enemies) if (!q.dead && dist(q.x, q.y, e.x, e.y) < R.r + q.r) reactLose(q, R.blind);
    return 1;
  },
  scatter(h) {
    const d = Game.dive, R = T.circuits.react.scatter, p = d.p, e = h.to, kn = h.blow.knock;
    const k = kn && Math.hypot(kn.x, kn.y) > 1 ? norm(kn.x, kn.y) : norm(e.x - p.x, e.y - p.y);
    let n = 0;
    for (let i = 1; i <= R.n; i++) {
      const x = e.x + k.x * R.step * i, y = e.y + k.y * R.step * i;
      if (TILE_SOLID[floorTile(d.floor, Math.floor(x / TILE), Math.floor(y / TILE))]) break;
      d.puddles.push({ x, y, r: R.r, t: R.time, max: R.time, dps: h.amount * R.dps, mine: true, els: ['ember'], col: ELEMENT_COLS.ember, every: 0.5, fire: true });
      n++;
    }
    return n ? 1 : null;
  },
  jolt(h) {
    reactStack(h.to, 'shock', T.circuits.react.jolt.stacks);
    return 1;
  },
};
// The hit's reactions, a stage of hurtEnemy's (combat.js): Tycho's react
// stage asks REACT_TABLE which pairs a hit of its elements makes with
// itself and with what the foe carries, and runs each ready one's own.
const FOE_REACT = Tycho.harm.react({ table: REACT_TABLE, kinds: CORE_ELEMENTS, carries, do: REACT_DO, ready: reactReady, fired: reactFired, when: (h) => !h.blow.noProc });

// A foe loses the diver (steam) or is blinded (flare): it breaks off any
// wind-up and wanders a moment.
function reactLose(q, t) {
  const k = reactControl(q, t);
  if (k <= 0) return;
  FOE_STATUS.give(q, 'lost', { time: k });
  if (q.state === 'windup') { q.state = q.type === 'snapjaw' || q.type === 'spitter' ? 'rest' : 'chase'; q.cd = Math.max(q.cd, 0.6); }
}
// Held still a moment (overload, a second heavy blow); a wind-up is broken.
function reactStun(e, t) {
  const k = reactControl(e, t);
  if (k <= 0) return;
  FOE_STATUS.give(e, 'stun', { time: k }); e.kx = e.ky = 0;
  if (e.state === 'windup') { e.state = e.type === 'snapjaw' || e.type === 'spitter' ? 'rest' : 'chase'; e.cd = Math.max(e.cd, 0.4); }
}

// Stacks of shock or chill; enough of them overload or freeze.
function reactStack(e, el, n) {
  const R = T.circuits.react;
  if (FOE_STATUS.give(e, el + 'Stack', { n }) !== 'full') return;
  if (el === 'shock') {
    reactStun(e, R.overload.stun);
    Game.dive.fx.push({ kind: 'overload', x: e.x, y: e.y - 6, t: 0.35, max: 0.35 });
    reactFired(e, 'overload');
  } else {
    const k = reactControl(e, R.freeze.time);
    if (k > 0) { FOE_STATUS.give(e, 'frozen', { time: k }); FOE_STATUS.give(e, 'stun', { time: k }); e.kx = e.ky = 0; if (e.state === 'windup') e.state = e.type === 'snapjaw' || e.type === 'spitter' ? 'rest' : 'chase'; }
    reactFired(e, 'freeze');
  }
}

// A hit of its elements has landed (a stage of hurtEnemy's, after the
// reactions, for h.amount): each element's status, and what an element does
// stacked on itself.
function foeStatusesLeft(h) {
  const e = h.to;
  if (!h.kinds || h.blow.noProc) return;
  if (e.dead) { h.stop(); return; }
  const d = Game.dive, R = T.circuits.react, El = T.elements, O = T.onHit, S = FOE_STATUS, b = h.blow, els = h.kinds, share = h.amount / els.length;
  for (const el of els) {
    const k = (b.att && b.att.includes(el) ? T.circuits.attuned.status : 1) * (b.statusK || 1);
    S.give(e, el, { scale: k });
    if (el === 'shock') {
      if (h.rng.chance(El.shockChance)) {
        const q = nearestEnemy(d, O.shockRange, e, e);
        if (q) { d.fx.push({ kind: 'arc', x: e.x, y: e.y - 5, x2: q.x, y2: q.y - 5, t: 0.15, max: 0.15, col: ELEMENT_COLS.shock }); h.send(q, { amount: share * O.shockMult, kinds: ['shock'], noProc: true, spell: true }); }
      }
      reactStack(e, 'shock', 1);
    } else if (el === 'frost') {
      S.give(e, 'chill', { scale: k });
      if (!S.has(e, 'frozen')) reactStack(e, 'frost', 1);
    } else if (el === 'ember') {
      // Inferno: burns stack; at the most, they spread
      const add = share * El.burn;
      if (S.give(e, 'burn', { amount: add, scale: k }) === 'most' && reactReady(e, 'inferno')) {
        S.spread(e, 'burn', d.enemies, { who: (q) => !q.dead, take: (q) => !q.burn || q.burn.dps < add, as: () => ({ t: El.burnTime, dps: add, n: 1 }) });
        castFxSpot(e.x, e.y - 4, 'ember', 1);
        reactFired(e, 'inferno');
      }
    } else if (el === 'blight') {
      // Plague: poison on the poisoned spreads at once
      if (S.give(e, 'poison', { amount: share * El.blight, scale: k }) === 'again' && reactReady(e, 'plague')) {
        const n = S.spread(e, 'poison', d.enemies, { who: (q) => !q.dead, take: (q, s) => !q.blight || q.blight.dps < s.dps, as: (s) => ({ t: El.blightTime, dps: s.dps }) });
        if (n) reactFired(e, 'plague');
      }
    } else if (el === 'force' && b.heavy) {
      // a second heavy blow while the first still rings
      if (S.has(e, 'heavy') && reactReady(e, 'stun')) { S.clear(e, 'heavy'); reactStun(e, R.stun.time); reactFired(e, 'stun'); }
      else S.give(e, 'heavy', { scale: k });
    }
  }
}

// Each step (world time): statuses and stacks wear off (and a warded
// shell's flash fades).
function reactTick(e, dt) {
  FOE_STATUS.wear(e, dt);
  if (e.wardHit > 0) e.wardHit -= dt;
}

// ---------------------------------------------------------------------------
// Drawing (render.js calls these), in whole art px; nothing shakes, and
// what flares lights only the ground round it
// ---------------------------------------------------------------------------
// A foe's statuses, over its sprite: frozen in a rim of ice, brittle with
// cracks, lost (two grey motes circling), the crackle of overload building,
// and a warded elite's shell, cracked by each Force hit.
function drawEnemyStatus(d, e, spr, sx, sy, fx, fy, tick, lights) {
  if (e.frozenT > 0) {
    View.ctx.drawImage(spriteRim(spr, '#c8f0ff'), sx - 1, sy - 1);
    for (let k = 0; k < 4; k++) { const h = hashInts(k, (e.x * 7) | 0, 0x1ce); dot(sx + 1 + (h % Math.max(1, spr.w - 2)), sy + 1 + ((h >> 8) % Math.max(1, Math.round(spr.h * 0.4))), k ? '#e8f8ff' : '#ffffff', true, 0.9); }
    cfxLight(lights, fx, fy - spr.h / 2, TILE, 0.4, rgb01(ELEMENT_COLS.frost));
  }
  if (e.brittleT > 0 && tick % 3 !== 0) for (const [i, j] of [[-2, -6], [-1, -5], [0, -5], [1, -4], [2, -8], [3, -7]]) dot(fx + ap(i), sy + Math.round(spr.h * 0.5) + j, j > -6 ? '#dff0c8' : ELEMENT_COLS.blight, true, 0.8);
  if (e.lostT > 0) for (let k = 0; k < 2; k++) { const a = Game.realT * 4 + k * Math.PI; dot(Math.round(fx + Math.cos(a) * 5 * AP), Math.round(sy - ap(1) + Math.sin(a) * 1.5 * AP), '#b8c0d0', false); }
  const stk = e.stk && e.stk.shock;
  if (stk >= 2) for (let k = 0; k < stk; k++) dot(fx + FX_R.i(-6, 6), sy + FX_R.i(2, Math.max(3, spr.h - 4)), k % 2 ? '#ffffff' : ELEMENT_COLS.shock, true, 0.8);
  if (e.ward > 0) {
    // a shell round it: a ring of pale light, broken where it's cracked
    const rx = Math.round(spr.w / 2 + 3), ry = Math.round(spr.h / 2 + 2), cy = sy + Math.round(spr.h / 2), cracks = (e.wardMax || e.ward) - e.ward;
    const hit = e.wardHit > 0, col = hit ? '#ffffff' : ELEMENT_COLS.force;
    for (const [x, y, a] of cfxEllipse(rx, ry)) {
      let gap = false;
      for (let c = 0; c < cracks; c++) { const ca = -2.2 + c * 2.1; if (Math.abs(Math.atan2(Math.sin(a - ca), Math.cos(a - ca))) < 0.35) gap = true; }
      if (gap || ((x + y) & 1 && !hit && y > 0)) continue;
      dot(fx + x, cy + y, y < -ry * 0.5 && x < 0 ? '#ffffff' : col, true, y > 0 ? 0.55 : 0.9);
    }
    cfxLight(lights, fx, cy, TILE * 0.9, hit ? 0.8 : 0.3, rgb01(ELEMENT_COLS.force));
  }
}

// A reaction's burst: ice shards, a cloud of steam, a flare, an overload's
// sparks, a ward's shell breaking. k: the share of its life left.
function drawReactFx(fx, cx, cy, k, tick, lights) {
  const u = 1 - k;
  if (fx.kind === 'iceBurst') {
    // the ice bursts as a crystal does: long facets out on six axes, short
    // ones between, a crisp ring at their tips
    const r = Math.round((2 + u * fx.r) * AP);
    cfxShards(cx, cy, r, 6, cfxRamp(ELEMENT_COLS.frost), cfxBand(k), cfxSeed(fx), true);
    hlRingHard(cx, cy, r + 2, ELEMENT_COLS.frost, 0.7, k);
    cfxLight(lights, cx, cy, fx.r * 1.2, 0.9 * k, rgb01(ELEMENT_COLS.frost));
  } else if (fx.kind === 'steam') {
    // puffs that rise and thin out, in a few hard steps; their tops catch
    // the light of the fire and ice that made them, so they read in the dark
    const R = fx.r * AP;
    for (let n = 0; n < 26; n++) {
      const h = hashInts(n, (fx.x * 3) | 0, 0x57e), x = Math.round(cx + ((h & 255) / 255 * 2 - 1) * R * (0.6 + u * 0.4)), y = Math.round(cy - ((h >> 8) & 255) / 255 * R * 0.7 - u * ap(8) + ap(4));
      const a = cfxBand(k) * 0.8, big = n % 3 !== 0;
      // a puff: a pale top, a grey belly
      for (const [i, j] of big ? [[0, 0], [1, 0], [2, 0], [3, 0], [1, -1], [2, -1], [0, 1], [1, 1], [2, 1]] : [[0, 0], [1, 0], [0, -1]]) dot(x + i, y + j, j < 0 ? '#f2f6fa' : j > 0 ? '#9aa4b2' : '#cfd8e0', j < 0 && n % 2 === 0, a);
    }
    cfxLight(lights, cx, cy, fx.r, 0.35 * k, [0.85, 0.9, 0.95]);
  } else if (fx.kind === 'flare') {
    // blinding: a white diamond, a long flat streak across it (a lens's
    // flare), a short one up and down, and a crisp ring running out
    const r = Math.max(2, Math.round((2 + u * fx.r) * AP)), R = cfxRamp('#fff2a0'), b = cfxBand(k), L = Math.round(ap(fx.r) * (0.6 + u));
    hlDiamond(cx, cy, 2 + Math.round(k * 2), '#ffffff', b);
    for (let s = 1; s <= L; s++) { const c = R[s < L * 0.3 ? 4 : s < L * 0.7 ? 3 : 2]; dot(cx + s, cy, c, true, b); dot(cx - s, cy, c, true, b); }
    for (let s = 1; s <= Math.round(L * 0.3); s++) { dot(cx, cy + s, R[3], true, b); dot(cx, cy - s, R[3], true, b); }
    hlRingHard(cx, cy, r, '#fff2a0', 0.75, k);
    cfxLight(lights, cx, cy, fx.r * 1.6, 1.4 * k, rgb01('#fff2a0'));
  } else if (fx.kind === 'overload') {
    // four emitter nodes round it, arcs jumping between them and into it
    const R = cfxRamp(ELEMENT_COLS.shock), b = cfxBand(k), ft = Math.floor(Game.realT * 30), sd = cfxSeed(fx), r = Math.round(ap(7) + u * ap(4));
    const nodes = [[cx + r, cy], [cx, cy + Math.round(r * 0.75)], [cx - r, cy], [cx, cy - Math.round(r * 0.75)]];
    for (let q = 0; q < 4; q++) {
      const a = nodes[q], c = nodes[(q + 1) % 4];
      if ((q + ft) % 2 === 0) cfxPaintBolt(cfxBoltPath(a[0], a[1], c[0], c[1], sd + ft + q, 0.25), R, b, 0.7, sd + q);
      if (u < 0.5 && q === ft % 4) cfxPaintBolt(cfxBoltPath(a[0], a[1], cx, cy, sd + ft + 9, 0.3), R, b, 0.9, sd);
      hlDiamond(a[0], a[1], 1, R[4], b, HL_GOLD[4]);
    }
    cfxLight(lights, cx, cy, TILE * 1.6, 1.1 * k, rgb01(ELEMENT_COLS.shock));
  } else if (fx.kind === 'wardBreak') {
    // the shell breaking into plates of hard light that fly out and fall,
    // each switching off in scan-lines
    const R = cfxRamp(ELEMENT_COLS.force), sd = cfxSeed(fx), b = cfxBand(k);
    for (let q = 0; q < 10; q++) {
      const a = (q / 10) * Math.PI * 2 + artHash(q, 1, sd) * 0.5, d = ap(6) + u * ap(10 + artHash(q, 2, sd) * 6), x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d * 0.75 + u * u * ap(8));
      for (const [i, j] of [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1]]) if (u < 0.5 || (y + j) % 2) dot(x + i, y + j, j ? R[2] : R[q % 3 ? 3 : 4], true, b);
    }
    cfxLight(lights, cx, cy, TILE * 1.4, 0.9 * k, rgb01(ELEMENT_COLS.force));
  }
}
