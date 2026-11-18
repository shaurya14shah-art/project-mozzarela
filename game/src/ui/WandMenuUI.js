// ══════════════════════════════════════════════════════════
// The Fracture Wand — what is in the wand, and what could be. H.
//
// Two columns. LEFT: the Weaves currently held in the wand, each
// showing the key it is bound to. RIGHT: every Weave in the satchel,
// one click to put it in the wand.
//
// ── ⚠️ WHAT WAS WRONG WITH THIS FILE ──────────────────────
// It was the PRE-BINDINGS panel and had been left half-migrated when
// numbered infusion slots became the id-keyed `held` Map. Four
// separate faults, and between them the panel could not do either of
// the two things it exists for:
//
//  1. `_renderPotions()` ended with `if (!potions.length)` — a
//     ReferenceError on a variable that had been renamed to `weaves`
//     in the potions→Weaves pass. It threw on EVERY render, so the
//     "Woven signs" column was permanently empty. And because the
//     click handler also calls `_render()`, infusing threw too. One
//     stale identifier took out both halves of the panel.
//  2. `bestSlotFor()` returned an ID while its name promised an index,
//     so `slots[target]` was undefined and the button read
//     "Infuse → slot fire_lance1".
//  3. Slots were rendered by array position and clicked through
//     `setActive(i)` / `clearSlot(parseInt(...))`, both of which take
//     an id now — so selecting and clearing silently did nothing.
//  4. It listened on **V**, which is BindUI's key, so pressing V
//     opened two panels stacked on top of each other.
//
// ⚠️ There is no such thing as "slot 1" any more. Weaves are keyed by
// their own id and reach a key through BindSystem. Anything in here
// that looks like an index is a bug.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';
import { audioSystem } from '../systems/AudioSystem.js';
import { wandSystem } from '../systems/WandSystem.js';
import { inventory } from '../systems/InventorySystem.js';
import { bindSystem, BIND_KINDS } from '../systems/BindSystem.js';
import { sigilFor } from './Sigil.js';
import { overlayManager } from './OverlayManager.js';

const PANEL_ID = 'wand-menu-panel';

export class WandMenuUI {
  constructor() {
    this.isOpen = false;
    this._pendingBind = null;
    this._captureHandler = null;
    this._injectHTML();
    this._bindEvents();
  }

  _injectHTML() {
    document.getElementById(PANEL_ID)?.remove();

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'menu-panel wand-menu-panel hidden';
    panel.innerHTML = `
      <div class="menu-header">
        <h2>The Fracture Wand</h2>
        <button id="close-wand-menu-btn" class="close-btn">×</button>
      </div>
      <div class="wand-menu-hint">
        Put a Weave in the wand, then give it a key. When its charges run out it goes
        <em>dim</em> — weaker and thirstier, but never gone. Put it in again to restore it.
      </div>
      <div class="wand-menu-body">
        <div class="wand-slot-column" id="wand-slot-column"></div>
        <div class="wand-potion-column">
          <div class="wand-col-head">Woven signs in the satchel</div>
          <div class="wand-potion-list" id="wand-potion-list"></div>
        </div>
      </div>
    `;

    document.getElementById('menus-overlay')?.appendChild(panel);
    this.panel = panel;
  }

  _bindEvents() {
    document.addEventListener('click', (e) => {
      if (e.target.id === 'close-wand-menu-btn') { this.toggle(false); return; }

      const infuseBtn = e.target.closest('[data-infuse]');
      if (infuseBtn) { this._infuse(infuseBtn.dataset.infuse); return; }

      // ⚠️ dataset values are STRINGS and these are ids, so no parseInt.
      const clearBtn = e.target.closest('[data-clear-id]');
      if (clearBtn) {
        wandSystem.clearSlot(clearBtn.dataset.clearId);
        this._render();
        return;
      }

      const bindBtn = e.target.closest('[data-bind-id]');
      if (bindBtn) { this._beginBind(bindBtn.dataset.bindId); return; }

      const row = e.target.closest('.wand-menu-slot');
      if (row) { wandSystem.setActive(row.dataset.wandId); this._render(); }
    });

    document.addEventListener('keydown', (e) => {
      if (document.activeElement.tagName === 'INPUT') return;
      // ⚠️ H, not V. V is BindUI's — see the file header.
      // ⚠️ The global letter key is GONE — every panel now opens from
      // the Pioneer menu (Tab), which frees the letter for the player
      // to bind. See ui/MenuUI.js. Escape still closes.
      if (e.key === 'Escape' && this.isOpen) this.toggle(false);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target.closest?.('.wand-menu-slot');
      if (el) { e.preventDefault(); el.click(); }
    });

    eventBus.on(Events.WAND_UPDATE, () => { if (this.isOpen) this._render(); });
    // ⚠️ BINDINGS_CHANGED, not BIND_UPDATE. `Events.BIND_UPDATE` is
    // undefined, and `eventBus.on(undefined, fn)` registers a listener
    // under the key `undefined` that nothing ever emits — it fails
    // completely silently, which is the worst way for a repaint to be
    // wrong.
    eventBus.on(Events.BINDINGS_CHANGED, () => { if (this.isOpen) this._render(); });
    eventBus.on(Events.UI_TOGGLE_INVENTORY, () => { if (this.isOpen) this._render(); });
  }

  toggle(force) {
    this.isOpen = force !== undefined ? force : !this.isOpen;
    audioSystem.playUIClick(this.isOpen ? 'open' : 'close');
    if (this.isOpen) {
      overlayManager.open(PANEL_ID);
      if (document.pointerLockElement) document.exitPointerLock();
      this._render();
    } else {
      this._endBind();
      overlayManager.close(PANEL_ID);
      if (!overlayManager.hasAnyOpen()) {
        document.getElementById('game-canvas')?.requestPointerLock?.()?.catch?.(() => {});
      }
    }
  }

  /** Put a Weave from the satchel into the wand. */
  _infuse(itemId) {
    const stack = inventory.getSlotData().find(s => s && s.item.id === itemId);
    if (!stack) return;
    if (wandSystem.hold(stack.item)) {
      inventory.consumeItems(itemId, 1);
      this._render();
    }
  }

  // ── BINDING FROM THIS PANEL ─────────────────────────────
  // The complaint was "I cannot bind them", and telling the player a
  // *different* panel owns keys is not an answer. This captures one
  // keypress and hands it to the same BindSystem the Bindings panel
  // uses — one registry, two doors into it.
  //
  // ⚠️ Capture mode swallows EVERY key while live, exactly as BindUI's
  // does, which is why it needs loud visible state and an Escape.
  // Without that a player pressing J for the journal silently binds
  // something to J.

  _beginBind(id) {
    const slot = wandSystem.slotFor(id);
    if (!slot?.spell) return;
    this._endBind();
    this._pendingBind = id;
    this._render();

    this._captureHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { this._endBind(); this._render(); return; }
      // ⚠️ bind() returns `{ ok, reason }`, NOT a boolean. Testing it
      // as a boolean would make every rejection look like a success
      // and throw away the reason, which is the only thing that tells
      // the player why a reserved key refused them.
      const res = bindSystem.bind(e.code, {
        kind: BIND_KINDS.WEAVE,
        id,
        name: slot.spell.name,
      });
      this._endBind();
      this._render();
      if (!res?.ok) {
        eventBus.emit(Events.UI_NOTIFY, res?.reason || 'That key will not take it.');
      } else {
        eventBus.emit(Events.UI_NOTIFY, `${slot.spell.name} → ${_label(e.code)}`);
      }
    };
    window.addEventListener('keydown', this._captureHandler, true);
  }

  _endBind() {
    if (this._captureHandler) {
      window.removeEventListener('keydown', this._captureHandler, true);
      this._captureHandler = null;
    }
    this._pendingBind = null;
  }

  // ── RENDER ──────────────────────────────────────────────

  _render() {
    this._renderHeld();
    this._renderSatchel();
  }

  /** Everything currently in the wand, keyed by id. */
  _renderHeld() {
    const col = document.getElementById('wand-slot-column');
    if (!col) return;

    const held = wandSystem.getSlots();

    if (!held.length) {
      col.innerHTML = `<div class="wand-col-head">In the wand</div>
        <div class="wand-potion-empty">Nothing in the wand yet. Put a Weave in from the right.</div>`;
      return;
    }

    col.innerHTML = `<div class="wand-col-head">In the wand</div>` + held.map((slot) => {
      const spell = slot.spell;
      if (!spell) return '';
      const pct = slot.maxCharges ? (slot.charges / slot.maxCharges) * 100 : 0;
      const isActive = wandSystem.activeId === slot.id;
      const key = bindSystem.keyFor(BIND_KINDS.WEAVE, slot.id);
      const capturing = this._pendingBind === slot.id;

      return `
        <div class="wand-menu-slot ${isActive ? 'active' : ''} ${slot.dim ? 'dim' : ''}"
             data-wand-id="${slot.id}" tabindex="0"
             style="--slot-el: var(--el-${spell.element || 'neutral'})">
          <div class="wms-key ${key ? '' : 'unbound'}">${key ? _label(key) : '—'}</div>
          <div class="wms-icon">${sigilFor(spell)}</div>
          <div class="wms-info">
            <div class="wms-name">
              ${spell.name}
              ${slot.dim ? '<span class="wms-dim-tag">DIM</span>' : ''}
            </div>
            <div class="wms-meta">
              <span style="color:var(--el-${spell.element})">${spell.element}</span> · ${spell.formName || spell.form} ·
              ${spell.isWard ? `${spell.power} power` : `${spell.damage} dmg`} · ${spell.manaCost} mana
            </div>
            <div class="wms-charge-track">
              <div class="wms-charge-fill" style="width:${pct}%"></div>
            </div>
            <div class="wms-charge-text">
              ${slot.dim ? 'Out of charges — running on residue'
                         : `${slot.charges} / ${slot.maxCharges} charges`}
            </div>
          </div>
          <div class="wms-actions">
            <button class="wms-bind ${capturing ? 'capturing' : ''}" data-bind-id="${slot.id}">
              ${capturing ? 'press a key…' : (key ? 'rebind' : 'bind a key')}
            </button>
            <button class="wms-clear" data-clear-id="${slot.id}" title="Take it back out">×</button>
          </div>
        </div>`;
    }).join('');
  }

  /** Every Weave in the satchel. */
  _renderSatchel() {
    const list = document.getElementById('wand-potion-list');
    if (!list) return;

    const merged = new Map();
    for (const stack of inventory.getSlotData()) {
      if (!stack || !stack.item.isSpell) continue;
      const entry = merged.get(stack.item.id);
      if (entry) entry.count += stack.count;
      else merged.set(stack.item.id, { item: stack.item, count: stack.count });
    }

    const weaves = [...merged.values()]
      .sort((a, b) => (b.item.tier?.level || 0) - (a.item.tier?.level || 0));

    // ⚠️ `weaves`, not `potions`. This exact line was the
    // ReferenceError that emptied the whole column — see the header.
    if (!weaves.length) {
      list.innerHTML = `<div class="wand-potion-empty">
        No Weaves in the satchel. Weave one at the Loom (<kbd>B</kbd>).
      </div>`;
      return;
    }

    list.innerHTML = weaves.map(({ item, count }) => {
      const heldId = wandSystem.heldIdFor(item);
      const slot = heldId ? wandSystem.slotFor(heldId) : null;
      const label = slot ? (slot.dim ? 'Restore it' : 'Top it up') : 'Put in the wand';

      return `
        <div class="wand-potion-row" style="--row-el: var(--el-${item.element || 'neutral'})">
          <span class="wpr-icon">${sigilFor(item)}</span>
          <div class="wpr-info">
            <div class="wpr-name" style="color:${item.tier?.color || 'var(--ink-strong)'}">
              ${item.name} ${count > 1 ? `<span class="wpr-count">×${count}</span>` : ''}
            </div>
            <div class="wpr-meta">
              ${item.isWard ? `${item.power} power` : `${item.damage} dmg`} · ${item.charges} charges · ${item.manaCost} mana
              ${item.instability > 0.25 ? ` · <span class="wpr-volatile">${Math.round(item.instability * 100)}% volatile</span>` : ''}
            </div>
          </div>
          <button class="wpr-infuse ${slot ? 'refill' : ''}" data-infuse="${item.id}">${label}</button>
        </div>`;
    }).join('');
  }
}

/** 'KeyQ' → 'Q', 'Digit1' → '1'. Mirrors BindSystem's own labeller. */
function _label(code) {
  return String(code).replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'N');
}

export const wandMenuUI = new WandMenuUI();
