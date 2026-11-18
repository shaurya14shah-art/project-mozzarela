// ══════════════════════════════════════════════════════════
// WorldFeatures — what the expansion adds to every chunk
//
// Owner (grilling 2026-10-06): depth over count; caves as a MIX
// (surface grottos and open pits for common ore, deep walkable caves
// for rare); a signature material per biome; humanoid factions with
// camps. Data in data/expansion.js; tools in systems/GatherSystem.js;
// deep caves in systems/CaveSystem.js.
//
// Per chunk, deterministic on (cx, cz):
//   · ORE VEINS — rock studded with the ore's own colour, the ore drawn
//     from the biome's BIOME_ORES list (a pickaxe of the right metal)
//   · SIGNATURE NODES — the biome's own material (plant, stump, crust,
//     crystal, shroom, clay bank, meteor stone)
//   · GROTTOS — a rock overhang sheltering two to four veins
//   · QUARRY PITS — the terrain is carved by `pitCarve` (TerrainGenerator)
//     on a pure-hash grid; here the pit gets its veins, timbering, ladder
//   · CAVE MOUTHS — a dark arch on a hillside; E to go in (CaveSystem)
//   · CAMPS — a faction's tents, fire and stores; members appear when
//     you come near (main.js `updateCamps`)
//
// ⚠️ Every harvestable thing is its OWN top-level decoration, never a
// child of a grotto group — ChunkManager._unloadChunk forgets harvest
// nodes by matching the top-level mesh, so a nested vein would outlive
// its chunk as a ghost node.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { WORLD } from '../data/constants.js';
import { ORES, SIGNATURE, BIOME_ORES, BIOME_LIFE } from '../data/expansion.js';
import { forgeRock, forgeShard } from '../rendering/PropForge.js';
import { siteSystem } from '../systems/SiteSystem.js';

const S = WORLD.CHUNK_SIZE;
function hash(a, b, salt = 0) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(salt | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function rng(cx, cz, salt) { let n = 0; return () => hash(cx * 31 + n, cz * 17 + (n++), salt); }

const _mats = new Map();
function mat(color, rough = 0.6, extra = {}) {
  const k = `${color}:${rough}:${JSON.stringify(extra)}`;
  if (!_mats.has(k)) _mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra }));
  return _mats.get(k);
}
const flecks = (color) => mat(color, 0.35, { metalness: 0.65, emissive: color, emissiveIntensity: 0.08 });

// ══════════════════════════════════════════════════════════
// QUARRY PITS — pure hash on a 160 m grid, so the terrain generator
// can carve them per vertex with no other knowledge.
// ══════════════════════════════════════════════════════════
const PIT_CELL = 160;
export function pitForCell(i, j) {
  if (Math.hypot(i, j) < 2) return null;                   // not in or beside the Sanctuary
  if (hash(i, j, 911) > 0.11) return null;
  const r = 9 + hash(i, j, 912) * 5;
  const x = (i + 0.25 + hash(i, j, 913) * 0.5) * PIT_CELL;
  const z = (j + 0.25 + hash(i, j, 914) * 0.5) * PIT_CELL;
  return { x, z, r, depth: 4 + hash(i, j, 915) * 2.5, id: `pit:${i},${j}` };
}
/** The carve at (x, z): metres to lower the ground (0 outside a pit). */
export function pitCarve(x, z) {
  const p = pitForCell(Math.floor(x / PIT_CELL), Math.floor(z / PIT_CELL));
  if (!p) return 0;
  const d = Math.hypot(x - p.x, z - p.z);
  if (d >= p.r + 4) return 0;
  // Two benches and a floor: the stepped walls of a working quarry.
  const k = d <= p.r * 0.45 ? 1 : d <= p.r * 0.75 ? 0.62 : d <= p.r ? 0.3 : (1 - (d - p.r) / 4) * 0.3;
  return p.depth * Math.max(0, k);
}

// ── Meshes ──────────────────────────────────────────────────
export function veinMesh(ore, scale, r) {
  const o = ORES[ore];
  const g = forgeRock(scale, 0x3a3634);
  const n = 6 + Math.floor(r() * 6);
  for (let i = 0; i < n; i++) {
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07 + r() * 0.1, 0), ore === 'coal' ? mat(0x111112, 0.9) : flecks(o.color));
    const a = r() * Math.PI * 2, el = (r() - 0.2) * 1.2;
    const rad = 0.55 * scale;
    f.position.set(Math.cos(a) * Math.cos(el) * rad, 0.3 * scale + Math.sin(el) * rad * 0.8, Math.sin(a) * Math.cos(el) * rad);
    f.rotation.set(r() * 3, r() * 3, r() * 3);
    g.add(f);
  }
  if (ore === 'starmetal' || ore === 'orichalcum' || ore === 'mithril_ore') {
    const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12 * scale, 1), mat(o.color, 0.3, { emissive: o.color, emissiveIntensity: 0.8 }));
    glow.position.y = 0.55 * scale; g.add(glow);
  }
  return g;
}

function signatureMesh(sig, r) {
  const g = new THREE.Group();
  const c = sig.color;
  switch (sig.look) {
    case 'plant': for (let i = 0; i < 9; i++) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.015, 0.6 + r() * 0.4, 4), mat(0x5a6a3a, 0.9)); st.position.set((r() - 0.5) * 0.5, 0.35, (r() - 0.5) * 0.5); st.rotation.z = (r() - 0.5) * 0.4; g.add(st); const hd = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), mat(c, 0.8)); hd.position.set(st.position.x, 0.7 + r() * 0.3, st.position.z); g.add(hd); } break;
    case 'shroom': for (let i = 0; i < 5; i++) { const s = 0.1 + r() * 0.15; const st = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.25, s * 0.3, s * 1.4, 6), mat(0xd8d0c0, 0.9)); st.position.set((r() - 0.5) * 0.6, s * 0.7, (r() - 0.5) * 0.6); g.add(st); const cap = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(c, 0.6, { emissive: c, emissiveIntensity: 0.35 })); cap.position.set(st.position.x, s * 1.35, st.position.z); g.add(cap); } break;
    case 'stump': { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 0.8, 9), mat(c, 0.95)); st.position.y = 0.4; g.add(st); for (let i = 0; i < 4; i++) { const rt = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.8, 5), mat(c, 0.95)); rt.rotation.set(Math.PI / 2 - 0.3, i * Math.PI / 2, 0); rt.position.set(Math.cos(i * Math.PI / 2) * 0.5, 0.12, Math.sin(i * Math.PI / 2) * 0.5); g.add(rt); } break; }
    case 'crystal': { const s = forgeShard(0.9, c); g.add(s); break; }
    case 'meteor': { const rk = forgeRock(0.9, 0x22242a); g.add(rk); const gl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), mat(c, 0.3, { emissive: c, emissiveIntensity: 1.2, metalness: 0.6 })); gl.position.y = 0.6; g.add(gl); break; }
    case 'web': for (let i = 0; i < 4; i++) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), mat(0xe8e0f0, 0.9, { transparent: true, opacity: 0.4, side: THREE.DoubleSide })); w.position.y = 0.5; w.rotation.set(r(), i, r()); g.add(w); } break;
    case 'clay': { const m = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(c, 0.95)); m.scale.y = 0.4; g.add(m); break; }
    default: { const cr = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), mat(c, 0.85)); cr.scale.y = 0.4; cr.position.y = 0.12; g.add(cr); for (let i = 0; i < 6; i++) { const k = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), mat(c, 0.7)); k.position.set((r() - 0.5) * 0.9, 0.1, (r() - 0.5) * 0.9); g.add(k); } }
  }
  return g;
}

// ── The per-chunk build ─────────────────────────────────────
/** Camps currently loaded: id → { x, z, faction[], spawned }. main.js reads it. */
export const LOADED_CAMPS = new Map();

/**
 * @returns {THREE.Object3D[]} props, already parented to the decoration
 *   group, each registered with harvest nodes / colliders as needed.
 */
export function buildFeatures(cm, cx, cz, biome) {
  const out = [];
  if (!biome?.key || biome.key === 'sanctuary') return out;
  const r = rng(cx, cz, 4401);
  const x0 = cx * S, z0 = cz * S;
  const ground = (x, z) => cm.getGroundY(x, z);
  const add = (obj, collider = null) => { cm.decorationGroup.add(obj); out.push(obj); if (collider !== null) cm._addCollider(obj, collider); return obj; };
  const node = (obj, data) => { cm.harvestNodes.push({ mesh: obj, position: obj.position.clone(), ...data }); return obj; };
  const ores = BIOME_ORES[biome.key] || ['iron_ore', 'copper_ore'];
  const pickOre = () => ores[Math.floor(r() * ores.length)];

  const vein = (x, z, ore, scale = 0.8) => {
    const g = veinMesh(ore, scale, r);
    g.position.set(x, ground(x, z) - 0.1, z);
    g.rotation.y = r() * 6.28;
    add(g, 0.35);
    node(g, { type: 'vein', ore, hp: 30 + (ORES[ore]?.hard || 1) * 18, maxHp: 30 + (ORES[ore]?.hard || 1) * 18 });
  };

  // ── Veins in the open ──
  const nVeins = Math.round((biome.rockDensity || 0.05) * 8 * r() + (r() < 0.5 ? 1 : 0));
  for (let i = 0; i < nVeins; i++) vein(x0 + r() * S, z0 + r() * S, pickOre(), 0.6 + r() * 0.5);

  // ── The biome's signature material ──
  const sig = SIGNATURE[biome.key];
  if (sig) {
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const x = x0 + r() * S, z = z0 + r() * S;
      const g = signatureMesh(sig, r);
      g.position.set(x, ground(x, z), z); g.rotation.y = r() * 6.28;
      add(g);
      node(g, { type: 'signature', item: sig.id, tool: sig.tool, hard: sig.hard || 0, hp: 20 + (sig.hard || 0) * 15, maxHp: 20 + (sig.hard || 0) * 15 });
    }
  }

  // ── A grotto: an overhang over a few veins ──
  if (r() < 0.06 + (biome.rockDensity || 0) * 0.25) {
    const gx = x0 + 10 + r() * (S - 20), gz = z0 + 10 + r() * (S - 20), gy = ground(gx, gz);
    const yaw = r() * 6.28, fx = Math.sin(yaw), fz = Math.cos(yaw);
    const shell = new THREE.Group(); shell.position.set(gx, gy, gz); shell.rotation.y = yaw;
    // Back wall, two flanks, and a roof slab leaning over them.
    const wall = (lx, ly, lz, s, sx, sy, sz) => { const rk = forgeRock(s, 0x4a4440); rk.position.set(lx, ly, lz); rk.scale.multiply(new THREE.Vector3(sx, sy, sz)); shell.add(rk); };
    wall(0, 0, -2.4, 2.4, 1.6, 1.3, 0.8);
    wall(-2.3, 0, -0.6, 2.0, 0.8, 1.2, 1.4);
    wall(2.3, 0, -0.6, 2.0, 0.8, 1.2, 1.4);
    wall(0, 2.4, -1.2, 2.4, 1.6, 0.45, 1.3);
    add(shell, 0.15);
    const nv = 2 + Math.floor(r() * 3);
    for (let i = 0; i < nv; i++) {
      const lx = (r() - 0.5) * 2.6, lz = -1.2 + r() * 0.9;
      vein(gx + lx * Math.cos(yaw) + lz * fx, gz - lx * Math.sin(yaw) + lz * fz, pickOre(), 0.55 + r() * 0.3);
    }
  }

  // ── A quarry pit whose centre is in this chunk ──
  const pi = Math.floor((x0 + S / 2) / 160), pj = Math.floor((z0 + S / 2) / 160);
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    const p = pitForCell(pi + di, pj + dj);
    if (!p || p.x < x0 || p.x >= x0 + S || p.z < z0 || p.z >= z0 + S) continue;
    const pr = rng(Math.round(p.x), Math.round(p.z), 77);
    // Veins on the benches and the floor.
    for (let i = 0; i < 6; i++) {
      const a = pr() * 6.28, d = p.r * (0.2 + pr() * 0.7);
      vein(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, ores[Math.floor(pr() * ores.length)], 0.6 + pr() * 0.4);
    }
    // Timbering: a headframe and a ladder down one bench.
    const timber = mat(0x4a3420, 0.9);
    const hf = new THREE.Group(); const hy = ground(p.x + p.r * 0.9, p.z);
    hf.position.set(p.x + p.r * 0.9, hy, p.z);
    for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 0.2), timber); post.position.set(0, 2, s * 1.2); post.rotation.x = s * 0.12; hf.add(post); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 2.8), timber); beam.position.y = 3.9; hf.add(beam);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 16), timber); wheel.position.set(0, 3.9, 0); wheel.rotation.y = Math.PI / 2; hf.add(wheel);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 3.6, 4), mat(0x8a7a5a, 0.9)); rope.position.set(-0.5, 2.1, 0); hf.add(rope);
    add(hf, 0.6);
    const lad = new THREE.Group(); const lx = p.x - p.r * 0.7, lz = p.z; lad.position.set(lx, ground(lx, lz), lz); lad.rotation.z = 0.5;
    for (const s of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 4, 0.08), timber); rail.position.set(0, 2, s * 0.3); lad.add(rail); }
    for (let k = 0; k < 8; k++) { const rung = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.6), timber); rung.position.y = 0.3 + k * 0.48; lad.add(rung); }
    add(lad);
  }

  // ── A cave mouth on a hillside ──
  const caveChance = biome.caveMouths ?? 0.06;
  if (r() < caveChance && !cm.realmMode) {
    // Find the steepest of a few spots: a mouth wants a slope to cut into.
    let best = null, bestG = 0;
    for (let k = 0; k < 8; k++) {
      const x = x0 + 8 + r() * (S - 16), z = z0 + 8 + r() * (S - 16);
      const gxv = ground(x + 2, z) - ground(x - 2, z), gzv = ground(x, z + 2) - ground(x, z - 2);
      const gr = Math.hypot(gxv, gzv);
      if (gr > bestG) { bestG = gr; best = { x, z, gxv, gzv }; }
    }
    if (best && bestG > 0.8) {
      const downhill = Math.atan2(-best.gxv, -best.gzv);
      const mouth = new THREE.Group();
      mouth.position.set(best.x, ground(best.x, best.z), best.z); mouth.rotation.y = downhill;
      const rockC = 0x3a3634;
      const piece = (lx, ly, lz, s, sx, sy, sz) => { const rk = forgeRock(s, rockC); rk.position.set(lx, ly, lz); rk.scale.multiply(new THREE.Vector3(sx, sy, sz)); mouth.add(rk); };
      piece(-2.1, 0, 0, 2.2, 0.7, 1.6, 1.0); piece(2.1, 0, 0, 2.2, 0.7, 1.6, 1.0); piece(0, 3.0, -0.2, 2.6, 1.5, 0.6, 1.1);
      piece(0, 0, -2.4, 3, 1.4, 1.4, 1.0);
      // The dark: a black hemisphere set into the hill behind the arch.
      const dark = new THREE.Mesh(new THREE.SphereGeometry(1.8, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x020202, 1, { side: THREE.BackSide }));
      dark.scale.set(1, 1.3, 1.4); dark.position.set(0, 0, -1.4); mouth.add(dark);
      add(mouth);
      siteSystem.register('cave', best.x, mouth.position.y, best.z);
    }
  }

  // ── A faction camp ──
  const life = BIOME_LIFE[biome.key];
  if (life?.factions?.length && r() < 0.05 && Math.hypot(x0, z0) > 320) {
    const cx2 = x0 + 12 + r() * (S - 24), cz2 = z0 + 12 + r() * (S - 24), cy = ground(cx2, cz2);
    const camp = new THREE.Group(); camp.position.set(cx2, cy, cz2);
    const cloth = mat(life.factions[0] === 'cultist' ? 0x3a1410 : life.factions[0] === 'knight' ? 0x2a2a3a : 0x5a4a32, 0.95, { side: THREE.DoubleSide });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * 6.28 + r(), d = 5 + r() * 2;
      const tent = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.6, 4, 1, true), cloth);
      tent.position.set(Math.cos(a) * d, 1.3, Math.sin(a) * d); tent.rotation.y = a; camp.add(tent);
    }
    const ring = mat(0x5a5450, 0.95);
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), ring); s.position.set(Math.cos(a) * 0.6, 0.08, Math.sin(a) * 0.6); camp.add(s); }
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.55, 7), mat(0xffa040, 0.5, { emissive: 0xff6a10, emissiveIntensity: 2.4, toneMapped: false }));
    fire.position.y = 0.3; fire.name = 'station-flame'; camp.add(fire);
    const light = new THREE.PointLight(0xff8a3a, 5, 12, 2); light.position.y = 1; camp.add(light);
    for (let i = 0; i < 3; i++) { const cr = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.6), mat(0x5a3a22, 0.9)); cr.position.set(2.5 + i * 0.4, 0.3 + (i === 2 ? 0.6 : 0), -2.5 + (i === 2 ? 0.2 : i * 0.75)); camp.add(cr); }
    camp.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    add(camp);
    const id = `camp:${cx},${cz}`;
    LOADED_CAMPS.set(id, { id, x: cx2, z: cz2, factions: life.factions, chunk: `${cx},${cz}` });
    siteSystem.register('warcamp', cx2 + 2.8, cy, cz2 - 2.2);
  }
  return out;
}

/** Forget a chunk's camps on unload (ChunkManager calls this). */
export function forgetChunk(cx, cz) {
  for (const [id, c] of LOADED_CAMPS) if (c.chunk === `${cx},${cz}`) LOADED_CAMPS.delete(id);
}
