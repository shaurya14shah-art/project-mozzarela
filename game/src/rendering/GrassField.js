// ══════════════════════════════════════════════════════════
// GrassField — RŌNIN's wind-blown grass, carried into the dead realm
//
// Ported from RŌNIN (client/src/world/Nature.ts, `GrassField`): clumps
// of tapered, bending blades on an instanced grid that travels with the
// player, re-seated on the ground when the player has moved on. In
// RŌNIN this one system is most of why the world reads as a place
// rather than a render — a bare heightfield, however well textured, is
// the strongest "this is a game" tell there is.
//
// What changed in the port:
//
//   · COLOUR AND DENSITY ARE PER BIOME (`biome.grass`, set in
//     BiomeManager from GRASS_BY_BIOME below). Muted green near the
//     Sanctuary, dry straw in the outer steppes, and in the god's bone
//     fields the vermilion grass the setting describes. Rock, ash, black
//     earth, glass and snow grow nothing.
//   · GROUND IS SAMPLED ON A 1 M LATTICE, not per blade. RŌNIN calls its
//     height function once per clump (~10k calls per re-seat); here that
//     is `getGroundY`, the most expensive function in the game. A 1 m
//     lattice is ~2.9k calls, bilinear between them, and gives the slope
//     for free — grass does not grow on cliff faces.
//   · QUALITY-TIERED. Off at `low` (the tier exists for fill cost),
//     smaller radius at `medium`.
//
// ⚠️ SEEDED, NEVER RANDOM. Every blade's position, turn and tone is a
// hash of its lattice cell, so the same ground grows the same grass
// every time you return. Random grass re-rolls when you walk back,
// which reads as the world flickering.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { windUniforms, WIND_GLSL } from '../world/Wind.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { quality } from './Quality.js';
import { WORLD } from '../data/constants.js';

/**
 * Grass per biome id. `d` is density 0..1; colours are root (deep),
 * body (lush) and tip-in-dry-patches (dry). Biomes absent here grow
 * nothing — that is a decision, not an omission: the realm is dead,
 * and grass on black earth or volcanic glass would say otherwise.
 */
export const GRASS_BY_BIOME = {
  iron_hills:       { d: 0.30, deep: 0x4a3a22, lush: 0x7a6a3a, dry: 0xb0965a },
  sunken_mire:      { d: 0.70, deep: 0x1c2a14, lush: 0x34482a, dry: 0x5a5a32 },
  highland_karst:   { d: 0.55, deep: 0x2e4228, lush: 0x56703e, dry: 0x8a8a5a },
  plains:           { d: 0.85, deep: 0x3f5631, lush: 0x667d42, dry: 0xa59660 },
  enchanted_forest: { d: 0.55, deep: 0x2c4128, lush: 0x4b6338, dry: 0x7d7a4c },
  living_jungle:    { d: 0.65, deep: 0x2e4626, lush: 0x557033, dry: 0x86804a },
  twilight_swamp:   { d: 0.55, deep: 0x343d26, lush: 0x56603a, dry: 0x7a7350 },
  amber_steppe:     { d: 0.90, deep: 0x6b5a34, lush: 0x9c8550, dry: 0xc2ad78 },
  stormwrack_coast: { d: 0.45, deep: 0x47503e, lush: 0x6b735a, dry: 0x9a9578 },
  drowned_flats:    { d: 0.40, deep: 0x3a463a, lush: 0x5a6650, dry: 0x878266 },
  petrified_wood:   { d: 0.35, deep: 0x5a4c36, lush: 0x7d6c4c, dry: 0xa0906a },
  frozen_tundra:    { d: 0.22, deep: 0x5d6058, lush: 0x7d8070, dry: 0xa8a690 },
  desert_ruins:     { d: 0.14, deep: 0x6e5a3a, lush: 0x8f7a52, dry: 0xb9a276 },
  fungal_wastes:    { d: 0.18, deep: 0x4a3c3a, lush: 0x6a5652, dry: 0x8e7a6a },
  // The one hot colour of the bone fields. Canon: fields of vermilion
  // grass against white bone. Sparse, so the bone stays the ground.
  godgrave:         { d: 0.42, deep: 0x4a1d16, lush: 0x7e2c20, dry: 0x8f5a44 },
};

function hash(a, b) {
  let h = (Math.imul(Math.floor(a * 73.0) | 0, 374761393) ^ Math.imul(Math.floor(b * 91.0) | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/** Cheap smooth value noise, 0..1 — patchiness and tone. */
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z) {
  return vnoise(x, z) * 0.55 + vnoise(x * 2.1 + 17, z * 2.1 - 9) * 0.3 + vnoise(x * 4.3 - 5, z * 4.3 + 3) * 0.15;
}

/** Milliseconds of grass building allowed per frame. */
const GRASS_BUDGET_MS = 2.5;

const TIER = {
  low:    null,
  medium: { radius: 18, spacing: 0.62 },
  high:   { radius: 24, spacing: 0.52 },
  ultra:  { radius: 28, spacing: 0.46 },
};

export class GrassField {
  /**
   * @param {(x:number,z:number)=>number} groundY analytic ground height
   * @param {(x:number,z:number)=>object} biomeAt the biome at a world point
   */
  constructor(groundY, biomeAt, lastWaterSurf = null) {
    this.groundY = groundY;
    // The water surface left by the LAST groundY() call (world/Hydrology.js
    // records it as a side effect, so this costs nothing extra).
    this.lastWaterSurf = lastWaterSurf;
    this.biomeAt = biomeAt;
    this.cfg = TIER[quality.tier] || null;
    this.enabled = !!this.cfg;
    this.uniforms = { uTime: { value: 0 }, uWind: { value: 0.6 } };
    this._center = new THREE.Vector2(1e9, 1e9);
    if (!this.enabled) return;

    // ── The clump: nine tapered, curved blades, merged ──────
    const blades = [];
    for (let b = 0; b < 9; b++) {
      const h = 0.38 + hash(b, 1) * 0.48, w = 0.024 + hash(2, b) * 0.012;
      const g = new THREE.PlaneGeometry(w, h, 1, 4);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const t = (p.getY(i) + h / 2) / h;
        p.setX(i, p.getX(i) * (1 - t * 0.92));
        p.setZ(i, t * t * 0.12 * (0.5 + hash(b, 7)));
        p.setY(i, t * h);
      }
      g.rotateY(hash(b, 3) * Math.PI * 2);
      g.translate((hash(b, 5) - 0.5) * 0.3, 0, (hash(6, b) - 0.5) * 0.3);
      g.computeVertexNormals();
      blades.push(g);
    }
    const clump = mergeGeometries(blades);
    const pos = clump.attributes.position;
    const tip = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) tip[i] = Math.min(1, pos.getY(i) / 0.62);
    clump.setAttribute('tip', new THREE.BufferAttribute(tip, 1));

    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      // ⚠️ The SHARED air (world/Wind.js): gust bands rolling downwind,
      // the player parting the blades, blows and spells flattening them.
      Object.assign(shader.uniforms, windUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float tip;\nvarying float vTip;\n' + WIND_GLSL)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vTip = tip;
vec3 base = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
vec3 wd = windDisplace(base, tip, 0.0) * 0.62;
// World metres → this instance's local frame (Y-rotated, scaled): project
// on its columns. Cheaper than inverse() per vertex on ~30k clumps.
vec3 c0 = instanceMatrix[0].xyz, c1 = instanceMatrix[1].xyz, c2 = instanceMatrix[2].xyz;
transformed += vec3(dot(wd, c0) / dot(c0, c0), dot(wd, c1) / dot(c1, c1), dot(wd, c2) / dot(c2, c2));`);
      // Root-to-tip shading: blades are dark where they crowd at the
      // base and catch light at the tip — what makes a clump read as
      // volume rather than as a flat green card.
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vTip;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.38, 1.12, vTip);');
    };

    // ── Two buffers, swapped (realism pass, perf) ─────────
    // ⚠️ The re-seat used to run in ONE frame: measured 7–22 ms every
    // ~1.5 s of walking, a visible hitch. It is now a generator that
    // builds into the HIDDEN buffer under a per-frame time budget and
    // swaps when complete — so the field never pops half-built and no
    // single frame pays for the whole field.
    const steps = Math.ceil((this.cfg.radius * 2) / this.cfg.spacing);
    const makeBuffer = () => {
      const im = new THREE.InstancedMesh(clump, mat, steps * steps);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.receiveShadow = true;
      im.castShadow = false;
      im.count = 0;
      im.setColorAt(0, new THREE.Color());
      im.name = 'grass-field';
      return im;
    };
    this._buffers = [makeBuffer(), makeBuffer()];
    this._front = 0;
    this._buffers[1].visible = false;
    this.mesh = new THREE.Group();
    this.mesh.name = 'grass-field';
    this.mesh.add(this._buffers[0], this._buffers[1]);
    this._job = null;
  }

  /** Instances currently drawn. */
  get count() { return this._buffers ? this._buffers[this._front].count : 0; }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} at camera / player position
   * @param {number} wind 0..1
   */
  update(dt, at, wind = 0.4) {
    if (!this.enabled) return;
    this.uniforms.uTime.value += dt;
    this.uniforms.uWind.value = 0.35 + wind * 0.9;
    if (!this._job && Math.hypot(at.x - this._center.x, at.z - this._center.y) >= 6) {
      this._center.set(Math.round(at.x / 4) * 4, Math.round(at.z / 4) * 4);
      this._job = this._reseatJob(this._buffers[1 - this._front]);
    }
    if (this._job) {
      const budget = performance.now() + GRASS_BUDGET_MS;
      // A teleport (no grass yet) builds in one go: nothing to hitch against.
      const all = this.count === 0;
      while (all || performance.now() < budget) {
        if (this._job.next().done) {
          this._buffers[this._front].visible = false;
          this._front = 1 - this._front;
          this._buffers[this._front].visible = true;
          this._job = null;
          break;
        }
      }
    }
  }

  /** Force a rebuild on the next update (e.g. after a teleport or warp change). */
  invalidate() { this._center.set(1e9, 1e9); this._job = null; }

  /** Run a whole re-seat now (tests, teleports). */
  _reseat() {
    const job = this._reseatJob(this._buffers[1 - this._front]);
    while (!job.next().done) { /* run to completion */ }
    this._buffers[this._front].visible = false;
    this._front = 1 - this._front;
    this._buffers[this._front].visible = true;
  }

  /** Generator: yields every few hundred units of work. */
  *_reseatJob(target) {
    const { radius, spacing } = this.cfg;
    const cx = this._center.x, cz = this._center.y;

    const L = Math.ceil(radius) + 1;
    const N = L * 2 + 1;
    const hgt = new Float32Array(N * N);
    const wdep = new Float32Array(N * N);   // water depth on the lattice
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const y = this.groundY(cx - L + i, cz - L + j);
        hgt[j * N + i] = y;
        const ws = this.lastWaterSurf ? this.lastWaterSurf() : -Infinity;
        wdep[j * N + i] = ws > y ? ws - y : 0;
      }
      if ((j & 3) === 3) yield;
    }
    const sample = (x, z) => {
      const fx = x - (cx - L), fz = z - (cz - L);
      const i = Math.max(0, Math.min(N - 2, Math.floor(fx))), j = Math.max(0, Math.min(N - 2, Math.floor(fz)));
      const u = fx - i, v = fz - j;
      const a = hgt[j * N + i], b = hgt[j * N + i + 1], c = hgt[(j + 1) * N + i], d = hgt[(j + 1) * N + i + 1];
      const y = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
      const slope = Math.max(Math.abs(b - a), Math.abs(c - a), Math.abs(d - b), Math.abs(d - c));
      return [y, slope];
    };

    // ── Biome per chunk, cached for this re-seat ───────────
    const biomes = new Map();
    const grassAt = (x, z) => {
      const key = `${Math.floor(x / WORLD.CHUNK_SIZE)},${Math.floor(z / WORLD.CHUNK_SIZE)}`;
      if (!biomes.has(key)) {
        const b = this.biomeAt(x, z);
        biomes.set(key, b?.grass ? { g: b.grass, nm: !!b.isNightmare } : null);
      }
      return biomes.get(key);
    };

    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), t = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color(), deep = new THREE.Color(), lush = new THREE.Color(), dry = new THREE.Color();
    const steps = Math.ceil((radius * 2) / spacing);
    let n = 0;
    for (let i = 0; i < steps; i++) {
      if ((i & 3) === 3) yield;
      for (let j = 0; j < steps; j++) {
        const gx = cx - radius + i * spacing, gz = cz - radius + j * spacing;
        const x = gx + (hash(gx, gz) - 0.5) * spacing;
        const z = gz + (hash(gz, gx) - 0.5) * spacing;
        if (Math.hypot(x - cx, z - cz) > radius) continue;
        const info = grassAt(x, z);
        if (!info) continue;
        const dens = fbm(x * 0.06, z * 0.06);
        // Patchy: the biome's density decides how much of the noise
        // field clears the bar, so sparse biomes grow in tufts.
        if (dens < 1 - info.g.d * 0.62) continue;
        const [y, slope] = sample(x, z);
        if (slope > 0.55) continue;     // no grass on cliffs
        // Not in standing water (the reeds in rendering/Flora.js own the shallows).
        const wi = Math.max(0, Math.min(N - 1, Math.round(z - (cz - L)))) * N + Math.max(0, Math.min(N - 1, Math.round(x - (cx - L))));
        if (wdep[wi] > 0.2) continue;
        q.setFromAxisAngle(up, hash(x, z) * Math.PI * 2);
        const size = 0.55 + dens * 0.45 + hash(z, x) * 0.25;
        m.compose(t.set(x, y - 0.03, z), q, s.set(size, size * (0.65 + dens * 0.45), size));
        target.setMatrixAt(n, m);
        const tone = fbm(x * 0.03 + 9, z * 0.03);
        deep.setHex(info.g.deep); lush.setHex(info.g.lush); dry.setHex(info.g.dry);
        color.copy(deep).lerp(lush, Math.min(1, tone * 1.4)).lerp(dry, Math.max(0, tone - 0.45) * 1.6);
        // Inside a Nightmare the region is "the same place, wrong":
        // its grass is drained toward grey like the rest of its palette.
        if (info.nm) { const l = color.r * 0.3 + color.g * 0.59 + color.b * 0.11; color.lerp(new THREE.Color(l, l, l), 0.7).multiplyScalar(0.7); }
        target.setColorAt(n, color);
        n++;
      }
    }
    target.count = n;
    target.instanceMatrix.needsUpdate = true;
    if (target.instanceColor) target.instanceColor.needsUpdate = true;
  }
}
