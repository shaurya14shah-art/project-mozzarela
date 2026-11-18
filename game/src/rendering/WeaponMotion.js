// ══════════════════════════════════════════════════════════
// WeaponMotion — how each weapon is held and swung, in first person
//
// Owner: *"I wanted to also add new animations."* The old swing was ONE
// curve for every weapon — `sin(T·π)`, a symmetric bump that rotated the
// mount out and straight back — scaled by a per-type table. No wind-up,
// no follow-through, and the damage landed ~50 ms after the click no
// matter the weapon, so a warhammer "hit" before it had been lifted.
//
// Now every weapon has:
//   · a STANCE — how it rests in the hand (a sword angled up and across,
//     a spear levelled forward, the scythe upright with its blade over
//     your head, the bow held out, the book low).
//   · four BEATS (the combo), each a WIND-UP pose and a STRIKE-END pose.
//
// A swing plays a weighted timeline (u = elapsed / total):
//   0 → w        ANTICIPATION  stance → wind-up, ease-in-out (the weight)
//   w → w+0.16   STRIKE        wind-up → strike end, very fast ease-out
//   → 0.58       FOLLOW-THROUGH a slight overshoot past the end, settling
//   → 1          RECOVERY      back to stance, slow ease-in-out
// `w` is the weapon's WINDUP fraction, and main.js resolves the hit at
// u = w + IMPACT_LAG — the frame the blade is actually crossing the
// target. Heavy weapons wind up longer; that is most of what makes them
// feel heavy (RŌNIN's lesson: telegraph, then commit).
//
// Poses are absolute mount transforms in the viewmodel group's space:
//   p = [x right, y up, z toward camera (negative is forward)]
//   r = [pitch, yaw, roll] radians — pitch < 0 tips the business end
//       forward, yaw > 0 swings it left, roll > 0 leans it left.
// Weapons are built in metres along +y (rendering/Arms.js), scaled by
// `scale` here; long weapons are meant to run out of frame.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';

const P = (x, y, z, pitch, yaw, roll) => ({ p: [x, y, z], r: [pitch, yaw, roll] });

/** Fraction of the timeline where damage resolves, after the wind-up. */
export const IMPACT_LAG = 0.06;

export const MOTION = {
  sword: {
    scale: 1.32, windup: 0.30,
    stance: P(0.30, -0.36, -0.74, -0.62, 0.18, 0.38),
    beats: [
      { wind: P(0.46, -0.10, -0.64, -0.20, -0.35, -0.95), strike: P(-0.18, -0.48, -0.84, -1.38, 0.55, 1.20) },
      { wind: P(-0.04, -0.10, -0.64, -0.20, 0.35, 0.95), strike: P(0.46, -0.52, -0.80, -1.38, -0.45, -1.10) },
      { wind: P(0.52, -0.30, -0.60, -1.45, -0.95, -0.10), strike: P(-0.24, -0.30, -0.76, -1.50, 1.05, 0.10) },
      { wind: P(0.34, -0.32, -0.44, -1.50, 0.00, 0.10), strike: P(0.12, -0.26, -1.20, -1.56, 0.00, 0.05) },
    ],
  },
  greatsword: {
    scale: 1.15, windup: 0.42,
    stance: P(0.40, -0.40, -0.64, -0.40, -0.10, 0.30),
    beats: [
      { wind: P(0.30, 0.12, -0.42, 0.55, 0.00, 0.25), strike: P(0.06, -0.58, -1.04, -1.72, 0.00, 0.05) },
      { wind: P(0.55, -0.02, -0.52, -0.10, -0.45, -1.05), strike: P(-0.30, -0.56, -0.88, -1.40, 0.65, 1.25) },
      { wind: P(-0.10, -0.55, -0.58, -1.20, 0.40, 1.30), strike: P(0.45, 0.02, -0.80, -0.55, -0.40, -0.80) },
      { wind: P(0.58, -0.30, -0.54, -1.48, -1.10, -0.10), strike: P(-0.32, -0.30, -0.76, -1.52, 1.15, 0.12) },
    ],
  },
  dagger: {
    scale: 1.44, windup: 0.22,
    stance: P(0.30, -0.40, -0.68, -0.95, 0.20, 0.25),
    beats: [
      { wind: P(0.32, -0.36, -0.54, -1.40, 0.05, 0.10), strike: P(0.16, -0.30, -1.08, -1.55, 0.00, 0.05) },
      { wind: P(0.44, -0.24, -0.64, -0.70, -0.60, -0.70), strike: P(0.00, -0.42, -0.80, -1.20, 0.70, 0.80) },
      { wind: P(0.04, -0.24, -0.64, -0.70, 0.60, 0.70), strike: P(0.42, -0.44, -0.78, -1.20, -0.60, -0.80) },
      { wind: P(0.30, -0.34, -0.50, -1.45, 0.00, 0.10), strike: P(0.20, -0.26, -1.13, -1.56, 0.00, 0.05) },
    ],
  },
  dualblades: {
    scale: 1.23, windup: 0.25,
    stance: P(0.12, -0.42, -0.73, -0.85, 0.00, 0.10),
    beats: [
      { wind: P(0.30, -0.22, -0.64, -0.50, -0.55, -0.80), strike: P(-0.14, -0.46, -0.80, -1.25, 0.65, 0.85) },
      { wind: P(-0.08, -0.22, -0.64, -0.50, 0.55, 0.80), strike: P(0.36, -0.46, -0.80, -1.25, -0.60, -0.85) },
      { wind: P(0.14, -0.10, -0.60, -0.20, 0.00, 0.00), strike: P(0.12, -0.56, -0.90, -1.55, 0.00, 0.00) },
      { wind: P(0.12, -0.36, -0.48, -1.45, 0.00, 0.10), strike: P(0.10, -0.28, -1.13, -1.56, 0.00, 0.00) },
    ],
  },
  axe: {
    scale: 1.23, windup: 0.36,
    stance: P(0.34, -0.20, -0.74, -0.48, 0.05, 0.30),
    beats: [
      { wind: P(0.34, 0.10, -0.48, 0.45, 0.00, 0.12), strike: P(0.10, -0.58, -1.00, -1.62, 0.00, 0.02) },
      { wind: P(0.52, -0.02, -0.54, -0.10, -0.40, -0.95), strike: P(-0.20, -0.56, -0.84, -1.40, 0.55, 1.10) },
      { wind: P(-0.04, -0.02, -0.54, -0.10, 0.40, 0.95), strike: P(0.46, -0.56, -0.82, -1.40, -0.50, -1.05) },
      { wind: P(0.30, 0.16, -0.44, 0.60, 0.00, 0.05), strike: P(0.08, -0.62, -1.04, -1.70, 0.00, 0.00) },
    ],
  },
  warhammer: {
    scale: 1.15, windup: 0.46,
    stance: P(0.36, -0.18, -0.70, -0.42, 0.10, 0.34),
    beats: [
      { wind: P(0.30, 0.20, -0.38, 0.75, 0.00, 0.10), strike: P(0.08, -0.66, -1.06, -1.78, 0.00, 0.00) },
      { wind: P(0.56, 0.02, -0.48, 0.05, -0.50, -1.00), strike: P(-0.16, -0.60, -0.88, -1.45, 0.50, 1.05) },
      { wind: P(0.30, 0.22, -0.36, 0.80, 0.05, 0.12), strike: P(0.10, -0.68, -1.08, -1.80, 0.00, 0.00) },
      { wind: P(-0.02, 0.00, -0.48, 0.05, 0.50, 1.00), strike: P(0.48, -0.60, -0.88, -1.45, -0.50, -1.05) },
    ],
  },
  spear: {
    scale: 1.10, windup: 0.28,
    stance: P(0.26, -0.40, -0.48, -0.95, 0.06, 0.06),   // carried angled up, not levelled at the lens (a levelled shaft laid the forearm across the screen)
    beats: [
      { wind: P(0.28, -0.38, -0.22, -1.44, 0.04, 0.06), strike: P(0.16, -0.32, -1.10, -1.54, 0.00, 0.02) },
      { wind: P(0.30, -0.36, -0.20, -1.40, 0.08, 0.08), strike: P(0.14, -0.30, -1.14, -1.55, -0.02, 0.02) },
      { wind: P(0.46, -0.36, -0.38, -1.45, -0.70, 0.10), strike: P(-0.18, -0.36, -0.58, -1.45, 0.85, 0.10) },
      { wind: P(0.28, -0.30, -0.16, -1.38, 0.04, 0.06), strike: P(0.14, -0.26, -1.20, -1.56, 0.00, 0.00) },
    ],
  },
  scythe: {
    scale: 1.02, windup: 0.36,
    stance: P(0.40, -0.62, -0.80, -0.20, 0.45, 0.08),
    beats: [
      { wind: P(0.62, -0.50, -0.52, -0.30, -1.25, 0.18), strike: P(-0.28, -0.56, -0.96, -0.42, 1.45, 0.10) },
      { wind: P(-0.20, -0.52, -0.58, -0.30, 1.30, 0.10), strike: P(0.62, -0.56, -0.92, -0.42, -1.30, 0.16) },
      { wind: P(0.46, -0.30, -0.48, 0.35, 0.40, 0.10), strike: P(0.14, -0.80, -1.10, -1.10, 0.40, 0.05) },
      { wind: P(0.62, -0.50, -0.52, -0.30, -1.35, 0.18), strike: P(-0.32, -0.56, -0.98, -0.46, 1.55, 0.10) },
    ],
  },
  bow: {
    scale: 1.06, windup: 0.50,
    stance: P(0.16, -0.30, -0.84, -0.06, 0.12, -0.18),
    beats: [
      { wind: P(0.14, -0.28, -0.74, -0.02, 0.06, -0.28), strike: P(0.17, -0.27, -0.90, -0.12, 0.12, -0.12) },
      { wind: P(0.14, -0.28, -0.74, -0.02, 0.06, -0.28), strike: P(0.17, -0.27, -0.90, -0.12, 0.12, -0.12) },
      { wind: P(0.14, -0.28, -0.74, -0.02, 0.06, -0.28), strike: P(0.17, -0.27, -0.90, -0.12, 0.12, -0.12) },
      { wind: P(0.14, -0.28, -0.74, -0.02, 0.06, -0.28), strike: P(0.17, -0.27, -0.90, -0.12, 0.12, -0.12) },
    ],
  },
  staff: {
    scale: 1.02, windup: 0.32,
    stance: P(0.32, -0.62, -0.74, -0.30, 0.12, 0.16),
    beats: [
      { wind: P(0.34, -0.48, -0.58, -0.05, 0.10, 0.22), strike: P(0.24, -0.50, -1.04, -0.85, 0.04, 0.08) },
      { wind: P(0.36, -0.46, -0.58, -0.02, 0.18, 0.28), strike: P(0.22, -0.52, -1.06, -0.88, -0.06, 0.06) },
      { wind: P(0.34, -0.42, -0.54, 0.05, 0.10, 0.20), strike: P(0.24, -0.50, -1.08, -0.90, 0.02, 0.08) },
      { wind: P(0.38, -0.46, -0.58, -0.05, 0.20, 0.30), strike: P(0.22, -0.52, -1.04, -0.85, -0.04, 0.06) },
    ],
  },
  grimoire: {
    scale: 1.27, windup: 0.36,
    stance: P(0.26, -0.40, -0.70, -0.62, 0.55, 0.00),
    beats: [
      { wind: P(0.24, -0.30, -0.62, -0.25, 0.45, 0.05), strike: P(0.16, -0.30, -0.94, -0.75, 0.20, 0.00) },
      { wind: P(0.26, -0.30, -0.62, -0.25, 0.55, -0.05), strike: P(0.16, -0.30, -0.94, -0.75, 0.25, 0.00) },
      { wind: P(0.24, -0.26, -0.60, -0.20, 0.45, 0.05), strike: P(0.14, -0.28, -0.98, -0.78, 0.20, 0.00) },
      { wind: P(0.26, -0.30, -0.62, -0.25, 0.55, -0.05), strike: P(0.16, -0.30, -0.94, -0.75, 0.25, 0.00) },
    ],
  },
};

const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
};

const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _e = new THREE.Euler();
const qOf = (pose, q) => q.setFromEuler(_e.set(pose.r[0], pose.r[1], pose.r[2]));

/**
 * Blend two poses into `outPos` / `outQuat` at t ∈ [0,1].
 */
function blend(a, b, t, outPos, outQuat) {
  outPos.set(
    a.p[0] + (b.p[0] - a.p[0]) * t,
    a.p[1] + (b.p[1] - a.p[1]) * t,
    a.p[2] + (b.p[2] - a.p[2]) * t);
  qOf(a, _qa); qOf(b, _qb);
  outQuat.slerpQuaternions(_qa, _qb, t);
}

/**
 * The mount transform for a weapon at swing progress u (null = at rest).
 * @param {string} key   weaponPlanKey
 * @param {number} beat  0..3
 * @param {number|null} u 0..1 or null
 */
export function samplePose(key, beat, u, outPos, outQuat) {
  const m = MOTION[key] || MOTION.sword;
  if (u === null || u >= 1 || u < 0) { blend(m.stance, m.stance, 0, outPos, outQuat); return m; }
  const b = m.beats[beat & 3];
  const w = m.windup, s = w + 0.16, f = 0.58;
  if (u < w) {
    blend(m.stance, b.wind, ease.inOut(u / w), outPos, outQuat);
  } else if (u < s) {
    blend(b.wind, b.strike, ease.outQuint((u - w) / (s - w)), outPos, outQuat);
  } else if (u < f) {
    // Follow-through: carry a little past the strike end, then settle back onto it.
    const k = (u - s) / (f - s);
    const over = Math.sin(k * Math.PI) * 0.12;
    blend(b.wind, b.strike, 1 + over, outPos, outQuat);
  } else {
    blend(b.strike, m.stance, ease.inOut((u - f) / (1 - f)), outPos, outQuat);
  }
  return m;
}
