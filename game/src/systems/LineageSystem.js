// ══════════════════════════════════════════════════════════
// Lineage — what you ARE, as opposed to what you have done
//
// The FIFTH question about the player. It does not collapse into any
// of the other four, and the reason is the same one the handoff gives
// for keeping those four apart: they have different lifetimes.
//
//   AttunementSystem  what you are MADE OF        fluid, decays
//   LeaningSystem     which philosophy you ENACT  drifts
//   AscentSystem      how far down you have BEEN  permanent, gated
//   ProgressSystem    how much you have DONE      permanent, ungated
//   LineageSystem     what you ARE                innate, chosen ONCE
//
// ⚠️ This is the only one that never changes after it is set. That is
// deliberate and it is the borrowed structure's whole load-bearing
// idea — a lineage you could respec into is just a loadout, and the
// interesting thing about it is precisely that it closes doors.
//
// ── ⚠️ THE RITE, AND WHY IT IS NOT A CREATION MENU ────────
// Classes and Paths were removed from this project because they asked
// the player to declare an identity at a menu before doing anything
// (§2). A lineage is innate, so it cannot be emergent the way the
// Leaning is — but it does NOT have to be declared cold.
//
// You start Unsounded. `suggest()` reads what you have actually been
// doing — your attunement, your Leaning — and offers a reading. The
// Rite shows you that reading first, then lets you confirm it or
// refuse it and take another. The declaration happens in the world,
// after some play, with the game having already told you what it
// thinks you are. That is the half of the old failure that mattered.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';
import { LINEAGES, LINEAGE_IDS, UNSOUNDED, lineageById, LINEAGE_GRANT_KINDS } from '../data/lineages.js';

class LineageSystem {
  constructor() {
    this._id = 'unsounded';
    this._grants = {};
    this._attunement = null;
    this._leaning = null;
  }

  /**
   * ⚠️ Deferred init with INJECTED dependencies, not imports.
   * AttunementSystem must not be imported here for the same reason it
   * must not import LeaningSystem — this file is read from the damage
   * path, and a cycle through the three of them is exactly the shape
   * that has bitten this project before.
   */
  init({ attunement, leaning } = {}) {
    this._attunement = attunement || null;
    this._leaning = leaning || null;
    this._recomputeGrants();
    this._emit();
  }

  get id() { return this._id; }
  get lineage() { return lineageById(this._id); }
  get isSounded() { return this._id !== 'unsounded'; }
  get verb() { return this.lineage.verb; }
  get currency() { return this.lineage.currency; }
  /** True for Choirbound: one ladder shared by every weapon. */
  get sharesLadder() { return !!this.lineage.shared; }

  /**
   * What you appear to be, from what you have already done.
   *
   * Returns { id, why } — the `why` is shown in the Rite, because a
   * reading the player cannot interrogate is just a random assignment
   * with extra ceremony.
   */
  suggest() {
    const shares = this._attunement?.elementShares?.() || [];
    // ⚠️ `{ id, value, share }` — NOT `element`. Destructuring
    // `{ element }` here compiles, runs, and silently contributes zero
    // forever (§5). Caught once already in this project.
    const byEl = {};
    for (const s of shares) byEl[s.id] = s.share || 0;

    const side = this._leaning?.side || null;

    let best = null;
    for (const id of LINEAGE_IDS) {
      const L = LINEAGES[id];
      let score = 0;
      for (const el of L.affinity) score += (byEl[el] || 0);
      // A lineage that belongs to a side gets a push from a player who
      // has actually been enacting that side. Sideless lineages are
      // neutral rather than penalised.
      if (L.leaning && side && L.leaning === side) score += 0.22;
      if (!best || score > best.score) best = { id, score, L };
    }

    if (!best || best.score <= 0.001) {
      return {
        id: 'reliquar',
        why: 'You have not done enough for the Rite to read you clearly. It offers you the ordinary answer.',
      };
    }

    const top = best.L.affinity
      .filter(el => (byEl[el] || 0) > 0.02)
      .sort((a, b) => (byEl[b] || 0) - (byEl[a] || 0));

    const elementNote = top.length
      ? `You come back smelling of ${top.slice(0, 2).join(' and ')}.`
      : 'Nothing in you leans to an element yet.';
    const sideNote = best.L.leaning && side === best.L.leaning
      ? ` And you have been enacting ${side === 'hell' ? 'the Appetite' : 'Refinement'}.`
      : '';

    return { id: best.id, why: elementNote + sideNote };
  }

  /**
   * Sit the Rite. Permanent.
   *
   * Returns false rather than throwing if it has already been sat —
   * a UI double-click must not be able to re-roll an irreversible
   * choice.
   */
  sound(id) {
    if (this.isSounded) {
      eventBus.emit(Events.UI_NOTIFY, 'You have already been sounded. That does not happen twice.');
      return false;
    }
    if (!LINEAGES[id]) return false;
    this._id = id;
    this._recomputeGrants();
    eventBus.emit(Events.LINEAGE_SOUNDED, { id, lineage: this.lineage });
    eventBus.emit(Events.UI_NOTIFY, `${this.lineage.name}. ${this.lineage.creed}`);
    this._emit();
    return true;
  }

  /** Dev/testing only — the Rite itself is one-way. */
  reset() {
    this._id = 'unsounded';
    this._recomputeGrants();
    this._emit();
  }

  // ── GRANTS ──────────────────────────────────────────────

  /**
   * Lineage grants come from the AWAKENING ladder, so they are pushed
   * in by AwakeningSystem rather than derived here.
   *
   * ⚠️ One writer. AwakeningSystem owns the stage, this owns the
   * composition — the alternative (both computing grants from the same
   * stage number) is two writers to one field, which is the recurring
   * architecture bug in this project.
   */
  setStageGrants(grantList) {
    this._stageGrants = grantList || [];
    this._recomputeGrants();
    this._emit();
  }

  _recomputeGrants() {
    const g = {};
    for (const grant of (this._stageGrants || [])) {
      if (!grant) continue;
      const kind = LINEAGE_GRANT_KINDS[grant.key];
      if (kind === 'mult') g[grant.key] = (g[grant.key] ?? 1) * grant.value;
      else g[grant.key] = (g[grant.key] ?? 0) + grant.value;
    }
    this._grants = g;
  }

  /**
   * Read a grant. ⚠️ Always pass the identity for the key's kind —
   * 1 for multipliers, 0 for sums. An un-sounded player must come back
   * as "no change", never as zero damage.
   */
  grant(key, fallback = 0) {
    return this._grants[key] ?? fallback;
  }

  _emit() {
    eventBus.emit(Events.LINEAGE_UPDATE, this.snapshot());
  }

  snapshot() {
    const L = this.lineage;
    return {
      id: this._id,
      name: L.name,
      epithet: L.epithet,
      creed: L.creed,
      verb: L.verb,
      currency: L.currency,
      currencyLabel: L.currencyLabel,
      sounded: this.isSounded,
      grants: { ...this._grants },
    };
  }
}

export const lineageSystem = new LineageSystem();
