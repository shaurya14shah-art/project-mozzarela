// ══════════════════════════════════════════════════════════
// Threads — holding the dormant trait, and firing it exactly once
//
// See data/threads.js for why this exists and why it is silent. This
// file's only jobs are: roll once, stay quiet, watch the Rank, and
// fire once.
//
// ⚠️ `fired` is one-way. A Thread that could fire twice would double
// its effect, and every effect here is a permanent categorical change
// rather than a buff with a duration — there is nothing to re-apply.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';
import { rollThread, THREADS } from '../data/threads.js';

class ThreadSystem {
  constructor() {
    this.thread = null;
    this.fired = false;
    this._core = null;
    this._ascent = null;
    this._bound = false;
  }

  /**
   * @param {function} [rng] forced roll, for tests only. See
   *   data/threads.js — a 6% system needs a way to be verified.
   */
  init({ core, ascent, rng } = {}) {
    this._core = core || null;
    this._ascent = ascent || null;
    this.thread = rollThread(rng || Math.random);
    this.fired = false;
    // ⚠️ Deliberately NO notification here, and nothing in the HUD.
    // The player must not learn they are Threadbound until it fires.
    if (!this._bound) { this._bind(); this._bound = true; }
  }

  _bind() {
    eventBus.on(Events.ASCENT_RANK_UP, () => this._check());
  }

  get isThreadbound() { return !!this.thread; }

  _check() {
    if (!this.thread || this.fired) return;
    const rank = this._ascent?.tier ?? 0;
    if (rank < this.thread.triggerRank) return;

    this.fired = true;
    this._apply(this.thread);
    eventBus.emit(Events.THREAD_REVEALED, { thread: this.thread });
    eventBus.emit(Events.UI_NOTIFY, `${this.thread.name}. ${this.thread.reveal}`);
  }

  _apply(thread) {
    switch (thread.effect) {
      case 'secondCore':
        this._core?.formSecondCore(thread.name);
        break;
      // The remaining three are read where they matter rather than
      // pushed — see grant() below. A Thread that pushed state into
      // four systems would be four places to forget to undo.
      default:
        break;
    }
  }

  /**
   * Ask whether a fired Thread grants something.
   *
   * ⚠️ Pull, not push. Call sites ask `threadSystem.grant('extraAspect')`
   * at the moment they need it, so a Thread cannot leave stale state
   * behind in a system that has since been rebuilt.
   */
  grant(effect) {
    return this.fired && this.thread?.effect === effect;
  }

  snapshot() {
    return {
      // ⚠️ `id` is null until it fires. Anything reading this to draw
      // a character sheet must not be able to spoil it.
      id: this.fired ? this.thread?.id : null,
      name: this.fired ? this.thread?.name : null,
      blurb: this.fired ? this.thread?.blurb : null,
      fired: this.fired,
    };
  }

  /** Testing only. */
  force(id) {
    this.thread = THREADS[id] || null;
    this.fired = false;
    return !!this.thread;
  }
}

export const threadSystem = new ThreadSystem();
