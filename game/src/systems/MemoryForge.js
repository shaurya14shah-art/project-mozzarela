// ══════════════════════════════════════════════════════════
// The Memory Forge — what the Loom does now
//
// Three verbs, and they are deliberately different operations rather
// than one "craft" with flags:
//
//   forge(form, cores, signs)     make a new Memory
//   ascend(memory, cores)         raise its GRADE — which is to say,
//                                 give it another Aspect
//   enchant(memory, signs)        add a property to one that exists
//
// ── ⚠️ GRADE IS A COUNT, NOT A MULTIPLIER ─────────────────
// The whole borrowed system rests on this. Ascending does not make a
// Memory hit harder — it gives it ANOTHER ABILITY. A Rare with two
// Aspects and an Epic with three are different objects. If a future
// session is tempted to make ascension a damage number because that
// is easier to balance: don't. Read data/memories.js's header first.
//
// ── ⚠️ EVERYTHING IS DERIVED FROM A SEED ──────────────────
// A Memory's name, its abilities and its flaws all come from a
// deterministic hash of what actually went into it. Two identical
// forges produce identical Memories; changing one sign changes the
// name. Nothing is rolled at display time, so a Memory cannot
// re-name itself on a re-render — which is the difference between a
// name and a label.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';
import { threadSystem } from './ThreadSystem.js';
import { epithetSystem } from './EpithetSystem.js';
import {
  ATTRIBUTES, ATTRIBUTE_IDS, MEMORY_GRADES, MEMORY_FORMS,
  ABILITY_POOLS, FLAWS, gradeByLevel, nameMemory, nameAbility, memoryHash,
  classifySign, classifyTemper,
  WEAPON_MELEE, WEAPON_SIGNATURE, WEAPON_TYPE_IDS,
} from '../data/memories.js';
// Runic Sorcery — runes are LETTERS, an inscription is a sentence.
// See data/runic.js for what the source actually says.
import { runeForGeometry, readInscription } from '../data/runic.js';
// The Facet Grammar — how an active weapon skill is made, named and
// numbered (motion × trait × element × attribute × magnitude).
import { composeFacet, SIGNATURE_MOTION } from '../data/facets.js';

/**
 * Motion ids already held, read from composed keys (`f_<motion>_<trait>`).
 * ⚠️ Motion ids contain underscores; the trait is the LAST segment.
 */
function heldMotions(avoid) {
  const out = new Set();
  if (avoid) for (const k of avoid) if (typeof k === 'string' && k.startsWith('f_')) out.add(k.slice(2, k.lastIndexOf('_')));
  return out;
}

/**
 * A verb rune's meaning, as an ability family.
 *
 * ⚠️ Every `verb` value in RUNE_LEXICON must appear here or the
 * sentence parses, reads correctly to the player, and then silently
 * falls back to the temper's family — which is the worst outcome,
 * because the readout would promise something the Memory does not do.
 */
const VERB_FAMILY = {
  strike: 'strike',
  ward:   'ward',
  move:   'move',
  drain:  'pierce',
  mend:   'ward',
};

/** Cores raise grade. How much each core is worth, by its own tier. */
const CORE_WEIGHT = { common: 1, uncommon: 2, rare: 4, epic: 7, legendary: 11 };

class MemoryForge {
  constructor() {
    this._forged = 0;
  }

  // ── READING THE SIGNS ───────────────────────────────────

  /**
   * What a single sign contributes.
   *
   * ⚠️ Classified from the stroke's own controllable qualities
   * (closure, straightness, handedness, erraticness) — see
   * SIGN_PROPERTIES for why a lookup on `dominant` was unusable.
   * NOT on the rune's display name, which is derived text and would
   * make renaming a rune silently re-point its property.
   */
  readSign(rune) {
    const g = rune?.geometry;
    if (!g) return null;
    // ⚠️ Classified from qualities the player can SEE and AIM AT, not
    // looked up on the turn-histogram mode. See SIGN_PROPERTIES.
    const prop = classifySign(g);
    const temper = classifyTemper(g);
    // ⚠️ THE RUNE ITSELF — the letter this stroke inscribes. Property
    // and temper still supply the attribute and the ability family
    // (they are measured and teachable and there is no reason to throw
    // that away), but the LETTER is what the player is actually
    // writing, and a sequence of letters is read as a sentence by
    // readInscription(). See data/runic.js.
    const letter = runeForGeometry(g);

    // Magnitude comes from how MUCH of the shape is that gesture and
    // how committed the stroke was. A long stroke that is 90% one turn
    // is a strong statement; a short scribble is not.
    const commitment = (g.domShare ?? 0.5) * 0.6 + (g.length ?? 0) * 0.4;
    const magnitude = 1 + Math.round(commitment * 5);   // 1..6

    return {
      runeId: rune.id,
      runeName: rune.name,
      // ⚠️ The rune's own attribute WINS where it has one — the letter
      // is the thing being written, and its meaning should decide what
      // the inscription is about.
      attribute: letter.attr || prop.attribute,
      property: prop,
      temper,
      letter,
      magnitude,
      // Carried through so ability generation can vary by shape.
      closed: !!g.closed,
      symmetric: !!g.symmetric,
      focus: g.focus ?? 0,
      entropy: g.entropy ?? 0,
      chirality: g.chirality ?? 0,
      sig: g.sig,
    };
  }

  /** Fold a list of drawn runes into attribute totals. */
  readSigns(runes) {
    const reads = (runes || []).map(r => this.readSign(r)).filter(Boolean);
    const attrs = {};
    for (const id of ATTRIBUTE_IDS) attrs[id] = 0;
    for (const r of reads) attrs[r.attribute] += r.magnitude;
    // ⚠️ The sequence read as a SENTENCE, in order. This is what makes
    // the same runes in a different order a different enchantment.
    const inscription = readInscription(reads.map(r => r.letter));
    return { reads, attrs, inscription };
  }

  /** What an inscription reads as, for the UI. Never throws. */
  inscriptionOf(runes) {
    return this.readSigns(runes).inscription;
  }

  // ── GRADE ───────────────────────────────────────────────

  /**
   * What grade a set of cores buys.
   *
   * ⚠️ Cores are the ONLY thing that sets grade. Signs decide what a
   * Memory *is*; cores decide how many Aspects it can hold. Letting
   * signs raise grade too would collapse the two decisions into one
   * and the player would simply always draw more.
   */
  gradeFor(cores) {
    let weight = 0;
    for (const c of (cores || [])) {
      const tierId = (c.tier?.id || c.tier?.name || 'common').toLowerCase();
      weight += CORE_WEIGHT[tierId] ?? 1;
    }
    // 0 cores → Flawed. Each threshold is one more Aspect.
    const level = weight <= 0 ? 0
                : weight < 3 ? 1
                : weight < 7 ? 2
                : weight < 13 ? 3
                : weight < 22 ? 4
                : weight < 34 ? 5
                : 6;
    return { grade: gradeByLevel(level), weight };
  }

  // ── FORGING ─────────────────────────────────────────────

  /**
   * Make a Memory.
   *
   * @param {string} formId  weapon | charm | echo | raiment | relic
   * @param {Array}  cores   inventory items spent to set the grade
   * @param {Array}  runes   the signs drawn over it
   * @param {string} element dominant element of the cores
   */
  /**
   * Forge a new Memory.
   *
   * ⚠️ `avoid` is a SET OF ABILITY KEYS the caller would rather not
   * see again — in practice the keys already carried by Memories the
   * player owns (`MemoryForge.ownedAbilityKeys()`). It is the direct
   * answer to "each thing has unique attacks": without it, nothing
   * anywhere stopped two Memories rolling the same Aspect, because
   * `used` only ever deduplicated WITHIN one Memory.
   *
   * ⚠️ IT IS OPTIONAL, AND OMITTING IT KEEPS `forge()` PURE. That
   * matters: the seed is the RECIPE, and "same form + same signs +
   * same cores always produces the same Memory" is a rule this file's
   * header rests on. Passing `avoid` deliberately relaxes that rule
   * for the ability slots ONLY — name, grade, attributes, weapon type
   * and every number still come from the seed alone, so a Memory
   * forged twice is still recognisably the same Memory. It is a
   * PREFERENCE, not a filter (see `_makeAbility`), so it can never
   * shorten a Memory below its grade.
   */
  forge(formId, cores, runes, element = 'neutral', avoid = null) {
    const form = MEMORY_FORMS[formId] || MEMORY_FORMS.weapon;
    const { reads, attrs, inscription } = this.readSigns(runes);
    if (!reads.length) {
      return { ok: false, reason: 'A Remnant needs at least one sign. Draw one.' };
    }

    const { grade, weight } = this.gradeFor(cores);

    // ⚠️ The seed is the RECIPE, not a counter. Same form + same signs
    // + same cores must always produce the same Memory, or the name
    // stops being a property of the thing and becomes a property of
    // when you happened to make it.
    const seed = [
      form.id, element, grade.id,
      reads.map(r => r.sig).join('|'),
      (cores || []).map(c => c.id).sort().join(','),
    ].join('::');

    const memory = this._assemble({ form, grade, element, reads, attrs, seed, coreWeight: weight, inscription, avoid });
    this._forged++;
    eventBus.emit(Events.MEMORY_FORGED, memory);
    return { ok: true, memory };
  }

  /**
   * Build the finished object. Shared by forge() and ascend() so a
   * Memory that gains a grade is rebuilt through exactly the same path
   * it was created through — the alternative (patching abilities onto
   * an existing object) is how the two drift apart.
   */
  _assemble({ form, grade, element, reads, attrs, seed, coreWeight, keepName = null, inscription = null, avoid = null }) {
    // ⚠️ Re-read if the caller did not supply one (ascend/enchant come
    // in through rebuilt `reads`), so a Memory never loses its sentence.
    const insc = inscription || readInscription(reads.map(r => r.letter).filter(Boolean));
    const name = keepName || nameMemory(seed, form, grade.level);

    // ── Attribute points ──
    // The grade's budget, distributed by what the signs asked for.
    const asked = ATTRIBUTE_IDS.reduce((s, id) => s + attrs[id], 0) || 1;
    const finalAttrs = {};
    for (const id of ATTRIBUTE_IDS) {
      finalAttrs[id] = Math.round((attrs[id] / asked) * grade.attrPoints);
    }
    // The form's own lead attribute always gets something, so a
    // Weapon is never a Weapon with zero Strength.
    finalAttrs[form.lead] = Math.max(finalAttrs[form.lead], Math.ceil(grade.attrPoints * 0.15));

    // ── Abilities: GRADE decides the count ──
    const pool = ABILITY_POOLS[form.pool] || ABILITY_POOLS.strike;
    const abilities = [];
    const used = new Set();

    // ⚠️ THE WEAPON TYPE IS RESOLVED HERE, BEFORE THE ABILITIES.
    // It used to be computed down in the object literal, purely as a
    // silhouette lookup — which is exactly why the type had no say in
    // what the weapon could DO. Resolving it first lets its signature
    // Aspect be injected below.
    const weaponType = form.equips === 'weapon'
      ? this._weaponTypeFor(seed, finalAttrs, avoid)
      : undefined;
    // ⚠️ Long Memory (a Thread) grants ONE more Aspect than the grade
    // allows. Pulled at the moment of forging rather than pushed into
    // this system — see ThreadSystem.grant(). This is a ceiling
    // change, not a rate change: it does not make forging faster, it
    // makes the best possible Memory strictly better than anyone
    // without the Thread can make.
    const bonusAspect = threadSystem.grant('extraAspect') ? 1 : 0;
    // ⚠️ The Hollow-Handed's `forgeLuck`. Read HERE, at the one place
    // the Aspect count is decided, because a grant nothing reads is
    // worse than no grant — the panel reports it as applied. Rolled
    // per forge rather than added flatly, so it stays a piece of luck
    // rather than a permanent grade bump (grade is a COUNT, and the
    // count is the whole borrowed system).
    const luck = epithetSystem.grant('forgeLuck', 0);
    const luckyAspect = (luck > 0 && Math.random() < luck) ? 1 : 0;
    const aspectCount = Math.min(pool.length, grade.abilities + bonusAspect + luckyAspect);
    for (let i = 0; i < aspectCount; i++) {
      // Each Aspect is fed by one sign, cycling if there are fewer
      // signs than Aspects — so which signs you drew genuinely decides
      // which abilities appear.
      const src = reads[i % reads.length];
      // ⚠️ THE SIGN CHOOSES THE POOL. The form supplies a default, but
      // a sign's temper overrides it — that is the entire mechanism by
      // which drawing a particular shape produces a particular power
      // rather than a hashed one.
      // ⚠️ THE VERB WINS. A well-formed inscription does what it SAYS —
      // that is the whole point of a grammar. The temper's family is
      // the fallback for a sentence the Spell could not parse.
      const verbFamily = VERB_FAMILY[insc?.verb?.verb] || null;
      const tempered = (insc?.ok && verbFamily && ABILITY_POOLS[verbFamily])
        || ABILITY_POOLS[src.temper?.family] || pool;
      // ⚠️ A WEAPON'S — AND AN ECHO'S — FIRST ASPECT IS ALWAYS ACTIVE.
      // The pools are mostly passive by design (a weapon should mainly
      // change how you already fight), but that meant a Memory could
      // roll all-passive and reach the hotbar with nothing on it —
      // observed live: an Epic weapon with "0 active · 3 passive" and
      // an empty bar. A weapon you cannot press a key for is not a
      // weapon in a game whose bar is keys 1..9.
      //
      // ⚠️ Echo joined this guarantee for the identical reason, one
      // form later. The `call` pool is 2 active / 3 passive (`Call`,
      // `Swarm` vs `Tether`, `Linger`, `Second Voice`) — so an
      // unforced Echo had roughly a 3-in-5 chance, at the common
      // one-Aspect grades, of rolling ENTIRELY passive. That Echo then
      // contributed nothing to `loadout.bindables()`: no hotbar key,
      // no row in the Bindings (V) panel, nothing to press or
      // rebind — "I can't bind it, it isn't in the list" was this,
      // not a missing UI section. A summon you cannot direct is a
      // decoration, not a companion.
      const forceActive = i === 0 && (form.equips === 'weapon' || form.id === 'echo');

      // ⚠️ A WEAPON'S FIRST ASPECT IS ITS TYPE'S SIGNATURE.
      // This is the whole of "it should be unique per weapon". Before
      // this, the type decided only the silhouette, so a warhammer and
      // a bow rolled from one shared pool and 37.5% of every weapon in
      // the game opened with `skewer`. Now a scythe always reaps, a
      // bow always volleys, and the eleven types are eleven different
      // things to hold rather than eleven models over one moveset.
      //
      // It REPLACES the forced-active slot rather than adding to it,
      // so grade still decides the Aspect COUNT (data/memories.js's
      // one load-bearing rule) — a weapon does not get a free Aspect
      // for being a weapon.
      if (i === 0 && weaponType && WEAPON_SIGNATURE[weaponType]) {
        const sigAb = this._signatureAbility(weaponType, src, seed, element);
        if (sigAb) { abilities.push(sigAb); used.add(sigAb.key); continue; }
      }

      const ab = this._makeAbility(tempered, src, seed, i, used, element, forceActive, avoid, weaponType, verbFamily);
      if (ab) { abilities.push(ab); used.add(ab.key); }
    }

    // ── Flaws ──
    const flaws = [];
    for (let i = 0; i < (grade.flaws || 0); i++) {
      const f = FLAWS[memoryHash(`flaw:${seed}:${i}`) % FLAWS.length];
      if (!flaws.some(x => x.key === f.key)) {
        flaws.push({ ...f, line: this._fill(f.line, { pct: 10 + i * 5 }) });
      }
    }

    // ⚠️ Legibility is REWARDED, not merely flavoured. A sentence the
    // Spell can read does what it says and does it fully; one it
    // cannot still works — the source is clear that runes move energy
    // regardless — but at a real discount. Otherwise grammar is
    // decoration and the player has no reason to learn it.
    const legible = insc?.ok ? 1 : 0.72;
    // ⚠️ MOOD IS MECHANICAL. An imperative (opening on a verb) commits
    // harder — more power, fewer qualifiers' worth of control. A
    // statement (opening on a subject) is steadier. Without this the
    // two moods would read differently and play identically, which is
    // the definition of decoration.
    const mood = insc?.inverted ? 1.12 : 1.0;
    const qualScale = insc?.scale || 1;
    // The untranslated runes are the strongest thing you can write and
    // the Spell will not tell you what you wrote.
    const unknown = insc?.untranslated ? 1.25 : 1;

    const potency = grade.potency * legible * qualScale * unknown * mood;
    const power = Math.round((8 + finalAttrs.strength * 2.2) * potency);

    const memory = {
      // ── Item-shaped, on purpose ──
      // ⚠️ A forged weapon carries `type:'weapon'`, `weaponType` and
      // `stats.attack`, so Player.equipWeapon(), the EntityForge
      // silhouette table and the whole existing equip path work on it
      // unchanged. A Memory is not a parallel item system.
      id: `mem_${memoryHash(seed).toString(36)}`,
      name,
      isMemory: true,
      type: form.equips === 'weapon' ? 'weapon' : 'memory',
      icon: form.icon,
      element,
      formId: form.id,
      formName: form.name,
      equips: form.equips,
      grade: { ...grade },
      tier: { level: grade.level, name: grade.name, color: `#${grade.color.toString(16).padStart(6, '0')}` },
      attributes: finalAttrs,
      abilities,
      flaws,
      signs: reads.map(r => ({
        name: r.runeName, attribute: r.attribute, magnitude: r.magnitude,
        // ⚠️ Temper and sig must survive into the record, or ascending
        // a Memory rebuilds it through _assemble() with neither and
        // silently re-rolls every ability into the form's default pool.
        temper: r.temper, sig: r.sig,
      })),
      coreWeight,
      seed,
      // Weapon-path fields. Harmless on other forms.
      weaponType,
      power,
      // ⚠️ A Raiment declares `equips: 'armor'` and carried NO `defense`
      // field at all — and `Player.equipArmor()` reads exactly that
      // field. So the one form whose whole blurb is "it decides what
      // reaches you" decided nothing: forging one produced a garment
      // with 0 defence that also never reached the armour path. Led on
      // vitality, matching MEMORY_FORMS.raiment.lead, and scaled by the
      // same `potency` the weapon's attack is, so grade and legibility
      // read on a Raiment exactly the way they read on a Weapon.
      defense: form.equips === 'armor'
        ? Math.round((4 + finalAttrs.vitality * 1.6) * potency)
        : undefined,
      stats: { attack: power },
      // The sentence, kept on the object so the codex and the panel can
      // show what was actually written.
      inscription: insc ? {
        phrase: insc.phrase, reading: insc.reading || null, mood: insc.mood || null,
        ok: !!insc.ok, reason: insc.reason || null,
        untranslated: !!insc.untranslated,
      } : null,
      description: `${grade.name} ${form.name}. ${abilities.length} Facet${abilities.length === 1 ? '' : 's'}.`,
    };
    return memory;
  }

  /**
   * Which silhouette a forged Weapon takes.
   *
   * ⚠️ Must return a key WEAPON_PLANS actually has — an unknown key
   * silently forges a sword (EntityForge warns, but the player just
   * sees the wrong shape). Chosen from the attributes so the object
   * looks like what it is: a Strength Memory is a maul, an Agility one
   * is paired blades.
   */
  _weaponTypeFor(seed, attrs, avoid = null) {
    const top = ATTRIBUTE_IDS.reduce((a, b) => (attrs[b] > attrs[a] ? b : a), ATTRIBUTE_IDS[0]);
    const byAttr = {
      strength:   ['warhammer', 'greatsword', 'axe'],
      agility:    ['dualblades', 'dagger', 'sword'],
      vitality:   ['spear', 'warhammer', 'staff'],
      perception: ['bow', 'scythe', 'dagger'],
      willpower:  ['staff', 'grimoire', 'scythe'],
    };
    const list = byAttr[top] || byAttr.strength;

    // ══════════════════════════════════════════════════════
    // ⚠️ THE LAST SOURCE OF DUPLICATE ACTIVES, AND IT IS BY DESIGN.
    //
    // A weapon's first Aspect is its TYPE's signature — "a scythe
    // always reaps" — so two scythes necessarily carry the same
    // active. Once the pool fix and `avoid` had taken pooled
    // duplicates to zero, this was the entire remaining 9.2% of
    // loadouts holding a repeated active. `avoid` could not see it:
    // it is applied in `_makeAbility`, and the signature never goes
    // through there.
    //
    // The fix is NOT to strip the signature — that rule is the whole
    // reason the eleven types are eleven different things to hold.
    // It is to pick a different TYPE, which is a better outcome
    // anyway: two greatswords was already a dull thing to be carrying,
    // and now you get a different silhouette, a different melee
    // profile and a different signature at once.
    //
    // ⚠️ PREFERENCE, not a filter — if every type this attribute
    // offers is already spoken for, the seeded choice stands. Refusing
    // to forge, or reaching outside the attribute's own list, would
    // break the "a Strength Memory is a maul" rule that makes the
    // silhouette legible.
    // ══════════════════════════════════════════════════════
    if (avoid && avoid.size) {
      const fresh = list.filter(t => {
        const sig = WEAPON_SIGNATURE[t];
        if (heldMotions(avoid).has(SIGNATURE_MOTION[t])) return false;
        return !sig || !avoid.has(sig.key);
      });
      if (fresh.length) return fresh[memoryHash('wtype:' + seed) % fresh.length];
    }
    return list[memoryHash('wtype:' + seed) % list.length];
  }

  /**
   * The Aspect a weapon gets purely for being the type it is.
   *
   * ⚠️ Built through the SAME numeric pipeline as every other Aspect
   * (`src.magnitude` → pct/dur/mult/n) rather than carrying its own
   * hardcoded numbers, so a signature scales with the sign that was
   * drawn exactly the way a pooled Aspect does. A signature that
   * ignored magnitude would make drawing well pointless on precisely
   * the ability the player cares most about.
   *
   * ⚠️ Always `active: true`. The signature IS the weapon's verb; a
   * passive one would leave the type invisible on the hotbar, which is
   * the failure trap #32 records for Echoes.
   */
  _signatureAbility(weaponType, src, seed, element) {
    // ⚠️ A weapon's signature is now a COMPOSED Facet on the type's own
    // signature motion (data/facets.js). The sign's temper still picks
    // the trait, so two scythes both Harvest but not the same Harvest.
    if (SIGNATURE_MOTION[weaponType]) {
      const ab = composeFacet({
        seed: `${seed}:sig`, weaponType, attribute: src?.attribute ?? 'strength',
        magnitude: src?.magnitude ?? 3, family: src?.temper?.family || 'strike',
        element, motionId: SIGNATURE_MOTION[weaponType],
      });
      ab.attributeName = ATTRIBUTES[ab.attribute]?.name ?? ab.attributeName;
      ab.fromSign = src?.runeName ?? null;
      ab.signature = weaponType;
      return ab;
    }
    const t = WEAPON_SIGNATURE[weaponType];
    if (!t) return null;
    const m = src?.magnitude ?? 3;
    const nums = {
      pct: 6 + m * 4,
      dur: 3 + m,
      mult: (1.4 + m * 0.18).toFixed(2),
      n: Math.max(1, Math.round(m * 0.8)),
    };
    return {
      key: t.key,
      // ⚠️ THE VERB IS THE ROOT, AND IT IS NOT THE WHOLE NAME.
      //
      // This used to be a bare `t.verb`, on the reasoning that the
      // signature's authored word is the one thing telling the player
      // what they are holding — true, and it made every warhammer in
      // the game carry an Aspect called exactly "Quake". The owner's
      // hotbar read **QUAKE / QUAKE / QUAKE**: three different
      // Memories, three separate cooldowns, three rows nothing could
      // tell apart. `avoid` cannot reach this — a signature never
      // passes through `_makeAbility` — so the collision is by
      // construction whenever two weapons share a type.
      //
      // Named through `nameAbility()` like every other Aspect, which
      // keeps the verb and adds a per-Memory distinguishing part
      // (see its header). "Quake of Vitality" and "Ashen Quake" still
      // say *quake* first.
      name: nameAbility(t, src?.attribute ?? 'strength', `${seed}:sig:${weaponType}`),
      active: true,
      cost: t.cost || 0,
      cooldown: t.cooldown || 0,
      line: this._fill(t.line, nums),
      effect: { [t.key]: nums },
      attribute: src?.attribute ?? 'strength',
      attributeName: ATTRIBUTES[src?.attribute ?? 'strength']?.name ?? 'Strength',
      magnitude: m,
      element,
      fromSign: src?.runeName ?? null,
      // Marks it in the UI as the thing only this weapon can do.
      signature: weaponType,
    };
  }

  // ══════════════════════════════════════════════════════════
  // REPAIRING WHAT IS ALREADY OWNED
  //
  // Owner, with a screenshot of a hotbar reading **QUAKE / QUAKE /
  // QUAKE**: "see there is the same attacks, if they have different
  // attributes name them different, or make a different thing."
  //
  // ⚠️ FIXING THE GENERATOR DOES NOT FIX THE SAVE. An Aspect's `name`
  // is a STRING baked onto the Memory object at forge time and written
  // into the save. Every naming fix in this file applies to things
  // forged AFTERWARDS; a player's existing satchel keeps whatever it
  // was given, forever, and they experience "you fixed it" as nothing
  // having changed. This is the same shape as the gear letters needing
  // `ensureGearLetters()` at boot — new rules need a migration or they
  // only exist for new players.
  // ══════════════════════════════════════════════════════════

  /** Find the template that produced an ability key, wherever it lives. */
  _templateFor(key) {
    for (const list of Object.values(ABILITY_POOLS)) {
      const t = list.find(x => x.key === key);
      if (t) return t;
    }
    for (const sig of Object.values(WEAPON_SIGNATURE)) {
      if (sig.key === key) return sig;
    }
    return null;
  }

  /**
   * Give every Aspect across a set of Memories a name nothing else in
   * that set shares.
   *
   * ⚠️ Renames ONLY. It never touches keys, numbers, costs or
   * cooldowns, so nothing a player owns gets weaker or stronger and no
   * build silently changes under them — the whole repair is legible as
   * "the labels got clearer".
   *
   * ⚠️ Uniqueness is FORCED, not hoped for. `nameAbility()` varies on
   * the seed and would almost always differ on its own, but "almost
   * always" is what produced the original report. The salt is bumped
   * until the name is actually unused, so the guarantee is structural
   * rather than probabilistic.
   *
   * ⚠️ A weapon SIGNATURE keeps its verb as the root either way (see
   * `_signatureAbility`), so two warhammers still both say *Quake* —
   * they just say it as "Ashen Quake" and "Quake of Vitality". The
   * shared key is deliberate (a warhammer quakes) and is not what the
   * repair is for; the unreadable hotbar was.
   *
   * @returns {{renamed:number, memories:number}}
   */
  repairAspectNames(memories) {
    const taken = new Set();
    let renamed = 0, touched = 0;

    // Two passes: claim the names that are ALREADY unique first, so a
    // repair does not rename something that was fine merely because it
    // happened to be visited second.
    const all = [];
    for (const mem of (memories || [])) {
      if (!mem?.abilities?.length) continue;
      mem.abilities.forEach((ab, i) => all.push({ mem, ab, i }));
    }
    const counts = new Map();
    for (const { ab } of all) counts.set(ab.name, (counts.get(ab.name) || 0) + 1);
    for (const { ab } of all) if ((counts.get(ab.name) || 0) === 1) taken.add(ab.name);

    for (const { mem, ab, i } of all) {
      if (taken.has(ab.name) && (counts.get(ab.name) || 0) === 1) continue;
      const t = this._templateFor(ab.key);
      // An unknown key means the pools changed under a saved Memory.
      // Leave it alone and say so rather than inventing a name for
      // something this build no longer understands.
      if (!t) {
        console.warn(`[Forge] no template for saved Facet "${ab.key}" — name left as-is`);
        continue;
      }
      let name = null;
      for (let salt = 0; salt < 24 && !name; salt++) {
        const cand = nameAbility(t, ab.attribute || 'strength',
          `${mem.seed || mem.id}:${i}:r${salt}`);
        if (!taken.has(cand)) name = cand;
      }
      // 24 salts exhausted — fall back to something that cannot
      // collide rather than leaving a duplicate standing.
      if (!name) name = `${t.verb} ${String.fromCharCode(65 + (renamed % 26))}`;
      if (name !== ab.name) { ab.name = name; renamed++; touched++; }
      taken.add(name);
    }
    return { renamed, memories: (memories || []).length };
  }

  /** Generate one Aspect: a name, a line, and a real effect. */
  _makeAbility(pool, src, seed, index, used, element, requireActive = false, avoid = null, weaponType = null, verbFamily = null) {
    // ══════════════════════════════════════════════════════
    // ⚠️ PICK FROM THE ELIGIBLE LIST. DO NOT WALK THE POOL.
    //
    // This used to hash a START INDEX and then walk forward to the
    // first template that passed the filters. That is not a uniform
    // choice and it is the reason the owner reported "multiple same
    // active attacks amongst multiple weapons": walking forward means
    // every start index that lands inside a RUN of ineligible entries
    // funnels into the one eligible entry that follows the run. An
    // active template preceded by six passives is therefore seven
    // times as likely as one preceded by none.
    //
    // Measured across 900 forges before the fix: **`skewer` was 328 of
    // 540 actives — 61%** — and was the opening active of essentially
    // every non-weapon Memory (echo 177, raiment 64, charm 43, relic
    // 40). `pierce` holds four templates of which exactly ONE is
    // active, so every start index in that family collapsed onto the
    // same answer. Weapons were the only healthy form, and only
    // because WEAPON_SIGNATURE gives them their opener directly.
    //
    // Filtering FIRST and indexing into the survivors makes every
    // eligible template equally likely regardless of where it sits.
    // This is the sixth-and-a-bit instance of trap #3 in this project:
    // the old code reads as obviously fine and only a counted
    // distribution shows it is not.
    // ══════════════════════════════════════════════════════
    const fits = (t) => !used.has(t.key) && (!requireActive || t.active);
    const family = pool.filter(fits);

    // Everything in the game that would also fit, for when the family
    // itself has nothing left to offer.
    const wide = [];
    for (const p2 of Object.values(ABILITY_POOLS)) {
      for (const t of p2) if (fits(t)) wide.push(t);
    }

    const pick = (list, salt) => (list.length
      ? list[memoryHash(`ab${salt}:${seed}:${src.sig || ''}:${index}`) % list.length]
      : null);

    // ══════════════════════════════════════════════════════
    // ⚠️ FOUR TIERS, AND THE ORDER IS THE WHOLE POINT.
    //
    // `avoid` carries the Aspect keys already on Memories the player
    // owns. The naive implementation checks it once against the family
    // and gives up — measured at **9.5% of five-Memory loadouts still
    // holding a duplicate**, because a small family runs out of fresh
    // options long before the GAME does. Widening to the whole table
    // before conceding a repeat takes it to near zero.
    //
    // ⚠️ Duplicates are still permitted at tier 3/4 rather than
    // returning null. A hard exclusion would shorten a Memory below
    // its grade the moment the table was exhausted, and grade IS the
    // Aspect count (data/memories.js's one load-bearing rule) — a
    // silently two-Aspect Epic is a worse bug than a repeated Sweep.
    // ══════════════════════════════════════════════════════
    let template = null;
    if (avoid && avoid.size) {
      const freshFamily = family.filter(t => !avoid.has(t.key));
      template = pick(freshFamily, 'a');
      if (!template) {
        const freshWide = wide.filter(t => !avoid.has(t.key));
        template = pick(freshWide, 'b');
      }
    }
    if (!template) template = pick(family, 'c');
    if (!template) template = pick(wide, 'd');

    if (!template) return null;

    // ══════════════════════════════════════════════════════
    // ⚠️ A WEAPON'S ACTIVE IS COMPOSED, NOT PICKED.
    // The template above still decides WHETHER this slot is active (so
    // the active/passive balance of every pool is untouched) and which
    // family it belongs to; the skill itself is built by the Facet
    // Grammar from this weapon's own motions, never a shared one.
    // Passives and every non-weapon form keep their keyed templates —
    // a summon or a ward is not a swing.
    // ══════════════════════════════════════════════════════
    if (template.active && weaponType && SIGNATURE_MOTION[weaponType]) {
      const avoidM = heldMotions(avoid);
      for (const k of used) if (typeof k === 'string' && k.startsWith('f_')) avoidM.add(k.slice(2, k.lastIndexOf('_')));
      const fam = verbFamily || src.temper?.family
        || Object.keys(ABILITY_POOLS).find(f => ABILITY_POOLS[f] === pool) || 'strike';
      // One sign can feed several Facets; a Remnant whose every skill
      // shared one trait would read as one move in five costumes. A
      // trait already on this Remnant hands over to a fresh one.
      const takenT = new Set([...used].filter(k => typeof k === 'string' && k.startsWith('f_')).map(k => k.slice(k.lastIndexOf('_') + 1)));
      let family = fam;
      if (takenT.has(fam === 'drain' ? 'pierce' : fam === 'mend' ? 'ward' : fam)) {
        const fresh = ['strike', 'pierce', 'spread', 'move', 'ward', 'call', 'shift'].filter(t => !takenT.has(t));
        if (fresh.length) family = fresh[memoryHash(`ftr:${seed}:${index}`) % fresh.length];
      }
      const ab = composeFacet({
        seed, weaponType, attribute: src.attribute, magnitude: src.magnitude,
        family, element, avoid: avoidM, index,
      });
      ab.attributeName = ATTRIBUTES[src.attribute]?.name || '';
      ab.fromSign = src.runeName;
      return ab;
    }

    const m = src.magnitude;
    const nums = {
      pct: 6 + m * 4,
      dur: 3 + m,
      mult: (1.4 + m * 0.18).toFixed(2),
      n: Math.max(1, Math.round(m * 0.8)),
    };

    return {
      key: template.key,
      name: nameAbility(template, src.attribute, `${seed}:${index}`),
      // ⚠️ Carried through from the template, never guessed here. The
      // loadout puts actives on the hotbar and applies passives
      // silently; a missing flag would bury a usable power.
      active: !!template.active,
      cost: template.cost || 0,
      cooldown: template.cooldown || 0,
      line: this._fill(template.line, nums),
      attribute: src.attribute,
      attributeName: ATTRIBUTES[src.attribute]?.name || '',
      fromSign: src.runeName,
      magnitude: m,
      element,
      // The machine-readable half, for whatever applies it.
      effect: { [template.key]: nums },
    };
  }

  _fill(line, nums) {
    return String(line).replace(/\{(\w+)\}/g, (_, k) => (nums[k] !== undefined ? nums[k] : `{${k}}`));
  }

  // ── ASCENDING ───────────────────────────────────────────

  /**
   * Raise a Memory one grade — which is to say, give it one more
   * Aspect. Keeps the NAME: it is the same Memory, further woken.
   */
  ascend(memory, cores) {
    if (!memory?.isMemory) return { ok: false, reason: 'That is not a Remnant.' };
    const nextLevel = memory.grade.level + 1;
    if (nextLevel >= MEMORY_GRADES.length) {
      return { ok: false, reason: `${memory.name} is Divine. There is nothing above it.` };
    }
    const need = this._ascendCost(nextLevel);
    const { weight } = this.gradeFor(cores);
    if (weight < need) {
      return { ok: false, reason: `Needs ${need} core weight to reach ${gradeByLevel(nextLevel).name}. You brought ${weight}.` };
    }

    const form = MEMORY_FORMS[memory.formId] || MEMORY_FORMS.weapon;
    const attrs = {};
    for (const id of ATTRIBUTE_IDS) attrs[id] = 0;
    for (const s of memory.signs) attrs[s.attribute] += s.magnitude;
    const reads = memory.signs.map(s => ({
      runeName: s.name, attribute: s.attribute, magnitude: s.magnitude,
      temper: s.temper, sig: s.sig || s.name,
    }));

    const risen = this._assemble({
      form,
      grade: gradeByLevel(nextLevel),
      element: memory.element,
      reads, attrs,
      seed: memory.seed,
      coreWeight: memory.coreWeight + weight,
      keepName: memory.name,     // ⚠️ same Memory, not a new one
    });
    risen.id = memory.id;        // and the same identity in the bag
    eventBus.emit(Events.MEMORY_ASCENDED, { memory: risen, from: memory.grade, to: risen.grade });
    return { ok: true, memory: risen };
  }

  _ascendCost(level) {
    return [0, 3, 7, 13, 22, 34, 50][level] ?? 50;
  }

  // ── ENCHANTING ──────────────────────────────────────────

  /**
   * Add signs to an existing Memory. Does NOT change its grade, so it
   * gains no new Aspect — it re-weights what it already has.
   *
   * ⚠️ The name changes, because the seed changes: it is genuinely a
   * different object afterwards, and pretending otherwise would let a
   * player quietly rebuild a Memory into something else while keeping
   * a name that no longer describes it.
   */
  enchant(memory, runes) {
    if (!memory?.isMemory) return { ok: false, reason: 'That is not a Remnant.' };
    const added = this.readSigns(runes);
    if (!added.reads.length) return { ok: false, reason: 'Draw a sign first.' };

    const form = MEMORY_FORMS[memory.formId] || MEMORY_FORMS.weapon;
    const reads = [
      ...memory.signs.map(s => ({
        runeName: s.name, attribute: s.attribute, magnitude: s.magnitude,
        temper: s.temper, sig: s.sig || s.name,
      })),
      ...added.reads,
    ];
    const attrs = {};
    for (const id of ATTRIBUTE_IDS) attrs[id] = 0;
    for (const r of reads) attrs[r.attribute] += r.magnitude;

    const seed = `${memory.seed}::+${added.reads.map(r => r.sig).join('|')}`;
    const next = this._assemble({
      form, grade: gradeByLevel(memory.grade.level), element: memory.element,
      reads, attrs, seed, coreWeight: memory.coreWeight,
    });
    eventBus.emit(Events.MEMORY_ENCHANTED, { memory: next, from: memory });
    return { ok: true, memory: next };
  }
}

export const memoryForge = new MemoryForge();
