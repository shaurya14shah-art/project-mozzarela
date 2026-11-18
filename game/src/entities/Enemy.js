// ══════════════════════════════════════════════════════════
// Enemy — Basic Enemy Entity with AI
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { sceneManager } from '../rendering/SceneManager.js';
import { eventBus, Events } from '../core/EventBus.js';
import { pickupManager } from './Pickup.js';
import { MATERIALS, DROPS } from '../data/materials.js';
import {
  forgeCreature, animateCreature,
  playCreatureHit, playCreatureDeath, tickCreatureMixer,
} from '../rendering/EntityForge.js';
import { composition, makeBody } from '../systems/CompositionSystem.js';
import { saturation } from '../systems/SaturationSystem.js';

// Set by EnemySpawner on construction, so a detonating composition can
// reach the creatures standing near it without threading a reference
// through every call site.
let activeSpawner = null;
import { cameraController } from '../rendering/CameraController.js';
import { PACE } from '../data/constants.js';
import { particleBursts } from '../rendering/ParticleBursts.js';
import { audioSystem } from '../systems/AudioSystem.js';

import { NEW_CREATURES, BIOME_LIFE } from '../data/expansion.js';
import { getItem } from '../data/itemRegistry.js';
export const ENEMY_TYPES = [
  { id: 'slime', name: 'The Seep', cls: 'Pitch Ooze', hp: 28, atk: 18, def: 12, speed: 2, xp: 15, scale: 0.72 },
  { id: 'skeleton', name: 'Hollowed Pilgrim', cls: 'The Hollowed', hp: 55, atk: 65, def: 44, speed: 3.2, xp: 40, scale: 0.85 },
  { id: 'goblin', name: 'Ash Scavenger', cls: 'Hollowed Scavenger', hp: 44, atk: 56, def: 28, speed: 4.5, xp: 25, scale: 0.8 },
  { id: 'vampire', name: 'Lord Ivel Marrowmere', cls: 'Pale Lord', hp: 80, atk: 86, def: 55, speed: 5.0, xp: 120, scale: 0.9 },
  { id: 'spider', name: 'Skitterhusk', cls: 'Husk Spider', hp: 70, atk: 76, def: 62, speed: 4.8, xp: 85, scale: 0.8 },
  { id: 'wraith', name: 'The Unspoken', cls: 'Veiled One', hp: 60, atk: 90, def: 30, speed: 4.2, xp: 100, scale: 1.0 },
  { id: 'dragon', name: 'Xartharael', cls: 'Ancient Wyrm', hp: 999, atk: 150, def: 120, speed: 6.0, xp: 5000, scale: 1.2 },
  { id: 'golem', name: 'Gravewall Brute', cls: 'Bulwark', hp: 110, atk: 60, def: 85, speed: 1.5, xp: 95, scale: 1.1 },
  { id: 'ice_elemental', name: 'Rimeshade', cls: 'Frost Shade', hp: 65, atk: 70, def: 40, speed: 3.0, xp: 75, scale: 1.0 },
  { id: 'sandworm', name: 'The Burrower', cls: 'Sand Wyrm', hp: 90, atk: 85, def: 50, speed: 5.5, xp: 110, scale: 1.3 },
  // Two undead the Fracture keeps re-lighting. Both read as risen
  // dead like the skeleton, but split its one role in two: the
  // acolyte is slow and hits hard at range's edge, the stalker is
  // fragile and fast enough that ignoring it is a mistake.
  { id: 'bone_acolyte', name: 'Ossuary Acolyte', cls: 'Veiled Acolyte', hp: 62, atk: 82, def: 34, speed: 2.6, xp: 90, scale: 0.9 },
  { id: 'grave_stalker', name: 'Lychgate Stalker', cls: 'Hollowed Stalker', hp: 48, atk: 72, def: 26, speed: 5.6, xp: 80, scale: 0.85 },
  // ⚠️ The world expansion's creatures (data/expansion.js) are APPENDED,
  // so the twelve indices above — which biomes, Descents and saves name
  // — never move.
  ...NEW_CREATURES,
];
/** Index of a creature id in ENEMY_TYPES (−1 if unknown). */
export const typeIndexOf = (id) => ENEMY_TYPES.findIndex(t => t.id === id);

// ══════════════════════════════════════════════════════════
// TACTICS — what a creature does instead of walking at you
//
// ── WHY THIS EXISTS ───────────────────────────────────────
// Owner: "the game feels very hollow... make fights require thought."
//
// Every creature in this game used one AI: walk directly at the
// player, stop at 1.8m, wind up, hit. Twelve species, twelve stat
// blocks, one behaviour — so the only decision a fight ever asked was
// whether to keep holding left-click.
//
// A TACTIC changes the SHAPE of the approach, not its numbers:
//
//   brawler   walks in and commits. The honest baseline.
//   flanker   refuses to approach head-on; circles to your side
//             first, so facing one is not the same as facing it.
//   skirmisher closes, strikes, and BACKS OFF out of your reach —
//             the one that punishes standing still.
//   ranged    holds a distance and throws. Chasing it is the fight.
//   armoured  slow and shielded from the FRONT, so you have to get
//             around it rather than out-damage it.
//   pack      weak alone; measurably stronger with its own kind
//             nearby, so thinning them is better than duelling them.
//
// ⚠️ These are assigned per SPECIES, not rolled. A goblin has to be a
// goblin every time or the player cannot learn anything, and a fight
// you cannot learn is a fight you cannot think about — which is the
// whole complaint.
//
// ⚠️ Each tactic only changes `_chase`'s target point and, for
// `armoured`/`pack`, a damage factor. None of them forks the state
// machine. A second AI is a second thing to keep in agreement forever
// (the same reason `friendly` reuses this one).
// ══════════════════════════════════════════════════════════
export const TACTICS = {
  brawler:    { approach: 'direct' },
  flanker:    { approach: 'flank',  flankAngle: 1.15 },
  skirmisher: { approach: 'direct', backOff: 4.2, backOffFor: 1.3 },
  ranged:     { approach: 'hold',   holdAt: 9.5, volleyEvery: 2.6 },
  armoured:   { approach: 'direct', frontalResist: 0.55 },
  pack:       { approach: 'flank',  flankAngle: 0.7, packRadius: 9, packBonus: 0.16 },
};

/** ⚠️ Per species, never rolled. See the note above. */
const TACTIC_FOR = {
  slime: 'brawler',
  skeleton: 'brawler',
  goblin: 'pack',
  vampire: 'flanker',
  spider: 'skirmisher',
  wraith: 'flanker',
  dragon: 'ranged',
  golem: 'armoured',
  ice_elemental: 'ranged',
  sandworm: 'skirmisher',
  bone_acolyte: 'ranged',
  grave_stalker: 'skirmisher',
};

export class Enemy {
  /** The enemy the HUD's target bar is naming (set by ui/CombatHUD.js). */
  static hudTarget = null;
  /**
   * `opts` lets a story beat forge a NAMED unique out of an ordinary
   * species — Vell, the wraith mq6 sends you after, is still just a
   * wraith underneath (same AI, same drops), but reads as an actual
   * character: its own name tag, boosted stats, a bit bigger.
   */
  constructor(type, position, level = 1, opts = {}) {
    const template = ENEMY_TYPES[type % ENEMY_TYPES.length];

    this.id = Math.random().toString(36).slice(2, 9);
    this.typeId = template.id;
    this.name = opts.name || template.name;
    this._clsLabel = opts.cls || template.cls;
    this.isBoss = !!opts.isBoss;
    // True for anything forged deliberately rather than by the ambient
    // wander-spawner — Descent waves, Wardens, Vell. Peace mode culls
    // the ambient population and must never touch these.
    this.isNamed = !!opts.name || !!opts.isBoss || !!opts.hpMult;
    this.level = level;

    // ══════════════════════════════════════════════════════
    // ⚠️ `friendly` WAS WRITTEN IN THREE PLACES AND READ IN NONE.
    //
    // `SpoilsSystem._callEcho()`, the `summon`/`swarm` Aspects and the
    // devoured-Warden path all passed `friendly: true` into this
    // constructor, which quietly dropped it — so EVERY summon in the
    // game spawned an ordinary hostile that immediately hunted the
    // player. Measured: calling an Echo took the player from
    // **100 HP to 0 in four seconds.** `despawnAt` was the same —
    // written by `_callEcho`, read by nothing, so a called Echo was
    // also permanent.
    //
    // The whole Echo fantasy ("something that comes when called, and
    // goes back after") was therefore inverted: it came when called
    // and killed you, and never went back.
    //
    // ⚠️ A friendly reuses the ENTIRE hostile state machine. It is not
    // a second AI — it is the same one pointed at a different focus
    // (`focusPos` in update(), fed by the spawner's _retargetAllies).
    // Writing a parallel companion AI would be a second thing to keep
    // in agreement forever, which is the mistake this project keeps
    // recording.
    // ══════════════════════════════════════════════════════
    // ── Tactic ──────────────────────────────────────────
    // ⚠️ A friendly companion is always a `brawler`. The tactics are
    // written from the assumption that their target is the player —
    // a flanker circling to your side is a threat; an ALLY doing it
    // is a companion that never quite reaches the thing it is meant
    // to be fighting.
    this.tacticId = opts.friendly ? 'brawler' : (TACTIC_FOR[this.typeId] || 'brawler');
    this.tactic = TACTICS[this.tacticId];
    /** Set while a skirmisher is retreating after a hit. */
    this._backOff = 0;
    this._volleyTimer = 0;
    // Which side this one circles to — fixed per creature, so two
    // flankers split rather than both going the same way.
    this._flankSide = (Math.random() < 0.5) ? -1 : 1;

    /** Index into ENEMY_TYPES (CombatSystem spawns a spider's brood with it). */
    this.typeIndex = type;
    // ⚠️ WORLD EXPANSION: how it behaves toward you (data/expansion.js).
    // skittish = flees, never attacks · defensive = flees until hurt ·
    // ambush = hidden until you are close · blind = only hears noise.
    this.temper = template.temper || 'hostile';
    this._hurtAt = -1e9;
    this._sprung = false;
    this._sink = 0;
    this.friendly = !!opts.friendly;
    /** Absolute seconds (performance.now()/1000) after which it goes back, or null for permanent. */
    this.despawnAt = opts.despawnAt ?? null;
    /** The hostile a friendly is currently fighting. Resolved by the spawner each frame. */
    this._target = null;
    // How close a friendly settles when it has nothing to fight and is
    // just walking with you. Without this it closes to `attackRange`
    // and stands inside your face.
    this.escortRange = 3.4;

    // ⚠️ STEEL: NO STAT INFLATION (owner: "technique & steel"). Level
    // used to add 30% HP and attack per step; a deep creature is now
    // dangerous through SKILL (CombatSystem reads level as how well it
    // guards, reads your stance and deflects) and only a little tougher.
    // The callers' multipliers (Descent tiers, Wardens) are compressed
    // the same way, so a Tier-5 Warden is a harder fighter, not a wall.
    const levelMult = 1 + Math.min(14, level - 1) * 0.035;
    const soften = (m) => 1 + ((m || 1) - 1) * 0.35;
    this.maxHp = Math.floor(template.hp * levelMult * soften(opts.hpMult));
    this.hp = this.maxHp;
    // ⚠️ STEEL_DAMAGE: the template numbers (18–150) were tuned for the old
    // levelled HP and were held down by the First Nightmare's cap; with
    // that gone a pilgrim hit for 68 of 160 blood. Scaled so an ordinary
    // blow is a CUT (~10–18% of blood) and only big things leave deep wounds.
    const STEEL_DAMAGE = 0.32;
    this.atk = Math.max(3, Math.floor(template.atk * STEEL_DAMAGE * (1 + Math.min(14, level - 1) * 0.025) * soften(opts.atkMult)));
    this.speed = template.speed * PACE.enemySpeed;   // see PACE in data/constants.js
    this.xp = Math.floor(template.xp * levelMult);
    this._scaleMult = opts.scaleMult || 1;

    this.position = position.clone();
    this.velocity = new THREE.Vector3();
    this.rotation = 0;

    // AI state
    this.state = 'idle'; // idle, patrol, chase, attack, flee, dead
    this.stateTimer = 0;
    this.patrolTarget = null;
    this.aggroRange = 12;
    this.attackRange = 1.8;
    this.attackCooldown = 0;
    this.attackSpeed = 1.5 * PACE.enemyCooldown;
    // Attack telegraph — windup (visible tell) -> strike (hit resolves)
    // -> recover. The old version dealt damage the instant cooldown
    // hit 0, with no warning at all, which made i-frames/dodge
    // pointless: there was nothing to react to. Windup scales with
    // speed so heavier creatures (golem) telegraph longer than fast
    // ones (goblin) — a bit of free characterisation.
    this.attackState = 'none'; // none, windup, strike, recover
    this.attackStateTimer = 0;
    // Telegraph longer (PACE.windup): readable, so a dodge is a decision.
    this.windupTime = Math.max(0.22, Math.min(0.5, 0.58 - template.speed * 0.045)) * PACE.windup;
    this.recoverTime = 0.22 * PACE.recover;
    // Hit-stun — getting hit now visibly interrupts whatever the
    // creature was doing instead of it fighting on unfazed.
    this.hitStun = 0;
    // Frostbite (ice mastery, see AttunementSystem.js) — a real slow,
    // not a damage tick, applied on hit from main.js/Projectile.js.
    this.slowTimer = 0;
    this.slowMult = 1;

    // Visual
    this.mesh = null;
    this.uiGroup = null;
    this._createMesh(template);

    this.alive = true;
    this.raycaster = new THREE.Raycaster();
    this.deathTimer = 0;
  }

  _createMesh(template) {
    this.scale = template.scale * this._scaleMult;

    // What it is made of decides both how it fights and how it looks.
    this.body = makeBody(this.typeId);

    this.mesh = forgeCreature(this.typeId, this.body.dominant, this.scale);
    this.mesh.rotation.order = 'YXZ';   // yaw first, so the windup lean is in its own frame
    this.mesh.position.copy(this.position);
    sceneManager.add(this.mesh);

    this._animTime = Math.random() * 10;

    // No HP bar. Strain is read off the creature's own glow — see
    // animateCreature() — which keeps the fantasy of *reading* a
    // composition rather than watching a number drain.
    this._setupUI(template);
  }

  _setupUI(template) {
    const scale = this.scale;
    const uiY = 2.8 * scale;

    // No HP bar — deliberately. TargetReadUI and Enemy.js's own header
    // comment both already say so ("keeps the fantasy of *reading* a
    // composition rather than watching a number drain"), but a floating
    // HP bar was being built and kept in sync here anyway on every
    // single enemy, contradicting that design outright. The name tag
    // stays; the bar doesn't.
    this.nameTag = this._createNameTag(this.name, this._clsLabel);
    this.nameTag.position.y = uiY;

    this.uiGroup = new THREE.Group();
    this.uiGroup.add(this.nameTag);
    this.mesh.add(this.uiGroup);
  }

  _createNameTag(name, cls) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 128;

    // Stats/Level info
    const levelStr = `Lv.${this.level}`;

    // Background for better readability
    const drawRoundRect = (ctx, x, y, w, h, r) => {
      if (ctx.roundRect) {
        ctx.roundRect(x, y, w, h, r);
      } else {
        // Simple fallback if roundRect is absent
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.closePath();
      }
    };

    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    drawRoundRect(ctx, 64, 10, 384, 108, 20);
    ctx.fill();

    // Text Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;

    // Name
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(name, 256, 60);

    // Class/Level
    ctx.fillStyle = '#ffcc00';
    ctx.font = '28px Rajdhani, sans-serif';
    ctx.fillText(cls, 256, 95);   // no level: STEEL has none

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true; // CRITICAL: Ensure the texture is sent to the GPU
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true,   // not through walls (was false: names floated through rock)
      depthWrite: false,
      opacity: 0.85,
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(1.0, 0.25, 1);   // smaller (was 1.5 × 0.38)
    sprite.renderOrder = 999; // Ensure it renders on top
    return sprite;
  }

  update(dt, playerPos, chunkManager) {
    if (!this.alive) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) {
        this.destroy();
      }
      return;
    }

    this.attackCooldown -= dt;
    this.stateTimer -= dt;
    if (this.slowTimer > 0) this.slowTimer -= dt;

    // The creature's own life, plus its strain readout — the core
    // burns brighter and its parts shake as it nears coming apart.
    this._animTime += dt;
    const strainRatio = this.body
      ? Math.min(1, this.body.strain / this.body.tolerance)
      : 0;
    animateCreature(this.mesh, dt, this._animTime, strainRatio, this.attackState);

    // ⚠️ Stashed so `_chase`'s ranged branch can do a REAL line-of-sight
    // test. `_hasLineOfSight` returns TRUE when handed no chunkManager
    // — a safe default for melee, and completely wrong for a creature
    // that throws: it would shoot you through a hill from 9m away and
    // there would be nothing you could do about it.
    this._chunks = chunkManager;

    // ⚠️ A friendly goes back on its own. Checked BEFORE the AI runs,
    // so an expiring Echo cannot land one last hit on its way out.
    if (this.despawnAt !== null && (performance.now() / 1000) >= this.despawnAt) {
      this.dismiss();
      return;
    }

    // ── WHAT THIS CREATURE IS POINTED AT ────────────────
    // A hostile is pointed at the player. A friendly is pointed at
    // whatever hostile the spawner handed it, and falls back to
    // escorting the player when there is nothing to fight. Every
    // state below reads `focusPos`/`distToFocus`, so one substitution
    // turns the whole hostile state machine into a companion's.
    const focusPos = (this.friendly && this._target?.alive)
      ? this._target.position
      : playerPos;
    const distToFocus = this.position.distanceTo(focusPos);
    // Kept for the escort check and the distance cull, which both ask
    // about the PLAYER specifically regardless of what this is fighting.
    const distToPlayer = this.position.distanceTo(playerPos);
    // Name tags only where they help: near, and not on the enemy the
    // top-centre target bar already names (ui/CombatHUD.js sets
    // Enemy.hudTarget). They were drawn on every enemy at any range,
    // through walls — clutter that also told you nothing new.
    // ⚠️ STEEL HUD pass: no floating name boards at all — they smeared into
    // dark boxes in motion and only repeated the target bar. You read the body.
    if (this.nameTag) this.nameTag.visible = false;

    // Hit-stun freezes the AI outright — no movement, no attack
    // progress — so getting hit reads as an actual interruption
    // instead of the creature fighting on through it.
    this._held = false;
    if (!this.friendly && this.temper !== 'hostile') this._temperament(dt, distToPlayer);
    if (this.hitStun > 0) {
      this.hitStun -= dt;
      this.velocity.x = 0;
      this.velocity.z = 0;
    } else if (!this._held) {
      // AI state machine
      switch (this.state) {
        case 'idle':
          this._idle(dt, distToFocus);
          break;
        case 'patrol':
          this._patrol(dt, distToFocus);
          break;
        case 'chase': {
          // ⚠️ STEEL turn-taking: one presses you, the rest circle at a
          // distance until it is their turn (CombatSystem sets waitTurn).
          if (this.waitTurn > 0 && distToFocus < 5 && !this.friendly) {
            this.waitTurn -= dt;
            const away = this.position.clone().sub(focusPos).setY(0).normalize();
            const tang = new THREE.Vector3(-away.z, 0, away.x).multiplyScalar(this._flankSide);
            const want = (4.2 - distToFocus) * 0.8;
            const v = tang.multiplyScalar(this.effectiveSpeed() * 0.55).addScaledVector(away, want);
            this.velocity.set(v.x, 0, v.z);
            this.rotation = Math.atan2(-away.x, -away.z);
            break;
          }
          // ⚠️ Inside a Descent dungeon `nav` is set (DescentSystem): with
          // no clear floor line to the target it hands back the next
          // waypoint of a flow field, so a creature walks the corridors
          // instead of grinding into the wall between you. Never close
          // enough to strike while it is still routing round a wall.
          let goal = focusPos, dist = distToFocus;
          if (this.nav && !this.friendly) {
            this._navPt = this._navPt || new THREE.Vector3();
            if (this.nav(this.position, focusPos, this._navPt)) {
              this._navPt.y = this.position.y;
              goal = this._navPt;
              dist = Math.max(distToFocus, this.attackRange + 0.5);
            }
          }
          this._chase(dt, goal, dist);
          break;
        }
        case 'attack':
          this._attack(dt, focusPos, distToFocus, chunkManager);
          break;
        case 'flee':
          this._flee(dt, focusPos);
          break;
      }
    }

    // Apply Grounding / Gravity
    if (chunkManager) {
      this._handleGravity(dt, chunkManager);
    }

    // Apply velocity
    this.position.add(this.velocity.clone().multiplyScalar(dt));
    this.mesh.position.copy(this.position);
    if (this._sink) this.mesh.position.y -= this._sink;   // an ambusher lying low
    this.mesh.rotation.y = this.rotation;
    if (this.attackState === 'none' && this.mesh.rotation.x) this.mesh.rotation.x *= 0.85;   // a cancelled lean settles

    // Billboard UI (face camera)
    if (this.uiGroup && cameraController.camera) {
      this.uiGroup.quaternion.copy(cameraController.camera.quaternion);
    }

    // Subtle breathing/floating for certain types
    // ⚠️ Keyed on the type ID, never the display name (trap #11): this
    // compared against 'Gloopus' and 'Soul Reaver', so renaming either
    // creature would have silently switched it off. The wraith no longer
    // floats — since the realism pass it is a robed person on the ground.
    if (this.typeId === 'slime') {
      this.mesh.position.y += Math.sin(Date.now() * 0.003) * 0.02;
    }
  }

  /**
   * ⚠️ WORLD EXPANSION — animals are not all monsters. Runs before the
   * state machine and overrides it for the non-hostile temperaments.
   */
  _temperament(dt, distToPlayer) {
    const now = performance.now() / 1000;
    const hurt = now - this._hurtAt < 12;
    const t = this.temper;
    if (t === 'skittish' || (t === 'defensive' && !hurt)) {
      const startle = hurt ? 32 : 13;
      if (distToPlayer < startle) {
        if (this.state !== 'flee') { this.state = 'flee'; this.stateTimer = 2.5; }
        this.stateTimer = Math.max(this.stateTimer, 0.6);
      } else if (this.state === 'chase' || this.state === 'attack') { this.state = 'patrol'; this.stateTimer = 0; }
      this.attackState = 'none';
      return;
    }
    if (t === 'ambush') {
      if (!this._sprung) {
        if (distToPlayer < 5 || hurt) { this._sprung = true; this._sink = 0; this.state = 'chase'; }
        else { this.state = 'idle'; this.stateTimer = 1; this.velocity.set(0, 0, 0); this._sink = 0.35 * (this.scale || 1); this._held = true; }
      }
      return;
    }
    if (t === 'blind') {
      const heard = hurt || distToPlayer < 3 || (distToPlayer < 16 && Enemy.playerNoisy);
      if (heard) this._heardAt = now;
      const deaf = now - (this._heardAt || -99) > 4;
      this.aggroRange = deaf ? 0 : 16;
      if (deaf && (this.state === 'chase' || this.state === 'attack') && this.attackState === 'none') { this.state = 'patrol'; this.stateTimer = 0; }
      else if (!deaf && (this.state === 'idle' || this.state === 'patrol')) this.state = 'chase';
    }
  }

  /** Frostbite (ice mastery) lands here — a real speed debuff. */
  applySlow(mult, duration) {
    this.slowMult = mult;
    this.slowTimer = Math.max(this.slowTimer, duration);
  }

  effectiveSpeed() {
    return this.speed * (this.slowTimer > 0 ? this.slowMult : 1);
  }

  _handleGravity(dt, chunkManager) {
    // Analytic ground height — see ChunkManager.getGroundY().
    //
    // This was a fresh THREE.Raycaster ALLOCATED AND FIRED per enemy
    // per frame against the whole ~93,000-triangle terrain set. With a
    // dozen enemies alive that alone was the single largest cost in
    // the update loop, and it also churned two Vector3s and a Raycaster
    // per enemy per frame for the GC to clean up.
    const groundY = chunkManager.getGroundY(this.position.x, this.position.z);
    if (isFinite(groundY)) {
      
      // Smoothly snap to ground if within distance, or apply gravity if way above
      if (this.position.y < groundY || Math.abs(this.position.y - groundY) < 2) {
        this.position.y = groundY;
        this.velocity.y = 0;
      } else {
        // Simple gravity
        this.velocity.y -= 25 * dt;
        this.position.y += this.velocity.y * dt;
        if (this.position.y < groundY) this.position.y = groundY;
      }
    }
  }

  _idle(dt, distToPlayer) {
    this.velocity.set(0, 0, 0);

    if (distToPlayer < this.aggroRange) {
      this.state = 'chase';
      return;
    }

    // ⚠️ A friendly NEVER wanders off. The branch above only catches
    // it inside `aggroRange`; past that a hostile falls through to
    // patrol, which for a companion means it picks a random point 8
    // units away and strolls off while you walk in the other
    // direction. It has no leash — it follows you or it fights.
    if (this.friendly) {
      this.state = 'chase';
      return;
    }

    if (this.stateTimer <= 0) {
      this.state = 'patrol';
      this.stateTimer = 3 + Math.random() * 4;
      const angle = Math.random() * Math.PI * 2;
      this.patrolTarget = new THREE.Vector3(
        this.position.x + Math.cos(angle) * 8,
        this.position.y,
        this.position.z + Math.sin(angle) * 8
      );
    }
  }

  _patrol(dt, distToPlayer) {
    // Same reasoning as _idle: a companion does not patrol.
    if (distToPlayer < this.aggroRange || this.friendly) {
      this.state = 'chase';
      return;
    }

    if (!this.patrolTarget || this.stateTimer <= 0) {
      this.state = 'idle';
      this.stateTimer = 2 + Math.random() * 3;
      this.velocity.set(0, 0, 0);
      return;
    }

    const dir = this.patrolTarget.clone().sub(this.position);
    dir.y = 0;
    if (dir.length() < 1) {
      this.state = 'idle';
      this.stateTimer = 2;
      this.velocity.set(0, 0, 0);
      return;
    }

    dir.normalize();
    this.velocity.set(dir.x * this.effectiveSpeed() * 0.5, 0, dir.z * this.effectiveSpeed() * 0.5);
    this.rotation = Math.atan2(dir.x, dir.z);
  }

  _chase(dt, playerPos, distToPlayer) {
    // ⚠️ A friendly with nothing to fight is ESCORTING you, not
    // closing on you. Without this it walks all the way in to
    // `attackRange`, flips to 'attack', and stands in your face
    // winding up a strike it can never throw.
    if (this.friendly && !this._target?.alive) {
      if (distToPlayer < this.escortRange) {
        this.state = 'idle';
        this.stateTimer = 0.5;
        this.velocity.set(0, 0, 0);
        return;
      }
      // No leash either — it follows you across the world.
    } else if (distToPlayer > this.aggroRange * 2) {
      this.state = 'idle';
      this.stateTimer = 2;
      this.velocity.set(0, 0, 0);
      return;
    }

    // ══════════════════════════════════════════════════
    // WHERE THIS CREATURE ACTUALLY WANTS TO STAND
    // See the TACTICS block at the top of this file. Only the target
    // POINT changes — the state machine below is untouched.
    // ══════════════════════════════════════════════════
    const T = this.tactic || TACTICS.brawler;

    // A skirmisher that just landed a hit is retreating, not closing.
    if (this._backOff > 0) {
      this._backOff -= dt;
      const away = this.position.clone().sub(playerPos);
      away.y = 0;
      if (away.length() > 0.01) {
        away.normalize();
        this.velocity.set(away.x * this.effectiveSpeed() * 0.9, 0, away.z * this.effectiveSpeed() * 0.9);
        this.rotation = Math.atan2(-away.x, -away.z);   // still facing you as it backs off
      }
      return;
    }

    // A ranged creature stops well short and throws instead.
    if (T.approach === 'hold') {
      this._volleyTimer -= dt;
      const want = T.holdAt;
      const gap = distToPlayer - want;
      if (Math.abs(gap) > 1.2) {
        const toward = playerPos.clone().sub(this.position);
        toward.y = 0; toward.normalize();
        const sign = gap > 0 ? 1 : -1;     // too far → close; too near → retreat
        this.velocity.set(toward.x * this.effectiveSpeed() * 0.8 * sign, 0,
                          toward.z * this.effectiveSpeed() * 0.8 * sign);
        this.rotation = Math.atan2(toward.x, toward.z);
      } else {
        this.velocity.set(0, 0, 0);
        const toward = playerPos.clone().sub(this.position);
        this.rotation = Math.atan2(toward.x, toward.z);
        // ⚠️ Fires through the SAME COMBAT_HIT the melee strike uses,
        // so a thrown attack inherits the Refusal cap, the resists and
        // the line-of-sight rule rather than being a second damage path.
        if (this._volleyTimer <= 0 && this._hasLineOfSight(playerPos, this._chunks)) {
          this._volleyTimer = T.volleyEvery;
          this._throwAt(playerPos);
        }
      }
      return;
    }

    if (distToPlayer < this.attackRange) {
      this.state = 'attack';
      this.velocity.set(0, 0, 0);
      return;
    }

    const dir = playerPos.clone().sub(this.position);
    dir.y = 0;
    dir.normalize();

    // A flanker refuses to come straight in. It aims at a point off to
    // one side until it is close, so facing it is not the same as
    // being safe from it. ⚠️ The offset EASES OUT as it closes
    // (`fade`), or it would orbit forever and never actually attack.
    if (T.approach === 'flank' && distToPlayer > this.attackRange * 1.4) {
      const fade = Math.min(1, (distToPlayer - this.attackRange) / 6);
      const a = T.flankAngle * fade * this._flankSide;
      const cos = Math.cos(a), sin = Math.sin(a);
      const rx = dir.x * cos - dir.z * sin;
      const rz = dir.x * sin + dir.z * cos;
      dir.set(rx, 0, rz).normalize();
    }

    // Separation — without this every enemy chasing the same player
    // converges on the exact same point and visibly stacks inside
    // each other. A small push away from anything close by fixes it
    // cheaply (max 7 enemies, so an O(n) neighbour scan is nothing).
    if (activeSpawner) {
      const pushRadius = 1.6;
      // ⚠️ Separation is PHYSICAL, so it must see companions too —
      // getEnemiesInRange() is hostiles-only now, and a friendly that
      // no hostile can see would be walked straight through.
      const neighbors = activeSpawner.creaturesInRange(this.position, pushRadius);
      for (const other of neighbors) {
        if (other === this) continue;
        const away = this.position.clone().sub(other.position);
        away.y = 0;
        const d = away.length();
        if (d > 0.001 && d < pushRadius) {
          dir.addScaledVector(away.normalize(), ((pushRadius - d) / pushRadius) * 0.85);
        }
      }
      dir.normalize();
    }

    this.velocity.set(dir.x * this.effectiveSpeed(), 0, dir.z * this.effectiveSpeed());
    this.rotation = Math.atan2(dir.x, dir.z);
  }

  /**
   * Windup (visible tell) -> strike (hit resolves, gated on range AND
   * line of sight) -> recover. The old version dealt Events.COMBAT_HIT
   * the instant attackCooldown hit 0 with no warning and no LOS check
   * at all — nothing to dodge, and it hit you through terrain and
   * ruin geometry as long as the distance math lined up.
   */
  _attack(dt, playerPos, distToPlayer, chunkManager) {
    if (distToPlayer > this.attackRange * 1.8 && this.attackState === 'none') {
      this.state = 'chase';
      return;
    }

    // Face the player — until the blow COMMITS. ⚠️ STEEL: in the last
    // 40% of the windup it stops tracking you, so a step to the side at
    // the right moment takes you out of its arc (there is no roll).
    const dir = playerPos.clone().sub(this.position);
    dir.y = 0;
    const committed = this.attackState === 'windup' && this.attackStateTimer < this.windupTime * 0.4;
    if (dir.length() > 0.01 && !committed && this.attackState !== 'strike') this.rotation = Math.atan2(dir.x, dir.z);

    if (this.attackState === 'none') {
      // ⚠️ STEEL turn-taking: asked BEFORE the windup starts, so two
      // humanoids never commit on the same frame (CombatSystem.mayStrike).
      if (this.attackCooldown <= 0 && !this.friendly && Enemy.mayStrike && !Enemy.mayStrike(this)) {
        this.attackCooldown = 0.4 + Math.random() * 0.6;
        this.waitTurn = 1.0;
        return;
      }
      if (this.attackCooldown <= 0) {
        this.attackState = 'windup';
        this.attackStateTimer = this.windupTime;
      }
      return;
    }

    if (this.attackState === 'windup') {
      this.attackStateTimer -= dt;
      // Visual tell: coil back (shrink slightly) through the windup,
      // then punch past full size the instant the strike resolves —
      // legible from across a fight, and gives dodge/i-frames an
      // actual window to matter.
      const t = 1 - Math.max(0, this.attackStateTimer / this.windupTime);
      if (this.mesh) this.mesh.scale.setScalar(this.scale * (1 - t * 0.14));
      // ⚠️ STEEL: the body tells the line — rearing back for a high blow,
      // dropping for a low one (CombatSystem chose attackLine at the
      // windup's start). Read this, guard that plane, or step out.
      if (this.mesh && this.attackLine) {
        const pl = this.attackLine.plane;
        this.mesh.rotation.x = (pl === 'high' ? -0.17 : pl === 'low' ? 0.22 : 0.06) * t;
      }

      if (this.attackStateTimer <= 0) {
        this.attackState = 'strike';
        this.attackStateTimer = 0.12;
        if (this.mesh) this.mesh.scale.setScalar(this.scale * 1.1);

        const stillInRange = distToPlayer <= this.attackRange * 1.2;
        // The committed arc: centre thrusts are narrow, sweeps wide.
        const arcHalf = this.attackLine?.side === 'center' ? 32 : this.attackLine?.plane === 'low' ? 60 : 55;
        const to = playerPos.clone().sub(this.position).setY(0).normalize();
        const inArc = to.x * Math.sin(this.rotation) + to.z * Math.cos(this.rotation) >= Math.cos(arcHalf * Math.PI / 180);
        if (!(stillInRange && inArc) && !this.friendly) Enemy.onWhiff?.(this);
        if (stillInRange && inArc && this._hasLineOfSight(playerPos, chunkManager)) {
          // ⚠️ THE ONE LINE THAT DECIDES WHO A SUMMON IS FOR.
          // A friendly strikes the hostile it was sent at and NOTHING
          // else — never `'player'`, and never when it has no target
          // (an Echo escorting you must not deal damage to thin air).
          if (this.friendly) {
            if (this._target?.alive) {
              eventBus.emit(Events.COMBAT_HIT, {
                source: this,
                target: this._target,
                damage: this.atk,
                position: this.position.clone(),
              });
            }
          } else {
            eventBus.emit(Events.COMBAT_HIT, {
              source: this,
              target: 'player',
              damage: this.atk * this.packFactor(),
              position: this.position.clone(),
            });
            // A skirmisher does not stand there afterwards. This is
            // what makes it the one that punishes not moving.
            if (this.tactic?.backOff) {
              this._backOff = this.tactic.backOffFor;
              this.state = 'chase';
              this.attackState = 'none';
              this.attackCooldown = this.attackSpeed;
            }
          }
        }
      }
      return;
    }

    if (this.attackState === 'strike') {
      this.attackStateTimer -= dt;
      if (this.attackStateTimer <= 0) {
        this.attackState = 'recover';
        this.attackStateTimer = this.recoverTime;
      }
      return;
    }

    // recover
    this.attackStateTimer -= dt;
    if (this.mesh) this.mesh.rotation.x *= 0.8;
    if (this.mesh) this.mesh.scale.setScalar(THREE.MathUtils.lerp(this.mesh.scale.x, this.scale, 0.25));
    if (this.attackStateTimer <= 0) {
      this.attackState = 'none';
      this.attackCooldown = this.attackSpeed;
      if (this.mesh) this.mesh.scale.setScalar(this.scale);
      if (distToPlayer > this.attackRange * 1.6) this.state = 'chase';
    }
  }

  /**
   * Terrain- and prop-occluded sight check. Fails OPEN (returns true)
   * if the chunk manager or its terrain isn't available yet, rather
   * than silently freezing every attack — a missing reference should
   * never be indistinguishable from "there's a wall there".
   */
  _hasLineOfSight(playerPos, chunkManager) {
    // A Descent's walls are not terrain; the dungeon answers for them.
    if (this.nav && this.losCheck && !this.losCheck(this.position, playerPos)) return false;
    const terrain = chunkManager?.getTerrainGroup?.();
    if (!terrain) return true;

    const eye = new THREE.Vector3(0, 1.2, 0);
    const from = this.position.clone().add(eye);
    const to = playerPos.clone().add(eye);
    const toVec = to.clone().sub(from);
    const dist = toVec.length();
    if (dist < 0.01) return true;
    toVec.normalize();

    // ── Terrain occlusion: sampled, not raycast ──────────
    // Walk the straight line to the player and ask the height function
    // whether the ground rises above the sightline anywhere along it.
    // Eight samples of an O(1) function replaces a BVH traversal of
    // ~93,000 triangles, and for "is a hill between us" it is just as
    // correct.
    const STEPS = 8;
    for (let i = 1; i < STEPS; i++) {
      const t = i / STEPS;
      const sx = from.x + toVec.x * dist * t;
      const sz = from.z + toVec.z * dist * t;
      const sy = from.y + toVec.y * dist * t;
      if (chunkManager.getGroundY(sx, sz) > sy + 0.35) return false;
    }

    // ── Prop occlusion: BOUNDED ──────────────────────────
    // This used to be `intersectObject(decorationGroup, true)` — the
    // entire decoration group, every frame, per enemy. That group now
    // holds ~600,000 triangles of photoscanned props, so this one line
    // was doing more work than the rest of the game combined.
    //
    // Only props whose bounding sphere the sightline could plausibly
    // touch are worth testing, and only the nearest handful of those
    // matter. Sphere tests are cheap and reject almost everything.
    const decos = chunkManager.decorationGroup?.children;
    if (decos && decos.length) {
      const ray = this.raycaster.ray;
      let tested = 0;
      for (let i = 0; i < decos.length && tested < 6; i++) {
        const d = decos[i];
        // Cheap reject: too far from either endpoint to be between us.
        if (d.position.distanceToSquared(this.position) > dist * dist) continue;
        if (!d.userData._bs) {
          const box = new THREE.Box3().setFromObject(d);
          d.userData._bs = box.getBoundingSphere(new THREE.Sphere());
        }
        if (!ray.intersectsSphere(d.userData._bs)) continue;
        tested++;
        if (this.raycaster.intersectObject(d, true).length > 0) return false;
      }
    }
    return true;
  }

  _flee(dt, playerPos) {
    const dir = this.position.clone().sub(playerPos);
    dir.y = 0;
    dir.normalize();
    this.velocity.set(dir.x * this.effectiveSpeed(), 0, dir.z * this.effectiveSpeed());
    this.rotation = Math.atan2(dir.x, dir.z);

    if (this.stateTimer <= 0) {
      this.state = 'idle';
      this.stateTimer = 3;
    }
  }

  /**
   * Take a hit. `element` decides almost everything: matching what
   * this creature is made of barely scratches it, opposing it strains
   * the composition toward coming apart.
   */
  takeDamage(amount, element = null) {
    if (!this.alive) return;

    // ⚠️ Same sanitising Player.takeDamage needs, and for the same
    // reasons — a NaN here leaves `hp` NaN, `hp <= 0` false forever,
    // and an immortal creature that can never be killed or cleaned up.
    // A negative would HEAL it above its own maximum. Both are
    // reachable from any multiplier chain that divides by zero.
    const incoming = Number(amount);
    if (!Number.isFinite(incoming) || incoming <= 0) return;

    this._hurtAt = performance.now() / 1000;
    let dealt = incoming;
    let relation = 'neutral';
    let detonated = false;

    if (element) {
      const res = composition.resolveHit(this, { element, damage: incoming });
      // ⚠️ resolveHit runs the elemental reaction table, which is a
      // chain of multipliers — re-check rather than trust it.
      dealt = Number.isFinite(res.damage) && res.damage > 0 ? res.damage : incoming;
      relation = res.relation;
      detonated = res.detonated;
    }

    this.hp -= dealt;
    if (!Number.isFinite(this.hp)) this.hp = 0;
    this.hp = Math.min(this.maxHp, this.hp);

    // Flinch — a brief freeze that reads as impact, and cancels a
    // windup in progress instead of the creature landing its hit
    // unfazed by the one you just landed on it.
    this.hitStun = Math.min(0.4, this.hitStun + 0.16);
    // ⚠️ STEEL: big things (and bosses) do not flinch out of a blow —
    // you guard it or step out of it (CombatSystem sets hyperArmor).
    if (this.attackState === 'windup' && !this.hyperArmor) {
      this.attackState = 'none';
      this.attackCooldown = Math.max(this.attackCooldown, 0.35);
      if (this.mesh) this.mesh.scale.setScalar(this.scale);
    }

    // Real skeletal flinch on top of the numeric hitStun above. Only
    // fires if this hit won't kill — a corpse should play Death_A, not
    // flinch and then die, which reads as two separate events.
    if (this.hp > 0) playCreatureHit(this.mesh);

    eventBus.emit(Events.UI_DAMAGE_NUMBER, {
      position: this.position.clone().add(new THREE.Vector3(0, 1.5, 0)),
      amount: dealt,
      type: relation === 'opposed' ? 'crit' : relation === 'matched' ? 'resisted' : 'damage',
    });

    // Combat clarity: who was hurt, how much, and how the element fared
    // (ui/CombatHUD.js draws the hit marker, the target bar and the
    // "weak to / resists" line from this).
    eventBus.emit(Events.ENEMY_HURT, {
      enemy: this, dealt, relation, element,
      killed: this.hp <= 0 || detonated, byPlayer: !!this._lastHitByPlayer,
    });

    if (detonated) {
      this._detonate();
      return;
    }

    if (this.hp <= 0) {
      this._die();
    } else if (this.hp < this.maxHp * 0.2) {
      this.state = 'flee';
      this.stateTimer = 5;
    } else {
      this.state = 'chase';
    }
  }

  /**
   * The composition failed. It comes apart, strains everything near
   * it, and gives up an unusually rich pull of what it was made of.
   */
  _detonate() {
    if (!this.alive) return;
    const nearby = activeSpawner ? activeSpawner.getEnemiesInRange(this.position, 8) : [];
    const { element } = composition.detonate(this, nearby);

    eventBus.emit(Events.UI_DAMAGE_NUMBER, {
      position: this.position.clone().add(new THREE.Vector3(0, 1.6, 0)),
      amount: 'UNMADE',
      type: 'reaction',
    });

    saturation.depositDetonation(this.position, element);

    this._detonated = true;
    this._die();
  }

  _die() {
    this.alive = false;
    this.deathTimer = 1.5;
    this.velocity.set(0, 0, 0);

    // Coming apart, not just fading — a bigger, heavier burst than a
    // regular hit, in whatever it was actually made of.
    particleBursts.spawn(this.position.clone(), this.body?.dominant || 'neutral', { count: 16, sizeMult: 1.3, life: 0.65 });
    audioSystem.playEnemyDeath(this.scale || 1);

    // ── Death animation ───────────────────────────────────
    // This used to be a bare scale-down-and-sink on a
    // requestAnimationFrame loop, entirely independent of the
    // animation mixer — which meant the Death_A clip trimmed into
    // every KayKit rig was shipped and never played (HANDOFF.md gap
    // #1). The reason it couldn't just be played is structural: once
    // an enemy dies, Enemy.update() stops being called, so nothing is
    // advancing the mixer any more. The fade loop has to drive it.
    //
    // So: start the clip, then let it play out at full scale, and only
    // begin sinking the corpse once the animation has finished. A body
    // that shrinks while it is still falling over reads as a bug; one
    // that falls, settles, then sinks reads as a death.
    if (this.mesh) {
      const clipDur = playCreatureDeath(this.mesh);
      // No death clip (procedural creature, or a rig that lost Death_A
      // in trimming) — keep exactly the old behaviour for those.
      const holdFor = clipDur > 0 ? clipDur : 0;

      let last = performance.now();
      let elapsed = 0;

      const fadeOut = () => {
        if (!this.mesh) return;
        const now = performance.now();
        // Clamped: a backgrounded tab can hand back a multi-second dt,
        // which would skip the entire death clip in one step.
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        elapsed += dt;

        // Drive the skeleton. This single call is what the whole gap
        // came down to.
        tickCreatureMixer(this.mesh, dt);

        if (elapsed >= holdFor) {
          // Framerate-independent shrink. The original 0.95-per-FRAME
          // meant the corpse vanished more than twice as fast at 120Hz
          // as at 60Hz; this sinks at a fixed rate in seconds.
          const k = Math.pow(0.05, dt / 0.85);
          this.mesh.scale.multiplyScalar(k);
          this.mesh.position.y -= dt * 1.2;
        }

        if (this.mesh.scale.x > 0.1 * this.scale) requestAnimationFrame(fadeOut);
      };
      fadeOut();

      // The corpse is removed by update() when deathTimer expires, and
      // destroy() takes the mesh with it. A fixed 1.5s was fine for a
      // pure scale-down, but KayKit's Death_A clips run longer than
      // that on several rigs — the body would be deleted mid-fall.
      // Give the clip its full length plus enough time for the sink.
      this.deathTimer = Math.max(this.deathTimer, holdFor + 1.2);
    }
    
    // Volatile ground (opposed elements soaked into the same cell —
    // the same signal that fires the unease whisper) pays out richer
    // drops, not just a mood cue: real, legible risk/reward the
    // player learns to read, the way a torch level or Insight doubles
    // as both atmosphere and mechanic in the games this is patterned on.
    const volatility = saturation.readAt(this.position)?.volatile || 0;
    const dropBoost = 1 + volatility * 0.6;

    // Spawn Pickups based on Drop Tables
    const dropTable = DROPS[this.typeId];
    if (dropTable) {
      dropTable.forEach(dropInfo => {
        if (Math.random() <= Math.min(1, dropInfo.chance * dropBoost)) {
           let itemDef;
           if (dropInfo.item) {
             // Reference existing ID
             itemDef = getItem(dropInfo.item) || MATERIALS.find(m => m.id === dropInfo.item);
             // A hide needs a knife to come off the body (owner: tools).
             if (dropInfo.knife && !Enemy.hasKnife?.()) itemDef = null;
           } else {
             // Inline generic
             itemDef = { ...dropInfo };
           }
           
           if (itemDef) {
             const dropPos = this.position.clone().add(new THREE.Vector3(
               (Math.random() - 0.5) * 1.5,
               1.0, 
               (Math.random() - 0.5) * 1.5
             ));
             pickupManager.spawn(itemDef, dropPos);
           }
        }
      });
    }

    // ⚠️ WHO killed it, and by how much they were outmatched.
    // COMBAT_KILL previously carried only `{ enemy, xp }`, which is
    // enough to pay experience and not enough to answer "did the
    // PLAYER do this" — and it fires for an Echo's kills and for
    // enemy-on-enemy reaction damage too. Anything awarding a player
    // an honour for a kill has to know the difference (trap #12's
    // shape). `_lastHitByPlayer` is stamped in main.js's COMBAT_HIT
    // handler, which is the one place that already knows.
    eventBus.emit(Events.COMBAT_KILL, {
      enemy: this, xp: this.xp,
      byPlayer: !!this._lastHitByPlayer,
      level: this.level,
    });
  }

  /**
   * A ranged creature's attack.
   *
   * ⚠️ Emits the SAME COMBAT_HIT a melee strike does rather than
   * spawning a projectile. A real projectile would need its own
   * collision, its own resist path and its own Refusal handling — a
   * second damage pipeline, which is the thing this codebase keeps
   * paying for. The telegraph is the creature visibly stopping and
   * winding up, which `animateCreature` already renders.
   */
  _throwAt(playerPos) {
    eventBus.emit(Events.COMBAT_HIT, {
      source: this,
      target: 'player',
      damage: this.atk * 0.7,     // less per hit than closing would be
      position: this.position.clone(),
      ranged: true,
    });
    particleBursts.spawn(
      this.position.clone().add(new THREE.Vector3(0, 1, 0)),
      this.body?.dominant || 'neutral', { count: 6, sizeMult: 0.7 });
  }

  /**
   * How much of an incoming hit this creature actually takes.
   *
   * ⚠️ A FACTOR returned to the caller, never a mutation of `hp` here.
   * `takeDamage` stays the single place health changes.
   *
   * ⚠️ `armoured` is FRONTAL only, and that is the entire mechanic —
   * a golem you cannot out-damage from the front is a golem you have
   * to walk around, which is a decision. A flat resist would just be
   * a bigger health bar.
   */
  incomingFactor(fromPos) {
    const T = this.tactic;
    if (!T) return 1;
    let f = 1;
    if (T.frontalResist && fromPos) {
      const to = fromPos.clone().sub(this.position);
      to.y = 0;
      if (to.lengthSq() > 1e-6) {
        to.normalize();
        const facing = new THREE.Vector3(Math.sin(this.rotation), 0, Math.cos(this.rotation));
        // dot > 0.35 ≈ within ~70° of the front.
        if (to.dot(facing) > 0.35) f *= (1 - T.frontalResist);
      }
    }
    return f;
  }

  /**
   * Pack creatures hit harder with their own kind around them.
   * ⚠️ Counts the SAME species only — a goblin is emboldened by
   * goblins, not by a golem that happens to be nearby.
   */
  packFactor() {
    const T = this.tactic;
    if (!T?.packBonus || !activeSpawner) return 1;
    let n = 0;
    for (const o of activeSpawner.enemies) {
      if (o === this || !o.alive || o.friendly) continue;
      if (o.typeId !== this.typeId) continue;
      if (o.position.distanceTo(this.position) < T.packRadius) n++;
    }
    return 1 + Math.min(4, n) * T.packBonus;
  }

  /**
   * A summon goes back where it came from.
   *
   * ⚠️ NOT the same as dying. `alive = false` alone would run it
   * through the whole death path — the corpse timer, the XP payout in
   * COMBAT_KILL, the loot drop — and an Echo you dismissed would pay
   * you experience for banishing your own companion, on a loop, for
   * as long as you kept re-equipping it. It is marked so the kill
   * handler can tell the two apart, and its mesh is freed at once
   * rather than left to the corpse timer.
   */
  dismiss() {
    if (!this.alive) return;
    this.alive = false;
    this.dismissed = true;
    this.deathTimer = 0;
    eventBus.emit(Events.ECHO_DISMISSED, { id: this.id, name: this.name });
    this.destroy();
  }

  destroy() {
    if (this.mesh) {
      sceneManager.remove(this.mesh);
      this.mesh.traverse(c => {
        if (c.geometry) c.geometry.dispose();
        // Shell/accent materials are CACHED and shared across every
        // creature of this element (EntityForge._matCache) — disposing
        // them here freed a GPU resource still in use by every OTHER
        // living (and future) creature of the same element, which is
        // undefined behaviour the instant a second fire enemy died.
        // Only the core material is instance-owned (animateCreature
        // mutates it per-creature for the strain glow), so it's the
        // only mesh material actually safe to dispose here.
        if (c.isMesh && c.name === 'core' && c.material) c.material.dispose();
      });
      this.mesh = null;
    }
  }
}

// Enemy Spawner
export class EnemySpawner {
  /** Biomes already warned about for a missing enemyTypes declaration. */
  static _warnedBiomes = new Set();

  constructor() {
    activeSpawner = this;
    this.enemies = [];
    // ⚠️ Corpses are held here, NOT left in `enemies`.
    // The old loop spliced an enemy out of `enemies` on the same frame
    // `alive` went false — which meant Enemy.update() was never called
    // on it again, which meant the `deathTimer <= 0 → destroy()` branch
    // at the top of that method was unreachable. Every creature you
    // ever killed left its mesh in the scene at 10% scale, sunk under
    // the ground, with its geometry never disposed. The death-animation
    // comment in _die() ("the corpse is removed by update() when
    // deathTimer expires") described an intent the caller broke.
    // A separate list keeps corpses ticking without letting them count
    // toward the live population cap or reach any targeting query.
    this._corpses = [];
    this.spawnTimer = 0;
    // Trimmed hard across several earlier performance passes — low
    // enough that a normal play session barely finds fights, which
    // starves the entire materials economy downstream (nothing to
    // kill means nothing drops means nothing to forge). Raised back
    // up; the adaptive-resolution system already in main.js exists
    // specifically to absorb load spikes like this on slower hardware,
    // so this is the intended dial to lean on rather than the enemy
    // budget itself.
    this.maxEnemies = 13;

    // ⚠️ These two lived at the BOTTOM of setPeaceful(), after its
    // `return` — dead code that never ran. The constructor therefore
    // left both `undefined`, which is why the wilderness read as
    // empty even with peace mode off:
    //   · `spawnTimer = spawnInterval * (…)` → NaN, and `NaN <= 0` is
    //     false forever, so the spawner fired exactly ONCE (on the
    //     initial `spawnTimer = 0`) and never again for the session.
    //   · `spawnRadius + Math.random() * 15` → NaN, so that one
    //     spawn was placed at a NaN position and was never visible
    //     anywhere.
    // Two separate silent failures from one misplaced `return`.
    this.spawnInterval = 4.5 * PACE.spawnInterval;
    // Far enough that things WALK up to you instead of materialising
    // in your face — the old 15 put them inside melee range on the
    // frame they appeared. The wander AI closes the gap.
    this.spawnRadius = 30;
    // Anything this far away is out of play. Without a cull the
    // population is a treadmill: you drag the same 13 creatures
    // across the world because nothing ever leaves the list.
    this.despawnRadius = 150;
    // The Sanctuary is a safe hub. The biome-name check below covers
    // the flat override inside dist < 2.5 chunks, but the hub's
    // buildings and NPCs spill past that, so guard by distance too.
    // ══════════════════════════════════════════════════════
    // ⚠️ 190 → 78, AND THIS IS WHY THE GAME "DIDN'T FEEL LIKE A GAME".
    //
    // Owner: *"the game doesn't feel like a game."* Measured on a
    // brand-new character, standing where the game puts you:
    //
    //     active quest       mq2, "Fell three skeletons beyond the gate"
    //     enemies at   60m   0
    //     enemies at  120m   0
    //     enemies at  185m   0
    //     enemies at  210m   2
    //
    // The game hands you a KILL quest and then guarantees that nothing
    // killable can exist within 190 units of you — while `spawnRadius`
    // only ever places creatures 30-56 units from the player. So the
    // core loop breaks at its first step: you are told to fight, and
    // the world is empty in every direction you can see. You have to
    // walk three chunks in an unmarked direction before the game
    // contains a single opponent.
    //
    // ⚠️ THE TWO RADII ARE COUPLED AND WERE NOT. A no-spawn zone
    // (190) more than three times the spawn ring (30-56) means the
    // player must fully exit the zone before ANY spawn point is legal
    // — the ring never straddles the boundary, so there is no gradual
    // reintroduction of danger, just a hard empty circle.
    //
    // 78 clears the Sanctuary's built footprint with real margin (the
    // furthest structures sit near 24, market stalls beyond that) and
    // puts the first creatures just outside the gate, which is exactly
    // where mq2's text has always said they are.
    // ══════════════════════════════════════════════════════
    this.sanctuaryRadius = 78;
    /**
     * A hard ceiling on spawned enemy level while a First Nightmare is
     * running. Null in the ordinary world. Set by NightmareSystem —
     * see the note at the ramp in `_spawnEnemy`.
     */
    this.trialCap = null;
    /**
     * How many creatures may exist at once during a First Nightmare.
     * ⚠️ Four, against the ordinary `maxEnemies` of 13. Measured live:
     * nine level-2 creatures around a level-1 Pioneer with 0 hotbar
     * abilities, each hitting for 21. The level cap made each one
     * survivable and did nothing about the arithmetic of nine.
     */
    this.trialMaxAlive = 4;
    /**
     * Hard ceiling on a single enemy's `atk` during a First Nightmare,
     * set from the player's maxHp. See the note in `_spawnEnemy`.
     */
    this.trialAtkCap = null;
    /**
     * TOTAL creatures a First Nightmare may ever produce, or null for
     * the ordinary world. See the note in `update()`.
     */
    this.trialBudget = null;
    /** How many this trial has actually produced. */
    this.trialSpawned = 0;

    // ── PEACE MODE ──
    // Suppresses the AMBIENT wander-spawner only. Added for a testing
    // pass ("remove slimes and monsters from spawn, as they will
    // hinder testing"); that pass is over and it now defaults OFF —
    // see _readPeacePref().
    //
    // ⚠️ Deliberately does NOT touch spawnNamed(). Descent waves, the
    // Descent Warden, Vell and the Foundation Warden are all forged
    // through that path, and silencing them would make the entire
    // Ascent loop untestable — which is the opposite of the point.
    // Story enemies still appear; only the background population that
    // wanders up while you are trying to read a UI is gone.
    //
    // Toggle live with F6, or ?peace=0 in the URL to start with the
    // ambient spawner running again. Persisted in localStorage the same
    // way the quality tier override is.
    this.peaceful = this._readPeacePref();
  }

  _readPeacePref() {
    try {
      const q = new URLSearchParams(location.search).get('peace');
      if (q !== null) {
        const on = q !== '0' && q !== 'false';
        localStorage.setItem('mz_peace', on ? '1' : '0');
        return on;
      }
      const stored = localStorage.getItem('mz_peace');
      // Default OFF. The testing pass this was raised for is over, and
      // an empty wilderness starves every downstream system: no kills
      // means no XP, no drops, no materials, no reason to weave.
      // ⚠️ It is still PERSISTED, so a returning player who pressed F6
      // keeps their choice — only the first-ever load reads this.
      return stored === null ? false : stored === '1';
    } catch {
      return false;
    }
  }

  /** Flip ambient spawning. Returns the new state. */
  setPeaceful(on) {
    this.peaceful = !!on;
    try { localStorage.setItem('mz_peace', this.peaceful ? '1' : '0'); } catch { /* private mode */ }
    if (this.peaceful) {
      // Clear what is already wandering, but ONLY the ambient
      // population — a named unique mid-Descent must survive this.
      for (const e of this.enemies) {
        if (!e.isNamed && !e.isBoss) e.alive = false;
      }
    }
    return this.peaceful;
  }

  update(dt, playerPos, chunkManager) {
    const biome = chunkManager.getCurrentBiome();

    // ── Point every companion at something ──────────────
    // ⚠️ Resolved ONCE per frame for the whole list, not per creature
    // inside Enemy.update(). A friendly asking "what is the nearest
    // hostile?" from its own update would be O(n²) over a list that
    // already re-scans itself for crowd separation.
    this._retargetAllies(playerPos);

    // Update existing enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      enemy.update(dt, playerPos, chunkManager);

      if (!enemy.alive) {
        this.enemies.splice(i, 1);
        this._corpses.push(enemy);
        continue;
      }

      // Cull the ambient population once it is far out of play, so the
      // budget frees up for creatures where the player actually is.
      // ⚠️ Named uniques are exempt. Vell stands at Vell's Hollow and
      // must still be there when mq6 sends you; a distance cull that
      // did not check this would quietly delete the boss the moment
      // you walked away from the marker.
      if (!enemy.isNamed && !enemy.isBoss &&
          enemy.position.distanceTo(playerPos) > this.despawnRadius) {
        enemy.alive = false;
        enemy.destroy?.();
        this.enemies.splice(i, 1);
      }
    }

    // Tick corpses so their death clip finishes and destroy() actually
    // runs. They are out of `enemies` by now, so nothing can target,
    // hit or count them.
    for (let i = this._corpses.length - 1; i >= 0; i--) {
      const corpse = this._corpses[i];
      corpse.update(dt, playerPos, chunkManager);
      if (!corpse.mesh) this._corpses.splice(i, 1);
    }

    // Standing on volatile ground doesn't just flicker the light and
    // whisper at you — it's a legible risk dial: things spawn faster,
    // more of them are allowed at once, and what does spawn hits
    // harder. The same number that drives the horror cue (main.js's
    // atmosphere.setUnease) drives this too.
    const volatility = saturation.readAt(playerPos)?.volatile || 0;
    const volatileCap = this.maxEnemies + Math.round(volatility * 4);
    const volatileInterval = this.spawnInterval * (1 - volatility * 0.5);

    // ══════════════════════════════════════════════════════
    // ⚠️ THE SPAWNER HAD NO TOTAL BUDGET — ONLY A CONCURRENT CAP.
    //
    // Owner: *"there are practically infinite enemies."* Literally
    // true: `enemies.length < cap` limits how many exist AT ONCE, and
    // the timer re-armed every `spawnInterval` forever. Kill one and
    // another arrives 4.5 seconds later, for as long as you stand
    // there. There was no state anywhere counting how many a place had
    // already produced, so no fight could ever be finished — only
    // walked away from.
    //
    // `trialBudget` is a TOTAL for the First Nightmare. It is not a
    // difficulty knob; it is what makes the opening a fight with an
    // end rather than a treadmill, which is the thing that made the
    // trials read as endless.
    //
    // ⚠️ NULL IN THE ORDINARY WORLD, deliberately. An open world whose
    // creatures run out is a world you can strip-mine and then walk
    // through empty — the concurrent cap is the right model out there.
    // This bounds the ONE fight the player cannot walk away from.
    // ══════════════════════════════════════════════════════
    const outOfBudget = this.trialBudget !== null && this.trialSpawned >= this.trialBudget;

    this.spawnTimer -= dt;
    // ⚠️ `realmHold`: inside a deep cave (CaveSystem) the realm's own
    // biome must not spawn surface creatures into the tunnels.
    if (!this.peaceful && !this.realmHold && !outOfBudget
        && this.spawnTimer <= 0 && this.enemies.length < volatileCap) {
      this.spawnTimer = volatileInterval;
      const before = this.enemies.length;
      this._spawnEnemy(playerPos, biome, volatility, chunkManager);
      // ⚠️ Counted on ACTUAL spawns, not on attempts. `_spawnEnemy`
      // returns early for the Sanctuary radius, the trial's alive cap
      // and unloaded ground — counting attempts would exhaust the
      // budget while standing somewhere nothing can spawn, and the
      // trial would go silent for no visible reason.
      if (this.enemies.length > before) this.trialSpawned++;
    }
  }

  _spawnEnemy(playerPos, biome, volatility = 0, chunkManager = null) {
    // Never populate the hub. The biome check further down catches the
    // flat 'Sanctuary' override, but that override only covers
    // dist < 2.5 chunks while the hub's buildings and NPCs reach
    // further, so the ring around the player is rejected by distance
    // first — otherwise standing at the edge of the Sanctuary spawns
    // things inside it.
    const fromSpawn = Math.hypot(playerPos.x, playerPos.z);
    if (fromSpawn < this.sanctuaryRadius) return;

    const angle = Math.random() * Math.PI * 2;
    const dist = this.spawnRadius + Math.random() * 26;
    const x = playerPos.x + Math.cos(angle) * dist;
    const z = playerPos.z + Math.sin(angle) * dist;
    // ⚠️ The ring is centred on the PLAYER, so the check above is not
    // enough on its own: standing just outside the hub boundary puts
    // half the ring back inside it. The chosen POINT has to clear the
    // Sanctuary too, or the player gets skeletons spawning behind the
    // Quartermaster while they stand at the gate.
    if (Math.hypot(x, z) < this.sanctuaryRadius) return;
    // ⚠️ Ground height is ANALYTIC — never a raycast. Placing at
    // `playerPos.y + 10` and letting it fall is wrong on a slope:
    // the player's own Y says nothing about the ground 40 units away,
    // so a creature spawned downhill dropped through the world and
    // one spawned uphill appeared buried. getGroundY() is O(1) and
    // works where no chunk is loaded, which is exactly the case here.
    const groundY = chunkManager?.getGroundY
      ? chunkManager.getGroundY(x, z)
      : playerPos.y;
    const pos = new THREE.Vector3(x, groundY + 1.5, z);

    // ── Which creature lives here ────────────────────────
    // ⚠️ Reads `biome.enemyTypes`, a DECLARED field on the biome, not
    // a substring match on its display name. The old version was a
    // ladder of `name.includes('swamp')` tests, which is the same
    // failure shape as PROP_SURFACES (HANDOFF §0.8): a biome absent
    // from the table silently falls through to the generic branch and
    // nothing errors. It also meant a biome's creatures were decided
    // by how it had been NAMED — renaming 'Glowing Grotto' would have
    // silently changed what spawned in it, and every one of the seven
    // biomes added since matched nothing and quietly got the
    // level-1 fallback.
    //
    // Weighted toward the first entry: the list is "dominant first",
    // so an area reads as belonging to one creature with others
    // present, rather than as an even mix of three.
    let typeIndex = 0;
    // ⚠️ WORLD EXPANSION: the biome's own life (data/expansion.js
    // BIOME_LIFE) — mostly animals, then its monsters, then a faction
    // patrol — alongside the original `enemyTypes`.
    const life = biome && BIOME_LIFE[biome.key];
    let lifePick = -1;
    if (life) {
      const r = Math.random();
      const pool = r < 0.5 ? life.wild : r < 0.72 ? life.monsters : r < 0.82 ? life.factions : null;
      if (pool?.length) lifePick = typeIndexOf(pool[Math.floor(Math.random() * pool.length)]);
    }
    if (biome) {
      if (biome.name === 'The Sanctuary') return;   // no enemies in the hub
      const types = biome.enemyTypes;
      if (Array.isArray(types) && types.length) {
        const r = Math.random();
        typeIndex = r < 0.55 ? types[0]
                  : r < 0.85 ? (types[1] ?? types[0])
                  : (types[2] ?? types[0]);
        if (lifePick >= 0) typeIndex = lifePick;
      } else {
        // No declaration — say so once rather than silently shipping
        // slimes into an end-game biome.
        if (!EnemySpawner._warnedBiomes.has(biome.name)) {
          EnemySpawner._warnedBiomes.add(biome.name);
          console.warn(`[EnemySpawner] biome "${biome.name}" declares no enemyTypes — falling back to low tier`);
        }
        typeIndex = Math.floor(Math.random() * 3);
      }
    }

    // ── DIFFICULTY BY DISTANCE ──────────────────────────────
    // Biomes are scattered by noise, not by radius, so the Shadow
    // Realm (enemyLevel 15) can and does border the Sanctuary. A
    // player two minutes out of the hub met level-15 wraiths, which
    // is the whole of "the start is too hard" — the biome table was
    // never wrong, it just had no idea how far from home it was.
    //
    // The biome's level is now a CEILING that the first ~1.2km of
    // world eases you up to, rather than a flat value applied
    // everywhere. Past `FULL_DIFFICULTY_AT` this is identity, so the
    // deep world is untouched.
    const biomeLevel = biome ? (biome.enemyLevel || 1) : 1;
    const FULL_DIFFICULTY_AT = 1200;
    const ramp = Math.min(1, Math.max(0, (fromSpawn - this.sanctuaryRadius) /
      (FULL_DIFFICULTY_AT - this.sanctuaryRadius)));
    // Ease in rather than ramp linearly: the first few hundred metres
    // should stay gentle, and the curve should tighten later.
    let capped = Math.max(1, Math.round(1 + (biomeLevel - 1) * (ramp * ramp)));

    // ══════════════════════════════════════════════════════
    // ⚠️ THE FIRST NIGHTMARE IGNORES THE DISTANCE RAMP.
    //
    // Owner: *"the trials are too hard."* The cause was structural,
    // not a tuning number: the ramp above keys difficulty on DISTANCE
    // FROM SPAWN, and the realm's arrival regions sit 2,000–6,000
    // units out. So `ramp` was already 1.0 and a level-1 Pioneer who
    // had not yet owned a weapon met the biome's full ceiling —
    // enemyLevel 10 on the Shore, 14 in the Hollow Mountains, 16 in
    // the Dreaming City.
    //
    // That is the exact bug this ramp was WRITTEN to fix ("the biome
    // table was never wrong, it just had no idea how far from home it
    // was"), reappearing because the First Nightmare put the player
    // somewhere the ramp's assumption — far means experienced — is
    // false. Distance stopped being a proxy for progression the moment
    // the game could start you anywhere.
    //
    // ⚠️ Capped against the PLAYER's level rather than set to a
    // constant, so the Nightmare stays a real fight for a returning
    // character re-entering one, and never an unwinnable one for a
    // fresh Pioneer.
    // ══════════════════════════════════════════════════════
    const level = Math.min(biomeLevel, capped);

    // Volatile ground hits harder too, not just more often.
    const volatileLevelBonus = Math.round(volatility * 3);
    let finalLevel = level + Math.floor(Math.random() * 3) + volatileLevelBonus;

    // ⚠️ CLAMPED LAST, AFTER every bonus. Clamping `capped` earlier
    // looked right and was not: the random 0-2 spread and the
    // volatility bonus are both added AFTERWARDS, so a cap of 2 still
    // produced level-7 creatures — and measured live it produced a
    // **level 12** one, because volatile ground stacks on top. A cap
    // that is not the last word is not a cap.
    if (this.trialCap) finalLevel = Math.min(finalLevel, this.trialCap);
    // ⚠️ AND FEWER OF THEM. Capping LEVEL alone left the real problem
    // untouched: nine capped creatures converging at once still kills a
    // Pioneer who has no weapon and no abilities. A trial is meant to
    // be a fight you can lose, not a crowd you cannot leave.
    if (this.trialCap && this.enemies.length >= this.trialMaxAlive) return;

    const enemy = new Enemy(typeIndex, pos, Math.max(1, finalLevel));
    // ⚠️ A further damage cut during the First Nightmare, applied to
    // the INSTANCE rather than the template — the template is shared
    // and editing it would weaken every creature of that type in the
    // world for the rest of the session.
    // ══════════════════════════════════════════════════════
    // ⚠️ CAP THE DAMAGE ITSELF, NOT JUST THE LEVEL.
    //
    // Capping level looked sufficient and was not. `atk` is
    // `template.atk * levelMult`, and the TEMPLATES differ enormously
    // between species — measured live on the Forgotten Shore, whose
    // `enemyTypes` include a heavy hitter: three level-2 creatures
    // with **atk 55, 43 and 55** after the level cap and a 0.6
    // multiplier had already been applied. Their base was 92.
    //
    // So the level cap constrained the wrong variable. What the player
    // experiences is damage per hit against their own health, and that
    // is what has to be bounded — `trialAtkCap` is set from the
    // player's maxHp by NightmareSystem, so no single blow in a First
    // Nightmare can take more than about a tenth of them.
    //
    // ⚠️ Applied to the INSTANCE. The template is shared, and editing
    // it would weaken every creature of that species in the world for
    // the rest of the session.
    // ══════════════════════════════════════════════════════
    if (this.trialCap) {
      enemy.atk = Math.max(3, Math.round(enemy.atk * 0.6));
      if (this.trialAtkCap) enemy.atk = Math.min(enemy.atk, this.trialAtkCap);
    }
    this.enemies.push(enemy);
    // A pack animal comes with its pack.
    const packN = (ENEMY_TYPES[typeIndex]?.pack || 1) - 1;
    for (let k = 0; k < packN; k++) {
      const a = Math.random() * Math.PI * 2, px = pos.x + Math.cos(a) * 2.5, pz = pos.z + Math.sin(a) * 2.5;
      const py = chunkManager?.getGroundY ? chunkManager.getGroundY(px, pz) + 1.5 : pos.y;
      this.enemies.push(new Enemy(typeIndex, new THREE.Vector3(px, py, pz), Math.max(1, finalLevel)));
    }
  }

  /** Forge a named unique — same species AI/drops, its own identity. */
  spawnNamed(typeIndex, position, level, opts) {
    // ⚠️ Named spawns obey the trial cap too. This path bypasses
    // `_spawnEnemy` entirely — landmark guardians, quest targets and
    // Echo companions all come through here — so a cap applied only
    // there leaves the one hand-placed level-12 creature standing in
    // the middle of a level-1 Pioneer's first fight.
    // ⚠️ `isBoss` is exempt: a named boss is a deliberate wall, and
    // nothing spawns one during a First Nightmare.
    const capped = (this.trialCap && !opts?.isBoss)
      ? Math.min(level, this.trialCap) : level;
    const enemy = new Enemy(typeIndex, position, capped, opts);
    // ⚠️ The damage ceiling applies here too — species variance makes
    // a capped LEVEL say nothing about how hard a creature hits.
    if (this.trialCap && this.trialAtkCap && !opts?.isBoss) {
      enemy.atk = Math.min(enemy.atk, this.trialAtkCap);
    }
    this.enemies.push(enemy);
    return enemy;
  }

  /**
   * Give each friendly the nearest hostile worth fighting.
   *
   * ⚠️ Searched around the PLAYER, not around the companion. An Echo
   * escorting you should engage what is threatening YOU; one that
   * picked its own fights would wander off after something three
   * hundred metres away that you were happily walking past.
   *
   * ⚠️ Sticky: a companion keeps its current target while that target
   * is alive and still near you. Re-picking "nearest" every frame
   * makes it visibly dither between two enemies at similar range and
   * never actually reach either.
   */
  _retargetAllies(playerPos) {
    let allies = null;
    for (const e of this.enemies) {
      if (e.alive && e.friendly) (allies ||= []).push(e);
    }
    if (!allies) return;   // the overwhelmingly common case: no summons out

    const ENGAGE = 22;     // how far from the player a companion will go to fight
    for (const ally of allies) {
      const cur = ally._target;
      if (cur?.alive && cur.position.distanceTo(playerPos) < ENGAGE * 1.4) continue;
      let best = null, bestD = ENGAGE;
      for (const foe of this.enemies) {
        if (!foe.alive || foe.friendly) continue;
        const d = foe.position.distanceTo(playerPos);
        if (d < bestD) { bestD = d; best = foe; }
      }
      ally._target = best;
    }
  }

  /**
   * ⚠️ HOSTILES ONLY. Everything that asks this question is asking
   * "what can the player hit / what can hit the player" — melee arcs,
   * Aspect areas, wand homing, the target reticle. A companion in
   * those lists means your own Echo eats your Sweep, your wand homes
   * onto it, and the reticle reads it as a threat.
   * Use `allCreatures()` for the rare case that genuinely wants both.
   */
  getEnemies() {
    return this.enemies.filter(e => e.alive && !e.friendly);
  }

  /** Companions currently manifested. */
  getAllies() {
    return this.enemies.filter(e => e.alive && e.friendly);
  }

  /** Hostiles and companions alike — physics/crowd separation only. */
  allCreatures() {
    return this.enemies.filter(e => e.alive);
  }

  /** allCreatures(), bounded by range. Crowd separation only. */
  creaturesInRange(pos, range) {
    return this.enemies.filter(e => e.alive && e.position.distanceTo(pos) < range);
  }

  getEnemiesInRange(pos, range) {
    return this.enemies.filter(e =>
      e.alive && !e.friendly && e.position.distanceTo(pos) < range
    );
  }
}
