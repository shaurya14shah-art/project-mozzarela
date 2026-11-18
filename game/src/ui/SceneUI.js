// ══════════════════════════════════════════════════════════
// SCENES — the story, told rather than mentioned
//
// ── WHY THIS EXISTS ───────────────────────────────────────
// Owner: "make me experience rather than play the game."
//
// Every narrative beat in this project was delivered as a UI_NOTIFY —
// a toast in the corner of the screen, while the player was running.
// Elder Aris's forty years of doubt arrived as two toasts 2.6 seconds
// apart, on a `setTimeout`, over the top of item pickups and damage
// numbers. Vell's introduction was a toast. The finale's narration
// was a toast.
//
// Good writing delivered that way is not experienced. It is *noticed*,
// briefly, and then it is gone and cannot be recalled.
//
// A SCENE stops the world instead: letterbox in, the speaker named,
// the lines advanced by the player at their own pace, and nothing else
// on screen competing for the eye.
//
// ── THE RULES ─────────────────────────────────────────────
// ⚠️ THE PLAYER ADVANCES IT, never a timer. A `setTimeout` that moves
// the text on is the toast problem again with extra steps: it reads at
// whatever pace the writer guessed, and a slow reader loses the line.
//
// ⚠️ IT MUST BE SKIPPABLE, and skipping must be visible. Anyone on
// their second run through a Descent should not be held. Escape ends
// the scene immediately.
//
// ⚠️ IT DOES NOT PAUSE THE ENGINE. `engine.stop()` would freeze the
// atmosphere, the day cycle and every timer in the project, and the
// Descent's wave clock is one of them — a scene that fired mid-Descent
// would stop the fight it was commenting on. Input is captured;
// simulation keeps running, and the world keeps making its noise
// behind the letterbox, which is the atmosphere doing work.
//
// ⚠️ ONE QUEUE. Two scenes racing each other is how the finale would
// end up overlapping an NPC greeting. Scenes queue and play in order.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';
import { audioSystem } from '../systems/AudioSystem.js';
import { fractureRule } from './Sigil.js';

const ROOT_ID = 'story-scene';

class SceneUI {
  constructor() {
    /** True until the world starts — see suspend(). */
    this._suspended = true;
    this.el = null;
    this._queue = [];
    this._active = null;
    this._line = 0;
    this._typing = false;
    this._typeTimer = null;
    this._onDone = null;
  }

  init() {
    this._build();
    // ⚠️ Guarded — `_build()` can only fail if the DOM is gone, but a
    // null here would throw during boot and take the whole game with
    // it rather than costing one overlay.
    if (!this.el) { console.warn('[Scene] could not build — story scenes disabled.'); return; }
    if (this._inited) return;
    this._inited = true;
    // ⚠️ Capture phase, so a scene swallows the key BEFORE the panel
    // keys (B/V/I/K), the hotbar digits and the interact key see it.
    // Without capture, advancing a line with E also re-triggers the
    // NPC you are talking to and the scene restarts itself forever.
    document.addEventListener('keydown', (e) => this._onKey(e), true);
    this.el.addEventListener('click', () => { if (this._active) this._advance(); });
  }

  get isOpen() { return !!this._active; }

  _build() {
    // ⚠️ ADOPT an existing element, never bail. The usual
    // `if (getElementById(id)) return;` guard leaves `this.el` NULL on
    // the new instance whenever the module is re-evaluated (HMR, or a
    // second init), and every method here then throws
    // "Cannot read properties of null" from inside an async boot —
    // which surfaces as the game silently failing to start, with a
    // stack pointing at whatever line of main.js was unlucky.
    const existing = document.getElementById(ROOT_ID);
    if (existing) { this.el = existing; return; }
    const el = document.createElement('div');
    el.id = ROOT_ID;
    el.className = 'story-scene hidden';
    el.innerHTML = `
      <div class="scene-bar scene-bar-top"></div>
      <div class="scene-body">
        <div class="scene-chapter hidden">
          <div class="scene-chapter-num"></div>
          <div class="scene-chapter-title"></div>
          ${fractureRule()}
          <div class="scene-chapter-epigraph"></div>
        </div>
        <div class="scene-speaker"></div>
        <div class="scene-line"></div>
        <div class="scene-hint">space or click to go on · esc to skip</div>
      </div>
      <div class="scene-bar scene-bar-bottom"></div>
    `;
    (document.body).appendChild(el);
    this.el = el;
  }

  /**
   * Build on demand if a scene is requested before init().
   *
   * ⚠️ This is not defensive padding — it is load-bearing. `questSystem.init()`
   * registers a BIOME_ENTER listener, and the very first
   * `chunkManager.update(0, 0)` during boot can complete mq1 and ask
   * for Act II's card **before** any UI has been initialised. Without
   * this the whole async boot threw
   * "Cannot read properties of null (reading 'classList')" and the
   * game hung on the loading screen forever, with a stack pointing at
   * `chunkManager.update` — a line that has nothing to do with it.
   */
  _ensure() {
    if (!this.el) this._build();
    return !!this.el;
  }

  // ── THE TWO KINDS OF SCENE ──────────────────────────────

  /**
   * Somebody speaking. `lines` is a list of strings.
   * ⚠️ Falls through silently on an empty list rather than opening an
   * empty box — an NPC with no dialogue for this stage should simply
   * not start a scene.
   */
  say(speaker, lines, opts = {}) {
    const list = (lines || []).filter(Boolean);
    if (!list.length) return false;
    this._ensure();
    this._queue.push({ kind: 'say', speaker, lines: list, ...opts });
    if (!this._active) this._next();
    return true;
  }

  /** An act opening. Held longer, and centred. */
  chapter(act, opts = {}) {
    if (!act) return false;
    this._ensure();
    this._queue.push({ kind: 'chapter', act, lines: act.card || [], ...opts });
    if (!this._active) this._next();
    return true;
  }

  // ── PLAYBACK ────────────────────────────────────────────

  // ══════════════════════════════════════════════════════════
  // ⚠️ SUSPENDED WHILE A PRE-GAME SCREEN IS UP
  //
  // main.js's own comment at `questSystem.init()` records that the
  // first `chunkManager.update()` can complete mq1 and request Act
  // II's chapter card DURING BOOT. That card is `position: fixed`,
  // `z-index: 900` and `pointer-events: auto` — so it renders over the
  // loading screen, the roster and character creation, and swallows
  // every click on them. Measured on a clean install: opacity 1,
  // pointer-events auto, sitting on top of a roster whose buttons had
  // become unreachable.
  //
  // ⚠️ HELD, NOT DROPPED. The act genuinely did begin; discarding the
  // card would silently cost the player a story beat to fix a layering
  // problem. The queue simply does not start playing until the world
  // does.
  //
  // ⚠️ Only ONE held card is kept. If boot somehow advanced several
  // acts, replaying the whole run of them at the player the instant
  // they gain control is worse than opening on the one they are
  // actually at.
  // ══════════════════════════════════════════════════════════
  suspend() { this._suspended = true; }

  resume() {
    this._suspended = false;
    if (this._queue.length > 1) this._queue = [this._queue[this._queue.length - 1]];
    if (!this._active && this._queue.length) this._next();
  }

  _next() {
    // Nothing plays over the menus. `_queue` keeps its contents, so
    // whatever was requested opens the moment `resume()` is called.
    if (this._suspended) return;
    this._active = this._queue.shift() || null;
    if (!this._active) { this._close(); return; }
    if (!this._ensure()) { this._active = null; return; }

    this._line = 0;
    this.el.classList.remove('hidden');
    // A beat of letterbox before the first word, so the bars are
    // visibly closing rather than the text appearing pre-framed.
    //
    // ⚠️ `setTimeout`, NOT `requestAnimationFrame`. rAF is suspended
    // whenever the document is hidden (§6 — it is the single most
    // important fact about verifying anything in this project), so an
    // rAF-gated class add leaves the scene permanently un-revealed in
    // exactly the state a tester is most likely to look at it. The
    // transition itself is CSS and does not care which fired it.
    setTimeout(() => { if (this.el) this.el.classList.add('showing'); }, 16);
    if (document.pointerLockElement) document.exitPointerLock();
    // ⚠️ THE HUD GETS OUT OF THE WAY. A letterboxed story beat with a
    // health bar, a portrait, two compasses and a hotbar still on
    // screen is a cutscene playing inside a game UI — the player's eye
    // has nowhere to rest and the beat reads as another notification.
    // Driven by a class on <body> rather than by touching each panel,
    // so a panel added later is covered automatically.
    document.body.classList.add('in-scene');
    eventBus.emit(Events.SCENE_START, { kind: this._active.kind });
    audioSystem.playUIClick?.('open');

    const chap = this.el.querySelector('.scene-chapter');
    if (this._active.kind === 'chapter') {
      const a = this._active.act;
      chap.classList.remove('hidden');
      chap.querySelector('.scene-chapter-num').textContent = `Act ${a.number}`;
      chap.querySelector('.scene-chapter-title').textContent = a.title;
      chap.querySelector('.scene-chapter-epigraph').textContent = a.epigraph ? `“${a.epigraph}”` : '';
    } else {
      chap.classList.add('hidden');
    }
    this._render();
  }

  _render() {
    const s = this._active;
    if (!s) return;
    const speakerEl = this.el.querySelector('.scene-speaker');
    const lineEl = this.el.querySelector('.scene-line');
    speakerEl.textContent = s.kind === 'say' ? (s.speaker || '') : '';
    speakerEl.classList.toggle('hidden', s.kind !== 'say');

    const text = s.lines[this._line] || '';
    this._type(lineEl, text);
  }

  /**
   * Letter-by-letter, because a line that appears whole is read as UI
   * and a line that arrives is read as speech.
   *
   * ⚠️ Interruptible: pressing advance mid-type completes the line
   * instead of skipping it. Forcing someone to watch an animation they
   * have already read is the fastest way to make them stop reading.
   */
  _type(el, text) {
    clearInterval(this._typeTimer);
    this._typing = true;
    el.textContent = '';
    let i = 0;
    this._typeTimer = setInterval(() => {
      i += 2;
      el.textContent = text.slice(0, i);
      if (i >= text.length) {
        clearInterval(this._typeTimer);
        this._typing = false;
        el.textContent = text;
      }
    }, 16);
    this._fullText = text;
    this._lineEl = el;
  }

  _advance() {
    if (!this._active) return;
    if (this._typing) {
      // Complete the line rather than moving past it.
      clearInterval(this._typeTimer);
      this._typing = false;
      if (this._lineEl) this._lineEl.textContent = this._fullText;
      return;
    }
    this._line++;
    if (this._line >= this._active.lines.length) {
      const done = this._active.onDone;
      this._active = null;
      if (typeof done === 'function') { try { done(); } catch (e) { console.warn('[Scene] onDone threw', e); } }
      this._next();
      return;
    }
    this._render();
  }

  /** Escape — end the whole queue, not just this scene. */
  skip() {
    clearInterval(this._typeTimer);
    const pending = [this._active, ...this._queue].filter(Boolean);
    this._queue.length = 0;
    this._active = null;
    // ⚠️ `onDone` still runs for everything skipped. A scene is
    // presentation; the thing it was announcing (a quest advancing, a
    // reward) must not depend on the player having watched it.
    for (const s of pending) {
      if (typeof s.onDone === 'function') {
        try { s.onDone(); } catch (e) { console.warn('[Scene] onDone threw', e); }
      }
    }
    this._close();
  }

  _close() {
    document.body.classList.remove('in-scene');
    if (!this.el) return;
    this.el.classList.remove('showing');
    this.el.classList.add('hidden');
    eventBus.emit(Events.SCENE_END, {});
    audioSystem.playUIClick?.('close');
  }

  _onKey(e) {
    if (!this._active) return;
    // ⚠️ Everything is swallowed while a scene is up. Half-swallowing
    // (advance keys only) means the player opens the satchel behind
    // the letterbox and cannot see that they did.
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.skip(); return; }
    e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') this._advance();
  }
}

export const sceneUI = new SceneUI();
