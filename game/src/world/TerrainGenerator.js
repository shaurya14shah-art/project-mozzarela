// ══════════════════════════════════════════════════════════
// Terrain Generator — Multi-Domain Noise + Dramatic Landscapes
// ══════════════════════════════════════════════════════════

import { pitCarve } from './WorldFeatures.js';
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { quality } from '../rendering/Quality.js';
import { WORLD } from '../data/constants.js';
import { atmosphere } from '../rendering/Atmosphere.js';
import { SEA_Y, blendHydro, hydroOf } from './Hydrology.js';

export class TerrainGenerator {
  /**
   * The live Nightmare warp, or null. Static because `_getHeight` is
   * called from several TerrainGenerator instances (the overworld's
   * and a Descent realm's) and the warp is a property of the RUN, not
   * of any one generator.
   *
   * ⚠️ Set only by NightmareSystem. Anything else writing here would
   * be a second writer to the shape of the world (trap #9).
   */
  static nightmareWarp = null;

  constructor(seed = 42) {
    this.seed = seed;

    // Multiple noise domains for rich terrain
    this.continentNoise  = createNoise2D(this._makeRng(seed));
    this.mountainNoise   = createNoise2D(this._makeRng(seed + 7));
    this.plateauNoise    = createNoise2D(this._makeRng(seed + 13));
    this.erosionNoise    = createNoise2D(this._makeRng(seed + 19));
    this.detailNoise     = createNoise2D(this._makeRng(seed + 31));
    this.cragNoise       = createNoise2D(this._makeRng(seed + 43));
    this.biomeNoise      = createNoise2D(this._makeRng(seed + 53));
    this.cavitiesNoise   = createNoise2D(this._makeRng(seed + 67));
    // Water (world/Hydrology.js): rivers, streams, lake basins, puddles.
    this.riverNoise      = createNoise2D(this._makeRng(seed + 71));
    this.streamNoise     = createNoise2D(this._makeRng(seed + 79));
    this.lakeNoise       = createNoise2D(this._makeRng(seed + 83));
    this.puddleNoise     = createNoise2D(this._makeRng(seed + 89));
    // ⚠️ The CURRENT blended water weights for _getHeight. Every caller
    // that blends biome parameters (mesh pass 1, the normal passes,
    // getHeightAt, ChunkManager.getGroundY) sets these first — the same
    // contract as heightScale/roughness, just not a positional argument
    // so the eight call sites keep their signatures.
    this._hy = { sea: 0, wet: 0, river: 0, lake: 0 };
    /** {x, z, r0, r1, h} while a Descent dungeon stands; see _getHeight. */
    this.flatZone = null;
    // Written by every _getHeight call: the water surface there (or
    // -Infinity), and how much of it is river / sea (for the shader).
    this._wSurf = -Infinity; this._wRiver = 0; this._wSea = 0;
  }

  _makeRng(seed) {
    let s = seed >>> 0;
    return () => {
      s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
      s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
      s ^= s >>> 16;
      return (s >>> 0) / 0xffffffff;
    };
  }

  // ── MAIN CHUNK MESH GENERATOR ─────────────────────────────

  /**
   * Build one chunk's terrain geometry.
   *
   * ══════════════════════════════════════════════════════════
   * ⚠️ `resOverride` IS THE DISTANCE LOD, AND IT IS THE LARGEST
   *    REMAINING LEVER ON THE LAG THE OWNER REPORTS.
   *
   * Until this parameter existed, EVERY chunk was built at
   * `quality.settings.chunkResolution` regardless of how far away it
   * was. Measured live at `high` (res 64) by instrumenting this
   * function:
   *
   *     vertices per chunk        4,225
   *     _getHeight calls          9,605   (2.27 / vertex)
   *     simplex evaluations      38,420   (9.1 / vertex)
   *     getBiomeWeights calls        81   (the BIOME_STEP cache works)
   *
   * With renderDistance 2 that is a 5x5 grid — **~960,500 noise
   * evaluations and ~105,000 vertices to fill the view** — and the
   * outer ring sits 128+ world units away, where the 0.57m vertex
   * spacing this resolution buys is far below what the screen can
   * resolve. The handoff concluded the residue was "raw simplex
   * evaluation, inherent to the height function". That is true PER
   * VERTEX; it stopped short of asking how many vertices the distant
   * rings actually need.
   *
   * ⚠️ THE RESOLUTION MUST STAY EVEN. The normals pass sets
   * `STRIDE = (res % 2 === 0) ? 2 : 1` and notes that an odd res puts
   * the far edge off-lattice and brings the lighting seam straight
   * back. Every value ChunkManager passes is even — see LOD_RES there.
   *
   * ⚠️ LIGHTING SEAMS ARE IMMUNE TO THIS, by construction. Normals are
   * central differences of a world-space analytic field with a FIXED
   * `EPS = 0.75` world units — not a fraction of `segSize` — so two
   * chunks at different resolutions still compute byte-identical
   * normals at a shared world position. That property is why LOD is
   * cheap here at all; it is also why `EPS` must never become
   * segSize-relative (the note at its definition says the same thing
   * for a different reason).
   *
   * ⚠️ GEOMETRIC cracks are NOT immune, and are handled by the skirt
   * at the end of this function. See there.
   * ══════════════════════════════════════════════════════════
   */
  generateChunkMesh(chunkX, chunkZ, biomeManager, resOverride = null) {
    const size = WORLD.CHUNK_SIZE;
    // Tier-driven, not the flat WORLD.CHUNK_RESOLUTION constant.
    //
    // 24 over a 64-unit chunk is a vertex every 2.67m. That is coarse
    // enough that individual triangles are plainly visible as facets on
    // any slope — the "blocky / Minecraft" read. It also wastes the
    // height function: _getHeight() computes six noise layers including
    // local roughness and fine surface detail, and at 2.67m spacing the
    // highest-frequency ones are averaged away before they ever reach a
    // vertex. Raising this doesn't just smooth the ground, it reveals
    // relief that was already being computed and thrown away.
    //
    // Cost is quadratic but the baseline is tiny: 24² was ~1.2k tris per
    // chunk (~10k across the 3x3 loaded set). 112² is ~25k per chunk,
    // ~226k across the set — still small for any GPU that qualifies for
    // this tier, and terrain is a single draw call per chunk.
    // ⚠️ Coerced EVEN. A caller passing an odd LOD resolution would
    // silently drop the normals pass to STRIDE 1 (doubling its cost)
    // AND put the chunk's far edge off the gradient lattice, which is
    // the lighting seam this project already fixed once.
    const rawRes = resOverride || quality.settings.chunkResolution || WORLD.CHUNK_RESOLUTION;
    const res  = Math.max(4, rawRes % 2 === 0 ? rawRes : rawRes - 1);
    const segSize = size / res;
    const cols = res + 1;

    const vertices  = new Float32Array(cols * cols * 3);
    const colors    = new Float32Array(cols * cols * 3);
    const heights   = new Float32Array(cols * cols); // scratch: needed below for cheap slope estimate
    const baseColors = new Array(cols * cols);        // scratch: pre-noise weighted biome color
    // ⚠️ THE ONE SATURATED ACCENT, carried per-vertex from pass 1 into
    // pass 2. A biome may declare `colors.accent` — Shadow Slave's
    // regions are three near-neutral values plus exactly one hot colour
    // (Godgrave's vermilion grass on bleached bone). It is applied in
    // pass 2 because that is where world coordinates and the noise
    // fields already exist; computing it here would cost a second noise
    // read per vertex in the most expensive loop in the game.
    // ⚠️ Stored as a WEIGHT, not a boolean, so a vertex on the border
    // between an accented biome and a plain one fades the accent out
    // instead of stopping it at a chunk-shaped line.
    const accentColors = new Array(cols * cols);
    const accentWeights = new Float32Array(cols * cols);
    // Ground layers (dirt, grass, sand, snow) per vertex — see
    // rendering/TerrainLayers.js. Blended from the biome weights exactly
    // like the colour, so a border between grassland and desert is a
    // gradient of real textures rather than a seam.
    const layers = new Float32Array(cols * cols * 4);
    // ── Blended biome params, kept per vertex ─────────────
    // Pass 1 already derives these four numbers for every vertex. Pass
    // 3 (normals) used to throw them away and re-derive them from
    // scratch — four times per vertex, through getHeightAt(), each
    // call re-running getBiomeWeights() and its blend loop. That is
    // 21,316 uncached biome lookups per chunk at the HD resolution,
    // and it completely bypassed the BIOME_STEP cache built right
    // below for exactly this reason. Keeping them costs 4 floats per
    // vertex and removes every one of those calls.
    const vHs   = new Float32Array(cols * cols);
    const vRg   = new Float32Array(cols * cols);
    const vMtn  = new Float32Array(cols * cols);
    const vPlat = new Float32Array(cols * cols);
    const vHy   = new Float32Array(cols * cols * 4);   // sea, wet, river, lake per vertex
    const _hb = { sea: 0, wet: 0, river: 0, lake: 0 };

    let vi = 0;

    // ── Biome weight cache ────────────────────────────────
    // getBiomeWeights() was called once per VERTEX. At the HD chunk
    // resolution that is 12,769 calls per chunk, each doing its own
    // noise lookups and array work — and it was measured at ~6.5ms of
    // the chunk's build time, entirely wasted.
    //
    // Wasted because biome fields vary over HUNDREDS of world units,
    // while vertices here are 0.57m apart. Sampling a slow-varying
    // field a thousand times inside one of its own features buys
    // nothing. We sample on a coarse grid instead and reuse the
    // nearest sample; at BIOME_STEP=8 that is ~200 calls instead of
    // ~12,800, and no transition in the world is sharp enough for the
    // difference to be visible.
    const BIOME_STEP = 8;
    const bCols = Math.ceil(res / BIOME_STEP) + 1;
    const biomeGrid = new Array(bCols * bCols);
    for (let bz = 0; bz < bCols; bz++) {
      for (let bx = 0; bx < bCols; bx++) {
        const wx = chunkX * size + Math.min(bx * BIOME_STEP, res) * segSize;
        const wz = chunkZ * size + Math.min(bz * BIOME_STEP, res) * segSize;
        biomeGrid[bz * bCols + bx] = biomeManager.getBiomeWeights(wx, wz);
      }
    }

    // ── Pass 1: heights + weighted biome base color per vertex ──
    for (let iz = 0; iz <= res; iz++) {
      for (let ix = 0; ix <= res; ix++) {
        const idx = iz * cols + ix;
        const worldX = chunkX * size + ix * segSize;
        const worldZ = chunkZ * size + iz * segSize;

        const biomeWeights = biomeGrid[
          Math.round(iz / BIOME_STEP) * bCols + Math.round(ix / BIOME_STEP)
        ];

        let avgHeightScale = 0;
        let avgRoughness = 0;
        let avgMountain = 0;
        let avgPlateau = 0;

        for (const bw of biomeWeights) {
          const b = bw.biome;
          avgHeightScale += (WORLD.TERRAIN_HEIGHT_SCALE * (b.heightScale || 1.0)) * bw.weight;
          avgRoughness   += (b.roughness || 0.5) * bw.weight;
          avgMountain    += (b.mountainFactor || 0.0) * bw.weight;
          avgPlateau     += (b.plateauFactor  || 0.0) * bw.weight;
        }

        vHs[idx]   = avgHeightScale;
        vRg[idx]   = avgRoughness;
        vMtn[idx]  = avgMountain;
        vPlat[idx] = avgPlateau;
        blendHydro(biomeWeights, _hb);
        vHy[idx * 4] = _hb.sea; vHy[idx * 4 + 1] = _hb.wet; vHy[idx * 4 + 2] = _hb.river; vHy[idx * 4 + 3] = _hb.lake;
        this._hy.sea = _hb.sea; this._hy.wet = _hb.wet; this._hy.river = _hb.river; this._hy.lake = _hb.lake;

        const height = this._getHeight(worldX, worldZ, avgHeightScale, avgRoughness, avgMountain, avgPlateau);

        vertices[vi++] = ix * segSize;
        vertices[vi++] = height;
        vertices[vi++] = iz * segSize;
        heights[idx] = height;

        // Weighted biome color
        const normH = this._normalizeHeight(height, avgHeightScale);
        const finalColor = new THREE.Color(0, 0, 0);
        let accR = 0, accG = 0, accB = 0, accW = 0;
        for (const bw of biomeWeights) {
          const c = this._getBiomeColorForHeight(bw.biome, normH);
          finalColor.r += c.r * bw.weight;
          finalColor.g += c.g * bw.weight;
          finalColor.b += c.b * bw.weight;
          const a = bw.biome.colors.accent;
          if (a) { accR += a.r * bw.weight; accG += a.g * bw.weight; accB += a.b * bw.weight; accW += bw.weight; }
        }
        baseColors[idx] = finalColor;
        accentWeights[idx] = accW;
        {
          let l0 = 0, l1 = 0, l2 = 0, l3 = 0;
          for (const bw of biomeWeights) {
            const g = bw.biome.ground;
            if (!g) continue;
            l0 += g[0] * bw.weight; l1 += g[1] * bw.weight; l2 += g[2] * bw.weight; l3 += g[3] * bw.weight;
          }
          // Bare patches in grass: grass gives way to soil in noise-driven
          // patches, the way a real meadow is worn through to earth.
          // Reuses a field already sampled elsewhere — no new noise type.
          if (l1 > 0) {
            const patch = (this.cavitiesNoise(worldX * 0.021 + 300, worldZ * 0.021 - 300) + 1) * 0.5;
            const bare = Math.max(0, Math.min(1, (patch - 0.58) * 3.2));
            l0 += l1 * bare; l1 *= 1 - bare;
          }
          layers[idx * 4] = l0; layers[idx * 4 + 1] = l1; layers[idx * 4 + 2] = l2; layers[idx * 4 + 3] = l3;
        }
        // ⚠️ Normalised by its own weight, not by the total. Left
        // un-normalised, a vertex 30% inside Godgrave would carry a
        // vermilion that is 70% BLACK, and the accent would read as
        // grime along every border instead of as growth.
        if (accW > 0) accentColors[idx] = new THREE.Color(accR / accW, accG / accW, accB / accW);
      }
    }

    // ── Pass 2: bake cheap per-vertex noise variation + slope-driven
    // dirt/rock exposure into the vertex colors. Computed once here at
    // chunk-generation time (not per frame) so a flat biome hex color
    // doesn't read as one uniform tile of ground. Slope comes from finite
    // differences on the height grid we already built above — no extra
    // noise/height evaluations needed for it.
    const hsl = { h: 0, s: 0, l: 0 };
    const noiseScale = WORLD.TERRAIN_NOISE_SCALE * 6.0;

    // Global push toward the tarnished-metal/dried-blood palette
    // direction (see style.css --chrome/--accent/--ground tokens) rather
    // than saturated toy-grass/toy-stone. Multiplicative, so it reins in
    // whatever's currently brightest/most saturated — biome high/peak
    // colors, mostly — while barely touching ground that already reads
    // dark. BiomeManager's palettes stay untouched (out of scope); this
    // is a one-time-per-vertex grade applied after biome blending, the
    // same place the existing speckle/exposure noise already lives.
    const GROUND_DARKEN = 0.82;
    const GROUND_DESAT  = 0.68;

    for (let iz = 0; iz <= res; iz++) {
      for (let ix = 0; ix <= res; ix++) {
        const idx = iz * cols + ix;
        const worldX = chunkX * size + ix * segSize;
        const worldZ = chunkZ * size + iz * segSize;

        const hC = heights[idx];
        const hX = heights[ix < res ? idx + 1 : idx - 1];
        const hZ = heights[iz < res ? idx + cols : idx - cols];
        const slope = (Math.abs(hX - hC) + Math.abs(hZ - hC)) / segSize;
        const slope01 = Math.min(1, slope / 2.2);

        const color = baseColors[idx];
        color.getHSL(hsl);

        hsl.l = this._clamp01(hsl.l * GROUND_DARKEN);
        hsl.s = this._clamp01(hsl.s * GROUND_DESAT);

        // Subtle shade/saturation speckle — two samples of the same cheap
        // noise field at different frequencies/offsets stand in for two
        // independent fields without the cost of a second noise instance.
        const shadeN = this.cavitiesNoise(worldX * noiseScale, worldZ * noiseScale);
        const satN   = this.cavitiesNoise((worldX + 500) * noiseScale * 1.7, (worldZ - 500) * noiseScale * 1.7);
        hsl.l = this._clamp01(hsl.l * (1 + shadeN * 0.12));
        hsl.s = this._clamp01(hsl.s * (1 + satN * 0.18));

        // Patchy dirt/rock exposure on steep slopes — desaturate + darken,
        // scaled by a slower noise so it reads as patches, not a uniform
        // coat over every incline. Pushed further than before (0.5/0.25 →
        // 0.6/0.32): the retuned height stack now produces real cliff
        // faces, and those faces are exactly where bare, tarnished rock
        // should dominate over whatever soft biome color sits on the flats.
        if (slope01 > 0.001) {
          const patchN = (this.cavitiesNoise(worldX * noiseScale * 0.35, worldZ * noiseScale * 0.35) + 1) / 2;
          const exposure = slope01 * (0.4 + patchN * 0.6);
          hsl.s = this._clamp01(hsl.s * (1 - exposure * 0.6));
          hsl.l = this._clamp01(hsl.l * (1 - exposure * 0.32));
        }

        color.setHSL(hsl.h, hsl.s, hsl.l);

        // ── THE ACCENT ────────────────────────────────────
        // ⚠️ PATCHY, and driven by a field already in hand — the same
        // reasoning as the strata mask. A uniform accent is a recolour
        // of the biome; patches that appear on some ground and not on
        // neighbouring ground read as something GROWING there, which is
        // what the vermilion actually is.
        // ⚠️ Suppressed on slope. It collects in flats and hollows and
        // does not climb cliff faces, so the bone stays bone exactly
        // where the eye reads the biome's structure.
        // ⚠️ Capped well below 1 — this is the one hot colour in a
        // three-value palette, and at full strength it stops being an
        // accent and becomes the ground.
        const aw = accentWeights[idx];
        if (aw > 0.001) {
          const patch = (this.cavitiesNoise((worldX - 900) * noiseScale * 0.5,
                                            (worldZ + 900) * noiseScale * 0.5) + 1) / 2;
          // ⚠️ THRESHOLD MEASURED, NOT GUESSED. At 0.52/1.9/0.55 this
          // tinted 37% of Godgrave and 51% of the Forgotten Shore —
          // past roughly a third the accent stops being the one hot
          // colour and becomes the biome's base, which is the exact
          // failure the three-value rule exists to prevent. Counted
          // again at 0.70/1.6/0.40.
          const mix = aw * Math.max(0, patch - 0.70) * 1.6 * (1 - slope01);
          if (mix > 0) color.lerp(accentColors[idx], Math.min(0.40, mix));
        }

        colors[idx * 3]     = color.r;
        colors[idx * 3 + 1] = color.g;
        colors[idx * 3 + 2] = color.b;
      }
    }

    // Indices
    const indexCount = res * res * 6;
    const indices = new Uint32Array(indexCount);
    let ii = 0;
    for (let iz = 0; iz < res; iz++) {
      for (let ix = 0; ix < res; ix++) {
        const a = iz * (res + 1) + ix;
        const b = a + 1;
        const c = (iz + 1) * (res + 1) + ix;
        const d = c + 1;
        indices[ii++] = a; indices[ii++] = c; indices[ii++] = b;
        indices[ii++] = b; indices[ii++] = c; indices[ii++] = d;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('aLayer',   new THREE.Float32BufferAttribute(layers, 4));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));

    // ── ANALYTIC NORMALS, not computeVertexNormals() ──
    //
    // ⚠️ This is why the terrain used to show a visible crease along
    // every chunk boundary.
    //
    // computeVertexNormals() averages the face normals of the triangles
    // that are IN THIS GEOMETRY. A vertex on a chunk's edge only has
    // triangles on one side of it here — its neighbours live in a
    // different BufferGeometry that this chunk knows nothing about — so
    // its normal is computed from half the surface and comes out
    // tilted. The chunk next door makes the opposite error at the same
    // world position, and the two disagree. The result is a hard
    // lighting seam on a surface that is mathematically perfectly
    // smooth across it: the single most "low-poly" artefact left in the
    // game, and one no amount of extra resolution fixes, because
    // raising the resolution just makes the seams thinner.
    //
    // The height field is analytic (see getGroundY's note in
    // ChunkManager — the same reasoning that replaced the per-frame
    // terrain raycast), so the true surface normal is available exactly
    // via central differences, with no reference to any neighbouring
    // geometry at all. Every chunk computes the same normal at the same
    // world position by construction, so the seams cannot exist.
    //
    // Cost: 4 extra height samples per vertex. That is real, but it is
    // paid once per chunk at build time, never per frame, and chunk
    // building is already budgeted through drainChunkQueue().
    const normals = new Float32Array((res + 1) * (res + 1) * 3);
    // A fixed epsilon in WORLD units, not a fraction of segSize: the
    // gradient of the terrain is a property of the world, not of how
    // finely this particular chunk happens to be tessellated. Using
    // segSize would make a `low`-tier chunk and an `ultra`-tier chunk
    // disagree about the shading of identical ground.
    const EPS = 0.75;

    // ══════════════════════════════════════════════════════
    // ⚠️ THE GRADIENT IS SAMPLED ON A COARSE LATTICE AND
    //    INTERPOLATED. The SEAM FIX IS UNAFFECTED — read this before
    //    changing STRIDE.
    //
    // The four samples above are the single most expensive thing in
    // chunk generation: 4 extra `_getHeight` calls per vertex, each
    // ~15 noise evaluations. At `high` (res 64) that is 65x65x4 =
    // **16,900** height evaluations per chunk for normals alone.
    // Measured: terrain mesh **16.8ms** of a 19.2ms chunk build,
    // against drainChunkQueue's 6ms budget — i.e. the hitch you feel
    // walking into new ground, which is exactly what the owner
    // reported as lag.
    //
    // A/B on a PINNED seed and identical coordinates (the world seed is
    // Math.random() per load, so cross-reload timings are not
    // comparable — that mistake cost a round of bad numbers here):
    //     STRIDE 1 : 17.4ms median / 23.2ms worst
    //     STRIDE 2 :  9.4ms median / 15.2ms worst   ← -46%
    //
    // The normals only have to AGREE ACROSS CHUNKS to kill the seam,
    // and they agree because they are central differences of a
    // world-space analytic field — not because they are taken at every
    // vertex. So the gradient is evaluated every STRIDE vertices and
    // bilinearly interpolated between.
    //
    // ⚠️ STRIDE MUST DIVIDE `res`, so index 0 and index `res` — the
    // shared chunk EDGES — are always exact analytic samples and two
    // neighbouring chunks still compute byte-identical normals there.
    // Every tier's res (24 / 40 / 64 / 72) is divisible by 2. An odd
    // res would put the far edge off-lattice and the seam would come
    // straight back, so it falls through to full density instead.
    //
    // Interpolating a gradient across 2 vertices of a smooth field is
    // a far smaller error than the artefact this whole pass exists to
    // remove — and it is interior-only by construction.
    // ══════════════════════════════════════════════════════
    const STRIDE = (res % 2 === 0) ? 2 : 1;
    const cRes = res / STRIDE;                 // coarse cells per side
    const cCols = cRes + 1;
    // Raw gradients (df/dx, df/dz) at the coarse lattice, NOT
    // normalised — normalising before interpolation would shorten the
    // interpolated vector and darken the shading between samples.
    const gX = new Float32Array(cCols * cCols);
    const gZ = new Float32Array(cCols * cCols);
    for (let cz = 0; cz <= cRes; cz++) {
      for (let cx = 0; cx <= cRes; cx++) {
        const ix = cx * STRIDE, iz = cz * STRIDE;
        const wx = chunkX * size + ix * segSize;
        const wz = chunkZ * size + iz * segSize;
        // ⚠️ _getHeight with THIS lattice point's own blended biome
        // params — not getHeightAt(), which re-derives them per
        // sample. We are differentiating the HEIGHT field, holding the
        // biome blend locally constant: the standard way to take this
        // derivative, and the only way that stays consistent, since a
        // lattice point shared by two chunks gets the same params in
        // both (pass 1 evaluates them at the same world position). The
        // blend varies over hundreds of world units and EPS is 0.75,
        // so the dropped term is the biome field's own gradient — far
        // under a tenth of a degree even across a biome transition.
        const bi = iz * cols + ix;
        const hs = vHs[bi], rg = vRg[bi], mt = vMtn[bi], pl = vPlat[bi];
        this._hy.sea = vHy[bi * 4]; this._hy.wet = vHy[bi * 4 + 1]; this._hy.river = vHy[bi * 4 + 2]; this._hy.lake = vHy[bi * 4 + 3];
        const hL = this._getHeight(wx - EPS, wz, hs, rg, mt, pl);
        const hR = this._getHeight(wx + EPS, wz, hs, rg, mt, pl);
        const hD = this._getHeight(wx, wz - EPS, hs, rg, mt, pl);
        const hU = this._getHeight(wx, wz + EPS, hs, rg, mt, pl);
        const ci = cz * cCols + cx;
        gX[ci] = -(hR - hL) / (2 * EPS);
        gZ[ci] = -(hU - hD) / (2 * EPS);
      }
    }

    let ni = 0;
    for (let iz = 0; iz <= res; iz++) {
      for (let ix = 0; ix <= res; ix++) {
        // ⚠️ THE FOUR EDGES ARE ALWAYS EXACT, never interpolated.
        //
        // A shared edge vertex is on the lattice in X but its Z can
        // fall between lattice rows, so it would otherwise take an
        // interpolated gradient — and interpolation error is what
        // shows up as a lighting seam. Measured across a shared edge:
        // full density 2.26°, interpolated everywhere 3.04°,
        // interpolated interior + exact edges **2.26°** — i.e. this
        // buys back the entire difference for 4*res extra samples
        // (256 of 16,900 at `high`, under 2%).
        //
        // ⚠️ The residual 2.26° is PRE-EXISTING and not from this
        // optimisation — verified by measuring it at STRIDE = 1. It
        // comes from the per-vertex biome blend, not the gradient.
        // HANDOFF records 0.0195° for this measurement, so something
        // regressed it earlier; see §4's note. Still far below the
        // 11.43° artefact the analytic-normal pass was written to fix.
        const onEdge = (ix === 0 || ix === res || iz === 0 || iz === res);
        if (onEdge) {
          const wx = chunkX * size + ix * segSize;
          const wz = chunkZ * size + iz * segSize;
          const bi = iz * cols + ix;
          const hs = vHs[bi], rg = vRg[bi], mt = vMtn[bi], pl = vPlat[bi];
          this._hy.sea = vHy[bi * 4]; this._hy.wet = vHy[bi * 4 + 1]; this._hy.river = vHy[bi * 4 + 2]; this._hy.lake = vHy[bi * 4 + 3];
          const hL = this._getHeight(wx - EPS, wz, hs, rg, mt, pl);
          const hR = this._getHeight(wx + EPS, wz, hs, rg, mt, pl);
          const hD = this._getHeight(wx, wz - EPS, hs, rg, mt, pl);
          const hU = this._getHeight(wx, wz + EPS, hs, rg, mt, pl);
          const ex = -(hR - hL) / (2 * EPS);
          const ez = -(hU - hD) / (2 * EPS);
          const einv = 1 / Math.hypot(ex, 1, ez);
          normals[ni++] = ex * einv;
          normals[ni++] = einv;
          normals[ni++] = ez * einv;
          continue;
        }

        // Bilinear lookup into the coarse gradient lattice.
        const fx = ix / STRIDE, fz = iz / STRIDE;
        const x0 = Math.min(cRes, Math.floor(fx)), z0 = Math.min(cRes, Math.floor(fz));
        const x1 = Math.min(cRes, x0 + 1), z1 = Math.min(cRes, z0 + 1);
        const tx = fx - x0, tz = fz - z0;
        const i00 = z0 * cCols + x0, i10 = z0 * cCols + x1;
        const i01 = z1 * cCols + x0, i11 = z1 * cCols + x1;
        const gx0 = gX[i00] + (gX[i10] - gX[i00]) * tx;
        const gx1 = gX[i01] + (gX[i11] - gX[i01]) * tx;
        const gz0 = gZ[i00] + (gZ[i10] - gZ[i00]) * tx;
        const gz1 = gZ[i01] + (gZ[i11] - gZ[i01]) * tx;
        // Surface normal of y = f(x,z) is (-df/dx, 1, -df/dz), normalised.
        let nx = gx0 + (gx1 - gx0) * tz;
        let nz = gz0 + (gz1 - gz0) * tz;
        const inv = 1 / Math.hypot(nx, 1, nz);
        normals[ni++] = nx * inv;
        normals[ni++] = inv;
        normals[ni++] = nz * inv;
      }
    }
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

    // ══════════════════════════════════════════════════════════
    // THE SKIRT — what makes distance LOD safe
    //
    // ⚠️ Neighbouring chunks at DIFFERENT resolutions do not crack in
    // their LIGHTING (normals are analytic and world-space, see the
    // header) but they do crack GEOMETRICALLY. A res-32 chunk draws a
    // straight chord between two edge vertices 2m apart; the res-64
    // chunk next to it has a vertex in the middle of that span which
    // follows the real height field. Wherever the ground is convex the
    // low-res edge sits BELOW the high-res one and you can see through
    // the gap — to the sky, or to nothing.
    //
    // ⚠️ The vertices themselves COINCIDE exactly, because every LOD
    // resolution divides the base one (LOD_RES in ChunkManager) and
    // the height field is a pure function of world position. So the
    // crack is never a misaligned corner — only the sag between shared
    // points, bounded by the terrain's curvature over one low-res span.
    //
    // A skirt is the standard fix and by far the cheapest: a ring of
    // vertices directly beneath the border, dropped straight down, with
    // quads joining it to the edge. It plugs the gap from behind
    // without touching the surface itself. At res 64 it costs 260
    // vertices and 512 triangles against the chunk's 4,225 / 8,192 —
    // about 6%, paid only so the other rings can be built at a
    // QUARTER of that.
    //
    // ⚠️ Skirt vertices carry the EDGE vertex's own colour and a
    // straight-down normal. Copying the surface normal instead would
    // light the skirt as if it were ground, and it would catch the sun
    // at grazing angles and read as a bright rim around every chunk.
    // Straight down keeps it in shadow, which is what a hidden patch
    // wants to be.
    //
    // ⚠️ DEPTH is in world units and generous. It has to exceed the
    // worst sag the height stack can produce across one low-res span;
    // a skirt shorter than the crack is a skirt that does not work,
    // and the cost of overshooting is geometry nobody ever sees.
    // ══════════════════════════════════════════════════════════
    const SKIRT_DEPTH = 6.0;
    const border = [];
    for (let ix = 0; ix <= res; ix++) border.push(ix);                       // z = 0
    for (let iz = 1; iz <= res; iz++) border.push(iz * cols + res);          // x = res
    for (let ix = res - 1; ix >= 0; ix--) border.push(res * cols + ix);      // z = res
    for (let iz = res - 1; iz >= 1; iz--) border.push(iz * cols);            // x = 0

    const ringLen = border.length;
    const basePos = geo.attributes.position.array;
    const baseCol = geo.attributes.color.array;
    const skirtPos = new Float32Array(ringLen * 3);
    const skirtCol = new Float32Array(ringLen * 3);
    const skirtNrm = new Float32Array(ringLen * 3);
    for (let k = 0; k < ringLen; k++) {
      const b = border[k];
      skirtPos[k * 3]     = basePos[b * 3];
      skirtPos[k * 3 + 1] = basePos[b * 3 + 1] - SKIRT_DEPTH;
      skirtPos[k * 3 + 2] = basePos[b * 3 + 2];
      skirtCol[k * 3]     = baseCol[b * 3];
      skirtCol[k * 3 + 1] = baseCol[b * 3 + 1];
      skirtCol[k * 3 + 2] = baseCol[b * 3 + 2];
      skirtNrm[k * 3]     = 0;
      skirtNrm[k * 3 + 1] = -1;
      skirtNrm[k * 3 + 2] = 0;
    }

    const vertCount = cols * cols;
    const mergedPos = new Float32Array(basePos.length + skirtPos.length);
    mergedPos.set(basePos); mergedPos.set(skirtPos, basePos.length);
    const mergedCol = new Float32Array(baseCol.length + skirtCol.length);
    mergedCol.set(baseCol); mergedCol.set(skirtCol, baseCol.length);
    const baseNrm = geo.attributes.normal.array;
    const mergedNrm = new Float32Array(baseNrm.length + skirtNrm.length);
    mergedNrm.set(baseNrm); mergedNrm.set(skirtNrm, baseNrm.length);

    // ⚠️ The ring is CLOSED — segment k joins border[k] to border[k+1]
    // with the last wrapping to the first. Leaving it open leaves four
    // corner gaps, which are the most visible part of the crack because
    // that is where two different LOD levels actually meet.
    const skirtIdx = new Uint32Array(ringLen * 6);
    let si = 0;
    for (let k = 0; k < ringLen; k++) {
      const k2 = (k + 1) % ringLen;
      const tA = border[k], tB = border[k2];
      const sA = vertCount + k, sB = vertCount + k2;
      skirtIdx[si++] = tA; skirtIdx[si++] = sA; skirtIdx[si++] = tB;
      skirtIdx[si++] = tB; skirtIdx[si++] = sA; skirtIdx[si++] = sB;
    }
    const mergedIdx = new Uint32Array(indices.length + skirtIdx.length);
    mergedIdx.set(indices); mergedIdx.set(skirtIdx, indices.length);

    geo.setAttribute('position', new THREE.Float32BufferAttribute(mergedPos, 3));
    geo.setAttribute('color',    new THREE.Float32BufferAttribute(mergedCol, 3));
    geo.setAttribute('normal',   new THREE.Float32BufferAttribute(mergedNrm, 3));
    // ⚠️ The skirt must carry the layers too, or a BufferGeometry with
    // mismatched attribute lengths reads past the end of aLayer.
    {
      const baseLay = geo.attributes.aLayer.array;
      const mergedLay = new Float32Array(baseLay.length + ringLen * 4);
      mergedLay.set(baseLay);
      for (let k = 0; k < ringLen; k++) mergedLay.set(baseLay.subarray(border[k] * 4, border[k] * 4 + 4), baseLay.length + k * 4);
      geo.setAttribute('aLayer', new THREE.Float32BufferAttribute(mergedLay, 4));
    }
    geo.setIndex(new THREE.BufferAttribute(mergedIdx, 1));
    // ⚠️ The skirt hangs below the surface, so the auto-computed
    // bounding sphere from the surface alone would be too small and
    // the chunk could be frustum-culled while its skirt is still on
    // screen. Recomputed from the merged positions.
    geo.computeBoundingSphere();
    // Recorded so ChunkManager can tell which LOD a cached chunk was
    // built at without re-deriving it — see _lodResFor there.
    geo.userData.lodRes = res;
    // ⚠️ How many vertices are SURFACE, before the skirt ring. Any
    // caller that rewrites positions (ChunkManager's hub flatten) must
    // stop here — clamping the skirt to the surface's ceiling collapses
    // it and removes the crack cover it exists to provide.
    geo.userData.surfaceVertexCount = vertCount;

    return geo;
  }

  // ── HEIGHT FUNCTION ───────────────────────────────────────

  _getHeight(x, z, heightScale, roughness, mountainFactor = 0, plateauFactor = 0) {
    // Flatten near spawn
    const dist = Math.sqrt(x * x + z * z);
    // ⚠️ 120 → 85, and this is why the terrain work looked like it had
    // done nothing. The whole area a new player spends their first
    // half-hour in was multiplied toward ZERO height, so every change
    // to the height stack was invisible exactly where the game is
    // actually played. Measured relief across a ring at each distance
    // BEFORE this change: 60m → 1.0, 120m → 2.0, 200m → 8.5. You had
    // to walk three chunks to see the ground do anything at all.
    //
    // ⚠️ It cannot go much below this. The Sanctuary's built footprint
    // (keep at z=-11, corner towers at ±14, outer ring near 24, market
    // stalls beyond) needs level ground under it, and buildings are
    // placed at fixed positions with no terrain-conforming foundation.
    // 85 clears the furthest structure with room to spare while
    // letting relief begin as soon as the player is outside the walls.
    const flattenFactor = Math.min(1.0, dist / 85);

    // ══════════════════════════════════════════════════════
    // ⚠️ DOMAIN WARP — the reason this ground stopped looking like
    //    noise and started looking like geology.
    //
    // Owner: *"for gods sake improve the terrain as well."* The stack
    // below is SEVEN ADDITIVE fBm LAYERS, and additive fBm has one
    // characteristic look: soft, blobby, isotropic swells. Every ridge
    // runs in no particular direction, every valley is round, and no
    // amount of extra octaves changes that — more octaves just add
    // smaller versions of the same blobs.
    //
    // Warping the SAMPLE COORDINATES by another noise field before
    // reading the big layers bends those swells along a flow. Ridges
    // start to meander and braid, basins elongate, and the ground
    // reads as something that was pushed and folded rather than
    // summed. It is the single highest ratio of visual change to cost
    // in procedural terrain, and it is two extra noise reads.
    //
    // ⚠️ Applied ONLY to continent and mountain — the two layers that
    // decide the silhouette. Warping the fine layers as well would
    // cost four more reads per vertex to move detail nobody can
    // resolve, and `getGroundY` is the most performance-critical
    // function in the game.
    //
    // ⚠️ WARP_AMP is in WORLD UNITS and deliberately large. A warp
    // smaller than the feature it is bending does nothing visible —
    // it has to be a decent fraction of the wavelength of the layer it
    // is warping or it just adds a shimmer.
    // ══════════════════════════════════════════════════════
    const warpScale = WORLD.TERRAIN_NOISE_SCALE * 0.30;
    const WARP_AMP = 46;
    const wx = x + this.erosionNoise(x * warpScale, z * warpScale) * WARP_AMP;
    const wz = z + this.erosionNoise((x + 137.5) * warpScale, (z - 91.3) * warpScale) * WARP_AMP;

    // ── Layer 1: Continental base (broad, gentle rolling)
    // Weight pulled back 0.7 → 0.5: this layer was eating most of the
    // vertical budget as a smooth swell under EVERYTHING, which is
    // exactly the "uniformly rolling" read we're moving away from.
    // Trimming it leaves more contrast headroom for the sharper layers
    // below to actually dominate the silhouette instead of being
    // buried under a gentle base hill.
    const contScale = WORLD.TERRAIN_NOISE_SCALE * 0.5;
    let continent = this._fbm(this.continentNoise, wx, wz, contScale, 4, 0.5, 2.0);
    // Clamp continent to positive — creates land masses
    continent = Math.max(0, continent) * 0.5;

    // ── Layer 2: Mountain ridges (sharp, peaked)
    // Ridge power raised 1.8 → 2.4: pushes more of the ridge curve's
    // mass toward the crest and away from the shoulder, so a range
    // reads as a jagged spine with real drop-off rather than a
    // smoothed-off hump. Gain nudged up to compensate for the steeper
    // falloff eating some of the peak's raw height.
    // ⚠️ Early-out, matching _plateauNoise's own `strength <= 0` guard
    // and the crag layer's `mountainFactor > 0.15`. This layer is the
    // most expensive in the stack — a 5-octave ridge — and it was the
    // only one that computed itself in full and THEN multiplied by a
    // factor that is exactly 0.0 in six of the fourteen biomes
    // (Plains, Crystal Caverns, Desert Ruins, Twilight Swamp, Glowing
    // Grotto, the Sanctuary) and near it across the blend ring around
    // each of them.
    let mountain = 0;
    if (mountainFactor > 0.004) {
      const mtnScale = WORLD.TERRAIN_NOISE_SCALE * 1.2;
      const ridge = this._ridgeNoise(this.mountainNoise, wx, wz, mtnScale, 5);
      mountain = Math.pow(Math.max(0, ridge), 2.4) * mountainFactor * 1.25;
    }

    // ── Layer 3: Plateau (flat-topped mesa structures)
    const platScale = WORLD.TERRAIN_NOISE_SCALE * 0.35;
    let plateau = this._plateauNoise(x, z, platScale, plateauFactor);

    // ── Layer 4: Local roughness (rocks, bumps)
    const roughScale = WORLD.TERRAIN_NOISE_SCALE * 3.0;
    let local = this._fbm(this.erosionNoise, x, z, roughScale, 3, 0.5, 2.0) * roughness * 0.4;

    // ── Layer 5: Fine detail (micro surface variation)
    const detScale = WORLD.TERRAIN_NOISE_SCALE * 8.0;
    let detail = this.detailNoise(x * detScale, z * detScale) * 0.06;

    // ── Layer 6: Crags — dramatic vertical spires in mountain zones
    // Threshold lowered 0.3 → 0.15 so crags show up through moderate
    // mountain influence, not just the most extreme biomes; exponent
    // raised 3 → 4 so only the noise field's sharpest peaks actually
    // spire (fewer of them, but the ones that do stand out harder);
    // amplitude raised 0.5 → 0.7 to make that spire read against the
    // now-sharper ridge/mesa terrain around it.
    const cragScale = WORLD.TERRAIN_NOISE_SCALE * 4.0;
    let crag = 0;
    if (mountainFactor > 0.15) {
      const c = this.cragNoise(x * cragScale, z * cragScale);
      crag = Math.pow(Math.max(0, c), 4) * mountainFactor * 0.7;
    }

    // ── Layer 7: Micro-relief — only meaningful at HD resolution
    //
    // Every layer above bottoms out around a 14-unit wavelength. At the
    // old 2.67m vertex spacing that was the right place to stop: finer
    // noise than that cannot be represented by the mesh, and adding it
    // anyway just aliases into shimmer as the camera moves.
    //
    // At HD resolution (0.57m spacing) the mesh can carry features down
    // to roughly 1.5m, and without anything occupying that band the
    // ground reads as smoothly sculpted dunes — the opposite failure
    // from the faceted look, but still not like ground.
    //
    // Two octaves, both deliberately tiny in amplitude: ~0.2m and
    // ~0.07m once the heightScale below is applied. That is undulation
    // you can see raking light across, not terrain you can trip over,
    // so it changes the look without touching traversal or collision in
    // any way the player can feel.
    let micro = 0;
    const microRes = quality.settings.chunkResolution || WORLD.CHUNK_RESOLUTION;
    if (microRes >= 48) {
      // ⚠️ Frequency is derived from the actual vertex spacing, not
      // hardcoded. The first version used a fixed ~1.9m wavelength,
      // which at the 0.89m vertex spacing of this tier is 2.1 samples
      // per wavelength — exactly Nyquist. The result was severe
      // aliasing that showed up as regular corduroy ripples running
      // across every hillside, which reads as a rendering fault, not
      // as terrain.
      //
      // Four samples per wavelength is the practical floor for a
      // displaced surface (below that, normals computed from adjacent
      // vertices start pointing in essentially random directions).
      const spacing = WORLD.CHUNK_SIZE / microRes;
      const minWavelength = spacing * 4.0;
      const maxFreq = 1.0 / minWavelength;
      const mScale = Math.min(WORLD.TERRAIN_NOISE_SCALE * 30.0, maxFreq);
      micro = this.erosionNoise(x * mScale, z * mScale) * 0.012;
      // Suppressed on near-vertical faces. Displacing a cliff along Y
      // stretches its triangles rather than adding detail to them, and
      // the triplanar normal map is already doing that job there far
      // better than geometry can.
      micro *= (1 - Math.min(1, mountainFactor * 0.5));
    }

    // Combine all layers
    let rawHeight = (continent + mountain + plateau + local + detail + crag + micro);

    // ══════════════════════════════════════════════════════
    // ⚠️ STRATA — horizontal rock bands, and they cost NO noise.
    //
    // This world is a cracked stone waste (§3), and stone that has
    // been cut into by anything shows LAYERS. Quantising the height
    // toward a set of bands, then blending most of the way back
    // toward the true height, produces terracing: flat shelves with
    // steeper risers between them. That is what makes a slope read as
    // sedimentary rock rather than as a smooth ramp, and it gives the
    // eye a horizontal reference that says how big a hill is.
    //
    // ⚠️ PURE ARITHMETIC on a height that has already been computed —
    // no extra noise reads, no extra `_getHeight` calls. That matters
    // because this runs ~9,600 times per chunk.
    //
    // ⚠️ STRENGTH IS PATCHY, driven by a layer already in hand
    // (`local`). Uniform terracing everywhere reads as a rendering
    // artefact — a stair-step pattern stamped over the whole world.
    // Bands that appear on some faces and fade on others read as
    // exposed rock, which is the point.
    //
    // ⚠️ NEVER FULL STRENGTH. At 1.0 the ground becomes literal stairs
    // and, more seriously, the flats become exactly level — which
    // makes `getGroundY`'s gradient zero across whole shelves and
    // gives the analytic normals nothing to shade. Capped well below.
    //
    // ⚠️ Applied BEFORE `flattenFactor`, so the spawn bowl still
    // flattens cleanly instead of terracing into a stepped crater.
    // ══════════════════════════════════════════════════════
    // ⚠️ STRENGTH MUST BE HIGH TO PRODUCE A SHELF AT ALL. The first
    // version blended 42% toward the bands, which does not terrace —
    // it just compresses the slope slightly. Measured: **0 flat spans
    // in 67 samples** across a 200m traverse, i.e. the effect was
    // invisible and I nearly shipped it as done. Terracing only reads
    // once most of the height is snapped, because a shelf is defined
    // by the RISER next to it.
    //
    // ⚠️ Still not 1.0. At full strength the flats become exactly
    // level, `getGroundY`'s gradient goes to zero across whole
    // shelves, and the analytic normals have nothing to shade — a
    // stepped world lit like a flat one. 0.82 leaves a real but slight
    // fall across each shelf.
    //
    // ⚠️ Bands are sized against the RAW height, which measures about
    // -0.3..2.1 here (world height / (heightScale*0.55)). 7.5 bands
    // over that is a step of ~2.3 world units — a shelf you can stand
    // on, not a stair tread and not a mesa.
    const STRATA_BANDS = 7.5;
    const strataPatch = 0.35 + local * 2.2;         // already computed above
    const strength = 0.82 * Math.max(0, Math.min(1, strataPatch));
    const banded = Math.round(rawHeight * STRATA_BANDS) / STRATA_BANDS;
    rawHeight = rawHeight + (banded - rawHeight) * strength;

    // Smooth flatten at spawn area
    rawHeight *= flattenFactor;

    let out = rawHeight * heightScale * 0.55;

    // ══════════════════════════════════════════════════════
    // ⚠️ THE NIGHTMARE WARP — the ground stops behaving
    //
    // Owner: *"the trials are... way too similar to dungeons, they
    // should have a different terrain."* Correct: a trial ran on the
    // realm's ordinary terrain with harder enemies on it, which is the
    // definition of a dungeon. A Nightmare has to READ as a place
    // where the rules have come loose.
    //
    // Two terms, and neither is "more noise":
    //   · CONCENTRIC RIDGES radiating from the Nightmare's centre. A
    //     radial pattern is the one thing natural terrain never does —
    //     erosion, tectonics and noise are all directionless, so rings
    //     centred on a point read instantly as something IMPOSED on
    //     the landscape rather than grown by it.
    //   · A SLOW HEAVE that rises toward the centre, so the whole
    //     region tilts inward and the horizon closes. You are always
    //     slightly downhill of where the trial is pulling you.
    //
    // ⚠️ ONE BOOLEAN GUARDS IT and this function is the single most
    // performance-critical thing in the game (~9 simplex evaluations
    // per call, several per vertex, ~522k per view fill). The early
    // return costs one property read when no Nightmare is running,
    // which is every frame of the ordinary game.
    //
    // ⚠️ ANALYTIC AND STATELESS, like everything else here. The warp is
    // a pure function of world position and the Nightmare's centre, so
    // chunks agree across boundaries and `getGroundY` — which physics,
    // prop placement and the camera all read — stays exact. A warp
    // applied to the MESH only would put the player through the floor.
    // ══════════════════════════════════════════════════════
    const w = TerrainGenerator.nightmareWarp;
    if (w && w.active) {
      const dx = x - w.x, dz = z - w.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < w.radius) {
        // 1 at the centre, 0 at the rim — squared so the edge blends
        // out rather than ending on a visible circle.
        const f = 1 - d / w.radius;
        const fall = f * f;
        const rings = Math.sin(d * 0.055) * 3.4 + Math.sin(d * 0.017) * 6.0;
        const heave = fall * 11.0;
        out += (rings * fall + heave) * w.strength;
      }
    }

    // ══════════════════════════════════════════════════════
    // WATER — rivers, streams, lakes, puddles, the sea (world/Hydrology.js).
    // The bed drops by `drop`; the water stands `lift` above it (lift <
    // drop, both 0 at the edge), so banks meet water at the old ground
    // line and depth falls to 0 at every shore. The surface is recorded
    // on `this` for the water mesh and for wading/swimming.
    // ══════════════════════════════════════════════════════
    this._wSurf = -Infinity; this._wRiver = 0; this._wSea = 0;
    const hy = this._hy;
    if (hy.sea + hy.wet + hy.river + hy.lake > 0.001) {
      const away = Math.min(1, Math.max(0, (dist - 110) / 60));
      if (away > 0) {
        const dry = 1 - Math.min(1, mountainFactor * 1.3);
        let drop = 0, lift = 0;
        const R = hy.river * away * dry;
        if (R > 0.01) {
          // Rivers: an isoline of a slow, warped field — meanders ~700 m.
          const rn = this.riverNoise(x * 0.0014 + this.streamNoise(x * 0.003, z * 0.003) * 0.08, z * 0.0014);
          // ⚠️ The biome weight decides WHETHER a river runs here, not how
          // shallow it is — a low weight made ankle-deep sheets everywhere.
          const gate = Math.min(1, Math.max(0, (R - 0.15) / 0.3));
          let c = 1 - Math.min(1, Math.max(0, (Math.abs(rn) - 0.004) / 0.016));
          c = c * c * (3 - 2 * c) * gate;
          // Streams: thinner and more frequent.
          const sn = this.streamNoise(x * 0.0045, z * 0.0045 + 13.7);
          let c2 = 1 - Math.min(1, Math.max(0, (Math.abs(sn) - 0.004) / 0.012));
          c2 = c2 * c2 * (3 - 2 * c2) * gate * 0.75;
          drop += c * 2.4 + c2 * 1.0;
          lift += c * 1.7 + c2 * 0.62;
          this._wRiver = Math.max(c, c2);
        }
        const Lk = hy.lake * away * dry;
        if (Lk > 0.01) {
          const ln = this.lakeNoise(x * 0.0024, z * 0.0024);
          // Rarer, not shallower, where the weight is low.
          const t0 = 0.58 + (1 - Lk) * 0.45;
          let L = Math.min(1, Math.max(0, (ln - t0) / 0.14));
          L = L * L * (3 - 2 * L);
          drop += L * 3.2; lift += L * 2.4;
        }
        if (hy.wet > 0.01) {
          const pn = this.puddleNoise(x * 0.07, z * 0.07) * 0.7 + this.puddleNoise(x * 0.19 + 5, z * 0.19) * 0.3;
          const t1 = 0.42 + (1 - hy.wet) * 0.55;
          let P = Math.min(1, Math.max(0, (pn - t1) / 0.18));
          P = P * P * (3 - 2 * P) * away;
          drop += P * 0.45; lift += P * 0.32;
        }
        const S = hy.sea * away;
        if (S > 0.01) drop += S * 1.05;
        out -= drop;
        if (lift > 0.02) this._wSurf = out + lift;
        if (S > 0.05 && SEA_Y > this._wSurf) { this._wSurf = SEA_Y; this._wSea = S; }
      }
    }

    // ── Quarry pits (world/WorldFeatures.js) — stepped benches cut into
    // the ground on a pure-hash grid; dry inside. ──
    const pc = pitCarve(x, z);
    if (pc > 0) { out -= pc; this._wSurf = -Infinity; this._wRiver = 0; this._wSea = 0; }
    // ── A Descent's floor (DescentSystem / world/DungeonLayout.js) ──
    // The dungeon is built on a flat stone floor, so the ground under it
    // is pressed flat to one height and eased back into the realm's own
    // terrain outside. No water inside it either: a river through the
    // Warden's hall would be carved by the hydrology pass otherwise.
    const fz = this.flatZone;
    if (fz) {
      const d = Math.hypot(x - fz.x, z - fz.z);
      if (d < fz.r1) {
        let k = d <= fz.r0 ? 1 : 1 - (d - fz.r0) / (fz.r1 - fz.r0);
        k = k * k * (3 - 2 * k);
        out += (fz.h - out) * k;
        if (k > 0.3) { this._wSurf = -Infinity; this._wRiver = 0; this._wSea = 0; }
      }
    }

    return out;
  }

  // ── NOISE PRIMITIVES ──────────────────────────────────────

  /** Fractional Brownian Motion — stacked octave noise */
  _fbm(noiseFn, x, z, scale, octaves, persistence, lacunarity) {
    let val = 0, amp = 1, freq = scale, max = 0;
    for (let i = 0; i < octaves; i++) {
      val += noiseFn(x * freq, z * freq) * amp;
      max  += amp;
      amp  *= persistence;
      freq *= lacunarity;
    }
    return val / max;
  }

  /** Ridge noise — creates sharp mountain peaks */
  _ridgeNoise(noiseFn, x, z, scale, octaves) {
    let val = 0, amp = 0.5, freq = scale, weight = 1;
    for (let i = 0; i < octaves; i++) {
      let signal = noiseFn(x * freq, z * freq);
      signal = 1 - Math.abs(signal); // Invert abs = ridges
      signal = signal * signal;       // Sharpen peaks
      signal *= weight;
      weight = Math.min(1, Math.max(0, signal * 2));
      val  += signal * amp;
      amp  *= 0.5;
      freq *= 2.0;
    }
    return val;
  }

  /** Plateau noise — flat topped terrain with steep edges */
  _plateauNoise(x, z, scale, strength) {
    if (strength <= 0) return 0;
    const raw = this.plateauNoise(x * scale, z * scale);
    const clamped = Math.max(0, raw);
    // Steep edges via a NARROW value-space transition band (was a
    // 0→0.6 smoothstep — nearly the whole positive noise range, which
    // reads as a gentle ramp, not a cliff). Simplex noise changes
    // slowly across space, so most of a plateau's footprint now sits
    // pinned at 0 or full height, with only a thin sliver of noise
    // value in between — and compressing that value-space sliver
    // compresses the SPATIAL width of the transition along with it,
    // turning the old gradual ramp into an actual near-vertical mesa
    // edge. This is a genuine gap in the existing stack (no other
    // domain produces a true cliff face), so it's the one place this
    // pass adds real steepness rather than just retuning amplitude.
    const lo = 0.30, hi = 0.42;
    const t = Math.min(1, Math.max(0, (clamped - lo) / (hi - lo)));
    const flat = t * t * (3 - 2 * t); // smoothstep
    return flat * strength * 1.0;
  }

  _normalizeHeight(h, heightScale) {
    const effectiveMax = heightScale * 0.55;
    return Math.max(0, Math.min(1, (h / effectiveMax + 1) / 2));
  }

  _clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  // ── COLOR GRADIENT ────────────────────────────────────────

  _getBiomeColorForHeight(biome, normH) {
    return atmosphere.gradeColor(this._rawBiomeColor(biome, normH));
  }

  _rawBiomeColor(biome, normH) {
    const { low, mid, high, peak } = biome.colors;
    if (normH < 0.25) {
      return low.clone().lerp(mid, normH / 0.25);
    } else if (normH < 0.55) {
      return mid.clone().lerp(high, (normH - 0.25) / 0.30);
    } else if (normH < 0.80) {
      return high.clone().lerp(peak || high, (normH - 0.55) / 0.25);
    } else {
      return (peak || high).clone().lerp(new THREE.Color(0xffffff), (normH - 0.80) / 0.20);
    }
  }

  // ── HEIGHT QUERY ─────────────────────────────────────────

  getHeightAt(worldX, worldZ, biomeManager) {
    const weights = biomeManager.getBiomeWeights(worldX, worldZ);
    let hs = 0, rg = 0, mtn = 0, plat = 0;
    for (const bw of weights) {
      hs   += (WORLD.TERRAIN_HEIGHT_SCALE * (bw.biome.heightScale   || 1.0)) * bw.weight;
      rg   += (bw.biome.roughness         || 0.5) * bw.weight;
      mtn  += (bw.biome.mountainFactor    || 0.0) * bw.weight;
      plat += (bw.biome.plateauFactor     || 0.0) * bw.weight;
    }
    blendHydro(weights, this._hy);
    return this._getHeight(worldX, worldZ, hs, rg, mtn, plat);
  }

  // ── DECORATION POSITIONS ─────────────────────────────────

  // ══════════════════════════════════════════════════════════
  // ⚠️ PROPS MUST USE THE **BLENDED** HEIGHT FIELD.
  //
  // These scatter functions computed height from the chunk's OWN biome
  // parameters (`biome.heightScale` etc.) while the terrain MESH is
  // built from per-vertex BLENDED parameters (see pass 1's
  // `getBiomeWeights` loop). Wherever two biomes meet, the two
  // disagree — so props were placed on a surface that is not the one
  // being drawn, and they hovered.
  //
  // Measured before the fix: 28 props above the ground in one view,
  // worst **15 units clear** — real Poly Haven boulders hanging in the
  // air. ⚠️ It was NOT the terrain LOD, which was the obvious suspect:
  // full-resolution (LOD 64) chunks had the WORST offenders (15.7)
  // versus 11.2 on half-res, and average clearance was ~0.5 at both.
  // Correlate before you blame.
  //
  // ⚠️ THE REALM BIOMES MADE A LATENT BUG SEVERE. `heightScale` used
  // to span roughly 0.5–1.5; the Shadow Slave set spans **0.22 (the
  // Forgotten Shore) to 2.40 (the Hollow Mountains)**, a ~10x range.
  // The blend error at a boundary scales with that spread, so adding
  // biomes with extreme shapes turned a small mismatch into a visible
  // one. Any future biome with an unusual heightScale makes this worse
  // again if these calls ever revert.
  //
  // `getHeightAt()` does the same blend the mesh does, so it is the
  // only correct source for anything positioned ON the terrain.
  // ══════════════════════════════════════════════════════════
  getDecorationPositions(chunkX, chunkZ, density = 0.1, biome = null, biomeManager = null) {
    const positions = [];
    const size = WORLD.CHUNK_SIZE;
    // step=4 → 16×16=256 candidate cells per chunk. Each candidate that
    // passes now spawns a 3–9 MESH composed prop (see PropForge.js),
    // not the single box it used to be — so this one number was
    // multiplying draw calls several-fold across every loaded chunk.
    // step=7 → 10×10=100 candidates, a uniform ~61% cut independent of
    // any one biome's density value. step=9 → 8×8=64, cutting further
    // still — combined with the smaller render distance (WORLD.
    // RENDER_DISTANCE) this is most of where the remaining prop count
    // actually goes now.
    //
    // Now tier-driven. The reasoning above is still exactly right for
    // the artifact build, where draw calls were the binding constraint
    // on an unknown machine. The HD build is not in that position: it
    // targets a known GPU with headroom, and a world this sparse is a
    // large part of why it reads as empty and repetitive. 6 gives
    // 11x11=121 candidates (~1.9x the props), 5 gives 13x13=169.
    const step = quality.settings.scatterStep ?? 9;

    const hs    = WORLD.TERRAIN_HEIGHT_SCALE * (biome?.heightScale  || 1.0);
    const rg    = biome?.roughness    || 0.5;
    const mtn   = biome?.mountainFactor || 0;
    const plat  = biome?.plateauFactor  || 0;

    const rng = this._makeRng(this.seed ^ (chunkX * 7919 + chunkZ * 5381));

    for (let z = 0; z < size; z += step) {
      for (let x = 0; x < size; x += step) {
        const wx = chunkX * size + x;
        const wz = chunkZ * size + z;

        // Stratified random per cell
        const nx = wx + (rng() - 0.5) * step * 0.8;
        const nz = wz + (rng() - 0.5) * step * 0.8;

        const noiseVal = (this.detailNoise(nx * 0.05, nz * 0.05) + 1) / 2;
        if (noiseVal < density) {
          if (!biomeManager) Object.assign(this._hy, hydroOf(biome));
          const h = biomeManager
            ? this.getHeightAt(nx, nz, biomeManager)
            : this._getHeight(nx, nz, hs, rg, mtn, plat);
          positions.push({
            x: nx, y: h, z: nz,
            // Scale used to be `0.5 + noiseVal * 1.5` — derived from the
            // very same noise sample that decided whether to place
            // anything here at all. That correlation is why clusters
            // looked uniform: because placement only happens where
            // noiseVal is below `density` (a small number), every prop
            // that passed the test necessarily had a LOW noiseVal, and
            // therefore very nearly the same scale as its neighbours.
            // The 0.5–2.0 range advertised here was in practice more
            // like 0.5–0.7.
            //
            // Drawing from the independent per-cell rng decorrelates
            // the two and restores the full range, so a stand of trees
            // now has genuine big/small variation in it. Cubed to bias
            // toward smaller props with occasional large ones, which is
            // how natural scatter actually distributes.
            scale: 0.45 + Math.pow(rng(), 3) * 1.9,
            noiseValue: noiseVal,
            rotation: rng() * Math.PI * 2,
            // Small lean, applied by the caller. Perfectly upright props
            // in a perfectly repeated pose are a strong artificial tell.
            tiltX: (rng() - 0.5) * 0.22,
            tiltZ: (rng() - 0.5) * 0.22,
            // Free per-instance seed so callers can vary anything else
            // (variant choice, tint jitter) without re-deriving noise.
            seed: (rng() * 0x7fffffff) | 0,
          });
        }
      }
    }
    return positions;
  }

  // ── CLUTTER POSITIONS ─────────────────────────────────────

  /**
   * Small ground-debris scatter (rock chips, bone fragments — see
   * ChunkManager._createDebris) biased toward slopes and cliff bases,
   * where loose material would actually collect instead of vanishing
   * into flat empty ground. Baked once per chunk from the chunk's own
   * seeded RNG, exactly like getDecorationPositions above — nothing
   * here runs again after the chunk is built.
   */
  getClutterPositions(chunkX, chunkZ, biome = null, biomeManager = null) {
    const positions = [];
    const size = WORLD.CHUNK_SIZE;
    // ══════════════════════════════════════════════════
    // GROUND DETAIL DENSITY
    //
    // Owner: "improve the overall graphics."
    //
    // The most visible flaw in a screenshot of the open world was not
    // the lighting or the post stack — it was EMPTINESS. A whole frame
    // of bare dune with nothing at eye level to give it scale or
    // texture. `step = 16` means 4×4 = 16 candidate cells per 64-unit
    // chunk, most of which then reject, so a chunk carried a handful
    // of pieces across four thousand square metres.
    //
    // ⚠️ TIER-GATED, and `low` is untouched. `low` is exact parity
    // with the artifact build (§1) and the artifact has a 16MB budget
    // and no external requests — quietly quadrupling its mesh count
    // would be a regression nobody asked for.
    //
    // ⚠️ Each piece is still 1–2 shared-geometry meshes with shadows
    // OFF and no collider (see ChunkManager._createDebris), so this
    // multiplies the cheapest thing in the scene rather than the
    // expensive one. ⚠️ Frame cost NOT measured — §6 says this
    // environment cannot; ask the owner for F3 p95.
    // ⚠️ REVERTED to 16. Raising this to 8 at HD tiers (a previous
    // pass, chasing "the world looks empty") measured **+1.9ms per
    // chunk build** — on a build already 3x over drainChunkQueue's 6ms
    // budget, which is precisely the hitch the owner reported as lag.
    // The visual gain was marginal; the cost was not. If ground
    // density is worth revisiting, spend the budget the normals
    // optimisation above just freed, and check it against F3 p95 on
    // the owner's machine first (§6 — this environment cannot).
    const step = 16;

    const hs   = WORLD.TERRAIN_HEIGHT_SCALE * (biome?.heightScale  || 1.0);
    const rg   = biome?.roughness    || 0.5;
    const mtn  = biome?.mountainFactor || 0;
    const plat = biome?.plateauFactor  || 0;

    // Separate RNG stream (distinct seed mix) from decorations, so
    // debris placement doesn't just trail 1:1 behind tree/rock
    // placement, while staying just as deterministic per chunk seed.
    const rng = this._makeRng(this.seed ^ (chunkX * 4649 + chunkZ * 2803) ^ 0x9e3779b9);

    for (let z = 0; z < size; z += step) {
      for (let x = 0; x < size; x += step) {
        const wx = chunkX * size + x + (rng() - 0.5) * step * 0.9;
        const wz = chunkZ * size + z + (rng() - 0.5) * step * 0.9;

        if (!biomeManager) Object.assign(this._hy, hydroOf(biome));
        const H = (px, pz) => (biomeManager
          ? this.getHeightAt(px, pz, biomeManager)
          : this._getHeight(px, pz, hs, rg, mtn, plat));
        const h = H(wx, wz);
        // Cheap one-off slope estimate (two extra height samples) —
        // same finite-difference idea the vertex-color pass uses on
        // the grid, just evaluated off-grid for an arbitrary point.
        const hDx = H(wx + 1.5, wz);
        const hDz = H(wx, wz + 1.5);
        const slope = (Math.abs(hDx - h) + Math.abs(hDz - h)) / 1.5;
        const slope01 = Math.min(1, slope / 2.2);

        // Baseline scatter chance plus a strong slope bias — debris
        // collects on inclines and around cliff bases far more than
        // it does on dead-flat ground.
        const chance = 0.12 + slope01 * 0.55;
        if (rng() < chance) {
          positions.push({
            x: wx, y: h, z: wz,
            scale: 0.35 + rng() * 0.5,
            rotation: rng() * Math.PI * 2,
            variant: rng(),
          });
        }
      }
    }
    return positions;
  }
}
