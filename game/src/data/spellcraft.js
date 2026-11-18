// ══════════════════════════════════════════════════════════
// Spellcraft — turns a resolved essence blend into a real spell
//
// Every (element × form) pair is a distinct, named spell. That's
// the 60-cell matrix the Grimoire fills in. Fusions layer on top
// when two elements come out balanced.
// ══════════════════════════════════════════════════════════

import { ELEMENTS, MATERIAL_TIERS, ELEMENT_COLORS } from './constants.js';
import { FORMS, FORM_DATA, ELEMENT_TRAITS } from './essences.js';

// ── THE MATRIX ────────────────────────────────────────────
// One name per element per form. Names are the discovery reward —
// they read as a coherent magical vocabulary rather than
// "Fire Potion II".
export const ELEMENT_LEXICON = {
  [ELEMENTS.FIRE]: {
    icon: '🔥', adj: 'Ember',
    [FORMS.LANCE]: 'Flamelance',   [FORMS.BLOOM]: 'Detonation',
    [FORMS.MIRE]:  'Cinderfield',  [FORMS.WARD]:  'Emberskin',
    [FORMS.HUNT]:  'Wisp Swarm',
  },
  [ELEMENTS.ICE]: {
    icon: '❄️', adj: 'Rime',
    [FORMS.LANCE]: 'Icicle Spear', [FORMS.BLOOM]: 'Frostburst',
    [FORMS.MIRE]:  'Killing Frost',[FORMS.WARD]:  'Rimeguard',
    [FORMS.HUNT]:  'Hailseekers',
  },
  [ELEMENTS.LIGHTNING]: {
    icon: '⚡', adj: 'Storm',
    [FORMS.LANCE]: 'Bolt Driver',  [FORMS.BLOOM]: 'Thunderclap',
    [FORMS.MIRE]:  'Static Field', [FORMS.WARD]:  'Charge Mantle',
    [FORMS.HUNT]:  'Arc Hounds',
  },
  [ELEMENTS.POISON]: {
    icon: '☠️', adj: 'Blight',
    [FORMS.LANCE]: 'Venom Dart',   [FORMS.BLOOM]: 'Spore Burst',
    [FORMS.MIRE]:  'Plague Cloud', [FORMS.WARD]:  'Toxin Skin',
    [FORMS.HUNT]:  'Wasp Brood',
  },
  [ELEMENTS.SHADOW]: {
    icon: '🌑', adj: 'Umbral',
    [FORMS.LANCE]: 'Shadow Spike', [FORMS.BLOOM]: 'Blackout',
    [FORMS.MIRE]:  'Creeping Dark',[FORMS.WARD]:  'Phantom Veil',
    [FORMS.HUNT]:  'Grasping Hands',
  },
  [ELEMENTS.LIGHT]: {
    icon: '✨', adj: 'Radiant',
    [FORMS.LANCE]: 'Sunlance',     [FORMS.BLOOM]: 'Flashfire',
    [FORMS.MIRE]:  'Hallowed Ground', [FORMS.WARD]: 'Aegis of Dawn',
    [FORMS.HUNT]:  'Seeking Motes',
  },
  [ELEMENTS.VOID]: {
    icon: '🕳️', adj: 'Hollow',
    [FORMS.LANCE]: 'Nullpiercer',  [FORMS.BLOOM]: 'Void Collapse',
    [FORMS.MIRE]:  'Entropy Well', [FORMS.WARD]:  'Absence',
    [FORMS.HUNT]:  'Devourers',
  },
  [ELEMENTS.ARCANE]: {
    icon: '🔮', adj: 'Runic',
    [FORMS.LANCE]: 'Manabolt',     [FORMS.BLOOM]: 'Arcane Nova',
    [FORMS.MIRE]:  'Sigil Field',  [FORMS.WARD]:  'Mage Armour',
    [FORMS.HUNT]:  'Orbiting Runes',
  },
  [ELEMENTS.EARTH]: {
    icon: '⛰️', adj: 'Stone',
    [FORMS.LANCE]: 'Stone Javelin',[FORMS.BLOOM]: 'Earthshatter',
    [FORMS.MIRE]:  'Quagmire',     [FORMS.WARD]:  'Bulwark',
    [FORMS.HUNT]:  'Rolling Boulders',
  },
  [ELEMENTS.WIND]: {
    icon: '🌪️', adj: 'Gale',
    [FORMS.LANCE]: 'Cutting Gale', [FORMS.BLOOM]: 'Galeforce',
    [FORMS.MIRE]:  'Whirling Snare', [FORMS.WARD]: 'Windstep',
    [FORMS.HUNT]:  'Zephyr Blades',
  },
  [ELEMENTS.WATER]: {
    icon: '💧', adj: 'Tidal',
    [FORMS.LANCE]: 'Pressure Jet', [FORMS.BLOOM]: 'Tidebreak',
    [FORMS.MIRE]:  'Drowning Pool',[FORMS.WARD]:  'Mirror Surface',
    [FORMS.HUNT]:  'Chasing Tide',
  },
  [ELEMENTS.NEUTRAL]: {
    icon: '⚪', adj: 'Raw',
    [FORMS.LANCE]: 'Force Lance',  [FORMS.BLOOM]: 'Concussion',
    [FORMS.MIRE]:  'Pressure Field', [FORMS.WARD]: 'Kinetic Shell',
    [FORMS.HUNT]:  'Seeker Shards',
  },
};

export const CASTABLE_ELEMENTS = Object.keys(ELEMENT_LEXICON);

/** Stable identifier for a matrix cell — used as the potion/spell id. */
export function matrixId(element, form) {
  return `${element}_${form}`;
}

export function getMatrixName(element, form) {
  return ELEMENT_LEXICON[element]?.[form] || 'Unknown Brew';
}

export function getElementIcon(element) {
  return ELEMENT_LEXICON[element]?.icon || '🌀';
}

/** Total number of discoverable spells — matrix cells plus fusions. */
export function matrixSize() {
  return CASTABLE_ELEMENTS.length * Object.keys(FORMS).length;
}

// ── TIERING ───────────────────────────────────────────────
const TIER_LADDER = [
  { min: 0,   tier: MATERIAL_TIERS.COMMON    },
  { min: 3.0, tier: MATERIAL_TIERS.UNCOMMON  },
  { min: 4.5, tier: MATERIAL_TIERS.RARE      },
  { min: 6.0, tier: MATERIAL_TIERS.EPIC      },
  { min: 7.5, tier: MATERIAL_TIERS.LEGENDARY },
  { min: 9.0, tier: MATERIAL_TIERS.MYTHIC    },
];

export function tierForPotency(potency) {
  let out = MATERIAL_TIERS.COMMON;
  for (const step of TIER_LADDER) {
    if (potency >= step.min) out = step.tier;
  }
  return out;
}

function hexFromCss(css) {
  if (typeof css !== 'string') return 0xffffff;
  return parseInt(css.replace('#', ''), 16) || 0xffffff;
}

// ── SPELL CONSTRUCTION ────────────────────────────────────

/**
 * Build a complete spell/potion definition from a resolved blend.
 *
 * @param {object} blend
 *   element      dominant element id
 *   secondary    runner-up element id (may be null)
 *   form         dominant form id
 *   potency      0-10ish
 *   purity       0-1
 *   instability  0-1
 *   fusion       fusion def from essences.js, or null
 *   amplifier    multiplicative bonus from amplifier ingredients
 */
export function buildSpell(blend) {
  const {
    element, secondary = null, form,
    potency = 1, purity = 0.5, instability = 0,
    fusion = null, amplifier = 1,
    catalyst = null,
    runes = null, runeMods = null, runeEffect = null,
  } = blend;

  const formData = FORM_DATA[form] || FORM_DATA[FORMS.LANCE];
  const trait    = ELEMENT_TRAITS[element] || ELEMENT_TRAITS[ELEMENTS.NEUTRAL];

  // Instability trades control for raw output — up to +60%.
  const volatility = 1 + instability * 0.6;

  // Amplifiers stack, but with diminishing returns — two Primordium
  // shouldn't square the output.
  const amp = 1 + Math.min(1.0, (amplifier - 1) * 0.8);

  const baseDamage = 8 + potency * 6;

  // `power` is the form-independent magnitude of the brew. Wards deal
  // no damage, so this is what their healing and shielding scale off —
  // without it a Legendary ward would be identical to a Common one.
  const power = Math.round(baseDamage * trait.damageBias * volatility * amp);

  let damage = baseDamage
    * formData.damageMult
    * trait.damageBias
    * volatility
    * amp;

  // Effects: element trait first, then the fusion's own package on top.
  let effect = { ...trait.effect };
  if (formData.lingering) {
    effect.tickRate = formData.tickRate;
    effect.duration = formData.lingering;
  }
  if (formData.pierce)  effect.pierce  = true;
  if (formData.homing)  effect.homing  = true;
  if (formData.selfCast) effect.duration = formData.buffDuration;

  let name        = getMatrixName(element, form);
  let icon        = ELEMENT_LEXICON[element]?.icon || '🌀';
  let color       = hexFromCss(ELEMENT_COLORS[element]);
  let description = `${formData.blurb} ${trait.verb} on contact.`;
  let fusionId    = null;

  if (fusion) {
    damage      *= fusion.damageMult;
    effect       = { ...effect, ...fusion.effect };
    // A fusion keeps the form it was brewed into — "Eclipse Ward"
    // reads differently from "Eclipse Lance", and plays differently too.
    name         = `${fusion.name} ${formData.name}`;
    icon         = fusion.icon;
    color        = fusion.color;
    description  = fusion.description;
    fusionId     = fusion.id;
  }

  // Purity governs how many casts you get and how cheaply.
  let charges  = Math.max(2, Math.round((2 + purity * 7) * formData.chargeMult));
  let manaCost = Math.round((6 + potency * 2.2) * (1.35 - purity * 0.5));

  let radius = (formData.radius || 0) + (fusion?.volatile ? 2 : 0);
  let speed = formData.speed;
  let catalystId = null;

  // ── CATALYST ──
  // A fragment does not vote on element or form (see data/catalysts.js);
  // it transforms the finished result. Applied AFTER fusion so a
  // catalysed fusion is possible and reads as "Eclipse Lance,
  // Detonating" rather than the two fighting over the name.
  if (catalyst) {
    const m = catalyst.mods || {};
    if (m.damage)  damage *= m.damage;
    if (m.charges) charges = Math.max(1, Math.round(charges * m.charges));
    if (m.mana)    manaCost = Math.max(1, Math.round(manaCost * m.mana));
    if (m.radius)  radius += m.radius;
    if (m.speed)   speed *= m.speed;
    effect = { ...effect, ...(catalyst.effect || {}) };
    name = `${name}, ${catalyst.suffix}`;
    description = catalyst.blurb;
    catalystId = catalyst.id;
  }

  // ── RUNES ──
  // Applied last, on top of the catalyst, so a rune can push a
  // catalysed weave further without ever replacing its identity. The
  // rune ids join the spell id, so two weaves that differ only by an
  // inscribed rune are genuinely different entries — the same rule the
  // catalyst follows.
  let runeIds = [];
  if (runeMods && Object.keys(runeMods).length) {
    if (runeMods.damage)  damage *= runeMods.damage;
    if (runeMods.charges) charges = Math.max(1, Math.round(charges * runeMods.charges));
    if (runeMods.mana)    manaCost = Math.max(1, Math.round(manaCost * runeMods.mana));
    if (runeMods.radius)  radius += runeMods.radius;
    if (runeMods.speed)   speed *= runeMods.speed;
  }
  if (runeEffect) effect = { ...effect, ...runeEffect };
  if (runes?.length) {
    runeIds = runes.map(r => r.id);
    // Sorted so the id is stable regardless of the order the patterns
    // happened to match in — otherwise the same weave could produce two
    // different ids and read as two discoveries.
    name = `${name} · ${runes.map(r => r.name).join(' + ')}`;
  }

  return {
    // identity
    // ⚠️ The catalyst is part of the IDENTITY, not a stat modifier —
    // a catalysed spell is its own grimoire entry. This is what turns
    // a 55-cell matrix into a 55 × (1 + 22) space.
    id:   (fusionId ? `${fusionId}_${form}` : matrixId(element, form))
          + (catalystId ? `_${catalystId}` : '')
          + (runeIds.length ? `_${[...runeIds].sort().join('-')}` : ''),
    name, icon,
    // ⚠️ 'weave', not 'potion'. Potions are gone from this game
    // entirely — there is no cauldron, no brewing and no drinking. A
    // Weave is a bound thing you infuse into the wand (see
    // data/weaving.js). Anything still switching on 'potion' is dead
    // code from the old craft.
    type: 'weave',
    isSpell: true,
    tier: tierForPotency(potency),

    // essence identity
    element,
    secondaryElement: secondary,
    form,
    formName: formData.name,
    fusionId,
    catalystId,
    runeIds,

    // combat numbers
    damage: Math.round(damage),
    power,                    // scales Ward healing/shielding
    isWard: form === FORMS.WARD,
    charges,
    manaCost,
    radius,
    speed,
    color,
    effect,

    // brewing metadata (drives the Grimoire and re-brewing)
    potency:     Math.round(potency * 10) / 10,
    purity:      Math.round(purity * 100) / 100,
    instability: Math.round(instability * 100) / 100,

    description,
    spellType: form, // legacy field name kept for the projectile spawner
  };
}

/**
 * The "flat" identity of a matrix cell, with no brew quality applied.
 * Used by the Grimoire to show what a cell *is* once discovered.
 */
export function matrixEntry(element, form) {
  return buildSpell({ element, form, potency: 5, purity: 0.7, instability: 0 });
}
