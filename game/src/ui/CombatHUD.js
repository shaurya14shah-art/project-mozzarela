// ══════════════════════════════════════════════════════════
// CombatHUD — making a fight READABLE
//
// Owner: "can't tell if I hit, can't tell when I'm hit, resources
// unclear". Every answer here is drawn from systems/CombatSystem.js and
// the ENEMY_HURT / COMBAT_FEEDBACK / COMBAT_LOG events:
//
//   • TARGET BAR (top centre) — name, level and health of the soft- or
//     hard-locked target; "LOCKED" when hard; a gold edge during a
//     riposte window.
//   • RETICLE over the target — corner brackets (soft), a ring (hard).
//     A "!" over any enemy in view that is winding up to strike.
//   • HIT MARKER at the crosshair — tick (hit), heavier tick (heavy /
//     riposte), red cross (kill), grey shield (blocked), gold ring
//     (parry). Each has its own sound (AudioSystem).
//   • DIRECTION — a red wedge on the edge of the screen toward whatever
//     just hurt you; an ORANGE wedge toward anything off-screen that is
//     winding up an attack on you.
//   • CROSSHAIR RING — heavy charge filling, block held (shield), and
//     stamina as a thin arc under it whenever it is not full.
//   • COMBAT LOG — one fading line above the hotbar that says WHY:
//     not enough Focus, recovering, out of stamina, resisted, weak to…
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { eventBus, Events } from '../core/EventBus.js';
import { Enemy } from '../entities/Enemy.js';

const CSS = `
#ch-root { position: fixed; inset: 0; pointer-events: none; z-index: 30; font-family: var(--font-display, 'Cormorant Garamond', Georgia, serif); }
#ch-target { position: absolute; top: 4.2vh; left: 50%; transform: translateX(-50%); width: min(380px, 60vw); text-align: center; opacity: 0; transition: opacity .18s; }
#ch-target.on { opacity: 1; }
#ch-target .n { color: #efe6d6; letter-spacing: .14em; text-transform: uppercase; font-size: 13px; text-shadow: 0 1px 3px #000; }
#ch-target .n small { color: #b9ab93; font-size: 12px; margin-left: .6em; letter-spacing: .08em; }
#ch-target .n em { color: #e8b04a; font-style: normal; font-size: 11px; margin-left: .7em; letter-spacing: .2em; }
#ch-target .b { position: relative; height: 7px; margin-top: 5px; background: rgba(10,8,8,.72); border: 1px solid rgba(232,214,180,.35); }
#ch-target .b i { position: absolute; inset: 0; transform-origin: left; background: linear-gradient(#b5322b, #7d1d18); }
#ch-target .b u { position: absolute; inset: 0; transform-origin: left; background: rgba(240,220,190,.55); transition: transform .45s ease-out .15s; }
#ch-target.riposte .b { box-shadow: 0 0 0 1px #e8b04a, 0 0 12px rgba(232,176,74,.7); }
#ch-reticle { position: absolute; width: 0; height: 0; opacity: 0; transition: opacity .12s; }
#ch-reticle.on { opacity: 1; }
#ch-reticle::before, #ch-reticle::after { content: ''; position: absolute; left: -22px; top: -22px; width: 44px; height: 44px; }
#ch-reticle.soft::before { border: 2px solid rgba(240,228,205,.75); clip-path: polygon(0 0,30% 0,30% 8%,8% 8%,8% 30%,0 30%, 0 70%,8% 70%,8% 92%,30% 92%,30% 100%,0 100%, 100% 100%,70% 100%,70% 92%,92% 92%,92% 70%,100% 70%, 100% 30%,92% 30%,92% 8%,70% 8%,70% 0,100% 0); }
#ch-reticle.hard::before { border: 2px solid rgba(232,90,70,.95); border-radius: 50%; box-shadow: 0 0 8px rgba(232,90,70,.6); }
#ch-reticle.hard::after { left: -3px; top: -3px; width: 6px; height: 6px; border-radius: 50%; background: rgba(232,90,70,.95); }
.ch-warn { position: absolute; transform: translate(-50%, -100%); color: #ffb347; font: 700 22px/1 Georgia, serif; text-shadow: 0 0 6px #000, 0 0 10px rgba(255,140,40,.8); animation: chPulse .35s ease-in-out infinite alternate; }
/* The instant to parry: the blow lands within the parry window. */
.ch-warn.now { color: #ff3b2f; font-size: 30px; text-shadow: 0 0 6px #000, 0 0 16px rgba(255,40,30,.95); animation: none; transform: translate(-50%,-110%) scale(1.3); }
@keyframes chPulse { from { transform: translate(-50%,-100%) scale(1); } to { transform: translate(-50%,-110%) scale(1.25); } }
#ch-hit { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
#ch-hit b { position: absolute; left: -14px; top: -14px; width: 28px; height: 28px; opacity: 0; }
#ch-hit b.go { animation: chHit .28s ease-out forwards; }
#ch-hit b.hit { background: linear-gradient(45deg, transparent 46%, #fff 46%, #fff 54%, transparent 54%), linear-gradient(-45deg, transparent 46%, #fff 46%, #fff 54%, transparent 54%); -webkit-mask: radial-gradient(circle, transparent 7px, #000 7.5px); mask: radial-gradient(circle, transparent 7px, #000 7.5px); }
#ch-hit b.heavy { transform: scale(1.4); }
#ch-hit b.kill { background: linear-gradient(45deg, transparent 44%, #ff4a3a 44%, #ff4a3a 56%, transparent 56%), linear-gradient(-45deg, transparent 44%, #ff4a3a 44%, #ff4a3a 56%, transparent 56%); transform: scale(1.6); }
#ch-hit b.block { border: 3px solid #c9c4b8; border-radius: 40% 40% 50% 50% / 30% 30% 70% 70%; }
#ch-hit b.parry { border: 3px solid #f2c45a; border-radius: 50%; box-shadow: 0 0 14px #f2c45a; transform: scale(1.8); }
@keyframes chHit { 0% { opacity: 1; } 100% { opacity: 0; } }
#ch-ring { position: absolute; left: 50%; top: 50%; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%; opacity: 0; transition: opacity .12s;
  background: conic-gradient(rgba(240,214,160,.9) calc(var(--c,0) * 1turn), transparent 0); -webkit-mask: radial-gradient(circle, transparent 19px, #000 20px); mask: radial-gradient(circle, transparent 19px, #000 20px); }
#ch-ring.on { opacity: 1; } #ch-ring.full { background: conic-gradient(#f2c45a 1turn, transparent 0); filter: drop-shadow(0 0 6px #f2c45a); }
#ch-shield { position: absolute; left: 50%; top: 50%; width: 26px; height: 30px; margin: 22px 0 0 -13px; opacity: 0; transition: opacity .1s;
  border: 2px solid rgba(220,214,200,.9); border-radius: 40% 40% 50% 50% / 25% 25% 75% 75%; background: rgba(40,36,30,.45); }
#ch-shield.on { opacity: 1; } #ch-shield.broken { border-color: #d0453a; opacity: 1; }
#ch-stam { position: absolute; left: 50%; top: 50%; width: 64px; height: 64px; margin: -32px 0 0 -32px; border-radius: 50%; opacity: 0; transition: opacity .3s;
  background: conic-gradient(from 135deg, rgba(150,200,120,.85) calc(var(--s,1) * .25turn), rgba(255,255,255,.08) 0 .25turn, transparent 0);
  -webkit-mask: radial-gradient(circle, transparent 29px, #000 30px); mask: radial-gradient(circle, transparent 29px, #000 30px); transform: rotate(0deg); }
#ch-stam.on { opacity: .9; } #ch-stam.low { background: conic-gradient(from 135deg, rgba(220,90,70,.9) calc(var(--s,1) * .25turn), rgba(255,255,255,.08) 0 .25turn, transparent 0); }
.ch-dir { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
.ch-dir i { position: absolute; left: -70px; top: calc(-1 * var(--r)); width: 140px; height: 34px; border-radius: 50% 50% 0 0 / 100% 100% 0 0;
  background: radial-gradient(ellipse at 50% 100%, var(--col) 0%, transparent 70%); opacity: .9; }
.ch-dir.fade { animation: chFade 1.1s ease-out forwards; }
@keyframes chFade { from { opacity: 1; } to { opacity: 0; } }
/* STEEL: the faint guard mark (which plane a locked humanoid guards) and
   the line a blow is coming on. A short brush stroke beside the body at
   the plane's height — ink for a guard, red for an incoming blow.
   Settings → "Guard marks" turns them off (body.no-guard-mark). */
.ch-gm { position: absolute; width: 0; height: 0; pointer-events: none; }
.ch-gm i { position: absolute; left: 0; width: 26px; height: 3px; border-radius: 2px; transform: translate(-50%, -50%) skewX(-18deg);
  background: linear-gradient(90deg, transparent, rgba(233,225,207,.75) 30%, rgba(233,225,207,.75) 70%, transparent); opacity: .7; }
.ch-gm.atk i { background: linear-gradient(90deg, transparent, #d0453a 25%, #ff6a50 50%, #d0453a 75%, transparent); height: 4px; width: 38px; opacity: .95; }
.ch-gm.atk.now i { box-shadow: 0 0 10px #ff4a30; width: 46px; }
.ch-gm small { position: absolute; left: 18px; top: -6px; font: italic 11px/1 Georgia, serif; color: rgba(233,225,207,.7); text-shadow: 0 1px 2px #000; white-space: nowrap; }
body.no-guard-mark .ch-gm.guard { display: none; }
#ch-target .bal { position: relative; height: 2px; margin: 3px auto 0; width: 70%; background: rgba(10,8,8,.5); }
#ch-target .bal i { position: absolute; inset: 0; transform-origin: left; background: #c7a76a; }
#ch-target.broken .bal i { background: #ff6a50; }
#ch-log { position: absolute; left: 50%; top: calc(50% + 58px); transform: translateX(-50%); background: rgba(8,6,6,.55); padding: 3px 14px; border-radius: 2px; color: #efe6d6; font-size: 16px; letter-spacing: .06em; text-align: center;
  text-shadow: 0 1px 3px #000, 0 0 8px #000; opacity: 0; transition: opacity .25s; white-space: nowrap; }
#ch-log.on { opacity: 1; } #ch-log.warn { color: #f0c27a; } #ch-log.bad { color: #ff8a7a; } #ch-log.good { color: #b8e08c; }
`;

const _v = new THREE.Vector3();

class CombatHUD {
  init({ camera, combat, player, enemySpawner, audio }) {
    Object.assign(this, { camera, combat, player, enemySpawner, audio });
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const root = this.root = document.createElement('div');
    root.id = 'ch-root';
    root.innerHTML = `
      <div id="ch-target"><div class="n"></div><div class="b"><u></u><i></i></div><div class="bal"><i></i></div></div><div id="ch-gms"></div>
      <div id="ch-reticle"></div><div id="ch-warns"></div>
      <div id="ch-stam"></div><div id="ch-ring"></div><div id="ch-shield"></div>
      <div id="ch-hit"><b></b></div><div id="ch-dirs"></div><div id="ch-log"></div>`;
    (document.getElementById('hud') || document.body).appendChild(root);
    const $ = (s) => root.querySelector(s);
    this.el = { target: $('#ch-target'), tn: $('#ch-target .n'), tbar: $('#ch-target .b i'), tlag: $('#ch-target .b u'), tbal: $('#ch-target .bal i'), gms: $('#ch-gms'),
      ret: $('#ch-reticle'), warns: $('#ch-warns'), stam: $('#ch-stam'), ring: $('#ch-ring'), shield: $('#ch-shield'),
      hit: $('#ch-hit b'), dirs: $('#ch-dirs'), log: $('#ch-log') };
    this._warnEls = new Map();
    this._logT = null; this._lastLog = ''; this._lastLogAt = 0;
    this._relSeen = new Map();
    this._shownTarget = null;

    eventBus.on(Events.COMBAT_LOG, ({ text, kind }) => this.log(text, kind));
    eventBus.on(Events.COMBAT_FEEDBACK, (f) => this._feedback(f));
    eventBus.on(Events.ENEMY_HURT, (h) => this._hurt(h));
    return this;
  }

  // ── Events ─────────────────────────────────────────────
  log(text, kind = 'info') {
    const now = performance.now();
    if (text === this._lastLog && now - this._lastLogAt < 900) return;   // no spam
    this._lastLog = text; this._lastLogAt = now;
    const l = this.el.log;
    l.textContent = text; l.className = `on ${kind}`;
    clearTimeout(this._logT);
    this._logT = setTimeout(() => { l.className = kind; }, 2200);
  }

  _marker(cls) {
    const b = this.el.hit;
    b.className = cls; void b.offsetWidth; b.className = `${cls} go`;
  }

  _hurt({ enemy, relation, element, killed, byPlayer }) {
    if (!byPlayer) return;
    const heavy = this.player.attackKind === 'heavy' && this.player.isAttacking;
    if (killed) { this._marker('kill'); this.audio?.playKill?.(); }
    else { this._marker(heavy ? 'hit heavy' : 'hit'); this.audio?.playHitTick?.(); }
    // Say what the element did — once in a while per creature kind, not every hit.
    if (element && relation && relation !== 'neutral') {
      const key = `${enemy.typeId}:${element}:${relation}`;
      const now = performance.now();
      if (!this._relSeen.has(key) || now - this._relSeen.get(key) > 12000) {
        this._relSeen.set(key, now);
        const el = element[0].toUpperCase() + element.slice(1);
        if (relation === 'opposed') this.log(`${enemy.name} is weak to ${el} — extra damage`, 'good');
        else if (relation === 'matched') this.log(`${enemy.name} resists ${el} — try another element or the weapon`, 'warn');
      }
    }
  }

  _feedback({ kind, from, byPlayer }) {
    if (kind === 'block') this._marker('block');
    if (byPlayer) return;   // your own blow met a guard: no "hit from" wedge
    if (kind === 'parry') this._marker('parry');
    if (kind === 'hurt' || kind === 'guardbreak') this._direction(from, 'rgba(220,40,30,.85)', true);
    if (kind === 'block') this._direction(from, 'rgba(210,205,190,.6)', true);
  }

  /** A wedge on the screen edge toward `from` (world). `fade` = one-shot. */
  _direction(from, col, fade, el = null) {
    if (!from) return null;
    const a = this._relAngle(from);
    const d = el || document.createElement('div');
    d.className = `ch-dir${fade ? ' fade' : ''}`;
    d.style.cssText = `--col:${col}; --r:min(38vh, 38vw); transform: rotate(${a}rad)`;
    if (!el) { d.innerHTML = '<i></i>'; this.el.dirs.appendChild(d); }
    if (fade) setTimeout(() => d.remove(), 1150);
    return d;
  }

  /** Screen-space bearing of a world point: 0 = straight ahead (top), clockwise. */
  _relAngle(p) {
    const cam = this.camera;
    _v.copy(p).sub(cam.position);
    _v.applyQuaternion(cam.quaternion.clone().invert());
    return Math.atan2(_v.x, -_v.z);
  }

  // ── Per frame ──────────────────────────────────────────
  update() {
    const c = this.combat, p = this.player, e = this.el;
    // Target bar + reticle.
    const t = c.target;
    Enemy.hudTarget = t?.alive ? t : null;
    if (t?.alive) {
      if (this._shownTarget !== t) {
        this._shownTarget = t;
        e.tlag.style.transition = 'none'; e.tlag.style.transform = `scaleX(${t.hp / t.maxHp})`; void e.tlag.offsetWidth; e.tlag.style.transition = '';
      }
      const frac = Math.max(0, t.hp / t.maxHp);
      e.tn.innerHTML = `${t.name}<small>${t._clsLabel || ''}</small>${c.lockTarget ? '<em>LOCKED</em>' : ''}`;
      const S = t._steel;
      if (S) { e.tbal.style.transform = `scaleX(${Math.max(0, S.balance / S.max).toFixed(3)})`; }
      e.tbar.style.transform = `scaleX(${frac})`;
      e.tlag.style.transform = `scaleX(${frac})`;
      e.target.className = `on${c.riposte > 0 ? ' riposte' : ''}${t._steel?.stagger > 0 ? ' broken' : ''}`;
      const s = this._screen(t.position, (t.scale || 1) * 1.0 + 0.4);
      if (s) { e.ret.style.left = `${s.x}px`; e.ret.style.top = `${s.y}px`; e.ret.className = `on ${c.lockTarget ? 'hard' : 'soft'}`; }
      else e.ret.className = '';
    } else {
      this._shownTarget = null;
      e.target.className = ''; e.ret.className = '';
    }

    // Crosshair: heavy charge, block, stamina.
    e.ring.className = c.charging ? `on${c.charge >= 0.98 ? ' full' : ''}` : '';
    e.ring.style.setProperty('--c', c.charge.toFixed(3));
    e.shield.className = c.guardBroken > 0 ? 'broken' : c.blocking ? 'on' : '';
    const sf = p.stamina / Math.max(1, p.maxStamina);
    e.stam.style.setProperty('--s', sf.toFixed(3));
    e.stam.className = sf < 0.995 ? `on${sf < 0.25 ? ' low' : ''}` : '';

    // ── STEEL marks ──
    // Incoming: a red stroke at the height of the plane the blow is
    // coming on, for every creature winding up near you (an orange edge
    // wedge when it is off screen). Guard: a faint ink stroke at the
    // plane a locked (or soft-targeted) humanoid is guarding.
    const near = this.enemySpawner.getEnemiesInRange(p.position, 10);
    const seen = new Set();
    const planeLift = (en, plane) => (en.scale || 1) * (plane === 'high' ? 1.75 : plane === 'mid' ? 1.1 : 0.35);
    const mark = (key, en, plane, cls, label) => {
      let w = this._warnEls.get(key);
      if (!w) { w = { mark: document.createElement('div'), dir: null }; w.mark.innerHTML = '<i></i><small></small>'; this.el.gms.appendChild(w.mark); this._warnEls.set(key, w); }
      seen.add(key);
      w.mark.className = `ch-gm ${cls}`;
      const sm = w.mark.querySelector('small'); if (sm.textContent !== label) sm.textContent = label;
      const s = this._screen(en.position, planeLift(en, plane));
      const onScreen = s && s.x > 0 && s.x < innerWidth && s.y > 0 && s.y < innerHeight;
      w.mark.style.display = onScreen ? '' : 'none';
      if (onScreen) { w.mark.style.left = `${s.x + 26 * (en.scale || 1)}px`; w.mark.style.top = `${s.y}px`; }
      return { w, onScreen };
    };
    for (const en of near) {
      if (!en.alive || en.friendly || en.attackState !== 'windup' || !en.attackLine) continue;
      const pl = en.attackLine.plane;
      const { w, onScreen } = mark(en, en, pl, `atk${(en.attackStateTimer ?? 1) <= 0.22 ? ' now' : ''}`, pl === 'mid' ? 'middle' : pl);
      if (!onScreen) w.dir = this._direction(en.position, 'rgba(255,150,40,.9)', false, w.dir);
      else if (w.dir) { w.dir.remove(); w.dir = null; }
    }
    if (t?.alive && t.guardPlane && t.attackState === 'none') mark(`g:${t.id}`, t, t.guardPlane, 'guard', 'guard');
    for (const [key, w] of this._warnEls) {
      if (seen.has(key)) continue;
      w.mark.remove(); w.dir?.remove(); this._warnEls.delete(key);
    }
  }

  _screen(pos, lift) {
    _v.copy(pos); _v.y += lift;
    _v.project(this.camera);
    if (_v.z > 1 || _v.z < -1) return null;
    return { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight };
  }
}

export const combatHUD = new CombatHUD();
