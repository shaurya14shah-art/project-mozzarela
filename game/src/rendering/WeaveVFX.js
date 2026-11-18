// ══════════════════════════════════════════════════════════
// Weave VFX — what a woven thing looks like arriving, and what its
// Aspects look like going off
//
// ── WHY THIS EXISTS ───────────────────────────────────────
// The owner's report was blunt and correct: "the woven weapons,
// armour, and all the woven things can't be seen used at all, no
// materialisation no animation." Three separate holes sat behind it,
// and only the third is this file's job:
//
//   1. LoadoutSystem.equipWeapon() never reached Player.equipWeapon(),
//      so a forged Memory had no model anywhere — fixed in main.js.
//   2. Player.equipArmor() threw a ReferenceError on every call —
//      fixed in Player.js.
//   3. Nothing in the project drew ANYTHING for a Memory. Aspects fired
//      a 12-particle puff shared with every other hit in the game, and
//      equipping one happened silently between two frames.
//
// This is (3): a small pooled library of transient shapes — a swept
// blade arc, a thrust lance, a ground shockwave, a ward dome, a dash
// streak — plus the materialisation animation a woven object plays
// when it knits itself into your hand.
//
// ── THE RULES IT FOLLOWS ──────────────────────────────────
// · SHAPE FIRST, GLOW SECOND (§3, and the SpellVFX header's own hard
//   lesson). Every one of these is an emissive Standard material with
//   a real base colour, NOT additive white — the first spell VFX pass
//   in this project made every element come out as the same white blob
//   through bloom, and an additive slash arc would do it again.
// · The pool is FIXED. Slots are claimed round-robin and stolen from
//   the oldest, the same way ParticleBursts does it, so a fast ability
//   chain reuses slots instead of growing the pool or dropping later
//   effects.
// · Geometry is built ONCE per shape. Materials are owned per SLOT
//   (opacity animates per instance, so they cannot be shared) and are
//   only ever recoloured, never reallocated.
// · The per-frame update is allocation-free. It runs every frame for
//   every live effect.
//
// ⚠️ Effects are parented to the SCENE, not to whatever spawned them —
// same reasoning as SpellVFX's trail bodies. A slash arc that vanished
// because the enemy it was aimed at died mid-swing would read as the
// ability having failed.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { sceneManager } from './SceneManager.js';
import { ELEMENTS, ELEMENT_COLORS } from '../data/constants.js';

const hex = (css) => parseInt((css || '#888888').replace('#', ''), 16);

const SLOT_COUNT = 14;
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

// ── Shapes, built once ────────────────────────────────────
// ⚠️ A RingGeometry lies in the XY plane with its normal on +Z, which
// is what lets one `setFromUnitVectors(Z_AXIS, dir)` aim any of these
// without a lookAt matrix or a temporary. The arc's sector is centred
// on +Y so rolling it around its own normal picks the swing angle.
const GEO = {};
function geometries() {
  if (GEO.arc) return GEO;
  // A crescent — the swept path of a blade, not a full ring.
  GEO.arc = new THREE.RingGeometry(0.66, 1.0, 26, 1, Math.PI / 2 - 1.15, 2.3);
  // A thrust: a tapered spike along +Z once aimed (built along +Y and
  // pre-rotated, so the aim maths is identical to every other shape).
  GEO.lance = new THREE.CylinderGeometry(0.02, 0.16, 1, 9, 1, true);
  GEO.lance.rotateX(Math.PI / 2);
  GEO.lance.translate(0, 0, 0.5);
  // A flat ground ring, pre-laid so +Z aiming points it at the sky.
  GEO.ring = new THREE.RingGeometry(0.84, 1.0, 44);
  // A ward.
  //
  // ⚠️ DRAWN AS A LATTICE, NOT A SURFACE, AND THAT IS NOT A STYLE
  // CHOICE. Every ward in this game is centred on the player, which
  // means the CAMERA IS INSIDE IT. A filled, double-sided,
  // 42%-opacity shell seen from the inside does not read as a dome —
  // its back faces cover every pixel, and the first version of this
  // washed the entire frame to flat white. That is precisely the
  // failure §4 records for the ground-mist sheets ("it was not mist,
  // it was a full-screen colour wash"), arriving from a different
  // direction.
  //
  // A wireframe shell has almost no fill: from inside you see bands of
  // light arcing over you and the world through the gaps. It is also
  // the more honest picture of what the thing IS — a Weave.
  // Deliberately low segment counts; a dense wireframe is a fill again.
  GEO.dome = new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI * 0.62);
  // The materialisation cage — three of these counter-rotate inward.
  GEO.thread = new THREE.TorusGeometry(1, 0.022, 4, 30);
  return GEO;
}

/**
 * How each shape behaves over its life. `t` runs 1 → 0.
 *
 * ⚠️ Every one of these is a pure function of `t` writing into an
 * object that already exists. No Vector3 is constructed here — these
 * run per effect per frame.
 */
const KINDS = {
  // A slash: snaps out to full width fast, then thins and fades.
  arc(slot, t) {
    const grow = 1 - Math.pow(t, 2.2);          // 0 → 1, fast at the start
    const s = slot.size * (0.35 + grow * 0.85);
    slot.mesh.scale.set(s, s, s);
    slot.mesh.rotation.z = slot.roll + (1 - t) * slot.sweep;
    slot.mat.opacity = Math.min(1, t * 1.9) * 0.95;
  },
  // A thrust: extends down the line, then retracts toward its origin.
  lance(slot, t) {
    const ext = Math.min(1, (1 - t) * 3.4);
    slot.mesh.scale.set(slot.size * (0.5 + t * 0.5), slot.size * (0.5 + t * 0.5), slot.len * ext);
    slot.mat.opacity = Math.min(1, t * 2.2) * 0.9;
  },
  // A shockwave: expands outward and thins to nothing.
  ring(slot, t) {
    const s = slot.size * (0.15 + (1 - t) * 0.95);
    slot.mesh.scale.set(s, s, 1);
    slot.mat.opacity = t * t * 0.85;
  },
  // A ward: pops to size, holds, then fades. Drawn as a lattice (see
  // GEO.dome), so it can afford a much higher opacity than a filled
  // shell ever could — thin bright lines, and the fight still visible
  // between them. It also turns slowly, which is what stops it reading
  // as a static decal welded to the camera.
  dome(slot, t) {
    const pop = Math.min(1, (1 - t) * 5);
    slot.mesh.scale.setScalar(slot.size * (0.6 + pop * 0.4));
    slot.mesh.rotation.y += 0.012;
    // ⚠️ 0.55, not the 0.85 a lattice can technically carry. Seen from
    // the inside the shell is only ~1 unit from the lens, so its lines
    // spread across the whole frame — bright enough to read as a ward,
    // dim enough that it is not a cage the player is looking through.
    slot.mat.opacity = Math.min(t * 1.4, 0.55);
  },
  // A dash trail: the full length is drawn at once and fades in place.
  streak(slot, t) {
    slot.mesh.scale.set(slot.size * t, slot.size * t, slot.len);
    slot.mat.opacity = t * 0.8;
  },
};

class WeaveVFXPool {
  constructor() {
    this._slots = [];
    this._next = 0;
    this._ready = false;
    this._materialising = [];
  }

  init() {
    if (this._ready) return;
    const G = geometries();
    for (let i = 0; i < SLOT_COUNT; i++) {
      // ⚠️ Standard, emissive, with a REAL base colour — not Basic and
      // not additive. See the file header; this is the exact mistake
      // SpellVFX already had to undo once.
      const mat = new THREE.MeshStandardMaterial({
        color: 0x000000, emissive: 0xffffff, emissiveIntensity: 2.2,
        roughness: 0.5, metalness: 0.0,
        transparent: true, opacity: 0, depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(G.arc, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;   // these are short-lived and often at the camera
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = 3;
      sceneManager.scene.add(mesh);
      this._slots.push({ mesh, mat, active: false, kind: 'arc', life: 0, maxLife: 1, size: 1, len: 1, roll: 0, sweep: 0 });
    }
    this._ready = true;
  }

  /** Element colour, split dark base / bright emissive (§3, and ParticleBursts' own split). */
  _tint(slot, element) {
    const c = hex(ELEMENT_COLORS[element] || ELEMENT_COLORS[ELEMENTS.NEUTRAL]);
    slot.mat.emissive.setHex(c);
    // A dark version of the same hue underneath, so the shape still has
    // an edge where bloom has blown the emissive out.
    slot.mat.color.setHex(c).multiplyScalar(0.22);
  }

  _claim(kind, element, life) {
    if (!this._ready) return null;
    const slot = this._slots[this._next];
    this._next = (this._next + 1) % SLOT_COUNT;
    slot.active = true;
    slot.kind = kind;
    slot.life = slot.maxLife = life;
    slot.mesh.geometry = geometries()[kind === 'streak' ? 'lance' : kind];
    // See GEO.dome — the ward is the one shape the camera ends up
    // inside, so it is the one shape that must not have a fill.
    slot.mat.wireframe = (kind === 'dome');
    slot.mesh.visible = true;
    slot.mesh.scale.setScalar(0.001);
    this._tint(slot, element);
    return slot;
  }

  // ── THE EFFECTS ─────────────────────────────────────────

  /**
   * A swept blade arc, hanging in the air where the swing went.
   *
   * `roll` picks the swing angle around the aim axis — 0 is a vertical
   * downstroke, `Math.PI/2` a horizontal sweep — and `sweep` is how far
   * it travels during its life, which is what makes it read as a
   * moving cut rather than a decal.
   */
  arc(at, dir, element, { size = 2.0, roll = 0, sweep = 1.1, life = 0.32 } = {}) {
    const slot = this._claim('arc', element, life);
    if (!slot) return;
    slot.size = size;
    slot.roll = roll;
    slot.sweep = sweep;
    slot.mesh.position.copy(at);
    slot.mesh.quaternion.setFromUnitVectors(Z_AXIS, dir);
    slot.mesh.rotateZ(roll);
  }

  /** A thrust down a line — skewer, charge, lunge. */
  lance(at, dir, element, { size = 1.0, len = 7, life = 0.3 } = {}) {
    const slot = this._claim('lance', element, life);
    if (!slot) return;
    slot.size = size;
    slot.len = len;
    slot.mesh.position.copy(at);
    slot.mesh.quaternion.setFromUnitVectors(Z_AXIS, dir);
  }

  /** A ground shockwave, laid flat wherever it went off. */
  ring(at, element, { size = 4, life = 0.45 } = {}) {
    const slot = this._claim('ring', element, life);
    if (!slot) return;
    slot.size = size;
    slot.mesh.position.copy(at);
    slot.mesh.position.y += 0.08;   // clear of the ground, not z-fighting it
    slot.mesh.quaternion.setFromUnitVectors(Z_AXIS, Y_AXIS);
  }

  /** A ward over you — brace, knit, the defensive half. */
  dome(at, element, { size = 2.3, life = 0.7 } = {}) {
    const slot = this._claim('dome', element, life);
    if (!slot) return;
    slot.size = size;
    slot.mesh.position.copy(at);
    slot.mesh.quaternion.identity();
  }

  /** The line you took to get somewhere — step, vault, charge. */
  streak(from, to, element, { size = 0.7, life = 0.34 } = {}) {
    const slot = this._claim('streak', element, life);
    if (!slot) return;
    _v.subVectors(to, from);
    slot.len = Math.max(0.5, _v.length());
    slot.size = size;
    _v.normalize();
    slot.mesh.position.copy(from);
    slot.mesh.quaternion.setFromUnitVectors(Z_AXIS, _v);
  }

  // ── MATERIALISATION ─────────────────────────────────────

  /**
   * A woven thing knitting itself into existence.
   *
   * The owner asked for this by name ("no materialisation") and it is
   * the part that makes a Memory feel forged rather than assigned: the
   * object scales up out of nothing with an overshoot while three
   * counter-rotating thread rings collapse onto it and burn out.
   *
   * ⚠️ The cage is parented to the OBJECT, not to the scene, so it
   * inherits every bit of viewmodel sway/bob for free — a cage left in
   * world space would slide off a weapon held 30cm from the lens the
   * moment the player turned. Its radius is in the object's own local
   * units, so the same numbers frame a 20cm dagger and a two-metre
   * Echo without a special case.
   *
   * ⚠️ Re-entrant on the same object: a second call restores the FIRST
   * call's remembered scale before starting over. Without that, equipping
   * twice quickly captures a mid-animation scale as "normal" and the
   * weapon stays permanently shrunk — the same shape as the
   * `bareMaterial` guard in Player.equipArmor().
   */
  materialise(object, element, { dur = 0.55 } = {}) {
    if (!object) return;
    this._cancelMaterialise(object, true);

    const c = hex(ELEMENT_COLORS[element] || ELEMENT_COLORS[ELEMENTS.NEUTRAL]);
    const cage = new THREE.Group();
    cage.name = 'weave-cage';
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x000000, emissive: c, emissiveIntensity: 3.0,
        transparent: true, opacity: 0.9, depthWrite: false,
      });
      const ring = new THREE.Mesh(geometries().thread, mat);
      ring.rotation.set(i * 1.1, i * 0.7, i * 1.9);
      ring.castShadow = ring.receiveShadow = false;
      ring.renderOrder = 4;
      cage.add(ring);
    }
    object.add(cage);

    // Every emissive part flashes up and eases back to whatever it was
    // — including the awaken glow, which is re-derived on equip and so
    // must be READ here rather than assumed to be its default.
    const glows = [];
    object.traverse(o => {
      if (o.isMesh && o.material?.emissiveIntensity !== undefined && !cage.getObjectById(o.id)) {
        glows.push({ mat: o.material, base: o.material.emissiveIntensity });
      }
    });

    this._materialising.push({
      object, cage, glows, t: 0, dur,
      baseScale: object.scale.clone(),
    });
  }

  /**
   * Stop a materialisation early and put the object back exactly as it
   * was. `restore` is false when the animation completed on its own —
   * the final frame already wrote the resting values.
   */
  _cancelMaterialise(object, restore) {
    const at = this._materialising.findIndex(m => m.object === object);
    if (at < 0) return;
    const m = this._materialising.splice(at, 1)[0];
    m.cage.parent?.remove(m.cage);
    m.cage.traverse(o => { if (o.isMesh) o.material?.dispose?.(); });
    if (restore) {
      m.object.scale.copy(m.baseScale);
      for (const g of m.glows) g.mat.emissiveIntensity = g.base;
    }
  }

  /** True while `object` is still knitting itself together. */
  isMaterialising(object) {
    return this._materialising.some(m => m.object === object);
  }

  // ── TICK ────────────────────────────────────────────────

  update(dt) {
    if (!this._ready) return;

    for (const slot of this._slots) {
      if (!slot.active) continue;
      slot.life -= dt;
      if (slot.life <= 0) {
        slot.active = false;
        slot.mesh.visible = false;
        slot.mat.opacity = 0;
        continue;
      }
      KINDS[slot.kind](slot, slot.life / slot.maxLife);
    }

    // ⚠️ Iterated backwards so a completed materialisation can splice
    // itself out without the loop skipping the next one.
    for (let i = this._materialising.length - 1; i >= 0; i--) {
      const m = this._materialising[i];
      m.t += dt;
      const t = Math.min(1, Math.max(0, m.t / m.dur));   // clamped both ways: a bad dt must never drive the ease outside 0..1

      // Overshoot, then settle — an object that eases in linearly reads
      // as a fade, not as something arriving.
      const grow = t < 1 ? 1 - Math.pow(1 - t, 3) : 1;
      const overshoot = 1 + Math.sin(t * Math.PI) * 0.12;
      const s = t >= 1 ? 1 : grow * overshoot;
      m.object.scale.set(m.baseScale.x * s, m.baseScale.y * s, m.baseScale.z * s);

      const flash = (1 - t) * 4;
      for (const g of m.glows) g.mat.emissiveIntensity = g.base * (1 + flash);

      // The cage collapses inward.
      //
      // ⚠️ NO COUNTER-SCALE. The first version divided by the object's
      // own animating scale (`1 / s`) so the two effects would not
      // compound — which is correct arithmetic and a catastrophic
      // visual: `s` starts at ~0, so `1/s` starts near INFINITY. On
      // the viewmodel weapon that was survivable (measured 26x, on a
      // prop a few centimetres from the lens). On a manifesting Echo,
      // whose mesh is a world-scale creature, the same 26x put three
      // twenty-metre rings of light across the entire sky. Seen, not
      // measured — the numbers looked fine.
      //
      // Riding the object's scale is the right behaviour anyway: the
      // cage arriving WITH the thing it is knitting reads better than
      // a cage hanging in space around nothing, and it removes the
      // whole class of divide-by-a-shrinking-number bug.
      m.cage.scale.setScalar(Math.max(0.001, 2.4 - t * 2.3));
      for (let r = 0; r < m.cage.children.length; r++) {
        const ring = m.cage.children[r];
        // Counter-rotating, so it reads as threads being drawn taut
        // rather than one object spinning.
        ring.rotation.y += dt * (r % 2 ? -7 : 7);
        ring.rotation.x += dt * (r % 2 ? 4.5 : -4.5);
        ring.material.opacity = Math.max(0, 0.9 * (1 - t * t));
      }

      if (t >= 1) {
        m.object.scale.copy(m.baseScale);
        for (const g of m.glows) g.mat.emissiveIntensity = g.base;
        this._cancelMaterialise(m.object, false);
      }
    }
  }
}

// Module-scope scratch. `streak()` needs a direction and a length from
// two points and runs on an ability press — one reused vector rather
// than two allocations per call.
const _v = new THREE.Vector3();

export const weaveVFX = new WeaveVFXPool();
