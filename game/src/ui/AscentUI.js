// ══════════════════════════════════════════════════════════
// The Ascent — the power-system panel (K)
//
// ── WHY THIS EXISTS ───────────────────────────────────────
// ⚠️ AscentSystem shipped with NO INTERFACE AT ALL. The whole
// permanent progression — two divergent ladders, five ranks each,
// Trials, grants — was reachable only through a one-line HUD readout
// ("UNPROVEN · The Ladder of Appetite") and a toast when you ranked up.
// The owner's report was exact: "the shadow slave menu doesn't exist."
//
// Everything below already existed and was already computed. This is
// the window onto it, not new mechanics — `ascentSystem.requirements()`
// has always returned precisely the "what is blocking me" structure
// this panel renders, and nothing was ever asking it.
//
// ── WHAT IT HAS TO ANSWER ─────────────────────────────────
// Three questions, in this order, because that is the order a player
// asks them:
//   1. What am I?                → rank, ladder, creed
//   2. What is stopping me?      → Depth vs Trial, separately
//   3. What have I got for it?   → the grants, cumulative
//
// ⚠️ (2) must show Depth and Trial as TWO independent bars. The single
// most confusing thing about this system is that Depth alone never
// ascends anyone — grinding to Depth 500 in a field leaves you
// Unproven forever, by design (see AscentSystem's header). A panel that
// showed one merged "progress to next rank" number would actively lie
// about that.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';
import { overlayManager } from './OverlayManager.js';
import { audioSystem } from '../systems/AudioSystem.js';
import { ladderFor, DEPTH_FOR_TIER, TRIALS } from '../data/ascent.js';
import { ruleOrnament, cornerFiligree } from './Sigil.js';

const PANEL_ID = 'ascent-panel';

class AscentUI {
  constructor() {
    this.el = null;
    this._ascent = null;
    this._attunement = null;
  }

  /** Injected — same reason DescentSystem/JournalUI take theirs. */
  init({ ascentSystem, attunement }) {
    this._ascent = ascentSystem;
    this._attunement = attunement;
    this._build();

    const repaint = () => { if (this.isOpen) this.render(); };
    eventBus.on(Events.ASCENT_UPDATE, repaint);
    eventBus.on(Events.ASCENT_RANK_UP, repaint);
    eventBus.on(Events.LEANING_CROSSED, repaint);

    document.addEventListener('keydown', (e) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      // ⚠️ K IS KEPT as a direct key at the owner's instruction. Also
      // listed in the Pioneer menu (Tab). KeyK stays reserved.
      if (e.key.toLowerCase() === 'k') this.toggle();
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
  }

  get isOpen() { return this.el && !this.el.classList.contains('hidden'); }

  _build() {
    if (document.getElementById(PANEL_ID)) return;
    const el = document.createElement('div');
    el.id = PANEL_ID;
    el.className = 'menu-panel ascent-panel hidden';
    el.innerHTML = `
      <div class="menu-header">
        <h2>The Ascent</h2>
        <button id="ascent-close" class="close-btn">×</button>
      </div>
      <div class="ascent-body" id="ascent-body"></div>
    `;
    (document.getElementById('menus-overlay') || document.body).appendChild(el);
    this.el = el;
    el.querySelector('#ascent-close').onclick = () => this.close();
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
  }

  toggle() { this.isOpen ? this.close() : this.open(); }

  render() {
    const body = this.el?.querySelector('#ascent-body');
    const A = this._ascent;
    if (!body || !A) return;

    const depth = this._attunement?.totalElement?.() || 0;
    const snap = A.snapshot();
    const ladder = ladderFor(snap.pathId);
    const req = A.requirements(depth);
    const trials = A.trials;

    body.innerHTML = `
      ${this._standingHTML(snap, ladder, depth)}
      ${this._blockingHTML(req, snap)}
      ${this._ladderHTML(ladder, snap)}
      ${this._trialsHTML(trials, snap)}
    `;
  }

  // ── 1. WHAT AM I ────────────────────────────────────────
  _standingHTML(snap, ladder, depth) {
    return `
      <div class="ascent-standing">
        ${cornerFiligree()}
        <div class="as-rank">${snap.rank.name}</div>
        <div class="as-ladder">${ladder.title}</div>
        ${ruleOrnament()}
        <p class="as-blurb">${snap.rank.blurb || ''}</p>
        <div class="as-meta">
          <span><b>${Math.round(depth)}</b> Depth</span>
          <span><b>${snap.trialsCleared}</b> Trial${snap.trialsCleared === 1 ? '' : 's'}</span>
          <span>You <b>${snap.verb}</b> what you go down into.</span>
        </div>
      </div>`;
  }

  // ── 2. WHAT IS STOPPING ME ──────────────────────────────
  _blockingHTML(req, snap) {
    if (!req) {
      return `<div class="ascent-block ascent-topped">
        <h3>The Top of the Ladder</h3>
        <p>There is nothing above ${snap.rank.name}. Whatever comes next is not a rank.</p>
      </div>`;
    }
    // ⚠️ Two bars, never merged. See this file's header — Depth alone
    // never ascends anyone, and one combined number would hide that.
    const dPct = Math.min(100, (req.depth.have / Math.max(1, req.depth.need)) * 100);
    return `
      <div class="ascent-block">
        <h3>Toward ${req.rank.name}</h3>
        <div class="as-gate" data-met="${req.depth.met}">
          <div class="as-gate-head">
            <span>Depth</span>
            <span>${Math.round(req.depth.have)} / ${req.depth.need}</span>
          </div>
          <div class="as-bar"><div class="as-bar-fill" style="width:${dPct}%"></div></div>
          <p class="as-gate-note">Cast, and keep casting. This one comes on its own.</p>
        </div>
        <div class="as-gate" data-met="${req.trial.met}">
          <div class="as-gate-head">
            <span>Trial</span>
            <span>${req.trial.have} / ${req.trial.need}</span>
          </div>
          <div class="as-bar"><div class="as-bar-fill" style="width:${req.trial.met ? 100 : 0}%"></div></div>
          <p class="as-gate-note">
            ${req.trial.met
              ? 'Done. Something down there did not come back up.'
              : `Survive a Tier ${req.rank.tier} Descent or deeper. ${req.trial.objective}`}
          </p>
        </div>
        <p class="as-warn">
          ${req.depth.met && !req.trial.met
            ? 'Depth is not what you are short of. Nothing in a field will finish this.'
            : 'Both, or neither. Depth does not buy a rank.'}
        </p>
      </div>`;
  }

  // ── 3. THE LADDER AND WHAT IT PAID ──────────────────────
  _ladderHTML(ladder, snap) {
    return `
      <div class="ascent-block">
        <h3>${ladder.creed}</h3>
        <ol class="as-rungs">
          ${ladder.ranks.map(r => {
            const state = r.tier < snap.tier ? 'done' : r.tier === snap.tier ? 'here' : 'locked';
            return `<li class="as-rung" data-state="${state}">
              <span class="as-rung-tier">${'I'.repeat(r.tier).replace('IIII', 'IV').replace('IIIII', 'V')}</span>
              <span class="as-rung-name">${r.name}</span>
              <span class="as-rung-depth">${DEPTH_FOR_TIER[r.tier - 1]} Depth</span>
              <span class="as-rung-grant">${state === 'locked' ? '—' : r.grant.desc}</span>
            </li>`;
          }).join('')}
        </ol>
      </div>`;
  }

  _trialsHTML(trials, snap) {
    if (!trials.length) {
      return `<div class="ascent-block">
        <h3>Trials</h3>
        <p class="as-empty">You have not been down. Whatever you are made of,
        the Fracture has not asked yet.</p>
      </div>`;
    }
    return `
      <div class="ascent-block">
        <h3>Trials Survived</h3>
        <ul class="as-trials">
          ${trials.map(t => `<li>
            <span class="as-trial-tier">Tier ${t.tier}</span>
            <span class="as-trial-name">${t.descentId}</span>
            <span class="as-trial-verb" data-verb="${t.verb}">${t.verb}ed</span>
          </li>`).join('')}
        </ul>
      </div>`;
  }
}

export const ascentUI = new AscentUI();
