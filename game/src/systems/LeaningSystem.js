// ══════════════════════════════════════════════════════════
// Leaning — how Ascendant or Cinderbound you actually are
//
// This replaces the class picker. You no longer declare what you are
// at a menu and then spend forty hours being it; you do things, and
// what you are is the readout of what you have done.
//
// ── WHY THIS IS A THIRD SYSTEM AND NOT A FIELD ON ONE OF THE
//    OTHER TWO ─────────────────────────────────────────────
// There are now three questions about the player, and they have three
// genuinely different lifetimes. Collapsing any two of them into one
// number is what made the previous progression illegible:
//
//   Attunement (AttunementSystem)  what element you are made of
//                                  → fluid, DECAYS, follows recent play
//   Leaning    (here)              which philosophy you are enacting
//                                  → drifts, partly permanent
//   Ascent     (AscentSystem)      how far down you have been
//                                  → permanent, never falls
//
// ── HOW IT IS COMPUTED ────────────────────────────────────
// Two halves, deliberately:
//
//   DEEDS    — irreversible acts. Sealing or devouring a Descent, the
//              opening declaration at character creation, the mq7
//              finale choice. These NEVER decay. They are what you
//              chose when it cost something.
//   RESIDUE  — derived live from AttunementSystem's element profile,
//              via each element's path affinity. This DOES decay,
//              because AttunementSystem's residue does. Stop casting
//              fire and you stop reading as Cinderbound.
//
// Deriving the residue half rather than storing it is the important
// part: AttunementSystem is already the authority on "what have you
// been casting," and a second counter incremented in parallel would
// drift out of agreement with it the first time anything touched one
// and not the other. There is exactly one place that knows how much
// fire you have cast, and this is not it.
//
// ── THIS IS THE PLAYER ONLY ───────────────────────────────
// ⚠️ Nothing in this file may ever be consulted for an NPC or an
// enemy. They are regular: an enemy's damage is its type's damage, an
// NPC is an NPC. Every consumer of `damageMultiplier()` and friends
// must be gated on the actor being the player — see the guards at the
// COMBAT_HIT and wand-cast call sites in main.js. A leaning-scaled
// skeleton is a bug, not a feature.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';
import { ELEMENTS } from '../data/constants.js';
import { attunement } from './AttunementSystem.js';

/**
 * Which philosophy each element reads as.
 *
 * Not invented here — this is exactly `favouredElements` from
 * data/paths.js, which has always declared that Heaven favours
 * light/arcane/ice/wind and Hell favours fire/shadow/void/poison. The
 * mapping was already load-bearing for dust drops; this just reads the
 * same truth for a second purpose.
 *
 * water / earth / lightning / neutral are deliberately absent: they
 * belong to neither, and casting them says nothing about you. A
 * lightning-heavy Pioneer should sit near the middle of the bar and
 * genuinely be unaligned, not be quietly shoved one way by a table
 * that felt obliged to have an opinion about everything.
 */
export const ELEMENT_ALIGNMENT = {
  [ELEMENTS.LIGHT]:  +1,
  [ELEMENTS.ARCANE]: +1,
  [ELEMENTS.ICE]:    +1,
  [ELEMENTS.WIND]:   +1,
  [ELEMENTS.FIRE]:   -1,
  [ELEMENTS.SHADOW]: -1,
  [ELEMENTS.VOID]:   -1,
  [ELEMENTS.POISON]: -1,
};

/** How much each irreversible act moves the needle, and forever. */
export const DEED_WEIGHTS = {
  // The opening declaration. Deliberately NOT ±1: picking a path at
  // character creation is a statement of intent, not an identity, and
  // the whole point of this system is that play can prove you wrong
  // about yourself. Seeds the bar near 70/30, reachable back across
  // with roughly four contrary Descents.
  declaration: 0.40,
  // Resolving a Descent. The heaviest ordinary act in the game,
  // because it is the one you had to survive something to make.
  seal: +0.15,
  devour: -0.15,
  // mq7. 'self' pulls toward the middle rather than to a side — the
  // whole content of that ending is refusing both readings.
  finale_aris: +0.30,
  finale_ostra: -0.30,
};

/**
 * How far past the midpoint you must travel before the world agrees
 * you have changed sides.
 *
 * ⚠️ Hysteresis, not a plain `> 0` test. Without it, a Pioneer sitting
 * near the middle re-keys the entire atmosphere — sky, fog, light rig,
 * IBL bake, UI theme — every time a single cast nudges them across
 * zero, which is both a visible strobe and a genuine performance
 * problem (EnvironmentIBL re-bakes on a path change).
 */
const CROSSOVER = 0.08;

class LeaningSystem {
  constructor() {
    this._deeds = 0;      // permanent, −1 Cinderbound … +1 Ascendant
    this._side = 'hell';  // which side the WORLD is currently keyed to
    this._lastEmitted = null;
  }

  reset(declaredPath) {
    this._deeds = declaredPath === 'heaven' ? DEED_WEIGHTS.declaration : -DEED_WEIGHTS.declaration;
    this._side = declaredPath;
    this._emit(true);
  }

  // ── THE NUMBER ──────────────────────────────────────────

  /**
   * The residue half: how aligned your recent casting has been.
   * Derived from AttunementSystem, never stored. Returns −1…+1.
   */
  residueLean() {
    const shares = attunement.elementShares?.() || [];
    if (!shares.length) return 0;
    let sum = 0, weighted = 0;
    // ⚠️ `id`, NOT `element`. AttunementSystem.elementShares() returns
    // `{ id, value, share }`. Destructuring `{ element, share }` here
    // compiles, runs, and yields `undefined` for every entry, so
    // ELEMENT_ALIGNMENT[undefined] is always undefined and this whole
    // half of the system silently contributes exactly zero — forever,
    // with no error. It shipped that way and was caught only by
    // printing the bar before and after a total change of cast
    // element and seeing the percentage not move, while the emergent
    // NAME (which reads dominantElement(), a different accessor) DID
    // change. Same "the numbers must be watched, not the code" rule
    // this project keeps relearning.
    for (const { id, share } of shares) {
      const a = ELEMENT_ALIGNMENT[id];
      // Unaligned elements still count toward the DENOMINATOR. Leaving
      // them out would make a Pioneer who casts 90% lightning and 10%
      // fire read as fully Cinderbound, because fire would be the only
      // aligned thing in the pool. Counting them keeps "mostly casts
      // things with no philosophy" reading as what it is: uncommitted.
      sum += share;
      if (a) weighted += a * share;
    }
    return sum > 0 ? weighted / sum : 0;
  }

  /** −1 (fully Cinderbound) … +1 (fully Ascendant). */
  value() {
    // Deeds weigh more than habits. What you chose under pressure
    // should not be undone by a quarter-hour of casual casting, but it
    // should be reachable by a sustained change in how you fight.
    const v = this._deeds * 0.65 + this.residueLean() * 0.35;
    return Math.max(-1, Math.min(1, v));
  }

  /** 0–100, the share of you that is Ascendant. The bar reads this. */
  ascendantPct() { return Math.round((this.value() + 1) * 50); }
  cinderboundPct() { return 100 - this.ascendantPct(); }

  /** Which side the world is currently keyed to (with hysteresis). */
  get side() { return this._side; }

  /**
   * How committed you are, 0 (dead centre) … 1 (fully one side).
   * Several effects scale on this rather than on the signed value, so
   * that being strongly EITHER thing beats being nothing in
   * particular — which is the same "specialists and generalists
   * genuinely differ" idea AttunementSystem's Depth already encodes.
   */
  conviction() { return Math.abs(this.value()); }

  // ── DEEDS ───────────────────────────────────────────────

  /**
   * Record an irreversible act. Key must exist in DEED_WEIGHTS —
   * an unknown key warns rather than silently doing nothing, because
   * "the deed had no effect" is invisible at the call site.
   */
  recordDeed(key) {
    const w = DEED_WEIGHTS[key];
    if (w === undefined) {
      console.warn(`[Leaning] unknown deed '${key}' — nothing recorded`);
      return;
    }
    this._deeds = Math.max(-1, Math.min(1, this._deeds + w));
    this._checkCrossover();
    this._emit();
  }

  /**
   * Has the player crossed far enough past the middle for the world to
   * re-key? Emits LEANING_CROSSED; main.js is what actually calls
   * setPath() in response.
   *
   * ⚠️ Deliberately does NOT call setPath() itself. paths.js imports
   * AscentSystem and Atmosphere; importing paths.js from here would
   * put a scene-graph-touching module behind a system that main.js
   * constructs early, which is the deferred-init trap this project has
   * hit repeatedly (HANDOFF §3). An event has no import at all.
   */
  _checkCrossover() {
    const v = this.value();
    const want = v > CROSSOVER ? 'heaven' : v < -CROSSOVER ? 'hell' : null;
    if (!want || want === this._side) return;
    const from = this._side;
    this._side = want;
    eventBus.emit(Events.LEANING_CROSSED, {
      from,
      to: want,
      value: v,
      // Said in the voice of the side you have arrived at, not
      // narrated neutrally — this is the world's opinion of you
      // changing, not a status line.
      line: want === 'heaven'
        ? 'Something in the light has stopped flinching when you approach it.'
        : 'The ground stays warm where you have been standing. It did not used to.',
    });
  }

  /**
   * Called each frame. The residue half moves continuously as
   * AttunementSystem decays, so crossover has to be re-checked even
   * when no deed has been done — you can drift across purely by
   * changing what you cast, which is the entire point.
   *
   * Throttled: this is cheap but it runs every frame, and the emit
   * behind it touches the DOM.
   */
  update(dt) {
    this._t = (this._t || 0) + dt;
    if (this._t < 0.25) return;
    this._t = 0;
    this._checkCrossover();
    this._emit();
  }

  // ── WHAT IT CHANGES ─────────────────────────────────────
  //
  // ⚠️ PLAYER ONLY. See the file header. Every one of these is gated
  // at its call site on the actor being the player.

  /**
   * Cinderbound hits harder; Ascendant does not. The Ascendant's
   * return is on the other three methods — cheaper, steadier, safer.
   * Neither is stronger overall, and both beat sitting at 50/50, which
   * is the intended shape.
   */
  damageMultiplier() {
    const v = this.value();
    return v < 0 ? 1 + (-v) * 0.30 : 1;
  }

  /** Ascendant casting is cheaper. Up to −25% at full commitment. */
  manaCostMultiplier() {
    const v = this.value();
    return v > 0 ? 1 - v * 0.25 : 1;
  }

  /**
   * Cinderbound casting is less stable — more power, less control,
   * exactly the trade the two philosophies have been arguing about
   * since mq1. Multiplies AttunementSystem's own instability.
   */
  instabilityMultiplier() {
    const v = this.value();
    return v < 0 ? 1 + (-v) * 0.45 : 1 - v * 0.20;
  }

  /**
   * Ascendant spells reach further and linger; Cinderbound ones are
   * shorter and heavier. Applied to projectile speed/range.
   */
  reachMultiplier() {
    const v = this.value();
    return 1 + v * 0.18;
  }

  /**
   * The colour anything you cast biases toward, as a hex. Used to tint
   * the wand, the viewmodel and impact particles so the bar is
   * legible without looking at the bar.
   */
  tint() {
    const v = this.value();
    if (v > CROSSOVER) return 0xffe9a3;  // the Ascendant's light
    if (v < -CROSSOVER) return 0xff6a35; // the Cinderbound's ember
    return 0xa0968a;                     // uncommitted: neither, and it shows
  }

  /**
   * What the world calls you — the emergent replacement for the class
   * you used to pick from a grid. Reads BOTH axes: how committed you
   * are (this system) and what you are made of (AttunementSystem), so
   * two equally Cinderbound Pioneers who cast different elements are
   * not given the same name.
   */
  calling() {
    const v = this.value();
    const dom = attunement.dominantElement?.();
    const conv = this.conviction();
    if (conv < CROSSOVER) return 'Untried';
    const side = v > 0 ? 'ascendant' : 'cinderbound';
    const NAMES = {
      ascendant: {
        light: 'Lantern-Bearer', arcane: 'Proof-Keeper', ice: 'The Stilled',
        wind: 'Far-Walker', water: 'Tide-Reader', earth: 'Cornerstone',
        lightning: 'Bright Hand', shadow: 'Lamp in the Dark',
        fire: 'Hearthward', void: 'The Undiminished', poison: 'Physician',
      },
      cinderbound: {
        fire: 'Cinderborn', shadow: 'The Unlit', void: 'Hollow-Mouthed',
        poison: 'Slow Hand', earth: 'Grave-Weight', lightning: 'Live Wire',
        water: 'Undertow', ice: 'Killing Frost', wind: 'The Long Exhale',
        light: 'Burnt Offering', arcane: 'The Unfinished',
      },
    };
    // No dominant element yet means nothing has actually been cast —
    // only the opening declaration is on the board. A declaration is
    // not a deed, so it does not earn a name: 'Untried' is the honest
    // answer until the player has done something.
    if (!dom) return 'Untried';
    const base = NAMES[side][dom];
    if (!base) return v > 0 ? 'Of the Ascent' : 'Of the Appetite';
    // Deep commitment earns the definite article. A small thing, but
    // it means the name itself keeps moving instead of locking the
    // moment you first qualify for it.
    return conv > 0.6 ? base : `${base}, lately`;
  }

  // ── SNAPSHOT ────────────────────────────────────────────

  _emit(force = false) {
    const snap = this.snapshot();
    // Only when something actually changed — this runs 4×/second and
    // the listener writes DOM.
    const sig = `${snap.ascendant}|${snap.calling}|${snap.side}`;
    if (!force && sig === this._lastEmitted) return;
    this._lastEmitted = sig;
    eventBus.emit(Events.LEANING_UPDATE, snap);
  }

  snapshot() {
    return {
      value: this.value(),
      ascendant: this.ascendantPct(),
      cinderbound: this.cinderboundPct(),
      side: this._side,
      conviction: this.conviction(),
      calling: this.calling(),
      deeds: this._deeds,
    };
  }
}

export const leaning = new LeaningSystem();
