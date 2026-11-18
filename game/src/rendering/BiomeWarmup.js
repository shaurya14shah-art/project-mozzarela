// ══════════════════════════════════════════════════════════
// BiomeWarmup — compile a biome's shaders BEFORE you walk into it
//
// Measured (playability pass): entering an unseen biome compiled up to
// 198 new shader programs on the spot — volcanic wastes froze for 1.2 s,
// the jungle 0.8 s, the tundra 1.0 s. The programs differ by feature
// flags (maps present, vertex colours, transparency …) across each
// biome's own props, not by injected code, so cutting variants would
// mean touching every prop. Instead: compile them early.
//
// Every half second, look at the biomes within WARM_RADIUS chunks that
// are not yet loaded or warmed. For the nearest, build a SAMPLE of its
// props with ChunkManager's own generators (trees, rocks, clutter, bone
// fields, realm landmarks — the ones with no gameplay side effects;
// structures register sites and are skipped) at a far, unused chunk
// coordinate, lift them out of the scene into a private group, compile
// them a few objects per frame with compileAsync (KHR_parallel_shader_
// compile where available), then clean up exactly as an unloaded chunk
// is cleaned (colliders, harvest nodes, mixers, geometry).
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { WORLD } from '../data/constants.js';
import { ENEMY_TYPES } from '../entities/Enemy.js';
import { forgeCreature } from './EntityForge.js';
import { makeBody } from '../systems/CompositionSystem.js';
import { siteSystem } from '../systems/SiteSystem.js';

const WARM_RADIUS = 4;          // chunks (~256 m) — well ahead of the load ring
const PER_FRAME = 2;            // objects compiled (and drawn once, unseen) per frame
const SAMPLE_CX = 7000;         // far, never-visited chunk coordinates for samples

export class BiomeWarmup {
  constructor(cm, renderer, scene, camera) {
    Object.assign(this, { cm, renderer, scene, camera });
    this.warmed = new Set();
    this._t = 0;
    this._busy = false;
    this._n = 0;
    this.log = [];
  }

  update(dt, pos) {
    if (this._busy) return;
    this._t -= dt;
    if (this._t > 0) return;
    this._t = 0.5;
    // Whatever is already loaded has been drawn, so it is compiled.
    for (const c of this.cm.chunks.values()) if (c.biome?.key) this.warmed.add(c.biome.key);
    const S = WORLD.CHUNK_SIZE, pcx = Math.floor(pos.x / S), pcz = Math.floor(pos.z / S);
    let best = null, bestD = Infinity;
    for (let dz = -WARM_RADIUS; dz <= WARM_RADIUS; dz++) for (let dx = -WARM_RADIUS; dx <= WARM_RADIUS; dx++) {
      const b = this.cm.biomeManager.getBiomeForChunk(pcx + dx, pcz + dz);
      if (!b?.key || this.warmed.has(b.key)) continue;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = b; }
    }
    if (best) this._warm(best);
  }

  async _warm(biome) {
    this._busy = true;
    this.warmed.add(biome.key);
    const t0 = performance.now();
    const cm = this.cm, cx = SAMPLE_CX + (this._n++), cz = SAMPLE_CX;
    let objs = [];
    try {
      if (biome.treeDensity > 0) objs.push(...cm._generateTrees(cx, cz, biome));
      if (biome.rockDensity > 0) objs.push(...cm._generateRocks(cx, cz, biome));
      if (biome.boneField) objs.push(...cm._generateGodBones(cx, cz));
      if (biome.hollowed || biome.drowned || biome.deadCity || biome.chasm) objs.push(...cm._generateRealmLandmarks(cx, cz, biome));
      objs.push(...cm._generateClutter(cx, cz, biome));
      // Structures too — their only side effect is registering a looted
      // SITE, so registration is stubbed while the sample is built (a site
      // at a sample coordinate would be a phantom on the map).
      const reg = siteSystem.register;
      siteSystem.register = () => null;
      try {
        // Several tries: a structure appears in only some chunks.
        for (let k = 0; k < 6; k++) objs.push(...cm._generateWildernessStructures(cx + k * 3, cz + 1, biome));
      } finally { siteSystem.register = reg; }
      // The creatures that spawn here — their materials hitched on entry too.
      for (const idx of biome.enemyTypes || []) {
        const t = ENEMY_TYPES[idx];
        if (!t) continue;
        const m = forgeCreature(t.id, makeBody(t.id).dominant, t.scale || 1);
        if (m) objs.push(m);
      }
    } catch (e) {
      console.warn('[BiomeWarmup] sample failed for', biome.key, e);
    }
    // Out of the world, into a private group: never drawn, only compiled.
    const group = new THREE.Group();
    for (const o of objs) { o.parent?.remove(o); group.add(o); }
    let compiled = 0;
    try {
      for (let i = 0; i < objs.length; i += PER_FRAME) {
        const batch = new THREE.Group();
        for (const o of objs.slice(i, i + PER_FRAME)) batch.add(o);
        if (this.renderer.compileAsync) await this.renderer.compileAsync(batch, this.camera, this.scene);
        else this.renderer.compile(batch, this.camera, this.scene);
        compiled += batch.children.length;
        // ⚠️ compileAsync covers each object's OWN material only. The
        // shadow-map depth variants and the AO pass's normal-override
        // variants compile only when the object is actually DRAWN — and
        // those were most of what still hitched on entry. So draw the
        // batch for one frame, 3 m BEHIND the camera with culling off:
        // every pass runs its shaders, nothing reaches the screen.
        const cam = this.camera;
        batch.position.copy(cam.position).add(new THREE.Vector3(0, 0, 3).applyQuaternion(cam.quaternion));
        batch.traverse(o => { if (o.isMesh || o.isInstancedMesh) { o.userData._fc = o.frustumCulled; o.frustumCulled = false; } });
        this.scene.add(batch);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        this.scene.remove(batch);
        batch.traverse(o => { if (o.userData && '_fc' in o.userData) { o.frustumCulled = o.userData._fc; delete o.userData._fc; } });
        batch.position.set(0, 0, 0);
        for (const o of [...batch.children]) group.add(o);
        await new Promise(r => requestAnimationFrame(r));
      }
    } catch (e) {
      console.warn('[BiomeWarmup] compile failed for', biome.key, e);
    }
    // Clean up exactly as ChunkManager._unloadChunk does for decorations.
    for (const dec of objs) {
      group.remove(dec);
      if (dec.geometry) dec.geometry.dispose();
      else dec.traverse?.(o => { if (o.isMesh && o.geometry && !o.geometry.userData?.shared) o.geometry.dispose(); });
      const h = cm.harvestNodes.findIndex(n => n.mesh === dec);
      if (h !== -1) cm.harvestNodes.splice(h, 1);
      const c = cm.colliders.findIndex(k => k.mesh === dec);
      if (c !== -1) cm.colliders.splice(c, 1);
    }
    if (cm._animatedMixers?.length) cm._animatedMixers = cm._animatedMixers.filter(a => !objs.includes(a.group));
    cm._lightCacheDirty = true;
    this.log.push({ biome: biome.key, objects: compiled, ms: Math.round(performance.now() - t0) });
    this._busy = false;
  }
}
