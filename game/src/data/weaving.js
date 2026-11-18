// ══════════════════════════════════════════════════════════
// The Ancient Craft — Weaving
//
// ── WHAT THIS REPLACES ────────────────────────────────────
// Potions and the cauldron. Entirely. Owner's brief: make the power
// system Shadow-Slave-shaped rather than a fantasy-alchemy shape
// wearing dark-fantasy paint.
//
// Boiling reagents in a pot is a cosy-fantasy verb. It sat wrong next
// to a game about a broken sky, Descents, and a Pioneer who is slowly
// being rewritten by what they cast. Weaving is the right verb: you
// draw threads out of things that are already dead or already broken,
// and you tie them into a shape that holds.
//
// ── WHAT IS DELIBERATELY KEPT ─────────────────────────────
// The ENGINE, unchanged, because it was already the good part and it
// is verified. BrewProcess's ordered Working — the non-commutative
// first-defines / last-delivers rule, the state that lives between
// steps, the catalyst axis — maps onto weaving one-to-one and is the
// reason the craft has real depth:
//
//     pot temperature   → thread TENSION
//     ingredient        → THREAD
//     technique         → HANDLING
//     catalyst fragment → CORE
//     brew              → WEAVE
//
// ⚠️ This is a RE-THEME plus an extension, not a rewrite. The
// resolver, the 1,380-identity spell space, the recipe book and the
// order-dependence are all still the same verified code underneath.
// Anyone tempted to "properly rewrite" this should read BrewProcess's
// header first and understand what was measured before touching it.
//
// ── VOCABULARY ────────────────────────────────────────────
// Original throughout, in the same register as Pioneer / Fracture /
// Descent / Ascent. Nothing lifted:
//   Thread    — what you draw from a reagent. The raw stuff.
//   Tension   — how taut the weave is held. Replaces heat.
//   Ply       — twisting strands together. Replaces stirring.
//   Set       — letting the weave settle. Replaces resting.
//   Sunder    — splitting the next thread. Replaces grinding.
//   Core      — a Descent fragment, bound into the weave.
//   The Loom  — where it is done.
//   A Weave   — the finished thing.
// ══════════════════════════════════════════════════════════

/**
 * The handling techniques, as data — the UI renders buttons and
 * tooltips from this one table.
 *
 * ⚠️ `op` values are UNCHANGED from BrewProcess.OPS on purpose. The
 * resolver still speaks the old vocabulary internally, and remapping
 * the ops would mean touching verified chemistry to achieve a rename.
 * This table is the translation layer: new names and new fiction over
 * the same operations.
 */
export const HANDLINGS = [
  {
    op: 'heat',
    name: 'Draw Taut',
    verb: 'tension',
    blurb: 'Pull the thread tight. What you tie in next bites harder and holds worse.',
  },
  {
    op: 'cool',
    name: 'Give Slack',
    verb: 'slack',
    blurb: 'Let it hang. Whatever is already tied stays exactly as it is. Costs strength.',
  },
  {
    op: 'stir',
    name: 'Ply',
    verb: 'ply',
    blurb: 'Twist the strands together. Steadies a fighting weave — and blurs a distinctive one into rope.',
  },
  {
    op: 'rest',
    name: 'Let It Set',
    verb: 'set',
    blurb: 'Stop and let it take. The loosest strands slip out; what stays is cleaner and narrower.',
  },
  {
    op: 'crush',
    name: 'Sunder',
    verb: 'sunder',
    blurb: 'Split the next thread lengthways. Twice the substance, half the clarity.',
  },
];

/** Tension past which the weave starts to fray — the old scorch line. */
export const FRAY_AT = 0.82;

/**
 * How taut the loom reads, in words.
 *
 * Qualitative on purpose: "0.63" tells a weaver nothing about what to
 * do next; "drum-tight, well-plied" tells them everything.
 */
export function describeLoom(s) {
  if (!s) return '';
  const tension = s.scorched ? 'fraying'
    : s.temp > 0.7 ? 'drum-tight'
    : s.temp > 0.45 ? 'taut'
    : s.temp > 0.2 ? 'slack'
    : 'hanging loose';
  const plied = s.agitation > 0.75 ? ', plied to rope'
    : s.agitation > 0.35 ? ', well plied'
    : '';
  const set = s.rested > 1 ? ', long set' : s.rested ? ', set' : '';
  return `${tension}${plied}${set}`;
}

/**
 * The narration line for each operation, in the craft's own voice.
 * Keyed by the resolver's op id so BrewProcess can look them up
 * without knowing anything about weaving.
 */
export const HANDLING_LOG = {
  heat_up:      'The thread comes up taut.',
  heat_fray:    'A strand goes. This is a different shape now.',
  cool:         'The weave slackens and holds.',
  ply:          'You twist it through.',
  ply_flat:     'It has gone to rope. There is nothing distinct left in it.',
  rest:         'It sets. Something loose slips free and is gone.',
  crush:        'You split the next thread down its length.',
  add:          (name, taut) => `${name} ties in${taut ? ', and pulls' : ''}.`,
  core:         (blurb) => `A Core binds into the weave. ${blurb}`,
  core_replace: (suffix) => `The ${suffix.toLowerCase()} aspect takes the weave from what was already bound.`,
  react:        'The strands fight. What you just tied in did not want to meet what was already there.',
  layer:        'It lies down alongside without arguing. Slack was the right call.',
};

/**
 * What the craft calls a reagent once it is on the loom.
 *
 * Threads are drawn FROM things — a thread of ash, a thread of frost.
 * This is presentation only; the item ids are untouched.
 */
export function threadName(item) {
  if (!item) return 'something';
  if (item.isFragment) return item.name;          // Cores keep their own name
  return `a thread of ${item.name.toLowerCase()}`;
}
