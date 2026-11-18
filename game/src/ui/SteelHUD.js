// ══════════════════════════════════════════════════════════
// SteelHUD — the body and its balance, top-left under the bars
//
// The combat revamp swapped Focus for BALANCE and a single health number
// for WOUNDS (systems/CombatSystem.js). This draws both, quietly:
//   · the second bar is Balance now (it was Focus)
//   · the first bar's label is Blood, and says when you are bleeding
//   · a small body figure: each region tinted by its worst wound —
//     bound wounds dim, open ones bleed red; nothing drawn when whole
//   · one progress hairline while you bind (F) or prepare a ritual
// Per frame from main.js's animateHUD; writes only what changed.
// ══════════════════════════════════════════════════════════

import { combatSystem } from '../systems/CombatSystem.js';
import { player } from '../entities/Player.js';

const CSS = `
#steel-body { display: flex; align-items: center; gap: 10px; margin-top: 8px; min-height: 0; }
#steel-body svg { width: 30px; height: 46px; flex: none; }
#steel-body svg .r { fill: rgba(233,225,207,.10); stroke: rgba(233,225,207,.28); stroke-width: .8; transition: fill .3s; }
#steel-body svg .r.bound { fill: rgba(199,167,106,.45); }
#steel-body svg .r.open { fill: #9e3b2f; }
#steel-body svg .r.deep { fill: #d0453a; animation: steelBleed 1s ease-in-out infinite alternate; }
@keyframes steelBleed { to { fill: #7a1f17; } }
#steel-body .t { font: italic 400 13px/1.25 var(--r-serif, Georgia, serif); color: rgba(233,225,207,.75); text-shadow: 0 1px 3px #000; }
#steel-body .t b { font-style: normal; font-weight: 600; color: #e08a78; }
#steel-body.whole { display: none; }
#steel-prog { height: 2px; width: 180px; margin-top: 6px; background: rgba(233,225,207,.1); display: none; }
#steel-prog i { display: block; height: 100%; background: #e9e1cf; transform-origin: left; }
#steel-prog.on { display: block; }
#steel-prog-label { font: 500 9px/1 var(--r-sans, sans-serif); letter-spacing: .24em; text-transform: uppercase; color: rgba(233,225,207,.6); margin-top: 4px; display: none; }
#steel-prog-label.on { display: block; }
#xp-bar, #player-level, #essence-bar, #lineage-readout, #ascent-readout, #leaning-readout { display: none !important; }
`;

const BODY = `<svg viewBox="0 0 30 46" aria-hidden="true">
  <circle class="r" data-r="head" cx="15" cy="5.5" r="4.6"/>
  <rect class="r" data-r="torso" x="9.5" y="11" width="11" height="15" rx="2.5"/>
  <rect class="r" data-r="armR" x="3" y="11.5" width="5" height="14" rx="2.3"/>
  <rect class="r" data-r="armL" x="22" y="11.5" width="5" height="14" rx="2.3"/>
  <rect class="r" data-r="legs" x="9.5" y="27.5" width="11" height="17" rx="2.5"/>
</svg>`;

class SteelHUD {
  init() {
    if (this._ok) return;
    const host = document.getElementById('hud-top-left');
    if (!host) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const body = document.createElement('div');
    body.id = 'steel-body'; body.className = 'whole';
    body.innerHTML = `${BODY}<div class="t"></div>`;
    const prog = document.createElement('div'); prog.id = 'steel-prog'; prog.innerHTML = '<i></i>';
    const label = document.createElement('div'); label.id = 'steel-prog-label';
    const stam = document.getElementById('stamina-bar');
    stam?.after(body); body.after(prog); prog.after(label);
    document.getElementById('mp-bar')?.setAttribute('title', 'Balance — guarded blows and hits shake it; when it breaks you are staggered open');
    document.getElementById('hp-bar')?.setAttribute('title', 'Blood — wounds drain it while they bleed. Hold F to bind them.');
    this.el = { body, txt: body.querySelector('.t'), regions: [...body.querySelectorAll('.r')], prog, bar: prog.querySelector('i'), label,
      mpFill: document.getElementById('mp-fill'), mpText: document.getElementById('mp-text'), hpText: document.getElementById('hp-text') };
    this._sig = '';
    this._ok = true;
  }

  update() {
    if (!this._ok) this.init();
    if (!this._ok) return;
    const c = combatSystem, e = this.el;
    // Balance in the second bar.
    const bf = Math.max(0, Math.min(1, c.balance / Math.max(1, c.maxBalance)));
    e.mpFill.style.width = `${(bf * 100).toFixed(1)}%`;
    e.mpFill.style.background = c.guardBroken > 0 ? '#9e3b2f' : '';
    const bText = c.guardBroken > 0 ? 'Off balance' : `Balance ${Math.round(c.balance)}`;
    if (e.mpText.textContent !== bText) e.mpText.textContent = bText;
    const bleed = c.bleeding;
    const hText = `Blood ${Math.ceil(player.hp)} / ${player.maxHp}${bleed > 0 ? ' · bleeding' : ''}`;
    if (e.hpText.textContent !== hText) e.hpText.textContent = hText;

    // The body figure, only when something is wrong with it.
    const worst = {};
    for (const w of c.wounds) {
      const rank = w.bound ? 1 : w.sev === 'deep' ? 3 : 2;
      worst[w.region] = Math.max(worst[w.region] || 0, rank);
    }
    const sig = JSON.stringify(worst) + (bleed > 0);
    if (sig !== this._sig) {
      this._sig = sig;
      e.body.className = c.wounds.length ? '' : 'whole';
      for (const r of e.regions) {
        const k = worst[r.dataset.r] || 0;
        r.setAttribute('class', `r${k === 1 ? ' bound' : k === 2 ? ' open' : k === 3 ? ' deep' : ''}`);
      }
      const open = c.wounds.filter(w => !w.bound).length;
      e.txt.innerHTML = open ? `<b>Bleeding</b> — hold F to bind` : c.wounds.length ? 'Bound. It will close.' : '';
    }

    // Binding / ritual progress.
    let p = 0, label = '';
    if (c.binding > 0) { p = c.binding; label = 'Binding'; }
    else if (c.ritual) { p = c.ritual.t / c.ritual.def.time; label = c.ritual.def.name; }
    e.prog.classList.toggle('on', p > 0);
    e.label.classList.toggle('on', p > 0);
    if (p > 0) { e.bar.style.transform = `scaleX(${Math.min(1, p).toFixed(3)})`; if (e.label.textContent !== label) e.label.textContent = label; }
  }
}

export const steelHUD = new SteelHUD();
