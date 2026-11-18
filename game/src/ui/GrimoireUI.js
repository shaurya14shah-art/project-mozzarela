// ══════════════════════════════════════════════════════════
// Grimoire UI — the discovery record
//
// Two tabs:
//   MATRIX   every element × form cell. Undiscovered cells show the
//            element and form but not the spell — enough to tell you
//            what to aim a brew at, not enough to spoil the name.
//   FUSIONS  the named two-element results. These are the real
//            collectibles.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';
import { audioSystem } from '../systems/AudioSystem.js';
import { potionSystem } from '../systems/PotionSystem.js';
import { FORM_DATA, FORM_LIST, FUSIONS, REACTIONS } from '../data/essences.js';
import { CASTABLE_ELEMENTS, matrixSize } from '../data/spellcraft.js';
import { sigilFor, elementGlyph, formFrame } from './Sigil.js';
import { overlayManager } from './OverlayManager.js';
import { CATALYSTS, CATALYST_LIST, CATALYST_HOT_AT } from '../data/catalysts.js';
import { TECHNIQUES, OPS } from '../systems/BrewProcess.js';

class GrimoireUI {
  constructor() {
    this.isOpen = false;
    this.tab = 'matrix';
    this._injectHTML();
    this._bindEvents();
  }

  _injectHTML() {
    document.getElementById('grimoire-panel')?.remove();

    const panel = document.createElement('div');
    panel.id = 'grimoire-panel';
    panel.className = 'menu-panel grimoire-panel hidden';
    panel.innerHTML = `
      <div class="menu-header">
        <h2>The Grimoire</h2>
        <button id="close-grimoire-btn" class="close-btn">×</button>
      </div>
      <div class="grimoire-tabs">
        <button class="gtab active" data-gtab="matrix">Spell Matrix</button>
        <button class="gtab" data-gtab="fusions">Fusions</button>
        <button class="gtab" data-gtab="recipes">Recipes</button>
        <button class="gtab" data-gtab="catalysts">Catalysts</button>
        <button class="gtab" data-gtab="reactions">Reactions</button>
      </div>
      <div class="grimoire-stats" id="grimoire-stats"></div>
      <div class="grimoire-content" id="grimoire-content"></div>
    `;

    document.getElementById('menus-overlay')?.appendChild(panel);
    this.panel = panel;
  }

  _bindEvents() {
    document.addEventListener('keydown', (e) => {
      if (document.activeElement.tagName === 'INPUT') return;
      // ⚠️ The global letter key is GONE — every panel now opens from
      // the Pioneer menu (Tab), which frees the letter for the player
      // to bind. See ui/MenuUI.js. Escape still closes.
      if (e.key === 'Escape' && this.isOpen) this.toggle(false);
    });

    document.addEventListener('click', (e) => {
      if (e.target.id === 'close-grimoire-btn') this.toggle(false);
      const tab = e.target.closest('.gtab');
      if (tab && this.isOpen) {
        this.tab = tab.dataset.gtab;
        this.render();
      }
    });

    eventBus.on(Events.SPELL_LEARN, () => { if (this.isOpen) this.render(); });
    eventBus.on(Events.SPELL_CREATE, () => { if (this.isOpen) this.render(); });
  }

  toggle(force) {
    this.isOpen = force !== undefined ? force : !this.isOpen;
    audioSystem.playUIClick(this.isOpen ? 'open' : 'close');
    if (this.isOpen) {
      overlayManager.open('grimoire-panel');
      if (document.pointerLockElement) document.exitPointerLock();
      this.render();
    } else {
      overlayManager.close('grimoire-panel');
      if (!overlayManager.hasAnyOpen()) {
        document.getElementById('game-canvas')?.requestPointerLock?.()?.catch?.(() => {});
      }
    }
  }

  render() {
    document.querySelectorAll('.gtab').forEach(t => {
      t.classList.toggle('active', t.dataset.gtab === this.tab);
    });

    this._renderStats();

    const content = document.getElementById('grimoire-content');
    if (!content) return;

    if (this.tab === 'matrix')          content.innerHTML = this._matrixHTML();
    else if (this.tab === 'fusions')    content.innerHTML = this._fusionsHTML();
    else if (this.tab === 'recipes')    content.innerHTML = this._recipesHTML();
    else if (this.tab === 'catalysts')  content.innerHTML = this._catalystsHTML();
    else                                content.innerHTML = this._reactionsHTML();
  }

  _renderStats() {
    const el = document.getElementById('grimoire-stats');
    if (!el) return;

    const rows = potionSystem.getMatrixProgress();
    const foundCells = rows.reduce((n, r) => n + r.cells.filter(c => c.discovered).length, 0);
    const totalCells = matrixSize();

    const fusionProgress = potionSystem.getFusionProgress(FUSIONS);
    const foundFusions = fusionProgress.filter(f => f.discovered).length;

    const pct = (foundCells / totalCells) * 100;

    el.innerHTML = `
      <div class="gstat-row">
        <span class="grimoire-stat">${foundCells} / ${totalCells} base spells</span>
        <span class="grimoire-stat">${foundFusions} / ${FUSIONS.length} fusions</span>
        <span class="grimoire-stat">${potionSystem.recipes.size} recipes</span>
        <span class="grimoire-stat">${potionSystem.brewCount} brews</span>
      </div>
      <div class="grimoire-progress-bar">
        <div class="grimoire-progress-fill" style="width:${pct}%"></div>
      </div>
    `;
  }

  _matrixHTML() {
    const rows = potionSystem.getMatrixProgress();

    const header = `
      <div class="matrix-row header">
        <div class="matrix-corner"></div>
        ${FORM_LIST.map(f => `
          <div class="matrix-col-head" title="${FORM_DATA[f].blurb}">
            <span class="mch-icon">${formFrame(f)}</span>
            <span class="mch-name">${FORM_DATA[f].name}</span>
          </div>
        `).join('')}
      </div>`;

    const body = rows.map(row => {
      return `
        <div class="matrix-row">
          <div class="matrix-row-head" style="color:var(--el-${row.element})">
            ${elementGlyph(row.element)}
            <span class="mrh-name">${row.element}</span>
          </div>
          ${row.cells.map(cell => {
            if (!cell.discovered) {
              return `<div class="matrix-cell locked" title="Brew ${row.element} with a ${FORM_DATA[cell.form].name} lean to find this">
                        <span class="mc-lock">${formFrame(cell.form)}</span>
                      </div>`;
            }
            return `
              <div class="matrix-cell found" style="--cell-el: var(--el-${row.element})"
                   title="${cell.spell.description}">
                <span class="mc-icon">${sigilFor(cell.spell)}</span>
                <span class="mc-name">${cell.spell.name}</span>
              </div>`;
          }).join('')}
        </div>`;
    }).join('');

    return `
      <div class="matrix-hint">
        Rows are what the brew is made of. Columns are how it comes out.
        Push a mix toward an element and a form to fill a cell.
      </div>
      <div class="matrix-grid">${header}${body}</div>
    `;
  }

  _fusionsHTML() {
    const progress = potionSystem.getFusionProgress(FUSIONS);

    return `
      <div class="matrix-hint">
        When a brew's top two elements come out roughly balanced, they fuse.
        A fusion keeps whatever form you brewed it into — the same pair can be
        found five different ways.
      </div>
      <div class="fusion-grid">
        ${progress.map(({ fusion, discovered, foundForms }) => {
          const [a, b] = fusion.pair;
          if (!discovered) {
            return `
              <div class="fusion-card locked">
                <div class="fusion-pair">
                  <span style="color:var(--el-${a})">${a}</span>
                  <span class="fusion-plus">+</span>
                  <span style="color:var(--el-${b})">${b}</span>
                </div>
                <div class="fusion-unknown">Undiscovered</div>
              </div>`;
          }
          return `
            <div class="fusion-card found" style="--fc: var(--el-${a})">
              <div class="fusion-head">
                <span class="fusion-icon">${elementGlyph(a)}</span>
                <span class="fusion-icon" style="color:var(--el-${b})">${elementGlyph(b)}</span>
                <span class="fusion-name">${fusion.name}</span>
              </div>
              <div class="fusion-pair">
                <span style="color:var(--el-${a})">${a}</span>
                <span class="fusion-plus">+</span>
                <span style="color:var(--el-${b})">${b}</span>
              </div>
              <p class="fusion-desc">${fusion.description}</p>
              <div class="fusion-forms">
                ${FORM_LIST.map(f => `
                  <span class="ff-chip ${foundForms.includes(f) ? 'on' : ''}"
                        title="${FORM_DATA[f].name}">${formFrame(f)}</span>
                `).join('')}
              </div>
            </div>`;
        }).join('')}
      </div>
    `;
  }

  /**
   * The recipe book — the Working that first produced each discovered
   * spell, printed as instructions.
   *
   * ⚠️ This is the tab that makes the grimoire actually FUNCTION. The
   * matrix says which cells you have filled; it cannot say how. Now
   * that brewing is order- and technique-dependent AND catalysed, a
   * player who makes something excellent by accident had no way to
   * reproduce it — which turned the deepest part of the system into a
   * slot machine. A grimoire whose whole job is remembering how, that
   * did not remember how, was the gap.
   */
  _recipesHTML() {
    const recipes = potionSystem.getRecipes();
    if (!recipes.length) {
      return `<p class="grimoire-empty">Nothing written down yet.
        Brew something and the working that made it is recorded here,
        step by step, so you can make it again.</p>`;
    }

    const TECH_NAME = Object.fromEntries(TECHNIQUES.map(t => [t.op, t.name]));
    return `<div class="recipe-list">` + recipes.map(r => {
      // Number only the ADD steps. A player following instructions
      // counts ingredients, not actions — "3. Heat" reads as if heat
      // were a reagent.
      let n = 0;
      const steps = r.steps.map(st => {
        if (st.op === OPS.ADD) {
          n++;
          return `<li class="rstep rstep-add${st.isFragment ? ' rstep-frag' : ''}">
            <span class="rstep-n">${n}</span>${st.itemName || 'something'}
            ${st.isFragment ? '<em>(catalyst)</em>' : ''}</li>`;
        }
        return `<li class="rstep rstep-tech"><span class="rstep-n">·</span>${TECH_NAME[st.op] || st.op}</li>`;
      }).join('');

      return `
        <div class="recipe">
          <div class="recipe-head">
            <span class="recipe-name">${r.name}</span>
            <span class="recipe-meta">${r.element} · ${r.form}${r.catalyst ? ` · ${r.catalyst}` : ''}</span>
          </div>
          <ol class="recipe-steps">${steps}</ol>
          ${r.process ? `<div class="recipe-note">Finished ${r.process.description}.</div>` : ''}
        </div>`;
    }).join('') + `</div>`;
  }

  /**
   * The catalyst reference. Fragments are the one crafting input that
   * only comes out of a Descent, and each has two completely different
   * effects depending on the pot's temperature — which is unguessable
   * and therefore has to be documented in-game rather than discovered
   * by brute force across 22 possibilities.
   *
   * Shown in full rather than gated on discovery: this is a reference
   * table, and hiding a reference table behind the thing it explains
   * teaches nothing.
   */
  _catalystsHTML() {
    const used = new Set(potionSystem.getRecipes().map(r => r.catalyst).filter(Boolean));
    const rows = Object.entries(CATALYSTS).map(([element, pair]) => `
      <div class="cat-row">
        <div class="cat-el">
          <span class="cat-glyph">${elementGlyph(element)}</span>
          <span>Fragment of ${element}</span>
        </div>
        ${['cold', 'hot'].map(k => {
          const c = pair[k];
          return `<div class="cat-cell cat-${k}${used.has(c.suffix) ? ' cat-known' : ''}">
            <span class="cat-when">${k === 'cold' ? 'cold pot' : 'hot pot'}</span>
            <span class="cat-name">${c.suffix}</span>
            <span class="cat-blurb">${c.blurb}</span>
          </div>`;
        }).join('')}
      </div>`).join('');

    return `
      <p class="grimoire-lead">A fragment is not an ingredient — it does not
      decide element or form. It changes what the finished spell IS, and which
      change you get depends on how hot the pot was when it went in.
      Heat past <strong>${Math.round(CATALYST_HOT_AT * 100)}%</strong> and the
      violent aspect takes over. Only the last fragment counts.</p>
      <div class="cat-table">${rows}</div>`;
  }

  _reactionsHTML() {
    return `
      <div class="matrix-hint">
        Hitting a target that's still carrying another element's residue sets off a
        reaction. Residue lasts a few seconds — switch slots mid-fight
        (<kbd>1</kbd>–<kbd>6</kbd>) to chain them.
      </div>
      <div class="reaction-grid">
        ${REACTIONS.map(r => {
          const [a, b] = r.pair;
          return `
            <div class="reaction-card" style="--rc: var(--el-${a})">
              <div class="reaction-name">${r.name}</div>
              <div class="reaction-pair">
                <span style="color:var(--el-${a})">${a}</span>
                <span class="fusion-plus">→</span>
                <span style="color:var(--el-${b})">${b}</span>
              </div>
              <div class="reaction-mult">×${r.multiplier} damage</div>
              <p class="reaction-blurb">${r.blurb}</p>
            </div>`;
        }).join('')}
      </div>
    `;
  }
}

export const grimoireUI = new GrimoireUI();
