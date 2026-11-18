// ══════════════════════════════════════════════════════════
// Spell VFX — what a spell looks like, per element and catalyst
//
// ── THE PROBLEM ───────────────────────────────────────────
// WandSystem._spawnVisual built its mesh from the spell's FORM alone —
// five shapes, cone/ico/sphere/wireframe/octahedron — and the only
// per-element variation in the entire pipeline was `color`. So every
// Lance in the game was the same cone in a different tint: a Fire
// Lance, an Ice Lance, a Void Lance and a Poison Lance were, visually,
// one asset four times.
//
// That is a spell system with 1,380 identities and 5 animations.
//
// ── THE FIX: THREE AXES, COMPOSED ─────────────────────────
// The spell's identity already has three parts (see spellcraft.js and
// catalysts.js). The visual now uses all three instead of one:
//
//   FORM      → the base shape and gross motion. Owned by WandSystem;
//               unchanged, because it was never the part that was wrong.
//   ELEMENT   → CHARACTER. Geometry style, spin behaviour, how it
//               moves through the air, whether it flickers, wobbles,
//               jitters, tumbles or holds dead still. This file.
//   CATALYST  → a flourish tied to the behaviour the catalyst already
//               grants. An Arcing spell visibly branches; a Swarming
//               one visibly splits; a Detonating one visibly builds.
//
// ── WHY ANIMATORS AND NOT JUST GEOMETRY ───────────────────
// A different mesh per element would still leave everything MOVING
// identically, and motion is what the eye reads first at speed. Ice
// that spins rigidly and fire that flickers and gutters are different
// spells even if you paused them and found the same shape. So each
// element contributes a per-frame `animate(p, dt, t)` as well as a
// builder, and the animator is the half that does the heavy lifting.
//
// ⚠️ Animators must be CHEAP and ALLOCATION-FREE. They run per
// projectile per frame, and a Hunt volley at `over` tier is 6+ live
// projectiles. No `new THREE.Vector3()` inside an animator — use the
// scratch vectors at the bottom of this file.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { ELEMENTS } from '../data/constants.js';
import { seg, icoDetail } from './GeoForge.js';

// Scratch — see the allocation warning above.
const _v = new THREE.Vector3();

/**
 * Per-element visual character.
 *
 * `build(baseGeo, size)` may return a replacement geometry, or null to
 * keep the form's own shape. Returning null is the right answer for
 * elements whose identity is in their MOTION rather than their outline
 * (lightning, shadow) — swapping the geometry there would only make
 * the form harder to read.
 *
 * `animate(p, dt, t)` runs every frame. `p` is the projectile record
 * ({mesh, payload, life, baseScale, ...}), `t` is a shared clock.
 *
 * `spin` replaces the default tumble. 0 means "hold still", which is a
 * deliberate and readable choice for ice and light.
 */
export const ELEMENT_VFX = {
  [ELEMENTS.FIRE]: {
    // Guttering. Scale and opacity flicker on two out-of-phase sines so
    // it never settles into a visible rhythm.
    spin: 3.0,
    animate(p, dt, t) {
      const f = 1 + Math.sin(t * 37 + p.seed) * 0.13 + Math.sin(t * 61 + p.seed) * 0.07;
      p.mesh.scale.setScalar(p.baseScale * f);
      if (p.mesh.material) p.mesh.material.opacity = 0.78 + Math.sin(t * 43 + p.seed) * 0.18;
      // Rises as it travels — fire does not fly level.
      p.mesh.position.y += dt * 0.55;
    },
  },

  [ELEMENTS.ICE]: {
    // Rigid. Ice is the one thing in the game that should look like it
    // is NOT alive: a single slow axial rotation, no wobble, no flicker.
    build: (size) => new THREE.OctahedronGeometry(size * 1.15, 0),
    spin: 0,
    animate(p, dt, t) {
      p.mesh.rotation.y += dt * 1.1;
      p.mesh.scale.setScalar(p.baseScale);
    },
  },

  [ELEMENTS.LIGHTNING]: {
    // Jitter. Snaps to a new random offset a few times a second rather
    // than easing — smooth motion reads as "energy", stepped motion
    // reads as "electricity".
    spin: 0,
    animate(p, dt, t) {
      p._jt = (p._jt || 0) - dt;
      if (p._jt <= 0) {
        p._jt = 0.035;
        p.mesh.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
        const s = p.baseScale * (0.82 + Math.random() * 0.4);
        p.mesh.scale.set(s, s * (0.7 + Math.random() * 0.7), s);
      }
    },
  },

  [ELEMENTS.WATER]: {
    // Wobble — a fluid volume trying and failing to hold a shape.
    // Non-uniform scale on three phases so it is never spherical.
    build: (size) => new THREE.SphereGeometry(size, seg(10), seg(8)),
    spin: 1.2,
    animate(p, dt, t) {
      const b = p.baseScale;
      p.mesh.scale.set(
        b * (1 + Math.sin(t * 9 + p.seed) * 0.18),
        b * (1 + Math.sin(t * 9 + p.seed + 2.1) * 0.18),
        b * (1 + Math.sin(t * 9 + p.seed + 4.2) * 0.18),
      );
    },
  },

  [ELEMENTS.WIND]: {
    // Corkscrews around its own flight line. The only element whose
    // PATH, not its body, carries the identity.
    spin: 8.0,
    animate(p, dt, t) {
      // Build a perpendicular from the direction without allocating.
      _v.set(-p.direction.z, 0, p.direction.x).normalize();
      const a = t * 11 + p.seed;
      p.mesh.position.addScaledVector(_v, Math.cos(a) * dt * 3.2);
      p.mesh.position.y += Math.sin(a) * dt * 3.2;
    },
  },

  [ELEMENTS.EARTH]: {
    // A tumbling lump. Heavy, irregular, and it DROPS — the only
    // projectile in the game with an arc.
    build: (size) => new THREE.DodecahedronGeometry(size * 1.1, 0),
    spin: 2.2,
    animate(p, dt) {
      p._fall = (p._fall || 0) + dt * 5.5;
      p.mesh.position.y -= p._fall * dt;
    },
  },

  [ELEMENTS.SHADOW]: {
    // Smears: stretched along its flight line and fading in and out of
    // legibility, so it is hard to track by eye. Deliberately the least
    // readable projectile in the game — that IS shadow's identity.
    spin: 0,
    animate(p, dt, t) {
      const b = p.baseScale;
      p.mesh.scale.set(b * 0.55, b * 0.55, b * (1.9 + Math.sin(t * 5 + p.seed) * 0.5));
      p.mesh.lookAt(_v.copy(p.mesh.position).add(p.direction));
      if (p.mesh.material) p.mesh.material.opacity = 0.45 + Math.sin(t * 6 + p.seed) * 0.3;
    },
  },

  [ELEMENTS.LIGHT]: {
    // Absolutely steady, and it grows. Light is the counterweight to
    // shadow: the easiest thing in the game to track.
    build: (size) => new THREE.IcosahedronGeometry(size, icoDetail(1)),
    spin: 0,
    animate(p, dt, t) {
      p.mesh.scale.setScalar(p.baseScale * (1 + (1 - p.life / (p.maxLife || 2)) * 0.5));
    },
  },

  [ELEMENTS.VOID]: {
    // Collapses inward and pulses black. Scale runs BACKWARDS — it gets
    // smaller and denser as it travels, which no other element does.
    build: (size) => new THREE.IcosahedronGeometry(size * 1.3, icoDetail(0)),
    spin: 5.0,
    animate(p, dt, t) {
      const k = Math.max(0.35, p.life / (p.maxLife || 2));
      p.mesh.scale.setScalar(p.baseScale * k * (1 + Math.sin(t * 14 + p.seed) * 0.1));
      if (p.mesh.material) p.mesh.material.opacity = 0.55 + (1 - k) * 0.45;
    },
  },

  [ELEMENTS.ARCANE]: {
    // A core with a ring of orbiting motes, built once and spun as a
    // unit — the only element with visible sub-structure.
    build: (size) => new THREE.TorusGeometry(size, size * 0.34, seg(8), seg(16)),
    spin: 0,
    animate(p, dt, t) {
      p.mesh.rotation.x += dt * 3.1;
      p.mesh.rotation.y += dt * 4.7;
      p.mesh.scale.setScalar(p.baseScale * (1 + Math.sin(t * 7 + p.seed) * 0.08));
    },
  },

  [ELEMENTS.POISON]: {
    // Bubbles: swells and shrinks on a slow irregular cycle, and sags.
    build: (size) => new THREE.SphereGeometry(size, seg(9), seg(7)),
    spin: 0.8,
    animate(p, dt, t) {
      const b = p.baseScale * (1 + Math.sin(t * 3.3 + p.seed) * 0.22);
      p.mesh.scale.set(b, b * 0.82, b);
      p.mesh.position.y -= dt * 0.35;
    },
  },
};

/**
 * Catalyst flourishes — a visible consequence for the behaviour the
 * catalyst already grants mechanically.
 *
 * ⚠️ Keyed on the catalyst's OWN id (see data/catalysts.js), not on the
 * effect tag, because two catalysts can grant the same tag for
 * different reasons and should not look identical.
 *
 * Only catalysts whose behaviour is actually visible in flight get an
 * entry. One that only changes mana cost has nothing to show, and
 * inventing a flourish for it would be decoration pretending to be
 * information.
 */
export const CATALYST_VFX = {
  // Chains — a second, smaller body trailing behind on a lag.
  arcing: {
    trail: 2,
    animate(p, dt, t) {
      for (let i = 0; i < p._trail.length; i++) {
        const lag = (i + 1) * 0.11;
        p._trail[i].position.copy(p.mesh.position).addScaledVector(p.direction, -lag * 9);
        p._trail[i].scale.setScalar(p.baseScale * (0.5 - i * 0.14));
      }
    },
  },
  // Builds toward going off: swells and brightens over its whole life.
  detonating: {
    animate(p, dt, t) {
      const grown = 1 - p.life / (p.maxLife || 2);
      p.mesh.scale.setScalar(p.baseScale * (1 + grown * 1.4));
      if (p.mesh.material) p.mesh.material.emissiveIntensity = 1.2 + grown * 2.5;
    },
  },
  // Several small bodies orbiting a common centre.
  swarming: {
    trail: 3,
    animate(p, dt, t) {
      for (let i = 0; i < p._trail.length; i++) {
        const a = t * 7 + (i / p._trail.length) * 6.28;
        p._trail[i].position.copy(p.mesh.position);
        p._trail[i].position.x += Math.cos(a) * 0.55;
        p._trail[i].position.y += Math.sin(a * 1.3) * 0.4;
        p._trail[i].position.z += Math.sin(a) * 0.55;
        p._trail[i].scale.setScalar(p.baseScale * 0.4);
      }
    },
  },
  // Rides dead flat and fast — no bob, no tumble.
  earthed: {
    animate(p) { p.mesh.rotation.set(0, 0, 0); },
  },
  // Leaves a fading wake.
  flowing: {
    trail: 3,
    animate(p, dt, t) {
      for (let i = 0; i < p._trail.length; i++) {
        const lag = (i + 1) * 0.08;
        p._trail[i].position.copy(p.mesh.position).addScaledVector(p.direction, -lag * 11);
        p._trail[i].scale.setScalar(p.baseScale * (0.7 - i * 0.18));
        if (p._trail[i].material) p._trail[i].material.opacity = 0.5 - i * 0.13;
      }
    },
  },
  // Contracts to a hard point.
  devouring: {
    animate(p, dt, t) {
      const k = Math.max(0.2, p.life / (p.maxLife || 2));
      p.mesh.scale.setScalar(p.baseScale * k * 0.8);
      if (p.mesh.material) p.mesh.material.emissiveIntensity = 1.2 + (1 - k) * 3;
    },
  },
  // ── The remaining catalysts ──
  // ⚠️ Originally only the seven most obviously-kinetic catalysts had a
  // flourish, on the reasoning that a catalyst which only changes mana
  // cost has nothing to show. That was wrong from the player's side:
  // the catalyst is part of the spell's NAME and identity, so a
  // "Proofed" spell that looks exactly like an uncatalysed one reads as
  // the catalyst having failed. Every catalyst now has a visible
  // signature; the quiet ones are quiet, not absent.

  // Steadier and it bites longer — a slow confident pulse.
  tempered: {
    animate(p, dt, t) {
      p.mesh.scale.setScalar(p.baseScale * (1 + Math.sin(t * 4 + p.seed) * 0.09));
    },
  },
  // Steam: swells outward and thins.
  scalding: {
    animate(p, dt, t) {
      const g = 1 - p.life / (p.maxLife || 2);
      p.mesh.scale.setScalar(p.baseScale * (1 + g * 0.9));
      if (p.mesh.material) p.mesh.material.opacity = Math.max(0.25, 0.9 - g * 0.5);
    },
  },
  // Heavy and certain — squashed along its axis, and it does not spin.
  bedded: {
    animate(p) {
      const b = p.baseScale;
      p.mesh.scale.set(b * 1.25, b * 0.7, b * 1.25);
      p.mesh.rotation.set(0, p.mesh.rotation.y, 0);
    },
  },
  // Stone heated and dropped: shivers, then throws splinters.
  fracturing: {
    trail: 3,
    animate(p, dt, t) {
      for (let i = 0; i < p._trail.length; i++) {
        const a = t * 3 + i * 2.1 + p.seed;
        const spread = (1 - p.life / (p.maxLife || 2)) * 1.6;
        p._trail[i].position.copy(p.mesh.position);
        p._trail[i].position.x += Math.cos(a) * spread;
        p._trail[i].position.y += Math.sin(a * 0.7) * spread * 0.6;
        p._trail[i].position.z += Math.sin(a) * spread;
        p._trail[i].scale.setScalar(p.baseScale * 0.3);
      }
    },
  },
  // Goes where you were looking — a long smooth banking drift.
  carried: {
    animate(p, dt, t) {
      _v.set(-p.direction.z, 0, p.direction.x).normalize();
      p.mesh.position.addScaledVector(_v, Math.sin(t * 2.2 + p.seed) * dt * 2.4);
    },
  },
  // The pot screamed: a wide flat ring that pulls inward.
  howling: {
    animate(p, dt, t) {
      const b = p.baseScale;
      const w = 1.3 + Math.sin(t * 12 + p.seed) * 0.35;
      p.mesh.scale.set(b * w, b * 0.45, b * w);
      p.mesh.rotation.y += dt * 9;
    },
  },
  // Nothing in it that should not be.
  //
  // ⚠️ Was byte-identical to `earthed` (both "hold still at base
  // scale"), caught by comparing every catalyst's full per-frame state
  // vector against every other. Two catalysts that mean different
  // things must not animate the same. `earthed` is grounded and flat —
  // it goes exactly where it is sent. `clear` is PRISTINE: bigger,
  // brighter, and turning slowly enough to show that it is flawless.
  clear: {
    animate(p, dt, t) {
      p.mesh.scale.setScalar(p.baseScale * 1.18);
      p.mesh.rotation.set(0, t * 0.8 + p.seed, 0);
      if (p.mesh.material) p.mesh.material.emissiveIntensity = 1.7;
    },
  },
  // Ice into a boiling pot — violent irregular stutter.
  shocked: {
    animate(p, dt, t) {
      p._st = (p._st || 0) - dt;
      if (p._st <= 0) {
        p._st = 0.06;
        const s = p.baseScale * (0.7 + Math.random() * 0.75);
        p.mesh.scale.set(s, s * (0.6 + Math.random() * 0.9), s);
      }
    },
  },
  // Arrives before it is noticed: nearly invisible, then snaps solid.
  quiet: {
    animate(p, dt, t) {
      const k = p.life / (p.maxLife || 2);
      if (p.mesh.material) p.mesh.material.opacity = k > 0.35 ? 0.18 : 0.95;
      p.mesh.scale.setScalar(p.baseScale * (k > 0.35 ? 0.7 : 1.2));
    },
  },
  // Does not flicker, and mends what it passes — a soft steady halo.
  steady: {
    animate(p, dt, t) {
      p.mesh.scale.setScalar(p.baseScale * 1.15);
      if (p.mesh.material) p.mesh.material.emissiveIntensity = 1.6;
    },
  },
  // Weighs less than it should — drifts upward, barely there.
  hollow: {
    animate(p, dt, t) {
      p.mesh.position.y += dt * 0.9;
      if (p.mesh.material) p.mesh.material.opacity = 0.4 + Math.sin(t * 3 + p.seed) * 0.12;
      p.mesh.scale.setScalar(p.baseScale * 0.85);
    },
  },
  // Worked out properly: geometric, regular, exact.
  proofed: {
    animate(p, dt, t) {
      p.mesh.rotation.set(0, t * 2.4 + p.seed, 0);
      p.mesh.scale.setScalar(p.baseScale);
    },
  },
  // The working got away from whoever started it.
  unstable: {
    animate(p, dt, t) {
      const b = p.baseScale * (0.6 + Math.random() * 0.9);
      p.mesh.scale.setScalar(b);
      p.mesh.rotation.x += dt * (4 + Math.random() * 14);
      if (p.mesh.material) p.mesh.material.emissiveIntensity = 1 + Math.random() * 2.4;
    },
  },
  // Given time to become itself — slow, patient, sagging.
  steeped: {
    animate(p, dt, t) {
      const b = p.baseScale * (1 + Math.sin(t * 1.8 + p.seed) * 0.14);
      p.mesh.scale.set(b, b * 0.8, b);
      p.mesh.position.y -= dt * 0.5;
    },
  },
  // Cooked, and it spreads.
  virulent: {
    trail: 2,
    animate(p, dt, t) {
      const g = 1 - p.life / (p.maxLife || 2);
      for (let i = 0; i < p._trail.length; i++) {
        const a = t * 5 + i * 3.14 + p.seed;
        p._trail[i].position.copy(p.mesh.position);
        p._trail[i].position.x += Math.cos(a) * (0.4 + g);
        p._trail[i].position.z += Math.sin(a) * (0.4 + g);
        p._trail[i].scale.setScalar(p.baseScale * 0.45);
      }
      p.mesh.scale.setScalar(p.baseScale * (1 + g * 0.4));
    },
  },

  // Too bright to look at, and getting brighter.
  blinding: {
    animate(p, dt, t) {
      if (p.mesh.material) {
        // ⚠️ 2.4 ± 0.9, not 2.0 ± 1.2. The wider swing put the trough at
        // 0.8 — DIMMER than the 1.2 baseline — so a spell called
        // Blinding spent part of every cycle darker than an uncatalysed
        // one. Measured, not eyeballed. The floor must stay above base.
        p.mesh.material.emissiveIntensity = 2.4 + Math.sin(t * 20 + p.seed) * 0.9;
      }
      p.mesh.scale.setScalar(p.baseScale * (1.1 + Math.sin(t * 20 + p.seed) * 0.15));
    },
  },
};

/**
 * The BODY of a spell projectile for a given element — shared by every
 * cast path in the game.
 *
 * ⚠️ This exists because the two cast paths had diverged completely.
 * WandSystem._spawnVisual (brewed spells) got all the element character
 * added above; ProjectileManager.spawnFireball (CLASS SKILLS — the
 * `fireball` in every starting kit, and the ONLY thing castable before
 * the player has brewed anything) was a hardcoded core sphere plus a
 * translucent additive shell, always orange, for every element.
 *
 * Since the wand starts with zero infused slots, that hardcoded sphere
 * was in practice the ONLY spell visual a new player ever saw. Every
 * element animator in this file was live and unreachable.
 *
 * One builder now serves both. Returns a Group so callers can attach
 * lights/trails, with `.userData.body` pointing at the mesh the
 * animators should drive.
 *
 * @param {string} element
 * @param {number} size
 * @param {THREE.Color|number} color
 */
export function buildSpellBody(element, size, color) {
  const g = new THREE.Group();
  const vfx = ELEMENT_VFX[element];
  const col = new THREE.Color(color);

  const shape = (r) => (vfx?.build ? vfx.build(r) : new THREE.IcosahedronGeometry(r, icoDetail(0)));

  // ── ⚠️ SHAPE FIRST, GLOW SECOND ──
  //
  // The first version of this was an additive body with a pure-white
  // additive core. On screen, through bloom, EVERY element came out as
  // the same white blob — the shapes were genuinely different and
  // completely invisible, which is what "just a translucent hollow
  // sphere, nothing unique" was describing. Additive blending sums
  // toward white by construction, and bloom then smears the result
  // past its own silhouette.
  //
  // So the OUTER layer is now opaque, normal-blended, and depth-writing:
  // that is what gives the projectile an edge the eye can actually
  // resolve. The glow is an additive layer INSIDE it. Shape is carried
  // by the solid; energy is carried by the core; bloom can only eat the
  // core.
  // ⚠️ MeshStandardMaterial, NOT MeshBasicMaterial.
  //
  // Basic has no shading whatsoever, so every projectile came out as a
  // flat coloured sticker — the shapes were finally distinguishable but
  // they had no volume, which is its own version of "nothing unique".
  // Standard + a strong emissive keeps it self-lit (it must not go dark
  // in a Descent, where the key light is crushed to 45%) while still
  // taking a highlight and a shaded side, which is what makes a
  // dodecahedron read as a solid rather than as a hexagon.
  const shell = new THREE.Mesh(shape(size), new THREE.MeshStandardMaterial({
    color: col.clone().multiplyScalar(0.55),
    emissive: col.clone().multiplyScalar(0.85),
    emissiveIntensity: 1.35,
    roughness: 0.32,
    metalness: 0.15,
    transparent: true,
    opacity: 0.94,
    depthWrite: true,
  }));
  shell.name = 'spell-body';
  g.add(shell);

  // A hard rim, one shade darker, very slightly larger and back-faced.
  // Standard cheap outline trick: you only ever see it where the shell
  // curves away, so it reads as a contour line rather than a second
  // object — and it is what keeps the silhouette legible against a
  // bright sky or a bloomed background.
  const rim = new THREE.Mesh(shape(size * 1.14), new THREE.MeshBasicMaterial({
    color: col.clone().multiplyScalar(0.22),
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.85,
    toneMapped: false,
  }));
  rim.name = 'spell-rim';
  g.add(rim);

  // The glow. Additive, INSIDE the shell, and tinted with the element's
  // own colour rather than pure white — white saturates through bloom
  // and is the single biggest reason every spell looked identical.
  const core = new THREE.Mesh(shape(size * 0.62), new THREE.MeshBasicMaterial({
    color: col.clone().lerp(new THREE.Color(0xffffff), 0.35),
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    toneMapped: false,
  }));
  core.name = 'spell-core';
  g.add(core);

  g.userData.body = shell;
  g.userData.core = core;
  g.userData.rim = rim;
  return g;
}

/** The element's visual profile, or a neutral default. */
export function vfxFor(element) {
  return ELEMENT_VFX[element] || null;
}

/** The catalyst's flourish, or null. */
export function catalystVfxFor(catalystId) {
  return catalystId ? (CATALYST_VFX[catalystId] || null) : null;
}
