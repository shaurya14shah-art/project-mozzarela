// ══════════════════════════════════════════════════════════
// Fauna — anatomical animals, built in code
//
// Owner: "improve the mob 3d models, they are so shit". The first
// expansion animals were an ellipsoid on four sticks with a blob head.
// These are built the way a modeller would block an animal:
//
//   · ONE continuous swept body per part (rump → barrel → chest, then
//     neck → skull → muzzle), every station an ellipse with its own
//     width and depth, so the silhouette has a waist, a deep chest, a
//     rising wither, a jaw line — not a pill.
//   · LIMBS with real joints: a muscled upper leg, the hind HOCK that
//     bends backward, a thin cannon bone, then a hoof or a toed paw. The
//     body is lifted until the feet are measured to stand on the ground.
//   · COLOUR in the vertices: a dark back shading to a pale belly, then
//     the species' own marks (spots, stripes, tail flag, mask, socks),
//     speckled so it is never a flat fill. One shared FUR material adds a
//     fine normal grain so the surface reads as hair, not plastic.
//   · HEADS with eyes in lids, shaped ears, a nose pad, a jaw that opens.
//
// Contract (Creatures.js / EntityForge.animateCreature): returns a Group
// whose `userData.creature.animate(dt, t, { speed, attack, strain })`
// drives the walk, grazing, the windup crouch and the strike.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { roundCone, smin, surfaceNets } from './Hand.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function hash(x, y = 0, z = 0) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }

/** Piecewise-linear lookup over sorted [t, ...values] keys. */
function keyAt(keys, t, i) {
  if (t <= keys[0][0]) return keys[0][i];
  for (let k = 1; k < keys.length; k++) {
    if (t <= keys[k][0]) {
      const a = keys[k - 1], b = keys[k], u = (t - a[0]) / (b[0] - a[0]);
      const s = u * u * (3 - 2 * u);
      return lerp(a[i], b[i], s);
    }
  }
  return keys[keys.length - 1][i];
}

// ── Shared materials ──────────────────────────────────────
let _fur = null, _eye = null, _keratin = null, _pad = null, _glow = new Map();
function furMat() {
  if (_fur) return _fur;
  _fur = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  // Hair grain: a fine directional normal jitter in object space, so the
  // coat catches light in streaks rather than as a smooth shell.
  _fur.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFurP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFurP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vFurP;
float fh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 q = vFurP * vec3(90.0, 260.0, 90.0);
  vec3 j = vec3(fh(floor(q)), fh(floor(q) + 7.1), fh(floor(q) + 13.3)) - 0.5;
  normal = normalize(normal + j * 0.32);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= 0.9 + 0.2 * fh(floor(vFurP * 140.0));`);
  };
  _fur.customProgramCacheKey = () => 'fauna-fur-1';
  return _fur;
}
const eyeMat = () => _eye || (_eye = new THREE.MeshStandardMaterial({ color: 0x0b0806, roughness: 0.08, metalness: 0.1 }));
const keratinMat = () => _keratin || (_keratin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.02 }));
const padMat = () => _pad || (_pad = new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.7 }));
function glowMat(c) {
  if (!_glow.has(c)) _glow.set(c, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.6, roughness: 0.4, toneMapped: false }));
  return _glow.get(c);
}
function mesh(g, m) { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; return o; }

/**
 * A swept body: a spine (array of Vector3, any direction) and a section
 * function giving half-width, half-height and vertical offset per t.
 * `paint(t, a, p)` returns a Color for the vertex at angle `a`
 * (0 = right side, π/2 = top) — the coat.
 */
function sweep(spine, section, paint, { segs = 40, rad = 18, capStart = true, capEnd = true } = {}) {
  const curve = new THREE.CatmullRomCurve3(spine, false, 'catmullrom', 0.4);
  const pos = [], col = [], idx = [];
  const side = V(1, 0, 0), up = V(), T = V(), c = new THREE.Color();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, P = curve.getPointAt(t);
    curve.getTangentAt(t, T);
    // Spines live in the YZ plane, or close: x is the side.
    side.set(1, 0, 0);
    up.crossVectors(T, side).normalize();
    if (up.lengthSq() < 0.5) up.set(0, 1, 0);
    // A spine running backwards (a tail) would put "up" underneath and
    // paint the belly on the back. Turning the whole frame 180° about the
    // spine keeps the winding (faces stay outward) and "up" up.
    if (up.y < -0.01) { up.negate(); side.set(-1, 0, 0); }
    const s = section(t);
    for (let j = 0; j <= rad; j++) {
      const a = (j / rad) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      // A slightly squared ellipse (superellipse) reads as muscle, not tube.
      const e = 0.85;
      const cx = Math.sign(ca) * Math.pow(Math.abs(ca), e), cy = Math.sign(sa) * Math.pow(Math.abs(sa), e);
      const x = P.x + side.x * cx * s.w + up.x * (cy * s.h + (s.dy || 0));
      const y = P.y + side.y * cx * s.w + up.y * (cy * s.h + (s.dy || 0));
      const z = P.z + side.z * cx * s.w + up.z * (cy * s.h + (s.dy || 0));
      pos.push(x, y, z);
      paint(t, a, c, x, y, z); col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < rad; j++) {
    const a = i * (rad + 1) + j, b = a + rad + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const addCap = (ring, flip) => {
    const ci = pos.length / 3; let sx = 0, sy = 0, sz = 0;
    for (let j = 0; j <= rad; j++) { const k = (ring * (rad + 1) + j) * 3; sx += pos[k]; sy += pos[k + 1]; sz += pos[k + 2]; }
    pos.push(sx / (rad + 1), sy / (rad + 1), sz / (rad + 1));
    const k0 = ring * (rad + 1) * 3; col.push(col[k0], col[k0 + 1], col[k0 + 2]);
    for (let j = 0; j < rad; j++) { const a = ring * (rad + 1) + j; flip ? idx.push(ci, a + 1, a) : idx.push(ci, a, a + 1); }
  };
  if (capStart) addCap(0, false);
  if (capEnd) addCap(segs, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** The coat: back → belly shading, speckle, and the species' marks. */
function coat(sp) {
  const back = new THREE.Color(sp.back), side = new THREE.Color(sp.side ?? sp.back), belly = new THREE.Color(sp.belly);
  const mark = new THREE.Color(sp.mark ?? sp.back);
  return (part) => (t, a, c, x, y, z) => {
    const up = Math.sin(a);
    if (up > 0.2) c.copy(side).lerp(back, ss(0.2, 0.9, up));
    else c.copy(side).lerp(belly, ss(0.15, -0.65, up));
    // Speckle — the hairs are not all one colour.
    const n = hash(Math.floor(x * 40), Math.floor(y * 40), Math.floor(z * 40));
    c.multiplyScalar(0.9 + n * 0.18);
    // Marks.
    const m = sp.marks || [];
    if (m.includes('spots') && part === 'body' && up > 0.3 && hash(Math.floor(x * 30), Math.floor(z * 26 + y * 22)) > 0.9) c.lerp(sp.spotColor ? new THREE.Color(sp.spotColor) : belly, 0.65);
    if (m.includes('rosettes') && part === 'body' && up > -0.3 && hash(Math.floor(x * 34), Math.floor(z * 30 + y * 26)) > 0.86) c.lerp(mark, 0.5);
    if (m.includes('stripes') && part === 'body' && up > 0 && Math.sin(z * 34 + Math.sin(y * 9) * 1.5) > 0.82) c.lerp(mark, 0.32);
    if (m.includes('dorsal') && up > 0.85) c.lerp(mark, 0.7);
    if (m.includes('mask') && part === 'head' && t > 0.55) c.lerp(mark, 0.6 * ss(0.55, 0.8, t));
    if (m.includes('pale_muzzle') && part === 'head' && t > 0.7) c.lerp(belly, 0.7);
    if (m.includes('socks') && part === 'leg' && t > 0.65) c.lerp(mark, 0.8);
    if (m.includes('flag') && part === 'tail' && up < 0.2) c.copy(belly);
    if (m.includes('tailtip') && part === 'tail' && t > 0.7) c.copy(mark);
    if (m.includes('mane') && part === 'neck' && up > 0.2) c.lerp(mark, 0.7);
    if (m.includes('glowbelly') && up < -0.4) c.lerp(new THREE.Color(sp.glow), 0.85);
  };
}

/**
 * A limb hanging along −Y from a pivot. `segs` = [{ len, r0, r1, bulge }]
 * Returns { root, joints[], foot } where joints rotate about X.
 */
function limb(sp, segs, paint, footKind, side) {
  const root = new THREE.Group(), joints = [];
  let parent = root;
  segs.forEach((s, i) => {
    const j = new THREE.Group(); parent.add(j); joints.push(j);
    // A rounded joint (knee, hock, fetlock) so segments meet as one limb,
    // not as pegs with a seam between them.
    if (i > 0) {
      const kr = s.r0 * 1.12;
      const kg = new THREE.SphereGeometry(kr, 12, 10); kg.scale(1, 1, 1.15);
      const kc = new THREE.Color(); paint(Math.min(1, i / segs.length), Math.PI / 2, kc, 0, 0, 0);
      j.add(mesh(tintGeo(kg, kc.getHex()), furMat()));
    }
    const g = sweep([V(0, 0.02, 0), V(0, -s.len * 0.5, s.fwd || 0), V(0, -s.len - 0.01, 0)], (t) => {
      const r = lerp(s.r0, s.r1, t) * (1 + (s.bulge || 0) * Math.sin(Math.PI * Math.min(1, t * 1.4)));
      return { w: r * (s.flat || 1), h: r };
    }, (t, a, c, x, y, z) => paint(Math.min(1, (i + t) / segs.length), a, c, x, y, z), { segs: 10, rad: 10 });
    // Rotate the sweep so its "up" (the ellipse's h axis) faces forward.
    j.add(mesh(g, furMat()));
    const next = new THREE.Group(); next.position.y = -s.len; j.add(next);
    parent = next;
  });
  const foot = new THREE.Group(); parent.add(foot);
  const fr = segs[segs.length - 1].r1;
  if (footKind === 'hoof') {
    const h = new THREE.CylinderGeometry(fr * 1.05, fr * 1.35, fr * 2.2, 10); h.translate(0, -fr * 1.1, fr * 0.25);
    foot.add(mesh(h, padMat()));
    // The cleft.
    const cl = new THREE.BoxGeometry(fr * 0.2, fr * 2.0, fr * 1.2); cl.translate(0, -fr * 1.1, fr * 0.9);
    foot.add(mesh(cl, eyeMat()));
  } else if (footKind === 'paw') {
    const pg = new THREE.SphereGeometry(fr * 1.5, 10, 8); pg.scale(1, 0.55, 1.35); pg.translate(0, -fr * 0.6, fr * 0.5);
    foot.add(mesh(tintGeo(pg, sp.foot === 'paw' && (sp.marks || []).includes('socks') ? sp.mark : sp.side ?? sp.back), furMat()));
    for (let k = 0; k < 4; k++) {
      const toe = new THREE.SphereGeometry(fr * 0.5, 8, 6); toe.scale(1, 0.7, 1.2);
      toe.translate((k - 1.5) * fr * 0.7, -fr * 0.95, fr * (1.6 - Math.abs(k - 1.5) * 0.25));
      foot.add(mesh(tintGeo(toe, sp.side ?? sp.back), furMat()));
      if (sp.claws) { const cl = new THREE.ConeGeometry(fr * 0.16, fr * 0.7, 5); cl.rotateX(Math.PI / 2); cl.translate((k - 1.5) * fr * 0.7, -fr * 1.05, fr * (2.1 - Math.abs(k - 1.5) * 0.25)); foot.add(mesh(cl, padMat())); }
    }
  } else if (footKind === 'splay') {
    for (let k = 0; k < 5; k++) {
      const a = (k - 2) * 0.38;
      const tg = new THREE.CylinderGeometry(fr * 0.25, fr * 0.4, fr * 3.2, 6); tg.rotateX(Math.PI / 2); tg.translate(0, -fr * 0.5, fr * 1.6);
      const toe = mesh(tintGeo(tg, sp.side ?? sp.back), furMat()); toe.rotation.y = a; foot.add(toe);
    }
  }
  return { root, joints, foot };
}

// ══════════════════════════════════════════════════════════
// SPECIES — proportions in metres, from the animal, not from a pill
// body: [t, halfWidth, halfHeight, dy] along rump(0) → chest(1)
// head: [t, halfWidth, halfHeight, dy] along skull(0) → nose(1)
// ══════════════════════════════════════════════════════════
const SPECIES = {
  deer: {
    back: 0x7a5434, side: 0x9a6e46, belly: 0xe6dccb, mark: 0xf2ece0, marks: ['flag', 'pale_muzzle', 'spots'], spotColor: 0xd8c0a0,
    len: 1.05, hip: 0.86, body: [[0, 0.05, 0.06, 0], [0.1, 0.16, 0.2, 0], [0.32, 0.17, 0.21, -0.01], [0.55, 0.15, 0.2, -0.02], [0.82, 0.18, 0.25, 0], [1, 0.1, 0.18, 0.04]],
    neck: { len: 0.5, pitch: 0.95, w0: 0.1, h0: 0.15, w1: 0.06, h1: 0.075 },
    head: { len: 0.3, keys: [[0, 0.06, 0.07, 0.01], [0.3, 0.065, 0.075, 0.01], [0.7, 0.04, 0.045, -0.015], [1, 0.03, 0.032, -0.02]], pitch: 0.95, ears: { len: 0.13, w: 0.045, angle: 0.75 }, eyes: 0.017 },
    front: [{ len: 0.3, r0: 0.06, r1: 0.04, bulge: 0.35 }, { len: 0.32, r0: 0.03, r1: 0.022 }, { len: 0.18, r0: 0.02, r1: 0.017 }],
    hind: [{ len: 0.34, r0: 0.085, r1: 0.045, bulge: 0.4 }, { len: 0.34, r0: 0.035, r1: 0.025 }, { len: 0.24, r0: 0.02, r1: 0.017 }],
    foot: 'hoof', tail: { len: 0.14, r: 0.04, lift: 0.4 }, antlers: 1,
  },
  elk: {
    back: 0x5a4632, side: 0x7a6248, belly: 0x3a2e22, mark: 0x3a2a1c, marks: ['mane', 'pale_muzzle'],
    len: 1.5, hip: 1.25, body: [[0, 0.08, 0.1, 0], [0.12, 0.24, 0.3, 0], [0.4, 0.25, 0.31, -0.02], [0.62, 0.23, 0.3, -0.02], [0.85, 0.27, 0.37, 0.03], [1, 0.15, 0.25, 0.06]],
    neck: { len: 0.6, pitch: 0.75, w0: 0.15, h0: 0.24, w1: 0.09, h1: 0.11 },
    head: { len: 0.45, keys: [[0, 0.09, 0.1, 0.01], [0.35, 0.09, 0.11, 0], [0.75, 0.06, 0.07, -0.02], [1, 0.05, 0.05, -0.03]], pitch: 1.05, ears: { len: 0.16, w: 0.06, angle: 0.8 }, eyes: 0.022 },
    front: [{ len: 0.45, r0: 0.09, r1: 0.055, bulge: 0.35 }, { len: 0.45, r0: 0.045, r1: 0.032 }, { len: 0.24, r0: 0.03, r1: 0.026 }],
    hind: [{ len: 0.5, r0: 0.12, r1: 0.06, bulge: 0.4 }, { len: 0.46, r0: 0.05, r1: 0.035 }, { len: 0.32, r0: 0.03, r1: 0.026 }],
    foot: 'hoof', tail: { len: 0.1, r: 0.05, lift: 0.2 }, antlers: 2,
  },
  goat: {
    back: 0xd8d2c4, side: 0xe0dace, belly: 0xc8c0b0, mark: 0x4a4038, marks: ['dorsal', 'socks'],
    len: 0.85, hip: 0.62, slim: 0.82, body: [[0, 0.06, 0.07, 0], [0.12, 0.17, 0.2, 0], [0.4, 0.19, 0.22, -0.02], [0.66, 0.18, 0.22, -0.01], [0.88, 0.19, 0.24, 0.02], [1, 0.1, 0.16, 0.04]],
    neck: { len: 0.34, pitch: 0.85, w0: 0.1, h0: 0.15, w1: 0.065, h1: 0.08 },
    head: { len: 0.27, keys: [[0, 0.065, 0.08, 0.01], [0.35, 0.06, 0.08, 0], [0.75, 0.04, 0.05, -0.02], [1, 0.03, 0.035, -0.025]], pitch: 1.15, ears: { len: 0.11, w: 0.04, angle: 1.35 }, eyes: 0.016, beard: true },
    front: [{ len: 0.22, r0: 0.06, r1: 0.04, bulge: 0.3 }, { len: 0.22, r0: 0.035, r1: 0.026 }, { len: 0.12, r0: 0.025, r1: 0.022 }],
    hind: [{ len: 0.26, r0: 0.08, r1: 0.045, bulge: 0.35 }, { len: 0.22, r0: 0.035, r1: 0.027 }, { len: 0.16, r0: 0.025, r1: 0.022 }],
    foot: 'hoof', tail: { len: 0.1, r: 0.03, lift: 0.9 }, horns: 'curl',
  },
  boar: {
    back: 0x2a1f18, side: 0x3e2e22, belly: 0x5a4636, mark: 0x15100c, marks: ['dorsal'],
    len: 1.0, hip: 0.5, slim: 0.88, body: [[0, 0.07, 0.09, 0], [0.12, 0.2, 0.24, 0], [0.4, 0.22, 0.27, 0], [0.7, 0.24, 0.31, 0.03], [0.9, 0.24, 0.32, 0.05], [1, 0.14, 0.22, 0.05]],
    neck: { len: 0.12, pitch: 0.1, w0: 0.17, h0: 0.24, w1: 0.15, h1: 0.2 },
    head: { len: 0.42, keys: [[0, 0.14, 0.17, 0.02], [0.3, 0.12, 0.14, 0], [0.7, 0.07, 0.08, -0.03], [1, 0.06, 0.055, -0.04]], pitch: 0.35, ears: { len: 0.09, w: 0.05, angle: 0.5 }, eyes: 0.014, tusks: true, snoutDisc: true },
    front: [{ len: 0.24, r0: 0.08, r1: 0.05, bulge: 0.3 }, { len: 0.2, r0: 0.042, r1: 0.034 }, { len: 0.09, r0: 0.032, r1: 0.03 }],
    hind: [{ len: 0.26, r0: 0.1, r1: 0.055, bulge: 0.4 }, { len: 0.2, r0: 0.042, r1: 0.034 }, { len: 0.11, r0: 0.032, r1: 0.03 }],
    foot: 'hoof', tail: { len: 0.18, r: 0.015, lift: 0.1 }, bristle: true,
  },
  antelope: {
    back: 0xc08a50, side: 0xc89a62, belly: 0xf2ece0, mark: 0x3a2a1c, marks: ['flag', 'stripes'],
    len: 0.95, hip: 0.84, body: [[0, 0.05, 0.06, 0], [0.1, 0.14, 0.18, 0], [0.38, 0.15, 0.19, -0.02], [0.6, 0.14, 0.18, -0.02], [0.84, 0.16, 0.22, 0], [1, 0.09, 0.15, 0.03]],
    neck: { len: 0.45, pitch: 0.9, w0: 0.08, h0: 0.13, w1: 0.05, h1: 0.065 },
    head: { len: 0.26, keys: [[0, 0.055, 0.065, 0.01], [0.3, 0.055, 0.065, 0], [0.75, 0.035, 0.04, -0.015], [1, 0.026, 0.028, -0.02]], pitch: 1.0, ears: { len: 0.11, w: 0.035, angle: 0.95 }, eyes: 0.016 },
    front: [{ len: 0.28, r0: 0.05, r1: 0.032, bulge: 0.3 }, { len: 0.3, r0: 0.025, r1: 0.018 }, { len: 0.17, r0: 0.017, r1: 0.014 }],
    hind: [{ len: 0.32, r0: 0.075, r1: 0.04, bulge: 0.4 }, { len: 0.32, r0: 0.03, r1: 0.02 }, { len: 0.22, r0: 0.017, r1: 0.014 }],
    foot: 'hoof', tail: { len: 0.16, r: 0.025, lift: 0.3 }, horns: 'spike',
  },
  strider: {
    // A long-legged marsh grazer: tall, narrow, high-necked, splay-toed for mud.
    back: 0x3c4632, side: 0x56603e, belly: 0xa8a880, mark: 0x26301c, marks: ['dorsal', 'pale_muzzle', 'socks'],
    len: 0.95, hip: 1.1, slim: 0.85, body: [[0, 0.05, 0.06, 0], [0.12, 0.14, 0.18, 0], [0.4, 0.15, 0.19, -0.01], [0.66, 0.14, 0.19, -0.01], [0.88, 0.15, 0.21, 0.01], [1, 0.08, 0.14, 0.03]],
    neck: { len: 0.62, pitch: 1.0, w0: 0.08, h0: 0.12, w1: 0.05, h1: 0.065 },
    head: { len: 0.34, keys: [[0, 0.055, 0.065, 0.01], [0.35, 0.05, 0.06, 0], [0.75, 0.035, 0.04, -0.015], [1, 0.03, 0.03, -0.02]], pitch: 1.05, ears: { len: 0.12, w: 0.04, angle: 1.0 }, eyes: 0.016 },
    front: [{ len: 0.38, r0: 0.05, r1: 0.032, bulge: 0.3 }, { len: 0.42, r0: 0.026, r1: 0.019 }, { len: 0.24, r0: 0.019, r1: 0.016 }],
    hind: [{ len: 0.42, r0: 0.07, r1: 0.038, bulge: 0.4 }, { len: 0.42, r0: 0.028, r1: 0.02 }, { len: 0.3, r0: 0.019, r1: 0.016 }],
    foot: 'hoof', tail: { len: 0.12, r: 0.025, lift: 0.2 },
  },
  wolf: {
    back: 0x4a4a4e, side: 0x7a7672, belly: 0xc8c4bc, mark: 0x2a2a2c, marks: ['dorsal', 'mask', 'pale_muzzle', 'tailtip'],
    len: 0.95, hip: 0.6, slim: 0.85, body: [[0, 0.07, 0.08, 0], [0.12, 0.14, 0.17, 0], [0.35, 0.13, 0.17, 0.0], [0.6, 0.16, 0.22, -0.03], [0.85, 0.2, 0.27, -0.02], [1, 0.12, 0.18, 0.03]],
    neck: { len: 0.32, pitch: 0.55, w0: 0.13, h0: 0.17, w1: 0.08, h1: 0.1 },
    head: { len: 0.36, keys: [[0, 0.09, 0.09, 0.02], [0.3, 0.085, 0.085, 0.01], [0.55, 0.05, 0.055, -0.01], [1, 0.03, 0.032, -0.02]], pitch: 0.35, ears: { len: 0.1, w: 0.045, angle: 0.15 }, eyes: 0.014, jaw: true, nose: true },
    front: [{ len: 0.3, r0: 0.065, r1: 0.045, bulge: 0.35 }, { len: 0.27, r0: 0.037, r1: 0.029 }, { len: 0.11, r0: 0.028, r1: 0.026 }],
    hind: [{ len: 0.32, r0: 0.085, r1: 0.05, bulge: 0.4 }, { len: 0.28, r0: 0.039, r1: 0.029 }, { len: 0.17, r0: 0.028, r1: 0.026 }],
    foot: 'paw', claws: true, tail: { len: 0.45, r: 0.07, lift: -0.4, bushy: true },
  },
  bear: {
    back: 0x3a2618, side: 0x4a3220, belly: 0x2e2016, mark: 0x5a4430, marks: ['pale_muzzle'],
    len: 1.4, hip: 0.8, slim: 0.86, body: [[0, 0.12, 0.13, 0], [0.12, 0.32, 0.34, 0], [0.4, 0.36, 0.38, 0], [0.7, 0.36, 0.42, 0.05], [0.85, 0.35, 0.44, 0.08], [1, 0.2, 0.3, 0.05]],
    neck: { len: 0.22, pitch: 0.25, w0: 0.25, h0: 0.3, w1: 0.2, h1: 0.22 },
    head: { len: 0.42, keys: [[0, 0.17, 0.17, 0.02], [0.35, 0.16, 0.15, 0.01], [0.65, 0.09, 0.09, -0.02], [1, 0.065, 0.065, -0.03]], pitch: 0.25, ears: { len: 0.07, w: 0.06, angle: 0.4, round: true }, eyes: 0.015, jaw: true, nose: true },
    front: [{ len: 0.4, r0: 0.14, r1: 0.1, bulge: 0.25 }, { len: 0.38, r0: 0.095, r1: 0.08 }, { len: 0.09, r0: 0.075, r1: 0.075 }],
    hind: [{ len: 0.48, r0: 0.17, r1: 0.1, bulge: 0.3 }, { len: 0.36, r0: 0.095, r1: 0.08 }, { len: 0.11, r0: 0.075, r1: 0.075 }],
    foot: 'paw', claws: true, tail: { len: 0.08, r: 0.05, lift: 0.1 }, hump: true,
  },
  jackal: {
    back: 0x8a6438, side: 0xb08a58, belly: 0xe0d0b0, mark: 0x2a2018, marks: ['dorsal', 'tailtip', 'pale_muzzle'],
    len: 0.75, hip: 0.5, body: [[0, 0.05, 0.06, 0], [0.12, 0.1, 0.13, 0], [0.4, 0.1, 0.13, 0], [0.65, 0.12, 0.16, -0.02], [0.88, 0.14, 0.19, 0], [1, 0.09, 0.13, 0.02]],
    neck: { len: 0.26, pitch: 0.6, w0: 0.09, h0: 0.12, w1: 0.06, h1: 0.07 },
    head: { len: 0.28, keys: [[0, 0.065, 0.065, 0.015], [0.3, 0.06, 0.06, 0.01], [0.55, 0.035, 0.04, -0.005], [1, 0.02, 0.022, -0.012]], pitch: 0.4, ears: { len: 0.13, w: 0.045, angle: 0.1 }, eyes: 0.012, jaw: true, nose: true },
    front: [{ len: 0.2, r0: 0.045, r1: 0.03, bulge: 0.3 }, { len: 0.22, r0: 0.024, r1: 0.018 }, { len: 0.08, r0: 0.018, r1: 0.016 }],
    hind: [{ len: 0.23, r0: 0.06, r1: 0.032, bulge: 0.35 }, { len: 0.22, r0: 0.025, r1: 0.019 }, { len: 0.12, r0: 0.018, r1: 0.016 }],
    foot: 'paw', claws: true, tail: { len: 0.32, r: 0.045, lift: -0.5, bushy: true },
  },
  lynx: {
    back: 0xb8b0a0, side: 0xd0c8b8, belly: 0xf0ece4, mark: 0x5a4e40, marks: ['rosettes', 'tailtip'],
    len: 0.85, hip: 0.56, slim: 0.78, body: [[0, 0.07, 0.08, 0], [0.12, 0.14, 0.17, 0], [0.4, 0.13, 0.16, 0], [0.7, 0.14, 0.18, -0.01], [0.9, 0.15, 0.19, 0], [1, 0.09, 0.13, 0.02]],
    neck: { len: 0.2, pitch: 0.45, w0: 0.1, h0: 0.12, w1: 0.08, h1: 0.09 },
    head: { len: 0.24, keys: [[0, 0.12, 0.11, 0.015], [0.4, 0.115, 0.1, 0], [0.75, 0.065, 0.06, -0.02], [1, 0.045, 0.04, -0.025]], pitch: 0.25, ears: { len: 0.065, w: 0.04, angle: 0.25, tufts: true }, eyes: 0.02, jaw: true, nose: true, ruff: true },
    front: [{ len: 0.28, r0: 0.058, r1: 0.042, bulge: 0.3 }, { len: 0.26, r0: 0.036, r1: 0.031 }, { len: 0.09, r0: 0.032, r1: 0.032 }],
    hind: [{ len: 0.32, r0: 0.075, r1: 0.046, bulge: 0.35 }, { len: 0.28, r0: 0.036, r1: 0.031 }, { len: 0.14, r0: 0.032, r1: 0.032 }],
    foot: 'paw', claws: true, tail: { len: 0.14, r: 0.045, lift: 0.2, uniform: true },
  },
  karst_stalker: {
    back: 0xb4b0a4, side: 0xc8c4b8, belly: 0xe8e4dc, mark: 0x6a6458, marks: ['stripes', 'tailtip', 'mask'],
    len: 1.3, hip: 0.72, slim: 0.78, body: [[0, 0.08, 0.1, 0], [0.12, 0.18, 0.22, 0], [0.42, 0.16, 0.2, 0.0], [0.7, 0.19, 0.24, -0.02], [0.9, 0.2, 0.26, 0], [1, 0.12, 0.17, 0.02]],
    neck: { len: 0.28, pitch: 0.35, w0: 0.14, h0: 0.17, w1: 0.11, h1: 0.12 },
    head: { len: 0.32, keys: [[0, 0.15, 0.135, 0.015], [0.4, 0.14, 0.125, 0], [0.75, 0.085, 0.08, -0.02], [1, 0.06, 0.055, -0.025]], pitch: 0.2, ears: { len: 0.07, w: 0.05, angle: 0.3, round: true }, eyes: 0.018, jaw: true, nose: true },
    front: [{ len: 0.36, r0: 0.08, r1: 0.055, bulge: 0.35 }, { len: 0.34, r0: 0.046, r1: 0.04 }, { len: 0.11, r0: 0.042, r1: 0.04 }],
    hind: [{ len: 0.4, r0: 0.1, r1: 0.06, bulge: 0.4 }, { len: 0.36, r0: 0.046, r1: 0.04 }, { len: 0.18, r0: 0.042, r1: 0.04 }],
    foot: 'paw', claws: true, tail: { len: 1.0, r: 0.06, lift: 0.05, uniform: true },
  },
  gator: {
    back: 0x2e3a22, side: 0x3e4a2c, belly: 0xb0aa7a, mark: 0x1c2414, marks: ['dorsal'], sprawl: true, scutes: true,
    len: 1.3, hip: 0.3, body: [[0, 0.16, 0.12, 0], [0.2, 0.26, 0.15, 0], [0.55, 0.3, 0.16, 0], [0.85, 0.26, 0.15, 0], [1, 0.18, 0.12, 0]],
    neck: { len: 0.25, pitch: -0.05, w0: 0.17, h0: 0.11, w1: 0.15, h1: 0.09 },
    head: { len: 0.7, keys: [[0, 0.14, 0.09, 0.01], [0.3, 0.12, 0.07, 0], [0.7, 0.07, 0.045, -0.005], [1, 0.06, 0.035, -0.005]], pitch: 0.0, ears: null, eyes: 0.02, eyeBumps: true, jaw: true, teeth: true },
    front: [{ len: 0.2, r0: 0.07, r1: 0.05, bulge: 0.3 }, { len: 0.18, r0: 0.045, r1: 0.035 }],
    hind: [{ len: 0.24, r0: 0.09, r1: 0.06, bulge: 0.35 }, { len: 0.2, r0: 0.05, r1: 0.04 }],
    foot: 'splay', tail: { len: 1.4, r: 0.15, lift: 0.0, reptile: true },
  },
  cinder_salamander: {
    back: 0x1e1410, side: 0x2c1c14, belly: 0x3a1a10, mark: 0xff6a20, marks: ['glowbelly', 'stripes'], glow: 0xff6a20, sprawl: true, crest: true,
    len: 1.0, hip: 0.32, body: [[0, 0.13, 0.11, 0], [0.2, 0.2, 0.14, 0], [0.55, 0.22, 0.15, 0], [0.85, 0.19, 0.14, 0], [1, 0.13, 0.11, 0]],
    neck: { len: 0.2, pitch: 0.05, w0: 0.13, h0: 0.1, w1: 0.11, h1: 0.08 },
    head: { len: 0.32, keys: [[0, 0.11, 0.08, 0.01], [0.4, 0.1, 0.065, 0], [0.8, 0.06, 0.04, -0.01], [1, 0.045, 0.03, -0.01]], pitch: 0.05, ears: null, eyes: 0.02, eyeGlow: 0xffa040, jaw: true },
    front: [{ len: 0.17, r0: 0.06, r1: 0.045, bulge: 0.3 }, { len: 0.15, r0: 0.04, r1: 0.032 }],
    hind: [{ len: 0.2, r0: 0.075, r1: 0.05, bulge: 0.35 }, { len: 0.16, r0: 0.045, r1: 0.035 }],
    foot: 'splay', tail: { len: 1.0, r: 0.12, lift: 0.0, reptile: true },
  },
};
export const FAUNA_IDS = Object.keys(SPECIES);

// ══════════════════════════════════════════════════════════
// BUILD
// ══════════════════════════════════════════════════════════
function buildAnimalRigid(id) {
  const sp = SPECIES[id];
  if (!sp) return null;
  const paint = coat(sp);
  const g = new THREE.Group();
  const rig = new THREE.Group(); g.add(rig);         // lifted so feet meet the ground
  const body = new THREE.Group(); rig.add(body);     // bobs and pitches
  const L = sp.len, zr = -L / 2, zc = L / 2;
  // The torso: rump (back) to chest (front), its own top line.
  const spine = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; spine.push(V(0, keyAt(sp.body, t, 3), lerp(zr, zc, t))); }
  body.add(mesh(sweep(spine, (t) => ({ w: keyAt(sp.body, t, 1), h: keyAt(sp.body, t, 2) }), paint('body'), { segs: 36, rad: 20 }), furMat()));
  if (sp.hump) {
    const h = sweep([V(0, 0.2, zc - 0.45), V(0, 0.33, zc - 0.25), V(0, 0.28, zc - 0.05)], (t) => ({ w: 0.2 * Math.sin(Math.PI * t) + 0.02, h: 0.12 * Math.sin(Math.PI * t) + 0.02 }), paint('body'), { segs: 12, rad: 14 });
    body.add(mesh(h, furMat()));
  }
  if (sp.bristle) {
    const br = sweep([V(0, 0.22, zr + 0.2), V(0, 0.3, zc - 0.25), V(0, 0.36, zc + 0.05)], (t) => ({ w: 0.025, h: 0.06 * Math.sin(Math.PI * t) + 0.01 }), (t, a, c) => c.set(0x120c08), { segs: 14, rad: 8 });
    body.add(mesh(br, furMat()));
  }
  if (sp.scutes || sp.crest) {
    const n = 14;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), z = lerp(zr + 0.05, zc - 0.05, t), hh = keyAt(sp.body, t, 2);
      const cg = new THREE.ConeGeometry(sp.crest ? 0.03 : 0.035, sp.crest ? 0.12 : 0.06, 4);
      const m = mesh(cg, sp.crest ? glowMat(sp.glow) : keratinMatFor(0x1c2414));
      m.position.set(sp.crest ? 0 : (i % 2 ? 0.06 : -0.06), hh * 0.95, z); m.rotation.x = -0.25; body.add(m);
    }
  }
  // ── Neck and head (one articulated chain) ──
  const neckPivot = new THREE.Group();
  neckPivot.position.set(0, keyAt(sp.body, 0.92, 2) * 0.45 + keyAt(sp.body, 0.92, 3), zc - 0.06);
  body.add(neckPivot);
  const nk = sp.neck;
  const nDir = V(0, Math.sin(nk.pitch), Math.cos(nk.pitch));
  const nEnd = nDir.clone().multiplyScalar(nk.len);
  neckPivot.add(mesh(sweep([V(0, 0, -0.04), nEnd.clone().multiplyScalar(0.5), nEnd], (t) => ({ w: lerp(nk.w0, nk.w1, t), h: lerp(nk.h0, nk.h1, t) }), paint('neck'), { segs: 14, rad: 18, capStart: false }), furMat()));
  if (sp.head.ruff) for (const s of [-1, 1]) { const r = new THREE.Mesh(tintGeo(new THREE.ConeGeometry(0.05, 0.12, 6), sp.belly), furMat()); r.position.set(s * nk.w1, nEnd.y * 0.8, nEnd.z * 0.8); r.rotation.z = s * 1.9; neckPivot.add(r); }
  const headPivot = new THREE.Group(); headPivot.position.copy(nEnd); neckPivot.add(headPivot);
  const hd = sp.head;
  const head = new THREE.Group(); head.rotation.x = -(hd.pitch - nk.pitch) * 0.8; headPivot.add(head);
  const hDir = V(0, Math.sin(-0.2), Math.cos(-0.2));
  const hEnd = V(0, -hd.len * 0.18, hd.len);
  const headSpine = [V(0, 0.01, -0.05), V(0, 0.0, hd.len * 0.35), V(0, -hd.len * 0.1, hd.len * 0.7), hEnd];
  void hDir;
  head.add(mesh(sweep(headSpine, (t) => ({ w: keyAt(hd.keys, t, 1), h: keyAt(hd.keys, t, 2), dy: keyAt(hd.keys, t, 3) }), paint('head'), { segs: 22, rad: 18 }), furMat()));
  // Eyes in lids.
  const er = hd.eyes;
  for (const s of [-1, 1]) {
    const ex = keyAt(hd.keys, 0.32, 1) * 0.92, ey = keyAt(hd.keys, 0.32, 2) * 0.35 + 0.01;
    const eye = mesh(new THREE.SphereGeometry(er, 12, 10), hd.eyeGlow ? glowMat(hd.eyeGlow) : eyeMat());
    eye.position.set(s * ex, ey, hd.len * 0.3); head.add(eye);
    const lid = mesh(tintGeo(new THREE.TorusGeometry(er * 1.05, er * 0.35, 6, 14), sp.side ?? sp.back), furMat());
    lid.position.copy(eye.position); lid.rotation.y = s * Math.PI / 2; head.add(lid);
    if (hd.eyeBumps) { const b = mesh(tintGeo(new THREE.SphereGeometry(er * 1.6, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), sp.back), furMat()); b.position.set(s * ex * 0.7, ey + er * 0.4, hd.len * 0.28); head.add(b); }
  }
  // Ears.
  const ears = [];
  if (hd.ears) for (const s of [-1, 1]) {
    const e = hd.ears;
    const eg = new THREE.SphereGeometry(1, 10, 8, 0, Math.PI * 2, 0, Math.PI);
    eg.scale(e.w, e.round ? e.w * 1.1 : e.len, e.w * 0.35);
    eg.translate(0, e.round ? e.w : e.len * 0.9, 0);
    const ear = new THREE.Group();
    ear.position.set(s * keyAt(hd.keys, 0.1, 1) * 0.75, keyAt(hd.keys, 0.1, 2) * 0.75, hd.len * 0.05);
    ear.rotation.set(-0.2, s * 0.2, -s * e.angle);
    ear.add(mesh(tintGeo(eg, sp.back), furMat()));
    const inner = eg.clone(); inner.scale(0.7, 0.8, 0.6); inner.translate(0, 0, e.w * 0.18);
    ear.add(mesh(inner, keratinMatFor(0x8a6a5a)));
    if (e.tufts) { const tf = mesh(new THREE.ConeGeometry(0.008, 0.06, 4), padMat()); tf.position.y = e.len * 1.85 + 0.02; ear.add(tf); }
    head.add(ear); ears.push({ ear, s, base: ear.rotation.z });
  }
  // Nose pad, snout disc, beak, beard.
  if (hd.nose) { const n = mesh(new THREE.SphereGeometry(keyAt(hd.keys, 1, 1) * 0.65, 10, 8), padMat()); n.scale.set(1.2, 0.85, 0.8); n.position.copy(hEnd).add(V(0, keyAt(hd.keys, 1, 2) * 0.3 + keyAt(hd.keys, 1, 3), 0.0)); head.add(n); }
  if (hd.snoutDisc) { const n = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 14), keratinMatFor(0x5a3a32)); n.rotation.x = Math.PI / 2; n.position.copy(hEnd).add(V(0, keyAt(hd.keys, 1, 3), 0.01)); head.add(n); }
  if (hd.beak) { const b = mesh(new THREE.ConeGeometry(0.02, 0.22, 8), keratinMatFor(0x2a2418)); b.rotation.x = Math.PI / 2; b.position.copy(hEnd).add(V(0, -0.01, 0.1)); head.add(b); }
  if (hd.beard) { const b = mesh(tintGeo(new THREE.ConeGeometry(0.025, 0.12, 6), sp.back), furMat()); b.rotation.x = Math.PI; b.position.copy(hEnd).add(V(0, -0.07, -0.06)); head.add(b); }
  if (hd.tusks) for (const s of [-1, 1]) { const tk = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, 0, 0), V(s * 0.02, 0.03, 0.03), V(s * 0.015, 0.08, 0.02)]), 8, 0.012, 6); const m = mesh(tk, keratinMatFor(0xe8e0c8)); m.position.copy(hEnd).add(V(s * 0.05, -0.04, -0.08)); head.add(m); }
  // The jaw: a hinged lower muzzle.
  let jaw = null;
  if (hd.jaw) {
    jaw = new THREE.Group(); jaw.position.set(0, -keyAt(hd.keys, 0.35, 2) * 0.62 + keyAt(hd.keys, 0.35, 3), hd.len * 0.22); head.add(jaw);
    const jl = hd.len * 0.78;
    jaw.add(mesh(sweep([V(0, 0, 0), V(0, -0.005, jl * 0.5), V(0, 0.0, jl)], (t) => ({ w: lerp(keyAt(hd.keys, 0.35, 1) * 0.75, keyAt(hd.keys, 1, 1) * 0.7, t), h: lerp(0.025, 0.014, t) * (sp.sprawl ? 1.2 : 1) }), paint('head'), { segs: 10, rad: 12 }), furMat()));
    if (hd.teeth || sp.claws) for (let k = 0; k < (hd.teeth ? 10 : 4); k++) {
      for (const s of [-1, 1]) { const tooth = mesh(new THREE.ConeGeometry(0.008, hd.teeth ? 0.035 : 0.03, 5), keratinMatFor(0xf0ead8)); tooth.position.set(s * keyAt(hd.keys, 0.9, 1) * (hd.teeth ? 0.85 : 0.6), 0.015, jl * (hd.teeth ? 0.25 + k * 0.07 : 0.82 + k * 0.03)); jaw.add(tooth); }
    }
  }
  // Antlers / horns.
  if (sp.antlers) for (const s of [-1, 1]) {
    const k = sp.antlers, base = V(s * 0.045, keyAt(hd.keys, 0.05, 2) * 0.8, hd.len * 0.05);
    const main = [base, base.clone().add(V(s * 0.12 * k, 0.18 * k, -0.08)), base.clone().add(V(s * 0.22 * k, 0.38 * k, -0.12 * k)), base.clone().add(V(s * 0.26 * k, 0.55 * k, -0.02))];
    const curve = new THREE.CatmullRomCurve3(main);
    head.add(mesh(new THREE.TubeGeometry(curve, 16, 0.018 * Math.sqrt(k), 7), keratinMatFor(0xcfc0a0)));
    for (let tn = 0; tn < 2 + k; tn++) {
      const p = curve.getPoint(0.3 + tn * (0.6 / (2 + k)));
      const tip = p.clone().add(V(s * 0.03, 0.12 + tn * 0.02, 0.1 - tn * 0.04).multiplyScalar(Math.sqrt(k)));
      head.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([p, p.clone().lerp(tip, 0.5).add(V(0, 0.01, 0)), tip]), 6, 0.011 * Math.sqrt(k), 6), keratinMatFor(0xd8cab0)));
    }
  }
  if (sp.horns === 'curl') for (const s of [-1, 1]) {
    const pts = []; for (let k = 0; k <= 12; k++) { const a = k / 12 * 3.8; pts.push(V(s * (0.04 + k * 0.008 + Math.sin(a) * 0.05), 0.08 + Math.cos(a) * 0.08 + Math.sin(a) * 0.02, -0.02 - Math.sin(a * 0.6) * 0.1)); }
    const c = new THREE.CatmullRomCurve3(pts);
    const g2 = sweep(pts.map(p => p), (t) => ({ w: 0.024 * (1 - t * 0.7), h: 0.03 * (1 - t * 0.7) }), (t, a, c2, x, y, z) => c2.set(0x6a5e4c).multiplyScalar(0.85 + 0.25 * (Math.sin(t * 60) > 0 ? 1 : 0)), { segs: 30, rad: 8 });
    void c;
    head.add(mesh(g2, keratinMat()));
  }
  if (sp.horns === 'spike') for (const s of [-1, 1]) {
    const pts = [V(s * 0.03, 0.06, 0.02), V(s * 0.05, 0.22, -0.08), V(s * 0.06, 0.38, -0.2)];
    head.add(mesh(sweep(pts, (t) => ({ w: 0.014 * (1 - t * 0.8), h: 0.014 * (1 - t * 0.8) }), (t, a, c2) => c2.set(0x1e1812).multiplyScalar(1 + (Math.sin(t * 45) > 0.4 ? 0.6 : 0)), { segs: 24, rad: 8 }), keratinMat()));
  }
  // ── Legs ──
  const legs = [];
  const sprawl = !!sp.sprawl;
  const make = (front, s) => {
    // ⚠️ The upper leg is a MUSCLE MASS that starts inside the body (the
    // haunch, the shoulder) and narrows to the knee — a leg bolted on at
    // the belly read as a wooden doll's.
    const bt = front ? 0.86 : 0.14, bh = keyAt(sp.body, bt, 2), bwid = keyAt(sp.body, bt, 1);
    const segs = (front ? sp.front : sp.hind).map((q, i) => i === 0
      ? { ...q, len: q.len + bh * 0.55, r0: Math.max(q.r0, Math.min(bh, bwid) * (front ? 0.62 : 0.78)), bulge: 0.12 }
      : q);
    const lp = (t, a, c, x, y, z) => paint('leg')(t, a, c, x, y, z);
    const L2 = limb(sp, segs, lp, sp.foot, s);
    const tz = front ? zc - L * 0.14 : zr + L * 0.14;
    const bw = keyAt(sp.body, front ? 0.86 : 0.14, 1);
    L2.root.position.set(s * bw * (sprawl ? 0.85 : 0.5), (sprawl ? -0.2 : 0.2) * keyAt(sp.body, front ? 0.86 : 0.14, 2), tz);
    if (sprawl) {
      // Lizard: upper leg out to the side and down, forearm straight down.
      L2.root.rotation.z = s * 1.15;
      L2.joints[1].rotation.z = -s * 1.2;
    } else if (front) {
      L2.joints[0].rotation.x = 0.08;
      L2.joints[1].rotation.x = -0.05;
      if (L2.joints[2]) L2.joints[2].rotation.x = 0.05;
    } else {
      // The hind leg: thigh forward, the HOCK bending back, cannon forward.
      L2.joints[0].rotation.x = -0.45;
      L2.joints[1].rotation.x = 0.95;
      if (L2.joints[2]) L2.joints[2].rotation.x = -0.55;
    }
    body.add(L2.root);
    legs.push({ L: L2, front, s, base: L2.joints.map(j => j.rotation.x), baseZ: L2.root.rotation.z, phase: (front === (s > 0)) ? 0 : Math.PI });
  };
  make(true, -1); make(true, 1); make(false, -1); make(false, 1);
  // ── Tail ──
  let tail = null;
  if (sp.tail) {
    const tl = sp.tail; tail = new THREE.Group();
    tail.position.set(0, keyAt(sp.body, 0.02, 2) * 0.4, zr + 0.02); body.add(tail);
    const pts = [V(0, 0, 0)];
    for (let k = 1; k <= 6; k++) { const u = k / 6; pts.push(V(0, tl.lift * tl.len * u * (tl.reptile ? 0 : 1) - (tl.reptile ? 0.05 * u : tl.len * 0.35 * u * u), -tl.len * u)); }
    tail.add(mesh(sweep(pts, (t) => {
      const r = tl.bushy ? tl.r * (0.6 + Math.sin(Math.PI * Math.min(1, t * 1.2)) * 0.7) : tl.r * (1 - t * 0.85);
      return { w: tl.reptile ? r * 0.75 : r, h: r };
    }, paint('tail'), { segs: 16, rad: 12 }), furMat()));
  }
  // ── Stand it on the ground: measure the feet. ──
  rig.updateMatrixWorld(true);
  let minY = Infinity;
  const bb = new THREE.Box3();
  for (const l of legs) { bb.setFromObject(l.L.foot); minY = Math.min(minY, bb.min.y); }
  rig.position.y = -minY;
  const hipY = rig.position.y;

  // ── Life ──
  let ph = hash(sp.len * 13) * 6, low = 0, lunge = 0, graze = 0, flick = 0;
  const neckBase = neckPivot.rotation.x;
  g.userData.creature = {
    animate(dt, t, st) {
      const gait = Math.min(1, st.speed / 2.2), run = ss(2.5, 6, st.speed);
      ph += dt * (2.0 + st.speed * (sprawl ? 2.4 : 1.55));
      low += ((st.attack === 'windup' ? 1 : 0) - low) * Math.min(1, dt * 8);
      lunge += ((st.attack === 'strike' ? 1 : 0) - lunge) * Math.min(1, dt * 14);
      const wantGraze = st.speed < 0.15 && st.attack === 'none' && Math.sin(t * 0.37 + sp.len * 5) > 0.35 ? 1 : 0;
      graze += (wantGraze - graze) * Math.min(1, dt * 1.6);
      // Body: bob twice per stride, roll a little, gallop pitches.
      rig.position.y = hipY + Math.abs(Math.sin(ph)) * (0.012 + run * 0.05) * gait - low * 0.05;
      body.position.z = lunge * 0.3;
      body.rotation.x = Math.sin(ph * 2) * 0.02 * gait + run * Math.sin(ph) * 0.06 + low * 0.08 - lunge * 0.05;
      body.rotation.z = Math.sin(ph) * 0.02 * gait * (sprawl ? 3 : 1);
      if (sprawl) body.rotation.y = Math.sin(ph) * 0.12 * gait;
      // Neck: grazing reaches the ground, windup lowers the head to charge.
      neckPivot.rotation.x = neckBase + graze * (sprawl ? 0.1 : 1.05) + low * 0.45 - lunge * 0.35 + Math.sin(ph * 2) * 0.03 * gait;
      headPivot.rotation.x = graze * 0.35 - lunge * 0.15 + Math.sin(t * 0.8) * 0.03;
      if (jaw) jaw.rotation.x = lunge * 0.6 + low * 0.2 + (graze ? Math.max(0, Math.sin(t * 7)) * 0.1 : 0);
      // Ears flick now and then.
      flick = Math.max(0, flick - dt * 4); if (Math.random() < dt * 0.4) flick = 1;
      for (const e of ears) e.ear.rotation.z = e.base + e.s * flick * 0.25 + (low ? -e.s * 0.4 : 0);
      // Legs: a true stride — reach forward, plant, push back, lift with a folded knee.
      for (const l of legs) {
        const p = ph + l.phase + (run && l.front ? 0.5 : 0);
        const reach = (0.32 + run * 0.35) * gait;
        const sw = Math.sin(p) * reach, lift = Math.max(0, Math.cos(p)) * gait;
        if (sprawl) {
          l.L.root.rotation.y = sw * 0.9;
          l.L.root.rotation.z = l.baseZ + lift * 0.35 * l.s;
        } else {
          l.L.joints[0].rotation.x = l.base[0] - sw;
          l.L.joints[1].rotation.x = l.base[1] + (l.front ? -lift * 0.9 : lift * 0.7);
          if (l.L.joints[2]) l.L.joints[2].rotation.x = l.base[2] + (l.front ? lift * 0.6 : -lift * 0.4);
        }
      }
      if (tail) { tail.rotation.y = Math.sin(t * 2.1 + ph * 0.3) * (sprawl ? 0.35 : 0.2) + (sprawl ? Math.sin(ph) * 0.25 * gait : 0); tail.rotation.x = -run * 0.25 + (sp.tail.bushy ? -low * 0.2 : 0); }
    },
  };
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

const _kerByColor = new Map();
function keratinMatFor(c) {
  if (!_kerByColor.has(c)) _kerByColor.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.02 }));
  return _kerByColor.get(c);
}

/** Give a plain geometry a flat vertex colour (the fur material reads vertex colours). */
function tintGeo(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const k = 0.92 + hash(i) * 0.12; a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

// ══════════════════════════════════════════════════════════
// ONE SKIN — the animal as a single smooth surface on a skeleton
//
// The rigid build above reads as a doll however it is tuned: every part
// is its own shell and the eye finds the seams. Here the animal is a
// signed-distance BODY — round-cone "flesh" on each bone, blended with
// smooth unions (wide for the barrel into the haunch, tight at the
// knees so joints still read) — meshed ONCE per species by surface nets
// (the same mesher as the first-person hand), painted per vertex, and
// SKINNED to a real THREE.Skeleton so it bends without a single seam.
// Ears, eyes, antlers, horns and tusks ride on the head bone.
// The mesh is cached per species; each creature gets its own bones.
// ══════════════════════════════════════════════════════════
const A3 = (v) => [v.x, v.y, v.z];
const _skinCache = new Map();

function legDirs(front, sprawl, s) {
  // Rest pose of a leg: unit directions of each segment, from the joint.
  const d = (fwd, out = 0) => V(out * s, -Math.cos(fwd) * Math.sqrt(1 - out * out), Math.sin(fwd) * Math.sqrt(1 - out * out)).normalize();
  if (sprawl) return [V(s * 0.85, -0.5, 0.08).normalize(), V(0, -1, 0.12).normalize(), V(0, -1, 0.2).normalize()];
  return front ? [d(-0.12), d(0.06), d(0.1)] : [d(0.42), d(-0.62), d(0.3)];
}

/** The skeleton plan: joints in rest pose (world, animal facing +z, feet on y=0). */
function plan(sp) {
  const L = sp.len, zr = -L / 2, zc = L / 2, sprawl = !!sp.sprawl;
  const joints = {}, prims = [];
  // Legs first, to know how high the body stands.
  const legPlan = (front, s) => {
    const segs = front ? sp.front : sp.hind, dirs = legDirs(front, sprawl, s);
    let drop = 0; segs.forEach((g, i) => { drop += dirs[i].y * g.len; });
    return { segs, dirs, drop };
  };
  const lf = legPlan(true, 1), lh = legPlan(false, 1);
  const footR = (lg) => lg.segs[lg.segs.length - 1].r1;
  const yS = -lf.drop + footR(lf), yH = -lh.drop + footR(lh);
  // The torso centre line: rump at hip height, chest at shoulder height.
  const bt = (t) => ({ w: keyAt(sp.body, t, 1) * 0.9 * (sp.slim || 1), h: keyAt(sp.body, t, 2) * 0.9 * (sp.slim || 1), dy: keyAt(sp.body, t, 3) });
  const cy = (t) => lerp(yH + bt(0.14).h * 0.15, yS + bt(0.86).h * 0.15, t) + bt(t).dy;
  joints.root = V(0, cy(0.25), lerp(zr, zc, 0.25));
  joints.spine = V(0, cy(0.72), lerp(zr, zc, 0.72));
  const N = 7;
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N, b0 = bt(t0), b1 = bt(t1);
    const z0 = lerp(zr, zc, t0), z1 = lerp(zr, zc, t1);
    const bone = t1 <= 0.5 ? 'root' : 'spine';
    if (b0.h >= b0.w) {
      const o0 = b0.h - b0.w, o1 = b1.h - b1.w;
      prims.push({ a: [0, cy(t0) + o0, z0], b: [0, cy(t1) + o1, z1], ra: b0.w, rb: b1.w, bone, k: 0.075, part: 'body' });
      prims.push({ a: [0, cy(t0) - o0, z0], b: [0, cy(t1) - o1, z1], ra: b0.w, rb: b1.w, bone, k: 0.075, part: 'body' });
    } else {
      const o0 = b0.w - b0.h, o1 = b1.w - b1.h;
      for (const sx of [-1, 1]) prims.push({ a: [sx * o0, cy(t0), z0], b: [sx * o1, cy(t1), z1], ra: b0.h, rb: b1.h, bone, k: 0.1, part: 'body' });
    }
  }
  if (sp.hump) prims.push({ a: [0, cy(0.6) + bt(0.6).h * 0.6, lerp(zr, zc, 0.62)], b: [0, cy(0.82) + bt(0.82).h * 0.75, lerp(zr, zc, 0.8)], ra: bt(0.7).w * 0.6, rb: bt(0.8).w * 0.55, bone: 'spine', k: 0.14, part: 'body' });
  // Neck.
  const nk = sp.neck, nDir = V(0, Math.sin(nk.pitch), Math.cos(nk.pitch));
  const n0 = V(0, cy(0.95) + bt(0.95).h * 0.35, zc - 0.04);
  const n1 = n0.clone().addScaledVector(nDir, nk.len * 0.5), n2 = n0.clone().addScaledVector(nDir, nk.len);
  joints.neck1 = n0; joints.neck2 = n1; joints.head = n2;
  const nr0 = (nk.w0 + nk.h0) / 2, nr1 = (nk.w1 + nk.h1) / 2;
  prims.push({ a: A3(n0.clone().addScaledVector(nDir, -0.05)), b: A3(n1), ra: nr0, rb: lerp(nr0, nr1, 0.55), bone: 'neck1', k: 0.09, part: 'neck' });
  prims.push({ a: A3(n1), b: A3(n2), ra: lerp(nr0, nr1, 0.55), rb: nr1, bone: 'neck2', k: 0.05, part: 'neck' });
  // Head: skull then muzzle, pointing forward and a little down.
  const hd = sp.head, down = sprawl ? 0.04 : Math.min(0.75, Math.max(0.05, (hd.pitch || 0.5) * 0.55));
  const hDir = V(0, -Math.sin(down), Math.cos(down));
  const hr = (t) => (keyAt(hd.keys, t, 1) + keyAt(hd.keys, t, 2)) / 2;
  const h0 = n2.clone().addScaledVector(hDir, -hr(0) * 0.3), hM = n2.clone().addScaledVector(hDir, hd.len * 0.42), hE = n2.clone().addScaledVector(hDir, hd.len);
  joints.headDir = hDir; joints.headEnd = hE;
  prims.push({ a: A3(h0), b: A3(hM), ra: hr(0), rb: hr(0.42), bone: 'head', k: 0.04, part: 'head' });
  prims.push({ a: A3(hM), b: A3(hE), ra: hr(0.42) * 0.95, rb: hr(1), bone: 'head', k: 0.03, part: 'head' });
  if (hd.jaw) {
    const jd = -hr(0.35) * 0.62;
    const j0 = n2.clone().addScaledVector(hDir, hd.len * 0.22).add(V(0, jd, 0)), j1 = n2.clone().addScaledVector(hDir, hd.len * 0.9).add(V(0, jd * 0.55, 0));
    joints.jaw = j0;
    prims.push({ a: A3(j0), b: A3(j1), ra: hr(0.3) * 0.45, rb: hr(1) * 0.42, bone: 'jaw', k: 0.012, part: 'head' });
  }
  // Legs.
  for (const front of [true, false]) for (const s of [-1, 1]) {
    const lp = legPlan(front, s), t = front ? 0.86 : 0.14, b = bt(t);
    const at = V(s * b.w * (sprawl ? 0.8 : 0.45), front ? yS : yH, lerp(zr, zc, t));
    const key = `${front ? 'f' : 'h'}${s > 0 ? 'R' : 'L'}`;
    let p = at.clone();
    lp.segs.forEach((g, i) => {
      const q = p.clone().addScaledVector(lp.dirs[i], g.len);
      joints[`${key}${i}`] = p.clone();
      // The first segment is muscle: it starts inside the barrel.
      const ra = i === 0 ? Math.max(g.r0, Math.min(b.w, b.h) * (front ? 0.5 : 0.64)) : g.r0;
      const a0 = i === 0 ? p.clone().add(V(0, b.h * 0.45, 0)) : p;
      prims.push({ a: A3(a0), b: A3(q), ra, rb: g.r1, bone: `${key}${i}`, k: i === 0 ? 0.09 : 0.02, part: 'leg', leg: key });
      p = q;
    });
    joints[`${key}foot`] = p.clone();
  }
  // Tail.
  if (sp.tail) {
    const tl = sp.tail, base = V(0, cy(0.02) + bt(0.02).h * 0.3, zr + 0.02);
    let prev = base;
    for (let i = 0; i < 3; i++) {
      const u = (i + 1) / 3;
      const nx = base.clone().add(V(0, tl.reptile ? -0.04 * u : tl.lift * tl.len * u - tl.len * 0.4 * u * u, -tl.len * u));
      joints[`tail${i}`] = prev.clone();
      const taper = (x) => tl.bushy ? tl.r * (0.6 + 0.6 * Math.sin(Math.PI * x + 0.3)) : tl.uniform ? tl.r * (1 - x * 0.3) : tl.r * (1 - x * 0.8);
      const r0 = taper(i / 3), r1 = taper(u);
      prims.push({ a: A3(prev), b: A3(nx), ra: Math.max(0.008, r0), rb: Math.max(0.006, r1), bone: `tail${i}`, k: i === 0 ? 0.05 : 0.02, part: 'tail' });
      prev = nx;
    }
  }
  return { joints, prims };
}

const PARENT = (name) => {
  if (name === 'root') return null;
  if (name === 'spine' || name.startsWith('tail0') || /^h[LR]0$/.test(name)) return 'root';
  if (name === 'neck1' || /^f[LR]0$/.test(name)) return 'spine';
  if (name === 'neck2') return 'neck1';
  if (name === 'head') return 'neck2';
  if (name === 'jaw') return 'head';
  if (name.startsWith('tail')) return `tail${+name[4] - 1}`;
  const m = /^([fh][LR])(\d)$/.exec(name); if (m) return `${m[1]}${+m[2] - 1}`;
  return 'root';
};

function skinGeometry(id) {
  if (_skinCache.has(id)) return _skinCache.get(id);
  const sp = SPECIES[id], P = plan(sp), prims = P.prims;
  // Smooth-union per prim's own k, in order: body, then everything onto it.
  const f = (p) => {
    let d = 1e9;
    for (const q of prims) d = d > 1e8 ? roundCone(p, q) : smin(d, roundCone(p, q), q.k);
    return d;
  };
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const q of prims) for (const e of [q.a, q.b]) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], e[i] - q.ra - 0.06); max[i] = Math.max(max[i], e[i] + q.ra + 0.06); }
  const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const h = Math.max(0.011, size / 110);
  const geo = surfaceNets(f, min, max, h);
  // Skin weights: the two bones whose flesh is nearest.
  const names = Object.keys(P.joints).filter(n => n !== 'headDir' && n !== 'headEnd' && !n.endsWith('foot'));
  const boneIndex = new Map(names.map((n, i) => [n, i]));
  const pos = geo.attributes.position, nrm = geo.attributes.normal, n = pos.count;
  const sIdx = new Uint16Array(n * 4), sW = new Float32Array(n * 4), col = new Float32Array(n * 3);
  const paint = coat(sp), c = new THREE.Color(), pv = [0, 0, 0];
  const hE = P.joints.headEnd, h0 = P.joints.head;
  for (let i = 0; i < n; i++) {
    pv[0] = pos.getX(i); pv[1] = pos.getY(i); pv[2] = pos.getZ(i);
    const best = new Map();
    let near = null, nearD = Infinity;
    for (const q of prims) {
      const d = roundCone(pv, q);
      if (d < (best.get(q.bone) ?? Infinity)) best.set(q.bone, d);
      if (d < nearD) { nearD = d; near = q; }
    }
    const order = [...best.entries()].sort((a, b) => a[1] - b[1]).slice(0, 2);
    const w0 = 1 / Math.pow(Math.max(0.004, order[0][1] + 0.02), 3);
    const w1 = order[1] ? 1 / Math.pow(Math.max(0.004, order[1][1] + 0.02), 3) : 0;
    sIdx[i * 4] = boneIndex.get(order[0][0]); sW[i * 4] = w0 / (w0 + w1);
    if (order[1]) { sIdx[i * 4 + 1] = boneIndex.get(order[1][0]); sW[i * 4 + 1] = w1 / (w0 + w1); }
    // Paint: angle from the normal's up, part and t from the nearest flesh.
    const a = Math.atan2(nrm.getY(i), Math.abs(nrm.getX(i)) + 1e-3);
    let t = 0;
    if (near.part === 'head') { const dz = hE.z - h0.z, dy = hE.y - h0.y; t = Math.max(0, Math.min(1, ((pv[2] - h0.z) * dz + (pv[1] - h0.y) * dy) / (dz * dz + dy * dy))); }
    else if (near.part === 'leg') { const top = P.joints[`${near.leg}0`].y; t = Math.max(0, Math.min(1, 1 - pv[1] / Math.max(0.05, top))); }
    else if (near.part === 'tail') t = Math.min(1, Math.abs(pv[2] - P.joints.tail0.z) / Math.max(0.05, sp.tail.len));
    else t = (pv[2] + sp.len / 2) / sp.len;
    paint(near.part)(t, a, c, pv[0], pv[1], pv[2]);
    // Hooves and pads: the last few centimetres of a foot.
    if (near.part === 'leg' && pv[1] < (sp.foot === 'hoof' ? 0.06 : 0.03)) c.set(sp.foot === 'hoof' ? 0x1c1612 : 0x2a201a);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sIdx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sW, 4));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  const out = { geo, plan: P, names };
  _skinCache.set(id, out);
  return out;
}

export function buildAnimal(id) {
  const sp = SPECIES[id];
  if (!sp) return null;
  const { geo, plan: P, names } = skinGeometry(id);
  // Bones: rest positions relative to their parent.
  const bones = {}, list = [];
  for (const name of names) { const b = new THREE.Bone(); b.name = name; bones[name] = b; list.push(b); }
  for (const name of names) {
    const par = PARENT(name), b = bones[name], w = P.joints[name];
    if (par && bones[par]) { bones[par].add(b); b.position.copy(w).sub(P.joints[par]); }
    else b.position.copy(w);
  }
  const skin = new THREE.SkinnedMesh(geo, furMat());
  skin.add(bones.root);
  skin.bind(new THREE.Skeleton(list));
  skin.castShadow = true; skin.receiveShadow = true;
  skin.frustumCulled = false;
  const g = new THREE.Group(); g.add(skin);
  // ── What rides on the head ──
  const head = bones.head, hw = P.joints.head, hDir = P.joints.headDir, hd = sp.head;
  const local = (v) => v.clone().sub(hw);
  const hr = (t) => (keyAt(hd.keys, t, 1) + keyAt(hd.keys, t, 2)) / 2;
  const er = hd.eyes;
  for (const s of [-1, 1]) {
    const at = hw.clone().addScaledVector(hDir, hd.len * 0.3).add(V(s * hr(0.3) * 0.82, hr(0.3) * 0.38, 0));
    const eye = mesh(new THREE.SphereGeometry(er, 12, 10), hd.eyeGlow ? glowMat(hd.eyeGlow) : eyeMat());
    eye.position.copy(local(at)); head.add(eye);
  }
  if (hd.ears) for (const s of [-1, 1]) {
    const e = hd.ears;
    const eg = new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI);
    eg.scale(e.w, e.round ? e.w * 1.1 : e.len, e.w * 0.32); eg.translate(0, e.round ? e.w * 0.9 : e.len * 0.85, 0);
    const ear = new THREE.Group();
    ear.position.copy(local(hw.clone().addScaledVector(hDir, hd.len * 0.04).add(V(s * hr(0.1) * 0.62, hr(0.1) * 0.78, 0))));
    ear.rotation.set(-0.25, s * 0.25, -s * e.angle);
    ear.add(mesh(tintGeo(eg, sp.back), furMat()));
    const inner = eg.clone(); inner.scale(0.7, 0.82, 0.6); inner.translate(0, 0, e.w * 0.14);
    ear.add(mesh(inner, keratinMatFor(0x8a6458)));
    if (e.tufts) { const tf = mesh(new THREE.ConeGeometry(0.008, 0.06, 4), padMat()); tf.position.y = e.len * 1.75 + 0.03; ear.add(tf); }
    head.add(ear);
  }
  const hE = P.joints.headEnd;
  if (hd.nose) { const n = mesh(new THREE.SphereGeometry(hr(1) * 0.6, 10, 8), padMat()); n.scale.set(1.2, 0.8, 0.8); n.position.copy(local(hE.clone().add(V(0, hr(1) * 0.35, hr(1) * 0.55)))); head.add(n); }
  if (hd.snoutDisc) { const n = mesh(new THREE.CylinderGeometry(hr(1) * 0.95, hr(1) * 0.95, 0.03, 16), keratinMatFor(0x5a3a32)); n.rotation.x = Math.PI / 2 - 0.3; n.position.copy(local(hE.clone().addScaledVector(hDir, hr(1) * 0.8))); head.add(n); }
  if (hd.beak) { const b = mesh(new THREE.ConeGeometry(0.02, 0.24, 8), keratinMatFor(0x2a2418)); b.quaternion.setFromUnitVectors(V(0, 1, 0), hDir); b.position.copy(local(hE.clone().addScaledVector(hDir, 0.11))); head.add(b); }
  if (hd.beard) { const b = mesh(tintGeo(new THREE.ConeGeometry(0.028, 0.14, 6), sp.back), furMat()); b.rotation.x = Math.PI; b.position.copy(local(hE.clone().add(V(0, -hr(1) - 0.06, -0.05)))); head.add(b); }
  if (hd.tusks) for (const s of [-1, 1]) { const tk = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, 0, 0), V(s * 0.02, 0.03, 0.03), V(s * 0.015, 0.08, 0.02)]), 8, 0.012, 6); const m = mesh(tk, keratinMatFor(0xe8e0c8)); m.position.copy(local(hE.clone().add(V(s * hr(1) * 0.8, -hr(1) * 0.5, -0.06)))); head.add(m); }
  if (hd.teeth && bones.jaw) for (let k = 0; k < 9; k++) for (const s of [-1, 1]) {
    const tth = mesh(new THREE.ConeGeometry(0.008, 0.035, 5), keratinMatFor(0xf0ead8));
    tth.position.set(s * hr(0.6) * 0.55, 0.02, 0.06 + k * hd.len * 0.07); bones.jaw.add(tth);
  }
  if (sp.antlers) for (const s of [-1, 1]) {
    const k = sp.antlers, base = local(hw.clone().add(V(s * hr(0.05) * 0.5, hr(0.05) * 0.85, 0)));
    const main = [base, base.clone().add(V(s * 0.12 * k, 0.18 * k, -0.08)), base.clone().add(V(s * 0.22 * k, 0.38 * k, -0.12 * k)), base.clone().add(V(s * 0.26 * k, 0.55 * k, -0.02))];
    const curve = new THREE.CatmullRomCurve3(main);
    head.add(mesh(new THREE.TubeGeometry(curve, 16, 0.018 * Math.sqrt(k), 7), keratinMatFor(0xcfc0a0)));
    for (let tn = 0; tn < 2 + k; tn++) {
      const p = curve.getPoint(0.3 + tn * (0.6 / (2 + k))), tip = p.clone().add(V(s * 0.03, 0.12 + tn * 0.02, 0.1 - tn * 0.04).multiplyScalar(Math.sqrt(k)));
      head.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([p, p.clone().lerp(tip, 0.5).add(V(0, 0.01, 0)), tip]), 6, 0.011 * Math.sqrt(k), 6), keratinMatFor(0xd8cab0)));
    }
  }
  if (sp.horns === 'curl') for (const s of [-1, 1]) {
    const o = local(hw.clone().add(V(0, hr(0.05) * 0.6, 0)));
    const pts = []; for (let k = 0; k <= 12; k++) { const a = k / 12 * 3.8; pts.push(o.clone().add(V(s * (0.035 + k * 0.006 + Math.sin(a) * 0.045), -0.02 + Math.cos(a) * 0.07 + Math.sin(a) * 0.02, -0.02 - Math.sin(a * 0.6) * 0.09))); }
    head.add(mesh(sweep(pts, (t) => ({ w: 0.024 * (1 - t * 0.7), h: 0.03 * (1 - t * 0.7) }), (t, a, c2) => c2.set(0x6a5e4c).multiplyScalar(0.85 + 0.25 * (Math.sin(t * 60) > 0 ? 1 : 0)), { segs: 30, rad: 8 }), keratinMat()));
  }
  if (sp.horns === 'spike') for (const s of [-1, 1]) {
    const o = local(hw.clone().add(V(0, hr(0.05) * 0.7, 0)));
    const pts = [o.clone().add(V(s * 0.03, 0.0, 0.02)), o.clone().add(V(s * 0.05, 0.16, -0.08)), o.clone().add(V(s * 0.06, 0.32, -0.2))];
    head.add(mesh(sweep(pts, (t) => ({ w: 0.014 * (1 - t * 0.8), h: 0.014 * (1 - t * 0.8) }), (t, a, c2) => c2.set(0x1e1812).multiplyScalar(1 + (Math.sin(t * 45) > 0.4 ? 0.6 : 0)), { segs: 24, rad: 8 }), keratinMat()));
  }
  if (sp.scutes || sp.crest) {
    for (let i = 0; i < 12; i++) {
      const t = i / 11, z = lerp(-sp.len / 2 + 0.05, sp.len / 2 - 0.05, t), b = t < 0.5 ? bones.root : bones.spine, bw = P.joints[t < 0.5 ? 'root' : 'spine'];
      const top = keyAt(sp.body, t, 2) + keyAt(sp.body, t, 3) + (P.joints.root.y);
      const m = mesh(new THREE.ConeGeometry(sp.crest ? 0.03 : 0.035, sp.crest ? 0.12 : 0.06, 4), sp.crest ? glowMat(sp.glow) : keratinMatFor(0x1c2414));
      m.position.set(sp.crest ? 0 : (i % 2 ? 0.06 : -0.06), top - bw.y - 0.01, z - bw.z); m.rotation.x = -0.25; b.add(m);
    }
  }
  if (sp.bristle) {
    for (let i = 0; i < 9; i++) { const t = 0.35 + i * 0.07, b = bones.spine, bw = P.joints.spine; const z = lerp(-sp.len / 2, sp.len / 2, t); const m = mesh(new THREE.ConeGeometry(0.018, 0.09, 4), padMat()); m.position.set(0, keyAt(sp.body, t, 2) * 0.95 + P.joints.root.y - bw.y, z - bw.z); m.rotation.x = -0.5; b.add(m); }
  }

  // ── Life ──
  const sprawl = !!sp.sprawl;
  const legs = [];
  for (const key of ['fL', 'fR', 'hL', 'hR']) {
    const front = key[0] === 'f', s = key[1] === 'R' ? 1 : -1;
    legs.push({ b: [0, 1, 2].map(i => bones[`${key}${i}`]).filter(Boolean), front, s, phase: (front === (s > 0)) ? 0 : Math.PI });
  }
  const tails = [0, 1, 2].map(i => bones[`tail${i}`]).filter(Boolean);
  const rootY = bones.root.position.y;
  let ph = hash(sp.len * 13) * 6, low = 0, lunge = 0, graze = 0;
  g.userData.creature = {
    animate(dt, t, st) {
      const gait = Math.min(1, st.speed / 2.2), run = ss(2.5, 6, st.speed);
      ph += dt * (2.0 + st.speed * (sprawl ? 2.4 : 1.55));
      low += ((st.attack === 'windup' ? 1 : 0) - low) * Math.min(1, dt * 8);
      lunge += ((st.attack === 'strike' ? 1 : 0) - lunge) * Math.min(1, dt * 14);
      const wantGraze = st.speed < 0.15 && st.attack === 'none' && Math.sin(t * 0.37 + sp.len * 5) > 0.35 ? 1 : 0;
      graze += (wantGraze - graze) * Math.min(1, dt * 1.6);
      // Breathing, the stride's bob, the gallop's pitch.
      bones.root.position.y = rootY + Math.abs(Math.sin(ph)) * (0.012 + run * 0.05) * gait - low * 0.05 + Math.sin(t * 2.2) * 0.004;
      bones.root.position.z = P.joints.root.z + lunge * 0.3;
      bones.root.rotation.x = run * Math.sin(ph) * 0.05 + low * 0.06;
      bones.root.rotation.z = Math.sin(ph) * 0.02 * gait * (sprawl ? 3 : 1);
      bones.spine.rotation.x = run * Math.sin(ph + 1) * 0.05 - low * 0.04;
      if (sprawl) bones.spine.rotation.y = Math.sin(ph) * 0.14 * gait;
      // The neck reaches down to graze, drops to charge, snaps up on the strike.
      bones.neck1.rotation.x = graze * (sprawl ? 0.1 : 0.75) + low * 0.35 - lunge * 0.25 + Math.sin(ph * 2) * 0.02 * gait;
      bones.neck2.rotation.x = graze * (sprawl ? 0.05 : 0.45) + low * 0.15 - lunge * 0.1;
      bones.head.rotation.x = graze * 0.2 - lunge * 0.15 + Math.sin(t * 0.8) * 0.03;
      bones.head.rotation.y = Math.sin(t * 0.43) * 0.12 * (1 - gait);
      if (bones.jaw) bones.jaw.rotation.x = lunge * 0.55 + low * 0.15 + (graze ? Math.max(0, Math.sin(t * 7)) * 0.1 : 0);
      // A real stride: reach, plant, push, lift with a folding joint.
      for (const l of legs) {
        const p = ph + l.phase + (run && l.front ? 0.5 : 0);
        const reach = (0.3 + run * 0.32) * gait, sw = Math.sin(p) * reach, lift = Math.max(0, Math.cos(p)) * gait;
        if (sprawl) { l.b[0].rotation.y = sw * 0.9; l.b[0].rotation.z = l.s * lift * 0.3; }
        else {
          l.b[0].rotation.x = -sw;
          if (l.b[1]) l.b[1].rotation.x = l.front ? lift * 0.9 : -lift * 0.7;
          if (l.b[2]) l.b[2].rotation.x = l.front ? -lift * 0.5 : lift * 0.5;
        }
      }
      tails.forEach((b, i) => { b.rotation.y = Math.sin(t * 2.1 - i * 0.6 + ph * 0.3) * (sprawl ? 0.22 : 0.12) * (i + 1); b.rotation.x = (sp.tail.bushy ? -low * 0.15 : 0) - run * 0.1; });
    },
  };
  return g;
}

// ══════════════════════════════════════════════════════════
// The same single-skin technique for the MONSTERS. A creature is a
// list of joints (rest pose), parents, and round-cone flesh on bones;
// `paint(part, p, n, c)` colours each vertex. Cached per key.
// ══════════════════════════════════════════════════════════
const _monCache = new Map();
function skinned(key, def, mat) {
  let base = _monCache.get(key);
  if (!base) {
    const prims = def.prims;
    const f = (p) => { let d = 1e9; for (const q of prims) d = d > 1e8 ? roundCone(p, q) : smin(d, roundCone(p, q), q.k); return d; };
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const q of prims) for (const e of [q.a, q.b]) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], e[i] - q.ra - 0.06); max[i] = Math.max(max[i], e[i] + q.ra + 0.06); }
    const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    const geo = surfaceNets(f, min, max, Math.max(0.011, size / (def.res || 100)));
    const names = Object.keys(def.joints), bi = new Map(names.map((n, i) => [n, i]));
    const pos = geo.attributes.position, nrm = geo.attributes.normal, n = pos.count;
    const sIdx = new Uint16Array(n * 4), sW = new Float32Array(n * 4), col = new Float32Array(n * 3);
    const c = new THREE.Color(), pv = [0, 0, 0], nv = V();
    for (let i = 0; i < n; i++) {
      pv[0] = pos.getX(i); pv[1] = pos.getY(i); pv[2] = pos.getZ(i);
      const best = new Map(); let near = null, nd = Infinity;
      for (const q of prims) { const d = roundCone(pv, q); if (d < (best.get(q.bone) ?? Infinity)) best.set(q.bone, d); if (d < nd) { nd = d; near = q; } }
      const o = [...best.entries()].sort((a, b) => a[1] - b[1]).slice(0, 2);
      const w0 = 1 / Math.pow(Math.max(0.004, o[0][1] + 0.02), 3), w1 = o[1] ? 1 / Math.pow(Math.max(0.004, o[1][1] + 0.02), 3) : 0;
      sIdx[i * 4] = bi.get(o[0][0]); sW[i * 4] = w0 / (w0 + w1);
      if (o[1]) { sIdx[i * 4 + 1] = bi.get(o[1][0]); sW[i * 4 + 1] = w1 / (w0 + w1); }
      nv.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      def.paint(near, pv, nv, c);
      c.multiplyScalar(0.92 + hash(Math.floor(pv[0] * 50), Math.floor(pv[1] * 50), Math.floor(pv[2] * 50)) * 0.14);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sIdx, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sW, 4));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    base = { geo, names };
    _monCache.set(key, base);
  }
  const bones = {}, list = [];
  for (const nm of base.names) { const b = new THREE.Bone(); b.name = nm; bones[nm] = b; list.push(b); }
  let root = null;
  for (const nm of base.names) {
    const par = def.parent[nm], b = bones[nm], w = def.joints[nm];
    if (par) { bones[par].add(b); b.position.copy(w).sub(def.joints[par]); } else { b.position.copy(w); root = b; }
  }
  const skin = new THREE.SkinnedMesh(base.geo, mat);
  skin.add(root); skin.bind(new THREE.Skeleton(list));
  skin.castShadow = true; skin.receiveShadow = true; skin.frustumCulled = false;
  const g = new THREE.Group(); g.add(skin);
  return { g, bones, joints: def.joints };
}
let _chitin = null;
const chitinMat = () => _chitin || (_chitin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.35 }));
let _flesh = null;
const fleshMat = () => _flesh || (_flesh = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.0 }));

/** Pale Grub — one soft, ringed body that wriggles. */
export function buildGrub(m) {
  const joints = {}, parent = {}, prims = [];
  const N = 6;
  for (let i = 0; i <= N; i++) {
    const z = 0.36 - i * 0.13, nm = `s${i}`;
    joints[nm] = V(0, 0.18, z); parent[nm] = i ? `s${i - 1}` : null;
  }
  for (let i = 0; i < N; i++) {
    const r0 = 0.15 * Math.sin(Math.PI * (0.25 + i / N * 0.7)) + 0.04, r1 = 0.15 * Math.sin(Math.PI * (0.25 + (i + 1) / N * 0.7)) + 0.04;
    prims.push({ a: A3(joints[`s${i}`]), b: A3(joints[`s${i + 1}`]), ra: r0, rb: r1, bone: `s${i}`, k: 0.035, part: 'body', i });
  }
  const def = { joints, parent, prims, res: 70, paint: (near, p, n, c) => {
    // Ringed: darker creases between segments, a translucent pink underside.
    const ring = Math.abs(Math.sin((p[2] - 0.36) / 0.13 * Math.PI)); 
    c.set(0xe6dccb).lerp(new THREE.Color(0xb89a8a), 1 - ss(0.0, 0.5, ring));
    if (n.y < -0.3) c.lerp(new THREE.Color(0xd8a8a0), 0.5);
    if (p[2] > 0.42) c.set(0x3a2a24);   // the mouth
  } };
  const { g, bones } = skinned('grub', def, fleshMat());
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 1), m.core); core.name = 'core'; core.position.set(0, 0.06, 0.02); bones.s1.add(core);
  g.userData.creature = { animate(dt, t, st) {
    const k = 0.25 + Math.min(1, st.speed) * 0.6;
    for (let i = 1; i <= N; i++) { const b = bones[`s${i}`]; b.rotation.y = Math.sin(t * 5 - i * 0.9) * 0.18 * k; b.rotation.x = Math.sin(t * 6 - i * 0.7) * 0.07 * k + (st.attack === 'windup' && i < 3 ? -0.25 : 0); }
  } };
  return g;
}

/** Bog Horror — a rooted heap of peat and bone with four long, lashing arms. */
export function buildHorror(m) {
  const joints = { root: V(0, 0.3, 0), torso: V(0, 1.0, 0), head: V(0, 1.55, 0.18) }, parent = { root: null, torso: 'root', head: 'torso' }, prims = [];
  // The mound it grows from, the torso, a hunched head.
  prims.push({ a: [0, 0.05, 0], b: [0, 0.35, 0], ra: 1.0, rb: 0.55, bone: 'root', k: 0.2, part: 'mound' });
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; prims.push({ a: [Math.cos(a) * 0.7, 0.05, Math.sin(a) * 0.7], b: [Math.cos(a) * 1.15, 0.0, Math.sin(a) * 1.15], ra: 0.22, rb: 0.08, bone: 'root', k: 0.18, part: 'mound' }); }
  prims.push({ a: [0, 0.35, 0], b: [0, 1.2, 0.05], ra: 0.5, rb: 0.42, bone: 'torso', k: 0.18, part: 'body' });
  prims.push({ a: [0, 1.2, 0.05], b: [0, 1.55, 0.2], ra: 0.4, rb: 0.3, bone: 'head', k: 0.12, part: 'head' });
  // Four tendril arms, five bones each.
  for (let k = 0; k < 4; k++) {
    const ang = (k / 4) * Math.PI * 2 + 0.4, dir = V(Math.cos(ang), 0.25, Math.sin(ang)).normalize();
    let prev = V(Math.cos(ang) * 0.3, 1.05, Math.sin(ang) * 0.25 + 0.05);
    for (let i = 0; i < 5; i++) {
      const nm = `a${k}_${i}`; joints[nm] = prev.clone(); parent[nm] = i ? `a${k}_${i - 1}` : 'torso';
      const nx = prev.clone().addScaledVector(dir, 0.36).add(V(0, -0.09 * i, 0));
      prims.push({ a: A3(prev), b: A3(nx), ra: 0.13 - i * 0.02, rb: 0.11 - i * 0.02, bone: nm, k: i ? 0.03 : 0.1, part: 'arm' });
      prev = nx;
    }
  }
  const def = { joints, parent, prims, res: 95, paint: (near, p, n, c) => {
    c.set(0x2a2016);
    if (n.y > 0.45 && near.part !== 'arm') c.lerp(new THREE.Color(0x3e5226), ss(0.45, 0.9, n.y));   // moss on what faces up
    if (near.part === 'arm') c.set(0x241a12).lerp(new THREE.Color(0x46562a), 0.5 + 0.5 * Math.sin(p[0] * 9 + p[2] * 9));
    if (near.part === 'mound') c.lerp(new THREE.Color(0x1a1410), 0.4);
    // Bone showing through the peat.
    if (near.part === 'body' && hash(Math.floor(p[0] * 7), Math.floor(p[1] * 7), Math.floor(p[2] * 7)) > 0.86) c.set(0xcfc4b0);
  } };
  const { g, bones } = skinned('bog_horror', def, fleshMat());
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), glowMat(0xb8f060)); e.position.set(sx * 0.16, 0.12, 0.3); bones.head.add(e); }
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), m.core); core.name = 'core'; core.position.set(0, 0.1, 0.42); bones.torso.add(core);
  let lash = 0;
  g.userData.creature = { animate(dt, t, st) {
    lash += ((st.attack === 'strike' ? 1 : st.attack === 'windup' ? -0.6 : 0) - lash) * Math.min(1, dt * 8);
    bones.torso.rotation.z = Math.sin(t * 0.7) * 0.05; bones.torso.rotation.x = Math.sin(t * 0.9) * 0.04 - lash * 0.1;
    bones.head.rotation.y = Math.sin(t * 0.5) * 0.25;
    for (let k = 0; k < 4; k++) for (let i = 0; i < 5; i++) {
      const b = bones[`a${k}_${i}`];
      b.rotation.z = Math.sin(t * 1.6 + i * 0.6 + k) * 0.18 - (i ? 0.06 : 0) + lash * (i === 0 ? -0.6 : 0.1);
      b.rotation.y = Math.cos(t * 1.1 + i * 0.5 + k * 2) * 0.14;
    }
  } };
  return g;
}

/** Rust Crawler — a plated, six-legged ore-eater, one body. */
export function buildBeetle(m) {
  const joints = { root: V(0, 0.42, 0), head: V(0, 0.42, 0.55) }, parent = { root: null, head: 'root' }, prims = [];
  prims.push({ a: [0, 0.42, -0.55], b: [0, 0.46, 0.0], ra: 0.42, rb: 0.36, bone: 'root', k: 0.06, part: 'shell' });
  prims.push({ a: [0, 0.46, 0.0], b: [0, 0.44, 0.42], ra: 0.36, rb: 0.3, bone: 'root', k: 0.05, part: 'shell' });
  prims.push({ a: [0, 0.42, 0.55], b: [0, 0.38, 0.75], ra: 0.2, rb: 0.14, bone: 'head', k: 0.03, part: 'head' });
  for (const sx of [-1, 1]) prims.push({ a: [sx * 0.08, 0.34, 0.75], b: [sx * 0.03, 0.3, 0.98], ra: 0.05, rb: 0.012, bone: 'head', k: 0.008, part: 'mandible' });
  for (let i = 0; i < 6; i++) {
    const s = i < 3 ? -1 : 1, kq = i % 3, z = 0.3 - kq * 0.3;
    const base = V(s * 0.3, 0.3, z), knee = V(s * 0.62, 0.5, z + 0.05 - kq * 0.04), foot = V(s * 0.82, 0.0, z + 0.08 - kq * 0.1);
    joints[`l${i}a`] = base; joints[`l${i}b`] = knee; parent[`l${i}a`] = 'root'; parent[`l${i}b`] = `l${i}a`;
    prims.push({ a: A3(base), b: A3(knee), ra: 0.05, rb: 0.035, bone: `l${i}a`, k: 0.02, part: 'leg' });
    prims.push({ a: A3(knee), b: A3(foot), ra: 0.032, rb: 0.012, bone: `l${i}b`, k: 0.01, part: 'leg' });
  }
  const def = { joints, parent, prims, res: 100, paint: (near, p, n, c) => {
    if (near.part === 'shell' && n.y > -0.1) {
      // Rusted plates: bands across the back with dark seams, bright rust edges.
      const band = Math.abs(Math.sin((p[2] + 0.55) / 0.26 * Math.PI));
      c.set(0x6a2e18).lerp(new THREE.Color(0xb05a28), ss(0.3, 0.9, n.y) * 0.6);
      if (band < 0.18) c.set(0x1a100c);
      if (Math.abs(p[0]) < 0.02) c.multiplyScalar(0.6);
    } else if (near.part === 'mandible') c.set(0x120c08);
    else c.set(0x2a1a14).lerp(new THREE.Color(0x4a2e20), ss(-0.5, 0.5, n.y));
  } };
  const { g, bones } = skinned('rust_crawler', def, chitinMat());
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), glowMat(0xffa040)); e.position.set(sx * 0.1, 0.06, 0.14); bones.head.add(e); }
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 1), m.core); core.name = 'core'; core.position.set(0, 0.1, -0.62); bones.root.add(core);
  let ph = 0, lunge = 0;
  g.userData.creature = { animate(dt, t, st) {
    const gait = Math.min(1, st.speed / 2); ph += dt * (3 + st.speed * 3);
    lunge += ((st.attack === 'strike' ? 1 : 0) - lunge) * Math.min(1, dt * 12);
    bones.root.position.y = 0.42 + Math.abs(Math.sin(ph)) * 0.012 * gait;
    bones.root.position.z = lunge * 0.22;
    bones.head.rotation.x = (st.attack === 'windup' ? -0.3 : 0) + lunge * 0.35;
    for (let i = 0; i < 6; i++) {
      const s = i < 3 ? -1 : 1, ph2 = ph + ((i % 2 === 0) === (s > 0) ? 0 : Math.PI);
      bones[`l${i}a`].rotation.y = Math.cos(ph2) * 0.28 * gait * s;
      bones[`l${i}a`].rotation.z = s * Math.max(0, Math.sin(ph2)) * 0.25 * gait;
    }
  } };
  return g;
}

/**
 * Mesh every species ahead of need, one per idle slice, so the first
 * deer you meet does not cost a 0.1–0.4 s stall while its body is meshed.
 */
export function prewarmFauna() {
  const queue = [...FAUNA_IDS];
  const step = (deadline) => {
    while (queue.length && (!deadline || deadline.timeRemaining() > 8 || deadline.didTimeout)) {
      const id = queue.shift();
      try { skinGeometry(id); } catch (e) { console.warn('[Fauna] prewarm failed', id, e); }
      if (deadline) break;   // one species per idle callback
    }
    if (queue.length) (window.requestIdleCallback || ((f) => setTimeout(f, 200)))(step, { timeout: 1500 });
  };
  (window.requestIdleCallback || ((f) => setTimeout(f, 200)))(step, { timeout: 1500 });
}

export { skinned, glowMat, A3, hash as faunaHash, ss as faunaSmooth };
