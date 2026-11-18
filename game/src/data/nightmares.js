// ══════════════════════════════════════════════════════════
// THE FIRST NIGHTMARE — the trial that decides what you are
//
// Owner: *"First should be a trial to decide your innate powers, which
// is unique to everyone"*, *"each trial should be unique as well"*, and
// *"I need to randomly spawn on one of the big places... and then after
// getting out I spawn into the regular world."*
//
// This is the shape the whole opening now takes:
//
//   1. A new Pioneer does NOT begin in the Sanctuary. They wake inside
//      one of the realm's arrival regions (data/realm.js), alone.
//   2. A trial is generated FOR THEM — its kind, its adversary, its
//      terms and its name are all derived from their own seed, so no
//      two Pioneers are given the same one.
//   3. Surviving it grants an Aspect and a Flaw, likewise generated.
//      That pairing is the point: a power with no cost is loot, and
//      this is supposed to be what you ARE, not what you found.
//   4. Only then does the Waking Gate open, and the waking world —
//      the Sanctuary and everything around it — begins.
//
// ── ⚠️ EVERYTHING HERE IS DERIVED FROM ONE SEED ───────────
// The seed is the character's own (name + creation moment), stored on
// the save. Nothing is rolled at display time and nothing calls
// Math.random() in this file. That gives three properties the feature
// is worthless without:
//   · the same character always has the same First Nightmare, so it
//     can be re-entered, described, and reloaded;
//   · two characters made a second apart get different ones;
//   · a save can carry six bytes instead of a whole trial object.
// This is exactly the rule MemoryForge follows for Memories, and for
// the same reasons — see its header.
//
// ⚠️ COUNT THE OUTPUT, DO NOT READ IT. Every table below is indexed by
// a hash, and this project has shipped six correlated-modulus bugs
// (traps #3, #17). Any change here needs a counted sweep over a few
// thousand seeds showing the PAIRS are spread, not just the halves.
// ══════════════════════════════════════════════════════════

/**
 * FNV-1a with a murmur3 fmix32 finalizer.
 *
 * ⚠️ THE FINALIZER IS NOT OPTIONAL. Plain FNV leaves its low bits
 * weakly mixed, which is exactly the range every `% n` below reads —
 * trap #17 is a case in this codebase where two separately-salted
 * plain-FNV hashes stayed correlated and only 100 of 400 possible name
 * pairs ever occurred. Do not remove this and do not replace it with a
 * cheaper mix.
 */
export function nightmareHash(str) {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16; h = Math.imul(h, 2246822507);
  h ^= h >>> 13; h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A deterministic 0..1 stream from a seed — one call, one value. */
export function seededPick(seed, salt, n) {
  return nightmareHash(`${salt}:${seed}`) % n;
}

// ══════════════════════════════════════════════════════════
// TRIAL KINDS — what the Nightmare asks of you
//
// ⚠️ Each kind asks for a DIFFERENT VERB. A trial list where every
// entry is "kill N of X" with a different N is one trial with a
// difficulty slider, which is what this project's Descent trials were
// criticised for in §5. Endure, reach, hunt, gather and outlast are
// five genuinely different evenings.
//
// ⚠️ `leaning` is what surviving this way says about you, and it feeds
// the Aspect roll below — a Pioneer who outlasted something is not the
// same person as one who hunted it down. That coupling is the whole
// reason the reward can claim to be "yours".
// ══════════════════════════════════════════════════════════
export const TRIAL_KINDS = [
  {
    id: 'endure',
    verb: 'Endure',
    leaning: 'vitality',
    // ⚠️ `goal` is a COUNT whose meaning depends on the kind. It is
    // never a raw seconds/kills number in the save — NightmareSystem
    // scales it, so re-tuning difficulty never invalidates a save.
    // ⚠️ HALVED from [55,95]. Owner: *"the trials are too hard."*
    // 95 seconds of unbroken survival is a Descent wave, not a first
    // five minutes — and this is the ONE fight a Pioneer has before
    // they own anything.
    // ⚠️ Cut again, 28-45 -> 16-26. Owner: *"the starting battles are
    // too long, make it smaller."* This is the fight before the player
    // owns anything; it has to end while it is still tense.
    goalRange: [16, 26],
    line: (n) => `Stay alive for ${n} seconds. Nothing here is going to stop.`,
    progressLabel: 'survived',
  },
  {
    id: 'hunt',
    verb: 'Hunt',
    leaning: 'strength',
    // ⚠️ Reduced twice: [3,6] -> [2,3] -> [1,2].
    goalRange: [1, 2],
    line: (n) => `Put down ${n} of them. They will not be the last.`,
    progressLabel: 'felled',
  },
  {
    id: 'reach',
    verb: 'Reach',
    leaning: 'agility',
    goalRange: [1, 1],
    line: () => 'Get to the far marker. Do not stop to fight what follows.',
    progressLabel: 'reached',
  },
  {
    id: 'gather',
    verb: 'Gather',
    leaning: 'perception',
    goalRange: [2, 2],
    line: (n) => `Find ${n} shards of it before the dark closes.`,
    progressLabel: 'found',
  },
  {
    id: 'outlast',
    verb: 'Outlast',
    leaning: 'willpower',
    goalRange: [1, 1],
    line: () => 'Something in here is older than you. Be standing when it is not.',
    progressLabel: 'the Warden',
  },
];

// ── NAMING ────────────────────────────────────────────────
// ⚠️ Two independent tables crossed, giving 24 x 24 = 576 possible
// titles before the kind and region are even considered. A single
// table of 30 names would repeat inside a evening of testing.
const NIGHT_ADJ = [
  'Starving', 'Hollow', 'Patient', 'Drowned', 'Unlit', 'Wintering', 'Sundered',
  'Quiet', 'Bitter', 'Nameless', 'Buried', 'Weeping', 'Ninth', 'Cold',
  'Waking', 'Salted', 'Grieving', 'Last', 'Unspoken', 'Iron', 'Ashen',
  'Long', 'Blind', 'First',
];
const NIGHT_NOUN = [
  'Vigil', 'Hour', 'Tide', 'Reckoning', 'Verdict', 'Errand', 'Refusal',
  'Harvest', 'Debt', 'Answer', 'Wake', 'Mercy', 'Confession', 'Bargain',
  'Sentence', 'Homecoming', 'Winter', 'Tithe', 'Remainder', 'Silence',
  'Inheritance', 'Threshold', 'Crossing', 'Watch',
];

/** What the adversary of this Nightmare is called. */
const WARDEN_TITLE = [
  'the Thing That Waited', 'the Second Shape', 'the One Below',
  'the Patient Guest', 'the Unfed', 'the Hollow Warden',
  'the Shape in the Sand', 'the Drowned Keeper', 'the Long Untried',
  'the Last Tenant', 'the Quiet Host', 'the Unnamed Heir',
];

// ══════════════════════════════════════════════════════════
// INNATE POWER — the Aspect, and the Flaw that pays for it
//
// ⚠️ AN ASPECT ALWAYS COMES WITH A FLAW. Shadow Slave's whole
// bargain, and also this project's own rule for Memory grades — power
// that costs nothing is loot rather than a decision (data/memories.js
// header). A First Nightmare that only granted upside would make the
// opening a free stat handout.
//
// ⚠️ EVERY ASPECT'S `grant` KEY MUST BE READ SOMEWHERE. This project
// has shipped declared-but-inert grants at least four times (§7.9, the
// biome-flag pass, all 40 passive Aspects). Each key below is applied
// in NightmareSystem._applyInnate, and anything added here without a
// reader there is a lie the character sheet tells.
// ══════════════════════════════════════════════════════════
// ⚠️ EVERY ASPECT CARRIES AN `ability` — A THING YOU PRESS.
//
// Owner, after playing one: *"I don't have my aspects to fight them.
// They nearly one shot me."* Measured on a fresh trial and they were
// exactly right: **0 hotbar abilities**, no weapon Memory, an 18-atk
// wand, against nine enemies hitting for 21 each. The innate Aspect
// was a passive stat multiplier — nothing you could DO with it.
//
// "Innate power" that only edits a number is not a power the player
// experiences as theirs. Each Aspect now grants a real active on the
// number keys as well as its passive.
//
// ⚠️ EVERY ONE OF THESE DEALS DAMAGE OR CLEARS SPACE. Owner: *"the
// starting aspects are very shit, and they pose no effectiveness in
// battle."* The first set was utility — brace, step, knit, aegis: an
// i-frame, a dash, a heal and another i-frame. All useful to a player
// who already has a weapon and none of them any use to someone whose
// only other option is an 18-attack wand. A first power has to let you
// KILL something.
//
// ⚠️ `ability.key` MUST already have a branch in main.js's ASPECT_USED
// switch and a row in ASPECT_SHAPE_FOR. Every key below is an existing
// one, deliberately — inventing new keys here would put the game's
// very first ability on the `default` branch, which spends Essence and
// does nothing (§7.9's exact failure, on the worst possible ability).
export const INNATE_ASPECTS = [
  { key: 'unbroken',   name: 'Unbroken',    grant: { maxHpMult: 1.22 },
    line: 'You are harder to put down than you have any right to be. +22% vitality.',
    ability: { key: 'chorus', name: 'Refuse', cost: 8, cooldown: 7,
      line: 'Everything close enough to touch you takes it back, at once.' } },
  { key: 'quickened',  name: 'Quickened',   grant: { moveMult: 1.14 },
    line: 'Something in you never fully stopped running. +14% movement.',
    ability: { key: 'rush', name: 'Run Them Down', cost: 8, cooldown: 6,
      line: 'Cross the distance and open everything you passed through.' } },
  { key: 'hungering',  name: 'Hungering',   grant: { lifestealPct: 0.07 },
    line: 'What you kill feeds you. 7% of damage dealt returns.',
    ability: { key: 'rebuke', name: 'Take It Back', cost: 8, cooldown: 7,
      line: 'Throws off everything near you, and mends you for a share.' } },
  { key: 'sharpened',  name: 'Sharpened',   grant: { atkMult: 1.18 },
    line: 'Everything you swing lands heavier. +18% attack.',
    ability: { key: 'hew', name: 'Split Them', cost: 7, cooldown: 5,
      line: 'One overhead, straight down the middle.' } },
  { key: 'warded',     name: 'Warded',      grant: { defFlat: 26 },
    line: 'Something turns aside what reaches you. +26 defence.',
    ability: { key: 'sweep', name: 'Clear Ground', cost: 8, cooldown: 7,
      line: 'One turn on the spot. Everything around you goes back.' } },
  { key: 'deepwelled', name: 'Deep-Welled', grant: { maxMpMult: 1.35 },
    line: 'You hold far more than you should. +35% mana.',
    ability: { key: 'scatter', name: 'Loose It', cost: 9, cooldown: 6,
      line: 'Throws several of it at once, across everything ahead.' } },
  { key: 'tireless',   name: 'Tireless',    grant: { staminaRegenMult: 1.6 },
    line: 'Your wind comes back before it should. +60% stamina recovery.',
    ability: { key: 'cascade', name: 'Again And Again', cost: 8, cooldown: 6,
      line: 'Two falls, one after the other.' } },
  { key: 'kindled',    name: 'Kindled',     grant: { essenceMult: 1.30 },
    line: 'The Fracture answers you faster. +30% Essence gained.',
    ability: { key: 'bloom', name: 'Open Outward', cost: 9, cooldown: 7,
      line: 'It opens outward, and everything it reaches pays for it.' } },
];

export const INNATE_FLAWS = [
  { key: 'thinblooded', name: 'Thin-Blooded', grant: { maxHpMult: 0.88 },
    line: 'You bleed easily, and always have. −12% vitality.' },
  { key: 'heavyfooted', name: 'Heavy-Footed', grant: { moveMult: 0.91 },
    line: 'The ground asks more of you than of others. −9% movement.' },
  { key: 'dimmed',      name: 'Dimmed',      grant: { maxMpMult: 0.82 },
    line: 'The well in you is shallower. −18% mana.' },
  { key: 'brittle',     name: 'Brittle',     grant: { defFlat: -14 },
    line: 'Nothing you wear sits quite right. −14 defence.' },
  { key: 'slowtoanger', name: 'Slow to Anger', grant: { atkMult: 0.90 },
    line: 'You were never built for this. −10% attack.' },
  { key: 'shortwinded', name: 'Short-Winded', grant: { staminaRegenMult: 0.7 },
    line: 'You tire, and it shows. −30% stamina recovery.' },
];

/**
 * Generate a Pioneer's First Nightmare, whole, from their seed.
 *
 * ⚠️ THE ASPECT IS BIASED BY THE TRIAL, NOT DECIDED BY IT. The kind's
 * `leaning` shifts which Aspect is likely without pinning it, so
 * "I outlasted the Warden" tends toward endurance powers while still
 * allowing surprise. Pinning it would make the trial kind a menu and
 * collapse the space back to five outcomes.
 *
 * ⚠️ Aspect and Flaw are drawn with DIFFERENT SALTS from the finalised
 * hash. Trap #17 is precisely the case where two salted hashes of
 * near-identical strings stayed correlated and only a quarter of the
 * possible pairs ever occurred — verify by counting pairs, not halves.
 */
export function generateNightmare(seed, region) {
  const kindIdx = seededPick(seed, 'kind', TRIAL_KINDS.length);
  const kind = TRIAL_KINDS[kindIdx];

  const [lo, hi] = kind.goalRange;
  const span = Math.max(1, hi - lo + 1);
  const goal = lo + seededPick(seed, 'goal', span);

  const adj = NIGHT_ADJ[seededPick(seed, 'adj', NIGHT_ADJ.length)];
  const noun = NIGHT_NOUN[seededPick(seed, 'noun', NIGHT_NOUN.length)];
  const warden = WARDEN_TITLE[seededPick(seed, 'warden', WARDEN_TITLE.length)];

  // The lean nudges the aspect roll by rotating the index — a shift,
  // never a filter, so every Aspect stays reachable from every trial.
  const leanShift = ['strength', 'agility', 'vitality', 'perception', 'willpower']
    .indexOf(kind.leaning);
  const aspect = INNATE_ASPECTS[
    (seededPick(seed, 'aspect', INNATE_ASPECTS.length) + leanShift + INNATE_ASPECTS.length)
    % INNATE_ASPECTS.length];
  const flaw = INNATE_FLAWS[seededPick(seed, 'flaw', INNATE_FLAWS.length)];

  return {
    seed,
    kindId: kind.id,
    kind,
    goal,
    regionId: region?.id ?? null,
    regionName: region?.name ?? 'the Crucible',
    title: `The ${adj} ${noun}`,
    warden,
    aspect,
    flaw,
    line: kind.line(goal),
  };
}
