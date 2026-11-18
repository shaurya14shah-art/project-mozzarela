// ══════════════════════════════════════════════════════════
// The Ascent — the ladder you climb by surviving, not by grinding
//
// AttunementSystem already answers "what are you made of." It has no
// opinion on "how far have you come," and deliberately so: residue
// decays, so it is a snapshot of recent play, not a record. That is
// the right model for a build and the wrong model for a story — after
// forty hours the world still spoke to the player exactly as it did in
// the first ten.
//
// The Ascent is the permanent half. It never decays, it never falls,
// and it does NOT move on accumulation alone: every rank needs Depth
// (which you get by playing) AND a Trial (which you get by going down
// into a Descent and coming back up). Standing in a field killing
// skeletons forever will park you one point below a threshold that
// never opens. That refusal is the whole point — see TRIALS below.
//
// ── THE TWO LADDERS DIVERGE ───────────────────────────────
//
// The Ascendant and the Cinderbound do not climb the same ladder with
// different paint. They climb toward opposite ends:
//
//   Ascendant  — the Ladder of Refinement. Every rank is a subtraction:
//                you burn off what isn't you until what's left can be
//                pointed at the wound. Trials are SEALED — you close
//                the Descent behind you.
//   Cinderbound — the Ladder of Appetite. Every rank is an addition:
//                you take the Descent into yourself and carry it.
//                Trials are DEVOURED — you leave the Descent open and
//                walk out wearing it.
//
// Same dungeons. Opposite win conditions. Opposite rewards. The tier-5
// rank shares a NAME on both ladders ("Sovereign") and means two
// incompatible things, which is the most compact way to say that both
// philosophies think they win.
//
// ── VOCABULARY ────────────────────────────────────────────
// Original throughout, in the same register as Pioneer/Fracture/
// Doctrine/Saturation (see HANDOFF §2). Nothing here is lifted:
//   Descent  — a bounded element-typed dungeon you go down into
//   Remnant  — gear that crystallises out of a survived Descent
//   Revenant — the shade of a named thing you killed down there
//   Epithet  — what the world starts calling you after a defining act
//   Facet    — the ability an Epithet carries
// ══════════════════════════════════════════════════════════

/**
 * Rank 0 is not on either ladder. Everyone starts here, and the world
 * addresses you as nobody until you have been down once.
 */
export const UNRANKED = {
  tier: 0,
  id: 'unproven',
  name: 'Unproven',
  short: 'Unproven',
  blurb: 'You have not been down. Whatever you are made of, the Fracture has not yet asked.',
};

/**
 * Depth required at each tier, indexed `tier - 1` — so tier 1 needs
 * DEPTH_FOR_TIER[0] = 40.
 *
 * ⚠️ The first four values are AttunementSystem's DEPTH_FOR_SLOT ladder
 * minus its leading zero, on purpose: hitting a wand slot and standing
 * at the door of a rank is the same moment, so one number in the HUD
 * explains both. Tier 5 (700) is past the end of the slot ladder,
 * which is stated rather than hidden — there is no sixth wand slot to
 * align with, and inventing one to preserve the symmetry would be
 * tail-wagging.
 *
 * ⚠️ Written [40, 110, ...] and NOT [0, 40, 110, ...]. The leading-zero
 * form (mirroring DEPTH_FOR_SLOT exactly) shipped first and made tier 1
 * cost zero Depth, so the very first rank was purely Trial-gated while
 * every rank above it was gated on both. It read as correct — the array
 * matched the one it was harmonised with — and was caught only by
 * printing requirementsFor()'s actual output, which said `need: 0`.
 */
export const DEPTH_FOR_TIER = [40, 110, 240, 430, 700];

/**
 * What each tier's Trial demands, per path.
 *
 * `element` is null at every tier here — the Trial is satisfied by ANY
 * Descent of the right tier, in any element. Locking a rank behind one
 * specific element would make the ladder a checklist of dungeons
 * instead of a record of what you chose to walk into.
 */
export const TRIALS = {
  heaven: {
    verb: 'seal',
    // What the Descent's exit looks like on this path. Read by
    // DescentSystem to pick a win condition and by the UI for copy.
    objective: 'Seal the Descent behind you.',
    failNote: 'A Descent left open is not a rank. Go back down.',
  },
  hell: {
    verb: 'devour',
    objective: 'Take the Descent into yourself and leave it open.',
    failNote: 'You closed it. Nothing that closes feeds you. Go back down.',
  },
};

/**
 * The ladders. Five ranks each, both keyed by the same tier index so
 * everything downstream (UI, gating, save data) can compare tiers
 * across paths without a translation table.
 *
 * `grant` is the permanent, never-decaying reward — deliberately small
 * per rank and deliberately DIFFERENT in kind between the two ladders.
 * Refinement grants control (less cost, less instability, more
 * certainty); Appetite grants reach (more damage, more capacity, more
 * volatility). A Cinderbound at tier 5 is genuinely more dangerous and
 * genuinely less safe than an Ascendant at tier 5, which is what the
 * two philosophies have been claiming about each other since mq1.
 */
export const LADDERS = {
  heaven: {
    id: 'heaven',
    title: 'The Ladder of Refinement',
    creed: 'Every rank is a subtraction.',
    ranks: [
      {
        tier: 1, id: 'kindled', name: 'Kindled',
        blurb: 'Something in you took. It is small and it is steady and it is yours.',
        ascendLine: 'The Descent closes behind you. The quiet afterwards is the first thing you have earned.',
        grant: { key: 'manaCostMult', value: 0.92, desc: '-8% mana cost on everything you cast.' },
      },
      {
        tier: 2, id: 'tempered', name: 'Tempered',
        blurb: 'You have been held at heat long enough to stop cracking under it.',
        ascendLine: 'You come up thinner than you went down, and harder for it.',
        grant: { key: 'instabilityMult', value: 0.85, desc: '-15% instability. Your own casts surge less.' },
      },
      {
        tier: 3, id: 'hallowed', name: 'Hallowed',
        blurb: 'The Doctrine has a word for people like you and uses it carefully.',
        ascendLine: 'Three Descents sealed. The Sanctuary writes your name down somewhere you will never see.',
        grant: { key: 'resistBonus', value: 0.08, desc: '+8% resistance to everything, permanently.' },
      },
      {
        tier: 4, id: 'radiant', name: 'Radiant',
        blurb: 'You are hard to look at directly, and people have started standing further away.',
        ascendLine: 'The wound you sealed does not reopen. Nothing you seal does, now.',
        grant: { key: 'healPerSec', value: 0.9, desc: 'Regenerate health continuously, in and out of combat.' },
      },
      {
        tier: 5, id: 'sovereign_closing', name: 'Sovereign of the Closing',
        blurb: 'Whatever the Fracture is, it is now something that happens near you rather than to you.',
        ascendLine: 'Five sealed. Aris was right, or you have made her right, and there was never a difference.',
        grant: { key: 'sealAura', value: 1, desc: 'Descents you enter open one tier weaker. The wound flinches.' },
      },
    ],
  },

  hell: {
    id: 'hell',
    title: 'The Ladder of Appetite',
    creed: 'Every rank is an addition.',
    ranks: [
      {
        tier: 1, id: 'ashmarked', name: 'Ashmarked',
        blurb: 'You came up carrying something that was not yours going down.',
        ascendLine: 'The Descent stays open. You can feel it behind you, and you do not turn around.',
        grant: { key: 'damageMult', value: 1.08, desc: '+8% damage on everything you cast or swing.' },
      },
      {
        tier: 2, id: 'sated', name: 'Sated',
        blurb: 'For the first time since you were made a Pioneer, you are not hungry. It will not last.',
        ascendLine: 'Two open behind you. You have stopped counting them as places and started counting them as meals.',
        grant: { key: 'lifesteal', value: 0.08, desc: 'Every hit you land returns 8% of the damage as health.' },
      },
      {
        tier: 3, id: 'blackened', name: 'Blackened',
        blurb: 'The Doctrine has a word for people like you too. It does not use it to your face.',
        ascendLine: 'Three open. Ostra would recognise this. That is not comforting.',
        grant: { key: 'slotBonus', value: 1, desc: '+1 wand slot, permanently, regardless of Depth.' },
      },
      {
        tier: 4, id: 'ruinous', name: 'Ruinous',
        blurb: 'Ground stays wrong where you have stood. Nobody has told you this.',
        ascendLine: 'What you took at the fourth is not a power. It is a tenant.',
        grant: { key: 'surgePower', value: 1.35, desc: 'Your surges hit 35% harder — and you surge more often.' },
      },
      {
        tier: 5, id: 'sovereign_door', name: 'Sovereign of the Open Door',
        blurb: 'You are no longer entirely on this side of it, and the view is better from here.',
        ascendLine: 'Five open, and the fifth did not resist. Something past the edge has decided you are useful.',
        grant: { key: 'devourAura', value: 1, desc: 'Enemies that die near you feed the Descent, and the Descent feeds you.' },
      },
    ],
  },
};

/** Every rank on a path, tier 1 upward. */
export function ladderFor(pathId) {
  return LADDERS[pathId] || LADDERS.hell;
}

/** The rank object at a tier on a path — UNRANKED for tier 0. */
export function rankAt(pathId, tier) {
  if (tier <= 0) return UNRANKED;
  return ladderFor(pathId).ranks[tier - 1] || UNRANKED;
}

/** The rank one above the current one, or null at the top of a ladder. */
export function nextRank(pathId, tier) {
  return ladderFor(pathId).ranks[tier] || null;
}

/**
 * Everything standing between the player and the next rank, as data
 * rather than prose — so the UI can say "you need 40 more Depth AND a
 * Tier II Descent" instead of a single unhelpful "not yet."
 *
 * Returns null at the top of the ladder.
 */
export function requirementsFor(pathId, tier, depth, trialsCleared) {
  const next = nextRank(pathId, tier);
  if (!next) return null;
  // Indexed tier-1; see DEPTH_FOR_TIER's ⚠️ on why this is not the
  // leading-zero form it looks like it should be.
  const depthNeeded = DEPTH_FOR_TIER[next.tier - 1] ?? Infinity;
  return {
    rank: next,
    depth: { have: depth, need: depthNeeded, met: depth >= depthNeeded },
    trial: {
      // One cleared Trial per tier, at that tier or deeper.
      //
      // ⚠️ `!t.spentOn` IS THE RULE. This comment already said "it
      // satisfies THIS rank and no other, or a single lucky delve
      // would carry someone to the top of the ladder" — and the code
      // underneath it did exactly the thing the comment forbids,
      // because `some(t => t.tier >= next.tier)` is true for EVERY
      // rank once you hold one deep Trial.
      //
      // Demonstrated: one recorded tier-5 Trial plus a spammed
      // tryAscend() took a Rank 0 player to **Rank 5** in one call
      // stack. Depth is grindable, so that reduced the entire Ascent
      // to "clear one deep Descent" — and it defeated the whole
      // Rank-vs-Class separation in data/ranks.js, since Rank was
      // suddenly purchasable with the cheap axis after all.
      //
      // A Trial is now CONSUMED by the rank it buys (AscentSystem
      // stamps `spentOn`), so five ranks need five Trials.
      have: trialsCleared.filter(t => !t.spentOn && t.tier >= next.tier).length,
      need: 1,
      met: trialsCleared.some(t => !t.spentOn && t.tier >= next.tier),
      verb: TRIALS[pathId]?.verb || 'clear',
      objective: TRIALS[pathId]?.objective || '',
    },
  };
}
