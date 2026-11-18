// ══════════════════════════════════════════════════════════
// Cauldron UI — brewing
//
// The old version made you drag from a separate inventory panel and
// told you nothing until you committed. This one puts a filtered
// ingredient shelf right in the panel (click to add, click to remove)
// and shows the full resolved readout live: element balance, form,
// potency, stability, and the exact spell you're about to get.
//
// You can still discover things — you just can't waste materials
// finding out that a combination does nothing.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';
import { audioSystem } from '../systems/AudioSystem.js';
import { potionSystem, isBrewable, essenceOf } from '../systems/PotionSystem.js';
import { OPS } from '../systems/BrewProcess.js';
// The craft is Weaving now — see data/weaving.js. This UI still drives
// the same resolver; only the vocabulary and the fiction changed.
import { HANDLINGS as TECHNIQUES, describeLoom } from '../data/weaving.js';
import { RuneGridUI } from './RuneGridUI.js';
import { CONFLUENCE_TIERS } from '../data/runes.js';
import { inventory } from '../systems/InventorySystem.js';
import { BREWING } from '../data/constants.js';
import { FORM_DATA } from '../data/essences.js';
import { sigilFor, elementGlyph, formFrame, vesselMark } from './Sigil.js';
import { overlayManager } from './OverlayManager.js';

// ⚠️ NO CAP on how many signs a weave will hold.
//
// This was 3, on the reasoning that a fourth turned the sign from a
// choice of geometry into a stacking exercise. That reasoning was
// wrong in the direction that mattered: stacking barely did anything
// (see foldRunes' Confluence note), so the cap was limiting a mechanic
// that was not yet worth limiting. Owner's call — no limit, and make
// the stack escalate instead.
//
// The brakes are now where they belong: instability rises
// superlinearly with the count, so a seven-sign weave is a dangerous
// object rather than a free upgrade. A rune may still be laid ONCE —
// that is a distinctness rule, not a quantity one, and without it the
// optimal play is drawing the same shape over and over.
const MAX_SIGNS = Infinity;

export class CauldronUI {
  constructor() {
    this.isOpen = false;
    this.slots = new Array(BREWING.CAULDRON_SLOTS).fill(null);
    // ⚠️ THE WORKING. `slots` is still what the player sees and takes
    // things back out of, but it is NO LONGER what gets brewed — the
    // pot is now an ordered sequence of operations (see
    // systems/BrewProcess.js), because a bag of ingredients has exactly
    // one outcome and that was the whole reason brewing was
    // monotonous. Adding a reagent appends an ADD step; a technique
    // button appends its own step; emptying the pot clears both.
    this.working = [];
    // ── THE SIGN ─────────────────────────────────────────
    // The drawn signs. Runes are no longer derived from the handling
    // sequence — the weaver draws them (see data/runes.js).
    //
    // ⚠️ An ARRAY, and it always was one everywhere else. The
    // resolver has taken `signedRunes` as a list since it was written,
    // and data/runes.js `foldRunes()` exists for no other purpose than
    // combining several — multiplicative keys multiply, additive keys
    // sum. Only this field capped it: it held ONE rune, so every draw
    // silently REPLACED the last one and the fold never folded
    // anything. Combining was implemented and unreachable.
    this.signedRunes = [];
    this.runeGrid = null;
    this.lastBrew = null;
    this._injectHTML();
    this._bindEvents();
  }

  _injectHTML() {
    document.getElementById('cauldron-panel')?.remove();

    const panel = document.createElement('div');
    panel.id = 'cauldron-panel';
    panel.className = 'menu-panel cauldron-panel hidden';
    panel.innerHTML = `
      <div class="menu-header">
        <h2>The Loom</h2>
        <button id="close-cauldron-btn" class="close-btn">×</button>
      </div>

      <div class="cauldron-body">

        <!-- LEFT: ingredient shelf -->
        <div class="cauldron-shelf">
          <div class="shelf-head">
            <span class="shelf-title">Threads</span>
            <input type="text" id="cauldron-search" class="shelf-search" placeholder="Search the threads…" />
          </div>
          <div class="shelf-list" id="cauldron-shelf-list"></div>
        </div>

        <!-- CENTRE: the pot -->
        <div class="cauldron-centre">
          <div class="cauldron-pot" id="cauldron-pot">
            <div class="pot-glow" id="pot-glow"></div>
            <span class="pot-icon">${vesselMark()}</span>
          </div>

          <div class="cauldron-slots" id="cauldron-slots"></div>

          <div class="cauldron-techniques" id="cauldron-techniques">
            ${TECHNIQUES.map(t => `
              <button class="tech-btn" data-technique="${t.op}" title="${t.blurb}">
                <span class="tech-name">${t.name}</span>
              </button>`).join('')}
          </div>
          <div class="cauldron-state" id="cauldron-state"></div>
          <!-- The signs laid over this weave. Runes come from the
               SHAPE the weaver draws (data/runes.js), so this has to
               update live — the player needs to see a rune take as
               they draw it, or the whole mechanic is invisible.
               Several may be laid at once and they FOLD together
               (foldRunes()); each chip strikes itself out on click. -->
          <div class="loom-runes" id="loom-runes"></div>
          <div id="rune-grid-mount"></div>

          <div class="cauldron-actions">
            <button id="brew-btn" class="brew-button" disabled>Weave</button>
            <button id="cauldron-clear-btn" class="ghost-button">Unpick</button>
          </div>
          <div class="cauldron-tip">Order matters. The first thread defines the weave; the last one delivers it.</div>
        </div>

        <!-- RIGHT: live resolution readout -->
        <div class="cauldron-readout" id="cauldron-readout"></div>

      </div>
    `;

    document.getElementById('menus-overlay')?.appendChild(panel);
    this.panel = panel;

    // The rune grid. Mounted once, alongside the loom — the sign and
    // the substance are woven in the same sitting.
    const mount = panel.querySelector('#rune-grid-mount');
    if (mount) {
      this.runeGrid = new RuneGridUI((rune) => {
        // A mishap (null) leaves the existing signs alone rather than
        // clearing them — losing three good runes to one slip of the
        // pointer would make drawing the fourth feel dangerous.
        if (rune) this._inscribe(rune);
        this._render();
      });
      this.runeGrid.mount(mount);
    }
  }

  _bindEvents() {
    document.addEventListener('click', (e) => {
      if (e.target.id === 'close-cauldron-btn') this.toggle(false);
      if (e.target.id === 'brew-btn') this._brew();
      const tech = e.target.closest?.('[data-technique]');
      if (tech) this._technique(tech.dataset.technique);
      if (e.target.id === 'cauldron-clear-btn') this._clear();

      const shelfRow = e.target.closest('#cauldron-shelf-list .shelf-row');
      if (shelfRow) this._addIngredient(shelfRow.dataset.itemId);

      const potSlot = e.target.closest('#cauldron-slots .pot-slot');
      if (potSlot) this._removeIngredient(parseInt(potSlot.dataset.slot, 10));

      const runeChip = e.target.closest('#loom-runes [data-rune-index]');
      if (runeChip) this._strikeRune(parseInt(runeChip.dataset.runeIndex, 10));
    });

    // Keyboard equivalent for the two rows above, which are plain
    // <div>s (they need to sit in a CSS grid/flex flow no <button>
    // manages cleanly) — Tab reaches them via tabindex, Enter/Space
    // fires the same click the mouse would.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target.closest?.('#cauldron-shelf-list .shelf-row, #cauldron-slots .pot-slot, #loom-runes [data-rune-index]');
      if (el) { e.preventDefault(); el.click(); }
    });

    document.addEventListener('keydown', (e) => {
      if (document.activeElement.tagName === 'INPUT') {
        if (e.key === 'Escape') document.activeElement.blur();
        return;
      }
      // ⚠️ B belongs to the Memory Forge now (ui/MemoryForgeUI.js).
      // The Loom forges Memories; this brewing panel is retired and
      // must NOT answer the same key — two panels on one key is the
      // bug that had BindUI and WandMenuUI opening stacked on V.
      // Left reachable via `__mz.cauldronUI.toggle(true)` for the
      // spell resolver's own tests rather than deleted outright.
      if (e.key === 'Escape' && this.isOpen) this.toggle(false);
    });

    document.addEventListener('input', (e) => {
      if (e.target.id === 'cauldron-search') this._renderShelf();
    });

    eventBus.on(Events.UI_TOGGLE_INVENTORY, () => {
      if (this.isOpen) this._renderShelf();
    });
  }

  toggle(force) {
    this.isOpen = force !== undefined ? force : !this.isOpen;
    audioSystem.playUIClick(this.isOpen ? 'open' : 'close');
    if (this.isOpen) {
      overlayManager.open('cauldron-panel');
      if (document.pointerLockElement) document.exitPointerLock();
      this._render();
    } else {
      this._returnAll();
      overlayManager.close('cauldron-panel');
      if (!overlayManager.hasAnyOpen()) {
        document.getElementById('game-canvas')?.requestPointerLock?.()?.catch?.(() => {});
      }
    }
  }

  // ── SLOT HANDLING ────────────────────────────────────────
  // Ingredients are reserved from the bag while they sit in the pot,
  // so the shelf counts always show what's genuinely still available.

  _addIngredient(itemId) {
    const free = this.slots.indexOf(null);
    if (free === -1) {
      eventBus.emit(Events.UI_NOTIFY, 'The pot is full.');
      return;
    }
    const stack = inventory.getSlotData().find(s => s && s.item.id === itemId);
    if (!stack) return;

    this.slots[free] = stack.item;
    this.working.push({ op: OPS.ADD, item: stack.item });
    inventory.consumeItems(itemId, 1);
    this._render();
  }

  _removeIngredient(index) {
    const item = this.slots[index];
    // Remove the LAST matching ADD step, not the first — taking a
    // reagent back out should undo the most recent time you put that
    // reagent in, or the recorded order stops matching what is
    // actually in the pot.
    if (item) {
      for (let i = this.working.length - 1; i >= 0; i--) {
        if (this.working[i].op === OPS.ADD && this.working[i].item === item) {
          this.working.splice(i, 1);
          break;
        }
      }
    }
    if (!item) return;
    this.slots[index] = null;
    inventory.addItem(item, 1);
    this._render();
  }

  /**
   * Lay one more sign over the weave.
   *
   * ⚠️ One rune may be laid ONCE. Without this, the cheapest way to
   * push a weave's damage is to draw the same shape three times — the
   * fold multiplies, so it compounds — and the sign stops being a
   * choice about WHICH geometry to use and becomes a repetition
   * count. Same reasoning as BindSystem's "one thing per key AND one
   * key per thing" rule.
   */
  _inscribe(rune) {
    if (this.signedRunes.some(r => r.id === rune.id)) {
      this.runeGrid?.say('That sign is already laid. A shape drawn twice says nothing twice.', 'mishap');
      return false;
    }
    if (this.signedRunes.length >= MAX_SIGNS) {
      this.runeGrid?.say('The weave will not hold another.', 'mishap');
      return false;
    }
    this.signedRunes.push(rune);
    audioSystem.playUIClick?.('open');
    // Wipe the stroke so the next sign starts on a clean field —
    // otherwise the player draws their second rune on top of their
    // first and cannot tell which line belongs to which. The message
    // is passed IN: clear()'s default would otherwise overwrite the
    // rune's name the instant _commit() had written it.
    const n = this.signedRunes.length;
    const conf = CONFLUENCE_TIERS.find(t => n >= t.min);
    this.runeGrid?.clear(
      conf
        ? `${rune.name} laid — ${n} signs. ${conf.name}: ${conf.blurb}`
        : `${rune.name} laid. Draw another, or weave.`,
      rune.named ? 'true' : 'known');
    return true;
  }

  _strikeRune(index) {
    if (index < 0 || index >= this.signedRunes.length) return;
    this.signedRunes.splice(index, 1);
    audioSystem.playUIClick?.('close');
    this._render();
  }

  _returnAll() {
    this.working = [];
    this.signedRunes = [];
    // ⚠️ CLEAR the grid, do not drop the reference. This line used to
    // read `this.runeGrid = null`, which threw away the mounted
    // RuneGridUI instance while leaving its DOM and its listeners
    // live — so after the first weave the panel still worked (the
    // onSign closure survived) but nothing could ever reach the
    // widget again to wipe the stroke, and the last sign drawn stayed
    // painted across the field for the rest of the session.
    this.runeGrid?.clear();
    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i]) {
        inventory.addItem(this.slots[i], 1);
        this.slots[i] = null;
      }
    }
  }

  _clear() {
    this._returnAll();
    this._render();
  }

  /**
   * Apply a technique. Appends to the Working rather than mutating any
   * state here — BrewProcess owns all the chemistry, and the UI's only
   * job is recording what the player did and in what order.
   */
  _technique(op) {
    if (!op) return;
    this.working.push({ op });
    audioSystem.playUIClick?.('open');
    this._render();
  }

  _brew() {
    const contents = this.slots.filter(Boolean);
    if (contents.length < BREWING.MIN_INGREDIENTS) return;

    // The pot holds the only copy of these — put them back so the
    // brew's own inventory check and consumption can run normally.
    // Snapshot the Working before _returnAll() clears it — the recipe
    // is the sequence, and the sequence has to survive the pot being
    // emptied back into the satchel.
    const working = this.working.slice();
    const signed = this.signedRunes.slice();
    this._returnAll();
    const outcome = potionSystem.brew(contents, working, signed);
    this.lastBrew = outcome;

    if (outcome) {
      this._flashPot(outcome.result.spell.color);
    }
    this._render();
  }

  _flashPot(color) {
    const pot = document.getElementById('cauldron-pot');
    if (!pot) return;
    pot.classList.remove('pot-flash');
    void pot.offsetWidth;   // restart the animation
    pot.style.setProperty('--flash-color', `#${(color >>> 0).toString(16).padStart(6, '0')}`);
    pot.classList.add('pot-flash');
  }

  // ── RENDER ───────────────────────────────────────────────

  _render() {
    this._renderShelf();
    this._renderSlots();
    this._renderReadout();
  }

  _renderShelf() {
    const list = document.getElementById('cauldron-shelf-list');
    if (!list) return;

    const query = (document.getElementById('cauldron-search')?.value || '').trim().toLowerCase();

    // Merge stacks so each reagent appears once with a total.
    const merged = new Map();
    for (const stack of inventory.getSlotData()) {
      if (!stack || !isBrewable(stack.item)) continue;
      if (query && !stack.item.name.toLowerCase().includes(query)) continue;
      const entry = merged.get(stack.item.id);
      if (entry) entry.count += stack.count;
      else merged.set(stack.item.id, { item: stack.item, count: stack.count });
    }

    const rows = [...merged.values()].sort((a, b) => {
      const t = (b.item.tier?.level || 0) - (a.item.tier?.level || 0);
      return t !== 0 ? t : a.item.name.localeCompare(b.item.name);
    });

    if (!rows.length) {
      list.innerHTML = `<div class="shelf-empty">
        ${query ? 'No thread matches that.' : 'Nothing to draw a thread from. Kill things, or break junk down at the Forge (F).'}
      </div>`;
      return;
    }

    list.innerHTML = rows.map(({ item, count }) => {
      const e = essenceOf(item);
      const forms = Object.entries(e.form || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([f]) => formFrame(f))
        .join('');
      return `
        <div class="shelf-row" data-item-id="${item.id}" tabindex="0"
             style="--row-el: var(--el-${item.element || 'neutral'})"
             title="${e.note || item.description || ''}">
          <span class="shelf-icon">${sigilFor(item)}</span>
          <span class="shelf-name">${item.name}</span>
          <span class="shelf-marks">
            <span class="shelf-forms">${forms}</span>
            ${e.stabilizer ? '<span class="shelf-tag stab" title="Stabiliser">◇</span>' : ''}
            ${e.amplifier ? '<span class="shelf-tag amp" title="Amplifier">✦</span>' : ''}
          </span>
          <span class="shelf-count">${count}</span>
        </div>
      `;
    }).join('');
  }

  _renderSlots() {
    const container = document.getElementById('cauldron-slots');
    if (!container) return;

    container.innerHTML = this.slots.map((item, i) => {
      if (!item) {
        return `<div class="pot-slot empty" data-slot="${i}" tabindex="0"><span class="pot-slot-plus">+</span></div>`;
      }
      return `
        <div class="pot-slot filled" data-slot="${i}" tabindex="0"
             style="--slot-el: var(--el-${item.element || 'neutral'})">
          <span class="pot-slot-icon">${sigilFor(item)}</span>
          <span class="pot-slot-name">${item.name}</span>
        </div>
      `;
    }).join('');

    // The vessel's own condition, in words. A temperature bar reading
    // "0.63" tells the player nothing about what to do next; "simmering,
    // well blended" tells them everything.
    const stateEl = document.getElementById('cauldron-state');
    if (stateEl) {
      const a = this.working.length ? potionSystem.analyzeWorking(this.working) : null;
      const steps = this.working.filter(w => w.op !== OPS.ADD).length;
      stateEl.textContent = a?.process
        ? `The loom is ${describeLoom(a.process.state || a.process)}${a.process.reaction ? ' — and fighting itself' : ''}`
        : (this.working.length ? `${this.working.length} on the loom, slack` : 'The loom is empty and hanging loose');
      stateEl.dataset.scorched = a?.process?.scorched ? 'true' : 'false';
    }

    // Live rune readout — every sign currently laid over the weave,
    // in the order they were drawn. Click one to strike it out.
    const runeEl = document.getElementById('loom-runes');
    if (runeEl) {
      const runes = this.signedRunes;
      const conf = CONFLUENCE_TIERS.find(t => runes.length >= t.min);
      const banner = conf
        ? `<div class="loom-confluence" title="${conf.blurb}">
             <span class="lc-name">${conf.name}</span>
             <span class="lc-count">${runes.length} signs</span>
           </div>`
        : '';
      runeEl.innerHTML = runes.length
        ? banner + runes.map((r, i) => `<span class="loom-rune" data-rune-index="${i}"
                tabindex="0" role="button"
                title="${r.blurb} — strike it out">
             <svg viewBox="0 0 100 100" class="loom-rune-glyph" fill="none"
                  stroke="currentColor" stroke-width="6" stroke-linecap="round"
                  stroke-linejoin="round" aria-hidden="true"><path d="${r.glyph || ''}"/></svg>
             <span>${r.name}</span></span>`).join('')
        : '<span class="loom-rune-empty">No sign laid. Draw one below — lay as many as you dare.</span>';
    }

    // Tint the pot with the current blend
    const glow = document.getElementById('pot-glow');
    if (glow) {
      const filled = this.slots.filter(Boolean);
      if (filled.length) {
        glow.style.color = `var(--el-${filled[0].element || 'neutral'})`;
        glow.style.opacity = '1';
      } else {
        glow.style.opacity = '0';
      }
    }
  }

  _renderReadout() {
    const out = document.getElementById('cauldron-readout');
    const brewBtn = document.getElementById('brew-btn');
    if (!out) return;

    // The Working, not the bag — so the preview reflects the heat, the
    // stirring and the order the player has actually used.
    const signed = this.signedRunes;
    const analysis = this.working.length
      ? potionSystem.analyzeWorking(this.working, signed)
      : potionSystem.analyze(this.slots);

    if (!analysis) {
      brewBtn?.setAttribute('disabled', 'true');
      out.innerHTML = `
        <div class="readout-empty">
          <div class="readout-empty-icon">${elementGlyph('arcane')}</div>
          <p><strong>Tie in ${BREWING.MIN_INGREDIENTS}–${BREWING.CAULDRON_SLOTS} threads.</strong></p>
          <p class="readout-empty-sub">
            The loom resolves whatever you tie into it — there are no
            recipes to look up. What comes out is decided by which
            <em>element</em> and which <em>form</em> the weave leans
            toward, by the <em>order</em> you tie them, and by the
            <em>sign</em> you draw over it.
          </p>
          <div class="readout-forms">
            ${Object.values(FORM_DATA).map(f => `
              <div class="readout-form-row">
                <span class="rf-icon">${formFrame(f.id)}</span>
                <span class="rf-name">${f.name}</span>
                <span class="rf-blurb">${f.blurb}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      return;
    }

    brewBtn?.removeAttribute('disabled');

    const { spell, elementWeights, elementTotal, formWeights, formTotal } = analysis;
    const spellColor = `var(--el-${spell.element || 'neutral'})`;

    const elementBars = Object.entries(elementWeights)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([el, w]) => {
        const pct = (w / elementTotal) * 100;
        return `
          <div class="bar-row">
            <span class="bar-label">${elementGlyph(el)}${el}</span>
            <div class="bar-track">
              <div class="bar-fill" style="width:${pct.toFixed(0)}%;background:var(--el-${el})"></div>
            </div>
            <span class="bar-pct">${pct.toFixed(0)}%</span>
          </div>`;
      }).join('');

    const formBars = Object.entries(formWeights)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([fm, w]) => {
        const pct = (w / formTotal) * 100;
        const fd = FORM_DATA[fm];
        return `
          <div class="bar-row">
            <span class="bar-label">${formFrame(fm)}${fd?.name || fm}</span>
            <div class="bar-track">
              <div class="bar-fill form" style="width:${pct.toFixed(0)}%"></div>
            </div>
            <span class="bar-pct">${pct.toFixed(0)}%</span>
          </div>`;
      }).join('');

    const instabilityPct = analysis.instability * 100;
    const stabClass = instabilityPct > 55 ? 'danger' : instabilityPct > 25 ? 'warn' : 'calm';
    const stabLabel = instabilityPct > 55 ? 'VOLATILE'
                    : instabilityPct > 25 ? 'Unsettled'
                    : 'Stable';

    out.innerHTML = `
      <div class="readout-result" style="--spell:${spellColor}">
        <div class="rr-head">
          <span class="rr-icon">${sigilFor(spell)}</span>
          <div>
            <div class="rr-name">${spell.name}</div>
            <div class="rr-tier" style="color:${spell.tier.color}">
              ${spell.tier.name} · ${spell.formName}
              ${analysis.isNew ? '<span class="rr-new">NEW</span>' : ''}
            </div>
          </div>
        </div>
        <p class="rr-desc">${spell.description}</p>

        ${analysis.fusion ? `
          <div class="rr-fusion">Fusion — ${analysis.fusion.name}</div>
        ` : ''}

        ${analysis.nearFusion ? `
          <div class="rr-near">
            Close to <strong>${analysis.nearFusion.fusion.name}</strong> —
            add more ${analysis.nearFusion.fusion.pair.find(p => p !== analysis.element) || ''}
            to balance the mix.
          </div>
        ` : ''}

        <div class="rr-stats">
          <div class="rr-stat">
            <span>${spell.isWard ? 'Power' : 'Damage'}</span>
            <strong>${spell.isWard ? spell.power : spell.damage}</strong>
          </div>
          <div class="rr-stat"><span>Charges</span><strong>${spell.charges}</strong></div>
          <div class="rr-stat"><span>Mana</span><strong>${spell.manaCost}</strong></div>
          <!-- Rounded: radius is a product of several rune multipliers
               now (Confluence multiplies it per sign), so it arrives as
               2.0999999999999996 and was printed raw.
               NOTE: no backticks in this comment - it lives inside a
               template literal, and a backtick here terminates the
               string and fails the BUILD, not just this line. -->
          <div class="rr-stat"><span>Radius</span><strong>${spell.radius ? (Math.round(spell.radius * 10) / 10) : '—'}</strong></div>
        </div>
      </div>

      <div class="readout-section">
        <div class="readout-head">Element balance</div>
        ${elementBars}
      </div>

      <div class="readout-section">
        <div class="readout-head">Form</div>
        ${formBars}
      </div>

      <div class="readout-section">
        <div class="readout-head">Stability</div>
        <div class="stability-meter ${stabClass}">
          <div class="stability-fill" style="width:${instabilityPct.toFixed(0)}%"></div>
          <span class="stability-label">${stabLabel} · ${instabilityPct.toFixed(0)}%</span>
        </div>
        ${analysis.opposedPairs.length ? `
          <div class="stability-note">
            Opposed: ${analysis.opposedPairs.map(p => `${p[0]}↔${p[1]}`).join(', ')}.
            Volatile brews hit harder but may surge when cast.
            ${analysis.stabilizerTotal > 0 ? `<br>Stabilisers in the mix are damping this by ${(analysis.stabilizerTotal * 18).toFixed(0)}%.` : 'Add a stabiliser (◇) to calm it.'}
          </div>
        ` : `<div class="stability-note">Nothing in this mix is fighting anything else.</div>`}
      </div>
    `;
  }
}

export const cauldronUI = new CauldronUI();
