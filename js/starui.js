'use strict';
// ---------------------------------------------------------------------------
// The star's screen: home has no stations, only the star, and the star has
// four faces, four chips on one screen:
//   GIVE  the feeding (the light of deeds, held at the star: hub.js), the
//         Spectrum with GIVE for each ore the stash holds (spectrum.js),
//         and supplies made from the stash (supplies.js);
//   TURN  the build (facets.js): two casts, each a Shape, a Band and the
//         extra facets the star's magnitude allows, turned by tapping a
//         slot and choosing; the facets lent to Wick; the attunements;
//   ASK   what the star needs next (deeds.js nextGoal, the bands dark to
//         it, the light to its next magnitude), and what it knows: the
//         Meridian and the spec, the shards, the echoes, the log, the
//         resonances found;
//   GO    the world map (worldmap.js).
// UI.face is the face shown; UI.turn, a slot being chosen for.
// ---------------------------------------------------------------------------

const STAR_FACES = [['give', 'GIVE'], ['turn', 'TURN'], ['ask', 'ASK'], ['go', 'GO']];

function drawStar() {
  const face = UI.face || 'turn';
  const chips = `<div class="chips faces">${STAR_FACES.map(([id, w]) => `<button class="chip ${face === id ? 'on' : ''}" data-act="face" data-arg="${id}">${w}</button>`).join('')}</div>`;
  $('star-body').innerHTML = chips + (face === 'give' ? starGiveHtml() : face === 'ask' ? starAskHtml() : starTurnHtml());
}

// --- GIVE --------------------------------------------------------------------------
function starGiveHtml() {
  const s = Save.data, mag = magnitudeOf(s.star), next = T.star.levels[mag], lo = T.star.levels[mag - 1], wait = lightWaiting();
  const k = (v) => Math.round(Math.min(1, next ? (v - lo) / (next - lo) : 1) * 100);
  const light = LIGHT_IDS.slice().reverse().map((id) => `<span class="mat"><img class="cost-icon" src="${lightIconUrl(id)}" alt="">${s.stash[id] || 0} ${esc(LIGHT_KINDS[id].name)}</span>`).join('');
  const shards = Story.shardsHeld() - Story.shardsSet();
  return `
    <div class="mag">MAGNITUDE ${mag}${next !== undefined ? ` · ${s.star}/${next}` : ''}</div>
    <div class="bar rep-bar star-bar"><div class="fill wait" style="width:${k(s.star + wait)}%"></div><div class="fill" style="width:${k(s.star)}%"></div></div>
    <h3>LIGHT WAITING · ${wait}${shards > 0 ? ` · ${shards} SHARD${shards > 1 ? 'S' : ''}` : ''}</h3>
    <div class="mats light-chips">${light}</div>
    <p class="note">${wait ? 'Stand before the star and hold FEED: the light rises into it.' : 'Light comes from deeds: land kindled, the deep places reached, a Keeper\'s shard.'}</p>
    <h3>REACH</h3><div class="reach">${T.star.ringMag.slice(2).map((m, i) => `<span class="reach-chip${mag >= m ? ' ok' : ''}">${i + 2 === 4 ? 'EDGE' : 'RING ' + (i + 2)} · MAG ${m}${mag >= m ? ' ✓' : ''}</span>`).join('')}</div>
    <h3>THE SPECTRUM · ${BANDS.filter((b) => bandAtMark(b.ore)).length}/${BANDS.length} AT THE MARK</h3><div class="spec-list">${spectrumRowsHtml(true)}</div>
    <p class="note">Each ore given is a band the star learns to shine in. A land's band at depth 1 lets the star light that land.</p>
    ${supplyMakeHtml(false)}`;
}

// --- TURN --------------------------------------------------------------------------
function starTurnHtml() {
  if (UI.turn) return starChooserHtml();
  const F = facetsState(), tier = facetTier(), slots = facetExtraSlots(), mag = magnitudeOf(Save.data.star);
  const castHtml = (c, i) => {
    const row = (slot, name, sub, col, on) => `<button class="row facet ${on ? 'on' : 'empty'}" data-act="turnPick" data-arg="${i}:${slot}">${col ? `<span class="pip" style="background:${col}"></span>` : '<span class="pip hollow"></span>'}<span class="row-text"><span class="row-name">${esc(name)}</span><span class="row-sub">${esc(sub)}</span></span><span class="row-tag">${on ? '◆' : '◇'}</span></button>`;
    let h = `<h3>CAST ${i ? 'B · LEFT WRIST' : 'A · RIGHT WRIST'}</h3>`;
    h += row('shape', `${shapeName(c.shape).toUpperCase()} · Shape`, CIRCUIT_FORMS[c.shape].text(), ART.forms[c.shape] || '#ece4cf', true);
    h += row('band', `${bandName(c.band).toUpperCase()} · Band`, bandText(c.band), bandColor(c.band), true);
    for (let k = 0; k < 2; k++) {
      if (k >= slots) { h += `<div class="row static empty"><span class="pip hollow"></span><span class="row-text"><span class="row-name">A facet more</span><span class="row-sub">opens at magnitude ${T.facets.extraAt[k]}</span></span><span class="lock">◇</span></div>`; continue; }
      const x = c.extra[k];
      h += row(k, x ? facetName(x).toUpperCase() : 'FACE A FACET', x ? facetText(x, tier) : 'a Turn, or a Reading of a creature', x ? facetColor(x) : null, !!x);
    }
    const sp = Save.data.equip.main.spells[i], line = spellLine(Save.data.equip.main, sp);
    h += `<p class="note cast-line">${esc(spellName(sp))} · ${esc(line.text)}</p>`;
    return h;
  };
  // the facets the star knows but isn't facing
  const known = extraFacets().filter((x) => facetFacedBy(x) < 0), shapes = F.shapes.filter((id) => !F.casts.some((c) => c.shape === id));
  const spare = known.length + shapes.length ? `<h3>KNOWN · TURNED AWAY</h3><p class="note">${esc([...shapes.map(shapeName), ...known.map(facetName)].join(', '))}</p>` : '';
  const unknown = nextShapeToLearn() ? `<p class="note">The next Shape, the ${esc(shapeName(nextShapeToLearn()))}, is learned at a Deep's end. Elites teach what their nature names.</p>` : '';
  // Wick's facets
  const wick = WICK_UP_IDS.map((id) => {
    const lent = wickLent(id), off = wickOff(id);
    return `<div class="row static ${lent ? '' : 'empty'}"><img class="icon" src="${wickIconUrl(id)}" alt=""><span class="row-text"><span class="row-name">${esc(WICK_UP_NAMES[id])}${lent ? '' : ` <span class="dim">· magnitude ${T.wickUp[id].mag}</span>`}</span><span class="row-sub">${esc(WICK_UPS[id].text())}</span></span>${lent ? `<button class="mini" data-act="wickToggle" data-arg="${id}">${off ? 'OFF' : 'ON'}</button>` : ''}</div>`;
  }).join('');
  // the Kindler's own skill
  const pts = attunePointsLeft(Save.data), att = Object.entries(T.attune).map(([id, A]) => {
    const r = Save.data.attune[id] || 0;
    return `<div class="row static"><span class="row-text"><span class="row-name">${A.name} ${r}/${A.max}</span><span class="row-sub">${A.text}</span></span><button class="mini" data-act="attune" data-arg="${id}" ${pts > 0 && r < A.max ? '' : 'disabled'}>+</button></div>`;
  }).join('');
  const st = Save.data.equip, armor = st.armor ? st.armor.base.armor : 0;
  return `
    <div class="mag">THE SPLINTER · MAGNITUDE ${mag}</div>
    <p class="note center">Everything faced casts as the star does: at magnitude ${tier}. Cuts ore to tier ${cutPower()}. Armour ${armor}.</p>
    ${F.casts.map(castHtml).join('')}
    ${spare}${unknown}
    <h3>WICK · FACETS LENT</h3><div class="wick-list">${wick}</div>
    <h3>THE KINDLER · ${pts} POINT${pts === 1 ? '' : 'S'}</h3><div class="att-list">${att}</div>`;
}
// A facet's colour, for its pip.
function facetColor(x) {
  if (!x) return null;
  if (x.kind === 'mod') return stoneCol(x.id);
  if (x.kind === 'reading') return CORE_PRINT_COL;
  return ART.rarity.legendary;
}
// Choosing what faces a slot: every facet of its kind the star has, the
// one faced marked.
function starChooserHtml() {
  const { cast, slot } = UI.turn, F = facetsState(), c = F.casts[cast], tier = facetTier();
  const row = (arg, name, sub, col, on) => `<button class="row facet ${on ? 'on' : ''}" data-act="turnSet" data-arg="${arg}">${col ? `<span class="pip" style="background:${col}"></span>` : '<span class="pip hollow"></span>'}<span class="row-text"><span class="row-name">${esc(name)}</span><span class="row-sub">${esc(sub)}</span></span>${on ? '<span class="row-tag">FACED</span>' : ''}</button>`;
  let title, rows;
  if (slot === 'shape') { title = 'SHAPE'; rows = F.shapes.map((id) => row(`${cast}:shape:${id}`, shapeName(id).toUpperCase(), CIRCUIT_FORMS[id].text(), ART.forms[id] || '#ece4cf', c.shape === id)).join(''); }
  else if (slot === 'band') { title = 'BAND'; rows = bandsCastable().map((ore) => row(`${cast}:band:${ore}`, bandName(ore).toUpperCase(), bandText(ore), bandColor(ore), c.band === ore)).join('') + BANDS.filter((b) => b.ore !== 'lumenite' && bandDepth(b.ore) < 1).map((b) => `<div class="row static empty"><span class="pip hollow"></span><span class="row-text"><span class="row-name">${b.name.toUpperCase()}</span><span class="row-sub">not yet tasted: give it ${esc(stuffName(b.ore))}</span></span></div>`).join(''); }
  else {
    title = `FACET ${Number(slot) + 1}`;
    const cur = c.extra[Number(slot)];
    rows = row(`${cast}:${slot}:none`, 'FACE NOTHING', 'the slot left dark', null, !cur) + extraFacets().map((x) => { const by = facetFacedBy(x); return row(`${cast}:${slot}:${x.kind}:${x.id}`, facetName(x).toUpperCase(), facetText(x, tier) + (by >= 0 && !facetSame(x, cur) ? ` · faced in cast ${by ? 'B' : 'A'}` : ''), facetColor(x), facetSame(x, cur)); }).join('');
    if (!extraFacets().length) rows += '<p class="note">Nothing yet. Elites teach Turns; a creature read four times is a Reading; a warden or a Keeper leaves a shard of old light.</p>';
  }
  return `<div class="mag">CAST ${cast ? 'B' : 'A'} · ${title}</div><div class="menu"><button class="btn quiet" data-act="turnBack">BACK</button></div>${rows}`;
}

// --- ASK --------------------------------------------------------------------------
function starAskHtml() {
  const s = Save.data, set = Story.shardsSet(), mag = magnitudeOf(s.star), next = T.star.levels[mag];
  const needs = [nextGoal()];
  if (next !== undefined) needs.push(`${Math.max(0, next - s.star)} more light to magnitude ${mag + 1}.`);
  for (const b of BANDS) if (bandDepth(b.ore) < 1 && bandOpensWord(b.ore)) needs.push(`${bandOpensWord(b.ore)} is dark to it: it has not tasted ${stuffName(b.ore)}.`);
  const shardRow = (b, i) => {
    const has = (s.shards || []).includes(i);
    return `<div class="row static"><img class="icon" src="${art2IconUrl('shard', has ? {} : { shardglow: ['#2a2a30'], shardwarm: ['#3a3a40'], star: ['#202024', '#2a2a30', '#34343c', '#40404a'] })}" alt=""><span class="row-text"><span class="row-name">${esc(b.name)}</span><span class="row-sub">${has ? ((s.shards || []).indexOf(i) < set ? 'Set in the star' : 'Set it here') : `A Keeper holds it · ring ${i + 1}`}</span></span></div>`;
  };
  const kindled = storyKindledCount(), at = BANDS.filter((b) => bandAtMark(b.ore)).length;
  const meridian = spectrumComplete() ? '<p class="note">Every band at the mark. The star is whole, by the spec.</p>'
    : `<p class="note">${T.story.sleepers} sleepers in orbit. They wake when the star is whole: every band at the mark. ${at} of ${BANDS.length} stand there.</p>`;
  const log = storyKindled().map((t) => `<div class="echo"><p>${esc(kindleLogLine(t.clime, t.name))}</p></div>`).join('');
  const echoes = (s.echoes || []).map((i) => `<div class="echo"><b>${esc(ECHOES[i].title)}</b><p>${esc(ECHOES[i].text)}</p></div>`).join('');
  // the resonances: each, and how much of it is known (resonance.js)
  const res = RESONANCES.map((r) => { const shown = codexShown(r); return `<div class="row static"><span class="row-text"><span class="row-name">${esc(r.name)}${codexWhole(r) ? '' : ` <span class="dim">· ${shown.length}/${r.parts.length}</span>`}</span><span class="row-sub">${esc(r.parts.map((p, i) => (shown.includes(i) ? stoneWords(p).name : '?')).join(' · '))}</span></span></div>`; }).join('');
  return `
    <h3>WHAT IT NEEDS</h3>${needs.map((n) => `<p class="ask-line">${esc(n)}</p>`).join('')}
    <h3>THE MERIDIAN</h3><div class="up-meridian">${meridian}<div class="spec-wrap">${spectrumBarsHtml(false)}</div></div>
    <h3>SHARDS SET · ${set}/3</h3><div class="up-shards">${T.biomes.map(shardRow).join('')}</div>
    <h3>RESONANCES</h3><div class="res-list">${res}</div>
    <h3>ECHOES · ${(s.echoes || []).length}/${ECHOES.length}</h3><div class="up-echoes">${echoes || '<p class="note">None yet.</p>'}</div>
    ${log ? `<h3>THE LOG · ${kindled} KINDLED</h3>${log}` : ''}
    <div class="menu"><button class="btn quiet" data-act="replayIntro">WATCH THE LANDING AGAIN</button></div>`;
}

Object.assign(UI.acts, {
  face: (id) => { if (id === 'go') { UI.openMap('setout'); return; } UI.face = id; UI.turn = null; UI.redraw(); },
  turnPick: (arg) => { const [cast, slot] = arg.split(':'); UI.turn = { cast: Number(cast), slot }; UI.redraw(); },
  turnBack: () => { UI.turn = null; UI.redraw(); },
  turnSet: (arg) => {
    const [cast, slot, kind, id] = arg.split(':');
    const value = slot === 'shape' || slot === 'band' ? kind : kind === 'none' ? null : { kind, id };
    faceSet(Number(cast), slot, value);
    UI.turn = null;
    UI.redraw();
  },
  wickToggle: (id) => { wickToggle(id); UI.redraw(); },
});
