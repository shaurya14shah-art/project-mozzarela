// ══════════════════════════════════════════════════════════
// The Satchel — inventory overlay
//
// The old inventory was one undifferentiated 6-column grid — every
// reagent, potion, ingot and boot mixed into a single sea of squares
// with no way to tell what you were looking at except a tooltip. It
// worked, but it didn't feel like anything.
//
// This keeps the exact same data model (InventorySystem's flat
// 30-slot array, indices unchanged) and every existing interaction —
// drag to equip, drag to reorder, double-click to equip, hover for a
// tooltip — but reads it as a travelling alchemist's satchel: named,
// labelled compartments (matching the shelf language already used by
// the Cauldron and Forge), plus a search bar so a full bag is still
// legible. Grouping is purely a rendering concern; `data-index` on
// every slot still points at the real underlying array position, so
// nothing downstream (equip logic, moveItem, stacking) had to change.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';
import { audioSystem } from '../systems/AudioSystem.js';
import { inventory } from '../systems/InventorySystem.js';
import { overlayManager } from './OverlayManager.js';
import { sceneManager } from '../rendering/SceneManager.js';
import { player } from '../entities/Player.js';
import { wandSystem } from '../systems/WandSystem.js';
import { sigilFor } from './Sigil.js';
import { loadout, WEAPON_SLOTS } from '../systems/LoadoutSystem.js';
import { bindSystem, BIND_KINDS, keyLabel } from '../systems/BindSystem.js';
import { bindUI } from './BindUI.js';
import { combatSystem } from '../systems/CombatSystem.js';
import { gatherSystem } from '../systems/GatherSystem.js';

// ── COMPARTMENTS ─────────────────────────────────────────
// Order matters — this is the order they're drawn in. An item is
// filed under the first compartment whose test it passes.
const COMPARTMENTS = [
  { key: 'reagents', label: 'Reagents',      test: (i) => i.isIngredient && !i.isDust },
  { key: 'dust',     label: 'Essence Dust',  test: (i) => !!i.isDust },
  { key: 'tools',    label: 'Tools & Kits',  test: (i) => i.type === 'tool' || i.type === 'station' },
  { key: 'food',     label: 'Food',          test: (i) => i.type === 'food' },
  { key: 'rites',    label: 'Oils, Wards & Draughts', test: (i) => i.type === 'ritual' },
  { key: 'potions',  label: 'Brewed Potions',test: (i) => !!i.isSpell },
  { key: 'arms',     label: 'Arms & Armour', test: (i) => ['weapon', 'armor', 'refined'].includes(i.type) },
  { key: 'sundry',   label: 'Sundries',      test: () => true }, // catch-all, always last
];

function compartmentFor(item) {
  return COMPARTMENTS.find(c => c.test(item)) || COMPARTMENTS[COMPARTMENTS.length - 1];
}

export class InventoryUI {
  constructor() {
    this.isOpen = false;
    this.draggedSlotIndex = null;
    this.search = '';

    // DOM Elements
    this.overlay = document.getElementById('menus-overlay');
    this.panel = document.getElementById('inventory-panel');
    this.grid = document.getElementById('inventory-grid');
    this.closeBtn = document.getElementById('close-inventory-btn');

    // Create Tooltip
    this.tooltip = document.createElement('div');
    this.tooltip.id = 'inv-tooltip';
    this.tooltip.style.display = 'none';
    document.body.appendChild(this.tooltip);

    // Bind events
    this._bindEvents();
    this.render();
  }

  _bindEvents() {
    // Esc / Close Button
    this.closeBtn.addEventListener('click', () => this.toggle(false));

    // ⚠️ Delegated on the panel, bound once — the loadout block is
    // re-rendered wholesale so per-element handlers would leak.
    this.panel?.addEventListener('click', (e) => {
      // The Memory's own summon letter. Same capture flow as the
      // Aspect rebind below — one implementation of "press a key".
      const gb = e.target.closest('[data-gearbind-id]');
      if (gb) {
        this.toggle(false);
        bindUI.open();
        bindUI._beginCapture(BIND_KINDS.GEAR, gb.dataset.gearbindId, gb.dataset.gearbindName);
        return;
      }
      const rb = e.target.closest('[data-rebind-id]');
      if (rb) {
        // Hand straight to the bindings panel's own capture flow, so
        // there is ONE implementation of "press a key" and it keeps
        // the reserved-key refusal and its message.
        this.toggle(false);
        bindUI.open();
        bindUI._beginCapture(BIND_KINDS.ASPECT, rb.dataset.rebindId, rb.dataset.rebindName);
        return;
      }
      const un = e.target.closest('#satchel-loadout-body [data-unequip-slot]');
      if (un) {
        const was = loadout.unequipWeapon(parseInt(un.dataset.unequipSlot, 10));
        if (was) inventory.addItem(was, 1);
        this.render();
      }
    });

    // Global Event Bus
    eventBus.on(Events.UI_TOGGLE_INVENTORY, () => this.render());
    // ⚠️ Repaint ONLY while open. `render()` rebuilds every compartment
    // and the whole loadout block, and both of these fire during
    // ordinary play (every summon, every rebind) — doing that work
    // against a hidden panel is pure cost.
    const repaint = () => { if (this.isOpen) this.render(); };
    eventBus.on(Events.LOADOUT_CHANGED, repaint);
    eventBus.on(Events.BINDINGS_CHANGED, repaint);

    // Keybinds
    document.addEventListener('keydown', (e) => {
      if (document.activeElement.tagName === 'INPUT') {
        // Same convention as the Cauldron/Forge search fields: the
        // first Escape leaves the field, not the whole panel.
        if (e.key === 'Escape') document.activeElement.blur();
        return;
      }

      // ⚠️ I IS KEPT as a direct key at the owner's instruction. Also
      // listed in the Pioneer menu (Tab). KeyI stays reserved.
      if (e.key.toLowerCase() === 'i') {
        this.toggle(!this.isOpen);
      }
      if (e.key === 'Escape' && this.isOpen) {
        this.toggle(false);
      }
    });

    // Keyboard equivalent for a slot's primary action. Slots respond
    // to dblclick (equip/infuse), not click, so Enter/Space replays
    // that rather than a plain click — a synthetic dblclick on the
    // exact element still reaches the listener bound to it in
    // _buildSlotEl below.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target.closest?.('.inv-slot');
      if (el) { e.preventDefault(); el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); }
    });

    document.addEventListener('input', (e) => {
      if (e.target.id === 'inventory-search') {
        this.search = e.target.value;
        this.render();
      }
    });

    // Tooltip Mouse Move
    document.addEventListener('mousemove', (e) => {
      if (this.tooltip.style.display !== 'none') {
        this.tooltip.style.left = `${e.clientX + 15}px`;
        this.tooltip.style.top = `${e.clientY + 15}px`;
      }
    });

    // Equipment Dropzones functionality
    const equipDropzones = document.querySelectorAll('.equip-dropzone');
    equipDropzones.forEach(dropzone => {
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        const draggedData = inventory.getSlotData()[this.draggedSlotIndex];
        const targetSlot = dropzone.dataset.slot;

        let valid = false;
        if (draggedData?.item) {
          if (targetSlot === 'weapon' && (draggedData.item.type === 'weapon' || draggedData.item.type === 'refined')) valid = true;
          if (targetSlot !== 'weapon' && draggedData.item.type === 'armor' && draggedData.item.slot === targetSlot) valid = true;
        }

        if (valid) {
          dropzone.classList.add('drag-over');
          e.dataTransfer.dropEffect = 'copy';
        } else {
          e.dataTransfer.dropEffect = 'none';
        }
      });

      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('drag-over');
      });

      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');

        if (this.draggedSlotIndex !== null) {
          const draggedData = inventory.getSlotData()[this.draggedSlotIndex];
          const targetSlot = dropzone.dataset.slot;

          let valid = false;
          if (draggedData?.item) {
            if (targetSlot === 'weapon' && (draggedData.item.type === 'weapon' || draggedData.item.type === 'refined')) valid = true;
            if (targetSlot !== 'weapon' && draggedData.item.type === 'armor' && draggedData.item.slot === targetSlot) valid = true;
          }

          if (valid) {
            if (targetSlot === 'weapon') {
              player.equipWeapon(draggedData.item);
            } else {
              player.equipArmor(targetSlot, draggedData.item);
            }

            dropzone.innerHTML = `<div class="inv-item-icon">${sigilFor(draggedData.item)}</div>`;

            // Re-bind tooltip onto the dropzone
            dropzone.onmouseenter = () => this._showTooltip(draggedData.item);
            dropzone.onmouseleave = () => { this.tooltip.style.display = 'none'; };
          }
        }
      });
    });
  }

  toggle(forceState) {
    this.isOpen = forceState !== undefined ? forceState : !this.isOpen;
    audioSystem.playUIClick(this.isOpen ? 'open' : 'close');

    if (this.isOpen) {
      overlayManager.open('inventory-panel');
      this.render();

      // Release pointer lock to interact with UI
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    } else {
      overlayManager.close('inventory-panel');
      this.tooltip.style.display = 'none';

      // Only re-engage pointer lock if no other menus are open
      if (!overlayManager.hasAnyOpen()) {
        const canvas = document.getElementById('game-canvas');
        if (canvas) canvas.requestPointerLock()?.catch?.(() => {});
      }
    }
  }

  // ── RENDER ───────────────────────────────────────────────

  /**
   * What is equipped, and what it can do.
   *
   * ⚠️ The satchel is where a player looks for "what do I have" — so
   * an equipped Memory has to be visible HERE, with its Aspects and
   * their keys, not only in a forge panel on another screen. Every
   * active Aspect gets a rebind control right on the row, because the
   * player asking "what key is this on" is already looking at it.
   */
  _renderLoadout() {
    const el = document.getElementById('satchel-loadout-body');
    if (!el) return;

    const aspectRow = (mem, ab) => {
      const id = `${mem.id}:${ab.key}`;
      const key = bindSystem.keyFor(BIND_KINDS.ASPECT, id);
      const entry = loadout.bar.find(e => e.id === id);
      const label = key ? keyLabel(key) : (entry ? entry.key : '—');
      return `
        <div class="sl-aspect${ab.active ? '' : ' passive'}">
          <span class="sla-key">${ab.active ? label : '·'}</span>
          <span class="sla-name">${ab.name}</span>
          <span class="sla-line">${ab.line}</span>
          ${ab.active
            ? `<button class="sla-rebind" data-rebind-id="${id}"
                       data-rebind-name="${ab.name.replace(/"/g, '&quot;')}">rebind</button>`
            : '<span class="sla-tag">passive</span>'}
        </div>`;
    };

    // ⚠️ THE THING'S OWN LETTER, not one of its Facets'. The rows
    // below already show a key per active Facet, and that is a
    // different key for a different job — an Facet key FIRES an
    // ability, this one SUMMONS and DISMISSES the whole Remnant. Both
    // are printed because a player who sees only Facet keys concludes
    // that equipping is panel-only, which it no longer is.
    const gearChip = (mem) => {
      const k = bindSystem.keyFor(BIND_KINDS.GEAR, mem.id);
      return `<button class="sl-gearkey${k ? '' : ' unbound'}"
                      data-gearbind-id="${mem.id}"
                      data-gearbind-name="${String(mem.name).replace(/"/g, '&quot;')}"
                      title="${k ? `${keyLabel(k)} puts it away, and calls it back.` : 'No letter yet — click to give it one.'}"
              >${k ? keyLabel(k) : '—'}</button>`;
    };

    const memBlock = (mem, where, slot) => `
      <div class="sl-mem" style="--g:${mem.tier?.color || 'var(--chrome)'}">
        <div class="sl-mem-head">
          <span class="sl-where">${where}</span>
          <span class="sl-name">${mem.name}</span>
          <span class="sl-grade">${mem.grade?.name} ${mem.formName}</span>
          ${gearChip(mem)}
          ${slot !== undefined
            ? `<button class="sl-off" data-unequip-slot="${slot}" title="Take it off">×</button>` : ''}
        </div>
        ${mem.inscription?.phrase
          ? `<div class="sl-insc">${mem.inscription.phrase} — <em>${mem.inscription.reading || mem.inscription.reason}</em></div>`
          : ''}
        ${(mem.abilities || []).map(a => aspectRow(mem, a)).join('')}
      </div>`;

    const weapons = loadout.weapons.map((w, i) => w
      ? memBlock(w, `Slot ${i + 1}${loadout.activeSlot === i ? ' · in hand' : ''}`, i)
      : `<div class="sl-mem empty"><div class="sl-mem-head">
           <span class="sl-where">Slot ${i + 1}</span>
           <span class="sl-name">Empty</span></div></div>`).join('');

    const held = loadout.held.map(h => memBlock(h, 'Carried')).join('');

    const armour = ['head', 'chest', 'legs'].map(k => `
      <div class="sl-armour"><span>${k}</span><strong>${player.armorTokens?.[k]?.name || '—'}</strong></div>`).join('');

    el.innerHTML = weapons + held
      + `<div class="sl-armour-row">${armour}</div>`
      + `<div class="sl-hint">Each thing's <strong>letter</strong> summons it and puts it away — three in the combat slots at once.
           Their active Facets fill the <strong>number keys 1–9</strong>. Click any key here to move it, or open the bindings panel (V).</div>`;
  }

  render() {
    if (!this.grid) return;
    this._renderLoadout();

    const slots = inventory.getSlotData();
    const query = this.search.trim().toLowerCase();

    // Bucket occupied slots into their compartment, keeping the real
    // array index attached to each — that index is the only thing
    // moveItem/equip/tooltip logic ever cares about, not DOM order.
    const buckets = new Map(COMPARTMENTS.map(c => [c.key, []]));
    let occupied = 0;

    slots.forEach((slotData, index) => {
      if (!slotData || !slotData.item) return;
      occupied++;
      if (query && !slotData.item.name.toLowerCase().includes(query)) return;
      buckets.get(compartmentFor(slotData.item).key).push({ slotData, index });
    });

    const countEl = document.getElementById('satchel-count');
    if (countEl) countEl.textContent = `${occupied} / ${inventory.capacity}`;

    const nonEmpty = COMPARTMENTS.filter(c => buckets.get(c.key).length > 0);

    if (!nonEmpty.length) {
      this.grid.innerHTML = `<div class="shelf-empty">
        ${query ? 'Nothing in the satchel matches that.' : 'The satchel is empty. Go find something worth carrying.'}
      </div>`;
      return;
    }

    this.grid.innerHTML = '';
    for (const comp of nonEmpty) {
      const entries = buckets.get(comp.key)
        .sort((a, b) => (b.slotData.item.tier?.level || 0) - (a.slotData.item.tier?.level || 0));

      const section = document.createElement('div');
      section.className = 'satchel-compartment';
      section.innerHTML = `
        <div class="satchel-compartment-label">
          <span>${comp.label}</span>
          <span class="satchel-compartment-count">${entries.length}</span>
        </div>
        <div class="satchel-compartment-grid"></div>
      `;

      const compGrid = section.querySelector('.satchel-compartment-grid');
      for (const { slotData, index } of entries) {
        compGrid.appendChild(this._buildSlotEl(slotData, index));
      }

      this.grid.appendChild(section);
    }
  }

  /** One occupied slot element, with every interaction wired to its real array index. */
  _buildSlotEl(slotData, index) {
    const slotEl = document.createElement('div');
    slotEl.className = 'inv-slot';
    slotEl.dataset.index = index;
    slotEl.draggable = true;
    slotEl.tabIndex = 0;
    slotEl.style.setProperty('--slot-el', `var(--el-${slotData.item.element || 'neutral'})`);
    slotEl.innerHTML = `
      <div class="inv-item-icon">${sigilFor(slotData.item)}</div>
      <div class="inv-item-count">${slotData.count > 1 ? slotData.count : ''}</div>
    `;

    slotEl.addEventListener('mouseenter', () => this._showTooltip(slotData.item));
    slotEl.addEventListener('mouseleave', () => { this.tooltip.style.display = 'none'; });

    slotEl.addEventListener('dragstart', (e) => {
      this.draggedSlotIndex = index;
      e.dataTransfer.effectAllowed = 'move';
      this.tooltip.style.display = 'none';
    });

    slotEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      slotEl.classList.add('drag-over');
    });

    slotEl.addEventListener('dragleave', () => {
      slotEl.classList.remove('drag-over');
    });

    slotEl.addEventListener('drop', (e) => {
      e.preventDefault();
      slotEl.classList.remove('drag-over');

      const targetIndex = index;
      if (this.draggedSlotIndex !== null && this.draggedSlotIndex !== targetIndex) {
        inventory.moveItem(this.draggedSlotIndex, targetIndex);
      }
      this.draggedSlotIndex = null;
    });

    slotEl.addEventListener('dblclick', () => {
      const item = slotData.item;

      // Brewed potions used to be inert here — you had to close the
      // satchel, open the wand (V), find the potion again and infuse
      // it there. Double-click now infuses straight into the best
      // slot (an empty one, or the one already holding this spell,
      // per wandSystem.bestSlotFor), which is the single most common
      // thing anyone does with a potion.
      if (item.isSpell) {
        const target = wandSystem.bestSlotFor(item);
        if (wandSystem.hold(item)) {
          inventory.consumeItems(item.id, 1);
          this.render();
        }
        return;
      }

      if (item.type === 'resource') return;

      // WORLD EXPANSION: kits are set down, food eaten, tools drawn.
      if (item.type === 'station') { gatherSystem.place(item); this.toggle(false); return; }
      if (item.type === 'food') { gatherSystem.eat(item); this.render(); return; }
      if (item.type === 'tool') { gatherSystem.draw(item.toolKind); this.toggle(false); return; }

      // STEEL: a ritual is prepared, not clicked — it takes a few seconds
      // in the world (CombatSystem.beginRitual), so the satchel closes.
      if (item.type === 'ritual') {
        if (combatSystem.beginRitual(item)) this.toggle(false);
        return;
      }

      // ⚠️ STEEL: a weapon goes on the BELT and into your hand — the
      // viewmodel, the swing and its family all follow the belt
      // (LoadoutSystem), so equipping only to the player left the old
      // weapon drawn. The one it displaces comes back to the satchel.
      if (item.type === 'weapon' && (item.weaponType || item.isMemory) && !item.isWand) {
        const belt = item.isMemory ? item : { ...item, isMemory: true, formId: 'weapon', formName: 'Weapon', equips: 'weapon',
          element: item.element || 'neutral', stats: { attack: item.power || item.stats?.attack || 12 }, abilities: [], flaws: [], signs: [] };
        let slot = loadout.weapons.findIndex(w => !w);
        if (slot < 0) slot = loadout.activeSlot;
        const r = loadout.equipWeapon(belt, slot);
        if (r.ok) {
          inventory.consumeItems(item.id, 1);
          if (r.displaced) inventory.addItem(r.displaced, 1);
          loadout.setActiveSlot(slot);
          eventBus.emit(Events.UI_NOTIFY, `${item.name} drawn.${loadout.weapons.filter(Boolean).length > 1 ? ' G switches between what is on your belt.' : ''}`);
          this.render();
        } else if (r.reason) eventBus.emit(Events.UI_NOTIFY, r.reason);
        return;
      }
      if (item.type === 'weapon' || item.type === 'refined') {
        player.equipWeapon(item);
        const weaponDropzone = document.getElementById('weapon-dropzone');
        if (weaponDropzone) {
          weaponDropzone.innerHTML = `<div class="inv-item-icon">${sigilFor(item)}</div>`;
          weaponDropzone.onmouseenter = () => this._showTooltip(item);
          weaponDropzone.onmouseleave = () => { this.tooltip.style.display = 'none'; };
        }
      } else if (item.type === 'armor') {
        player.equipArmor(item.slot, item);
        const armorDropzone = document.getElementById(`${item.slot}-dropzone`);
        if (armorDropzone) {
          armorDropzone.innerHTML = `<div class="inv-item-icon">${sigilFor(item)}</div>`;
          armorDropzone.onmouseenter = () => this._showTooltip(item);
          armorDropzone.onmouseleave = () => { this.tooltip.style.display = 'none'; };
        }
      }
    });

    return slotEl;
  }

  /**
   * What an item actually is and what it does. This used to print
   * one of exactly two strings — "Raw gathering material." or
   * "Crafted equipment." — for every item in the game, so a brewed
   * spell, an ingot and a pair of boots all described themselves
   * identically and none of the numbers that matter (damage, mana,
   * charges, defence) were visible anywhere in the satchel at all.
   */
  _itemLines(item) {
    const lines = [];

    if (item.isSpell) {
      lines.push(item.isWard
        ? `${item.power || 0} power · ${item.manaCost || 0} mana`
        : `${item.damage || 0} damage · ${item.manaCost || 0} mana`);
      if (item.charges) lines.push(`${item.charges} charges when infused`);
      if (item.form) lines.push(`${item.form} form`);
      lines.push('<em>Double-click to infuse into the wand</em>');
    } else if (item.type === 'weapon' || item.type === 'refined') {
      const atk = item.stats?.attack || item.power;
      if (atk) lines.push(`${atk} attack`);
      lines.push('<em>Double-click to equip</em>');
    } else if (item.type === 'armor') {
      if (item.defense) lines.push(`${item.defense} defence`);
      if (item.slot) lines.push(`Worn on the ${item.slot}`);
      lines.push('<em>Double-click to equip</em>');
    } else if (item.isDust) {
      lines.push('Essence dust — refines and transmutes at the forge.');
    } else if (item.isIngredient) {
      lines.push('Reagent — brews into spells at the cauldron.');
    } else {
      lines.push('Raw gathering material.');
    }

    if (item.element) lines.push(`Element: ${item.element}`);
    return lines;
  }

  _showTooltip(itemDef) {
    if (!this.isOpen) return;

    const color = itemDef.tier?.color || '#ffffff';
    const elColor = itemDef.element ? `var(--el-${itemDef.element})` : color;

    this.tooltip.innerHTML = `
      <div class="tooltip-title" style="color: ${elColor}">${itemDef.name}</div>
      ${itemDef.tier ? `<div class="tooltip-tier" style="color: ${color}">${Math.max(itemDef.tier.level, 1)} - ${itemDef.tier.name}</div>` : ''}
      <div class="tooltip-body">
        ${this._itemLines(itemDef).map(l => `<div>${l}</div>`).join('')}
      </div>
    `;
    this.tooltip.style.display = 'block';
  }
}

// Instantiate globally to auto-bind events
export const inventoryUI = new InventoryUI();
