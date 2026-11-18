// ══════════════════════════════════════════════════════════
// Sculpt — world props carved as single signed-distance surfaces
//
// Owner: "take a complete run through and model revision of everything".
// The giant's bones, the spires and the drowned/broken stonework were
// assemblies of boxes, cylinders and spheres — a skull was a ball with
// a plank for a brow. They are sculpted here the way the beasts are
// (rendering/Hand.js surfaceNets): one surface, smooth-blended, then
// weathered with noise so the texture has pits and cracks to sit in.
//
// ⚠️ Every sculpt is meshed ONCE at unit size and cached; props scale
// the mesh. Meshing costs ~0.1–0.4 s, so prewarmSculpts() runs them at
// boot (after prewarmFauna) rather than on the frame a chunk loads.
// The materials stay PropForge's (triplanar, so no UVs are needed).
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { roundCone, smin, surfaceNets } from './Hand.js';

const cache = new Map();
const smax = (a, b, k) => -smin(-a, -b, k);
const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
function h3(i, j, k) { let h = (i * 374761393 + j * 668265263 + k * 1274126177) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, y, z) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), fx = x - i, fy = y - j, fz = z - k;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(h3(i, j, k), h3(i + 1, j, k), u), L(h3(i, j + 1, k), h3(i + 1, j + 1, k), u), v),
           L(L(h3(i, j, k + 1), h3(i + 1, j, k + 1), u), L(h3(i, j + 1, k + 1), h3(i + 1, j + 1, k + 1), u), v), w) * 2 - 1;
}
const fbm = (x, y, z, o = 3) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += vnoise(x * f, y * f, z * f) * a; f *= 2.03; a *= 0.5; } return s; };
const cone = (p, a, b, ra, rb) => roundCone(p, { a, b, ra, rb });
/** A capsule squashed along one local axis — bone cross-sections are oval. */
const ell = (p, c, r) => { const x = (p[0] - c[0]) / r[0], y = (p[1] - c[1]) / r[1], z = (p[2] - c[2]) / r[2]; const k0 = len3(x, y, z); return (k0 - 1) * Math.min(r[0], r[1], r[2]); };

// ⚠️ LEVEL OF DETAIL. The first cut drew every sculpt at full
// resolution at any range: measured 137 ruin columns × 10k triangles in
// one frame (1.4M of 2.3M) — the owner's "very laggy". Every sculpt now
// meshes at three qualities (cells × q) and props use sculptLOD().
let _q = 1;
function mesh(key, f, min, max, cells = 96) {
  key = `${key}@${_q}`;
  cells = Math.max(8, Math.round(cells * _q));
  if (cache.has(key)) return cache.get(key);
  const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const g = surfaceNets(f, min, max, size / cells);
  g.computeBoundingSphere(); g.computeBoundingBox();
  cache.set(key, g);
  return g;
}

// ── A RIB: one bow of bone, oval in section, swelling at the head ─────
// Unit: rises to y≈1, reaches x≈0.78 (same arc PropForge used).
export function ribGeometry() {
  const arc = (t) => [Math.sin(t * Math.PI * 0.62) * 0.78, Math.sin(t * Math.PI * 0.46), 0];
  const N = 10, pts = []; for (let i = 0; i <= N; i++) pts.push(arc(i / N));
  const r = (t) => 0.075 - t * 0.05;
  return mesh('rib', (p) => {
    // Flatten across the bow (z) — ribs are blades, not pipes.
    const q = [p[0], p[1], p[2] * 1.55];
    let d = 1e9;
    for (let i = 0; i < N; i++) d = smin(d, cone(q, pts[i], pts[i + 1], r(i / N), r((i + 1) / N)), 0.02);
    d = smin(d, ell(p, [0.02, 0.02, 0], [0.11, 0.09, 0.09]), 0.05);       // the head, where it met the spine
    // Weathering: shallow pitting and a long split along the shaft.
    d += fbm(p[0] * 11, p[1] * 11, p[2] * 11) * 0.0035;
    d = smax(d, -(Math.abs(p[2] * 1.55 + fbm(p[0] * 3, p[1] * 3, 0) * 0.01) - 0.004), 0.004) ;
    return d;
  }, [-0.15, -0.12, -0.12], [0.9, 1.1, 0.12], 120);
}

// ── A VERTEBRA: centrum, neural arch and spine, transverse wings ──────
// Unit: ~1 tall (the old prop's S).
export function vertebraGeometry() {
  return mesh('vertebra', (p) => {
    const [x, y, z] = p;
    // Centrum: a fat drum, waisted, with concave end faces.
    let d = cone(p, [0, 0.35, -0.3], [0, 0.35, 0.3], 0.36, 0.36);
    d = smax(d, -ell(p, [0, 0.35, 0.52], [0.3, 0.3, 0.26]), 0.05);
    d = smax(d, -ell(p, [0, 0.35, -0.52], [0.3, 0.3, 0.26]), 0.05);
    d -= 0.03 * Math.cos(z * 6);   // the waist
    // Neural arch: a ring over the spinal canal.
    const ring = Math.abs(len3(x, y - 0.82, 0) - 0.2) - 0.07;
    const arch = smax(ring, Math.abs(z) - 0.18, 0.03);
    d = smin(d, smax(arch, 0.62 - y, 0.03), 0.06);
    // Neural spine: a raked blade rising off the back.
    d = smin(d, cone([x * 2.6, y, z], [0, 0.98, 0], [0, 1.42, -0.42], 0.17, 0.09), 0.06);
    // Transverse processes: wings angled up and out.
    for (const s of [-1, 1]) d = smin(d, cone([x, y, z * 1.8], [s * 0.2, 0.78, 0], [s * 0.82, 0.98, -0.05], 0.09, 0.05), 0.07);
    // Articular facets ahead and behind the arch.
    for (const s of [-1, 1]) for (const f of [-1, 1]) d = smin(d, ell(p, [s * 0.16, 1.0, f * 0.24], [0.07, 0.06, 0.09]), 0.04);
    d += fbm(x * 9, y * 9, z * 9) * 0.014;
    return d;
  }, [-0.95, -0.05, -0.65], [0.95, 1.8, 0.65], 80);
}

// ── THE GOD SKULL: half-buried, sockets you could walk into ───────────
// Unit: ~1 wide, origin at the sand line, facing +z.
export function skullGeometry() {
  return mesh('godskull', (p) => {
    const [x, y, z] = p, ax = Math.abs(x);
    // Cranium vault and the long face below it.
    let d = ell(p, [0, 0.2, -0.08], [0.5, 0.42, 0.56]);
    d = smin(d, ell(p, [0, -0.02, 0.28], [0.46, 0.3, 0.34]), 0.12);           // maxilla / face — solid under the sockets
    d = smin(d, ell(p, [0, -0.14, 0.42], [0.26, 0.16, 0.18]), 0.1);           // muzzle
    // Brow ridge: a heavy shelf over both sockets.
    d = smin(d, cone([ax, y, z], [0.0, 0.3, 0.42], [0.36, 0.27, 0.34], 0.085, 0.06), 0.06);
    // Cheekbones: arches sweeping back to the temples.
    d = smin(d, cone([ax, y, z], [0.32, 0.04, 0.32], [0.46, 0.08, -0.08], 0.06, 0.05), 0.05);
    // Sagittal crest, low, along the top.
    d = smin(d, cone([x * 3, y, z], [0, 0.6, 0.1], [0, 0.56, -0.5], 0.06, 0.04), 0.06);
    // Carve: eye sockets (deep), nasal cavity, the temple hollows.
    d = smax(d, -ell([ax, y, z], [0.2, 0.17, 0.38], [0.16, 0.13, 0.26]), 0.03);
    d = smax(d, -ell(p, [0, 0.0, 0.54], [0.09, 0.12, 0.2]), 0.03);
    d = smax(d, -ell([ax, y, z], [0.47, 0.06, 0.08], [0.06, 0.1, 0.18]), 0.05);
    // Upper teeth: a broken row of fangs at the jawline (it is buried below).
    for (let i = 0; i < 6; i++) {
      if (h3(i, 7, 1) < 0.25) continue;   // some are gone
      const s = i < 3 ? -1 : 1, k = i % 3, tx = s * (0.08 + k * 0.08), tz = 0.52 - k * 0.07;
      const L = (k === 1 ? 0.2 : 0.11) * (0.7 + h3(i, 3, 3) * 0.5);
      d = smin(d, cone(p, [tx, -0.22, tz], [tx * 1.05, -0.22 - L, tz + 0.02], 0.035, 0.008), 0.02);
    }
    // Age: deep cracks across the vault and pitting everywhere.
    // ⚠️ A groove is a thin band where the noise crosses zero, pushed
    // in by a few cm; vault only. (A first version carved with a
    // constant below the brow line and deleted the whole face.)
    if (y > 0.22) { const gr = 0.03 - Math.abs(fbm(x * 4 + 3, z * 4, y * 2)); if (gr > 0) d += gr * 0.7; }
    d += fbm(x * 10, y * 10, z * 10) * 0.012;
    return d;
  }, [-0.62, -0.4, -0.7], [0.62, 0.72, 0.75], 100);
}

// ── A CHASM SPIRE: a split column of strata leaning out of the depth ──
// Unit: 1 tall. `v` picks one of a few shapes.
export function spireGeometry(v = 0) {
  return mesh(`spire${v}`, (p) => {
    const [x, y, z] = p;
    const lean = (y * y) * (0.12 + h3(v, 1, 1) * 0.1);
    const q = [x - lean, y, z];
    let d = cone(q, [0, -0.05, 0], [0, 1.0, 0], 0.15, 0.012);
    // A shorter shard grown out of its side.
    d = smin(d, cone(q, [0.04, 0.0, 0.04], [0.12 + h3(v, 2, 2) * 0.05, 0.58, 0.06], 0.08, 0.008), 0.04);
    // Strata: the column is banded rock, each band a slightly different width.
    const band = Math.floor(y * 14), bf = (y * 14) - band;
    d -= (h3(band, v, 3) - 0.5) * 0.016 * (1 - y);
    d += Math.max(0, 0.1 - Math.min(bf, 1 - bf)) * 0.05;   // ledges between layers
    // Facets: noise in angle, so it breaks into planes rather than a smooth cone.
    d += fbm(x * 7, y * 3, z * 7) * 0.025 * (1 - y * 0.6);
    return d;
  }, [-0.28, -0.08, -0.26], [0.42, 1.04, 0.26], 76);
}

// ── A DROWNED PILLAR: fluted, broken, drums slipped askew ─────────────
// Unit: 1 tall, radius ~0.09.
export function pillarGeometry() {
  return mesh('pillar', (p) => {
    const [x, y, z] = p;
    const a = Math.atan2(z, x), r = Math.hypot(x, z);
    // Three drums, the top two slipped sideways.
    let d = 1e9;
    const drums = [[0, 0.0, 0.34, 0, 0], [1, 0.345, 0.66, 0.012, 0.006], [2, 0.665, 0.9, -0.01, 0.02]];
    for (const [i, y0, y1, ox, oz] of drums) {
      const rr = Math.hypot(x - ox, z - oz), aa = Math.atan2(z - oz, x - ox);
      const flute = Math.max(0, Math.cos(aa * 12)) * 0.006;
      const radius = 0.088 - y0 * 0.01 + flute * -1;
      const cyl = Math.max(rr - radius, Math.max(y0 - y, y - y1));
      d = Math.min(d, cyl - 0.004);
    }
    // The capital is gone; the top drum ends in a broken, jagged face.
    d = smax(d, y - (0.9 - (fbm(x * 30, 0, z * 30) * 0.04 + 0.02)), 0.005);
    // A plinth.
    d = Math.min(d, Math.max(Math.max(Math.abs(x), Math.abs(z)) - 0.13, Math.max(-0.02 - y, y - 0.05)) - 0.006);
    // Chips out of the flutes, wear on the edges.
    d += fbm(x * 40, y * 40, z * 40) * 0.003;
    d = smax(d, -(ell(p, [0.09, 0.5, 0.02], [0.05, 0.06, 0.04])), 0.01);
    return d;
  }, [-0.16, -0.04, -0.16], [0.16, 0.95, 0.16], 72);
}

// ── A BROKEN COLOSSUS: legs in greaves on a plinth, torso sheared off ─
// Unit: 1 tall.
export function statueGeometry() {
  return mesh('colossus', (p) => {
    const [x, y, z] = p, ax = Math.abs(x);
    // Plinth, stepped.
    let d = Math.max(Math.max(Math.abs(x) - 0.3, Math.abs(z) - 0.22), Math.max(-y, y - 0.07)) - 0.005;
    d = Math.min(d, Math.max(Math.max(Math.abs(x) - 0.26, Math.abs(z) - 0.18), Math.max(-y, y - 0.11)) - 0.005);
    // Feet, shins, knees, thighs — the left a half step forward.
    for (const s of [-1, 1]) {
      const fz = s < 0 ? 0.05 : -0.03;
      const foot = cone(p, [s * 0.1, 0.13, fz - 0.04], [s * 0.1, 0.13, fz + 0.1], 0.04, 0.035);
      const shin = cone(p, [s * 0.1, 0.14, fz], [s * 0.095, 0.44, fz * 0.5], 0.05, 0.065);
      const thigh = cone(p, [s * 0.095, 0.46, fz * 0.5], [s * 0.08, 0.74, 0], 0.075, 0.095);
      d = Math.min(d, smin(smin(foot, shin, 0.03), thigh, 0.04));
      // Greave rim and knee plate.
      d = Math.min(d, ell(p, [s * 0.097, 0.45, fz * 0.5 + 0.03], [0.07, 0.05, 0.06]));
    }
    // Kilt of hanging strips between the thighs.
    const strip = Math.abs(((Math.atan2(z, x) + 6.283) % 0.35) - 0.175) * 0.08;
    d = smin(d, Math.max(Math.hypot(x, z * 1.25) - 0.16 - strip, Math.max(0.6 - y, y - 0.84)), 0.03);
    // Pelvis and the stump of the torso, sheared at an angle.
    d = smin(d, ell(p, [0, 0.84, 0], [0.18, 0.1, 0.13]), 0.05);
    d = smin(d, cone(p, [0, 0.86, 0], [0.02, 1.1, -0.01], 0.15, 0.17), 0.05);
    d = smax(d, (y - 0.98) + (x * 0.25) + fbm(x * 18, 0, z * 18) * 0.03, 0.01);
    // Erosion: everything pitted and rounded, cracks down the legs.
    d += fbm(x * 18, y * 18, z * 18) * 0.008;
    d = smax(d, -(Math.abs(fbm(ax * 6, y * 3, z * 6)) - 0.02) * 0.05, 0.004);
    return d;
  }, [-0.34, -0.02, -0.26], [0.34, 1.12, 0.26], 96);
}

// ── RUBBLE: a squared block, chipped and broken — fallen masonry ──────
// Unit: ~1 across. `v` varies the break.
export function rubbleGeometry(v = 0) {
  return mesh(`rubble${v}`, (p) => {
    const [x, y, z] = p;
    const bx = 0.5, by = 0.32 + h3(v, 4, 4) * 0.12, bz = 0.36;
    let d = Math.max(Math.abs(x) - bx, Math.abs(y) - by, Math.abs(z) - bz) - 0.03;
    // One corner snapped off along a plane, a chunk out of an edge.
    const nx = h3(v, 1, 9) - 0.5, ny = 0.7, nz = h3(v, 2, 9) - 0.5, nl = len3(nx, ny, nz);
    d = smax(d, (x * nx + y * ny + z * nz) / nl - 0.2 - h3(v, 3, 9) * 0.1, 0.02);
    d = smax(d, -ell(p, [bx * 0.9, by * 0.6, 0], [0.18, 0.15, 0.22]), 0.03);
    d += fbm(x * 9 + v, y * 9, z * 9) * 0.02;
    return d;
  }, [-0.6, -0.5, -0.5], [0.6, 0.5, 0.5], 16);
}

// ── A MONOLITH: a dressed standing stone, chipped, a rune band cut in ─
// Unit: 1 tall, ~0.22 wide. Origin at its foot.
export function monolithGeometry(v = 0) {
  return mesh(`monolith${v}`, (p) => {
    const [x, y, z] = p;
    const t = Math.min(1, Math.max(0, y));
    const w = 0.13 - t * 0.04, dd = 0.085 - t * 0.025;
    let d = Math.max(Math.abs(x) - w, Math.abs(z) - dd, -y, y - 1 + Math.abs(x) * 0.9) - 0.012;   // a pitched top
    // A rune band: a shallow channel all round, a third of the way up.
    const by = 0.34 + h3(v, 5, 5) * 0.2;
    // ⚠️ Carved only within 12 mm of the surface: an unbounded band
    // cut the stone clean in two.
    d = Math.max(d, -Math.max(Math.abs(y - by) - 0.018, -(d + 0.012)));
    // Glyphs cut into the face below the band.
    for (let i = 0; i < 4; i++) {
      const gy = by - 0.08 - i * 0.07, gx = (h3(v, i, 2) - 0.5) * 0.1;
      d = smax(d, -(Math.max(Math.abs(x - gx) - 0.022, Math.abs(y - gy) - 0.008 - h3(v, i, 3) * 0.02, -(z - dd + 0.006))), 0.003);
    }
    // A great flake broken off one edge, and weather on everything.
    d = smax(d, -ell(p, [w * 1.05, 0.7 + h3(v, 7, 7) * 0.15, dd], [0.07, 0.14, 0.06]), 0.01);
    d += fbm(x * 22 + v, y * 22, z * 22) * 0.006;
    return d;
  }, [-0.17, -0.02, -0.12], [0.17, 1.02, 0.12], 72);
}

// ── A CAVE MOUTH: an outcrop with a hooded arch bored into it ─────────
// Unit: 1 wide, opening faces +z. The darkness is PropForge's.
export function caveGeometry() {
  return mesh('cavemouth', (p) => {
    const [x, y, z] = p;
    // The outcrop: a lumpy mound of rock, broader at the back.
    let d = ell(p, [0, 0.0, -0.25], [0.75, 0.62, 0.55]);
    d = smin(d, ell(p, [0.32, 0.05, 0.0], [0.34, 0.42, 0.34]), 0.12);
    d = smin(d, ell(p, [-0.36, 0.0, -0.05], [0.32, 0.36, 0.34]), 0.12);
    // Strata: horizontal ledges.
    d += Math.max(0, 0.08 - Math.abs(((y * 9) % 1 + 1) % 1 - 0.5)) * 0.06;
    d += fbm(x * 5, y * 5, z * 5) * 0.06 + fbm(x * 16, y * 16, z * 16) * 0.012;
    // The tunnel: an arched bore driven in from the front, below the hood.
    const ty = Math.max(0, y - 0.22), bore = Math.max(Math.hypot(x * 1.0, ty * 1.15) - 0.33 - fbm(x * 8, y * 8, 1) * 0.04, -y - 0.05);
    d = smax(d, -Math.max(bore, -(z + 0.6)), 0.04);
    return Math.max(d, -y - 0.02);   // flat on the ground
  }, [-0.95, -0.05, -0.95], [0.95, 0.75, 0.55], 84);
}

// ── A HEADSTONE: round-topped, inscribed, a corner gone ───────────────
// Unit: 1 tall.
export function headstoneGeometry(v = 0) {
  return mesh(`headstone${v}`, (p) => {
    const [x, y, z] = p;
    const W = 0.27, T = 0.055, sh = 0.72;
    // Slab with a rounded (arched) head.
    let d = Math.max(Math.abs(x) - W, Math.abs(z) - T, -y, y - sh);
    const top = Math.max(Math.hypot(x, y - sh) - W, Math.abs(z) - T);
    d = Math.min(d, Math.max(top, sh - y)) - 0.008;
    // Inscription: three lines incised, a cross above them.
    for (let i = 0; i < 3; i++) d = smax(d, -Math.max(Math.abs(x) - 0.17 + i * 0.03, Math.abs(y - 0.5 + i * 0.075) - 0.008, -(z - T + 0.008)), 0.003);
    d = smax(d, -Math.min(Math.max(Math.abs(x) - 0.012, Math.abs(y - 0.76) - 0.07, -(z - T + 0.008)), Math.max(Math.abs(x) - 0.05, Math.abs(y - 0.79) - 0.012, -(z - T + 0.008))), 0.003);
    // A broken corner and lichen-pocked weathering.
    if (h3(v, 1, 1) > 0.4) d = smax(d, (x * 0.7 + (y - sh) * 0.7) - 0.17, 0.01);
    d += fbm(x * 24 + v, y * 24, z * 24) * 0.005;
    // A low plinth it sits in.
    d = Math.min(d, Math.max(Math.abs(x) - W - 0.05, Math.abs(z) - T - 0.06, -y - 0.02, y - 0.07) - 0.01 + fbm(x * 12, 0, z * 12) * 0.01);
    return d;
  }, [-0.36, -0.04, -0.15], [0.36, 1.02, 0.15], 52);
}

// ── A GATE POST: a squared pier, its arrises worn, a capital ──────────
// Unit: 1 tall.
export function gatePostGeometry() {
  return mesh('gatepost', (p) => {
    const [x, y, z] = p;
    const w = 0.06;
    let d = Math.max(Math.abs(x) - w, Math.abs(z) - w * 1.3, -y, y - 0.9) - 0.006;
    // Base and capital mouldings.
    d = Math.min(d, Math.max(Math.abs(x) - w - 0.018, Math.abs(z) - w * 1.3 - 0.018, -y, y - 0.07) - 0.006);
    d = Math.min(d, Math.max(Math.abs(x) - w - 0.02 + Math.max(0, y - 0.9) * 0.2, Math.abs(z) - w * 1.3 - 0.02, 0.86 - y, y - 0.96) - 0.006);
    // Coursing: a joint every course, so it reads as built stone.
    const cy = (y * 10) % 1; d += Math.max(0, 0.06 - Math.min(cy, 1 - cy)) * 0.06 * (y > 0.08 && y < 0.86 ? 1 : 0);
    // Runic channels down the face.
    d = smax(d, -Math.max(Math.abs(x) - 0.012, Math.abs(y - 0.48) - 0.3, -(z - w * 1.3 + 0.008)), 0.003);
    d += fbm(x * 30, y * 30, z * 30) * 0.003;
    return d;
  }, [-0.1, -0.02, -0.11], [0.1, 1.0, 0.11], 72);
}

/** Build `make()` at quality q (fraction of full resolution). */
export function atQuality(q, make) { const p = _q; _q = q; try { return make(); } finally { _q = p; } }

const LEVELS = [1, 0.45, 0.2];   // ≈100% / 20% / 4% of the triangles
/**
 * A THREE.LOD of one sculpt: full detail within `size*4+8` m, a fifth
 * of the triangles to `size*12+20` m, a twenty-fifth beyond. `size` is
 * the prop's rough world size, so a skull keeps its detail further out
 * than a pebble does.
 */
export function sculptLOD(make, material, size = 1) {
  const lod = new THREE.LOD();
  const d = [0, size * 4 + 8, size * 12 + 20];
  LEVELS.forEach((q, i) => {
    const m = new THREE.Mesh(atQuality(q, make), material);
    // Shadows are the prop's call (ruins and headstones cast none by
    // design); PropForge's own traverse turns them on where wanted.
    m.receiveShadow = true;
    lod.addLevel(m, d[i]);
  });
  return lod;
}

/**
 * Mesh every sculpt ahead of need, ONE PER IDLE SLICE, so no chunk
 * ever pays for one and boot does not stall for the ~1 s they cost
 * together. Returns a promise that settles when all are cached.
 */
export function prewarmSculpts() {
  const jobs = [ribGeometry, vertebraGeometry, pillarGeometry, gatePostGeometry, caveGeometry, statueGeometry, skullGeometry];
  for (let v = 0; v < 3; v++) jobs.push(() => spireGeometry(v), () => rubbleGeometry(v), () => monolithGeometry(v), () => headstoneGeometry(v));
  const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 500 }) : setTimeout(fn, 16));
  const all = []; for (const q of LEVELS) for (const j of jobs) all.push(() => atQuality(q, j));
  return new Promise((done) => { const next = () => { const j = all.shift(); if (!j) return done(); j(); idle(next); }; idle(next); });
}
