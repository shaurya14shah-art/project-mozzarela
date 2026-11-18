// ══════════════════════════════════════════════════════════
// The Save — a run that survives closing the tab
//
// ── WHY THIS EXISTS ───────────────────────────────────────
// Owner: "the game feels very hollow, it doesn't have any depth."
//
// Measured before this file existed, the COMPLETE list of things this
// game persisted across a reload was:
//
//   mz_fog · mz_bindings · mz.quality · mz_peace
//
// Four settings. Not one thing you *earn*. Your level, your Rank, the
// Memories you forged, the Marks you survived for, the quests you
// finished, the places you discovered — all of it existed only until
// the tab closed.
//
// ⚠️ And the worst of them: LINEAGE. It is chosen ONCE, deliberately
// irreversible, the single most committing decision in the game
// (data/lineages.js: "the interesting thing about it is that it closes
// doors") — and it silently un-happened on every reload. HANDOFF §7
// listed this as the highest-value gap in the project and named
// exactly this reason.
//
// ── THE ONE RULE ──────────────────────────────────────────
// ⚠️ SAVE THE AUTHORITATIVE STATE, NEVER THE `snapshot()`.
// Almost every system here already has a `snapshot()` — and every one
// of them is a DISPLAY snapshot full of derived values (`fraction`,
// `ladderTitle`, `calling`, `requirements`). Restoring from one would
// write computed fields back over their own inputs and produce a
// character whose numbers disagree with themselves. Each entry below
// names the raw fields that system actually owns, and nothing else.
//
// ⚠️ Every restore is TOTAL, never incremental. `Object.assign`-ing a
// save over a live system leaves whatever the new game already put
// there — an inventory that keeps its starting kit *and* gains the
// saved one, a Mark list that unions two runs. Restores clear first.
//
// ⚠️ Every entry is INDEPENDENTLY guarded. A save written before a
// system existed must not stop the rest of the save loading — that is
// how one added field bricks every existing player's character.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';

const LEGACY_KEY = 'mz_save_v1';
/** The roster: [{ id, name, created, lastPlayed }]. */
const PROFILE_INDEX = 'mz_profiles_v1';
/** Which profile the next boot should offer to continue. */
const ACTIVE_PROFILE = 'mz_profile_active';

// ══════════════════════════════════════════════════════════
// PROFILES — one save per character
//
// Owner: "I should have a menu where I can choose the character so the
// saves don't overlap."
//
// ⚠️ There was exactly ONE save key for the whole game, so starting a
// second character silently overwrote the first the moment the 20s
// autosave ticked. Not "on request" — the player did not have to do
// anything, and there was no warning and no way back beyond the single
// `_prev` generation.
//
// A profile is an id, a name and a save under its OWN key. Nothing
// about the save format changed; only which key it lives at.
// ══════════════════════════════════════════════════════════

/** Every character on this machine. Never throws; [] on a bad store. */
export function listProfiles() {
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILE_INDEX) || '[]');
    return Array.isArray(raw) ? raw.filter(p => p && p.id) : [];
  } catch { return []; }
}

function writeProfiles(list) {
  try { localStorage.setItem(PROFILE_INDEX, JSON.stringify(list)); } catch { /* private mode */ }
}

/** The save key for one profile. */
function keyFor(id) { return `mz_save_v1__${id}`; }

/**
 * ⚠️ ADOPT AN EXISTING SINGLE-SAVE RUN, never strand it.
 *
 * Anyone who played before profiles existed has a save at the bare
 * `mz_save_v1`. Shipping profiles without this makes their character
 * simply not appear in the new menu — indistinguishable from having
 * been deleted, and the most upsetting possible way to receive a
 * feature whose entire purpose is not losing characters.
 *
 * Runs once: the legacy blob is COPIED (not moved) under a real
 * profile, so a rollback to an older build still finds it where it was.
 */
export function migrateLegacySave() {
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) return null;
    const existing = listProfiles();
    if (existing.some(p => p.legacy)) return null;      // already adopted
    let name = 'Pioneer';
    // ⚠️ `data.player.name`, not `data.meta.name` — `meta` holds only
    // `savedAtLevel` (see `collect()`), so reading a name from it
    // always fell through to the default and adopted every returning
    // player's character as "Pioneer". Named correctly, the roster row
    // is recognisable as THEIR character, which is the entire point of
    // adopting it rather than stranding it.
    try { name = JSON.parse(legacy)?.data?.player?.name || name; } catch { /* keep default */ }
    const prof = { id: 'p_legacy', name, created: Date.now(), lastPlayed: Date.now(), legacy: true };
    localStorage.setItem(keyFor(prof.id), legacy);
    writeProfiles([prof, ...existing]);
    console.log(`[Save] adopted an existing run as profile "${name}"`);
    return prof;
  } catch { return null; }
}
/**
 * Saved for the load screen, never restored into a system.
 * ⚠️ Anything listed here is exempt from the degraded-load check.
 */
const INFORMATIONAL = new Set(['meta']);
/** Bumped only for a change that makes old saves genuinely unreadable. */
const VERSION = 1;

class SaveSystem {
  constructor() {
    this._systems = null;
    this._autoTimer = 0;
    this._dirty = false;
    this.enabled = true;
    this.lastError = null;
    /** True when the last load did not fully apply — blocks overwriting. */
    this._restoreDegraded = false;
  }

  /**
   * ⚠️ INJECTED, not imported. SaveSystem touches thirteen singletons;
   * importing them here would build the widest import cycle in the
   * project (several of them would want to trigger a save).
   */
  init(systems) {
    this._systems = systems || {};

    // Save on the moments that actually matter, so a crash costs at
    // most the walk since the last real event rather than the session.
    // ⚠️ Deliberately NOT on COMBAT_HIT or anything per-frame —
    // JSON.stringify of a full inventory on every sword swing is a
    // frame-time cost for no benefit. Marked dirty; written on the
    // timer or on a real beat.
    const mark = () => { this._dirty = true; };
    for (const ev of [
      Events.MEMORY_FORGED, Events.MEMORY_ASCENDED, Events.MEMORY_ENCHANTED,
      Events.LOADOUT_CHANGED, Events.PLAYER_LEVEL_UP, Events.ASCENT_RANK_UP,
      Events.LINEAGE_SOUNDED, Events.WEAPON_AWAKENED, Events.MARK_EARNED,
      Events.QUEST_COMPLETE, Events.DESCENT_RESOLVED, Events.LANDMARK_DISCOVERED,
      Events.THREAD_REVEALED, Events.PLAYER_DEATH,
    ]) {
      if (ev) eventBus.on(ev, mark);
    }

    // ⚠️ `pagehide`, not `beforeunload`. beforeunload is unreliable on
    // mobile and is ignored entirely when a tab is discarded, which is
    // exactly the case where losing the run hurts most. `visibilitychange`
    // covers tabbing away; between them the last 20 seconds survive.
    const flush = () => { if (this._dirty) this.save(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
  }

  /** Called every frame; writes at most every 20s, and only if dirty. */
  update(dt) {
    if (!this.enabled) return;
    this._autoTimer += dt;
    if (this._autoTimer < 20) return;
    this._autoTimer = 0;
    if (this._dirty) this.save();
  }

  // ── PROFILES ────────────────────────────────────────────

  /**
   * The active profile's save key.
   *
   * ⚠️ Returns a key even with NO profile selected — a scratch one, so
   * nothing written before the menu has run can land on a real
   * character's slot. Autosave ticks every 20s regardless of what
   * screen is up, and a stray write into a stranger's save is exactly
   * the overlap this whole feature exists to end.
   */
  _key() {
    return keyFor(this.profileId || '__unset');
  }

  get profileId() { return this._profileId || null; }

  /** Every character, newest-played first, with a line for the menu. */
  profiles() {
    const list = listProfiles();
    return list.map((p) => {
      let meta = null;
      try { meta = JSON.parse(localStorage.getItem(keyFor(p.id)) || 'null'); } catch { /* corrupt */ }
      const d = meta?.data || {};
      return {
        ...p,
        hasSave: !!meta,
        level: d.progress?.level ?? 1,
        lineage: d.lineage?.id ?? null,
        rank: d.ascent?.rank ?? 0,
        at: meta?.at ?? p.lastPlayed ?? p.created ?? 0,
        // The name the character actually carries, if the save has one.
        // A profile is renamed at creation only; the save is authority.
        name: d.player?.name || p.name,
      };
    }).sort((a, b) => (b.at || 0) - (a.at || 0));
  }

  /**
   * Point every read and write at one character.
   *
   * ⚠️ Must be called BEFORE `restore()` and before anything can
   * autosave. Nothing else in this class knows which profile it is on.
   */
  useProfile(id) {
    this._profileId = id || null;
    // ⚠️ Reset the dirty flag and the autosave timer. Carrying them
    // across a profile switch would write the PREVIOUS character's
    // pending state into the newly selected slot on the next tick.
    this._dirty = false;
    this._autoTimer = 0;
    this._restoreDegraded = false;
    try { localStorage.setItem(ACTIVE_PROFILE, id || ''); } catch { /* private mode */ }
    const list = listProfiles();
    const at = list.find(p => p.id === id);
    if (at) { at.lastPlayed = Date.now(); writeProfiles(list); }
    return id;
  }

  /** The profile the last session was on, if it still exists. */
  lastProfileId() {
    try {
      const id = localStorage.getItem(ACTIVE_PROFILE);
      return listProfiles().some(p => p.id === id) ? id : null;
    } catch { return null; }
  }

  /**
   * Make a new character slot and switch to it.
   *
   * ⚠️ The id is NOT derived from the name. Two characters may share a
   * name — players reuse them, and a name-keyed id would silently make
   * the second one overwrite the first, which is the precise bug
   * profiles were added to fix.
   */
  createProfile(name) {
    const clean = String(name || '').trim().slice(0, 24) || 'Pioneer';
    const id = `p_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
    const prof = { id, name: clean, created: Date.now(), lastPlayed: Date.now() };
    writeProfiles([...listProfiles(), prof]);
    this.useProfile(id);
    return prof;
  }

  /** Erase one character, its backup generation and its bindings. */
  deleteProfile(id) {
    if (!id) return false;
    try {
      localStorage.removeItem(keyFor(id));
      localStorage.removeItem(`${keyFor(id)}_prev`);
      localStorage.removeItem(`mz_bindings__${id}`);
    } catch { /* nothing to remove */ }
    writeProfiles(listProfiles().filter(p => p.id !== id));
    // ⚠️ Deleting the ACTIVE profile must also unpoint this system, or
    // the next autosave recreates the save under a key whose profile
    // no longer appears in the menu — an invisible character that
    // still eats quota.
    if (this._profileId === id) this.useProfile(null);
    return true;
  }

  hasSave() {
    try { return !!localStorage.getItem(this._key()); } catch { return false; }
  }

  // ── WRITING ─────────────────────────────────────────────

  /**
   * Collect every system's raw state.
   *
   * ⚠️ Each block is individually try/caught. One system throwing
   * (a half-initialised singleton, a Map that is briefly something
   * else) must cost that system's data, not the entire save.
   */
  collect() {
    const S = this._systems || {};
    const out = { v: VERSION, at: null, data: {} };
    const grab = (name, fn) => {
      try {
        const val = fn();
        if (val !== undefined) out.data[name] = val;
      } catch (e) {
        console.warn(`[Save] "${name}" could not be collected — skipped.`, e);
      }
    };

    // ⚠️ SEED ONLY, never the generated trial. `generateNightmare()` is
    // pure, so five fields reproduce the title, warden, kind, goal,
    // Aspect and Flaw exactly. Storing the object would let a save
    // written today disagree with a rebalanced table tomorrow — the
    // player's own First Nightmare silently changing under them.
    grab('nightmare', () => {
      const n = this._systems?.nightmareSystem;
      return n?.seed ? n.serialize() : undefined;
    });

    grab('player', () => {
      const p = S.player; if (!p) return undefined;
      return {
        name: p.name, hp: p.hp, mp: p.mp, stamina: p.stamina,
        // ⚠️ Position is saved but the SPAWN is not restored from it by
        // default — see restore(). A player who saved while falling
        // through the world would otherwise reload into the same fall.
        x: p.position.x, y: p.position.y, z: p.position.z,
        attunedElement: p._attunedElement || null,
        // Contributions, not the folded totals. recomputeStats() is the
        // sole writer of stats.atk/def (trap #9) and must stay so.
        weaponAtk: p.weaponAtk, wandAtk: p._wandAtk,
        raimentDef: p.raimentDef || 0,
        armorTokens: p.armorTokens || {},
      };
    });

    grab('progress', () => {
      const p = S.progressSystem; if (!p) return undefined;
      // Reading through the getters is fine and correct — they proxy
      // the player, which is where these actually live. Only the
      // WRITE side has to know that (see restore()).
      return { level: p.level, xp: p.xp, xpToNext: p.xpToNext };
    });

    grab('attunement', () => {
      const a = S.attunement; if (!a) return undefined;
      return { elements: { ...a.elements }, forms: { ...a.forms }, depth: a.depth, peakDepth: a.peakDepth };
    });

    grab('leaning', () => {
      const l = S.leaning; if (!l) return undefined;
      return { deeds: l._deeds, side: l._side };
    });

    grab('ascent', () => {
      const a = S.ascentSystem; if (!a) return undefined;
      return { pathId: a._pathId, tier: a._tier, trials: a._trials.map(t => ({ ...t })) };
    });

    grab('lineage', () => {
      const l = S.lineageSystem; if (!l) return undefined;
      return { id: l._id };
    });

    grab('awakening', () => {
      const a = S.awakeningSystem; if (!a) return undefined;
      // ⚠️ `_records` is keyed by AwakeningSystem._key(), which returns
      // ONE constant for a Choirbound and a per-weapon key for everyone
      // else. That is the mechanic (HANDOFF §5), so the keys are saved
      // verbatim rather than rebuilt from the weapon list.
      return { records: [...a._records.entries()].map(([k, v]) => [k, { ...v }]) };
    });

    grab('marks', () => {
      const m = S.markSystem; if (!m) return undefined;
      return { earned: [...m.earned.keys()] };
    });

    grab('core', () => {
      const c = S.coreSystem; if (!c) return undefined;
      return { essence: c.essence, cores: c.cores };
    });

    grab('thread', () => {
      const t = S.threadSystem; if (!t) return undefined;
      return { threadId: t.thread?.id || null, fired: !!t.fired };
    });

    grab('inventory', () => {
      const inv = S.inventory; if (!inv) return undefined;
      return {
        gold: inv.gold,
        slots: inv.slots.map(s => (s ? { item: s.item, count: s.count } : null)),
      };
    });

    grab('loadout', () => {
      const l = S.loadout; if (!l) return undefined;
      // ⚠️ The Memories themselves, not their ids. A forged Memory is
      // not in any registry — it exists only as the object the forge
      // returned, so an id would restore to nothing.
      return {
        weapons: l.weapons.map(w => w || null),
        held: l.held.map(h => h),
        active: l.activeSlot,
      };
    });

    grab('quests', () => {
      const q = S.questSystem; if (!q) return undefined;
      return {
        currentQuestIndex: q.currentQuestIndex,
        quests: q.quests.map(x => ({ id: x.id, progress: x.progress, done: x.done, active: x.active })),
        tutorial: q.tutorialQuests.map(x => ({ id: x.id, progress: x.progress, done: x.done })),
        side: (q.sideQuests || []).map(x => ({ id: x.id, progress: x.progress, done: x.done })),
        talkedTo: [...q._talkedTo],
        landmarks: [...q._discoveredLandmarks],
        epilogueChoice: q.epilogueChoice || null,
      };
    });

    grab('lore', () => {
      const l = S.loreSystem; if (!l) return undefined;
      return { found: [...l.found] };
    });

    grab('spoils', () => {
      const s = S.spoilsSystem; if (!s) return undefined;
      return {
        echoes: [...s.echoes.values()],
        memories: [...s.memories.values()],
      };
    });

    // ⚠️ Which sites are spent. Without this a supply cache refills
    // every time its chunk streams out and back, which turns a
    // discovery into a farm you can stand next to.
    grab('sites', () => {
      const st = S.siteSystem; if (!st) return undefined;
      return st.snapshot();
    });

    // STEEL (systems/CombatSystem.js): practice, body traits, stance,
    // wounds, the blade's charge.
    grab('steel', () => S.combatSystem?.save());
    grab('gather', () => S.gatherSystem?.save());

    grab('epithets', () => {
      const e = S.epithetSystem; if (!e) return undefined;
      return e.save();
    });

    grab('boon', () => {
      const b = S.boonSystem; if (!b) return undefined;
      // ⚠️ May legitimately be null. `grab` skips `undefined`, not
      // null, so an expired Boon is saved AS null and correctly
      // clears a stale one on the next load.
      return b.save();
    });

    // ⚠️ NOT the world seed. `ChunkManager` takes a seed but never
    // stores one, and the seed is `Math.random()` per load by design
    // (HANDOFF §6) — terrain is deliberately different every run. What
    // persists is the character, not the ground they stood on.
    grab('meta', () => ({ savedAtLevel: S.progressSystem?.level ?? 1 }));

    return out;
  }

  save() {
    if (!this.enabled) return false;
    // ══════════════════════════════════════════════════════
    // ⚠️ A FAILED RESTORE MUST NOT OVERWRITE THE GOOD SAVE.
    //
    // This cost a real character during development, and it is the
    // nastiest failure this file can have. The sequence:
    //   1. restore() half-works — one field silently goes nowhere.
    //   2. The player is now standing in a degraded character.
    //   3. Twenty seconds later the autosave faithfully writes THAT
    //      over the only copy of the good one.
    // Measured: a level-18 run came back as level 1 because a single
    // assignment hit a getter, and by the time it was diagnosed the
    // level-18 save no longer existed anywhere.
    //
    // So: if the load was incomplete, this run is READ-ONLY until the
    // player deliberately says otherwise. Losing the last twenty
    // minutes is recoverable; losing the character is not.
    // ══════════════════════════════════════════════════════
    if (this._restoreDegraded) {
      console.warn('[Save] refusing to overwrite — the last load was incomplete. '
        + 'Call __mz.saveSystem.forceSave() if this run is the one you want to keep.');
      return false;
    }
    try {
      const payload = this.collect();
      payload.at = Date.now();
      // ⚠️ Keep exactly one generation back. A save that turns out to
      // be wrong is otherwise unrecoverable, and this costs one extra
      // localStorage slot.
      try {
        const prev = localStorage.getItem(this._key());
        if (prev) localStorage.setItem(`${this._key()}_prev`, prev);
      } catch { /* quota — the current save matters more than the backup */ }
      localStorage.setItem(this._key(), JSON.stringify(payload));
      this._dirty = false;
      this.lastError = null;
      return true;
    } catch (e) {
      // ⚠️ Reported once, never thrown. A full quota or private-mode
      // localStorage must not take the game down mid-fight.
      this.lastError = String(e);
      console.warn('[Save] could not write —', e);
      return false;
    }
  }

  // ── READING ─────────────────────────────────────────────

  read() {
    try {
      const raw = localStorage.getItem(this._key());
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.data) return null;
      return parsed;
    } catch (e) {
      console.warn('[Save] unreadable, ignoring —', e);
      return null;
    }
  }

  /**
   * Put a saved run back.
   *
   * ⚠️ Called AFTER every system has been init()ed, never instead of
   * it. Several systems build scene-graph objects and bind event
   * listeners in init(); restoring in place of that would leave a
   * character with no body. This overwrites state that already exists.
   */
  restore() {
    const save = this.read();
    if (!save) return { ok: false, reason: 'no save' };
    const S = this._systems || {};
    const d = save.data || {};
    const done = [];
    const put = (name, fn) => {
      if (d[name] === undefined) return;
      try { fn(d[name]); done.push(name); }
      catch (e) { console.warn(`[Save] "${name}" could not be restored — skipped.`, e); }
    };

    // ⚠️ Restored via `put` like everything else, so a save from before
    // the Nightmare existed simply skips it and that Pioneer stays
    // awake — which is the correct outcome for a character who was
    // created before there was anything to wake from.
    put('nightmare', (v) => {
      const n = S.nightmareSystem;
      if (n && v?.seed) n.restore(v);
    });

    put('progress', (v) => {
      const p = S.progressSystem;
      // ⚠️ `progressSystem.level` / `.xp` / `.xpToNext` are GETTERS onto
      // the player (`get level() { return this.player?.level }`) — the
      // player is where levelling actually lives. Assigning to them
      // silently does nothing: no error, no warning, and a restored
      // character quietly comes back at level 1 with the correct
      // everything-else, which reads as "the save is broken" rather
      // than "one field went to a getter". Measured: 18 → 1.
      const pl = S.player || p.player;
      if (!pl) return;
      pl.level = v.level;
      pl.xp = v.xp;
      pl.xpToNext = v.xpToNext;
      // Re-derive the stat contributions this level implies rather than
      // trusting a saved total — ProgressSystem is the sole writer of
      // levelAtk/levelDef and must recompute them itself (trap #9).
      p._applyLevelStats?.(pl.level, { silent: true });
    });

    put('attunement', (v) => {
      const a = S.attunement;
      a.elements = { ...v.elements }; a.forms = { ...v.forms };
      a.depth = v.depth; a.peakDepth = v.peakDepth;
    });

    put('leaning', (v) => { S.leaning._deeds = v.deeds; S.leaning._side = v.side; });

    put('ascent', (v) => {
      const a = S.ascentSystem;
      a._pathId = v.pathId; a._tier = v.tier;
      a._trials = (v.trials || []).map(t => ({ ...t }));
      a._recomputeGrants?.();
    });

    // ⚠️ Lineage BEFORE awakening — AwakeningSystem pushes its grants
    // into LineageSystem, so the lineage has to exist first. Same
    // ordering startGame() uses, and for the same reason.
    put('lineage', (v) => { if (v.id && v.id !== 'unsounded') S.lineageSystem.sound?.(v.id); });

    put('awakening', (v) => {
      const a = S.awakeningSystem;
      a._records = new Map((v.records || []).map(([k, r]) => [k, { ...r }]));
      // ⚠️ `_apply()` is what pushes the rung's grants into the player
      // and LineageSystem; `_emit()` republishes for the panel. Neither
      // is optional — without _apply() a restored Ascended weapon looks
      // Ascended and grants nothing.
      a._apply?.();
      a._emit?.();
    });

    put('marks', (v) => {
      const m = S.markSystem;
      // ⚠️ There is no `grant(id)` — Marks are earned by a `test()`
      // against a tracker, never handed out. Restoring therefore
      // re-seats the earned MAP directly from the roster, then runs
      // the system's own `_apply()` so the attribute contribution is
      // re-derived rather than trusted from the save.
      m.earned.clear();
      const roster = m.roster?.() || [];
      const byId = new Map(roster.map(x => [x.id, x]));
      for (const id of (v.earned || [])) {
        const mark = byId.get(id);
        if (mark) m.earned.set(id, mark);
      }
      m._apply?.();
      m._emit?.();
    });

    put('core', (v) => { S.coreSystem.essence = v.essence; S.coreSystem.cores = v.cores; });

    put('thread', (v) => {
      const t = S.threadSystem;
      // ⚠️ `force(id)` resets `fired` to false as a side effect, so the
      // saved value has to be written back AFTER it — otherwise a
      // Thread that had already fired would fire a second time on the
      // next rank-up, and it is specified to fire exactly once.
      if (v.threadId) t.force?.(v.threadId);
      t.fired = !!v.fired;
    });

    put('inventory', (v) => {
      const inv = S.inventory;
      // Total replacement — see the header. A merge would keep the
      // starting kit the new game already handed out.
      inv.slots = new Array(inv.capacity).fill(null);
      (v.slots || []).forEach((s, i) => {
        if (s && i < inv.capacity) inv.slots[i] = { item: s.item, count: s.count };
      });
      inv.gold = v.gold || 0;
    });

    put('loadout', (v) => {
      const l = S.loadout;
      l.weapons = new Array(l.weapons.length).fill(null);
      (v.weapons || []).forEach((w, i) => { if (w && i < l.weapons.length) l.weapons[i] = w; });
      l.held = (v.held || []).filter(Boolean);
      l._active = Math.max(0, Math.min(l.weapons.length - 1, v.active | 0));
      l._rebuild();
      eventBus.emit(Events.LOADOUT_CHANGED, l.snapshot());
    });

    put('quests', (v) => {
      const q = S.questSystem;
      q.currentQuestIndex = v.currentQuestIndex ?? 0;
      const apply = (list, saved) => {
        for (const s of (saved || [])) {
          const t = list.find(x => x.id === s.id);
          if (t) { t.progress = s.progress; t.done = s.done; if ('active' in s) t.active = s.active; }
        }
      };
      apply(q.quests, v.quests);
      apply(q.tutorialQuests, v.tutorial);
      apply(q.sideQuests || [], v.side);
      q._talkedTo = new Set(v.talkedTo || []);
      q._discoveredLandmarks = new Set(v.landmarks || []);
      q.epilogueChoice = v.epilogueChoice || null;
      q.updateUI?.();
    });

    put('lore', (v) => { S.loreSystem.found = new Set(v.found || []); });

    put('sites', (v) => { S.siteSystem?.restoreUsed(v?.used || []); });
    put('epithets', (v) => { S.epithetSystem?.restore(v); });
    put('steel', (v) => { S.combatSystem?.restore(v); });
    put('gather', (v) => { S.gatherSystem?.restore(v); });
    put('boon', (v) => { S.boonSystem?.restore(v); });

    put('spoils', (v) => {
      const s = S.spoilsSystem;
      s.echoes = new Map((v.echoes || []).map(e => [e.id, e]));
      s.memories = new Map((v.memories || []).map(m => [m.id, m]));
    });

    put('player', (v) => {
      const p = S.player;
      p.hp = Math.max(1, v.hp ?? p.maxHp);
      p.mp = v.mp ?? p.maxMp;
      p.stamina = v.stamina ?? p.maxStamina;
      p.weaponAtk = v.weaponAtk ?? p.weaponAtk;
      p._wandAtk = v.wandAtk ?? p._wandAtk;
      p.raimentDef = v.raimentDef || 0;
      p.armorTokens = v.armorTokens || p.armorTokens;
      if (v.attunedElement) p._attunedElement = v.attunedElement;
      p.recomputeStats?.();
    });

    // Which entries the save HAD but that did not come back.
    //
    // ⚠️ `INFORMATIONAL` is excluded. Those keys are written for the
    // save-picker UI and deliberately have no restorer, so counting
    // them marked EVERY healthy load as degraded and disabled saving
    // for it — a guard that fires on the happy path is worse than no
    // guard, because the first thing anyone does is switch it off.
    const expected = Object.keys(d).filter(k => !INFORMATIONAL.has(k));
    const missed = expected.filter(k => !done.includes(k));
    this._restoreDegraded = missed.length > 0;
    if (this._restoreDegraded) {
      console.warn(`[Save] incomplete load — ${missed.join(', ')} did not restore. `
        + 'Saving is disabled for this run so the good save is not overwritten.');
      eventBus.emit(Events.UI_NOTIFY,
        'Your save loaded incompletely. Saving is paused so nothing is lost.');
    }

    eventBus.emit(Events.SAVE_RESTORED, { at: save.at, restored: done, missed });
    return { ok: true, restored: done, missed, at: save.at };
  }

  /** Save anyway, after a degraded load. The player's explicit call. */
  forceSave() {
    this._restoreDegraded = false;
    return this.save();
  }

  /** Put back the generation before the current one. */
  restorePrevious() {
    try {
      const prev = localStorage.getItem(`${this._key()}_prev`);
      if (!prev) return { ok: false, reason: 'no previous save' };
      localStorage.setItem(this._key(), prev);
      this._restoreDegraded = false;
      return this.restore();
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  }

  clear() {
    try { localStorage.removeItem(this._key()); return true; } catch { return false; }
  }

  /** For the UI — when this run was last written, and how big it is. */
  info() {
    const s = this.read();
    if (!s) return null;
    return {
      at: s.at, version: s.v,
      level: s.data?.progress?.level ?? 1,
      lineage: s.data?.lineage?.id ?? 'unsounded',
      bytes: (() => { try { return localStorage.getItem(this._key()).length; } catch { return 0; } })(),
    };
  }
}

export const saveSystem = new SaveSystem();
