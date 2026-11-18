// ══════════════════════════════════════════════════════════
// The Loadout — what you are carrying, and what that puts on the bar
//
// ── WHY THIS EXISTS ───────────────────────────────────────
// Forged Memories were unreachable. `BindSystem` has always had a
// `memory` kind, but it fed from `SpoilsSystem.memories` — the powers
// that crystallise out of a SEALED Descent — while a Memory forged at
// the Loom is an inventory item. The two were different things wearing
// the same word, so everything the forge produced could be made,
// admired in the preview, and never used.
//
// ── THE RULES ─────────────────────────────────────────────
//   · THREE combat slots, holding weapons AND Echoes combined,
//     TWO trinket slots (charms + relics), raiment uncapped.
//     Owner's call — see the capacity block below for the reasoning.
//   · Every equipped Memory contributes its Aspects.
//   · ACTIVE Aspects take a hotbar key, 1..9, in slot order.
//   · PASSIVE Aspects apply silently and never touch the bar.
//   · Actives cost Essence (CoreSystem), not mana. Mana is Weaves.
//
// ⚠️ The bar is DERIVED, never stored. It is rebuilt from the equipped
// Memories every time the loadout changes, so a Memory that is
// unequipped cannot leave a stale key behind pointing at an Aspect the
// player no longer owns — which is the bug shape that would let you
// keep firing something you sold.
//
// ⚠️ Nine is a hard ceiling because there are nine number keys. Three
// Divine Memories could offer more actives than that; the overflow is
// reported rather than silently dropped, because "my ability vanished"
// is indistinguishable from a bug.
// ══════════════════════════════════════════════════════════

import { eventBus, Events } from '../core/EventBus.js';
import { coreSystem } from './CoreSystem.js';
import { inventory } from './InventorySystem.js';
import { bindSystem, BIND_KINDS, keyLabel } from './BindSystem.js';

// ══════════════════════════════════════════════════════════
// CAPACITY — the owner's rule, and why each cap is where it is
//
//   · 3 COMBAT slots, taking weapons AND Echoes **combined**.
//   · 2 TRINKET slots, taking charms AND relics combined.
//   · Raiment is uncapped.
//
// ⚠️ "Weapons and Echoes share three slots" is the load-bearing half.
// An Echo is a summon you bring to a fight; a weapon is a thing you
// bring to a fight. Giving Echoes their own separate pool would mean
// carrying an Echo cost you nothing, and a cap that costs nothing is
// not a decision. Sharing the pool is what makes "third weapon, or
// the shade that fights beside me?" a real question.
//
// ⚠️ Charms and Relics likewise share one budget. Both are carried,
// both lean passive, and one trinket budget keeps the choice between
// them honest.
//
// ⚠️ Raiment is uncapped BY DESIGN, not by omission. It is the only
// form whose contribution is a plain defence number with no Aspects
// on the bar, so stacking it cannot overflow anything or make a
// build illegible — it just makes you harder to kill, which is what
// armour is for.
// ══════════════════════════════════════════════════════════
export const COMBAT_SLOTS = 3;
export const TRINKET_SLOTS = 2;
export const HOTBAR_KEYS = 9;

/** Back-compat: this was `WEAPON_SLOTS` before Echoes joined the pool. */
export const WEAPON_SLOTS = COMBAT_SLOTS;

/**
 * Which budget a Memory draws on.
 *
 * ⚠️ Keyed on `formId`, NOT on `equips`. Echo and Relic BOTH declare
 * `equips: 'bindable'` in MEMORY_FORMS, so `equips` cannot tell them
 * apart — and they belong to different budgets. This is trap #11's
 * shape (a display/lookup collision) waiting to happen: reading
 * `equips` here compiles, runs, and quietly files every Relic as an
 * Echo forever.
 */
/**
 * "Weapon" → "a Weapon", "Echo" → "an Echo".
 *
 * The five form names are Weapon / Charm / Echo / Raiment / Relic and
 * exactly one begins with a vowel, so every message that names a form
 * needs this rather than a hardcoded article.
 */
function article(noun) {
  return /^[aeiou]/i.test(noun || '') ? `an ${noun}` : `a ${noun}`;
}

export function budgetFor(memory) {
  if (!memory) return null;
  // ⚠️ THE INNATE ASPECT HAS ITS OWN BUDGET, AND IT IS UNCAPPED.
  // It is not a trinket the player chose and can put down — it is what
  // the First Nightmare made them. Filing it as a trinket would spend
  // one of their two carry slots permanently on something they cannot
  // remove, which reads as the game having stolen a slot.
  if (memory.formId === 'innate') return 'innate';
  if (memory.formId === 'weapon' || memory.equips === 'weapon') return 'combat';
  if (memory.formId === 'echo') return 'combat';
  if (memory.formId === 'raiment' || memory.equips === 'armor') return 'raiment';
  return 'trinket';   // charm, relic, and anything new that is carried
}

class LoadoutSystem {
  constructor() {
    /**
     * The three COMBAT slots. Index IS the slot, and a slot holds
     * either a weapon Memory or an Echo Memory — see the capacity
     * note above. Still called `weapons` because every call site and
     * every save format in the project names it that; renaming a
     * working field for accuracy is a trade this codebase has
     * repeatedly declined (see PotionSystem's filename).
     */
    this.weapons = new Array(COMBAT_SLOTS).fill(null);
    /** Carried Memories: trinkets (charm/relic) and raiment. */
    this.held = [];
    /** Derived: [{ memory, ability, key }] in hotbar order. */
    this.bar = [];
    /** ability key → seconds remaining. */
    this._cooldowns = new Map();
    this.player = null;
    this._active = 0;   // which weapon slot is in hand
  }

  init({ player } = {}) {
    this.player = player;
    this._rebuild();
  }

  // ── EQUIPPING ───────────────────────────────────────────

  /**
   * Put a Memory in a weapon slot.
   *
   * ⚠️ Returns the DISPLACED Memory so the caller can put it back in
   * the bag. Dropping it on the floor here would delete an item the
   * player spent cores on.
   */
  equipWeapon(memory, slot = 0) {
    if (!memory?.isMemory) return { ok: false, reason: 'That is not a Remnant.' };
    // ⚠️ STEEL: Echoes no longer fight beside you (owner cut thralls).
    if (memory.formId === 'echo') return { ok: false, reason: `${memory.name} will not come to a fight any more.` };
    // ⚠️ Weapons AND Echoes. An Echo in a combat slot manifests as a
    // companion (main.js's _syncLoadoutEquipment) rather than a thing
    // in your hand, but it costs one of the same three slots.
    if (budgetFor(memory) !== 'combat') {
      return {
        ok: false,
        reason: `${memory.name} is ${article(memory.formName)} — it is carried, not brought to hand.`,
      };
    }
    const i = Math.max(0, Math.min(COMBAT_SLOTS - 1, slot | 0));

    // ⚠️ The same Memory may not sit in two slots. Otherwise one object
    // contributes its Aspects twice and a single Memory fills the bar.
    const already = this.weapons.findIndex(w => w && w.id === memory.id);
    if (already >= 0 && already !== i) this.weapons[already] = null;

    // ⚠️ A FRESHLY-EQUIPPED WEAPON GOES STRAIGHT TO HAND IF THE HAND IS
    // EMPTY. `_active` never moved on its own before Echoes existed —
    // it did not need to, because the only thing that could ever
    // occupy a combat slot was a weapon, and `equipWeapon` always
    // targeted a free slot, so slot 0 (the default active slot) was
    // the first thing filled. An Echo broke that: it can sit in slot
    // 0, `activeWeapon` correctly returns null for it (an Echo is not
    // a thing you swing), and a weapon auto-equipped into slot 1 or 2
    // afterwards had NOTHING pointing at it — no mesh in the
    // viewmodel, no mesh on the body, `weaponAtk` still the wand's.
    // Measured live: forged an Echo (→ slot 0), then a weapon (→ slot
    // 1, "Drawn into slot 2" notification and all) — 0 viewmodel
    // meshes, 0 body meshes, weaponAtk stuck at 18. The equip
    // succeeded in every sense the data model tracks; the player just
    // never saw it, which reads exactly like "the weapon doesn't
    // load".
    //
    // ⚠️ Gated on `wasHandEmpty`, not unconditional — forging a SECOND
    // weapon while the first is still in hand must NOT yank focus
    // away mid-loadout. Only a hand with nothing swingable in it grabs
    // the new arrival.
    const wasHandEmpty = !this.activeWeapon;
    const displaced = this.weapons[i];
    this.weapons[i] = memory;
    if (memory.formId !== 'echo' && wasHandEmpty) this._active = i;
    this._rebuild();
    this.pruneBindings();
    eventBus.emit(Events.LOADOUT_CHANGED, this.snapshot());
    return { ok: true, displaced };
  }

  unequipWeapon(slot) {
    const i = slot | 0;
    if (i < 0 || i >= WEAPON_SLOTS) return null;
    const was = this.weapons[i];
    this.weapons[i] = null;
    this._rebuild();
    this.pruneBindings();
    eventBus.emit(Events.LOADOUT_CHANGED, this.snapshot());
    return was;
  }

  /** Carry a trinket (charm / relic) or a piece of raiment. */
  hold(memory) {
    if (!memory?.isMemory) return { ok: false, reason: 'That is not a Remnant.' };
    const budget = budgetFor(memory);
    // ⚠️ Innate goes straight in, past every cap — and only ever one,
    // keyed on formId rather than id so re-granting on load replaces
    // rather than stacking.
    if (budget === 'innate') {
      this.held = this.held.filter(h => h.formId !== 'innate');
      this.held.push(memory);
      this._rebuild();
      eventBus.emit(Events.LOADOUT_CHANGED, this.snapshot());
      return { ok: true };
    }
    if (budget === 'combat') {
      return {
        ok: false,
        // ⚠️ `article()`, not a hardcoded "a"/"an". This branch catches
        // BOTH Weapons and Echoes, so neither article is right for it
        // on its own — the first version read "a Echo", and correcting
        // it to "an" would have produced "an Weapon".
        reason: `${memory.name} is ${article(memory.formName)} — it takes one of your three combat slots.`,
      };
    }
    if (this.held.some(h => h.id === memory.id)) {
      return { ok: false, reason: 'Already carried.' };
    }
    // ⚠️ THE TRINKET CAP IS ENFORCED, AND SAYS SO. A cap that silently
    // drops the thing you just equipped is indistinguishable from a
    // bug — the same reasoning as the hotbar's overflow being reported
    // rather than swallowed.
    if (budget === 'trinket' && this.trinketCount() >= TRINKET_SLOTS) {
      return {
        ok: false,
        reason: `You can carry ${TRINKET_SLOTS} charms or relics. Put one down first.`,
      };
    }
    this.held.push(memory);
    this._rebuild();
    this.pruneBindings();
    eventBus.emit(Events.LOADOUT_CHANGED, this.snapshot());
    return { ok: true };
  }

  drop(memoryId) {
    const at = this.held.findIndex(h => h.id === memoryId);
    if (at < 0) return null;
    const was = this.held.splice(at, 1)[0];
    this._rebuild();
    eventBus.emit(Events.LOADOUT_CHANGED, this.snapshot());
    return was;
  }

  /** Trinkets (charm + relic) currently carried, against TRINKET_SLOTS. */
  trinketCount() {
    // ⚠️ `budgetFor` returns 'innate' for the First Nightmare's Aspect,
    // so it is naturally excluded here — it must never count against
    // the two trinket slots the player actually chooses.
    return this.held.filter(h => budgetFor(h) === 'trinket').length;
  }

  /** Raiment currently worn. Uncapped — see the capacity note. */
  raiment() {
    return this.held.filter(h => budgetFor(h) === 'raiment');
  }

  /** Echoes currently occupying a combat slot, in slot order. */
  echoes() {
    return this.weapons.filter(w => w && w.formId === 'echo');
  }

  /**
   * The weapon in hand, if the active slot holds one.
   *
   * ⚠️ Returns null when the active slot holds an ECHO. An Echo is not
   * a thing you swing — melee and the viewmodel both read this, and
   * handing them an Echo would forge a phantom sword out of its
   * (absent) weaponType, which is exactly the fallback trap #11
   * records.
   */
  get activeWeapon() {
    // ⚠️ WORLD EXPANSION: a drawn TOOL (GatherSystem, T) is the thing in hand.
    if (this.toolOverride) return this.toolOverride;
    const m = this.weapons[this._active];
    return (m && budgetFor(m) === 'combat' && m.formId !== 'echo') ? m : null;
  }

  /** Whatever is in the active slot, weapon or Echo. */
  get activeCombat() { return this.weapons[this._active] || null; }

  /** Which slot is in hand. Melee reads this. */
  get activeSlot() { return this._active; }
  setActiveSlot(i) {
    const n = i | 0;
    if (n < 0 || n >= WEAPON_SLOTS || !this.weapons[n]) return false;
    this._active = n;
    // ⚠️ REBUILD, because the bar now follows the weapon in hand (see
    // `barMemories`). Before that change the bar was identical across
    // slots so switching did not need one; now, omitting this leaves
    // the previous weapon's spells on the keys while a different
    // weapon is being swung.
    this._rebuild();
    eventBus.emit(Events.LOADOUT_CHANGED, this.snapshot());
    return true;
  }

  // ══════════════════════════════════════════════════════════
  // SUMMONING — a letter per forged thing
  //
  // Owner: "once something is crafted it can be bound to a letter
  // except the ones that already have roles, at once 3 can be
  // summoned, and from those three all the active abilities appear in
  // the hotbar numbered 1 through 9."
  //
  // ── WHAT WAS MISSING ──────────────────────────────────────
  // Everything below the first sentence already worked. Three combat
  // slots existed, the 1..9 bar was already derived from what was in
  // them, and every panel that could equip a Memory did so correctly.
  // What did NOT exist was any way to equip a thing WITHOUT opening a
  // panel — `BIND_KINDS.ASPECT` binds one ability of a Memory you have
  // ALREADY equipped, which is the step after the one the owner was
  // asking for. So a forged Charm or Raiment could be made, auto-
  // equipped if a slot happened to be free, and after that was
  // reachable only by finding the Loom's Equip page. "I am unable to
  // equip armour, weapons, charms" was true in the only sense that
  // matters: there was no key for it.
  //
  // A gear letter TOGGLES. Press it and the thing is summoned out of
  // the satchel into its budget; press it again and it goes back.
  //
  // ⚠️ THE ITEM IS NEVER IN BOTH PLACES. Every path here moves it
  // between `inventory` and the loadout, matching the invariant the
  // forge panel already keeps — a Memory left in the satchel while
  // also equipped could be transmuted or spent while its Aspects were
  // still on the bar.
  //
  // ⚠️ THREE IS REPORTED, NEVER SILENT. Summoning a fourth combat
  // thing REFUSES and names what is holding the slots. Silently
  // displacing something the player chose is the worse failure — and
  // a refusal with no message is indistinguishable from a dead key,
  // which is the lesson the silent bind refusals already taught this
  // project once.
  // ══════════════════════════════════════════════════════════

  /**
   * Where a Memory currently is: a combat slot, carried, or the bag.
   * Returns null if the player does not own it at all.
   */
  locate(memoryId) {
    if (!memoryId) return null;
    const slot = this.weapons.findIndex(w => w && w.id === memoryId);
    if (slot >= 0) return { where: 'slot', slot, memory: this.weapons[slot] };
    const carried = this.held.find(h => h.id === memoryId);
    if (carried) return { where: 'carried', memory: carried };
    const st = inventory.getSlotData().find(s => s && s.item?.id === memoryId && s.item.isMemory);
    if (st) return { where: 'satchel', memory: st.item };
    return null;
  }

  /** Every Memory the player owns, wherever it is. */
  everyKnownMemory() {
    const out = [...this.weapons.filter(Boolean), ...this.held];
    const seen = new Set(out.map(m => m.id));
    for (const st of inventory.getSlotData()) {
      if (st && st.item?.isMemory && !seen.has(st.item.id)) {
        seen.add(st.item.id);
        out.push(st.item);
      }
    }
    return out;
  }

  /**
   * Bring a Memory out of the satchel into play.
   *
   * ⚠️ Returns `{ ok, reason }`, never a boolean — same contract as
   * `bindSystem.bind()`, for the same reason: the reason string is the
   * only thing that tells a player why their key did nothing.
   */
  summon(memoryId) {
    const at = this.locate(memoryId);
    if (!at) return { ok: false, reason: 'That is no longer yours.' };
    if (at.where !== 'satchel') {
      return {
        ok: false,
        reason: `${at.memory.name} is already ${at.where === 'slot' ? `in slot ${at.slot + 1}` : 'carried'}.`,
      };
    }
    const mem = at.memory;

    if (budgetFor(mem) === 'combat') {
      const free = this.weapons.findIndex(w => !w);
      if (free < 0) {
        // ⚠️ NAME WHAT IS IN THE WAY. "All three slots are full" alone
        // makes the player open a panel to find out what to dismiss,
        // which is the panel trip this whole feature exists to remove.
        const holding = this.weapons.filter(Boolean).map(w => w.name).join(', ');
        return {
          ok: false,
          reason: `Three at once. ${holding} — dismiss one to call ${mem.name}.`,
        };
      }
      const res = this.equipWeapon(mem, free);
      if (!res.ok) return res;
      inventory.consumeItems(mem.id, 1);
      if (res.displaced) inventory.addItem(res.displaced, 1);
      return { ok: true, action: 'summoned', slot: free, memory: mem };
    }

    const res = this.hold(mem);
    if (!res.ok) return res;
    inventory.consumeItems(mem.id, 1);
    return { ok: true, action: 'carried', memory: mem };
  }

  /** Put a summoned Memory back in the satchel. */
  dismiss(memoryId) {
    const at = this.locate(memoryId);
    if (!at) return { ok: false, reason: 'That is no longer yours.' };
    if (at.where === 'satchel') {
      return { ok: false, reason: `${at.memory.name} is already in the satchel.` };
    }
    const was = at.where === 'slot' ? this.unequipWeapon(at.slot) : this.drop(memoryId);
    if (!was) return { ok: false, reason: 'That would not come away.' };
    inventory.addItem(was, 1);
    return { ok: true, action: 'dismissed', memory: was };
  }

  /**
   * What a gear letter does: summon it if it is in the bag, dismiss it
   * if it is in play.
   */
  toggleGear(memoryId) {
    const at = this.locate(memoryId);
    if (!at) return { ok: false, reason: 'That is no longer yours.' };
    return at.where === 'satchel' ? this.summon(memoryId) : this.dismiss(memoryId);
  }

  /**
   * Everything that can take a letter, for the bindings panel.
   * Equipped things included — the letter that summoned it is the same
   * letter that dismisses it, so it must stay visible while it is out.
   */
  gearBindables() {
    const row = (m, state) => ({
      kind: BIND_KINDS.GEAR,
      id: m.id,
      name: m.name,
      sub: `${m.grade?.name ? m.grade.name + ' ' : ''}${m.formName} · ${state}`,
      element: m.element,
      state,
      summoned: state !== 'in the satchel',
    });
    const out = [];
    this.weapons.forEach((w, i) => { if (w) out.push(row(w, `slot ${i + 1}`)); });
    this.held.forEach(h => out.push(row(h, 'carried')));
    for (const st of inventory.getSlotData()) {
      if (st && st.item?.isMemory) out.push(row(st.item, 'in the satchel'));
    }
    return out;
  }

  /**
   * Give a freshly forged Memory a letter, so it is usable the moment
   * it exists.
   *
   * ⚠️ DEFAULTS AND OVERRIDES, NOT EITHER — the same rule the 1..9 bar
   * already follows. The auto-key exists so a forged thing is never
   * stranded behind a config panel; rebinding it in V simply moves it,
   * because `bindSystem.bind()` enforces one key per thing.
   *
   * ⚠️ Returns null when the keyboard is full, and the CALLER MUST SAY
   * SO. A thing that quietly got no key looks exactly like a thing
   * whose key quietly does nothing.
   */
  autoBindGear(memory) {
    if (!memory?.isMemory) return null;
    const existing = bindSystem.keyFor(BIND_KINDS.GEAR, memory.id);
    if (existing) return existing;
    const key = bindSystem.freeKey();
    if (!key) return null;
    const res = bindSystem.bind(key, {
      kind: BIND_KINDS.GEAR, id: memory.id, name: memory.name,
    });
    return res.ok ? key : null;
  }

  /**
   * Drop gear letters pointing at Memories the player no longer owns.
   *
   * ⚠️ NOT called from `_rebuild()`, and NOT called on boot — exactly
   * the trap `pruneBindings()` documents one method down. Gear letters
   * name things that live in the SATCHEL, and at init the satchel is
   * still being restored, so pruning there would delete every saved
   * gear letter on every load. It is called only after a forge, an
   * enchant or a transmute, when ids have actually churned.
   *
   * ⚠️ Returns early when the player owns no Memories at all, for the
   * same reason: an empty inventory cannot distinguish a stale letter
   * from one whose Memory has simply not been restored yet.
   */
  pruneGearBindings() {
    if (this._pruningGear) return;
    const known = new Set(this.everyKnownMemory().map(m => m.id));
    if (!known.size) return;
    this._pruningGear = true;
    try {
      for (const b of bindSystem.ofKind(BIND_KINDS.GEAR)) {
        if (!known.has(b.id)) bindSystem.unbind(b.key);
      }
    } finally {
      this._pruningGear = false;
    }
  }

  /** The letter a Memory is on, or null. */
  gearKeyFor(memoryId) {
    return bindSystem.keyFor(BIND_KINDS.GEAR, memoryId);
  }

  /**
   * Summoned things and their letters, for the HUD strip.
   *
   * ⚠️ THE THREE COMBAT SLOTS ARE ALWAYS RETURNED, empty ones
   * included. "Three at once" is the rule the player has to learn, and
   * a strip that only draws what is filled teaches "you have as many
   * as you have" — the cap becomes visible only at the moment it
   * refuses you, which is the worst time to meet a rule for the first
   * time.
   *
   * ⚠️ Carried and worn are returned SEPARATELY (`combat` / `carried`)
   * rather than in one list, because raiment is uncapped: folded into
   * one array the strip grows without bound and eats the HUD. Measured
   * at 7 things: 107px and three wrapped rows over the hotbar. The
   * painter caps the carried side; the combat trio is never capped
   * because it cannot exceed three.
   */
  summonSnapshot() {
    const row = (m, state, slot = null) => ({
      id: m.id, name: m.name, form: m.formName, element: m.element,
      tier: m.tier?.color || null, state, slot,
      key: bindSystem.keyFor(BIND_KINDS.GEAR, m.id) || null,
      inHand: slot !== null && slot === this._active,
      empty: false,
    });
    const combat = this.weapons.map((w, i) => w
      ? row(w, 'combat', i)
      : { id: null, name: 'Empty', form: '', element: null, tier: null,
          state: 'combat', slot: i, key: null, inHand: false, empty: true });
    const carried = this.held.map(h =>
      row(h, budgetFor(h) === 'raiment' ? 'worn' : 'carried'));
    return { combat, carried };
  }

  /**
   * Give a letter to everything owned that has none.
   *
   * ⚠️ ADDITIVE ONLY — it binds, never unbinds, which is what makes it
   * safe to run at boot where `pruneGearBindings()` explicitly is not.
   * The failure mode a prune has at boot (an empty inventory reads as
   * "the player owns nothing", so every saved letter is deleted) has
   * no mirror here: an empty inventory simply means there is nothing
   * to bind, and the call does nothing.
   *
   * ⚠️ Exists because a save written before gear letters restores
   * Memories with no key at all, and "the thing I already own can't be
   * bound" is the same complaint this pass is answering. Verified: a
   * restored loadout came back with three combat slots reading "—".
   *
   * @returns {number} how many letters were handed out
   */
  ensureGearLetters() {
    let n = 0;
    for (const m of this.everyKnownMemory()) {
      if (bindSystem.keyFor(BIND_KINDS.GEAR, m.id)) continue;
      if (this.autoBindGear(m)) n++;
      else break;                      // keyboard full — stop asking
    }
    return n;
  }

  // ── THE BAR ─────────────────────────────────────────────

  everyMemory() {
    return [...this.weapons.filter(Boolean), ...this.held];
  }

  /**
   * Rebuild the hotbar from what is equipped.
   *
   * ⚠️ Wholesale, never incremental. See the file header — an
   * incrementally-patched bar can outlive the Memory that filled it.
   */
  /**
   * Which Memories put actives on the 1..9 bar.
   *
   * ══════════════════════════════════════════════════════════
   * ⚠️ THE BAR FOLLOWS THE WEAPON IN HAND. THIS REVERSES AN EARLIER
   *    DECISION ON PURPOSE — do not "restore" it.
   *
   * Owner: *"the current weapon layout system is getting way too
   * complicated... whenever the weapon is summoned, I can use its
   * spells, and then changing the weapon changes the spells."*
   *
   * §7 records the opposite rule ("the 1..9 bar is NOT re-pointed by
   * the slot keys... every equipped Memory contributes regardless of
   * which slot is in hand") as the owner's explicit earlier choice,
   * and the reasoning then was sound: a bar that reshuffles mid-fight
   * makes every number key mean something different depending on
   * invisible state.
   *
   * What changed is that the state stopped being invisible. G/H/J now
   * switch slots, the summon strip shows which weapon is in hand, and
   * the weapon itself is in the player's hands on screen. With three
   * weapons all contributing at once the bar reached nine entries of
   * mixed provenance and became unreadable — which is the complaint.
   * Tied to the weapon, the bar is at most a handful of keys and the
   * player always knows why they are what they are.
   *
   * ⚠️ THE INNATE ASPECT IS ALWAYS ON IT. It is what the Pioneer IS,
   * not something they are holding, and it is their only ability
   * before they ever forge a weapon.
   *
   * ⚠️ Carried trinkets still contribute. They are capped at two, lean
   * passive by design, and are a deliberate carry choice — dropping
   * them from the bar would make charms and relics unusable rather
   * than simpler.
   * ══════════════════════════════════════════════════════════
   */
  barMemories() {
    const out = [];
    // The innate Aspect first, so it keeps key 1 no matter what is
    // equipped — a power whose key moves when you swap weapons is the
    // exact confusion this change exists to remove.
    for (const h of this.held) if (budgetFor(h) === 'innate') out.push(h);
    const inHand = this.activeCombat;
    if (inHand) out.push(inHand);
    for (const h of this.held) if (budgetFor(h) === 'trinket') out.push(h);
    return out;
  }

  _rebuild() {
    const bar = [];
    let overflow = 0;
    for (const mem of this.barMemories()) {
      for (const ab of (mem.abilities || [])) {
        if (!ab.active) continue;             // passives never take a key
        if (bar.length >= HOTBAR_KEYS) { overflow++; continue; }
        const id = `${mem.id}:${ab.key}`;
        // ⚠️ A CUSTOM BIND WINS over the default number key. The
        // default exists so a forged Memory is usable immediately
        // without visiting a config panel; the override exists because
        // the owner asked to be able to move them. Both, not either.
        const custom = bindSystem.keyFor(BIND_KINDS.ASPECT, id);
        bar.push({
          memory: mem, ability: ab, id,
          key: String(bar.length + 1),
          boundKey: custom || null,
          label: custom ? keyLabel(custom) : String(bar.length + 1),
        });
      }
    }
    this.bar = bar;
    this._overflow = overflow;

    this._applyPassives();
  }

  /**
   * Drop ASPECT bindings pointing at Memories that are no longer
   * equipped. Bindings persist in localStorage across sessions, so a
   * key can otherwise stay aimed at something unequipped, enchanted
   * (which changes the id) or from a previous run, and the panel lists
   * a ghost the player cannot remove.
   *
   * ⚠️ NOT called from _rebuild(). Two reasons, both of which I hit:
   *   1. `_rebuild()` runs at init with an empty loadout, so pruning
   *      there would delete EVERY saved aspect binding on boot.
   *   2. `unbind()` emits BINDINGS_CHANGED, which main.js listens to
   *      by calling `_rebuild()` — pruning inside it is re-entrant.
   * It is called explicitly after an equip/unequip, when the loadout
   * is genuinely settled.
   */
  pruneBindings() {
    if (this._pruning) return;
    // Nothing equipped means we cannot tell a stale binding from one
    // whose Memory simply is not in hand yet. Leave them alone.
    if (!this.everyMemory().length) return;
    this._pruning = true;
    try {
      const live = new Set(this.bar.map(e => e.id));
      for (const b of bindSystem.all()) {
        if (b.kind === BIND_KINDS.ASPECT && !live.has(b.id)) bindSystem.unbind(b.key);
      }
    } finally {
      this._pruning = false;
    }
  }

  /** Every passive Aspect currently in effect, folded by key. */
  passives() {
    const out = {};
    for (const mem of this.everyMemory()) {
      for (const ab of (mem.abilities || [])) {
        if (ab.active) continue;
        const nums = ab.effect?.[ab.key] || {};
        out[ab.key] = out[ab.key] || { count: 0, nums };
        out[ab.key].count++;
      }
    }
    return out;
  }

  /**
   * Push the passive contribution into the player.
   *
   * ⚠️ Published as FACTORS folded by Player.recomputeStats(), never
   * assigned — the fourth contributor to `stats.atk` after weapon,
   * level and awakening. Assigning here would make each erase the
   * others, which this project has now hit four times.
   */
  _applyPassives() {
    const p = this.player;
    if (!p) return;
    let atk = 0;
    for (const mem of this.everyMemory()) {
      atk += (mem.attributes?.strength || 0) * 0.8;
    }
    p.loadoutAtk = atk;
    p.recomputeStats?.();
  }

  // ── FIRING ──────────────────────────────────────────────

  /**
   * The bar entry for a pressed key.
   *
   * ⚠️ An entry with a CUSTOM bind no longer answers to its default
   * number — otherwise moving an Aspect to Q would leave it firing on
   * both Q and 3, which reads as a duplication bug the first time the
   * cooldowns disagree.
   */
  atKey(key) {
    return this.bar.find(e => !e.boundKey && e.key === String(key)) || null;
  }

  /** Fire by `memoryId:abilityKey` — used by custom key bindings. */
  atId(id) {
    return this.bar.find(e => e.id === id) || null;
  }

  /** Everything currently on the bar, for the bindings panel. */
  bindables() {
    return this.bar.map(e => ({
      kind: BIND_KINDS.ASPECT, id: e.id, name: e.ability.name,
      sub: `${e.memory.name} · ${e.ability.cost || 0} essence`,
      element: e.memory.element,
      defaultKey: e.boundKey ? null : e.key,
    }));
  }

  cooldownOf(abilityKey) { return this._cooldowns.get(abilityKey) || 0; }

  /**
   * Use the Aspect on a hotbar key.
   *
   * ⚠️ Cooldown is keyed by `memoryId:abilityKey`, not by ability key
   * alone. Two Memories can both roll `Sweep`, and sharing one timer
   * between them would make the second one look broken.
   */
  use(key) {
    return this._fire(this.atKey(key));
  }

  /** Fire a specific Aspect by id. For custom binds. */
  useId(id) {
    return this._fire(this.atId(id));
  }

  _fire(entry) {
    if (!entry) return { ok: false, reason: null };   // silent: no such slot

    const id = entry.id;
    const cd = this._cooldowns.get(id) || 0;
    if (cd > 0) {
      return { ok: false, reason: `${entry.ability.name} is recovering — ready in ${cd.toFixed(1)}s` };
    }
    const cost = entry.ability.cost || 0;
    if (cost > 0 && !coreSystem.spend(cost)) {
      return { ok: false, reason: null };             // spend() already said why
    }
    this._cooldowns.set(id, entry.ability.cooldown || 0);
    eventBus.emit(Events.ASPECT_USED, {
      memory: entry.memory, ability: entry.ability, key: entry.label,
    });
    return { ok: true, entry };
  }

  update(dt) {
    if (!this._cooldowns.size) return;
    for (const [k, v] of this._cooldowns) {
      const n = v - dt;
      if (n <= 0) this._cooldowns.delete(k);
      else this._cooldowns.set(k, n);
    }
  }

  snapshot() {
    return {
      weapons: this.weapons.map(w => w && { id: w.id, name: w.name, grade: w.grade?.name, tier: w.tier }),
      activeSlot: this._active,
      held: this.held.map(h => ({ id: h.id, name: h.name, form: h.formName })),
      bar: this.bar.map(e => ({
        key: e.label, defaultKey: e.key, boundKey: e.boundKey,
        id: e.id, name: e.ability.name, from: e.memory.name,
        cost: e.ability.cost || 0,
        cooldown: this._cooldowns.get(e.id) || 0,
        maxCooldown: e.ability.cooldown || 0,
        element: e.memory.element,
        line: e.ability.line || '',
      })),
      overflow: this._overflow || 0,
    };
  }

  reset() {
    this.weapons = new Array(WEAPON_SLOTS).fill(null);
    this.held = [];
    this._cooldowns.clear();
    this._active = 0;
    this._rebuild();
  }
}

export const loadout = new LoadoutSystem();
