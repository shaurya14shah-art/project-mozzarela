// ══════════════════════════════════════════════════════════
// Water — the surfaces world/Hydrology.js carves out
//
// One mesh per chunk (built once, disposed with the chunk), on a grid
// whose vertices sit at the water surface where there is water and BELOW
// the bed where there is not — so the terrain's own depth test cuts the
// exact shoreline. Per vertex: depth, how much is river / sea, the
// current's direction, and the biome's shallow/deep colour.
//
// The shader (MeshStandardMaterial, so the sky IBL reflects, the sun
// glints, fog and exposure apply like everything else):
//   · DEPTH — shallow colour to deep, transparent at the shore
//   · FOAM — a lace at every waterline; breaking foam on sea swell crests
//   · SURFACE — wind ripples from world/Wind.js (gusts roughen it), a
//     current advected along rivers, a long rolling swell on the sea
//   · RINGS — ripples where you wade, splash, or a blow lands
//
// ⚠️ Normals are built in the fragment shader from an analytic height
// field (three taps) and moved to VIEW space before lighting — the
// physically based specular then does the fresnel for free.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { windUniforms } from '../world/Wind.js';
import { WATER_TINT } from '../world/Hydrology.js';
import { quality } from './Quality.js';
import { WORLD } from '../data/constants.js';

const MAX_RIP = 10;
const RES = { low: 12, medium: 16, high: 24, ultra: 28 };

export class WaterSystem {
  /** @param {object} cm ChunkManager (getWaterAt, getGroundY) */
  constructor(cm) {
    this.cm = cm;
    this.res = RES[quality.tier] || 16;
    this.group = new THREE.Group();
    this.group.name = 'water';
    this.uniforms = {
      uRip: { value: Array.from({ length: MAX_RIP }, () => new THREE.Vector4(0, 0, 99, 0)) },
      uDetail: { value: quality.tier === 'low' ? 0.0 : 1.0 },
    };
    this.material = this._makeMaterial();
    this._ripT = 0;
  }

  _makeMaterial() {
    const mat = new THREE.MeshStandardMaterial({
      // ⚠️ NATURAL, MURKY (owner: "too reflective and not realistic";
      // chose murky). Was roughness 0.06 / envMap 1.15 — a mirror. Real
      // lake water is a coloured body you look INTO, with the sky only
      // at grazing angles and broken up by ripples.
      color: 0xffffff, roughness: 0.22, metalness: 0.0, transparent: true, depthWrite: false,
      envMapIntensity: 0.32, side: THREE.DoubleSide,
    });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, windUniforms, this.uniforms);
      const COMMON = /* glsl */`
uniform float uTime; uniform vec2 uWindDir; uniform float uWindStr;
uniform vec4 uRip[${MAX_RIP}]; uniform float uDetail;
float wH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wN(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(wH(i),wH(i+vec2(1,0)),u.x), mix(wH(i+vec2(0,1)),wH(i+vec2(1,1)),u.x), u.y); }
// The surface's height at a point: swell (sea), chop (wind), current (river), rings.
float surf(vec2 p, float sea, float river, vec2 flow, float depth) {
  float t = uTime;
  vec2 wd = uWindDir;
  float h = 0.0;
  // Sea swell — long, slow, from the wind.
  h += sea * (sin(dot(p, wd) * 0.22 - t * 1.0) * 0.16 + sin(dot(p, vec2(-wd.y, wd.x)) * 0.31 + t * 0.7) * 0.07) * clamp(depth, 0.0, 1.0);
  // Wind chop — roughens in gusts.
  float gust = smoothstep(0.3, 0.9, wN(p * 0.05 - wd * t * 0.8));
  vec2 q = p - wd * t * (0.8 + uWindStr);
  h += (wN(q * 0.9) - 0.5) * 0.05 * (0.4 + uWindStr + gust) * uDetail;
  h += (wN(q * 2.3 + 7.0) - 0.5) * 0.022 * (0.4 + uWindStr) * uDetail;
  // River current — the pattern is carried downstream.
  vec2 r = p - flow * t * 1.6;
  h += river * (wN(r * vec2(0.8, 1.6)) - 0.5) * 0.06;
  // Rings.
  for (int i = 0; i < ${MAX_RIP}; i++) {
    vec4 rp = uRip[i];
    if (rp.z > 3.0) continue;
    float d = distance(p, rp.xy);
    float front = rp.z * 2.2;
    float env = exp(-abs(d - front) * 2.5) * exp(-rp.z * 1.2) * rp.w;
    h += sin((d - front) * 9.0) * 0.035 * env;
  }
  return h;
}
`;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
attribute float aDepth; attribute float aRiver; attribute float aSea; attribute vec2 aFlow;
attribute vec3 aShallow; attribute vec3 aDeep;
varying float vDepth; varying float vRiver; varying float vSea; varying vec2 vFlow; varying vec3 vW;
varying vec3 vShallow; varying vec3 vDeep;
${COMMON}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vDepth = aDepth; vRiver = aRiver; vSea = aSea; vFlow = aFlow; vShallow = aShallow; vDeep = aDeep;
vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
if (aDepth > 0.0) transformed.y += surf(wp.xz, aSea, aRiver, aFlow, aDepth) * 0.6;
vW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying float vDepth; varying float vRiver; varying float vSea; varying vec2 vFlow; varying vec3 vW;
varying vec3 vShallow; varying vec3 vDeep;
${COMMON}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
float dep = max(vDepth, 0.0);
// Silt: the colour closes in within a metre — you see the bottom only
// in the shallows.
float deepK = smoothstep(0.0, 1.1, dep);
vec3 wcol = mix(vShallow, vDeep, deepK);
// Suspended silt catches light: the body is slightly lit, not black glass.
wcol *= 0.85 + 0.25 * (1.0 - deepK);
// Foam: a lace at the waterline, breaking foam on sea crests.
// ⚠️ A THIN band only. Across 0–0.26 m a whole shallow swamp pool lit
// up as foam and read as snow; real lace sits at the line itself.
float lace = (1.0 - smoothstep(0.0, 0.07, dep)) * smoothstep(0.45, 0.8, wN(vW.xz * 2.6 + uTime * 0.25)) * 0.55;
float crest = vSea * smoothstep(0.1, 0.16, surf(vW.xz, vSea, 0.0, vec2(0.0), dep)) * (1.0 - smoothstep(0.4, 1.6, dep)) * wN(vW.xz * 1.3 - uTime * 0.6);
float foam = clamp(lace + crest + vRiver * 0.12 * smoothstep(0.6, 0.9, wN(vW.xz * 1.7 - vFlow * uTime * 2.0)), 0.0, 1.0);
diffuseColor.rgb = mix(wcol, vec3(0.62, 0.64, 0.62), foam);
diffuseColor.a = clamp(mix(0.5, 0.97, smoothstep(0.0, 0.75, dep)) + foam * 0.3, 0.0, 0.98);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  float e = 0.12;
  float h0 = surf(vW.xz, vSea, vRiver, vFlow, dep);
  float hx = surf(vW.xz + vec2(e, 0.0), vSea, vRiver, vFlow, dep);
  float hz = surf(vW.xz + vec2(0.0, e), vSea, vRiver, vFlow, dep);
  vec3 nW = normalize(vec3(-(hx - h0) / e * 0.6, 1.0, -(hz - h0) / e * 0.6));
  normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
// Rougher in wind, and never glassy: the reflection stays soft.
roughnessFactor = mix(0.2 + uWindStr * 0.12, 0.8, foam);`);
    };
    return mat;
  }

  /** Build this chunk's water, or null if it has none. */
  buildChunk(cx, cz, biome) {
    const cm = this.cm, N = this.res, S = WORLD.CHUNK_SIZE, step = S / N;
    const cols = N + 1, cnt = cols * cols;
    const pos = new Float32Array(cnt * 3), depth = new Float32Array(cnt), river = new Float32Array(cnt), sea = new Float32Array(cnt);
    let any = 0;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const k = j * cols + i, x = cx * S + i * step, z = cz * S + j * step;
      const w = cm.getWaterAt(x, z);
      const bed = w ? w.bed : cm.lastGroundY;
      if (w) { any++; pos[k * 3 + 1] = w.surf; depth[k] = w.surf - w.bed; river[k] = w.river; sea[k] = w.sea; }
      else { pos[k * 3 + 1] = bed - 0.35; depth[k] = -0.3; }
      pos[k * 3] = i * step; pos[k * 3 + 2] = j * step;
    }
    if (!any) return null;
    // A vertex beside water takes the neighbouring surface height (still
    // "dry", depth < 0) so the shoreline triangles slope gently into the
    // bank instead of diving vertically — the depth test does the rest.
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const k = j * cols + i;
      if (depth[k] > 0) continue;
      let best = -Infinity;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii > N || jj > N) continue;
        const kk = jj * cols + ii;
        if (depth[kk] > 0) best = Math.max(best, pos[kk * 3 + 1]);
      }
      if (best > -Infinity) pos[k * 3 + 1] = Math.min(best, pos[k * 3 + 1] + 0.35 + 0.02);
    }
    // Current direction: along the channel (perpendicular to the depth gradient).
    const flow = new Float32Array(cnt * 2);
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const k = j * cols + i;
      if (river[k] < 0.02) continue;
      const dx = depth[j * cols + Math.min(N, i + 1)] - depth[j * cols + Math.max(0, i - 1)];
      const dz = depth[Math.min(N, j + 1) * cols + i] - depth[Math.max(0, j - 1) * cols + i];
      let fx = -dz, fz = dx; const l = Math.hypot(fx, fz) || 1;
      fx /= l; fz /= l;
      if (fx + fz * 0.37 < 0) { fx = -fx; fz = -fz; }   // one consistent sense
      flow[k * 2] = fx; flow[k * 2 + 1] = fz;
    }
    const idx = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
      if (depth[a] > 0 || depth[b] > 0 || depth[c] > 0) idx.push(a, c, b);
      if (depth[b] > 0 || depth[c] > 0 || depth[d] > 0) idx.push(b, c, d);
    }
    const tint = WATER_TINT[biome?.key] || WATER_TINT._default;
    const sh = new THREE.Color(tint[0]), dp = new THREE.Color(tint[1]);
    const shallow = new Float32Array(cnt * 3), deep = new Float32Array(cnt * 3);
    for (let k = 0; k < cnt; k++) { shallow.set([sh.r, sh.g, sh.b], k * 3); deep.set([dp.r, dp.g, dp.b], k * 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(cnt * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1));
    g.setAttribute('aRiver', new THREE.BufferAttribute(river, 1));
    g.setAttribute('aSea', new THREE.BufferAttribute(sea, 1));
    g.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2));
    g.setAttribute('aShallow', new THREE.BufferAttribute(shallow, 3));
    g.setAttribute('aDeep', new THREE.BufferAttribute(deep, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, this.material);
    mesh.position.set(cx * S, 0, cz * S);
    mesh.renderOrder = 2;
    mesh.receiveShadow = true;
    mesh.name = 'water-chunk';
    this.group.add(mesh);
    return mesh;
  }

  disposeChunk(mesh) {
    if (!mesh) return;
    this.group.remove(mesh);
    mesh.geometry.dispose();
  }

  /** A ring of ripples at a world point. */
  ripple(x, z, strength = 1) {
    const arr = this.uniforms.uRip.value;
    let slot = arr[0];
    for (const v of arr) if (v.z > slot.z) slot = v;
    slot.set(x, z, 0, strength);
  }

  update(dt) {
    for (const v of this.uniforms.uRip.value) v.z += dt;
  }
}
