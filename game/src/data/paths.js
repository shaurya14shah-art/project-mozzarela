// ══════════════════════════════════════════════════════════
// The Two Paths
//
// Chosen once, at character creation, and never again. The path
// sets the world's chrome — and puts one thumb on the scale.
//
// Deliberately NOT a mechanical overhaul: it grants a different
// opening hand and biases which dust the world gives up. That's
// enough for the two paths to brew differently through the early
// game without touching the alchemy systems themselves.
// ══════════════════════════════════════════════════════════

import { ELEMENTS } from './constants.js';
import { FORMS } from './essences.js';
import { atmosphere } from '../rendering/Atmosphere.js';
import { ascentSystem } from '../systems/AscentSystem.js';

export const PATHS = {
  heaven: {
    id: 'heaven',
    name: 'The Ascendant',
    // The Doctrine's one-line reading, shown above the blurb on the
    // choice card — the sentence you are actually agreeing with. The
    // blurb explains the consequence; this states the belief.
    creed: 'The wound must close',
    blurb: 'You read the Fracture as a wound to be closed. Your work is in light, order and preservation.',
    grant: 'Light · Arcane · Ice',

    // Which elements the world favours when it drops dust for you.
    favouredElements: [ELEMENTS.LIGHT, ELEMENTS.ARCANE, ELEMENTS.ICE, ELEMENTS.WIND],

    // The opening hand. Deliberately spans several forms so the
    // first visit to the cauldron teaches that element and form
    // are separate dials.
    starters: [
      ['glow_spore',     3],   // light  · bloom/ward
      ['mana_crystal',   1],   // arcane · hunt/lance — the amplifier
      ['ice_crystal',    3],   // ice    · bloom/mire
      ['spiritwood',     2],   // light  · ward · stabiliser
      ['ethereal_plume', 2],   // wind   · hunt
      ['bone_fragment',  2],   // ward   · stabiliser
    ],

    // Sigil shown on the choice card.
    sigilElement: ELEMENTS.LIGHT,
    sigilForm: FORMS.WARD,
  },

  hell: {
    id: 'hell',
    name: 'The Cinderbound',
    creed: 'Something wants it open',
    blurb: 'You read the Fracture as a door held open. Your work is in fire, appetite and what lies past the edge.',
    grant: 'Fire · Shadow · Void',

    favouredElements: [ELEMENTS.FIRE, ELEMENTS.SHADOW, ELEMENTS.VOID, ELEMENTS.POISON],

    starters: [
      ['blight_ember',  2],   // fire   · mire/bloom
      ['ashen_bone',    2],   // fire   · lance
      ['shade_dust',    3],   // shadow · hunt/ward
      ['void_essence',  3],   // void   · mire/hunt
      ['venom_sac',     2],   // poison · mire
      ['slime_gel',     3],   // poison · mire · stabiliser
    ],

    sigilElement: ELEMENTS.FIRE,
    sigilForm: FORMS.LANCE,
  },
};

export const PATH_LIST = Object.values(PATHS);

let _active = PATHS.hell;

export function getPath() { return _active; }

/** Set the path and repaint the world. */
export function setPath(id) {
  const path = PATHS[id];
  if (!path) return _active;
  _active = path;
  document.documentElement.setAttribute('data-path', path.id);
  // The world's sky, fog, light and grade follow the same choice.
  atmosphere.apply(path.id);
  // And so does which ladder you are climbing. The two Ascent ladders
  // are genuinely different progressions with opposite Trial verbs and
  // opposite kinds of reward (see data/ascent.js) — this is the line
  // that decides which one this run is on. Safe to call repeatedly
  // during character creation: AscentSystem only warns if the path
  // changes AFTER a rank has been earned, which cannot happen here.
  ascentSystem.setPath(path.id);
  return path;
}

/**
 * How much more likely a favoured element's dust is to drop.
 * Read by the transmutation and drop code.
 */
export function dustBiasFor(element) {
  return _active.favouredElements.includes(element) ? 2.0 : 1.0;
}
