// ══════════════════════════════════════════════════════════
// DungeonKit — builds a Descent's floor plan (world/DungeonLayout.js)
//
// Everything is geometry, never texture (§3): ashlar walls laid course
// by course in running bond, flagstone floors, pillars with bases and
// capitals (some fallen), lintel beams across the corridors, rubble at
// the wall feet, an element-coloured inlay line along the walls to
// navigate by, a sigil in the Warden's hall that wakes when the Warden
// does, and per-element dressing (veins, pools, crystals, roots,
// chains, banners).
//
// Draw cost is a handful of InstancedMeshes, whatever the size: the
// biggest Descent (radius 88) is ~10k wall blocks in ONE draw call.
// Plain boxes for blocks and slabs — a bevelled box is 9x the
// triangles and at this count that is not free.
//
// Roofless on purpose. A ceiling would need its own lighting answer
// (the key light, the sky and the fog all come from above) and the
// Descent fog already closes the sky in; tall broken walls plus beams
// overhead read as "inside" without fighting the renderer.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { roundedBox } from './GeoForge.js';

const STONE = {
  fire: 0x4a3b33, water: 0x3a4446, earth: 0x4f4a3c, wind: 0x5a5a55, ice: 0x66717c,
  lightning: 0x45454e, shadow: 0x2f2c35, light: 0x777064, void: 0x28252e,
  arcane: 0x443d53, poison: 0x3b4434,
};
const DRESSING = {
  fire: ['veins'], water: ['pools', 'chains'], earth: ['roots'], wind: ['banners'],
  ice: ['crystals'], lightning: ['crystals', 'veins'], shadow: ['chains'],
  light: ['banners', 'crystals'], void: ['crystals', 'chains'], arcane: ['crystals', 'banners'],
  poison: ['pools', 'roots'],
};

const CORE_H = 6.2;      // the solid wall mass; faces build up past it to a broken crown

function rng32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A growable instance list, flushed into one InstancedMesh. */
class Batch {
  constructor() { this.m = []; this.c = []; }
  push(pos, scale, rotY = 0, color = null, rotX = 0, rotZ = 0) {
    const o = Batch._o;
    o.position.copy(pos); o.scale.copy(scale); o.rotation.set(rotX, rotY, rotZ);
    o.updateMatrix();
    this.m.push(o.matrix.clone());
    this.c.push(color);
  }
  build(geo, mat, { cast = true, receive = true } = {}) {
    if (!this.m.length) { geo.dispose(); return null; }
    const im = new THREE.InstancedMesh(geo, mat, this.m.length);
    for (let i = 0; i < this.m.length; i++) {
      im.setMatrixAt(i, this.m[i]);
      if (this.c[i]) im.setColorAt(i, this.c[i]);
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = cast; im.receiveShadow = receive;
    im.computeBoundingSphere();
    return im;
  }
}
Batch._o = new THREE.Object3D();

/**
 * @param {object} D       generateDungeon() result
 * @param {object} opts    { origin: Vector3, floorY, element, color }
 * @returns {{group, colliders: THREE.Box3[], pyreSpots: {x,z}[], setAwake(v), update(dt), dispose()}}
 */
export function buildDungeon(D, { origin, floorY, element, color }) {
  const rng = rng32(D.seed ^ 0x9e3779b9);
  const accent = new THREE.Color(color);
  const stoneBase = new THREE.Color(STONE[element] ?? 0x4a4640).lerp(accent, 0.06);
  const group = new THREE.Group();
  group.name = 'descent-dungeon';
  group.position.set(origin.x, floorY, origin.z);
  const owned = { geos: [], mats: [] };
  const add = (obj) => { if (obj) group.add(obj); return obj; };
  const geo = g => (owned.geos.push(g), g);
  const mat = m => (owned.mats.push(m), m);
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const stoneTint = (k = 1) => {
    const c = stoneBase.clone().multiplyScalar(k * (0.78 + rng() * 0.36));
    c.offsetHSL((rng() - 0.5) * 0.02, (rng() - 0.5) * 0.05, 0);
    return c;
  };
  const C = D.cell;
  const cellX = i => (i - D.half) * C;          // a cell's min corner, local metres
  const crownH = (i, j) =>
    6.6 + 2.2 * (0.5 + 0.5 * Math.sin(i * 0.37 + D.seed % 13) * Math.cos(j * 0.29 + (D.seed % 7) * 1.3));

  const stoneMat = mat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0.0 }));
  const coreMat = mat(new THREE.MeshStandardMaterial({ color: stoneBase.clone().multiplyScalar(0.42), roughness: 1 }));
  const glowMat = (k = 1.4) => mat(new THREE.MeshStandardMaterial({
    color: accent, emissive: accent, emissiveIntensity: k, roughness: 0.5, toneMapped: false,
  }));

  // ── Wall mass: greedy rectangles, one merged geometry ──
  const coreGeos = [];
  for (const r of D.wallRects) {
    const g = new THREE.BoxGeometry(r.x1 - r.x0 - 0.2, CORE_H, r.z1 - r.z0 - 0.2);
    g.translate((r.x0 + r.x1) / 2, CORE_H / 2 - 0.3, (r.z0 + r.z1) / 2);
    coreGeos.push(g);
  }
  if (coreGeos.length) {
    const merged = geo(mergeGeometries(coreGeos));
    coreGeos.forEach(g => g.dispose());
    const core = add(new THREE.Mesh(merged, coreMat));
    core.castShadow = true; core.receiveShadow = true;
  }

  // ── Ashlar faces, course by course, running bond ──
  const blocks = new Batch(), rubble = new Batch(), inlay = new Batch();
  const dressFaces = [];
  for (const f of D.faces) {
    const x0 = cellX(f.i), z0 = cellX(f.j);
    // Plane position and along-axis for this face.
    const alongX = f.dir >= 2;
    const plane = f.dir === 0 ? x0 + C : f.dir === 1 ? x0 : f.dir === 2 ? z0 + C : z0;
    const nrm = (f.dir === 0 || f.dir === 2) ? 1 : -1;
    const a0 = alongX ? x0 : z0;
    const top = crownH(f.i, f.j);
    let y = -0.06, course = 0;
    while (y < top) {
      const ch = 0.55 + rng() * 0.3;
      let a = a0 - (course % 2 ? 0.45 : 0) - rng() * 0.2;
      while (a < a0 + C) {
        const len = 0.75 + rng() * 0.6;
        const s = Math.max(a, a0), e = Math.min(a + len, a0 + C);
        // ⚠️ The broken crown is a smooth PROFILE along the wall, not a
        // per-block coin toss — tossing per block left blocks hanging in
        // the air over the ones that were skipped beneath them.
        const m0 = (s + e) / 2;
        const crown = top - 2.2 * (0.5 + 0.5 * Math.sin(m0 * 1.9 + f.i * 0.7 + f.j * 1.1))
          * (0.5 + 0.5 * Math.sin(m0 * 0.83 + f.i * 0.3 + 3.1));
        if (e - s > 0.12 && (y + ch <= CORE_H + 0.2 || y + ch <= crown)) {
          const depth = 0.5;
          const out = 0.02 + rng() * 0.04;
          const d = plane + nrm * (out - depth / 2);
          const mid = (s + e) / 2;
          const k = 0.85 + rng() * 0.3 - (y < 1 ? 0.12 : 0);   // damp darker at the foot
          blocks.push(
            alongX ? v3(mid, y + ch / 2, d) : v3(d, y + ch / 2, mid),
            alongX ? v3(e - s - 0.04, ch - 0.035, depth) : v3(depth, ch - 0.035, e - s - 0.04),
            (rng() - 0.5) * 0.03, stoneTint(k), (rng() - 0.5) * 0.015, (rng() - 0.5) * 0.015);
        }
        a += len;
      }
      y += ch; course++;
    }
    // Element inlay — one line along every few faces, at hand height.
    if (((f.i * 7 + f.j * 13) % 4) === 0) {
      const mid = a0 + C / 2, d = plane + nrm * 0.07;
      inlay.push(alongX ? v3(mid, 1.15, d) : v3(d, 1.15, mid),
        alongX ? v3(C - 0.1, 0.07, 0.05) : v3(0.05, 0.07, C - 0.1));
    }
    // Rubble at the foot.
    if (rng() < 0.3) {
      const n = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) {
        const sc = 0.18 + rng() * 0.42;
        const along = a0 + rng() * C, off = plane + nrm * (0.25 + rng() * 0.8);
        rubble.push(alongX ? v3(along, sc * 0.35, off) : v3(off, sc * 0.35, along),
          v3(sc, sc * (0.6 + rng() * 0.4), sc * (0.8 + rng() * 0.4)), rng() * 6, stoneTint(0.9), rng(), rng());
      }
    }
    dressFaces.push({ f, alongX, plane, nrm, a0, top });
  }
  add(blocks.build(geo(new THREE.BoxGeometry(1, 1, 1)), stoneMat));
  add(inlay.build(geo(new THREE.BoxGeometry(1, 1, 1)), glowMat(1.3), { cast: false }));

  // ── Floor: four flagstones per cell over a dark mortar bed ──
  const slabs = new Batch();
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let j = 0; j < D.N; j++) for (let i = 0; i < D.N; i++) {
    if (!D.grid[D.idx(i, j)]) continue;
    const x0 = cellX(i), z0 = cellX(j);
    minX = Math.min(minX, x0); maxX = Math.max(maxX, x0 + C);
    minZ = Math.min(minZ, z0); maxZ = Math.max(maxZ, z0 + C);
    for (let q = 0; q < 4; q++) {
      if (rng() < 0.025) continue;      // a missing stone
      const sx = x0 + (q % 2) + 0.5, sz = z0 + (q >> 1) + 0.5;
      slabs.push(v3(sx, 0.0 + rng() * 0.025, sz), v3(0.95 - rng() * 0.05, 0.14, 0.95 - rng() * 0.05),
        (rng() - 0.5) * 0.06, stoneTint(0.82), (rng() - 0.5) * 0.02, (rng() - 0.5) * 0.02);
    }
  }
  add(slabs.build(geo(new THREE.BoxGeometry(1, 1, 1)), stoneMat, { cast: false }));
  const bed = add(new THREE.Mesh(
    geo(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ).rotateX(-Math.PI / 2)),
    mat(new THREE.MeshStandardMaterial({ color: stoneBase.clone().multiplyScalar(0.25), roughness: 1 }))));
  bed.position.set((minX + maxX) / 2, 0.02, (minZ + maxZ) / 2);
  bed.receiveShadow = true;

  // ── Pillars ──
  const colliders = [];
  const toWorldBox = (x0, z0, x1, z1, y0 = -1, y1 = 9) => new THREE.Box3(
    v3(origin.x + x0, floorY + y0, origin.z + z0), v3(origin.x + x1, floorY + y1, origin.z + z1));
  for (const r of D.wallRects) colliders.push(toWorldBox(r.x0, r.z0, r.x1, r.z1));

  const pBase = new Batch(), pShaft = new Batch(), pCap = new Batch();
  const pillar = (x, z, h = 6.2) => {
    const fallen = rng() < 0.22;
    const sh = fallen ? 1.2 + rng() * 2.6 : h;
    pBase.push(v3(x, 0.25, z), v3(1.35, 0.5, 1.35), 0, stoneTint(0.9));
    pShaft.push(v3(x, 0.5 + sh / 2, z), v3(1, sh, 1), rng() * 0.8, stoneTint(1));
    if (!fallen) pCap.push(v3(x, 0.5 + sh + 0.2, z), v3(1.3, 0.4, 1.3), 0, stoneTint(0.95));
    else {
      // The rest of it, lying where it fell.
      const a = rng() * Math.PI * 2, L = 1.5 + rng() * 2.5;
      // Lying down: roll the cylinder onto its side (Z), then yaw it.
      pShaft.push(v3(x + Math.cos(a) * (L / 2 + 0.9), 0.45, z + Math.sin(a) * (L / 2 + 0.9)),
        v3(1, L, 1), -a, stoneTint(0.9), 0, Math.PI / 2);
      rubble.push(v3(x, 0.2, z), v3(0.5, 0.4, 0.5), rng() * 6, stoneTint(0.9));
    }
    colliders.push(toWorldBox(x - 0.55, z - 0.55, x + 0.55, z + 0.55, -1, 0.5 + sh + 0.4));
  };
  const W = D.warden.hw;
  for (const r of D.rooms) {
    if (r.kind === 'warden') {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
        pillar(r.x + Math.cos(a) * W * 0.66, r.z + Math.sin(a) * W * 0.66, 7);
      }
    } else if (r.kind === 'entry') {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) pillar(r.x + sx * (r.hw - 2.2), r.z + sz * (r.hd - 2.2));
    } else if (r.hw >= 6 && r.hd >= 6) {
      const along = r.hw >= r.hd;
      const span = along ? r.hw : r.hd, off = (along ? r.hd : r.hw) - 2.6;
      for (let t = -span + 3; t <= span - 3 + 0.01; t += 5) for (const s of [-1, 1]) {
        pillar(along ? r.x + t : r.x + s * off, along ? r.z + s * off : r.z + t);
      }
    }
  }
  add(pBase.build(geo(roundedBox(1, 1, 1, 0.08, 1)), stoneMat));
  add(pShaft.build(geo(new THREE.CylinderGeometry(0.42, 0.48, 1, 10)), stoneMat));
  add(pCap.build(geo(roundedBox(1, 1, 1, 0.08, 1)), stoneMat));
  add(rubble.build(geo(new THREE.DodecahedronGeometry(0.5, 0)), stoneMat));

  // ── Lintels: beams across the corridors, every few metres ──
  const beams = new Batch(), beamSpots = [];
  for (const c of D.corridors) {
    const L = Math.hypot(c.x1 - c.x0, c.z1 - c.z0);
    if (L < 6) continue;
    const ux = (c.x1 - c.x0) / L, uz = (c.z1 - c.z0) / L;
    for (let t = 4; t < L - 3; t += 6) {
      const x = c.x0 + ux * t, z = c.z0 + uz * t;
      const k = D.idx(D.ci(x), D.ci(z));
      if (D.roomOf[k] >= 0 || c.exit && Math.hypot(x, z) > D.R + 2) continue;
      // Measure the actual open width across the corridor here.
      const px = -uz, pz = ux;
      let lo = 0, hi = 0;
      while (lo < 8 && D.isFloor(D.ci(x - px * (lo + 1)), D.ci(z - pz * (lo + 1)))) lo++;
      while (hi < 8 && D.isFloor(D.ci(x + px * (hi + 1)), D.ci(z + pz * (hi + 1)))) hi++;
      if (lo + hi > 7) continue;      // opens into something wide: no beam
      const len = lo + hi + 2.4, mx = x + px * (hi - lo) / 2, mz = z + pz * (hi - lo) / 2;
      const yaw = Math.atan2(px, pz);
      beams.push(v3(mx, 5.3 + rng() * 0.4, mz), v3(0.7, 0.8, len), yaw, stoneTint(0.8), 0, (rng() - 0.5) * 0.06);
      beamSpots.push({ x: mx, z: mz, y: 5.3 });
    }
  }
  add(beams.build(geo(new THREE.BoxGeometry(1, 1, 1)), stoneMat));

  // ── The way out: a gate frame and a veil you walk through ──
  const gz = D.R + 3;
  const gateParts = new Batch();
  for (const s of [-1, 1]) gateParts.push(v3(s * 2.6, 3, gz), v3(1.2, 6, 1.2), 0, stoneTint(0.9));
  gateParts.push(v3(0, 6.4, gz), v3(6.6, 1, 1.4), 0, stoneTint(0.85));
  add(gateParts.build(geo(roundedBox(1, 1, 1, 0.1, 1)), stoneMat));
  const veilMat = mat(new THREE.MeshBasicMaterial({
    color: accent, transparent: true, opacity: 0.22, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  const veil = add(new THREE.Mesh(geo(new THREE.PlaneGeometry(4, 5.8)), veilMat));
  veil.position.set(0, 2.9, gz + 0.2);

  // ── The Warden's sigil — dormant until the Warden comes ──
  const sigilMat = mat(new THREE.MeshStandardMaterial({
    color: accent, emissive: accent, emissiveIntensity: 0.25, roughness: 0.6,
    toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2,
  }));
  const sigilGeos = [
    new THREE.RingGeometry(W * 0.40, W * 0.43, 72),
    new THREE.RingGeometry(W * 0.20, W * 0.215, 48),
  ];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const g = new THREE.PlaneGeometry(0.12, W * 0.2);
    g.translate(0, W * 0.31, 0); g.rotateZ(a);
    sigilGeos.push(g);
    const t = new THREE.CircleGeometry(0.35, 3);
    t.translate(Math.cos(a + 0.45) * W * 0.47, Math.sin(a + 0.45) * W * 0.47, 0);
    sigilGeos.push(t);
  }
  const sigilGeo = geo(mergeGeometries(sigilGeos.map(g => (g.deleteAttribute('uv'), g.deleteAttribute('normal'), g))));
  sigilGeos.forEach(g => g.dispose());
  sigilGeo.computeVertexNormals();
  sigilGeo.rotateX(-Math.PI / 2);
  const sigil = add(new THREE.Mesh(sigilGeo, sigilMat));
  sigil.position.set(D.warden.x, 0.1, D.warden.z);

  // ── Element dressing ──
  const kinds = DRESSING[element] || ['chains'];
  const sideRooms = D.rooms.filter(r => r.kind !== 'entry');
  if (kinds.includes('veins')) {
    const v = new Batch();
    for (const r of sideRooms) for (let n = 0; n < 3 + Math.floor(rng() * 4); n++) {
      let x = r.x + (rng() - 0.5) * r.hw * 1.6, z = r.z + (rng() - 0.5) * r.hd * 1.6, a = rng() * 6.28;
      for (let s = 0; s < 4 + Math.floor(rng() * 6); s++) {
        const L = 0.5 + rng() * 1.1;
        v.push(v3(x + Math.cos(a) * L / 2, 0.085, z + Math.sin(a) * L / 2), v3(L, 0.03, 0.07 + rng() * 0.05), -a);
        x += Math.cos(a) * L; z += Math.sin(a) * L; a += (rng() - 0.5) * 1.3;
      }
    }
    add(v.build(geo(new THREE.BoxGeometry(1, 1, 1)), glowMat(2.2), { cast: false }));
  }
  if (kinds.includes('pools')) {
    const p = new Batch();
    for (const r of sideRooms) for (let n = 0; n < 1 + Math.floor(rng() * 2); n++) {
      const s = 1.4 + rng() * 2;
      p.push(v3(r.x + (rng() - 0.5) * r.hw, 0.09, r.z + (rng() - 0.5) * r.hd), v3(s, 1, s * (0.6 + rng() * 0.4)), rng() * 6);
    }
    const pg = geo(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2));
    add(p.build(pg, mat(new THREE.MeshStandardMaterial({
      color: stoneBase.clone().lerp(accent, 0.25).multiplyScalar(0.3), roughness: 0.04, metalness: 0.6,
      polygonOffset: true, polygonOffsetFactor: -1,
    })), { cast: false }));
  }
  if (kinds.includes('crystals')) {
    const cr = new Batch();
    for (const df of dressFaces) {
      if (rng() > 0.12) continue;
      const along = df.a0 + 0.3 + rng() * 1.4;
      for (let n = 0; n < 3 + Math.floor(rng() * 4); n++) {
        const h = 0.5 + rng() * 1.6, off = df.plane + df.nrm * (0.15 + rng() * 0.4);
        const at = along + (rng() - 0.5) * 0.8;
        cr.push(df.alongX ? v3(at, h / 2, off) : v3(off, h / 2, at), v3(0.18 + rng() * 0.16, h, 0.18 + rng() * 0.16),
          rng() * 6, null, (rng() - 0.5) * 0.7, (rng() - 0.5) * 0.7);
      }
    }
    add(cr.build(geo(new THREE.ConeGeometry(1, 1, 5)), mat(new THREE.MeshStandardMaterial({
      color: accent.clone().lerp(new THREE.Color(0xffffff), 0.3), emissive: accent, emissiveIntensity: 0.6,
      roughness: 0.15, metalness: 0.1, flatShading: true,
    }))));
  }
  if (kinds.includes('roots')) {
    const rg = [];
    for (const df of dressFaces) {
      if (rng() > 0.08) continue;
      const along = df.a0 + 0.2 + rng() * 1.6, pts = [];
      const top = df.top + 0.4, drop = 2 + rng() * (top - 1.5);
      for (let s = 0; s <= 6; s++) {
        const t = s / 6, y = top - drop * t;
        const off = df.plane + df.nrm * (0.08 + Math.sin(t * 9 + along) * 0.08 + t * 0.12);
        const a = along + Math.sin(t * 5 + along * 3) * 0.25;
        pts.push(df.alongX ? v3(a, y, off) : v3(off, y, a));
      }
      rg.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.05 + rng() * 0.09, 5));
    }
    if (rg.length) {
      const m = add(new THREE.Mesh(geo(mergeGeometries(rg)), mat(new THREE.MeshStandardMaterial({ color: 0x2b2219, roughness: 0.95 }))));
      rg.forEach(g => g.dispose());
      m.castShadow = true;
    }
  }
  if (kinds.includes('chains')) {
    const links = new Batch();
    const hang = (x, z, y, n) => {
      for (let k = 0; k < n; k++) links.push(v3(x, y - k * 0.2, z), v3(1, 1, 1), k % 2 ? Math.PI / 2 : 0);
    };
    for (const b of beamSpots) if (rng() < 0.5) {
      for (const s of [-0.9, 0.9]) if (rng() < 0.7) hang(b.x + s * 0.3, b.z + s * 0.3, b.y - 0.4, 6 + Math.floor(rng() * 12));
    }
    for (const df of dressFaces) if (rng() < 0.04) {
      const along = df.a0 + 1, off = df.plane + df.nrm * 0.2;
      hang(df.alongX ? along : off, df.alongX ? off : along, df.top - 0.3, 8 + Math.floor(rng() * 14));
    }
    add(links.build(geo(new THREE.TorusGeometry(0.1, 0.028, 4, 8)), mat(new THREE.MeshStandardMaterial({
      color: 0x2a2724, roughness: 0.55, metalness: 0.75,
    }))));
  }
  if (kinds.includes('banners')) {
    const bg = new THREE.PlaneGeometry(1.2, 3.4, 2, 8);
    const pos = bg.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const y = pos.getY(k);
      if (y < -1.5) pos.setY(k, y + Math.random() * 0.7);                  // torn hem
      pos.setZ(k, Math.sin(y * 1.7 + pos.getX(k)) * 0.06);                  // hangs, not flat
    }
    bg.computeVertexNormals();
    const bn = new Batch();
    for (const df of dressFaces) if (rng() < 0.05) {
      const along = df.a0 + 1, off = df.plane + df.nrm * 0.08;
      const yaw = df.alongX ? (df.nrm > 0 ? 0 : Math.PI) : (df.nrm > 0 ? Math.PI / 2 : -Math.PI / 2);
      bn.push(df.alongX ? v3(along, CORE_H - 2.2, off) : v3(off, CORE_H - 2.2, along), v3(1, 1, 1), yaw);
    }
    add(bn.build(geo(bg), mat(new THREE.MeshStandardMaterial({
      color: accent.clone().multiplyScalar(0.35), roughness: 0.9, side: THREE.DoubleSide,
    }))));
  }

  // ── Where the light comes from: pyre spots (world coords) ──
  const pyreSpots = [];
  const room = D.warden;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pyreSpots.push({ x: room.x + sx * (W - 2.2), z: room.z + sz * (W - 2.2) });
  pyreSpots.push({ x: D.entry.x + D.entry.hw - 1.6, z: D.entry.z - D.entry.hd + 1.6 });
  const big = D.rooms.filter(r => r.kind === 'side').sort((a, b) => b.hw * b.hd - a.hw * a.hd).slice(0, 3);
  for (const r of big) pyreSpots.push({ x: r.x - r.hw + 1.6, z: r.z - r.hd + 1.6 });
  for (const p of pyreSpots) { p.x += origin.x; p.z += origin.z; }

  let awake = 0, awakeTarget = 0, t = 0;
  return {
    group, colliders, pyreSpots,
    setAwake(v) { awakeTarget = v ? 1 : 0; },
    update(dt) {
      t += dt;
      awake += (awakeTarget - awake) * Math.min(1, dt * 1.5);
      sigilMat.emissiveIntensity = 0.25 + awake * (2.4 + Math.sin(t * 3.1) * 0.5);
      veilMat.opacity = 0.18 + Math.sin(t * 1.7) * 0.05;
    },
    dispose() {
      for (const g of owned.geos) g.dispose();
      for (const m of owned.mats) m.dispose();
      group.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
    },
  };
}
