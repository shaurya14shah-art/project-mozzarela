// ══════════════════════════════════════════════════════════
// GodRaysPass — volumetric light scattering (crepuscular rays)
//
// Three.js ships no god-rays pass, so this is the classic screen-space
// radial-scatter approach (Mitchell, GPU Gems 3): march a number of
// samples from each pixel toward the sun's projected screen position,
// accumulate whatever light is found along that ray with exponential
// decay, and add the result back onto the frame.
//
// The textbook version needs a dedicated occlusion buffer — the scene
// re-rendered with everything black except the light source — so that
// only genuinely-unoccluded sky contributes. That is a whole extra
// render of the scene every frame.
//
// We skip it, and we can skip it *specifically because of this game's
// art direction*. Atmosphere.js renders a bright sky dome behind
// terrain and props that are deliberately dark, low-albedo silhouettes
// ("tarnished metal and dried blood", see style.css). A luminance
// threshold therefore separates sky from geometry almost perfectly
// here — the same trick would smear badly in a game with bright walls
// or snow, but nothing in this world is bright except the sky and the
// handful of emissive spell cores, and those streaking slightly is
// flattering rather than wrong.
//
// Cost is one fullscreen pass with SAMPLES texture fetches. At 48
// samples that is real but modest, and it only runs at `high`/`ultra`.
//
// Rays are suppressed as the sun leaves the frame, so there is no pop
// when it crosses the screen edge — see uSunVisibility below.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const GOD_RAYS_SHADER = {
  uniforms: {
    tDiffuse:     { value: null },
    uSunScreen:   { value: new THREE.Vector2(0.5, 0.5) },
    uDensity:     { value: 0.85 },
    uWeight:      { value: 0.06 },   // was 0.22 with threshold 0.72 — see bright()
    uDecay:       { value: 0.94 },
    uExposure:    { value: 0.5 },
    uThreshold:   { value: 2.2 },    // linear, like bloom's (realism pass)
    uSunVisible:  { value: 0.0 },
    uTint:        { value: new THREE.Color(0xffdca8) },
  },

  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2  uSunScreen;
    uniform float uDensity;
    uniform float uWeight;
    uniform float uDecay;
    uniform float uExposure;
    uniform float uThreshold;
    uniform float uSunVisible;
    uniform vec3  uTint;
    varying vec2 vUv;

    // Number of steps along the ray toward the sun. This is a #define
    // rather than a uniform because a loop bound must be a constant
    // for the shader to unroll on every GL implementation we care
    // about.
    #define SAMPLES 48

    // Keep only what is plausibly sky. Smoothstep rather than a hard
    // step so a surface hovering at the threshold doesn't flicker in
    // and out of contributing as the camera moves.
    vec3 bright(vec2 uv) {
      vec3 c = texture2D(tDiffuse, uv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // ⚠️ Only the EXCESS over the threshold scatters. 0.72 was set
      // before the physical sky: under it the whole daytime sky and
      // pale ground cleared the bar, so 48 samples each added a full
      // pixel of it and the frame went white around the sun.
      return c * (max(l - uThreshold, 0.0) / max(l, 1e-4));
    }

    void main() {
      vec4 original = texture2D(tDiffuse, vUv);

      // Early out when the sun is off-screen or behind the camera —
      // the whole pass is a no-op then, and doing the march anyway
      // would drag in garbage from the clamped screen edge.
      if (uSunVisible <= 0.001) {
        gl_FragColor = original;
        return;
      }

      // Step from this pixel toward the sun. Dividing by SAMPLES keeps
      // the total marched distance independent of the sample count, so
      // changing SAMPLES changes quality, not look.
      vec2 delta = (vUv - uSunScreen) * (uDensity / float(SAMPLES));
      vec2 uv = vUv;
      float illumination = 1.0;
      vec3 accum = vec3(0.0);

      // Dither the starting offset by a per-pixel hash. Without this,
      // a low sample count produces visible concentric banding rings
      // around the sun; with it, the same error becomes fine noise
      // that the grain in the grade pass hides completely.
      float dither = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
      uv -= delta * dither;

      for (int i = 0; i < SAMPLES; i++) {
        uv -= delta;
        // Sampling outside [0,1] clamps to the edge texel, which
        // smears the frame border inward as a bright bar. Stop instead.
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
        accum += bright(uv) * illumination * uWeight;
        illumination *= uDecay;
      }

      // Fade with distance from the sun as well as with the sun's own
      // on-screen visibility, so rays are strongest near the source.
      float radial = 1.0 - smoothstep(0.0, 1.1, length(vUv - uSunScreen));
      vec3 rays = accum * uExposure * uTint * uSunVisible * radial;

      gl_FragColor = vec4(original.rgb + rays, original.a);
    }
  `,
};

export class GodRaysPass extends Pass {
  constructor() {
    super();
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(GOD_RAYS_SHADER.uniforms),
      vertexShader: GOD_RAYS_SHADER.vertexShader,
      fragmentShader: GOD_RAYS_SHADER.fragmentShader,
      depthWrite: false,
      depthTest: false,
    });
    this._quad = new FullScreenQuad(this.material);
    this._sunWorld = new THREE.Vector3();
    // Smoothed visibility. Stepping this rather than setting it
    // directly means a sun clipping past the screen edge, or briefly
    // occluded by a monolith the player walks behind, ramps the rays
    // down over a few frames instead of snapping them off.
    this._visibility = 0;
  }

  /**
   * Point the pass at the sun. Call once per frame before render().
   *
   * @param {THREE.Camera}  camera
   * @param {THREE.Vector3} sunDir  normalized direction TO the sun
   * @param {number}        dt      seconds, for the visibility ramp
   */
  update(camera, sunDir, dt = 0.016) {
    if (!sunDir) return;

    // Put a virtual sun far along its direction from the camera, then
    // project that into normalized screen space.
    this._sunWorld.copy(camera.position).addScaledVector(sunDir, 900);
    const p = this._sunWorld.clone().project(camera);

    const sx = p.x * 0.5 + 0.5;
    const sy = p.y * 0.5 + 0.5;
    this.material.uniforms.uSunScreen.value.set(sx, sy);

    // p.z > 1 means the point is behind the camera / beyond far. In
    // that case project() still returns finite x/y, mirrored — using
    // them would draw rays converging on a sun that is behind the
    // player's head.
    const behind = p.z > 1;
    // Fade out over a margin outside the frame rather than at the
    // exact edge, so rays from a sun just off-screen still reach in.
    const margin = 0.45;
    const inFrame =
      sx > -margin && sx < 1 + margin &&
      sy > -margin && sy < 1 + margin;

    let target = 0;
    if (!behind && inFrame) {
      // Taper toward the edges of that margin.
      const fx = 1 - Math.max(0, Math.max(-sx, sx - 1)) / margin;
      const fy = 1 - Math.max(0, Math.max(-sy, sy - 1)) / margin;
      target = Math.max(0, Math.min(fx, fy));
    }

    // Exponential smoothing, framerate-independent.
    const k = 1 - Math.exp(-6 * dt);
    this._visibility += (target - this._visibility) * k;
    this.material.uniforms.uSunVisible.value = this._visibility;
    this.enabled = this._visibility > 0.002;
  }

  /** Match the ray colour to the path's own sun. */
  setTint(hex) {
    this.material.uniforms.uTint.value.setHex(hex);
  }

  setStrength(exposure) {
    this.material.uniforms.uExposure.value = exposure;
  }

  render(renderer, writeBuffer, readBuffer /*, deltaTime, maskActive */) {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }
    this._quad.render(renderer);
  }

  dispose() {
    this.material.dispose();
    this._quad.dispose();
  }
}
