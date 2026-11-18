# Handoff — Project Mozzarela: "The Fracture"

**Read this whole file before touching code.** It's the project's only
source of continuity across sessions — git history and code-reading
will not reconstruct the reasoning behind non-obvious decisions, and
several bugs documented here have been independently re-discovered
more than once by sessions that skipped this file.

This file is organized for **fast orientation**, not chronology: the
top sections are a dense reference you should read in full every
session; the bottom is a session-by-session appendix you should only
dip into when you need the full story behind one specific decision.

---

## 1. What this is, in one paragraph

A first-person dark-fantasy RPG — **"The Fracture"** — built in vanilla
Three.js. The premise: the sky broke, an organization called the
Sanctuary sends "Pioneers" out to harvest what spills from the wound
and call it mercy, and the player picks one of two philosophies (Heaven
"the wound must close" / Hell "something wants it open") that visibly
re-colors the entire world. Infinite procedural terrain, 13 biomes,
real-time crafting/attunement systems, a 7-quest main story arc plus
3 side quests, dozens of enemy types, and — as of this session — a
literal visible crack across the sky and a live-rendered world behind
the menus instead of a flat loading screen.

**Two build targets, one codebase:**

| Target | Constraint | Command | Status |
|---|---|---|---|
| **Local HD build** | none — streams assets from `public/` | `npm run dev` | **the active target** |
| Claude Artifact | single HTML file, ~16MB cap, zero external requests | `npm run bundle` | kept working, not being optimized for |

The owner explicitly chose the local HD build as the focus. Don't
spend effort re-optimizing for the artifact's size cap unless asked.

**Where things are:**
- Game root: `/Users/shauryashah/AG/Project Mozzarela/game`
- Git repo root is `/Users/shauryashah` (the user's home dir) — a
  pre-existing quirk, not a bug to fix. The actual GitHub remote only
  ever tracked a placeholder README; this directory is the real source
  of truth, not git.
- Artifact URL: `https://claude.ai/code/artifact/cef54840-2356-415b-a6df-ae111678508c`
  — always pass this as `url` when publishing or it forks a new one.

**Run & verify:**
```bash
cd "/Users/shauryashah/AG/Project Mozzarela/game"
npx vite build      # fast syntax/import sanity check
npm run dev          # dev server — use the Browser pane's preview_start, name "mozzarela"
```
See §6 for how verification actually has to work in this environment
(it is not what you'd assume).

---

## 2. The Story Bible

Everything narrative, consolidated. Source of truth is `src/data/story.js`
(dialogue/lore text), `src/systems/QuestSystem.js` (mechanics),
`src/data/landmarks.js` (world locations), `src/data/paths.js` (the
Heaven/Hell choice). Read this section before writing any new
dialogue, quest, or location — the tone is specific and easy to break.

### Premise & tone

Original vocabulary, not a retelling of any other game: **the
Fracture** (the broken sky/wound), **Pioneers** (the player and
NPCs like them), **essence** (magic, harvested from the Fracture),
**attunement** (what element/philosophy shapes you), **the Doctrine**
(the Sanctuary's official line), **Saturation** (how "soaked" ground
gets with elemental residue), **the Mithril Core** (the arc's
macguffin, buried beneath the Sanctuary). Voice throughout is quiet
dread, not horror-game jump-scares — restrained, literary,
second-guessing. Every NPC has doubts about their own side.

Opening lines (`STORY_INTRO_LINES`, shown before character creation
commits):
> "The sky has been broken longer than anyone living can remember."
> "You are a Pioneer now — sent to harvest what the Fracture spills, and call it mercy."
> "Cast enough of one essence and it stops being a choice; it becomes what you are."
> "Heaven swears the wound must close. Hell swears something wants it open. Choose your attunement."

### The two paths (`src/data/paths.js`, `SKIES` in `Atmosphere.js`)

Chosen once, in character creation, and re-colors the ENTIRE game —
sky, fog, light rig, grade, UI theme (`data-path` attribute on
`<html>`), even the sky-rift's colour (see §4).

| | **Heaven — "The Ascendant"** | **Hell — "The Cinderbound"** |
|---|---|---|
| Reading | The Fracture is a wound to be closed. Light, order, preservation. | The Fracture is a door held open. Fire, appetite, what lies past the edge. |
| Starting elements | Light · Arcane · Ice | Fire · Shadow · Void |
| Sky | Washed grey-blue, bone horizon, "too bright to look at directly" | Bruised violet zenith, ember horizon, "the thing burning past the edge of the map" |
| Sky rift colour | Blinding white-gold (`0xfff6e0`/`0xffffff`) | Ember with white-hot core (`0xd94a1a`/`0xffe2a0`) |
| UI palette | Cream/gold, dark ink | Charred black, blood, tarnished iron |

### The main quest chain (mq1–mq7, `QuestSystem.js`)

Strictly sequential, one active at a time (`currentQuestIndex`).

| id | Title | Type | What | Now tied to a place? |
|---|---|---|---|---|
| mq1 | Awakening | explore | Leave the Sanctuary Hub | no — genuinely placeless |
| mq2 | First Blood, First Doubt | kill ×3 | Skeletons in the fields | no — genuinely placeless |
| mq3 | The Elder's Wisdom | talk | Elder Aris, in the Hub | **yes** — Aris is fixed at world (5,5) |
| mq4 | The Buried Shard | gather | A Mithril Core fragment | **yes** — The Sunken Foundations, (120,134) |
| mq5 | The Long-Attuned | talk | Ostra, in the wilds near the Hub | **yes** — Ostra fixed at world (-6,8) |
| mq6 | The Unmoored | kill (named) | Vell, an unmoored wraith | **yes** — Vell's Hollow, (-182,-198) |
| mq7 | What the Fracture Wants | talk → 3-way choice | Return to Aris, decide the Core's fate | same as mq3 |

mq7 doesn't auto-complete on talking to Aris like the others — it
opens a modal (`Events.QUEST_FINALE_CHOICE`) with three endings
(`FINALE_NARRATION.aris/self/ostra` in story.js), each with its own
reward and a permanent dialogue change from both NPCs afterward
(`ELDER_POST_FINALE`, `OSTRA_POST_FINALE`, keyed by
`questSystem.epilogueChoice`). None is "correct"; the game keeps going
after any of them.

### Side quests (sq1–sq3) — deliberately untracked

All three live from game start, discovered through world lore/NPC
dialogue rather than assigned, no dedicated HUD panel (by design —
see QuestSystem.js's own header comment). `sq2` ("What the Golems
Guard") is now flavor-linked to The Sunken Foundations landmark (a
named golem spawns there) even though mechanically it still progresses
on any golem kill anywhere.

### Named characters

- **Elder Aris** — the Sanctuary's authority. Forty years running it,
  increasingly unsure the "wound" metaphor is true. Fixed hub position
  (5,5). Dialogue gated by `currentQuestIndex` stage (`ELDER_DIALOGUE`
  in story.js, stages 0–5).
- **Ostra** — "the Long-Attuned." A former Pioneer whose attunement
  "stopped being a choice." Reads as a warning of what over-attunement
  does to you. Fixed position (-6,8). Same stage-gated dialogue
  pattern (`OSTRA` in story.js).
- **Vell** — the mq6 boss. A wraith "unmoored from itself" — doesn't
  speak coherently, so its intro/defeat lines (`VELL` in story.js) read
  as environmental beats, not quoted dialogue. Forged as a named
  unique out of the ordinary `wraith` template (typeIndex 5 in
  `ENEMY_TYPES`), 2.2× HP, 1.4× attack, 1.25× scale, `isBoss: true`.
  Spawns at Vell's Hollow the moment mq6 becomes active
  (`spawnVell()` in main.js).

### Landmarks — `src/data/landmarks.js`

Fixed, named, one-time-built places — as opposed to the infinite
hash-based scatter that fills the rest of the world (§4). This is the
mechanism that makes "go there" quests mean something. Built via
`ChunkManager._buildLandmarks(cx, cz)`, called on every chunk load,
one-shot-guarded, fires `Events.LANDMARK_DISCOVERED` (→ a
`showNotification` banner, and for Sunken Foundations, a guardian
spawn).

| Landmark | World pos | Built from | Ties to |
|---|---|---|---|
| **The Sunken Foundations** | (120, 134) | `STRUCTURES.dungeon` cluster + 4 ring `forgeRuin` pieces | mq4 (guaranteed Mithril Core Fragment pickup), sq2 (named golem "The Foundation Warden"), `foundation_masons_log` lore fragment |
| **Vell's Hollow** | (-182, -198) | 7 real dead-tree models in a ring + a `firepit` landmark model | mq6 (Vell spawns here) |
| **The Scar** | (-114, 238) | terrain-conforming emissive double-ribbon + `cliff_a` flanks + `forgeShard` growth + dead trees | nothing — a pure discovery, and the ground-level counterpart to the sky rift |
| **The Hanged Choir** | (244, -172) | broken 9-slot monolith ring (2 gaps) + 3 concentric arcs of `forgeGravemarker` + `firepit` | Ostra / the attunement-erodes-identity lore thread |
| **The Drowned Watch** | (-250, 78) | `fort` landmark model + `forgeTower` + a 4-segment curtain arc + collapsed `forgeRuin` + `_buildSupplyCache` | the "the Fracture's edge MOVES" lore thread |

Both sit just outside the Hub's 160-unit radius — the closest any real
wilderness location can be, given `isHub`'s `dist < 2.5` chunk
constant. **Adding a third landmark** (a natural next step for tying
more quests to places) means adding an entry here and a builder method
in ChunkManager, following the exact same pattern — do not invent a
parallel system.

**Adding a fourth+ landmark** is now a two-line change: an entry in
`landmarks.js` and a `_build<Name>()` in ChunkManager. The dispatch in
`_buildLandmarks` is a `{id: builder}` table (it was a ternary while
there were two), and it `console.warn`s and skips an id with no
builder rather than silently building the wrong one.

**The Scar's technique — read before touching it.** Three approaches
were considered and two rejected, for reasons that still hold:
- ❌ Modify the terrain height function. `getGroundY()` is flagged
  elsewhere in this file as the most performance-critical function in
  the game; a fixed-location depression means a bounds test on every
  call forever to serve one landmark.
- ❌ A carved chasm mesh over the terrain. The mesh and `getGroundY()`
  would then disagree about where the floor is, and physics believes
  `getGroundY()` — the player floats over the hole or falls through
  its lip.
- ✅ A ribbon that CONFORMS. Walk a jagged centreline, sample the real
  `getGroundY()` at every vertex, lay an emissive strip 12cm above it.
  The height field is never contradicted because it is never touched.

Two ribbons on one centreline, not one — a wide dim halo (`glowHex`,
0.55) with a narrow white-hot core (`coreHex`, 0.9) stacked 1cm above
it. A single flat strip reads as paint on the ground; the two-layer
falloff reads as light escaping a split. Both additive,
`depthWrite:false`, `toneMapped:false`, `renderOrder` 2 and 3.
⚠️ The lip crystals take `glowHex`, **not** `coreHex` — `forgeShard`
uses its colour argument as BOTH albedo and emissive, and the
white-hot value pushed through bloom turned every shard into a
blown-out white cone, which is exactly what §3's one-emissive-
focal-point rule forbids. Caught by screenshot, not by reading.

### ⚠️⚠️ SPELL SLOTS REMOVED — bindings replace them

Owner: *"remove all spell binds, and any echo, memory or woven memory
can be given a specific keybind to activate on the user's choice."*

The wand had **six fixed slots** addressed by Digit1–Digit6. You
"infused" a Weave into slot 3 and slot 3 was forever key 3. Three
things were wrong:

1. The player never chose the key — the mapping was the game's.
2. **Six**, a cap set by how many digits sit in a row on a keyboard.
3. Only Weaves could go on them. Echoes and Memories had no way to be
   used at all.

#### `systems/BindSystem.js` — key → thing

One registry for all three kinds, because the player does not
experience them as three systems; they experience "the thing on Y".
`kind` is a field, not an architecture. Persisted to localStorage as a
**preference** (it survives starting over, like a keyboard layout).

⚠️ **One thing per key AND one key per thing.** Without the second rule
a Weave could sit on three keys at once, which reads as a duplication
bug the first time a player casts it from two places and watches one
shared charge pool drain.

⚠️ **`RESERVED_KEYS` must match what the game actually reads.** `KeyR`
is DODGE and was missing from the first version — the panel happily
bound an Echo to it, which would have fired the Echo *and* the dodge on
one press and read as "dodge is broken" with no visible cause. The list
is now verified against every keydown listener in the project (
InputManager plus each panel's own), not written from memory.

⚠️ `_load()` skips any stored binding whose key has SINCE become
reserved — so adding a new game key in a later version cannot brick a
returning player's movement.

#### `systems/SpoilsSystem.js` — Echoes and Memories finally exist

⚠️ **They were designed and never built.** `REVENANT_BOUND` was emitted
by DescentSystem into nothing; `REMNANT_CLAIMED` was never emitted at
all. The vocabulary was in the handoff, the events were in the
EventBus, and the player could obtain neither.

- **Echo** — devouring a Descent binds its Warden. Calling it spawns
  that creature `friendly: true` for ~20s. A second Echo of the same
  Warden *stacks* rather than duplicating the list entry.
- **Memory** — sealing a Descent crystallises one, keyed by element
  (11 authored powers, one legible promise each — same rule the Ascent
  grants follow).

Deliberately asymmetric and tied to the two resolutions: you cannot get
both from one Descent, because you cannot both put a thing back and
keep it.

#### WandSystem: slots → a Map keyed by Weave id

`slots[]` (fixed length) → `held` (Map, uncapped). `infuse(index, x)` →
`hold(x)`. `activeSlot` (int) → `activeId` (string). Depth's slot grant
is kept only so AscentSystem's `slotBonus` is not orphaned.

`updateWandInput()` now walks `bindSystem.all()` instead of looping six
digit codes. Weaves channel on hold; Echoes and Memories are instant.

**Verified end to end:** bound Flamelance→Y, an Echo→U, a Memory→O,
then pressed each through the real input path — projectiles 0→1, a
friendly summon appeared, and MEMORY_USED fired. Reserved keys refused
with a reason shown to the player.

⚠️ Capture mode in `BindUI` swallows **every** keypress while waiting.
It has a full-panel overlay and Escape-to-cancel for exactly that
reason — without loud visible state, a player pressing J for the
journal would silently bind something to J.

### Generative runes, and potions removed entirely

#### ⚠️⚠️ The rune lookup table is gone — shapes are now DERIVED

Owner: *"the rune system is mid, the space is too less and doesn't
sustain."* Correct. It was a **14-entry exact-match lookup** on a
37-dot grid: draw one of fourteen signatures, get an effect; draw
anything else and get "this shape signs nothing yet". Roughly **99.6%
of drawable shapes were dead ends**, and the craft stopped sustaining
interest the moment you had found the fourteen.

Now the shape's own **geometry** produces the rune. Seven properties
are read off the drawn path, each owning ONE axis so they can be
learned independently by experiment:

| property | → |
|---|---|
| **length** | magnitude (damage up, cost per point down) |
| **winding** | curls *bind*, straights *pierce* |
| **closure** | containment, charges, steadiness |
| **chirality** | right = aggression, left = control/cheapness |
| **entropy** | instability, and `erratic` past 0.6 |
| **dominant turn** | the EFFECT FAMILY — lance / chain / burst / linger / drain |
| **symmetry** | a palindromic signature is stable: −30% instability |

⚠️ **The dominant-turn family is what actually makes the space large.**
Without it the derivation collapsed 17,184 distinct signatures into
**228** outcomes, because length/winding/closure/chirality are coarse
and correlated. Adding it (plus symmetry and focus) took that to
**674 distinct outcomes / 60 distinct effect sets** — and that is a
*sampled lower bound* (depth-7 paths from 25 start cells; the 91-dot
grid supports far longer).

Grid radius **3 → 5**, i.e. **37 → 91 dots**.

The 14 authored runes still exist as **True Runes** — exact signatures
with authored names, blurbs and bonus effects layered ON TOP of the
derived values. They are landmarks inside a continuous space, never a
replacement for it. UI marks them with the accent; derived runes get
their own generated name plus a plain-language read of what their
geometry does, so the rules are learnable by drawing.

⚠️ Name and blurb must read the SAME property. 'Straight' was keyed on
low ENTROPY while the blurb's "it curls / it runs straight" line is
keyed on WINDING — so a tight all-left spiral came out named "Straight
Withdrawing" while describing itself as curling. Verified across 3,900
sampled runes: **0 contradictions**.

#### Potions removed

`type: 'potion'` → `type: 'weave'`. There is no cauldron, no brewing
and no drinking anywhere in the player-facing game: the Loom, threads,
handlings, Cores and Weaves replaced all of it. `PotionSystem.js` keeps
its filename (it is the resolver, and renaming a verified module to
achieve a rename is the trade this project keeps declining) but every
string a player can see is weaving vocabulary.

### Fog returned as LINEAR, simplified sky, pixel ratio cut

Owner: *"still laggy, add back the fog, simplify the sky, make the fog
more unique and not block the player's vision."*

#### ⚠️ FogExp2 → linear Fog. This is the whole trick.

Exponential fog starts **at the camera** — density applies from zero
distance outward, so making it thick enough to hide the world edge
ALWAYS greys out what is directly in front of you. That is why
"everything is foggy" and "I can't see" were one complaint, and why
deleting it was previously the only way to get clear vision.

Linear fog has a **near plane**. Nothing closer than `near` is touched
at all. Measured at ultra:

| | |
|---|---|
| clear vision out to | **138m** |
| fog band | 138m → 184m |
| world edge | 192m |

So the fog does its real job — hiding the chunk boundary, which is what
lets render distance stay small and cheap — while never touching the
player's actual field of view. `_applyFogRange()` is the single writer;
`near` is clamped to never come closer than 18 units no matter how
thick the composition gets.

⚠️ Every contributor that used to multiply DENSITY now multiplies
THICKNESS, which pulls `near` inward. Biome, weather, Descent and
Sanctuary all still compose exactly as before — `far` stays pinned to
the world edge so the boundary is always covered.

#### Sky simplified

⚠️ The 2D haze noise is **gone**. Four `sin()`-based hash lookups per
sky fragment — and the sky is most of the screen — to contribute
±0.028 to the final colour, which is ~3/255 and genuinely invisible
against the gradient. Most expensive thing in the shader, least
visible. The crack's wobble also dropped from two octaves to one: the
second was ±0.07 radians of wiggle on a line ~0.01 radians wide, so it
moved the crack by less than its own thickness at double the cost.

#### Pixel ratio 1.5 → 1.25

⚠️ Every post pass is fullscreen, so cost scales with the **square** of
this number. 1.5 → 1.25 is a **31% cut in every fullscreen pass at
once** — a bigger win than any individual pass optimisation available.
Safe now that linear fog hides the edge again and SMAA reconstructs.

#### Result

Real frame loop (`engine.onUpdate` + `composer.render`) while walking:

| stage | median | fps |
|---|---|---|
| before this pass | 11.6ms | 86 |
| **after** | **5.7ms** | **175** |

Combined with the previous pass, that is ~22ms → 5.7ms standing still.

⚠️⚠️ Still true, still the most important line in this file: **this
environment cannot measure performance honestly** (§6). All numbers are
same-session relative comparisons. **PerfHUD (F3) on the owner's
machine is the only real measure — ask for p95, not fps.**

### ⚠️⚠️ THE LAG PASS — read before touching render settings

Owner: *"the game doesn't load after a point"* then *"THERE IS INSANE
LAGG."* Both were regressions I introduced by raising render distance,
plus one pre-existing cost that had never been measured.

#### 1. The boot hang — unbounded synchronous chunk build

`initGame` had `while (chunkManager.isStreaming) drainChunkQueue(1e9)`
— build EVERY queued chunk, synchronously, no budget. Survivable at
the old RENDER_DISTANCE of 1 (9 chunks); at 5 it is **121 chunks** and
the loading bar froze partway. The loop was still running, just for
minutes.

Now time-bounded (900ms), then `renderer.compile(scene, camera)` while
the loading screen is still up, then the rest streams through the
budgeted path. **Render distance pulled back to 2 / 3** (was 5–6).

#### 2. ⚠️ GTAO was over half the frame

Measured standing still at ultra, 835×987:

| | ms |
|---|---|
| scene render (RenderPass only) | **3.9** |
| full composer | **22.0** |
| composer with GTAO disabled | **11.5** |

GTAO alone was ~10.5ms — **2.7× the cost of drawing the actual world**.
Now runs at **half resolution**; AO is a low-frequency signal (soft
contact shading, not detail) so the blur carries it. 22ms → 12.3ms.

⚠️ `_syncRenderSize()` re-pins AO to full device res on resize. That
line now applies the same 0.5 factor — miss it and the optimisation
silently undoes itself on the first resize or adaptive-quality step,
looking like an unrelated regression.

#### 3. ⚠️ 34 live point lights, and the recompile storm

Braziers, shards, Gates and firepits each add a real PointLight;
measured **34 visible / 67 total**. Two costs, and the second is worse:
Three bakes the LIGHT COUNT into every shader program, so every time a
chunk with a brazier streamed in, **every material in the scene
recompiled** — one such frame measured at **667ms**.

`_updatePointLightBudget()` keeps the nearest **8** and hides the rest.
Holding the count CONSTANT is the point — that is what stops the
recompiles, not the fragment saving.

⚠️ It traverses the whole SCENE, not `decorationGroup`. Budgeting only
that group left 24 of 67 burning; prop lights live in several places.
The core rig is safe because the test is `isPointLight`.

#### 4. ⚠️ The shadow camera re-rendered the map every frame

Isolated per-stage while walking: `chunkManager.update` **0ms**,
`drainChunkQueue` **0ms**, render **21.1ms** vs 7.3ms standing still.
The whole difference was the key light: it tracked the player
continuously, and *any* shadow-camera movement invalidates the shadow
map, so the scene re-rendered into a 2048² VSM map with 16-sample blur
every frame of walking.

Now **snapped to a 6-unit grid** — the frustum is 58 units wide, so
6 units of slop is nowhere near its edge and nothing pops. Verified:
holds still for a 2u move, tracks 40u and 400u correctly.

#### Result and the honest caveat

Real frame loop (`engine.onUpdate` + `composer.render`) while walking:
**11.6ms median ≈ 86fps**, 5 of 60 frames over 33ms.

⚠️ Remaining hitches are **first-sight shader compilation** — a
material's program compiles the frame it first becomes visible, so
entering an unseen biome still stalls. `renderer.compile()` at boot
covers the spawn region only. The per-frame chunk budget was halved
(6ms → 3ms) to spread the rest.

⚠️⚠️ **§6 still applies: this environment cannot measure performance
honestly.** Every number above is a same-session relative comparison,
which is informative, but `document.hidden` suspends rAF and there is
no vsync. **PerfHUD (F3) on the owner's machine is the only real
measure — ask for p95, not fps.**

### No more paths, trait-driven skies, realm Descents, the Ascent menu

#### ⚠️ THE PATH CHOICE IS GONE

It was the first and "only irreversible" decision, made from two cards
before the player had done anything — which directly contradicted the
system that replaced classes. LeaningSystem exists so that what you ARE
is decided by what you DO; opening the game by asking you to declare it
undercut that on the title screen.

Everyone now starts Cinderbound as a starting POSITION, not a choice,
and the Leaning moves from there under play (including all the way
across). Character creation is Name + Disciplines. `setPath('hell')` is
called once in `setupUI`.

#### The world follows your dominant TRAIT, not a path

`TRAIT_SKIES` in Atmosphere — one palette per element, **blended over**
the base by that element's share of your profile. Cast light and the
world is bright and clear; cast void and it closes in.

⚠️ Blended, not swapped, and weighted by share: a scattered caster sits
near the base and only a committed one re-colours the world. A hard
swap would strobe the sky every time the dominant element changed
hands. `applyTrait()` also ignores sub-0.04 changes because `apply()`
**re-bakes the IBL cubemap** — calling it per frame unthrottled would
re-bake the environment map continuously.

⚠️ `fog` is a MULTIPLIER, and it is what makes lightbound read as
"bright and colourful, not foggy". Measured outside the hub:

| trait | fog density | exposure | zenith |
|---|---|---|---|
| light | **0.00126** | 0.88 | `#9fb8d8` |
| void | 0.00202 | 0.56 | `#120a1c` |

⚠️ Saturation is NOT a palette key — it lives on the CinematicGrade
pass (`uSaturation`, set by `applyGradePreset`). Writing a
`grade.saturation` field would add something nothing reads and look
like it worked. It is exposed as `atmosphere.traitSaturation` and
applied in `syncGrade()` **after** `applyGradePreset` — swap those two
lines and the trait does nothing.

⚠️ Inside the Sanctuary the trait colour is deliberately muted by the
hub's warm haze. That is correct (the hub is the safe warm place
regardless) but it means **trait colours must be verified outside the
walls** — measuring at spawn shows the sanctuary's warmth, not the
trait's.

#### Descents are a SEPARATE REALM now

They used to be a cylinder drawn around you at the Gate's own
coordinates — same ground, same sky. That reads as "an arena appeared",
not "you went somewhere", and the whole fiction is that a Gate is a
door.

You are now MOVED to a coordinate band ~500,000 units out, offset
deterministically per (element, tier) so the same Descent is the same
place every time and two can never overlap. Verified: overworld
(120,120) → **873,737 units away** → back to exactly (120,120).

⚠️ `chunkManager.realmMode` suppresses Gates AND landmarks while you
are down there. Both are placed by hashes keyed on distance from spawn,
and at realm coordinates every chunk qualifies as deepest-tier
wilderness — a Descent would otherwise be full of Descent Gates and you
could open one from inside another. Verified: 0 gates near the player
inside a realm.

#### The Ascent panel (K) — `ui/AscentUI.js`

⚠️ AscentSystem shipped with **no interface at all**. Two ladders, five
ranks each, Trials and grants were reachable only through a one-line
HUD readout and a rank-up toast. Owner's report was exact: "the shadow
slave menu doesn't exist."

Everything it renders already existed and was already computed —
`ascentSystem.requirements()` has always returned precisely the
"what is blocking me" structure, and nothing was asking it.

⚠️ Depth and Trial are shown as **TWO independent bars, never merged**.
The most confusing thing about this system is that Depth alone never
ascends anyone — grinding to Depth 500 in a field leaves you Unproven
forever, by design. One combined "progress to next rank" number would
actively lie about that. Verified showing Depth 130/40 met, Trial 0/1
unmet, with "Depth is not what you are short of."

### Weaving, drawn runes, and the render-distance fix

#### ⚠️⚠️ RENDER_DISTANCE was 1 — a 192-unit world behind a fog wall

`WORLD.RENDER_DISTANCE = 1` meant a **3×3 chunk grid, 192 units
across**, and `setDrawDistance()` computed a fog density fully opaque
at 88% of that — a curtain ~96m from the player's face. "Everything is
foggy", "the world feels small" and "reduce lag" were one bug.

Now tier-driven, and fog is aerial haze (half-strength at the far edge,
derived as `0.69 / targetDist` so raising the distance keeps the look).
⚠️ The floor became a **ceiling**: `Math.min`, not `Math.max`, in BOTH
`apply()` and the per-frame composition in `update()` — leaving one as
max while the other was min brings the curtain straight back one frame
later.

⚠️⚠️ **`renderDistance` and `decorationDistance` are two numbers on
purpose.** Terrain is ONE draw call per chunk; props are ~78 meshes per
chunk. Measured at ultra, counting only genuinely-visible meshes:

| decorationDistance | meshes | triangles |
|---|---|---|
| (none — one number) | **13,194** | **11.3M** |
| 3 | 3,628 | 3.5M |
| **2 (chosen)** | **1,895** | **2.4M** |
| 1 | 962 | 1.8M |

⚠️ `Object3D.traverse` does **not** prune hidden subtrees — a child
reports `.visible === true` under a hidden parent. That inflated the
first measurement 3.5× and nearly had me revert a working fix. Walk
manually and stop at invisible nodes.

#### Potions → the Ancient Craft of Weaving

Boiling reagents in a pot is a cosy-fantasy verb and sat wrong on this
game. Replaced with **Weaving** — `data/weaving.js` is a translation
layer over the *unchanged, verified* resolver:

    pot temperature → thread TENSION      ingredient → THREAD
    technique       → HANDLING            fragment   → CORE
    brew            → WEAVE               cauldron   → THE LOOM

Handlings: **Draw Taut · Give Slack · Ply · Let It Set · Sunder**.

⚠️ `BrewProcess` keeps its original op ids (`heat`/`cool`/`stir`/…)
internally **on purpose**. The chemistry is measured and order-dependent;
remapping ops to achieve a rename would mean touching it. weaving.js
holds the new names, the new fiction and the narration table.

#### Runes — you DRAW them (Hex Casting)

Grounded in two sources that agree: in the fiction runes are
*translated from string patterns*; mechanically the owner named Hex
Casting — a hex grid you drag dot-to-dot, unknown shapes being mishaps
rather than errors.

⚠️ Runes were FIRST built as matches on the handling-op sequence. That
worked and was measured — and it was wrong, because the rune was then
just a readout of what you had already done. There was no room for
creativity in it. Drawing is the whole point.

`RuneGridUI` is a 37-dot radius-3 hex field. Signatures are
**turn-relative** (`w` straight, `a`/`q` left 60/120, `e`/`d` right
60/120), which makes a sigil **rotation-invariant** — a deliberate
kindness, since demanding an orientation makes it a memory test.

Three bugs, all caught by enumerating rather than reading:
- **`ddd` was geometrically impossible.** A hex triangle closes after
  two 120° turns, so a third retraces the first edge. Shipped for one
  commit. Every rune signature is now verified drawable against a full
  enumeration of the grid.
- **`HEX_DIRS` was counter-clockwise while the comment and TURN_CODE
  assumed clockwise.** Signatures still came out unique, so nothing
  crashed — what broke was the *fiction*: every blurb saying "a hard
  turn right" described a shape that visibly bends left.
- **`_tryExtend` never checked the cell was ON the grid**, so a path
  walking off the field threw in `_redraw`. Unreachable by mouse (hit
  testing only returns real dots), instantly fatal to anything else.

**14 runes out of 3,601 drawable shapes** — that ratio is the design:
most shapes mean nothing, and a mishap is styled as ordinary, never as
an error.

### ⚠️⚠️ The VFX fix that fixed nothing the player could see

The pass below (element/catalyst animators) was real, correct, verified
by measurement — **and invisible in play.** Owner's report: *"the
animation is quite literally just a translucent hollow sphere."* They
were right. Three separate causes:

**1. The wrong cast path.** `WandSystem._spawnVisual` (where all the
animator work went) handles BREWED spells. The thing the player
actually casts is the class skill `fireball` →
`ProjectileManager.spawnFireball` in Projectile.js — a hardcoded core
sphere + translucent additive shell, always `0xff4411`, for every
element. Two cast paths had diverged completely and only one got the
work.

**2. `wandSystem.slots` was `[]`.** The wand shipped with **zero**
infused slots and nothing granted one. So pressing 1–6 said "Nothing
infused in this slot" forever, tutorial t3 ("cast three spells from the
wand") was **impossible to complete**, and the entire 1,380-spell
system was unreachable until the player found the cauldron unprompted.
`_giveStartingItems` now infuses one deliberately-weak starter Lance
built from the path's first favoured element.

**3. Additive + white core + bloom = a white blob.** Once routed
correctly, every element STILL rendered identically: additive blending
sums toward white by construction and bloom then smears past the
silhouette. The shapes were genuinely different and completely
invisible.

`buildSpellBody()` in SpellVFX is now the single shared builder for
both paths, layered **shape first, glow second**:
- **shell** — `MeshStandardMaterial` (NOT Basic: Basic has no shading
  and gave flat coloured stickers), opaque, depth-writing, strongly
  emissive so it stays self-lit inside a Descent where the key light is
  crushed to 45%. This is what carries the silhouette.
- **rim** — a darker BackSide shell at 1.14×, the cheap contour trick,
  so the outline survives a bright sky.
- **core** — additive, INSIDE the shell, tinted with the element's own
  colour rather than pure white. Bloom can only eat the core.

⚠️ **THE METHODOLOGY LESSON, which is the real one here.** The previous
pass verified `_spawnVisual` by calling it directly and diffing state
vectors. Every measurement was accurate and the conclusion was wrong,
because the function under test was not the function the game runs.
**Drive the player's actual input path** — press the key, read
`__mz.wandSystem.slots` — before believing any VFX result.

⚠️ And a repeat of §6's oldest trap: `await import('/src/systems/...')`
returned a DIFFERENT module instance, so `wandSystem.slots` read as `[]`
while the real instance had three. wandSystem/projectileManager/
potionSystem/questSystem are now on `__mz` for exactly this reason.

### Spell VFX — 1,380 identities had 5 animations

⚠️ `WandSystem._spawnVisual` built its mesh from the spell's **FORM
alone** — five shapes — and the only per-element variation in the entire
pipeline was `color`. A Fire Lance, an Ice Lance, a Void Lance and a
Poison Lance were visually one asset four times, and the 22 catalysts
contributed **nothing at all**.

`rendering/SpellVFX.js` composes the three axes the spell identity
already has:

| axis | contributes | owner |
|---|---|---|
| **Form** | base shape + gross motion | WandSystem (unchanged — it was never the wrong part) |
| **Element** | *character*: geometry, spin, how it behaves in the air | `ELEMENT_VFX` |
| **Catalyst** | a flourish for the behaviour it already grants | `CATALYST_VFX` |

⚠️ **Animators, not just geometry.** A different mesh per element would
still leave everything MOVING identically, and motion is what the eye
reads first at speed. Each element supplies a per-frame
`animate(p, dt, t)` and that is the half doing the work: fire rises and
gutters, earth *drops* (the only projectile with an arc), wind
corkscrews, ice holds rigid, lightning snaps to random rotations,
shadow smears and fades, void shrinks as it flies, light grows and holds
perfectly steady.

⚠️ Animators run per projectile per frame and must be **allocation-free**
— a Hunt volley at `over` tier is 6+ live projectiles. Use the module's
scratch `_v`, never `new THREE.Vector3()` inside one.

⚠️ **Trail bodies are parented to the SCENE**, not to the projectile, so
they can lag behind it in world space. That means removing the
projectile does NOT remove them — `_updateProjectiles` disposes them
explicitly. Missing this leaks a mesh per trail segment per cast,
invisible until a long session dies. Verified: 12 casts of a 3-trail
catalyst took the scene 43 → 91 → **43**, zero leak. (Trail geometry is
SHARED with the parent mesh — dispose the material only, never the
geometry twice.)

**Verified by full-state-vector comparison, not by eye.** Sampling
position xyz, rotation xyz, scale xyz, opacity, emissive and every trail
body's position over 30 frames at a fixed clock and seed:

- **11 / 11 elements distinct**
- **22 / 22 catalysts distinct**, none identical to no-catalyst

Two real bugs that only measurement caught:
- **`clear` was byte-identical to `earthed`** — both "hold still at base
  scale". Two catalysts that mean different things must not animate the
  same; `earthed` is flat and grounded, `clear` is now pristine (larger,
  brighter, slowly turning).
- **`blinding` dipped to emissive 0.8**, *dimmer* than the 1.2 baseline,
  so a spell called Blinding spent part of every cycle darker than an
  uncatalysed one. Floor must stay above base.

⚠️ A first pass gave flourishes only to the seven most kinetic
catalysts, reasoning that one which only changes mana cost has nothing
to show. That was wrong from the player's side: the catalyst is part of
the spell's NAME, so a "Proofed" spell looking exactly like an
uncatalysed one reads as the catalyst having failed. All 22 have a
signature now; the quiet ones are quiet, not absent.

### Scouting, the functioning grimoire, and the tonal split

#### ⚠️⚠️ "The dungeons cannot be located" — reachable ≠ findable

The nearest Descent Gate is **~210–230 units from spawn** and there are
**~89 within walking range**. They were never missing. But the journal
map only drew Gates whose chunk had already been **loaded** — i.e. ones
you had already walked past. That is circular: you could not find one
until you had found it. Since every single Ascent rank needs a survived
Descent, the entire permanent progression was unreachable by anyone who
did not happen to stumble into a Gate.

**Fix: scouting.** `gateForChunk(cx, cz)` / `gatesNear()` in
`data/descents.js` are pure hash math with no terrain dependency;
`ChunkManager.scoutGates()` resolves real positions from them without
building or loading anything.

⚠️ The hash math was **extracted, not copied**. It used to live inline
in `_generateDescentGate`, and the scout needs the same answer for
chunks that have never loaded. Two copies would drift the first time
either was touched, and the failure mode is a compass pointing
confidently at nothing. Both now call `gateForChunk()` and
`_gateSpotIn()`. **Verified: scouted position and built position differ
by 0.0000 units.**

Talking to **Gate-Warden Tove** runs the scout — knowing what is out
there is literally that character's job, so the mechanic and the
fiction are the same thing rather than a UI affordance bolted onto a
person. Verified: 0 known → 6 known, nearest reported at 208m SW.

New `#descent-compass` in the HUD: nearest un-sealed known Gate, name,
tier, distance and heading. Deliberately separate from
`updateQuestCompass` — that points at the active main quest's
destination and is silent when it has no place; this answers a
different and more frequent question and defaults to nearest rather
than requiring the player to pick a target first.

#### The grimoire now functions — it remembers HOW

⚠️ `discovered` was a `Set` of spell ids. It could say *which* cells you
had filled and had no way to say **how**, which is the one question a
grimoire exists to answer. With brewing now order-dependent
(BrewProcess) *and* catalysed, a player who brewed something excellent
by accident could not reproduce it — which turned the deepest part of
the system into a slot machine.

`potionSystem.recipes` (Map, id → recorded Working) stores the **first**
Working that produced each spell. First, not most recent: the first is
the discovery, and overwriting it with a later sloppier attempt would
quietly degrade the book. It stores the **step list**, not prose, so a
future "cook this again" button can replay it directly.

Two new tabs: **Recipes** (numbered ingredients with techniques
italicised and subordinate between them — you count reagents, not
actions) and **Catalysts** (the full 11 × cold/hot reference, shown
ungated: hiding a reference table behind the thing it explains teaches
nothing).

⚠️ **`isCellDiscovered()`, not `discovered.has()`.** A catalysed spell's
id carries a suffix (`fire_lance_arcing` — the catalyst is part of the
identity, see buildSpell). The matrix and fusion readouts build their
comparison ids *without* a catalyst, so a plain `has()` missed every
catalysed discovery and the grimoire reported "0 / 60" **immediately
after announcing a fusion**. Prefix-match anchored on the separator so
`fire_lance` cannot match `fire_lancet` — verified all four cases.

#### The tonal split, made mechanical

Owner's brief: *"keep the spawn normal and regular fantasy… but
battles, trials and all dark like a dark fantasy."*

Both halves are factors on the same palette values, so they can never
fight — walking a Descent open next to the hub correctly reads as the
dark winning, because 0.45 beats 1.95:

| | key light | ambient/hemi | dread vignette |
|---|---|---|---|
| Sanctuary | ×1.95 | ×1.35 | damped to 35% |
| open world | ×1.0 | ×1.0 | HP-driven |
| **Descent** | **×0.45** | **×0.55** | **floor 0.28 at full HP** |

Measured live entering a Tier 1 Descent: key **1.85 → 0.83**, ambient
**0.42 → 0.23**, vignette on at full health.

⚠️ The Descent floor does not go to zero. The visibility floor exists so
shadowed geometry is not a black hole — a fight you cannot see is not
atmospheric, it is broken. The element's own emissive light and the
boundary become what you navigate by.

⚠️ The vignette has a FLOOR inside a Descent rather than being purely
HP-driven: a Trial should read as a Trial before anything has hit you,
because the dread is the point of the place, not a response to damage.

### The smoothness pass — geometry, terrain normals, macro variation

Owner ask: *"maximise the graphics… making each part that looks blocky
into a smooth game surface."*

#### ⚠️⚠️ `seg()` and `icoDetail()` existed and EntityForge used them ZERO times

GeoForge's `seg()` doc comment says verbatim that "the base numbers
throughout PropForge/**EntityForge** were chosen for the artifact
build (5-12 segments)". EntityForge — the creatures and NPCs the player
looks at most closely — called it **0 times**. The helpers were written
for it and never wired in. 85 low-segment primitives and 10 detail-0
icosahedra were shipping raw.

**171 geometry calls** across EntityForge (117), PropForge (25), NPC
(21), Pickup (4) and Projectile (4) are now tier-aware. `low` is
untouched, preserving artifact parity.

⚠️ **`seg()` needed an absolute FLOOR, not just a multiplier.** The old
`base × 2.2` turned a 4-sided cone into a 9-sided cone, which still
reads unmistakably as a prism — the eye does not care that it doubled,
it cares whether it can *count the sides*, and below ~16 it can.
Anything plausibly radial is now lifted to 18 at HD, bounded by
`base × 4` so a deliberately-faceted crystal is not silently turned
into a cylinder. Measured lift at ultra: 6→20, 8→27, 12→41.

⚠️ **Two locals named `seg` shadowed the import**, and one was
referenced inside its own initialiser — a temporal-dead-zone
`ReferenceError` that crashed **every sandworm spawn**. Renamed to
`ring`/`bead`. If you add a `seg` local anywhere in these files it will
do the same thing silently until something spawns.

#### ⚠️⚠️ Terrain chunk seams — analytic normals

`computeVertexNormals()` averages the face normals of triangles **in
that geometry**. A vertex on a chunk edge only has triangles on one
side of it there — its neighbours are in a different BufferGeometry —
so its normal is computed from half the surface and comes out tilted.
The chunk next door makes the opposite error at the same world
position. Result: a hard lighting seam on a surface that is
mathematically perfectly smooth across it.

**This is the artefact no amount of resolution fixes** — raising the
resolution just makes the seams thinner.

Measured, same two chunks, same frame:

| method | worst seam disagreement | mean |
|---|---|---|
| `computeVertexNormals()` (old) | **11.43°** | 3.36° |
| analytic central differences (now) | **0.0195°** | 0.0065° |

The height field is analytic (same reasoning that killed the per-frame
terrain raycast), so the true normal is available exactly as
`(-df/dx, 1, -df/dz)`. Every chunk computes the same normal at the same
world position *by construction*, so the seams cannot exist.

⚠️ The epsilon is a fixed 0.75 **world units**, deliberately NOT a
fraction of `segSize`. The terrain's gradient is a property of the
world, not of how finely a chunk happens to be tessellated — using
segSize would make a `low` chunk and an `ultra` chunk disagree about
the shading of identical ground.

#### Macro variation — the distant-smear fix

A single-scale triplanar has one artefact it cannot avoid: invisible
tiling up close, a regular repeating pattern at distance. `applyTriplanar`
now takes `macro`/`macroMix` and samples the same texture a second time
at a much larger scale, folded into both albedo (broad luminance) and
normals (broad shading). Terrain runs `macro: 7.3, macroMix: 0.55`.

⚠️ **7.3, not 8.** An integer multiple puts the macro sample back *in
phase* with the base one every N repeats, which reintroduces exactly
the regular pattern the macro pass exists to destroy.

⚠️ `macroMix` is in `customProgramCacheKey`. The macro paths are
compile-time branches on a uniform; two materials differing only in
macroMix would otherwise share one compiled program.

#### Also in this pass

- **Soft/organic materials un-faceted.** `FACET_ORGANIC()` (= `!isHD`)
  already existed; robe, leather and weapon-wrap still hardcoded
  `flatShading: true`. That rig feeds the first-person viewmodel arms
  AND the character-preview panel — the most closely-looked-at geometry
  in the game. Iron/blade/edge keep faceting **on purpose** (beaten
  metal should catch light in flats — see ironMaterial's comment).
  `flatShading: true` in EntityForge: 9 → 4, all deliberate.
- **ultra `propDetail` 2 → 3**, which also crosses `seg()`'s 18-side
  floor and unlocks the wider shadow penumbra.
- **Shadow penumbra** tier-driven: radius 4→7, blurSamples 8→16 at
  ultra. Cheap under VSM (the moment texture is blurred once, not
  per receiving pixel).

⚠️ **Pixel ratio was NOT raised.** `ultra` stays capped at 1.5. §7
records it as the single most expensive setting in the game and the
owner reporting real lag at 2.0. Everything above buys smoothness with
triangles on cached geometries and build-time work — none of it is
per-frame fullscreen cost.

### Catalysts, peace mode, and the architecture material gap

#### Catalysts — 1,380 distinct spells, counted not claimed

The Working made the ROUTE to a spell matter, but every route still
landed in one of the same **55 cells** (11 castable elements × 5 forms).
Process changed the numbers on a spell; it could not change which spell
it was.

`data/catalysts.js` adds a third axis. A **fragment** (the Descent-only
crafting input) is NOT an ingredient — it does not vote on element or
form. It transforms the finished spell, and *which* transformation
depends on the pot's temperature when it goes in:

    spell identity = element × form × catalyst
                     12      × 5    × (1 + 22)

⚠️ **Counted by enumeration, not reasoned about**: sweeping
`buildSpell()` over every (element, form, catalyst) triple yields
**1,380 distinct ids and 1,380 distinct names**. Re-count rather than
quoting this comment — this project has been wrong about a distribution
five separate times by reasoning instead of measuring (§7).

Hot/cold rather than 22 separate fragments is what makes the fragment
and the TECHNIQUE interact: Fragment of Lightning cold → *Earthed*
(pierce + instant); the same fragment hot → *Arcing* (chain 3). Verified
live, along with Void cold → *Hollow* (mana 13→7) vs hot → *Devouring*
(dmg 23→37, charges 6→4).

⚠️ Several traps, all deliberate:
- Fragments do **not** count toward `addedItems`, so a pot holding three
  fragments and nothing else is correctly rejected (verified: returns
  null). But `isBrewable()` **does** accept them, because that gate
  decides what the shelf lets you pick up — two different questions.
- `isLast` (The Finish) skips fragments, so dropping one in at the end
  cannot steal the form bonus from the ingredient before it.
- Last fragment wins; they do **not** stack. Stacking would collapse
  the interesting decision ("which fragment, and do I heat first?")
  into "add every fragment you own."
- `catalystFor()` reads `item.isFragment`, never an id prefix — a
  prefix check would silently start matching a future item called
  `fragment_of_the_true_name`.
- The catalyst is folded into the spell **id**, so a catalysed spell is
  its own grimoire entry rather than the same one with different stats.

#### Peace mode (F6)

`enemySpawner.peaceful` suppresses the **ambient wander-spawner only**,
set at the owner's request so background enemies stop interrupting
testing. Defaults **ON**; `?peace=0` or F6 restores it, persisted in
localStorage like the quality override.

⚠️ It deliberately does NOT touch `spawnNamed()`. Descent waves,
Wardens, Vell and the Foundation Warden all come through that path, and
silencing them would make the entire Ascent loop untestable. The cull on
enabling also skips anything with `isNamed`/`isBoss` — killing a Warden
mid-Descent because the player pressed F6 would be a data-loss bug.

**Flip the default back to `false` when the testing pass is over** — it
is a one-word change in `_readPeacePref()`.

#### ⚠️ The architecture material gap — why "the graphics are still mid"

`PROP_SURFACES` in PropForge maps a material role → an HD texture set.
A role **absent from that table gets no textures at all AND keeps
flatShading**. Every material added for the Sanctuary (`keepstone`,
`keeptrim`, `gatestone`, `wellstone`, `wellwood`, `stallwood`,
`brazieriron`) was missing from it — so the keep was an untextured flat
colour no matter how much its geometry had been rounded. **Rounding a
silhouette and then handing it a flat colour fixes half a problem and
looks like fixing none of it.** If you add a new prop material, add it
here in the same commit.

Also fixed in the same pass:
- **The plaza floor** was `MeshStandardMaterial(0x3d3830)`, flat-shaded,
  9-sided. It is the single largest continuous surface the player ever
  looks at, and no amount of building detail compensates for the ground
  between them being blank. Now 48-sided (a 9-gon at 17m radius has
  visible straight edges across the square) with the stonewall
  triplanar at flagstone scale.
- **The Sanctuary ambient boost was too strong** (+0.9 ambient / +0.7
  hemi). Ambient is DIRECTIONLESS — raising it does not brighten a
  scene so much as flatten it, by lifting every shadowed face toward
  its lit one. Cut to +0.35/+0.30 and the key light raised to +0.95 to
  take over the job; warmth now comes from the key and the eight
  braziers, which have direction.
- **Keep relief** — plinth, two buttresses per face breaking each wall
  into three bays, a door hood, and steps. A prism with windows painted
  on still reads as a prism; depth across the facade is what reads as
  built.

### Collision, geometry, and The Working (brewing rework)

#### ⚠️⚠️ THE "I AM STUCK" BUG — three causes, all fixed

`Player._checkBuildingCollisions` had **three compounding faults**. Do
not simplify it back toward its old shape.

1. **Full revert.** Any overlap did `position.x = prevX; position.z =
   prevZ` — a hard stop, not a slide. Brushing a corner while running
   along a wall killed all movement; every wall was flypaper.
2. **No escape.** A full revert is *unrecoverable* if you are already
   inside a box: `prev` is inside too, so every axis is rejected
   forever and the player is frozen with no way out but a reload.
3. **Full-height boxes.** A prop's Box3 spans its whole height, so a
   monolith's flared base or a stall's awning blocked you at chest
   height where there was visibly a gap.

Now: per-axis resolution (slide along walls), **depenetration** if you
start inside something (push out along the shallowest axis), and a
vertical test — step over anything below 0.6m, duck under anything
above 1.85m. Verified: dropped dead-centre inside the keep, the player
escapes in **one frame**.

⚠️ **I caused one instance of this**: the Sanctuary well was placed at
(0, +1) and its roof's AABB covered the world origin, so a new player
spawned *inside* a collider. Moved to (+6, +6). Spawn is now verified
clear of every collider, and 7 of 8 compass directions walk the full
test distance (north is the keep, correctly).

`_addCollider(mesh, shrink = 0.25)` now insets the footprint by a
**fraction** of each horizontal half-extent (not a fixed metre value —
a 1m marker and a 12m keep need very different absolute insets), floored
at 0.18m so a thin prop can't collapse to zero width. Height is left
alone because the player's own test does the step-over/duck-under work.
Every one of the ~30 call sites now passes a tuned value: 0.05 walls,
0.5 stalls, 0.45 small hub dressing, 0.1 the keep.

#### Blocky graphics — the architecture half

GeoForge's header already answered "looks like Minecraft" for **natural**
props (subdivide + displace, pools of variants). It left the other half
untouched: every piece of **architecture** was a raw `BoxGeometry` with
perfectly sharp 90° edges — the strongest voxel/prototype cue there is.

New in GeoForge:
- **`roundedBox(w, h, d, radius, steps)`** — standard rounded-box
  construction (clamp to the inner box, push out by `radius`). A 2cm
  bevel on a 10m wall is invisible as a shape and unmistakable as a
  specular highlight. ⚠️ `computeVertexNormals()` after is not optional
  — the same trap `displace()` documents; skip it and the bevel is
  invisible except in silhouette, which looks exactly like "the
  rounding isn't working."
- **`weather(geo, {amount})`** — nudges vertices along the **surface
  normal** by a fixed metre amount, unlike `displace()` which works as a
  fraction of radius from a centre. Masonry has no centre; a fraction
  would wreck a 12m keep and leave a 1m block untouched.

Applied across PropForge: `BoxGeometry` count 10 → 3, tower cylinders
10 → 22 sides, brazier flame `IcosahedronGeometry(r, 0)` → detail 2 (a
detail-0 ico is a twenty-sided die — the exact thing GeoForge exists to
prevent), and every architectural cylinder bumped to 16–28 sides.

#### The Working — brewing is no longer commutative

⚠️ **`PotionSystem.analyze()` was fully commutative.** Element weights
add, form weights add, potency averages — so `fire + ice + salt` was
*exactly* `salt + ice + fire`, always. Three ingredients had exactly one
outcome, so the cauldron's entire skill ceiling was "own better
ingredients." That was the monotony.

`systems/BrewProcess.js` makes the pot a **vessel with state between
steps**. An ingredient contributes not what it *is* but what it is
*when it goes in*:

| | |
|---|---|
| **The Base** | first thing in gets a ×1.6 element dominance bonus |
| **The Finish** | last thing in gets a ×2.2 form bonus |
| **Heat** | amplifies the next addition, burns off purity |
| **Quench** | preserves purity and element identity, costs potency |
| **Stir** | trades instability for distinctiveness — blends toward the mean, so over-stirring makes mud |
| **Let It Stand** | volatiles evaporate; profile *narrows*, purity climbs |
| **Grind** | next ingredient: double essence, half clarity |
| **Scorch** (heat past 0.82) | not a failure — a different recipe space: ×1.25 potency, purity wrecked |

Verified live — **five different spells from the same three
ingredients**:

| Working | Result |
|---|---|
| A,B,C plain | Grasping Hands · shadow/hunt · inst 0.56 |
| C,B,A reversed | **Shadow Spike** · shadow/**lance** · inst 0.37 |
| B,A,C | **Gravewind Hunt** · **ice**/hunt |
| hot | pot 4.14, pur 0.31, inst 0.86 |
| stirred | pot 2.49, inst 0.25 (calm and weak) |
| let stand | pur 0.74 (clean) |
| scorched | pot **6.09**, pur 0.05, inst **1.00** |

⚠️ Fusion is gated on the brew being **calm** as well as balanced
(`!state.reaction`). A fusion is two elements held in agreement; a hot
violent reaction between the same two is the opposite, and letting it
fuse would make the reckless path strictly better than the careful one.

⚠️ `analyze()` is **kept and still works** — but is now implemented *as*
a Working (everything in, cold, no technique), so there is exactly one
chemistry implementation rather than two that drift. That default is
deliberately the dullest result the system can produce, which is the
honest translation of what the old system always did. `brew(items,
working)` takes the sequence; `_analyzeBag()` retains the original
resolver for reference.

CauldronUI records the sequence rather than a bag. ⚠️ Taking a reagent
back out removes the **last** matching ADD step, not the first — else
the recorded order stops matching what is in the pot.

### The Sanctuary — the safe spawn, the cast, the journal, the tutorial

Owner's ask: *"at the start, create a safe spawn like any other REGULAR
RPG, no fancy darkness... regular RPG castle, NPCs, quest system,
tracking system, quest side bar maps, dungeon tutorials."*

⚠️ **The hub's centrepiece used to be `forgeRuin(2.2)`** — "the hall
lost its argument with the Fracture a long time ago." It is now
`forgeKeep()`, an **intact** castle with lit windows, full
crenellations and no missing teeth. **This is a deliberate reversal,
not a regression to fix back.** Dread needs a baseline: the hub was
built from the same broken-masonry vocabulary as the wilderness, so the
place you spawn looked exactly like the place you are supposed to be
frightened of, and nothing landed. Everything else in PropForge is
still broken on purpose. This one building is not.

**Shelter is a factor, like every other atmosphere contributor.**
`atmosphere.setSanctuary(0..1)`, published each frame by main.js from
distance to spawn, eased over the last 40 units so walking out of the
gate is a gradual loss rather than a light switch. It composes into key
light (+65%), ambient (+90%), hemi (+70%), fog density (−55%) and fog
colour (warmed toward `SANCTUARY_HAZE`). ⚠️ It does **not** write
`fog.density` or `key.intensity` — HANDOFF §4's contract, broken twice
before. It also damps the unease flicker to zero and the dread
vignette/heartbeat to 35% inside the walls.

⚠️ `SANCTUARY_HAZE` is **not path-keyed**, unlike every other colour in
Atmosphere. The whole point of the hub is that it is the one place the
Fracture's argument is not being had; both paths walk into the same
warm room.

**New in PropForge:** `forgeKeep`, `forgeBrazier` (real PointLights —
the thing that actually makes the hub read as safe), `forgeWell`,
`forgeStall`. Eight braziers ring the plaza; that is the only place in
the game that spends that many real lights at once.

**The cast** (`data/sanctuary.js`) — Captain Hald (watch, gives the
tutorial), Quartermaster Bel, Smith Orren, Sister Merrow (alchemist),
Archivist Pell, Gate-Warden Tove. Everyone has one job and one voice,
and **nobody is mysterious** — that is deliberate. Ostra and the
wilderness read better against people who simply tell you where the
smithy is. ⚠️ Nothing in that file may consult LeaningSystem or
AscentSystem; those are the player's systems. A shopkeeper does not
have a philosophy.

**The tutorial** (`t1`–`t4`) is a **THIRD quest list** on QuestSystem,
alongside `quests` (mq1–mq7) and `sideQuests` (sq1–sq3). ⚠️ Deliberately
NOT prepended to the main arc — mq1 is "leave the Sanctuary," and
gating that behind a chore would make the player's first tracked
objective a checklist. It runs in parallel and is advanced by the verbs
it teaches (`NPC_INTERACT`, `PLAYER_ATTACK`, `SPELL_CAST`,
`DESCENT_ENTER`), not by talking to a quest-giver.

⚠️ `_progressTutorial()` is gated on the **active** quest's type, not on
any quest of that type. Without that, casting during t1 banks progress
toward t3 and t3 completes the instant it becomes active with no
explanation. Verified: the chain advances t1→t2→t3→t4 in order, and
casts fired during t1/t2 do not leak into t3.

⚠️ `NPC.interact()` now emits **two** events — `NPC_INTERACT` for every
NPC (the tutorial counts ordinary townsfolk) and `NPC_QUEST_TRIGGER`
only for the handful carrying a `questId`. Two events because they
answer two different questions.

**The training post** is a `harvestNode` with 9999 hp, not an enemy.
An enemy inside the walls would go through the whole combat pipeline,
and the Sanctuary's guarantee is that nothing in here fights back. The
huge hp means "swing five times" can't be completed by destroying the
thing you're being asked to swing at.

**The Journal (J)** — `ui/JournalUI.js`. Quest sidebar (tutorial / main
arc / side quests, with completed ones kept — a log that hides finished
quests is a to-do list, not a journal) plus a local map.

⚠️ The map is a **2D canvas painted from world coordinates, NOT a
second three.js view.** A render-to-texture minimap needs its own
camera and pass, in a project where §4 records the render pipeline as
the dominant cost. A canvas costs nothing while the panel is shut,
which is almost always. It draws only what is *true*: hand-placed hub
features exactly, the Sanctuary's safe radius, NPCs, **discovered**
landmarks only (plotting an undiscovered one hands over the exploration
it exists to reward), and Descent Gates whose chunks have loaded. The
infinite wilderness is not drawn because there is nothing there to draw
that would be true.

⚠️ Side quests appear in the Journal and **only** there. QuestSystem's
header explains they were deliberately given no HUD panel — a panel you
chose to open is not the same intrusion, so this honours that intent;
adding them to `#quest-tracker` would not.

### Leaning — the class replacement (Ascendant ↔ Cinderbound)

⚠️ **THERE IS NO CLASS.** The picker is gone, `data/classes.js` is dead
code (kept only for its `skills` arrays, with a header saying so), and
`Player.playerClass` no longer exists. Owner's ask: *"instead of me
choosing the class at the start, make the actions taken change the
outcome."*

**There are now three questions about the player, with three different
lifetimes.** Collapsing any two into one number is what made
progression illegible before; keep them separate:

| System | Question | Lifetime |
|---|---|---|
| `AttunementSystem` | what element you are **made of** | fluid, **decays** |
| `LeaningSystem` | which philosophy you are **enacting** | drifts, partly permanent |
| `AscentSystem` | how far down you have **been** | permanent, never falls |

**The Leaning** is −1 (Cinderbound) … +1 (Ascendant), shown as a live
two-ended HUD bar with a marked midpoint. Computed from two halves:
- **Deeds** — irreversible acts, never decay: the opening declaration
  (±0.40), sealing/devouring a Descent (±0.15), the mq7 finale (±0.30).
- **Residue** — *derived live* from `attunement.elementShares()` via
  each element's path affinity. Decays because attunement does.

⚠️ The residue half is **derived, never stored**. AttunementSystem is
already the authority on what you have been casting; a parallel counter
would drift out of agreement the first time anything touched one and
not the other.

⚠️ **`elementShares()` returns `{ id, value, share }` — NOT `element`.**
Destructuring `{ element, share }` compiles, runs, and yields
`undefined` for every entry, so `ELEMENT_ALIGNMENT[undefined]` is always
undefined and the entire residue half silently contributes **zero**,
forever, with no error. This shipped that way. It was caught only by
printing the bar before and after a total change of cast element and
seeing the percentage not move — while the emergent NAME (which reads
`dominantElement()`, a *different* accessor) did change, which made it
look like the system was working.

⚠️ water / earth / lightning are **deliberately absent** from
`ELEMENT_ALIGNMENT` — they belong to neither side. They still count
toward the denominator, so a Pioneer casting only unaligned elements
sits at exactly 50/50, "Untried", with no bonuses. Verified.

**The path card is now a starting LEAN, not an identity.** It seeds the
bar near 70/30 and play can push you all the way across; crossing
re-keys the entire world (sky, fog, light rig, IBL, UI theme) via
`LEANING_CROSSED`. ⚠️ There is **hysteresis** (`CROSSOVER = 0.08`), not
a `> 0` test — without it a Pioneer near the middle re-bakes
EnvironmentIBL on every cast that nudges them across zero.

⚠️ `LeaningSystem` deliberately does **not** import `paths.js` and does
**not** call `setPath()`. It emits; main.js acts. paths.js reaches into
Atmosphere and AscentSystem, and importing it from a system main.js
builds early is the deferred-init trap (§3).

⚠️ `AttunementSystem` must **not** import `LeaningSystem` — Leaning
imports Attunement, so that would be a cycle whose two singletons
construct in an order neither file controls. It was written that way
once and inverted: the Leaning instability factor is applied at the one
place the surge is actually ROLLED (WandSystem's cast path), which is
also more honest, since `selfSurgeChance()` only feeds a UI readout.

**What the Leaning changes** (Cinderbound = power bought with
instability; Ascendant = efficiency, reach and control; both beat
sitting at 50/50, which is the intended shape):

| | at full commitment |
|---|---|
| `damageMultiplier()` | Cinderbound up to ×1.30 |
| `manaCostMultiplier()` | Ascendant down to ×0.75 |
| `instabilityMultiplier()` | Cinderbound ×1.45, Ascendant ×0.80 |
| `reachMultiplier()` | Ascendant ×1.18 (projectile speed) |
| `tint()` / `calling()` | wand + player light colour, emergent name |

⚠️⚠️ **PLAYER ONLY. NPCs and enemies are regular.** Every consumer is
gated at its call site — the COMBAT_HIT handler checks
`data.source === 'player'`, because that event also carries
enemy-on-player and reaction damage, and scaling those by the *player's*
philosophy would make every skeleton inherit it. Verified live at 100%
Cinderbound: player→enemy 100 became **130**, while reaction→enemy and
enemy→player both stayed at exactly **100**.

### The Ascent, Descents, and the Shadow-Slave-inspired layer

Added this session at the owner's ask ("make the game extremely similar
to Shadow Slave, but keep different names of everything"). Vocabulary
choice was confirmed with the owner: **Fracture-native**, reusing the
game's own register (Pioneer / Fracture / Doctrine / Saturation).
Nothing is lifted; the mapping is:

| Shadow Slave | Here | Where |
|---|---|---|
| Nightmare | **Descent** | `data/descents.js`, `systems/DescentSystem.js` |
| Rank ladder | **The Ascent** | `data/ascent.js`, `systems/AscentSystem.js` |
| Memory (gear) | **Remnant** | named + designed, **NOT built** |
| Echo (summon) | **Revenant** | event fires on devour, **no summon system yet** |
| Name / Title | **Epithet** | named + designed, **NOT built** |
| Aspect | **Facet** | named + designed, **NOT built** |

**The Ascent** — the permanent progression, the counterpart to
Attunement. Attunement answers *what are you made of right now* and
DECAYS on purpose; the Ascent answers *how far down have you been* and
never moves backward. Both are needed; neither replaces the other, and
they are shown as two separate HUD lines for exactly that reason.

⚠️ **The one rule that matters, and the most likely thing for a future
session to "helpfully fix":** Depth alone NEVER ascends anyone.
`tryAscend()` requires Depth AND a cleared Trial, and when only Depth is
met it deliberately does nothing except emit `ASCENT_BLOCKED` so the UI
can say why. Grinding to Depth 500 in a field leaves you Unproven. The
refusal IS the mechanic. Do not turn it into a plain threshold check.

**The two ladders genuinely diverge** (owner chose "trial-gated +
divergent" over the cheaper options):

| | Ascendant — Ladder of Refinement | Cinderbound — Ladder of Appetite |
|---|---|---|
| Trial verb | **seal** the Descent | **devour** it, leave it open |
| Creed | Every rank is a subtraction | Every rank is an addition |
| Ranks | Kindled → Tempered → Hallowed → Radiant → Sovereign of the Closing | Ashmarked → Sated → Blackened → Ruinous → Sovereign of the Open Door |
| Grants give | control (less cost, less instability, resistance, regen) | reach (damage, lifesteal, a free wand slot, harder surges) |

Same dungeons, opposite win conditions. **Taking the verb your ladder
doesn't count is allowed, not blocked** — you still clear the place and
still get fragments, you just bank no Trial, and
`AscentSystem.recordTrial()` says so out loud. That is the cheapest
possible way to say the two philosophies aren't interchangeable, and it
is verified working (a Cinderbound sealing a Descent: 4 fragments paid,
`trialBanked: false`, no Revenant).

⚠️ `GRANT_KINDS` in AscentSystem declares per key whether a grant
MULTIPLIES or SUMS across ranks. `damageMult` and `lifesteal` look
equally numeric at a call site; getting the composition backwards
silently halves or doubles a build. Always pass the identity for the
key's kind as `grant()`'s fallback (1 for multipliers, 0 for sums).

**Descents** — element-typed dungeons, one archetype per castable
element (11). ⚠️ They are a **bounded REGION, not rooms**: you touch a
Gate and the world within a radius re-lights in the element's colour,
the boundary becomes visible, and what lives inside is element-attuned.
This project has no modular interior kit and never fetched one (§7);
this designs around that limit rather than papering over it. Lifecycle:
`waves → warden → resolving → resolve()`. Killing the Warden does NOT
end it — it opens the seal/devour choice. Dying or walking out aborts
with **nothing**: no Trial, no fragments.

**Descent Gates** are placed by `ChunkManager._generateDescentGate()` on
their own independent hash — deliberately NOT folded into
`_generateWildernessStructures`, whose modulus arithmetic is
load-bearing and was got wrong once already. Two things were verified
by COUNTING, not by reading (per this file's five-strikes history):
- all 11 elements reachable and near-uniform (146–149 each over a
  121×121 chunk sweep) — no correlated-modulus bug;
- tier uses explicit distance **BANDS** `[9, 18, 30, 46]` chunk radii,
  not a linear divisor. The linear form reads fine and is wrong for an
  infinite world: area grows as r², so a constant step made 79% of all
  Gates tier-5 and tier stopped carrying information.

Gates also search 9 deterministic candidates for the flattest footprint
(analytic `getGroundY()` samples, never a raycast) — a blind jittered
drop buried the doorway in the first hillside, confirmed by screenshot.

**Element fragments** (`fragment_fire` … 11 of them, in `MATERIALS`) are
the payout, and the ONE crafting input that cannot be foraged, farmed or
dropped. ⚠️ They are deliberately NOT `isIngredient: true` — putting
them in the cauldron pool would quietly make Descents the healing-potion
supply line, the opposite of the intent.

**Still to build** (named and designed, not implemented): Remnants,
Revenants beyond the bind event, Epithets/Facets, and the potion rework
proper (`PotionSystem` itself is untouched — fragments are merely
excluded from brewing so far).

### Lore fragments (12 found-journals, `LORE_FRAGMENTS` in story.js)

Environmental storytelling, one-time pickups placed at fixed hub-area
positions (`LORE_SPAWN_CHUNKS` in ChunkManager.js — all within the hub
radius, unlike the quest landmarks above). Recurring threads worth
knowing before writing more: attunement erodes identity ("the shape
holds; the person inside it doesn't always"), the Fracture's edge
*moves* and tracks toward wherever Pioneers are thickest, something
was built under the Sanctuary before the Sanctuary was ("whatever
raised the golems down there raised them to keep something in"), and a
child's counting-rhyme nobody will explain the origin of. The
`foundation_masons_log` fragment is the one now literally backed by a
real location (Sunken Foundations).

### Classes & elements (character creation)

8 classes (`src/data/classes.js`): Vanguard (earth/greatsword), Shadow
Walker (shadow/dual daggers), Arcanist (arcane/staff), Ranger
(wind/longbow), Paladin (light/mace&shield), Beastmaster
(poison/whip), Duelist (lightning/rapier), Hexblade (void/cursed
blade). 11 elements total (`ELEMENTS` in constants.js): fire, water,
wind, earth, ice, lightning, shadow, light, void, arcane, poison (+
salt, inert). Each has a hand-drawn stroked-SVG glyph in `Sigil.js`
(§3) — classical alchemical symbols where one exists, extended in the
same visual language where it doesn't.

---

## 3. Art Direction & House Style

`style.css`'s own header names it: **"A Grimoire Bound in Iron" —
alchemical manuscript structure, Diablo-weight chrome.** This is a
deliberate, documented design system, not an accident — respect it
even when a screen looks plain, and fix plainness by using its own
vocabulary more, not by breaking its rules.

**The four house rules, stated verbatim in style.css:**
1. No border-radius. Corners are cut or square, never soft (except
   true circles).
2. No `backdrop-filter`. Panels are solid objects, not frosted glass.
3. No gradient fills on controls. Ink is flat; depth comes from rules,
   insets and hard shadow.
4. Ornament is stroked geometry (`ui/Sigil.js`), never texture.

**Palette tokens** (both paths define the same variable names,
different values — see §2's table): `--chrome`/`--chrome-bright`
(tarnished gold / gold leaf), `--accent` (dried blood/red), `--ground`,
`--panel`, `--ink`/`--ink-dim`, `--backdrop`/`--backdrop-rgb` (the
latter added this session specifically so full-bleed screens can be a
translucent scrim over the live world instead of a solid wall — see
§7's latest entry).

**The ornament vocabulary** (`src/ui/Sigil.js`) — all stroked SVG,
`currentColor`, no images ever:
- `sigil({element, form})` / `elementGlyph(element)` — the alchemical
  glyphs, composed per-spell from element × form.
- `cornerFiligree()` — four rotated L-shaped corner flourishes for a
  panel frame. Was used only in the in-game HUD (WandUI) until this
  session; now also on character-creation's path cards.
- `ruleOrnament()` — a horizontal rule with a diamond centre-mark, for
  section breaks. Was defined and **never used anywhere** until this
  session (now under the character-creation title).
- `vesselMark()`, `wandMark()` — bespoke icons for specific UI (the
  cauldron, the equipped-wand indicator).

**Other established, verified-deliberate conventions** — do not "fix"
these without a concrete reason:
- **PBR throughout** (`MeshStandardMaterial`). `SceneManager.js`'s
  `createToonMaterial()` name is a vestige from an old toon-shading
  pass; it builds PBR materials now.
- **Emissive focal point per object, not uniform brightness.** Every
  creature/prop gets exactly ONE glowing accent (a strain-readout
  core, a rune, a tower's window slit), everything else stays dark.
  This is deliberate contrast, not inconsistent lighting.
- **Deferred-init pattern for scene-graph singletons.** `ModelLibrary`,
  `ParticleBursts`, etc. have empty constructors + explicit
  `init()`/`preload()` called at the right point in `main.js`'s
  `initGame()`, because module-level singletons construct at import
  time, before `sceneManager.init()` has run. This bug class has been
  hit and fixed multiple times — don't reintroduce it in a new
  singleton.

---

## 4. Rendering & World Architecture

### Quality tiers — `src/rendering/Quality.js`

`quality.tier` ∈ `low | medium | high | ultra`, auto-detected from a
GPU sniff, overridable with `?q=<tier>` (sticky in localStorage) or
**F4 in-game** (see PerfHUD, §6). `low` is exact parity with the
Claude Artifact build — verified byte-for-byte-equivalent pass chain,
resolution, and asset set. Everything HD-only is gated behind a tier
check or an "did the asset actually load" check, and degrades rather
than throws.

Current default pixel-ratio caps (lowered after real lag reports —
see §7): low 1.3, medium 1.25, high 1.35, ultra **1.5** (was 2.0 — at
2.0 on a retina panel the backbuffer was 5.2 **megapixels** through six
post passes, the single most expensive setting in the game). Apple
Silicon auto-detects to `high`, not `ultra` (base M-series shares
memory bandwidth with the CPU; this pipeline is bandwidth-heavy).

### The render pipeline, in order

```
RenderPass → GTAO → Bloom → GodRays → OutputPass → CinematicGrade → SMAA
```

- **GTAO** — screen-space AO between separate objects (complementary
  to, not duplicate of, the triplanar material's own `aoMap`, which is
  occlusion *within* one surface).
- **GodRaysPass** (`src/rendering/GodRaysPass.js`, written for this
  project — Three ships none) — luminance-threshold volumetric
  scattering. Works *because* this game's dark silhouettes against a
  bright sky make the cheap version of the effect look correct.
- **OutputPass** — ⚠️ **load-bearing, do not remove or reorder.** See
  §7's tone-mapping entry: three.js only applies tone mapping /
  colour-space conversion when rendering to the DEFAULT framebuffer,
  never to a render target — so without this explicit pass, ACES
  filmic tone mapping and sRGB encoding silently do nothing at all
  whenever a composer is in play. This was the single largest
  image-quality bug in the project's history.
- **CinematicGrade** (`src/rendering/CinematicGrade.js`) — chromatic
  aberration → filmic contrast → shadow crush → highlight roll →
  split-toning → saturation w/ vibrance floor → vignette → black lift
  → grain. ⚠️ Split-tone tints MUST be luma-normalized
  (`tint / dot(tint, LUMA)`) before multiplying — the naive `col *
  tint` multiplies BRIGHTNESS, not hue, and once made the whole game
  unplayably dark while looking like a pure colour operation in source.
- **SMAA**, not FXAA, at HD tiers (FXAA was softening texture detail
  that now actually exists).

### The sky — `src/rendering/Atmosphere.js`

Owns sky, fog, light rig, grade — all keyed by `SKIES.hell` /
`SKIES.heaven` palettes, applied via `atmosphere.apply(pathId)`
(called by `setPath()` in `data/paths.js` on every path-card click —
this already existed and now has something visible to change, see §7).

**The sky rift** (added this session) — a jagged emissive crack
running across the sky dome, present at all times, colour-keyed per
path (§2's table). This is the literal visual payoff of the game being
named "The Fracture" — the sky had never actually depicted a break
before. Implementation: `SKY_FRAG`'s fragment shader builds an
orthonormal frame around a fixed `uRiftAxis` (tilted, never re-set per
frame — the crack's position is part of the world's identity), derives
an angle-along and angular-distance-from coordinate pair, and bends the
centreline with two octaves of 1D noise for jaggedness. Bloom picks up
the emissive brightness for free; no changes needed to GodRaysPass.

**Fog/light multiplier contract** — `scene.fog.density` and
`key.intensity` each have EXACTLY ONE writer: `Atmosphere.update()`.
Everything else (biome, weather, draw distance, unease) publishes a
*factor*, never writes the field directly. This was arrived at by
hitting the failure twice (weather and biome both used to write
directly and silently erase each other). **If you add another fog or
light contributor, publish a factor. Do not write the field.**

**IBL** (`EnvironmentIBL.js`) — no HDRI shipped; instead the game's OWN
sky dome is rendered to a cubemap and PMREM-convolved, so reflections
always match the visible sky and re-bake free on path/sun change.
Ground hemisphere of the bake is a dark disc tinted by the path's
terrain colour (prevents "floating over a lightbox").

**Weather** (`Weather.js`) — autonomous state machine, hell→ashfall,
heaven→rain, one `THREE.Points` (4200 particles, one draw call,
positions computed entirely in the vertex shader). Visual only —
doesn't touch audio, movement, or enemy AI yet (`weather.condition`
0–1 is exported for exactly that future hook).

### Terrain — `TerrainGenerator.js` + `ChunkManager.js`

Chunk-based infinite world, `CHUNK_SIZE=64`, resolution tier-driven
(`chunkResolution`: low 24 → ultra 72 vertices/edge — NOT the
constants.js default of 24, which only applies at `low`). Height is 7
noise layers (continent, mountain ridge, plateau, local roughness, fine
detail, crags, and a micro-relief layer added this session whose
frequency is *derived from vertex spacing* with a hard 4-samples-per-
wavelength floor — hardcoding it back to a fixed wavelength caused
visible aliasing/corduroy ripples last time). 13 named biomes plus a
hardcoded flat "Sanctuary" override within `dist < 2.5` chunks of
spawn.

**Ground height is ANALYTIC, never a raycast.**
`ChunkManager.getGroundY(x,z)` evaluates the height function directly
— O(1), exact, works even where no chunk is loaded. This replaced a
`Raycaster.intersectObject(terrainGroup)` that ran once per frame per
entity against a 93,000+-triangle mesh and was, once photoscanned
props pushed `decorationGroup` to ~600k triangles, the dominant cost in
the whole update loop. **Any new entity needing ground height must
call `getGroundY()`. Do not raycast the terrain — this is flagged in
the code itself as "the single most performance-critical function in
the game."**

**Real geometry, not procedural, for rocks/trees** — 22 CC0
photogrammetry scans from Poly Haven (`tools/fetch-polyhaven-models.mjs`,
→ `public/hd/nature/*.glb`, gitignored/regenerable), decimated from
scan density (up to 98k triangles) to game budgets (~2k) because the
visible detail lives in the normal map, not the silhouette. ⚠️ Weld
BEFORE simplify or meshoptimizer quits early on seam-split
photogrammetry topology. Models ship at real-world scale (a "boulder"
is genuinely 3–5m) — every nature model has a `targetHeight` range in
`natureModels.js` and gets measured+scaled per instance, with the
caller's own scale argument DAMPED (not applied raw) to avoid
double-applying size variation.

**Structures** — a `STRUCTURES` data table (camp/stall/shrine/smithy/
dungeon/graveyard, `ChunkManager.js`) plus procedural `forgeRuin`/
`forgeMonolith`. ⚠️⚠️ **For most of the project's life these only ever
generated within the Hub's 160-unit radius** — every call site lived
inside one hub-gated function despite doc comments describing
"wilderness structures" as already working. Fixed this session with a
separate `_generateWildernessStructures()` path, ~1-in-3 chunks
anywhere in the infinite world, weighted toward "abandoned" kinds. If
you add a new structure kind and only wire it into the data table, it
will NOT appear in the wilderness — it must be wired into that
function specifically.

**Castle** — no modular architecture asset exists (checked both the
local MegaKit and the fetched Poly Haven set; neither has one) — built
procedurally from Box/CylinderGeometry with the same HD triplanar
`stonewall` material `forgeMonolith` uses, plus mild displacement and
crenellations with randomly-missing teeth (`forgeWallSegment`/
`forgeTower` in PropForge.js). Rings the Hub plaza at radius 28,
**deliberately NOT a sealed ring** — a closed collider ring around the
hub risks trapping the player permanently if the closure math is ever
wrong; broken arcs have no closure to get wrong. Don't "finish" it
without first proving a walkable gap from both sides.

### The menu backdrop — `startMenuBackdrop()` in main.js

Added this session. The Sanctuary is fully built and sitting in GPU
memory by the time the loading screen appears (chunk 0,0 is built
eagerly, synchronously, behind it) — nothing was ever painting it to
the canvas until now. A lightweight standalone render loop (NOT the
real game loop — no player, no HUD, no enemies) drives a slow cinematic
orbit around the Hub, calls `atmosphere.update()` + `composer.render()`
each frame, and is stopped (`_menuBackdropStop()`) the instant
`engine.start()` takes over the same camera. This is what makes
`setPath()`'s existing `atmosphere.apply()` call on path-card click
finally visible — clicking Ascendant/Cinderbound now visibly re-lights
the whole world behind the character-creation cards in real time.

The three full-bleed screens (`#loading-screen`, `#character-creation`,
`#story-intro`) now use `rgba(var(--backdrop-rgb), α)` instead of solid
`var(--backdrop)`, so the live world shows through as an atmospheric
scrim rather than being hidden behind a flat wall — see §3 for why this
doesn't violate the "no backdrop-filter" house rule (it's a flat tint,
not a blur).

---

## 5. Systems & Assets Reference

### Combat animation

`Hit_A`/`Death_A` clips are wired (`EntityForge.js`:
`playCreatureHit()`, `playCreatureDeath()`, `tickCreatureMixer()`).
Two non-obvious things made this work: (1) `Enemy.update()` early-
returns for dead enemies, so nothing ticks the animation mixer after
death — `_die()`'s fade-out loop now calls `tickCreatureMixer()`
itself; (2) do NOT null `_animKey` when a hit-reaction window expires
— `_crossfadeTo()` fades out `actions.get(_animKey)`, so nulling it
means `Hit_A` never fades back out and stays at full weight forever.

### Asset pipeline

Three embedded-registry source dirs under `assets-src/` (`models/` →
`model:`, `items/` → `item:`, `atlas/` → `atlas:`→expands to `prop:`),
regenerated via `node tools/embed-models.mjs`. ⚠️ **The meshopt
decoder gap**: for most of this project's life every real (non-
procedural) model silently failed to load and fell back to procedural
geometry, because `ModelLibrary.js`'s GLTFLoader never had
`setMeshoptDecoder()` called on it — and GLTFLoader's failure mode for
this is `console.warn`, not a thrown error, so it went unnoticed
across several "done" reports. Fixed; if something that should be
visually obvious isn't showing up, check `read_console_messages`
**without** `onlyErrors` filtering.

**Photoscanned nature models** are fetched over HTTP
(`ModelLibrary.preloadExternal`), not base64-embedded — no reason to
pay the 33% inflation + synchronous decode cost in a build with no
size constraint. Grime pass (darken/desaturate KayKit's toy colours)
is OFF for these — applied to a photoscan it would destroy the exact
quality being bought.

⚠️ `@gltf-transform/cli` is installed `--no-save --offline` — not in
package.json. A fresh `npm ci`/`npm install` will silently remove it;
reinstall with `npm install --no-save --offline @gltf-transform/cli@4.4.2`.

### Item lookup — two different tables, don't assume which

`MATERIALS` (materials.js) is the general item registry. `DROPS`
(same file) is a PER-ENEMY drop table, and some of its entries are
INLINE item definitions that exist ONLY there, not in `MATERIALS` —
e.g. `mithril_core_fragment` is inside `DROPS.golem`, not `MATERIALS`.
`MATERIALS.find(...)` for it compiles, runs, and silently returns
`undefined` forever — no error. **Check which table an item actually
lives in before writing a lookup.**

### Enemy roster

12 types (`ENEMY_TYPES` in `Enemy.js`, indexed 0–11): slime, skeleton,
goblin, vampire, spider, wraith, dragon, golem, ice_elemental,
sandworm, bone_acolyte, grave_stalker. 7 have real KayKit models
(mapped in `EntityForge.js`'s `CREATURE_MODELS`); slime/spider/dragon/
sandworm/ice_elemental stay procedural on purpose (non-humanoid,
forcing a biped model on them would be a downgrade). Every real-model
creature has a hard procedural fallback if the model isn't loaded — a
spawn must never throw or come back invisible.

### Quest compass — `updateQuestCompass()` in main.js, `#quest-marker`

Distance + 8-point compass heading to the active MAIN quest's
registered destination (elder/ostra hardcoded positions for `talk`
quests, `landmarkForQuest()` for mq4/mq6), throttled ~2.5Hz. Quests
with no registered place (mq1, mq2, all side quests) correctly show
nothing — this points at a PLACE, it isn't a general quest tracker.

---

## 6. Verification Methodology — read before trusting any measurement

**⚠️⚠️ The single most important fact about this dev environment:**
the Browser pane's preview reports `document.hidden` to the page. This
suspends `requestAnimationFrame` **entirely** — the engine loop does
not run, `engine.fps` reads 0, the canvas is 0×0 until the pane has
been fronted at least once, and `composer.render()` called manually
has no vsync/compositing so `gl.finish()` timing is meaningless (the
exact same workload was measured at 8.91ms and 4.0ms minutes apart).

This produced a real failure: the owner reported lag three separate
times, and every measurement available said 100–250fps. Both were
true. Two rounds of "optimization" were aimed at things that were
never the bottleneck before this was understood.

**The actual fix was not a better measurement — it's `PerfHUD`
(`src/ui/PerfHUD.js`), which runs on the OWNER's real machine:**
- **F3** toggles a frame-time meter: fps, median, **p95 and worst**
  frame time (ask for p95, not fps — a mean hides exactly what reads
  as "lag"), tier, draw calls, triangles.
- **F4** cycles quality tier (reloads — a tier change touches shadow
  size/resolution/pass-list/pixel-ratio, none of which can be hot-
  swapped honestly).

**Practical verification recipe, in order of preference:**
1. `preview_start` (`name: "mozzarela"`), **fresh tab every time** —
   stale HMR module instances on an old tab give false errors.
2. Drive the UI via `javascript_exec` clicking real DOM elements
   (`.path-card`, `.cc-card`, `#start-game-btn`, `#skip-story-btn`) —
   **synthetic WASD `KeyboardEvent`s are unreliable** in this
   environment (register in `InputManager.keys` but position often
   silently doesn't advance); don't burn turns fighting this.
3. **`window.__mz`** — published once the player clicks past the story
   overlay (`#skip-story-btn`'s handler). **Use this, not
   `await import('/src/...')`** — dynamic import returns a DIFFERENT
   module instance whenever HMR has touched the graph, so singletons
   come back looking uninitialized when they're fine. This trap has
   burned multiple sessions, including ones that had already been
   warned about it in this exact file. `__mz.report()` gives a
   one-line render-state summary.
4. Read `read_console_messages` **without** `onlyErrors` — some real
   bugs only ever log as `[warn]`. Also: **console message history
   persists across page reloads/HMR** in this environment and will
   show stale errors from minutes ago as if they're current — if a
   screenshot/live-state check contradicts an error in the log,
   trust the live state and treat the error as stale, don't chase it.
5. For state not reachable by walking to it in-frame, call functions
   on `__mz`'s live objects directly rather than trying to navigate —
   faster and more reliable (e.g. `__mz.chunkManager._loadChunk(cx,cz)`
   to force-build a specific chunk, `__mz.engine.onUpdate(1/60)` to
   step the real update loop without rAF).
6. For anything hash/table/probability-based: **verify by counting
   actual output distribution across a wide sweep, never by reading
   the branches** — see §7's correlated-modulus bugs, which all read
   as correct code and weren't.
7. Code review is an acceptable verification tier when live navigation
   genuinely isn't practical — used successfully throughout — but
   don't use it as an excuse to skip a live check that IS practical.

---

## 7. Session History (appendix — read for full context on a specific decision)

Chronological, most recent first. Kept for anyone who wants the full
reasoning/measurement behind a decision already summarized above.

### Session: Landing page, three landmarks, and the Ascent/Descent layer (this session)

⚠️⚠️ **THE BIG FIND: the main story was unfinishable.** `NPC.interact()`
was fully written and emitted `NPC_QUEST_TRIGGER`; `QuestSystem.js` had
a listener for it; `index.html` had an `#interaction-prompt` element and
a `<kbd>E</kbd>` hint. **Nothing anywhere ever called `interact()`.** The
chain was complete at both ends and severed in the middle, with no error
of any kind. mq3 ("The Elder's Wisdom"), mq5 ("The Long-Attuned") and
mq7 ("What the Fracture Wants" — the entire finale and all three
endings) are `talk` quests, so none of them could ever be completed. The
quest simply sat active forever while the player stood in front of an
NPC who had dialogue written for them.

Found while wiring Descent Gates, which need the same loop. Fixed with
one resolver — `updateInteraction()` in main.js — serving both NPCs and
Gates; nearest NPC wins on a tie. Uses `isKeyJustPressed('KeyE')`, not
`isKeyDown`, for the same reason the digit keys do.

### Session: Landing page rebuild + three new landmarks (this session)

Owner ask: *"lock in and upgrade the overall UI of the landing page,
and add a lot of the landscapes, structures for the story making it
feel like a game."*

**Landing page.** The three full-bleed screens were structurally a
form (a title, four unlabelled sections, a dead grey button) sitting
on top of a live 3D world nobody had given them a reason to sit on.
Rebuilt as a bound chapter, using the existing house vocabulary rather
than a new one:
- `Sigil.js` gained **`fractureRule()`** — a jagged stroked split with
  a hairline running out of each end, drawn twice (thick+dim as the
  wound, thin+bright as what comes through). `ruleOrnament()` remains
  the neutral section break used in-game; this is the loaded one, used
  on all three title screens so they read as one sequence.
- Loading screen is a **framed title plate** (`cornerFiligree()`, a
  double inset border, hard shadow) carrying an eyebrow, the title,
  the fracture rule, an epigraph, a metered bar with a live
  percentage, and the status line.
- Character creation gained a **fixed masthead** (running head + a
  live "N decisions remaining" counter), **numbered section plates**
  (I–IV) that visibly recede once answered, and a **sticky ledger** at
  the foot with a checklist naming exactly what is still missing.
  `checkStartReady()` already ran on every input on the screen and
  only ever toggled `disabled`; it now drives all of that from the
  same four variables — no new source of truth.
  ⚠️ The ledger's disabled button needs its OWN rule
  (`.cc-ledger .cc-start-btn:disabled`, goes cold iron): the generic
  `:disabled` rule only dims the accent to 35%, which on the ledger's
  near-opaque plate still reads as an inviting red button.
- **`--foil`** token added to both paths. Heaven's `--chrome-bright`
  is a dark brown tuned for cream *pages* and goes nearly invisible on
  Heaven's dark leather *binding* — every backdrop-mounted piece of
  chrome (masthead, numerals, checklist, loading %, the fracture
  rule's core stroke) uses `--foil` instead, so the two paths don't
  need duplicated per-path rules. Verified by screenshot in both.
- Path cards gained a **creed line** (`path.creed` in paths.js) — the
  one sentence you are actually agreeing with, above the blurb.
- Story intro is now a **staged reveal**: four lines at 1.3s intervals,
  then the ornament, then the button, pure CSS `animation-delay` (no
  JS timer chain to cancel or leak if the player skips) with a
  `prefers-reduced-motion` escape that shows everything at once.

**Three new landmarks**, taking the world from 2 placed locations to
5 — see §2's table and the technique notes above it. The Scar was the
in-flight design from last session, now built and verified.

**Verification note:** the world seed is `Math.random()` per load, so
the terrain around a landmark differs every reload — a screenshot of
a landmark is not reproducible between runs, only the landmark's own
contents are. Also: `atmosphere._sunAngle` is derived from `_time`
every frame and cannot be set directly; write `_time` instead
(`_time = target / 0.012`) or the next `update()` overwrites it. And
do NOT assign over `cameraController.update` to park the camera for a
screenshot — it clobbers the method for the rest of the session and
the camera silently stops following the player.

### Session: Sky rift, landing page overhaul, story bible

Owner feedback: *"it doesn't match the story and add landscapes,
improve the landing page UI, like an actual game, instead of slop."*
Then, mid-session: *"create a complete and comprehensive file... to
kick start another chat about the exact same project, maximise context
and token efficiency."* — which produced this restructuring of
HANDOFF.md itself (previously a pure chronological diary, ~1300 lines,
everything true but nothing front-loaded for fast orientation).

Findings and fixes, in the order worked:

1. **The design system was already deliberate, just unused on the
   landing page.** Read style.css's own header before assuming "slop"
   meant "throw out the flat/no-gradient rules" — it's a documented
   house style ("A Grimoire Bound in Iron"), and `Sigil.js` already had
   `cornerFiligree()`/`ruleOrnament()` built and even used in the
   in-game HUD, just never applied to character creation. The fix was
   using the existing vocabulary more, not inventing a new one.
2. **The sky had never depicted an actual fracture.** The whole game's
   premise is a broken sky and the sky dome shader was a smooth
   gradient. Added a jagged emissive crack (`Atmosphere.js`'s
   `SKY_FRAG`) — see §4 for the technique. Verified live in both path
   palettes; screenshots show it running dramatically across the
   horizon, visible from normal play angles, not just looking straight
   up.
3. **Nothing was ever rendered during loading/character-creation**,
   despite the Hub being fully built in GPU memory the whole time —
   `engine.start()` (which drives the only `composer.render()` call
   site) doesn't fire until well after character creation. Added
   `startMenuBackdrop()`, a standalone cinematic render loop, stopped
   cleanly before the real game loop claims the same camera. This
   ALSO retroactively made `setPath()`'s existing
   `atmosphere.apply(path.id)` call (already firing on every path-card
   click, previously invisible) produce a real-time world re-tint —
   confirmed via screenshot diff, Heaven vs Hell click showing a
   dramatically different world and UI theme simultaneously.
4. **Verification note for this specific feature:** confirming the
   backdrop loop was genuinely animating (not a single static frame)
   failed via `gl.readPixels` after an async delay — returned zero
   both times regardless of elapsed time, almost certainly because the
   canvas lacks `preserveDrawingBuffer` and/or the browser's
   compositor had already cleared the buffer by the time the read ran.
   **Screenshots taken seconds apart and compared visually (silhouette
   position shift) were the reliable check here — `gl.readPixels`
   after a real time gap is not**, unlike the synchronous
   render-then-immediately-read pattern used successfully elsewhere in
   this project for luminance checks.
5. Added `--backdrop-rgb` CSS custom properties (both paths) so the
   three full-bleed screens could become translucent scrims
   (`rgba(var(--backdrop-rgb), α)`) over the live world instead of
   solid walls, without hardcoding path-specific rgba duplicates.
6. Applied `cornerFiligree()` to the two path cards and `ruleOrnament()`
   under the character-creation title (both previously dead/underused
   code in Sigil.js). Deliberately did NOT apply filigree to the
   smaller class/skill cards (14 of them) — ornamentation reads as
   elegant applied sparingly to hero elements, cluttered applied to
   every small repeated card.
7. **Paused, in-flight:** a third landmark, "The Scar" — a literal
   ground-level wound mirroring the sky rift. Design work done (see
   §2's Landmarks entry for the reasoning already settled): rejected
   modifying the global terrain height function directly (too risky —
   `getGroundY` is flagged elsewhere in this file as the single most
   performance-critical function in the game, used everywhere for
   gravity/collision, and a fixed-location depression would need
   bounding logic to avoid affecting gravity far from the landmark);
   rejected a true 3D carved chasm mesh (would desync from the
   analytic ground truth `getGroundY` still reports, causing the
   player to float above or clip through it); settled on a **terrain-
   conforming glowing crack decal** — sample `getGroundY()` along a
   jagged path, build a thin emissive ribbon a few cm above the real
   walkable surface, flanked by real `cliff_a` Poly Haven models and
   `forgeShard()` crystal pieces. Not yet implemented. Resume by
   writing `_buildTheScar(originX, originZ)` in ChunkManager.js
   following the exact pattern of `_buildSunkenFoundations`/
   `_buildVellsHollow`, and registering it in `landmarks.js`.

### Session: World structures + story linkage

Owner ask: *"add more structures, and link it with the story... castles,
landscapes, dungeons and everything else."*

- **⚠️⚠️ Wilderness structures never existed** — found and fixed. See
  §4's Structures entry for the summary; the discovery was made by
  grepping every call site of `forgeRuin`/`forgeMonolith`/
  `_buildStructure` and finding all of them nested inside one
  hub-gated function.
- **⚠️⚠️ Two instances of the same correlated-modulus bug**, back to
  back, in the hub scatter loop and the new wilderness scatter
  function: filtering with `hash % A === 0` then indexing a table with
  `hash % B` where B is a multiple of A forces the second modulus's
  value to share the first's residue, making roughly half the table
  permanently unreachable. Both caught by counting actual kind
  frequencies across a wide sweep rather than trusting the code's
  shape (which read as correct in both cases). This is the SAME root
  bug class as the `noiseValue`-gates-placement issue below — by this
  point sighted five separate times across two sessions. **General
  rule now proven repeatedly: two decisions derived from correlated
  arithmetic are not independent just because they look like it. Any
  new hash-gated table needs its output distribution counted, not
  read.**
- **`mithril_core_fragment` lookup bug** — see §5's item-lookup entry.
- Built landmarks.js, the quest compass, the castle walls, the
  graveyard structure kind — all summarized in §2/§3/§4 above.
- Explicit scope limits stated at the time, still true: "dungeons" are
  atmospheric surface clusters, not walk-in interiors (no modular
  interior kit was ever fetched); the compass is text, not a visual
  minimap/waypoint.

### Session: Lag investigation (real bugs vs. unmeasurable environment)

Owner reported lag three times running. Root cause turned out to be
TWO real things plus one environment limitation that had been
mis-diagnosed as "fixed" twice before realizing measurement itself was
broken:
- **Ground detection was raycasting every frame, per entity** — fixed
  with the analytic `getGroundY()`, now covered in §4.
- **Pixel ratio 2.0 on `ultra`** — the single most expensive setting
  in the game on retina panels, lowered to 1.5 (§4).
- **The dev environment cannot measure performance at all** (§6) — the
  real fix was building PerfHUD so the owner could self-report real
  numbers instead of the assistant guessing from a broken measurement.

### Session: Tone mapping bug (the biggest image-quality bug in the project)

three.js only applies tone mapping / colour-space conversion when
rendering to the DEFAULT framebuffer, never a render target — so for
the entire life of this project, with a composer always in play, ACES
filmic tone mapping and sRGB encoding were silently doing NOTHING.
Scene rendered at mean luma 52/255, reached the screen at 14/255 — a
3.7× darkening with no error, no warning, nothing in the source that
looked wrong. `toneMappingExposure` had zero effect (swept 1.3→3.0,
output changed by 0.1/255). Prior sessions had been compensating by
inflating light intensities, which is why older tuning notes talk
about values that "read as blown-out" needing to be cut ~40–45% —
those retunes were fighting this bug blind. Fixed with an explicit
`OutputPass` in the composer chain (§4). **Lesson: never assume
`renderer.toneMapping` is doing anything by itself once a composer
exists — verify by measuring actual output luminance, not by reading
the renderer config.**

### Session: HD visual pass — smoothness, variety, real geometry

Owner feedback: *"still like robot and minecrafty, make it smoother,
infinite unique."* Then, separately: *"USE the 3D models from the
folder... models made by you are absolutely diabolical."*

- Terrain resolution was 24 segments/chunk (2.67m/vertex, faceted on
  any slope) — made tier-driven, up to 0.57m/vertex at ultra, which
  ALSO unlocked terrain detail layers that existed in code but were
  being averaged away below Nyquist at the old spacing.
- Every rock in the world was the literal same 20-face icosahedron —
  built `GeoForge.js` (noise-displacement + variant pooling) so
  there's real per-instance geometric variety instead of one shape
  scaled differently.
- **Every scattered prop faced the same direction** — `rotation.y =
  pos.noiseValue * 6.28`, but placement only happens where
  `noiseValue < density` (0.04–0.2), so noiseValue was near-constant
  for anything actually placed. This is bug-class instance #1 (the
  correlated-modulus bugs above are #4 and #5). The properly-random
  `pos.rotation` field existed the whole time and simply wasn't read.
- The local Fantasy Props MegaKit (94 embedded props) turned out to be
  **entirely interior furniture** — no tree, rock, cliff, or terrain
  feature of any kind. Verified by listing the source folder. This is
  why real geometry had to come from Poly Haven instead (§4/§5) — the
  local asset folder genuinely could not solve the ask, and re-
  checking that folder is a waste of a turn.
- `flatShading: true` was forced on organic surfaces (the actual
  "robot" cause — one constant normal per triangle) — now off at HD
  tiers for bone/hide/clutter, kept on for iron/crystal (correct
  there) and everywhere at `low`.

### Session: Initial HD build (quality tiers, IBL, weather, combat animation)

The foundational session — established the two-target build system
(§1), the quality-tier architecture (§4), image-based lighting, the
weather system, and closed out the long-standing Hit_A/Death_A combat
animation gap (§5). Also where the meshopt decoder gap (§5) was found
— the project's other historically-largest silent failure, on a par
with the tone-mapping bug for how long it went unnoticed and how much
prior "done" reporting it invalidated.

---

## 8. Known Honest Gaps (as of this session)

Stated plainly so a future session doesn't have to rediscover these by
poking around:

1. **"The Scar" ground landmark is designed but not built** — see §2
   and §7's latest entry for the full design and exactly where to
   resume.
2. **"Dungeons" are surface clusters, not interiors.** No walk-in
   room, no floor, no boss chamber — `STRUCTURES.dungeon` is a
   cage/chain/torch arrangement at ground level. A real interior needs
   either a fetched modular kit (none pulled yet) or a procedural room
   generator (a substantial separate feature).
3. **The quest compass is text, not a visual pointer.** No arrow, no
   minimap, no 3D waypoint. Deliberately cheap; a real waypoint system
   is a bigger feature this hasn't attempted.
4. **Weather is visual only** — no audio layer, no movement/traction
   effect, enemies ignore it. `weather.condition` is exported
   precisely so a future session can hook these in.
5. **Draw calls, not triangles, are the next performance ceiling** —
   790 at ultra, because every scattered prop is a Group of 3–9
   separate meshes. `THREE.InstancedMesh` per (variant geometry,
   material) pair is the fix if density ever needs to increase further
   — and it's *easy* now specifically because GeoForge already reduced
   the world to a small fixed set of shared geometries.
6. **Performance is now measured, but only on the owner's machine via
   PerfHUD** (§6) — the dev environment itself still cannot verify it.
7. **The user's original uncompressed source `.glb` files (up to
   153MB each) and the full MegaKit folder are still sitting loose** in
   `game/` root. Never delete without being asked.
8. **`Fantasy Props MegaKit[Standard]/` has a stray space** in its
   directory name — always quote paths referencing it.
9. Only two (soon three) landmarks exist; mq1/mq2/all side quests
   remain genuinely placeless by design, not oversight.

---

## 9. If the next ask is vague ("make it better/more real/etc.")

Ground it in something concrete before writing code:
1. **Check what's actually broken or missing first.** This project's
   history is dense with real, previously-unreported bugs found just
   by reading console warnings without `onlyErrors`, or by counting
   actual output distributions instead of trusting code shape. Don't
   assume a prior session's "done" report was correct — verify live.
2. Prefer fixing/extending the real-asset pipeline over more
   procedural tweaking where a genuinely good, clearly-licensed source
   exists (Poly Haven, ambientCG) — but the free landscape is mostly
   exhausted for this game's specific needs (checked: no modular
   architecture/dungeon-interior kit found anywhere yet).
3. If it's a rendering complaint, measure before changing anything —
   §6 and the tone-mapping/lag session entries in §7 are both stories
   of turns wasted on the wrong fix because a plausible-looking cause
   was assumed instead of measured.
4. If it's a "doesn't feel like a game / doesn't match the story"
   complaint, check whether the fix is a NEW system or just making an
   EXISTING one visible/reachable — three of this project's biggest
   wins (tone mapping, wilderness structures, the menu backdrop) were
   all "something already worked, nothing was showing it."
