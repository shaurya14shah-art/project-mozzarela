// ══════════════════════════════════════════════════════════
// The Rune Grid — you draw the sign
//
// A hexagonal field of dots. Click and drag from dot to dot; the shape
// you draw is the rune. See data/runes.js for the encoding and for
// where the design comes from (the fiction's "runes translated from
// string patterns", and Hex Casting's drag-to-draw grid).
//
// ── DESIGN RULES THIS FOLLOWS ─────────────────────────────
// · ⚠️ EVERY legal shape signs something. There is no "this means
//   nothing" any more — that was the old 14-entry lookup, where ~99.6%
//   of drawable shapes were dead ends and the craft stopped sustaining
//   interest the moment you had found the fourteen. The shape's own
//   geometry now produces the rune (see runes.js), and the fourteen
//   authored ones are landmarks inside that continuous space.
// · Rotation-invariant matching (the signature is turn-relative), so
//   the same shape drawn facing any direction is the same rune. This
//   is a deliberate kindness: demanding an orientation would make the
//   craft a memory test.
// · Segments cannot be RETRACED, but dots can be revisited — that is
//   how a closed shape (triangle, ring) is drawn at all.
//
// ── IMPLEMENTATION ────────────────────────────────────────
// One inline SVG, pointer events, no canvas and no library. The grid
// is ~37 dots; hit-testing is a nearest-dot search over that list,
// which is far cheaper than anything cleverer would be and stays
// readable.
// ══════════════════════════════════════════════════════════

import {
  hexField, hexToPixel, headingBetween, pathSignature, runeForPath, GRID_RADIUS,
} from '../data/runes.js';

const R = GRID_RADIUS;  // 5 — 91 dots. Was 3 (37); see runes.js.
// ⚠️ SIZE is in viewBox units, and the SVG is CSS-scaled to fit
// `.rune-grid`'s max-width — so raising SIZE ALONE changes nothing on
// screen. The viewBox just gets bigger and scales back down to the
// same rendered width. The dial that actually makes the field bigger
// to draw on is the CSS max-width; SIZE only sets the ratio between
// cell spacing and dot radius.
//
// Owner asked for the same number of dots at a larger size. The dot
// COUNT is GRID_RADIUS's business (unchanged at 91) and the on-screen
// size is the stylesheet's.
const SIZE = 17;
const PAD = 16;
/** Dot radius and hit tolerance, both in viewBox units. */
const DOT_R = 5.0;

export class RuneGridUI {
  /**
   * @param {(rune, signature) => void} onSign called when a drag ends;
   *   `rune` is null for a mishap (an unrecognised shape).
   */
  constructor(onSign) {
    this.onSign = onSign;
    this.cells = hexField(R);
    this.path = [];
    this.usedSegments = new Set();
    this.drawing = false;
    this.el = null;
    this._pts = [];
  }

  mount(container) {
    const pts = this.cells.map(c => ({ cell: c, ...hexToPixel(c, SIZE) }));
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const w = Math.max(...xs) - minX + PAD * 2;
    const h = Math.max(...ys) - minY + PAD * 2;
    // Normalise into the viewBox so the field is centred regardless of
    // the axial layout's own origin.
    this._pts = pts.map(p => ({ ...p, x: p.x - minX + PAD, y: p.y - minY + PAD }));

    const el = document.createElement('div');
    el.className = 'rune-grid-wrap';
    el.innerHTML = `
      <svg class="rune-grid" viewBox="0 0 ${w} ${h}" aria-label="Rune grid">
        <path class="rune-trace" d="" fill="none" stroke="currentColor"
              stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>
        <g class="rune-dots">
          ${this._pts.map((p, i) =>
            `<circle cx="${p.x}" cy="${p.y}" r="${DOT_R}" data-i="${i}"/>`).join('')}
        </g>
      </svg>
      <div class="rune-grid-readout" id="rune-grid-readout">Draw a sign.</div>
    `;
    container.appendChild(el);
    this.el = el;
    this.svg = el.querySelector('svg');
    this.trace = el.querySelector('.rune-trace');
    this.readout = el.querySelector('#rune-grid-readout');
    this._bind();
    return el;
  }

  _bind() {
    const svg = this.svg;
    // Pointer events, not mouse — one code path covers mouse, pen and
    // touch, and setPointerCapture keeps the drag alive when the
    // cursor leaves the SVG mid-stroke (which it constantly does near
    // the edge dots).
    svg.addEventListener('pointerdown', (e) => {
      const i = this._nearest(e);
      if (i < 0) return;
      svg.setPointerCapture(e.pointerId);
      this.drawing = true;
      this.path = [this.cells[i]];
      this.usedSegments.clear();
      this._redraw();
      this._say('…');
    });

    svg.addEventListener('pointermove', (e) => {
      if (!this.drawing) return;
      const i = this._nearest(e, 17);
      if (i < 0) return;
      this._tryExtend(this.cells[i]);
    });

    const finish = (e) => {
      if (!this.drawing) return;
      this.drawing = false;
      try { svg.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      this._commit();
    };
    svg.addEventListener('pointerup', finish);
    svg.addEventListener('pointercancel', finish);
  }

  /** Index of the dot under the pointer, or -1. */
  /**
   * ⚠️ `maxDist` is generous on purpose. Cell spacing is SIZE (17), so
   * a tolerance near that means the pointer almost always lands on
   * SOME dot — which is what makes a long stroke feel like drawing
   * rather than like threading a needle. Too generous and adjacent
   * dots start stealing each other's hits; ~0.95× spacing is the
   * usable ceiling.
   */
  _nearest(e, maxDist = 19) {
    const r = this.svg.getBoundingClientRect();
    const vb = this.svg.viewBox.baseVal;
    // Map client px into viewBox units — the SVG is CSS-scaled, so the
    // two spaces are not the same and hit-testing in client px would
    // drift badly on a resized panel.
    const x = ((e.clientX - r.left) / r.width) * vb.width;
    const y = ((e.clientY - r.top) / r.height) * vb.height;
    let best = -1, bestD = maxDist;
    for (let i = 0; i < this._pts.length; i++) {
      const d = Math.hypot(this._pts[i].x - x, this._pts[i].y - y);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  _tryExtend(cell) {
    const last = this.path[this.path.length - 1];
    if (last.q === cell.q && last.r === cell.r) return;
    if (headingBetween(last, cell) < 0) return;          // not adjacent

    // ⚠️ The cell must be ON the grid. _redraw() looks every path cell
    // up in this.cells and indexes this._pts with the result, so an
    // off-field cell yields index -1 and throws on `.x`. The pointer
    // path cannot produce one (hit-testing only ever returns real
    // dots), which is exactly why this was missing — the bug is
    // unreachable by mouse and instantly fatal to any other caller.
    if (this._index(cell) < 0) return;

    // A segment may not be retraced in either direction; a DOT may be
    // revisited, which is how a closed shape gets drawn.
    const key = `${last.q},${last.r}>${cell.q},${cell.r}`;
    const rev = `${cell.q},${cell.r}>${last.q},${last.r}`;
    if (this.usedSegments.has(key) || this.usedSegments.has(rev)) return;

    // Reject a 180° reversal before it enters the path — pathSignature
    // returns null for one, and letting it in would silently invalidate
    // the whole stroke on release instead of just refusing one step.
    const probe = [...this.path, cell];
    if (pathSignature(probe) === null) return;

    this.usedSegments.add(key);
    this.path = probe;
    this._redraw();
    const sig = pathSignature(this.path);
    this._say(sig ? sig.split('').join(' ') : '…');
  }

  /** Index of an axial cell in the grid field, or -1. */
  _index(cell) {
    return this.cells.findIndex(x => x.q === cell.q && x.r === cell.r);
  }

  _redraw() {
    const idx = (c) => this._index(c);
    const d = this.path.map((c, i) => {
      const p = this._pts[idx(c)];
      if (!p) return '';
      return `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`;
    }).join(' ');
    this.trace.setAttribute('d', d);
    const on = new Set(this.path.map(c => idx(c)));
    this.el.querySelectorAll('.rune-dots circle').forEach((c, i) => {
      c.classList.toggle('lit', on.has(i));
    });
  }

  /**
   * The stroke just drawn, as an SVG path normalised into a 0–100 box.
   *
   * ⚠️ Derived runes carry `glyph: null` (runes.js says so, in a
   * comment promising "derived runes draw their own path in the UI").
   * Nothing ever drew it — the Loom's rune chip interpolated the
   * glyph straight into `d="..."`, so every derived rune, which is
   * all but fourteen of them, rendered `d="null"`: an invalid path
   * and a blank chip. The shape the player drew IS the glyph, so it
   * is generated here where the points still exist.
   */
  traceGlyph(path = this.path) {
    if (!path || path.length < 2) return '';
    const pts = path.map(c => this._pts[this._index(c)]).filter(Boolean);
    if (pts.length < 2) return '';
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    // Uniform scale on the larger axis, then centre on the other, so a
    // long thin stroke is not stretched into a fat one.
    const span = Math.max(maxX - minX, maxY - minY) || 1;
    const k = 64 / span;
    const ox = 50 - ((minX + maxX) / 2) * k;
    const oy = 50 - ((minY + maxY) / 2) * k;
    return pts.map((p, i) =>
      `${i === 0 ? 'M' : 'L'}${(p.x * k + ox).toFixed(1)} ${(p.y * k + oy).toFixed(1)}`
    ).join(' ');
  }

  _commit() {
    const sig = pathSignature(this.path);
    const base = runeForPath(this.path);
    // ⚠️ A COPY, never the module's own object. runeForPath() returns
    // the shared authored entry for a True Rune, and writing a glyph
    // onto that would edit the rune table itself for the rest of the
    // session.
    const rune = base ? { ...base, glyph: base.glyph || this.traceGlyph() } : null;
    // ⚠️ TWO dots is enough now, not three. Owner asked for it to be
    // simpler to draw, and the three-dot floor existed only because
    // the old `analyseSigil` needed two segments to compute a turn —
    // it returns null below that, so a two-dot stroke is handled by
    // the `!rune` branch and simply reads as an unfinished mark rather
    // than being refused outright.
    if (this.path.length < 2) {
      this._say('Draw a line at least.');
      this.onSign?.(null, sig);
      return;
    }
    if (rune) {
      // A True Rune (authored) gets the gold; a derived one still gets
      // its real name and a plain-language read of what its geometry
      // does, so the player can LEARN the rules by drawing rather than
      // by being told them.
      this._say(`${rune.name} — ${rune.blurb}`, rune.named ? 'true' : 'known');
    } else {
      this._say('That path doubles back on itself. Try again.', 'mishap');
    }
    this.onSign?.(rune, sig);
    // The stroke stays on screen so the player can see what they drew.
  }

  /**
   * Wipe the field.
   *
   * ⚠️ `message` exists because clear() is called BY the onSign
   * consumer, from inside the callback _commit() fires immediately
   * after writing the rune's name into the readout — so the default
   * text overwrote the one piece of feedback the player needed and
   * the name was never visible for a frame. The caller passes what
   * should stand there instead.
   */
  clear(message = 'Draw a sign.', kind = '') {
    this.path = [];
    this.usedSegments.clear();
    this._redraw();
    this._say(message, kind);
  }

  /** Put a line in the readout without disturbing the stroke. */
  say(message, kind = '') { this._say(message, kind); }

  _say(text, kind = '') {
    if (!this.readout) return;
    this.readout.textContent = text;
    this.readout.dataset.kind = kind;
  }
}
