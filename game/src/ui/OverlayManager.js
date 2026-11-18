// ══════════════════════════════════════════════════════════
// Overlay Manager — Single source of truth for which panels
// are open. Prevents conflicting show/hide on #menus-overlay.
// ══════════════════════════════════════════════════════════

class OverlayManager {
  constructor() {
    this.openPanels = new Set();
  }

  open(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    panel.classList.remove('hidden');
    this.openPanels.add(panelId);
    this._syncOverlay();
  }

  close(panelId) {
    const panel = document.getElementById(panelId);
    if (panel) panel.classList.add('hidden');
    this.openPanels.delete(panelId);
    this._syncOverlay();
  }

  closeAll() {
    for (const id of this.openPanels) {
      const panel = document.getElementById(id);
      if (panel) panel.classList.add('hidden');
    }
    this.openPanels.clear();
    this._syncOverlay();
  }

  isOpen(panelId) {
    return this.openPanels.has(panelId);
  }

  hasAnyOpen() {
    return this.openPanels.size > 0;
  }

  _syncOverlay() {
    const overlay = document.getElementById('menus-overlay');
    if (!overlay) return;
    if (this.openPanels.size > 0) {
      overlay.classList.remove('hidden');
    } else {
      overlay.classList.add('hidden');
    }
  }
}

export const overlayManager = new OverlayManager();
