// ══════════════════════════════════════════════════════════
// Weather — precipitation, gusts, and the sky closing in
//
// The world had exactly one weather state per path, permanently. The
// sun drifted and that was the whole of its atmosphere over time.
// Nothing ever rolled in, nothing ever let up, so a place never felt
// like it had a *condition* — only a palette.
//
// This adds a slow, autonomous weather state machine on top of the
// path's palette. It never fights the art direction: it does not
// introduce a single new colour of its own, it only takes the path's
// existing tokens and pushes them further in the direction they
// already point.
//
//   HELL   — ashfall. Slow, heavy, drifting motes that fall like
//            something burned rather than something froze. Gusts push
//            them sideways.
//   HEAVEN — rain. Fast, near-vertical, pale streaks. It reads as the
//            bleached sky finally breaking.
//
// Three things move together, which is what makes it read as weather
// rather than as a particle effect someone switched on:
//   1. precipitation density
//   2. fog density (the horizon closes in)
//   3. key light strength (the sun goes behind it)
//
// Implementation notes:
//   - One THREE.Points with a custom shader, ~4000 particles, ONE
//     draw call. Positions are computed in the vertex shader from a
//     per-particle seed and a shared time uniform, so there is no
//     per-frame CPU work and no buffer re-upload at all.
//   - The particle volume is a box that RECENTRES on the camera every
//     frame, and positions wrap modulo the box size. That means a
//     fixed 4000 particles always surround the player no matter how
//     far they walk, and none are ever wasted rendering weather behind
//     the fog wall.
//   - Everything is gated on quality.isHD, and the whole module is a
//     no-op at `low` so the artifact build is untouched.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { quality } from './Quality.js';

// Box half-extents around the camera that particles live in. Tied to
// the fog rather than the far plane — anything beyond the fog wall is
// invisible, so rendering weather out there is pure waste.
// Reduced from 34: with a fixed particle budget, a smaller volume is a
// DENSER one. Everything beyond this is fog anyway, so concentrating
// the same 4200 particles nearer the player buys visible density for
// free rather than spending it on drops nobody can see.
const BOX_XZ = 24;
const BOX_Y = 26;

const COUNT = 4200;

const VERT = /* glsl */`
  uniform float uTime;
  uniform vec3  uOrigin;      // camera position, snapped
  uniform float uFall;        // fall speed, world units/sec
  uniform float uDrift;       // sideways drift amplitude
  uniform vec2  uWind;        // current gust direction * strength
  uniform float uSize;
  uniform float uBoxXZ;
  uniform float uBoxY;
  uniform float uStretch;     // 1 = round mote, >1 = streak (rain)

  attribute vec3 seed;        // per-particle randomness, 0..1

  varying float vFade;
  varying float vSeedA;

  void main() {
    // Start from a stable per-particle position in box space.
    vec3 p = seed * vec3(uBoxXZ * 2.0, uBoxY * 2.0, uBoxXZ * 2.0);

    // Fall. mod() gives an endless loop through the box height with no
    // respawn bookkeeping — a particle leaving the bottom reappears at
    // the top in the same instruction.
    float t = uTime;
    p.y = mod(p.y - t * uFall * (0.75 + seed.x * 0.5), uBoxY * 2.0);

    // Drift + wind. The sin term is per-particle phased so they don't
    // all sway in lockstep, which is the tell that gives away a cheap
    // particle system instantly.
    float ph = seed.z * 6.2831;
    p.x += sin(t * 0.7 + ph) * uDrift + uWind.x * (0.6 + seed.y * 0.8);
    p.z += cos(t * 0.6 + ph) * uDrift + uWind.y * (0.6 + seed.y * 0.8);

    // Recentre on the camera and wrap. Doing the wrap AFTER adding the
    // origin is what keeps the volume locked to the player: as uOrigin
    // moves, particles that fall outside the box on one side are
    // wrapped around to the other.
    vec3 world = p + uOrigin - vec3(uBoxXZ, 0.0, uBoxXZ);
    world.x = uOrigin.x + mod(world.x - uOrigin.x + uBoxXZ, uBoxXZ * 2.0) - uBoxXZ;
    world.z = uOrigin.z + mod(world.z - uOrigin.z + uBoxXZ, uBoxXZ * 2.0) - uBoxXZ;

    vec4 mv = modelViewMatrix * vec4(world, 1.0);

    // Fade out with distance so particles dissolve into the fog
    // instead of popping at the box edge, and fade the ones nearly on
    // top of the camera so nothing flickers across the lens.
    float d = length(mv.xyz);
    vFade = smoothstep(0.6, 3.0, d) * (1.0 - smoothstep(uBoxXZ * 0.55, uBoxXZ, d));
    vSeedA = seed.x;

    gl_Position = projectionMatrix * mv;
    // Perspective-correct size, floored so distant motes stay visible
    // rather than shimmering at sub-pixel sizes, and CEILINGED so a
    // particle passing close to the near plane doesn't blow up into a
    // screen-filling blob.
    //
    // Note this must NOT be scaled by uStretch. The stretch is applied
    // to the sprite's UV in the fragment shader — it narrows the drawn
    // shape within the point, it does not make the point bigger. Doing
    // both multiplied rain sprites by 4.5x and turned them into
    // 100px+ squares.
    gl_PointSize = clamp(uSize * (110.0 / max(d, 1.0)), 1.0, 42.0);
  }
`;

const FRAG = /* glsl */`
  uniform vec3  uColor;
  uniform float uOpacity;
  uniform float uStretch;
  varying float vFade;
  varying float vSeedA;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    // Narrow the sprite HORIZONTALLY to fake a motion-streak for rain:
    // scaling x UP pushes |c| past the 0.5 discard threshold sooner
    // across the width, leaving a thin vertical band the full height of
    // the point. At uStretch 1 this is a plain round mote (ash).
    //
    // The first version divided c.y instead, which does the opposite —
    // it shrank the radius everywhere except a wide horizontal band, so
    // essentially nothing was discarded and every drop rendered as a
    // full soft square.
    c.x *= uStretch;
    float r = length(c);
    if (r > 0.5) discard;

    // Soft edge; rain gets a harder core so it reads as a streak
    // rather than a smudge.
    float a = (1.0 - smoothstep(0.15, 0.5, r)) * uOpacity * vFade;
    a *= 0.65 + vSeedA * 0.35;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

// Per-path precipitation character. Colours are pulled from the path
// palette at runtime, not hardcoded here — these are only the physical
// parameters.
const PROFILES = {
  hell: {
    fall: 3.4,      // slow — ash settles, it doesn't pelt
    drift: 1.5,
    // Pixel size at ~110/d. Ash motes are physically small; the read
    // comes from their number and slow drift, not from their size.
    size: 1.4,
    stretch: 1.0,   // round motes
    opacity: 0.5,
    // How much a full storm thickens the fog and dims the sun.
    fogMult: 2.1,
    keyMult: 0.62,
  },
  heaven: {
    fall: 26.0,     // fast, near-vertical
    drift: 0.35,
    // Larger than ash because the sprite is narrowed to a thin band in
    // the fragment shader — the point's SIZE becomes the streak's
    // LENGTH, so a raindrop needs a bigger point to read as a streak.
    size: 3.2,
    stretch: 5.0,   // thin vertical streaks
    opacity: 0.5,
    fogMult: 1.7,
    keyMult: 0.55,
  },
};

class Weather {
  constructor() {
    // Deferred init — needs a live scene. See HANDOFF.md's note on the
    // deferred-init pattern for scene-graph singletons.
    this.scene = null;
    this.points = null;
    this.enabled = false;

    this._time = 0;
    // 0 = clear, 1 = full storm. Eased toward _target.
    this.intensity = 0;
    this._target = 0;
    // Seconds until the next state roll.
    this._nextRoll = 25;
    this._wind = new THREE.Vector2();
    this._windTarget = new THREE.Vector2();
    this._profile = PROFILES.hell;
    // Neutral until update() runs, and neutral forever at the `low`
    // tier where this whole module is a no-op — so Atmosphere can
    // multiply by them unconditionally without a guard.
    this.fogMultiplier = 1;
    this.keyMultiplier = 1;
  }

  init(scene, atmosphere) {
    if (!quality.isHD) {
      console.log('[Weather] disabled at this quality tier');
      return this;
    }
    this.scene = scene;
    this.atmosphere = atmosphere;

    const geo = new THREE.BufferGeometry();
    // Position is required by Three but every real position is derived
    // in the vertex shader from `seed`; this buffer exists only to set
    // the draw count and is never read.
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    const seeds = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT * 3; i++) seeds[i] = Math.random();
    geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 3));
    // The volume follows the camera and is re-derived every frame, so
    // Three's own frustum test (against a stale, origin-centred
    // bounding sphere) would cull the whole system at random.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      // Normal blending, NOT additive. Additive precipitation glows and
      // turns a storm into a light source, which is exactly wrong for
      // ash and for rain in a world this dark.
      blending: THREE.NormalBlending,
      uniforms: {
        uTime:    { value: 0 },
        uOrigin:  { value: new THREE.Vector3() },
        uFall:    { value: 4 },
        uDrift:   { value: 1 },
        uWind:    { value: new THREE.Vector2() },
        uSize:    { value: 1.5 },
        uBoxXZ:   { value: BOX_XZ },
        uBoxY:    { value: BOX_Y },
        uStretch: { value: 1 },
        uColor:   { value: new THREE.Color(0xffffff) },
        uOpacity: { value: 0 },
      },
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.points.visible = false;
    scene.add(this.points);

    this.enabled = true;
    this.setPath(atmosphere.path);
    console.log('[Weather] initialized');
    return this;
  }

  /** Re-derive precipitation type and colour from the active path. */
  setPath(pathId) {
    if (!this.enabled) return;
    this._profile = PROFILES[pathId] || PROFILES.hell;
    const u = this.material.uniforms;
    u.uFall.value = this._profile.fall;
    u.uDrift.value = this._profile.drift;
    u.uSize.value = this._profile.size;
    u.uStretch.value = this._profile.stretch;
    // Take the path's own mote colour rather than inventing one, so
    // ashfall matches the embers already drifting around and rain
    // matches the bleached palette.
    u.uColor.value.setHex(this.atmosphere.particleColor());
  }

  /**
   * Force a condition. `intensity` 0..1; pass `immediate` to snap
   * rather than roll in over ~20s.
   */
  set(intensity, immediate = false) {
    this._target = Math.max(0, Math.min(1, intensity));
    if (immediate) this.intensity = this._target;
    // Push the next autonomous roll out so a scripted condition isn't
    // immediately overwritten.
    this._nextRoll = Math.max(this._nextRoll, 45);
  }

  update(dt, cameraPosition, lights) {
    if (!this.enabled) return;

    this._time += dt;

    // ── Autonomous state machine ────────────────────────
    this._nextRoll -= dt;
    if (this._nextRoll <= 0) {
      // Weighted so clear/light dominate — a world that is always
      // storming stops reading as weather and starts reading as a
      // permanent filter, which is the thing this exists to avoid.
      const r = Math.random();
      this._target = r < 0.45 ? 0
                   : r < 0.75 ? 0.3 + Math.random() * 0.2
                   : r < 0.93 ? 0.55 + Math.random() * 0.2
                              : 0.85 + Math.random() * 0.15;
      this._nextRoll = 40 + Math.random() * 80;

      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 4.5;
      this._windTarget.set(Math.cos(a) * s, Math.sin(a) * s);
    }

    // Ease. Deliberately slow — weather that changes visibly fast reads
    // as a bug. ~20s to cross the full range.
    const k = 1 - Math.exp(-dt / 7);
    this.intensity += (this._target - this.intensity) * k;
    this._wind.lerp(this._windTarget, 1 - Math.exp(-dt / 4));

    const I = this.intensity;
    const u = this.material.uniforms;
    u.uTime.value = this._time;
    u.uWind.value.copy(this._wind);
    if (cameraPosition) u.uOrigin.value.copy(cameraPosition);

    // Below this the particle count is so sparse it reads as noise on
    // the lens rather than as weather; cheaper to draw nothing.
    this.points.visible = I > 0.02;
    u.uOpacity.value = this._profile.opacity * I;

    // ── Fog and light follow the precipitation ──────────
    // These are published as MULTIPLIERS rather than written directly
    // onto scene.fog / key.intensity, and that is deliberate.
    //
    // Atmosphere is the single owner of both values: apply() rewrites
    // them from the path palette, and update()'s unease flicker
    // reassigns key.intensity absolutely (`palette.key.intensity *
    // flicker`) every frame. A weather system that wrote those fields
    // itself would be silently overwritten by the flicker on the very
    // next line, and would need fragile baseline-caching to avoid
    // compounding its own multiplication across frames.
    //
    // Exposing factors instead means there is exactly one writer, the
    // two effects compose by multiplication, and there is no cached
    // state to invalidate on a path change.
    this.fogMultiplier = 1 + (this._profile.fogMult - 1) * I;
    this.keyMultiplier = 1 + (this._profile.keyMult - 1) * I;
  }

  /** 0..1 — for anything that wants to react (audio, UI, gameplay). */
  get condition() { return this.intensity; }

  dispose() {
    if (!this.points) return;
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.material.dispose();
    this.enabled = false;
  }
}

export const weather = new Weather();
