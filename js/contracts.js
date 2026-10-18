'use strict';
// ---------------------------------------------------------------------------
// Contracts: three small goals at a time, posted at the ledge, so every
// expedition, even a short one, is working towards something. Each is
// settled when the diver comes home (a lodeline or a recall, not a fall):
// bring home some ore, bring down some creature, reach a site, seal a rift,
// ride a lodeline home from a certain zone. Each pays the star and leaves
// something useful, and a new one takes its place.
// ---------------------------------------------------------------------------

const CONTRACT_HUNTS = ['crawler', 'wisp', 'construct', 'snapjaw', 'spitter'];

function newContract(rng) {
  const s = Save.data, mag = magnitudeOf(s.star), open = T.biomes.map((b, i) => i).filter((i) => biomeOpen(s, i));
  const C = T.contracts, kind = rng.weighted(Object.keys(C.kinds).map((k) => [C.kinds[k], k]));
  const c = { id: (s.contractN = (s.contractN || 0) + 1), kind };
  if (kind === 'haul') {
    const b = rng.pick(open), ores = T.biomes[b].ores;
    c.ore = rng.chance(0.4) ? ores[ores.length - 1] : ores[0];
    c.n = c.ore === ores[0] ? rng.i(12, 20) : rng.i(4, 8);
  } else if (kind === 'hunt') { c.type = rng.pick(CONTRACT_HUNTS); c.n = rng.i(5, 10); }
  else if (kind === 'reach') { c.biome = rng.pick(open); c.site = Math.min(T.expedition.sites, rng.i(2, 2 + Math.min(2, mag))); }
  else if (kind === 'seal') c.n = 1;
  else { c.zone = rng.pick(['surface', 'cave', 'ruin']); }
  // what it pays: the star, and a thing
  c.star = C.star * mag;
  c.reward = rng.weighted([[3, 'exotic'], [2, 'parts'], [1, 'riftglass']]);
  if (c.reward === 'exotic') c.exotic = randomExotic(rng);
  if (c.reward === 'parts') { c.part = partId(rng.pick(['chitin', 'ether', 'cog', 'fiber', 'spore']), (rng.pick(open) || 0) + 1); c.parts = 3; }
  return c;
}

// Three on the board, always.
function fillContracts() {
  const s = Save.data;
  s.contracts = (s.contracts || []).filter((c) => c && c.kind);
  const rng = Save.rng();
  while (s.contracts.length < T.contracts.posted) s.contracts.push(newContract(rng));
}

function contractText(c) {
  if (c.kind === 'haul') return `Bring home ${c.n} ${stuffName(c.ore)}`;
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
  s.contracts = s.contracts.filter((c) => !done.includes(c));
  fillContracts();
  return done;
}

// The board, as rows (at the ledge, and in the cargo screen mid-dive).
function contractRows(d) {
  fillContracts();
  return Save.data.contracts.map((c) => {
    const prog = d && !d.hub && c.kind !== 'ride' ? ` · ${contractProgress(c, d)}/${contractGoal(c)}` : '';
    return `<div class="row static"><span class="row-text"><span class="row-name">${esc(contractText(c))}${prog}</span><span class="row-sub">${esc(contractRewardText(c))}</span></span></div>`;
  }).join('');
}
