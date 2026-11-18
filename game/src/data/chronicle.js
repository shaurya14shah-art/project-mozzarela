// ══════════════════════════════════════════════════════════
// THE CHRONICLE — the storyline, as a spine rather than a checklist
//
// ── WHY THIS EXISTS ───────────────────────────────────────
// Owner: "write a concrete story line for the game."
//
// ⚠️ THE STORY WAS NEVER UNWRITTEN. `data/story.js` holds genuinely
// good prose — Aris's forty years of doubt, Ostra's warning, twelve
// found-journal fragments. What did not exist was a SPINE: anything
// telling the player what the story is ABOUT, or letting them feel it
// arriving. The seven quests were objectives with one-line captions
// ("Fell three Skeletons in the fields"), the dialogue was delivered
// as corner toast notifications, and nothing anywhere named an act, a
// turn, or a revelation.
//
// This file is the missing half: seven ACTS, each with the thing the
// player learns, the line that turns it, and the question it leaves
// them holding. `ui/SceneUI.js` is how it reaches them.
//
// ── THE SPINE, IN ONE PARAGRAPH ───────────────────────────
// The Sanctuary teaches that the Fracture is a wound and harvesting it
// is mercy. It is not a wound. It is a door, it was shut deliberately
// by people who came before, and the Sanctuary built its floor on top
// of the lock without ever looking down. Every Pioneer who attunes is
// being slowly rewritten by what is on the other side — that is not a
// side effect of the harvest, it is the harvest's purpose, running in
// the other direction. The Mithril Core is not a prize buried in the
// deep. It is the bolt. And by the time you can reach it you are no
// longer a neutral party to the question of whether it should be
// drawn.
//
// ── THE THREE ENDINGS, AND WHY NONE IS CORRECT ────────────
//   ARIS  — shut it. The Doctrine was right for the wrong reasons.
//           Everything attunement gave anyone goes back. Including you.
//   SELF  — hold it. Neither shut nor open: someone decides, every
//           day, forever, and you volunteer to be that someone.
//   OSTRA — open it. Stop pretending the door was ever ours. Find out
//           what has been waiting to be let in, and what it makes of us.
//
// ⚠️ The existing FINALE_NARRATION in story.js already writes all
// three. This file does not replace that text — it gives it the six
// acts of build-up it was always missing.
//
// ⚠️ VOICE (§3, and story.js's own header): quiet dread, restrained,
// literary, second-guessing. Nobody announces a twist. The horror is
// that everyone involved is reasonable.
// ══════════════════════════════════════════════════════════

/**
 * One act per main quest, in order. `questId` binds it to
 * QuestSystem's own list — ⚠️ by ID, never by index, so inserting a
 * quest cannot silently re-point every act to the wrong chapter.
 */
export const ACTS = [
  {
    questId: 'mq1',
    number: 'I',
    title: 'The Gate',
    // Shown as a chapter card the moment the act opens.
    epigraph: 'What spills, we gather. What gathers, we give back changed.',
    // Two or three lines. This is the act's THESIS, not a summary of
    // its objective — the objective is in the quest.
    card: [
      'They give you a wand, a name for what you are, and a direction.',
      'Nobody in the Sanctuary can tell you what the Fracture is. They can all tell you what it is for.',
    ],
    // The question the player should be holding when the act ends.
    leaves: 'Who decided this was mercy?',
  },
  {
    questId: 'mq2',
    number: 'II',
    title: 'What Lingers',
    epigraph: "It doesn't vanish when the body stops moving. It just changes hands.",
    card: [
      'The first thing you kill does not finish dying.',
      'Something comes off it and goes somewhere, and the somewhere is you.',
      'The Doctrine has a word for this. The word explains nothing and everyone uses it anyway.',
    ],
    leaves: 'If essence only ever changes hands — whose hands were these before?',
  },
  {
    questId: 'mq3',
    number: 'III',
    title: 'The Useful Metaphor',
    epigraph: 'A frightened Pioneer who thinks they are healing something fights harder.',
    card: [
      'Elder Aris has told forty years of Pioneers that the sky is a wound and the Sanctuary is its bandage.',
      'He tells you he stopped believing it some time ago.',
      'He keeps telling it. He explains, without being asked, exactly why.',
    ],
    leaves: 'How much of the Doctrine is a lie, and how much is only a dressing?',
  },
  {
    questId: 'mq4',
    number: 'IV',
    title: 'The Floor We Built On',
    epigraph: 'The stonework three levels down is not ours. The joints are too clean.',
    card: [
      'Beneath the Sunken Foundations there is older work, and it was not built to keep anyone out.',
      'The golems down there are not guarding a treasure. They are holding a door.',
      'The Sanctuary laid its floor across the top of it and called the job finished.',
    ],
    leaves: 'What did the people before us know that made them build a lock instead of a wall?',
  },
  {
    questId: 'mq5',
    number: 'V',
    title: 'The One Who Stayed',
    epigraph: 'The shape holds. The person inside it does not always.',
    card: [
      'Ostra was a Pioneer, once, on the same errand, with the same wand.',
      'They went deeper than the Doctrine permits and did not come back wrong so much as come back MORE.',
      'They are the only person who will answer your questions directly. That is the part that should worry you.',
    ],
    leaves: 'Is Ostra a warning, or an invitation, or the same thing said twice?',
  },
  {
    questId: 'mq6',
    number: 'VI',
    title: 'Unmoored',
    epigraph: 'It moves like something remembering how, badly, one joint at a time.',
    card: [
      'Vell went further than Ostra and kept going.',
      'What is left does not haunt the valley. It is not finished enough to haunt anything.',
      'The Sanctuary will call putting it down a mercy. By now you know what that word costs here.',
    ],
    leaves: 'How far along this road are you, and would you be able to tell?',
  },
  {
    questId: 'mq7',
    number: 'VII',
    title: 'What the Fracture Wants',
    epigraph: 'A wound closes. This one learned to want visitors.',
    card: [
      'The Mithril Core was never treasure. It is the bolt, and it has been working itself loose for a hundred years with help.',
      'Aris wants it shut. Ostra wants it opened. Neither of them can reach it.',
      'You can. That is the only reason either of them has ever been kind to you.',
    ],
    leaves: 'Shut it, hold it, or open it — and none of the three is the safe one.',
  },
];

/** Act for a quest id, or null. ⚠️ By id — see the note above. */
export function actFor(questId) {
  return ACTS.find(a => a.questId === questId) || null;
}

/**
 * Quest text with STAKES rather than instructions.
 *
 * ⚠️ These REPLACE QuestSystem's `desc` at boot rather than being
 * edited into it, so the mechanical definition (type, target, targetId,
 * reward) stays the single source of truth for what the quest DOES.
 * A rewrite that touched both would eventually disagree with itself
 * about which skeleton counts.
 *
 * ⚠️ `objective` is the plain instruction, kept separate and shown
 * under the flavour. A player who cannot find the actual task is not
 * having an atmospheric experience, they are lost — §5's own lesson
 * about the Descent tracker ("it said where you were, never what to
 * do").
 */
export const QUEST_TEXT = {
  mq1: {
    title: 'Awakening',
    flavour: 'The gate opens outward and has never been locked. That has never been what kept anyone in.',
    objective: 'Leave the Sanctuary and walk into the wilds.',
  },
  mq2: {
    title: 'First Blood, First Doubt',
    flavour: 'Kill three of the risen and watch what comes off them. The Doctrine says it dissipates. Watch anyway.',
    objective: 'Fell three skeletons beyond the gate.',
  },
  mq3: {
    title: "The Elder's Wisdom",
    flavour: 'Aris has an answer ready. He has had forty years to make it a good one.',
    objective: 'Speak with Elder Aris in the Sanctuary.',
  },
  mq4: {
    title: 'The Buried Shard',
    flavour: 'Under the Sunken Foundations is stonework nobody in the Sanctuary laid. Bring back a piece of what it was built around.',
    objective: 'Recover a fragment of the Mithril Core from the Sunken Foundations.',
  },
  mq5: {
    title: 'The Long-Attuned',
    flavour: 'There is someone out past the Hanged Choir who stopped being a Pioneer without ever stopping.',
    objective: 'Find Ostra in the wilds and hear them out.',
  },
  mq6: {
    title: 'The Unmoored',
    flavour: "Vell was a person. Vell is now a demonstration of what the attunement does when nobody tells it to stop.",
    objective: "End Vell at Vell's Hollow.",
  },
  mq7: {
    title: 'What the Fracture Wants',
    flavour: 'Both of them have been preparing you for this errand since the day you walked through the gate. Neither of them lied to you. That is not the same as being honest.',
    objective: 'Decide what becomes of the Mithril Core.',
  },
};
