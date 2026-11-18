// ══════════════════════════════════════════════════════════
// Bindings — you choose the key, and what goes on it
//
// ── WHAT THIS REPLACES ────────────────────────────────────
// ⚠️ SPELL SLOTS ARE GONE. The wand had six fixed slots addressed by
// Digit1–Digit6: you "infused" a Weave into slot 3 and slot 3 was
// forever key 3. Three things were wrong with that and the owner named
// the first:
//
//   1. The player never chose the key. The mapping was the game's.
//   2. SIX. An arbitrary cap on how much you could carry, enforced by
//      how many digits sit in a row on a keyboard.
//   3. Only Weaves could go on them. Echoes and Memories — the other
//      two things you bring back from a Descent — had no way to be
//      used at all.
//
// A binding is now `key → thing`, where the key is any key the player
// presses and the thing is a Weave, an Echo or a Memory. There is no
// slot, no cap, and no distinction at the input layer between the
// three kinds — they are all just things you bound to a key.
//
// ── WHY ONE REGISTRY FOR THREE KINDS ──────────────────────
// Because the player does not experience them as three systems. They
// experience "the thing on F". Keeping three parallel bind tables
// would mean three UIs, three conflict checks and three save formats
// to answer one question. `kind` is a field, not an architecture.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';

const STORAGE_KEY = 'mz_bindings';

/** The three things that can go on a key. */
export const BIND_KINDS = {
  WEAVE:  'weave',    // a woven spell — cast it
  ECHO:   'echo',     // a bound Revenant — call it
  MEMORY: 'memory',   // a Remnant — its power, on demand
  // ⚠️ An ACTIVE ASPECT of an equipped Memory (LoadoutSystem). These
  // get a default number key 1..9 automatically; binding one here
  // OVERRIDES that default so the player can put it anywhere.
  // `id` is `memoryId:abilityKey` — an ability key alone is not
  // unique, since two Memories can both roll Sweep.
  ASPECT: 'aspect',
  // ══════════════════════════════════════════════════════
  // ⚠️ THE THING ITSELF, not one of its Aspects.
  //
  // Owner: "once something is crafted it can be bound to a letter
  // except the ones that already have roles, at once 3 can be
  // summoned, and from those three all the active abilities appear in
  // the hotbar numbered 1 through 9."
  //
  // ASPECT binds a single ability of an ALREADY-equipped Memory.
  // GEAR binds the Memory — pressing its letter SUMMONS it (equips it
  // out of the satchel) or DISMISSES it (puts it back). That is the
  // half that did not exist: everything forged had to be equipped
  // through a panel, and the only key you could ever put on it was a
  // key for one of its abilities *after* you had already done that.
  //
  // `id` is the Memory's own id. Weapons, Echoes, Charms, Relics and
  // Raiment all use this kind — the budget they draw on is decided by
  // `LoadoutSystem.budgetFor()`, not by the binding.
  // ══════════════════════════════════════════════════════
  GEAR: 'gear',
};

/**
 * Keys the game already owns and will not let you bind over.
 *
 * ⚠️ Movement and the panel keys are reserved deliberately. Letting a
 * player bind a Weave to W and then discovering they cannot walk is
 * the kind of self-inflicted wound a config screen has a duty to
 * prevent — and it would be indistinguishable from a bug.
 */
export const RESERVED_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',           // movement
  'Space', 'ShiftLeft', 'ShiftRight',        // jump / sprint
  'KeyE',                                    // interact
  // ⚠️ KeyR is DODGE. It was missing from this list and the panel
  // happily bound an Echo to it — which would have fired the Echo and
  // the dodge on the same press, reading as "dodge is broken" with no
  // obvious cause. Verified against every key the game actually reads
  // (InputManager + every panel's own keydown listener) rather than
  // from memory, which is how it was missed the first time.
  'KeyR',
  // ⚠️ Z / X / C are the three class abilities (Player.js reads them
  // directly). Same omission as KeyR above — found by grepping for
  // every key handler in the project while writing the handoff, not by
  // remembering. If you add a key anywhere, add it here in the same
  // commit or the bind panel will happily double-book it.
  'KeyZ', 'KeyX', 'KeyC',
  // ══════════════════════════════════════════════════════
  // ⚠️ THE PANEL LETTERS ARE NO LONGER RESERVED.
  //
  // B G H I J K L N V F used to sit here — eleven letters (with Tab)
  // held by panels, on a keyboard whose remaining letters are the
  // entire supply of bindable keys. HANDOFF.md §7 listed collapsing
  // them behind one menu key as the clean fix and flagged it as the
  // owner's call to make; the owner made it.
  //
  // Every panel now opens from the Pioneer menu on **Tab**
  // (ui/MenuUI.js), which still answers those same letters WHILE IT
  // IS OPEN — so the mapping players already learned survives, and
  // the keys are free at the global level.
  //
  // ⚠️ Removing a key from this set is the DANGEROUS direction. A
  // player who binds a Weave to a key the game secretly still reads
  // gets both, and it reads as a bug with no visible cause. Before
  // freeing any key here, grep for every handler that reads it — the
  // panels' own `keydown` branches were deleted in this same commit,
  // not merely bypassed.
  // ══════════════════════════════════════════════════════
  // ⚠️ G / H / J are the three COMBAT SLOTS (main.js's
  // updateCombatSlotInput). They were freed from the grimoire, wand
  // and journal panels and immediately spent on equipping, which is
  // what the owner asked the freed keys to be for. Added here in the
  // SAME commit as the handler, per trap #7.
  'KeyG', 'KeyH', 'KeyJ',                    // combat slots 1 / 2 / 3
  // ⚠️ B / V / I / K KEPT THEIR DIRECT KEYS at the owner's
  // instruction: the Loom, Bindings, the Satchel and the Ascent are
  // opened often enough that putting a Tab hop in front of them costs
  // more than the freed letter is worth. They are ALSO listed in the
  // Pioneer menu, so the menu still teaches every panel and the two
  // routes agree.
  //
  // ⚠️ They must stay RESERVED precisely because their handlers still
  // exist. A key the game secretly still reads while the bind panel
  // hands it out is the worst kind of double-book — the player gets
  // both actions and there is nothing on screen explaining why.
  'KeyB', 'KeyV', 'KeyI', 'KeyK',            // Loom / Bindings / Satchel / Ascent
  // Freed for binding: L (codex), N (the Rite), F (the forge) — all
  // three reachable from the Pioneer menu.
  // ⚠️ Digit1–9 are the LOADOUT HOTBAR (systems/LoadoutSystem.js) —
  // the active Aspects of equipped Memories. Reserved in the same
  // commit as the handler, per trap #7. These were free for a while
  // after the old six fixed wand slots were removed; they are not now.
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5',
  'Digit6', 'Digit7', 'Digit8', 'Digit9',
  // ⚠️ Tab is the Pioneer menu now (it was Attunement's). It is the
  // one key that opens everything, so it can never be bound over.
  'Tab', 'Escape',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6',        // dev keys (PerfHUD, peace)
]);

/**
 * The keys the auto-binder reaches for, in order.
 *
 * ⚠️ THIS IS A PREFERENCE ORDER, NOT A PERMISSION LIST. Every entry is
 * still checked against `RESERVED_KEYS` and against what is already
 * bound before it is handed out, so adding a key to `RESERVED_KEYS`
 * later cannot make the auto-binder start double-booking it — which is
 * exactly the failure trap #7 records, one layer up.
 *
 * Letters first (a letter is what the owner asked for and what a player
 * can actually remember), then the numpad, then punctuation. Q and F
 * lead because they are the two free keys nearest WASD.
 */
export const AUTO_BIND_KEYS = [
  'KeyQ', 'KeyF', 'KeyT', 'KeyY', 'KeyU', 'KeyO', 'KeyP', 'KeyL', 'KeyN', 'KeyM',
  'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'Numpad5',
  'Numpad6', 'Numpad7', 'Numpad8', 'Numpad9', 'Numpad0',
  'Comma', 'Period', 'Slash', 'Semicolon', 'Quote',
  'BracketLeft', 'BracketRight', 'Backslash', 'Minus', 'Equal', 'Backquote',
];

/**
 * The punctuation keys, as the symbol printed on the keycap.
 *
 * ⚠️ Needed because the auto-binder falls back to punctuation once the
 * letters and the numpad are spent, and the generic transform below
 * leaves those codes raw — a player with a Memory on `Semicolon` sees
 * the word "Semicolon" in the HUD strip, on the chip in the Loom and
 * in the bindings panel, and has to translate it to ";" themselves
 * every time.
 */
const PUNCT_LABELS = {
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'",
  BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Minus: '-', Equal: '=', Backquote: '`',
};

/** A readable label for a key code, for the UI. */
export function keyLabel(code) {
  if (!code) return '—';
  if (PUNCT_LABELS[code]) return PUNCT_LABELS[code];
  return code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace(/^Numpad/, 'Num ')
    .replace(/^Arrow/, '')
    .replace('ControlLeft', 'L-Ctrl').replace('ControlRight', 'R-Ctrl')
    .replace('AltLeft', 'L-Alt').replace('AltRight', 'R-Alt');
}

class BindSystem {
  constructor() {
    /** @type {Map<string, object>} keyCode → binding */
    this.bindings = new Map();
    this._load();
  }

  // ── QUERY ───────────────────────────────────────────────

  get(keyCode) { return this.bindings.get(keyCode) || null; }
  has(keyCode) { return this.bindings.has(keyCode); }
  all() { return [...this.bindings.entries()].map(([key, b]) => ({ key, ...b })); }

  /** Every binding of one kind. */
  ofKind(kind) { return this.all().filter(b => b.kind === kind); }

  /** The key a given thing is bound to, or null. */
  keyFor(kind, id) {
    for (const [key, b] of this.bindings) {
      if (b.kind === kind && b.id === id) return key;
    }
    return null;
  }

  /**
   * The first key in `AUTO_BIND_KEYS` that is neither reserved nor
   * already taken, or null when there is nowhere left to put anything.
   *
   * ⚠️ Returning null is a real outcome, not an error case. The caller
   * must SAY SO — a forged thing that silently got no key is
   * indistinguishable from a forged thing whose key silently does
   * nothing, which is the shape of half the bugs in this file's
   * history.
   */
  freeKey() {
    for (const k of AUTO_BIND_KEYS) {
      if (!RESERVED_KEYS.has(k) && !this.bindings.has(k)) return k;
    }
    return null;
  }

  // ── MUTATE ──────────────────────────────────────────────

  /**
   * Put something on a key.
   *
   * @returns {{ok:boolean, reason?:string, replaced?:object}}
   */
  bind(keyCode, { kind, id, name, icon = null, meta = null }) {
    if (!keyCode) return { ok: false, reason: 'No key given.' };
    if (RESERVED_KEYS.has(keyCode)) {
      return { ok: false, reason: `${keyLabel(keyCode)} is already the game's.` };
    }
    if (!kind || !id) return { ok: false, reason: 'Nothing to bind.' };

    // ⚠️ One thing per key AND one key per thing. Without the second
    // rule a Weave could sit on three keys at once, which reads as a
    // duplication bug the first time a player casts it from two places
    // and sees one shared charge pool drain.
    const existingKey = this.keyFor(kind, id);
    if (existingKey && existingKey !== keyCode) this.bindings.delete(existingKey);

    const replaced = this.bindings.get(keyCode) || null;
    this.bindings.set(keyCode, { kind, id, name, icon, meta });
    this._save();
    eventBus.emit(Events.BINDINGS_CHANGED, { key: keyCode, bound: this.get(keyCode), replaced });
    return { ok: true, replaced };
  }

  /**
   * Point an existing binding at a new id, KEEPING ITS KEY.
   *
   * ⚠️ Enchanting a Memory changes its seed and therefore its id, so
   * without this every enchant would silently orphan the letter the
   * player had put it on — the thing on Q comes back from the forge
   * as a different id, the Q binding now names something nobody owns,
   * and the reworked Memory has no key at all. The player experiences
   * that as "enchanting unbound my weapon", and there is nothing on
   * screen that explains it.
   *
   * Returns the key it kept, or null if that thing was never bound.
   */
  rebindId(kind, oldId, newId, name = null) {
    const key = this.keyFor(kind, oldId);
    if (!key || oldId === newId) return null;
    const b = this.bindings.get(key);
    this.bindings.set(key, { ...b, id: newId, name: name || b.name });
    this._save();
    eventBus.emit(Events.BINDINGS_CHANGED, { key, bound: this.get(key), replaced: b });
    return key;
  }

  unbind(keyCode) {
    if (!this.bindings.has(keyCode)) return false;
    const was = this.bindings.get(keyCode);
    this.bindings.delete(keyCode);
    this._save();
    eventBus.emit(Events.BINDINGS_CHANGED, { key: keyCode, bound: null, replaced: was });
    return true;
  }

  /** Drop every binding pointing at a thing that no longer exists. */
  prune(exists) {
    let changed = false;
    for (const [key, b] of [...this.bindings]) {
      if (!exists(b)) { this.bindings.delete(key); changed = true; }
    }
    if (changed) { this._save(); eventBus.emit(Events.BINDINGS_CHANGED, {}); }
    return changed;
  }

  clear() {
    this.bindings.clear();
    this._save();
    eventBus.emit(Events.BINDINGS_CHANGED, {});
  }

  // ── PERSISTENCE ─────────────────────────────────────────
  //
  // Bindings are a PREFERENCE, not save data — a player who has decided
  // that Echoes live on F expects that to survive starting over, the
  // same way a keyboard layout does.

  /**
   * Which key this profile's bindings live under.
   *
   * ⚠️ PER-PROFILE, because gear letters name MEMORY IDS. A second
   * character's satchel contains none of the first's Memories, so a
   * shared table hands them a keyboard full of letters pointing at
   * things they do not own — and `pruneGearBindings()` deliberately
   * does not run at boot, so those ghosts would survive indefinitely
   * while eating the free letters a new character needs.
   *
   * ⚠️ Weave/Echo/Aspect binds are scoped with them. Keybinds are a
   * PREFERENCE (this file's own header) and it is tempting to keep
   * them global — but they are a preference about ids, and the ids are
   * per-character.
   */
  _storageKey() {
    return this._profile ? `${STORAGE_KEY}__${this._profile}` : STORAGE_KEY;
  }

  /**
   * Switch to a character's own bindings.
   *
   * ⚠️ Clears first. Without that, the previous character's table is
   * still in memory and the next `_save()` writes it into the new
   * profile's key — one profile switch and both characters share a
   * loadout again.
   */
  useProfile(id) {
    this._profile = id || null;
    this.bindings.clear();
    this._load();
    // ⚠️ ADOPT the pre-profiles table for the first character, rather
    // than handing a returning player an empty keyboard. Copied, not
    // moved, so an older build still finds its own bindings.
    if (!this.bindings.size && id) {
      try {
        const legacy = localStorage.getItem(STORAGE_KEY);
        if (legacy) {
          for (const [k, v] of JSON.parse(legacy)) {
            if (!RESERVED_KEYS.has(k)) this.bindings.set(k, v);
          }
          this._save();
        }
      } catch { /* nothing to adopt */ }
    }
    eventBus.emit(Events.BINDINGS_CHANGED, {});
  }

  _save() {
    try {
      localStorage.setItem(this._storageKey(), JSON.stringify([...this.bindings]));
    } catch { /* private mode — bindings just do not persist */ }
  }

  _load() {
    try {
      const raw = localStorage.getItem(this._storageKey());
      if (!raw) return;
      for (const [k, v] of JSON.parse(raw)) {
        // Skip anything that has since become reserved, so adding a new
        // game key in a later version cannot brick a returning player's
        // movement.
        if (!RESERVED_KEYS.has(k)) this.bindings.set(k, v);
      }
    } catch { /* corrupt or absent — start empty */ }
  }
}

export const bindSystem = new BindSystem();
