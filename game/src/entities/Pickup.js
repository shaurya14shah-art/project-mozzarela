// ══════════════════════════════════════════════════════════
// Pickup — Dropped Items in the World
//
// Every dropped item used to be the exact same tinted icosahedron
// shard, regardless of whether it was a chunk of iron ore, a scrap of
// leather, a found journal, or a vial of dragon blood — a genuine
// "everything's a generic blob" hole, and the single most-seen
// pickup shape in the game (harvest nodes and enemy kills spawn
// dozens per session).
//
// Fixed two ways:
//  1. Where a real model in the MegaKit atlas is a strong conceptual
//     match (a found journal really is a scroll; a "Spilled Essence"
//     reliquary really is an urn; a vial/tear/gland really is a small
//     bottle), use it — see _realModelKeyFor().
//  2. Everywhere else, no MegaKit prop reads as "a chunk of ore" or
//     "a scrap of leather" (it's a furniture/weapon kit, not a raw-
//     material kit) — so instead of forcing a bad match, the fallback
//     shard now varies its GEOMETRY by material category (ore/metal
//     reads as an angular nugget, wood as a stubby log, hide/cloth as
//     a folded scrap, bone as a splinter, everything else — crystals,
//     essences, cores — keeps the gem-cut look, which was always the
//     right read for those). See _proceduralShapeFor().
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { sceneManager } from '../rendering/SceneManager.js';
import { eventBus, Events } from '../core/EventBus.js';
import { modelLibrary } from '../rendering/ModelLibrary.js';

import { seg, icoDetail } from '../rendering/GeoForge.js';
// ── Real-model matches ───────────────────────────────────────
//
// Only items with a genuinely strong conceptual match get a real
// model — everything else takes the procedural fallback below rather
// than being forced into a prop that doesn't actually represent it.
function _realModelKeyFor(itemDef) {
  if (itemDef.isLore) return 'prop:Scroll_1';
  if (itemDef.isReliquary) return 'prop:Vase_4';
  if (itemDef.type === 'weapon' && !itemDef.isWand) {
    const byType = {
      sword: 'prop:Sword_Bronze', greatsword: 'prop:Sword_Bronze',
      dagger: 'prop:Sword_Bronze', axe: 'prop:Axe_Bronze', spear: 'prop:Sword_Bronze',
    };
    return byType[itemDef.weaponType] || 'prop:Sword_Bronze';
  }
  // Vials/tears/glands/gel — small liquid- or fluid-bearing items read
  // as a bottle far better than a gem cut ever would.
  const id = (itemDef.id || '').toLowerCase();
  if (/vial|tear|gel|sac|gland|blood/.test(id)) {
    return id.length % 2 === 0 ? 'prop:SmallBottle' : 'prop:Bottle_1'; // cheap, deterministic variety
  }
  return null;
}

// ── Procedural fallback shape/material, cached and shared ──────
const _geoCache = new Map();
const _matCache = new Map();
function _cachedGeo(key, build) {
  if (!_geoCache.has(key)) _geoCache.set(key, build());
  return _geoCache.get(key);
}
function _cachedMat(key, build) {
  if (!_matCache.has(key)) _matCache.set(key, build());
  return _matCache.get(key);
}

const _CATEGORY_TESTS = [
  { key: 'ore', test: /ore|ingot|metal|scrap|starmetal|mithril|orichalcum|quartz/ },
  { key: 'wood', test: /wood|bark|branch|spiritwood|eldertree|yggdrasil/ },
  { key: 'hide', test: /leather|silk|hide|cloth|weave|scale|fur/ },
  { key: 'bone', test: /bone|tooth|fang|claw|skull/ },
];

/** Category-appropriate geometry + material for items with no real-model match. */
function _proceduralShapeFor(itemDef, colorHex) {
  const id = (itemDef.id || '').toLowerCase();
  const cat = _CATEGORY_TESTS.find(c => c.test.test(id))?.key || 'gem';

  switch (cat) {
    case 'ore': {
      const geo = _cachedGeo('pickup-ore', () => new THREE.IcosahedronGeometry(0.26, icoDetail(0)));
      const mat = _cachedMat(`pickup-ore:${colorHex}`, () => new THREE.MeshStandardMaterial({
        color: colorHex, roughness: 0.55, metalness: 0.6, flatShading: true,
      }));
      return { geo, mat, scale: new THREE.Vector3(1, 0.7, 0.85) };
    }
    case 'wood': {
      const geo = _cachedGeo('pickup-wood', () => new THREE.CylinderGeometry(0.11, 0.14, 0.42, seg(6)));
      const mat = _cachedMat(`pickup-wood:${colorHex}`, () => new THREE.MeshStandardMaterial({
        color: colorHex, roughness: 0.9, metalness: 0, flatShading: true,
      }));
      return { geo, mat, rotationZ: Math.PI / 2.3 };
    }
    case 'hide': {
      const geo = _cachedGeo('pickup-hide', () => new THREE.BoxGeometry(0.34, 0.06, 0.24));
      const mat = _cachedMat(`pickup-hide:${colorHex}`, () => new THREE.MeshStandardMaterial({
        color: colorHex, roughness: 0.95, metalness: 0, flatShading: true,
      }));
      return { geo, mat, rotationX: 0.3, rotationZ: 0.5 };
    }
    case 'bone': {
      const geo = _cachedGeo('pickup-bone', () => new THREE.CapsuleGeometry(0.06, 0.32, seg(2), seg(5)));
      const mat = _cachedMat(`pickup-bone:${colorHex}`, () => new THREE.MeshStandardMaterial({
        color: colorHex, roughness: 0.85, metalness: 0, flatShading: true,
      }));
      return { geo, mat, rotationZ: Math.PI / 2.4 };
    }
    default: {
      // Gem/crystal/essence — the shape this pickup always had, and
      // still the right read for anything magic-adjacent.
      const geo = _cachedGeo('pickup-gem', () => new THREE.IcosahedronGeometry(0.3, icoDetail(0)));
      const mat = _cachedMat(`pickup-gem:${colorHex}`, () => new THREE.MeshStandardMaterial({
        color: colorHex, roughness: 0.25, metalness: 0.1, emissive: colorHex, emissiveIntensity: 0.8,
      }));
      return { geo, mat };
    }
  }
}

const _PICKUP_TARGET_SIZE = 0.5; // metres, largest bounding dimension

export class Pickup {
  constructor(itemDef, position, count = 1) {
    this.itemDef = itemDef;
    this.count = count;
    this.position = position.clone();

    // Add some random scatter
    this.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 5,
      Math.random() * 6 + 4,
      (Math.random() - 0.5) * 5
    );

    this.id = Math.random().toString(36).slice(2, 9);
    this.alive = true;
    this.magnetRange = 4.0;
    this.pickupRange = 1.0;
    this.isMagnetized = false;
    this.speed = 15.0;

    this.mesh = this._createMesh();
    sceneManager.add(this.mesh);
  }

  _createMesh() {
    const group = new THREE.Group();
    const colorHex = this.itemDef.tier?.color || '#ffffff';

    // Real model, where the match is genuinely strong.
    const realKey = _realModelKeyFor(this.itemDef);
    if (realKey && modelLibrary.isReady(realKey)) {
      const inst = modelLibrary.instantiate(realKey);
      if (inst?.group) {
        const box = new THREE.Box3().setFromObject(inst.group);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        inst.group.scale.setScalar(_PICKUP_TARGET_SIZE / maxDim);
        inst.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
        group.add(inst.group);
        this._isRealModel = true;
        group.position.copy(this.position);
        return group;
      }
      // Fall through to procedural on any load/instantiate failure.
    }

    // Procedural fallback — category-shaped, not a one-size blob.
    const { geo, mat, scale, rotationX = 0, rotationZ = 0 } = _proceduralShapeFor(this.itemDef, colorHex);
    const body = new THREE.Mesh(geo, mat);
    if (scale) body.scale.copy(scale);
    body.rotation.set(rotationX, 0, rotationZ);
    body.castShadow = true;
    group.add(body);

    // Add a small point light based on tier
    if (this.itemDef.tier && this.itemDef.tier.level > 2) {
      const light = new THREE.PointLight(colorHex, 0.5, 3);
      group.add(light);
    }

    group.position.copy(this.position);
    return group;
  }

  update(dt, playerPos, terrainCollider) {
    if (!this.alive) return;

    // Movement / Physics
    if (!this.isMagnetized) {
      // Gravity and bouncing
      this.velocity.y -= 20 * dt; // gravity

      this.position.addScaledVector(this.velocity, dt);

      // Simple ground collision (hacky for pickups: assume y=0 or ground height)
      // Ideally we raycast to terrain, but for performance we just floor it if below 0
      // Actually, let's just do a basic floor check. We'll refine with actual terrain height if possible.
      if (this.position.y < playerPos.y - 2) {
        this.position.y = playerPos.y - 2; // Rough ground approx
        this.velocity.y *= -0.5; // bounce
        this.velocity.x *= 0.8;
        this.velocity.z *= 0.8;
      }

      // Check magnet range
      const dist = this.position.distanceTo(playerPos);
      if (dist < this.magnetRange) {
         // Add small delay before magnetization
         setTimeout(() => { this.isMagnetized = true; }, 400);
      }
    } else {
      // Fly towards player
      const dir = playerPos.clone().add(new THREE.Vector3(0, 1, 0)).sub(this.position);
      const dist = dir.length();

      if (dist < this.pickupRange) {
        this._pickup();
        return;
      }

      dir.normalize();
      this.position.addScaledVector(dir, this.speed * dt);
      this.speed += 30 * dt; // Accelerate
    }

    // Animate rotation
    this.mesh.rotation.x += dt;
    this.mesh.rotation.y += dt * 2;
    this.mesh.position.copy(this.position);

    if (!this.isMagnetized) {
       this.mesh.position.y += Math.sin(Date.now() * 0.005) * 0.1; // hover
    }
  }

  _pickup() {
    this.alive = false;
    sceneManager.remove(this.mesh);
    // Real-model instances own their own geometry/material (cloned per
    // pickup, not shared) — dispose them. Procedural shapes use the
    // module-level _geoCache/_matCache, so those must NOT be disposed
    // here or every other pickup sharing that cache entry breaks.
    if (this._isRealModel) {
      this.mesh.traverse(o => {
        if (o.isMesh) { o.geometry?.dispose(); o.material?.dispose(); }
      });
    }

    eventBus.emit(Events.ITEM_PICKUP, { item: this.itemDef, count: this.count });
    // Lore fragments get their own dedicated reveal (see main.js) —
    // a plain "Picked up 1x ..." toast under it would just be noise.
    if (!this.itemDef.isLore) {
      eventBus.emit(Events.UI_NOTIFY, `Picked up ${this.count}x ${this.itemDef.name}`);
    }
  }
}

// Global Manager for handling pickups
export class PickupManager {
  constructor() {
    this.pickups = [];
  }

  spawn(itemDef, position, count = 1) {
    const pickup = new Pickup(itemDef, position, count);
    this.pickups.push(pickup);
    return pickup;
  }

  update(dt, playerPos, terrainCollider) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.update(dt, playerPos, terrainCollider);
      if (!p.alive) {
        this.pickups.splice(i, 1);
      }
    }
  }
}

export const pickupManager = new PickupManager();
