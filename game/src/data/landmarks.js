// ══════════════════════════════════════════════════════════
// Landmarks — fixed, named, story-linked places
//
// Everything ChunkManager placed before this (camp/stall/shrine/
// smithy/dungeon/graveyard, trees, rocks) is INFINITE-WORLD scatter —
// deterministic per chunk, but which chunk gets which is a hash, not
// a decision. That's correct for filling an endless wilderness, and
// it is exactly why the world never felt like an RPG: nothing in it
// was ever placed on purpose. A quest that says "go kill the wraith"
// with no wraith anywhere in particular is a stat, not a destination.
//
// A landmark is the opposite: ONE fixed (cx, cz, x, z) — the same
// chunk-relative coordinate scheme LORE_SPAWN_CHUNKS in ChunkManager.js
// already uses for found-journal placement — built once, in the same
// place, every time the world is generated from this seed. Quests
// point at these. The compass (see main.js) measures distance to
// these. The discovery banner (Events.LANDMARK_DISCOVERED) fires once
// per landmark, the first time its chunk loads.
//
// Both current landmarks sit outside WORLD.RENDER_DISTANCE of the hub
// on purpose — the hub's own "Sanctuary Override" radius is 2.5
// chunks (160 world units), so nothing genuinely outside the walls
// can be closer than that regardless of where it's placed. That
// distance is the point: these are places you travel TO, not detail
// dressing next to spawn.
// ══════════════════════════════════════════════════════════

export const LANDMARKS = {
  // Ties to: mq4 "The Buried Shard" (delve beneath the fields for a
  // Mithril Core fragment), sq2 "What the Golems Guard", and the
  // 'foundation_masons_log' lore fragment ("We laid the Sanctuary's
  // foundations over something already built... whatever raised the
  // golems down there raised them to keep something in"). All three
  // were previously unconnected — a gather quest with no source, a
  // kill quest with no place, a journal entry about a location that
  // didn't exist. This is that location.
  sunkenFoundations: {
    id: 'sunken_foundations',
    name: 'The Sunken Foundations',
    cx: 2, cz: 2, x: -8, z: 6,
    discoverMsg: 'You have discovered The Sunken Foundations.',
    // Quest ids whose target this is, for the compass (see main.js).
    quests: ['mq4'],
  },

  // Ties to: mq6 "The Unmoored" (hunt Vell). Vell used to be forged
  // at a random ring around the PLAYER'S current position the moment
  // mq6 activated — wherever you happened to be standing became "the
  // wraith's location," which is not a location at all. Now Vell is
  // forged here, once, and the quest actually means "go to this
  // place," the way a real RPG quest does.
  vellsHollow: {
    id: 'vells_hollow',
    name: "Vell's Hollow",
    cx: -3, cz: -3, x: 10, z: -6,
    discoverMsg: "The air changes before you see it. You have found Vell's Hollow.",
    quests: ['mq6'],
  },
  // ── Added this session: three places built purely so the world has
  // somewhere to GO. The two above exist because a quest needed a
  // destination; these three exist the other way round — a place
  // first, with the story already written into what's standing there.
  // All three sit well outside the hub's 2.5-chunk Sanctuary override
  // (160 units) so arriving at one is a journey, not a glance.

  // The literal ground-level counterpart to the sky rift added to
  // Atmosphere.js's SKY_FRAG. The game is called The Fracture and the
  // sky finally shows one; the GROUND never did. Deliberately NOT a
  // carved chasm: getGroundY() is the single most performance-critical
  // function in the game and the analytic ground truth every entity's
  // gravity and collision reads from — a mesh that disagreed with it
  // would leave the player floating over the hole or falling through
  // its lip. This is a terrain-CONFORMING emissive ribbon that samples
  // getGroundY() along its own jagged path and floats a few
  // centimetres above the real walkable surface, so the wound is
  // visible and walkable-over and the height field never lies.
  theScar: {
    id: 'the_scar',
    name: 'The Scar',
    cx: -2, cz: 4, x: 14, z: -18,
    discoverMsg: 'The ground here is split the same way the sky is. You have found The Scar.',
    quests: [],
  },

  // Where the Sanctuary stopped burying its over-attuned and started
  // just leaving them. Backs Ostra's whole warning ("cast enough of
  // one essence and it stops being a choice") and the recurring lore
  // thread that attunement erodes the person inside it — a graveyard
  // whose markers are all Pioneers, ringed by monoliths that were
  // supposed to hold something and clearly no longer do.
  hangedChoir: {
    id: 'hanged_choir',
    name: 'The Hanged Choir',
    cx: 4, cz: -3, x: -12, z: 20,
    discoverMsg: 'Every marker here has a Pioneer\'s name on it. You have found The Hanged Choir.',
    quests: [],
  },

  // The Fracture's edge MOVES — it tracks toward wherever Pioneers are
  // thickest (see the lore fragments). A watchpost the Sanctuary built
  // to sit ON the old edge, now stranded a long way inside it, still
  // manned by nobody. The one landmark that is architecture rather
  // than landscape.
  drownedWatch: {
    id: 'drowned_watch',
    name: 'The Drowned Watch',
    cx: -4, cz: 1, x: 6, z: 14,
    discoverMsg: 'A watchpost built to look at an edge that has since walked past it. You have found The Drowned Watch.',
    quests: [],
  },
};


/** World-space {x, z} for a landmark, given the chunk size constant. */
export function landmarkWorldPos(landmark, chunkSize) {
  return { x: landmark.cx * chunkSize + landmark.x, z: landmark.cz * chunkSize + landmark.z };
}

/** First landmark (if any) registered against a given quest id. */
export function landmarkForQuest(questId) {
  for (const l of Object.values(LANDMARKS)) {
    if (l.quests?.includes(questId)) return l;
  }
  return null;
}
