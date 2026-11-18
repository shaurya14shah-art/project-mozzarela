// ══════════════════════════════════════════════════════════
// Descents — element-typed dungeons, and the only way to ascend
//
// ── WHY THESE ARE NOT ROOMS ───────────────────────────────
// This project has no modular interior kit and never fetched one (see
// HANDOFF §7: "dungeons are atmospheric surface clusters, not walk-in
// interiors"). Two earlier sessions recorded that limit honestly and
// then designed around it. So does this.
//
// A Descent is a BOUNDED REGION, not a building: you touch a Gate, the
// world within a radius of it becomes the Descent — the sky takes the
// element's palette, the boundary becomes visible and solid, and what
// lives inside is element-attuned and hostile. You are not somewhere
// else. You are here, and here has changed. That is both cheaper and
// truer to a premise about a wound in the sky than a door into a
// corridor would be.
//
// Everything a Descent needs already exists and is being reused, not
// reinvented: enemySpawner for the population, Atmosphere's per-key
// palette apply for the re-light, ChunkManager's prop forges for the
// Gate, and the analytic getGroundY() for placement. Nothing here
// raycasts the terrain (HANDOFF §4) and nothing here writes
// scene.fog.density or key.intensity directly (HANDOFF §4's
// fog/light multiplier contract) — the Descent publishes a factor and
// Atmosphere.update() stays the only writer.
//
// ── THE DIVERGENCE ────────────────────────────────────────
// Every Descent has exactly one enemy that matters — the Warden — and
// killing it does NOT end the Descent. It opens the choice:
//
//   SEAL   (Ascendant) — close it. The Gate goes dark, the region
//          reverts, and the element's Saturation is scrubbed from the
//          ground. You get a clean Remnant and a Trial toward the
//          Ladder of Refinement.
//   DEVOUR (Cinderbound) — leave it open. The Gate stays lit forever,
//          the region stays element-saturated and stays hostile, and
//          you walk out carrying the Warden as a Revenant plus a Trial
//          toward the Ladder of Appetite.
//
// Either is available to either path. Taking the WRONG one still
// clears the dungeon, still pays fragments, and banks NO Trial —
// AscentSystem.recordTrial() rejects a mismatched verb out loud. A
// Cinderbound can seal a Descent; it just doesn't get them anywhere,
// which is the mechanically cheapest way to say the two philosophies
// are not interchangeable.
// ══════════════════════════════════════════════════════════

import { ELEMENTS } from './constants.js';

/**
 * Tier bands. A Descent's tier decides its population's strength, its
 * Warden, its fragment yield, and which rung of the Ascent it can pay
 * a Trial toward (see ascent.js's requirementsFor — a Trial counts for
 * its own tier and any tier below, never above).
 */
export const DESCENT_TIERS = [
  { tier: 1, name: 'Shallow',   radius: 40, waves: 2, enemyScale: 1.0,  fragments: [2, 3] },
  { tier: 2, name: 'Deep',      radius: 52, waves: 3, enemyScale: 1.35, fragments: [3, 5] },
  { tier: 3, name: 'Sunless',   radius: 64, waves: 4, enemyScale: 1.8,  fragments: [5, 8] },
  { tier: 4, name: 'Rootbound', radius: 76, waves: 5, enemyScale: 2.4,  fragments: [8, 12] },
  { tier: 5, name: 'Unbottomed', radius: 88, waves: 6, enemyScale: 3.2, fragments: [12, 18] },
];

export function tierInfo(tier) {
  return DESCENT_TIERS[Math.max(0, Math.min(DESCENT_TIERS.length - 1, tier - 1))];
}

/**
 * One Descent archetype per castable element.
 *
 * `enemies` are indices into ENEMY_TYPES (Enemy.js, 0–11: slime,
 * skeleton, goblin, vampire, spider, wraith, dragon, golem,
 * ice_elemental, sandworm, bone_acolyte, grave_stalker). They are
 * chosen for thematic fit, not for balance — the tier's enemyScale is
 * what carries difficulty, so a Shallow dragon Descent is a survivable
 * fight and an Unbottomed slime one is not a joke.
 *
 * ⚠️ `warden` is a NAMED unique forged out of the ordinary template at
 * `wardenType`, exactly the way Vell is (see spawnVell() in main.js).
 * It is not a new enemy class and must not become one — every creature
 * in this game has a hard procedural fallback and a new class would
 * need its own.
 *
 * `fragment` is the item id this Descent pays out in. Element
 * fragments are the ONLY source of element-locked crafting input now
 * that potions have been pulled back to mundane ingredients — see
 * data/materials.js and the potion rework.
 */
export const DESCENTS = {
  [ELEMENTS.FIRE]: {
    element: ELEMENTS.FIRE,
    name: 'The Bellows',
    blurb: 'Ground that has been on fire long enough to forget it was ever anything else.',
    enemies: [1, 2, 6],
    wardenType: 6,
    warden: 'The Ninth Bellows-Keeper',
    fragment: 'fragment_fire',
    color: 0xff6a35,
  },
  [ELEMENTS.WATER]: {
    element: ELEMENTS.WATER,
    name: 'The Drowned Register',
    blurb: 'Everything down here is written down, and everything written down is wet.',
    enemies: [0, 4, 10],
    wardenType: 10,
    warden: 'The Tallying Drowned',
    fragment: 'fragment_water',
    color: 0x4aa8ff,
  },
  [ELEMENTS.EARTH]: {
    element: ELEMENTS.EARTH,
    name: 'The Weight',
    blurb: 'Not a cave. A pressure, with room in it.',
    enemies: [7, 1, 2],
    wardenType: 7,
    warden: 'That Which Was Laid First',
    fragment: 'fragment_earth',
    color: 0xa8c455,
  },
  [ELEMENTS.WIND]: {
    element: ELEMENTS.WIND,
    name: 'The Long Exhale',
    blurb: 'Something enormous is breathing out, slowly, and has been for years.',
    enemies: [5, 4, 11],
    wardenType: 5,
    warden: 'The Last Breath Out',
    fragment: 'fragment_wind',
    color: 0x9fe8dc,
  },
  [ELEMENTS.ICE]: {
    element: ELEMENTS.ICE,
    name: 'The Held Winter',
    blurb: 'A season someone stopped, and then could not restart.',
    enemies: [8, 1, 11],
    wardenType: 8,
    warden: 'The Winter That Was Kept',
    fragment: 'fragment_ice',
    color: 0x7fd0ff,
  },
  [ELEMENTS.LIGHTNING]: {
    element: ELEMENTS.LIGHTNING,
    name: 'The Standing Charge',
    blurb: 'The air has an opinion about you and is waiting to express it.',
    enemies: [2, 5, 6],
    wardenType: 6,
    warden: 'The Charge That Never Grounded',
    fragment: 'fragment_lightning',
    color: 0xffd94a,
  },
  [ELEMENTS.SHADOW]: {
    element: ELEMENTS.SHADOW,
    name: 'The Long Noon',
    blurb: 'Shadows here point the wrong way and have done since before there was a sun to blame.',
    enemies: [5, 11, 3],
    wardenType: 3,
    warden: 'The Shape That Casts Nothing',
    fragment: 'fragment_shadow',
    color: 0xa855e0,
  },
  [ELEMENTS.LIGHT]: {
    element: ELEMENTS.LIGHT,
    name: 'The Unshuttered',
    blurb: 'Too bright to close your eyes in, and closing them does not help.',
    enemies: [1, 10, 7],
    wardenType: 10,
    warden: 'The One Who Would Not Dim',
    fragment: 'fragment_light',
    color: 0xffe9a3,
  },
  [ELEMENTS.VOID]: {
    element: ELEMENTS.VOID,
    name: 'The Subtraction',
    blurb: 'You will come out of here having lost something you cannot name.',
    enemies: [5, 3, 11],
    wardenType: 5,
    warden: 'What Is Left When The Rest Is Taken',
    fragment: 'fragment_void',
    color: 0xd976ff,
  },
  [ELEMENTS.ARCANE]: {
    element: ELEMENTS.ARCANE,
    name: 'The Working',
    blurb: 'Somebody was mid-experiment when the sky broke, and never stopped.',
    enemies: [10, 7, 3],
    wardenType: 10,
    warden: 'The Unfinished Proof',
    fragment: 'fragment_arcane',
    color: 0xc9a0ff,
  },
  [ELEMENTS.POISON]: {
    element: ELEMENTS.POISON,
    name: 'The Slow Meal',
    blurb: 'Nothing down here is in a hurry, including what is happening to you.',
    enemies: [0, 4, 2],
    wardenType: 4,
    warden: 'The Patient Mouth',
    fragment: 'fragment_poison',
    color: 0x9ee04a,
  },
};

export const DESCENT_LIST = Object.values(DESCENTS);

/** Descent archetype for an element, or null if that element has none. */
export function descentFor(element) {
  return DESCENTS[element] || null;
}

/**
 * Pick a Descent element deterministically from a world hash.
 *
 * ⚠️ Takes an ALREADY-DIVIDED hash, not the raw one. This project has
 * hit the correlated-modulus bug five separate times (HANDOFF §7): if
 * a caller gates placement with `hash % A === 0` and then calls this
 * with the same `hash`, `hash % LIST.length` is forced to share the
 * first modulus's residue and roughly half this table becomes
 * unreachable — in code that reads as obviously correct. Callers must
 * pass a decorrelated value (e.g. `hash / 97 | 0`), and any change
 * here must be verified by COUNTING the output distribution across a
 * wide sweep, never by reading the branches.
 */
export function descentFromHash(decorrelatedHash) {
  return DESCENT_LIST[Math.abs(decorrelatedHash) % DESCENT_LIST.length];
}

/**
 * Does chunk (cx, cz) hold a Descent Gate, and if so which one?
 *
 * ⚠️ PURE HASH MATH, no terrain. This is deliberately extracted from
 * ChunkManager._generateDescentGate so that the chunk builder and the
 * SCOUTING system (which has to answer "where are the nearby Gates"
 * for chunks that have never been loaded) share exactly one
 * implementation. Two copies of this arithmetic would drift the first
 * time either was touched, and the failure mode is a compass that
 * points confidently at nothing.
 *
 * See _generateDescentGate for the modulus rule this obeys: the
 * placement gate is `h % 9 === 0`, so every subsequent decision divides
 * that factor out before taking its own modulus.
 */
export function gateForChunk(cx, cz) {
  const chunkDist = Math.sqrt(cx * cx + cz * cz);
  if (chunkDist < 3.5) return null;              // never inside the hub

  const h = Math.abs(cx * 211 + cz * 307 + 4177);
  if (h % 9 !== 0) return null;

  const pick = Math.floor(h / 9);                // decorrelated from the gate
  const archetype = descentFromHash(pick);
  const jitter = Math.abs(Math.imul(pick ^ 0x9e3779b9, 0x85ebca6b));

  // Explicit distance BANDS, not a linear divisor — area grows as r²,
  // so constant step widths make the outermost tier swallow almost
  // everything (counted at 79% before this was fixed).
  const TIER_BANDS = [9, 18, 30, 46];
  let tier = 1;
  while (tier <= TIER_BANDS.length && chunkDist >= TIER_BANDS[tier - 1]) tier++;

  return { cx, cz, archetype, jitter, tier, chunkDist };
}

/**
 * Every Gate within `radiusChunks` of a chunk coordinate, nearest
 * first. Used by scouting; costs one hash per chunk in the square, so
 * a radius of 12 is ~600 integer operations — cheap enough to call on
 * a dialogue line.
 */
export function gatesNear(cx0, cz0, radiusChunks = 12) {
  const found = [];
  const r = Math.ceil(radiusChunks);
  for (let cx = cx0 - r; cx <= cx0 + r; cx++) {
    for (let cz = cz0 - r; cz <= cz0 + r; cz++) {
      const d = Math.hypot(cx - cx0, cz - cz0);
      if (d > radiusChunks) continue;
      const g = gateForChunk(cx, cz);
      if (g) found.push({ ...g, fromPlayer: d });
    }
  }
  return found.sort((a, b) => a.fromPlayer - b.fromPlayer);
}

/**
 * The two ways out. Both are always offered to both paths — see this
 * file's header for why taking the one your ladder doesn't count is
 * allowed rather than blocked.
 */
export const RESOLUTIONS = {
  seal: {
    verb: 'seal',
    title: 'Seal it',
    sub: 'Close the Descent behind you. The ground forgets. So, mostly, do you.',
    line: 'The Gate goes out. What was underneath stays underneath.',
    ladder: 'heaven',
  },
  devour: {
    verb: 'devour',
    title: 'Devour it',
    sub: 'Leave it open and carry it out. Something down here comes with you.',
    line: 'The Gate stays lit. You can feel it behind you for a long time afterwards.',
    ladder: 'hell',
  },
};

// ══════════════════════════════════════════════════════════
// TRIAL KINDS — what SHAPE the Descent is, and what it pays
//
// ⚠️ Every Descent used to be the same trial: N waves, then a Warden.
// The reference framework is explicit that this is a wasted axis —
// "tie your dungeon system directly to character build generation;
// let the FLAVOUR of the challenge determine the FLAVOUR of the
// reward, so no two characters' growth paths look alike."
//
// So a Descent now has a KIND, and the kind decides both the shape of
// the fight and which of the four build knobs it feeds. A player who
// wants Memories hunts; a player who wants Marks stands a Vigil. That
// is the diversification pressure the framework asks for, and it
// costs nothing to opt into because the Gate tells you what it is
// before you walk in.
//
// ⚠️ `bias` names a REWARD CATEGORY, not an item. The four categories
// are the four build knobs: cores (crafting input), marks (passive
// traits), memories (active abilities), echoes (passive boons).
// ══════════════════════════════════════════════════════════
export const TRIAL_KINDS = {
  cull: {
    id: 'cull', name: 'Cull',
    objective: 'Clear every wave, then put down what comes last.',
    blurb: 'The oldest shape a Descent takes. It simply sends things until it runs out.',
    waveMult: 1.0, wardenHpMult: 1.0,
    bias: 'cores',
    payLine: 'The wound gives up what it was holding.',
  },
  vigil: {
    id: 'vigil', name: 'Vigil',
    objective: 'Hold the ground. Nothing here stops coming until it decides you have stood long enough.',
    blurb: 'No end condition you can kill your way to. You are being measured, not fought.',
    // More, weaker waves — pressure rather than spikes.
    waveMult: 1.6, wardenHpMult: 0.75,
    bias: 'marks',
    payLine: 'You stood in it long enough to be changed by it.',
  },
  hunt: {
    id: 'hunt', name: 'Hunt',
    objective: 'One thing down here is worth finding. It knows that, and it moves.',
    blurb: 'Barely any escort. The quarry is the whole trial, and it is faster than you.',
    waveMult: 0.4, wardenHpMult: 1.5,
    bias: 'memories',
    payLine: 'What you ran down had something in it worth keeping.',
  },
  vault: {
    id: 'vault', name: 'Vault',
    objective: 'Something is sealed here. Open it, and survive having opened it.',
    blurb: 'The fight is not the point. The fight is what opening it costs.',
    waveMult: 1.3, wardenHpMult: 1.2,
    bias: 'echoes',
    payLine: 'The reliquary was not empty, and it was not pleased.',
  },
};

export const TRIAL_KIND_IDS = Object.keys(TRIAL_KINDS);

/**
 * Which kind a given Descent is.
 *
 * ⚠️ DETERMINISTIC on (element, tier), never rolled at entry. A Gate
 * must be able to tell the player what it is *before* they commit —
 * a trial whose kind is decided on entry cannot be chosen, and being
 * chosen is the entire mechanism by which this creates build
 * diversity.
 *
 * ⚠️ Tier 1 is ALWAYS a Cull. It is the shape the tutorial teaches and
 * the one that needs no explanation; meeting a Vigil as your first
 * Descent would be learning two things at once.
 */
export function trialKindFor(element, tier) {
  if (tier <= 1) return TRIAL_KINDS.cull;
  let h = 2166136261;
  const s = `${element}:${tier}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return TRIAL_KINDS[TRIAL_KIND_IDS[(h >>> 0) % TRIAL_KIND_IDS.length]];
}
