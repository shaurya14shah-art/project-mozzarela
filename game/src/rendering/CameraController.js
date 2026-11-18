// ══════════════════════════════════════════════════════════
// Camera Controller — First-Person View
// ══════════════════════════════════════════════════════════
//
// The camera IS the player's head. No orbit, no distance, no
// lock-on to manage — it sits at eye height above the player's feet
// and looks wherever the mouse points, full stop. That also means it
// can never clip through a wall the player's own collision already
// stops them from walking into, which the old rig-behind-the-player
// camera could.

import * as THREE from 'three';
import { CAMERA, PLAYER } from '../data/constants.js';
import { input } from '../core/InputManager.js';

class CameraController {
  constructor() {
    this.camera = null;

    // Look angles. yaw wraps freely; pitch is clamped short of
    // straight up/down (see constants.js for why).
    this.yaw = 0;
    this.pitch = 0;

    // Head bob — a phase that only advances while actually walking,
    // and an envelope (0..1) eased toward "moving" so a footstep
    // doesn't snap on or get chopped off mid-stride.
    this.bobPhase = 0;
    this.bobEnvelope = 0;
    this._idlePhase = 0;

    // FOV kick under sprint, eased rather than snapped.
    this._fov = CAMERA.FOV;
    // Player settings (ui/PauseMenu.js): sensitivity multiplier, invert-Y,
    // and the base field of view (sprint keeps its relative widening).
    this.sensMult = 1; this.invertY = false; this.baseFov = CAMERA.FOV;

    // Shake — punchy, camera-local impact feedback (hits, landings,
    // spellcasts). Offsets position slightly and rolls the camera a
    // touch, which reads as a jolt in first person in a way a pure
    // position shake alone doesn't.
    // The body under the eye — a swing's lean, a smash's dip, a spin's
    // turn, a lunge's push. Written each frame by main.js's viewmodel
    // choreography (the single writer); purely visual: aim still reads
    // `yaw`/`pitch`, never these.
    this.motion = { pitch: 0, yaw: 0, roll: 0, dip: 0, push: 0 };
    this.shakeIntensity = 0;
    this.shakeDuration = 0;
    this.shakeTimer = 0;

    this._eyeOffset = new THREE.Vector3();
  }

  init() {
    // far=1400 gives real margin over the sky dome's radius (900,
    // Atmosphere.js) — the dome is re-centred on the camera every
    // frame, so every point on it sits at Euclidean distance 900 from
    // wherever the camera is.
    this.camera = new THREE.PerspectiveCamera(
      CAMERA.FOV,
      window.innerWidth / window.innerHeight,
      0.05,
      1400
    );
    // YXZ so yaw and pitch compose the way a head actually turns: spin
    // around world-up first, THEN tilt — the default XYZ order lets a
    // large pitch warp the yaw axis (gimbal-style skew).
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(0, CAMERA.EYE_HEIGHT, 0);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });

    console.log('[CameraController] Initialized — first-person');
    return this.camera;
  }

  /** @param {import('../entities/Player.js').player} player */
  update(dt, player) {
    if (!player || !player.position) return;
    const p = player.position;

    // Mouse look — direct, 1:1 with input, no smoothing lag. Lag on
    // look input is the single fastest way to make a first-person
    // camera feel like it's fighting the player.
    const mouseDelta = input.consumeMouseDelta();
    // The wheel belongs to systems/CombatSystem.js (switching a hard lock).

    this.yaw -= mouseDelta.dx * CAMERA.SENSITIVITY * this.sensMult;
    this.pitch -= mouseDelta.dy * CAMERA.SENSITIVITY * this.sensMult * (this.invertY ? -1 : 1);
    this.pitch = Math.max(CAMERA.PITCH_MIN, Math.min(CAMERA.PITCH_MAX, this.pitch));

    // ── Head bob ──────────────────────────────────────────
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    const moving = !!player.isGrounded && speed > 0.35;
    const running = player.animState === 'run';

    const envRate = 1 - Math.exp(-CAMERA.BOB_ENVELOPE_RATE * dt);
    this.bobEnvelope += ((moving ? 1 : 0) - this.bobEnvelope) * envRate;
    if (moving) this.bobPhase += dt * (running ? CAMERA.BOB_RUN_FREQ : CAMERA.BOB_WALK_FREQ);

    const bobAmp = running ? CAMERA.BOB_RUN_AMP : CAMERA.BOB_WALK_AMP;
    const bobY = Math.abs(Math.sin(this.bobPhase)) * bobAmp * this.bobEnvelope;
    const bobX = Math.sin(this.bobPhase * 0.5) * CAMERA.BOB_SIDE_AMP * this.bobEnvelope;

    // ── Idle breathing sway ("serene") ──────────────────────
    this._idlePhase += dt * CAMERA.IDLE_SWAY_FREQ;
    const idleY = Math.sin(this._idlePhase) * CAMERA.IDLE_SWAY_AMP * (1 - this.bobEnvelope);

    this._eyeOffset.set(bobX, CAMERA.EYE_HEIGHT + bobY + idleY, 0);

    // ── Sprint FOV kick ──────────────────────────────────────
    const sprinting = running && speed > PLAYER.MOVE_SPEED * 1.15;
    const targetFov = this.baseFov + (sprinting ? CAMERA.SPRINT_FOV - CAMERA.FOV : 0);
    this._fov += (targetFov - this._fov) * (1 - Math.exp(-CAMERA.FOV_EASE * dt));
    if (Math.abs(this.camera.fov - this._fov) > 0.02) {
      this.camera.fov = this._fov;
      this.camera.updateProjectionMatrix();
    }

    // ── Shake ───────────────────────────────────────────────
    let shakeX = 0, shakeY = 0, shakeRoll = 0;
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      const t = Math.max(0, this.shakeTimer / this.shakeDuration);
      const intensity = this.shakeIntensity * t * t; // sharp punch, quick settle
      shakeX = (Math.random() - 0.5) * intensity;
      shakeY = (Math.random() - 0.5) * intensity;
      shakeRoll = (Math.random() - 0.5) * intensity * 0.4;
    }

    // Apply — eye position plus bob plus shake; look angles direct.
    const m = this.motion, fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    this.camera.position.set(p.x + this._eyeOffset.x + shakeX + fx * m.push, p.y + this._eyeOffset.y + shakeY + m.dip, p.z + this._eyeOffset.z + fz * m.push);
    this.camera.rotation.set(this.pitch + m.pitch, this.yaw + m.yaw, shakeRoll + m.roll, 'YXZ');
  }

  // Punchy camera-local impact feedback — hits, landings, casts.
  shake(intensity = 0.3, duration = 0.3) {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
    this.shakeTimer = duration;
  }

  // Forward on the XZ plane only — what movement and melee facing use.
  // Deliberately ignores pitch: strafing shouldn't tip into the ground
  // just because you're looking down.
  getForwardDirection() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
  }

  getRightDirection() {
    return new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw)).normalize();
  }

  // Full 3D look direction, pitch included — what spells and the wand
  // actually fire along, so aiming up or down is real aiming now
  // instead of everything travelling dead level.
  getAimDirection() {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(
      -Math.sin(this.yaw) * cp,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * cp
    ).normalize();
  }
}

export const cameraController = new CameraController();
