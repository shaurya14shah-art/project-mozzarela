// ══════════════════════════════════════════════════════════
// MaterialLibrary — real PBR surface detail for the HD build
//
// The problem this solves, stated plainly: the terrain mesh has a
// `position` attribute, a `color` attribute, and an index buffer. That
// is all (see TerrainGenerator._buildGeometry). There is no `uv`
// attribute anywhere on it, and there never was — the ground has
// always been flat-shaded vertex colour, which is why the world reads
// as untextured silhouettes no matter how good the lighting gets.
//
// Two ways to fix that:
//
//   1. Generate UVs in TerrainGenerator and use ordinary UV mapping.
//      Cheap to sample, but planar UVs on procedural terrain stretch
//      badly on any slope steeper than ~40°, and cliff faces are
//      exactly where surface detail matters most. It also means
//      touching the generator, the chunk cache, and every consumer.
//
//   2. Triplanar mapping — sample the texture three times, projected
//      down the world X, Y and Z axes, and blend by the surface
//      normal. Needs no UVs at all, has no seams, and does not
//      stretch on slopes by construction.
//
// This module does (2). It costs 3 texture fetches per map instead of
// 1, which is real but affordable at the HD tiers, and it means the
// terrain, the cliffs and the boulders can all share one material
// with zero per-mesh UV work.
//
// Everything degrades: if the HD texture set isn't on disk (nobody ran
// `node tools/fetch-hd-textures.mjs`), `load()` resolves anyway,
// `quality.hdAssetsAvailable` stays false, and every call site keeps
// the plain vertex-coloured material it had before. A missing texture
// must never be the reason the game fails to start.
//
//   Textures: public/hd/textures/<slug>/{color,normal,roughness,ao}.jpg
//   Source:   ambientCG, CC0 1.0 (see that folder's LICENSE.txt)
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { quality } from './Quality.js';

// ⚠️ 1024² except on `ultra` (perf pass). The library was 36 maps at
// 2048² — 16 MB each on the GPU before mipmaps, decoded and uploaded the
// first time the terrain drew, which was the multi-second freeze at the
// end of loading and a large standing memory cost. RŌNIN ships its ground
// sets at 1024². The 2048 originals stay on disk for `ultra`.
// Regenerate the 1k copies with:
//   for each map:  sips -Z 1024 public/hd/textures/<set>/<map>.jpg --out public/hd/textures1k/<set>/<map>.jpg
const TEX_ROOT = quality.tier === 'ultra' ? 'hd/textures' : 'hd/textures1k';

// Which slugs to actually pull into memory. The fetcher downloads a
// few more than this; loading a 4-map set costs ~5MB of VRAM each, so
// only the ones with a real call site are loaded.
const LOAD_SETS = ['rock', 'dirt', 'grass', 'snow', 'sand', 'ash', 'wood', 'metal', 'stonewall'];

const MAPS = [
  { file: 'color.jpg',     key: 'map',          srgb: true  },
  { file: 'normal.jpg',    key: 'normalMap',    srgb: false },
  { file: 'roughness.jpg', key: 'roughnessMap', srgb: false },
  { file: 'ao.jpg',        key: 'aoMap',        srgb: false },
];

// ── Triplanar shader injection ────────────────────────────
//
// These are spliced into MeshStandardMaterial's generated shader via
// onBeforeCompile. We deliberately extend the stock material rather
// than writing a ShaderMaterial from scratch: doing it this way keeps
// every single thing Three.js already does correctly — shadow
// receiving, fog, tone mapping, IBL from scene.environment, lights,
// vertex colours — and changes only how the four surface maps are
// sampled. A hand-rolled ShaderMaterial would have to re-implement all
// of that, and would silently stop matching whenever Three updates.

const TRIPLANAR_PARS_VERT = /* glsl */`
  varying vec3 vTriWorldPos;
  varying vec3 vTriWorldNrm;
`;

const TRIPLANAR_VERT = /* glsl */`
  // The vars "transformed" and "objectNormal" are both in scope by
  // this point (begin_vertex / beginnormal_vertex run earlier), which
  // is why the splice target is project_vertex and not something
  // earlier. (Note for editors: no backticks in this file's GLSL
  // template literals — they terminate the string.)
  vTriWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vTriWorldNrm = normalize(mat3(modelMatrix) * objectNormal);
`;

const TRIPLANAR_PARS_FRAG = /* glsl */`
  varying vec3 vTriWorldPos;
  varying vec3 vTriWorldNrm;

  uniform float uTriScale;       // world units per texture repeat
  uniform float uTriSharpness;   // how hard the three projections cut over
  uniform float uTriNormalScale;
  uniform float uTriDetail;      // 0 = pure vertex colour, 1 = full albedo
  uniform float uTriAOStrength;
  // ── Macro variation ──
  // A second sample of the SAME texture at a much larger scale, mixed
  // over the first. This is the standard fix for the one artefact a
  // single-scale triplanar cannot avoid: at close range the tiling is
  // invisible, but at distance the repeat becomes a regular pattern and
  // the ground reads as smeared wallpaper. A low-frequency copy of the
  // texture breaks that up with no extra assets, because large-scale
  // luminance variation is exactly what real ground has and what a
  // single tiling rate cannot produce.
  uniform float uTriMacro;       // scale multiplier for the second sample
  uniform float uTriMacroMix;    // 0 = off

  // Blend weights from the world normal. Raising to a power makes the
  // transition between projections tighter; too tight and you get a
  // visible seam on 45° faces, too loose and everything looks like a
  // blurry average of three textures. ~4 is the usual sweet spot.
  vec3 triWeights() {
    vec3 w = pow(abs(vTriWorldNrm), vec3(uTriSharpness));
    return w / max(w.x + w.y + w.z, 1e-4);
  }

  vec4 triSample(sampler2D tex, vec3 w, float scale) {
    vec3 p = vTriWorldPos / scale;
    // Each projection drops the axis it looks down. The sign flips keep
    // the three projections consistently handed, so a directional
    // pattern doesn't mirror across an edge.
    vec4 cx = texture2D(tex, p.zy);
    vec4 cy = texture2D(tex, p.xz);
    vec4 cz = texture2D(tex, p.xy);
    return cx * w.x + cy * w.y + cz * w.z;
  }
`;

// Albedo. The vertex colour still decides the HUE — that is the
// per-biome palette from BiomeManager, hand-tuned, and the whole point
// is to keep it. The texture contributes luminance detail only, mixed
// toward its own mean so a dark texture doesn't just darken the world.
const TRIPLANAR_MAP_FRAG = /* glsl */`
  {
    vec3 w = triWeights();
    vec3 tex = triSample(map, w, uTriScale).rgb;
    // Macro pass: the same texture, far larger, contributing only its
    // broad light/dark variation. Multiplied in rather than mixed so
    // it darkens and lightens whole regions of ground without ever
    // fighting the biome vertex colour for hue.
    if (uTriMacroMix > 0.001) {
      vec3 macro = triSample(map, w, uTriScale * uTriMacro).rgb;
      float macroLum = dot(macro, vec3(0.3333));
      tex *= mix(1.0, macroLum * 2.0, uTriMacroMix);
    }
    // Normalize the texture around mid-grey so it modulates rather
    // than tints: 0.5 in the source becomes "no change".
    vec3 detail = tex / max(dot(tex, vec3(0.3333)), 1e-3);
    diffuseColor.rgb *= mix(vec3(1.0), detail, uTriDetail);
  }
`;

// Normal mapping, whiteout-blended across the three projections. This
// is the map that actually creates the impression of a real surface —
// albedo detail alone still reads as a painted decal because it does
// not respond to the moving sun.
const TRIPLANAR_NORMAL_FRAG = /* glsl */`
  {
    vec3 w = triWeights();
    vec3 p = vTriWorldPos / uTriScale;

    vec3 nx = texture2D(normalMap, p.zy).xyz * 2.0 - 1.0;
    vec3 ny = texture2D(normalMap, p.xz).xyz * 2.0 - 1.0;
    vec3 nz = texture2D(normalMap, p.xy).xyz * 2.0 - 1.0;

    nx.xy *= uTriNormalScale;
    ny.xy *= uTriNormalScale;
    nz.xy *= uTriNormalScale;

    // Whiteout blend (Ben Golus): fold the geometric normal into each
    // tangent-space sample before combining, so the result stays
    // anchored to the real surface orientation instead of flattening
    // toward the average of three unrelated tangent frames.
    vec3 gn = vTriWorldNrm;
    nx = vec3(nx.xy + gn.zy, abs(nx.z) * gn.x);
    ny = vec3(ny.xy + gn.xz, abs(ny.z) * gn.y);
    nz = vec3(nz.xy + gn.xy, abs(nz.z) * gn.z);

    vec3 worldN = normalize(nx.zyx * w.x + ny.xzy * w.y + nz.xyz * w.z);

    // A second, much larger normal sample folded in at reduced
    // strength. Where the albedo macro pass fixes distant COLOUR
    // banding, this fixes distant SHADING banding — without it the
    // surface still lights in a visible grid because every repeat has
    // the same bumps facing the same way.
    if (uTriMacroMix > 0.001) {
      vec3 pm = vTriWorldPos / (uTriScale * uTriMacro);
      vec3 mx = texture2D(normalMap, pm.zy).xyz * 2.0 - 1.0;
      vec3 my = texture2D(normalMap, pm.xz).xyz * 2.0 - 1.0;
      vec3 mz = texture2D(normalMap, pm.xy).xyz * 2.0 - 1.0;
      vec3 macroN = normalize(mx.zyx * w.x + my.xzy * w.y + mz.xyz * w.z);
      worldN = normalize(mix(worldN, normalize(worldN + macroN * 0.6), uTriMacroMix));
    }

    // Three's lighting works in view space from here on.
    normal = normalize((viewMatrix * vec4(worldN, 0.0)).xyz);
  }
`;

const TRIPLANAR_ROUGH_FRAG = /* glsl */`
  float roughnessFactor = roughness;
  {
    vec3 w = triWeights();
    // Green channel by convention for a packed roughness map; these
    // sets are greyscale so any channel would do, but being explicit
    // means a packed ORM map can be dropped in later without surprise.
    roughnessFactor *= triSample(roughnessMap, w, uTriScale).g;
  }
`;

// AO from the texture set. Note this is *texture-space* occlusion —
// the crevices baked into the material — which is a different and
// complementary thing to the screen-space GTAO pass in main.js, which
// handles occlusion between separate objects.
const TRIPLANAR_AO_FRAG = /* glsl */`
  {
    vec3 w = triWeights();
    float ao = triSample(aoMap, w, uTriScale).r;
    float occ = 1.0 + uTriAOStrength * (ao - 1.0);
    reflectedLight.indirectDiffuse *= occ;
    #if defined( USE_ENVMAP ) && defined( STANDARD )
      // Specular occlusion too, or polished surfaces keep reflecting
      // the sky out of cracks that should be shadowed.
      float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
      reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, occ, material.roughness );
    #endif
  }
`;

class MaterialLibrary {
  constructor() {
    // Deferred init — see the note in EnvironmentIBL.js. Nothing here
    // touches the renderer or scene graph at construction time.
    this.sets = new Map();      // slug -> { map, normalMap, roughnessMap, aoMap }
    this.ready = false;
    this._loader = null;
    this._maxAniso = 1;
  }

  /**
   * Probe for and load the HD texture sets. Resolves either way —
   * a failure here downgrades the look, it does not break the game.
   * @returns {Promise<boolean>} whether HD textures are usable
   */
  /**
   * Upload every loaded texture to the GPU now, a few per frame, so the
   * first frame that DRAWS them does not also pay for decoding and
   * uploading them (perf pass — that was the end-of-load freeze).
   */
  async preUpload(renderer, perFrame = 4) {
    const all = [];
    for (const set of this.sets.values()) for (const t of Object.values(set)) all.push(t);
    for (let i = 0; i < all.length; i++) {
      renderer.initTexture(all[i]);
      if ((i + 1) % perFrame === 0) await new Promise(r => requestAnimationFrame(() => r()));
    }
    return all.length;
  }

  async load(renderer, onProgress) {
    if (!quality.settings.hdTextures) {
      console.log('[MaterialLibrary] HD textures not requested at this tier');
      return false;
    }

    this._loader = new THREE.TextureLoader();
    this._maxAniso = Math.min(
      renderer.capabilities.getMaxAnisotropy(),
      quality.settings.anisotropy
    );

    // Probe one file first. If the fetcher was never run there is no
    // point issuing 36 requests that will all 404 and fill the console
    // with noise that looks like a bug.
    const probe = await this._probe(`${TEX_ROOT}/rock/color.jpg`);
    if (!probe) {
      console.warn(
        '[MaterialLibrary] HD textures not found on disk — running without them.\n' +
        '  Fetch them with:  node tools/fetch-hd-textures.mjs'
      );
      quality.hdAssetsAvailable = false;
      return false;
    }

    let done = 0;
    const total = LOAD_SETS.length;
    await Promise.all(LOAD_SETS.map(async slug => {
      const set = await this._loadSet(slug);
      if (set) this.sets.set(slug, set);
      done++;
      onProgress?.(done / total, slug);
    }));

    this.ready = this.sets.size > 0;
    quality.hdAssetsAvailable = this.ready;
    console.log(`[MaterialLibrary] ${this.sets.size}/${total} HD material sets loaded`);
    return this.ready;
  }

  async _probe(url) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  }

  async _loadSet(slug) {
    const out = {};
    await Promise.all(MAPS.map(({ file, key, srgb }) => new Promise(resolve => {
      this._loader.load(
        `${TEX_ROOT}/${slug}/${file}`,
        tex => {
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          // Only the albedo is colour data. Tagging a normal or
          // roughness map as sRGB applies a gamma curve to values that
          // are not luminance, which shows up as normals that are
          // subtly too weak and roughness that is much too low.
          tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          // Anisotropy matters enormously here — terrain is viewed at
          // grazing angles almost all the time, which is precisely the
          // case trilinear filtering handles worst.
          tex.anisotropy = this._maxAniso;
          out[key] = tex;
          resolve();
        },
        undefined,
        () => resolve(),   // a missing single map is survivable
      );
    })));
    // Albedo + normal are the two that carry the effect. Without both,
    // treat the set as unusable rather than half-applying it.
    if (!out.map || !out.normalMap) {
      console.warn(`[MaterialLibrary] set "${slug}" incomplete, skipping`);
      return null;
    }
    return out;
  }

  /**
   * Turn a MeshStandardMaterial into a triplanar-textured one.
   *
   * Mutates and returns `material`. Safe to call on a material that is
   * already shared by many meshes — the injection is per-material, not
   * per-mesh, so all of them get it at once (which is what we want for
   * the single shared terrain material).
   *
   * @param {THREE.MeshStandardMaterial} material
   * @param {string} slug              which texture set to project
   * @param {object} opts
   * @param {number} opts.scale        world units per texture repeat
   * @param {number} opts.detail       0..1 albedo blend toward the texture
   * @param {number} opts.normalScale  bump strength multiplier
   * @param {number} opts.sharpness    projection blend exponent
   * @param {number} opts.aoStrength   0..1
   * @param {number} opts.macro        second-sample scale multiplier
   * @param {number} opts.macroMix     0..1, how strongly it shows
   */
  applyTriplanar(material, slug, opts = {}) {
    if (!this.ready) return material;
    const set = this.sets.get(slug);
    if (!set) {
      console.warn(`[MaterialLibrary] no set "${slug}"`);
      return material;
    }

    const {
      scale = 6.0,
      detail = 0.75,
      normalScale = 1.0,
      sharpness = 4.0,
      aoStrength = 0.8,
      // 7.3, not a round 8 — an integer multiple makes the macro sample
      // land in phase with the base one every N repeats, which
      // reintroduces exactly the regular pattern the macro pass exists
      // to destroy. An irrational-ish ratio never re-aligns.
      macro = 7.3,
      macroMix = 0.0,
    } = opts;

    // Assigning the textures does two jobs: it gives the shader
    // something to sample, and — critically — it makes Three define
    // USE_MAP / USE_NORMALMAP / USE_ROUGHNESSMAP / USE_AOMAP, which is
    // what causes the shader chunks we splice into to exist at all.
    // Without these assignments the replacements below match nothing
    // and silently do nothing.
    material.map = set.map;
    material.normalMap = set.normalMap;
    if (set.roughnessMap) material.roughnessMap = set.roughnessMap;
    if (set.aoMap) material.aoMap = set.aoMap;

    const uniforms = {
      uTriScale:       { value: scale },
      uTriSharpness:   { value: sharpness },
      uTriNormalScale: { value: normalScale },
      uTriDetail:      { value: detail },
      uTriAOStrength:  { value: aoStrength },
      uTriMacro:       { value: macro },
      uTriMacroMix:    { value: macroMix },
    };
    material.userData.triplanarUniforms = uniforms;

    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${TRIPLANAR_PARS_VERT}`)
        .replace('#include <project_vertex>', `#include <project_vertex>\n${TRIPLANAR_VERT}`);

      let f = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${TRIPLANAR_PARS_FRAG}`)
        .replace('#include <map_fragment>', TRIPLANAR_MAP_FRAG)
        .replace('#include <roughnessmap_fragment>', TRIPLANAR_ROUGH_FRAG);

      // normal_fragment_maps only exists when a normal map is bound;
      // aomap_fragment only when an AO map is. Guarding the replace
      // keeps a partial texture set from producing a shader that
      // references undeclared samplers.
      if (set.normalMap) {
        f = f.replace('#include <normal_fragment_maps>', TRIPLANAR_NORMAL_FRAG);
      }
      if (set.aoMap) {
        f = f.replace('#include <aomap_fragment>', TRIPLANAR_AO_FRAG);
      }
      shader.fragmentShader = f;
    };

    // Three caches compiled programs by this key. Without bumping it,
    // a material that already compiled once keeps its old program and
    // the injection appears to do nothing.
    // ⚠️ macroMix must be in the cache key. Three caches compiled
    // programs by this string, and the macro branches are compile-time
    // `if`s on a uniform — two materials that differ only in macroMix
    // would otherwise share one program and one of them would render
    // with the other's settings.
    material.customProgramCacheKey = () => `triplanar:${slug}:${scale}:${sharpness}:${macroMix > 0.001 ? 'm' : 'n'}`;
    material.needsUpdate = true;
    return material;
  }

  /**
   * Plain (non-triplanar) UV-mapped variant, for props and structures
   * that DO have UVs and are small enough that three samples per map
   * would be wasteful.
   */
  applyUV(material, slug, repeat = 1) {
    if (!this.ready) return material;
    const set = this.sets.get(slug);
    if (!set) return material;

    // Clone rather than share: repeat is a property of the texture,
    // not the material, so two props wanting different tiling would
    // otherwise fight over one texture's repeat vector.
    for (const [key, tex] of Object.entries(set)) {
      const t = tex.clone();
      t.needsUpdate = true;
      t.repeat.set(repeat, repeat);
      material[key] = t;
    }
    material.needsUpdate = true;
    return material;
  }

  dispose() {
    for (const set of this.sets.values()) {
      for (const tex of Object.values(set)) tex.dispose();
    }
    this.sets.clear();
    this.ready = false;
  }
}

export const materialLibrary = new MaterialLibrary();
