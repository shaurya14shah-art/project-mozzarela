// ══════════════════════════════════════════════════════════
// Event Bus — Global Pub/Sub System
// ══════════════════════════════════════════════════════════

class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback, context = null) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push({ callback, context });
    return () => this.off(event, callback);
  }

  once(event, callback, context = null) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      callback.apply(context, args);
    };
    return this.on(event, wrapper, context);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const list = this.listeners.get(event);
    const idx = list.findIndex(l => l.callback === callback);
    if (idx !== -1) list.splice(idx, 1);
  }

  emit(event, ...args) {
    if (!this.listeners.has(event)) return;
    const list = this.listeners.get(event);
    for (let i = 0; i < list.length; i++) {
      const { callback, context } = list[i];
      callback.apply(context, args);
    }
  }

  clear(event) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

// Singleton instance
export const eventBus = new EventBus();

// Event name constants
export const Events = {
  // Engine
  ENGINE_READY: 'engine:ready',
  ENGINE_PAUSE: 'engine:pause',
  ENGINE_RESUME: 'engine:resume',

  // Player
  PLAYER_SPAWN: 'player:spawn',
  PLAYER_MOVE: 'player:move',
  PLAYER_ATTACK: 'player:attack',
  PLAYER_DAMAGED: 'player:damaged',
  PLAYER_HEAL: 'player:heal',
  // Equipment changed the Pioneer's visual tint — carries the resolved
  // colour so anything showing the character (right now: the top-right
  // preview panel) can mirror it without needing a direct reference to
  // the player singleton.
  PLAYER_EQUIP_VISUAL: 'player:equipVisual',
  // A forged melee weapon was equipped — carries {weaponType, element,
  // tierLevel, name} so the FPS viewmodel and the character-preview
  // panel (two more separate rig instances) can each forge and hold
  // their own copy without a direct reference to the player singleton.
  PLAYER_EQUIP_WEAPON: 'player:equipWeapon',
  // ── The First Nightmare (systems/NightmareSystem.js) ──
  // ⚠️ Declared here, not emitted as bare strings. `eventBus.emit`
  // takes whatever it is given, so an undeclared event name is a
  // listener that never fires and an emit that never lands — with no
  // error at either end.
  NIGHTMARE_GATE_OPEN: 'nightmare:gateOpen',
  NIGHTMARE_WOKE: 'nightmare:woke',
  PLAYER_STATS_CHANGED: 'player:statsChanged',
  PLAYER_DEATH: 'player:death',
  PLAYER_LEVEL_UP: 'player:levelUp',
  // Fired on every XP change, not just a level boundary — the HUD bar
  // has to creep, or the only visible feedback is the level-up itself
  // and the grind between them reads as nothing happening.
  PLAYER_XP_UPDATE: 'player:xpUpdate',
  // Lineage & weapon awakening (data/lineages.js). LINEAGE_SOUNDED
  // fires exactly once per run — the Rite is one-way.
  LINEAGE_SOUNDED: 'lineage:sounded',
  LINEAGE_UPDATE: 'lineage:update',
  WEAPON_AWAKENED: 'weapon:awakened',
  WEAPON_AWAKEN_UPDATE: 'weapon:awakenUpdate',
  // The Memory Forge (systems/MemoryForge.js) — the Loom's new job.
  MEMORY_FORGED: 'memory:forged',
  MEMORY_ASCENDED: 'memory:ascended',
  MEMORY_ENCHANTED: 'memory:enchanted',
  // Marks — the small passive traits earned by surviving a specific
  // circumstance (systems/MarkSystem.js).
  MARK_EARNED: 'mark:earned',
  MARKS_UPDATE: 'mark:update',
  // The Core — capacity (Class) vs quality (Rank). systems/CoreSystem.js
  CORE_UPDATE: 'core:update',
  CORE_FORMED: 'core:formed',
  // Threads — the dormant trait. Fires at most once, late.
  THREAD_REVEALED: 'thread:revealed',
  // Trial-kind reward bias (data/descents.js TRIAL_KINDS).
  DESCENT_MARK_EARNED: 'descent:markEarned',
  DESCENT_MEMORY_DROP: 'descent:memoryDrop',
  // The loadout — 3 combat slots (weapons AND Echoes) and the derived
  // 1..9 bar.
  LOADOUT_CHANGED: 'loadout:changed',
  ASPECT_USED: 'loadout:aspectUsed',
  // An equipped Echo manifested / went back. ⚠️ Dismissal is NOT a
  // kill — see Enemy.dismiss() for why the two must stay separable.
  ECHO_MANIFESTED: 'echo:manifested',
  ECHO_DISMISSED: 'echo:dismissed',
  PLAYER_SKILL_USE: 'player:skillUse',

  // Combat
  COMBAT_HIT: 'combat:hit',
  COMBAT_MISS: 'combat:miss',
  COMBAT_CRIT: 'combat:crit',
  COMBAT_KILL: 'combat:kill',
  COMBAT_DODGE: 'combat:dodge',
  COMBAT_PARRY: 'combat:parry',
  // Fired whenever the PLAYER lands a hit on an enemy, from any of the
  // three separate hit pipelines (melee, wand, skill-cast fireball) —
  // decoupled from COMBAT_HIT's damage application so on-hit passives
  // (mastery effects) have one place to listen without caring which
  // pipeline actually dealt the damage, and without risking a double
  // application if they're ever wired into more than one of them.
  PLAYER_HIT_LANDED: 'player:hitLanded',

  // World
  CHUNK_LOADED: 'world:chunkLoaded',
  CHUNK_UNLOADED: 'world:chunkUnloaded',
  BIOME_ENTER: 'world:biomeEnter',
  LANDMARK_DISCOVERED: 'world:landmarkDiscovered',
  WEATHER_CHANGE: 'world:weatherChange',

  // Inventory
  ITEM_PICKUP: 'inventory:pickup',
  ITEM_DROP: 'inventory:drop',
  ITEM_USE: 'inventory:use',
  ITEM_CRAFT: 'inventory:craft',
  ITEM_EQUIP: 'inventory:equip',

  // Skills
  SKILL_UNLOCK: 'skill:unlock',
  SKILL_LEVEL_UP: 'skill:levelUp',
  SKILL_FUSE: 'skill:fuse',

  // Spells
  SPELL_LEARN: 'spell:learn',
  SPELL_CAST: 'spell:cast',
  SPELL_CREATE: 'spell:create',
  SPELL_FUSE: 'spell:fuse',
  SPELL_SURGE: 'spell:surge',

  // Attunement — the power system
  ATTUNEMENT_UPDATE: 'attune:update',
  ATTUNEMENT_SHIFT: 'attune:shift',
  ATTUNEMENT_SLOT: 'attune:slot',
  DOCTRINE_CHANGE: 'attune:doctrine',

  // ── Leaning (Ascendant ↔ Cinderbound) — see LeaningSystem.js.
  // LEANING_UPDATE is throttled to ~4Hz and only fires on an actual
  // change; LEANING_CROSSED is rare and re-keys the whole world.
  LEANING_UPDATE: 'leaning:update',
  LEANING_CROSSED: 'leaning:crossed',

  // ── The Ascent (permanent rank) — see systems/AscentSystem.js.
  // Distinct from the ATTUNEMENT_* events above: those fire constantly
  // as residue moves, these fire only on a permanent, earned change.
  ASCENT_UPDATE: 'ascent:update',
  ASCENT_RANK_UP: 'ascent:rankUp',
  ASCENT_BLOCKED: 'ascent:blocked',

  // ── Descents (element dungeons) — see systems/DescentSystem.js.
  DESCENT_ENTER: 'descent:enter',
  DESCENT_PROGRESS: 'descent:progress',
  DESCENT_RESOLVED: 'descent:resolved',
  DESCENT_EXIT: 'descent:exit',

  // ── Remnants / Revenants / Epithets — the survived-a-Descent spoils.
  BINDINGS_CHANGED: 'bind:changed',
  MEMORY_USED: 'memory:used',
  REMNANT_CLAIMED: 'remnant:claimed',
  REVENANT_BOUND: 'revenant:bound',
  EPITHET_EARNED: 'epithet:earned',

  // Destabilisation
  ENEMY_DESTABILISE: 'combat:destabilise',
  ENEMY_DETONATE: 'combat:detonate',

  // The land
  REGION_SATURATE: 'world:saturate',
  REGION_SHIFT: 'world:regionShift',

  // Alchemy
  BREW_COMPLETE: 'alchemy:brewComplete',
  WAND_UPDATE: 'wand:update',
  WAND_CHANNEL: 'wand:channel',
  WAND_INFUSE: 'wand:infuse',
  REACTION_TRIGGER: 'combat:reaction',
  ITEM_TRANSMUTE: 'inventory:transmute',

  // Story
  QUEST_START: 'quest:start',
  QUEST_PROGRESS: 'quest:progress',
  QUEST_COMPLETE: 'quest:complete',
  SCENARIO_TRIGGER: 'scenario:trigger',
  DIALOG_START: 'dialog:start',
  DIALOG_END: 'dialog:end',
  NPC_INTERACT: 'npc:interact',
  NPC_QUEST_TRIGGER: 'npc:questTrigger',
  // The main arc's last talk-quest doesn't just auto-complete — it
  // opens a 3-way choice (see QuestSystem.resolveFinale / main.js's
  // finale-choice modal) instead of progressing on its own.
  QUEST_FINALE_CHOICE: 'quest:finaleChoice',

  // UI
  UI_NOTIFY: 'ui:notify',
  // A saved run was put back (systems/SaveSystem.js). Carries which
  // systems actually restored, so a partial load is visible rather
  // than silently half-applied.
  SAVE_RESTORED: 'save:restored',
  // A world site (shrine, cache, graveyard...) was used up.
  // systems/SiteSystem.js — one-shot and persisted.
  SITE_USED: 'site:used',
  // Shrine blessings (systems/BoonSystem.js) — one at a time, minutes long.
  BOON_GRANTED: 'boon:granted',
  BOON_EXPIRED: 'boon:expired',
  // A story scene took the screen / gave it back (ui/SceneUI.js).
  // ⚠️ The engine keeps running through one — see that file's header.
  SCENE_START: 'scene:start',
  SCENE_END: 'scene:end',
  // The Pioneer menu (Tab) — the single door to every panel.
  UI_MENU_OPENED: 'ui:menuOpened',
  UI_DAMAGE_NUMBER: 'ui:damageNumber',
  // Combat clarity (systems/CombatSystem.js, ui/CombatHUD.js)
  COMBAT_LOG: 'combat:log',            // { text, kind: 'info'|'warn'|'good'|'bad' }
  COMBAT_FEEDBACK: 'combat:feedback',  // { kind: 'hit'|'kill'|'block'|'parry'|'guardbreak'|'hurt', from?, amount? }
  ENEMY_HURT: 'enemy:hurt',            // { enemy, dealt, relation, element, killed, byPlayer }
  UI_TOGGLE_INVENTORY: 'ui:toggleInventory',
  UI_TOGGLE_MENU: 'ui:toggleMenu',
};
