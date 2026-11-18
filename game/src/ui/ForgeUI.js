// ══════════════════════════════════════════════════════════
// Forge UI
//
// Two tabs:
//   FORGE      recipes, searchable, craftable-first, with batch
//              quantities so you aren't clicking Craft eleven times.
//   TRANSMUTE  break anything down into essence dust for brewing.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';
import { audioSystem } from '../systems/AudioSystem.js';
import { crafting } from '../systems/CraftingSystem.js';
import { getItem } from '../data/itemRegistry.js';
import { sigilFor } from './Sigil.js';
import { overlayManager } from './OverlayManager.js';

export class ForgeUI {
  constructor() {
    this.isOpen = false;
    this.tab = 'forge';
    this.selected = null;
    this.qty = 1;
    this.search = '';
    this.craftableOnly = false;
    this._injectHTML();
    this._bindEvents();
  }

  _injectHTML() {
    document.getElementById('forge-panel')?.remove();

    const panel = document.createElement('div');
    panel.id = 'forge-panel';
    panel.className = 'menu-panel forge-panel hidden';
    panel.innerHTML = `
      <div class="menu-header">
        <h2>The Forge</h2>
        <button id="close-forge-btn" class="close-btn">×</button>
      </div>
      <div class="forge-tabs">
        <button class="ftab active" data-ftab="forge">Craft</button>
        <button class="ftab" data-ftab="transmute">Transmute</button>
      </div>
      <div id="forge-content" class="forge-content"></div>
    `;

    document.getElementById('menus-overlay')?.appendChild(panel);
    this.panel = panel;
  }

  _bindEvents() {
    document.addEventListener('keydown', (e) => {
      if (document.activeElement.tagName === 'INPUT') {
        if (e.key === 'Escape') document.activeElement.blur();
        return;
      }
      // ⚠️ The global letter key is GONE — every panel now opens from
      // the Pioneer menu (Tab), which frees the letter for the player
      // to bind. See ui/MenuUI.js. Escape still closes.
      if (e.key === 'Escape' && this.isOpen) this.toggle(false);
    });

    document.addEventListener('click', (e) => {
      if (!this.isOpen && !e.target.closest('#forge-panel')) return;

      if (e.target.id === 'close-forge-btn') { this.toggle(false); return; }

      const tab = e.target.closest('.ftab');
      if (tab) { this.tab = tab.dataset.ftab; this.selected = null; this._render(); return; }

      const row = e.target.closest('.forge-recipe-row');
      if (row) { this.selected = row.dataset.recipeId; this.qty = 1; this._render(); return; }

      const qtyBtn = e.target.closest('[data-qty]');
      if (qtyBtn) {
        const v = qtyBtn.dataset.qty;
        this.qty = v === 'max' ? Math.max(1, crafting.maxCraftable(this.selected)) : parseInt(v, 10);
        this._render();
        return;
      }

      if (e.target.id === 'forge-craft-btn' && this.selected) {
        crafting.forge(this.selected, this.qty);
        this.qty = Math.min(this.qty, Math.max(1, crafting.maxCraftable(this.selected)));
        this._render();
        return;
      }

      const tBtn = e.target.closest('[data-transmute]');
      if (tBtn) {
        const item = getItem(tBtn.dataset.transmute);
        const amount = tBtn.dataset.amount === 'all'
          ? parseInt(tBtn.dataset.have, 10)
          : parseInt(tBtn.dataset.amount, 10);
        if (item) crafting.transmute(item, amount);
        this._render();
        return;
      }

      const filterBtn = e.target.closest('#forge-craftable-toggle');
      if (filterBtn) { this.craftableOnly = !this.craftableOnly; this._render(); }
    });

    // Keyboard equivalent for the recipe rows — same pattern as the
    // Cauldron's shelf/pot rows: Tab to reach one (tabindex, set in
    // the template above), Enter/Space to fire the same click a mouse
    // would.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target.closest?.('.forge-recipe-row');
      if (el) { e.preventDefault(); el.click(); }
    });

    document.addEventListener('input', (e) => {
      if (e.target.id === 'forge-search') {
        this.search = e.target.value;
        this._renderList();
      }
    });

    eventBus.on(Events.UI_TOGGLE_INVENTORY, () => { if (this.isOpen) this._render(); });
  }

  toggle(force) {
    this.isOpen = force !== undefined ? force : !this.isOpen;
    audioSystem.playUIClick(this.isOpen ? 'open' : 'close');
    if (this.isOpen) {
      overlayManager.open('forge-panel');
      if (document.pointerLockElement) document.exitPointerLock();
      this._render();
    } else {
      overlayManager.close('forge-panel');
      this.selected = null;
      if (!overlayManager.hasAnyOpen()) {
        document.getElementById('game-canvas')?.requestPointerLock?.()?.catch?.(() => {});
      }
    }
  }

  _render() {
    const content = document.getElementById('forge-content');
    if (!content) return;

    document.querySelectorAll('.ftab').forEach(t => {
      t.classList.toggle('active', t.dataset.ftab === this.tab);
    });

    if (this.tab === 'transmute') {
      content.innerHTML = this._transmuteHTML();
      return;
    }

    content.innerHTML = `
      <div class="forge-layout-new">
        <div class="forge-left">
          <div class="forge-filters">
            <input type="text" id="forge-search" class="shelf-search"
                   placeholder="Search recipes…" value="${this.search}" />
            <button id="forge-craftable-toggle" class="filter-chip ${this.craftableOnly ? 'on' : ''}">
              Craftable only
            </button>
          </div>
          <div class="forge-recipe-list" id="forge-recipe-list"></div>
        </div>
        <div class="forge-detail-panel" id="forge-detail-panel"></div>
      </div>
    `;

    this._renderList();
    this._renderDetail();
  }

  _renderList() {
    const list = document.getElementById('forge-recipe-list');
    if (!list) return;

    const entries = crafting.getBrowsableRecipes({
      search: this.search,
      craftableOnly: this.craftableOnly,
    });

    if (!entries.length) {
      list.innerHTML = `<div class="shelf-empty">Nothing matches.</div>`;
      return;
    }

    // Group by category, preserving the craftable-first ordering inside each.
    const byCat = new Map();
    for (const entry of entries) {
      const cat = entry.recipe.category || 'misc';
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat).push(entry);
    }

    list.innerHTML = [...byCat.entries()].map(([cat, rows]) => `
      <div class="forge-category">
        <div class="forge-cat-label">${cat}</div>
        ${rows.map(({ recipe, craftable, max }) => `
          <div class="forge-recipe-row ${craftable ? 'craftable' : 'insufficient'} ${this.selected === recipe.id ? 'selected' : ''}"
               data-recipe-id="${recipe.id}" tabindex="0">
            <span class="forge-row-icon">${sigilFor(getItem(recipe.outputId))}</span>
            <span class="forge-row-name">${recipe.name}</span>
            ${craftable ? `<span class="forge-can-badge">×${max}</span>` : ''}
          </div>
        `).join('')}
      </div>
    `).join('');
  }

  _renderDetail() {
    const panel = document.getElementById('forge-detail-panel');
    if (!panel) return;

    if (!this.selected) {
      panel.innerHTML = `<div class="forge-detail-placeholder">Select a recipe</div>`;
      return;
    }

    const recipe = crafting.getRecipe(this.selected);
    if (!recipe) { panel.innerHTML = ''; return; }

    const max = crafting.maxCraftable(this.selected);
    this.qty = Math.min(Math.max(1, this.qty), Math.max(1, max));

    const status = crafting.getIngredientStatus(this.selected, this.qty);
    const canMake = crafting.canCraft(this.selected, this.qty);
    const output = getItem(recipe.outputId);

    panel.innerHTML = `
      <div class="forge-detail-title">${sigilFor(output)}<span>${recipe.name}</span></div>
      <div class="forge-detail-desc">${recipe.description || ''}</div>

      <div class="forge-qty-row">
        <span class="forge-qty-label">Quantity</span>
        ${[1, 5, 10].map(n => `
          <button class="qty-chip ${this.qty === n ? 'on' : ''}" data-qty="${n}" ${max < n ? 'disabled' : ''}>${n}</button>
        `).join('')}
        <button class="qty-chip ${this.qty === max && max > 0 ? 'on' : ''}" data-qty="max" ${max < 1 ? 'disabled' : ''}>Max (${max})</button>
      </div>

      <div class="forge-ingredients-list">
        ${status.map(s => `
          <div class="forge-ing-row ${s.met ? 'met' : 'unmet'}">
            <span class="forge-ing-icon">${sigilFor(getItem(s.id))}</span>
            <span class="forge-ing-name">${s.name}</span>
            <span class="forge-ing-count">${s.have}/${s.required}</span>
            <span class="forge-ing-check">${s.met ? '✓' : '✗'}</span>
          </div>
        `).join('')}
      </div>

      <button id="forge-craft-btn" class="forge-craft-button ${canMake ? '' : 'disabled'}" ${canMake ? '' : 'disabled'}>
        ${canMake ? `Forge ×${this.qty}` : 'Missing materials'}
      </button>
    `;
  }

  _transmuteHTML() {
    const stacks = crafting.getTransmutableStacks();

    if (!stacks.length) {
      return `<div class="transmute-empty">
        <p>Nothing in your bag can be broken down right now.</p>
        <p class="readout-empty-sub">
          Raw materials become dust of their own element. Equipment becomes
          Prism Dust, which steadies a volatile brew instead of colouring it.
        </p>
      </div>`;
    }

    return `
      <div class="transmute-hint">
        Break anything down into essence dust. Dust is pure element with no
        preference about form — it's how you steer a brew toward the element
        you actually want without changing its shape.
      </div>
      <div class="transmute-grid">
        ${stacks.map(({ item, count, yield: y }) => {
          return `
            <div class="transmute-row" style="--row-el: var(--el-${item.element || 'neutral'})">
              <span class="tr-icon">${sigilFor(item)}</span>
              <div class="tr-info">
                <div class="tr-name" style="color:${item.tier?.color || '#fff'}">
                  ${item.name} <span class="tr-count">×${count}</span>
                </div>
                <div class="tr-yield">
                  yields ${y.count}× ${sigilFor(y.dust)} ${y.dust.name}
                </div>
              </div>
              <div class="tr-actions">
                <button class="qty-chip" data-transmute="${item.id}" data-amount="1" data-have="${count}">×1</button>
                <button class="qty-chip" data-transmute="${item.id}" data-amount="all" data-have="${count}">All</button>
              </div>
            </div>`;
        }).join('')}
      </div>
    `;
  }
}

export const forgeUI = new ForgeUI();
