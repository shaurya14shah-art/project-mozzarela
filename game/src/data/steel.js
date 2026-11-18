// ══════════════════════════════════════════════════════════
// Steel — the combat revamp's rules as data
//
// Owner (grilling, 2026-10-05): the old fight was "too similar to Shadow
// Slave". Decided, in order:
//   · cut from combat: summoned Memories (G/H/J call-up), Aspect + Flaw at
//     birth, Essence fuel, Echoes / thralls
//   · the core is DIRECTIONAL WEAPON FIGHTING
//   · magic lives IN the weapon (a charge earned by fighting well, spent
//     on one empowered strike) plus RITUALS prepared before a fight
//   · input: a STANCE (high / mid / low) sets your guard and a default
//     combo — click alone always works; a mouse FLICK picks the side of
//     one swing (left / right / thrust); hold for a committed heavy
//   · defence: block guards your stance's plane; a last-instant block is
//     a DEFLECT; no invincible roll — you step out of the arc
//   · resources: Stamina, Balance, Wounds (by body region, bleeding
//     until bound) instead of one health bar
//   · beasts: a hand-designed rule per creature
//   · weapons: a family's reach / speed / arcs + one property; Z/X/C are
//     TECHNIQUES learned by fighting with that family
//   · growth: technique and steel — no XP levels, no stat inflation
//   · fights: humanoids in small turn-taking groups; beasts alone or
//     with a swarm
// systems/CombatSystem.js runs these rules.
// ══════════════════════════════════════════════════════════

export const PLANES = ['high', 'mid', 'low'];
export const SIDES = ['left', 'right', 'center'];

/**
 * An attack line = plane + side. `arc` is the FULL sweep in degrees,
 * `reach` is added to the family's reach, `wind` multiplies the windup.
 * `stroke` is the first-person choreography (rendering/Choreo.js's
 * language: `dir` is the direction the weapon travels across the screen).
 */
export const LINES = {
  'high-left':    { plane: 'high', side: 'left',   arc: 80,  reach: 0,    wind: 1.0,  name: 'falling cut from the left',  stroke: { k: 'cut', dir: 325, from: 118, to: -64 } },
  'high-right':   { plane: 'high', side: 'right',  arc: 80,  reach: 0,    wind: 1.0,  name: 'falling cut from the right', stroke: { k: 'cut', dir: 215, from: 118, to: -64 } },
  'high-center':  { plane: 'high', side: 'center', arc: 30,  reach: 0.1,  wind: 1.15, name: 'overhead',                   stroke: { k: 'cut', dir: 270, from: 160, to: -62, smash: true } },
  'mid-left':     { plane: 'mid',  side: 'left',   arc: 120, reach: 0,    wind: 0.95, name: 'flat cut from the left',     stroke: { k: 'cut', dir: 0,   from: 100, to: -90 } },
  'mid-right':    { plane: 'mid',  side: 'right',  arc: 120, reach: 0,    wind: 0.95, name: 'flat cut from the right',    stroke: { k: 'cut', dir: 180, from: 100, to: -90 } },
  'mid-center':   { plane: 'mid',  side: 'center', arc: 22,  reach: 0.45, wind: 0.85, name: 'thrust',                     stroke: { k: 'thrust', ext: 1.1 } },
  'low-left':     { plane: 'low',  side: 'left',   arc: 100, reach: -0.1, wind: 1.0,  name: 'low sweep from the left',    stroke: { k: 'cut', dir: 0,   from: 104, to: -100, low: 0.55 } },
  'low-right':    { plane: 'low',  side: 'right',  arc: 100, reach: -0.1, wind: 1.0,  name: 'low sweep from the right',   stroke: { k: 'cut', dir: 180, from: 104, to: -100, low: 0.55 } },
  'low-center':   { plane: 'low',  side: 'center', arc: 26,  reach: 0.3,  wind: 0.9,  name: 'low thrust',                 stroke: { k: 'thrust', ext: 1.05, aim: [0, -0.32] } },
};
export const lineId = (plane, side) => `${plane}-${side}`;

/** The default combo per stance: the side of each beat when you just click. */
export const STANCE_COMBO = {
  high: ['right', 'left', 'center'],
  mid:  ['right', 'left', 'center'],
  low:  ['left', 'right', 'center'],
};
export const STANCE_NAME = { high: 'High guard', mid: 'Middle guard', low: 'Low guard' };

/**
 * Weapon families. `reach` metres (melee), `speed` = swing time factor
 * (1 = a sword), `weight` 0..1 (stamina, balance damage, the feel),
 * `dmg` and `balance` multipliers, `hitsAll` = the arc strikes every body
 * in it (otherwise only the nearest), `property` = the one thing this
 * family does that no other does (CombatSystem implements each id).
 */
export const FAMILIES = {
  sword:      { name: 'Sword',      reach: 3.0, speed: 1.00, weight: 0.30, dmg: 1.00, balance: 1.0, hitsAll: false, property: 'riposte',
                propertyText: 'After a deflect your next cut comes at once and cuts deeper.',
                techniques: ['feint', 'halfsword', 'lunge'] },
  dagger:     { name: 'Dagger',     reach: 2.0, speed: 0.55, weight: 0.06, dmg: 0.70, balance: 0.5, hitsAll: false, property: 'slip',
                propertyText: 'Strikes into a back, a flank or a staggered body wound twice as deep.',
                techniques: ['flurry', 'sidestep', 'pommel'] },
  dualblades: { name: 'Paired blades', reach: 2.4, speed: 0.62, weight: 0.14, dmg: 0.55, balance: 0.6, hitsAll: false, property: 'flurry', hits: 2,
                propertyText: 'Every swing lands twice.',
                techniques: ['flurry', 'sweep', 'feint'] },
  axe:        { name: 'Axe',        reach: 2.8, speed: 1.20, weight: 0.62, dmg: 1.30, balance: 1.4, hitsAll: false, property: 'hook',
                propertyText: 'A blocked swing hooks the guard aside and leaves it open.',
                techniques: ['hook', 'leap', 'pommel'] },
  greatsword: { name: 'Greatsword', reach: 3.9, speed: 1.55, weight: 0.78, dmg: 1.60, balance: 1.7, hitsAll: true,  property: 'sweep',
                propertyText: 'Flat and low cuts strike everything in the arc.',
                techniques: ['sweep', 'leap', 'brace'] },
  warhammer:  { name: 'Hammer',     reach: 2.9, speed: 1.80, weight: 0.92, dmg: 1.90, balance: 2.4, hitsAll: false, property: 'crush',
                propertyText: 'A blocked blow still lands half its weight, and breaks armour and balance.',
                techniques: ['leap', 'pommel', 'brace'] },
  spear:      { name: 'Spear',      reach: 4.6, speed: 0.95, weight: 0.40, dmg: 1.10, balance: 1.0, hitsAll: false, property: 'keep',
                propertyText: 'A thrust that meets something closing in stops it dead.',
                techniques: ['lunge', 'sweep', 'hook'] },
  scythe:     { name: 'Scythe',     reach: 3.6, speed: 1.35, weight: 0.58, dmg: 1.20, balance: 1.1, hitsAll: true,  property: 'reap',
                propertyText: 'Wide arcs take everything in them; low cuts always bleed.',
                techniques: ['sweep', 'hook', 'lunge'] },
  staff:      { name: 'Quarterstaff', reach: 3.4, speed: 0.85, weight: 0.42, dmg: 0.85, balance: 1.5, hitsAll: false, property: 'ward',
                propertyText: 'Your guard covers your stance and the middle line too.',
                techniques: ['brace', 'sweep', 'pommel'] },
  // A tool, drawn with T (systems/GatherSystem.js) — swung like a short
  // hammer if you must fight with it.
  pickaxe:    { name: 'Pickaxe',    reach: 2.6, speed: 1.15, weight: 0.5, dmg: 0.6, balance: 1.2, hitsAll: false, property: 'crush',
                propertyText: 'A tool. It breaks stone; it will break a guard too, slowly.',
                techniques: ['kick', 'pommel', 'brace'] },
  bow:        { name: 'Bow',        reach: 34,  speed: 1.10, weight: 0.20, dmg: 1.25, balance: 0.6, hitsAll: false, property: 'loose', ranged: true,
                propertyText: 'A shaft at whatever you are looking at. Stance does not matter at range.',
                techniques: ['kick', 'sidestep', 'brace'] },
};
/** Item weaponType → family. The tome is swung like a short staff. */
export function familyOf(weaponType) {
  if (!weaponType) return 'sword';
  if (weaponType === 'grimoire' || weaponType === 'focus' || weaponType === 'wand') return 'staff';
  return FAMILIES[weaponType] ? weaponType : 'sword';
}

/**
 * Techniques — learned by landing blows with a family (practice), not
 * bought. `learn` = landed hits needed with THAT family. `kind` is the
 * implementation archetype in CombatSystem._technique().
 */
export const TECHNIQUES = {
  feint:     { name: 'Feint',        kind: 'feint',     stamina: 10, cd: 4,   learn: 12,  text: 'Start a cut and pull it. A guard that follows it is open on the other line for a moment.' },
  halfsword: { name: 'Half-sword',   kind: 'halfsword', stamina: 16, cd: 6,   learn: 40,  text: 'Grip the blade and drive the point. Goes through a guard and through armour.' },
  lunge:     { name: 'Lunge',        kind: 'lunge',     stamina: 18, cd: 5,   learn: 25,  text: 'Close two strides in one and thrust at the end of it.' },
  flurry:    { name: 'Flurry',       kind: 'flurry',    stamina: 20, cd: 6,   learn: 15,  text: 'Three quick cuts on the same line.' },
  sidestep:  { name: 'Slip',         kind: 'sidestep',  stamina: 12, cd: 3,   learn: 30,  text: 'Step round to their flank in one move.' },
  pommel:    { name: 'Pommel strike', kind: 'pommel',   stamina: 12, cd: 5,   learn: 20,  text: 'A short, ugly blow that breaks balance and knocks a guard open.' },
  hook:      { name: 'Hook',         kind: 'hook',      stamina: 14, cd: 5,   learn: 18,  text: 'Catch their weapon or their leg and drag it out of line.' },
  leap:      { name: 'Leaping blow', kind: 'leap',      stamina: 26, cd: 8,   learn: 45,  text: 'Jump into a falling strike. Heavy on balance.' },
  sweep:     { name: 'Wheel',        kind: 'sweep',     stamina: 24, cd: 7,   learn: 30,  text: 'Turn a full circle with the weapon out. Everything around you.' },
  brace:     { name: 'Brace',        kind: 'brace',     stamina: 10, cd: 6,   learn: 22,  text: 'For a moment your guard covers every line and deflects come easier.' },
  kick:      { name: 'Kick',         kind: 'kick',      stamina: 10, cd: 3,   learn: 0,   text: 'Shove them off you with a boot. Breaks balance.' },
};

// ── Wounds ───────────────────────────────────────────────

export const REGIONS = {
  head:  { name: 'head' },
  torso: { name: 'body' },
  armL:  { name: 'off arm' },
  armR:  { name: 'sword arm' },
  legs:  { name: 'legs' },
};
/** Where a line lands on a body facing it. */
export function regionFor(plane, side) {
  if (plane === 'low') return 'legs';
  if (plane === 'high') return side === 'center' ? 'head' : (side === 'left' ? 'armR' : 'armL');
  return side === 'center' ? 'torso' : (side === 'left' ? 'armR' : 'torso');
}
/** Severity by share of max blood the hit took. `bleed` = blood/s until bound. */
export const SEVERITY = [
  { id: 'graze', below: 0.07, bleed: 0,    name: 'graze' },
  { id: 'cut',   below: 0.18, bleed: 0.45, name: 'cut' },
  { id: 'deep',  below: 9,    bleed: 1.25, name: 'deep wound' },
];

// ── Beasts: one rule per creature (owner: "mix by creature") ──
//
// Every non-humanoid gets a hand-designed rule instead of a guard.
// CombatSystem.beastFactor() reads `rule` and the creature's state.
// `planes` = the lines its attacks come on (what you must guard).
export const BEASTS = {
  slime:         { rule: 'core',     planes: ['low', 'mid'],          balance: 60,
                   tell: 'Cuts pass through it. Only a thrust reaches the core.' },
  spider:        { rule: 'forelegs', planes: ['high', 'low'],         balance: 110, swarm: { count: 3, scale: 0.38 },
                   tell: 'Its forelegs guard its face. Take the legs low, or hit its back after it strikes.' },
  ice_elemental: { rule: 'shards',   planes: ['mid', 'high'],         balance: 120, shards: 6,
                   tell: 'Shards turn a blade. Break them — blunt weapons break two — then strike the core.' },
  dragon:        { rule: 'throat',   planes: ['high', 'mid', 'low'],  balance: 260,
                   tell: 'Scale turns most blows. When it rears to strike, the throat is open to a thrust.' },
  sandworm:      { rule: 'maw',      planes: ['high'],                balance: 180,
                   tell: 'Plated everywhere but the mouth, and the mouth is only open when it strikes.' },
  golem:         { rule: 'balance',  planes: ['high', 'mid'],         balance: 240,
                   tell: 'It barely feels a cut. Break its balance, then it breaks.' },
  wraith:        { rule: 'veiled',   planes: ['mid', 'high'],         balance: 80,
                   tell: 'Steel passes through it unless it is striking, or you have just turned it aside.' },
  // ── The world expansion's creatures (data/expansion.js) ──
  // Wildlife: no guard, no rule — read the body and the line.
  deer: { rule: null, planes: ['mid'], balance: 50 },
  elk: { rule: null, planes: ['mid', 'high'], balance: 120 },
  goat: { rule: null, planes: ['mid'], balance: 60 },
  boar: { rule: null, planes: ['low', 'mid'], balance: 110 },
  antelope: { rule: null, planes: ['mid'], balance: 45 },
  strider: { rule: null, planes: ['high'], balance: 60 },
  wolf: { rule: null, planes: ['low', 'mid'], balance: 70 },
  bear: { rule: null, planes: ['high', 'mid'], balance: 220 },
  jackal: { rule: null, planes: ['low'], balance: 50 },
  gator: { rule: null, planes: ['low'], balance: 160 },
  lynx: { rule: null, planes: ['high', 'mid'], balance: 70 },
  karst_stalker: { rule: null, planes: ['high', 'mid'], balance: 120 },
  cinder_salamander: { rule: null, planes: ['low', 'mid'], balance: 110 },
  cave_grub: { rule: null, planes: ['low'], balance: 30 },
  blind_crawler: { rule: null, planes: ['low', 'mid'], balance: 120,
                   tell: 'It is blind. It hears a sprint and a fight, not a careful step.' },
  rust_crawler: { rule: 'plates', planes: ['low', 'mid'], balance: 140,
                  tell: 'Plated on top. A low cut takes its legs, a hammer cracks the plates, a thrust finds the seams.' },
  bog_horror: { rule: 'rooted', planes: ['mid', 'high'], balance: 200,
                tell: 'It cannot move from where it is rooted. Its arms reach far — cut them, then get close.' },
  wisp: { rule: 'veiled', planes: ['mid', 'high'], balance: 40,
          tell: 'Steel passes through a wisp unless it is striking — or your blade carries fire, frost or storm.' },
  obsidian_sentinel: { rule: 'brittle', planes: ['high', 'mid'], balance: 180,
                       tell: 'Glass. Light cuts skate off it; a heavy blow or a hammer shatters it.' },
};
/** Humanoids read by stance (everything not in BEASTS). */
export const isBeast = (typeId) => !!BEASTS[typeId];

// ── Rituals: prepared before a fight (owner: "mix of 1 and 3") ──
export const RITUALS = {
  oil_ember:   { name: 'Ember Oil',    kind: 'oil',     element: 'fire',      time: 2.0, lasts: 150, text: 'Anoint the blade. Its charge bursts as fire, and its cuts burn.' },
  oil_rime:    { name: 'Rime Oil',     kind: 'oil',     element: 'ice',       time: 2.0, lasts: 150, text: 'Anoint the blade. Its charge bursts as frost, and its cuts slow.' },
  oil_storm:   { name: 'Storm Oil',    kind: 'oil',     element: 'lightning', time: 2.0, lasts: 150, text: 'Anoint the blade. Its charge bursts as lightning and leaps to another.' },
  chalk_ward:  { name: 'Chalk Ward',   kind: 'ward',    hits: 3,              time: 3.0,             text: 'Draw the ward on your skin. The next three wounds are only scratches.' },
  draught_iron:{ name: 'Iron Draught', kind: 'draught', heal: 45, stopBleed: true, time: 1.4,        text: 'Bitter. Stops the bleeding and puts back some blood.' },
  draught_wind:{ name: 'Wind Draught', kind: 'draught', stamina: 1.6, lasts: 90,   time: 1.2,        text: 'Your wind comes back faster for a while.' },
};

/** Practice needed per body trait step, and the cap. */
export const TRAITS = {
  grip:    { name: 'Grip',    per: 12,  step: 4, cap: 40, text: 'Blocks and deflects harden your hold: more balance.' },
  wind:    { name: 'Wind',    per: 260, step: 3, cap: 45, text: 'Stamina spent in fights deepens your wind.' },
  footing: { name: 'Footing', per: 10,  step: 0.06, cap: 0.6, text: 'Steps that carry you out of a blow steady you: balance returns faster.' },
};
