// ══════════════════════════════════════════════════════════
// The Halo — what you have summoned, floating beside you
//
// Owner: "whichever relic, charm or weapon is summoned at that time,
// they should hover on the side of the person following them,
// floating in air or in the other hand, with aura glowing, the colour
// symbolising the player."
//
// ── WHY THIS EXISTS ───────────────────────────────────────
// Of the five things that can occupy a slot, only TWO were ever
// visible: the weapon in your hand (the viewmodel) and an Echo (which
// manifests as a companion creature). A second and third combat
// slot, a charm and a relic were all completely invisible — you could
// carry four Memories, feel their passives, fire their Aspects off the
// number keys, and never once see them. That is the same
// "a power the player cannot see is a power they do not have" failure
// that the loadout hotbar and the summon strip were each added to fix,
// one layer further in: the strip tells you a NAME, this shows you
// the THING.
//
// ── WHAT FLOATS, AND WHAT DELIBERATELY DOES NOT ───────────
// Exactly the owner's list — weapons, charms, relics:
//
//   · WEAPONS not currently in hand. The one in hand is the
//     viewmodel's job and drawing it twice would put your own sword
//     in front of your face and beside your shoulder at once.
//   · CHARMS and RELICS, always. They have no other representation
//     anywhere in the game.
//   · ECHOES never. An Echo already manifests as a creature standing
//     beside you (`_manifestEcho`), and a second floating copy of it
//     would read as a bug the first time the creature walked away
//     from its own icon.
//   · RAIMENT never. It is WORN — it already tints the Pioneer's body
//     (`applyWornTint`), and armour orbiting the person wearing it is
//     the one member of this list that would look wrong.
//
// ⚠️ That rule also BOUNDS the ring, which matters because raiment is
// uncapped: 3 combat slots (minus the one in hand) + 2 trinkets means
// **at most 4 satellites, ever**. A ring fed from `held` directly
// would grow without limit and there is no sane orbit for eleven
// objects.
//
// ── THE AURA COLOUR IS THE PLAYER, NOT THE ITEM ───────────
// Deliberately. Every other coloured thing in this game is keyed to
// its OWN element — the weapon's accent gem, the spell body, the hit
// particles. These are keyed to *you*: your attuned element, pulled
// toward whichever way your Leaning has gone. So a ring of borrowed
// objects still reads as one person's, and it visibly changes as the
// player does. See `playerAura()` in main.js — ONE writer, per trap #9.
//
// ⚠️ NO DYNAMIC LIGHTS. The obvious way to make four objects glow is
// four PointLights, and light count is a real per-frame cost that
// `Quality`'s tiers exist to manage — adding four unmanaged ones would
// silently undo that on the low tier. Emissive materials through the
// existing bloom pass do the same job for nothing, and follow §3's
// "shape first, glow second": every material here is an emissive
// Standard with a real base colour, never additive white.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { forgeWeapon, weaponPlanKey } from './EntityForge.js';

/** At most 3 combat slots (minus the one in hand) + 2 trinkets. */
export const MAX_SATELLITES = 4;

const UP = new THREE.Vector3(0, 1, 0);

// ── Shared geometry, built once ───────────────────────────
// ⚠️ Geometry is shared across every satellite; MATERIALS are not.
// Each satellite animates its own opacity and pulse, so a shared
// material would make all four fade together — the same rule
// WeaveVFX's pool follows.
let _shellGeo = null;
let _coreGeo = null;
let _ringGeo = null;

// ══════════════════════════════════════════════════════════
// ⚠️ SIZED BY ANGULAR DIAMETER, NOT BY EYE.
//
// The first pass used a 0.42 shell at 1.6m and it was grotesque on
// screen — measured from the render: 2·atan(0.42/1.6) = **29°**, which
// against this game's ~80° horizontal view is over a THIRD of the
// screen width, per satellite. Three of them buried the lower half of
// the frame. Something 1.6m from a first-person camera is enormous
// however small it sounds in metres, and "0.42 units" reads as tiny
// in source right up until you look at it.
//
// These numbers give 2·atan(0.16/2.4) ≈ **7.6°**, about 9% of screen
// width — present in the periphery, never competing with the world.
// If you change RADIUS, rescale these with it or the apparent size
// moves; the ratio is what matters, not either number alone.
// ══════════════════════════════════════════════════════════
const SHELL_R = 0.16;

/** Additive fresnel rim with `.color` and `.opacity` like a standard material. */
function _rimMaterial(hex) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(hex) }, uOpacity: { value: 0.15 } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec3 vN; varying vec3 vV;
      void main() { float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0); gl_FragColor = vec4(uColor * rim * uOpacity * 2.2, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
  });
  Object.defineProperty(m, 'color', { get: () => m.uniforms.uColor.value });
  Object.defineProperty(m, 'opacity', { get: () => m.uniforms.uOpacity.value, set: v => { if (m.uniforms) m.uniforms.uOpacity.value = v; } });
  return m;
}
const RADIUS = 2.4;

function _shared() {
  if (!_shellGeo) {
    _shellGeo = new THREE.IcosahedronGeometry(SHELL_R, 1);
    _coreGeo = new THREE.IcosahedronGeometry(SHELL_R * 0.46, 0);
    _ringGeo = new THREE.TorusGeometry(SHELL_R * 0.85, SHELL_R * 0.075, 6, 24);
  }
}

/**
 * The emblem a non-weapon Memory floats as.
 *
 * ⚠️ Charms and Relics have NO mesh anywhere in this project — there
 * is no `forgeCharm`, and `forgeWeapon` would forge a sword out of
 * their absent `weaponType`, which is trap #11's exact fallback. They
 * get a built shape here instead: a slow-turning core inside a ring,
 * distinct enough from a weapon silhouette that you can tell at a
 * glance which of your slots is which.
 */
function _forgeEmblem(formId, baseColor) {
  _shared();
  const g = new THREE.Group();

  const core = new THREE.Mesh(_coreGeo, new THREE.MeshStandardMaterial({
    color: baseColor, emissive: baseColor, emissiveIntensity: 1.5,
    roughness: 0.35, metalness: 0.5,
  }));
  core.name = 'halo-core';
  g.add(core);

  // A Relic reads as a ring around its core; a Charm as a bare stone.
  // One shape difference is enough to tell two trinkets apart in the
  // corner of the eye, and it costs one mesh.
  if (formId !== 'charm') {
    const ring = new THREE.Mesh(_ringGeo, new THREE.MeshStandardMaterial({
      color: baseColor, emissive: baseColor, emissiveIntensity: 0.9,
      roughness: 0.5, metalness: 0.7,
    }));
    ring.name = 'halo-ring';
    ring.rotation.x = Math.PI * 0.5;
    g.add(ring);
  }
  return g;
}

class GearHalo {
  constructor() {
    this.scene = null;
    this.player = null;
    this.cameraCtl = null;
    /** memoryId → satellite record. */
    this._sats = new Map();
    this._t = 0;
    /** The player colour, republished by main.js. Never read from here. */
    this._auraHex = 0x9fd6ff;
    this._enabled = true;
  }

  init({ scene, player, cameraController } = {}) {
    this.scene = scene || null;
    this.player = player || null;
    // ⚠️ The CONTROLLER, not its camera — and read through it every
    // frame rather than cached here. Two reasons, both of which bite:
    // `init()` runs before the controller has necessarily built its
    // PerspectiveCamera (so a cached reference can be undefined
    // forever), and the FOV is live — CameraController kicks it while
    // sprinting and rewrites `camera.aspect` on every window resize.
    //
    // ⚠️ It is needed for its FRUSTUM, never to render through. The
    // peripheral offsets in update() are fractions of the real
    // horizontal half-angle; see the note there for why hardcoding
    // them put a satellite at ndc.x = -1.94.
    this.cameraCtl = cameraController || null;
  }

  /** The live camera, or null before the controller has built one. */
  get camera() { return this.cameraCtl?.camera || null; }

  /**
   * Set the aura colour.
   *
   * ⚠️ PUBLISHED IN, never derived here. `playerAura()` in main.js is
   * the single writer — this module deciding its own colour from
   * attunement would be a second reader of the same rule, and the two
   * would drift the first time the Leaning blend changed (trap #9).
   */
  setAura(hex) {
    if (typeof hex !== 'number' || Number.isNaN(hex)) return;
    if (hex === this._auraHex) return;
    this._auraHex = hex;
    for (const sat of this._sats.values()) this._tint(sat);
  }

  setEnabled(on) {
    this._enabled = !!on;
    for (const sat of this._sats.values()) sat.group.visible = this._enabled;
  }

  /**
   * Reconcile the ring against what is equipped.
   *
   * ⚠️ RECONCILED, never rebuilt. Tearing the ring down and re-forging
   * it on every LOADOUT_CHANGED would restart the arrival animation of
   * three untouched objects every time the player pressed a slot key —
   * and LOADOUT_CHANGED fires for holding a charm, switching slots and
   * every single rebind. Only genuine arrivals and departures move.
   *
   * @param {Array<{id,memory,kind}>} wanted what should be floating
   */
  sync(wanted) {
    if (!this.scene) return;
    const want = new Map((wanted || []).slice(0, MAX_SATELLITES).map(w => [w.id, w]));

    for (const [id, sat] of [...this._sats]) {
      if (want.has(id)) continue;
      this.scene.remove(sat.group);
      this._dispose(sat);
      this._sats.delete(id);
    }

    for (const [id, w] of want) {
      if (this._sats.has(id)) continue;
      const sat = this._build(w);
      if (sat) { this._sats.set(id, sat); this.scene.add(sat.group); }
    }

    // Re-slot everything so the ring stays evenly spaced when one
    // leaves — otherwise dismissing the middle satellite leaves a
    // visible gap that never closes.
    let i = 0;
    for (const sat of this._sats.values()) { sat.index = i++; }
    this._count = this._sats.size;
  }

  _build(w) {
    _shared();
    const mem = w.memory;
    if (!mem) return null;
    const group = new THREE.Group();
    group.visible = this._enabled;

    // ⚠️ The real weapon mesh for a weapon, so the thing orbiting you
    // is recognisably the thing you forged — same `forgeWeapon` call
    // and same seed the viewmodel uses, so the floating copy and the
    // one in your hand cannot be different objects.
    let body;
    if (mem.formId === 'weapon' && mem.weaponType) {
      body = forgeWeapon(
        weaponPlanKey(mem.weaponType), mem.element || 'neutral',
        mem.tier?.level || 1, mem.id, mem.metal || null);
      // Weapons are built at real size in metres now (rendering/Arms.js),
      // half the old units — the satellite scale doubles to match.
      body.scale.setScalar(0.40);
    } else {
      body = _forgeEmblem(mem.formId, this._auraHex);
    }
    body.name = 'halo-body';
    // ⚠️ NO SHADOWS. `forgeWeapon` sets castShadow/receiveShadow on
    // every mesh it builds (correct for a weapon lying in the world),
    // and inheriting that here would put up to two extra objects into
    // every shadow-map pass for the whole game — a cost `Quality`'s
    // tiers cannot see or scale. These are ethereal summons; a hard
    // cast shadow would also read as solid, which is exactly the wrong
    // material story for something the player summoned.
    body.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    group.add(body);

    // The aura: a translucent shell around the object, not a light.
    // ⚠️ `side: BackSide` + `depthWrite: false` so the shell reads as
    // a haze the object sits INSIDE, rather than as a solid bubble
    // that hides it. Front faces would z-fight the weapon's own.
    // ⚠️ A RIM, NOT A FILLED BALL (realism pass). The filled shell read
    // as a flat orange disk beside the player (owner's screenshot). Glow
    // around a real object is brightest at its silhouette and clear
    // through the middle — a fresnel rim, added, never covering the
    // object. `color` and `opacity` stay as fields so _tint and the
    // pulse below keep working unchanged.
    const shell = new THREE.Mesh(_shellGeo, _rimMaterial(this._auraHex));
    shell.name = 'halo-shell';
    group.add(shell);

    return {
      group, body, shell, id: w.id, index: 0,
      // Its own phase, so four satellites do not bob in lockstep.
      phase: (Math.abs(_hash(w.id)) % 1000) / 1000 * Math.PI * 2,
      spin: 0.6 + ((Math.abs(_hash(w.id)) >> 10) % 100) / 240,
      born: 0,
      formId: mem.formId,
    };
  }

  _tint(sat) {
    const c = this._auraHex;
    sat.shell.material.color.setHex(c);
    // ⚠️ Only the EMBLEM re-tints. A forged weapon keeps its own
    // element's accent — that colour is the weapon's identity and the
    // aura is the player's; overwriting one with the other would make
    // every weapon you own look the same.
    if (sat.formId === 'weapon') return;
    sat.body.traverse(o => {
      if (!o.isMesh || !o.material?.color) return;
      o.material.color.setHex(c);
      if (o.material.emissive) o.material.emissive.setHex(c);
    });
  }

  _dispose(sat) {
    sat.group.traverse(o => {
      if (!o.isMesh) return;
      // ⚠️ Geometry is SHARED and must not be disposed — three of the
      // four satellites are still using it. Materials are per-instance
      // and must be.
      if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
      else o.material?.dispose();
    });
  }

  /**
   * Follow, bob and turn.
   *
   * ⚠️ The ring LAGS the player rather than being pinned to them. A
   * satellite locked rigidly to `player.position` reads as a HUD
   * element painted over the world — it is the trailing that makes it
   * read as an object being carried along. Damped per-frame toward the
   * target, framerate-corrected so it settles the same at 30 and 144.
   */
  update(dt, cameraYaw = 0) {
    if (!this._sats.size || !this.player || !this._enabled) return;
    this._t += dt;
    // (slot count is read via sat.index against OFFSETS below)
    const p = this.player.position;

    // ══════════════════════════════════════════════════════
    // ⚠️ THIS GAME IS FIRST-PERSON, SO "BESIDE" MEANS "IN THE
    // PERIPHERY", NOT "BEHIND".
    //
    // I built this ring centred on straight-behind first, reasoning
    // that the satellites must never block what the player is aiming
    // at — and verified exactly that: `dot(toSatellite, forward) ≤
    // -0.08` at every yaw. It was also **completely invisible**, since
    // there is no third-person camera in this project and nothing
    // behind the player is ever on screen. A perfectly-placed ring
    // nobody can see is the precise failure this file exists to fix.
    //
    // ⚠️ AND THE OFFSETS ARE DERIVED FROM THE LIVE FRUSTUM, NOT
    // HARDCODED. The second attempt used fixed angles (±38°, ±58°)
    // computed for FOV 88 at 16:9 — correct there, and measured
    // **off-screen at ndc.x = -1.94** the moment it ran in a window
    // whose aspect was 0.85. `fov` in three.js is VERTICAL, so the
    // horizontal half-angle depends on the ASPECT RATIO, which is a
    // property of the player's window and not something this file can
    // assume. It also changes live: `CameraController` kicks the FOV
    // while sprinting.
    //
    // Placing at FRACTIONS of the real half-angle is correct at every
    // window shape and every FOV, and it is why there is no "tuned
    // for 16:9" caveat here to go stale.
    //   · 0.62 / 0.90 of the half-angle — the inner pair sits well
    //     clear of the crosshair, the outer pair just inside the
    //     frame edge so nothing is ever half-clipped.
    // ══════════════════════════════════════════════════════
    const cam = this.camera;
    const vHalf = THREE.MathUtils.degToRad((cam?.fov ?? 75) * 0.5);
    const hHalf = Math.atan(Math.tan(vHalf) * (cam?.aspect || 1.777));
    const OFFSETS = [hHalf * 0.62, -hHalf * 0.62, hHalf * 0.90, -hHalf * 0.90];
    const lag = 1 - Math.exp(-6 * dt);   // framerate-independent damping

    for (const sat of this._sats.values()) {
      sat.born = Math.min(1, sat.born + dt * 2.2);

      // ⚠️ CameraController's forward is `(-sin(yaw), 0, -cos(yaw))`.
      // So FORWARD is `(-sin, -cos)` — the negated pair. Using
      // `(+sin, +cos)` (the intuitive reading of "yaw as an angle")
      // puts everything exactly 180° wrong, which is invisible in a
      // first-person game rather than obviously broken.
      const ang = cameraYaw + (OFFSETS[sat.index] ?? 0);
      const bob = Math.sin(this._t * 1.6 + sat.phase) * 0.09;

      const tx = p.x - Math.sin(ang) * RADIUS;
      const tz = p.z - Math.cos(ang) * RADIUS;
      // ⚠️ BELOW THE EYE LINE. `CAMERA.EYE_HEIGHT` is 1.62 above the
      // feet; sitting these at eye height would float them across the
      // horizon exactly where distant enemies read. Dropped to ~1.15
      // so they hang in the lower periphery, where a viewmodel lives.
      const ty = p.y + 1.28 + bob;

      sat.group.position.x += (tx - sat.group.position.x) * lag;
      sat.group.position.y += (ty - sat.group.position.y) * lag;
      sat.group.position.z += (tz - sat.group.position.z) * lag;

      sat.body.rotation.y += sat.spin * dt;
      sat.body.rotation.z = Math.sin(this._t * 0.9 + sat.phase) * 0.18;

      // Arrival: it swells into place rather than popping in.
      const e = sat.born * sat.born * (3 - 2 * sat.born);   // smoothstep
      sat.group.scale.setScalar(e);

      // The aura breathes. Kept subtle — this sits in peripheral
      // vision for the entire game and a hard pulse would be a tic.
      const pulse = 0.15 + Math.sin(this._t * 2.1 + sat.phase) * 0.05;
      sat.shell.material.opacity = pulse * e;
      sat.shell.rotation.y -= dt * 0.4;
    }
  }

  clear() {
    for (const sat of this._sats.values()) {
      this.scene?.remove(sat.group);
      this._dispose(sat);
    }
    this._sats.clear();
  }

  /** For verification: what is actually floating right now. */
  debug() {
    return [...this._sats.values()].map(s => ({
      id: s.id, form: s.formId, index: s.index,
      pos: s.group.position.toArray().map(v => +v.toFixed(2)),
      visible: s.group.visible, scale: +s.group.scale.x.toFixed(2),
    }));
  }
}

function _hash(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i); h = Math.imul(h, 16777619);
  }
  // murmur3 fmix32 — plain FNV leaves the low bits weakly mixed, and
  // the low bits are exactly what `% 1000` reads (trap #17).
  h ^= h >>> 16; h = Math.imul(h, 2246822507);
  h ^= h >>> 13; h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h;
}

export const gearHalo = new GearHalo();
