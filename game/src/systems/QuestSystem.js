// ══════════════════════════════════════════════════════════
// Quest System — the main Fracture arc, plus quiet side quests
//
// The main chain (mq1-mq7) is still strictly sequential — one active
// quest at a time, tracked in this.quests / currentQuestIndex, same
// as before. Side quests (sq1-sq3) are a second, independent list:
// all three are live from the moment the game starts, each with its
// own progress, each completable in any order or not at all. No new
// HUD real estate for them on purpose — they're discovered through
// world lore and NPC dialogue, and their payoff is a toast + reward +
// (where relevant) a lore fragment, not a second tracked panel
// competing with the main quest for the player's attention.
//
// mq7, the arc's close, doesn't auto-complete on talking to Elder
// Aris like every other talk-quest — it opens a 3-way choice instead
// (see resolveFinale()), because "what do you do with the Core" is
// the one moment in this arc that should actually be the player's.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';
import { inventory } from './InventorySystem.js';
import { audioSystem } from './AudioSystem.js';
import { QUEST_TEXT, actFor } from '../data/chronicle.js';
import { sceneUI } from '../ui/SceneUI.js';
import { TUTORIAL_QUESTS } from '../data/sanctuary.js';

export class QuestSystem {
  constructor() {
    this.quests = [
      {
        id: 'mq1',
        title: 'Awakening',
        desc: 'Escape the Sanctuary Hub to explore the wilderness.',
        target: 1,
        progress: 0,
        type: 'explore',
        reward: { type: 'item', id: 'leather', count: 3 },
      },
      {
        id: 'mq2',
        title: 'First Blood, First Doubt',
        desc: 'Fell three Skeletons in the fields and see what lingers of them after.',
        target: 3,
        progress: 0,
        type: 'kill',
        targetId: 'skeleton',
        reward: { type: 'item', id: 'steel_ingot', count: 2 },
      },
      {
        id: 'mq3',
        title: "The Elder's Wisdom",
        desc: 'Speak with Elder Aris in the Sanctuary Hub to learn what the Fracture truly wants.',
        target: 1,
        progress: 0,
        type: 'talk',
        targetId: 'elder_npc',
        reward: { type: 'item', id: 'iron_ore', count: 5 },
      },
      {
        id: 'mq4',
        title: 'The Buried Shard',
        desc: 'Delve beneath the fields and recover a fragment of the Mithril Core.',
        target: 1,
        progress: 0,
        type: 'gather',
        targetId: 'mithril_core_fragment',
        reward: { type: 'item', id: 'mithril_ore', count: 3 },
      },
      {
        id: 'mq5',
        title: 'The Long-Attuned',
        desc: 'Seek out the robed stranger the wilds call Ostra and hear their reading of the Fracture.',
        target: 1,
        progress: 0,
        type: 'talk',
        targetId: 'ostra_npc',
        reward: { type: 'item', id: 'void_essence', count: 3 },
      },
      {
        id: 'mq6',
        title: 'The Unmoored',
        desc: "Hunt down Vell, a wraith unmoored from itself, before its Saturation spreads through the whole valley.",
        target: 1,
        progress: 0,
        type: 'kill',
        targetId: 'wraith',
        reward: { type: 'item', id: 'rift_shard', count: 2 },
      },
      {
        id: 'mq7',
        title: 'What the Fracture Wants',
        desc: 'Return to Elder Aris and decide what becomes of the Core.',
        target: 1,
        progress: 0,
        type: 'talk',
        targetId: 'elder_npc',
        // No flat reward — resolveFinale() below pays out one of
        // three different rewards depending on the player's choice.
      },
    ];
    this.currentQuestIndex = 0;

    // Side quests — all live at once, discovered rather than assigned.
    // ── TUTORIAL ──
    // A THIRD list, alongside the main arc and the side quests. See
    // data/sanctuary.js for why it is not prepended to mq1: the main
    // arc's first beat is "leave the Sanctuary," and gating that
    // behind a chore would make the player's first tracked objective a
    // checklist. These run in parallel, complete in the hub, and are
    // advanced by the things they teach rather than by talking to a
    // quest-giver.
    this.tutorialQuests = TUTORIAL_QUESTS.map(q => ({ ...q, progress: 0, done: false }));
    // Which NPC ids have already counted toward t1. A Set, not a
    // counter: talking to the same Quartermaster three times must not
    // complete "speak with three of its people."
    this._talkedTo = new Set();
    // Which landmarks the player has actually walked into. The journal
    // map draws only these — plotting an undiscovered landmark would
    // hand over the exploration the landmark exists to reward.
    this._discoveredLandmarks = new Set();

    this.sideQuests = [
      {
        id: 'sq1',
        title: 'Salt the Wound',
        desc: "Drive off the goblins salting a farmer's field, and find out what they were really digging for.",
        target: 4,
        progress: 0,
        type: 'kill',
        targetId: 'goblin',
        reward: { type: 'item', id: 'leather', count: 4 },
        complete: false,
      },
      {
        id: 'sq2',
        title: 'What the Golems Guard',
        desc: "Put down a golem guarding something beneath the Sanctuary's foundations, and see what it dies to protect.",
        target: 1,
        progress: 0,
        type: 'kill',
        targetId: 'golem',
        reward: { type: 'item', id: 'mithril_ore', count: 2 },
        complete: false,
      },
      {
        id: 'sq3',
        title: 'Specimens',
        desc: 'Gather three venom sacs for a stranger who never quite says what they are for.',
        target: 3,
        progress: 0,
        type: 'gather',
        targetId: 'venom_sac',
        reward: { type: 'item', id: 'void_essence', count: 2 },
        complete: false,
      },
    ];

    this.uiTitle = null;
    this.uiDesc = null;
    this.uiProgress = null;
    // What the player chose to do with the Core, once decided —
    // 'aris' | 'self' | 'ostra'. Null until mq7 resolves. NPC.js could
    // read this later to gate post-finale dialogue if that's ever
    // worth building; for now it's just recorded.
    this.epilogueChoice = null;
  }

  init() {
    // ══════════════════════════════════════════════════
    // ⚠️ FLAVOUR IS APPLIED OVER THE MECHANICAL DEFINITION, not
    // written into it. `type`, `target`, `targetId` and `reward`
    // above stay the single source of truth for what a quest DOES;
    // data/chronicle.js supplies only what it SAYS. Editing both
    // would eventually mean the words and the counter disagreed
    // about which skeleton counts.
    // ══════════════════════════════════════════════════
    for (const q of this.quests) {
      const t = QUEST_TEXT[q.id];
      if (!t) continue;
      q.title = t.title || q.title;
      q.flavour = t.flavour;
      q.objective = t.objective || q.desc;
      q.desc = t.objective || q.desc;
    }

    this.uiTitle = document.getElementById('quest-title');
    this.uiDesc = document.getElementById('quest-desc');
    this.uiProgress = document.getElementById('quest-progress');

    eventBus.on(Events.BIOME_ENTER, (biome) => {
      if (this._getActiveQuest()?.type === 'explore') {
        if (biome.name !== 'The Sanctuary') {
          this._progressQuest(1);
        }
      }
    });

    eventBus.on(Events.COMBAT_KILL, (data) => {
      const enemy = data.enemy;
      // Matched on typeId ('skeleton', 'wraith', ...) — stable across
      // the whole species — not on the per-spawn flavour name
      // ("Rattlebones", "Soul Reaver"), which was never meant to be a
      // gameplay key and made the original "kill 3 Slimes" quest
      // literally uncompletable.
      const q = this._getActiveQuest();
      if (q && q.type === 'kill' && enemy.typeId === q.targetId) this._progressQuest(1);
      this._progressSideQuests('kill', enemy.typeId, 1);
    });

    eventBus.on(Events.ITEM_PICKUP, (itemData) => {
      const q = this._getActiveQuest();
      if (q && q.type === 'gather' && itemData.item.id === q.targetId) {
        this._progressQuest(itemData.count || 1);
      }
      this._progressSideQuests('gather', itemData.item.id, itemData.count || 1);
    });

    eventBus.on(Events.NPC_QUEST_TRIGGER, (data) => {
      const q = this._getActiveQuest();
      if (!q || q.type !== 'talk' || data.npcId !== q.targetId) return;

      if (q.id === 'mq7') {
        // The one moment in this arc that's actually the player's —
        // opens a 3-way choice (main.js) instead of auto-completing.
        eventBus.emit(Events.QUEST_FINALE_CHOICE);
        return;
      }
      this._progressQuest(1);
    });

    // ── Tutorial hooks ──
    // Each listens for the verb its quest is teaching. Deliberately
    // separate from the main-arc listeners above rather than folded
    // into them: the main arc matches one specific target id, the
    // tutorial matches "did you do the thing at all," and merging the
    // two would mean every main-quest listener growing a second branch.
    eventBus.on(Events.NPC_INTERACT, (data) => {
      if (!data?.npcId) return;
      if (this._talkedTo.has(data.npcId)) return;
      this._talkedTo.add(data.npcId);
      this._progressTutorial('talk_any', 1);
    });
    eventBus.on(Events.LANDMARK_DISCOVERED, (d) => { if (d?.id) this._discoveredLandmarks.add(d.id); });
    eventBus.on(Events.SPELL_CAST, () => this._progressTutorial('cast', 1));
    eventBus.on(Events.ITEM_CRAFT, () => this._progressTutorial('forge', 1));
    eventBus.on(Events.PLAYER_ATTACK, () => this._progressTutorial('strike_dummy', 1));
    eventBus.on(Events.DESCENT_ENTER, () => this._progressTutorial('find_gate', 1));

    this.updateUI();
  }

  // ── TUTORIAL ──────────────────────────────────────────────

  /** The first unfinished tutorial quest, or null when all are done. */
  activeTutorial() {
    return this.tutorialQuests.find(q => !q.done) || null;
  }

  /**
   * Advance the active tutorial quest if — and only if — it is the one
   * that teaches `type`.
   *
   * ⚠️ Gated on the ACTIVE quest's type, not on any quest of that type.
   * Without that, casting a spell during t1 would silently bank
   * progress toward t3, and t3 would complete the instant it became
   * active with no idea why. Tutorials are ordered because each one
   * assumes you have done the last.
   */
  _progressTutorial(type, amount) {
    const q = this.activeTutorial();
    if (!q || q.type !== type) return;
    q.progress = Math.min(q.target, q.progress + amount);
    if (q.progress >= q.target) {
      q.done = true;
      this._grantReward(q.reward);
      eventBus.emit(Events.UI_NOTIFY, `Learned: ${q.title}`);
      audioSystem.playQuestChime();
      const next = this.activeTutorial();
      if (next) eventBus.emit(Events.UI_NOTIFY, `${next.title} — ${next.hint}`);
    }
    eventBus.emit(Events.QUEST_PROGRESS, { tutorial: q });
    this.updateUI();
  }

  // ── MAIN CHAIN ────────────────────────────────────────────

  _getActiveQuest() {
    if (this.currentQuestIndex >= this.quests.length) return null;
    return this.quests[this.currentQuestIndex];
  }

  _progressQuest(amount) {
    const q = this._getActiveQuest();
    if (!q) return;

    q.progress = Math.min(q.target, q.progress + amount);
    this.updateUI();

    if (q.progress >= q.target) this._completeQuest();
  }

  _completeQuest() {
    const q = this._getActiveQuest();
    if (!q) return;

    this._grantReward(q.reward);
    eventBus.emit(Events.UI_NOTIFY, `Quest Complete: ${q.title}!`);
    audioSystem.playQuestChime();

    this.currentQuestIndex++;
    // Carries the quest that just opened up — main.js listens for
    // specific ids (mq6, "The Unmoored") to trigger story-beat spawns
    // like Vell, rather than main.js polling currentQuestIndex itself.
    const next = this._getActiveQuest();
    eventBus.emit(Events.QUEST_COMPLETE, { completed: q, next });

    // ⚠️ THE ACT CARD OPENS THE NEXT CHAPTER, not the one just
    // finished — the card states an act's thesis, and stating it
    // after the player has already lived it is a summary, not a
    // beginning. Fired here rather than from a QUEST_COMPLETE
    // listener so the ordering against `currentQuestIndex++` is
    // visible at the one place that matters.
    const act = next ? actFor(next.id) : null;
    if (act) sceneUI.chapter(act);

    setTimeout(() => this.updateUI(), 2000);
  }

  /**
   * Called by main.js once the player picks an option in the finale
   * choice modal. `choice` is 'aris' | 'self' | 'ostra'.
   */
  resolveFinale(choice) {
    const q = this._getActiveQuest();
    if (!q || q.id !== 'mq7') return;

    this.epilogueChoice = choice;
    const rewards = {
      aris:  { type: 'item', id: 'starmetal', count: 1 },
      self:  { type: 'item', id: 'primordium', count: 1 },
      ostra: { type: 'item', id: 'rift_shard', count: 3 },
    };
    this._grantReward(rewards[choice]);

    eventBus.emit(Events.UI_NOTIFY, `Quest Complete: ${q.title}!`);
    audioSystem.playQuestChime();
    this.currentQuestIndex++;
    eventBus.emit(Events.QUEST_COMPLETE, { completed: q, next: this._getActiveQuest(), epilogueChoice: choice });
    setTimeout(() => this.updateUI(), 2000);
  }

  // ── SIDE QUESTS ───────────────────────────────────────────

  _progressSideQuests(type, targetId, amount) {
    for (const sq of this.sideQuests) {
      if (sq.complete || sq.type !== type || sq.targetId !== targetId) continue;
      sq.progress = Math.min(sq.target, sq.progress + amount);
      if (sq.progress >= sq.target) {
        sq.complete = true;
        this._grantReward(sq.reward);
        eventBus.emit(Events.UI_NOTIFY, `Quest Complete: ${sq.title}!`);
        audioSystem.playQuestChime();
      }
    }
  }

  isSideQuestComplete(id) {
    return !!this.sideQuests.find(sq => sq.id === id)?.complete;
  }

  // ── SHARED ────────────────────────────────────────────────

  _grantReward(reward) {
    if (reward?.type !== 'item') return;
    import('../data/itemRegistry.js').then(({ getItem }) => {
      const itemDef = getItem(reward.id);
      if (itemDef) inventory.addItem(itemDef, reward.count || 1);
    });
  }

  updateUI() {
    if (!this.uiTitle) return;

    const q = this._getActiveQuest();
    if (q) {
      this.uiTitle.innerText = q.title;
      this.uiDesc.innerText = q.desc;
      this.uiProgress.innerText = `[${q.progress} / ${q.target}]`;
    } else {
      this.uiTitle.innerText = 'The Fracture Remains';
      this.uiDesc.innerText = 'Whatever the Core turns out to mean, the Fracture keeps spilling. There is always more to harvest.';
      this.uiProgress.innerText = '';
    }
  }
}

export const questSystem = new QuestSystem();
