// ══════════════════════════════════════════════════════════
// Composition — combat as a puzzle, not a health bar
//
// Everything alive in the Fracture is a held composition: a set of
// element weights that wants to stay balanced. Killing something is
// not draining a number. It is *breaking the balance*.
//
//   Hit fire with fire     → it drinks it. Almost no effect.
//   Hit fire with ice      → the composition strains. Instability rises.
//   Strain it past its tolerance → it comes apart, violently, and
//                                  showers reagents of what it was made of.
//
// So the interesting question in a fight stops being "how much damage
// do I have" and becomes "what is this thing made of, and what do I
// have in the wand that argues with it".
//
// Two consequences worth naming:
//   · A perfect loadout kills far faster than a big one. Breadth beats
//     raw numbers, which is why the wand has slots rather than a level.
//   · Detonations chain. A creature coming apart destabilises whatever
//     is standing near it, so crowds are solved by placing the first
//     break well.
// ══════════════════════════════════════════════════════════

import { ELEMENTS } from '../data/constants.js';
import { areOpposed, findReaction } from '../data/essences.js';
import { eventBus, Events } from '../core/EventBus.js';

export const COMPOSITION = {
  // How much a strain event moves the instability meter.
  OPPOSED_STRAIN: 0.16,
  NEUTRAL_STRAIN: 0.05,
  MATCHED_STRAIN: 0.0,

  // Damage scaling by relationship. Matching an element is close to
  // useless — this is what forces loadout variety.
  MATCHED_DAMAGE: 0.25,
  NEUTRAL_DAMAGE: 1.0,
  OPPOSED_DAMAGE: 1.75,

  // Strain bleeds off if you stop pressing, so you must commit.
  STRAIN_DECAY: 0.09,

  // Detonation
  DETONATE_AT: 1.0,
  DETONATE_RADIUS: 7,
  DETONATE_CHAIN_STRAIN: 0.35,
  DETONATE_DAMAGE_MULT: 2.5,
};

// ── ARCHETYPE COMPOSITIONS ────────────────────────────────
// What each creature type is *made of*. Tolerance is how much strain
// it holds before breaking — the real "health" of the new system.
export const BODIES = {
  slime:         { elements: { [ELEMENTS.POISON]: 3, [ELEMENTS.WATER]: 1 }, tolerance: 0.8 },
  goblin:        { elements: { [ELEMENTS.NEUTRAL]: 2, [ELEMENTS.EARTH]: 1 }, tolerance: 0.9 },
  skeleton:      { elements: { [ELEMENTS.SHADOW]: 2, [ELEMENTS.NEUTRAL]: 2 }, tolerance: 1.0 },
  golem:         { elements: { [ELEMENTS.EARTH]: 5 }, tolerance: 1.6 },
  wraith:        { elements: { [ELEMENTS.SHADOW]: 3, [ELEMENTS.VOID]: 2 }, tolerance: 1.1 },
  spider:        { elements: { [ELEMENTS.POISON]: 3, [ELEMENTS.EARTH]: 1 }, tolerance: 0.9 },
  vampire:       { elements: { [ELEMENTS.SHADOW]: 4, [ELEMENTS.WATER]: 1 }, tolerance: 1.3 },
  dragon:        { elements: { [ELEMENTS.FIRE]: 5, [ELEMENTS.EARTH]: 2 }, tolerance: 2.2 },
  ice_elemental: { elements: { [ELEMENTS.ICE]: 5 }, tolerance: 1.4 },
  sandworm:      { elements: { [ELEMENTS.EARTH]: 4, [ELEMENTS.POISON]: 1 }, tolerance: 1.5 },
  shade:         { elements: { [ELEMENTS.SHADOW]: 4, [ELEMENTS.VOID]: 1 }, tolerance: 1.0 },
};

const DEFAULT_BODY = { elements: { [ELEMENTS.NEUTRAL]: 2 }, tolerance: 1.0 };

/** Build a composition for a creature type. */
export function makeBody(typeId) {
  const t = BODIES[typeId] || DEFAULT_BODY;
  const total = Object.values(t.elements).reduce((a, b) => a + b, 0) || 1;
  return {
    elements: { ...t.elements },
    shares: Object.fromEntries(
      Object.entries(t.elements).map(([k, v]) => [k, v / total])
    ),
    dominant: Object.entries(t.elements).sort((a, b) => b[1] - a[1])[0][0],
    tolerance: t.tolerance,
    strain: 0,
    lastElement: null,
    lastHitAt: 0,
  };
}

/**
 * How an incoming element relates to a body.
 * Returns { relation, damageMult, strain }.
 */
export function relate(body, element) {
  if (!body || !element) {
    return { relation: 'neutral', damageMult: COMPOSITION.NEUTRAL_DAMAGE, strain: COMPOSITION.NEUTRAL_STRAIN };
  }

  const own = body.shares[element] || 0;
  if (own > 0.25) {
    // It is partly made of this. It drinks it.
    return {
      relation: 'matched',
      damageMult: COMPOSITION.MATCHED_DAMAGE + (1 - own) * 0.3,
      strain: COMPOSITION.MATCHED_STRAIN,
    };
  }

  // Opposed to anything it is substantially made of?
  let opposedShare = 0;
  for (const [el, share] of Object.entries(body.shares)) {
    if (areOpposed(el, element)) opposedShare = Math.max(opposedShare, share);
  }

  if (opposedShare > 0.2) {
    return {
      relation: 'opposed',
      damageMult: COMPOSITION.OPPOSED_DAMAGE * (0.7 + opposedShare * 0.6),
      strain: COMPOSITION.OPPOSED_STRAIN * (0.6 + opposedShare),
    };
  }

  return { relation: 'neutral', damageMult: COMPOSITION.NEUTRAL_DAMAGE, strain: COMPOSITION.NEUTRAL_STRAIN };
}

class CompositionSystem {
  constructor() {
    this._clock = 0;
  }

  update(dt, enemies = []) {
    this._clock += dt;
    for (const e of enemies) {
      if (!e.body || e.isDead) continue;
      if (e.body.strain > 0) {
        e.body.strain = Math.max(0, e.body.strain - COMPOSITION.STRAIN_DECAY * dt);
      }
    }
  }

  /**
   * Resolve a hit against a composition.
   * Returns { damage, relation, strained, detonated, reaction }.
   */
  resolveHit(enemy, { element, damage, spellId }) {
    if (!enemy.body) enemy.body = makeBody(enemy.typeId);
    const body = enemy.body;

    const rel = relate(body, element);
    let finalDamage = damage * rel.damageMult;
    let reaction = null;

    // Residue reaction — a *different* element landing soon after the
    // last one. This is the same rule the wand already uses.
    if (body.lastElement && body.lastElement !== element &&
        this._clock - body.lastHitAt < 4.0) {
      reaction = findReaction(body.lastElement, element);
      if (reaction) {
        finalDamage *= reaction.multiplier;
        body.strain += 0.2;
        eventBus.emit(Events.REACTION_TRIGGER, {
          reaction, target: enemy, damage: finalDamage,
          position: enemy.position?.clone?.() || null,
        });
      }
    }

    body.lastElement = element;
    body.lastHitAt = this._clock;

    // Strain the composition
    const before = body.strain;
    body.strain = Math.min(body.tolerance * 1.05, body.strain + rel.strain);

    const strainedNow = body.strain > before + 0.001;
    if (strainedNow) {
      eventBus.emit(Events.ENEMY_DESTABILISE, {
        enemy, strain: body.strain, tolerance: body.tolerance,
        ratio: body.strain / body.tolerance, relation: rel.relation,
      });
    }

    const detonated = body.strain >= body.tolerance;
    return {
      damage: Math.round(finalDamage),
      relation: rel.relation,
      strained: strainedNow,
      ratio: body.strain / body.tolerance,
      detonated,
      reaction,
    };
  }

  /**
   * A composition coming apart. Returns the chain targets so the
   * caller can apply the shockwave.
   */
  detonate(enemy, nearby = []) {
    const body = enemy.body;
    if (!body) return { chained: [], element: ELEMENTS.NEUTRAL };

    const element = body.dominant;
    const chained = [];

    for (const other of nearby) {
      if (other === enemy || other.isDead) continue;
      if (!other.body) other.body = makeBody(other.typeId);
      const d = other.position?.distanceTo?.(enemy.position);
      if (d === undefined || d > COMPOSITION.DETONATE_RADIUS) continue;

      const falloff = 1 - d / COMPOSITION.DETONATE_RADIUS;
      other.body.strain = Math.min(
        other.body.tolerance * 1.05,
        other.body.strain + COMPOSITION.DETONATE_CHAIN_STRAIN * falloff
      );
      chained.push({ enemy: other, falloff });
    }

    eventBus.emit(Events.ENEMY_DETONATE, {
      enemy, element,
      position: enemy.position?.clone?.() || null,
      chained: chained.length,
    });

    return { chained, element };
  }

  /**
   * A readable summary of a creature for the targeting UI — this is
   * the "read the world" half of the alchemist fantasy.
   */
  read(enemy) {
    if (!enemy?.body) return null;
    const b = enemy.body;
    return {
      dominant: b.dominant,
      shares: Object.entries(b.shares)
        .map(([id, share]) => ({ id, share }))
        .sort((a, b2) => b2.share - a.share),
      strain: b.strain,
      tolerance: b.tolerance,
      ratio: Math.min(1, b.strain / b.tolerance),
    };
  }
}

export const composition = new CompositionSystem();
