// ══════════════════════════════════════════════════════════
// The Sanctuary — the safe spawn, its people, and the tutorial
//
// ── WHY THIS EXISTS ───────────────────────────────────────
// The hub used to be built out of the same broken-masonry vocabulary
// as the wilderness: a scaled-up `forgeRuin` for its hall, deliberately
// unlit, with two NPCs standing in it. It was atmospheric and it was a
// design mistake, because dread needs a baseline. If the place you
// spawn looks exactly like the place you are supposed to be frightened
// of, the frightening place is just "the game," and nothing lands.
//
// So the Sanctuary is now a REGULAR RPG town, on purpose and without
// irony: an intact keep with lit windows, braziers, a well, market
// stalls, a named cast who each do one job, and a tutorial that teaches
// the loop before anything is allowed to hurt you. The dark fantasy is
// what you walk OUT into.
//
// ── THE CAST ──────────────────────────────────────────────
// Everyone here has exactly one function and one voice. Nobody is
// mysterious. That is the point — Ostra is mysterious, the wilderness
// is mysterious, and both read better against people who simply tell
// you where the smithy is.
//
// ⚠️ These are ordinary NPCs. Nothing in this file may consult
// LeaningSystem or AscentSystem — those are the PLAYER's systems (see
// LeaningSystem's header). A shopkeeper does not have a philosophy.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { ELEMENTS } from './constants.js';

/**
 * Fixed hub positions. World coordinates, not chunk-local — the hub is
 * one place and treating it as one coordinate space is what lets the
 * journal's map draw everyone without a per-chunk translation step.
 *
 * Laid out around the plaza (radius ~17, keep at z −11, well at z +1,
 * market row at x +11.5) so nobody stands inside a building or on top
 * of the spawn point.
 */
export const SANCTUARY_NPCS = [
  {
    id: 'captain_npc',
    name: 'Captain Hald',
    role: 'Watch Captain',
    variant: 'elder',
    // The tutorial's voice. Deliberately the first person you meet:
    // brisk, practical, entirely uninterested in the metaphysics.
    position: new THREE.Vector3(-4, 0, 12),
    rotation: 0,
    mapLabel: 'Captain Hald',
    dialog: [
      'New Pioneer. Good — we are short.',
      'Walls first, questions later. Speak to me when you want work.',
    ],
    givesQuest: 't1',
  },
  {
    id: 'quartermaster_npc',
    name: 'Quartermaster Bel',
    role: 'Quartermaster',
    variant: 'villager',
    position: new THREE.Vector3(11.5, 0, -1.5),
    rotation: -Math.PI / 2,
    mapLabel: 'Quartermaster',
    dialog: [
      'Everything on this counter came off someone who did not come back. Take it anyway.',
      'The satchel is yours to fill. Press I and you will see what you are carrying.',
    ],
  },
  {
    id: 'smith_npc',
    name: 'Smith Orren',
    role: 'Blacksmith',
    variant: 'villager',
    element: ELEMENTS.FIRE,
    position: new THREE.Vector3(11.5, 0, 5.5),
    rotation: -Math.PI / 2,
    mapLabel: 'Smithy',
    dialog: [
      'Bring me ore and I will bring you something that holds an edge.',
      'Press F at the forge. I will not do it for you — you will want to know how.',
    ],
  },
  {
    id: 'alchemist_npc',
    name: 'Sister Merrow',
    role: 'Alchemist',
    variant: 'villager',
    element: ELEMENTS.ARCANE,
    position: new THREE.Vector3(-11, 0, -2),
    rotation: Math.PI / 2,
    mapLabel: 'Apothecary',
    dialog: [
      'Potions are potions. Boil the right things together and you get something that helps.',
      'The cauldron is B. Do not put anything in it that came out of a Descent — those are for the forge, not the pot.',
    ],
  },
  {
    id: 'archivist_npc',
    name: 'Archivist Pell',
    role: 'Archivist',
    variant: 'elder',
    element: ELEMENTS.LIGHT,
    position: new THREE.Vector3(-8, 0, -9),
    rotation: Math.PI / 3,
    mapLabel: 'Archive',
    dialog: [
      'Everything anyone has written down about the Fracture is in there, and none of it agrees.',
      'Press L for the codex. If you find a journal out in the fields, bring it to me — or read it yourself, I am not precious.',
    ],
  },
  {
    id: 'gatewarden_npc',
    name: 'Gate-Warden Tove',
    role: 'Gate-Warden',
    variant: 'villager',
    position: new THREE.Vector3(2, 0, 25),
    rotation: Math.PI,
    mapLabel: 'The Gate',
    dialog: [
      'Past this line the ground stops being ours.',
      'Come back before dark. Most do not, but I say it to everyone.',
    ],
    // ⚠️ THE FIX for "the dungeons cannot be located". Talking to Tove
    // runs ChunkManager.scoutGates() and marks the nearby Descent Gates
    // known, which puts them on the journal map and lights the HUD
    // compass. Knowing where the Gates are is literally this
    // character's job, so the mechanic and the fiction are the same
    // thing rather than a UI affordance bolted onto a person.
    scoutsDescents: true,
  },
];

/**
 * The tutorial chain.
 *
 * ⚠️ These are a THIRD quest list, separate from QuestSystem's `quests`
 * (the mq1–mq7 main arc) and `sideQuests` (sq1–sq3). Deliberately not
 * prepended to the main arc: mq1 is "Awakening — leave the Sanctuary
 * Hub," and a tutorial that has to complete before the main quest can
 * start would mean the player's first tracked objective is a chore.
 * These run ALONGSIDE, complete in the hub, and are auto-advanced by
 * the things they are teaching rather than by talking to anyone.
 *
 * Each one teaches exactly one verb and says so in plain language. No
 * atmosphere in the objective text — atmosphere is for the world, and
 * a player who cannot find the cauldron is not being immersed.
 */
export const TUTORIAL_QUESTS = [
  {
    id: 't1',
    title: 'Getting Your Bearings',
    desc: 'Walk the Sanctuary. Speak with three of its people.',
    hint: 'Walk up to anyone and press E. The prompt appears when you are close enough.',
    type: 'talk_any',
    target: 3,
    reward: { type: 'item', id: 'iron_ore', count: 3 },
  },
  {
    id: 't2',
    title: 'The Weight of It',
    desc: 'Swing at the training post behind the keep.',
    hint: 'Left mouse swings. Hold to keep swinging.',
    type: 'strike_dummy',
    target: 5,
    reward: { type: 'item', id: 'leather', count: 2 },
  },
  {
    id: 't3',
    title: 'Steel of Your Own',
    desc: 'Open the Forge (Tab, then F) and smith something — the Iron Sword wants 5 iron ore and 1 leather.',
    hint: 'Keys 1–6 cast. Hold a key to channel it into something heavier.',
    type: 'forge',
    target: 1,
    reward: { type: 'item', id: 'steel_ingot', count: 1 },
  },
  {
    id: 't4',
    title: 'Out Past the Line',
    desc: 'Leave through the gate and find a Descent Gate in the wilds.',
    hint: 'Descent Gates are lit doorways. Press E at one to go down. Do not go down at a tier above you.',
    type: 'find_gate',
    target: 1,
    reward: { type: 'item', id: 'steel_ingot', count: 2 },
  },
];

/**
 * Everything the journal's map draws, in world coordinates.
 *
 * The hub is hand-placed, so this is hand-written — there is no
 * procedural source to read it from, and generating it would mean
 * inventing a registry that only this map would ever use.
 */
export const HUB_MAP_FEATURES = [
  { kind: 'building', label: 'The Keep', x: 0, z: -11, r: 7 },
  { kind: 'well', label: 'Well', x: 0, z: 1, r: 1.6 },
  { kind: 'market', label: 'Market', x: 11.5, z: 2, r: 3 },
  { kind: 'gate', label: 'Gate', x: 0, z: 28, r: 2 },
];
