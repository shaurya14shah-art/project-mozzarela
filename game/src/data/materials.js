// ══════════════════════════════════════════════════════════
// Materials, Potions & Forge Recipes
// ══════════════════════════════════════════════════════════

import { MATERIAL_TIERS, ELEMENTS } from './constants.js';
import { GEN_RECIPES, GEN_ITEMS, NEW_MATERIALS, NEW_CREATURES } from './expansion.js';

// ── RAW MATERIALS ─────────────────────────────────────────
export const MATERIALS = [
  // Common
  { id: 'iron_ore',      name: 'Iron Ore',          tier: MATERIAL_TIERS.COMMON,    icon: '🪨', type: 'resource' },
  { id: 'oak_wood',      name: 'Oak Wood',           tier: MATERIAL_TIERS.COMMON,    icon: '🪵', type: 'resource' },
  { id: 'leather',       name: 'Scrap Leather',      tier: MATERIAL_TIERS.COMMON,    icon: '🧵', type: 'resource' },
  { id: 'slime_glue',    name: 'Slime Glue',         tier: MATERIAL_TIERS.COMMON,    icon: '🟢', type: 'resource', element: ELEMENTS.POISON, isIngredient: true },
  { id: 'rusty_scrap',   name: 'Rusty Scrap',        tier: MATERIAL_TIERS.COMMON,    icon: '⛓️', type: 'resource' },
  { id: 'sandstone',     name: 'Sandstone Chunk',    tier: MATERIAL_TIERS.COMMON,    icon: '🏺', type: 'resource', element: ELEMENTS.EARTH, isIngredient: true },

  // Uncommon
  { id: 'steel_ingot',   name: 'Steel Ingot',        tier: MATERIAL_TIERS.UNCOMMON,  icon: '🧱', type: 'refined' },
  { id: 'ash_wood',      name: 'Ash Wood',            tier: MATERIAL_TIERS.UNCOMMON,  icon: '🌲', type: 'resource', element: ELEMENTS.FIRE },
  { id: 'dragonhide',    name: 'Dragonhide Scraps',  tier: MATERIAL_TIERS.UNCOMMON,  icon: '🐉', type: 'resource', element: ELEMENTS.FIRE },
  { id: 'ashen_bone',    name: 'Ashen Bone',          tier: MATERIAL_TIERS.UNCOMMON,  icon: '🦴', type: 'resource', element: ELEMENTS.FIRE, isIngredient: true },
  { id: 'void_essence',  name: 'Void Essence',        tier: MATERIAL_TIERS.UNCOMMON,  icon: '🫧', type: 'resource', element: ELEMENTS.VOID, isIngredient: true },
  { id: 'charged_quartz','name': 'Charged Quartz',    tier: MATERIAL_TIERS.UNCOMMON,  icon: '⚡', type: 'resource', element: ELEMENTS.LIGHTNING, isIngredient: true },
  { id: 'ice_crystal',   name: 'Ice Crystal',         tier: MATERIAL_TIERS.UNCOMMON,  icon: '❄️', type: 'resource', element: ELEMENTS.ICE, isIngredient: true },
  { id: 'spider_silk',   name: 'Spider Silk',         tier: MATERIAL_TIERS.UNCOMMON,  icon: '🕸️', type: 'resource', element: ELEMENTS.POISON, isIngredient: true },

  // Rare
  { id: 'mithril_ore',   name: 'Mithril Ore',        tier: MATERIAL_TIERS.RARE,      icon: '💠', type: 'resource', element: ELEMENTS.ARCANE },
  { id: 'spiritwood',    name: 'Spiritwood',          tier: MATERIAL_TIERS.RARE,      icon: '🌳', type: 'resource', element: ELEMENTS.LIGHT, isIngredient: true },
  { id: 'wyrmscale',     name: 'Wyrmscale',           tier: MATERIAL_TIERS.RARE,      icon: '🦎', type: 'resource', element: ELEMENTS.FIRE },
  { id: 'obsidian_heart','name': 'Obsidian Heart',    tier: MATERIAL_TIERS.RARE,      icon: '🖤', type: 'resource', element: ELEMENTS.FIRE, isIngredient: true },
  { id: 'glow_spore',    name: 'Glow-cap Spore',      tier: MATERIAL_TIERS.RARE,      icon: '🍄', type: 'resource', element: ELEMENTS.LIGHT, isIngredient: true },
  { id: 'blight_ember',  name: 'Blightfire Ember',   tier: MATERIAL_TIERS.RARE,      icon: '🔥', type: 'resource', element: ELEMENTS.FIRE, isIngredient: true },

  // Epic
  { id: 'starmetal',     name: 'Starmetal',           tier: MATERIAL_TIERS.EPIC,      icon: '⭐', type: 'resource', element: ELEMENTS.VOID },
  { id: 'eldertree',     name: 'Eldertree Branch',   tier: MATERIAL_TIERS.EPIC,      icon: '🍁', type: 'resource', element: ELEMENTS.EARTH },
  { id: 'abyssal_silk',  name: 'Abyssal Silk',        tier: MATERIAL_TIERS.EPIC,      icon: '🕸️', type: 'resource', element: ELEMENTS.SHADOW },
  { id: 'mana_crystal',  name: 'Crystallized Mana',  tier: MATERIAL_TIERS.EPIC,      icon: '🔮', type: 'resource', element: ELEMENTS.ARCANE, isIngredient: true },
  { id: 'rift_shard',    name: 'Rift Shard',          tier: MATERIAL_TIERS.EPIC,      icon: '✴️', type: 'resource', element: ELEMENTS.VOID, isIngredient: true },
  { id: 'ethereal_plume','name': 'Ethereal Plume',    tier: MATERIAL_TIERS.EPIC,      icon: '🪶', type: 'resource', element: ELEMENTS.WIND, isIngredient: true },

  // Legendary
  { id: 'orichalcum',    name: 'Orichalcum',          tier: MATERIAL_TIERS.LEGENDARY, icon: '🔶', type: 'resource', element: ELEMENTS.ARCANE },
  { id: 'yggdrasil_bark','name': 'Yggdrasil Bark',    tier: MATERIAL_TIERS.LEGENDARY, icon: '🍃', type: 'resource', element: ELEMENTS.LIGHT, isIngredient: true },
  { id: 'phoenix_down',  name: 'Phoenix Down',        tier: MATERIAL_TIERS.LEGENDARY, icon: '🪶', type: 'resource', element: ELEMENTS.FIRE, isIngredient: true },
  { id: 'star_metal',    name: 'Star-forged Metal',   tier: MATERIAL_TIERS.LEGENDARY, icon: '✨', type: 'refined' },

  // Mythic
  { id: 'primordium',    name: 'Primordium Crystal',  tier: MATERIAL_TIERS.MYTHIC,    icon: '💎', type: 'resource', element: ELEMENTS.NEUTRAL, isIngredient: true },
  { id: 'cosmobark',     name: 'Cosmobark',            tier: MATERIAL_TIERS.MYTHIC,    icon: '🌌', type: 'resource', element: ELEMENTS.VOID, isIngredient: true },
  { id: 'godweave',      name: 'Godweave Cloth',       tier: MATERIAL_TIERS.MYTHIC,    icon: '✨', type: 'resource', element: ELEMENTS.LIGHT },

  // Armor Base
  { id: 'leather_helmet',name: 'Leather Helmet',      tier: MATERIAL_TIERS.COMMON,    icon: '🪖', type: 'armor', slot: 'head',  defense: 3 },
  { id: 'leather_chest', name: 'Leather Chest',        tier: MATERIAL_TIERS.COMMON,    icon: '👕', type: 'armor', slot: 'chest', defense: 6 },
  { id: 'leather_legs',  name: 'Leather Legs',         tier: MATERIAL_TIERS.COMMON,    icon: '👖', type: 'armor', slot: 'legs',  defense: 4 },
  { id: 'iron_helmet',   name: 'Iron Helmet',          tier: MATERIAL_TIERS.UNCOMMON,  icon: '🪖', type: 'armor', slot: 'head',  defense: 8 },
  { id: 'iron_chest',    name: 'Iron Chestplate',      tier: MATERIAL_TIERS.UNCOMMON,  icon: '👕', type: 'armor', slot: 'chest', defense: 14 },
  { id: 'iron_legs',     name: 'Iron Leggings',        tier: MATERIAL_TIERS.UNCOMMON,  icon: '👖', type: 'armor', slot: 'legs',  defense: 10 },
  { id: 'mithril_helm',  name: 'Mithril Helm',         tier: MATERIAL_TIERS.RARE,      icon: '🪖', type: 'armor', slot: 'head',  defense: 14 },
  { id: 'mithril_chest', name: 'Mithril Breastplate',  tier: MATERIAL_TIERS.RARE,      icon: '👕', type: 'armor', slot: 'chest', defense: 22 },
  { id: 'void_robe',     name: 'Voidweave Robe',       tier: MATERIAL_TIERS.EPIC,      icon: '🌑', type: 'armor', slot: 'chest', defense: 12, bonus: { mp: 20 } },
  { id: 'fracture_wand', name: 'Fracture Wand',        tier: MATERIAL_TIERS.UNCOMMON,  icon: '🪄', type: 'weapon', isWand: true, power: 18 },

  // Weapon Base — forged melee arms. The Fracture Wand is the caster;
  // these are what actually connects when you swing.
  { id: 'rusty_dagger',     name: 'Rusty Dagger',       tier: MATERIAL_TIERS.COMMON,    icon: '🗡️', type: 'weapon', weaponType: 'dagger',     power: 9  },
  { id: 'iron_sword',       name: 'Iron Sword',          tier: MATERIAL_TIERS.UNCOMMON,  icon: '⚔️', type: 'weapon', weaponType: 'sword',      power: 16 },
  { id: 'iron_war_axe',     name: 'Iron War-Axe',        tier: MATERIAL_TIERS.UNCOMMON,  icon: '🪓', type: 'weapon', weaponType: 'axe',        power: 19 },
  { id: 'ashwood_spear',    name: 'Ashwood Spear',       tier: MATERIAL_TIERS.UNCOMMON,  icon: '🔱', type: 'weapon', weaponType: 'spear',      power: 15, element: ELEMENTS.FIRE },
  { id: 'mithril_blade',    name: 'Mithril Blade',       tier: MATERIAL_TIERS.RARE,      icon: '⚔️', type: 'weapon', weaponType: 'sword',      power: 27 },
  { id: 'venomfang_dagger', name: 'Venomfang Dagger',    tier: MATERIAL_TIERS.RARE,      icon: '🗡️', type: 'weapon', weaponType: 'dagger',     power: 24, element: ELEMENTS.POISON },
  { id: 'voidrend_blade',   name: 'Voidrend Blade',      tier: MATERIAL_TIERS.EPIC,      icon: '⚔️', type: 'weapon', weaponType: 'greatsword', power: 38, element: ELEMENTS.VOID },

  // ── ADDED ARMS ────────────────────────────────────────
  // The forge could already BUILD a bow, staff, grimoire, paired
  // blades, warhammer and scythe (see EntityForge's WEAPON_PLANS), but
  // nothing in the registry ever handed one to a player, so six of the
  // eleven silhouettes in the game were unreachable except through a
  // random ItemGenerator roll.
  // ⚠️ `weaponType` must be one of WEAPON_PLANS' keys, lowercase and
  // letters only — it is normalised through weaponPlanKey(), and an
  // unknown key silently forges a SWORD rather than erroring.
  { id: 'yew_longbow',      name: 'Yew Longbow',         tier: MATERIAL_TIERS.COMMON,    icon: '🏹', type: 'weapon', weaponType: 'bow',        power: 12 },
  { id: 'hollow_stave',     name: 'Hollow Stave',        tier: MATERIAL_TIERS.UNCOMMON,  icon: '🪄', type: 'weapon', weaponType: 'staff',      power: 14, element: ELEMENTS.ARCANE },
  { id: 'ribbed_maul',      name: 'Ribbed Maul',         tier: MATERIAL_TIERS.UNCOMMON,  icon: '🔨', type: 'weapon', weaponType: 'warhammer',  power: 22 },
  { id: 'paired_fangs',     name: 'Paired Fangs',        tier: MATERIAL_TIERS.RARE,      icon: '⚔️', type: 'weapon', weaponType: 'dualblades', power: 26 },
  { id: 'binding_grimoire', name: 'The Binding Grimoire',tier: MATERIAL_TIERS.RARE,      icon: '📖', type: 'weapon', weaponType: 'grimoire',   power: 21, element: ELEMENTS.SHADOW },
  { id: 'harvest_scythe',   name: 'The Harvest',         tier: MATERIAL_TIERS.EPIC,      icon: '🌾', type: 'weapon', weaponType: 'scythe',     power: 35, element: ELEMENTS.VOID },
  { id: 'iron_greatsword',  name: 'Iron Greatsword',     tier: MATERIAL_TIERS.UNCOMMON,  icon: '⚔️', type: 'weapon', weaponType: 'greatsword', power: 24 },

  // ── ELEMENT FRAGMENTS ─────────────────────────────────
  // The one crafting input that CANNOT be foraged, farmed, bought, or
  // dropped by a wandering enemy. Fragments come out of Descents and
  // nowhere else (see data/descents.js), which is what turns "go into
  // an element dungeon" from optional content into the supply line for
  // every element-locked recipe in the game.
  //
  // Deliberately NOT `isIngredient: true`. Ingredients go in the
  // cauldron and brew into potions; fragments do not — potions are
  // mundane again (see PotionSystem's rework note) and fragments are
  // for attuning gear, opening Remnants and paying Ascent costs. A
  // fragment in the brewing pool would quietly make Descents the
  // healing-potion supply line, which is the opposite of the intent.
  { id: 'fragment_fire',      name: 'Fragment of Fire',      tier: MATERIAL_TIERS.RARE, icon: '🔥', type: 'fragment', element: ELEMENTS.FIRE,      isFragment: true, description: 'It has not gone out. It is not going to.' },
  { id: 'fragment_water',     name: 'Fragment of Water',     tier: MATERIAL_TIERS.RARE, icon: '💧', type: 'fragment', element: ELEMENTS.WATER,     isFragment: true, description: 'Wet in a way that does not transfer to your hand.' },
  { id: 'fragment_earth',     name: 'Fragment of Earth',     tier: MATERIAL_TIERS.RARE, icon: '🪨', type: 'fragment', element: ELEMENTS.EARTH,     isFragment: true, description: 'Heavier than the arm holding it should allow.' },
  { id: 'fragment_wind',      name: 'Fragment of Wind',      tier: MATERIAL_TIERS.RARE, icon: '🌬️', type: 'fragment', element: ELEMENTS.WIND,      isFragment: true, description: 'You keep checking whether you are still holding it.' },
  { id: 'fragment_ice',       name: 'Fragment of Ice',       tier: MATERIAL_TIERS.RARE, icon: '❄️', type: 'fragment', element: ELEMENTS.ICE,       isFragment: true, description: 'It is not melting, and the room is not cold.' },
  { id: 'fragment_lightning', name: 'Fragment of Lightning', tier: MATERIAL_TIERS.RARE, icon: '⚡', type: 'fragment', element: ELEMENTS.LIGHTNING, isFragment: true, description: 'Your teeth ache when it is in the satchel.' },
  { id: 'fragment_shadow',    name: 'Fragment of Shadow',    tier: MATERIAL_TIERS.RARE, icon: '🌑', type: 'fragment', element: ELEMENTS.SHADOW,    isFragment: true, description: 'It casts one. Nothing else in the satchel does.' },
  { id: 'fragment_light',     name: 'Fragment of Light',     tier: MATERIAL_TIERS.RARE, icon: '✨', type: 'fragment', element: ELEMENTS.LIGHT,     isFragment: true, description: 'You have stopped taking it out after dark.' },
  { id: 'fragment_void',      name: 'Fragment of Void',      tier: MATERIAL_TIERS.RARE, icon: '🕳️', type: 'fragment', element: ELEMENTS.VOID,      isFragment: true, description: 'The satchel is lighter with it in than without.' },
  { id: 'fragment_arcane',    name: 'Fragment of Arcane',    tier: MATERIAL_TIERS.RARE, icon: '🔮', type: 'fragment', element: ELEMENTS.ARCANE,    isFragment: true, description: 'Someone was most of the way through solving it.' },
  { id: 'fragment_poison',    name: 'Fragment of Poison',    tier: MATERIAL_TIERS.RARE, icon: '🧪', type: 'fragment', element: ELEMENTS.POISON,    isFragment: true, description: 'Do not put it down anywhere you intend to return to.' },
];

// ── ENEMY DROPS ─────────────────────────────────────────
export const DROPS = {
  'slime': [
    { id: 'slime_gel',   name: 'Slime Gel',      tier: MATERIAL_TIERS.COMMON,   icon: '💧', chance: 0.9, element: ELEMENTS.POISON, isIngredient: true },
    { item: 'slime_glue', chance: 0.5 },
  ],
  'goblin': [
    { item: 'leather', chance: 0.6 },
    { item: 'iron_ore', chance: 0.55 },
    // Was never dropped by anything, anywhere — recipe_rusty_dagger
    // (the cheapest weapon in the game, meant to be the very first
    // thing a new Pioneer forges) asked for an ingredient with no
    // source at all. Goblins carry scavenged junk; makes sense they'd
    // have it.
    { item: 'rusty_scrap', chance: 0.7 },
    { id: 'goblin_tooth', name: 'Goblin Tooth',  tier: MATERIAL_TIERS.COMMON,   icon: '🦷', chance: 0.3, isIngredient: true },
  ],
  'skeleton': [
    { id: 'bone_fragment', name: 'Bone Fragment', tier: MATERIAL_TIERS.COMMON,   icon: '🦴', chance: 0.8, isIngredient: true },
    { item: 'ashen_bone', chance: 0.3 },
  ],
  'golem': [
    { item: 'iron_ore', chance: 1.0 },
    { item: 'mithril_ore', chance: 0.25 },
    { id: 'golem_core', name: 'Golem Core',       tier: MATERIAL_TIERS.RARE,     icon: '🔮', chance: 0.12, isIngredient: true, element: ELEMENTS.EARTH },
    // The main-quest macguffin. Golems are the Fracture's earth the
    // world tries to grow over its own wound — of everything down
    // here, they're what's most likely to be sitting on a piece of it.
    { id: 'mithril_core_fragment', name: 'Mithril Core Fragment', tier: MATERIAL_TIERS.RARE, icon: '🔷', chance: 0.55, isIngredient: false, element: ELEMENTS.EARTH },
  ],
  'bone_acolyte': [
    { item: 'ashen_bone', chance: 0.6 },
    { item: 'void_essence', chance: 0.35 },
    { id: 'bone_fragment', name: 'Bone Fragment', tier: MATERIAL_TIERS.COMMON, icon: '🦴', chance: 0.7, isIngredient: true },
    { id: 'grave_wax', name: 'Grave Wax', tier: MATERIAL_TIERS.UNCOMMON, icon: '🕯️', chance: 0.4, isIngredient: true, element: ELEMENTS.SHADOW },
  ],
  'grave_stalker': [
    { id: 'bone_fragment', name: 'Bone Fragment', tier: MATERIAL_TIERS.COMMON, icon: '🦴', chance: 0.75, isIngredient: true },
    { item: 'leather', chance: 0.5 },
    { item: 'shade_dust', chance: 0.3 },
    { id: 'sinew_cord', name: 'Dry Sinew', tier: MATERIAL_TIERS.UNCOMMON, icon: '🧵', chance: 0.45, isIngredient: true, element: ELEMENTS.SHADOW },
  ],
  'wraith': [
    { item: 'void_essence', chance: 0.7 },
    { item: 'abyssal_silk', chance: 0.15 },
    { item: 'rift_shard', chance: 0.05 },
    { id: 'wraith_tear', name: 'Wraith Tear',     tier: MATERIAL_TIERS.UNCOMMON, icon: '😢', chance: 0.4, isIngredient: true, element: ELEMENTS.SHADOW },
  ],
  'spider': [
    { item: 'spider_silk', chance: 0.8 },
    { id: 'venom_sac',   name: 'Venom Sac',       tier: MATERIAL_TIERS.UNCOMMON, icon: '🫗', chance: 0.5, isIngredient: true, element: ELEMENTS.POISON },
  ],
  'vampire': [
    { item: 'void_essence', chance: 0.5 },
    { id: 'vampire_fang', name: 'Vampire Fang',   tier: MATERIAL_TIERS.RARE,     icon: '🧛', chance: 0.35, isIngredient: true, element: ELEMENTS.SHADOW },
    { id: 'crimson_vial', name: 'Crimson Vial',   tier: MATERIAL_TIERS.UNCOMMON, icon: '🩸', chance: 0.6, isIngredient: true, element: ELEMENTS.SHADOW },
  ],
  'dragon': [
    { item: 'dragonhide', chance: 1.0 },
    { item: 'blight_ember', chance: 0.6 },
    // Same unobtainable-ingredient bug as rusty_scrap, further up the
    // tier list: recipe_voidrend_blade asked for starmetal and nothing
    // in the game ever dropped it. Dragons are the one enemy actually
    // worth the name.
    { item: 'starmetal', chance: 0.3 },
    { id: 'dragon_heart', name: 'Dragon Heart',   tier: MATERIAL_TIERS.LEGENDARY, icon: '❤️‍🔥', chance: 0.45, isIngredient: true, element: ELEMENTS.FIRE },
    { id: 'dragon_scale', name: 'Dragon Scale',   tier: MATERIAL_TIERS.RARE,     icon: '🐉', chance: 0.7, isIngredient: true, element: ELEMENTS.FIRE },
  ],
  'ice_elemental': [
    { item: 'ice_crystal', chance: 0.9 },
    { item: 'mana_crystal', chance: 0.25 },
    { id: 'frost_core',  name: 'Frost Core',      tier: MATERIAL_TIERS.RARE,     icon: '🧊', chance: 0.3, isIngredient: true, element: ELEMENTS.ICE },
  ],
  'sandworm': [
    { item: 'sandstone', chance: 0.9 },
    { id: 'worm_tooth',  name: 'Worm Tooth',      tier: MATERIAL_TIERS.RARE,     icon: '🪱', chance: 0.35, isIngredient: true, element: ELEMENTS.EARTH },
    { id: 'worm_gland',  name: 'Acid Gland',      tier: MATERIAL_TIERS.UNCOMMON, icon: '🫀', chance: 0.5, isIngredient: true, element: ELEMENTS.POISON },
  ],
  'shade': [
    { item: 'void_essence', chance: 0.6 },
    { id: 'shade_dust',  name: 'Shade Dust',      tier: MATERIAL_TIERS.UNCOMMON, icon: '🌑', chance: 0.7, isIngredient: true, element: ELEMENTS.SHADOW },
  ],
};

// ── POTIONS ───────────────────────────────────────────────
// Deliberately absent. Potions are no longer a fixed list of
// hand-authored objects — they are resolved at brew time from the
// essence profiles in essences.js and constructed by spellcraft.js.
// See PotionSystem.analyze().

// ── FORGE RECIPES (Equipment Crafting — No Grid Needed) ───
// Simple ingredient list → specific output item.
export const FORGE_RECIPES = [
  {
    id: 'recipe_leather_helmet',
    name: 'Leather Helmet',
    outputId: 'leather_helmet',
    ingredients: [
      { id: 'leather', count: 3 },
    ],
    description: 'Basic head protection.',
    category: 'armor',
  },
  {
    id: 'recipe_leather_chest',
    name: 'Leather Chest',
    outputId: 'leather_chest',
    ingredients: [
      { id: 'leather', count: 5 },
    ],
    description: 'Supple but effective torso guard.',
    category: 'armor',
  },
  {
    id: 'recipe_leather_legs',
    name: 'Leather Legs',
    outputId: 'leather_legs',
    ingredients: [
      { id: 'leather', count: 4 },
    ],
    description: 'Light leg armour.',
    category: 'armor',
  },
  {
    id: 'recipe_iron_helmet',
    name: 'Iron Helmet',
    outputId: 'iron_helmet',
    ingredients: [
      { id: 'iron_ore', count: 4 },
      { id: 'leather', count: 1 },
    ],
    description: 'Heavy forged iron helm.',
    category: 'armor',
  },
  {
    id: 'recipe_iron_chest',
    name: 'Iron Chestplate',
    outputId: 'iron_chest',
    ingredients: [
      { id: 'iron_ore', count: 8 },
      { id: 'leather', count: 2 },
    ],
    description: 'A strong iron breastplate.',
    category: 'armor',
  },
  {
    id: 'recipe_iron_legs',
    name: 'Iron Leggings',
    outputId: 'iron_legs',
    ingredients: [
      { id: 'iron_ore', count: 6 },
      { id: 'leather', count: 2 },
    ],
    description: 'Sturdy iron leg guards.',
    category: 'armor',
  },
  {
    id: 'recipe_steel_ingot',
    name: 'Steel Ingot',
    outputId: 'steel_ingot',
    ingredients: [
      { id: 'iron_ore', count: 3 },
    ],
    description: 'Refined iron ore.',
    category: 'resource',
  },
  {
    id: 'recipe_mithril_helm',
    name: 'Mithril Helm',
    outputId: 'mithril_helm',
    ingredients: [
      { id: 'mithril_ore', count: 4 },
      { id: 'steel_ingot', count: 2 },
    ],
    description: 'Shimmering arcane helm.',
    category: 'armor',
  },
  {
    id: 'recipe_mithril_chest',
    name: 'Mithril Breastplate',
    outputId: 'mithril_chest',
    ingredients: [
      { id: 'mithril_ore', count: 6 },
      { id: 'steel_ingot', count: 3 },
      { id: 'wyrmscale', count: 2 },
    ],
    description: 'Legendary mithril plate.',
    category: 'armor',
  },
  {
    id: 'recipe_void_robe',
    name: 'Voidweave Robe',
    outputId: 'void_robe',
    ingredients: [
      { id: 'abyssal_silk', count: 4 },
      { id: 'rift_shard', count: 2 },
    ],
    description: 'Boosts magic and grants +20 MP.',
    category: 'armor',
  },

  // ── WEAPONS — the Fracture Wand casts; these connect ──────
  {
    id: 'recipe_rusty_dagger',
    name: 'Rusty Dagger',
    outputId: 'rusty_dagger',
    ingredients: [
      { id: 'rusty_scrap', count: 3 },
    ],
    description: 'Crude, but it still holds an edge.',
    category: 'weapon',
  },
  {
    id: 'recipe_iron_sword',
    name: 'Iron Sword',
    outputId: 'iron_sword',
    ingredients: [
      { id: 'iron_ore', count: 5 },
      { id: 'leather', count: 1 },
    ],
    description: 'A dependable forged blade.',
    category: 'weapon',
  },
  {
    id: 'recipe_iron_war_axe',
    name: 'Iron War-Axe',
    outputId: 'iron_war_axe',
    ingredients: [
      { id: 'iron_ore', count: 6 },
      { id: 'oak_wood', count: 2 },
    ],
    description: 'Heavy, single-minded.',
    category: 'weapon',
  },
  {
    id: 'recipe_ashwood_spear',
    name: 'Ashwood Spear',
    outputId: 'ashwood_spear',
    ingredients: [
      { id: 'ash_wood', count: 3 },
      { id: 'dragonhide', count: 1 },
    ],
    description: 'The reach to strike before it does.',
    category: 'weapon',
  },
  {
    id: 'recipe_mithril_blade',
    name: 'Mithril Blade',
    outputId: 'mithril_blade',
    ingredients: [
      { id: 'mithril_ore', count: 5 },
      { id: 'steel_ingot', count: 2 },
    ],
    description: 'Light in the hand, heavy in the wound.',
    category: 'weapon',
  },
  {
    id: 'recipe_venomfang_dagger',
    name: 'Venomfang Dagger',
    outputId: 'venomfang_dagger',
    ingredients: [
      { id: 'spider_silk', count: 3 },
      { id: 'void_essence', count: 1 },
    ],
    description: "Nicks, then finishes what it started.",
    category: 'weapon',
  },
  {
    id: 'recipe_voidrend_blade',
    name: 'Voidrend Blade',
    outputId: 'voidrend_blade',
    ingredients: [
      { id: 'abyssal_silk', count: 4 },
      { id: 'rift_shard', count: 2 },
      { id: 'starmetal', count: 1 },
    ],
    description: "It cuts a little of what isn't there, too.",
    category: 'weapon',
  },
  // ── STEEL: every weapon family can be smithed (owner: "how do I craft
  // them all"). Before this only daggers, swords, axes and the spear had
  // a recipe; the rest existed only as rare drops.
  { id: 'recipe_yew_longbow', name: 'Yew Longbow', outputId: 'yew_longbow',
    ingredients: [{ id: 'oak_wood', count: 4 }, { id: 'spider_silk', count: 1 }],
    description: 'A stave and a string. Stance does not matter at range.', category: 'weapon' },
  { id: 'recipe_hollow_stave', name: 'Hollow Stave', outputId: 'hollow_stave',
    ingredients: [{ id: 'ash_wood', count: 3 }, { id: 'oak_wood', count: 1 }],
    description: 'A quarterstaff. Guards two lines at once.', category: 'weapon' },
  { id: 'recipe_ribbed_maul', name: 'Ribbed Maul', outputId: 'ribbed_maul',
    ingredients: [{ id: 'iron_ore', count: 8 }, { id: 'oak_wood', count: 2 }, { id: 'ashen_bone', count: 1 }],
    description: 'A hammer. Lands through a guard.', category: 'weapon' },
  { id: 'recipe_iron_greatsword', name: 'Iron Greatsword', outputId: 'iron_greatsword',
    ingredients: [{ id: 'iron_ore', count: 9 }, { id: 'steel_ingot', count: 1 }, { id: 'leather', count: 1 }],
    description: 'Two hands, a long reach, everything in the arc.', category: 'weapon' },
  { id: 'recipe_paired_fangs', name: 'Paired Fangs', outputId: 'paired_fangs',
    ingredients: [{ id: 'steel_ingot', count: 3 }, { id: 'leather', count: 2 }],
    description: 'Two short blades. Every swing lands twice.', category: 'weapon' },
  { id: 'recipe_harvest_scythe', name: 'The Harvest', outputId: 'harvest_scythe',
    ingredients: [{ id: 'mithril_ore', count: 4 }, { id: 'ash_wood', count: 2 }, { id: 'eldertree', count: 1 }],
    description: 'A war scythe. Wide arcs; low cuts bleed.', category: 'weapon' },
];

// ── THE WORLD EXPANSION (data/expansion.js) ──────────────────
// Smelting, alloys, every metal × weapon family, tools, armour, bows and
// staves, stations, cooking and rites. Generated recipes never shadow a
// hand-written one with the same id. Steel is now SMELTED (iron ingots
// + coal at a smelter) — the old 3-iron-ore shortcut is retired.
{
  const i = FORGE_RECIPES.findIndex(r => r.id === 'recipe_steel_ingot');
  if (i >= 0) FORGE_RECIPES.splice(i, 1);
  const have = new Set(FORGE_RECIPES.map(r => r.id));
  for (const r of GEN_RECIPES) if (!have.has(r.id)) { FORGE_RECIPES.push(r.count ? { ...r, outputCount: r.count } : r); have.add(r.id); }
}
{
  // Items: raw materials, ingots, weapons, tools, armour, food, stations.
  // Tier strings become the MATERIAL_TIERS objects the UI reads.
  const have = new Set(MATERIALS.map(m => m.id));
  for (const d of [...NEW_MATERIALS, ...GEN_ITEMS]) {
    if (have.has(d.id)) continue;
    MATERIALS.push({ ...d, tier: MATERIAL_TIERS[String(d.tier || 'common').toUpperCase()] || MATERIAL_TIERS.COMMON });
    have.add(d.id);
  }
}
// Drops for the expansion's creatures. `knife: true` = only with a
// skinning knife in the satchel (Enemy.hasKnife).
for (const c of NEW_CREATURES) {
  if (!DROPS[c.id]) DROPS[c.id] = (c.drops || []).map(([item, chance, knife]) => ({ item, chance, knife: !!knife }));
}
