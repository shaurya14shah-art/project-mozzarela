// ══════════════════════════════════════════════════════════
// NPC Manager — Tracks and Updates all NPCs
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';

class NPCManager {
  constructor() {
    this.npcs = [];
  }

  register(npc) {
    this.npcs.push(npc);
  }

  unregister(npc) {
    const idx = this.npcs.indexOf(npc);
    if (idx !== -1) {
      this.npcs.splice(idx, 1);
    }
  }

  update(dt, playerPos) {
    for (const npc of this.npcs) {
      npc.update(dt, playerPos);
    }
  }

  getNearestNPC(position, maxRange = 3.5) {
    let nearest = null;
    let minDist = maxRange;

    for (const npc of this.npcs) {
      const dist = npc.position.distanceTo(position);
      if (dist < minDist) {
        minDist = dist;
        nearest = npc;
      }
    }
    return nearest;
  }

  clear() {
    for (const npc of this.npcs) {
      npc.destroy();
    }
    this.npcs = [];
  }
}

export const npcManager = new NPCManager();
