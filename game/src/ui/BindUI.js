// ══════════════════════════════════════════════════════════
// Bindings (V) — pick a thing, press a key
//
// The whole interaction is two steps and no dropdowns: click what you
// want, then press the key you want it on. That is the shortest path
// from intent to result, and it is the one every game that lets you
// rebind anything has converged on.
//
// ── ⚠️ CAPTURE MODE IS A MODE, AND MUST LOOK LIKE ONE ─────
// While waiting for a key, this listener swallows EVERY keypress —
// including the ones that normally open other panels. If that state
// were not loudly visible the player would press J expecting the
// journal, silently bind something to J, and have no idea what
// happened. Hence the full-panel overlay and Escape to cancel.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';
import { overlayManager } from './OverlayManager.js';
import { audioSystem } from '../systems/AudioSystem.js';
import { bindSystem, keyLabel, RESERVED_KEYS, BIND_KINDS } from '../systems/BindSystem.js';
import { sigilFor, elementGlyph } from './Sigil.js';

const PANEL_ID = 'bind-panel';

class BindUI {
  constructor() {
    this.el = null;
    this._wand = null;
    this._spoils = null;
    this._capturing = null;   // the thing awaiting a key, or null
  }

  init({ wandSystem, spoilsSystem, loadout }) {
    this._loadout = loadout || null;
    this._wand = wandSystem;
    this._spoils = spoilsSystem;
    this._build();

    const repaint = () => { if (this.isOpen) this.render(); };
    eventBus.on(Events.BINDINGS_CHANGED, repaint);
    // ⚠️ The gear rows print WHERE each thing is (slot 1 / carried /
    // in the satchel), and that changes every time a letter is
    // pressed. Without this the panel keeps saying "in the satchel"
    // about something standing beside you.
    eventBus.on(Events.LOADOUT_CHANGED, repaint);
    eventBus.on(Events.WAND_INFUSE, repaint);
    eventBus.on(Events.REVENANT_BOUND, repaint);
    eventBus.on(Events.REMNANT_CLAIMED, repaint);

    document.addEventListener('keydown', (e) => this._onKey(e), true);
  }

  get isOpen() { return this.el && !this.el.classList.contains('hidden'); }

  _onKey(e) {
    // ── Capture mode wins over everything ──
    if (this._capturing) {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') { this._cancelCapture(); return; }
      const res = bindSystem.bind(e.code, this._capturing);
      if (!res.ok) {
        this._flash(res.reason, 'bad');
      } else {
        this._flash(`${this._capturing.name} → ${keyLabel(e.code)}`, 'good');
        audioSystem.playUIClick?.('open');
      }
      this._capturing = null;
      this.render();
      return;
    }
    if (document.activeElement?.tagName === 'INPUT') return;
    // ⚠️ V IS KEPT as a direct key at the owner's instruction — the
    // bindings registry is one of the four panels reached often
    // enough that a Tab hop in front of it is a cost. Also listed in
    // the Pioneer menu (Tab). KeyV stays reserved.
    if (e.key.toLowerCase() === 'v') this.toggle();
    else if (e.key === 'Escape' && this.isOpen) this.close();
  }

  _build() {
    if (document.getElementById(PANEL_ID)) return;
    const el = document.createElement('div');
    el.id = PANEL_ID;
    el.className = 'menu-panel bind-panel hidden';
    el.innerHTML = `
      <div class="menu-header">
        <h2>Bindings</h2>
        <button id="bind-close" class="close-btn">×</button>
      </div>
      <p class="bind-lead">
        Click a thing, then press the key you want it on. Any key.
        Click a bound key to clear it.<br>
        <em>A forged thing's letter summons it — three at once — and its
        active Facets fill the number keys 1 to 9.</em>
      </p>
      <div class="bind-flash" id="bind-flash"></div>
      <div class="bind-body" id="bind-body"></div>
      <div class="bind-capture hidden" id="bind-capture">
        <div class="bind-capture-inner">
          <div class="bind-capture-name" id="bind-capture-name"></div>
          <div class="bind-capture-ask">Press any key.</div>
          <div class="bind-capture-esc">Escape to cancel</div>
        </div>
      </div>
    `;
    (document.getElementById('menus-overlay') || document.body).appendChild(el);
    this.el = el;
    el.querySelector('#bind-close').onclick = () => this.close();

    el.addEventListener('click', (ev) => {
      const row = ev.target.closest('[data-bind-id]');
      if (row) { this._beginCapture(row.dataset.bindKind, row.dataset.bindId, row.dataset.bindName); return; }
      const clear = ev.target.closest('[data-unbind]');
      if (clear) { bindSystem.unbind(clear.dataset.unbind); this.render(); }
    });
  }

  _beginCapture(kind, id, name) {
    this._capturing = { kind, id, name };
    document.getElementById('bind-capture-name').textContent = name;
    document.getElementById('bind-capture').classList.remove('hidden');
  }

  _cancelCapture() {
    this._capturing = null;
    document.getElementById('bind-capture')?.classList.add('hidden');
  }

  _flash(text, kind) {
    const f = document.getElementById('bind-flash');
    if (!f) return;
    f.textContent = text;
    f.dataset.kind = kind;
    clearTimeout(this._flashT);
    this._flashT = setTimeout(() => { f.textContent = ''; f.dataset.kind = ''; }, 2600);
  }

  open() { this.render(); overlayManager.open(PANEL_ID); audioSystem.playUIClick?.('open');
           if (document.pointerLockElement) document.exitPointerLock(); }
  close() { this._cancelCapture(); overlayManager.close(PANEL_ID); audioSystem.playUIClick?.('close'); }
  toggle() { this.isOpen ? this.close() : this.open(); }

  render() {
    const body = this.el?.querySelector('#bind-body');
    if (!body) return;
    document.getElementById('bind-capture')?.classList.add('hidden');

    const weaves = (this._wand?.getSlots() || [])
      .filter(s => s.spell)
      .map(s => ({ kind: BIND_KINDS.WEAVE, id: s.id, name: s.spell.name,
                   sub: `${s.charges} charges`, element: s.spell.element, dim: s.dim }));
    // ⚠️ Active Aspects of equipped Memories. They already hold a
    // default number key; binding here OVERRIDES it. Without this
    // section the owner's "changed in the keybind V" is impossible —
    // the panel listed Weaves and spoils only, and an Aspect is
    // neither.
    const aspects = (this._loadout?.bindables() || []).map(a => ({
      kind: a.kind, id: a.id, name: a.name,
      sub: a.defaultKey ? `${a.sub} · now on ${a.defaultKey}` : a.sub,
      element: a.element,
    }));
    // ⚠️ THE THING ITSELF, not one of its abilities. This is the
    // section the owner was asking for — "once something is crafted it
    // can be bound to a letter". The Aspects section above binds one
    // ability of a Memory you have ALREADY equipped; this binds the
    // Memory, and its letter summons and dismisses it. Without it
    // there was no key anywhere that could equip anything.
    const gear = (this._loadout?.gearBindables() || []).map(g => ({
      kind: g.kind, id: g.id, name: g.name, sub: g.sub,
      element: g.element, dim: !g.summoned,
    }));
    const spoils = (this._spoils?.bindables() || [])
      .map(t => ({ kind: t.kind, id: t.id, name: t.name, sub: t.desc, element: t.element }));

    const echoes = spoils.filter(t => t.kind === BIND_KINDS.ECHO);
    const memories = spoils.filter(t => t.kind === BIND_KINDS.MEMORY);

    body.innerHTML =
      this._section('Forged things — press the letter to summon',
        gear,
        'Nothing forged yet. The Loom is B.') +
      this._section('Facets', aspects, 'Equip a Remnant at the Loom (B) and its active Facets appear here.') +
      this._section('Weaves', weaves, 'Nothing woven yet. The Loom is B.') +
      this._section('Thralls', echoes, 'Devour a Descent and its Warden comes back with you.') +
      this._section('Remnants', memories, 'Seal a Descent and something crystallises out of it.') +
      this._boundList();
  }

  _section(title, items, empty) {
    return `
      <div class="bind-section">
        <h3>${title}</h3>
        ${items.length ? items.map(i => {
          const key = bindSystem.keyFor(i.kind, i.id);
          return `
            <div class="bind-row" data-bind-id="${i.id}" data-bind-kind="${i.kind}"
                 data-bind-name="${i.name.replace(/"/g, '&quot;')}" ${i.dim ? 'data-dim="true"' : ''}>
              <span class="bind-glyph">${elementGlyph(i.element || 'neutral')}</span>
              <span class="bind-name">${i.name}</span>
              <span class="bind-sub">${i.sub || ''}</span>
              <span class="bind-key ${key ? '' : 'unbound'}">${key ? keyLabel(key) : 'unbound'}</span>
            </div>`;
        }).join('') : `<p class="bind-empty">${empty}</p>`}
      </div>`;
  }

  _boundList() {
    const all = bindSystem.all();
    if (!all.length) return '';
    return `
      <div class="bind-section">
        <h3>On your keys</h3>
        <div class="bind-keymap">
          ${all.map(b => `
            <button class="bind-chip" data-unbind="${b.key}" title="Click to clear">
              <span class="bind-chip-key">${keyLabel(b.key)}</span>
              <span class="bind-chip-name">${b.name}</span>
            </button>`).join('')}
        </div>
        <p class="bind-note">
          ${RESERVED_KEYS.size} keys are the game's own and cannot be taken.
        </p>
      </div>`;
  }
}

export const bindUI = new BindUI();
