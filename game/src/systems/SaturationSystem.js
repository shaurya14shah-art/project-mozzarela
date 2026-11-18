// ══════════════════════════════════════════════════════════
// Saturation — the land keeps score
//
// Cast fire in a wood for long enough and it stops being a wood.
// Every cast deposits its element into the ground where it lands.
// A region drifts toward whatever has been done to it, and that
// drift changes what spawns there, what grows there, and what the
// air does to you.
//
// This is the third use of the same rule, and it is what turns the
// map from wallpaper into a resource you cultivate:
//
//   · Need rime reagents? Freeze a valley until it turns.
//   · Volatile ground (opposed elements saturated together) spawns
//     rarer, angrier things and drops better material.
//   · A region saturated with what you are attuned to feels calm.
//     One saturated with your opposite grinds on you.
//
// Nothing here is a build menu. You change the world by playing in it.
// ══════════════════════════════════════════════════════════

import { ELEMENTS } from '../data/constants.js';
import { areOpposed } from '../data/essences.js';
import { eventBus, Events } from '../core/EventBus.js';

export const SATURATION = {
  CELL_SIZE: 96,          // world units per saturation cell
  DEPOSIT_PER_CAST: 1.0,
  DEPOSIT_PER_POTENCY: 0.25,
  DEPOSIT_ON_DETONATE: 6.0,   // a body coming apart dumps what it was

  DECAY_PER_SEC: 0.004,
  TURN_THRESHOLD: 0.45,   // share needed for a region to visibly turn
  SETTLED_AT: 30,         // total deposit before a region counts as changed
};

// What a turned region becomes. Names are the reward for doing it.
export const REGION_CHARACTERS = {
  [ELEMENTS.FIRE]:      { name: 'Cinderlands',   spawnBias: ['dragon', 'golem'],      reagentBias: ['blight_ember', 'ashen_bone'] },
  [ELEMENTS.ICE]:       { name: 'The Rimewaste', spawnBias: ['ice_elemental'],        reagentBias: ['ice_crystal', 'frost_core'] },
  [ELEMENTS.SHADOW]:    { name: 'Umbral Reach',  spawnBias: ['wraith', 'shade', 'vampire'], reagentBias: ['shade_dust', 'wraith_tear'] },
  [ELEMENTS.VOID]:      { name: 'The Unmade',    spawnBias: ['wraith', 'shade'],      reagentBias: ['void_essence', 'rift_shard'] },
  [ELEMENTS.POISON]:    { name: 'The Rot',       spawnBias: ['spider', 'slime'],      reagentBias: ['venom_sac', 'spider_silk'] },
  [ELEMENTS.EARTH]:     { name: 'Stonefold',     spawnBias: ['golem', 'sandworm'],    reagentBias: ['golem_core', 'worm_tooth'] },
  [ELEMENTS.LIGHT]:     { name: 'The Bright',    spawnBias: ['skeleton'],             reagentBias: ['glow_spore', 'spiritwood'] },
  [ELEMENTS.ARCANE]:    { name: 'Runefield',     spawnBias: ['golem', 'wraith'],      reagentBias: ['mana_crystal'] },
  [ELEMENTS.LIGHTNING]: { name: 'The Static',    spawnBias: ['ice_elemental'],        reagentBias: ['charged_quartz'] },
  [ELEMENTS.WIND]:      { name: 'The Keening',   spawnBias: ['shade'],                reagentBias: ['ethereal_plume'] },
  [ELEMENTS.WATER]:     { name: 'The Drowned',   spawnBias: ['slime'],                reagentBias: ['crimson_vial'] },
  [ELEMENTS.NEUTRAL]:   { name: 'Unturned',      spawnBias: [],                       reagentBias: [] },
};

function cellKey(x, z) {
  return `${Math.floor(x / SATURATION.CELL_SIZE)},${Math.floor(z / SATURATION.CELL_SIZE)}`;
}

class SaturationSystem {
  constructor() {
    this.cells = new Map();   // key → { elements:{}, total, character, volatile }
    this._currentKey = null;
  }

  reset() {
    this.cells.clear();
    this._currentKey = null;
  }

  _cell(x, z) {
    const key = cellKey(x, z);
    if (!this.cells.has(key)) {
      this.cells.set(key, { key, elements: {}, total: 0, character: null, volatile: 0 });
    }
    return this.cells.get(key);
  }

  /** Deposit an element into the ground at a position. */
  deposit(position, element, amount = SATURATION.DEPOSIT_PER_CAST) {
    if (!position || !element) return;
    const cell = this._cell(position.x, position.z);
    cell.elements[element] = (cell.elements[element] || 0) + amount;
    cell.total += amount;
    this._reassess(cell);
  }

  /** A cast landing in the world. */
  depositCast(position, spell) {
    if (!spell) return;
    const amount = SATURATION.DEPOSIT_PER_CAST + (spell.potency || 1) * SATURATION.DEPOSIT_PER_POTENCY;
    this.deposit(position, spell.element, amount);
    if (spell.secondaryElement) {
      this.deposit(position, spell.secondaryElement, amount * 0.5);
    }
  }

  /** A composition coming apart dumps what it was made of. */
  depositDetonation(position, element) {
    this.deposit(position, element, SATURATION.DEPOSIT_ON_DETONATE);
  }

  _reassess(cell) {
    const entries = Object.entries(cell.elements).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return;

    const [topEl, topVal] = entries[0];
    const share = topVal / (cell.total || 1);

    // Opposed elements soaked into the same ground make it volatile.
    let volatile = 0;
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        if (areOpposed(entries[i][0], entries[j][0])) {
          volatile += Math.min(entries[i][1], entries[j][1]) / (cell.total || 1) * 2;
        }
      }
    }
    cell.volatile = Math.min(1, volatile);

    const turned = cell.total >= SATURATION.SETTLED_AT && share >= SATURATION.TURN_THRESHOLD;
    const nextChar = turned ? topEl : null;

    if (nextChar !== cell.character) {
      cell.character = nextChar;
      if (nextChar) {
        const c = REGION_CHARACTERS[nextChar];
        eventBus.emit(Events.REGION_SHIFT, { cell, element: nextChar, character: c });
        eventBus.emit(Events.UI_NOTIFY, `The land has turned. This is ${c.name} now.`);
      }
    }
  }

  update(dt) {
    if (!this.cells.size) return;
    for (const cell of this.cells.values()) {
      if (cell.total <= 0) continue;
      const f = 1 - SATURATION.DECAY_PER_SEC * dt;
      let total = 0;
      for (const k of Object.keys(cell.elements)) {
        cell.elements[k] *= f;
        if (cell.elements[k] < 0.1) delete cell.elements[k];
        else total += cell.elements[k];
      }
      cell.total = total;
    }
  }

  /** Report the region the player is standing in, on change. */
  track(position) {
    if (!position) return;
    const key = cellKey(position.x, position.z);
    if (key === this._currentKey) return;
    this._currentKey = key;
    eventBus.emit(Events.REGION_SATURATE, this.readAt(position));
  }

  readAt(position) {
    if (!position) return null;
    const cell = this._cell(position.x, position.z);
    const entries = Object.entries(cell.elements).sort((a, b) => b[1] - a[1]);
    return {
      key: cell.key,
      character: cell.character,
      characterName: cell.character ? REGION_CHARACTERS[cell.character].name : null,
      volatile: cell.volatile,
      total: cell.total,
      progress: Math.min(1, cell.total / SATURATION.SETTLED_AT),
      shares: entries.map(([id, v]) => ({ id, share: v / (cell.total || 1) })),
    };
  }

  /** Spawn table bias for wherever the spawner is working. */
  spawnBiasAt(position) {
    const cell = this._cell(position.x, position.z);
    if (!cell.character) return null;
    const c = REGION_CHARACTERS[cell.character];
    return { types: c.spawnBias, volatile: cell.volatile, element: cell.character };
  }

  /** Extra reagents a turned region gives up. */
  reagentBiasAt(position) {
    const cell = this._cell(position.x, position.z);
    if (!cell.character) return [];
    return REGION_CHARACTERS[cell.character].reagentBias;
  }
}

export const saturation = new SaturationSystem();
