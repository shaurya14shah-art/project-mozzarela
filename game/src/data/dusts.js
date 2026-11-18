// ══════════════════════════════════════════════════════════
// Essence Dust — the output of transmutation
//
// Any drop you don't want can be broken down at the Forge into
// dust of its element. Dust is pure element with no opinion about
// form, which makes it the tuning dial for brewing: it pushes a
// blend's element without disturbing its shape.
//
// This is what stops junk drops accumulating. There is no such
// thing as a worthless pickup.
// ══════════════════════════════════════════════════════════

import { ELEMENTS, ELEMENT_COLORS, MATERIAL_TIERS } from './constants.js';
import { FORMS } from './essences.js';

const DUST_ICONS = {
  [ELEMENTS.FIRE]:      '🜂',
  [ELEMENTS.WATER]:     '🜄',
  [ELEMENTS.EARTH]:     '🜃',
  [ELEMENTS.WIND]:      '🜁',
  [ELEMENTS.LIGHTNING]: '🝮',
  [ELEMENTS.SHADOW]:    '🝔',
  [ELEMENTS.LIGHT]:     '🝐',
  [ELEMENTS.VOID]:      '🝳',
  [ELEMENTS.ICE]:       '🝊',
  [ELEMENTS.POISON]:    '🜠',
  [ELEMENTS.ARCANE]:    '🝛',
  [ELEMENTS.NEUTRAL]:   '🝆',
};

const DUST_NAMES = {
  [ELEMENTS.FIRE]:      'Cinder Dust',
  [ELEMENTS.WATER]:     'Brine Dust',
  [ELEMENTS.EARTH]:     'Loam Dust',
  [ELEMENTS.WIND]:      'Zephyr Dust',
  [ELEMENTS.LIGHTNING]: 'Static Dust',
  [ELEMENTS.SHADOW]:    'Umbral Dust',
  [ELEMENTS.LIGHT]:     'Halo Dust',
  [ELEMENTS.VOID]:      'Null Dust',
  [ELEMENTS.ICE]:       'Rime Dust',
  [ELEMENTS.POISON]:    'Blight Dust',
  [ELEMENTS.ARCANE]:    'Rune Dust',
  [ELEMENTS.NEUTRAL]:   'Grey Dust',
};

// Even form spread — dust never fights the recipe for shape.
const NEUTRAL_FORM = {
  [FORMS.LANCE]: 1, [FORMS.BLOOM]: 1, [FORMS.MIRE]: 1,
  [FORMS.WARD]: 1,  [FORMS.HUNT]: 1,
};

export function dustIdFor(element) {
  return `dust_${element}`;
}

export const ESSENCE_DUSTS = Object.values(ELEMENTS).map(element => ({
  id: dustIdFor(element),
  name: DUST_NAMES[element] || `${element} Dust`,
  icon: DUST_ICONS[element] || '🝆',
  tier: MATERIAL_TIERS.COMMON,
  type: 'resource',
  element,
  isIngredient: true,
  isDust: true,
  cssColor: ELEMENT_COLORS[element],
  description: `Pure ${element} essence. Pushes a blend toward ${element} without changing its shape.`,
  // Inline essence profile — read directly by the brewing resolver.
  essence: {
    element: { [element]: 3 },
    form: { ...NEUTRAL_FORM },
    potency: 2.5,
    purity: 0.85,
  },
}));

// Special: the product of breaking down crafted equipment. Pure
// stabiliser — no element at all, it just calms a volatile mix.
export const PRISM_DUST = {
  id: 'dust_prism',
  name: 'Prism Dust',
  icon: '💠',
  tier: MATERIAL_TIERS.UNCOMMON,
  type: 'resource',
  element: ELEMENTS.NEUTRAL,
  isIngredient: true,
  isDust: true,
  description: 'Ground-down equipment. Adds nothing, steadies everything.',
  essence: {
    element: {},
    form: { ...NEUTRAL_FORM },
    potency: 1,
    purity: 0.9,
    stabilizer: 4.0,
  },
};

export const ALL_DUSTS = [...ESSENCE_DUSTS, PRISM_DUST];
