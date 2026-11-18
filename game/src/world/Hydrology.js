// ══════════════════════════════════════════════════════════
// Hydrology — where the water is
//
// Owner: "water physics… lakes & ponds, rivers & streams, the sea at the
// Shore, puddles & swamp". Water is CARVED INTO THE ONE HEIGHT FUNCTION
// (TerrainGenerator._getHeight), so the terrain mesh, getGroundY,
// physics, prop placement and the grass all agree on where the banks
// are — and the water surface is recorded by the same call.
//
// Each biome carries four weights (blended across borders exactly like
// heightScale, so a coast or a riverbank fades in, never steps):
//   sea    the Strand and the drowned flats sink below SEA_Y
//   wet    puddles and standing water in hollows (swamps, flats, grotto)
//   river  rivers (wide, ~700 m meanders) and streams (narrow, frequent)
//   lake   basins that fill (low noise maxima, ~50–150 m across)
//
// The carve: the bed drops by `drop` and the water stands `lift` above
// the bed, with lift < drop and both 0 at the edge — so every bank meets
// its water at the original ground line, and depth falls to 0 at the
// shore (shallow foam, then dry land).
//
// ⚠️ No water within ~110 m of the Sanctuary (its walls stand on level
// ground), none on mountain flanks (rivers would hang on slopes).
// ══════════════════════════════════════════════════════════

export const SEA_Y = -0.5;

const W = (sea, wet, river, lake) => ({ sea, wet, river, lake });
export const HYDRO = {
  iron_hills:            W(0, 0.05, 0.4, 0.2),
  sunken_mire:           W(0, 1.0, 0.6, 0.95),
  highland_karst:        W(0, 0.2, 0.8, 0.45),
  ashen_caldera:         W(0, 0, 0, 0),
  forgotten_shore:       W(1.0, 0.5, 0.2, 0.2),
  drowned_flats:         W(0.8, 1.0, 0.3, 0.5),
  stormwrack_coast:      W(0.45, 0.3, 0.5, 0.3),
  twilight_swamp:        W(0.0, 1.0, 0.5, 0.7),
  plains:                W(0, 0.15, 1.0, 0.9),
  enchanted_forest:      W(0, 0.3, 1.0, 0.8),
  living_jungle:         W(0, 0.5, 1.0, 0.6),
  amber_steppe:          W(0, 0.05, 0.7, 0.5),
  frozen_tundra:         W(0, 0.1, 0.5, 0.6),
  petrified_wood:        W(0, 0.0, 0.4, 0.3),
  crystal_caverns:       W(0, 0.2, 0.5, 0.5),
  bioluminescent_grotto: W(0, 0.6, 0.8, 0.8),
  fungal_wastes:         W(0, 0.4, 0.4, 0.4),
  godgrave:              W(0, 0.1, 0.4, 0.3),
  hollow_mountains:      W(0, 0.0, 0.6, 0.3),
  dreaming_city:         W(0, 0.3, 0.5, 0.4),
  bottomless_pit:        W(0, 0.0, 0.0, 0.2),
  shadow_realm:          W(0, 0.1, 0.3, 0.3),
  the_verge:             W(0, 0.0, 0.3, 0.2),
  celestial_peaks:       W(0, 0.0, 0.4, 0.3),
  astral_highlands:      W(0, 0.0, 0.3, 0.3),
  glacier_shelf:         W(0, 0.0, 0.3, 0.4),
  floating_islands:      W(0, 0.0, 0.3, 0.3),
  desert_ruins:          W(0, 0.0, 0.12, 0.1),
  // Fire biomes hold no water.
  volcanic_wastes: W(0, 0, 0, 0), obsidian_wastes: W(0, 0, 0, 0), ember_dunes: W(0, 0, 0, 0), crimson_rift: W(0, 0, 0, 0),
};
const NONE = W(0, 0, 0, 0);

/** Biome → its water weights (by id, trap #11). */
export function hydroOf(biome) {
  return (biome && HYDRO[biome.key]) || NONE;
}

/** Blend a weighted biome list into `out` = { sea, wet, river, lake }. */
export function blendHydro(weights, out) {
  out.sea = out.wet = out.river = out.lake = 0;
  for (const bw of weights) {
    const h = hydroOf(bw.biome);
    out.sea += h.sea * bw.weight; out.wet += h.wet * bw.weight;
    out.river += h.river * bw.weight; out.lake += h.lake * bw.weight;
  }
  return out;
}

/** Per-biome water colour: [shallow, deep] — read by rendering/Water.js. */
export const WATER_TINT = {
  iron_hills:            [0x6a4a34, 0x24160e],
  sunken_mire:           [0x3a3a22, 0x10120a],
  highland_karst:        [0x5a6a64, 0x182220],
  // Natural, silty water — [shallow, deep]. Olive-brown silt in lowland
  // lakes and rivers, grey-green at the shore, cold slate in the north;
  // only the grotto keeps its unnatural teal.
  plains:                [0x5e5f44, 0x1d2419],
  enchanted_forest:      [0x4f5638, 0x161d14],
  living_jungle:         [0x58583a, 0x1a2014],
  amber_steppe:          [0x6a6346, 0x262418],
  twilight_swamp:        [0x4c4a30, 0x17170e],
  forgotten_shore:       [0x5a625a, 0x1c2522],
  drowned_flats:         [0x575d4c, 0x1b2119],
  stormwrack_coast:      [0x56625e, 0x18242a],
  bioluminescent_grotto: [0x2e7a78, 0x0a2a30],
  fungal_wastes:         [0x554c50, 0x1c171a],
  godgrave:              [0x5e5046, 0x221a16],
  shadow_realm:          [0x403c48, 0x15131a],
  dreaming_city:         [0x4a4e54, 0x171a1e],
  frozen_tundra:         [0x5e7078, 0x1f2c34],
  glacier_shelf:         [0x6a8090, 0x22323e],
  _default:              [0x575a44, 0x1b2119],
};
