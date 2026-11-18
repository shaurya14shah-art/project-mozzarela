// ══════════════════════════════════════════════════════════
// Codex — every found-journal fragment, kept
//
// The reveal card (main.js) is the moment; this is the record. Found
// fragments show in full; everything still out there in the world
// stays a locked "???" so the count itself is a reason to keep
// exploring, not a spoiler list.
// ══════════════════════════════════════════════════════════

import { loreSystem } from '../systems/LoreSystem.js';
import { LORE_FRAGMENTS } from '../data/story.js';
import { overlayManager } from './OverlayManager.js';
import { audioSystem } from '../systems/AudioSystem.js';

export class CodexUI {
  constructor() {
    this.isOpen = false;
    this._injectHTML();
    this._bindEvents();
  }

  _injectHTML() {
    document.getElementById('codex-panel')?.remove();

    const panel = document.createElement('div');
    panel.id = 'codex-panel';
    panel.className = 'menu-panel codex-panel hidden';
    panel.innerHTML = `
      <div class="menu-header">
        <h2>The Codex</h2>
        <button id="close-codex-btn" class="close-btn">×</button>
      </div>
      <div class="codex-count" id="codex-count"></div>
      <div class="codex-list" id="codex-list"></div>
    `;

    document.getElementById('menus-overlay')?.appendChild(panel);
    this.panel = panel;
  }

  _bindEvents() {
    document.addEventListener('keydown', (e) => {
      if (document.activeElement.tagName === 'INPUT') return;
      // ⚠️ The global letter key is GONE — every panel now opens from
      // the Pioneer menu (Tab), which frees the letter for the player
      // to bind. See ui/MenuUI.js. Escape still closes.
      if (e.key === 'Escape' && this.isOpen) this.toggle(false);
    });

    document.addEventListener('click', (e) => {
      if (e.target.id === 'close-codex-btn') this.toggle(false);
    });
  }

  toggle(force) {
    this.isOpen = force !== undefined ? force : !this.isOpen;
    audioSystem.playUIClick(this.isOpen ? 'open' : 'close');
    if (this.isOpen) {
      this.render();
      overlayManager.open('codex-panel');
      if (document.pointerLockElement) document.exitPointerLock();
    } else {
      overlayManager.close('codex-panel');
      if (!overlayManager.hasAnyOpen()) {
        document.getElementById('game-canvas')?.requestPointerLock?.()?.catch?.(() => {});
      }
    }
  }

  render() {
    const list = document.getElementById('codex-list');
    const count = document.getElementById('codex-count');
    if (!list || !count) return;

    count.innerText = `${loreSystem.count} / ${LORE_FRAGMENTS.length} fragments recovered`;

    list.innerHTML = LORE_FRAGMENTS.map(f => {
      const found = loreSystem.has(f.id);
      return found
        ? `<div class="codex-entry found">
             <div class="codex-entry-title">${f.title}</div>
             <div class="codex-entry-text">${f.text}</div>
           </div>`
        : `<div class="codex-entry locked">
             <div class="codex-entry-title">???</div>
             <div class="codex-entry-text">Not yet found.</div>
           </div>`;
    }).join('');
  }
}

export const codexUI = new CodexUI();
