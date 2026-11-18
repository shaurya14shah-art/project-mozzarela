// ══════════════════════════════════════════════════════════
// Wand System — the Fracture Wand
//
// The wand is the only weapon that matters, and it is given at the
// start. Potions are not ammunition you feed it: they are *infused*
// into slots, and the wand remembers the spell permanently. When a
// spell's charges run out it goes Dim (weaker, thirstier) rather
// than disappearing — so you're never standing in a fight with an
// empty wand, you're standing there with a bad one.
//
// Three things give casting depth:
//   · CHANNELLING — hold to charge through Quick → Focused → Overcharged
//   · MANA        — gates spam independently of charges
//   · RESONANCE   — hitting a target still carrying another element's
//                   residue triggers a reaction for large bonus damage
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { WAND, CAMERA } from '../data/constants.js';
import { FORMS, FORM_DATA, findReaction } from '../data/essences.js';
import { eventBus, Events } from '../core/EventBus.js';
import { sceneManager } from '../rendering/SceneManager.js';
import { potionSystem } from './PotionSystem.js';
import { attunement } from './AttunementSystem.js';
import { progressSystem } from './ProgressSystem.js';
import { leaning } from './LeaningSystem.js';
// What you ARE — the Latticer's cheap casting and fast cadence come
// from here. Injected via the module singleton like `leaning` above;
// LineageSystem imports neither, so there is no cycle.
import { lineageSystem } from './LineageSystem.js';
import { saturation } from './SaturationSystem.js';

import { vfxFor, catalystVfxFor } from '../rendering/SpellVFX.js';
const EMPTY_SLOT = () => ({
  spell: null,       // the infused spell definition (kept when dim)
  charges: 0,
  maxCharges: 0,
  cooldown: 0,
  dim: false,
});

class WandSystem {
  constructor() {
    // ⚠️ A Map keyed by Weave id, not a fixed-length array. There is no
    // slot count and no cap — see hold().
    this.held = new Map();
    // `activeId` is which Weave a channel is currently building on.
    this.activeId = null;
    this.globalCooldown = 0;
    this.isEquipped = false;

    // Channelling state
    this.channelTime = 0;
    this.isChanneling = false;

    this.projectiles = [];

    // Elemental residue on enemies: Map<enemy, {element, expires}>
    this._residue = new Map();
    this._clock = 0;

    this._player = null; // injected on init, for mana
  }

  init(playerLevel = 1, playerRef = null) {
    if (playerRef) this._player = playerRef;

    // Slots are earned by depth of attunement, not by a level.
    const slotCount = attunement.slotCount();

    // Depth no longer buys SLOTS (there are none) — it is kept only so
    // the "the wand splits open" beat below still has a number to
    // report, and so AscentSystem's slotBonus grant is not orphaned.
    this.maxSlots = slotCount;

    if (!this.isEquipped) {
      this.isEquipped = true;
      eventBus.emit(Events.UI_NOTIFY, 'The Fracture Wand answers to you.');
    } else if (this._lastSlotCount && slotCount > this._lastSlotCount) {
      eventBus.emit(Events.UI_NOTIFY, `The wand splits open — ${slotCount} infusion slots.`);
    }
    // ⚠️ This compared against `previous.length` — a variable that no
    // longer existed (slots became a Map of Weaves). The branch only runs
    // when the wand is ALREADY equipped, i.e. on Continue / restore, so
    // every saved character threw a ReferenceError here and the boot
    // stopped half-way: weapons, the skill bar and the loop never came up.
    this._lastSlotCount = slotCount;

    this._emitUpdate();
  }

  setPlayer(player) { this._player = player; }

  // ── INFUSION ─────────────────────────────────────────────

  /**
   * Bind a potion into a slot. The potion is consumed; the spell
   * stays in the slot forever, refillable with any matching potion.
   */
  /**
   * Hold a Weave in the wand, addressed BY ITS OWN ID.
   *
   * ⚠️ SLOTS ARE GONE. This used to be `infuse(slotIndex, potion)` with
   * six fixed slots hardwired to Digit1–Digit6 — the player never chose
   * the key, and six was a cap set by how many digits sit in a row on a
   * keyboard. A Weave now lives in the wand under its own id and is
   * fired by whatever key the player bound it to (see BindSystem).
   *
   * `slotIndex` is accepted and IGNORED for the handful of legacy call
   * sites; passing one is harmless.
   */
  hold(potion) {
    if (!potion || !potion.isSpell) {
      eventBus.emit(Events.UI_NOTIFY, 'Only Weaves can be bound.');
      return false;
    }

    let slot = this.held.get(potion.id);
    if (!slot) {
      slot = EMPTY_SLOT();
      this.held.set(potion.id, slot);
    }
    const sameSpell = !!slot.spell;   // keyed by id, so it is always the same Weave

    if (sameSpell) {
      // Topping up: charges stack, and the better brew's stats win.
      slot.charges = Math.min(slot.maxCharges + potion.charges, slot.charges + potion.charges);
      slot.maxCharges = Math.max(slot.maxCharges, potion.charges);
      if ((potion.damage || 0) > (slot.spell.damage || 0)) slot.spell = { ...potion };
      slot.dim = false;
      eventBus.emit(Events.UI_NOTIFY, `${potion.name} recharged · ${slot.charges} charges`);
    } else {
      slot.spell = { ...potion };
      slot.charges = potion.charges;
      slot.maxCharges = potion.charges;
      slot.dim = false;
      slot.cooldown = 0;
      eventBus.emit(Events.UI_NOTIFY, `${potion.name} is in the wand. Bind it to a key (V).`);
    }

    potionSystem.markDiscovered(potion.id);
    eventBus.emit(Events.WAND_INFUSE, { id: potion.id, spell: slot.spell });
    this._emitUpdate();
    return true;
  }

  /**
   * Is this Weave already in the wand? Returns its id, or null.
   *
   * ⚠️ Renamed from `bestSlotFor` and it now says what it does. The
   * old body was left half-migrated when numbered slots became the
   * id-keyed `held` Map, and read:
   *
   *     const existing = this.held.has(potion?.id) ? potion.id : null;
   *     if (existing !== -1) return existing;      // ALWAYS true
   *     const empty = null;
   *     if (empty !== -1) return empty;            // unreachable
   *     return existing;                           // unreachable
   *
   * Both guards compared a string-or-null against -1, so the first
   * branch always won and the rest was dead. Worse, the NAME still
   * promised a slot index, and WandMenuUI believed it — rendering
   * `slot ${target + 1}` produced "slot fire_lance1", and
   * `slots[target]` indexed an array with a string and got undefined.
   */
  heldIdFor(potion) {
    return this.held.has(potion?.id) ? potion.id : null;
  }

  /** @deprecated kept so nothing outside breaks; use heldIdFor. */
  bestSlotFor(potion) { return this.heldIdFor(potion); }

  /** Drop a Weave out of the wand entirely. Takes an ID. */
  clearSlot(id) {
    if (!this.held.has(id)) return false;
    this.held.delete(id);
    if (this.activeId === id) this.activeId = null;
    this._emitUpdate();
    return true;
  }

  setActive(id) {
    if (this.held.has(id)) { this.activeId = id; this._emitUpdate(); }
  }

  setActiveSlot(index) {
    if (typeof index !== 'string') return;   // ids, not indices
    if (this.isChanneling) this.cancelChannel();
    this.activeId = index;
    this._emitUpdate();
  }

  getActiveSlot() { return this.activeId ? this.held.get(this.activeId) : null; }
  /** Every held Weave as {id, ...slot} — for the bindings UI and HUD. */
  getSlots() { return [...this.held.entries()].map(([id, s]) => ({ id, ...s })); }
  slotFor(id) { return this.held.get(id) || null; }
  getProjectiles(){ return this.projectiles; }

  // ── CHANNELLING ──────────────────────────────────────────

  beginChannel() {
    const slot = this.getActiveSlot();
    if (!this.isEquipped || !slot || !slot.spell) {
      eventBus.emit(Events.UI_NOTIFY, 'Nothing bound in this slot. Weave one at the Loom first (B).');
      return false;
    }
    if (this.globalCooldown > 0) return false;
    this.isChanneling = true;
    this.channelTime = 0;
    return true;
  }

  cancelChannel() {
    this.isChanneling = false;
    this.channelTime = 0;
    eventBus.emit(Events.WAND_CHANNEL, { active: false, progress: 0, tier: null });
  }

  /** Which channel tier the current hold has reached. */
  currentTier() {
    let tier = WAND.CHANNEL_TIERS[0];
    for (const t of WAND.CHANNEL_TIERS) {
      if (this.channelTime >= t.minHold) tier = t;
    }
    return tier;
  }

  channelProgress() {
    return Math.min(1, this.channelTime / WAND.MAX_CHANNEL);
  }

  // ── CASTING ──────────────────────────────────────────────

  /**
   * Release the channel and cast. Returns the cast payload or null.
   */
  release(playerPosition, direction, playerLevel = 1) {
    if (!this.isChanneling) return null;
    const tier = this.currentTier();
    this.isChanneling = false;
    this.channelTime = 0;
    eventBus.emit(Events.WAND_CHANNEL, { active: false, progress: 0, tier: null });
    return this._cast(playerPosition, direction, playerLevel, tier);
  }

  _cast(playerPosition, direction, playerLevel, tier) {
    const slot = this.getActiveSlot();
    if (!slot || !slot.spell) return null;
    if (this.globalCooldown > 0) return null;

    const spell = slot.spell;

    // ── Cost check ──
    // Efficient Casting (arcane mastery) — every cast, quick or
    // channelled, costs a fifth less.
    //
    // The Leaning multiplier stacks with it: an Ascendant Pioneer casts
    // more cheaply, up to −25% at full commitment, which is that
    // philosophy's whole return (the Cinderbound's is raw damage, paid
    // for with instability). Safe to read unconditionally HERE and
    // only here — the wand is the player's weapon and nothing else in
    // the game casts through it. Enemies do not have wands.
    // ⚠️ `lineageSystem.grant('manaCostMult', 1)` is the Latticer's
    // entire identity — cheap casting is what they trade melee for.
    // Without this term their rungs 1 and 3 granted a number that
    // NOTHING read, which is the "designed and never built" failure
    // this project keeps repeating, committed fresh in the same session
    // that documented it. A grant nothing reads is worse than no grant:
    // the UI cheerfully reports it as applied.
    const masteryManaMult = (attunement.hasMastery('arcane') ? 0.8 : 1)
      * leaning.manaCostMultiplier()
      * lineageSystem.grant('manaCostMult', 1);
    let manaCost = Math.round(spell.manaCost * tier.mana * (slot.dim ? WAND.DIM_MANA_MULT : 1) * masteryManaMult);
    let chargeCost = slot.dim ? 0 : tier.charges;

    if (!slot.dim && slot.charges < chargeCost) {
      // Not enough for the big version — fall back to a Quick cast.
      tier = WAND.CHANNEL_TIERS[0];
      chargeCost = 1;
      manaCost = Math.round(spell.manaCost * tier.mana * masteryManaMult);
    }

    const player = this._player;
    if (player && player.mp < manaCost) {
      eventBus.emit(Events.COMBAT_LOG, { text: `Not enough Focus — ${manaCost} needed, ${Math.floor(player.mp)} left.`, kind: 'warn' });
      return null;
    }

    // ── Surge roll (unstable brews) ──
    //
    // The Leaning's instability multiplier lands HERE rather than in
    // AttunementSystem.selfSurgeChance() — see that method's ⚠️ for the
    // import-cycle reason, and note it is also the more honest place:
    // selfSurgeChance() only ever feeds a UI readout, whereas this is
    // the roll that decides whether a cast actually goes wrong.
    // Cinderbound casting surges up to 45% more often; Ascendant up to
    // 20% less.
    const leanInst = leaning.instabilityMultiplier();
    const surge = potionSystem.rollSurgeFor(
      leanInst === 1 ? spell : { ...spell, instability: (spell.instability || 0) * leanInst },
    );
    const surgeMods = surge ? surge.apply(spell) : {};

    if (surge) {
      eventBus.emit(Events.SPELL_SURGE, { surge, spell });
      eventBus.emit(Events.UI_NOTIFY,
        `${surge.good ? '' : ''} SURGE — ${surge.name}: ${surge.blurb}`);
    }

    // ── Pay ──
    if (player) {
      player.mp = Math.max(0, player.mp - manaCost - (surgeMods.extraManaCost || 0));
    }
    if (!surgeMods.refundCharge) {
      slot.charges = Math.max(0, slot.charges - chargeCost);
    }
    if (slot.charges === 0 && !slot.dim) {
      slot.dim = true;
      eventBus.emit(Events.UI_NOTIFY, `${spell.name} has gone dim — re-infuse to restore it.`);
    }

    // Live Wire (lightning mastery) — the wand cools down faster too,
    // same passive that quickens melee.
    // castSpeedMult > 1 means FASTER, so it divides the cooldown. The
    // Latticer's rung 2 is the only source; before this it was a dead
    // grant like manaCostMult above.
    const cooldown = WAND.FIRE_COOLDOWN
      * (attunement.hasMastery('lightning') ? 0.8 : 1)
      / Math.max(0.25, lineageSystem.grant('castSpeedMult', 1));
    slot.cooldown = cooldown;
    this.globalCooldown = cooldown;

    // ── Build the cast ──
    // What you are made of amplifies what you cast — and so, modestly,
    // does how much you have done. WAND.LEVEL_POWER_STEP has been in
    // constants.js documented as "added per player level" since the
    // file was written and was read by NOTHING; the level term is
    // additive and small on purpose, so a spell's identity keeps
    // coming from its weave and its element rather than from a number
    // going up. See systems/ProgressSystem.js.
    const powerMult = (WAND.BASE_POWER + progressSystem.castPowerBonus(WAND.LEVEL_POWER_STEP))
      * attunement.outgoingMultiplier(spell.element);
    let damage = (spell.damage || 0)
      * powerMult
      * tier.damage
      * (slot.dim ? WAND.DIM_DAMAGE_MULT : 1)
      * (surgeMods.damageMult || 1);

    // Contagion (poison mastery) — anything that lingers hits harder.
    if (attunement.hasMastery('poison') && spell.form === FORMS.MIRE) {
      damage *= 1.25;
    }

    let dir = direction.clone().normalize();
    if (surgeMods.inaccuracy) {
      dir.x += (Math.random() - 0.5) * surgeMods.inaccuracy;
      dir.z += (Math.random() - 0.5) * surgeMods.inaccuracy;
      dir.normalize();
    }

    const doctrineRadius = 1 + attunement.doctrineEffect('radiusBonus', 0);
    const radius = (spell.radius || 0) * tier.radius * doctrineRadius + (surgeMods.radiusBonus || 0);

    // Critical strikes are a doctrine, not a universal stat.
    const critChance = attunement.doctrineEffect('critChance', 0);
    const isCrit = critChance > 0 && Math.random() < critChance;
    if (isCrit) damage *= 2;

    if (surgeMods.selfDamage && player?.takeDamage) {
      // ⚠️ ARMOUR DOES NOT APPLY. This is the caster's own working
      // going wrong, not a blow — and letting Raiment absorb it would
      // remove exactly the risk an unstable surge exists to create.
      player.takeDamage(surgeMods.selfDamage, 'surge', { ignoreArmour: true });
    }

    const payload = {
      spellId: spell.id,
      name: spell.name,
      form: spell.form,
      element: spell.element,
      // Carried through so SpellVFX can apply the catalyst's flourish.
      // The catalyst is part of the spell's identity (see buildSpell),
      // so it belongs in the payload alongside element and form.
      catalystId: spell.catalystId || null,
      damage: Math.round(damage),
      power: Math.round((spell.power || 0) * tier.damage * (slot.dim ? WAND.DIM_DAMAGE_MULT : 1)),
      radius,
      // Ascendant casts reach; Cinderbound ones are shorter and
      // heavier. The same one number moves both this and the damage
      // multiplier at the COMBAT_HIT site, in opposite directions.
      speed: (spell.speed || 30) * leaning.reachMultiplier(),
      color: spell.color || 0x00ffff,
      effect: spell.effect || {},
      tier: tier.id,
      crit: isCrit,
      dim: slot.dim,
      // Eye height, not an arbitrary 1.4 — the wand fires from where
      // the first-person camera actually is now.
      origin: playerPosition.clone().add(new THREE.Vector3(0, CAMERA.EYE_HEIGHT, 0)),
      direction: dir,
    };

    this._spawnVisual(payload);

    // A Ward turns inward — apply it to the caster immediately.
    if (spell.form === FORMS.WARD) {
      this._applyWard(payload);
    }

    // Echo surge: the whole thing goes off a second time, free.
    if (surgeMods.echo) {
      setTimeout(() => {
        const echo = { ...payload, origin: payload.origin.clone(), direction: dir.clone(), isEcho: true };
        this._spawnVisual(echo);
        eventBus.emit(Events.SPELL_CAST, echo);
      }, 220);
    }

    // You become what you cast, and the ground remembers it.
    attunement.absorb(spell);
    saturation.depositCast(playerPosition, spell);

    eventBus.emit(Events.SPELL_CAST, payload);
    this._emitUpdate();
    return payload;
  }

  /** Convenience for a plain tap-cast with no channelling. */
  quickCast(playerPosition, direction, playerLevel = 1) {
    return this._cast(playerPosition, direction, playerLevel, WAND.CHANNEL_TIERS[0]);
  }

  _applyWard(payload) {
    const player = this._player;
    if (!player) return;
    const e = payload.effect || {};

    // Wards do no damage, so everything they do scales off `power`
    // instead — otherwise brew quality wouldn't matter for them.
    const power = payload.power || 20;

    const heal = Math.round(power * (0.3 + (e.healSelf || 0)));
    if (heal > 0) {
      player.hp = Math.min(player.maxHp, player.hp + heal);
      eventBus.emit(Events.PLAYER_HEAL, { amount: heal });
    }

    const shield = Math.round(e.shield ? e.shield : power * 0.8);
    if (shield > 0) {
      player.shield = (player.shield || 0) + shield;
    }
    player.activeWard = {
      element: payload.element,
      effect: e,
      power,
      expires: this._clock + (e.duration || 8),
    };
    eventBus.emit(Events.UI_NOTIFY, `◈ ${payload.name} — +${heal} HP, +${shield} shield`);
  }

  // ── RESONANCE ────────────────────────────────────────────

  /**
   * Register a hit and check for a reaction. Called by the combat
   * collision pass. Returns { damage, reaction } — damage already
   * multiplied if a reaction fired.
   */
  registerHit(target, payload) {
    const prior = this._residue.get(target);
    let damage = payload.damage;
    let reaction = null;

    if (prior && prior.expires > this._clock && prior.element !== payload.element) {
      reaction = findReaction(prior.element, payload.element);
      if (reaction) {
        damage = Math.round(damage * reaction.multiplier);
        this._residue.delete(target);   // consumed by the reaction
        eventBus.emit(Events.REACTION_TRIGGER, {
          reaction, target, damage,
          position: target.position ? target.position.clone() : null,
        });
        eventBus.emit(Events.UI_NOTIFY, `${reaction.name} — ${reaction.blurb}`);
      }
    }

    if (!reaction) {
      this._residue.set(target, {
        element: payload.element,
        expires: this._clock + WAND.RESIDUE_DURATION,
      });
    }

    return { damage, reaction };
  }

  /** What element a target is currently marked with, for UI. */
  residueOn(target) {
    const r = this._residue.get(target);
    return r && r.expires > this._clock ? r.element : null;
  }

  // ── UPDATE ───────────────────────────────────────────────

  update(dt) {
    this._clock += dt;

    if (this.globalCooldown > 0) this.globalCooldown -= dt;
    for (const slot of this.held.values()) {
      if (slot.cooldown > 0) slot.cooldown -= dt;
    }

    if (this.isChanneling) {
      this.channelTime = Math.min(WAND.MAX_CHANNEL, this.channelTime + dt);
      eventBus.emit(Events.WAND_CHANNEL, {
        active: true,
        progress: this.channelProgress(),
        tier: this.currentTier(),
      });
    }

    // Expire residue
    if (this._residue.size) {
      for (const [target, r] of this._residue) {
        if (r.expires <= this._clock) this._residue.delete(target);
      }
    }

    // Expire wards
    const player = this._player;
    if (player?.activeWard && player.activeWard.expires <= this._clock) {
      player.activeWard = null;
    }

    this._updateProjectiles(dt);
  }

  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;

      if (p.life <= 0) {
        sceneManager.scene.remove(p.mesh);
        p.mesh.geometry?.dispose();
        p.mesh.material?.dispose();
        // ⚠️ Trail bodies are parented to the SCENE (so they can lag in
        // world space), which means they are NOT removed by removing
        // the projectile. Missing this leaks a mesh per trail segment
        // per cast — invisible until a long session dies.
        if (p._trail) {
          for (const t of p._trail) {
            sceneManager.scene.remove(t);
            t.material?.dispose();   // geometry is SHARED with p.mesh — do not dispose it twice
          }
          p._trail = null;
        }
        this.projectiles.splice(i, 1);
        continue;
      }

      const form = p.payload.form;

      if (form === FORMS.LANCE || form === FORMS.BLOOM) {
        p.mesh.position.addScaledVector(p.direction, p.payload.speed * dt);
      } else if (form === FORMS.HUNT) {
        // Seekers drift toward their assigned target if they have one.
        if (p.target && p.target.position) {
          const toTarget = p.target.position.clone().sub(p.mesh.position).normalize();
          p.direction.lerp(toTarget, dt * 3.5).normalize();
        }
        p.mesh.position.addScaledVector(p.direction, p.payload.speed * dt);
        p.orbit = (p.orbit || 0) + dt * 6;
        p.mesh.position.y += Math.sin(p.orbit) * dt * 2;
      } else if (form === FORMS.MIRE) {
        // Mires drift slowly then settle and pulse.
        p.mesh.position.addScaledVector(p.direction, p.payload.speed * dt * 0.25);
        const pulse = 1 + Math.sin(p.life * 4) * 0.06;
        p.mesh.scale.setScalar(p.baseScale * pulse);
      } else if (form === FORMS.WARD) {
        // Wards ride the caster.
        if (this._player?.position) {
          p.mesh.position.copy(this._player.position).add(new THREE.Vector3(0, 1.0, 0));
        }
        p.mesh.rotation.y += dt * 1.5;
      }

      // ── Element character ──
      // Replaces the blanket "tumble everything at the same rate",
      // which was most of the reason every spell read as the same
      // animation. An element's `spin` of 0 is a deliberate choice
      // (ice, light, lightning hold still or snap instead).
      if (form !== FORMS.WARD && form !== FORMS.MIRE) {
        const spin = p.evfx ? p.evfx.spin : 4;
        if (spin) {
          p.mesh.rotation.x += dt * spin;
          p.mesh.rotation.z += dt * spin * 0.62;
        }
        p.evfx?.animate?.(p, dt, this._clock);
      }
      // Catalyst flourish runs for every form — a Detonating Ward
      // should still visibly build.
      p.cvfx?.animate?.(p, dt, this._clock);

      // Fade out over the last half second
      if (p.mesh.material && p.life < 0.5) {
        p.mesh.material.opacity = Math.max(0, p.mesh.material.opacity * (p.life / 0.5));
      }
    }
  }

  // ── VISUALS ──────────────────────────────────────────────

  _spawnVisual(payload) {
    const form = payload.form;
    const color = payload.color;
    const big = payload.tier === 'over' ? 1.5 : payload.tier === 'focus' ? 1.2 : 1.0;

    // ── Element & catalyst character ──
    // See rendering/SpellVFX.js. FORM decides the shape and gross
    // motion (below, unchanged); ELEMENT decides how it behaves in the
    // air; CATALYST adds a flourish for the behaviour it already
    // grants. Before this, `color` was the ONLY per-element difference
    // in the whole pipeline.
    const evfx = vfxFor(payload.element);
    const cvfx = catalystVfxFor(payload.catalystId);

    const spawnOne = (mesh, life, target = null) => {
      mesh.position.copy(payload.origin);
      sceneManager.scene.add(mesh);
      const proj = {
        mesh, payload, target,
        direction: payload.direction.clone(),
        life,
        maxLife: life,
        baseScale: mesh.scale.x,
        // Per-projectile phase offset. Without it every seeker in a
        // Hunt volley flickers and wobbles in perfect lockstep, which
        // reads as one object rather than several.
        seed: Math.random() * 6.283,
        evfx, cvfx,
      };
      // Catalyst trail bodies, if this catalyst has any. Built once at
      // spawn and parented to the SCENE, not the projectile, so they
      // can lag behind it in world space.
      if (cvfx?.trail) {
        proj._trail = [];
        for (let i = 0; i < cvfx.trail; i++) {
          const t = new THREE.Mesh(mesh.geometry, mesh.material.clone());
          t.material.opacity = 0.5;
          sceneManager.scene.add(t);
          proj._trail.push(t);
        }
      }
      this.projectiles.push(proj);
      return mesh;
    };

    const glowMat = (opacity, emissive = 1.2) => new THREE.MeshPhongMaterial({
      color, emissive: color, emissiveIntensity: emissive,
      transparent: true, opacity,
    });

    if (form === FORMS.LANCE) {
      const geo = new THREE.ConeGeometry(0.16 * big, 1.1 * big, 8);
      geo.rotateX(Math.PI / 2);
      const mesh = new THREE.Mesh(geo, glowMat(0.95));
      mesh.lookAt(payload.direction);
      mesh.add(new THREE.PointLight(color, 2.5 * big, 9));
      spawnOne(mesh, 2.2);

    } else if (form === FORMS.BLOOM) {
      // Bloom takes the element's own body — the burst is the form's
      // contribution, the thing that bursts is the element's.
      const geo = evfx?.build ? evfx.build(0.3 * big) : new THREE.IcosahedronGeometry(0.3 * big, 1);
      const mesh = new THREE.Mesh(geo, glowMat(0.9));
      mesh.add(new THREE.PointLight(color, 2.5 * big, 10));
      const proj = spawnOne(mesh, 1.8);
      // Grows as it travels, then bursts to full radius at the end.
      const grow = () => {
        if (!this.projectiles.includes(proj)) return;
        const t = 1 - proj.life / 1.8;
        mesh.scale.setScalar(1 + t * t * (payload.radius || 4) * 0.9);
        requestAnimationFrame(grow);
      };
      grow();

    } else if (form === FORMS.MIRE) {
      const r = Math.max(1.5, (payload.radius || 5) * 0.5);
      const geo = new THREE.SphereGeometry(r, 14, 10);
      const mat = glowMat(0.28, 0.5);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.setScalar(0.35);
      mesh.add(new THREE.PointLight(color, 1.6, r * 3));
      const proj = spawnOne(mesh, (payload.effect?.duration || 5));
      const settle = () => {
        if (!this.projectiles.includes(proj)) return;
        if (mesh.scale.x < 1) {
          mesh.scale.addScalar(0.05);
          proj.baseScale = mesh.scale.x;
          requestAnimationFrame(settle);
        }
      };
      settle();

    } else if (form === FORMS.WARD) {
      const r = 1.4 * big;
      const geo = new THREE.IcosahedronGeometry(r, 1);
      const mat = new THREE.MeshPhongMaterial({
        color, emissive: color, emissiveIntensity: 0.7,
        transparent: true, opacity: 0.3, wireframe: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.add(new THREE.PointLight(color, 2, 8));
      spawnOne(mesh, payload.effect?.duration || 8);

    } else if (form === FORMS.HUNT) {
      const count = Math.round((FORM_DATA[FORMS.HUNT].projectiles || 3) * big);
      for (let i = 0; i < count; i++) {
        const geo = evfx?.build ? evfx.build(0.2 * big) : new THREE.OctahedronGeometry(0.2 * big, 0);
        const mesh = new THREE.Mesh(geo, glowMat(0.9));
        mesh.add(new THREE.PointLight(color, 1.4, 6));
        const spread = (i - (count - 1) / 2) * 0.35;
        const dir = payload.direction.clone();
        dir.x += spread * 0.5;
        dir.y += Math.random() * 0.15;
        dir.normalize();
        const proj = spawnOne(mesh, 3.0);
        proj.direction = dir;
        proj.orbit = i * 1.2;
      }

    } else {
      // Element-shaped by default, falling back to the generic body.
      const geo = evfx?.build ? evfx.build(0.25 * big) : new THREE.IcosahedronGeometry(0.25 * big, 1);
      const mesh = new THREE.Mesh(geo, glowMat(0.9));
      spawnOne(mesh, 2.0);
    }
  }

  /** Attach targets to any un-targeted Hunt projectiles. */
  assignHomingTargets(enemies) {
    if (!enemies || !enemies.length) return;
    for (const p of this.projectiles) {
      if (p.payload.form !== FORMS.HUNT || p.target) continue;
      let closest = null, best = Infinity;
      for (const e of enemies) {
        if (!e.position) continue;
        const d = e.position.distanceToSquared(p.mesh.position);
        if (d < best && d < 900) { best = d; closest = e; }
      }
      p.target = closest;
    }
  }

  _emitUpdate() {
    eventBus.emit(Events.WAND_UPDATE, {
      slots: this.getSlots(),
      activeId: this.activeId,
      maxSlots: this.maxSlots,
    });
  }
}

export const wandSystem = new WandSystem();
