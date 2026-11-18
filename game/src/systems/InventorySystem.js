// ══════════════════════════════════════════════════════════
// Inventory System
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';

export class InventorySystem {
  constructor(capacity = 30) {
    this.capacity = capacity;
    this.slots = new Array(capacity).fill(null); // { item: {}, count: number }
    this.gold = 0;

    // Listen to pickup events
    eventBus.on(Events.ITEM_PICKUP, this._onItemPickup.bind(this));
  }

  // --- Core API ---

  /**
   * ⚠️ EVERY public method on this class validates its count, because
   * this is the economy and an unvalidated count is a duplication bug
   * waiting to be found. Demonstrated before this guard existed:
   *   addItem(item, -5)   → REMOVED five from the stack
   *   addItem(item, NaN)  → poisoned the stack to NaN permanently,
   *                         and NaN >= n is false forever, so every
   *                         later hasItem() check on it failed silently
   * Neither needed a console: any code path that computes a count from
   * a subtraction can produce both.
   */
  _validCount(count) {
    const n = Math.floor(Number(count));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  addItem(itemDef, count = 1) {
    if (!itemDef || !itemDef.id) return false;
    const n = this._validCount(count);
    if (!n) return false;

    // 1. Try to stack with existing items
    for (let i = 0; i < this.capacity; i++) {
      if (this.slots[i] && this.slots[i].item.id === itemDef.id) {
        // ⚠️ REPLACE the stored item, do not just bump the count.
        // Stacking keyed only on `id` kept whichever object arrived
        // FIRST — and MemoryForge.ascend() deliberately preserves a
        // Memory's id, so ascending a Memory you held two of silently
        // threw the upgrade away and kept the old one while the cores
        // were spent. Demonstrated: Rare(2 Aspects) ascended to Epic,
        // inventory still held Rare.
        // The newest definition wins, which is what every caller that
        // re-adds an item under an existing id actually means.
        this.slots[i].item = itemDef;
        this.slots[i].count += n;
        eventBus.emit(Events.UI_TOGGLE_INVENTORY, this.slots);
        return true;
      }
    }

    // 2. Find empty slot
    for (let i = 0; i < this.capacity; i++) {
      if (!this.slots[i]) {
        this.slots[i] = { item: itemDef, count: n };
        eventBus.emit(Events.UI_TOGGLE_INVENTORY, this.slots); // Notify UI update
        return true;
      }
    }

    // Inventory full
    eventBus.emit(Events.UI_NOTIFY, "Inventory Full!");
    return false;
  }

  /**
   * ⚠️ Returns false when it could not remove the full amount, rather
   * than removing what it can and reporting success. A caller that
   * asked for 5 and got 3 while being told "true" will happily hand
   * out the reward for 5.
   */
  removeItem(slotIndex, count = 1) {
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= this.capacity) return false;
    const n = this._validCount(count);
    if (!n) return false;
    const slot = this.slots[slotIndex];
    if (!slot) return false;
    if (slot.count < n) return false;
    if (slot.count > n) slot.count -= n;
    else this.slots[slotIndex] = null;
    eventBus.emit(Events.UI_TOGGLE_INVENTORY, this.slots);
    return true;
  }

  // Used for crafting consumption
  consumeItems(itemId, count) {
    // ⚠️ A negative or NaN count would sail past hasItem() (which
    // compares `>=`) and then never enter the consumption loop, so the
    // caller is told the payment succeeded and nothing was taken.
    const n = this._validCount(count);
    if (!n || !itemId) return false;
    let remaining = n;

    // First pass: validation
    if (!this.hasItem(itemId, n)) return false;

    // Second pass: actual consumption
    for (let i = 0; i < this.capacity && remaining > 0; i++) {
      const slot = this.slots[i];
      if (slot && slot.item.id === itemId) {
        if (slot.count > remaining) {
          slot.count -= remaining;
          remaining = 0;
        } else {
          remaining -= slot.count;
          this.slots[i] = null;
        }
      }
    }
    
    eventBus.emit(Events.UI_TOGGLE_INVENTORY, this.slots);
    return true;
  }

  hasItem(itemId, count = 1) {
    let internalCount = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.slots[i] && this.slots[i].item.id === itemId) {
        internalCount += this.slots[i].count;
      }
    }
    return internalCount >= count;
  }

  moveItem(fromSlot, toSlot) {
    // ⚠️ BOUNDS. Without this, `moveItem(999, 3)` assigned
    // `this.slots[999]`, which grew the backing array to length 1000
    // — and every loop in this file iterates `i < this.capacity`, so
    // the item at 999 was permanently invisible AND the slot-3 item
    // was overwritten with `undefined`. Demonstrated: array length
    // went 30 → 1000 and three items vanished.
    const inRange = (i) => Number.isInteger(i) && i >= 0 && i < this.capacity;
    if (!inRange(fromSlot) || !inRange(toSlot)) return false;
    if (fromSlot === toSlot) return false;

    const source = this.slots[fromSlot];
    const target = this.slots[toSlot];

    // If target exists and same item, stack them
    if (source && target && source.item.id === target.item.id) {
      target.count += source.count;
      this.slots[fromSlot] = null;
    } else {
      // Swap slots
      this.slots[fromSlot] = target;
      this.slots[toSlot] = source;
    }

    eventBus.emit(Events.UI_TOGGLE_INVENTORY, this.slots);
    return true;
  }

  // --- Handlers ---

  _onItemPickup(data) {
    this.addItem(data.item, data.count);
  }

  // Return formatted array for UI rendering
  getSlotData() {
    return this.slots;
  }
}

export const inventory = new InventorySystem();
