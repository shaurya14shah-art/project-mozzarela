// ══════════════════════════════════════════════════════════
// Sigils — the icon system
//
// There are no art assets and there never will be: a spell in this
// game doesn't exist until it's brewed, and there are 60 matrix
// cells plus 20 fusions across 5 forms. No one can draw 160+ icons
// for things that don't exist yet.
//
// So icons are *composed*, not drawn. Every sigil is an alchemical
// element glyph set inside a frame that encodes the spell's form:
//
//     fire  ×  mire   →  the fire triangle, ringed by a stilled pool
//     void  ×  lance  →  the hollow ring, inside a spearhead
//
// Everything is stroked SVG in a 100×100 box using currentColor for
// the frame and an explicit element hue for the glyph, so a sigil
// inherits its surroundings and re-tints itself per theme for free.
// ══════════════════════════════════════════════════════════

import { ELEMENTS } from '../data/constants.js';
import { FORMS } from '../data/essences.js';

// ── ELEMENT GLYPHS ────────────────────────────────────────
// Drawn from the real alchemical vocabulary where one exists —
// the classical triangles for the four elements, ☉ for light,
// the hexagram for arcane — and extended in the same visual
// language where it doesn't.
const GLYPHS = {
  [ELEMENTS.FIRE]: `
    <path d="M50 20 L79 71 L21 71 Z"/>`,

  [ELEMENTS.WATER]: `
    <path d="M50 80 L21 29 L79 29 Z"/>`,

  [ELEMENTS.WIND]: `
    <path d="M50 20 L79 71 L21 71 Z"/>
    <path d="M33 57 L67 57"/>`,

  [ELEMENTS.EARTH]: `
    <path d="M50 80 L21 29 L79 29 Z"/>
    <path d="M33 43 L67 43"/>`,

  // Frozen water: the descending triangle locked by a crystal axis.
  [ELEMENTS.ICE]: `
    <path d="M50 78 L23 31 L77 31 Z"/>
    <path d="M50 24 L50 62"/>
    <path d="M36 38 L64 54"/>
    <path d="M64 38 L36 54"/>`,

  [ELEMENTS.LIGHTNING]: `
    <path d="M58 18 L33 51 L47 51 L42 82 L67 47 L53 47 Z"/>`,

  // A waxing dark — the crescent bitten out of a full disc.
  [ELEMENTS.SHADOW]: `
    <path d="M50 20 A30 30 0 1 0 50 80 A23 23 0 1 1 50 20 Z"/>`,

  // ☉ — the classical sign for gold and the sun.
  [ELEMENTS.LIGHT]: `
    <circle cx="50" cy="50" r="17"/>
    <circle cx="50" cy="50" r="3.5" fill="currentColor" stroke="none"/>
    <path d="M50 21 L50 12 M50 88 L50 79 M21 50 L12 50 M88 50 L79 50"/>
    <path d="M70 30 L76 24 M30 70 L24 76 M70 70 L76 76 M30 30 L24 24"/>`,

  // A ring with nothing in it, struck through.
  [ELEMENTS.VOID]: `
    <circle cx="50" cy="50" r="27"/>
    <path d="M31 69 L69 31"/>`,

  // As above, so below — the hexagram.
  [ELEMENTS.ARCANE]: `
    <path d="M50 19 L76 64 L24 64 Z"/>
    <path d="M50 81 L24 36 L76 36 Z"/>`,

  // The descending triangle of corrosion, with its two drops.
  [ELEMENTS.POISON]: `
    <path d="M50 78 L24 32 L76 32 Z"/>
    <circle cx="43" cy="49" r="4" fill="currentColor" stroke="none"/>
    <circle cx="57" cy="49" r="4" fill="currentColor" stroke="none"/>`,

  // Salt — inert, unaligned matter.
  [ELEMENTS.NEUTRAL]: `
    <circle cx="50" cy="50" r="27"/>
    <path d="M23 50 L77 50"/>`,
};

// ── FORM FRAMES ───────────────────────────────────────────
// The container tells you how the spell is delivered, before you
// read a word of text.
const FRAMES = {
  // Focused, driven to a point.
  [FORMS.LANCE]: `
    <path d="M50 3 L74 24 L74 76 L50 97 L26 76 L26 24 Z"/>
    <path d="M50 3 L50 15 M50 85 L50 97"/>`,

  // Detonating outward.
  [FORMS.BLOOM]: `
    <circle cx="50" cy="50" r="43"/>
    <path d="M50 7 L50 1 M50 99 L50 93 M7 50 L1 50 M99 50 L93 50"/>
    <path d="M80 20 L84 16 M20 80 L16 84 M80 80 L84 84 M20 20 L16 16"/>`,

  // Settled, lingering — a pool that stays where it fell.
  [FORMS.MIRE]: `
    <path d="M8 62 Q22 54 36 62 T64 62 T92 62"/>
    <path d="M8 74 Q22 66 36 74 T64 74 T92 74"/>
    <path d="M8 86 Q22 78 36 86 T64 86 T92 86"/>
    <path d="M10 50 A40 40 0 0 1 90 50"/>`,

  // Turned inward — a shield.
  [FORMS.WARD]: `
    <path d="M50 4 L90 18 L90 54 Q90 84 50 97 Q10 84 10 54 L10 18 Z"/>`,

  // Seekers, already in orbit.
  [FORMS.HUNT]: `
    <path d="M22 28 A38 38 0 0 1 78 28"/>
    <path d="M92 58 A38 38 0 0 1 62 92"/>
    <path d="M38 92 A38 38 0 0 1 8 58"/>
    <circle cx="50" cy="8" r="5" fill="currentColor" stroke="none"/>
    <circle cx="86" cy="72" r="5" fill="currentColor" stroke="none"/>
    <circle cx="14" cy="72" r="5" fill="currentColor" stroke="none"/>`,
};

// ── ITEM-CLASS MARKS ──────────────────────────────────────
// For things that aren't spells: gear, raw stock, the wand itself.
const MARKS = {
  reagent: `
    <circle cx="50" cy="50" r="43"/>`,
  dust: `
    <circle cx="50" cy="50" r="43" stroke-dasharray="5 7"/>`,
  armor: `
    <path d="M50 4 L90 18 L90 54 Q90 84 50 97 Q10 84 10 54 L10 18 Z"/>`,
  weapon: `
    <path d="M50 6 L62 32 L62 74 L50 94 L38 74 L38 32 Z"/>
    <path d="M30 66 L70 66"/>`,
  wand: `
    <path d="M28 82 L66 30"/>
    <path d="M72 12 L76 24 L88 28 L76 32 L72 44 L68 32 L56 28 L68 24 Z"/>`,
  refined: `
    <path d="M20 34 L50 16 L80 34 L80 66 L50 84 L20 66 Z"/>`,
};

const GLYPH_SCALE = 0.62;   // glyph sits inside the frame, not on it

function _glyphFor(element) {
  return GLYPHS[element] || GLYPHS[ELEMENTS.NEUTRAL];
}

/**
 * Compose a sigil.
 *
 * @param {object} opts
 *   element   element id — colours and chooses the glyph
 *   form      form id; omit for a non-spell item
 *   mark      item-class mark name, used when `form` is absent
 *   color     explicit glyph colour (defaults to inheriting)
 *   size      pixel size; omit to let CSS size it
 *   className extra classes on the <svg>
 */
export function sigil({ element, form, mark, color, size, className = '' } = {}) {
  const frame = form ? FRAMES[form] : MARKS[mark || 'reagent'];
  const glyph = _glyphFor(element);
  const dim = size ? ` width="${size}" height="${size}"` : '';
  const tint = color ? ` style="color:${color}"` : '';

  // The glyph is scaled about the centre so it never collides with
  // the frame, whatever the frame's silhouette.
  const off = 50 * (1 - GLYPH_SCALE);

  return `<svg class="sigil ${className}" viewBox="0 0 100 100"${dim}${tint}
    fill="none" stroke="currentColor" stroke-width="4"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <g class="sigil-frame" opacity="0.45" stroke-width="3">${frame}</g>
    <g class="sigil-glyph" transform="translate(${off} ${off}) scale(${GLYPH_SCALE})">${glyph}</g>
  </svg>`;
}

/**
 * The right sigil for any item, spell or otherwise. This is what the
 * UI calls — it replaces every `item.icon` emoji lookup.
 */
export function sigilFor(item, opts = {}) {
  if (!item) return sigil({ element: ELEMENTS.NEUTRAL, mark: 'reagent', ...opts });

  if (item.isSpell && item.form) {
    return sigil({ element: item.element, form: item.form, ...opts });
  }

  let mark = 'reagent';
  if (item.isWand || item.type === 'weapon') mark = item.isWand ? 'wand' : 'weapon';
  else if (item.type === 'armor')   mark = 'armor';
  else if (item.isDust)             mark = 'dust';
  else if (item.type === 'refined') mark = 'refined';

  return sigil({ element: item.element || ELEMENTS.NEUTRAL, mark, ...opts });
}

/** Bare element glyph, no frame — for legends and balance bars. */
export function elementGlyph(element, opts = {}) {
  const { size, className = '', color } = opts;
  const dim = size ? ` width="${size}" height="${size}"` : '';
  const tint = color ? ` style="color:${color}"` : '';
  return `<svg class="sigil sigil-bare ${className}" viewBox="0 0 100 100"${dim}${tint}
    fill="none" stroke="currentColor" stroke-width="5"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    ${_glyphFor(element)}
  </svg>`;
}

/** Bare form frame, no glyph — for the Grimoire's column headers. */
export function formFrame(form, opts = {}) {
  const { size, className = '' } = opts;
  const dim = size ? ` width="${size}" height="${size}"` : '';
  return `<svg class="sigil sigil-bare ${className}" viewBox="0 0 100 100"${dim}
    fill="none" stroke="currentColor" stroke-width="4"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    ${FRAMES[form] || ''}
  </svg>`;
}

// ── CHROME ────────────────────────────────────────────────

/**
 * Corner filigree for panel frames. Four rotated copies of one
 * L-shaped flourish — this is the ornament that reads as "forged"
 * without needing a painted texture.
 */
export function cornerFiligree() {
  const arm = `
    <path d="M0 0 L26 0 M0 0 L0 26"/>
    <path d="M6 6 L18 6 M6 6 L6 18"/>
    <path d="M13 4 L13 0 M4 13 L0 13"/>`;
  return `<svg class="filigree" viewBox="0 0 100 100" preserveAspectRatio="none"
    fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
    <g>${arm}</g>
    <g transform="translate(100 0) scale(-1 1)">${arm}</g>
    <g transform="translate(0 100) scale(1 -1)">${arm}</g>
    <g transform="translate(100 100) scale(-1 -1)">${arm}</g>
  </svg>`;
}

/** The cauldron itself — a drawn vessel, for the brewing panel. */
export function vesselMark() {
  return `<svg class="sigil" viewBox="0 0 100 100" fill="none" stroke="currentColor"
    stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M14 40 L86 40 L79 78 Q77 88 66 88 L34 88 Q23 88 21 78 Z"/>
    <path d="M8 40 L92 40"/>
    <path d="M28 40 L28 30 Q28 22 36 22 L64 22 Q72 22 72 30 L72 40"/>
    <path d="M40 16 Q44 8 40 2 M60 16 Q64 8 60 2 M50 14 Q54 6 50 0"/>
  </svg>`;
}

/** The wand — the one item the whole game hangs off. */
export function wandMark() {
  return `<svg class="sigil" viewBox="0 0 100 100" fill="none" stroke="currentColor"
    stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M22 86 L62 34"/>
    <path d="M70 6 L75 20 L89 25 L75 30 L70 44 L65 30 L51 25 L65 20 Z"/>
  </svg>`;
}

/** A horizontal rule with a diamond at its centre — section breaks. */
export function ruleOrnament() {
  return `<svg class="rule-ornament" viewBox="0 0 200 10" preserveAspectRatio="none"
    fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true">
    <path d="M0 5 L88 5 M112 5 L200 5"/>
    <path d="M100 1 L106 5 L100 9 L94 5 Z" fill="currentColor"/>
  </svg>`;
}

/**
 * The Fracture itself, as a horizontal ornament — a jagged split with
 * a hairline running out of each end.
 *
 * ruleOrnament() is the neutral section break (a rule with a diamond).
 * This is the loaded one: the same stroked-geometry vocabulary, but
 * the shape is the game's own premise. Used on the title screens,
 * where a generic divider was doing nothing to say what this game is.
 * The `.fracture-rule-core` path is drawn twice — once thick and dim
 * as the wound, once thin and bright as what's coming through it —
 * which is the same "one emissive focal point" idea the 3D props use,
 * expressed in two strokes instead of a material.
 */
export function fractureRule() {
  const crack = 'M62 5 L70 2 L76 8 L84 1 L91 7 L98 3 L105 8 L112 2 L119 6 L127 3 L134 8 L138 5';
  return `<svg class="fracture-rule" viewBox="0 0 200 10" preserveAspectRatio="none"
    fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M0 5 L58 5 M142 5 L200 5" stroke-width="1"/>
    <path class="fracture-rule-wound" d="${crack}" stroke-width="3" opacity="0.35"/>
    <path class="fracture-rule-core" d="${crack}" stroke-width="1"/>
  </svg>`;
}

export { GLYPHS, FRAMES, MARKS };
