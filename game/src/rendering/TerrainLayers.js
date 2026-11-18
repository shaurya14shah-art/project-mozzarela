// ══════════════════════════════════════════════════════════
// TerrainLayers — real ground on the flats, rock on the cliffs
//
// Before the realism pass the terrain had ONE texture: the rock set,
// projected triplanar and reduced to a grey "detail" multiplied over the
// biome's vertex colour. Grassland, desert and tundra were therefore all
// veined stone in different tints — measured in screenshots as a pale
// mint marble under the plains' grass. RŌNIN's ground is real soil and
// real grass maps; this gives Mozzarela the same.
//
// How it works:
//   · Each terrain vertex carries `aLayer` — weights for four ground
//     sets (dirt, grass, sand, snow), blended from the biomes it sits in
//     (TerrainGenerator pass 1, from GROUND_BY_BIOME below).
//   · On FLAT ground the shader paints those sets, top-projected (the
//     only projection a near-horizontal surface uses), albedo AND normal.
//   · On SLOPES the existing triplanar rock stays exactly as it was —
//     cliffs are stone in every biome.
//   · Whatever weight a biome does not assign to the four layers stays
//     rock even on the flat (the Hollow Mountains, the glass city).
//
// ⚠️ COLOUR: half texture, half biome. The layer's albedo is the
// photographed texture, steered by the biome's vertex colour relative to
// a mid albedo (0.15). A biome whose palette is mid-grey leaves the
// texture untouched; the Forgotten Shore's near-black earth darkens the
// soil to black earth; Godgrave's bone pale lifts it. Pure texture would
// make every soil biome the same brown; pure vertex colour is what the
// old single-texture path already did.
//
// ⚠️ TEXTURE UNITS. Rock uses four (map, normal, roughness, AO); this
// adds eight (four albedo, four normal) — twelve, plus the shadow map
// and the environment. Under the 16 a WebGL2 fragment shader is
// guaranteed. Adding a fifth layer would break that guarantee; pack
// instead (e.g. a texture array) if one is ever needed.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { materialLibrary } from './MaterialLibrary.js';

// ⚠️ The SOIL layer is the 'ash' set, not 'dirt'. Measured: 'dirt'
// (ambientCG Ground037) is a dry GRASSY ground averaging an olive
// (153,147,88), so every soil biome — the Bleeding Strand's black earth
// included — read as meadow. 'ash' (Ground041) averages a real earth
// brown (118,87,65), and the biome steer darkens or tints it from there.
// GROUND_BY_BIOME's first column still means "soil".
export const LAYER_SLUGS = ['ash', 'grass', 'sand', 'snow'];

/**
 * [dirt, grass, sand, snow] per biome id. The remainder to 1 is rock.
 * Keyed by biome ID (trap #11), attached to each biome in BiomeManager.
 */
export const GROUND_BY_BIOME = {
  iron_hills:            [0.55, 0.10, 0.25, 0.00],
  sunken_mire:           [0.80, 0.20, 0.00, 0.00],
  highland_karst:        [0.25, 0.35, 0.00, 0.00],
  ashen_caldera:         [0.55, 0.00, 0.10, 0.00],
  plains:                [0.30, 0.70, 0.00, 0.00],
  enchanted_forest:      [0.50, 0.50, 0.00, 0.00],
  living_jungle:         [0.40, 0.60, 0.00, 0.00],
  twilight_swamp:        [0.75, 0.25, 0.00, 0.00],
  amber_steppe:          [0.30, 0.55, 0.15, 0.00],
  stormwrack_coast:      [0.30, 0.20, 0.50, 0.00],
  drowned_flats:         [0.60, 0.00, 0.40, 0.00],
  petrified_wood:        [0.85, 0.05, 0.00, 0.00],
  frozen_tundra:         [0.30, 0.00, 0.00, 0.70],
  glacier_shelf:         [0.00, 0.00, 0.00, 1.00],
  celestial_peaks:       [0.15, 0.00, 0.00, 0.60],
  desert_ruins:          [0.10, 0.00, 0.90, 0.00],
  ember_dunes:           [0.10, 0.00, 0.90, 0.00],
  volcanic_wastes:       [0.65, 0.00, 0.00, 0.00],
  obsidian_wastes:       [0.55, 0.00, 0.00, 0.00],
  fungal_wastes:         [0.85, 0.00, 0.00, 0.00],
  crystal_caverns:       [0.45, 0.00, 0.00, 0.00],
  bioluminescent_grotto: [0.55, 0.00, 0.00, 0.00],
  shadow_realm:          [0.55, 0.00, 0.00, 0.00],
  crimson_rift:          [0.50, 0.00, 0.00, 0.00],
  astral_highlands:      [0.40, 0.00, 0.00, 0.20],
  the_verge:             [0.50, 0.00, 0.00, 0.00],
  // ── The realm ──
  godgrave:              [0.45, 0.00, 0.45, 0.00],   // ash and bone dust
  hollow_mountains:      [0.25, 0.00, 0.00, 0.25],   // mostly bare rock
  forgotten_shore:       [0.90, 0.00, 0.00, 0.00],   // black earth (via the palette)
  dreaming_city:         [0.30, 0.00, 0.00, 0.00],   // stone and glass
  bottomless_pit:        [0.35, 0.00, 0.00, 0.00],
  sanctuary:             [0.40, 0.60, 0.00, 0.00],
};

/** Metres per repeat for each layer. Soil and grass want visible grain. */
const LAYER_SCALE = [3.2, 2.6, 4.0, 5.0];

const PARS_VERT = /* glsl */`
  attribute vec4 aLayer;
  varying vec4 vLayer;
`;
const PARS_FRAG = /* glsl */`
  varying vec4 vLayer;
  uniform sampler2D uLayC0, uLayC1, uLayC2, uLayC3;
  uniform sampler2D uLayN0, uLayN1, uLayN2, uLayN3;
  uniform vec4 uLayScale;
  float layFlat(float ny) { return smoothstep(0.64, 0.88, ny); }
  vec4 laySample(sampler2D t, vec2 p, float s) { return texture2D(t, p / s); }

  // ── Ground variety (owner: "too monotonous… fix it") ──────────
  // Procedural value noise — no extra textures, no extra units. Drives:
  // patchy redistribution between whichever layers a biome has, a
  // second ROTATED sample scale against visible tiling, large tone and
  // warm/cool drift, damp hollows, fine grit and darker scree at the
  // foot of slopes.
  float lh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float lnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(lh(i), lh(i + vec2(1.0, 0.0)), u.x), mix(lh(i + vec2(0.0, 1.0)), lh(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float lfbm(vec2 p) { return lnoise(p) * 0.5 + lnoise(p * 2.03 + 17.0) * 0.3 + lnoise(p * 4.1 + 31.0) * 0.2; }
  // Two scales, the second rotated ~37°, mixed by noise: the eye loses
  // the 3 m repeat because no two neighbouring repeats look alike.
  vec4 layTwo(sampler2D t, vec2 p, float s, float m) {
    vec2 q = mat2(0.799, -0.602, 0.602, 0.799) * p;
    return mix(texture2D(t, p / s), texture2D(t, q / (s * 2.7) + 0.37), m);
  }
  // Patches: each present layer is pushed up or down by its own noise.
  vec4 layPatch(vec4 w, vec2 p) {
    vec4 n = vec4(lfbm(p * 0.035), lfbm(p * 0.041 + 11.0), lfbm(p * 0.03 + 23.0), lfbm(p * 0.025 + 37.0));
    vec4 m = mix(vec4(0.25), vec4(1.75), smoothstep(0.25, 0.75, n));
    vec4 o = w * m;
    float s0 = dot(w, vec4(1.0)), s1 = dot(o, vec4(1.0));
    return s1 > 1e-4 ? o * (s0 / s1) : w;
  }
`;
const COLOR_FRAG = /* glsl */`
  #include <color_fragment>
  {
    vec2 p = vTriWorldPos.xz;
    float lw = dot(vLayer, vec4(1.0));
    float flatK = layFlat(vTriWorldNrm.y);
    float fw = flatK * clamp(lw, 0.0, 1.0);
    // The biome's HUE (chroma relative to its own luminance), applied
    // partly to everything — ground and rock — so a red land is red and
    // a black-earth shore is black, without the old cap that clipped any
    // palette brighter than mid-grey back to plain texture.
    #ifdef USE_COLOR
      float vl = max(1e-3, dot(vColor.rgb, vec3(0.299, 0.587, 0.114)));
      vec3 chroma = clamp(vColor.rgb / vl, 0.4, 1.9);
      float lumSteer = clamp(mix(1.0, vl / 0.15, 0.45), 0.35, 1.0);
    #else
      vec3 chroma = vec3(1.0); float lumSteer = 1.0;
    #endif
    if (fw > 0.002) {
      vec4 w = layPatch(vLayer, p);
      float m = smoothstep(0.3, 0.7, lnoise(p * 0.11 + 5.0));
      vec3 c = vec3(0.0);
      if (w.x > 0.01) c += layTwo(uLayC0, p, uLayScale.x, m).rgb * w.x;
      if (w.y > 0.01) c += layTwo(uLayC1, p, uLayScale.y, m).rgb * w.y;
      if (w.z > 0.01) c += layTwo(uLayC2, p, uLayScale.z, m).rgb * w.z;
      if (w.w > 0.01) c += layTwo(uLayC3, p, uLayScale.w, m).rgb * w.w;
      c /= max(lw, 1e-3);
      c *= mix(vec3(1.0), chroma, 0.38) * lumSteer;
      diffuseColor.rgb = mix(diffuseColor.rgb, c, fw);
    } else {
      diffuseColor.rgb *= mix(vec3(1.0), chroma, 0.18);
    }
    // Large tone and warm/cool drift, over ground and rock alike.
    float tone = 0.74 + 0.36 * lfbm(p * 0.011);
    vec3 warm = mix(vec3(1.05, 0.99, 0.92), vec3(0.93, 0.98, 1.05), lfbm(p * 0.017 + 9.0));
    // Damp hollows: darker, a touch richer, on the flat.
    float damp = smoothstep(0.62, 0.86, lfbm(p * 0.045 + 3.0)) * flatK;
    // Scree: the band where flat turns to cliff is broken stone, darker.
    float scree = smoothstep(0.2, 0.55, flatK) * (1.0 - smoothstep(0.55, 0.95, flatK));
    // Grit: fine speckle so close ground is not a smooth print.
    float grit = 0.9 + 0.2 * lnoise(p * 2.3);
    diffuseColor.rgb *= tone * warm * grit * (1.0 - damp * 0.28) * (1.0 - scree * 0.22);
  }
`;
const NORMAL_HOOK = 'normal = normalize((viewMatrix * vec4(worldN, 0.0)).xyz);';
const NORMAL_FRAG = /* glsl */`
    {
      float lw = dot(vLayer, vec4(1.0));
      float fw = layFlat(vTriWorldNrm.y) * clamp(lw, 0.0, 1.0);
      if (fw > 0.002) {
        vec2 p = vTriWorldPos.xz;
        vec4 w = layPatch(vLayer, p);
        vec3 n = vec3(0.0);
        if (w.x > 0.01) n += (laySample(uLayN0, p, uLayScale.x).xyz * 2.0 - 1.0) * w.x;
        if (w.y > 0.01) n += (laySample(uLayN1, p, uLayScale.y).xyz * 2.0 - 1.0) * w.y;
        if (w.z > 0.01) n += (laySample(uLayN2, p, uLayScale.z).xyz * 2.0 - 1.0) * w.z;
        if (w.w > 0.01) n += (laySample(uLayN3, p, uLayScale.w).xyz * 2.0 - 1.0) * w.w;
        n /= max(lw, 1e-3);
        vec3 gn = vTriWorldNrm;
        // Top projection, same whiteout blend the rock's Y projection uses.
        vec3 wl = normalize(vec3(n.x + gn.x, abs(n.z) * gn.y, n.y + gn.z));
        worldN = normalize(mix(worldN, wl, fw));
      }
    }
    ${'normal = normalize((viewMatrix * vec4(worldN, 0.0)).xyz);'}
`;

/**
 * Add the ground layers to the (already triplanar) terrain material.
 * Wraps the triplanar onBeforeCompile rather than replacing it.
 */
export function applyGroundLayers(material) {
  if (!materialLibrary.ready) return material;
  const sets = LAYER_SLUGS.map(s => materialLibrary.sets.get(s));
  if (sets.some(s => !s || !s.map || !s.normalMap)) {
    console.warn('[TerrainLayers] a ground set is missing — flats stay rock');
    return material;
  }
  const uniforms = {
    uLayC0: { value: sets[0].map }, uLayC1: { value: sets[1].map },
    uLayC2: { value: sets[2].map }, uLayC3: { value: sets[3].map },
    uLayN0: { value: sets[0].normalMap }, uLayN1: { value: sets[1].normalMap },
    uLayN2: { value: sets[2].normalMap }, uLayN3: { value: sets[3].normalMap },
    uLayScale: { value: new THREE.Vector4(...LAYER_SCALE) },
  };
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${PARS_VERT}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLayer = aLayer;');
    let f = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PARS_FRAG}`)
      .replace('#include <color_fragment>', COLOR_FRAG);
    if (f.includes(NORMAL_HOOK)) f = f.replace(NORMAL_HOOK, NORMAL_FRAG);
    shader.fragmentShader = f;
  };
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|layers5`;
  material.needsUpdate = true;
  return material;
}
