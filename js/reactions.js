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
// Wick says what it was the first time. hurtEnemy (combat.js) calls
// circuitReact before the damage lands and circuitStatuses after.
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
// (which pair makes which: REACT_PAIRS, in circuits.js)

// Whether a foe still carries an element's status.
function carries(e, el) {
  if (e.st && e.st[el] > 0) return true;
  if (el === 'frost') return e.slowT > 0 || e.frozenT > 0;
  if (el === 'ember') return !!e.burn;
  if (el === 'blight') return !!e.blight;
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
  Story.say('react_' + id);
}

// A hit of `els` is about to land on e: the reactions it sets off.
// o: { dmg (after its nature), heavy, knock, att (attuned elements) }; it
// may add flat damage to o.extra. Returns the hit's multiplier.
function circuitReact(e, els, o) {
  const fired = [];
  const add = (id) => { if (id && !fired.includes(id)) fired.push(id); };
  if (els.length > 1) add(reactPair(els[0], els[1]));
  for (const el of els) for (const c of CORE_ELEMENTS) if (c !== el && carries(e, c)) add(reactPair(el, c));
  let mult = 1;
  for (const id of fired) {
    if (!reactReady(e, id)) continue;
    const m = REACT_DO[id](e, els, o);
    if (m === null) continue;
    mult *= m;
    reactFired(e, id);
  }
  return mult;
}

// What each pair does. Each returns the hit's multiplier, or null when
// there was nothing for it to do.
const REACT_DO = {
  shatter(e, els, o) {
    const d = Game.dive, R = T.circuits.react.shatter;
    d.fx.push({ kind: 'shatter', x: e.x, y: e.y - 6, t: 0.3, max: 0.3 });
    if (e.frozenT > 0) {
      // the frozen burst, and the shards hurt what's round them
      e.frozenT = 0; e.stunT = Math.min(e.stunT, 0.05);
      d.fx.push({ kind: 'iceBurst', x: e.x, y: e.y - 6, r: R.burst, t: 0.35, max: 0.35 });
      for (const q of d.enemies) if (!q.dead && q !== e && dist(q.x, q.y, e.x, e.y) < R.burst + q.r) hurtEnemy(q, o.dmg * R.burstMult, { els: ['frost'], noProc: true, spell: true });
    }
    // the chill is spent (a frost hit lays its own again)
    e.slowT = 0;
    if (e.st) e.st.frost = 0;
    if (e.stk) e.stk.frost = 0;
    if (!els.includes('force') && e.st) e.st.force = 0;
    return R.mult;
  },
  conduct(e, els, o) {
    const d = Game.dive, R = T.circuits.react.conduct, share = o.dmg / els.length;
    let n = 0;
    for (const q of d.enemies) {
      if (q.dead || q === e || !carries(q, 'frost') || dist(q.x, q.y, e.x, e.y) > R.range) continue;
      d.fx.push({ kind: 'arc', x: e.x, y: e.y - 5, x2: q.x, y2: q.y - 5, t: 0.2, max: 0.2, col: ELEMENT_COLS.shock });
      hurtEnemy(q, share * R.mult, { els: ['shock'], noProc: true, spell: true });
      n++;
    }
    return n ? 1 : null;
  },
  steam(e) {
    const d = Game.dive, R = T.circuits.react.steam;
    d.fx.push({ kind: 'steam', x: e.x, y: e.y - 4, r: R.r, t: R.cloud, max: R.cloud });
    for (const q of d.enemies) if (!q.dead && dist(q.x, q.y, e.x, e.y) < R.r + q.r) reactLose(q, R.lost);
    // the chill and the burn cancel out
    e.slowT = 0; e.burn = null;
    if (e.st) e.st.frost = e.st.ember = 0;
    return 1;
  },
  brittle(e) {
    e.brittleT = T.circuits.react.status;
    return 1;
  },
  pyre(e, els, o) {
    const b = e.blight;
    if (!b) return null;
    // the poison left, all at once, as fire
    o.extra = (o.extra || 0) + b.dps * b.t * T.circuits.react.pyre.mult * elementMultFor(e, 'ember');
    e.blight = null;
    if (e.st) e.st.blight = 0;
    castFxSpot(e.x, e.y - 4, 'ember', 1.5);
    return 1;
  },
  flare(e) {
    const d = Game.dive, R = T.circuits.react.flare;
    d.fx.push({ kind: 'flare', x: e.x, y: e.y - 8, r: R.r, t: 0.3, max: 0.3 });
    for (const q of d.enemies) if (!q.dead && dist(q.x, q.y, e.x, e.y) < R.r + q.r) reactLose(q, R.blind);
    return 1;
  },
  scatter(e, els, o) {
    const d = Game.dive, R = T.circuits.react.scatter, p = d.p;
    const k = o.knock && Math.hypot(o.knock.x, o.knock.y) > 1 ? norm(o.knock.x, o.knock.y) : norm(e.x - p.x, e.y - p.y);
    let n = 0;
    for (let i = 1; i <= R.n; i++) {
      const x = e.x + k.x * R.step * i, y = e.y + k.y * R.step * i;
      if (TILE_SOLID[floorTile(d.floor, Math.floor(x / TILE), Math.floor(y / TILE))]) break;
      d.puddles.push({ x, y, r: R.r, t: R.time, max: R.time, dps: o.dmg * R.dps, mine: true, els: ['ember'], col: ELEMENT_COLS.ember, every: 0.5, fire: true });
      n++;
    }
    return n ? 1 : null;
  },
  jolt(e) {
    reactStack(e, 'shock', T.circuits.react.jolt.stacks);
    return 1;
  },
};

// A foe loses the diver (steam) or is blinded (flare): it breaks off any
// wind-up and wanders a moment.
function reactLose(q, t) {
  const k = reactControl(q, t);
  if (k <= 0) return;
  q.lostT = Math.max(q.lostT || 0, k);
  if (q.state === 'windup') { q.state = q.type === 'snapjaw' || q.type === 'spitter' ? 'rest' : 'chase'; q.cd = Math.max(q.cd, 0.6); }
}
// Held still a moment (overload, a second heavy blow); a wind-up is broken.
function reactStun(e, t) {
  const k = reactControl(e, t);
  if (k <= 0) return;
  e.stunT = Math.max(e.stunT, k); e.kx = e.ky = 0;
  if (e.state === 'windup') { e.state = e.type === 'snapjaw' || e.type === 'spitter' ? 'rest' : 'chase'; e.cd = Math.max(e.cd, 0.4); }
}

// Stacks of shock or chill; enough of them overload or freeze.
function reactStack(e, el, n) {
  const R = T.circuits.react, stk = e.stk || (e.stk = {});
  stk[el] = (stk[el] || 0) + n;
  if (el === 'shock' && stk.shock >= R.overload.stacks) {
    stk.shock = 0;
    reactStun(e, R.overload.stun);
    Game.dive.fx.push({ kind: 'overload', x: e.x, y: e.y - 6, t: 0.35, max: 0.35 });
    reactFired(e, 'overload');
  } else if (el === 'frost' && stk.frost >= R.freeze.stacks) {
    stk.frost = 0;
    const k = reactControl(e, R.freeze.time);
    if (k > 0) { e.frozenT = k; e.stunT = Math.max(e.stunT, k); e.kx = e.ky = 0; if (e.state === 'windup') e.state = e.type === 'snapjaw' || e.type === 'spitter' ? 'rest' : 'chase'; }
    reactFired(e, 'freeze');
  }
}

// A hit of `els` has landed for dmg: each element's status, and what an
// element does stacked on itself. o: { heavy, att }.
function circuitStatuses(e, els, dmg, o) {
  const d = Game.dive, R = T.circuits.react, El = T.elements, O = T.onHit, share = dmg / els.length;
  const st = e.st || (e.st = {});
  for (const el of els) {
    const k = o.att && o.att.includes(el) ? T.circuits.attuned.status : 1, had = carries(e, el);
    st[el] = Math.max(st[el] || 0, R.status * k);
    if (el === 'shock') {
      if (d.rng.chance(El.shockChance)) {
        const q = nearestEnemy(d, O.shockRange, e, e);
        if (q) { d.fx.push({ kind: 'arc', x: e.x, y: e.y - 5, x2: q.x, y2: q.y - 5, t: 0.15, max: 0.15, col: ELEMENT_COLS.shock }); hurtEnemy(q, share * O.shockMult, { els: ['shock'], noProc: true, spell: true }); }
      }
      reactStack(e, 'shock', 1);
    } else if (el === 'frost') {
      e.slowT = Math.max(e.slowT, O.chillTime * k);
      if (!(e.frozenT > 0)) reactStack(e, 'frost', 1);
    } else if (el === 'ember') {
      const add = share * El.burn, b = e.burn;
      if (b && had) {
        // Inferno: burns stack; at the most, they spread
        b.n = Math.min(R.inferno.most, (b.n || 1) + 1);
        b.dps = Math.min(b.dps + add, add * R.inferno.most);
        b.t = Math.max(b.t, El.burnTime * k);
        if (b.n >= R.inferno.most && reactReady(e, 'inferno')) {
          for (const q of d.enemies) if (!q.dead && q !== e && dist(q.x, q.y, e.x, e.y) < R.inferno.r + q.r && (!q.burn || q.burn.dps < add)) q.burn = { t: El.burnTime, dps: add, n: 1 };
          castFxSpot(e.x, e.y - 4, 'ember', 1);
          reactFired(e, 'inferno');
        }
      } else e.burn = { t: El.burnTime * k, dps: add, n: 1 };
    } else if (el === 'blight') {
      const was = e.blight, dps = share * El.blight;
      e.blight = { t: El.blightTime * k, dps: Math.max(dps, was ? was.dps : 0) };
      // Plague: poison on the poisoned spreads at once
      if (was && reactReady(e, 'plague')) {
        let n = 0;
        for (const q of d.enemies) if (!q.dead && q !== e && dist(q.x, q.y, e.x, e.y) < R.plague.r + q.r && (!q.blight || q.blight.dps < e.blight.dps)) { q.blight = { t: El.blightTime, dps: e.blight.dps }; n++; }
        if (n) reactFired(e, 'plague');
      }
    } else if (el === 'force' && o.heavy) {
      // a second heavy blow while the first still rings
      if (e.heavyT > 0 && reactReady(e, 'stun')) { e.heavyT = 0; reactStun(e, R.stun.time); reactFired(e, 'stun'); }
      else e.heavyT = R.status * k;
    }
  }
}

// Each step (world time): statuses and stacks wear off.
function reactTick(e, dt) {
  const st = e.st;
  if (st) for (const el in st) if (st[el] > 0 && (st[el] -= dt) <= 0) { st[el] = 0; if (e.stk) e.stk[el] = 0; }
  if (e.heavyT > 0) e.heavyT -= dt;
  if (e.brittleT > 0) e.brittleT -= dt;
  if (e.frozenT > 0) e.frozenT -= dt;
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
    // shards of ice thrown out, and a broken ring at their tips
    const r = Math.round((2 + u * fx.r) * AP), R = cfxRamp(ELEMENT_COLS.frost);
    cfxRays(cx, cy, r * 0.45, r, 12, R, cfxBand(k), cfxSeed(fx));
    cfxStrokeRing(cx, cy, r, Math.round(r * 0.7), R, cfxBand(k) * 0.8, cfxSeed(fx), false, 0.35);
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
    const r = Math.max(2, Math.round((2 + u * fx.r) * AP)), R = cfxRamp('#fff2a0');
    cfxStrokeRing(cx, cy, r, Math.round(r * 0.75), R, cfxBand(k), cfxSeed(fx), true, 0.2);
    for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let s = 1; s < Math.round(ap(5) * k) + 2; s++) dot(cx + i * s, cy + j * s, R[s < 3 ? 4 : 3], true, cfxBand(k));
    cfxLight(lights, cx, cy, fx.r * 1.6, 1.4 * k, rgb01('#fff2a0'));
  } else if (fx.kind === 'overload') {
    const r = Math.round((3 + u * 10) * AP);
    cfxRays(cx, cy, r * 0.4, r, 10, cfxRamp(ELEMENT_COLS.shock), cfxBand(k), cfxSeed(fx) + tick);
    cfxLight(lights, cx, cy, TILE * 1.6, 1.1 * k, rgb01(ELEMENT_COLS.shock));
  } else if (fx.kind === 'wardBreak') {
    // the ward's ring breaking apart and falling
    const r = Math.round((6 + u * 14) * AP);
    cfxStrokeRing(cx, cy + Math.round(u * ap(4)), r, Math.round(r * 0.75), cfxRamp(ELEMENT_COLS.force), cfxBand(k), cfxSeed(fx), false, 0.2 + u * 0.5);
    cfxLight(lights, cx, cy, TILE * 1.4, 0.9 * k, rgb01(ELEMENT_COLS.force));
  }
}
