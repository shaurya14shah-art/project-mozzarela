// ══════════════════════════════════════════════════════════
// Awakening — waking what is asleep in a weapon
//
// The upgrade half of the lineage brief. One ladder shape, four rungs,
// and every lineage climbs it with a different verb and a different
// bill (see data/lineages.js for why that is the interesting part
// rather than the tiers themselves).
//
//   0 Dormant    the weapon is a weapon
//   1 Sounded    its true name is known            (a small, real grant)
//   2 Released   it does what it is actually for   (the big step)
//   3 Ascended   it stops needing you to ask
//
// ── ⚠️ THE NAME IS THE GATE, NOT A LABEL ─────────────────
// Rung 1 costs the most relative to what it gives, on purpose. Every
// weapon already HAS a true name (data/lineages.js trueNameFor — it is
// a stable hash, not a roll, so the name was always there and you did
// not know it). Learning it is the moment the system is about. If the
// first rung were free the whole structure would just be "+damage
// three times".
//
// ── ⚠️ GRANTS ARE FACTORS. THIS FILE ASSIGNS NOTHING. ─────
// `player.stats.atk` and `.def` have exactly ONE writer,
// Player.recomputeStats(), and this file is not it. Awakening
// publishes `player.awakenAtk` and a damageMult read at the hit site.
// Assigning atk here would make gear erase awakening and awakening
// erase gear, in both directions — the exact bug already fixed once
// this project for level bonuses (HANDOFF §0.9).
//
// ── ⚠️ PER-WEAPON, EXCEPT WHEN IT IS NOT ─────────────────
// Progress is keyed by weapon id for five lineages. Choirbound
// declares `shared: true` and keys to one record for everything they
// own. That is the mechanic — a Choirbound is never holding the "wrong"
// weapon — not an optimisation, so it lives in the key function where
// it cannot be accidentally refactored away.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';
import { lineageSystem } from './LineageSystem.js';
import { AWAKENING_STAGES, trueNameFor } from '../data/lineages.js';

/**
 * What each rung costs, per currency.
 *
 * Index is the rung being bought (1..3); index 0 is unused and present
 * so the array index matches the stage number rather than being off by
 * one — an off-by-one in a cost table is invisible until someone is
 * charged for the wrong rung.
 */
const COSTS = {
  //          -   Sounded  Released  Ascended
  memory:   [ 0,  1,       2,        4 ],
  echo:     [ 0,  1,       2,        4 ],
  fragment: [ 0,  8,       20,       45 ],
  bond:     [ 0,  12,      40,       110 ],   // kills with THIS weapon
  vitality: [ 0,  10,      22,       40 ],    // permanent max-HP points
};

class AwakeningSystem {
  constructor() {
    this.player = null;
    this._inventory = null;
    this._spoils = null;
    /** key → { stage, bond, nameKnown } */
    this._records = new Map();
    this._bound = false;
  }

  /** ⚠️ Deferred init, injected dependencies — same as every other. */
  init({ player, inventory, spoils, progress } = {}) {
    this.player = player;
    this._inventory = inventory || null;
    this._spoils = spoils || null;
    this._progress = progress || null;
    if (!this._bound) { this._bind(); this._bound = true; }
    this._apply();
  }

  _bind() {
    // Bond: only Reliquars accumulate it, but it is CHEAP to track for
    // everyone and tracking it always means a player who sits the Rite
    // late is not retroactively punished for the kills they already
    // made with the weapon in their hand.
    eventBus.on(Events.COMBAT_KILL, () => {
      const rec = this._record();
      if (!rec) return;
      rec.bond += 1;
      // Only repaint when it could matter, not on every kill.
      if (lineageSystem.currency === 'bond') this._emit();
    });

    eventBus.on(Events.PLAYER_EQUIP_WEAPON, () => this._apply());
    eventBus.on(Events.LINEAGE_SOUNDED, () => this._apply());
  }

  // ── IDENTITY ────────────────────────────────────────────

  /**
   * The record key for the weapon in hand.
   *
   * ⚠️ Choirbound share ONE key across every weapon. See the file
   * header — this is the mechanic.
   */
  _key() {
    if (lineageSystem.sharesLadder) return 'choir:shared';
    const w = this.player?.equippedWeapon;
    if (!w) return 'bare:hands';
    return `w:${w.id || w.name || 'unknown'}`;
  }

  _record(create = true) {
    const k = this._key();
    if (!k) return null;
    if (!this._records.has(k)) {
      if (!create) return null;
      this._records.set(k, { stage: 0, bond: 0, nameKnown: false });
    }
    return this._records.get(k);
  }

  /** The weapon in hand, or a stand-in for bare hands. */
  _weapon() {
    return this.player?.equippedWeapon || { id: 'bare_hands', name: 'Bare Hands', weaponType: 'sword' };
  }

  /** The true name sleeping in the weapon — known or not. */
  trueName() {
    const w = this._weapon();
    return trueNameFor(w.id || w.name, w.weaponType);
  }

  // ── STATE ───────────────────────────────────────────────

  get stage() { return this._record()?.stage || 0; }
  get bond() { return this._record()?.bond || 0; }
  get nameKnown() { return !!this._record()?.nameKnown; }
  get atTop() { return this.stage >= AWAKENING_STAGES - 1; }

  stageInfo(stage = this.stage) {
    const L = lineageSystem.lineage;
    return L.stages?.[stage] || L.stages?.[0] || { name: '—', line: '' };
  }

  /** What the next rung costs, or null at the top / un-sounded. */
  nextCost() {
    if (!lineageSystem.isSounded || this.atTop) return null;
    const cur = lineageSystem.currency;
    const table = COSTS[cur];
    if (!table) return null;
    return { currency: cur, amount: table[this.stage + 1] ?? 0 };
  }

  /** How much of the lineage's currency the player can actually pay. */
  available(currency = lineageSystem.currency) {
    switch (currency) {
      case 'memory':   return this._spoils ? this._spoils.memories.size : 0;
      case 'echo':     return this._spoils ? this._spoils.echoes.size : 0;
      case 'bond':     return this.bond;
      case 'vitality': return Math.max(0, (this.player?.maxHp || 0) - 40);
      case 'fragment': return this._countFragments();
      default:         return 0;
    }
  }

  /**
   * ⚠️ `MATERIALS` is the registry but `DROPS` carries INLINE
   * definitions that exist nowhere else — `mithril_core_fragment` is
   * the documented example (§5). So fragments are counted by scanning
   * what is actually in the bag for an id ending in `_fragment`,
   * rather than by looking anything up in a table that may not have it.
   */
  _countFragments() {
    if (!this._inventory?.getSlotData) return 0;
    let n = 0;
    for (const slot of this._inventory.getSlotData()) {
      if (!slot?.item?.id) continue;
      // ⚠️ `.count`, NOT `.quantity`. InventorySystem's slots are
      // `{ item, count }`; `slot.quantity` is undefined, so
      // `quantity || 1` counted every STACK as a single fragment. A
      // Latticer holding 500 fragments read as holding 1 and could
      // never pay the 8 the first rung costs — the whole lineage was
      // unreachable, and it failed as a polite "8 more needed" rather
      // than as an error.
      if (/fragment/i.test(slot.item.id)) n += slot.count || 1;
    }
    return n;
  }

  /** Everything blocking the next rung, for the UI. Never throws. */
  requirements() {
    if (!lineageSystem.isSounded) {
      return { ok: false, reason: 'unsounded', message: 'Sit the Rite of Sounding first.' };
    }
    if (this.atTop) {
      return { ok: false, reason: 'top', message: 'There is nothing left in it to wake.' };
    }
    const cost = this.nextCost();
    const have = this.available(cost.currency);
    return {
      ok: have >= cost.amount,
      reason: have >= cost.amount ? null : 'cost',
      cost, have,
      message: have >= cost.amount
        ? `Ready. ${lineageSystem.lineage.verb}.`
        : (() => {
            const short = cost.amount - have;
            const L = lineageSystem.lineage;
            return `${short} more ${short === 1 ? (L.currencyOne || L.currencyLabel) : L.currencyLabel} needed.`;
          })(),
    };
  }

  // ── THE RITE ────────────────────────────────────────────

  /**
   * Climb one rung, paying the lineage's own bill.
   *
   * Returns { ok, message } rather than throwing — this is driven
   * straight off a button and a thrown error there is a dead panel.
   */
  awaken() {
    const req = this.requirements();
    if (!req.ok) {
      eventBus.emit(Events.UI_NOTIFY, req.message);
      return { ok: false, message: req.message };
    }

    if (!this._pay(req.cost)) {
      const m = 'The price would not come out of you.';
      eventBus.emit(Events.UI_NOTIFY, m);
      return { ok: false, message: m };
    }

    const rec = this._record();
    rec.stage += 1;
    if (rec.stage >= 1) rec.nameKnown = true;

    const info = this.stageInfo(rec.stage);
    const weapon = this._weapon();
    this._apply();

    eventBus.emit(Events.WEAPON_AWAKENED, {
      stage: rec.stage,
      stageName: info.name,
      line: info.line,
      trueName: this.trueName(),
      weapon,
      lineage: lineageSystem.id,
    });

    // Rung 1 is the reveal, and it should read as one.
    const msg = rec.stage === 1
      ? `It is called ${this.trueName()}.`
      : `${info.name}. ${info.line}`;
    eventBus.emit(Events.UI_NOTIFY, msg);
    return { ok: true, message: msg };
  }

  /**
   * Take the price.
   *
   * ⚠️ `bond` is SPENT, not merely met — otherwise one weapon's kills
   * pay for all three rungs at once the moment the last threshold is
   * crossed, and the top rung costs nothing.
   */
  _pay({ currency, amount }) {
    switch (currency) {
      case 'bond': {
        const rec = this._record();
        if (rec.bond < amount) return false;
        rec.bond -= amount;
        return true;
      }
      case 'vitality': {
        const p = this.player;
        if (!p || p.maxHp - amount < 40) return false;
        // ⚠️ Paid against the BASE, not the live max. ProgressSystem
        // derives maxHp from `_baseMaxHp + growth`, and recomputes it
        // from scratch on every level — so a cost applied to the live
        // value would be silently refunded on the next level-up.
        p._baseMaxHp = (p._baseMaxHp ?? p.maxHp) - amount;
        p.maxHp -= amount;
        p.hp = Math.min(p.hp, p.maxHp);
        return true;
      }
      case 'memory':
      case 'echo': {
        const store = currency === 'memory' ? this._spoils?.memories : this._spoils?.echoes;
        if (!store || store.size < amount) return false;
        // Spend the oldest first — the ones you have had longest are
        // the ones you have already gotten the use out of.
        let n = amount;
        for (const k of [...store.keys()]) {
          if (n <= 0) break;
          store.delete(k);
          n--;
        }
        return true;
      }
      case 'fragment': {
        if (!this._inventory) return false;
        let n = amount;
        for (const slot of this._inventory.getSlotData()) {
          if (n <= 0) break;
          if (!slot?.item?.id || !/fragment/i.test(slot.item.id)) continue;
          const take = Math.min(n, slot.count || 1);
          this._inventory.consumeItems(slot.item.id, take);
          n -= take;
        }
        return n <= 0;
      }
      default: return false;
    }
  }

  // ── APPLYING THE LADDER ─────────────────────────────────

  /**
   * Push the accumulated stage grants into LineageSystem and refresh
   * the player's derived stats.
   *
   * ⚠️ CUMULATIVE — every rung up to and including the current one,
   * recomputed from scratch. Never incremented in place, so calling
   * this twice is the same as calling it once and a re-equip cannot
   * double a bonus.
   */
  _apply() {
    const L = lineageSystem.lineage;
    const stage = this.stage;
    const grants = [];
    for (let i = 1; i <= stage; i++) {
      const s = L.stages?.[i];
      if (s?.grant) grants.push(s.grant);
      if (s?.cost) grants.push(s.cost);
    }
    lineageSystem.setStageGrants(grants);

    // Publish the flat term as a FACTOR for Player.recomputeStats to
    // fold in. See the file header.
    if (this.player) {
      this.player.awakenAtk = lineageSystem.grant('atkBonus', 0);
      // ⚠️ maxHp has exactly ONE writer — ProgressSystem, which DERIVES
      // it from base + level and recomputes from scratch on every
      // level-up. Assigning maxHp here would be silently refunded the
      // next time the player levelled. Publish the factor and let the
      // owner fold it in (HANDOFF §0.9), same as awakenAtk above.
      this.player.lineageHpMult = lineageSystem.grant('maxHpMult', 1);
      this.player.recomputeStats?.();
      this._progress?.refresh?.();
    }
    this._emit();
  }

  _emit() {
    eventBus.emit(Events.WEAPON_AWAKEN_UPDATE, this.snapshot());
  }

  snapshot() {
    const w = this._weapon();
    const info = this.stageInfo();
    return {
      weaponName: w.name || 'Bare Hands',
      weaponType: w.weaponType || 'sword',
      trueName: this.nameKnown ? this.trueName() : null,
      stage: this.stage,
      stageName: info.name,
      stageLine: info.line,
      maxStage: AWAKENING_STAGES - 1,
      bond: this.bond,
      requirements: this.requirements(),
      shared: lineageSystem.sharesLadder,
    };
  }

  /** Dev/testing. */
  reset() {
    this._records.clear();
    this._apply();
  }
}

export const awakeningSystem = new AwakeningSystem();
