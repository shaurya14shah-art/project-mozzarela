// ══════════════════════════════════════════════════════════
// EnvironmentIBL — image-based lighting baked from our own sky
//
// The scene's ambient term was, until now, a flat AmbientLight plus a
// HemisphereLight. Those are constants: every surface facing any
// direction receives the same fill. That is the single biggest reason
// the world read as flat silhouettes — a real surface's ambient
// contribution depends on *what it can see*, and a bright sky over a
// dark ground means an upward-facing rock is lit very differently
// from a downward-facing overhang. Constants cannot express that, and
// MeshStandardMaterial's specular lobe has nothing at all to reflect
// without an environment map, so every metal read as flat paint.
//
// The obvious fix is to ship an HDRI. We deliberately don't, for a
// reason that isn't budget: this game's sky is *art-directed*, per
// path, in a shader (see Atmosphere.js — "Neither is daylight. Both
// are weather."). Dropping a photographic HDRI of a real sky over it
// would light the world in colours the sky itself never shows, and
// the reflections would disagree with the background they're
// reflecting. So instead we render the game's OWN sky dome into a
// cubemap and PMREM-convolve that.
//
// Consequences, all good:
//   - reflections match the visible sky exactly, by construction
//   - it re-bakes for free when the path or time of day changes
//   - zero download, zero size cost, works offline and from file://
//   - it cannot ever drift out of sync with the art direction
//
// Cost is one cubemap render + convolution per bake (~a few ms), not
// per frame. We bake on path change and on a coarse time-of-day step,
// never every frame.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { quality } from './Quality.js';

// Resolution of the cube render that feeds the PMREM. The sky is a
// smooth gradient with a soft sun glow and some low-amplitude haze
// noise — there is no high-frequency detail to preserve, so 256 is
// already past the point of visible difference and costs a quarter of
// what 512 does.
const CUBE_SIZE = 256;

class EnvironmentIBL {
  constructor() {
    // Deferred-init on purpose. This is a module-level singleton and a
    // PMREMGenerator needs a live WebGLRenderer, which does not exist
    // at import time. See the "deferred-init pattern" note in
    // HANDOFF.md — this exact bug class has bitten this project more
    // than once.
    this.renderer = null;
    this.scene = null;
    this._pmrem = null;
    this._rt = null;          // current PMREM render target
    this._bakeScene = null;
    this._skyClone = null;
    this._groundDisc = null;
    this._lastKey = null;     // dedupes redundant bakes
    this.enabled = false;
  }

  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene        the live scene to assign .environment on
   * @param {THREE.Mesh}  skyMesh      Atmosphere's dome — we clone its material
   */
  init(renderer, scene, skyMesh, baseSky = null) {
    if (!quality.wantsIBL) {
      console.log('[EnvironmentIBL] disabled at this quality tier');
      return this;
    }
    this.renderer = renderer;
    this.scene = scene;

    this._pmrem = new THREE.PMREMGenerator(renderer);
    // Compiling the equirect/cube shader up front means the first bake
    // (which happens during loading, while the player is watching a
    // progress bar) doesn't also eat a shader compile stall.
    this._pmrem.compileCubemapShader();

    // A private scene holding just the things that legitimately
    // contribute ambient light: the sky, and the ground beneath it.
    this._bakeScene = new THREE.Scene();

    // Clone the dome. `.clone()` on the mesh shares the material (and
    // therefore its uniforms) with the live sky, which is exactly what
    // we want — the bake automatically picks up whatever colours
    // Atmosphere has currently set, with no syncing code to forget.
    // We only override the two properties that matter for a cube bake.
    // ⚠️ The physical sky FIRST, then the overlay dome over it. Since
    // the realism pass the dome only carries the moon and the rift
    // (premultiplied, transparent) — baking it alone would light the
    // whole world from an almost black environment. The base sky is
    // passed in separately and drawn in the same order the scene uses.
    if (baseSky) {
      this._baseSkyClone = new THREE.Mesh(baseSky.geometry, baseSky.material);
      this._baseSkyClone.scale.copy(baseSky.scale);
      this._baseSkyClone.frustumCulled = false;
      this._baseSkyClone.renderOrder = -1001;
      this._bakeScene.add(this._baseSkyClone);
    }
    this._skyClone = new THREE.Mesh(skyMesh.geometry, skyMesh.material);
    this._skyClone.position.set(0, 0, 0);
    this._skyClone.frustumCulled = false;
    this._skyClone.renderOrder = -1000;
    this._bakeScene.add(this._skyClone);

    // Ground half. Without this the lower hemisphere of the
    // environment is *sky*, so every downward-facing surface gets lit
    // from below by the sky colour — the classic "everything looks
    // like it's floating over a lightbox" tell. A large dark disc
    // under the camera is a crude but correct stand-in for "the
    // ground is dark and you can see a lot of it".
    const groundMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.DoubleSide,
      fog: false,
    });
    this._groundDisc = new THREE.Mesh(new THREE.CircleGeometry(880, 24), groundMat);
    this._groundDisc.rotation.x = -Math.PI / 2;
    this._groundDisc.position.y = -1;
    this._groundDisc.frustumCulled = false;
    this._bakeScene.add(this._groundDisc);

    this.enabled = true;
    return this;
  }

  /**
   * Re-render the environment. Cheap enough to call on any real
   * change, but `key` dedupes: pass something that identifies the
   * current sky state (path + quantized time of day) and repeat calls
   * with the same key are free.
   *
   * @param {string} key       dedupe key, e.g. `hell:14`
   * @param {number} groundCol hex tint for the ground half of the env
   */
  bake(key, groundCol = 0x0a0806) {
    if (!this.enabled) return;
    if (key != null && key === this._lastKey) return;
    this._lastKey = key;

    // The ground disc carries the terrain's own darkness so that the
    // ambient bounce colour is at least in the right family. It is
    // scaled well below the literal ground colour because a real
    // ground bounces only a fraction of what hits it, and this disc
    // has no falloff of its own.
    this._groundDisc.material.color.setHex(groundCol).multiplyScalar(0.5);

    const old = this._rt;
    try {
      this._rt = this._pmrem.fromScene(this._bakeScene, 0, 0.1, 1000);
      this.scene.environment = this._rt.texture;
      // environmentIntensity is the clean, material-agnostic way to
      // dial IBL strength — the alternative (scaling every material's
      // envMapIntensity) has to be re-applied to every clone that
      // ModelLibrary hands out, forever.
      this.scene.environmentIntensity = quality.settings.iblIntensity;
      // Only dispose AFTER a successful bake. Disposing first would
      // leave scene.environment pointing at freed GPU memory if
      // fromScene() threw.
      if (old) old.dispose();
    } catch (err) {
      console.warn('[EnvironmentIBL] bake failed, keeping previous environment', err);
      this._rt = old;
    }
  }

  /**
   * Ambient/hemisphere lights and IBL both fill shadow. Running both
   * at their old full strength double-counts the fill and washes the
   * scene out — the flat look gets *brighter* instead of getting
   * depth. Atmosphere still owns the per-path colours and relative
   * balance; this just scales the pair down by however much of the
   * fill job the environment map has taken over.
   */
  compensateLights({ ambient, hemi }) {
    if (!this.enabled) return;
    // The scaling factor was 0.6, which cut the ambient pair roughly in
    // half at iblIntensity 0.8. That over-corrected, and the reason is
    // worth writing down: this environment map is only bright in its
    // UPPER hemisphere. The lower half is the dark ground disc, by
    // design. So the IBL replaces a great deal of the fill on
    // upward-facing surfaces and very little of it on vertical ones —
    // and vertical surfaces (monoliths, walls, the sides of every
    // prop) are most of what the player actually looks at.
    //
    // Cutting the uniform ambient term as if the environment had
    // replaced it everywhere therefore made exactly the wrong surfaces
    // darker. 0.3 removes the genuine double-count without gutting the
    // fill that vertical faces still depend on.
    const k = 1 - quality.settings.iblIntensity * 0.3;
    if (ambient) ambient.intensity *= k;
    if (hemi) hemi.intensity *= k;
  }

  dispose() {
    if (this._rt) { this._rt.dispose(); this._rt = null; }
    if (this._pmrem) { this._pmrem.dispose(); this._pmrem = null; }
    if (this._groundDisc) {
      this._groundDisc.geometry.dispose();
      this._groundDisc.material.dispose();
    }
    this.enabled = false;
  }
}

export const environmentIBL = new EnvironmentIBL();
