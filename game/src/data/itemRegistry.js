// ══════════════════════════════════════════════════════════
// Item Registry — one place that can turn an id into an item def
//
// Item definitions used to live in three disconnected places:
// MATERIALS, inline entries inside DROPS, and brewed potions that
// existed only as objects in the inventory. Anything that needed to
// look an item up by id had to guess (and main.js's _findItemById
// simply returned null for every enemy drop).
//
// Everything registers here now.
// ══════════════════════════════════════════════════════════

import { MATERIALS, DROPS } from './materials.js';
import { ALL_DUSTS } from './dusts.js';

const _items = new Map();

function _register(def) {
  if (!def || !def.id) return;
  if (!_items.has(def.id)) _items.set(def.id, def);
}

// Static materials and equipment
for (const mat of MATERIALS) _register(mat);

// Inline drop definitions (Goblin Tooth, Venom Sac, ...) — these
// only ever existed inside the drop tables.
for (const table of Object.values(DROPS)) {
  for (const entry of table) {
    if (entry.item) continue;           // reference to a MATERIALS id
    const { chance, ...def } = entry;   // strip the roll weight
    _register(def);
  }
}

// Transmutation products
for (const dust of ALL_DUSTS) _register(dust);

// ── PUBLIC API ────────────────────────────────────────────

/** Look up any item definition by id. Returns null if unknown. */
export function getItem(id) {
  return _items.get(id) || null;
}

export function hasItem(id) {
  return _items.has(id);
}

/**
 * Register a runtime-generated item (a brewed potion, for instance)
 * so it can be resolved by id later.
 */
export function registerItem(def) {
  if (!def || !def.id) return def;
  _items.set(def.id, def);
  return def;
}

export function getAllItems() {
  return [..._items.values()];
}

/** Every item that can go into a cauldron. */
export function getIngredients() {
  return getAllItems().filter(i => i.isIngredient);
}

export function getIcon(id) {
  return _items.get(id)?.icon || '?';
}

export function getName(id) {
  return _items.get(id)?.name || id.replace(/_/g, ' ');
}

// ── STEEL: ritual items (data/steel.js RITUALS) — oils, wards, draughts,
// used from the satchel and prepared before a fight (CombatSystem).
import { RITUALS } from './steel.js';
const RITUAL_ICON = { oil: '🜄', ward: '✶', draught: '⚱' };
for (const [id, r] of Object.entries(RITUALS)) {
  _register({ id, name: r.name, type: 'ritual', ritual: id, icon: RITUAL_ICON[r.kind] || '•', description: r.text, rarity: 'common', value: 12 });
}
