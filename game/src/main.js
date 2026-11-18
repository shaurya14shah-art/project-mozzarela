// ══════════════════════════════════════════════════════════
// Main Entry Point
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GodRaysPass } from './rendering/GodRaysPass.js';
import { CinematicGradeShader, applyGradePreset } from './rendering/CinematicGrade.js';

import { engine } from './core/Engine.js';
import { input } from './core/InputManager.js';
import { sceneManager } from './rendering/SceneManager.js';
import { cameraController } from './rendering/CameraController.js';
import { modelLibrary } from './rendering/ModelLibrary.js';
import { ChunkManager } from './world/ChunkManager.js';
import { player } from './entities/Player.js';
import { EnemySpawner, Enemy, typeIndexOf } from './entities/Enemy.js';
import { gatherSystem } from './systems/GatherSystem.js';
import { prewarmFauna } from './rendering/Fauna.js';
import { caveSystem } from './systems/CaveSystem.js';
import { LOADED_CAMPS } from './world/WorldFeatures.js';
import { crafting } from './systems/CraftingSystem.js';
import { familyOf, LINES } from './data/steel.js';
import { steelHUD } from './ui/SteelHUD.js';
import { eventBus, Events } from './core/EventBus.js';
import { pickupManager } from './entities/Pickup.js';
import { inventory } from './systems/InventorySystem.js';
import { MATERIALS } from './data/materials.js';
import { npcManager } from './entities/NPCManager.js';
import { inventoryUI } from './ui/InventoryUI.js';
import { forgeUI } from './ui/ForgeUI.js';
import { cauldronUI } from './ui/CauldronUI.js';
import { wandMenuUI } from './ui/WandMenuUI.js';
import { attunementUI } from './ui/AttunementUI.js';
import { targetReadUI } from './ui/TargetReadUI.js';
import { questSystem } from './systems/QuestSystem.js';
import { projectileManager } from './entities/Projectile.js';
import { wandSystem } from './systems/WandSystem.js';
import { wandUI } from './ui/WandUI.js';
import { characterPreviewUI } from './ui/CharacterPreviewUI.js';
import { grimoireUI } from './ui/GrimoireUI.js';
import { potionSystem } from './systems/PotionSystem.js';
import { getItem, registerItem } from './data/itemRegistry.js';
import { FORMS } from './data/essences.js';
import { buildSpell } from './data/spellcraft.js';
import { getPath, setPath } from './data/paths.js';
import { attunement } from './systems/AttunementSystem.js';
import { GrassField } from './rendering/GrassField.js';
// Living terrain: one air for everything (world/Wind.js), ground cover
// beyond grass (rendering/Flora.js), what the air carries
// (rendering/AmbientParticles.js). Water lives in ChunkManager.water.
import { wind } from './world/Wind.js';
import { Flora } from './rendering/Flora.js';
import { AmbientParticles } from './rendering/AmbientParticles.js';
import { BiomeWarmup } from './rendering/BiomeWarmup.js';
import { lightPool } from './rendering/LightPool.js';
import { buildArm, poseArm } from './rendering/Hand.js';
import { MOTION, samplePose, IMPACT_LAG } from './rendering/WeaponMotion.js';
// The Facet Grammar's runtime: composed skills cast through one executor
// and animate from their own motion × trait × seed (data/facets.js).
import { facetCaster } from './systems/FacetCaster.js';
// The combat overhaul: tap/hold/block/parry/lock (systems/CombatSystem.js)
// and the readout that makes a fight legible (ui/CombatHUD.js).
import { combatSystem } from './systems/CombatSystem.js';
import { combatHUD } from './ui/CombatHUD.js';
import { pauseMenu } from './ui/PauseMenu.js';
import { attackClip, skillClip, heavyClip, guardPose, sampleClip, steelClip, PROFILE as CHOREO } from './rendering/Choreo.js';
import { registerWanderers } from './rendering/Wanderer.js';
import { atmosphere } from './rendering/Atmosphere.js';
import { quality } from './rendering/Quality.js';
import { perfHUD } from './ui/PerfHUD.js';
import { environmentIBL } from './rendering/EnvironmentIBL.js';
import { weather } from './rendering/Weather.js';
import { materialLibrary } from './rendering/MaterialLibrary.js';
import { NATURE_SLUGS, NATURE_BASE_URL } from './data/natureModels.js';
import { composition } from './systems/CompositionSystem.js';
import { saturation } from './systems/SaturationSystem.js';
import { sigil, elementGlyph, cornerFiligree, ruleOrnament, fractureRule } from './ui/Sigil.js';
import { ascentSystem } from './systems/AscentSystem.js';
import { descentSystem } from './systems/DescentSystem.js';
import { RESOLUTIONS } from './data/descents.js';
import { forgeWand, animateWand, retintWand, forgeWeapon, animateWeapon, weaponPlanKey } from './rendering/EntityForge.js';
// Namespace import purely so the debug handle below can expose the whole
// module (playCreatureHit/Death, animateCreature, ...) for console-driven
// verification without each one needing its own named import here.
import * as EntityForge from './rendering/EntityForge.js';
import { particleBursts } from './rendering/ParticleBursts.js';
import { weaveVFX } from './rendering/WeaveVFX.js';
import { gearHalo } from './rendering/GearHalo.js';
import { audioSystem } from './systems/AudioSystem.js';

import { leaning } from './systems/LeaningSystem.js';
import { journalUI } from './ui/JournalUI.js';
import { bindSystem, keyLabel } from './systems/BindSystem.js';
import { bindUI } from './ui/BindUI.js';
import { spoilsSystem } from './systems/SpoilsSystem.js';
import { ascentUI } from './ui/AscentUI.js';
import { SKILLS } from './data/skills.js';
import { PLAYER, MATERIAL_TIERS, WORLD, ELEMENT_COLORS } from './data/constants.js';
// ⚠️ WEAPON_MELEE is read by checkCombatCollisions on the player's own
// swing path. A missing import here would NOT fail `vite build` — the
// call site only runs when someone actually attacks (trap #18).
import { WEAPON_MELEE } from './data/memories.js';
import { LORE_FRAGMENTS, UNEASE_WHISPERS, VELL, FINALE_NARRATION } from './data/story.js';
import { LANDMARKS, landmarkWorldPos, landmarkForQuest } from './data/landmarks.js';
import { overlayManager } from './ui/OverlayManager.js';
import { loreSystem } from './systems/LoreSystem.js';
import { saveSystem, migrateLegacySave } from './systems/SaveSystem.js';
import { siteSystem, SITE_KINDS } from './systems/SiteSystem.js';
import { boonSystem } from './systems/BoonSystem.js';
import { epithetSystem } from './systems/EpithetSystem.js';
// Character level — the ungated progression floor beneath the Ascent.
// See the file header for why it is a fourth system rather than a
// field on one of the existing three.
import { progressSystem } from './systems/ProgressSystem.js';
// What you ARE (lineage) and what your weapon has woken into.
// See data/lineages.js for why these are two files and not one.
import { lineageSystem } from './systems/LineageSystem.js';
import { awakeningSystem } from './systems/AwakeningSystem.js';
import { lineageUI } from './ui/LineageUI.js';
// The Loom (B) forges Memories now — see data/memories.js.
import { memoryForgeUI } from './ui/MemoryForgeUI.js';
import { memoryForge } from './systems/MemoryForge.js';
// Marks — the fourth build knob. See the file header.
import { markSystem } from './systems/MarkSystem.js';
// 3 weapon slots + the derived 1..9 hotbar. See the file header.
import { loadout, WEAPON_SLOTS, HOTBAR_KEYS } from './systems/LoadoutSystem.js';
import { nightmareSystem, PHASE } from './systems/NightmareSystem.js';
// ⚠️ Imported explicitly. `vite build` does NOT fail on a missing
// import whose call site is only reached at runtime (trap #18) — an
// unimported forge here builds green and throws the first time a
// player finishes their First Nightmare, which is the worst possible
// moment to discover it.
import { forgeDescentGate } from './rendering/PropForge.js';
import * as PropForge from './rendering/PropForge.js';
import { prewarmSculpts } from './rendering/Sculpt.js';
// Rank — the convex axis and the Refusal cap. See data/ranks.js.
import { rankMatchup, rankForLevel, rankName } from './data/ranks.js';
// ⚠️ Used by _quarrySigns(). A missing import here does NOT fail
// `vite build` — the call site is only reached when a Hunt is
// resolved, so it would ship as a ReferenceError the first time a
// player cleared one. Same trap as roundedBox in EntityForge.
import { hexField, runeForPath, GRID_RADIUS } from './data/runes.js';
import { coreSystem } from './systems/CoreSystem.js';
import { threadSystem } from './systems/ThreadSystem.js';
import { codexUI } from './ui/CodexUI.js';
import { menuUI } from './ui/MenuUI.js';
import { sceneUI } from './ui/SceneUI.js';
import { ACTS, actFor } from './data/chronicle.js';

// Game state
let composer;
let _menuBackdropStop = null; // set while the character-creation/loading screens are up; see startMenuBackdrop()
let _gradePass;
let _aoPass = null;       // GTAOPass, high/ultra only
let _grass = null;
let _flora = null, _ambient = null;
let _biomeWarm = null;   // compiles upcoming biomes' shaders ahead of arrival (rendering/BiomeWarmup.js)
let _wadeT = 0, _wasInWater = false;
/** Build the flora and particles beside the grass (same two call sites). */
function _ensureLivingTerrain(scene) {
  if (!_flora) {
    _flora = new Flora(
      (x, z) => chunkManager.getGroundY(x, z),
      (x, z) => chunkManager.biomeManager.getBiomeForChunk(Math.floor(x / WORLD.CHUNK_SIZE), Math.floor(z / WORLD.CHUNK_SIZE)),
      (x, z) => chunkManager.getWaterAt(x, z));
    if (_flora.enabled) scene.add(_flora.mesh);
  }
  if (!_ambient) { _ambient = new AmbientParticles(); if (_ambient.enabled) scene.add(_ambient.group); }
}
const _vmShoulder = new THREE.Vector3(), _vmPos = new THREE.Vector3(), _vmQuat = new THREE.Quaternion(), _vmQuatB = new THREE.Quaternion(), _vmEuler = new THREE.Euler();
let _godRaysPass = null;  // GodRaysPass, high/ultra only
let _lastRayTime = 0;     // god-ray pass timing, see render()
let _syncRenderSize; // set inside setupPostProcessing(); resize + adaptive quality both call it
let chunkManager;
let enemySpawner;
let gameStarted = false;
let characterCreated = false;

// First-person wand viewmodel — the player's body is hidden (see
// Player.js), so this is the only thing standing in for "you" on
// screen: a camera-parented wand that sways with a fast look, bobs
// with your stride, punches forward on attack, and swells while
// you're channelling a cast.
let viewmodel = null;
let _vmPrevYaw = 0;
let _vmPrevPitch = 0;
let _vmSwayYaw = 0;
let _vmSwayPitch = 0;
let _vmWasAttacking = false;



// A Facet in progress: { clip, t } baked by rendering/Choreo.js.
let _vmSkill = null;
// Where the weapon hand's FIST sits at rest, in viewmodel-group space —
// low, right of centre, within a forearm's reach. Every weapon is shifted
// so its own grip lands here (see _equipViewmodelWeapon): a scythe or a
// spear is held at the butt, and positioning the WEAPON rather than the
// HAND left those fists below the bottom of the screen.
const _VM_FIST = new THREE.Vector3(0.27, -0.3, -0.42);
// Where the back of each hand should face, in camera space: out, up and
// toward the eye (mirrored for the left hand).
const _vmDorsum = new THREE.Vector3();
// The choreography's output each frame (rendering/Choreo.js): hand
// position, weapon orientation and the camera layer.
const _vmH = new THREE.Vector3(), _vmQ = new THREE.Quaternion();
const _vmCam = { pitch: 0, yaw: 0, roll: 0, dip: 0, push: 0 };
let _vmOffNear = false;
let _vmAtk = null;            // the swing in progress: { clip, t, rate } — its own clock
let _vmBlockKick = 0;         // 1 → 0: the guard jolting as a blow lands on it
let _vmWasBlocking = false, _vmWasCharging = false;
// Crossfade between clips (a new beat mid-recovery, a Facet mid-swing):
// the last pose shown blends into the new source over XF seconds.
const _vmLast = { h: new THREE.Vector3(0.27, -0.3, -0.42), q: new THREE.Quaternion(), cam: { pitch: 0, yaw: 0, roll: 0, dip: 0, push: 0 } };
const _vmX = { h: new THREE.Vector3(), q: new THREE.Quaternion(), t: 1, dur: 0.09 };
function _crossfade(dur = 0.09) { _vmX.h.copy(_vmLast.h); _vmX.q.copy(_vmLast.q); _vmX.t = 0; _vmX.dur = dur; }
let _lastSpellAt = -1e9;      // when the wand last cast (two-handers let go for it)
const _VM_WAND_GRIP = new THREE.Vector3(0, -0.215 * 0.8, 0);
const _vmPole = new THREE.Vector3();
const _vmPos2 = new THREE.Vector3();
let _wandRestPose = null;
/** The focus's (wand's) stance as a choreography rest pose. */
function _wandRest() {
  if (_wandRestPose) return _wandRestPose;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.82, -0.32, -0.18));
  const h = new THREE.Vector3(0.30, -0.25, -0.56).add(_VM_WAND_GRIP.clone().applyQuaternion(q));
  return (_wandRestPose = { h, q });
}
/** Start a Facet's choreography; the clip is baked against whatever is in hand. */
function _startSkillAnim(spec, seed) {
  const key = viewmodel?.weapon ? (viewmodel.key || 'sword') : 'focus';
  const rest = viewmodel?.weapon ? viewmodel.rest : _wandRest();
  const clip = skillClip(key, spec, rest, seed);
  _vmSkill = { clip, t: 0 };
  _vmAtk = null;
  _crossfade();
  if (_vmBorrow) _vmBorrow.until = clip.dur + 0.15;
  return clip;
}

/** Which part of the weapon a composed Facet wakes — by what it does. */
function _facetPart(spec) {
  const w = spec.weaponType;
  if (w === 'staff' || w === 'grimoire' || w === 'focus') return 'focus';
  if (w === 'warhammer' || w === 'axe') return 'head';
  if (spec.delivery === 'line' || spec.delivery === 'point' || w === 'spear' || w === 'bow') return 'point';
  return 'edge';
}

// ══════════════════════════════════════════════════════════
// THE BORROWED WEAPON — using another slot's Aspect shows THAT weapon
//
// Owner: "whenever I have equipped one weapon, but I use the skill of
// the other, the model of the initial weapon remains, it should
// change."
//
// Correct, and it made every off-hand Aspect read as a bug: the
// viewmodel is driven solely by `loadout.activeWeapon`, so firing the
// scythe's Reap while holding a dagger swung the DAGGER through a
// scythe's animation. The hotbar deliberately pools all three combat
// slots onto keys 1..9 (§7 — "switching slots changes what you swing,
// never what your number keys do"), which is exactly what makes this
// visible: most Aspects you press belong to something you are not
// holding.
//
// The weapon is brought up for the swing and put away after. It is a
// PURELY VISUAL swap — `loadout.activeSlot`, `player.weaponAtk` and
// the melee profile are all untouched, so what you are actually
// holding never changes under you.
// ══════════════════════════════════════════════════════════

/** { until } while another slot's weapon is in frame, else null. */
let _vmBorrow = null;

/** The viewmodel descriptor for a Memory, or null for empty hands. */
function _vmDescriptorFor(mem) {
  if (!mem || mem.formId === 'echo' || !mem.weaponType) return { weaponType: null };
  return {
    weaponType: mem.weaponType,
    element: mem.element,
    tierLevel: mem.tier?.level || 1,
    seed: mem.id,
    metal: mem.metal || null,
  };
}

/**
 * Put the real in-hand weapon back in frame.
 *
 * ⚠️ Goes through `_equipViewmodelWeapon` directly rather than
 * `player.equipWeapon()`. That method is the one writer of
 * `weaponAtk`, emits UI_NOTIFY and rebuilds the BODY rig too — running
 * it to undo a cosmetic swap would announce "Equipped X" every time an
 * Aspect finished and re-apply the awaken glow on a loop.
 */
function _restoreViewmodelWeapon() {
  _vmBorrow = null;
  _equipViewmodelWeapon(_vmDescriptorFor(loadout.activeWeapon));
}

/**
 * Bring another slot's weapon up for the length of its animation.
 *
 * ⚠️ Does nothing when the Aspect belongs to the weapon already in
 * hand — re-forging the identical mesh mid-swing would restart its
 * materialisation and cancel the swing's own animation.
 *
 * ⚠️ Non-weapon Memories (charms, relics, Echoes) deliberately do NOT
 * swap anything. They have no weapon model, and `_vmDescriptorFor`
 * would hand `forgeWeapon` an absent `weaponType` — trap #11's
 * fallback, which puts a phantom sword in the hands of someone
 * triggering a charm. Their Aspect plays on whatever is held, which is
 * the honest reading: the charm did it, not your hands.
 */
function _borrowViewmodelWeapon(mem, seconds) {
  if (!mem || mem.formId !== 'weapon' || !mem.weaponType) return;
  if (loadout.activeWeapon && loadout.activeWeapon.id === mem.id) return;
  _equipViewmodelWeapon(_vmDescriptorFor(mem));
  // ⚠️ Held a little past the motion so the weapon is still in frame
  // as the swing settles; snapping it away on the last animation frame
  // reads as a flicker rather than as putting something away.
  _vmBorrow = { until: seconds + 0.22 };
}

function _updateViewmodelBorrow(dt) {
  if (!_vmBorrow) return;
  _vmBorrow.until -= dt;
  if (_vmBorrow.until <= 0) _restoreViewmodelWeapon();
}

// ══════════════════════════════════════════════════════════
// THE EDGE WAKES — the part that does the work lights up
//
// Owner: *"the split animation looks really bad, it shouldn't be used,
// use something different for the same, but the splitting if needed
// can be done to highlight a part of the weapon used to use the
// attack."*
//
// The shatter is GONE. Flinging a weapon into its component meshes was
// the wrong idea twice over: it read as the model falling apart rather
// than as a strike, and a cloud of tumbling parts buried the ability's
// own arc/ring/lance underneath it — the effect competed with the
// thing it was supposed to announce.
//
// What replaced it does the job the owner actually described: the part
// of the weapon that DOES the attack wakes up. A cut lights the edge,
// a thrust lights the point, a hammer blow lights the head, a cast
// lights the focus stone. The weapon stays whole and readable; the eye
// is told where the power went.
//
// ── WHY THIS READS AND THE SHATTER DID NOT ────────────────
// A strike is a thing a weapon DOES, not a thing that happens TO it.
// Light travelling into the working end says "this end is what matters
// now" in a way that is instantly legible at speed, and it survives
// being seen a hundred times because it does not disturb the
// silhouette the player has learned.
//
// ⚠️ MATERIALS ARE SHARED AND CACHED (see PropForge's plainMat and
// EntityForge's `cached`). Writing emissive straight onto a part's
// material would light up EVERY weapon in the game that shares it —
// the halo satellites, the body rig, other slots. Each highlighted
// mesh therefore gets a private clone the first time it is lit, kept
// on the mesh, and swaps between the two. One clone per part per
// weapon instance, made lazily and never in the frame loop after that.
// ══════════════════════════════════════════════════════════

/** Which named part each ability wakes. Falls back to the edge. */
const ASPECT_PART_FOR = {
  // Cuts and sweeps — the edge.
  hew: 'edge', sweep: 'edge', cleave: 'edge', sever: 'edge', gore: 'edge',
  reap: 'edge', whirl: 'edge', maim: 'edge', sunder: 'edge', cascade: 'edge',
  rebuke: 'edge', bloom: 'edge', unmake: 'edge',
  // Thrusts — the point.
  skewer: 'point', thread: 'point', nail: 'point', impale: 'point',
  lunge: 'point', gutter: 'point', riposte: 'point', charge: 'point', rush: 'point',
  // Blunt force — the head.
  quake: 'head', pommel: 'head',
  // Castings and calls — the focus stone.
  volley: 'focus', conduit: 'focus', verse: 'focus', scatter: 'focus',
  fan: 'focus', chorus: 'focus', chime: 'focus', hollow: 'focus',
  summon: 'focus', swarm: 'focus', mirror: 'focus', unseen: 'focus',
  still: 'focus', aegis: 'focus', anchor: 'focus', knit: 'focus',
  brace: 'focus', step: 'focus', slip: 'focus', blink: 'focus', vault: 'focus',
};

/** The live highlight, or null. */
let _vmGlow = null;

/**
 * Wake the working part of the held weapon.
 *
 * @param {string} part 'edge' | 'point' | 'head' | 'focus'
 * @param {number} strength 0..1-ish, scales the flare
 */
function _wakeWeaponPart(part, dur = 0.42, strength = 1) {
  const w = viewmodel?.weapon || viewmodel?.wand;
  if (!w) return;

  const hits = [];
  w.traverse((o) => {
    if (!o.isMesh) return;
    const role = o.userData?.part;
    // ⚠️ The focus stone is matched by NAME as well, because it is the
    // one part that already had a name before this existed
    // (`weapon-core`, set by _weaponAccent and read by animateWeapon).
    // Re-tagging it would have meant touching that contract too.
    const isFocus = role === 'focus' || o.name === 'weapon-core';
    if (part === 'focus' ? isFocus : role === part) hits.push(o);
  });
  // ⚠️ Nothing tagged for this part is a REAL outcome, not a failure —
  // a grimoire has no edge and a dagger has no head. Falling back to
  // the focus stone means every weapon still answers every ability,
  // which is what stops this reading as "the effect is broken on some
  // weapons".
  if (!hits.length) {
    w.traverse((o) => { if (o.isMesh && (o.userData?.part === 'focus' || o.name === 'weapon-core')) hits.push(o); });
  }
  if (!hits.length) return;

  for (const mesh of hits) {
    if (!mesh.userData._litMat) {
      // ⚠️ Cloned ONCE and kept. The base material is shared across
      // every weapon that uses it; writing emissive onto it would light
      // up the halo satellites and the body rig at the same time.
      mesh.userData._baseMat = mesh.material;
      mesh.userData._litMat = mesh.material.clone();
    }
    mesh.material = mesh.userData._litMat;
  }
  _vmGlow = { hits, t: 0, dur, strength: Math.max(0.3, Math.min(2, strength)) };
}

function _updateWeaponGlow(dt) {
  if (!_vmGlow) return;
  _vmGlow.t += dt;
  const u = Math.min(1, _vmGlow.t / _vmGlow.dur);
  // Fast ignition, long ember — the flare has to be at full strength on
  // the frames the damage actually lands, then cool off. A symmetric
  // curve peaks too late to coincide with the hit window.
  const e = u < 0.18 ? (u / 0.18) : (1 - (u - 0.18) / 0.82) ** 1.6;
  const k = Math.max(0, e) * _vmGlow.strength;

  _glowBoost = 2.6 * k;
  for (const mesh of _vmGlow.hits) {
    const mt = mesh.material;
    if (!mt || !mt.emissive) continue;
    // The element's own colour if the weapon has one, else a forge-heat
    // orange — a lit edge should look like metal at temperature.
    mt.emissive.setHex(_glowHex);
    // ⚠️ `wand-core` IS NOT WRITTEN HERE. `updateViewmodel` already
    // owns that field — it drives the channel pulse into it every
    // single frame, unconditionally. Writing it here too made this the
    // SECOND writer and the pulse simply overwrote the flare on the
    // same frame, so the wand never lit at all and the effect looked
    // like it had silently failed. That is trap #9 exactly, and the
    // fix is the one this project always uses: publish a factor and
    // let the existing owner fold it in (see `_weaponGlowBoost`).
    if (mesh.name === 'wand-core') continue;
    mt.emissiveIntensity = 2.6 * k;
  }

  if (u >= 1) {
    // ⚠️ Restored to the SHARED base material, not just dimmed. Leaving
    // the clone in place would mean every weapon that has ever been
    // swung is drawn with its own material forever — exactly the
    // material-duplication that the dedup pass took from 174 copies to
    // 42, undone one swing at a time.
    for (const mesh of _vmGlow.hits) {
      if (mesh.userData._baseMat) mesh.material = mesh.userData._baseMat;
    }
    _vmGlow = null;
    _glowBoost = 0;
  }
}

let _glowHex = 0xff8a3c;
/** The live flare, as an ADDITIVE contribution other owners fold in. */
let _glowBoost = 0;
export function _weaponGlowBoost() { return _glowBoost; }


// ══════════════════════════════════════════════════════════
// Initialization
// ══════════════════════════════════════════════════════════

async function initGame() {
  console.log('Initializing Project Mozzarela — The Fracture...');

  // Kick off the real-model decode/parse as early as possible — it can
  // plausibly outrun the ~1-2s fake loading-bar animation below on a
  // slow device, so it needs the biggest possible head start rather
  // than being started once the rest of boot is already done.
  const modelsReady = modelLibrary.preload();

  setupUI();

  sceneManager.init('game-canvas');
  // A FIXED set of real point lights — see rendering/LightPool.js. Must
  // exist before any light-bearing object, so the light count is stable
  // from the very first compiled shader.
  lightPool.init(sceneManager.scene);

  // HD PBR surface textures. Started right after the renderer exists
  // (it needs renderer.capabilities for anisotropy) and awaited
  // alongside the models below, so ~49MB of texture fetch overlaps the
  // loading bar instead of stalling after it. Resolves false — not
  // throws — when the textures aren't on disk.
  const texturesReady = materialLibrary.load(sceneManager.renderer);
  // Sculpted props (rendering/Sculpt.js — the giant's bones, statues,
  // spires, headstones). Meshed one per idle slice WHILE the loading bar
  // runs: the skull alone is ~0.5 s of CPU, which mid-game would be a
  // visible hitch the first time a chunk placed one.
  prewarmSculpts();

  // Photoscanned nature props (Poly Haven, CC0). Fetched over HTTP
  // rather than base64-embedded — see ModelLibrary.preloadExternal().
  // Only at HD tiers: `low` exists to reproduce the artifact build,
  // which has no external requests at all.
  const natureReady = quality.isHD
    ? modelLibrary.preloadExternal(NATURE_BASE_URL, NATURE_SLUGS, 'nature')
    : Promise.resolve(0);
  // Realistic people (rendering/Wanderer.js — RŌNIN's Mesh2Motion body,
  // dressed for the realm). HD tiers only, for the same reason as the
  // nature props; every humanoid falls back to its old model without it.
  const wanderersReady = quality.isHD
    ? registerWanderers(modelLibrary, '/hd/models')
    : Promise.resolve(0);
  particleBursts.init();
  weaveVFX.init();
  // What you have summoned, floating beside you. ⚠️ Takes the SCENE,
  // not the player's mesh — a satellite parented to the Pioneer would
  // inherit the body's own rotation and yaw around with every mouse
  // movement instead of trailing (the same reasoning WeaveVFX's header
  // gives for parenting effects to the scene).
  gearHalo.init({ scene: sceneManager.scene, player, cameraController });
  perfHUD.init(sceneManager.renderer, engine);
  // F6 — ambient enemy spawning on/off. Sits alongside PerfHUD's F3
  // (frame meter) and F4 (quality tier) as a developer/testing key
  // rather than a game setting, and reports its state so a toggle in
  // the middle of a session is never ambiguous.
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'F6' || !enemySpawner) return;
    e.preventDefault();
    const on = enemySpawner.setPeaceful(!enemySpawner.peaceful);
    eventBus.emit(Events.UI_NOTIFY, on
      ? 'Peace: ambient spawns off. Descent waves and named enemies still appear.'
      : 'Peace off: the wilderness is populated again.');
  });
  input.init(sceneManager.canvas);
  cameraController.init();
  // The camera itself has to be IN the scene graph, not just holding a
  // matrix the renderer reads directly — otherwise its own children
  // (the wand viewmodel, parented to it below) never get swept up by
  // the renderer's scene traversal and silently never draw, even
  // though they exist and follow the camera in memory.
  sceneManager.add(cameraController.camera);
  // ⚠️ BEFORE questSystem.init(). That call registers a BIOME_ENTER
  // listener, and the first chunkManager.update() below can complete
  // mq1 and request Act II's chapter card during boot — see
  // SceneUI._ensure() for what that cost the first time.
  sceneUI.init();
  questSystem.init();
  setupViewmodel();

  setupPostProcessing();

  chunkManager = new ChunkManager(Math.random() * 1000000 | 0);
  chunkManager.init();
  chunkManager.update(0, 0);
  // ⚠️⚠️ BOUNDED. This used to be `while (isStreaming) drain(1e9)` — an
  // unbounded synchronous build of EVERY queued chunk.
  //
  // That was survivable at the old RENDER_DISTANCE of 1 (9 chunks) and
  // catastrophic the moment render distance went up: at 5 it is 121
  // chunks, each with terrain plus hundreds of props, built with no
  // frame budget at all. The loading bar froze partway and the game
  // never became playable — the loop was still running, just for
  // minutes.
  //
  // Only the ring the player can actually fall through is built up
  // front. Everything else streams in through the same budgeted
  // drainChunkQueue() the update loop already calls, which is what that
  // budget exists for.
  const EAGER_MS = 900;
  const eagerStart = performance.now();
  while (chunkManager.isStreaming && performance.now() - eagerStart < EAGER_MS) {
    chunkManager.drainChunkQueue(60);
  }

  // ── Pre-compile ──
  // ⚠️ A material's shader program is compiled the first frame it is
  // actually SEEN, not when it is created — so a chunk streaming in
  // with an unseen material variant stalls the frame it appears on.
  // Measured worst frame while running: 1.6 SECONDS.
  //
  // renderer.compile() walks the scene and compiles everything in it
  // now, while the loading screen is still up and a stall costs
  // nothing. It cannot help with variants that do not exist yet (a
  // biome the player has not reached), but it removes every stall for
  // the spawn region, which is where the first minutes are spent.
  sceneManager.renderer.compile(sceneManager.scene, cameraController.camera);

  // The Sanctuary is fully built and sitting in GPU memory by this
  // point — nothing was ever painting it to the screen. Character
  // creation and the loading bar used to sit on a flat colour with the
  // actual game rendered and waiting right behind it, unseen. Start
  // painting it now, stopped the moment real gameplay begins (see
  // engine.start() below).
  _menuBackdropStop = startMenuBackdrop();

  enemySpawner = new EnemySpawner();

  // Descents need the spawner, the chunk manager, the player and a way
  // into the scene graph — all injected rather than imported, because
  // importing them would either be circular or would construct a
  // scene-graph singleton at module-import time (the deferred-init bug
  // class this project has hit repeatedly; see HANDOFF §3).
  journalUI.init({ questSystem, player, descentSystem });
  ascentUI.init({ ascentSystem, attunement });
  spoilsSystem.init({ spawner: enemySpawner, player });
  bindUI.init({ wandSystem, spoilsSystem, loadout });

  // ── THE ONE DOOR (Tab) ───────────────────────────────
  // ⚠️ Injected, never imported by MenuUI itself — eleven UI
  // singletons imported from one hub is a cycle waiting for the first
  // panel that wants to close the menu. Keys must match ENTRIES in
  // ui/MenuUI.js; a name that is listed but not passed warns rather
  // than rendering a row that does nothing.
  menuUI.init({
    memoryForgeUI, inventoryUI, lineageUI, ascentUI, bindUI,
    wandMenuUI, forgeUI, grimoireUI, journalUI, codexUI, attunementUI,
  });

  descentSystem.init({
    spawner: enemySpawner,
    chunkManager,
    player,
    sceneAdd: (o) => sceneManager.add(o),
    sceneRemove: (o) => sceneManager.remove(o),
  });

  engine.onFixedUpdate = fixedUpdate;
  engine.onUpdate = update;
  engine.onRender = render;

  setupEventListeners();

  // Simulate loading — gated on BOTH this fake progress timer reaching
  // 100% AND the real modelLibrary.preload() promise resolving, since
  // decoding ~10MB of embedded base64 + parsing two skinned meshes
  // could plausibly outlast the fake bar on a slow device. Whichever
  // of the two finishes second is the one that actually reveals
  // character-creation; robust to either ordering (models done first,
  // as most likely, or the fake timer finishing first).
  let loadProgress = 0;
  let timerDone = false;
  let modelsDone = false;
  const revealIfReady = () => {
    if (!timerDone || !modelsDone) return;
    document.getElementById('loading-screen').classList.add('hidden');
    // Guard: background tabs throttle setInterval, so this can land
    // after the player has already started. Never re-show creation
    // over a running game.
    if (!gameStarted && !characterCreated) {
      // ⚠️ THE ROSTER COMES FIRST, not character creation. You choose
      // WHO you are playing before anything can read or write a save —
      // see SaveSystem's profile block. Going straight to creation is
      // what let a second character land on the first one's key.
      showRoster();
    }
  };
  // Gate on the textures as well as the models. Revealing character
  // creation while 49MB of terrain texture is still in flight would
  // drop the player into a world that visibly re-skins itself a second
  // later, which reads as a glitch.
  Promise.all([modelsReady, texturesReady, natureReady, wanderersReady]).then(([, texturesOK, natureCount]) => {
    if (natureCount > 0) {
      // Rebuild the spawn chunks: they were generated during init with
      // procedural rocks and trees, before these finished downloading.
      // Without this the world is photoscanned everywhere EXCEPT
      // around the player's starting position.
      chunkManager.rebuildAllChunks();
    }
    if (texturesOK) {
      // The terrain material is shared by every chunk mesh, so this
      // one call re-skins the entire world — including chunks already
      // built and any built later.
      chunkManager.applyHDMaterials();
    }
    // ── SHADER PRE-COMPILE (perf pass) ────────────────────
    // ⚠️ Measured: the first frame after the HD materials applied took
    // 3,333 ms — every new shader (layered terrain, physical skin, the
    // people's cloth, the sky, the grass) compiling synchronously on
    // first draw, and the same freeze recurring in play the first time
    // each new thing came into view. Everything is put in front of the
    // camera once and compiled IN PARALLEL (compileAsync uses
    // KHR_parallel_shader_compile) while the loading bar is still up.
    _precompileShaders().finally(() => {
      modelsDone = true;
      revealIfReady();
    });
  });
  const loadInterval = setInterval(() => {
    loadProgress += Math.random() * 12;
    if (loadProgress >= 100) {
      loadProgress = 100;
      clearInterval(loadInterval);
      timerDone = true;
      revealIfReady();
    }
    document.getElementById('loading-bar').style.width = `${loadProgress}%`;
    // A number beside the bar: a 5px rule crawling across a dark plate
    // is not, on its own, legible as progress.
    document.getElementById('loading-pct').textContent = `${Math.round(loadProgress)}%`;
    // Once the fake bar hits 100 but the real models aren't in yet,
    // swap to a tail-end message so the wait reads as intentional
    // ("sculpting the heroes") rather than a stuck progress bar.
    document.getElementById('loading-status').textContent =
      (loadProgress >= 100 && !modelsDone) ? 'Sculpting the heroes...' : _loadingMessage(loadProgress);
  }, 100);
}

/** Build one of everything that brings a new shader, and compile it all at once. */
const _PRECOMPILE_TRACE = /[?&]pctrace\b/.test(location.search);
async function _precompileShaders() {
  const renderer = sceneManager.renderer, scene = sceneManager.scene;
  const cam = cameraController.camera;
  if (!renderer?.compileAsync) return;
  const t0 = performance.now();
  // The grass is built here rather than lazily on the first game frame,
  // so its material is compiled now too.
  if (!_grass) {
    _grass = new GrassField(
      (x, z) => chunkManager.getGroundY(x, z),
      (x, z) => chunkManager.biomeManager.getBiomeForChunk(
        Math.floor(x / WORLD.CHUNK_SIZE), Math.floor(z / WORLD.CHUNK_SIZE)),
      () => chunkManager.terrainGen._wSurf);
    if (_grass.enabled) scene.add(_grass.mesh);
  }
  _ensureLivingTerrain(scene);
  const warm = new THREE.Group();
  warm.name = 'shader-warmup';
  try {
    const add = (o, i) => { if (!o) return; o.position.set((i % 6) * 2 - 5, 0, -6 - Math.floor(i / 6) * 2); warm.add(o); };
    let i = 0;
    for (const t of ['skeleton', 'wraith', 'vampire', 'golem', 'grave_stalker', 'slime', 'spider', 'ice_elemental', 'sandworm']) {
      add(EntityForge.forgeCreature(t, 'neutral', 1), i++);
    }
    for (const id of ['pioneer', 'elder', 'keeper', 'rival']) {
      const inst = modelLibrary.instantiate(`model:Wanderer_${id}`);
      if (inst) add(inst.group, i++);
    }
    for (const w of ['sword', 'greatsword', 'dagger', 'dualblades', 'axe', 'spear', 'warhammer', 'scythe', 'bow', 'staff', 'grimoire']) {
      add(forgeWeapon(w, 'fire', 3, 'warmup'), i++);
    }
    add(forgeWand('fire'), i++);
    add(buildArm({}), i++);
    warm.position.copy(cam.position);
    warm.quaternion.copy(cam.quaternion);
    // ⚠️ ONE AT A TIME, A FRAME APART. compileAsync over the whole set
    // still blocked the main thread for its full length here (measured
    // 3.5–11 s as one frame) — parallel compile does not help when the
    // driver links synchronously. Compiling each object separately keeps
    // every frame short (the loading screen keeps moving), and the
    // per-object log says which shaders are the expensive ones.
    // Already-compiled programs are cached, so later objects cost only
    // what they add. The scene itself (terrain, sky, grass) goes first.
    // Textures first, a few per frame (see MaterialLibrary.preUpload).
    const tUp = performance.now();
    const uploaded = await materialLibrary.preUpload(renderer, 4);
    if (_PRECOMPILE_TRACE) console.log('[Precompile] uploaded', uploaded, 'textures in', Math.round(performance.now() - tUp), 'ms');
    const costs = [];
    const step = async (label) => {
      const t = performance.now();
      renderer.compile(scene, cam);
      costs.push([label, Math.round(performance.now() - t)]);
      if (_PRECOMPILE_TRACE) console.log('[Precompile] step', label, Math.round(performance.now() - t));
      await new Promise(r => requestAnimationFrame(() => r()));
    };
    await step('scene');
    scene.add(warm);
    const items = [...warm.children];
    for (const o of items) o.visible = false;
    for (const o of items) { o.visible = true; await step(o.name || o.type); }
    console.log('[Precompile] costs (ms):', costs.filter(c => c[1] > 20).map(c => c.join(' ')).join(', ') || 'all < 20 ms');
  } catch (err) {
    console.warn('[Precompile] skipped:', err);
  } finally {
    scene.remove(warm);
    console.log(`[Precompile] shaders compiled in ${Math.round(performance.now() - t0)} ms`);
  }
}

/** Pull the grade uniforms from whichever path's weather is active. */
function syncGrade() {
  if (!_gradePass) return;
  const g = atmosphere.gradeSettings();
  _gradePass.uniforms.uTint.value.set(g.tint[0], g.tint[1], g.tint[2]);
  _gradePass.uniforms.uVignette.value = g.vignette;
  _gradePass.uniforms.uLift.value = g.lift;
  // The curve/split-tone/saturation half of the grade is a per-path
  // personality too, not just the tint — a path switch has to move
  // both or Hell ends up wearing Heaven's contrast curve.
  applyGradePreset(_gradePass, atmosphere.path);
  // The dominant trait's saturation, applied AFTER the preset so it
  // multiplies the path's base rather than being overwritten by it.
  // Order matters — swap these two lines and the trait does nothing.
  _gradePass.uniforms.uSaturation.value *= atmosphere.traitSaturation;
}

function _loadingMessage(pct) {
  if (pct < 20) return 'Seeding the world...';
  if (pct < 40) return 'Growing terrain...';
  if (pct < 60) return 'Awakening biomes...';
  if (pct < 80) return 'Brewing ancient potions...';
  if (pct < 95) return 'Charging the Fracture Wand...';
  return 'Entering The Fracture...';
}

/**
 * A slow cinematic orbit around the Sanctuary, rendered behind the
 * loading screen and character creation.
 *
 * Before this, both of those screens sat on a flat `--backdrop`
 * colour while the actual game — terrain, the castle walls, weather,
 * the sky rift — was fully built and sitting in GPU memory a few
 * lines away, never painted to the canvas. The single biggest reason
 * the landing experience read as a form instead of a game was this:
 * there was no game behind it, visually, even though there
 * functionally already was one.
 *
 * Bonus this unlocks for free: `data/paths.js`'s setPath() already
 * calls `atmosphere.apply(path.id)` on every path-card click — that
 * re-key was ALWAYS happening, it just had nothing visible to change,
 * because nothing was rendering. Now clicking Ascendant/Cinderbound
 * visibly re-lights the world behind the cards in real time, which is
 * exactly what the UI copy ("This decides what the world looks like
 * to you") has been promising the whole time.
 *
 * Deliberately NOT the real `render()`/`update()` used once gameplay
 * starts — no player exists yet, no HUD, no enemies. Just enough to
 * paint a living frame: atmosphere (sky/fog/weather/IBL) and the
 * composer's full post chain, driven by a camera this function owns
 * outright until stopped.
 *
 * @returns {() => void} call to stop the loop before real gameplay
 *   starts driving the same camera from player position.
 */
function startMenuBackdrop() {
  const cam = cameraController.camera;
  // Just outside the broken fortification ring built last session —
  // close enough to read as a castle, far enough to see the whole
  // silhouette and a slice of sky (and the rift in it) above it.
  const RADIUS = 46;
  const HEIGHT = 9;
  const LOOK_AT = new THREE.Vector3(0, 7, 0); // roughly the keep/tower height, not flat at the ground

  let running = true;
  let elapsed = 0;
  let last = performance.now();

  function frame() {
    if (!running) return;
    const now = performance.now();
    // Clamped, same reasoning as everywhere else dt crosses a
    // requestAnimationFrame boundary in this file — a backgrounded
    // tab must not hand this loop a multi-second delta and lurch the
    // orbit forward when the tab regains focus.
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    elapsed += dt;

    // One full orbit roughly every three minutes — slow enough to
    // read as "alive" without ever feeling like it's hunting for
    // something to look at. A slight vertical drift on top keeps it
    // from reading as a mechanically perfect circle.
    const angle = elapsed * 0.035;
    const bob = Math.sin(elapsed * 0.12) * 1.1;
    cam.position.set(Math.sin(angle) * RADIUS, HEIGHT + bob, Math.cos(angle) * RADIUS);
    cam.lookAt(LOOK_AT);

    atmosphere.update(dt, cam.position);
    lightPool.update(cam.position);
    if (_gradePass) _gradePass.uniforms.uTime.value = now * 0.001;
    composer.render();

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
  return () => { running = false; };
}

function setupPostProcessing() {
  composer = new EffectComposer(sceneManager.renderer);

  const renderPass = new RenderPass(sceneManager.scene, cameraController.camera);
  composer.addPass(renderPass);

  // ── Ambient occlusion ─────────────────────────────────
  // The single biggest reason objects read as "pasted onto" the world
  // rather than standing in it: nothing darkens where two surfaces
  // meet. A prop sitting on the ground had exactly the same ambient
  // term at its base as at its top, so it never looked like it made
  // contact.
  //
  // This is complementary to — not a duplicate of — the aoMap sampled
  // in MaterialLibrary's triplanar shader. That one is texture-space
  // occlusion (the crevices *within* a rock face). This one is
  // screen-space occlusion *between* separate objects, which no
  // texture can know about.
  //
  // Immediately after RenderPass on purpose: GTAO must see the raw
  // lit scene, before bloom has smeared bright areas and before the
  // grade has crushed the levels it needs to read depth from.
  if (quality.wantsAO) {
    // ⚠️⚠️ HALF RESOLUTION. GTAO was the single most expensive thing in
    // the game by a wide margin.
    //
    // Measured, standing still at ultra on an 835x987 canvas:
    //     scene render        3.9ms
    //     full composer      22.0ms
    //     composer, AO off   11.5ms
    // GTAO alone was ~10.5ms — MORE THAN HALF the entire post budget,
    // and roughly 2.7x the cost of drawing the actual world.
    //
    // AO is a low-frequency signal: it is soft contact shading, not
    // detail. Running it at half res and letting the blur carry it is
    // visually near-identical and costs a quarter of the fragments.
    // Do not "fix" this back to full res without re-measuring.
    const aoScale = 0.5;
    const aoPass = new GTAOPass(
      sceneManager.scene,
      cameraController.camera,
      Math.max(1, Math.round(window.innerWidth * aoScale)),
      Math.max(1, Math.round(window.innerHeight * aoScale)),
    );
    aoPass.updateGtaoMaterial({
      radius: quality.settings.aoRadius,
      // World-space radius, not screen-space: a screen-space radius
      // makes distant terrain occlude itself more and more as it
      // recedes, which reads as a dark halo creeping over the horizon
      // as the player walks.
      screenSpaceRadius: false,
      distanceExponent: 1.0,
      // Thickness compensates for the depth buffer only storing the
      // FRONT surface of everything. Too low and thin geometry casts
      // occlusion out of its own back face; 1.0 is the usual default
      // and behaves for terrain-scale content.
      thickness: 1.0,
      scale: 1.0,
      samples: quality.tier === 'ultra' ? 16 : 8,
    });
    // Under 1.0 deliberately. Full-strength GTAO on top of a world
    // that is already this dark, already vignetted, and already
    // fog-heavy stops reading as contact shadow and starts reading as
    // dirt. This is the number to turn down first if the world ever
    // looks muddy.
    aoPass.blendIntensity = 0.85;
    composer.addPass(aoPass);
    _aoPass = aoPass;
  }

  // Bloom — restrained, small accents (spell cores, ember glow, the
  // new muzzle flash) only. Built at QUARTER resolution now (was
  // half): UnrealBloomPass is a chain of downsample + blur passes, so
  // its cost scales with the resolution it's GIVEN, and a soft glow
  // doesn't need much source detail to read right. setBloomSize()
  // below re-pins it on every resize too — composer.setSize() would
  // otherwise reset every pass, this one included, back to full
  // window resolution.
  const BLOOM_DIV = 4;
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth / BLOOM_DIV, window.innerHeight / BLOOM_DIV),
    0.22,   // REALISM PASS: RŌNIN's strength. The rest of this note is history.
    // was 0.38,   // intensity — trimmed from 0.42: MeshStandardMaterial adds real
            // Cook-Torrance specular on top of diffuse, a bright source the
            // old toon materials never produced, so the same strength now
            // reads hotter on anything that crosses threshold
    0.55,   // radius
    2.2    // threshold — raised from 0.88: PBR specular highlights (a
            // glinting sword, polished armor) can punch into the high-0.8s
            // even at the retuned, dimmer light-rig intensities; pushed up
            // so those read as a highlight, not a bloom flare, while
            // genuine emissive sources (wand cores, embers) stay well
            // past this and still bloom
  );
  // ⚠️ THRESHOLD 2.2, NOT 0.92 — the realism pass. Bloom reads the
  // LINEAR scene before OutputPass applies exposure, so 0.92 meant
  // "anything as bright as a lit white wall". Under the physical sky's
  // daylight that was every bone, every wall and the whole Sanctuary,
  // and they all smeared into glowing blobs. RŌNIN thresholds at 2.2
  // (main.ts): only real emitters and the sun's glare clear it.
  composer.addPass(bloomPass);

  // ── Volumetric light scattering ───────────────────────
  // After bloom so the rays scatter light that has already been
  // bloomed (the sun's own glow is the brightest thing feeding them),
  // but before the grade so the vignette and tint apply to the rays
  // too and they stay inside the palette rather than sitting on top
  // of it as a separate bright layer.
  if (quality.settings.godRays) {
    _godRaysPass = new GodRaysPass();
    _godRaysPass.setTint(atmosphere.palette.sun);
    composer.addPass(_godRaysPass);
  }

  const setBloomSize = () => bloomPass.setSize(
    Math.round(window.innerWidth / BLOOM_DIV), Math.round(window.innerHeight / BLOOM_DIV)
  );

  // Grade pass — a vignette and a slight tint pull the render toward
  // the path's palette so the world and the interface agree.
  // ── Tone mapping + colour space ───────────────────────
  //
  // ⚠️ THIS PASS WAS MISSING, AND ITS ABSENCE WAS THE SINGLE LARGEST
  // IMAGE-QUALITY BUG IN THE PROJECT.
  //
  // three.js only applies tone mapping and output colour-space
  // conversion when rendering to the DEFAULT framebuffer. From
  // WebGLRenderer:
  //
  //     let toneMapping = NoToneMapping;
  //     if ( material.toneMapped ) {
  //       if ( _currentRenderTarget === null ... ) toneMapping = _this.toneMapping;
  //     }
  //
  // RenderPass renders the scene into a render TARGET, not the
  // framebuffer. So with a composer in play, `renderer.toneMapping =
  // ACESFilmicToneMapping` and `outputColorSpace = SRGBColorSpace` were
  // both silently doing NOTHING, and raw linear radiance was being
  // written to the screen with no encoding at all.
  //
  // Consequences, all of which were visible and none of which were
  // understood until measured: the image was ~3.7x too dark (scene
  // rendered at mean luma 52/255, reached the screen at 14/255),
  // toneMappingExposure had no effect whatsoever (verified: sweeping it
  // 1.3 -> 3.0 changed the output by 0.1/255), and every per-path
  // `exposure` value in Atmosphere.js was inert.
  //
  // OutputPass performs both operations, reading renderer.toneMapping
  // and renderer.outputColorSpace. There is no double-application risk
  // precisely because the scene render skipped them.
  //
  // Placed BEFORE the grade deliberately: the grade's curve is written
  // in display-referred terms (a 0.18 mid-grey pivot, luma-based
  // split-tone masks), which only means anything on tone-mapped,
  // sRGB-encoded data. Running it on linear radiance would be
  // meaningless. AA then runs last, on final pixels.
  composer.addPass(new OutputPass());

  // ── Cinematic grade ───────────────────────────────────
  // Was an inline shader doing a flat tint multiply, a vignette and a
  // black lift. That is a colour wash, not a grade — it cannot crush
  // shadows, cannot split-tone, and cannot desaturate, which are the
  // three things actually responsible for the dark-fantasy look the
  // owner asked for. Moved to CinematicGrade.js and rewritten; the
  // uniform names syncGrade() depends on (uTint/uVignette/uLift/uTime)
  // are preserved so the per-path plumbing keeps working untouched.
  const gradePass = new ShaderPass(CinematicGradeShader);
  applyGradePreset(gradePass, atmosphere.path);
  composer.addPass(gradePass);

  // Held so the frame loop can keep the grade in step with the path.
  _gradePass = gradePass;
  syncGrade();

  // ── Anti-aliasing ─────────────────────────────────────
  // FXAA is a luminance-edge blur: cheap, and it softens the whole
  // image including texture detail. Now that the terrain actually HAS
  // high-frequency texture detail worth keeping, that softening is a
  // real cost rather than a free win. SMAA does proper pattern-based
  // edge reconstruction and leaves interior detail alone, at maybe
  // 1.5x the cost — an easy trade at the HD tiers.
  //
  // Both are kept: `low` is still exactly the old pipeline.
  let fxaaPass = null;
  let smaaPass = null;
  if (quality.isHD) {
    smaaPass = new SMAAPass(
      window.innerWidth * sceneManager.renderer.getPixelRatio(),
      window.innerHeight * sceneManager.renderer.getPixelRatio(),
    );
    composer.addPass(smaaPass);
  } else {
    fxaaPass = new ShaderPass(FXAAShader);
    const pixelRatio = sceneManager.renderer.getPixelRatio();
    fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * pixelRatio);
    fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * pixelRatio);
    composer.addPass(fxaaPass);
  }

  // Shared by the resize handler and the adaptive-quality scaler below
  // (which changes the renderer's pixel ratio at runtime and needs the
  // exact same re-sync — composer.setSize() resets every pass to
  // full-res, so bloom has to be re-pinned and FXAA's resolution
  // uniform has to match whatever pixel ratio is now active).
  _syncRenderSize = () => {
    const pr = sceneManager.renderer.getPixelRatio();
    composer.setSize(window.innerWidth, window.innerHeight);
    setBloomSize();
    if (fxaaPass) {
      fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * pr);
      fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * pr);
    }
    // SMAA and GTAO both hold their own internal render targets sized
    // in DEVICE pixels, and composer.setSize() only passes CSS pixels
    // through to setSize(). Without re-pinning them here they run at
    // the wrong resolution after any resize or adaptive-quality step —
    // SMAA misaligns its edge lookup and GTAO's depth reads stop
    // matching the frame, which shows up as AO sliding around.
    if (smaaPass) smaaPass.setSize(window.innerWidth * pr, window.innerHeight * pr);
    // ⚠️ AO stays at HALF the device resolution on resize too. This
    // line used to re-pin it to full res, which silently undid the
    // half-res optimisation the moment the window was resized or the
    // adaptive-quality step fired — the frame cost would jump back to
    // ~10.5ms and look like an unrelated regression.
    if (_aoPass) {
      _aoPass.setSize(
        Math.max(1, Math.round(window.innerWidth * pr * 0.5)),
        Math.max(1, Math.round(window.innerHeight * pr * 0.5)),
      );
    }
  };

  window.addEventListener('resize', () => _syncRenderSize());
}

// ══════════════════════════════════════════════════════════
// First-person wand viewmodel
// ══════════════════════════════════════════════════════════

/**
 * The player had no visible body at all in first person — not even
 * hands — just a wand floating in space with nothing holding it. One
 * low-poly sleeve+glove, built to match the Pioneer's own robe/leather
 * palette (EntityForge.js's robeDark/leather tones) rather than bare
 * skin, since this cast doesn't wear gloves so much as it wears a
 * robe with hands at the end of it. Positioned to wrap the grip
 * whichever prop (wand or forged weapon) it's parented under —
 * geometry is in that prop's own local space, so it inherits every
 * bit of sway/bob/swing for free.
 */
function _buildForearmHand(gripY = -0.36, gripR = 0.034, metric = false) {
  // ⚠️ REALISM PASS: RŌNIN's sculpted hand (rendering/Hand.js) — one
  // smooth closed surface with knuckles, creases and a thumb around the
  // grip, under a linen sleeve and a laced bracer. The old hand was a
  // 7-sided cylinder, a squashed sphere and three 5-sided fingers.
  // In a metric weapon the elbow is ~0.4 m below and behind the grip; the
  // focus is built at roughly twice that scale and keeps its own default.
  return metric ? buildArm({ gripY, gripR, elbow: [0.14, -0.36, 0.28] }) : buildArm({ gripY, gripR });
}

function setupViewmodel() {
  const group = new THREE.Group();
  // Two independent mounts so a forged weapon and the Fracture Wand
  // can each get their own transform: with nothing equipped the wand
  // alone carries the swing (unchanged from before — no regression for
  // a Pioneer who hasn't forged anything yet); once a weapon exists it
  // takes over the swing and the wand holsters to a smaller, idle
  // second position, exactly like the body rig now holds both.
  const wandMount = new THREE.Group();
  const weaponMount = new THREE.Group();
  group.add(wandMount, weaponMount);

  const wand = forgeWand(player._attunedElement || 'arcane');
  wandMount.add(wand);

  // forgeWand's light and shard emissive are tuned to read correctly
  // seen from several metres away in the world — held a few
  // centimetres from the camera lens instead, both blow out into a
  // featureless white flare under bloom. Dim them down to what a
  // held prop should look like; the channel pulse in updateViewmodel
  // still ramps the shard back up for the cast build-up.
  wand.traverse(o => {
    // A real-time point light this close to the near-clip plane blows
    // out everything within a few centimetres of it (inverse-square
    // falloff doesn't clamp) — the shard's own emissive material
    // already reads as "glowing" without a light bloom-flaring the
    // tines beside it, so cut the light rather than fight it.
    if (o.name === 'wand-light') o.intensity = 0;
    if (o.name === 'wand-core' && o.material) o.material.emissiveIntensity = 0.35;
  });
  // The focus's grip is its leather spiral, centred at y ≈ -0.215.
  const wandArm = _buildForearmHand(-0.215, 0.0365);
  wandMount.add(wandArm);

  group.scale.setScalar(1.3);

  // Parented to the camera itself: it inherits every bit of the
  // camera's own look rotation for free, so it only has to add the
  // extra motion (sway, bob, swing) on top rather than re-deriving
  // where the camera is pointed.
  cameraController.camera.add(group);
  viewmodel = { group, wandMount, weaponMount, wand, wandArm, weapon: null };
}

let _loreRevealTimer = null;

function revealLoreFragment(item) {
  const el = document.getElementById('lore-reveal');
  const titleEl = document.getElementById('lore-reveal-title');
  const textEl = document.getElementById('lore-reveal-text');
  if (!el || !titleEl || !textEl) return;

  const fragment = LORE_FRAGMENTS.find(f => f.id === item.id);
  titleEl.innerText = item.name;
  textEl.innerText = fragment?.text || item.loreText || '';

  clearTimeout(_loreRevealTimer);
  // The element starts life with the global `.hidden` utility class
  // (display:none !important) like every other overlay in index.html —
  // `.show`'s opacity transition can't do anything until that's off.
  // Only ever needs removing once; the opacity/pointer-events in
  // `.show` fully hide it again between reveals.
  el.classList.remove('hidden');
  el.classList.add('show');
  _loreRevealTimer = setTimeout(() => el.classList.remove('show'), 7000);

  loreSystem.record(item.id);
  codexUI.render();
  eventBus.emit(Events.UI_NOTIFY, `Fragment recovered (${loreSystem.count}/${LORE_FRAGMENTS.length})`);
}

// Grave cache — the actual death penalty this game didn't have. Death
// used to be free: full heal, teleport home, three seconds later
// nothing happened. Now half your carried essence dust spills where
// you fell as a recoverable pouch. Walk back and get it — or die
// again first and it's gone for good, the same "lost, not banked"
// stakes a corpse run is supposed to create, sized to what this
// game's economy actually has (dust, not souls/currency).
let _graveCachePickup = null;

// ══════════════════════════════════════════════════════════
// WHAT DYING COSTS
//
// Owner: "the game feels very hollow."
//
// Death used to cost three seconds and half your vitals. The grave
// cache existed but dropped **only dust** — half of a common crafting
// material — and dropped it at a coordinate in an infinite procedural
// world with nothing pointing at it, so in practice it was neither a
// loss you felt nor a thing you could go and get.
//
// Now it takes the one resource every active Aspect spends: your
// ESSENCE, all of it, plus half your cores. And it MARKS THE SPOT, so
// the loss is a journey rather than a deletion.
//
// ⚠️ It does NOT take your Memories. Losing a Legend you spent an hour
// of cores on — permanently, because you can die again on the way
// back — is not stakes, it is a reason to stop playing. The rule this
// follows is the one the genre settled on: you lose what you were
// *carrying*, never what you *are*.
//
// ⚠️ ONE grave at a time, and dying again destroys the old one. That
// is the whole tension: the walk back is a real decision, and the
// game says so out loud rather than silently binning it.
// ══════════════════════════════════════════════════════════

function dropGraveCache(position) {
  if (_graveCachePickup?.alive) {
    _graveCachePickup.alive = false;
    sceneManager.remove(_graveCachePickup.mesh);
    eventBus.emit(Events.UI_NOTIFY, 'What you left at the last place is gone now.');
  }
  _graveCachePickup = null;
  _gravePos = null;

  const contents = [];
  // Half of every stackable material, not just dust — dust alone was
  // never a loss anyone noticed.
  for (const slot of inventory.getSlotData()) {
    if (!slot || !slot.item) continue;
    const it = slot.item;
    // ⚠️ Memories and the wand are never taken. See the header.
    if (it.isMemory || it.isWand) continue;
    // Stackable material only — never a piece of equipment. Stated
    // directly rather than through MemoryForgeUI's `isCore()`, which
    // is a UI-local helper meaning "anything that is not a Memory"
    // and would have swept up armour and quest items with it.
    if (!(it.isDust || it.type === 'resource' || it.type === 'material' || it.type === 'refined')) continue;
    // The Unhoused keeps a share of what they drop.
    const keep = epithetSystem.grant('graveKeep', 0);
    const take = Math.max(1, Math.floor(slot.count * (0.5 * (1 - keep))));
    if (take > 0 && inventory.consumeItems(it.id, take)) contents.push({ id: it.id, count: take });
  }

  // The Essence. This is the part that actually stings — it is what
  // every Aspect on your bar spends.
  const keepFrac = epithetSystem.grant('graveKeep', 0);
  const spilled = Math.floor((coreSystem.essence || 0) * (1 - keepFrac));
  if (spilled > 0) coreSystem.essence -= spilled;

  if (!contents.length && spilled <= 0) {
    eventBus.emit(Events.UI_NOTIFY, 'You had nothing left to lose.');
    return;
  }

  const cache = registerItem({
    id: 'grave_cache',
    name: 'Spilled Essence',
    icon: '⚱️',
    tier: MATERIAL_TIERS.RARE,
    type: 'reliquary',
    isReliquary: true,
    contents,
    essence: spilled,
  });
  _graveCachePickup = pickupManager.spawn(cache, position.clone(), 1);
  _gravePos = position.clone();

  const parts = [];
  if (spilled > 0) parts.push(`${spilled} Essence`);
  if (contents.length) parts.push(`${contents.length} kind${contents.length === 1 ? '' : 's'} of material`);
  eventBus.emit(Events.UI_NOTIFY, `You left ${parts.join(' and ')} where you fell.`);
}

/** Where the current grave is, or null. Drives the compass below. */
let _gravePos = null;
let _graveTimer = 0;

/**
 * Point the player back at their own corpse.
 *
 * ⚠️ Without this the grave is a coordinate in an infinite world and
 * the "cost" is just deletion with extra steps. A loss you cannot walk
 * back to is not a mechanic, it is a punishment.
 */
function updateGraveCompass(dt) {
  _graveTimer -= dt;
  if (_graveTimer > 0) return;
  _graveTimer = 0.4;

  const el = document.getElementById('grave-compass');
  if (!el) return;
  const gone = !_gravePos || !_graveCachePickup?.alive || descentSystem.isActive;
  if (gone) { el.classList.add('hidden'); return; }

  const dx = _gravePos.x - player.position.x;
  const dz = _gravePos.z - player.position.z;
  const dist = Math.round(Math.hypot(dx, dz));
  const nameEl = document.getElementById('grave-compass-name');
  const distEl = document.getElementById('grave-compass-dist');
  if (nameEl) nameEl.textContent = 'Where you fell';
  if (distEl) distEl.textContent = dist < 6 ? 'it is here' : `${dist}m ${_compassDirection(dx, dz)}`;
  el.classList.remove('hidden');
}

/** The one moment this UI spends real red on — see the CSS comment on #death-overlay. */
function showDeathOverlay() {
  const el = document.getElementById('death-overlay');
  if (!el) return;
  el.classList.remove('hidden');
  el.classList.add('show');
  // Fades out just ahead of Player.js's own 3000ms respawn timer, so
  // the world is visible again the instant control comes back.
  setTimeout(() => el.classList.remove('show'), 2600);
}

/**
 * mq6 becomes active — forge Vell out of the wraith template.
 *
 * Used to appear in a random ring around wherever the PLAYER happened
 * to be standing the moment mq6 activated — which meant "hunt down
 * Vell" had no actual destination; the boss just materialised next to
 * you. Now Vell is forged at the one fixed place the lore already
 * names — Vell's Hollow (src/data/landmarks.js), built as atmosphere
 * the moment its chunk loads regardless of quest state — so the quest
 * means what it says: go there and find it.
 */
function spawnVell() {
  const { x, z } = landmarkWorldPos(LANDMARKS.vellsHollow, WORLD.CHUNK_SIZE);
  const groundY = chunkManager.getGroundY(x, z);
  // Drops in from above, same "falls into place" entrance the old
  // player-relative spawn had — just landing somewhere real now
  // instead of wherever the player happened to be standing.
  const pos = new THREE.Vector3(x, groundY + 8, z);
  // typeIndex 5 = wraith (see ENEMY_TYPES in Enemy.js) — same AI, same
  // drops, just forged as a named unique: bigger, tougher, its own tag.
  enemySpawner.spawnNamed(5, pos, 6, { name: 'Vell', hpMult: 2.2, atkMult: 1.4, scaleMult: 1.25, isBoss: true });
  // ⚠️ A scene, not a toast — this is a story beat, and Vell is the
  // act's whole thesis arriving in person.
  sceneUI.say('', [VELL.introLine]);
}

/**
 * Distance + heading to the nearest known Descent Gate.
 *
 * Deliberately separate from updateQuestCompass: that one points at the
 * active MAIN QUEST's destination and is silent when the quest has no
 * place. This one answers a different and more frequently-asked
 * question — "where is the nearest dungeon" — and is silent only when
 * you genuinely know of none. Same ~2.5Hz throttle.
 */
let _dcTimer = 0;
function updateDescentCompass(dt) {
  _dcTimer -= dt;
  if (_dcTimer > 0) return;
  _dcTimer = 0.4;

  const el = document.getElementById('descent-compass');
  if (!el) return;
  // Hidden inside a Descent — you are in one, pointing at it is noise.
  if (descentSystem.isActive) { el.classList.add('hidden'); return; }

  const g = descentSystem.trackedGate(player.position);
  if (!g) { el.classList.add('hidden'); return; }

  const dx = g.position.x - player.position.x;
  const dz = g.position.z - player.position.z;
  const dist = Math.round(Math.hypot(dx, dz));
  document.getElementById('descent-compass-name').textContent =
    `${g.name} · Tier ${g.tier}${g.state === 'devoured' ? ' (open)' : ''}`;
  document.getElementById('descent-compass-dist').textContent =
    dist < 8 ? 'you have arrived' : `${dist}m ${_compassDirection(dx, dz)}`;
  el.classList.remove('hidden');
}

// ── Interaction (E) ────────────────────────────────────────
//
// ⚠️ THIS DID NOT EXIST. index.html has had an `#interaction-prompt`
// element and a `<kbd>E</kbd>` hint in the key list since early on,
// NPC.js has had a fully written `interact()` that emits
// NPC_QUEST_TRIGGER, and QuestSystem.js has had a listener for that
// event — and nothing anywhere ever CALLED interact(). The chain was
// complete at both ends and severed in the middle.
//
// The consequence was not cosmetic: mq3 ("The Elder's Wisdom"), mq5
// ("The Long-Attuned") and mq7 ("What the Fracture Wants", the entire
// finale and its three endings) are all `talk` quests. None of them
// could be completed. The main story has been unfinishable, silently,
// with no error — the quest simply sat active forever while the player
// stood in front of an NPC who had dialogue written for them.
//
// Found while wiring Descent Gates, which need the same loop. One
// resolver serves both: nearest NPC wins over a Gate on a tie, because
// an NPC is the smaller target and standing on top of one is
// unambiguous about intent.
let _interactTarget = null;

function updateInteraction() {
  const promptEl = document.getElementById('interaction-prompt');
  const textEl = document.getElementById('prompt-text');
  if (!promptEl || !textEl) return;

  // Nothing is interactable from inside a Descent except finishing it.
  const npc = descentSystem.isActive ? null : npcManager.getNearestNPC(player.position, 3.5);
  const gate = descentSystem.isActive ? null : descentSystem.nearestGate(player.position, 4.5);

  // ⚠️ A THIRD KIND OF TARGET. Until this, the only two things in the
  // entire world you could press E on were an NPC and a Descent Gate —
  // while the wilderness generated seven kinds of structure, all of
  // them pure scenery. See systems/SiteSystem.js.
  const site = descentSystem.isActive ? null : siteSystem.nearest(player.position, 4.5);

  let target = null, label = '';
  if (npc) {
    target = { kind: 'npc', npc };
    label = `Speak to ${npc.name}`;
  } else if (gate) {
    target = { kind: 'gate', gate };
    label = gate.state === 'sealed'
      ? `${gate.name} — sealed`
      : `Enter ${gate.name}${gate.state === 'devoured' ? ' (open)' : ''} · Tier ${gate.tier}`;
  } else if (site) {
    const k = SITE_KINDS[site.kind];
    target = { kind: 'site', site };
    label = `${k.verb} — ${k.name}`;
  }

  _interactTarget = target;
  if (target) {
    textEl.textContent = label;
    promptEl.classList.remove('hidden');
  } else {
    promptEl.classList.add('hidden');
  }

  // isKeyJustPressed, not isKeyDown — see the note on the digit keys
  // further down this file: a press that begins and ends between two
  // frames must still register, and polling isKeyDown drops it.
  if (target && input.isKeyJustPressed('KeyE')) {
    if (target.kind === 'npc') {
      target.npc.interact();
    } else if (target.kind === 'site') {
      useSite(target.site);
    } else if (target.gate.state !== 'sealed') {
      descentSystem.enterGate(target.gate);
    }
  }
}

// ══════════════════════════════════════════════════════════
// USING A SITE — what the world gives back
//
// Seven kinds, seven genuinely different verbs. See
// systems/SiteSystem.js for why each one is the shape it is.
//
// ⚠️ Every branch calls `siteSystem.markUsed()` — including the ones
// that "fail" (an offering you cannot afford does NOT consume the
// shrine; a graveyard you disturb is spent whether or not you survive
// it). Which of those two a branch wants is a real decision and is
// commented at each site rather than left to the reader.
//
// ⚠️ Rewards go through `inventory.addItem` and the real forge, never
// a bespoke reward path — so a Memory found in a ruin is the same kind
// of object as one you made, with the same Aspects and the same
// grade rules.
// ══════════════════════════════════════════════════════════

/** Materials appropriate to how far out you are. */
function _siteLoot(site, richness = 1) {
  const dist = Math.hypot(site.x, site.z);
  // Deeper world, better material — the same distance ramp the enemy
  // spawner uses, so "far from the Sanctuary" means one consistent
  // thing across the whole game.
  const tierRoll = Math.min(1, dist / 1400) * richness;
  const tier = tierRoll > 0.78 ? 'legendary'
    : tierRoll > 0.55 ? 'epic'
    : tierRoll > 0.32 ? 'rare'
    : tierRoll > 0.14 ? 'uncommon' : 'common';
  const els = ['fire', 'ice', 'shadow', 'void', 'water', 'earth', 'light', 'arcane', 'lightning', 'poison', 'wind'];
  const el = els[Math.abs(Math.round(site.x * 7 + site.z * 13)) % els.length];
  return { tier, element: el };
}

// ⚠️ STEEL: there are no soul cores any more (owner: remove the Shadow
// Slave system). Every place that paid out cores pays smithing stock —
// ore, ingots, wood and leather by the site's richness — which is what
// the Forge (Tab → F) is fed with. Name kept so the call sites are untouched.
const _STOCK_BY_TIER = {
  common:   ['iron_ore', 'iron_ore', 'leather', 'oak_wood'],
  uncommon: ['iron_ore', 'steel_ingot', 'ash_wood', 'leather'],
  rare:     ['steel_ingot', 'mithril_ore', 'ash_wood', 'spider_silk'],
  epic:     ['mithril_ore', 'steel_ingot', 'eldertree', 'wyrmscale'],
  legendary:['mithril_ore', 'starmetal', 'eldertree', 'steel_ingot'],
};
function _giveCores(site, count, richness = 1) {
  const { tier, element } = _siteLoot(site, richness);
  const pool = _STOCK_BY_TIER[tier] || _STOCK_BY_TIER.common;
  const id = pool[Math.abs(Math.round(site.x * 7 + site.z * 13)) % pool.length];
  const def = getItem(id) || getItem('iron_ore');
  const n = id === 'iron_ore' || id === 'leather' ? count * 2 : count;
  inventory.addItem(def, n);
  return { count: n, tier, element, name: def.name };
}

function useSite(site) {
  const k = SITE_KINDS[site.kind];
  const at = new THREE.Vector3(site.x, site.y + 1, site.z);

  switch (site.kind) {
    // ── SPEND to gain ────────────────────────────────────
    case 'shrine': {
      // ⚠️ The shrine wants CORES — the same currency the Loom wants —
      // so an offering is a real trade against the thing you would
      // otherwise forge with, not spare change.
      const cost = 2;
      const held = inventory.getSlotData()
        .filter(s => s && s.item.type === 'resource' && !s.item.isMemory);
      const total = held.reduce((n, s) => n + s.count, 0);
      if (total < cost) {
        // ⚠️ NOT marked used. You may come back when you can pay.
        showNotification(`The shrine wants an offering — ${cost} pieces of ore or hide. You have ${total}.`);
        return;
      }
      let left = cost;
      for (const s of held) {
        if (left <= 0) break;
        const take = Math.min(left, s.count);
        if (inventory.consumeItems(s.item.id, take)) left -= take;
      }
      const el = held[0]?.item.element || player._attunedElement || 'arcane';
      boonSystem.grant('shrine', el);
      weaveVFX.dome(at, el, { size: 2.6, life: 1.2 });
      particleBursts.spawn(at, el, { count: 22, sizeMult: 1.3 });
      siteSystem.markUsed(site.id);
      break;
    }

    // ── FIND ─────────────────────────────────────────────
    case 'cache': {
      const got = _giveCores(site, 2 + (Math.abs(Math.round(site.x)) % 3));
      showNotification(`${got.count}× ${got.name} (${got.tier}) — someone meant to come back for this.`);
      particleBursts.spawn(at, got.element, { count: 14, sizeMult: 1.0 });
      siteSystem.markUsed(site.id);
      break;
    }

    // ── RISK ─────────────────────────────────────────────
    case 'graveyard': {
      // ⚠️ Marked used IMMEDIATELY, before the fight. You disturbed
      // it; that happened. Marking it after would let a player flee a
      // losing fight and re-trigger the same reward.
      siteSystem.markUsed(site.id);
      const lvl = Math.max(2, Math.min(30, Math.round(Math.hypot(site.x, site.z) / 90) + player.level - 2));
      const n = 3;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const p = new THREE.Vector3(site.x + Math.cos(a) * 4, 0, site.z + Math.sin(a) * 4);
        p.y = chunkManager.getGroundY(p.x, p.z);
        enemySpawner.spawnNamed(1, p, lvl, { name: 'Something Risen', hpMult: 1.15 });
        weaveVFX.ring(p, 'shadow', { size: 1.6, life: 0.8 });
      }
      cameraController.shake(0.2, 0.5);
      showNotification('The ground gives. Three of them, and they were waiting.');
      // The reward is banked now and paid on clearing — see the
      // COMBAT_KILL bounty handler below.
      _graveyardBounty.push({ id: site.id, left: n, site });
      break;
    }

    // ── SEARCH ───────────────────────────────────────────
    case 'ruin': {
      siteSystem.markUsed(site.id);
      const roll = Math.abs(Math.round(site.x * 3 + site.z * 5)) % 10;
      if (roll < 4) {
        const got = _giveCores(site, 1 + (roll % 2), 1.2);
        showNotification(`Under a fallen lintel: ${got.count}× ${got.name}.`);
      } else if (roll < 7) {
        // A Memory somebody else forged and did not come back for.
        // ⚠️ Through the REAL forge — same path a player's own Memory
        // takes, so it has real Aspects and a real grade.
        // ⚠️ STEEL: a real smithed weapon, not a forged Memory.
        const finds = ['rusty_dagger', 'iron_sword', 'iron_war_axe', 'ashwood_spear', 'yew_longbow', 'hollow_stave', 'ribbed_maul', 'iron_greatsword', 'paired_fangs'];
        const def = getItem(finds[roll % finds.length]);
        if (def) {
          inventory.addItem(def, 1);
          showNotification(`Someone left a ${def.name} here. They did not come back for it.`);
        } else {
          const got = _giveCores(site, 2);
          showNotification(`${got.count}× ${got.name}, in a rotted satchel.`);
        }
      } else {
        showNotification('Rubble, and the smell of old rain. Nothing left.');
      }
      particleBursts.spawn(at, 'neutral', { count: 10, sizeMult: 0.8 });
      break;
    }

    // ── LEARN ────────────────────────────────────────────
    case 'monolith': {
      siteSystem.markUsed(site.id);
      // Attunement DEPTH — the axis that unlocks wand slots. A stone
      // that teaches is the one site that makes you better at casting
      // rather than richer.
      // ⚠️ STEEL: a stone that teaches teaches a FORM — practice with the
      // weapon in your hand (techniques unlock on practice), not
      // attunement depth for a wand that no longer casts.
      const fam = combatSystem.family;
      combatSystem.practice[fam] = (combatSystem.practice[fam] || 0) + 10;
      combatSystem._checkLearned();
      showNotification('The cuts in the stone are a fighter\'s forms. You study them with the weapon in your hand. (+10 practice)');
      break;
    }

    // ── REST ─────────────────────────────────────────────
    // ── THE WORLD EXPANSION ──────────────────────────────
    case 'cave': {
      // ⚠️ Never marked used: a cave can be gone into again.
      caveSystem.enter(site);
      return;
    }
    case 'warcamp': {
      siteSystem.markUsed(site.id);
      const near = enemySpawner.getEnemiesInRange(at, 14).filter(e => e.alive && !e.friendly).length;
      if (near) showNotification(`${near} of them are still here — and now they know you are.`);
      const loot = [['iron_ingot', 2], ['bronze_ingot', 2], ['roast_meat', 2], ['leather', 3], ['coal', 3]];
      const got = [];
      for (const [id, n] of loot) if (Math.random() < 0.6) { const d = getItem(id); if (d) { inventory.addItem(d, n); got.push(`${n}× ${d.name}`); } }
      if (Math.random() < 0.35) { const w = getItem(['steel_sword', 'iron_axe', 'bronze_spear', 'iron_warhammer'][Math.floor(Math.random() * 4)]); if (w) { inventory.addItem(w, 1); got.push(w.name); } }
      showNotification(got.length ? `The stores: ${got.join(', ')}.` : 'Someone emptied these already.');
      break;
    }
    case 'camp': {
      siteSystem.markUsed(site.id);
      // ⚠️ The only full heal outside the Sanctuary, and it is
      // one-shot per camp. That is what makes a camp worth
      // REMEMBERING rather than worth farming — and what makes
      // deciding to spend one a real decision.
      player.hp = player.maxHp;
      player.mp = player.maxMp;
      player.stamina = player.maxStamina;
      coreSystem.essence = coreSystem.capacity;
      particleBursts.spawn(at, 'light', { count: 16, sizeMult: 1.0 });
      showNotification('You sleep a few hours in someone else\'s bedding. Whole again.');
      updateHUD();
      break;
    }

    // ── DELVE ────────────────────────────────────────────
    case 'dungeon': {
      siteSystem.markUsed(site.id);
      const lvl = Math.max(3, Math.min(32, Math.round(Math.hypot(site.x, site.z) / 80) + player.level));
      const p = new THREE.Vector3(site.x, 0, site.z + 3);
      p.y = chunkManager.getGroundY(p.x, p.z);
      enemySpawner.spawnNamed(7, p, lvl, {
        name: 'What Was Sealed In', hpMult: 2.4, atkMult: 1.15, scaleMult: 1.25, isBoss: true,
      });
      weaveVFX.ring(p, 'void', { size: 3.2, life: 1.0 });
      cameraController.shake(0.3, 0.7);
      showNotification('The door was holding something shut. It is not now.');
      _graveyardBounty.push({ id: site.id, left: 1, site, rich: 2.2 });
      break;
    }

    default:
      console.warn(`[Site] "${site.kind}" has no behaviour — the player pressed E and nothing happened.`);
      return;
  }
  audioSystem.playQuestChime?.();
}

/**
 * Sites that owe you something once you have cleared what they woke.
 *
 * ⚠️ Counted down by COMBAT_KILL rather than by "are any of them
 * alive", because a creature that wanders out of range and despawns
 * would otherwise leave the bounty permanently unpayable.
 */
const _graveyardBounty = [];

/** When the player was last hit — see the Unbroken grant. */
let _lastStruckAt = 0;

// ── Quest compass ──────────────────────────────────────────
//
// Every quest before this was a stat with no place attached — "kill 3
// skeletons," "gather a fragment," "talk to Aris" — completable
// anywhere, which is a large part of why the game didn't feel like an
// RPG. Landmarks (src/data/landmarks.js) gave two of them an actual
// destination; this is what turns "a destination exists" into
// "the player can find it" without requiring a full minimap/waypoint
// system this project doesn't otherwise have.
//
// Elder Aris and Ostra's hub positions are hardcoded here rather than
// looked up from a live NPC reference — they're placed at fixed,
// hand-picked world coordinates in ChunkManager._spawnHubNPCs
// (5,5 and cx*64-6,cz*64+8, which for the hub chunk (0,0) is just
// (-6,8)) and never move, so there's nothing to look up that this
// doesn't already know statically.
const HUB_NPC_POS = {
  elder_npc: { x: 5, z: 5 },
  ostra_npc: { x: -6, z: 8 },
};

/** World {x, z} the given main-quest object points at, or null. */
function questTargetPosition(quest) {
  if (!quest) return null;
  if (quest.type === 'talk' && HUB_NPC_POS[quest.targetId]) return HUB_NPC_POS[quest.targetId];
  const landmark = landmarkForQuest(quest.id);
  return landmark ? landmarkWorldPos(landmark, WORLD.CHUNK_SIZE) : null;
}

/** 8-point compass letters for a direction, world -Z = north, +X = east. */
function _compassDirection(dx, dz) {
  const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  let angle = Math.atan2(dx, -dz);
  if (angle < 0) angle += Math.PI * 2;
  return DIRS[Math.round((angle / (Math.PI * 2)) * 8) % 8];
}

let _compassAcc = 0;

/**
 * Writes distance + compass heading to #quest-marker, throttled to
 * ~2.5Hz — this only needs to feel responsive, not track every frame,
 * and re-querying/writing DOM every frame for a number that changes
 * by inches is pure waste.
 *
 * Quests with no registered destination (mq1's "explore," mq2's "kill
 * 3 skeletons anywhere," every side quest) correctly show nothing —
 * this is a pointer to a PLACE, not a quest tracker; QuestSystem's own
 * panel already covers the general case.
 */
function updateQuestCompass(dt) {
  _compassAcc += dt;
  if (_compassAcc < 0.4) return;
  _compassAcc = 0;

  const el = document.getElementById('quest-marker');
  if (!el) return;

  const quest = questSystem.currentQuestIndex < questSystem.quests.length
    ? questSystem.quests[questSystem.currentQuestIndex]
    : null;
  const target = questTargetPosition(quest);
  if (!target) { el.textContent = ''; return; }

  const dx = target.x - player.position.x;
  const dz = target.z - player.position.z;
  const dist = Math.round(Math.hypot(dx, dz));
  el.textContent = dist < 6 ? '▸ you have arrived' : `▸ ${dist}m ${_compassDirection(dx, dz)}`;
}

/**
 * Hold a title + a line on screen the way the finale does, for beats
 * that are rare enough to earn it (an Ascent rank; five per run at
 * most). Shares showFinaleNarration's DOM but not its lookup — see the
 * ⚠️ at the ASCENT_RANK_UP handler.
 */
function showLongBeat(title, body) {
  const el = document.getElementById('finale-narration');
  const textEl = document.getElementById('finale-narration-text');
  if (!el || !textEl) return;
  const titleEl = el.querySelector('.lore-reveal-title');
  if (titleEl) titleEl.textContent = title;
  textEl.innerText = body;
  el.classList.remove('hidden');
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 9000);
}

/**
 * The finale choice was made — its closing beat.
 *
 * ⚠️ A SCENE, paced by the player. This was a single overlay showing
 * all three lines at once and dismissing itself after fifteen
 * seconds — the most important text in the game, on a timer, with no
 * way to hold it or read it twice. It is the end of a seven-act arc;
 * it can afford to wait for a keypress.
 */
function showFinaleNarration(choice) {
  const lines = FINALE_NARRATION[choice] || [];
  if (!lines.length) return;
  sceneUI.say('', lines);
}

/** A weapon was forged and equipped — build the viewmodel's own copy. */
function _equipViewmodelWeapon({ weaponType, element, tierLevel, seed, metal }) {
  if (!viewmodel) return;
  if (viewmodel.weapon) {
    // ⚠️ Cancel any materialisation still running on the OUTGOING
    // weapon before it is unparented. weaveVFX holds a reference to it
    // and to its remembered scale; leaving that entry live would keep
    // ticking a detached object forever and leak its thread cage.
    weaveVFX._cancelMaterialise(viewmodel.weapon, true);
    viewmodel.weaponMount.remove(viewmodel.weapon);
    viewmodel.weapon = null;
  }
  // A null weaponType is `Player.clearWeapon()` — the player took the
  // last Memory out of their weapon slots and their hands are empty.
  // Without this branch that fell through to forgeWeapon's `|| sword`
  // fallback and put a phantom sword in the viewmodel of someone
  // holding nothing.
  if (!weaponType) return;

  const wpn = forgeWeapon(weaponType, element, tierLevel, seed, metal);
  // ⚠️ REALISM PASS — weapons are real size in metres (rendering/Arms.js)
  // and are held by the hand INSIDE the weapon, at its own grip
  // (userData.grip), so the fingers close on the actual handle of every
  // type and the hand follows every swing. The old per-type FRAMING
  // shrank long weapons to fit the screen and left one generic hand
  // floating beside them; long weapons now run out of frame, as they
  // would in your hands. Scale and stance live in WeaponMotion.
  const key = weaponPlanKey(weaponType);
  const motion = MOTION[key] || MOTION.sword;
  wpn.scale.setScalar(motion.scale);
  const grip = wpn.userData.grip || { y: -0.08, r: 0.0155 };
  const hand = _buildForearmHand(grip.y, grip.r, true);
  if (grip.x) hand.position.x = grip.x;
  // The choreography's REST pose: the fist on _VM_FIST, the weapon at
  // its WeaponMotion stance angle. Every stroke starts and ends here.
  {
    const sp = new THREE.Vector3(), sq = new THREE.Quaternion();
    samplePose(key, 0, null, sp, sq);
    viewmodel.rest = { h: _VM_FIST.clone(), q: sq };
    viewmodel.gripVec = new THREE.Vector3(grip.x || 0, grip.y, 0).multiplyScalar(motion.scale);
    viewmodel.key = CHOREO[key] ? key : 'sword';
  }
  wpn.add(hand);
  // ⚠️ TWO-HANDED WEAPONS ARE HELD IN TWO HANDS. The left hand leaves
  // the focus and takes the haft at the profile's second grip; it hands
  // back to the focus while a spell is being cast (see updateViewmodel).
  viewmodel.offArm = null;
  const g2 = CHOREO[key]?.grip2;
  if (g2 != null) {
    const off = _buildForearmHand(g2, grip.r * 1.02, true);
    off.name = 'fp-arm2';
    off.scale.x = -1;                // a LEFT hand (Hand.js builds a right one)
    wpn.add(off);
    viewmodel.offArm = off;
  }
  // The old weaponMount-level hand (pre-realism) must not linger.
  for (const c of [...viewmodel.weaponMount.children]) if (c.name === 'fp-arm') viewmodel.weaponMount.remove(c);
  viewmodel.weaponHandBuilt = true;
  viewmodel.weaponMount.add(wpn);
  viewmodel.weapon = wpn;
  // ⚠️ Awaken glow BEFORE materialise(), not after. materialise()
  // reads each emissive part's CURRENT intensity as the value to ease
  // back down to, so running it first would capture the un-awakened
  // 0.6 and quietly cancel _applyAwakenGlow() every time the player
  // swapped weapons — the exact failure that note in §7.8 was written
  // to prevent, arriving through a new door.
  _applyAwakenGlow();
  // The thing knits itself into your hand. This is the "materialisation"
  // the owner reported missing: previously a forged weapon simply
  // existed between one frame and the next.
  weaveVFX.materialise(wpn, element);
}

// ══════════════════════════════════════════════════════════
// THE LOADOUT AND THE PLAYER'S HANDS WERE NEVER CONNECTED
//
// Owner: "I can't even see the model of the weapon, or woven object on
// me, neither is anything."
//
// They were right, and it was structural, not cosmetic.
// `LoadoutSystem.equipWeapon()` put a Memory in a slot, rebuilt the
// hotbar and emitted LOADOUT_CHANGED — and that was all it did.
// `Player.equipWeapon()`, the ONLY thing in the project that builds a
// weapon mesh (body rig) and emits PLAYER_EQUIP_WEAPON (which is the
// only thing `_equipViewmodelWeapon` listens to), was never called on
// that path. Measured live before this fix, holding a freshly forged
// Epic grimoire:
//
//   viewmodel weaponMount children : 0     ← nothing in your hands
//   player._meleeWeaponMesh        : false ← nothing on your body
//   player.weaponAtk               : 18    ← still the STARTING WAND's
//
// So the third number is the same bug: a forged weapon contributed no
// attack power either, because `weaponAtk` is written by
// `Player.equipWeapon()` and nothing else. The only trace a Memory
// left on the player was `loadoutAtk` — strength × 0.8, worth 2 points
// — which is why forging a better weapon felt like it did nothing.
//
// ⚠️ ID-GUARDED, not unconditional. LOADOUT_CHANGED fires for holding
// a charm, dropping a relic, switching the active slot and every
// rebind, and `Player.equipWeapon()` emits a UI_NOTIFY and rebuilds
// two meshes. Re-equipping on every one of those would spam the
// notification feed and restart the materialisation animation
// constantly.
//
// ⚠️ It syncs to `activeWeapon` (the slot in hand), not to "any
// equipped weapon" — the three slots exist so the player can carry
// three and hold one, and melee already reads the active one.
// ══════════════════════════════════════════════════════════

let _syncedWeaponId = null;
let _syncedRaimentId = null;

function _syncLoadoutEquipment() {
  // ── The weapon in hand ──
  // ⚠️ `activeWeapon` returns null when the active slot holds an ECHO
  // (see LoadoutSystem). That is deliberate: an Echo is not a thing
  // you swing, and handing one to equipWeapon() would forge a phantom
  // sword out of its absent weaponType.
  const w = loadout.activeWeapon;
  const wId = w?.id || null;
  if (wId !== _syncedWeaponId) {
    _syncedWeaponId = wId;
    if (w) player.equipWeapon(w);
    else player.clearWeapon();
    // ⚠️ Published as a FACTOR the player folds in, never assigned to
    // `attackCooldown` here — that field is derived per swing from
    // PLAYER.ATTACK_COOLDOWN and the lightning mastery, and a second
    // writer to it is trap #9's exact shape. Unarmed and wand-only
    // resolve to 1, so those paths are untouched.
    player.weaponSpeed = w ? (_meleeProfile().speed || 1) : 1;
    // When, within its swing, this weapon's blow lands (WeaponMotion).
    player.windupFrac = (MOTION[weaponPlanKey(w?.weaponType || 'sword')] || MOTION.sword).windup + IMPACT_LAG;
  }

  // ── Raiment — uncapped, so ALL of it counts ──
  // A Raiment is `equips: 'armor'`, so `loadout.hold()` accepted it and
  // parked it in `held`, where nothing ever looked at it again. It
  // never reached the armour path at all, so the one form whose whole
  // job is "it decides what reaches you" gave no defence and produced
  // no visible change on the Pioneer.
  //
  // ⚠️ Folded into `player.raimentDef` rather than filed in
  // `armorTokens`. Raiment is uncapped (LoadoutSystem's capacity note)
  // and `armorTokens` has exactly three keys, so the fourth piece you
  // wove would silently do nothing.
  const worn = loadout.raiment();
  const rKey = worn.map(x => x.id).join('|');
  if (rKey !== _syncedRaimentId) {
    _syncedRaimentId = rKey;
    player.raimentDef = worn.reduce((n, x) => n + (x.defense || 0), 0);
    player.recomputeStats();
    // The deepest-tier piece decides the colour you read as "armoured".
    const lead = worn.reduce((a, b) => ((b.tier?.level || 0) > (a?.tier?.level || 0) ? b : a), null);
    const tint = lead?.tier?.color ? new THREE.Color(lead.tier.color).getHex() : null;
    // Only repaint if no ordinary armour is doing it — equipArmor owns
    // the tint whenever a real armour token is worn, and two writers to
    // one appearance is the recurring bug (trap #9).
    const anyArmorToken = Object.values(player.armorTokens || {}).some(Boolean);
    if (!anyArmorToken) player.applyWornTint(tint);
    eventBus.emit(Events.PLAYER_EQUIP_VISUAL, { color: tint });
    if (worn.length) {
      showNotification(`${worn.length} Raiment worn — DEF ${player.stats.def}.`);
    }
  }

  // ── Echoes — the summon manifests while it is equipped ──
  _syncEchoes();
}

// ══════════════════════════════════════════════════════════
// AN ECHO IS A SUMMON, AND IT MANIFESTS WHEN YOU EQUIP IT
//
// Owner: "an ECHO is a sort of a summon, thus something should
// materialise and form when an ECHO is equipped."
//
// Before this, a forged Echo Memory was filed in `held` beside the
// charms and did nothing but contribute Aspects — the form whose
// blurb is "something that comes when called, and goes back after"
// never came, and had nothing to go back from.
//
// It now occupies one of the three COMBAT slots and, while it does,
// there is a real creature standing next to you that fights what you
// fight. Taking it out of the slot sends it back.
//
// ⚠️ KEYED ON THE SLOT CONTENTS, not on a count. Swapping Echo A for
// Echo B in the same slot has to dismiss A and manifest B; anything
// that only compares "how many Echoes are equipped" sees no change
// and leaves the wrong shade standing.
// ══════════════════════════════════════════════════════════

/** memoryId → the live Enemy instance standing in for it. */
const _liveEchoes = new Map();

function _syncEchoes() {
  if (!enemySpawner) return;
  // ⚠️ STEEL: Echoes / thralls are cut from combat (owner). Nothing
  // manifests; anything still standing from an old save is sent back.
  const want = new Map();

  // Send back anything no longer equipped — or anything that died.
  for (const [id, creature] of [..._liveEchoes]) {
    if (!want.has(id)) {
      if (creature.alive) creature.dismiss();
      _liveEchoes.delete(id);
    } else if (!creature.alive) {
      // It fell in a fight. Do NOT silently re-summon it — an Echo
      // that respawns for free while equipped is an infinite ally.
      _liveEchoes.delete(id);
    }
  }

  // Manifest anything newly equipped.
  for (const [id, mem] of want) {
    if (_liveEchoes.has(id)) continue;
    const creature = _manifestEcho(mem);
    if (creature) _liveEchoes.set(id, creature);
  }
}

function _manifestEcho(mem) {
  // Beside you and a little behind, on the real ground — never at
  // `player.position.y + 6` and never in front, where it would be
  // standing in the shot the instant it arrived.
  const side = new THREE.Vector3(Math.cos(_echoAngle), 0, Math.sin(_echoAngle)).multiplyScalar(2.6);
  _echoAngle += 2.4;
  const pos = player.position.clone().add(side);
  pos.y = chunkManager.getGroundY(pos.x, pos.z);

  // ⚠️ The species is derived from the Memory's own seed, so the same
  // Echo always comes back as the same thing. A shade that arrived as
  // a different creature each time would not read as *your* Echo.
  const typeIndex = Math.abs(_hashStr(mem.id)) % 12;
  const creature = enemySpawner.spawnNamed(
    typeIndex, pos, Math.max(2, player.level),
    {
      name: mem.name,
      friendly: true,
      hpMult: 1.0 + (mem.grade?.level || 1) * 0.25,
      atkMult: 0.55 + (mem.grade?.level || 1) * 0.12,
      scaleMult: 0.92,
    },
  );
  if (!creature) return null;

  // It KNITS ITSELF TOGETHER on arrival — the same materialisation a
  // woven weapon plays in your hand, on the thing standing beside you.
  if (creature.mesh) weaveVFX.materialise(creature.mesh, mem.element || 'shadow', { dur: 0.7 });
  weaveVFX.ring(pos, mem.element || 'shadow', { size: 2.2, life: 0.7 });
  particleBursts.spawn(pos.clone().setY(pos.y + 1), mem.element || 'shadow', { count: 16, sizeMult: 1.2 });

  eventBus.emit(Events.ECHO_MANIFESTED, { id: mem.id, name: mem.name });
  showNotification(`${mem.name} takes shape beside you.`);
  return creature;
}

/** Each Echo arrives on a different side of you rather than stacking. */
let _echoAngle = 0.7;

function _hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  // ⚠️ murmur3 fmix32 finalizer, per trap #17 — plain FNV leaves the
  // low bits weakly mixed, which is exactly the range `% 12` reads.
  h ^= h >>> 16; h = Math.imul(h, 2246822507);
  h ^= h >>> 13; h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h | 0;
}

/**
 * Make a woken weapon LOOK woken.
 *
 * ⚠️ Re-derived from the current stage and re-applied on every equip,
 * never incremented — the viewmodel weapon is rebuilt from scratch on
 * each equip, so a one-shot effect at awaken time would vanish the
 * next time the player swapped and swapped back.
 *
 * One emissive focal point per object (§3): this scales the accent gem
 * and its light, and does NOT add a second glowing part.
 */
function _applyAwakenGlow() {
  if (!viewmodel?.weapon) return;
  const stage = awakeningSystem.stage || 0;
  // 0 → untouched. Each rung is a visible step, not a smooth ramp.
  const boost = [1, 1.5, 2.4, 3.6][Math.min(stage, 3)];
  viewmodel.weapon.traverse(o => {
    if (o.name === 'weapon-light') {
      o.userData.baseIntensity ??= o.intensity;
      o.intensity = o.userData.baseIntensity * boost;
    } else if (o.name === 'weapon-core' && o.material) {
      o.material.emissiveIntensity = 0.6 * boost;
    }
  });
}



function updateViewmodel(dt, time) {
  if (!viewmodel) return;

  animateWand(viewmodel.wand, time);
  if (viewmodel.weapon) animateWeapon(viewmodel.weapon, time);
  // ⚠️ AFTER animateWeapon, never before — that function writes to the
  // weapon's own named parts, and `weapon-core` is one of the meshes
  // this lights.
  _updateWeaponGlow(dt);

  // Sway — a fast look drags the held prop behind it for a beat before
  // it eases back to rest, instead of being welded rigidly to the
  // crosshair. Driven off the camera's own yaw/pitch delta rather
  // than consuming mouse input again (CameraController already
  // consumed this frame's raw delta).
  const yawDelta = cameraController.yaw - _vmPrevYaw;
  const pitchDelta = cameraController.pitch - _vmPrevPitch;
  _vmPrevYaw = cameraController.yaw;
  _vmPrevPitch = cameraController.pitch;
  const swayEase = 1 - Math.exp(-9 * dt);
  _vmSwayYaw += (-yawDelta * 3.0 - _vmSwayYaw) * swayEase;
  _vmSwayPitch += (pitchDelta * 3.0 - _vmSwayPitch) * swayEase;

  // Bob — rides the same phase/envelope as the camera's own head bob,
  // just with a bit more amplitude, so the weapon reads as carried
  // rather than glued flush to the view.
  const bobY = Math.sin(cameraController.bobPhase) * cameraController.bobEnvelope;
  const bobX = Math.cos(cameraController.bobPhase * 0.5) * cameraController.bobEnvelope;

  // ══════════════════════════════════════════════════════
  // THE CHOREOGRAPHY (rendering/Choreo.js). One source for every pose
  // the prop in hand takes: a Facet in progress, else the swing in
  // progress, else the stance. The prop is placed so its GRIP sits on
  // the choreographed hand position — the hand leads, the weapon follows.
  // ══════════════════════════════════════════════════════
  const hasWeapon = !!viewmodel.weapon;
  const key = hasWeapon ? (viewmodel.key || 'sword') : 'focus';
  const rest = hasWeapon && viewmodel.rest ? viewmodel.rest : _wandRest();
  if (player.isAttacking && !_vmWasAttacking) {
    // A new beat: bake (cached) its clip and let ITS impact frame decide
    // when the hit lands (checkCombatCollisions reads windupFrac).
    // ⚠️ ITS OWN CLOCK. Squeezing every clip into attackTotal ran a
    // dagger's at 2× its authored speed (a flicker). The rate is capped;
    // a clip longer than the attack simply has its recovery cut by the
    // next beat, through the crossfade — which is how a combo flows.
    // A HEAVY plays its own clip, starting from however far the charge
    // already drew it back (the wind-up shown while LMB was held).
    const heavy = player.attackKind === 'heavy';
    // STEEL: the clip of the LINE being swung (or the technique).
    const clip = player.attackSpec ? steelClip(key, player.attackSpec, rest)
      : heavy ? heavyClip(key, rest) : attackClip(key, (player.comboCount + 3) & 3, rest);
    const t0 = heavy ? clip.windEnd * 0.9 * Math.min(1, player.heavyCharge || 0) : 0;
    const rate = Math.min(1.45, Math.max(0.85, (clip.dur - t0) / Math.max(0.2, player.attackTotal)));
    _vmAtk = { clip, t: t0, rate };
    _crossfade(heavy ? 0.05 : 0.07);
    if (clip.hits.length) player.windupFrac = Math.min(0.9, Math.max(0.1, ((clip.hits[0] - t0) / rate) / Math.max(0.2, player.attackTotal)));
  }
  _vmWasAttacking = player.isAttacking;

  let posed = false;
  if (_vmSkill) {
    if (!_vmSkill.clip) _vmSkill.clip = skillClip(key, _vmSkill.spec, rest, _vmSkill.seed || '');
    if (!_vmSkill.paused) _vmSkill.t += dt;
    posed = sampleClip(_vmSkill.clip, _vmSkill.t, _vmH, _vmQ, _vmCam);
    if (!posed) _vmSkill = null;
  }
  if (!posed && _vmAtk) {
    _vmAtk.t += dt * _vmAtk.rate;
    posed = sampleClip(_vmAtk.clip, _vmAtk.t, _vmH, _vmQ, _vmCam);
    if (!posed) _vmAtk = null;
  }
  // CHARGING a heavy: its wind-up, held as far as the charge has drawn it.
  const charging = combatSystem.charging && !posed;
  if (charging !== _vmWasCharging) { _crossfade(0.08); _vmWasCharging = charging; }
  if (charging) {
    const hc = steelClip(key, { line: combatSystem.previewLine(), kind: 'heavy' }, rest);
    sampleClip(hc, Math.max(1 / 120, hc.windEnd * 0.9 * combatSystem.charge), _vmH, _vmQ, _vmCam);
    // A held draw trembles a little at full strength.
    if (combatSystem.charge >= 0.98) _vmH.x += Math.sin(time * 60) * 0.0025;
    posed = true;
  }
  // BLOCKING: the weapon across the body, jolting back when a blow lands.
  const blocking = combatSystem.blocking && !posed;
  if (blocking !== _vmWasBlocking) { _crossfade(0.1); _vmWasBlocking = blocking; }
  _vmBlockKick = Math.max(0, _vmBlockKick - dt * 6);
  if (blocking) {
    const g = guardPose(key, rest);
    _vmH.copy(g.h); _vmQ.copy(g.q);
    _vmH.z += _vmBlockKick * 0.07; _vmH.y -= _vmBlockKick * 0.02;
    _vmCam.pitch = _vmBlockKick * 0.02; _vmCam.yaw = _vmCam.roll = _vmCam.push = 0; _vmCam.dip = -_vmBlockKick * 0.015;
    posed = true;
  }
  if (!posed) {
    _vmH.copy(rest.h); _vmQ.copy(rest.q);
    _vmCam.pitch = _vmCam.yaw = _vmCam.roll = _vmCam.dip = _vmCam.push = 0;
  }
  if (_vmX.t < _vmX.dur) {
    const k = _vmX.t / _vmX.dur, e = k * k * (3 - 2 * k);
    _vmH.lerpVectors(_vmX.h, _vmH, e);
    _vmQ.copy(_vmX.q.clone().slerp(_vmQ, e));
    _vmX.t += dt;
  }
  _vmLast.h.copy(_vmH); _vmLast.q.copy(_vmQ);
  // The camera layer — the body moving under the eye. Eased so a clip
  // cut short never snaps the view; yaw by the SHORT way round, or the
  // end of a full turn would unwind it.
  {
    const m = cameraController.motion, ce = 1 - Math.exp(-28 * dt);
    let dy = _vmCam.yaw - m.yaw;
    dy -= Math.round(dy / (Math.PI * 2)) * Math.PI * 2;
    m.yaw += dy * (posed ? 1 : ce);
    if (Math.abs(m.yaw) > Math.PI) m.yaw -= Math.sign(m.yaw) * Math.PI * 2;
    for (const k of ['pitch', 'roll', 'dip', 'push']) m[k] += (_vmCam[k] - m[k]) * (posed ? 0.6 : ce);
  }

  // Channel pulse — the shard swells the longer a hold-to-cast builds,
  // and eases back to its dim resting glow the instant it isn't.
  // ⚠️ THE SINGLE WRITER of wand-core's emissive (see _updateWeaponGlow).
  const pulse = (wandSystem.isChanneling ? 0.35 + wandSystem.channelProgress() * 1.4 : 0.35)
              + _glowBoost;
  viewmodel.wand.traverse(o => {
    if (o.name === 'wand-core' && o.material?.emissiveIntensity !== undefined) {
      o.material.emissiveIntensity = pulse;
    }
  });

  _vmEuler.set(_vmSwayPitch * 0.06, _vmSwayYaw * 0.09, Math.sin(time * 1.3) * 0.008);
  _vmQuatB.setFromEuler(_vmEuler);
  const bob = _vmPos.set(bobX * 0.012 + _vmSwayYaw * 0.05, bobY * 0.018, 0);

  if (hasWeapon) {
    const mount = viewmodel.weaponMount;
    mount.quaternion.copy(_vmQ).multiply(_vmQuatB);
    mount.position.copy(_vmH).sub(viewmodel.gripVec.clone().applyQuaternion(mount.quaternion)).add(bob);
    // The focus, in the off hand — idle, unless a two-hander has it.
    viewmodel.wandMount.position.set(-0.26 + bob.x, -0.25 + bob.y, -0.54);
    viewmodel.wandMount.rotation.set(-0.82 + _vmSwayPitch * 0.06, 0.30 + _vmSwayYaw * 0.09, -0.18 + Math.sin(time * 1.3) * 0.008);
    viewmodel.wandMount.scale.setScalar(0.62);
  } else {
    const mount = viewmodel.wandMount;
    mount.scale.setScalar(0.8);
    mount.quaternion.copy(_vmQ).multiply(_vmQuatB);
    mount.position.copy(_vmH).sub(_VM_WAND_GRIP.clone().applyQuaternion(mount.quaternion)).add(bob);
  }
  // Two hands on a two-hander, unless the left is casting.
  const wandBusy = wandSystem.isChanneling || performance.now() - _lastSpellAt < 650;
  const twoH = hasWeapon && !!viewmodel.offArm;
  // ⚠️ The off hand rides the haft; in an overhead the haft's butt (and
  // that hand) passes right by the eye and filled the screen as a giant
  // fist. Past the lens it is simply not drawn, as your own hand would be
  // out of focus and out of frame.
  let offNear = false;
  if (viewmodel.offArm?.userData.hand) {
    viewmodel.offArm.userData.hand.getWorldPosition(_vmPos2);
    // ⚠️ Hysteresis (0.30 in / 0.36 out). A single 0.42 threshold sat
    // right on the idle pose's distance, so the off hand blinked in and
    // out every frame of the bob — the "glitchy two hands".
    const d = _vmPos2.distanceTo(cameraController.camera.position);
    offNear = _vmOffNear ? d < 0.36 : d < 0.30;
    _vmOffNear = offNear;
  }
  if (viewmodel.offArm) viewmodel.offArm.visible = twoH && !wandBusy && !offNear;
  // ⚠️ STEEL: one weapon, the hands it needs. A one-hander shows ONE
  // hand (the empty off hand floating beside it read as a second, broken
  // grip); a two-hander shows the off hand on the haft; nothing drawn
  // shows the bare hand.
  viewmodel.wandMount.visible = !hasWeapon;
  if (viewmodel.wand) viewmodel.wand.visible = false;

  // ── Arms ───────────────────────────────────────────────
  // The left hand is a mirrored right hand while a weapon is drawn.
  if (viewmodel.wandArm) viewmodel.wandArm.scale.x = hasWeapon ? -1 : 1;
  const cam = cameraController.camera;
  cam.updateMatrixWorld();
  viewmodel.group.updateMatrixWorld(true);
  // ⚠️ Elbows sit INBOARD of the hands (toward the body's centre line)
  // and behind. A shoulder outboard of the hand rolls the back of the
  // hand away from the eye — the palm-forward "inverted" look.
  // Shoulders where shoulders are (camera space, scaled with the
  // viewmodel), elbows hanging down and out — two-bone IK in Hand.js.
  // ⚠️ LOW AND BEHIND, not where an anatomical shoulder sits relative
  // to the eye: the arm must come UP INTO the frame from below. With the
  // shoulder close behind the lens, a centred hand ran the upper arm
  // straight at the camera and it filled the screen.
  const shR = _vmShoulder.set(0.32, -1.5, 0.55), shL = new THREE.Vector3(-0.32, -1.5, 0.55);
  const poleR = _vmPole.set(0.5, -0.85, 0).transformDirection(cam.matrixWorld);
  const poleL = new THREE.Vector3(-0.5, -0.85, 0).transformDirection(cam.matrixWorld);
  if (viewmodel.wandArm && viewmodel.wandMount.visible) {
    const left = hasWeapon;
    poseArm(viewmodel.wandArm, cam.localToWorld((left ? shL : shR).clone()),
      _vmDorsum.set(left ? -0.55 : 0.55, 0.45, 0.7).transformDirection(cam.matrixWorld), left ? poleL : poleR);
  }
  if (hasWeapon) {
    const arm = viewmodel.weapon.children.find(c => c.name === 'fp-arm');
    if (arm) poseArm(arm, cam.localToWorld(shR.clone()),
      _vmDorsum.set(0.55, 0.45, 0.7).transformDirection(cam.matrixWorld), poleR);
    if (viewmodel.offArm?.visible) poseArm(viewmodel.offArm, cam.localToWorld(shL.clone()),
      _vmDorsum.set(-0.55, 0.45, 0.7).transformDirection(cam.matrixWorld), poleL);
  }
}

// ══════════════════════════════════════════════════════════
// Adaptive resolution — the last line of defence. Everything else in
// this pass is a fixed, structural cost cut; this is the one thing
// that responds to whatever's ACTUALLY happening on the player's own
// GPU, in case the fixed cuts still aren't enough on lower-end
// hardware (or too conservative on a fast one).
//
// Tracks a rolling ~0.6s average frame time. Sustained slowness backs
// the render resolution off in steps toward a 0.65× floor; sustained
// smoothness eases it back up toward the 1.3× cap. Reacting to a
// single slow frame would make the resolution flicker instead of
// settle, but the window's been shortened from 1.0s and the step
// widened from the original tuning — "extremely slow" needs the
// scaler to actually catch up within a couple of seconds, not ease
// toward it over ten.
//
// Below that, a second, more drastic tier: if lowering resolution
// alone still isn't enough (avgFps stuck under 22 even at the pixel
// ratio floor), shadows go off outright. A dynamic shadow map is
// usually the single most expensive thing in this pipeline, and a
// sustained ~20fps means the fixed structural cuts genuinely aren't
// matched to this device — better to lose shadows than stay unplayable.
// ══════════════════════════════════════════════════════════

const QUALITY_MIN_RATIO = 0.65;
// Was a hard 1.3, which silently became a BUG the moment the HD tiers
// started asking for a higher pixel ratio: `ultra` sets 2.0 at boot,
// and this scaler would then "helpfully" step it back down to 1.3 on
// the very first window where the machine was comfortably fast —
// permanently undoing the tier's main setting on exactly the hardware
// that could afford it. The ceiling has to come from the tier.
const QUALITY_MAX_RATIO = () => quality.settings.pixelRatioCap;
const QUALITY_STEP = 0.2;
const QUALITY_WINDOW = 0.6;
const QUALITY_COOLDOWN = 1.2;
const SHADOW_CUTOFF_FPS = 22;
// Effects are shed before resolution bottoms out, cheapest-looking
// loss first. God rays go before AO because AO is doing structural
// work (grounding objects) while god rays are atmosphere.
const GODRAYS_CUTOFF_FPS = 38;
const AO_CUTOFF_FPS = 30;
let _qWindowTime = 0;
let _qWindowFrames = 0;
let _qCooldown = 0;
let _qShadowsDropped = false;
let _qGodRaysDropped = false;
let _qAODropped = false;

function updateAdaptiveQuality(dt) {
  if (!sceneManager.renderer) return;

  // Never judge performance while the tab is in the background.
  //
  // Browsers suspend requestAnimationFrame entirely for a hidden tab,
  // so the engine's frame counter reads 0 fps — which this function
  // then interprets as a catastrophically slow machine and responds to
  // by permanently shedding god rays, then AO, then shadows. Each of
  // those is LATCHED, so the player alt-tabs for a moment and comes
  // back to a permanently degraded game with no way to recover it
  // short of a reload. Observed live.
  //
  // Also reset the sampling window: the first frame back after a long
  // hidden period carries a huge dt, which would skew the very next
  // average low even after this guard passes.
  if (document.hidden) {
    _qWindowTime = 0;
    _qWindowFrames = 0;
    return;
  }

  _qWindowTime += dt;
  _qWindowFrames++;
  if (_qCooldown > 0) _qCooldown -= dt;

  if (_qWindowTime < QUALITY_WINDOW) return;

  const avgFps = _qWindowFrames / _qWindowTime;
  _qWindowTime = 0;
  _qWindowFrames = 0;

  const current = sceneManager.renderer.getPixelRatio();

  // ── Effect shedding ───────────────────────────────────
  // These run before the resolution floor is reached, because a
  // fullscreen post pass costs the same whether the machine can
  // afford it or not, and dropping one is far less visible than
  // rendering the whole game at 65% resolution.
  //
  // Ordered by (cost / how much the look depends on it): god rays are
  // pure atmosphere and the first to go; AO is structural — it is what
  // makes objects sit ON the ground rather than hover — so it only
  // goes when things are genuinely bad.
  if (_godRaysPass && !_qGodRaysDropped && avgFps < GODRAYS_CUTOFF_FPS) {
    _godRaysPass.enabled = false;
    // Latch it. Without this, update() would re-enable the pass every
    // frame (it sets .enabled from sun visibility), the FPS would
    // recover, and the pass would flip on and off forever — a strobe
    // that looks far worse than either state.
    _qGodRaysDropped = true;
    console.log('[AdaptiveQuality] Low FPS — god rays disabled');
    _qCooldown = QUALITY_COOLDOWN;
    return;
  }

  if (_aoPass && !_qAODropped && avgFps < AO_CUTOFF_FPS) {
    _aoPass.enabled = false;
    _qAODropped = true;
    console.log('[AdaptiveQuality] Low FPS — ambient occlusion disabled');
    _qCooldown = QUALITY_COOLDOWN;
    return;
  }

  // Last-resort tier: resolution is already at the floor and it's
  // still this slow — the shadow pass is the next lever, not more
  // downscaling (which would start looking blurry for no real gain).
  if (!_qShadowsDropped && avgFps < SHADOW_CUTOFF_FPS && current <= QUALITY_MIN_RATIO + 0.01) {
    sceneManager.renderer.shadowMap.enabled = false;
    _qShadowsDropped = true;
    console.log('[AdaptiveQuality] Sustained low FPS at minimum resolution — shadows disabled');
    return;
  }

  if (_qCooldown > 0) return; // just changed — let it settle before judging again

  const cap = Math.min(QUALITY_MAX_RATIO(), window.devicePixelRatio || 1);

  let next = current;
  if (avgFps < 40 && current > QUALITY_MIN_RATIO) {
    next = Math.max(QUALITY_MIN_RATIO, current - QUALITY_STEP);
  } else if (avgFps > 55 && current < cap) {
    next = Math.min(cap, current + QUALITY_STEP);
  }

  if (next !== current) {
    sceneManager.renderer.setPixelRatio(next);
    _syncRenderSize?.();
    _qCooldown = QUALITY_COOLDOWN;
  }
}

// ══════════════════════════════════════════════════════════
// Game Loop
// ══════════════════════════════════════════════════════════

function fixedUpdate(dt) {
  if (!gameStarted) return;
}

// Distance walked, for MarkSystem. Tracked here because this is the
// one place the player's position is known every frame.
let _markLastPos = null;

function update(dt) {
  if (!gameStarted) return;

  updateAdaptiveQuality(dt);

  const time = performance.now() * 0.001;
  const dayCycle = (time * 0.04) % (Math.PI * 2);

  sceneManager.updateSunPosition(dayCycle, player.position, dt);
  syncGrade();
  chunkManager.update(player.position.x, player.position.z);
  // ── GRASS (realism pass) ──────────────────────────────
  // RŌNIN's wind-blown field, travelling with the player. Built lazily
  // on the first game frame so the chunk manager and biomes exist.
  // See rendering/GrassField.js.
  if (!_grass) {
    _grass = new GrassField(
      (x, z) => chunkManager.getGroundY(x, z),
      (x, z) => chunkManager.biomeManager.getBiomeForChunk(
        Math.floor(x / WORLD.CHUNK_SIZE), Math.floor(z / WORLD.CHUNK_SIZE)),
      () => chunkManager.terrainGen._wSurf);
    if (_grass.enabled) sceneManager.scene.add(_grass.mesh);
    if (window.__mz) window.__mz.grass = _grass;
  }
  _ensureLivingTerrain(sceneManager.scene);
  lightPool.update(cameraController.camera.position);
  if (window.__mz && !window.__mz.grass) window.__mz.grass = _grass;
  // ── The living terrain ─────────────────────────────────
  const storm = Math.max(0, Math.min(1, weather.intensity ?? 0));
  wind.update(dt, player.position, storm);
  // Grass and flora are scattered on whatever getGroundY says is ground;
  // inside a Descent dungeon that is a flagstone floor. Hidden, not torn
  // down — the overworld wants them back the moment you walk out.
  const _inDungeon = descentSystem.dungeonActive;
  if (_grass.mesh) _grass.mesh.visible = !_inDungeon;
  if (_flora?.mesh) _flora.mesh.visible = !_inDungeon;
  if (!_inDungeon) {
    _grass.update(dt, player.position, storm);
    _flora?.update(dt, player.position);
  }
  chunkManager.water?.update(dt);
  _ambient?.update(dt, cameraController.camera.position,
    chunkManager.biomeManager.getBiomeForChunk(Math.floor(player.position.x / WORLD.CHUNK_SIZE), Math.floor(player.position.z / WORLD.CHUNK_SIZE)),
    storm > 0.45);
  _updateWading(dt);
  if (!_biomeWarm) _biomeWarm = new BiomeWarmup(chunkManager, sceneManager.renderer, sceneManager.scene, cameraController.camera);
  _biomeWarm.update(dt, player.position);
  // Build at most a few milliseconds' worth of queued chunks per frame.
  // update() above only ENQUEUES now; this is what actually constructs
  // them, and the budget is what stops a chunk-boundary crossing from
  // freezing the game for ~200ms. See ChunkManager.drainChunkQueue().
  // 3ms, not 6. Halving the per-frame build budget halves how many
  // never-before-seen materials can appear in a single frame, which
  // spreads the unavoidable first-sight shader compiles across more
  // frames instead of concentrating them into one visible hitch.
  chunkManager.drainChunkQueue(3);
  chunkManager.updateEntities(dt, player.position);

  player.update(dt, chunkManager, chunkManager.getColliders());
  combatSystem.update(dt);
  combatHUD.update();
  _updateHudMode(dt);
  _syncNotifDim();
  // Footsteps — gated by animState the same way the walk/run bob
  // already is; playFootstep() self-throttles its own cadence, so
  // this can just fire every frame while moving.
  if (player.animState === 'walk' || player.animState === 'run') {
    audioSystem.playFootstep(_surfaceForBiome(chunkManager.getCurrentBiome()));
  }
  // The controller needs more than a position now — velocity/grounded/
  // animState drive head bob and the sprint FOV kick.
  cameraController.update(dt, player);
  updateViewmodel(dt, time);
  characterPreviewUI.update(dt);
  enemySpawner.update(dt, player.position, chunkManager);
  coreSystem.update(dt);
  loadout.update(dt);
  // Slash arcs, ward domes, dash streaks and the materialisation of a
  // freshly-woven Memory. Cheap no-op when nothing is live.
  weaveVFX.update(dt);
  // The summoned things trailing beside you. ⚠️ Fed the CAMERA's yaw,
  // not the player's — the ring is placed relative to where you are
  // LOOKING so it stays out of the shot, and the player's own facing
  // lags the camera by design.
  // ⚠️ `cameraController.yaw` is a public FIELD, not a getter. The
  // first version wrote `getYaw ? getYaw() : 0`, which compiles, runs,
  // and feeds a constant 0 forever — the ring would have sat pinned to
  // world north while the player span, and nothing would have logged.
  gearHalo.update(dt, cameraController.yaw);
  // Puts a borrowed weapon away once its Aspect has finished.
  _updateViewmodelBorrow(dt);
  facetCaster.update(dt);
  // Wounds that are still opening. No-ops when nothing is bleeding.
  _updateBleeds(dt);
  // Writes at most every 20s, and only when something worth keeping
  // has actually changed.
  saveSystem.update(dt);
  // A shrine's blessing counting down. No-op when none is active.
  boonSystem.update(dt);

  // Feeds the Long-Walker epithet. ⚠️ Uses the SAME guarded horizontal
  // delta the Marks use below — a Descent teleports the player ~500,000
  // units and would otherwise award it in one frame.
  // ⚠️ Horizontal distance only. Falling, and the vertical component
  // of walking up a hill, are not "the long walk" — and a Descent
  // teleports the player ~500,000 units, which would award every
  // distance Mark in the game in one frame. The jump guard below is
  // what stops that.
  if (_markLastPos) {
    const dx = player.position.x - _markLastPos.x;
    const dz = player.position.z - _markLastPos.z;
    const moved = Math.hypot(dx, dz);
    if (moved < 40) {
      markSystem.update(dt, moved);   // <40 = actually walked
      epithetSystem.noteDistance(moved);
    }
    _markLastPos.set(player.position.x, 0, player.position.z);
  } else {
    _markLastPos = new THREE.Vector3(player.position.x, 0, player.position.z);
  }
  pickupManager.update(dt, player.position, chunkManager.getTerrainGroup());
  projectileManager.update(dt, enemySpawner);

  // The three systems that make the world respond to how you play.
  attunement.update(dt);
  composition.update(dt, enemySpawner.getEnemies());
  saturation.update(dt);
  saturation.track(player.position);
  // Standing on volatile ground (opposed elements soaked into the same
  // cell — see SaturationSystem.js) makes the light itself unsteady, a
  // restrained horror beat rather than anything overt.
  // ── Shelter ──
  // How far inside the Sanctuary the player is, 0..1. Eased across the
  // last 40 units before the hub boundary rather than snapped, so
  // walking out through the gate is a gradual loss of shelter instead
  // of a light switch — and walking back in is a gradual relief, which
  // is the beat the whole hub exists to provide.
  //
  // WORLD.CHUNK_SIZE * 2.5 is the Sanctuary Override radius the terrain
  // generator itself uses (see TerrainGenerator's flat-hub branch);
  // reading the same constant means the safe light and the flat ground
  // can never disagree about where the town is.
  const HUB_R = WORLD.CHUNK_SIZE * 2.5;
  const distFromSpawn = Math.hypot(player.position.x, player.position.z);
  const shelter = Math.max(0, Math.min(1, (HUB_R - distFromSpawn) / 40));
  atmosphere.setSanctuary(shelter);

  // ── The world follows what you are made of ──
  // The path choice is gone; the sky now follows the dominant
  // attunement (see Atmosphere.TRAIT_SKIES). applyTrait() ignores
  // changes below a threshold, so this is safe to call every frame
  // even though it can re-bake the IBL.
  const domShare = attunement.elementShares?.()[0];
  atmosphere.applyTrait(domShare?.id || null, domShare?.share || 0);

  // Volatile ground makes the light unsteady — but not in here. The
  // Sanctuary is the one place the Fracture's argument is not being
  // had, and a horror cue firing in the safe town would undo the
  // entire point of having one.
  const volatility = (saturation.readAt(player.position)?.volatile || 0) * (1 - shelter);
  atmosphere.setUnease(volatility);
  updateDreadVignette();
  updateUneaseWhisper(dt, volatility);
  // Distance/direction to the active main quest's target, when it has
  // one — see updateQuestCompass's own doc comment for what "has one"
  // means. Self-throttled internally; safe to call every frame.
  updateQuestCompass(dt);
  updateDescentCompass(dt);
  // Points back at your own corpse. Self-throttled to 2.5Hz and
  // no-ops when there is no grave, which is most of the time.
  updateGraveCompass(dt);

  // Leaning re-derives from AttunementSystem's live residue, so it
  // moves even when no deed has been done — you can drift across the
  // middle purely by changing what you cast. Self-throttled to ~4Hz.
  leaning.update(dt);

  // ══════════════════════════════════════════════════════
  // THE FIRST NIGHTMARE
  //
  // ⚠️ Updated BEFORE the gate check below, so a trial that completes
  // on this frame opens its Gate on this frame too. Reversed, the
  // player would have to wait a frame for the way out to exist —
  // invisible in practice, but it is the kind of ordering that makes
  // "I finished it and nothing happened" reports.
  // ══════════════════════════════════════════════════════
  if (nightmareSystem.inNightmare) {
    nightmareSystem.update(dt);
    const gate = nightmareSystem.gate;
    if (gate && nightmareSystem.phase === PHASE.WAKING) {
      const d = Math.hypot(player.position.x - gate.x, player.position.z - gate.z);
      if (d < 9) _wakeFromNightmare();
    }
  }
  spoilsSystem.update(dt);

  // Radiant (Refinement ladder, tier 4) — continuous regeneration,
  // in and out of combat. Cheap enough to run unconditionally: grant()
  // is a plain object lookup and returns 0 for anyone below tier 4.
  const regen = ascentSystem.grant('healPerSec', 0);
  if (regen > 0) player.heal(regen * dt);

  // ══════════════════════════════════════════════════════════
  // ⚠️ OUT-OF-COMBAT RECOVERY — the game had NO baseline healing
  //
  // Owner: *"there is no healing mechanism except restoration."*
  // Correct, and worse than it sounds: the only continuous heal in the
  // project was `healPerSec`, an ASCENT TIER 4 grant. A new Pioneer —
  // and every Pioneer for many hours — had literally none. Health went
  // one direction until they found a Weave or an Aspect that mended,
  // which meant the First Nightmare was survivable exactly once.
  //
  // ⚠️ It is DELIBERATELY out-of-combat only. Regeneration during a
  // fight removes the reason to disengage and turns every fight into a
  // damage race; regeneration AFTER one removes the need to hoard
  // consumables to explore. The delay is what makes it a mechanic
  // rather than a difficulty setting.
  //
  // ⚠️ `_lastStruckAt` already exists — the Unbroken epithet uses it to
  // define "a fight" as 6 seconds without being hit. Reusing that same
  // clock means the game has ONE definition of being in combat rather
  // than two that can disagree.
  // ══════════════════════════════════════════════════════════
  if (player.hp > 0 && player.hp < player.maxHp) {
    const since = _lastStruckAt ? (performance.now() / 1000) - _lastStruckAt : 999;
    if (since > OOC_HEAL_DELAY) {
      // A share of MAX health per second, so it stays meaningful as the
      // pool grows instead of becoming a trickle by level 10.
      player.heal(player.maxHp * OOC_HEAL_FRACTION * dt);
    }
  }

  // A Descent in progress drives its own waves/Warden/boundary check.
  // No-ops when none is open, which is most of the time.
  descentSystem.update(dt);
  // ── THE WORLD EXPANSION ──
  gatherSystem.update(dt);
  caveSystem.update(dt);
  Enemy.playerNoisy = (input.isSprinting() && (player.velocity.x || player.velocity.z)) || player.isAttacking;
  updateCamps(dt);
  // What is standing in front of you that you could press E on. Also
  // no-ops cheaply — a distance check against a short NPC list and a
  // Map of nearby Gates.
  updateInteraction();

  // Wand system update (projectile movement, cooldowns, channelling)
  wandSystem.update(dt);
  wandSystem.assignHomingTargets(enemySpawner.getEnemies());

  // Wand casting — tap a slot's number key for a quick cast, hold to
  // channel it up.
  // ⚠️ STEEL: no spell bar, no Remnant keys, no summoning letters (owner
  // cut them). Only the belt: G draws the next carried weapon.
  updateBeltInput();

  // Read whatever the player is aiming at — the tactical layer.
  updateTargetRead();

  // Wand projectile vs enemy collision check
  checkWandCollisions();
  checkCombatCollisions();

  input.endFrame();
}

function render(alpha) {
  // One subtraction + a store; the overlay itself only re-renders at
  // 4Hz. A perf meter that costs frame time defeats its own purpose.
  perfHUD.frame();
  try {
    if (composer) {
      if (_gradePass) _gradePass.uniforms.uTime.value = performance.now() * 0.001;
      // The rays converge on wherever the sun currently projects to on
      // screen, so this has to be re-derived every frame from the same
      // sun direction Atmosphere is driving the light rig with.
      // Atmosphere publishes it rather than us recomputing the angle.
      // `_qGodRaysDropped` guard, not just a null check: the pass's own
      // update() assigns this.enabled from sun visibility every frame,
      // so calling it after the adaptive scaler has shed the pass would
      // immediately switch it back on.
      if (_godRaysPass && !_qGodRaysDropped) {
        // Own timer rather than sceneManager.clock.getDelta(): a
        // THREE.Clock's getDelta() is destructive — it resets the
        // accumulator — so sharing one across two consumers silently
        // gives the second one a delta of ~0. Nothing else reads that
        // clock today, but this pass shouldn't be the reason a future
        // caller breaks.
        const now = performance.now();
        const rayDt = _lastRayTime ? Math.min((now - _lastRayTime) / 1000, 0.1) : 0.016;
        _lastRayTime = now;
        _godRaysPass.update(cameraController.camera, atmosphere.sunDirection, rayDt);
      }
      composer.render();
    } else {
      sceneManager.render(cameraController.camera);
    }
  } catch (err) {
    console.error('[Main] Render error:', err);
    sceneManager.render(cameraController.camera);
  }

  if (gameStarted) {
    renderMinimap();
    characterPreviewUI.render();
  }
}

// ══════════════════════════════════════════════════════════
// Minimap
// ══════════════════════════════════════════════════════════

// Dread — the vignette tightens and its heartbeat quickens as HP
// drops. Deliberately restrained: no gore, no jump-scare, just the
// frame itself starting to feel like it's closing in.
let _dreadEl = null;
function updateDreadVignette() {
  _dreadEl ||= document.getElementById('dread-vignette');
  if (!_dreadEl || !player.maxHp) return;
  // Damped by shelter: bleeding out is still bleeding out, but the
  // dread vignette and the heartbeat are horror cues, and the hub is
  // where the horror stops. At full shelter they read at 35% strength
  // rather than zero — you should still be able to tell you are hurt.
  const shelter = atmosphere.sanctuary || 0;
  let danger = Math.max(0, 1 - player.hp / player.maxHp) * (1 - shelter * 0.65);
  // ── The tonal split, on the UI side ──
  // Inside a Descent the vignette is present even at full health. The
  // hub is safe and reads safe; a Trial should read as a Trial before
  // anything has hit you, because the dread is the POINT of the place
  // rather than a response to damage.
  if (descentSystem.isActive) danger = Math.max(danger, 0.28);
  _dreadEl.style.opacity = danger > 0.05 ? Math.min(0.85, danger * 0.9 + 0.05) : 0;
  _dreadEl.style.setProperty('--pulse-speed', `${Math.max(0.6, 1.8 - danger * 1.3)}s`);
  // The vignette's own comment has said "heartbeat quickens" since the
  // day it was written — there was never an actual heartbeat sound to
  // go with it until now. Same danger value drives both.
  audioSystem.setHeartbeat(danger);
}

/**
 * Footstep timbre for the ground you are standing on.
 *
 * ⚠️ Reads `biome.surface`, a declared field, for the same reason the
 * spawner now reads `biome.enemyTypes`: the substring ladder this
 * replaced matched on DISPLAY NAMES, so it silently mis-classified any
 * biome nobody remembered to name with the right word in it — 'Glacier
 * Shelf' and 'The Drowned Flats' both fell through to stone, and
 * 'Stormwrack Coast' matched nothing at all. Name and behaviour should
 * not be the same string.
 */
function _surfaceForBiome(biome) {
  return biome?.surface || 'stone';
}

// Unease whisper — the second, rarer restrained horror beat. Lingering
// on volatile ground (opposed elements soaked into the same cell)
// slowly builds exposure; crossing the threshold flashes ONE line
// from a small pool and resets, gated by a long cooldown so it can
// never become a steady drumbeat — the whole point is that it's rare
// enough to still be unsettling when it happens.
let _uneaseExposure = 0;
let _uneaseCooldown = 0;
let _uneaseEl = null;
// Mastering an element (see the ATTUNEMENT_UPDATE listener) marks you
// physically — see EntityForge.applyPioneerCorruption — and it also
// makes the volatile ground notice you faster: shorter exposure to
// trigger, shorter cooldown between whispers. The corrupted don't get
// to stand in a bad place quietly.
let _isCorrupted = false;
function updateUneaseWhisper(dt, volatility) {
  if (_uneaseCooldown > 0) _uneaseCooldown -= dt;
  if (volatility > 0.6) {
    _uneaseExposure += dt;
  } else {
    _uneaseExposure = Math.max(0, _uneaseExposure - dt * 2);
  }
  const exposureThreshold = _isCorrupted ? 3 : 6;
  const cooldownDuration = _isCorrupted ? 25 : 45;
  if (_uneaseExposure < exposureThreshold || _uneaseCooldown > 0) return;

  _uneaseExposure = 0;
  _uneaseCooldown = cooldownDuration;
  _uneaseEl ||= document.getElementById('unease-whisper');
  if (!_uneaseEl) return;
  _uneaseEl.innerText = UNEASE_WHISPERS[Math.floor(Math.random() * UNEASE_WHISPERS.length)];
  _uneaseEl.classList.remove('show');
  void _uneaseEl.offsetWidth; // restart the CSS animation even if it's mid-run
  _uneaseEl.classList.add('show');
}

function renderMinimap() {
  const canvas = document.getElementById('minimap');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const cx = width / 2, cy = height / 2;
  const scale = 3;

  ctx.clearRect(0, 0, width, height);

  // Biome color ring
  const biome = chunkManager.getCurrentBiome();
  if (biome?.fogColor) {
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, cy);
    const c = biome.fogColor;
    gradient.addColorStop(0, `rgba(${c.r*255|0},${c.g*255|0},${c.b*255|0},0.2)`);
    gradient.addColorStop(1, `rgba(${c.r*255|0},${c.g*255|0},${c.b*255|0},0.7)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, cy, 0, Math.PI * 2);
    ctx.fill();
  }

  // Enemies
  ctx.fillStyle = getComputedStyle(document.documentElement)
    .getPropertyValue('--accent-bright').trim() || '#d93b2b';
  const enemies = enemySpawner.getEnemies();
  for (const enemy of enemies) {
    const dx = enemy.position.x - player.position.x;
    const dz = enemy.position.z - player.position.z;
    if (Math.abs(dx) < cx * scale && Math.abs(dz) < cy * scale) {
      ctx.beginPath();
      ctx.arc(cx + dx / scale, cy + dz / scale, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Wand projectiles
  ctx.fillStyle = '#00ffff';
  for (const proj of wandSystem.getProjectiles()) {
    const dx = proj.mesh.position.x - player.position.x;
    const dz = proj.mesh.position.z - player.position.z;
    if (Math.abs(dx) < cx * scale && Math.abs(dz) < cy * scale) {
      ctx.beginPath();
      ctx.arc(cx + dx / scale, cy + dz / scale, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Player dot
  ctx.fillStyle = getComputedStyle(document.documentElement)
    .getPropertyValue('--chrome-bright').trim() || '#c9a24e';
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();

  // Direction
  const dir = cameraController.getForwardDirection();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + dir.x * 22, cy + dir.z * 22);
  ctx.stroke();
}

// ══════════════════════════════════════════════════════════
// Combat
// ══════════════════════════════════════════════════════════

// The old version put a hitbox sphere in front of the player, found
// every enemy inside it, then flipped a 50% coin per enemy to decide
// whether the swing actually landed — pure noise, with no connection
// to where the camera was actually aimed. Replaced with a real
// range+arc check against the camera's facing direction: anything
// inside melee range AND inside the swing's cone gets hit, every
// time. Aiming your swing now matters; whether it lands doesn't.
const MELEE_ARC_COS = Math.cos(THREE.MathUtils.degToRad(65)); // ~130° total swing width

// ══════════════════════════════════════════════════════════
// Bleeds — damage that keeps arriving after the hit that caused it.
//
// ⚠️ One flat list ticked from the main loop, NOT a timer per enemy.
// A setTimeout/setInterval per bleed would keep firing after the
// creature was destroyed, after a Descent teleported the player
// 500,000 units, and while the tab was backgrounded — and would go on
// referencing a corpse's mesh. This is the same reasoning that put
// corpses in `spawner._corpses` instead of leaving them to a timer
// (trap #22).
//
// ⚠️ Damage goes through COMBAT_HIT with `source: 'player'`, so a
// bleed inherits the Refusal cap, the Leaning multiplier and the
// lineage grant exactly like the strike that opened it. A bleed that
// applied raw damage would quietly bypass every power system in the
// game — trap #12's exact shape.
// ══════════════════════════════════════════════════════════
const _bleeds = [];

function _applyBleed(enemy, perTick, seconds, element) {
  if (!enemy?.alive || !Number.isFinite(perTick) || perTick <= 0) return;
  // Refresh rather than stack: re-applying keeps the strongest tick
  // and the longest remaining time, so spamming one ability on one
  // target cannot multiply into a hidden burst.
  const existing = _bleeds.find(b => b.enemy === enemy);
  if (existing) {
    existing.perTick = Math.max(existing.perTick, perTick);
    existing.left = Math.max(existing.left, seconds);
    return;
  }
  _bleeds.push({ enemy, perTick, left: seconds, acc: 0, element });
}

function _updateBleeds(dt) {
  if (!_bleeds.length) return;
  for (let i = _bleeds.length - 1; i >= 0; i--) {
    const b = _bleeds[i];
    if (!b.enemy?.alive) { _bleeds.splice(i, 1); continue; }
    b.left -= dt;
    b.acc += dt;
    if (b.acc >= 0.5) {                       // ticks twice a second
      b.acc = 0;
      eventBus.emit(Events.COMBAT_HIT, {
        source: 'player', target: b.enemy, damage: b.perTick, element: b.element,
      });
      particleBursts.spawn(b.enemy.position, b.element || 'neutral', { count: 4, sizeMult: 0.55 });
    }
    if (b.left <= 0) _bleeds.splice(i, 1);
  }
}

// Mastery effects that trigger "whenever the player lands a hit",
// regardless of which of the three hit pipelines (melee, wand,
// skill-cast fireball) it came through. Fireballs bypass the
// COMBAT_HIT event entirely (Projectile.js calls takeDamage directly,
// for its own collision-loop reasons), so this same helper is called
// from there too rather than duplicating the two mastery checks.
function applyMasteryOnHit(enemy, damage) {
  if (!enemy || !enemy.alive) return;

  // Hungering (void mastery) — every hit feeds you back.
  if (attunement.hasMastery('void')) {
    player.heal(damage * 0.12);
  }
  // Sated (Appetite ladder, tier 2). Stacks WITH Hungering rather than
  // replacing it: one is what you are made of and can decay away, the
  // other is what you survived and cannot. A void-attuned Cinderbound
  // getting both is the intended overlap, not a bug.
  const steal = ascentSystem.grant('lifesteal', 0);
  if (steal > 0) player.heal(damage * steal);
  // Frostbite (ice mastery) — every hit chills.
  if (attunement.hasMastery('ice') && enemy.applySlow) {
    enemy.applySlow(0.5, 1.5);
  }
}

// ⚠️ Throttled hard. The Refusal fires on EVERY capped hit, and an
// underranked player attacking a Sovereign generates one per swing —
// without this it is a wall of identical notifications instead of one
// piece of information.
let _refusalAt = 0;
function _noteRefusal(target, gap) {
  const now = performance.now();
  if (now - _refusalAt < 6000) return;
  _refusalAt = now;
  eventBus.emit(Events.UI_NOTIFY,
    `${target.name || 'It'} is ${Math.abs(gap)} Ranks above you. You are barely marking it.`);
}

/**
 * Signs for a Memory found on a quarry rather than drawn by the player.
 *
 * ⚠️ Real runes from real paths, not a fake sign object — MemoryForge
 * reads `geometry` off them to classify the property, and a stub would
 * classify as the fallback every time and make every Hunt reward
 * identical.
 */
function _quarrySigns() {
  const cells = hexField(GRID_RADIUS);
  const at = (q, r) => cells.find(c => c.q === q && c.r === r);
  const paths = [
    [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
    [[0, 0], [1, 0], [1, 1], [0, 2], [-1, 2], [-1, 1], [0, 0]],
    [[0, 0], [1, 0], [1, 1], [2, 1], [2, 0], [3, 0]],
  ];
  const pick = paths[Math.floor(Math.random() * paths.length)];
  const rune = runeForPath(pick.map(([q, r]) => at(q, r)).filter(Boolean));
  return rune ? [rune] : [];
}

/**
 * The melee profile of whatever is in hand.
 *
 * ⚠️ Falls back to the SWORD row, never to nothing — an unknown
 * weapon type must still be swingable. `WEAPON_MELEE` is keyed by
 * `weaponPlanKey()`'s normalised form, the same key EntityForge's
 * WEAPON_PLANS uses, so a type present in one is present in both
 * (trap #11 is exactly this pair drifting apart).
 */
// ══════════════════════════════════════════════════════════
// THE PLAYER'S OWN COLOUR — one writer, one definition
//
// Owner: "with aura glowing, the colour symbolising the player."
//
// Everything else coloured in this game is keyed to its OWN element:
// the weapon's accent gem, the spell body, the hit particles. This is
// the one thing keyed to the PERSON, and it is built from the two
// systems that actually answer "who is this Pioneer":
//
//   · WHAT THEY CAST — `_attunedElement`, the element they have put
//     the most Depth into. That is the base hue.
//   · WHAT THEY HAVE DONE — the Leaning, pulling that hue toward gold
//     (Ascendant) or ember (Cinderbound) in proportion to
//     `conviction()`. A Pioneer who has committed reads as committed.
//
// ⚠️ ONE WRITER, and this is it (trap #9). `GearHalo` deliberately
// does NOT derive its own colour from attunement — it is published
// in. Two readers of the same rule drift the moment the blend below
// changes, and a colour that is *almost* the same in two places is
// worse than one that is obviously different.
//
// ⚠️ `conviction()` is used, NOT the signed `value()`. Being strongly
// EITHER thing must beat being nothing in particular — at dead centre
// the blend is zero and the attuned element shows through pure, which
// is exactly right for someone who has not chosen.
// ══════════════════════════════════════════════════════════
const _AURA_ASCENDANT = new THREE.Color('#ffd9a0');
const _AURA_CINDERBOUND = new THREE.Color('#ff6a4a');
const _auraScratch = new THREE.Color();

function playerAura() {
  const el = player?._attunedElement || 'arcane';
  _auraScratch.set(ELEMENT_COLORS[el] || '#9fd6ff');
  const side = leaning.side === 'heaven' ? _AURA_ASCENDANT : _AURA_CINDERBOUND;
  // Capped at 0.45 so the attuned element is never fully overwritten —
  // at 1.0 every committed Pioneer would look identical regardless of
  // what they actually cast, which throws away the more specific of
  // the two signals.
  _auraScratch.lerp(side, Math.min(1, leaning.conviction()) * 0.45);
  return _auraScratch.getHex();
}

/**
 * What should be floating beside the player right now.
 *
 * ⚠️ The rule is the owner's own list — "relic, charm or weapon" —
 * and each exclusion below is load-bearing, not an omission. See
 * GearHalo's header for why Echoes and Raiment are deliberately out.
 */
function _haloWanted() {
  const out = [];
  loadout.weapons.forEach((m, i) => {
    if (!m) return;
    if (m.formId === 'echo') return;           // it walks beside you already
    if (i === loadout.activeSlot) return;      // that one is in your hand
    out.push({ id: m.id, memory: m });
  });
  for (const h of loadout.held) {
    // Raiment is worn, not carried alongside — it already tints the body.
    if (h.formId === 'raiment') continue;
    // ⚠️ Nor the INNATE power. The owner's list is relic, charm or
    // weapon; the Crucible's innate Facet is none of those — it is what
    // you ARE — but it is held as a Remnant with formId 'innate', so it
    // slipped through and floated as a glowing orb beside every new
    // Pioneer from the first second of the game.
    if (h.formId === 'innate') continue;
    out.push({ id: h.id, memory: h });
  }
  return out;
}

function _syncHalo() {
  gearHalo.setAura(playerAura());
  gearHalo.sync(_haloWanted());
}

function _meleeProfile() {
  const w = loadout.activeWeapon;
  if (!w?.weaponType) return WEAPON_MELEE.sword;
  return WEAPON_MELEE[weaponPlanKey(w.weaponType)] || WEAPON_MELEE.sword;
}

// ══════════════════════════════════════════════════════════
// WHAT A SWING LOOKS LIKE — one entry per weapon type
//
// Owner: "whenever the attack is used the specific weapon's graphics
// should come."
//
// ⚠️ A MELEE SWING DREW NOTHING AT ALL. Not "drew something generic" —
// `checkCombatCollisions` shook the camera and emitted COMBAT_HIT, and
// that was the entire visual result of every melee attack in the game.
// The eleven-silhouette pass gave each type its own range, arc, speed
// and hit count, all of which were real and none of which you could
// SEE: a scythe's 200° sweep and a spear's 45° line looked exactly
// alike. HANDOFF §7.11 left per-type animation open; this is the
// effects half of it.
//
// ⚠️ EVERY key in WEAPON_MELEE must appear here, and the resolver
// WARNS on a miss instead of quietly drawing a sword arc — that
// silent-fallback shape is trap #11, and this table is keyed by the
// same `weaponPlanKey()` normalisation WEAPON_MELEE and WEAPON_PLANS
// both use, so the three cannot drift apart independently.
//
// ⚠️ The shapes come from `weaveVFX`, which is an emissive Standard
// material with a real base colour — NOT additive white (§3, and
// SpellVFX's own hard lesson). An additive slash would make every
// element come out the same colour through bloom.
//
// `roll` is the swing angle around the aim axis: 0 is a flat
// horizontal sweep, ±1.57 is vertical. `beats` are extra arcs offset
// in time, so a weapon that lands `hits: 3` visibly strikes 3 times
// rather than flashing one arc while dealing three lots of damage.
// ══════════════════════════════════════════════════════════
const WEAPON_VFX = {
  dagger:     { kind: 'arc',   size: 1.3, sweep: 0.65, roll:  0.5,  life: 0.20, beats: [0, 0.09] },
  sword:      { kind: 'arc',   size: 2.1, sweep: 1.15, roll:  0.1,  life: 0.28 },
  dualblades: { kind: 'arc',   size: 1.8, sweep: 1.45, roll: -0.6,  life: 0.22, beats: [0, 0.07, 0.14] },
  axe:        { kind: 'arc',   size: 2.3, sweep: 0.95, roll:  1.15, life: 0.32 },
  greatsword: { kind: 'arc',   size: 3.3, sweep: 1.65, roll:  0.05, life: 0.40, ring: 3.2 },
  // The hammer's identity is the ground, not the arc — it lands.
  warhammer:  { kind: 'ring',  size: 3.4, life: 0.46, arcAfter: { size: 1.9, sweep: 0.8, roll: 1.4, life: 0.26 } },
  spear:      { kind: 'lance', size: 0.8, len: 5.2, life: 0.26 },
  scythe:     { kind: 'arc',   size: 3.0, sweep: 2.9, roll: -0.15, life: 0.42 },
  // ── The three that fire instead of swinging ──
  // They already spawn a real projectile with its own body and trail;
  // this is only the muzzle, so it must be SHORT and small or it reads
  // as a second spell being cast alongside the first.
  bow:        { kind: 'lance', size: 0.34, len: 2.4, life: 0.14, muzzle: true },
  staff:      { kind: 'ring',  size: 1.0, life: 0.20, muzzle: true },
  grimoire:   { kind: 'ring',  size: 1.3, life: 0.26, muzzle: true },
};

const _warnedWeaponVFX = new Set();

/**
 * The VFX row for a weapon type.
 *
 * ⚠️ Warns rather than substituting silently. A type present in
 * WEAPON_MELEE but absent here would otherwise draw a sword arc
 * forever and look almost right, which is how five correlated tables
 * in this project have drifted before.
 */
function _weaponVFX(weaponType) {
  const key = weaponPlanKey(weaponType || 'sword');
  const row = WEAPON_VFX[key];
  if (row) return row;
  if (!_warnedWeaponVFX.has(key)) {
    _warnedWeaponVFX.add(key);
    console.warn(`[WeaponVFX] no swing effect for "${weaponType}" (key "${key}") — drawing a sword arc`);
  }
  return WEAPON_VFX.sword;
}

/**
 * Draw the swing.
 *
 * ⚠️ Called on the SAME latched frame that resolves the damage, so
 * what you see and what you hit cannot disagree. Drawing it from the
 * animation instead would drift out of step with the hit window the
 * first time a weapon's speed changed.
 */
function _playWeaponSwing(origin, fwd, weaponType, element) {
  // ⚠️ STEEL: plain steel leaves NO effect at all — every branch below
  // (lance, ring, arc) drew flat white sheets on a mundane swing.
  if (combatSystem.element === 'neutral') return;
  const v = _weaponVFX(weaponType);
  const el = combatSystem.element !== 'neutral' ? combatSystem.element : (element || 'neutral');
  // A little in front of the eye — at the origin it is inside the
  // camera's near plane and invisible for exactly the weapons whose
  // reach is shortest.
  const at = origin.clone().addScaledVector(fwd, v.muzzle ? 0.9 : 1.1);

  if (v.kind === 'lance') {
    weaveVFX.lance(at, fwd, el, { size: v.size, len: v.len, life: v.life });
  } else if (v.kind === 'ring') {
    // A ground shockwave belongs on the GROUND. A muzzle flare belongs
    // where the projectile leaves from — same shape, two heights.
    const ringAt = v.muzzle ? at
      : new THREE.Vector3(at.x, chunkManager.getGroundY(at.x, at.z) + 0.12, at.z);
    weaveVFX.ring(ringAt, el, { size: v.size, life: v.life });
    if (v.arcAfter) {
      weaveVFX.arc(at, fwd, el, {
        size: v.arcAfter.size, roll: v.arcAfter.roll,
        sweep: v.arcAfter.sweep, life: v.arcAfter.life,
      });
    }
  } else {
    // ⚠️ STEEL: the trail follows the LINE that was swung — a flat cut
    // leaves a flat arc, an overhead a vertical one, a thrust a short
    // lance. The fixed per-weapon tilt drew a diagonal white wedge off
    // to the side of every flat cut.
    const L = LINES[player.attackLine];
    if (L && L.side === 'center' && L.plane !== 'high') {
      weaveVFX.lance(at, fwd, el, { size: 0.35, len: 2.2, life: 0.22 });
      return;
    }
    let roll = v.roll, sweep = v.sweep;
    if (L) {
      const dirSign = L.side === 'left' ? -1 : 1;
      roll = L.side === 'center' ? Math.PI / 2 : L.plane === 'high' ? 0.7 * dirSign : 0;
      sweep = Math.abs(v.sweep || 1.1) * (L.side === 'left' ? 1 : -1);
      if (L.plane === 'low') at.y -= 0.7;
    }
    const beats = v.beats || [0];
    for (const delay of beats) {
      const draw = () => weaveVFX.arc(at, fwd, el, {
        size: v.size * 0.8, roll, sweep, life: v.life,
      });
      // ⚠️ `beats` are milliseconds apart, not frames — a multi-hit
      // weapon lands its hits in one resolved swing, so the extra arcs
      // have no later frame to be drawn from.
      if (delay <= 0) draw(); else setTimeout(draw, delay * 1000);
    }
    if (v.ring) {
      const gy = chunkManager.getGroundY(at.x, at.z);
      weaveVFX.ring(new THREE.Vector3(at.x, gy + 0.12, at.z), el, { size: v.ring, life: 0.4 });
    }
  }
}

function checkCombatCollisions() {
  // ⚠️ Resolves at the weapon's IMPACT frame (realism pass): after its
  // wind-up, not ~50 ms after the click for every weapon alike.
  if (player.isAttacking && player.attackElapsed >= player.attackTotal * (player.windupFrac ?? 0.12)) {
    // ⚠️ Latched, so a swing resolves ONCE. The window above is ~3
    // frames wide, and every weapon in this table used to deal its
    // damage on each of them — worth roughly 3x its listed number.
    // Multi-hit weapons now declare `hits` explicitly instead.
    if (player._swingResolved) return;
    player._swingResolved = true;

    const prof = _meleeProfile();
    const fwd = cameraController.getForwardDirection();
    const origin = player.position.clone().add(new THREE.Vector3(0, 1, 0));

    // ── RANGED TYPES DO NOT SWING ────────────────────────
    // "A bow that swings is worse than no bow" — HANDOFF §7.11. The
    // bow, staff and grimoire fire through the wand's own projectile
    // path, so they get the element's real spell body, its animator,
    // its trail and its collision for free.
    if (prof.ranged) {
      const el = loadout.activeWeapon?.element || player._attunedElement || 'neutral';
      const colorHex = parseInt((ELEMENT_COLORS[el] || '#888888').replace('#', ''), 16);
      const aim = cameraController.getAimDirection();
      projectileManager.spawnFireball(
        origin.clone().addScaledVector(aim, 0.9), aim,
        Math.round(player.stats.atk * prof.mult * (player.attackKind === 'heavy' ? 1.6 : 1)), colorHex, el);
      // The muzzle — small and short, because the projectile it is
      // releasing already carries its own body and trail.
      _playWeaponSwing(origin, aim, loadout.activeWeapon?.weaponType, el);
      cameraController.shake(0.05, 0.12);
      return;
    }

    // ⚠️ DRAWN BEFORE THE HIT TEST, unconditionally — a swing that
    // connects with nothing must still be visible. Gating the effect
    // on `struck` would mean the player only ever sees their weapon
    // when they were already going to be told they hit something, and
    // "did my attack come out?" is precisely the question a whiff
    // needs answered.
    // Soft/hard lock: the swing bends toward the target (and steps in a
    // little) when it is near the line — the assist that makes a swing
    // at the thing under the crosshair actually go where you meant.
    const aimed = combatSystem.meleeAim(fwd, prof.range);
    fwd.copy(aimed);
    _playWeaponSwing(origin, fwd, loadout.activeWeapon?.weaponType,
      loadout.activeWeapon?.element);
    if (player.attackKind === 'heavy') {
      wind.impulse(player.position.clone().addScaledVector(fwd, 1.6), 2.6 + (player.heavyCharge || 0) * 1.4, 1.0 + (player.heavyCharge || 0) * 0.6);
    }

    // ⚠️ STEEL: the swing's LINE decides its arc and reach, a humanoid's
    // guard or a beast's rule decides what it does — all in
    // CombatSystem.resolveSwing, which emits the COMBAT_HITs itself.
    const struck = combatSystem.resolveSwing(origin, fwd);
    if (struck) cameraController.shake(0.03 + prof.mult * 0.03, 0.12);

    const nodePos = player.position.clone().add(fwd.clone().multiplyScalar(1.5));
    const nodes = chunkManager.getNodesInRange(nodePos, 3.0);
    // ⚠️ WORLD EXPANSION: the right tool, hard enough (GatherSystem).
    if (nodes.length) { gatherSystem.strikeNodes(nodes); cameraController.shake(0.04, 0.1); }
  }
}

// The reticle picks the nearest thing roughly in front of you, so
// the composition readout follows your aim without needing a lock-on.
function updateTargetRead() {
  // Pitch-aware — with free look now, "roughly in front of you" has to
  // account for looking up/down, not just which way you're facing.
  const dir = cameraController.getAimDirection();
  const enemies = enemySpawner.getEnemiesInRange(player.position, 26);
  let best = null, bestScore = 0.55;

  for (const e of enemies) {
    if (!e.alive) continue;
    const to = e.position.clone().sub(player.position);
    const dist = to.length();
    if (dist < 0.001) continue;
    const aim = to.normalize().dot(dir);
    if (aim > bestScore) { bestScore = aim; best = e; }
  }
  // One target everywhere: the combat target (soft/hard lock) if any.
  targetReadUI.setTarget(combatSystem.target || best);
  targetReadUI.update();
}

// ── Wand hotbar input: each infusion slot owns its own number key —
// tap to quick-cast, hold to channel it up, release to fire. This
// used to be a shared Q (hold-to-channel whatever slot happened to be
// "active") plus a completely separate raw listener in WandUI.js that
// used the SAME digit keys to pick the active slot — two independent
// systems reading one input, and Q double-booked with dodge on top of
// that. One key per slot removes the ambiguity outright.
// Which KEY we are currently holding a channel for, or null. Tracked
// explicitly rather than inferred from "was this key down last frame"
// — see the press half below for why that mattered.
let _channelKey = null;

function fireBoundWeave(_key) {
  const dir = cameraController.getAimDirection();
  const payload = wandSystem.release(player.position, dir);
  // The wand release used to be silent at the source — the bolt would
  // just appear a few frames later already in flight. A flash and
  // shake right at the tip sells the moment it actually fires, scaled
  // up a little for a bigger channelled cast.
  if (payload) {
    const kick = payload.tier === 'over' ? 1.6 : payload.tier === 'focus' ? 1.25 : 1.0;
    projectileManager.spawnMuzzleFlash(payload.origin, payload.color);
    cameraController.shake(0.05 * kick, 0.1 * kick);
  }
  updateHUD();
}

function updateWandInput() {
  // ── ⚠️ BINDINGS, NOT SLOTS ──
  //
  // This used to loop Digit1–Digit6 against six fixed wand slots. The
  // player never chose the key, six was a cap set by how many digits
  // sit in a row on a keyboard, and Echoes and Memories had no way to
  // be used at all.
  //
  // Now it walks whatever the player has bound. Any key, any of the
  // three kinds. See systems/BindSystem.js.
  //
  // ── Press: edge-latched, never polled ──
  // isKeyJustPressed() is set the instant the browser delivers keydown
  // and survives until endFrame(), so it cannot be missed. Polling
  // isKeyDown() instead silently drops any tap where both keydown and
  // keyup land between two frames — exactly the "I pressed it and
  // nothing happened" that makes casting feel unreliable.
  for (const b of bindSystem.all()) {
    if (!input.isKeyJustPressed(b.key)) continue;

    if (b.kind === 'aspect') {
      // An active Aspect moved off its default number key.
      const r = loadout.useId(b.id);
      if (!r.ok && r.reason) eventBus.emit(Events.COMBAT_LOG, { text: r.reason, kind: 'warn' });
      continue;
    }

    // ── ⚠️ GEAR: the letter that SUMMONS the thing ──
    //
    // Not one of its abilities — the Memory itself. Press to call it
    // out of the satchel into a slot, press again to send it back.
    // See LoadoutSystem's summoning block for why this is separate
    // from ASPECT: ASPECT binds an ability of a thing you have ALREADY
    // equipped, which is the step *after* the one the owner asked for.
    //
    // ⚠️ Every outcome speaks, including the refusals. A gear letter
    // that does nothing visible is exactly the "the keybinds are
    // broken" report §5 records — there the refusals were real and
    // silent, and the feature was blamed.
    if (b.kind === 'gear') {
      const r = loadout.toggleGear(b.id);
      if (!r.ok) { if (r.reason) showNotification(r.reason); continue; }
      const m = r.memory;
      if (r.action === 'summoned') {
        showNotification(m.formId === 'echo'
          ? `${m.name} — called into slot ${r.slot + 1}. It is taking shape beside you.`
          : `${m.name} — slot ${r.slot + 1}.`);
      } else if (r.action === 'carried') {
        showNotification(`${m.name} — carried. It is working.`);
      } else {
        showNotification(`${m.name} — put away.`);
      }
      audioSystem.playUIClick?.(r.action === 'dismissed' ? 'close' : 'open');
      continue;
    }

    if (b.kind !== 'weave') {
      // Echoes and Memories are instant — there is nothing to channel.
      spoilsSystem.activate(b.kind, b.id);
      continue;
    }

    // Already mid-channel on a different Weave? Fire that one off
    // rather than silently discarding the charge the player built.
    if (_channelKey && _channelKey !== b.key && wandSystem.isChanneling) {
      fireBoundWeave(_channelKey);
    }

    wandSystem.setActive(b.id);
    _channelKey = wandSystem.beginChannel() ? b.key : null;
  }

  // ── THE HOTBAR: 1..9 ────────────────────────────────
  // Active Aspects of equipped Memories. Passives never appear here
  // and have no key — see LoadoutSystem's header.
  // ⚠️ Edge-latched like the bindings above, for the same reason: a
  // tap whose keydown and keyup both land between two frames is
  // silently dropped by isKeyDown() polling.
  for (let n = 1; n <= HOTBAR_KEYS; n++) {
    if (!input.isKeyJustPressed(`Digit${n}`)) continue;
    const res = loadout.use(String(n));
    if (!res.ok && res.reason) eventBus.emit(Events.COMBAT_LOG, { text: res.reason, kind: 'warn' });
  }

  // ── Release: the one thing that genuinely is a held state ──
  if (_channelKey && !input.isKeyDown(_channelKey)) {
    if (wandSystem.isChanneling) fireBoundWeave(_channelKey);
    _channelKey = null;
  }

  updateCombatSlotInput();
}

// ══════════════════════════════════════════════════════════
// THE COMBAT SLOTS — G / H / J
//
// Owner: "for equiping anything there should be specific key binds,
// and for this purpose remove or the useless keybinds like 'g'."
//
// G, H and J were the grimoire, the wand panel and the journal. All
// three now live in the Pioneer menu (Tab) and the letters have been
// spent on the thing the owner wanted them for: the three combat
// slots. Tap one to bring that slot to hand.
//
// ⚠️ The 1..9 bar is NOT re-pointed by this. Every equipped Memory
// contributes its actives to one shared bar regardless of which slot
// is in hand — the owner's call. So switching slots changes what you
// SWING and what stands beside you, never what your number keys do.
// A bar that reshuffled under the player mid-fight would make every
// number key mean something different depending on invisible state.
//
// ⚠️ An empty slot SAYS it is empty. `setActiveSlot` refuses a slot
// holding nothing, and a refusal with no message is indistinguishable
// from a dead key — the same lesson as the silent bind refusals in §5.
// ══════════════════════════════════════════════════════════
// ── STEEL: nobody starts with nothing in their hand ──
// The Fracture Wand was the starting "weapon"; with the spell bar cut a
// new Pioneer gets plain steel and a small kit of rites, once.
const STARTER_SWORD = {
  id: 'mem_pilgrim_sword', name: "Pilgrim's Sword", isMemory: true, type: 'weapon', icon: '⚔️',
  element: 'neutral', formId: 'weapon', formName: 'Weapon', equips: 'weapon',
  grade: { level: 1, name: 'Worn' }, tier: { level: 1, name: 'Worn', color: '#8b7b5e' },
  attributes: { strength: 4 }, abilities: [], flaws: [], signs: [], weaponType: 'sword',
  power: 20, stats: { attack: 20 }, description: 'Plain steel. Somebody kept it sharp.',
};
function _ensureStarterSteel() {
  if (!loadout.weapons.some(w => w && w.formId !== 'echo')) {
    const free = Math.max(0, loadout.weapons.findIndex(w => !w));
    const r = loadout.equipWeapon({ ...STARTER_SWORD }, free);
    if (r.ok) loadout.setActiveSlot(free);
  }
  if (!combatSystem.kitGiven) {
    combatSystem.kitGiven = true;
    for (const [id, n] of [['draught_iron', 2], ['oil_ember', 1], ['chalk_ward', 1], ['worn_pickaxe', 1], ['worn_hatchet', 1], ['campfire_kit', 1]]) {
      const def = getItem(id); if (def) inventory.addItem(def, n);
    }
  }
}

// ── Faction camps: their people come out when you come near ──
const _campsSpawned = new Set();
let _campT = 0;
function updateCamps(dt) {
  if ((_campT -= dt) > 0) return;
  _campT = 1;
  if (caveSystem.isActive || descentSystem.isActive) return;
  for (const c of LOADED_CAMPS.values()) {
    if (_campsSpawned.has(c.id)) continue;
    if (Math.hypot(c.x - player.position.x, c.z - player.position.z) > 48) continue;
    _campsSpawned.add(c.id);
    const lvl = Math.max(2, Math.min(14, Math.round(Math.hypot(c.x, c.z) / 160)));
    const n = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const id = c.factions[i % c.factions.length];
      const a = (i / n) * Math.PI * 2, x = c.x + Math.cos(a) * 4, z = c.z + Math.sin(a) * 4;
      const e = enemySpawner.spawnNamed(typeIndexOf(id), new THREE.Vector3(x, chunkManager.getGroundY(x, z) + 1, z), lvl, {});
      if (e) { e.state = 'idle'; e.aggroRange = 16; }
    }
  }
}

/** G — draw the next weapon on your belt (the carried combat slots). T — tools. */
function updateBeltInput() {
  if (input.isKeyJustPressed('KeyT')) gatherSystem.cycleTool();
  if (!input.isKeyJustPressed('KeyG')) return;
  if (gatherSystem.toolOut) gatherSystem.draw(null);
  const n = loadout.weapons.length;
  for (let k = 1; k <= n; k++) {
    const i = (loadout.activeSlot + k) % n;
    const w = loadout.weapons[i];
    if (!w || w.formId === 'echo') continue;
    if (loadout.setActiveSlot(i)) { showNotification(`${w.name} drawn.`); audioSystem.playUIClick?.('open'); }
    return;
  }
  showNotification('Nothing else on your belt.');
}

const COMBAT_SLOT_KEYS = ['KeyG', 'KeyH', 'KeyJ'];

function updateCombatSlotInput() {
  for (let i = 0; i < COMBAT_SLOT_KEYS.length; i++) {
    if (!input.isKeyJustPressed(COMBAT_SLOT_KEYS[i])) continue;

    const held = loadout.weapons[i];
    if (!held) {
      showNotification(`Slot ${i + 1} is empty. Forge something, or equip it in the Loom.`);
      continue;
    }
    if (loadout.activeSlot === i) continue;   // already in hand, no re-equip churn

    if (loadout.setActiveSlot(i)) {
      const what = held.formId === 'echo'
        ? `${held.name} — it is already beside you.`
        : `${held.name} in hand.`;
      showNotification(what);
      audioSystem.playUIClick?.('open');
    }
  }
}

// Mires and Wards linger, so they must not re-hit the same enemy
// every frame they overlap it. Each projectile keeps its own set.
function checkWandCollisions() {
  const projs = wandSystem.getProjectiles();
  if (!projs.length) return;

  for (const proj of projs) {
    const payload = proj.payload;
    if (payload.form === FORMS.WARD) continue;   // wards act on the caster

    const pPos = proj.mesh.position;
    const hitRadius = Math.max(0.8, (payload.radius || 0) * 0.5 + 1.0);
    const enemies = enemySpawner.getEnemiesInRange(pPos, hitRadius);
    if (!enemies.length) continue;

    const lingering = payload.form === FORMS.MIRE;
    proj.hitSet ||= new Map();

    for (const enemy of enemies) {
      if (lingering) {
        // Re-tick on an interval instead of hitting once.
        // proj.life counts *down*, so elapsed = last - current.
        const last = proj.hitSet.has(enemy) ? proj.hitSet.get(enemy) : Infinity;
        const interval = payload.effect?.tickRate || 0.6;
        if (last - proj.life < interval) continue;
        proj.hitSet.set(enemy, proj.life);
      } else {
        if (proj.hitSet.has(enemy)) continue;
        proj.hitSet.set(enemy, proj.life);
      }

      // Resonance: does this element react with what's already on them?
      const { damage, reaction } = wandSystem.registerHit(enemy, payload);

      eventBus.emit(Events.COMBAT_HIT, {
        source: 'wand',
        target: enemy,
        damage,
        spell: payload.spellId,
        element: payload.element,
        effect: payload.effect,
        reaction: reaction?.id || null,
      });

      // Lances pierce, hunters and blooms are spent on contact.
      if (payload.form === FORMS.HUNT) {
        proj.life = 0;
      } else if (payload.form === FORMS.BLOOM) {
        proj.life = Math.min(proj.life, 0.25); // let the burst finish visually
      }
      // FORMS.LANCE keeps going — that's its whole point.
    }
  }
}

// ══════════════════════════════════════════════════════════
// UI Setup
// ══════════════════════════════════════════════════════════

// ⚠️ There is no class any more. It used to be picked from a grid here
// and then define the Pioneer permanently; it is now EMERGENT — see
// systems/LeaningSystem.js, whose calling() is the replacement. The
// player starts unshaped and is named by what they do.
let selectedSkills = [];
// No longer selected — everyone starts here and moves under play.
// No longer selected — everyone starts here and the Leaning moves it.
const selectedPath = { id: 'hell' };

function setupUI() {
  // A stroked-geometry divider under the title, in the same ornament
  // vocabulary WandUI/CauldronUI already use in-game — this screen
  // used to be plain text on a flat colour with nothing tying it to
  // the rest of the game's "forged manuscript" visual language at all.
  // The Fracture ornament rather than the neutral diamond rule — this
  // is the title screen of a game named after a split, so the divider
  // may as well be one. ruleOrnament() stays the generic section break
  // used elsewhere in-game; see Sigil.js's note on the pair.
  const ccTitle = document.querySelector('.cc-title');
  if (ccTitle) ccTitle.insertAdjacentHTML('afterend', fractureRule());

  // The loading plate's frame, and the same ornament under its title.
  const titlePlate = document.querySelector('#loading-screen .title-plate');
  if (titlePlate) titlePlate.insertAdjacentHTML('afterbegin', cornerFiligree());
  const loadTitle = document.querySelector('.loading-title');
  if (loadTitle) loadTitle.insertAdjacentHTML('afterend', fractureRule());

  // And one before the story overlay's button, so the three screens
  // share a single piece of ornament and read as one sequence.
  const storyBtn = document.getElementById('skip-story-btn');
  if (storyBtn) storyBtn.insertAdjacentHTML('beforebegin', fractureRule());

  // ⚠️ THE PATH CHOICE IS GONE.
  //
  // It used to be the first and "only irreversible" decision, made from
  // two cards before the player had done anything. That contradicted
  // the system that replaced classes: LeaningSystem exists so that what
  // you ARE is decided by what you DO, and opening the game by asking
  // you to declare it undercut that on the title screen.
  //
  // Everyone now starts Cinderbound — not as a choice, as a starting
  // position — and the Leaning moves from there under play, including
  // all the way across. The world's LOOK no longer follows the path at
  // all; it follows the dominant trait (see Atmosphere.applyTrait).
  setPath('hell');

  // ⚠️ THE DISCIPLINE PICKER IS GONE. `#skill-grid` no longer exists in
  // index.html, so this loop built cards into null and threw on the
  // first append. `selectedSkills` still gets a value below because
  // `player.init()` runs before any restore and must not be handed an
  // empty selection — but it is now a NEUTRAL STARTING KIT, not a
  // choice the player made, and the First Nightmare is what actually
  // decides who they are.
  selectedSkills = Object.keys(SKILLS).slice(0, 3);

  document.getElementById('player-name').addEventListener('input', checkStartReady);
  // ⚠️ Wrapped, NOT passed directly. `addEventListener` hands the
  // listener a MouseEvent, which would arrive as `opts` — and
  // `opts.continuing` on a MouseEvent is undefined, so it happens to
  // work today and would break silently the moment another flag is
  // added. Wrapping makes the argument list explicit.
  document.getElementById('start-game-btn').addEventListener('click', () => startGame());
  // The roster's own buttons — delegated on the screen, bound once.
  _bindRosterEvents();

  // Paint the ledger's initial (all-empty) state now rather than
  // waiting for the first click — otherwise the checklist and the
  // masthead's remaining-decisions count sit at their hardcoded HTML
  // defaults until the player happens to touch something.
  checkStartReady();
}

/**
 * Gate the start button — and, since this already runs on every single
 * input on the screen, say WHY it's shut.
 *
 * Previously this only toggled `disabled`, which left a dead grey
 * button as the sole feedback for four separate unmet conditions. Now
 * the same pass marks each section done/not-done (the numbered plates
 * recede as they're answered) and ticks the sticky ledger's checklist,
 * so the missing decision is always named. Pure DOM state driven off
 * the same four variables — no new source of truth.
 */
function checkStartReady() {
  const name = document.getElementById('player-name').value.trim();
  const btn  = document.getElementById('start-game-btn');

  const done = {
    name:   name.length > 0,
    // ⚠️ Always satisfied — the discipline picker was removed (see
    // index.html). Left in the map rather than deleted so the section
    // list and the gate cannot disagree about how many steps exist.
    skills: true,
  };
  const label = {
    name:   done.name ? name : '—',
    skills: 'decided elsewhere',
  };

  for (const [step, ok] of Object.entries(done)) {
    document.querySelector(`.cc-section[data-step="${step}"]`)?.setAttribute('data-done', String(ok));
    document.querySelector(`.cc-checklist li[data-check="${step}"]`)?.setAttribute('data-done', String(ok));
    const state = document.querySelector(`.cc-section-state[data-state-for="${step}"]`);
    if (state) state.textContent = label[step];
  }

  const remaining = Object.values(done).filter(v => !v).length;
  const step = document.getElementById('cc-masthead-step');
  if (step) {
    step.textContent = remaining === 0
      ? 'Chapter One — The gate is open'
      : `Chapter One — ${remaining} decision${remaining === 1 ? '' : 's'} remaining`;
  }

  if (remaining === 0) {
    btn.removeAttribute('disabled');
  } else {
    btn.setAttribute('disabled', 'true');
  }
}

// ══════════════════════════════════════════════════════════
// THE ROSTER — choosing which character this session is
//
// Owner: "I should have a menu where I can choose the character so the
// saves don't overlap."
//
// ⚠️ It sits BEFORE character creation and before any restore, because
// choosing the profile is what decides which key every later read and
// write lands on. The old flow went loading → creation → play with one
// save key for the whole game, so a second character overwrote the
// first on the next 20-second autosave — silently, with no prompt and
// no way back past the single `_prev` generation.
//
// ⚠️ `bindSystem.useProfile()` is called alongside `saveSystem`, never
// instead of it. Gear letters name MEMORY IDS, so a shared bind table
// hands a new character a keyboard pointing at a stranger's satchel.
// ══════════════════════════════════════════════════════════

/** Human "3 days ago" for the roster rows. */
function _agoText(ts) {
  if (!ts) return 'never played';
  const secs = Math.max(0, (Date.now() - ts) / 1000);
  if (secs < 90) return 'just now';
  const mins = secs / 60;
  if (mins < 60) return `${Math.round(mins)} min ago`;
  const hrs = mins / 60;
  if (hrs < 24) return `${Math.round(hrs)}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function showRoster() {
  const el = document.getElementById('roster-screen');
  if (!el) { document.getElementById('character-creation')?.classList.remove('hidden'); return; }
  // ⚠️ Adopt any pre-profiles run FIRST, so a returning player sees
  // their character in the list rather than an empty roster — which
  // reads exactly like it was deleted by the update.
  migrateLegacySave();
  renderRoster();
  el.classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
}

function renderRoster() {
  const list = document.getElementById('roster-list');
  if (!list) return;
  const profiles = saveSystem.profiles();
  const last = saveSystem.lastProfileId();

  list.innerHTML = profiles.length ? profiles.map(p => `
    <div class="roster-row${p.id === last ? ' recent' : ''}" data-profile="${p.id}">
      <div class="rr-main">
        <span class="rr-name">${p.name}</span>
        <span class="rr-sub">Level ${p.level}${p.lineage ? ` · ${p.lineage}` : ''} · ${_agoText(p.at)}</span>
      </div>
      <button class="rr-play" data-play="${p.id}">Continue</button>
      <button class="rr-del" data-delete="${p.id}" title="Delete this Pioneer">×</button>
    </div>`).join('')
    : '<div class="roster-empty">No Pioneers yet. Begin one below.</div>';

  const note = document.getElementById('roster-note');
  if (note) {
    note.textContent = profiles.length
      ? 'Each Pioneer keeps its own save. Deleting one cannot be undone.'
      : '';
  }
}

/** Continue an existing character: point everything at it, then boot. */
function _enterProfile(id) {
  saveSystem.useProfile(id);
  bindSystem.useProfile(id);
  document.getElementById('roster-screen')?.classList.add('hidden');
  // ⚠️ Straight past character creation — this Pioneer already exists.
  // Their name, skills and path come out of the save, not the form.
  const prof = saveSystem.profiles().find(p => p.id === id);
  _bootIntoWorld(prof?.name || 'Pioneer');
}

function _bindRosterEvents() {
  const el = document.getElementById('roster-screen');
  if (!el) return;
  el.addEventListener('click', (e) => {
    const play = e.target.closest('[data-play]');
    if (play) { _enterProfile(play.dataset.play); return; }

    const del = e.target.closest('[data-delete]');
    if (del) {
      const id = del.dataset.delete;
      const prof = saveSystem.profiles().find(p => p.id === id);
      // ⚠️ Confirmed, and it names them. This is the only irreversible
      // button on the screen and the whole feature exists so people
      // stop losing characters.
      if (!window.confirm(`Delete ${prof?.name || 'this Pioneer'} (level ${prof?.level ?? 1})? This cannot be undone.`)) return;
      saveSystem.deleteProfile(id);
      renderRoster();
      return;
    }

    if (e.target.closest('#roster-new')) {
      document.getElementById('roster-screen').classList.add('hidden');
      document.getElementById('character-creation').classList.remove('hidden');
    }
  });
}

/**
 * Continue a character that already exists.
 *
 * ⚠️ Reuses `startGame()` rather than duplicating its ~60 lines of
 * system wiring. Every system still has to be init'd in the same order
 * for a returning player — the restore writes OVER a live game, it
 * does not construct one (SaveSystem's header: "restoring in their
 * place leaves a character with no body"). The only difference is
 * where the name and the starting choices come from.
 *
 * ⚠️ The skills/path defaults below are placeholders that the restore
 * immediately overwrites. They exist because `player.init()` runs
 * before the restore and must not be handed an empty selection.
 */
function _bootIntoWorld(name) {
  const field = document.getElementById('player-name');
  if (field) field.value = name;
  if (!selectedSkills || !selectedSkills.length) {
    // ⚠️ `SKILLS` is an OBJECT keyed by id, not an array — `.slice`
    // on it throws, and this line only ever runs on the continue
    // path, so it would have been a crash nobody hit in testing.
    selectedSkills = Object.keys(SKILLS).slice(0, 3);
  }
  startGame({ continuing: true });
}

// ══════════════════════════════════════════════════════════
// WAKING — the Nightmare ends and the ordinary world begins
//
// ⚠️ THIS IS THE ONLY PLACE THE PLAYER LEAVES THE REALM. Every other
// path (dying, reloading) keeps them in it, deliberately: a First
// Nightmare you can escape by pressing respawn is not a trial.
// ══════════════════════════════════════════════════════════
function _wakeFromNightmare() {
  const snap = nightmareSystem.snapshot();
  if (!nightmareSystem.wake()) return;

  // ⚠️ Placed in the Sanctuary the same way the ordinary spawn is —
  // ON the ground, via the analytic height field, not at a fixed Y.
  // Dropping the player at y=10 over the hub works only because the
  // hub happens to be flat, and would put them inside the ground the
  // moment that changed.
  player.position.set(0, 0, 0);
  player.position.y = chunkManager.getGroundY(0, 0) + 2;
  player.velocity?.set(0, 0, 0);

  // ⚠️ EVERY LOADED CHUNK MUST BE REBUILT, not merely re-streamed.
  //
  // Chunk contents are built once and cached, and the ones the player
  // is standing among were generated WITH the Nightmare warp applied
  // (rings, heave, drained palette, doubled fog). Calling `update()`
  // alone loads the Sanctuary's missing chunks while leaving every
  // already-built one wearing the Nightmare — so the player wakes into
  // a hub sitting in warped grey ground, which is worse than not
  // clearing the warp at all.
  //
  // `rebuildAllChunks()` exists for precisely this shape of problem
  // (see its note: props cached before the nature models finished
  // downloading). The warp is already cleared by `wake()` at this
  // point, so everything regenerates as ordinary world.
  chunkManager.rebuildAllChunks();
  chunkManager.update(player.position.x, player.position.z);

  showNotification(`You wake. ${snap?.region || 'The realm'} is behind you.`);
  setTimeout(() => showNotification(
    `You carry ${snap?.aspect?.name || 'something'} out of it — and ${snap?.flaw?.name || 'a cost'}.`), 2600);
  saveSystem.save?.();
}

function startGame(opts = {}) {
  const name = document.getElementById('player-name').value.trim();
  characterCreated = true;
  document.getElementById('character-creation').classList.add('hidden');
  document.getElementById('roster-screen')?.classList.add('hidden');

  // ══════════════════════════════════════════════════════
  // ⚠️ A NEW PIONEER GETS ITS OWN SAVE SLOT, HERE.
  //
  // Created BEFORE any system can autosave and before the restore
  // check below, so a brand-new character can neither load somebody
  // else's run nor write into their key. This is the actual fix for
  // "the saves overlap": there is no longer a single key for a
  // second character to land on.
  //
  // ⚠️ `continuing` means the roster already selected the profile —
  // creating another here would fork a duplicate of the character the
  // player just chose to continue, every single time they loaded it.
  // ══════════════════════════════════════════════════════
  if (!opts.continuing) {
    const prof = saveSystem.createProfile(name || 'Pioneer');
    bindSystem.useProfile(prof.id);
    console.log(`[Save] new profile "${prof.name}" (${prof.id})`);
    // ⚠️ A NEW PIONEER GETS A NEW NIGHTMARE. `nightmareSystem` is a
    // module singleton and survives character creation — without this
    // it still held the PREVIOUS character's seed, so the
    // `if (!nightmareSystem.seed)` guard below never fired and every
    // Pioneer after the first inherited the first one's trial, region,
    // Aspect and Flaw. The owner saw one ability, every time, forever.
    //
    // ⚠️ Reset AND REGENERATE, both here. `initGame()` runs ONCE on
    // `window load` — before any character exists — so the Nightmare it
    // creates belongs to nobody, and every Pioneer made in that browser
    // session inherited that same one. Resetting alone would leave a
    // new character with NO Nightmare at all, because `begin()` only
    // ever ran inside `initGame`.
    //
    // ⚠️ This is where "a different person now exists" is actually
    // known. `initGame` cannot tell — it runs for continuing characters
    // too, and regenerating there would overwrite a returning
    // Pioneer's trial mid-run.
    nightmareSystem.reset();
    const fresh = nightmareSystem.begin(name || 'Pioneer');
    console.log(`[Crucible] "${fresh.title}" in ${fresh.regionName} — ${fresh.kind.verb} ${fresh.goal}, ${fresh.aspect.name}/${fresh.flaw.name}`);
  }

  const storyOverlay = document.getElementById('story-intro');
  storyOverlay.classList.remove('hidden');

  // No class. The Pioneer starts unshaped; LeaningSystem is seeded
  // with the path as a DECLARATION (worth ±0.40, not ±1) and play
  // moves it from there — including all the way across.
  player.init({ name, skills: selectedSkills });
  leaning.reset(selectedPath?.id || 'hell');
  // ⚠️ AFTER player.init(), not in initGame(). init() reassigns
  // `stats` to a fresh {atk:10, def:10} object, and ProgressSystem
  // snapshots the base values it derives from on its first call — so
  // running it earlier would snapshot a `stats` object that
  // player.init() then throws away, and every level's atk gain would
  // be written to an orphan.
  progressSystem.init(player);

  // ── Lineage & awakening ──────────────────────────────
  // ⚠️ Order matters: LineageSystem takes attunement/leaning by
  // INJECTION (it must not import them — this is read from the damage
  // path and a cycle through the three is the documented failure
  // shape), and AwakeningSystem pushes grants INTO LineageSystem, so
  // the lineage has to exist first.
  lineageSystem.init({ attunement, leaning });
  awakeningSystem.init({ player, inventory, spoils: spoilsSystem, progress: progressSystem });
  markSystem.init(player);
  // Names the world gives you for a defining act — see data/epithets.js.
  epithetSystem.init({ player });
  loadout.init({ player });
  // ⚠️ Core before Thread — a Thread's trigger can form a second Core,
  // so the Core has to exist for it to reach.
  coreSystem.init({ player, ascent: ascentSystem, progress: progressSystem });
  threadSystem.init({ core: coreSystem, ascent: ascentSystem });
  lineageUI.init({ lineageSystem, awakeningSystem, player });

  // Give starting wand and starter ingredients
  _giveStartingItems();

  // ══════════════════════════════════════════════════════
  // THE SAVE — put a previous run back, if there is one.
  //
  // ⚠️ AFTER every system's init() AND after _giveStartingItems(),
  // never instead of either. The systems build scene-graph objects and
  // bind their event listeners in init(); restoring in their place
  // leaves a character with no body. And the starting kit has to be
  // handed out FIRST so the restore can overwrite it — otherwise a
  // returning player gets their saved inventory plus a second wand
  // every time they load.
  // ══════════════════════════════════════════════════════
  // ⚠️ BEFORE `saveSystem.init/restore`. SaveSystem's `put('nightmare')`
  // calls `nightmareSystem.restore(seed)`, so the system must already
  // have its player/spawner references or the restored trial comes
  // back with nothing to act on — and it fails silently, because
  // `put()` swallows and warns rather than throwing.
  nightmareSystem.init({ player, spawner: enemySpawner, chunkManager });

  saveSystem.init({
    player, progressSystem, attunement, leaning, ascentSystem, lineageSystem,
    awakeningSystem, markSystem, coreSystem, threadSystem, inventory, loadout,
    questSystem, loreSystem, spoilsSystem, chunkManager,
    siteSystem, boonSystem, epithetSystem, nightmareSystem, combatSystem, gatherSystem,
  });
  // ⚠️ Only ever restores the profile the roster selected. `hasSave()`
  // reads the ACTIVE profile's key, and with no profile chosen that is
  // a scratch key that can never hold a real character — so a boot
  // that somehow skipped the roster loads nothing rather than loading
  // whoever happened to be last.
  if (saveSystem.profileId && saveSystem.hasSave()) {
    const res = saveSystem.restore();
    if (res.ok) {
      const info = saveSystem.info();
      showNotification(`Your run continues — level ${info?.level ?? '?'}.`);
      console.log('[Save] restored:', res.restored.join(', '));
    }
  }

  // ══════════════════════════════════════════════════════
  // ⚠️ EVERY MEMORY GETS A LETTER, INCLUDING OLD ONES.
  //
  // Gear letters are handed out at the forge, which does nothing for
  // a Memory forged before they existed or restored from a save
  // written before them — those come back with no key at all, and
  // "the thing I already own cannot be bound" is the same complaint
  // this whole pass answers. Measured on a restored run: all three
  // combat slots and four carried Memories reading "—".
  //
  // ⚠️ HERE, not in `loadout.init()`, and never in `_rebuild()`. This
  // is the first point at which BOTH the satchel and the loadout have
  // finished being restored — binding earlier would walk an inventory
  // the save has not filled in yet and hand out nothing.
  //
  // ⚠️ It only ever BINDS. That is what makes it safe to run at boot
  // where `pruneGearBindings()` explicitly is not: an empty inventory
  // makes this a no-op, whereas a prune would read it as "the player
  // owns nothing" and delete every saved letter (trap: the same shape
  // as the aspect-binding prune that nearly shipped).
  // ══════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════
  // ⚠️ AFTER the save restore, so a returning Pioneer is not handed a
  // fresh Nightmare over the top of the one they are already in.
  // `restore()` rebuilds the whole trial from its seed alone.
  // ══════════════════════════════════════════════════════
  // ⚠️ `restore()` above already handed the saved seed to
  // nightmareSystem via SaveSystem's own `put('nightmare', ...)`, so a
  // returning Pioneer is ALREADY reconstructed here. Only a character
  // with no Nightmare at all gets a fresh one — checked on `seed`
  // rather than on `hasSave()`, because a save predating this feature
  // has a save but no Nightmare, and that Pioneer must stay awake
  // rather than being dropped into the realm mid-run.
  // ⚠️ AFTER the full restore. The innate Aspect touches `maxHp`, and
  // the save's player block — which restores later — recomputes that
  // from level. Applied any earlier, the Aspect is silently erased and
  // only the Flaw survives (see reapplyInnate's note).
  if (nightmareSystem.reapplyInnate()) {
    console.log(`[Crucible] innate re-applied: ${nightmareSystem.trial.aspect.name} / ${nightmareSystem.trial.flaw.name}`);
  }

  if (!nightmareSystem.seed) {
    const t = nightmareSystem.begin(player.name);
    console.log(`[Crucible] "${t.title}" in ${t.regionName} — ${t.kind.verb} ${t.goal}`);
  } else {
    console.log(`[Crucible] restored "${nightmareSystem.trial?.title}" (${nightmareSystem.phase})`);
  }

  const _lettersGiven = loadout.ensureGearLetters();
  if (_lettersGiven) console.log(`[Loadout] ${_lettersGiven} gear letters assigned`);

  // ══════════════════════════════════════════════════════
  // ⚠️ AND THE ASPECT NAMES, for the same reason.
  //
  // Owner's screenshot: a hotbar reading QUAKE / QUAKE / QUAKE. The
  // generator now never emits a bare verb — but an Aspect's `name` is
  // a STRING baked onto the Memory at forge time and written into the
  // save, so every fix to naming applies only to things forged
  // afterwards. A returning player's satchel keeps its old labels
  // forever and experiences the fix as nothing having changed.
  //
  // ⚠️ Renames only — never keys, numbers, costs or cooldowns. Nothing
  // owned gets weaker or stronger; the repair reads as "the labels got
  // clearer", which is the only kind of migration that can run
  // unannounced on someone's save.
  //
  // ⚠️ Runs over the loadout AND the satchel, because a Memory is in
  // exactly one of the two and the duplicates the player sees are
  // across both.
  // ══════════════════════════════════════════════════════
  const _ownedMemories = [
    ...loadout.weapons.filter(Boolean),
    ...loadout.held,
    ...inventory.getSlotData().filter(st => st?.item?.isMemory).map(st => st.item),
  ];
  const _fixedNames = memoryForge.repairAspectNames(_ownedMemories);
  if (_fixedNames.renamed) {
    console.log(`[Forge] ${_fixedNames.renamed} duplicate Facet names resolved across ${_fixedNames.memories} Remnants`);
    // ⚠️ REBUILD **AND REPAINT**. `_rebuild()` refreshes the bar's own
    // entries but emits nothing, and the HUD strip is painted from
    // LOADOUT_CHANGED — which already fired during the save restore,
    // BEFORE this repair ran. Rebuilding alone left `loadout.bar`
    // holding the three corrected names while the hotbar on screen
    // still read "Quake / Quake / Quake", which is the entire bug the
    // repair exists to fix, surviving in the one place the player
    // actually looks. Measured exactly that way before this line.
    loadout._rebuild();
    _paintLoadoutBar();
  }

  _paintSummonBar();

  updateHUD();

  const skipBtn = document.getElementById('skip-story-btn');
  skipBtn.onclick = () => {
    storyOverlay.classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    // ⚠️ THE WORLD IS UP — story cards may play now, and not before.
    // SceneUI starts suspended because the first chunkManager.update()
    // can complete mq1 and request Act II's card during BOOT (see the
    // note at questSystem.init()). That card is z-index 900 with
    // pointer-events auto, so it rendered over the roster and
    // character creation and swallowed every click on them. Anything
    // requested while suspended is HELD, not dropped, and opens here.
    sceneUI.resume();
    // Stop the menu's own orbiting camera before the real game loop
    // starts driving the SAME camera from player position every frame
    // — two writers to camera.position would otherwise fight, one of
    // them silently losing every frame.
    if (_menuBackdropStop) { _menuBackdropStop(); _menuBackdropStop = null; }
    // Deferred until now rather than constructed eagerly — the canvas
    // needs real CSS layout size (the HUD was `hidden` until this
    // line) before a WebGLRenderer sized off clientWidth/clientHeight
    // means anything.
    characterPreviewUI.init();
    characterPreviewUI.setElement(player._attunedElement || 'arcane');
    // First real user gesture past character creation — browsers block
    // AudioContext creation before one, so this is where the game's
    // sound (previously: none at all) actually switches on.
    audioSystem.init();
    audioSystem.startAmbient(getPath().id);
    input.requestLook();
    gameStarted = true;
    _ensureStarterSteel();
    prewarmFauna();   // mesh the animals in idle time (rendering/Fauna.js)

    // ══════════════════════════════════════════════════════
    // ⚠️ A NEW PIONEER WAKES IN THE REALM, NOT THE SANCTUARY.
    //
    // Owner: *"I spawn at the same place, I need to randomly spawn on
    // one of the big places... and then after getting out I spawn into
    // the regular world just like Shadow Slave."*
    //
    // Placed HERE, after `engine.start()` is imminent and after the
    // save restore has run, so that:
    //   · a CONTINUING Pioneer who already woke is untouched — their
    //     phase restored as NONE and this block does nothing;
    //   · a continuing Pioneer still IN their Nightmare is put back
    //     where they were, not restarted;
    //   · a brand-new one gets a region, a trial and a spawn point.
    //
    // ⚠️ The chunk pass is forced BEFORE reading the ground height.
    // `getGroundY` is analytic and works with no chunk loaded, but the
    // player would otherwise stand for a frame over terrain that has
    // not been built — and on the very first frame of a new character
    // that is the one frame they judge the whole game by.
    // ══════════════════════════════════════════════════════
    if (nightmareSystem.inNightmare) {
      const sp = nightmareSystem.spawnPoint();
      chunkManager.update(sp.x, sp.z);
      player.position.set(sp.x, 0, sp.z);
      player.position.y = chunkManager.getGroundY(sp.x, sp.z) + 2;
      // ⚠️ THE INNATE POWER IS HANDED OVER ON THE WAY IN.
      const given = nightmareSystem.grantInnateNow();
      const t = nightmareSystem.snapshot();
      setTimeout(() => {
        showNotification(`You wake in ${t.region}. This is ${t.title}.`);
        if (given) {
          setTimeout(() => showNotification(
            `Something settles in you: ${given.aspect.name}. ${given.aspect.line}`), 2600);
          setTimeout(() => showNotification(
            `And what it cost: ${given.flaw.name}. ${given.flaw.line}`), 5600);
          setTimeout(() => showNotification(`${t.verb}. ${t.line}`), 8600);
        } else {
          setTimeout(() => showNotification(`${t.verb}. ${t.line}`), 2600);
        }
      }, 500);
    }

    engine.start();

    // ⚠️ ACT I OPENS THE GAME. Without this the arc has no beginning —
    // the player is simply standing in a town with a quest marker.
    // Fired after engine.start() so the world is already moving behind
    // the letterbox; a card over a frozen frame reads as a loading
    // screen. Deferred a beat so the first chunk pass has drawn.
    setTimeout(() => { const a = actFor('mq1'); if (a) sceneUI.chapter(a); }, 900);

    // ── Debug handle ──────────────────────────────────────
    // Verifying anything in this project from a browser console used
    // to mean `await import('/src/...')`, which returns a SEPARATE
    // module instance from the running game whenever HMR has touched
    // the graph — so every singleton came back un-inited (`scene:
    // null`) and looked broken when it wasn't. HANDOFF.md records
    // this burning multiple sessions.
    //
    // Publishing the live objects on one global removes the trap
    // entirely: `__mz.scene` IS the scene being rendered, always.
    // Dev-only, and read-only by convention.
    window.__mz = {
      THREE, PropForge, engine, input, sceneManager, cameraController, modelLibrary,
      player, chunkManager, enemySpawner, atmosphere, quality, environmentIBL,
      materialLibrary, EntityForge, weather, pickupManager, questSystem,
      ascentSystem, descentSystem, attunement, inventory, npcManager, leaning, eventBus, Events, journalUI,
      // ⚠️ On __mz, NOT reachable via `await import()` — that returns a
      // DIFFERENT module instance once HMR has touched the graph, so
      // these singletons come back looking uninitialised when they are
      // fine. HANDOFF §6 records this burning several sessions; it
      // burned this one too (wandSystem.slots read as [] from a dynamic
      // import while the real instance had three).
      wandSystem, projectileManager, potionSystem, questSystem, ascentUI, bindSystem, spoilsSystem, bindUI,
      // Probe hook: freeze a Facet's choreography at t — set({ spec, seed, t }) / set(null).
      combatSystem, combatHUD, wind, gatherSystem, caveSystem, crafting, siteSystem, LOADED_CAMPS, getItem, typeIndexOf, get biomeWarm() { return _biomeWarm; }, get flora() { return _flora; }, get ambient() { return _ambient; },
      vmDebug: () => ({ atk: _vmAtk && { dur: _vmAtk.clip.dur, rate: _vmAtk.rate, t: _vmAtk.t, hits: _vmAtk.clip.hits }, combo: player.comboCount, key: viewmodel?.key, wf: player.windupFrac }),
      // Probe hook: freeze a basic-attack beat at t (fraction of its clip) — set({ beat, u }) / set(null).
      atkAnim: { set: (o) => {
        if (!o) { _vmAtk = null; return; }
        const key = viewmodel?.weapon ? (viewmodel.key || 'sword') : 'focus';
        const clip = attackClip(key, o.beat & 3, viewmodel?.weapon ? viewmodel.rest : _wandRest());
        _vmAtk = { clip, t: o.u * clip.dur, rate: 0 };
        _vmX.t = 1;
      } },
      skillAnim: { set: (o) => { _vmSkill = o ? { spec: o.spec, seed: o.seed || '', t: o.t || 0, paused: true } : null; } },
      nightmareSystem,
      progressSystem, cauldronUI, lineageSystem, awakeningSystem, lineageUI,
      memoryForge, memoryForgeUI, markSystem, coreSystem, threadSystem, loadout,
      // The woven-gear visuals: materialisation, slash arcs, ward domes.
      // On here for the same reason everything else is — §6.
      weaveVFX, particleBursts, gearHalo, playerAura, saveSystem, siteSystem, boonSystem, loreSystem, epithetSystem,
      get scene()    { return sceneManager.scene; },
      get renderer() { return sceneManager.renderer; },
      get camera()   { return cameraController.camera; },
      get composer() { return composer; },
      /** One-line render-state summary — the thing most checks want. */
      report() {
        const r = sceneManager.renderer;
        return {
          tier: quality.tier,
          pixelRatio: r.getPixelRatio(),
          shadowMap: `${sceneManager.sunLight.shadow.mapSize.width}² type=${r.shadowMap.type}`,
          environment: sceneManager.scene.environment ? 'BAKED' : 'none',
          envIntensity: sceneManager.scene.environmentIntensity,
          iblKey: environmentIBL._lastKey,
          hdTextures: quality.useHDTextures,
          weather: weather.enabled
            ? `${weather.intensity.toFixed(2)} (fog x${weather.fogMultiplier.toFixed(2)}, key x${weather.keyMultiplier.toFixed(2)})`
            : 'disabled',
          passes: composer ? composer.passes.map(p => p.constructor.name) : [],
          drawCalls: r.info.render.calls,
          triangles: r.info.render.triangles,
          playerPos: player.position.toArray().map(n => +n.toFixed(1)),
        };
      },
    };
    eventBus.emit(Events.UI_NOTIFY, `Welcome to The Fracture, ${name}. You carry plain steel and not much else.`);
    setTimeout(() => eventBus.emit(Events.UI_NOTIFY, '1 / 2 / 3 pick your guard — high, middle, low. Click to cut on that line; right-click to guard it.'), 3200);
    setTimeout(() => eventBus.emit(Events.UI_NOTIFY, 'Better steel is smithed: Tab, then F for the Forge. Ore and leather come from the land and from what you kill.'), 7000);
  };
}

function _giveStartingItems() {
  // The path seeds a starting lean, so you begin as *something*
  // rather than as a blank stat block.
  attunement.setPlayer(player);
  attunement.seed(getPath().favouredElements.slice(0, 2), 5);

  // The wand is the starting kit — it is handed over, not found.
  wandSystem.init(1, player);
  wandUI.render();
  // The three path abilities only exist once character creation has
  // resolved, which is after WandUI's own construction — so the
  // ability half of the hotbar has to be built here, not in the
  // constructor. (Previously the ability bar was deleted outright by
  // WandUI taking over #hud-bottom, leaving Z/X/C invisible.)
  wandUI.renderAbilities();

  // ⚠️ STEEL / WORLD EXPANSION: no wand, no brewing reagents and no
  // starter spell in a new satchel any more — spells are gone. The
  // starting kit (a sword, tools, a campfire, rites) is
  // _ensureStarterSteel. The wand system still initialises underneath
  // so old saves load.
  const wandDef = getItem('fracture_wand');
  if (wandDef) player.equipWeapon(wandDef);

  // The opening hand comes from the chosen path — this is the thumb
  // on the scale that makes Heaven and Hell brew differently.
  void getPath;

  // ── A SPELL IN THE WAND ──
  //
  // ⚠️ The wand shipped with ZERO infused slots, and nothing else grants
  // one. Consequences, all of which read as separate bugs:
  //   · Pressing 1–6 said "Nothing infused in this slot" forever.
  //   · Tutorial t3 — "Cast three spells from the wand" — was
  //     literally impossible to complete.
  //   · The only castable thing was the class skill `fireball`, so the
  //     entire 1,380-spell system (and every element animator in
  //     SpellVFX) was unreachable until the player found the cauldron
  //     unprompted and worked out brewing with no example to copy.
  //
  // One spell, built from the path's own first favoured element, so
  // Heaven and Hell start holding visibly different things. This is a
  // STARTER, deliberately weak (potency 2, purity 0.55) — it exists to
  // demonstrate that the wand works and to give the player something
  // to compare their first brew against, not to compete with one.
  const starterElement = getPath().favouredElements[0];
  const starterSpell = registerItem(buildSpell({
    element: starterElement,
    form: FORMS.LANCE,
    potency: 2,
    purity: 0.55,
    instability: 0,
  }));
  void starterSpell;   // not handed out (see above)
}

function setupEventListeners() {
  eventBus.on(Events.PLAYER_DAMAGED, () => updateHUD());
  eventBus.on(Events.PLAYER_HEAL,    () => updateHUD());
  // A weapon was forged and equipped at the Forge — the viewmodel is
  // its own separate rig instance (same reason the character preview
  // needs the same event) so it can't just read Player.js's mesh.
  // ⚠️ A REAL equip cancels any borrow. Without this the borrow's timer
  // keeps running and, when it expires, calls `_restoreViewmodelWeapon()`
  // — which re-forges from `loadout.activeWeapon` and would be correct,
  // but the flag left standing means the NEXT genuine equip gets undone
  // half a second later. Clearing the flag here is what keeps "what is
  // in my hands" answerable by one thing.
  eventBus.on(Events.PLAYER_EQUIP_WEAPON, (data) => { _vmBorrow = null; _equipViewmodelWeapon(data); });

  // ── A woven weapon leaves a mark in the air ──────────
  // The only thing a melee swing drew was a camera shake. With a
  // forged Memory in hand it now cuts a visible arc, in that Memory's
  // own element, along the beat of the combo the swing belongs to —
  // so the four-beat combo reads in the WORLD and not only on the
  // viewmodel. Bare-handed and wand-only play is deliberately left
  // exactly as it was: this is the woven weapon's tell.
  eventBus.on(Events.PLAYER_ATTACK, ({ combo }) => {
    const w = loadout.activeWeapon;
    if (!w) return;
    const dir = cameraController.getAimDirection();
    const at = player.position.clone()
      .add(new THREE.Vector3(0, 1.15, 0))
      .add(dir.clone().multiplyScalar(1.7));
    // Matches COMBO_ARCS in updateViewmodel — beat 0/1 are horizontal
    // slashes in opposite directions, 2 is an overhead, 3 a rising cut.
    const ROLL = [1.35, -1.35, 0.05, -2.6];
    const SWEEP = [-2.0, 2.0, -0.9, 1.4];
    const i = (combo | 0) & 3;
    weaveVFX.arc(at, dir, w.element || 'neutral', {
      size: 1.9, roll: ROLL[i], sweep: SWEEP[i], life: 0.26,
    });
  });
  // A found-journal lore fragment was picked up — its own reveal
  // (title + text, held, faded) rather than the usual item toast.
  eventBus.on(Events.ITEM_PICKUP, (data) => {
    if (data.item?.isLore) revealLoreFragment(data.item);
    if (data.item?.isReliquary) {
      for (const { id, count } of data.item.contents) {
        const def = getItem(id);
        if (def) inventory.addItem(def, count);
      }
      // ⚠️ And the Essence, which is the part that actually hurt to
      // lose. `grantEssence` clamps to capacity itself — a reliquary
      // recovered after levelling could otherwise push the Core past
      // a ceiling CoreSystem is the sole authority on.
      const back = Math.floor(data.item.essence || 0);
      if (back > 0) {
        coreSystem.essence = Math.min(coreSystem.capacity, coreSystem.essence + back);
      }
      // InventorySystem's own ITEM_PICKUP listener (registered in its
      // constructor, earlier than this one) already added the
      // placeholder itself as a real slot by the time this runs —
      // strip it back out now that its contents are restored.
      inventory.consumeItems(data.item.id, 1);
      const back2 = Math.floor(data.item.essence || 0);
      eventBus.emit(Events.UI_NOTIFY, back2 > 0
        ? `Recovered what was spilled — ${back2} Essence.`
        : 'Recovered what was spilled.');
      _graveCachePickup = null;
      _gravePos = null;
    }
  });
  // The actual death penalty — see dropGraveCache() above.
  eventBus.on(Events.PLAYER_DEATH, (data) => {
    if (data?.position) dropGraveCache(data.position);
    showDeathOverlay();
  });
  // mq6 becomes active — forge Vell, a named wraith, rather than
  // leaving the quest pointed at "any wraith" (which still works
  // mechanically, but reads as a placeholder).
  eventBus.on(Events.QUEST_COMPLETE, (data) => {
    if (data.next?.id === 'mq6') spawnVell();
  });
  // A landmark's chunk loaded for the first time — see
  // ChunkManager._buildLandmarks. Fires exactly once per landmark per
  // world (the one-shot guard lives on the ChunkManager side), so
  // nothing here needs its own re-entry check.
  eventBus.on(Events.LANDMARK_DISCOVERED, (data) => {
    eventBus.emit(Events.UI_NOTIFY, data.msg || `You have discovered ${data.name}.`);
    audioSystem.playQuestChime();

    // Sunken Foundations gets a guardian — sq2 ("What the Golems
    // Guard") already progresses on ANY golem kill anywhere
    // (QuestSystem's generic kill-tracking), so this isn't a special
    // required enemy; it's just giving the side quest an actual place
    // to find one, the same way the fragment sitting at this same
    // spot gives mq4 a place instead of a random drop chance.
    if (data.id === 'sunken_foundations' && data.position) {
      // typeIndex 7 = golem (see ENEMY_TYPES in Enemy.js).
      enemySpawner.spawnNamed(7, data.position.clone().add(new THREE.Vector3(0, 8, 0)), 5, {
        name: 'The Foundation Warden',
      });
    }
  });
  // The Gate-Warden's scouting report. See ChunkManager.scoutGates()
  // for why this exists — Gates were reachable but not FINDABLE, which
  // made the whole Ascent loop unreachable.
  eventBus.on(Events.NPC_INTERACT, (d) => {
    if (!d?.scoutsDescents) return;
    const found = chunkManager.scoutGates(player.position.x, player.position.z, 10, 6);
    if (!found.length) {
      eventBus.emit(Events.UI_NOTIFY, 'Tove: Nothing close enough to send you at. Walk further out and ask again.');
      return;
    }
    const nearest = found[0];
    const dx = nearest.position.x - player.position.x;
    const dz = nearest.position.z - player.position.z;
    eventBus.emit(Events.UI_NOTIFY,
      `Tove marks ${found.length} on your map. Nearest: ${nearest.name}, ` +
      `${Math.round(Math.hypot(dx, dz))}m ${_compassDirection(dx, dz)}.`);
    audioSystem.playQuestChime();
  });

  // ── Leaning ─────────────────────────────────────────────

  eventBus.on(Events.LEANING_UPDATE, (snap) => {
    const c = document.getElementById('leaning-fill-cinder');
    const a = document.getElementById('leaning-fill-asc');
    if (c) c.style.width = `${snap.cinderbound}%`;
    if (a) a.style.width = `${snap.ascendant}%`;
    const cp = document.getElementById('leaning-cinder-pct');
    const ap = document.getElementById('leaning-asc-pct');
    if (cp) cp.textContent = `${snap.cinderbound}%`;
    if (ap) ap.textContent = `${snap.ascendant}%`;
    const call = document.getElementById('leaning-calling');
    if (call) call.textContent = snap.calling;
  });

  // Crossing the middle re-keys the entire world — sky, fog, light
  // rig, IBL bake, UI theme. setPath() is called HERE rather than
  // inside LeaningSystem on purpose: paths.js reaches into Atmosphere
  // and AscentSystem, and importing it from a system main.js builds
  // early is the deferred-init trap this project keeps hitting
  // (HANDOFF §3). LeaningSystem emits; main.js acts.
  eventBus.on(Events.LEANING_CROSSED, (d) => {
    setPath(d.to);
    showLongBeat(d.to === 'heaven' ? 'The Ascendant' : 'The Cinderbound', d.line);
    audioSystem.playQuestChime();
  });

  // ── The Ascent & Descents ───────────────────────────────
  //
  // Kept together here because they are one loop: a Descent pays a
  // Trial, a Trial is the thing Depth alone can never buy, and the
  // Ascent is the only permanent progression in the game.

  eventBus.on(Events.ASCENT_UPDATE, (snap) => {
    const rankEl = document.getElementById('ascent-rank');
    const ladderEl = document.getElementById('ascent-ladder');
    if (rankEl) rankEl.textContent = snap.rank.name;
    if (ladderEl) {
      ladderEl.textContent = snap.tier > 0
        ? `${snap.ladderTitle} · ${snap.trialsCleared} ${snap.verb === 'seal' ? 'sealed' : 'devoured'}`
        : snap.ladderTitle;
    }
  });

  // ── Lineage readout ──────────────────────────────────
  // The system existed and was completely invisible: nothing in the
  // HUD or the key hints mentioned it, so from the player's side
  // nothing had changed. A mechanic the player cannot find is not a
  // mechanic.
  const _paintLineage = () => {
    const nameEl = document.getElementById('lineage-name');
    const stageEl = document.getElementById('lineage-stage');
    const wrap = document.getElementById('lineage-readout');
    if (!nameEl || !wrap) return;
    const sounded = lineageSystem.isSounded;
    wrap.classList.toggle('unsounded', !sounded);
    nameEl.textContent = sounded ? lineageSystem.lineage.name : 'Unsounded — press N';
    if (stageEl) {
      const a = awakeningSystem.snapshot();
      stageEl.textContent = sounded ? `${a.stageName} ${a.stage}/${a.maxStage}` : '';
    }
  };
  eventBus.on(Events.LINEAGE_UPDATE, _paintLineage);
  eventBus.on(Events.LINEAGE_SOUNDED, _paintLineage);
  eventBus.on(Events.WEAPON_AWAKEN_UPDATE, _paintLineage);
  eventBus.on(Events.PLAYER_EQUIP_WEAPON, _paintLineage);
  _paintLineage();

  // One nudge, once, a little way into play — the Rite reads what you
  // have been doing, so prompting it at second zero would be reading
  // an empty page. Fires on the first level-up, which is early but
  // never immediate.
  let _ritePrompted = false;
  eventBus.on(Events.PLAYER_LEVEL_UP, () => {
    if (_ritePrompted || lineageSystem.isSounded) return;
    _ritePrompted = true;
    setTimeout(() => {
      if (!lineageSystem.isSounded) {
        eventBus.emit(Events.UI_NOTIFY, 'The Rite of Sounding will read you now. Press N.');
      }
    }, 2600);
  });

  // A woken weapon should read as woken, and the moment should land.
  eventBus.on(Events.WEAPON_AWAKENED, (d) => {
    _applyAwakenGlow();
    const el = d?.weapon?.element || player._attunedElement || 'arcane';
    const at = player.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    // Bigger burst the further up the ladder — rung 3 should feel like
    // a different event from rung 1.
    particleBursts.spawn(at, el, { count: 14 + d.stage * 10, sizeMult: 1.1 + d.stage * 0.25, life: 0.8 });
    cameraController.shake(0.06 + d.stage * 0.045, 0.25 + d.stage * 0.1);
    audioSystem.playUIClick?.('open');
  });

  eventBus.on(Events.ASCENT_RANK_UP, (data) => {
    // Held longer than an ordinary notification — this happens at most
    // five times in a run and should land like the finale's closing
    // beat, not like a pickup toast.
    //
    // ⚠️ Deliberately NOT showFinaleNarration(): that takes a
    // FINALE_NARRATION *key* (mq7's aris/self/ostra) and looks the
    // lines up itself, so passing it prose renders an empty panel and
    // throws nothing. Same DOM element, its own text path.
    showLongBeat(data.rank.name, data.line);
    eventBus.emit(Events.UI_NOTIFY, `You are ${data.rank.name}.`);
    audioSystem.playQuestChime();
  });

  eventBus.on(Events.ASCENT_BLOCKED, (data) => {
    eventBus.emit(Events.UI_NOTIFY, data.message);
  });

  eventBus.on(Events.DESCENT_ENTER, (d) => {
    const tracker = document.getElementById('descent-tracker');
    tracker?.classList.remove('hidden');
    const nameEl = document.getElementById('descent-name');
    if (nameEl) nameEl.textContent = `${d.name} · ${d.tierName}${d.kind ? ` · ${d.kind.name}` : ''}`;
    const obj = document.getElementById('descent-objective');
    // The KIND's objective, before the first wave — the player must
    // know what shape of trial they walked into.
    if (obj && d.kind) { obj.textContent = d.kind.objective; obj.dataset.phase = 'fighting'; }
    eventBus.emit(Events.UI_NOTIFY, d.blurb);
    if (d.kind) eventBus.emit(Events.UI_NOTIFY, `${d.kind.name}. ${d.kind.blurb}`);
    if (d.softened) {
      // The tier-5 Ascendant grant. Told to the player rather than
      // applied invisibly — a Descent quietly being easier than its
      // Gate said reads as a bug, not as a reward.
      eventBus.emit(Events.UI_NOTIFY, 'It opens weaker than it should. The wound flinches from you now.');
    }
  });

  // ⚠️ Say what to DO, not just where you are. This used to render
  // "Wave 1 of 3" and nothing else — a state, not an objective — and
  // it never changed until the next wave spawned. The player had no
  // way to know how many were left or what ended the Descent.
  eventBus.on(Events.DESCENT_PROGRESS, (d) => {
    const el = document.getElementById('descent-phase');
    const obj = document.getElementById('descent-objective');
    if (!el) return;

    if (d.phase === 'track') return;   // scouting, not a run

    if (d.phase === 'warden') {
      el.textContent = d.warden;
      if (obj) {
        obj.textContent = d.wardenHp !== undefined
          ? `Kill it — ${d.wardenHp}% left`
          : 'Kill it.';
        obj.dataset.phase = 'warden';
      }
      return;
    }

    el.textContent = `Wave ${d.wave} of ${d.waves}`;
    if (obj) {
      obj.textContent = d.remaining > 0
        ? `${d.remaining} left`
        : (d.wave >= d.waves ? 'The Warden is coming' : 'Clear — next wave incoming');
      obj.dataset.phase = d.remaining > 0 ? 'fighting' : 'clear';
    }
  });

  // ── Trial-kind reward bias ───────────────────────────
  // A Vigil marks you; a Hunt leaves a Memory on the quarry.
  eventBus.on(Events.DESCENT_MARK_EARNED, () => {
    markSystem.noteFlawlessDescent();   // counts toward the Vigil Marks
    // ⚠️ The same signal feeds the Unbroken epithet. DESCENT_RESOLVED
    // itself does not carry `flawless` (DescentSystem does not track
    // damage taken), so this — the one place that already knows — is
    // where the epithet has to hear about it.
    epithetSystem._offer({ kind: 'descent', flawless: true, tier: descentSystem.active?.tier ?? 1 });
    eventBus.emit(Events.UI_NOTIFY, 'You stood in it long enough to be changed by it.');
  });

  eventBus.on(Events.DESCENT_MEMORY_DROP, ({ payout }) => {
    // A forged Memory, seeded by the quarry rather than by the Loom —
    // ⚠️ built through memoryForge so it is the SAME kind of object a
    // player forges, not a parallel one with its own rules.
    const grade = Math.min(4, 1 + (payout.tier || 1));
    const cores = Array.from({ length: grade * 3 }, (_, i) => ({
      id: `quarry_core_${payout.element}_${i}`, name: 'Quarry Core',
      tier: { id: 'rare' }, element: payout.element,
    }));
    const res = memoryForge.forge('weapon', cores, _quarrySigns(), payout.element);
    if (res.ok) {
      inventory.addItem(res.memory, 1);
      eventBus.emit(Events.UI_NOTIFY,
        `${res.memory.name} was in it — ${res.memory.grade.name}, ${res.memory.abilities.length} Facets.`);
    }
  });

  // ── ACTIVE ASPECTS ───────────────────────────────────
  // ⚠️ Every active Aspect resolves to something REAL here. An ability
  // that spends Essence, plays a cooldown and does nothing is worse
  // than not having it — the player cannot tell it from a bug. If a
  // new active is added to ABILITY_POOLS it needs a branch here in the
  // same commit, and the `default` warns loudly rather than silently
  // eating the cost.
  facetCaster.init({
    player, enemySpawner, eventBus, Events, weaveVFX, particleBursts,
    cameraController, chunkManager, projectileManager,
    applyBleed: _applyBleed, notify: showNotification,
    elementHex: (el) => parseInt(String(ELEMENT_COLORS[el] || '#888888').replace('#', ''), 16),
  });

  combatSystem.init({
    player, cameraController, enemySpawner, audio: audioSystem,
    weaponWeight: () => (viewmodel?.weapon ? (CHOREO[viewmodel.key]?.heavy ?? 0.3) : 0.1),
    isRanged: () => !!_meleeProfile()?.ranged,
    canAct: () => gameStarted && !player.isDead,
    // STEEL (systems/CombatSystem.js): the family of the thing in hand,
    // its own element, the wind gust a big blow throws, and how a ritual
    // item is used up.
    family: () => familyOf((loadout.activeWeapon || player.equippedWeapon)?.weaponType),
    element: () => (loadout.activeWeapon || player.equippedWeapon)?.element || 'neutral',
    windImpulse: (at, r, s) => wind.impulse(at, r, s),
    metal: () => (loadout.activeWeapon || player.equippedWeapon)?.metal || null,
    consume: (item) => { if (item?.id) inventory.consumeItems(item.id, 1); },
  });
  // A committed blow that missed you (out of its arc / range) — footing.
  Enemy.onWhiff = () => combatSystem.noteWhiff();
  Enemy.mayStrike = (e) => combatSystem.mayStrike(e);
  // ── THE WORLD EXPANSION: gathering, stations, caves, camps ──
  gatherSystem.init({
    player, inventory, loadout, chunkManager, scene: sceneManager.scene, cameraController,
    notify: showNotification, combat: combatSystem,
    log: (text, kind) => eventBus.emit(Events.COMBAT_LOG, { text, kind }),
  });
  chunkManager.yieldOf = (node, biome) => gatherSystem.yieldOf(node, biome);
  crafting.stationOk = (kind) => gatherSystem.nearStation(kind);
  Enemy.hasKnife = () => gatherSystem.hasKnife();
  // The Sanctuary keeps a bloomery and a fire for everyone.
  for (const [kind, x, z] of [['smelter', -8.5, 5], ['fire', -5, 7.5]]) {
    const st = { kind, x, y: chunkManager.getGroundY(x, z), z, permanent: true };
    st.mesh = gatherSystem._build(st); gatherSystem.stations.push(st);
  }
  caveSystem.init({
    player, chunkManager, spawner: enemySpawner, scene: sceneManager.scene, notify: showNotification, typeIndexOf,
    isBusy: () => descentSystem.isActive,
    pickup: (id, pos) => { const d = getItem(id); if (d) pickupManager.spawn(d, pos, 1); },
  });
  // ⚠️ STEEL: a cleared Descent pays steel — a weapon by its tier, and
  // smithing stock — in place of the Memories and Echoes it used to.
  eventBus.on(Events.DESCENT_EXIT, (p) => {
    if (!p || p.aborted || !p.tier) return;
    const byTier = [null, ['iron_sword', 'iron_war_axe', 'ashwood_spear'], ['iron_greatsword', 'ribbed_maul', 'hollow_stave'],
      ['mithril_blade', 'paired_fangs', 'venomfang_dagger'], ['harvest_scythe', 'mithril_blade'], ['voidrend_blade', 'harvest_scythe']];
    const pool = byTier[Math.min(5, p.tier)] || byTier[1];
    const w = getItem(pool[Math.floor(Math.random() * pool.length)]);
    const stock = getItem(p.tier >= 3 ? 'mithril_ore' : 'steel_ingot');
    if (w) inventory.addItem(w, 1);
    if (stock) inventory.addItem(stock, 1 + p.tier);
    showNotification(`Carried out of ${p.name}: ${w ? w.name + ', ' : ''}${1 + p.tier}× ${stock?.name || 'stock'}.`);
  });
  combatHUD.init({ camera: cameraController.camera, combat: combatSystem, player, enemySpawner, audio: audioSystem });
  // Esc: Resume · Settings · Controls · Save & quit (ui/PauseMenu.js).
  pauseMenu.init({
    engine, input, audio: audioSystem, camera: cameraController, perfHUD, quality,
    save: () => saveSystem.save(),
    setHudFull: (v) => { if (_hudT > 0) _setHudMode(v); else _hudFull = v; },
    canOpen: () => gameStarted && !player.isDead,
  });

  // ── COMBAT REACTS (owner: "heavy hits and spells flatten grass, splash
  // water and kick up dust"). Every impulse (world/Wind.js) flattens the
  // grass and flora in its radius (shader); here it also splashes water
  // or raises dust, whichever is under it.
  wind.onImpulse((pos, radius, strength) => {
    const w = chunkManager.getWaterAt(pos.x, pos.z);
    if (w) {
      chunkManager.water?.ripple(pos.x, pos.z, 1 + strength);
      particleBursts.spawn(new THREE.Vector3(pos.x, w.surf + 0.15, pos.z), 'water', { count: Math.round(10 + 14 * strength), sizeMult: 1.2, life: 0.7 });
    } else if (strength >= 0.6) {
      particleBursts.spawn(new THREE.Vector3(pos.x, chunkManager.lastGroundY + 0.2, pos.z), 'earth', { count: Math.round(6 + 10 * strength), sizeMult: 1.1, life: 0.6 });
    }
  });
  eventBus.on(Events.ENEMY_HURT, ({ enemy, dealt, byPlayer }) => {
    if (!byPlayer || !enemy?.position) return;
    wind.impulse(enemy.position, 1.3, Math.min(1.2, 0.3 + (dealt || 0) / 80));
  });

  eventBus.on(Events.ASPECT_USED, ({ memory, ability }) => {
    // ⚠️ COMPOSED FACETS (data/facets.js) never reach the keyed switch
    // below. Their effect is FacetCaster's, timed to their own impact
    // frames; their motion is their own track. The switch stays for the
    // keyed Facets of older saves, Echoes, relics and the innate.
    if (ability.spec) {
      _borrowViewmodelWeapon(memory, 1.5);
      const clip = _startSkillAnim(ability.spec, `${memory.id}:${ability.key}`);
      _glowHex = parseInt(String(ELEMENT_COLORS[memory.element] || '#ff8a3c').replace('#', ''), 16);
      _wakeWeaponPart(_facetPart(ability.spec),
        0.34 + Math.min(0.28, (ability.cost || 0) * 0.010),
        ability.signature ? 1.35 : 0.55 + Math.min(0.9, (ability.cost || 0) * 0.032));
      // Damage on the choreography's own impact frames.
      facetCaster.cast(ability, memory.power || 20, { dur: clip.dur, hits: clip.hits });
      return;
    }
    const el = memory.element || 'neutral';
    const nums = ability.effect?.[ability.key] || {};
    const dir = cameraController.getAimDirection();
    const at = player.position.clone().add(new THREE.Vector3(0, 1.1, 0));
    const power = (memory.power || 20);

    // Where the effect READS from — a couple of metres down the line of
    // aim, not inside the player's own chest. Every one of these used
    // to go off at `at`, i.e. behind the camera's near plane, which is
    // a large part of why they could not be "seen used at all".
    const front = at.clone().add(dir.clone().multiplyScalar(2.2));

    // The viewmodel animation. Fired for EVERY active Aspect, before
    // the switch, so an ability whose effect branch is added later
    // still animates — and so a missing motion warns exactly the way a
    // missing effect branch does.
    // ⚠️ THE WORKING PART WAKES. Not the whole weapon, and not every
    // press equally — a cut lights the edge, a thrust the point, a
    // hammer blow the head, a casting the focus stone. See
    // ASPECT_PART_FOR and the block above it for why this replaced the
    // shatter entirely.
    //
    // ⚠️ Strength scales with Essence cost, and a SIGNATURE always
    // reads at full — it is the weapon's defining move and a cheap one
    // must not look like a weaker version of an expensive one.
    // ⚠️ Parsed inline, NOT through EntityForge's `hex()` — that helper
    // is module-private there and importing it here for one call would
    // widen its surface. `ELEMENT_COLORS` values are '#rrggbb' strings.
    _glowHex = parseInt(String(ELEMENT_COLORS[memory.element] || '#ff8a3c').replace('#', ''), 16);
    _wakeWeaponPart(
      ASPECT_PART_FOR[ability.key] || 'edge',
      0.34 + Math.min(0.28, (ability.cost || 0) * 0.010),
      ability.signature ? 1.35 : 0.55 + Math.min(0.9, (ability.cost || 0) * 0.032));

    // ⚠️ AND BRING THE RIGHT WEAPON UP. The motion alone swung whatever
    // happened to be in hand — see the borrow block's header. Length
    // comes from the motion's own shape so the two cannot drift.
    _borrowViewmodelWeapon(memory, 1.5);
    // Its own choreography (Choreo.KEYED), in the vocabulary of what is in hand.
    _startSkillAnim({ key: ability.key }, `${memory.id}:${ability.key}`);

    const hitAround = (radius, mult) => {
      const foes = enemySpawner.getEnemiesInRange(player.position, radius);
      for (const e of foes) {
        eventBus.emit(Events.COMBAT_HIT, {
          source: 'player', target: e, damage: power * mult, element: el,
        });
        // A per-target burst as well as the one at the origin: an
        // area ability that only puffed at your feet gave no read on
        // WHAT it caught.
        particleBursts.spawn(e.position, el, { count: 8, sizeMult: 0.9 });
      }
      particleBursts.spawn(at, el, { count: 12 + radius, sizeMult: 1.2 });
      return foes.length;
    };

    /**
     * Everything on the line of aim out to `len`.
     *
     * ⚠️ Rejects targets BEHIND you by the dot product before measuring
     * perpendicular distance — an infinite line through the player
     * catches what is at your back, which is not what "one thrust down
     * a line" means to anyone holding the weapon.
     */
    const hitLine = (len, radius, mult) => {
      const foes = enemySpawner.getEnemiesInRange(player.position, len + radius);
      let n = 0;
      for (const e of foes) {
        const to = e.position.clone().sub(at);
        const along = to.dot(dir);
        if (along < 0 || along > len) continue;
        if (to.addScaledVector(dir, -along).length() > radius) continue;
        eventBus.emit(Events.COMBAT_HIT, {
          source: 'player', target: e, damage: power * mult, element: el,
        });
        particleBursts.spawn(e.position, el, { count: 9, sizeMult: 1.0 });
        n++;
      }
      return n;
    };

    /** Move the player and leave the line they took behind them. */
    const dashTo = (dist) => {
      const from = player.position.clone();
      player.position.add(dir.clone().setY(0).normalize().multiplyScalar(dist));
      player.position.y = chunkManager.getGroundY(player.position.x, player.position.z) + 1;
      weaveVFX.streak(
        from.clone().setY(from.y + 1.0),
        player.position.clone().setY(player.position.y + 1.0),
        el, { size: 0.8 });
      return from;
    };

    switch (ability.key) {
      case 'hew': {
        const n = hitAround(3.2, Number(nums.mult) || 1.6);
        // A single overhead. One steep arc straight down the middle.
        weaveVFX.arc(front, dir, el, { size: 2.6, roll: 0.05, sweep: -0.5, life: 0.34 });
        cameraController.shake(0.12, 0.2);
        showNotification(n ? `${ability.name} — ${n} struck.` : `${ability.name} — nothing in reach.`);
        break;
      }
      case 'sweep': {
        const radius = Math.max(3, nums.n || 4);
        const n = hitAround(radius, 1.1);
        // One turn on the spot — a ring at your feet, sized to the
        // reach it actually has, so the player can SEE what was in it.
        weaveVFX.ring(player.position, el, { size: radius, life: 0.5 });
        weaveVFX.arc(front, dir, el, { size: 2.8, roll: 1.4, sweep: -3.2, life: 0.4 });
        cameraController.shake(0.16, 0.28);
        showNotification(n ? `${ability.name} — ${n} thrown back.` : `${ability.name} — nothing in reach.`);
        break;
      }
      case 'lunge': {
        const dist = Math.max(3, nums.n || 5);
        dashTo(dist);
        hitAround(3.0, Number(nums.mult) || 1.5);
        weaveVFX.arc(front, dir, el, { size: 2.3, roll: -1.2, sweep: 2.4, life: 0.3 });
        cameraController.shake(0.14, 0.22);
        showNotification(`${ability.name} — closed the distance.`);
        break;
      }
      case 'step': {
        const dist = Math.max(3, nums.n || 6);
        dashTo(dist);
        player.iFrames = Math.max(player.iFrames, 0.25);
        particleBursts.spawn(at, el, { count: 14, sizeMult: 0.9 });
        showNotification(`${ability.name} — you were not there.`);
        break;
      }
      case 'knit': {
        player.heal(player.maxHp * ((nums.pct || 20) / 100));
        // Closing a wound is not a strike — a dome over you, and the
        // motes rising rather than blasting outward.
        weaveVFX.dome(player.position.clone().setY(player.position.y + 0.9), 'light',
          { size: 1.9, life: 0.8 });
        particleBursts.spawn(at, 'light', { count: 16, sizeMult: 1.1 });
        showNotification(`${ability.name} — closed.`);
        break;
      }
      case 'brace': {
        // Expressed through i-frames rather than a new damage-reduction
        // channel: one fewer thing writing to the damage path.
        player.iFrames = Math.max(player.iFrames, Math.min(3, (nums.dur || 4) * 0.35));
        weaveVFX.dome(player.position.clone().setY(player.position.y + 0.9), el,
          { size: 2.2, life: Math.min(3, (nums.dur || 4) * 0.35) });
        showNotification(`${ability.name} — braced.`);
        break;
      }
      case 'unseen': {
        player.iFrames = Math.max(player.iFrames, Math.min(4, nums.dur || 4));
        // Shadow regardless of the Memory's own element — the tell for
        // "nothing is looking at you" has to read as the same thing
        // every time or it stops being a tell.
        weaveVFX.dome(player.position.clone().setY(player.position.y + 0.9), 'shadow',
          { size: 2.6, life: 0.9 });
        particleBursts.spawn(at, 'shadow', { count: 18, sizeMult: 1.0 });
        showNotification(`${ability.name} — nothing is looking.`);
        break;
      }
      case 'still': {
        const foes = enemySpawner.getEnemiesInRange(player.position, 12);
        for (const e of foes) e.applySlow?.(1 - ((nums.pct || 30) / 100), nums.dur || 5);
        // The radius IS the mechanic here — twelve metres is a long way
        // and there was nothing on screen saying so.
        weaveVFX.ring(player.position, el, { size: 12, life: 0.9 });
        for (const e of foes) particleBursts.spawn(e.position, el, { count: 6, sizeMult: 0.8 });
        showNotification(`${ability.name} — ${foes.length} slowed.`);
        break;
      }
      case 'summon':
      case 'swarm': {
        const count = ability.key === 'swarm' ? Math.max(2, nums.n || 2) : 1;
        // ⚠️ "Calls what is bound in it for {dur}s" — and until this
        // session `friendly` and `despawnAt` were both dropped on the
        // floor by the Enemy constructor, so what these actually did
        // was spawn PERMANENT HOSTILES that hunted the player. Now
        // that friendly is real, the missing half is the timer: a
        // summon with no expiry is an army you build one keypress at
        // a time and never lose. Bounded, because `nums.dur` comes
        // out of the generated Aspect and a huge roll should not mean
        // a permanent one.
        const dur = Math.max(6, Math.min(40, Number(nums.dur) || 14));
        for (let i = 0; i < count; i++) {
          const p2 = player.position.clone().add(new THREE.Vector3((i - 1) * 2.2, 6, 2));
          enemySpawner.spawnNamed(5, p2, Math.max(3, player.level), {
            name: `${memory.name}'s Answer`, friendly: true, hpMult: 1.2,
            despawnAt: (performance.now() / 1000) + dur,
          });
          // It arrives somewhere, and you should see where.
          weaveVFX.ring(p2.clone().setY(chunkManager.getGroundY(p2.x, p2.z)), el,
            { size: 1.8, life: 0.6 });
          particleBursts.spawn(p2, el, { count: 12, sizeMult: 1.1 });
        }
        showNotification(`${ability.name} — it answered.`);
        break;
      }

      // ══════════════════════════════════════════════════
      // ⚠️ THE FIVE THAT SPENT ESSENCE AND DID NOTHING
      //
      // `skewer`, `scatter`, `chorus`, `charge` and `vault` are all
      // declared `active: true` in ABILITY_POOLS and none of them had
      // a branch here — so a third of every active Aspect in the game
      // (5 of 15, counted live) hit the `default` below: it took the
      // Essence, started the cooldown, printed a console warning the
      // player never sees, and did nothing at all.
      //
      // They are not obscure. They are the ENTIRE `pierce`, `spread`
      // and `move` families' active options, which are exactly the
      // ones a Piercing, Erratic, Vast or Driving temper selects — so
      // drawing a deliberate sign to aim at a specific power was the
      // most reliable way to forge a Memory whose Aspect was inert.
      // ══════════════════════════════════════════════════
      case 'skewer': {
        // "One thrust down a line, {mult}x to everything on it."
        const len = 9;
        const n = hitLine(len, 1.5, Number(nums.mult) || 1.7);
        weaveVFX.lance(at, dir, el, { size: 1.0, len, life: 0.32 });
        cameraController.shake(0.10, 0.18);
        showNotification(n ? `${ability.name} — ${n} on the line.` : `${ability.name} — nothing on the line.`);
        break;
      }
      case 'scatter': {
        // "Throws {n} of it at once, {pct}% each." Real projectiles
        // through the wand's own path, so they travel, collide and
        // impact exactly the way every other shot in the game does —
        // a bespoke second projectile system is the last thing this
        // codebase needs.
        const shots = Math.max(2, Math.min(8, nums.n || 4));
        const each = power * ((nums.pct || 55) / 100);
        // ⚠️ Through spawnFireball, the SAME call the wand's own cast
        // path uses — so these get the element's real spell body, its
        // per-frame animator, the trail, and collision handled by
        // `projectileManager.update(dt, enemySpawner)` which already
        // runs every frame. A second projectile system for one Aspect
        // would be a second thing to keep in agreement forever.
        const colorHex = parseInt((ELEMENT_COLORS[el] || '#888888').replace('#', ''), 16);
        for (let i = 0; i < shots; i++) {
          // Spread across the aim, not a stack of identical shots.
          const spread = (i - (shots - 1) / 2) * 0.13;
          const d2 = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread).normalize();
          projectileManager.spawnFireball(
            at.clone().addScaledVector(d2, 0.9), d2, each, colorHex, el);
        }
        weaveVFX.arc(front, dir, el, { size: 2.4, roll: 1.6, sweep: 1.8, life: 0.28 });
        showNotification(`${ability.name} — ${shots} at once.`);
        break;
      }
      case 'chorus': {
        // "Everything within {n}m takes {mult}x at once."
        const radius = Math.max(4, nums.n || 7);
        const n = hitAround(radius, Number(nums.mult) || 1.4);
        weaveVFX.ring(player.position, el, { size: radius, life: 0.65 });
        weaveVFX.dome(player.position.clone().setY(player.position.y + 0.9), el,
          { size: radius * 0.5, life: 0.4 });
        cameraController.shake(0.22, 0.35);
        showNotification(n ? `${ability.name} — ${n} at once.` : `${ability.name} — nothing answered.`);
        break;
      }
      case 'charge': {
        // "Drive {n}m forward through anything, {mult}x on contact."
        // ⚠️ Hits along the line it TRAVELLED, not around where it
        // landed — "through anything" is the whole ability, and an
        // area check at the destination would miss everything it drove
        // past on the way.
        const dist = Math.max(3, nums.n || 8);
        const n = hitLine(dist + 1.5, 2.0, Number(nums.mult) || 1.5);
        dashTo(dist);
        weaveVFX.lance(at, dir, el, { size: 1.3, len: dist, life: 0.3 });
        cameraController.shake(0.2, 0.3);
        showNotification(n ? `${ability.name} — through ${n}.` : `${ability.name} — through nothing.`);
        break;
      }
      case 'vault': {
        // "Throw yourself {n}m clear of where you were." Clear of, not
        // toward — it is an escape, so it goes where you are LOOKING
        // and takes you off the ground on the way.
        const dist = Math.max(3, nums.n || 7);
        dashTo(dist);
        player.velocity.y = Math.max(player.velocity.y, 7);
        player.iFrames = Math.max(player.iFrames, 0.3);
        particleBursts.spawn(at, el, { count: 12, sizeMult: 0.9 });
        showNotification(`${ability.name} — clear.`);
        break;
      }

      // ══════════════════════════════════════════════════
      // WEAPON SIGNATURES — the move only that type can make
      //
      // One per weapon type (data/memories.js WEAPON_SIGNATURE), and
      // the reason a scythe is worth forging over a sword. Each is
      // built from the primitives already above — `hitAround`,
      // `hitLine`, `dashTo`, weaveVFX — rather than a parallel effect
      // system, so they inherit the Refusal, the Leaning multiplier
      // and every other thing COMBAT_HIT applies.
      //
      // ⚠️ Every key in WEAPON_SIGNATURE must appear here. Trap #26.
      // ══════════════════════════════════════════════════
      case 'gutter': {
        // Dagger — three cuts inside a breath, very close.
        const mult = Number(nums.mult) || 1.6;
        let n = 0;
        for (let i = 0; i < 3; i++) n = hitAround(2.2, mult * 0.55);
        weaveVFX.arc(front, dir, el, { size: 1.5, roll: -1.2, sweep: 2.6, life: 0.22 });
        weaveVFX.arc(front, dir, el, { size: 1.3, roll: 1.4, sweep: -2.4, life: 0.28 });
        cameraController.shake(0.08, 0.18);
        showNotification(n ? `${ability.name} — ${n} opened.` : `${ability.name} — nothing in reach.`);
        break;
      }
      case 'riposte': {
        // Sword — a parry window, then a counter. Expressed as
        // i-frames plus a strike, so it uses the damage path that
        // already exists rather than a new "parry" channel.
        player.iFrames = Math.max(player.iFrames, 0.6);
        const n = hitAround(3.2, Number(nums.mult) || 1.8);
        weaveVFX.arc(front, dir, el, { size: 2.2, roll: 2.4, sweep: -2.8, life: 0.3 });
        cameraController.shake(0.1, 0.2);
        showNotification(n ? `${ability.name} — turned and answered ${n}.` : `${ability.name} — guard up.`);
        break;
      }
      case 'whirl': {
        // Dual blades — twice around, everything close.
        const radius = Math.max(3, nums.n || 4);
        const mult = Number(nums.mult) || 1.4;
        let n = hitAround(radius, mult * 0.6);
        n = hitAround(radius, mult * 0.6);
        weaveVFX.ring(player.position, el, { size: radius, life: 0.5 });
        weaveVFX.arc(front, dir, el, { size: 2.4, roll: 0, sweep: -6.3, life: 0.45 });
        cameraController.shake(0.16, 0.3);
        showNotification(n ? `${ability.name} — ${n} caught, twice.` : `${ability.name} — nothing in reach.`);
        break;
      }
      case 'maim': {
        // Axe — one deep cut that keeps opening. The bleed is real
        // damage over time, applied through the same COMBAT_HIT.
        const mult = Number(nums.mult) || 1.9;
        const n = hitAround(2.9, mult);
        const bleedFor = Math.min(6, nums.dur || 5);
        const foes = enemySpawner.getEnemiesInRange(player.position, 2.9);
        for (const e of foes) _applyBleed(e, power * mult * 0.18, bleedFor, el);
        weaveVFX.arc(front, dir, el, { size: 2.4, roll: -0.6, sweep: 1.6, life: 0.32 });
        cameraController.shake(0.14, 0.24);
        showNotification(n ? `${ability.name} — ${n} bleeding.` : `${ability.name} — nothing in reach.`);
        break;
      }
      case 'sunder': {
        // Greatsword — one overhead through a wide front.
        const n = hitAround(4.2, Number(nums.mult) || 2.1);
        weaveVFX.arc(front, dir, el, { size: 3.4, roll: 0.05, sweep: -0.7, life: 0.4 });
        weaveVFX.ring(player.position, el, { size: 4.2, life: 0.45 });
        cameraController.shake(0.24, 0.36);
        showNotification(n ? `${ability.name} — ${n} split.` : `${ability.name} — nothing in reach.`);
        break;
      }
      case 'quake': {
        // Warhammer — into the ground, everything thrown down.
        const radius = Math.max(4, nums.n || 6);
        const n = hitAround(radius, Number(nums.mult) || 1.7);
        const foes = enemySpawner.getEnemiesInRange(player.position, radius);
        for (const e of foes) { e.hitStun = Math.max(e.hitStun || 0, 1.2); e.applySlow?.(0.5, 2.5); }
        weaveVFX.ring(player.position, el, { size: radius, life: 0.75 });
        weaveVFX.ring(player.position, el, { size: radius * 0.6, life: 0.5 });
        cameraController.shake(0.36, 0.5);
        showNotification(n ? `${ability.name} — ${n} thrown down.` : `${ability.name} — the ground rings.`);
        break;
      }
      case 'impale': {
        // Spear — the full length, in a line.
        const len = 11;
        const n = hitLine(len, 1.3, Number(nums.mult) || 1.9);
        weaveVFX.lance(at, dir, el, { size: 1.1, len, life: 0.34 });
        cameraController.shake(0.12, 0.22);
        showNotification(n ? `${ability.name} — ${n} run through.` : `${ability.name} — nothing on the line.`);
        break;
      }
      case 'reap': {
        // Scythe — a wide circle, and it feeds you.
        const radius = Math.max(3.5, nums.n || 5);
        const mult = Number(nums.mult) || 1.6;
        const foes = enemySpawner.getEnemiesInRange(player.position, radius);
        const n = hitAround(radius, mult);
        if (n) player.heal(Math.max(1, power * mult * ((nums.pct || 18) / 100) * 0.35 * n));
        weaveVFX.ring(player.position, el, { size: radius, life: 0.6 });
        weaveVFX.arc(front, dir, el, { size: 3.0, roll: 1.5, sweep: -4.4, life: 0.4 });
        particleBursts.spawn(at, 'light', { count: n ? 12 : 4, sizeMult: 0.9 });
        cameraController.shake(0.18, 0.3);
        showNotification(n ? `${ability.name} — ${n} reaped.` : `${ability.name} — nothing to take.`);
        break;
      }
      case 'volley': {
        // Bow — several shafts at once, through the wand's own
        // projectile path (same reasoning as `scatter`).
        const shots = Math.max(3, Math.min(9, nums.n || 5));
        const each = power * ((nums.pct || 60) / 100);
        const colorHex = parseInt((ELEMENT_COLORS[el] || '#888888').replace('#', ''), 16);
        for (let i = 0; i < shots; i++) {
          const spread = (i - (shots - 1) / 2) * 0.09;
          const d2 = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread).normalize();
          projectileManager.spawnFireball(
            at.clone().addScaledVector(d2, 0.9), d2, each, colorHex, el);
        }
        showNotification(`${ability.name} — ${shots} away.`);
        break;
      }
      case 'conduit': {
        // Staff — a beam down the aim line that does not stop at the
        // first thing it meets.
        const len = 22;
        const n = hitLine(len, 1.8, Number(nums.mult) || 1.5);
        weaveVFX.lance(at, dir, el, { size: 1.6, len, life: 0.45 });
        cameraController.shake(0.1, 0.3);
        showNotification(n ? `${ability.name} — ${n} on the line.` : `${ability.name} — it lit nothing.`);
        break;
      }
      case 'verse': {
        // Grimoire — lands where you are LOOKING, not where you stand.
        // The only signature that is not centred on the player, which
        // is what makes the caster's weapon play differently.
        const reach = 16;
        const spread = Math.max(3, nums.n || 4);
        const spot = at.clone().addScaledVector(dir, reach);
        spot.y = chunkManager.getGroundY(spot.x, spot.z);
        const foes = enemySpawner.getEnemiesInRange(spot, spread);
        for (const e of foes) {
          eventBus.emit(Events.COMBAT_HIT, {
            source: 'player', target: e, damage: power * (Number(nums.mult) || 1.8), element: el,
          });
          particleBursts.spawn(e.position, el, { count: 10, sizeMult: 1.1 });
        }
        weaveVFX.ring(spot, el, { size: spread, life: 0.7 });
        weaveVFX.dome(spot.clone().setY(spot.y + 0.9), el, { size: spread * 0.7, life: 0.5 });
        cameraController.shake(0.14, 0.3);
        showNotification(foes.length ? `${ability.name} — ${foes.length} answered.` : `${ability.name} — nothing was listening.`);
        break;
      }

      // ══════════════════════════════════════════════════
      // THE EIGHTEEN ADDED IN THE "UNIQUE ATTACKS" PASS
      //
      // Owner: "I am still facing problems where I am having multiple
      // same active attacks amongst multiple weapons... each thing has
      // unique attacks both active and passive."
      //
      // The whole game had FIFTEEN active templates. With three combat
      // slots and two trinkets, a repeat is the pigeonhole principle
      // long before it is bad luck — no amount of selection quality
      // fixes a pool that small. These take it to 33.
      //
      // ⚠️ Each one is written against the SAME helpers the branches
      // above use (`hitAround`, `hitLine`, `dashTo`), deliberately. A
      // bespoke implementation per ability is eighteen more things to
      // keep in agreement with the damage path forever.
      // ══════════════════════════════════════════════════
      case 'gore': {
        const len = Math.max(5, nums.n || 6);
        const n = hitLine(len, 1.3, Number(nums.mult) || 1.6);
        weaveVFX.lance(at, dir, el, { size: 1.1, len, life: 0.3 });
        cameraController.shake(0.12, 0.2);
        showNotification(n ? `${ability.name} — ${n} run through.` : `${ability.name} — nothing in the way.`);
        break;
      }
      case 'pommel': {
        // Deliberately tiny reach. It is the cheapest active in the
        // game and it must not read as a worse Cleave.
        const n = hitAround(2.0, Number(nums.mult) || 1.9);
        weaveVFX.arc(front, dir, el, { size: 1.2, roll: 0.9, sweep: 0.6, life: 0.18 });
        cameraController.shake(0.16, 0.14);
        showNotification(n ? `${ability.name} — ${n} rocked.` : `${ability.name} — too far.`);
        break;
      }
      case 'cascade': {
        // Two falls. The second is a real second hit, not one hit with
        // a doubled number — the whole point is that it lands twice.
        const mult = Number(nums.mult) || 1.3;
        const n1 = hitAround(3.0, mult);
        weaveVFX.arc(front, dir, el, { size: 2.4, roll: 0.1, sweep: -0.7, life: 0.26 });
        cameraController.shake(0.11, 0.16);
        setTimeout(() => {
          hitAround(3.0, mult);
          weaveVFX.arc(front, dir, el, { size: 2.7, roll: -0.1, sweep: -0.8, life: 0.28 });
          cameraController.shake(0.15, 0.2);
        }, 260);
        showNotification(n1 ? `${ability.name} — ${n1}, and again.` : `${ability.name} — nothing beneath it.`);
        break;
      }
      case 'aegis': {
        const dur = Math.min(4, Math.max(1.2, (nums.dur || 4) * 0.5));
        player.iFrames = Math.max(player.iFrames, dur);
        weaveVFX.dome(player.position.clone().setY(player.position.y + 0.9), 'light',
          { size: 2.6, life: dur });
        particleBursts.spawn(at, 'light', { count: 14, sizeMult: 1.0 });
        showNotification(`${ability.name} — nothing reaches you for ${dur.toFixed(1)}s.`);
        break;
      }
      case 'rebuke': {
        const radius = Math.max(3, nums.n || 4);
        const n = hitAround(radius, Number(nums.mult) || 1.35);
        // "…and mends you for a share" — the share is per thing thrown
        // back, so it rewards being surrounded, which is the only
        // situation you would ever press it in.
        if (n) player.heal(Math.min(player.maxHp * 0.25, n * player.maxHp * 0.04));
        weaveVFX.ring(player.position, el, { size: radius, life: 0.55 });
        weaveVFX.dome(player.position.clone().setY(player.position.y + 0.9), 'light',
          { size: 1.8, life: 0.45 });
        cameraController.shake(0.14, 0.22);
        showNotification(n ? `${ability.name} — ${n} thrown off.` : `${ability.name} — nothing close enough.`);
        break;
      }
      case 'anchor': {
        player.heal(player.maxHp * ((nums.pct || 18) / 100));
        player.iFrames = Math.max(player.iFrames, 0.6);
        weaveVFX.ring(player.position, 'light', { size: 2.4, life: 0.7 });
        particleBursts.spawn(at, 'light', { count: 16, sizeMult: 1.1 });
        showNotification(`${ability.name} — set, and mended.`);
        break;
      }
      case 'chime': {
        const radius = Math.max(4, nums.n || 6);
        const n = hitAround(radius, Number(nums.mult) || 1.25);
        weaveVFX.ring(player.position, el, { size: radius, life: 0.8 });
        weaveVFX.ring(player.position, el, { size: radius * 0.55, life: 0.5 });
        cameraController.shake(0.10, 0.3);
        showNotification(n ? `${ability.name} — ${n} felt it.` : `${ability.name} — it rang out over nothing.`);
        break;
      }
      case 'hollow': {
        const len = Math.max(6, nums.n || 8);
        const n = hitLine(len, 2.0, Number(nums.mult) || 1.45);
        weaveVFX.lance(at, dir, 'shadow', { size: 1.6, len, life: 0.4 });
        weaveVFX.dome(front.clone(), 'shadow', { size: 2.0, life: 0.5 });
        cameraController.shake(0.12, 0.26);
        showNotification(n ? `${ability.name} — ${n} drawn thin.` : `${ability.name} — the way opened onto nothing.`);
        break;
      }
      case 'thread': {
        // Long and NARROW — the distinction from `skewer` is the
        // radius, so a player carrying both can feel the difference.
        const len = Math.max(8, nums.n || 11);
        const n = hitLine(len, 0.8, Number(nums.mult) || 1.5);
        weaveVFX.lance(at, dir, el, { size: 0.5, len, life: 0.3 });
        showNotification(n ? `${ability.name} — ${n} on the thread.` : `${ability.name} — the line was empty.`);
        break;
      }
      case 'nail': {
        // Explicitly SINGLE target: the first thing on a short, tight
        // line, for a much larger multiplier.
        const n = hitLine(5.5, 0.6, Number(nums.mult) || 2.2);
        weaveVFX.lance(at, dir, el, { size: 0.7, len: 5.5, life: 0.24 });
        cameraController.shake(0.13, 0.16);
        showNotification(n ? `${ability.name} — through.` : `${ability.name} — nothing lined up.`);
        break;
      }
      case 'sever': {
        const len = Math.max(4, nums.n || 6);
        const n = hitLine(len, 1.1, Number(nums.mult) || 1.5);
        // "and it keeps bleeding" — through `_applyBleed`, the SAME
        // path the axe's Maim uses, never a second one. ⚠️ It takes ONE
        // enemy, not an area; there is no `_bleedAround`. The enemies
        // are re-queried because `hitLine` returns a COUNT, not the
        // list it hit.
        if (n) {
          const bleedFor = Math.min(6, nums.dur || 4);
          for (const e of enemySpawner.getEnemiesInRange(player.position, len + 1)) {
            const to = e.position.clone().sub(at);
            const along = to.dot(dir);
            if (along < 0 || along > len) continue;
            if (to.addScaledVector(dir, -along).length() > 1.1) continue;
            _applyBleed(e, power * 0.16, bleedFor, el);
          }
        }
        weaveVFX.arc(front, dir, el, { size: 2.2, roll: -0.8, sweep: 1.4, life: 0.3 });
        showNotification(n ? `${ability.name} — ${n} opened.` : `${ability.name} — nothing to open.`);
        break;
      }
      case 'bloom': {
        const radius = Math.max(5, nums.n || 7);
        const n = hitAround(radius, Number(nums.mult) || 1.4);
        weaveVFX.ring(player.position, el, { size: radius * 0.4, life: 0.3 });
        setTimeout(() => weaveVFX.ring(player.position, el, { size: radius, life: 0.55 }), 130);
        cameraController.shake(0.16, 0.3);
        showNotification(n ? `${ability.name} — ${n} caught in it.` : `${ability.name} — it opened onto nothing.`);
        break;
      }
      case 'fan': {
        // Three real projectiles through the wand's own path, like
        // `scatter` — but a FIXED three at a wide fixed spread, so the
        // two do not converge on each other as `nums.n` moves.
        const each = power * ((nums.pct || 60) / 100);
        const colorHex = parseInt((ELEMENT_COLORS[el] || '#888888').replace('#', ''), 16);
        for (let i = -1; i <= 1; i++) {
          const d2 = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), i * 0.30).normalize();
          projectileManager.spawnFireball(
            at.clone().addScaledVector(d2, 0.9), d2, each, colorHex, el);
        }
        weaveVFX.arc(front, dir, el, { size: 2.6, roll: 1.5, sweep: 2.1, life: 0.26 });
        showNotification(`${ability.name} — three ways at once.`);
        break;
      }
      case 'slip': {
        // BACKWARD, and that is the whole ability — every other dash in
        // the game goes forward, so this one is the disengage.
        const dist = Math.max(3, nums.n || 5);
        const from = player.position.clone();
        player.position.addScaledVector(dir.clone().setY(0).normalize(), -dist);
        player.position.y = chunkManager.getGroundY(player.position.x, player.position.z) + 1;
        player.iFrames = Math.max(player.iFrames, 0.4);
        weaveVFX.streak(from.clone().setY(from.y + 1.0),
          player.position.clone().setY(player.position.y + 1.0), el, { size: 0.7 });
        showNotification(`${ability.name} — out from under it.`);
        break;
      }
      case 'blink': {
        const dist = Math.max(4, nums.n || 7);
        dashTo(dist);
        const n = hitAround(3.0, Number(nums.mult) || 1.5);
        weaveVFX.ring(player.position, el, { size: 3.0, life: 0.45 });
        cameraController.shake(0.12, 0.2);
        showNotification(n ? `${ability.name} — arrived, and ${n} paid for it.` : `${ability.name} — arrived.`);
        break;
      }
      case 'rush': {
        // Hits along the line it TRAVELLED, measured from where it
        // started — the same rule `charge` follows, for the same
        // reason: "everything you passed" must mean the path, not the
        // destination.
        const dist = Math.max(4, nums.n || 8);
        const from = dashTo(dist);
        const foes = enemySpawner.getEnemiesInRange(from, dist + 3);
        let n = 0;
        for (const e of foes) {
          const to = e.position.clone().sub(from);
          const along = to.dot(dir);
          if (along < -1 || along > dist + 2) continue;
          if (to.addScaledVector(dir, -along).length() > 2.2) continue;
          eventBus.emit(Events.COMBAT_HIT, {
            source: 'player', target: e, damage: power * (Number(nums.mult) || 1.45), element: el,
          });
          particleBursts.spawn(e.position, el, { count: 9, sizeMult: 1.0 });
          n++;
        }
        cameraController.shake(0.15, 0.24);
        showNotification(n ? `${ability.name} — ${n} on the way through.` : `${ability.name} — a clear run.`);
        break;
      }
      case 'mirror': {
        // A decoy that actually FIGHTS, through the same friendly
        // summon path Call uses — a decoy nothing attacks is scenery.
        const dur = Math.max(4, Math.min(20, Number(nums.dur) || 8));
        const spot = player.position.clone().addScaledVector(dir.clone().setY(0).normalize(), -1.8);
        spot.y = chunkManager.getGroundY(spot.x, spot.z);
        enemySpawner.spawnNamed(5, spot, Math.max(2, player.level), {
          name: `${memory.name}'s Likeness`, friendly: true, hpMult: 0.6, atkMult: 0.3,
          despawnAt: (performance.now() / 1000) + dur,
        });
        player.iFrames = Math.max(player.iFrames, 0.35);
        weaveVFX.dome(spot.clone().setY(spot.y + 0.9), 'shadow', { size: 1.6, life: 0.6 });
        particleBursts.spawn(spot, 'shadow', { count: 14, sizeMult: 1.0 });
        showNotification(`${ability.name} — something of you stayed behind.`);
        break;
      }
      case 'unmake': {
        const radius = Math.max(4, nums.n || 6);
        const n = hitAround(radius, Number(nums.mult) || 1.9);
        weaveVFX.dome(player.position.clone().setY(player.position.y + 1.0), el,
          { size: radius * 0.6, life: 0.6 });
        weaveVFX.ring(player.position, el, { size: radius, life: 0.7 });
        cameraController.shake(0.26, 0.4);
        showNotification(n ? `${ability.name} — ${n} taken apart.` : `${ability.name} — nothing to undo.`);
        break;
      }

      default:
        console.warn(`[Facet] "${ability.key}" is marked active but has no effect branch — it spent Essence and did nothing.`);
        break;
    }
  });

  eventBus.on(Events.DESCENT_RESOLVED, (d) => {
    if (document.pointerLockElement) document.exitPointerLock();
    const prompt = document.getElementById('descent-resolve-prompt');
    if (prompt) {
      prompt.textContent = `${d.warden} is dead. ${d.name} is still open behind you. That is a decision, not a state.`;
    }
    const box = document.getElementById('descent-resolve-choices');
    if (box) {
      box.innerHTML = '';
      for (const opt of d.options) {
        const btn = document.createElement('button');
        btn.className = 'finale-choice-btn';
        // The option YOUR ladder counts is marked, but the other is
        // not disabled — see descents.js's header for why taking the
        // wrong one has to be possible rather than blocked.
        const mine = opt.verb === d.yours;
        btn.innerHTML = `
          <span class="finale-choice-title">${opt.title}${mine ? ' — your ladder' : ''}</span>
          <span class="finale-choice-sub">${opt.sub}</span>
        `;
        btn.onclick = () => {
          overlayManager.close?.('descent-resolve-modal');
          document.getElementById('descent-resolve-modal')?.classList.add('hidden');
          descentSystem.resolve(opt.verb);
          input.requestLook();
        };
        box.appendChild(btn);
      }
    }
    overlayManager.open('descent-resolve-modal');
  });

  eventBus.on(Events.DESCENT_EXIT, (d) => {
    document.getElementById('descent-tracker')?.classList.add('hidden');
    if (d.aborted) {
      eventBus.emit(Events.UI_NOTIFY, d.reason || `${d.name} closes behind you with nothing in your hands.`);
      return;
    }
    eventBus.emit(Events.UI_NOTIFY, d.line);

    // The heaviest ordinary act in the game moves the Leaning
    // permanently, whether or not it banked a Trial. Sealing a Descent
    // as a Cinderbound gets you no rank AND still pulls you toward the
    // Ascendant — which is the honest consequence of having done it.
    leaning.recordDeed(d.verb);

    // Fragments. The ONE crafting input that cannot be foraged or
    // farmed — see the fragment block in data/materials.js.
    const def = MATERIALS.find(m => m.id === d.fragmentId);
    if (def) {
      inventory.addItem(def, d.fragments);
      eventBus.emit(Events.UI_NOTIFY, `${d.fragments} × ${def.name}`);
    } else {
      console.warn(`[Descent] fragment '${d.fragmentId}' not found in MATERIALS — payout skipped`);
    }

    if (d.trialBanked) {
      // Only now, with the Trial banked, is it worth asking. Ascent
      // refuses on Depth alone and says so, so this is safe to call
      // unconditionally — the refusal IS the feedback.
      ascentSystem.tryAscend(attunement.totalElement());
    }
  });

  // The finale choice — mq7 doesn't auto-complete on talking to Aris,
  // it opens this modal instead (see QuestSystem.js).
  eventBus.on(Events.QUEST_FINALE_CHOICE, () => {
    if (document.pointerLockElement) document.exitPointerLock();
    overlayManager.open('finale-choice-modal');
  });
  eventBus.on(Events.ATTUNEMENT_UPDATE, (snap) => {
    // The Pioneer's eyes and the wand's shard take your dominant element —
    // including the viewmodel, which is a separate instance from the
    // (hidden) held one and needs its own retint call.
    if (snap.dominant) {
      player.setAttunedElement?.(snap.dominant);
      if (viewmodel) retintWand(viewmodel.wand, snap.dominant);
    }
    // Mastering an element leaves a permanent mark — see
    // EntityForge.applyPioneerCorruption. Idempotent on the receiving
    // end, so it's safe to just poke this on every attunement update.
    if (snap.mastery) {
      player.setCorrupted?.(true);
      _isCorrupted = true;
    }

    const el = document.getElementById('attune-name');
    if (!el) return;
    el.textContent = snap.dominant ? `${snap.dominant}-touched` : 'Unattuned';
    el.style.color = snap.dominant ? `var(--el-${snap.dominant})` : '';
  });

  // Depth of attunement is what opens wand slots now.
  eventBus.on(Events.ATTUNEMENT_SLOT, (data) => {
    wandSystem.init(1, player);
    wandUI.render();
    eventBus.emit(Events.UI_NOTIFY, `The wand opens further — ${data.slots} infusion slots.`);
  });

  // Reaction hits get their own, louder damage number.
  eventBus.on(Events.REACTION_TRIGGER, (data) => {
    if (!data.position) return;
    eventBus.emit(Events.UI_DAMAGE_NUMBER, {
      amount: data.damage,
      position: data.position,
      type: 'reaction',
    });
  });

  eventBus.on(Events.SPELL_CAST, () => { _lastSpellAt = performance.now(); updateHUD(); });
  eventBus.on(Events.BREW_COMPLETE, () => updateHUD());

  eventBus.on(Events.COMBAT_HIT, (data) => {
    if (data.target === 'player') {
      // Attunement decides how much an element actually hurts you —
      // and the Ascent's resistBonus (Hallowed, on the Refinement
      // ladder) is a flat permanent reduction ON TOP of it, applied as
      // a factor rather than folded into incomingMultiplier() so the
      // two remain separately readable: one decays, one never does.
      // ⚠️ The Boon's resist is a SECOND independent factor, not folded
      // into the Ascent's — the two have different lifetimes (one
      // permanent, one minutes) and merging them would make a faded
      // Boon look like a lost rank.
      const resist = (1 - ascentSystem.grant('resistBonus', 0))
        * (1 - boonSystem.grantOf('resist', 0));
      let incoming = data.damage * attunement.incomingMultiplier(data.element) * resist;

      // The Refusal cuts BOTH ways. A creature two Ranks beneath you
      // cannot chip you down either — which is what makes climbing a
      // Rank feel like a change of category rather than a bigger bar.
      const src = data.source;
      const srcRank = (src && typeof src === 'object') ? rankForLevel(src.level) : 0;
      // ⚠️ STEEL: no Rank refusal — a fight is decided by technique,
      // not by whose number is bigger (owner: "technique & steel").
      void srcRank;
      // The Unbroken: the first hit of any fight is halved.
      // ⚠️ "A fight" is defined as 6 seconds without being struck, so
      // this is a real opener bonus rather than a permanent 50% resist
      // that happens to reset — which is what a naive read of the
      // grant name would produce.
      if (epithetSystem.grant('firstHitHalved', false)) {
        const now = performance.now() / 1000;
        if (!_lastStruckAt || now - _lastStruckAt > 6) incoming *= 0.5;
      }
      // ⚠️ STAMPED UNCONDITIONALLY, outside the epithet branch. It used
      // to be assigned only for a Pioneer who HAD the Unbroken epithet,
      // because that grant was its only reader — so for everyone else
      // it sat at 0 forever. Out-of-combat recovery reads the same
      // clock, and with it never advancing `since` was always 999 and
      // the player healed continuously THROUGH a fight, which is
      // exactly the damage-race the delay exists to prevent.
      // One clock, one definition of "in combat", written by every hit.
      _lastStruckAt = performance.now() / 1000;
      // ⚠️ Dodge i-frames win first (takeDamage ignores the hit), then the
      // guard: a parry negates it and staggers the attacker, a block
      // trades stamina for most of it (CombatSystem.resolveIncoming).
      if (player.iFrames > 0) return;
      const res = combatSystem.resolveIncoming(src, incoming);
      if (res.outcome === 'block' || res.outcome === 'guardbreak') _vmBlockKick = 1;
      if (res.damage > 0) player.takeDamage(res.damage);
    } else {
      // Ascent damage grant (Ashmarked, on the Appetite ladder).
      // Multiplicative and compounding across ranks — see
      // AscentSystem's GRANT_KINDS, which declares the composition
      // rule per key rather than inferring it from the name.
      //
      // ⚠️ The Leaning multiplier is gated on `data.source === 'player'`.
      // COMBAT_HIT carries enemy-on-enemy and reaction damage too, and
      // scaling those by how Cinderbound the PLAYER happens to be would
      // make every skeleton in the world quietly inherit the player's
      // philosophy. NPCs and enemies are regular; this is the guard
      // that keeps them that way.
      // ⚠️ THE PLAYER HAS TWO HANDS. This test used to be
      // `source === 'player'`, which is the MELEE source only — so
      // every Weave the player cast missed the Leaning multiplier AND
      // the lineage/awakening multiplier entirely. Casting was the one
      // thing in the game that ignored every power system in the game,
      // which is exactly what "the power system has no effect on the
      // weave" means.
      //
      // The gate was never meant to exclude the player's spells. It
      // exists because COMBAT_HIT also carries ENEMY damage
      // (`source` is the Enemy instance) — and scaling that by how far
      // the player has woken their sword would hand every skeleton in
      // the world the player's lineage. There are exactly three
      // sources in the project (grep `emit(Events.COMBAT_HIT`):
      // 'player' (melee), 'wand' (Weaves) and an Enemy object. Two of
      // those are the player.
      //
      // ⚠️ Named, not inlined, so the next source that gets added has
      // one obvious place to declare which side it is on.
      const isPlayerDamage = data.source === 'player' || data.source === 'wand';

      // ⚠️ A Boon is a FACTOR folded here, exactly like the Leaning and
      // lineage multipliers beside it — never a stat it assigns and
      // "puts back" on expiry. A timed effect that writes a stat is
      // the easiest possible way to reintroduce trap #9, because the
      // expiry path looks like it ought to restore the old value and
      // silently clobbers whatever else has written since.
      const boonMult = isPlayerDamage ? boonSystem.grantOf('damageMult', 1) : 1;
      const leanMult = isPlayerDamage ? leaning.damageMultiplier() : 1;
      const wokenMult = isPlayerDamage ? lineageSystem.grant('damageMult', 1) : 1;
      // ⚠️ The Ascent grant was applied UNCONDITIONALLY, which is the
      // same bug pointing the other way: enemy-on-enemy and reaction
      // damage were being scaled by the player's rank. Gated now too.
      const ascentMult = isPlayerDamage ? ascentSystem.grant('damageMult', 1) : 1;
      // ── EPITHET GRANTS ─────────────────────────────────
      // ⚠️ Read here, at the one place player damage is resolved. An
      // Epithet whose grant nothing reads is worse than no grant,
      // because the panel reports it as applied — this project has
      // shipped that exact failure three times (`reachMult`,
      // `echoPower`, `manaCostMult`).
      let epithetMult = 1;
      if (isPlayerDamage) {
        const tgt = data.target;
        // The Giantfeller: harder against anything that outranks you.
        if (tgt && rankForLevel(tgt.level || 1) > ascentSystem.tier) {
          epithetMult *= epithetSystem.grant('punchUpMult', 1);
        }
        // Thin Ice: harder the closer to death you are.
        const frac = player.hp / Math.max(1, player.maxHp);
        if (frac <= 0.25) epithetMult *= epithetSystem.grant('desperationMult', 1);
      }
      let dmg = data.damage * ascentMult * leanMult * wokenMult * boonMult * epithetMult;

      // ── RANK ────────────────────────────────────────────
      // ⚠️ Applied LAST, after every other multiplier, because the
      // Refusal is a CAP and a cap applied before other multipliers is
      // not a cap. See data/ranks.js — this is the one rule in the
      // game that grinding cannot solve.
      // ⚠️ STEEL: no Rank cap on what you deal either (see above).
      // Stamped BEFORE the damage lands, so a killing blow is already
      // attributed by the time COMBAT_KILL fires out of takeDamage().
      // ── TACTICS: armour is DIRECTIONAL ────────────────
      // ⚠️ Applied here rather than inside takeDamage() because only
      // the caller knows where the blow came FROM, and "shielded from
      // the front" is the entire mechanic — a golem you must walk
      // around rather than out-damage. Applied AFTER the Refusal so a
      // cap still caps.
      if (typeof data.target.incomingFactor === 'function') {
        dmg *= data.target.incomingFactor(
          isPlayerDamage ? player.position : data.source?.position);
      }
      data.target._lastHitByPlayer = isPlayerDamage;
      data.target.takeDamage(dmg, data.element);
      // ⚠️ Gated on isPlayerDamage. The event is called
      // PLAYER_HIT_LANDED and its only listener applies the player's
      // on-hit masteries (Hungering's lifesteal, Frostbite's slow) —
      // firing it for damage the player did not deal is trap #12's
      // mirror again. It was harmless while every COMBAT_HIT with an
      // Enemy source was enemy-on-enemy reaction damage; it stopped
      // being harmless the moment summons became real, because an
      // Echo landing hits would have healed the player through a
      // mastery the player was not using.
      if (isPlayerDamage) {
        eventBus.emit(Events.PLAYER_HIT_LANDED, { enemy: data.target, damage: dmg });
      }
      // Melee never had an impact effect at all — only skill-cast bolts
      // did. Colour it by the player's own attunement (melee doesn't
      // carry an element the way a cast does) rather than nothing.
      if (data.source === 'player') {
        particleBursts.spawn(data.target.position, player._attunedElement || 'neutral', { count: 8, sizeMult: 0.85 });
        audioSystem.playImpact(data.target.typeId === 'golem');
        audioSystem.playEnemyHit(data.target.scale || 1);
      }
    }
  });

  // On-hit mastery passives (Hungering, Frostbite) — one listener,
  // fed by all three player hit pipelines (melee, wand here; the
  // skill-cast fireball emits the same event from Projectile.js,
  // since it resolves its own collision outside COMBAT_HIT).
  eventBus.on(Events.PLAYER_HIT_LANDED, ({ enemy, damage }) => {
    applyMasteryOnHit(enemy, damage);
    // ⚠️ The First Nightmare's Hungering (7% of damage dealt returns).
    // `player.innateLifesteal` was written by NightmareSystem and read
    // by NOTHING — see Player.recomputeStats' header for the full
    // count. Applied HERE because this event is the one place all
    // three player damage pipelines (melee, Weave, and Projectile's
    // own collision) converge, so a Pioneer gets the same return
    // whichever hand they hit with — trap #12's lesson.
    const steal = player.innateLifesteal || 0;
    if (steal > 0 && Number.isFinite(damage) && damage > 0 && player.hp > 0) {
      player.heal(damage * steal);
    }
  });

  eventBus.on(Events.COMBAT_DODGE, () => showNotification('Dodge!'));

  // Killing gives material AND a level's worth of progress — the
  // levels are ProgressSystem's business (it owns the COMBAT_KILL
  // subscription that grants them); this handler only repaints.
  //
  // ⚠️ This comment used to read "killing gives material, not levels.
  // Power comes from attunement." That was true and it was the
  // problem: attunement is fed by CASTING, the Ascent is gated behind
  // Descents, and a new player with neither had no progression at all
  // for their first hour. The Ascent's refusal is untouched — see
  // ProgressSystem's header for the line between the two.
  // ── SITE BOUNTIES ────────────────────────────────────
  // A graveyard you disturbed, or a door you opened, pays out once
  // what it woke is dead. ⚠️ Counted down on kills rather than polled
  // on "is anything still alive", because a creature that wanders off
  // and despawns would leave the debt permanently unpayable.
  eventBus.on(Events.COMBAT_KILL, (data) => {
    if (!_graveyardBounty.length) return;
    const b = _graveyardBounty[0];
    b.left--;
    if (b.left > 0) return;
    _graveyardBounty.shift();
    const got = _giveCores(b.site, 3, b.rich || 1.5);
    progressSystem.award(140);
    eventBus.emit(Events.UI_NOTIFY,
      `Quiet again. ${got.count}× ${got.name} for the trouble.`);
  });

  eventBus.on(Events.COMBAT_KILL, (data) => {
    if (data?.enemy?._lastHitByPlayer) {
      combatSystem.noteKill();   // the blade drinks
      // Now and then a body carries a rite worth taking.
      if (Math.random() < 0.09 && !data.enemy._swarmling) {
        const ids = ['draught_iron', 'oil_ember', 'oil_rime', 'oil_storm', 'chalk_ward', 'draught_wind'];
        const def = getItem(ids[Math.floor(Math.random() * ids.length)]);
        if (def) { inventory.addItem(def, 1); showNotification(`Taken from the body: ${def.name}.`); }
      }
    }
    updateHUD();
    if (data?.enemy?.isBoss) {
      sceneUI.say('', [VELL.defeatLine]);
    }
  });

  eventBus.on(Events.PLAYER_XP_UPDATE, () => updateHUD());
  eventBus.on(Events.CORE_UPDATE, () => updateHUD());
  // ⚠️ A new binding changes which key an Aspect answers to, and the
  // bar caches that — rebuild or the override does not take until the
  // next equip.
  // ⚠️ Rebuild only — never prune from here. `pruneBindings()` calls
  // `unbind()`, which emits this very event; pruning in the handler
  // is a loop.
  // ══════════════════════════════════════════════════════
  // THE WAKING GATE — the way out, and it has to be FINDABLE.
  //
  // ⚠️ A trial that ends with an invisible trigger somewhere in a
  // 1000-unit region is a trial with no ending. The Gate is a real
  // structure with a light, placed 45–70 units from wherever the
  // player was standing when they finished, and it is announced.
  // ══════════════════════════════════════════════════════
  eventBus.on(Events.NIGHTMARE_GATE_OPEN, ({ x, z }) => {
    const y = chunkManager.getGroundY(x, z);
    const gate = forgeDescentGate(0xbfd4ff, 1.6);
    gate.position.set(x, y, z);
    gate.name = 'waking-gate';
    sceneManager.scene.add(gate);
    // A tall beam so it is visible from across the region, not only
    // once you are on top of it.
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 2.2, 260, 10, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xbfd4ff, transparent: true, opacity: 0.13,
        side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
      }));
    beam.position.set(x, y + 130, z);
    sceneManager.scene.add(beam);
    weaveVFX.ring(new THREE.Vector3(x, y + 0.2, z), 'light', { size: 7, life: 1.4 });
    showNotification('A way out has opened. You can feel where it is.');
  });

  eventBus.on(Events.NIGHTMARE_WOKE, () => {
    // ⚠️ Removed by NAME, and both pieces. Leaving the Gate in the
    // scene would put a glowing pillar in the middle of the Sanctuary
    // for the rest of the run — the realm's geometry is not unloaded
    // by walking away from it.
    for (const n of ['waking-gate']) {
      const g = sceneManager.scene.getObjectByName(n);
      if (g) sceneManager.scene.remove(g);
    }
    for (const c of [...sceneManager.scene.children]) {
      if (c.isMesh && c.geometry?.type === 'CylinderGeometry'
          && c.material?.opacity === 0.13) sceneManager.scene.remove(c);
    }
  });

  eventBus.on(Events.BINDINGS_CHANGED, () => { loadout._rebuild(); _paintLoadoutBar(); _paintSummonBar(); });
  eventBus.on(Events.LOADOUT_CHANGED, () => {
    _syncLoadoutEquipment(); _paintLoadoutBar(); _paintSummonBar(); _syncHalo();
  });
  // ⚠️ The aura is the PLAYER's colour, so it has to follow the player
  // — not just the loadout. Attunement moves as they cast and the
  // Leaning moves as they act; without these two the ring would be
  // frozen at whatever colour the last equip happened to catch.
  //
  // ⚠️ `ATTUNEMENT_SHIFT` / `LEANING_UPDATE` — the REAL names, checked
  // against EventBus.js. The first draft used `ATTUNEMENT_CHANGED` and
  // `LEANING_CHANGED`, neither of which exists, and
  // `eventBus.on(undefined, fn)` registers a listener under the key
  // `undefined` that nothing ever emits. It fails completely silently:
  // the aura would simply never have updated, with no error anywhere.
  // §5 records this exact failure once already.
  //
  // ⚠️ `setAura()` early-returns when the colour has not actually
  // changed, which is what makes it safe to hang off LEANING_UPDATE's
  // ~4Hz stream — it re-tints only on a real move.
  eventBus.on(Events.ATTUNEMENT_SHIFT, () => gearHalo.setAura(playerAura()));
  eventBus.on(Events.LEANING_UPDATE, () => gearHalo.setAura(playerAura()));
  eventBus.on(Events.ASPECT_USED, () => _paintLoadoutBar());

  eventBus.on(Events.PLAYER_LEVEL_UP, ({ level, maxHp }) => {
    showNotification(`Level ${level}. ${maxHp} vitality, and the ground steadier under you.`);
    audioSystem.playUIClick?.('open');
    const cluster = document.getElementById('hud-top-left');
    if (cluster) {
      // Wake the diegetic fade so the flare is actually seen — the
      // cluster dims after a few idle seconds and a level-up landing
      // while it was dimmed would play the animation at 28% opacity.
      _lastVitalsChangeAt = performance.now();
      cluster.classList.remove('level-flare');
      void cluster.offsetWidth;   // restart the animation
      cluster.classList.add('level-flare');
    }
    updateHUD();
  });

  // The finale choice buttons — delegated, bound once.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.finale-choice-btn');
    if (!btn) return;
    const choice = btn.dataset.choice;
    overlayManager.close('finale-choice-modal');
    if (!overlayManager.hasAnyOpen()) {
      document.getElementById('game-canvas')?.requestPointerLock?.()?.catch?.(() => {});
    }
    questSystem.resolveFinale(choice);
    showFinaleNarration(choice);
  });

  eventBus.on(Events.UI_DAMAGE_NUMBER, (data) => {
    const dmgEl = document.createElement('div');
    const isSpell = data.type === 'spell';
    dmgEl.className = `damage-number ${data.type || ''} ${isSpell ? 'spell-dmg' : ''}`;
    dmgEl.innerText = Math.round(data.amount);

    const pos = data.position.clone();
    pos.project(cameraController.camera);

    const x = (pos.x * .5 + .5) * window.innerWidth;
    const y = (pos.y * -.5 + .5) * window.innerHeight;

    dmgEl.style.left = `${x}px`;
    dmgEl.style.top  = `${y}px`;
    document.getElementById('damage-numbers').appendChild(dmgEl);
    setTimeout(() => dmgEl.remove(), 1000);
  });

  eventBus.on(Events.UI_NOTIFY, showNotification);

  // Biome notification
  eventBus.on(Events.BIOME_ENTER, (biome) => {
    if (biome?.name) showNotification(`Entering: ${biome.name}`);
  });
}

// Elden Ring's bars fade in on damage/exertion and fade back out a
// few idle seconds later instead of sitting on screen permanently —
// this used to be a fixed always-on panel. `_lastVitalsChangeAt`
// tracks the last time HP/MP actually moved; stamina barely holds
// still while moving at all, so it's read separately and just keeps
// the cluster awake whenever it's below its own max.
// ⚠️ 5 seconds, then ~4% of max health per second — a full heal from
// near-death takes about 25 seconds of NOT fighting. Long enough that
// retreating is a decision and short enough that exploring after a bad
// fight is not a walk home.
const OOC_HEAL_DELAY = 5;
const OOC_HEAL_FRACTION = 0.04;

let _lastVitalsChangeAt = 0;
let _prevHp = null, _prevMp = null;

/**
 * Paint the loadout hotbar.
 *
 * ⚠️ This is why "I can't use the active abilities" was true even
 * after the loadout worked: there was NO hotbar in the HUD at all.
 * The Aspects existed, held keys, fired correctly when driven from a
 * console — and were completely invisible in play. A power the player
 * cannot see is a power they do not have.
 */
function _paintLoadoutBar() {
  // The Remnants' skills are slots in the ONE hotbar row now (WandUI).
  const snap = loadout.snapshot();
  const old = document.getElementById('loadout-bar');
  if (old) { old.innerHTML = ''; old.classList.add('empty'); }
  wandUI.renderRemnants(snap.bar, coreSystem.essence);
}

/**
 * Paint the summon strip — what is out, and on what letter.
 *
 * ⚠️ This is the visible half of the gear letters. The invisible half
 * has failed twice in this project already: the active Aspects fired
 * correctly for a whole session with no hotbar in the HUD, and the
 * Loadout block in the satchel was static markup nobody ever filled
 * in. Both read as "the feature doesn't work". A summoned thing whose
 * letter is only discoverable in a panel is the same bug wearing new
 * clothes.
 *
 * ⚠️ The letter shown is the LIVE binding, re-read every paint, not a
 * value cached at summon time — rebinding in V emits BINDINGS_CHANGED,
 * which repaints this, so the strip and the bindings panel cannot
 * disagree about which key does what.
 */
function _paintSummonBar() {
  const el = document.getElementById('summon-bar');
  if (!el) return;
  const { combat, carried } = loadout.summonSnapshot();
  wandUI.renderHand(combat);   // the armament shows which slot is in hand

  // Nothing summoned AND nothing carried — the strip would be three
  // empty boxes teaching a rule about a system the player has not met
  // yet. It appears with the first forged thing.
  if (!combat.some(c => !c.empty) && !carried.length) {
    el.innerHTML = ''; el.classList.add('empty'); return;
  }
  el.classList.remove('empty');

  const chip = (r) => {
    if (r.empty) {
      return `<div class="sb-chip vacant" title="Combat slot ${r.slot + 1} — empty. Press a forged thing's letter to call it here.">
                <span class="sb-key unbound">${r.slot + 1}</span>
                <span class="sb-name">Empty</span>
                <span class="sb-where">slot ${r.slot + 1}</span>
              </div>`;
    }
    const key = r.key ? keyLabel(r.key) : '—';
    const where = r.slot !== null ? `slot ${r.slot + 1}` : r.state;
    return `
      <div class="sb-chip${r.inHand ? ' inhand' : ''}"
           style="--el: var(--el-${r.element || 'neutral'})${r.tier ? `; --g:${r.tier}` : ''}"
           title="${r.name} — ${r.form}, ${where}${r.key ? ` · ${key} puts it away` : ' · no letter yet (bind it in V)'}">
        <span class="sb-key${r.key ? '' : ' unbound'}">${key}</span>
        <span class="sb-name">${r.name}</span>
        <span class="sb-where">${where}</span>
      </div>`;
  };

  // ⚠️ THE STRIP IS THE THREE COMBAT SLOTS AND NOTHING ELSE.
  //
  // Carried things (charms, relics, raiment) are deliberately NOT
  // drawn here. Raiment is uncapped by design, so including them
  // gives the strip no ceiling: measured at seven things it wrapped to
  // three rows and 107px of HUD, over a hotbar that is itself a row.
  // Even folded to a single "+N carried" chip it cost enough width
  // that the remaining names ellipsised to nothing at the narrower of
  // the two parent widths this row actually takes (362px / 484px,
  // both measured in one session) — and a strip that cannot tell you
  // what is in slot 2 is not doing its job.
  //
  // "At once 3 can be summoned" is the rule the owner named, and these
  // are those three. A charm is passive and pressed rarely; its letter
  // lives in the satchel's loadout block, the Loom's equip page and
  // the bindings panel — all three list it, so nothing is hidden, it
  // is just not on the HUD.
  el.innerHTML = combat.map(chip).join('');
  el.title = carried.length
    ? `Also carried: ${carried.map(c => `${c.name} (${c.state})`).join(', ')}`
    : '';
}

function updateHUD() {
  const hpPct = Math.max(0, (player.hp / player.maxHp) * 100);
  const mpPct = Math.max(0, (player.mp / player.maxMp) * 100);
  const stPct = Math.max(0, (player.stamina / player.maxStamina) * 100);

  document.getElementById('hp-fill').style.width = `${hpPct}%`;
  void mpPct;   // ⚠️ STEEL: the second bar is Balance now (ui/SteelHUD.js)
  document.getElementById('stamina-fill').style.width = `${stPct}%`;
  document.getElementById('hp-text').innerText = `${Math.ceil(player.hp)} / ${player.maxHp}`;
  // Focus — mana and Essence as ONE pool (CoreSystem routes Essence here).

  const esFill = document.getElementById('essence-fill');
  if (esFill) esFill.style.width = `${Math.min(100, coreSystem.fraction * 100)}%`;
  const esText = document.getElementById('essence-text');
  if (esText) {
    const c = coreSystem.snapshot();
    esText.innerText = `${c.essence} / ${c.capacity}`;
    const bar = document.getElementById('essence-bar');
    // ⚠️ Quality in the tooltip, because it is the half a player will
    // otherwise never see — capacity moves visibly as you level, and
    // quality only ever moves when you Rank up.
    if (bar) bar.title = `Essence ${c.essence}/${c.capacity} · Core quality x${c.quality} (${c.rankName})${c.cores > 1 ? ` · ${c.cores} Cores` : ''}`;
  }

  const xpFill = document.getElementById('xp-fill');
  if (xpFill) xpFill.style.width = `${Math.min(100, progressSystem.fraction * 100)}%`;
  const lvlEl = document.getElementById('level-readout');
  if (lvlEl) lvlEl.innerText = `Lv ${progressSystem.level}`;
  const xpBar = document.getElementById('xp-bar');
  if (xpBar) {
    xpBar.title = `${Math.floor(progressSystem.xp)} / ${progressSystem.xpToNext} to Lv ${progressSystem.level + 1}`;
  }

  if (_prevHp !== null && (player.hp !== _prevHp || player.mp !== _prevMp)) {
    _lastVitalsChangeAt = performance.now();
  }
  _prevHp = player.hp; _prevMp = player.mp;
}

requestAnimationFrame(function animateHUD() {
  if (gameStarted) {
    const stPct = Math.max(0, (player.stamina / player.maxStamina) * 100);
    document.getElementById('stamina-fill').style.width = `${stPct}%`;
    // Cooldown wedges sweep every frame rather than jumping once per
    // WAND_UPDATE event — this only pokes a CSS variable on existing
    // DOM, it doesn't re-render the bar.
    wandUI.updateCooldownVisuals();
    steelHUD.update();
    // ⚠️ Only repaint while something is actually cooling — this runs
    // every frame and rebuilding the bar's innerHTML unconditionally
    // would be a per-frame DOM write for a bar that rarely changes.
    if (loadout.bar.some(b => (loadout.cooldownOf(b.id) || 0) > 0)) _paintLoadoutBar();

    // Diegetic fade: stays lit while something's actually happening
    // (recent damage/heal/cast, HP not full, stamina spent, or
    // genuinely in danger) and dims to a translucent sliver — not
    // gone, just quiet — once none of that's true for a few seconds.
    const vitalsEl = document.getElementById('hud-top-left');
    if (vitalsEl) {
      const danger = player.maxHp ? 1 - player.hp / player.maxHp : 0;
      const recentlyChanged = performance.now() - _lastVitalsChangeAt < 2600;
      const stSpent = stPct < 96;
      const awake = recentlyChanged || danger > 0.15 || stSpent || !gameStarted;
      vitalsEl.classList.toggle('dim', !awake);
    }
  }
  requestAnimationFrame(animateHUD);
});

// ══════════════════════════════════════════════════════════
// ⚠️ THE NOTIFICATION FEED — off the centre of the view.
// Owner (combat overhaul): the fight was confusing, and a stack of
// tutorial lines across the middle of the screen sat exactly where the
// enemy was. Now a compact feed on the LEFT: at most NOTIF_MAX lines,
// newest at the bottom, a repeated line collapses into "×n" instead of
// stacking, and the whole feed dims while you are in a fight (combat
// lines have their own channel — ui/CombatHUD.js's log under the
// crosshair).
// ══════════════════════════════════════════════════════════
const NOTIF_MAX = 3, NOTIF_LIFE = 4800;
function showNotification(msg) {
  const isEventObject = typeof msg === 'object';
  const text = String(isEventObject ? msg.text : msg);
  const container = document.getElementById('notifications');
  if (!container || !text) return;
  // The same line again: count it, refresh it, do not stack it.
  const same = [...container.children].find(n => n.dataset.text === text);
  if (same) {
    const n = (+same.dataset.n || 1) + 1;
    same.dataset.n = n;
    same.innerText = `${text}  ×${n}`;
    clearTimeout(same._t);
    same._t = setTimeout(() => same.remove(), NOTIF_LIFE);
    container.appendChild(same);
    return;
  }
  const el = document.createElement('div');
  el.className = 'notification';
  el.dataset.text = text;
  el.innerText = text;
  container.appendChild(el);
  while (container.children.length > NOTIF_MAX) container.firstElementChild.remove();
  el._t = setTimeout(() => el.remove(), NOTIF_LIFE);
}
// ── HUD MODE: compact (default) / full (F1) ───────────────
// Owner: "the UI elements are too big and cluttering the screen." See
// the COMPACT HUD block in style-realism.css for what each mode shows.
// The key legend is shown for the first HINT_SECONDS of a session (a new
// player needs it) and always in full mode; a small tag says F1.
const HINT_SECONDS = 180;
let _hudFull = (() => { try { return localStorage.getItem('mz.hudFull') === '1'; } catch { return false; } })();
let _hudT = 0;
function _setHudMode(full) {
  _hudFull = full;
  try { localStorage.setItem('mz.hudFull', full ? '1' : '0'); } catch { /* private mode */ }
  document.body.classList.toggle('hud-full', full);
  document.body.classList.toggle('hud-compact', !full);
  // No on-screen F1 tag and no key legend any more (owner: remove them).
  document.getElementById('hud-mode-tag')?.remove();
}
function _updateHudMode(dt) {
  if (_hudT === 0) _setHudMode(_hudFull);
  _hudT += dt;
  document.body.classList.toggle('hints-on', _hudT < HINT_SECONDS);
  if (input.isKeyJustPressed('F1')) { _setHudMode(!_hudFull); pauseMenu.sync('hudFull', _hudFull); }
  if (input.isKeyJustPressed('F3')) pauseMenu.sync('perf', !!perfHUD.visible);   // PerfHUD already toggled on keydown
}

/**
 * Wading and swimming: rings where you move, a splash going in, a wake
 * while swimming. (Player.js sets waterDepth / isSwimming / waterSurf.)
 */
function _updateWading(dt) {
  const inWater = (player.waterDepth || 0) > 0.06;
  const p = player.position;
  if (inWater && !_wasInWater) {
    chunkManager.water?.ripple(p.x, p.z, 1.4);
    particleBursts.spawn(new THREE.Vector3(p.x, player.waterSurf + 0.1, p.z), 'water', { count: 14, sizeMult: 1.1, life: 0.6 });
  }
  _wasInWater = inWater;
  if (!inWater) return;
  const moving = Math.hypot(player.velocity?.x || 0, player.velocity?.z || 0) > 0.5;
  _wadeT -= dt;
  if (moving && _wadeT <= 0) {
    _wadeT = player.isSwimming ? 0.45 : 0.32;
    chunkManager.water?.ripple(p.x, p.z, player.isSwimming ? 0.9 : 0.6);
    if (!player.isSwimming && Math.random() < 0.5)
      particleBursts.spawn(new THREE.Vector3(p.x, player.waterSurf + 0.05, p.z), 'water', { count: 4, sizeMult: 0.6, life: 0.4 });
  }
}

/** Dim the feed in a fight (called per frame from update()). */
function _syncNotifDim() {
  const c = document.getElementById('notifications');
  if (!c) return;
  const fighting = !!combatSystem.target || player.isAttacking || combatSystem.blocking
    || (performance.now() / 1000 - (_lastStruckAt || -99) < 5);
  c.classList.toggle('in-fight', fighting);
}

window.addEventListener('load', initGame);
