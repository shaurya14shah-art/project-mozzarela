// ══════════════════════════════════════════════════════════
// natureModels — the photoscanned prop roster
//
// Mirrors the roster in tools/fetch-polyhaven-models.mjs. Kept as data
// rather than inferred from a directory listing because the browser
// cannot list a directory — the game has to know what to ask for.
//
// Every entry is CC0 from Poly Haven, decimated from scan density
// (up to ~98k triangles) to a game budget by that tool. See
// public/hd/nature/LICENSE.txt for provenance.
//
// `targetHeight` matters more than it looks. These are photogrammetry
// scans exported at REAL WORLD SCALE — a Poly Haven boulder is
// genuinely five metres across. Dropped into the world unscaled they
// dwarf the player (eye height 1.62m). Every model is therefore
// measured at instantiation and scaled to the height below, the same
// measure-then-derive approach EntityForge uses for the KayKit rigs.
//
// A RANGE, not a single value: `[min, max]` is sampled per instance so
// a field of boulders has real size variation rather than being one
// asset repeated at one size.
// ══════════════════════════════════════════════════════════

export const NATURE_MODELS = {
  // ── Boulders & rocks ────────────────────────────────────
  // Replace forgeRock(). Height range is deliberately wide: the same
  // five scans covering 0.6m stones through 3.5m boulders reads as far
  // more variety than five shapes at one scale.
  rock: [
    { slug: 'boulder_a', targetHeight: [1.2, 3.4] },
    { slug: 'boulder_b', targetHeight: [1.0, 3.0] },
    { slug: 'boulder_c', targetHeight: [1.1, 3.2] },
    { slug: 'boulder_d', targetHeight: [0.9, 2.8] },
    { slug: 'rock_a',    targetHeight: [0.5, 1.4] },
    { slug: 'rocks_a',   targetHeight: [0.6, 1.8] },
    { slug: 'stones_a',  targetHeight: [0.35, 0.9] },
  ],

  // ── Dead trees — the dark-fantasy silhouette ────────────
  deadTree: [
    { slug: 'deadtree_a', targetHeight: [3.0, 6.5] },
    { slug: 'deadtree_b', targetHeight: [3.2, 7.0] },
    { slug: 'deadtree_c', targetHeight: [2.8, 6.0] },
    { slug: 'stump_a',    targetHeight: [0.6, 1.3] },
    { slug: 'stump_b',    targetHeight: [0.5, 1.1] },
  ],

  // ── Living trees ────────────────────────────────────────
  tree: [
    { slug: 'tree_a', targetHeight: [4.0, 8.0] },
    { slug: 'tree_b', targetHeight: [4.5, 9.0] },
  ],

  // ── Ground detail ───────────────────────────────────────
  debris: [
    { slug: 'roots_a',    targetHeight: [0.3, 0.7] },
    { slug: 'branches_a', targetHeight: [0.25, 0.6] },
    { slug: 'debris_a',   targetHeight: [0.15, 0.35] },
    { slug: 'shrub_a',    targetHeight: [0.4, 1.0] },
    { slug: 'shrub_b',    targetHeight: [0.4, 1.0] },
  ],

  // ── Landmarks — rare, placed not scattered ──────────────
  landmark: [
    { slug: 'cliff_a', targetHeight: [6.0, 14.0] },
    { slug: 'firepit', targetHeight: [0.7, 1.0] },
    { slug: 'fort',    targetHeight: [5.0, 9.0] },
  ],
};

/** Flat list of every slug, for the loader. */
export const NATURE_SLUGS =
  Object.values(NATURE_MODELS).flat().map(m => m.slug);

/** Where preloadExternal() fetches them from. */
export const NATURE_BASE_URL = 'hd/nature';
