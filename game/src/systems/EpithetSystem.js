// ══════════════════════════════════════════════════════════
// EPITHETS — the system that watches for a defining act
//
// See data/epithets.js for what an Epithet IS and how it differs from
// a Mark. This file is only the watcher and the ledger.
//
// ⚠️ EVENT-DRIVEN, never polled. An Epithet is a MOMENT — "you killed
// something five ranks above you" is true for one frame and then is
// only ever true as a memory. A polled check would either miss it or
// need a tally, and a tally turns a defining act into a threshold,
// which is exactly what data/epithets.js says these must not be.
//
// ⚠️ THE CAP IS REAL AND THE OVERFLOW IS REPORTED. Holding every
// Epithet would make them a checklist rather than an identity. Past
// the cap the act is still recognised out loud — it just does not
// displace what you already carry. Silently dropping it would read as
// the system being broken, which is the same rule the loadout hotbar
// follows for its own overflow.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';
import { EPITHETS, EPITHET_CAP } from '../data/epithets.js';
// ⚠️ The rank gap is computed HERE rather than shipped on the event.
// COMBAT_KILL is emitted from Enemy.js, which knows its own level and
// nothing about the Ascent — asking it to compute a gap would give it
// a dependency on the player's progression just to fire a kill.
import { rankForLevel } from '../data/ranks.js';
import { ascentSystem } from './AscentSystem.js';

class EpithetSystem {
  constructor() {
    /** id → epithet, in the order they were earned. */
    this.earned = new Map();
    this.player = null;
    this._bound = false;
    /** The few running counts the tally-based Epithets legitimately need. */
    this.tally = { deaths: 0, distance: 0, monolithsRead: 0, memoriesForged: 0 };
  }

  init({ player } = {}) {
    this.player = player;
    if (this._bound) return;
    this._bound = true;

    eventBus.on(Events.COMBAT_KILL, (d) => {
      // ⚠️ Only the PLAYER's kills. COMBAT_KILL fires for an Echo's
      // kills and enemy-on-enemy too, and being *near* a giant dying
      // is not felling one — trap #12's shape.
      if (d?.byPlayer === false) return;
      const enemy = d?.enemy;
      if (!enemy) return;
      const theirRank = rankForLevel(d.level ?? enemy.level ?? 1);
      const mine = ascentSystem.tier ?? 0;
      this._offer({
        kind: 'kill',
        enemy,
        gap: theirRank - mine,
        hpFraction: this.player ? this.player.hp / Math.max(1, this.player.maxHp) : 1,
      });
    });

    eventBus.on(Events.DESCENT_RESOLVED, (d) => {
      this._offer({ kind: 'descent', tier: d?.tier ?? 1, flawless: !!d?.flawless });
    });

    eventBus.on(Events.MEMORY_FORGED, () => {
      this.tally.memoriesForged++;
      this._offer({ kind: 'forge', memoriesForged: this.tally.memoriesForged });
    });

    eventBus.on(Events.PLAYER_DEATH, () => {
      this.tally.deaths++;
      this._offer({ kind: 'death', deaths: this.tally.deaths });
    });

    eventBus.on(Events.SITE_USED, (d) => {
      const kind = String(d?.id || '').split('@')[0];
      if (kind === 'monolith') this.tally.monolithsRead++;
      this._offer({ kind: 'site', siteKind: kind, monolithsRead: this.tally.monolithsRead });
    });
  }

  /** Called from the movement tally — cheap, and only crosses once. */
  noteDistance(d) {
    if (!Number.isFinite(d) || d <= 0) return;
    this.tally.distance += d;
    // ⚠️ Only offered once the threshold is actually in reach, so this
    // is not running eight `test()` closures every frame of walking.
    if (this.tally.distance >= 6000 && !this.earned.has('longwalker')) {
      this._offer({ kind: 'travel', distance: this.tally.distance });
    }
  }

  /**
   * Consider one moment against every Epithet not yet held.
   * ⚠️ FIRST match wins — see the ordering note in data/epithets.js.
   */
  _offer(ctx) {
    ctx.player = this.player;
    for (const id of Object.keys(EPITHETS)) {
      if (this.earned.has(id)) continue;
      const e = EPITHETS[id];
      let ok = false;
      try { ok = !!e.test(ctx); } catch { ok = false; }
      if (!ok) continue;

      if (this.earned.size >= EPITHET_CAP) {
        // Recognised, not granted. Said out loud rather than dropped.
        eventBus.emit(Events.UI_NOTIFY,
          `They would have called you ${e.name} — but you already carry ${EPITHET_CAP}.`);
        return;
      }
      this.earned.set(id, e);
      eventBus.emit(Events.EPITHET_EARNED, { ...e });
      eventBus.emit(Events.UI_NOTIFY, `You are known as ${e.name}. ${e.line}`);
      return;   // one act, one name
    }
  }

  /**
   * A named grant across every Epithet held.
   *
   * ⚠️ The DEFAULT is the caller's, for the same reason BoonSystem's
   * is: only the call site knows whether "no effect" is 1 or 0.
   */
  grant(key, fallback) {
    let out;
    for (const e of this.earned.values()) {
      const v = e.grants?.[key];
      if (v === undefined) continue;
      out = (typeof v === 'number' && typeof out === 'number') ? out * v : v;
    }
    return out === undefined ? fallback : out;
  }

  has(id) { return this.earned.has(id); }
  get names() { return [...this.earned.values()].map(e => e.name); }

  /** The line under your name in the HUD — the newest you earned. */
  title() {
    const all = [...this.earned.values()];
    return all.length ? all[all.length - 1].name : null;
  }

  snapshot() {
    return {
      earned: [...this.earned.values()].map(e => ({ id: e.id, name: e.name, line: e.line })),
      cap: EPITHET_CAP,
      tally: { ...this.tally },
    };
  }

  save() { return { earned: [...this.earned.keys()], tally: { ...this.tally } }; }
  restore(v) {
    this.earned.clear();
    for (const id of (v?.earned || [])) {
      if (EPITHETS[id]) this.earned.set(id, EPITHETS[id]);
    }
    this.tally = { ...this.tally, ...(v?.tally || {}) };
  }
  reset() { this.earned.clear(); this.tally = { deaths: 0, distance: 0, monolithsRead: 0, memoriesForged: 0 }; }
}

export const epithetSystem = new EpithetSystem();
