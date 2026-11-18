// ══════════════════════════════════════════════════════════
// Lineages — what the Fracture made of you, and therefore what
// "sharpening a weapon" even means for you
//
// ── THE BRIEF ─────────────────────────────────────────────
// Owner's ask: a Bleach-shaped system — weapon upgrading / "memory
// ascension", with the player's RACE deciding what those upgrades are.
//
// What is actually load-bearing in that structure is not the tiers. It
// is this: **the weapon has a name that is asleep, and the way you
// wake it is different for what you are.** A Shinigami learns a
// sword's name by talking to it. A Hollow's power was never in a sword
// at all — it is in them, and releasing it is taking a mask off. A
// Quincy has no sword to name; they assemble one out of the air. Those
// are not three costs on one upgrade tree, they are three different
// verbs, and that difference is the whole reason the system is
// interesting.
//
// So the ladder below is a fixed SHAPE (Dormant → Sounded → Released →
// Ascended) and every lineage fills it with its own verb, its own
// currency, and its own grants. Two Reliquars with the same sword have
// the same story; a Reliquar and a Hollowed with the same sword do not.
//
// ── ⚠️ ORIGINAL VOCABULARY, NOT A RETELLING ───────────────
// §2 of the handoff is explicit: the Fracture, Pioneers, essence,
// attunement, Descents, the Ascent, Weaves, Echoes, Memories. There is
// no Shinigami, no Zanpakutō, no Bankai in here, and there must not be.
// The STRUCTURE is borrowed; the words are this world's, and each
// lineage is grounded in something the fiction already established —
// Echoes and Memories are what Descents already pay out, fragments are
// already the one thing you can only get by going down, and "the
// Fracture got into you" is already what Saturation means.
//
// ── ⚠️ HOW THIS AVOIDS THE TRAP THAT KILLED CLASSES ───────
// Classes and Paths were both REMOVED from this project, for one
// stated reason: they asked the player to declare an identity at a
// menu before they had done anything (§2).
//
// A lineage is innate — that is the point of the borrowed structure,
// and it is not negotiable the way a class was. So it is not picked at
// character creation. You begin **Unsounded**, and the Rite of
// Sounding (see LineageSystem.suggest) offers you a reading of what
// you have ALREADY been doing before you confirm it. The game tells
// you what you appear to be; you say whether it is right. That keeps
// the declaration in the world and after some play, which is the half
// of the old failure that actually mattered.
// ══════════════════════════════════════════════════════════

/**
 * The four rungs. Shared shape, per-lineage names.
 *
 * ⚠️ Index IS the stage number and the array order is the ladder.
 * Nothing may read `stage.name` to decide behaviour — same rule as
 * biome.surface and weaponPlanKey. Behaviour comes from the index and
 * from `grant`.
 */
export const AWAKENING_STAGES = 4;

/**
 * Grant composition, declared rather than inferred from the name.
 *
 * ⚠️ Exactly the contract AscentSystem.GRANT_KINDS uses, for exactly
 * the same reason: `damageMult` and `lifesteal` look equally numeric
 * at a call site, and getting the kind backwards silently halves or
 * doubles a build. Multiplicative grants default to 1 and MULTIPLY;
 * additive ones default to 0 and SUM.
 */
export const LINEAGE_GRANT_KINDS = {
  damageMult:    'mult',
  manaCostMult:  'mult',
  castSpeedMult: 'mult',
  reachMult:     'mult',
  atkBonus:      'sum',
  lifesteal:     'sum',
  maxHpMult:     'mult',
  critChance:    'sum',
  echoPower:     'sum',
};

export const LINEAGES = {
  // ══════════════════════════════════════════════════════
  sablewright: {
    id: 'sablewright',
    name: 'Sablewright',
    epithet: 'those who bind a thing into steel',
    // The archetype the whole structure is built around: the weapon is
    // a vessel, something sleeps in it, and you get its power by
    // learning what to call it.
    creed: 'Every blade was somebody. Ask politely and it will tell you its name.',
    blurb:
      'You do not sharpen a weapon; you wake one. A Sablewright binds an ' +
      'essence into steel and then spends a long time learning what it ' +
      'answers to. Slowest to start, and the only lineage whose weapon ' +
      'keeps its own counsel.',
    verb: 'Sounding',
    // Which currency this lineage's rites are paid in. See
    // AwakeningSystem._costOf — each of these resolves to a genuinely
    // different play pattern, which is the point.
    currency: 'memory',
    currencyLabel: 'Remnants',
    currencyOne: 'Remnant',
    currencyNote: 'Remnants crystallise from SEALING a Descent — so a Sablewright is pushed toward the Refinement ladder.',
    // Elements this lineage reads as. Used only by suggest().
    affinity: ['arcane', 'light', 'ice'],
    leaning: 'heaven',
    stages: [
      { name: 'Silent',   line: 'It is a weapon. Nothing more, yet.',                   grant: null },
      { name: 'Sounded',   line: 'It has a name, and you know it.',                      grant: { key: 'atkBonus',   value: 6 } },
      { name: 'Released',  line: 'It answers when you use it.',                          grant: { key: 'damageMult', value: 1.35 } },
      { name: 'Unbidden',  line: 'It no longer needs to be asked.',                      grant: { key: 'damageMult', value: 1.45 } },
    ],
  },

  // ══════════════════════════════════════════════════════
  hollowed: {
    id: 'hollowed',
    name: 'The Hollowed',
    epithet: 'those the Fracture got into',
    creed: 'You did not find a weapon. You grew one, and it is still attached.',
    blurb:
      'Something came up out of a Descent inside you and did not leave. ' +
      'Your weapon is not an object — it is the part of you that is no ' +
      'longer entirely yours. Hits harder than anything else and takes ' +
      'the difference out of your own body.',
    verb: 'Unmasking',
    currency: 'echo',
    currencyLabel: 'Thralls',
    currencyOne: 'Thrall',
    currencyNote: 'Thralls come from DEVOURING a Warden — so the Hollowed are pushed toward the Appetite ladder.',
    affinity: ['void', 'shadow', 'poison'],
    leaning: 'hell',
    stages: [
      { name: 'Silent',   line: 'It is quiet today.',                                    grant: null },
      { name: 'Surfaced',  line: 'It has started answering for you.',                      grant: { key: 'lifesteal',  value: 0.05 } },
      { name: 'Unmasked',  line: 'You stopped pretending it was a weapon.',                grant: { key: 'damageMult', value: 1.55 } },
      // ⚠️ The maxHp cost is REAL and is the whole character of this
      // lineage. A trade with no downside is not a trade, and every
      // other lineage's top rung is strictly a gain.
      { name: 'Whole',     line: 'There is no longer a seam to find.',                     grant: { key: 'damageMult', value: 1.5 }, cost: { key: 'maxHpMult', value: 0.82 } },
    ],
  },

  // ══════════════════════════════════════════════════════
  latticer: {
    id: 'latticer',
    name: 'Latticer',
    epithet: 'those who carry nothing and are never unarmed',
    creed: 'Steel is somebody else\'s idea. The air is full of what I need.',
    blurb:
      'You do not own a weapon. You assemble one out of loose essence ' +
      'every time you need it, and refine the pattern rather than the ' +
      'object. Cheapest caster in the game and the worst in a brawl.',
    verb: 'Gathering',
    currency: 'fragment',
    currencyLabel: 'element fragments',
    currencyOne: 'element fragment',
    currencyNote: 'Fragments are Descent-only (data/descents.js) — the one currency that cannot be farmed in a field.',
    affinity: ['lightning', 'wind', 'water'],
    leaning: 'heaven',
    stages: [
      { name: 'Unformed',  line: 'The pattern will not hold yet.',                          grant: null },
      { name: 'Drawn',     line: 'It holds long enough to use.',                             grant: { key: 'manaCostMult', value: 0.85 } },
      { name: 'Woven',     line: 'It holds as long as you do.',                              grant: { key: 'castSpeedMult', value: 1.3 } },
      { name: 'Standing',  line: 'It is there before you decide to want it.',                grant: { key: 'manaCostMult', value: 0.7 } },
    ],
  },

  // ══════════════════════════════════════════════════════
  reliquar: {
    id: 'reliquar',
    name: 'Reliquar',
    epithet: 'those who wake what a thing remembers',
    creed: 'It has been yours a long time. That is not nothing — that is the whole of it.',
    blurb:
      'You pull the power out of what an object has already lived ' +
      'through. Nothing is bought and nothing is spent: a Reliquar\'s ' +
      'weapon ascends by being CARRIED and USED, and switching weapons ' +
      'starts you over.',
    verb: 'Recollection',
    // ⚠️ The only lineage whose currency is not an item. `bond` is
    // accumulated per-weapon in AwakeningSystem and is deliberately
    // non-transferable — see _bondFor. This is what makes a Reliquar
    // play differently rather than just costing differently.
    currency: 'bond',
    currencyLabel: 'bond with this weapon',
    currencyOne: 'bond with this weapon',
    currencyNote: 'Bond is earned by KILLING with one specific weapon, and does not transfer when you swap.',
    affinity: ['earth', 'fire', 'light'],
    leaning: null,
    stages: [
      { name: 'Unfamiliar', line: 'You have not had it long.',                              grant: null },
      { name: 'Worn',       line: 'Your hand knows where it balances.',                     grant: { key: 'critChance', value: 0.07 } },
      { name: 'Kept',       line: 'You would notice its weight missing.',                    grant: { key: 'damageMult', value: 1.4 } },
      { name: 'Inherited',  line: 'It has outlived at least one owner. It intends to outlive you.', grant: { key: 'damageMult', value: 1.4 } },
    ],
  },

  // ══════════════════════════════════════════════════════
  ashborn: {
    id: 'ashborn',
    name: 'Ashborn',
    epithet: 'those who spend themselves for it',
    creed: 'It burns. That is not a flaw in the design, that is the design.',
    blurb:
      'Your rites are paid in your own blood — no Descent required, ' +
      'which makes you the only lineage that can ascend a weapon without ' +
      'ever going down. The bill comes out of your maximum health and it ' +
      'does not get refunded.',
    verb: 'Kindling',
    currency: 'vitality',
    currencyLabel: 'your own vitality',
    currencyOne: 'point of your own vitality',
    currencyNote: 'The only currency obtainable in an open field. Ashborn trade the Descent grind for a permanent HP cost.',
    affinity: ['fire', 'lightning', 'poison'],
    leaning: 'hell',
    stages: [
      { name: 'Banked',    line: 'There is heat in it somewhere.',                          grant: null },
      { name: 'Lit',       line: 'It has caught.',                                          grant: { key: 'atkBonus',   value: 9 } },
      { name: 'Roaring',   line: 'You can no longer put it down quickly.',                  grant: { key: 'damageMult', value: 1.45 } },
      { name: 'Pyre',      line: 'It is going to finish, with or without you.',             grant: { key: 'damageMult', value: 1.55 } },
    ],
  },

  // ══════════════════════════════════════════════════════
  choirbound: {
    id: 'choirbound',
    name: 'Choirbound',
    epithet: 'those who never wake just one',
    creed: 'One voice is a mistake. Ask them all.',
    blurb:
      'You cannot wake a single weapon — you wake all of them, together ' +
      'and slowly. Every arm you own shares one ladder, so a Choirbound ' +
      'swaps weapons freely and is never behind on the one they picked ' +
      'up this morning. Advances slowest of anyone.',
    verb: 'Chorus',
    // ⚠️ SHARED ladder. AwakeningSystem keys progress per-weapon for
    // every other lineage; this one keys it to a single shared record.
    // That is the mechanic, not an optimisation.
    currency: 'memory',
    currencyLabel: 'Remnants',
    currencyOne: 'Remnant',
    currencyNote: 'One ladder for every weapon you own — a Choirbound never has a "wrong" weapon equipped.',
    shared: true,
    affinity: ['arcane', 'wind', 'water'],
    leaning: null,
    stages: [
      { name: 'Silent',    line: 'Nothing is saying anything yet.',                         grant: null },
      { name: 'Murmuring', line: 'Several of them, faintly, at once.',                      grant: { key: 'atkBonus',   value: 5 } },
      { name: 'In Chorus', line: 'They have agreed on something.',                          grant: { key: 'damageMult', value: 1.3 } },
      { name: 'Unison',    line: 'You cannot tell which one is yours any more.',            grant: { key: 'damageMult', value: 1.4 } },
    ],
  },
};

export const LINEAGE_IDS = Object.keys(LINEAGES);

/** The lineage you are before the Rite of Sounding. */
export const UNSOUNDED = {
  id: 'unsounded',
  name: 'Unsounded',
  epithet: 'not yet read',
  creed: 'Nothing has been decided about you.',
  blurb: 'You have not sat the Rite. Nothing you carry can be woken until you do.',
  verb: 'Sounding',
  currency: 'memory',
  currencyLabel: '—',
  affinity: [],
  stages: [{ name: 'Unsounded', line: 'Sit the Rite first.', grant: null }],
};

export function lineageById(id) {
  return LINEAGES[id] || UNSOUNDED;
}

// ══════════════════════════════════════════════════════════
// TRUE NAMES
//
// Every weapon has one, and it is the same every time for the same
// weapon — a name that re-rolled would make "learning it" meaningless.
// Built from a stable hash of the weapon's id so it survives reloads
// without a save system to lean on.
//
// ⚠️ Deliberately NOT random at forge time. The fiction is that the
// name was always there and you did not know it; a name generated when
// you first look at it is a different, much weaker idea.
// ══════════════════════════════════════════════════════════

const NAME_FIRST = [
  'Ashen', 'Quiet', 'Long', 'Hollow', 'Patient', 'Bitter', 'First', 'Last',
  'Drowned', 'Cold', 'Unspoken', 'Wintering', 'Low', 'Bright', 'Starving',
  'Sundered', 'Kept', 'Nameless', 'Grieving', 'Iron',
];

const NAME_SECOND = [
  'Answer', 'Winter', 'Hour', 'Verdict', 'Tithe', 'Refusal', 'Mercy', 'Errand',
  'Wake', 'Argument', 'Inheritance', 'Confession', 'Harvest', 'Vigil',
  'Reckoning', 'Bargain', 'Silence', 'Debt', 'Homecoming', 'Sentence',
];

/**
 * Stable 32-bit hash. Same string in, same number out, forever.
 *
 * ⚠️ The `_fmix32` finalizer is NOT optional and is not decoration.
 * Plain FNV-1a leaves its low bits weakly mixed, so two hashes of
 * nearly-identical strings ('first:X' and 'second:X') stay correlated
 * in exactly the bits `% 20` reads. Measured without it: each half of
 * the name was individually well spread (15% bucket spread over 20
 * buckets, which looks perfectly healthy) while only **100 of the 400
 * possible pairs ever occurred** — 25% coverage, five second-halves
 * per first-half, forever.
 *
 * That is trap #3 in the handoff, in its purest form: five separate
 * correlated-modulus bugs have shipped in this project as code that
 * read as obviously correct. The per-half counts are the misleading
 * measurement; the PAIR count is the one that finds it.
 */
function _fmix32(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function _hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return _fmix32(h);
}

/**
 * The true name sleeping in a weapon.
 *
 * ⚠️ Two independent indices must not be correlated. Two salted
 * hashes are NOT sufficient on their own — see _hashString, where the
 * first version of this produced only 25% of the possible pairs while
 * every per-half count looked healthy. Verify by counting PAIRS across
 * a wide sweep, never by counting each half.
 */
export function trueNameFor(weaponId, weaponType = 'sword') {
  const seed = `${weaponId || 'unknown'}:${weaponType}`;
  const a = _hashString('first:' + seed) % NAME_FIRST.length;
  const b = _hashString('second:' + seed) % NAME_SECOND.length;
  return `${NAME_FIRST[a]} ${NAME_SECOND[b]}`;
}

/** Every distinct name the generator can produce. For the codex/tests. */
export function nameSpaceSize() {
  return NAME_FIRST.length * NAME_SECOND.length;
}
