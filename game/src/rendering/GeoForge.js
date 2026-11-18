// ══════════════════════════════════════════════════════════
// GeoForge — organic geometry, and a lot of it
//
// Two complaints this exists to answer, which turn out to have the
// same root cause:
//
//   "the graphics look blocky / like Minecraft"
//   "everything looks the same"
//
// Every rock in the world was `new THREE.IcosahedronGeometry(0.75, 0)`.
// Detail level ZERO — a twenty-faced solid. A die. And because
// PropForge caches geometry by a string key for performance, it was
// *literally the same mesh object* every time; the only per-instance
// variation was a random non-uniform scale and rotation. So the world
// was thousands of copies of one die, stretched differently.
//
// Scaling a die does not make it a boulder. Only two things do:
//   1. enough subdivision that the silhouette reads as curved
//   2. actual displacement, so the surface has features
//
// This module does both, and adds a third thing that turns them into
// variety: it builds a POOL of independently-displaced variants per
// shape rather than one. Callers pick from the pool by instance seed.
// A pool of 14 rocks, each freely rotated and non-uniformly scaled, is
// combinatorially indistinguishable from "every rock is unique" at
// gameplay distances — but it costs 14 cached geometries, not one per
// rock, so the memory story stays exactly as good as it was.
//
// Cost note: an icosahedron at detail 2 is 320 faces vs 20. That sounds
// like 16x, and it is — but 320 faces is still nothing, and there are
// only ever `propVariants` of them in memory regardless of how many
// rocks are on screen. The draw call count is completely unchanged.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';
import { quality } from './Quality.js';

// One shared noise field. Displacement variety comes from sampling it
// at a different offset per variant, not from building a new field per
// variant — building a simplex permutation table is far more expensive
// than offsetting a lookup.
const _noise3 = createNoise3D(_mulberry(0xC0FFEE));

function _mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cache of built variant pools, keyed by shape + parameters. Nothing in
// here is ever invalidated during a session — the pools are small and
// the whole point is that they're shared.
const _pools = new Map();

/**
 * Push every vertex along its own normal by fractal noise.
 *
 * Operates on a NON-indexed-safe basis: it reads the position
 * attribute directly and assumes the geometry's vertices are already
 * roughly on a unit-ish surface centred at the origin, which is true
 * for all the polyhedra and spheres used here.
 *
 * Crucially it calls computeVertexNormals() afterwards. Displacing
 * positions without recomputing normals leaves the lighting describing
 * the ORIGINAL smooth shape, so the new bumps are invisible except in
 * silhouette — a mistake that looks like "the displacement isn't
 * working".
 *
 * @param {THREE.BufferGeometry} geo   mutated in place
 * @param {object} opts
 * @param {number} opts.amount   displacement as a fraction of radius
 * @param {number} opts.freq     base noise frequency
 * @param {number} opts.octaves  fractal octaves
 * @param {number} opts.offset   per-variant sampling offset
 * @param {number} opts.squash   extra vertical flattening, 1 = none
 */
export function displace(geo, {
  amount = 0.22,
  freq = 1.6,
  octaves = 3,
  offset = 0,
  squash = 1,
} = {}) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const len = v.length() || 1e-6;

    // Fractal sum. Each octave doubles frequency and halves amplitude,
    // which is what turns a single smooth bulge into something that
    // reads as erosion at more than one scale.
    let n = 0;
    let a = 1;
    let f = freq;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      n += a * _noise3(
        v.x * f + offset,
        v.y * f + offset * 1.7,
        v.z * f - offset * 0.9,
      );
      norm += a;
      a *= 0.5;
      f *= 2.0;
    }
    n /= norm || 1;

    // Displace along the outward direction. Scaling by `len` keeps the
    // displacement proportional, so this works the same on a 0.2 pebble
    // and a 4-unit boulder.
    const push = 1 + n * amount;
    v.multiplyScalar(push);
    if (squash !== 1) v.y *= squash;

    pos.setXYZ(i, v.x, v.y, v.z);
  }

  pos.needsUpdate = true;
  // Without this the surface is lit as if it were still a smooth
  // sphere and none of the above is visible.
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Build (or fetch) a pool of displaced variants of one shape.
 *
 * @param {string} key        cache key; include any shape parameters
 * @param {Function} build    () => THREE.BufferGeometry, a fresh base shape
 * @param {object} opts       forwarded to displace(), minus `offset`
 * @param {number} [count]    pool size; defaults to the tier's setting
 * @returns {THREE.BufferGeometry[]}
 */
export function pool(key, build, opts = {}, count = null) {
  const n = Math.max(1, count ?? quality.settings.propVariants ?? 1);
  const cacheKey = `${key}|${n}|${JSON.stringify(opts)}`;
  if (_pools.has(cacheKey)) return _pools.get(cacheKey);

  const variants = [];
  for (let i = 0; i < n; i++) {
    const geo = build();
    // At the `low` tier (propVariants 1, propDetail 0) skip
    // displacement entirely — that tier exists to reproduce the
    // artifact build exactly, and a displaced rock is not that.
    if (n > 1 || (quality.settings.propDetail ?? 0) > 0) {
      // Each variant samples the shared noise field from a different
      // place, which is what makes them different shapes rather than
      // the same shape jittered.
      displace(geo, { ...opts, offset: 137.7 * (i + 1) });
    }
    variants.push(geo);
  }
  _pools.set(cacheKey, variants);
  return variants;
}

/**
 * Deterministically pick one variant. Callers pass any per-instance
 * number (a scatter seed, an index); the same input always yields the
 * same variant, so a chunk regenerated after unload looks identical.
 */
export function pick(variants, seed) {
  if (variants.length === 1) return variants[0];
  // Hash rather than modulo: consecutive scatter indices with a plain
  // `% n` walk the pool in order, which produces visibly repeating
  // A-B-C-A-B-C runs along a line of rocks.
  let s = Math.imul(seed >>> 0 ^ 0x9E3779B9, 0x85EBCA6B);
  s ^= s >>> 13;
  s = Math.imul(s, 0xC2B2AE35);
  s ^= s >>> 16;
  return variants[(s >>> 0) % variants.length];
}

/**
 * Subdivision level for polyhedra, from the tier. Exposed so call
 * sites read `icoDetail()` instead of hardcoding a 0 that nobody
 * revisits.
 */
export function icoDetail(bump = 0) {
  return Math.max(0, (quality.settings.propDetail ?? 0) + bump);
}

/**
 * Segment counts for spheres/cylinders, scaled by tier. The base
 * numbers throughout PropForge/EntityForge were chosen for the
 * artifact build (5-12 segments); at `low` this returns them
 * unchanged, and at the HD tiers it lifts them enough that a trunk or
 * a canopy lobe stops reading as a faceted prism.
 */
export function seg(base) {
  const d = quality.settings.propDetail ?? 0;
  if (d <= 0) return base;
  // +1 detail level ≈ 1.6x segments, capped so a tiny 5-segment bead
  // doesn't become a 40-segment sphere for no visible gain.
  return Math.min(Math.round(base * (1 + 0.6 * d)), Math.max(base, 32));
}

/** Free every cached pool. Only used on teardown. */
/**
 * A box with rounded, bevelled edges.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────
 * This module's header answers "the graphics look blocky" for NATURAL
 * props — rocks, boulders, terrain features — by subdividing and
 * displacing them. It worked, and it left the other half of the
 * complaint untouched: every piece of ARCHITECTURE in the game is a
 * raw `THREE.BoxGeometry`. Walls, towers, market stalls, the keep,
 * every hub building. A box has perfectly sharp 90° edges, and a
 * perfectly sharp 90° edge is the single strongest "this is a
 * voxel/prototype asset" cue there is — real masonry has chamfers,
 * weathering and mortar lines, and it catches a highlight along every
 * edge.
 *
 * Rounding is the highest-value-per-triangle fix available: a 2cm
 * bevel on a 10m wall is invisible as a shape and unmistakable as a
 * specular highlight. It is what separates "a grey box" from "a
 * stone block" without touching the silhouette at all.
 *
 * ── HOW ───────────────────────────────────────────────────
 * Standard rounded-box construction: take a subdivided box, and for
 * every vertex compute the nearest point on the INNER box (the shape
 * inset by `radius` on all sides), then place the vertex at exactly
 * `radius` away from that point along the direction to it. Faces stay
 * flat, edges become quarter-cylinders, corners become sphere octants.
 *
 * ⚠️ `computeVertexNormals()` afterwards is not optional — same trap
 * `displace()` documents above. Move positions without recomputing
 * normals and the lighting keeps describing the original sharp box, so
 * the bevel is invisible except in silhouette, where it is too small
 * to see. That failure looks exactly like "the rounding isn't working."
 *
 * @param {number} w width
 * @param {number} h height
 * @param {number} d depth
 * @param {number} radius bevel radius. Clamped to just under half the
 *   smallest dimension — a radius larger than that inverts the inner
 *   box and turns the mesh inside out.
 * @param {number} steps subdivisions per edge. 2 is enough for a
 *   chamfer read; 3+ only matters if the radius is large.
 */
export function roundedBox(w, h, d, radius = 0.06, steps = 2) {
  const r = Math.min(radius, Math.min(w, h, d) / 2 - 1e-4);
  if (r <= 0) return new THREE.BoxGeometry(w, h, d);

  // Segment counts sized so the bevel itself is subdivided, not the
  // flat faces — subdividing a flat face buys nothing and costs
  // triangles on every wall in the game.
  const n = Math.max(1, steps) * 2 + 1;
  const geo = new THREE.BoxGeometry(w, h, d, n, n, n);
  const pos = geo.attributes.position;

  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  const v = new THREE.Vector3(), inner = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Nearest point on the inner box.
    inner.set(
      Math.max(-hw, Math.min(hw, v.x)),
      Math.max(-hh, Math.min(hh, v.y)),
      Math.max(-hd, Math.min(hd, v.z)),
    );
    const dir = v.sub(inner);
    const len = dir.length();
    // A vertex already on the inner box (len 0) is dead-centre on a
    // flat face; leave it exactly where it is rather than normalising
    // a zero vector into NaN.
    if (len > 1e-6) dir.multiplyScalar(r / len);
    pos.setXYZ(i, inner.x + dir.x, inner.y + dir.y, inner.z + dir.z);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Weather a piece of architecture: nudge every vertex by a small amount
 * of noise so its faces are not mathematically flat planes.
 *
 * Distinct from `displace()` above, which is tuned for boulders and
 * moves vertices along their own radius from a centre. Masonry has no
 * centre to push away from — this moves along the surface NORMAL, by a
 * fixed metre amount rather than a fraction of radius, so a 12m keep
 * and a 1m block weather by the same visible degree instead of the
 * keep being wrecked and the block being untouched.
 *
 * Keep `amount` small (1–4cm). This is meant to break up specular
 * highlights, not to make the building look damaged — the Sanctuary's
 * keep is deliberately the one intact structure in the game.
 */
export function weather(geo, { amount = 0.02, freq = 2.2, offset = 0 } = {}) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  if (!nor) geo.computeVertexNormals();
  const p = geo.attributes.position, nn = geo.attributes.normal;
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(p, i);
    n.fromBufferAttribute(nn, i);
    const d = _noise3(v.x * freq + offset, v.y * freq + offset, v.z * freq + offset) * amount;
    p.setXYZ(i, v.x + n.x * d, v.y + n.y * d, v.z + n.z * d);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

export function disposeGeoForge() {
  for (const variants of _pools.values()) {
    for (const g of variants) g.dispose();
  }
  _pools.clear();
}
