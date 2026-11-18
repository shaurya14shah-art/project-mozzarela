// ══════════════════════════════════════════════════════════
// Game Constants & Configuration
// ══════════════════════════════════════════════════════════

export const GAME = {
  TICK_RATE: 60,
  FIXED_TIMESTEP: 1 / 60,
  MAX_DELTA: 0.1,
};

export const WORLD = {
  CHUNK_SIZE: 64,
  // 24 → (24+1)² = 625 verts/chunk — under half of the 32 setting's
  // 1089. In first person you're never more than a stride from the
  // ground, close enough to see every vertex of it, but the game was
  // still reported as "extremely slow" at 32 — this is the next real
  // cut, not a cosmetic one.
  CHUNK_RESOLUTION: 24,
  // 2 = a 5×5 grid = 25 chunks loaded at once. 1 = 3×3 = 9 — a further
  // 64% cut on top of that. Atmosphere.setDrawDistance() (called from
  // ChunkManager.init) pulls the fog in to match, so the smaller world
  // edge is masked rather than visible as chunks popping in and out.
  RENDER_DISTANCE: 1,
  TERRAIN_HEIGHT_SCALE: 32,
  TERRAIN_NOISE_SCALE: 0.006,
  TERRAIN_OCTAVES: 6,
  SPAWN_POSITION: { x: 0, y: 0, z: 0 },
  DIFFICULTY_RING_SIZE: 200,
};

// ══════════════════════════════════════════════════════════
// PACE — the realism pass's one tempo table (owner: "keep it slow
// paced… take inspiration from the RŌNIN game").
//
// RŌNIN walks at 4.0 m/s and runs at 6.6 (FirstPersonController.ts);
// its rivals hold a step out and telegraph before they cut. Mozzarela
// jogged at 5.2 and sprinted at 8.3, with creature wind-ups as short as
// 0.22 s — a frame-perfect dodge game, not a weighty one.
//
// Every tempo change lives HERE as a factor, read at the point of use,
// so the pace can be tuned in one place and reverted in one place.
//   enemySpeed   ×  creature movement speed
//   windup       ×  how long a creature telegraphs before it strikes
//   recover      ×  how long it is open after striking
//   enemyCooldown ×  time between its attacks
//   playerSwing  ×  the player's own swing cooldown
//   spawnInterval ×  seconds between ambient spawns
// ══════════════════════════════════════════════════════════
export const PACE = {
  enemySpeed:    0.80,
  windup:        1.55,
  recover:       1.45,
  enemyCooldown: 1.25,
  playerSwing:   1.15,
  spawnInterval: 1.40,
};

export const PLAYER = {
  // ══════════════════════════════════════════════════════
  // ⚠️ 8 → 5.2. Owner: *"the game is also a bit too fast paced,
  // doesn't feel like a game nor real life."*
  //
  // 8 m/s is a REAL NUMBER and it was far outside human range: a brisk
  // human walk is ~1.4 m/s, a jog ~3, a trained sprint ~7, and the
  // 100m world record averages ~10.4. So the player was permanently
  // moving faster than an Olympic sprinter, and SPRINT_MULTIPLIER took
  // that to 12.8 m/s — 23% faster than any human has ever run, held
  // indefinitely, while looking at scenery built at human scale.
  //
  // That mismatch is most of the "too fast" feeling, and it compounds
  // everything else: the world streams past faster than chunks can
  // establish themselves, landmarks arrive before they can be read,
  // and buildings sized in real metres flick by like set dressing.
  //
  // 5.2 is a fast jog — still unmistakably a game and not a walking
  // simulator — and 5.2 × 1.6 = 8.3 m/s sprinting, which is hard,
  // athletic, and finally on the map of things a person can do.
  // ⚠️ Not lowered further: the world is 64-unit chunks with
  // landmarks hundreds of units apart, and crossing it has to stay
  // viable. This is a feel change, not a difficulty one.
  // ══════════════════════════════════════════════════════
  // ⚠️ REALISM PASS: 5.2 → 4.0 and ×1.6 → ×1.65, RŌNIN's walk (4.0)
  // and run (6.6). The history above still holds — 8 was absurd — and
  // this is the next step the owner asked for: slow, deliberate.
  MOVE_SPEED: 4.0,
  SPRINT_MULTIPLIER: 1.65,
  // Exponential ease rates (1 - e^-rate*dt per frame): 32 reaches ~90%
  // of target speed in ~70ms (snappy — not an instant single-frame
  // teleport to full speed), 21 settles to a stop in ~110ms (a hint of
  // weight, not floaty). Frame-rate independent by construction.
  // Heavier (32/21 → 18/12): ~130 ms to full stride, ~190 ms to settle.
  // A body with weight, which is most of what RŌNIN's movement has.
  MOVE_ACCEL_RATE: 18,
  MOVE_DECEL_RATE: 12,
  JUMP_FORCE: 10,
  GRAVITY: -25,
  HEIGHT: 1.8,
  RADIUS: 0.4,
  // ⚠️ 100 → 160. Owner: *"the health is too low... they nearly one
  // shot me."* Measured against what the game actually sends: a level-2
  // creature hits for 23 (21 after a bare Pioneer's 8% reduction), and
  // NINE of them spawn around a trial. At 100 HP that is five hits from
  // a pack that surrounds you — and the player has no weapon Memory and
  // one wand charge at that point.
  //
  // ⚠️ Raised rather than nerfing the enemies globally, because the
  // enemy numbers are correct for a Pioneer WITH gear; the problem is
  // only the opening, where they have none. A global enemy nerf would
  // make the whole midgame limp to fix ten minutes of it.
  MAX_HP: 160,
  MAX_MP: 80,
  MAX_STAMINA: 100,
  STAMINA_REGEN: 15,
  STAMINA_SPRINT_COST: 20,
  ATTACK_RANGE: 2.5,
  ATTACK_COOLDOWN: 0.5,
};

// First-person: the camera IS the player's head now, not a rig
// orbiting behind them. Nothing here manages distance or lock-on
// anymore — there is no orbit to manage, which is most of the point.
export const CAMERA = {
  // Wider than a realistic lens on purpose — first person reads as
  // claustrophobic well before 90°, and a wide FOV also means less of
  // the screen is spent rendering things at grazing, expensive angles.
  FOV: 88,
  SPRINT_FOV: 100,        // a wider FOV under sprint reads as speed without an actual camera dolly
  // Slower ease = a gradual, buttery widen instead of a snap the eye
  // catches. Halved from the old rate specifically for that "smoother"
  // feel, at the cost of a few extra frames to settle — worth it.
  FOV_EASE: 4.5,

  EYE_HEIGHT: 1.62,       // above player.position.y (feet, from the ground raycast)
  SENSITIVITY: 0.0022,

  // Pitch is a real look angle now (not a clamped orbit elevation), so
  // the range is generous — but stops short of straight up/down, where
  // yaw becomes meaningless and mouse look gets disorienting.
  PITCH_MIN: -1.35,
  PITCH_MAX: 1.35,

  // Head bob — footfall rhythm. Amplitude is eased in/out via the
  // controller's own envelope rather than snapping with movement.
  BOB_WALK_FREQ: 9,
  BOB_WALK_AMP: 0.035,
  BOB_RUN_FREQ: 13.5,
  BOB_RUN_AMP: 0.065,
  BOB_SIDE_AMP: 0.02,
  BOB_ENVELOPE_RATE: 10,

  // Idle breathing sway — small on purpose. This is the "serene" bit:
  // standing still should feel calm and alive, not perfectly frozen,
  // but never enough to read as camera drift.
  IDLE_SWAY_FREQ: 0.55,
  IDLE_SWAY_AMP: 0.008,

  // A landing harder than this (downward velocity, m/s) earns a shake.
  LAND_SHAKE_VELOCITY: 9,
};

export const COMBAT = {
  BASE_ATTACK_SPEED: 1.0,
  CRIT_CHANCE: 0.05,
  CRIT_MULTIPLIER: 2.0,
  DODGE_STAMINA_COST: 20,
  DODGE_I_FRAMES: 0.3,
  PARRY_WINDOW: 0.2,
  COMBO_WINDOW: 0.8,
};

// ── WAND SYSTEM ──────────────────────────────────────────
export const WAND = {
  SPELL_SLOTS: 3,        // infusion slots at level 1
  SLOT_SCALING: [        // [minLevel, slots]
    [0, 3],
    [6, 4],
    [12, 5],
    [20, 6],
  ],
  FIRE_COOLDOWN: 0.45,   // seconds between casts
  BASE_POWER: 1.0,       // power multiplier at lv1
  LEVEL_POWER_STEP: 0.05,// added per player level

  // Channelling — hold to cast to charge the spell up.
  CHANNEL_TIERS: [
    { id: 'quick',  name: 'Quick',       minHold: 0.00, damage: 1.00, radius: 1.00, charges: 1, mana: 1.0 },
    { id: 'focus',  name: 'Focused',     minHold: 0.55, damage: 1.60, radius: 1.35, charges: 1, mana: 1.6 },
    { id: 'over',   name: 'Overcharged', minHold: 1.30, damage: 2.40, radius: 1.80, charges: 2, mana: 2.6 },
  ],
  MAX_CHANNEL: 1.5,      // seconds to reach full charge

  // A spell whose charges run out isn't lost — it goes Dim.
  DIM_DAMAGE_MULT: 0.55,
  DIM_MANA_MULT: 2.0,

  // Elemental residue left on a struck target, for reactions.
  RESIDUE_DURATION: 4.0,
};

// ── BREWING SYSTEM ───────────────────────────────────────
export const BREWING = {
  CAULDRON_SLOTS: 4,     // up to 4 ingredients per brew
  MIN_INGREDIENTS: 2,    // fewest that will resolve to a spell
  // How balanced the top two elements must be to fuse.
  // 0.6 = the runner-up needs at least 60% of the leader's weight.
  FUSION_BALANCE: 0.6,
};

export const ELEMENTS = {
  FIRE: 'fire',
  WATER: 'water',
  EARTH: 'earth',
  WIND: 'wind',
  LIGHTNING: 'lightning',
  SHADOW: 'shadow',
  LIGHT: 'light',
  VOID: 'void',
  NEUTRAL: 'neutral',
  ICE: 'ice',
  POISON: 'poison',
  ARCANE: 'arcane',
};

// Element affinities for visual theming
export const ELEMENT_COLORS = {
  fire:      '#ff5520',
  water:     '#2299ff',
  earth:     '#88aa44',
  wind:      '#aaffee',
  lightning: '#ffee00',
  shadow:    '#8822cc',
  light:     '#ffffaa',
  void:      '#cc44ff',
  neutral:   '#aaaaaa',
  ice:       '#88ddff',
  poison:    '#88ff44',
  arcane:    '#cc88ff',
};

export const MATERIAL_TIERS = {
  COMMON:    { name: 'Common',    level: 1, color: '#a0a0a0', dropRate: 0.5  },
  UNCOMMON:  { name: 'Uncommon',  level: 2, color: '#40c060', dropRate: 0.3  },
  RARE:      { name: 'Rare',      level: 3, color: '#4080f0', dropRate: 0.12 },
  EPIC:      { name: 'Epic',      level: 4, color: '#a040e0', dropRate: 0.05 },
  LEGENDARY: { name: 'Legendary', level: 5, color: '#f0a020', dropRate: 0.02 },
  MYTHIC:    { name: 'Mythic',    level: 6, color: '#ff4080', dropRate: 0.008 },
  UNKNOWN:   { name: '???',       level: 7, color: '#00ffff', dropRate: 0.002 },
};

export const BIOME_TYPES = {
  ENCHANTED_FOREST:       'enchanted_forest',
  VOLCANIC_WASTES:        'volcanic_wastes',
  CRYSTAL_CAVERNS:        'crystal_caverns',
  FLOATING_ISLANDS:       'floating_islands',
  FROZEN_TUNDRA:          'frozen_tundra',
  DESERT_RUINS:           'desert_ruins',
  TWILIGHT_SWAMP:         'twilight_swamp',
  SHADOW_REALM:           'shadow_realm',
  CELESTIAL_PEAKS:        'celestial_peaks',
  LIVING_JUNGLE:          'living_jungle',
  PLAINS:                 'plains',
  OBSIDIAN_WASTES:        'obsidian_wastes',
  BIOLUMINESCENT_GROTTO:  'bioluminescent_grotto',
  CRIMSON_RIFT:           'crimson_rift',
  FUNGAL_WASTES:          'fungal_wastes',
  ASTRAL_HIGHLANDS:       'astral_highlands',
  // ── Added terrain ──
  // ⚠️ A new biome is THREE edits, not one: an id here, a definition in
  // BiomeManager's BIOMES table, and a branch in getBiomeForChunk().
  // A type declared here with no BIOMES entry is simply dead — which is
  // what FLOATING_ISLANDS below has always been (declared, never
  // defined, never selected). It is left in place rather than removed
  // because it needs real floating-island terrain generation, not a
  // table row; see HANDOFF §7.
  AMBER_STEPPE:           'amber_steppe',
  DROWNED_FLATS:          'drowned_flats',
  STORMWRACK_COAST:       'stormwrack_coast',
  PETRIFIED_WOOD:         'petrified_wood',
  GLACIER_SHELF:          'glacier_shelf',
  EMBER_DUNES:            'ember_dunes',
  THE_VERGE:              'the_verge',
  // ── The world expansion (data/expansion.js) ──
  IRON_HILLS:             'iron_hills',
  SUNKEN_MIRE:            'sunken_mire',
  HIGHLAND_KARST:         'highland_karst',
  ASHEN_CALDERA:          'ashen_caldera',

  // ══════════════════════════════════════════════════════════
  // THE REALM — biomes after Shadow Slave's Dream Realm
  //
  // Owner: *"make it replicate all the biomes of the realm in Shadow
  // Slave like the Hollow Mountains, Godgrave, etc."*
  //
  // ⚠️ These are NOT reskins of the fantasy biomes above. That setting's
  // realm has one consistent logic and it is the opposite of this
  // table's: nothing is verdant, nothing is enchanted, and every region
  // is the CORPSE of something enormous. A Shadow Slave biome is
  // defined by what died there and how big it was.
  //
  // ⚠️ Each is separated by terrain SHAPE first and palette second —
  // §4's rule. A biome that only recolours the same hills is not a new
  // place, and these are the most distinct shapes in the table:
  // Godgrave is nearly FLAT (0.30 height, 0.10 roughness), the Hollow
  // Mountains are the most vertical thing in the game (2.4 height,
  // 1.0 mountain), and the Forgotten Shore sits almost at sea level.
  // ══════════════════════════════════════════════════════════
  GODGRAVE:               'godgrave',
  HOLLOW_MOUNTAINS:       'hollow_mountains',
  FORGOTTEN_SHORE:        'forgotten_shore',
  DREAMING_CITY:          'dreaming_city',
  BOTTOMLESS_PIT:         'bottomless_pit',
};
