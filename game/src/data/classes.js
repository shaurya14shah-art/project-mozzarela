// ══════════════════════════════════════════════════════════
// Class Definitions — ⚠️ DEAD. NOT IMPORTED ANYWHERE.
//
// Classes were removed at the owner's ask ("instead of me choosing the
// class at the start, make the actions taken change the outcome").
// There is no class picker and nothing reads this table.
//
// What replaced it: systems/LeaningSystem.js. The Pioneer starts
// unshaped and is NAMED by what they do — `leaning.calling()` is the
// emergent replacement, reading both how committed you are and what
// element you are made of, so it keeps moving instead of locking at a
// menu.
//
// Kept on disk rather than deleted for exactly one reason: the `skills`
// arrays here are the only surviving record of which starting kits
// were intended to go together, and a future session adding starting
// loadouts back will want them. If you are reading this because you
// want to re-wire CLASSES into the game, don't — read LeaningSystem's
// header first and add to that instead.
// ══════════════════════════════════════════════════════════

export const CLASSES = [
  {
    id: 'vanguard',
    element: 'earth',
    name: 'Vanguard',
    description: 'Melee tank with heavy strikes',
    color: 0xc04040,
    weapon: 'Greatsword',
    stats: { hp: 130, mp: 30, atk: 18, def: 15, spd: 8 },
    passive: '+20% Max HP',
    skills: ['strike', 'shield_bash', 'dash']
  },
  {
    id: 'shadow_walker',
    element: 'shadow',
    name: 'Shadow Walker',
    description: 'Stealth DPS with critical strikes',
    color: 0x404060,
    weapon: 'Dual Daggers',
    stats: { hp: 80, mp: 40, atk: 22, def: 8, spd: 16 },
    passive: 'Crit on back-attacks',
    skills: ['backstab', 'dash']
  },
  {
    id: 'arcanist',
    element: 'arcane',
    name: 'Arcanist',
    description: 'Ranged caster with powerful spells',
    color: 0xc9a0ff,
    weapon: 'Staff',
    stats: { hp: 70, mp: 80, atk: 25, def: 6, spd: 10 },
    passive: '+30% Mana regen',
    skills: ['fireball', 'heal', 'dash']
  },
  {
    id: 'ranger',
    element: 'wind',
    name: 'Ranger',
    description: 'Ranged physical with keen sight',
    color: 0x408040,
    weapon: 'Longbow',
    stats: { hp: 85, mp: 45, atk: 20, def: 10, spd: 14 },
    passive: 'Eagle-eye minimap reveal',
    skills: ['volley', 'dash']
  },
  {
    id: 'paladin',
    element: 'light',
    name: 'Paladin',
    description: 'Support tank with healing abilities',
    color: 0xf0c040,
    weapon: 'Mace & Shield',
    stats: { hp: 120, mp: 50, atk: 14, def: 18, spd: 9 },
    passive: 'Heal on block',
    skills: ['heal', 'shield_bash']
  },
  {
    id: 'beastmaster',
    element: 'poison',
    name: 'Beastmaster',
    description: 'Summon companion creatures',
    color: 0x80602a,
    weapon: 'Whip',
    stats: { hp: 90, mp: 55, atk: 12, def: 12, spd: 12 },
    passive: 'Start with companion',
    skills: ['summon_wolf', 'strike']
  },
  {
    id: 'duelist',
    element: 'lightning',
    name: 'Duelist',
    description: 'Agile melee with precise parries',
    color: 0xd0d0e0,
    weapon: 'Rapier',
    stats: { hp: 85, mp: 35, atk: 20, def: 12, spd: 18 },
    passive: 'Extended parry window',
    skills: ['parry', 'dash']
  },
  {
    id: 'hexblade',
    element: 'void',
    name: 'Hexblade',
    description: 'Hybrid melee/magic dark arts',
    color: 0x8020a0,
    weapon: 'Cursed Blade',
    stats: { hp: 90, mp: 60, atk: 18, def: 10, spd: 13 },
    passive: 'Lifesteal on spells',
    skills: ['dark_blast', 'strike']
  }
];
