// ══════════════════════════════════════════════════════════
// THE FACET GRAMMAR — how an active skill is made, named and numbered
//
// Owner: *"create a new system on how skills are made, named and their
// attributes based on how the current mechanic is based on… a new
// animation unique to each weapon and each skill, no overlaps, no
// monotonous remakes."*
//
// The old system was a fixed list of ~70 hand-written templates
// (data/memories.js ABILITY_POOLS) picked by the sign you drew, with
// numbers scaled by one magnitude and a name glued from an adjective and
// the template's verb. A scythe and a warhammer drew from the same list,
// and many actives shared one generic animation.
//
// An active Facet is now COMPOSED from the same inputs the forge already
// reads — nothing new is asked of the player:
//
//   MOTION     ← the weapon type. Five per weapon, written for THAT
//                weapon (a scythe hooks and reaps, a hammer drops and
//                tolls, a bow draws and looses). It decides the delivery
//                (how the skill reaches) and its own keyframed animation.
//   TRAIT      ← the sign's TEMPER family (pierce / spread / move / ward /
//                call / shift / strike). A rule on top of the motion, and
//                a layer on top of its animation.
//   ELEMENT    ← the Remnant's element. A status, and an epithet.
//   ATTRIBUTE  ← the sign's attribute. The stat profile.
//   MAGNITUDE  ← how committed the sign was, 1..6. Overall power.
//
// NAME = parts that are actually in the skill (element epithet, trait
// word, motion name, attribute title). COST and COOLDOWN are computed
// from the skill's real power budget, not copied from a row. The result
// is a plain `spec` that systems/FacetCaster.js executes and
// rendering/Choreo.js (SKILLS) animates — one executor for every composed
// skill, so a new motion is data, not a new switch branch.
// ══════════════════════════════════════════════════════════

/**
 * Deliveries — how a skill reaches. The executor implements each once.
 *   arc     a cut in front: radius + arc width (degrees)
 *   ring    all round you: radius
 *   line    straight down the aim: range + width
 *   point   the single nearest thing in front within range
 *   leap    travel `dash` metres, then strike round where you land
 *   dash    travel `dash` metres, striking everything on the path
 *   volley  `shots` projectiles in a fan of `spread` degrees
 *   target  strike round the point you aim at, `range` away
 *   pull    drag everything within radius toward you, then cut
 *   self    a ward on yourself (iframes / mending), radius pulse
 */

const M = (id, name, phrase, delivery, base, keys, extra = {}) => ({ id, name, phrase, delivery, base, keys, ...extra });
// Keyframe: t (0..1), p = [dx,dy,dz] offset from the weapon's stance,
// r = [dpitch, dyaw, droll]. `hit` is when the effect lands.
const K = (t, p, r) => ({ t, p, r });

export const MOTIONS = {
  sword: [
    M('rising_cut', 'Rising Cut', 'rips up from the ground through', 'arc',
      { mult: 1.9, radius: 3.1, arc: 110 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.34, [0.16, -0.28, 0.1], [0.9, -0.2, -1.0]), K(0.48, [-0.3, 0.28, -0.24], [-0.7, 0.55, 1.25]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.44 }),
    M('falling_star', 'Falling Star', 'leaps and brings the blade down on', 'leap',
      { mult: 2.3, radius: 2.6, dash: 4.5 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.3, [0.05, 0.42, 0.18], [1.1, 0, 0.1]), K(0.55, [-0.05, -0.32, -0.4], [-1.25, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.55 }),
    M('whirling_edge', 'Whirling Edge', 'turns once on the heel through', 'ring',
      { mult: 1.5, radius: 3.4 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.25, [0.3, -0.05, 0.1], [-0.9, -1.1, -0.2]), K(0.6, [-0.35, -0.08, -0.15], [-0.9, 5.2, 0.2]), K(1, [0, 0, 0], [0, 6.28, 0])], { hit: 0.5 }),
    M('heart_thrust', 'Heart Thrust', 'drives the point straight into', 'line',
      { mult: 2.2, range: 5.5, width: 0.9 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.36, [0.05, 0.02, 0.32], [-0.95, 0.1, -0.2]), K(0.46, [-0.12, 0.08, -0.62], [-0.95, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.44 }),
    M('crossing_cuts', 'Crossing Cuts', 'cuts an X through', 'arc',
      { mult: 1.25, radius: 2.9, arc: 120, hits: 2 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.2, [0.3, 0.2, 0.05], [0.2, -0.4, -0.9]), K(0.36, [-0.3, -0.25, -0.2], [-0.9, 0.5, 1.0]), K(0.5, [-0.25, 0.2, 0.05], [0.2, 0.4, 0.9]), K(0.66, [0.3, -0.25, -0.2], [-0.9, -0.5, -1.0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.36, rehit: 0.66 }),
  ],
  greatsword: [
    M('cleaving_arc', 'Cleaving Arc', 'carries the whole length of the blade across', 'arc',
      { mult: 2.0, radius: 4.0, arc: 200 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.42, [0.45, 0.1, 0.2], [-0.4, -1.4, -0.4]), K(0.56, [-0.5, -0.1, -0.25], [-0.6, 1.5, 0.5]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.5 }),
    M('grave_drop', 'Grave Drop', 'drives the blade into the ground beneath', 'ring',
      { mult: 2.4, radius: 4.2, stagger: 1.0 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.42, [0.0, 0.5, 0.25], [1.2, 0, 0.1]), K(0.54, [0.0, -0.55, -0.45], [-1.7, 0, 0]), K(0.8, [0.0, -0.5, -0.42], [-1.65, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.54 }),
    M('skyward_rend', 'Skyward Rend', 'heaves upward and lifts', 'arc',
      { mult: 2.1, radius: 3.4, arc: 90, stagger: 1.4 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.4, [0.1, -0.5, 0.0], [-1.5, 0.2, 0.6]), K(0.55, [-0.1, 0.45, -0.3], [0.5, -0.1, -0.2]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.5 }),
    M('wheel_of_ruin', 'Wheel of Ruin', 'spins twice, the blade held out, through', 'ring',
      { mult: 1.2, radius: 4.2, hits: 2 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.2, [0.35, -0.1, 0.1], [-1.4, -1.0, 0]), K(0.6, [-0.35, -0.1, -0.1], [-1.4, 7.5, 0]), K(1, [0, 0, 0], [0, 12.56, 0])], { hit: 0.4, rehit: 0.7 }),
    M('pommel_break', 'Pommel Break', 'reverses the sword and smashes the pommel into', 'point',
      { mult: 2.6, range: 2.4, stagger: 1.6 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.3, [0.2, 0.1, 0.3], [2.4, 0, 0]), K(0.42, [0.0, 0.0, -0.4], [2.9, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.42 }),
  ],
  dagger: [
    M('flurry', 'Flurry', 'opens four quick wounds in', 'point',
      { mult: 0.75, range: 2.4, hits: 4 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.15, [0, 0, -0.3], [-0.6, 0, 0]), K(0.25, [0.1, 0, 0.05], [0, 0, 0]), K(0.35, [-0.1, 0.05, -0.3], [-0.6, 0.3, 0]), K(0.45, [0, 0, 0.05], [0, 0, 0]), K(0.55, [0.12, -0.05, -0.3], [-0.6, -0.3, 0]), K(0.65, [0, 0, 0.05], [0, 0, 0]), K(0.75, [0, 0.05, -0.35], [-0.7, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.15, rehit: [0.35, 0.55, 0.75] }),
    M('shadowstep', 'Shadowstep', 'is suddenly behind and under the guard of', 'dash',
      { mult: 2.0, dash: 5.5, width: 1.0 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.25, [0.1, -0.2, 0.25], [-1.2, 0, -0.5]), K(0.5, [-0.15, 0.0, -0.5], [-1.5, 0, 0.3]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.5 }),
    M('fan_of_knives', 'Fan of Knives', 'flicks a fan of blades into', 'volley',
      { mult: 0.9, shots: 5, spread: 40 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.35, [0.25, 0.1, 0.25], [0.3, -0.8, -0.9]), K(0.45, [-0.2, 0.05, -0.2], [-0.8, 0.9, 1.0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.45 }),
    M('hamstring', 'Hamstring', 'drops low and cuts the legs from under', 'arc',
      { mult: 1.4, radius: 2.4, arc: 100, slow: 0.5 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.3, [0.2, -0.45, 0.0], [-0.6, -0.6, -0.6]), K(0.45, [-0.25, -0.5, -0.2], [-1.0, 0.7, 0.6]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.42 }),
    M('reverse_grip', 'Reverse Grip', 'turns the blade back and drags it twice through', 'arc',
      { mult: 1.1, radius: 2.2, arc: 140, hits: 2 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.2, [0.2, 0.1, 0.0], [3.0, -0.4, 0]), K(0.38, [-0.2, 0.0, -0.2], [3.0, 0.6, 0]), K(0.56, [0.2, -0.05, -0.2], [3.0, -0.6, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.38, rehit: 0.56 }),
  ],
  dualblades: [
    M('twin_tempest', 'Twin Tempest', 'becomes a turning storm of edges around', 'ring',
      { mult: 0.8, radius: 3.0, hits: 3 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.15, [0, 0, 0], [-0.5, -0.6, 0]), K(0.85, [0, 0, 0], [-0.5, 18.8, 0]), K(1, [0, 0, 0], [0, 18.85, 0])], { hit: 0.3, rehit: [0.55, 0.8] }),
    M('scissor', 'Scissor', 'closes both blades together on', 'point',
      { mult: 2.6, range: 2.6 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.35, [0, 0.05, 0.15], [-0.4, 0, 0]), K(0.46, [0, 0, -0.45], [-1.3, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.46 }),
    M('blade_dance', 'Blade Dance', 'dances straight through, cutting', 'dash',
      { mult: 1.4, dash: 6.0, width: 1.2, hits: 2 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.25, [0.2, 0.0, 0.1], [-0.6, -0.7, -0.4]), K(0.5, [-0.2, 0.0, -0.3], [-0.6, 0.8, 0.4]), K(0.75, [0.2, 0.0, -0.3], [-0.6, -0.8, -0.4]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.5, rehit: 0.75 }),
    M('crescent_pair', 'Crescent Pair', 'throws two crescents of steel at', 'volley',
      { mult: 1.3, shots: 2, spread: 18 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.35, [0, 0.2, 0.2], [0.5, 0, 0]), K(0.45, [0, -0.15, -0.3], [-1.2, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.45 }),
    M('lacerate', 'Lacerate', 'opens long bleeding lines across', 'arc',
      { mult: 1.0, radius: 2.8, arc: 150, bleed: 1.0 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.3, [0.35, 0.15, 0.1], [-0.2, -0.8, -1.0]), K(0.45, [-0.35, -0.15, -0.15], [-1.0, 0.9, 1.0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.44 }),
  ],
  axe: [
    M('splitting_chop', 'Splitting Chop', 'splits straight down through', 'line',
      { mult: 2.4, range: 3.4, width: 1.1 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.42, [0, 0.45, 0.25], [1.1, 0, 0]), K(0.52, [0, -0.5, -0.45], [-1.7, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.52 }),
    M('hooking_pull', 'Hooking Pull', 'hooks the beard of the axe behind and drags in', 'pull',
      { mult: 1.3, radius: 5.0 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.35, [0.0, 0.1, -0.5], [-1.4, 0, 0]), K(0.6, [0.1, -0.1, 0.35], [-0.2, 0, 0.3]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.6 }),
    M('hurled_axe', 'Hurled Axe', 'sends the axe end over end into', 'volley',
      { mult: 2.0, shots: 1, spread: 0 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.4, [0.1, 0.35, 0.3], [1.2, 0, -0.3]), K(0.5, [-0.05, -0.1, -0.4], [-1.4, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.5 }),
    M('wide_hew', 'Wide Hew', 'hews a wide flat stroke through', 'arc',
      { mult: 1.8, radius: 3.4, arc: 170 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.38, [0.45, -0.1, 0.15], [-1.4, -1.2, -0.1]), K(0.52, [-0.45, -0.1, -0.2], [-1.4, 1.3, 0.1]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.48 }),
    M('earth_breaker', 'Earth Breaker', 'buries the head and cracks the ground under', 'ring',
      { mult: 1.7, radius: 3.6, stagger: 1.0 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.44, [0.05, 0.5, 0.2], [1.3, 0, 0]), K(0.55, [0.0, -0.6, -0.5], [-1.8, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.55 }),
  ],
  warhammer: [
    M('meteor', 'Meteor', 'leaps and comes down like a falling stone on', 'leap',
      { mult: 2.6, radius: 3.4, dash: 5.0, stagger: 1.2 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.42, [0, 0.6, 0.25], [1.4, 0, 0]), K(0.6, [0, -0.7, -0.5], [-1.9, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.6 }),
    M('tremor', 'Tremor', 'sends a tremor through the ground toward', 'line',
      { mult: 1.6, range: 8.0, width: 1.6, stagger: 0.8 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.45, [0.2, 0.4, 0.1], [0.9, 0, 0.3]), K(0.56, [0.05, -0.65, -0.35], [-1.8, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.56 }),
    M('bell_toll', 'Bell Toll', 'rings the head off the skull of', 'point',
      { mult: 3.2, range: 2.8, stagger: 2.0 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.48, [0.5, 0.15, 0.25], [-0.4, -1.5, -0.3]), K(0.58, [-0.25, 0.0, -0.3], [-1.2, 0.8, 0.2]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.58 }),
    M('spinning_mass', 'Spinning Mass', 'lets the weight carry it round through', 'ring',
      { mult: 1.6, radius: 3.6, hits: 2 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.25, [0.4, -0.2, 0.1], [-1.5, -0.8, 0]), K(0.75, [-0.4, -0.2, -0.1], [-1.5, 11.8, 0]), K(1, [0, 0, 0], [0, 12.56, 0])], { hit: 0.45, rehit: 0.72 }),
    M('uppercut', 'Uppercut', 'swings up from the ankle and lifts', 'arc',
      { mult: 2.2, radius: 2.8, arc: 80, stagger: 1.6 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.42, [0.1, -0.6, 0.2], [-1.9, 0, 0.4]), K(0.55, [-0.05, 0.4, -0.35], [0.6, 0, -0.1]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.52 }),
  ],
  spear: [
    M('impaling_line', 'Impaling Line', 'runs the full length of the shaft through', 'line',
      { mult: 2.1, range: 7.0, width: 0.8 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.35, [0.05, 0.0, 0.4], [-0.05, 0, 0]), K(0.46, [-0.05, 0.05, -0.9], [-0.02, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.46 }),
    M('pole_vault', 'Pole Vault', 'plants the butt and vaults down onto', 'leap',
      { mult: 1.9, radius: 3.0, dash: 6.5 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.3, [0.0, -0.4, 0.2], [0.9, 0, 0]), K(0.55, [0.0, 0.4, -0.5], [-0.6, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.6 }),
    M('sweeping_haft', 'Sweeping Haft', 'sweeps the haft round at knee height through', 'ring',
      { mult: 1.3, radius: 4.4, slow: 0.4 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.25, [0.3, -0.3, 0.1], [0.4, -1.0, 0]), K(0.7, [-0.3, -0.3, -0.1], [0.4, 5.6, 0]), K(1, [0, 0, 0], [0, 6.28, 0])], { hit: 0.5 }),
    M('javelin', 'Javelin', 'hurls it the length of a field at', 'volley',
      { mult: 2.6, shots: 1, spread: 0, speedMult: 1.6 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.42, [0.15, 0.3, 0.45], [0.15, 0, -0.1]), K(0.52, [-0.05, 0.1, -0.7], [-0.05, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.52 }),
    M('thousand_points', 'Thousand Points', 'stabs again and again into', 'arc',
      { mult: 0.7, radius: 4.6, arc: 60, hits: 5 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.12, [0, 0, -0.5], [0, 0.1, 0]), K(0.22, [0, 0, 0.2], [0, -0.1, 0]), K(0.32, [0, 0, -0.5], [0, -0.1, 0]), K(0.42, [0, 0, 0.2], [0, 0.1, 0]), K(0.52, [0, 0, -0.5], [0, 0.15, 0]), K(0.62, [0, 0, 0.2], [0, 0, 0]), K(0.72, [0, 0, -0.5], [0, -0.15, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.12, rehit: [0.32, 0.52, 0.72, 0.85] }),
  ],
  scythe: [
    M('harvest', 'Harvest', 'reaps a wide crescent and drinks from', 'arc',
      { mult: 1.8, radius: 4.2, arc: 260, leech: 0.12 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.4, [0.5, 0.1, 0.25], [-0.2, -1.5, 0.2]), K(0.56, [-0.5, -0.1, -0.25], [-0.4, 1.8, 0.1]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.5 }),
    M('hooked_reap', 'Hooked Reap', 'hooks the blade behind and drags in', 'pull',
      { mult: 2.0, radius: 6.0 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.35, [0.1, 0.2, -0.45], [0.4, 0.3, 0]), K(0.62, [0.0, -0.1, 0.35], [-0.6, 0.0, 0.1]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.62 }),
    M('death_wheel', 'Death Wheel', 'whirls the blade overhead and down through', 'ring',
      { mult: 1.4, radius: 4.6, hits: 2 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.2, [0, 0.2, 0], [0.2, 0, 0]), K(0.75, [0, 0.2, 0], [0.2, 12.4, 0]), K(1, [0, 0, 0], [0, 12.56, 0])], { hit: 0.45, rehit: 0.72 }),
    M('crescent_throw', 'Crescent Throw', 'flings a crescent of the blade\'s edge at', 'volley',
      { mult: 1.6, shots: 3, spread: 26 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.38, [0.5, 0.2, 0.2], [-0.2, -1.4, 0.2]), K(0.5, [-0.3, 0.0, -0.2], [-0.4, 1.0, 0.1]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.5 }),
    M('grave_sweep', 'Grave Sweep', 'sweeps low along the ground and lames', 'arc',
      { mult: 1.4, radius: 4.0, arc: 200, slow: 0.55 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.38, [0.5, -0.35, 0.2], [-0.6, -1.4, 0.5]), K(0.55, [-0.5, -0.4, -0.2], [-0.7, 1.6, 0.4]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.5 }),
  ],
  bow: [
    M('piercing_shot', 'Piercing Shot', 'looses one shaft clean through', 'line',
      { mult: 2.4, range: 30, width: 0.6 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.55, [-0.02, 0.0, 0.14], [0.02, 0.0, -0.15]), K(0.62, [0.0, 0.03, -0.1], [-0.08, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.6 }),
    M('rain_of_shafts', 'Rain of Shafts', 'looses high so that it rains on', 'target',
      { mult: 1.5, radius: 4.0, range: 18, hits: 2 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.5, [0, 0.2, 0.12], [0.9, 0, -0.1]), K(0.6, [0, 0.25, -0.1], [0.8, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.75, rehit: 0.9 }),
    M('split_shot', 'Split Shot', 'nocks three and spreads them across', 'volley',
      { mult: 1.2, shots: 3, spread: 24 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.5, [0.0, 0.0, 0.12], [0.0, 0, -0.6]), K(0.6, [0, 0, -0.1], [-0.05, 0, -0.5]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.6 }),
    M('disengage', 'Disengage', 'springs back and looses into', 'volley',
      { mult: 1.6, shots: 1, spread: 0, dash: -5.0 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.3, [0.0, 0.15, 0.3], [0.3, 0, 0]), K(0.6, [0, 0, -0.05], [-0.05, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.6 }),
    M('drawn_breath', 'Drawn Breath', 'holds the draw a long breath and lets it go into', 'point',
      { mult: 3.6, range: 30 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.7, [-0.03, 0.0, 0.2], [0.02, 0, -0.2]), K(0.76, [0, 0.04, -0.12], [-0.12, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.76 }),
  ],
  staff: [
    M('staff_beam', 'Lance of the Staff', 'levels the staff and lets it run through', 'line',
      { mult: 1.9, range: 16, width: 0.9 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.4, [0, 0.1, 0.15], [0.3, 0, 0]), K(0.5, [0, 0, -0.35], [-1.2, 0, 0]), K(0.85, [0, 0, -0.35], [-1.2, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.5 }),
    M('pillar', 'Pillar', 'raises a pillar of it beneath', 'target',
      { mult: 2.0, radius: 3.0, range: 12 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.45, [0, 0.4, 0.05], [0.4, 0, 0]), K(0.55, [0, -0.3, -0.1], [-0.2, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.55 }),
    M('shockwave', 'Shockwave', 'strikes the ground and sends a wave at', 'arc',
      { mult: 1.5, radius: 6.0, arc: 70, knock: 1 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.42, [0, 0.35, 0.15], [0.6, 0, 0]), K(0.52, [0, -0.45, -0.25], [-0.6, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.52 }),
    M('sweep_strike', 'Quarter Sweep', 'swings the staff round like a quarterstaff through', 'ring',
      { mult: 1.4, radius: 3.4, knock: 1 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.25, [0.3, -0.1, 0], [-1.3, -0.9, 0]), K(0.7, [-0.3, -0.1, 0], [-1.3, 5.6, 0]), K(1, [0, 0, 0], [0, 6.28, 0])], { hit: 0.5 }),
    M('surge', 'Surge', 'surges forward behind the staff into', 'dash',
      { mult: 1.6, dash: 7.0, width: 1.4 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.3, [0, 0, 0.2], [-0.9, 0, 0]), K(0.55, [0, 0.05, -0.5], [-1.3, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.55 }),
  ],
  grimoire: [
    M('litany', 'Litany', 'reads a line aloud and it runs through', 'line',
      { mult: 1.8, range: 14, width: 1.0 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.4, [0, 0.15, 0.1], [0.4, -0.2, 0]), K(0.5, [0, 0.1, -0.3], [-0.5, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.5 }),
    M('sigil_ward', 'Sigil Ward', 'closes the book on its own name and is kept from', 'self',
      { mult: 0.0, radius: 3.0, ward: 1.6, mend: 0.12 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.35, [-0.1, 0.25, 0.15], [0.3, 0.6, 0]), K(0.7, [-0.1, 0.25, 0.15], [0.3, 0.6, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.35 }),
    M('scripture_burst', 'Scripture Burst', 'speaks a word where it is looking, and it opens on', 'target',
      { mult: 2.1, radius: 3.4, range: 14 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.42, [0, 0.3, 0.1], [0.5, 0, 0]), K(0.52, [0, 0.0, -0.35], [-0.6, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.52 }),
    M('rending_verse', 'Rending Verse', 'tears a page out and throws it, edged, at', 'volley',
      { mult: 1.1, shots: 4, spread: 34 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.38, [0.2, 0.1, 0.1], [0.2, -0.6, 0.3]), K(0.5, [-0.2, 0.0, -0.2], [-0.4, 0.7, -0.2]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.5 }),
    M('index', 'The Index', 'names everything near, and the names cut', 'ring',
      { mult: 1.3, radius: 5.0 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.4, [0, 0.35, 0.05], [0.6, 0, 0]), K(0.55, [0, 0.35, 0.05], [0.6, 3.14, 0]), K(1, [0, 0, 0], [0, 6.28, 0])], { hit: 0.55 }),
  ],
  // The bare focus — the Crucible's innate skills, with no weapon in hand.
  focus: [
    M('focus_lance', 'Lance', 'points the shard and a line of it runs through', 'line',
      { mult: 2.0, range: 12, width: 0.9 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.4, [0, 0.05, 0.2], [0.4, 0, 0]), K(0.5, [0, 0.05, -0.35], [-0.6, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.5 }),
    M('focus_nova', 'Nova', 'lets the shard break open around', 'ring',
      { mult: 1.6, radius: 4.5 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.45, [-0.1, 0.35, 0.05], [0.9, 0, 0]), K(0.55, [-0.1, 0.4, 0.05], [1.0, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.55 }),
    M('focus_step', 'Step', 'steps through the space between and strikes', 'dash',
      { mult: 1.5, dash: 6.0, width: 1.2 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.3, [0.1, -0.1, 0.25], [0.5, 0, 0]), K(0.55, [-0.1, 0.0, -0.4], [-0.5, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.55 }),
    M('focus_shards', 'Shards', 'casts splinters of the shard at', 'volley',
      { mult: 1.0, shots: 4, spread: 30 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.38, [0.15, 0.1, 0.15], [0.2, -0.5, 0]), K(0.5, [-0.15, 0.05, -0.2], [-0.4, 0.6, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.5 }),
    M('focus_sigil', 'Sigil', 'draws a sign where it looks and the sign opens on', 'target',
      { mult: 1.9, radius: 3.4, range: 12 }, [K(0, [0, 0, 0], [0, 0, 0]), K(0.3, [0.15, 0.2, 0], [0.2, 0, 0.6]), K(0.45, [-0.15, 0.2, 0], [0.2, 0, -0.6]), K(0.55, [0, 0.1, -0.3], [-0.5, 0, 0]), K(1, [0, 0, 0], [0, 0, 0])], { hit: 0.55 }),
  ],
};

/**
 * TRAITS — from the sign's temper family. Each changes the RULES of the
 * skill (stat changes, an added effect) and lays an ANIMATION LAYER over
 * the motion, so the same motion with two traits moves differently.
 */
export const TRAITS = {
  strike: { id: 'strike', word: ['Heavy', 'Plain', 'True'],        rule: {},
    clause: '', layer: { push: 0.0, spin: 0, lift: 0, hold: 0, snap: 1.0 } },
  pierce: { id: 'pierce', word: ['Piercing', 'Through-', 'Needle'], rule: { through: true, bleed: 0.7, rangeMult: 1.25, widthMult: 0.8 },
    clause: 'passes through and leaves them bleeding', layer: { push: 0.26, spin: 0, lift: 0, hold: 0, snap: 1.1 } },
  spread: { id: 'spread', word: ['Scattering', 'Wide', 'Splitting'], rule: { radiusMult: 1.4, arcAdd: 60, multMult: 0.8, shotsAdd: 2 },
    clause: 'splitting wide', layer: { push: 0, spin: 0.6, lift: 0, hold: 0, snap: 0.95 } },
  move:   { id: 'move', word: ['Running', 'Lunging', 'Swift'],      rule: { dashAdd: 3.5 },
    clause: 'arriving on a run', layer: { push: 0.25, spin: 0, lift: -0.1, hold: 0, snap: 1.1 } },
  ward:   { id: 'ward', word: ['Guarded', 'Shielding', 'Steady'],   rule: { ward: 0.8, multMult: 0.9 },
    clause: 'and nothing reaches you while it does', layer: { push: -0.12, spin: 0, lift: 0.08, hold: 0.12, snap: 0.9 } },
  call:   { id: 'call', word: ['Echoing', 'Answered', 'Twice-Told'], rule: { echo: 0.45 },
    clause: 'and a moment later it happens again, fainter', layer: { push: 0, spin: 0, lift: 0.2, hold: 0.08, snap: 1.0 } },
  shift:  { id: 'shift', word: ['Stilling', 'Unmaking', 'Hollow'],  rule: { slow: 0.4, stagger: 0.5 },
    clause: 'and everything it touches is slowed and staggered', layer: { push: 0, spin: -0.3, lift: 0.05, hold: 0.05, snap: 0.85 } },
};

/** Element → status and the epithet it lends a name. */
export const ELEMENT_RULES = {
  fire:      { epithet: ['Ember', 'Burning', 'Pyre'],     status: { burn: 4 },       clause: 'and they burn' },
  ice:       { epithet: ['Rime', 'Frozen', 'Winter'],     status: { slow: 0.45 },    clause: 'and the cold slows them' },
  lightning: { epithet: ['Thunder', 'Storm', 'Arc'],      status: { stagger: 0.7 },  clause: 'and the shock locks them' },
  void:      { epithet: ['Hollow', 'Abyssal', 'Null'],    status: { pull: 1 },       clause: 'and the hollow drags them in' },
  shadow:    { epithet: ['Dusk', 'Shade', 'Umbral'],      status: { ward: 0.4 },     clause: 'and you are not where they look' },
  light:     { epithet: ['Dawn', 'Radiant', 'Hallowed'],  status: { mend: 0.06 },    clause: 'and the light mends you' },
  poison:    { epithet: ['Blight', 'Venom', 'Rot'],       status: { burn: 6 },       clause: 'and the rot keeps eating' },
  earth:     { epithet: ['Stone', 'Granite', 'Iron'],     status: { stagger: 1.0 },  clause: 'and the weight of it staggers' },
  wind:      { epithet: ['Gale', 'Wind', 'Howling'],      status: { knock: 1 },      clause: 'and the wind throws them back' },
  water:     { epithet: ['Tide', 'Drowned', 'Undertow'],  status: { slow: 0.3, mend: 0.04 }, clause: 'and the tide drags at them' },
  arcane:    { epithet: ['Sigil', 'Written', 'Arcane'],   status: { rangeMult: 1.2 }, clause: 'reaching further than it should' },
  neutral:   { epithet: [], status: {}, clause: '' },
};

/** Attribute → stat profile and a title for the name. */
export const ATTRIBUTE_RULES = {
  strength:   { title: ['of Weight', 'of the Heavy Hand', 'of Breaking'],  rule: { multMult: 1.22 },                 clause: 'hits hard' },
  agility:    { title: ['of the Quick', 'of the Blink', 'of Haste'],       rule: { cdMult: 0.75, hitsAdd: 1, multMult: 0.85 }, clause: 'comes back fast' },
  vitality:   { title: ['of Mending', 'of the Long Breath', 'of Blood'],   rule: { leech: 0.1 },                     clause: 'feeds you what it takes' },
  perception: { title: ['of the Seam', 'of the Open Eye', 'of Measure'],   rule: { rangeMult: 1.25, armour: 0.3 },   clause: 'finds the gap in armour' },
  willpower:  { title: ['of Command', 'of the Iron Will', 'of Dominion'],  rule: { radiusMult: 1.3, durMult: 1.4 },  clause: 'holds its grip longer' },
};

// ── Seeded choice ─────────────────────────────────────────
function fmix(h) { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; }
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return fmix(h); }
const pick = (arr, salt) => arr[hash(salt) % arr.length];

/** Temper families the forge reads, mapped to traits (unknowns → strike). */
const FAMILY_TRAIT = { pierce: 'pierce', spread: 'spread', move: 'move', ward: 'ward', call: 'call', shift: 'shift', strike: 'strike' };

/**
 * Compose one active Facet.
 *
 * @param {object} a
 * @param {string} a.seed          forge seed (deterministic)
 * @param {string} a.weaponType    weaponPlanKey form, or 'focus'
 * @param {string} a.attribute     sign attribute id
 * @param {number} a.magnitude     1..6
 * @param {string} a.family        temper family
 * @param {string} a.element
 * @param {Set<string>} [a.avoid]  motion ids already held — never repeat one
 * @param {number} [a.index]
 * @param {string} [a.motionId]    force a motion (the weapon's signature)
 */
export function composeFacet({ seed, weaponType, attribute = 'strength', magnitude = 3, family = 'strike', element = 'neutral', avoid = null, index = 0, motionId = null }) {
  const set = MOTIONS[weaponType] || MOTIONS.sword;
  let motion = motionId ? set.find(m => m.id === motionId) : null;
  if (!motion) {
    const free = avoid ? set.filter(m => !avoid.has(m.id)) : set;
    motion = (free.length ? free : set)[hash(`fm:${seed}:${index}`) % (free.length ? free.length : set.length)];
  }
  const trait = TRAITS[FAMILY_TRAIT[family] || 'strike'];
  const el = ELEMENT_RULES[element] || ELEMENT_RULES.neutral;
  const at = ATTRIBUTE_RULES[attribute] || ATTRIBUTE_RULES.strength;
  const m = Math.max(1, Math.min(6, magnitude | 0));

  // ── Numbers: motion base × trait × attribute × element × magnitude ──
  const R = { ...trait.rule };
  // Multipliers multiply; everything else adds.
  for (const [k, v] of Object.entries(at.rule)) R[k] = k.endsWith('Mult') ? (R[k] ?? 1) * v : (R[k] ?? 0) + v;
  const st = { ...el.status };
  const b = motion.base;
  const magMult = 0.82 + m * 0.09;                       // 0.91 .. 1.36
  const spec = {
    v: 1,
    motion: motion.id, weaponType, trait: trait.id, element, attribute, magnitude: m,
    delivery: motion.delivery,
    mult: +((b.mult || 0) * magMult * (R.multMult || 1)).toFixed(2),
    hits: Math.max(1, (b.hits || 1) + (R.hitsAdd || 0)),
    radius: +((b.radius || 0) * (R.radiusMult || 1) * (1 + (m - 3) * 0.04)).toFixed(2),
    arc: Math.min(360, (b.arc || 0) + (R.arcAdd || 0)),
    range: +((b.range || 0) * (R.rangeMult || 1) * (st.rangeMult || 1)).toFixed(2),
    width: +((b.width || 0) * (R.widthMult || 1)).toFixed(2),
    // A travelling motion travels further with a move trait (backwards stays backwards).
    dash: b.dash ? +(b.dash + Math.sign(b.dash) * (R.dashAdd || 0)).toFixed(2) : 0,
    shots: Math.max(0, (b.shots || 0) + (b.shots ? (R.shotsAdd || 0) : 0)),
    spread: b.spread || 0,
    speedMult: b.speedMult || 1,
    through: !!R.through,
    bleed: +((b.bleed || 0) + (R.bleed || 0)).toFixed(2),
    burn: (st.burn || 0) * (R.durMult || 1),
    slow: Math.max(b.slow || 0, R.slow || 0, st.slow || 0),
    stagger: +((b.stagger || 0) + (R.stagger || 0) + (st.stagger || 0)).toFixed(2),
    knock: (b.knock || 0) + (st.knock || 0),
    pull: (st.pull || 0),
    leech: +((b.leech || 0) + (R.leech || 0)).toFixed(2),
    mend: +((b.mend || 0) + (st.mend || 0)).toFixed(2),
    ward: +((b.ward || 0) + (R.ward || 0) + (st.ward || 0)).toFixed(2),
    echo: R.echo || 0,
    armour: R.armour || 0,
    durMult: R.durMult || 1,
    hit: motion.hit, rehit: motion.rehit ?? null,
  };
  // A move trait on a motion that does not travel: close the distance first.
  spec.preDash = (!b.dash && R.dashAdd) ? R.dashAdd : 0;

  // ── Cost and cooldown from the real power budget ──
  const area = spec.delivery === 'ring' || spec.delivery === 'target' ? 1 + spec.radius * 0.25
    : spec.delivery === 'arc' ? 1 + spec.radius * 0.12 * (spec.arc / 120)
    : spec.delivery === 'line' ? 1 + spec.range * 0.06
    : spec.delivery === 'volley' ? 0.6 + spec.shots * 0.35 : 1;
  const extras = (spec.stagger ? 0.25 : 0) + (spec.slow ? 0.2 : 0) + (spec.bleed || spec.burn ? 0.2 : 0) + (spec.leech ? 0.25 : 0)
    + (spec.ward ? 0.35 : 0) + (spec.echo ? 0.3 : 0) + (spec.dash ? 0.2 : 0) + (spec.mend ? 0.3 : 0);
  const power = Math.max(0.6, spec.mult * spec.hits * area * 0.55 + extras);
  spec.cost = Math.round(6 + power * 3.2);
  spec.cooldown = +Math.max(3, (3.5 + power * 1.9) * (R.cdMult || 1)).toFixed(1);
  // Swing length of the skill's own animation: heavier motions take longer.
  spec.dur = +Math.max(0.55, Math.min(1.6, 0.6 + (b.mult || 1) * 0.18 + (motion.keys.length - 3) * 0.06)).toFixed(2);
  if (attribute === 'agility') spec.dur = +(spec.dur * 0.82).toFixed(2);

  // ── Name: only parts that are really in it ──
  const s = `${seed}:${index}:${motion.id}`;
  const epi = el.epithet.length ? pick(el.epithet, 'e' + s) : null;
  const tw = pick(trait.word, 't' + s);
  const ttl = pick(at.title, 'a' + s);
  const forms = [
    epi && `${epi} ${motion.name}`,
    trait.id !== 'strike' && `${tw}${tw.endsWith('-') ? '' : ' '}${motion.name}`,
    `${motion.name} ${ttl}`,
    epi && `${epi} ${motion.name} ${ttl}`,
    trait.id !== 'strike' && epi && `${tw}${tw.endsWith('-') ? '' : ' '}${epi} ${motion.name}`,
  ].filter(Boolean);
  const name = forms[hash('n' + s) % forms.length].replace('- ', '-');

  // ── Description: what it does, in the numbers it has ──
  const where = {
    arc: `everything in a ${spec.arc}° arc out to ${spec.radius} m`, ring: `everything within ${spec.radius} m`,
    line: `everything along a line ${spec.range} m long`, point: `the nearest thing within ${spec.range} m`,
    leap: `everything within ${spec.radius} m of where you land, ${Math.abs(spec.dash)} m ahead`,
    dash: `everything on a ${Math.abs(spec.dash)} m path`, volley: spec.shots === 1 ? 'whatever it is aimed at' : `whatever is ahead, ${spec.shots} at once fanned ${spec.spread}°`,
    target: `everything within ${spec.radius} m of a point up to ${spec.range} m off`, pull: `everything within ${spec.radius} m`,
    self: 'you',
  }[spec.delivery];
  const bits = [trait.clause, el.clause].filter(Boolean).join(', ');
  const hitTxt = spec.mult > 0 ? ` — ${spec.mult}×${spec.hits > 1 ? `, ${spec.hits} times` : ''}` : '';
  const line = `${motion.phrase[0].toUpperCase()}${motion.phrase.slice(1)} ${where}${hitTxt}${bits ? `, ${bits}` : ''}. Its ${attribute} ${at.clause}.`;

  return {
    key: `f_${motion.id}_${trait.id}`,
    name, line,
    active: true,
    cost: spec.cost, cooldown: spec.cooldown,
    attribute, attributeName: attribute[0].toUpperCase() + attribute.slice(1),
    magnitude: m, element,
    motionId: motion.id,
    spec,
    effect: { [`f_${motion.id}_${trait.id}`]: { mult: spec.mult, n: spec.radius || spec.range, dur: 4, pct: Math.round(spec.leech * 100) } },
  };
}

/** The signature motion each weapon type always opens with. */
export const SIGNATURE_MOTION = {
  sword: 'heart_thrust', greatsword: 'cleaving_arc', dagger: 'flurry', dualblades: 'twin_tempest',
  axe: 'splitting_chop', warhammer: 'meteor', spear: 'impaling_line', scythe: 'harvest',
  bow: 'piercing_shot', staff: 'staff_beam', grimoire: 'litany', focus: 'focus_lance',
};
