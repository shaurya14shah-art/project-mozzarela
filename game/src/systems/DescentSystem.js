// ══════════════════════════════════════════════════════════
// Descents — running one, start to finish
//
// See data/descents.js for the design and, importantly, for WHY a
// Descent is a bounded region rather than a set of rooms (this project
// has no modular interior kit and never fetched one — that limit is
// recorded honestly in HANDOFF §7 and designed around here, not
// papered over).
//
// ── LIFECYCLE ─────────────────────────────────────────────
//   idle → enter()   the region re-lights, the boundary appears
//        → waves     N waves of element-attuned enemies, in order
//        → warden    one named unique; killing it does NOT end it
//        → resolving the seal/devour choice is open, the region stays
//                    hostile while the player decides
//        → resolve() a Trial is banked (or pointedly isn't), fragments
//                    pay out, the Gate goes dark or stays lit
//        → idle
//
// A death mid-Descent aborts to idle with NO Trial and NO fragments.
// That is the entire stake: nothing here is a checkpointed grind.
//
// ── CONTRACTS THIS FILE HONOURS ───────────────────────────
// · Fog/light: publishes a FACTOR through atmosphere, never writes
//   scene.fog.density or key.intensity. HANDOFF §4 records this being
//   broken twice by two systems silently erasing each other.
// · Ground height: getGroundY() only. Never a terrain raycast.
// · Dependencies are INJECTED via init(), not imported — enemySpawner
//   and the player live in main.js, and importing them here would
//   either be circular or would construct a scene-graph singleton at
//   module-import time, before sceneManager.init() has run. That
//   second bug class has bitten this project repeatedly (HANDOFF §3,
//   "deferred-init pattern").
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { eventBus, Events } from '../core/EventBus.js';
import { descentFor, tierInfo, RESOLUTIONS , trialKindFor } from '../data/descents.js';
import { ascentSystem } from './AscentSystem.js';
import { epithetSystem } from './EpithetSystem.js';
import { atmosphere } from '../rendering/Atmosphere.js';
import { generateDungeon, dungeonSeed, updateFlow, navStep, clearLine, spawnCells } from '../world/DungeonLayout.js';
import { buildDungeon } from '../rendering/DungeonKit.js';
import { caveSystem } from './CaveSystem.js';

const STATE = { IDLE: 'idle', WAVES: 'waves', WARDEN: 'warden', RESOLVING: 'resolving' };

class DescentSystem {
  constructor() {
    this.state = STATE.IDLE;
    this.active = null;   // {archetype, tier, info, origin, radius}
    this._spawner = null;
    this._chunkManager = null;
    this._player = null;
    this._sceneAdd = null;
    this._sceneRemove = null;

    this._wave = 0;
    this._waveEnemies = [];
    this._lastAlive = -1;
    this._lastWardenHp = -1;
    this._warden = null;
    this._boundaryMesh = null;
    this._restTimer = 0;
    this._gates = new Map();
    this._activeGate = null;
  }

  /**
   * Injected, not imported — see this file's header. Called once from
   * initGame() after sceneManager.init() and the spawner both exist.
   */
  init({ spawner, chunkManager, player, sceneAdd, sceneRemove }) {
    this._spawner = spawner;
    this._chunkManager = chunkManager;
    this._player = player;
    this._sceneAdd = sceneAdd;
    this._sceneRemove = sceneRemove;
  }

  get isActive() { return this.state !== STATE.IDLE; }

  /**
   * Where a Descent's realm sits, in world coordinates.
   *
   * A long way out, and offset per Descent so two realms can never
   * overlap even if the player somehow had two open. Deterministic from
   * the element and tier rather than random, so the same Descent is the
   * same place every time you go down it — which matters the moment
   * anything in there is remembered.
   */
  _realmOriginFor(element, tier) {
    const REALM_BAND = 500000;
    let h = 0;
    for (let i = 0; i < element.length; i++) h = (h * 31 + element.charCodeAt(i)) >>> 0;
    h = (h + tier * 7919) >>> 0;
    return new THREE.Vector3(
      REALM_BAND + (h % 997) * 300,
      0,
      REALM_BAND + ((h >>> 10) % 997) * 300,
    );
  }

  // ── GATES ───────────────────────────────────────────────
  //
  // A Gate is the world-side handle on a Descent: a placed prop with a
  // position, an element and a tier, registered by ChunkManager as its
  // chunk builds. Kept HERE rather than in ChunkManager because a Gate
  // outlives its chunk conceptually — a Descent devoured stays lit
  // forever, and that fact has to survive the chunk being unloaded and
  // rebuilt when the player walks back.

  /** Register a Gate built by ChunkManager. Idempotent per key. */
  registerGate(gate) {
    this._gates = this._gates || new Map();
    const key = `${Math.round(gate.position.x)}:${Math.round(gate.position.z)}`;
    if (this._gates.has(key)) {
      // Chunk rebuilt (HD models arrived, or the player walked back).
      // Keep the ORIGINAL record — it carries whether this Gate has
      // already been sealed or devoured, which the freshly-built prop
      // knows nothing about.
      const prev = this._gates.get(key);
      prev.mesh = gate.mesh;
      return prev;
    }
    const rec = { ...gate, key, state: 'dormant' };
    this._gates.set(key, rec);
    return rec;
  }

  /** Every Gate the player knows about, nearest first. */
  knownGates(fromPos) {
    if (!this._gates) return [];
    return [...this._gates.values()]
      .map(g => ({ ...g, dist: Math.hypot(g.position.x - fromPos.x, g.position.z - fromPos.z) }))
      .sort((a, b) => a.dist - b.dist);
  }

  /**
   * The Gate the HUD compass points at.
   *
   * Defaults to the nearest un-sealed one rather than requiring the
   * player to pick — "where is the nearest dungeon" is the question
   * being asked 95% of the time, and a tracker that needs configuring
   * before it answers anything is a worse answer than none.
   */
  trackedGate(fromPos) {
    if (this._tracked && this._gates?.has(this._tracked)) {
      const g = this._gates.get(this._tracked);
      if (g.state !== 'sealed') {
        return { ...g, dist: Math.hypot(g.position.x - fromPos.x, g.position.z - fromPos.z) };
      }
    }
    return this.knownGates(fromPos).find(g => g.state !== 'sealed') || null;
  }

  /** Pin a specific Gate (from the journal). Pass null to unpin. */
  track(key) {
    this._tracked = key;
    eventBus.emit(Events.DESCENT_PROGRESS, { phase: 'track', key });
  }

  /** Nearest Gate to a point within range, or null. */
  nearestGate(pos, range = 4.5) {
    if (!this._gates) return null;
    let best = null, bestD = range;
    for (const g of this._gates.values()) {
      const d = Math.hypot(g.position.x - pos.x, g.position.z - pos.z);
      if (d < bestD) { bestD = d; best = g; }
    }
    return best;
  }

  /** Open the Descent a Gate leads to. */
  enterGate(gate) {
    if (!gate || this.isActive) return false;
    if (gate.state === 'sealed') {
      eventBus.emit(Events.UI_NOTIFY, 'You sealed this one. It has stayed sealed.');
      return false;
    }
    this._activeGate = gate;
    return this.enter(gate.element, gate.tier, gate.position);
  }

  // ── ENTERING ────────────────────────────────────────────

  /**
   * Open a Descent at a Gate.
   *
   * @param {string} element which archetype (see DESCENTS)
   * @param {number} tier    1–5; the Ascendant tier-5 grant weakens it
   * @param {THREE.Vector3} origin the Gate's world position
   */
  enter(element, tier, origin) {
    if (this.isActive || caveSystem.isActive) return false;
    const archetype = descentFor(element);
    if (!archetype) {
      console.warn(`[Descent] no archetype for element '${element}'`);
      return false;
    }

    // The tier-5 Ascendant grant makes Descents open one tier weaker.
    // Applied here rather than at the Gate so the Gate's own label
    // still tells the truth about what the place IS, and the softening
    // is something you notice inside.
    const effTier = ascentSystem.effectiveDescentTier(tier);
    const info = tierInfo(effTier);

    // ── ⚠️ A DESCENT IS A SEPARATE REALM ──
    //
    // It used to be a bounded region carved out of the overworld at the
    // Gate's own coordinates: same ground, same sky, a cylinder drawn
    // around you. That reads as "an arena has appeared", not as "you
    // went somewhere", and the whole fiction is that a Gate is a door.
    //
    // You are now MOVED. The realm sits in a coordinate band far from
    // any overworld the player will ever walk to, offset per Descent so
    // two of them never overlap. The terrain generator produces ground
    // there the same way it does anywhere else — this costs no new
    // world-generation code, which is exactly why it is done this way
    // rather than by building a second scene.
    //
    // ⚠️ chunkManager.realmMode is set while you are down there. Gates
    // and landmarks are placed by hashes keyed on distance from spawn,
    // and at realm coordinates every chunk would qualify as deepest-
    // tier wilderness — a Descent full of Descent Gates.
    const realmOrigin = this._realmOriginFor(element, tier);
    this._returnPos = this._player ? this._player.position.clone() : null;
    // ⚠️ setRealmMode(), not the raw flag. It stashes the overworld's
    // built chunks instead of letting them be discarded and rebuilt on
    // return — see ChunkManager.setRealmMode.
    this._chunkManager.setRealmMode(true);

    // ── THE DUNGEON (world/DungeonLayout.js, rendering/DungeonKit.js) ──
    // A Descent is no longer an open disc of terrain: a seeded floor plan
    // of halls and corridors is built at the realm origin on ground
    // pressed flat for it. The floor height is read BEFORE the flat zone
    // is set (it IS the zone's height) and before any realm chunk exists,
    // so the chunks streamed in below are generated flat from the start.
    this._dungeon = null;
    try {
      const floorY = this._chunkManager.getGroundY(realmOrigin.x, realmOrigin.z);
      const layout = generateDungeon(dungeonSeed(element, effTier), info.radius);
      this._chunkManager.terrainGen.flatZone = {
        x: realmOrigin.x, z: realmOrigin.z, r0: info.radius + 18, r1: info.radius + 34, h: floorY,
      };
      this._dungeon = { layout, floorY, kit: null };
    } catch (e) {
      console.warn('[Descent] dungeon layout failed — open arena instead', e);
    }

    this.active = {
      archetype,
      element,
      nominalTier: tier,
      tier: effTier,
      info,
      // ⚠️ Deterministic on (element, tier) — the Gate can name it
      // before you walk in. See trialKindFor().
      kind: trialKindFor(element, effTier),
      origin: realmOrigin,
      gateOrigin: origin.clone(),   // where the door was, in the world
      radius: info.radius,
    };

    // Put the player on real ground in the realm before anything else
    // reads their position.
    if (this._player) {
      // In the entry hall when there is a dungeon; where it always was otherwise.
      const ent = this._dungeon?.layout.entry;
      const px = realmOrigin.x + (ent ? ent.x : 0);
      const pz = realmOrigin.z + (ent ? ent.z + ent.hd * 0.4 : info.radius * 0.55);
      this._player.position.set(px, this._chunkManager.getGroundY(px, pz) + 2, pz);
      this._player.velocity?.set(0, 0, 0);
    }
    this._chunkManager.update(realmOrigin.x, realmOrigin.z);
    this.state = STATE.WAVES;
    this._wave = 0;
    this._waveEnemies = [];
    this._warden = null;
    this._restTimer = 0;

    this._buildBoundary();
    // A factor, never a direct write — see this file's header.
    atmosphere.setDescentTint?.(archetype.color, 1);

    eventBus.emit(Events.DESCENT_ENTER, {
      element,
      kind: this.active.kind,
      name: archetype.name,
      blurb: archetype.blurb,
      tier: effTier,
      nominalTier: tier,
      tierName: info.name,
      waves: info.waves,
      warden: archetype.warden,
      softened: effTier !== tier,
    });
    this._startWave();
    return true;
  }

  // ── THE RUN ─────────────────────────────────────────────

  _startWave() {
    const { archetype, info, origin, tier } = this.active;
    this._wave++;
    this._waveEnemies = [];

    // Population scales with wave AND tier, so a late wave in a
    // Shallow Descent is still lighter than an early one in a Sunless.
    // ⚠️ The KIND shapes the fight. A Vigil sends more, weaker things;
    // a Hunt sends almost nothing because the quarry IS the trial.
    const kindMult = this.active.kind?.waveMult ?? 1;
    const count = Math.max(1, Math.round((2 + Math.floor(tier * 0.8) + Math.floor(this._wave * 0.6)) * kindMult));
    // In a dungeon a wave comes out of the rooms 12–44 m of WALKING from
    // you (the flow field's distance, not a straight line through a wall).
    let cells = [];
    if (this._dungeon && this._player) {
      updateFlow(this._dungeon.layout, this._player.position.x - origin.x, this._player.position.z - origin.z);
      cells = spawnCells(this._dungeon.layout, count);
    }
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.6;
      const r = this.active.radius * (0.45 + Math.random() * 0.4);
      const c = cells[i % Math.max(1, cells.length)];
      const x = c ? origin.x + c.x + (Math.random() - 0.5) : origin.x + Math.cos(a) * r;
      const z = c ? origin.z + c.z + (Math.random() - 0.5) : origin.z + Math.sin(a) * r;
      const y = this._chunkManager.getGroundY(x, z) + 10; // drop in, same as the ambient spawner
      const typeIndex = archetype.enemies[i % archetype.enemies.length];
      // ⚠️ Tier 1 must match the world OUTSIDE it. The old curve
      // (3 + tier*3 + wave) put level-7 creatures in a Shallow
      // Descent — while EnemySpawner's distance ramp deliberately caps
      // the overworld near spawn at level 1–2, and the nearest Gate is
      // ~224 units out. A player walked from level-2 fields straight
      // into level-7 waves and a level-9 boss. The two systems have to
      // agree about what "early" means.
      // Now: tier 1 wave 1 ≈ level 4, tier 5 wave 6 ≈ level 18.
      const level = Math.round(1 + tier * 2.5 + this._wave * 0.7);
      const e = this._spawner.spawnNamed(typeIndex, new THREE.Vector3(x, y, z), level, {
        hpMult: info.enemyScale,
        atkMult: 1 + (info.enemyScale - 1) * 0.6,
      });
      this._bindNav(e);
      this._waveEnemies.push(e);
    }

    eventBus.emit(Events.DESCENT_PROGRESS, {
      phase: 'wave',
      wave: this._wave,
      waves: info.waves,
      remaining: this._waveEnemies.length,
    });
  }

  _spawnWarden() {
    const { archetype, info, origin, tier } = this.active;
    this.state = STATE.WARDEN;
    const y = this._chunkManager.getGroundY(origin.x, origin.z) + 8;
    // A named unique forged out of an ordinary template, exactly the
    // way Vell is (spawnVell() in main.js) — NOT a new enemy class.
    // Every creature in this game needs a hard procedural fallback and
    // a new class would need its own; there is no reason to pay that.
    this._warden = this._spawner.spawnNamed(
      archetype.wardenType,
      new THREE.Vector3(origin.x, y, origin.z),
      // Same recalibration as the waves above: tier 1 ≈ 5, tier 5 ≈ 18.
      Math.round(2 + tier * 3.2),
      {
        name: archetype.warden,
        // ⚠️ The KIND shapes the Warden too — a Hunt's quarry is the
        // whole trial and is correspondingly harder, a Vigil's is an
        // afterthought because the standing was the trial.
        // ⚠️ The HP multiplier RAMPS with tier instead of being a flat
        // 2.2x. At tier 1 a 2.2x boss on top of an over-levelled body
        // was the single hardest thing a new player could meet, and it
        // was the first thing the tutorial points them at.
        hpMult: info.enemyScale * (1.5 + tier * 0.18) * (this.active.kind?.wardenHpMult ?? 1),
        atkMult: 1 + (info.enemyScale - 1) * 0.8,
        scaleMult: 1.2 + tier * 0.05,
        isBoss: true,
      },
    );
    this._bindNav(this._warden);
    this._dungeon?.kit?.setAwake(true);
    eventBus.emit(Events.DESCENT_PROGRESS, { phase: 'warden', warden: archetype.warden });
  }

  /** Hand a creature the dungeon's flow field and wall-aware sight. */
  _bindNav(e) {
    if (!e || !this._dungeon) return;
    const D = this._dungeon.layout, o = this.active.origin;
    e.nav = (pos, target, out) => {
      if (!navStep(D, pos.x - o.x, pos.z - o.z, target.x - o.x, target.z - o.z, out)) return false;
      out.x += o.x; out.z += o.z;
      return true;
    };
    e.losCheck = (a, b) => clearLine(D, a.x - o.x, a.z - o.z, b.x - o.x, b.z - o.z);
  }

  /**
   * Walls stop creatures too. Player collision lives in Player.js and
   * enemies have none of their own, so a creature is pushed back out of
   * any wall box it walked into — circle vs box in the ground plane,
   * which slides it along the face rather than sticking it.
   */
  _pushOutOfWalls() {
    const boxes = this._dungeon?.kit?.colliders;
    if (!boxes) return;
    const list = this._warden ? [...this._waveEnemies, this._warden] : this._waveEnemies;
    for (const e of list) {
      if (!e?.alive || !e.position) continue;
      const p = e.position;
      const r = 0.45 * (e.mesh?.scale?.x || 1);
      for (const b of boxes) {
        if (p.x + r < b.min.x || p.x - r > b.max.x || p.z + r < b.min.z || p.z - r > b.max.z) continue;
        const cx = Math.max(b.min.x, Math.min(p.x, b.max.x));
        const cz = Math.max(b.min.z, Math.min(p.z, b.max.z));
        const dx = p.x - cx, dz = p.z - cz;
        const d = Math.hypot(dx, dz);
        if (d > 1e-4) {
          if (d >= r) continue;
          p.x += (dx / d) * (r - d); p.z += (dz / d) * (r - d);
        } else {
          // Centre inside the box: out along the shallowest side.
          const m = [p.x - b.min.x, b.max.x - p.x, p.z - b.min.z, b.max.z - p.z];
          const k = m.indexOf(Math.min(...m));
          if (k === 0) p.x = b.min.x - r; else if (k === 1) p.x = b.max.x + r;
          else if (k === 2) p.z = b.min.z - r; else p.z = b.max.z + r;
        }
        if (e.mesh) { e.mesh.position.x = p.x; e.mesh.position.z = p.z; }
      }
    }
  }

  update(dt) {
    if (!this.isActive || !this._player) return;

    this._animatePyres(dt);
    if (this._dungeon?.kit) {
      this._dungeon.kit.update(dt);
      const o = this.active.origin, pp = this._player.position;
      updateFlow(this._dungeon.layout, pp.x - o.x, pp.z - o.z);   // no-op until you change cell
      this._pushOutOfWalls();
    }

    // Leaving the boundary is not blocked — it aborts. A wall you can
    // walk into is a wall that can trap you if the maths is ever
    // wrong, which is the same reasoning that keeps the Sanctuary's
    // castle ring deliberately broken (HANDOFF §4).
    const p = this._player.position;
    const d = Math.hypot(p.x - this.active.origin.x, p.z - this.active.origin.z);
    if (d > this.active.radius + 6) {
      this.abort('You walked out. It stays exactly as you left it.');
      return;
    }

    if (this.state === STATE.WAVES) {
      const alive = this._waveEnemies.filter(e => e.alive).length;
      // ⚠️ Republish on CHANGE. DESCENT_PROGRESS used to fire only when
      // a wave SPAWNED, so the tracker read "Wave 1 of 3" from the
      // first second to the last and never told the player how many
      // were left or what finishing it required. "Not visible at all
      // what the player needs to do" is precisely that.
      if (alive !== this._lastAlive) {
        this._lastAlive = alive;
        eventBus.emit(Events.DESCENT_PROGRESS, {
          phase: 'wave',
          wave: this._wave,
          waves: this.active.info.waves,
          remaining: alive,
        });
      }
      if (alive === 0) {
        // A beat between waves, so clearing one reads as an
        // accomplishment rather than as the next one already starting.
        this._restTimer -= dt;
        if (this._restTimer <= 0) {
          if (this._wave >= this.active.info.waves) this._spawnWarden();
          else { this._restTimer = 3.0; this._startWave(); }
        }
      } else {
        this._restTimer = 3.0;
      }
    } else if (this.state === STATE.WARDEN) {
      // The Warden's health is the objective now, so it has to be live.
      if (this._warden?.alive) {
        const hp = Math.max(0, Math.round((this._warden.hp / this._warden.maxHp) * 100));
        if (hp !== this._lastWardenHp) {
          this._lastWardenHp = hp;
          eventBus.emit(Events.DESCENT_PROGRESS, {
            phase: 'warden',
            warden: this.active.archetype.warden,
            wardenHp: hp,
          });
        }
      }
      if (this._warden && !this._warden.alive) {
        this.state = STATE.RESOLVING;
        eventBus.emit(Events.DESCENT_RESOLVED, {
          element: this.active.element,
          name: this.active.archetype.name,
          warden: this.active.archetype.warden,
          tier: this.active.tier,
          // Both options, always, to both paths. Taking the one your
          // ladder doesn't count is allowed — see descents.js's header.
          options: [RESOLUTIONS.seal, RESOLUTIONS.devour],
          yours: ascentSystem.verb,
        });
      }
    }
  }

  // ── RESOLVING ───────────────────────────────────────────

  /**
   * Close out a Descent whose Warden is dead.
   * @param {'seal'|'devour'} verb
   * @returns {object|null} payout summary
   */
  resolve(verb) {
    if (this.state !== STATE.RESOLVING) return null;
    const res = RESOLUTIONS[verb];
    if (!res) return null;

    const { archetype, tier, info, element } = this.active;
    const [lo, hi] = info.fragments;
    // ⚠️ The Deep-Delver's `spoilMult` is read HERE, on the raw roll,
    // so it scales what a Descent pays rather than being a separate
    // bonus bolted on after the kind-bias split below — the bias is a
    // ratio and multiplying it twice would compound.
    const spoilMult = epithetSystem.grant('spoilMult', 1);
    const fragments = Math.round((lo + Math.floor(Math.random() * (hi - lo + 1))) * spoilMult);

    // recordTrial() itself rejects a verb the player's ladder doesn't
    // count, and says so out loud via ASCENT_BLOCKED. Deliberately not
    // pre-checked here: the player still cleared the place, still gets
    // paid, and finds out that the ladder disagrees — which is the
    // lesson, and it lands harder as a consequence than as a warning.
    const banked = ascentSystem.recordTrial({ tier, element, descentId: archetype.name, verb });

    // ── THE KIND DECIDES WHAT IT PAYS ───────────────────
    // ⚠️ The reference's actual requirement: the flavour of the
    // challenge decides the flavour of the reward, so players
    // diversify by choosing which trials to take. `bias` names one of
    // the four build knobs; `_payBias` is what actually hands it over.
    const kind = this.active.kind;
    const bias = kind?.bias || 'cores';
    // A Cull pays its fragments in full; every other kind trades some
    // of that crafting input for its own category. Nothing pays
    // nothing — a trial that gave no cores at all would make three of
    // the four kinds useless for forging.
    const fragmentsPaid = bias === 'cores' ? fragments : Math.max(1, Math.round(fragments * 0.55));

    const payout = {
      verb,
      line: res.line,
      kind: kind || null,
      bias,
      fragmentId: archetype.fragment,
      fragments: fragmentsPaid,
      tier,
      element,
      name: archetype.name,
      warden: archetype.warden,
      trialBanked: banked,
      // Devouring binds the Warden as a Revenant; sealing does not —
      // you cannot both put something back and keep it.
      revenant: null,   // ⚠️ STEEL: no Echoes — a devoured Warden no longer follows you out
    };

    // The Gate remembers. Sealed Gates never reopen; devoured ones
    // stay lit and can be walked back into — which is the mechanical
    // half of "you left it open."
    if (this._activeGate) {
      this._activeGate.state = verb === 'seal' ? 'sealed' : 'devoured';
      this._activeGate = null;
    }

    this._payBias(bias, payout);
    eventBus.emit(Events.DESCENT_EXIT, payout);
    if (payout.revenant) {
      eventBus.emit(Events.REVENANT_BOUND, { name: payout.revenant, element, tier });
    }
    this._teardown();
    return payout;
  }

  /**
   * Hand over the category this trial kind favours.
   *
   * ⚠️ Emits rather than reaching into MarkSystem / MemoryForge
   * directly. DescentSystem already takes its dependencies by
   * injection precisely so it does not import half the game, and a
   * reward path is not a good reason to break that.
   */
  _payBias(bias, payout) {
    switch (bias) {
      case 'marks':
        // A Vigil is *standing in it long enough to be changed*, which
        // is exactly what a Mark is for.
        eventBus.emit(Events.DESCENT_MARK_EARNED, { payout });
        break;
      // ⚠️ STEEL: no Memories or Echoes out of a Descent any more —
      // main.js pays smithing stock and steel on DESCENT_EXIT instead.
      case 'memories':
      case 'echoes':
        break;
      default:
        break;
    }
  }

  /** End with nothing — death, or walking out. */
  abort(reason) {
    if (!this.isActive) return;
    const name = this.active.archetype.name;
    this._teardown();
    eventBus.emit(Events.DESCENT_EXIT, { aborted: true, reason, name });
  }

  // ── REGION ──────────────────────────────────────────────

  /**
   * The visible boundary. An open-topped cylinder in the element's
   * colour, additive and double-sided so it reads from inside and out.
   *
   * Not a collider. See update()'s note — the boundary aborts the
   * Descent rather than stopping the player, because a wall that can
   * trap you is worse than one you can leave through.
   */
  _buildBoundary() {
    const { radius, origin, archetype } = this.active;
    const y = this._chunkManager.getGroundY(origin.x, origin.z);
    if (this._dungeon) {
      try {
        const kit = buildDungeon(this._dungeon.layout, {
          origin, floorY: this._dungeon.floorY, element: this.active.element, color: archetype.color,
        });
        this._dungeon.kit = kit;
        this._sceneAdd?.(kit.group);
        // ⚠️ Player collision reads chunkManager.colliders. Tagged with
        // the dungeon group as `mesh` so teardown removes exactly these.
        for (const box of kit.colliders) this._chunkManager.colliders.push({ box, mesh: kit.group });
        // The walls are the boundary now; the pyres move into the halls.
        this._buildPyres(origin, radius, y, archetype, kit.pyreSpots);
        return;
      } catch (e) {
        console.warn('[Descent] dungeon build failed — open arena instead', e);
        this._dungeon = null;
        if (this._chunkManager.terrainGen) this._chunkManager.terrainGen.flatZone = null;
      }
    }
    const geo = new THREE.CylinderGeometry(radius, radius, 26, 64, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: archetype.color,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this._boundaryMesh = new THREE.Mesh(geo, mat);
    this._boundaryMesh.position.set(origin.x, y + 13, origin.z);
    this._boundaryMesh.renderOrder = 2;
    this._sceneAdd?.(this._boundaryMesh);

    this._buildPyres(origin, radius, y, archetype);
  }

  /**
   * Pyres — the light you actually fight by.
   *
   * ⚠️ A Descent had NO light sources at all. The handoff's line about
   * "the element's own emissive light and the boundary become the
   * things you navigate by" described an intent nothing implemented:
   * the boundary is `MeshBasicMaterial` (it emits nothing, it is just
   * a bright surface), so the arena was lit by a key light crushed to
   * 0.45 and an ambient floor at 0.55 and that was the entire budget.
   * Combined with fog closing to ~22 units it was not dark, it was
   * blind — and "a fight you cannot see is not atmospheric, it is
   * broken" is this project's own rule.
   *
   * These are real point lights, so they give DIRECTION — which is the
   * thing ambient cannot do and the reason the fix is not simply
   * "raise ambient" (that flattens the scene, see Atmosphere's note).
   * Ringed just inside the boundary, so they also read as the edge of
   * the arena from anywhere inside it.
   *
   * ⚠️ Point-light BUDGET: SceneManager keeps only the nearest 8 lights
   * active because three.js bakes light COUNT into every shader, and a
   * chunk streaming in with one more brazier recompiles every material
   * (HANDOFF §4 — one frame at 667ms). Eight pyres is deliberately at
   * that budget and not above it.
   */
  _buildPyres(origin, radius, y, archetype, spots = null) {
    this._pyres = [];
    const N = spots ? spots.length : 8;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const px = spots ? spots[i].x : origin.x + Math.cos(a) * (radius * 0.82);
      const pz = spots ? spots[i].z : origin.z + Math.sin(a) * (radius * 0.82);
      const py = this._chunkManager.getGroundY(px, pz);

      const g = new THREE.Group();
      g.position.set(px, py, pz);

      // A stroked iron basket — ornament is geometry in this project,
      // never texture (§3).
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.17, 2.2, 6),
        new THREE.MeshStandardMaterial({ color: 0x1e1a16, roughness: 0.8, metalness: 0.4 }),
      );
      post.position.y = 1.1;
      g.add(post);

      const bowl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.3, 0.5, 8, 1, true),
        new THREE.MeshStandardMaterial({
          color: 0x241f19, roughness: 0.7, metalness: 0.5, side: THREE.DoubleSide,
        }),
      );
      bowl.position.y = 2.4;
      g.add(bowl);

      // The one emissive focal point per object (§3).
      const flame = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.42, 1),
        new THREE.MeshStandardMaterial({
          color: archetype.color,
          emissive: archetype.color,
          emissiveIntensity: 2.6,
          roughness: 0.4,
          toneMapped: false,
        }),
      );
      flame.position.y = 2.65;
      flame.name = 'pyre-flame';
      g.add(flame);

      // In a dungeon a pyre lights its own hall, not the whole disc.
      const light = new THREE.PointLight(archetype.color, 9.0, spots ? 30 : radius * 1.25, 2);
      light.position.y = 2.7;
      light.name = 'pyre-light';
      g.add(light);

      this._sceneAdd?.(g);
      this._pyres.push(g);
    }
  }

  /** Gutter the pyres so the arena is not lit by eight steady bulbs. */
  _animatePyres(dt) {
    if (!this._pyres?.length) return;
    this._pyreT = (this._pyreT || 0) + dt;
    for (let i = 0; i < this._pyres.length; i++) {
      const g = this._pyres[i];
      const t = this._pyreT * 3.1 + i * 1.7;
      const f = 0.86 + Math.sin(t) * 0.09 + Math.sin(t * 2.7) * 0.05;
      const light = g.children.find(c => c.name === 'pyre-light');
      const flame = g.children.find(c => c.name === 'pyre-flame');
      if (light) light.intensity = 9.0 * f;
      if (flame) {
        flame.scale.setScalar(0.92 + f * 0.12);
        flame.rotation.y += dt * 0.9;
      }
    }
  }

  _disposePyres() {
    for (const g of (this._pyres || [])) {
      this._sceneRemove?.(g);
      g.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        // These materials are built per-pyre here, not from the shared
        // EntityForge cache, so disposing them is safe.
        if (o.isMesh && o.material) o.material.dispose();
      });
    }
    this._pyres = [];
  }

  _teardown() {
    // Back through the door, onto the ground you left from. Restored
    // BEFORE the boundary and lights are disposed so nothing reads a
    // realm position for a frame after the realm has stopped existing.
    if (this._dungeon) {
      const kit = this._dungeon.kit;
      if (kit) {
        this._sceneRemove?.(kit.group);
        const cm = this._chunkManager;
        cm.colliders = cm.colliders.filter(c => c.mesh !== kit.group);
        kit.dispose();
      }
      this._dungeon = null;
    }
    if (this._chunkManager?.terrainGen) this._chunkManager.terrainGen.flatZone = null;
    if (this._chunkManager) this._chunkManager.setRealmMode(false);
    if (this._returnPos && this._player) {
      this._player.position.copy(this._returnPos);
      this._player.position.y =
        this._chunkManager.getGroundY(this._returnPos.x, this._returnPos.z) + 2;
      this._player.velocity?.set(0, 0, 0);
      this._chunkManager.update(this._returnPos.x, this._returnPos.z);
      this._returnPos = null;
    }
    if (this._boundaryMesh) {
      this._sceneRemove?.(this._boundaryMesh);
      this._boundaryMesh.geometry.dispose();
      this._boundaryMesh.material.dispose();
      this._boundaryMesh = null;
    }
    this._disposePyres();
    atmosphere.setDescentTint?.(null, 0);
    // Anything still alive from the run goes with it — a cleared
    // Descent that leaves half a wave wandering the overworld turns
    // every Gate into a permanent difficulty increase for the region.
    for (const e of this._waveEnemies) if (e?.alive) e.alive = false;
    this._waveEnemies = [];
    this._warden = null;
    this.active = null;
    this.state = STATE.IDLE;
    this._wave = 0;
  }

  /** True while a dungeon stands (main.js hides grass and flora). */
  get dungeonActive() { return !!this._dungeon?.kit; }

  snapshot() {
    if (!this.isActive) return null;
    return {
      name: this.active.archetype.name,
      element: this.active.element,
      tier: this.active.tier,
      tierName: this.active.info.name,
      state: this.state,
      wave: this._wave,
      waves: this.active.info.waves,
      remaining: this._waveEnemies.filter(e => e.alive).length,
      warden: this.active.archetype.warden,
      wardenAlive: !!this._warden?.alive,
    };
  }
}

export const descentSystem = new DescentSystem();
export { STATE as DESCENT_STATE };
