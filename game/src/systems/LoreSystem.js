// ══════════════════════════════════════════════════════════
// Lore System — tracks which found-journal fragments the Pioneer
// has actually picked up, so both the reveal toast ("3/7 found") and
// the Codex panel (CodexUI.js) read off one shared source of truth
// instead of main.js keeping a private Set neither of them could see.
// ══════════════════════════════════════════════════════════

class LoreSystem {
  constructor() {
    this.found = new Set();
  }

  record(id) {
    this.found.add(id);
  }

  has(id) {
    return this.found.has(id);
  }

  get count() {
    return this.found.size;
  }
}

export const loreSystem = new LoreSystem();
