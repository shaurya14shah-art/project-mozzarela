// ══════════════════════════════════════════════════════════
// Item Generator — Procedural RPG Item Creation
// ══════════════════════════════════════════════════════════

import { MATERIAL_TIERS } from '../data/constants.js';

// ⚠️ { label, type } pairs, NOT bare display strings.
//
// These used to be Capitalised display names ('Sword', 'Dual Blades')
// that were written straight into the item's `weaponType`. EntityForge
// keys WEAPON_PLANS lowercase and falls back to the sword when a key
// misses — so every procedurally generated weapon in the game forged a
// SWORD mesh, including the bows and grimoires, silently, forever.
// The name the player reads and the key the forge looks up are now two
// separate fields, which is the only way they cannot drift apart.
const WEAPON_TYPES = [
  { label: 'Sword',       type: 'sword' },
  { label: 'Axe',         type: 'axe' },
  { label: 'Staff',       type: 'staff' },
  { label: 'Dagger',      type: 'dagger' },
  { label: 'Bow',         type: 'bow' },
  { label: 'Spear',       type: 'spear' },
  { label: 'Greatsword',  type: 'greatsword' },
  { label: 'Dual Blades', type: 'dualblades' },
  { label: 'Grimoire',    type: 'grimoire' },
  { label: 'Warhammer',   type: 'warhammer' },
  { label: 'Scythe',      type: 'scythe' },
];
const PREFIXES = ['Rusty', 'Iron', 'Steel', 'Mithril', 'Astral', 'Divine', 'Primordial', 'Void-Touched', 'Blighted', 'Celestial', 'Titanic'];
const SUFFIXES = [
  'of the Bear', 'of Swiftness', 'of the Void', 'of Light', 'of Agony', 
  'of the Phoenix', 'of the Deep', 'of Eternal Frost', 'of Thunder', 
  'of the Labyrinth', 'of the Star-King'
];

export class ItemGenerator {
  static generateWeapon(tierLevel, element = null) {
    // 1. Determine base stats scaling by tier
    const minDmg = tierLevel * 5;
    const maxDmg = tierLevel * 10;
    const damage = Math.floor(Math.random() * (maxDmg - minDmg + 1)) + minDmg;

    // 2. Select Type
    const pick = WEAPON_TYPES[Math.floor(Math.random() * WEAPON_TYPES.length)];
    const type = pick.label;

    // 3. Procedural Name
    // A Tier 1 might be "Rusty Sword". Tier 5 "Divine Axe of Light"
    const prefixIndex = Math.min(tierLevel, PREFIXES.length - 1);
    const prefix = PREFIXES[prefixIndex];
    let name = `${prefix} ${type}`;
    
    // Add suffix chance based on tier
    if (Math.random() < 0.2 * tierLevel) {
       name += ` ${SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)]}`;
    }

    // 4. Resolve Tier Object
    const itemTier = Object.values(MATERIAL_TIERS).find(t => t.level === tierLevel) || MATERIAL_TIERS.COMMON;

    return {
      id: `wep_${Math.random().toString(36).slice(2)}`,
      name: name,
      icon: this._getIconForWeapon(type),
      type: 'weapon',
      weaponType: pick.type,
      tier: itemTier,
      stats: {
        attack: damage,
        speed: 1.0 + (Math.random() * 0.5 - 0.25) // 0.75 - 1.25
      },
      element: element || 'neutral',
      description: `A formidable weapon forged from tier ${tierLevel} materials. Deals ${damage} ${element || 'physical'} damage.`
    };
  }

  static _getIconForWeapon(type) {
    switch (type) {
      case 'Sword': return '🗡️';
      case 'Axe': return '🪓';
      case 'Staff': return '🪄';
      case 'Dagger': return '🔪';
      case 'Bow': return '🏹';
      case 'Spear': return '🔱';
      case 'Greatsword': return '🗡️';
      case 'Dual Blades': return '⚔️';
      case 'Grimoire': return '📖';
      case 'Warhammer': return '🔨';
      case 'Scythe': return '🌾';
      default: return '⚔️';
    }
  }
}
