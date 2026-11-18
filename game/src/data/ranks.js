// ══════════════════════════════════════════════════════════
// Rank — the qualitative axis, and the rule that makes it one
//
// ── THE PROBLEM THIS FIXES ────────────────────────────────
// This project already had the reference framework's two axes:
//
//   Rank  = AscentSystem.tier   rare, Trial-gated, 5 steps
//   Class = ProgressSystem.level grindable, unbounded
//
// ...and the split did nothing, because Rank's grants were flat and
// small (+8% damage, −8% mana) while Class was unbounded. A level-40
// Unproven simply beat a level-8 Sovereign. When the cheap axis can
// substitute for the expensive one, there is only one axis.
//
// ── THE TWO RULES ─────────────────────────────────────────
// 1. **The curve is CONVEX.** Rank power is not +N% per step, it is a
//    multiplying ladder — the gap between the top two ranks dwarfs the
//    gap between the bottom two. Flat per-rank bonuses are exactly
//    what the reference warns against.
//
// 2. **THE REFUSAL.** Convexity alone is not enough: a big enough
//    Class advantage still eventually out-multiplies it. So a hard,
//    non-negotiable cap sits on top — an attacker two or more Ranks
//    below its target cannot deal more than a fixed fraction of that
//    target's maximum health per hit, no matter what its numbers say.
//
//    ⚠️ This is a CAP, not a multiplier, and that distinction is the
//    entire mechanic. A multiplier can be out-scaled by grinding; a
//    cap cannot. It is the only thing in the game that grinding does
//    not eventually solve, which is precisely what makes Rank mean
//    something.
//
//    ⚠️ It is deliberately NOT immunity. Capped damage is still real
//    damage, so an underranked player who fights well — terrain,
//    ambush, debuffs, a long war of attrition — can still win. The
//    reference is explicit that the path to victory should be
//    asymmetric play, not "impossible".
// ══════════════════════════════════════════════════════════

/**
 * What each Rank is worth, multiplicatively.
 *
 * ⚠️ CONVEX. Index is the Rank (AscentSystem.tier, 0..5). Ratios
 * between adjacent entries widen as you climb: 2.2x, 2.3x, 2.4x,
 * 2.5x, 2.7x. A Rank 5 is ~80x a Rank 0, not 5x.
 *
 * ⚠️ Index 0 MUST be 1. Everything is expressed as a ratio against
 * this, and an unranked player has to come back as "no change".
 */
export const RANK_POWER = [1, 2.2, 5.0, 12.0, 30.0, 80.0];

/** Display names, shared by players and creatures — see below. */
export const RANK_NAMES = ['Unproven', 'Kindled', 'Tempered', 'Marked', 'Ascendant', 'Sovereign'];

export const MAX_RANK = RANK_POWER.length - 1;

export function rankPower(rank) {
  return RANK_POWER[Math.max(0, Math.min(MAX_RANK, Math.round(rank || 0)))];
}

export function rankName(rank) {
  return RANK_NAMES[Math.max(0, Math.min(MAX_RANK, Math.round(rank || 0)))] || 'Unproven';
}

// ── THE REFUSAL ───────────────────────────────────────────
// How much of a target's MAXIMUM health one hit may take when the
// attacker is this many Ranks below it. Index is the gap size − 2, so
// [0] is a two-Rank deficit.
//
// ⚠️ A two-Rank gap still permits ~57 hits to kill (1.75% each). It is
// brutal and it is survivable, which is the intent — the fight becomes
// a genuine siege rather than an error message.
const REFUSAL_CAP = [0.0175, 0.008, 0.0035, 0.0015];

/** Two Ranks below is where the cap starts biting. */
export const REFUSAL_GAP = 2;

/**
 * The damage one thing does to another, given both Ranks.
 *
 * @returns {{mult:number, capFraction:number|null, gap:number}}
 *   `mult` scales the damage. `capFraction`, when not null, is a HARD
 *   ceiling expressed as a fraction of the DEFENDER's max health — the
 *   caller must apply it after all its own multipliers, or the cap is
 *   just a suggestion.
 */
export function rankMatchup(attackerRank, defenderRank) {
  const a = Math.max(0, Math.min(MAX_RANK, Math.round(attackerRank || 0)));
  const d = Math.max(0, Math.min(MAX_RANK, Math.round(defenderRank || 0)));
  const gap = a - d;

  // Same Rank: nothing happens. ⚠️ This must stay exactly 1 — most
  // fights in the game are same-Rank, and this function running on
  // every hit means any drift here silently re-balances everything.
  if (gap === 0) return { mult: 1, capFraction: null, gap };

  const ratio = rankPower(a) / rankPower(d);

  if (gap > 0) {
    // Punching DOWN. Softened with a root so a Sovereign is
    // overwhelming against a Rank 1 rather than deleting the concept
    // of a fight — 80x raw becomes ~9x.
    return { mult: Math.min(12, Math.sqrt(ratio)), capFraction: null, gap };
  }

  // Punching UP.
  const mult = Math.max(0.05, Math.sqrt(ratio));
  const deficit = -gap;
  const capFraction = deficit >= REFUSAL_GAP
    ? (REFUSAL_CAP[Math.min(REFUSAL_CAP.length - 1, deficit - REFUSAL_GAP)])
    : null;
  return { mult, capFraction, gap };
}

/**
 * A creature's Rank, from the level it was forged at.
 *
 * ⚠️ ONE ladder for players and creatures, under one set of names.
 * The reference is explicit about this: reusing the same axis lets a
 * player eyeball relative danger with a single mental model instead of
 * translating between two scales.
 */
export function rankForLevel(level) {
  const l = level || 1;
  if (l >= 60) return 5;
  if (l >= 40) return 4;
  if (l >= 26) return 3;
  if (l >= 15) return 2;
  if (l >= 7) return 1;
  return 0;
}
