// ══════════════════════════════════════════════════════════
// Choreo — every swing, thrust, smash, draw and cast in first person
//
// Owner: *"the animations still are quite similar to before — do a
// complete animation overhaul."*
//
// WHY THE OLD ONES ALL LOOKED ALIKE. WeaponMotion blended between TWO
// poses (wind → strike) with the same easing for every weapon, and a
// Facet was a small offset on top of the stance. Lerping between two
// poses pivots the weapon about the HAND, so every attack read as the
// same flick of the wrist whatever its numbers said.
//
// WHAT REPLACES IT. A clip is a sequence of STROKES, each a real piece
// of body mechanics:
//   cut    — the weapon travels on a true arc about the SHOULDER, the
//            edge leading (the weapon's edge axis is aligned with the
//            direction of travel every frame), accelerating into the
//            impact and decelerating through the follow-through.
//   thrust — extension along the line to the target, snapping out and
//            drawing back.
//   smash  — a cut straight down from behind the head, the camera
//            dipping into it; `jump` lifts first.
//   spin   — the CAMERA turns a full circle while the blade is held
//            out (the body turning), not a weapon twirl.
//   draw   — the bow is raised, drawn, held and loosed with a kick.
//   raise  — a focus or book is lifted and pushed (a casting).
//   guard  — the weapon laid across the body and held.
//   throw  — a whip from over the shoulder that releases forward.
// Between strokes the pose is carried (no snapping back to stance), so a
// combo flows; every impact gets a HITSTOP (a brief freeze, longer for
// heavier weapons) and a camera response along the cut's direction.
//
// The clip is baked at 120 Hz once per (weapon, beat/skill, seed) and
// cached; sampling is a lerp/slerp between two baked frames.
//
// ⚠️ TIMING IS THE ANIMATION'S. `clip.hits` (seconds) are the impact
// frames. The basic swing sets `player.windupFrac` from them per beat,
// and composed Facets pass them to FacetCaster, so damage lands on the
// frame the blade connects — never on a separately-authored number.
//
// SPACE: the viewmodel group (camera-local; x right, y up, -z forward).
// A pose is { h: hand position, q: weapon orientation, cam }. main.js
// places the weapon so its grip sits at `h`.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const D2R = Math.PI / 180;
const UP = V(0, 1, 0);

/** Per-weapon body: weight, edge axis, and the off hand's place on the haft. */
export const PROFILE = {
  sword:      { heavy: 0.30, edge: 'x' },
  greatsword: { heavy: 0.78, edge: 'x', grip2: -0.20 },
  dagger:     { heavy: 0.06, edge: 'x' },
  dualblades: { heavy: 0.14, edge: 'x' },
  axe:        { heavy: 0.62, edge: 'x', grip2: -0.45 },
  warhammer:  { heavy: 0.92, edge: 'x', grip2: -0.54 },
  // One hand: a front hand forward on the shaft dragged the left arm
  // across the whole screen from the left shoulder.
  spear:      { heavy: 0.40, edge: 'x' },
  scythe:     { heavy: 0.58, edge: '-z', grip2: -0.48 },
  bow:        { heavy: 0.20, edge: 'x' },
  staff:      { heavy: 0.42, edge: 'x', grip2: -0.34 },
  grimoire:   { heavy: 0.22, edge: 'x' },
  focus:      { heavy: 0.10, edge: 'x' },
};

// ── Stroke constructors (the choreography language) ───────
// Angles in degrees. `dir` is the direction the weapon TRAVELS across
// the screen: 0 → right, 90 → up, 180 → left, 270 → down.
const cut = (dir, from, to, o = {}) => ({ k: 'cut', dir, from, to, ...o });
const thrust = (o = {}) => ({ k: 'thrust', ...o });
const smash = (o = {}) => ({ k: 'cut', dir: 270, from: 160, to: -62, smash: true, ...o });
const spin = (o = {}) => ({ k: 'spin', ...o });
const draw = (o = {}) => ({ k: 'draw', ...o });
const raise = (o = {}) => ({ k: 'raise', ...o });
const guard = (o = {}) => ({ k: 'guard', ...o });
const toss = (o = {}) => ({ k: 'cut', dir: 290, from: 150, to: -20, toss: true, ...o });
const wait = (dur) => ({ k: 'wait', dur });

// ══════════════════════════════════════════════════════════
// THE BASIC COMBOS — four beats per weapon, none shared.
// ══════════════════════════════════════════════════════════
export const COMBOS = {
  sword: [
    [cut(215, 112, -64, { dur: 0.17 })],                          // high right → low left
    [cut(35, 104, -58, { dur: 0.16, roll: 0.25 })],               // rising backhand
    [cut(180, 96, -84, { dur: 0.17, low: 0.08 })],                // flat, chest high
    [thrust({ dur: 0.30, ext: 1.0, twist: 1.2 })],                // turned thrust
  ],
  greatsword: [
    [smash({ dur: 0.26, reach: 1.1 })],                           // overhead
    [cut(0, 118, -100, { dur: 0.28, low: 0.12, reach: 1.08 })],   // wide L → R
    [cut(225, 128, -78, { dur: 0.27, reach: 1.1 })],              // great diagonal
    [cut(80, 120, -50, { dur: 0.27, reach: 1.05 }), spin({ dur: 0.42, turns: 1, sweep: 'low' })], // rise into a turn
  ],
  dagger: [
    [thrust({ dur: 0.18, ext: 0.85, aim: [0.05, 0.02] })],
    [cut(165, 62, -54, { dur: 0.11, reach: 0.82 })],
    [cut(15, 58, -50, { dur: 0.11, reach: 0.82, roll: -0.4 })],
    [thrust({ dur: 0.14, ext: 0.8, aim: [-0.08, 0.05] }), thrust({ dur: 0.14, ext: 0.8, aim: [0.08, -0.04], twist: -0.9 })],
  ],
  dualblades: [
    [cut(205, 96, -66, { dur: 0.13 })],
    [cut(330, 96, -66, { dur: 0.13, roll: -0.3 })],
    [cut(180, 84, -70, { dur: 0.12 }), cut(0, 70, -84, { dur: 0.12 })],
    [spin({ dur: 0.46, turns: 1 })],
  ],
  axe: [
    [smash({ dur: 0.22, reach: 1.05 })],
    [cut(238, 124, -70, { dur: 0.21 })],
    [cut(180, 108, -92, { dur: 0.22, low: 0.1 })],
    [thrust({ dur: 0.24, ext: 0.62, blade: 'up', aim: [0, 0.08] })], // a shove with the haft
  ],
  warhammer: [
    [smash({ dur: 0.30, reach: 1.12, from: 170 })],
    [cut(180, 120, -96, { dur: 0.32, reach: 1.1 })],
    [cut(90, 128, -42, { dur: 0.30, reach: 1.05 })],              // uppercut from the ankle
    [smash({ dur: 0.32, reach: 1.15, jump: true, from: 175, to: -78 })], // leap and pound
  ],
  spear: [
    [thrust({ dur: 0.24, ext: 1.15 })],
    [thrust({ dur: 0.22, ext: 1.1, aim: [0.06, 0.32] })],          // high
    [cut(180, 100, -100, { dur: 0.26, low: 0.55, reach: 1.05 })],  // haft sweep at the knees
    [thrust({ dur: 0.26, ext: 1.3, lunge: true })],
  ],
  scythe: [
    [cut(180, 124, -122, { dur: 0.29, low: 0.18, reach: 1.1 })],  // the wide reap
    [cut(0, 118, -118, { dur: 0.28, low: 0.1, reach: 1.1 })],     // and back
    [cut(255, 150, -40, { dur: 0.27, reach: 1.05, roll: 0.4 })],  // the hook brought down
    [spin({ dur: 0.55, turns: 1, sweep: 'low' })],
  ],
  bow: [
    [draw({ hold: 0.12 })],
    [draw({ hold: 0.04, cant: -0.55, snap: true })],
    [draw({ hold: 0.24, deep: true })],
    [draw({ hold: 0.1, high: 0.35 })],
  ],
  staff: [
    [thrust({ dur: 0.22, ext: 0.95, aim: [0.02, 0.1] })],
    [cut(180, 108, -96, { dur: 0.24, reach: 1.05 })],
    [smash({ dur: 0.26 })],
    [cut(95, 112, -52, { dur: 0.24 }), raise({ dur: 0.3, push: 0.4 })],
  ],
  grimoire: [
    [raise({ dur: 0.3, push: 0.8 })],
    [cut(180, 70, -60, { dur: 0.18, reach: 0.85 })],
    [raise({ dur: 0.36, high: 0.6 })],
    [thrust({ dur: 0.24, ext: 0.8, blade: 'up' })],
  ],
  focus: [
    [thrust({ dur: 0.18, ext: 0.85, aim: [0.04, 0.06] })],
    [cut(170, 60, -48, { dur: 0.13, reach: 0.8 })],
    [cut(10, 60, -48, { dur: 0.13, reach: 0.8 })],
    [raise({ dur: 0.26, push: 0.6 })],
  ],
};

// ══════════════════════════════════════════════════════════
// THE HEAVY ATTACK — hold LMB, release (systems/CombatSystem.js).
// One committed blow per weapon; while it charges, the clip's own
// WIND-UP plays (CombatSystem holds it at charge × windEnd), so what you
// see drawing back is exactly what will come down.
// ══════════════════════════════════════════════════════════
export const HEAVY = {
  sword:      [cut(250, 165, -70, { dur: 0.24, reach: 1.12 })],
  greatsword: [smash({ dur: 0.32, jump: true, from: 178, to: -88, reach: 1.18 })],
  dagger:     [thrust({ dur: 0.24, ext: 1.3, lunge: true, twist: 1.57 })],
  dualblades: [cut(240, 120, -40, { dur: 0.15 }), cut(300, 120, -40, { dur: 0.15, roll: -0.3 })],
  axe:        [smash({ dur: 0.3, from: 176, to: -92, reach: 1.15 })],
  warhammer:  [smash({ dur: 0.36, jump: true, from: 180, to: -95, reach: 1.2 })],
  spear:      [thrust({ dur: 0.3, ext: 1.5, lunge: true })],
  scythe:     [cut(185, 160, -160, { dur: 0.38, reach: 1.18, low: 0.2 })],
  bow:        [draw({ hold: 0.05, deep: true })],
  staff:      [smash({ dur: 0.28, jump: true, from: 160, to: -90 })],
  grimoire:   [raise({ dur: 0.3, high: 0.8, push: 0.9 })],
  focus:      [raise({ dur: 0.24, high: 0.5 }), thrust({ dur: 0.2, ext: 1.1 })],
};

// ══════════════════════════════════════════════════════════
// THE COMPOSED FACETS — one choreography per motion id (data/facets.js).
// Multi-hit motions have one stroke per hit, so the damage frames ARE
// the blows you see.
// ══════════════════════════════════════════════════════════
export const SKILLS = {
  // sword
  rising_cut:    [cut(75, 140, -50, { dur: 0.22, low: 0.5, reach: 1.1 })],
  falling_star:  [smash({ dur: 0.26, jump: true, reach: 1.12 })],
  whirling_edge: [spin({ dur: 0.6, turns: 1 })],
  heart_thrust:  [thrust({ dur: 0.3, ext: 1.35, lunge: true, twist: 1.57 })],
  crossing_cuts: [cut(225, 110, -70, { dur: 0.15 }), cut(315, 110, -70, { dur: 0.15, roll: -0.3 })],
  // greatsword
  cleaving_arc:  [cut(180, 150, -150, { dur: 0.36, reach: 1.15, low: 0.1 })],
  grave_drop:    [smash({ dur: 0.3, jump: true, from: 178, to: -85, reach: 1.15 })],
  skyward_rend:  [cut(90, 150, -70, { dur: 0.3, low: 0.6, reach: 1.15 })],
  wheel_of_ruin: [spin({ dur: 0.55, turns: 1 }), spin({ dur: 0.5, turns: 1 })],
  pommel_break:  [thrust({ dur: 0.22, ext: 0.75, blade: 'down', aim: [0, 0.08] })],
  // dagger
  flurry:        [thrust({ dur: 0.1, ext: 0.8, aim: [0.05, 0.05] }), thrust({ dur: 0.1, ext: 0.8, aim: [-0.07, -0.02], twist: -1 }),
                  thrust({ dur: 0.1, ext: 0.82, aim: [0.08, -0.06] }), thrust({ dur: 0.12, ext: 0.9, aim: [0, 0.03], twist: 1.3 })],
  shadowstep:    [guard({ dur: 0.18, low: true }), cut(30, 70, -70, { dur: 0.12, reach: 0.9, lunge: true })],
  fan_of_knives: [toss({ dur: 0.17, dir: 180, from: 80, to: -60 })],
  hamstring:     [cut(190, 80, -80, { dur: 0.14, low: 0.9, reach: 0.9 })],
  reverse_grip:  [cut(250, 120, -40, { dur: 0.13, roll: 3.14 }), cut(70, 80, -60, { dur: 0.13, roll: 3.14 })],
  // dualblades
  twin_tempest:  [spin({ dur: 0.42, turns: 1 }), spin({ dur: 0.38, turns: 1 }), cut(270, 120, -60, { dur: 0.14 })],
  scissor:       [cut(240, 90, -20, { dur: 0.12 }), cut(300, 90, -20, { dur: 0.12, roll: -0.4 })],
  blade_dance:   [cut(200, 90, -70, { dur: 0.12, lunge: true }), cut(340, 90, -70, { dur: 0.12, lunge: true })],
  crescent_pair: [toss({ dur: 0.14, dir: 200, from: 90, to: -40 }), toss({ dur: 0.14, dir: 340, from: 90, to: -40 })],
  lacerate:      [cut(200, 120, -90, { dur: 0.2, reach: 1.1, roll: 0.5 })],
  // axe
  splitting_chop:[smash({ dur: 0.24, from: 172, to: -80, reach: 1.12 })],
  hooking_pull:  [thrust({ dur: 0.2, ext: 1.2 }), cut(90, -10, 120, { dur: 0.24, reach: 0.9, pull: true })],
  hurled_axe:    [toss({ dur: 0.2 })],
  wide_hew:      [cut(180, 140, -140, { dur: 0.34, reach: 1.12 })],
  earth_breaker: [smash({ dur: 0.3, jump: true, from: 176, to: -90, reach: 1.15 })],
  // warhammer
  meteor:        [smash({ dur: 0.34, jump: true, from: 180, to: -88, reach: 1.18 })],
  tremor:        [smash({ dur: 0.28, from: 165, to: -92, reach: 1.1 }), wait(0.12)],
  bell_toll:     [cut(170, 130, -60, { dur: 0.3, reach: 1.12, low: -0.2 })],
  spinning_mass: [spin({ dur: 0.6, turns: 1, sweep: 'low' }), spin({ dur: 0.5, turns: 1, sweep: 'low' })],
  uppercut:      [cut(90, 150, -60, { dur: 0.3, low: 0.8, reach: 1.1 })],
  // spear
  impaling_line: [thrust({ dur: 0.3, ext: 1.45, lunge: true })],
  pole_vault:    [thrust({ dur: 0.24, ext: 0.7, aim: [0, -0.9], jump: true }), smash({ dur: 0.24, from: 120, to: -70 })],
  sweeping_haft: [spin({ dur: 0.6, turns: 1, sweep: 'low' })],
  javelin:       [toss({ dur: 0.22, dir: 280, from: 165, to: -10 })],
  thousand_points: [0, 1, 2, 3, 4].map(i => thrust({ dur: 0.1, ext: 1.15, aim: [[0, 0.04], [-0.1, 0], [0.1, 0.06], [-0.04, -0.06], [0.06, 0.02]][i] })),
  // scythe
  harvest:       [cut(180, 150, -150, { dur: 0.36, reach: 1.15, low: 0.15 })],
  hooked_reap:   [thrust({ dur: 0.22, ext: 1.25 }), cut(90, -30, 110, { dur: 0.28, reach: 1.0, pull: true })],
  death_wheel:   [spin({ dur: 0.5, turns: 1, sweep: 'high' }), smash({ dur: 0.26, from: 150, to: -70 })],
  crescent_throw:[toss({ dur: 0.2, dir: 200, from: 120, to: -50 })],
  grave_sweep:   [cut(180, 140, -140, { dur: 0.34, low: 1.0, reach: 1.1 })],
  // bow
  piercing_shot: [draw({ hold: 0.3 })],
  rain_of_shafts:[draw({ hold: 0.16, high: 0.9 }), draw({ hold: 0.06, high: 0.85, snap: true })],
  split_shot:    [draw({ hold: 0.18, cant: -1.35 })],
  disengage:     [guard({ dur: 0.16, back: true }), draw({ hold: 0.05, snap: true })],
  drawn_breath:  [draw({ hold: 0.75, deep: true })],
  // staff
  staff_beam:    [raise({ dur: 0.3, level: true, push: 0.5, hold: 0.25 })],
  pillar:        [raise({ dur: 0.26, high: 0.7 }), smash({ dur: 0.22, from: 60, to: -80 })],
  shockwave:     [smash({ dur: 0.28, jump: true, from: 165, to: -95 })],
  sweep_strike:  [cut(180, 120, -120, { dur: 0.26, low: 0.4 }), cut(0, 100, -100, { dur: 0.24, low: 0.3 })],
  surge:         [thrust({ dur: 0.3, ext: 1.2, lunge: true, blade: 'fwd' })],
  // grimoire
  litany:        [raise({ dur: 0.32, push: 0.9, hold: 0.2 })],
  sigil_ward:    [raise({ dur: 0.24, high: 0.3 }), guard({ dur: 0.42 })],
  scripture_burst:[raise({ dur: 0.3, high: 0.9, push: 0.4 })],
  rending_verse: [toss({ dur: 0.18, dir: 190, from: 80, to: -50 })],
  index:         [raise({ dur: 0.24, high: 0.4 }), spin({ dur: 0.5, turns: 1 })],
  // the focus (no weapon in hand)
  focus_lance:   [thrust({ dur: 0.26, ext: 1.1, hold: 0.2 })],
  focus_nova:    [raise({ dur: 0.28, high: 0.8 }), smash({ dur: 0.2, from: 70, to: -70 })],
  focus_step:    [guard({ dur: 0.14, low: true }), thrust({ dur: 0.2, ext: 1.0, lunge: true })],
  focus_shards:  [toss({ dur: 0.16, dir: 200, from: 70, to: -50 }), toss({ dur: 0.16, dir: 340, from: 70, to: -50 })],
  focus_sigil:   [cut(200, 60, -60, { dur: 0.16, reach: 0.85 }), cut(340, 60, -60, { dur: 0.16, reach: 0.85 }), raise({ dur: 0.24, push: 0.6 })],
};

// The old keyed Facets (older saves, Echoes, relics, the innate): each
// key its own choreography, in the vocabulary of whatever is in hand.
export const KEYED = {
  hew: [smash({ dur: 0.26 })], sweep: [spin({ dur: 0.55, turns: 1 })], lunge: [thrust({ dur: 0.28, ext: 1.3, lunge: true })],
  brace: [guard({ dur: 0.5 })], knit: [raise({ dur: 0.4, high: 0.5, hold: 0.3 })],
  summon: [raise({ dur: 0.34, high: 0.9, hold: 0.15 })], swarm: [raise({ dur: 0.24, high: 0.5 }), cut(180, 70, -70, { dur: 0.16 })],
  skewer: [thrust({ dur: 0.26, ext: 1.3 })], scatter: [cut(180, 130, -130, { dur: 0.3 })], chorus: [raise({ dur: 0.26, high: 0.4 }), spin({ dur: 0.5, turns: 1 })],
  charge: [thrust({ dur: 0.3, ext: 1.25, lunge: true })], vault: [smash({ dur: 0.26, jump: true })],
  step: [guard({ dur: 0.18, low: true })], unseen: [guard({ dur: 0.3, back: true })], still: [raise({ dur: 0.4, hold: 0.4, level: true })],
  gutter: [cut(200, 70, -60, { dur: 0.1 }), cut(340, 70, -60, { dur: 0.1 }), thrust({ dur: 0.12, ext: 0.9 })],
  riposte: [guard({ dur: 0.3 }), thrust({ dur: 0.18, ext: 1.15 })],
  whirl: [spin({ dur: 0.45, turns: 1 }), spin({ dur: 0.42, turns: 1 })],
  maim: [cut(235, 140, -80, { dur: 0.24, reach: 1.1 })], sunder: [smash({ dur: 0.3, from: 175, to: -88, reach: 1.15 })],
  quake: [smash({ dur: 0.32, jump: true, from: 178, to: -92 })], impale: [thrust({ dur: 0.3, ext: 1.45, lunge: true })],
  reap: [cut(180, 150, -150, { dur: 0.34, low: 0.15, reach: 1.15 })], volley: [draw({ hold: 0.1 }), draw({ hold: 0.04, snap: true })],
  conduit: [raise({ dur: 0.3, level: true, hold: 0.3 })], verse: [raise({ dur: 0.3, push: 0.9 })],
  gore: [thrust({ dur: 0.24, ext: 1.2, aim: [0, -0.1] })], pommel: [thrust({ dur: 0.2, ext: 0.7, blade: 'down' })],
  cascade: [smash({ dur: 0.2 }), smash({ dur: 0.2, from: 140 })],
  aegis: [guard({ dur: 0.55 })], rebuke: [guard({ dur: 0.2 }), cut(0, 90, -90, { dur: 0.18 })], anchor: [smash({ dur: 0.24, to: -95 }), wait(0.2)],
  chime: [raise({ dur: 0.26, high: 0.7 })], hollow: [raise({ dur: 0.36, push: 0.5 })],
  thread: [thrust({ dur: 0.26, ext: 1.2, hold: 0.15 })], nail: [thrust({ dur: 0.18, ext: 1.0, aim: [0, -0.15] })],
  sever: [cut(180, 140, -140, { dur: 0.28 })], bloom: [raise({ dur: 0.22, high: 0.4 }), spin({ dur: 0.45, turns: 1 })],
  fan: [toss({ dur: 0.16, dir: 190, from: 80, to: -50 })],
  slip: [guard({ dur: 0.16, back: true })], blink: [guard({ dur: 0.12, low: true })],
  rush: [thrust({ dur: 0.28, ext: 1.2, lunge: true })], mirror: [raise({ dur: 0.3, hold: 0.2 })],
  unmake: [raise({ dur: 0.26, high: 0.8 }), smash({ dur: 0.26, from: 120, to: -90 })],
};

// ══════════════════════════════════════════════════════════
// TRAIT LAYERS — how a composed Facet's trait changes its choreography
// (data/facets.js TRAITS). Structural, not a tint: a Call Facet really
// strikes twice; a Ward Facet ends in a held guard.
// ══════════════════════════════════════════════════════════
function applyTrait(strokes, trait) {
  const s = strokes.map(x => ({ ...x }));
  const last = s[s.length - 1];
  switch (trait) {
    case 'pierce':   // snap faster, reach further, end on a driven point
      for (const x of s) { x.dur = (x.dur || 0.2) * 0.85; x.reach = (x.reach || 1) * 1.08; x.ext = (x.ext || 1) * 1.12; }
      if (last.k === 'cut') s.push(thrust({ dur: 0.18, ext: 1.25 }));
      break;
    case 'spread':   // wider arcs, a turning finish
      for (const x of s) if (x.k === 'cut') { x.from *= 1.25; x.to *= 1.25; }
      if (last.k !== 'spin') s.push(spin({ dur: 0.42, turns: 0.5 }));
      break;
    case 'move':     // arrive on a run
      s[0] = { ...s[0], lunge: true };
      s.unshift(guard({ dur: 0.12, low: true, run: true }));
      break;
    case 'ward':     // and close into a held guard
      s.push(guard({ dur: 0.45 }));
      break;
    case 'call':     // the echo: the last blow again, mirrored, softer
      s.push(wait(0.08), { ...last, mirrorThis: true, dur: (last.dur || 0.2) * 1.15, soft: true });
      break;
    case 'shift':    // a slow, heavy wind and a counter-turn
      for (const x of s) { x.windMul = 1.6; x.hsMul = 2; }
      s.push(cut(s[0].dir != null ? (s[0].dir + 180) % 360 : 0, 60, -60, { dur: 0.2, reach: 0.9, soft: true }));
      break;
  }
  return s;
}

// ══════════════════════════════════════════════════════════
// THE BAKER
// ══════════════════════════════════════════════════════════
const HZ = 120;
const _m = new THREE.Matrix4(), _qa = new THREE.Quaternion();

function orient(b, e, edge, out) {
  const Y = b.clone().normalize();
  let X = e.clone().addScaledVector(Y, -e.dot(Y));
  if (X.lengthSq() < 1e-6) { X = Math.abs(Y.x) < 0.9 ? V(1, 0, 0) : V(0, 0, 1); X.addScaledVector(Y, -X.dot(Y)); }
  X.normalize();
  if (edge === '-z') {
    const Z = X.clone().negate();
    _m.makeBasis(new THREE.Vector3().crossVectors(Y, Z), Y, Z);
  } else {
    _m.makeBasis(X, Y, new THREE.Vector3().crossVectors(X, Y));
  }
  return out.setFromRotationMatrix(_m);
}
const easeIO = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const easeIO2 = (u) => u * u * (3 - 2 * u);
// The swing's own curve: accelerate in, decelerate out, peak speed 1.57×
// the average (a cubic in-out peaks at 3× — the blade teleported).
const easeSw = (u) => 0.5 - 0.5 * Math.cos(Math.PI * u);
const outQuint = (u) => 1 - Math.pow(1 - u, 5);
const camZero = () => ({ pitch: 0, yaw: 0, roll: 0, dip: 0, push: 0 });
function lerpCam(a, b, k) {
  return { pitch: a.pitch + (b.pitch - a.pitch) * k, yaw: a.yaw + (b.yaw - a.yaw) * k, roll: a.roll + (b.roll - a.roll) * k,
    dip: a.dip + (b.dip - a.dip) * k, push: a.push + (b.push - a.push) * k };
}
const pose = (h, q, cam) => ({ h, q, cam: cam || camZero() });

/**
 * A stroke as a function of its own progress u (0..1) → pose, plus the
 * progress at which it lands (or null) and its swing length.
 */
function plan(st, ctx) {
  const P = ctx.pivot, heavy = ctx.prof.heavy, A = ctx.amp;
  const T = V(0, -0.02, -1.5);
  const mir = (st.mirrorThis ? -1 : 1) * ctx.mirror;
  const soft = st.soft ? 0.65 : 1;
  const camK = (0.6 + heavy) * soft;

  if (st.k === 'cut') {
    const th = (mir < 0 ? 180 - st.dir : st.dir) * D2R;
    const d = V(Math.cos(th), Math.sin(th), 0);
    const target = T.clone(); target.y -= (st.low || 0) * 0.9;
    const f = target.sub(P).normalize();
    const a0 = st.from * D2R * A, a1 = st.to * D2R * A;
    const reach = (st.reach || 1) * ctx.arm;
    // where along u the blade crosses the line (α = 0)
    const uImp = (st.pull || a0 * a1 > 0) ? 0.55 : invertEase(a0 / (a0 - a1));
    return {
      // ×1.3: authored as a sword's real swing time, which peaked at
      // ~50 rad/s — faster than an eye (or a 60 Hz frame) can follow.
      dur: (st.dur || 0.2) * 1.3, hit: uImp,
      at(u) {
        const k = easeSw(u);
        const a = a0 + (a1 - a0) * k;
        const b = f.clone().multiplyScalar(Math.cos(a)).addScaledVector(d, -Math.sin(a)).normalize();
        const e = f.clone().multiplyScalar(Math.sin(a)).addScaledVector(d, Math.cos(a));
        if (a1 > a0) e.negate();
        // The hands follow the blade only partly — wrists and elbows do
        // the rest — so a wind-up stays in frame. An OVERHEAD is the
        // exception: there the hands really go up past the eye and come
        // down into view, as they do in your own sight.
        const armDir = st.smash || st.toss
          ? f.clone().multiplyScalar(0.55).add(b).addScaledVector(UP, 0.45 * Math.max(0, Math.sin(a))).normalize()
          : f.clone().multiplyScalar(1.6).addScaledVector(b, 0.85).normalize();
        const ext = 0.86 + 0.14 * Math.cos(a);
        const h = P.clone().addScaledVector(armDir, reach * ext);
        if (st.smash && st.jump) h.y += 0.06 * Math.sin(Math.PI * Math.min(1, u * 1.6));
        const q = orient(b, e, ctx.prof.edge, new THREE.Quaternion());
        if (st.roll) q.premultiply(_qa.setFromAxisAngle(b, st.roll * mir));
        const g = Math.exp(-Math.pow((u - uImp) / 0.2, 2));
        const pre = u < uImp ? Math.sin(Math.PI * u / Math.max(0.05, uImp)) * 0.35 : 0;
        const cam = {
          roll: (-d.x * 0.07 * g + d.x * 0.03 * pre) * camK,
          pitch: (d.y * 0.06 * g - d.y * 0.02 * pre) * camK - (st.jump ? 0.05 * pre : 0),
          yaw: (d.x * 0.035 * g) * camK,
          dip: (st.smash ? -0.045 * g * (0.5 + heavy) : -0.012 * g) + (st.jump ? 0.07 * pre : 0),
          push: st.lunge ? 0.16 * Math.sin(Math.PI * Math.min(1, u * 1.2)) : 0,
        };
        return pose(h, q, cam);
      },
    };
  }

  if (st.k === 'thrust') {
    const aim = st.aim || [0, 0];
    const tgt = T.clone().add(V(aim[0] * mir, aim[1], 0));
    const f = tgt.sub(P).normalize();
    const pull = 0.5 * ctx.arm, ext = Math.min(1.5, (st.ext || 1)) * ctx.arm * 1.05;
    const side = V(1, 0, 0).applyAxisAngle(f, (st.twist || 0) * mir);
    return {
      dur: st.dur || 0.22, hit: 0.32,
      at(u) {
        const r = u < 0.4 ? pull + (ext - pull) * outQuint(u / 0.4)
          : ext + (pull * 1.15 - ext) * easeIO2((u - 0.4) / 0.6) * (st.hold ? 0.6 : 1);
        const h = P.clone().addScaledVector(f, r);
        let b = f, e = side;
        if (st.blade === 'up') { b = V(0.1 * mir, 1, -0.25).normalize(); e = f; }
        if (st.blade === 'down') { b = V(0, -0.4, 1).normalize(); e = f; }
        const q = orient(b, e, ctx.prof.edge, new THREE.Quaternion());
        const g = Math.exp(-Math.pow((u - 0.32) / 0.16, 2));
        const cam = { pitch: -0.012 * g * camK, roll: 0.012 * mir * g, yaw: 0,
          dip: st.jump ? -0.05 * Math.sin(Math.PI * u) : -0.01 * g,
          push: (st.lunge ? 0.32 : 0.06) * Math.sin(Math.PI * Math.min(1, u * 1.15)) };
        return pose(h, q, cam);
      },
    };
  }

  if (st.k === 'spin') {
    const turns = (st.turns || 1) * (mir < 0 ? -1 : 1);
    const lowK = st.sweep === 'low' ? 0.6 : st.sweep === 'high' ? -0.4 : 0;
    const f = T.clone().add(V(0, -lowK * 0.9, 0)).sub(P).normalize();
    const d = V(-mir, 0, 0);
    return {
      dur: st.dur || 0.5, hit: 0.5,
      at(u) {
        // The body turns (camera yaw); the blade is held out across the
        // front, trailing into the turn and leading out of it.
        const k = easeIO(u);
        const a = (60 - 120 * k) * D2R;
        const b = f.clone().multiplyScalar(Math.cos(a)).addScaledVector(d, -Math.sin(a)).normalize();
        const e = f.clone().multiplyScalar(Math.sin(a)).addScaledVector(d, Math.cos(a));
        const h = P.clone().addScaledVector(f.clone().multiplyScalar(1.25).add(b).normalize(), ctx.arm * 1.05);
        const q = orient(b, e, ctx.prof.edge, new THREE.Quaternion());
        const cam = { yaw: turns * Math.PI * 2 * k, roll: -0.06 * mir * Math.sin(Math.PI * u) * camK,
          pitch: 0, dip: -0.02 * Math.sin(Math.PI * u), push: 0 };
        return pose(h, q, cam);
      },
    };
  }

  if (st.k === 'draw') {
    const cant = (st.cant ?? -0.22) * mir;
    const high = st.high || 0;
    const hold = st.hold || 0.1;
    const drawT = st.snap ? 0.14 : st.deep ? 0.42 : 0.28;
    const dur = drawT + hold + 0.26;
    const relU = (drawT + hold) / dur;
    const aimF = V(0.0, -0.06 + high * 0.6, -1.5).sub(ctx.pivot).normalize();
    return {
      dur, hit: relU,
      at(u) {
        const t = u * dur;
        // Raise and draw, hold, loose (a kick up and back), settle.
        const dk = Math.min(1, t / drawT);
        const h = V(0.11, -0.16 + high * 0.18, -0.52).lerp(V(0.09, -0.13 + high * 0.2, -0.5 + (st.deep ? 0.04 : 0)), easeIO2(dk));
        const b = UP.clone().applyAxisAngle(V(0, 0, 1), cant).applyAxisAngle(V(1, 0, 0), -0.18 + high * 0.5);
        const q = orient(b, aimF, 'x', new THREE.Quaternion());
        let kick = 0;
        if (u > relU) kick = Math.exp(-((u - relU) * dur) * 9) * Math.min(1, (u - relU) * dur * 40);
        h.z += kick * 0.06; h.y += kick * 0.02;
        q.premultiply(_qa.setFromAxisAngle(V(1, 0, 0), kick * 0.22));
        const shake = (u > drawT / dur && u < relU) ? Math.sin(t * 70) * 0.0015 * (st.deep ? 2 : 1) : 0;
        h.x += shake;
        const cam = { pitch: kick * 0.025 + high * 0.03 * Math.min(1, t / drawT), roll: cant * 0.04, yaw: 0, dip: 0, push: -kick * 0.03 };
        return pose(h, q, cam);
      },
    };
  }

  if (st.k === 'raise') {
    const high = st.high || 0, push = st.push || 0;
    const dur = (st.dur || 0.3) + (st.hold || 0) + 0.12;
    const peakU = (st.dur || 0.3) / dur;
    return {
      dur, hit: peakU,
      at(u) {
        const k = easeIO(Math.min(1, u / peakU));
        const hold = u > peakU;
        const base = V(0.12 * mir, -0.2, -0.5);
        const top = st.level ? V(0.06 * mir, -0.14, -0.62) : V(0.08 * mir, -0.06 + high * 0.16, -0.5 - push * 0.14);
        const h = base.clone().lerp(top, k);
        if (hold) h.z -= 0.02 * Math.sin((u - peakU) * 30);
        const b = st.level ? V(-0.05 * mir, 0.18, -1).normalize() : V(-0.05 * mir, 1, -0.5 - push * 0.6).normalize();
        const q = orient(b, V(mir, 0, 0), ctx.prof.edge, new THREE.Quaternion());
        const g = Math.exp(-Math.pow((u - peakU) / 0.18, 2));
        const cam = { pitch: 0.03 * high * k, roll: 0, yaw: 0, dip: 0, push: 0.07 * push * g };
        return pose(h, q, cam);
      },
    };
  }

  if (st.k === 'guard') {
    const dur = st.dur || 0.3;
    return {
      dur, hit: 0.3,
      at(u) {
        const k = easeIO2(Math.min(1, u / 0.35));
        const h = st.back ? V(0.16 * mir, -0.28, -0.32) : st.low ? V(0.2 * mir, -0.38, -0.4) : V(0.12 * mir, -0.17, -0.44);
        const b = st.low ? V(0.2 * mir, 0.6, -1).normalize() : V(-1 * mir, 0.22, -0.32).normalize();
        const q = orient(b, V(0, 1, 0.3), ctx.prof.edge, new THREE.Quaternion());
        const cam = { pitch: st.back ? 0.03 * k : 0, roll: 0, yaw: 0, dip: (st.low || st.run) ? -0.05 * k : 0,
          push: st.back ? -0.12 * Math.sin(Math.PI * u) : st.run ? 0.25 * Math.sin(Math.PI * u) : 0 };
        return pose(h, q, cam);
      },
    };
  }

  // wait
  return { dur: st.dur || 0.1, hit: null, at: null };
}

/** α crosses zero at k = a0/(a0-a1) of the eased progress; invert easeIO. */
function invertEase(k) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (easeSw(m) < k) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/**
 * Bake a clip from strokes.
 * @param {object[]} strokes
 * @param {object} ctx { key, rest:{h,q}, mirror, amp, speed }
 */
function bake(strokes, ctx) {
  const prof = ctx.prof;
  const frames = [];
  const hits = [];
  let windEnd = null;   // end of the first wind-up — a heavy's CHARGE plays up to here
  const push = (p) => frames.push({ h: p.h.clone(), q: p.q.clone(), cam: { ...p.cam } });
  let cur = pose(ctx.rest.h.clone(), ctx.rest.q.clone(), camZero());
  const heavy = prof.heavy;
  const speed = ctx.speed || 1;
  for (const st of strokes) {
    const pl = plan(st, ctx);
    if (!pl.at) { // wait: hold the pose
      for (let i = 0; i < Math.round(pl.dur * HZ / speed); i++) push(cur);
      continue;
    }
    // WIND — from wherever the last stroke left the weapon to this one's
    // start, slower for heavy weapons; the camera leans into it.
    const start = pl.at(0);
    let wind = (0.1 + heavy * 0.22) * (st.windMul || 1) * (st.k === 'draw' || st.k === 'raise' || st.k === 'guard' ? 0.5 : 1) / speed;
    // A wind-up long enough for the distance it covers: a weapon
    // re-laid from a thrust into a guard turns ~3 rad and must not do it
    // in eight frames. ~11 rad/s and ~2.4 units/s at the eased peak.
    const turn = 2 * Math.acos(Math.min(1, Math.abs(cur.q.dot(start.q))));
    wind = Math.max(wind, turn / 11 * 1.5, cur.h.distanceTo(start.h) / 2.4 * 1.5);
    const nW = Math.max(2, Math.round(wind * HZ));
    for (let i = 1; i <= nW; i++) {
      const k = easeIO2(i / nW);
      push(pose(cur.h.clone().lerp(start.h, k), cur.q.clone().slerp(start.q, k), lerpCam(cur.cam, start.cam, k)));
    }
    if (windEnd === null) windEnd = frames.length / HZ;
    // SWING
    const n = Math.max(3, Math.round(pl.dur * HZ / speed));
    let hitAt = null;
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      const p = pl.at(u);
      push(p);
      if (pl.hit != null && hitAt === null && u >= pl.hit) {
        hitAt = frames.length / HZ;
        hits.push(hitAt);
        // HITSTOP — the blade bites and the world holds for a beat.
        const hs = (st.k === 'cut' || st.k === 'thrust' ? 0.025 + heavy * 0.06 : 0.015) * (st.hsMul || 1) * (st.soft ? 0.5 : 1);
        for (let j = 0; j < Math.round(hs * HZ); j++) push(p);
      }
    }
    cur = pl.at(1);
    // A full turn ends facing where it began: carry on from yaw 0, or the
    // next blend would unwind the whole turn backwards.
    cur.cam.yaw = wrapPi(cur.cam.yaw);
  }
  // RECOVER — back to the stance.
  const rec = (0.2 + heavy * 0.28) / speed;
  const nR = Math.max(2, Math.round(rec * HZ));
  const last = frames.length ? frames[frames.length - 1] : cur;
  const from = { h: last.h, q: last.q, cam: { ...last.cam, yaw: wrapPi(last.cam.yaw) } };
  for (let i = 1; i <= nR; i++) {
    const k = easeIO2(i / nR);
    push(pose(from.h.clone().lerp(ctx.rest.h, k), from.q.clone().slerp(ctx.rest.q, k), lerpCam(from.cam, camZero(), k)));
  }
  return { frames, hits, dur: frames.length / HZ, windEnd: windEnd ?? 0 };
}

function wrapPi(a) { a %= Math.PI * 2; if (a > Math.PI) a -= Math.PI * 2; if (a < -Math.PI) a += Math.PI * 2; return a; }

function h32(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 15; return (h >>> 0) / 4294967296; }

// ── Public API ───────────────────────────────────────────
const _cache = new Map();

/**
 * @param {string} key  weapon key (weaponPlanKey) or 'focus'
 * @param {{h:THREE.Vector3,q:THREE.Quaternion}} rest  the stance pose
 */
function ctxFor(key, rest, mirror = 1, amp = 1, speed = 1) {
  const prof = PROFILE[key] || PROFILE.sword;
  const twoH = prof.grip2 != null;
  return {
    key, prof, rest, mirror, amp, speed,
    pivot: V(twoH ? 0.1 : 0.17, -0.3, 0.02),
    arm: 0.5,
  };
}
const restKey = (r) => `${r.h.x.toFixed(3)},${r.h.y.toFixed(3)},${r.h.z.toFixed(3)},${r.q.x.toFixed(3)},${r.q.y.toFixed(3)},${r.q.w.toFixed(3)}`;

/** The charged heavy for the weapon in hand. */
export function heavyClip(key, rest) {
  const id = `heavy:${key}:${restKey(rest)}`;
  if (!_cache.has(id)) _cache.set(id, bake(HEAVY[key] || HEAVY.sword, ctxFor(key, rest)));
  return _cache.get(id);
}

/** The held block: the weapon laid across the body. { h, q }. */
export function guardPose(key, rest) {
  const id = `guard:${key}:${restKey(rest)}`;
  if (!_cache.has(id)) {
    const p = plan(guard({ dur: 0.3 }), ctxFor(key, rest)).at(1);
    _cache.set(id, { h: p.h, q: p.q });
  }
  return _cache.get(id);
}

/** A basic-attack beat (0..3) for the weapon in hand. */
export function attackClip(key, beat, rest) {
  const id = `atk:${key}:${beat}:${restKey(rest)}`;
  if (!_cache.has(id)) {
    const combo = COMBOS[key] || COMBOS.sword;
    _cache.set(id, bake(combo[beat & 3], ctxFor(key, rest)));
  }
  return _cache.get(id);
}

/**
 * A composed Facet's clip (spec from data/facets.js), or an old keyed
 * Facet's (pass { key }). Seeded mirror/amplitude so two Remnants with
 * the same motion still differ.
 */
export function skillClip(weaponKey, spec, rest, seed = '') {
  const strokesBase = spec.motion ? SKILLS[spec.motion] : KEYED[spec.key];
  const strokes = strokesBase ? (spec.trait ? applyTrait(strokesBase, spec.trait) : strokesBase) : [thrust({ dur: 0.24, ext: 1 })];
  const r = h32(`${seed}:${spec.motion || spec.key}:${spec.trait || ''}`);
  const hasSpin = strokes.some(s => s.k === 'spin');
  const mirror = r < 0.35 && !hasSpin ? -1 : 1;
  const amp = 0.94 + h32(`amp:${seed}`) * 0.12;
  const speed = spec.attribute === 'agility' ? 1.15 : spec.trait === 'shift' ? 0.85 : 1;
  const id = `sk:${weaponKey}:${spec.motion || spec.key}:${spec.trait || ''}:${mirror}:${amp.toFixed(3)}:${speed}:${restKey(rest)}`;
  if (!_cache.has(id)) _cache.set(id, bake(strokes, ctxFor(weaponKey, rest, mirror, amp, speed)));
  return _cache.get(id);
}

/**
 * Sample a clip at t seconds. Writes hand position, weapon orientation
 * and the camera layer. Returns false once past the end.
 */
export function sampleClip(clip, t, outH, outQ, outCam) {
  const n = clip.frames.length;
  if (!n) return false;
  const x = Math.max(0, t * HZ - 1);
  const i = Math.min(n - 1, Math.floor(x)), j = Math.min(n - 1, i + 1), k = Math.min(1, x - i);
  const a = clip.frames[i], b = clip.frames[j];
  outH.copy(a.h).lerp(b.h, k);
  outQ.copy(a.q).slerp(b.q, k);
  if (outCam) {
    Object.assign(outCam, lerpCam(a.cam, b.cam, k));
    outCam.yaw = a.cam.yaw + wrapPi(b.cam.yaw - a.cam.yaw) * k;   // across a completed turn
  }
  return t < clip.dur;
}

// ══════════════════════════════════════════════════════════
// STEEL — a clip per attack LINE (data/steel.js) and per technique
//
// The combat revamp swings on lines (high/mid/low × left/right/thrust),
// so the clip is built from the line's own stroke rather than a combo
// beat: what you see coming down is the line the rules resolve.
// ══════════════════════════════════════════════════════════
import { LINES } from '../data/steel.js';

const TECH_STROKES = {
  sweep:     () => [spin({ dur: 0.46, turns: 1 })],
  leap:      () => [smash({ dur: 0.32, jump: true, from: 178, to: -88, reach: 1.15 })],
  lunge:     () => [thrust({ dur: 0.26, ext: 1.3, lunge: true })],
  halfsword: () => [thrust({ dur: 0.3, ext: 1.0, twist: 1.57 })],
  pommel:    () => [thrust({ dur: 0.16, ext: 0.5, blade: 'up', aim: [0, 0.06] })],
  kick:      () => [thrust({ dur: 0.18, ext: 0.4, blade: 'up', aim: [0, -0.2] })],
  feint:     () => [cut(215, 112, 40, { dur: 0.14 })],
};

/** @param {{line:string, kind:string, tech?:string}} spec */
export function steelClip(key, spec, rest) {
  const heavy = spec.kind === 'heavy';
  const id = `steel:${key}:${spec.line}:${spec.kind}:${spec.tech || ''}:${restKey(rest)}`;
  if (_cache.has(id)) return _cache.get(id);
  let strokes = spec.tech && TECH_STROKES[spec.tech] ? TECH_STROKES[spec.tech]() : null;
  // ⚠️ Owner: the swings "were way better before". Each weapon's own
  // AUTHORED moves (COMBOS / HEAVY) are used again; the line only picks
  // WHICH of them — the authored stroke whose direction matches. The
  // generic per-line stroke is the fallback when a weapon has nothing
  // close (e.g. no low cut in its combo).
  if (!strokes) strokes = authoredFor(key, LINES[spec.line] || LINES['mid-right'], heavy);
  if (!strokes) {
    const L = LINES[spec.line] || LINES['mid-right'];
    const w = PROFILE[key]?.heavy ?? 0.3;
    const dur = (heavy ? 0.26 : 0.17) * (0.8 + w * 0.7);
    const st = { ...L.stroke, dur };
    if (st.k === 'cut') { st.reach = heavy ? 1.1 : 1.04; if (heavy) st.from = Math.min(178, (st.from || 110) + 30); }
    if (st.k === 'thrust' && heavy) { st.ext = (st.ext || 1) * 1.2; st.lunge = true; }
    strokes = [st];
  }
  const clip = bake(strokes, ctxFor(key, rest));
  _cache.set(id, clip);
  return clip;
}

const _angDiff = (a, b) => { const d = Math.abs(((a - b) % 360 + 540) % 360 - 180); return d; };
function authoredFor(key, L, heavy) {
  const want = L.stroke;
  if (heavy) {
    const h = HEAVY[key];
    // A heavy uses the weapon's own committed blow when its shape fits
    // the line (overhead → smash, thrust → thrust, a cut → a cut).
    const f = h?.[0];
    if (f && ((want.smash && f.smash) || (want.k === 'thrust' && f.k === 'thrust') || (want.k === 'cut' && !want.smash && f.k === 'cut' && !f.smash))) return h;
  }
  const beats = COMBOS[key] || [];
  let best = null, bestScore = Infinity;
  for (const beat of beats) {
    const f = beat[0];
    if (!f || f.k === 'spin' || f.k === 'draw' || f.k === 'raise') continue;
    let score;
    if (want.k === 'thrust') score = f.k === 'thrust' ? Math.abs((f.aim?.[1] || 0) - (want.aim?.[1] || 0)) * 100 : 999;
    else if (want.smash) score = f.smash ? 0 : f.k === 'cut' ? _angDiff(f.dir, 270) + 20 : 999;
    else if (f.k !== 'cut') score = 999;
    else {
      score = _angDiff(f.dir, want.dir);
      const lowWant = (want.low || 0) > 0.3, lowHave = (f.low || 0) > 0.3;
      if (lowWant !== lowHave) score += 60;
    }
    if (score < bestScore) { bestScore = score; best = beat; }
  }
  if (!best || bestScore > 55) return null;
  return heavy ? best.map(st => ({ ...st, dur: (st.dur || 0.2) * 1.35, reach: (st.reach || 1) * 1.06 })) : best;
}
