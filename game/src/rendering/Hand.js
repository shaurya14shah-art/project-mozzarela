// ══════════════════════════════════════════════════════════
// Hand — RŌNIN's sculpted first-person hand, and the arm it hangs from
//
// Ported from RŌNIN (client/src/duel/Hand.ts). The hand is a SIGNED
// DISTANCE FIELD: a tapered "bone" (round cone) for every phalanx,
// metacarpal and thumb segment, blended with smooth unions — wide across
// the back of the hand, where it is one mass of flesh, tight at the
// finger joints, where creases show. The field is meshed with surface
// nets and shaded by its own gradient, so the hand is ONE closed smooth
// surface with no seams or facets.
//
// It replaces Mozzarela's old first-person "hand": a 7-sided cylinder
// sleeve, a squashed sphere palm and three 5-sided finger cylinders. In
// a first-person game the hand is on screen every frame, closer to the
// lens than anything else in the world — the cheapest realism there is
// to buy, and the most expensive to skip.
//
// The forearm is Mozzarela's own, not RŌNIN's: where RŌNIN wraps the arm
// in indigo tekko, a Pioneer of the dead realm wears weathered linen and
// a laced leather bracer.
//
// FRAME (inherited from RŌNIN): the grip runs along +z, the back of the
// hand is +y, and the grip's axis passes through the origin with radius
// GRIP_R. `buildArm()` rotates and scales that frame onto a prop whose
// grip runs along +y (every weapon and the focus in this project).
//
// ⚠️ Built ONCE and cached — the surface-nets mesh is ~20 ms to build.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';

const GRIP_R = 0.0158;
// ⚠️ THE SKELETON BELOW IS AUTHORED AS A LEFT HAND (thumb on +z with the
// back on +y and the wrist on -x) and MIRRORED IN x on the way out of
// skeleton(). No rotation can turn a left hand into a right one — every
// "turn the hand round" fix before this (HAND_TURN, aimForearm, poseArm's
// roll) only moved which wrong side showed: measured in camera space,
// the back of the weapon hand faced INWARD and down, i.e. the player saw
// a palm where a knuckle should be. That was the "inverted" hand.
const WRIST_AUTHORED = [-0.04, 0.064, -0.012];
const WRIST = [0.04, 0.064, -0.012];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Distance to a round cone from a (radius ra) to b (radius rb). (After Inigo Quilez.) */
export function roundCone(p, bone) {
  const ba = sub(bone.b, bone.a), pa = sub(p, bone.a);
  const l2 = dot(ba, ba), rr = bone.ra - bone.rb, a2 = l2 - rr * rr, il2 = 1 / l2;
  const y = dot(pa, ba), z = y - l2;
  const xv = [pa[0] * l2 - ba[0] * y, pa[1] * l2 - ba[1] * y, pa[2] * l2 - ba[2] * y];
  const x2 = dot(xv, xv), y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - bone.rb;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - bone.ra;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - bone.ra;
}

export function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

const BACK = 0, FINGER = 1, THUMB = 2;

function skeleton() {
  const bones = [];
  const fingers = [
    { z: 0.026,   len: [0.044, 0.026, 0.021], r: 0.0089, mcp: 1.02 },
    { z: 0.0085,  len: [0.047, 0.029, 0.022], r: 0.0093, mcp: 1.0 },
    { z: -0.009,  len: [0.044, 0.028, 0.021], r: 0.0088, mcp: 1.02 },
    { z: -0.0255, len: [0.036, 0.021, 0.018], r: 0.0077, mcp: 1.1 },
  ];
  const carpal = [-0.03, 0.058, -0.008];
  for (const f of fingers) {
    // Each phalanx is a chord of a polygon whose sides touch a circle
    // just outside the grip, so the finger hugs the grip without
    // sinking into it. Joints sit at the polygon's corners.
    const inner = GRIP_R + f.r * 0.92;
    let phi = f.mcp;
    const corner = (ph, half) => { const r = inner / Math.cos(half); return [Math.cos(ph) * r, Math.sin(ph) * r, f.z]; };
    const radii = [f.r * 1.05, f.r * 0.95, f.r * 0.86, f.r * 0.78];
    let a = corner(phi, Math.atan(f.len[0] / 2 / inner));
    const mcp = a;
    for (let s = 0; s < 3; s++) {
      const half = Math.atan(f.len[s] / 2 / inner);
      phi -= 2 * half;
      const nextHalf = s < 2 ? Math.atan(f.len[s + 1] / 2 / inner) : half * 0.6;
      const b = corner(phi, Math.max(half, nextHalf));
      if (s === 2) { b[0] *= 0.97; b[1] *= 0.97; }   // the pad presses into the grip
      bones.push({ a, b, ra: radii[s], rb: radii[s + 1], group: FINGER });
      a = b;
    }
    const c = [carpal[0], carpal[1], carpal[2] + f.z * 0.45];
    const knuckle = [mcp[0] * 1.04, mcp[1] * 1.04, mcp[2]];
    bones.push({ a: knuckle, b: c, ra: f.r * 1.2, rb: 0.0105, group: BACK });
  }
  for (const z of [0.016, 0, -0.016]) bones.push({ a: [0.013, 0.03, z * 1.2], b: [-0.028, 0.054, z * 0.6], ra: 0.0135, rb: 0.013, group: BACK });
  bones.push({ a: carpal, b: WRIST_AUTHORED.slice(), ra: 0.0165, rb: 0.0175, group: BACK });
  const t0 = [-0.028, 0.046, 0.016], t1 = [-0.037, 0.026, 0.03], t2 = [-0.032, 0.006, 0.037], t3 = [-0.02, -0.006, 0.039];
  bones.push({ a: t0, b: t1, ra: 0.0135, rb: 0.0108, group: THUMB });
  bones.push({ a: t1, b: t2, ra: 0.0108, rb: 0.0096, group: THUMB });
  bones.push({ a: t2, b: t3, ra: 0.0096, rb: 0.0084, group: THUMB });
  bones.push({ a: [-0.024, 0.044, 0.004], b: t0, ra: 0.016, rb: 0.0135, group: THUMB });
  // Mirror to a RIGHT hand (see WRIST above).
  for (const b of bones) { b.a = [-b.a[0], b.a[1], b.a[2]]; b.b = [-b.b[0], b.b[1], b.b[2]]; }
  return bones;
}

function field(bones) {
  const back = bones.filter(b => b.group === BACK), fingers = bones.filter(b => b.group === FINGER), thumb = bones.filter(b => b.group === THUMB);
  return (p) => {
    let d = 1;
    for (const b of back) d = smin(d, roundCone(p, b), 0.02);
    let f = 1;
    for (let i = 0; i < fingers.length; i += 3) {
      let one = roundCone(p, fingers[i]);
      one = smin(one, roundCone(p, fingers[i + 1]), 0.0025);
      one = smin(one, roundCone(p, fingers[i + 2]), 0.0025);
      f = Math.min(f, one);
    }
    d = smin(d, f, 0.006);
    let t = roundCone(p, thumb[3]);
    for (let i = 0; i < 3; i++) t = smin(t, roundCone(p, thumb[i]), 0.003);
    return smin(d, t, 0.009);
  };
}

/** Surface nets over the field: one vertex per surface cell, quads across sign changes. */
export function surfaceNets(f, min, max, h) {
  const nx = Math.ceil((max[0] - min[0]) / h) + 1, ny = Math.ceil((max[1] - min[1]) / h) + 1, nz = Math.ceil((max[2] - min[2]) / h) + 1;
  const values = new Float32Array(nx * ny * nz);
  const at = (i, j, k) => i + nx * (j + ny * k);
  const C = 4, cx = Math.ceil(nx / C) + 1, cy = Math.ceil(ny / C) + 1, cz = Math.ceil(nz / C) + 1;
  const coarse = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    coarse[i + cx * (j + cy * k)] = f([min[0] + i * C * h, min[1] + j * C * h, min[2] + k * C * h]);
  }
  const far = C * h * 1.8;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = coarse[Math.round(i / C) + cx * (Math.round(j / C) + cy * Math.round(k / C))];
    values[at(i, j, k)] = Math.abs(c) > far ? c : f([min[0] + i * h, min[1] + j * h, min[2] + k * h]);
  }
  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cell = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let inside = 0;
    for (let c = 0; c < 8; c++) { v[c] = values[at(i + corners[c][0], j + corners[c][1], k + corners[c][2])]; if (v[c] < 0) inside++; }
    if (inside === 0 || inside === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [e0, e1] of edges) {
      const a = v[e0], b = v[e1];
      if ((a < 0) === (b < 0)) continue;
      const t = a / (a - b), c0 = corners[e0], c1 = corners[e1];
      sx += c0[0] + (c1[0] - c0[0]) * t; sy += c0[1] + (c1[1] - c0[1]) * t; sz += c0[2] + (c1[2] - c0[2]) * t; n++;
    }
    cellVert[cell(i, j, k)] = pos.length / 3;
    pos.push(min[0] + (i + sx / n) * h, min[1] + (j + sy / n) * h, min[2] + (k + sz / n) * h);
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = values[at(i, j, k)] < 0;
    if (v0 !== (values[at(i + 1, j, k)] < 0)) quad(cellVert[cell(i, j - 1, k - 1)], cellVert[cell(i, j, k - 1)], cellVert[cell(i, j, k)], cellVert[cell(i, j - 1, k)], v0);
    if (v0 !== (values[at(i, j + 1, k)] < 0)) quad(cellVert[cell(i - 1, j, k - 1)], cellVert[cell(i - 1, j, k)], cellVert[cell(i, j, k)], cellVert[cell(i, j, k - 1)], v0);
    if (v0 !== (values[at(i, j, k + 1)] < 0)) quad(cellVert[cell(i - 1, j - 1, k)], cellVert[cell(i, j - 1, k)], cellVert[cell(i, j, k)], cellVert[cell(i - 1, j, k)], v0);
  }
  const nrm = new Float32Array(pos.length);
  const e = h * 0.5;
  for (let q = 0; q < pos.length; q += 3) {
    const p = [pos[q], pos[q + 1], pos[q + 2]];
    const gx = f([p[0] + e, p[1], p[2]]) - f([p[0] - e, p[1], p[2]]);
    const gy = f([p[0], p[1] + e, p[2]]) - f([p[0], p[1] - e, p[2]]);
    const gz = f([p[0], p[1], p[2] + e]) - f([p[0], p[1], p[2] - e]);
    const l = Math.hypot(gx, gy, gz) || 1;
    nrm[q] = gx / l; nrm[q + 1] = gy / l; nrm[q + 2] = gz / l;
  }
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const out = fx * (nrm[a] + nrm[b] + nrm[c]) + fy * (nrm[a + 1] + nrm[b + 1] + nrm[c + 1]) + fz * (nrm[a + 2] + nrm[b + 2] + nrm[c + 2]);
    if (out < 0) { const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

/** Knuckles and fingertips a little redder; a weathered, sun-darkened back. */
function tone(g, bones) {
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  const joints = bones.filter(b => b.group === FINGER).map(b => b.a);
  const tips = bones.filter((b, i) => b.group === FINGER && i % 4 === 2).map(b => b.b);
  for (let i = 0; i < p.count; i++) {
    const v = [p.getX(i), p.getY(i), p.getZ(i)];
    let red = 0;
    for (const j of joints) { const d = Math.hypot(...sub(v, j)); red = Math.max(red, Math.exp(-(d * d) / 0.00012)); }
    for (const t of tips) { const d = Math.hypot(...sub(v, t)); red = Math.max(red, 0.8 * Math.exp(-(d * d) / 0.0001)); }
    // Grime: the creases of a hand that has gripped stone and ash.
    const grime = Math.max(0, 0.05 - Math.abs(Math.sin(v[0] * 310) * Math.sin(v[2] * 270)) * 0.08);
    col.set([1 + red * 0.06 - grime, 0.97 - red * 0.06 - grime, 0.95 - red * 0.07 - grime], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) + p.getZ(i)) * 30; uv[i * 2 + 1] = (p.getY(i) + p.getZ(i) * 0.5) * 30; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

let _handGeo = null;
/** The closed right hand's surface, 1.3 mm resolution, shared. */
export function handGeometry() {
  if (_handGeo) return _handGeo;
  const bones = skeleton();
  const g = surfaceNets(field(bones), [-0.05, -0.04, -0.05], [0.066, 0.09, 0.062], 0.0013);
  tone(g, bones);
  g.computeBoundingSphere();
  _handGeo = g;
  return g;
}

// ── Materials ─────────────────────────────────────────────

function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

let _skinMaps = null;
function skinMaps() {
  if (_skinMaps || typeof document === 'undefined') return _skinMaps;
  const S = 256, heights = new Float32Array(S * S), rnd = rng(11);
  for (let i = 0; i < 2600; i++) heights[Math.floor(rnd() * S) * S + Math.floor(rnd() * S)] -= 0.6 + rnd() * 0.4;   // pores
  for (let l = 0; l < 60; l++) {                                                                                   // fine lines
    let x = rnd() * S, y = rnd() * S; const a = rnd() * Math.PI;
    for (let k = 0; k < 40; k++) { x += Math.cos(a); y += Math.sin(a) * 0.4; heights[((Math.floor(y) % S + S) % S) * S + ((Math.floor(x) % S + S) % S)] -= 0.3; }
  }
  const n = document.createElement('canvas'), r = document.createElement('canvas');
  n.width = n.height = r.width = r.height = S;
  const ng = n.getContext('2d'), rg = r.getContext('2d');
  const ni = ng.createImageData(S, S), ri = rg.createImageData(S, S);
  const at = (x, y) => heights[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * 0.6, dy = (at(x, y + 1) - at(x, y - 1)) * 0.6;
    const l = Math.hypot(dx, dy, 1), i = (y * S + x) * 4;
    ni.data[i] = (-dx / l * 0.5 + 0.5) * 255; ni.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; ni.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; ni.data[i + 3] = 255;
    const rough = 0.5 + Math.max(-0.2, at(x, y)) * -0.3 + rnd() * 0.06;
    ri.data[i] = ri.data[i + 1] = ri.data[i + 2] = rough * 255; ri.data[i + 3] = 255;
  }
  ng.putImageData(ni, 0, 0); rg.putImageData(ri, 0, 0);
  const normalMap = new THREE.CanvasTexture(n), roughnessMap = new THREE.CanvasTexture(r);
  for (const t of [normalMap, roughnessMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); }
  _skinMaps = { normalMap, roughnessMap };
  return _skinMaps;
}

const _matCache = new Map();
const cachedMat = (k, make) => { if (!_matCache.has(k)) _matCache.set(k, make()); return _matCache.get(k); };

/** Physical skin: sheen for the soft scattering at grazing angles, pores, a little oil. */
export function skinMaterial(toneHex = 0x8c654f) {
  return cachedMat(`skin:${toneHex}`, () => {
    const m = skinMaps();
    return new THREE.MeshPhysicalMaterial({
      color: toneHex, vertexColors: true, roughness: 1,
      roughnessMap: m?.roughnessMap ?? null, normalMap: m?.normalMap ?? null,
      normalScale: new THREE.Vector2(0.25, 0.25),
      sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xb05a40),
    });
  });
}

/** A canvas weave: base colour, cross threads, and a matching bump. */
function clothTextures(key, base, threads, seed, repeat) {
  return cachedMat(`clothtex:${key}`, () => {
    if (typeof document === 'undefined') return { map: null, bump: null };
    const S = 256, c = document.createElement('canvas'), b = document.createElement('canvas');
    c.width = c.height = b.width = b.height = S;
    const g = c.getContext('2d'), bg = b.getContext('2d'), rnd = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    bg.fillStyle = '#808080'; bg.fillRect(0, 0, S, S);
    for (let i = 0; i < 5200; i++) {
      const [r, gr, bl] = threads(rnd);
      g.fillStyle = `rgba(${r},${gr},${bl},0.22)`;
      const horiz = rnd() < 0.5, x = rnd() * S, y = rnd() * S, len = 2 + rnd() * 6;
      g.fillRect(x, y, horiz ? len : 1, horiz ? 1 : len);
      bg.fillStyle = rnd() < 0.5 ? 'rgba(40,40,40,0.25)' : 'rgba(200,200,200,0.25)';
      bg.fillRect(x, y, horiz ? len : 1, horiz ? 1 : len);
    }
    // Wear: lighter scuffs and darker grime, the way cloth ages outdoors.
    for (let i = 0; i < 40; i++) {
      const x = rnd() * S, y = rnd() * S, r = 6 + rnd() * 22;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      const dark = rnd() < 0.6;
      grd.addColorStop(0, dark ? 'rgba(20,16,12,0.22)' : 'rgba(200,190,170,0.12)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const map = new THREE.CanvasTexture(c), bump = new THREE.CanvasTexture(b);
    map.colorSpace = THREE.SRGBColorSpace;
    for (const t of [map, bump]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return { map, bump };
  });
}

/** Weathered undyed linen — the sleeve. */
export function linenMaterial() {
  return cachedMat('linen', () => {
    const t = clothTextures('linen', '#5b5246', rnd => [110 + rnd() * 40, 100 + rnd() * 36, 84 + rnd() * 30], 7, [3, 5]);
    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map: t.map, bumpMap: t.bump, bumpScale: 1.2,
      roughness: 0.95, sheen: 0.45, sheenRoughness: 0.85, sheenColor: new THREE.Color(0x6a5e4c),
    });
  });
}

/** Oiled, scuffed leather — bracers and grip wraps. */
export function leatherMaterial() {
  return cachedMat('leather', () => {
    const t = clothTextures('leather', '#3a2a1e', rnd => [60 + rnd() * 30, 42 + rnd() * 20, 28 + rnd() * 14], 19, [2, 2]);
    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map: t.map, bumpMap: t.bump, bumpScale: 0.6,
      roughness: 0.62, clearcoat: 0.25, clearcoatRoughness: 0.6,
    });
  });
}

// ── The arm ───────────────────────────────────────────────

/** A smooth lathe between radii along y (0 at the wrist, `len` toward the elbow). */
function taperedLathe(len, rWrist, rElbow, swell = 0.1, segs = 28) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const r = rWrist + (rElbow - rWrist) * t + Math.sin(t * Math.PI) * swell * rElbow;
    pts.push(new THREE.Vector2(r, t * len));
  }
  return new THREE.LatheGeometry(pts, segs);
}

/** Default turn of the hand about the grip, and the elbow (relative to gripY). */
export const HAND_TURN = Math.PI;
export const ELBOW = [0.32, -0.75, 0.55];

/**
 * A right hand closed around a grip of radius `gripR` whose axis runs
 * along +y through (0, gripY, 0), with the forearm running back toward
 * the camera. Parent it beside the held prop.
 *
 * @param {{gripY?:number, gripR?:number, skin?:number}} opts
 */
export function buildArm({ gripY = -0.36, gripR = 0.034, skin = 0x8c654f, turn: turnAngle = HAND_TURN, elbow = ELBOW } = {}) {
  const arm = new THREE.Group();
  arm.name = 'fp-arm';

  // The hand's own frame → the prop's: grip along +z becomes +y.
  const s = gripR / GRIP_R;
  const hand = new THREE.Mesh(handGeometry(), skinMaterial(skin));
  const handFrame = new THREE.Group();
  handFrame.rotation.x = -Math.PI / 2;      // +z (grip) → +y
  handFrame.add(hand);
  // Turn about the grip so the back of the hand faces out and up-right,
  // the way a right hand holds a rod raised in front of the body.
  const turn = new THREE.Group();
  turn.rotation.y = turnAngle;
  turn.add(handFrame);
  turn.scale.setScalar(s);
  turn.position.y = gripY;
  arm.add(turn);

  // Wrist position in prop space, to hang the forearm from.
  turn.updateMatrixWorld(true);
  const wrist = new THREE.Vector3(...WRIST).applyMatrix4(hand.matrixWorld);

  // ⚠️ A REAL FOREARM, AN ELBOW, AN UPPER ARM. This was one straight
  // 0.95-unit sleeve standing in for forearm AND upper arm together. At
  // the stance it ran off the bottom of the screen and nobody noticed;
  // the moment a swing lifted the hand it became a metre-and-a-half
  // grey pipe across the view. Lengths are human (0.27 / 0.30 m at
  // s = 1, the hand's own scale); poseArm() solves the elbow by IK.
  // Longer than anatomy (0.27/0.30): the viewmodel is drawn ~1.7× life
  // size so it reads at arm's length, and a forearm that short put the
  // ELBOW in the middle of the screen whenever a swing lifted the hand.
  const LF = 0.42 * s, LU = 0.55 * s;
  const fore = new THREE.Group();
  fore.name = 'fp-forearm';
  fore.position.copy(wrist);
  const elbowPt = new THREE.Vector3(elbow[0], gripY + elbow[1], elbow[2]);
  fore.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), elbowPt.clone().sub(wrist).normalize());
  const flesh = new THREE.Mesh(taperedLathe(LF, 0.024 * s, 0.038 * s, 0.1), skinMaterial(skin));
  const sleeve = new THREE.Mesh(taperedLathe(LF * 0.84, 0.03 * s, 0.044 * s, 0.1, 32), linenMaterial());
  sleeve.position.y = LF * 0.18;
  const bracer = new THREE.Mesh(taperedLathe(LF * 0.3, 0.028 * s, 0.034 * s, 0.04, 32), leatherMaterial());
  bracer.position.y = LF * 0.03;
  for (let i = 0; i < 4; i++) {
    const cord = new THREE.Mesh(new THREE.TorusGeometry(0.0295 * s + i * 0.0012 * s, 0.0016 * s, 6, 28), leatherMaterial());
    cord.rotation.x = Math.PI / 2;
    cord.position.y = LF * (0.05 + i * 0.06);
    fore.add(cord);
  }
  fore.add(flesh, bracer, sleeve);
  arm.add(fore);
  // The elbow: a soft cap so forearm and upper arm meet without a seam.
  const elbowCap = new THREE.Mesh(new THREE.SphereGeometry(0.043 * s, 18, 12), linenMaterial());
  arm.add(elbowCap);
  // Upper arm: a unit-length sleeve, stretched to the shoulder each frame.
  const upper = new THREE.Group();
  upper.name = 'fp-upperarm';
  const upperMesh = new THREE.Mesh(taperedLathe(1, 0.043 * s, 0.05 * s, 0.06, 28), linenMaterial());
  upper.add(upperMesh);
  // ⚠️ Not drawn. It is solved (so the elbow sits where an upper arm
  // would put it) but a first-person eye never sees its own upper arm:
  // drawn, it swung across the view as a bent grey sleeve whenever the
  // off hand reached over. Kept in the tree for the IK and for a future
  // third-person use.
  upper.visible = false;
  arm.add(upper);

  arm.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  arm.userData.fore = fore;
  arm.userData.turn = turn;
  arm.userData.hand = hand;
  arm.userData.upper = upper;
  arm.userData.elbowCap = elbowCap;
  arm.userData.LF = LF;
  arm.userData.LU = LU;
  return arm;
}

// ── THE WRIST ─────────────────────────────────────────────
// ⚠️ The forearm CONTINUES the hand. In a real grip on a pole the
// forearm runs on along the line of the metacarpals (knuckles → carpus)
// and the wrist bends only a little. Aiming the forearm straight at the
// shoulder while the hand stayed fixed on the grip forced the wrist into
// whatever angle joined them — the owner's "hypermobile" hand. Now the
// HAND rolls about the grip to face its forearm line toward the shoulder,
// and the forearm leaves the wrist along that line, bending toward the
// shoulder by at most MAX_WRIST_BEND.
const MAX_WRIST_BEND = 0.75;    // ~43°: radial/ulnar deviation plus a little flexion
let _foreDirHand = null;
/** The natural forearm direction in the hand's own frame (metacarpals → carpus, extended). */
function foreDirHand() {
  if (_foreDirHand) return _foreDirHand;
  const bones = skeleton();
  // The metacarpals: BACK bones running from a knuckle to the carpus.
  const meta = bones.filter(b => b.group === BACK && Math.abs(b.rb - 0.0105) < 1e-6);
  const k = meta.reduce((a, b) => a.add(new THREE.Vector3(...b.a)), new THREE.Vector3()).multiplyScalar(1 / meta.length);
  _foreDirHand = new THREE.Vector3(...WRIST).sub(k).normalize();
  return _foreDirHand;
}

const _sh = new THREE.Vector3(), _f0 = new THREE.Vector3(), _nat = new THREE.Vector3(), _toS = new THREE.Vector3(),
      _wr = new THREE.Vector3(), _dir = new THREE.Vector3(), _ax = new THREE.Vector3(), _qq = new THREE.Quaternion();
const _HF = new THREE.Euler(-Math.PI / 2, 0, 0);
const _d0 = new THREE.Vector3(), _o = new THREE.Vector3(), _dw = new THREE.Vector3(), _pl = new THREE.Vector3(), _el = new THREE.Vector3();

/**
 * Pose a held arm toward a shoulder (world space), every frame.
 * Works for a mirrored (left) arm too: everything is solved in the arm's
 * own local space, and worldToLocal carries the mirror.
 */
export function poseArm(arm, shoulderWorld, dorsumWorld = null, poleWorld = null) {
  const ud = arm?.userData;
  if (!ud?.turn || !ud.fore) return;
  const { turn, hand, fore } = ud;
  arm.updateWorldMatrix(true, false);
  _sh.copy(shoulderWorld);
  arm.worldToLocal(_sh);
  // 1. Roll the hand about the grip (y).
  // ⚠️ TWO WISHES, WEIGHED. The forearm should run toward the shoulder,
  // AND the back of the hand should face out and toward the eye — the
  // way every reference POV shot holds a hilt. Solving only the first
  // happily produced poses no wrist can make (a forward-held spear with
  // the knuckles turned INWARD, the palm to the camera), because for a
  // grip pointing along the forearm the shoulder barely constrains the
  // roll at all. Scored over 32 rolls; cheap, and it never flips.
  _f0.copy(foreDirHand()).applyEuler(_HF);                  // turn-local, at roll 0
  _d0.set(0, 1, 0).applyEuler(_HF);                          // back of the hand, at roll 0
  _toS.copy(_sh).sub(turn.position).setY(0).normalize();
  let want = null;
  if (dorsumWorld) {
    _o.setFromMatrixPosition(arm.matrixWorld);
    want = _dw.copy(dorsumWorld).add(_o);
    arm.worldToLocal(want);
    want.setY(0);
    if (want.lengthSq() > 1e-6) want.normalize(); else want = null;
  }
  let best = 0, bestScore = -Infinity;
  for (let i = 0; i < 32; i++) {
    const th = (i / 32) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
    // Rotation about y: (x, z) -> (x c + z s, -x s + z c)
    const nx = _f0.x * c + _f0.z * sn, nz = -_f0.x * sn + _f0.z * c;
    let score = (nx * _toS.x + nz * _toS.z);
    if (want) {
      const dx = _d0.x * c + _d0.z * sn, dz = -_d0.x * sn + _d0.z * c;
      score += 1.2 * (dx * want.x + dz * want.z);
    }
    if (score > bestScore) { bestScore = score; best = th; }
  }
  turn.rotation.y = best;
  turn.updateMatrixWorld(true);
  // 2. The wrist, where the forearm starts.
  _wr.set(...WRIST).applyMatrix4(hand.matrixWorld);
  arm.worldToLocal(_wr);
  fore.position.copy(_wr);
  // 3. The elbow, by two-bone IK: forearm LF from the wrist, upper arm
  //    LU to the shoulder, bending toward `poleWorld` (down and out).
  const LF = ud.LF || 0.27, LU = ud.LU || 0.3;
  _toS.copy(_sh).sub(_wr);
  const D = Math.max(1e-4, _toS.length());
  _toS.multiplyScalar(1 / D);
  const Dc = Math.min(D, (LF + LU) * 0.999);
  const cosA = Math.max(-1, Math.min(1, (LF * LF + Dc * Dc - LU * LU) / (2 * LF * Dc)));
  const sinA = Math.sqrt(1 - cosA * cosA);
  if (poleWorld) {
    _o.setFromMatrixPosition(arm.matrixWorld);
    _pl.copy(poleWorld).add(_o);
    arm.worldToLocal(_pl);
  } else _pl.set(0, -1, 0);
  _pl.addScaledVector(_toS, -_pl.dot(_toS));
  if (_pl.lengthSq() < 1e-8) _pl.set(0, -1, 0).addScaledVector(_toS, -_toS.y);
  _pl.normalize();
  _dir.copy(_toS).multiplyScalar(cosA).addScaledVector(_pl, sinA).normalize();
  // 4. The wrist bends only so far off the line of the hand.
  _nat.copy(_f0).applyAxisAngle(_Y, turn.rotation.y).normalize();
  const ang = _nat.angleTo(_dir);
  if (ang > MAX_WRIST_BEND) {
    _ax.crossVectors(_nat, _dir);
    if (_ax.lengthSq() < 1e-10) _ax.set(1, 0, 0);
    _dir.copy(_nat).applyQuaternion(_qq.setFromAxisAngle(_ax.normalize(), MAX_WRIST_BEND));
  }
  fore.quaternion.setFromUnitVectors(_Y, _dir);
  _el.copy(_wr).addScaledVector(_dir, LF);
  if (ud.elbowCap) ud.elbowCap.position.copy(_el);
  // 5. The upper arm, elbow to shoulder.
  if (ud.upper) {
    _toS.copy(_sh).sub(_el);
    const L = Math.max(1e-4, _toS.length());
    ud.upper.position.copy(_el);
    ud.upper.quaternion.setFromUnitVectors(_Y, _toS.multiplyScalar(1 / L));
    ud.upper.scale.set(1, L, 1);
  }
}

const _t = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _Y = new THREE.Vector3(0, 1, 0);
/**
 * Point the forearm from the wrist at a shoulder (world space), every
 * frame. ⚠️ A forearm fixed to the held prop swings WITH it, and in a
 * cut it ended up lying across the whole screen; a real forearm always
 * runs back to the shoulder, whatever the hand is doing.
 */
export function aimForearm(arm, shoulderWorld) {
  const fore = arm?.userData?.fore;
  if (!fore?.parent) return;
  _t.copy(shoulderWorld);
  fore.parent.worldToLocal(_t);
  _w.copy(_t).sub(fore.position);
  if (_w.lengthSq() < 1e-8) return;
  _w.normalize();
  // In a mirrored (left) arm the local x is flipped — handled by worldToLocal.
  fore.quaternion.setFromUnitVectors(_Y, _w);
}
