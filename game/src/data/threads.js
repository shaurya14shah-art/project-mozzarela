// ══════════════════════════════════════════════════════════
// Threads — the dormant thing decided before you started
//
// ── ⚠️ THIS IS NOT A CHARACTER CREATION CHOICE ────────────
// Classes and Paths were both removed from this project for one
// stated reason: they made the player declare an identity at a menu
// before doing anything (§2). A Thread does not repeat that mistake,
// because it is not a choice and it is not visible.
//
// It is ROLLED, once, at the start of a run, and the player is not
// told. Most runs have no Thread at all. A Thread does nothing —
// genuinely nothing, no stat, no line, no icon — until a specific
// late trigger fires, at which point it changes what that character's
// ceiling *is* rather than how fast they got there.
//
// The reference is explicit about the shape: "a dormant trait, nearly
// invisible at low level, that reshapes what their endgame ceiling
// looks like... keep this rare (single-digit %) so it stays special."
//
// ── ⚠️ WHY IT MUST STAY RARE AND SILENT ───────────────────
// The moment a Thread is announced at creation it becomes a build
// choice, and a build choice that does nothing for ten hours is just
// a bad build choice. Its whole value is that it is discovered, late,
// by a player who had no idea it was there — and that most players
// never see one, so the ones who do have something worth talking
// about.
//
// ⚠️ Do NOT "helpfully" surface these in the character sheet, raise
// the odds because testers did not see one, or let a player re-roll
// for a Thread. Every one of those turns it back into a menu.
// ══════════════════════════════════════════════════════════

/** Chance a given run carries any Thread at all. Single digits. */
export const THREAD_CHANCE = 0.06;

export const THREADS = {
  // The reference's own example, kept because it is the cleanest
  // expression of "reshapes the ceiling": almost nobody can hold more
  // than one Core, and this is who can.
  twicewound: {
    id: 'twicewound',
    name: 'Twicewound',
    // Shown ONLY after it fires.
    reveal: 'Something in you was always doubled. It has finally had room to show it.',
    blurb: 'You can hold a second Core. Almost nobody can.',
    // ⚠️ The trigger is a RANK, not a level or a play-time. Rank is
    // the axis grinding cannot buy, so a Thread cannot be farmed into.
    triggerRank: 3,
    effect: 'secondCore',
  },

  hollowthread: {
    id: 'hollowthread',
    name: 'Hollowthread',
    reveal: 'The Fracture has stopped treating you as something separate from it.',
    blurb: 'Descents open one tier weaker for you, and pay as though they had not.',
    triggerRank: 3,
    effect: 'softDescents',
  },

  longmemory: {
    id: 'longmemory',
    name: 'Long Remnant',
    reveal: 'You are remembering things that have not happened to you yet.',
    blurb: 'Every Remnant you forge carries one more Facet than its grade allows.',
    triggerRank: 3,
    effect: 'extraAspect',
  },

  unspent: {
    id: 'unspent',
    name: 'The Unspent',
    reveal: 'You have been saving something without knowing you were saving it.',
    blurb: 'Your Core keeps its Quality one Rank above your own.',
    triggerRank: 4,
    effect: 'coreOverrank',
  },
};

export const THREAD_IDS = Object.keys(THREADS);

/**
 * Roll a run's Thread. Almost always null.
 *
 * ⚠️ Takes an explicit `rng` so tests can force one. Production passes
 * nothing and gets Math.random — but a system that can only be
 * verified 6% of the time is a system that does not get verified, and
 * this one has a trigger that fires hours after the roll.
 */
export function rollThread(rng = Math.random) {
  if (rng() > THREAD_CHANCE) return null;
  const ids = THREAD_IDS;
  return THREADS[ids[Math.floor(rng() * ids.length)]] || null;
}
