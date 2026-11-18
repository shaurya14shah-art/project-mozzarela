// ══════════════════════════════════════════════════════════
// Particle Bursts — pooled, instanced, cheap
//
// Every hit/cast/death effect in this game used to be one expanding-
// and-fading mesh (see Projectile.js's old _spawnImpact/spawnMuzzleFlash,
// which also `new`'d and `.dispose()`d a fresh MeshBasicMaterial on
// EVERY single impact — real GC/driver churn under sustained combat).
// That reads as a flash, not a hit.
//
// This is a fixed pool of InstancedMesh "emitter slots" — built once,
// never reallocated — so a burst call is just: claim a slot, write up
// to SLOT_CAPACITY instance transforms/colours, done. No new geometry,
// no new material, no per-frame Vector3 allocation in the hot loop.
//
// Each element gets a MOTION ARCHETYPE, not just a colour — fire/
// lightning/light burst outward and arc down hard (explosive);
// earth/poison/neutral drop as heavy, slow debris; water/ice/wind
// spray and drift; shadow/void/arcane billow out and curl back in on
// themselves (a "swallowing" motion, the opposite of an explosion).
// Colour is a 60/40 dark/bright split per particle, not one pure hue —
// full-saturation particles read as cartoon sparkle; a grounded dark
// variant mixed in is what keeps a hit looking heavy instead of festive.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { sceneManager } from './SceneManager.js';
import { ELEMENTS, ELEMENT_COLORS } from '../data/constants.js';

const hex = (css) => parseInt((css || '#888888').replace('#', ''), 16);

const SHARD_GEO = new THREE.TetrahedronGeometry(0.055, 0);
const SLOT_CAPACITY = 14;
const SLOT_COUNT = 8;

// Fibonacci-sphere sample, precomputed once — bursts index into this
// instead of allocating a fresh randomized Vector3 per particle.
const DIRECTION_TABLE = (() => {
  const n = 40;
  const pts = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    pts.push(new THREE.Vector3(Math.cos(theta) * r, Math.max(y, -0.2), Math.sin(theta) * r));
  }
  return pts;
})();

const FAMILY = {
  [ELEMENTS.FIRE]: 'explosive', [ELEMENTS.LIGHTNING]: 'explosive', [ELEMENTS.LIGHT]: 'explosive',
  [ELEMENTS.EARTH]: 'heavy', [ELEMENTS.POISON]: 'heavy', [ELEMENTS.NEUTRAL]: 'heavy',
  [ELEMENTS.WATER]: 'spray', [ELEMENTS.ICE]: 'spray', [ELEMENTS.WIND]: 'spray',
  [ELEMENTS.SHADOW]: 'collapse', [ELEMENTS.VOID]: 'collapse', [ELEMENTS.ARCANE]: 'collapse',
};

const ARCHETYPES = {
  explosive: { speed: 4.4, gravity: 7.5, drag: 0.90, curl: 0 },
  heavy:     { speed: 2.0, gravity: 15,  drag: 0.86, curl: 0 },
  spray:     { speed: 3.4, gravity: 2.0, drag: 0.80, curl: 0 },
  collapse:  { speed: 3.0, gravity: 1.0, drag: 0.88, curl: -3.4 }, // negative: pulls back toward centre
};

// Precomputed once per element — a desaturated, darker "material" tone
// derived off the same ELEMENT_COLORS everything else already tints
// from, not a hand-picked second palette.
const GROUNDED_COLORS = {};
const BRIGHT_COLORS = {};
for (const el of Object.values(ELEMENTS)) {
  const bright = new THREE.Color(hex(ELEMENT_COLORS[el]));
  BRIGHT_COLORS[el] = bright;
  const hsl = { h: 0, s: 0, l: 0 };
  bright.getHSL(hsl);
  GROUNDED_COLORS[el] = new THREE.Color().setHSL(hsl.h, Math.max(0, hsl.s - 0.42), Math.max(0.06, hsl.l - 0.34));
}

const _dummy = new THREE.Object3D();
const _lookTarget = new THREE.Vector3();

class ParticleBurstPool {
  constructor() {
    this._slots = [];
    this._nextSlot = 0;
    this._ready = false;
  }

  /**
   * Deferred, like CharacterPreviewUI/ChunkManager/etc. — this module
   * is imported (and the singleton constructed) by Projectile.js,
   * Enemy.js and main.js at their own module-load time, which happens
   * before main.js's initGame() ever calls sceneManager.init(). Doing
   * the actual sceneManager.add() calls in the constructor meant
   * every one of them ran against a scene that didn't exist yet.
   * Called once from initGame(), right after sceneManager.init().
   */
  init() {
    if (this._ready) return;
    // One shared material per slot (mutated via instance colour, never
    // rebuilt) — additive so overlapping shards read as glowing debris
    // rather than flat matte chips.
    for (let i = 0; i < SLOT_COUNT; i++) {
      const mat = new THREE.MeshBasicMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.InstancedMesh(SHARD_GEO, mat, SLOT_CAPACITY);
      mesh.count = 0; // nothing visible until a burst claims this slot
      mesh.frustumCulled = false;
      sceneManager.add(mesh);
      this._slots.push({ mesh, active: false, life: 0, maxLife: 0, particles: [], archetype: null });
    }
    this._ready = true;
  }

  /**
   * Fire one burst at `position` for `element` — steals the next slot
   * in round-robin order (same "steal-oldest" idea as the enemy-count
   * cap elsewhere), so a fast kill chain reuses slots instead of the
   * pool growing unbounded or silently dropping later bursts.
   */
  spawn(position, element, { count = 10, sizeMult = 1, life = 0.5 } = {}) {
    if (!this._ready) return;
    const slot = this._slots[this._nextSlot];
    this._nextSlot = (this._nextSlot + 1) % SLOT_COUNT;

    const family = FAMILY[element] || 'heavy';
    const archetype = ARCHETYPES[family];
    const bright = BRIGHT_COLORS[element] || BRIGHT_COLORS[ELEMENTS.NEUTRAL];
    const dark = GROUNDED_COLORS[element] || GROUNDED_COLORS[ELEMENTS.NEUTRAL];

    slot.active = true;
    slot.life = slot.maxLife = life;
    slot.archetype = archetype;
    slot.mesh.position.copy(position);
    slot.mesh.count = Math.min(count, SLOT_CAPACITY);
    slot.particles.length = 0;

    const offset = Math.floor(Math.random() * DIRECTION_TABLE.length);
    for (let i = 0; i < slot.mesh.count; i++) {
      const dir = DIRECTION_TABLE[(i * 7 + offset) % DIRECTION_TABLE.length];
      const speed = archetype.speed * (0.8 + Math.random() * 0.4) * sizeMult;
      const color = Math.random() < 0.4 ? bright : dark;
      slot.particles.push({
        pos: new THREE.Vector3(0, 0, 0),
        vel: dir.clone().multiplyScalar(speed),
      });
      slot.mesh.setColorAt(i, color);
    }
    if (slot.mesh.instanceColor) slot.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    for (const slot of this._slots) {
      if (!slot.active) continue;
      slot.life -= dt;
      if (slot.life <= 0) {
        slot.active = false;
        slot.mesh.count = 0;
        continue;
      }

      const arc = slot.archetype;
      const frac = slot.life / slot.maxLife; // 1 → 0 across the burst's life
      // Shrinks to nothing over the final 30% — a collapsing silhouette
      // reads as "burning out" even under bloom, where an opacity fade
      // alone tends to wash out instead.
      const shrink = frac < 0.3 ? Math.max(0, frac / 0.3) : 1;

      for (let i = 0; i < slot.particles.length; i++) {
        const p = slot.particles[i];
        p.vel.y -= arc.gravity * dt;
        if (arc.curl) {
          // Pulls back toward the burst's own centre — the "swallowing"
          // motion shadow/void/arcane use instead of an outward blast.
          p.vel.addScaledVector(p.pos, arc.curl * dt);
        }
        p.vel.multiplyScalar(1 - Math.min(1, (1 - arc.drag) * dt * 10));
        p.pos.addScaledVector(p.vel, dt);

        _dummy.position.copy(p.pos);
        const s = 0.35 + 0.65 * shrink;
        _dummy.scale.set(s, s, s);
        // Elongated along its own velocity — a streaked shard reads as
        // twice as busy as a tumbling one, for zero extra particles.
        if (p.vel.lengthSq() > 0.0004) {
          _lookTarget.copy(_dummy.position).add(p.vel);
          _dummy.lookAt(_lookTarget);
          _dummy.scale.z *= 1.9;
        }
        _dummy.updateMatrix();
        slot.mesh.setMatrixAt(i, _dummy.matrix);
      }
      slot.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

export const particleBursts = new ParticleBurstPool();
