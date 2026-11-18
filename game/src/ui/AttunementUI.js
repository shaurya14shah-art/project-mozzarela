// ══════════════════════════════════════════════════════════
// Attunement UI — what you have become
//
// This replaces the character sheet. There is no level, no XP bar
// and no stat block, because none of those exist any more. What it
// shows is a reading of *you*, in exactly the format the cauldron
// uses to read a brew — because you are one.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';
import { audioSystem } from '../systems/AudioSystem.js';
import { attunement, ATTUNE } from '../systems/AttunementSystem.js';
import { FORM_DATA } from '../data/essences.js';
import { elementGlyph, formFrame } from './Sigil.js';
import { overlayManager } from './OverlayManager.js';

class AttunementUI {
  constructor() {
    this.isOpen = false;
    this._injectHTML();
    this._bindEvents();
  }

  _injectHTML() {
    document.getElementById('stats-panel')?.remove();
    document.getElementById('attunement-panel')?.remove();

    const panel = document.createElement('div');
    panel.id = 'attunement-panel';
    panel.className = 'menu-panel attunement-panel hidden';
    panel.innerHTML = `
      <div class="menu-header">
        <h2>Attunement</h2>
        <button id="close-attunement-btn" class="close-btn">×</button>
      </div>
      <div class="attune-hint">
        You have no level. What you cast, you become — and what you
        become decides what the world can do to you.
      </div>
      <div class="attune-body" id="attune-body"></div>
    `;
    document.getElementById('menus-overlay')?.appendChild(panel);
    this.panel = panel;
  }

  _bindEvents() {
    document.addEventListener('keydown', (e) => {
      if (document.activeElement.tagName === 'INPUT') return;
      // ⚠️ Tab now opens the Pioneer menu (ui/MenuUI.js), which lists
      // Attunement among the rest. Leaving this handler in place would
      // make one Tab press open BOTH — the exact stacking failure §5
      // records for WandMenuUI and BindUI both answering V.
      if (e.key === 'Escape' && this.isOpen) this.toggle(false);
    });
    document.addEventListener('click', (e) => {
      if (e.target.id === 'close-attunement-btn') this.toggle(false);
    });
    eventBus.on(Events.ATTUNEMENT_UPDATE, () => { if (this.isOpen) this.render(); });
  }

  toggle(force) {
    this.isOpen = force !== undefined ? force : !this.isOpen;
    audioSystem.playUIClick(this.isOpen ? 'open' : 'close');
    if (this.isOpen) {
      overlayManager.open('attunement-panel');
      if (document.pointerLockElement) document.exitPointerLock();
      this.render();
    } else {
      overlayManager.close('attunement-panel');
      if (!overlayManager.hasAnyOpen()) {
        document.getElementById('game-canvas')?.requestPointerLock?.()?.catch?.(() => {});
      }
    }
  }

  render() {
    const body = document.getElementById('attune-body');
    if (!body) return;

    const s = attunement.snapshot();

    if (!s.elements.length) {
      body.innerHTML = `<div class="shelf-empty">
        You are unattuned. Cast something, and you will start to
        take on its character.
      </div>`;
      return;
    }

    const instPct = s.instability * 100;
    const instClass = instPct > 55 ? 'danger' : instPct > 25 ? 'warn' : 'calm';

    const elementRows = s.elements.slice(0, 6).map(({ id, share }) => {
      const resist = attunement.incomingMultiplier(id);
      const note = resist < 0.95 ? `resists ${Math.round((1 - resist) * 100)}%`
                 : resist > 1.05 ? `<span class="attune-weak">vulnerable +${Math.round((resist - 1) * 100)}%</span>`
                 : '';
      return `
        <div class="bar-row">
          <span class="bar-label">${elementGlyph(id)}${id}</span>
          <div class="bar-track">
            <div class="bar-fill" style="width:${(share * 100).toFixed(0)}%;background:var(--el-${id})"></div>
          </div>
          <span class="bar-pct">${(share * 100).toFixed(0)}%</span>
          <span class="attune-note">${note}</span>
        </div>`;
    }).join('');

    const formRows = s.forms.slice(0, 3).map(({ id, share }) => `
      <div class="bar-row">
        <span class="bar-label">${formFrame(id)}${FORM_DATA[id]?.name || id}</span>
        <div class="bar-track">
          <div class="bar-fill form" style="width:${(share * 100).toFixed(0)}%"></div>
        </div>
        <span class="bar-pct">${(share * 100).toFixed(0)}%</span>
        <span class="attune-note"></span>
      </div>`).join('');

    const nextSlot = s.nextSlotAt
      ? `<div class="attune-next">Next infusion slot at ${Math.round(s.nextSlotAt)} depth · you are at ${Math.round(s.peakDepth)}</div>`
      : `<div class="attune-next">The wand is open as far as it goes.</div>`;

    body.innerHTML = `
      <div class="attune-summary">
        <div class="attune-portrait" style="color:var(--el-${s.dominant})">
          ${elementGlyph(s.dominant)}
        </div>
        <div>
          <div class="attune-title" style="color:var(--el-${s.dominant})">
            ${s.dominant ? `${s.dominant}-touched` : 'Unattuned'}
          </div>
          <div class="attune-sub">
            ${s.doctrine ? s.doctrine.name : 'No doctrine yet'}${s.mastery ? ` · ${s.mastery.name}` : ''} ·
            ${s.slots} infusion slots · depth ${Math.round(s.depth)}
          </div>
        </div>
      </div>

      ${s.doctrine ? `
        <div class="attune-doctrine">
          <div class="attune-doctrine-name">${s.doctrine.name}</div>
          <p class="attune-doctrine-blurb">${s.doctrine.blurb}</p>
          <div class="attune-doctrine-effect">${s.doctrine.describe}</div>
        </div>
      ` : `
        <div class="attune-doctrine pending">
          Lean 30% into a single form to take on its doctrine.
        </div>
      `}

      ${s.mastery ? `
        <div class="attune-doctrine mastery" style="border-color:var(--el-${s.mastery.id})">
          <div class="attune-doctrine-name" style="color:var(--el-${s.mastery.id})">${elementGlyph(s.mastery.id)} ${s.mastery.name}</div>
          <div class="attune-doctrine-effect">${s.mastery.desc}</div>
        </div>
      ` : `
        <div class="attune-doctrine pending">
          Reach ${Math.round(s.masteryAt * 100)}% into a single element to master it — a passive, always on.
        </div>
      `}

      <div class="readout-section">
        <div class="readout-head">What you are made of</div>
        ${elementRows}
      </div>

      <div class="readout-section">
        <div class="readout-head">How you cast</div>
        ${formRows}
      </div>

      <div class="readout-section">
        <div class="readout-head">Your own stability</div>
        <div class="stability-meter ${instClass}">
          <div class="stability-fill" style="width:${instPct.toFixed(0)}%"></div>
          <span class="stability-label">${instPct > 55 ? 'Volatile' : instPct > 25 ? 'Unsettled' : 'Settled'} · ${instPct.toFixed(0)}%</span>
        </div>
        <div class="stability-note">
          ${instPct > ATTUNE.SELF_SURGE_FLOOR * 100
            ? `You are holding opposed elements in one body. Everything you cast hits harder, and roughly ${Math.round(attunement.selfSurgeChance() * 100)}% of it will surge unpredictably.`
            : 'Nothing in you is fighting anything else.'}
        </div>
        ${nextSlot}
      </div>
    `;
  }
}

export const attunementUI = new AttunementUI();
