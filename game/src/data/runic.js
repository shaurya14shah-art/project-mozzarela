// ══════════════════════════════════════════════════════════
// Runic Sorcery — runes as LETTERS, inscriptions as SENTENCES
//
// ── WHAT THE SOURCE ACTUALLY SAYS ─────────────────────────
// Researched rather than assumed, and it overturned the previous
// design. From the wiki:
//
//   · "Runes are the individual letters or symbols in one of the dead
//      languages called the Runic Language."
//   · "Enchantments were simply expressions of the enchanter's will,
//      and the runes were the building blocks with which the enchanter
//      manipulated the movement of energy to achieve their goal."
//   · "By understanding the grammatical structure of the language, it
//      was easy to extend the meaning of the runes into a more correct
//      translation. For example, there were different runes for the
//      word 'change', each with its own connotation."
//   · Runic Sorcery transcribes TRUE NAMES in written form, where the
//      Sorcery of Names speaks them aloud.
//   · Two kinds of rune the Spell refuses to translate at all.
//
// ── WHAT THAT CHANGES ─────────────────────────────────────
// The old system read a drawn stroke as "an attribute plus a temper".
// That is not writing — it is a stat roll with a nice interface. If
// runes are LETTERS, then:
//
//   1. A stroke inscribes ONE RUNE, and the rune has a MEANING.
//   2. A sequence of runes spells a PHRASE. Order matters, because
//      writing is ordered — and this project already holds that
//      principle ("the first thing in defines it, the last delivers
//      it").
//   3. Grammar decides whether the Spell can read it. A well-formed
//      inscription is TRANSLATED and does exactly what it says. A
//      malformed one still does something, but the Spell will not
//      say what.
//
// That last point is the whole design: the player is not rolling for
// an outcome, they are WRITING one, and legibility is the skill.
//
// ⚠️ ORIGINAL VOCABULARY. The structure is the novel's; every rune
// name here is invented for this world. No Runic Language word from
// the source appears in this file, and none may be added.
// ══════════════════════════════════════════════════════════

// ── GRAMMAR ───────────────────────────────────────────────
// ⚠️ Three classes, and the parser below needs all three present to
// call an inscription well-formed. This is the "grammatical structure"
// the source says extends a rune's meaning into a correct translation.
export const RUNE_CLASSES = {
  subject:   { id: 'subject',   name: 'Subject',   blurb: 'what the inscription is about' },
  verb:      { id: 'verb',      name: 'Verb',      blurb: 'what it does' },
  qualifier: { id: 'qualifier', name: 'Qualifier', blurb: 'how, how much, how long' },
};

/**
 * THE LEXICON.
 *
 * Every rune is a letter with a meaning and a grammatical class. The
 * `rule` is how a player inscribes it — geometry they can see and aim
 * at, exactly as the sign classifier had to be (a mapping you cannot
 * intend is a die roll with extra steps).
 *
 * ⚠️ `connotation` is load-bearing, not flavour. The source is
 * explicit that several runes share a meaning and differ only in
 * connotation — that is what makes a lexicon feel like a language
 * rather than a lookup table, and it is why VOR/THULE both mean
 * "change" and produce different enchantments.
 *
 * ⚠️ Matched top-down by `test`. Order is the rule; the first match
 * wins, so the specific must precede the general.
 */
// ── ⚠️ THERE IS NO FIXED ALPHABET ─────────────────────────
// The first version matched a stroke against fourteen fixed runes by
// shape rule — "close the shape and you get KETH", "draw it straight
// and you get AESH". Owner's objection, and it is correct: **no emblem
// is one and the same**. A dead language with fourteen letters you
// draw by following instructions is a menu with extra steps, and it
// made every inscription look like every other one.
//
// A rune is now DERIVED FROM THE STROKE ITSELF. Its name, meaning and
// connotation all come from the exact signature, so two emblems that
// differ anywhere are different runes — and there is nothing to
// memorise, because the panel reads back what you just wrote.
//
// What survives is the part that carried the design: GRAMMAR. Every
// rune still has a class (subject / verb / qualifier), because a
// sequence has to parse as a sentence for the Spell to translate it.
// The class comes from the stroke's PROPORTIONS rather than a lookup,
// so it is a tendency the player can lean on, not a recipe to follow.

/** Syllables the Runic Language is built from. Invented for this world. */
const SYL_A = ['ae', 'or', 'ke', 'va', 'si', 'mo', 'thu', 'ra', 'gan', 'is', 'nu', 'zel', 'har', 'ul'];
const SYL_B = ['sh', 'n', 'th', 'unt', 'l', 'ra', 'le', 'k', 'm', 'd', 'ss', 'v', 'r', 'g'];
const SYL_C = ['a', 'e', 'i', 'o', 'u', 'ai', 'ea', 'ou', ''];

/**
 * Meanings, by grammatical class.
 *
 * ⚠️ Several entries in each class share a sense and differ only in
 * connotation — the source is explicit the language works that way
 * ("different runes for the word 'change', each with its own
 * connotation"), and it is what makes this read as a language rather
 * than a table.
 */
const MEANINGS = {
  subject: [
    ['ember', 'what burns and does not ask'],
    ['the deep', 'what is underneath, and patient'],
    ['the ring', 'what encloses and keeps'],
    ['the vault', 'what encloses and refuses to open'],
    ['the edge', 'what parts one thing from another'],
    ['the many', 'what cannot be counted'],
    ['the hour', 'what runs out'],
    ['the thread', 'what holds two things together'],
    ['ash', 'what is left when it is done'],
    ['the door', 'what opens both ways'],
    ['the tide', 'what returns whether or not you want it'],
    ['the name', 'what a thing cannot refuse'],
    ['the wound', 'what does not close'],
    ['the vigil', 'what stays awake for you'],
    ['the debt', 'what is still owed'],
    ['the mirror', 'what answers with your own face'],
  ],
  verb: [
    ['to strike', 'a single answer, delivered once'],
    ['to change', 'change that takes something away'],
    ['to change', 'change that gives something back'],
    ['to carry', 'motion, and what motion costs'],
    ['to hold', 'refusal, and the cost of refusing'],
    ['to open', 'what cannot be shut again'],
    ['to bind', 'what agrees to stay'],
    ['to drink', 'taking, and keeping what is taken'],
    ['to scatter', 'one becoming several'],
    ['to remember', 'calling a thing back into being'],
    ['to unmake', 'the ending of a thing, on purpose'],
    ['to answer', 'what comes when it is called'],
  ],
  qualifier: [
    ['twice-over', 'more of it, and sooner'],
    ['far-reaching', 'wider than it needs to be'],
    ['long-held', 'it lasts'],
    ['half-spoken', 'less of it, but cheaply'],
    ['sevenfold', 'more than is reasonable'],
    ['quiet', 'it does not announce itself'],
  ],
};

/**
 * Which ability family each verb sense drives.
 * ⚠️ Index-aligned with MEANINGS.verb. A mismatch here makes the
 * sentence read correctly and do something else.
 */
const VERB_SENSE = [
  'strike', 'drain', 'mend', 'move', 'ward',
  'open', 'bind', 'drain', 'scatter', 'call', 'unmake', 'call',
];

/** Attribute each meaning leans on. Index-aligned with MEANINGS. */
const CLASS_ATTR = {
  subject: ['strength', 'willpower', 'vitality', 'vitality', 'perception', 'perception',
            'agility', 'willpower', 'strength', 'agility', 'vitality', 'willpower',
            'perception', 'vitality', 'willpower', 'perception'],
  verb: ['strength', 'agility', 'willpower', 'agility', 'vitality',
         'perception', 'willpower', 'strength', 'perception', 'willpower', 'strength', 'willpower'],
  qualifier: ['strength', 'perception', 'vitality', 'agility', 'strength', 'willpower'],
};

/** murmur3 fmix32 — the avalanche this project has needed three times. */
function _fmix32(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16; return h >>> 0;
}
function _hash(str) {
  const t = String(str);
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
  return _fmix32(h);
}

/**
 * Which grammatical class a stroke writes in.
 *
 * ⚠️ Proportional, not a rule to follow. Longer, more committed
 * strokes tend to be verbs; short ones tend to be qualifiers; the
 * middle is subjects. The player learns the TENDENCY without ever
 * being told "draw a ring", and because the exact rune still comes
 * from the signature, two long strokes are still two different verbs.
 */
function classFor(g, h) {
  const weight = (g.length ?? 0) * 0.6 + (g.focus ?? 0) * 0.2 + Math.abs(g.chirality ?? 0) * 0.2;
  // Hash jitter so the boundaries are not a hard wall the player can
  // feel and game.
  const w = weight + ((h >>> 8) % 100) / 1000;
  // ⚠️ THRESHOLDS ARE MEASURED, NOT GUESSED. The first cut used
  // 0.40 / 0.19 and produced **subject 81%, qualifier 13%, verb 5%** —
  // and an inscription with no verb does not parse, so four out of
  // five emblems a player drew casually could never form a legible
  // sentence. The grammar has to be satisfiable by ordinary drawing.
  // Re-count the class spread after ANY change to the weight formula.
  // ⚠️ DERIVED FROM THE MEASURED DISTRIBUTION, not chosen by feel.
  //
  // The raw weight is tightly clustered (measured p22 = 0.187,
  // p65 = 0.267), so small threshold moves swing the spread violently.
  // Three attempts, all counted:
  //   0.40 / 0.19  → verb 5%   (nothing could form a sentence)
  //   0.235 / 0.125 → verb 79%  (overcorrected)
  //   0.217 / 0.137 → verb 82%  (jitter added, not subtracted — my error)
  //
  // ⚠️ `w` is raw + jitter, and the jitter is uniform 0..0.099 with
  // mean 0.0495 — so a threshold meant to sit at a percentile of `w`
  // must ADD that mean to the raw percentile, not subtract it. These
  // are p22 and p65 of the raw weight PLUS 0.0495.
  // ⚠️ Re-derive if the weight formula changes at all, and re-count
  // the spread afterwards — the arithmetic is easy to get backwards.
  if (w >= 0.316) return 'verb';
  if (w <= 0.236) return 'qualifier';
  return 'subject';
}

/**
 * ⚠️ THE UNTRANSLATED.
 *
 * The source names two kinds of rune the Spell refuses to translate.
 * Reproduced as a real mechanic: an inscription carrying one is
 * stronger and cannot be read back, because the thing doing the
 * reading will not say. Rare by construction.
 */
function isUntranslated(g) {
  return (g.closed || Math.abs(g.winding ?? 0) >= 0.8)
    && (g.entropy ?? 0) >= 0.72
    && (g.length ?? 0) >= 0.4;
}

/**
 * The rune a stroke writes. Never null, and never the same for two
 * different strokes.
 *
 * ⚠️ EVERY index comes from a SEPARATELY SALTED hash of the full
 * signature. Deriving several indices from one hash by division is the
 * correlated-modulus bug this project has shipped repeatedly — and the
 * per-field counts look healthy in every broken version. Count whole
 * RUNES across a sweep, never one field at a time.
 */
export function runeForGeometry(geometry) {
  const g = geometry || {};
  const sig = g.sig || '';
  const h = _hash('rune:' + sig);

  if (isUntranslated(g)) {
    return {
      id: 'unknown:' + sig, name: '—————', cls: 'subject',
      means: '—unknown—', connotation: 'the Spell will not say',
      attr: 'willpower', untranslated: true, sig,
    };
  }

  const cls = classFor(g, h);
  const pool = MEANINGS[cls];
  const mi = _hash('mean:' + sig) % pool.length;
  const [means, connotation] = pool[mi];

  const a = SYL_A[_hash('n1:' + sig) % SYL_A.length];
  const b = SYL_B[_hash('n2:' + sig) % SYL_B.length];
  const c = SYL_C[_hash('n3:' + sig) % SYL_C.length];

  return {
    id: `${cls}:${sig}`, name: (a + b + c).toUpperCase(), cls,
    means, connotation, sig,
    attr: (CLASS_ATTR[cls] || CLASS_ATTR.subject)[mi] || 'strength',
    verb: cls === 'verb' ? (VERB_SENSE[mi] || 'strike') : undefined,
    scale: cls === 'qualifier' ? 1.1 + ((g.length ?? 0) * 0.5) : undefined,
  };
}

// ── READING AN INSCRIPTION ────────────────────────────────

/**
 * Parse a sequence of runes as a sentence.
 *
 * ⚠️ ORDER MATTERS, because this is writing. The FIRST subject names
 * what the inscription is about and the LAST verb decides what it
 * does — the same "first defines, last delivers" rule this project
 * already applies to the Working. Reordering the same runes is a
 * different inscription, which is the entire reason to have a grammar
 * rather than a bag of modifiers.
 *
 * @returns {{ ok, subject, verb, qualifiers, phrase, reason, scale, untranslated }}
 */
export function readInscription(runes) {
  const list = (runes || []).filter(Boolean);
  if (!list.length) {
    return { ok: false, reason: 'Nothing is written here.', phrase: '', qualifiers: [], scale: 1 };
  }

  const untranslated = list.some(r => r.untranslated);
  const subject = list.find(r => r.cls === 'subject') || null;
  const verbs = list.filter(r => r.cls === 'verb');
  const verb = verbs.length ? verbs[verbs.length - 1] : null;
  const qualifiers = list.filter(r => r.cls === 'qualifier');

  const scale = qualifiers.reduce((s, q) => s * (q.scale || 1), 1);
  const words = list.map(r => r.name).join(' · ');

  // ── ⚠️ ORDER IS THE SENTENCE ────────────────────────────
  // The first version found "a subject" and "the last verb" and built
  // the same reading out of them no matter what order they were
  // written in — so AESH·THULE and THULE·AESH both read "ember to
  // change", and the grammar was decoration.
  //
  // Writing is ordered. The FIRST rune is what the inscription is
  // fundamentally about; the LAST is how it resolves. That is the same
  // "first defines it, last delivers it" rule this project already
  // applies to the Working, and it means reordering the identical
  // runes genuinely writes something else.
  const opens = list[0];
  const closes = list[list.length - 1];
  const inverted = opens.cls === 'verb';   // opened on an action, not a thing

  if (untranslated) {
    return {
      ok: true, untranslated: true, subject, verb, qualifiers, scale,
      opens, closes, inverted,
      phrase: words,
      reading: 'The Spell will not translate this. It works anyway.',
    };
  }
  if (!subject) {
    return {
      ok: false, subject, verb, qualifiers, scale, opens, closes, phrase: words,
      reason: 'No subject. The Spell cannot tell what this is about.',
    };
  }
  if (!verb) {
    return {
      ok: false, subject, verb, qualifiers, scale, opens, closes, phrase: words,
      reason: 'No verb. This names a thing without asking it to do anything.',
    };
  }

  const quals = qualifiers.length
    ? `, ${qualifiers.map(q => q.means).join(' and ')}`
    : '';

  // Two grammatical moods, decided purely by which rune opens.
  //   subject-first → a STATEMENT: the thing acts.
  //   verb-first    → an IMPERATIVE: the action is invoked upon it.
  // ⚠️ The closer is frequently the verb itself, and naming it twice
  // reads as broken English ("Ember to change, closing on to change").
  // Three phrasings, chosen by what actually closes the sentence.
  const closerIsVerb = closes === verb;
  const reading = inverted
    ? `${cap(opens.means)} — and let it fall on ${closes.means}${quals}.`
    : closerIsVerb
      ? `${cap(opens.means)}, ${verb.means}${quals}.`
      : `${cap(opens.means)} ${verb.means}, closing on ${closes.means}${quals}.`;

  return {
    ok: true, subject, verb, qualifiers, scale, opens, closes, inverted,
    phrase: words,
    mood: inverted ? 'imperative' : 'statement',
    reading,
  };
}

function cap(t) { return String(t || '').charAt(0).toUpperCase() + String(t || '').slice(1); }

/**
 * ⚠️ There is no alphabet to list any more — every stroke writes its
 * own rune. What the panel shows instead is the GRAMMAR: the three
 * classes and what each does in a sentence. That is the part worth
 * knowing, and the only part that is fixed.
 */
export function grammarGuide() {
  return [
    { cls: 'subject',   name: 'Subject',   hint: 'A middling stroke. Names what the writing is about.' },
    { cls: 'verb',      name: 'Verb',      hint: 'A long or committed stroke. Says what it does.' },
    { cls: 'qualifier', name: 'Qualifier', hint: 'A short stroke. Says how much.' },
  ];
}
