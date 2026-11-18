// ══════════════════════════════════════════════════════════
// EPITHETS — a name the world gives you for something you did
//
// ── WHY THIS EXISTS ───────────────────────────────────────
// HANDOFF §7 listed this as "designed in the archive, never built —
// the natural companion to Echoes and Memories," and it is the piece
// that makes the other progression systems *mean* something socially.
// Every other ladder in this game answers a question about numbers.
// An Epithet answers "what do people call you, and why."
//
// ── HOW IT DIFFERS FROM A MARK ────────────────────────────
// A Mark is small, private and cumulative — a biography written in
// attributes (MarkSystem's own header). An Epithet is LOUD: you get
// at most a handful, NPCs greet you by them, and each carries a real
// grant. Marks are what you survived; Epithets are what you are known
// for.
//
// ⚠️ EARNED BY A DEFINING ACT, NEVER BOUGHT AND NEVER GRANTED FOR A
// THRESHOLD YOU PASSED WHILE DOING SOMETHING ELSE. "Reach level 20"
// is not a defining act; "kill something that outranks you" is.
// Each `test` below reads a single moment, not a running total, with
// two deliberate exceptions that are themselves about persistence
// (Unhoused, Long-Walker) and say so.
//
// ⚠️ ORDER MATTERS: `EPITHETS` is scanned top to bottom and the FIRST
// untaken match wins on any given trigger, so the rarer and more
// specific acts are listed first. Reordering re-points which epithet a
// given moment awards — the same rule `SIGN_PROPERTIES` follows.
//
// ⚠️ Every `grants` key must be read by something. A grant nothing
// reads is worse than no grant, because the panel reports it as
// applied — this project has shipped that exact failure three times
// (`reachMult`, `echoPower`, `manaCostMult`). The reader for each is
// named in its comment.
// ══════════════════════════════════════════════════════════

/**
 * `test(ctx)` receives a single event's context, never a tally:
 *   { kind, player, enemy, gap, hpFraction, depth, rank, deaths,
 *     sitesUsed, descentsFlawless, memoriesForged, distance }
 * `kind` is the moment: 'kill' | 'descent' | 'forge' | 'site' |
 * 'death' | 'rank' | 'travel'.
 */
export const EPITHETS = {
  // ── The rarest: acts almost nobody performs ──
  giantfeller: {
    id: 'giantfeller', name: 'The Giantfeller',
    line: 'You killed something the Doctrine says you cannot hurt.',
    // Read at the damage site: a bonus against anything outranking you.
    grants: { punchUpMult: 1.25 },
    // ⚠️ TWO ranks, not five — and the number is not a nerf, it is
    // THE number. `rankMatchup` (data/ranks.js) applies the Refusal to
    // an attacker "two or more Ranks below its target": past that line
    // your damage stops being a multiplier problem and becomes a hard
    // cap on a fraction of the target's MAX health.
    //
    // Measured with the first draft's `>= 5`: a rank-0 player against
    // a rank-5 creature with **3 HP** could not kill it in 500 hits of
    // 60 damage, because each hit was capped to a fraction of that max
    // health. The epithet was literally unreachable by the game's own
    // central rule, which is the worst kind of unreachable — nothing
    // about it looks wrong.
    //
    // Gap 2 is exactly the threshold where the Refusal engages, so
    // this now means "you beat something you were not supposed to be
    // able to hurt", which is both achievable and what the name says.
    test: (c) => c.kind === 'kill' && c.gap >= 2,
  },
  unbroken: {
    id: 'unbroken', name: 'The Unbroken',
    line: 'You went down into a Descent and came back without being touched.',
    // Read by Player.takeDamage — the first hit of any fight is halved.
    grants: { firstHitHalved: true },
    test: (c) => c.kind === 'descent' && c.flawless,
  },
  thinice: {
    id: 'thinice', name: 'Thin Ice',
    line: 'You finished a fight you had no business finishing.',
    // Read in the COMBAT_HIT out-path: harder the closer to death you are.
    grants: { desperationMult: 1.4 },
    test: (c) => c.kind === 'kill' && c.hpFraction <= 0.08,
  },

  // ── Acts of commitment ──
  unhoused: {
    id: 'unhoused', name: 'The Unhoused',
    line: 'You have died more times than most Pioneers get to.',
    // ⚠️ A tally, deliberately — this epithet is ABOUT accumulation.
    // Read by dropGraveCache: you keep a share of what you drop.
    grants: { graveKeep: 0.5 },
    test: (c) => c.kind === 'death' && c.deaths >= 5,
  },
  longwalker: {
    id: 'longwalker', name: 'The Long-Walker',
    line: 'You have covered ground nobody sensible covers.',
    // ⚠️ Also a tally, same reason. Read by Player._handleMovement.
    grants: { moveMult: 1.1 },
    test: (c) => c.kind === 'travel' && c.distance >= 6000,
  },
  wellread: {
    id: 'wellread', name: 'The Well-Read',
    line: 'You have read every standing stone you passed.',
    // Read by SiteSystem's monolith branch — stones teach you more.
    grants: { monolithMult: 2 },
    test: (c) => c.kind === 'site' && c.siteKind === 'monolith' && c.monolithsRead >= 6,
  },
  hollowhanded: {
    id: 'hollowhanded', name: 'The Hollow-Handed',
    line: 'You have forged more than you could ever carry.',
    // Read by MemoryForge — a small chance of one extra Aspect.
    grants: { forgeLuck: 0.15 },
    test: (c) => c.kind === 'forge' && c.memoriesForged >= 12,
  },
  deepdelver: {
    id: 'deepdelver', name: 'The Deep-Delver',
    line: 'You have been further down than the Doctrine admits exists.',
    // Read by DescentSystem — spoils are richer.
    grants: { spoilMult: 1.3 },
    test: (c) => c.kind === 'descent' && c.tier >= 4,
  },
};

export const EPITHET_IDS = Object.keys(EPITHETS);

/** How many a Pioneer may hold at once. */
export const EPITHET_CAP = 3;
