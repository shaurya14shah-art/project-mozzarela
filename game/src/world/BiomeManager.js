// ══════════════════════════════════════════════════════════
// Biome Manager — Rich Biome Definitions & Blending
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { BIOME_TYPES, WORLD } from '../data/constants.js';
import { realmRegionAt } from '../data/realm.js';
import { TerrainGenerator } from './TerrainGenerator.js';
import { GRASS_BY_BIOME } from '../rendering/GrassField.js';
import { GROUND_BY_BIOME } from '../rendering/TerrainLayers.js';

// ── BIOME DEFINITIONS ─────────────────────────────────────
export const BIOMES = {
  [BIOME_TYPES.PLAINS]: {
    name: 'Verdant Plains',
    surface:     'grass',
    enemyTypes:  [0, 2, 1],
    heightScale:    0.5,
    roughness:      0.25,
    mountainFactor: 0.0,
    plateauFactor:  0.0,
    colors: {
      low:  new THREE.Color(0x2d6a2f),
      mid:  new THREE.Color(0x4a9a4e),
      high: new THREE.Color(0x7bbf59),
      peak: new THREE.Color(0xb0c090),
    },
    fogColor:    new THREE.Color(0x1a2a1e),
    fogDensity:  0.005,
    enemyLevel:  1,
    treeDensity: 0.070,
    rockDensity: 0.04,
    ambientLight: 0x334433,
  },

  [BIOME_TYPES.ENCHANTED_FOREST]: {
    name: 'Enchanted Forest',
    surface:     'grass',
    enemyTypes:  [2, 4, 5],
    heightScale:    0.7,
    roughness:      0.45,
    mountainFactor: 0.1,
    plateauFactor:  0.0,
    colors: {
      low:  new THREE.Color(0x0d2b1e),
      mid:  new THREE.Color(0x1a5030),
      high: new THREE.Color(0x2a7055),
      peak: new THREE.Color(0x5a3090),
    },
    fogColor:    new THREE.Color(0x070f0a),
    fogDensity:  0.018,
    enemyLevel:  3,
    treeDensity: 0.275,
    rockDensity: 0.08,
    ambientLight: 0x101a10,
  },

  [BIOME_TYPES.VOLCANIC_WASTES]: {
    name: 'Volcanic Wastes',
    surface:     'stone',
    enemyTypes:  [7, 6, 1],
    heightScale:    1.6,
    roughness:      0.8,
    mountainFactor: 0.9,
    plateauFactor:  0.0,
    colors: {
      low:  new THREE.Color(0x0a0505),
      mid:  new THREE.Color(0x2a0808),
      high: new THREE.Color(0x801008),
      peak: new THREE.Color(0xff3010),
    },
    fogColor:    new THREE.Color(0x1a0602),
    fogDensity:  0.014,
    enemyLevel:  8,
    treeDensity: 0.000,
    rockDensity: 0.45,
    lavaGlow:    true,
    ambientLight: 0x1a0800,
  },

  [BIOME_TYPES.CRYSTAL_CAVERNS]: {
    name: 'Crystal Caverns',
    surface:     'stone',
    enemyTypes:  [7, 8, 4],
    heightScale:    0.6,
    roughness:      0.55,
    mountainFactor: 0.0,
    plateauFactor:  0.5,
    colors: {
      low:  new THREE.Color(0x05101e),
      mid:  new THREE.Color(0x0a2a60),
      high: new THREE.Color(0x2060c0),
      peak: new THREE.Color(0x60d0ff),
    },
    fogColor:    new THREE.Color(0x020510),
    fogDensity:  0.012,
    enemyLevel:  5,
    treeDensity: 0.000,
    rockDensity: 0.5,
    crystalGlow: true,
    ambientLight: 0x040820,
  },

  [BIOME_TYPES.FROZEN_TUNDRA]: {
    name: 'Frozen Tundra',
    surface:     'stone',
    enemyTypes:  [8, 7, 11],
    heightScale:    0.5,
    roughness:      0.2,
    mountainFactor: 0.15,
    plateauFactor:  0.4,
    colors: {
      low:  new THREE.Color(0x6070a0),
      mid:  new THREE.Color(0x90a8c8),
      high: new THREE.Color(0xc8dff0),
      peak: new THREE.Color(0xffffff),
    },
    fogColor:    new THREE.Color(0x101520),
    fogDensity:  0.009,
    enemyLevel:  6,
    treeDensity: 0.020,
    rockDensity: 0.2,
    ambientLight: 0x101530,
  },

  [BIOME_TYPES.DESERT_RUINS]: {
    name: 'Desert Ruins',
    surface:     'sand',
    enemyTypes:  [9, 1, 10],
    heightScale:    0.7,
    roughness:      0.2,
    mountainFactor: 0.0,
    plateauFactor:  0.7,  // Flat mesas!
    colors: {
      low:  new THREE.Color(0x704810),
      mid:  new THREE.Color(0xa07028),
      high: new THREE.Color(0xd0a050),
      peak: new THREE.Color(0xf0d080),
    },
    fogColor:    new THREE.Color(0x1a1208),
    fogDensity:  0.006,
    enemyLevel:  4,
    treeDensity: 0.005,
    rockDensity: 0.25,
    ambientLight: 0x201808,
  },

  [BIOME_TYPES.TWILIGHT_SWAMP]: {
    name: 'Twilight Swamp',
    surface:     'grass',
    enemyTypes:  [4, 5, 0],
    heightScale:    0.35,
    roughness:      0.3,
    mountainFactor: 0.0,
    plateauFactor:  0.0,
    colors: {
      low:  new THREE.Color(0x101808),
      mid:  new THREE.Color(0x203018),
      high: new THREE.Color(0x385028),
      peak: new THREE.Color(0x506038),
    },
    fogColor:    new THREE.Color(0x080d05),
    fogDensity:  0.022,
    enemyLevel:  5,
    treeDensity: 0.150,
    rockDensity: 0.06,
    ambientLight: 0x081008,
  },

  [BIOME_TYPES.SHADOW_REALM]: {
    name: 'Shadow Realm',
    surface:     'stone',
    enemyTypes:  [5, 3, 11],
    heightScale:    1.2,
    roughness:      0.85,
    mountainFactor: 0.7,
    plateauFactor:  0.0,
    colors: {
      low:  new THREE.Color(0x020008),
      mid:  new THREE.Color(0x080018),
      high: new THREE.Color(0x140030),
      peak: new THREE.Color(0x300070),
    },
    fogColor:    new THREE.Color(0x010005),
    fogDensity:  0.025,
    enemyLevel:  15,
    treeDensity: 0.020,
    rockDensity: 0.25,
    voidGlow:    true,
    ambientLight: 0x040010,
  },

  // ══════════════════════════════════════════════════════════
  // THE REALM — after Shadow Slave's Dream Realm
  //
  // ⚠️ Read the note in constants.js's BIOME_TYPES before editing any
  // of these. The governing idea: every region is the CORPSE of
  // something enormous, and the player is small in it. Palettes are
  // bone, ash, iron and drowned grey — there is no green in this set
  // and that is deliberate, not an oversight.
  // ══════════════════════════════════════════════════════════

  // GODGRAVE — a dead god lies under the sand, and its bones are the
  // landscape. The terrain is deliberately the FLATTEST in the game:
  // the ribs and vertebrae that ChunkManager scatters here are the
  // relief, and hills would compete with them. An endless pale plain
  // whose only verticals are skeletal is the entire image.
  [BIOME_TYPES.GODGRAVE]: {
    name: 'Gravefall',
    surface:     'sand',
    enemyTypes:  [5, 3, 8],
    heightScale:    0.30,   // ⚠️ flattest in the table — the bones ARE the terrain
    roughness:      0.10,
    mountainFactor: 0.0,
    plateauFactor:  0.06,
    colors: {
      // ⚠️ THREE VALUES AND ONE ACCENT — Godgrave is BONE, not sand.
      // Canon: the skeleton is "sun-bleached", reading as a continuous
      // WHITE surface, over a sea of ash, with fields of vermilion
      // grass against it. The old ramp (0x6b6455 → 0xc4baa2) was a
      // brown-tan desert — the same warm sand as Ember Dunes, which is
      // exactly what made a dead god's remains read as a beach.
      // Low ground is the ash it lies in; everything above is bleached
      // bone; the vermilion is the ONE saturated colour, kept small and
      // low so it reads as growth between the bones rather than a
      // recolour of the whole biome.
      low:  new THREE.Color(0x4a4642),   // sea of ash
      mid:  new THREE.Color(0x8d7f72),   // ash meeting bone
      high: new THREE.Color(0xc0b6a4),   // bleached bone
      peak: new THREE.Color(0xded6c4),   // bone in the white light
      accent: new THREE.Color(0x8c2f22), // vermilion grass — the one hot colour
    },
    fogColor:    new THREE.Color(0x9a9384),
    fogDensity:  0.0075,
    enemyLevel:  12,
    treeDensity: 0.0,
    rockDensity: 0.05,
    boneField:   true,      // read by ChunkManager — colossal remains
    ambientLight: 0x3a3830,
  },

  // THE HOLLOW MOUNTAINS — the most vertical place in the world, and
  // hollow: cave mouths and arches bore through the peaks. Maximum
  // mountainFactor and roughness, so the silhouette is jagged rather
  // than rolling.
  [BIOME_TYPES.HOLLOW_MOUNTAINS]: {
    name: 'The Hushpeaks',
    surface:     'stone',
    enemyTypes:  [3, 5, 11],
    heightScale:    2.40,   // ⚠️ tallest in the table
    roughness:      1.00,
    mountainFactor: 1.00,
    plateauFactor:  0.0,
    colors: {
      // ⚠️ THE VALUE RANGE IS THE BIOME. Canon: the peaks wear
      // "pristine white snow" and stream mist, while the hollows below
      // are where True Darkness LIVES. The old ramp ran 0x14161a to
      // 0x4e555f — four shades of the same slate, a 0.06→0.31 lightness
      // span, so the tallest terrain in the game had the flattest
      // palette and its silhouette died against the sky.
      // Near-black at the foot to near-white at the crown: the peaks
      // now read at any distance, which is the whole point of a range
      // "piercing the skies like the fangs of a giant dragon."
      // ⚠️ No accent. This is the one region canon explicitly describes
      // as having no colour at all.
      low:  new THREE.Color(0x0a0b0e),   // the darkness in the hollows
      mid:  new THREE.Color(0x24272d),
      high: new THREE.Color(0x6e757e),
      peak: new THREE.Color(0xd8dde3),   // snow, and the mist on it
    },
    fogColor:    new THREE.Color(0x0c0e12),
    fogDensity:  0.014,
    enemyLevel:  14,
    treeDensity: 0.0,
    rockDensity: 0.34,
    hollowed:    true,      // read by ChunkManager — arches and cave mouths
    ambientLight: 0x161a20,
  },

  // THE FORGOTTEN SHORE — where the drowned come ashore. Almost at sea
  // level, heavy mist, black sand, and the wrecks of something that
  // sank a long time ago.
  [BIOME_TYPES.FORGOTTEN_SHORE]: {
    name: 'The Bleeding Strand',
    surface:     'sand',
    enemyTypes:  [8, 5, 2],
    heightScale:    0.22,
    roughness:      0.18,
    mountainFactor: 0.0,
    plateauFactor:  0.0,
    colors: {
      // ⚠️ THE STRONGEST PALETTE IN THE BOOK, AND THE GAME HAD NONE OF
      // IT. Canon opens on the Shore with exactly three values: "the
      // somber grey sky and the black earth… the vibrant crimson sea of
      // twisting coral." The old ramp was four steps of blue-grey — no
      // black, no crimson, and indistinguishable from the Dreaming City
      // and the Bottomless Pit standing next to it in this same table.
      // Black earth below, grey above, and the coral as the accent.
      low:  new THREE.Color(0x0d0e10),   // black earth
      mid:  new THREE.Color(0x24272b),
      high: new THREE.Color(0x4a5058),
      peak: new THREE.Color(0x6d757e),   // grey, toward the sky
      accent: new THREE.Color(0x9e1f22), // the crimson coral
    },
    fogColor:    new THREE.Color(0x6a727c),
    fogDensity:  0.030,     // ⚠️ heaviest fog in the game — the shore is mist
    enemyLevel:  10,
    treeDensity: 0.0,
    rockDensity: 0.16,
    drowned:     true,      // read by ChunkManager — wrecks and drowned stone
    ambientLight: 0x2a3038,
  },

  // THE DREAMING CITY — a dead city at a scale nobody living built.
  // Plateaus stand in for the street grid the terrain cannot model, so
  // the ruins sit on flat shelves with sharp drops between them.
  [BIOME_TYPES.DREAMING_CITY]: {
    name: 'The Still City',
    surface:     'stone',
    enemyTypes:  [11, 5, 3],
    heightScale:    0.85,
    roughness:      0.35,
    mountainFactor: 0.0,
    plateauFactor:  0.95,   // ⚠️ highest plateau factor — shelves, not hills
    colors: {
      // ⚠️ SILVER ON BLACK GLASS. Canon's Eternal City rests on "smooth
      // black glass" and is announced by silver spires and a cold
      // silver radiance — a metal city, not a stone ruin. The old warm
      // grey-violet ramp was masonry, which is the single largest
      // divergence between this game's realm and the book's (see
      // docs/SHADOW_SLAVE_FIDELITY.md §0.4).
      // ⚠️ The peak is deliberately COLD and bright: canon makes a
      // point that the silver light is cold and casts no shadows, and
      // a warm highlight here would read as torchlight in a ruin.
      low:  new THREE.Color(0x0b0c10),   // black glass
      mid:  new THREE.Color(0x1c2028),
      high: new THREE.Color(0x565f6b),
      peak: new THREE.Color(0xa8b4c2),   // silver
    },
    fogColor:    new THREE.Color(0x14121a),
    fogDensity:  0.016,
    enemyLevel:  16,
    treeDensity: 0.0,
    rockDensity: 0.10,
    deadCity:    true,      // read by ChunkManager — colossal ruins
    ambientLight: 0x1c1a22,
  },

  // THE BOTTOMLESS PIT — ground that falls away. Deep, narrow relief
  // with no mountain component at all, so it reads as a floor that has
  // collapsed rather than as terrain that rises.
  [BIOME_TYPES.BOTTOMLESS_PIT]: {
    name: 'The Maw',
    surface:     'stone',
    enemyTypes:  [5, 11, 3],
    heightScale:    1.70,
    roughness:      0.92,
    mountainFactor: 0.10,   // ⚠️ near zero ON PURPOSE — it sinks, it does not rise
    plateauFactor:  0.35,
    chasm:       true,      // read by ChunkManager — spires from below
    colors: {
      low:  new THREE.Color(0x08070c),
      mid:  new THREE.Color(0x131119),
      high: new THREE.Color(0x201d28),
      peak: new THREE.Color(0x322c3c),
    },
    fogColor:    new THREE.Color(0x050409),
    fogDensity:  0.026,
    enemyLevel:  18,
    treeDensity: 0.0,
    rockDensity: 0.22,
    ambientLight: 0x0a0810,
  },

  [BIOME_TYPES.CELESTIAL_PEAKS]: {
    name: 'Celestial Peaks',
    surface:     'stone',
    enemyTypes:  [7, 8, 6],
    heightScale:    2.2,   // Dramatic tall mountains
    roughness:      0.65,
    mountainFactor: 1.0,   // Maximum mountain factor
    plateauFactor:  0.1,
    colors: {
      // ⚠️ Was 0x2030508 — SEVEN hex digits, the identical typo already
      // documented and fixed on Astral Highlands at the bottom of this
      // file. THREE.Color masks per byte, so it decoded to 0x030508: a
      // near-black, sitting under a 0x5070b0 mid in a blue alpine
      // biome. Silent, because a too-dark low reads as "shadowed
      // valley floor" rather than as a broken colour.
      low:  new THREE.Color(0x203050),
      mid:  new THREE.Color(0x5070b0),
      high: new THREE.Color(0x90b8e8),
      peak: new THREE.Color(0xfff0d8),
    },
    fogColor:    new THREE.Color(0x0a1030),
    fogDensity:  0.004,
    enemyLevel:  12,
    treeDensity: 0.010,
    rockDensity: 0.4,
    cloudLayer:  true,
    ambientLight: 0x101828,
  },

  [BIOME_TYPES.LIVING_JUNGLE]: {
    name: 'Living Jungle',
    surface:     'grass',
    enemyTypes:  [2, 4, 0],
    heightScale:    1.0,
    roughness:      0.6,
    mountainFactor: 0.1,
    plateauFactor:  0.0,
    colors: {
      low:  new THREE.Color(0x0f2a08),
      mid:  new THREE.Color(0x1e4a10),
      high: new THREE.Color(0x357020),
      peak: new THREE.Color(0x55a030),
    },
    fogColor:    new THREE.Color(0x081005),
    fogDensity:  0.02,
    enemyLevel:  7,
    treeDensity: 0.325,
    rockDensity: 0.07,
    ambientLight: 0x0a1808,
  },

  [BIOME_TYPES.OBSIDIAN_WASTES]: {
    name: 'Obsidian Wastes',
    surface:     'stone',
    enemyTypes:  [7, 1, 6],
    heightScale:    1.4,
    roughness:      0.9,
    mountainFactor: 0.5,
    plateauFactor:  0.3,
    colors: {
      low:  new THREE.Color(0x060302),
      mid:  new THREE.Color(0x120508),
      high: new THREE.Color(0xaa2808),
      peak: new THREE.Color(0xff8810),
    },
    fogColor:    new THREE.Color(0x080300),
    fogDensity:  0.016,
    enemyLevel:  10,
    treeDensity: 0.000,
    rockDensity: 0.55,
    lavaGlow:    true,
    ambientLight: 0x100400,
  },

  [BIOME_TYPES.BIOLUMINESCENT_GROTTO]: {
    name: 'Glowing Grotto',
    surface:     'stone',
    enemyTypes:  [4, 0, 5],
    heightScale:    0.5,
    roughness:      0.4,
    mountainFactor: 0.0,
    plateauFactor:  0.2,
    colors: {
      low:  new THREE.Color(0x041228),
      mid:  new THREE.Color(0x083060),
      high: new THREE.Color(0x00d8a8),
      peak: new THREE.Color(0xaaffee),
    },
    fogColor:    new THREE.Color(0x020810),
    fogDensity:  0.022,
    enemyLevel:  6,
    treeDensity: 0.175,
    rockDensity: 0.22,
    glowColor:   0x00ffaa,
    ambientLight: 0x041018,
  },

  [BIOME_TYPES.CRIMSON_RIFT]: {
    name: 'Crimson Rift',
    surface:     'stone',
    enemyTypes:  [6, 3, 5],
    heightScale:    2.0,
    roughness:      0.95,
    mountainFactor: 0.85,
    plateauFactor:  0.0,
    colors: {
      low:  new THREE.Color(0x200308),
      mid:  new THREE.Color(0x500808),
      high: new THREE.Color(0x880c10),
      peak: new THREE.Color(0x181818),
    },
    fogColor:    new THREE.Color(0x180205),
    fogDensity:  0.013,
    enemyLevel:  15,
    treeDensity: 0.000,
    rockDensity: 0.65,
    ambientLight: 0x180305,
  },

  [BIOME_TYPES.FUNGAL_WASTES]: {
    name: 'Fungal Wastes',
    surface:     'grass',
    enemyTypes:  [0, 4, 10],
    heightScale:    0.6,
    roughness:      0.45,
    mountainFactor: 0.05,
    plateauFactor:  0.2,
    colors: {
      low:  new THREE.Color(0x180c05),
      mid:  new THREE.Color(0x382010),
      high: new THREE.Color(0x7030a0),
      peak: new THREE.Color(0xb850e0),
    },
    fogColor:    new THREE.Color(0x100808),
    fogDensity:  0.018,
    enemyLevel:  7,
    treeDensity: 0.200,
    rockDensity: 0.15,
    glowColor:   0xaa44ff,
    ambientLight: 0x100818,
  },

  [BIOME_TYPES.ASTRAL_HIGHLANDS]: {
    name: 'Astral Highlands',
    surface:     'stone',
    enemyTypes:  [5, 8, 3],
    heightScale:    1.8,
    roughness:      0.5,
    mountainFactor: 0.4,
    plateauFactor:  0.8,  // Huge flat plateaus in the sky
    colors: {
      low:  new THREE.Color(0x100c20),
      // ⚠️ Was 0x2820508 — SEVEN hex digits. THREE.Color masks per byte,
      // so it decoded as (0x82, 0x05, 0x08): a dark RED mid-tone in the
      // middle of a violet star-field biome, nothing like the value
      // that was clearly intended by the digits either side of it.
      mid:  new THREE.Color(0x282050),
      high: new THREE.Color(0x7060d0),
      peak: new THREE.Color(0xe0d0ff),
    },
    fogColor:    new THREE.Color(0x080618),
    fogDensity:  0.005,
    enemyLevel:  11,
    treeDensity: 0.030,
    rockDensity: 0.3,
    starGlow:    true,
    ambientLight: 0x100c28,
  },

  // ══════════════════════════════════════════════════════
  // ── ADDED TERRAIN ─────────────────────────────────────
  // Seven new biomes. Each is separated from its neighbours by its
  // TERRAIN SHAPE, not only its palette: heightScale / roughness /
  // mountainFactor / plateauFactor are what the ground actually does,
  // and a biome that only recolours the same hills is not a new place.
  // The four shape dials are noted per entry.
  // ══════════════════════════════════════════════════════

  [BIOME_TYPES.AMBER_STEPPE]: {
    name: 'Amber Steppe',
    // Wide gentle swells, no peaks — the friendliest ground in the
    // game after the Plains, and the early-game's warm counterpart to
    // the Tundra's cold one.
    heightScale:    0.55,
    roughness:      0.30,
    mountainFactor: 0.0,
    plateauFactor:  0.15,
    colors: {
      low:  new THREE.Color(0x6b5220),
      mid:  new THREE.Color(0xb08a2e),
      high: new THREE.Color(0xd9b44a),
      peak: new THREE.Color(0xf0dc9a),
    },
    fogColor:    new THREE.Color(0x3a2c14),
    fogDensity:  0.006,
    enemyLevel:  2,
    treeDensity: 0.030,
    rockDensity: 0.05,
    surface:     'grass',
    enemyTypes:  [0, 2, 1],
    ambientLight: 0x3a3020,
  },

  [BIOME_TYPES.DROWNED_FLATS]: {
    name: 'The Drowned Flats',
    // Almost perfectly level standing water — the flattest terrain in
    // the world, and deliberately so: after thirteen biomes of hills,
    // an actual PLAIN of water reads as a place.
    heightScale:    0.22,
    roughness:      0.15,
    mountainFactor: 0.0,
    plateauFactor:  0.0,
    colors: {
      low:  new THREE.Color(0x16333a),
      mid:  new THREE.Color(0x27636b),
      high: new THREE.Color(0x4d8f93),
      peak: new THREE.Color(0x9ec6c0),
    },
    fogColor:    new THREE.Color(0x0d2026),
    fogDensity:  0.020,
    enemyLevel:  3,
    treeDensity: 0.045,
    rockDensity: 0.02,
    surface:     'grass',
    enemyTypes:  [4, 0, 5],
    ambientLight: 0x14282c,
  },

  [BIOME_TYPES.STORMWRACK_COAST]: {
    name: 'Stormwrack Coast',
    // Mountain AND plateau together — the only combination in the
    // table that produces sheer sea-cliffs with flat tops rather than
    // either rounded peaks or pure mesa.
    heightScale:    0.95,
    roughness:      0.60,
    mountainFactor: 0.45,
    plateauFactor:  0.50,
    colors: {
      low:  new THREE.Color(0x27333d),
      mid:  new THREE.Color(0x466070),
      high: new THREE.Color(0x7d99a6),
      peak: new THREE.Color(0xcfe0e6),
    },
    fogColor:    new THREE.Color(0x18242c),
    fogDensity:  0.016,
    enemyLevel:  5,
    treeDensity: 0.020,
    rockDensity: 0.22,
    surface:     'stone',
    enemyTypes:  [1, 11, 7],
    ambientLight: 0x1e2a34,
  },

  [BIOME_TYPES.PETRIFIED_WOOD]: {
    name: 'The Petrified Wood',
    // A forest turned to stone. Dense "trees" on broken, terraced
    // ground — the tree density of a forest with the surface of a
    // quarry, which no existing biome does.
    heightScale:    0.65,
    roughness:      0.50,
    mountainFactor: 0.10,
    plateauFactor:  0.35,
    colors: {
      low:  new THREE.Color(0x3b3128),
      mid:  new THREE.Color(0x6d5c48),
      high: new THREE.Color(0x9c8a6e),
      peak: new THREE.Color(0xd0c3a4),
    },
    fogColor:    new THREE.Color(0x241d16),
    fogDensity:  0.014,
    enemyLevel:  6,
    treeDensity: 0.190,
    rockDensity: 0.16,
    surface:     'wood',
    enemyTypes:  [10, 1, 11],
    ambientLight: 0x2a231b,
  },

  [BIOME_TYPES.GLACIER_SHELF]: {
    name: 'Glacier Shelf',
    // Enormous flat ice tables with sheer steps between them — the
    // highest plateauFactor in the game, so the silhouette is
    // horizontal slabs rather than the Tundra's rolling snow.
    heightScale:    0.80,
    roughness:      0.20,
    mountainFactor: 0.20,
    plateauFactor:  0.85,
    colors: {
      low:  new THREE.Color(0x35566b),
      mid:  new THREE.Color(0x6f9ab5),
      high: new THREE.Color(0xa8cfe0),
      peak: new THREE.Color(0xeaf7ff),
    },
    fogColor:    new THREE.Color(0x22394a),
    fogDensity:  0.013,
    enemyLevel:  8,
    treeDensity: 0.0,
    rockDensity: 0.14,
    surface:     'stone',
    enemyTypes:  [8, 7, 11],
    ambientLight: 0x2c4356,
  },

  [BIOME_TYPES.EMBER_DUNES]: {
    name: 'Ember Dunes',
    // Rolling dunes with live coals under them. Smooth like the
    // Steppe, but hot, sterile and lit from below.
    heightScale:    0.62,
    roughness:      0.35,
    mountainFactor: 0.0,
    plateauFactor:  0.10,
    colors: {
      low:  new THREE.Color(0x40190e),
      mid:  new THREE.Color(0x8a3a16),
      high: new THREE.Color(0xc9641f),
      peak: new THREE.Color(0xf0a552),
    },
    fogColor:    new THREE.Color(0x2a1008),
    fogDensity:  0.011,
    enemyLevel:  9,
    treeDensity: 0.0,
    rockDensity: 0.07,
    surface:     'sand',
    enemyTypes:  [9, 1, 7],
    ambientLight: 0x3a1a0e,
  },

  [BIOME_TYPES.THE_VERGE]: {
    name: 'The Verge',
    // Where the ground gives up. The most extreme shape dials in the
    // table — an end-game silhouette of shattered spires.
    heightScale:    1.60,
    roughness:      0.75,
    mountainFactor: 0.95,
    plateauFactor:  0.20,
    colors: {
      low:  new THREE.Color(0x1b1020),
      mid:  new THREE.Color(0x43204d),
      high: new THREE.Color(0x8a3f8f),
      peak: new THREE.Color(0xe3a8f0),
    },
    fogColor:    new THREE.Color(0x120a18),
    fogDensity:  0.019,
    enemyLevel:  14,
    treeDensity: 0.0,
    rockDensity: 0.34,
    surface:     'stone',
    enemyTypes:  [5, 3, 6],
    starGlow:    true,
    ambientLight: 0x1a1024,
  },

  // ══════════════════════════════════════════════════════
  // THE WORLD EXPANSION (owner: "more biomes… caves for ores")
  // Each fills a real gap and anchors a rung of the ore ladder
  // (data/expansion.js BIOME_ORES / SIGNATURE / BIOME_LIFE).
  // ══════════════════════════════════════════════════════
  [BIOME_TYPES.IRON_HILLS]: {
    name: 'The Iron Hills',
    // Red layered mesas and gullies cut by old workings — the early
    // mining heartland: copper, tin, iron and coal in every cut.
    surface: 'stone',
    enemyTypes: [2, 1, 7],
    heightScale: 1.05, roughness: 0.5, mountainFactor: 0.3, plateauFactor: 0.8,
    colors: {
      low: new THREE.Color(0x5a2a18), mid: new THREE.Color(0x8a4424),
      high: new THREE.Color(0xb46a3c), peak: new THREE.Color(0xd8a070),
    },
    fogColor: new THREE.Color(0x1e120c), fogDensity: 0.007,
    enemyLevel: 3, treeDensity: 0.02, rockDensity: 0.3,
    ambientLight: 0x2a1810, quarries: 0.35,
  },
  [BIOME_TYPES.SUNKEN_MIRE]: {
    name: 'The Sunken Mire',
    // Flooded old-growth on stilt roots, peat and black water; silver
    // in drowned barrows, bog horrors under the surface.
    surface: 'mud',
    enemyTypes: [0, 11, 1],
    heightScale: 0.35, roughness: 0.3, mountainFactor: 0.0, plateauFactor: 0.0,
    colors: {
      low: new THREE.Color(0x141c10), mid: new THREE.Color(0x26341c),
      high: new THREE.Color(0x3c4a28), peak: new THREE.Color(0x5a6038),
    },
    fogColor: new THREE.Color(0x0c120c), fogDensity: 0.022,
    enemyLevel: 5, treeDensity: 0.22, rockDensity: 0.03,
    ambientLight: 0x0e160c,
  },
  [BIOME_TYPES.HIGHLAND_KARST]: {
    name: 'The Karst Highlands',
    // Limestone towers and sinkholes over the deepest caves in the
    // world; mithril and pearls below, cliff cats above.
    surface: 'stone',
    enemyTypes: [7, 1, 4],
    heightScale: 1.5, roughness: 0.85, mountainFactor: 0.8, plateauFactor: 0.3,
    colors: {
      low: new THREE.Color(0x3a4a34), mid: new THREE.Color(0x8a9080),
      high: new THREE.Color(0xc8c8bc), peak: new THREE.Color(0xe8e6de),
    },
    fogColor: new THREE.Color(0x161a18), fogDensity: 0.01,
    enemyLevel: 7, treeDensity: 0.04, rockDensity: 0.35,
    ambientLight: 0x1a1e1a, caveMouths: 0.5,
  },
  [BIOME_TYPES.ASHEN_CALDERA]: {
    name: 'The Ashen Caldera',
    // The crater of a dead volcano: glass-black ground, sulphur vents,
    // obsidian fields, and a cult that came for the heat.
    surface: 'stone',
    enemyTypes: [6, 1, 10],
    heightScale: 1.1, roughness: 0.6, mountainFactor: 0.5, plateauFactor: 0.2,
    colors: {
      low: new THREE.Color(0x141012), mid: new THREE.Color(0x2a2224),
      high: new THREE.Color(0x4a3a30), peak: new THREE.Color(0xc8b040),
    },
    fogColor: new THREE.Color(0x1a0e0a), fogDensity: 0.016,
    enemyLevel: 9, treeDensity: 0.0, rockDensity: 0.3,
    ambientLight: 0x2a140c,
  },
};

// ⚠️ Grass is attached by biome ID, never by name (trap #11 — a display
// string and a lookup key must never be the same field). Every biome
// gets the field, null where nothing grows, so a reader can tell
// "this biome is bare" from "nobody set it".
for (const [id, biome] of Object.entries(BIOMES)) {
  biome.key = id;   // the lookup key (Flora, Hydrology) — never the display name
  biome.grass = GRASS_BY_BIOME[id] || null;
  biome.ground = GROUND_BY_BIOME[id] || null;   // rendering/TerrainLayers.js
}

const biomeKeys = Object.keys(BIOMES);

// ── BIOME MANAGER ─────────────────────────────────────────
export class BiomeManager {
  constructor(seed = 12345) {
    this.seed = seed;
    this.tempNoise     = createNoise2D(this._makeRng(seed));
    this.humidNoise    = createNoise2D(this._makeRng(seed + 7));
    this.continentNoise= createNoise2D(this._makeRng(seed + 13));
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

  getBiomeWeights(x, z) {
    const dist = Math.sqrt(x * x + z * z);

    // Hub sanctuary near spawn
    if (dist < WORLD.CHUNK_SIZE * 2.5) {
      const hubW = Math.max(0, 1 - dist / (WORLD.CHUNK_SIZE * 3));
      if (hubW > 0.92) return [{ biome: this._hubBiome(), weight: 1.0 }];
      const natural = this._getNaturalBiomeAt(x, z);
      return [
        { biome: this._hubBiome(), weight: hubW },
        { biome: natural, weight: 1 - hubW },
      ];
    }

    // Sample 4 corner biomes and blend smoothly
    const sampleStep = 50;
    const b00 = this._getNaturalBiomeAt(x,                z               );
    const b10 = this._getNaturalBiomeAt(x + sampleStep,  z               );
    const b01 = this._getNaturalBiomeAt(x,                z + sampleStep  );
    const b11 = this._getNaturalBiomeAt(x + sampleStep,  z + sampleStep  );

    // Deduplicate
    const uniqueBiomes = [...new Set([b00, b10, b01, b11])];
    if (uniqueBiomes.length === 1) return [{ biome: uniqueBiomes[0], weight: 1.0 }];

    // Bilinear blend weights
    const fx = ((x % sampleStep) + sampleStep) % sampleStep / sampleStep;
    const fz = ((z % sampleStep) + sampleStep) % sampleStep / sampleStep;
    const weights = new Map();
    const add = (b, w) => weights.set(b, (weights.get(b) || 0) + w);
    add(b00, (1 - fx) * (1 - fz));
    add(b10, fx       * (1 - fz));
    add(b01, (1 - fx) * fz      );
    add(b11, fx       * fz      );

    const result = [];
    for (const [biome, weight] of weights) {
      if (weight > 0.01) result.push({ biome, weight });
    }
    return result;
  }

  _hubBiome() {
    // Same fix, same reasoning, as ChunkManager.js's hard hub
    // override — kept to identical values so the blend ring this
    // method feeds (see _blendBiomes' hubW) doesn't seam against it.
    return {
      name: 'The Sanctuary',
      grass:       GRASS_BY_BIOME.plains,
      ground:      GROUND_BY_BIOME.sanctuary,
      surface:     'wood',
      enemyTypes:  [],   // the hub is safe; the spawner also returns early on the name
      colors: {
        low:  new THREE.Color(0x40503f),
        mid:  new THREE.Color(0x62735a),
        high: new THREE.Color(0x8a9478),
        peak: new THREE.Color(0xd8d4c0),
      },
      heightScale:    0.3,
      roughness:      0.15,
      mountainFactor: 0.0,
      plateauFactor:  0.0,
      treeDensity: 0.000,
      rockDensity:    0,
      enemyDensity:   0,
      fogColor:  new THREE.Color(0x9a9482),
      fogDensity: 0.0055,
    };
  }

  // ══════════════════════════════════════════════════════════
  // ⚠️ THE NIGHTMARE SKIN — the same country, wrong
  //
  // Owner: *"the trials are... way too similar to dungeons, they
  // should have a different terrain."*
  //
  // A Nightmare does NOT get its own biome. It gets the region's own
  // biome WEARING A DIFFERENT FACE — bleached almost to greyscale,
  // darker at every band, with heavier fog and rougher ground. That is
  // deliberate and it is the more unsettling of the two options: a
  // brand-new biome would read as "somewhere else", while Godgrave
  // rendered bloodless and wrong reads as "the place you know, and it
  // has stopped being right". The Nightmare is the realm seen from
  // inside a bad dream, not a separate location.
  //
  // ⚠️ CACHED PER SOURCE BIOME. This runs inside `getBiomeForChunk`,
  // which is called for every chunk and (via `_getNaturalBiomeAt`)
  // four times per biome-weight blend — allocating a fresh object and
  // four THREE.Color instances there would be per-vertex garbage in
  // the hot path.
  //
  // ⚠️ It returns the UNTOUCHED biome when no Nightmare is running,
  // by reference, so the ordinary world pays one property read.
  // ══════════════════════════════════════════════════════════
  _nightmareSkin(biome) {
    const w = TerrainGenerator.nightmareWarp;
    if (!biome || !w || !w.active) return biome;

    this._nmCache = this._nmCache || new Map();
    const hit = this._nmCache.get(biome);
    if (hit) return hit;

    // Bleach toward the band's own luminance, then darken. Keeping a
    // little of the original hue is what stops it reading as a
    // black-and-white filter — the place is recognisable, just drained.
    // ⚠️ FLOORED. Draining alone took the Hollow Mountains' mid band —
    // already 0x22262c, one of the darkest in the table — to 0.01
    // LINEAR, which is effectively black ground under doubled fog.
    // This project's own rule (§4, the Descent floor) is that a fight
    // you cannot see is not atmospheric, it is broken, and the
    // Nightmare needs that floor more than a Descent does because it
    // is the FIRST thing a new player ever sees.
    //
    // ⚠️ The floor is a LIFT toward a cold grey, not a clamp. Clamping
    // each channel independently would tint whatever was darkest and
    // desaturate the rest, so the darkest bands would come out blue
    // and the bright ones unchanged.
    const FLOOR = 0.055;
    const drain = (c) => {
      const lum = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
      const mix = (v, k) => {
        const drained = (v * 0.22 + lum * 0.78) * k;
        return drained + (FLOOR - drained) * Math.max(0, 1 - drained / FLOOR);
      };
      return new THREE.Color(mix(c.r, 0.62), mix(c.g, 0.64), mix(c.b, 0.78));
    };

    const skin = {
      ...biome,
      name: `${biome.name} — unmade`,
      // ⚠️ Roughness and mountainFactor are RAISED, not replaced. The
      // region keeps its identity (Godgrave is still flat, the Hollow
      // Mountains still vertical) while everything about it gets
      // harsher — which is what "the same place, wrong" means.
      roughness: Math.min(1.4, (biome.roughness || 0.5) * 1.45),
      mountainFactor: Math.min(1.2, (biome.mountainFactor || 0) * 1.2),
      colors: {
        low: drain(biome.colors.low),
        mid: drain(biome.colors.mid),
        high: drain(biome.colors.high),
        peak: drain(biome.colors.peak),
        // ⚠️ CARRIED, NOT DROPPED. This object rebuilds `colors` key by
        // key, so a band added to the palette and not added here is
        // silently lost inside every Nightmare — measured exactly that
        // way: Godgrave's vermilion read `hasAccent: false` on a real
        // chunk while the table said otherwise.
        // ⚠️ DRAINED like the rest, and that is canon rather than a
        // compromise: approaching the Sea of Ash the crimson "loses its
        // colour", turning grey and brittle. A Nightmare's version of
        // the one hot colour SHOULD be the corpse of it.
        ...(biome.colors.accent ? { accent: drain(biome.colors.accent) } : {}),
      },
      fogColor: drain(biome.fogColor),
      // ⚠️ Fog roughly doubled and floored. The horizon closing in is
      // most of what separates a nightmare from a landscape — you
      // should never be able to see the region's far edge from inside
      // one.
      fogDensity: Math.max(0.020, (biome.fogDensity || 0.01) * 2.1),
      ambientLight: 0x0a0b10,
      isNightmare: true,
    };
    this._nmCache.set(biome, skin);
    return skin;
  }

  _getNaturalBiomeAt(x, z) {
    const cx = Math.floor(x / WORLD.CHUNK_SIZE);
    const cz = Math.floor(z / WORLD.CHUNK_SIZE);
    return this.getBiomeForChunk(cx, cz);
  }

  getBiomeForChunk(cx, cz) {
    const dist = Math.sqrt(cx * cx + cz * cz);
    if (dist < 2) return BIOMES[BIOME_TYPES.PLAINS];

    // ══════════════════════════════════════════════════════
    // ⚠️ THE MAP OF THE REALM WINS OVER CLIMATE, ALWAYS.
    //
    // Checked before the Whittaker model below, not after and not
    // blended with it. A named region that noise could override is not
    // a place — it is a tendency, and the whole point of data/realm.js
    // is that Godgrave is somewhere you can be SENT.
    //
    // ⚠️ Tested at the chunk's CENTRE, not its corner. A region border
    // that ran along chunk edges would make the boundary visibly
    // rectangular at exactly the scale the player walks.
    // ══════════════════════════════════════════════════════
    const region = realmRegionAt(
      cx * WORLD.CHUNK_SIZE + WORLD.CHUNK_SIZE * 0.5,
      cz * WORLD.CHUNK_SIZE + WORLD.CHUNK_SIZE * 0.5,
    );
    if (region) {
      const b = this._nightmareSkin(BIOMES[region.biome]);
      // ⚠️ WARN on a miss rather than falling through silently. A
      // region naming a biome that does not exist would otherwise
      // quietly become whatever the climate said, and the map would
      // appear to have a hole in it (trap #11's shape).
      if (b) return b;
      if (!this._warnedRegion) this._warnedRegion = new Set();
      if (!this._warnedRegion.has(region.id)) {
        this._warnedRegion.add(region.id);
        console.warn(`[Realm] region "${region.id}" names unknown biome "${region.biome}" — falling back to climate`);
      }
    }

    // Difficulty ring influences biome class
    const ring = Math.floor(dist / 4); // 0=easy, 1=medium, 2=hard...

    // Temperature & humidity from noise (Minecraft-style Whittaker diagram)
    const scale = 0.04;
    const temp   = (this.tempNoise(cx * scale, cz * scale) + 1) / 2;   // 0-1
    const humid  = (this.humidNoise(cx * scale * 1.3, cz * scale * 1.7) + 1) / 2;
    const cont   = (this.continentNoise(cx * scale * 0.6, cz * scale * 0.6) + 1) / 2;

    // ── Choose biome from climate ────────────────────────
    // ⚠️ `cont` was computed and then read by exactly ONE branch in the
    // whole function (ring<4's Celestial Peaks). A third climate axis
    // that only ever decides one biome is not a third axis — it is a
    // coin flip with extra steps, and it is why neighbouring regions
    // in the same ring so often came out as the same place. Every ring
    // now reads all three, so continentality genuinely separates
    // high/exposed ground from low/sheltered ground the way
    // temperature and humidity separate hot from cold and wet from dry.
    if (ring < 2) {
      // Near start — gentle biomes. Nothing here is above enemyLevel 3;
      // the spawner's distance ramp assumes the first ring is survivable.
      if (temp > 0.72) return BIOMES[BIOME_TYPES.DESERT_RUINS];
      if (temp > 0.56 && cont < 0.45) return BIOMES[BIOME_TYPES.AMBER_STEPPE];
      if (temp < 0.3) return BIOMES[BIOME_TYPES.FROZEN_TUNDRA];
      if (humid > 0.68) return BIOMES[BIOME_TYPES.ENCHANTED_FOREST];
      if (humid > 0.52 && cont < 0.4) return BIOMES[BIOME_TYPES.DROWNED_FLATS];
      // The mining heartland sits close to home, on high dry ground.
      if (cont > 0.6 && humid < 0.56) return BIOMES[BIOME_TYPES.IRON_HILLS];
      return BIOMES[BIOME_TYPES.PLAINS];
    }

    if (ring < 4) {
      if (cont > 0.74) return BIOMES[BIOME_TYPES.CELESTIAL_PEAKS];
      if (cont > 0.665 && humid > 0.44) return BIOMES[BIOME_TYPES.HIGHLAND_KARST];
      if (cont > 0.58 && humid > 0.5) return BIOMES[BIOME_TYPES.STORMWRACK_COAST];
      if (humid > 0.72 && temp > 0.3 && temp < 0.72) return BIOMES[BIOME_TYPES.SUNKEN_MIRE];
      if (cont > 0.56 && humid < 0.42 && temp > 0.38) return BIOMES[BIOME_TYPES.IRON_HILLS];
      if (temp > 0.75) return BIOMES[BIOME_TYPES.VOLCANIC_WASTES];
      if (temp < 0.25) return BIOMES[BIOME_TYPES.FROZEN_TUNDRA];
      if (humid > 0.65) return BIOMES[BIOME_TYPES.LIVING_JUNGLE];
      if (humid < 0.32) return BIOMES[BIOME_TYPES.PETRIFIED_WOOD];
      if (humid > 0.4 && temp > 0.4) return BIOMES[BIOME_TYPES.TWILIGHT_SWAMP];
      return BIOMES[BIOME_TYPES.CRYSTAL_CAVERNS];
    }

    // Far out — dangerous biomes
    if (ring < 7) {
      if (temp < 0.22 && cont > 0.5) return BIOMES[BIOME_TYPES.GLACIER_SHELF];
      if (temp > 0.7 && cont > 0.6) return BIOMES[BIOME_TYPES.ASHEN_CALDERA];
      if (temp > 0.78) return BIOMES[BIOME_TYPES.EMBER_DUNES];
      if (temp > 0.66) return BIOMES[BIOME_TYPES.OBSIDIAN_WASTES];
      if (temp < 0.25) return BIOMES[BIOME_TYPES.ASTRAL_HIGHLANDS];
      if (humid > 0.6) return BIOMES[BIOME_TYPES.BIOLUMINESCENT_GROTTO];
      if (humid > 0.4) return BIOMES[BIOME_TYPES.FUNGAL_WASTES];
      return BIOMES[BIOME_TYPES.DESERT_RUINS];
    }

    // ══════════════════════════════════════════════════════
    // THE REALM — Shadow Slave's regions, in the outer world
    //
    // ⚠️ A biome declared in BIOME_TYPES with a BIOMES entry but NO
    // BRANCH HERE is dead code — it can never be selected and will
    // never appear. That is exactly what FLOATING_ISLANDS has been for
    // the life of the project (see the note in constants.js), and it
    // is the single easiest way to "add a biome" that does nothing.
    //
    // ⚠️ These take the OUTER rings deliberately. The realm is where
    // the world stops being a fantasy wilderness and starts being the
    // thing the story is actually about — reaching it should mean
    // having gone a long way out. Ring 4+ is roughly 256 world units
    // and beyond.
    //
    // ⚠️ Ordered most-distinctive first. `cont` (continentality)
    // separates the vertical places from the drowned ones, which is
    // the axis that actually matters for this set: the Hollow
    // Mountains and the Shore are opposite ends of it.
    // ══════════════════════════════════════════════════════
    // ⚠️ THRESHOLDS TUNED AGAINST A COUNTED DISTRIBUTION, not by eye
    // (trap #3). The first cut used `cont > 0.80` for the Hollow
    // Mountains and produced **1.8%** of the outer world — the biome
    // the owner named FIRST was a curiosity you might never see, while
    // The Verge, a leftover, took 18%. Realm biomes now lead every
    // comparison and the fantasy ones take what is left.
    // ⚠️ ORDER DECIDES EXISTENCE, and one ordering here produced a
    // biome with a **0% share across three seeds**. With Godgrave
    // testing `temp > 0.46` before the Pit's `humid < 0.44`, the Pit
    // could only fire in the 2%-wide band `temp ∈ [0.44, 0.46]` — it
    // was declared, defined, branched, and still unreachable. Each
    // condition below now leads on the axis that biome OWNS, so no
    // later test can be starved by an earlier one:
    //   Hollow Mountains — highest continentality
    //   Forgotten Shore  — lowest continentality
    //   Bottomless Pit   — driest
    //   Godgrave         — hottest
    //   Dreaming City    — coldest
    // ⚠️ Verify with a counted sweep over several seeds after ANY edit
    // here, never by reading the branches (trap #3).
    if (cont > 0.68) return BIOMES[BIOME_TYPES.HOLLOW_MOUNTAINS];
    if (cont < 0.30) return BIOMES[BIOME_TYPES.FORGOTTEN_SHORE];
    if (humid < 0.34) return BIOMES[BIOME_TYPES.BOTTOMLESS_PIT];
    if (temp > 0.52) return BIOMES[BIOME_TYPES.GODGRAVE];
    if (temp < 0.42) return BIOMES[BIOME_TYPES.DREAMING_CITY];
    if (cont > 0.64) return BIOMES[BIOME_TYPES.THE_VERGE];
    if (temp > 0.6) return BIOMES[BIOME_TYPES.CRIMSON_RIFT];
    return BIOMES[BIOME_TYPES.SHADOW_REALM];
  }

  _hash(x, z) {
    let h = this.seed;
    h = ((h << 5) + h + x) | 0;
    h = ((h << 5) + h + z) | 0;
    h = ((h << 5) + h + (x * 374761393)) | 0;
    h = ((h << 5) + h + (z * 668265263)) | 0;
    return h;
  }
}
