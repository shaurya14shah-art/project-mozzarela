// ══════════════════════════════════════════════════════════
// NPC — Interactive Non-Player Character
//
// Previously a BoxGeometry body + a bright peach-cube head — the
// exact "crude colored box" look the rest of the cast (Pioneer,
// creatures) got rebuilt away from long ago. Rebuilt on the same
// silhouette language as the Pioneer (forgePioneer in EntityForge.js):
// a tapered-cylinder robe, a cone hood, and — for the two named
// characters — a real posture and face treatment that actually tells
// you who they are before you've read a line of dialogue.
//
// Three role reads, one shared shape vocabulary:
//   ELDER    stooped, shorter, warm rust robe, a real (if desaturated
//            and shadowed) face, a walking stick. Reads as "person."
//   RIVAL    tall, straight, sharp hood, oversized pauldrons, a
//            void-hollow face with two ember eyes — the one place
//            this file spends its "dread" budget, and only here.
//   VILLAGER small, plain, neutral palette, ordinary face. Wallpaper
//            on purpose — the void-hollow stops meaning anything if
//            everyone gets it.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { sceneManager } from '../rendering/SceneManager.js';
import { eventBus, Events } from '../core/EventBus.js';
import { ELEMENT_COLORS, ELEMENTS } from '../data/constants.js';
import { questSystem } from '../systems/QuestSystem.js';
// ⚠️ Read-only here. NPC.js must never MUTATE progression — it asks
// what the player is known for and says something about it.
import { epithetSystem } from '../systems/EpithetSystem.js';
import { ascentSystem } from '../systems/AscentSystem.js';
import { sceneUI } from '../ui/SceneUI.js';

import { seg, icoDetail } from '../rendering/GeoForge.js';
import { modelLibrary } from '../rendering/ModelLibrary.js';
const hex = (css) => parseInt((css || '#888888').replace('#', ''), 16);

// Materials are fully determined by (role, part) — cache them the same
// way EntityForge.js caches shell/accent/core, so spawning a dozen
// villagers across a settlement doesn't mean a dozen throwaway shader
// compiles for materials that are all identical anyway.
const _matCache = new Map();
function cached(key, build) {
  if (!_matCache.has(key)) _matCache.set(key, build());
  return _matCache.get(key);
}

const PALETTES = {
  elder:    { robeDark: 0x2e2318, robeMid: 0x3a2e1e, patch: 0x4a3c26, metal: 0xc9a24e, face: 0xaa9a82 },
  rival:    { robeDark: 0x201c28, robeMid: 0x2a2436, patch: 0x352d44, metal: 0xc9a24e, face: null /* void */ },
  villager: { robeDark: 0x28241f, robeMid: 0x332e27, patch: 0x3a352c, metal: 0x8f8168, face: 0xb0a290 },
};

function mat(role, part, color, extra = {}) {
  return cached(`${role}:${part}`, () => new THREE.MeshStandardMaterial({
    color, roughness: 0.85, metalness: 0.05, flatShading: true, ...extra,
  }));
}

export class NPC {
  constructor(id, config) {
    this.id = id;
    this.name = config.name || 'Citizen';
    this.role = config.role || 'Villager';
    this.variant = config.variant || 'villager';
    // Either a flat legacy dialog array, or a stage-gated table —
    // {stage, lines}[] — read against the live main-quest stage so
    // the Elder and the rival actually have something new to say as
    // the story moves, instead of two lines repeated forever.
    this.dialog = config.dialog || null;
    this.dialogueByStage = config.dialogueByStage || null;
    // The world remembers what you chose at mq7 — once
    // QuestSystem.epilogueChoice is set, this table (keyed the same
    // way: 'aris' | 'self' | 'ostra') takes over from the normal
    // stage dialogue for good, instead of repeating the last stage's
    // lines forever.
    this.postFinaleDialogue = config.postFinaleDialogue || null;
    // A side quest this NPC has something to say about, once it's
    // done — small-scale NPC memory: {questId, lines}.
    this.reactsTo = config.reactsTo || null;
    this.questId = config.questId || null;
    // The Gate-Warden knows where the Descents are — see
    // data/sanctuary.js. Talking to them reveals nearby Gates.
    this.scoutsDescents = !!config.scoutsDescents;
    this.element = config.element || ELEMENTS.SHADOW;

    this.position = config.position.clone();
    this.rotation = config.rotation || 0;
    this.mesh = null;

    this._createMesh();
  }

  /**
   * ⚠️ A GREETING, not a replacement.
   *
   * Prepended to whatever the NPC was already going to say, so the
   * quest chain, the side-quest reactions and the finale dialogue all
   * still work exactly as written. Making reactivity a fourth branch
   * of the precedence chain below would have meant a Pioneer with an
   * Epithet stopped being able to hear mq3, which is how a "richer"
   * NPC system quietly breaks the main story.
   *
   * ⚠️ The Sanctuary cast are ORDINARY PEOPLE (§2): "nobody is
   * mysterious... a shopkeeper does not have a philosophy." So they
   * react to what they can SEE — a name you are known by, how deep
   * you have obviously been — and never to your Leaning, which is an
   * internal fact about you that no quartermaster could read.
   */
  _greeting() {
    const title = epithetSystem.title?.();
    if (title && Math.random() < 0.5) {
      return `${title}. I had heard.`;
    }
    const rank = ascentSystem.tier ?? 0;
    if (rank >= 3 && Math.random() < 0.4) {
      return 'You have been further down than I want to think about.';
    }
    return null;
  }

  _currentLines() {
    if (this.postFinaleDialogue && questSystem.epilogueChoice) {
      return this.postFinaleDialogue[questSystem.epilogueChoice] || [];
    }
    if (this.reactsTo && questSystem.isSideQuestComplete?.(this.reactsTo.questId)) {
      return this.reactsTo.lines;
    }
    if (this.dialogueByStage?.length) {
      const stage = Math.min(questSystem.currentQuestIndex ?? 0, this.dialogueByStage.length - 1);
      const entry = this.dialogueByStage.find(d => d.stage === stage) || this.dialogueByStage[this.dialogueByStage.length - 1];
      return entry?.lines || [];
    }
    return this.dialog || ['...'];
  }

  _createMesh() {
    this.mesh = new THREE.Group();
    const pal = PALETTES[this.variant] || PALETTES.villager;

    // ⚠️ REALISM PASS: real people (rendering/Wanderer.js — RŌNIN's
    // Mesh2Motion body, dressed) whenever the HD body loaded; the old
    // primitive builds (a cylinder robe, a cone hood, a sphere face)
    // only as the fallback for builds without it.
    const outfit = this.variant === 'elder' ? 'elder' : this.variant === 'rival' ? 'rival' : 'keeper';
    const inst = modelLibrary.isReady(`model:Wanderer_${outfit}`) ? modelLibrary.instantiate(`model:Wanderer_${outfit}`) : null;
    if (inst) {
      const body = inst.group;
      const h = outfit === 'elder' ? 1.68 : outfit === 'rival' ? 1.84 : 1.76;
      const box = new THREE.Box3().setFromObject(body);
      body.scale.setScalar(h / Math.max(0.1, box.max.y - box.min.y));
      this.mesh.add(body);
      this._mixer = inst.mixer;
      const idle = inst.actions.get('Idle');
      if (idle) { idle.play(); idle.time = Math.random() * idle.getClip().duration; }
    } else if (this.variant === 'elder') this._buildElder(pal);
    else if (this.variant === 'rival') this._buildRival(pal);
    else this._buildVillager(pal);

    // Interaction Prompt Float (invisible by default, driven by UI)
    const promptGeo = new THREE.PlaneGeometry(0.5, 0.2);
    const promptMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    this.promptMesh = new THREE.Mesh(promptGeo, promptMat);
    this.promptMesh.position.y = 1.7;
    this.mesh.add(this.promptMesh);

    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.rotation;
    this.mesh.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    sceneManager.add(this.mesh);
  }

  /** Stooped, shorter, a real (aged, shadowed) face, a walking stick. */
  _buildElder(pal) {
    const dark = mat('elder', 'dark', pal.robeDark);
    const mid = mat('elder', 'mid', pal.robeMid);
    const patch = mat('elder', 'patch', pal.patch);
    const metal = mat('elder', 'metal', pal.metal, { roughness: 0.35, metalness: 0.85 });
    // Face is a head, not drapery — smooth vertex normals so the low
    // vertex count reads as an aged face, not a cut gem (robe/hood
    // stay flat, that's the deliberate cloth read). Roughness nudged
    // into skin range instead of the flat default's cloth-rough 0.9.
    const faceM = mat('elder', 'face', pal.face, { roughness: 0.55, flatShading: false });

    const posture = new THREE.Group();
    posture.rotation.x = 0.14; // stooped forward at the hips
    this.mesh.add(posture);

    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.68, 1.32, seg(8)), dark);
    robe.position.y = 0.68;
    posture.add(robe);

    const hem = new THREE.Mesh(new THREE.ConeGeometry(0.74, 0.3, seg(8), seg(1), true), mid);
    hem.position.y = 0.05;
    hem.rotation.x = Math.PI;
    posture.add(hem);

    // Mended-cloth patch — a cheap material cue, not new silhouette.
    const patchMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.04), patch);
    patchMesh.position.set(0.3, 0.9, 0.34);
    patchMesh.rotation.set(0.1, 0.3, 0.1);
    posture.add(patchMesh);

    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.5, seg(7)), mid);
    chest.position.y = 1.5;
    posture.add(chest);

    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.045, seg(5), seg(12)), metal);
    belt.position.y = 1.28;
    belt.rotation.x = Math.PI / 2;
    posture.add(belt);

    // Low, drooping hood — most of the face sits in its own shadow.
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.5, seg(7)), dark);
    hood.position.y = 1.94;
    hood.rotation.x = 0.32;
    posture.add(hood);

    const face = new THREE.Mesh(new THREE.SphereGeometry(0.2, seg(10), seg(8)), faceM);
    face.position.set(0, 1.82, 0.09);
    posture.add(face);

    // Shoulders: a touch narrower/lower than the Pioneer's — age, not authority.
    for (const side of [-1, 1]) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.16, seg(6)), mid);
      pad.position.set(side * 0.32, 1.66, 0);
      pad.rotation.z = side * 0.45;
      posture.add(pad);
    }

    // Walking stick — the one accent piece, held at an angle.
    const stick = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 1.1, seg(5)), mat('elder', 'stick', 0x241c14));
    pole.position.y = 0.55;
    stick.add(pole);
    const knob = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, icoDetail(0)), metal);
    knob.position.y = 1.12;
    stick.add(knob);
    stick.position.set(0.42, 0.05, 0.1);
    stick.rotation.z = -0.22;
    posture.add(stick);

    this.mesh.userData.eyeless = false;
  }

  /** Tall, straight, sharp hood, oversized pauldrons, void-hollow face. */
  _buildRival(pal) {
    const dark = mat('rival', 'dark', pal.robeDark);
    const mid = mat('rival', 'mid', pal.robeMid);
    const metal = mat('rival', 'metal', pal.metal, { roughness: 0.35, metalness: 0.85 });
    // Matches the Pioneer's own void face (EntityForge.js forgePioneer):
    // smooth, not flat — a featureless hollow reads as a void precisely
    // because it catches light as one continuous dark surface, not as
    // facets.
    const voidFace = mat('rival', 'void', 0x05040a, { roughness: 1.0, metalness: 0.0, flatShading: false });
    const ember = new THREE.MeshStandardMaterial({
      color: hex(ELEMENT_COLORS[this.element]),
      emissive: hex(ELEMENT_COLORS[this.element]),
      emissiveIntensity: 0.9,
      roughness: 0.2, metalness: 0,
    });

    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.82, 1.7, seg(8)), dark);
    robe.position.y = 0.85;
    this.mesh.add(robe);

    const hem = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.4, seg(8), seg(1), true), mid);
    hem.position.y = 0.2;
    hem.rotation.x = Math.PI;
    this.mesh.add(hem);

    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.44, 0.7, seg(7)), mid);
    chest.position.y = 1.96;
    this.mesh.add(chest);

    // Chest insignia — mirrors the Pioneer's belt buckle, the one rank cue.
    const insignia = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, seg(5), seg(12)), metal);
    insignia.position.set(0, 2.0, 0.42);
    this.mesh.add(insignia);

    // Sharper, taller hood — a real capirote angle, outranks the Pioneer's own.
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.98, seg(7)), dark);
    hood.position.y = 2.72;
    this.mesh.add(hood);

    const face = new THREE.Mesh(new THREE.SphereGeometry(0.24, seg(10), seg(8)), voidFace);
    face.position.set(0, 2.38, 0.07);
    this.mesh.add(face);

    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, seg(6), seg(6)), ember);
      eye.position.set(side * 0.09, 2.4, 0.24);
      eye.name = 'rival-eye';
      this.mesh.add(eye);
    }
    const light = new THREE.PointLight(hex(ELEMENT_COLORS[this.element]), 0.5, 3);
    light.position.set(0, 2.4, 0.2);
    this.mesh.add(light);

    // Oversized pauldrons — the cheap, fast "this one outranks you" tell.
    for (const side of [-1, 1]) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.26, seg(6)), mid);
      pad.position.set(side * 0.5, 2.18, 0);
      pad.rotation.z = side * 0.55;
      this.mesh.add(pad);
    }

    this.mesh.userData.eyeless = true;
  }

  /** Small, plain, ordinary — wallpaper on purpose. */
  _buildVillager(pal) {
    const dark = mat('villager', 'dark', pal.robeDark);
    const mid = mat('villager', 'mid', pal.robeMid);
    const faceM = mat('villager', 'face', pal.face, { roughness: 0.55, flatShading: false });

    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.56, 1.1, seg(7)), dark);
    robe.position.y = 0.6;
    this.mesh.add(robe);

    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.3, 0.4, seg(6)), mid);
    chest.position.y = 1.32;
    this.mesh.add(chest);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, seg(9), seg(7)), faceM);
    head.position.y = 1.62;
    this.mesh.add(head);

    for (const side of [-1, 1]) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.13, seg(6)), mid);
      pad.position.set(side * 0.26, 1.48, 0);
      this.mesh.add(pad);
    }
  }

  update(dt, playerPos) {
    const dist = this.position.distanceTo(playerPos);
    if (this._mixer) this._mixer.update(dt);

    // Face player if close
    if (dist < 4) {
      const dir = playerPos.clone().sub(this.position);
      const targetRot = Math.atan2(dir.x, dir.z);
      this.mesh.rotation.y += (targetRot - this.mesh.rotation.y) * dt * 5;
    } else {
      this.mesh.rotation.y += (this.rotation - this.mesh.rotation.y) * dt * 2;
    }

    // ══════════════════════════════════════════════════
    // ⚠️ THEY WERE HOVERING.
    //
    // The old line was `position.y = position.y + sin(Date.now()) * 0.05`
    // — every NPC in the Sanctuary drifting five centimetres up and
    // down off the ground, forever, in unison. A robed figure with no
    // legs is fine standing still; the same figure bobbing is a ghost.
    // Owner: "no animation of the humans walking and all that."
    //
    // ⚠️ `Date.now()` also meant every NPC shared one phase, so the
    // whole cast rose and fell together like a breathing crowd. Each
    // now has its own offset, seeded from its id.
    //
    // These are robe cylinders with NO LIMBS (see _buildVillager), so
    // a walk cycle is not available without new geometry. What IS
    // available is weight: they stay planted on the ground and shift
    // like someone who has been standing a while.
    // ══════════════════════════════════════════════════
    this._idlePhase ??= (this.id ? this.id.length * 1.7 : 0) + this.position.x * 0.31;
    const t = this._idleT = (this._idleT || 0) + dt;
    const p = t + this._idlePhase;

    // Feet stay on the ground. Breathing is a scale, not a levitation.
    this.mesh.position.y = this.position.y;
    this.mesh.scale.y = 1 + Math.sin(p * 1.15) * 0.012;
    // A slow weight shift from one foot to the other.
    this.mesh.rotation.z = Math.sin(p * 0.42) * 0.018;
  }

  interact() {
    const lines = this._currentLines();
    const greet = this._greeting();
    // ══════════════════════════════════════════════════
    // ⚠️ A SCENE, NOT TOASTS.
    //
    // This used to fire `UI_NOTIFY` for line one and a `setTimeout`
    // 2.6s later for line two — so Aris's forty years of doubt
    // arrived as two corner popups, at a pace the player did not
    // control, competing with item pickups and damage numbers, and
    // unrecoverable once they faded. See ui/SceneUI.js.
    //
    // ⚠️ The events below still fire EXACTLY as before. The quest
    // chain must not depend on the player having watched anything —
    // that is the same rule SceneUI's `skip()` follows.
    // ══════════════════════════════════════════════════
    sceneUI.say(this.name, greet ? [greet, ...lines] : lines);
    // Fired for EVERY NPC, quest-giver or not — the tutorial's "speak
    // with three of its people" counts ordinary townsfolk, and
    // NPC_QUEST_TRIGGER below only fires for the handful who carry a
    // questId. Two events because they answer two different questions.
    eventBus.emit(Events.NPC_INTERACT, {
      npcId: this.id, name: this.name, scoutsDescents: this.scoutsDescents,
    });
    if (this.questId) {
      eventBus.emit(Events.NPC_QUEST_TRIGGER, { npcId: this.id, questId: this.questId });
    }
  }

  destroy() {
    if (this.mesh) {
      sceneManager.remove(this.mesh);
      this.mesh = null;
    }
  }
}
