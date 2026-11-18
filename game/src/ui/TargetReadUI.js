// ══════════════════════════════════════════════════════════
// Target Read — the other half of the alchemist fantasy
//
// You spend the whole game reading compositions in a flask. This
// puts the same reading on the thing trying to kill you: what it is
// made of, how close it is to coming apart, and — crucially —
// whether the spell currently in your wand argues with it.
//
// This is the entire tactical layer surfaced in one small panel.
// No health bar, because health is not the point any more.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';
import { composition, relate } from '../systems/CompositionSystem.js';
import { wandSystem } from '../systems/WandSystem.js';
import { elementGlyph } from './Sigil.js';

const VERDICT = {
  matched: { label: 'Feeds it',  cls: 'bad'  },
  neutral: { label: 'Neutral',   cls: 'mid'  },
  opposed: { label: 'Breaks it', cls: 'good' },
};

class TargetReadUI {
  constructor() {
    this.target = null;
    this._injectHTML();
    eventBus.on(Events.ENEMY_DESTABILISE, (d) => { this.target = d.enemy; });
    eventBus.on(Events.ENEMY_DETONATE, () => { this.target = null; this._hide(); });
  }

  _injectHTML() {
    document.getElementById('target-read')?.remove();
    const el = document.createElement('div');
    el.id = 'target-read';
    el.className = 'target-read hidden';
    document.getElementById('hud')?.appendChild(el);
    this.el = el;
  }

  _hide() { this.el?.classList.add('hidden'); }

  /** Called each frame with whatever the player is looking at. */
  setTarget(enemy) {
    this.target = enemy;
  }

  update() {
    if (!this.el) return;
    const t = this.target;
    if (!t || !t.alive) { this._hide(); return; }

    const read = composition.read(t);
    if (!read) { this._hide(); return; }

    const slot = wandSystem.getActiveSlot();
    const loaded = slot?.spell?.element || null;
    const rel = loaded ? relate(t.body, loaded).relation : null;
    const verdict = rel ? VERDICT[rel] : null;

    const strainPct = read.ratio * 100;
    const strainClass = strainPct > 70 ? 'danger' : strainPct > 35 ? 'warn' : 'calm';

    this.el.classList.remove('hidden');
    this.el.innerHTML = `
      <div class="tr-head">
        <span class="tr-name">${t.name || t.typeId}</span>
        ${verdict ? `<span class="tr-verdict ${verdict.cls}">${verdict.label}</span>` : ''}
      </div>
      <div class="tr-made">
        ${read.shares.slice(0, 3).map(({ id, share }) => `
          <span class="tr-el" style="color:var(--el-${id})">
            ${elementGlyph(id)}<span>${Math.round(share * 100)}%</span>
          </span>`).join('')}
      </div>
      <div class="stability-meter ${strainClass} tr-strain">
        <div class="stability-fill" style="width:${strainPct.toFixed(0)}%"></div>
        <span class="stability-label">${strainPct > 92 ? 'Coming apart' : 'Strain'} · ${strainPct.toFixed(0)}%</span>
      </div>
    `;
  }
}

export const targetReadUI = new TargetReadUI();
