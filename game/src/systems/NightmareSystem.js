// ══════════════════════════════════════════════════════════
// THE FIRST NIGHTMARE — runtime
//
// Owner: *"I need to randomly spawn on one of the big places... and
// then after getting out I spawn into the regular world just like
// Shadow Slave"*, plus *"first should be a trial to decide your innate
// powers, which is unique to everyone"* and *"each trial should be
// unique as well."*
//
// The opening is now: wake alone in a named region of the realm, be
// given a trial that is yours, survive it, receive an Aspect and the
// Flaw that pays for it, and only then walk out into the waking world.
//
// ── ⚠️ WHAT THIS SYSTEM OWNS, AND WHAT IT MUST NOT ────────
// It owns: which region you woke in, the trial's progress, and the
// one-time grant at the end. It does NOT own your stats — the grant is
// published as CONTRIBUTIONS which `Player.recomputeStats()` folds in,
// because that function is the sole writer of `stats.atk`/`stats.def`
// and this project has broken that rule four times (trap #9).
//
// ⚠️ THE TRIAL IS NOT STORED, ONLY ITS SEED. `generateNightmare()` is
// pure, so six bytes of seed reproduce the whole thing — title,
// warden, kind, goal, Aspect, Flaw. Storing the object would mean a
// save written today disagreeing with a rebalanced table tomorrow,
// and a player's own Nightmare silently changing under them.
//
// ⚠️ COMPLETION IS IDEMPOTENT. `_granted` guards the reward, because
// every path that can finish a trial (goal met, Warden killed, the
// debug skip) would otherwise be able to grant the Aspect again — and
// a +22% vitality bonus applied twice is invisible until someone
// wonders why one character is unkillable.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';
import { generateNightmare, nightmareHash } from '../data/nightmares.js';
import { pickNightmareRegion, regionSpawnPoint, REGIONS_BY_ID } from '../data/realm.js';
import { TerrainGenerator } from '../world/TerrainGenerator.js';
import { loadout } from './LoadoutSystem.js';

/** Phases. `none` is a Pioneer who has already woken — the normal game. */
export const PHASE = { NONE: 'none', TRIAL: 'trial', WAKING: 'waking' };

class NightmareSystem {
  constructor() {
    this.phase = PHASE.NONE;
    this.trial = null;
    this.progress = 0;
    this.seed = null;
    this.region = null;
    /** Where the Waking Gate stands once the trial is done. */
    this.gate = null;
    this._granted = false;
    this._elapsed = 0;
    this.player = null;
    this.spawner = null;
    this.chunkManager = null;
  }

  init({ player, spawner, chunkManager } = {}) {
    this.player = player || null;
    this.spawner = spawner || null;
    this.chunkManager = chunkManager || null;

    // ⚠️ Kills are counted from COMBAT_KILL rather than polled from the
    // spawner's list. A creature that wanders off and despawns would
    // otherwise decrement a "how many are left" count and read as a
    // kill the player never made — the same reasoning the Descent wave
    // counter already uses.
    eventBus.on(Events.COMBAT_KILL, (d) => {
      if (this.phase !== PHASE.TRIAL) return;
      if (!d?.byPlayer) return;
      if (this.trial?.kindId === 'hunt') this._advance(1);
      if (this.trial?.kindId === 'outlast' && d.isWarden) this._advance(1);
    });
  }

  /** Has this Pioneer already woken into the world? */
  get isAwake() { return this.phase === PHASE.NONE; }
  get inNightmare() { return this.phase !== PHASE.NONE; }

  /**
   * Begin a brand-new Pioneer's First Nightmare.
   *
   * ⚠️ The seed is the CHARACTER's, not the world's. The world seed is
   * `Math.random()` per load (trap #45), so seeding from it would give
   * a player a different First Nightmare every time they reloaded
   * before finishing one.
   */
  begin(characterName) {
    this.seed = `${characterName || 'Pioneer'}:${Date.now()}`;
    this._start();
    return this.trial;
  }

  /** Rebuild from a save. Same seed → same Nightmare, by construction. */
  restore({ seed, phase, progress, regionId, granted }) {
    if (!seed) return;
    this.seed = seed;
    this._start(regionId);
    this.phase = PHASE.NONE;   // ⚠️ STEEL: see _start — an old save in a trial wakes out of it
    void phase;
    this.progress = progress || 0;
    this._granted = !!granted;
    // ══════════════════════════════════════════════════════
    // ⚠️ THE INNATE POWER MUST BE RE-APPLIED ON EVERY LOAD.
    //
    // `_applyInnate()` used to run only inside `complete()`, so a
    // Pioneer who reloaded came back REMEMBERING their Aspect and not
    // having it: the trial, the title and the Aspect's name all
    // restored correctly while `maxHp` was back to 100. Measured
    // exactly that way — 122 before the reload, 100 after, with the
    // character sheet still proudly reporting "Unbroken".
    //
    // Re-deriving is correct rather than a workaround: the grant is a
    // pure function of the seed, exactly like the gear letters and the
    // Aspect names, so the load path SHOULD rebuild it. What must not
    // happen is applying it twice — hence the `_innateHpApplied` /
    // `_innateMpApplied` flags, which live on the PLAYER and are
    // therefore fresh on every load, making this idempotent per
    // session.
    // ══════════════════════════════════════════════════════
    // ⚠️ NOT APPLIED HERE — see `reapplyInnate()`. `SaveSystem.restore()`
    // runs `put('nightmare')` BEFORE `put('player')`, and the player
    // block recomputes `maxHp` from level, so a grant applied at this
    // point is silently overwritten moments later. Measured: the Flaw
    // (a multiplier the player folds in per frame) survived while the
    // Aspect (an absolute pool) came back at 100 — which is exactly
    // the fingerprint of a later writer, not of a grant that failed.
    // main.js calls `reapplyInnate()` once the whole restore settles.

    this._publishWarp();

    // ⚠️ Re-published AFTER the restored phase is set — `_start()`
    // above always leaves the phase as TRIAL, so a Pioneer restored
    // as already-awake would otherwise keep a cap they should not have.
    this._publishCap();

    // ⚠️ A restored WAKING phase still needs its Gate rebuilt, or a
    // player who saved between finishing the trial and stepping
    // through has no way out and is stranded in the realm forever.
    if (this.phase === PHASE.WAKING) this._openGate();
  }

  _start(forcedRegionId = null) {
    const rand = this._rng('region');
    this.region = forcedRegionId
      ? (REGIONS_BY_ID[forcedRegionId] || pickNightmareRegion(rand))
      : pickNightmareRegion(rand);
    this.trial = generateNightmare(this.seed, this.region);
    // ⚠️ STEEL: the First Nightmare is REMOVED (owner: "remove the
    // Shadow Slave system completely"). A Pioneer starts in the world,
    // never inside a trial; the seed is still kept so old saves load.
    this.phase = PHASE.NONE;
    this.progress = 0;
    this._elapsed = 0;
    this._granted = false;
    this.gate = null;
    if (this.spawner) this.spawner.trialSpawned = 0;
    this._publishCap();
    this._publishWarp();
  }

  /**
   * Push the trial's enemy-level ceiling to the spawner.
   *
   * ⚠️ Called the MOMENT a trial exists, not just from `update()`. The
   * world streams in during the `chunkManager.update()` that runs
   * before `engine.start()`, so ambient spawning happens once BEFORE
   * the first frame — and a cap published only per-frame let exactly
   * one uncapped creature through. Measured: eight level-2 enemies and
   * a single **level 12** standing 44 units from a level-1 Pioneer.
   * One is enough to kill them.
   */
  _publishCap() {
    if (!this.spawner) return;
    const inTrial = this.phase === PHASE.TRIAL;
    this.spawner.trialCap = inTrial ? Math.max(2, (this.player?.level || 1) + 1) : null;
    // ⚠️ Derived from the player's ACTUAL maxHp, so the Aspect that
    // raised it (Unbroken) genuinely makes the trial easier and the
    // Flaw that lowered it (Thin-Blooded) genuinely makes it harder —
    // the innate power affects the fight instead of being a number on
    // a sheet. ~9% means roughly eleven blows before death, against
    // the five it was.
    this.spawner.trialAtkCap = inTrial
      ? Math.max(4, Math.round((this.player?.maxHp || 160) * 0.09))
      : null;

    // ⚠️ A TOTAL, scaled to what the trial actually asks for. A hunt
    // for 2 needs enough to kill plus a margin; an endure needs enough
    // pressure to make 20 seconds uncomfortable and then to STOP.
    // Without this the spawner re-armed forever and the owner
    // reported, correctly, "practically infinite enemies".
    if (inTrial) {
      const goal = this.trial?.goal || 2;
      const isKill = this.trial?.kindId === 'hunt';
      this.spawner.trialBudget = isKill ? goal + 4 : 8;
      // ⚠️ Reset only when a NEW trial starts, never here — this runs
      // every frame, and re-arming the budget per frame is the same
      // infinite spawner with extra steps.
    } else {
      this.spawner.trialBudget = null;
    }
  }

  /**
   * Publish (or clear) the warp that makes a Nightmare's ground read
   * as a Nightmare rather than as the region with harder enemies in it.
   *
   * ⚠️ Centred on the REGION, not on the player. Centred on the player
   * the rings would follow them around like a spotlight and the whole
   * effect would read as a shader bug; centred on the region they are
   * a fixed feature of the place, and walking changes your relationship
   * to them the way walking past a real hill does.
   *
   * ⚠️ ONE WRITER. `TerrainGenerator.nightmareWarp` is set here and
   * nowhere else — it is the shape of the world, and this project's
   * recurring architecture bug is two writers to one field (trap #9).
   */
  _publishWarp() {
    if (this.phase === PHASE.TRIAL && this.region) {
      TerrainGenerator.nightmareWarp = {
        active: true,
        x: this.region.x,
        z: this.region.z,
        radius: this.region.radius * 1.15,
        strength: 1,
      };
    } else {
      TerrainGenerator.nightmareWarp = null;
    }
  }

  /**
   * Hand the Pioneer their innate power AS THEY ENTER.
   *
   * ⚠️ AT THE START, NOT AS A REWARD. Owner: *"the innate powers should
   * be given at the start of the trial."* This is the right way round
   * for the fiction and for the play: the Aspect is what you ARE, not
   * a prize for surviving — and a trial you enter with nothing is a
   * trial where the power that defines you had no part in how you got
   * through it. Granting it on completion also meant the Flaw only
   * ever cost you AFTER the one fight it might have mattered in.
   *
   * ⚠️ Still guarded by `_granted`, so re-entering, reloading or
   * completing cannot stack it.
   */
  grantInnateNow() {
    // ⚠️ STEEL: the Aspect + Flaw at birth is cut (owner: too close to
    // Shadow Slave). Nothing is granted; you are only what you train.
    return null;
    // eslint-disable-next-line no-unreachable
    if (this._granted || !this.trial) return null;
    this._granted = true;
    this._applyInnate();
    return { aspect: this.trial.aspect, flaw: this.trial.flaw };
  }

  /** A deterministic 0..1 generator bound to this Pioneer's seed. */
  _rng(salt) {
    let n = 0;
    return () => {
      n++;
      return nightmareHash(`${salt}:${this.seed}:${n}`) / 4294967296;
    };
  }

  /** Where this Pioneer wakes. */
  spawnPoint() {
    if (!this.region) return { x: 0, z: 0 };
    return regionSpawnPoint(this.region, this._rng('spawn'));
  }

  _advance(n) {
    if (this.phase !== PHASE.TRIAL) return;
    this.progress = Math.min(this.trial.goal, this.progress + n);
    eventBus.emit(Events.UI_NOTIFY,
      `${this.trial.kind.progressLabel}: ${Math.floor(this.progress)} / ${this.trial.goal}`);
    if (this.progress >= this.trial.goal) this.complete();
  }

  update(dt) {
    // ⚠️ The cap is published EVERY FRAME while a trial runs, and
    // cleared the moment one is not. Setting it once at `begin()`
    // would leave it applied for the rest of the session after the
    // player wakes — a permanently easy world — and setting it only on
    // restore would miss a fresh character entirely.
    this._publishCap();
    this._publishWarp();
    if (this.phase !== PHASE.TRIAL || !this.trial) return;
    this._elapsed += dt;

    if (this.trial.kindId === 'endure') {
      // ⚠️ Reported on whole seconds only. Emitting a notification per
      // frame would be 60 UI events a second for a minute and a half.
      const before = Math.floor(this.progress);
      this.progress = Math.min(this.trial.goal, this.progress + dt);
      if (Math.floor(this.progress) !== before && Math.floor(this.progress) % 15 === 0) {
        eventBus.emit(Events.UI_NOTIFY,
          `${Math.floor(this.progress)} / ${this.trial.goal} seconds.`);
      }
      if (this.progress >= this.trial.goal) this.complete();
      return;
    }

    if (this.trial.kindId === 'reach' && this.player) {
      const m = this.marker();
      const d = Math.hypot(this.player.position.x - m.x, this.player.position.z - m.z);
      if (d < 14) this._advance(1);
      return;
    }

    if (this.trial.kindId === 'gather' && this.player) {
      // Shards are fixed points derived from the seed; walking onto one
      // claims it. Kept in this system rather than as world pickups so
      // a trial cannot be failed by an item despawning.
      const pts = this.shards();
      for (const p of pts) {
        if (p.taken) continue;
        if (Math.hypot(this.player.position.x - p.x, this.player.position.z - p.z) < 11) {
          p.taken = true;
          this._advance(1);
        }
      }
    }
  }

  /** The far marker for a `reach` trial — deterministic, inside the region. */
  marker() {
    if (this._marker) return this._marker;
    const r = this._rng('marker');
    const a = r() * Math.PI * 2;
    const d = this.region.radius * 0.72;
    this._marker = { x: this.region.x + Math.cos(a) * d, z: this.region.z + Math.sin(a) * d };
    return this._marker;
  }

  /** The shard points for a `gather` trial. */
  shards() {
    if (this._shards) return this._shards;
    const r = this._rng('shards');
    this._shards = [];
    for (let i = 0; i < this.trial.goal; i++) {
      const a = r() * Math.PI * 2;
      const d = this.region.radius * (0.25 + r() * 0.45);
      this._shards.push({
        x: this.region.x + Math.cos(a) * d,
        z: this.region.z + Math.sin(a) * d,
        taken: false,
      });
    }
    return this._shards;
  }

  /**
   * The trial is passed. Grant the innate power and open the way out.
   *
   * ⚠️ Guarded by `_granted`, not by phase alone. Several paths reach
   * here and a double grant is silent.
   */
  complete() {
    if (this.phase !== PHASE.TRIAL) return;
    this.phase = PHASE.WAKING;
    // ⚠️ The Aspect was granted on ENTRY (`grantInnateNow`), not here.
    // This only announces the ending.
    eventBus.emit(Events.UI_NOTIFY,
      `${this.trial.title} is over. You carry ${this.trial.aspect.name} out of it.`);
    this._openGate();
  }

  /**
   * Fold the Aspect and Flaw into the player.
   *
   * ⚠️ PUBLISHED AS CONTRIBUTIONS, never assigned. `recomputeStats()`
   * is the sole writer of `stats.atk`/`stats.def` (trap #9) — writing
   * them here would make gear, levels and this grant each erase the
   * others, which is a bug this project has now hit four times.
   *
   * ⚠️ EVERY key in INNATE_ASPECTS / INNATE_FLAWS is read here. A
   * grant nothing reads is worse than no grant, because the character
   * sheet reports it as applied (§7.9).
   */
  _applyInnate() {
    const p = this.player;
    if (!p || !this.trial) return;
    const fold = (g) => {
      if (!g) return;
      if (g.maxHpMult)         p.innateHpMult      = (p.innateHpMult      || 1) * g.maxHpMult;
      if (g.maxMpMult)         p.innateMpMult      = (p.innateMpMult      || 1) * g.maxMpMult;
      if (g.moveMult)          p.innateMoveMult    = (p.innateMoveMult    || 1) * g.moveMult;
      if (g.atkMult)           p.innateAtkMult     = (p.innateAtkMult     || 1) * g.atkMult;
      if (g.defFlat)           p.innateDef         = (p.innateDef         || 0) + g.defFlat;
      if (g.staminaRegenMult)  p.innateStamMult    = (p.innateStamMult    || 1) * g.staminaRegenMult;
      if (g.lifestealPct)      p.innateLifesteal   = (p.innateLifesteal   || 0) + g.lifestealPct;
      if (g.essenceMult)       p.innateEssenceMult = (p.innateEssenceMult || 1) * g.essenceMult;
    };
    fold(this.trial.aspect.grant);
    fold(this.trial.flaw.grant);

    // ══════════════════════════════════════════════════════
    // ⚠️ THE ASPECT BECOMES A THING ON THE HOTBAR.
    //
    // Owner: *"I don't have my aspects to fight them."* Measured on a
    // fresh trial: 0 hotbar abilities, no weapon, an 18-atk wand
    // against nine enemies. The Aspect edited a stat and gave the
    // player nothing to press.
    //
    // ⚠️ Delivered as a MEMORY through the ordinary loadout, not as a
    // bespoke ability slot. That reuses the whole existing pipeline —
    // the 1..9 bar, cooldowns keyed on `memoryId:abilityKey`, the
    // bindings panel, the satchel readout, ASPECT_USED — instead of
    // adding a second way for the player to have a power, which is
    // two things to keep in agreement forever.
    //
    // ⚠️ Its own `formId: 'innate'` budget, uncapped and limited to
    // one. Filing it as a charm would spend one of the player's two
    // trinket slots permanently on something they cannot put down.
    // ══════════════════════════════════════════════════════
    const ab = this.trial.aspect.ability;
    if (ab && loadout) {
      loadout.hold({
        id: `innate:${this.trial.aspect.key}`,
        isMemory: true, formId: 'innate', formName: 'Innate', equips: 'passive',
        // ══════════════════════════════════════════════════
        // ⚠️ NEUTRAL, NOT SHADOW — THIS WAS THE WHOLE "MY ABILITIES DO
        // NOTHING" BUG.
        //
        // Owner: *"the difficulty of the initial trial is horrendously
        // hard, the abilities aren't effective."* Measured live in a
        // real trial, one raw-40 hit against each creature the Dreaming
        // City actually spawns:
        //
        //     creature            neutral   shadow   light
        //     Soul Reaver            47       18      193
        //     Count Mordrevain       47       15      215
        //     Lychgate Stalker       12       47      104
        //
        // Two of the three RESIST shadow by ~3x. The innate Memory and
        // its ability were both hardcoded `'shadow'`, so the one power
        // a Pioneer owns for the entire first fight was rolling into a
        // resistance on most of what it met — the single worst element
        // available against the biome the trial drops you into.
        //
        // ⚠️ Neutral is not a compromise, it is the correct type. The
        // composition table gives neutral a flat ~1.18x against
        // everything and a resistance against nothing, and an innate
        // power granted BEFORE the player has any attunement should
        // not carry an element they never chose. An elemental innate
        // would also make the trial's difficulty depend on the region
        // roll — Godgrave and the Dreaming City resist different
        // things, so the same Aspect would be strong or useless
        // depending on where you woke up. That is not difficulty.
        // ══════════════════════════════════════════════════
        name: this.trial.aspect.name, element: 'neutral',
        grade: { level: 3, name: 'Innate' },
        tier: { level: 3, name: 'Innate', color: '#cfd6e2' },
        attributes: {}, signs: [], coreWeight: 0,
        // ══════════════════════════════════════════════════
        // ⚠️ `power` IS WHY THE FIRST VERSION HIT FOR NOTHING.
        //
        // Every damaging branch in ASPECT_USED reads
        // `const power = (memory.power || 20)`. The innate Memory had
        // no `power` field at all, so every innate ability in the game
        // fell to the default 20 and then multiplied it — against
        // creatures with 28-53 HP, with the player's own attack at 18.
        // The Aspect was not weak by design; it was reading a fallback.
        //
        // ⚠️ Scaled from the PLAYER's attack, not a constant, so the
        // innate power grows with them instead of becoming worthless
        // by level 5 — and so the Sharpened Aspect's own +18% attack
        // feeds its ability, which is the coupling that makes an
        // innate power feel like one thing rather than two unrelated
        // bonuses.
        // ══════════════════════════════════════════════════
        power: Math.max(34, Math.round((this.player?.stats?.atk || 18) * 2.1)),
        abilities: [{
          key: ab.key, name: ab.name, active: true,
          cost: ab.cost, cooldown: ab.cooldown, line: ab.line,
          // ⚠️ Kept in step with the Memory's element above. The damage
          // element actually comes from the MEMORY (`ASPECT_USED` opens
          // with `const el = memory.element || 'neutral'`), so this
          // field is not what was doing the harm — but leaving the two
          // disagreeing is how the next reader concludes the ability is
          // shadow-typed and puts the resist back.
          attribute: 'willpower', element: 'neutral',
          // ⚠️ Generous numbers on purpose. `n` is a RADIUS for the
          // area branches and a COUNT for the scattering ones, and at
          // the defaults these read as a puff of smoke — this is the
          // one ability the player has for the whole first fight.
          effect: { [ab.key]: { pct: 40, dur: 6, mult: '2.2', n: 6 } },
        }],
      });
    }

    // ⚠️ maxHp/maxMp are absolute pools, not derived per frame, so the
    // multiplier has to be applied to the pool AND the current value
    // moved with it — otherwise a +22% Pioneer wakes at 82% health for
    // no reason the player can see.
    if (p.innateHpMult && !p._innateHpApplied) {
      p._innateHpApplied = true;
      const before = p.maxHp;
      p.maxHp = Math.round(p.maxHp * p.innateHpMult);
      p.hp = Math.round(p.hp * (p.maxHp / before));
    }
    if (p.innateMpMult && !p._innateMpApplied) {
      p._innateMpApplied = true;
      const before = p.maxMp;
      p.maxMp = Math.round(p.maxMp * p.innateMpMult);
      p.mp = Math.round(p.mp * (p.maxMp / before));
    }
    p.recomputeStats?.();
    eventBus.emit(Events.PLAYER_STATS_CHANGED, {});
  }

  /** Where the Waking Gate stands — deterministic, near the player. */
  _openGate() {
    if (this.gate) return this.gate;
    const p = this.player;
    const r = this._rng('gate');
    const a = r() * Math.PI * 2;
    // Close enough to find without a marker, far enough that it is a
    // walk rather than a button appearing under you.
    const d = 45 + r() * 25;
    const base = p ? { x: p.position.x, z: p.position.z } : { x: this.region.x, z: this.region.z };
    this.gate = { x: base.x + Math.cos(a) * d, z: base.z + Math.sin(a) * d };
    eventBus.emit(Events.NIGHTMARE_GATE_OPEN, { ...this.gate });
    return this.gate;
  }

  /**
   * Step through the Gate — the Nightmare ends and the waking world
   * begins. This is the moment the ordinary game starts.
   */
  wake() {
    if (this.phase !== PHASE.WAKING) return false;
    this.phase = PHASE.NONE;
    // ⚠️ CLEARED HERE, not left to `update()`. main.js only calls
    // update() while `inNightmare` is true, so the moment the phase
    // becomes NONE that function stops running — and a cap cleared
    // only there would stay applied for the rest of the session,
    // giving the whole waking world permanently trivial enemies.
    if (this.spawner) this.spawner.trialCap = null;
    // ⚠️ The warp must lift BEFORE the world is rebuilt around the
    // Sanctuary, or the waking world inherits the Nightmare's ground.
    TerrainGenerator.nightmareWarp = null;
    eventBus.emit(Events.NIGHTMARE_WOKE, {
      title: this.trial?.title, region: this.region?.name,
      aspect: this.trial?.aspect?.name, flaw: this.trial?.flaw?.name,
    });
    return true;
  }

  /**
   * Re-apply the innate grant after a load.
   *
   * ⚠️ Called by main.js AFTER `saveSystem.restore()` has fully
   * settled, never from `restore()` itself — the player block restores
   * later and recomputes `maxHp`, overwriting anything applied before
   * it. Idempotent per session via the player's own `_innateHpApplied`
   * flags, so calling it twice in one load is harmless.
   */
  reapplyInnate() {
    return false;   // ⚠️ STEEL: see grantInnateNow — old saves lose their Aspect/Flaw too.
    // eslint-disable-next-line no-unreachable
    if (!this._granted || !this.trial) return false;
    this._applyInnate();
    return true;
  }

  /** For the save. Six fields, and the trial rebuilds from the seed. */
  serialize() {
    return {
      seed: this.seed, phase: this.phase, progress: this.progress,
      regionId: this.region?.id || null, granted: this._granted,
    };
  }

  snapshot() {
    if (!this.trial) return null;
    return {
      phase: this.phase,
      title: this.trial.title,
      region: this.region?.name,
      verb: this.trial.kind.verb,
      line: this.trial.line,
      warden: this.trial.warden,
      goal: this.trial.goal,
      progress: Math.floor(this.progress),
      label: this.trial.kind.progressLabel,
      aspect: this.trial.aspect,
      flaw: this.trial.flaw,
      gate: this.gate,
    };
  }

  /**
   * Wipe this Pioneer's Nightmare entirely.
   *
   * ⚠️ `seed` AND the derived caches MUST be cleared, and the original
   * version cleared neither. This is a module SINGLETON: creating a
   * second character without reloading the page left the first one's
   * `seed` in place, so main.js's `if (!nightmareSystem.seed)` was
   * false and **no new Nightmare was ever generated**. Every character
   * after the first inherited the first one's trial, region, Aspect
   * and Flaw — which is exactly the owner's report that only one
   * ability ever appeared.
   *
   * ⚠️ `_marker` and `_shards` are memoised per trial and were also
   * missed. A new Nightmare with a stale marker sends the player to a
   * point in a region they are no longer in.
   *
   * ⚠️ The spawner's trial state is cleared too, or a fresh character
   * inherits the previous one's level cap and spent budget.
   */
  reset() {
    this.phase = PHASE.NONE;
    this.seed = null;
    this.trial = null; this.region = null; this.gate = null;
    this.progress = 0; this._granted = false;
    this._elapsed = 0;
    this._marker = null; this._shards = null;
    if (this.spawner) {
      this.spawner.trialCap = null;
      this.spawner.trialAtkCap = null;
      this.spawner.trialBudget = null;
      this.spawner.trialSpawned = 0;
    }
    TerrainGenerator.nightmareWarp = null;
  }
}

export const nightmareSystem = new NightmareSystem();
