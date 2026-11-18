// ══════════════════════════════════════════════════════════
// Memories — the Shadow Slave power system, end to end
//
// ── THE BRIEF ─────────────────────────────────────────────
// Owner: replace weaving outright. The Loom no longer brews a spell —
// it FORGES A MEMORY: a weapon, a charm, an echo, whatever. Each drawn
// sign carries a specific declared property. The game names the
// Memory, invents its abilities, and a Memory's GRADE decides how many
// abilities it gets. Cores raise the grade; further signs enchant it.
//
// ── WHAT IS ACTUALLY LOAD-BEARING IN SHADOW SLAVE ─────────
// Four things, and all four are here:
//
//  1. **A Memory is a named thing with a fixed number of Aspects.**
//     Grade decides the COUNT, not the power. A Common with one
//     ability and an Epic with three are different objects, not the
//     same object scaled — which is why grade is the headline number
//     and why ascending is the goal.
//  2. **Attributes are a small closed set.** Strength, Vitality,
//     Agility, Perception, Willpower. Everything else is expressed
//     through them, so a build is legible.
//  3. **The name is earned, not chosen.** Memories arrive already
//     called something, and that name is the thing players remember.
//  4. **Flaws.** Real power carries a real cost, declared out loud.
//     A Memory with only upside is loot; a Memory with a Flaw is a
//     decision. This is the half most adaptations drop.
//
// ⚠️ ORIGINAL VOCABULARY. §2 of the handoff is explicit: no borrowed
// proper nouns. There is no Sunny, no Nightmare Spell, no Sleeper here
// and there must not be. The STRUCTURE is borrowed; the words stay
// this world's — Memories, Descents, the Fracture, essence, signs.
// "Memory" was already this project's word (SpoilsSystem), which is
// why the fit is close enough to be worth taking.
// ══════════════════════════════════════════════════════════

// ── THE FIVE ATTRIBUTES ───────────────────────────────────
// ⚠️ A CLOSED SET. Every property a sign can carry resolves into one
// of these five, and nothing may add a sixth without a deliberate
// decision — the moment attributes become an open list, a Memory's
// readout becomes stat soup and the player can no longer compare two
// of them at a glance. That legibility is the whole point.
export const ATTRIBUTES = {
  strength:   { id: 'strength',   name: 'Strength',   blurb: 'what it hits for',        short: 'STR' },
  agility:    { id: 'agility',    name: 'Agility',    blurb: 'how fast it comes round', short: 'AGI' },
  vitality:   { id: 'vitality',   name: 'Vitality',   blurb: 'what it keeps in you',    short: 'VIT' },
  perception: { id: 'perception', name: 'Perception', blurb: 'what it notices',         short: 'PER' },
  willpower:  { id: 'willpower',  name: 'Willpower',  blurb: 'what it refuses',         short: 'WIL' },
};
export const ATTRIBUTE_IDS = Object.keys(ATTRIBUTES);

// ── SIGN → PROPERTY ───────────────────────────────────────
// ⚠️ THE DECLARED MAPPING the owner asked for: "each weaving sign must
// be assigned a specific property".
//
// ── ⚠️ WHY THIS IS A CLASSIFIER AND NOT A LOOKUP ──────────
// The first version keyed on the signature's DOMINANT TURN CODE —
// five codes, five attributes, total and one-to-one, and completely
// unusable. `dominant` is the mode of a turn histogram: it is not
// anything a player can see, aim at, or learn. Measured on deliberate
// gestures, "a gentle right arc", "a gentle left arc" and "a zigzag
// hard right" ALL came back as the same property. A mapping you
// cannot intend is not a mapping, it is a die roll with extra steps.
//
// So the property is classified from the qualities of the stroke a
// player can actually control and SEE while drawing:
//
//   close the shape            → Vitality    (it holds something in)
//   keep it straight           → Strength    (it goes through)
//   coil it clockwise          → Agility     (it slips round)
//   coil it anticlockwise      → Willpower   (drawn against the grain)
//   make it jagged / erratic   → Perception  (it finds the seam)
//
// Every one of those is a sentence a player can act on, which is the
// entire test this table has to pass.
//
// ⚠️ ORDER IS THE RULE. `classifySign` takes the FIRST match, so
// closure beats straightness beats handedness. Reordering these
// silently re-points every sign in the game.
//
// ⚠️ HANDEDNESS IS VERIFIED, NOT ASSUMED. `chirality > 0` is
// **clockwise on screen**. Established by shoelace on the actual
// hexToPixel coordinates (SVG y grows downward, so a positive
// shoelace is clockwise): a chirality of +1 measured shoelace +4505
// = clockwise, −1 measured −4505 = anticlockwise. The axial-coordinate
// winding runs opposite to most people's mental model, so if you are
// about to "fix" the two coil rules because they look swapped —
// re-run that measurement first. The rule TEXT below is player-facing
// instruction; if it disagrees with the code the whole mapping stops
// being teachable, which is the failure this table was written to
// escape.
export const SIGN_PROPERTIES = [
  {
    id: 'ring',
    attribute: 'vitality',
    name: 'The Ring',
    verb: 'endures',
    rule: 'Close the shape — end where you began.',
    blurb: 'A closed sign holds what it catches. Nothing it takes gets out.',
    // ⚠️ Widened from bare `closed`. Requiring the path to end on the
    // EXACT starting dot made Vitality 3.8% of strokes — a fifth of
    // the attribute space, nearly unreachable by accident and fiddly
    // on purpose. A strongly-wound stroke is closing whether or not it
    // lands on the dot.
    test: g => !!g.closed || Math.abs(g.winding ?? 0) >= 0.8,
  },
  {
    id: 'straight',
    attribute: 'strength',
    name: 'The Straight',
    verb: 'commits',
    rule: 'Draw it straight, or nearly.',
    blurb: 'A gesture that never really turns. It goes through.',
    test: g => (g.focus ?? 0) >= 0.55 || Math.abs(g.winding ?? 0) < 0.12,
  },
  {
    id: 'broken',
    attribute: 'perception',
    name: 'The Broken',
    verb: 'sharpens',
    rule: 'Change your mind often — jagged, never settled.',
    blurb: 'A sign that keeps turning differently. It finds the seam.',
    test: g => (g.entropy ?? 0) >= 0.66,
  },
  {
    id: 'slip',
    attribute: 'agility',
    name: 'The Slip',
    verb: 'quickens',
    rule: 'Coil it clockwise.',
    blurb: 'Wound to the right. It barely loses speed doing it.',
    test: g => (g.chirality ?? 0) > 0.12,
  },
  {
    id: 'refusal',
    attribute: 'willpower',
    name: 'The Refusal',
    verb: 'holds',
    rule: 'Coil it anticlockwise.',
    blurb: 'Wound against the grain, which is the harder way round.',
    test: g => (g.chirality ?? 0) < -0.12,
  },
  {
    // ⚠️ Total fallback. Every legal stroke must resolve to SOMETHING
    // — a sign that classifies to nothing would forge a Memory with a
    // missing attribute and no error.
    id: 'wander',
    attribute: 'perception',
    name: 'The Wandering',
    verb: 'searches',
    rule: 'Anything that commits to nothing in particular.',
    blurb: 'It never decided what it was. That is its own kind of seeing.',
    test: () => true,
  },
];

/** The property a stroke's geometry signs. Never returns null. */
export function classifySign(geometry) {
  const g = geometry || {};
  return SIGN_PROPERTIES.find(p => p.test(g)) || SIGN_PROPERTIES[SIGN_PROPERTIES.length - 1];
}

// ── THE SECOND AXIS: TEMPER ───────────────────────────────
// ⚠️ Without this, a sign carried FIVE attributes x six magnitudes —
// thirty possible contributions in the whole game — and the ability it
// produced was chosen by hashing the recipe, not by what was drawn. So
// two completely different shapes with the same attribute gave the
// same thing, and no shape could be aimed at an ABILITY. That is the
// whole of "the runes are very limited" and "weaving doesn't yield an
// effective outcome": the craft had one meaningful axis.
//
// Temper is a second, independent read of the SAME stroke, taken from
// the geometry the property classifier does not use. Together they
// give 5 x 6 x 6 = 180 distinct sign contributions, and — far more
// importantly — the temper SELECTS the ability family, so a player can
// draw at a specific power rather than rolling for it.
//
// ⚠️ Ordered most-specific first, same `find` rule as SIGN_PROPERTIES.
export const SIGN_TEMPERS = [
  // ⚠️ ORDER IS THE RULE, and this order is the result of measuring
  // DELIBERATE strokes, not random ones. The distribution can look
  // perfectly healthy while the table is still unaimable:
  //
  //   · `enduring` tested first caught every STRAIGHT line, because a
  //     straight signature ("wwwww") is trivially a palindrome — so
  //     "draw it straight" produced Enduring, not Piercing.
  //   · `vast` (length) tested before `erratic` caught every long
  //     jagged stroke, so "keep changing your turn" produced Vast.
  //
  // Both were found by drawing the six intended shapes and checking
  // each landed on its own temper — which is the only test that
  // matters, since the whole point is that a player can AIM.
  //
  // ⚠️ Re-run BOTH checks after any change here: the six deliberate
  // shapes must each hit their own temper, AND no temper may fall
  // below ~5% across a random sweep. Passing one is not passing.
  {
    id: 'piercing', name: 'Piercing', family: 'pierce',
    rule: 'Give it one long unbroken run — three or more without turning.',
    blurb: 'A stroke that commits to a single line arrives all at once.',
    test: g => (g.focus ?? 0) >= 0.34,
  },
  {
    id: 'erratic', name: 'Erratic', family: 'spread',
    rule: 'Keep changing the kind of turn you make.',
    blurb: 'A sign that never repeats itself lands in several places.',
    test: g => (g.entropy ?? 0) >= 0.55,
  },
  {
    id: 'enduring', name: 'Enduring', family: 'ward',
    rule: 'Draw it symmetrical — the same forwards and backwards.',
    blurb: 'A sign that reads the same either way holds rather than pushes.',
    // ⚠️ `!focus` guard: without it every straight line is symmetric
    // and this rule steals Piercing's entire shape.
    test: g => !!g.symmetric && (g.focus ?? 0) < 0.34,
  },
  {
    id: 'driving', name: 'Driving', family: 'move',
    rule: 'Wind it hard in one direction and do not let up.',
    blurb: 'A stroke with a strong hand behind it carries you with it.',
    test: g => Math.abs(g.chirality ?? 0) >= 0.62,
  },
  {
    id: 'vast', name: 'Vast', family: 'spread',
    rule: 'Make it long. Use most of the field.',
    blurb: 'A sign that covers ground makes what it signs cover ground.',
    test: g => (g.length ?? 0) >= 0.32,
  },
  {
    id: 'plain', name: 'Plain', family: 'strike',
    rule: 'Anything short and unremarkable.',
    blurb: 'A small sign, doing one ordinary thing well.',
    test: () => true,
  },
];

/** The temper a stroke carries. Never returns null. */
export function classifyTemper(geometry) {
  const g = geometry || {};
  return SIGN_TEMPERS.find(t => t.test(g)) || SIGN_TEMPERS[SIGN_TEMPERS.length - 1];
}

// ── GRADES ────────────────────────────────────────────────
// ⚠️ `abilities` is the headline. Grade decides HOW MANY Aspects a
// Memory carries, and that is the difference between grades — not a
// damage multiplier. This is the mechanic the owner meant by "the
// weapon's level must give the different no. of things", and it is the
// single most important line in this file.
//
// ⚠️ Ordered LOW → HIGH and `level` IS the index. Code indexes by
// level and steps by +1 to ascend; re-ordering this array silently
// re-grades every Memory in existence.
export const MEMORY_GRADES = [
  { id: 'flawed',  name: 'Flawed',  level: 0, abilities: 1, attrPoints: 3,  color: 0x6d6459, potency: 0.70, flaws: 1 },
  { id: 'common',  name: 'Common',  level: 1, abilities: 1, attrPoints: 6,  color: 0x9aa0a4, potency: 1.00, flaws: 0 },
  { id: 'rare',    name: 'Rare',    level: 2, abilities: 2, attrPoints: 10, color: 0x3f7fbf, potency: 1.35, flaws: 0 },
  { id: 'epic',    name: 'Epic',    level: 3, abilities: 3, attrPoints: 15, color: 0x8a4fd0, potency: 1.80, flaws: 0 },
  { id: 'legend',  name: 'Legend',  level: 4, abilities: 4, attrPoints: 21, color: 0xd08a2a, potency: 2.40, flaws: 1 },
  { id: 'myth',    name: 'Myth',    level: 5, abilities: 5, attrPoints: 28, color: 0xc0392b, potency: 3.20, flaws: 1 },
  { id: 'divine',  name: 'Divine',  level: 6, abilities: 6, attrPoints: 36, color: 0xf0e0a0, potency: 4.20, flaws: 2 },
];

export function gradeByLevel(level) {
  return MEMORY_GRADES[Math.max(0, Math.min(MEMORY_GRADES.length - 1, level))];
}
export function gradeById(id) {
  return MEMORY_GRADES.find(g => g.id === id) || MEMORY_GRADES[1];
}

// ⚠️ Flawed and the three top grades carry FLAWS. Flawed because it is
// broken; Legend upward because power that costs nothing is loot
// rather than a decision. See FLAWS below — this is the half of the
// borrowed system most adaptations quietly drop, and it is the half
// that makes a Memory memorable.

// ── FORMS ─────────────────────────────────────────────────
// What you are actually forging. Each form decides which attribute it
// leans on, how it is used, and which ability pool it draws from.
export const MEMORY_FORMS = {
  weapon: {
    id: 'weapon', name: 'Weapon', icon: '⚔️',
    blurb: 'Held, swung, and answerable for it.',
    lead: 'strength',
    // Forged Memories of this form are REAL equippable weapons — they
    // carry weaponType and stats.attack, so Player.equipWeapon and the
    // whole EntityForge silhouette table work on them unchanged.
    equips: 'weapon',
    pool: 'strike',
  },
  charm: {
    id: 'charm', name: 'Charm', icon: '🔮',
    blurb: 'Carried. It does its work whether you attend to it or not.',
    lead: 'vitality',
    equips: 'passive',
    pool: 'ward',
  },
  echo: {
    id: 'echo', name: 'Thrall', icon: '👤',
    blurb: 'Something that comes when called, and goes back after.',
    lead: 'willpower',
    equips: 'bindable',
    pool: 'call',
  },
  raiment: {
    id: 'raiment', name: 'Raiment', icon: '🧥',
    blurb: 'Worn. It decides what reaches you.',
    lead: 'vitality',
    equips: 'armor',
    pool: 'ward',
  },
  relic: {
    id: 'relic', name: 'Relic', icon: '🕯️',
    blurb: 'Neither weapon nor armour. It changes the terms.',
    lead: 'perception',
    equips: 'bindable',
    pool: 'shift',
  },
};
export const FORM_IDS = Object.keys(MEMORY_FORMS);

// ── ABILITY POOLS ─────────────────────────────────────────
// The generator picks from the pool its FORM names, then colours the
// result by the sign's attribute and the Memory's element. Each entry
// is a template, not a finished ability — see makeAbility().
//
// ⚠️ Every template must be legible as ONE promise. "No stat soup" is
// the rule the Ascent's grants and the Memory Powers already follow;
// an ability that does four things cannot be remembered or planned
// around, and this system generates too many of them for any of them
// to be worth reading twice.
// ⚠️ `active` DECIDES WHETHER IT TAKES A HOTBAR KEY.
//
// An Aspect is either something you DO (active — it gets a number key
// 1..9 and costs Essence) or something that is simply true about you
// while the Memory is equipped (passive — it never appears on the bar).
// Owner's rule: "only for active attacks, the passive ones aren't on
// the hotbar."
//
// ⚠️ The split is declared per template, never inferred from the pool
// or the wording. "Cleave" and "Step" are both verbs; only one of them
// is a button. Getting this wrong either buries a usable power where
// nobody will find it, or fills the bar with things that cannot be
// pressed.
//
// ⚠️ `cost` is Essence (systems/CoreSystem.js), not mana. Mana fuels
// Weaves; Essence fuels a Memory's Aspects. Passive Aspects have no
// cost because there is no moment at which they are paid for.
export const ABILITY_POOLS = {
  strike: [
    { key: 'cleave',   verb: 'Cleave',   active: false, line: 'Strikes carry through to everything behind the first thing.' },
    { key: 'rend',     verb: 'Rend',     active: false, line: 'Wounds it opens keep bleeding for {dur}s.' },
    { key: 'surge',    verb: 'Surge',    active: false, line: 'Every third strike lands for {mult}x.' },
    { key: 'reach',    verb: 'Reach',    active: false, line: 'It is longer than it looks. +{pct}% reach.' },
    { key: 'drink',    verb: 'Drink',    active: false, line: 'Returns {pct}% of what it deals.' },
    { key: 'quicken',  verb: 'Quicken',  active: false, line: 'Comes back round {pct}% faster.' },
    { key: 'shatter',  verb: 'Shatter',  active: false, line: 'Ignores {pct}% of what it hits through.' },
    { key: 'brand',    verb: 'Brand',    active: false, line: 'What it strikes burns for {dur}s.' },
    // The strike pool's active options — a weapon should be able to DO
    // something, not only modify what you were doing anyway.
    { key: 'hew',      verb: 'Hew',      active: true, cost: 14, cooldown: 6,
      line: 'A single overhead that lands for {mult}x and staggers.' },
    { key: 'sweep',    verb: 'Sweep',    active: true, cost: 18, cooldown: 9,
      line: 'One turn on the spot. Everything within {n}m takes {pct}% and is thrown back.' },
    { key: 'lunge',    verb: 'Lunge',    active: true, cost: 12, cooldown: 7,
      line: 'Close {n}m instantly and strike on arrival for {mult}x.' },
    // ── Added in the "unique attacks" pass ──
    // ⚠️ The strike family had 3 actives against 8 passives, and the
    // whole game had only 15 actives. With five Memories equipped that
    // is a duplicate by the pigeonhole principle long before it is bad
    // luck. Every key below has a branch in main.js's ASPECT_USED
    // switch AND a row in ASPECT_SHAPE_FOR, added in the same commit
    // (trap #26).
    { key: 'gore',     verb: 'Gore',     active: true, cost: 16, cooldown: 9,
      line: 'Drives through everything in a {n}m line for {mult}x.' },
    { key: 'pommel',   verb: 'Pommel',   active: true, cost: 9, cooldown: 5,
      line: 'Very close, very hard. {mult}x to whatever is on top of you.' },
    { key: 'cascade',  verb: 'Cascade',  active: true, cost: 19, cooldown: 12,
      line: 'Two falls, one after the other, {mult}x each.' },
    { key: 'hone',     verb: 'Hone',     active: false, line: 'Critical hits carry a further {pct}%.' },
    { key: 'weight',   verb: 'Weight',   active: false, line: 'What it hits is staggered for {dur}s.' },
  ],
  ward: [
    { key: 'bulwark',  verb: 'Bulwark',  active: false, line: 'Takes {pct}% less from anything you see coming.' },
    { key: 'second',   verb: 'Second Breath', active: false, line: 'Once per {dur}s, a killing blow leaves you at one.' },
    { key: 'mend',     verb: 'Mend',     active: false, line: 'Closes {n} vitality every second you are not struck.' },
    { key: 'refuse',   verb: 'Refusal',  active: false, line: 'The first hit of any fight is halved.' },
    { key: 'steady',   verb: 'Steady',   active: false, line: 'Cannot be staggered below {pct}% health.' },
    { key: 'kindle',   verb: 'Kindle',   active: false, line: 'Being struck adds {n} to your next strike.' },
    { key: 'brace',    verb: 'Brace',    active: true, cost: 16, cooldown: 14,
      line: 'Take {pct}% less from everything for {dur}s.' },
    { key: 'knit',     verb: 'Knit',     active: true, cost: 22, cooldown: 20,
      line: 'Close {pct}% of your vitality at once.' },
    { key: 'aegis',    verb: 'Aegis',    active: true, cost: 18, cooldown: 14,
      line: 'Nothing reaches you for {dur}s.' },
    { key: 'rebuke',   verb: 'Rebuke',   active: true, cost: 17, cooldown: 10,
      line: 'Throws back everything within {n}m for {mult}x, and mends you for a share.' },
    { key: 'anchor',   verb: 'Anchor',   active: true, cost: 14, cooldown: 13,
      line: 'Set. {pct}% of your vitality returns and you cannot be moved.' },
    { key: 'tide',     verb: 'Tide',     active: false, line: 'Vitality returns on its own, {pct}% slower than a wound opens.' },
    { key: 'husk',     verb: 'Husk',     active: false, line: 'The first blow after a rest is halved.' },
  ],
  call: [
    { key: 'summon',   verb: 'Call',     active: true, cost: 25, cooldown: 24,
      line: 'Calls what is bound in it for {dur}s.' },
    { key: 'swarm',    verb: 'Swarm',    active: true, cost: 30, cooldown: 30,
      line: 'It comes back with {n} of them.' },
    { key: 'tether',   verb: 'Tether',   active: false, line: 'What it calls heals you for {pct}% of what it deals.' },
    { key: 'linger',   verb: 'Linger',   active: false, line: 'What it calls stays {pct}% longer.' },
    { key: 'echo',     verb: 'Second Voice', active: false, line: 'A second, quieter one answers with it.' },
    { key: 'chime',    verb: 'Chime',    active: true, cost: 21, cooldown: 15,
      line: 'A note that everything within {n}m feels, for {mult}x.' },
    { key: 'hollow',   verb: 'Hollowing',active: true, cost: 23, cooldown: 18,
      line: 'Opens a way {n}m ahead. Whatever stands in it is drawn thin.' },
    { key: 'kinship',  verb: 'Kinship',  active: false, line: 'What it calls hits {pct}% harder while you are near it.' },
    { key: 'vigil',    verb: 'Vigil',    active: false, line: 'What it calls keeps watch — you cannot be surprised.' },
  ],
  // ── Families the TEMPERS select ──
  // ⚠️ Every `family` named in SIGN_TEMPERS must exist here or
  // _makeAbility falls back and the temper does nothing.
  pierce: [
    { key: 'pierce',   verb: 'Pierce',   active: false, line: 'Ignores {pct}% of armour on a single target.' },
    { key: 'skewer',   verb: 'Skewer',   active: true, cost: 15, cooldown: 8,
      line: 'One thrust down a line, {mult}x to everything on it.' },
    { key: 'punch',    verb: 'Punch-Through', active: false, line: 'Critical strikes deal a further {pct}%.' },
    { key: 'aim',      verb: 'Aim',      active: false, line: '+{pct}% critical chance.' },
    // ⚠️ `pierce` held FOUR templates of which exactly ONE was active,
    // so every Memory this family selected and every forced-active
    // slot collapsed onto `skewer` — measured at 328 of 540 actives
    // (61%) across 900 forges, and the opening active of essentially
    // every non-weapon Memory. One active in a family is not a pool.
    { key: 'thread',   verb: 'Thread',   active: true, cost: 14, cooldown: 9,
      line: 'A fine line {n}m long. Everything on it, {mult}x.' },
    { key: 'nail',     verb: 'Nail',     active: true, cost: 16, cooldown: 10,
      line: 'One thing, straight through, for {mult}x.' },
    { key: 'sever',    verb: 'Sever',    active: true, cost: 18, cooldown: 12,
      line: 'Opens what it passes. {mult}x, and it keeps bleeding for {dur}s.' },
    { key: 'hairline', verb: 'Hairline', active: false, line: 'Finds the seam. +{pct}% against anything armoured.' },
    { key: 'seek',     verb: 'Seek',     active: false, line: 'It does not miss what it has already hit once.' },
  ],
  spread: [
    { key: 'spread',   verb: 'Spread',   active: false, line: 'Strikes splash to everything within {n}m.' },
    { key: 'scatter',  verb: 'Scatter',  active: true, cost: 20, cooldown: 11,
      line: 'Throws {n} of it at once, {pct}% each.' },
    { key: 'wither',   verb: 'Wither',   active: false, line: 'Everything you strike is slowed {pct}% for {dur}s.' },
    { key: 'chorus',   verb: 'Chorus',   active: true, cost: 26, cooldown: 16,
      line: 'Everything within {n}m takes {mult}x at once.' },
    { key: 'bloom',    verb: 'Bloom',    active: true, cost: 22, cooldown: 14,
      line: 'Opens outward to {n}m, {mult}x to everything it reaches.' },
    { key: 'fan',      verb: 'Fan',      active: true, cost: 19, cooldown: 11,
      line: 'Three lines at once, {pct}% each.' },
    { key: 'contagion',verb: 'Contagion',active: false, line: 'What you burn spreads it to whatever stands too close.' },
    { key: 'ripple',   verb: 'Ripple',   active: false, line: 'Every hit reaches {pct}% further than the last.' },
  ],
  move: [
    { key: 'carry',    verb: 'Carry',    active: false, line: 'You move {pct}% faster holding it.' },
    { key: 'charge',   verb: 'Charge',   active: true, cost: 13, cooldown: 7,
      line: 'Drive {n}m forward through anything, {mult}x on contact.' },
    { key: 'follow',   verb: 'Follow-Through', active: false, line: 'Each hit adds {pct}% to the next, up to three.' },
    { key: 'vault',    verb: 'Vault',    active: true, cost: 11, cooldown: 6,
      line: 'Throw yourself {n}m clear of where you were.' },
    { key: 'slip',     verb: 'Slip',     active: true, cost: 8, cooldown: 5,
      line: 'Out from under it — {n}m back, untouchable on the way.' },
    { key: 'blink',    verb: 'Blink',    active: true, cost: 15, cooldown: 9,
      line: 'Arrive {n}m on and take {mult}x out of whatever is there.' },
    { key: 'rush',     verb: 'Rush',     active: true, cost: 17, cooldown: 10,
      line: 'Cross {n}m and open everything you passed for {mult}x.' },
    { key: 'glide',    verb: 'Glide',    active: false, line: 'You fall slower, and land without paying for it.' },
    { key: 'sure',     verb: 'Sure-Footed', active: false, line: 'Nothing you stand on slows you.' },
  ],
  shift: [
    { key: 'step',     verb: 'Step',     active: true, cost: 10, cooldown: 5,
      line: 'Move {n} paces without crossing the ground between.' },
    { key: 'unseen',   verb: 'Unseen',   active: true, cost: 20, cooldown: 22,
      line: 'Nothing looks at you for {dur}s.' },
    { key: 'still',    verb: 'Stillness',active: true, cost: 24, cooldown: 26,
      line: 'Everything near you slows by {pct}% for {dur}s.' },
    { key: 'read',     verb: 'Reading',  active: false, line: 'You see what a thing is made of, and what it fears.' },
    { key: 'ledger',   verb: 'The Ledger', active: false, line: 'Records the last thing that hurt you. It hurts it back.' },
    { key: 'mirror',   verb: 'Mirror',   active: true, cost: 16, cooldown: 13,
      line: 'Something that looks like you stays behind for {dur}s.' },
    { key: 'unmake',   verb: 'Unmake',   active: true, cost: 27, cooldown: 20,
      line: 'Everything within {n}m is taken apart for {mult}x.' },
    { key: 'blur',     verb: 'Blur',     active: false, line: '{pct}% of what is aimed at you passes through.' },
    { key: 'omen',     verb: 'Omen',     active: false, line: 'You know a moment before it happens.' },
  ],
};

// ── FLAWS ─────────────────────────────────────────────────
// ⚠️ Real, and applied. A Flaw that is only flavour text is a lie the
// readout tells; each of these resolves to an actual modifier in
// MemoryForge.
export const FLAWS = [
  { key: 'hungry',  name: 'Hungry',   line: 'It takes {pct}% of your maximum vitality and does not give it back.', mod: { maxHpMult: 0.9 } },
  { key: 'heavy',   name: 'Heavy',    line: 'You are {pct}% slower carrying it.',                                   mod: { speedMult: 0.9 } },
  { key: 'loud',    name: 'Loud',     line: 'Everything hears you coming. Aggro range +{pct}%.',                    mod: { aggroMult: 1.3 } },
  { key: 'brittle', name: 'Brittle',  line: 'Its charges run out {pct}% faster.',                                   mod: { chargeMult: 0.75 } },
  { key: 'costly',  name: 'Costly',   line: 'Everything you cast costs {pct}% more while it is on you.',            mod: { manaMult: 1.25 } },
  { key: 'blind',   name: 'Half-Blind', line: 'You cannot read what you are fighting while it is drawn.',           mod: { noTargetRead: true } },
];

// ══════════════════════════════════════════════════════════
// NAMING
//
// ⚠️ DETERMINISTIC, never random at display time. A Memory's name is
// derived from its own finished contents, so the same Memory is always
// called the same thing — and two Memories that differ in any way get
// different names. A name re-rolled on each render is not a name.
//
// Built to read like the source material: a noun-of-noun construction,
// occasionally with an epithet. "The Ninth Silence", "Vow of the
// Drowned Hour", "Sixteen Teeth".
// ══════════════════════════════════════════════════════════

// ⚠️ THE NAME SPACE MUST BE LARGE, and it is measured, not assumed.
// The first version had 16 words per slot and used only two
// constructions below Legend — a space of 16x16 + 16x16 = 512. Across
// 3,000 forges that produced 509 distinct names: near-perfect coverage
// of a space far too small, i.e. an 83% collision rate. Memories are
// generated constantly, and two unrelated ones sharing a name destroys
// the one thing this system is really selling.
//
// 24 words per slot, four constructions available at every grade, plus
// an ordinal on the grandest: measured below at well over 20,000
// distinct names. Count whole names across a wide sweep after any
// change here — per-slot counts will look healthy either way.
const NAME_ADJ = [
  'Drowned', 'Ninth', 'Hollow', 'Patient', 'Starving', 'Quiet', 'Last', 'Bitter',
  'Sundered', 'Unspoken', 'Wintering', 'Grieving', 'Iron', 'Ashen', 'Unlit', 'Waking',
  'Salted', 'Nameless', 'Buried', 'Cold', 'Long', 'First', 'Weeping', 'Blind',
];
const NAME_NOUN = [
  'Silence', 'Hour', 'Vow', 'Verdict', 'Tooth', 'Errand', 'Refusal', 'Tide',
  'Argument', 'Inheritance', 'Harvest', 'Vigil', 'Reckoning', 'Debt', 'Answer', 'Wake',
  'Mercy', 'Confession', 'Bargain', 'Sentence', 'Homecoming', 'Winter', 'Tithe', 'Remainder',
];
const NAME_SHAPE = [
  'Blade', 'Fang', 'Crown', 'Thread', 'Lantern', 'Mirror', 'Chain', 'Key',
  'Coat', 'Bell', 'Shard', 'Mask', 'Nail', 'Wing', 'Coin', 'Hymn',
  'Needle', 'Cage', 'Hook', 'Veil', 'Ledger', 'Rope', 'Shroud', 'Compass',
];
/** Ordinals for the grandest construction. Widens the space again. */
const NAME_ORDINAL = [
  'First', 'Second', 'Third', 'Fifth', 'Seventh', 'Ninth', 'Twelfth', 'Last',
];

/** murmur3 fmix32 — see runes.js/lineages.js for why this is required. */
function _fmix32(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16; return h >>> 0;
}
function _hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return _fmix32(h);
}

/**
 * Name a Memory from its own contents.
 *
 * ⚠️ Each index comes from a SEPARATELY SALTED hash, and the salting
 * is only safe because `_hash` ends in an avalanche finalizer. Plain
 * FNV leaves its low bits correlated between near-identical strings,
 * and the last time this project took two indices that way it produced
 * **25% of its possible name pairs** while every per-slot count looked
 * healthy (HANDOFF trap #17). Verify by counting whole names across a
 * wide sweep, never one slot at a time.
 */
export function nameMemory(seed, form, gradeLevel) {
  const s = String(seed);
  const a = NAME_ADJ[_hash('adj:' + s) % NAME_ADJ.length];
  const n = NAME_NOUN[_hash('noun:' + s) % NAME_NOUN.length];
  const shape = NAME_SHAPE[_hash('shape:' + s) % NAME_SHAPE.length];
  const ord = NAME_ORDINAL[_hash('ord:' + s) % NAME_ORDINAL.length];

  // ⚠️ Four constructions at EVERY grade — the old version restricted
  // low grades to two, which is most of where the collisions came
  // from. Grade still shows: the two grander forms are weighted toward
  // high grades, so a Divine Memory reads like one.
  // ⚠️ EVERY construction uses THREE word slots. The previous version
  // had three of its four styles on two slots (24x24 = 576 each), and
  // those small pools dominated the collision rate no matter how large
  // the fourth was — measured effective space ~4,000 against a
  // theoretical 15,552. All four are 3-slot now (24^3 = 13,824 each),
  // which is also closer to how the source material actually names
  // things: "Blade of the Drowned Reckoning", not "Bitter Chain".
  const style = _hash('style:' + s) % 4;
  const grand = gradeLevel >= 4;

  switch (style) {
    case 0:  return grand ? `The ${ord} ${a} ${shape}` : `${a} ${shape} of ${n}`;
    case 1:  return `${shape} of the ${a} ${n}`;
    case 2:  return grand ? `${ord} ${shape} of the ${n}` : `${a} ${n} of the ${shape}`;
    default: return grand ? `${a} ${shape} of the ${ord} ${n}` : `${shape} of the ${a} ${n}`;
  }
}

/** Name one ability, from the template and what fed it. */
/**
 * Name one Aspect.
 *
 * ⚠️ NEVER RETURNS A BARE VERB, and that is the whole change. The old
 * `style === 0` branch returned `template.verb` unadorned, so a THIRD
 * of every Aspect in the game carried no distinguishing text at all —
 * two Memories that rolled `sweep` both read "Sweep", identically, in
 * the hotbar, the satchel and the bindings panel. The owner reported
 * this as a hotbar showing "QUAKE / QUAKE / QUAKE": three real
 * Memories, three separate cooldowns, three rows that could not be
 * told apart.
 *
 * ⚠️ The `seed` passed in is `${memorySeed}:${index}` — unique per
 * Memory AND per slot — so every branch below varies between two
 * Memories even when they rolled the same template with the same
 * attribute. Uniqueness comes from the seed, and the attribute is
 * there because the owner asked for it ("if they have different
 * attributes name them different"), not because it is sufficient on
 * its own: two warhammers CAN share an attribute.
 *
 * ⚠️ The verb always survives somewhere in the name. It is the word
 * that says what the thing does, and burying it to guarantee
 * uniqueness would trade one unreadable hotbar for another.
 */
export function nameAbility(template, attrId, seed) {
  const attr = ATTRIBUTES[attrId];
  const attrName = attr ? attr.name : 'the Sign';
  const a = NAME_ADJ[_hash('ab:' + seed) % NAME_ADJ.length];
  const n = NAME_NOUN[_hash('abn:' + seed) % NAME_NOUN.length];
  switch (_hash('abs:' + seed) % 4) {
    case 0:  return `${a} ${template.verb}`;
    case 1:  return `${template.verb} of ${attrName}`;
    case 2:  return `${a} ${template.verb} of ${attrName}`;
    default: return `${template.verb} of the ${n}`;
  }
}

export { _hash as memoryHash };

// ══════════════════════════════════════════════════════════
// WEAPON CHARACTER — what a TYPE does differently in the hand
//
// ── WHY THIS EXISTS ───────────────────────────────────────
// Owner: "the type of attacks are just a few from the same pool, it
// should be unique per weapon."
//
// Measured across 600 forges before this existed:
//   · 11 weapon types, and the type had **ZERO** influence on which
//     abilities a weapon rolled — a bow and a warhammer drew from the
//     identical pool.
//   · Only **14 distinct active sets** in 600 weapons. `skewer` alone
//     was 225 of them (37.5%); `skewer` + `brace` covered 433.
//   · Only **8 of the game's 15 actives** ever appeared on a weapon at
//     all. `charge`, `vault`, `step`, `unseen`, `still`, `summon` and
//     `swarm` were unreachable from a weapon by construction.
// And every one of the eleven silhouettes swung the same 130° arc at
// the same 3.7m for the same damage — HANDOFF §7's open item #11.
//
// Two things fix that, and they are deliberately separate:
//
//   MELEE  — how the type swings (range, arc, speed, hits, ranged?).
//            This is the *feel*, and it applies to every weapon of
//            that type equally.
//   SIGNATURE — one active Aspect ONLY that type can roll. This is
//            the *identity*, and it is what makes a scythe worth
//            forging over a sword.
//
// ⚠️ Keyed by `weaponPlanKey()`'s normalised lowercase form — the same
// key `WEAPON_PLANS` uses in EntityForge. NOT by display name. Trap
// #11 is the entire reason this table and that one must agree, and
// they are verified against each other by a test that walks both.
// ══════════════════════════════════════════════════════════

/**
 * ⚠️ `arcDeg` is the FULL swing width, not the half-angle. main.js
 * converts it to a half-angle cosine itself — passing a half-angle
 * here would silently double every weapon's reach around the sides.
 */
export const WEAPON_MELEE = {
  dagger:     { range: 2.0, arcDeg:  70, mult: 0.72, speed: 0.44, hits: 2, note: 'Two quick cuts, close and narrow.' },
  sword:      { range: 3.0, arcDeg: 120, mult: 1.00, speed: 1.00, hits: 1, note: 'The balanced middle. Everything else is measured against it.' },
  dualblades: { range: 2.4, arcDeg: 150, mult: 0.62, speed: 0.52, hits: 3, note: 'Three strikes a swing, wide and shallow.' },
  axe:        { range: 2.8, arcDeg:  95, mult: 1.35, speed: 1.25, hits: 1, note: 'Heavier and slower than a sword, and it bites.' },
  greatsword: { range: 3.9, arcDeg: 165, mult: 1.70, speed: 1.65, hits: 1, note: 'Enormous reach, enormous commitment.' },
  warhammer:  { range: 2.9, arcDeg:  80, mult: 2.05, speed: 1.95, hits: 1, note: 'Slowest thing you can hold. It does not care what armour you had.' },
  spear:      { range: 4.6, arcDeg:  45, mult: 1.15, speed: 0.95, hits: 1, note: 'Reach nothing else has, in a line nothing else is.' },
  scythe:     { range: 3.6, arcDeg: 200, mult: 1.25, speed: 1.40, hits: 1, note: 'It comes round behind you. Everything in the circle.' },
  // ── The three that do NOT swing ──
  // ⚠️ `ranged` weapons never run the melee arc at all; main.js fires a
  // projectile through the wand's own spawn path instead. A bow that
  // swings is worse than no bow (HANDOFF §7.11).
  bow:        { range: 34, arcDeg: 0, mult: 1.30, speed: 1.15, hits: 1, ranged: true, speedMps: 46, note: 'A shaft, at whatever you are looking at.' },
  staff:      { range: 26, arcDeg: 0, mult: 1.05, speed: 0.85, hits: 1, ranged: true, speedMps: 30, note: 'A bolt of what it is made of.' },
  grimoire:   { range: 24, arcDeg: 0, mult: 1.45, speed: 1.45, hits: 1, ranged: true, speedMps: 24, note: 'It reads a line aloud and something answers.' },
};

/** Every weapon type this game knows how to fight with. */
export const WEAPON_TYPE_IDS = Object.keys(WEAPON_MELEE);

/**
 * The one active Aspect a given weapon type — and ONLY that type —
 * can roll.
 *
 * ⚠️ These keys must NOT collide with any key in ABILITY_POOLS. A
 * duplicate key would make `used.add(ab.key)` reject the wrong one and
 * the signature would silently never appear. Verified by a test that
 * intersects the two key sets.
 *
 * ⚠️ Every key here needs a branch in main.js's ASPECT_USED handler in
 * the same commit — the `default` branch warns, but the player just
 * sees Essence vanish. That is trap #26, and it cost five dead
 * abilities the last time.
 */
export const WEAPON_SIGNATURE = {
  dagger:     { key: 'gutter',  verb: 'Gutting Run', cost: 12, cooldown: 7,
                line: 'Three cuts inside a breath. {mult}x each, and they bleed.' },
  sword:      { key: 'riposte', verb: 'Riposte',     cost: 13, cooldown: 8,
                line: 'Turn the next blow aside and answer it for {mult}x.' },
  dualblades: { key: 'whirl',   verb: 'Whirlwind',   cost: 18, cooldown: 11,
                line: 'Everything within {n}m, {mult}x, twice around.' },
  axe:        { key: 'maim',    verb: 'Maiming Blow', cost: 15, cooldown: 9,
                line: 'One deep cut. {mult}x, and it keeps opening for {dur}s.' },
  greatsword: { key: 'sunder',  verb: 'Sunder',      cost: 20, cooldown: 12,
                line: 'A single overhead through everything in front. {mult}x.' },
  warhammer:  { key: 'quake',   verb: 'Quake',       cost: 22, cooldown: 14,
                line: 'Put it in the ground. Everything within {n}m is thrown down.' },
  spear:      { key: 'impale',  verb: 'Impale',      cost: 14, cooldown: 8,
                line: 'Drive it the full length. {mult}x to everything on the line.' },
  scythe:     { key: 'reap',    verb: 'Reap',        cost: 19, cooldown: 12,
                line: 'It takes a share of what it cuts. {mult}x, and you keep {pct}%.' },
  bow:        { key: 'volley',  verb: 'Volley',      cost: 17, cooldown: 10,
                line: '{n} shafts at once, {pct}% each.' },
  staff:      { key: 'conduit', verb: 'Conduit',     cost: 16, cooldown: 10,
                line: 'A beam down the line of aim, {mult}x, and it does not stop.' },
  grimoire:   { key: 'verse',   verb: 'Spoken Verse', cost: 21, cooldown: 13,
                line: 'Read it aloud. {mult}x where you are looking, and it spreads {n}m.' },
};
