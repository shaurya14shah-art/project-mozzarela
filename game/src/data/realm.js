// ══════════════════════════════════════════════════════════
// THE MAP OF THE REALM
//
// Owner: *"please don't work without making the entire map of the
// realm first"* — and they were right to insist. Until this file the
// five realm biomes were selected by CLIMATE NOISE, which means they
// had no locations: Godgrave was a statistical tendency, not a place.
// You could not be told where it was, could not navigate to it, could
// not be spawned into it, and two players could never have talked
// about the same one.
//
// ── WHAT A MAP CHANGES ────────────────────────────────────
// A REGION here is a named place at a fixed world position with a
// radius. That single change makes every downstream feature possible:
//
//   · a First Nightmare can drop you into "the Hollow Mountains" and
//     mean a specific mountain range, the same one every time;
//   · a quest can point at Godgrave and have somewhere to point;
//   · the player can be told where they are and believe it;
//   · leaving one is a real border crossing, not a noise threshold.
//
// ⚠️ THE MAP WINS OVER CLIMATE, ALWAYS. `BiomeManager._getNaturalBiomeAt`
// consults `realmRegionAt()` FIRST and only falls back to the Whittaker
// climate model outside every region. A region that could be overridden
// by noise is not a place, it is a suggestion.
//
// ⚠️ REGIONS ARE FIXED IN WORLD SPACE AND NOT SEEDED. The world seed
// is `Math.random()` per load (trap #45) and randomising the map with
// it would mean Godgrave moved between sessions — which is exactly the
// property that stops it being a location. The TERRAIN inside a region
// still varies with the seed; where the region *is* does not.
//
// ⚠️ Several named places share one biome, deliberately. The Sea of
// Sand and Godgrave are both `godgrave` terrain because they are the
// same kind of country — but they are different PLACES, with different
// names, lore and positions. Ten regions over five terrain types is a
// map; ten terrain types would be a tech demo.
// ══════════════════════════════════════════════════════════

import { BIOME_TYPES } from './constants.js';

/**
 * ⚠️ RADII ARE IN WORLD UNITS AND THEY ARE LARGE ON PURPOSE.
 * A chunk is 64 units. A 900-unit region is ~28 chunks across, which
 * at the player's 5.2 m/s takes about three minutes to walk. That is
 * the smallest a place can be and still feel like somewhere you are
 * IN rather than somewhere you passed. Anything under ~400 reads as a
 * biome patch, which is what this file exists to replace.
 */
// ⚠️ RADII x2.1 AND CENTRES x1.55. Owner: *"the terrain is great, but
// too small, make the terrains bigger."* The first pass sized regions
// at 780–1400 units, which sounded large in source and is about three
// minutes' walk across — you saw a region's far edge from its middle,
// so Godgrave read as a field with bones rather than as country you
// are lost in. Now 1,600–2,900 units: eight to fifteen minutes across
// at 5.2 m/s, and the horizon inside one is the region's own.
//
// ⚠️ CENTRES MOVED TOO, and by less than the radii on purpose. Scaling
// radii alone would have made neighbours overlap — `realmRegionAt`
// resolves that by nearest normalised distance so it would not break,
// but Godgrave and the Sea of Sand would have merged into one
// undifferentiated desert. Verify separation after ANY change here.
export const REALM_REGIONS = [
  // ── THE INNER REALM ──────────────────────────────────────
  // Closest to the waking world, and where a First Nightmare is most
  // likely to open. Survivable, and each one legible at a glance.
  {
    id: 'forgotten_shore',
    name: 'The Bleeding Strand',
    biome: BIOME_TYPES.FORGOTTEN_SHORE,
    x: -3410, z: 2325, radius: 1995,
    // ⚠️ The canonical arrival place. Sleepers wash up here, so the
    // First Nightmare weights it heavily — see `pickNightmareRegion`.
    arrival: true,
    tier: 1,
    blurb: 'Grey water with no horizon, black sand, and the ribs of ships that never made port.',
  },
  {
    id: 'hollow_mountains',
    name: 'The Hushpeaks',
    biome: BIOME_TYPES.HOLLOW_MOUNTAINS,
    x: 3720, z: -2790, radius: 2310,
    arrival: true,
    tier: 1,
    blurb: 'A range bored through by something that did not use tools. The dark inside goes further than the rock.',
  },
  {
    id: 'valley_of_sleep',
    name: 'The Lanternless Vale',
    biome: BIOME_TYPES.DREAMING_CITY,
    x: -2170, z: -4030, radius: 1638,
    arrival: true,
    tier: 1,
    blurb: 'Terraces of dead stone, stepped down and down. Nothing here has woken in a very long time.',
  },

  // ── THE MIDDLE REALM ─────────────────────────────────────
  {
    id: 'godgrave',
    name: 'Gravefall',
    biome: BIOME_TYPES.GODGRAVE,
    x: 6045, z: 4030, radius: 2940,
    // ⚠️ The largest region on the map, and it should be: its whole
    // subject is a skeleton too big to see the end of. A small
    // Godgrave is a contradiction.
    arrival: true,
    tier: 2,
    blurb: 'A god fell here and the sand has been failing to bury it ever since.',
  },
  {
    id: 'sea_of_sand',
    name: 'The Pale Expanse',
    biome: BIOME_TYPES.GODGRAVE,
    x: 8680, z: 930, radius: 2415,
    tier: 2,
    blurb: 'Gravefall without the god. Just the sand, going on past where anyone has bothered to look.',
  },
  {
    id: 'dreaming_city',
    name: 'The Still City',
    biome: BIOME_TYPES.DREAMING_CITY,
    x: -6510, z: -1860, radius: 2520,
    arrival: true,
    tier: 2,
    blurb: 'Built to a scale that assumed something larger than people would live in it.',
  },
  {
    id: 'barren_coast',
    name: 'The Saltwrack Coast',
    biome: BIOME_TYPES.FORGOTTEN_SHORE,
    x: -5580, z: 5270, radius: 1890,
    tier: 2,
    blurb: 'The Shore, further along, where even the wrecks gave up.',
  },

  // ── THE DEEP REALM ───────────────────────────────────────
  // Far out and hostile. Not offered as First Nightmares — see the
  // `arrival` flag and the note on pickNightmareRegion.
  {
    id: 'bottomless_pit',
    name: 'The Maw',
    biome: BIOME_TYPES.BOTTOMLESS_PIT,
    x: 1860, z: 8060, radius: 2100,
    tier: 3,
    blurb: 'The ground stops. What is under it is not more ground.',
  },
  {
    id: 'cold_fortress',
    name: 'Rimehold',
    biome: BIOME_TYPES.HOLLOW_MOUNTAINS,
    x: 8060, z: -6820, radius: 1785,
    tier: 3,
    blurb: 'Something built a wall across the mountains. The wall lost.',
  },
  {
    id: 'bone_crypt',
    name: 'The Marrow Vault',
    biome: BIOME_TYPES.GODGRAVE,
    x: -8990, z: 7130, radius: 1890,
    tier: 3,
    blurb: 'Smaller bones than Gravefall, and far more of them. Something collected these.',
  },
];

/** Fast lookup by id — regions are referenced by id in saves. */
export const REGIONS_BY_ID = Object.fromEntries(REALM_REGIONS.map(r => [r.id, r]));

/**
 * ⚠️ THE BORDER IS SOFT, AND IT HAS TO BE.
 *
 * A hard radius test gives a perfect circle of one terrain against
 * another, which reads as a bug from inside and as a crop circle from
 * a hill. `EDGE_FEATHER` is the width of the band over which a region
 * hands back to the surrounding world; `realmRegionAt` returns the
 * region only past the halfway point of that band, so the biome
 * blender (which samples four points 50 units apart) naturally
 * produces a mixed zone rather than a line.
 *
 * ⚠️ It is a FRACTION of the radius, not a fixed distance. A fixed
 * feather makes small regions all edge and large ones all interior.
 */
const EDGE_FEATHER = 0.22;

/**
 * The region containing a world position, or null.
 *
 * ⚠️ Returns the region whose NORMALISED distance is smallest, not the
 * first one that matches. Regions can overlap (Godgrave and the Sea of
 * Sand are neighbours by design) and "first in the array wins" would
 * make the map depend on declaration order — so a later edit that
 * reorders this file for readability would silently move the border.
 */
export function realmRegionAt(x, z) {
  let best = null;
  let bestN = Infinity;
  for (const r of REALM_REGIONS) {
    const dx = x - r.x, dz = z - r.z;
    const n = Math.sqrt(dx * dx + dz * dz) / r.radius;
    if (n > 1 - EDGE_FEATHER * 0.5) continue;
    if (n < bestN) { bestN = n; best = r; }
  }
  return best;
}

/**
 * How strongly a position belongs to its region, 0..1.
 * 1 deep inside, falling to 0 across the feather band. Used for
 * atmosphere and for the "you have entered X" announcement, which
 * should fire once you are properly inside rather than the instant you
 * clip the edge.
 */
export function realmRegionStrength(x, z) {
  const r = realmRegionAt(x, z);
  if (!r) return { region: null, strength: 0 };
  const dx = x - r.x, dz = z - r.z;
  const n = Math.sqrt(dx * dx + dz * dz) / r.radius;
  const inner = 1 - EDGE_FEATHER;
  const s = n <= inner ? 1 : Math.max(0, 1 - (n - inner) / EDGE_FEATHER);
  return { region: r, strength: s };
}

/**
 * Pick the region a First Nightmare opens into.
 *
 * ⚠️ ONLY `arrival` REGIONS. The deep realm (the Pit, the Cold
 * Fortress, the Bone Crypt) would kill a level-1 Pioneer who has not
 * chosen anything yet, and "your first five minutes are unsurvivable"
 * is not difficulty, it is a broken opening.
 *
 * ⚠️ Takes an explicit `rand` so the caller controls the seed. A
 * character's first Nightmare must be reproducible from their save —
 * calling Math.random() here would re-roll the region every time the
 * save was inspected.
 */
export function pickNightmareRegion(rand = Math.random) {
  const pool = REALM_REGIONS.filter(r => r.arrival);
  return pool[Math.floor(rand() * pool.length) % pool.length];
}

/**
 * A point well inside a region, for spawning.
 *
 * ⚠️ Never the exact centre. Godgrave's centre is where the skull is,
 * and materialising inside a landmark is the worst possible first
 * frame. 0.35–0.62 of the radius puts the player in open country with
 * the region's features visible around them rather than through them.
 */
export function regionSpawnPoint(region, rand = Math.random) {
  const a = rand() * Math.PI * 2;
  const d = region.radius * (0.35 + rand() * 0.27);
  return { x: region.x + Math.cos(a) * d, z: region.z + Math.sin(a) * d };
}
