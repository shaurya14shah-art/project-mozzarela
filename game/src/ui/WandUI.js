// ══════════════════════════════════════════════════════════
// The armament — bottom-left, what is in your hand and what it can do
//
// Owner: the old bar "feels very AI-ish", carried too many abilities,
// and had the controls legend printed over it. It was a centred row of
// glowing glyph circles in three labelled groups (Path / Remnants /
// Wand), up to fifteen slots, every one with a number on it.
//
// Rebuilt from how fighting games that are ABOUT the weapon do it:
//   · Sekiro / Elden Ring — a small equipment cluster in a bottom
//     corner, the weapon drawn as a silhouette, nothing centred
//   · Kingdom Come / RŌNIN — text, not icon soup; the HUD says the
//     name of the thing, quietly, and gets out of the way
// So: the weapon in hand (silhouette + name + which of the three
// combat slots it is), then at most three ARTS on Z/X/C as plain
// named lines, then the ONE wand weave that is active. Cooldown is a
// hairline under the name, not a radial neon sweep. No key legend.
//
// ⚠️ The Remnants' 1–9 skills are no longer drawn. Their keys still
// fire (LoadoutSystem is untouched); whether they survive at all is a
// combat-design decision (see HANDOFF, "COMBAT REVAMP").
//
// Public API unchanged: renderAbilities(), render(), renderRemnants(),
// renderHand(combat), updateCooldownVisuals() — main.js calls them.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';
import { wandSystem } from '../systems/WandSystem.js';
import { player } from '../entities/Player.js';
import { WAND } from '../data/constants.js';
import { SKILLS } from '../data/skills.js';
import { bindSystem, BIND_KINDS, keyLabel } from '../systems/BindSystem.js';
import { combatSystem } from '../systems/CombatSystem.js';
import { STANCE_NAME } from '../data/steel.js';

const ABILITY_KEYS = ['Z', 'X', 'C'];

// Item-art silhouettes, drawn upright on a 64-box and laid on the
// diagonal the way Souls item art is. Ink fill, one highlight edge.
const UPRIGHT = {
  sword: '<path d="M30 40V7l2-4 2 4v33z"/><path d="M24 40h16v3H24z"/><path d="M30.8 43h2.4v12h-2.4z"/><circle cx="32" cy="57.5" r="2.3"/>',
  dagger: '<path d="M30.5 41V19l1.5-4 1.5 4v22z"/><path d="M26 41h12v2.6H26z"/><path d="M31 43.6h2v8h-2z"/><circle cx="32" cy="53.6" r="2"/>',
  greatsword: '<path d="M29 38V5l3-4 3 4v33z"/><path d="M21 38h22v4H21z"/><path d="M30.8 42h2.4v15h-2.4z"/><circle cx="32" cy="59.5" r="2.5"/>',
  axe: '<path d="M31 6h2.2v55H31z"/><path d="M33 10c6-1 10-3 13-5 2 7 2 14 0 21-3-2-7-4-13-5z"/>',
  spear: '<path d="M31.2 15h1.6v46h-1.6z"/><path d="M32 2l3.4 8.5L32 16.5l-3.4-6z"/><path d="M29.5 16.5h5v1.6h-5z"/>',
  bow: '<path d="M27 4c14 9 14 47 0 56" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M27 4v56" stroke="currentColor" stroke-width=".7"/><path d="M33.5 29h3v6h-3z"/>',
  staff: '<path d="M31 13h2v48h-2z"/><circle cx="32" cy="8" r="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="32" cy="8" r="1.6"/>',
  warhammer: '<path d="M31 14h2.2v47H31z"/><path d="M22 6h20v10H22z"/><path d="M32 2l2 4h-4z"/>',
  scythe: '<path d="M31 6h2.2v55H31z"/><path d="M33 8C21 5 11 10 6 24c6-7 15-10 27-10z"/>',
  pickaxe: '<path d="M31 14h2.2v47H31z"/><path d="M14 16c6-6 12-8 18-8s12 2 18 8l-2 2c-5-4-10-6-16-6s-11 2-16 6z"/>',
  wand: '<path d="M31 16h2l-.4 42h-1.2z"/><path d="M32 3l3 7-3 6-3-6z"/><path d="M29.6 16h4.8v1.8h-4.8z"/>',
};
UPRIGHT.dualblades = `<g transform="rotate(-14 32 32) translate(-6 0)">${UPRIGHT.dagger}</g><g transform="rotate(14 32 32) translate(6 0)">${UPRIGHT.dagger}</g>`;
const GRIMOIRE = '<path d="M18 14h26v36H18z"/><path d="M21 14v36" stroke="#000" stroke-opacity=".35" stroke-width="1.4"/><path d="M27 24h12M27 29h9" stroke="#000" stroke-opacity=".3" stroke-width="1.2"/>';

function silhouette(type) {
  const body = type === 'grimoire' ? GRIMOIRE : `<g transform="rotate(45 32 32)">${UPRIGHT[type] || UPRIGHT.sword}</g>`;
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="currentColor">${body}</g></svg>`;
}

class WandUI {
  constructor() {
    this._lastTier = null;
    this._handKey = '';
    this._combat = [];
    this._injectHTML();
    this._bindEvents();
  }

  _injectHTML() {
    const hud = document.getElementById('hud');
    if (!hud) return;
    document.getElementById('skill-bar')?.remove();

    const bar = document.createElement('div');
    bar.id = 'wand-bar';
    bar.className = 'armament';
    bar.innerHTML = `
      <div id="wand-channel" class="wand-channel">
        <div class="channel-track"><div class="channel-fill" id="channel-fill"></div></div>
        <div class="channel-tier" id="channel-tier"></div>
      </div>
      <div class="arm-hand">
        <div class="arm-sil" id="arm-sil"></div>
        <div class="arm-hand-text">
          <div class="arm-name" id="arm-name"></div>
          <div class="arm-charge" id="arm-charge"><i></i></div>
          <div class="arm-meta"><span class="arm-stance" id="arm-stance"><b data-p="high"></b><b data-p="mid"></b><b data-p="low"></b><em></em></span><span class="arm-oil" id="arm-oil"></span><span class="arm-slots" id="arm-slots"></span></div>
        </div>
      </div>
      <div class="arm-arts" id="ability-slots"></div>
      <div class="arm-spell" id="wand-spell-slots"></div>
      <!-- Kept as hidden hosts: main.js still paints into them. -->
      <div id="remnant-slots" hidden></div>
      <div id="summon-bar" hidden></div>
      <div id="loadout-bar" hidden></div>
    `;
    const hudBottom = document.getElementById('hud-bottom');
    if (hudBottom) { hudBottom.innerHTML = ''; hudBottom.appendChild(bar); }
    this._bar = bar;

    const tip = document.createElement('div');
    tip.id = 'hotbar-tooltip';
    tip.className = 'hotbar-tooltip hidden';
    hud.appendChild(tip);
    this._tooltip = tip;
  }

  _bindEvents() {
    eventBus.on(Events.WAND_UPDATE, () => this.render());
    eventBus.on(Events.BINDINGS_CHANGED, () => this.render());
    eventBus.on(Events.WAND_CHANNEL, (data) => this._renderChannel(data));
    eventBus.on(Events.REACTION_TRIGGER, (data) => this._flashReaction(data));
    this._bar?.addEventListener('mouseover', (e) => {
      const row = e.target.closest('[data-tt-name]');
      if (row) this._showTooltip(row);
    });
    this._bar?.addEventListener('mouseout', (e) => {
      const row = e.target.closest('[data-tt-name]');
      if (row && !(e.relatedTarget && row.contains(e.relatedTarget))) this._hideTooltip();
    });
  }

  _showTooltip(el) {
    if (!this._tooltip) return;
    this._tooltip.innerHTML = `
      <div class="hotbar-tooltip-name">${el.dataset.ttName}</div>
      ${el.dataset.ttMeta ? `<div class="hotbar-tooltip-meta">${el.dataset.ttMeta}</div>` : ''}
      ${el.dataset.ttDesc ? `<div class="hotbar-tooltip-desc">${el.dataset.ttDesc}</div>` : ''}`;
    const r = el.getBoundingClientRect();
    this._tooltip.style.left = `${r.right + 12}px`;
    this._tooltip.style.top = `${r.top + r.height / 2}px`;
    this._tooltip.classList.add('arm-tip');
    this._tooltip.classList.remove('hidden');
  }
  _hideTooltip() { this._tooltip?.classList.add('hidden'); }

  _renderChannel({ active, progress, tier }) {
    const wrap = document.getElementById('wand-channel');
    const fill = document.getElementById('channel-fill');
    const label = document.getElementById('channel-tier');
    if (!wrap || !fill || !label) return;
    wrap.classList.toggle('active', !!active);
    fill.style.width = `${(progress || 0) * 100}%`;
    if (active && tier) {
      label.textContent = tier.name;
      label.className = `channel-tier tier-${tier.id}`;
      if (this._lastTier !== tier.id) {
        this._lastTier = tier.id;
        wrap.classList.remove('tier-pop'); void wrap.offsetWidth; wrap.classList.add('tier-pop');
      }
    } else {
      label.textContent = '';
      this._lastTier = null;
    }
    if (!wrap.dataset.marked) {
      const track = wrap.querySelector('.channel-track');
      for (const t of WAND.CHANNEL_TIERS) {
        if (t.minHold <= 0) continue;
        const mark = document.createElement('div');
        mark.className = 'channel-mark';
        mark.style.left = `${(t.minHold / WAND.MAX_CHANNEL) * 100}%`;
        track.appendChild(mark);
      }
      wrap.dataset.marked = '1';
    }
  }

  _flashReaction({ reaction }) {
    const el = document.createElement('div');
    el.className = 'reaction-flash';
    el.textContent = reaction.name;
    el.style.color = `#${(reaction.color >>> 0).toString(16).padStart(6, '0')}`;
    document.getElementById('overlays')?.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  // ── The hand ──────────────────────────────────────────

  /** `combat` = loadout.summonSnapshot().combat (main.js _paintSummonBar). */
  renderHand(combat) {
    if (combat) this._combat = combat;
    const w = player.equippedWeapon;
    const type = w?.weaponType || 'wand';
    const name = w?.name || 'Fracture Wand';
    const slots = this._combat.map(c => `${c.slot}:${c.empty ? '' : c.key}:${c.inHand ? 1 : 0}`).join('|');
    const key = `${type}|${name}|${slots}`;
    if (key === this._handKey) return;
    this._handKey = key;
    const sil = document.getElementById('arm-sil');
    const nm = document.getElementById('arm-name');
    const sl = document.getElementById('arm-slots');
    if (sil) sil.innerHTML = silhouette(type);
    if (nm) nm.textContent = name;
    if (sl) {
      // The three combat slots as engraved letters; the one in hand is lit.
      // The belt: one mark per carried weapon, the drawn one lit; G draws the next.
      const carried = this._combat.filter(c => !c.empty);
      sl.innerHTML = carried.length > 1
        ? carried.map(c => `<span class="arm-slot${c.inHand ? ' on' : ''}" title="${c.name}">◆</span>`).join('') + '<span class="arm-slot">G</span>'
        : '';
    }
  }

  // ── Arts (Z / X / C) ──────────────────────────────────

  renderAbilities() {
    const container = document.getElementById('ability-slots');
    if (!container) return;
    const slots = combatSystem.techniqueSlots();
    this._techSig = combatSystem.family + slots.map(t => t.learned ? 1 : 0).join('');
    container.innerHTML = slots.map((t, i) => `
        <div class="arm-row arm-art${t.learned ? '' : ' locked'}" data-tech="${t.id}"
             data-tt-name="${t.def.name}" data-tt-meta="${t.learned ? `${t.def.stamina} stamina · ${t.def.cd}s` : `Learned with practice: ${t.have}/${t.need} clean blows`}"
             data-tt-desc="${t.def.text.replace(/"/g, '&quot;')}">
          <span class="arm-key">${ABILITY_KEYS[i]}</span>
          <span class="arm-label">${t.learned ? t.def.name : `${t.def.name}<small> ${t.have}/${t.need}</small>`}</span>
          <span class="arm-cd"><i></i></span>
        </div>`).join('');
  }

  // ── The wand: only the weave that is active ───────────

  /** ⚠️ STEEL: no spell bar (owner). Magic lives in the blade's charge. */
  render() {
    const container = document.getElementById('wand-spell-slots');
    if (container) container.innerHTML = '';
  }

  /** Remnant skills are no longer drawn (see header). */
  renderRemnants() {}

  /** Per frame, from main.js's HUD loop: cooldown hairlines, affordability, the hand. */
  updateCooldownVisuals() {
    const c = combatSystem;
    this.renderHand();
    const slots = c.techniqueSlots();
    const sig = c.family + slots.map(t => t.learned ? 1 : 0).join('') + slots.map(t => t.have).join(',');
    if (sig !== this._techSigFull) { this._techSigFull = sig; this.renderAbilities(); }
    const rows = document.querySelectorAll('.arm-art');
    rows.forEach((el, i) => {
      const t = slots[i]; if (!t) return;
      this._paintRow(el, t.learned ? Math.min(1, t.cd / t.def.cd) : 0, player.stamina, t.learned ? t.def.stamina * 0.5 : 0);
    });
    // Stance, charge, oil.
    if (this._stance !== c.stance) {
      this._stance = c.stance;
      document.querySelectorAll('#arm-stance b').forEach(b => b.classList.toggle('on', b.dataset.p === c.stance));
      const em = document.querySelector('#arm-stance em'); if (em) em.textContent = STANCE_NAME[c.stance];
    }
    const ch = document.querySelector('#arm-charge i');
    if (ch) {
      ch.style.transform = `scaleX(${c.bladeCharge.toFixed(3)})`;
      const full = c.bladeCharge >= 1;
      const box = ch.parentElement;
      if (box.classList.contains('full') !== full) box.classList.toggle('full', full);
      const el = c.element;
      if (box.dataset.el !== el) { box.dataset.el = el; box.style.setProperty('--el', `var(--el-${el}, #e9e1cf)`); }
    }
    const oil = document.getElementById('arm-oil');
    const oilText = c.oil ? (c.oil.element[0].toUpperCase() + c.oil.element.slice(1) + ' oil') : c.ward > 0 ? `Ward ×${c.ward}` : '';
    if (oil && oil.textContent !== oilText) oil.textContent = oilText;
  }

  _paintRow(el, frac, focus, cost = +el.dataset.cost || 0) {
    el.classList.toggle('poor', cost > 0 && focus < cost);
    el.classList.toggle('cooling', frac > 0);
    const bar = el.querySelector('.arm-cd i');
    if (bar) bar.style.transform = `scaleX(${1 - frac})`;
  }
}

export const wandUI = new WandUI();
