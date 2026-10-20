'use strict';
// ---------------------------------------------------------------------------
// Contracts: three small goals at a time, posted at the portal, so every
// sortie, even a short one, is working towards something. Each is settled
// when the diver comes home (walking in, from a spire, or by a recall; not
// after a fall): bring home some ore, bring down some creature, reach a ring
// of the world, seal a rift, kindle a territory, go down into a Deep. Each
// leaves something useful (the star grows only from deeds: deeds.js), and a
// new one takes its place.
// The board keeps moving: never two of a kind, hauls mostly from the
// furthest region reached, one left standing for `stale` sorties is
// replaced, and one may be swapped for free each time home. All three in
// one sortie pays supplies besides.
// ---------------------------------------------------------------------------

const CONTRACT_HUNTS = ['crawler', 'wisp', 'construct', 'snapjaw', 'spitter'];

function newContract(rng, without = []) {
  const s = Save.data, open = T.biomes.map((b, i) => i).filter((i) => regionReached(i));
  const C = T.contracts, kinds = Object.keys(C.kinds).filter((k) => !without.includes(k));
  const kind = rng.weighted(kinds.map((k) => [C.kinds[k], k]));
  const c = { id: (s.contractN = (s.contractN || 0) + 1), kind, age: 0 };
  const newest = open[open.length - 1];
  if (kind === 'haul') {
    const b = rng.chance(C.newest) ? newest : rng.pick(open), ores = T.biomes[b].ores;
    c.ore = rng.chance(0.4) ? ores[ores.length - 1] : ores[0];
    c.n = c.ore === ores[0] ? rng.i(12, 20) : rng.i(4, 8);
  } else if (kind === 'hunt') {
    // now and then a clime's own creature, one of the climes the open
    // biomes lean to (or a clime that leans to none): fewer of them
    const sig = Object.keys(T.enemies.signature).filter((cl) => { const lean = T.climes[cl].lean; return !lean || open.some((i) => lean[T.biomes[i].id]); }).map((cl) => T.enemies.signature[cl]);
    if (sig.length && rng.chance(C.huntSignature)) { c.type = rng.pick(sig); c.n = rng.i(C.huntN[0], C.huntN[1]); }
    else { c.type = rng.pick(CONTRACT_HUNTS); c.n = rng.i(5, 10); }
  }
  else if (kind === 'reach') c.ring = Math.min(T.world.rings.length - 1, newest + 1 + (rng.chance(0.4) ? 1 : 0));
  else c.n = 1;
  // what it pays: a thing (a supply in the newest region's grade among them)
  c.reward = rng.weighted([[codexAllWhole() ? 0 : T.circuits.resonance.contract, 'resonance'], [3, 'exotic'], [2, 'parts'], [1, 'riftglass'], [2, 'supply']]);
  if (c.reward === 'supply') c.supply = rng.pick(SUPPLY_ORDER) + Math.min(3, (newest || 0) + 1);
  if (c.reward === 'exotic') c.exotic = randomExotic(rng);
  if (c.reward === 'parts') { c.part = partId(rng.pick(['chitin', 'ether', 'cog', 'fiber', 'spore']), (rng.pick(open) || 0) + 1); c.parts = 3; }
  return c;
}

// Three on the board, always, no two of a kind.
function fillContracts() {
  const s = Save.data;
  s.contracts = (s.contracts || []).filter((c) => c && c.kind && T.contracts.kinds[c.kind]);
  const rng = Save.rng();
  while (s.contracts.length < T.contracts.posted) s.contracts.push(newContract(rng, s.contracts.map((c) => c.kind)));
}

// An expedition over, however it ended: what's stood too long is replaced.
function ageContracts() {
  const s = Save.data;
  fillContracts();
  for (const c of s.contracts) c.age = (c.age || 0) + 1;
  s.contracts = s.contracts.filter((c) => c.age < T.contracts.stale);
  fillContracts();
}

// The free swap, once each time home.
function swapContract(id) {
  const s = Save.data;
  if (s.swapped) return false;
  const i = s.contracts.findIndex((c) => c.id === Number(id));
  if (i < 0) return false;
  const [gone] = s.contracts.splice(i, 1);
  s.contracts.push(newContract(Save.rng(), s.contracts.map((c) => c.kind).concat(gone.kind)));
  s.swapped = true;
  Save.save();
  return true;
}

function contractText(c) {
  if (c.kind === 'haul') return `Bring home ${c.n} ${stuffName(c.ore)}`;
  if (c.kind === 'hunt' && FOE_NAMES[c.type]) return `Bring down ${c.n} ${c.n > 1 ? FOE_NAMES[c.type][1] : FOE_NAMES[c.type][0].toLowerCase()} (${climeName(climeOfFoe(c.type))}), and come home`;
  if (c.kind === 'hunt') return `Bring down ${c.n} ${c.type}${c.n > 1 ? 's' : ''}, and come home`;
  if (c.kind === 'reach') return `Walk into ring ${c.ring}, and come home`;
  if (c.kind === 'seal') return 'Seal a rift, and come home';
  if (c.kind === 'kindle') return 'Kindle a territory, and come home';
  return 'Go down into a Deep, and come home';
}
function contractRewardText(c) {
  const thing = c.reward === 'exotic' ? stuffName(c.exotic) : c.reward === 'parts' ? `${c.parts} ${partName(c.part).toLowerCase()}` : c.reward === 'resonance' ? 'a resonance stone (the Codex)' : c.reward === 'supply' && supplyRecipe(c.supply) ? `a ${supplyRecipe(c.supply).name}` : 'riftglass';
  return `Pays ${thing}`;
}

// How far along a contract is in the dive under way.
function contractProgress(c, d) {
  const t = d.tally || {};
  if (c.kind === 'haul') return Math.min(c.n, (d.cargo[c.ore] || 0) + (d.pocket || []).filter((e) => e.stuff === c.ore).reduce((a, e) => a + e.n, 0));
  if (c.kind === 'hunt') return Math.min(c.n, (t.kills && t.kills[c.type]) || 0);
  if (c.kind === 'reach') return Math.min(c.ring, d.maxRing || 0);
  if (c.kind === 'seal') return Math.min(c.n, t.sealed || 0);
  if (c.kind === 'kindle') return Math.min(c.n, t.kindled || 0);
  if (c.kind === 'deep') return Math.min(c.n, t.deeps || 0);
  return 0;
}
function contractGoal(c) { return c.kind === 'reach' ? c.ring : c.n; }

// A sortie's tally, as it goes.
function tallyKill(d, e) {
  const t = d.tally || (d.tally = {}), k = t.kills || (t.kills = {});
  k[e.type] = (k[e.type] || 0) + 1;
}
function tallySeal(d) { const t = d.tally || (d.tally = {}); t.sealed = (t.sealed || 0) + 1; }

// Two piles of stuff, added together.
function sumStuff(a, b) { const out = Object.assign({}, a); for (const k in b) out[k] = (out[k] || 0) + b[k]; return out; }

// Coming home: which contracts this sortie settled. banked: what reached
// the stash this sortie (after a recall's losses).
function settleContracts(d, banked) {
  const s = Save.data, done = [];
  fillContracts();
  for (const c of s.contracts) {
    let ok;
    if (c.kind === 'haul') ok = (banked[c.ore] || 0) >= c.n;
    else ok = contractProgress(c, d) >= contractGoal(c);
    if (!ok) continue;
    done.push(c);
    if (c.reward === 'resonance') { revealResonancePart(Save.rng()); continue; }
    if (c.reward === 'supply' && supplyRecipe(c.supply)) { const b = supplyBelt(); b[c.supply] = (b[c.supply] || 0) + 1; continue; }
    const key = c.reward === 'exotic' ? c.exotic : c.reward === 'parts' ? c.part : 'riftglass';
    s.stash[key] = (s.stash[key] || 0) + (c.reward === 'parts' ? c.parts : 1);
  }
  // the whole board at once: supplies besides, in the newest region's grade
  if (done.length >= T.contracts.posted) {
    const g = Math.min(3, T.biomes.map((b, i) => i).filter((i) => regionReached(i)).length), b = supplyBelt();
    done.bonus = ['injector' + g, 'cell' + g].slice(0, T.contracts.board).map((id) => { b[id] = (b[id] || 0) + 1; return supplyRecipe(id).name; });
  }
  s.contracts = s.contracts.filter((c) => !done.includes(c));
  ageContracts();
  return done;
}

// The board, as rows (at the portal, and in the cargo screen mid-sortie).
function contractRows(d) {
  fillContracts();
  return Save.data.contracts.map((c) => {
    const prog = d && !d.hub ? ` · ${contractProgress(c, d)}/${contractGoal(c)}` : '';
    const left = T.contracts.stale - (c.age || 0), swap = !d && !Save.data.swapped ? `<button class="mini" data-act="swapContract" data-arg="${c.id}">SWAP</button>` : '';
    return `<div class="row static"><span class="row-text"><span class="row-name">${esc(contractText(c))}${prog}</span><span class="row-sub">${esc(contractRewardText(c))}${left <= 1 ? ' · last sortie' : ''}</span></span>${swap}</div>`;
  }).join('');
}
