// ══════════════════════════════════════════════════════════
// BOONS — a blessing that lasts long enough to shape a trip
//
// ── WHY THIS EXISTS ───────────────────────────────────────
// A shrine that hands out a permanent stat is just loot with a longer
// walk, and one that hands out a 10-second buff is confetti. A Boon
// sits deliberately between: minutes, not seconds and not forever, so
// it changes *the stretch of play you are in* — which is what makes
// deciding to spend cores on it a real decision, and what makes
// remembering where a shrine was worth doing.
//
// ⚠️ ONE AT A TIME. Taking a second Boon replaces the first, out
// loud. Stacking them would make the shrine a checklist to farm before
// every Descent, and the interesting question ("which one, now?")
// would stop being a question.
//
// ⚠️ Every Boon publishes a FACTOR that something else folds in. None
// of them assigns a stat. This is trap #9 — the recurring architecture
// bug in this project — and a timed effect is the single easiest way
// to reintroduce it, because the expiry path looks like it should
// "put the value back".
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';

const MINUTES = 60;

export const BOONS = {
  kindled: {
    id: 'kindled', name: 'Kindled',
    line: 'What you throw lands harder.',
    dur: 10 * MINUTES,
    grants: { damageMult: 1.16 },
  },
  girded: {
    id: 'girded', name: 'Girded',
    line: 'Less of what reaches you gets through.',
    dur: 10 * MINUTES,
    grants: { resist: 0.14 },
  },
  quickened: {
    id: 'quickened', name: 'Quickened',
    line: 'Your hands are faster than they were.',
    dur: 8 * MINUTES,
    grants: { haste: 0.18 },
  },
  deepening: {
    id: 'deepening', name: 'Deepening',
    line: 'Everything you cast leaves more of itself in you.',
    dur: 12 * MINUTES,
    grants: { attuneMult: 1.5 },
  },
  unburdened: {
    id: 'unburdened', name: 'Unburdened',
    line: 'The Core gives more freely.',
    dur: 10 * MINUTES,
    grants: { essenceMult: 1.35 },
  },
};

/**
 * Which Boon an offering of a given element buys.
 *
 * ⚠️ DECLARED, not hashed. The player should be able to decide what to
 * carry to a shrine — an offering whose outcome is a die roll is a
 * slot machine, and this project has already replaced one of those
 * (the old 14-rune lookup) for exactly that reason.
 */
const BY_ELEMENT = {
  fire: 'kindled', lightning: 'kindled', poison: 'kindled',
  earth: 'girded', ice: 'girded', water: 'girded',
  wind: 'quickened', shadow: 'quickened',
  arcane: 'deepening', void: 'deepening',
  light: 'unburdened', neutral: 'unburdened',
};

class BoonSystem {
  constructor() {
    this.active = null;   // { id, name, line, left, dur, grants, from }
  }

  /** What element buys what — for the shrine's own prompt. */
  boonFor(element) {
    return BOONS[BY_ELEMENT[element] || 'unburdened'];
  }

  grant(from, element) {
    const b = this.boonFor(element);
    if (!b) return null;
    const replaced = this.active && this.active.id !== b.id ? this.active.name : null;
    this.active = { ...b, left: b.dur, from };
    eventBus.emit(Events.BOON_GRANTED, { ...this.active, replaced });
    eventBus.emit(Events.UI_NOTIFY, replaced
      ? `${b.name} — ${b.line} (${replaced} is gone.)`
      : `${b.name} — ${b.line}`);
    return this.active;
  }

  /**
   * A named grant, or its neutral default.
   *
   * ⚠️ The DEFAULT is the caller's, not this system's — a missing Boon
   * has to resolve to "no change", and only the call site knows
   * whether that is 1 (a multiplier) or 0 (an addend). Returning a
   * blanket 0 here would silently zero every multiplier that asked.
   */
  grantOf(key, fallback) {
    if (!this.active) return fallback;
    const v = this.active.grants[key];
    return v === undefined ? fallback : v;
  }

  update(dt) {
    if (!this.active) return;
    this.active.left -= dt;
    if (this.active.left > 0) return;
    const gone = this.active.name;
    this.active = null;
    eventBus.emit(Events.BOON_EXPIRED, { name: gone });
    eventBus.emit(Events.UI_NOTIFY, `${gone} has faded.`);
  }

  snapshot() {
    if (!this.active) return null;
    return {
      id: this.active.id, name: this.active.name, line: this.active.line,
      left: Math.max(0, Math.round(this.active.left)),
      dur: this.active.dur,
      fraction: Math.max(0, this.active.left / this.active.dur),
    };
  }

  /** Save/restore — a Boon with minutes left should survive a reload. */
  save() { return this.active ? { id: this.active.id, left: this.active.left, from: this.active.from } : null; }
  restore(v) {
    if (!v?.id || !BOONS[v.id]) { this.active = null; return; }
    this.active = { ...BOONS[v.id], left: Math.max(0, v.left || 0), from: v.from };
    if (this.active.left <= 0) this.active = null;
  }
  reset() { this.active = null; }
}

export const boonSystem = new BoonSystem();
