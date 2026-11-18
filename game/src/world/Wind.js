// ══════════════════════════════════════════════════════════
// Wind — one air for everything that moves in it
//
// Owner: "dynamic movement… subtle grass movement… weather-driven wind…
// player interaction… combat reacts". Grass, flora, water ripples and
// drifting particles all read the SAME uniforms, so a gust visibly rolls
// across a field, bends the reeds, roughens the lake and carries the
// pollen in one direction at once — the read that makes it one world.
//
//   strength   0.35 calm … 1.25 full storm (from Weather.intensity)
//   direction  wanders slowly; never snaps
//   gusts      bands of stronger air that travel downwind (GLSL below)
//   player     plants part around the player (uPlayer)
//   impulses   heavy blows and spells flatten and splash (worldFX.impulse)
//
// ⚠️ SHARED UNIFORM OBJECTS. Materials put these exact objects into
// shader.uniforms in onBeforeCompile; never copy their values.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';

const MAX_IMP = 8;

export const windUniforms = {
  uTime:    { value: 0 },
  uWindDir: { value: new THREE.Vector2(1, 0.3).normalize() },
  uWindStr: { value: 0.5 },
  uPlayer:  { value: new THREE.Vector3(0, -999, 0) },
  // x, z, radius, age (s). age > 3 = spent.
  uImp:     { value: Array.from({ length: MAX_IMP }, () => new THREE.Vector4(0, 0, 0, 99)) },
};

/**
 * GLSL: `vec3 windDisplace(vec3 base, float h, float stiff)` — the
 * displacement for a vertex `h` metres up a plant rooted at world `base`.
 * `stiff` 0 (grass) … 1 (a bush barely moves). Requires the uniforms above.
 */
export const WIND_GLSL = /* glsl */`
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStr;
uniform vec3 uPlayer;
uniform vec4 uImp[${MAX_IMP}];
float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1, 0)), u.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), u.x), u.y);
}
vec3 windDisplace(vec3 base, float h, float stiff) {
  float flex = h * h * (1.0 - stiff * 0.85);
  // Gust bands travel downwind: the field ripples, it does not pulse.
  vec2 g = base.xz * 0.045 - uWindDir * uTime * (0.9 + uWindStr * 1.4);
  float gust = smoothstep(0.35, 0.95, wNoise(g)) * (0.6 + uWindStr);
  float flutter = sin(uTime * (2.3 + stiff) + base.x * 0.7 + base.z * 0.5) * 0.18 + sin(uTime * 5.1 + base.z * 1.3) * 0.06;
  float push = (0.25 + uWindStr * 0.55 + gust * 0.8) * 0.28;
  vec3 d = vec3(uWindDir.x, 0.0, uWindDir.y) * push * flex + vec3(uWindDir.y, 0.0, -uWindDir.x) * flutter * flex * 0.5;
  // The player parts the plants.
  vec2 toP = base.xz - uPlayer.xz;
  float dp = length(toP);
  float part = (1.0 - smoothstep(0.25, 1.25, dp)) * step(abs(base.y - uPlayer.y), 2.5);
  d.xz += (dp > 0.001 ? toP / dp : vec2(0.0)) * part * h * 0.55 * (1.0 - stiff * 0.6);
  // Blows and spells flatten, then let it spring back.
  for (int i = 0; i < ${MAX_IMP}; i++) {
    vec4 im = uImp[i];
    if (im.w > 3.0) continue;
    vec2 t = base.xz - im.xy; float di = length(t);
    float fall = (1.0 - smoothstep(im.z * 0.5, im.z, di)) * exp(-im.w * 1.6) * (1.0 + 0.25 * sin(im.w * 14.0) * exp(-im.w * 3.0));
    d.xz += (di > 0.001 ? t / di : vec2(0.0)) * fall * h * 0.9 * (1.0 - stiff * 0.5);
  }
  d.y -= dot(d.xz, d.xz) * 0.45;   // a bent stem is shorter
  return d;
}
`;

class WindSystem {
  constructor() { this._dirA = Math.random() * Math.PI * 2; this._next = 0; this._listeners = []; }

  /** @param {number} dt @param {THREE.Vector3} playerPos @param {number} storm 0..1 */
  update(dt, playerPos, storm = 0) {
    const u = windUniforms;
    u.uTime.value += dt;
    // Direction wanders (and swings harder in a storm).
    this._dirA += Math.sin(u.uTime.value * 0.031) * dt * (0.04 + storm * 0.12);
    u.uWindDir.value.set(Math.cos(this._dirA), Math.sin(this._dirA));
    const target = 0.35 + storm * 0.9 + Math.max(0, Math.sin(u.uTime.value * 0.11)) * 0.12;
    u.uWindStr.value += (target - u.uWindStr.value) * Math.min(1, dt * 0.5);
    if (playerPos) u.uPlayer.value.copy(playerPos);
    for (const v of u.uImp.value) v.w += dt;
  }

  /** The air's velocity at ground level (m/s), for particles. */
  velocity(out = new THREE.Vector3()) {
    const u = windUniforms;
    const s = 0.6 + u.uWindStr.value * 3.2;
    return out.set(u.uWindDir.value.x * s, 0, u.uWindDir.value.y * s);
  }

  /**
   * A blow, spell or landing at `pos` with `radius` metres: flattens grass
   * and flora (shader) and notifies listeners (water splash, dust).
   */
  impulse(pos, radius = 2, strength = 1) {
    const arr = windUniforms.uImp.value;
    let slot = arr[0];
    for (const v of arr) if (v.w > slot.w) slot = v;   // the oldest
    slot.set(pos.x, pos.z, radius, 0);
    for (const fn of this._listeners) fn(pos, radius, strength);
  }
  onImpulse(fn) { this._listeners.push(fn); }
}

export const wind = new WindSystem();
