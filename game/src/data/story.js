// ══════════════════════════════════════════════════════════
// Story — the main Fracture arc's actual words
//
// Everything narrative in one place: the opening overlay, Elder
// Aris's and Ostra's stage-gated dialogue (read against
// QuestSystem's currentQuestIndex by NPC.js), and the lore fragments
// scattered through the world as found-journal pickups (see
// ChunkManager.js / main.js's lore-reveal wiring).
//
// Original in this game's own vocabulary (Fracture / Pioneer /
// essence / attunement / Doctrine / Mastery / Saturation / the Heaven
// and Hell paths) — not a retelling of any other game's plot.
// ══════════════════════════════════════════════════════════

export const STORY_INTRO_LINES = [
  'The sky has been broken longer than anyone living can remember.',
  'You are a Pioneer now — sent to harvest what the Fracture spills, and call it mercy.',
  'Cast enough of one essence and it stops being a choice; it becomes what you are.',
  'Heaven swears the wound must close. Hell swears something wants it open. Choose your attunement.',
];

export const ELDER_DIALOGUE = [
  {
    stage: 0,
    lines: [
      'Another cradle-born Pioneer. Good — we lose them faster than the Sanctuary can make more.',
      "Go on, then. The wilds start past that gate, and the sky won't wait for you to feel ready.",
    ],
  },
  {
    stage: 1,
    lines: [
      "You felled something out there, and it didn't die clean, did it. Nothing does anymore.",
      "That's essence for you. It doesn't vanish when the body stops moving. It just changes hands.",
    ],
  },
  {
    stage: 2,
    lines: [
      'The Fracture doesn\'t heal, whatever the murals in this hall like to claim. It widens slower where we harvest, faster where we don\'t.',
      "There's a shard at the root of it, they say — a Mithril Core. Find it, and maybe we finally learn whether we've been stitching this world shut, or keeping something else fed.",
    ],
  },
  {
    stage: 3,
    lines: [
      "The Core won't come to you. It's buried under something that grew teeth learning to guard it.",
      "Bring back what you find whole, Pioneer. I've buried enough of you who brought back nothing at all.",
    ],
  },
  {
    stage: 4,
    lines: [
      "You've been talking to Ostra, haven't you. I can smell the rot on your attunement from here.",
      "Ostra isn't wrong about everything. That's what makes them dangerous — and what makes me trust them least.",
    ],
  },
  {
    stage: 5,
    lines: [
      "Whatever you found down there, I want the truth of it before I want the Core. In that order, for once.",
      "I've spent forty years telling Pioneers the Fracture is a wound. I am no longer certain which of us it's healing.",
    ],
  },
];

export const OSTRA = {
  id: 'ostra_npc',
  name: 'Ostra',
  role: 'the Long-Attuned',
  colorHex: '#6b3a52',
  dialogue: [
    { stage: 0, lines: ["You're new. I can tell by the way your essence still asks permission before it moves."] },
    { stage: 1, lines: ['The Sanctuary calls that a purge. I call it appetite. Yours, mostly.'] },
    {
      stage: 2,
      lines: [
        "Aris told you about the Core, I'd wager. Sweet old fool still thinks it's ours to find.",
        "I've been attuned longer than you've been alive. The deeper it goes, the less it feels like finding something — the more it feels like being found.",
      ],
    },
    {
      stage: 3,
      lines: [
        'Careful what you dig up down there. Some things under this world were buried on purpose, by people smarter than either of us.',
        "Or don't be careful. Bring it up anyway. I'd like to see its face too.",
      ],
    },
    {
      stage: 4,
      lines: [
        "Sit. You've earned that much, whatever else you've earned. Ostra — once a Pioneer, same as you, before the attunement stopped being a choice.",
        'Ask yourself why the Fracture only ever gives us more to harvest, and never less. A wound closes. This one learned to want visitors.',
      ],
    },
    {
      stage: 5,
      lines: [
        "Look at your hands, Pioneer. Look at what your Doctrine has made of them. Mine looked like that once too.",
        "Kill the thing at the bottom, if you must. Just don't be surprised when it thanks you.",
      ],
    },
  ],
};

// Rationed on purpose — one restrained dread beat, shown rarely, not
// a horror-UI vocabulary bolted onto the whole game. Surfaces only
// after lingering on volatile ground (see main.js's exposure timer),
// never more than once every so often, and never twice in a row.
export const UNEASE_WHISPERS = [
  'something is listening',
  "it isn't finished with this ground",
  'put it down',
  "you shouldn't have looked",
  'the shape holds; you do not',
  'it recognises you',
];

// Found-journal environmental storytelling. Each is registered as a
// pickup-able "item" (see main.js boot) and placed once, deterministically,
// somewhere in the world (see ChunkManager.js) — picking one up shows
// its text in the dedicated lore-reveal overlay instead of the usual
// item toast.
export const LORE_FRAGMENTS = [
  {
    id: 'first_pioneer_journal',
    title: "A Pioneer's First Entry",
    text: "Third week of fire attunement and I've stopped reaching for anything cold. Elder Aris calls it normal — the body follows the essence, like a dog follows whoever last fed it. I keep wondering who's doing the feeding.",
  },
  {
    id: 'sanctuary_census',
    title: "The Sanctuary's Census",
    text: "Year eleven since the founding: two hundred and six Pioneers sent past the gate. Year twelve: one hundred ninety returned, one hundred fourteen sent. The tally keeper stopped writing a total after year fifteen. I don't think it was carelessness.",
  },
  {
    id: 'volatile_field_warning',
    title: 'Chalked on a Fencepost',
    text: "DO NOT BREW HERE. Ground's gone volatile — someone's frost and someone's fire soaked into the same dirt, and now it won't decide what it wants to be. I stood at the edge of it once. It looked back like it was deciding about me too.",
  },
  {
    id: 'elder_confession_fragment',
    title: "A Page Torn From the Elder's Own Notes",
    text: 'I have told forty years of Pioneers that the Fracture is a wound and the Sanctuary its bandage. I no longer believe the metaphor, only its usefulness. A frightened Pioneer who thinks they\'re healing something fights harder than one who suspects they\'re feeding it.',
  },
  {
    id: 'the_harvest_hymn',
    title: 'Sung at the Gate',
    text: 'Every dawn, words no one remembers writing: what spills, we gather; what gathers, we give back changed; what we give back, it keeps. The Sanctuary calls the third line a blessing. Nobody who has actually stood before the Fracture sings it like one.',
  },
  {
    id: 'attuned_wanderers_letter',
    title: 'Letter to No One',
    text: "By the time you find this I won't answer to the name I signed it with. That's not a metaphor — it's just what happens past a certain depth of attunement. The shape holds; the person inside it doesn't always. Tell Aris I'm sorry, and tell them I'm not sorry it worked.",
  },
  {
    id: 'mithril_core_rumor',
    title: 'Scratched Into a Support Beam',
    text: 'Three levels down, in a hand none of the current diggers claim: IT IS NOT SLEEPING, IT IS LISTENING. The foreman had it whitewashed over. He\'s had it whitewashed over twice now, after it came back through.',
  },
  {
    id: 'farmwifes_tally',
    title: 'Nailed to a Farmhouse Door',
    text: "Goblins took the east field three nights running, and it's not the grain they're after — I found it scattered, not eaten. They're digging for something under the furrows. I've salted the ground where they dig. If salt won't stop them, nothing I own will.",
  },
  {
    id: 'foundation_masons_log',
    title: "A Mason's Log, Water-Stained",
    text: "We laid the Sanctuary's foundations over something already built. The stonework three levels down isn't ours — the joints are too clean, the proportions wrong for a hand. Whatever raised the golems down there raised them to keep something in, not to keep us out. We built our floor on top and called it done.",
  },
  {
    id: 'healers_missing_ledger',
    title: "Torn From the Healer's Ledger",
    text: "Three Pioneers came to me shaking, attunement gone erratic, and I treated them the way I always do. A week later Ostra's boy came asking after the same three by name, wanting to know how their blood had 'settled.' I don't know who told him they'd been here. I didn't tell him anything back.",
  },
  {
    id: 'cartographers_margin_note',
    title: "Scrawled in a Cartographer's Margin",
    text: 'I have redrawn this valley four times in six years and the Fracture\'s edge is never where I left it. Not larger — I could accept larger. It moves sideways, like something pacing, and always back toward wherever the Pioneers are thickest that season.',
  },
  {
    id: 'childs_counting_rhyme',
    title: "Chalked Low on a Nursery Wall, in a Child's Hand",
    text: 'One for the sky that broke in half. Two for the ones who went to fix it. Three for the ones who came back wrong. Four, I forget what four is for. Nobody in the Sanctuary will tell me who taught her this, or why she only sings it facing the gate.',
  },
];

// Vell — the named wraith mq6 sends the player after. Doesn't speak
// coherently (it's "unmoored from itself"), so the intro line reads
// as an environmental beat rather than dialogue in quotes.
export const VELL = {
  introLine: "The air here doesn't move like air. It moves like something remembering how, badly, one joint at a time.",
  defeatLine: 'Vell comes apart the way frost leaves a window — not all at once, and not because anything won.',
};

// mq7's close — the player decides what becomes of the Mithril Core.
// None of the three is the "correct" choice; the game keeps going
// after any of them.
export const FINALE_NARRATION = {
  aris: [
    "Aris turns the Core over once in the lamplight, the way you'd check a coin for the counterfeit, and doesn't find one.",
    '"Forty years I\'ve called this a wound," they say, closing their hand around it. "Let\'s find out if I was right for once, instead of just useful." The bell over the gate rings for you anyway, same as every morning.',
    "Nothing closes. But something, somewhere past the fields, stops widening for a while — and that has to be enough, because it's what you were promised.",
  ],
  self: [
    'You put it away instead — in the one pocket neither of them ever thinks to ask about.',
    "Aris will assume you failed. Ostra will assume you're smarter than you look. Let them. The Core sits against your ribs like a second, quieter heartbeat, and for once something in this valley answers to you and no one else.",
    "The gate bell rings the next morning same as always. You go back out through it anyway — just not empty-handed, and not for either of their reasons.",
  ],
  ostra: [
    "Ostra doesn't reach for it. She just looks at it the way you'd look at a wound finally showing you the knife.",
    '"You could still walk it back to Aris," she says. "I\'d think less of you for it, not more." You set it in her palm anyway, and her fingers close slow, like she\'s giving it a chance to change your mind first.',
    "The valley doesn't get quieter. If anything it leans in closer, listening for what you'll feed it next — and somewhere behind you, the Sanctuary bell keeps ringing like nothing happened at all.",
  ],
};

// The world remembers what you chose. Once mq7 resolves, Elder Aris
// and Ostra stop repeating their stage-5 line and say one of these
// instead — keyed to QuestSystem.epilogueChoice — for the rest of the
// (infinite, still-ongoing) game. Small on purpose: this is two NPCs
// noticing one decision, not a simulated world, but it's real memory,
// not a cosmetic label.
export const ELDER_POST_FINALE = {
  aris: [
    "The Core's mine to carry now, for whatever that's worth. Go on — the gate's still there, and so is everything past it.",
    "I still don't know if I was right. I know I'm glad you're the one who let me find out.",
  ],
  self: [
    "You didn't come back with it. I noticed. I'm choosing not to ask.",
    "Whatever you're carrying, Pioneer, carry it somewhere I don't have to watch.",
  ],
  ostra: [
    'I know where you took it. I\'m not going to pretend I don\'t.',
    "Go on, then. Just don't come back here calling it mercy.",
  ],
};

export const OSTRA_POST_FINALE = {
  aris: [
    'You gave it to her. Of course you did.',
    "I won't say I told you so. I'll just wait.",
  ],
  self: [
    'Smart. Or scared. Same thing, most days.',
    'Come find me when it stops feeling like yours.',
  ],
  ostra: [
    'There. Was that so hard.',
    'Now we wait and see what it does with the attention.',
  ],
};
