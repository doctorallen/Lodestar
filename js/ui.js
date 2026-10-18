'use strict';
// ---------------------------------------------------------------------------
// The screens (the Lodestar, pause), the top bar, the contextual button and
// toasts. Opening a screen sets Game.modal, which stops the simulation, and
// calls Input.block(); a screen's buttons ignore taps for its first 400 ms.
// ---------------------------------------------------------------------------

function setTextIfChanged(id, s) { const el = $(id); if (el.textContent !== s) el.textContent = s; }

function cargoLines(cargo) {
  return T.ores.filter((o) => cargo[o.id]).map((o) => `${cargo[o.id]} ${o.name}`).join(', ');
}

const UI = {
  openedAt: 0,

  init() {
    this.button('base-descend', () => { UI.close(); startDive(); });
    this.button('pause-resume', () => UI.close());
    this.button('pause-abandon', () => abandonDive());
    $('btn-pause').addEventListener('click', () => { if (Game.scene === 'dive' && !Game.modal) UI.openPause(); });
    $('build').textContent = BUILD_INFO;
    drawLodestar();
  },

  button(id, fn) {
    $(id).addEventListener('click', () => { if (Game.realT - UI.openedAt >= T.ui.tapGuard) fn(); });
  },

  show(id) {
    for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
    Game.modal = id;
    UI.openedAt = Game.realT;
    Input.block();
  },

  close() {
    for (const s of document.querySelectorAll('.screen')) s.hidden = true;
    Game.modal = null;
    Input.block();
  },

  // report: { banked } after extracting, { lost } after abandoning
  openBase(report) {
    let r = '';
    if (report && report.banked) r = Object.keys(report.banked).length ? `Pulled home from depth ${report.depth}. Banked ${cargoLines(report.banked)}.` : `Pulled home from depth ${report.depth}, empty-handed.`;
    else if (report && report.lost) r = Object.keys(report.lost).length ? `Lost at depth ${report.depth}: ${cargoLines(report.lost)}.` : `You came back from depth ${report.depth} with nothing.`;
    setTextIfChanged('base-report', r);
    const s = Save.data;
    const stash = cargoLines(s.stash);
    const pick = T.ores.filter((o) => o.tier <= s.pickTier).map((o) => o.name).join(', ');
    $('base-stash').innerHTML = `<div><span class="dim">STASH</span> ${escapeHtml(stash || 'empty')}</div>`
      + `<div><span class="dim">PICK</span> tier ${s.pickTier}, breaks ${escapeHtml(pick)}</div>`
      + (s.deepest ? `<div><span class="dim">DEEPEST</span> ${s.deepest}</div>` : '');
    UI.show('screen-base');
  },

  openPause() { UI.show('screen-pause'); },

  toast(msg) {
    const box = $('toasts'), el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 1800);
  },

  frame() {
    const d = Game.dive;
    setTextIfChanged('hud-depth', d ? `DEPTH ${d.depth}` : '');
    setTextIfChanged('hud-cargo', d ? `CARGO ${d.cargoUsed}/${T.cargo.capacity}` : '');
    const a = d && !Game.modal ? actionHere() : null;
    const btn = $('btn-act');
    setTextIfChanged('btn-act', a === 'descend' ? 'DESCEND' : a === 'extract' ? 'EXTRACT' : '');
    if (btn.hidden !== !a) btn.hidden = !a;
  },
};

// The Lodestar on the home screen.
function drawLodestar() {
  const star = spriteFrom(LODESTAR_ROWS, LODESTAR_PAL);
  const c = $('star'), x = c.getContext('2d');
  c.width = star.width; c.height = star.height;
  x.drawImage(star, 0, 0);
}
