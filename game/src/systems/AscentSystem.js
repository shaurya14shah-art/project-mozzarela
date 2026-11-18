// ══════════════════════════════════════════════════════════
// Ascent — the permanent progression, and the only one that gates
//
// The counterpart to AttunementSystem. That system is a snapshot of
// how you have been playing lately and it DECAYS on purpose; this one
// is a record of what you have survived and it never moves backward.
// Both are needed and neither replaces the other:
//
//   Attunement  → what you are made of RIGHT NOW      (fluid, decays)
//   Ascent      → how far down you have been and returned (permanent)
//
// ── THE ONE RULE THAT MATTERS ─────────────────────────────
// Depth alone never ascends anyone. tryAscend() checks Depth AND a
// cleared Trial, and if only Depth is met it deliberately does
// nothing except emit ASCENT_BLOCKED so the UI can say why. A player
// who grinds skeletons in a field until Depth 500 stays Unproven, and
// the game tells them, in the path's own voice, to go down.
//
// This is the single most likely thing for a future session to
// "helpfully fix" into a plain threshold check. Don't. The refusal is
// the mechanic; see the file header of data/ascent.js.
//
// ── GRANTS ────────────────────────────────────────────────
// Rank grants are cumulative and permanent. They are exposed ONLY
// through grant(key, fallback) — nothing reads `this._tier` and
// branches on it, so adding a rank never means hunting for
// `if (tier >= 3)` scattered across the codebase. Same contract
// AttunementSystem.doctrineEffect() already uses, for the same reason.
//
// ⚠️ Multiplicative grants (manaCostMult, damageMult, instabilityMult,
// surgePower) default to 1 and MULTIPLY as ranks stack; additive ones
// (resistBonus, lifesteal, healPerSec, slotBonus) default to 0 and
// SUM. Getting this backwards silently halves or doubles a build, so
// the kind is declared in GRANT_KINDS rather than inferred from the
// name — 'damageMult' and 'lifesteal' look equally numeric at a call
// site.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';
import {
  UNRANKED, DEPTH_FOR_TIER, TRIALS, ladderFor, rankAt, nextRank, requirementsFor,
} from '../data/ascent.js';

/** How each grant key composes when several ranks provide it. */
const GRANT_KINDS = {
  manaCostMult:    'mult',
  damageMult:      'mult',
  instabilityMult: 'mult',
  surgePower:      'mult',
  resistBonus:     'sum',
  lifesteal:       'sum',
  healPerSec:      'sum',
  slotBonus:       'sum',
  sealAura:        'sum',
  devourAura:      'sum',
};

class AscentSystem {
  constructor() {
    this._pathId = 'hell';
    this._tier = 0;
    // Every Trial ever cleared: {tier, element, descentId, verb}. Kept
    // as a list rather than a count because requirementsFor() asks
    // "any at tier >= N", which a count cannot answer.
    this._trials = [];
    // Recomputed on every rank change rather than on every read — this
    // is queried in the damage path, which runs per hit.
    this._grants = {};
    this._recomputeGrants();
  }

  /**
   * Bind to a path. Called from setPath() at character creation, and
   * never again — the path is the one irreversible choice in the game
   * (see data/paths.js), so a mid-run switch would be re-writing which
   * ladder already-cleared Trials were cleared ON.
   */
  setPath(pathId) {
    if (this._tier > 0 && pathId !== this._pathId) {
      console.warn('[Ascent] path changed after ascending — ranks do not translate between ladders');
    }
    this._pathId = pathId;
    this._recomputeGrants();
    this._emit();
  }

  reset() {
    this._tier = 0;
    this._trials = [];
    this._recomputeGrants();
    this._emit();
  }

  // ── STATE ───────────────────────────────────────────────

  get tier() { return this._tier; }
  get pathId() { return this._pathId; }
  get rank() { return rankAt(this._pathId, this._tier); }
  get ladder() { return ladderFor(this._pathId); }
  get trials() { return this._trials.slice(); }

  /** The Trial verb for this path — 'seal' or 'devour'. */
  get verb() { return TRIALS[this._pathId]?.verb || 'clear'; }

  /**
   * What a Descent of this tier should open at. The tier-5 Ascendant
   * grant weakens Descents by one tier; the Cinderbound equivalent
   * does not, because its grant feeds instead of softening.
   */
  effectiveDescentTier(tier) {
    return Math.max(1, tier - (this.grant('sealAura', 0) > 0 ? 1 : 0));
  }

  // ── TRIALS ──────────────────────────────────────────────

  /**
   * Record a survived Descent. Called by DescentSystem on a successful
   * exit, NOT on entry and not on a death — a Trial is something you
   * came back from.
   *
   * `verb` is what the player actually did down there ('seal' or
   * 'devour'). It is stored rather than assumed, so a Cinderbound who
   * sealed a Descent has a record that proves it and does not get
   * credit toward the Appetite ladder for it.
   */
  recordTrial({ tier, element, descentId, verb }) {
    if (verb !== this.verb) {
      // Not an error and not silent — the player did something real,
      // it just isn't the thing THIS ladder counts.
      eventBus.emit(Events.ASCENT_BLOCKED, {
        reason: 'wrong_verb',
        message: TRIALS[this._pathId]?.failNote || 'That is not how you climb.',
      });
      return false;
    }
    this._trials.push({ tier, element, descentId, verb });
    this._emit();
    return true;
  }

  // ── ASCENSION ───────────────────────────────────────────

  /**
   * Attempt to climb one rank. Safe to call often — it is a pure check
   * plus at most one state change, and DescentSystem calls it on every
   * Descent exit while the HUD calls it opportunistically.
   *
   * @param {number} depth AttunementSystem.totalElement()
   * @returns {object|null} the rank ascended into, or null
   */
  tryAscend(depth) {
    const req = requirementsFor(this._pathId, this._tier, depth, this._trials);
    if (!req) return null; // top of the ladder

    if (!req.depth.met || !req.trial.met) {
      eventBus.emit(Events.ASCENT_BLOCKED, {
        reason: !req.depth.met ? 'depth' : 'trial',
        requirements: req,
        // The two blocks read differently on purpose. Missing Depth is
        // "keep playing"; a missing Trial is "stop doing what you are
        // doing," which is the whole reason this system refuses.
        message: !req.depth.met
          ? `${req.rank.name} is ${Math.ceil(req.depth.need - req.depth.have)} Depth away.`
          : `Depth is not the thing you are short of. ${req.trial.objective}`,
      });
      return null;
    }

    // ⚠️ CONSUME the Trial that paid for this rank, oldest qualifying
    // first. Without this one Trial satisfies every rank forever —
    // see requirementsFor()'s note in data/ascent.js. Stamped BEFORE
    // the tier moves so the record says which rank it bought.
    const paying = this._trials.find(t => !t.spentOn && t.tier >= req.rank.tier);
    if (!paying) {
      // Cannot happen if requirementsFor agrees with us, and if the
      // two ever disagree the ladder must refuse rather than hand out
      // a free rank.
      eventBus.emit(Events.ASCENT_BLOCKED, {
        reason: 'trial', requirements: req,
        message: 'No unspent Trial deep enough for that.',
      });
      return null;
    }
    paying.spentOn = req.rank.tier;

    this._tier = req.rank.tier;
    this._recomputeGrants();
    eventBus.emit(Events.ASCENT_RANK_UP, {
      rank: req.rank,
      tier: this._tier,
      ladder: this.ladder,
      line: req.rank.ascendLine,
    });
    this._emit();
    return req.rank;
  }

  /** Everything blocking the next rank, or null at the top. */
  requirements(depth) {
    return requirementsFor(this._pathId, this._tier, depth, this._trials);
  }

  // ── GRANTS ──────────────────────────────────────────────

  _recomputeGrants() {
    const g = {};
    const ranks = ladderFor(this._pathId).ranks;
    for (let i = 0; i < this._tier; i++) {
      const grant = ranks[i]?.grant;
      if (!grant) continue;
      const kind = GRANT_KINDS[grant.key];
      if (kind === 'mult') g[grant.key] = (g[grant.key] ?? 1) * grant.value;
      else g[grant.key] = (g[grant.key] ?? 0) + grant.value;
    }
    this._grants = g;
  }

  /**
   * Read a grant. Always pass the identity for the key's kind as the
   * fallback (1 for multipliers, 0 for sums) — an unranked player must
   * come back as "no change," not as zero damage.
   */
  grant(key, fallback = 0) {
    return this._grants[key] ?? fallback;
  }

  // ── SNAPSHOT / EVENTS ───────────────────────────────────

  _emit() {
    eventBus.emit(Events.ASCENT_UPDATE, this.snapshot());
  }

  snapshot() {
    return {
      pathId: this._pathId,
      tier: this._tier,
      rank: this.rank,
      ladderTitle: this.ladder.title,
      creed: this.ladder.creed,
      verb: this.verb,
      trialsCleared: this._trials.length,
      trialsUnspent: this._trials.filter(t => !t.spentOn).length,
      next: nextRank(this._pathId, this._tier),
      grants: { ...this._grants },
    };
  }
}

export const ascentSystem = new AscentSystem();
export { UNRANKED, DEPTH_FOR_TIER };
