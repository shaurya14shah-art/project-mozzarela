// ══════════════════════════════════════════════════════════
// CombatSystem — STEEL: directional, physical, read-the-body combat
//
// The combat revamp (owner grilling, 2026-10-05; rules as data in
// data/steel.js). Replaces light/heavy + roll + three pools + a spell bar.
//
//   STANCE   1 / 2 / 3 (or the wheel) — high, middle, low. It is your
//            GUARD and your default line: just clicking walks the
//            stance's combo, so a trackpad or no-mouse player is whole.
//   FLICK    move the mouse sharply as you click: the blade travels that
//            way (flick left → cut from the right, up → thrust/overhead).
//   LMB      tap = a cut on the line; hold = a COMMITTED heavy (slower,
//            harder, balance-breaking).
//   RMB      guard your stance's plane. In the last instant before a
//            blow = DEFLECT (it reels, your blade charges, a sword
//            ripostes). Wrong plane = it gets through.
//   R        STEP — no invincibility; you leave the arc or you don't.
//   Z X C    the weapon family's TECHNIQUES, learned by fighting with it.
//   Q        UNLEASH the blade's charge (earned by clean hits, deflects,
//            kills) as one empowered strike, in the oil's element.
//   F (hold) BIND your wounds.
//   MMB      lock on · Shift+wheel switches target while locked.
//
// Resources: STAMINA (everything costs it), BALANCE (yours and theirs —
// broken = staggered open) and WOUNDS on body regions that bleed until
// bound (player.hp is the blood they drain). No levels; growth is
// technique practice, body traits and the steel itself.
//
// Enemy side lives here too (per-frame `_tickEnemy`): humanoid guards and
// turn-taking, attack lines, balance, the beast rules, swarms. Enemy.js
// only carries the fields and the commit/arc rule of its own strike.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { input } from '../core/InputManager.js';
import { eventBus, Events } from '../core/EventBus.js';
import { particleBursts } from '../rendering/ParticleBursts.js';
import {
  LINES, lineId, STANCE_COMBO, STANCE_NAME, FAMILIES, familyOf, TECHNIQUES,
  REGIONS, regionFor, SEVERITY, BEASTS, isBeast, RITUALS, TRAITS, PLANES,
} from '../data/steel.js';
import { METALS, UNDEAD } from '../data/expansion.js';
import { gatherSystem } from './GatherSystem.js';

const HEAVY_HOLD = 0.28;
const HEAVY_FULL = 0.95;
const BUFFER = 0.35;
const DEFLECT_WINDOW = 0.2;
const RIPOSTE_TIME = 1.3;
const FRONT_COS = Math.cos(THREE.MathUtils.degToRad(78));
const SOFT_RANGE = 14, SOFT_RANGE_RANGED = 32;
const LOCK_RANGE = 26, LOCK_BREAK = 34;
const FLICK_MIN = 900;          // px/s of recent mouse motion that counts as a flick
const BIND_TIME = 2.4;
const BALANCE_BASE = 100;

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const wrap = (a) => { a %= Math.PI * 2; if (a > Math.PI) a -= Math.PI * 2; if (a < -Math.PI) a += Math.PI * 2; return a; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

class CombatSystem {
  constructor() {
    this.ctx = null;
    this.softTarget = null;
    this.lockTarget = null;
    // Stance + swing
    this.stance = 'mid';
    this._beat = 0;
    this._beatT = 0;
    this.blocking = false;
    this.charging = false;
    this.charge = 0;
    this._press = 0;
    this._lmb = false; this._rmb = false; this._mmb = false;
    this._rmbAt = -1e9;
    this._buffer = null;
    this._pressFlick = null;
    this._flick = { x: 0, y: 0, t: 0 };
    this.swing = null;              // the swing in flight: { line, kind, charge, opts }
    this._queue = [];               // techniques that chain swings (flurry)
    // Defence + balance
    this.riposte = 0;
    this.guardBroken = 0;           // player staggered (balance broken) — no guard, no swing
    this.balance = BALANCE_BASE;
    this.maxBalance = BALANCE_BASE;
    this._balanceHitAt = -1e9;
    this.brace = 0;
    // Magic in the weapon
    this.bladeCharge = 0;
    this.oil = null;                // { element, until }
    this.ward = 0;
    this.windUntil = 0;
    // Wounds
    this.wounds = [];               // { region, sev, bleed, bound, at }
    this.binding = 0;               // 0..1 progress while F is held
    this.ritual = null;             // { id, def, t }
    // Growth
    this.practice = {};             // family → landed hits
    this.traitXP = { grip: 0, wind: 0, footing: 0 };
    this._announced = new Set();
    this.techCd = {};               // technique id → seconds
    this.feint = 0;
    // Bookkeeping
    this._now = 0;
    this._softTick = 0;
    this._lastHurtAt = -1e9;
    this._stepAt = -1e9;
    this._lastSwingPlane = 'mid';
    this._told = new Set();
    this._maxStaminaBase = null; this._maxStaminaSet = null;
  }

  init(ctx) {
    this.ctx = ctx;
    window.addEventListener('contextmenu', (e) => { if (ctx.canAct?.()) e.preventDefault(); });
    // The flick: recent mouse motion, decaying over ~0.12 s. Read raw so
    // it does not depend on CameraController's consumption of the delta.
    window.addEventListener('mousemove', (e) => {
      const now = performance.now() / 1000;
      const dt = Math.max(1 / 240, now - this._flick.t);
      const k = Math.exp(-dt / 0.12);
      this._flick.x = this._flick.x * k + (e.movementX || 0) / dt * (1 - k);
      this._flick.y = this._flick.y * k + (e.movementY || 0) / dt * (1 - k);
      this._flick.t = now;
    });
    return this;
  }

  log(text, kind = 'info') { eventBus.emit(Events.COMBAT_LOG, { text, kind }); }
  /** Say a teaching line once per session. */
  teach(key, text, kind = 'info') { if (this._told.has(key)) return; this._told.add(key); this.log(text, kind); }
  get target() { return this.lockTarget || this.softTarget; }
  get family() { return this.ctx?.family?.() || 'sword'; }
  get fam() { return FAMILIES[this.family] || FAMILIES.sword; }
  /** The trait of the metal in hand (null for plain or unknown). */
  get trait() { const m = this.ctx?.metal?.(); return m ? (METALS[m]?.trait || null) : null; }

  // ══════════════════════════════════════════════════════
  // THE FRAME
  // ══════════════════════════════════════════════════════
  update(dt) {
    const c = this.ctx; if (!c) return;
    const p = c.player;
    this._now += dt;
    this.riposte = Math.max(0, this.riposte - dt);
    this.guardBroken = Math.max(0, this.guardBroken - dt);
    this.brace = Math.max(0, this.brace - dt);
    this.feint = Math.max(0, this.feint - dt);
    for (const k in this.techCd) this.techCd[k] = Math.max(0, this.techCd[k] - dt);
    if (this.oil && this._now > this.oil.until) { this.log(`The ${RITUALS[this.oil.id]?.name || 'oil'} has burned off the blade`, 'info'); this.oil = null; }

    const act = c.canAct() && !p.isDead;
    const busy = !!this.ritual || this.binding > 0;
    const lmb = act && !busy && input.isMouseDown(0);
    const rmb = act && !busy && input.isMouseDown(2);
    const mmb = act && input.isMouseDown(1);

    // ── Stance: 1/2/3, or the wheel (Shift+wheel switches lock) ──
    if (act) {
      if (input.isKeyJustPressed('Digit1')) this.setStance('high');
      if (input.isKeyJustPressed('Digit2')) this.setStance('mid');
      if (input.isKeyJustPressed('Digit3')) this.setStance('low');
    }
    const wheel = input.consumeScrollDelta();
    if (act && Math.abs(wheel) > 1) {
      if (this.lockTarget && input.isKeyDown('ShiftLeft')) this.switchTarget(wheel > 0 ? 1 : -1);
      else {
        const i = PLANES.indexOf(this.stance) + (wheel > 0 ? 1 : -1);
        this.setStance(PLANES[clamp(i, 0, 2)]);
      }
    }

    // ── Guard / deflect (RMB) ──
    if (rmb && !this._rmb) this._rmbAt = this._now;
    const canGuard = !p.isAttacking && this.guardBroken <= 0 && p.stamina > 1;
    this.blocking = rmb && canGuard;

    // ── Attack (LMB): tap = cut on the line, hold = committed heavy ──
    if (lmb && !this._lmb) {
      this._press = 0; this.charging = false; this.charge = 0;
      this._pressFlick = this._readFlick();
    }
    if (lmb && !this.blocking) {
      this._press += dt;
      if (this._press >= HEAVY_HOLD && this.guardBroken <= 0) {
        this.charging = true;
        this.charge = Math.min(1, (this._press - HEAVY_HOLD) / (HEAVY_FULL - HEAVY_HOLD));
      }
    }
    if (!lmb && this._lmb && act && !this.blocking) {
      if (this.charging) this._request('heavy', this.charge, this._pressFlick);
      else this._request('light', 0, this._pressFlick);
      this.charging = false; this.charge = 0;
    }
    if (!lmb) { this.charging = false; this.charge = 0; }
    if (this._buffer) {
      if (this._now - this._buffer.t > BUFFER) this._buffer = null;
      else if (p.attackCooldown <= 0 && !p.isDodging) { const b = this._buffer; this._buffer = null; this._swing(b.kind, b.charge, b.side, b.opts); }
    }
    if (this._queue.length && p.attackCooldown <= 0 && !p.isAttacking) {
      const q = this._queue.shift();
      this._swing(q.kind, q.charge || 0, q.side, q.opts, true);
    }
    this._beatT -= dt;
    if (this._beatT <= 0) this._beat = 0;

    // ── Techniques, unleash, binding, rituals ──
    if (act && !busy) {
      const techs = this.techniqueSlots();
      ['KeyZ', 'KeyX', 'KeyC'].forEach((k, i) => { if (input.isKeyJustPressed(k)) this._technique(techs[i]); });
      if (input.isKeyJustPressed('KeyQ')) this.unleash();
    }
    this._updateBinding(dt, act);
    this._updateRitual(dt, act);

    // Movement: slower guarding, drawing a heavy, binding, staggered, on a bad leg.
    const legs = this._woundCount('legs');
    p.combatMoveMult = (this.blocking ? 0.5 : this.charging ? 0.65 : 1)
      * (this.guardBroken > 0 ? 0.45 : 1) * (busy ? 0.4 : 1) * Math.max(0.55, 1 - legs * 0.12);
    p.isBlocking = this.blocking;
    p.steelSwingMult = 1 + this._woundCount('armR') * 0.12;
    p.steelStepMult = Math.max(0.5, 1 - legs * 0.15);
    p.steelStaminaRegenMult = (this._now < this.windUntil || gatherSystem.buff('wind') ? 1.6 : 1);

    // ── Lock-on ──
    if (mmb && !this._mmb) this.toggleLock();
    this._lmb = lmb; this._rmb = rmb; this._mmb = mmb;
    this._maintainLock(dt);
    if ((this._softTick = (this._softTick + 1) % 3) === 0) this.softTarget = this._pickSoft();

    this._updateBalance(dt);
    this._updateWounds(dt);
    this._applyTraits();
    this._chargeDecay(dt);

    // Enemies near enough to matter.
    const near = c.enemySpawner.getEnemiesInRange(p.position, 40);
    this._tokenHolder = null;
    for (const e of near) if (!isBeast(e.typeId) && (e.attackState === 'windup' || e.attackState === 'strike') && e.position.distanceTo(p.position) < 7) { this._tokenHolder = e; break; }
    for (const e of near) this._tickEnemy(e, dt);
  }

  setStance(s) {
    if (!PLANES.includes(s) || s === this.stance) return;
    this.stance = s;
    this._beat = 0;
    eventBus.emit(Events.COMBAT_FEEDBACK, { kind: 'stance', stance: s });
    this.teach('stance', `${STANCE_NAME[s]} — your guard and your cuts are on this line now`);
  }

  /** The line the next swing would take (the held heavy's preview pose). */
  previewLine() {
    const side = this._pressFlick || STANCE_COMBO[this.stance][this._beat % 3];
    return lineId(this.stance, side);
  }

  _readFlick() {
    const f = this._flick;
    const age = performance.now() / 1000 - f.t;
    const k = Math.exp(-age / 0.12);
    const x = f.x * k, y = f.y * k;
    if (Math.hypot(x, y) < FLICK_MIN) return null;
    if (Math.abs(x) > Math.abs(y) * 0.8) return x < 0 ? 'right' : 'left';   // the blade travels the way you flicked
    if (y < 0) return 'center';
    return null;
  }

  // ══════════════════════════════════════════════════════
  // SWINGING
  // ══════════════════════════════════════════════════════
  _request(kind, charge, side, opts = null) {
    const p = this.ctx.player;
    if (this.guardBroken > 0) { this.log('Off balance — find your feet first', 'warn'); return; }
    if (p.attackCooldown > 0 || p.isDodging) { this._buffer = { kind, charge, side, opts, t: this._now }; return; }
    this._swing(kind, charge, side, opts);
  }

  staminaCost(kind, charge = 0) {
    const w = this.fam.weight;
    const t = this.trait;
    const light = (5 + w * 11) * (t === 'light' || t === 'moonlit' ? 0.75 : t === 'skyborn' ? 0.85 : 1);
    return kind === 'heavy' ? light * (1.6 + charge * 0.7) : light;
  }

  _swing(kind, charge, side, opts = null, free = false) {
    const p = this.ctx.player;
    const fam = this.fam;
    if (!free) {
      const cost = this.staminaCost(kind, charge) * (opts?.staminaMult ?? 1);
      if (p.stamina < 1) { this.log('No wind left — step back and breathe', 'warn'); return false; }
      p.stamina = Math.max(0, p.stamina - cost);
      this.traitXP.wind += cost;
    }
    const plane = opts?.plane || this.stance;
    let s = side;
    if (!s) {
      const combo = STANCE_COMBO[plane];
      s = combo[this._beat % combo.length];
      if (kind !== 'heavy') this._beat++;
    }
    this._beatT = 1.1;
    const line = LINES[lineId(plane, s)] || LINES['mid-right'];
    this.swing = { line, id: lineId(plane, s), kind, charge, opts: opts || {} };
    this._lastSwingPlane = plane;
    p.attackLine = this.swing.id;
    p.attackSpec = { line: this.swing.id, kind, tech: opts?.tech || null, unleash: !!opts?.unleash };
    if (!p.performAttack(kind, charge, (line.wind || 1) * (opts?.windMult ?? 1))) { this.swing = null; return false; }
    if (this.riposte > 0 && fam.property === 'riposte' && kind !== 'heavy') {
      // The sword's answer: the cut after a deflect comes at once.
      p.attackCooldown *= 0.55; p.attackTotal *= 0.55; p.attackTimer = p.attackTotal;
    }
    return true;
  }

  /**
   * Resolve the swing in flight against the bodies in front of you.
   * Called once per swing at its impact frame by main.js
   * (checkCombatCollisions). Emits COMBAT_HIT for anything that lands.
   * @returns {number} bodies struck (hit or blocked)
   */
  resolveSwing(origin, fwd) {
    const c = this.ctx, p = c.player;
    const sw = this.swing || { line: LINES['mid-right'], id: 'mid-right', kind: 'light', charge: 0, opts: {} };
    const fam = this.fam, famId = this.family, o = sw.opts;
    const heavy = sw.kind === 'heavy';
    const reach = (fam.reach + (sw.line.reach || 0) + (o.reach || 0)) * (heavy ? 1.06 : 1);
    const arcDeg = o.arc || (fam.hitsAll && sw.line.side !== 'center' ? Math.max(sw.line.arc, 150) : sw.line.arc);
    const arcCos = Math.cos(THREE.MathUtils.degToRad(Math.min(360, arcDeg) / 2));
    const flatFwd = _w.copy(fwd).setY(0).normalize().clone();

    const cands = [];
    for (const e of c.enemySpawner.getEnemiesInRange(p.position, reach + 2)) {
      const to = e.position.clone().sub(origin);
      if (Math.abs(to.y) > 2.2 + (e.scale || 1)) continue;
      to.y = 0;
      const body = 0.35 * (e.scale || 1);
      const d = to.length();
      if (d - body > reach || d < 0.001) continue;
      to.normalize();
      if (to.dot(flatFwd) < arcCos) continue;
      cands.push({ e, d });
    }
    cands.sort((a, b) => a.d - b.d);
    const hitsAll = fam.hitsAll || o.all;
    const struckList = hitsAll ? cands : cands.slice(0, 1);
    let struck = 0;
    for (const { e } of struckList) { this._strike(e, sw, fam, famId, heavy); struck++; }
    if (o.unleash) this._burst(origin.clone().addScaledVector(flatFwd, Math.min(reach, 2.4)), fwd);
    this.swing = null;
    return struck;
  }

  /**
   * Bend a melee swing toward the target if it is near the swing's line
   * and within reach (+1.5 m, with a short step in). Returns the
   * direction to use; may nudge the player forward.
   */
  meleeAim(fwd, reach) {
    const t = this.target, p = this.ctx.player;
    if (!t?.alive) return fwd;
    _v.copy(t.position).sub(p.position).setY(0);
    const d = _v.length();
    if (d < 0.01 || d > reach + 1.5) return fwd;
    _v.multiplyScalar(1 / d);
    const limit = this.lockTarget ? 0.2 : Math.cos(THREE.MathUtils.degToRad(40));
    if (_v.dot(fwd) < limit) return fwd;
    if (d > reach * 0.75) p.position.addScaledVector(_v, Math.min(0.7, d - reach * 0.7));
    return _v.clone();
  }

  _strike(e, sw, fam, famId, heavy) {
    const c = this.ctx, p = c.player, o = sw.opts, plane = sw.line.plane, side = sw.line.side;
    const S = this._steel(e);
    // Where are we relative to it? (flank / back for the dagger's slip)
    _v.copy(p.position).sub(e.position).setY(0).normalize();
    const facing = new THREE.Vector3(Math.sin(e.rotation || 0), 0, Math.cos(e.rotation || 0));
    const frontDot = _v.dot(facing);
    const behind = frontDot < -0.2, flank = frontDot < 0.35;

    let mult = fam.dmg * (heavy ? 1.55 + sw.charge * 0.6 : 1) * (o.mult || 1);
    // The metal's trait (data/expansion.js METAL_TRAITS).
    const trait = this.trait;
    if (trait === 'keen') mult *= 1.1;
    else if (trait === 'brittle') mult *= 1.35;
    else if (trait === 'skyborn') mult *= 1.2;
    if ((trait === 'blessed' || trait === 'moonlit') && UNDEAD.has(e.typeId)) { mult *= 1.5; this.teach('silver', 'Silver bites the dead', 'good'); }
    let bal = 9 * fam.balance * (heavy ? 1.9 + sw.charge * 0.6 : 1) * (o.balanceMult || 1);
    if (side === 'center' && plane === 'high') mult *= 1.15;      // the overhead
    if (this.riposte > 0 && !heavy) { mult *= fam.property === 'riposte' ? 1.8 : 1.4; this.riposte = 0; }
    if (this.feint > 0 && plane !== S.feintPlane && S.feintPlane) { mult *= 1.3; this.feint = 0; S.feintPlane = null; }
    if (this._now < (this.oil?.until || 0) && o.unleash) mult *= 1.1;

    let blocked = false, note = null;
    // ── Humanoids: the guard ──
    if (!isBeast(e.typeId)) {
      const guarding = S.guardPlane && S.open <= 0 && S.stagger <= 0 && e.hitStun <= 0
        && (e.attackState === 'none') && !behind && !o.ignoreGuard;
      if (guarding && S.guardPlane === plane) blocked = true;
    } else {
      const r = this.beastFactor(e, S, sw, fam, famId, heavy, frontDot);
      mult *= r.mult; bal *= r.balance; blocked = r.blocked; note = r.note;
    }
    // Finisher: balance broken, wide open.
    if (S.stagger > 0 && !blocked) { mult *= 2; note = note || 'finish'; }
    // The dagger's slip.
    if (fam.property === 'slip' && (flank || S.stagger > 0) && !blocked) mult *= 2;

    const hits = o.hits || fam.hits || 1;
    if (blocked) {
      // A guard met it. Balance pays, health does not (save the hammer).
      const crush = fam.property === 'crush';
      S.balance -= bal * (crush ? 2 : 1.15);
      S.balanceAt = this._now;
      if (fam.property === 'hook' || o.hookGuard) { S.open = 1.0; this.teach('hook', 'Hooked their guard aside — strike now', 'good'); }
      eventBus.emit(Events.COMBAT_FEEDBACK, { kind: 'block', from: e.position.clone(), byPlayer: true });
      c.audio?.playBlock?.();
      if (crush) this._emitHit(e, p.stats.atk * mult * 0.5, sw);
      if (this.trait === 'brittle') this._loseBalance(10);   // glass jars in the hand
      // A skilled one answers a light cut on its guard with a deflect.
      if (!heavy && !crush && Math.random() < 0.12 + S.skill * 0.33) {
        this._playerReel(0.5, 22, 'Turned aside — they read that line');
      } else {
        this.teach(`guard:${e.typeId}`, `${e.name} guarded ${plane === 'mid' ? 'the middle' : plane} — change your stance to get round it`, 'warn');
      }
      if (S.balance <= 0) this._breakEnemy(e, S);
      return;
    }

    if (mult <= 0.001) { if (note) this.teach(`note:${e.typeId}`, note, 'warn'); return; }
    for (let h = 0; h < hits; h++) this._emitHit(e, p.stats.atk * mult / (hits > 1 ? 1 : 1), sw);
    S.balance -= bal * (o.balanceMult ? 1 : 0.6);
    S.balanceAt = this._now;
    // Wounding the creature: legs slow it, the weapon arm slows its swing.
    const region = regionFor(plane, side === 'left' ? 'right' : side === 'right' ? 'left' : 'center');
    if (region === 'legs') S.cripple = Math.min(3, S.cripple + (heavy ? 1 : 0.5));
    if (region === 'armR' && !isBeast(e.typeId)) S.armSlow = Math.min(0.5, S.armSlow + 0.08);
    if (fam.property === 'reap' && plane === 'low') S.bleed = Math.min(6, S.bleed + 2);
    // The spear keeps: a thrust meeting something coming in stops it.
    if (fam.property === 'keep' && side === 'center' && (e.state === 'chase' || e.attackState === 'windup')) {
      e.hitStun = Math.max(e.hitStun || 0, 0.6);
      if (e.attackState === 'windup') { e.attackState = 'recover'; e.attackStateTimer = 0.6; }
      _v.copy(e.position).sub(p.position).setY(0).normalize();
      e.position.addScaledVector(_v, 0.8);
    }
    if (heavy || o.stagger) {
      const st = (o.stagger || 0.5) + sw.charge * 0.5;
      e.hitStun = Math.max(e.hitStun || 0, st);
      if (e.attackState === 'windup' && !S.hyper) { e.attackState = 'recover'; e.attackStateTimer = st; }
    }
    if (o.knock) { _v.copy(e.position).sub(p.position).setY(0).normalize(); e.position.addScaledVector(_v, o.knock / Math.max(0.6, e.scale || 1)); }
    if (o.element) this._elementOn(e, o.element);
    else if (this.oil && this._now < this.oil.until) this._elementOn(e, this.oil.element, true);
    if (S.balance <= 0) this._breakEnemy(e, S);
    this._gainCharge(heavy ? 0.12 : 0.07);
    this.practice[this.family] = (this.practice[this.family] || 0) + 1;
    this._checkLearned();
  }

  _emitHit(e, dmg, sw) {
    eventBus.emit(Events.COMBAT_HIT, {
      source: 'player', target: e,
      damage: Math.max(1, Math.round(dmg + Math.random() * 3)),
      element: sw.opts?.element || undefined,
    });
  }

  /**
   * The beast rules (owner: "mix by creature"). See data/steel.js BEASTS.
   * @returns {{mult, balance, blocked, note}}
   */
  beastFactor(e, S, sw, fam, famId, heavy, frontDot) {
    const rule = BEASTS[e.typeId]?.rule;
    const plane = sw.line.plane, side = sw.line.side, o = sw.opts;
    const blunt = famId === 'warhammer' || famId === 'staff' || famId === 'axe' || heavy;
    const pierce = !!o.pierce;
    const striking = e.attackState === 'windup' || e.attackState === 'strike';
    const r = { mult: 1, balance: 1, blocked: false, note: null };
    switch (rule) {
      case 'core':
        if (side === 'center' || pierce) { r.mult = 1.8; this.teach('seep-core', 'Through the core — that is how it dies', 'good'); }
        else { r.mult = 0.22; r.note = BEASTS.slime.tell; }
        break;
      case 'forelegs':
        if (plane === 'low') { r.mult = 1.0; S.cripple = Math.min(3, S.cripple + 0.6); }
        else if (e.attackState === 'recover' && plane === 'high') { r.mult = 1.7; this.teach('spider-back', 'Its back is open after it strikes', 'good'); }
        else if (frontDot > 0.3 && !pierce && !striking) { r.blocked = true; this.teach('spider-legs', BEASTS.spider.tell, 'warn'); }
        break;
      case 'shards':
        if (S.shards > 0) {
          S.shards = Math.max(0, S.shards - (blunt ? 2 : 1));
          r.mult = blunt ? 0.7 : 0.3;
          r.note = BEASTS.ice_elemental.tell;
          this.teach('shards', `Shards turn the blade — ${S.shards} left`, 'warn');
          if (S.shards === 0) this.log('The shards are broken — the core is bare', 'good');
        } else r.mult = 1.5;
        break;
      case 'throat':
        if (e.attackState === 'windup' && side === 'center' && plane !== 'low') { r.mult = 2.6; this.log('Into the throat', 'good'); }
        else { r.mult = pierce || fam.property === 'crush' ? 0.8 : 0.45; r.note = BEASTS.dragon.tell; this.teach('dragon', BEASTS.dragon.tell, 'warn'); }
        if (plane === 'low') S.cripple = Math.min(3, S.cripple + 0.5);
        break;
      case 'maw':
        if (striking && (plane === 'high' || side === 'center')) { r.mult = 2.3; this.log('Into the maw', 'good'); }
        else { r.mult = fam.property === 'crush' ? 0.6 : 0.3; this.teach('maw', BEASTS.sandworm.tell, 'warn'); }
        break;
      case 'balance':
        r.mult = S.stagger > 0 ? 2.2 : 0.45; r.balance = fam.property === 'crush' ? 2 : 1.3;
        if (S.stagger <= 0) this.teach('golem', BEASTS.golem.tell, 'warn');
        break;
      case 'plates':
        if (plane === 'low') { r.mult = 1.2; S.cripple = Math.min(3, S.cripple + 0.6); }
        else if (side === 'center' || pierce) r.mult = 1.0;
        else if (fam.property === 'crush') { r.mult = 1.1; r.balance = 1.6; }
        else { r.mult = 0.3; this.teach('plates', BEASTS.rust_crawler.tell, 'warn'); }
        break;
      case 'rooted':
        // Rooted: it never moves, and its blows reach far. Close in.
        r.mult = 1.0;
        this.teach('rooted', BEASTS.bog_horror.tell, 'info');
        break;
      case 'brittle':
        if (heavy || fam.property === 'crush') { r.mult = 2.2; r.balance = 2; this.teach('glass', 'The glass cracks — heavy blows', 'good'); }
        else { r.mult = 0.3; this.teach('brittle', BEASTS.obsidian_sentinel.tell, 'warn'); }
        break;
      case 'veiled':
        if (striking || S.stagger > 0 || this._now - (S.deflectedAt || -9) < 1.5 || o.element || (this.oil && this._now < this.oil.until)) r.mult = 1.2;
        else { r.mult = 0; r.note = BEASTS.wraith.tell; this.teach('wraith', BEASTS.wraith.tell, 'warn'); }
        break;
    }
    return r;
  }

  _breakEnemy(e, S) {
    S.balance = 0;
    S.stagger = 1.7;
    S.open = 0;
    e.hitStun = Math.max(e.hitStun || 0, 1.5);
    if (e.attackState === 'windup' || e.attackState === 'strike') { e.attackState = 'recover'; e.attackStateTimer = 1.5; }
    this.log(`${e.name} is off balance — finish it`, 'good');
    eventBus.emit(Events.COMBAT_FEEDBACK, { kind: 'break', from: e.position.clone() });
    this.ctx.audio?.playParry?.();
  }

  _elementOn(e, el, light = false) {
    const S = this._steel(e);
    if (el === 'fire') S.burn = Math.max(S.burn, light ? 2 : 4);
    else if (el === 'ice') { e.slowTimer = Math.max(e.slowTimer || 0, light ? 1.5 : 3.5); e.slowMult = 0.5; }
    else if (el === 'lightning') e.hitStun = Math.max(e.hitStun || 0, light ? 0.25 : 1.1);
  }

  // ── Magic in the weapon ──────────────────────────────────
  _gainCharge(n) {
    if (this.trait === 'conductive') n *= 1.5;
    const was = this.bladeCharge;
    this.bladeCharge = Math.min(1, this.bladeCharge + n);
    this._chargeAt = this._now;
    if (was < 1 && this.bladeCharge >= 1) {
      this.log('The blade is full — Q to unleash it', 'good');
      eventBus.emit(Events.COMBAT_FEEDBACK, { kind: 'charged' });
    }
  }
  _chargeDecay(dt) {
    if (this.bladeCharge > 0 && this._now - (this._chargeAt || 0) > 12) this.bladeCharge = Math.max(0, this.bladeCharge - dt * 0.03);
  }
  get element() { return (this.oil && this._now < this.oil.until) ? this.oil.element : (this.ctx?.element?.() || 'neutral'); }

  unleash() {
    const p = this.ctx.player;
    if (this.bladeCharge < 1) { this.log(`The blade is not full yet (${Math.round(this.bladeCharge * 100)}%) — land clean blows, deflect, kill`, 'warn'); return; }
    if (p.attackCooldown > 0) return;
    const el = this.element;
    if (this._swing('heavy', 1, 'center', { plane: this.stance, unleash: true, element: el !== 'neutral' ? el : null, mult: 2.2, balanceMult: 3, ignoreGuard: true, reach: 0.8, arc: 150, all: true, staminaMult: 0.3, windMult: 0.8 })) {
      this.bladeCharge = 0;
    }
  }

  _burst(at, fwd) {
    const el = this.element;
    particleBursts.spawn(at, el === 'neutral' ? 'light' : el, { count: 34, sizeMult: 1.7, life: 0.8 });
    this.ctx.cameraController.shake(0.12, 0.22);
    this.ctx.windImpulse?.(at, 4, 1.6);
    if (el === 'lightning') {
      // It leaps to one more.
      const others = this.ctx.enemySpawner.getEnemiesInRange(at, 7);
      const t = others.find(e => e.position.distanceTo(at) > 2.5);
      if (t) { this._emitHit(t, this.ctx.player.stats.atk * 1.1, { opts: { element: 'lightning' } }); particleBursts.spawn(t.position.clone().setY(t.position.y + 1), 'lightning', { count: 16 }); }
    }
  }

  // ══════════════════════════════════════════════════════
  // TECHNIQUES (Z / X / C)
  // ══════════════════════════════════════════════════════
  /** The three technique slots for the family in hand: [{ id, def, learned, have, need, cd }]. */
  techniqueSlots() {
    const fam = this.fam;
    const have = this.practice[this.family] || 0;
    return (fam.techniques || []).slice(0, 3).map(id => {
      const def = TECHNIQUES[id];
      return { id, def, learned: have >= def.learn, have, need: def.learn, cd: this.techCd[id] || 0 };
    });
  }

  _checkLearned() {
    const fam = this.fam;
    for (const t of this.techniqueSlots()) {
      const key = `${this.family}:${t.id}`;
      if (t.learned && !this._announced.has(key)) {
        this._announced.add(key);
        if (t.need > 0) {
          const k = ['Z', 'X', 'C'][(fam.techniques || []).indexOf(t.id)];
          this.log(`Learned with the ${fam.name.toLowerCase()}: ${t.def.name} — ${k}`, 'good');
          eventBus.emit(Events.UI_NOTIFY, `Technique learned — ${t.def.name} (${k}). ${t.def.text}`);
        }
      }
    }
  }

  _technique(slot) {
    if (!slot) return;
    const p = this.ctx.player;
    if (!slot.learned) { this.log(`${slot.def.name}: not learned — ${slot.need - slot.have} more clean blows with this weapon`, 'warn'); return; }
    if (slot.cd > 0) { this.log(`${slot.def.name} — ready in ${slot.cd.toFixed(1)}s`, 'warn'); return; }
    if (this.guardBroken > 0 || p.attackCooldown > 0 || p.isAttacking) return;
    if (p.stamina < slot.def.stamina * 0.5) { this.log('No wind for that', 'warn'); return; }
    p.stamina = Math.max(0, p.stamina - slot.def.stamina);
    this.traitXP.wind += slot.def.stamina;
    const t = this.target;
    const fwd = this.ctx.cameraController.getForwardDirection().setY(0).normalize();
    let ok = true;
    switch (slot.def.kind) {
      case 'feint': {
        // A pulled cut. A humanoid in reach commits its guard to it.
        p.attackSpec = { line: lineId(this.stance, 'right'), kind: 'feint', tech: 'feint' };
        p.performAttack('light', 0, 0.6); p.attackCooldown *= 0.5; p.attackTotal *= 0.5; p.attackTimer = p.attackTotal; p._swingResolved = true;
        if (t?.alive && !isBeast(t.typeId) && t.position.distanceTo(p.position) < this.fam.reach + 2) {
          const S = this._steel(t);
          S.guardPlane = this.stance; S.guardT = 1.4; S.feintPlane = this.stance;
          this.feint = 1.4;
          this.log('They followed the feint — strike on another line', 'good');
        }
        break;
      }
      case 'halfsword': ok = this._swing('heavy', 0.4, 'center', { plane: 'mid', tech: 'halfsword', ignoreGuard: true, pierce: true, mult: 1.25, windMult: 1.2 }, true); break;
      case 'lunge':
        p.position.addScaledVector(fwd, 1.8 * (p.steelStepMult || 1));
        ok = this._swing('light', 0, 'center', { tech: 'lunge', reach: 1.0, mult: 1.35, stagger: 0.4 }, true);
        break;
      case 'flurry':
        ok = this._swing('light', 0, null, { tech: 'flurry', mult: 0.6, windMult: 0.55 }, true);
        { const side = this.swing?.line.side; this._queue.push({ kind: 'light', side, opts: { tech: 'flurry', mult: 0.6, windMult: 0.5 } }, { kind: 'light', side, opts: { tech: 'flurry', mult: 0.7, windMult: 0.5 } }); }
        break;
      case 'sidestep': {
        if (t?.alive) {
          _v.copy(p.position).sub(t.position).setY(0);
          const r = Math.max(1.4, _v.length()), a = Math.atan2(_v.x, _v.z) + (Math.random() < 0.5 ? 1 : -1) * 1.25;
          p.position.set(t.position.x + Math.sin(a) * r, p.position.y, t.position.z + Math.cos(a) * r);
        } else p.position.addScaledVector(this.ctx.cameraController.getRightDirection(), 1.8);
        this._stepAt = this._now;
        break;
      }
      case 'pommel': ok = this._swing('light', 0, 'center', { plane: 'mid', tech: 'pommel', reach: -this.fam.reach + 1.7, mult: 0.4, balanceMult: 3.2, hookGuard: true, ignoreGuard: true, stagger: 0.5, windMult: 0.6 }, true); break;
      case 'hook': ok = this._swing('light', 0, 'left', { tech: 'hook', mult: 0.5, balanceMult: 2.2, hookGuard: true, ignoreGuard: true, stagger: 0.7 }, true); break;
      case 'leap':
        p.velocity.y = Math.max(p.velocity.y, 5.5); p.isGrounded = false;
        p.position.addScaledVector(fwd, 1.2);
        ok = this._swing('heavy', 1, 'center', { plane: 'high', tech: 'leap', mult: 1.25, balanceMult: 2.2, stagger: 0.9 }, true);
        break;
      case 'sweep': ok = this._swing('heavy', 0.5, 'right', { plane: 'mid', tech: 'sweep', arc: 360, all: true, mult: 0.85, balanceMult: 1.5, knock: 1.2 }, true); break;
      case 'brace': this.brace = 1.4; this.log('Braced — every line is guarded for a moment', 'good'); break;
      case 'kick': ok = this._swing('light', 0, 'center', { plane: 'mid', tech: 'kick', reach: -this.fam.reach + 1.8, mult: 0.25, balanceMult: 4, ignoreGuard: true, knock: 1.6, windMult: 0.6 }, true); break;
    }
    if (ok !== false) this.techCd[slot.id] = slot.def.cd;
  }

  // ══════════════════════════════════════════════════════
  // DEFENCE — called by main.js where COMBAT_HIT reaches the player
  // ══════════════════════════════════════════════════════
  /**
   * @returns {{ damage:number, outcome:'hit'|'block'|'parry'|'guardbreak' }}
   */
  resolveIncoming(src, dmg) {
    const c = this.ctx, p = c.player;
    const from = src?.position || null;
    let frontal = true;
    if (from) {
      _v.copy(from).sub(p.position).setY(0).normalize();
      frontal = _v.dot(c.cameraController.getForwardDirection()) >= FRONT_COS;
    }
    const plane = src?.attackLine?.plane || 'mid';
    const side = src?.attackLine?.side || 'center';
    const covers = this.brace > 0 ? PLANES : (this.fam.property === 'ward' ? [this.stance, 'mid'] : [this.stance]);
    const guarded = input.isMouseDown(2) && frontal && this.guardBroken <= 0 && !p.isAttacking && covers.includes(plane);
    const pressedAgo = this._now - this._rmbAt;
    const S = src && typeof src === 'object' && 'hitStun' in src ? this._steel(src) : null;
    this._lastHurtAt = this._now;

    if (guarded && pressedAgo <= DEFLECT_WINDOW * (this.brace > 0 ? 2 : 1)) {
      // DEFLECT — it reels, you charge, a sword answers.
      if (S) {
        src.hitStun = Math.max(src.hitStun || 0, 1.0);
        src.attackState = 'recover'; src.attackStateTimer = 0.9;
        src.attackCooldown = Math.max(src.attackCooldown || 0, 1.3);
        S.balance -= 40; S.balanceAt = this._now; S.deflectedAt = this._now;
        if (S.balance <= 0) this._breakEnemy(src, S);
      }
      this.riposte = RIPOSTE_TIME;
      p.stamina = Math.min(p.maxStamina, p.stamina + 8);
      this.balance = Math.min(this.maxBalance, this.balance + 12);
      this._gainCharge(0.25);
      this.traitXP.grip += 1.5;
      c.audio?.playParry?.();
      c.cameraController.shake(0.12, 0.15);
      eventBus.emit(Events.COMBAT_FEEDBACK, { kind: 'parry', from });
      this.teach('deflect', this.fam.property === 'riposte' ? 'Deflected — your next cut comes at once' : 'Deflected — strike now', 'good');
      return { damage: 0, outcome: 'parry' };
    }
    if (guarded) {
      const cost = 4 + dmg * 0.3;
      const balCost = (6 + dmg * 0.45) * (1 + this._woundCount('armL') * 0.25) * (gatherSystem.buff('grip') ? 0.7 : 1);
      this.traitXP.grip += 1;
      if (p.stamina >= cost && this.balance > balCost) {
        p.stamina -= cost;
        this._loseBalance(balCost);
        c.audio?.playBlock?.();
        eventBus.emit(Events.COMBAT_FEEDBACK, { kind: 'block', from, amount: dmg });
        return { damage: 0, outcome: 'block' };
      }
      // The guard gives way.
      p.stamina = Math.max(0, p.stamina - cost);
      this._playerReel(1.1, 999, 'Guard broken — you are off balance');
      c.audio?.playGuardBreak?.();
      eventBus.emit(Events.COMBAT_FEEDBACK, { kind: 'guardbreak', from });
      return this._wound(dmg * 0.6, plane, side, from, 'guardbreak');
    }
    if (input.isMouseDown(2) && frontal && !covers.includes(plane)) {
      this.log(`It came ${plane === 'mid' ? 'through the middle' : plane} — you were guarding ${this.stance === 'mid' ? 'the middle' : this.stance}`, 'bad');
    } else if (input.isMouseDown(2) && !frontal) this.log('From behind — a guard only covers the front', 'bad');
    this._loseBalance(6 + dmg * 0.3);
    return this._wound(dmg, plane, side, from, 'hit');
  }

  /** A blow that got through: a wound on the region its line finds. */
  _wound(dmg, plane, side, from, outcome) {
    const p = this.ctx.player;
    let amount = dmg;
    const region = regionFor(plane, side);
    let frac = amount / Math.max(1, p.maxHp);
    if (this.ward > 0) {
      this.ward--; amount *= 0.3; frac = 0;
      this.log(`The ward takes it — ${this.ward} left`, 'good');
    }
    const sev = SEVERITY.find(s => frac < s.below) || SEVERITY[SEVERITY.length - 1];
    if (sev.id !== 'graze') {
      this.wounds.push({ region, sev: sev.id, bleed: sev.bleed, bound: false, at: this._now });
      if (this.wounds.length > 10) this.wounds.shift();
      this.teach('bleed', 'You are bleeding — hold F to bind it when you have a moment', 'bad');
      this.log(`${sev.name[0].toUpperCase() + sev.name.slice(1)} to the ${REGIONS[region].name}`, 'bad');
    }
    eventBus.emit(Events.COMBAT_FEEDBACK, { kind: 'hurt', from, amount, region });
    return { damage: amount, outcome };
  }

  _playerReel(t, bal, msg) {
    this.guardBroken = Math.max(this.guardBroken, t);
    this.blocking = false;
    this._loseBalance(bal);
    if (msg) this.log(msg, 'bad');
  }

  _loseBalance(n) {
    this.balance -= n;
    this._balanceHitAt = this._now;
    if (this.balance <= 0) {
      this.balance = 0;
      this.guardBroken = Math.max(this.guardBroken, 1.1);
      this.blocking = false;
      this.log('Off balance!', 'bad');
      eventBus.emit(Events.COMBAT_FEEDBACK, { kind: 'stagger' });
    }
  }

  _updateBalance(dt) {
    const head = this._woundCount('head');
    const footing = Math.min(TRAITS.footing.cap, Math.floor(this.traitXP.footing / TRAITS.footing.per) * TRAITS.footing.step);
    if (this.guardBroken <= 0 && this.balance <= 0) this.balance = this.maxBalance * 0.55;
    if (this._now - this._balanceHitAt > 1.2) this.balance = Math.min(this.maxBalance, this.balance + dt * 22 * (1 + footing) * (head ? 0.6 : 1) * (gatherSystem.buff('footing') ? 1.6 : 1));
  }

  // ── Step (Player._startDodge calls this) ──
  noteStep() { this._stepAt = this._now; }
  /** An enemy's blow missed (out of range / out of its arc). */
  noteWhiff() { if (this._now - this._stepAt < 0.7) { this.traitXP.footing++; this.teach('step', 'Stepped out of it — that is the only dodge there is', 'good'); } }

  // ══════════════════════════════════════════════════════
  // WOUNDS, BINDING, RITUALS
  // ══════════════════════════════════════════════════════
  _woundCount(region) {
    let n = 0;
    for (const w of this.wounds) if (w.region === region) n += w.bound ? 0.5 : (w.sev === 'deep' ? 1.5 : 1);
    return n;
  }
  get bleeding() { return this.wounds.reduce((s, w) => s + (w.bound ? 0 : w.bleed), 0) * (gatherSystem.buff('clot') ? 0.5 : 1); }

  _updateWounds(dt) {
    const p = this.ctx.player;
    const bleed = this.bleeding;
    if (bleed > 0 && !p.isDead) {
      p.hp = Math.max(0, p.hp - bleed * dt);
      if (p.hp <= 0 && !p.isDead) p._die?.();
    }
    // Bound wounds close once you have been out of a fight a while.
    if (this._now - this._lastHurtAt > 40) {
      const before = this.wounds.length;
      this.wounds = this.wounds.filter(w => !w.bound || this._now - (w.boundAt ?? -1e9) < 40);
      if (before !== this.wounds.length) this.log('Your bound wounds have closed', 'good');
    }
    // A wounded body holds less: the torso costs wind.
    const torso = this._woundCount('torso');
    if (torso > 0) p.stamina = Math.min(p.stamina, p.maxStamina * Math.max(0.5, 1 - torso * 0.1));
    if (p.isDead && this.wounds.length) this.wounds = [];
  }

  _updateBinding(dt, act) {
    const p = this.ctx.player;
    const want = act && input.isKeyDown('KeyF') && !p.isAttacking && !this.blocking && !this.ritual;
    if (!want) { if (this.binding > 0 && this.binding < 1) this.binding = 0; if (!input.isKeyDown('KeyF')) this.binding = 0; return; }
    if (!this.wounds.some(w => !w.bound)) {
      if (input.isKeyJustPressed('KeyF')) this.log(this.wounds.length ? 'Your wounds are already bound' : 'Nothing to bind', 'info');
      return;
    }
    this.binding = Math.min(1, this.binding + dt / BIND_TIME);
    if (this.binding >= 1) {
      for (const w of this.wounds) if (!w.bound) { w.bound = true; w.boundAt = this._now; }
      this.binding = 0;
      this.log('Bound — the bleeding stops', 'good');
    }
  }

  /** Start a ritual from the satchel. */
  beginRitual(item) {
    const def = RITUALS[item?.ritual || item?.id];
    if (!def) return false;
    if (this.ritual) { this.log('You are already preparing something', 'warn'); return false; }
    const close = this.ctx.enemySpawner.getEnemiesInRange(this.ctx.player.position, 9).some(e => e.state === 'chase' || e.state === 'attack');
    if (close) this.log('Preparing this with something hunting you is a risk', 'warn');
    this.ritual = { id: item.ritual || item.id, def, t: 0, item };
    return true;
  }

  _updateRitual(dt, act) {
    const r = this.ritual; if (!r) return;
    const p = this.ctx.player;
    if (!act || p.isAttacking || this._now - this._lastHurtAt < 0.05) {
      if (this._now - this._lastHurtAt < 0.05) { this.log(`${r.def.name} spoiled — you were struck`, 'bad'); this.ritual = null; }
      return;
    }
    r.t += dt;
    if (r.t < r.def.time) return;
    const d = r.def;
    if (d.kind === 'oil') this.oil = { id: r.id, element: d.element, until: this._now + d.lasts };
    else if (d.kind === 'ward') this.ward = d.hits;
    else if (d.kind === 'draught') {
      if (d.stopBleed) for (const w of this.wounds) if (!w.bound) { w.bound = true; w.boundAt = this._now; }
      if (d.heal) p.heal?.(d.heal);
      if (d.stamina) this.windUntil = this._now + d.lasts;
    }
    this.ctx.consume?.(r.item);
    this.log(`${d.name} — done. ${d.text}`, 'good');
    this.ritual = null;
  }

  // ── Growth: body traits ──
  _applyTraits() {
    const p = this.ctx.player;
    const grip = Math.min(TRAITS.grip.cap, Math.floor(this.traitXP.grip / TRAITS.grip.per) * TRAITS.grip.step);
    this.maxBalance = BALANCE_BASE + grip;
    const wind = Math.min(TRAITS.wind.cap, Math.floor(this.traitXP.wind / TRAITS.wind.per) * TRAITS.wind.step);
    // ⚠️ A factor over whatever else set maxStamina, never a second owner:
    // if something else rewrote it since our last write, adopt that as base.
    if (p.maxStamina !== this._maxStaminaSet) this._maxStaminaBase = p.maxStamina;
    p.maxStamina = this._maxStaminaBase + wind;
    this._maxStaminaSet = p.maxStamina;
  }
  traits() {
    return {
      grip: Math.min(TRAITS.grip.cap, Math.floor(this.traitXP.grip / TRAITS.grip.per) * TRAITS.grip.step),
      wind: Math.min(TRAITS.wind.cap, Math.floor(this.traitXP.wind / TRAITS.wind.per) * TRAITS.wind.step),
      footing: Math.min(TRAITS.footing.cap, Math.floor(this.traitXP.footing / TRAITS.footing.per) * TRAITS.footing.step),
    };
  }

  // ══════════════════════════════════════════════════════
  // THE ENEMY SIDE
  // ══════════════════════════════════════════════════════
  /** Per-creature steel state, created on first sight. */
  _steel(e) {
    if (e._steel) return e._steel;
    const beast = BEASTS[e.typeId];
    const skill = clamp(((e.level || 1) - 1) / 14, 0, 1);
    const max = (beast?.balance || 95) * (e.isBoss ? 1.8 : 1) * (e.scale < 0.5 ? 0.4 : 1);
    e._steel = {
      skill, beast: !!beast,
      balance: max, max, balanceAt: -9, stagger: 0,
      guardPlane: beast ? null : PLANES[Math.floor(Math.random() * 3)], guardT: 1 + Math.random() * 2, open: 0,
      shards: beast?.shards || 0, cripple: 0, armSlow: 0, bleed: 0, burn: 0,
      hyper: ['dragon', 'golem', 'sandworm'].includes(e.typeId) || !!e.isBoss,
      feintPlane: null, deflectedAt: -9, lineChosen: false, waitTurn: 0,
      baseSpeed: e.speed,
    };
    e.hyperArmor = e._steel.hyper;
    // A beast that comes with its brood.
    const swarm = beast?.swarm;
    if (swarm && !e.friendly && (e.scale || 1) > 0.5 && !e._swarmling) {
      const sp = this.ctx.enemySpawner;
      for (let i = 0; i < swarm.count; i++) {
        const a = (i / swarm.count) * Math.PI * 2;
        const pos = e.position.clone().add(new THREE.Vector3(Math.cos(a) * 1.6, 0.5, Math.sin(a) * 1.6));
        const s = sp.spawnNamed(e.typeIndex ?? 4, pos, e.level || 1, { scaleMult: swarm.scale, hpMult: 0.14, atkMult: 0.3, name: 'Skitterling' });
        if (s) s._swarmling = true;
      }
    }
    return e._steel;
  }

  _tickEnemy(e, dt) {
    if (!e.alive || e.friendly) return;
    const S = this._steel(e);
    const p = this.ctx.player;
    S.stagger = Math.max(0, S.stagger - dt);
    S.open = Math.max(0, S.open - dt);
    if (S.stagger <= 0 && S.balance <= 0) S.balance = S.max * 0.6;
    if (this._now - S.balanceAt > 2) S.balance = Math.min(S.max, S.balance + dt * 14);
    // Bleeding and burning creatures.
    if (S.bleed > 0 || S.burn > 0) {
      S._dotT = (S._dotT || 0) + dt;
      if (S._dotT >= 1) {
        S._dotT = 0;
        const n = (S.bleed > 0 ? 3 : 0) + (S.burn > 0 ? 5 : 0);
        S.bleed = Math.max(0, S.bleed - 1); S.burn = Math.max(0, S.burn - 1);
        eventBus.emit(Events.COMBAT_HIT, { source: 'player', target: e, damage: n });
      }
    }
    // Crippled legs, a wounded arm: slower.
    e.speed = S.baseSpeed * Math.max(0.45, 1 - S.cripple * 0.18);
    // ── Humanoid guard: held, shifted, and adapted to you ──
    if (!S.beast) {
      S.guardT -= dt;
      if (S.guardT <= 0) {
        S.guardT = (1.3 + Math.random() * 1.9) * (1 - S.skill * 0.35);
        S.guardPlane = Math.random() < 0.25 + S.skill * 0.45 ? this._lastSwingPlane : PLANES[Math.floor(Math.random() * 3)];
      }
      // Turn-taking: one presses you at a time; the rest circle.
      if (e.attackState === 'windup' && this._tokenHolder && this._tokenHolder !== e && e.position.distanceTo(p.position) < 7) {
        e.attackState = 'none';
        e.attackCooldown = 0.6 + Math.random() * 0.8;
        if (e.mesh) e.mesh.scale.setScalar(e.scale);
        e.waitTurn = 1.2;
      }
    }
    // ── The line of its blow, chosen as the windup starts ──
    if (e.attackState === 'windup' && !S.lineChosen) {
      S.lineChosen = true;
      let plane;
      const planes = BEASTS[e.typeId]?.planes || PLANES;
      // A reader of stances aims where you are not guarding.
      if (!S.beast && Math.random() < 0.3 + S.skill * 0.45) {
        const open = planes.filter(x => x !== this.stance);
        plane = open[Math.floor(Math.random() * open.length)];
      } else plane = planes[Math.floor(Math.random() * planes.length)];
      const side = ['left', 'right', 'center'][Math.floor(Math.random() * 3)];
      e.attackLine = { plane, side };
      // A wounded arm swings later.
      if (S.armSlow > 0) e.attackStateTimer *= 1 + S.armSlow;
    }
    if (e.attackState === 'none' || e.attackState === 'recover') S.lineChosen = false;
    e.guardPlane = S.beast ? null : (S.open > 0 || S.stagger > 0 ? null : S.guardPlane);
  }

  // ══════════════════════════════════════════════════════
  // TARGETING (unchanged in spirit)
  // ══════════════════════════════════════════════════════
  _candidates(range) {
    const p = this.ctx.player;
    return this.ctx.enemySpawner.getEnemiesInRange(p.position, range).filter(e => e.alive && !e.friendly);
  }
  _viewAngle(e) {
    const cam = this.ctx.cameraController.camera;
    cam.getWorldDirection(_w);
    _v.copy(e.position); _v.y += 1.0;
    _v.sub(cam.position);
    const d = _v.length();
    return { a: Math.acos(Math.max(-1, Math.min(1, _v.dot(_w) / Math.max(1e-4, d)))), d };
  }
  _pickSoft() {
    const range = this.ctx.isRanged() ? SOFT_RANGE_RANGED : SOFT_RANGE;
    let best = null, bestScore = Infinity;
    for (const e of this._candidates(range)) {
      const { a, d } = this._viewAngle(e);
      const lim = Math.max(THREE.MathUtils.degToRad(9), Math.min(THREE.MathUtils.degToRad(35), Math.atan2(1.6, d)));
      if (a > lim) continue;
      const score = a / lim + d / range * 0.5;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }
  toggleLock() {
    if (this.lockTarget) { this.lockTarget = null; return; }
    let t = this.softTarget || this._pickSoft();
    if (!t) {
      let best = Infinity;
      for (const e of this._candidates(LOCK_RANGE)) {
        const { a, d } = this._viewAngle(e);
        if (a > THREE.MathUtils.degToRad(50)) continue;
        if (a + d * 0.02 < best) { best = a + d * 0.02; t = e; }
      }
    }
    if (!t) { this.log('Nothing to lock on to', 'warn'); return; }
    this.lockTarget = t;
  }
  switchTarget(dir) {
    const cam = this.ctx.cameraController.camera;
    const sx = (e) => { _v.copy(e.position); _v.y += 1; _v.project(cam); return _v.z < 1 ? _v.x : null; };
    const cur = this.lockTarget ? sx(this.lockTarget) ?? 0 : 0;
    let pick = null, gap = Infinity;
    for (const e of this._candidates(LOCK_RANGE)) {
      if (e === this.lockTarget) continue;
      const x = sx(e); if (x === null || Math.abs(x) > 1.3) continue;
      const g = (x - cur) * dir;
      if (g > 0 && g < gap) { gap = g; pick = e; }
    }
    if (pick) this.lockTarget = pick;
  }
  _maintainLock(dt) {
    const t = this.lockTarget, c = this.ctx;
    if (!t) return;
    const p = c.player;
    if (!t.alive || t.position.distanceTo(p.position) > LOCK_BREAK) {
      this.lockTarget = null;
      if (!t.alive) {
        const next = this._candidates(LOCK_RANGE).sort((a, b) => a.position.distanceToSquared(p.position) - b.position.distanceToSquared(p.position))[0];
        if (next && next.position.distanceTo(p.position) < 12) this.lockTarget = next;
      }
      return;
    }
    const cam = c.cameraController;
    _v.copy(t.position); _v.y += 1.0 + (t.scale > 1.5 ? 0.6 : 0);
    _v.sub(cam.camera.position);
    const yaw = Math.atan2(-_v.x, -_v.z);
    const pitch = Math.atan2(_v.y, Math.hypot(_v.x, _v.z));
    const k = 1 - Math.exp(-9 * dt);
    cam.yaw += wrap(yaw - cam.yaw) * k;
    cam.pitch += (Math.max(-0.6, Math.min(0.5, pitch)) - cam.pitch) * k;
  }

  /**
   * May this creature start a blow now? Humanoids take turns: while one
   * near you is winding up or striking, the rest wait. Beasts never wait.
   */
  mayStrike(e) {
    if (isBeast(e.typeId)) return true;
    const p = this.ctx?.player; if (!p) return true;
    for (const o of this.ctx.enemySpawner.getEnemiesInRange(p.position, 7)) {
      if (o !== e && !isBeast(o.typeId) && (o.attackState === 'windup' || o.attackState === 'strike')) return false;
    }
    return true;
  }

  /** Kill credit (main.js COMBAT_KILL): the blade drinks. */
  noteKill() { this._gainCharge(0.2); }

  // ── Save ──
  save() {
    return { stance: this.stance, practice: this.practice, traitXP: this.traitXP, announced: [...this._announced],
      bladeCharge: this.bladeCharge, ward: this.ward, kitGiven: !!this.kitGiven,
      wounds: this.wounds.map(w => ({ region: w.region, sev: w.sev, bleed: w.bleed, bound: w.bound })) };
  }
  restore(v) {
    if (!v) return;
    if (PLANES.includes(v.stance)) this.stance = v.stance;
    this.practice = { ...(v.practice || {}) };
    this.traitXP = { grip: 0, wind: 0, footing: 0, ...(v.traitXP || {}) };
    this._announced = new Set(v.announced || []);
    this.bladeCharge = clamp(+v.bladeCharge || 0, 0, 1);
    this.ward = v.ward | 0;
    this.kitGiven = !!v.kitGiven;
    this.wounds = (v.wounds || []).map(w => ({ ...w, at: 0 }));
  }
}

export const combatSystem = new CombatSystem();
