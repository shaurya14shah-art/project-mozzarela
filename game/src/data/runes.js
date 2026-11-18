// ══════════════════════════════════════════════════════════
// Runes — you DRAW them
//
// ── THE DESIGN, AND WHERE IT COMES FROM ───────────────────
// Two sources, and they agree with each other.
//
// In the fiction this riffs on, runes are *translated from string
// patterns* — the shape the weaver's hands made becomes the written
// sign. Runic sorcery is described as building blocks that shape the
// movement of power to express the weaver's will.
//
// Mechanically, the reference the owner named is Hex Casting: a
// hexagonal grid of dots, and you click and drag from dot to dot to
// draw a pattern. Finishing a pattern runs its action. Unknown shapes
// are not errors to be prevented — they are mishaps, and finding a
// real one is the discovery.
//
// So runes are drawn, not chosen from a menu, and the space of things
// you can draw is unbounded. That is what "infinite potential" has to
// mean mechanically: a combinatorial space you explore, not a longer
// table you unlock.
//
// ── THE TWO LAYERS, AND WHY THEY ARE SEPARATE ─────────────
//   HANDLING (buttons)  drives the CHEMISTRY — tension, ply, set,
//                       sunder. Verified, order-dependent, unchanged.
//   THE SIGIL (drawn)   is the RUNE. It is the creative layer, and it
//                       is deliberately not derivable from the
//                       chemistry: two weavers can make the same
//                       substance and sign it differently.
//
// ⚠️ Runes used to be matched from the handling-op SEQUENCE. That
// worked and was measured, but it meant the rune was just a readout of
// what you had already done — there was no room for creativity in it,
// because the shape was a side effect rather than a choice. Drawing is
// the whole point.
//
// ── SIGNATURE ENCODING ────────────────────────────────────
// A drawn path is stored the way Hex Casting stores one: the first
// segment sets the heading, and every segment after it is recorded as
// a TURN relative to the one before.
//
//     w = straight on      a = 60° left      q = 120° left
//                          e = 60° right     d = 120° right
//
// Turning 180° is a backtrack and is rejected while drawing.
//
// This makes a sigil ROTATION-INVARIANT: the same shape drawn facing
// any of the six directions is the same rune. That is a deliberate
// kindness — demanding a specific orientation would make the craft a
// memory test rather than a drawing one.
//
// ⚠️ A signature is therefore one segment SHORTER than the path. A
// two-dot line has no signature at all (no turns), which is why the
// simplest rune below is three dots.
// ══════════════════════════════════════════════════════════

import { ELEMENTS } from './constants.js';

/**
 * The runes.
 *
 * `sig` is the turn-signature (see the header). `mods` multiply the
 * finished weave; `effect` merges into its effect package. Both apply
 * AFTER catalysts, so a rune can push a catalysed weave further but
 * never silently replaces its identity.
 *
 * `glyph` is stroked SVG for the UI — geometry, never texture, per the
 * house rules.
 *
 * ⚠️ Signatures must be UNIQUE and none may be a prefix of another in
 * a way that makes the longer one unreachable. Verified by
 * enumeration, not by reading — see the sweep in the notes.
 */
export const RUNES = [
  // ── THREE DOTS: one turn. The shapes a new weaver finds first. ──
  {
    id: 'binding', name: 'Binding', sig: 'w',
    blurb: 'A straight pull. The oldest sign there is: it makes things hold.',
    glyph: 'M20 50 L80 50 M65 38 L80 50 L65 62',
    mods: { charges: 1.2, instability: 0.75 },
    effect: { bind: 2 },
  },
  {
    id: 'severance', name: 'Severance', sig: 'd',
    blurb: 'A hard turn right. Whatever this touches comes apart along a line.',
    glyph: 'M20 75 L50 25 L80 75',
    mods: { damage: 1.2 },
    effect: { pierce: true },
  },
  {
    id: 'patience', name: 'Patience', sig: 'a',
    blurb: 'A slow bend left. It is not in a hurry and neither is what it does.',
    glyph: 'M25 70 Q50 20 75 70',
    mods: { charges: 1.35 },
    effect: { duration: 8, tickRate: 1 },
  },

  // ── FOUR DOTS: two turns. ──
  {
    id: 'the_vessel', name: 'The Vessel', sig: 'dd',
    blurb: 'Three sides closing. It holds more than it should.',
    glyph: 'M50 20 L80 72 L20 72 Z',
    mods: { charges: 1.5, mana: 0.82 },
  },
  {
    id: 'the_edge', name: 'The Edge', sig: 'ee',
    blurb: 'A shallow curve that ends pointing away. It cuts on the way past.',
    glyph: 'M20 70 L45 30 L75 40 L80 72',
    mods: { damage: 1.28 },
    effect: { pierce: true, sunder: 0.2 },
  },
  {
    id: 'the_snare', name: 'The Snare', sig: 'ae',
    blurb: 'Left then right. It does not look like a trap until it is one.',
    glyph: 'M20 70 Q40 25 55 55 Q70 80 82 40',
    mods: { damage: 1.1, charges: 1.15 },
    effect: { snare: 2.5 },
  },
  {
    id: 'the_wave', name: 'The Wave', sig: 'ea',
    blurb: 'Right then left. It keeps going after you have stopped.',
    glyph: 'M18 55 Q34 25 50 55 Q66 85 82 55',
    mods: { speed: 1.25 },
    effect: { echo: 0.35 },
  },

  // ── FIVE DOTS: three turns. Deliberate shapes. ──
  {
    // ⚠️ 'ddd' was geometrically IMPOSSIBLE and shipped that way for
    // one commit. On a hex grid a triangle closes after two 120° turns
    // ('dd'), so a third retraces the first edge and no legal path can
    // produce it. Caught by enumerating every drawable signature on the
    // real grid rather than by looking at the letters and assuming.
    // Any new rune must be checked against that enumeration.
    id: 'the_hearth', name: 'The Hearth', sig: 'ded',
    blurb: 'It turns, runs, and turns back. Everything inside it stays inside it.',
    glyph: 'M25 25 L75 25 L75 75 L25 75 Z',
    mods: { charges: 1.35, instability: 0.5 },
    effect: { bind: 3, steady: true },
  },
  {
    id: 'unmaking', name: 'Unmaking', sig: 'dqd',
    blurb: 'It turns against itself twice. Very little survives being asked this.',
    glyph: 'M50 15 L25 50 L50 85 L75 50 Z M25 50 L75 50',
    mods: { damage: 1.6, charges: 0.6, instability: 1.5 },
    effect: { shatter: true },
  },
  {
    id: 'hunger', name: 'Hunger', sig: 'qdq',
    blurb: 'A shape that opens inward. It takes something out of what it meets.',
    glyph: 'M30 25 Q50 60 70 25 M30 75 Q50 40 70 75',
    mods: { damage: 1.3 },
    effect: { drain: 0.18 },
  },
  {
    id: 'stillness', name: 'Stillness', sig: 'waw',
    blurb: 'Straight, a small turn, straight again. It stops arguing with itself.',
    glyph: 'M15 60 L45 60 L60 40 L88 40',
    mods: { instability: 0.25, mana: 0.72 },
    effect: { silent: true },
  },

  // ── SIX DOTS AND UP: the hard ones. ──
  // Long enough that nobody draws one by accident, so finding one is a
  // genuine discovery rather than a reward for persistence.
  {
    id: 'the_closed_ring', name: 'The Closed Ring', sig: 'eeeee',
    blurb: 'Six sides, closed. The hardest honest shape, and it gives back what it costs.',
    glyph: 'M50 12 L83 31 L83 69 L50 88 L17 69 L17 31 Z',
    mods: { damage: 1.35, charges: 1.35, mana: 0.7, instability: 0.55 },
    effect: { bind: 4, steady: true },
  },
  {
    id: 'the_long_pull', name: 'The Long Pull', sig: 'wwww',
    blurb: 'Five dots in a dead straight line. Nothing bends. Nothing survives it either.',
    glyph: 'M12 50 L88 50 M70 36 L88 50 L70 64',
    mods: { damage: 1.7, charges: 0.65, instability: 1.4 },
    effect: { pierce: true, overreach: true },
  },
  {
    id: 'the_turned_thread', name: 'The Turned Thread', sig: 'qwedq',
    blurb: 'Nobody draws this by accident. Whatever it signs was not asked for.',
    glyph: 'M50 18 A32 32 0 1 1 18 50 M50 18 L50 50 L18 50 M34 66 L66 34',
    mods: { damage: 1.25, charges: 1.4, mana: 0.65, instability: 0.7 },
    effect: { turned: true },
  },
];

/** The hand-authored runes, by id and by signature. */
export const RUNE_BY_ID = Object.fromEntries(RUNES.map(r => [r.id, r]));
export const RUNE_BY_SIG = Object.fromEntries(RUNES.map(r => [r.sig, r]));

// ── THE HEX GRID ──────────────────────────────────────────
//
// ⚠️ CLOCKWISE ON SCREEN, and it must stay that way. hexToPixel maps
// +r to +y and +y is DOWN; an earlier counter-clockwise ordering left
// every rune blurb describing "a turn right" for a shape that bends
// left. Reordering this silently redefines every rune in the game.
export const HEX_DIRS = [
  { q: +1, r:  0 },  // 0  E
  { q:  0, r: +1 },  // 1  SE
  { q: -1, r: +1 },  // 2  SW
  { q: -1, r:  0 },  // 3  W
  { q:  0, r: -1 },  // 4  NW
  { q: +1, r: -1 },  // 5  NE
];

/**
 * Grid radius.
 *
 * ⚠️ Raised from 3 to 5. At radius 3 the field was 37 dots and the
 * longest useful path was ~6 segments, which capped the whole craft:
 * the owner's report was that the space "is too less and doesn't
 * sustain". Radius 5 is 91 dots and supports paths long enough that
 * the shape itself carries real information.
 */
export const GRID_RADIUS = 5;

/** Every axial cell within `radius` of the origin, for the grid. */
export function hexField(radius = GRID_RADIUS) {
  const out = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      out.push({ q, r });
    }
  }
  return out;
}

/** Pixel centre of an axial cell, pointy-top layout. */
export function hexToPixel({ q, r }, size) {
  return { x: size * Math.sqrt(3) * (q + r / 2), y: size * 1.5 * r };
}

/** Which of HEX_DIRS takes `a` to `b`, or -1 if they are not adjacent. */
export function headingBetween(a, b) {
  const dq = b.q - a.q, dr = b.r - a.r;
  return HEX_DIRS.findIndex(d => d.q === dq && d.r === dr);
}

/** Turn code per (next - prev) mod 6. Index 3 is a 180° backtrack. */
const TURN_CODE = ['w', 'e', 'd', null, 'q', 'a'];
/** How many 60° steps each code turns, signed: right positive. */
const TURN_ANGLE = { w: 0, e: 1, d: 2, q: -2, a: -1 };

/**
 * Turn a drawn path into a turn-signature. See the file header.
 * @returns {string|null} null if the path is illegal (non-adjacent hop
 *   or a 180° reversal)
 */
export function pathSignature(path) {
  if (!path || path.length < 2) return '';
  const headings = [];
  for (let i = 1; i < path.length; i++) {
    const h = headingBetween(path[i - 1], path[i]);
    if (h < 0) return null;
    headings.push(h);
  }
  let sig = '';
  for (let i = 1; i < headings.length; i++) {
    const code = TURN_CODE[(headings[i] - headings[i - 1] + 6) % 6];
    if (!code) return null;
    sig += code;
  }
  return sig;
}

// ══════════════════════════════════════════════════════════
// GENERATIVE RUNES — every shape means something
//
// ⚠️ THE OLD SYSTEM WAS A 14-ENTRY LOOKUP. Draw one of fourteen exact
// signatures and get an effect; draw anything else and get "this shape
// signs nothing yet". That is 14 meaningful shapes out of thousands
// drawable, so ~99.6% of everything a player could draw was a dead
// end. It could not sustain interest past finding the fourteen.
//
// Now the shape's own GEOMETRY produces the effect. Five independent
// properties are read off the drawn path, and each maps to a different
// axis of the result:
//
//   LENGTH      how many segments      → magnitude
//   WINDING     net turning            → binds (curls) vs pierces (straight)
//   CLOSURE     returns to its start   → containment, charges
//   CHIRALITY   left-biased vs right   → control vs aggression
//   ENTROPY     variety of turns       → instability, and reach
//
// So every legal shape is a real rune with real numbers, and two
// similar shapes give similar results — which is what makes the space
// explorable rather than a memory game.
//
// The hand-authored RUNES above are still special: they are exact
// signatures with authored names, blurbs and bonus effects layered ON
// TOP of the derived values. They are the landmarks in a continuous
// space, not the whole of it.
// ══════════════════════════════════════════════════════════

/**
 * Read the geometry of a drawn path.
 *
 * All five properties are normalised to roughly 0..1 (chirality and
 * winding are signed) so the mapping below can stay readable.
 */
export function analyseSigil(path) {
  const sig = pathSignature(path);
  if (sig === null) return null;
  const segments = Math.max(0, (path?.length || 0) - 1);
  if (segments < 2) return null;

  let turnSum = 0, left = 0, right = 0;
  const counts = {};
  for (const ch of sig) {
    const a = TURN_ANGLE[ch] ?? 0;
    turnSum += a;
    if (a < 0) left++; else if (a > 0) right++;
    counts[ch] = (counts[ch] || 0) + 1;
  }

  // Closure: does the path end where it began?
  const a = path[0], b = path[path.length - 1];
  const closed = a.q === b.q && a.r === b.r;

  // Entropy: how many DIFFERENT turn codes were used, normalised by
  // the five that exist. A straight line scores 0; a shape that uses
  // every kind of turn scores 1.
  const distinct = Object.keys(counts).length;
  const entropy = sig.length ? (distinct - 1) / 4 : 0;

  // ── Dominant turn: which gesture the shape is MADE of ──
  // ⚠️ This is the axis that actually makes the space large. Without
  // it the derivation collapsed 17,184 distinct signatures into 228
  // outcomes, because length/winding/closure/chirality are all coarse
  // and correlated. The dominant code partitions the space five ways
  // before any of the continuous properties apply.
  let dominant = 'w', domCount = -1;
  for (const [k, v] of Object.entries(counts)) {
    if (v > domCount || (v === domCount && k < dominant)) { dominant = k; domCount = v; }
  }

  // Symmetry: is the gesture the same drawn backwards? A palindromic
  // signature is a shape that reads the same either way, which is a
  // real and findable property rather than a derived number.
  const rev = sig.split('').reverse().join('');
  const symmetric = sig.length > 1 && sig === rev;

  // Longest unbroken straight run — 'focus'. A shape with a long
  // straight in it behaves differently from one that never commits.
  let run = 0, best = 0;
  for (const ch of sig) { if (ch === 'w') { run++; best = Math.max(best, run); } else run = 0; }

  const turns = sig.length || 1;
  return {
    sig,
    segments,
    closed,
    dominant,
    domShare: domCount / turns,
    symmetric,
    focus: Math.min(1, best / 5),
    // Net winding in full turns. ±1 is one complete revolution.
    winding: turnSum / 6,
    // −1 all left, +1 all right, 0 balanced.
    chirality: turns ? (right - left) / turns : 0,
    // 0 straight, 1 maximally varied.
    entropy: Math.max(0, Math.min(1, entropy)),
    // 0..1 over a wider range than before — saturating at 12 wasted
    // the top of the grid, which is now 91 dots wide.
    length: Math.min(1, segments / 20),
  };
}

/**
 * The rune a path signs.
 *
 * Always returns something for a legal path of 3+ dots — there is no
 * "means nothing" any more. Named runes come back with their authored
 * identity attached; everything else is a derived rune with a
 * descriptive name built from its own geometry.
 */
export function runeForPath(path) {
  const g = analyseSigil(path);
  if (!g) return null;

  const named = RUNE_BY_SIG[g.sig] || null;
  const derived = _deriveRune(g);

  if (!named) return derived;
  // A named rune keeps its authored name and blurb, and its authored
  // mods are applied ON TOP of the derived ones — so a True Rune is
  // strictly a landmark in the same continuous space, never a
  // replacement for it.
  return {
    ...derived,
    id: named.id,
    name: named.name,
    blurb: named.blurb,
    glyph: named.glyph,
    named: true,
    mods: _combine(derived.mods, named.mods || {}),
    effect: { ...derived.effect, ...(named.effect || {}) },
  };
}

/** Names for derived runes, built from the shape's own dominant trait. */
function _deriveName(g) {
  const fam = DOMINANT_FAMILY[g.dominant] || DOMINANT_FAMILY.w;
  const parts = [];
  // ⚠️ Read the SAME property the blurb reads. 'Straight' used to be
  // keyed on low entropy while the blurb's "it curls / it runs
  // straight" line is keyed on WINDING — so a tight spiral of all-left
  // turns (low entropy, high winding) came out named "Straight
  // Withdrawing" while its own description said "It curls, so it
  // holds." Two readouts describing one shape must not contradict.
  if (g.closed) parts.push('Closed');
  else if (Math.abs(g.winding) > 0.6) parts.push('Coiled');
  else if (Math.abs(g.winding) < 0.15) parts.push('Straight');

  if (g.chirality < -0.45) parts.push('Withdrawing');
  else if (g.chirality > 0.45) parts.push('Driving');
  else if (g.entropy > 0.7) parts.push('Broken');
  else parts.push('Even');

  const scale = g.length > 0.7 ? 'Great ' : g.length < 0.25 ? 'Lesser ' : '';
  const sym = g.symmetric ? 'Mirrored ' : '';
  return `${scale}${sym}${parts.join(' ')} ${fam.name}`;
}

/**
 * What the shape's dominant gesture DOES.
 *
 * Five families, one per turn code, each with its own behavioural tag.
 * This is deliberately the coarsest and most learnable rule in the
 * system: a player who notices "shapes full of hard right turns burn
 * things" has learned something real and transferable.
 */
const DOMINANT_FAMILY = {
  w: { tag: 'lance',   effect: { pierce: true },              damage: 1.15, name: 'Lance' },
  e: { tag: 'chain',   effect: { chain: 2, chainFalloff: 0.7 }, damage: 1.0,  name: 'Chain' },
  d: { tag: 'burst',   effect: { explode: true },             damage: 1.2,  radius: 1.5, name: 'Burst' },
  a: { tag: 'linger',  effect: { duration: 6, tickRate: 1 },  damage: 0.85, name: 'Linger' },
  q: { tag: 'drain',   effect: { drain: 0.15 },               damage: 0.95, name: 'Drain' },
};

function _deriveRune(g) {
  // ── The mapping. Each property owns ONE axis, so the player can
  // learn them independently by experiment.
  const mods = {};
  const effect = {};

  // LENGTH → magnitude, on both damage and cost.
  mods.damage = 0.85 + g.length * 0.75;            // 0.85 … 1.60
  mods.mana = 1.15 - g.length * 0.30;              // longer is cheaper per point

  // WINDING → curls bind, straights pierce.
  const w = Math.abs(g.winding);
  if (w > 0.45) {
    mods.charges = 1 + w * 0.5;
    effect.bind = Math.round(1 + w * 3);
  } else {
    effect.pierce = true;
    mods.speed = 1 + (0.45 - w) * 0.6;
  }

  // CLOSURE → containment.
  if (g.closed) {
    mods.charges = (mods.charges ?? 1) * 1.35;
    mods.instability = 0.7;
    effect.steady = true;
  }

  // CHIRALITY → control vs aggression.
  if (g.chirality > 0.2) {
    mods.damage *= 1 + g.chirality * 0.25;
    mods.instability = (mods.instability ?? 1) * (1 + g.chirality * 0.3);
  } else if (g.chirality < -0.2) {
    mods.mana *= 1 + g.chirality * 0.25;           // chirality is negative → cheaper
    mods.instability = (mods.instability ?? 1) * (1 + g.chirality * 0.35);
  }

  // ENTROPY → instability and reach.
  mods.instability = (mods.instability ?? 1) * (0.75 + g.entropy * 0.9);
  if (g.entropy > 0.6) effect.erratic = true;

  // DOMINANT GESTURE → the effect family. See DOMINANT_FAMILY.
  const fam = DOMINANT_FAMILY[g.dominant] || DOMINANT_FAMILY.w;
  Object.assign(effect, fam.effect);
  mods.damage *= fam.damage;
  if (fam.radius) mods.radius = (mods.radius ?? 0) + fam.radius;
  // How PURELY the shape is made of that gesture sharpens it.
  mods.damage *= 1 + (g.domShare - 0.4) * 0.35;

  // SYMMETRY → a clean, repeatable shape is a stable one.
  if (g.symmetric) {
    mods.instability = (mods.instability ?? 1) * 0.7;
    mods.charges = (mods.charges ?? 1) * 1.2;
    effect.balanced = true;
  }

  // FOCUS → a long straight inside the shape drives it forward.
  if (g.focus > 0.3) {
    mods.speed = (mods.speed ?? 1) * (1 + g.focus * 0.4);
    mods.damage *= 1 + g.focus * 0.2;
  }

  return {
    id: `sigil_${g.sig}`,
    name: _deriveName(g),
    blurb: _describe(g),
    glyph: null,          // derived runes draw their own path in the UI
    named: false,
    geometry: g,
    mods,
    effect,
  };
}

/** Plain-language read of a shape, so the player can learn the rules. */
function _describe(g) {
  const bits = [];
  bits.push(g.length > 0.75 ? 'Long and deliberate.'
    : g.length < 0.3 ? 'Short and quick.' : 'Measured.');
  bits.push(Math.abs(g.winding) > 0.45
    ? 'It curls, so it holds.' : 'It runs straight, so it goes through.');
  if (g.closed) bits.push('Closed — nothing it catches gets out.');
  if (g.chirality > 0.45) bits.push('Driven hard to the right; it hits harder and steadies less.');
  if (g.chirality < -0.45) bits.push('Drawn back to the left; cheaper, and calmer.');
  if (g.entropy > 0.6) bits.push('It changes its mind a great deal.');
  return bits.join(' ');
}

const MULT_KEYS = new Set(['damage', 'charges', 'mana', 'instability', 'radius', 'speed']);

function _combine(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (MULT_KEYS.has(k)) out[k] = (out[k] ?? 1) * v;
    else out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

/** The rune for an already-computed signature, if it is a named one. */
export function runeForSignature(sig) {
  return RUNE_BY_SIG[sig] || null;
}

/**
 * Fold several runes' modifiers together.
 *
 * ⚠️ Multiplicative keys MULTIPLY, additive keys SUM, and the kind is
 * declared rather than inferred from the name — `damage` and `drain`
 * look equally numeric at a call site, and getting it backwards
 * silently doubles or halves a weave.
 */
export function foldRunes(runes) {
  const list = (runes || []).filter(Boolean);
  let mods = {};
  const effect = {};
  for (const r of list) {
    mods = _combine(mods, r.mods || {});
    Object.assign(effect, r.effect || {});
  }

  // ── CONFLUENCE ────────────────────────────────────────
  // ⚠️ Stacking signs used to be almost pointless. `_combine` is a
  // plain product, and derived runes sit near 1.0 on every
  // multiplicative key by construction — so four signs multiplied out
  // to roughly the same weave as one, and the player correctly read
  // the whole mechanic as decorative.
  //
  // Confluence makes the COUNT itself a term. It is superlinear on
  // purpose: the owner asked for many signs to produce "something new,
  // unique and absolutely insane", and a linear bonus cannot do that —
  // it just makes six signs slightly better than five.
  //
  // ⚠️ Instability rises with it and is NOT optional. This is the only
  // thing stopping "lay every rune you know" from being the single
  // correct move in the game; a six-sign weave should be a genuinely
  // dangerous object, not a free upgrade. See BrewProcess for what
  // instability actually does when it goes off.
  const n = list.length;
  const confluence = CONFLUENCE_TIERS.find(t => n >= t.min) || null;
  if (confluence && n >= 2) {
    // Escalation is on the EXCESS over one sign, squared — so 2 signs
    // is a nudge and 6 is a different object.
    const excess = n - 1;
    const swell = 1 + Math.pow(excess, 1.65) * 0.13;
    mods.damage = (mods.damage ?? 1) * swell;
    mods.radius = (mods.radius ?? 1) * (1 + excess * 0.10);
    mods.charges = (mods.charges ?? 1) * (1 + excess * 0.07);
    // ⚠️ A FLOOR, not just a multiplier.
    //
    // Individual runes multiply instability by values well under 1
    // (a calm shape is *supposed* to steady a weave), and with seven
    // of them folded together those products cancelled the escalation
    // completely — measured across 1..7 signs it came out
    // 0.52 → 1.06 → 0.87 → 0.97, i.e. NOT MONOTONIC. A seven-sign
    // weave was landing 16× damage at below-baseline instability: a
    // free win, and the single correct move in the game.
    //
    // The brake has to be something the stack cannot buy its way out
    // of, so the count sets a minimum the folded product may not go
    // under. Stacking signs is still the way to something enormous —
    // it just cannot also be the way to something SAFE.
    const rise = 1 + Math.pow(excess, 1.4) * 0.16;
    mods.instability = Math.max((mods.instability ?? 1) * rise, 1 + excess * 0.19);
    mods.mana = (mods.mana ?? 1) * (1 + excess * 0.11);
  }

  return { mods, effect, count: n, confluence };
}

/**
 * What a stack of signs is CALLED, and what it adds beyond numbers.
 *
 * The name is the point. A weave that reads "Sixfold · The Unspeaking
 * Choir" is a different object in the player's head from one that
 * reads "+64% damage", and this craft has always been about identity
 * rather than stat soup (see the file header).
 *
 * ⚠️ Ordered HIGHEST FIRST — `find(t => n >= t.min)` takes the first
 * match, so a low-first order would pin every stack to the bottom tier
 * forever. This exact ordering bug is why the table is not sorted
 * alphabetically or by name.
 */
export const CONFLUENCE_TIERS = [
  { min: 7, id: 'unspeaking', name: 'The Unspeaking Choir',
    blurb: 'Seven signs and none of them are yours any more. It goes off whether you meant it or not.' },
  { min: 6, id: 'sixfold', name: 'Sixfold Confluence',
    blurb: 'Six. The air around the loom has started disagreeing with itself.' },
  { min: 5, id: 'cascade', name: 'The Cascade',
    blurb: 'Five signs fold into one another and keep folding.' },
  { min: 4, id: 'braid', name: 'The Braid',
    blurb: 'Four strands, and you can no longer point at which does what.' },
  { min: 3, id: 'triune', name: 'Triune Sign',
    blurb: 'Three signs holding each other up.' },
  { min: 2, id: 'paired', name: 'Paired Sign',
    blurb: 'Two signs, arguing productively.' },
];
