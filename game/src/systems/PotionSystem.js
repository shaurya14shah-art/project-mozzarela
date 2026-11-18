// ══════════════════════════════════════════════════════════
// Potion System — the cauldron
//
// This does not look recipes up. It resolves them.
//
//   1. Read every ingredient's essence profile
//   2. Sum element weights  → dominant element (+ runner-up)
//   3. Sum form weights     → how it's delivered
//   4. Average potency/purity, weighted by how much each contributes
//   5. Score opposed element pairs → instability
//   6. Subtract stabilisers from instability
//   7. If the top two elements are near-balanced and pair into a
//      known Fusion, upgrade the result
//
// Any combination of 2-4 ingredients produces a real spell.
// ══════════════════════════════════════════════════════════

import { ELEMENTS } from '../data/constants.js';
import {
  FORMS, FORM_LIST, INGREDIENT_ESSENCE,
  areOpposed, findFusion, rollSurge,
} from '../data/essences.js';
import { buildSpell, CASTABLE_ELEMENTS } from '../data/spellcraft.js';
import { registerItem } from '../data/itemRegistry.js';
import { inventory } from './InventorySystem.js';
import { eventBus, Events } from '../core/EventBus.js';
import { BREWING } from '../data/constants.js';
import { resolveWorking, describeState, SCORCH_AT, OPS } from './BrewProcess.js';
import { describeLoom } from '../data/weaving.js';
import { foldRunes } from '../data/runes.js';

// Default profile for an ingredient with no authored essence —
// it still brews, it's just unremarkable.
function fallbackEssence(item) {
  const el = item.element || ELEMENTS.NEUTRAL;
  const tierLevel = item.tier?.level || 1;
  return {
    element: { [el]: 2 },
    form: { [FORMS.LANCE]: 1, [FORMS.BLOOM]: 1, [FORMS.MIRE]: 1, [FORMS.WARD]: 1, [FORMS.HUNT]: 1 },
    potency: 1 + tierLevel * 0.8,
    purity: 0.5,
  };
}

/** The essence profile for an item, from any of the three sources. */
export function essenceOf(item) {
  if (!item) return null;
  if (item.essence) return item.essence;                 // inline (dusts)
  if (INGREDIENT_ESSENCE[item.id]) return INGREDIENT_ESSENCE[item.id];
  return fallbackEssence(item);
}

/** Can this item go in a cauldron at all? */
export function isBrewable(item) {
  if (!item) return false;
  if (item.isSpell) return false;                        // no re-weaving a finished Weave
  // Fragments belong in the pot even though they are NOT ingredients —
  // they act as catalysts (data/catalysts.js). This gate decides what
  // the cauldron shelf will let you pick up; the ingredient-count gate
  // that decides whether you have a brew at all lives in
  // BrewProcess.resolveWorking, which excludes them.
  if (item.isFragment) return true;
  return !!(item.isIngredient || item.essence || INGREDIENT_ESSENCE[item.id]);
}

function topTwo(weights) {
  const sorted = Object.entries(weights)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1]);
  return {
    first:  sorted[0] ? sorted[0][0] : null,
    firstW: sorted[0] ? sorted[0][1] : 0,
    second: sorted[1] ? sorted[1][0] : null,
    secondW: sorted[1] ? sorted[1][1] : 0,
    total: sorted.reduce((s, [, w]) => s + w, 0),
  };
}

class PotionSystem {
  constructor() {
    // Discovery is tracked by spell id — matrix cells and fusions alike.
    this.discovered = new Set();
    // ⚠️ THE RECIPE BOOK. `discovered` records only that a spell id has
    // been seen; it cannot answer "how did I make this?", which is the
    // one question a grimoire exists to answer. Now that the Working is
    // order- and technique-dependent (BrewProcess) and catalysts add a
    // third axis, a player who brews something excellent by accident
    // has NO WAY to reproduce it — which makes the deepest part of the
    // system feel like a slot machine.
    //
    // Keyed by spell id → { name, steps, element, form, catalyst, ... }.
    // Stores the FIRST Working that produced each spell, not the most
    // recent: the first one is the discovery, and overwriting it with a
    // later sloppier attempt would quietly degrade the book.
    this.recipes = new Map();
    this.brewCount = 0;
  }

  // ── ANALYSIS ─────────────────────────────────────────────

  /**
   * Resolve a set of ingredients into a full blend readout.
   * Pure — safe to call every frame for the live cauldron preview.
   * Returns null if there aren't enough ingredients.
   */
  /**
   * Resolve an ordered WORKING — a list of {op, item} steps — rather
   * than a bag of ingredients.
   *
   * See systems/BrewProcess.js for why this exists: analyze() below is
   * fully commutative, so three ingredients had exactly one outcome and
   * the cauldron's entire skill ceiling was "own better ingredients."
   * This is the same chemistry fed by a vessel that has a state between
   * steps, so WHEN a thing goes in matters as much as WHAT does.
   *
   * Returns the identical shape analyze() does — every consumer
   * downstream (buildSpell, WandSystem, the surge roll, the grimoire)
   * is untouched.
   */
  /**
   * @param {Array} steps the ordered Working
   * @param {Array} signedRunes runes the weaver DREW on the grid — see
   *   data/runes.js. Passed in rather than derived: the sign is the
   *   creative layer and is deliberately not a readout of the chemistry.
   */
  analyzeWorking(steps, signedRunes = []) {
    const { state, addedItems } = resolveWorking(steps || [], essenceOf);
    const runes = signedRunes || [];
    const runeFold = foldRunes(runes);
    if (addedItems.length < BREWING.MIN_INGREDIENTS) return null;

    const el = topTwo(state.elementWeights);
    const fm = topTwo(state.formWeights);
    const element   = el.first  || ELEMENTS.NEUTRAL;
    const secondary = el.second || null;
    const form      = fm.first  || FORMS.LANCE;

    let potency = state.weightSum > 0 ? state.potencySum / state.weightSum : 1;
    potency *= 1 + (addedItems.length - BREWING.MIN_INGREDIENTS) * 0.12;
    // Scorching trades clarity for force — this is the payoff that
    // makes burning it on purpose a technique rather than a mistake.
    if (state.scorched) potency *= 1.25;
    // Over-stirring is the punishment for playing it safe: a brew
    // stirred flat is calm and weak.
    potency *= 1 - state.agitation * 0.22;
    potency = Math.min(10, Math.max(0.2, potency));

    let purity = state.weightSum > 0
      ? Math.max(0.05, Math.min(1, state.puritySum / state.weightSum))
      : 0.5;

    // ── Instability, from the same opposed-pair rule as analyze() ──
    let opposition = 0;
    const elKeys = Object.keys(state.elementWeights);
    const opposedPairs = [];
    for (let i = 0; i < elKeys.length; i++) {
      for (let j = i + 1; j < elKeys.length; j++) {
        if (areOpposed(elKeys[i], elKeys[j])) {
          const share = Math.min(state.elementWeights[elKeys[i]], state.elementWeights[elKeys[j]]) / (el.total || 1);
          opposition += share * 2;
          opposedPairs.push([elKeys[i], elKeys[j]]);
        }
      }
    }
    // Stirring genuinely calms it — that is what you are buying with
    // the potency loss above. A violent hot reaction adds to it.
    const damping = state.stabilizer * 0.18 + state.agitation * 0.35;
    let instability = Math.max(0, Math.min(1, opposition - damping));
    if (state.reaction) instability = Math.min(1, instability + 0.3);
    if (state.scorched) instability = Math.min(1, instability + 0.15);

    // ── Fusion ──
    // ⚠️ Gated on the brew being CALM as well as balanced. A fusion is
    // two elements held in agreement; a hot violent reaction between
    // the same two is the opposite of that, and letting it fuse would
    // make the reaction path strictly better than the careful one.
    let fusion = null;
    if (secondary && !state.reaction) {
      const balance = el.secondW / (el.firstW || 1);
      if (balance >= BREWING.FUSION_BALANCE) fusion = findFusion(element, secondary);
    }

    // The catalyst a fragment imprinted, if one went in. Applied
    // inside buildSpell so it becomes part of the spell's IDENTITY,
    // not a post-hoc stat tweak.
    if (state.catalyst?.mods?.instability) {
      instability = Math.max(0, Math.min(1, instability * state.catalyst.mods.instability));
    }
    if (runeFold.mods.instability) {
      instability = Math.max(0, Math.min(1, instability * runeFold.mods.instability));
    }
    // ── The Confluence brake ──────────────────────────────
    // ⚠️ A FLOOR on the resolved value, not another multiplier.
    //
    // Stacking signs escalates damage superlinearly (foldRunes'
    // Confluence block — six signs measured at 466 damage against ~34
    // for one). The intended cost is instability, and it was applied
    // as a multiplier on the base — which does nothing at all when the
    // base is 0, and a clean well-handled brew resolves to exactly 0.
    // So the optimal play was "brew perfectly stable, then lay six
    // signs", i.e. the enormous version was also the SAFEST version.
    //
    // A weave carrying this many signs is inherently volatile
    // regardless of how carefully it was handled. That is the whole
    // fiction of the thing, and it is the only reason laying every
    // rune you know is a decision rather than an obvious yes.
    const signCount = runeFold.count || 0;
    if (signCount >= 2) {
      const floor = Math.min(0.9, (signCount - 1) * 0.13);
      instability = Math.max(instability, floor);
    }
    const spell = buildSpell({
      element, secondary, form, potency, purity, instability,
      fusion, amplifier: state.amplifier, catalyst: state.catalyst,
      runes, runeMods: runeFold.mods, runeEffect: runeFold.effect,
    });

    return {
      spell,
      element, secondary, form,
      elementWeights: state.elementWeights,
      formWeights: state.formWeights,
      elementTotal: el.total || 1,
      formTotal: fm.total || 1,
      potency, purity, instability,
      stabilizerTotal: state.stabilizer,
      amplifier: state.amplifier,
      fusion,
      opposedPairs,
      ingredientCount: addedItems.length,
      isNew: !this.discovered.has(spell.id),
      fusionReady: !!fusion,
      nearFusion: this._nearFusion(el, element, secondary),
      catalyst: state.catalyst,
      runes,
      // ── Process-only readouts, for the cauldron UI ──
      process: {
        temp: state.temp,
        scorched: state.scorched,
        agitation: state.agitation,
        rested: state.rested,
        reaction: !!state.reaction,
        // Weaving vocabulary — describeState() is the old cauldron
        // wording and is kept only for anything still calling it.
        description: describeLoom(state),
        state,
        log: state.log,
      },
    };
  }

  /**
   * The old bag-of-ingredients path.
   *
   * ⚠️ Kept, and kept working, because it is what the grimoire's
   * "what would these make" preview and every existing caller uses —
   * but it is now expressed AS a Working, so there is exactly one
   * chemistry implementation rather than two that can drift apart.
   * The default procedure is the naive one: everything in, cold, no
   * technique. That is deliberately the DULLEST result the new system
   * can produce, which is the honest translation of what the old
   * system always did.
   */
  analyze(items) {
    const valid = (items || []).filter(Boolean).filter(isBrewable);
    if (valid.length < BREWING.MIN_INGREDIENTS) return null;
    return this.analyzeWorking(valid.map(item => ({ op: OPS.ADD, item })));
  }

  /** The original commutative resolver, retained for reference only. */
  _analyzeBag(items) {
    const valid = (items || []).filter(Boolean).filter(isBrewable);
    if (valid.length < BREWING.MIN_INGREDIENTS) return null;

    const elementWeights = {};
    const formWeights    = {};
    let potencySum = 0, puritySum = 0, weightSum = 0;
    let stabilizerTotal = 0;
    let amplifier = 1;

    for (const item of valid) {
      const e = essenceOf(item);
      const potency = e.potency ?? 1;

      // An ingredient's influence on element/form scales with its
      // potency — a Dragon Heart dominates a Slime Gel.
      for (const [el, w] of Object.entries(e.element || {})) {
        elementWeights[el] = (elementWeights[el] || 0) + w * (0.5 + potency * 0.15);
      }
      for (const [fm, w] of Object.entries(e.form || {})) {
        formWeights[fm] = (formWeights[fm] || 0) + w * (0.5 + potency * 0.15);
      }

      potencySum += potency * potency;   // potency-weighted average:
      weightSum  += potency;             // strong ingredients pull harder
      puritySum  += (e.purity ?? 0.5) * potency;

      stabilizerTotal += e.stabilizer || 0;
      if (e.amplifier) amplifier *= e.amplifier;
    }

    const el = topTwo(elementWeights);
    const fm = topTwo(formWeights);

    const element   = el.first  || ELEMENTS.NEUTRAL;
    const secondary = el.second || null;
    const form      = fm.first  || FORMS.LANCE;

    // Base potency is the potency-weighted mean, nudged up for
    // using more of the cauldron.
    let potency = weightSum > 0 ? potencySum / weightSum : 1;
    potency *= 1 + (valid.length - BREWING.MIN_INGREDIENTS) * 0.12;
    potency = Math.min(10, potency);

    const purity = weightSum > 0
      ? Math.max(0.1, Math.min(1, puritySum / weightSum))
      : 0.5;

    // ── Instability ───────────────────────────────────────
    // Every opposed pair present in the mix contributes, weighted
    // by how much of each is actually in there.
    let opposition = 0;
    const elKeys = Object.keys(elementWeights);
    const opposedPairs = [];
    for (let i = 0; i < elKeys.length; i++) {
      for (let j = i + 1; j < elKeys.length; j++) {
        if (areOpposed(elKeys[i], elKeys[j])) {
          const share = Math.min(elementWeights[elKeys[i]], elementWeights[elKeys[j]]) / (el.total || 1);
          opposition += share * 2;
          opposedPairs.push([elKeys[i], elKeys[j]]);
        }
      }
    }
    // Stabilisers cut it; a heavily stabilised brew is dead calm.
    const damping = stabilizerTotal * 0.18;
    const instability = Math.max(0, Math.min(1, opposition - damping));

    // ── Fusion check ──────────────────────────────────────
    // Only fires when the two elements are genuinely balanced —
    // a splash of ice in a fire brew is not an Emberstorm.
    let fusion = null;
    if (secondary) {
      const balance = el.secondW / (el.firstW || 1);
      if (balance >= BREWING.FUSION_BALANCE) {
        fusion = findFusion(element, secondary);
      }
    }

    const spell = buildSpell({
      element, secondary, form, potency, purity, instability, fusion, amplifier,
    });

    return {
      spell,
      element, secondary, form,
      elementWeights, formWeights,
      elementTotal: el.total || 1,
      formTotal: fm.total || 1,
      potency, purity, instability,
      stabilizerTotal, amplifier,
      fusion,
      opposedPairs,
      ingredientCount: valid.length,
      isNew: !this.discovered.has(spell.id),
      fusionReady: !!fusion,
      // How close a near-miss fusion is, so the UI can nudge the player.
      nearFusion: this._nearFusion(el, element, secondary),
    };
  }

  _nearFusion(el, element, secondary) {
    if (!secondary) return null;
    const balance = el.secondW / (el.firstW || 1);
    if (balance >= BREWING.FUSION_BALANCE) return null;
    const fusion = findFusion(element, secondary);
    if (!fusion) return null;
    return { fusion, balance, needed: BREWING.FUSION_BALANCE };
  }

  /** Live preview for the cauldron UI. */
  preview(items) {
    return this.analyze(items);
  }

  // ── BREWING ──────────────────────────────────────────────

  /**
   * Consume the ingredients and put the resulting potion in the bag.
   * `items` is the array of cauldron slot contents (may contain nulls).
   */
  /**
   * @param {Array} items what is in the pot (for the inventory spend)
   * @param {Array} [working] the ordered sequence of operations. When
   *   omitted, falls back to the naive "everything in, cold, no
   *   technique" procedure — see analyze()'s note on why that is
   *   deliberately the dullest result the system can produce.
   */
  brew(items, working = null, signedRunes = []) {
    const valid = (items || []).filter(Boolean).filter(isBrewable);
    if (valid.length < BREWING.MIN_INGREDIENTS) {
      eventBus.emit(Events.UI_NOTIFY, `Needs at least ${BREWING.MIN_INGREDIENTS} ingredients.`);
      return null;
    }

    // Tally what we're about to spend
    const required = {};
    for (const item of valid) {
      required[item.id] = (required[item.id] || 0) + 1;
    }
    for (const [id, count] of Object.entries(required)) {
      if (!inventory.hasItem(id, count)) {
        const name = valid.find(i => i.id === id)?.name || id;
        eventBus.emit(Events.UI_NOTIFY, `Not enough ${name}.`);
        return null;
      }
    }

    const result = working?.length ? this.analyzeWorking(working, signedRunes) : this.analyze(items);
    if (!result) return null;

    for (const [id, count] of Object.entries(required)) {
      inventory.consumeItems(id, count);
    }

    const potion = registerItem({ ...result.spell });
    inventory.addItem(potion, 1);
    this.brewCount++;

    const isNew = !this.discovered.has(potion.id);
    if (isNew) {
      this.discovered.add(potion.id);
      // Record HOW, not just THAT. See this.recipes' note.
      if (working?.length) this._recordRecipe(potion, working, result);
      eventBus.emit(Events.SPELL_LEARN, { spell: potion, fusion: !!result.fusion });
      eventBus.emit(Events.UI_NOTIFY,
        result.fusion
          ? `FUSION DISCOVERED — ${potion.name}!`
          : `New spell discovered: ${potion.name}`
      );
    } else {
      eventBus.emit(Events.UI_NOTIFY, `Brewed ${potion.name} · ${potion.charges} charges`);
    }

    if (result.instability > 0.55) {
      eventBus.emit(Events.UI_NOTIFY, 'This brew is unstable — it may surge when cast.');
    }

    eventBus.emit(Events.SPELL_CREATE, potion);
    eventBus.emit(Events.BREW_COMPLETE, { potion, result, isNew });
    return { potion, result, isNew };
  }

  // ── SURGE (called by the wand at cast time) ──────────────

  rollSurgeFor(potion) {
    if (!potion || !potion.instability) return null;
    return rollSurge(potion.instability);
  }

  // ── GRIMOIRE / DISCOVERY ─────────────────────────────────

  isDiscovered(spellId) {
    return this.discovered.has(spellId);
  }

  /**
   * Has this matrix/fusion cell been filled by ANY brew, catalysed or
   * not?
   *
   * ⚠️ A catalysed spell's id carries a suffix (`fire_lance_arcing` —
   * see buildSpell, where the catalyst is deliberately part of the
   * IDENTITY). The matrix and fusion progress readouts build their
   * comparison ids WITHOUT a catalyst, so a plain `has()` missed every
   * catalysed discovery and the grimoire reported "0 / 60" straight
   * after announcing a fusion. Prefix-match instead, anchored on the
   * separator so `fire_lance` cannot accidentally match `fire_lancet`.
   */
  isCellDiscovered(baseId) {
    if (this.discovered.has(baseId)) return true;
    const prefix = `${baseId}_`;
    for (const id of this.discovered) {
      if (id.startsWith(prefix)) return true;
    }
    return false;
  }

  markDiscovered(spellId) {
    this.discovered.add(spellId);
  }

  /**
   * Store the Working that first produced a spell, in a form the
   * grimoire can print as instructions.
   *
   * Deliberately stores the STEP LIST rather than a prose summary —
   * the same data the cauldron consumes, so a future "cook this again"
   * button can replay it directly instead of re-deriving it from
   * English.
   */
  _recordRecipe(potion, working, result) {
    if (this.recipes.has(potion.id)) return;   // first Working wins
    this.recipes.set(potion.id, {
      id: potion.id,
      name: potion.name,
      icon: potion.icon,
      element: result.element,
      form: result.form,
      catalyst: result.catalyst?.suffix || null,
      tierName: potion.tier?.name,
      // {op, itemId, itemName} — ids not object references, so a recipe
      // survives the item definitions being rebuilt.
      steps: working.map(w => ({
        op: w.op,
        itemId: w.item?.id || null,
        itemName: w.item?.name || null,
        isFragment: !!w.item?.isFragment,
      })),
      process: result.process
        ? { description: result.process.description, scorched: !!result.process.scorched }
        : null,
    });
  }

  /** The recorded Working for a discovered spell, or null. */
  getRecipe(spellId) {
    return this.recipes.get(spellId) || null;
  }

  /** Every recorded recipe, newest last. */
  getRecipes() {
    return [...this.recipes.values()];
  }

  getDiscoveredCount() {
    return this.discovered.size;
  }

  /** Discovery grid: every element × form cell, flagged found/unfound. */
  getMatrixProgress() {
    const rows = [];
    for (const element of CASTABLE_ELEMENTS) {
      const cells = FORM_LIST.map(form => {
        const spell = buildSpell({ element, form, potency: 5, purity: 0.7, instability: 0 });
        return { element, form, spell, discovered: this.isCellDiscovered(spell.id) };
      });
      rows.push({ element, cells });
    }
    return rows;
  }

  /** Fusions found so far, keyed by fusion id (any form counts). */
  getFusionProgress(fusions) {
    return fusions.map(f => {
      const foundForms = FORM_LIST.filter(form => this.isCellDiscovered(`${f.id}_${form}`));
      return { fusion: f, discovered: foundForms.length > 0, foundForms };
    });
  }

  /** Everything the player has actually brewed at least once. */
  getDiscoveredSpells() {
    return [...this.discovered];
  }
}

export const potionSystem = new PotionSystem();
