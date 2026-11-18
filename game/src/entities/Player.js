// ══════════════════════════════════════════════════════════
// Player — Character Entity with Movement & Combat
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { PLAYER, CAMERA, ELEMENTS, PACE } from '../data/constants.js';
import { input } from '../core/InputManager.js';
import { cameraController } from '../rendering/CameraController.js';
import { sceneManager } from '../rendering/SceneManager.js';
import { forgePioneer, retintPioneer, forgeWand, animateWand, retintWand, forgeWeapon, animateWeapon, applyPioneerCorruption, animateCreature } from '../rendering/EntityForge.js';
import { eventBus, Events } from '../core/EventBus.js';
import { projectileManager } from './Projectile.js';
import { npcManager } from './NPCManager.js';
import { SKILLS } from '../data/skills.js';
import { attunement } from '../systems/AttunementSystem.js';
import { leaning } from '../systems/LeaningSystem.js';
import { audioSystem } from '../systems/AudioSystem.js';
import { boonSystem } from '../systems/BoonSystem.js';
import { epithetSystem } from '../systems/EpithetSystem.js';
import { combatSystem } from '../systems/CombatSystem.js';

import { ELEMENT_COLORS } from '../data/constants.js';
// ─── GEOMETRY HELPERS (From Chronicles Compendium) ───
const M = (color, shine = 50, extra = {}) =>
  sceneManager.createToonMaterial(color, { shininess: shine, ...extra });

const Em = (color, emissive, intensity = 0.6, extra = {}) =>
  new THREE.MeshPhongMaterial({ color, emissive, emissiveIntensity: intensity, shininess: 120, ...extra });

function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
}

function sph(r, mat, x, y, z, parent, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 16), mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; parent.add(m); return m;
}

function cyl(rt, rb, h, mat, x, y, z, parent, segs = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segs), mat);
  m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
}

/**
 * Free a detached prop's GPU resources.
 *
 * The weapon meshes are rebuilt from scratch on every equip, and the
 * old one was only ever `remove()`d — which unparents it and leaks its
 * geometry and materials for the life of the session. Same lesson as
 * the corpse leak in trap #22: removing something from a list is not
 * the same as destroying it.
 *
 * ⚠️ Materials only, not textures — the material library SHARES its
 * texture maps across props, so disposing those would blank every
 * other object using them.
 */
function disposeTree(root) {
  root?.traverse?.(o => {
    if (!o.isMesh) return;
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) mat?.dispose?.();
  });
}

function con(r, h, mat, x, y, z, parent, segs = 6) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, segs), mat);
  m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
}

// The Pioneer's unarmed, unequipped floor. Was a literal `10` written
// in two places (constructor and init()) plus a third implicit one in
// equipWeapon's fallback.
const PLAYER_BASE_ATK = 10;
const PLAYER_BASE_DEF = 10;

class Player {
  constructor() {
    this.mesh = null;
    this.position = new THREE.Vector3(0, 5, 0);
    this.velocity = new THREE.Vector3();
    this.rotation = 0;

    this.hp = PLAYER.MAX_HP;
    this.maxHp = PLAYER.MAX_HP;
    this.mp = PLAYER.MAX_MP;
    this.maxMp = PLAYER.MAX_MP;
    this.stamina = PLAYER.MAX_STAMINA;
    this.maxStamina = PLAYER.MAX_STAMINA;
    this.level = 1;
    this.xp = 0;
    this.xpToNext = 100;
    this.isDead = false;

    this.attackCooldown = 0;
    this.isAttacking = false;
    this.attackTimer = 0;
    this.attackElapsed = 0;   // seconds into the current swing
    this.attackTotal = 0.3;   // its full length (wind-up → recovery)
    this.comboCount = 0;
    this.comboTimer = 0;
    this.isDodging = false;
    this.dodgeTimer = 0;
    this.dodgeDirection = new THREE.Vector3();
    this.iFrames = 0;

    // ⚠️ There is no class any more (see systems/LeaningSystem.js).
    // This used to be a CLASSES entry whose `.stats` doubled as the
    // live scratchpad for equipped weapon power and armour defence —
    // the identity and the running totals were the same object, which
    // is why every call site had to guard `if (!this.playerClass.stats)`.
    // Split: identity is emergent and lives in LeaningSystem; these are
    // just the numbers.
    this.stats = { atk: 10, def: 10 };
    // ── LEVEL BONUSES ────────────────────────────────────
    // ⚠️ Published FACTORS, not a second assignment to stats.atk/def.
    // Both of those fields are written absolutely — equipWeapon() does
    // `stats.atk = power`, equipArmor() does `stats.def = base + armor`
    // — so a progression system that also assigned them would erase
    // gear on every level and erase levels on every equip, in both
    // directions. ProgressSystem owns these two numbers and nothing
    // else; recomputeStats() below is the ONE writer of the stats.
    // (HANDOFF §0.9: publish a factor, never assign the field.)
    this.levelAtk = 0;
    this.levelDef = 0;
    // Published by AwakeningSystem — the flat half of a woken weapon's
    // grant. A third contributor to the same sum, folded by
    // recomputeStats() like the other two, never assigned.
    this.awakenAtk = 0;
    // Marks — the fourth build knob (systems/MarkSystem.js). Published
    // as a factor like every other contributor; recomputeStats folds
    // it in. Strength Marks reach the swing, Vitality Marks the body.
    this.markAtk = 0;
    // Equipped Memories' passive contribution (LoadoutSystem). The
    // FIFTH contributor to stats.atk, folded like the rest.
    this.loadoutAtk = 0;
    // What the equipped weapon contributes on its own, remembered so
    // the recompute does not have to re-derive it from the item.
    this.weaponAtk = PLAYER_BASE_ATK;
    this.skills = [];
    // Per-ability cooldown, indexed the same as this.skills — SKILLS
    // data already defined a cooldown per ability but nothing ever
    // applied it, so Z/X/C could be spammed every keypress. Also what
    // the hotbar's radial cooldown sweep reads from.
    this.abilityCooldowns = [0, 0, 0];
    this.name = 'Pioneer';
    this.armorTokens = { head: null, chest: null, legs: null };
    // ⚠️ Was 0 while `stats.def` was separately initialised to 10 —
    // so equipping your FIRST piece of armour recomputed def from the
    // 0 floor and could hand you a LOWER number than going bare. One
    // floor, used by both.
    // Note: `stats.def` is now READ by takeDamage() — this keeps
    // the number honest without inventing a damage-reduction rule
    // nobody asked for.
    this.baseDefense = PLAYER_BASE_DEF;

    this.isGrounded = false;
    this.groundY = 0;
    this.raycaster = new THREE.Raycaster();

    this.moveDirection = new THREE.Vector3();

    this.animState = 'idle';
    this.animTimer = 0;
  }

  init(playerData = {}) {
    this.name = playerData.name || 'Pioneer';
    this.stats = { atk: PLAYER_BASE_ATK, def: PLAYER_BASE_DEF };
    this.weaponAtk = PLAYER_BASE_ATK;
    this.levelAtk = 0;
    this.levelDef = 0;
    this.awakenAtk = 0;
    this.skills = playerData.skills || [];

    this.mesh = new THREE.Group();
    // The silhouette follows the declared path rather than a class.
    // It barely matters mechanically — the rig is hidden two lines
    // below, because this is a first-person game and rendering the
    // body means staring out through the inside of your own hood —
    // but the character-preview panel (a separate rig instance) shows
    // it, so it should not be arbitrary.
    if (leaning.side === 'heaven') this._buildKnight(this.mesh);
    else this._buildRogue(this.mesh);

    this.mesh.position.copy(this.position);
    sceneManager.add(this.mesh);
    // First-person: the camera sits at this rig's own eye height, so
    // rendering the body would mean staring out through the inside of
    // your own hood every frame. There's a dedicated wand viewmodel
    // for what stands in for it instead (see main.js). Hide the rig
    // specifically, not the whole mesh group — playerLight is a
    // sibling on `this.mesh`, and a light under an invisible parent
    // stops contributing light entirely, which would kill the
    // attunement glow that's meant to still ambient-light the world
    // around the (now unseen) player.
    // ⚠️ NOT the whole rig — see _setFirstPersonBody(). Hiding
    // everything was why looking down showed nothing at all.
    this._setFirstPersonBody();

    const classColor = leaning.tint();
    this.playerLight = new THREE.PointLight(classColor, 0.5, 8);
    this.playerLight.position.y = 1;
    this.mesh.add(this.playerLight);

    // No class to report any more — what the Pioneer IS emerges from
    // play now (LeaningSystem.calling()), and at spawn the honest
    // answer is "nothing yet."
    console.log(`[Player] Spawned: ${this.name} (${leaning.calling()})`);
    eventBus.emit(Events.PLAYER_SPAWN, this);
  }

  // ─── THE PIONEER ───
  // One figure for every path. Class was never a different body — it
  // is a starting lean — and three stacks of boxes were three times
  // the reason the game read as a toy.

  _buildPioneer(g) {
    const rig = forgePioneer(this._attunedElement || 'arcane');
    g.add(rig.group);

    this.rig         = rig;
    this.leftLeg     = rig.leftLeg;
    this.rightLeg    = rig.rightLeg;
    this.leftArm     = rig.leftArm;
    this.rightArm    = rig.rightArm;
    this.weaponGroup = rig.weaponGroup;

    // The wand is the only weapon, so it is always in hand.
    this.weapon = forgeWand(this._attunedElement || 'arcane');
    this.weaponGroup.add(this.weapon);
  }

  _buildKnight(g) { this._buildPioneer(g); }
  _buildMage(g)   { this._buildPioneer(g); }
  _buildRogue(g)  { this._buildPioneer(g); }

  /** Re-tint the figure and wand as attunement drifts. */
  setAttunedElement(element) {
    this._attunedElement = element;
    if (this.rig?.group) retintPioneer(this.rig.group, element);
    if (this.weapon) retintWand(this.weapon, element);
  }

  /**
   * THE FIRST-PERSON BODY.
   *
   * ── WHY ───────────────────────────────────────────────
   * Owner: "make it feel like I am playing in first person."
   *
   * The entire rig used to be `visible = false`. The reasoning in the
   * old comment was sound as far as it went — the camera sits inside
   * the Pioneer's skull, so the hood filled the lens every frame — but
   * the fix was a sledgehammer: it also deleted the torso, the legs
   * and the feet, so looking down showed the ground through where a
   * person should be. Nothing in the frame said you had a body.
   *
   * ── WHAT THIS DOES INSTEAD ────────────────────────────
   * Hides only what is above the neck. Everything from the shoulders
   * down stays, so pitching the camera down shows your own robe and
   * boots, moving with your stride, exactly where they should be.
   *
   * ⚠️ Head parts are found by NAME (`pioneer-head`, tagged in
   * EntityForge) rather than by height, because the rig can be the
   * procedural Pioneer OR a loaded glTF knight and those two disagree
   * about where 'neck height' is.
   *
   * ⚠️ The eyes are `pioneer-eye`, NOT `pioneer-head` — `retintPioneer`
   * finds them by that name to recolour them as attunement drifts, and
   * renaming them would silently break that. They are hidden here by
   * their own name as a second case.
   *
   * ⚠️ `castShadow` is KEPT ON for the surviving parts. A first-person
   * body that throws no shadow is uncanny in a game with a hard key
   * light — your own shadow on the ground beside you is most of what
   * sells having a body at all.
   */
  _setFirstPersonBody() {
    const rig = this.rig?.group;
    if (!rig) return;
    rig.visible = true;

    // ══════════════════════════════════════════════════
    // ⚠️ FIT THE BODY TO THE EYE FIRST.
    //
    // The rig has always been roughly TWICE the size the camera
    // assumes. Measured: bounding box y −0.81 … 3.20 (just over four
    // units of standing height) with `CAMERA.EYE_HEIGHT` at 1.62 —
    // so the torso ended at 1.56, the legs hung below the ground
    // plane, and the helmet floated a metre and a half above the
    // player's own viewpoint.
    //
    // None of that was visible while the whole rig was hidden, which
    // is exactly why it survived: an invisible object's proportions
    // are never wrong. The moment there is a first-person body it
    // matters, and it also fixes a SHADOW that has been twice
    // human-sized on the ground next to the player this whole time.
    //
    // ⚠️ Measured BEFORE the head is hidden, so total standing height
    // is what gets normalised rather than shoulder height.
    // ⚠️ Assumes the parent (`this.mesh`) is unscaled and unrotated,
    // which it is — the world-space box and the local offset are then
    // the same units.
    // ══════════════════════════════════════════════════
    if (!rig.userData.fittedToEye) {
      rig.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(rig);
      const h = box.max.y - box.min.y;
      if (h > 0.01 && h < 40) {
        // The eye sits ~93% of the way up a standing body.
        rig.scale.multiplyScalar((CAMERA.EYE_HEIGHT / 0.93) / h);
      }
      // ⚠️ SCALE ONLY — the position is deliberately left alone.
      //
      // The first version also re-seated the rig from its measured
      // bounding box, and put the body five units in the air.
      // `Box3.setFromObject` computes a SkinnedMesh's box from the
      // geometry's own bounds through the mesh matrix and ignores
      // skinning entirely, so on a glTF rig (where the bones do the
      // placement and the geometry sits near the origin) the number it
      // returns is not where the character is. It is good enough for a
      // rough HEIGHT ratio and useless as a position.
      //
      // The model already stands on its own origin — that is how it
      // worked as a third-person body for the life of the project —
      // so scaling about that origin keeps the feet where they were.
      rig.userData.fittedToEye = true;
    }

    // ⚠️ TWO RIGS, TWO NAMING SCHEMES.
    // `forgePioneer()` returns the procedural Pioneer when the knight
    // glTF has not loaded and the LOADED KNIGHT when it has — and in
    // practice it is almost always the knight. Tagging only the
    // procedural parts (which is what the first version did) meant
    // this function hid nothing at all in the common case, and the
    // helmet sat in the middle of the lens. Matched case-insensitively
    // against both vocabularies.
    const HEAD = /pioneer-head|pioneer-eye|head|helmet|hood|cowl/i;

    rig.traverse(o => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      const n = o.name || '';
      if (!HEAD.test(n)) return;
      o.visible = false;
      // ⚠️ And it must stop casting, or the helmet's shadow falls
      // across the player's own view as a floating dark blob with
      // nothing above it.
      o.castShadow = false;
    });

    // ⚠️ The held weapon meshes belong to the BODY rig, and in first
    // person the viewmodel already draws its own copy a few
    // centimetres from the lens. Leaving both visible means the
    // player sees their sword twice, at two scales, disagreeing about
    // where it is. The body's copy keeps casting a shadow — that is
    // the half worth having.
    for (const held of ['1H_Sword', '1H_Sword_Offhand']) {
      const m = rig.getObjectByName(held);
      if (m) m.visible = false;
    }
    // ⚠️ The body's OWN held focus/weapon. The first-person viewmodel
    // draws the one you see; the body's copy rides its right hand, and
    // on the realistic body that hand sits exactly where a real hand
    // would — in view at the bottom of the frame (measured as a dark
    // rounded shape: the focus's iron ferrule, upside down).
    if (this.weaponGroup) this.weaponGroup.visible = false;

    this._clipBodyAtLens(rig);
  }

  /**
   * Cut the player's own body away wherever it reaches the lens.
   *
   * ⚠️ Owner: "whenever I am walking the 3d model overlaps the camera…
   * like I am seeing inside myself". Hiding by mesh NAME (above) only
   * removes the head and helmet; the torso, collar, cape and arms stay,
   * and the walk cycle and head-bob carry them through the lens. The
   * realistic body is a single mesh, so name-hiding removed nothing.
   *
   * Instead every body material gets a fragment cut, in world space
   * around the CAMERA: anything within 0.35 m of the lens, or at
   * shoulder height and above (≤0.5 m below the eye) within 0.55 m
   * horizontally, is discarded. Looking down still shows legs and
   * feet; the shadow is untouched (the depth pass does not run this
   * shader), so the full silhouette still lands on the ground.
   *
   * ⚠️ Materials are CLONED first: KayKit materials are shared with
   * every enemy knight, which must not be cut around the player's eye.
   * Idempotent per material (userData flag).
   */
  _clipBodyAtLens(rig) {
    rig.traverse(o => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      const fix = (m) => {
        if (!m || m.userData?.lensClipped) return m;
        const c = m.clone();
        c.userData = { ...(m.userData || {}), lensClipped: true };
        const prev = m.onBeforeCompile;
        c.onBeforeCompile = (sh, r) => {
          if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev.call(c, sh, r);
          sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vMzLens;')
            .replace('#include <project_vertex>', '#include <project_vertex>\nvMzLens = (modelMatrix * vec4(transformed, 1.0)).xyz;');
          sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vMzLens;')
            .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
              vec3 mzL = vMzLens - cameraPosition;
              if (dot(mzL, mzL) < 0.1225 || (mzL.y > -0.5 && dot(mzL.xz, mzL.xz) < 0.3025)) discard;`);
        };
        const key = m.customProgramCacheKey?.bind(m);
        c.customProgramCacheKey = () => `lensclip:${key ? key() : ''}`;
        return c;
      };
      o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material);
    });
  }

  /** Mastering an element leaves a permanent mark — see EntityForge.js. */
  setCorrupted(active) {
    if (this.rig?.group) applyPioneerCorruption(this.rig.group, active);
  }

  /**
   * ⚠️ THE ONLY WRITER of `stats.atk` and `stats.def`.
   *
   * Each is a sum of independent contributions with independent
   * lifetimes — the weapon in your hand, the armour on your back, and
   * how much you have done — and each of those used to assign the
   * field outright. Two absolute writers to one field is the recurring
   * architecture bug in this project; the contributions are stored
   * separately and folded here, exactly the way Atmosphere.update() is
   * the sole writer of fog density with everything else publishing a
   * factor.
   *
   * Safe to call as often as you like: it derives, it never
   * increments, so calling it twice is the same as calling it once.
   */
  recomputeStats() {
    // ⚠️ THE INNATE GRANTS ARE FOLDED HERE, AND SIX OF THEM USED TO BE
    // READ NOWHERE AT ALL.
    //
    // `NightmareSystem._applyInnate` writes eight `innate*` fields off
    // the First Nightmare's Aspect and Flaw. Grepped, only two of the
    // eight had a reader anywhere in `src/` — `innateHpMult` and
    // `innateMpMult`. `innateAtkMult`, `innateDef`, `innateMoveMult`,
    // `innateStamMult`, `innateLifesteal` and `innateEssenceMult` were
    // written once and read by nothing, so Sharpened (+18% attack),
    // Warded (+26 def), Quickened, Tireless, Hungering and Kindled —
    // SIX OF THE EIGHT ASPECTS — were entirely inert, along with four
    // of the six Flaws that pay for them. The character sheet named a
    // power the game did not have.
    //
    // This is precisely the failure `data/nightmares.js`'s own header
    // warns about ("anything added here without a reader there is a lie
    // the character sheet tells"), which had already been shipped four
    // times before this. The warning was written and then the same bug
    // was shipped in the very file that carries it.
    //
    // ⚠️ Folded as a FACTOR inside the sole writer (trap #9), never
    // assigned to `stats.atk` from NightmareSystem — two writers to
    // `stats.atk` is the exact bug that made gear erase levels.
    const innateAtk = this.innateAtkMult || 1;
    this.stats.atk = Math.round(
      (this.weaponAtk + this.levelAtk
       + (this.awakenAtk || 0) + (this.markAtk || 0) + (this.loadoutAtk || 0))
      * innateAtk);

    let totalDef = this.baseDefense;
    for (const key in this.armorTokens) {
      if (this.armorTokens[key]) totalDef += (this.armorTokens[key].defense || 0);
    }
    // ⚠️ Raiment does NOT go through `armorTokens`, and that is the
    // point. Raiment is uncapped by design (LoadoutSystem's capacity
    // note) while `armorTokens` has exactly three keys — head, chest,
    // legs — so filing raiment there would silently cap it at three
    // and make the fourth piece you wove do nothing. It is published
    // as one folded contribution instead, exactly the way `weaponAtk`,
    // `levelAtk` and `loadoutAtk` are. This method stays the SOLE
    // writer of `stats.def` (trap #9).
    // ⚠️ `innateDef` is a FLAT contribution, folded like `levelDef` and
    // `raimentDef` — Warded grants +26 and Brittle −14. Clamped at 0 so
    // a Brittle Pioneer with no armour cannot reach a negative defence,
    // which `takeDamage` would read as an incoming-damage BONUS.
    this.stats.def = Math.max(0, Math.round(
      totalDef + this.levelDef + (this.raimentDef || 0) + (this.innateDef || 0)));
  }

  /**
   * The Fracture Wand stays the caster, always in hand, never swapped.
   * A forged weapon is what actually connects in melee — this builds
   * and hangs the real thing off the same weaponGroup the wand lives
   * in, and broadcasts it so the FPS viewmodel (main.js) and the
   * character-preview panel — two more separate rig instances — can
   * each forge and hold their own copy.
   */
  equipWeapon(itemDef) {
    if (!itemDef) return;
    const power = itemDef.stats?.attack || itemDef.power || (10 + ((itemDef.tier?.level || 1) * 5));
    this.weaponAtk = power;
    this.recomputeStats();

    // main.js hands the starting Fracture Wand through this exact
    // method at boot, purely to register its power figure — it's not
    // a forged weapon and has no weaponType, so without this guard it
    // would forge a phantom sword (the weaponType fallback) and hang
    // it next to the wand before the player has crafted anything.
    if (itemDef.isWand) {
      // ⚠️ Remembered so clearWeapon() can put it back. The Fracture
      // Wand "stays the caster, always in hand, never swapped" — so
      // taking a forged weapon off must return you to the WAND's
      // figure, not to bare fists. Without this, equipping a Memory
      // and then removing it left the Pioneer permanently weaker than
      // they were before they ever forged anything.
      this._wandAtk = power;
      return;
    }

    this.equippedWeapon = itemDef;

    if (this._meleeWeaponMesh) {
      this.weaponGroup.remove(this._meleeWeaponMesh);
      disposeTree(this._meleeWeaponMesh);
      this._meleeWeaponMesh = null;
    }
    const weaponType = itemDef.weaponType || 'sword';
    const element = itemDef.element || ELEMENTS.NEUTRAL;
    const tierLevel = itemDef.tier?.level || 1;
    // ⚠️ The MEMORY'S OWN seed (falling back to its id), so the three
    // separate rigs that each forge their own copy of this weapon —
    // the body rig here, the FPS viewmodel, the character preview —
    // all build the SAME object. Letting any of them default would
    // give the player a different sword in the preview panel than the
    // one in their hand.
    const seed = itemDef.seed || itemDef.id || '';
    const metal = itemDef.metal || null;
    this._meleeWeaponMesh = forgeWeapon(weaponType, element, tierLevel, seed, metal);
    // Offset from the wand rather than stacked exactly on top of it —
    // both stay visible on the (mostly-hidden) body rig.
    this._meleeWeaponMesh.position.x = 0.07;
    this.weaponGroup.add(this._meleeWeaponMesh);

    eventBus.emit(Events.UI_NOTIFY, `Equipped ${itemDef.name} — ATK: ${power}`);
    eventBus.emit(Events.PLAYER_EQUIP_WEAPON, { weaponType, element, tierLevel, seed, metal, name: itemDef.name });
  }

  /**
   * Put the weapon away — nothing forged is in hand any more.
   *
   * The mirror of equipWeapon(), and it did not exist: unequipping the
   * last weapon left both the body-rig mesh AND the whole `weaponAtk`
   * contribution standing, so a player who took their Memory off kept
   * swinging its damage with a ghost of it still hanging on the rig.
   *
   * ⚠️ `weaponAtk` goes back to the WAND's figure, not to 0 and not to
   * the unarmed floor — the Fracture Wand is always in hand and never
   * swapped, so it is what you fall back to. Zeroing it (or dropping
   * to PLAYER_BASE_ATK) would make taking a Memory off strictly worse
   * than never having forged one. recomputeStats() stays the sole
   * writer of `stats.atk` (trap #9).
   */
  clearWeapon() {
    this.equippedWeapon = null;
    this.weaponAtk = this._wandAtk ?? PLAYER_BASE_ATK;
    this.recomputeStats();
    if (this._meleeWeaponMesh) {
      this.weaponGroup.remove(this._meleeWeaponMesh);
      disposeTree(this._meleeWeaponMesh);
      this._meleeWeaponMesh = null;
    }
    eventBus.emit(Events.PLAYER_EQUIP_WEAPON, { weaponType: null, element: null, tierLevel: 0, name: null });
  }

  /**
   * Tint the worn body — the visible half of "you are wearing this".
   *
   * Shared by ordinary armour (equipArmor) and by woven Raiment, which
   * is uncapped and so cannot go through `armorTokens` at all. Pass
   * `null` to strip back to the robe the Pioneer actually owns.
   *
   * ⚠️ The bare material is REMEMBERED the first time a mesh is
   * tinted, and only then. This used to overwrite `c.material`
   * outright keeping nothing, so the cloth was destroyed by the first
   * piece of armour and could never come back — which is why taking
   * armour off had no visual at all. Guarded on absence, not assigned
   * every pass: otherwise a second piece "remembers" the FIRST
   * piece's tint as the original and the robe drifts a colour per
   * equip.
   */
  applyWornTint(color) {
    if (!this.mesh) return;
    // Held props (the wand, and a forged weapon if one is equipped)
    // keep their own materials — a worn tint is for cloth and metal,
    // not for what is in the hand. Checked by actual containment, not
    // by name: the wand's own parts were never named 'weapon', so that
    // exclusion never actually caught anything.
    const isHeldProp = (c) =>
      (this.weapon && this.weapon.getObjectById(c.id)) ||
      (this._meleeWeaponMesh && this._meleeWeaponMesh.getObjectById(c.id));

    if (color === null || color === undefined) {
      this.mesh.traverse(c => {
        if (c.isMesh && c.userData.bareMaterial !== undefined) {
          c.material = c.userData.bareMaterial;
          delete c.userData.bareMaterial;
        }
      });
      return;
    }

    // Explicit roughness/metalness (leather/worn-cloth range) instead
    // of the old shininess:80 hint — that mapped to roughness 0.2, far
    // glossier than the robe/leather surfaces this actually tints.
    const tintMat = sceneManager.createToonMaterial(color, { roughness: 0.7, metalness: 0.05 });
    this.mesh.traverse(c => {
      if (c.isMesh && !isHeldProp(c) && c.material.color) {
        if (c.userData.bareMaterial === undefined) c.userData.bareMaterial = c.material;
        c.material = tintMat;
      }
    });
  }

  equipArmor(slot, itemDef) {
    if (!itemDef || !['head', 'chest', 'legs'].includes(slot)) return;
    this.armorTokens[slot] = itemDef;
    
    // Recalculate defense
    let combinedColor = 0xc0c0c0; // Default tint

    for (const key in this.armorTokens) {
      if (this.armorTokens[key]) {
        // Simplistic color mixing: let's tint based on armor tier
        const tc = this.armorTokens[key].tier?.color;
        if (tc) combinedColor = new THREE.Color(tc).getHex();
      }
    }

    this.recomputeStats();
    this.applyWornTint(combinedColor);

    // ⚠️ This read `totalDef`, which is a LOCAL of recomputeStats() —
    // so every single call to equipArmor() threw
    // `ReferenceError: totalDef is not defined` on this line, AFTER
    // storing the token and tinting the mesh but BEFORE the
    // PLAYER_EQUIP_VISUAL emit below. The character-preview panel
    // therefore never saw a single piece of armour anyone equipped,
    // and no notification ever appeared. It never surfaced as a
    // visible failure because the throw happened inside a UI click
    // handler — exactly the shape of trap #15. Read the field that
    // recomputeStats() (the SOLE writer, called two lines up) just
    // published instead of trying to recompute it here.
    eventBus.emit(Events.UI_NOTIFY, `Equipped ${itemDef.name} — DEF: ${this.stats.def}`);
    // The character preview panel (CharacterPreviewUI.js) owns a
    // completely separate rig instance so it isn't sitting inside the
    // hidden first-person body — it can't traverse this.mesh, so it
    // needs the resolved colour handed to it instead.
    eventBus.emit(Events.PLAYER_EQUIP_VISUAL, { color: combinedColor });
  }

  /**
   * Take a piece off. The mirror of equipArmor(), and — like
   * clearWeapon() — it simply did not exist, so nothing worn could
   * ever come back off: the token stayed in `armorTokens` forever and
   * kept paying its defence.
   *
   * ⚠️ Re-tints through equipArmor()'s own path when something is
   * still worn, so the two never disagree about the resolved colour;
   * only a fully bare Pioneer takes the reset branch.
   */
  unequipArmor(slot) {
    if (!['head', 'chest', 'legs'].includes(slot)) return null;
    const was = this.armorTokens[slot];
    if (!was) return null;
    this.armorTokens[slot] = null;
    this.recomputeStats();

    const stillWorn = Object.keys(this.armorTokens).find(k => this.armorTokens[k]);
    if (stillWorn) {
      // Re-run the same resolve/tint with what remains.
      const keep = this.armorTokens[stillWorn];
      this.armorTokens[stillWorn] = null;
      this.equipArmor(stillWorn, keep);
    } else {
      // Bare again — put the robe's own materials back.
      this.applyWornTint(null);
      eventBus.emit(Events.PLAYER_EQUIP_VISUAL, { color: null });
    }
    eventBus.emit(Events.UI_NOTIFY, `Removed ${was.name} — DEF: ${this.stats.def}`);
    return was;
  }

  /**
   * Per-frame update. Order matters: move, then settle onto the
   * ground, then resolve combat and casting, then regenerate, and
   * only then push the result into the mesh.
   */
  update(dt, chunkManager, colliders) {
    if (this.isDead) return;

    this._handleMovement(dt, colliders);
    this._handleGravity(dt, chunkManager);
    this._handleCombat(dt);
    this._handleSpells(dt);
    this._regenStats(dt);
    this._updateAnimation(dt);
    this._updateMesh();
  }

  _handleMovement(dt, colliders) {
    if (this.isAttacking || this.isDodging) return;
    const moveInput = input.getMovementVector();
    const isSprinting = input.isSprinting() && this.stamina > 0;

    const prevX = this.position.x;
    const prevZ = this.position.z;

    // Velocity eases toward a target instead of snapping to it. The old
    // version set velocity to full speed in a single frame on input,
    // then decayed it with a flat `*0.85` per CALL (not per second) on
    // release — instant-on read as robotic, and the release decay was
    // frame-rate dependent (a stutter or the lag we just fixed would
    // change how "grippy" stopping felt run to run). This is proper
    // dt-scaled exponential easing: ACCEL_RATE/DECEL_RATE are chosen so
    // full speed arrives in ~70ms (still snappy, not floaty) and a stop
    // settles in ~110ms (a hint of weight, not a dead-stop teleport),
    // and it now behaves identically regardless of frame rate.
    let targetVX = 0, targetVZ = 0;

    if (moveInput.x !== 0 || moveInput.z !== 0) {
      const forward = cameraController.getForwardDirection();
      const right = cameraController.getRightDirection();
      this.moveDirection.set(forward.x * moveInput.z + right.x * moveInput.x, 0, forward.z * moveInput.z + right.z * moveInput.x).normalize();
      // Fleetfoot (wind mastery) — a flat speed bonus, sprinting or not.
      const masterySpeedMult = attunement.hasMastery('wind') ? 1.15 : 1;
      // The Long-Walker moves a little faster than anyone sensible.
      // ⚠️ A factor folded in here, never an assignment to a stored
      // speed — same rule every other grant in this project follows.
      const epithetSpeed = epithetSystem.grant('moveMult', 1);
      // The First Nightmare's Quickened (+14%) / Heavy-Footed (−9%).
      // Another factor folded at the point of use, for the same reason
      // as the two beside it.
      const innateSpeed = this.innateMoveMult || 1;
      // Blocking or charging a heavy slows you (CombatSystem publishes it).
      // Water drags: up to −45% wading, about half speed swimming.
      const waterMult = this.isSwimming ? 0.55 : 1 - Math.min(0.45, (this.waterDepth || 0) * 0.42);
      const combatMult = (Number.isFinite(this.combatMoveMult) ? this.combatMoveMult : 1) * waterMult;
      const speed = PLAYER.MOVE_SPEED * (isSprinting && combatMult >= 1 ? PLAYER.SPRINT_MULTIPLIER : 1)
        * masterySpeedMult * epithetSpeed * innateSpeed * combatMult;
      targetVX = this.moveDirection.x * speed;
      targetVZ = this.moveDirection.z * speed;
      if (isSprinting) {
        this.stamina -= PLAYER.STAMINA_SPRINT_COST * dt;
        this.stamina = Math.max(0, this.stamina);
      }
      this.animState = isSprinting ? 'run' : 'walk';
    } else {
      this.animState = 'idle';
    }

    const accelerating = targetVX !== 0 || targetVZ !== 0;
    const rate = accelerating ? PLAYER.MOVE_ACCEL_RATE : PLAYER.MOVE_DECEL_RATE;
    const ease = 1 - Math.exp(-rate * dt);
    this.velocity.x += (targetVX - this.velocity.x) * ease;
    this.velocity.z += (targetVZ - this.velocity.z) * ease;
    if (!accelerating) {
      if (Math.abs(this.velocity.x) < 0.01) this.velocity.x = 0;
      if (Math.abs(this.velocity.z) < 0.01) this.velocity.z = 0;
    }
    // First-person: you face where you look, full stop — not where
    // you're walking. That's what makes strafing and circle-strafing
    // possible at all, and it's how every FPS handles facing. No
    // smoothing needed either; the camera's own mouse look is already
    // 1:1, so a lagged body rotation behind it would just look wrong
    // on the rare thing (a shadow, a hit direction) that still reads
    // it.
    this.rotation = cameraController.yaw;
    if (input.isJumping() && this.isGrounded) {
      this.velocity.y = PLAYER.JUMP_FORCE;
      this.isGrounded = false;
      this.animState = 'jump';
    }
    if (input.isDodging() && this.stamina >= 8 && !this.isDodging) this._startDodge();

    // Apply movement
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    // Check Collisions
    if (colliders && colliders.length > 0) {
      this._checkBuildingCollisions(prevX, prevZ, colliders);
    }
  }

  /**
   * Resolve collision against world props.
   *
   * ⚠️ THIS USED TO BE THE "I AM STUCK" BUG, and it had three causes
   * stacked on top of each other. All three are fixed here; do not
   * simplify this back toward the old shape.
   *
   *   1. FULL REVERT. The old version did `position.x = prevX;
   *      position.z = prevZ` on ANY overlap — a hard stop, not a
   *      slide. Brushing a corner while running along a wall killed
   *      all movement, and every wall felt like flypaper.
   *
   *   2. NO ESCAPE. Worse, a full revert is unrecoverable if you are
   *      ALREADY inside a box: `prev` is inside too, so every axis is
   *      rejected forever and the player is permanently frozen with no
   *      way out but reloading. This happens for real — props are
   *      placed by hash and by hand, spawn is at the origin, and the
   *      hub's own well sat close enough to it to trap you.
   *
   *   3. FULL-HEIGHT BOXES. A prop's Box3 spans its whole height, so
   *      the flared base of a monolith, the skirt of a ruin or the
   *      guy-ropes of a stall blocked you at chest height even where
   *      there was clearly a gap to walk through.
   *
   * Now: per-axis resolution (so you slide along walls), a depenetration
   * push if you start inside something, and a vertical test so you can
   * walk over anything below step height and under anything above your
   * head.
   */
  _checkBuildingCollisions(prevX, prevZ, colliders) {
    // Slimmer than the old 0.3: the player is a person, not a crate,
    // and this radius is also what decides whether you fit between two
    // props placed a metre apart.
    const R = 0.28;
    const STEP = 0.6;          // anything lower than this you walk over
    const HEAD = 1.85;         // anything higher than this you walk under
    const feet = this.position.y;
    const head = feet + HEAD;

    const hits = [];
    for (const entry of colliders) {
      const b = entry.box;
      // Vertical reject first — cheapest, and it removes most of the
      // false blocks described in (3) above.
      if (b.max.y < feet + STEP) continue;   // low enough to step onto
      if (b.min.y > head) continue;          // high enough to duck under
      // Cheap AABB-vs-circle broadphase in the XZ plane.
      if (this.position.x + R < b.min.x || this.position.x - R > b.max.x) continue;
      if (this.position.z + R < b.min.z || this.position.z - R > b.max.z) continue;
      hits.push(b);
    }
    if (!hits.length) return;

    // ── Were we already inside at the START of this frame? ──
    // If so there is no safe `prev` to fall back to, and reverting
    // would trap us forever (cause 2). Push out along the shallowest
    // axis instead — the shortest path back to open ground.
    const stuckAtPrev = hits.some(b =>
      prevX + R > b.min.x && prevX - R < b.max.x &&
      prevZ + R > b.min.z && prevZ - R < b.max.z);

    if (stuckAtPrev) {
      const b = hits[0];
      const dxMin = (this.position.x - R) - b.min.x;  // push west
      const dxMax = b.max.x - (this.position.x + R);  // push east
      const dzMin = (this.position.z - R) - b.min.z;
      const dzMax = b.max.z - (this.position.z + R);
      const m = Math.min(dxMin, dxMax, dzMin, dzMax);
      if (m === dxMin)      this.position.x = b.min.x - R - 0.01;
      else if (m === dxMax) this.position.x = b.max.x + R + 0.01;
      else if (m === dzMin) this.position.z = b.min.z - R - 0.01;
      else                  this.position.z = b.max.z + R + 0.01;
      this.velocity.x = 0;
      this.velocity.z = 0;
      return;
    }

    // ── Per-axis resolution, so walls are slid along, not stuck to ──
    // X first: keep the new Z, revert only X, and see if that is clear.
    const blocked = (x, z) => hits.some(b =>
      x + R > b.min.x && x - R < b.max.x &&
      z + R > b.min.z && z - R < b.max.z);

    if (!blocked(prevX, this.position.z)) {
      this.position.x = prevX;
      this.velocity.x = 0;
    } else if (!blocked(this.position.x, prevZ)) {
      this.position.z = prevZ;
      this.velocity.z = 0;
    } else {
      // Genuinely cornered — both axes blocked. Only now is a full
      // revert correct, and `prev` is known-good because stuckAtPrev
      // was false.
      this.position.x = prevX;
      this.position.z = prevZ;
      this.velocity.x = 0;
      this.velocity.z = 0;
    }
  }

  _handleGravity(dt, chunkManager) {
    const wasGrounded = this.isGrounded;
    this.velocity.y += PLAYER.GRAVITY * dt;
    this.position.y += this.velocity.y * dt;
    // ANALYTIC ground height, not a raycast.
    //
    // This used to be `raycaster.intersectObject(terrainGroup, true)`
    // every single frame — walking the BVH of a ~93,000-triangle
    // terrain set to find a number the terrain generator can compute
    // directly in O(1). See ChunkManager.getGroundY() for the full
    // reasoning. Same value, a fraction of the cost, and it works even
    // where a chunk has not finished streaming in.
    // WATER (world/Hydrology.js): getWaterAt also yields the ground, so
    // this costs no extra height evaluation. Wading slows you by depth
    // (see the move code); past SWIM_DEPTH the water holds you up, eyes
    // just above the surface, with a slow bob — you swim.
    const SWIM_DEPTH = 1.35;
    const wat = chunkManager?.getWaterAt ? chunkManager.getWaterAt(this.position.x, this.position.z) : null;
    let ground = chunkManager ? (chunkManager.getWaterAt ? chunkManager.lastGroundY : chunkManager.getGroundY(this.position.x, this.position.z)) : null;
    // ⚠️ Stand on the DRAWN surface where a chunk mesh exists (see
    // ChunkManager.getMeshGroundY) — the function and the mesh differ by
    // up to metres on rough or coarse ground, and standing on the
    // function let the visible ground rise over the camera.
    const meshY = chunkManager?.getMeshGroundY?.(this.position.x, this.position.z);
    if (meshY != null && isFinite(meshY) && ground != null) ground = meshY;
    this.waterDepth = wat ? wat.surf - ground : 0;
    this.waterSurf = wat ? wat.surf : -Infinity;
    this.isSwimming = this.waterDepth > SWIM_DEPTH;
    if (this.isSwimming) ground = wat.surf - SWIM_DEPTH + Math.sin(performance.now() * 0.0016) * 0.04;
    if (ground !== null && isFinite(ground)) {
      {
        this.groundY = ground;
        if (this.position.y <= this.groundY) {
          const impactSpeed = -this.velocity.y; // positive = how hard we hit
          this.position.y = this.groundY;
          this.velocity.y = 0;
          this.isGrounded = true;
          // A real fall landing hard reads as a felt impact through the
          // first-person camera instead of a silent snap onto the ground.
          if (!wasGrounded && impactSpeed > CAMERA.LAND_SHAKE_VELOCITY) {
            const t = Math.min(1, (impactSpeed - CAMERA.LAND_SHAKE_VELOCITY) / 12);
            cameraController.shake(0.05 + t * 0.22, 0.18 + t * 0.12);
          }
        } else {
          this.isGrounded = false;
        }
      }
    }
    if (this.position.y < -50) {
      this.position.set(0, 10, 0);
      this.velocity.set(0, 0, 0);
    }
  }

  _handleCombat(dt) {
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.isAttacking) {
      this.attackTimer -= dt;
      this.attackElapsed += dt;
      const progress = Math.min(1, this.attackElapsed / Math.max(0.05, this.attackTotal));
      this.rightArm.rotation.x = -Math.sin(progress * Math.PI) * 1.5; 
      this.rightArm.rotation.y = Math.sin(progress * Math.PI) * 1.5 - 0.5; 
      if (this.attackTimer <= 0) {
        this.isAttacking = false;
        this.rightArm.rotation.x = 0;
        this.rightArm.rotation.y = 0; 
      }
    }
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.comboCount = 0;
    }
    if (this.isDodging) {
      this.dodgeTimer -= dt;
      this.iFrames -= dt;
      this.position.x += this.dodgeDirection.x * (this._stepSpeed || 9.5) * dt;
      this.position.z += this.dodgeDirection.z * (this._stepSpeed || 9.5) * dt;
      if (this.dodgeTimer <= 0) this.isDodging = false;
    }
    // ⚠️ Attacks are no longer fired here. systems/CombatSystem.js reads
    // the mouse (tap = light, hold-and-release = heavy, RMB = block/parry)
    // and calls performAttack(); holding LMB used to auto-repeat swings,
    // which is half of why a fight read as noise.
  }

  /**
   * Swing. `kind` 'light' (the four-beat combo) or 'heavy' (charged:
   * slower, harder, staggers). `charge` 0..1 for a heavy. Called by
   * CombatSystem, which has already checked and spent the stamina.
   */
  performAttack(kind = 'light', charge = 0, windMult = 1) {
    if (this.attackCooldown > 0 || this.isDodging) return false;
    this.attackKind = kind;
    this.heavyCharge = kind === 'heavy' ? charge : 0;
    this._performAttack();
    // STEEL: the line's own windup (an overhead is slower than a thrust)
    // and a wounded sword arm (CombatSystem publishes steelSwingMult).
    const m = (windMult || 1) * (this.steelSwingMult || 1);
    if (m !== 1) { this.attackCooldown *= m; this.attackTotal = Math.max(0.2, this.attackCooldown * 0.96); this.attackTimer = this.attackTotal; }
    if (kind === 'heavy') {
      // A heavy commits: longer, and it does not advance the light combo.
      this.attackCooldown *= 1.55;
      this.attackTotal = Math.max(0.3, this.attackCooldown * 0.96);
      this.attackTimer = this.attackTotal;
      this.comboCount = (this.comboCount + 3) % 4;
    }
    return true;
  }

  _performAttack() {
    this.isAttacking = true;
    this.attackElapsed = 0;
    // ⚠️ Cleared on every swing so checkCombatCollisions' once-per-swing
    // latch re-arms. Without this the FIRST swing of the session would
    // land and nothing after it ever would.
    this._swingResolved = false;
    // ── HOW FAST THIS PARTICULAR WEAPON COMES ROUND ──
    // `weaponSpeed` is published by main.js from WEAPON_MELEE whenever
    // the weapon in hand changes — a dagger at 0.44 swings more than
    // four times as often as a warhammer at 1.95, and that ratio is
    // the single biggest reason two weapon types feel different to
    // hold. Read as a factor with a default of 1 so the unarmed and
    // wand-only paths are exactly unchanged.
    const weaponSpeed = Number.isFinite(this.weaponSpeed) ? this.weaponSpeed : 1;
    // Quickened (a shrine Boon) — published as a factor, folded here.
    const haste = 1 - (boonSystem.grantOf?.('haste', 0) || 0);
    // Live Wire (lightning mastery) — faster hands, melee and wand alike.
    this.attackCooldown = PLAYER.ATTACK_COOLDOWN * PACE.playerSwing * weaponSpeed * haste
      * (attunement.hasMastery('lightning') ? 0.8 : 1);
    // ⚠️ The swing lasts as long as the weapon's cooldown (realism pass):
    // the animation's wind-up, strike, follow-through and recovery all
    // fit inside it, and the hit resolves at its impact frame
    // (windupFrac, published by main.js). Was a flat 0.3 s for every
    // weapon, with damage at 0.05 s.
    this.attackTotal = Math.max(0.2, this.attackCooldown * 0.96);
    this.attackTimer = this.attackTotal;
    this.comboCount = (this.comboCount + 1) % 4;
    this.comboTimer = Math.max(0.8, this.attackTotal + 0.6);
    this.animState = 'attack';
    cameraController.shake(0.08, 0.1);
    audioSystem.playSwing();
    eventBus.emit(Events.PLAYER_ATTACK, {
      position: this.position.clone(),
      direction: new THREE.Vector3(Math.sin(this.rotation), 0, Math.cos(this.rotation)),
      combo: this.comboCount,
      range: PLAYER.ATTACK_RANGE,
    });
  }

  _startDodge() {
    // ⚠️ STEEL: a STEP, not a roll. No invincibility at all (owner: "no
    // rolls") — you evade by leaving a committed blow's arc, so the step
    // is short and quick and the timing is everything.
    this.isDodging = true;
    this.dodgeTimer = 0.18;
    this.iFrames = 0;
    this._stepSpeed = 9.5 * (this.steelStepMult || 1);
    this.stamina -= 14;
    combatSystem.noteStep();
    const moveInput = input.getMovementVector();
    if (moveInput.x !== 0 || moveInput.z !== 0) {
      const forward = cameraController.getForwardDirection();
      const right = cameraController.getRightDirection();
      this.dodgeDirection.set(forward.x * moveInput.z + right.x * moveInput.x, 0, forward.z * moveInput.z + right.z * moveInput.x).normalize();
    } else {
      this.dodgeDirection.set(-Math.sin(this.rotation), 0, -Math.cos(this.rotation));
    }
    this.animState = 'dodge';
    eventBus.emit(Events.COMBAT_DODGE);
  }

  _handleSpells(dt) {
    for (let i = 0; i < this.abilityCooldowns.length; i++) {
      if (this.abilityCooldowns[i] > 0) this.abilityCooldowns[i] = Math.max(0, this.abilityCooldowns[i] - dt);
    }
    // Z / X / C — the three path abilities chosen at character
    // creation. Moved off Digit1-3, which now belong entirely to the
    // wand hotbar (see main.js/WandUI): the two systems reading the
    // same keys was exactly what made casting feel like it was firing
    // the wrong thing — pressing "1" both cast an ability AND
    // re-pointed the wand's active slot in the same frame.
    // ⚠️ STEEL: Z/X/C are the weapon family's techniques now
    // (CombatSystem). The path spells are gone with the spell bar.
  }

  _castSpell(slotIndex) {
    if (this.abilityCooldowns[slotIndex] > 0) return;

    const skillId = this.skills[slotIndex] ? (this.skills[slotIndex].id || this.skills[slotIndex]) : null;
    if (!skillId) return;

    const skillDef = SKILLS[skillId];
    if (!skillDef) return;

    if (this.mp < skillDef.cost) {
      eventBus.emit(Events.UI_NOTIFY, "Not enough MP!");
      return;
    }

    this.abilityCooldowns[slotIndex] = skillDef.cooldown || 2;

    // UI Feedback
    const slots = document.querySelectorAll('.hotbar-ability');
    if (slots[slotIndex]) {
      slots[slotIndex].classList.add('active');
      setTimeout(() => slots[slotIndex].classList.remove('active'), 200);
    }

    this.mp -= skillDef.cost;
    eventBus.emit(Events.UI_NOTIFY, `Cast: ${skillDef.name}`);

    // Dispatch effect based on skill type or explicit ID
    if (skillId === 'fireball' || skillId === 'dark_blast') {
      // ⚠️ Was a hardcoded orange/purple pair, so every class skill
      // looked like the same bolt regardless of what the caster is made
      // of. Uses the player's live attunement instead — the same value
      // that already drives the wand's shard and the viewmodel tint —
      // so the projectile matches the Pioneer casting it.
      const el = this._attunedElement || (skillId === 'fireball' ? 'fire' : 'arcane');
      const color = ELEMENT_COLORS[el]
        ? parseInt(ELEMENT_COLORS[el].replace('#', ''), 16)
        : (skillId === 'fireball' ? 0xff4411 : 0xaa11ff);
      this._shootFireball(color, 35, el);
    } else if (skillId === 'heal') {
      this.heal(40);
      this.playerLight.color.setHex(0x00ff00);
      // Back to whatever the Leaning currently reads as, not to a
      // fixed class colour — the light is one of the ambient cues for
      // which way the player has drifted.
      setTimeout(() => this.playerLight.color.setHex(leaning.tint()), 800);
    } else if (skillId === 'dash') {
      this._startDodge();
      this.velocity.multiplyScalar(2.0);
    } else if (skillDef.type === 'melee' || skillDef.type === 'defense') {
      this.attackCooldown = 0; // force attack
      this._performAttack();
    } else {
      // Generic fallback
      this._shootFireball(0x00ffff, 15);
    }
  }

  _shootFireball(colorHex, dmg = 0, element = null) {
    // Aim direction (pitch included) — spells go where you're actually
    // looking now, not always dead level regardless of camera tilt.
    const dir = cameraController.getAimDirection();
    const spawnPos = this.position.clone().add(new THREE.Vector3(0, CAMERA.EYE_HEIGHT, 0)).add(dir.clone().multiplyScalar(1.0));
    const damage = dmg || this.stats.atk || 25;
    // colorHex used to be computed by the caller and then never
    // actually forwarded — every skill-cast bolt rendered fire-orange
    // regardless of its real element (Dark Blast included).
    projectileManager.spawnFireball(spawnPos, dir, damage * 1.5, colorHex, element);
    projectileManager.spawnMuzzleFlash(spawnPos, colorHex);
    cameraController.shake(0.055, 0.1);
    this.isAttacking = true;
    this.attackTimer = 0.2;
    this.attackElapsed = 0;
    this.attackTotal = 0.2;
    this.animState = 'attack';
    if (this.leftArm) this.leftArm.rotation.x = -Math.PI / 2;
  }

  _animateHeldWand(t) {
    if (this.weapon) animateWand(this.weapon, t);
    if (this._meleeWeaponMesh) animateWeapon(this._meleeWeaponMesh, t);
  }

  _regenStats(dt) {
    if (!input.isSprinting() && !this.isDodging) {
      // Tireless (+60%) / Short-Winded (−30%), from the First Nightmare.
      const innateStam = this.innateStamMult || 1;
      this.stamina = Math.min(this.maxStamina,
        this.stamina + PLAYER.STAMINA_REGEN * innateStam * (this.steelStaminaRegenMult || 1) * dt);
    }
    // Undertow (water mastery) — mana comes back noticeably faster.
    // ⚠️ FOCUS: mana and Essence are one pool now (CoreSystem routes its
    // Essence to `mp`), so it refills at the rate the faster of the two
    // used to — ~3/s at 80 — times the old Essence gain grants.
    const mpRate = (attunement.hasMastery('water') ? 1.6 : 1) * (this.innateEssenceMult || 1);
    this.mp = Math.min(this.maxMp, this.mp + (2 + this.maxMp * 0.012) * mpRate * dt);

    // Radiant Pulse (light mastery) — the only source of passive HP
    // regen in the game, deliberately gated behind mastering light
    // specifically rather than being a base-kit thing everyone gets.
    if (attunement.hasMastery('light') && this.hp > 0 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + 1.5 * dt);
    }
  }

  _updateAnimation(dt) {
    this.animTimer += dt;

    // ══════════════════════════════════════════════════
    // ⚠️ THE REAL RIG HAS ITS OWN ANIMATION SYSTEM, AND NOTHING WAS
    //    DRIVING IT.
    //
    // `_forgeRealPioneer` builds an AnimationMixer, plays `Idle`, and
    // hands back `leftLeg`/`rightLeg`/`leftArm`/`rightArm` as EMPTY
    // DUMMY GROUPS (its own doc comment says so) — so the procedural
    // limb-swing below was rotating four detached objects that are not
    // attached to anything, while the mixer that actually poses the
    // skeleton was never ticked by anyone. Enemies tick theirs
    // (Enemy.js), chunk props tick theirs (ChunkManager) — the player
    // was the one rig in the game frozen on frame one of Idle.
    //
    // `animateCreature` already contains a complete locomotion state
    // machine (Idle / Walking_A / Running_A with crossfades) that
    // self-detects speed. Reusing it means the player and every
    // creature share one animation path rather than a second one that
    // drifts out of agreement.
    // ══════════════════════════════════════════════════
    const rig = this.rig?.group;
    if (rig?.userData?.isRealModel) {
      // ⚠️ The idle bob inside animateCreature does `position.y +=`,
      // which is safe for an enemy because the spawner rewrites its
      // mesh position from `this.position` every frame. NOTHING
      // rewrites the player rig's LOCAL position, so the same line
      // integrates a sine forever and the body slowly sinks into the
      // floor. Re-seat the base each frame and let the bob apply on
      // top of it.
      if (rig.userData.fpBaseY === undefined) rig.userData.fpBaseY = rig.position.y;
      rig.position.y = rig.userData.fpBaseY;
      animateCreature(rig, dt, this.animTimer, 0,
        this.isAttacking ? 'strike' : 'none');
      return;
    }

    if (this.animState === 'walk' || this.animState === 'run') {
      const spd = this.animState === 'run' ? 12 : 8;
      const bobAmount = this.animState === 'run' ? 0.08 : 0.04;
      if (this.mesh) this.mesh.position.y = this.position.y + Math.abs(Math.sin(this.animTimer * spd)) * bobAmount;
      const swing = Math.sin(this.animTimer * spd) * 0.8;
      
      // Defensive limb checks
      if (this.rightArm) this.rightArm.rotation.x = this.isAttacking ? this.rightArm.rotation.x : swing;
      if (this.leftArm) this.leftArm.rotation.x = -swing;
      if (this.rightLeg) this.rightLeg.rotation.x = -swing;
      if (this.leftLeg) this.leftLeg.rotation.x = swing;
    } else {
      if (this.mesh) this.mesh.scale.y = 1 + Math.sin(this.animTimer * 2) * 0.01;
      const decay = dt * 5;
      if (this.rightArm && !this.isAttacking) this.rightArm.rotation.x += (0 - this.rightArm.rotation.x) * decay;
      if (this.leftArm) this.leftArm.rotation.x += (0 - this.leftArm.rotation.x) * decay;
      if (this.rightLeg) this.rightLeg.rotation.x += (0 - this.rightLeg.rotation.x) * decay;
      if (this.leftLeg) this.leftLeg.rotation.x += (0 - this.leftLeg.rotation.x) * decay;
    }
  }

  _updateMesh() {
    if (!this.mesh) return;
    this.mesh.position.x = this.position.x;
    if (this.animState !== 'walk' && this.animState !== 'run') this.mesh.position.y = this.position.y;
    this.mesh.position.z = this.position.z;
    this.mesh.rotation.y = this.rotation;
    this.playerLight.intensity = 0.4 + Math.sin(this.animTimer * 3) * 0.15;
  }

  /**
   * ⚠️ Damage and healing are both SANITISED, and HP is clamped at
   * BOTH ends. Neither was true, and all four failure modes were
   * reachable from live damage maths:
   *
   *   takeDamage(-100) → hp 50 becomes **150**, above maxHp. Any
   *     multiplier chain that goes negative (a resist above 1, a
   *     rank cap on a negative base) heals the target instead.
   *   takeDamage(NaN)  → hp becomes NaN, `Math.max(0, NaN)` is NaN,
   *     and `hp <= 0` is false forever — the player becomes immortal
   *     AND their bar renders empty. Silent, permanent, and produced
   *     by any `0/0` or `undefined` anywhere in the damage chain.
   *   heal(-100)       → hp 50 becomes **-50**.
   *   heal(NaN)        → same permanent poisoning.
   *
   * A resource this central cannot trust its callers.
   */
  _sanitiseHp() {
    if (!Number.isFinite(this.hp)) this.hp = 0;
    this.hp = Math.max(0, Math.min(this.maxHp, this.hp));
  }

  // ══════════════════════════════════════════════════════════
  // ⚠️ DEFENCE, AND WHY IT LIVES HERE
  //
  // `stats.def` was WRITTEN AND NEVER READ for the life of the
  // project. `recomputeStats()` kept it honest, armour and Raiment
  // both fed it, the satchel printed it, and NOTHING anywhere applied
  // it to incoming damage — so every piece of armour in the game was
  // a number that changed a readout. HANDOFF §7 lists this as an open
  // gap and calls it "a real balance change, left for the owner".
  //
  // It is applied at `takeDamage` because that is the SINGLE FUNNEL
  // every source of player damage passes through. Applying it at the
  // call sites instead would mean each new damage source has to
  // remember, and the one that forgets is invisible — the same
  // reasoning that put the Leaning multiplier at the COMBAT_HIT
  // handler rather than at each attack (trap #12).
  //
  // ── THE CURVE ─────────────────────────────────────────────
  //   reduction = def / (def + SOFTNESS),  hard-capped at DEF_CAP
  //
  // Diminishing returns, so stacking Raiment always helps and never
  // trivialises. At the values this game actually produces:
  //     def  10 (bare)          →  8% less damage
  //     def  54 (4 Raiment)     → 33%
  //     def 100                 → 48%
  //     def 250                 → 69%, approaching the cap
  //
  // ⚠️ THE CAP IS NOT DECORATION. Without it a high enough `def`
  // asymptotically reaches 100% and the player becomes unkillable —
  // and `def` has four independent contributors (base, level, armour
  // tokens, uncapped Raiment), so nothing else bounds it. Raiment
  // being UNCAPPED by design is exactly what makes a cap here
  // mandatory rather than defensive.
  //
  // ⚠️ NaN-guarded. `def` is recomputed from four sources and this
  // project has been bitten by NaN propagating through a resource
  // (see _sanitiseHp above): a NaN reduction would make `dmg` NaN,
  // and `hp <= 0` is false forever after that — silent immortality.
  // ══════════════════════════════════════════════════════════
  static DEF_SOFTNESS = 110;
  static DEF_CAP = 0.70;

  /** How much of an incoming blow this Pioneer's armour turns aside, 0..DEF_CAP. */
  damageReduction() {
    const def = Number(this.stats?.def);
    if (!Number.isFinite(def) || def <= 0) return 0;
    return Math.min(Player.DEF_CAP, def / (def + Player.DEF_SOFTNESS));
  }

  /**
   * @param {object} [opts]
   * @param {boolean} [opts.ignoreArmour] for damage that is not a blow —
   *   see the wand's unstable-surge self-damage. Armour cannot turn
   *   aside your own magic going wrong, and letting it would remove
   *   the risk that mechanic exists to create.
   */
  takeDamage(amount, source = null, opts = {}) {
    if (this.iFrames > 0) return;
    const raw = Number(amount);
    if (!Number.isFinite(raw) || raw <= 0) return;   // not damage
    const reduction = opts.ignoreArmour ? 0 : this.damageReduction();
    // ⚠️ Floored at 1. A blow that lands for 0 reads as a miss, and
    // "my armour is so good nothing happens" is indistinguishable from
    // "the enemy's attack is broken".
    const dmg = Math.max(1, Math.round(raw * (1 - reduction)));
    this.hp -= dmg;
    this._sanitiseHp();
    cameraController.shake(0.2, 0.2);
    eventBus.emit(Events.PLAYER_DAMAGED, { amount: dmg, raw, reduction, source, hp: this.hp });
    // ⚠️ The MITIGATED number, so the floater agrees with the health
    // bar. Showing the raw hit while the bar moved less would read as
    // the bar being wrong.
    eventBus.emit(Events.UI_DAMAGE_NUMBER, { position: this.position.clone(), amount: dmg, type: 'damage' });
    if (this.hp <= 0 && !this.isDead) this._die();
  }

  heal(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;   // not healing
    this.hp += n;
    this._sanitiseHp();
    eventBus.emit(Events.PLAYER_HEAL, { amount: n, hp: this.hp });
  }

  _die() {
    if (this.isDead) return;
    this.isDead = true;
    
    console.log('[Player] Died!');
    eventBus.emit(Events.PLAYER_DEATH, { position: this.position.clone() });
    
    setTimeout(() => {
      // Used to fully restore — dying cost nothing but a 3-second
      // wait. Respawning shaken instead: half vitals, so walking
      // straight back into whatever killed you is genuinely risky
      // rather than free.
      this.hp = Math.max(1, Math.floor(this.maxHp * 0.5));
      this.mp = Math.floor(this.maxMp * 0.5);
      this.stamina = Math.floor(this.maxStamina * 0.5);
      this.position.set(0, 10, 0);
      this.velocity.set(0, 0, 0);
      this.isDead = false;
    }, 3000);
  }

  /**
   * There are no levels. Killing things does not make your numbers
   * bigger — it gives you the material to change what you are made
   * of, and that is where power lives now.
   *
   * Kept as a no-op shim so older call sites don't throw while the
   * rest of the game moves over to attunement.
   */
  gainXP() { /* deliberately nothing — see AttunementSystem.js */ }
}

export const player = new Player();
