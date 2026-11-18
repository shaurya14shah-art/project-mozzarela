import * as THREE from 'three';
import { sceneManager } from '../rendering/SceneManager.js';
import { cameraController } from '../rendering/CameraController.js';
import { eventBus, Events } from '../core/EventBus.js';
import { particleBursts } from '../rendering/ParticleBursts.js';
import { ELEMENTS, ELEMENT_COLORS } from '../data/constants.js';
import { audioSystem } from '../systems/AudioSystem.js';

import { seg, icoDetail } from '../rendering/GeoForge.js';
import { buildSpellBody, vfxFor } from '../rendering/SpellVFX.js';
// ── Shared geometry ──────────────────────────────────────────
// A skill-cast fireball can fire every half-second under sustained
// combat, so these are built once and reused (via .scale, not a
// fresh BufferGeometry per shot). Faceted icosahedra, not spheres —
// the rest of the game (PropForge/EntityForge) is low-poly and
// faceted throughout; a smooth round ball was the one thing on
// screen that didn't look like it belonged to this game, on top of
// a rotation on a sphere doing nothing visible at all.
const CORE_GEO  = new THREE.IcosahedronGeometry(0.16, icoDetail(0));
const SHELL_GEO = new THREE.IcosahedronGeometry(0.30, icoDetail(0));

// Tapered cone trailing the bolt: tip at the local origin, tail
// running along local -Y, so orienting local +Y opposite the travel
// direction points the tip the way the bolt is actually moving.
const TRAIL_GEO = new THREE.ConeGeometry(0.13, 1.1, seg(5));
TRAIL_GEO.translate(0, -0.55, 0);

const BURST_GEO = new THREE.IcosahedronGeometry(1, icoDetail(1));
const _UP = new THREE.Vector3(0, 1, 0);

// Skill-cast call sites only ever hand this a colorHex, not an element
// name — nearest-hue match against ELEMENT_COLORS so the new particle
// burst still picks the right motion archetype without threading an
// element string through every _shootFireball() call site.
function _closestElement(colorHex) {
  const c = new THREE.Color(colorHex);
  let best = ELEMENTS.FIRE, bestDist = Infinity;
  for (const el of Object.values(ELEMENTS)) {
    const ec = new THREE.Color(parseInt(ELEMENT_COLORS[el].replace('#', ''), 16));
    const dist = (c.r - ec.r) ** 2 + (c.g - ec.g) ** 2 + (c.b - ec.b) ** 2;
    if (dist < bestDist) { bestDist = dist; best = el; }
  }
  return best;
}

class ProjectileManager {
  constructor() {
    this.projectiles = [];
    this.effects = []; // short-lived impact bursts — not projectiles, don't move or collide
  }

  /**
   * colorHex lets each skill actually look like its own element —
   * this used to be hardcoded to fire-orange regardless of what the
   * caller passed in, so Dark Blast (purple) rendered identical to
   * Fireball.
   */
  spawnFireball(position, direction, damage, colorHex = 0xff4411, element = null) {
    const dir = direction.clone().normalize();
    const baseColor = new THREE.Color(colorHex);

    // ⚠️ THE CAST PATH THE PLAYER ACTUALLY SEES.
    //
    // This used to be a hardcoded core sphere + translucent additive
    // shell sphere, identical for every element, with `colorHex` as the
    // only variation — the "translucent hollow sphere" complaint.
    //
    // Worse, it was in practice the ONLY spell visual a new player ever
    // saw: the wand starts with zero infused slots, so the class skill
    // `fireball` is the only castable thing until something is brewed,
    // and every element animator in SpellVFX was live and unreachable.
    //
    // Now it builds through the same buildSpellBody() the brewed-spell
    // path uses, and runs the same per-element animator, so an ice bolt
    // and a void bolt are genuinely different objects moving in
    // genuinely different ways.
    const el = element || _closestElement(colorHex);
    const group = buildSpellBody(el, 0.30, baseColor);
    const core = group.userData.core;
    const shell = group.userData.body;
    const rim = group.userData.rim;

    const trail = new THREE.Mesh(TRAIL_GEO, new THREE.MeshBasicMaterial({
      color: baseColor, transparent: true, opacity: 0.38,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    // Local +Y (opposite the cone's tip-to-tail axis) points opposite
    // the travel direction, so the tip leads and the tail streaks back.
    trail.quaternion.setFromUnitVectors(_UP, dir.clone().negate());
    group.add(trail);

    const light = new THREE.PointLight(colorHex, 2.4, 10);
    group.add(light);

    group.position.copy(position);
    sceneManager.add(group);

    this.projectiles.push({
      mesh: group, core, shell, trail, light,
      position: position.clone(),
      velocity: dir.clone().multiplyScalar(20), // fast!
      damage,
      life: 2.0,
      maxLife: 2.0,
      colorHex,
      type: 'fireball',
      rim,
      element: el,
      evfx: vfxFor(el),
      // The animators expect a projectile-shaped record — see
      // SpellVFX's animate() contract. `mesh` must be the thing they
      // scale/rotate, and baseScale/seed/direction are read directly.
      baseScale: 1,
      seed: Math.random() * 6.283,
      direction: dir.clone(),
      radius: 0.5,
    });
  }

  // A quick expanding, fading flash — the payoff a hit was missing
  // entirely before (the old version just deleted the ball).
  _spawnImpact(position, colorHex) {
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(BURST_GEO, mat);
    mesh.scale.setScalar(0.05);
    mesh.position.copy(position);
    sceneManager.add(mesh);

    const light = new THREE.PointLight(colorHex, 3.5, 8);
    light.position.copy(position);
    sceneManager.add(light);

    this.effects.push({ mesh, mat, light, life: 0.3, maxLife: 0.3, kind: 'burst' });

    // The expanding mesh above is the instant "pop" — this is the
    // volume underneath it: a handful of shards thrown outward with
    // real weight (gravity, drag, element-specific motion), riding on
    // the same light rather than adding a second one.
    const element = _closestElement(colorHex);
    particleBursts.spawn(position, element, { count: 10 });
    audioSystem.playSpellImpact(element);
  }

  // A bright, near-instant pulse right at the wand tip the moment a
  // cast fires — the missing piece that made casting feel like
  // nothing happened until the bolt was already halfway to its target.
  spawnMuzzleFlash(position, colorHex) {
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(BURST_GEO, mat);
    mesh.scale.setScalar(0.22);
    mesh.position.copy(position);
    sceneManager.add(mesh);

    const light = new THREE.PointLight(colorHex, 4, 6);
    light.position.copy(position);
    sceneManager.add(light);

    this.effects.push({ mesh, mat, light, life: 0.12, maxLife: 0.12, kind: 'flash' });

    // A few sparks off the wand tip, same idea as the impact burst but
    // smaller and quicker — the cast has weight leaving your hand, not
    // just arriving.
    const element = _closestElement(colorHex);
    particleBursts.spawn(position, element, { count: 6, sizeMult: 0.6, life: 0.32 });
    audioSystem.playCast(element);
  }

  update(dt, enemySpawner) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;

      if (p.life <= 0) {
        this._destroy(i);
        continue;
      }

      p.position.add(p.velocity.clone().multiplyScalar(dt));
      p.mesh.position.copy(p.position);

      // ── Element character ──
      // Replaces the generic "spin both shells opposite ways and pulse",
      // which was identical for every element. The animator drives the
      // shell (the visible body); the core keeps a fast counter-spin so
      // there is always internal motion even for elements whose
      // animator deliberately holds the body still (ice, light).
      p._t = (p._t || 0) + dt;
      p.core.rotation.x += 9 * dt;
      p.core.rotation.y += 6 * dt;

      if (p.evfx) {
        // The animator mutates p.mesh, so hand it the shell rather than
        // the group — moving the group would move the trail and light
        // with it and undo the aiming.
        const realMesh = p.mesh;
        p.mesh = p.shell;
        p.evfx.animate?.(p, dt, p._t);
        p.mesh = realMesh;
        const spin = p.evfx.spin ?? 4;
        if (spin) { p.shell.rotation.x -= spin * dt; p.shell.rotation.z += spin * 0.7 * dt; }
        // The rim is a separate mesh, so it has to be dragged along by
        // whatever the animator did to the shell — otherwise a
        // squashing or pulsing element leaves its own outline behind.
        if (p.rim) {
          p.rim.scale.copy(p.shell.scale).multiplyScalar(1.0);
          p.rim.rotation.copy(p.shell.rotation);
        }
      } else {
        p.shell.rotation.x -= 5 * dt;
        p.shell.rotation.z += 4 * dt;
        p.shell.scale.setScalar(1 + Math.sin((p.maxLife - p.life) * 10) * 0.08);
      }

      // Fade out over the last third of a second, light included.
      if (p.life < 0.35) {
        const t = Math.max(0, p.life / 0.35);
        p.shell.material.opacity = 0.5 * t;
        p.trail.material.opacity = 0.38 * t;
        p.light.intensity = 2.4 * t;
      }

      // Check collisions with all enemies
      const enemies = enemySpawner.getEnemies();
      let hit = false;
      for (const e of enemies) {
        if (e.position.distanceTo(p.position) < e.mesh.scale.x + p.radius) {
          e.takeDamage(p.damage);
          eventBus.emit(Events.UI_DAMAGE_NUMBER, {
            position: e.position.clone(),
            amount: p.damage,
            type: 'spell',
          });
          // This pipeline resolves its own collision instead of going
          // through Events.COMBAT_HIT, so on-hit mastery passives need
          // their own event here too — see main.js's PLAYER_HIT_LANDED
          // listener.
          eventBus.emit(Events.PLAYER_HIT_LANDED, { enemy: e, damage: p.damage });
          this._spawnImpact(p.position.clone(), p.colorHex);
          cameraController.shake(0.05, 0.09);
          hit = true;
          break;
        }
      }

      if (hit) {
        this._destroy(i);
      }
    }

    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      fx.life -= dt;
      if (fx.life <= 0) {
        sceneManager.remove(fx.mesh);
        sceneManager.remove(fx.light);
        fx.mesh.material.dispose();
        this.effects.splice(i, 1);
        continue;
      }
      const frac = fx.life / fx.maxLife;
      if (fx.kind === 'flash') {
        // Stays small and just burns out fast — a spark, not a burst.
        fx.mat.opacity = frac;
        fx.light.intensity = 4 * frac;
      } else {
        const t = 1 - frac; // 0 → 1 as it expands
        fx.mesh.scale.setScalar(0.05 + t * 1.1);
        fx.mat.opacity = 0.85 * frac;
        fx.light.intensity = 3.5 * frac;
      }
    }

    particleBursts.update(dt);
  }

  _destroy(index) {
    const p = this.projectiles[index];
    sceneManager.remove(p.mesh);
    // Geometry is shared (CORE_GEO/SHELL_GEO/TRAIL_GEO) and never
    // disposed here — only the per-instance materials are ours to free.
    p.core.material.dispose();
    p.shell.material.dispose();
    p.trail.material.dispose();
    this.projectiles.splice(index, 1);
  }
}

export const projectileManager = new ProjectileManager();
