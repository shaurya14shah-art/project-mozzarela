// ══════════════════════════════════════════════════════════
// LightPool — a fixed number of real point lights, forever
//
// ⚠️ THE LAG THIS EXISTS FOR (perf pass, measured).
// three.js bakes the NUMBER of lights into every material's shader. Add
// or remove one point light and every visible material recompiles. This
// game created point lights constantly: every spell cast and projectile,
// every dropped pickup, every forged weapon (each of its up-to-five
// copies — hand, body, portrait, halo), the focus, NPCs, braziers,
// Descent lamps. Each appearance and each expiry was a whole-scene
// shader recompile — HANDOFF already recorded one at 667 ms, and a
// precompile trace in the perf pass measured weapons adding 1–27 s of
// stalled frames apiece. ChunkManager's old budget only engaged ABOVE
// eight lights, so below eight (most of the time) every change still
// recompiled.
//
// The fix is the standard one. A FIXED pool of real PointLights lives
// in the scene from boot and never changes count. Every other point
// light in the scene is "virtual": it is moved to a layer the camera
// does not render (three only gathers lights the camera's layers can
// see — WebGLRenderer.projectObject), and each frame the pool copies
// the nearest live virtual lights' colour, intensity, range and world
// position into its real ones. The game's code keeps creating, moving,
// dimming and deleting its own lights exactly as before.
//
// ⚠️ A virtual light's OWN `visible` and `intensity` are read as intent
// (a hidden or zero light is skipped), so code that turns lights off
// still works. The pool is the only writer of the real lights.
// ⚠️ Pool size is per quality tier: every point light is a loop
// iteration in every lit fragment, so 8 on a low tier is a real cost.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { quality } from './Quality.js';

const VIRTUAL_LAYER = 30;
// Small on purpose: three UNROLLS the light loop into every shader, so
// each pooled light lengthens every program's compile and every lit
// fragment's cost. In a sunlit open world a few nearby glows are all a
// point light adds; emissive + bloom carry the rest.
const SIZE = { low: 0, medium: 2, high: 3, ultra: 4 };
const _p = new THREE.Vector3();

class LightPool {
  constructor() {
    this.scene = null;
    this.lights = [];
    this._virtual = [];
    this._frame = 0;
  }

  init(scene) {
    this.scene = scene;
    const n = SIZE[quality.tier] ?? 6;
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 1, 2);
      l.name = 'pool-light';
      l.userData.pooled = true;
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
    }
    return this;
  }

  /** Find point lights that are not ours and make them virtual. */
  _discover() {
    const found = [];
    this.scene.traverse(o => {
      if (!o.isPointLight || o.userData.pooled) return;
      if (!o.userData.virtual) {
        o.userData.virtual = true;
        o.layers.set(VIRTUAL_LAYER);       // the renderer no longer gathers it
      }
      found.push(o);
    });
    this._virtual = found;
  }

  update(cameraPos) {
    if (!this.scene || !this.lights.length) return;
    // Discovery walks the scene graph — every 4th frame is plenty;
    // a projectile's light appears at most ~50 ms late.
    if ((this._frame++ & 3) === 0) this._discover();

    const cands = [];
    for (const v of this._virtual) {
      if (!v.parent || v.intensity <= 0.001) continue;
      // Intent: the light and every ancestor must be visible.
      let vis = true;
      for (let o = v; o; o = o.parent) if (!o.visible) { vis = false; break; }
      if (!vis) continue;
      v.getWorldPosition(_p);
      const d2 = _p.distanceToSquared(cameraPos);
      const reach = v.distance > 0 ? v.distance : 30;
      if (d2 > (reach + 25) * (reach + 25)) continue;   // too far to light anything we see
      cands.push({ v, d2, x: _p.x, y: _p.y, z: _p.z });
    }
    cands.sort((a, b) => a.d2 - b.d2);
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i], c = cands[i];
      if (!c) { l.intensity = 0; continue; }
      l.position.set(c.x, c.y, c.z);
      l.color.copy(c.v.color);
      l.intensity = c.v.intensity;
      l.distance = c.v.distance;
      l.decay = c.v.decay;
    }
  }
}

export const lightPool = new LightPool();
