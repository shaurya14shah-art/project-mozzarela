// ══════════════════════════════════════════════════════════
// Crafting System — the Forge
//
// Two jobs:
//   FORGE      recipe → equipment, with batch crafting and
//              craftable-first ordering so the list is usable
//              once you have 40 recipes rather than 11.
//   TRANSMUTE  any item → essence dust of its element.
//
// Transmutation is the important half. It means no drop is ever
// dead weight: a stack of Rusty Scrap you'll never forge with
// becomes dust you can steer a brew with.
// ══════════════════════════════════════════════════════════

import { inventory } from './InventorySystem.js';
import { FORGE_RECIPES } from '../data/materials.js';
import { getItem, registerItem } from '../data/itemRegistry.js';
import { dustIdFor, PRISM_DUST } from '../data/dusts.js';
import { ELEMENTS } from '../data/constants.js';
import { eventBus, Events } from '../core/EventBus.js';

class CraftingSystem {
  constructor() {
    this.recipes = FORGE_RECIPES;
  }

  // ── RECIPE QUERIES ───────────────────────────────────────

  getAllRecipes() { return this.recipes; }

  getRecipe(id) { return this.recipes.find(r => r.id === id) || null; }

  getCategories() {
    return [...new Set(this.recipes.map(r => r.category))];
  }

  /**
   * Recipes for the list panel: filtered, and ordered so anything
   * you can actually make right now floats to the top.
   */
  getBrowsableRecipes({ search = '', craftableOnly = false, category = null } = {}) {
    const q = search.trim().toLowerCase();
    return this.recipes
      .filter(r => !category || r.category === category)
      .filter(r => !q || r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q))
      .map(r => ({ recipe: r, craftable: this.canCraft(r.id), max: this.maxCraftable(r.id) }))
      .filter(entry => !craftableOnly || entry.craftable)
      .sort((a, b) => {
        if (a.craftable !== b.craftable) return a.craftable ? -1 : 1;
        return a.recipe.name.localeCompare(b.recipe.name);
      });
  }

  canCraft(recipeId, qty = 1) {
    const recipe = this.getRecipe(recipeId);
    if (!recipe) return false;
    return recipe.ingredients.every(({ id, count }) => inventory.hasItem(id, count * qty));
  }

  /** How many of this recipe the current inventory supports. */
  maxCraftable(recipeId) {
    const recipe = this.getRecipe(recipeId);
    if (!recipe) return 0;
    let max = Infinity;
    for (const { id, count } of recipe.ingredients) {
      max = Math.min(max, Math.floor(this._countOf(id) / count));
    }
    return Number.isFinite(max) ? max : 0;
  }

  getIngredientStatus(recipeId, qty = 1) {
    const recipe = this.getRecipe(recipeId);
    if (!recipe) return [];
    return recipe.ingredients.map(({ id, count }) => {
      const need = count * qty;
      const have = this._countOf(id);
      const def = getItem(id);
      return {
        id, required: need, have, met: have >= need,
        name: def?.name || id.replace(/_/g, ' '),
        icon: def?.icon || '',
      };
    });
  }

  _countOf(itemId) {
    return inventory.getSlotData()
      .filter(s => s && s.item.id === itemId)
      .reduce((sum, s) => sum + s.count, 0);
  }

  // ── FORGING ──────────────────────────────────────────────

  /**
   * Craft `qty` of a recipe in one action.
   * Returns the number actually produced.
   */
  forge(recipeId, qty = 1) {
    const recipe = this.getRecipe(recipeId);
    if (!recipe) {
      eventBus.emit(Events.UI_NOTIFY, 'Unknown recipe.');
      return 0;
    }

    // ⚠️ `Math.min(NaN, n)` is NaN, and `NaN < 1` is FALSE — so a NaN
    // quantity walked through the guard below and into the consume /
    // produce pair with NaN counts. Sanitise before comparing.
    const want = Math.floor(Number(qty));
    const possible = Number.isFinite(want) ? Math.min(want, this.maxCraftable(recipeId)) : 0;
    if (!Number.isFinite(possible) || possible < 1) {
      const missing = this.getIngredientStatus(recipeId, 1)
        .filter(s => !s.met)
        .map(s => `${s.name} ${s.have}/${s.required}`)
        .join(', ');
      eventBus.emit(Events.UI_NOTIFY, `Missing: ${missing}`);
      return 0;
    }

    // ⚠️ WORLD EXPANSION: smelting needs a smelter, cooking and tanning a
    // fire (systems/GatherSystem.js). Said plainly, with where to find one.
    if (recipe.station && this.stationOk && !this.stationOk(recipe.station)) {
      eventBus.emit(Events.UI_NOTIFY, recipe.station === 'smelter'
        ? 'This needs a smelter close by — the Sanctuary has one, or build a Bloomery (Forge → stations).'
        : 'This needs a fire close by — light a Campfire (Forge → stations), or use the Sanctuary\'s.');
      return 0;
    }
    const outputDef = getItem(recipe.outputId);
    if (!outputDef) {
      eventBus.emit(Events.UI_NOTIFY, `Recipe output "${recipe.outputId}" is not a known item.`);
      return 0;
    }

    // ⚠️ Take payment FIRST and abort if any part of it fails, rather
    // than consuming what we can and producing regardless. A partial
    // consume followed by a full payout is the same duplication shape
    // transmute() had.
    for (const { id, count } of recipe.ingredients) {
      if (!inventory.consumeItems(id, count * possible)) {
        eventBus.emit(Events.UI_NOTIFY, 'The forge would not take it.');
        return 0;
      }
    }

    const produced = (recipe.outputCount || 1) * possible;
    inventory.addItem(outputDef, produced);

    eventBus.emit(Events.UI_NOTIFY, `Forged ${produced}× ${outputDef.name}`);
    eventBus.emit(Events.ITEM_CRAFT, { item: outputDef, recipe, count: produced });
    return possible;
  }

  // ── TRANSMUTATION ────────────────────────────────────────

  /**
   * What breaking an item down yields, without doing it.
   * Returns { dust, count } or null if the item can't be broken.
   */
  previewTransmute(item) {
    if (!item) return null;
    if (item.isSpell) return null;          // potions aren't scrap
    if (item.isDust)  return null;          // already dust
    // The wand is the whole game. It is not scrap, and there is no
    // recipe to make another one.
    if (item.isWand)  return null;
    if (item.isLore)  return null;          // a found journal isn't scrap either

    const tierLevel = item.tier?.level || 1;

    // Equipment breaks into Prism Dust — the pure stabiliser.
    // Raw materials break into dust of their own element.
    if (item.type === 'armor' || item.type === 'weapon') {
      return { dust: PRISM_DUST, count: Math.max(1, Math.floor(tierLevel * 1.5)) };
    }

    const element = item.element || ELEMENTS.NEUTRAL;
    const dust = getItem(dustIdFor(element));
    if (!dust) return null;

    return { dust, count: Math.max(1, Math.round(tierLevel * 0.9)) };
  }

  /**
   * Break `qty` of an item down into dust.
   * Returns the dust produced, or null.
   */
  transmute(item, qty = 1) {
    const preview = this.previewTransmute(item);
    if (!preview) {
      eventBus.emit(Events.UI_NOTIFY, 'That cannot be broken down.');
      return null;
    }
    // ⚠️ VALIDATE THE QUANTITY HERE, not just downstream.
    // `hasItem(id, -5)` is TRUE — it compares `internalCount >= count`
    // and every count is >= a negative — so a negative quantity sailed
    // straight past the ownership check below. The quantity arrives
    // from `parseInt(dataset.amount)` in ForgeUI, which is NaN for any
    // malformed attribute.
    const n = Math.floor(Number(qty));
    if (!Number.isFinite(n) || n < 1) return null;

    if (!inventory.hasItem(item.id, n)) {
      eventBus.emit(Events.UI_NOTIFY, `You don't have ${n}× ${item.name}.`);
      return null;
    }

    // ⚠️ CHECK THE RETURN. This used to call consumeItems() and hand
    // out the dust regardless — so any failure to take payment still
    // paid the reward. That is a duplication vector by construction,
    // independent of whether a caller can currently trigger it.
    if (!inventory.consumeItems(item.id, n)) {
      eventBus.emit(Events.UI_NOTIFY, 'That did not come apart.');
      return null;
    }
    const total = preview.count * n;
    inventory.addItem(registerItem(preview.dust), total);

    eventBus.emit(Events.UI_NOTIFY, `${item.name} → ${total}× ${preview.dust.name}`);
    eventBus.emit(Events.ITEM_TRANSMUTE, { source: item, dust: preview.dust, count: total });
    return { dust: preview.dust, count: total };
  }

  /** Everything in the bag that transmutation would accept. */
  getTransmutableStacks() {
    const seen = new Map();
    inventory.getSlotData().forEach((slot) => {
      if (!slot || !slot.item) return;
      const preview = this.previewTransmute(slot.item);
      if (!preview) return;
      const existing = seen.get(slot.item.id);
      if (existing) {
        existing.count += slot.count;
      } else {
        seen.set(slot.item.id, { item: slot.item, count: slot.count, yield: preview });
      }
    });
    return [...seen.values()].sort((a, b) => (b.item.tier?.level || 0) - (a.item.tier?.level || 0));
  }
}

export const crafting = new CraftingSystem();
