// ══════════════════════════════════════════════════════════
// Chunk Manager — Load/Unload Terrain Chunks Around Player
// ══════════════════════════════════════════════════════════

import { buildFeatures, forgetChunk } from './WorldFeatures.js';
import { blendHydro } from './Hydrology.js';
import { WaterSystem } from '../rendering/Water.js';
import * as THREE from 'three';
import { WORLD, ELEMENTS, MATERIAL_TIERS } from '../data/constants.js';
import { realmRegionAt } from '../data/realm.js';
import { TerrainGenerator } from './TerrainGenerator.js';
import { BiomeManager } from './BiomeManager.js';
import { sceneManager } from '../rendering/SceneManager.js';
import { eventBus, Events } from '../core/EventBus.js';
import { pickupManager } from '../entities/Pickup.js';
import { MATERIALS, DROPS } from '../data/materials.js';
import { getItem, registerItem } from '../data/itemRegistry.js';
import {
  forgeTree, forgeDeadTree, forgeRock, forgeShard, forgeRuin, forgeMonolith,
  forgeWallSegment, forgeTower, forgeGravemarker, forgeLandmark, forgeDescentGate,
  forgeKeep, forgeBrazier, forgeWell, forgeStall,
  // ⚠️ Imported EXPLICITLY. `vite build` does not fail on a missing
  // import whose call site is only reached at runtime (trap #18), so
  // an unimported forge here would build green and throw the first
  // time a player walked into Godgrave.
  forgeRib, forgeVertebra, forgeGodSkull,
  forgeCaveMouth, forgeStoneArch, forgeWreck, forgeDrownedPillar,
  forgeBrokenStatue, forgeColossalWall, forgeChasmSpire,
  applyHDToPropCache, prewarmPropGeometry,
} from '../rendering/PropForge.js';
import { LANDMARKS } from '../data/landmarks.js';
// Scratch for the point-light budget — allocating a Vector3 per light
// per frame is exactly the kind of cost that pass exists to remove.
const _lightPos = new THREE.Vector3();
import { descentFromHash, DESCENT_LIST, gateForChunk, gatesNear } from '../data/descents.js';
// Registers the interactable half of every structure this file builds.
// ⚠️ ChunkManager builds the SHAPE; SiteSystem owns whether it can be
// used. Keeping them separate is what lets a site stay 'used' after
// its chunk has unloaded and streamed back in.
import { siteSystem } from '../systems/SiteSystem.js';
import { descentSystem } from '../systems/DescentSystem.js';
import { atmosphere } from '../rendering/Atmosphere.js';
import { modelLibrary } from '../rendering/ModelLibrary.js';
import { applyGroundLayers, GROUND_BY_BIOME } from '../rendering/TerrainLayers.js';
import { GRASS_BY_BIOME } from '../rendering/GrassField.js';
import { materialLibrary } from '../rendering/MaterialLibrary.js';
import { quality } from '../rendering/Quality.js';
import { npcManager } from '../entities/NPCManager.js';
import { NPC } from '../entities/NPC.js';
import { ELDER_DIALOGUE, OSTRA, LORE_FRAGMENTS, ELDER_POST_FINALE, OSTRA_POST_FINALE } from '../data/story.js';
import { SANCTUARY_NPCS } from '../data/sanctuary.js';

// Where each found-journal lore fragment sits, deterministically —
// spread across the hub's immediate chunks so early exploration keeps
// turning them up without needing a long trek. {x, z} are chunk-local
// offsets, not world coordinates.
const LORE_SPAWN_CHUNKS = [
  { cx: 0,  cz: 0,  id: 'first_pioneer_journal',    x: 12,  z: -8  },
  { cx: 1,  cz: 0,  id: 'sanctuary_census',          x: 6,   z: -10 },
  { cx: -1, cz: 0,  id: 'volatile_field_warning',    x: -8,  z: 6   },
  { cx: 0,  cz: 1,  id: 'elder_confession_fragment', x: 4,   z: 10  },
  { cx: 0,  cz: -1, id: 'the_harvest_hymn',           x: -6,  z: -12 },
  { cx: 1,  cz: 1,  id: 'attuned_wanderers_letter',   x: 8,   z: 8   },
  { cx: -1, cz: -1, id: 'mithril_core_rumor',         x: -10, z: -8  },
  { cx: 2,  cz: 0,  id: 'farmwifes_tally',            x: -14, z: 10  },
  { cx: 0,  cz: 2,  id: 'foundation_masons_log',      x: 10,  z: -16 },
  { cx: -2, cz: 0,  id: 'healers_missing_ledger',     x: 12,  z: -6  },
  { cx: 0,  cz: -2, id: 'cartographers_margin_note',  x: -8,  z: 14  },
  { cx: 2,  cz: -1, id: 'childs_counting_rhyme',      x: -12, z: -10 },
];

// ── Real-model scale helpers ──────────────────────────────────
// The MegaKit props and owner alchemy/grimoire items are embedded at
// whatever raw scale their source files used — never assumed to
// already match this game's units. Same measure-then-derive technique
// EntityForge.js uses for the Knight/Skeleton (`_scaleFactorForHeight`
// there): a real Box3 on the instantiated group, then a scale factor
// from a target size judged per kind of object. `_scaleFactorForSize`
// is the same idea but keyed off the largest dimension rather than
// height, for things that read by their footprint, not their height
// (a coiled rope, a laid-flat scroll).
function _scaleFactorForHeight(object3D, targetHeight) {
  const box = new THREE.Box3().setFromObject(object3D);
  const size = box.getSize(new THREE.Vector3());
  if (!size.y || !isFinite(size.y) || size.y <= 0) return 1;
  return targetHeight / size.y;
}

function _scaleFactorForSize(object3D, targetSize) {
  const box = new THREE.Box3().setFromObject(object3D);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (!maxDim || !isFinite(maxDim) || maxDim <= 0) return 1;
  return targetSize / maxDim;
}

export class ChunkManager {
  constructor(seed = 42) {
    console.log('[ChunkManager] Seed:', seed);
    this.terrainGen = new TerrainGenerator(seed);
    this.biomeManager = new BiomeManager(seed);
    this.chunks = new Map(); // key: "x,z" -> { mesh, decorations, biome }
    this.terrainGroup = new THREE.Group();
    this.decorationGroup = new THREE.Group();
    this.currentBiome = null;
    this.harvestNodes = []; // Array of { mesh, type, hp, maxHp, position }
    this.colliders = []; // NEW: Array of { box, mesh } for physical collision
    this.npcRegistered = new Set(); // Track spawned NPCs per world ID

    // Real-model props with an actual AnimationMixer (currently just
    // the library corner's grimoire) — { mixer, group } pairs, driven
    // from updateEntities(dt) below, which already runs every frame
    // from main.js's loop. Entries are dropped when their owning
    // chunk unloads (see _unloadChunk) so this never grows unbounded.
    this._animatedMixers = [];

    // Toon material for terrain
    this.terrainMaterial = null;

    // Shared geometry/material caches for the clutter pass (small ground
    // debris — see _createDebris). Kept local to ChunkManager rather than
    // routed through PropForge's caches, since these are a cheaper,
    // separate throwaway tier (1-2 primitives, no shadows, no colliders),
    // not a new entry in the shared prop system.
    this._clutterGeoCache = new Map();
    this._clutterMatCache = new Map();

    // Pending chunk builds. See update() / drainChunkQueue() — chunks
    // are built a few per frame under a time budget rather than all at
    // once, because one build is tens of milliseconds of synchronous
    // main-thread work.
    this._chunkQueue = [];
    this._queued = new Set();
    /** Overworld chunks parked while inside a Descent realm. */
    this._stash = null;
  }

  init() {
    sceneManager.add(this.terrainGroup);
    // Lakes, rivers, the sea, puddles (rendering/Water.js) — per chunk.
    this.water = new WaterSystem(this);
    sceneManager.add(this.water.group);
    sceneManager.add(this.decorationGroup);

    // Fog closes in exactly as far as terrain is actually kept loaded,
    // so the render-distance edge reads as weather, not a pop-in wall.
    atmosphere.setDrawDistance(this.renderDistance * WORLD.CHUNK_SIZE);

    // PBR terrain material with per-vertex color (biome blend + baked
    // noise/slope variation from TerrainGenerator). This was still a
    // leftover MeshToonMaterial — not routed through sceneManager.
    // createToonMaterial, so the SceneManager/Atmosphere PBR rewrite never
    // touched it — which meant the actual ground mesh kept its flat toon
    // shading regardless of any other change. color is left white so the
    // vertex colors multiply in cleanly with no double-darkening; matte,
    // rough terrain, no metalness.
    this.terrainMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0.0,
    });

    console.log('[ChunkManager] Initialized');
  }

  /**
   * Re-skin the world with HD PBR surface detail. Called once from
   * main.js after MaterialLibrary reports the texture sets loaded.
   *
   * This is a single call rather than per-chunk work because every
   * chunk mesh shares `this.terrainMaterial` — mutating that one
   * material re-skins chunks already in the scene AND every chunk
   * generated later, with no bookkeeping.
   *
   * The terrain keeps `vertexColors: true`. That is deliberate and
   * important: the per-biome palettes in BiomeManager (13 of them,
   * hand-tuned) live in those vertex colours, and the triplanar shader
   * is written to modulate luminance around them rather than replace
   * them. Volcanic Wastes stays black-red and Frozen Tundra stays
   * blue-white; both simply gain real surface relief.
   */
  /**
   * How many chunks each way are kept loaded. Tier-driven — see
   * Quality.js's note for why this stopped being the hardcoded
   * WORLD.RENDER_DISTANCE = 1 (a 192-unit-wide world hidden behind
   * fog). Falls back to the constant if a tier omits it.
   */
  get renderDistance() {
    const base = quality.settings.renderDistance ?? WORLD.RENDER_DISTANCE;
    // ⚠️ A Descent is a BOUNDED arena, 40–88 units across, inside a
    // visible boundary you cannot leave without aborting. Streaming a
    // full 3-chunk radius there builds 25 chunks to render a space
    // that fits in about 9 — measured 25 queued on entry, ~13ms each,
    // and the same again on the way out. The fog closes in down there
    // anyway (Atmosphere's descent thickening), so nothing past the
    // boundary was ever visible to begin with.
    if (this.realmMode) return Math.min(base, 1);
    return base;
  }

  /**
   * How many chunks each way keep their PROPS visible. Always <=
   * renderDistance — see Quality.js for the measurement that forced
   * these apart (13,194 meshes / 11.3M triangles when they were one
   * number).
   */
  get decorationDistance() {
    return quality.settings.decorationDistance ?? this.renderDistance;
  }

  /**
   * Show props only on nearby chunks; distant chunks keep their terrain
   * (one draw call) and drop their scatter (dozens to hundreds).
   *
   * Toggles `.visible` rather than adding/removing from the scene:
   * re-parenting hundreds of objects every time the player crosses a
   * chunk line would cost more than it saves, and an invisible object
   * is skipped at traversal with no draw call either way.
   */
  /**
   * Keep only the nearest N point lights switched on.
   *
   * ⚠️⚠️ THIS IS THE LAG. Braziers, crystal shards, Descent Gates and
   * firepits each add a real PointLight, and they accumulate: measured
   * at **34 visible point lights** in ordinary play.
   *
   * Two costs, and the second is the one that hurts:
   *   1. Every light multiplies fragment work in every lit material.
   *   2. Three.js bakes the LIGHT COUNT into each shader program. Every
   *      time the number of active lights changes — i.e. every time a
   *      chunk with a brazier streams in — every material in the scene
   *      recompiles. Measured at **667ms** for one such frame.
   *
   * Holding the count CONSTANT is what fixes (2), which is why this
   * toggles `.visible` on a fixed-size budget rather than adding and
   * removing lights. Distant ones go dark; the count never moves, so
   * the shaders never recompile.
   */
  _updatePointLightBudget(px, pz) {
    // ⚠️ SUPERSEDED by rendering/LightPool.js (perf pass). This only
    // engaged above eight lights, so below eight every light added or
    // removed still recompiled every shader; and it wrote `.visible` on
    // lights the pool now reads as INTENT — two writers to one field
    // (trap #9). The pool holds the light count fixed at all times.
    return;
    // eslint-disable-next-line no-unreachable
    const BUDGET = 8;
    this._lightCache ||= [];
    // Rebuilt only when the prop set changes, not per frame — walking
    // the whole scene graph every frame to find lights would itself be
    // a cost worth avoiding.
    if (this._lightCacheDirty !== false) {
      this._lightCache = [];
      // ⚠️ Walk the whole SCENE, not just decorationGroup. Prop lights
      // live in several places — the hub's braziers, Descent Gates,
      // crystal shards, firepits — and budgeting only one group left
      // 24 of 67 lights burning. The core rig (ambient / hemi / the two
      // directionals) is excluded by the isPointLight test itself, so
      // sun and sky can never be switched off by this.
      sceneManager.scene?.traverse(o => {
        if (o.isPointLight) this._lightCache.push(o);
      });
      this._lightCacheDirty = false;
    }
    const lights = this._lightCache;
    if (!lights.length) return;

    // Nearest-first by squared distance; no sort when we are already
    // under budget, which is the common case away from the hub.
    if (lights.length <= BUDGET) {
      for (const l of lights) l.visible = true;
      return;
    }
    const scored = lights.map(l => {
      l.getWorldPosition(_lightPos);
      return { l, d: (_lightPos.x - px) ** 2 + (_lightPos.z - pz) ** 2 };
    });
    scored.sort((a, b) => a.d - b.d);
    for (let i = 0; i < scored.length; i++) scored[i].l.visible = i < BUDGET;
  }

  _updateDecorationVisibility(px, pz) {
    const d = this.decorationDistance * WORLD.CHUNK_SIZE;
    // Compared squared, and against chunk CENTRES — a per-object
    // distance test over ~13k props would itself be the cost this is
    // meant to avoid.
    const limitSq = (d + WORLD.CHUNK_SIZE) * (d + WORLD.CHUNK_SIZE);
    for (const [key, chunk] of this.chunks) {
      if (!chunk.decorations?.length) continue;
      const [cx, cz] = key.split(',').map(Number);
      const dx = cx * WORLD.CHUNK_SIZE + WORLD.CHUNK_SIZE / 2 - px;
      const dz = cz * WORLD.CHUNK_SIZE + WORLD.CHUNK_SIZE / 2 - pz;
      const show = dx * dx + dz * dz <= limitSq;
      if (chunk._decoShown === show) continue;   // only touch on change
      chunk._decoShown = show;
      for (const o of chunk.decorations) o.visible = show;
    }
  }

  applyHDMaterials() {
    if (!materialLibrary.ready) return;

    // `rock` over `dirt` as the single terrain detail set: the world's
    // silhouette is dominated by cliffs, monoliths and broken ground,
    // and rock's high normal-map contrast reads at the distances the
    // player actually sees terrain from. Dirt's finer grain washes out
    // past ~15m and costs the same three samples.
    materialLibrary.applyTriplanar(this.terrainMaterial, 'rock', {
      // 6.5 world units per repeat. Tiling is always a compromise
      // between visible repetition (too large) and a noisy, scaleless
      // surface (too small). At a 1.62m eye height this puts roughly
      // four repeats across the near ground plane, which reads as
      // rock rather than as gravel or as wallpaper.
      scale: 6.5,
      // Albedo detail kept well under 1: the biome vertex colour is
      // the art direction and must stay dominant. This is texture
      // *breakup*, not a texture *replacement*.
      detail: 0.55,
      // Pushed above 1 on purpose. The terrain is low-poly with a
      // gentle normal field, so an exaggerated bump is what sells
      // relief that the geometry itself does not have.
      normalScale: 1.35,
      sharpness: 4.0,
      aoStrength: 0.85,
      // Macro variation. The terrain is the one surface in the game
      // seen at every distance from 1m to the fog wall, so it is the
      // one that most needs a second scale — a single 6.5m repeat is
      // right underfoot and reads as smeared wallpaper at 60m.
      macro: 7.3,
      macroMix: 0.55,
    });
    // Real soil / grass / sand / snow on flat ground (realism pass) —
    // rendering/TerrainLayers.js. Cliffs keep the rock above.
    applyGroundLayers(this.terrainMaterial);

    console.log('[ChunkManager] HD triplanar terrain material applied');

    // Props built during init (the spawn chunks) cached their
    // materials before the textures existed — upgrade those in place.
    applyHDToPropCache();

    // Build every geometry variant pool now, while the loading screen
    // is still up. Deferred, this is a ~75ms hitch the first time the
    // player walks somewhere with trees in it.
    prewarmPropGeometry();
  }

  // Update chunks based on player position
  update(playerX, playerZ) {
    // ⚠️ THROTTLED. Both of these were running EVERY FRAME, and while
    // the player is moving a chunk loads or unloads almost every frame,
    // which marks the light cache dirty and forces a full scene-graph
    // traverse (thousands of nodes) plus a sort — per frame.
    //
    // Measured over 180 frames of realistic running: median frame went
    // 37.3ms (27fps) with these unthrottled versus ~8ms (120fps)
    // standing still. Neither pass needs to be frame-accurate: a prop
    // popping in a fifth of a second late is invisible, and a light
    // switching a fifth of a second late even more so.
    this._visTimer = (this._visTimer || 0) + 1;
    if (this._visTimer >= 12) {
      this._visTimer = 0;
      this._updateDecorationVisibility(playerX, playerZ);
      this._updatePointLightBudget(playerX, playerZ);
    }
    const chunkX = Math.floor(playerX / WORLD.CHUNK_SIZE);
    const chunkZ = Math.floor(playerZ / WORLD.CHUNK_SIZE);
    const range = this.renderDistance;
    // ⚠️ Recorded BEFORE anything reads `_lodResFor`, which needs it.
    // Left unset it defaults to chunk (0,0) and every chunk in the
    // world would be graded against the origin instead of the player —
    // the LOD would be correct only at spawn.
    const _lodMoved = (this._playerChunkX !== chunkX || this._playerChunkZ !== chunkZ);
    this._playerChunkX = chunkX;
    this._playerChunkZ = chunkZ;

    // ── Load new chunks — BUDGETED, not all at once ───────
    //
    // This used to call _loadChunk() directly inside the loop, for
    // every missing chunk, every frame. One chunk costs ~30-70ms to
    // build (terrain mesh + biome sampling + prop scatter), all of it
    // synchronous on the main thread. Walking across a chunk boundary
    // needs three new chunks at once, so the loop produced a ~200ms
    // freeze — twelve dropped frames — every time the player crossed
    // a line. That is the stutter, and raising chunk resolution made
    // it several times worse.
    //
    // Now: missing chunks go into a queue sorted by distance, and
    // _drainChunkQueue() (called from the frame loop) builds them
    // under a strict per-frame time budget. The world fills in over a
    // few frames instead of stopping the game dead.
    const neededChunks = new Set();
    for (let x = chunkX - range; x <= chunkX + range; x++) {
      for (let z = chunkZ - range; z <= chunkZ + range; z++) {
        const key = `${x},${z}`;
        neededChunks.add(key);
        if (!this.chunks.has(key) && !this._queued.has(key)) {
          this._queued.add(key);
          this._chunkQueue.push({ key, cx: x, cz: z });
        }
      }
    }

    // Nearest-first, so the ground under and immediately around the
    // player appears before anything at the edge of the draw distance.
    if (this._chunkQueue.length > 1) {
      this._chunkQueue.sort((a, b) =>
        ((a.cx - chunkX) ** 2 + (a.cz - chunkZ) ** 2) -
        ((b.cx - chunkX) ** 2 + (b.cz - chunkZ) ** 2));
    }

    // Drop anything queued that has since left the needed set (the
    // player turned around before it was ever built).
    if (this._chunkQueue.length) {
      this._chunkQueue = this._chunkQueue.filter(c => {
        if (neededChunks.has(c.key)) return true;
        this._queued.delete(c.key);
        return false;
      });
    }

    // Unload distant chunks
    for (const [key, chunkData] of this.chunks) {
      if (!neededChunks.has(key)) {
        this._unloadChunk(key, chunkData);
      }
    }

    // ⚠️ Only when the player CHANGED CHUNK, and only one per crossing.
    // Ring membership cannot change without crossing a chunk line, so
    // checking every frame would re-walk the loaded set for a result
    // that provably has not moved. One rebuild per crossing spreads the
    // upgrades over the frames that follow, alongside the queue drain
    // rather than competing with it in a single frame.
    // ⚠️ Upgrades are now DRAINED under the frame budget (see
    // drainChunkQueue), not one per crossing. One per crossing left up
    // to four of the chunks right around the player at QUARTER
    // resolution for many crossings — a coarse mesh metres off the real
    // ground, which the owner saw as "phasing through the terrain".
    if (_lodMoved) this._lodDirty = true;

    // Detect biome change
    const biome = this.biomeManager.getBiomeForChunk(chunkX, chunkZ);
    if (biome !== this.currentBiome) {
      this.currentBiome = biome;
      eventBus.emit(Events.BIOME_ENTER, biome);

      // Biomes nudge how thick the air is, but Atmosphere owns its
      // colour — otherwise crossing into the hub reset the fog to
      // near-white and undid the path's whole art direction.
      //
      // Published as a MULTIPLIER rather than written onto
      // scene.fog.density directly. Weather now also scales fog, and
      // Atmosphere.update() re-derives the density from the palette
      // every frame to compose the two — a direct write here would be
      // silently overwritten on the very next frame, and the per-biome
      // variation would vanish.
      if (biome.fogDensity) {
        atmosphere.setBiomeFog(0.6 + biome.fogDensity * 40);
      }
    }
  }

  /**
   * Build queued chunks under a per-frame time budget.
   *
   * Called once per frame from main.js's update(). The budget is the
   * whole point: a chunk cannot be built in a piece smaller than one
   * chunk (the mesh generator is not re-entrant), so this cannot
   * guarantee it never overruns — but it CAN guarantee it never builds
   * a second chunk in a frame that has already spent its budget, which
   * is the difference between one long frame and four of them back to
   * back.
   *
   * `budgetMs` is deliberately well under a 16.7ms frame: the rest of
   * the frame still has to run the game and render it.
   */
  drainChunkQueue(budgetMs = 6) {
    if (!this._chunkQueue.length && !this._decoQueue?.length && !this._lodDirty) return 0;
    const start = performance.now();
    let built = 0;
    // Always build at least one — otherwise on a machine slow enough
    // that the budget is gone before this runs, the queue would never
    // drain and the world would never appear.
    if (this._chunkQueue.length) do {
      const next = this._chunkQueue.shift();
      if (!next) break;
      this._queued.delete(next.key);
      if (this.chunks.has(next.key)) continue;
      this._loadChunk(next.cx, next.cz);
      built++;
    } while (this._chunkQueue.length && performance.now() - start < budgetMs);
    // Then decoration steps, one at a time while budget remains (and at
    // least one per frame, so a slow machine still fills the world in).
    let decoDone = 0;
    while (this._decoQueue?.length && (performance.now() - start < budgetMs || decoDone === 0)) { this._decoStep(); decoDone++; }
    // Then any chunk that has come close and still wears a coarse mesh,
    // nearest first, while budget remains — but always at least one if
    // the chunk under/next to the player is still coarse.
    if (this._lodDirty) {
      let upgraded = 0;
      while (performance.now() - start < budgetMs || (upgraded === 0 && this._nearCoarse())) {
        if (!this._upgradeChunkLOD(1)) { this._lodDirty = false; break; }
        upgraded++;
      }
    }
    return built;
  }

  /** True when a chunk in the player's own 3×3 is below full resolution. */
  _nearCoarse() {
    const pcx = this._playerChunkX ?? 0, pcz = this._playerChunkZ ?? 0;
    for (let x = pcx - 1; x <= pcx + 1; x++) for (let z = pcz - 1; z <= pcz + 1; z++) {
      const g = this.chunks.get(`${x},${z}`)?.mesh?.geometry;
      if (g?.userData?.lodRes && g.userData.lodRes < this._lodResFor(x, z)) return true;
    }
    return false;
  }

  /** True while terrain is still streaming in — for a loading cue. */
  get isStreaming() { return this._chunkQueue.length > 0 || (this._decoQueue?.length ?? 0) > 0; }

  /**
   * Ground height at a world position — ANALYTIC, not raycast.
   *
   * ⚠️ This is the single most performance-critical function in the
   * game. Read before changing anything here.
   *
   * Ground detection used to be a downward `Raycaster.intersectObject(
   * terrainGroup, true)` — once per frame for the player, and once per
   * frame for EVERY enemy. That walks the whole terrain BVH and tests
   * triangles. It was tolerable when a chunk was 1,152 triangles; it
   * became the game's dominant cost the moment chunk resolution went
   * up, because the loaded 3x3 set is now ~93,000 triangles and the
   * cost is per-entity, per-frame.
   *
   * But the raycast was never necessary. The terrain mesh is generated
   * FROM a pure function of (x, z) — `TerrainGenerator._getHeight()`.
   * Asking the mesh where the ground is, when we can just evaluate the
   * function that produced the mesh, is doing expensive geometry work
   * to recover an answer we could compute directly.
   *
   * This is O(1), allocation-free, exact (it is the same function the
   * vertices came from), and works even where no chunk is loaded.
   */
  getGroundY(x, z) {
    // ⚠️ THE DRAWN SURFACE WINS where a chunk mesh exists. Measured over
    // 26 chunk crossings: the mesh sits 0.8 m from the exact function on
    // average, 2.7 m at p95 and up to 17.8 m on cliffs — so anything
    // standing on the function (player, enemies, props) floated or sank
    // through what the player could see. Falls back to the exact
    // function where nothing is drawn yet.
    const m = this.getMeshGroundY(x, z);
    if (m != null) return m;
    return this.getTrueGroundY(x, z);
  }

  /** The exact terrain function, ignoring what is drawn. */
  getTrueGroundY(x, z) {
    const bw = this.biomeManager.getBiomeWeights(x, z);
    let hs = 0, rg = 0, mtn = 0, plat = 0;
    for (const b of bw) {
      const bi = b.biome;
      hs   += (WORLD.TERRAIN_HEIGHT_SCALE * (bi.heightScale || 1.0)) * b.weight;
      rg   += (bi.roughness      || 0.5) * b.weight;
      mtn  += (bi.mountainFactor || 0.0) * b.weight;
      plat += (bi.plateauFactor  || 0.0) * b.weight;
    }
    blendHydro(bw, this.terrainGen._hy);
    return this.terrainGen._getHeight(x, z, hs, rg, mtn, plat);
  }

  /**
   * Ground height ON THE VISIBLE MESH at (x, z), or null where no chunk
   * mesh is loaded.
   *
   * ⚠️ getGroundY() is the exact terrain function; the mesh is that
   * function sampled on a grid and drawn as flat triangles between the
   * samples. On rough ground, and above all on a coarse LOD chunk, the
   * two disagree by up to metres — the player stood on the function
   * while the drawn surface rose over their eye ("phasing through the
   * terrain"). The PLAYER stands on what is drawn: this interpolates the
   * chunk's own triangle (same diagonal as TerrainGenerator's index
   * order: a,c,b / b,c,d — the b–c diagonal). O(1), no allocation.
   */
  getMeshGroundY(x, z) {
    const S = WORLD.CHUNK_SIZE;
    const cx = Math.floor(x / S), cz = Math.floor(z / S);
    const g = this.chunks.get(`${cx},${cz}`)?.mesh?.geometry;
    const res = g?.userData?.lodRes;
    if (!res) return null;
    const P = g.attributes.position.array, cols = res + 1, seg = S / res;
    const lx = (x - cx * S) / seg, lz = (z - cz * S) / seg;
    const ix = Math.min(res - 1, Math.max(0, Math.floor(lx))), iz = Math.min(res - 1, Math.max(0, Math.floor(lz)));
    const u = lx - ix, v = lz - iz;
    const a = iz * cols + ix, b = a + 1, c = a + cols, d = c + 1;
    const ha = P[a * 3 + 1], hb = P[b * 3 + 1], hc = P[c * 3 + 1], hd = P[d * 3 + 1];
    return (u + v <= 1)
      ? ha + (hb - ha) * u + (hc - ha) * v
      : hd + (hc - hd) * (1 - u) + (hb - hd) * (1 - v);
  }

  /**
   * The water at (x, z): { bed, surf, river, sea } or null (dry).
   * `bed` is getGroundY — the carved floor you stand on. Also leaves the
   * ground height in `this.lastGroundY` for callers that need it either way.
   */
  getWaterAt(x, z) {
    const y = this.getGroundY(x, z);
    this.lastGroundY = y;
    const tg = this.terrainGen;
    if (tg._wSurf > y + 0.01) return { bed: y, surf: tg._wSurf, river: tg._wRiver, sea: tg._wSea };
    return null;
  }

  /**
   * Tear down and re-generate every loaded chunk.
   *
   * Needed because of a load-order problem: the spawn chunks are built
   * eagerly during initGame() so the player has ground to stand on,
   * but the ~10MB photoscanned nature set is still downloading at that
   * point. Those chunks therefore get procedural rocks and trees, and
   * because chunk contents are built once and cached, they would keep
   * them for the whole session — the world would be photoscanned
   * everywhere EXCEPT the area the player starts in and looks at first.
   *
   * Rebuilding is cheap enough to do here (a handful of chunks, and it
   * happens while the loading screen is still up), and far simpler
   * than trying to hot-swap individual props inside a built chunk.
   */
  rebuildAllChunks() {
    this._flushDeco();
    const keys = [...this.chunks.keys()];
    for (const key of keys) {
      const data = this.chunks.get(key);
      if (data) this._unloadChunk(key, data);
    }
    for (const key of keys) {
      const [cx, cz] = key.split(',').map(Number);
      this._loadChunk(cx, cz);
    }
    console.log(`[ChunkManager] rebuilt ${keys.length} chunks with real nature models`);
  }

  // Update logic called by main loop
  updateEntities(dt, playerPos) {
    npcManager.update(dt, playerPos);

    // Ambient idle animation for any real-model prop that shipped
    // with clips (currently just the library corner's grimoire) —
    // see _buildLibraryCorner.
    for (const anim of this._animatedMixers) {
      anim.mixer.update(dt);
    }
  }

  // ══════════════════════════════════════════════════════════
  // TERRAIN LOD — resolution by ring distance
  //
  // ⚠️ Every chunk used to be built at the full tier resolution no
  // matter how far away it was. Measured live at `high` (res 64) by
  // instrumenting TerrainGenerator: 4,225 vertices and **38,420
  // simplex evaluations per chunk**. With renderDistance 2 that is a
  // 5x5 grid — ~105,000 vertices and **~960,500 noise evaluations** to
  // fill the view — while the outer ring sits 128+ world units out,
  // where a vertex every 0.57m is far below what the screen resolves.
  //
  // The handoff concluded the residual chunk cost was "raw simplex
  // evaluation, inherent to the height function". True per vertex —
  // but it never asked how many vertices the distant rings need. At
  // `high` this takes the loaded set from 105,625 vertices to ~55,400
  // (-47%), and the noise evaluations with it.
  //
  // ⚠️ HALVING, NOT ARBITRARY. Each level must divide the base cleanly
  // so a low-res chunk's edge vertices land exactly ON a subset of its
  // high-res neighbour's, and must stay EVEN so the normals pass keeps
  // STRIDE 2 (an odd res drops it to STRIDE 1 and puts the far edge
  // off-lattice — the lighting seam this project already fixed once).
  // Every tier res (24 / 40 / 64 / 72) halves twice and stays even.
  // ══════════════════════════════════════════════════════════
  _lodResFor(cx, cz) {
    const base = quality.settings.chunkResolution || WORLD.CHUNK_RESOLUTION;
    const pcx = this._playerChunkX ?? 0;
    const pcz = this._playerChunkZ ?? 0;
    // Chebyshev ring, because the loaded set is a SQUARE. Euclidean
    // distance would give the four diagonal chunks of a ring a
    // different LOD from its four edge chunks, and the seam between
    // them would sit inside the ring rather than between rings.
    const ring = Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz));
    if (ring <= 1) return base;
    if (ring === 2) return Math.max(8, Math.floor(base / 2 / 2) * 2);
    return Math.max(8, Math.floor(base / 4 / 2) * 2);
  }

  /**
   * Rebuild the terrain mesh of chunks that have come CLOSER and now
   * deserve more resolution.
   *
   * ⚠️ UPGRADE ONLY, never downgrade. Downgrading a chunk the player
   * walked away from saves triangles but costs a full rebuild at the
   * exact moment they are moving — and moving is when the frame budget
   * is already committed to building the chunks ahead of them. Chunks
   * that leave the render distance are unloaded anyway, so a wrong LOD
   * never survives long enough to matter.
   *
   * ⚠️ Terrain mesh ONLY. Decorations, colliders and harvest nodes are
   * keyed to world positions, not to mesh resolution, so rebuilding
   * them would churn prop identity (and re-roll seeded scatter) for no
   * visual gain.
   *
   * ⚠️ Bounded per call. An upgrade is a full chunk mesh build; doing
   * every eligible chunk in one frame is exactly the synchronous stall
   * `drainChunkQueue` exists to prevent.
   */
  _upgradeChunkLOD(maxPerCall = 1) {
    if (this.realmMode) return 0;
    let done = 0;
    const pcx = this._playerChunkX ?? 0, pcz = this._playerChunkZ ?? 0;
    const order = [...this.chunks].sort((A, B) => {
      const [ax, az] = A[0].split(',').map(Number), [bx, bz] = B[0].split(',').map(Number);
      return Math.max(Math.abs(ax - pcx), Math.abs(az - pcz)) - Math.max(Math.abs(bx - pcx), Math.abs(bz - pcz));
    });
    for (const [key, data] of order) {
      if (done >= maxPerCall) break;
      const mesh = data.mesh;
      if (!mesh?.geometry) continue;
      const have = mesh.geometry.userData?.lodRes;
      if (!have) continue;
      const [cx, cz] = key.split(',').map(Number);
      const want = this._lodResFor(cx, cz);
      if (want <= have) continue;
      const geo = this.terrainGen.generateChunkMesh(cx, cz, this.biomeManager, want);
      mesh.geometry.dispose();
      mesh.geometry = geo;
      done++;
    }
    return done;
  }

  _loadChunk(cx, cz) {
    const key = `${cx},${cz}`;
    let biome = this.biomeManager.getBiomeForChunk(cx, cz);

    // Hub Override Area (Expanded to 2.5 chunks radius)
    const dist = Math.sqrt(cx * cx + cz * cz);
    const isHub = dist < 2.5;
    if (isHub) {
      // Was bright pastel mint-green terrain (0xccffcc/0xaaffaa) under
      // pale yellow fog — a cheerful meadow at the exact spawn point,
      // actually MORE saturated than the game's gentlest wilderness
      // biome (Plains), undercutting every dark-fantasy pass done
      // anywhere else. Reference hubs (Firelink Shrine, the Hunter's
      // Dream, Darkest Dungeon's Hamlet) read as "safe" through LOW
      // SATURATION and steady light, not through brightness or a
      // hue-swap to cheerful — the actual "safe" signal is meant to
      // come from small warm point-light accents (torches, sigils),
      // not the terrain colour itself. Kept in sync with
      // BiomeManager._hubBiome()'s identical palette so the hard
      // override here and its own soft blend ring don't seam.
      biome = {
        name: 'The Sanctuary',
        grass:  GRASS_BY_BIOME.plains,        // kept identical to BiomeManager._hubBiome()
        ground: GROUND_BY_BIOME.sanctuary,
        surface:     'wood',
        enemyTypes:  [],   // the hub is safe; the spawner also returns early on the name
        colors: {
          low:  new THREE.Color(0x40503f),
          mid:  new THREE.Color(0x62735a),
          high: new THREE.Color(0x8a9478),
          peak: new THREE.Color(0xd8d4c0),
        },
        heightScale: 0.4,
        roughness: 0.2,
        treeDensity: 0,
        rockDensity: 0,
        enemyDensity: 0,
        fogColor: new THREE.Color(0x9a9482),
        fogDensity: 0.0055,
        ambientLight: 0x3a4436,
      };
    }

    // Generate terrain mesh (Passing biomeManager for blending)
    let geometry = this.terrainGen.generateChunkMesh(cx, cz, this.biomeManager, this._lodResFor(cx, cz));
    
    // Flatten hub terrain visually
    if (isHub) {
      const positions = geometry.attributes.position.array;
      // ⚠️ SURFACE VERTICES ONLY. The geometry now carries a skirt ring
      // appended after the grid (TerrainGenerator's skirt block), and
      // clamping those to the same ceiling would pull the skirt up to
      // the surface height and collapse it — leaving the hub's chunk
      // borders with no crack cover at all. `surfaceVerts` is recorded
      // by the generator for exactly this.
      const surfaceVerts = geometry.userData.surfaceVertexCount ?? (positions.length / 3);
      for (let v = 0; v < surfaceVerts; v++) {
        const i = v * 3 + 1;
        positions[i] = Math.min(positions[i], 3); // flatten high spikes making a plateau
      }
      geometry.computeVertexNormals();
    }
    const mesh = new THREE.Mesh(geometry, this.terrainMaterial);
    mesh.position.set(cx * WORLD.CHUNK_SIZE, 0, cz * WORLD.CHUNK_SIZE);
    mesh.receiveShadow = true;
    mesh.userData.chunkKey = key;
    this.terrainGroup.add(mesh);

    // Generate decorations (trees, rocks, or Hub Structures)
    // ⚠️ STAGED. A chunk used to be built whole in one frame — terrain
    // mesh, then trees, rocks, clutter, structures, features, gates and
    // landmarks — and one chunk can't be split below that, so every
    // crossing was a 30–70 ms frame (owner: "laggy boundaries when
    // terrain shifts"). Now the terrain and water go in NOW (the ground
    // exists the frame it is needed) and each decoration group is its
    // own step in `_decoQueue`, drained under the same frame budget a
    // step at a time. CHUNK_LOADED fires when the last step lands.
    const data = { mesh, decorations: [], biome, water: isHub ? null : this.water?.buildChunk(cx, cz, biome), decorating: true };
    this.chunks.set(key, data);
    this._lightCacheDirty = true;
    const decorations = data.decorations;
    const steps = [];
    if (isHub) {
      steps.push(() => {
        const cityProps = this._buildCityHub(cx, cz);
        this.decorationGroup.add(...cityProps);
        decorations.push(...cityProps);
        this._spawnHubNPCs(cx, cz);
      });
    } else {
      if (biome.treeDensity > 0) steps.push(() => { decorations.push(...this._generateTrees(cx, cz, biome)); });
      if (biome.rockDensity > 0) steps.push(() => { decorations.push(...this._generateRocks(cx, cz, biome)); });
      if (biome.hollowed || biome.drowned || biome.deadCity || biome.chasm) steps.push(() => {
        const marks = this._generateRealmLandmarks(cx, cz, biome);
        if (marks.length) this.decorationGroup.add(...marks);
        decorations.push(...marks);
      });
      if (biome.boneField) steps.push(() => {
        const bones = this._generateGodBones(cx, cz);
        if (bones.length) this.decorationGroup.add(...bones);
        decorations.push(...bones);
      });
      steps.push(() => { decorations.push(...this._generateClutter(cx, cz, biome)); });
      steps.push(() => {
        const structures = this._generateWildernessStructures(cx, cz, biome);
        if (structures.length) this.decorationGroup.add(...structures);
        decorations.push(...structures);
      });
      if (!this.realmMode) steps.push(() => { decorations.push(...buildFeatures(this, cx, cz, biome)); });
    }
    if (!this.realmMode) {
      steps.push(() => {
        const gateProps = this._generateDescentGate(cx, cz);
        if (gateProps.length) { this.decorationGroup.add(...gateProps); decorations.push(...gateProps); }
      });
      steps.push(() => {
        const landmarkProps = this._buildLandmarks(cx, cz);
        if (landmarkProps.length) { this.decorationGroup.add(...landmarkProps); decorations.push(...landmarkProps); }
      });
    }
    (this._decoQueue ||= []).push({ key, cx, cz, data, steps, biome });
  }

  /** Run one queued decoration step. Returns false when there was none. */
  _decoStep() {
    const q = this._decoQueue;
    if (!q?.length) return false;
    // Nearest chunk first, like the terrain queue.
    const pcx = this._playerChunkX ?? 0, pcz = this._playerChunkZ ?? 0;
    let bi = 0, bd = Infinity;
    for (let k = 0; k < q.length; k++) { const d = (q[k].cx - pcx) ** 2 + (q[k].cz - pcz) ** 2; if (d < bd) { bd = d; bi = k; } }
    const job = q[bi];
    // Unloaded (or stashed) before it finished: drop the rest.
    if (this.chunks.get(job.key) !== job.data) { q.splice(bi, 1); return true; }
    const step = job.steps.shift();
    if (step) step();
    if (!job.steps.length) {
      q.splice(bi, 1);
      job.data.decorating = false;
      this._lightCacheDirty = true;   // a new chunk may have brought lights
      eventBus.emit(Events.CHUNK_LOADED, { cx: job.cx, cz: job.cz, biome: job.biome });
    }
    return true;
  }

  /** Finish every pending decoration now (before stashing/rebuilding). */
  _flushDeco() { let n = 0; while (this._decoStep() && n++ < 10000) { /* drain */ } }

  /**
   * Set realm mode and STASH the chunks of the world being left.
   *
   * ⚠️ Entering and leaving a Descent used to throw away every loaded
   * chunk in both directions — measured 25 rebuilt on the way in and
   * 25 on the way out, ~13ms each, so a round trip cost roughly 650ms
   * of frame stalls for terrain the player had already paid for once.
   * Realm coordinates are ~873,000 units away so the keys cannot
   * collide; the overworld's meshes are simply parked out of the scene
   * graph and put back on return.
   *
   * ⚠️ Geometry is NOT disposed here — that is the whole point. The
   * stash is bounded by the render distance (tens of chunks), and it
   * is cleared on restore, so it cannot grow.
   */
  setRealmMode(on) {
    const want = !!on;
    if (want === this.realmMode) return;
    this._flushDeco();   // a stashed chunk must not be left half-decorated

    if (want) {
      // Leaving the overworld: park it.
      this._stash = new Map(this.chunks);
      for (const data of this._stash.values()) {
        this.terrainGroup.remove(data.mesh);
        for (const dec of data.decorations) this.decorationGroup.remove(dec);
      }
      this.chunks.clear();
      this._dropQueue();
      this.realmMode = true;
      return;
    }

    // Returning: throw away the realm, put the overworld back.
    for (const [key, data] of [...this.chunks.entries()]) this._unloadChunk(key, data);
    this._dropQueue();
    this.realmMode = false;

    if (this._stash) {
      for (const [key, data] of this._stash.entries()) {
        this.terrainGroup.add(data.mesh);
        for (const dec of data.decorations) this.decorationGroup.add(dec);
        this.chunks.set(key, data);
      }
      this._stash = null;
      // Lights came back with the props.
      this._lightCacheDirty = true;
    }
  }

  /** Forget anything queued but not yet built. */
  _dropQueue() {
    this._chunkQueue.length = 0;
    this._queued.clear();
  }

  _unloadChunk(key, chunkData) {
    this._lightCacheDirty = true;   // its lights are going with it

    // ⚠️ Drop this chunk's SITES from the live registry.
    // `siteSystem.register()` is called on every build and nothing was
    // ever removing them, so the map grew for as long as the session
    // ran — measured 17 → 105 after streaming a modest area, and it
    // never came down. `nearest()` scans it every frame from
    // updateInteraction. The per-entry cost is tiny (0.003ms at 105),
    // which is exactly why this would never have announced itself —
    // it just grows.
    // ⚠️ `used` is deliberately NOT touched: a looted cache stays
    // looted whether or not its chunk is currently in memory. That is
    // the whole point of the used set being separate from the live one.
    const [ux, uz] = key.split(',').map(Number);
    if (Number.isFinite(ux) && Number.isFinite(uz)) {
      const half = WORLD.CHUNK_SIZE / 2;
      const cxMin = ux * WORLD.CHUNK_SIZE - half, cxMax = cxMin + WORLD.CHUNK_SIZE * 1.5;
      const czMin = uz * WORLD.CHUNK_SIZE - half, czMax = czMin + WORLD.CHUNK_SIZE * 1.5;
      siteSystem.forget(st => st.x >= cxMin && st.x < cxMax && st.z >= czMin && st.z < czMax);
    }
    if (Number.isFinite(ux) && Number.isFinite(uz)) forgetChunk(ux, uz);
    // Remove terrain
    this.terrainGroup.remove(chunkData.mesh);
    chunkData.mesh.geometry.dispose();
    this.water?.disposeChunk(chunkData.water);

    // Remove decorations & Harvest Nodes
    for (const dec of chunkData.decorations) {
      if (dec.geometry) dec.geometry.dispose();
      this.decorationGroup.remove(dec);
      
      // Remove from harvest array if it was one
      const hIdx = this.harvestNodes.findIndex(n => n.mesh === dec);
      if (hIdx !== -1) {
        this.harvestNodes.splice(hIdx, 1);
      }

      // Remove from colliders if it was one
      const cIdx = this.colliders.findIndex(c => c.mesh === dec);
      if (cIdx !== -1) {
        this.colliders.splice(cIdx, 1);
      }
    }

    // Drop any animated real-model mixers this chunk owned (see
    // _animatedMixers doc comment in the constructor) so they don't
    // keep updating after their group has left the scene.
    if (this._animatedMixers.length) {
      this._animatedMixers = this._animatedMixers.filter(
        (a) => !chunkData.decorations.includes(a.group)
      );
    }

    this.chunks.delete(key);
    eventBus.emit(Events.CHUNK_UNLOADED, { key });
  }

  _generateTrees(cx, cz, biome) {
    const trees = [];
    const positions = this.terrainGen.getDecorationPositions(cx, cz, biome.treeDensity, biome, this.biomeManager);

    for (const pos of positions) {
      const tree = this._createTree(pos, biome);
      this.decorationGroup.add(tree);
      trees.push(tree);
    }
    return trees;
  }

  /**
   * The dead god's remains, across Godgrave.
   *
   * ══════════════════════════════════════════════════════════
   * ⚠️ THE SPINE IS CONTINUOUS ACROSS CHUNKS, and that is the whole
   * technique. Scattering ribs randomly per chunk gives a desert with
   * bones in it; running ONE analytic curve through world space and
   * asking each chunk "does the spine pass through me, and where?"
   * gives a single skeleton kilometres long that the player can walk
   * the length of. The second is Godgrave; the first is set dressing.
   *
   * The curve is a pure function of world X — no state, no chunk
   * ordering dependency, no seam — so two adjacent chunks agree about
   * where the spine is without ever talking to each other. Same
   * reasoning as the analytic height field.
   *
   * ⚠️ Ribs come in MIRRORED PAIRS about the spine and lean outward.
   * A single row of arcs reads as a fence; two opposed rows read as a
   * ribcage you are standing inside.
   * ══════════════════════════════════════════════════════════
   */
  _generateGodBones(cx, cz) {
    const out = [];
    const S = WORLD.CHUNK_SIZE;
    const originX = cx * S, originZ = cz * S;

    // ══════════════════════════════════════════════════════
    // ⚠️ THE SPINE MUST LIE INSIDE THE REGION THAT NAMES IT.
    //
    // This curve was written BEFORE data/realm.js existed, when
    // Godgrave was a climate tendency with no location, so it ran a
    // fixed path near the world origin. The moment Godgrave became a
    // mapped place at (3900, 2600), the god's skeleton and the region
    // named after it stopped intersecting — the biome was correct, the
    // bones were correct, and they were kilometres apart. Standing at
    // Godgrave's own centre produced **0 bones**.
    //
    // The curve is now anchored to whichever bone-field region this
    // chunk belongs to, so every such region gets its own skeleton
    // through its own middle. Godgrave, the Sea of Sand and the Bone
    // Crypt each have one.
    //
    // ⚠️ Still a pure function of world X *given the anchor*, so
    // adjacent chunks inside a region agree without communicating —
    // the property the whole cross-chunk spine depends on.
    // ══════════════════════════════════════════════════════
    const region = realmRegionAt(originX + S * 0.5, originZ + S * 0.5);
    const anchorX = region ? region.x : 0;
    const anchorZ = region ? region.z : 0;
    const spineZAt = (wx) => anchorZ
      + Math.sin((wx - anchorX) * 0.0016) * 210
      + Math.sin((wx - anchorX) * 0.0007) * 90;

    // Walk this chunk's X span and place a vertebra every ~14 units
    // wherever the spine actually falls inside the chunk.
    const STEP = 14;
    const startI = Math.floor(originX / STEP);
    const endI = Math.ceil((originX + S) / STEP);

    for (let i = startI; i <= endI; i++) {
      const wx = i * STEP;
      const wz = spineZAt(wx);
      if (wz < originZ || wz >= originZ + S) continue;
      if (wx < originX || wx >= originX + S) continue;

      const h = this.terrainGen.getHeightAt(wx, wz, this.biomeManager);
      const rng = Math.abs(this._hashInt(i * 7919)) % 1000 / 1000;

      // ⚠️ Sunk into the ground, not resting on it. A bone sitting on
      // the surface reads as a prop that was placed; one emerging from
      // it reads as something the sand has been burying for a very
      // long time, which is the entire mood of this place.
      const vert = forgeVertebra(4.5 + rng * 3.5, 1);
      vert.position.set(wx, h - 1.4 - rng * 1.2, wz);
      vert.rotation.y = rng * 6.28;
      out.push(vert);

      // A rib pair every third vertebra, alternating which side leads
      // so the cage is not perfectly symmetric.
      if (i % 3 === 0) {
        for (const side of [-1, 1]) {
          const rngR = Math.abs(this._hashInt(i * 104729 + side)) % 1000 / 1000;
          const height = 16 + rngR * 16;
          const rib = forgeRib(height, 1, side * (0.20 + rngR * 0.22));
          const rx = wx + side * 2.5;
          const rz = wz + (rngR - 0.5) * 5;
          const rh = this.terrainGen.getHeightAt(rx, rz, this.biomeManager);
          rib.position.set(rx, rh - 1.0, rz);
          rib.rotation.y = (rngR - 0.5) * 0.7 + (side < 0 ? Math.PI : 0);
          rib.scale.x = side;   // mirror, so both sides arc outward
          out.push(rib);
        }
      }
    }

    // ⚠️ THE SKULL IS RARE AND DETERMINISTIC — one specific chunk on
    // the spine, not a probability. A skull you might meet twice in a
    // region is a monster; a skull there is exactly one of is a place.
    // ⚠️ Keyed to the REGION's own chunk column, so each bone-field
    // region gets exactly one skull near its middle rather than
    // whichever chunks happen to land on a global multiple of 47 —
    // which, with the spine now anchored per region, could give one
    // region three skulls and another none.
    const regionCx = Math.round(anchorX / S);
    if (region && Math.abs(cx - regionCx) <= 1) {
      const wx = originX + S * 0.5;
      const wz = spineZAt(wx);
      if (wz >= originZ && wz < originZ + S) {
        const h = this.terrainGen.getHeightAt(wx, wz, this.biomeManager);
        const skull = forgeGodSkull(24, 1);
        // Half-buried: the jaw is under the sand line.
        skull.position.set(wx, h - 5.5, wz);
        skull.rotation.y = 0.6;
        skull.rotation.z = -0.12;
        out.push(skull);
      }
    }
    return out;
  }

  /**
   * The signature structures of the four non-Godgrave realm biomes.
   *
   * ⚠️ ONE function, dispatching on the biome's declared flag, rather
   * than four near-identical scatter loops. The placement rules
   * (deterministic hash, ground-conforming, sparse) are the part that
   * is easy to get subtly different between copies, and a wreck that
   * sits 2 units higher than a cave mouth for no reason is exactly the
   * kind of drift this avoids.
   *
   * ⚠️ SPARSE ON PURPOSE. These are 9–30 unit structures; at tree
   * density they would tile the horizon and stop reading as landmarks.
   * One per chunk at most, and most chunks get none.
   */
  _generateRealmLandmarks(cx, cz, biome) {
    const out = [];
    const S = WORLD.CHUNK_SIZE;
    const h0 = this._hashInt(cx * 73856093 ^ cz * 19349663);
    // ~1 chunk in 3 carries a structure. Read from the hash's HIGH
    // bits: the low bits of this mix are the ones the position draws
    // from below, and reusing them would correlate "is there a
    // structure" with "where is it" (trap #3's family).
    if (((h0 >>> 22) % 3) !== 0) return out;

    const rx = ((h0 >>> 4) & 0xff) / 255;
    const rz = ((h0 >>> 12) & 0xff) / 255;
    const rv = ((h0 >>> 18) & 0x0f) / 15;
    const wx = cx * S + 8 + rx * (S - 16);
    const wz = cz * S + 8 + rz * (S - 16);
    // ⚠️ The BLENDED height, like every other prop — see the note on
    // getDecorationPositions. These are the largest props in the game
    // and a mismatch here is the most visible one.
    const gy = this.terrainGen.getHeightAt(wx, wz, this.biomeManager);

    let prop = null;
    let sink = 0.5;
    if (biome.hollowed) {
      // A cave mouth needs a slope to be bored INTO; on flat ground it
      // reads as a doorway standing in a field. Arches work anywhere,
      // so the slope decides which of the two this chunk gets.
      const slope = Math.abs(this.terrainGen.getHeightAt(wx + 6, wz, this.biomeManager) - gy)
                  + Math.abs(this.terrainGen.getHeightAt(wx, wz + 6, this.biomeManager) - gy);
      prop = slope > 5
        ? forgeCaveMouth(0.9 + rv * 0.5)
        : forgeStoneArch(13 + rv * 10, 1);
      sink = 1.2;
    } else if (biome.drowned) {
      prop = rv > 0.45 ? forgeWreck(0.8 + rv * 0.5) : forgeDrownedPillar(8 + rv * 7, 1);
      // Deeper: the shore is burying these, which is the whole mood.
      sink = 1.8;
    } else if (biome.deadCity) {
      prop = rv > 0.5 ? forgeBrokenStatue(22 + rv * 16, 1) : forgeColossalWall(20 + rv * 14, 1);
      sink = 1.0;
    } else if (biome.chasm) {
      prop = forgeChasmSpire(18 + rv * 14, 1);
      sink = 2.5;
    }
    if (!prop) return out;

    prop.position.set(wx, gy - sink, wz);
    prop.rotation.y = rv * Math.PI * 2;
    out.push(prop);
    return out;
  }

  /** Small integer hash for deterministic bone variation. */
  _hashInt(n) {
    let h = (n ^ 0x9e3779b9) | 0;
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) | 0;
  }

  _generateRocks(cx, cz, biome) {
    const rocks = [];
    const positions = this.terrainGen.getDecorationPositions(cx, cz, biome.rockDensity, biome, this.biomeManager);

    for (const pos of positions) {
      const rock = this._createRock(pos, biome);
      this.decorationGroup.add(rock);
      rocks.push(rock);
    }
    return rocks;
  }

  _generateClutter(cx, cz, biome) {
    const clutter = [];
    const positions = this.terrainGen.getClutterPositions(cx, cz, biome, this.biomeManager);

    for (const pos of positions) {
      const piece = this._createDebris(pos, biome);
      this.decorationGroup.add(piece);
      clutter.push(piece);
    }
    return clutter;
  }

  _clutterGeo(key, build) {
    if (!this._clutterGeoCache.has(key)) this._clutterGeoCache.set(key, build());
    return this._clutterGeoCache.get(key);
  }

  _clutterMat(hex, rough = 0.95, metal = 0.0) {
    const key = `${hex}:${rough}:${metal}`;
    if (!this._clutterMatCache.has(key)) {
      this._clutterMatCache.set(key, new THREE.MeshStandardMaterial({
        // Smooth-shaded at HD tiers — see the note on FACET_ORGANIC in
        // EntityForge.js. Clutter is grass tufts, pebbles and debris:
        // all organic, none of it improved by hard facets.
        color: hex, roughness: rough, metalness: metal,
        flatShading: !quality.isHD,
      }));
    }
    return this._clutterMatCache.get(key);
  }

  /**
   * A single piece of ground debris — a rock chip or a bone fragment.
   * Placed by TerrainGenerator.getClutterPositions, biased toward
   * slopes and cliff bases. Deliberately cheaper than a full prop:
   * 1-2 shared-geometry meshes, no shadow casting, not registered as a
   * harvest node or collider — this is pure set dressing meant to break
   * up bare flat ground, not a second resource-gathering system.
   */
  _createDebris(pos, biome) {
    const group = new THREE.Group();
    const isBone = pos.variant > 0.72;

    if (isBone) {
      // Bone fragment — dry, pale-grey rather than clean bone-china
      // white, in keeping with the tarnished/desaturated ground palette.
      const boneMat = this._clutterMat(0x6b6153, 0.88, 0.0);
      const shaftGeo = this._clutterGeo('bone-shaft', () => new THREE.CapsuleGeometry(0.06, 0.55, 2, 4));

      const a = new THREE.Mesh(shaftGeo, boneMat);
      a.scale.setScalar(pos.scale);
      a.rotation.set(Math.PI / 2 + (pos.rotation % 0.6) - 0.3, pos.rotation, 0);
      group.add(a);

      // A second, smaller shaft on roughly a third of bone pieces so
      // clutter doesn't read as one single stick repeated everywhere.
      if (pos.variant > 0.88) {
        const b = new THREE.Mesh(shaftGeo, boneMat);
        b.scale.setScalar(pos.scale * 0.72);
        b.position.set(0.16 * pos.scale, 0.02 * pos.scale, 0.12 * pos.scale);
        b.rotation.set(Math.PI / 2.3, pos.rotation + 1.1, 0.35);
        group.add(b);
      }
    } else {
      // Broken stone / rock chip — the same crushed-icosahedron
      // language PropForge's forgeRock uses, tinted darker/flatter
      // since this is loose rubble, not a harvestable boulder.
      const tint = atmosphere
        .gradeColor((biome?.colors?.high || new THREE.Color(0x555049)).clone().multiplyScalar(0.38))
        .getHex();
      const stoneMat = this._clutterMat(tint, 0.97, 0.0);

      const mainGeo = this._clutterGeo('debris-main', () => new THREE.IcosahedronGeometry(0.28, 0));
      const main = new THREE.Mesh(mainGeo, stoneMat);
      main.scale.set(pos.scale, pos.scale * 0.6, pos.scale * 0.9);
      main.rotation.set(pos.rotation, pos.rotation * 1.7, pos.rotation * 0.6);
      group.add(main);

      // A trailing chip on most pieces so the silhouette isn't a
      // single perfect lump.
      if (pos.variant > 0.35) {
        const chipGeo = this._clutterGeo('debris-chip', () => new THREE.IcosahedronGeometry(0.14, 0));
        const chip = new THREE.Mesh(chipGeo, stoneMat);
        chip.position.set(0.22 * pos.scale, -0.05 * pos.scale, -0.16 * pos.scale);
        chip.rotation.set(pos.rotation * 2, pos.rotation, pos.rotation * 0.4);
        chip.scale.setScalar(pos.scale * 0.7);
        group.add(chip);
      }
    }

    group.position.set(pos.x, pos.y, pos.z);
    group.rotation.y = pos.rotation;
    group.traverse(o => { if (o.isMesh) o.receiveShadow = true; }); // no castShadow — same call as PropForge's set dressing
    return group;
  }

  _createTree(pos, biome) {
    if (Math.random() < 0.1) return this._createEldertree(pos, biome);

    // Foliage takes the biome's colour, graded into the path's weather
    // so a wood never reads as cartoon green against an ember sky.
    const leafColor = atmosphere
      .gradeColor(biome.colors.mid.clone().multiplyScalar(0.85 + pos.noiseValue * 0.25))
      .getHex();
    const barkColor = atmosphere.gradeColor(new THREE.Color(0x3a2a1c)).getHex();

    // Scorched ground keeps its dead — a bare, forked silhouette.
    // Dead trees DOMINATE. Two reasons.
    //
    // First, art direction: a bare, forked silhouette against an ember
    // sky is the dark-fantasy read the owner asked for. A dense stand
    // of leafy living trees reads as a pleasant grove, which is the
    // opposite.
    //
    // Second, this was another instance of the noiseValue bug (see
    // _createTree's rotation note): the condition used to be
    // `pos.noiseValue > 0.72`, but placement only happens where
    // noiseValue < density (0.04-0.2), so that test was NEVER true —
    // every single tree in the world was a living one, and the dead
    // variant was unreachable code.
    //
    // 78/22 split, rolled from the per-cell rng.
    const group = Math.random() < 0.78
      ? forgeDeadTree(pos.scale * 1.4)
      : forgeTree(pos.scale * 1.4, { leaf: leafColor, bark: barkColor });

    group.position.set(pos.x, pos.y, pos.z);
    // `pos.rotation` (proper per-cell rng), NOT `pos.noiseValue * 6.28`.
    //
    // Placement only happens where noiseValue < density, and density is
    // a small number (0.04-0.2), so every prop that got placed had a
    // LOW noiseValue by construction — meaning that expression produced
    // nearly the SAME angle for every tree and rock in the world. They
    // were all facing the same way. getDecorationPositions() has always
    // returned a properly random `rotation`; it just was not being read.
    group.rotation.y = pos.rotation;
    // A slight lean off vertical. Perfectly plumb trunks in identical
    // poses are one of the strongest "this is placed by a loop" tells.
    group.rotation.x = pos.tiltX ?? 0;
    group.rotation.z = pos.tiltZ ?? 0;

    // Register as Harvestable Node
    // ⚠️ WORLD EXPANSION: the WOOD a tree gives is the biome's — ash in
    // the burnt lands, heartwood among the old forest, spiritwood in the
    // jungle now and then — and it needs a woodsman's axe that hard.
    const bk = biome?.key;
    const wood = bk === 'volcanic_wastes' || bk === 'ember_dunes' ? 'ash_wood'
      : bk === 'enchanted_forest' && Math.random() < 0.25 ? 'heartwood'
      : bk === 'sunken_mire' && Math.random() < 0.2 ? 'heartwood'
      : bk === 'living_jungle' && Math.random() < 0.12 ? 'spiritwood'
      : 'oak_wood';
    this.harvestNodes.push({
      mesh: group,
      type: 'tree', wood,
      hp: 30, // 3 hits
      maxHp: 30,
      position: new THREE.Vector3(pos.x, pos.y, pos.z)
    });
    
    return group;
  }

  _buildCityHub(cx, cz) {
    const props = [];
    const stoneMat = sceneManager.createToonMaterial(0xaaaaaa);
    const roofMat = sceneManager.createToonMaterial(0xcc3333);
    const woodMat = sceneManager.createToonMaterial(0x664422);

    const chunkX = cx * WORLD.CHUNK_SIZE;
    const chunkZ = cz * WORLD.CHUNK_SIZE;

    // Central Chunk (0,0): Main Hall and Town Square
    if (cx === 0 && cz === 0) {
      // A cracked flagstone floor, not a slab. flatShading kept on purpose:
      // this is a 9-sided low-poly drum, not a smooth cylinder — its top
      // is already flat and its 9 side faces are meant to read as distinct
      // angular stone panels/cracks, so smoothing the normals here would
      // fake a rounded silhouette the geometry doesn't have (the "faceted
      // pretending to be round" look). Genuinely angular constructed
      // stone, unlike organic/rolling terrain, so faceted shading is the
      // correct call per the anti-blocky research. roughness 0.95 matches
      // matte stone.
      // ⚠️ This was an untextured flat colour, and it is the single
      // largest continuous surface the player ever looks at — the whole
      // plaza floor. A flat-shaded solid at that scale is what "the
      // graphics look mid" is actually pointing at: no amount of detail
      // on the buildings compensates for the ground between them being
      // blank.
      //
      // 9 sides → 48: at 17m radius a 9-gon has visible straight edges
      // running across the town square. And the HD stonewall triplanar,
      // at a coarse scale so it reads as flagstones rather than brick.
      const squareMat = new THREE.MeshStandardMaterial({
        color: 0x6a6156, roughness: 0.92, flatShading: false,
      });
      if (materialLibrary.ready) {
        materialLibrary.applyTriplanar(squareMat, 'stonewall', {
          scale: 3.4, detail: 0.5, normalScale: 1.1, aoStrength: 0.75,
        });
      }
      const square = new THREE.Mesh(
        new THREE.CylinderGeometry(17, 18, 0.6, 48),
        squareMat,
      );
      square.position.set(chunkX, 0, chunkZ);
      square.receiveShadow = true;
      props.push(square);

      // ⚠️ This used to be `forgeRuin(2.2)` — "the hall lost its
      // argument with the Fracture a long time ago." It is now an
      // INTACT keep, and that is a deliberate reversal, not a
      // regression to fix back.
      //
      // The spawn was built with the same broken-masonry vocabulary as
      // the wilderness, which meant the player's home read exactly like
      // the thing it is supposed to be shelter FROM. Dread needs a
      // baseline: the walk out through the gate only lands if there is
      // somewhere warm behind you. Everything else in this file is
      // still broken on purpose; this one building is not.
      const keep = forgeKeep(1.0);
      keep.position.set(chunkX, 0, chunkZ - 11);
      props.push(keep);
      // A real wall. No shrink — but the corner towers still push the
      // AABB out past the body, so a small amount back.
      this._addCollider(keep, 0.1);

      // The plaza's centre — somewhere to gather around, and the
      // navigational "you are home" mark the monolith used to be.
      // ⚠️ At (0, +1) this sat ON the spawn point — its roof's AABB
      // covered the origin, so a new player materialised INSIDE a
      // collider and (before the depenetration fix in Player.js) could
      // not move at all. Moved off-axis, and given a tight collider
      // since the roof is the widest part and you should be able to
      // stand under it.
      const well = forgeWell(1.0);
      well.position.set(chunkX + 6, 0.3, chunkZ + 6);
      props.push(well);
      this._addCollider(well, 0.45);

      // Braziers. THE thing that makes this read as a safe town rather
      // than as un-ruined buildings in the dark — eight warm point
      // lights at head height around the plaza ring. Kept to eight:
      // they are real lights, and this is the only place in the game
      // that spends that many at once.
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.3;
        const bx = chunkX + Math.cos(a) * 13.5, bz = chunkZ + Math.sin(a) * 13.5;
        const br = forgeBrazier(1.0);
        br.position.set(bx, 0.3, bz);
        props.push(br);
      }

      // The training post — t2's target, and the one thing in the hub
      // it is safe to hit. Registered as a harvest node rather than an
      // enemy: an enemy inside the walls would be spawned by, and
      // fought with, the whole combat pipeline, and the Sanctuary's
      // guarantee is that nothing in here fights back.
      const post = new THREE.Group();
      const postMat = new THREE.MeshStandardMaterial({ color: 0x4a3722, roughness: 0.9, flatShading: true });
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 2.4, 8), postMat);
      trunk.position.y = 1.2;
      post.add(trunk);
      const arms = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 0.22), postMat);
      arms.position.y = 1.75;
      post.add(arms);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), postMat);
      head.position.y = 2.55;
      post.add(head);
      post.position.set(chunkX - 6, 0.3, chunkZ - 3);
      post.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      props.push(post);
      this.harvestNodes.push({
        mesh: post,
        type: 'training_post',
        // Effectively unbreakable — 9999 hp, so the tutorial's "swing
        // five times" can never be completed by destroying the thing
        // it is asking you to swing at.
        hp: 9999, maxHp: 9999,
        position: new THREE.Vector3(chunkX - 6, 0.3, chunkZ - 3),
      });

      // A market row along the plaza's east edge. Different cloth
      // colours so five stalls don't read as one prop copied five
      // times.
      const CLOTHS = [0x8c4a3a, 0x4a5c3a, 0x3a4a5c, 0x6b4a6b];
      for (let i = 0; i < 4; i++) {
        const stall = forgeStall(CLOTHS[i], 1.0);
        stall.position.set(chunkX + 11.5, 0.3, chunkZ - 4.5 + i * 3.2);
        stall.rotation.y = -Math.PI / 2;
        props.push(stall);
        // Mostly awning and air — only the counter is really solid.
        this._addCollider(stall, 0.5);
      }

      // Three themed exterior clusters dressing the plaza with the
      // curated real models — see each builder's doc comment. All
      // three are positioned clear of the flagstone's own hall/
      // monolith, Elder Aris (5,5 local), the lore drop (12,-8
      // local), and this chunk's own two building-scatter placements
      // (-10,-10 and 1,7 local) below.
      props.push(...this._buildAlchemistCorner(chunkX, chunkZ));
      props.push(...this._buildLibraryCorner(chunkX, chunkZ));
      props.push(...this._buildArmory(chunkX, chunkZ));
      props.push(...this._buildRestCorner(chunkX, chunkZ));

      // Broken fortification remnants ringing the whole plaza, well
      // outside every cluster above — see _buildSanctuaryWalls' doc
      // comment for the radius math and why it's deliberately not a
      // sealed ring.
      props.push(...this._buildSanctuaryWalls(chunkX, chunkZ));
    }

    // Residential/Shop Areas (Surrounding Chunks)
    // Use a deterministic pseudo-random approach based on chunk coords
    const hash = Math.abs(cx * 137 + cz * 149);
    const buildingCount = (hash % 3) + 2; // 2-4 buildings per chunk

    for (let i = 0; i < buildingCount; i++) {
        const bx = ((hash + i * 31) % 20) - 10;
        const bz = ((hash + i * 37) % 20) - 10;

        // Skip too close to origin if in center
        if (cx === 0 && cz === 0 && Math.abs(bx) < 5 && Math.abs(bz) < 5) continue;

        // A minority of these become a small real-model cluster
        // (crate/barrel/rope) instead of a procedural ruin/monolith —
        // same deterministic hash-based scheme as the alternation
        // below (a fresh multiplier, 53, so it doesn't correlate with
        // the position hash's 31/37 or the shape-choice hash's %3),
        // just a wider modulus (%5) so it's a clear minority. This is
        // an ALTERNATIVE within the existing per-building selection,
        // not an addition on top of it — `continue` skips the
        // ruin/monolith branch entirely for this i.
        const seedVal = hash + i * 53;
        const roll = seedVal % 10;
        if (roll < 5) {
          // Half of all scatter slots become a real structure now, not
          // just the supply cache — the wilds should read as somewhere
          // people used to be. Which one is deterministic per slot, so
          // a given seed always rebuilds the same world.
          //
          // ⚠️ The kind must be picked from a value INDEPENDENT of
          // `roll` — indexing KINDS[roll] directly was tried first and
          // is a bug: this whole block only runs when roll<5, so roll
          // can never be anything but 0-4, and any table entries at
          // index 5+ (where dungeon/graveyard were placed, to keep
          // them rarer than the other five) were unreachable dead
          // code. Verified empirically: dungeon/graveyard counts were
          // exactly zero across a wide sweep before this fix. Same bug
          // class as the noiseValue-gates-placement issue and the
          // wilderness version of this exact mistake — see
          // _generateWildernessStructures's own note on it.
          //
          // Math.floor(seedVal/10) is a different "digit" of the same
          // seed than seedVal%10 — decorrelated from the gate above by
          // construction, the same fix applied there.
          const KINDS = ['camp', 'stall', 'shrine', 'smithy', 'cache',
                         'camp', 'stall', 'smithy', 'dungeon', 'graveyard'];
          const kind = KINDS[Math.floor(seedVal / 10) % KINDS.length];
          const built = kind === 'cache' ? this._buildSupplyCache(chunkX + bx, chunkZ + bz, seedVal)
            : kind === 'graveyard' ? this._buildGraveyard(chunkX + bx, chunkZ + bz, seedVal)
            : this._buildStructure(kind, chunkX + bx, chunkZ + bz, seedVal);
          // If every model in the chosen structure failed to load, fall
          // through to the procedural ruin rather than leaving a hole.
          if (built.length) { props.push(...built); continue; }
        }

        // Alternating silhouettes so a settlement never reads as a
        // row of identical crates.
        const prop = ((hash + i) % 3 === 0)
          ? forgeMonolith(0.55 + (hash % 3) * 0.12)
          : forgeRuin(0.8 + (hash % 4) * 0.1);
        prop.position.set(chunkX + bx, 0, chunkZ + bz);
        props.push(prop);
        this._addCollider(prop, 0.35);
    }

    return props;
  }

  /**
   * Instantiate + measure-and-scale + place a single real-model prop
   * (see the scale-helper doc comment above the class). Returns null
   * — adding nothing, throwing nothing — if the template isn't
   * ready/failed to load, per ModelLibrary's contract; every call
   * site below null-checks this so a missing asset never blocks
   * world generation.
   */
  _placeRealProp(key, { height, size, position, rotationY = 0 } = {}) {
    const inst = modelLibrary.instantiate(key);
    if (!inst || !inst.group) return null;
    const { group, mixer, actions } = inst;

    const factor = height ? _scaleFactorForHeight(group, height)
      : size ? _scaleFactorForSize(group, size)
      : 1;
    if (factor !== 1) group.scale.setScalar(factor);

    if (position) group.position.copy(position);
    group.rotation.y = rotationY;
    group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

    return { group, mixer, actions };
  }

  /**
   * Alchemist's corner — exterior dressing, not a walk-in shop (this
   * game has no interior/building-entry concept). `prop:Cauldron`
   * anchors it; the loose `item:*` potion/bottle models — sourced
   * from a real alchemy workbench + bottle-shelf, so a loose scatter
   * reads right — sit around it like they were set down mid-use, plus
   * a standing torch for a lit-corner read. These alchemy items have
   * no inventory/pickup hook in this game's Potion System (ingredients
   * resolve straight into spells; there's no discrete potion item) —
   * this is pure world-flavor, same as the brief calls for.
   */
  _buildAlchemistCorner(chunkX, chunkZ) {
    const props = [];
    const ox = chunkX - 14, oz = chunkZ + 6;

    const cauldron = this._placeRealProp('prop:Cauldron', {
      height: 0.85, position: new THREE.Vector3(ox, 0, oz), rotationY: 0.4,
    });
    if (cauldron) { props.push(cauldron.group); this._addCollider(cauldron.group, 0.3); }

    const kit = this._placeRealProp('item:potion_starter_kit', {
      size: 0.5, position: new THREE.Vector3(ox + 1.6, 0, oz - 1.1), rotationY: 1.1,
    });
    if (kit) props.push(kit.group);

    const bottles = this._placeRealProp('item:potion_and_ingredients_bottles_witcher', {
      size: 0.55, position: new THREE.Vector3(ox - 1.0, 0, oz + 1.5), rotationY: 2.0,
    });
    if (bottles) props.push(bottles.group);

    const potion = this._placeRealProp('item:alchemical_potion', {
      height: 0.35, position: new THREE.Vector3(ox + 1.0, 0, oz + 1.7), rotationY: 0.7,
    });
    if (potion) props.push(potion.group);

    // The three colour-coded elixirs (health/mana/poison) had never
    // been placed anywhere — pure embedded weight with zero payoff.
    // Small huddle at the cauldron's foot, like a batch just finished.
    const elixirs = [
      ['item:potion_health_elixir_game_ready_asset', ox + 0.5, oz - 0.4, 0.2],
      ['item:potion_mana_elixir_game_ready_asset',   ox + 0.75, oz - 0.55, 1.6],
      ['item:potion_poison_elixir_game_ready_asset', ox + 0.25, oz - 0.65, 2.9],
    ];
    for (const [key, x, z, rotationY] of elixirs) {
      const e = this._placeRealProp(key, { height: 0.28, position: new THREE.Vector3(x, 0, z), rotationY });
      if (e) props.push(e.group);
    }

    const torch = this._placeRealProp('prop:Torch_Metal', {
      height: 1.5, position: new THREE.Vector3(ox - 2.2, 0, oz - 0.6),
    });
    if (torch) {
      props.push(torch.group);
      this._addCollider(torch.group, 0.45);

      // Warm-amber accent, the same "small point-light of safety"
      // language used elsewhere (forgeShard's crystal glow, the
      // Pickup/Player/NPC point lights) — no single established
      // "torch convention" lives in this file to match exactly, so
      // this is a modest warm-amber light of its own: comparable
      // intensity/range to those (0.8-intensity/7-range on
      // forgeShard, 0.5/3 on Pickup), tinted toward
      // Atmosphere.palette's own warm sun/key-light hue (0xffab68 /
      // 0xffcf9c) rather than a generic white torch glow.
      const light = new THREE.PointLight(0xffaa55, 0.9, 6);
      light.position.set(ox - 2.2, 1.6, oz - 0.6);
      props.push(light);
    }

    return props;
  }

  /**
   * Library corner — `prop:Bookcase_2` anchors it, loose books/
   * scrolls scattered around like someone's still working through
   * them, plus the owner-provided animated grimoire.
   */
  _buildLibraryCorner(chunkX, chunkZ) {
    const props = [];
    const ox = chunkX - 6, oz = chunkZ - 18;

    const bookcase = this._placeRealProp('prop:Bookcase_2', {
      height: 2.0, position: new THREE.Vector3(ox, 0, oz), rotationY: -0.3,
    });
    if (bookcase) { props.push(bookcase.group); this._addCollider(bookcase.group, 0.45); }

    const bookGroup = this._placeRealProp('prop:BookGroup_Small_1', {
      size: 0.3, position: new THREE.Vector3(ox + 1.3, 0, oz + 0.6), rotationY: 1.4,
    });
    if (bookGroup) props.push(bookGroup.group);

    const bookStack = this._placeRealProp('prop:Book_Stack_1', {
      height: 0.4, position: new THREE.Vector3(ox - 1.2, 0, oz + 0.9), rotationY: 0.6,
    });
    if (bookStack) props.push(bookStack.group);

    const scroll = this._placeRealProp('prop:Scroll_1', {
      size: 0.3, position: new THREE.Vector3(ox + 0.4, 0, oz + 1.6), rotationY: 2.3,
    });
    if (scroll) props.push(scroll.group);

    // The grimoire is a real rigged/animated glTF (same skinning
    // technique as the Knight/Skeleton). If it actually shipped with
    // clips, play whichever one exists — read straight off the
    // instantiated actions Map rather than guessing a clip name — as
    // a slow ambient idle, driven by updateEntities(dt) (see
    // _animatedMixers). If it has no clips, or fails to load, it just
    // sits there posed statically; no special-casing needed either
    // way since this is a `continue`-free scatter of independent
    // pieces.
    const grimoire = this._placeRealProp('item:grimoire___morphose', {
      size: 0.5, position: new THREE.Vector3(ox - 0.3, 0, oz - 1.4), rotationY: -0.8,
    });
    if (grimoire) {
      props.push(grimoire.group);
      if (grimoire.actions && grimoire.actions.size > 0) {
        const idleClip = grimoire.actions.values().next().value;
        idleClip.reset().play();
        this._animatedMixers.push({ mixer: grimoire.mixer, group: grimoire.group });
      }
    }

    return props;
  }

  /** Armory — `prop:WeaponStand` anchors it, spare weapons leaned/set around it. */
  _buildArmory(chunkX, chunkZ) {
    const props = [];
    const ox = chunkX + 18, oz = chunkZ - 2;

    const stand = this._placeRealProp('prop:WeaponStand', {
      height: 1.6, position: new THREE.Vector3(ox, 0, oz), rotationY: 2.6,
    });
    if (stand) { props.push(stand.group); this._addCollider(stand.group, 0.45); }

    const sword = this._placeRealProp('prop:Sword_Bronze', {
      height: 1.05, position: new THREE.Vector3(ox - 1.0, 0, oz + 2.0), rotationY: 0.5,
    });
    if (sword) props.push(sword.group);

    const axe = this._placeRealProp('prop:Axe_Bronze', {
      height: 1.0, position: new THREE.Vector3(ox + 1.5, 0, oz - 1.5), rotationY: 1.9,
    });
    if (axe) props.push(axe.group);

    const pick = this._placeRealProp('prop:Pickaxe_Bronze', {
      height: 1.0, position: new THREE.Vector3(ox + 1.5, 0, oz + 1.0), rotationY: 3.0,
    });
    if (pick) props.push(pick.group);

    const shield = this._placeRealProp('prop:Shield_Wooden', {
      size: 0.85, position: new THREE.Vector3(ox - 1.5, 0, oz - 1.0), rotationY: 0.9,
    });
    if (shield) props.push(shield.group);

    return props;
  }

  /**
   * Rest corner — a bench and table under a hanging chandelier, an
   * anvil and workbench a few steps off for the smithing half of it.
   * These props sat embedded and entirely unused after the first
   * integration pass; this is the fourth exterior cluster, opposite
   * the armory across the plaza.
   */
  _buildRestCorner(chunkX, chunkZ) {
    const props = [];
    // Clear of every other placement in this chunk: alchemist corner
    // (-14,+6), library corner (-6,-18), armory (+18,-2), hall (0,-10),
    // monolith (+12,+9), Elder Aris NPC (5,5), lore drop (12,-8), and
    // the two building-scatter picks (-10,-10)/(1,7).
    const ox = chunkX - 18, oz = chunkZ + 16;

    const table = this._placeRealProp('prop:Table_Large', {
      height: 0.75, position: new THREE.Vector3(ox, 0, oz), rotationY: 0.2,
    });
    if (table) { props.push(table.group); this._addCollider(table.group, 0.3); }

    const bench = this._placeRealProp('prop:Bench', {
      height: 0.5, position: new THREE.Vector3(ox - 1.5, 0, oz + 0.8), rotationY: 1.3,
    });
    if (bench) { props.push(bench.group); this._addCollider(bench.group, 0.45); }

    const chandelier = this._placeRealProp('prop:Chandelier', {
      size: 1.1, position: new THREE.Vector3(ox, 2.4, oz),
    });
    if (chandelier) props.push(chandelier.group);

    const chalice = this._placeRealProp('prop:Chalice', {
      height: 0.22, position: new THREE.Vector3(ox + 0.5, 0, oz - 0.4), rotationY: 0.6,
    });
    if (chalice) props.push(chalice.group);

    const mug = this._placeRealProp('prop:Mug', {
      height: 0.18, position: new THREE.Vector3(ox - 0.4, 0, oz - 0.3), rotationY: 2.1,
    });
    if (mug) props.push(mug.group);

    const vase = this._placeRealProp('prop:Vase_2', {
      height: 0.4, position: new THREE.Vector3(ox + 1.8, 0, oz + 1.4), rotationY: 1.0,
    });
    if (vase) props.push(vase.group);

    const candle = this._placeRealProp('prop:CandleStick_Stand', {
      height: 0.9, position: new THREE.Vector3(ox - 2.2, 0, oz - 1.2),
    });
    if (candle) {
      props.push(candle.group);
      // Same warm-amber small-light convention as the alchemist
      // corner's torch — a lit gathering spot, not just a prop pile.
      const light = new THREE.PointLight(0xffcf9c, 0.6, 5);
      light.position.set(ox - 2.2, 1.1, oz - 1.2);
      props.push(light);
    }

    const anvil = this._placeRealProp('prop:Anvil', {
      height: 0.75, position: new THREE.Vector3(ox + 3.2, 0, oz - 2.6), rotationY: 2.4,
    });
    if (anvil) { props.push(anvil.group); this._addCollider(anvil.group, 0.3); }

    const workbench = this._placeRealProp('prop:Workbench', {
      height: 0.9, position: new THREE.Vector3(ox + 4.6, 0, oz - 1.4), rotationY: 0.3,
    });
    if (workbench) { props.push(workbench.group); this._addCollider(workbench.group, 0.3); }

    return props;
  }

  // ── Wilderness structures ────────────────────────────────
  //
  // The wilds used to generate only trees, rocks, ground debris and
  // procedural ruin/monolith shapes, so everything outside the hub
  // read as untouched landscape — no sign anyone had ever lived
  // there. These are the traces: a camp someone left, a stall whose
  // trader is gone, a roadside shrine, an open-air smithy.
  //
  // Declarative on purpose. Each entry is
  //   [propKey, dx, dz, { height | size }, rotationY, collider?]
  // laid out around the cluster's own origin, so adding a structure
  // is a data edit rather than another bespoke builder function —
  // this file already carries four hand-written hub-cluster builders
  // and a fifth, sixth and seventh of those would be pure repetition.
  STRUCTURES = {
    camp: [
      ['prop:Bed_Twin1',      0,    0,   { height: 0.5 },  0.4, true],
      ['prop:Cauldron',       2.4, -0.6, { height: 0.7 },  1.2, true],
      ['prop:Crate_Wooden',  -1.8,  1.4, { height: 0.6 },  0.9, true],
      ['prop:Rope_1',         1.1,  1.9, { size: 0.5 },    2.2, false],
      ['prop:Bucket_Wooden_1', 3.2, 1.0, { height: 0.35 }, 0.0, false],
    ],
    stall: [
      ['prop:Stall_Empty',     0,   0,   { height: 2.2 },  0.2, true],
      ['prop:FarmCrate_Apple', 1.9, 1.2, { height: 0.5 },  1.1, true],
      ['prop:Barrel_Apples',  -2.0, 0.9, { height: 0.85 }, 0.6, true],
      ['prop:Crate_Metal',    -1.4, -1.6,{ height: 0.6 },  2.4, true],
      ['prop:Table_Plate',     0.7, 1.6, { size: 0.3 },    0.0, false],
    ],
    shrine: [
      ['prop:CandleStick_Triple', 0,    0,   { height: 1.0 }, 0.0, true],
      ['prop:Chalice',            0.8, -0.5, { height: 0.22 },1.5, false],
      ['prop:Book_Stack_1',      -0.9, -0.4, { size: 0.35 },  0.7, false],
      ['prop:Banner_1',           2.2,  0.4, { height: 2.6 }, 0.3, true],
      ['prop:Vase_Rubble_Medium',-2.1,  0.8, { height: 0.45 },2.0, false],
    ],
    smithy: [
      ['prop:Anvil',      0,    0,   { height: 0.75 }, 0.5, true],
      ['prop:Workbench',  2.3, -1.1, { height: 0.9 },  1.8, true],
      ['prop:Whetstone', -1.4,  0.9, { size: 0.35 },   0.0, false],
      ['prop:Peg_Rack',  -2.4, -1.2, { height: 1.5 },  0.9, true],
      ['prop:Chain_Coil', 1.4,  1.7, { size: 0.5 },    2.6, false],
    ],
    // A cage, a chain, torches either side — something was kept here,
    // or something is still buried under it. Deliberately the rarest
    // of the wilderness kinds (see the KINDS roll below) so finding
    // one reads as a discovery, not a landmark you pass every minute.
    dungeon: [
      ['prop:Cage_Small',        0,    0,    { size: 1.1 },   0.3, true],
      ['prop:Chain_Coil',        1.3, -0.4,  { size: 0.5 },   1.8, false],
      ['prop:Torch_Metal',      -1.6,  0.9,  { height: 1.4 }, 0.0, true],
      ['prop:Torch_Metal',       1.9,  1.4,  { height: 1.4 }, 0.0, true],
      ['prop:Vase_Rubble_Medium',-0.8, -1.5, { height: 0.45 },2.6, false],
    ],
  };

  /**
   * Build one of STRUCTURES at a world position. Every piece is
   * individually optional — _placeRealProp returns null if its model
   * isn't loaded — so a structure degrades to however many of its
   * parts are available rather than failing outright.
   *
   * `baseY` defaults to 0, which is exactly correct for every existing
   * call site: they all sit inside the hub's 2.5-chunk radius, where
   * the terrain height FUNCTION itself flattens toward 0 near the
   * origin (see TerrainGenerator._getHeight's flattenFactor), so
   * ground genuinely is ~0 there. It stops being correct the moment a
   * structure is built in real wilderness terrain with actual
   * elevation — see _generateWildernessStructures, the one call site
   * that passes a real value here (this.getGroundY(...)).
   *
   * This has to be a parameter INTO construction, not a transform
   * applied to the result afterward: colliders are computed inside
   * this function, from each piece's live position. Shifting Y after
   * the fact would leave every collider stale — floating at the old
   * (wrong) height while the mesh it's supposed to guard sits
   * somewhere else entirely.
   */
  _buildStructure(kind, originX, originZ, seed, baseY = 0) {
    const layout = this.STRUCTURES[kind];
    if (!layout) return [];
    const props = [];
    // One rotation for the whole cluster so it reads as a placed thing
    // rather than a pile of independently-spun props.
    const spin = ((seed % 360) * Math.PI) / 180;
    const cos = Math.cos(spin), sin = Math.sin(spin);

    for (const [key, dx, dz, sizing, rot, collide] of layout) {
      const wx = originX + dx * cos - dz * sin;
      const wz = originZ + dx * sin + dz * cos;
      const piece = this._placeRealProp(key, {
        ...sizing,
        position: new THREE.Vector3(wx, baseY, wz),
        rotationY: rot + spin,
      });
      if (!piece) continue;
      props.push(piece.group);
      if (collide) this._addCollider(piece.group, 0.45);
    }
    return props;
  }

  /**
   * A small real-model cluster — the buildings-scatter loop's third
   * alternative alongside forgeRuin/forgeMonolith (see the call site
   * above). Crate + barrel anchor it and get colliders; the loose
   * rope coil doesn't, same "small/low ground clutter" rule the brief
   * calls out for Mug/Chalice/Scroll/Book_Stack/Rope.
   */
  _buildSupplyCache(originX, originZ, seed, baseY = 0) {
    const props = [];
    const rot = (seed % 8) * (Math.PI / 4);

    const crate = this._placeRealProp('prop:Crate_Wooden', {
      height: 0.8, position: new THREE.Vector3(originX, baseY, originZ), rotationY: rot,
    });
    if (crate) { props.push(crate.group); this._addCollider(crate.group, 0.45); }

    const barrel = this._placeRealProp('prop:Barrel', {
      height: 0.95,
      position: new THREE.Vector3(
        originX + 1.3 * Math.cos(rot + 1.1),
        baseY,
        originZ + 1.3 * Math.sin(rot + 1.1)
      ),
      rotationY: rot * 1.6,
    });
    if (barrel) { props.push(barrel.group); this._addCollider(barrel.group, 0.45); }

    const rope = this._placeRealProp('prop:Rope_1', {
      size: 0.4,
      position: new THREE.Vector3(
        originX - 0.9 * Math.cos(rot - 0.7),
        baseY,
        originZ - 0.9 * Math.sin(rot - 0.7)
      ),
      rotationY: rot * 0.5,
    });
    if (rope) props.push(rope.group); // ground clutter — no collider

    return props;
  }

  /**
   * A small graveyard — 4-6 leaning gravemarkers (procedural, see
   * PropForge.forgeGravemarker) around one real broken urn, scattered
   * within a tight radius so it reads as a cluster of graves and not
   * a tidy row. No colliders on the markers themselves — thin slabs a
   * player can walk between are more readable than an invisible wall
   * around every one of them; the urn still gets one, same rule as
   * every other real-model anchor prop in this file.
   */
  _buildGraveyard(originX, originZ, seed) {
    const props = [];
    const rng = this.terrainGen._makeRng(seed >>> 0);
    const count = 4 + (seed % 3);

    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const r = 1.2 + rng() * 2.6;
      const marker = forgeGravemarker(0.85 + rng() * 0.35);
      marker.position.set(originX + Math.cos(a) * r, this.getGroundY(originX + Math.cos(a) * r, originZ + Math.sin(a) * r), originZ + Math.sin(a) * r);
      marker.rotation.y = rng() * Math.PI * 2;
      props.push(marker);
    }

    const urn = this._placeRealProp('prop:Vase_Rubble_Medium', {
      height: 0.5,
      position: new THREE.Vector3(originX, this.getGroundY(originX, originZ), originZ),
      rotationY: rng() * Math.PI * 2,
    });
    if (urn) { props.push(urn.group); this._addCollider(urn.group, 0.45); }

    return props;
  }

  /**
   * Ruins, camps, dungeons, graveyards — for chunks OUTSIDE the hub's
   * 2.5-chunk radius, which is everywhere in this infinite world
   * except a ~160-unit circle around spawn.
   *
   * Every structure kind that already existed (STRUCTURES,
   * forgeRuin, forgeMonolith) was built exclusively from inside
   * _buildCityHub, and _buildCityHub only ever runs when isHub is
   * true. The doc comments elsewhere in this file already talk about
   * "wilderness structures" as if this worked — it never did. This is
   * the actual wilderness path.
   *
   * Kept deliberately SPARSE (roughly 1 in 3 chunks) and biased toward
   * the kinds that read as "abandoned, not currently lived-in"
   * (dungeon/graveyard/ruin/monolith over camp/stall/shrine/smithy) —
   * the hub's own dense, "someone lives here" scatter stays exactly
   * as dense as it was; this is a different frequency for a different
   * read, not the same system turned up everywhere.
   */
  _generateWildernessStructures(cx, cz, biome) {
    // Never inside the hub radius. _loadChunk already routes hub
    // chunks through the other branch before this is ever called, so
    // this can never actually trip — it's here so the invariant is
    // readable at the one call site that matters, not inferred from
    // control flow three functions away.
    if (Math.sqrt(cx * cx + cz * cz) < 2.5) return [];

    // A hash independent of the tree/rock/clutter hashes (different
    // additive constant) so a chunk's structure roll doesn't silently
    // correlate with its vegetation roll.
    const hash = Math.abs(cx * 137 + cz * 149 + 991);
    if (hash % 3 !== 0) return [];

    const chunkX = cx * WORLD.CHUNK_SIZE, chunkZ = cz * WORLD.CHUNK_SIZE;
    // Wider spread than the hub's tighter grid (±10) — a lone
    // structure in an otherwise-empty chunk reads better placed away
    // from the chunk seam than dead centre.
    const originX = chunkX + (((hash * 7) % 30) - 15);
    const originZ = chunkZ + (((hash * 11) % 30) - 15);
    const groundY = this.getGroundY(originX, originZ);

    // ⚠️ Math.floor(hash / 3) % 12, NOT hash % 12.
    //
    // The gate above already requires hash % 3 === 0. 12 is a multiple
    // of 3, so hash % 12's value is FORCED to share hash % 3's residue
    // — meaning hash % 12 can only ever land on 0, 3, 6, or 9, and the
    // roll<9/roll<11 branches below (monolith, shrine, cache) become
    // dead code no roll can ever reach. Verified empirically before
    // and after this fix: {dungeon,graveyard,ruin,camp} only vs. all
    // seven kinds present in the expected rough proportions. Same bug
    // class as the noiseValue-gates-placement issue documented
    // elsewhere in this file — two decisions derived from the same
    // arithmetic are not independent just because they look like it.
    // Dividing out the factor already consumed by the gate before
    // taking the second modulus removes the correlation.
    const roll = Math.floor(hash / 3) % 12;

    // ⚠️ EVERY BRANCH REGISTERS A SITE. Building the geometry and
    // registering the interaction happen together, here, because they
    // are the same decision — a structure this function places and
    // forgets to register is exactly the scenery-with-no-purpose this
    // whole pass exists to eliminate. If a new structure kind is added
    // below, it needs a SITE_KINDS entry and a `site()` call in the
    // same commit, or it silently becomes another prop nobody can
    // touch.
    const site = (kind) => siteSystem.register(kind, originX, groundY, originZ);

    if (roll < 3)  { site('dungeon'); return this._buildStructure('dungeon', originX, originZ, hash, groundY); }
    if (roll < 5)  { site('graveyard'); return this._buildGraveyard(originX, originZ, hash); }
    if (roll < 7) {
      site('ruin');
      const r = forgeRuin(0.75 + (hash % 4) * 0.1);
      r.position.set(originX, groundY, originZ);
      r.rotation.y = ((hash * 13) % 360) * (Math.PI / 180);
      this._addCollider(r, 0.35);
      return [r];
    }
    if (roll < 9) {
      site('monolith');
      const m = forgeMonolith(0.55 + (hash % 3) * 0.12);
      m.position.set(originX, groundY, originZ);
      this._addCollider(m, 0.35);
      return [m];
    }
    if (roll < 10) { site('camp'); return this._buildStructure('camp', originX, originZ, hash, groundY); }
    if (roll < 11) { site('shrine'); return this._buildStructure('shrine', originX, originZ, hash, groundY); }
    site('cache');
    return this._buildSupplyCache(originX, originZ, hash, groundY);
  }

  /**
   * A Descent Gate, if this chunk has one — see data/descents.js.
   *
   * ⚠️ THE MODULUS RULE, which this file has broken five separate
   * times (HANDOFF §7): the placement gate below is `h % 9 === 0`, so
   * every subsequent decision MUST divide that factor out before
   * taking its own modulus, or it inherits the residue and half the
   * table becomes unreachable in code that reads as correct. The
   * element pick therefore uses `(h / 9 | 0)` and the jitter uses a
   * re-mixed value, not `h` itself. Verified by COUNTING the element
   * distribution across a wide chunk sweep, not by reading these
   * lines — reading them is exactly what failed the previous five
   * times.
   *
   * Tier rises with distance from spawn rather than being rolled.
   * Two reasons: a Shallow Descent next to an Unbottomed one in
   * adjacent chunks makes tier meaningless as information, and the
   * Ascent's later rungs need deep Descents to exist somewhere
   * specific enough that "go further out" is a real instruction.
   */
  _generateDescentGate(cx, cz) {
    // ⚠️ The hash math lives in data/descents.js's gateForChunk(), NOT
    // here. It used to be inline, and it has to be shared: the SCOUTING
    // system answers "where are the nearby Gates" for chunks that have
    // never been loaded, and two copies of this arithmetic would drift
    // the first time either was touched. The failure mode is a compass
    // that points confidently at nothing.
    const spec = gateForChunk(cx, cz);
    if (!spec) return [];
    const { archetype, jitter, tier } = spec;

    const chunkX = cx * WORLD.CHUNK_SIZE, chunkZ = cz * WORLD.CHUNK_SIZE;
    const { originX, originZ, groundY } = this._gateSpotIn(chunkX, chunkZ, jitter);

    const gate = forgeDescentGate(archetype.color, 1.0);
    gate.position.set(originX, groundY, originZ);
    // Faces the Sanctuary. Every Gate looking back at spawn is a quiet
    // piece of worldbuilding — they were not put here facing outward.
    gate.rotation.y = Math.atan2(-originX, -originZ);
    // No collider on the opening itself: the posts are thin and a box
    // collider around the whole group would make the doorway solid,
    // which is the one thing a doorway must not be.
    this._addCollider(gate.children[0], 0.4);

    descentSystem.registerGate({
      position: new THREE.Vector3(originX, groundY, originZ),
      element: archetype.element,
      tier,
      name: archetype.name,
      color: archetype.color,
      mesh: gate,
    });

    return [gate];
  }

  /**
   * The exact spot a Gate stands on within a chunk: nine deterministic
   * candidates, scored by how flat the gate's own footprint is.
   *
   * Split out of _generateDescentGate so SCOUTING can compute the same
   * answer without building anything. All analytic getGroundY() — no
   * terrain raycast, per HANDOFF §4 — so it is safe to call for chunks
   * that have never been loaded and costs ~45 height samples.
   */
  _gateSpotIn(chunkX, chunkZ, jitter) {
    let originX = chunkX, originZ = chunkZ, bestSpread = Infinity;
    for (let i = 0; i < 9; i++) {
      const j = Math.abs(Math.imul(jitter + i * 0x27d4eb2f, 0xc2b2ae35));
      const tx = chunkX + ((j % 40) - 20);
      const tz = chunkZ + (((j >>> 9) % 40) - 20);
      let lo = Infinity, hi = -Infinity;
      for (const [ox, oz] of [[-2, -1], [2, -1], [-2, 1], [2, 1], [0, 0]]) {
        const h2 = this.getGroundY(tx + ox, tz + oz);
        if (h2 < lo) lo = h2;
        if (h2 > hi) hi = h2;
      }
      const spread = hi - lo;
      if (spread < bestSpread) { bestSpread = spread; originX = tx; originZ = tz; }
      if (spread < 0.35) break;
    }
    const groundY = Math.min(
      this.getGroundY(originX - 2, originZ),
      this.getGroundY(originX + 2, originZ),
      this.getGroundY(originX, originZ),
    );
    return { originX, originZ, groundY };
  }

  /**
   * SCOUTING — the answer to "the dungeons cannot be located."
   *
   * ⚠️ Descent Gates were reachable but not FINDABLE, and the two are
   * not the same thing. The nearest Gate is only ~230 units from spawn
   * and there are ~89 within walking range, but the journal map only
   * ever drew Gates whose chunk had already been LOADED — i.e. ones
   * you had already walked past. That is circular: you could not find
   * one until you had found it, so the entire Ascent loop (which needs
   * a survived Descent for every single rank) was unreachable by
   * anyone who did not happen to stumble into a Gate.
   *
   * This resolves real positions from the shared hash without building
   * or loading anything, so the watch can tell you where they are — a
   * scouting report, which is also the correct fiction: the Sanctuary
   * has a Gate-Warden whose entire job is knowing what is out there.
   *
   * @returns {Array} gate records, nearest first
   */
  scoutGates(fromX, fromZ, radiusChunks = 10, limit = 6) {
    const cx0 = Math.round(fromX / WORLD.CHUNK_SIZE);
    const cz0 = Math.round(fromZ / WORLD.CHUNK_SIZE);
    const specs = gatesNear(cx0, cz0, radiusChunks).slice(0, limit);
    const out = [];
    for (const spec of specs) {
      const chunkX = spec.cx * WORLD.CHUNK_SIZE, chunkZ = spec.cz * WORLD.CHUNK_SIZE;
      const { originX, originZ, groundY } = this._gateSpotIn(chunkX, chunkZ, spec.jitter);
      out.push(descentSystem.registerGate({
        position: new THREE.Vector3(originX, groundY, originZ),
        element: spec.archetype.element,
        tier: spec.tier,
        name: spec.archetype.name,
        color: spec.archetype.color,
        mesh: null,          // not built yet; the chunk builder fills this in
        scouted: true,
      }));
    }
    return out;
  }

  /**
   * Fixed, named, story-linked places — see src/data/landmarks.js for
   * why these exist separately from the hash-based scatter above.
   * Checked on every chunk load (two integer comparisons against a
   * 2-entry table), built exactly once per world (same one-shot guard
   * _spawnLoreFragments uses), and announced via
   * Events.LANDMARK_DISCOVERED so main.js can react — a discovery
   * banner always, a guardian spawn for Sunken Foundations specifically.
   */
  _buildLandmarks(cx, cz) {
    const props = [];
    for (const landmark of Object.values(LANDMARKS)) {
      if (landmark.cx !== cx || landmark.cz !== cz) continue;
      const key = `landmark_${landmark.id}`;
      if (this.npcRegistered.has(key)) continue; // one-shot per world, same Set _spawnLoreFragments uses
      this.npcRegistered.add(key);

      const worldX = cx * WORLD.CHUNK_SIZE + landmark.x;
      const worldZ = cz * WORLD.CHUNK_SIZE + landmark.z;
      // Dispatch by id. Was a ternary while there were exactly two
      // landmarks; a table because there are now five and the next one
      // should be an entry here plus a builder below, nothing else.
      const builder = {
        sunken_foundations: this._buildSunkenFoundations,
        vells_hollow:       this._buildVellsHollow,
        the_scar:           this._buildTheScar,
        hanged_choir:       this._buildHangedChoir,
        drowned_watch:      this._buildDrownedWatch,
      }[landmark.id];
      if (!builder) {
        console.warn(`[ChunkManager] landmark '${landmark.id}' has no builder — nothing was placed`);
        continue;
      }
      props.push(...builder.call(this, worldX, worldZ));

      eventBus.emit(Events.LANDMARK_DISCOVERED, {
        id: landmark.id,
        name: landmark.name,
        msg: landmark.discoverMsg,
        position: new THREE.Vector3(worldX, this.getGroundY(worldX, worldZ), worldZ),
      });
    }
    return props;
  }

  /**
   * The Sunken Foundations — gives mq4 ("delve beneath the fields and
   * recover a fragment of the Mithril Core"), sq2 ("What the Golems
   * Guard") and the 'foundation_masons_log' lore fragment ("We laid
   * the Sanctuary's foundations over something already built... three
   * levels down") the one thing all three were missing: an actual
   * place. A dungeon-flavoured cluster (STRUCTURES.dungeon — cage,
   * chain, torches) at the centre of a ring of broken ruin fragments,
   * with a GUARANTEED Mithril Core Fragment sitting in the open at
   * its heart. The drop-table chance for the same item (materials.js)
   * still exists independently — this is an additional, certain
   * source with a real location, not a replacement for it.
   *
   * The guardian golem sq2 wants is spawned separately, from main.js,
   * on Events.LANDMARK_DISCOVERED — enemy-spawning stays centralised
   * where enemySpawner actually lives, the same reason spawnVell()
   * isn't in this file either.
   */
  _buildSunkenFoundations(originX, originZ) {
    const props = [];
    const groundY = this.getGroundY(originX, originZ);
    const rng = this.terrainGen._makeRng((originX * 733 + originZ * 977) >>> 0);

    props.push(...this._buildStructure('dungeon', originX, originZ, Math.floor(rng() * 1e6), groundY));

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + rng() * 0.6;
      const r = 5 + rng() * 2.5;
      const rx = originX + Math.cos(a) * r, rz = originZ + Math.sin(a) * r;
      const ruin = forgeRuin(0.7 + rng() * 0.3);
      ruin.position.set(rx, this.getGroundY(rx, rz), rz);
      ruin.rotation.y = rng() * Math.PI * 2;
      this._addCollider(ruin, 0.35);
      props.push(ruin);
    }

    // ⚠️ 'mithril_core_fragment' is NOT in MATERIALS. It only exists as
    // an INLINE entry inside DROPS.golem (materials.js) — Enemy.js's
    // drop-table resolver supports two shapes, `{ item: 'existing_id' }`
    // (looked up in MATERIALS) and an inline generic object carrying
    // its own id/name/tier/icon directly, and this is the second kind.
    // MATERIALS.find(...) for it silently returns undefined — no
    // throw, so this shipped with the guaranteed fragment quietly
    // never spawning until checked directly against a live pickup
    // list. DROPS is already imported at the top of this file for
    // exactly this table.
    const fragmentDef = DROPS.golem?.find(d => d.id === 'mithril_core_fragment');
    if (fragmentDef) {
      pickupManager.spawn(fragmentDef, new THREE.Vector3(originX, groundY + 0.6, originZ), 1);
    } else {
      console.warn('[ChunkManager] mithril_core_fragment drop-def not found — Sunken Foundations fragment not spawned');
    }

    return props;
  }

  /**
   * Vell's Hollow — a ring of dead trees around a long-extinguished
   * fire pit. Built as atmosphere the moment its chunk loads, whether
   * or not mq6 is active — a place that exists independent of the
   * quest, the way a real location does. Vell itself (the enemy) is
   * forged here separately once mq6 activates; see spawnVell() in
   * main.js. No colliders on the trees — matches _createTree's own
   * convention (walkable/harvestable, not solid) so these don't feel
   * inexplicably different from every other tree in the world.
   */
  _buildVellsHollow(originX, originZ) {
    const props = [];
    const groundY = this.getGroundY(originX, originZ);
    const rng = this.terrainGen._makeRng((originX * 611 + originZ * 419) >>> 0);

    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rng() * 0.4;
      const r = 4.5 + rng() * 2;
      const tx = originX + Math.cos(a) * r, tz = originZ + Math.sin(a) * r;
      const tree = forgeDeadTree(0.9 + rng() * 0.6);
      tree.position.set(tx, this.getGroundY(tx, tz), tz);
      tree.rotation.y = rng() * Math.PI * 2;
      props.push(tree);
    }

    const pit = forgeLandmark('firepit', 0.8);
    if (pit) {
      pit.position.set(originX, groundY, originZ);
      props.push(pit);
    }

    return props;
  }

  /**
   * The Scar — the ground's answer to the sky rift.
   *
   * Technique, and why it is this and not the two more obvious things:
   *   · NOT a modification of the terrain height function. getGroundY()
   *     is analytic, evaluated everywhere by everything (gravity,
   *     collision, every prop placement), and flagged in this file as
   *     the most performance-critical function in the game. Carving a
   *     fixed-location depression into it means a bounds test on every
   *     single call, forever, to serve one landmark.
   *   · NOT a carved chasm mesh laid over the terrain. The mesh and
   *     getGroundY() would then disagree about where the floor is, and
   *     the player would visibly float over the hole (or fall through
   *     its lip) because the height field is the one the physics
   *     believes.
   *   · So: a ribbon that CONFORMS. Walk a jagged centreline, sample
   *     the real getGroundY() at every vertex, and lay an emissive
   *     strip SCAR_LIFT above it. The wound is visible from a distance,
   *     it drapes correctly over whatever terrain it crosses, and the
   *     height field is never contradicted because it is never touched.
   *
   * Additive, depthWrite:false, renderOrder past the terrain — it reads
   * as light coming OUT of the ground rather than paint lying on it,
   * and z-fighting with the chunk mesh underneath becomes impossible
   * rather than merely unlikely. Colour is path-keyed to the same pair
   * the sky rift uses (Atmosphere.js), because they are the same wound.
   */
  _buildTheScar(originX, originZ) {
    const props = [];
    const rng = this.terrainGen._makeRng((originX * 1013 + originZ * 1601) >>> 0);

    const SEGMENTS = 46;      // centreline samples along the crack
    const LENGTH = 78;        // world units end to end
    const SCAR_LIFT = 0.12;   // metres above the true walkable surface
    const isHeaven = atmosphere.path === 'heaven';
    const glowHex = isHeaven ? 0xfff6e0 : 0xd94a1a;
    const coreHex = isHeaven ? 0xffffff : 0xffe2a0;

    // Fixed heading, jagged around it — a crack has a direction, it
    // just doesn't keep to it. Derived from the origin so it is stable
    // across sessions rather than re-rolled per visit.
    const heading = rng() * Math.PI * 2;
    const dirX = Math.cos(heading), dirZ = Math.sin(heading);
    const perpX = -dirZ, perpZ = dirX;

    const centre = [];
    let wander = 0;
    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;
      const along = (t - 0.5) * LENGTH;
      // Two scales of deviation: a slow drift plus a per-sample kink,
      // which is what separates "a crack" from "a wavy line."
      wander += (rng() - 0.5) * 2.4;
      wander *= 0.82;
      const kink = (rng() - 0.5) * 1.1;
      const off = wander + kink;
      const x = originX + dirX * along + perpX * off;
      const z = originZ + dirZ * along + perpZ * off;
      // Taper to nothing at both ends — a wound that stops abruptly at
      // full width reads as a decal someone forgot to fade.
      const taper = Math.sin(t * Math.PI);
      const halfWidth = (0.35 + rng() * 0.85) * taper;
      centre.push({ x, z, halfWidth, y: this.getGroundY(x, z) });
    }

    // Two ribbons on the same centreline, not one. A single flat strip
    // of colour reads as paint on the ground; a wide dim halo with a
    // narrow white-hot core inside it reads as light escaping a split,
    // because that is the falloff an actual emitting crack has. Same
    // idea as the props' single-emissive-focal-point rule, expressed
    // across two layers instead of two materials.
    const ribbonAt = (widthMul, colorHex, opacity, lift, order) => {
      const positions = [];
      const indices = [];
      for (let i = 0; i <= SEGMENTS; i++) {
        const c = centre[i];
        const hw = c.halfWidth * widthMul;
        positions.push(
          c.x + perpX * hw, c.y + lift, c.z + perpZ * hw,
          c.x - perpX * hw, c.y + lift, c.z - perpZ * hw,
        );
        if (i < SEGMENTS) {
          const a = i * 2;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false, // it is a light source, not a surface being lit
      }));
      mesh.renderOrder = order;
      return mesh;
    };
    // Halo first, core stacked a further centimetre up so the two
    // never z-fight with each other on a slope.
    props.push(ribbonAt(1.0, glowHex, 0.55, SCAR_LIFT, 2));
    props.push(ribbonAt(0.34, coreHex, 0.9, SCAR_LIFT + 0.01, 3));

    // A handful of point lights spaced ALONG the crack rather than one
    // at its centre — a 78m ribbon lit by a single lamp reads as a
    // glowing dot with a dark stripe running out of it.
    for (let i = 4; i < SEGMENTS; i += 11) {
      const c = centre[i];
      const lamp = new THREE.PointLight(coreHex, 1.4, 16, 2);
      lamp.position.set(c.x, c.y + 0.9, c.z);
      props.push(lamp);
    }

    // Flanks: the ground didn't split politely. Real photoscanned
    // cliffs where they loaded, procedural rock as the hard fallback
    // (same contract as everything else here — a landmark must never
    // come back empty because an optional asset is missing).
    for (let i = 0; i < 10; i++) {
      const c = centre[3 + Math.floor(rng() * (SEGMENTS - 6))];
      const side = rng() < 0.5 ? 1 : -1;
      const dist = 2.6 + rng() * 4.5;
      const px = c.x + perpX * dist * side;
      const pz = c.z + perpZ * dist * side;
      const cliff = forgeLandmark('cliff_a', 4.5 + rng() * 5) || forgeRock(1.6 + rng() * 1.2);
      cliff.position.set(px, this.getGroundY(px, pz) - 0.4, pz);
      cliff.rotation.y = rng() * Math.PI * 2;
      this._addCollider(cliff, 0.3);
      props.push(cliff);
    }

    // Crystal growth along the lip — the same emissive-focal-point
    // vocabulary forgeShard uses everywhere else, tinted to the path
    // so the Scar's own colour reads as one material, not two.
    for (let i = 0; i < 7; i++) {
      const c = centre[2 + Math.floor(rng() * (SEGMENTS - 4))];
      const side = rng() < 0.5 ? 1 : -1;
      const dist = 1.1 + rng() * 1.9;
      const px = c.x + perpX * dist * side;
      const pz = c.z + perpZ * dist * side;
      // glowHex, NOT coreHex. forgeShard uses its colour as BOTH the
      // body albedo and the emissive, and the core white-hot value
      // pushed through bloom turned every shard into a blown-out white
      // cone — the one thing this project's art direction explicitly
      // forbids (one emissive focal point per object, everything else
      // dark). The deeper ember reads as crystal lit from within; the
      // white-hot value is reserved for the crack itself.
      const shard = forgeShard(0.5 + rng() * 0.5, glowHex);
      shard.position.set(px, this.getGroundY(px, pz), pz);
      props.push(shard);
    }

    // Dead ground either side. Nothing grows next to it.
    for (let i = 0; i < 9; i++) {
      const c = centre[Math.floor(rng() * SEGMENTS)];
      const side = rng() < 0.5 ? 1 : -1;
      const dist = 6 + rng() * 9;
      const px = c.x + perpX * dist * side;
      const pz = c.z + perpZ * dist * side;
      const tree = forgeDeadTree(0.8 + rng() * 0.7);
      tree.position.set(px, this.getGroundY(px, pz), pz);
      tree.rotation.y = rng() * Math.PI * 2;
      props.push(tree);
    }

    return props;
  }

  /**
   * The Hanged Choir — a Pioneers' graveyard inside a broken ring of
   * monoliths.
   *
   * Story load: Ostra's warning ("cast enough of one essence and it
   * stops being a choice") and the lore thread that attunement erodes
   * the person wearing it both had nowhere to point. This is where the
   * Sanctuary put the ones it couldn't bring back — markers in
   * concentric arcs, none of them old, arranged facing inward at a
   * cold firepit, which is a burial that stopped pretending to be one.
   *
   * Monoliths get colliders; gravemarkers deliberately do not, matching
   * the graveyard structure kind already in STRUCTURES — you should be
   * able to walk between the stones to read them.
   */
  _buildHangedChoir(originX, originZ) {
    const props = [];
    const groundY = this.getGroundY(originX, originZ);
    const rng = this.terrainGen._makeRng((originX * 887 + originZ * 1279) >>> 0);

    // The ring. Two of nine slots left empty — the same reasoning as
    // _buildSanctuaryWalls: a perfect closed ring reads as decoration,
    // a broken one reads as something that failed.
    const RING = 13;
    for (let i = 0; i < 9; i++) {
      if (i === 3 || i === 7) continue;
      const a = (i / 9) * Math.PI * 2;
      const mx = originX + Math.cos(a) * RING;
      const mz = originZ + Math.sin(a) * RING;
      const mono = forgeMonolith(0.75 + rng() * 0.45);
      mono.position.set(mx, this.getGroundY(mx, mz), mz);
      mono.rotation.y = a + Math.PI; // faces inward, at the graves
      // A leaning stone in the ring sells "abandoned" more than a
      // missing one does; the two gaps above already carry that read,
      // so this is a small tilt, not a collapse.
      mono.rotation.z = (rng() - 0.5) * 0.14;
      this._addCollider(mono, 0.35);
      props.push(mono);
    }

    // Graves in concentric arcs facing the centre.
    for (let ring = 0; ring < 3; ring++) {
      const r = 3.4 + ring * 2.6;
      const count = 6 + ring * 4;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + rng() * 0.16;
        const gx = originX + Math.cos(a) * (r + rng() * 0.7);
        const gz = originZ + Math.sin(a) * (r + rng() * 0.7);
        const marker = forgeGravemarker(0.8 + rng() * 0.4);
        marker.position.set(gx, this.getGroundY(gx, gz), gz);
        marker.rotation.y = a + Math.PI / 2;
        marker.rotation.z = (rng() - 0.5) * 0.2; // decades of frost heave
        props.push(marker);
      }
    }

    const pit = forgeLandmark('firepit', 0.9);
    if (pit) {
      pit.position.set(originX, groundY, originZ);
      props.push(pit);
    }

    // Dead trees pushed outside the ring, so the silhouette from a
    // distance is trees-then-stones-then-graves and reads in layers.
    for (let i = 0; i < 8; i++) {
      const a = rng() * Math.PI * 2;
      const r = RING + 3 + rng() * 8;
      const tx = originX + Math.cos(a) * r, tz = originZ + Math.sin(a) * r;
      const tree = forgeDeadTree(1.0 + rng() * 0.6);
      tree.position.set(tx, this.getGroundY(tx, tz), tz);
      tree.rotation.y = rng() * Math.PI * 2;
      props.push(tree);
    }

    return props;
  }

  /**
   * The Drowned Watch — a Sanctuary watchpost stranded inland.
   *
   * Story load: the lore fragments say the Fracture's edge MOVES, and
   * tracks toward wherever Pioneers are thickest. Nothing in the world
   * ever showed that. This is a post built to stand ON the old edge,
   * now a long way inside it, still facing the direction the edge used
   * to be — the strongest single piece of evidence in the world that
   * the boundary is not where anyone was told it is.
   *
   * The one landmark that is architecture rather than landscape: a
   * tower, a broken curtain of wall on the seaward arc only (walls
   * where the threat was expected, nothing behind), and a supply cache
   * nobody came back for.
   */
  _buildDrownedWatch(originX, originZ) {
    const props = [];
    const groundY = this.getGroundY(originX, originZ);
    const rng = this.terrainGen._makeRng((originX * 953 + originZ * 1471) >>> 0);

    // The keep proper: the photoscanned fort when it loaded, a
    // procedural tower otherwise. Not a null-check-and-skip — the post
    // has to have a silhouette or the landmark is a pile of walls.
    const keep = forgeLandmark('fort', 7.5);
    if (keep) {
      keep.position.set(originX, groundY, originZ);
      this._addCollider(keep, 0.15);
      props.push(keep);
    }
    const tower = forgeTower(11, 2.4, 1.0);
    tower.position.set(originX + (keep ? 7 : 0), this.getGroundY(originX + (keep ? 7 : 0), originZ), originZ);
    this._addCollider(tower, 0.2);
    props.push(tower);

    // Curtain wall across ONE arc only — the direction the edge used
    // to be. Segments tangent to the arc, with a deliberate gap, for
    // the same never-trap-the-player reason _buildSanctuaryWalls has.
    const facing = rng() * Math.PI * 2;
    const ARC = 15;
    for (const k of [-2, -1, 1, 2]) {
      const a = facing + k * 0.34;
      const wx = originX + Math.cos(a) * ARC, wz = originZ + Math.sin(a) * ARC;
      const wall = forgeWallSegment(8, 3.8, 1.0);
      wall.position.set(wx, this.getGroundY(wx, wz), wz);
      wall.rotation.y = a + Math.PI / 2;
      this._addCollider(wall, 0.05);
      props.push(wall);
    }

    // Collapsed sections of the same curtain, lying where they fell.
    for (let i = 0; i < 5; i++) {
      const a = facing + (rng() - 0.5) * 1.6;
      const r = ARC + (rng() - 0.5) * 6;
      const rx = originX + Math.cos(a) * r, rz = originZ + Math.sin(a) * r;
      const ruin = forgeRuin(0.6 + rng() * 0.4);
      ruin.position.set(rx, this.getGroundY(rx, rz), rz);
      ruin.rotation.y = rng() * Math.PI * 2;
      this._addCollider(ruin, 0.35);
      props.push(ruin);
    }

    // Boulders shoved up against the wall's outer face — whoever held
    // this fortified it with whatever the valley gave them.
    for (let i = 0; i < 6; i++) {
      const a = facing + (rng() - 0.5) * 1.4;
      const r = ARC + 2 + rng() * 3;
      const bx = originX + Math.cos(a) * r, bz = originZ + Math.sin(a) * r;
      const rock = forgeRock(1.3 + rng() * 1.0);
      rock.position.set(bx, this.getGroundY(bx, bz), bz);
      rock.rotation.y = rng() * Math.PI * 2;
      this._addCollider(rock, 0.3);
      props.push(rock);
    }

    // Supplies nobody came back for — the existing hub/wilderness
    // cache builder, so the loot table stays one table.
    props.push(...this._buildSupplyCache(
      originX - 4, originZ + 5, Math.floor(rng() * 1e6),
      this.getGroundY(originX - 4, originZ + 5),
    ));

    return props;
  }

  /**
   * Sanctuary Keep — broken fortification remnants around the hub
   * plaza. Gives the Sanctuary an actual silhouette from a distance
   * (a "castle," which nothing in the hub previously read as) instead
   * of the plaza + four exterior clusters standing in open ground.
   *
   * Deliberately NOT a sealed ring — see the file-level note above
   * forgeWallSegment in PropForge.js: an unbroken wall WITH colliders
   * risks trapping the player inside or outside the hub if the
   * closure math is ever wrong, and there is no way to get broken
   * arcs wrong in that particular way. Radius 28 clears every existing
   * hub cluster (the farthest, the rest corner at local (-18,+16), sits
   * at distance ~24).
   */
  _buildSanctuaryWalls(chunkX, chunkZ) {
    const props = [];
    const RADIUS = 28;
    const SLOTS = 6;
    // Two of six slots skipped entirely — permanent gaps, not a
    // rotating "some frames have less wall" randomness (this only
    // ever runs once, for the one hub chunk).
    for (const slot of [0, 1, 3, 4]) {
      const a = (slot / SLOTS) * Math.PI * 2;
      const wx = chunkX + Math.cos(a) * RADIUS, wz = chunkZ + Math.sin(a) * RADIUS;
      const wall = forgeWallSegment(9, 4.2, 1.0);
      wall.position.set(wx, this.getGroundY(wx, wz), wz);
      wall.rotation.y = a + Math.PI / 2; // tangent to the ring, not radial
      this._addCollider(wall, 0.05);
      props.push(wall);
    }
    // Towers flank the two gaps — the "gatehouse" read.
    for (const slot of [2, 5]) {
      const a = (slot / SLOTS) * Math.PI * 2;
      const tx = chunkX + Math.cos(a) * RADIUS, tz = chunkZ + Math.sin(a) * RADIUS;
      const tower = forgeTower(10, 2.3, 1.0);
      tower.position.set(tx, this.getGroundY(tx, tz), tz);
      this._addCollider(tower, 0.2);
      props.push(tower);
    }
    // The real fort model, set back behind one gate as a keep — the
    // thing that reads as "castle" from far enough away that the
    // procedural wall arcs themselves haven't resolved yet.
    const keep = forgeLandmark('fort', 7.5);
    if (keep) {
      const a = (2 / SLOTS) * Math.PI * 2;
      const kx = chunkX + Math.cos(a) * (RADIUS + 9), kz = chunkZ + Math.sin(a) * (RADIUS + 9);
      keep.position.set(kx, this.getGroundY(kx, kz), kz);
      keep.rotation.y = a + Math.PI;
      props.push(keep);
    }
    return props;
  }

  _spawnHubNPCs(cx, cz) {
    const key = `npc_${cx}_${cz}`;
    if (this.npcRegistered.has(key)) return;
    this.npcRegistered.add(key);

    if (cx === 0 && cz === 0) {
      // Elder Aris — the main quest's guide, dialogue gated to the
      // live quest stage (see NPC.js / QuestSystem.js).
      const elder = new NPC('elder_npc', {
        name: 'Elder Aris',
        role: 'Elder',
        variant: 'elder',
        dialogueByStage: ELDER_DIALOGUE,
        postFinaleDialogue: ELDER_POST_FINALE,
        questId: 'mq3',
        position: new THREE.Vector3(5, 0, 5),
        rotation: Math.PI,
      });
      npcManager.register(elder);

      // The rest of the Sanctuary's cast — see data/sanctuary.js for
      // why they exist and why they are deliberately ordinary. All in
      // the hub chunk, at fixed world coordinates, so the journal's
      // map can draw them without a per-chunk translation step.
      for (const def of SANCTUARY_NPCS) {
        npcManager.register(new NPC(def.id, {
          name: def.name,
          role: def.role,
          variant: def.variant,
          element: def.element,
          dialog: def.dialog,
          questId: def.givesQuest,
          scoutsDescents: def.scoutsDescents,
          position: def.position.clone(),
          rotation: def.rotation ?? 0,
        }));
      }
    } else if (cx === 1 && cz === 0) {
      // Ostra — the rival reading of the Fracture, kept at the edge
      // of the Sanctuary rather than at its centre.
      const ostra = new NPC(OSTRA.id, {
        name: OSTRA.name,
        role: OSTRA.role,
        variant: 'rival',
        element: ELEMENTS.SHADOW,
        dialogueByStage: OSTRA.dialogue,
        postFinaleDialogue: OSTRA_POST_FINALE,
        questId: 'mq5',
        position: new THREE.Vector3(cx * WORLD.CHUNK_SIZE - 6, 0, cz * WORLD.CHUNK_SIZE + 8),
        rotation: -Math.PI / 2,
      });
      npcManager.register(ostra);
    } else if (Math.sqrt(cx*cx + cz*cz) < 2) {
      // Generic Villager — remembers the goblins get culled (sq1,
      // "Salt the Wound"), a small-scale instance of "the world
      // remembers" rather than the same two lines forever.
      const villager = new NPC(`villager_${cx}_${cz}`, {
        name: 'Commoner',
        role: 'Citizen',
        variant: 'villager',
        dialog: ['Welcome to the Sanctuary.', 'Watch your step outside the walls.'],
        reactsTo: {
          questId: 'sq1',
          lines: [
            "Word's already gone round about the goblins.",
            "Whatever you found buried under that field, keep it to yourself. We've enough to worry about as it is.",
          ],
        },
        position: new THREE.Vector3(cx * WORLD.CHUNK_SIZE + 2, 0, cz * WORLD.CHUNK_SIZE - 2),
      });
      npcManager.register(villager);
    }

    this._spawnLoreFragments(cx, cz);
  }

  /** Places one found-journal lore fragment, once, if this chunk is its spot. */
  _spawnLoreFragments(cx, cz) {
    const spot = LORE_SPAWN_CHUNKS.find(s => s.cx === cx && s.cz === cz);
    if (!spot) return;
    const loreKey = `lore_${spot.id}`;
    if (this.npcRegistered.has(loreKey)) return; // same one-shot-per-world guard the NPCs use
    this.npcRegistered.add(loreKey);

    const fragment = LORE_FRAGMENTS.find(f => f.id === spot.id);
    if (!fragment) return;

    let itemDef = getItem(fragment.id);
    if (!itemDef) {
      itemDef = registerItem({
        id: fragment.id,
        name: fragment.title,
        icon: '📜',
        tier: MATERIAL_TIERS.RARE,
        type: 'lore',
        isLore: true,
        loreText: fragment.text,
      });
    }
    const pos = new THREE.Vector3(cx * WORLD.CHUNK_SIZE + spot.x, 1, cz * WORLD.CHUNK_SIZE + spot.z);
    pickupManager.spawn(itemDef, pos, 1);
  }

  /**
   * Register a prop as solid.
   *
   * ⚠️ The box is deliberately SMALLER than the prop's visual bounds.
   *
   * `Box3.setFromObject` returns the axis-aligned bounds of every
   * child, which for most of this project's props is far larger than
   * the thing you would actually bump into: a monolith's tilted top,
   * a ruin's fallen lintel, a stall's awning and a keep's corner
   * towers all push the AABB out well past the solid mass underneath.
   * Walking the plaza felt like navigating invisible furniture, and
   * gaps that clearly looked walkable were not.
   *
   * So the footprint is inset by `shrink` (a FRACTION of each
   * horizontal half-extent, not a fixed metre value — a 1m marker and
   * a 12m keep need very different absolute insets), floored so a thin
   * prop can never invert. Height is left alone: the player's own
   * collision test already does the step-over/duck-under work
   * (Player._checkBuildingCollisions), and squashing height here would
   * take that decision away from it.
   *
   * @param {THREE.Object3D} mesh
   * @param {number} shrink 0..0.9 — how much of the horizontal extent
   *   to give back. Default 0.25. Pass a larger value for props whose
   *   silhouette is mostly air (dead trees, gates, market stalls) and
   *   0 for genuine walls.
   */
  _addCollider(mesh, shrink = 0.25) {
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    if (shrink > 0) {
      const c = box.getCenter(new THREE.Vector3());
      const h = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      // Floor at 0.18m of half-extent so a signpost stays solid rather
      // than collapsing to a zero-width box the player walks through.
      const hx = Math.max(0.18, h.x * (1 - shrink));
      const hz = Math.max(0.18, h.z * (1 - shrink));
      box.min.set(c.x - hx, box.min.y, c.z - hz);
      box.max.set(c.x + hx, box.max.y, c.z + hz);
    }
    this.colliders.push({ box, mesh });
  }

  getColliders() {
    return this.colliders;
  }

  _createEldertree(pos, biome) {
    // A far larger canopy, same construction as an ordinary tree so
    // the world stays visually consistent.
    const leafColor = atmosphere
      .gradeColor(biome.colors.mid.clone().multiplyScalar(0.7))
      .getHex();
    const group = forgeTree(pos.scale * 2.0, { leaf: leafColor, bark: 0x2b1f14 });
    group.position.set(pos.x, pos.y, pos.z);
    group.rotation.y = pos.rotation;   // see _createTree — not noiseValue
    group.rotation.x = (pos.tiltX ?? 0) * 0.5;
    group.rotation.z = (pos.tiltZ ?? 0) * 0.5;

    this.harvestNodes.push({
      mesh: group,
      type: 'eldertree',
      hp: 80,
      maxHp: 80,
      position: new THREE.Vector3(pos.x, pos.y, pos.z),
    });

    return group;
  }

  _createRock(pos, biome) {
    if (Math.random() < 0.15) return this._createMithrilNode(pos, biome);

    const rockColor = atmosphere
      .gradeColor(biome.colors.high.clone().multiplyScalar(0.55))
      .getHex();

    const group = forgeRock(pos.scale * 1.1, rockColor);
    group.position.set(pos.x, pos.y, pos.z);
    // See the note in _createTree — noiseValue is near-constant for
    // anything that passed the placement threshold, so deriving the
    // angle from it made every rock face the same way.
    group.rotation.y = pos.rotation;
    // Rocks can lean harder than trees; they are not growing upward.
    group.rotation.x = (pos.tiltX ?? 0) * 2.2;
    group.rotation.z = (pos.tiltZ ?? 0) * 2.2;

    // Register as Harvestable Node
    this.harvestNodes.push({
      mesh: group,
      type: 'rock',
      hp: 40, // 4 hits
      maxHp: 40,
      position: new THREE.Vector3(pos.x, pos.y, pos.z)
    });
    
    return group;
  }

  _createMithrilNode(pos, biome) {
    // A seam of raw essence breaking the surface, not a cyan cube.
    const group = forgeShard(pos.scale * 1.1, 0xc9a0ff);
    group.position.set(pos.x, pos.y, pos.z);
    group.rotation.y = pos.rotation;   // see _createTree — not noiseValue
    group.rotation.x = (pos.tiltX ?? 0) * 1.5;
    group.rotation.z = (pos.tiltZ ?? 0) * 1.5;
    
    this.harvestNodes.push({ mesh: group, type: 'mithril', hp: 120, maxHp: 120, position: new THREE.Vector3(pos.x, pos.y, pos.z) });
    return group;
  }

  // --- Harvesting API ---
  
  damageNode(node, amount) {
    node.hp -= amount;
    
    // Flash white effect
    // Using traverse to grab nested meshes
    node.mesh.traverse(c => {
      if (c.material && c.isMesh) {
        if (!c.userData.origColor) c.userData.origColor = c.material.color.clone();
        c.material.color.setHex(0xffffff);
        setTimeout(() => { if(c.material) c.material.color.copy(c.userData.origColor); }, 100);
      }
    });

    // Wobble effect
    node.mesh.rotation.z += 0.2;
    setTimeout(() => { if (node.mesh) node.mesh.rotation.z -= 0.2; }, 100);
    
    if (node.hp <= 0) {
      this._destroyNode(node);
    }
  }

  _destroyNode(node) {
    // ⚠️ WORLD EXPANSION: what it yields is GatherSystem's call (tools,
    // ores, biome wood); the old fixed table below is the fallback.
    const yields = this.yieldOf?.(node, this.currentBiome);
    if (yields) {
      for (const y of yields) {
        const def = getItem(y.id);
        if (def && y.count > 0) pickupManager.spawn(def, node.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 1.5, (Math.random() - 0.5) * 0.6)), y.count);
      }
      this._removeNodeMesh(node);
      return;
    }
    // Spawn Resource
    let materialId = node.type === 'tree' ? 'oak_wood' : 'iron_ore';
    if (node.type === 'eldertree') materialId = 'eldertree';
    if (node.type === 'mithril') materialId = 'mithril_ore';
    if (this.currentBiome && this.currentBiome.name === 'Volcanic Wastes' && node.type === 'tree') materialId = 'ash_wood';
    if (this.currentBiome && this.currentBiome.name === 'Crystal Caverns' && node.type === 'rock') materialId = 'mithril_ore';

    const itemDef = MATERIALS.find(m => m.id === materialId);
    if (itemDef) {
       // A single ore/log per tree or boulder — three hits and a walk
       // over for one unit — was a big part of why crafting anything
       // felt out of reach; most Forge recipes ask for 4-8 of a raw
       // material at a time.
       const yieldCount = 2 + Math.floor(Math.random() * 3); // 2-4
       pickupManager.spawn(itemDef, node.position.clone().add(new THREE.Vector3(0, 1.5, 0)), yieldCount);
    }

    this._removeNodeMesh(node);
  }

  _removeNodeMesh(node) {
    // Shrink out and removes
    const popOut = () => {
      if (!node.mesh) return;
      node.mesh.scale.multiplyScalar(0.8);
      if (node.mesh.scale.x > 0.1) {
        requestAnimationFrame(popOut);
      } else {
        this.decorationGroup.remove(node.mesh);
        node.mesh.children.forEach(c => { if(c.geometry) c.geometry.dispose(); });
      }
    };
    popOut();

    const idx = this.harvestNodes.indexOf(node);
    if (idx !== -1) {
      this.harvestNodes.splice(idx, 1);
    }
  }

  getNodesInRange(position, range) {
    return this.harvestNodes.filter(n => n.position.distanceTo(position) < range);
  }

  // Get terrain group for raycasting
  getTerrainGroup() {
    return this.terrainGroup;
  }

  getCurrentBiome() {
    return this.currentBiome;
  }
}
