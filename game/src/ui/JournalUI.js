// ══════════════════════════════════════════════════════════
// The Journal — quest sidebar and local map (J)
//
// ── WHAT THIS REPLACES ────────────────────────────────────
// Before this, the entire quest interface was `#quest-tracker`: a
// title, a description, a progress line, and a text compass reading
// "▸ 214m NE". That is a HUD widget, not a quest system — it can show
// exactly one quest, it cannot show a completed one, it cannot show
// the three side quests (which by design were never surfaced anywhere
// at all), and "214m NE" is not a map.
//
// The tracker stays. It is the right thing for at-a-glance play. This
// is the thing you open when you want to know what you are doing and
// where anything is.
//
// ── THE MAP IS DRAWN, NOT RENDERED ────────────────────────
// It is a 2D canvas painted from world coordinates, NOT a second
// three.js view. A render-to-texture minimap would need its own
// camera, its own pass, and its own slice of the frame budget — in a
// project where HANDOFF §4 records the render pipeline already being
// the dominant cost and pixel ratio being the single most expensive
// setting in the game. A canvas costs nothing when the panel is shut,
// which is almost always.
//
// It is deliberately LOCAL and honest about it: the hub is hand-placed
// so it can be drawn exactly, and everything else (landmarks, Descent
// Gates you have found, the active quest's target) is plotted by real
// world position. The infinite procedural wilderness is not drawn,
// because there is nothing there to draw that would be true.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';
import { HUB_MAP_FEATURES, SANCTUARY_NPCS } from '../data/sanctuary.js';
import { LANDMARKS, landmarkWorldPos } from '../data/landmarks.js';
import { WORLD } from '../data/constants.js';
import { overlayManager } from './OverlayManager.js';
import { audioSystem } from '../systems/AudioSystem.js';

const PANEL_ID = 'journal-panel';

class JournalUI {
  constructor() {
    this.el = null;
    this.canvas = null;
    this._questSystem = null;
    this._player = null;
    this._descentSystem = null;
    // How many world units the map's half-width covers. Two settings
    // rather than a slider: "the town" and "the region." A continuous
    // zoom on a map with this little real content is a control with
    // nothing to do.
    this._span = 60;
  }

  /**
   * Injected, not imported — questSystem/player/descentSystem all live
   * in main.js, and importing them here would be circular. Same
   * contract DescentSystem.init() uses, for the same reason.
   */
  init({ questSystem, player, descentSystem }) {
    this._questSystem = questSystem;
    this._player = player;
    this._descentSystem = descentSystem;
    this._build();

    // Repaint only while open. The listeners are cheap but the canvas
    // draw is not free, and this panel is shut for almost the entire
    // session.
    const repaint = () => { if (this.isOpen) this.refresh(); };
    eventBus.on(Events.QUEST_PROGRESS, repaint);
    eventBus.on(Events.QUEST_COMPLETE, repaint);
    eventBus.on(Events.LANDMARK_DISCOVERED, repaint);

    // J opens it. Same pattern every other panel in this project uses
    // (CodexUI, ForgeUI, InventoryUI) — a document-level keydown that
    // bails out while an input is focused, rather than a poll through
    // InputManager, because these are UI keys and must work whether or
    // not the pointer is locked.
    document.addEventListener('keydown', (e) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      // ⚠️ The global letter key is GONE — every panel now opens from
      // the Pioneer menu (Tab), which frees the letter for the player
      // to bind. See ui/MenuUI.js. Escape still closes.
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
  }

  get isOpen() { return this.el && !this.el.classList.contains('hidden'); }

  _build() {
    if (document.getElementById(PANEL_ID)) return;
    const el = document.createElement('div');
    el.id = PANEL_ID;
    el.className = 'menu-panel journal-panel hidden';
    el.innerHTML = `
      <div class="menu-header">
        <h2>The Journal</h2>
        <button id="journal-close" class="close-btn">×</button>
      </div>
      <div class="journal-body">
        <div class="journal-quests" id="journal-quests"></div>
        <div class="journal-map-side">
          <canvas id="journal-map" width="360" height="360"></canvas>
          <div class="journal-map-controls">
            <button class="ghost-button" data-span="60">The Sanctuary</button>
            <button class="ghost-button" data-span="420">The Region</button>
          </div>
          <div class="journal-map-legend" id="journal-legend"></div>
        </div>
      </div>
    `;
    (document.getElementById('menus-overlay') || document.body).appendChild(el);
    this.el = el;
    this.canvas = el.querySelector('#journal-map');
    el.querySelector('#journal-close').onclick = () => this.close();
    el.querySelectorAll('[data-span]').forEach(b => {
      b.onclick = () => { this._span = +b.dataset.span; this.refresh(); };
    });
  }

  open() {
    this.refresh();
    // Through OverlayManager, not by toggling the class directly — it
    // owns the shared #menus-overlay scrim and the pointer-lock
    // bookkeeping, and a panel that shows itself behind its back leaves
    // the scrim up after the last panel closes.
    overlayManager.open(PANEL_ID);
    audioSystem.playUIClick?.('open');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  close() {
    overlayManager.close(PANEL_ID);
    audioSystem.playUIClick?.('close');
  }

  toggle() { this.isOpen ? this.close() : this.open(); }

  // ── QUEST LIST ──────────────────────────────────────────

  refresh() {
    this._renderQuests();
    this._drawMap();
  }

  _renderQuests() {
    const box = this.el?.querySelector('#journal-quests');
    const qs = this._questSystem;
    if (!box || !qs) return;

    const sec = (title, rows) => rows.length
      ? `<div class="journal-section"><h3>${title}</h3>${rows.join('')}</div>` : '';

    const row = (q, state) => `
      <div class="journal-quest" data-state="${state}">
        <div class="jq-title">${q.title}</div>
        <div class="jq-desc">${q.desc}</div>
        ${q.hint && state === 'active' ? `<div class="jq-hint">${q.hint}</div>` : ''}
        ${q.target > 1 || state === 'active'
          ? `<div class="jq-prog">${Math.min(q.progress ?? 0, q.target)} / ${q.target}</div>` : ''}
      </div>`;

    const tut = qs.tutorialQuests || [];
    const active = qs.activeTutorial?.();
    const tutRows = tut.map(q => row(q, q.done ? 'done' : (q === active ? 'active' : 'locked')));

    // The main arc, all of it — including the ones already behind you.
    // A quest log that hides completed quests is a to-do list; the
    // point of a journal is that it is a record.
    const mainRows = (qs.quests || []).map((q, i) => row(
      q,
      i < qs.currentQuestIndex ? 'done' : i === qs.currentQuestIndex ? 'active' : 'locked',
    ));

    // ⚠️ Side quests are shown here and ONLY here. QuestSystem's own
    // header explains they were deliberately given no HUD panel — they
    // are meant to be discovered, not tracked. A journal you chose to
    // open is not the same intrusion as a permanent HUD element, so
    // this does not violate that intent; adding them to #quest-tracker
    // would.
    const sideRows = (qs.sideQuests || []).map(q => row(q, q.completed ? 'done' : 'active'));

    box.innerHTML =
      sec('Learning the Ground', tutRows) +
      sec('The Fracture', mainRows) +
      sec('Other Work', sideRows) ||
      '<p class="journal-empty">Nothing written yet.</p>';
  }

  // ── MAP ─────────────────────────────────────────────────

  _drawMap() {
    const c = this.canvas;
    if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    const cx = W / 2, cy = H / 2;
    const span = this._span;
    // Centred on the PLAYER, not on spawn — a map centred on a fixed
    // point stops being useful the moment you walk off it, and this
    // world is infinite.
    const px = this._player?.position.x || 0;
    const pz = this._player?.position.z || 0;
    const toX = (wx) => cx + ((wx - px) / span) * cx;
    const toY = (wz) => cy + ((wz - pz) / span) * cy;
    const css = getComputedStyle(document.documentElement);
    const tone = (name, fallback) => (css.getPropertyValue(name).trim() || fallback);

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = tone('--well', '#050403');
    ctx.fillRect(0, 0, W, H);

    // Grid, one line per chunk — the only honest scale reference an
    // infinite procedural world can offer.
    ctx.strokeStyle = tone('--rule', '#3a2c19');
    ctx.lineWidth = 1;
    const step = (WORLD.CHUNK_SIZE / span) * cx;
    if (step > 8) {
      const ox = ((-px % WORLD.CHUNK_SIZE) / span) * cx;
      const oz = ((-pz % WORLD.CHUNK_SIZE) / span) * cy;
      for (let i = -Math.ceil(W / step); i <= Math.ceil(W / step); i++) {
        ctx.beginPath(); ctx.moveTo(cx + ox + i * step, 0); ctx.lineTo(cx + ox + i * step, H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, cy + oz + i * step); ctx.lineTo(W, cy + oz + i * step); ctx.stroke();
      }
    }

    // The Sanctuary's safe radius. The single most useful thing on the
    // map: it is the boundary between "nothing here fights back" and
    // everything else.
    const hubR = (WORLD.CHUNK_SIZE * 2.5 / span) * cx;
    ctx.strokeStyle = tone('--chrome', '#6b5228');
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(toX(0), toY(0), hubR, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);

    // Hand-placed hub features, drawn exactly because they ARE exact.
    for (const f of HUB_MAP_FEATURES) {
      ctx.fillStyle = tone('--rule-strong', '#5c4526');
      const r = Math.max(2, (f.r / span) * cx);
      ctx.beginPath(); ctx.arc(toX(f.x), toY(f.z), r, 0, Math.PI * 2); ctx.fill();
      if (span <= 120) this._label(ctx, f.label, toX(f.x), toY(f.z) - r - 3, tone('--ink-dim', '#8b7b5e'));
    }

    // The cast.
    for (const n of SANCTUARY_NPCS) {
      this._dot(ctx, toX(n.position.x), toY(n.position.z), 3, tone('--chrome-bright', '#c9a24e'));
      if (span <= 80) this._label(ctx, n.mapLabel, toX(n.position.x), toY(n.position.z) - 6, tone('--ink-dim', '#8b7b5e'));
    }

    // Landmarks — only ones actually discovered. Drawing an
    // undiscovered landmark would hand the player the exploration
    // the landmark exists to reward.
    for (const l of Object.values(LANDMARKS)) {
      if (!this._questSystem?._discoveredLandmarks?.has?.(l.id)) continue;
      const w = landmarkWorldPos(l, WORLD.CHUNK_SIZE);
      this._dot(ctx, toX(w.x), toY(w.z), 4, tone('--accent-bright', '#d93b2b'));
      this._label(ctx, l.name, toX(w.x), toY(w.z) - 7, tone('--ink-dim', '#8b7b5e'));
    }

    // Descent Gates the player has actually walked past. Same rule:
    // the registry only contains Gates whose chunk has been loaded,
    // which is exactly "ones you could have seen."
    const gates = this._descentSystem?._gates;
    if (gates) {
      for (const g of gates.values()) {
        const col = g.state === 'sealed' ? '#4a4a4a' : `#${(g.color || 0xd94a1a).toString(16).padStart(6, '0')}`;
        this._dot(ctx, toX(g.position.x), toY(g.position.z), 4, col, 'diamond');
      }
    }

    // The player, and which way they are facing.
    ctx.fillStyle = tone('--ink-strong', '#f3e7c8');
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();

    // Frame last, so nothing draws over it.
    ctx.strokeStyle = tone('--chrome', '#6b5228');
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

    const legend = this.el?.querySelector('#journal-legend');
    if (legend) {
      legend.innerHTML = `
        <span><i style="background:${tone('--chrome-bright', '#c9a24e')}"></i>People</span>
        <span><i style="background:${tone('--accent-bright', '#d93b2b')}"></i>Landmarks</span>
        <span><i style="background:#d94a1a"></i>Descent Gates</span>
        <span class="legend-scale">${span * 2}m across</span>`;
    }
  }

  _dot(ctx, x, y, r, color, shape) {
    ctx.fillStyle = color;
    ctx.beginPath();
    if (shape === 'diamond') {
      ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
    } else {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  _label(ctx, text, x, y, color) {
    if (!text) return;
    ctx.fillStyle = color;
    ctx.font = '9px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y);
  }
}

export const journalUI = new JournalUI();
