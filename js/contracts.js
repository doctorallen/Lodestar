'use strict';
// ---------------------------------------------------------------------------
// Contracts: three small goals at a time, posted at the ledge, so every
// expedition, even a short one, is working towards something. Each is
// settled when the diver comes home (a lodeline or a recall, not a fall):
// bring home some ore, bring down some creature, reach a site, seal a rift,
// ride a lodeline home from a certain zone. Each pays the star and leaves
// something useful, and a new one takes its place. The board keeps moving:
// never two of a kind, hauls mostly from the newest biome open, one left
// standing for `stale` expeditions is replaced, and one may be swapped for
// free each time home. All three in one expedition pays the star twice.
// ---------------------------------------------------------------------------

const CONTRACT_HUNTS = ['crawler', 'wisp', 'construct', 'snapjaw', 'spitter'];

function newContract(rng, without = []) {
  const s = Save.data, mag = magnitudeOf(s.star), open = T.biomes.map((b, i) => i).filter((i) => biomeOpen(s, i));
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
  else if (kind === 'reach') { c.biome = rng.chance(C.newest) ? newest : rng.pick(open); c.site = Math.min(T.expedition.sites, rng.i(2, 2 + Math.min(2, mag))); }
  else if (kind === 'seal') c.n = 1;
  else { c.zone = rng.pick(['surface', 'cave', 'ruin']); }
  // what it pays: the star, and a thing
  c.star = C.star * mag;
  c.reward = rng.weighted([[3, 'exotic'], [2, 'parts'], [1, 'riftglass']]);
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
  if (c.kind === 'reach') return `Reach site ${c.site} in ${T.biomes[c.biome].name}, and come home`;
  if (c.kind === 'seal') return 'Seal a rift, and come home';
  return `Ride a lodeline home from ${c.zone === 'surface' ? 'the surface' : 'a ' + T.zones[c.zone].name.toLowerCase()}`;
}
function contractRewardText(c) {
  const thing = c.reward === 'exotic' ? stuffName(c.exotic) : c.reward === 'parts' ? `${c.parts} ${partName(c.part).toLowerCase()}` : 'riftglass';
  return `+${c.star} to the star, and ${thing}`;
}

// How far along a contract is in the dive under way.
function contractProgress(c, d) {
  const t = d.tally || {};
  if (c.kind === 'haul') return Math.min(c.n, (d.cargo[c.ore] || 0) + (d.pocket || []).filter((e) => e.stuff === c.ore).reduce((a, e) => a + e.n, 0));
  if (c.kind === 'hunt') return Math.min(c.n, (t.kills && t.kills[c.type]) || 0);
  if (c.kind === 'reach') return d.biome === c.biome ? Math.min(c.site, d.depth) : 0;
  if (c.kind === 'seal') return Math.min(c.n, t.sealed || 0);
  return 0;
}
function contractGoal(c) { return c.kind === 'reach' ? c.site : c.kind === 'ride' ? 1 : c.n; }

// A dive's tally, as it goes.
function tallyKill(d, e) {
  const t = d.tally || (d.tally = {}), k = t.kills || (t.kills = {});
  k[e.type] = (k[e.type] || 0) + 1;
}
function tallySeal(d) { const t = d.tally || (d.tally = {}); t.sealed = (t.sealed || 0) + 1; }

// Two piles of stuff, added together.
function sumStuff(a, b) { const out = Object.assign({}, a); for (const k in b) out[k] = (out[k] || 0) + b[k]; return out; }

// Coming home: which contracts this dive settled. banked: what reached the
// stash (after a recall's losses); how: 'extract' or 'recall'.
function settleContracts(d, banked, how) {
  const s = Save.data, done = [];
  fillContracts();
  for (const c of s.contracts) {
    let ok;
    if (c.kind === 'haul') ok = (banked[c.ore] || 0) >= c.n;
    else if (c.kind === 'ride') ok = how === 'extract' && d.zone === c.zone;
    else ok = contractProgress(c, d) >= contractGoal(c);
    if (!ok) continue;
    done.push(c);
    s.star += c.star;
    const key = c.reward === 'exotic' ? c.exotic : c.reward === 'parts' ? c.part : 'riftglass';
    s.stash[key] = (s.stash[key] || 0) + (c.reward === 'parts' ? c.parts : 1);
  }
  // the whole board at once: the star again
  if (done.length >= T.contracts.posted) { const bonus = done.reduce((n, c) => n + c.star, 0); s.star += bonus; done.bonus = bonus; }
  s.contracts = s.contracts.filter((c) => !done.includes(c));
  ageContracts();
  return done;
}

// The board, as rows (at the ledge, and in the cargo screen mid-dive).
function contractRows(d) {
  fillContracts();
  return Save.data.contracts.map((c) => {
    const prog = d && !d.hub && c.kind !== 'ride' ? ` · ${contractProgress(c, d)}/${contractGoal(c)}` : '';
    const left = T.contracts.stale - (c.age || 0), swap = !d && !Save.data.swapped ? `<button class="mini" data-act="swapContract" data-arg="${c.id}">SWAP</button>` : '';
    return `<div class="row static"><span class="row-text"><span class="row-name">${esc(contractText(c))}${prog}</span><span class="row-sub">${esc(contractRewardText(c))}${left <= 1 ? ' · last expedition' : ''}</span></span>${swap}</div>`;
  }).join('');
}
