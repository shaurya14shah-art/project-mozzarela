// ══════════════════════════════════════════════════════════
// Catalysts — what element fragments do in the pot
//
// ── THE COMBINATORICS PROBLEM ─────────────────────────────
// The spell matrix is 11 castable elements × 5 forms = 55 cells. The
// Working (systems/BrewProcess.js) made the ROUTE to a cell matter —
// order, heat, stirring — but every route still landed in one of the
// same 55 cells. Process changed the numbers on a spell; it could not
// change which spell it was. Fifty-five is not enough distinct things
// for a game whose whole crafting pitch is combinatorial.
//
// Catalysts add a third axis. A fragment (data/materials.js — the one
// crafting input that can only come out of a Descent) is not an
// ingredient: it does not vote on element or form. It TRANSFORMS the
// result, and which transformation you get depends on the state of the
// pot when it goes in.
//
//     spell identity = element × form × catalyst
//                      11      × 5    × (1 + 22)  = 1265 cells
//
// ⚠️ That number is a claim about the ID SPACE, not about content. It
// is verified by enumeration, not by this comment — see the sweep in
// PotionSystem's own test path. Do not quote it without re-counting;
// this project has been wrong about a distribution five separate times
// by reasoning instead of measuring (HANDOFF §7).
//
// ── WHY HOT/COLD RATHER THAN ELEVEN MORE FRAGMENTS ────────
// Two catalysts per fragment doubles the space for free and, more
// importantly, makes the FRAGMENT and the TECHNIQUE interact. A
// Fragment of Fire dropped into a cold pot tempers the brew; the same
// fragment into a boiling one detonates it. That is a decision, and it
// reuses the heat mechanic the player already learned instead of
// adding a parallel system to memorise.
// ══════════════════════════════════════════════════════════

import { ELEMENTS } from './constants.js';

/** Heat at or above which a fragment takes its violent aspect. */
export const CATALYST_HOT_AT = 0.55;

/**
 * Per fragment: what it does cold, and what it does hot.
 *
 * `suffix` is appended to the spell's name and folded into its id, so a
 * catalysed spell is genuinely a different entry in the grimoire rather
 * than the same one with different numbers.
 *
 * `mods` are multiplicative on the finished spell. `effect` merges into
 * the spell's effect package — that is where the behavioural change
 * lives (a spell that chains, pierces, splits or lingers plays
 * differently from one that only hits harder).
 */
export const CATALYSTS = {
  [ELEMENTS.FIRE]: {
    cold: {
      id: 'tempered', suffix: 'Tempered', blurb: 'Held at the edge of catching. Steadier, and it bites longer.',
      mods: { damage: 1.08, charges: 1.25, instability: 0.75 },
      effect: { burn: true, duration: 4 },
    },
    hot: {
      id: 'detonating', suffix: 'Detonating', blurb: 'It went in boiling. Whatever it touches goes outward.',
      mods: { damage: 1.45, radius: 2.5, charges: 0.7, instability: 1.4 },
      effect: { explode: true },
    },
  },
  [ELEMENTS.WATER]: {
    cold: {
      id: 'flowing', suffix: 'Flowing', blurb: 'Finds its way. Costs less and goes further.',
      mods: { mana: 0.7, speed: 1.25, damage: 0.95 },
      effect: { pierce: true },
    },
    hot: {
      id: 'scalding', suffix: 'Scalding', blurb: 'Steam does what water will not.',
      mods: { damage: 1.3, radius: 1.8, instability: 1.2 },
      effect: { burn: true, slow: 0.7 },
    },
  },
  [ELEMENTS.EARTH]: {
    cold: {
      id: 'bedded', suffix: 'Bedded', blurb: 'Heavy and certain. Nothing about it is quick.',
      mods: { damage: 1.35, speed: 0.7, charges: 1.2, instability: 0.6 },
      effect: { knockback: 2 },
    },
    hot: {
      id: 'fracturing', suffix: 'Fracturing', blurb: 'Stone that has been heated and dropped.',
      mods: { damage: 1.15, radius: 2.2, instability: 1.3 },
      effect: { shatter: true, splinters: 3 },
    },
  },
  [ELEMENTS.WIND]: {
    cold: {
      id: 'carried', suffix: 'Carried', blurb: 'Goes where you were looking, not where you aimed.',
      mods: { speed: 1.5, mana: 0.85 },
      effect: { homing: true },
    },
    hot: {
      id: 'howling', suffix: 'Howling', blurb: 'The pot screamed. So does this.',
      mods: { damage: 1.2, radius: 2.0, charges: 0.85, instability: 1.35 },
      effect: { pull: 3, stagger: true },
    },
  },
  [ELEMENTS.ICE]: {
    cold: {
      id: 'clear', suffix: 'Clear', blurb: 'Nothing in it that should not be. More of it, and cheaper.',
      mods: { charges: 1.5, mana: 0.75, instability: 0.5 },
      effect: { slow: 0.7 },
    },
    hot: {
      id: 'shocked', suffix: 'Shocked', blurb: 'Ice into a boiling pot. It did not survive the argument intact.',
      mods: { damage: 1.4, charges: 0.65, instability: 1.5 },
      effect: { freeze: true, shatterBonus: 1.6 },
    },
  },
  [ELEMENTS.LIGHTNING]: {
    cold: {
      id: 'earthed', suffix: 'Earthed', blurb: 'Grounded properly. It goes exactly where it is sent.',
      mods: { speed: 1.6, damage: 1.05, instability: 0.7 },
      effect: { pierce: true, instant: true },
    },
    hot: {
      id: 'arcing', suffix: 'Arcing', blurb: 'It found a second thing to be interested in.',
      mods: { damage: 1.1, instability: 1.45 },
      effect: { chain: 3, chainFalloff: 0.65 },
    },
  },
  [ELEMENTS.SHADOW]: {
    cold: {
      id: 'quiet', suffix: 'Quiet', blurb: 'Arrives before it is noticed.',
      mods: { damage: 1.25, mana: 0.9 },
      effect: { firstStrike: 1.5 },
    },
    hot: {
      id: 'swarming', suffix: 'Swarming', blurb: 'One went in. Several came out.',
      mods: { damage: 0.6, charges: 0.8, instability: 1.3 },
      effect: { split: 4 },
    },
  },
  [ELEMENTS.LIGHT]: {
    cold: {
      id: 'steady', suffix: 'Steady', blurb: 'Does not flicker. Mends what it passes.',
      mods: { charges: 1.3, instability: 0.4 },
      effect: { healOnHit: 0.12 },
    },
    hot: {
      id: 'blinding', suffix: 'Blinding', blurb: 'Too bright to have looked at while brewing.',
      mods: { damage: 1.3, radius: 2.4, instability: 1.25 },
      effect: { blind: 3 },
    },
  },
  [ELEMENTS.VOID]: {
    cold: {
      id: 'hollow', suffix: 'Hollow', blurb: 'Weighs less than it should. Costs less too.',
      mods: { mana: 0.55, damage: 0.9, charges: 1.2 },
      effect: { drain: 0.1 },
    },
    hot: {
      id: 'devouring', suffix: 'Devouring', blurb: 'It ate part of the pot on the way in.',
      mods: { damage: 1.5, charges: 0.6, instability: 1.6 },
      effect: { drain: 0.3, collapse: true },
    },
  },
  [ELEMENTS.ARCANE]: {
    cold: {
      id: 'proofed', suffix: 'Proofed', blurb: 'Worked out properly before it was made.',
      mods: { damage: 1.15, charges: 1.15, mana: 0.85, instability: 0.55 },
      effect: {},
    },
    hot: {
      id: 'unstable', suffix: 'Unstable', blurb: 'The working got away from whoever started it.',
      mods: { damage: 1.55, charges: 0.55, instability: 1.7 },
      effect: { surgeBonus: 0.3 },
    },
  },
  [ELEMENTS.POISON]: {
    cold: {
      id: 'steeped', suffix: 'Steeped', blurb: 'Given time to become itself. It is patient now.',
      mods: { damage: 0.85, charges: 1.35, instability: 0.65 },
      effect: { poison: true, duration: 8, tickRate: 1 },
    },
    hot: {
      id: 'virulent', suffix: 'Virulent', blurb: 'Cooked. It spreads.',
      mods: { damage: 1.2, instability: 1.4 },
      effect: { poison: true, duration: 5, contagion: 2 },
    },
  },
};

/**
 * The catalyst a fragment yields at a given pot temperature, or null if
 * the item is not a fragment.
 *
 * ⚠️ Reads `item.isFragment`, NOT the id prefix. Fragments are declared
 * with that flag in materials.js precisely so this does not become a
 * string-prefix check that silently starts matching a future item
 * called `fragment_of_the_true_name`.
 */
export function catalystFor(item, temp) {
  if (!item?.isFragment || !item.element) return null;
  const pair = CATALYSTS[item.element];
  if (!pair) return null;
  return temp >= CATALYST_HOT_AT ? pair.hot : pair.cold;
}

/** Every catalyst, for the codex and for enumeration/counting. */
export const CATALYST_LIST = Object.values(CATALYSTS).flatMap(p => [p.cold, p.hot]);
