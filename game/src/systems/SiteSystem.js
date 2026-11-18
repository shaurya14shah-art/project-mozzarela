// ══════════════════════════════════════════════════════════
// SITES — the world answering back
//
// ── WHY THIS EXISTS ───────────────────────────────────────
// Owner: "the game feels very hollow, it doesn't have any depth."
//
// The wilderness generates SEVEN kinds of structure — dungeons,
// graveyards, ruins, monoliths, camps, shrines and supply caches —
// and, measured before this file existed, the complete list of things
// a player could press E on in the entire game was:
//
//   an NPC · a Descent Gate
//
// Every shrine was scenery. Every supply cache was a crate you could
// not open. You could walk for ten minutes toward a monolith on the
// horizon and, on arriving, do nothing at all. That is hollowness in
// the most literal available sense: a world full of promises it does
// not keep.
//
// ── WHAT A SITE OWES THE PLAYER ───────────────────────────
// Each kind does something *different in kind*, not a different
// number of the same thing:
//
//   shrine     you SPEND to gain — an offering buys a lasting boon
//   cache      you FIND — free materials for having come this far
//   graveyard  you RISK — disturb it and something answers
//   ruin       you SEARCH — and the ruin decides what was left
//   monolith   you LEARN — depth, and a fragment of what happened
//   camp       you REST — the only full heal outside the Sanctuary
//   dungeon    you DELVE — a fight with a door at the end of it
//
// ⚠️ SITES ARE ONE-SHOT AND THAT IS PERSISTED. A cache that refills on
// every chunk reload is not a discovery, it is a vending machine — and
// with chunk streaming you can farm one by walking away and back. The
// used set is saved, so a looted world stays looted.
//
// ⚠️ IDs ARE DERIVED FROM WORLD POSITION, never from a counter. The
// same shrine has to be the same shrine across a chunk unload, a
// reload, and a Descent round trip. A counter would re-number every
// site on every stream-in and the used set would stop matching
// anything.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';

/** What each kind is called, and what the prompt says. */
export const SITE_KINDS = {
  shrine: {
    name: 'A leaning shrine',
    verb: 'Make an offering',
    blurb: 'Something old is still listening here.',
  },
  cache: {
    name: 'A supply cache',
    verb: 'Force it open',
    blurb: 'Someone meant to come back for this.',
  },
  graveyard: {
    name: 'Unquiet ground',
    verb: 'Disturb the graves',
    blurb: 'The markers are recent. That is the worrying part.',
  },
  ruin: {
    name: 'A ruin',
    verb: 'Search the rubble',
    blurb: 'Something stood here long enough to fall down.',
  },
  monolith: {
    name: 'A standing stone',
    verb: 'Read the stone',
    blurb: 'The cuts are too regular to be weather.',
  },
  // ── The world expansion (world/WorldFeatures.js) ──
  cave: {
    name: 'A cave mouth',
    verb: 'Go in',
    blurb: 'Cold air comes out of it. Further in, the dark is total.',
  },
  warcamp: {
    name: 'A camp\'s stores',
    verb: 'Search the stores',
    blurb: 'Whoever keeps this camp is not far away.',
  },
  camp: {
    name: 'An abandoned camp',
    verb: 'Rest here',
    blurb: 'The ashes are cold. The bedding is not rotted.',
  },
  dungeon: {
    name: 'A sunken door',
    verb: 'Go down',
    blurb: 'Steps, and then dark.',
  },
};

class SiteSystem {
  constructor() {
    /** id → { id, kind, x, y, z } for every site currently streamed in. */
    this.sites = new Map();
    /** ⚠️ Persisted. Ids of sites already used, forever. */
    this.used = new Set();
  }

  /**
   * A world position → a stable id.
   *
   * ⚠️ Rounded to whole units. The same structure is rebuilt from the
   * same hash on every stream-in so its coordinates are already
   * deterministic — but float formatting is not, and `x.toFixed()` of
   * a value that arrived via two different code paths can differ in
   * the last bit. Rounding makes the id robust to that.
   */
  idFor(kind, x, z) {
    return `${kind}@${Math.round(x)},${Math.round(z)}`;
  }

  /**
   * Called by ChunkManager as it builds each structure.
   * Idempotent: re-streaming a chunk re-registers the same id.
   */
  register(kind, x, y, z) {
    if (!SITE_KINDS[kind]) return null;
    const id = this.idFor(kind, x, z);
    const site = { id, kind, x, y, z };
    this.sites.set(id, site);
    return site;
  }

  /** Drop sites for a chunk that unloaded. `used` is NOT touched. */
  forget(predicate) {
    for (const [id, s] of [...this.sites]) {
      if (predicate(s)) this.sites.delete(id);
    }
  }

  isUsed(id) { return this.used.has(id); }

  markUsed(id) {
    this.used.add(id);
    eventBus.emit(Events.SITE_USED, { id });
  }

  /**
   * The nearest unused site within `range`, or null.
   *
   * ⚠️ Used sites are skipped rather than returned-and-refused, so a
   * spent shrine stops offering a prompt entirely instead of teasing
   * one that always fails.
   */
  nearest(pos, range = 4.5) {
    let best = null, bestD = range;
    for (const s of this.sites.values()) {
      if (this.used.has(s.id)) continue;
      const d = Math.hypot(s.x - pos.x, s.z - pos.z);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  /** Everything currently streamed in, for the map/journal. */
  all() { return [...this.sites.values()]; }

  snapshot() { return { used: [...this.used] }; }
  restoreUsed(list) { this.used = new Set(list || []); }
  reset() { this.sites.clear(); this.used.clear(); }
}

export const siteSystem = new SiteSystem();
