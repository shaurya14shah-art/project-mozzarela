// ══════════════════════════════════════════════════════════
// Flora — everything on the ground that is not grass
//
// Owner: "add different elements like grass… flowers & tall weeds,
// bushes & ferns, dead-realm flora, stones & debris", all moving in the
// one air (world/Wind.js): swaying in the wind, parting as you walk
// through, flattened by blows and spells.
//
// Built exactly like GrassField (whose comments explain each choice): a
// lattice around the player, re-seated into a HIDDEN double buffer under
// a per-frame time budget, every choice a hash of the cell so the same
// ground grows the same things every visit. One InstancedMesh per kind.
//
//   flower  seedhead  reed  fern  bush        — living
//   ashgrass  bonereed  fungus  crystal       — the dead realm's own
//   stone  pebbles  branch  bone              — debris; does not sway
//
// Fungus and crystals GLOW (per-instance colour drives emissive), so the
// grotto and the fungal wastes light their own ground at night.
// Reeds grow at water's edge (the water lookup from world/Hydrology.js);
// nothing else grows in standing water.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { windUniforms, WIND_GLSL } from '../world/Wind.js';
import { quality } from './Quality.js';
import { WORLD } from '../data/constants.js';

function hash(a, b, s = 0) {
  let h = (Math.imul(Math.floor(a * 73.0 + s * 911) | 0, 374761393) ^ Math.imul(Math.floor(b * 91.0 - s * 577) | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

const BUDGET_MS = 2.0;
const TIER = {
  low:    { radius: 16, cell: 2.4, kinds: ['stone', 'pebbles', 'branch', 'bone'] },
  medium: { radius: 24, cell: 1.8 },
  high:   { radius: 30, cell: 1.5 },
  ultra:  { radius: 36, cell: 1.35 },
};

// ── Per-biome flora: kind → probability per lattice cell ───────────
// Colours are [r,g,b] hex lists; one is picked per instance by hash.
const F = (p, cols) => ({ p, cols });
const FLOWER_DEAD = [0xb7a9a0, 0x9a8c96, 0xc2b28a, 0x8e9aa6];
export const FLORA_BY_BIOME = {
  iron_hills:       { bush: F(0.03, [0x5a4a2a]), stone: F(0.06, [0x8a4a32, 0x6a3a26]), pebbles: F(0.06, [0x9a5a3a]), seedhead: F(0.03, [0xa8904a]) },
  sunken_mire:      { fern: F(0.10, [0x2a4020, 0x3a4a28]), fungus: F(0.05, [0x8a7a50, 0xb0a070]), reed: F(0.10, [0x5a6038]), bush: F(0.03, [0x22301a]) },
  highland_karst:   { flower: F(0.05, [0xd8d0f0, 0xe0c0c8]), stone: F(0.06, [0xc8c8bc]), pebbles: F(0.05, [0xd0d0c8]), bush: F(0.03, [0x3a5030]) },
  ashen_caldera:    { stone: F(0.06, [0x1a1416, 0x2a2224]), pebbles: F(0.08, [0x141012]), crystal: F(0.02, [0xd8c830]) },
  plains:           { flower: F(0.10, [0xc9b06a, 0xb98a8a, 0xd8d0c0, 0x9d8fb0]), seedhead: F(0.06, [0xb09a62]), bush: F(0.02, [0x4f6236]), stone: F(0.03, [0x7c776e]), pebbles: F(0.03, [0x8a847a]) },
  enchanted_forest: { fern: F(0.14, [0x3f5a32, 0x4c6a3a]), bush: F(0.06, [0x35502c]), fungus: F(0.03, [0x8fd0a8]), flower: F(0.03, [0xa8a0c8]), branch: F(0.04, [0x4a3a2a]), stone: F(0.02, [0x6a6a60]) },
  living_jungle:    { fern: F(0.18, [0x3a5a2a, 0x48682e]), bush: F(0.10, [0x2f4c24]), flower: F(0.05, [0xc06a50, 0xd0a040]), branch: F(0.03, [0x4a3826]) },
  twilight_swamp:   { reed: F(0.14, [0x5a5e38]), fungus: F(0.05, [0x9ac060]), seedhead: F(0.04, [0x7a7448]), branch: F(0.03, [0x3a3226]) },
  amber_steppe:     { seedhead: F(0.10, [0xc2a868, 0xa88c50]), flower: F(0.03, [0xc8a050]), stone: F(0.03, [0x8a7a62]), pebbles: F(0.04, [0x9a8a70]) },
  stormwrack_coast: { seedhead: F(0.05, [0x8a8a6a]), stone: F(0.06, [0x6e6e68]), pebbles: F(0.06, [0x7a7a72]), reed: F(0.04, [0x6a6e4a]) },
  drowned_flats:    { reed: F(0.16, [0x5a6044]), bonereed: F(0.03, [0xd8d0c0]), pebbles: F(0.05, [0x6a6a62]) },
  petrified_wood:   { branch: F(0.06, [0x6a5a48]), stone: F(0.05, [0x7a6a58]), ashgrass: F(0.06, [0x8a8070]) },
  frozen_tundra:    { stone: F(0.05, [0x8a8e92]), pebbles: F(0.06, [0x9a9ea2]), seedhead: F(0.02, [0xa8a690]) },
  desert_ruins:     { stone: F(0.05, [0x9a8060]), pebbles: F(0.07, [0xa88e6a]), bone: F(0.02, [0xe0d6c0]) },
  fungal_wastes:    { fungus: F(0.14, [0xc070e0, 0xe09040, 0x70c0b0]), pebbles: F(0.03, [0x6a5a52]) },
  crystal_caverns:  { crystal: F(0.08, [0x60a0ff, 0x80c8ff]), pebbles: F(0.04, [0x5a6070]) },
  bioluminescent_grotto: { fungus: F(0.12, [0x40e0c0, 0x60a0ff]), crystal: F(0.05, [0x50d0e0]), fern: F(0.05, [0x2a5a50]) },
  volcanic_wastes:  { ashgrass: F(0.08, [0x5a5450]), stone: F(0.06, [0x3a3230]), crystal: F(0.03, [0xff6a20]) },
  obsidian_wastes:  { crystal: F(0.06, [0x6a40a0, 0x302040]), stone: F(0.05, [0x2a2630]) },
  ember_dunes:      { pebbles: F(0.06, [0x8a5a3a]), ashgrass: F(0.03, [0x6a5a4a]) },
  glacier_shelf:    { crystal: F(0.04, [0xc0e8ff]), stone: F(0.05, [0x9aa6b0]) },
  celestial_peaks:  { crystal: F(0.04, [0xb0a0ff]), stone: F(0.06, [0x8a8a98]), ashgrass: F(0.03, [0x9a96a8]) },
  astral_highlands: { crystal: F(0.04, [0x9080ff]), stone: F(0.06, [0x7a768a]), ashgrass: F(0.03, [0x8a86a0]) },
  crimson_rift:     { crystal: F(0.05, [0xff3a30]), ashgrass: F(0.06, [0x5a3a36]), bone: F(0.02, [0xd8ccb8]) },
  shadow_realm:     { ashgrass: F(0.08, [0x4a4458]), bonereed: F(0.04, [0xcac2b8]), fungus: F(0.03, [0x9a60e0]) },
  the_verge:        { stone: F(0.06, [0x6a6670]), ashgrass: F(0.05, [0x6a6a70]) },
  floating_islands: { flower: F(0.05, [0xc0b0e0]), crystal: F(0.03, [0xa0d0ff]) },
  // The realm (Gravefall, the Hushpeaks, the Strand, the Still City, the Maw)
  godgrave:         { bonereed: F(0.08, [0xe2d8c6]), bone: F(0.06, [0xe8dfcc]), ashgrass: F(0.06, [0x7a6a60]), flower: F(0.02, FLOWER_DEAD) },
  hollow_mountains: { stone: F(0.07, [0x5a5e66]), pebbles: F(0.05, [0x6a6e74]), ashgrass: F(0.03, [0x6a6a6e]) },
  forgotten_shore:  { reed: F(0.08, [0x5c6048]), bonereed: F(0.05, [0xd0c8b8]), pebbles: F(0.07, [0x5e6064]), branch: F(0.04, [0x8a8070]) },
  dreaming_city:    { ashgrass: F(0.06, [0x6a6878]), pebbles: F(0.05, [0x5a5a64]), bonereed: F(0.03, [0xc8c0b8]) },
  bottomless_pit:   { ashgrass: F(0.05, [0x4a4450]), crystal: F(0.03, [0x5030a0]), stone: F(0.04, [0x2e2a34]) },
};
// The hub (spawn) is the plains.
FLORA_BY_BIOME.sanctuary = FLORA_BY_BIOME.plains;

// ── Geometry builders. Each sets `h` (metres above root, for the wind)
//    and `tint` (0 = the kind's base colour, 1 = the instance colour). ──
function finish(parts) {
  const g = mergeGeometries(parts.map(p => { const x = p.g.index ? p.g.toNonIndexed() : p.g; x.deleteAttribute('uv'); return { g: x, tint: p.tint }; }).map(({ g, tint }) => {
    const n = g.attributes.position.count;
    const t = new Float32Array(n).fill(tint);
    g.setAttribute('tint', new THREE.BufferAttribute(t, 1));
    return g;
  }));
  const pos = g.attributes.position, h = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) h[i] = Math.max(0, pos.getY(i));
  g.setAttribute('hgt', new THREE.BufferAttribute(h, 1));
  g.computeVertexNormals();
  return g;
}
function blade(w, h, curl, rot, x = 0, z = 0) {
  const g = new THREE.PlaneGeometry(w, h, 1, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + h / 2) / h;
    p.setX(i, p.getX(i) * (1 - t * 0.9));
    p.setZ(i, t * t * curl);
    p.setY(i, t * h);
  }
  g.rotateY(rot); g.translate(x, 0, z);
  return g;
}
function cyl(r0, r1, h, x = 0, z = 0, tiltX = 0, tiltZ = 0, seg = 5) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 2, true);
  g.translate(0, h / 2, 0); g.rotateX(tiltX); g.rotateZ(tiltZ); g.translate(x, 0, z);
  return g;
}
function jitter(g, amt, seed) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = hash(p.getX(i) * 40 + seed, p.getZ(i) * 40, p.getY(i) * 40);
    p.setXYZ(i, p.getX(i) * (1 + (k - 0.5) * amt), p.getY(i) * (1 + (hash(k, seed) - 0.5) * amt), p.getZ(i) * (1 + (hash(seed, k) - 0.5) * amt));
  }
  return g;
}

const BUILD = {
  flower() {
    const parts = [];
    for (let i = 0; i < 4; i++) {
      const h = 0.32 + hash(i, 1) * 0.25, x = (hash(i, 2) - 0.5) * 0.25, z = (hash(3, i) - 0.5) * 0.25;
      parts.push({ g: cyl(0.006, 0.004, h, x, z, (hash(i, 4) - 0.5) * 0.2), tint: 0 });
      const head = new THREE.CircleGeometry(0.045 + hash(i, 5) * 0.02, 6); head.rotateX(-Math.PI / 2 + 0.3); head.translate(x, h, z);
      parts.push({ g: head, tint: 1 });
      const eye = new THREE.IcosahedronGeometry(0.014, 0); eye.translate(x, h + 0.01, z);
      parts.push({ g: eye, tint: 0.4 });
    }
    return finish(parts);
  },
  seedhead() {
    const parts = [];
    for (let i = 0; i < 3; i++) {
      const h = 0.75 + hash(i, 1) * 0.4, x = (hash(i, 2) - 0.5) * 0.2, z = (hash(3, i) - 0.5) * 0.2, tz = (hash(i, 6) - 0.5) * 0.25;
      parts.push({ g: cyl(0.007, 0.004, h, x, z, 0, tz, 4), tint: 0.3 });
      const head = cyl(0.016, 0.006, 0.16, 0, 0, 0, 0, 5); head.translate(0, h - 0.04, 0); head.rotateZ(tz); head.translate(x, 0, z);
      parts.push({ g: head, tint: 1 });
    }
    for (let i = 0; i < 4; i++) parts.push({ g: blade(0.03, 0.35, 0.1, i * 1.7), tint: 0 });
    return finish(parts);
  },
  reed() {
    const parts = [];
    for (let i = 0; i < 6; i++) parts.push({ g: blade(0.035, 1.1 + hash(i, 1) * 0.5, 0.12, hash(i, 2) * 6.28, (hash(i, 3) - 0.5) * 0.2, (hash(4, i) - 0.5) * 0.2), tint: 1 });
    for (let i = 0; i < 2; i++) {
      const h = 1.2 + hash(i, 7) * 0.3, x = (hash(i, 8) - 0.5) * 0.15;
      parts.push({ g: cyl(0.006, 0.005, h, x, 0), tint: 1 });
      const tail = cyl(0.022, 0.022, 0.16, 0, 0, 0, 0, 6); tail.translate(x, h - 0.1, 0);
      parts.push({ g: tail, tint: 0.15 });
    }
    return finish(parts);
  },
  fern() {
    const parts = [];
    for (let i = 0; i < 7; i++) {
      const g = new THREE.PlaneGeometry(0.16, 0.7, 2, 6);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const t = (p.getY(k) + 0.35) / 0.7;
        p.setX(k, p.getX(k) * (1 - t * 0.8) * (0.6 + Math.sin(t * Math.PI) * 0.6));
        p.setY(k, Math.sin(t * 1.2) * 0.42);
        p.setZ(k, t * 0.55);
      }
      g.rotateY((i / 7) * Math.PI * 2 + hash(i, 1) * 0.4);
      parts.push({ g, tint: 1 });
    }
    return finish(parts);
  },
  bush() {
    const parts = [];
    for (let i = 0; i < 6; i++) {
      const r = 0.22 + hash(i, 1) * 0.18;
      const g = jitter(new THREE.IcosahedronGeometry(r, 1), 0.35, i);
      g.scale(1, 0.75, 1); g.translate((hash(i, 2) - 0.5) * 0.6, r * 0.6 + hash(i, 3) * 0.2, (hash(4, i) - 0.5) * 0.6);
      parts.push({ g, tint: 1 });
    }
    return finish(parts);
  },
  ashgrass() {
    const parts = [];
    for (let i = 0; i < 8; i++) parts.push({ g: blade(0.02, 0.4 + hash(i, 1) * 0.35, 0.15, hash(i, 2) * 6.28, (hash(i, 3) - 0.5) * 0.3, (hash(5, i) - 0.5) * 0.3), tint: 1 });
    return finish(parts);
  },
  bonereed() {
    const parts = [];
    for (let i = 0; i < 4; i++) {
      const h = 0.6 + hash(i, 1) * 0.6, x = (hash(i, 2) - 0.5) * 0.3, z = (hash(3, i) - 0.5) * 0.3;
      parts.push({ g: cyl(0.014, 0.008, h, x, z, (hash(i, 4) - 0.5) * 0.15), tint: 1 });
      for (let k = 1; k < 4; k++) { const n = new THREE.IcosahedronGeometry(0.018, 0); n.translate(x, h * k / 4, z); parts.push({ g: n, tint: 1 }); }
    }
    return finish(parts);
  },
  fungus() {
    const parts = [];
    for (let i = 0; i < 4; i++) {
      const h = 0.08 + hash(i, 1) * 0.22, r = 0.05 + hash(i, 2) * 0.09, x = (hash(i, 3) - 0.5) * 0.4, z = (hash(4, i) - 0.5) * 0.4;
      parts.push({ g: cyl(0.02, 0.015, h, x, z), tint: 0 });
      const cap = new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.5); cap.scale(1, 0.6, 1); cap.translate(x, h, z);
      parts.push({ g: cap, tint: 1 });
    }
    return finish(parts);
  },
  crystal() {
    const parts = [];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.OctahedronGeometry(0.08 + hash(i, 1) * 0.06, 0);
      g.scale(1, 3 + hash(i, 2) * 2.5, 1);
      g.translate(0, 0.2 + hash(i, 3) * 0.15, 0);
      g.rotateZ((hash(i, 4) - 0.5) * 0.9); g.rotateX((hash(5, i) - 0.5) * 0.9);
      g.translate((hash(i, 6) - 0.5) * 0.35, 0, (hash(7, i) - 0.5) * 0.35);
      parts.push({ g, tint: 1 });
    }
    return finish(parts);
  },
  stone() {
    const g = jitter(new THREE.DodecahedronGeometry(0.32, 1), 0.45, 3);
    g.scale(1.2, 0.55, 1); g.translate(0, 0.08, 0);
    return finish([{ g, tint: 1 }]);
  },
  pebbles() {
    const parts = [];
    for (let i = 0; i < 6; i++) {
      const g = jitter(new THREE.IcosahedronGeometry(0.05 + hash(i, 1) * 0.06, 0), 0.4, i);
      g.scale(1, 0.6, 1); g.translate((hash(i, 2) - 0.5) * 0.7, 0.02, (hash(3, i) - 0.5) * 0.7);
      parts.push({ g, tint: 1 });
    }
    return finish(parts);
  },
  branch() {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.6, 0.04, 0), new THREE.Vector3(-0.1, 0.08, 0.1), new THREE.Vector3(0.3, 0.05, -0.05), new THREE.Vector3(0.65, 0.03, 0.08)]);
    const g = new THREE.TubeGeometry(curve, 8, 0.035, 5, false);
    const twig = cyl(0.015, 0.008, 0.35, 0.05, 0.08, 0, -1.1, 4);
    return finish([{ g, tint: 1 }, { g: twig, tint: 1 }]);
  },
  bone() {
    const shaft = cyl(0.025, 0.022, 0.55, 0, 0, 0, Math.PI / 2, 6); shaft.translate(0.27, 0.04, 0);
    const a = new THREE.IcosahedronGeometry(0.05, 0); a.translate(-0.27, 0.05, 0);
    const b = new THREE.IcosahedronGeometry(0.05, 0); b.translate(0.29, 0.05, 0);
    return finish([{ g: shaft, tint: 1 }, { g: a, tint: 1 }, { g: b, tint: 1 }]);
  },
};

// Kind → look: base colour (tint 0), stiffness, roughness, glow, scale range, max slope.
const LOOK = {
  flower:   { base: 0x4a5a32, stiff: 0.05, rough: 0.8, scale: [0.8, 1.3] },
  seedhead: { base: 0x6a6a42, stiff: 0.0, rough: 0.85, scale: [0.8, 1.25] },
  reed:     { base: 0x3a3424, stiff: 0.15, rough: 0.8, scale: [0.85, 1.3], wet: true },
  fern:     { base: 0x3a5a2a, stiff: 0.35, rough: 0.75, scale: [0.8, 1.4] },
  bush:     { base: 0x34502a, stiff: 0.75, rough: 0.85, scale: [0.7, 1.4] },
  ashgrass: { base: 0x5a5450, stiff: 0.0, rough: 0.9, scale: [0.8, 1.3] },
  bonereed: { base: 0xd8d0c0, stiff: 0.3, rough: 0.6, scale: [0.8, 1.3] },
  fungus:   { base: 0xcfc6b0, stiff: 0.9, rough: 0.5, glow: 1.4, scale: [0.7, 1.6] },
  crystal:  { base: 0xffffff, stiff: 1.0, rough: 0.15, glow: 0.7, scale: [0.6, 1.6], metal: 0.1 },
  stone:    { base: 0x777777, stiff: 1.0, rough: 0.95, scale: [0.5, 1.8], debris: true },
  pebbles:  { base: 0x777777, stiff: 1.0, rough: 0.95, scale: [0.8, 1.4], debris: true },
  branch:   { base: 0x4a3a2a, stiff: 1.0, rough: 0.95, scale: [0.7, 1.4], debris: true },
  bone:     { base: 0xe0d6c4, stiff: 1.0, rough: 0.7, scale: [0.7, 1.3], debris: true },
};

function makeMaterial(kind) {
  const L = LOOK[kind];
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: L.rough, metalness: L.metal || 0, side: THREE.DoubleSide,
    emissive: L.glow ? 0xffffff : 0x000000, emissiveIntensity: L.glow || 0,
  });
  const base = new THREE.Color(L.base);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, windUniforms);
    shader.uniforms.uBase = { value: base };
    shader.uniforms.uStiff = { value: L.stiff };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float hgt;\nattribute float tint;\nvarying float vTint;\nvarying float vHgt;\nuniform float uStiff;\n' + WIND_GLSL)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vTint = tint; vHgt = hgt;
if (uStiff < 0.99) {
  vec3 base = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  vec3 c0 = instanceMatrix[0].xyz, c1 = instanceMatrix[1].xyz, c2 = instanceMatrix[2].xyz;
  float s = length(c1);
  vec3 wd = windDisplace(base, hgt * s, uStiff) * 0.8;
  transformed += vec3(dot(wd, c0) / dot(c0, c0), dot(wd, c1) / dot(c1, c1), dot(wd, c2) / dot(c2, c2));
}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uBase;\nvarying float vTint;\nvarying float vHgt;')
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb = mix(uBase, diffuseColor.rgb, vTint) * mix(0.55, 1.08, clamp(vHgt * 1.6 + 0.25, 0.0, 1.0));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance *= diffuseColor.rgb * vTint;`);
  };
  return mat;
}

export class Flora {
  /**
   * @param {(x,z)=>number} groundY
   * @param {(x,z)=>object} biomeAt
   * @param {(x,z)=>({surf:number,bed:number}|null)} waterAt
   */
  constructor(groundY, biomeAt, waterAt) {
    Object.assign(this, { groundY, biomeAt, waterAt });
    this.cfg = TIER[quality.tier] || TIER.medium;
    this.enabled = !!this.cfg;
    this.mesh = new THREE.Group();
    this.mesh.name = 'flora';
    this._center = new THREE.Vector2(1e9, 1e9);
    this._job = null;
    if (!this.enabled) return;
    const kinds = this.cfg.kinds || Object.keys(BUILD);
    const cells = Math.ceil((this.cfg.radius * 2) / this.cfg.cell) ** 2;
    this.kinds = kinds;
    this._sets = [0, 1].map(() => {
      const set = {};
      for (const k of kinds) {
        const geo = (this._geo ||= {})[k] ||= BUILD[k]();
        const mat = (this._mat ||= {})[k] ||= makeMaterial(k);
        // Debris is rarer per cell than the cell count, so it gets a smaller pool.
        const im = new THREE.InstancedMesh(geo, mat, Math.ceil(cells * 0.22));
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.setColorAt(0, new THREE.Color());
        im.count = 0; im.frustumCulled = false; im.receiveShadow = true; im.castShadow = false;
        im.name = `flora-${k}`;
        set[k] = im;
        this.mesh.add(im);
      }
      return set;
    });
    this._front = 0;
    for (const im of Object.values(this._sets[1])) im.visible = false;
  }

  get count() { return this._sets ? Object.values(this._sets[this._front]).reduce((a, im) => a + im.count, 0) : 0; }

  update(dt, at) {
    if (!this.enabled) return;
    if (!this._job && Math.hypot(at.x - this._center.x, at.z - this._center.y) >= 7) {
      this._center.set(Math.round(at.x / 4) * 4, Math.round(at.z / 4) * 4);
      this._job = this._reseatJob(this._sets[1 - this._front]);
    }
    if (this._job) {
      const all = this.count === 0, budget = performance.now() + BUDGET_MS;
      while (all || performance.now() < budget) {
        if (this._job.next().done) {
          for (const im of Object.values(this._sets[this._front])) im.visible = false;
          this._front = 1 - this._front;
          for (const im of Object.values(this._sets[this._front])) im.visible = true;
          this._job = null;
          break;
        }
      }
    }
  }

  invalidate() { this._center.set(1e9, 1e9); this._job = null; }

  *_reseatJob(set) {
    const { radius, cell } = this.cfg;
    const cx = this._center.x, cz = this._center.y;
    for (const im of Object.values(set)) im.count = 0;
    const biomes = new Map();
    const floraAt = (x, z) => {
      const key = `${Math.floor(x / WORLD.CHUNK_SIZE)},${Math.floor(z / WORLD.CHUNK_SIZE)}`;
      if (!biomes.has(key)) {
        const b = this.biomeAt(x, z);
        const id = b?.id || b?.key;
        biomes.set(key, (b && (FLORA_BY_BIOME[id] || FLORA_BY_BIOME[b._id])) || null);
      }
      return biomes.get(key);
    };
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), t = new THREE.Vector3();
    const col = new THREE.Color();
    const n = Math.ceil((radius * 2) / cell);
    for (let i = 0; i < n; i++) {
      if ((i & 1) === 1) yield;
      for (let j = 0; j < n; j++) {
        const gx = cx - radius + i * cell, gz = cz - radius + j * cell;
        const x = gx + (hash(gx, gz, 1) - 0.5) * cell * 0.9, z = gz + (hash(gz, gx, 2) - 0.5) * cell * 0.9;
        if (Math.hypot(x - cx, z - cz) > radius) continue;
        const table = floraAt(x, z);
        if (!table) continue;
        // One kind per cell at most, chosen by a single roll against the
        // cumulative probabilities — so the table's numbers ARE the mix.
        let roll = hash(x, z, 3), kind = null, look = null;
        for (const k in table) {
          if (!set[k]) continue;
          if (roll < table[k].p) { kind = k; look = table[k]; break; }
          roll -= table[k].p;
        }
        if (!kind) continue;
        const L = LOOK[kind];
        const y = this.groundY(x, z);
        // Slope: debris lies on slopes, plants do not grow on cliffs.
        const sl = Math.abs(this.groundY(x + 0.8, z) - y) + Math.abs(this.groundY(x, z + 0.8) - y);
        if (sl > (L.debris ? 1.1 : 0.7)) continue;
        // Water: reeds want its edge; nothing else stands in it.
        const w = this.waterAt ? this.waterAt(x, z) : null;
        const depth = w ? w.surf - y : -9;
        if (L.wet) { if (depth < -0.6 || depth > 0.55) { if (hash(z, x, 9) > 0.25) continue; } }
        else if (depth > 0.08 && !(kind === 'stone' && depth < 0.5)) continue;
        const im = set[kind];
        if (im.count >= im.instanceMatrix.count) continue;
        const sc = L.scale[0] + hash(x, z, 4) * (L.scale[1] - L.scale[0]);
        e.set(L.debris ? (hash(x, z, 5) - 0.5) * 0.4 : 0, hash(x, z, 6) * Math.PI * 2, L.debris ? (hash(z, x, 7) - 0.5) * 0.4 : 0);
        q.setFromEuler(e);
        m.compose(t.set(x, y - (L.debris ? 0.05 : 0.02), z), q, s.set(sc, sc * (0.85 + hash(z, x, 8) * 0.3), sc));
        im.setMatrixAt(im.count, m);
        col.setHex(look.cols[Math.floor(hash(x, z, 10) * look.cols.length) % look.cols.length]);
        col.offsetHSL(0, 0, (hash(z, x, 11) - 0.5) * 0.08);
        im.setColorAt(im.count, col);
        im.count++;
      }
    }
    for (const im of Object.values(set)) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}
