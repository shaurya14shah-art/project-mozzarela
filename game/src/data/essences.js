// ══════════════════════════════════════════════════════════
// Essence Alchemy — the substrate the whole brewing loop runs on
//
// There is no recipe table. Every ingredient carries an ESSENCE
// PROFILE, and the cauldron *resolves* whatever you put in it:
//
//   element weights  → what the spell is made of
//   form weights     → how the spell is delivered
//   potency          → how hard it hits
//   purity           → how many charges you get out of it
//   opposition       → instability (power at the cost of control)
//
// Any combination produces a real spell. Nothing is a dead end.
// ══════════════════════════════════════════════════════════

import { ELEMENTS } from './constants.js';

// ── FORMS ─────────────────────────────────────────────────
// The five delivery archetypes. Every spell is one of these.
export const FORMS = {
  LANCE: 'lance',   // focused, fast, pierces — single target
  BLOOM: 'bloom',   // expanding nova around impact — burst AoE
  MIRE:  'mire',    // lingering field — damage over time, zone control
  WARD:  'ward',    // turns inward — self buff / protection
  HUNT:  'hunt',    // seeks targets — homing, forgiving to aim
};

export const FORM_DATA = {
  [FORMS.LANCE]: {
    id: FORMS.LANCE, name: 'Lance', icon: '➤',
    blurb: 'Focused. Travels fast and punches through.',
    damageMult: 1.35, radius: 0,   speed: 46, chargeMult: 1.0,
    pierce: true,
  },
  [FORMS.BLOOM]: {
    id: FORMS.BLOOM, name: 'Bloom', icon: '✺',
    blurb: 'Detonates outward. Hits everything close.',
    damageMult: 1.0,  radius: 6,   speed: 26, chargeMult: 0.85,
  },
  [FORMS.MIRE]: {
    id: FORMS.MIRE, name: 'Mire', icon: '≋',
    blurb: 'Hangs in the air. Grinds down anything standing in it.',
    damageMult: 0.5,  radius: 5,   speed: 16, chargeMult: 1.15,
    lingering: 5.0, tickRate: 0.6,
  },
  [FORMS.WARD]: {
    id: FORMS.WARD, name: 'Ward', icon: '◈',
    blurb: 'Turns inward. Shields and empowers the caster.',
    damageMult: 0,    radius: 3,   speed: 0,  chargeMult: 1.3,
    selfCast: true, buffDuration: 8.0,
  },
  [FORMS.HUNT]: {
    id: FORMS.HUNT, name: 'Hunt', icon: '⌖',
    blurb: 'Splits into seekers. Finds targets on its own.',
    damageMult: 0.8,  radius: 0,   speed: 24, chargeMult: 0.9,
    homing: true, projectiles: 3,
  },
};

export const FORM_LIST = Object.values(FORMS);

// ── ELEMENT OPPOSITION ────────────────────────────────────
// Mixing opposed elements makes a brew powerful but volatile.
// Symmetric — declared one way, read both ways.
const OPPOSED_PAIRS = [
  [ELEMENTS.FIRE,      ELEMENTS.ICE],
  [ELEMENTS.FIRE,      ELEMENTS.WATER],
  [ELEMENTS.LIGHT,     ELEMENTS.SHADOW],
  [ELEMENTS.VOID,      ELEMENTS.ARCANE],
  [ELEMENTS.EARTH,     ELEMENTS.WIND],
  [ELEMENTS.LIGHTNING, ELEMENTS.EARTH],
  [ELEMENTS.POISON,    ELEMENTS.LIGHT],
  [ELEMENTS.ICE,       ELEMENTS.LIGHTNING],
  [ELEMENTS.VOID,      ELEMENTS.LIGHT],
];

const _opposition = new Map();
for (const [a, b] of OPPOSED_PAIRS) {
  if (!_opposition.has(a)) _opposition.set(a, new Set());
  if (!_opposition.has(b)) _opposition.set(b, new Set());
  _opposition.get(a).add(b);
  _opposition.get(b).add(a);
}

export function areOpposed(a, b) {
  return !!(a && b && _opposition.get(a)?.has(b));
}

export function getOpposites(el) {
  return [...(_opposition.get(el) || [])];
}

// ── ELEMENT STATUS EFFECTS ────────────────────────────────
// What each element does on top of raw damage. Scaled by potency.
export const ELEMENT_TRAITS = {
  [ELEMENTS.FIRE]:      { status: 'burn',    verb: 'Ignites',   damageBias: 1.25, effect: { burn: 3.0 } },
  [ELEMENTS.ICE]:       { status: 'chill',   verb: 'Freezes',   damageBias: 0.85, effect: { slow: 0.5, duration: 4 } },
  [ELEMENTS.LIGHTNING]: { status: 'shock',   verb: 'Shocks',    damageBias: 1.15, effect: { stun: 1.2, chain: 2 } },
  [ELEMENTS.POISON]:    { status: 'corrode', verb: 'Corrodes',  damageBias: 0.8,  effect: { poison: 6, tickRate: 1 } },
  [ELEMENTS.SHADOW]:    { status: 'drain',   verb: 'Siphons',   damageBias: 1.0,  effect: { lifesteal: 0.35, armorPen: 0.3 } },
  [ELEMENTS.LIGHT]:     { status: 'sear',    verb: 'Sears',     damageBias: 1.05, effect: { blind: 2.5, healSelf: 0.15 } },
  [ELEMENTS.VOID]:      { status: 'unmake',  verb: 'Unmakes',   damageBias: 1.4,  effect: { armorPen: 0.6, pull: 6 } },
  [ELEMENTS.ARCANE]:    { status: 'destab',  verb: 'Destabilises', damageBias: 1.1, effect: { amplify: 0.25, manaBurn: 10 } },
  [ELEMENTS.EARTH]:     { status: 'crush',   verb: 'Crushes',   damageBias: 1.2,  effect: { knockback: 8, stun: 1.5 } },
  [ELEMENTS.WIND]:      { status: 'buffet',  verb: 'Scatters',  damageBias: 0.75, effect: { launch: 10, haste: 0.25 } },
  [ELEMENTS.WATER]:     { status: 'douse',   verb: 'Douses',    damageBias: 0.8,  effect: { slow: 0.3, cleanse: true } },
  [ELEMENTS.NEUTRAL]:   { status: 'force',   verb: 'Strikes',   damageBias: 1.0,  effect: { knockback: 4 } },
};

// ── INGREDIENT ESSENCE PROFILES ───────────────────────────
// element : { <element>: weight }   — weights are relative, not normalised
// form    : { <form>: weight }
// potency : 1-10, drives damage/duration
// purity  : 0-1, drives charge count and mana efficiency
// stabilizer: subtracts instability instead of adding power
//
// An ingredient with no entry here still works — resolveEssence()
// falls back to its `element` field with a neutral form spread.
export const INGREDIENT_ESSENCE = {
  // ── COMMON / STARTER ────────────────────────────────────
  slime_gel: {
    element: { [ELEMENTS.POISON]: 2, [ELEMENTS.WATER]: 1 },
    form: { [FORMS.MIRE]: 3, [FORMS.BLOOM]: 1 },
    potency: 2, purity: 0.5, stabilizer: 1.5,
    note: 'Sticky and inert. Calms a violent mix.',
  },
  slime_glue: {
    element: { [ELEMENTS.POISON]: 1, [ELEMENTS.EARTH]: 1 },
    form: { [FORMS.MIRE]: 2, [FORMS.WARD]: 1 },
    potency: 1, purity: 0.6, stabilizer: 2.0,
    note: 'Binds anything. The alchemist\'s cheap insurance.',
  },
  goblin_tooth: {
    element: { [ELEMENTS.NEUTRAL]: 2 },
    form: { [FORMS.LANCE]: 3, [FORMS.HUNT]: 1 },
    potency: 2, purity: 0.55,
    note: 'Sharp intent. Wants to go in a straight line.',
  },
  bone_fragment: {
    element: { [ELEMENTS.NEUTRAL]: 1, [ELEMENTS.SHADOW]: 1 },
    form: { [FORMS.WARD]: 2, [FORMS.LANCE]: 1 },
    potency: 2, purity: 0.6, stabilizer: 1.0,
    note: 'Structure. Holds a brew\'s shape together.',
  },
  sandstone: {
    element: { [ELEMENTS.EARTH]: 2 },
    form: { [FORMS.WARD]: 2, [FORMS.BLOOM]: 1 },
    potency: 1, purity: 0.5, stabilizer: 1.0,
  },

  // ── ELEMENTAL CORES ─────────────────────────────────────
  charged_quartz: {
    element: { [ELEMENTS.LIGHTNING]: 3 },
    form: { [FORMS.LANCE]: 3, [FORMS.HUNT]: 2 },
    potency: 3, purity: 0.7,
    note: 'Hums. Discharges the instant it finds a path.',
  },
  ice_crystal: {
    element: { [ELEMENTS.ICE]: 3 },
    form: { [FORMS.BLOOM]: 2, [FORMS.MIRE]: 2 },
    potency: 3, purity: 0.75,
  },
  ashen_bone: {
    element: { [ELEMENTS.FIRE]: 2, [ELEMENTS.SHADOW]: 1 },
    form: { [FORMS.LANCE]: 2, [FORMS.MIRE]: 1 },
    potency: 3, purity: 0.5,
  },
  void_essence: {
    element: { [ELEMENTS.VOID]: 3 },
    form: { [FORMS.MIRE]: 2, [FORMS.HUNT]: 2 },
    potency: 4, purity: 0.55,
    note: 'Pulls at the edges of the flask.',
  },
  spider_silk: {
    element: { [ELEMENTS.POISON]: 2 },
    form: { [FORMS.MIRE]: 3, [FORMS.HUNT]: 1 },
    potency: 2, purity: 0.65, stabilizer: 0.5,
  },
  venom_sac: {
    element: { [ELEMENTS.POISON]: 3 },
    form: { [FORMS.MIRE]: 3, [FORMS.BLOOM]: 1 },
    potency: 3, purity: 0.6,
  },
  worm_gland: {
    element: { [ELEMENTS.POISON]: 2, [ELEMENTS.EARTH]: 1 },
    form: { [FORMS.BLOOM]: 2, [FORMS.MIRE]: 2 },
    potency: 3, purity: 0.55,
  },
  worm_tooth: {
    element: { [ELEMENTS.EARTH]: 3 },
    form: { [FORMS.LANCE]: 3 },
    potency: 4, purity: 0.6,
  },
  golem_core: {
    element: { [ELEMENTS.EARTH]: 4 },
    form: { [FORMS.WARD]: 3, [FORMS.BLOOM]: 2 },
    potency: 5, purity: 0.8, stabilizer: 1.0,
    note: 'A heart of packed stone. Steadies everything near it.',
  },
  shade_dust: {
    element: { [ELEMENTS.SHADOW]: 3 },
    form: { [FORMS.HUNT]: 2, [FORMS.WARD]: 2 },
    potency: 3, purity: 0.6,
  },
  wraith_tear: {
    element: { [ELEMENTS.SHADOW]: 2, [ELEMENTS.VOID]: 2 },
    form: { [FORMS.WARD]: 3, [FORMS.MIRE]: 1 },
    potency: 4, purity: 0.65,
  },
  vampire_fang: {
    element: { [ELEMENTS.SHADOW]: 4 },
    form: { [FORMS.LANCE]: 3, [FORMS.HUNT]: 1 },
    potency: 5, purity: 0.7,
  },
  crimson_vial: {
    element: { [ELEMENTS.SHADOW]: 2, [ELEMENTS.WATER]: 1 },
    form: { [FORMS.MIRE]: 2, [FORMS.WARD]: 2 },
    potency: 3, purity: 0.7,
  },
  frost_core: {
    element: { [ELEMENTS.ICE]: 4 },
    form: { [FORMS.BLOOM]: 3, [FORMS.MIRE]: 1 },
    potency: 5, purity: 0.8,
  },
  glow_spore: {
    element: { [ELEMENTS.LIGHT]: 3 },
    form: { [FORMS.BLOOM]: 2, [FORMS.WARD]: 2 },
    potency: 4, purity: 0.75,
  },
  spiritwood: {
    element: { [ELEMENTS.LIGHT]: 2, [ELEMENTS.EARTH]: 1 },
    form: { [FORMS.WARD]: 4 },
    potency: 4, purity: 0.85, stabilizer: 1.5,
    note: 'Grown slow. Refuses to let a brew run wild.',
  },
  blight_ember: {
    element: { [ELEMENTS.FIRE]: 4 },
    form: { [FORMS.MIRE]: 2, [FORMS.BLOOM]: 2 },
    potency: 5, purity: 0.55,
  },
  obsidian_heart: {
    element: { [ELEMENTS.FIRE]: 3, [ELEMENTS.EARTH]: 2 },
    form: { [FORMS.BLOOM]: 3, [FORMS.LANCE]: 1 },
    potency: 5, purity: 0.7,
  },
  dragon_scale: {
    element: { [ELEMENTS.FIRE]: 3 },
    form: { [FORMS.WARD]: 3, [FORMS.LANCE]: 1 },
    potency: 4, purity: 0.75, stabilizer: 0.5,
  },
  ethereal_plume: {
    element: { [ELEMENTS.WIND]: 4 },
    form: { [FORMS.HUNT]: 3, [FORMS.BLOOM]: 2 },
    potency: 4, purity: 0.8,
  },
  mana_crystal: {
    element: { [ELEMENTS.ARCANE]: 4 },
    form: { [FORMS.HUNT]: 3, [FORMS.LANCE]: 2 },
    potency: 6, purity: 0.9,
    note: 'Pure intent, no opinion on shape. Amplifies whatever it joins.',
    amplifier: 1.25,
  },
  rift_shard: {
    element: { [ELEMENTS.VOID]: 4, [ELEMENTS.ARCANE]: 2 },
    form: { [FORMS.BLOOM]: 3, [FORMS.MIRE]: 2 },
    potency: 6, purity: 0.5,
    note: 'Two elements that hate each other, fused in one stone.',
  },

  // ── HIGH TIER ───────────────────────────────────────────
  dragon_heart: {
    element: { [ELEMENTS.FIRE]: 6 },
    form: { [FORMS.BLOOM]: 3, [FORMS.LANCE]: 2 },
    potency: 8, purity: 0.8,
  },
  phoenix_down: {
    element: { [ELEMENTS.FIRE]: 4, [ELEMENTS.LIGHT]: 3 },
    form: { [FORMS.WARD]: 4, [FORMS.BLOOM]: 1 },
    potency: 8, purity: 0.95, stabilizer: 1.0,
  },
  yggdrasil_bark: {
    element: { [ELEMENTS.LIGHT]: 4, [ELEMENTS.EARTH]: 3 },
    form: { [FORMS.WARD]: 4, [FORMS.MIRE]: 2 },
    potency: 7, purity: 0.9, stabilizer: 2.0,
  },
  cosmobark: {
    element: { [ELEMENTS.VOID]: 5, [ELEMENTS.ARCANE]: 3 },
    form: { [FORMS.MIRE]: 3, [FORMS.HUNT]: 3 },
    potency: 8, purity: 0.6,
  },
  primordium: {
    element: {
      [ELEMENTS.NEUTRAL]: 2, [ELEMENTS.ARCANE]: 2,
      [ELEMENTS.VOID]: 1, [ELEMENTS.LIGHT]: 1,
    },
    form: { [FORMS.LANCE]: 1, [FORMS.BLOOM]: 1, [FORMS.MIRE]: 1, [FORMS.WARD]: 1, [FORMS.HUNT]: 1 },
    potency: 10, purity: 1.0,
    amplifier: 1.5,
    note: 'The first matter. Takes the shape of whatever it is mixed with.',
  },
};

// ── NAMED FUSIONS ─────────────────────────────────────────
// When two elements come out close to balanced AND the pair is
// listed here, the brew resolves to a named Fusion instead of
// the generic element×form spell. Stronger, and the real
// discovery content — the Grimoire tracks which you've found.
export const FUSIONS = [
  {
    id: 'emberstorm', name: 'Emberstorm', icon: '🌪️',
    pair: [ELEMENTS.FIRE, ELEMENTS.WIND],
    description: 'Fire given somewhere to go. Spreads on contact and keeps spreading.',
    damageMult: 1.6, effect: { burn: 5.0, launch: 6, spread: true }, color: 0xff7722,
  },
  {
    id: 'stormglass', name: 'Stormglass', icon: '🌩️',
    pair: [ELEMENTS.LIGHTNING, ELEMENTS.ICE],
    description: 'Charge trapped in ice. Shatters into conducting splinters.',
    damageMult: 1.7, effect: { stun: 2.0, slow: 0.6, chain: 4 }, color: 0x99eaff,
  },
  {
    id: 'blightbloom', name: 'Blightbloom', icon: '🦠',
    pair: [ELEMENTS.POISON, ELEMENTS.EARTH],
    description: 'The ground itself turns septic underfoot.',
    damageMult: 1.35, effect: { poison: 12, tickRate: 0.5, slow: 0.4 }, color: 0x77bb33,
  },
  {
    id: 'eclipse', name: 'Eclipse', icon: '🌘',
    pair: [ELEMENTS.LIGHT, ELEMENTS.SHADOW],
    description: 'Two opposites held in one flask. Blinds, then drains what cannot see.',
    damageMult: 1.9, effect: { blind: 4, lifesteal: 0.5, armorPen: 0.5 }, color: 0xbb88ff,
    volatile: true,
  },
  {
    id: 'unmaking', name: 'The Unmaking', icon: '🌌',
    pair: [ELEMENTS.VOID, ELEMENTS.ARCANE],
    description: 'A hole where the spell should be. Everything nearby falls in.',
    damageMult: 2.4, effect: { armorPen: 0.9, pull: 14, shockwave: 12 }, color: 0xff00cc,
    volatile: true,
  },
  {
    id: 'permafrost', name: 'Permafrost', icon: '🧊',
    pair: [ELEMENTS.ICE, ELEMENTS.EARTH],
    description: 'Cold driven into stone. Locks targets where they stand.',
    damageMult: 1.4, effect: { slow: 0.85, duration: 6, stun: 1.5 }, color: 0x88ccdd,
  },
  {
    id: 'wisplight', name: 'Wisplight', icon: '🕯️',
    pair: [ELEMENTS.LIGHT, ELEMENTS.ARCANE],
    description: 'Patient, guiding fire. Mends the caster as it burns the target.',
    damageMult: 1.3, effect: { healSelf: 0.4, amplify: 0.35, blind: 2 }, color: 0xffeeaa,
  },
  {
    id: 'graveltide', name: 'Graveltide', icon: '⛰️',
    pair: [ELEMENTS.EARTH, ELEMENTS.WATER],
    description: 'A slow wall of moving ground. Nothing stays upright in it.',
    damageMult: 1.35, effect: { knockback: 14, slow: 0.5 }, color: 0x998855,
  },
  {
    id: 'nightgale', name: 'Nightgale', icon: '🌫️',
    pair: [ELEMENTS.SHADOW, ELEMENTS.WIND],
    description: 'Moves faster than it should. Hard to see, harder to outrun.',
    damageMult: 1.45, effect: { lifesteal: 0.3, haste: 0.5, launch: 8 }, color: 0x6644aa,
  },
  {
    id: 'cindermire', name: 'Cindermire', icon: '🕳️',
    pair: [ELEMENTS.FIRE, ELEMENTS.POISON],
    description: 'Burning sludge. Sticks, then cooks whatever it stuck to.',
    damageMult: 1.5, effect: { burn: 4, poison: 8, tickRate: 0.5 }, color: 0xcc6611,
  },
  {
    id: 'thunderveil', name: 'Thunderveil', icon: '⚡',
    pair: [ELEMENTS.LIGHTNING, ELEMENTS.WIND],
    description: 'A storm that follows the caster. Strikes anything that comes close.',
    damageMult: 1.55, effect: { chain: 5, stun: 1.0, haste: 0.3 }, color: 0xffff66,
  },
  {
    id: 'hollowfrost', name: 'Hollowfrost', icon: '❄️',
    pair: [ELEMENTS.ICE, ELEMENTS.VOID],
    description: 'Cold with nothing behind it. Takes heat and does not give it anywhere.',
    damageMult: 1.75, effect: { slow: 0.7, armorPen: 0.55, manaBurn: 20 }, color: 0x66ffee,
    volatile: true,
  },
  {
    id: 'sanguine', name: 'Sanguine Rite', icon: '🩸',
    pair: [ELEMENTS.SHADOW, ELEMENTS.POISON],
    description: 'Takes from everything in reach and gives it to you.',
    damageMult: 1.4, effect: { lifesteal: 0.65, poison: 6 }, color: 0xaa1133,
  },
  {
    id: 'quakefire', name: 'Quakefire', icon: '🌋',
    pair: [ELEMENTS.FIRE, ELEMENTS.EARTH],
    description: 'Splits the ground and fills the crack.',
    damageMult: 1.65, effect: { burn: 4, knockback: 12, stun: 2 }, color: 0xff5511,
  },
  {
    id: 'aurora', name: 'Aurora', icon: '🌈',
    pair: [ELEMENTS.LIGHT, ELEMENTS.WIND],
    description: 'Wide, slow and beautiful. Scatters everything it passes through.',
    damageMult: 1.3, effect: { launch: 12, blind: 3, healSelf: 0.2 }, color: 0xaaffdd,
  },
  {
    id: 'voidbrand', name: 'Voidbrand', icon: '🕯️',
    pair: [ELEMENTS.VOID, ELEMENTS.FIRE],
    description: 'Fire that consumes the target instead of the air.',
    damageMult: 1.85, effect: { burn: 6, armorPen: 0.7, pull: 8 }, color: 0xdd22ff,
    volatile: true,
  },
  {
    id: 'runeward', name: 'Runeward', icon: '🛡️',
    pair: [ELEMENTS.ARCANE, ELEMENTS.EARTH],
    description: 'Written protection. Holds while you decide what to do next.',
    damageMult: 1.2, effect: { shield: 60, amplify: 0.3, knockback: 6 }, color: 0xccaaff,
  },
  {
    id: 'brinerot', name: 'Brinerot', icon: '🫧',
    pair: [ELEMENTS.WATER, ELEMENTS.POISON],
    description: 'Spreads through anything wet. Including people.',
    damageMult: 1.3, effect: { poison: 10, slow: 0.35, spread: true }, color: 0x449966,
  },
  {
    id: 'starfall', name: 'Starfall', icon: '⭐',
    pair: [ELEMENTS.ARCANE, ELEMENTS.LIGHTNING],
    description: 'Calls something down. It arrives all at once.',
    damageMult: 1.9, effect: { chain: 4, stun: 1.8, amplify: 0.4 }, color: 0xffddff,
  },
  {
    id: 'gravewind', name: 'Gravewind', icon: '💀',
    pair: [ELEMENTS.SHADOW, ELEMENTS.ICE],
    description: 'The cold that comes off something long dead.',
    damageMult: 1.5, effect: { slow: 0.6, lifesteal: 0.35, armorPen: 0.4 }, color: 0x557799,
  },
];

const _fusionByPair = new Map();
const _pairKey = (a, b) => [a, b].sort().join('|');
for (const f of FUSIONS) {
  _fusionByPair.set(_pairKey(f.pair[0], f.pair[1]), f);
}

export function findFusion(elA, elB) {
  return _fusionByPair.get(_pairKey(elA, elB)) || null;
}

export function getFusionById(id) {
  return FUSIONS.find(f => f.id === id) || null;
}

// ── RESONANCE REACTIONS ───────────────────────────────────
// Combat-side, not brewing-side. Hitting a target that is still
// carrying a *different* element's residue triggers a reaction.
// This is what makes a multi-slot wand worth building.
export const REACTIONS = [
  {
    id: 'shatter', name: 'SHATTER', pair: [ELEMENTS.FIRE, ELEMENTS.ICE],
    multiplier: 2.0, color: 0x99ddff,
    blurb: 'Thermal shock — doubles the incoming hit.',
  },
  {
    id: 'superconduct', name: 'SUPERCONDUCT', pair: [ELEMENTS.LIGHTNING, ELEMENTS.ICE],
    multiplier: 1.7, color: 0xccffff, effect: { armorPen: 0.8 },
    blurb: 'Frozen targets conduct. Armour stops mattering.',
  },
  {
    id: 'combust', name: 'COMBUST', pair: [ELEMENTS.FIRE, ELEMENTS.POISON],
    multiplier: 1.8, color: 0xffaa22, effect: { radius: 5 },
    blurb: 'Toxins ignite in a ring.',
  },
  {
    id: 'overload', name: 'OVERLOAD', pair: [ELEMENTS.LIGHTNING, ELEMENTS.ARCANE],
    multiplier: 2.1, color: 0xffff88, effect: { chain: 6 },
    blurb: 'Raw charge with nowhere to earth. Jumps everywhere.',
  },
  {
    id: 'collapse', name: 'COLLAPSE', pair: [ELEMENTS.VOID, ELEMENTS.EARTH],
    multiplier: 1.9, color: 0xcc44ff, effect: { pull: 12, stun: 2 },
    blurb: 'The ground goes out from under them.',
  },
  {
    id: 'purge', name: 'PURGE', pair: [ELEMENTS.LIGHT, ELEMENTS.SHADOW],
    multiplier: 2.2, color: 0xffffff, effect: { lifesteal: 0.5 },
    blurb: 'Opposites annihilating on the target.',
  },
  {
    id: 'corrode', name: 'CORRODE', pair: [ELEMENTS.POISON, ELEMENTS.WATER],
    multiplier: 1.5, color: 0x88cc66, effect: { poison: 12 },
    blurb: 'Dilutes and carries deeper.',
  },
  {
    id: 'tempest', name: 'TEMPEST', pair: [ELEMENTS.WIND, ELEMENTS.LIGHTNING],
    multiplier: 1.75, color: 0xaaffff, effect: { launch: 14 },
    blurb: 'Charged air throws everything skyward.',
  },
  {
    id: 'scour', name: 'SCOUR', pair: [ELEMENTS.WIND, ELEMENTS.EARTH],
    multiplier: 1.55, color: 0xddccaa, effect: { armorPen: 0.6 },
    blurb: 'Grit at speed strips armour off.',
  },
  {
    id: 'annul', name: 'ANNUL', pair: [ELEMENTS.VOID, ELEMENTS.ARCANE],
    multiplier: 2.3, color: 0xff44dd, effect: { manaBurn: 40, armorPen: 1.0 },
    blurb: 'Nothing meets everything. Nothing wins.',
  },
];

const _reactionByPair = new Map();
for (const r of REACTIONS) {
  _reactionByPair.set(_pairKey(r.pair[0], r.pair[1]), r);
}

export function findReaction(elA, elB) {
  if (!elA || !elB || elA === elB) return null;
  return _reactionByPair.get(_pairKey(elA, elB)) || null;
}

// ── SURGES ────────────────────────────────────────────────
// What an unstable brew can do when it goes off wrong (or very right).
// Rolled on cast, chance scaling with the potion's instability.
export const SURGES = [
  { id: 'overflow',  name: 'Overflow',   good: true,  blurb: 'The brew gives more than it had.', apply: s => ({ damageMult: 1.8 }) },
  { id: 'echo',      name: 'Echo',       good: true,  blurb: 'It casts a second time on its own.', apply: s => ({ echo: true }) },
  { id: 'widening',  name: 'Widening',   good: true,  blurb: 'The effect spreads further than intended.', apply: s => ({ radiusBonus: 5 }) },
  { id: 'freecast',  name: 'Free Cast',  good: true,  blurb: 'The charge is not spent.', apply: s => ({ refundCharge: true }) },
  { id: 'fizzle',    name: 'Fizzle',     good: false, blurb: 'It comes apart mid-cast.', apply: s => ({ damageMult: 0.4 }) },
  { id: 'backlash',  name: 'Backlash',   good: false, blurb: 'Some of it comes back at you.', apply: s => ({ selfDamage: 8 }) },
  { id: 'scatter',   name: 'Scatter',    good: false, blurb: 'It goes somewhere other than where you aimed.', apply: s => ({ inaccuracy: 0.35 }) },
  { id: 'manavoid',  name: 'Mana Void',  good: false, blurb: 'It drinks deeper than it should have.', apply: s => ({ extraManaCost: 20 }) },
];

export function rollSurge(instability, rng = Math.random) {
  // instability is 0..1. Below the floor nothing ever happens.
  const chance = Math.max(0, (instability - 0.25)) * 0.9;
  if (rng() > chance) return null;
  // Higher instability skews toward the dramatic (good) results too —
  // volatility is a gamble, not a straight penalty.
  const goodBias = 0.35 + instability * 0.25;
  const pool = SURGES.filter(s => (rng() < goodBias ? s.good : !s.good));
  const table = pool.length ? pool : SURGES;
  return table[Math.floor(rng() * table.length)];
}
