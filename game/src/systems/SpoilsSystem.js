// ══════════════════════════════════════════════════════════
// Spoils — Echoes and Memories, the things you carry back up
//
// ── WHY THIS EXISTS ───────────────────────────────────────
// ⚠️ Echoes and Memories were DESIGNED AND NEVER BUILT. `REVENANT_BOUND`
// was emitted by DescentSystem on a devour and nothing listened;
// `REMNANT_CLAIMED` was never emitted at all. The vocabulary was in the
// handoff, the events were in the EventBus, and the player could not
// obtain or use either.
//
// So a Descent paid out fragments and a Trial, and the two spoils that
// were supposed to make going down feel like looting something came to
// nothing.
//
//   ECHO    the shade of the Warden you killed. Devouring binds it.
//           Call it and it fights for you, briefly, once per cooldown.
//   MEMORY  what crystallised out of a sealed Descent. A held power
//           rather than a creature — armour of held breath, a second
//           wind, a step you should not have survived.
//
// The two are deliberately asymmetric and deliberately tied to the two
// resolutions: you cannot have both from one Descent, because you
// cannot both put a thing back and keep it (see descents.js).
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';
import { DESCENTS } from '../data/descents.js';

/**
 * What a Memory does, by the element it crystallised from.
 *
 * One per element, each a single legible promise — same rule the
 * Ascent's grants follow. No stat soup.
 */
export const MEMORY_POWERS = {
  fire:      { name: 'The Held Ember',    desc: 'Your next strike burns. 12s.',            cooldown: 26, effect: { burn: true, duration: 12 } },
  water:     { name: 'The Kept Tide',     desc: 'Restore a third of your health.',          cooldown: 45, effect: { heal: 0.33 } },
  earth:     { name: 'The Laid Stone',    desc: 'Take half damage for 8s.',                 cooldown: 40, effect: { armour: 0.5, duration: 8 } },
  wind:      { name: 'The Long Breath',   desc: 'Move at double speed for 6s.',             cooldown: 30, effect: { haste: 2, duration: 6 } },
  ice:       { name: 'The Stopped Hour',  desc: 'Everything near you slows hard. 5s.',      cooldown: 38, effect: { slowField: 0.35, duration: 5 } },
  lightning: { name: 'The Standing Arc',  desc: 'Your casts cost nothing for 5s.',          cooldown: 42, effect: { freeCast: true, duration: 5 } },
  shadow:    { name: 'The Cast Nothing',  desc: 'Nothing can see you for 6s.',              cooldown: 44, effect: { unseen: true, duration: 6 } },
  light:     { name: 'The Undimmed',      desc: 'Regenerate steadily for 10s.',             cooldown: 36, effect: { regen: 3, duration: 10 } },
  void:      { name: 'The Subtracted',    desc: 'Your next hit takes what it deals.',       cooldown: 34, effect: { drain: 1.0 } },
  arcane:    { name: 'The Finished Proof', desc: 'Your next Weave cannot go wrong.',        cooldown: 32, effect: { noSurge: true } },
  poison:    { name: 'The Patient Dose',  desc: 'Everything you strike rots. 10s.',         cooldown: 30, effect: { poison: true, duration: 10 } },
};

class SpoilsSystem {
  constructor() {
    /** @type {Map<string, object>} */
    this.echoes = new Map();
    /** @type {Map<string, object>} */
    this.memories = new Map();
    this._cooldowns = new Map();   // id → seconds remaining
    this._spawner = null;
    this._player = null;
  }

  /** Injected — same reason DescentSystem takes its dependencies. */
  init({ spawner, player }) {
    this._spawner = spawner;
    this._player = player;

    // ⚠️ These two listeners are the whole reason the events existed.
    // REVENANT_BOUND was fired by DescentSystem into nothing until now.
    eventBus.on(Events.REVENANT_BOUND, (d) => this.bindEcho(d));
    eventBus.on(Events.DESCENT_EXIT, (d) => {
      if (d?.verb === 'seal' && d.element) this.claimMemory(d);
    });
  }

  // ── ECHOES ──────────────────────────────────────────────

  bindEcho({ name, element, tier }) {
    const arch = DESCENTS[element];
    const id = `echo_${element}_${tier}`;
    if (this.echoes.has(id)) {
      // A second Echo of the same Warden strengthens the one you have
      // rather than cluttering the list with duplicates.
      const e = this.echoes.get(id);
      e.tier = Math.max(e.tier, tier);
      e.stacks = (e.stacks || 1) + 1;
      eventBus.emit(Events.UI_NOTIFY, `${e.name} answers more readily now.`);
      return e;
    }
    const echo = {
      id, kind: 'echo',
      name: name || arch?.warden || 'Something',
      element, tier,
      typeIndex: arch?.wardenType ?? 5,
      cooldown: 50 + tier * 10,
      stacks: 1,
      desc: `Calls ${name} to fight beside you for a short while.`,
    };
    this.echoes.set(id, echo);
    eventBus.emit(Events.UI_NOTIFY, `${echo.name} came back up with you. Bind it to a key (V).`);
    return echo;
  }

  // ── MEMORIES ────────────────────────────────────────────

  claimMemory({ element, tier, name }) {
    const power = MEMORY_POWERS[element];
    if (!power) return null;
    const id = `memory_${element}`;
    if (this.memories.has(id)) {
      const m = this.memories.get(id);
      m.tier = Math.max(m.tier, tier);
      eventBus.emit(Events.UI_NOTIFY, `${m.name} sits heavier than it did.`);
      return m;
    }
    const mem = {
      id, kind: 'memory',
      name: power.name,
      element, tier,
      desc: power.desc,
      cooldown: power.cooldown,
      effect: power.effect,
    };
    this.memories.set(id, mem);
    eventBus.emit(Events.REMNANT_CLAIMED, mem);
    eventBus.emit(Events.UI_NOTIFY, `${mem.name} crystallised. Bind it to a key (V).`);
    return mem;
  }

  // ── USE ─────────────────────────────────────────────────

  get(kind, id) {
    return kind === 'echo' ? this.echoes.get(id) : this.memories.get(id);
  }

  cooldownOf(id) { return this._cooldowns.get(id) || 0; }

  /**
   * Fire a bound Echo or Memory. Returns false (and says why) rather
   * than failing silently — an ability that does nothing on a keypress
   * with no feedback is indistinguishable from a broken keybind.
   */
  activate(kind, id) {
    const thing = this.get(kind, id);
    if (!thing) return false;

    const cd = this.cooldownOf(id);
    if (cd > 0) {
      eventBus.emit(Events.UI_NOTIFY, `${thing.name} is not ready. ${Math.ceil(cd)}s.`);
      return false;
    }

    if (kind === 'echo') this._callEcho(thing);
    else this._useMemory(thing);

    this._cooldowns.set(id, thing.cooldown);
    return true;
  }

  _callEcho(echo) {
    if (!this._spawner || !this._player) return;
    // Forged as a named unique out of the ordinary template — exactly
    // the way Vell and the Wardens are. `friendly` marks it as fighting
    // for the player rather than against them.
    const p = this._player.position;
    const a = Math.random() * Math.PI * 2;
    const pos = p.clone ? p.clone() : { ...p };
    pos.x += Math.cos(a) * 3;
    pos.z += Math.sin(a) * 3;
    pos.y += 1;
    const e = this._spawner.spawnNamed(echo.typeIndex, pos, 4 + echo.tier * 3, {
      name: echo.name,
      hpMult: 1.2 + echo.stacks * 0.3,
      atkMult: 1 + echo.tier * 0.15,
      friendly: true,
      isBoss: false,
    });
    // Echoes are temporary by nature — a shade you called, not a pet.
    if (e) {
      e.friendly = true;
      e.despawnAt = (performance.now() / 1000) + 18 + echo.tier * 3;
    }
    eventBus.emit(Events.UI_NOTIFY, `${echo.name} answers.`);
  }

  _useMemory(mem) {
    eventBus.emit(Events.UI_NOTIFY, `${mem.name} — ${mem.desc}`);
    eventBus.emit(Events.MEMORY_USED, { memory: mem, effect: mem.effect });
  }

  update(dt) {
    if (!this._cooldowns.size) return;
    for (const [id, t] of this._cooldowns) {
      const next = t - dt;
      if (next <= 0) this._cooldowns.delete(id);
      else this._cooldowns.set(id, next);
    }
  }

  /** Everything bindable, for the bindings panel. */
  bindables() {
    return [...this.echoes.values(), ...this.memories.values()];
  }
}

export const spoilsSystem = new SpoilsSystem();
