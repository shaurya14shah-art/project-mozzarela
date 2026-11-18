// ══════════════════════════════════════════════════════════
// Game Engine — Fixed Timestep Game Loop
// ══════════════════════════════════════════════════════════

import { GAME } from '../data/constants.js';
import { eventBus, Events } from './EventBus.js';

class Engine {
  constructor() {
    this.isRunning = false;
    this.isPaused = false;
    this.frameId = null;
    this.lastTime = 0;
    this.accumulator = 0;
    this.frameCount = 0;
    this.fps = 0;
    this.fpsTimer = 0;
    this.fpsFrames = 0;

    // Callbacks
    this.onFixedUpdate = null;  // (dt) => {}
    this.onUpdate = null;        // (dt) => {}
    this.onRender = null;        // (alpha) => {}
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now() / 1000;
    this.frameId = requestAnimationFrame((t) => this._loop(t));
    console.log('[Engine] Started');
    eventBus.emit(Events.ENGINE_READY);
  }

  stop() {
    this.isRunning = false;
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  pause() {
    this.isPaused = true;
    eventBus.emit(Events.ENGINE_PAUSE);
  }

  resume() {
    this.isPaused = false;
    this.lastTime = performance.now() / 1000;
    this.accumulator = 0;
    eventBus.emit(Events.ENGINE_RESUME);
  }

  _loop(timestamp) {
    if (!this.isRunning) return;
    this.frameId = requestAnimationFrame((t) => this._loop(t));

    const now = timestamp / 1000;
    let dt = now - this.lastTime;
    this.lastTime = now;

    // Clamp to prevent spiral of death
    if (dt > GAME.MAX_DELTA) dt = GAME.MAX_DELTA;
    // ⚠️ NEVER NEGATIVE. start()/resume() stamp lastTime with
    // performance.now(), but the rAF timestamp is the frame's START
    // time — earlier — and after any long blocking task (boot, a
    // loading hitch, a tab switch) seconds earlier. Measured −2.5 s.
    // A negative dt ran every animation backwards: the weapon's
    // materialise ease hit −42× scale and filled the lens with an
    // inverted sword ("seeing inside myself"), and the fixed-step
    // accumulator went 2.5 s negative, freezing physics and movement.
    if (!(dt > 0)) dt = 0;

    // FPS counter
    this.fpsTimer += dt;
    this.fpsFrames++;
    if (this.fpsTimer >= 1.0) {
      this.fps = this.fpsFrames;
      this.fpsFrames = 0;
      this.fpsTimer -= 1.0;
    }

    if (this.isPaused) return;

    // Fixed timestep physics/logic
    this.accumulator += dt;
    while (this.accumulator >= GAME.FIXED_TIMESTEP) {
      if (this.onFixedUpdate) this.onFixedUpdate(GAME.FIXED_TIMESTEP);
      this.accumulator -= GAME.FIXED_TIMESTEP;
    }

    // Variable timestep update
    if (this.onUpdate) this.onUpdate(dt);

    // Render with interpolation alpha
    const alpha = this.accumulator / GAME.FIXED_TIMESTEP;
    if (this.onRender) this.onRender(alpha);

    this.frameCount++;
  }
}

export const engine = new Engine();
