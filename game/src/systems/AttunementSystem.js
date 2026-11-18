// ══════════════════════════════════════════════════════════
// Attunement — the power system
//
// There are no levels and no experience bar. You do not "get
// stronger"; you become *made of something*.
//
// Every spell you cast leaves residue in you. That residue
// accumulates into an essence profile — element weights, a form
// lean, and an instability — read with exactly the same rules as a
// brew in the cauldron. You are, mechanically, a potion that walks.
//
// Consequences, all of which fall out of that one idea:
//   · What you cast most, you resist. Its opposite cuts deeper.
//   · Attuning to opposed elements makes YOU volatile — more power,
//     less control, and your own casts can surge.
//   · Form lean shapes how you fight: Lance sharpens, Ward thickens,
//     Mire lingers, Hunt reaches, Bloom widens.
//   · Depth (total residue) opens wand slots. Breadth opens nothing.
//     Specialists and generalists genuinely differ.
//
// Residue decays. Stop casting fire and you stop being fire. The
// build is never locked and never grinds — it is simply a record of
// how you have been playing for the last while.
// ══════════════════════════════════════════════════════════

import { ELEMENTS } from '../data/constants.js';
import { FORMS, FORM_LIST, areOpposed } from '../data/essences.js';
import { CASTABLE_ELEMENTS } from '../data/spellcraft.js';
import { eventBus, Events } from '../core/EventBus.js';
import { ascentSystem } from './AscentSystem.js';

export const ATTUNE = {
  // Residue gained per cast, scaled by the spell's potency.
  GAIN_BASE: 1.0,
  GAIN_PER_POTENCY: 0.35,

  // Residue bleeds off, so a build follows recent play rather than
  // total lifetime casts. Halves roughly every ~2 minutes of play.
  DECAY_PER_SEC: 0.006,

  // Thresholds on a single element's share of your profile.
  RESIST_AT: 0.25,      // share at which resistance starts
  MAX_RESIST: 0.55,     // cap on damage reduction from attunement
  VULN_MULT: 0.8,       // how hard the opposite bites

  // Depth: total residue, which is what actually opens slots.
  DEPTH_FOR_SLOT: [0, 40, 110, 240, 430],   // → 3,4,5,6,7 slots

  // Instability in the *body* works like instability in a flask.
  SELF_SURGE_FLOOR: 0.35,
};

// ── ELEMENT MASTERY ───────────────────────────────────────
// Doctrines are about HOW you cast (form). Mastery is about WHAT you
// are made of (element) — the other half of "what you cast, you
// become" that used to only ever show up as a damage multiplier. At
// deep enough share, an element stops being a resistance number and
// starts being a passive that's actually felt: faster hands, a
// colder step, a body that closes wounds. One per element, always on
// past the threshold, no chosen — same rule as everything else here.
export const MASTERY_AT = 0.5; // share of your profile a single element needs

export const MASTERY = {
  fire:      { name: 'Cinderborn',       desc: '+15% damage on everything you cast or swing.' },
  water:     { name: 'Undertow',         desc: '+60% mana regeneration.' },
  earth:     { name: 'Stoneskin',        desc: 'An extra -15% damage taken, on top of resistance.' },
  wind:      { name: 'Fleetfoot',        desc: '+15% movement speed.' },
  lightning: { name: 'Live Wire',        desc: '-20% attack and wand cooldowns.' },
  shadow:    { name: 'Umbral Step',      desc: 'Dodging costs 40% less stamina.' },
  light:     { name: 'Radiant Pulse',    desc: 'Slowly regenerate health, even out of combat.' },
  void:      { name: 'Hungering',        desc: 'Every hit you land heals you for 12% of the damage dealt.' },
  ice:       { name: 'Frostbite',        desc: 'Your hits chill — enemies you strike slow down briefly.' },
  poison:    { name: 'Contagion',        desc: '+25% damage from anything that lingers.' },
  arcane:    { name: 'Efficient Casting', desc: '-20% mana cost on every cast.' },
  neutral:   { name: 'Even Keel',        desc: '+8% resistance to everything, nothing in particular.' },
};

// ── FORM DOCTRINES ────────────────────────────────────────
// What leaning into a form does to the caster. Each is a single,
// legible promise — no stat soup.
export const DOCTRINES = {
  [FORMS.LANCE]: {
    name: 'The Point', blurb: 'You have been casting in straight lines. You have become one.',
    at: 0.3, effect: { critChance: 0.25, pierce: true },
    describe: '+25% critical chance · your casts pierce',
  },
  [FORMS.BLOOM]: {
    name: 'The Blast', blurb: 'Everything you do arrives all at once.',
    at: 0.3, effect: { radiusBonus: 0.4, knockback: 6 },
    describe: '+40% blast radius · casts knock back',
  },
  [FORMS.MIRE]: {
    name: 'The Long Patience', blurb: 'You do not finish things quickly. You finish them.',
    at: 0.3, effect: { statusDuration: 1.6, lingerDamage: 0.3 },
    describe: '+60% status duration · lingering damage',
  },
  [FORMS.WARD]: {
    name: 'The Held Breath', blurb: 'You have spent so long defending that it stuck.',
    at: 0.3, effect: { damageReduction: 0.25, regen: 1.5 },
    describe: '-25% damage taken · passive regeneration',
  },
  [FORMS.HUNT]: {
    name: 'The Long Reach', blurb: 'Nothing you throw needs aiming any more.',
    at: 0.3, effect: { homingStrength: 2.0, extraProjectile: 1 },
    describe: 'stronger homing · +1 seeker per cast',
  },
};

class AttunementSystem {
  constructor() {
    this.elements = {};   // element id → residue
    this.forms = {};      // form id → residue
    this.depth = 0;       // total residue ever held (drives slots)
    this.peakDepth = 0;   // slots never un-unlock

    this._player = null;
    this._lastDominant = null;
    this._lastDoctrine = null;
  }

  setPlayer(p) { this._player = p; }

  reset() {
    this.elements = {};
    this.forms = {};
    this.depth = 0;
    this.peakDepth = 0;
    this._emit();
  }

  // ── ACCUMULATION ─────────────────────────────────────────

  /**
   * Record a cast. Called by the wand every time a spell goes off.
   * `spell` is the infused spell definition.
   */
  absorb(spell) {
    if (!spell) return;
    const gain = ATTUNE.GAIN_BASE + (spell.potency || 1) * ATTUNE.GAIN_PER_POTENCY;

    const el = spell.element || ELEMENTS.NEUTRAL;
    this.elements[el] = (this.elements[el] || 0) + gain;

    // A fusion feeds both its parents — that is the whole point of
    // fusing, and it makes hybrid builds reachable.
    if (spell.secondaryElement) {
      this.elements[spell.secondaryElement] =
        (this.elements[spell.secondaryElement] || 0) + gain * 0.5;
    }

    const fm = spell.form || FORMS.LANCE;
    this.forms[fm] = (this.forms[fm] || 0) + gain;

    this.depth += gain;
    this.peakDepth = Math.max(this.peakDepth, this.depth);

    this._checkMilestones();
    this._emit();
  }

  /** Residue bleeds off so the build tracks recent play. */
  update(dt) {
    if (this.depth <= 0) return;
    const factor = 1 - ATTUNE.DECAY_PER_SEC * dt;
    let total = 0;

    for (const k of Object.keys(this.elements)) {
      this.elements[k] *= factor;
      if (this.elements[k] < 0.05) delete this.elements[k];
      else total += this.elements[k];
    }
    for (const k of Object.keys(this.forms)) {
      this.forms[k] *= factor;
      if (this.forms[k] < 0.05) delete this.forms[k];
    }
    this.depth = total;
  }

  // ── READING THE PROFILE ──────────────────────────────────

  totalElement() {
    return Object.values(this.elements).reduce((a, b) => a + b, 0) || 1;
  }

  totalForm() {
    return Object.values(this.forms).reduce((a, b) => a + b, 0) || 1;
  }

  /** Normalised element shares, strongest first. */
  elementShares() {
    const t = this.totalElement();
    return Object.entries(this.elements)
      .map(([id, v]) => ({ id, value: v, share: v / t }))
      .sort((a, b) => b.share - a.share);
  }

  formShares() {
    const t = this.totalForm();
    return Object.entries(this.forms)
      .map(([id, v]) => ({ id, value: v, share: v / t }))
      .sort((a, b) => b.share - a.share);
  }

  dominantElement() {
    return this.elementShares()[0]?.id || null;
  }

  dominantForm() {
    return this.formShares()[0]?.id || null;
  }

  /**
   * Your own instability — opposed elements held in one body.
   * Identical maths to a volatile brew, because it is the same idea.
   */
  instability() {
    const shares = this.elementShares();
    if (shares.length < 2) return 0;
    let opposition = 0;
    for (let i = 0; i < shares.length; i++) {
      for (let j = i + 1; j < shares.length; j++) {
        if (areOpposed(shares[i].id, shares[j].id)) {
          opposition += Math.min(shares[i].share, shares[j].share) * 2;
        }
      }
    }
    return Math.min(1, opposition);
  }

  // ── WHAT IT DOES ─────────────────────────────────────────

  /**
   * Incoming damage multiplier for a given element.
   * Attuning to fire resists fire and opens you up to ice.
   */
  incomingMultiplier(element) {
    if (!element) return 1;
    const t = this.totalElement();
    const own = (this.elements[element] || 0) / t;

    let mult = 1;
    if (own > ATTUNE.RESIST_AT) {
      const over = (own - ATTUNE.RESIST_AT) / (1 - ATTUNE.RESIST_AT);
      mult -= Math.min(ATTUNE.MAX_RESIST, over * ATTUNE.MAX_RESIST);
    }

    // Anything you're deeply attuned to leaves you open to its opposite.
    for (const { id, share } of this.elementShares()) {
      if (areOpposed(id, element) && share > ATTUNE.RESIST_AT) {
        mult += share * ATTUNE.VULN_MULT;
      }
    }

    // A volatile body takes everything a little harder.
    mult += this.instability() * 0.2;

    // Even Keel: mastering neutral is the one passive that isn't
    // "become better at X" — it shaves a flat sliver off everything.
    if (this.masteryElement() === ELEMENTS.NEUTRAL) mult -= 0.08;
    // Stoneskin stacks on top of ordinary resistance rather than
    // replacing it — earth mastery is meant to feel like armor, not
    // like a bigger version of the same resist number.
    if (this.masteryElement() === ELEMENTS.EARTH) mult -= 0.15;

    return Math.max(0.15, mult);
  }

  /** Outgoing bonus when casting an element you're steeped in. */
  outgoingMultiplier(element) {
    if (!element) return 1;
    const own = (this.elements[element] || 0) / this.totalElement();
    let mult = 1 + own * 0.5 + this.instability() * 0.25;
    if (this.masteryElement() === ELEMENTS.FIRE) mult *= 1.15;
    return mult;
  }

  /** The form doctrine currently in effect, if any. */
  activeDoctrine() {
    const top = this.formShares()[0];
    if (!top) return null;
    const d = DOCTRINES[top.id];
    if (!d || top.share < d.at) return null;
    return { ...d, form: top.id, share: top.share };
  }

  doctrineEffect(key, fallback = 0) {
    const d = this.activeDoctrine();
    return d?.effect?.[key] ?? fallback;
  }

  /**
   * The element you're mastering right now, or null. A hard
   * threshold (unlike the continuous resist/outgoing curves) because
   * a passive needs a clean on/off the player can actually notice
   * and aim for — "getting to 50% water" is a real, legible goal in
   * a way "your mana regen is currently +37.2%" isn't.
   */
  masteryElement() {
    const top = this.elementShares()[0];
    if (!top || top.share < MASTERY_AT) return null;
    return top.id;
  }

  /** The full mastery record for the UI, or null. */
  masteryInfo() {
    const id = this.masteryElement();
    if (!id) return null;
    return { id, share: this.elementShares()[0].share, ...MASTERY[id] };
  }

  /** True if the currently-mastered element is this one — the single
   *  check every other system's mastery hook is built on. */
  hasMastery(element) {
    return this.masteryElement() === element;
  }

  /** Wand slots are a function of depth, and never regress. */
  slotCount() {
    let slots = 3;
    ATTUNE.DEPTH_FOR_SLOT.forEach((need, i) => {
      if (this.peakDepth >= need) slots = 3 + i;
    });
    // Blackened (Appetite ladder, tier 3) grants a slot outright,
    // independent of Depth — the one place the permanent progression
    // reaches into the fluid one. Deliberately additive BEFORE the
    // clamp, so it cannot push past 7: the wand bar has seven physical
    // slots and a WandUI that renders eight would be a layout bug, not
    // a reward.
    return Math.min(7, slots + ascentSystem.grant('slotBonus', 0));
  }

  /** Does this cast surge from the caster's own volatility? */
  selfSurgeChance() {
    // Tempered (Refinement ladder, tier 2) scales instability down;
    // Ruinous (Appetite ladder, tier 4) has no entry here on purpose —
    // its surgePower grant makes surges HIT harder, which is read at
    // the surge site, not here. The two ladders pull this number in
    // opposite directions and that is the point.
    // ⚠️ The Leaning's instability multiplier is deliberately NOT read
    // here, even though it belongs conceptually. LeaningSystem imports
    // this module (it derives its residue half from elementShares()),
    // so importing it back would make a cycle whose two singletons
    // construct in an order neither file controls. It is applied at the
    // one place the surge is actually ROLLED instead — WandSystem's
    // cast path — which is also where it has a real effect, since this
    // method only ever feeds a UI readout.
    const inst = this.instability() * ascentSystem.grant('instabilityMult', 1);
    return inst < ATTUNE.SELF_SURGE_FLOOR ? 0 : (inst - ATTUNE.SELF_SURGE_FLOOR) * 0.5;
  }

  // ── FEEDBACK ─────────────────────────────────────────────

  _checkMilestones() {
    const dom = this.dominantElement();
    if (dom && dom !== this._lastDominant) {
      const share = this.elementShares()[0].share;
      if (share > 0.35) {
        this._lastDominant = dom;
        eventBus.emit(Events.ATTUNEMENT_SHIFT, { element: dom, share });
        eventBus.emit(Events.UI_NOTIFY, `You are becoming ${dom}.`);
      }
    }

    const doc = this.activeDoctrine();
    const id = doc?.form || null;
    if (id !== this._lastDoctrine) {
      this._lastDoctrine = id;
      if (doc) {
        eventBus.emit(Events.DOCTRINE_CHANGE, doc);
        eventBus.emit(Events.UI_NOTIFY, `${doc.name} — ${doc.blurb}`);
      }
    }

    const slots = this.slotCount();
    if (slots !== this._lastSlots) {
      const grew = this._lastSlots !== undefined && slots > this._lastSlots;
      this._lastSlots = slots;
      if (grew) eventBus.emit(Events.ATTUNEMENT_SLOT, { slots });
    }

    const mastery = this.masteryElement();
    if (mastery !== this._lastMastery) {
      this._lastMastery = mastery;
      if (mastery) {
        const m = MASTERY[mastery];
        eventBus.emit(Events.UI_NOTIFY, `Mastery — ${m.name}: ${m.desc}`);
      }
    }
  }

  _emit() {
    eventBus.emit(Events.ATTUNEMENT_UPDATE, this.snapshot());
  }

  /** Everything the UI needs, in one object. */
  snapshot() {
    return {
      elements: this.elementShares(),
      forms: this.formShares(),
      dominant: this.dominantElement(),
      dominantForm: this.dominantForm(),
      instability: this.instability(),
      depth: this.depth,
      peakDepth: this.peakDepth,
      slots: this.slotCount(),
      doctrine: this.activeDoctrine(),
      mastery: this.masteryInfo(),
      masteryAt: MASTERY_AT,
      nextSlotAt: ATTUNE.DEPTH_FOR_SLOT.find(d => d > this.peakDepth) || null,
    };
  }

  /** Seed a starting lean from the chosen path. */
  seed(elements = [], amount = 6) {
    for (const el of elements) {
      this.elements[el] = (this.elements[el] || 0) + amount;
      this.depth += amount;
    }
    this.peakDepth = Math.max(this.peakDepth, this.depth);
    this._emit();
  }
}

export const attunement = new AttunementSystem();
export { CASTABLE_ELEMENTS, FORM_LIST };
