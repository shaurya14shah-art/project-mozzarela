// ══════════════════════════════════════════════════════════
// The Rite — lineage, and the ladder your weapon is on. N.
//
// Two states in one panel, deliberately:
//   · UNSOUNDED → the Rite. A reading of what you appear to be, then
//     the six lineages, then one irreversible button.
//   · SOUNDED   → the awakening ladder for the weapon in your hand.
//
// One panel because they are one subject. Splitting them would mean a
// player who has sat the Rite never sees the thing the Rite was FOR.
//
// ⚠️ House rules (§3): no border-radius, no backdrop-filter, no
// gradient fills on controls, ornament is stroked geometry. Anything
// mounted on --backdrop uses --foil; this panel sits on the normal
// panel ground, so it uses --chrome-bright like every other menu.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';
import { audioSystem } from '../systems/AudioSystem.js';
import { overlayManager } from './OverlayManager.js';
import { LINEAGES, LINEAGE_IDS } from '../data/lineages.js';
import { elementGlyph, wandMark } from './Sigil.js';

const PANEL_ID = 'lineage-panel';

class LineageUI {
  constructor() {
    this.el = null;
    this._lineage = null;
    this._awaken = null;
    this._player = null;
    this._picked = null;
  }

  init({ lineageSystem, awakeningSystem, player }) {
    this._lineage = lineageSystem;
    this._awaken = awakeningSystem;
    this._player = player;
    this._build();

    const repaint = () => { if (this.isOpen) this.render(); };
    eventBus.on(Events.LINEAGE_UPDATE, repaint);
    eventBus.on(Events.LINEAGE_SOUNDED, repaint);
    eventBus.on(Events.WEAPON_AWAKEN_UPDATE, repaint);
    eventBus.on(Events.WEAPON_AWAKENED, repaint);
    eventBus.on(Events.PLAYER_EQUIP_WEAPON, repaint);

    document.addEventListener('keydown', (e) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      // ⚠️ The global letter key is GONE — every panel now opens from
      // the Pioneer menu (Tab), which frees the letter for the player
      // to bind. See ui/MenuUI.js. Escape still closes.
      if (e.key === 'Escape' && this.isOpen) this.close();
    });

    // Delegated once — the panel's contents are re-rendered wholesale,
    // so per-element handlers would be rebound on every repaint.
    document.addEventListener('click', (e) => {
      const card = e.target.closest?.('#lineage-panel [data-lineage]');
      if (card) {
        this._picked = card.dataset.lineage;
        audioSystem.playUIClick?.('open');
        this.render();
        return;
      }
      if (e.target.closest?.('#lineage-sound-btn')) this._sound();
      if (e.target.closest?.('#lineage-awaken-btn')) this._awakenOnce();
      if (e.target.id === 'lineage-close') this.close();
    });
  }

  get isOpen() { return this.el && !this.el.classList.contains('hidden'); }

  _build() {
    if (document.getElementById(PANEL_ID)) return;
    const el = document.createElement('div');
    el.id = PANEL_ID;
    el.className = 'menu-panel lineage-panel hidden';
    el.innerHTML = `
      <div class="menu-header">
        <h2 id="lineage-title">The Rite</h2>
        <button id="lineage-close" class="close-btn">×</button>
      </div>
      <div class="lineage-body" id="lineage-body"></div>
    `;
    (document.getElementById('menus-overlay') || document.body).appendChild(el);
    this.el = el;
  }

  open() {
    this.render();
    overlayManager.open(PANEL_ID);
    audioSystem.playUIClick?.('open');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  close() {
    overlayManager.close(PANEL_ID);
    audioSystem.playUIClick?.('close');
    if (!overlayManager.hasAnyOpen()) {
      document.getElementById('game-canvas')?.requestPointerLock?.()?.catch?.(() => {});
    }
  }

  toggle() { this.isOpen ? this.close() : this.open(); }

  _sound() {
    if (!this._picked) return;
    if (this._lineage.sound(this._picked)) {
      audioSystem.playUIClick?.('open');
      this.render();
    }
  }

  _awakenOnce() {
    this._awaken.awaken();
    this.render();
  }

  render() {
    const body = this.el?.querySelector('#lineage-body');
    const title = this.el?.querySelector('#lineage-title');
    if (!body || !this._lineage) return;
    if (this._lineage.isSounded) {
      title.textContent = this._lineage.lineage.name;
      body.innerHTML = this._awakeningHTML();
    } else {
      title.textContent = 'The Rite of Sounding';
      body.innerHTML = this._riteHTML();
    }
  }

  // ── UNSOUNDED ───────────────────────────────────────────

  _riteHTML() {
    const s = this._lineage.suggest();
    if (!this._picked) this._picked = s.id;
    const picked = LINEAGES[this._picked] || LINEAGES[s.id];

    return `
      <p class="lineage-preamble">
        The Rite does not decide anything. It reads what you have already
        been doing and says it out loud — then you say whether it is right.
      </p>
      <div class="lineage-reading">
        <span class="lineage-reading-label">The reading</span>
        <strong>${LINEAGES[s.id].name}</strong>
        <span class="lineage-reading-why">${s.why}</span>
      </div>

      <div class="lineage-grid">
        ${LINEAGE_IDS.map(id => {
          const L = LINEAGES[id];
          const on = id === this._picked;
          const suggested = id === s.id;
          return `
          <div class="lineage-card${on ? ' picked' : ''}" data-lineage="${id}" tabindex="0" role="button">
            <div class="lineage-card-head">
              <span class="lineage-card-mark">${elementGlyph(L.affinity[0] || 'arcane')}</span>
              <span class="lineage-card-name">${L.name}</span>
              ${suggested ? '<span class="lineage-card-tag">read</span>' : ''}
            </div>
            <div class="lineage-card-epithet">${L.epithet}</div>
            <div class="lineage-card-verb">${L.verb} · paid in ${L.currencyLabel}</div>
          </div>`;
        }).join('')}
      </div>

      <div class="lineage-detail">
        <h3>${picked.name}</h3>
        <p class="lineage-creed">“${picked.creed}”</p>
        <p>${picked.blurb}</p>
        <p class="lineage-note">${picked.currencyNote || ''}</p>
        <ol class="lineage-ladder">
          ${picked.stages.map((st, i) => `
            <li><span class="ladder-rung">${i}</span>
                <span class="ladder-name">${st.name}</span>
                <span class="ladder-line">${st.line}</span></li>`).join('')}
        </ol>
      </div>

      <div class="lineage-actions">
        <button id="lineage-sound-btn" class="brew-button">Be sounded as ${picked.name}</button>
        <p class="lineage-warning">This does not happen twice.</p>
      </div>
    `;
  }

  // ── SOUNDED ─────────────────────────────────────────────

  _awakeningHTML() {
    const L = this._lineage.lineage;
    const A = this._awaken.snapshot();
    const req = A.requirements;
    const pct = (A.stage / A.maxStage) * 100;

    return `
      <div class="lineage-standing">
        <span class="lineage-standing-mark">${wandMark()}</span>
        <div>
          <div class="lineage-standing-name">${L.name}</div>
          <div class="lineage-standing-epithet">${L.epithet}</div>
        </div>
      </div>
      <p class="lineage-creed">“${L.creed}”</p>

      <div class="awaken-weapon">
        <span class="awaken-weapon-label">In hand</span>
        <strong>${A.weaponName}</strong>
        ${A.shared ? '<span class="awaken-shared">the chorus — every arm you own shares this ladder</span>' : ''}
        <div class="awaken-truename">
          ${A.trueName
            ? `Its name is <em>${A.trueName}</em>.`
            : 'You do not know what it is called.'}
        </div>
      </div>

      <div class="awaken-track">
        <div class="awaken-track-fill" style="width:${pct}%"></div>
      </div>
      <ol class="lineage-ladder">
        ${L.stages.map((st, i) => `
          <li class="${i === A.stage ? 'at' : i < A.stage ? 'past' : ''}">
            <span class="ladder-rung">${i}</span>
            <span class="ladder-name">${st.name}</span>
            <span class="ladder-line">${st.line}</span>
          </li>`).join('')}
      </ol>

      <div class="awaken-cost">
        ${req.cost
          ? `<span>${L.verb} costs <strong>${req.cost.amount}</strong> ${req.cost.amount === 1 ? (L.currencyOne || L.currencyLabel) : L.currencyLabel}</span>
             <span class="awaken-have">you have ${req.have}</span>`
          : `<span>${req.message}</span>`}
      </div>

      <div class="lineage-actions">
        <button id="lineage-awaken-btn" class="brew-button" ${req.ok ? '' : 'disabled'}>
          ${this._awaken.atTop ? 'Fully woken' : L.verb}
        </button>
        <p class="lineage-warning">${req.message}</p>
      </div>
    `;
  }
}

export const lineageUI = new LineageUI();
