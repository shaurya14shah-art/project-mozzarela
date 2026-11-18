// ══════════════════════════════════════════════════════════
// CaveSystem — the deep, walkable caves
//
// Owner (grilling 2026-10-06): caves are a MIX — grottos and pits on the
// surface for common ore (world/WorldFeatures.js), and DEEP WALKABLE
// caves for the rare: dark enough to need light, tunnels and chambers,
// ore in the walls, cave creatures.
//
// Entered from a cave mouth (a 'cave' site, E). Built like a Descent
// (a separate realm band, flattened ground, a seeded floor plan) but
// ORGANIC (world/DungeonLayout.js `organic`), roofed, and dark
// (Atmosphere.setCaveDark): your lantern and the glowing things in the
// rock are the light. Depth band by how far from home the mouth is —
// shallow (iron, coal, silver), deep (silver, mithril, pearls), abyssal
// (mithril, starmetal, orichalcum) — the Karst always one band deeper.
// Walk back out of the mouth tunnel to leave.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { generateDungeon, dungeonSeed, updateFlow, navStep, clearLine } from '../world/DungeonLayout.js';
import { veinMesh } from '../world/WorldFeatures.js';
import { CAVE_ORES, CAVE_LIFE, ORES } from '../data/expansion.js';
import { atmosphere } from '../rendering/Atmosphere.js';

const BAND_NAMES = ['a shallow cave', 'a deep cave', 'an abyssal cave'];
const BAND_R = [40, 52, 64];
const ROOF = 6.4;

function rng32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

class CaveSystem {
  constructor() { this.active = null; this.ctx = null; }

  /** ctx: player, chunkManager, spawner, scene, notify, typeIndexOf, isBusy() */
  init(ctx) { this.ctx = ctx; return this; }
  get isActive() { return !!this.active; }

  enter(site) {
    const c = this.ctx;
    if (this.active || c.isBusy?.()) return false;
    const dist = Math.hypot(site.x, site.z);
    const biome = c.chunkManager.biomeManager.getBiomeForChunk(Math.floor(site.x / 64), Math.floor(site.z / 64));
    let band = dist < 600 ? 0 : dist < 1500 ? 1 : 2;
    if (biome?.key === 'highland_karst') band = Math.min(2, band + 1);
    const R = BAND_R[band];
    const seed = dungeonSeed(site.id || `${site.x},${site.z}`, band);
    const rand = rng32(seed);
    const origin = new THREE.Vector3(700000 + (seed % 997) * 300, 0, 700000 + ((seed >>> 10) % 997) * 300);

    this._returnPos = c.player.position.clone();
    c.chunkManager.setRealmMode(true);
    const floorY = c.chunkManager.getGroundY(origin.x, origin.z);
    const D = generateDungeon(seed, R, { organic: true });
    c.chunkManager.terrainGen.flatZone = { x: origin.x, z: origin.z, r0: R + 18, r1: R + 34, h: floorY };
    const ent = D.entry;
    c.player.position.set(origin.x + ent.x, floorY + 0.6, origin.z + ent.z + ent.hd * 0.4);
    c.player.velocity?.set(0, 0, 0);
    c.chunkManager.update(origin.x, origin.z);

    this.active = { site, band, R, D, origin, floorY, rand, nodes: [], creatures: [], lights: [] };
    this._build();
    c.spawner.realmHold = true;
    atmosphere.setCaveDark(1);
    this._populate();
    c.notify(`You go into ${BAND_NAMES[band]}. Walk back out the way you came to leave.`);
    return true;
  }

  // ── The cave itself ──────────────────────────────────────
  _build() {
    const A = this.active, D = A.D, c = this.ctx, r = A.rand;
    const g = new THREE.Group(); g.position.set(A.origin.x, A.floorY, A.origin.z);
    const owned = { geos: [], mats: [] };
    const mat = (o) => { const m = new THREE.MeshStandardMaterial(o); owned.mats.push(m); return m; };
    const rockM = mat({ color: 0xffffff, roughness: 0.96 });
    const coreM = mat({ color: 0x1a1816, roughness: 1 });
    const C = D.cell, cellX = i => (i - D.half) * C;
    const tint = (k) => new THREE.Color(0x3a3632).multiplyScalar(k);

    // Wall mass (merged) — tall enough to seal against the roof.
    const cores = D.wallRects.map(w => { const b = new THREE.BoxGeometry(w.x1 - w.x0 - 0.2, ROOF + 1, w.z1 - w.z0 - 0.2); b.translate((w.x0 + w.x1) / 2, (ROOF + 1) / 2 - 0.4, (w.z0 + w.z1) / 2); return b; });
    if (cores.length) { const m = new THREE.Mesh(mergeGeometries(cores), coreM); owned.geos.push(m.geometry); cores.forEach(b => b.dispose()); m.receiveShadow = true; g.add(m); }

    // Boulders on every face: the rock itself, lumpy and close.
    const bGeo = new THREE.DodecahedronGeometry(0.5, 1); owned.geos.push(bGeo);
    const faces = D.faces;
    const nB = faces.length * 4;
    const boulders = new THREE.InstancedMesh(bGeo, rockM, nB);
    const o = new THREE.Object3D();
    let k = 0;
    const veinSpots = [];
    for (const f of faces) {
      const x0 = cellX(f.i), z0 = cellX(f.j);
      const alongX = f.dir >= 2;
      const plane = f.dir === 0 ? x0 + C : f.dir === 1 ? x0 : f.dir === 2 ? z0 + C : z0;
      const nrm = (f.dir === 0 || f.dir === 2) ? 1 : -1;
      const a0 = alongX ? x0 : z0;
      for (let q = 0; q < 4; q++) {
        const s = 0.9 + r() * 1.1, along = a0 + r() * C, y = q < 2 ? s * 0.35 + r() * 1.5 : 2.4 + r() * 3.4;
        const off = plane + nrm * (0.05 - s * 0.32 + r() * 0.15);
        o.position.set(alongX ? along : off, y, alongX ? off : along);
        o.scale.set(s, s * (0.7 + r() * 0.5), s); o.rotation.set(r() * 3, r() * 3, r() * 3); o.updateMatrix();
        boulders.setMatrixAt(k, o.matrix); boulders.setColorAt(k, tint(0.7 + r() * 0.5)); k++;
      }
      if (r() < 0.07) veinSpots.push({ x: alongX ? a0 + C / 2 : plane + nrm * 0.4, z: alongX ? plane + nrm * 0.4 : a0 + C / 2 });
    }
    boulders.count = k; boulders.castShadow = true; boulders.receiveShadow = true; g.add(boulders);

    // Roof, and stalactites hanging from it; stalagmites from the floor.
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const floorCells = [];
    for (let j = 0; j < D.N; j++) for (let i = 0; i < D.N; i++) if (D.grid[D.idx(i, j)]) {
      const x = cellX(i), z = cellX(j); floorCells.push([x + C / 2, z + C / 2]);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x + C); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z + C);
    }
    const roofGeo = new THREE.PlaneGeometry(maxX - minX + 8, maxZ - minZ + 8, 24, 24).rotateX(Math.PI / 2);
    const rp = roofGeo.attributes.position;
    for (let i = 0; i < rp.count; i++) rp.setY(i, Math.sin(rp.getX(i) * 0.3) * 0.5 + Math.cos(rp.getZ(i) * 0.27) * 0.5);
    roofGeo.computeVertexNormals(); owned.geos.push(roofGeo);
    const roof = new THREE.Mesh(roofGeo, mat({ color: 0x24201c, roughness: 1, side: THREE.DoubleSide }));
    roof.position.set((minX + maxX) / 2, ROOF, (minZ + maxZ) / 2); roof.castShadow = true; roof.receiveShadow = true; g.add(roof);
    const coneG = new THREE.ConeGeometry(1, 1, 6); owned.geos.push(coneG);
    const tites = new THREE.InstancedMesh(coneG, rockM, floorCells.length);
    let t = 0;
    for (const [x, z] of floorCells) {
      if (r() > 0.12) continue;
      const L = 0.5 + r() * 1.8, w = 0.15 + r() * 0.25, down = r() < 0.7;
      o.position.set(x + (r() - 0.5), down ? ROOF - L / 2 : L * 0.4 / 2, z + (r() - 0.5));
      o.scale.set(w, down ? L : L * 0.4, w); o.rotation.set(down ? Math.PI : 0, r() * 6, 0); o.updateMatrix();
      tites.setMatrixAt(t, o.matrix); tites.setColorAt(t, tint(0.8 + r() * 0.4)); t++;
    }
    tites.count = t; tites.castShadow = true; g.add(tites);

    // Floor: wet dark stone, with pools.
    const floorGeo = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ).rotateX(-Math.PI / 2); owned.geos.push(floorGeo);
    const floor = new THREE.Mesh(floorGeo, mat({ color: 0x1e1b18, roughness: 0.7, metalness: 0.1 }));
    floor.position.set((minX + maxX) / 2, 0.03, (minZ + maxZ) / 2); floor.receiveShadow = true; g.add(floor);

    // The light that lives down here, by depth: fungus, crystal, magma.
    const glowCol = [0x40e0c0, 0x7090ff, 0xff6a20][A.band];
    const glowM = mat({ color: glowCol, emissive: glowCol, emissiveIntensity: 1.4, roughness: 0.5, toneMapped: false });
    const gGeo = A.band === 1 ? new THREE.OctahedronGeometry(0.25, 0) : new THREE.SphereGeometry(0.18, 8, 6); owned.geos.push(gGeo);
    const glows = new THREE.InstancedMesh(gGeo, glowM, 400);
    let gl = 0;
    for (const room of D.rooms) {
      const n = 6 + Math.floor(r() * 10);
      for (let q = 0; q < n && gl < 400; q++) {
        const a = r() * 6.28, d = (0.5 + r() * 0.5) * Math.min(room.hw, room.hd);
        o.position.set(room.x + Math.cos(a) * d, 0.15 + r() * 0.2, room.z + Math.sin(a) * d);
        const s = 0.6 + r() * 0.9; o.scale.set(s, s * (A.band === 1 ? 1.8 : 0.7), s); o.rotation.set(0, r() * 6, 0); o.updateMatrix();
        glows.setMatrixAt(gl++, o.matrix);
      }
      if (A.lights.length < 6 && (room.kind !== 'side' || r() < 0.6)) {
        const L = new THREE.PointLight(glowCol, 5, 16, 2); L.position.set(room.x, 1.2, room.z); g.add(L); A.lights.push(L);
      }
    }
    glows.count = gl; g.add(glows);

    // Daylight at the end of the way out.
    const day = new THREE.Mesh(new THREE.PlaneGeometry(4, 5), mat({ color: 0xe8e4d8, emissive: 0xe8e4d8, emissiveIntensity: 1.2, toneMapped: false }));
    day.position.set(0, 2.5, D.exitZ - 1); day.rotation.y = Math.PI; owned.geos.push(day.geometry); g.add(day);

    c.scene.add(g);
    A.group = g; A.owned = owned;
    // Colliders: the wall rectangles.
    A.colliders = D.wallRects.map(w => ({ box: new THREE.Box3(new THREE.Vector3(A.origin.x + w.x0, A.floorY - 1, A.origin.z + w.z0), new THREE.Vector3(A.origin.x + w.x1, A.floorY + 9, A.origin.z + w.z1)), mesh: g }));
    c.chunkManager.colliders.push(...A.colliders);

    // Ore in the walls — the depth band's ores, the deep chamber richest.
    const ores = CAVE_ORES[A.band];
    const pickOre = () => ores[Math.floor(r() * ores.length)];
    const placeVein = (x, z, ore, s) => {
      const id = ORES[ore] ? ore : 'iron_ore';
      const v = veinMesh(id, s, r);
      v.position.set(A.origin.x + x, A.floorY - 0.1, A.origin.z + z); v.rotation.y = r() * 6.28;
      c.scene.add(v);
      const hp = 30 + (ORES[id]?.hard || 1) * 18;
      const node = { mesh: v, type: 'vein', ore: id, hp, maxHp: hp, position: v.position.clone() };
      c.chunkManager.harvestNodes.push(node); A.nodes.push(node);
    };
    for (const sp of veinSpots) { const ore = pickOre(); placeVein(sp.x, sp.z, ore === 'cave_pearl' ? 'silver_ore' : ore, 0.6 + r() * 0.4); }
    const deep = D.warden;
    for (let q = 0; q < 5; q++) { const a = q / 5 * 6.28; placeVein(deep.x + Math.cos(a) * deep.hw * 0.6, deep.z + Math.sin(a) * deep.hd * 0.6, ores[Math.min(ores.length - 1, 1 + Math.floor(r() * (ores.length - 1)))], 0.8); }
    // Cave pearls are picked up, not mined.
    if (A.band >= 1) for (let q = 0; q < 3; q++) {
      const room = D.rooms[Math.floor(r() * D.rooms.length)];
      c.pickup?.('cave_pearl', new THREE.Vector3(A.origin.x + room.x + (r() - 0.5) * 3, A.floorY + 0.6, A.origin.z + room.z + (r() - 0.5) * 3));
    }

    // The lantern you carry.
    A.lantern = new THREE.PointLight(0xffc488, 7, 18, 1.6);
    c.scene.add(A.lantern);
  }

  _populate() {
    const A = this.active, D = A.D, c = this.ctx, r = A.rand;
    const level = 3 + A.band * 5;
    const spawn = (id, x, z) => {
      const idx = c.typeIndexOf(id); if (idx < 0) return;
      const pos = new THREE.Vector3(A.origin.x + x, A.floorY + 1.2, A.origin.z + z);
      const e = c.spawner.spawnNamed(idx, pos, level, { hpMult: 1 + A.band * 0.4 });
      if (!e) return;
      this._bindNav(e);
      A.creatures.push(e);
    };
    for (const room of D.rooms) {
      if (room.kind === 'entry') continue;
      const n = room.kind === 'warden' ? 3 + A.band : 1 + Math.floor(r() * 2);
      for (let q = 0; q < n; q++) {
        const id = CAVE_LIFE[Math.floor(r() * CAVE_LIFE.length)];
        const a = r() * 6.28, d = r() * Math.min(room.hw, room.hd) * 0.6;
        spawn(id, room.x + Math.cos(a) * d, room.z + Math.sin(a) * d);
        if (id === 'cave_grub') for (let g = 0; g < 2; g++) spawn(id, room.x + Math.cos(a) * d + (r() - 0.5) * 2, room.z + Math.sin(a) * d + (r() - 0.5) * 2);
      }
    }
  }

  _bindNav(e) {
    const D = this.active.D, o = this.active.origin;
    e.nav = (pos, target, out) => {
      if (!navStep(D, pos.x - o.x, pos.z - o.z, target.x - o.x, target.z - o.z, out)) return false;
      out.x += o.x; out.z += o.z; return true;
    };
    e.losCheck = (a, b) => clearLine(D, a.x - o.x, a.z - o.z, b.x - o.x, b.z - o.z);
  }

  update(dt) {
    const A = this.active; if (!A) return;
    const c = this.ctx, p = c.player.position, o = A.origin;
    A.lantern.position.set(p.x, p.y + 1.7, p.z);
    updateFlow(A.D, p.x - o.x, p.z - o.z);
    // Walls stop creatures too (same push-out as a Descent).
    for (const e of A.creatures) {
      if (!e?.alive) continue;
      const q = e.position, rad = 0.45 * (e.mesh?.scale?.x || 1);
      for (const { box: b } of A.colliders) {
        if (q.x + rad < b.min.x || q.x - rad > b.max.x || q.z + rad < b.min.z || q.z - rad > b.max.z) continue;
        const cx = Math.max(b.min.x, Math.min(q.x, b.max.x)), cz = Math.max(b.min.z, Math.min(q.z, b.max.z));
        const dx = q.x - cx, dz = q.z - cz, d = Math.hypot(dx, dz);
        if (d > 1e-4) { if (d < rad) { q.x += dx / d * (rad - d); q.z += dz / d * (rad - d); } }
        else { const m = [q.x - b.min.x, b.max.x - q.x, q.z - b.min.z, b.max.z - q.z]; const k = m.indexOf(Math.min(...m)); if (k === 0) q.x = b.min.x - rad; else if (k === 1) q.x = b.max.x + rad; else if (k === 2) q.z = b.min.z - rad; else q.z = b.max.z + rad; }
      }
    }
    if (Math.hypot(p.x - o.x, p.z - o.z) > A.R + 6) this.exit('You come up into the daylight.');
  }

  exit(msg) {
    const A = this.active; if (!A) return;
    const c = this.ctx;
    c.scene.remove(A.group);
    A.owned.geos.forEach(g => g.dispose()); A.owned.mats.forEach(m => m.dispose());
    A.group.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
    c.scene.remove(A.lantern);
    c.chunkManager.colliders = c.chunkManager.colliders.filter(k => k.mesh !== A.group);
    for (const n of A.nodes) {
      c.scene.remove(n.mesh);
      const i = c.chunkManager.harvestNodes.indexOf(n); if (i >= 0) c.chunkManager.harvestNodes.splice(i, 1);
    }
    for (const e of A.creatures) if (e?.alive) { e.alive = false; e.destroy?.(); }
    c.chunkManager.terrainGen.flatZone = null;
    c.chunkManager.setRealmMode(false);
    const back = this._returnPos;
    if (back) {
      // Out of the mouth, a step downhill so E does not send you straight back.
      c.player.position.set(back.x, c.chunkManager.getGroundY(back.x, back.z) + 1, back.z);
      c.player.velocity?.set(0, 0, 0);
      c.chunkManager.update(back.x, back.z);
    }
    c.spawner.realmHold = false;
    atmosphere.setCaveDark(0);
    this.active = null;
    if (msg) c.notify(msg);
  }
}

export const caveSystem = new CaveSystem();
