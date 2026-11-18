// ══════════════════════════════════════════════════════════
// Marks — what surviving a specific thing leaves on you
//
// The FOURTH build knob, and the one this project did not have.
//
// The reference framework's own point: separating "one big
// identity-defining trait" (here: Lineage) from "a pool of small
// flavour traits" (here: Marks) from "active abilities" (Memories)
// from "passive boons" (Echoes) gives four independently tunable
// knobs instead of one generic skill-point pool. Three existed. This
// is the fourth.
//
// ── ⚠️ EARNED BY CIRCUMSTANCE, NEVER BOUGHT ───────────────
// A Mark is not a purchase, a level reward, or a drop. Every one is
// granted by *having survived a specific situation*, and the condition
// is always something the player did rather than something that
// happened to them. That is the entire character of the mechanic: a
// Mark is a scar with a benefit, and reading your list of Marks should
// read as a biography.
//
// This is also why they are deliberately SMALL in isolation. "Shadows
// recognise you as one of their own" is not a stat line; it is a fact
// about you that occasionally decides a fight. Marks that were big
// would just be levels with a story attached.
//
// ── ⚠️ THEY FEED THE SAME FIVE ATTRIBUTES ─────────────────
// Strength, Agility, Vitality, Perception, Willpower — the closed set
// from data/memories.js. A Mark contributes to one of them, so a
// player's attributes are (Memories carried) + (Marks earned) and the
// two systems are legible against each other. Adding a sixth
// attribute here would break that, and the closed set is load-bearing.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';
import { ATTRIBUTES, ATTRIBUTE_IDS } from '../data/memories.js';

/**
 * Every Mark in the game.
 *
 * ⚠️ `test` is a pure predicate over the tracker's own counters. It
 * must not reach into other systems — a Mark that depends on live
 * state elsewhere becomes a Mark that can un-earn itself, and these
 * are permanent by definition.
 */
export const MARKS = [
  // ── Survival ──
  {
    id: 'thin_ice', name: 'Thin Ice', attribute: 'vitality', value: 2,
    how: 'Survive a fight ended below a tenth of your health.',
    line: 'You have been closer than most people ever get. It did not kill you, so it is yours now.',
    test: t => t.survivedAtDeathsDoor >= 1,
  },
  {
    id: 'unbroken', name: 'Unbroken', attribute: 'willpower', value: 3,
    how: 'Clear a Descent without being struck once.',
    line: 'You went down and came back up without paying anything. That is noticed.',
    test: t => t.flawlessDescents >= 1,
  },
  {
    id: 'long_walk', name: 'The Long Walk', attribute: 'vitality', value: 2,
    how: 'Cover five kilometres on foot.',
    line: 'The distance is in your legs now, whether you wanted it there or not.',
    test: t => t.distance >= 5000,
  },
  // ── Violence ──
  {
    id: 'quick_hands', name: 'Quick Hands', attribute: 'agility', value: 2,
    how: 'Kill three things within four seconds of each other.',
    line: 'It happened faster than you decided it should.',
    test: t => t.tripleKill >= 1,
  },
  {
    id: 'giant_killer', name: 'Giant-Killer', attribute: 'strength', value: 3,
    how: 'Kill something five levels above you.',
    line: 'It should have been the other way round. You have stopped assuming it will be.',
    test: t => t.punchedUp >= 1,
  },
  {
    id: 'hundred', name: 'The Hundred', attribute: 'strength', value: 2,
    how: 'Put down a hundred of them.',
    line: 'You stopped counting somewhere in the eighties. Your hands did not.',
    test: t => t.kills >= 100,
  },
  // ── Attention ──
  {
    id: 'far_sighted', name: 'Far-Sighted', attribute: 'perception', value: 2,
    how: 'Find three landmarks.',
    line: 'You have started reading the horizon instead of looking at it.',
    test: t => t.landmarks >= 3,
  },
  {
    id: 'read_the_air', name: 'Reads The Air', attribute: 'perception', value: 3,
    how: 'Stand on volatile ground and live through it ten times.',
    line: 'You can feel where the ground disagrees with itself before you step on it.',
    test: t => t.volatileSurvived >= 10,
  },
  // ── The craft ──
  {
    id: 'first_forging', name: 'First Forging', attribute: 'willpower', value: 1,
    how: 'Forge your first Remnant.',
    line: 'You made something that was not there before, and it has a name.',
    test: t => t.forged >= 1,
  },
  {
    id: 'many_handed', name: 'Many-Handed', attribute: 'perception', value: 2,
    how: 'Forge ten Remnants.',
    line: 'The Loom answers you faster than it used to.',
    test: t => t.forged >= 10,
  },
  {
    id: 'deep_water', name: 'Deep Water', attribute: 'willpower', value: 3,
    how: 'Survive three Descents.',
    line: 'You know what the air down there tastes like. You go back anyway.',
    test: t => t.descents >= 3,
  },
];

class MarkSystem {
  constructor() {
    this.earned = new Map();      // id → mark
    this._t = this._blankTracker();
    this._bound = false;
    this.player = null;
  }

  _blankTracker() {
    return {
      kills: 0, punchedUp: 0, tripleKill: 0,
      survivedAtDeathsDoor: 0, distance: 0,
      landmarks: 0, forged: 0, descents: 0, flawlessDescents: 0,
      volatileSurvived: 0,
    };
  }

  /** ⚠️ Deferred init with an injected player, like every other. */
  init(player) {
    this.player = player;
    if (!this._bound) { this._bind(); this._bound = true; }
    this._emit();
  }

  _bind() {
    let recentKills = [];
    eventBus.on(Events.COMBAT_KILL, ({ enemy }) => {
      this._t.kills++;
      if (enemy && this.player && (enemy.level || 1) >= (this.player.level || 1) + 5) {
        this._t.punchedUp++;
      }
      // Three kills inside four seconds. `performance.now` rather than
      // a frame counter so it means the same thing at any framerate.
      const now = performance.now();
      recentKills = recentKills.filter(t => now - t < 4000);
      recentKills.push(now);
      if (recentKills.length >= 3) { this._t.tripleKill++; recentKills = []; }
      this._check();
    });

    eventBus.on(Events.LANDMARK_DISCOVERED, () => { this._t.landmarks++; this._check(); });
    eventBus.on(Events.MEMORY_FORGED, () => { this._t.forged++; this._check(); });
    eventBus.on(Events.DESCENT_RESOLVED, () => { this._t.descents++; this._check(); });

    // ⚠️ "Survived at death's door" is checked when a fight ENDS, not
    // when HP drops — otherwise standing at 5% health in an empty
    // field earns it, and the Mark is supposed to mean you were there
    // while something was trying to kill you.
    eventBus.on(Events.COMBAT_KILL, () => {
      const p = this.player;
      if (p && p.maxHp && p.hp / p.maxHp <= 0.10) { this._t.survivedAtDeathsDoor++; this._check(); }
    });
  }

  /** Called from the frame loop — distance is the only continuous one. */
  update(dt, moved) {
    if (moved > 0) {
      this._t.distance += moved;
      // Only test on a threshold crossing, not every frame.
      if (Math.floor(this._t.distance / 500) !== this._lastKm) {
        this._lastKm = Math.floor(this._t.distance / 500);
        this._check();
      }
    }
  }

  /** Note a Descent cleared without taking a hit. */
  noteFlawlessDescent() { this._t.flawlessDescents++; this._check(); }
  noteVolatileSurvived() { this._t.volatileSurvived++; this._check(); }

  /**
   * Push the Mark contribution into the player.
   *
   * ⚠️ A published FACTOR, folded by Player.recomputeStats() — which
   * is the single writer of stats.atk. Assigning it here would make
   * gear, levels, awakening and Marks each erase one another, which is
   * the recurring architecture bug this project has now hit three
   * separate times (HANDOFF §0.9).
   */
  _apply() {
    if (!this.player) return;
    const a = this.attributes();
    this.player.markAtk = a.strength * 1.5;
    this.player.recomputeStats?.();
  }

  _check() {
    for (const m of MARKS) {
      if (this.earned.has(m.id)) continue;
      let ok = false;
      try { ok = !!m.test(this._t); } catch { ok = false; }
      if (!ok) continue;
      this.earned.set(m.id, m);
      eventBus.emit(Events.MARK_EARNED, m);
      eventBus.emit(Events.UI_NOTIFY,
        `${m.name} — ${m.line} (+${m.value} ${ATTRIBUTES[m.attribute].name})`);
    }
    this._apply();
    this._emit();
  }

  /** Attribute totals contributed by Marks alone. */
  attributes() {
    const out = {};
    for (const id of ATTRIBUTE_IDS) out[id] = 0;
    for (const m of this.earned.values()) out[m.attribute] += m.value;
    return out;
  }

  has(id) { return this.earned.has(id); }
  get count() { return this.earned.size; }
  get all() { return [...this.earned.values()]; }
  /** Every Mark with whether it is earned — for the codex. */
  roster() {
    return MARKS.map(m => ({ ...m, earned: this.earned.has(m.id) }));
  }

  progress() { return { ...this._t }; }

  reset() {
    this.earned.clear();
    this._t = this._blankTracker();
    this._emit();
  }

  _emit() { eventBus.emit(Events.MARKS_UPDATE, { count: this.earned.size, attributes: this.attributes() }); }
}

export const markSystem = new MarkSystem();
