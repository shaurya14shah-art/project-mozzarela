// ══════════════════════════════════════════════════════════
// The Core — the fuel tank, kept separate from the techniques
//
// ── WHY THIS IS NOT JUST MORE MANA ────────────────────────
// The reference framework's point: separate *how much power you can
// hold and put out* from *what you can do with it*. A big tank with
// crude techniques and a small tank with masterful ones should not
// feel like the same character with different numbers.
//
// So the Core has TWO independent properties, fed by the two axes
// this project already has, and they do different jobs:
//
//   CAPACITY  how much Essence you hold  ← Class  (grindable, level)
//   QUALITY   what that Essence is worth ← Rank   (rare, the Ascent)
//
// ⚠️ That split is the whole file. Capacity is volume; Quality is
// grade. Grinding levels gives you a bigger reservoir of *cheap*
// Essence — it never makes the Essence better. That is the same
// refusal `data/ranks.js` enforces on damage, expressed on the
// resource instead, and it is why a maxed-Class low-Rank player reads
// as "lots of weak" rather than "nearly as good".
//
// ── ⚠️ THIS DOES NOT REPLACE MANA ─────────────────────────
// Mana fuels Weaves (the wand). Essence fuels a Memory's Aspects.
// Two pools with two jobs, deliberately — collapsing them would put
// the whole game back on one resource and undo the split this file
// exists to make.
//
// ── SECOND CORE ───────────────────────────────────────────
// Almost nobody forms more than one. A Threadbound player (see
// data/threads.js) can form a second at high Rank, and it is a
// categorical change rather than "+100% capacity" — the second core
// has its own Quality, so it raises the CEILING of what you can
// express rather than the amount.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';
import { rankPower, rankName, MAX_RANK } from '../data/ranks.js';
import { threadSystem } from './ThreadSystem.js';

const BASE_CAPACITY = 40;
const CAPACITY_PER_LEVEL = 6;
/** Essence returned per second, as a fraction of capacity. */
const REGEN_FRACTION = 0.055;

/**
 * What a Core's Quality is worth at each Rank.
 *
 * ⚠️ Convex, and deliberately GENTLER than RANK_POWER. Rank already
 * multiplies damage hard; if it multiplied resource value on the same
 * curve the two would compound into something absurd. This is the
 * square root of the power curve, which keeps the direction (Rank
 * matters, Class cannot buy it) without stacking two exponentials.
 */
function qualityFor(rank) {
  return Math.sqrt(rankPower(rank));
}

class CoreSystem {
  constructor() {
    this.player = null;
    this._ascent = null;
    this._progress = null;
    this._essence = BASE_CAPACITY;
    /** Cores formed. Almost everyone lives and dies with one. */
    this.cores = 1;
    this._bound = false;
  }

  /** ⚠️ Deferred init, injected deps — same contract as the rest. */
  init({ player, ascent, progress } = {}) {
    this.player = player;
    this._ascent = ascent || null;
    this._progress = progress || null;
    this.essence = this.capacity;
    if (!this._bound) { this._bind(); this._bound = true; }
    this._emit();
  }

  _bind() {
    // Ranking up does not refill the tank, it makes what is in it
    // worth more. Emitting on rank change keeps the readout honest.
    eventBus.on(Events.ASCENT_RANK_UP, () => this._emit());
    eventBus.on(Events.PLAYER_LEVEL_UP, () => {
      // A bigger tank arrives full — the level-up already restores
      // vitals, and a new reservoir that starts empty reads as a
      // punishment for levelling.
      this.essence = this.capacity;
      this._emit();
    });
  }

  // ── THE TWO PROPERTIES ──────────────────────────────────

  // ══════════════════════════════════════════════════════
  // ⚠️ ESSENCE IS FOCUS. Owner: "resources unclear" — mana fuelled the
  // wand, Essence fuelled a Remnant's Aspects, and the player could not
  // tell which was stopping what. They are ONE pool now, stored on
  // `player.mp` (shown as Focus). Every caller of essence / capacity /
  // spend / restore keeps working; they just draw on the same well.
  // ══════════════════════════════════════════════════════
  get essence() { return this.player ? this.player.mp : this._essence; }
  set essence(v) { if (this.player) this.player.mp = Math.max(0, Math.min(this.player.maxMp, v)); else this._essence = v; }

  get rank() { return this._ascent?.tier ?? 0; }

  /** VOLUME. Grindable. This is what Class buys. */
  get capacity() {
    if (this.player) return this.player.maxMp;
    const level = this.player?.level || 1;
    const perCore = BASE_CAPACITY + (level - 1) * CAPACITY_PER_LEVEL;
    return Math.round(perCore * this.cores);
  }

  /** GRADE. Rare. This is what Rank buys, and Class never can. */
  get quality() {
    // The Unspent (a Thread) keeps the Core one Rank ahead of its
    // owner. Pulled, not pushed — see ThreadSystem.grant().
    const effective = threadSystem.grant('coreOverrank')
      ? Math.min(MAX_RANK, this.rank + 1)
      : this.rank;
    return qualityFor(effective);
  }

  get fraction() { return this.capacity ? this.essence / this.capacity : 0; }

  /**
   * What a technique of `base` strength actually produces, once this
   * Core has pushed it through.
   *
   * ⚠️ The ONE place Quality is applied. A second call site would make
   * Rank compound with itself, which is exactly the kind of silent
   * double-application this project keeps documenting.
   */
  output(base) {
    return (base || 0) * this.quality;
  }

  // ── SPENDING ────────────────────────────────────────────

  /**
   * ⚠️ Costs are SANITISED, not trusted.
   * `spend(-1000)` used to pass the `essence < cost` check trivially
   * and then subtract a negative — granting 1000 free Essence
   * (measured: 40 → 1040). Any cost derived from a subtraction, a
   * multiplier, or a UI field can go negative or NaN, and this is the
   * resource that fuels every Aspect in the game.
   */
  _validCost(cost) {
    const n = Number(cost);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  canAfford(cost) { return this.essence >= this._validCost(cost); }

  /** Take Essence. Returns false and spends nothing if short. */
  spend(cost) {
    const n = this._validCost(cost);
    if (n <= 0) return false;          // nothing to pay is not a payment
    if (this.essence < n) {
      eventBus.emit(Events.COMBAT_LOG, { text: `Not enough Focus — ${Math.ceil(n)} needed, ${Math.floor(this.essence)} left.`, kind: 'warn' });
      return false;
    }
    this.essence -= n;
    this._emit();
    return true;
  }

  /**
   * How much faster Essence comes back than baseline.
   *
   * ⚠️ Kindled (+30%) from the First Nightmare. `innateEssenceMult` was
   * written by `NightmareSystem._applyInnate` and read by NOTHING —
   * one of six inert innate grants, see Player.recomputeStats' header.
   * ⚠️ Read from the player at the point of use rather than assigned
   * onto this system, so there is still exactly one writer of the
   * field and no expiry path that has to "put it back" (trap #9).
   * ⚠️ Guarded with Number.isFinite: a NaN here would poison `essence`
   * permanently, and a NaN pool passes every "can you afford it" test
   * and fails every clamp (trap #20).
   */
  _gainMult() {
    const m = this.player?.innateEssenceMult;
    return Number.isFinite(m) && m > 0 ? m : 1;
  }

  restore(amount) {
    const n = this._validCost(amount) * this._gainMult();
    if (!n) return;
    // ⚠️ Clamped at BOTH ends. The upper clamp was already here; the
    // lower one stops a negative restore draining the pool.
    this.essence = Math.max(0, Math.min(this.capacity, this.essence + n));
    this._emit();
  }

  update(dt) {
    // Regeneration is the player's now (Focus = mp, see the getter).
    if (this.player) { const pct = Math.floor(this.fraction * 50); if (pct !== this._lastPct) { this._lastPct = pct; this._emit(); } return; }
    if (this.essence >= this.capacity) return;
    // Regen scales with capacity, so a bigger tank does not take
    // proportionally longer to fill — otherwise levelling would make
    // the resource feel worse.
    this.essence = Math.min(this.capacity,
      this.essence + this.capacity * REGEN_FRACTION * this._gainMult() * dt);
    // ⚠️ Emitting every frame would repaint the HUD every frame for a
    // bar that moves slowly. Only on a visible step.
    const pct = Math.floor(this.fraction * 50);
    if (pct !== this._lastPct) { this._lastPct = pct; this._emit(); }
  }

  // ── SECOND CORE ─────────────────────────────────────────

  /**
   * Form another Core. Threadbound only, and only at Rank 3+.
   *
   * ⚠️ Gated on the Thread rather than on anything grindable, because
   * the whole point of the Threadbound layer is a ceiling that a
   * player without it can never reach by playing longer.
   */
  formSecondCore(reason = '') {
    if (this.cores >= 2) return false;
    if (this.rank < 3) return false;
    this.cores = 2;
    this.essence = this.capacity;
    eventBus.emit(Events.CORE_FORMED, { cores: this.cores, reason });
    eventBus.emit(Events.UI_NOTIFY,
      'A second Core has settled behind the first. Nothing you have felt before has room like this.');
    this._emit();
    return true;
  }

  reset() {
    this.cores = 1;
    this.essence = this.capacity;
    this._emit();
  }

  _emit() { eventBus.emit(Events.CORE_UPDATE, this.snapshot()); }

  snapshot() {
    return {
      essence: Math.round(this.essence),
      capacity: this.capacity,
      fraction: this.fraction,
      quality: +this.quality.toFixed(2),
      rank: this.rank,
      rankName: rankName(this.rank),
      cores: this.cores,
      maxRank: MAX_RANK,
    };
  }
}

export const coreSystem = new CoreSystem();
