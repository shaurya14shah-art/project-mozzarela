// ══════════════════════════════════════════════════════════
// THE WORLD EXPANSION — materials, metals, tools, food, creatures
//
// Owner (grilling, 2026-10-06): "expand the game — more biomes, mobs,
// materials, caves for ores". Decided, in order:
//   · DEPTH over count: every biome gets its own creatures, materials
//     and caves; four new biomes fill real gaps
//   · caves are a MIX: surface grottos and open pits for common ore,
//     deep walkable caves for the rare
//   · crafted TOOLS (pickaxe / woodsman's axe / skinning knife); ore
//     HARDNESS gates which pick can break it
//   · creatures = ALL: wildlife (grazers flee, predators hunt), biome
//     monsters, a few hand-ruled beasts, humanoid factions with camps
//   · materials = ALL: a metal ladder with TRAITS, a signature
//     material per biome, alloys at a smelter
//   · food heals and buffs (no hunger), cooked at a fire
//
// This file is data only. Items and recipes generated here are
// registered by data/itemRegistry.js and appended to FORGE_RECIPES by
// data/materials.js; creatures by entities/Enemy.js and data/steel.js.
// ══════════════════════════════════════════════════════════

import { RITUALS } from './steel.js';

// ── The metal ladder ──────────────────────────────────────
// `power` is a weapon's attack in that metal (family multipliers are
// CombatSystem's), `pick` the hardness a pickaxe of it can break,
// `trait` read by CombatSystem (see METAL_TRAITS).
export const METALS = {
  bronze:     { name: 'Bronze',     ingot: 'bronze_ingot',     power: 12, pick: 2, color: 0xb07a40, trait: null },
  iron:       { name: 'Iron',       ingot: 'iron_ingot',       power: 16, pick: 3, color: 0x6c6c70, trait: null },
  steel:      { name: 'Steel',      ingot: 'steel_ingot',      power: 21, pick: 4, color: 0x9aa0a8, trait: 'keen' },
  silver:     { name: 'Silver',     ingot: 'silver_ingot',     power: 19, pick: 3, color: 0xd0d4dc, trait: 'blessed' },
  mithril:    { name: 'Mithril',    ingot: 'mithril_ingot',    power: 26, pick: 5, color: 0xa8c4e8, trait: 'light' },
  obsidian:   { name: 'Obsidian',   ingot: 'obsidian_glass',   power: 29, pick: 5, color: 0x1a1620, trait: 'brittle' },
  moonsteel:  { name: 'Moonsteel',  ingot: 'moonsteel_ingot',  power: 30, pick: 5, color: 0xc8d8f0, trait: 'moonlit' },
  starmetal:  { name: 'Starmetal',  ingot: 'starmetal_ingot',  power: 35, pick: 6, color: 0x5a6a9a, trait: 'skyborn' },
  orichalcum: { name: 'Orichalcum', ingot: 'orichalcum_ingot', power: 42, pick: 7, color: 0xd8a040, trait: 'conductive' },
};
/** What a metal does beyond its number (CombatSystem reads these). */
export const METAL_TRAITS = {
  keen:       'Holds an edge: +10% damage.',
  blessed:    'Silver: half again as hard against the dead.',
  light:      'Light in the hand: swings cost a quarter less stamina.',
  brittle:    'Glass-sharp (+35% damage) but a blocked blow jars you off balance.',
  moonlit:    'Moonsteel: light, and it bites the dead.',
  skyborn:    'Fallen from the sky: +20% damage, less stamina.',
  conductive: 'The blade drinks faster: charge builds half again as quick.',
};
export const UNDEAD = new Set(['skeleton', 'wraith', 'bone_acolyte', 'grave_stalker', 'vampire', 'drowned']);

// ── Ores, woods, stone, hides: hardness and where they are ──
// `hard` = the tool power needed. Ores need a pickaxe, woods an axe,
// hides a knife.
export const ORES = {
  copper_ore:   { name: 'Copper Ore',   hard: 1, color: 0xb86a3a, tier: 'common' },
  tin_ore:      { name: 'Tin Ore',      hard: 1, color: 0xb8b8b0, tier: 'common' },
  coal:         { name: 'Coal',         hard: 1, color: 0x1c1c1e, tier: 'common' },
  iron_ore:     { name: 'Iron Ore',     hard: 2, color: 0x8a4a32, tier: 'common' },
  silver_ore:   { name: 'Silver Ore',   hard: 3, color: 0xd4d8e0, tier: 'uncommon' },
  mithril_ore:  { name: 'Mithril Ore',  hard: 4, color: 0x9ab8f0, tier: 'rare' },
  obsidian_shard:{ name: 'Obsidian',    hard: 4, color: 0x120e16, tier: 'rare' },
  starmetal:    { name: 'Starmetal',    hard: 5, color: 0x6a7ab8, tier: 'epic' },
  orichalcum:   { name: 'Orichalcum',   hard: 6, color: 0xe0a848, tier: 'legendary' },
};
export const WOODS = { oak_wood: 1, ash_wood: 2, heartwood: 2, spiritwood: 3, eldertree: 4 };

/** New raw materials (ores above that did not exist yet + biome signatures + food). */
export const NEW_MATERIALS = [
  { id: 'copper_ore', name: 'Copper Ore', tier: 'common', icon: '🟤', type: 'resource' },
  { id: 'tin_ore', name: 'Tin Ore', tier: 'common', icon: '⚪', type: 'resource' },
  { id: 'coal', name: 'Coal', tier: 'common', icon: '⚫', type: 'resource' },
  { id: 'silver_ore', name: 'Silver Ore', tier: 'uncommon', icon: '🥈', type: 'resource' },
  { id: 'obsidian_shard', name: 'Obsidian', tier: 'rare', icon: '🔷', type: 'resource' },
  { id: 'stone', name: 'Fieldstone', tier: 'common', icon: '🪨', type: 'resource' },
  { id: 'river_clay', name: 'River Clay', tier: 'common', icon: '🟫', type: 'resource' },
  { id: 'limestone', name: 'Limestone', tier: 'common', icon: '⬜', type: 'resource' },
  { id: 'heartwood', name: 'Heartwood', tier: 'uncommon', icon: '🪵', type: 'resource' },
  { id: 'flax', name: 'Flax', tier: 'common', icon: '🌾', type: 'resource' },
  { id: 'sulphur', name: 'Sulphur', tier: 'uncommon', icon: '🟡', type: 'resource' },
  { id: 'amber', name: 'Amber', tier: 'uncommon', icon: '🟠', type: 'resource' },
  { id: 'peat', name: 'Peat', tier: 'common', icon: '🟫', type: 'resource' },
  { id: 'cave_pearl', name: 'Cave Pearl', tier: 'rare', icon: '⚪', type: 'resource' },
  { id: 'frost_root', name: 'Frost Root', tier: 'common', icon: '🥕', type: 'resource' },
  { id: 'pepper_pod', name: 'Fire Pepper', tier: 'common', icon: '🌶️', type: 'resource' },
  { id: 'cap_mushroom', name: 'Shelf Cap', tier: 'common', icon: '🍄', type: 'resource' },
  { id: 'raw_meat', name: 'Raw Meat', tier: 'common', icon: '🥩', type: 'resource' },
  { id: 'raw_hide', name: 'Raw Hide', tier: 'common', icon: '🟫', type: 'resource' },
  { id: 'thick_hide', name: 'Thick Hide', tier: 'uncommon', icon: '🟤', type: 'resource' },
  { id: 'antler', name: 'Antler', tier: 'common', icon: '🦌', type: 'resource' },
  { id: 'fang', name: 'Fang', tier: 'common', icon: '🦷', type: 'resource' },
  { id: 'chitin_plate', name: 'Chitin Plate', tier: 'uncommon', icon: '🛡️', type: 'resource' },
  { id: 'wisp_light', name: 'Wisp-light', tier: 'rare', icon: '✨', type: 'resource' },
];

/**
 * A signature material per biome — what you gather there and nowhere
 * else in quantity. Gathered from `signature` nodes (plants, crystals,
 * clay banks) placed by ChunkManager; tool = what breaks it.
 */
export const SIGNATURE = {
  plains: { id: 'flax', tool: null, look: 'plant', color: 0xc8b878 },
  enchanted_forest: { id: 'heartwood', tool: 'hatchet', hard: 2, look: 'stump', color: 0x6a3a22 },
  volcanic_wastes: { id: 'sulphur', tool: 'pickaxe', hard: 1, look: 'crust', color: 0xd8c830 },
  crystal_caverns: { id: 'mana_crystal', tool: 'pickaxe', hard: 3, look: 'crystal', color: 0x9a70e0 },
  frozen_tundra: { id: 'frost_root', tool: null, look: 'plant', color: 0xc0d8f0 },
  desert_ruins: { id: 'sandstone', tool: 'pickaxe', hard: 1, look: 'crust', color: 0xd0a868 },
  twilight_swamp: { id: 'glow_spore', tool: null, look: 'shroom', color: 0x80e0a0 },
  shadow_realm: { id: 'abyssal_silk', tool: 'knife', hard: 1, look: 'web', color: 0x302040 },
  celestial_peaks: { id: 'ethereal_plume', tool: null, look: 'plant', color: 0xf0f0ff },
  living_jungle: { id: 'pepper_pod', tool: null, look: 'plant', color: 0xd03020 },
  obsidian_wastes: { id: 'obsidian_shard', tool: 'pickaxe', hard: 4, look: 'crystal', color: 0x18121e },
  bioluminescent_grotto: { id: 'glow_spore', tool: null, look: 'shroom', color: 0x40e0d0 },
  crimson_rift: { id: 'rift_shard', tool: 'pickaxe', hard: 3, look: 'crystal', color: 0xe02040 },
  fungal_wastes: { id: 'cap_mushroom', tool: null, look: 'shroom', color: 0xb08860 },
  astral_highlands: { id: 'starmetal', tool: 'pickaxe', hard: 5, look: 'meteor', color: 0x6a7ab8 },
  amber_steppe: { id: 'amber', tool: 'pickaxe', hard: 1, look: 'crust', color: 0xe09030 },
  drowned_flats: { id: 'river_clay', tool: null, look: 'clay', color: 0x8a6a4a },
  stormwrack_coast: { id: 'charged_quartz', tool: 'pickaxe', hard: 2, look: 'crystal', color: 0x9ad0ff },
  petrified_wood: { id: 'coal', tool: 'pickaxe', hard: 1, look: 'stump', color: 0x2a2624 },
  glacier_shelf: { id: 'silver_ore', tool: 'pickaxe', hard: 3, look: 'crust', color: 0xd4d8e0 },
  ember_dunes: { id: 'sulphur', tool: 'pickaxe', hard: 1, look: 'crust', color: 0xd8c830 },
  the_verge: { id: 'rift_shard', tool: 'pickaxe', hard: 3, look: 'crystal', color: 0xb060e0 },
  hollow_mountains: { id: 'limestone', tool: 'pickaxe', hard: 1, look: 'crust', color: 0xd8d4c8 },
  godgrave: { id: 'ashen_bone', tool: 'pickaxe', hard: 2, look: 'crust', color: 0xd8d0c0 },
  forgotten_shore: { id: 'river_clay', tool: null, look: 'clay', color: 0x8a7a6a },
  dreaming_city: { id: 'limestone', tool: 'pickaxe', hard: 1, look: 'crust', color: 0xd0ccc0 },
  bottomless_pit: { id: 'obsidian_shard', tool: 'pickaxe', hard: 4, look: 'crystal', color: 0x18121e },
  iron_hills: { id: 'copper_ore', tool: 'pickaxe', hard: 1, look: 'crust', color: 0xb86a3a },
  sunken_mire: { id: 'peat', tool: null, look: 'clay', color: 0x3a2a1a },
  highland_karst: { id: 'limestone', tool: 'pickaxe', hard: 1, look: 'crust', color: 0xe0dcd0 },
  ashen_caldera: { id: 'sulphur', tool: 'pickaxe', hard: 1, look: 'crust', color: 0xd8c830 },
};

/**
 * Which ores show in each biome's surface veins (weighted list) — the
 * ladder anchored to places. Grottos and pits draw from the same list;
 * deep caves add the rarer rungs (CaveSystem).
 */
export const BIOME_ORES = {
  plains: ['copper_ore', 'copper_ore', 'tin_ore', 'coal'],
  amber_steppe: ['copper_ore', 'tin_ore', 'coal'],
  enchanted_forest: ['copper_ore', 'iron_ore', 'coal'],
  desert_ruins: ['tin_ore', 'copper_ore', 'iron_ore'],
  drowned_flats: ['tin_ore', 'copper_ore', 'iron_ore'],
  frozen_tundra: ['iron_ore', 'iron_ore', 'silver_ore'],
  iron_hills: ['iron_ore', 'iron_ore', 'copper_ore', 'tin_ore', 'coal', 'coal'],
  volcanic_wastes: ['iron_ore', 'coal', 'obsidian_shard'],
  crystal_caverns: ['mithril_ore', 'silver_ore', 'iron_ore'],
  twilight_swamp: ['iron_ore', 'silver_ore'],
  sunken_mire: ['silver_ore', 'silver_ore', 'iron_ore', 'coal'],
  celestial_peaks: ['silver_ore', 'iron_ore', 'mithril_ore'],
  living_jungle: ['iron_ore', 'copper_ore'],
  petrified_wood: ['coal', 'coal', 'iron_ore'],
  stormwrack_coast: ['iron_ore', 'silver_ore'],
  highland_karst: ['iron_ore', 'silver_ore', 'mithril_ore'],
  glacier_shelf: ['silver_ore', 'mithril_ore'],
  ember_dunes: ['obsidian_shard', 'iron_ore'],
  obsidian_wastes: ['obsidian_shard', 'obsidian_shard', 'mithril_ore'],
  ashen_caldera: ['obsidian_shard', 'obsidian_shard', 'coal', 'mithril_ore'],
  bioluminescent_grotto: ['mithril_ore', 'silver_ore'],
  fungal_wastes: ['iron_ore', 'silver_ore', 'coal'],
  astral_highlands: ['starmetal', 'mithril_ore'],
  crimson_rift: ['starmetal', 'obsidian_shard'],
  the_verge: ['starmetal', 'orichalcum'],
  shadow_realm: ['mithril_ore', 'starmetal'],
  hollow_mountains: ['mithril_ore', 'starmetal', 'silver_ore'],
  godgrave: ['silver_ore', 'mithril_ore'],
  forgotten_shore: ['silver_ore', 'iron_ore'],
  dreaming_city: ['silver_ore', 'mithril_ore'],
  bottomless_pit: ['obsidian_shard', 'orichalcum'],
};
/** Deep-cave ore by depth band (CaveSystem): shallow, deep, abyssal. */
export const CAVE_ORES = [
  ['iron_ore', 'coal', 'silver_ore', 'copper_ore'],
  ['silver_ore', 'mithril_ore', 'iron_ore', 'cave_pearl'],
  ['mithril_ore', 'starmetal', 'orichalcum', 'obsidian_shard'],
];

// ── Generated items + recipes ─────────────────────────────
const FAMILY_FORGE = {
  // ingots needed + the other part (haft/grip)
  dagger:     { noun: 'Dagger',        ingots: 1, extra: [['leather', 1]] },
  sword:      { noun: 'Sword',         ingots: 2, extra: [['leather', 1]] },
  axe:        { noun: 'War-Axe',       ingots: 2, extra: [['oak_wood', 2]] },
  spear:      { noun: 'Spear',         ingots: 1, extra: [['oak_wood', 3]] },
  greatsword: { noun: 'Greatsword',    ingots: 4, extra: [['leather', 2]] },
  warhammer:  { noun: 'Hammer',        ingots: 4, extra: [['oak_wood', 2]] },
  scythe:     { noun: 'Scythe',        ingots: 3, extra: [['ash_wood', 2]] },
  dualblades: { noun: 'Paired Blades', ingots: 3, extra: [['leather', 2]] },
};
const TOOL_FORGE = {
  pickaxe: { noun: 'Pickaxe',        ingots: 2, extra: [['oak_wood', 2]], weaponType: 'pickaxe' },
  hatchet: { noun: "Woodsman's Axe", ingots: 1, extra: [['oak_wood', 2]], weaponType: 'axe' },
  knife:   { noun: 'Skinning Knife', ingots: 1, extra: [['leather', 1]], weaponType: 'dagger' },
};
const ARMOR_FORGE = { head: ['Helm', 3, 0.45], chest: ['Hauberk', 5, 1.0], legs: ['Greaves', 4, 0.7] };
const METAL_TIER = { bronze: 'common', iron: 'uncommon', steel: 'uncommon', silver: 'uncommon', mithril: 'rare', obsidian: 'rare', moonsteel: 'epic', starmetal: 'epic', orichalcum: 'legendary' };

export const GEN_ITEMS = [];
export const GEN_RECIPES = [];
const item = (d) => { GEN_ITEMS.push(d); return d; };
const recipe = (d) => { GEN_RECIPES.push(d); return d; };

// Ingots (and glass) — smelted at a smelter.
item({ id: 'bronze_ingot', name: 'Bronze Ingot', tier: 'common', icon: '🟧', type: 'refined' });
item({ id: 'iron_ingot', name: 'Iron Ingot', tier: 'common', icon: '⬛', type: 'refined' });
item({ id: 'silver_ingot', name: 'Silver Ingot', tier: 'uncommon', icon: '⬜', type: 'refined' });
item({ id: 'mithril_ingot', name: 'Mithril Ingot', tier: 'rare', icon: '🟦', type: 'refined' });
item({ id: 'obsidian_glass', name: 'Obsidian Glass', tier: 'rare', icon: '◼️', type: 'refined' });
item({ id: 'moonsteel_ingot', name: 'Moonsteel Ingot', tier: 'epic', icon: '🌙', type: 'refined' });
item({ id: 'starmetal_ingot', name: 'Starmetal Ingot', tier: 'epic', icon: '⭐', type: 'refined' });
item({ id: 'orichalcum_ingot', name: 'Orichalcum Ingot', tier: 'legendary', icon: '🔶', type: 'refined' });
const smelt = (id, out, n, ing, desc) => recipe({ id: `smelt_${id}`, name: `Smelt ${out}`, outputId: id, count: n, ingredients: ing.map(([i, c]) => ({ id: i, count: c })), description: desc, category: 'smelting', station: 'smelter' });
smelt('bronze_ingot', 'Bronze', 2, [['copper_ore', 2], ['tin_ore', 1], ['coal', 1]], 'An alloy: copper and tin. The first metal worth carrying.');
smelt('iron_ingot', 'Iron', 1, [['iron_ore', 2], ['coal', 1]], 'Iron ore, reduced in a hot fire.');
smelt('silver_ingot', 'Silver', 1, [['silver_ore', 2], ['coal', 1]], 'Soft, bright, and the dead hate it.');
smelt('mithril_ingot', 'Mithril', 1, [['mithril_ore', 2], ['coal', 2]], 'Light as a feather, hard as a promise.');
smelt('obsidian_glass', 'Obsidian Glass', 1, [['obsidian_shard', 3], ['sulphur', 1]], 'Melted and knapped to an edge nothing else takes.');
smelt('moonsteel_ingot', 'Moonsteel', 1, [['silver_ingot', 1], ['mithril_ingot', 1], ['coal', 1]], 'An alloy: silver into mithril. Light, and holy.');
smelt('starmetal_ingot', 'Starmetal', 1, [['starmetal', 2], ['coal', 2]], 'What fell from the sky, worked at last.');
smelt('orichalcum_ingot', 'Orichalcum', 1, [['orichalcum', 2], ['mithril_ingot', 1], ['coal', 2]], 'The red-gold the old smiths only wrote about.');
// Steel is iron and coal again — see materials.js, where the old
// 3-iron-ore recipe is replaced by this one.
smelt('steel_ingot', 'Steel', 1, [['iron_ingot', 2], ['coal', 2]], 'An alloy: iron carburised with coal. Holds an edge.');
// Peat burns like coal in a smelter.
recipe({ id: 'smelt_coal_from_peat', name: 'Char Peat', outputId: 'coal', count: 1, ingredients: [{ id: 'peat', count: 3 }], description: 'Peat, charred into a fuel.', category: 'smelting', station: 'fire' });

for (const [mid, m] of Object.entries(METALS)) {
  for (const [fam, f] of Object.entries(FAMILY_FORGE)) {
    const id = `${mid}_${fam}`;
    item({ id, name: `${m.name} ${f.noun}`, tier: METAL_TIER[mid], icon: '⚔️', type: 'weapon', weaponType: fam, metal: mid, power: m.power });
    recipe({ id: `recipe_${id}`, name: `${m.name} ${f.noun}`, outputId: id,
      ingredients: [{ id: m.ingot, count: f.ingots }, ...f.extra.map(([i, c]) => ({ id: i, count: c }))],
      description: METAL_TRAITS[m.trait] || 'Plain metal, honestly made.', category: 'weapon', metal: mid });
  }
  if (mid === 'obsidian') continue;     // glass makes poor tools and worse armour
  for (const [kind, t] of Object.entries(TOOL_FORGE)) {
    const id = `${mid}_${kind}`;
    item({ id, name: `${m.name} ${t.noun}`, tier: METAL_TIER[mid], icon: kind === 'pickaxe' ? '⛏️' : kind === 'hatchet' ? '🪓' : '🔪',
      type: 'tool', toolKind: kind, toolPower: m.pick, weaponType: t.weaponType, metal: mid, power: Math.round(m.power * 0.55) });
    recipe({ id: `recipe_${id}`, name: `${m.name} ${t.noun}`, outputId: id,
      ingredients: [{ id: m.ingot, count: t.ingots }, ...t.extra.map(([i, c]) => ({ id: i, count: c }))],
      description: kind === 'pickaxe' ? `Breaks ore up to hardness ${m.pick}.` : kind === 'hatchet' ? `Fells wood up to hardness ${m.pick}.` : 'Skins a kill for its hide.', category: 'tool', metal: mid });
  }
  for (const [slot, [noun, n, defMul]] of Object.entries(ARMOR_FORGE)) {
    const id = `${mid}_${slot}_armor`;
    item({ id, name: `${m.name} ${noun}`, tier: METAL_TIER[mid], icon: slot === 'head' ? '🪖' : slot === 'chest' ? '🛡️' : '👖', type: 'armor', slot, defense: Math.round(m.power * 0.55 * defMul), metal: mid });
    recipe({ id: `recipe_${id}`, name: `${m.name} ${noun}`, outputId: id, ingredients: [{ id: m.ingot, count: n }, { id: 'leather', count: 1 }], description: 'Plate over padding.', category: 'armor', metal: mid });
  }
}
// Bows and staves from the woods.
const WOOD_GEAR = [['oak_wood', 'Oak', 11, 'common'], ['ash_wood', 'Ash', 15, 'uncommon'], ['heartwood', 'Heartwood', 20, 'uncommon'], ['spiritwood', 'Spiritwood', 27, 'rare'], ['eldertree', 'Elder', 34, 'epic']];
for (const [w, name, power, tier] of WOOD_GEAR) {
  item({ id: `${w}_bow`, name: `${name} Bow`, tier, icon: '🏹', type: 'weapon', weaponType: 'bow', power });
  recipe({ id: `recipe_${w}_bow`, name: `${name} Bow`, outputId: `${w}_bow`, ingredients: [{ id: w, count: 3 }, { id: 'flax', count: 2 }], description: 'A stave and a flax string.', category: 'weapon' });
  item({ id: `${w}_staff`, name: `${name} Quarterstaff`, tier, icon: '🪄', type: 'weapon', weaponType: 'staff', power: Math.round(power * 0.9) });
  recipe({ id: `recipe_${w}_staff`, name: `${name} Quarterstaff`, outputId: `${w}_staff`, ingredients: [{ id: w, count: 3 }, { id: 'leather', count: 1 }], description: 'Guards two lines at once.', category: 'weapon' });
}
// Hide → leather at a fire (tanning), thick hide → two.
recipe({ id: 'recipe_tan_hide', name: 'Tan Hide', outputId: 'leather', count: 2, ingredients: [{ id: 'raw_hide', count: 1 }], description: 'Scraped and smoked over a fire.', category: 'materials', station: 'fire' });
recipe({ id: 'recipe_tan_thick', name: 'Tan Thick Hide', outputId: 'leather', count: 4, ingredients: [{ id: 'thick_hide', count: 1 }], description: 'Heavier work, more leather.', category: 'materials', station: 'fire' });

// Worn starter tools: break copper, tin, coal and soft wood — enough to
// smelt your first bronze, which is what opens iron.
item({ id: 'worn_pickaxe', name: 'Worn Pickaxe', tier: 'common', icon: '⛏️', type: 'tool', toolKind: 'pickaxe', toolPower: 1, weaponType: 'pickaxe', power: 6 });
item({ id: 'worn_hatchet', name: 'Worn Hatchet', tier: 'common', icon: '🪓', type: 'tool', toolKind: 'hatchet', toolPower: 1, weaponType: 'axe', power: 6 });

// ── Stations you can build ────────────────────────────────
item({ id: 'campfire_kit', name: 'Campfire', tier: 'common', icon: '🔥', type: 'station', station: 'fire', description: 'Lay it and light it. Cook, tan hides, char peat.' });
item({ id: 'bloomery_kit', name: 'Bloomery', tier: 'common', icon: '🏺', type: 'station', station: 'smelter', description: 'A clay furnace. Smelt ore to ingots, make alloys.' });
recipe({ id: 'recipe_campfire', name: 'Campfire', outputId: 'campfire_kit', ingredients: [{ id: 'oak_wood', count: 3 }, { id: 'stone', count: 2 }], description: 'Double-click in the satchel to set it down. Cooking and tanning need one.', category: 'stations' });
recipe({ id: 'recipe_bloomery_clay', name: 'Bloomery (clay)', outputId: 'bloomery_kit', ingredients: [{ id: 'river_clay', count: 4 }, { id: 'stone', count: 4 }, { id: 'oak_wood', count: 2 }], description: 'Double-click in the satchel to build it. Smelting needs one (the Sanctuary has one).', category: 'stations' });
recipe({ id: 'recipe_bloomery_stone', name: 'Bloomery (sandstone)', outputId: 'bloomery_kit', ingredients: [{ id: 'sandstone', count: 5 }, { id: 'stone', count: 3 }, { id: 'oak_wood', count: 2 }], description: 'The desert way to build one.', category: 'stations' });

// ── Food (heals and buffs; cooked at a fire) ──────────────
export const FOODS = {
  roast_meat:   { name: 'Roast Meat',      heal: 30, text: 'Restores 30 blood.' },
  hunters_stew: { name: "Hunter's Stew",   heal: 45, buff: 'wind', secs: 120, text: 'Restores 45 blood; your wind comes back faster for two minutes.' },
  fire_broth:   { name: 'Fire Broth',      heal: 30, buff: 'footing', secs: 120, text: 'Restores 30 blood; your balance returns faster for two minutes.' },
  frost_soup:   { name: 'Frost-root Soup', heal: 35, buff: 'clot', secs: 150, text: 'Restores 35 blood; wounds bleed less for a while.' },
  amber_cake:   { name: 'Amber Honeycake', heal: 25, buff: 'grip', secs: 120, text: 'Restores 25 blood; blocking costs less balance for two minutes.' },
};
const FOOD_RECIPES = {
  roast_meat: [['raw_meat', 1]],
  hunters_stew: [['raw_meat', 2], ['cap_mushroom', 1]],
  fire_broth: [['raw_meat', 1], ['pepper_pod', 1]],
  frost_soup: [['frost_root', 2], ['raw_meat', 1]],
  amber_cake: [['amber', 1], ['flax', 2]],
};
for (const [id, f] of Object.entries(FOODS)) {
  item({ id, name: f.name, tier: 'common', icon: '🍲', type: 'food', food: id, description: f.text });
  recipe({ id: `cook_${id}`, name: f.name, outputId: id, ingredients: FOOD_RECIPES[id].map(([i, c]) => ({ id: i, count: c })), description: f.text, category: 'cooking', station: 'fire' });
}
// Rituals can be made too (data/steel.js RITUALS ids), from biome stuff.
const RITE_RECIPES = {
  oil_ember: [['sulphur', 1], ['pepper_pod', 1]],
  oil_rime: [['ice_crystal', 1], ['frost_root', 1]],
  oil_storm: [['charged_quartz', 1], ['flax', 1]],
  chalk_ward: [['limestone', 2], ['ashen_bone', 1]],
  draught_iron: [['cap_mushroom', 1], ['glow_spore', 1]],
  draught_wind: [['ethereal_plume', 1], ['amber', 1]],
};
for (const [id, ing] of Object.entries(RITE_RECIPES)) {
  recipe({ id: `recipe_${id}`, name: RITUALS[id].name, outputId: id, ingredients: ing.map(([i, c]) => ({ id: i, count: c })), description: RITUALS[id].text, category: 'rites', station: id.startsWith('draught') ? 'fire' : null });
}

// ── Creatures (appended to ENEMY_TYPES) ───────────────────
// `temper`: skittish (flees, never attacks) · defensive (flees until
// hurt, then fights) · hostile · ambush (hidden until close) · blind
// (notices only noise: sprinting, fighting, or touching distance).
// `pack` = how many come together. `kind` picks the body builder
// (rendering/Creatures.js) or a KayKit model (`model`).
export const NEW_CREATURES = [
  // Wildlife
  { id: 'deer', name: 'Ash Deer', cls: 'Grazer', hp: 30, atk: 20, def: 10, speed: 6.2, xp: 10, scale: 1.0, temper: 'skittish', kind: 'quad', drops: [['raw_meat', 0.9], ['raw_hide', 0.7, true], ['antler', 0.5]] },
  { id: 'elk', name: 'Frost Elk', cls: 'Grazer', hp: 70, atk: 45, def: 20, speed: 5.4, xp: 20, scale: 1.3, temper: 'defensive', kind: 'quad', drops: [['raw_meat', 1], ['thick_hide', 0.6, true], ['antler', 0.7]] },
  { id: 'goat', name: 'Crag Goat', cls: 'Grazer', hp: 34, atk: 30, def: 15, speed: 5.6, xp: 10, scale: 0.75, temper: 'defensive', kind: 'quad', drops: [['raw_meat', 0.9], ['raw_hide', 0.6, true]] },
  { id: 'boar', name: 'Bristleback', cls: 'Boar', hp: 60, atk: 55, def: 30, speed: 5.0, xp: 18, scale: 0.85, temper: 'defensive', kind: 'quad', drops: [['raw_meat', 1], ['thick_hide', 0.5, true], ['fang', 0.6]] },
  { id: 'antelope', name: 'Dune Runner', cls: 'Grazer', hp: 28, atk: 18, def: 8, speed: 7.0, xp: 10, scale: 0.9, temper: 'skittish', kind: 'quad', drops: [['raw_meat', 0.9], ['raw_hide', 0.7, true]] },
  { id: 'strider', name: 'Bog Strider', cls: 'Grazer', hp: 40, atk: 25, def: 12, speed: 5.2, xp: 12, scale: 1.2, temper: 'skittish', kind: 'quad', drops: [['raw_meat', 0.9], ['raw_hide', 0.6, true]] },
  { id: 'wolf', name: 'Grey Wolf', cls: 'Pack Hunter', hp: 42, atk: 50, def: 18, speed: 6.4, xp: 20, scale: 0.8, temper: 'hostile', kind: 'quad', pack: 3, drops: [['raw_meat', 0.7], ['raw_hide', 0.7, true], ['fang', 0.6]] },
  { id: 'bear', name: 'Dire Bear', cls: 'Apex', hp: 160, atk: 100, def: 50, speed: 4.6, xp: 60, scale: 1.4, temper: 'hostile', kind: 'quad', drops: [['raw_meat', 1], ['thick_hide', 0.9, true], ['fang', 0.8]] },
  { id: 'jackal', name: 'Sand Jackal', cls: 'Pack Hunter', hp: 32, atk: 40, def: 12, speed: 6.6, xp: 15, scale: 0.65, temper: 'hostile', kind: 'quad', pack: 3, drops: [['raw_meat', 0.6], ['raw_hide', 0.6, true]] },
  { id: 'gator', name: 'Mire Lurker', cls: 'Ambusher', hp: 90, atk: 80, def: 45, speed: 4.0, xp: 35, scale: 1.1, temper: 'ambush', kind: 'quad', drops: [['raw_meat', 0.9], ['thick_hide', 0.8, true]] },
  { id: 'lynx', name: 'Rime Lynx', cls: 'Stalker', hp: 50, atk: 65, def: 20, speed: 6.8, xp: 25, scale: 0.8, temper: 'hostile', kind: 'quad', drops: [['raw_hide', 0.8, true], ['fang', 0.5]] },
  // Biome monsters
  { id: 'rust_crawler', name: 'Rust Crawler', cls: 'Ore-eater', hp: 80, atk: 60, def: 70, speed: 3.2, xp: 40, scale: 0.9, temper: 'hostile', kind: 'beetle', drops: [['chitin_plate', 0.8], ['iron_ore', 0.8], ['copper_ore', 0.6]] },
  { id: 'bog_horror', name: 'Bog Horror', cls: 'Rooted', hp: 150, atk: 85, def: 40, speed: 1.0, xp: 60, scale: 1.4, temper: 'hostile', kind: 'horror', drops: [['peat', 1], ['silver_ore', 0.5], ['glow_spore', 0.5]] },
  { id: 'wisp', name: 'Marsh Wisp', cls: 'Lure', hp: 40, atk: 45, def: 10, speed: 3.6, xp: 30, scale: 0.6, temper: 'hostile', kind: 'wisp', drops: [['wisp_light', 0.6], ['glow_spore', 0.5]] },
  { id: 'cinder_salamander', name: 'Cinder Salamander', cls: 'Firelizard', hp: 75, atk: 70, def: 35, speed: 4.4, xp: 40, scale: 1.0, temper: 'hostile', kind: 'quad', drops: [['sulphur', 0.8], ['thick_hide', 0.5, true], ['obsidian_shard', 0.3]] },
  { id: 'obsidian_sentinel', name: 'Obsidian Sentinel', cls: 'Glass Warden', hp: 130, atk: 90, def: 90, speed: 2.2, xp: 70, scale: 1.3, temper: 'hostile', kind: 'sentinel', drops: [['obsidian_shard', 1], ['obsidian_shard', 0.6]] },
  { id: 'karst_stalker', name: 'Pale Stalker', cls: 'Cliff Cat', hp: 85, atk: 80, def: 30, speed: 6.4, xp: 45, scale: 1.1, temper: 'ambush', kind: 'quad', drops: [['thick_hide', 0.8, true], ['fang', 0.7]] },
  // Cave creatures
  { id: 'blind_crawler', name: 'Blind Crawler', cls: 'Deep Centipede', hp: 70, atk: 70, def: 40, speed: 4.8, xp: 40, scale: 1.0, temper: 'blind', kind: 'centipede', drops: [['chitin_plate', 0.8], ['cave_pearl', 0.15]] },
  { id: 'cave_grub', name: 'Pale Grub', cls: 'Cave Grub', hp: 22, atk: 22, def: 8, speed: 2.6, xp: 6, scale: 0.55, temper: 'hostile', kind: 'grub', pack: 4, drops: [['raw_meat', 0.4]] },
  // Factions (KayKit humanoids: they guard and read your stance)
  { id: 'bandit', name: 'Hill Bandit', cls: 'Bandit', hp: 55, atk: 60, def: 30, speed: 4.4, xp: 25, scale: 0.85, temper: 'hostile', model: 'model:Rogue_Hooded', faction: 'bandits', drops: [['iron_ingot', 0.3], ['leather', 0.5], ['raw_meat', 0.3]] },
  { id: 'bandit_brute', name: 'Bandit Brute', cls: 'Bandit', hp: 95, atk: 80, def: 50, speed: 3.6, xp: 40, scale: 1.0, temper: 'hostile', model: 'model:Barbarian', faction: 'bandits', drops: [['bronze_ingot', 0.4], ['iron_ingot', 0.3], ['leather', 0.5]] },
  { id: 'cultist', name: 'Ashen Cultist', cls: 'Cultist', hp: 60, atk: 75, def: 30, speed: 3.8, xp: 35, scale: 0.9, temper: 'hostile', model: 'model:Mage', faction: 'cult', drops: [['sulphur', 0.5], ['obsidian_shard', 0.3], ['oil_ember', 0.15]] },
  { id: 'knight', name: 'Oathless Knight', cls: 'Fallen Order', hp: 120, atk: 90, def: 70, speed: 3.6, xp: 60, scale: 1.0, temper: 'hostile', model: 'model:Knight', faction: 'order', drops: [['steel_ingot', 0.5], ['silver_ingot', 0.2]] },
  { id: 'drowned', name: 'Drowned Thrall', cls: 'The Drowned', hp: 50, atk: 55, def: 25, speed: 2.8, xp: 20, scale: 0.85, temper: 'hostile', model: 'model:Skeleton_Minion', faction: 'drowned', drops: [['silver_ore', 0.4], ['peat', 0.5]] },
];

/** Body specs for the generic quadruped builder (rendering/Creatures.js). */
export const QUAD_SPECS = {
  deer:     { body: [0.34, 0.32, 0.72], legLen: 0.95, legR: 0.05, neck: 0.55, head: [0.13, 0.14, 0.28], fur: 0x8a6a48, belly: 0xc8b090, antlers: 1, tail: 0.12, ears: 1 },
  elk:      { body: [0.46, 0.45, 0.95], legLen: 1.1, legR: 0.075, neck: 0.6, head: [0.17, 0.18, 0.38], fur: 0x6a5a48, belly: 0xb0a080, antlers: 2, tail: 0.1, ears: 1, mane: 0x4a3a2a },
  goat:     { body: [0.3, 0.32, 0.55], legLen: 0.62, legR: 0.05, neck: 0.32, head: [0.11, 0.13, 0.24], fur: 0xd0ccc0, belly: 0xe0dcd0, horns: 'curl', tail: 0.08, ears: 1, beard: 1 },
  boar:     { body: [0.42, 0.4, 0.72], legLen: 0.42, legR: 0.07, neck: 0.15, head: [0.17, 0.18, 0.36], fur: 0x3a2c22, belly: 0x5a4a3a, tusks: 1, tail: 0.1, ears: 1, mane: 0x2a201a, bristle: 1 },
  antelope: { body: [0.3, 0.3, 0.62], legLen: 0.95, legR: 0.04, neck: 0.5, head: [0.11, 0.12, 0.26], fur: 0xc89858, belly: 0xf0e0c8, horns: 'spike', tail: 0.1, ears: 1 },
  strider:  { body: [0.3, 0.26, 0.5], legLen: 1.5, legR: 0.035, neck: 0.75, head: [0.1, 0.1, 0.32], fur: 0x4a5a40, belly: 0x8a9a70, tail: 0.05, ears: 0, beak: 1 },
  wolf:     { body: [0.3, 0.32, 0.72], legLen: 0.6, legR: 0.05, neck: 0.3, head: [0.13, 0.14, 0.3], fur: 0x6a6a6e, belly: 0xb0b0b0, tail: 0.45, ears: 2, snout: 1, mane: 0x5a5a5e },
  bear:     { body: [0.6, 0.6, 1.0], legLen: 0.6, legR: 0.13, neck: 0.25, head: [0.24, 0.24, 0.34], fur: 0x3a2a1e, belly: 0x5a4632, tail: 0.06, ears: 2, snout: 1, hump: 1 },
  jackal:   { body: [0.24, 0.26, 0.58], legLen: 0.58, legR: 0.038, neck: 0.28, head: [0.1, 0.11, 0.26], fur: 0xb08850, belly: 0xd8c098, tail: 0.32, ears: 3, snout: 1 },
  gator:    { body: [0.42, 0.24, 1.25], legLen: 0.28, legR: 0.08, neck: 0.1, head: [0.2, 0.12, 0.6], fur: 0x3a4a2a, belly: 0x8a8a5a, tail: 1.3, ears: 0, scutes: 1, sprawl: 1 },
  lynx:     { body: [0.28, 0.3, 0.62], legLen: 0.62, legR: 0.05, neck: 0.22, head: [0.13, 0.13, 0.2], fur: 0xd8dce0, belly: 0xf0f0f0, tail: 0.14, ears: 4, snout: 0 },
  cinder_salamander: { body: [0.36, 0.22, 0.9], legLen: 0.3, legR: 0.07, neck: 0.15, head: [0.16, 0.11, 0.32], fur: 0x2a1a14, belly: 0xd04a18, tail: 1.0, ears: 0, sprawl: 1, glow: 0xff6a20, spines: 1 },
  karst_stalker: { body: [0.36, 0.36, 0.85], legLen: 0.7, legR: 0.07, neck: 0.25, head: [0.16, 0.15, 0.26], fur: 0xc8c4b8, belly: 0xe0dcd0, tail: 0.9, ears: 2, snout: 0 },
};

/**
 * Who lives where (creature ids). `wild` are animals (most spawns),
 * `monsters` belong to this biome, `factions` patrol and hold camps.
 * Read by EnemySpawner alongside the biome's own `enemyTypes`.
 */
export const BIOME_LIFE = {
  plains: { wild: ['deer', 'deer', 'wolf'], factions: ['bandit'] },
  enchanted_forest: { wild: ['deer', 'boar', 'wolf', 'bear'] },
  volcanic_wastes: { monsters: ['cinder_salamander'], factions: ['cultist'] },
  crystal_caverns: { wild: ['goat'], monsters: ['rust_crawler'] },
  frozen_tundra: { wild: ['elk', 'elk', 'wolf', 'lynx'] },
  desert_ruins: { wild: ['antelope', 'jackal'], factions: ['bandit'] },
  twilight_swamp: { wild: ['strider', 'gator'], monsters: ['wisp'] },
  shadow_realm: { factions: ['cultist'] },
  celestial_peaks: { wild: ['goat', 'elk'], factions: ['knight'] },
  living_jungle: { wild: ['boar', 'gator'] },
  obsidian_wastes: { monsters: ['obsidian_sentinel', 'cinder_salamander'] },
  bioluminescent_grotto: { wild: ['strider'], monsters: ['wisp'] },
  crimson_rift: { monsters: ['cinder_salamander'], factions: ['cultist'] },
  fungal_wastes: { wild: ['boar'], monsters: ['cave_grub'] },
  astral_highlands: { wild: ['elk', 'lynx'], factions: ['knight'] },
  amber_steppe: { wild: ['antelope', 'deer', 'jackal'], factions: ['bandit'] },
  drowned_flats: { wild: ['strider'], factions: ['drowned'] },
  stormwrack_coast: { wild: ['goat'], factions: ['bandit'] },
  petrified_wood: { wild: ['deer', 'wolf'], monsters: ['rust_crawler'] },
  glacier_shelf: { wild: ['elk', 'lynx'] },
  ember_dunes: { wild: ['antelope', 'jackal'], monsters: ['cinder_salamander'] },
  the_verge: { factions: ['knight'] },
  hollow_mountains: { wild: ['goat'], factions: ['knight'] },
  godgrave: { factions: ['cultist'] },
  forgotten_shore: { factions: ['drowned'] },
  dreaming_city: { factions: ['knight'] },
  bottomless_pit: { monsters: ['obsidian_sentinel'] },
  iron_hills: { wild: ['goat', 'wolf'], monsters: ['rust_crawler'], factions: ['bandit', 'bandit_brute'] },
  sunken_mire: { wild: ['strider', 'boar', 'gator'], monsters: ['bog_horror', 'wisp'], factions: ['drowned'] },
  highland_karst: { wild: ['goat', 'goat', 'bear'], monsters: ['karst_stalker'], factions: ['knight'] },
  ashen_caldera: { monsters: ['cinder_salamander', 'obsidian_sentinel'], factions: ['cultist'] },
};
/** Who lives in the deep caves. */
export const CAVE_LIFE = ['blind_crawler', 'cave_grub', 'rust_crawler', 'blind_crawler'];
