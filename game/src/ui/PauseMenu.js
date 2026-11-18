// ══════════════════════════════════════════════════════════
// PauseMenu — Esc: Resume · Settings · Controls · Quit to title
//
// Owner (playability phase, decided in a grilling session): "Esc opens a
// pause menu … the game freezes while it's open … settings: master /
// effects / ambience volume, mouse sensitivity + invert-Y, field of
// view, graphics quality (applies on reload), frame-time readout, compact
// or full HUD. Saved in the browser, for every character."
//
// ⚠️ ESC IS SHARED. Every panel closes itself on Esc; the menu opens only
// when NOTHING was open when the key went down (checked in the capture
// phase, before those panels' own handlers close them), and never during
// a story scene (SceneUI owns Esc there).
// ⚠️ CHROME SWALLOWS ESC while the pointer is locked — it releases the
// lock instead and never delivers the key. So an UNEXPECTED pointer-lock
// release (not Alt / the Cursor button — InputManager stamps those — and
// not a panel opening, which is visible by then) also opens the menu.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';

const KEY = 'mz.settings';
export const DEFAULTS = { master: 0.5, sfx: 1, amb: 1, sens: 1, invertY: false, fov: 88, perf: false, hudFull: false, guardMark: true };

const CSS = `
#pause-menu { position: fixed; inset: 0; z-index: 2000; display: none; align-items: center; justify-content: center;
  background: radial-gradient(ellipse at center, rgba(8,7,6,.72), rgba(4,3,3,.9)); font-family: var(--r-serif, Georgia, serif); color: #e9e1cf; }
#pause-menu.open { display: flex; }
#pause-menu .pm-card { width: min(560px, 92vw); max-height: 86vh; overflow: auto; padding: 26px 32px 22px; background: rgba(14,12,10,.86);
  border-top: 1px solid rgba(233,225,207,.25); border-bottom: 1px solid rgba(233,225,207,.25); }
#pause-menu h2 { margin: 0 0 18px; font-weight: 500; letter-spacing: .32em; text-transform: uppercase; font-size: 15px; text-align: center; color: #efe6d6; }
#pause-menu .pm-main button { display: block; width: 100%; margin: 8px 0; padding: 11px; background: transparent; color: #e9e1cf; cursor: pointer;
  border: 1px solid rgba(233,225,207,.22); font: 500 13px/1 var(--r-serif, Georgia, serif); letter-spacing: .22em; text-transform: uppercase; }
#pause-menu button:hover { border-color: #d6b46a; color: #f3e2b5; }
#pause-menu .pm-row { display: grid; grid-template-columns: 1fr 1.3fr 3.2em; gap: 12px; align-items: center; margin: 10px 0; font-size: 14px; }
#pause-menu .pm-row input[type=range] { width: 100%; accent-color: #b58a3e; }
#pause-menu .pm-row output { text-align: right; font-size: 12px; opacity: .75; }
#pause-menu .pm-row select { background: #1c1814; color: #e9e1cf; border: 1px solid rgba(233,225,207,.25); padding: 4px; }
#pause-menu .pm-sec { margin: 18px 0 4px; font-size: 11px; letter-spacing: .26em; text-transform: uppercase; opacity: .55; }
#pause-menu .pm-note { font-size: 12px; opacity: .65; margin: 4px 0 0; }
#pause-menu .pm-back { margin-top: 18px; width: 100%; padding: 10px; background: transparent; color: #e9e1cf; border: 1px solid rgba(233,225,207,.22);
  font: 500 12px/1 var(--r-serif, Georgia, serif); letter-spacing: .22em; text-transform: uppercase; cursor: pointer; }
#pause-menu table { width: 100%; border-collapse: collapse; font-size: 13px; }
#pause-menu td { padding: 5px 4px; border-bottom: 1px solid rgba(233,225,207,.08); }
#pause-menu td:first-child { white-space: nowrap; color: #f0d9a4; width: 38%; }
`;

class PauseMenu {
  constructor() { this.isOpen = false; this.s = { ...DEFAULTS }; }

  /**
   * @param {object} ctx engine, input, audio, camera (CameraController), perfHUD,
   *   quality, save() → void, setHudFull(bool), canOpen() → bool
   */
  init(ctx) {
    this.ctx = ctx;
    try { Object.assign(this.s, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* private mode */ }
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = this.el = document.createElement('div');
    el.id = 'pause-menu';
    document.body.appendChild(el);
    this._show('main');
    this.apply();

    // Esc, checked in the CAPTURE phase so open panels are still open.
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape') return;
      if (this.isOpen) { e.stopPropagation(); e.preventDefault(); this.page === 'main' ? this.close() : this._show('main'); return; }
      if (this._busy()) return;
      e.preventDefault();
      this.open();
    }, true);
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement || this.isOpen) return;
      if (performance.now() - (ctx.input.intentionalUnlockAt || 0) < 400) return;
      // A panel opening releases the lock too; give it a moment to show.
      setTimeout(() => { if (!document.pointerLockElement && !this.isOpen && !this._busy()) this.open(); }, 60);
    });
    return this;
  }

  _busy() {
    if (!this.ctx.canOpen()) return true;
    if (document.body.classList.contains('in-scene')) return true;
    const sel = '.menu-panel:not(.hidden), [id$="-panel"]:not(.hidden), .panel:not(.hidden), .modal:not(.hidden), #death-overlay:not(.hidden)';
    return [...document.querySelectorAll(sel)].some(e => e.offsetParent !== null && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden');
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this._show('main');
    this.el.classList.add('open');
    if (document.pointerLockElement) { this.ctx.input.intentionalUnlockAt = performance.now(); document.exitPointerLock(); }
    this.ctx.engine.pause();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.remove('open');
    this.ctx.engine.resume();
    this.ctx.input.requestLook?.();   // a click on Resume is a user gesture
  }

  _show(page) {
    this.page = page;
    const s = this.s, q = this.ctx.quality;
    if (page === 'main') {
      this.el.innerHTML = `<div class="pm-card pm-main"><h2>Paused</h2>
        <button data-a="resume">Resume</button><button data-a="settings">Settings</button>
        <button data-a="controls">Controls</button><button data-a="quit">Save &amp; quit to title</button></div>`;
    } else if (page === 'settings') {
      const row = (id, label, min, max, step, val, fmt) => `<div class="pm-row"><label for="pm-${id}">${label}</label>
        <input id="pm-${id}" data-k="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${val}"><output id="pm-${id}-o">${fmt(val)}</output></div>`;
      const pct = (v) => `${Math.round(v * 100)}%`;
      this.el.innerHTML = `<div class="pm-card"><h2>Settings</h2>
        <div class="pm-sec">Sound</div>
        ${row('master', 'Master volume', 0, 1, 0.01, s.master, pct)}
        ${row('sfx', 'Effects', 0, 1, 0.01, s.sfx, pct)}
        ${row('amb', 'Ambience', 0, 1, 0.01, s.amb, pct)}
        <div class="pm-sec">Control</div>
        ${row('sens', 'Mouse sensitivity', 0.2, 3, 0.05, s.sens, (v) => `${(+v).toFixed(2)}×`)}
        <div class="pm-row"><label for="pm-invertY">Invert mouse Y</label><input id="pm-invertY" data-k="invertY" type="checkbox" ${s.invertY ? 'checked' : ''}><output></output></div>
        <div class="pm-sec">View</div>
        ${row('fov', 'Field of view', 65, 110, 1, s.fov, (v) => `${v}°`)}
        <div class="pm-row"><label for="pm-hudFull">Full HUD (F1)</label><input id="pm-hudFull" data-k="hudFull" type="checkbox" ${s.hudFull ? 'checked' : ''}><output></output></div>
        <div class="pm-row"><label for="pm-guardMark">Guard marks (which line a locked foe guards)</label><input id="pm-guardMark" data-k="guardMark" type="checkbox" ${s.guardMark !== false ? 'checked' : ''}><output></output></div>
        <div class="pm-row"><label for="pm-perf">Frame-time readout (F3)</label><input id="pm-perf" data-k="perf" type="checkbox" ${s.perf ? 'checked' : ''}><output></output></div>
        <div class="pm-sec">Graphics</div>
        <div class="pm-row"><label for="pm-q">Quality</label><select id="pm-q">${['low', 'medium', 'high', 'ultra'].map(t => `<option ${q.tier === t ? 'selected' : ''}>${t}</option>`).join('')}</select><output></output></div>
        <p class="pm-note" id="pm-qnote">Quality applies after a reload — the game saves first.</p>
        <button class="pm-back" data-a="back">Back</button></div>`;
    } else if (page === 'controls') {
      const C = [
        ['W A S D · Shift · Space', 'move · sprint · jump'], ['Mouse', 'look'],
        ['1 / 2 / 3 · wheel', 'stance — high, middle, low guard (your guard and your line)'],
        ['LMB', 'cut on your stance\'s line — keep clicking for its combo'],
        ['flick + LMB', 'flick the mouse as you click: the blade travels that way (up = thrust / overhead)'],
        ['hold LMB', 'committed heavy — slower, breaks balance'],
        ['RMB', 'guard your stance\'s line — in the last instant: deflect'],
        ['R', 'step — no invincibility; leave the arc'],
        ['Z X C', 'techniques of the weapon in hand (learned by using it)'],
        ['Q', 'unleash the blade\'s charge'], ['F (hold)', 'bind your wounds'],
        ['G', 'draw the next weapon on your belt'],
        ['T', 'draw a tool — pickaxe, woodsman\'s axe, skinning knife — again for your weapon'],
        ['MMB · Shift+wheel', 'lock on · switch target'], ['E', 'interact'],
        ['I', 'satchel — oils, wards and draughts are prepared from here'],
        ['B', 'the Loom'], ['K', 'the Ascent'],
        ['Tab', 'menu — forge, codex, journal & map, the rite'],
        ['F1', 'compact / full HUD'], ['F3', 'frame-time readout'], ['Alt', 'free the cursor'], ['Esc', 'this menu'],
      ];
      this.el.innerHTML = `<div class="pm-card"><h2>Controls</h2><table>${C.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
        <button class="pm-back" data-a="back">Back</button></div>`;
    }
    this.el.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => this._act(b.dataset.a)));
    this.el.querySelectorAll('input[data-k]').forEach(inp => inp.addEventListener('input', () => {
      const k = inp.dataset.k;
      this.s[k] = inp.type === 'checkbox' ? inp.checked : +inp.value;
      const o = this.el.querySelector(`#pm-${k}-o`);
      if (o) o.textContent = k === 'sens' ? `${(+inp.value).toFixed(2)}×` : k === 'fov' ? `${inp.value}°` : `${Math.round(inp.value * 100)}%`;
      this.apply(k); this._save();
    }));
    const sel = this.el.querySelector('#pm-q');
    if (sel) sel.addEventListener('change', () => {
      if (sel.value === q.tier) return;
      q.setTier(sel.value);
      this.el.querySelector('#pm-qnote').innerHTML = `Set to <b>${sel.value}</b>. <button class="pm-back" data-a="reload" style="margin-top:8px">Save &amp; reload now</button>`;
      this.el.querySelector('[data-a="reload"]').addEventListener('click', () => this._act('reload'));
    });
  }

  _act(a) {
    if (a === 'resume') this.close();
    else if (a === 'settings' || a === 'controls') this._show(a);
    else if (a === 'back') this._show('main');
    else if (a === 'quit' || a === 'reload') { try { this.ctx.save(); } catch (e) { console.warn('[PauseMenu] save failed', e); } location.reload(); }
  }

  /** Push the settings into the game. */
  apply(only = null) {
    const s = this.s, c = this.ctx, all = !only;
    if (all || ['master', 'sfx', 'amb'].includes(only)) { c.audio.setMasterVolume(s.master); c.audio.setSfxVolume?.(s.sfx); c.audio.setAmbientVolume?.(s.amb); }
    if (all || ['sens', 'invertY', 'fov'].includes(only)) { c.camera.sensMult = s.sens; c.camera.invertY = !!s.invertY; c.camera.baseFov = s.fov; }
    if ((all || only === 'perf') && c.perfHUD && !!c.perfHUD.visible !== !!s.perf) c.perfHUD.toggle();
    if (all || only === 'hudFull') c.setHudFull?.(!!s.hudFull);
    if (all || only === 'guardMark') document.body.classList.toggle('no-guard-mark', s.guardMark === false);
  }

  /** Keep the stored value in step when something else changes it (F1, F3). */
  sync(k, v) { this.s[k] = v; this._save(); }

  _save() { try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch { /* private mode */ } }
}

export const pauseMenu = new PauseMenu();
