// ══════════════════════════════════════════════════════════
// Input Manager — Keyboard, Mouse & Gamepad
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from './EventBus.js';

class InputManager {
  constructor() {
    this.keys = {};
    this.keysJustPressed = {};
    this.mouse = { x: 0, y: 0, dx: 0, dy: 0, buttons: {} };
    this.isPointerLocked = false;
    this.scrollDelta = 0;
    this._boundHandlers = {};
  }

  init(canvas) {
    this.canvas = canvas;

    this._boundHandlers.keydown = (e) => this._onKeyDown(e);
    this._boundHandlers.keyup = (e) => this._onKeyUp(e);
    this._boundHandlers.mousedown = (e) => this._onMouseDown(e);
    this._boundHandlers.mouseup = (e) => this._onMouseUp(e);
    this._boundHandlers.mousemove = (e) => this._onMouseMove(e);
    this._boundHandlers.wheel = (e) => this._onWheel(e);
    this._boundHandlers.pointerlockchange = () => this._onPointerLockChange();
    this._boundHandlers.click = () => this.requestLook();

    window.addEventListener('keydown', this._boundHandlers.keydown);
    window.addEventListener('keyup', this._boundHandlers.keyup);
    window.addEventListener('mousedown', this._boundHandlers.mousedown);
    window.addEventListener('mouseup', this._boundHandlers.mouseup);
    window.addEventListener('mousemove', this._boundHandlers.mousemove);
    window.addEventListener('wheel', this._boundHandlers.wheel, { passive: false });
    document.addEventListener('pointerlockchange', this._boundHandlers.pointerlockchange);

    // Setup HUD toggle button
    const toggleBtn = document.getElementById('cursor-toggle-btn');
    if (toggleBtn) {
       toggleBtn.addEventListener('click', () => {
         if (this.isPointerLocked) {
           { this.intentionalUnlockAt = performance.now(); document.exitPointerLock(); }
         } else {
           this.requestLook();
         }
       });
    }

    console.log('[InputManager] Initialized');
  }

  /**
   * Request pointer lock, tolerating refusal.
   *
   * Sandboxed iframes (hosted artifacts, embeds) deny this unless the
   * frame carries allow-pointer-lock. On refusal we fall back to
   * drag-to-look, which _onMouseMove already supports, and say so once
   * rather than leaving the player wondering why the camera is stuck.
   */
  requestLook() {
    if (!this.canvas || this.isPointerLocked) return;
    let p;
    try {
      p = this.canvas.requestPointerLock();
    } catch {
      this._lookFallback();
      return;
    }
    if (p && typeof p.catch === 'function') p.catch(() => this._lookFallback());
  }

  _lookFallback() {
    this.pointerLockBlocked = true;
    if (this._toldAboutDrag) return;
    this._toldAboutDrag = true;
    import('./EventBus.js').then(({ eventBus, Events }) => {
      eventBus.emit(Events.UI_NOTIFY,
        'Mouse capture is unavailable here — hold a mouse button and drag to look around.');
    }).catch(() => {});
  }

  _onPointerLockChange() {
    this.isPointerLocked = document.pointerLockElement === this.canvas;
    const btn = document.getElementById('cursor-toggle-btn');
    if (btn) btn.innerText = this.isPointerLocked ? 'Unlock Cursor' : 'Lock Cursor';
  }

  /**
   * Canonical KeyboardEvent.code for an event, with a fallback.
   *
   * `code` is the right thing to key a game off — it's the physical
   * key, so WASD stays WASD on AZERTY. But it is not guaranteed to be
   * populated: synthetic events, some remote-input/automation layers
   * and a few embedded webviews deliver `key` only, and when `code`
   * comes back empty EVERY binding silently dies with no error to
   * explain it. Deriving the obvious code from `key` costs nothing
   * and turns a total input blackout into a graceful degradation.
   */
  _codeOf(e) {
    if (e.code) return e.code;
    const k = e.key;
    if (!k) return '';
    if (k.length === 1) {
      if (k >= '0' && k <= '9') return `Digit${k}`;
      const up = k.toUpperCase();
      if (up >= 'A' && up <= 'Z') return `Key${up}`;
      if (k === ' ') return 'Space';
    }
    // Arrow keys, Tab, Escape, Shift… already match their code names.
    return k;
  }

  _onKeyDown(e) {
    // DO NOT prevent default or capture keys if typing in an input field
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
      return;
    }

    const key = this._codeOf(e);
    if (!key) return;
    if (!this.keys[key]) {
      this.keysJustPressed[key] = true;
    }
    this.keys[key] = true;

    // Alt key quickly toggles lock
    if (key === 'AltLeft' || key === 'AltRight') {
      if (this.isPointerLocked) { this.intentionalUnlockAt = performance.now(); document.exitPointerLock(); }
      else this.requestLook();
    }

    // Prevent browser defaults for game keys
    if (['Space', 'Tab', 'KeyE', 'KeyI', 'AltLeft', 'AltRight', 'F1'].includes(key)) {   // F1: HUD detail toggle, not browser help
      e.preventDefault();
    }
  }

  _onKeyUp(e) {
    const key = this._codeOf(e);
    if (key) this.keys[key] = false;
  }

  _onMouseDown(e) {
    this.mouse.buttons[e.button] = true;
  }

  _onMouseUp(e) {
    this.mouse.buttons[e.button] = false;
  }

  _onMouseMove(e) {
    // If pointer locked, log absolute movement natively
    if (this.isPointerLocked) {
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    } else {
      // If unlocked but right-click (2) or middle-click (1) is held down, emulate drag
      if (this.mouse.buttons[1] || this.mouse.buttons[2] || this.mouse.buttons[0]) {
        // Just track drag if any mouse button is down while unlocked for camera orbiting
        this.mouse.dx += e.movementX;
        this.mouse.dy += e.movementY;
      }
    }
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
  }

  _onWheel(e) {
    e.preventDefault();
    // Delta Y is standard vertical scroll (Zoom)
    this.scrollDelta += e.deltaY;
    
    // Delta X is horizontal trackpad scroll (2-finger drag pan on Mac)
    if (Math.abs(e.deltaX) > 0.1) {
       // We'll feed this directly into mouse.dx to treat it like a camera pan
       this.mouse.dx += e.deltaX; 
    }
  }

  // Check if key is currently held
  isKeyDown(code) {
    return !!this.keys[code];
  }

  // Check if key was just pressed this frame
  isKeyJustPressed(code) {
    return !!this.keysJustPressed[code];
  }

  // Check mouse button
  isMouseDown(button = 0) {
    return !!this.mouse.buttons[button];
  }

  // Get movement vector (WASD) normalized
  getMovementVector() {
    let x = 0, z = 0;
    if (this.isKeyDown('KeyW') || this.isKeyDown('ArrowUp')) z += 1;
    if (this.isKeyDown('KeyS') || this.isKeyDown('ArrowDown')) z -= 1;
    if (this.isKeyDown('KeyA') || this.isKeyDown('ArrowLeft')) x -= 1;
    if (this.isKeyDown('KeyD') || this.isKeyDown('ArrowRight')) x += 1;

    // Normalize diagonal movement
    const len = Math.sqrt(x * x + z * z);
    if (len > 0) {
      x /= len;
      z /= len;
    }
    return { x, z };
  }

  isSprinting() {
    return this.isKeyDown('ShiftLeft') || this.isKeyDown('ShiftRight');
  }

  isJumping() {
    return this.isKeyJustPressed('Space');
  }

  isDodging() {
    // Was KeyQ, which is also main.js's wand-channel key — pressing Q
    // used to dodge AND start channelling a spell in the same frame.
    // Moved off it entirely; R is unused everywhere else.
    return this.isKeyJustPressed('KeyR');
  }

  // Get and reset mouse delta (consumed per frame)
  consumeMouseDelta() {
    const dx = this.mouse.dx;
    const dy = this.mouse.dy;
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    return { dx, dy };
  }

  consumeScrollDelta() {
    const delta = this.scrollDelta;
    this.scrollDelta = 0;
    return delta;
  }

  // Call at end of each frame
  endFrame() {
    this.keysJustPressed = {};
  }

  destroy() {
    window.removeEventListener('keydown', this._boundHandlers.keydown);
    window.removeEventListener('keyup', this._boundHandlers.keyup);
    window.removeEventListener('mousedown', this._boundHandlers.mousedown);
    window.removeEventListener('mouseup', this._boundHandlers.mouseup);
    window.removeEventListener('mousemove', this._boundHandlers.mousemove);
    window.removeEventListener('wheel', this._boundHandlers.wheel);
    document.removeEventListener('pointerlockchange', this._boundHandlers.pointerlockchange);
    if (this.canvas) {
      this.canvas.removeEventListener('click', this._boundHandlers.click);
    }
  }
}

export const input = new InputManager();
