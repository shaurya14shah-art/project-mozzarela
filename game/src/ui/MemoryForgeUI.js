// ══════════════════════════════════════════════════════════
// The Loom — where Memories are forged. B.
//
// This REPLACES the brewing panel. The Loom no longer resolves a
// spell out of reagents; it forges a Memory (see data/memories.js).
//
// Three columns:
//   LEFT   what you are making (form) and what you are spending (cores)
//   CENTRE the signs — each one declares a property — and the grid
//   RIGHT  the Memory that would come out, in full, before you commit
//
// ── ⚠️ THE RIGHT COLUMN IS THE POINT ──────────────────────
// It shows the finished Memory — name, grade, every Aspect, every
// Flaw — BEFORE you spend anything. This system generates its own
// names and abilities, and a generator you cannot preview is a slot
// machine. The player must be able to see that drawing a straight
// line put Strength in it, and change their mind.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';
import { audioSystem } from '../systems/AudioSystem.js';
import { inventory } from '../systems/InventorySystem.js';
import { memoryForge } from '../systems/MemoryForge.js';
import { loadout, WEAPON_SLOTS, budgetFor } from '../systems/LoadoutSystem.js';
import {
  MEMORY_FORMS, FORM_IDS, ATTRIBUTES, ATTRIBUTE_IDS, SIGN_PROPERTIES,
} from '../data/memories.js';
import { RuneGridUI } from './RuneGridUI.js';
import { grammarGuide } from '../data/runic.js';
import { overlayManager } from './OverlayManager.js';
import { elementGlyph, vesselMark } from './Sigil.js';
import { bindSystem, BIND_KINDS, keyLabel } from '../systems/BindSystem.js';
import { bindUI } from './BindUI.js';

const PANEL_ID = 'memory-forge-panel';

/** What counts as a core: anything that is not itself a Memory. */
function isCore(item) {
  return item && !item.isMemory && item.type !== 'weapon';
}

export class MemoryForgeUI {
  constructor() {
    this.isOpen = false;
    this.formId = 'weapon';
    /** Item stacks committed as cores, by id. */
    this.cores = [];
    /** Signs drawn over this forging. No cap — see CONFLUENCE note. */
    this.signs = [];
    /** A Memory selected from the satchel to ascend/enchant, or null. */
    this.target = null;
    this.runeGrid = null;
    this._injectHTML();
    this._bindEvents();
  }

  _injectHTML() {
    document.getElementById(PANEL_ID)?.remove();
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'menu-panel forge-panel hidden';
    panel.innerHTML = `
      <div class="menu-header">
        <h2>The Loom</h2>
        <button id="forge-close" class="close-btn">×</button>
      </div>
      <div class="forge-tabs">
        <button class="forge-tab picked" data-tab="forge">Forge</button>
        <button class="forge-tab" data-tab="equip">Equip &amp; Enchant</button>
      </div>
      <div class="forge-body">
        <div class="forge-col forge-left">
          <div class="forge-col-head">What you are making</div>
          <div id="forge-forms" class="forge-forms"></div>
          <div class="forge-col-head">Cores — these set the grade</div>
          <div id="forge-cores" class="forge-cores"></div>
          <div class="forge-col-head">Or work on one you have</div>
          <div id="forge-targets" class="forge-targets"></div>
        </div>
        <div class="forge-col forge-centre">
          <div class="forge-vessel">${vesselMark()}</div>
          <div id="forge-signs" class="forge-signs"></div>
          <div id="forge-grid-mount"></div>
          <div id="forge-rules" class="forge-rules"></div>
        </div>
        <div class="forge-col forge-right">
          <div class="forge-col-head">What comes out</div>
          <div id="forge-preview" class="forge-preview"></div>
          <div class="forge-actions">
            <button id="forge-do" class="brew-button">Forge</button>
            <button id="forge-clear" class="ghost-button">Unpick</button>
          </div>
        </div>
      </div>
    `;
    // ── The Equip page ──
    // ⚠️ A second PAGE inside the same panel, not a second panel.
    // Forging and equipping are one subject and one key (B); splitting
    // them would mean a player who forges a Memory has no idea where
    // it went. This is also where enchanting lives — see _renderEquip.
    const equip = document.createElement('div');
    equip.className = 'forge-equip hidden';
    equip.id = 'forge-equip-page';
    equip.innerHTML = `
      <div class="forge-col-head">Weapons — three at once, and the one in hand</div>
      <div id="equip-weapons" class="equip-weapons"></div>
      <div class="forge-col-head">Carried — charms, relics, raiment. Passive.</div>
      <div id="equip-held" class="equip-held"></div>
      <div class="forge-col-head">In the satchel</div>
      <div id="equip-bag" class="equip-bag"></div>
      <div class="forge-col-head">The bar — active Facets only</div>
      <div id="equip-bar" class="equip-bar"></div>
      <div class="forge-col-head">Enchant — lay new signs over one you already have</div>
      <div class="equip-enchant">
        <div class="ench-left">
          <div id="ench-target" class="ench-target"></div>
          <div id="ench-signs" class="forge-signs"></div>
          <div id="ench-grid-mount"></div>
        </div>
        <div class="ench-right">
          <div id="ench-preview" class="forge-preview"></div>
          <button id="ench-do" class="brew-button" disabled>Enchant</button>
        </div>
      </div>
    `;
    panel.appendChild(equip);

    document.getElementById('menus-overlay')?.appendChild(panel);
    this.panel = panel;
    this.tab = 'forge';

    // ⚠️ A SECOND, INDEPENDENT rune grid.
    // Enchanting needs its own set of signs — the forge page's signs
    // describe a Memory being made from nothing, and reusing one grid
    // would mean drawing an enchantment silently altered whatever was
    // half-composed on the other page.
    this.enchantSigns = [];
    this.enchantTarget = null;
    const emount = panel.querySelector('#ench-grid-mount');
    if (emount) {
      this.enchantGrid = new RuneGridUI((rune) => {
        if (rune) this._inscribeEnchant(rune);
        this._render();
      });
      this.enchantGrid.mount(emount);
    }

    const mount = panel.querySelector('#forge-grid-mount');
    if (mount) {
      this.runeGrid = new RuneGridUI((rune) => {
        if (rune) this._inscribe(rune);
        this._render();
      });
      this.runeGrid.mount(mount);
    }
  }

  _bindEvents() {
    document.addEventListener('click', (e) => {
      if (e.target.id === 'forge-close') { this.toggle(false); return; }
      if (e.target.closest('#forge-do')) { this._commit(); return; }
      if (e.target.closest('#forge-clear')) { this._clear(); return; }

      const tab = e.target.closest('.forge-tab');
      if (tab) { this.tab = tab.dataset.tab; this._render(); return; }

      // ⚠️ BEFORE the equip/hold branches. A gear chip sits INSIDE a
      // bag row that also carries `data-equip-id`/`data-hold-id` on
      // its buttons — but `closest()` walks up from the actual click
      // target, so the chip only matches its own attribute. Ordering
      // it first is belt-and-braces against a later markup change that
      // nests them the other way, which would silently equip the thing
      // instead of rebinding it.
      const gb = e.target.closest('[data-gearbind-id]');
      if (gb) {
        // One capture flow, shared with the satchel's rebind button —
        // so the reserved-key refusal and its wording cannot drift.
        this.toggle(false);
        bindUI.open();
        bindUI._beginCapture(BIND_KINDS.GEAR, gb.dataset.gearbindId, gb.dataset.gearbindName);
        return;
      }

      const eq = e.target.closest('[data-equip-id]');
      if (eq) { this._equip(eq.dataset.equipId, parseInt(eq.dataset.slot ?? '0', 10)); return; }
      const unEq = e.target.closest('[data-unequip-slot]');
      if (unEq) { this._unequip(parseInt(unEq.dataset.unequipSlot, 10)); return; }
      const hold = e.target.closest('[data-hold-id]');
      if (hold) { this._hold(hold.dataset.holdId); return; }
      const dropB = e.target.closest('[data-drop-id]');
      if (dropB) { this._drop(dropB.dataset.dropId); return; }
      if (e.target.closest('#ench-do')) { this._applyEnchant(); return; }
      const et = e.target.closest('[data-ench-target]');
      if (et) {
        this.enchantTarget = this.enchantTarget === et.dataset.enchTarget ? null : et.dataset.enchTarget;
        this._render(); return;
      }
      const es = e.target.closest('#ench-signs [data-sign-index]');
      if (es) { this.enchantSigns.splice(parseInt(es.dataset.signIndex, 10), 1); this._render(); return; }

      const inHand = e.target.closest('[data-inhand-slot]');
      if (inHand) { loadout.setActiveSlot(parseInt(inHand.dataset.inhandSlot, 10)); this._render(); return; }

      const form = e.target.closest('#forge-forms [data-form]');
      if (form) { this.formId = form.dataset.form; this.target = null; audioSystem.playUIClick?.('open'); this._render(); return; }

      // ⚠️ Two different controls. The committed row takes one BACK;
      // the satchel row puts one IN. Sharing one handler is what made
      // this a toggle in the first place.
      const un = e.target.closest('#forge-cores .forge-core.committed[data-core]');
      if (un) { this._uncommitCore(un.dataset.core); return; }
      const core = e.target.closest('#forge-cores [data-core]');
      if (core) { this._toggleCore(core.dataset.core); return; }

      const sign = e.target.closest('#forge-signs [data-sign-index]');
      if (sign) { this.signs.splice(parseInt(sign.dataset.signIndex, 10), 1); this._render(); return; }

      const tgt = e.target.closest('#forge-targets [data-target]');
      if (tgt) { this._selectTarget(tgt.dataset.target); return; }
    });

    document.addEventListener('keydown', (e) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      // ⚠️ B IS KEPT as a direct key at the owner's instruction — the
      // Loom is one of the four panels reached often enough that a
      // Tab hop in front of it is a cost, not a saving. It is also
      // still listed in the Pioneer menu (Tab), so there are two ways
      // in and one of them teaches the other.
      // ⚠️ KeyB therefore STAYS in BindSystem.RESERVED_KEYS.
      if (e.key.toLowerCase() === 'b') this.toggle(!this.isOpen);
      if (e.key === 'Escape' && this.isOpen) this.toggle(false);
    });

    eventBus.on(Events.UI_TOGGLE_INVENTORY, () => { if (this.isOpen) this._render(); });
  }

  toggle(force) {
    this.isOpen = force !== undefined ? force : !this.isOpen;
    audioSystem.playUIClick?.(this.isOpen ? 'open' : 'close');
    if (this.isOpen) {
      overlayManager.open(PANEL_ID);
      if (document.pointerLockElement) document.exitPointerLock();
      this._render();
    } else {
      // ⚠️ RETURN THE CORES. They are taken out of the satchel the
      // moment they are committed, so closing the panel with a
      // composition in progress used to leave them held by a UI object
      // the player cannot see — recoverable only by reopening and
      // pressing Unpick, and lost outright to anyone who did not know
      // that. Measured: 3 cores in the bag, 1 committed, closed, 2 in
      // the bag and one in limbo.
      this._returnCores();
      overlayManager.close(PANEL_ID);
      if (!overlayManager.hasAnyOpen()) {
        document.getElementById('game-canvas')?.requestPointerLock?.()?.catch?.(() => {});
      }
    }
  }

  /** Put every committed core back in the satchel. Idempotent. */
  _returnCores() {
    for (const c of this.cores) inventory.addItem(c, 1);
    this.cores = [];
  }

  // ── COMPOSING ───────────────────────────────────────────

  _inscribe(rune) {
    // ⚠️ One sign once. Not a cap on HOW MANY (the owner removed that
    // deliberately) — a rule that the same shape drawn twice says
    // nothing twice, so stacking is a choice of geometry rather than a
    // repetition count.
    if (this.signs.some(s => s.id === rune.id)) {
      this.runeGrid?.say('That sign is already laid.', 'mishap');
      return;
    }
    this.signs.push(rune);
    const read = memoryForge.readSign(rune);
    audioSystem.playUIClick?.('open');
    this.runeGrid?.clear(
      read
        ? `${read.letter.name} — "${read.letter.means}". ${read.letter.connotation}.`
        : 'Laid.',
      'known');
  }

  /**
   * Commit one more of this core.
   *
   * ⚠️ ADDS, it does not toggle. The first version flipped the id on
   * and off, so a player holding twenty Ember Cores could commit
   * exactly ONE of them — which capped a Memory's grade at "how many
   * distinct item types do you own" rather than "how much material
   * did you bring". Measured: six clicks on one id left zero cores
   * committed. Take them back with the committed row (see
   * `_uncommitCore`) or Unpick.
   */
  _toggleCore(itemId) {
    const stack = inventory.getSlotData().find(s => s && s.item.id === itemId);
    if (!stack || stack.count < 1) return;
    if (!inventory.consumeItems(itemId, 1)) return;
    this.cores.push(stack.item);
    audioSystem.playUIClick?.('open');
    this._render();
  }

  /** Take one committed core back out. */
  _uncommitCore(itemId) {
    const at = this.cores.findIndex(c => c.id === itemId);
    if (at < 0) return;
    inventory.addItem(this.cores[at], 1);
    this.cores.splice(at, 1);
    audioSystem.playUIClick?.('close');
    this._render();
  }

  _selectTarget(id) {
    const stack = inventory.getSlotData().find(s => s && s.item.id === id && s.item.isMemory);
    this.target = this.target?.id === id ? null : (stack?.item || null);
    audioSystem.playUIClick?.('open');
    this._render();
  }

  _clear() {
    this._returnCores();
    this.signs = [];
    this.target = null;
    this.runeGrid?.clear();
    this._render();
  }

  /** What the current composition would produce. Never throws. */
  _preview() {
    if (this.target && this.signs.length) return memoryForge.enchant(this.target, this.signs);
    if (this.target && this.cores.length) return memoryForge.ascend(this.target, this.cores);
    if (this.target) return { ok: false, reason: 'Add cores to ascend it, or signs to enchant it.' };
    return memoryForge.forge(this.formId, this.cores, this.signs, this._element(), this._ownedKeys());
  }

  /**
   * Every Aspect key the player is already carrying.
   *
   * ⚠️ THE ANSWER TO "multiple same active attacks amongst multiple
   * weapons". `MemoryForge` deduplicates Aspects only WITHIN a single
   * Memory — nothing anywhere stopped two different Memories rolling
   * the same one, so a satchel of five things routinely showed the
   * same attack three times.
   *
   * ⚠️ Computed HERE, not in MemoryForge, so the forge keeps no
   * dependency on the inventory or the loadout and stays a pure
   * function of its arguments when called without this. It is passed
   * as a soft preference (see `forge()`), never a hard filter.
   *
   * ⚠️ Reads the loadout AND the satchel. Equipped Memories are not in
   * the bag (the two are deliberately exclusive), so looking at only
   * one of them would miss exactly the Memories the player is actually
   * using and comparing against.
   */
  _ownedKeys() {
    const keys = new Set();
    const eat = (mem) => {
      for (const a of (mem?.abilities || [])) keys.add(a.key);
    };
    loadout.weapons.forEach(eat);
    loadout.held.forEach(eat);
    for (const st of inventory.getSlotData()) {
      if (st?.item?.isMemory) eat(st.item);
    }
    return keys;
  }

  /** Dominant element of the committed cores. */
  _element() {
    const tally = {};
    for (const c of this.cores) if (c.element) tally[c.element] = (tally[c.element] || 0) + 1;
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : 'neutral';
  }

  _commit() {
    const res = this._preview();
    if (!res.ok) { eventBus.emit(Events.UI_NOTIFY, res.reason); return; }

    // Spend. Cores are already out of the bag (taken on selection).
    if (this.target) inventory.consumeItems(this.target.id, 1);
    inventory.addItem(res.memory, 1);

    // ⚠️ A LETTER FIRST, THEN A SLOT. Owner: "once something is
    // crafted it can be bound to a letter." Binding BEFORE equipping
    // matters — auto-equip is allowed to decline (a full loadout is
    // deliberately left alone), and a thing that could not be equipped
    // is exactly the thing that most needs a key to call it with
    // later. Giving the letter only to what happened to fit would
    // leave the overflow permanently unreachable, which is the state
    // this whole pass exists to end.
    //
    // ⚠️ An ASCEND keeps the same id (MemoryForge.ascend re-stamps it
    // deliberately), so this returns the letter it already had rather
    // than spending a second one on the same thing.
    const letter = loadout.autoBindGear(res.memory);
    loadout.pruneGearBindings();

    const verb = this.target ? (this.signs.length ? 'reworked' : 'ascended') : 'forged';
    // ⚠️ SAY IT EITHER WAY. `autoBindGear` returns null when every
    // bindable key is already taken, and a forged thing that quietly
    // got no key is indistinguishable from one whose key quietly does
    // nothing — which is the exact confusion this pass is fixing.
    const keyLine = letter
      ? ` ${keyLabel(letter)} calls it in and out.`
      : ' No free key left — clear one in the bindings panel (V).';
    eventBus.emit(Events.UI_NOTIFY,
      `${res.memory.name} — ${res.memory.grade.name} ${res.memory.formName}, ${res.memory.abilities.length} Facet${res.memory.abilities.length === 1 ? '' : 's'}. (${verb})${keyLine}`);

    // ⚠️ AUTO-EQUIP INTO A FREE SLOT.
    // Forging used to leave the Memory in the satchel, so a player had
    // to know to open a second page and equip it before any of its
    // Aspects existed — which reads exactly like "I made this and it
    // does nothing". If there is somewhere obvious to put it, put it
    // there. A full loadout is left alone: silently displacing a
    // weapon the player chose would be worse than not equipping.
    const auto = this._autoEquip(res.memory);
    if (auto) eventBus.emit(Events.UI_NOTIFY, auto);

    this.cores = [];
    this.signs = [];
    this.target = null;
    this.runeGrid?.clear('Drawn and done. Draw again.');
    this._render();
  }

  /**
   * Put a freshly-made Memory somewhere useful, if somewhere is free.
   * Returns a line to tell the player, or null if it stayed in the bag.
   */
  _autoEquip(memory) {
    // ⚠️ `budgetFor()`, NOT `memory.equips`. Echo and Relic BOTH
    // declare `equips: 'bindable'` (MEMORY_FORMS), so checking equips
    // here sent every freshly-forged Echo into `loadout.hold()` —
    // which correctly REFUSES it, since an Echo spends a combat slot
    // now, not a carry slot. The refusal was silent here (autoEquip
    // just returns null on failure), so a forged Echo sat in the bag
    // with no equip button ever shown for it at all. Same shape as
    // trap #11: a display/lookup collision, just one field over.
    if (budgetFor(memory) === 'combat') {
      const free = loadout.weapons.findIndex(w => !w);
      if (free < 0) return null;                    // all three combat slots taken — leave it
      const res = loadout.equipWeapon(memory, free);
      if (!res.ok) return null;
      inventory.consumeItems(memory.id, 1);
      if (memory.formId === 'echo') {
        return `Drawn into slot ${free + 1}. It is taking shape beside you.`;
      }
      const acts = memory.abilities.filter(a => a.active).length;
      return acts
        ? `Drawn into slot ${free + 1}. ${acts} Facet${acts === 1 ? '' : 's'} on your keys.`
        : `Drawn into slot ${free + 1}.`;
    }
    // Charms, relics, raiment — carried, if not already.
    const res = loadout.hold(memory);
    if (!res.ok) return null;
    inventory.consumeItems(memory.id, 1);
    return `Carried. ${memory.name} is working.`;
  }

  // ── EQUIPPING ───────────────────────────────────────────
  // ⚠️ Every one of these moves the Memory BETWEEN the bag and the
  // loadout — it is never in both. A Memory left in the satchel while
  // also equipped could be transmuted or spent while its Aspects were
  // still on the bar.

  _equip(id, slot) {
    const stack = inventory.getSlotData().find(s => s && s.item.id === id && s.item.isMemory);
    if (!stack) return;
    const res = loadout.equipWeapon(stack.item, slot);
    if (!res.ok) { eventBus.emit(Events.UI_NOTIFY, res.reason); return; }
    inventory.consumeItems(id, 1);
    // Whatever was in that slot goes back in the bag rather than being
    // dropped on the floor.
    if (res.displaced) inventory.addItem(res.displaced, 1);
    audioSystem.playUIClick?.('open');
    this._render();
  }

  _unequip(slot) {
    const was = loadout.unequipWeapon(slot);
    if (was) inventory.addItem(was, 1);
    audioSystem.playUIClick?.('close');
    this._render();
  }

  _hold(id) {
    const stack = inventory.getSlotData().find(s => s && s.item.id === id && s.item.isMemory);
    if (!stack) return;
    const res = loadout.hold(stack.item);
    if (!res.ok) { eventBus.emit(Events.UI_NOTIFY, res.reason); return; }
    inventory.consumeItems(id, 1);
    audioSystem.playUIClick?.('open');
    this._render();
  }

  _drop(id) {
    const was = loadout.drop(id);
    if (was) inventory.addItem(was, 1);
    audioSystem.playUIClick?.('close');
    this._render();
  }

  // ── ENCHANTING ──────────────────────────────────────────
  // Lay new signs over a Memory you already own. Grade does NOT change
  // (that is what cores/ascending are for) — the signs re-weight what
  // it already is, and re-derive its Aspects from the fuller set.

  _inscribeEnchant(rune) {
    if (this.enchantSigns.some(s2 => s2.id === rune.id)) {
      this.enchantGrid?.say('That sign is already laid.', 'mishap');
      return;
    }
    this.enchantSigns.push(rune);
    const read = memoryForge.readSign(rune);
    audioSystem.playUIClick?.('open');
    this.enchantGrid?.clear(
      read
        ? `${read.letter.name} — "${read.letter.means}". ${read.letter.connotation}.`
        : 'Laid.', 'known');
  }

  /** Everything enchantable: equipped weapons, carried, and the bag. */
  _enchantables() {
    const out = [];
    loadout.weapons.forEach((w, i) => { if (w) out.push({ item: w, where: `slot ${i + 1}`, slot: i }); });
    loadout.held.forEach(h => out.push({ item: h, where: 'carried' }));
    for (const st of inventory.getSlotData()) {
      if (st && st.item.isMemory) out.push({ item: st.item, where: 'satchel' });
    }
    return out;
  }

  _applyEnchant() {
    const found = this._enchantables().find(e => e.item.id === this.enchantTarget);
    if (!found) return;
    const res = memoryForge.enchant(found.item, this.enchantSigns);
    if (!res.ok) { eventBus.emit(Events.UI_NOTIFY, res.reason); return; }

    // ⚠️ THE LETTER SURVIVES THE REWORK. Enchanting changes the seed
    // and therefore the id, so without moving the binding across, the
    // key the player put this thing on would silently come back
    // naming an id nobody owns — and the reworked Memory would have
    // no key at all. That reads as "enchanting unbound my weapon",
    // with nothing on screen to explain it. Done BEFORE the equip
    // shuffle below, because `pruneGearBindings()` would otherwise see
    // the old id as unowned and delete the letter first.
    const keptKey = bindSystem.rebindId(
      BIND_KINDS.GEAR, found.item.id, res.memory.id, res.memory.name);

    // ⚠️ Replace it WHEREVER it lives. Enchanting changes the seed and
    // therefore the id, so putting the new one in the bag while the old
    // one stayed equipped would leave the player wielding the version
    // they just paid to replace.
    if (found.slot !== undefined) {
      loadout.unequipWeapon(found.slot);
      inventory.consumeItems(found.item.id, 1);
      loadout.equipWeapon(res.memory, found.slot);
    } else if (found.where === 'carried') {
      loadout.drop(found.item.id);
      inventory.consumeItems(found.item.id, 1);
      loadout.hold(res.memory);
    } else {
      inventory.consumeItems(found.item.id, 1);
      inventory.addItem(res.memory, 1);
    }

    // Never bound in the first place (forged before gear letters
    // existed, or its letter was cleared) — give it one now rather
    // than leaving a reworked thing keyless.
    const letter = keptKey || loadout.autoBindGear(res.memory);
    loadout.pruneGearBindings();

    eventBus.emit(Events.UI_NOTIFY,
      `${res.memory.name} — reworked. ${res.memory.abilities.length} Facets.`
      + (letter ? ` ${keptKey ? 'Still on' : 'Now on'} ${keyLabel(letter)}.` : ''));
    this.enchantSigns = [];
    this.enchantTarget = res.memory.id;
    this.enchantGrid?.clear('Laid and done.');
    this._render();
  }

  _renderEnchant() {
    const list = this._enchantables();
    const tgt = document.getElementById('ench-target');
    if (tgt) {
      tgt.innerHTML = list.length ? list.map(e => `
        <div class="ench-row${this.enchantTarget === e.item.id ? ' picked' : ''}"
             data-ench-target="${e.item.id}" tabindex="0" role="button">
          <span class="er-name">${e.item.name}</span>
          <span class="er-where">${e.where} · ${e.item.grade?.name}</span>
        </div>`).join('')
        : '<div class="forge-empty">No Remnants to enchant yet.</div>';
    }

    const sg = document.getElementById('ench-signs');
    if (sg) {
      sg.innerHTML = this.enchantSigns.length ? this.enchantSigns.map((r, i) => {
        const read = memoryForge.readSign(r);
        if (!read) return '';
        const L = read.letter;
        return `<span class="forge-sign" data-sign-index="${i}" tabindex="0" role="button"
                      title="${L.connotation} — strike it out">
          <span class="fs-prop">${L.name}</span>
          <span class="fs-means">${L.means}</span>
          <span class="fs-temper">${L.cls}</span>
          <span class="fs-attr">+${read.magnitude} ${ATTRIBUTES[read.attribute].short}</span>
        </span>`;
      }).join('') : '<div class="forge-empty">Draw signs below to lay over it.</div>';
    }

    const prev = document.getElementById('ench-preview');
    const btn = document.getElementById('ench-do');
    const found = list.find(e => e.item.id === this.enchantTarget);
    if (!prev) return;
    if (!found) { prev.innerHTML = '<div class="forge-empty">Pick something to enchant.</div>'; btn?.setAttribute('disabled', 'true'); return; }
    if (!this.enchantSigns.length) { prev.innerHTML = '<div class="forge-empty">Draw at least one sign.</div>'; btn?.setAttribute('disabled', 'true'); return; }

    const res = memoryForge.enchant(found.item, this.enchantSigns);
    if (!res.ok) { prev.innerHTML = `<div class="forge-empty">${res.reason}</div>`; btn?.setAttribute('disabled', 'true'); return; }
    btn?.removeAttribute('disabled');
    const m = res.memory;
    prev.innerHTML = `
      <div class="fp-head" style="--grade:${m.tier.color}">
        <div class="fp-name">${m.name}</div>
        <div class="fp-grade">${m.grade.name} · ${m.formName} · was "${found.item.name}"</div>
      </div>
      ${m.abilities.map(a => `
        <div class="fp-aspect">
          <div class="fp-aspect-name">${a.name}${a.active ? ' <span class="fp-act">active</span>' : ''}</div>
          <div class="fp-aspect-line">${a.line}</div>
        </div>`).join('')}
      <div class="fp-attrs">${ATTRIBUTE_IDS.filter(id => m.attributes[id] > 0).map(id => `
        <div class="fp-attr"><span>${ATTRIBUTES[id].name}</span>
          <span class="fp-bar"><i style="width:${Math.min(100, m.attributes[id] * 4)}%"></i></span>
          <strong>${m.attributes[id]}</strong></div>`).join('')}</div>`;
  }

  // ── RENDER ──────────────────────────────────────────────

  _render() {
    // Page switch first — the forge columns and the equip page are
    // mutually exclusive.
    const body = this.panel?.querySelector('.forge-body');
    const eq = document.getElementById('forge-equip-page');
    const onEquip = this.tab === 'equip';
    body?.classList.toggle('hidden', onEquip);
    eq?.classList.toggle('hidden', !onEquip);
    this.panel?.querySelectorAll('.forge-tab').forEach(t =>
      t.classList.toggle('picked', t.dataset.tab === this.tab));
    if (onEquip) { this._renderEquip(); this._renderEnchant(); return; }
    this._renderForge();
  }

  /**
   * The letter that summons a thing, as a clickable chip.
   *
   * ⚠️ Rendered on EVERY row — equipped, carried and still in the bag.
   * The letter is the same key in all three states (it toggles), so
   * hiding it while the thing is out would teach the player that
   * equipping costs them their key.
   *
   * ⚠️ Clicking hands straight to `bindUI._beginCapture()` rather than
   * reimplementing "press a key" here. One capture flow, so the
   * reserved-key refusal and its wording cannot drift between two
   * copies — the same rule the satchel's rebind button already
   * follows.
   *
   * @param {object|string} m a Memory, or its id
   * @param {string} [name] required when an id was passed
   */
  _gearKeyChip(m, name = null) {
    const id = typeof m === 'string' ? m : m?.id;
    const label = typeof m === 'string' ? name : m?.name;
    if (!id) return '';
    const key = bindSystem.keyFor(BIND_KINDS.GEAR, id);
    const safe = String(label || '').replace(/"/g, '&quot;');
    return `<button class="es-key${key ? '' : ' unbound'}"
                    data-gearbind-id="${id}" data-gearbind-name="${safe}"
                    title="${key ? `${keyLabel(key)} calls it in and out. Click to move it.` : 'No letter yet. Click to give it one.'}"
            >${key ? keyLabel(key) : '—'}</button>`;
  }

  _renderEquip() {
    const snap = loadout.snapshot();

    const w = document.getElementById('equip-weapons');
    if (w) {
      w.innerHTML = Array.from({ length: WEAPON_SLOTS }, (_, i) => {
        const m = loadout.weapons[i];
        const inHand = snap.activeSlot === i;
        if (!m) {
          return `<div class="equip-slot empty"><span class="es-n">${i + 1}</span>
                    <span class="es-name">Empty</span></div>`;
        }
        const actives = m.abilities.filter(a => a.active).length;
        return `<div class="equip-slot${inHand ? ' inhand' : ''}" style="--g:${m.tier?.color}">
          <span class="es-n" data-inhand-slot="${i}" title="Put in hand">${i + 1}</span>
          <span class="es-name">${m.name}</span>
          <span class="es-sub">${m.grade?.name} · ${actives} active · ${m.abilities.length - actives} passive</span>
          ${this._gearKeyChip(m)}
          <button class="es-off" data-unequip-slot="${i}">×</button>
        </div>`;
      }).join('');
    }

    const h = document.getElementById('equip-held');
    if (h) {
      h.innerHTML = snap.held.length
        ? snap.held.map(x => `<div class="equip-slot">
            <span class="es-name">${x.name}</span><span class="es-sub">${x.form}</span>
            ${this._gearKeyChip(x.id, x.name)}
            <button class="es-off" data-drop-id="${x.id}">×</button></div>`).join('')
        : '<div class="forge-empty">Nothing carried.</div>';
    }

    const bag = document.getElementById('equip-bag');
    if (bag) {
      const mems = inventory.getSlotData().filter(s => s && s.item.isMemory);
      bag.innerHTML = mems.length ? mems.map(({ item }) => {
        // ⚠️ `budgetFor()`, not `item.equips === 'weapon'`. That check
        // is the reason "I can't equip the echoes" was true: an Echo
        // is `equips: 'bindable'` — the same value Relic uses — so it
        // rendered a bare "carry" button and NO slot buttons at all.
        // Clicking "carry" then hit loadout.hold()'s own refusal
        // (an Echo takes a combat slot, not a carry slot), which is
        // what made it look completely inert from here.
        const isCombat = budgetFor(item) === 'combat';
        const actives = (item.abilities || []).filter(a => a.active).length;
        return `<div class="equip-bagrow" style="--g:${item.tier?.color}">
          <span class="eb-name">${item.name}</span>
          <span class="eb-sub">${item.grade?.name} ${item.formName} · ${actives} active</span>
          ${this._gearKeyChip(item)}
          ${isCombat
            ? Array.from({ length: WEAPON_SLOTS }, (_, i) =>
                `<button class="eb-btn" data-equip-id="${item.id}" data-slot="${i}">slot ${i + 1}</button>`).join('')
            : `<button class="eb-btn" data-hold-id="${item.id}">carry</button>`}
        </div>`;
      }).join('') : '<div class="forge-empty">No Remnants. Forge one on the other page.</div>';
    }

    const bar = document.getElementById('equip-bar');
    if (bar) {
      bar.innerHTML = snap.bar.length ? snap.bar.map(e => `
        <div class="equip-barrow">
          <span class="ebar-key">${e.key}</span>
          <span class="ebar-name">${e.name}</span>
          <span class="ebar-from">${e.from}</span>
          <span class="ebar-cost">${e.cost} essence</span>
        </div>`).join('')
        + (snap.overflow ? `<div class="forge-empty">⚠️ ${snap.overflow} more active Facet${snap.overflow === 1 ? '' : 's'} than the nine keys can hold.</div>` : '')
        : '<div class="forge-empty">Nothing active equipped. Passive Facets never take a key.</div>';
    }
  }

  _renderForge() {
    this._renderForms();
    this._renderCores();
    this._renderTargets();
    this._renderSigns();
    this._renderRules();
    this._renderPreview();
  }

  _renderForms() {
    const el = document.getElementById('forge-forms');
    if (!el) return;
    el.innerHTML = FORM_IDS.map(id => {
      const f = MEMORY_FORMS[id];
      const on = !this.target && this.formId === id;
      return `<div class="forge-form${on ? ' picked' : ''}" data-form="${id}" tabindex="0" role="button"
                   title="${f.blurb}">
        <span class="ff-icon">${f.icon}</span>
        <span class="ff-name">${f.name}</span>
        <span class="ff-lead">${ATTRIBUTES[f.lead].short}</span>
      </div>`;
    }).join('');
  }

  _renderCores() {
    const el = document.getElementById('forge-cores');
    if (!el) return;
    const merged = new Map();
    for (const s of inventory.getSlotData()) {
      if (!s || !isCore(s.item)) continue;
      const e = merged.get(s.item.id);
      if (e) e.count += s.count; else merged.set(s.item.id, { item: s.item, count: s.count });
    }
    const committed = this.cores.reduce((m, c) => { m[c.id] = (m[c.id] || 0) + 1; return m; }, {});

    const rows = [...merged.values()].map(({ item, count }) => `
      <div class="forge-core" data-core="${item.id}" tabindex="0" role="button">
        <span class="fc-el">${elementGlyph(item.element || 'arcane')}</span>
        <span class="fc-name">${item.name}</span>
        <span class="fc-tier">${item.tier?.name || 'Common'}</span>
        <span class="fc-count">${count}</span>
      </div>`).join('');

    const held = Object.entries(committed).map(([id, n]) => {
      const c = this.cores.find(x => x.id === id);
      return `<div class="forge-core committed" data-core="${id}" tabindex="0" role="button">
        <span class="fc-el">${elementGlyph(c?.element || 'arcane')}</span>
        <span class="fc-name">${c?.name || id}</span>
        <span class="fc-count">×${n}</span>
      </div>`;
    }).join('');

    el.innerHTML = (held ? `<div class="forge-committed">${held}</div>` : '')
      + (rows || '<div class="forge-empty">Nothing to spend. Cores are anything you have gathered.</div>');
  }

  _renderTargets() {
    const el = document.getElementById('forge-targets');
    if (!el) return;
    const mems = inventory.getSlotData().filter(s => s && s.item.isMemory);
    if (!mems.length) {
      el.innerHTML = '<div class="forge-empty">No Remnants yet.</div>';
      return;
    }
    el.innerHTML = mems.map(({ item }) => `
      <div class="forge-target${this.target?.id === item.id ? ' picked' : ''}" data-target="${item.id}" tabindex="0" role="button">
        <span class="ft-name" style="color:${item.tier?.color || 'var(--ink-strong)'}">${item.name}</span>
        <span class="ft-grade">${item.grade?.name} · ${item.abilities?.length || 0} Facet${(item.abilities?.length || 0) === 1 ? '' : 's'}</span>
      </div>`).join('');
  }

  _renderSigns() {
    const el = document.getElementById('forge-signs');
    if (!el) return;
    if (!this.signs.length) {
      el.innerHTML = '<div class="forge-empty">No signs laid. Each one you draw declares a property.</div>';
      return;
    }
    el.innerHTML = this.signs.map((r, i) => {
      const read = memoryForge.readSign(r);
      if (!read) return '';
      // ⚠️ Shows the RUNE the stroke wrote, not the old fixed category.
      // "THE STRAIGHT" / "THE RING" were the shape-buckets the owner
      // asked to be rid of — every emblem is its own rune now, so the
      // chip has to say which one, or the uniqueness is invisible.
      const L = read.letter;
      return `<span class="forge-sign" data-sign-index="${i}" tabindex="0" role="button"
                    title="${L.connotation} — strike it out">
        <span class="fs-prop">${L.name}</span>
        <span class="fs-means">${L.means}</span>
        <span class="fs-temper">${L.cls}</span>
        <span class="fs-attr">+${read.magnitude} ${ATTRIBUTES[read.attribute].short}</span>
      </span>`;
    }).join('');
  }

  /**
   * The rules, on screen, always.
   *
   * ⚠️ This system is only good if the player can AIM. The whole
   * reason the property mapping was rebuilt as a classifier over
   * controllable stroke qualities (see data/memories.js) is so these
   * five sentences are true and actionable — so they are shown rather
   * than left for the player to infer from outcomes.
   */
  /**
   * The lexicon, on screen, always.
   *
   * ⚠️ Runic Sorcery is "the most widely known and easily accessible
   * school" in the source — a player should be able to READ what they
   * are writing without memorising anything. Showing the alphabet is
   * the difference between a language and a slot machine.
   */
  _renderRules() {
    const el = document.getElementById('forge-rules');
    if (!el) return;
    el.innerHTML = grammarGuide().map(r => `
      <div class="forge-rule" data-cls="${r.cls}">
        <span class="fr-attr">${r.name}</span>
        <span class="fr-rule">${r.hint}</span>
      </div>`).join('');
  }

  _renderPreview() {
    const el = document.getElementById('forge-preview');
    const btn = document.getElementById('forge-do');
    if (!el) return;

    const res = this._preview();
    if (!res.ok) {
      el.innerHTML = `<div class="forge-empty">${res.reason}</div>`;
      btn?.setAttribute('disabled', 'true');
      if (btn) btn.textContent = 'Forge';
      return;
    }
    btn?.removeAttribute('disabled');
    if (btn) btn.textContent = this.target ? (this.signs.length ? 'Rework' : 'Ascend') : 'Forge';

    const m = res.memory;
    const insc = m.inscription;
    const inscHTML = insc ? `
      <div class="fp-insc${insc.ok ? '' : ' bad'}${insc.untranslated ? ' unknown' : ''}">
        <div class="fp-insc-phrase">${insc.phrase}</div>
        <div class="fp-insc-read">${insc.reading || insc.reason}</div>
        ${insc.mood ? `<div class="fp-insc-mood">${insc.mood}</div>` : ''}
      </div>` : '';
    const attrRows = ATTRIBUTE_IDS.filter(id => m.attributes[id] > 0).map(id => `
      <div class="fp-attr">
        <span>${ATTRIBUTES[id].name}</span>
        <span class="fp-bar"><i style="width:${Math.min(100, m.attributes[id] * 4)}%"></i></span>
        <strong>${m.attributes[id]}</strong>
      </div>`).join('');

    el.innerHTML = `
      <div class="fp-head" style="--grade:${m.tier.color}">
        <div class="fp-name">${m.name}</div>
        <div class="fp-grade">${m.grade.name} · ${m.formName}${m.weaponType ? ` · ${m.weaponType}` : ''}</div>
      </div>
      ${inscHTML}
      <div class="fp-aspects-head">${m.abilities.length} Facet${m.abilities.length === 1 ? '' : 's'} — grade decides how many</div>
      ${m.abilities.map(a => `
        <div class="fp-aspect">
          <div class="fp-aspect-name">${a.name}</div>
          <div class="fp-aspect-line">${a.line}</div>
          <div class="fp-aspect-src">from ${a.fromSign} · ${a.attributeName}</div>
        </div>`).join('')}
      ${m.flaws.length ? `<div class="fp-flaws-head">Toll${m.flaws.length === 1 ? '' : 's'}</div>` : ''}
      ${m.flaws.map(f => `<div class="fp-flaw"><strong>${f.name}</strong> ${f.line}</div>`).join('')}
      <div class="fp-attrs">${attrRows}</div>
      ${m.type === 'weapon' ? `<div class="fp-power">Power ${m.power}</div>` : ''}
    `;
  }
}

export const memoryForgeUI = new MemoryForgeUI();
