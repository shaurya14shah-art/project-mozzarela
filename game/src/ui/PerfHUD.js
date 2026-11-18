// ══════════════════════════════════════════════════════════
// PerfHUD — a frame-time meter, and a quality control
//
// This exists because of a concrete failure: the owner reported the
// game was laggy, and every measurement available in the development
// environment said it was running at 100-200fps. Both were true. The
// preview pane reports `document.hidden`, which suspends
// requestAnimationFrame entirely, so nothing there was ever measuring
// a REAL presented frame — only synchronous `composer.render()` calls
// with no vsync, no compositing, and a canvas that was sometimes 0x0.
//
// Guessing at a performance problem you cannot reproduce is how you
// end up "fixing" things that were never slow. So: put a real meter in
// the player's hands, and let the machine that actually has the
// problem report the numbers.
//
//   F3       toggle the meter
//   F4       cycle quality tier (low -> medium -> high -> ultra)
//
// Everything here is DOM, updated at 4Hz rather than per-frame —
// a performance overlay that itself costs measurable frame time is
// worse than useless.
// ══════════════════════════════════════════════════════════

import { quality, TIERS } from '../rendering/Quality.js';

class PerfHUD {
  constructor() {
    this.el = null;
    this.visible = false;
    this._renderer = null;
    this._engine = null;

    // Rolling window of frame durations, for percentiles. A mean hides
    // exactly the thing that reads as "lag": occasional long frames.
    // A 30fps average with a 200ms hitch every second feels far worse
    // than a steady 30fps, and only the percentile shows it.
    this._samples = new Float32Array(180);
    this._n = 0;
    this._last = 0;
    this._acc = 0;
    this._worstRecent = 0;
  }

  init(renderer, engine) {
    this._renderer = renderer;
    this._engine = engine;

    const el = document.createElement('div');
    el.id = 'perf-hud';
    // Inline styles: this is a debug tool and must not depend on, or
    // perturb, the game's stylesheet.
    el.style.cssText = [
      'position:fixed', 'top:8px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:99999', 'pointer-events:none',
      'font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace',
      'color:#d8cfc0', 'background:rgba(8,6,5,0.82)',
      'border:1px solid #6b5228', 'padding:6px 10px',
      'white-space:pre', 'display:none',
    ].join(';');
    document.body.appendChild(el);
    this.el = el;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3') { e.preventDefault(); this.toggle(); }
      if (e.code === 'F4') { e.preventDefault(); this.cycleTier(); }
    });

    console.log('[PerfHUD] F3 = frame-time meter, F4 = cycle quality tier');
    return this;
  }

  toggle() {
    this.visible = !this.visible;
    if (this.el) this.el.style.display = this.visible ? 'block' : 'none';
  }

  cycleTier() {
    const next = TIERS[(TIERS.indexOf(quality.tier) + 1) % TIERS.length];
    quality.setTier(next);
    // A tier change rewrites shadow map sizes, chunk resolution, the
    // pass list and the pixel ratio — none of which can be applied to a
    // live scene without rebuilding it. Reloading is honest and
    // instant; pretending to hot-swap would leave half the settings
    // stale and misreport what is actually running.
    location.reload();
  }

  /** Call once per rendered frame. Cheap: one subtraction and a store. */
  frame() {
    const now = performance.now();
    if (this._last) {
      const dt = now - this._last;
      // Discard absurd deltas. A backgrounded tab suspends rAF, so the
      // first frame after returning can be many SECONDS long — that is
      // not a dropped frame, it is the browser having stopped calling
      // us, and letting it into the window poisons the percentiles for
      // the next three seconds. Anything over a second is that.
      if (dt > 1000) { this._last = now; return; }
      this._samples[this._n % this._samples.length] = dt;
      this._n++;
      if (dt > this._worstRecent) this._worstRecent = dt;
      this._acc += dt;
      if (this._acc >= 250) { this._acc = 0; this._refresh(); }
    }
    this._last = now;
  }

  _refresh() {
    if (!this.visible || !this.el) return;
    const count = Math.min(this._n, this._samples.length);
    if (count < 2) return;

    const arr = Array.prototype.slice.call(this._samples, 0, count).sort((a, b) => a - b);
    const median = arr[(count * 0.5) | 0];
    const p95 = arr[(count * 0.95) | 0];
    const worst = arr[count - 1];

    const info = this._renderer.info.render;
    const mem = this._renderer.info.memory;
    const fps = 1000 / median;

    // Colour by the WORST frame, not the average — see the note on
    // percentiles above.
    const colour = p95 < 20 ? '#8fbf6f' : p95 < 34 ? '#c9a24e' : '#c05a4a';
    this.el.style.color = colour;

    this.el.textContent =
      `${fps.toFixed(0)} fps   frame ${median.toFixed(1)}ms   p95 ${p95.toFixed(1)}ms   worst ${worst.toFixed(0)}ms\n` +
      `tier ${quality.tier}  dpr ${this._renderer.getPixelRatio()}  ` +
      `${this._renderer.domElement.width}x${this._renderer.domElement.height}\n` +
      `draws ${info.calls}   tris ${(info.triangles / 1000).toFixed(0)}k   ` +
      `geo ${mem.geometries}  tex ${mem.textures}\n` +
      `F3 hide   F4 quality`;

    this._worstRecent = 0;
  }
}

export const perfHUD = new PerfHUD();
