// ══════════════════════════════════════════════════════════
// The Working — brewing as a PROCESS, not a shopping list
//
// ── THE PROBLEM THIS SOLVES ───────────────────────────────
// PotionSystem.analyze() sums a bag of ingredients. It is a good
// resolver and it is completely COMMUTATIVE: element weights add, form
// weights add, potency averages. Which means
//
//     fire + ice + salt   ===   salt + ice + fire
//
// always, exactly, forever. Three ingredients have exactly one
// outcome, so the entire skill ceiling of the cauldron is "own better
// ingredients," and a player who has found the good combination has
// finished brewing for the rest of the game. That is the monotony.
//
// ── THE FIX: STATE THAT EXISTS BETWEEN STEPS ──────────────
// A Working is an ordered list of operations on a vessel that has a
// live state — temperature, agitation, and what is already dissolved
// in it. An ingredient does not contribute what it *is*; it
// contributes what it is WHEN IT GOES IN. Drop shade dust into a cold
// pot and it layers. Drop it into a boiling one and it flashes off,
// leaving almost nothing but a shove toward Lance.
//
// That one change makes order matter everywhere, without adding a
// single new ingredient:
//
//   THE BASE     the first thing in defines the brew. Its element gets
//                a dominance bonus nothing later can fully overturn.
//   THE FINISH   the last thing in decides delivery. Its form gets the
//                bonus. So A→B→C and C→B→A are different spells made
//                of identical materials.
//   HEAT         amplifies whatever goes in next and burns off purity.
//   COLD         preserves purity and element identity, costs potency.
//   STIR         trades instability for distinctiveness — it blends
//                toward the mean, so over-stirring makes mud.
//   REST         volatiles evaporate; the profile SHIFTS toward what
//                is left, and purity climbs.
//   SCORCH       heating past the threshold is not a failure state, it
//                is a different recipe space with its own results.
//
// ⚠️ This module deliberately does NOT replace analyze(). It produces
// the same {element, form, potency, purity, instability} shape that
// analyze() does, and hands it to the same buildSpell(), so every
// consumer downstream (WandSystem, the grimoire, the surge roll) is
// untouched. The vessel is new; the chemistry it feeds is not.
// ══════════════════════════════════════════════════════════

import { ELEMENTS } from '../data/constants.js';
import { FORMS, areOpposed } from '../data/essences.js';
import { catalystFor } from '../data/catalysts.js';
// ⚠️ Narration only. The craft is now WEAVING (see data/weaving.js);
// this module keeps its original op vocabulary internally because the
// chemistry is verified and remapping ops to achieve a rename would
// mean touching it. weaving.js is the translation layer.
import { HANDLING_LOG, threadName } from '../data/weaving.js';

/** Everything you can do to a pot. */
export const OPS = {
  ADD:    'add',
  HEAT:   'heat',
  COOL:   'cool',
  STIR:   'stir',
  REST:   'rest',
  CRUSH:  'crush',
};

/**
 * The techniques, as data — so the UI can render buttons and tooltips
 * from one table rather than hardcoding six of each.
 */
export const TECHNIQUES = [
  {
    op: OPS.HEAT, name: 'Heat', key: 'H',
    blurb: 'Raise the fire. What goes in next hits harder and comes out less clean.',
  },
  {
    op: OPS.COOL, name: 'Quench', key: 'Q',
    blurb: 'Drop the temperature. Preserves what is already dissolved. Costs strength.',
  },
  {
    op: OPS.STIR, name: 'Stir', key: 'S',
    blurb: 'Blend it. Calms a volatile mix — and blurs a distinctive one toward nothing.',
  },
  {
    op: OPS.REST, name: 'Let It Stand', key: 'R',
    blurb: 'Wait. The lightest essences leave; what remains is purer and narrower.',
  },
  {
    op: OPS.CRUSH, name: 'Grind', key: 'G',
    blurb: 'Mortar the next ingredient. Twice the essence, half the clarity.',
  },
];

/** Where heat stops helping and starts changing what you are making. */
export const SCORCH_AT = 0.82;

/**
 * Walk an ordered list of steps and produce the same analysis shape
 * PotionSystem.analyze() returns.
 *
 * @param {Array<{op:string, item?:object}>} steps
 * @param {(item:object)=>object} essenceOf injected — PotionSystem owns
 *   the three-source essence lookup and importing it back here would be
 *   circular.
 */
export function resolveWorking(steps, essenceOf) {
  const state = {
    temp: 0.25,        // 0 stone cold … 1 boiling. Starts barely warm.
    agitation: 0,      // how much it has been stirred
    rested: 0,
    crushNext: false,
    scorched: false,
    // The catalyst a fragment imprinted on this Working, if any.
    catalyst: null,
    elementWeights: {},
    formWeights: {},
    potencySum: 0,
    weightSum: 0,
    puritySum: 0,
    stabilizer: 0,
    amplifier: 1,
    added: 0,
    // The log is what the UI narrates back. Brewing is opaque without
    // it — the player has to be able to see that the heat did
    // something, or the technique buttons are superstition.
    log: [],
  };

  const addedItems = [];   // real ingredients only — fragments are not

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    switch (step.op) {
      case OPS.HEAT:   _heat(state); break;
      case OPS.COOL:   _cool(state); break;
      case OPS.STIR:   _stir(state); break;
      case OPS.REST:   _rest(state); break;
      case OPS.CRUSH:  _crush(state); break;
      case OPS.ADD:
        if (step.item) {
          // ⚠️ Only real ingredients count toward addedItems — the
          // minimum-ingredient gate reads its length, and a pot holding
          // three fragments and nothing else must not pass it.
          if (!step.item.isFragment) addedItems.push(step.item);
          _add(state, step.item, essenceOf, {
            // ⚠️ isFirst/isLast are what make this non-commutative.
            // Computed against the ADD steps only, not the step index —
            // heating before the first ingredient must not stop that
            // ingredient from being the base.
            isFirst: state.added === 0,
            // "Last" means the last real INGREDIENT, not the last add
            // — dropping a fragment in at the end must not steal The
            // Finish from the ingredient before it.
            isLast: !steps.slice(i + 1).some(st => st.op === OPS.ADD && !st.item?.isFragment),
          });
        }
        break;
      default: break;
    }
  }

  return { state, addedItems };
}

// ── OPERATIONS ────────────────────────────────────────────

function _heat(s) {
  const before = s.temp;
  s.temp = Math.min(1, s.temp + 0.22);
  if (!s.scorched && s.temp >= SCORCH_AT) {
    s.scorched = true;
    // Not a failure. Scorching is a different recipe space — it
    // savages purity but pushes potency and opens results a clean brew
    // cannot reach. Saying so in the log matters: a player who thinks
    // they broke it will never do it on purpose.
    s.log.push(HANDLING_LOG.heat_fray);
  } else if (s.temp > before) {
    s.log.push(HANDLING_LOG.heat_up);
  }
}

function _cool(s) {
  s.temp = Math.max(0, s.temp - 0.26);
  // Quenching sets the scorch flag back down only if you drop it a long
  // way — you cannot un-burn something by taking it off the fire for a
  // moment.
  if (s.scorched && s.temp < 0.4) {
    s.scorched = false;
    s.log.push(HANDLING_LOG.cool);
  } else {
    s.log.push(HANDLING_LOG.cool);
  }
}

function _stir(s) {
  s.agitation = Math.min(1, s.agitation + 0.3);
  // Blend toward the mean. This is the whole cost of stirring: it
  // calms an opposed mix, and it also erases the distinction between
  // what you put in, which is what makes an over-stirred brew mud.
  const keys = Object.keys(s.elementWeights);
  if (keys.length > 1) {
    const mean = keys.reduce((a, k) => a + s.elementWeights[k], 0) / keys.length;
    for (const k of keys) {
      s.elementWeights[k] += (mean - s.elementWeights[k]) * 0.18;
    }
  }
  s.log.push(s.agitation > 0.75 ? HANDLING_LOG.ply_flat : HANDLING_LOG.ply);
}

function _rest(s) {
  s.rested += 1;
  // Volatiles leave. The lightest-weighted elements lose the most, so
  // resting NARROWS a profile toward whatever dominates — the opposite
  // of stirring, and the reason the two are not redundant.
  const keys = Object.keys(s.elementWeights);
  if (keys.length) {
    const max = Math.max(...keys.map(k => s.elementWeights[k]));
    for (const k of keys) {
      const share = s.elementWeights[k] / (max || 1);
      s.elementWeights[k] *= 0.82 + share * 0.18;
    }
  }
  s.puritySum += s.weightSum * 0.12;  // what is left is cleaner
  s.temp = Math.max(0, s.temp - 0.08);
  s.log.push(HANDLING_LOG.rest);
}

function _crush(s) {
  s.crushNext = true;
  s.log.push(HANDLING_LOG.crush);
}

function _add(s, item, essenceOf, { isFirst, isLast }) {
  // ── FRAGMENTS ARE NOT INGREDIENTS ──
  // A fragment does not vote on element or form — it transforms the
  // finished spell, and WHICH transformation depends on how hot the pot
  // is right now (see data/catalysts.js). So it returns before any of
  // the essence-summing below, and it does NOT count toward the
  // minimum-ingredient check, because a pot containing nothing but
  // three fragments is not a brew.
  const cat = catalystFor(item, s.temp);
  if (cat) {
    // Last one in wins. Two fragments do not stack — stacking would
    // make the interesting decision ("which fragment, and do I heat
    // first?") collapse into "add every fragment you own."
    if (s.catalyst) {
      s.log.push(HANDLING_LOG.core_replace(cat.suffix));
    } else {
      s.log.push(HANDLING_LOG.core(cat.blurb));
    }
    s.catalyst = cat;
    s.crushNext = false;
    return;
  }

  const e = essenceOf(item) || {};
  const basePotency = e.potency ?? 1;

  // ── Heat decides what an ingredient actually gives you ──
  // Hot: more of everything, less clarity. Cold: less strength, but
  // the element identity survives intact.
  const heatGain = 0.6 + s.temp * 1.1;
  const purityLoss = s.temp * 0.45 + (s.scorched ? 0.25 : 0);

  let elMult = heatGain;
  let purity = (e.purity ?? 0.5) - purityLoss;

  if (s.crushNext) {
    elMult *= 2;
    purity -= 0.25;
    s.crushNext = false;
  }

  // ── THE BASE ── the first thing in defines the brew.
  if (isFirst) elMult *= 1.6;

  const potency = basePotency * (0.75 + s.temp * 0.7);

  for (const [el, w] of Object.entries(e.element || {})) {
    s.elementWeights[el] = (s.elementWeights[el] || 0) + w * elMult * (0.5 + potency * 0.15);
  }

  // ── THE FINISH ── the last thing in decides delivery.
  const formMult = isLast ? 2.2 : 1;
  for (const [fm, w] of Object.entries(e.form || {})) {
    s.formWeights[fm] = (s.formWeights[fm] || 0) + w * formMult * (0.5 + potency * 0.15);
  }

  // ── VIOLENT REACTION ──
  // Adding something opposed to what is already dominant, while hot,
  // is the single most dangerous thing you can do — and the only route
  // to the highest-instability results. Cold, the same pair layers
  // quietly and stays fusion-eligible.
  const dom = _dominant(s.elementWeights);
  const incoming = Object.keys(e.element || {})[0];
  if (dom && incoming && areOpposed(dom, incoming)) {
    if (s.temp > 0.55) {
      s.reaction = true;
      s.log.push(HANDLING_LOG.react);
    } else {
      s.log.push(HANDLING_LOG.layer);
    }
  }

  s.potencySum += potency * potency;
  s.weightSum += potency;
  s.puritySum += Math.max(0.05, purity) * potency;
  s.stabilizer += e.stabilizer || 0;
  if (e.amplifier) s.amplifier *= e.amplifier;
  s.added += 1;

  s.log.push(HANDLING_LOG.add(threadName(item), s.temp > 0.6));
}

function _dominant(weights) {
  let best = null, bestW = 0;
  for (const [k, w] of Object.entries(weights)) {
    if (w > bestW) { bestW = w; best = k; }
  }
  return best;
}

/**
 * A short, readable description of the vessel right now, for the UI.
 * Deliberately qualitative — a temperature bar reading "0.63" tells the
 * player nothing about what to do next.
 */
export function describeState(s) {
  if (!s) return '';
  const heat = s.scorched ? 'scorching'
    : s.temp > 0.7 ? 'boiling'
    : s.temp > 0.45 ? 'simmering'
    : s.temp > 0.2 ? 'warm'
    : 'cold';
  const body = s.agitation > 0.75 ? ', stirred flat'
    : s.agitation > 0.35 ? ', well blended'
    : '';
  const rest = s.rested > 1 ? ', long-stood' : s.rested ? ', stood' : '';
  return `${heat}${body}${rest}`;
}
