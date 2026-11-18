// ══════════════════════════════════════════════════════════
// Progress — the FOURTH question about the player, and the only
// one that answers "am I stronger than I was an hour ago?"
//
// ── WHY THIS EXISTS ───────────────────────────────────────
// It was designed and never built, in exactly the pattern this
// project keeps repeating (see SpoilsSystem's Echoes, and NPC.interact
// before it). The evidence was all still sitting in the tree:
//
//   · Player.js declared `level`, `xp` and `xpToNext` and never
//     touched them again.
//   · Enemy.js computed `this.xp` per creature, scaled it by level,
//     and shipped it in COMBAT_KILL.
//   · EventBus declared PLAYER_LEVEL_UP, which nothing ever emitted.
//   · constants.js declared WAND.LEVEL_POWER_STEP, "added per player
//     level", which nothing ever read.
//
// Every half of the wiring existed except the middle. The result was
// a game where the ONLY progression was AscentSystem — which is
// deliberately gated behind Descents, and Descents are a poor first
// hour. "There is no way to level up without dungeons" is precisely
// that gap, and this closes it without touching the Ascent's refusal.
//
// ── HOW IT RELATES TO THE OTHER THREE ─────────────────────
// It does NOT collapse into any of them; conflating these is the
// documented cause of progression reading as illegible before.
//
//   AttunementSystem  what you are MADE OF        fluid, decays
//   LeaningSystem     which philosophy you ENACT  drifts
//   AscentSystem      how far down you have BEEN  permanent, gated
//   ProgressSystem    how much you have DONE      permanent, ungated
//
// This one is the floor, not the ceiling. It hands out flat vitals
// and a small power step — the kind of growth that makes hour two
// survivable — and grants nothing with an identity attached. Rank,
// title, philosophy and doctrine all remain the other three systems'
// to give. If a future session is tempted to hang a rank name or an
// ability off a level: don't. That is what the Ascent is for, and
// the Ascent refusing to hand those out for grinding is the mechanic.
//
// ── THE DIMINISHING RETURN IS LOAD-BEARING ────────────────
// XP is scaled by how far the kill is BELOW your level. Without it,
// the cheapest strategy in the game is standing in the level-1 plains
// killing slimes forever, which is both the most boring thing to do
// and the most rewarding — and it would also completely defeat the
// distance-based difficulty ramp in EnemySpawner, whose entire point
// is to push the player outward.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';

// Levels are cheap early and expensive later. A first level off two
// or three slimes is the point — the player has to FEEL that killing
// things in a field is a progression path within the first minute of
// trying it, or they go back to believing dungeons are the only way.
const BASE_XP = 60;
const XP_GROWTH = 1.28;

/** Total XP required to go from `level` to `level + 1`. */
export function xpForLevel(level) {
  return Math.round(BASE_XP * Math.pow(XP_GROWTH, level - 1));
}

// Per-level growth. Flat and unglamorous on purpose: this is the
// system that stops a level-4 wraith two-shotting you, not the one
// that gives you a build.
const GROWTH = {
  maxHp: 12,
  maxMp: 6,
  maxStamina: 3,
  atk: 2,
  def: 1.5,
};

// Non-combat XP. "No way to level up without dungeons" is only truly
// answered if combat is not the ONLY replacement — a player who
// prefers exploring or weaving must also be able to climb. These are
// deliberately worth several kills each: they happen far less often.
const AWARDS = {
  quest: 220,
  landmark: 300,
  brewFirst: 140,     // only for a weave the player has never made
  descent: 400,
};

class ProgressSystem {
  constructor() {
    this.player = null;
    this._bound = false;
  }

  /**
   * ⚠️ Deferred init, like every other scene-aware singleton here —
   * `player` does not exist at module-evaluation time, and reaching
   * for it in a constructor is the bug class this project's style
   * section calls out as recurring.
   */
  init(player) {
    this.player = player;
    player.level ||= 1;
    player.xp ||= 0;
    player.xpToNext = xpForLevel(player.level);
    this._applyLevelStats(player.level, { silent: true });
    if (!this._bound) { this._bind(); this._bound = true; }
    this._emit();
  }

  _bind() {
    eventBus.on(Events.COMBAT_KILL, ({ enemy, xp }) => {
      if (!enemy) return;
      this.award(this._scaleKill(xp || 0, enemy.level || 1), enemy.name);
    });

    eventBus.on(Events.QUEST_COMPLETE, ({ completed }) => {
      if (completed) this.award(AWARDS.quest, 'a duty discharged');
    });

    eventBus.on(Events.LANDMARK_DISCOVERED, () => {
      this.award(AWARDS.landmark, 'somewhere new');
    });

    eventBus.on(Events.BREW_COMPLETE, ({ isNew }) => {
      // Only the FIRST time a given weave is resolved. Paying per brew
      // would make the Loom an XP button you press with the same three
      // reagents, which is worse than the grind it replaces.
      if (isNew) this.award(AWARDS.brewFirst, 'a weave never made before');
    });

    eventBus.on(Events.DESCENT_RESOLVED, () => {
      this.award(AWARDS.descent, 'a Descent survived');
    });
  }

  /**
   * A kill's worth, after the level gap.
   *
   * At or above your level: full value, plus a modest bonus for
   * punching up. Below: falls off fast, and bottoms out at 8% rather
   * than zero — a trivial kill should be nearly pointless, not
   * insulting.
   */
  _scaleKill(xp, enemyLevel) {
    const gap = enemyLevel - (this.player?.level || 1);
    if (gap >= 0) return Math.round(xp * (1 + Math.min(gap, 6) * 0.09));
    return Math.round(xp * Math.max(0.08, Math.pow(0.72, -gap)));
  }

  /** Grant XP and resolve any levels it buys. `reason` is for the log. */
  award(amount, reason = '') {
    // ⚠️ STEEL: no XP levels (owner: "technique & steel"). Growth is
    // technique practice, body traits and better steel (CombatSystem).
    return;
    // eslint-disable-next-line no-unreachable
    const p = this.player;
    // ⚠️ `Number.isFinite`, not just `> 0`. `award(Infinity)` passed
    // every one of the old guards, then drove the while-loop below
    // 2,860 times in one call — measured level 1 → **2861**, with xp
    // left as NaN. Any XP source that divides by a zeroed multiplier
    // produces Infinity, and nothing downstream would have caught it.
    const amt = Number(amount);
    if (!p || !Number.isFinite(amt) || amt <= 0 || p.isDead) return 0;

    p.xp += amt;
    let gained = 0;

    // A loop, not an `if` — a single Descent payout can cross two
    // levels at low level, and levelling only once would silently
    // eat the remainder.
    // ⚠️ Bounded. Even with a finite award, a corrupted `xpToNext`
    // (0, negative, NaN) makes this loop forever and hangs the tab.
    // 200 levels is far more than any single legitimate award can buy.
    let guard = 0;
    while (p.xp >= p.xpToNext && Number.isFinite(p.xpToNext) && p.xpToNext > 0 && guard++ < 200) {
      p.xp -= p.xpToNext;
      p.level += 1;
      p.xpToNext = xpForLevel(p.level);
      gained++;
    }

    if (gained) this._levelUp(gained, reason);
    this._emit();
    return amount;
  }

  _levelUp(count, reason) {
    const p = this.player;
    this._applyLevelStats(p.level);

    // Levelling restores you completely. This is a first-hour comfort
    // and nothing more: the alternative is a player who levels mid-
    // fight, gains 12 max HP, and is still one hit from dead.
    p.hp = p.maxHp;
    p.mp = p.maxMp;
    p.stamina = p.maxStamina;

    eventBus.emit(Events.PLAYER_LEVEL_UP, {
      level: p.level,
      gained: count,
      reason,
      maxHp: p.maxHp,
      maxMp: p.maxMp,
    });
  }

  /**
   * Rebuild the level-derived stats from scratch every time.
   *
   * ⚠️ Computed from base + level, never incremented in place. Deriving
   * the whole value means a level-up applied twice is a no-op instead
   * of a doubling, and it survives being called again from init().
   *
   * ⚠️ atk and def are NOT assigned here. Player.equipWeapon() and
   * equipArmor() write those absolutely, so a second absolute writer
   * would make gear erase levels on every equip and levels erase gear
   * on every level-up — in both directions, silently, and only
   * noticeable as "my sword got worse." This publishes `levelAtk` /
   * `levelDef` and lets Player.recomputeStats() — the single writer —
   * fold them in. HANDOFF §0.9.
   *
   * The vitals ARE assigned here, and that is fine: their only other
   * writer is the Player constructor, so this file genuinely owns
   * them. Verified by grep before writing it, not assumed.
   */
  _applyLevelStats(level, { silent = false } = {}) {
    const p = this.player;
    if (!p) return;
    // ⚠️ STEEL: everyone stands at the same base. An old save's level is
    // kept as a number on the record but no longer inflates anything.
    void level;
    const steps = 0;

    p._baseMaxHp ??= p.maxHp;
    p._baseMaxMp ??= p.maxMp;
    p._baseMaxStamina ??= p.maxStamina;

    // ⚠️ `lineageHpMult` is a FACTOR published by AwakeningSystem (the
    // Hollowed's top rung trades maximum health for damage). It is
    // folded here rather than assigned there because this file is the
    // single writer of maxHp — a second writer would be refunded by
    // the next level-up, which is precisely how that trade would have
    // silently stopped being a trade.
    const hpMult = p.lineageHpMult ?? 1;
    // ⚠️ THE CRUCIBLE'S INNATE POOLS SURVIVE A RECOMPUTE. NightmareSystem
    // multiplies maxHp/maxMp once (flagging _innate*Applied); this
    // rebuild from base used to drop that, so equipping a weapon (which
    // recomputes) quietly cost a +35% Focus Pioneer 28 Focus — and Focus
    // is the pool every skill spends now.
    const innHp = p._innateHpApplied ? (p.innateHpMult || 1) : 1;
    const innMp = p._innateMpApplied ? (p.innateMpMult || 1) : 1;
    p.maxHp = Math.round((p._baseMaxHp + GROWTH.maxHp * steps) * hpMult * innHp);
    p.maxMp = Math.round((p._baseMaxMp + GROWTH.maxMp * steps) * innMp);
    p.maxStamina = Math.round(p._baseMaxStamina + GROWTH.maxStamina * steps);

    p.levelAtk = GROWTH.atk * steps;
    p.levelDef = GROWTH.def * steps;
    p.recomputeStats?.();

    if (silent) {
      p.hp = Math.min(p.hp, p.maxHp);
      p.mp = Math.min(p.mp, p.maxMp);
      p.stamina = Math.min(p.stamina, p.maxStamina);
    }
  }

  /**
   * The wand's level term. `WAND.LEVEL_POWER_STEP` has existed and
   * been documented as "added per player level" since the constants
   * file was written, and was read by nothing.
   */
  castPowerBonus(step) {
    return (Math.max(1, this.player?.level || 1) - 1) * step;
  }

  get level() { return this.player?.level || 1; }
  get xp() { return this.player?.xp || 0; }
  get xpToNext() { return this.player?.xpToNext || xpForLevel(1); }
  get fraction() { return this.xpToNext ? this.xp / this.xpToNext : 0; }

  /** Re-derive after an external factor (e.g. lineage) changed. */
  refresh() {
    if (!this.player) return;
    this._applyLevelStats(this.player.level, { silent: true });
    this._emit();
  }

  reset() {
    if (!this.player) return;
    this.player.level = 1;
    this.player.xp = 0;
    this.player.xpToNext = xpForLevel(1);
    this._applyLevelStats(1, { silent: true });
    this._emit();
  }

  _emit() {
    eventBus.emit(Events.PLAYER_XP_UPDATE, this.snapshot());
  }

  snapshot() {
    return {
      level: this.level,
      xp: this.xp,
      xpToNext: this.xpToNext,
      fraction: this.fraction,
    };
  }
}

export const progressSystem = new ProgressSystem();
