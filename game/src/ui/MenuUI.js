// ══════════════════════════════════════════════════════════
// THE PIONEER — one door to every panel (Tab)
//
// ── WHY THIS EXISTS ───────────────────────────────────────
// Owner: "for equiping anything there should be specific key binds,
// and for this purpose remove or the useless keybinds like 'g', and
// all."
//
// ELEVEN letter keys were reserved for panels — B G H I J K L N V F
// plus Tab — on a keyboard whose remaining letters are what the player
// binds their Weaves, Echoes and Aspects to. HANDOFF.md §7 already
// listed this as the clean fix and explicitly flagged it as a design
// decision needing the owner's say-so. This is that say-so.
//
// ── THE ONE NON-OBVIOUS DECISION ──────────────────────────
// ⚠️ The letters still work — INSIDE the menu. Tab opens this, and
// then G still opens the grimoire, L still opens the codex. So:
//
//   · Every panel key is freed at the GLOBAL level, which is what the
//     owner asked for and what makes them bindable.
//   · Nobody's muscle memory is thrown away. Tab-G is one extra
//     keypress, not a thing to relearn.
//   · The letter is printed on each row, so the shortcut teaches
//     itself instead of being folklore.
//
// A menu that had renumbered everything to 1-9 would have been worse
// twice over: it would collide with the loadout hotbar, and it would
// have discarded the mapping players already know.
//
// ⚠️ Tab is now in RESERVED_KEYS and the individual letters are NOT.
// Per trap #7 that swap happens in the same commit as this file.
// ══════════════════════════════════════════════════════════

import { overlayManager } from './OverlayManager.js';
import { audioSystem } from '../systems/AudioSystem.js';
import { eventBus, Events } from '../core/EventBus.js';
import { cornerFiligree, fractureRule } from './Sigil.js';

const PANEL_ID = 'pioneer-menu';

/**
 * The panels, in the order a player thinks about them.
 *
 * ⚠️ `key` is the letter shown on the row and answered WHILE THE MENU
 * IS OPEN. It is deliberately the same letter each panel used to own
 * globally. If a panel is ever added here with a letter that is also
 * in `RESERVED_KEYS`, the menu will happily shadow it — check both.
 */
const ENTRIES = [
  // STEEL: removed — { key: 'b', ui: 'memoryForgeUI', name: '…
  { key: 'i', ui: 'inventoryUI',   name: 'Satchel',     sub: 'What you are carrying, and what is on your keys.' },
  // STEEL: removed — { key: 'n', ui: 'lineageUI',     name: '…
  // STEEL: removed — { key: 'k', ui: 'ascentUI',      name: '…
  // STEEL: removed — { key: 'v', ui: 'bindUI',        name: '…
  // STEEL: removed — { key: 'h', ui: 'wandMenuUI',    name: '…
  { key: 'f', ui: 'forgeUI',       name: 'The Forge',   sub: 'Smith weapons and armour from ore, wood and hide.' },
  // STEEL: removed — { key: 'g', ui: 'grimoireUI',    name: '…
  { key: 'j', ui: 'journalUI',     name: 'Journal',     sub: 'Quests, the map, and where you have been.' },
  { key: 'l', ui: 'codexUI',       name: 'Codex',       sub: 'Fragments recovered from the wound in the sky.' },
  // STEEL: removed — { key: 't', ui: 'attunementUI',  name: '…
];

class MenuUI {
  constructor() {
    this.el = null;
    this._panels = {};
  }

  /**
   * ⚠️ Panels are INJECTED, not imported. MenuUI is imported by
   * main.js alongside all of them, and importing eleven UI singletons
   * from here would build a cycle the moment any one of them ever
   * wanted to close the menu.
   */
  init(panels) {
    this._panels = panels || {};
    this._build();

    document.addEventListener('keydown', (e) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      if (e.key === 'Tab') {
        // ⚠️ Always preventDefault, open or closed. Tab is the
        // browser's own focus-cycling key; letting it through moves
        // focus into the HUD's buttons behind the panel and the next
        // Space or Enter presses one of them.
        e.preventDefault();
        this.toggle();
        return;
      }

      if (!this.isOpen) return;   // the letters are ONLY ours while open

      if (e.key === 'Escape') { this.close(); return; }

      const hit = ENTRIES.find(x => x.key === e.key.toLowerCase());
      if (hit) {
        e.preventDefault();
        this._openPanel(hit);
      }
    });
  }

  get isOpen() { return this.el && !this.el.classList.contains('hidden'); }

  _build() {
    if (document.getElementById(PANEL_ID)) return;
    const el = document.createElement('div');
    el.id = PANEL_ID;
    el.className = 'menu-panel pioneer-menu hidden';
    el.innerHTML = `
      ${cornerFiligree()}
      <div class="menu-header">
        <h2>The Pioneer</h2>
        <button id="pioneer-menu-close" class="close-btn">×</button>
      </div>
      ${fractureRule()}
      <div class="pioneer-menu-grid">
        ${ENTRIES.map(e => `
          <button class="pioneer-menu-row" data-menu-key="${e.key}">
            <span class="pioneer-menu-key">${e.key.toUpperCase()}</span>
            <span class="pioneer-menu-text">
              <span class="pioneer-menu-name">${e.name}</span>
              <span class="pioneer-menu-sub">${e.sub}</span>
            </span>
          </button>
        `).join('')}
      </div>
      <div class="pioneer-menu-foot">
        Tab closes this. Every letter above works from here — and is
        yours to bind anywhere else.
      </div>
    `;
    (document.getElementById('menus-overlay') || document.body).appendChild(el);
    this.el = el;

    el.querySelector('#pioneer-menu-close').onclick = () => this.close();
    el.querySelectorAll('.pioneer-menu-row').forEach(btn => {
      btn.onclick = () => {
        const hit = ENTRIES.find(x => x.key === btn.dataset.menuKey);
        if (hit) this._openPanel(hit);
      };
    });
  }

  /**
   * Open one panel and stand down.
   *
   * ⚠️ Four of these panels expose `open()`/`close()` and the other
   * seven a `toggle(force)`. Calling `toggle()` blind on the first
   * group works; calling it on the second group with no argument also
   * works — but only by accident, and it would CLOSE a panel that was
   * already open. Prefer `open()` and fall back to `toggle(true)`, so
   * picking a row always means "show me this".
   */
  _openPanel(entry) {
    const ui = this._panels[entry.ui];
    if (!ui) {
      console.warn(`[Menu] "${entry.name}" is listed but ${entry.ui} was never injected — the row does nothing.`);
      return;
    }
    this.close();
    if (typeof ui.open === 'function') ui.open();
    else ui.toggle(true);
  }

  open() {
    // ⚠️ Close whatever else is up first. This is a hub, and stacking
    // it over an open Loom leaves two panels fighting for the same
    // overlay — the exact failure §5 records for WandMenuUI and BindUI
    // both answering V.
    overlayManager.closeAll();
    overlayManager.open(PANEL_ID);
    audioSystem.playUIClick?.('open');
    if (document.pointerLockElement) document.exitPointerLock();
    eventBus.emit(Events.UI_MENU_OPENED, {});
  }

  close() {
    overlayManager.close(PANEL_ID);
    audioSystem.playUIClick?.('close');
  }

  toggle() { this.isOpen ? this.close() : this.open(); }
}

export const menuUI = new MenuUI();
