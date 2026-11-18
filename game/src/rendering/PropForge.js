// ══════════════════════════════════════════════════════════
// Prop Forge — the things standing in the world
//
// Trees were a box trunk with two box leaf-clumps. Rocks were boxes.
// Buildings were boxes with a flatter box on top for a roof. That is
// the entire reason the world read as a toy.
//
// Same rule as EntityForge: silhouette first, composed from several
// primitives, with material variation and no flat unlit colour. These
// are set dressing, so they stay cheap — 3 to 6 meshes each, low
// segment counts, flat shading doing most of the work.
//
// None of these cast shadows (they still RECEIVE them, so a tree
// standing in a rock's shadow still looks grounded). Decorative props
// vastly outnumber real entities once a chunk fills in, so every one
// of them casting its own shadow meant re-rendering hundreds of extra
// meshes into the sun's depth map every frame for very little visual
// payoff. Real entities (EntityForge.js) still cast shadows.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { atmosphere } from './Atmosphere.js';
import { materialLibrary } from './MaterialLibrary.js';
import { pool, pick, icoDetail, seg, roundedBox, weather } from './GeoForge.js';
import { modelLibrary } from './ModelLibrary.js';
import { ribGeometry, vertebraGeometry, skullGeometry, spireGeometry, pillarGeometry, statueGeometry, rubbleGeometry, monolithGeometry, caveGeometry, headstoneGeometry, gatePostGeometry, sculptLOD } from './Sculpt.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NATURE_MODELS } from '../data/natureModels.js';

// ── HD surface detail per prop role ───────────────────────
// Props are built from Three.js primitives with no UV unwrapping worth
// the name (a CylinderGeometry's default UVs are fine; a lathe of
// stacked spheres is not), so they get the same triplanar world-space
// projection the terrain uses — no UVs required, and a rock and the
// ground beneath it end up sharing a coherent stone grain rather than
// two unrelated mappings meeting at a hard line.
//
// `scale` is world units per texture repeat, tuned per role against
// that role's real size: a monolith is ~8m tall and wants a coarse
// grain, a tree trunk is ~0.4m across and wants a fine one. Getting
// this wrong is what makes textured props read as wrapped in
// wallpaper.
//
// Roles absent from this table (leaf) stay flat-shaded on purpose —
// foliage is a mass of overlapping spheres read at distance, and
// projecting rock or bark onto it just makes it noisy.
const PROP_SURFACES = {
  stone:     { slug: 'rock',      scale: 1.8, detail: 0.5,  normalScale: 1.2 },
  mono:      { slug: 'stonewall', scale: 3.2, detail: 0.45, normalScale: 1.1 },
  ruin:      { slug: 'stonewall', scale: 2.4, detail: 0.5,  normalScale: 1.2 },
  ruindark:  { slug: 'stonewall', scale: 2.4, detail: 0.5,  normalScale: 1.2 },
  bark:      { slug: 'wood',      scale: 1.1, detail: 0.55, normalScale: 1.3 },
  deadbark:  { slug: 'wood',      scale: 0.9, detail: 0.6,  normalScale: 1.4 },

  // ⚠️ The Sanctuary's own surfaces. These were MISSING, and a role
  // absent from this table gets no textures at all AND keeps
  // flatShading — which is why the keep read as a plain untextured
  // white box no matter how much its geometry was rounded. Rounding
  // the silhouette and then handing it a flat colour fixes half a
  // problem and looks like fixing none of it.
  //
  // Scales are per-role against real size, same rule as above: the
  // keep is 11m across and wants coarse courses, a market counter is
  // 2.5m and wants visible grain.
  keepstone:   { slug: 'stonewall', scale: 2.8, detail: 0.5,  normalScale: 1.25 },
  keeptrim:    { slug: 'stonewall', scale: 1.4, detail: 0.55, normalScale: 1.3 },
  gatestone:   { slug: 'stonewall', scale: 2.0, detail: 0.5,  normalScale: 1.3 },
  wellstone:   { slug: 'stonewall', scale: 1.2, detail: 0.55, normalScale: 1.3 },
  wellwood:    { slug: 'wood',      scale: 0.8, detail: 0.6,  normalScale: 1.35 },
  stallwood:   { slug: 'wood',      scale: 0.7, detail: 0.6,  normalScale: 1.35 },
  brazieriron: { slug: 'metal',     scale: 0.5, detail: 0.6,  normalScale: 1.4 },

  // ⚠️ REALISM PASS — the god's bones were `plainMat`: untextured,
  // flat-shaded, and lit by a physical sun they read as painted plaster.
  // Weathered bone at this scale IS a cracked, pitted mineral surface,
  // so the rock set carries it — coarse, because a rib is 30m long and
  // fine grain at that size reads as a small object.
  bone:        { slug: 'rock',      scale: 4.2, detail: 0.42, normalScale: 1.15 },
  bonedark:    { slug: 'rock',      scale: 3.0, detail: 0.5,  normalScale: 1.25 },
};

// Shared materials — props are numerous, so they must not each
// allocate their own. Keyed by role and tinted per biome on request.
const _cache = new Map();
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ── ALBEDO KNEE (realism pass) ────────────────────────────
// The same soft knee Atmosphere.gradeColor applies to terrain: prop
// colours were tuned under the old dark grade, so stone and bone sat at
// chalk-white reflectance and blew out under a physical sun. Below 0.2
// linear untouched; above it, 35% of the excess kept. Emissive and
// unlit materials are exempt — they are light, not surface.
function albedo(colorHex) {
  const c = new THREE.Color(colorHex);
  const lum = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
  const K = 0.2;
  if (lum > K) c.multiplyScalar((K + (lum - K) * 0.35) / lum);
  return c;
}

function mat(key, { color, rough = 0.9, metal = 0.0, flat = true }) {
  const id = `${key}:${color}:${rough}:${metal}`;
  if (!_cache.has(id)) {
    const surface = PROP_SURFACES[key];
    // flatShading and normal mapping are mutually defeating: flat
    // shading forces one face-constant normal per triangle, which
    // throws away exactly the per-pixel normal variation the map
    // exists to provide. Drop it for any role that gets a texture —
    // the faceted silhouette is geometry and survives regardless, and
    // the smooth-shaded surface is what lets the normal map read.
    const useHD = !!surface && materialLibrary.ready;
    const m = new THREE.MeshStandardMaterial({
      color: albedo(color),
      roughness: rough,
      metalness: metal,
      flatShading: useHD ? false : flat,
    });
    if (useHD) {
      materialLibrary.applyTriplanar(m, surface.slug, {
        scale: surface.scale,
        detail: surface.detail,
        normalScale: surface.normalScale,
        aoStrength: 0.7,
      });
    }
    _cache.set(id, m);
  }
  return _cache.get(id);
}

/**
 * A cached material for roles that are NOT in PROP_SURFACES.
 *
 * ⚠️ `mat()` above requires a role and silently gets no textures for
 * one that is absent (trap #8). Several props want a plain, untextured
 * material on purpose — a glowing crystal, an arcane crack — and were
 * therefore calling `new THREE.MeshStandardMaterial` DIRECTLY, once
 * per prop, forever.
 *
 * Measured in a live 25-chunk view: **68 identical copies** of the
 * shard body material and **68** of its rock material, plus smaller
 * runs for the ruin crack. 174 redundant material objects in total.
 * Each distinct material object is its own shader-program candidate
 * and its own batching boundary, and this project's remaining frame
 * hitch is documented as first-sight shader compilation.
 *
 * ⚠️ Keyed on the full visual signature, so two callers that want
 * genuinely different materials still get different objects. Anything
 * that would later MUTATE the material it gets back must not use this
 * — a cached material is shared by every prop that asked for it.
 */
function plainMat({ color, rough = 0.9, metal = 0.0, flat = true,
                   emissive = null, emissiveIntensity = 0,
                   basic = false, transparent = false, opacity = 1,
                   side = null, blending = null, depthWrite = null,
                   toneMapped = null }) {
  const id = `plain:${basic ? 'B' : 'S'}:${color}:${rough}:${metal}:${flat}:${emissive}:`
           + `${emissiveIntensity}:${transparent}:${opacity}:${side}:${blending}:`
           + `${depthWrite}:${toneMapped}`;
  if (!_cache.has(id)) {
    const opts = { color, transparent, opacity };
    if (side !== null) opts.side = side;
    if (blending !== null) opts.blending = blending;
    if (depthWrite !== null) opts.depthWrite = depthWrite;
    if (toneMapped !== null) opts.toneMapped = toneMapped;
    let m;
    if (basic) {
      m = new THREE.MeshBasicMaterial(opts);
    } else {
      m = new THREE.MeshStandardMaterial({
        ...opts, roughness: rough, metalness: metal, flatShading: flat,
        // Surface albedo through the same knee as mat(); a material that
        // EMITS is light, not surface, and keeps its colour.
        color: emissive === null ? albedo(color) : color,
      });
      if (emissive !== null) {
        m.emissive = new THREE.Color(emissive);
        m.emissiveIntensity = emissiveIntensity;
      }
    }
    _cache.set(id, m);
  }
  return _cache.get(id);
}

// Shared UNIT geometries for the highest-frequency props (trees, rocks
// — there can be hundreds loaded at once, one every ~7 units of
// terrain). Every tree used to allocate 6 brand-new BufferGeometry
// objects, every rock 2 — none of them ever reused. The variation
// between instances (height, taper, lean) came entirely from
// PARAMETERS baked into each geometry's constructor, which is exactly
// what made every one unique and uncacheable.
//
// The fix: build each shape once at a canonical unit size, keyed by
// whatever parameters actually change its topology (radius RATIOS,
// not absolute size), and apply the per-instance size as a transform
// (mesh.scale) instead of baking it into new geometry. A non-uniform
// scale reproduces an elongated/tapered look exactly, and Three.js's
// standard shaders already transform normals correctly under
// non-uniform scale, so this is a pure perf change with zero visual
// difference from the original.
function geo(key, build) {
  if (!_cache.has(key)) _cache.set(key, build());
  return _cache.get(key);
}

const rand = (a, b) => a + Math.random() * (b - a);
// Integer seed for variant selection. Props already randomise scale and
// rotation per instance with Math.random(), so they are not stable
// across a chunk unload/reload anyway — picking the shape variant the
// same way is consistent with existing behaviour, not a regression.
const rnd = () => (Math.random() * 0x7fffffff) | 0;


// ── Real photoscanned nature props ────────────────────────
//
// The procedural forge functions below still exist and are still the
// fallback, but when the Poly Haven set is loaded these take over for
// rocks and trees. That is the whole point of fetching them: a
// displaced icosahedron cannot look like a rock, because a real rock's
// silhouette encodes erosion the noise function does not model.
//
// Every real-model path degrades to procedural if the model is not
// loaded. A prop must never fail to spawn.

/**
 * Measure a group and scale it so its height matches `target`.
 *
 * Poly Haven exports at REAL WORLD SCALE — their boulders are
 * genuinely 3-5m across and their dead trunks 6m+. Dropped in
 * unscaled they dwarf a 1.62m-eye-height player. Same
 * measure-then-derive approach EntityForge uses for the KayKit rigs;
 * there is no reliable metadata to read instead, so measure.
 */
function _fitHeight(group, target) {
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  if (!size.y || !isFinite(size.y) || size.y <= 0) return group;
  group.scale.multiplyScalar(target / size.y);
  return group;
}

/**
 * Instantiate a random member of one nature category, fitted to a
 * height sampled from that model's own range.
 *
 * @returns {THREE.Group|null} null when no model in the category loaded
 */
function _forgeNature(category, scaleMult = 1) {
  const list = NATURE_MODELS[category];
  if (!list || !list.length) return null;

  // Only consider entries whose model actually loaded — a partial
  // download must not produce holes in the world where the missing
  // slugs came up in the shuffle.
  const available = list.filter(m => modelLibrary.isReady(`nature:${m.slug}`));
  if (!available.length) return null;

  const spec = available[(Math.random() * available.length) | 0];
  const inst = modelLibrary.instantiate(`nature:${spec.slug}`);
  if (!inst || !inst.group) return null;

  const g = inst.group;
  const [lo, hi] = spec.targetHeight;

  // DAMPEN the caller's scale rather than applying it directly.
  //
  // targetHeight is already a per-instance random range expressed in
  // real metres, and it is already the primary source of size
  // variation. Call sites pass `pos.scale * 1.4` where pos.scale spans
  // 0.45-2.35, so multiplying the two straight through double-applies
  // the variation and yields 11m boulders towering over a 1.62m
  // player.
  //
  // Damping to 35% keeps the scatter's intent (regions that wanted
  // bigger props still get bigger props) without letting the two
  // sources of randomness compound into absurdity. Clamped for the
  // tails.
  // Clamp tightened from [0.6, 1.8] after measuring the result: the
  // wider band produced a median prop height of 6.85m and a maximum of
  // 16.1m, i.e. trees ten times the player's height. [0.7, 1.3] keeps
  // the scatter's size intent legible without letting it run away.
  const damped = Math.min(1.3, Math.max(0.7, 1 + (scaleMult - 1) * 0.28));
  _fitHeight(g, (lo + Math.random() * (hi - lo)) * damped);

  // Free rotation about Y, plus a small lean. These scans are single
  // objects, so without per-instance rotation a field of them reads as
  // stamped copies no matter how good each one looks.
  g.rotation.y = Math.random() * Math.PI * 2;
  g.rotation.x = (Math.random() - 0.5) * 0.12;
  g.rotation.z = (Math.random() - 0.5) * 0.12;

  // Match the shadow policy of the procedural props: these receive but
  // do not cast. See this file's header — decorative props vastly
  // outnumber real entities, and every one casting into the sun's depth
  // map was a large cost for little payoff.
  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  g.userData.isRealModel = true;
  return g;
}

/** True when at least one model in a category is usable. */
export function hasNature(category) {
  const list = NATURE_MODELS[category];
  return !!list && list.some(m => modelLibrary.isReady(`nature:${m.slug}`));
}

/** Build a landmark by exact slug (not random) — for placed set pieces. */
/**
 * Merge a prop's static parts into ONE mesh per material.
 *
 * ⚠️ Draw calls: a brazier was 22 meshes, a well 22, a stall 24, the
 * arch 23 — measured 1,844 draw calls in one frame. Parts that never
 * move and share a material are baked into a single geometry here.
 * Named meshes (flames, the gate sheet), lights, LODs and transparent
 * parts are left alone. Attributes are reduced to position/normal so
 * geometries from different builders always merge.
 */
function mergeStatic(g) {
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert();
  const byMat = new Map(), drop = [];
  g.traverse(o => {
    if (!o.isMesh || o.name || o.isSkinnedMesh || o.isInstancedMesh || Array.isArray(o.material) || o.material.transparent) return;
    for (let p = o.parent; p && p !== g; p = p.parent) if (p.isLOD || p.name) return;
    const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (!byMat.has(o.material)) byMat.set(o.material, { geos: [], cast: false });
    const e = byMat.get(o.material); e.geos.push(geo); e.cast ||= o.castShadow;
    drop.push(o);
  });
  for (const [m, e] of byMat) {
    if (e.geos.length < 2) { e.geos.forEach(x => x.dispose()); byMat.delete(m); continue; }
  }
  for (const o of drop) {
    if (!byMat.has(o.material)) continue;
    o.parent.remove(o);
  }
  for (const [m, e] of byMat) {
    const merged = mergeGeometries(e.geos);
    e.geos.forEach(x => x.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, m);
    mesh.castShadow = e.cast; mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}

export function forgeLandmark(slug, targetHeight = null) {
  if (!modelLibrary.isReady(`nature:${slug}`)) return null;
  const inst = modelLibrary.instantiate(`nature:${slug}`);
  if (!inst?.group) return null;
  const g = inst.group;
  if (targetHeight) _fitHeight(g, targetHeight);
  g.rotation.y = Math.random() * Math.PI * 2;
  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  g.userData.isRealModel = true;
  return g;
}

// ── TREES ─────────────────────────────────────────────────

/**
 * A tree. Tapered trunk, a couple of angled limbs, and a canopy built
 * from overlapping low-poly spheres rather than a stack of cubes.
 */
export function forgeTree(scale = 1, biomeColors = {}) {
  // Real scanned tree when available. Biome leaf/bark colours are not
  // applied for the same reason forgeRock ignores its tint.
  const real = _forgeNature('tree', scale);
  if (real) return real;

  const g = new THREE.Group();

  const barkC = biomeColors.bark ?? 0x2f2216;
  const leafC = biomeColors.leaf ?? 0x243620;

  const bark = mat('bark', { color: barkC, rough: 0.95 });
  // Canopy is foliage, not stone or armor plate — smooth normals so
  // the low-poly clumps read as soft rounded mass catching light,
  // not faceted crystal. Bark stays flat (default): rough wood grain
  // is a legitimate angular read.
  const leaf = mat('leaf', { color: leafC, rough: 0.85, flat: false });

  const h = rand(2.4, 3.6) * scale;

  // Unit trunk: radius ratio (0.10:0.22) is constant across every
  // tree, only absolute size (scale) and height (h) vary — both
  // reproduced exactly via non-uniform mesh.scale.
  // 5 radial segments is a pentagonal prism — it reads as a post, not a
  // trunk. seg() lifts it with the tier. The variant pool + gentle
  // displacement give each trunk its own irregular taper and bulge, so a
  // stand of trees stops looking like a row of identical dowels.
  const trunkGeo = pick(pool('tree-trunk',
    () => new THREE.CylinderGeometry(0.10, 0.22, 1, seg(5), seg(4)),
    { amount: 0.12, freq: 2.2, octaves: 2 }), rnd());
  const trunk = new THREE.Mesh(trunkGeo, bark);
  trunk.scale.set(scale, h, scale);
  trunk.position.y = h / 2;
  trunk.rotation.y = rand(0, Math.PI);
  g.add(trunk);

  // A couple of limbs so the silhouette isn't a lollipop. Limb length
  // is a constant multiple of `scale` (no independent randomness), so
  // a single uniform scale reproduces it exactly.
  const limbGeo = geo('tree-limb', () => new THREE.CylinderGeometry(0.03, 0.07, 0.9, seg(4)));
  for (let i = 0; i < 2; i++) {
    const limb = new THREE.Mesh(limbGeo, bark);
    limb.scale.setScalar(scale);
    const a = rand(0, Math.PI * 2);
    limb.position.set(Math.cos(a) * 0.24 * scale, h * rand(0.55, 0.78), Math.sin(a) * 0.24 * scale);
    limb.rotation.set(rand(-0.6, -0.3), a, rand(-0.4, 0.4));
    g.add(limb);
  }

  // Canopy: three overlapping icosahedra, deliberately uneven. Each
  // index has its own fixed shrink factor baked into a cached unit
  // geometry; the random spread + scale is applied per-instance.
  const clumps = 3;
  for (let i = 0; i < clumps; i++) {
    // Foliage gets the STRONGEST displacement of anything in this file
    // (0.34). A canopy is the one shape where a smooth surface is
    // actively wrong — real foliage has a broken, cauliflower-like
    // outline, and an undisplaced sphere reads as a lollipop no matter
    // how many segments it has.
    const clumpGeo = pick(pool(`tree-clump-${i}`,
      () => new THREE.IcosahedronGeometry(1 - i * 0.16, icoDetail(2)),
      { amount: 0.34, freq: 2.6, octaves: 3 }), rnd());
    const clump = new THREE.Mesh(clumpGeo, leaf);
    const s = rand(0.62, 0.95) * scale;
    const yFactor = rand(0.7, 0.95);
    clump.scale.set(s, s * yFactor, s);
    clump.position.set(
      rand(-0.35, 0.35) * scale,
      h + rand(-0.1, 0.45) * scale + i * 0.3 * scale,
      rand(-0.35, 0.35) * scale
    );
    clump.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    g.add(clump);
  }

  g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });  // no castShadow — see header note
  return g;
}

/** A dead tree — bare, forked, for scorched or void-turned ground. */
export function forgeDeadTree(scale = 1) {
  const real = _forgeNature('deadTree', scale);
  if (real) return real;

  const g = new THREE.Group();
  const bark = mat('deadbark', { color: 0x2a2018, rough: 1.0 });
  const h = rand(2.6, 4.0) * scale;

  const trunkGeo = geo('deadtree-trunk', () => new THREE.CylinderGeometry(0.06, 0.2, 1, seg(5)));
  const trunk = new THREE.Mesh(trunkGeo, bark);
  trunk.scale.set(scale, h, scale);
  trunk.position.y = h / 2;
  g.add(trunk);

  // Branch length has its own random spread independent of `scale`
  // (`len`), so radius (scale-only) and length (len) scale separately.
  const branchGeo = geo('deadtree-branch', () => new THREE.CylinderGeometry(0.02, 0.055, 1, seg(4)));
  for (let i = 0; i < 4; i++) {
    const len = rand(0.7, 1.5) * scale;
    const branch = new THREE.Mesh(branchGeo, bark);
    branch.scale.set(scale, len, scale);
    const a = (i / 4) * Math.PI * 2 + rand(-0.4, 0.4);
    const y = h * rand(0.5, 0.95);
    branch.position.set(Math.cos(a) * 0.2 * scale, y, Math.sin(a) * 0.2 * scale);
    branch.rotation.set(rand(-0.9, -0.4), a, rand(-0.5, 0.5));
    branch.translateY(len * 0.4);
    g.add(branch);
  }

  g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });  // no castShadow — see header note
  return g;
}

// ── ROCKS ─────────────────────────────────────────────────

/**
 * A rock. A crushed, rotated icosahedron with a smaller one leaning
 * on it — reads as geology instead of as a crate.
 */
export function forgeRock(scale = 1, tint = 0x403c36) {
  // Real photoscanned boulder when available. `tint` is deliberately
  // IGNORED on this path: it exists to push the procedural rock toward
  // the biome palette, and a scan already carries its own correct
  // albedo. Tinting it would undo the realism it was fetched for.
  const real = _forgeNature('rock', scale);
  if (real) return real;

  const g = new THREE.Group();
  const stone = mat('stone', { color: tint, rough: 0.95 });
  // A duller, tarnished mineral fleck embedded in the mass — reads as
  // a vein of old ore rather than more of the same rock, and is the
  // one part of the object that isn't uniformly matte stone.
  const vein = mat('rock-vein', { color: 0x51402a, rough: 0.5, metal: 0.35 });

  // Both lumps' geometry radius used to be `baseRadius * scale`, with
  // the per-instance crush/lean applied as a SEPARATE mesh.scale on
  // top — so folding `scale` into that same mesh.scale (multiplication
  // is associative) reproduces the exact original size from one cached
  // unit shape per lump.
  // Each lump is drawn from a POOL of independently noise-displaced
  // variants rather than being the one shared 20-face icosahedron the
  // whole world used to share. Subdivision (icoDetail) gives a curved
  // silhouette; the displacement gives it erosion. Together they are
  // the difference between a die and a boulder.
  //
  // Rocks get a slightly deeper displacement than anything else here —
  // they are supposed to look broken and weathered, and a timid amount
  // just reads as a lumpy sphere.
  const ROCK_SHAPE = { amount: 0.3, freq: 1.5, octaves: 3 };

  const mainGeo = pick(pool('rock-main',
    () => new THREE.IcosahedronGeometry(0.75, icoDetail(2)), ROCK_SHAPE), rnd());
  const main = new THREE.Mesh(mainGeo, stone);
  main.scale.set(rand(0.9, 1.4) * scale, rand(0.5, 0.85) * scale, rand(0.9, 1.3) * scale);
  main.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
  main.position.y = 0.3 * scale;
  g.add(main);

  const chipGeo = pick(pool('rock-chip',
    () => new THREE.IcosahedronGeometry(0.34, icoDetail(1)), ROCK_SHAPE), rnd());
  const chip = new THREE.Mesh(chipGeo, stone);
  chip.position.set(rand(-0.6, 0.6) * scale, 0.16 * scale, rand(-0.6, 0.6) * scale);
  chip.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
  chip.scale.setScalar(rand(0.7, 1.1) * scale);
  g.add(chip);

  // Third, smaller satellite pebble — breaks the two-lump silhouette
  // into a genuine cluster instead of a boulder with one crumb beside it.
  const pebbleGeo = pick(pool('rock-pebble',
    () => new THREE.IcosahedronGeometry(0.2, icoDetail(1)), ROCK_SHAPE), rnd());
  const pebble = new THREE.Mesh(pebbleGeo, stone);
  pebble.position.set(rand(-0.85, 0.85) * scale, 0.08 * scale, rand(-0.85, 0.85) * scale);
  pebble.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
  pebble.scale.setScalar(rand(0.6, 1.0) * scale);
  g.add(pebble);

  // Embedded ore vein — a flattened slab pressed into the main mass,
  // angular so it reads as a fracture plane, not a sticker.
  const veinGeo = geo('rock-vein', () => new THREE.BoxGeometry(1, 1, 1));
  const veinMesh = new THREE.Mesh(veinGeo, vein);
  veinMesh.scale.set(rand(0.5, 0.85) * scale, 0.05 * scale, rand(0.15, 0.3) * scale);
  veinMesh.position.set(rand(-0.3, 0.3) * scale, rand(0.25, 0.5) * scale, rand(-0.3, 0.3) * scale);
  veinMesh.rotation.set(rand(-0.3, 0.3), rand(0, 3), rand(-0.2, 0.2));
  g.add(veinMesh);

  g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });  // no castShadow — see header note
  return g;
}

/** A standing shard — crystalline, for turned or arcane ground. */
export function forgeShard(scale = 1, colorHex = 0xc9a0ff) {
  const g = new THREE.Group();
  // ⚠️ CACHED, not allocated per shard. These two lines used to be
  // `new THREE.MeshStandardMaterial` and produced 68 identical copies
  // of each in a single 25-chunk view — see plainMat's note.
  const body = plainMat({
    color: colorHex, rough: 0.15, metal: 0.35,
    emissive: colorHex, emissiveIntensity: 0.35,
  });
  // Near-black, matte stone the crystals erupt from. Keeping everything
  // around the glow this dark is what makes the emissive shards read as
  // a focal point instead of just another bright shape in the group.
  const rock = plainMat({ color: 0x1c1815, rough: 0.95, metal: 0.05 });

  // ⚠️ Shared unit geometry + per-instance scale, the same rule the
  // tree/rock sharing above follows. Baking the size into the
  // constructor is what made every one of these unique and
  // uncacheable.
  const baseGeo = geo('shard-base', () => new THREE.IcosahedronGeometry(0.5, icoDetail(0)));
  const base = new THREE.Mesh(baseGeo, rock);
  base.scale.set(rand(0.8, 1.1) * scale, rand(0.35, 0.5) * scale, rand(0.8, 1.1) * scale);
  base.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
  base.position.y = 0.12 * scale;
  g.add(base);

  const rubbleGeo = geo('shard-rubble', () => new THREE.IcosahedronGeometry(0.18, icoDetail(0)));
  for (let i = 0; i < 2; i++) {
    const r = new THREE.Mesh(rubbleGeo, rock);
    r.position.set(rand(-0.55, 0.55) * scale, 0.06 * scale, rand(-0.55, 0.55) * scale);
    r.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    r.scale.setScalar(rand(0.6, 1.0) * scale);
    g.add(r);
  }

  // ⚠️ ONE unit cone, scaled per instance. The old code built a fresh
  // ConeGeometry per spike — 3 per shard, 204 across a 25-chunk view —
  // purely to vary radius and height, both of which a non-uniform
  // mesh.scale reproduces exactly. Three.js transforms normals
  // correctly under non-uniform scale, so this is visually identical.
  const coneGeo = geo('shard-spike', () => new THREE.ConeGeometry(1, 1, seg(5)));
  for (let i = 0; i < 3; i++) {
    const h = rand(1.0, 2.4) * scale;
    const r = rand(0.12, 0.3) * scale;
    const shard = new THREE.Mesh(coneGeo, body);
    shard.scale.set(r, h, r);
    shard.position.set(rand(-0.4, 0.4) * scale, h / 2 + 0.1 * scale, rand(-0.4, 0.4) * scale);
    shard.rotation.set(rand(-0.25, 0.25), rand(0, 3), rand(-0.25, 0.25));
    g.add(shard);
  }

  const light = new THREE.PointLight(colorHex, 0.8, 7);
  light.position.y = 1.2 * scale;
  g.add(light);

  g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
  return g;
}

// ── RUINS ─────────────────────────────────────────────────

/**
 * A broken structure. The old "village" was boxes with flat box roofs;
 * this is masonry that has already lost an argument with the Fracture,
 * which fits the fiction and hides the fact that we have no models.
 */
export function forgeRuin(scale = 1) {
  const g = new THREE.Group();
  const stone = mat('ruin', { color: 0x3c382f, rough: 0.95 });
  const dark  = mat('ruindark', { color: 0x221e1a, rough: 1.0 });
  // Old ironwork, tarnished — the one part of the ruin that isn't dead
  // stone, so the eye has a material contrast to catch on.
  const brace = mat('ruin-brace', { color: 0x4a3a1e, rough: 0.45, metal: 0.6 });
  // A single hairline fissure with a faint arcane bleed — the ruin lost
  // its argument with the Fracture, and this is where it never healed.
  const crackMat = plainMat({
    color: 0x2a1018, rough: 0.6, metal: 0.0,
    emissive: 0x7a1f3a, emissiveIntensity: 0.45,
  });

  // Plinth
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2 * scale, 3.6 * scale, 0.5 * scale, seg(24)), dark);
  base.position.y = 0.25 * scale;
  g.add(base);

  // Broken columns at uneven heights — the silhouette is the point.
  const count = 5 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const h = rand(1.2, 4.2) * scale;
    // ⚠️ "Model revision of everything": the sculpted fluted column
    // (rendering/Sculpt.js — slipped drums, jagged break) rather than a
    // plain cylinder. Its own plinth sits on the platform.
    const col = sculptLOD(() => pillarGeometry(), stone, 4 * scale);
    col.scale.set(4.2 * scale, h / 0.9, 4.2 * scale);
    col.position.set(Math.cos(a) * 2.6 * scale, 0.5 * scale, Math.sin(a) * 2.6 * scale);
    col.rotation.y = rand(0, 6.28);
    col.rotation.z = rand(-0.06, 0.06);
    g.add(col);

    // A surviving iron collar, cinched partway up a column.
    if (Math.random() < 0.35) {
      const collar = new THREE.Mesh(
        new THREE.TorusGeometry(0.42 * scale, 0.05 * scale, seg(4), seg(8)), brace
      );
      collar.position.set(Math.cos(a) * 2.6 * scale, h * rand(0.25, 0.6), Math.sin(a) * 2.6 * scale);
      collar.rotation.x = Math.PI / 2;
      collar.rotation.z = rand(-0.1, 0.1);
      g.add(collar);
    }

    // Some keep a fragment of the lintel they used to hold up.
    if (Math.random() < 0.45) {
      const cap = new THREE.Mesh(
        roundedBox(1.1 * scale, 0.3 * scale, 0.7 * scale, 0.05, 1), stone
      );
      cap.position.set(Math.cos(a) * 2.6 * scale, h + 0.55 * scale, Math.sin(a) * 2.6 * scale);
      cap.rotation.y = a + rand(-0.3, 0.3);
      cap.rotation.z = rand(-0.2, 0.2);
      g.add(cap);
    }
  }

  // Fallen rubble
  for (let i = 0; i < 4; i++) {
    const r = sculptLOD(() => rubbleGeometry(i % 3), stone, scale);
    r.scale.setScalar(rand(0.5, 1.0) * scale);
    r.position.set(rand(-3.4, 3.4) * scale, 0.45 * scale, rand(-3.4, 3.4) * scale);
    r.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    g.add(r);
  }

  // The fissure — low and easy to miss unless you're close.
  const crack = new THREE.Mesh(
    roundedBox(rand(0.4, 0.8) * scale, 0.06 * scale, 0.12 * scale, 0.05, 1), crackMat
  );
  crack.position.set(rand(-2.4, 2.4) * scale, 0.08 * scale, rand(-2.4, 2.4) * scale);
  crack.rotation.y = rand(0, 3);
  g.add(crack);

  g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });  // no castShadow — see header note
  return mergeStatic(g);
}

/** A monolith — a single leaning slab. Cheap landmark, strong read. */
export function forgeMonolith(scale = 1) {
  // ⚠️ "Model revision of everything": a dressed standing stone sculpted
  // in one piece (rendering/Sculpt.js) — pitched top, a rune band and
  // glyphs cut into the face, a flake off one edge — instead of a
  // cylinder with an octahedron on it. The rune still bleeds light.
  const g = new THREE.Group();
  const stone = mat('mono', { color: 0x28241f, rough: 0.9, metal: 0.1 });
  const base  = mat('mono-base', { color: 0x1a1613, rough: 1.0 });
  const runeMat = plainMat({ color: 0x2a1030, rough: 0.4, metal: 0.1, emissive: 0x7a2a5a, emissiveIntensity: 0.5 });
  const h = rand(6, 11) * scale, v = rnd() % 3;
  const slab = sculptLOD(() => monolithGeometry(v), stone, h);
  slab.scale.set(h * 0.95, h, h * 0.95);
  slab.rotation.set(rand(-0.06, 0.06), rand(0, 3), rand(-0.06, 0.06));
  slab.position.y = -0.1 * scale;
  g.add(slab);
  // A glowing shard set into the rune band.
  const rune = new THREE.Mesh(new THREE.OctahedronGeometry(0.14 * scale, 0), runeMat);
  rune.position.set(0, h * 0.42, h * 0.08);
  slab.add(rune); rune.position.divideScalar(h); rune.scale.divideScalar(h);
  for (let i = 0; i < 3; i++) {
    const r = sculptLOD(() => rubbleGeometry(i), i ? stone : base, scale);
    r.position.set(rand(-1.8, 1.8) * scale, 0.1 * scale, rand(-1.8, 1.8) * scale);
    r.rotation.set(rand(-0.3, 0.3), rand(0, 3), rand(-0.3, 0.3));
    r.scale.setScalar(rand(0.5, 0.9) * scale);
    g.add(r);
  }
  g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });  // no castShadow — see header note
  return mergeStatic(g);
}

// ── ARCHITECTURE ──────────────────────────────────────────
//
// Everything below builds fortification/tomb-scale pieces from
// primitives + the same HD triplanar `stonewall` material forgeMonolith
// already uses (role 'mono' in PROP_SURFACES) — not a modular kit,
// because no such kit exists in the local assets or the fetched Poly
// Haven set. This is the same doctrine as the rest of this file:
// procedural geometry, real texture. It's how a "castle" gets built
// without inventing an asset that isn't actually there.
//
// Unlike the small clutter above, these DO cast shadows — see this
// file's header for why clutter doesn't (numerous, cheap, low
// payoff). Walls and towers are the opposite: a handful of instances,
// and a wall with no shadow reads as a cardboard cutout instead of
// something standing in the light.
//
// Deliberately built as BROKEN fragments — arcs and isolated towers,
// never a sealed ring. Two reasons: it matches the "ancient,
// wound-worn" fortification the lore already describes (Elder Aris:
// "forty years... the Fracture doesn't heal"), and — far more
// important — a sealed wall ring WITH colliders risks trapping the
// player inside or outside the hub if the closure math is ever wrong.
// Broken arcs have no closure to get wrong.

/**
 * One fortification wall segment — a slab with a broken/crenellated
 * top edge, not a smooth architectural panel.
 */
// ══════════════════════════════════════════════════════════
// ARCHITECTURAL VOCABULARY
//
// Owner: *"I am not happy with the 3d models, they are still the
// same!!"* — and they were right about the buildings. A keep was a
// slab with square teeth on top; a tower was a cylinder wearing a
// cone. Neither had an opening, a roof edge, a base, or any depth in
// the wall, so both read as primitives at every distance.
//
// The fix is not more polygons, it is the FIVE THINGS that actually
// say "building" to an eye:
//
//   1. A BASE. A wall that meets the ground at a right angle looks
//      dropped on it. A battered plinth looks founded in it.
//   2. AN OPENING. One door and a few windows do more for "this is a
//      structure" than any amount of surface. Dark recesses read as
//      openings without needing a boolean subtract, which is far too
//      expensive to do per prop at chunk-build time.
//   3. A CORNICE / STRING COURSE. A horizontal line partway up breaks
//      the silhouette into storeys and gives scale. Without it a tower
//      could be 4m or 40m.
//   4. AN OVERHANGING ROOF EDGE. A roof flush with the wall reads as
//      a cone balanced on a tube. An eave that projects casts a shadow
//      line and reads as built.
//   5. VERTICAL RELIEF — buttresses, pilasters, corner quoins. These
//      are what stop a flat face being a flat face.
//
// ⚠️ Every helper here takes a MATERIAL and returns meshes into a
// caller's group, and every geometry goes through `geo()` so the
// shared-geometry cache still applies. A building assembled from
// per-instance geometry would undo the material/geometry dedup pass
// (100 shader programs -> 20) that immediately precedes this one.
// ══════════════════════════════════════════════════════════

/**
 * A dark recess that reads as an opening.
 *
 * ⚠️ NOT a boolean subtract. Cutting real holes needs CSG per prop at
 * chunk-build time, which is exactly the cost the chunk-build pass
 * exists to avoid. A near-black inset panel behind a surround reads as
 * a hole at every distance the player will ever see it from, for three
 * cheap boxes.
 */
function _opening(g, mat, dark, { w, h, depth = 0.18, x = 0, y = 0, z = 0, ry = 0, sill = false, arch = false }) {
  const hole = new THREE.Mesh(geo(`op-hole-${w}-${h}`, () => new THREE.BoxGeometry(w, h, depth)), dark);
  hole.position.set(x, y, z);
  hole.rotation.y = ry;
  g.add(hole);
  // The surround — a frame slightly proud of the wall, so the opening
  // has an edge that catches light instead of being a painted rectangle.
  const jambGeo = geo(`op-jamb-${h}`, () => new THREE.BoxGeometry(0.12, h + 0.16, 0.14));
  for (const sx of [-1, 1]) {
    const jamb = new THREE.Mesh(jambGeo, mat);
    jamb.position.set(x + Math.cos(ry) * sx * (w / 2 + 0.06), y, z - Math.sin(ry) * sx * (w / 2 + 0.06));
    jamb.rotation.y = ry;
    g.add(jamb);
  }
  const lintel = new THREE.Mesh(geo(`op-lintel-${w}`, () => new THREE.BoxGeometry(w + 0.34, 0.16, 0.2)), mat);
  lintel.position.set(x, y + h / 2 + 0.1, z);
  lintel.rotation.y = ry;
  g.add(lintel);
  if (arch) {
    // Voussoirs — a ring of wedge blocks over the opening. The single
    // strongest "this was built by people" cue there is, and it is the
    // difference between a doorway and a rectangle.
    const vGeo = geo('op-voussoir', () => new THREE.BoxGeometry(0.2, 0.26, 0.22));
    const R = w * 0.62;
    for (let i = 0; i <= 6; i++) {
      const a = Math.PI * (i / 6);
      const v = new THREE.Mesh(vGeo, mat);
      v.position.set(x + Math.cos(a) * R * Math.cos(ry), y + h / 2 + Math.sin(a) * R, z - Math.cos(a) * R * Math.sin(ry));
      v.rotation.set(0, ry, a - Math.PI / 2);
      g.add(v);
    }
  }
  if (sill) {
    const s = new THREE.Mesh(geo(`op-sill-${w}`, () => new THREE.BoxGeometry(w + 0.4, 0.12, 0.3)), mat);
    s.position.set(x, y - h / 2 - 0.06, z);
    s.rotation.y = ry;
    g.add(s);
  }
}

/**
 * A projecting horizontal band — string course, cornice or plinth cap.
 * `sides` 0 means round (a cylinder); anything else is an n-gon, so the
 * same helper serves round towers and square keeps.
 */
function _band(g, mat, { r, y, h = 0.3, sides = 0, taperTo = null }) {
  const rt = taperTo === null ? r : taperTo;
  const key = `band-${r}-${h}-${sides}-${rt}`;
  const gm = geo(key, () => new THREE.CylinderGeometry(rt, r, h, sides || seg(12), 1));
  const band = new THREE.Mesh(gm, mat);
  band.position.y = y;
  if (sides === 4) band.rotation.y = Math.PI / 4;
  g.add(band);
  return band;
}

/**
 * A ring of corbels under a parapet.
 *
 * This is the detail that most reliably reads as "castle" rather than
 * "cylinder" — the machicolation line where the walkway oversails the
 * wall. Cheap: n small blocks on a circle.
 */
function _corbelRing(g, mat, { r, y, count = 12, size = 0.22 }) {
  const cg = geo(`corbel-${size}`, () => new THREE.BoxGeometry(size, size * 1.3, size * 2));
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const c = new THREE.Mesh(cg, mat);
    c.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    c.rotation.y = -a;
    g.add(c);
  }
}

/**
 * Crenellations with real merlons AND embrasures.
 *
 * ⚠️ The old version scattered identical boxes on a circle and skipped
 * 25% at random to look "broken". Random gaps read as missing geometry,
 * not as damage — damage has a direction and a cause. These are evenly
 * spaced (that is what makes them read as built) and the BREAKAGE is a
 * height variation on a few of them instead.
 */
function _crenellation(g, mat, { r, y, count = 12, w = 0.5, h = 0.62, thick = 0.34, ruin = 0 }) {
  const mg = geo(`merlon-${w}-${h}-${thick}`, () => new THREE.BoxGeometry(w, h, thick));
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const m = new THREE.Mesh(mg, mat);
    // Broken teeth are SHORTER, not absent. A snapped merlon still has
    // a stump; a missing one is a hole in the model.
    const broken = ruin > 0 && ((i * 7919) % 100) / 100 < ruin;
    const sy = broken ? 0.35 + (((i * 104729) % 40) / 100) : 1;
    m.scale.y = sy;
    m.position.set(Math.cos(a) * r, y + (h * sy) / 2, Math.sin(a) * r);
    m.rotation.y = -a;
    g.add(m);
  }
}

/** A tapered buttress standing against a wall face. */
function _buttress(g, mat, { x, z, ry = 0, w = 0.7, d = 0.9, h = 4 }) {
  const b = new THREE.Mesh(geo(`butt-${w}-${d}-${h}`,
    () => new THREE.CylinderGeometry(w * 0.55, w, h, 4, 1)), mat);
  b.position.set(x, h / 2, z);
  b.rotation.y = ry + Math.PI / 4;
  b.scale.z = d / w;
  g.add(b);
  // A weathering slope on top, so the buttress sheds water like a real
  // one instead of ending in a flat shelf.
  const cap = new THREE.Mesh(geo(`butt-cap-${w}`, () => new THREE.ConeGeometry(w * 0.62, w * 0.9, 4)), mat);
  cap.position.set(x, h + w * 0.4, z);
  cap.rotation.y = ry + Math.PI / 4;
  g.add(cap);
}

export function forgeWallSegment(length = 6, height = 4, scale = 1) {
  // ⚠️ "Model revision of everything": coursed ASHLAR — individual
  // squared blocks in running bond, each a little out of true, the top
  // courses broken away unevenly — merged into ONE geometry per wall
  // so it costs a single draw call. It was one smooth slab with boxes
  // on top, which no texture can make read as built.
  const g = new THREE.Group();
  const stone = mat('mono', { color: 0x221e19, rough: 0.93, metal: 0.05 });
  const L = length * scale, H = height * scale, T = 0.9 * scale;
  const key = `ashlar:${length}:${height}:${scale}:${rnd() % 4}`;
  const wallGeo = geo(key, () => {
    const parts = [], ch = 0.55 * scale, rows = Math.max(2, Math.round(H / ch));
    const block = roundedBox(1, 1, 1, 0.08, 1);
    const seedR = rnd();
    let sr = seedR; const R = () => ((sr = (sr * 16807) % 2147483647) / 2147483647);
    // The broken top: a ragged line, lower toward one end.
    const topAt = (x) => H * (0.82 + 0.18 * Math.sin((x / L) * 2.4 + seedR) ) + 0.6 * scale;
    for (let r = 0; r < rows; r++) {
      const y = (r + 0.5) * (H / rows), off = (r % 2) * 0.5;
      let x = -L / 2 - off * 1.1 * scale;
      while (x < L / 2) {
        const bw = (0.9 + R() * 0.6) * scale;
        const x0 = Math.max(x, -L / 2), x1 = Math.min(x + bw, L / 2);
        if (x1 - x0 > 0.15 * scale && y < topAt((x0 + x1) / 2)) {
          const b = block.clone();
          b.scale((x1 - x0) * 0.97, (H / rows) * 0.95, T * (0.94 + R() * 0.08));
          b.rotateZ((R() - 0.5) * 0.03); b.rotateY((R() - 0.5) * 0.02);
          b.translate((x0 + x1) / 2, y, (R() - 0.5) * 0.05 * scale);
          parts.push(b);
        }
        x += bw;
      }
    }
    return mergeGeometries(parts.map(q => q.index ? q.toNonIndexed() : q));
  });
  g.add(new THREE.Mesh(wallGeo, stone));
  // Fallen blocks at its foot.
  for (let i = 0; i < 2; i++) {
    const r = sculptLOD(() => rubbleGeometry(i), stone, scale);
    r.scale.setScalar(rand(0.6, 1.0) * scale);
    r.position.set(rand(-L / 2, L / 2), 0.25 * scale, (i ? 1 : -1) * rand(0.9, 1.5) * scale);
    r.rotation.y = rand(0, 3);
    g.add(r);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return mergeStatic(g);
}

/**
 * A corner/gate tower — cylindrical, tapered, one conical cap, one
 * emissive slit near the top standing in for torchlight seen from
 * outside. The single glow is deliberate — see the "emissive focal
 * point per creature/prop, not uniform brightness" convention this
 * project already follows for creatures and MegaKit props.
 */
export function forgeTower(height = 9, radius = 2.2, scale = 1) {
  const g = new THREE.Group();
  const stone = mat('mono', { color: 0x241f1a, rough: 0.9, metal: 0.08 });
  const roofMat = mat('mono-base', { color: 0x161310, rough: 1.0 });
  const dark = plainMat({ color: 0x080706, rough: 1.0 });
  const glowMat = plainMat({
    color: 0x1a1008, rough: 0.6, metal: 0.0, flat: false,
    emissive: 0xd8862a, emissiveIntensity: 1.4,
  });

  const h = height * scale, r = radius * scale;

  // ── Plinth: a battered base, wider than the shaft ──
  // A tower that meets the ground at the same radius it has at the top
  // looks like a pipe pushed into the dirt.
  const plinthH = h * 0.10;
  _band(g, stone, { r: r * 1.22, y: plinthH / 2, h: plinthH, taperTo: r * 1.06 });

  // ── Shaft, tapering ──
  const bodyGeo = pick(pool(`tower-${radius}`,
    () => new THREE.CylinderGeometry(r * 0.82, r, h, seg(10), seg(3)),
    { amount: 0.035, freq: 0.7, octaves: 2 }), rnd());
  const body = new THREE.Mesh(bodyGeo, stone);
  body.position.y = h / 2;
  g.add(body);

  // ── String course at the storey line ──
  // Gives the tower a scale it did not have: without a horizontal
  // break the eye cannot tell a 4m turret from a 40m keep tower.
  _band(g, stone, { r: r * 0.94, y: h * 0.52, h: 0.26 * scale, taperTo: r * 0.96 });

  // ── Openings ──
  // A door at the foot, so it is somewhere people went into, and
  // arrow slits up the shaft rather than one lonely glowing strip.
  _opening(g, stone, dark, {
    w: 0.9 * scale, h: 1.9 * scale, depth: 0.3 * scale,
    x: 0, y: plinthH + 0.95 * scale, z: r * 0.96, arch: true,
  });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.7;
    const yy = h * (0.34 + i * 0.18);
    const slit = new THREE.Mesh(geo('tower-slit',
      () => new THREE.BoxGeometry(0.16, 0.86, 0.16)), dark);
    slit.position.set(Math.cos(a) * r * 0.93, yy, Math.sin(a) * r * 0.93);
    slit.rotation.y = -a;
    slit.scale.setScalar(scale);
    g.add(slit);
    // The splay — a shallow surround, so the slit is cut INTO the wall
    // rather than painted on it.
    const splay = new THREE.Mesh(geo('tower-splay',
      () => new THREE.BoxGeometry(0.42, 1.12, 0.1)), stone);
    splay.position.set(Math.cos(a) * r * 0.9, yy, Math.sin(a) * r * 0.9);
    splay.rotation.y = -a;
    splay.scale.setScalar(scale);
    g.add(splay);
  }

  // The one lit window, kept — house rule is a single emissive focus.
  const lit = new THREE.Mesh(roundedBox(0.18 * scale, 0.9 * scale, 0.1 * scale, 0.05, 1), glowMat);
  lit.position.set(0, h * 0.72, r * 0.99);
  g.add(lit);

  // ── The parapet: corbels, then an oversailing walkway, then teeth ──
  // This three-part edge is what makes a cylinder read as a tower.
  _corbelRing(g, stone, { r: r * 0.9, y: h - 0.34 * scale, count: 12, size: 0.2 * scale });
  _band(g, stone, { r: r * 1.06, y: h + 0.08 * scale, h: 0.24 * scale });
  _crenellation(g, stone, {
    r: r * 0.94, y: h + 0.2 * scale, count: 11,
    w: 0.5 * scale, h: 0.62 * scale, thick: 0.32 * scale, ruin: 0.22,
  });

  // ── Roof with a real eave ──
  // Wider than the shaft, so it throws a shadow line instead of
  // sitting flush like a cone balanced on a tube.
  const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.18, h * 0.34, seg(10)), roofMat);
  roof.position.y = h + 0.34 * scale + (h * 0.17);
  g.add(roof);
  const fascia = new THREE.Mesh(geo(`fascia-${radius}`,
    () => new THREE.CylinderGeometry(r * 1.2, r * 1.14, 0.16, seg(10))), roofMat);
  fascia.position.y = h + 0.4 * scale;
  g.add(fascia);
  // A finial, because a roof that just stops reads unfinished.
  const finial = new THREE.Mesh(geo('finial',
    () => new THREE.OctahedronGeometry(0.22, 0)), stone);
  finial.position.y = h + 0.34 * scale + h * 0.34;
  finial.scale.setScalar(scale);
  g.add(finial);

  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return mergeStatic(g);
}

/**
 * A leaning grave-slab. Cheap, cast in numbers to read as a graveyard
 * — see _buildGraveyard in ChunkManager.js, the only call site that
 * places several of these together.
 */
/**
 * A Descent Gate — the world-side handle on an element dungeon.
 *
 * Two dark uprights and a lintel (a trilithon, the oldest "this is a
 * doorway" shape there is) with an element-coloured sheet of light
 * standing in the opening. Deliberately NOT a hole in the ground: a
 * Descent is a region that changes around you, not a place you fall
 * into (see data/descents.js), and a doorway you walk THROUGH says
 * that better than a pit does.
 *
 * Follows the house rule from HANDOFF §3 — exactly one emissive focal
 * point (the sheet), everything else near-black stone. The stone is
 * NOT tinted to the element; only the light is, which is what makes
 * eleven different Gates read as the same structure with different
 * things behind it rather than as eleven coloured props.
 *
 * @param {number} colorHex the element's colour
 * @param {number} scale
 */
export function forgeDescentGate(colorHex, scale = 1) {
  // ⚠️ "Model revision of everything": two sculpted piers (coursed,
  // moulded base and capital, a rune channel cut down each) under a
  // real ARCH of wedge-shaped voussoirs, instead of three rounded boxes.
  // The sheet keeps its name (`gate_sheet`) and its light; both still
  // fill the opening, now arch-topped.
  const g = new THREE.Group();
  const stone = mat('gatestone', { color: 0x141210, rough: 0.95 });
  const H = 4.6 * scale, W = 0.55 * scale, GAP = 2.4 * scale;
  const P = H - GAP / 2;   // pier height: the arch springs from there
  for (const side of [-1, 1]) {
    const post = sculptLOD(() => gatePostGeometry(), stone, H);
    post.scale.set(W / 0.12, P, W / 0.12);
    post.position.set(side * (GAP / 2 + W / 2), 0, 0);
    g.add(post);
  }
  const R = GAP / 2 + W * 0.02, N = 9, thick = W * 1.05, D = W * 1.35;
  for (let i = 0; i < N; i++) {
    const a0 = Math.PI * i / N + 0.008, a1 = Math.PI * (i + 1) / N - 0.008;
    const vg = geo(`gatevous:${i}`, () => {
      const sh = new THREE.Shape(), r0 = 1, r1 = 1 + (thick / R) * (i === (N - 1) / 2 ? 1.25 : 1);
      sh.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
      sh.lineTo(Math.cos(a0) * r1, Math.sin(a0) * r1);
      sh.absarc(0, 0, r1, a0, a1, false);
      sh.lineTo(Math.cos(a1) * r0, Math.sin(a1) * r0);
      sh.absarc(0, 0, r0, a1, a0, true);
      const eg = new THREE.ExtrudeGeometry(sh, { depth: D / R, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1, curveSegments: 3 });
      eg.translate(0, 0, -D / R / 2);
      return eg;
    });
    const m = new THREE.Mesh(vg, stone);
    m.scale.setScalar(R);
    m.position.y = P;
    g.add(m);
  }
  // The sheet: arch-topped, filling exactly the opening.
  const shape = new THREE.Shape();
  shape.moveTo(-GAP / 2, 0); shape.lineTo(GAP / 2, 0); shape.lineTo(GAP / 2, P);
  shape.absarc(0, P, GAP / 2, 0, Math.PI, false); shape.lineTo(-GAP / 2, 0);
  const sheet = new THREE.Mesh(
    new THREE.ShapeGeometry(shape, 12),
    plainMat({
      basic: true,
      color: colorHex, transparent: true, opacity: 0.28,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false,
    }),
  );
  sheet.renderOrder = 2;
  sheet.name = 'gate_sheet';
  g.add(sheet);

  const light = new THREE.PointLight(colorHex, 1.6, 14, 2);
  light.position.y = H * 0.5;
  g.add(light);

  g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
  return mergeStatic(g);
}

/**
 * The Sanctuary Keep — an INTACT castle, and the only intact building
 * in the game.
 *
 * Everything else this file forges is broken on purpose: forgeRuin is
 * "masonry that has already lost an argument with the Fracture,"
 * forgeWallSegment has randomly-missing crenellations, the hub's
 * centrepiece used to be a scaled-up ruin. That is correct for the
 * world and it was wrong for the one place the player is supposed to
 * feel safe — a spawn that looks exactly like the wilderness gives the
 * wilderness nothing to be worse than.
 *
 * So: square keep, four corner towers, a lit window on every face, a
 * banner, and no missing teeth anywhere. Warm emissive in the windows
 * rather than a light per window (a dozen real point lights in one
 * building is a shadow-map bill for no visual gain — the braziers
 * below do the actual lighting work).
 */
export function forgeKeep(scale = 1) {
  const g = new THREE.Group();
  const stone = mat('keepstone', { color: 0x6b6355, rough: 0.9 });
  const dark  = mat('keeptrim',  { color: 0x342f28, rough: 0.95 });
  // The one emissive per this file's house rule — but here it is the
  // windows collectively, because a keep with a single lit window
  // reads as abandoned, which is the opposite of the point.
  const glow  = plainMat({
    color: 0xffc978, emissive: 0xffb45a, emissiveIntensity: 1.4,
    rough: 0.6, flat: false, toneMapped: true,
  });

  const W = 11 * scale, H = 13 * scale, D = 11 * scale;

  // Rounded + lightly weathered, not a raw box. See GeoForge.roundedBox
  // — a sharp 90° edge is the strongest "voxel prototype" cue there is,
  // and a few-centimetre chamfer costs nothing and reads as cut stone.
  const body = new THREE.Mesh(weather(roundedBox(W, H, D, 0.16, 2), { amount: 0.025, offset: 3 }), stone);
  body.position.y = H / 2;
  g.add(body);

  // A string course band — the single cheapest thing that stops a box
  // reading as a box.
  const band = new THREE.Mesh(roundedBox(W * 1.06, 0.5 * scale, D * 1.06, 0.08, 1), dark);
  band.position.y = H * 0.62;
  g.add(band);

  // Corner towers, taller than the body so the silhouette has a
  // profile from every angle rather than only from the corners.
  const TR = 2.1 * scale, TH = H * 1.22;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    // 10 sides read as a decagonal prism at this radius; 22 reads as a
    // round tower. The cost is trivial — four towers, one geometry each.
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(TR, TR * 1.1, TH, seg(22)), stone);
    tower.position.set(sx * W / 2, TH / 2, sz * D / 2);
    g.add(tower);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(TR * 1.3, 3.2 * scale, seg(22)), dark);
    cap.position.set(sx * W / 2, TH + 1.6 * scale, sz * D / 2);
    g.add(cap);
    // Full crenellations — no gaps. See this function's doc comment.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const m = new THREE.Mesh(roundedBox(0.5 * scale, 0.8 * scale, 0.5 * scale, 0.05, 1), stone);
      m.position.set(sx * W / 2 + Math.cos(a) * TR, TH + 0.4 * scale, sz * D / 2 + Math.sin(a) * TR);
      g.add(m);
    }
  }

  // Lit windows on all four faces, two storeys.
  for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    for (let row = 0; row < 2; row++) {
      for (const off of [-2.6, 0, 2.6]) {
        const win = new THREE.Mesh(roundedBox(0.7 * scale, 1.5 * scale, 0.7 * scale, 0.06, 1), glow);
        const px = nx !== 0 ? nx * (W / 2 + 0.05) : off * scale;
        const pz = nz !== 0 ? nz * (D / 2 + 0.05) : off * scale;
        win.position.set(px, (4.2 + row * 4.0) * scale, pz);
        g.add(win);
      }
    }
  }

  // Door — an actual opening on the south face, dark rather than a
  // hole, since there is no interior to see into.
  const door = new THREE.Mesh(roundedBox(2.4 * scale, 3.6 * scale, 0.4 * scale, 0.08, 1), dark);
  door.position.set(0, 1.8 * scale, D / 2 + 0.1);
  g.add(door);

  // ── Relief ──
  // A prism with windows painted on still reads as a prism. What makes
  // a building look built is depth ACROSS the facade: a plinth it sits
  // on, buttresses breaking the wall into bays, a stringer over the
  // door, and steps up to it. All cheap boxes, all catching their own
  // shadow, and together they do more for "this is architecture" than
  // any amount of texture on a flat wall.

  // Plinth — the building meets the ground instead of stopping at it.
  const plinth = new THREE.Mesh(roundedBox(W * 1.14, 0.9 * scale, D * 1.14, 0.1, 1), dark);
  plinth.position.y = 0.45 * scale;
  g.add(plinth);

  // Buttresses, two per face, breaking each wall into three bays.
  for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    for (const off of [-3.4, 3.4]) {
      const b = new THREE.Mesh(roundedBox(0.9 * scale, H * 0.78, 0.7 * scale, 0.06, 1), stone);
      const px = nx !== 0 ? nx * (W / 2 + 0.3) : off * scale;
      const pz = nz !== 0 ? nz * (D / 2 + 0.3) : off * scale;
      b.position.set(px, H * 0.39, pz);
      // Faces on the X sides need turning, or the buttress is edge-on
      // to the wall it is supposed to be bracing.
      if (nx !== 0) b.rotation.y = Math.PI / 2;
      g.add(b);
    }
  }

  // A hood over the door, and steps up to it.
  const hood = new THREE.Mesh(roundedBox(3.6 * scale, 0.35 * scale, 1.0 * scale, 0.06, 1), dark);
  hood.position.set(0, 3.9 * scale, D / 2 + 0.45);
  g.add(hood);
  for (let i = 0; i < 3; i++) {
    const step = new THREE.Mesh(roundedBox((3.4 - i * 0.4) * scale, 0.22 * scale, (1.5 - i * 0.35) * scale, 0.04, 1), stone);
    step.position.set(0, (0.11 + i * 0.22) * scale, D / 2 + (1.0 - i * 0.3) * scale);
    g.add(step);
  }

  // ── A ROOF ──
  // ⚠️ The main block had a FLAT TOP. Four corner turrets with conical
  // caps around a flat slab reads as a wall enclosing nothing — the
  // silhouette that says "keep" is a pitched mass rising BETWEEN the
  // turrets. A parapet walkway on corbels, then a hipped roof.
  _corbelRing(g, dark, { r: W * 0.62, y: H - 0.5 * scale, count: 20, size: 0.26 * scale });
  const parapet = new THREE.Mesh(roundedBox(W * 1.08, 0.7 * scale, D * 1.08, 0.08, 1), stone);
  parapet.position.y = H + 0.1 * scale;
  g.add(parapet);
  // A 4-sided cone IS a hipped roof, and it costs exactly one mesh.
  const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(W * 0.78, H * 0.34, 4), dark);
  keepRoof.position.y = H + H * 0.17 + 0.45 * scale;
  keepRoof.rotation.y = Math.PI / 4;
  g.add(keepRoof);
  const ridge = new THREE.Mesh(geo('keep-finial', () => new THREE.OctahedronGeometry(0.4, 0)), stone);
  ridge.position.y = H + H * 0.34 + 0.55 * scale;
  ridge.scale.setScalar(scale);
  g.add(ridge);

  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return mergeStatic(g);
}

/**
 * A lit brazier. THE thing that makes the hub read as safe rather than
 * merely as un-ruined — a warm point light at head height, repeated
 * around the plaza, is what separates "a town at night" from "some
 * buildings in the dark."
 *
 * Real PointLight, unlike the keep's windows: these are doing the
 * actual lighting work, and there are few enough of them to afford it.
 */
// ══════════════════════════════════════════════════════════
// GODGRAVE — the bones of the thing that died here
//
// Owner: *"replicate all the biomes of the realm in Shadow Slave like
// the Hollow Mountains, Godgrave, etc."*
//
// Godgrave is the setting's most recognisable place and it is one
// image: an endless pale plain with the SKELETON OF A GOD coming out
// of it. Ribs that arc overhead like architecture, vertebrae standing
// in a broken line to the horizon, a skull the size of a hill.
//
// ⚠️ THE SCALE IS THE ENTIRE POINT. These default to 18–40 world units
// — a rib arch is taller than the Sanctuary keep (13). Built at prop
// scale they would read as animal bones in a desert, which is a
// completely different and much smaller idea. If a future pass makes
// these "fit in better", it has removed the reason they exist.
//
// ⚠️ Geometry goes through `geo()` and materials through `plainMat()`,
// like everything else here — a colossal prop is still a prop, and the
// dedup pass (174 duplicate materials → 42) applies to it.
// ══════════════════════════════════════════════════════════

/** Bone: pale, matte, faintly warm against this biome's grey sky. */
// ⚠️ Albedo, not "how pale it should look". 0xbdb49c is ~0.5 linear
// reflectance — chalk — and under a physical sun it blew to white.
// Weathered bone sits nearer 0.3; the texture then carries the cracks.
function _boneMat() {
  return mat('bone', { color: 0x9a9080, rough: 0.88, metal: 0.0, flat: false });
}
function _boneDarkMat() {
  return mat('bonedark', { color: 0x5a5448, rough: 0.95, metal: 0.0, flat: false });
}

/**
 * A rib, arcing out of the ground and back toward it.
 *
 * ⚠️ Built from segments along a real arc rather than as one bent
 * primitive: Three has no curved-box, and a cylinder rotated into a
 * curve is the difference between a rib and a pipe. Segments taper
 * toward the tip, which is what makes it read as bone rather than as
 * scaffolding.
 */
export function forgeRib(height = 22, scale = 1, lean = 0) {
  // ⚠️ "Model revision of everything": a single sculpted bone now
  // (rendering/Sculpt.js) — oval in section, swollen at the head,
  // split and pitted — not nine cylinders aimed along the arc. Same
  // arc, same size, same lean.
  const g = new THREE.Group();
  const H = height * scale;
  const m = sculptLOD(() => ribGeometry(), _boneMat(), H);
  m.scale.setScalar(H);
  g.add(m);
  g.rotation.z = lean;
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return mergeStatic(g);
}

/**
 * A vertebra — one bone of the spine, standing where it fell.
 * These are scattered in LINES by ChunkManager so they read as a
 * buried spine rather than as boulders.
 */
export function forgeVertebra(size = 6, scale = 1) {
  // Sculpted (rendering/Sculpt.js): centrum, neural arch over the canal,
  // a raked spine and the transverse wings, as one weathered bone.
  const g = new THREE.Group();
  const S = size * scale;
  const m = sculptLOD(() => vertebraGeometry(), _boneMat(), S);
  m.scale.setScalar(S);
  m.rotation.y = Math.random() * Math.PI * 2;
  m.rotation.z = (Math.random() - 0.5) * 0.25;
  m.position.y = -S * 0.06;   // settled into the sand, not resting on it
  g.add(m);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return mergeStatic(g);
}

/**
 * The skull. One per region at most — see ChunkManager.
 *
 * ⚠️ Half-buried by design: it sits with its jaw below the sand line,
 * so the player finds a brow and eye sockets rising out of the ground
 * rather than a complete prop resting on it. A whole skull sitting on
 * the surface reads as a decoration; a buried one reads as geology.
 */
export function forgeGodSkull(size = 26, scale = 1) {
  // Sculpted (rendering/Sculpt.js): vault, brow shelf, cheek arches,
  // deep sockets and nasal cavity, a broken row of fangs at the sand
  // line. Still half-buried — the jaw is below the ground.
  const g = new THREE.Group();
  const S = size * scale;
  const m = sculptLOD(() => skullGeometry(), _boneMat(), S);
  m.scale.setScalar(S);
  m.position.y = -S * 0.06;
  m.rotation.x = -0.08;
  g.add(m);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return mergeStatic(g);
}

// ══════════════════════════════════════════════════════════
// THE REALM'S OTHER FOUR — signature props per biome
//
// ⚠️ A biome flag that nothing reads is worse than no flag, because
// the table REPORTS it as a feature. `hollowed`, `drowned` and
// `deadCity` were declared on their biomes and read by nothing, which
// left three of the five realm biomes as distinctive terrain with
// generic rocks on it. These are the readers.
//
// ⚠️ All four are built at REGIONAL scale, like Godgrave's bones: the
// realm's whole idea is that you are small in it. A cave mouth you can
// walk into is 9 units; a dead statue's legs are 30. If a later pass
// makes these "sit better with the other props", it has removed the
// reason they exist.
// ══════════════════════════════════════════════════════════

/**
 * THE HOLLOW MOUNTAINS — a cave mouth bored into the rock.
 *
 * ⚠️ The darkness is a real, deep, black-capped recess, not a painted
 * disc. A flat dark plane at the mouth reads as a sticker the instant
 * the player approaches at an angle; a cylinder sunk back into the
 * hillside stays dark from every approach and sells depth for two
 * extra meshes.
 */
export function forgeCaveMouth(scale = 1) {
  // ⚠️ "Model revision of everything": one sculpted outcrop with the
  // tunnel bored into it (rendering/Sculpt.js) — ledged strata, a
  // hooded arch — instead of a ring of icosahedra round a black tube.
  // The darkness is still a deep black-capped recess, not a decal.
  const g = new THREE.Group();
  const stone = mat('mono', { color: 0x1e2126, rough: 0.95, metal: 0.05 });
  const black = plainMat({ color: 0x030405, rough: 1.0 });
  const W = 7.0 * scale, H = 9.0 * scale;
  const S = W * 1.9;
  const rock = sculptLOD(() => caveGeometry(), stone, S);
  rock.scale.set(S, H * 1.15, S);
  rock.position.z = -S * 0.12;
  g.add(rock);
  // The dark: an arch-shaped black wall a little way into the bore, so
  // the rim and the first metres of tunnel catch light and then the
  // rock simply ends in nothing. Sized from the sculpt's bore (Sculpt.js
  // caveGeometry: half-width 0.33, springing 0.22, unit-scaled).
  const hw = 0.33 * S * 1.05, spring = 0.22 * H * 1.15, rise = (0.33 / 1.15) * H * 1.15 * 1.05;
  const arch = new THREE.Shape();
  arch.moveTo(-hw, -0.5); arch.lineTo(hw, -0.5); arch.lineTo(hw, spring);
  arch.absellipse(0, spring, hw, rise, 0, Math.PI, false); arch.lineTo(-hw, -0.5);
  const throat = new THREE.Mesh(new THREE.ExtrudeGeometry(arch, { depth: S * 0.5, bevelEnabled: false, curveSegments: 16 }), black);
  throat.position.z = -S * 0.12 - S * 0.72;
  g.add(throat);
  for (let i = 0; i < 4; i++) {
    const r = sculptLOD(() => rubbleGeometry(i % 3), stone, 2 * scale);
    r.position.set(((i * 53) % 100 / 100 - 0.5) * W * 1.3, 0.25 * scale, S * 0.25 + ((i * 29) % 100 / 100) * W * 0.3);
    r.scale.setScalar((0.8 + ((i * 41) % 40) / 40) * scale);
    r.rotation.set(0.2 * i, i * 2, 0);
    g.add(r);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return mergeStatic(g);
}

/** THE HOLLOW MOUNTAINS — a natural arch, the range worn through. */
export function forgeStoneArch(span = 16, scale = 1) {
  // ⚠️ "Model revision of everything": this was eleven cubes set on a
  // curve, which read as a ring of floating boxes. It is a built arch
  // now — two coursed piers and WEDGE-SHAPED voussoirs (each stone an
  // annular sector, fattest at the haunches) locked by a keystone —
  // the one shape that says "masonry" from any distance.
  const g = new THREE.Group();
  const stone = mat('mono', { color: 0x232830, rough: 0.94, metal: 0.05, flat: false });
  const S = span * scale, R = S * 0.5, P = S * 0.35, D = S * 0.16;
  const N = 13;
  for (let i = 0; i < N; i++) {
    const a0 = Math.PI * i / N + 0.006, a1 = Math.PI * (i + 1) / N - 0.006, mid = (a0 + a1) / 2;
    const thick = R * (0.2 + 0.1 * Math.abs(Math.cos(mid))) * (i === (N - 1) / 2 ? 1.15 : 1);
    const vg = geo(`vous:${i}:${N}`, () => {
      const sh = new THREE.Shape(), r0 = 1, r1 = 1 + thick / R;
      sh.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
      sh.lineTo(Math.cos(a0) * r1, Math.sin(a0) * r1);
      sh.absarc(0, 0, r1, a0, a1, false);
      sh.lineTo(Math.cos(a1) * r0, Math.sin(a1) * r0);
      sh.absarc(0, 0, r0, a1, a0, true);
      const eg = new THREE.ExtrudeGeometry(sh, { depth: D / R, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1, curveSegments: 3 });
      eg.translate(0, 0, -D / R / 2);
      return eg;
    });
    const m = new THREE.Mesh(vg, stone);
    m.scale.setScalar(R);
    m.position.y = P;
    // Settled, not set: each stone a hair out of true.
    m.rotation.z = ((i * 37) % 7 - 3) * 0.004;
    m.position.z = ((i * 53) % 5 - 2) * 0.012 * R;
    g.add(m);
  }
  // Piers: courses of squared blocks, each a little irregular.
  const block = geo('arch-block', () => roundedBox(1, 1, 1, 0.06, 1));
  for (const sx of [-1, 1]) {
    const courses = 4, ch = P / courses;
    for (let c = 0; c < courses; c++) {
      const b = new THREE.Mesh(block, stone);
      const w = R * 0.34 * (1 - c * 0.02);
      b.scale.set(w, ch * 0.97, D * 1.1);
      b.position.set(sx * (R + w * 0.45), ch * (c + 0.5), ((c * 31) % 5 - 2) * 0.01 * R);
      b.rotation.y = ((c * 17 + (sx > 0 ? 3 : 0)) % 7 - 3) * 0.01;
      g.add(b);
    }
    // Impost: the cap stone the arch springs from.
    const im = new THREE.Mesh(block, stone);
    im.scale.set(R * 0.42, ch * 0.3, D * 1.3);
    im.position.set(sx * (R + R * 0.15), P - ch * 0.12, 0);
    g.add(im);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return mergeStatic(g);
}

/**
 * THE FORGOTTEN SHORE — the ribs of a wrecked hull.
 *
 * ⚠️ Ribs and a keel, NOT a boat. A recognisable ship reads as a prop
 * someone modelled; a half-buried ribcage of frames reads as something
 * the sea has been taking apart for a long time — and it rhymes
 * deliberately with Godgrave's bones, which is the realm's whole idea
 * at two different scales.
 */
export function forgeWreck(scale = 1) {
  // ⚠️ "Model revision of everything": CURVED frames now. Each rib is a
  // flattened timber swept along the bilge curve of the hull (floor,
  // turn of the bilge, topside), the keel has a rising stem, and a run
  // of strakes survives on one side — still a carcass, not a boat.
  const g = new THREE.Group();
  const wood = mat('deadbark', { color: 0x2a2620, rough: 0.98 });
  const dark = plainMat({ color: 0x14120f, rough: 1.0 });
  const L = 22 * scale;
  const hull = new THREE.Group(); hull.rotation.z = 0.12; g.add(hull);
  // Keel, rising into a stem at the bow.
  const keelCurve = new THREE.CatmullRomCurve3([V(-L * 0.5, 0.6 * scale, 0), V(0, 0.5 * scale, 0), V(L * 0.42, 1.0 * scale, 0), V(L * 0.52, 5.5 * scale, 0)]);
  const keel = new THREE.Mesh(new THREE.TubeGeometry(keelCurve, 24, 0.55 * scale, 5), dark);
  keel.scale.z = 1.4; hull.add(keel);
  const ribGeo = (beam, depth, broken) => {
    const pts = [];
    const n = 7, top = broken ? 0.55 + broken * 0.35 : 1;
    for (let k = 0; k <= n; k++) {
      const t = (k / n) * top, a = t * Math.PI * 0.62;
      pts.push(V(0, depth * (1 - Math.cos(a)) * 1.2 + 0.6 * scale, Math.sin(a) * beam + t * t * beam * 0.15));
    }
    const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.32 * scale, 4);
    return tg;
  };
  for (let i = 0; i < 10; i++) {
    const t = i / 9, x = (t - 0.5) * L * 0.9;
    const beam = (2.8 - Math.pow(Math.abs(t - 0.4) * 1.9, 2) * 1.8) * scale, depth = (5.5 - t * 2.4) * scale;
    for (const side of [-1, 1]) {
      const broken = ((i * 7 + (side > 0 ? 3 : 0)) % 5 === 0) ? ((i * 13) % 3) / 3 : 0;
      const rib = new THREE.Mesh(ribGeo(beam, depth, broken), wood);
      rib.scale.set(1, 1, side);
      rib.position.x = x;
      hull.add(rib);
    }
  }
  // A few strakes still nailed along one side, low down.
  for (let k = 0; k < 3; k++) {
    const pts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8, x = (t - 0.5) * L * 0.7, beam = (2.8 - Math.pow(Math.abs(t - 0.45) * 1.6, 2) * 1.6) * scale; pts.push(V(x, (1.4 + k * 0.9) * scale, beam * (0.55 + k * 0.12))); }
    const strake = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.22 * scale, 4), wood);
    strake.scale.y = 1; hull.add(strake);
  }
  const mast = new THREE.Mesh(geo('wreck-mast', () => new THREE.CylinderGeometry(0.5, 0.66, 1, seg(7))), wood);
  mast.scale.set(1 * scale, 13 * scale, 1 * scale);
  mast.position.set(-L * 0.22, 3.0 * scale, 3.4 * scale);
  mast.rotation.set(0.95, 0.3, 0.25);
  g.add(mast);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return mergeStatic(g);
}

/** THE FORGOTTEN SHORE — a drowned pillar, leaning out of the shallows. */
export function forgeDrownedPillar(height = 11, scale = 1) {
  // Sculpted (rendering/Sculpt.js): fluted drums, the upper two slipped
  // askew, the capital gone to a jagged break, chips out of the flutes.
  const g = new THREE.Group();
  const stone = mat('ruin', { color: 0x33383c, rough: 0.96, flat: false });
  const H = height * scale;
  const m = sculptLOD(() => pillarGeometry(), stone, H);
  m.scale.set(H * 1.1, H, H * 1.1);
  m.rotation.y = Math.random() * Math.PI * 2;
  g.add(m);
  g.rotation.z = 0.16;
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return mergeStatic(g);
}

/**
 * THE DREAMING CITY — a colossal broken statue.
 *
 * ⚠️ LEGS AND A TORSO, never a face. What makes a ruin feel ancient is
 * that the part which would tell you WHO it was is the part that is
 * gone. A complete statue is a monument; a pair of legs on a plinth is
 * a civilisation nobody remembers.
 */
export function forgeBrokenStatue(height = 30, scale = 1) {
  // Sculpted (rendering/Sculpt.js): a stepped plinth, legs in greaves
  // mid-stride, a kilt of hanging strips, the torso sheared off at an
  // angle. Still legs and a torso, never a face.
  const g = new THREE.Group();
  const stone = mat('keepstone', { color: 0x4a4650, rough: 0.93, flat: false });
  const H = height * scale;
  const m = sculptLOD(() => statueGeometry(), stone, H);
  m.scale.setScalar(H);
  g.add(m);
  // A fallen fragment at the base — where the rest of it went.
  const frag = sculptLOD(() => spireGeometry(2), stone, H * 0.4);
  frag.scale.set(H * 0.5, H * 0.3, H * 0.5);
  frag.position.set(H * 0.36, H * 0.03, H * 0.22);
  frag.rotation.set(0.2, 1.1, 1.45);
  g.add(frag);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return mergeStatic(g);
}

/** THE DREAMING CITY — a wall fragment at a scale nobody living built. */
export function forgeColossalWall(length = 26, scale = 1) {
  const g = new THREE.Group();
  const stone = mat('keepstone', { color: 0x413d47, rough: 0.94 });
  const dark  = mat('keeptrim',  { color: 0x24222a, rough: 0.97 });
  const L = length * scale, H = L * 0.78;

  const body = new THREE.Mesh(roundedBox(L, H, L * 0.16, 0.2, 1), stone);
  body.position.y = H * 0.5;
  g.add(body);
  // A row of vast openings — the only thing giving the slab scale.
  const holeGeo = geo('cw-hole', () => new THREE.BoxGeometry(1, 1, 1));
  for (let i = 0; i < 3; i++) {
    const h = new THREE.Mesh(holeGeo, dark);
    h.scale.set(L * 0.14, H * 0.30, L * 0.20);
    h.position.set((i - 1) * L * 0.28, H * 0.42, 0);
    g.add(h);
  }
  // The top is BROKEN, stepped down toward one end — a flat top reads
  // as a wall that was finished, which is the opposite of the point.
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(roundedBox(L * 0.2, H * (0.10 + i * 0.05), L * 0.17, 0.12, 1), stone);
    t.position.set(L * (0.32 - i * 0.21), H + H * (0.05 + i * 0.025), 0);
    t.rotation.z = (i % 2 ? 1 : -1) * 0.03;
    g.add(t);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return mergeStatic(g);
}

/** THE BOTTOMLESS PIT — a spire rising out of ground that fell away. */
export function forgeChasmSpire(height = 24, scale = 1) {
  // Sculpted (rendering/Sculpt.js): banded strata with ledges, faceted
  // by noise, a side shard split off each — three of them leaning out.
  const g = new THREE.Group();
  const stone = mat('mono', { color: 0x191721, rough: 0.95, metal: 0.06, flat: false });
  const H = height * scale;
  for (let i = 0; i < 3; i++) {
    const m = sculptLOD(() => spireGeometry(i), stone, h);
    const h = H * (1 - i * 0.28), w = h * 0.62;
    m.scale.set(w, h, w);
    m.position.set(Math.cos(i * 2.3) * i * 2.6 * scale, -1.2 * scale, Math.sin(i * 2.3) * i * 2.6 * scale);
    m.rotation.y = i * 2.1 + 0.4;
    g.add(m);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return mergeStatic(g);
}

export function forgeBrazier(scale = 1) {
  // ⚠️ "Model revision of everything": a LATHED iron brazier — a
  // flared bowl with a rolled rim on a turned stem — standing on three
  // curled feet, with a bed of coals the flame rises from. The flame
  // and light keep their names (`brazier-fire`, `brazier-light`).
  const g = new THREE.Group();
  const iron = mat('brazieriron', { color: 0x2a251f, rough: 0.85 });
  const P = (x, y) => new THREE.Vector2(x * scale, y * scale);
  const profile = geo('brazier-lathe', () => new THREE.LatheGeometry([
    new THREE.Vector2(0.001, 0.0), new THREE.Vector2(0.2, 0.0), new THREE.Vector2(0.22, 0.05), new THREE.Vector2(0.11, 0.12),
    new THREE.Vector2(0.08, 0.5), new THREE.Vector2(0.12, 0.56), new THREE.Vector2(0.08, 0.62), new THREE.Vector2(0.07, 1.25),
    new THREE.Vector2(0.13, 1.32), new THREE.Vector2(0.09, 1.4), new THREE.Vector2(0.18, 1.5), new THREE.Vector2(0.45, 1.72),
    new THREE.Vector2(0.62, 1.95), new THREE.Vector2(0.68, 2.0), new THREE.Vector2(0.65, 2.04), new THREE.Vector2(0.58, 1.98),
    new THREE.Vector2(0.4, 1.8), new THREE.Vector2(0.001, 1.74),
  ], 24));
  const body = new THREE.Mesh(profile, iron);
  body.scale.setScalar(scale);
  g.add(body);
  // Three curled feet.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const c = new THREE.CatmullRomCurve3([V(0.1, 0.4, 0), V(0.3, 0.15, 0), V(0.42, 0.02, 0), V(0.5, 0.06, 0), V(0.47, 0.13, 0)]);
    const foot = new THREE.Mesh(geo('brazier-foot', () => new THREE.TubeGeometry(c, 12, 0.03, 5)), iron);
    foot.scale.setScalar(scale);
    foot.rotation.y = a;
    g.add(foot);
  }
  // Rim studs.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const st = new THREE.Mesh(geo('brazier-stud', () => new THREE.SphereGeometry(0.035, 6, 4)), iron);
    st.position.set(Math.cos(a) * 0.66 * scale, 2.0 * scale, Math.sin(a) * 0.66 * scale);
    g.add(st);
  }
  // Coals, glowing from beneath the flame.
  const coalMat = plainMat({ color: 0x1a0d08, rough: 0.9, emissive: 0xff5a1a, emissiveIntensity: 0.7 });
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Mesh(geo('coal', () => new THREE.DodecahedronGeometry(0.7, 0)), coalMat);
    const a = i * 2.4, r = (i % 3) * 0.16;
    c.scale.setScalar(0.18 * scale);
    c.position.set(Math.cos(a) * r * scale, 1.86 * scale, Math.sin(a) * r * scale);
    c.rotation.set(i, i * 2, 0);
    g.add(c);
  }
  const fire = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.36 * scale, icoDetail(2)),
    plainMat({ basic: true, color: 0xffb457, toneMapped: false, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  fire.scale.set(0.85, 1.25, 0.85);
  fire.position.y = 2.16 * scale;
  fire.name = 'brazier-fire';
  g.add(fire);

  const light = new THREE.PointLight(0xffa94d, 2.2, 17, 2);
  light.position.y = 2.3 * scale;
  light.name = 'brazier-light';
  g.add(light);

  g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
  return mergeStatic(g);
}

/** A stone well — the plaza's centre, and something to gather around. */
export function forgeWell(scale = 1) {
  // ⚠️ "Model revision of everything": the curb is laid stone — a ring
  // of wedge blocks in two courses with a coping — under a timber
  // frame with a windlass, rope and bucket and a shingled gable roof.
  // It was a smooth tube with a four-sided cone on two sticks.
  const g = new THREE.Group();
  const stone = mat('wellstone', { color: 0x655c4e, rough: 0.95 });
  const wood  = mat('wellwood',  { color: 0x4a3722, rough: 0.9 });
  const ringGeo = geo('well-curb', () => {
    const parts = [], block = roundedBox(1, 1, 1, 0.06, 1);
    const rows = [[1.25, 0.0, 0.42, 14, 0], [1.25, 0.42, 0.42, 14, 0.5], [1.32, 0.84, 0.18, 18, 0.25]];
    for (const [r, y, h, n, off] of rows) for (let i = 0; i < n; i++) {
      const a = ((i + off) / n) * Math.PI * 2, w = (2 * Math.PI * r / n) * 0.95;
      const b = block.clone();
      b.scale(w, h * 0.95, y > 0.8 ? 0.5 : 0.36);
      b.rotateY(-a + Math.PI / 2);
      b.translate(Math.cos(a) * r, y + h / 2, Math.sin(a) * r);
      parts.push(b.index ? b.toNonIndexed() : b);
    }
    return mergeGeometries(parts);
  });
  const curb = new THREE.Mesh(ringGeo, stone);
  curb.scale.setScalar(scale);
  g.add(curb);
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(1.1 * scale, seg(28)),
    plainMat({ color: 0x1d2b33, rough: 0.12, metal: 0.5, flat: false }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.42 * scale;
  g.add(water);
  const beam = (w, h, d, x, y, z, rz = 0) => { const m = new THREE.Mesh(roundedBox(w * scale, h * scale, d * scale, 0.03, 1), wood); m.position.set(x * scale, y * scale, z * scale); m.rotation.z = rz; g.add(m); return m; };
  for (const sx of [-1, 1]) { beam(0.2, 2.5, 0.2, sx * 1.35, 1.25, 0); beam(0.12, 0.9, 0.12, sx * 1.15, 1.95, 0, sx * 0.7); }
  // Windlass: a log axle with a crank, rope wound on it, a bucket below.
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * scale, 0.12 * scale, 2.9 * scale, 10), wood);
  axle.rotation.z = Math.PI / 2; axle.position.y = 1.85 * scale; g.add(axle);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * scale, 0.15 * scale, 0.7 * scale, 12), plainMat({ color: 0x6a5a40, rough: 1 }));
  rope.rotation.z = Math.PI / 2; rope.position.y = 1.85 * scale; g.add(rope);
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.015 * scale, 0.015 * scale, 0.9 * scale, 4), rope.material);
  line.position.set(0, 1.3 * scale, 0.14 * scale); g.add(line);
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * scale, 0.16 * scale, 0.3 * scale, 10, 1, true), wood);
  bucket.material = wood; bucket.position.set(0, 0.75 * scale, 0.14 * scale); g.add(bucket);
  const crank = beam(0.06, 0.4, 0.06, 1.5, 1.7, 0.0);
  crank.rotation.x = 0.4;
  // Gable roof: two shingled planes on a ridge.
  for (const sz of [-1, 1]) {
    const roof = new THREE.Mesh(roundedBox(3.4 * scale, 0.08 * scale, 1.5 * scale, 0.02, 1), wood);
    roof.position.set(0, 2.85 * scale, sz * 0.6 * scale);
    roof.rotation.x = sz * 0.62;
    g.add(roof);
    for (let i = 0; i < 4; i++) {
      const sh = new THREE.Mesh(roundedBox(3.45 * scale, 0.05 * scale, 0.32 * scale, 0.015, 1), wood);
      sh.position.set(0, (2.55 + i * 0.2) * scale + 0.06 * scale, sz * (1.05 - i * 0.28) * scale);
      sh.rotation.x = sz * 0.62;
      g.add(sh);
    }
  }
  beam(3.5, 0.14, 0.14, 0, 3.3, 0);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return mergeStatic(g);
}

/**
 * A market stall with an awning — the "people live here" prop.
 * `clothHex` varies per stall so a row of them doesn't read as one
 * object copied five times.
 */
export function forgeStall(clothHex = 0x8c4a3a, scale = 1) {
  // ⚠️ "Model revision of everything": the awning is CLOTH now — a
  // canopy that sags between the poles, with a scalloped valance — and
  // the stall has goods: crates, a barrel and a few jars on the counter.
  const g = new THREE.Group();
  const wood = mat('stallwood', { color: 0x5a4227, rough: 0.9 });
  const cloth = plainMat({ color: clothHex, rough: 0.85, flat: false, side: THREE.DoubleSide });
  const sack = plainMat({ color: 0x2a2622, rough: 0.6, metal: 0.5, flat: false });   // iron hoops
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const hgt = sz < 0 ? 2.55 : 2.2;
    const post = new THREE.Mesh(roundedBox(0.14 * scale, hgt * scale, 0.14 * scale, 0.035, 1), wood);
    post.position.set(sx * 1.2 * scale, hgt / 2 * scale, sz * 0.85 * scale);
    g.add(post);
  }
  const counter = new THREE.Mesh(roundedBox(2.5 * scale, 0.16 * scale, 0.9 * scale, 0.04, 1), wood);
  counter.position.set(0, 1.0 * scale, 0.55 * scale);
  g.add(counter);
  const front = new THREE.Mesh(roundedBox(2.5 * scale, 0.9 * scale, 0.06 * scale, 0.02, 1), wood);
  front.position.set(0, 0.5 * scale, 0.98 * scale);
  g.add(front);
  // The canopy: a subdivided sheet, sagging between its corners.
  const canopy = geo(`stall-canopy:${scale}`, () => {
    const pg = new THREE.PlaneGeometry(2.7 * scale, 2.0 * scale, 16, 12);
    pg.rotateX(-Math.PI / 2);
    const pos = pg.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) / (1.35 * scale), z = pos.getZ(i) / (1.0 * scale);
      const sag = (1 - x * x) * (1 - z * z) * 0.22 * scale;
      pos.setY(i, -sag - z * 0.18 * scale + Math.sin(x * 9) * 0.01 * scale);
    }
    pg.computeVertexNormals();
    return pg;
  });
  const awn = new THREE.Mesh(canopy, cloth);
  awn.position.y = 2.4 * scale;
  g.add(awn);
  // Valance: a scalloped hem along the front.
  for (let i = 0; i < 7; i++) {
    const v = new THREE.Mesh(geo('stall-scallop', () => new THREE.CircleGeometry(0.2, 10, Math.PI, Math.PI)), cloth);
    v.scale.setScalar(scale);
    v.position.set((i - 3) * 0.39 * scale, 2.22 * scale, 1.0 * scale);
    g.add(v);
  }
  // Goods.
  for (let i = 0; i < 3; i++) {
    const crate = new THREE.Mesh(roundedBox(0.5 * scale, 0.4 * scale, 0.45 * scale, 0.03, 1), wood);
    crate.position.set((-1.6 + i * 0.25) * scale, (0.2 + (i === 2 ? 0.4 : 0)) * scale, (-0.1 + (i % 2) * 0.4) * scale);
    if (i === 2) crate.position.set(-1.55 * scale, 0.6 * scale, 0.1 * scale);
    crate.rotation.y = i * 0.3;
    g.add(crate);
  }
  // A barrel, hooped, at the side.
  const barrel = new THREE.Mesh(geo('stall-barrel', () => new THREE.LatheGeometry([new THREE.Vector2(0.001, 0), new THREE.Vector2(0.24, 0), new THREE.Vector2(0.29, 0.3), new THREE.Vector2(0.24, 0.6), new THREE.Vector2(0.001, 0.6)], 14)), wood);
  barrel.scale.setScalar(scale);
  barrel.position.set(1.6 * scale, 0, -0.3 * scale);
  g.add(barrel);
  for (const hy of [0.1, 0.5]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.265 * scale, 0.015 * scale, 4, 16), sack);
    hoop.rotation.x = Math.PI / 2; hoop.position.set(1.6 * scale, hy * scale, -0.3 * scale);
    g.add(hoop);
  }
  for (let i = 0; i < 4; i++) {
    const jar = new THREE.Mesh(geo('stall-jar', () => new THREE.LatheGeometry([new THREE.Vector2(0.001, 0), new THREE.Vector2(0.08, 0), new THREE.Vector2(0.11, 0.08), new THREE.Vector2(0.09, 0.18), new THREE.Vector2(0.05, 0.22), new THREE.Vector2(0.06, 0.25), new THREE.Vector2(0.001, 0.25)], 10)), plainMat({ color: [0x7a4a2a, 0x4a5a6a, 0x6a6a4a, 0x5a3a3a][i], rough: 0.6, flat: false }));
    jar.scale.setScalar(scale);
    jar.position.set((-0.8 + i * 0.5) * scale, 1.08 * scale, 0.5 * scale);
    g.add(jar);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return mergeStatic(g);
}

export function forgeGravemarker(scale = 1) {
  // ⚠️ "Model revision of everything": a sculpted headstone
  // (rendering/Sculpt.js) — arched head, incised lines and a cross, a
  // corner sometimes broken — sunk in a low plinth and leaning.
  const g = new THREE.Group();
  const stone = mat('ruin', { color: 0x2a2620, rough: 0.95 });
  const slab = sculptLOD(() => headstoneGeometry(rnd() % 3), stone, 1.3 * scale);
  slab.scale.setScalar(1.3 * scale);
  slab.position.y = -0.03 * scale;
  slab.rotation.set(rand(-0.12, 0.08), rand(-0.3, 0.3), rand(-0.14, 0.14));
  g.add(slab);
  g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });  // ground clutter — no castShadow
  return mergeStatic(g);
}

export function disposePropCache() {
  for (const m of _cache.values()) m.dispose();
  _cache.clear();
}

/**
 * Retro-fit HD surfaces onto prop materials that were already cached.
 *
 * Ordering makes this necessary: ChunkManager builds the spawn chunks
 * during initGame(), which is well before the ~49MB of texture data
 * has finished downloading. Any prop material created in that window
 * gets cached WITHOUT a texture, and since the cache is keyed by
 * role+colour it would then hand that flat material out for the rest
 * of the session — the world would be textured everywhere except
 * around spawn, which is precisely where the player starts looking.
 *
 * Mutating the cached materials in place fixes every mesh already
 * referencing them at once, with no need to find or rebuild the props
 * themselves.
 *
 * Safe to call more than once; applyTriplanar is idempotent for a
 * given material and slug.
 */
/**
 * Force every geometry variant pool to be built now.
 *
 * GeoForge builds pools lazily on first use, and building one means
 * running 3-octave 3D noise displacement over ~14 variants of every
 * shape. Measured: the FIRST prop-heavy chunk cost ~84ms while every
 * subsequent one cost ~9ms — a 75ms one-off spike, paid at whatever
 * random moment the player first walked somewhere with trees.
 *
 * Calling this during the loading screen moves that cost to a place
 * where it is invisible. Forge one of each prop, throw the result
 * away; the pools it fills are what we actually wanted.
 */
export function prewarmPropGeometry() {
  const t0 = performance.now();
  const discard = [
    forgeTree(1), forgeDeadTree(1), forgeRock(1),
    forgeShard(1), forgeRuin(1), forgeMonolith(1),
  ];
  // Free the throwaway meshes' own resources. The POOLED geometries
  // they reference are owned by GeoForge and deliberately survive —
  // that is the entire point of the exercise.
  for (const g of discard) {
    g.traverse(o => {
      if (o.isMesh && o.geometry && !o.geometry.userData?.pooled) {
        // Only dispose geometry this call uniquely created. Pooled
        // geometry is shared with every future prop and must not be
        // disposed here.
      }
    });
  }
  console.log(`[PropForge] prewarmed geometry pools in ${(performance.now() - t0).toFixed(0)}ms`);
}

export function applyHDToPropCache() {
  if (!materialLibrary.ready) return 0;
  let upgraded = 0;
  for (const [id, m] of _cache.entries()) {
    // The cache holds geometries as well as materials (see geo()).
    if (!m.isMaterial) continue;
    // id is `${role}:${color}:${rough}:${metal}` — the role is the
    // part before the first colon.
    const role = id.slice(0, id.indexOf(':'));
    const surface = PROP_SURFACES[role];
    if (!surface || m.userData.triplanarUniforms) continue;
    m.flatShading = false;
    materialLibrary.applyTriplanar(m, surface.slug, {
      scale: surface.scale,
      detail: surface.detail,
      normalScale: surface.normalScale,
      aoStrength: 0.7,
    });
    upgraded++;
  }
  if (upgraded) console.log(`[PropForge] upgraded ${upgraded} cached prop materials to HD`);
  return upgraded;
}
