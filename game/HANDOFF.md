# Handoff — Project Mozzarela: "The Fracture"

**Read this whole file before touching code.** It is the project's only
source of continuity across sessions — git history and code-reading
will not reconstruct the reasoning behind non-obvious decisions, and
several bugs documented here have been independently re-discovered more
than once by sessions that skipped it.

Organised for **fast orientation**, not chronology. §0–§7 are a dense
reference to read in full every session. The long chronological diary of
previous sessions lives in `HANDOFF.archive.md` — go there only when you
need the full story behind one specific decision.

---

## 0. THE TRAP LIST — read this even if you read nothing else

Every one of these has cost a real session real time. Ordered by cost.

1. **`await import('/src/...')` returns a DIFFERENT module instance**
   once HMR has touched the graph. Singletons come back looking
   uninitialised when they are fine. Use **`window.__mz`**. This has
   burned multiple sessions *including ones already warned in this exact
   file* — most recently reading `wandSystem.slots` as `[]` while the
   live instance had three.
2. **Verify the path the PLAYER takes, not the function you changed.**
   An entire spell-VFX pass was written, measured, and proven correct by
   state-vector diffing — and was invisible in play, because it went
   into the brewed-spell cast path while the player was casting a class
   skill through a different one. Press the key. Read the state.
3. **Count distributions, never read them.** Five separate
   correlated-modulus bugs shipped as code that read as obviously
   correct. Any hash-gated table needs its output counted across a wide
   sweep.
4. **This environment cannot measure performance honestly.**
   `document.hidden` suspends rAF; there is no vsync. Same-session
   relative comparisons are informative; absolute numbers are not.
   **PerfHUD (F3) on the owner's machine is the only real measure — ask
   for p95, not fps.**
5. **Console history persists across reloads** and shows stale errors as
   if current. If live state contradicts a logged error, trust live
   state.
6. **Read `read_console_messages` WITHOUT `onlyErrors`** — some real
   bugs only ever log as `[warn]`.
7. **If you add a key handler anywhere, add it to
   `BindSystem.RESERVED_KEYS` in the same commit.** `KeyR` (dodge) and
   `KeyZ/X/C` (abilities) were both missed; the bind panel will happily
   double-book a key and it reads as "dodge is broken".
8. **Adding a prop material means adding it to `PROP_SURFACES`.** A role
   absent from that table silently gets no textures *and* keeps flat
   shading — the keep was an untextured white box for exactly this
   reason.
9. **Two writers to one field is the recurring architecture bug.** Fog
   density, key intensity, camera position — each has exactly ONE
   writer. Publish a *factor*; never assign the field. **`player.stats.atk`
   and `.def` joined that list**: `equipWeapon()`/`equipArmor()` assign
   them absolutely, so a levelling system that also assigned them made
   gear erase levels on every equip AND levels erase gear on every
   level-up. `Player.recomputeStats()` is now the sole writer;
   contributions (`weaponAtk`, armour, `levelAtk`/`levelDef`) are
   stored separately and folded there.
10. **Code after a `return` runs never, and reads as if it runs.**
   `EnemySpawner.setPeaceful()` ended with `return this.peaceful;`
   followed by the only assignments of `spawnInterval` and
   `spawnRadius`. Both were therefore `undefined` for the project's
   life, giving `spawnTimer = NaN` (and `NaN <= 0` is false forever, so
   the ambient spawner fired **exactly once per session**) and a NaN
   spawn position for that one creature. "There are no enemies in the
   wild" was this, not the peace-mode default — **and peace mode
   masked it**, so nobody ever saw the real failure.
11. **A display string and a lookup key must never be the same field.**
   Hit three separate times in one session. `ItemGenerator` rolled
   `'Sword'`/`'Bow'`/`'Dual Blades'` straight into `weaponType`, while
   `WEAPON_PLANS` is keyed lowercase and falls back to the sword — so
   **every procedurally generated weapon forged a SWORD mesh**, bows
   and grimoires included, silently, forever. The enemy-type and
   footstep tables had the same shape (`biome.name.includes('swamp')`)
   and the same failure. All three are now declared fields
   (`biome.enemyTypes`, `biome.surface`, `{label, type}`) resolved
   through one normaliser that **warns** on a miss instead of
   substituting silently.
12. **A "player damage" test must name EVERY player source.** The
   COMBAT_HIT handler gated the Leaning and lineage multipliers on
   `source === 'player'`, which is the MELEE source only — so every
   Weave the player cast missed all of them, and casting was the one
   thing in the game that ignored every power system in the game. The
   gate existed to exclude ENEMY damage (`source` is an Enemy
   instance), and there are exactly three sources: `'player'`,
   `'wand'`, and an Enemy. **Two of the three are the player.**
   ⚠️ The same line had the mirror bug: the Ascent grant was applied
   *unconditionally*, so enemy-on-enemy damage was scaled by the
   player's rank. Both now go through one named `isPlayerDamage`.
13. **flex-shrink will crush a scrollable strip to height 0.** Adding
   `max-height` + `overflow-y:auto` to a child of a flex COLUMN is not
   enough — the default `flex-shrink: 1` let `.loom-runes` collapse to
   height 0 the moment the column ran short, while its `scrollHeight`
   stayed 130. Every sign chip and the Confluence banner were
   correctly in the DOM with nowhere to be drawn, which reads as "the
   signs stopped appearing" and sends you into the wrong file. Any
   bounded scrolling strip in a flex column needs `flex-shrink: 0`.
14. **A backtick inside an HTML comment inside a template literal
   fails the BUILD.** Writing ``  `radius` `` in a `<!-- -->` comment
   inside a `` ` ``-quoted string terminates the string. The comment
   looks inert and is not.
15. **A renamed variable can take out a whole panel silently.**
   `WandMenuUI._renderPotions()` ended with `if (!potions.length)`
   after the potions→Weaves pass renamed it to `weaves`. That
   ReferenceError threw on EVERY render, so the "Woven signs" column
   was permanently empty — AND, because the click handler also calls
   `_render()`, infusing threw too. One stale identifier took out both
   things the panel exists for, and the owner reported it as two
   separate bugs ("I can't see the woven spells, nor can I bind them").
   ⚠️ It never reached the console as a visible failure during normal
   play because the throw happened inside an event handler.
16. **When a system is superseded, DELETE or re-key the old panel.**
   `WandMenuUI` was the pre-bindings panel and still listened on **V**,
   which is `BindUI`'s key — pressing V opened both, stacked. It was
   also still half-migrated to numbered slots after `slots[]` became
   the id-keyed `held` Map: `bestSlotFor()` returned an ID while its
   NAME promised an index (so the button read "Infuse → slot
   fire_lance1"), and `setActive(i)` / `clearSlot(parseInt(...))` were
   handed indices when both take ids, so selecting and clearing
   silently did nothing. Now on **H**, id-keyed throughout, and
   `bestSlotFor` is `heldIdFor`.
17. **Two salted hashes are NOT automatically independent.** Weapon
   true names take two indices from two separately-salted FNV-1a
   hashes of nearly-identical strings — which *looks* like it dodges
   the correlated-modulus trap and does not. Plain FNV leaves its low
   bits weakly mixed, so both hashes stayed correlated in exactly the
   bits `% 20` reads: **only 100 of 400 possible name pairs ever
   occurred (25%)**, five second-halves per first-half, forever.
   ⚠️ And the misleading part: *each half was individually well
   distributed* (15% bucket spread, which reads as perfectly healthy).
   **Count the PAIRS, not the halves.** Fixed with a murmur3 `fmix32`
   finalizer — 400/400 after. This is the sixth correlated-modulus bug
   in this project's history.
18. **A missing import does NOT fail `vite build`** if the call site is
   only reached at runtime. `roundedBox` was used by two new weapon
   plans and unimported; the build was green and it would have thrown
   the first time a player equipped one. Build passing is not the same
   as the code path running.
19. **A guard clause that compares `>=` is not a validation.**
   `hasItem(id, count)` returns `internalCount >= count`, which is
   TRUE for every negative count — so "do you own 5 of these?"
   answered yes to "do you own −5?". Three separate economy paths
   relied on it as their only ownership check. Validate the INPUT,
   then check ownership; never let a comparison stand in for both.
20. **`NaN` defeats every ordinary guard, in both directions.**
   `NaN < 1` is false, `NaN >= n` is false, `Math.min(NaN, x)` is NaN,
   `Math.max(0, NaN)` is NaN. So a NaN passes "is it too small?"
   checks AND fails "do you have enough?" checks, and once it reaches
   a stored value it is permanent — a NaN hp means `hp <= 0` never
   fires again and the entity is immortal. Every public setter that
   takes a number from a caller must use `Number.isFinite`.
21. **Check the return value of anything that takes payment.**
   `transmute()` called `consumeItems()` and handed out the reward
   regardless of whether payment succeeded. Whether a caller can
   currently trigger it is not the question — it is a duplication
   vector by construction.
22. **If an entity is removed from its manager list on death, check who
   still ticks it.** Enemies were spliced out of `spawner.enemies` the
   same frame `alive` went false, so `Enemy.update()`'s
   `deathTimer <= 0 → destroy()` branch was unreachable and every
   corpse leaked its mesh and geometry into the scene forever. Corpses
   now live in `spawner._corpses` until `destroy()` actually runs.
23. **"Equipped" in a system means nothing until it reaches the code
   that MODELS it.** `LoadoutSystem.equipWeapon()` put a Memory in a
   slot, rebuilt the hotbar, emitted LOADOUT_CHANGED — and never
   called `Player.equipWeapon()`, which is the ONLY thing in the
   project that builds a weapon mesh, sets `weaponAtk`, or emits the
   `PLAYER_EQUIP_WEAPON` that `_equipViewmodelWeapon` listens for. So
   a forged weapon had **no model in your hands, no model on your
   body, and none of its attack power** — measured, holding an Epic:
   `weaponMount.children 0 · _meleeWeaponMesh false · weaponAtk 18`
   (the STARTING WAND's). The panel said equipped and every readout
   agreed with the panel. **Two systems owning "equipped" is the same
   shape as two writers to one field (trap #9) — one of them just
   does nothing instead of fighting.**
24. **A local of one method, read from another, compiles.**
   `Player.equipArmor()` ended with
   `` `DEF: ${totalDef}` `` — and `totalDef` is a local of
   `recomputeStats()`. Every single call threw
   `ReferenceError: totalDef is not defined`, **after** storing the
   token and tinting the mesh but **before** emitting
   PLAYER_EQUIP_VISUAL, so no armour ever reached the character
   preview and no notification ever appeared. Invisible for the life
   of the project because the throw happened inside a UI click
   handler — the same reason trap #15 hid.
25. **A transparent shell centred on the player is a colour wash, not
   a dome.** The camera is INSIDE it, so a double-sided 42%-opacity
   sphere covers every pixel. Measured: the entire frame flat white.
   §4 already records this exact failure for the ground-mist sheets;
   it came back through a ward. Wards are drawn as a **wireframe
   lattice** now — near-zero fill, and a better picture of a Weave
   anyway.
26. **Count the actives against their branches, not by reading the
   switch.** `skewer`, `scatter`, `chorus`, `charge` and `vault` are
   all `active: true` in `ABILITY_POOLS` and had no branch in
   main.js's ASPECT_USED handler — **5 of 15, a third of every active
   Aspect in the game**, each spending Essence, starting a cooldown
   and doing nothing. The `default` warns, but only to a console the
   player never opens. They are the entire `pierce`/`spread`/`move`
   families' actives, i.e. exactly what a Piercing, Erratic, Vast or
   Driving temper selects — so **drawing a deliberate sign was the
   most reliable way to forge an inert Memory.** Enumerate
   `ABILITY_POOLS` and diff it against the switch; do not read it.

27. **A summon that spawned a HOSTILE that killed you.** `friendly`
   was passed into the Enemy constructor by three call sites
   (`SpoilsSystem._callEcho`, the `summon`/`swarm` Aspects, the
   devoured Warden) and **read by none** — the constructor silently
   dropped it, so every summon in the game was an ordinary enemy that
   immediately hunted the player. Measured: calling an Echo took the
   player **100 HP to 0 in four seconds**. `despawnAt` was written by
   the same path and also read by nothing, so it never left either.
   The Echo's own blurb — *"something that comes when called, and goes
   back after"* — was inverted on both halves.
   ⚠️ **A field written in three places and read in zero is this
   project's single most repeated bug** (`REVENANT_BOUND`,
   `PLAYER_LEVEL_UP`, `WAND.LEVEL_POWER_STEP`, `manaCostMult`,
   `reachMult`, `friendly`, `despawnAt`). Grep for the READ before
   trusting that passing an option does anything.
28. **Making `friendly` real makes every "all enemies" query a bug.**
   `getEnemies()`/`getEnemiesInRange()` feed melee arcs, Aspect areas,
   wand homing and the target reticle — every one of which means
   "what can the player hit". The moment a companion exists, an
   unfiltered list means your own Echo eats your Sweep and your wand
   homes onto it. They are **hostiles-only** now; `allCreatures()` /
   `creaturesInRange()` exist for the one caller that genuinely wants
   both (crowd separation, which is physical).
29. **Dismissing a summon must not go through the death path.**
   `alive = false` alone runs the corpse timer, the COMBAT_KILL
   payout and the loot drop — so unequipping your own Echo would pay
   you XP for banishing it, on a loop, for as long as you kept
   re-equipping. `Enemy.dismiss()` is separate and marked.
30. **Counter-scaling by an animating scale divides by ~0.** The
   materialisation cage was scaled by `1 / objectScale` so it would
   not compound with the object's own 0→1 growth. Correct arithmetic;
   `s` starts near zero, so the cage started near INFINITY. On a
   viewmodel weapon that was 26× and survivable. On a world-scale
   Echo it put **three twenty-metre rings of light across the sky**.
   The numbers all read fine — this was only ever going to be caught
   by looking at it.

31. **`_active` never moved on its own — because it never had to,
   until a slot could hold something you don't swing.** Before
   Echoes, `equipWeapon()` always targeted a free slot and slot 0 (the
   default active slot) was always the first one filled, so a fresh
   weapon was always visibly in hand by accident of ordering. The
   moment an Echo could sit in slot 0, that accident broke: forge an
   Echo (→ slot 0), then forge a weapon (→ slot 1, "Drawn into slot 2"
   and all) — **0 viewmodel meshes, 0 body meshes, `weaponAtk` stuck
   on the wand's number.** The equip fully succeeded in the data
   model; the player simply never saw it, which reads exactly like
   "the weapon doesn't load". Fixed by switching `_active` to the
   newly-equipped slot **only when the hand was already empty**
   (`!this.activeWeapon` beforehand) — a second weapon equipped while
   one is already in hand must not yank focus mid-fight.
32. **A "weapon always gets an active Aspect" guarantee doesn't cover
   the next form that needs the same guarantee.** `forceActive` was
   `i === 0 && form.equips === 'weapon'` — exactly right when weapons
   were the only form with a hotbar-facing verb, and silently wrong
   the moment Echo became one too. The `call` pool is 2 active / 3
   passive, so an unforced Echo had roughly a 3-in-5 chance at common
   grades of rolling **entirely passive** — contributing nothing to
   `loadout.bindables()`, appearing on no hotbar key, and having no
   row anywhere in the Bindings (V) panel. "I can't bind it, it isn't
   in the list" was this, not a missing UI section: a summon with no
   active ability is invisible to every system that lists actives,
   full stop. Counted, not read (trap #3): 0/200 forged Echoes with
   zero actives after the fix.

33. **A cone test between an EYE and a pair of FEET is ~45° off at
   close range.** `checkCombatCollisions` compared
   `enemy.position - (player.position + Y1)` against the camera
   forward in 3D. An enemy standing right in front of you is measured
   as being far BELOW you, and the closer it is the worse the angle:
   measured with a 70° dagger, it hit at 1.5m and missed at both 1.0m
   and 1.8m. The old fixed 130° arc was forgiving enough to hide it
   completely; it only became "my weapon doesn't hit anything" once
   arcs got narrow. **A swing is horizontal — test it on the XZ plane
   and gate height separately.** The same applies to REACH: measuring
   it in 3D silently subtracts eye height, so a 3.0m sword really had
   2.83m and the shorter the weapon the bigger the bite.
34. **Clamping an angle to 179° to "avoid a degenerate cone" deletes
   every arc wider than a half-circle.** `Math.min(179, arcDeg)` caps
   the half-angle at 89.5°, so the scythe's signature 200° sweep —
   the entire reason a scythe is not a sword — rejected a target at
   exactly 90°. A half-angle of 180° is not degenerate, it is
   omnidirectional, and `cos(180°) = -1` accepts everything correctly.
   Clamp to 360.
35. **A hit window spanning several frames deals its damage on every
   one of them.** The melee window is `attackTimer` between 0.10 and
   0.25 — about three frames at 60fps — and every weapon was dealing
   its full damage on each, i.e. roughly 3x its listed number, for the
   life of the project. Invisible while there was one weapon and one
   number; fatal the moment weapons had *different* numbers to
   compare. Latched with `player._swingResolved`, cleared in
   `_performAttack()`. ⚠️ A multi-hit weapon declares `hits` instead.

36. **`progressSystem.level` / `.xp` / `.xpToNext` are GETTERS onto the
   player.** Assigning to them silently does nothing — no error, no
   warning. A restored character came back at level 1 with everything
   else correct, which reads as "the save is broken" rather than "one
   field went to a getter". Levelling lives on `player`; ProgressSystem
   only proxies it.
37. **A FAILED RESTORE WILL OVERWRITE THE GOOD SAVE.** The nastiest
   failure in the project, and it destroyed a real character during
   development: restore() half-works → the player is standing in a
   degraded character → twenty seconds later the autosave faithfully
   writes THAT over the only copy of the good one. SaveSystem now
   refuses to save after an incomplete load (`_restoreDegraded`), keeps
   one generation of backup, and exposes `forceSave()` /
   `restorePrevious()`. ⚠️ The completeness check must EXCLUDE keys
   that deliberately have no restorer (`INFORMATIONAL`) — counting
   those marked every healthy load as degraded, and a guard that fires
   on the happy path gets switched off.
38. **An honour gated on the Refusal cannot be earned.** The first
   Giantfeller required a kill 5 ranks up — in a game whose central
   rule is that an attacker 2+ ranks below its target is capped to a
   fraction of that target's MAX health. Measured: a rank-0 player
   could not kill a rank-5 creature **with 3 HP** in 500 hits of 60
   damage. Nothing about the code looked wrong. Any threshold phrased
   in ranks has to be checked against `rankMatchup` before it ships.
39. **A creature standing in a town has no line of sight.** A ranged
   enemy tested inside the Sanctuary never fired, and the terrain
   samples were all clear — it was the PROP occlusion half of
   `_hasLineOfSight` correctly finding buildings. Behaviour that
   depends on sightlines must be verified in open ground, or correct
   code reads as broken. (The same test in the wilderness: holds at
   10.7m, LOS true, throws.)

40. **A UI singleton that bails when its element already exists ends
   up with `this.el === null`.** The usual
   `if (document.getElementById(id)) return;` guard is correct for the
   DOM and wrong for the instance — on any re-evaluation (HMR, a second
   init) the new object never adopts the existing node, and every
   method then throws "Cannot read properties of null" from inside the
   async boot, with a stack pointing at whatever line of main.js was
   unlucky. ADOPT the node instead of returning.
41. **`questSystem.init()` can complete a quest during boot.** It
   registers a BIOME_ENTER listener, and the very first
   `chunkManager.update(0, 0)` fires one — so mq1 completes and asks
   for the next act's chapter card **before any UI exists**. Anything
   a quest completion can reach must either be initialised before
   `questSystem.init()` or be safe to call early (SceneUI does both).
42. **`Box3.setFromObject` is not usable for POSITIONING a SkinnedMesh.**
   It computes from the geometry's own bounds through the mesh matrix
   and ignores skinning entirely, so on a glTF rig — where the bones do
   the placement and the geometry sits near the origin — the box is not
   where the character is. Using it to re-seat the player's body put it
   **five units in the air**. Fine for a rough height RATIO; useless as
   a position.
43. **The player rig has always been ~2x the size the camera assumes.**
   Measured: standing height 4.01 units against a `CAMERA.EYE_HEIGHT`
   of 1.62. It never mattered because the rig was `visible = false` —
   an invisible object's proportions are never wrong — and it also
   meant the player's own shadow has been twice human-sized on the
   ground for the life of the project. Anything hidden is unverified by
   definition; check it before you show it.

44. **80% of terrain build cost was normals, and STILL is after the
   documented fix.** §4 records "pass 3 called getHeightAt 4x per
   vertex" being fixed — but only the BIOME LOOKUP inside it was
   removed; the four `_getHeight` calls per vertex stayed. At `high`
   (res 64) that is **16,900 noise-heavy height evaluations per chunk**
   for normals alone. Measured on a pinned seed: terrain mesh **17.4ms
   median**, i.e. ~3x drainChunkQueue's entire 6ms budget, on its own.
   Sampling the gradient on a half-density lattice and interpolating
   takes it to **9.4ms (−46%)**.
   ⚠️ The chunk EDGES must stay exact analytic samples or the seam
   returns — see the note in `generateChunkMesh`. Verified 0.00000°
   disagreement across all 65 shared edge vertices.
45. **THE WORLD SEED IS `Math.random()` PER LOAD, so no measurement
   taken across a reload is comparable.** This cost a full round of
   wrong conclusions here: chunk-build times and seam angles measured
   before/after a change were reading different terrain, and the seam
   "regression" that appeared to be caused by an optimisation turned
   out to be a different world. §6 says a landmark screenshot is not
   reproducible between runs; the same applies to every NUMBER. Pin a
   seed (`new TerrainGenerator(1234)`) and measure in ONE session.
46. **The player's animation mixer was never ticked.** `_forgeRealPioneer`
   builds an AnimationMixer, plays `Idle`, and hands back
   `leftLeg`/`rightLeg`/`leftArm`/`rightArm` as **empty dummy Groups**
   — so `Player._updateAnimation` was rotating four detached objects
   while the mixer that poses the actual skeleton advanced never.
   Enemies tick theirs, chunk props tick theirs; the player was the
   one rig in the game frozen on frame one. Invisible for the life of
   the project because the body was `visible = false`.
47. **`animateCreature` read `group.position` for locomotion, which is
   LOCAL.** Fine for an enemy (its group is its scene root) and wrong
   for the player (whose rig is a child of `player.mesh`, forever at
   local 0,0,0) — the body would stand in Idle at any speed. Use
   `getWorldPosition`; it is correct for both.
48. **`group.position.y +=` in an animator is only safe if something
   rewrites that position every frame.** The idle bob is fine for
   enemies because the spawner re-copies `this.position` each frame.
   Nothing rewrites the player rig's local position, so the same line
   integrates a sine forever and the body sinks. Re-seat a stored base
   before calling.
49. **"I can't equip X" has meant something different every time, and
   it has never once been the equip logic.** Four sessions, four
   causes: the forge did not auto-equip; there was no hotbar in the
   HUD; the Loom's own equip page keyed on `equips` instead of
   `budgetFor`; and most recently there was **no key that could equip
   anything at all** — `BIND_KINDS.ASPECT` binds an ability of a thing
   you have ALREADY equipped, which is the step after the one being
   asked for. Before touching `LoadoutSystem`, **drive the real path
   and watch state**: every one of those four had a correct data model
   underneath and no door into it.
50. **`flex-wrap: wrap` stops `flex-shrink` from ever running.** The
   browser moves an item to a new line BEFORE it will shrink one, so
   chips with `flex: 1 1 auto` and `min-width: 0` still wrapped to a
   second row at every container width below ~460px. Wrapping and
   shrinking are ALTERNATIVES, not complements. (Trap #13 is the same
   property biting in a column; this is the row-direction half.)
51. **`vw` units are unverifiable in this environment.** The pane
   reports `window.innerWidth === 0` **even with the tab fronted**, so
   every viewport-relative length resolves to 0 in every measurement
   you can take, while being fine on the owner's machine. A layout
   fixed with `vw` looks correct to the owner and reads as zero-width
   to you — you cannot tell a working one from a broken one. Size by
   content and bound by count instead.
52. **A parent sized by its contents has no width you can rely on.**
   `#wand-bar` measured **484px and 362px in the same session**,
   depending only on what the wand row happened to be showing. Any
   child layout tuned against one of those numbers is wrong half the
   time.
53. **`camera.fov` in three.js is VERTICAL, so anything you place by
   horizontal angle depends on the ASPECT RATIO** — a property of the
   player's window, not of this codebase. Peripheral offsets computed
   for FOV 88 at 16:9 measured `ndc.x = -1.94` (fully off-screen) the
   moment they ran in a 0.85-aspect window. Derive from
   `atan(tan(fov/2) × camera.aspect)` at USE time; the FOV is also
   live (CameraController kicks it while sprinting).
54. **Size things near a first-person camera by ANGULAR DIAMETER, not
   by metres.** A 0.42-radius shell at 1.6m is 29° of arc — over a
   third of the screen width — and reads as obviously tiny in source.
   `2·atan(r/d)` before you commit a number.
55. **THIS GAME IS FIRST-PERSON: there is no third-person camera, so
   anything placed behind the player is placed nowhere.** A companion
   ring centred on straight-behind verified perfectly against "never
   blocks the crosshair" (`dot ≤ -0.08` at every yaw) and was
   invisible in play. "Beside the player" means the frustum
   periphery, not world-space behind.
56. **`sceneManager.camera` does not exist — the camera lives on
   `cameraController`.** Reading the wrong one returns `undefined`,
   which every `?? default` swallows into a plausible wrong number
   rather than an error.
57. **A method that does not exist fails as a falsy guard, not as a
   throw.** `cameraController.getYaw ? getYaw() : 0` compiles, runs,
   and feeds a constant 0 forever — `yaw` is a public FIELD. The
   optional-call idiom turns a typo'd API into a silent default.
58. **Hashing a START INDEX and walking to the first match is NOT a
   uniform choice.** Every start that lands in a run of ineligible
   entries funnels into the one eligible entry after the run, so a
   candidate preceded by six rejects is seven times as likely as one
   preceded by none. `_makeAbility` did this and made `skewer` 61% of
   every active in the game. **Filter first, then index into the
   survivors.** Seventh correlated-selection bug here.
59. **A dedupe set scoped to one object does not dedupe across
   objects.** `used` correctly kept one Memory from rolling the same
   Aspect twice, and was read for years as if it stopped duplicates
   generally. It never did.
60. **When the pool is smaller than the number of draws, uniqueness is
   arithmetic, not tuning.** 15 actives against 5 equipped Memories
   repeats by the pigeonhole principle; no selection fix reaches it.
   Count the pool against the draw before debugging the picker.
61. **A "soft preference" that checks one bucket and gives up is
   barely a preference.** Avoiding owned keys within the ability
   FAMILY still left 9.5% duplicates; the family exhausts long before
   the table does. Widen before you concede.
62. **Fixing the general case can leave a deliberate special case
   standing.** Weapon signatures are intentionally identical per type
   and never pass through `_makeAbility`, so they survived every pool
   and dedupe fix as a stubborn residue — and looked like the original
   bug. When a rate stops falling, ask which code path is not
   participating.
63. **A generator fix does not reach the SAVE.** Anything baked onto an
   object at creation time — a name, a label, a derived string — keeps
   its old value forever for everyone who already owns one. The owner
   sees "you fixed it" as nothing having changed. Every rule change to
   generated content needs a migration (`repairAspectNames`,
   `ensureGearLetters`) or it only exists for new players.
64. **`loadout._rebuild()` emits NOTHING.** The HUD hotbar is painted
   from LOADOUT_CHANGED, so a rebuild outside that event updates the
   data and leaves the screen stale. A boot-time repair that rebuilt
   without calling `_paintLoadoutBar()` left the corrected names in
   `loadout.bar` and the duplicates on screen.
65. **A "keep its authored name" rule is a duplicate generator when the
   thing is shared.** Weapon signatures kept `t.verb` verbatim so the
   identity word stayed visible — and every warhammer in the game
   therefore carried an Aspect named exactly "Quake". Shared identity
   needs a per-instance qualifier, not a bare label.
66. **One storage key for a whole save IS the multi-character bug.**
   `mz_save_v1` meant a second character overwrote the first on the
   next autosave — silently, and unprompted. Anything a player can
   have two of needs its key scoped before it needs a menu.
67. **An unscoped autosave writes during the MENUS.** It ticks every
   20s regardless of what screen is up, so a save system with no
   profile selected must write to a scratch key, never to the last
   one used.
68. **A `z-index: 900, pointer-events: auto` overlay can swallow a
   whole screen and never be noticed**, because every automated check
   drives forms with `.click()` on the element itself, which ignores
   what is painted over it. SceneUI's chapter card covered character
   creation for the life of the project. **Screenshot the menus, or
   click by coordinate.**
69. **`addEventListener('click', fn)` passes a MouseEvent as fn's
   first argument.** A handler that later grows an options parameter
   silently receives an event object instead. Wrap it.
70. **"Inherent to the algorithm" is a per-UNIT claim, not a total.**
   The chunk-build pass proved the height function's cost per vertex
   was irreducible and stopped. Nobody asked how many vertices the
   distant rings needed — the answer was "a quarter", worth another
   45% of the noise budget. When you conclude a cost is inherent, ask
   how many times you are paying it.
71. **A cache that requires a lookup key silently excludes everything
   without one.** `PropForge.mat()` cached correctly and needed a
   PROP_SURFACES role, so every deliberately-untextured material
   bypassed it and allocated per call — 68 identical copies of one
   shard material in a single view, and 100 compiled shader programs.
72. **Surface decoration cannot fix a silhouette.** Weapon blades had
   fullers, langets, honed bevels and chips hung on a `BoxGeometry`.
   The detail was real and invisible, because the shape underneath was
   a constant-width slab. Fix the form before adding to it.
73. **Uncapped mitigation is uncapped immortality.** `def / (def + K)`
   asymptotes to 1. With four contributors, one of them uncapped by
   design (Raiment), nothing else bounds it — the cap is load-bearing,
   not defensive.
74. **Fixing the models the OWNER never looks at is not fixing the
   models.** A pass that improved four blade shapes drew "they are
   still the same" — because buildings fill the screen and weapons
   occupy a corner of it. Screenshot the thing the player actually
   sees before choosing what to work on.
75. **Random omission does not read as damage.** Skipping 25% of a
   tower's merlons at random reads as missing geometry, because damage
   has a direction and a cause. Break them SHORTER instead — a snapped
   merlon leaves a stump.
76. **Duplicated inline geometry drifts from the helper it copied.**
   The keep's turret tops were built by hand and the free-standing
   towers used a helper; the two ended up with different tooth counts
   and proportions, on structures visible side by side.
77. **An explosion whose parts move in a way the object cannot explain
   reads as a bug.** Offset each piece along ITS OWN axis from the
   centre, not along a shared direction.
78. **An animation that integrates a delta and subtracts it later
   drifts.** Capture the pose on start and restore it absolutely.
   Verified over 40 casts before trusting it.
79. **In a first-person game, fix the HILT before the blade.** The
   blade points away from the camera and foreshortens; the hilt fills
   a corner of the screen permanently. A pass that rebuilt every blade
   drew "the weapons still look the same" — because the crossguard was
   a 3.5cm flat plate and that is what the player was looking at.
80. **An effect that plays on every press is not a special move, it is
   the walk cycle.** The weapon-shatter fired on every active Aspect
   and read as noise — and it buried each ability's own VFX. Rarity is
   part of the effect.
81. **A blend that is "mostly the original" is not an effect.**
   Terracing at 42% strength produced ZERO flat spans in 67 samples —
   visually nothing, and I nearly shipped it as done. When an effect
   is defined by a discontinuity (a shelf needs a riser), most of the
   value has to actually snap. **Measure the feature, not the code.**
82. **Terrain changes must be checked for WALKABILITY, not just
   looks.** Measure the share of ground past a climbable grade at
   several distances before accepting a height-function change; the
   most dramatic screenshot in the world is usually its worst case,
   not its norm.
83. **CONFIRM THE CODE PATH IS REACHABLE FROM A DEFAULT SAVE before
   improving it.** Two rounds of weapon work went into `forgeWeapon()`;
   the player holds `forgeWand()` and only ever sees the former after
   forging a weapon Memory. One live query (`loadout.activeWeapon`)
   would have caught it before either round. Escalation of #74.
84. **`flattenFactor` made the entire starting area immune to terrain
   work.** Everything within 120 units of origin was multiplied toward
   zero height — the exact area a new player spends their first
   half-hour in. A height-stack change can be perfect and invisible.
85. **`viewmodel.weapon` is NULL by default; `viewmodel.wand` is
   always there.** Any held-weapon effect must handle both or it does
   not exist for a player who has not forged yet.
86. **`loadout.reset()` does not emit LOADOUT_CHANGED**, so
   `_syncLoadoutEquipment` never runs and `viewmodel.weapon` keeps the
   previous weapon. It cost a wrong diagnosis during testing; assume
   stale viewmodel state after any reset.
87. **A no-spawn radius and a spawn radius are ONE system and must be
   sized together.** `sanctuaryRadius` 190 against a 30–56 spawn ring
   meant the ring could never straddle the boundary: the world was
   hard-empty out to 190 units, while the active quest said "kill
   three skeletons". "It doesn't feel like a game" was this.
88. **Speeds are in REAL UNITS — check them against reality.**
   `MOVE_SPEED: 8` m/s is faster than an Olympic sprinter, and sprint
   took it to 12.8 m/s. Numbers that look small in source ("8") can be
   physically absurd, and the whole world feels wrong without any one
   thing looking wrong.
89. **If the player can WATCH the sun move, the world reads as a toy.**
   A full day/night was 524 seconds. Anything the eye can track while
   standing still is animating at the player rather than surrounding
   them.
90. **`_scaleKill` makes a levelled test character look like XP is
   broken.** Test progression with a character near the enemy's level,
   or you will chase a bug that is a working feature.
91. **A displacement parallel to its own cut is not a break.** The
   shattered moon's piece slid ALONG the fracture rather than away
   from it and rendered as an unbroken disc — code that read as
   obviously correct. Screenshot geometry; do not reason about it.
92. **Sky features must OCCLUDE, not add.** `col += moon` let the
   horizon bloom bleed through and the moon became a smudge. Anything
   at infinity replaces what is behind it.
93. **A palette can compete with the thing it frames.** The ember sky
   washed out the moon it was supposed to silhouette. When adding a
   dominant element, re-grade what surrounds it in the same pass.
94. **In an if-else selection chain, ORDER DECIDES EXISTENCE.** The
   Bottomless Pit scored 0% across three seeds because an earlier
   branch consumed its entire condition space. Have each option lead
   on the axis it owns, and verify with a counted sweep.
95. **`_loadChunk` has TWO conventions and marks neither.**
   `_generateTrees`/`_generateRocks` add themselves to
   `decorationGroup`; `_generateWildernessStructures` and
   `_generateGodBones` only build and return. Follow the wrong one and
   your props exist, collide, unload — and are invisible.
96. **Props floated because scatter used UNBLENDED biome params.**
   `getDecorationPositions`/`getClutterPositions` took height from the
   chunk's own `biome.heightScale` while the mesh uses per-vertex
   BLENDED params, so props at any biome boundary sat on a surface
   that was not drawn. Use `getHeightAt()` for anything positioned on
   the terrain. FIXED — 28 floating → 3.
   ⚠️ This was first blamed on the terrain LOD and that was WRONG:
   full-res chunks held the worst offenders (15.7) versus half-res
   (11.2). **Correlate before blaming your own most recent change.**
97. **A wide `heightScale` range makes boundary bugs severe.** The
   realm biomes took the spread from ~0.5–1.5 to 0.22–2.40, and blend
   error scales with it. A latent bug became a visible one purely
   because new data widened a range.
98. **A declared biome flag with no reader is a lie the table tells.**
   `hollowed`, `drowned` and `deadCity` shipped read by nothing for a
   session — three biomes reported as having features that did not
   exist. Add the reader in the same commit as the flag.
99. **A procedural feature and a MAP must be anchored to each other.**
   Godgrave's skeleton ran along a world-origin curve; the moment
   Godgrave became a fixed region at (3900, 2600) the two no longer
   intersected and the region's own centre had zero bones. Adding a
   map retroactively breaks every system that placed things by global
   rule — audit them against `realmRegionAt`.
100. **Do not randomise a map with the world seed.** Regions must sit
   at fixed coordinates or they cannot be navigated to, quested
   toward, or spawned into. Seed the CONTENTS, never the geography.
101. **`SaveSystem.restore()` ORDER can silently erase a grant.**
   `put('nightmare')` runs before `put('player')`, and the player block
   recomputes `maxHp` from level — so an innate Aspect applied during
   nightmare-restore was overwritten every load. Anything touching an
   absolute pool must be applied AFTER the whole restore settles.
102. **When a multiplier survives and an absolute value resets, look
   for a LATER WRITER, not a failed grant.** The innate Flaw
   (per-frame multiplier) persisted while the Aspect (absolute maxHp)
   did not — that asymmetry named the bug immediately.
103. **A difficulty ramp keyed on DISTANCE breaks the moment the game
   can start you anywhere.** The First Nightmare spawns level-1
   Pioneers 2,000–6,000 units out, where the ramp was already at full
   difficulty — reviving the exact bug the ramp was written to fix.
104. **A cap applied before the bonuses is not a cap.** Clamping the
   base enemy level still yielded level 12 once the random spread and
   volatility bonus were added. Clamp the FINAL value.
105. **Ambient spawning happens once BEFORE the first frame**, during
   the `chunkManager.update()` that precedes `engine.start()`. Any
   per-frame limit must also be published the moment it is known, or
   exactly one entity escapes it.
106. **`player.isAttacking` cannot be set from outside** —
   `player.update()` overwrites it from its own timer every frame. A
   probe that sets it measures all zeros and looks like a broken
   feature. Call `_performAttack()`.
107. **Clearing a world-shaping flag does not un-build the chunks made
   under it.** Chunk contents are cached, so lifting the Nightmare
   warp and calling `update()` left every already-built chunk warped —
   the player woke into a Sanctuary sitting in nightmare ground. Call
   `rebuildAllChunks()` after any change to the height field.
108. **A radial pattern is the cheapest "this is unnatural" signal
   there is.** Erosion, tectonics and fBm are all directionless, so
   concentric rings centred on a point read as imposed rather than
   grown — worth more than any amount of extra noise.
109. **Darkening an already-dark palette produces black.** The drained
   Nightmare skin took a 0x22262c band to 0.01 linear. Any global
   darkening pass needs a FLOOR, and the floor must lift toward grey
   rather than clamp per channel.
110. **Capping enemy LEVEL says nothing about how hard they hit.**
   `atk = template.atk * levelMult`, and templates vary hugely between
   species — capped level-2 creatures measured at atk 55 against a
   base of 92. Bound the variable the player actually experiences:
   damage per hit, as a fraction of their own maxHp.
111. **A power that only edits a stat is not a power the player has.**
   The innate Aspect gave +22% vitality and nothing to press, and the
   owner reported it as not having their Aspect at all. Give it a
   verb.
112. **A `loadout.bar` entry has no `.name`** — it is
   `{memory, ability, key}`. Reading `entry.name` yields `undefined`
   and reads as a broken ability. Use `entry.ability.name`.
113. **`memory.power` is what every damaging Aspect multiplies, and it
   silently defaults to 20.** A synthetic Memory built without it
   makes every ability on it feel broken rather than absent. Set
   `power` on anything that carries an active.
114. **The 1..9 bar now follows the WEAPON IN HAND** (innate first,
   then in-hand weapon, then trinkets). This reverses the earlier
   all-slots-contribute rule at the owner's request — do not restore
   it. `setActiveSlot` must `_rebuild()` or the old weapon's spells
   stay on the keys.
115. **Clear `loadout._cooldowns` between ability probes.** A second
   test press inside the cooldown returns ok:false silently and reads
   as an ability that deals no damage.
116. **A concurrent cap is not a budget.** The spawner limited how many
   enemies existed at once and re-armed forever, so no fight could be
   finished — only left. If an encounter must END, count TOTAL spawns.
117. **A shared timestamp may only be written on one path.**
   `_lastStruckAt` was assigned inside the Unbroken epithet's branch
   because that was its only reader; a second reader (out-of-combat
   regen) then saw it never advance and healed through fights. Before
   reusing a clock, check every path writes it.
118. **A synthetic COMBAT_HIT does not take the enemy-damage path.**
   A plain object as `source` skips the branch that stamps combat
   state and applies epithets. Spawn a real enemy to test incoming
   damage.
119. **`initGame()` runs ONCE on `window load`, before any character
   exists.** Anything it generates and guards with `if (!x.seed)`
   belongs to the browser session, not to the Pioneer — so every
   character after the first inherits the first one's. Per-character
   state must be reset AND regenerated in `startGame`, where "a
   different person exists" is actually known.
120. **A `reset()` that misses the guard field is worse than none.**
   `NightmareSystem.reset()` cleared everything except `seed` — the
   one field the regeneration guard reads — plus two memoised caches
   and four spawner fields. Reset the thing the guard tests, first.

---

## 1. What this is, in one paragraph

A first-person dark-fantasy RPG — **"The Fracture"** — in vanilla
Three.js. The sky broke; an organisation called the Sanctuary sends
"Pioneers" out to harvest what spills from the wound and calls it mercy.
Infinite procedural terrain, 13 biomes, a hand-built safe hub, a 7-quest
main arc plus a 4-step tutorial, element-typed dungeons in separate
realms, a permanent rank ladder, an emergent alignment system that
replaced character classes, and a drawn-sigil craft with a
~1,380-identity spell space.

**Two build targets, one codebase:**

| Target | Constraint | Command | Status |
|---|---|---|---|
| **Local HD build** | none | `npm run dev` | **the active target** |
| Claude Artifact | single HTML, ~16MB, no external requests | `npm run bundle` | kept working, not optimised for |

`low` tier is exact parity with the artifact build. Everything HD-only
is gated behind a tier check or an asset-loaded check and degrades
rather than throws.

**Where things are**
- Game root: `/Users/shauryashah/AG/Project Mozzarela/game`
- Git root is `/Users/shauryashah` (the home dir) — a pre-existing
  quirk, not a bug to fix. This directory is the source of truth.
- Artifact URL: `https://claude.ai/code/artifact/cef54840-2356-415b-a6df-ae111678508c`
  — always pass as `url` when publishing or it forks a new one.

**Run & verify**
```bash
cd "/Users/shauryashah/AG/Project Mozzarela/game"
npx vite build     # fast syntax/import sanity check
npm run dev        # Browser pane preview_start, name "mozzarela"
```

⚠️ **F6 / peace mode now defaults OFF.** If the wilderness looks busier
than you remember, that is why — not a regression.

**Keys:** **Tab the Pioneer menu — every panel, one door.** Kept direct: B the Loom · V bindings · I satchel · K the Ascent. **G/H/J the three combat slots.** 1–9 the loadout hotbar · Z/X/C abilities · R dodge · E interact · F3 perf · F4 tier · F6 peace mode. Everything else (the Rite, the wand, the forge, grimoire, journal, codex, attunement) is in the Tab menu, which also answers each panel's own letter while open.

**New systems this pass:** `SaveSystem` (a run that survives) · `SiteSystem` (the seven wilderness structures, now usable) · `BoonSystem` (shrine blessings) · `EpithetSystem` (a name you are known by) · `TACTICS` in Enemy.js (six approaches, per species). ⚠️ **Saves live in `mz_save_v1`**, with one generation of backup in `mz_save_v1_prev`. `__mz.saveSystem.clear()` starts a fresh character; `restorePrevious()` rolls back one generation.

---

## 2. The Story Bible

Source of truth: `data/story.js` (dialogue/lore), `systems/QuestSystem.js`
(mechanics), `data/landmarks.js` (places), `data/sanctuary.js` (hub cast
+ tutorial), `data/ascent.js` (the ladders).

### Premise & tone

Original vocabulary, not a retelling: **the Fracture**, **Pioneers**,
**essence**, **attunement**, **the Doctrine**, **Saturation**, **the
Mithril Core**, **Descents**, **the Ascent**, **Weaves**, **Echoes**,
**Memories**. Voice is quiet dread — restrained, literary,
second-guessing. Every NPC has doubts about their own side.

### ⚠️ The tonal split is mechanical, not just written

Owner's brief: *"keep the spawn normal and regular fantasy… but battles,
trials and all dark like a dark fantasy."* Both halves are **factors on
the same palette values**, so they can never fight:

| | key light | ambient/hemi | dread vignette |
|---|---|---|---|
| Sanctuary | ×1.95 | ×1.35 | damped to 35% |
| open world | ×1.0 | ×1.0 | HP-driven |
| **Descent** | **×0.45** | **×0.55** | **floor 0.28 at full HP** |

Measured entering a Tier 1 Descent: key 1.85→0.83, ambient 0.42→0.23.

⚠️ The Descent floor does **not** reach zero. A fight you cannot see is
not atmospheric, it is broken.

### ⚠️ There is no path choice and no class

Both removed, for the same reason: they asked the player to declare an
identity at a menu before doing anything, contradicting the systems that
replaced them.

- **Class → `LeaningSystem.calling()`** — an emergent name from what you
  are made of and how committed you are.
- **Path → a starting position.** Everyone begins Cinderbound; the
  Leaning moves from there under play, all the way across.

### The main quest chain (mq1–mq7)

Strictly sequential, one active at a time. mq1 Awakening (explore),
mq2 First Blood First Doubt (kill ×3), mq3 The Elder's Wisdom (talk —
Aris at world 5,5), mq4 The Buried Shard (gather — Sunken Foundations),
mq5 The Long-Attuned (talk — Ostra at −6,8), mq6 The Unmoored (kill Vell
at Vell's Hollow), mq7 What the Fracture Wants (talk → 3-way modal,
`FINALE_NARRATION.aris/self/ostra`, permanent dialogue change after).

Side quests sq1–sq3 are live from game start, untracked by design, and
surface **only** in the Journal.

### The tutorial (t1–t4) — a THIRD quest list

⚠️ Deliberately NOT prepended to the main arc: mq1 is "leave the
Sanctuary", and gating that behind a chore makes the player's first
tracked objective a checklist. Runs in parallel, advanced by the verbs
it teaches (`NPC_INTERACT`, `PLAYER_ATTACK`, `SPELL_CAST`,
`DESCENT_ENTER`).

⚠️ `_progressTutorial()` gates on the **active** quest's type. Without
that, casting during t1 banks progress toward t3, and t3 completes the
instant it becomes active with no explanation.

### The Sanctuary cast (`data/sanctuary.js`)

Captain Hald (watch, gives t1), Quartermaster Bel, Smith Orren, Sister
Merrow, Archivist Pell, **Gate-Warden Tove** (scouts Descents — §5).
Everyone has one job and **nobody is mysterious**. That is the point:
Ostra and the wilderness read better against people who just tell you
where the smithy is.

⚠️ These are ordinary NPCs. Nothing in that file may consult
LeaningSystem or AscentSystem. A shopkeeper does not have a philosophy.

### Landmarks (`data/landmarks.js`) — 5 fixed places

| Landmark | World pos | Ties to |
|---|---|---|
| The Sunken Foundations | (120, 134) | mq4, sq2, `foundation_masons_log` |
| Vell's Hollow | (−182, −198) | mq6 |
| The Scar | (−114, 238) | pure discovery — the ground's answer to the sky rift |
| The Hanged Choir | (244, −172) | Ostra / attunement-erodes-identity |
| The Drowned Watch | (−250, 78) | "the Fracture's edge MOVES" |

Adding a sixth = an entry plus a `_build<Name>()`. The dispatch in
`_buildLandmarks` is a `{id: builder}` table and warns on an unknown id.

⚠️ **The Scar's technique.** Not a terrain-height modification
(`getGroundY` is the most performance-critical function in the game) and
not a carved chasm mesh (it would disagree with the height field physics
believes). It is a ribbon that samples `getGroundY()` at every vertex —
two layers, a wide ember halo with a narrow white-hot core.

---

## 3. Art Direction & House Style

`style.css`'s header names it: **"A Grimoire Bound in Iron"**.

**The four house rules, verbatim in the stylesheet:**
1. No border-radius. Corners are cut or square (except true circles).
2. No `backdrop-filter`. Panels are solid objects.
3. No gradient fills on controls. Depth comes from rules, insets, hard
   shadow.
4. Ornament is stroked geometry (`ui/Sigil.js`), never texture.

⚠️ **`--foil`** exists because Heaven's `--chrome-bright` is a dark
brown tuned for cream *pages* and vanishes on Heaven's dark leather
*binding*. Anything mounted on `--backdrop` uses `--foil`.

**Sigil vocabulary:** `sigil()`, `elementGlyph()`, `cornerFiligree()`,
`ruleOrnament()`, `fractureRule()` (the jagged split — the loaded
divider, on all three title screens), `vesselMark()`, `wandMark()`.

**Verified-deliberate conventions:**
- **PBR throughout.** `createToonMaterial()` is a vestigial name.
- **One emissive focal point per object.** Deliberate contrast.
- **Deferred-init for scene-graph singletons** — empty constructor plus
  explicit `init()` from `initGame()`. This bug class recurs.

---

## 4. Rendering, World & Performance

### ⚠️ THE CHUNK-BUILD PASS (owner: "reduce lagg / takes a long time")

**Measured first, and the answer was not where the render settings
are.** One chunk cost **16.6ms median / 41.7ms worst** to build against
a `drainChunkQueue` budget of **6ms** — 2.8× the entire frame budget for
a single chunk, so the budget could never do anything (the do/while
always builds at least one) and every chunk crossing was a visible
hitch. 49 chunks in view at ultra ≈ **813ms** of stalls to fill the
world.

Phase breakdown: **terrain mesh 17.8ms of 20.2ms — 88%.** Rocks 2.1ms;
trees, clutter and structures together under 0.2ms. Decorations were
never the problem.

Inside the mesh: **80% of all height evaluations exist only to compute
normals.** Pass 3 called `getHeightAt()` 4× per vertex — 21,316 calls
per chunk — and each one re-ran `getBiomeWeights()` and its blend loop,
**completely bypassing the `BIOME_STEP = 8` coarse cache pass 1 builds
directly above it for exactly that reason.** The optimisation was
already written and documented; pass 3 just never used it.

| fix | effect |
|---|---|
| Pass 3 reuses pass 1's per-vertex blended biome params | removes all 21,316 biome lookups |
| `mountain` layer early-outs on `mountainFactor > 0.004` | skips a 5-octave ridge in the 6 biomes where it is exactly 0.0 (and the blend ring around them) — the only layer in the stack that computed itself in full and *then* multiplied by zero; `_plateauNoise` and `crag` already guarded |

**16.6 → 12.7ms median (−23%), 41.7 → 19.1ms worst (−54%).** The worst
case is the one that matters — it is the hitch you feel walking into
new ground.

⚠️ **Still ~12.7ms per chunk, still over the 6ms budget.** What remains
is raw simplex evaluation (≈5 height evals per vertex × ~15 noise calls
each) and it is inherent to the height function, not waste. The next
real lever is either fewer chunks or fewer vertices, both of which cost
something visible — do not spend it without asking. ⚠️ `EPS = 0.75` in
pass 3 stays a fixed world unit, NOT `segSize`; see the note there.

### ⚠️ THE PERFORMANCE PASS — read before touching render settings

Four causes; two were regressions from raising render distance.

| fix | before → after |
|---|---|
| **GTAO at half res** | composer 22.0ms → **12.3ms**. GTAO alone was ~10.5ms — **2.7× the cost of drawing the world** (scene render is 3.9ms). |
| **Point-light budget (nearest 8)** | 34 visible. Three bakes light COUNT into every shader, so a chunk with a brazier streaming in **recompiled every material** — one frame at **667ms**. |
| **Shadow camera snapped to a 6-unit grid** | any shadow-cam movement invalidates the map; it re-rendered a 2048² VSM map every frame of walking. Render 21.1ms → 7.3ms. |
| **Bounded eager chunk build + `renderer.compile()`** | `while (isStreaming) drain(1e9)` built 121 chunks synchronously; the loading bar froze at 85%. |

Real frame loop while walking: **11.6ms median ≈ 86fps**.

⚠️ `_syncRenderSize()` must keep AO at **half** device res — that line
re-pinned it to full and silently undid the optimisation on resize.
⚠️ The light budget traverses the **whole scene**, not
`decorationGroup` — prop lights live in several places, and budgeting
one group left 24 of 67 burning.
⚠️ Remaining hitches are **first-sight shader compilation**.

### Quality tiers — `rendering/Quality.js`

`low | medium | high | ultra`, GPU-sniffed, `?q=` or **F4**. Apple
Silicon auto-detects to `high`.

| | low | medium | high | ultra |
|---|---|---|---|---|
| pixelRatioCap | 1.0 | 1.0 | 1.15 | 1.25 |
| chunkResolution | 24 | 40 | 64 | 72 |
| renderDistance | 2 | 2 | 2 | 3 |
| decorationDistance | 1 | 1 | 2 | 2 |
| propDetail | 0 | 1 | 2 | 3 |

⚠️ `RENDER_DISTANCE` was a hardcoded **1** — a 3×3 grid, 192 units
across — and thick fog existed to hide an unload boundary ~96m from the
player's face. "Everything is foggy" and "the world feels small" were
one bug.

### The render pipeline

`RenderPass → GTAO → Bloom → GodRays → OutputPass → CinematicGrade → SMAA`

- **OutputPass is load-bearing.** three.js only applies tone mapping /
  colour-space conversion to the DEFAULT framebuffer, never a render
  target — without it ACES and sRGB silently do nothing whenever a
  composer is in play. Largest image-quality bug in project history
  (scene rendered at luma 52, reached screen at 14).
- **CinematicGrade** — ⚠️ split-tone tints MUST be luma-normalised
  (`tint / dot(tint, LUMA)`); naive `col * tint` multiplies BRIGHTNESS
  and once made the game unplayably dark.

### The sky — `rendering/Atmosphere.js`

**The sky rift** — a jagged emissive crack across the dome, always
present. `uRiftAxis` is fixed and never re-set per frame.

**⚠️ The world follows your dominant TRAIT, not a path.** `TRAIT_SKIES`
— one palette per element, **blended over** the base by that element's
share. Cast light and the world is bright and clear (fog ×0.45, exposure
×1.22); cast void and it closes in.

⚠️ Blended and share-weighted, never swapped — a hard swap strobes the
sky whenever the dominant element changes hands. `applyTrait()` ignores
sub-0.04 changes because `apply()` **re-bakes the IBL cubemap**.
⚠️ Saturation is NOT a palette key — it lives on the grade pass.
`atmosphere.traitSaturation` is applied in `syncGrade()` **after**
`applyGradePreset`; swap the order and it does nothing.
⚠️ Trait colours must be verified **outside the hub** — the Sanctuary's
warm haze deliberately masks them at spawn.

### ⚠️ DESCENT VISIBILITY — read before touching the tonal split

Owner: "the Dungeons are too dark, and not visible at all what the
player needs to do." Both halves were real, and the first half was a
regression **this project introduced by compounding three correct
decisions**:

| | was | now |
|---|---|---|
| key crush | ×0.45 | **×0.66** (`descentKey` 0.55 → 0.34) |
| ambient/hemi floor | ×0.55 | **×0.74** (`descentFloor` 0.45 → 0.26) |
| fog thickening | ×1.8 | **×1.22** (`_descentAmount * 0.8` → `* 0.22`) |
| fog `near` in a Descent | **22 units** | **45 units** |
| view inside fog | **82%** | **63%** |

⚠️ The crush values were tuned when the air was thin. The fog pass then
made base fog much thicker, and a Descent multiplies that again — three
individually-correct numbers multiplying out to blind. There is now a
**hard floor of 45 world units on `fog.near`** in `_applyFogRange`, on
top of the ratio, so no combination of contributors can put fog in the
player's face again.

⚠️ **A Descent had NO light sources at all.** The claim that "the
element's own emissive light and the boundary become the things you
navigate by" described an intent nothing implemented — the boundary is
`MeshBasicMaterial`, which emits nothing. `DescentSystem._buildPyres()`
now rings the arena with **8 real point lights** (at the nearest-8 light
budget, deliberately not above it — §4). Point lights give DIRECTION,
which is why the fix is not "raise ambient": ambient is directionless
and raising it flattens the scene.

⚠️ **Measure Descent lighting OUTSIDE the hub.** The Sanctuary's ×1.95
key lift very nearly cancels the Descent's crush (1.85 × 1.95 × 0.45 =
1.62, i.e. it looks almost untouched), so a reading taken at spawn says
the crush is not applying. Same trap the trait-sky note warns about.

⚠️ **The tracker said where you were, never what to do.**
DESCENT_PROGRESS fired only when a wave SPAWNED, so it read "Wave 1 of
3" from first second to last — no remaining count, no objective. It now
republishes on every change and drives `#descent-objective`:
"4 left" → "Clear — next wave incoming" → "Kill it — 62% left".

### ⚠️ The fog pass (owner: "add fogg")

Three separate things, each with its own failure found live:

1. **Range.** `_applyFogRange`'s ratio window was `0.28 … 0.75` off a
   `0.62` base — in ordinary air the haze started at ~74% of the draw
   distance, i.e. there was effectively no fog in play at all. Now
   `0.18 … 0.68` off **0.52**, ≈48% of the view. ⚠️ The first attempt
   used 0.42 (≈58%) and that was **too far**: past roughly half the
   view, fog stops adding depth and starts erasing the thing it adds
   depth to — a Frozen Tundra whose ground is `#90a8c8` rendered solid
   ember. `far` is still pinned to the world edge, so none of this
   re-creates the old curtain; the boundary was covered either way.
2. **Colour.** Fog tracks the horizon so distant terrain dissolves into
   the sky — right, and it must stay. But at FULL saturation it paints
   every pixel past `near` one vivid hue. Now lerped 22% toward its own
   luminance: enough to stop the flooding, far too little to band.
3. **Ground mist** — `_buildGroundMist`, new. Distance fog has no
   near-field presence at all; mist is the part you walk through.
   ⚠️ Two big sheets, and **every layer sits BELOW eye height, offset
   from the ground under the player, not at absolute Y**. Both are
   corrections to a first version at absolute y = 2/6/13: a horizontal
   plane at eye level is seen edge-on, and a 365-unit plane seen
   edge-on **covers the entire frame** — it was not mist, it was a
   full-screen colour wash. Absolute Y also put the sheets underground
   on high terrain. Tinted 45% toward bone, never the fog colour
   itself, for the same reason as (2). Off at the `low` tier.

`atmosphere.setFogStrength(v)` / `?fog=1.4` is the single dial for all
of it, persisted like `?q=`.

**⚠️ Fog is a CEILING now, not a floor.** It used to be a curtain sized
to hide the unload boundary. Now light aerial haze, ~half strength at
the far edge. `setDrawDistance` derives it (`0.69 / targetDist`, where
0.69 ≈ −ln 0.5) so raising render distance keeps the same look. Both
`apply()` and `update()` use `min()` — leaving one as `max()` brings the
curtain back one frame later.

**Fog/light contract** — `scene.fog.density` and `key.intensity` each
have EXACTLY ONE writer: `Atmosphere.update()`. Everything else
publishes a factor. Arrived at by hitting the failure twice.

**IBL** — no HDRI; the game's own sky dome renders to a cubemap and is
PMREM-convolved, so reflections always match and re-bake free.

### Terrain

Chunk-based infinite world, `CHUNK_SIZE=64`, 7 noise layers, 13 biomes
plus a flat "Sanctuary" override within `dist < 2.5` chunks.

**⚠️ Ground height is ANALYTIC, never a raycast.** `getGroundY(x,z)`
evaluates the height function directly — O(1), exact, works where no
chunk is loaded. Replaced a per-frame per-entity raycast against a
93,000-triangle mesh. **Any new entity needing ground height calls it.**

**⚠️ Terrain normals are ANALYTIC too.** `computeVertexNormals()`
averages only faces *in that geometry*, so chunk-edge vertices came out
tilted and neighbours disagreed — a hard lighting seam on a
mathematically smooth surface, and the one artefact more resolution
cannot fix. Measured **11.43° worst → 0.0195°**. Epsilon is a fixed 0.75
**world units**, deliberately not a fraction of segSize (which would
make low and ultra disagree about identical ground).

**Real geometry for rocks/trees** — 22 CC0 Poly Haven photoscans,
decimated to ~2k tris. ⚠️ Weld BEFORE simplify or meshoptimizer quits
early on seam-split topology.

**Structures** — ⚠️ for most of the project's life these only generated
inside the hub's 160-unit radius despite doc comments claiming
otherwise. A new structure kind must be wired into
`_generateWildernessStructures()` specifically.

### Geometry smoothness

⚠️ `GeoForge.seg()` / `icoDetail()` existed and **EntityForge used them
zero times** — its own doc comment said they were written for it. 171
geometry calls are now tier-aware.

⚠️ `seg()` needs an absolute FLOOR, not just a multiplier: `base × 2.2`
turns a 4-sided cone into a 9-sided cone, which still reads as a prism.
The eye counts sides below ~16.

**`roundedBox()` / `weather()`** — architecture was all raw
`BoxGeometry`; a sharp 90° edge is the strongest voxel cue there is.
⚠️ `computeVertexNormals()` after is not optional.

**Macro variation** — `applyTriplanar` takes `macro`/`macroMix`, a
second sample at a larger scale. ⚠️ **7.3, not 8** — an integer multiple
puts it back in phase every N repeats and reintroduces the pattern it
exists to destroy.

---

## 5. Systems Reference

### The five questions about the player

Five genuinely different lifetimes. **Collapsing any two is what made
progression illegible before.**

| System | Question | Lifetime |
|---|---|---|
| `AttunementSystem` | what you are **made of** | fluid, **decays** |
| `LeaningSystem` | which philosophy you **enact** | drifts, partly permanent |
| `AscentSystem` | how far down you have **been** | permanent, never falls, **gated** |
| `ProgressSystem` | how much you have **done** | permanent, never falls, **ungated** |
| `LineageSystem` | what you **are** | innate, chosen **once**, never changes |
| `MarkSystem` | what you have **survived** | permanent, earned by circumstance |
| `CoreSystem` | how much you can **hold / put out** | capacity=Class, quality=Rank |
| `ThreadSystem` | what you were **always going to be** | rolled once, dormant, fires late |

⚠️ These map onto the reference framework's own split — Rank
(`AscentSystem`, rare/qualitative) vs Class (`ProgressSystem`,
grindable/quantitative), plus Aspect (`LineageSystem`), Attributes
(`MarkSystem`), Memories (`MemoryForge`) and Echoes (`SpoilsSystem`).
All of the framework's knobs now exist, and Rank is **convex with a
hard Refusal cap** — see "RANK, THE CORE, THREADS AND TRIAL KINDS".

### Lineages & Awakening — the Bleach-shaped system

Owner's brief: weapon upgrading / "memory ascension", with the player's
race deciding what the upgrades are. Files: `data/lineages.js`,
`systems/LineageSystem.js`, `systems/AwakeningSystem.js`,
`ui/LineageUI.js` (**N**).

**What is actually load-bearing** in the borrowed structure is not the
tiers — it is that *the weapon has a name that is asleep, and how you
wake it depends on what you are*. So the ladder is a fixed SHAPE
(Dormant → Sounded → Released → Ascended, `AWAKENING_STAGES = 4`) and
each of the six lineages fills it with its own verb, currency and
grants. Measured at the top rung: Hollowed 2.33× damage but **maxHp
×0.82**; Latticer 0.59× mana and *no* damage multiplier; Ashborn 2.25×
paid in 72 permanent HP; Choirbound only 1.82× because it applies to
every weapon at once.

| Lineage | Verb | Paid in | Character |
|---|---|---|---|
| Sablewright | Sounding | Memories (seal) | balanced; pushed toward Refinement |
| The Hollowed | Unmasking | Echoes (devour) | highest damage, **real HP cost**; pushed toward Appetite |
| Latticer | Gathering | element fragments | caster; cheap mana, poor melee |
| Reliquar | Recollection | **bond** — kills with THAT weapon | no items; swapping starts over |
| Ashborn | Kindling | **your own vitality** | the only ladder climbable without ever descending |
| Choirbound | Chorus | Memories, **one shared ladder** | never holding the "wrong" weapon; slowest |

⚠️ **Lineage is chosen ONCE and never changes.** A lineage you could
respec into is a loadout, and the interesting thing about it is that it
closes doors.

⚠️ **It is NOT picked at character creation** — that is the exact trap
that killed classes and paths (§2). You start Unsounded; `suggest()`
reads your attunement and Leaning and offers a *reading* ("You come back
smelling of shadow. And you have been enacting the Appetite.") which you
confirm or refuse. The declaration happens in the world, after play,
with the game having already said what it thinks you are.

⚠️ `suggest()` reads `elementShares()` as `{ id, value, share }` —
**NOT `element`**. Destructuring `{ element }` compiles, runs, and
contributes zero forever (§5). This project has already shipped that
once.

⚠️ **Choirbound's shared ladder lives in `_key()`**, which returns one
constant for them and a per-weapon key for everyone else. That is the
mechanic, not an optimisation — do not "simplify" it. Verified: a
Choirbound's axe inherits the sword's rung 2; a Reliquar's axe is rung 0
and its bond does not transfer.

⚠️ **Nothing here assigns a stat.** `atkBonus` is published as
`player.awakenAtk` and folded by `Player.recomputeStats()` (the single
writer); `maxHpMult` is published as `player.lineageHpMult` and folded
by `ProgressSystem._applyLevelStats()` (the single writer of maxHp).
Assigning maxHp in AwakeningSystem would have been **silently refunded
by the next level-up** — the Hollowed's whole trade would have quietly
stopped being a trade.

⚠️ The `damageMult` grant is gated on `data.source === 'player'` at the
hit site, for the same reason the Leaning multiplier is: COMBAT_HIT also
carries enemy-on-enemy and reaction damage.

⚠️ **A mechanic the player cannot find is not a mechanic.** The whole
lineage system shipped invisible: nothing in the HUD, nothing in the
key-hint bar, no prompt. The owner's report was "the races are not
updated" — from their side, correctly, nothing had changed. There is
now a third permanent line in the vitals cluster (`#lineage-readout`,
sibling of the Ascent's — three different facts, three lines), N and H
in the key hints, and one nudge fired on the first level-up.
⚠️ The nudge is deliberately NOT at second zero: `suggest()` reads what
you have already been doing, and prompting the Rite immediately would
be reading an empty page.

### The two doors into BindSystem

`BindUI` (**V**) is the full registry — every Weave, Echo, Memory,
**forged thing (`GEAR`) and active Aspect**. `WandMenuUI` (**H**) also
binds, from the row of the Weave you are looking at, because telling a
player who cannot find a key that a *different* panel owns keys is not
an answer. **One registry, several doors** — the Loom's Equip page and
the satchel's Loadout block bind too. Every one of them calls
`bindSystem.bind()` through `bindUI._beginCapture()`, so the
one-thing-per-key and one-key-per-thing rules hold across all of them
**and the reserved-key refusal cannot drift between copies**.

⚠️ `GEAR` and `ASPECT` are easy to confuse and are NOT the same job.
`ASPECT` binds one *ability* of a Memory that is **already equipped**;
`GEAR` binds the **Memory itself**, and its letter summons and
dismisses it. Reaching for `ASPECT` when you want `GEAR` is what left
the project with no key that could equip anything — see "A LETTER PER
FORGED THING" in §7.

⚠️ `bindSystem.bind()` returns `{ ok, reason }`, **not a boolean**.
Testing it as a boolean makes every rejection read as a success and
throws away the only text that tells the player why a reserved key
refused them.
⚠️ The repaint event is `BINDINGS_CHANGED`. `Events.BIND_UPDATE` does
not exist, and `eventBus.on(undefined, fn)` registers a listener under
the key `undefined` that nothing ever emits — it fails completely
silently, which is the worst possible way for a repaint to be wrong.

**Progress (character level) — the floor, not the ceiling.** Added
because the owner reported "there is no way to level up without
dungeons, which is too hard at the start", and they were exactly right:
Ascent is deliberately Trial-gated, Attunement is fed by *casting*, and
a new player with neither had no progression at all for their first
hour.

It was **designed and never built**, in this project's most repeated
pattern. Every half of the wiring was already in the tree — `Player`
declared `level`/`xp`/`xpToNext` and never touched them again, `Enemy`
computed and shipped `xp` in COMBAT_KILL, `Events.PLAYER_LEVEL_UP` was
declared and never emitted, and `WAND.LEVEL_POWER_STEP` was documented
as "added per player level" and read by nothing. Only the middle was
missing.

⚠️ **It grants no identity.** Flat vitals and a small additive power
step, nothing with a name on it. Rank, title, philosophy and doctrine
stay with the other three. **The Ascent's refusal is untouched** — see
its file header; do not "helpfully" let a level buy a rank.

⚠️ XP from a kill is scaled by the level gap (8% floor far below you,
a bonus for punching up). Without that the optimal strategy is standing
in the level-1 plains forever, which also defeats the spawner's
distance ramp.

⚠️ Non-combat sources exist on purpose (quests, landmark discovery, a
**first-time** weave, a survived Descent). "Not only dungeons" is only
truly answered if it is also "not only combat".

**Leaning** = deeds (irreversible, never decay) × 0.65 + residue
(derived live from attunement) × 0.35.

⚠️ `elementShares()` returns `{ id, value, share }` — **NOT `element`**.
Destructuring `{ element, share }` compiles, runs, and silently
contributes ZERO forever. Caught only by watching the bar not move while
the emergent name (a different accessor) *did* change.
⚠️ water/earth/lightning are deliberately absent from
`ELEMENT_ALIGNMENT` — they belong to neither side but still count toward
the denominator, so an unaligned caster sits at exactly 50/50.
⚠️ **PLAYER ONLY.** The COMBAT_HIT handler checks
`data.source === 'player'` — that event also carries enemy and reaction
damage. Verified at 100% Cinderbound: player→enemy 100 became **130**;
reaction and enemy→player stayed **100**.
⚠️ `AttunementSystem` must **not** import `LeaningSystem` (Leaning
imports Attunement — a cycle). The instability factor is applied where
the surge is actually rolled.

**Ascent** — two divergent ladders, five ranks each, trial-gated.
**Depth alone never ascends anyone**: grinding to Depth 500 in a field
leaves you Unproven forever, by design. `ui/AscentUI.js` (**K**) shows
Depth and Trial as **two independent bars, never merged** — one combined
number would actively lie about that.

### Descents — element dungeons in a SEPARATE REALM

⚠️ They used to be a cylinder drawn around you at the Gate's own
coordinates. You are now **moved** to a band ~500,000 units out, offset
deterministically per (element, tier). Verified: overworld (120,120) →
873,737 units away → back to exactly (120,120).

⚠️ `chunkManager.realmMode` suppresses Gates AND landmarks there — both
are placed by distance-from-spawn hashes, so realm coordinates would
qualify as deepest-tier wilderness and a Descent would be full of
Descent Gates you could open from inside another.

**Seal (Ascendant) vs Devour (Cinderbound)** — either is available to
either path; taking the wrong one still clears the dungeon and pays
fragments but banks **no Trial**, out loud.

### ⚠️ Scouting — "the dungeons cannot be located"

The nearest Gate is ~210 units from spawn and ~89 are within walking
range. They were never missing — the map only drew Gates whose chunk had
already **loaded**, i.e. ones you had already walked past. Circular, and
it made the entire Ascent loop unreachable.

`gateForChunk()` / `gatesNear()` are pure hash math;
`ChunkManager.scoutGates()` resolves real positions without building
anything. **Talk to Gate-Warden Tove.** ⚠️ The hash math was
**extracted, not copied** — two copies would drift and the failure mode
is a compass pointing confidently at nothing. Verified: scouted and
built positions differ by **0.0000 units**.

### Weaving — the craft (`data/weaving.js`, `systems/BrewProcess.js`)

Potions are gone entirely. Threads, Tension, Ply, Set, Cores, Weaves.

⚠️ **A re-theme plus an extension, not a rewrite.** The resolver, the
identity space, the recipe book and the order-dependence are the same
verified code underneath.

**The Working is non-commutative** — the old `analyze()` summed a bag,
so `fire+ice+salt === salt+ice+fire` always, giving three ingredients
exactly one outcome. Now the vessel has state between steps: **the first
thing in defines it, the last delivers it.** Verified: five different
spells from the same three ingredients.

**Catalysts** (`data/catalysts.js`) — fragments are NOT ingredients;
they transform the finished spell, and *which* transformation depends on
tension when they go in. **1,380 distinct spell identities**, counted by
enumeration.
⚠️ Fragments don't count toward `addedItems` (three fragments alone is
not a weave) but `isBrewable` accepts them — two different questions.
⚠️ `isCellDiscovered()` prefix-matches, because a catalysed id carries a
suffix; a plain `has()` reported "0/60" right after announcing a fusion.

### ⚠️ Runes are GENERATIVE, not a lookup

It was a **14-entry exact-match table** on a 37-dot grid — ~99.6% of
drawable shapes were dead ends, so the craft stopped sustaining interest
the moment you had found the fourteen. Now the shape's own geometry
produces the rune: length, winding, closure, chirality, entropy,
**dominant turn** (the effect family), symmetry, focus.

⚠️ The dominant-turn family is what makes the space large — without it
17,184 signatures collapsed to **228** outcomes. With it: **674 distinct
outcomes / 60 effect sets** (a sampled lower bound; the 91-dot grid
supports far longer paths). Grid radius 3 → 5.

The 14 authored runes survive as **True Runes** — exact signatures with
authored names layered ON TOP of the derived values.

## ⚠️ THE MEMORY FORGE — the Loom's new job (B)

Owner: replace weaving outright with the Shadow Slave power system,
end to end. Reference doc: `~/Downloads/shadow-slave-power-system.md`.
Files: `data/memories.js`, `systems/MemoryForge.js`,
`ui/MemoryForgeUI.js`, `systems/MarkSystem.js`.

**The Loom no longer brews a spell.** It forges a **Memory** — a
Weapon, Charm, Echo, Raiment or Relic — which the game names itself
and gives its own generated Aspects to.

### The one rule everything rests on

**GRADE IS A COUNT, NOT A MULTIPLIER.** Grade decides how many Aspects
a Memory carries. Verified end to end:

| cores | grade | Aspects | Flaws |
|---|---|---|---|
| none | Flawed | 1 | 1 |
| 2 common | Common | 1 | 0 |
| 2 rare | Epic | 3 | 0 |
| 2 epic | Legend | 4 | 1 |
| 3 legendary | Myth | 5 | 1 |
| 4 legendary | Divine | 6 | 2 |

⚠️ If a future session is tempted to make ascension a damage number
because it is easier to balance: **don't**. A Rare with two Aspects and
an Epic with three are different objects, not the same object scaled.
That is the whole borrowed structure.

### ⚠️ The sign→property mapping is a CLASSIFIER, and it was rebuilt

The owner's ask was "each weaving sign must be assigned a specific
property". The first version keyed on the signature's **dominant turn
code** — five codes, five attributes, total and one-to-one, and
completely unusable. `dominant` is the mode of a turn histogram: not
anything a player can see or aim at. Measured on deliberate gestures,
*"a gentle right arc", "a gentle left arc"* and *"a zigzag hard right"*
all returned the SAME property. **A mapping you cannot intend is a die
roll with extra steps.**

Now classified from qualities the player controls, and shown on screen
permanently so they can aim:

| draw this | get |
|---|---|
| close the shape | **Vitality** |
| keep it straight | **Strength** |
| jagged / erratic | **Perception** |
| coil clockwise | **Agility** |
| coil anticlockwise | **Willpower** |

⚠️ **Handedness is MEASURED, not assumed.** `chirality > 0` is
**clockwise on screen** — established by shoelace on real hexToPixel
coordinates (+1 → +4505 = clockwise). Axial winding runs opposite to
most people's mental model. If the two coil rules look swapped to you,
re-run that measurement before "fixing" them; the rule text is
player-facing instruction and must not lie.

⚠️ `classifySign` takes the FIRST match, so closure beats straightness
beats handedness. Reordering `SIGN_PROPERTIES` re-points every sign.

### ⚠️ The name space is measured, not assumed

Names are derived from a hash of the recipe, so the same forge always
produces the same Memory. **Two rounds of fixing:**

| | distinct names | of |
|---|---|---|
| v1 (16 words, 2 styles under Legend) | 509 | 3,000 |
| v2 (24 words, 4 styles) | 2,991 | 6,000 |
| v3 (all styles 3-slot) | **5,418** | 6,000 |

v1's real problem was a space of only **512** at low grades. v2 still
had three of four constructions on two word slots, and those small
pools dominated collisions no matter how big the fourth was. All four
are 3-slot now (24³ each). Realistic 50-Memory run: **4%** of runs see
any repeated name. ⚠️ Count WHOLE names across a wide sweep — per-slot
counts look healthy in every broken version.

### Marks — the fourth build knob (`systems/MarkSystem.js`)

The reference calls the four-knob split the source of build diversity:
one identity trait, a pool of small traits, active abilities, passive
boons. This project had three — Lineage, Memories, Echoes — and was
missing **Attributes/Marks**.

⚠️ **Earned by circumstance, never bought.** Every Mark is granted for
having survived a specific situation (`Thin Ice` — end a fight below
10% health; `Giant-Killer` — kill something five levels above you;
`Unbroken` — clear a Descent untouched). A list of Marks should read as
a biography. They are small in isolation on purpose; Marks that were
big would just be levels with a story attached.

⚠️ They feed **the same five attributes** as Memories, so a build is
legible across both. Do not add a sixth attribute.
⚠️ Distance is guarded at `< 40` units/frame — a Descent teleports the
player ~500,000 units and would otherwise award every distance Mark in
one frame.

## ⚠️ THE LOADOUT — 3 weapons, and the 1..9 bar

`systems/LoadoutSystem.js`, plus the **Equip & Enchant** page inside
the Loom (B). Closes "the made memories/echoes can't be equipped" and
"I should be able to equip up to 3 weapons with keybinds 1-9".

**Why nothing forged could be used:** `BindSystem` has always had a
`memory` kind, but it fed from `SpoilsSystem.memories` — the powers
that crystallise out of a SEALED Descent — while a Memory forged at
the Loom is an inventory item. **Two different things wearing the same
word.** Everything the forge produced could be made, previewed, and
never equipped.

- THREE weapon slots; one is "in hand" (melee reads that one).
- Non-weapon Memories are *carried* (charm / relic / raiment).
- ⚠️ The bar is **DERIVED, never stored** — rebuilt wholesale whenever
  the loadout changes, so unequipping cannot leave a stale key
  pointing at an Aspect you no longer own.
- ⚠️ Nine is a hard ceiling (nine number keys). Overflow is REPORTED
  in the panel, never silently dropped.
- ⚠️ Cooldowns key on `memoryId:abilityKey`, not the ability key —
  two Memories can both roll `Sweep`, and one shared timer would make
  the second look broken.
- ⚠️ Digit1–9 added to `RESERVED_KEYS` in the same commit as the
  handler (trap #7). They were free after the old six wand slots were
  removed; they are not now.

### ⚠️ Active vs passive is DECLARED, and weapons are guaranteed one

`ability.active` decides whether an Aspect takes a hotbar key. Owner's
rule: only active attacks go on the bar. It is declared per template,
never inferred — "Cleave" and "Step" are both verbs and only one is a
button.

⚠️ **A weapon's first Aspect is FORCED active.** The pools are mostly
passive by design, which meant a Memory could roll all-passive and
reach the bar with nothing on it — observed live as an Epic weapon
reading "0 active · 3 passive" with an empty bar. Verified across 599
random forges: **0 weapons without an active**. Charms are NOT forced
(they are meant to lean passive).

⚠️ Every active Aspect resolves to a real effect in main.js's
`ASPECT_USED` handler, and the `default` branch **warns loudly**. An
ability that spends Essence, plays a cooldown and does nothing is
indistinguishable from a bug.

## ⚠️ THE SATCHEL SHOWED NOTHING YOU WERE CARRYING

Owner: "I can't see the weapon in the inventory, nor its abilities,
nor can I change the keybinds."

**The satchel's Loadout block was STATIC MARKUP.** Four slots, every
one containing a hardcoded `—`, and **nothing anywhere filled them in**.
It had presumably never worked; the old single-weapon equip path never
wrote to it either. Combined with auto-equip taking the Memory out of
the bag, a forged weapon was invisible in the one panel a player opens
to ask "what do I have".

`InventoryUI._renderLoadout()` owns it now: three weapon slots (marking
which is in hand), carried Memories, armour, and for each Memory its
**inscription** and **every Aspect** — actives showing their key with a
`rebind` control, passives marked passive and keyless.

⚠️ The rebind button hands straight to `bindUI._beginCapture()` rather
than reimplementing "press a key". One capture flow, so the
reserved-key refusal and its message cannot drift between two copies.

### The keybinds were not broken — the refusals were silent

Measured: rebinding to a free key worked the whole time
(`KeyO→Skewer of Vitality`, HUD label followed, persisted). What did
NOT work was discovering that: most obvious keys are RESERVED, and a
refusal only ever surfaced as a flash inside the bindings panel. Press
G, nothing visible happens, conclude the feature is broken.
⚠️ The flash says `"G is already the game's."` — verified. If a future
change moves that message, the feature becomes "broken" again without
a single line of logic changing.

### ⚠️ A prune that would have wiped every saved keybind on boot

I nearly shipped this. Pruning stale ASPECT bindings inside
`_rebuild()` looked obviously right, and would have:
 1. run at init with an EMPTY loadout — so every aspect binding
    restored from localStorage would be deleted on every single boot;
 2. re-entered infinitely, because `unbind()` emits BINDINGS_CHANGED
    and main.js answers that by calling `_rebuild()`.

It is now an explicit `pruneBindings()`, called only after an
equip/unequip when the loadout has actually settled, guarded by a
re-entrance flag, and **returning early when nothing is equipped** —
an empty loadout cannot distinguish a stale binding from one whose
Memory simply is not in hand yet.
⚠️ Regression-tested by binding a key, reloading, and confirming it
survived a boot where the loadout starts empty.

## ⚠️ WHY THE ACTIVE ASPECTS WERE UNUSABLE

Owner: "I still can't use the active abilities." Three separate causes,
all confirmed live, none of which was the loadout logic:

1. **Forging did not auto-equip.** A Memory sat in the satchel until
   the player found the Equip page — so it was made, previewed, and
   inert. It now goes into a free weapon slot (or is carried) on forge.
   ⚠️ A FULL loadout is left alone: silently displacing a weapon the
   player chose is worse than not equipping.
2. **There was NO hotbar in the HUD.** Measured `anyLoadoutBarInHud:
   false`. The Aspects existed, held keys, and fired correctly when
   driven from a console — and were completely invisible in play.
   **A power the player cannot see is a power they do not have.**
   `#loadout-bar` is injected by WandUI above the wand row.
3. **`V` could not rebind them.** BindUI listed Weaves, Echoes and
   spoil-Memories; an Aspect is none of those. `BIND_KINDS.ASPECT`
   now exists and the panel has an Aspects section.

⚠️ **Defaults AND overrides, not either.** An Aspect holds a number key
1..9 automatically so a forged Memory is usable immediately without
visiting a config panel; binding it in V OVERRIDES that. An entry with
a custom bind **stops answering its default number** — otherwise moving
one to Q leaves it firing on both Q and 3, which reads as a duplication
bug the first time the cooldowns disagree.
⚠️ `bindSystem` ids are `memoryId:abilityKey`. An ability key alone is
not unique — two Memories can both roll Sweep.

## ⚠️ RUNIC SORCERY, SECOND PASS — no fixed alphabet

Owner: "remove things like the ring, the straight, make it different
each time, as no emblem is one and the same." Correct, and the first
implementation deserved it: fourteen fixed runes matched by shape rule
("close the shape → KETH") is a menu with extra steps, and it made
every inscription look like every other one.

**A rune is now DERIVED FROM THE STROKE.** Name, meaning and
connotation all come from the exact signature, so two emblems that
differ anywhere are different runes. Measured: **2,254 distinct whole
runes** across a 9,000-stroke sweep (was 14). Names are generated from
three separately-salted syllable draws — MOSHE, THUTHOU, ZELSHU.

What survives is the part that carried the design: **GRAMMAR**. Every
rune still has a class, because a sequence has to parse as a sentence.
The class comes from the stroke's PROPORTIONS (a tendency to lean on)
rather than a rule to follow, and the panel shows the three classes
instead of an alphabet — there is no alphabet to show.

### ⚠️ The class thresholds took four attempts. Count the spread.

The raw weight is tightly clustered (p22 = 0.187, p65 = 0.267), so
small moves swing the spread violently:

| thresholds | verb share | verdict |
|---|---|---|
| 0.40 / 0.19 | **5.4%** | nothing could form a sentence |
| 0.235 / 0.125 | **79.2%** | overcorrected |
| 0.217 / 0.137 | **81.7%** | jitter subtracted instead of added — arithmetic error |
| **0.316 / 0.236** | **36.9%** | subject 39.6 / verb 36.9 / qualifier 23.4 |

⚠️ `w` is raw weight PLUS a uniform 0..0.099 jitter (mean 0.0495), so
a threshold meant to sit at a percentile of `w` must **ADD** that mean
to the raw percentile. Getting that backwards is what produced the
third row. Re-derive and re-count after ANY change to the formula.

Legibility now rises with effort — 2 emblems 31%, 3 emblems 54%,
4 emblems 72% — which is the right curve: writing more gives a better
chance of a sentence the Spell can read.

⚠️ Sign chips show the RUNE (name, meaning, class), not the old
shape-bucket. If a chip ever reads "The Straight" again, the
uniqueness has been undone somewhere upstream.
⚠️ Drawing is more forgiving: two dots is enough (was three), and the
hit tolerance is 19/17 viewBox units (was 16/15).

## ⚠️ RUNIC SORCERY — runes are LETTERS (data/runic.js)

Researched from the wiki at the owner's instruction, and it **overturned
the previous design**. What the source actually says:

- *"Runes are the individual letters or symbols in one of the dead
  languages called the Runic Language."*
- *"Enchantments were simply expressions of the enchanter's will, and
  the runes were the building blocks with which the enchanter
  manipulated the movement of energy."*
- *"By understanding the grammatical structure of the language, it was
  easy to extend the meaning of the runes into a more correct
  translation. For example, there were different runes for the word
  'change', each with its own connotation."*
- Runic Sorcery **transcribes true names in writing**; the Sorcery of
  Names speaks them aloud.
- Two kinds of rune **the Spell refuses to translate**.

### What that changed

The old system read a stroke as "an attribute plus a temper". That is
not writing — it is a stat roll with a nice interface. If runes are
LETTERS then a stroke inscribes ONE RUNE with a MEANING, a sequence
spells a PHRASE, and **grammar decides whether the Spell can read it.**

- **14 runes**, each a letter with a meaning, a connotation, a
  grammatical class (subject / verb / qualifier) and an inscribing
  rule the player can see and aim at.
- ⚠️ **VOR and THULE both mean "to change"** and differ only in
  connotation — one takes away, one gives back. That is the source's
  own example, made mechanical, and it is what makes this a lexicon
  rather than a lookup table.
- ⚠️ **The UNTRANSLATED rune is real.** Long, closed, maximally
  erratic. It is the strongest thing you can write and the panel
  will not tell you what you wrote, because the thing doing the
  reading will not say.

### ⚠️ ORDER IS THE SENTENCE

The first parser found "a subject" and "the last verb" and built the
same reading regardless of order — so `AESH·THULE` and `THULE·AESH`
both read "ember to change" and the grammar was decoration.

Now the FIRST rune is what the inscription is about and the LAST is
how it resolves — the same "first defines it, last delivers it" rule
this project already applies to the Working. Opening on a verb is an
**imperative**, opening on a subject is a **statement**, and the mood
is mechanical (x1.12 potency for the imperative), not just wording.

Verified live:
| written | reads | power |
|---|---|---|
| `AESH · THULE` | "Ember, to change." (statement) | 42 |
| `THULE · AESH` | "To change — and let it fall on ember." (imperative) | 47 |
| `AESH · KETH` | "No verb. This names a thing without asking it to do anything." | 36 |

⚠️ **Legibility is rewarded, not merely flavoured** (x0.72 for an
inscription the Spell cannot parse). Otherwise grammar is decoration
and there is no reason to learn it. A malformed inscription still
works — the source is clear that runes move energy regardless.

⚠️ **The VERB selects the ability family** (`VERB_FAMILY` in
MemoryForge). Every `verb` value in RUNE_LEXICON must appear in that
table or the sentence parses, reads correctly to the player, and then
silently falls back to the temper's family — the readout would promise
something the Memory does not do.

⚠️ The lexicon is shown ON SCREEN, always. Runic Sorcery is "the most
widely known and easily accessible school" in the source; a player
should be able to read what they are writing without memorising it.

⚠️ Property and temper still exist and still supply the attribute and
the fallback family — they are measured and teachable and there was no
reason to throw them away. The RUNE's own attribute wins where it has
one, because the letter is the thing being written.

## ⚠️ THE SECOND SIGN AXIS — TEMPER (why weaving was "limited")

A sign used to carry only `attribute x magnitude` — **5 x 6 = 30
possible contributions in the entire game** — and the ability it
produced was chosen by hashing the recipe, not by what was drawn. So
two completely different shapes with the same attribute gave the same
thing, and no shape could be aimed at an ABILITY. That is the whole of
"the runes are very limited" and "weaving doesn't yield an effective
outcome".

**Temper** is a second, independent read of the same stroke, taken
from the geometry the property classifier does not use — and it
SELECTS the ability family, so a player can draw at a specific power:

| draw | temper | family |
|---|---|---|
| one long unbroken run | Piercing | pierce |
| keep changing your turn | Erratic | spread |
| symmetrical both ways | Enduring | ward |
| wound hard one way | Driving | move |
| long, covering the field | Vast | spread |
| short and unremarkable | Plain | strike |

⚠️ **ORDER IS THE RULE, and it was tuned against DELIBERATE strokes,
not random ones.** The distribution can look perfectly healthy while
the table is unaimable — both of these were live:
 · `enduring` first caught every STRAIGHT line, because a straight
   signature (`wwwww`) is trivially a palindrome. "Draw it straight"
   produced Enduring, not Piercing. Hence the `focus < 0.34` guard.
 · `vast` before `erratic` caught every long jagged stroke.
⚠️ Re-run BOTH checks after any change: the six deliberate shapes must
each hit their own temper (currently **5/6**; a 3-dot stub reads as
Driving, which is correct — one turn is maximally chiral), AND no
temper may fall below ~5% on a random sweep.

Measured: 30 → **59** distinct sign contributions, **31** ability
kinds, **602** distinct ability names.
⚠️ `The Ring` was widened from bare `closed` to also accept
`|winding| >= 0.8` — requiring the exact starting dot made Vitality
**3.8%** of strokes, a fifth of the attribute space nearly unreachable.

### Enchanting has its OWN rune grid

⚠️ A **second, independent** `RuneGridUI` on the Equip page. Reusing
the forge's grid would mean drawing an enchantment silently altered a
half-composed Memory on the other page. Enchanting does not change
grade (that is cores/ascending) — it re-weights what the Memory
already is and re-derives its Aspects from the fuller sign set.
⚠️ It replaces the Memory **wherever it lives** — equipped, carried or
in the bag. Enchanting changes the seed and therefore the id, so
adding the new one to the bag while the old stayed equipped would
leave the player wielding the version they just paid to replace.

## ⚠️ DESCENT COST AND DIFFICULTY

**Enter/exit was ~50 chunk rebuilds.** Entering discarded every loaded
chunk and queued 25 fresh; exiting did it again — measured 25 queued
in each direction at ~13ms each, ≈650ms of stalls per round trip for
terrain already paid for once.
 · `ChunkManager.setRealmMode()` now **STASHES** the overworld's built
   chunks instead of destroying them (realm coords are ~873,000 units
   away, so keys cannot collide) and restores them on return.
 · `renderDistance` is clamped to 1 inside `realmMode` — a Descent is
   a bounded arena 40–88 units across behind a visible boundary, and
   streaming a 3-chunk radius built 25 chunks to render a space that
   fits in 9.
 · Measured after: **9 queued on entry, 25 restored instantly on exit,
   0 queued.**

**Tier 1 was harder than the world outside it.** The nearest Gate is
~224 units from spawn, and a Shallow Descent threw **level-7** waves
and a **level-9 Warden at 2.2x HP** — while EnemySpawner's distance
ramp deliberately caps the overworld near spawn at level 1–2. The two
systems have to agree about what "early" means.
 · waves `3 + tier*3 + wave` → `1 + tier*2.5 + wave*0.7`
 · warden `5 + tier*4` → `2 + tier*3.2`
 · warden HP a flat `x2.2` → `1.5 + tier*0.18` (ramps instead)
 · Tier 1: wave **7 → 4**, warden **9 → 5**, HP **2.2 → 1.68**.
   Tier 5 is barely touched (14 / 18 / 2.40).

## ⚠️ THE EXPLOIT AUDIT — every finding, and why it existed

An adversarial pass over the value-bearing systems, each finding
DEMONSTRATED live before being fixed and re-tested after. Do not undo
any of these guards without reading why they are here.

### The two that mattered most

**1. One Trial bought the entire Ascent.** `requirementsFor()` carried
a comment saying *"it satisfies THIS rank and no other, or a single
lucky delve would carry someone to the top of the ladder"* — and the
code beneath it did exactly the forbidden thing, because
`some(t => t.tier >= next.tier)` is true for EVERY rank once you hold
one deep Trial. Measured: one recorded tier-5 Trial + a spammed
`tryAscend()` took Rank 0 → **Rank 5** in one call stack. Depth is
grindable, so this reduced the whole Ascent to "clear one deep
Descent" — and silently defeated the entire Rank-vs-Class separation
in `data/ranks.js`, since Rank turned out to be purchasable with the
cheap axis after all.
⚠️ Trials are now **consumed** by the rank they buy (`spentOn`).
Verified: one Trial → exactly Rank 1; five Trials → Rank 5, 0 unspent.

**2. `coreSystem.spend(-1000)` granted 1000 Essence.** A negative cost
passes `essence < cost` trivially and then subtracts a negative.
Measured 40 → 1040. Any cost computed from a subtraction can go
negative.

### The economy (`InventorySystem`) trusted every caller

| attack | before | now |
|---|---|---|
| `addItem(item, -5)` | **removed** 5 from the stack | refused |
| `addItem(item, NaN)` | stack became NaN **permanently**, and `NaN >= n` is false forever so every later `hasItem` silently failed | refused |
| `moveItem(999, 3)` | grew `slots` to **length 1000**; item stranded where no loop reaches, target overwritten with `undefined` | refused, bounds-checked |
| `consumeItems(id, -3)` | sailed past `hasItem` (which compares `>=`) and took nothing while reporting success | refused |
| `removeItem(i, 5)` with 3 held | removed 3, returned **true** | returns false |

⚠️ `addItem` now REPLACES the stored item on a stack rather than only
bumping the count. Stacking keyed on `id` kept whichever object
arrived FIRST — and `MemoryForge.ascend()` deliberately preserves a
Memory's id, so ascending a Memory you held two of **threw the upgrade
away and kept the old one while the cores were spent**. Measured:
Rare/2-Aspects ascended to Epic, inventory still held the Rare.

### Crafting handed out rewards it had not been paid for

⚠️ `transmute()` called `consumeItems()` and then added the dust
**regardless of the return value** — a duplication vector by
construction. It also let a negative quantity through, because
`hasItem(id, -5)` is true (every count is >= a negative).
⚠️ `forge()` had the matching hole: `Math.min(NaN, n)` is NaN and
`NaN < 1` is **false**, so a NaN quantity walked past the guard into
the consume/produce pair. Payment is now taken first and aborts the
whole craft if any part fails.

### HP and XP were unvalidated

| attack | before |
|---|---|
| `player.takeDamage(-100)` | hp 50 → **150**, above maxHp |
| `player.takeDamage(NaN)` | hp NaN — `hp <= 0` false forever, so **immortal**, bar renders empty |
| `player.heal(-100)` | hp 50 → **-50** |
| `progressSystem.award(Infinity)` | level 1 → **2861** in one call |

All reachable from live multiplier chains (a resist above 1, a `0/0`,
an `undefined` anywhere in the damage maths) — none needs a console.
Player and Enemy both clamp at BOTH ends now, and the level loop is
bounded so a corrupted `xpToNext` cannot hang the tab.

### The forge panel lost and capped your materials

⚠️ Closing the Loom with cores committed left them held by a UI object
the player cannot see — recoverable only by reopening and pressing
Unpick. `toggle(false)` returns them now.
⚠️ `_toggleCore` TOGGLED, so a player holding twenty Ember Cores could
commit exactly **one**. Grade was capped by "how many distinct item
types do you own" rather than how much material you brought. It adds
now; the committed row takes one back.

### What was already defended (verified, do not re-fix)

Reserved-key injection via tampered `mz_bindings` (dropped on load) ·
`?fog=-999` (clamped) · weave charge inflation (bounded at 2x max) ·
re-sounding a Lineage · Echo cooldowns · activating an unowned Echo ·
casting with no mana · double-entering a Descent · resolving one
before its Warden is dead · ascending past Divine · `rankMatchup` with
NaN/huge/negative · Marks are idempotent.

⚠️ **Regression-tested after every fix**: kills still pay XP, damage
still lands, forging still produces (`Hymn of the Long Debt`, Epic,
3 Aspects), equipping still works, Marks still fire, console clean.
A guard that breaks the game is worse than the hole it closed.

## ⚠️ RANK, THE CORE, THREADS AND TRIAL KINDS

The four gaps against the reference framework, now closed. Files:
`data/ranks.js`, `systems/CoreSystem.js`, `data/threads.js` +
`systems/ThreadSystem.js`, `TRIAL_KINDS` in `data/descents.js`.

### 1. Rank is convex, and THE REFUSAL is the mechanic

The two axes existed and the split did nothing: Rank's grants were
flat and small (+8% damage) while Class was unbounded, so a level-40
Unproven simply beat a level-8 Sovereign. **When the cheap axis
substitutes for the expensive one there is only one axis.**

`RANK_POWER = [1, 2.2, 5, 12, 30, 80]` — ratios widen as you climb.
But convexity alone is out-scalable, so on top sits **the Refusal**: an
attacker two or more Ranks below its target cannot deal more than a
fixed fraction of that target's MAX HEALTH per hit.

⚠️ It is a **CAP, not a multiplier**, and that is the entire mechanic.
A multiplier can be out-ground; a cap cannot. Measured against a
Rank-5 target with 100,000 HP:

| attacker | damage |
|---|---|
| Rank 0, level 1 | 7 |
| Rank 0, **level 80** | **7** |
| Rank 0, a **100,000**-damage hit | **150** |
| Rank 3 | 23 |
| Rank 5 | 59 |

⚠️ NOT immunity — capped damage is still real, so an underranked
player who fights asymmetrically can still win a siege. The reference
is explicit that the path should be tactics, not impossibility.
⚠️ Applied **LAST**, after every other multiplier. A cap applied
before other multipliers is not a cap.
⚠️ It cuts **both ways** — creatures far below you cannot chip you
down either, which is what makes a Rank feel like a category change.
⚠️ ONE ladder for players and creatures (`rankForLevel`), under one
set of names, so threat is readable with a single mental model.

### 2. The Core — volume vs grade

⚠️ **CAPACITY comes from Class. QUALITY comes from Rank. Neither
crosses over.** That split is the whole file. Measured:

| | capacity | quality |
|---|---|---|
| Lv1 Rank0 | 40 | ×1 |
| **Lv50** Rank0 | **334** | ×1 |
| Lv50 **Rank5** | 334 | **×8.94** |

Grinding gives you a bigger reservoir of *cheap* Essence and never
better Essence. ⚠️ Essence does NOT replace mana — mana fuels Weaves,
Essence fuels a Memory's Aspects. Collapsing them puts the game back
on one resource and undoes the split.
⚠️ Quality is applied in exactly ONE place (`output()`). A second call
site makes Rank compound with itself.
⚠️ Core quality uses `sqrt(RANK_POWER)`, deliberately gentler than the
damage curve — two exponentials on the same axis compound absurdly.

### 3. Threads — dormant, rare, silent

⚠️ **NOT a character-creation choice.** Classes and Paths were both
removed for making the player declare an identity at a menu; a Thread
is *rolled* once, never shown, and does nothing until a late trigger.
Measured **6.09%** of runs carry one.

Verified: invisible before the trigger (`snapshot().name === null`,
1 Core), still dormant at Rank 2, fires at Rank 3 (Cores 1→2, capacity
40→80, name revealed), and fires **exactly once**. `longmemory`
verified reaching the forge: 3 Aspects → 4.

⚠️ The trigger is a **RANK**, not a level or play-time — Rank is the
axis grinding cannot buy, so a Thread cannot be farmed into.
⚠️ Grants are **pulled** (`threadSystem.grant('extraAspect')`) at the
moment they matter, not pushed into four systems.
⚠️ Do NOT surface these in a character sheet, raise the odds because
testers did not see one, or allow a re-roll. Each turns it back into a
menu, which is the thing it was designed to avoid.

### 4. Trial kinds — the shape decides the reward

Every Descent was the same trial. Now a Descent has a **kind**, and the
kind decides both the fight and which build knob it feeds:

| kind | shape | pays |
|---|---|---|
| **Cull** | waves, then the Warden | cores (fragments in full) |
| **Vigil** | more, weaker waves — pressure | **Marks** |
| **Hunt** | almost no escort; the quarry IS the trial | **Memories** |
| **Vault** | open it and survive having opened it | **Echoes** |

⚠️ `trialKindFor(element, tier)` is **deterministic**, never rolled at
entry — a Gate must be able to name it *before* you commit, because
being chosen is the entire mechanism by which this creates build
diversity. ⚠️ Tier 1 is always a Cull: meeting a Vigil as your first
Descent is learning two things at once.
Counted across all 11 elements x 5 tiers: Cull 18, Vault 13, Hunt 12,
Vigil 12. Live Hunt verified end to end — tracker read
"The Standing Charge · Sunless · Hunt" and it paid a Memory
("Starving Fang of the Third Vigil") forged through the SAME
MemoryForge path a player uses, not a parallel one.

⚠️ Non-Cull kinds still pay ~55% fragments. A trial paying no crafting
input at all would make three of the four kinds useless for forging.

### Still open

- **The old brewing panel still exists** (`CauldronUI`), no longer on
  any key, reachable via `__mz.cauldronUI`. The spell resolver still
  backs Weaves in the wand. Decide whether Weaves and Memories coexist
  or whether Weaves retire.

### ⚠️ CONFLUENCE — stacking signs, and the brake on it

Owner: "the weave should create a completely unique twist, don't put a
limit on the no. of weave, the weaves should enable the creation of
something new, unique and absolutely insane."

`MAX_SIGNS` is **Infinity**. It was 3, on the reasoning that a fourth
turned the sign from a choice of geometry into a stacking exercise —
wrong in the direction that mattered, because stacking barely did
anything and the cap was limiting a mechanic not yet worth limiting.
`_combine` is a plain product and derived runes sit near 1.0 on every
multiplicative key, so four signs resolved to about the same weave as
one.

`foldRunes` now makes the COUNT itself a term, superlinearly, and names
the result (`CONFLUENCE_TIERS`: Paired → Triune → Braid → Cascade →
Sixfold → **The Unspeaking Choir**). Measured end to end through the
Loom, same three reagents:

| signs | damage | instability |
|---|---|---|
| 1 | 47 | 0.00 |
| 3 | 127 | 0.26 |
| 6 | **647** | **0.65** |

⚠️ **The instability brake took TWO fixes and both are load-bearing.**
 1. In `foldRunes` it must be a **floor**, not a multiplier — single
    runes multiply instability by values well under 1 (a calm shape is
    supposed to steady a weave), and seven of those products cancelled
    the escalation completely. Measured non-monotonic: 0.52 → 1.06 →
    0.87 → 0.97.
 2. In `PotionSystem` the rune term multiplies the RESOLVED
    instability — and a cleanly-handled brew resolves to exactly **0**,
    so `0 × 2.14 = 0`. A six-sign weave was landing 466 damage at zero
    risk, making "brew perfectly, then lay six signs" both the most
    powerful and the SAFEST play. There is now a count-driven floor on
    the resolved value too.
⚠️ `CONFLUENCE_TIERS` is ordered **highest-first** — `find(t => n >= t.min)`
takes the first match, so a low-first order pins every stack to the
bottom tier forever.

⚠️ **The grid is bigger via CSS, not via `SIZE`.** `RuneGridUI.SIZE` is
in viewBox units and the SVG is CSS-scaled to fit, so raising SIZE
alone changes **nothing** on screen — the viewBox just scales back
down. The dial the player feels is `.rune-grid`'s `max-width`
(330 → 560) plus a `max-height: 42vh` so the field cannot push itself
below the fold. Dot count is unchanged at **91** (GRID_RADIUS 5), per
the owner's "keep the no. of dots same but increase the size".

⚠️ **Several signs fold onto one weave (no cap).**
Combining was *implemented and unreachable*: `PotionSystem.brew()` has
taken `signedRunes` as a LIST since it was written and `foldRunes()`
exists for no other purpose (multiplicative keys multiply, additive keys
sum) — but `CauldronUI.signedRune` held exactly one, so every draw
silently REPLACED the last and the fold never folded. The field is
`signedRunes` (an array) now; chips are click-to-strike.
⚠️ One rune may be laid ONCE. Otherwise the cheapest power move is
drawing the same shape three times and the sign stops being a choice of
geometry — same reasoning as BindSystem's one-thing-per-key rule.
⚠️ Derived runes carry `glyph: null` and runes.js promises the UI will
"draw their own path". Nothing did, so the Loom's chip rendered
`d="null"` — an invalid path and a blank chip for all but fourteen
runes. `RuneGridUI.traceGlyph()` generates it from the stroke, and
`_commit()` returns a COPY (writing a glyph onto a True Rune would edit
the shared module table for the session).
⚠️ `RuneGridUI.clear()` takes a message because it is called *by* the
onSign consumer, immediately after `_commit()` wrote the rune's name
into the readout — the default text used to erase the only feedback the
player gets.

⚠️ Name and blurb must read the SAME property — 'Straight' was keyed on
entropy while the blurb was keyed on winding, so a tight left spiral
called itself Straight while describing itself as curling. Verified
across 3,900 runes: 0 contradictions.

### ⚠️ Bindings replaced spell slots (`systems/BindSystem.js`)

Six fixed slots on Digit1–6 became `key → thing`: uncapped, the
player's choice, for **Weaves, Echoes and Memories** alike. **V** opens
it. WandSystem's `slots[]` became `held` (a Map keyed by Weave id);
`infuse(index, x)` became `hold(x)`.

⚠️ One thing per key AND one key per thing — without the second rule a
Weave sits on three keys sharing one charge pool and reads as a
duplication bug.
⚠️ `RESERVED_KEYS` must match every key handler in the project.
⚠️ `_load()` drops bindings whose key has *since* become reserved, so a
new game key cannot brick a returning player's movement.
⚠️ BindUI's capture mode swallows **every** keypress — hence the
full-panel overlay and Escape-to-cancel. Without loud visible state a
player pressing J for the journal silently binds something to J.

### Echoes & Memories (`systems/SpoilsSystem.js`)

⚠️ **Designed and never built.** `REVENANT_BOUND` was emitted into
nothing; `REMNANT_CLAIMED` was never emitted at all. Devouring binds an
Echo (the Warden, `friendly: true`, ~20s); sealing crystallises a Memory
(11 element powers). You cannot get both from one Descent — you cannot
both put a thing back and keep it.

### Spell VFX (`rendering/SpellVFX.js`)

Form → shape and gross motion. **Element → character** (a per-frame
animator: fire rises and gutters, earth *drops*, wind corkscrews, ice
holds rigid, lightning snaps, void shrinks). **Catalyst → flourish.**
Verified by full-state-vector diff: **11/11 elements and 22/22 catalysts
distinct**.

⚠️ **Shape first, glow second.** The first version was additive with a
white core; through bloom every element came out as the same white blob.
The shell is now opaque, depth-writing and emissive (Standard, not Basic
— Basic has no shading and gives flat stickers), with a dark back-face
rim, and the additive glow *inside* it.
⚠️ Animators must be allocation-free — they run per projectile per
frame.
⚠️ Trail bodies are parented to the SCENE so they can lag — removing the
projectile does NOT remove them. Verified 12 casts: 43 → 91 → **43**.

### Other things that were broken and are not

- **Interaction (E)** — ⚠️ `NPC.interact()` was never called by
  anything. `NPC_QUEST_TRIGGER` never fired, so mq3/mq5/mq7 — **the
  entire finale** — were uncompletable, silently, with no error.
- **The wand starts with one Weave.** It shipped with zero infused
  slots, so t3 ("cast three spells from the wand") was impossible and
  the whole spell system was unreachable until the player found the Loom
  unprompted.
- **Collision** — ⚠️ the "I am stuck" bug had three causes: full revert
  on overlap (no slide), no escape if you started inside a box
  (unrecoverable), and full-height boxes. Now per-axis resolution,
  depenetration, step-over below 0.6m / duck-under above 1.85m.
  `_addCollider(mesh, shrink)` insets by a *fraction* of half-extent.
- **Peace mode (F6)** — suppresses the **ambient** spawner only, and
  now **defaults OFF** (the testing pass it was raised for is over).
  Still persisted in localStorage, so a returning player keeps whatever
  they last pressed. Never touches `spawnNamed()` (Descent waves,
  Wardens, Vell), or the Ascent loop would be untestable.
- **The wilderness population.** Ambient spawns are placed on the
  analytic ground (`getGroundY`, never `playerPos.y + 10` — the
  player's own Y says nothing about the ground 40 units away, so
  creatures spawned downhill fell through the world), 30–56 units out
  so they *walk* to you rather than materialising in melee range, and
  culled past `despawnRadius` — ⚠️ **named uniques exempt**, or the
  distance cull deletes Vell the moment you leave his marker.
- ⚠️ **Difficulty is now a function of distance from spawn, not of
  biome alone.** Biomes are scattered by noise, so the Shadow Realm
  (`enemyLevel` 15) can and does border the Sanctuary — a player two
  minutes out met level-15 wraiths, which is the whole of "the start is
  too hard". The biome's level is a CEILING eased into over the first
  ~1.2km (quadratic; identity past `FULL_DIFFICULTY_AT`), so the deep
  world is untouched. Measured for a level-15 biome: 300m→1, 500m→2,
  700m→5, 900m→8, 1200m→15.
- ⚠️ The hub is guarded **twice** — by the player's distance AND by the
  chosen spawn point's. The ring is centred on the player, so standing
  at the gate put half of it inside the Sanctuary.
- **Item lookup: two tables.** `MATERIALS` is the registry; `DROPS` has
  INLINE definitions that exist only there (e.g.
  `mithril_core_fragment`). `MATERIALS.find()` returns `undefined`
  forever with no error.

---

## 6. Verification Methodology

**⚠️ The single most important fact:** the Browser pane reports
`document.hidden`, which suspends `requestAnimationFrame` entirely.
`engine.fps` reads 0, the canvas is 0×0 until fronted, and `gl.finish()`
timing is meaningless.

This produced a real failure: the owner reported lag three times and
every available measurement said 100–250fps. Both were true.

**Recipe, in order of preference:**
1. `preview_start` (name `mozzarela`), **fresh tab every time**.
2. Drive the UI via `javascript_exec` on real DOM elements. Synthetic
   WASD `KeyboardEvent`s are unreliable; don't fight it.
3. **`window.__mz`** — not `await import()`. See trap #1. It carries
   engine, player, chunkManager, atmosphere, wandSystem, bindSystem,
   spoilsSystem, questSystem, descentSystem, ascentSystem, leaning,
   attunement, eventBus, Events, THREE, and the UI singletons.
4. `read_console_messages` **without** `onlyErrors`; treat stale entries
   with suspicion.
5. Force state directly (`__mz.chunkManager._loadChunk(cx,cz)`,
   `__mz.engine.onUpdate(1/60)`) rather than navigating to it.
6. **Count output distributions** for anything hash/probability-based.
7. Code review is an acceptable tier when live navigation genuinely
   isn't practical — not as an excuse to skip a check that is.

**Note:** the world seed is `Math.random()` per load, so terrain around
a landmark differs every reload. A landmark screenshot is not
reproducible between runs; only its contents are.

**PerfHUD:** F3 frame meter (fps, median, **p95**, worst, tier, draw
calls, triangles), F4 cycles tier (reloads — a tier change touches
shadow size, resolution, pass list and pixel ratio, none of which can be
hot-swapped honestly).

---

## 7. Current State & Where To Go Next

### ⚠️ THE WOVEN THINGS WERE INVISIBLE AND HALF OF THEM WERE INERT

Owner: *"animate the attacks of woven weapons, armour, and all the
woven things, as they can't be seen used at all, no materialisation no
animation as well, lastly I can't even see the model of the weapon, or
woven object on me, neither is anything."*

Every clause was literally true, and **four independent causes** sat
behind them. None was in the Loom, the forge, or the Memory data —
the whole Memory system worked. It just never reached the player.

| # | cause | measured before |
|---|---|---|
| 1 | `LoadoutSystem.equipWeapon()` never called `Player.equipWeapon()` (trap #23) | `weaponMount.children 0`, `_meleeWeaponMesh false`, `weaponAtk 18` while the Memory's power was 19 |
| 2 | `Player.equipArmor()` threw a ReferenceError on **every** call (trap #24) | `PLAYER_EQUIP_VISUAL` never fired, ever |
| 3 | 5 of 15 active Aspects had no effect branch (trap #26) | `skewer scatter chorus charge vault` → console warn, nothing else |
| 4 | Nothing in the project drew anything for a Memory | one 12-particle puff at the player's chest, shared with every hit in the game |

⚠️ **A Raiment carried no `defense` field at all.** `MEMORY_FORMS.raiment`
declares `equips: 'armor'` and `Player.equipArmor()` reads exactly that
field — so the one form whose blurb is *"it decides what reaches you"*
decided nothing, on top of never reaching the armour path. It is now
`(4 + vitality × 1.6) × potency`, led on vitality to match the form's
own `lead`, and scaled by the same `potency` a weapon's attack is — so
grade and legibility read on a Raiment the way they read on a Weapon.

**New file: `rendering/WeaveVFX.js`.** A fixed pool of 14 transient
shapes — swept blade `arc`, thrust `lance`, ground `ring`, ward `dome`,
dash `streak` — plus `materialise()`. Same construction rules as
ParticleBursts (round-robin slot stealing, geometry built once,
materials owned per slot and only recoloured) and the same art rule as
SpellVFX (**emissive Standard with a real dark base colour, never
additive white** — §3, and the reason that header exists).

**Materialisation.** A woven thing now knits itself into your hand:
three counter-rotating thread rings collapse onto it from a 2.4× radius
while the object scales up out of nothing with a 12% overshoot and its
emissives flash and settle. Verified frame by frame:
`scale 0.076 → 0.466 → 0.736 → 0.877 → 0.907 → 0.850`, cage gone at
0.6s, nothing left in `_materialising`.
⚠️ The cage is parented to the OBJECT (so it inherits viewmodel
sway/bob for free) and **counter-scaled by the object's own animating
scale each frame**, or the two multiply into each other.
⚠️ `_applyAwakenGlow()` runs **before** `materialise()`. materialise
reads each emissive part's CURRENT intensity as the value to ease back
to, so the other order silently cancelled the awaken glow on every
weapon swap — §7.8's warning arriving through a new door.
⚠️ `_equipViewmodelWeapon` cancels any live materialisation on the
OUTGOING weapon before unparenting it, or weaveVFX ticks a detached
object forever.

**Aspect motions.** `ASPECT_SHAPES` in main.js — six shapes
(`overhead spin thrust guard flourish tuck`), not fifteen hand-tuned
transform sets, with `ASPECT_SHAPE_FOR` mapping every active onto one.
⚠️ Every `active: true` key in ABILITY_POOLS must appear in
`ASPECT_SHAPE_FOR`; the resolver warns on a miss for the same reason
the ASPECT_USED `default` does. Measured peak deviation from rest, all
returning to an identical resting pose:

| Aspect | shape | what moves |
|---|---|---|
| hew | overhead | pitch −0.95 → **−3.25**, driven down and forward |
| sweep | spin | yaw −0.32 → **+2.88**, right around |
| brace | guard | up and across (x +0.20, y −1.17) and **held** |
| skewer | thrust | z −0.55 → **−1.40**, straight out, barely rotates |
| vault | tuck | dropped and turned, fast |

**The four-beat melee combo now exists.** `Player.comboCount` has been
tracked since it was written and **nothing read it** — every swing
played the identical forward punch. Beats 0–3 are now four different
paths through the frame on the same envelope (so the hit window is
untouched) and four different world arcs, in the Memory's own element:
`roll −1.35/0.05/−2.60/1.35`, `sweep 2.0/−0.9/1.4/−2.0`.
⚠️ Bare-handed and wand-only play is deliberately unchanged — verified
0 arcs and 0 viewmodel weapon with nothing equipped. The arc is the
**woven weapon's** tell.

**All 15 actives now resolve, animate and draw**, 0 warnings (was 5):
`hew` arc · `sweep` ring+arc · `lunge` streak+arc · `brace` dome ·
`knit` dome · `summon` ring · `swarm` ring+ring · `skewer` lance ·
`scatter` arc + 5 real projectiles · `chorus` ring+dome ·
`charge` streak+lance · `vault` streak · `step` streak ·
`unseen` dome · `still` ring.
⚠️ `scatter` goes through `projectileManager.spawnFireball()` — the
wand's own cast call — so its shots get the element's real spell body,
its animator, its trail, and collision from the
`projectileManager.update(dt, enemySpawner)` that already runs every
frame. A second projectile system for one Aspect would be a second
thing to keep in agreement forever.
⚠️ `charge` hits along the line it **travelled**, not around where it
landed. "Through anything" is the whole ability; an area check at the
destination misses everything it drove past.
⚠️ `hitLine()` rejects targets behind you by the dot product **before**
measuring perpendicular distance — an infinite line through the player
catches what is at your back.

**Also fixed on the way:**
- `Player.clearWeapon()` and `Player.unequipArmor()` **did not exist**,
  so nothing could ever come off: the mesh and the whole `weaponAtk`
  contribution stayed standing. ⚠️ `clearWeapon()` restores the
  **wand's** figure (`_wandAtk`), not `PLAYER_BASE_ATK` — the wand is
  always in hand and never swapped, and falling to bare fists made
  removing a Memory leave you weaker than never having forged one.
  Verified 18 → 29 → **18**.
- `equipArmor()`'s tint **destroyed** the robe's own materials (it
  assigned over `c.material` and kept nothing), so armour could never
  visually come off. The original is remembered in
  `userData.bareMaterial`, ⚠️ guarded on absence so a second piece
  does not "remember" the first piece's TINT as the original.
- Weapon meshes were `remove()`d and never disposed on re-equip —
  leaked geometry and materials for the session. `disposeTree()` now
  frees them (materials only, ⚠️ **not textures** — MaterialLibrary
  shares maps across props).

**Verified live, fresh boot, `window.__mz`, 0 errors and 0 warnings:**
Legend staff forged → **in hand ✓ on body ✓ weaponAtk 29 = its power ✓**
· Raiment forged (defense 11) → held → **def 10 → 21, worn on chest** ·
all 15 actives fired with distinct VFX · melee lands and leaves an arc ·
everything unequipped → **0 live VFX slots, 0 materialising, weaponAtk
back to 18, def back to 10**. Seen rendered, not only measured: the
weapon in hand, the fire crescent centre-frame, the ice ward lattice.

⚠️ **Frame-rate was NOT measured** — per §6 this environment cannot.
The pool is 14 meshes built once and most effects live 0.3s, so the
expected cost is small, but **ask the owner for F3 p95.**

### ⚠️ THE LAG, AND WHY NOTHING WAS ANIMATED

Owner: *"There is too much lagg and no animation of the humans walking."*

#### The lag was the chunk build, and mostly ONE line

Measured first (per §6, the frame loop itself cannot be measured here,
but CPU build cost can):

| | |
|---|---|
| per-frame update | **0.08ms** — not the problem |
| chunk build | **19.2ms median / 31.2ms worst** |
| of which terrain mesh | **16.8ms** |
| drainChunkQueue's budget | **6ms** |

So the lag was the hitch on every chunk crossing, and terrain normals
were nearly all of it — trap #44. The gradient is now sampled on a
half-density lattice and interpolated, with the four chunk EDGES kept
exact so the seam fix is untouched.

**A/B on a pinned seed and identical coordinates:**

| | median | worst |
|---|---|---|
| STRIDE 1 (before) | 17.4ms | 23.2ms |
| STRIDE 2 (now) | **9.4ms** | **15.2ms** |

⚠️ Seam verified at **0.00000°** across all 65 shared edge vertices.
⚠️ See trap #45 before trusting any before/after number in this
project — the world seed is `Math.random()` per load and it produced a
round of confidently wrong conclusions here.

**Also reverted:** the previous pass raised ground-clutter density
(`step` 16 → 8 at HD tiers) chasing "the world looks empty". Measured
**+1.9ms per chunk build** on a build already 3x over budget, for a
marginal visual gain. Back to 16. The budget the normals fix just
freed is the right place to spend on density — with F3 p95 from the
owner's machine, not from here.

**And a leak found while profiling:** `siteSystem.register()` was
called on every chunk build and nothing ever removed the entries —
17 → 105 after streaming a modest area, growing for the whole session,
scanned every frame by `updateInteraction`. Now dropped on chunk
unload. ⚠️ The `used` set is deliberately NOT cleared: a looted cache
stays looted whether or not its chunk is in memory.

#### Nothing was animated because nothing ticked the mixer

The player's rig has `Idle`, `Walking_A` and `Running_A` clips and a
complete crossfading locomotion state machine in `animateCreature` —
and **the player never called any of it** (trap #46). It was frozen on
frame one of Idle for the life of the project, invisible only because
the body was hidden until last session.

Fixed by routing the real rig through the same state machine every
creature uses, rather than a second path that would drift. Verified:
mixer advancing, **1.2 u/s → `Walking_A`, 6.0 u/s → `Running_A`,
stopped → `Idle`**, and the idle bob bounded at −0.0016 over 20s
(traps #47 and #48 are the two ways this went wrong first).

**NPCs were hovering.** `position.y = position.y + sin(Date.now()) * 0.05`
— fifteen robed figures drifting five centimetres off the ground, in
unison, because `Date.now()` gave them all one phase. They are robe
cylinders with **no limbs** (`_buildVillager`), so a walk cycle is not
available without new geometry; what they have now is weight — feet
planted, a breathing scale and a slow weight shift, each on its own
seeded phase. ⚠️ If NPCs should genuinely walk, they need limbs built
first; say so rather than re-adding a bob.

### ⚠️ THE CHRONICLE PASS — a story that is told, and a body to tell it to

Owner, four asks: *"write a concrete story line"*, *"improve the overall
graphics"*, *"make it feel like I am playing in first person"*, *"make
me experience rather than play the game"*.

#### 1. The story was never unwritten — it was UNTOLD

⚠️ Read `data/story.js` before assuming otherwise. Aris's forty years
of doubt, Ostra's six stages, twelve found-journal fragments, three
finale endings — all already there, and all genuinely good. What did
not exist:

- **A spine.** Seven quests with one-line captions ("Fell three
  Skeletons in the fields"). Nothing named an act, a turn or a
  revelation, so the player had no way to perceive a story at all.
- **A delivery.** Every narrative beat was a `UI_NOTIFY` toast in the
  corner. Aris's dialogue was two toasts 2.6 seconds apart on a
  `setTimeout`, competing with item pickups and damage numbers, and
  unrecoverable once faded. Vell's introduction was a toast. **The
  finale's narration was an overlay on a fifteen-second timer.**

`data/chronicle.js` supplies the spine: seven ACTS, each with the
thesis of that chapter, the epigraph that turns it, and the question it
leaves the player holding. The one-paragraph version of the arc and
the reasoning behind all three endings are in that file's header —
read it before writing any more story text.

⚠️ `QUEST_TEXT` is applied OVER the mechanical definition at
`questSystem.init()`, never written into it. `type`/`target`/`targetId`
/`reward` stay the single source of truth for what a quest DOES; the
chronicle supplies only what it SAYS. Both editable would eventually
disagree about which skeleton counts.
⚠️ Acts bind by `questId`, never by index — inserting a quest would
otherwise silently re-point every act to the wrong chapter.
⚠️ `objective` is kept SEPARATE from `flavour` and still shown. A
player who cannot find the task is not having an atmosphere, they are
lost — §5's own lesson from the Descent tracker.

#### 2. `ui/SceneUI.js` — the presentation layer

Letterbox in, speaker named, lines typed and advanced **by the player**,
HUD faded out, world still moving behind it. Two kinds: `say()` for
dialogue and `chapter()` for act cards. Act I fires at game start; each
later act opens when the previous quest completes.

⚠️ THE PLAYER ADVANCES IT, never a timer — a `setTimeout` that moves
text on is the toast problem with extra steps.
⚠️ IT DOES NOT PAUSE THE ENGINE. `engine.stop()` would freeze the
atmosphere, the day cycle and the Descent wave clock — a scene mid-
Descent would stop the fight it was commenting on. Input is captured;
simulation continues.
⚠️ `onDone` runs even when SKIPPED. A scene is presentation; the quest
advancing must never depend on it having been watched.
⚠️ Key handling is CAPTURE-phase, or advancing with E re-triggers the
NPC and the scene restarts forever.
⚠️ The HUD is faded by a `body.in-scene` class, not `display:none` —
hiding re-lays-out the page and the bars visibly jump back.
See traps #40 and #41 for the two ways this broke the boot.

#### 3. First person — there was no body at all

`Player.init()` did `rig.group.visible = false`. Looking down showed
the ground through where a person should be; nothing in the frame said
you had a body. Now only the parts above the neck are hidden.

⚠️ TWO RIGS, TWO NAMING SCHEMES. `forgePioneer()` returns the
procedural Pioneer only when the knight glTF has NOT loaded — in
practice it is almost always the knight. Tagging only the procedural
parts (the first attempt) hid nothing in the common case and left the
helmet in the middle of the lens. Matched case-insensitively against
both vocabularies.
⚠️ The body's own copy of the held weapon is hidden — the viewmodel
already draws one a few centimetres from the lens, and both visible
means seeing your sword twice at two scales.
⚠️ `pioneer-eye` is NOT renamed to `pioneer-head`: `retintPioneer`
finds the eyes by that name to recolour them as attunement drifts.
⚠️ **The rig was ~2x scale** — see trap #43. Fitted to
`CAMERA.EYE_HEIGHT` now (scale only; see trap #42 for why the position
must be left alone), which also fixes a shadow that has been twice
human-sized this whole time.

#### 4. Graphics — one bounded change, honestly

⚠️ **This ask got the least work of the four, deliberately.** §4
records four separate render passes where a change that read as an
improvement was a regression, and §6 is explicit that frame cost cannot
be measured in this environment. Rather than re-tune the grade, the
fog or the light rig blind, the change is aimed at the flaw actually
visible in a screenshot of the open world: **emptiness**. A whole frame
of bare ground with nothing at eye level to give it scale.

`getClutterPositions` used `step = 16` — 4x4 = 16 candidate cells per
64-unit chunk, most of which reject. Now `step = 8` at HD tiers.
⚠️ `low` is UNTOUCHED: it is exact artifact parity (§1) and the
artifact has a 16MB budget and no external requests.
⚠️ Each piece is still 1–2 shared-geometry meshes with shadows off and
no collider, so this multiplies the cheapest thing in the scene.
⚠️ **Frame cost NOT measured** — ask the owner for F3 p95.

### ⚠️ THE HOLLOWNESS PASS — persistence, sites, epithets, tactics

Owner: *"the game feels very hollow, it doesn't have any depth, add
things that makes it depthful and meaningful."* Asked which of four
directions to take; answered **all four**. Built in value order.

Three things were measured before anything was written, and each is a
literal source of hollowness rather than a vibe:

| | before |
|---|---|
| game state that survived a reload | **none** — `mz_fog`, `mz_bindings`, `mz.quality`, `mz_peace`. Four settings. |
| things in the world you could press E on | **two** — an NPC and a Descent Gate |
| structure kinds generated in the wilderness | **seven**, all of them pure scenery |
| what dying cost | 3 seconds, half vitals, and half your **dust** |

#### 1. `systems/SaveSystem.js` — a run that survives

Fifteen systems' authoritative state, autosaved every 20s when dirty,
on fourteen meaningful events, and on `pagehide`/`visibilitychange`.
Verified across a REAL reload: level, lineage, Rank, Marks, inventory,
both Memories in their slots, the Echo standing beside you again,
essence, deeds — all identical.

⚠️ **SAVE THE AUTHORITATIVE STATE, NEVER `snapshot()`.** Almost every
system here has one, and every one is a DISPLAY snapshot full of
derived values (`fraction`, `ladderTitle`, `calling`, `requirements`).
Restoring from one writes computed fields back over their own inputs.
⚠️ Restores are TOTAL, never incremental — a merge keeps the starting
kit the new game already handed out.
⚠️ Restore runs AFTER every `init()` and after `_giveStartingItems()`,
never instead of either. See traps #36 and #37 for the two ways this
went wrong.

#### 2. Death that costs something you can walk back to

All your Essence (the resource every Aspect spends) plus half your
materials, dropped where you fell, with a **grave compass** pointing
back at it. ⚠️ It never takes your MEMORIES — you lose what you were
carrying, never what you are; losing a Legend permanently is a reason
to stop playing, not stakes. ⚠️ One grave at a time, and dying again
destroys the old one, said out loud. Verified: 209 Essence lost,
Memories kept, compass read "Where you fell — 72m NE", recovery
restored it (capped at Core capacity, correctly).

#### 3. `systems/SiteSystem.js` — the world answers back

All seven structure kinds are now interactable, each with a
**different verb**, not a different number: shrine (SPEND — an
offering buys a Boon), cache (FIND), graveyard (RISK — it wakes),
ruin (SEARCH), monolith (LEARN — attunement depth), camp (REST — the
only full heal outside the Sanctuary), dungeon (DELVE). Verified 49
sites across 7 kinds, every one driven through a real E-press.

⚠️ Sites are ONE-SHOT and that is **persisted**, or a cache refills
every time its chunk streams out and back. ⚠️ IDs derive from world
position, never a counter — a counter re-numbers on every stream-in.
⚠️ A shrine you cannot afford is NOT consumed; a graveyard is consumed
the moment you disturb it, before the fight, or fleeing and returning
re-triggers the reward.

#### 4. `systems/BoonSystem.js` — blessings that shape a trip

Minutes, not seconds and not forever. One at a time, replacement
announced. Which Boon an offering buys is **declared by element**, not
hashed — an offering whose outcome is a die roll is a slot machine.
Verified: Kindled measurably applies (137 vs 118 damage = the
specified ×1.16), and survives a reload with its remaining time.

#### 5. `data/epithets.js` + `systems/EpithetSystem.js` — a name

§7's long-standing "designed in the archive, never built". Eight
epithets, cap 3, earned by a defining ACT and event-driven (never
polled — an act is a moment). NPCs greet you by them.
⚠️ Every `grants` key has a named reader, and all eight were wired:
`punchUpMult`/`desperationMult` at the damage site, `firstHitHalved`
on incoming, `graveKeep` in dropGraveCache, `moveMult` in movement,
`monolithMult` at the stone, `forgeLuck` in MemoryForge's Aspect
count, `spoilMult` on the Descent roll. A grant nothing reads is worse
than no grant — this project has shipped that three times.
⚠️ NPC reactivity is a GREETING PREPENDED to existing dialogue, not a
fourth branch of the precedence chain — making it a branch would mean
a Pioneer with an Epithet could no longer hear mq3.
⚠️ The Sanctuary cast react to what they can SEE (a name, obvious
depth), never to your Leaning — §2: "a shopkeeper does not have a
philosophy."

#### 6. `TACTICS` in Enemy.js — fights that ask something

Every creature used one AI: walk at the player, stop, swing. Now six
approaches, assigned **per species** (never rolled — a fight you
cannot learn is a fight you cannot think about):

| tactic | what it changes | verified |
|---|---|---|
| brawler | the honest baseline | 12m → 2.5m, straight in |
| flanker | circles before closing | 6.3m **lateral** offset |
| skirmisher | strikes and BACKS OFF | hit, then retreated to 3.6m |
| ranged | holds and throws | held **10.7m**, never closed, threw |
| armoured | shielded from the FRONT | front ×0.45, **rear ×1.0** |
| pack | stronger with its own kind | ×1.0 alone → **×1.48** with four |

⚠️ None of these forks the state machine — each only changes `_chase`'s
target point (plus a damage factor for armoured/pack). A second AI is
a second thing to keep in agreement forever, which is why `friendly`
reuses this one too. ⚠️ A friendly companion is always a `brawler`:
the tactics assume their target is the player, and an ally that
circles never reaches what it is meant to be fighting.
⚠️ Armour is DIRECTIONAL and that is the whole mechanic — a golem you
must walk around, not out-damage. A flat resist is just a bigger bar.

### ⚠️ ELEVEN SILHOUETTES OVER ONE MOVESET — the weapon identity pass

Owner: *"the type of attacks are just a few from the same pool, it
should be unique per weapon, this goes the same for models of the
weapons."*

Both halves measured before touching anything, across 600 forges:

| | before | after |
|---|---|---|
| distinct active sets | **14** | **61** |
| distinct actives reachable on a weapon | **8 of 15** | **19** |
| most common set's share | `skewer` **37.5%** | `reap` **9.3%** |
| weapons carrying a type-unique move | **0** | **600/600** |
| distinct weapon MODELS (660 forged) | **11** — one per type | **660** |

The weapon TYPE decided the silhouette and **nothing else**: a bow and
a warhammer drew from one identical pool, and `charge`, `vault`,
`step`, `unseen`, `still`, `summon` and `swarm` were unreachable from a
weapon by construction.

**Three tables, deliberately separate** (`data/memories.js`):

- **`WEAPON_MELEE`** — how a type *swings*: range, arc, damage,
  speed, hit count, and `ranged` for the three that do not swing at
  all. This is the feel, shared by every weapon of that type.
- **`WEAPON_SIGNATURE`** — one active Aspect ONLY that type can roll,
  and the reason a scythe is worth forging over a sword. It replaces
  the forced-active slot rather than adding to it, so **grade still
  decides the Aspect COUNT** (the one load-bearing rule in
  data/memories.js) — a weapon gets no free Aspect for being a weapon.
- **`weaponVariant(seed)`** (EntityForge) — per-INSTANCE structure.

Verified per type, with a still dummy in front, behind, and at 90°:
every melee weapon connects at 45% *and* 95% of its stated reach,
**nothing behind is ever hit by anything**, and **only the scythe
(200°) reaches the flank**. The three ranged types deal 0 melee damage
and fire a projectile instead — "a bow that swings is worse than no
bow" (§7.11), now closed. Cooldowns run 0.22s (dagger) to 0.97s
(warhammer); damage runs 30 (sword) to 75 (dual blades, 3 hits).

⚠️ **The signature is built through the SAME numeric pipeline** as a
pooled Aspect (`src.magnitude` → pct/dur/mult/n), not hardcoded
numbers, so drawing well still matters on the ability the player cares
most about. It keeps its own authored NAME though — running "Reap"
through `nameAbility()` would bury the one word that says what you are
holding.
⚠️ Signature keys must not collide with `ABILITY_POOLS` keys, and
every one needs an ASPECT_USED branch **and** an `ASPECT_SHAPE_FOR`
entry in the same commit. Both are verified by tests that walk the
tables; the motion-shape guard added last session caught all eleven
missing animations on the first run, which is exactly its job.

**Models: `forgeWeapon(type, element, tier, seed)`.** The variant
supplies blade length/width, grip length, guard width, plus real
either/or structure — 4 guard builds (straight / swept / ringed /
**none**), 3 pommel shapes, 2–4 grip bindings, optional fuller,
langets, battle chip and thong, and a slight per-weapon lean. Every
plan consumes it: an axe varies head size and rake, a spear its shaft,
a scythe **how tight its curve sweeps**, a staff its prong count
(3–5), a bow its limb span and curvature (the string is sized to the
nocks it is actually tied between), a grimoire how far open it sits.

⚠️ **SEEDED, never random.** The viewmodel weapon is rebuilt from
scratch on every equip, so an unseeded roll would visibly re-roll the
player's own sword each time they swapped and swapped back — variety
that reads as a bug. Verified: same seed → byte-identical geometry;
different seed → different. The Memory's own `seed` is passed to all
**three** rigs that forge a copy (body, viewmodel, character preview),
or the panel would show a different weapon than the hand holds.

### ⚠️ TWO BUGS FROM THE ECHO SESSION, FOUND BY ACTUALLY PLAYING

Owner: *"the weapons don't load... neither can I bind them onto the
summoning keys as they aren't present under the list of memories, and
echo in the V menu."* Both real, both introduced by the Echo work
above, neither caught by the console-driven verification that session
used (which always forged a weapon FIRST, into the still-empty slot 0
— the one ordering that hid the bug).

**1. A weapon equipped into a non-active slot was invisible.**
`equipWeapon()` never moved `_active`; it never had to before, because
every combat slot could only ever hold a weapon, so slot 0 always
filled first. An Echo breaks that ordering by existing: equip an Echo
(→ slot 0), then a weapon (→ slot 1) — the weapon is fully equipped,
contributing Aspects, "Drawn into slot 2" and all, and **appears
nowhere**: no viewmodel mesh, no body mesh, `weaponAtk` still the
wand's number. Fixed with one gated line — `if (memory.formId !==
'echo' && wasHandEmpty) this._active = i` — so a freshly-equipped
weapon claims an empty hand but never steals focus from one already
holding something. Verified: Echo→weapon sequence now shows the weapon
immediately; a SECOND weapon equipped afterward correctly leaves the
first one in hand untouched.

**2. An Echo could roll with no active Aspect at all**, and therefore
had no key anywhere to bind — not a labeling problem, an actual
absence from `loadout.bindables()`. `forceActive` (the same guarantee
that stops a weapon rolling all-passive) checked `form.equips ===
'weapon'` only. Extended to `|| form.id === 'echo'`. Verified: 0/200
forged Echoes with zero actives, and end-to-end through the real V
panel — a forged Echo's Skewer now renders under **Aspects**, on key
**1**, with an `UNBOUND` button exactly like a weapon's.

⚠️ **Both were invisible to a verification pass that always forges the
first combat item into slot 0.** The lesson for next time: when a
system gains a second thing that can occupy the same slots, test the
ORDER that used to be impossible, not just each thing alone.

### ⚠️ AN ECHO IS A SUMMON — AND EVERY SUMMON WAS AN ENEMY

Owner: *"you do not truly understand the meaning of an ECHO, an ECHO is
a sort of a summon, thus something should materialise and form when an
ECHO is equipped."*

Correct, and the code understood it even less than the last session
did. **`friendly` was passed by three call sites and read by zero**
(trap #27) — so `SpoilsSystem._callEcho()`, the `summon`/`swarm`
Aspects and the devoured Warden all spawned ORDINARY HOSTILES.
Measured before the fix, calling an Echo:

| | |
|---|---|
| player HP over 4s | **100 → 0** |
| its final AI state | `attack` |
| `despawnAt` honoured | **no** — permanent |

A friendly now reuses the **entire hostile state machine**, pointed at
a different focus (`focusPos` in `Enemy.update()`), rather than a
second companion AI to keep in agreement forever. Verified after:
6 seconds alone with the player → **100 → 100 HP, state `idle`, 2.6
units away**; with a hostile in range → targeted it, closed, and took
it **528 → 135 HP**.

- ⚠️ `_retargetAllies()` searches around the **PLAYER**, not around the
  companion — an Echo should engage what threatens you, not wander off
  after something you were happily walking past. Sticky, or it dithers
  between two enemies at similar range and reaches neither.
- ⚠️ A friendly with nothing to fight **escorts** (`escortRange` 3.4)
  and has **no leash** — `_idle`/`_patrol` return it to `chase`
  unconditionally, or it picks a random point 8 units away and strolls
  off while you walk the other way.
- ⚠️ The strike is gated: a friendly emits COMBAT_HIT at
  `this._target` and **never** at `'player'`, and not at all when it
  has no target.
- ⚠️ `PLAYER_HIT_LANDED` is now gated on `isPlayerDamage`. It was
  harmless while every Enemy-sourced hit was reaction damage; it stops
  being harmless the moment an Echo lands hits, because the player's
  Hungering lifesteal would heal them off a mastery they are not using.
- ⚠️ `summon`/`swarm` now carry a **bounded** `despawnAt` (6–40s). With
  `friendly` real and no timer, they were a permanent army built one
  keypress at a time. Verified: 3 spawned → **0 after 9s**.

**Equipping an Echo manifests it.** It takes one of the three COMBAT
slots, a creature knits itself together beside you (the same
`weaveVFX.materialise` a weapon plays, plus a ground ring and a burst),
and unequipping sends it back. Species is derived from the Memory's own
seed through an **fmix32-finalised** hash (trap #17), so the same Echo
always returns as the same thing.
⚠️ `_syncEchoes()` keys on the **slot contents**, not on a count —
swapping Echo A for Echo B in one slot has to dismiss A and manifest B,
and a count sees no change.
⚠️ A dead Echo is **not** silently re-summoned while still equipped;
that would be an infinite ally.
⚠️ `loadout.activeWeapon` returns **null** when the active slot holds
an Echo. An Echo is not a thing you swing, and handing one to
`equipWeapon()` forges a phantom sword out of its absent `weaponType`
(trap #11's fallback).

### ⚠️ "I CAN'T EQUIP THE ECHOES" — the Loom's OWN equip page couldn't

A regression from the same session, caught immediately after. The
Equip & Enchant page decided "slot buttons vs. a carry button" with
`item.equips === 'weapon'` — and Echo declares `equips: 'bindable'`,
the exact same value Relic uses. Every Echo, everywhere (auto-equip on
forge AND the manual bag row), rendered only a "carry" button, which
then hit the brand-new `loadout.hold()` refusal ("it takes one of your
three combat slots") and did nothing. **There was no button anywhere
that could equip one.** Fixed by switching both call sites in
`MemoryForgeUI.js` to `budgetFor(memory) === 'combat'` (the real rule,
keyed on `formId`, not `equips`) instead of the old check.
⚠️ Verified through the ACTUAL UI, not the console shortcut that
missed it the first time: forged an Echo, opened the Loom (B), Equip &
Enchant tab, saw Slot 1/2/3 on the bag row, clicked one — it left the
satchel, filled a combat slot, and a companion manifested.

### ⚠️ CAPACITY — 3 combat / 2 trinkets / unlimited raiment

The owner's rule, in `LoadoutSystem`. **Weapons and Echoes share the
three combat slots**; charms and relics share two trinket slots;
raiment is uncapped.

⚠️ Sharing is the load-bearing half. Giving Echoes their own pool would
mean carrying one cost nothing, and a cap that costs nothing is not a
decision. Sharing is what makes *"third weapon, or the shade that
fights beside me?"* a real question.
⚠️ `budgetFor()` keys on **`formId`, never `equips`** — Echo and Relic
BOTH declare `equips: 'bindable'`, and they belong to different
budgets (this is the exact field the Equip-page regression above hit,
one file over). Reading `equips` compiles, runs, and files every Relic
as an Echo forever, or every Echo as uncarryable (trap #11's shape).
⚠️ Raiment folds into **`player.raimentDef`**, not `armorTokens` —
that object has exactly three keys (head/chest/legs), so filing
uncapped raiment there silently caps it at three and the fourth piece
you wove does nothing. `recomputeStats()` stays the sole writer of
`stats.def` (trap #9). Verified: 4 pieces → def **10 → 54**.
⚠️ The trinket cap is **reported**, not silent. Verified: 2 charms
accepted, the relic refused out loud.

Verified: 2 weapons + 1 Echo fill all three slots (1 ally manifested);
a fourth displaces and **returns** the displaced Memory; unequipping
the Echo fires 1 `ECHO_DISMISSED` and **0** `COMBAT_KILL`.

### ⚠️ THE PIONEER MENU (Tab), and what the freed keys became

Owner: *"for equiping anything there should be specific key binds, and
for this purpose remove or the useless keybinds like 'g', and all."*
Then, on the same keys: *"ensure the 'B', 'V', 'I', 'K' keybinds are
present as before as they are important menus."* Both are live.

§7 had listed collapsing the panel keys as the clean fix and flagged it
as the owner's call. Eleven letters were held by panels.

| key | now |
|---|---|
| **Tab** | the Pioneer menu — every panel, one door |
| **G / H / J** | the three **combat slots** (tap to bring to hand) |
| **B / V / I / K** | **kept their direct keys** — the Loom, Bindings, the Satchel and the Ascent are opened often enough that a Tab hop in front of them costs more than the letter is worth |
| **L / N / F** | freed for binding; reachable from the menu |

⚠️ **The letters still work inside the menu.** Tab-G opens the
grimoire. Nobody's muscle memory is discarded and the shortcut is
printed on each row, so it teaches itself.
⚠️ B/V/I/K stay in `RESERVED_KEYS` **because their handlers still
exist**. A key the game secretly reads while the bind panel hands it
out is the worst double-book there is (trap #7).
⚠️ Renumbering the menu to 1-9 was rejected: those are the loadout
hotbar.
⚠️ AttunementUI's own Tab handler was **deleted**, not bypassed —
leaving it would make one Tab press open both, which is exactly the
V-collision §5 records.

⚠️ **The 1..9 bar is NOT re-pointed by the slot keys.** Every equipped
Memory contributes its actives to one shared bar regardless of which
slot is in hand — the owner's explicit choice. Switching slots changes
what you swing and what stands beside you, never what your number keys
do. Verified: the bar is byte-identical across G→H→J.

Verified: all 11 menu rows open their real panel, 0 warnings; B/V/I/K
open directly; L/N/F are globally inert; G/H/J switch slots and open
no panel.

### Vibrancy, terrain and arms (same session as the fog pass)

- **Grade saturation 0.52 → 0.80 (hell) / 0.55 → 0.82 (heaven).** At
  0.52 the image reached the screen a bit under HALF as colourful as it
  was rendered — every biome palette, element hue and trait sky was
  being crushed toward grey on the way out. Crush, contrast and
  split-tone are untouched, so it is still graded hard, just toward
  colour instead of toward grey. Descents keep their relative darkness
  (their own multiplicative factors).
- **Seven new biomes** (22 total): Amber Steppe, The Drowned Flats,
  Stormwrack Coast, The Petrified Wood, Glacier Shelf, Ember Dunes, The
  Verge. ⚠️ Each is separated by **terrain SHAPE** (heightScale /
  roughness / mountainFactor / plateauFactor), not just palette — a
  biome that only recolours the same hills is not a new place.
  ⚠️ A new biome is **three** edits: `BIOME_TYPES`, `BIOMES`, and a
  branch in `getBiomeForChunk()`. Counted live: 6 biomes in the early
  rings (was 4), 8 in mid, 7 far.
  ⚠️ `cont` was computed and read by exactly ONE branch; all three rings
  read all three climate axes now.
  ⚠️ `FLOATING_ISLANDS` is declared in `BIOME_TYPES` and has no `BIOMES`
  entry — dead since it was written. It needs real floating-island
  terrain generation, not a table row.
  ⚠️ Astral Highlands' `mid` was `0x2820508` — **seven** hex digits,
  decoding to a dark red in a violet biome. Fixed to `0x282050`.
- **Six new weapon plans** (11 total): bow, staff, dualblades,
  grimoire, warhammer, scythe. Four of those were already rollable by
  `ItemGenerator` and had no plan at all — see trap #11.
  ⚠️ Long weapons need **viewmodel framing** (`FRAMING` in
  `_equipViewmodelWeapon`): models are built at true world length so
  they read on an enemy or on the ground, and a 1.4-unit scythe held
  30cm from the lens is a pole across the screen with its blade off the
  top corner.
- **The wand was rebuilt.** It was six primitives — a cylinder, three
  bands, two tines and a sphere — on the one object that is on screen
  every single frame. Now a tapered haft, bound grip, filigree collar,
  four-tine cage, and the shard floating in the gap with two
  counter-rotating rings and three orbiting chips. ⚠️ Still exactly ONE
  emissive focal point (§3). ⚠️ `retintWand` must name every emissive
  part — one missed keeps the previous element's colour forever.

**Everything builds clean** (`npx vite build`), console is clean on a
fresh load, and the full loop is verified end to end: boot → tutorial →
scout → travel → descend → resolve → weave → bind → cast.

**Verified live this session** (fresh boot, `window.__mz`, no stale
imports):
- Ambient spawner: peace off by default, all fields finite, creatures
  standing on the analytic ground (`|y − getGroundY| < 4` for all),
  **0** spawned inside the Sanctuary while standing at its edge.
- Difficulty ramp counted across distance for biome levels 1/5/15.
- Corpse lifecycle: 4 alive → killed → 4 corpses holding meshes →
  timers out → **0 corpses, 0 meshes** (destroy actually ran).
- Levelling: +600xp → lv6, equip a 40-atk blade → atk 50 (weapon 40 +
  level 10, **level bonus survived the equip**), +5000xp → lv14, atk 66
  (**weapon survived 8 level-ups**). This is the exact two-writer
  failure and it is now dead in both directions.
- XP gap scaling at player level 10, base 100: enemy lv1→8, lv5→19,
  lv10→100, lv16→154.
- Non-combat XP: a first-time weave paid exactly +140.
- Weave power: an enemy's received damage measured on BOTH player
  paths. Unsounded melee 176 / weave 176; Hollowed at top rung melee
  409 / weave 409 (the 2.325x lineage multiplier, identical on both).
  Enemy-sourced damage unchanged by the player's lineage.
- Descents: entered live. 8 pyre lights in the scene; key +47%,
  ambient/hemi floor +34%, fog `near` 22 -> 45 units, view-in-fog
  82% -> 63%, and the tonal split intact (still 0.66x / 0.74x vs the
  surface). Objective tracked through a full run: "2 left" -> "1 left"
  -> "Clear - next wave incoming" -> "Wave 2 of 2 | 3 left" ->
  "The Ninth Bellows-Keeper | Kill it - 100% left".
- Confluence: 1 sign 47 dmg / 0.00 instability -> 6 signs 647 dmg /
  0.65 instability, instability monotonic across 1..7. Six-sign weave
  resolved and named end to end through the Loom.
- Lineages: all six sounded and driven to the top rung, each with a
  distinct verb, currency and outcome (Hollowed 2.33× damage with
  maxHp 100→82; Latticer 0.59× mana and no damage multiplier; Ashborn
  2.25× paid in 72 permanent HP; Choirbound 1.82× shared).
  Choirbound's axe inherits the sword's rung; a Reliquar's does not and
  its bond does not transfer. Weapon true names: 400/400 pairs after
  the fmix32 fix (100/400 before). Panel driven by the real N key and
  the real buttons.
- The Loom: three distinct signs held at once, duplicate refused, cap
  refused, chip strike-out works, and a real brew resolved to
  *"Wisp Swarm · Lesser Driving Burst + Lesser Straight Even Linger"* —
  both signs in the spell's identity, folded (two signs produce a
  different modifier set than one, and contribute keys the other
  lacks). Seen rendered, not just measured.

⚠️ Frame-rate performance was **not** re-measured — only chunk BUILD
cost, which is CPU and measurable here. Ground mist adds two large
transparent sheets (fill rate) and the fog change alters how much is
drawn through; neither can be judged honestly in this environment.
**Ask the owner for F3 p95.**

⚠️ Enemy-spawn performance was **not** re-measured. Peace mode defaulting off and a
resident wild population is the first real load increase in a while;
`maxEnemies` is 13 and `spawnInterval` 4.5s. **Ask the owner for F3
p95** — per §6 this environment cannot answer that question.

### ⚠️ A LETTER PER FORGED THING — "I am unable to equip armour, weapons, charms"

Owner: *"once something is crafted it can be bound to a letter except
the ones that already have roles, at once 3 can be summoned, and from
those three all the active abilities appear in the hotbar numbered 1
through 9."*

**Everything after the first sentence already worked.** Three combat
slots existed, the 1..9 bar was already derived from what sat in them,
and every panel that could equip a Memory did so correctly — verified
live before touching anything: `equipWeapon`/`hold` accepted all five
forms and the bar rebuilt correctly each time.

What did **not** exist was any way to equip a thing **without opening a
panel**. `BIND_KINDS.ASPECT` binds one *ability* of a Memory you have
**already equipped** — which is the step *after* the one the owner was
asking for. So a forged Charm or Raiment could be made, auto-equipped
*if a slot happened to be free*, and after that was reachable only by
finding the Loom's Equip page. "I am unable to equip" was true in the
only sense that matters: **there was no key for it.**

⚠️ This is the project's most repeated shape yet again (see "the
loadout and the player's hands were never connected", "there was NO
hotbar in the HUD"): the data model was right, and the player had no
door into it.

**`BIND_KINDS.GEAR`** — the Memory itself, not one of its Aspects. Its
letter **toggles**: press to summon it out of the satchel into its
budget, press again to send it back. `LoadoutSystem.toggleGear()`.

- ⚠️ **The item is never in both places.** Every path moves it between
  `inventory` and the loadout, matching the invariant the forge panel
  already kept — a Memory left in the satchel *while equipped* could be
  transmuted while its Aspects were still on the bar.
- ⚠️ **Three is REPORTED, never silent.** A fourth combat thing is
  refused **and the refusal names what is holding the slots**, so the
  player does not have to open a panel to find out what to dismiss —
  which is the panel trip the feature exists to remove.
- ⚠️ **The budgets are unchanged**: still 3 combat / 2 trinket /
  uncapped raiment. "At once 3 can be summoned" *is* the combat cap and
  it was already three. Collapsing charms and armour into the same
  three was rejected — three raiment pieces would leave no weapon, and
  the 3/2/∞ split is the owner's own earlier call (see CAPACITY above).

**Letters are handed out automatically, and overridden in V** — the
same "defaults AND overrides, not either" rule the 1..9 bar follows.
`AUTO_BIND_KEYS` is a *preference order*, not a permission list: every
entry is still checked against `RESERVED_KEYS` and against what is
already bound, so adding a game key later cannot make the auto-binder
start double-booking it.

⚠️ **`ensureGearLetters()` runs at boot, after the save restores.** A
save written before this pass restores Memories with **no key at all** —
measured on a real restored run: all three combat slots and four
carried Memories reading `—`. It is **additive only**, which is exactly
what makes it safe at boot where `pruneGearBindings()` is not: an empty
inventory makes it a no-op, whereas a prune reads an empty inventory as
"the player owns nothing" and deletes every saved letter. That is the
same trap the aspect-binding prune nearly shipped, one kind over.
Verified: wiped every gear binding from `localStorage`, reloaded →
`[Loadout] 12 gear letters assigned`.

⚠️ **Enchanting changes a Memory's id, so the letter must be MOVED, not
re-derived.** `bindSystem.rebindId()` keeps the key and re-points it,
called *before* the equip shuffle (a prune would otherwise see the old
id as unowned and delete the letter first). Without it, enchanting
silently orphans the key the player chose and the reworked Memory comes
back with none — which reads as "enchanting unbound my weapon" with
nothing on screen explaining it. Verified: `mem_11zmel` on **T** →
enchanted → `mem_prfi0` still on **T**, zero ghost bindings.
⚠️ `ascend()` deliberately **keeps** the id, so it needs none of this —
`autoBindGear` returns the existing letter rather than spending a
second one on the same thing.

**Four places show the letter, and they cannot disagree** — all four
read the live binding, and all four hand clicks to
`bindUI._beginCapture()` rather than reimplementing "press a key":
the HUD summon strip, the Loom's Equip page (slots, carried *and* bag
rows), the satchel's Loadout block, and BindUI's own new section.

⚠️ **The HUD strip is the three combat slots and NOTHING else**, empty
ones included. Empties are drawn because "three at once" is a rule the
player has to learn, and a strip that only draws what is filled teaches
*"you have as many as you have"* — the cap becomes visible only at the
moment it refuses you. Carried things are deliberately excluded:
raiment is uncapped, so including them gives the strip no ceiling
(**measured at seven things: three wrapped rows and 107px of HUD**, over
a hotbar that is itself a row). Their letters are in all three panels.

⚠️ **`flex-wrap: wrap` prevented the chips from shrinking at all.** The
browser moves a chip to a second line *before* it will shrink one, so
`flex: 1 1 auto` never got to act and the strip took two rows at every
container width below ~460px. Wrapping and shrinking are alternatives
here, not complements. This is the ROW-direction mirror of trap #13.

⚠️ **NO `vw` UNITS in the summon strip, deliberately.** The obvious fix
for "too wide for its parent" is a viewport-relative width — and this
environment reports `window.innerWidth === 0` **even with the tab
fronted**, so every `vw` length resolves to 0 and cannot be verified
here. It would have looked right on the owner's machine and measured as
a zero-width strip in every check available, which is the worst of both
worlds. Sized by content, bounded by holding it to three chips.
⚠️ The parent (`#wand-bar`) has **no fixed width** — measured at both
484px and 362px in one session. Any layout here that assumes one of
those is wrong half the time.

⚠️ `keyLabel()` gained `PUNCT_LABELS`. The auto-binder falls back to
punctuation once ten letters and the numpad are spent, and the generic
transform left those codes raw — a player with a Memory on `Semicolon`
read the *word* "Semicolon" in the HUD, the Loom and the bind panel.

**Verified, through the player's own path** (trap #2 — the keys were
pressed, not the functions called):
- Forge → `Q calls it in and out` in the notification, letter live.
- Real `keydown` + one engine tick: **T** dismissed slot 3 → bar went
  4 entries → 3 and renumbered; **N** summoned a different weapon →
  slot 3 filled, bar back to 4 with `3=Sunder`; **N** again dismissed;
  **T** re-summoned the original and `3=Quake` returned.
- `Digit1/2/3` still fire their Aspects alongside the letters.
- Rebinding in V: `KeyW` refused out loud (*"W is already the game's."*),
  `Semicolon` accepted, **KeyQ freed** (one key per thing), and the new
  key immediately worked.
- Grepped every key handler in the project: only I/V/K/B use
  `e.key.toLowerCase()`, all four reserved, **none** in `AUTO_BIND_KEYS`.
- Console clean — the only warnings are the two pre-existing THREE.js
  deprecation notices.

⚠️ **Screenshots still do not composite the HUD overlay** (the same gap
§7 already records). The strip is verified structurally and numerically
— 24px, one row, three chips, correct keys and names — but was not seen
rendered. If it looks wrong on a real machine, that is the gap.

### ⚠️ THE SWING HAD NO GRAPHIC, AND THREE OF YOUR FIVE SLOTS WERE INVISIBLE

Owner: *"whenever the attack is used the specific weapon's graphics
should come, and whichever relic, charm or weapon is summoned at that
time, they should hover on the side of the person following them,
floating in air or in the other hand, with aura glowing, the colour
symbolising the player."*

**Two holes, both wider than they sound.**

**1. A melee swing drew NOTHING.** Not "something generic" —
`checkCombatCollisions` shook the camera and emitted COMBAT_HIT, and
that was the entire visual result of every melee attack in the game.
The eleven-silhouette pass gave each type its own range, arc, speed and
hit count, all of which were real and **none of which you could see**:
a scythe's 200° sweep and a spear's 45° line looked identical. §7.11
left per-type animation open; this is its effects half.

`WEAPON_VFX` in main.js — one row per type, resolved through
`_weaponVFX()` which **warns** on a miss rather than drawing a sword
arc silently (trap #11). Keyed by the same `weaponPlanKey()`
normalisation `WEAPON_MELEE` and `WEAPON_PLANS` use, so the three
cannot drift independently.
⚠️ **Drawn BEFORE the hit test, unconditionally.** Gating on `struck`
would show the weapon only when the player was already being told they
connected — and "did my attack come out?" is exactly what a whiff needs
answered.
⚠️ `beats` are **milliseconds on setTimeout**, not frames. A multi-hit
weapon resolves all its hits on ONE latched frame, so the extra arcs
have no later frame to be drawn from. Verified: dual blades' three arcs
land at 1 / 73 / 144ms against declared `[0, 0.07, 0.14]`.
Verified all 11 types draw, 5 distinct shape combinations, 0 warnings.

**2. `rendering/GearHalo.js` — what you have summoned, floating beside
you.** Of the five things that can fill a slot only TWO were ever
visible: the weapon in hand (viewmodel) and an Echo (manifests as a
creature). A second and third combat slot, a charm and a relic were
invisible — you could carry four Memories, feel their passives, fire
their Aspects, and never see them.

**What floats is exactly the owner's list**, and every exclusion is
load-bearing: weapons NOT in hand (the in-hand one is the viewmodel's
job); charms and relics always; **Echoes never** (already a creature —
a second floating copy reads as a bug the moment the creature walks
away from its own icon); **Raiment never** (it is WORN and already
tints the body). ⚠️ That rule is also what BOUNDS the ring — raiment is
uncapped, so 3 combat (minus the one in hand) + 2 trinkets means **at
most 4 satellites, ever**. Feeding it from `held` directly would grow
without limit.

**`playerAura()` in main.js is the ONE writer of "the player's
colour"** — attuned element as the base hue, pulled toward gold
(Ascendant) or ember (Cinderbound) by `conviction()`, capped at 0.45 so
the element is never fully overwritten. `GearHalo` deliberately does
**not** derive its own; it is published in via `setAura()` (trap #9).
⚠️ Hung off `ATTUNEMENT_SHIFT` / `LEANING_UPDATE` — the REAL event
names. The first draft used `ATTUNEMENT_CHANGED` / `LEANING_CHANGED`,
neither of which exists, and `eventBus.on(undefined, fn)` fails
**completely silently**. §5 records this exact failure once already.

#### ⚠️ Three placement bugs, each of which measured as fine

This is the part worth reading. Every wrong version passed the check I
had written for it.

1. **Centred on straight-behind.** Reasoning: the satellites must never
   block what you are aiming at. Verified exactly that —
   `dot(toSatellite, forward) ≤ -0.08` at every yaw. It was also
   **completely invisible**: this game is first-person, there is no
   third-person camera, and nothing behind the player is ever on
   screen. A perfectly-placed ring nobody can see is the same failure
   the file exists to fix.
2. **Fixed peripheral angles (±38°, ±58°)**, computed for FOV 88 at
   16:9. `fov` in three.js is **VERTICAL**, so the horizontal
   half-angle depends on the ASPECT RATIO — a property of the player's
   window. Measured in a 0.85-aspect window: **`ndc.x = -1.94`**, i.e.
   entirely off-screen. Offsets are now fractions (0.62 / 0.90) of
   `atan(tan(fov/2) × aspect)` read from the live camera, which is
   correct at every window shape and survives the sprint FOV kick.
   ⚠️ Read through `cameraController`, NOT a cached `camera` — `init()`
   runs before the controller has built its PerspectiveCamera, and a
   cached undefined would fall back to a default FOV forever.
   ⚠️ `sceneManager.camera` does not exist; the camera lives on
   `cameraController`. Passing the wrong one fails silently into the
   `?? 75` fallback.
3. **Sized by eye.** A 0.42 shell at 1.6m is `2·atan(0.42/1.6)` =
   **29° of arc — over a third of the screen width, per satellite.**
   Three of them buried the lower half of the frame, and it read as
   perfectly reasonable in source ("0.42 units"). **Size these by
   ANGULAR DIAMETER.** Now 0.16 at 2.4m ≈ 7.6° (~9% of width). If
   `RADIUS` changes, rescale `SHELL_R` with it — the ratio is what
   matters, not either number.

⚠️ **The ring LAGS the player** rather than being pinned to them —
damped per-frame, framerate-corrected. Pinned rigidly it reads as a HUD
element painted over the world; the trailing is what makes it read as
objects being carried along. Verified: one frame after a 23-unit jump
they had moved ~10% of the way; after 60 frames they settled at radius
1.55–1.60.
⚠️ **`sync()` reconciles, never rebuilds.** LOADOUT_CHANGED fires for
holding a charm, switching slots and every rebind — rebuilding would
restart three untouched objects' arrival animation each time.
⚠️ **No dynamic lights**, deliberately. Four PointLights is the obvious
way to make four things glow, and light count is a real per-frame cost
`Quality`'s tiers exist to manage. Emissive through the existing bloom
does the same job for free, and follows §3's shape-first rule.
⚠️ **castShadow is switched OFF on the forged body.** `forgeWeapon`
sets it on every mesh (right for a weapon in the world), and inheriting
it would add up to two objects to every shadow-map pass for the whole
game — a cost the tiers cannot see.
⚠️ Geometry is SHARED and must not be disposed on removal; materials
are per-instance and must be.

**Verified on a clean boot, 13 checks, 0 failures:** ≤4 satellites, no
Echo, no Raiment, in-hand weapon never floats, all on screen, min
|ndc.x| = 0.55 (crosshair clear), all below the eye line, no shadow
casters, aura `#ff5b30` for a fire-attuned Cinderbound Pioneer, scene
children return to baseline across dismiss→summon (68→67→68), all 11
weapon types draw, 5 distinct shapes. Seen rendered, not just measured.

### ⚠️ THE SAME ATTACK ON EVERYTHING — three causes, and only one was obvious

Owner: *"I am still facing problems where I am having multiple same
active attacks amongst multiple weapons, please ensure that doesn't
happen and each thing has unique attacks both active and passive."*

**Measured first, across 900 forges** (trap #3 — this whole section is
an argument for counting):

| | before | after |
|---|---|---|
| most common active's share | `skewer` **61%** (328/540) | `skewer` **18%** |
| active templates in the game | **15** | **33** |
| passive templates | 26 | **40** |
| 5-Memory loadouts with a duplicate ACTIVE | **25%** | **0%** |
| 5-Memory loadouts with any duplicate | **29.2%** | **0%** |
| worst duplicates at 12 owned Memories | — | **0** |

#### 1. `_makeAbility` walked the pool, which is not a uniform choice

It hashed a START INDEX and walked forward to the first template
passing the filters. Every start index landing inside a RUN of
ineligible entries funnels into the one eligible entry after the run —
so an active preceded by six passives was **seven times** as likely as
one preceded by none. `pierce` held four templates of which exactly ONE
was active, so every start index in that family collapsed onto
`skewer`, which is why it was the opening active of essentially every
non-weapon Memory (echo 177, raiment 64, charm 43, relic 40).

⚠️ Weapons were the only healthy form, and **only** because
`WEAPON_SIGNATURE` hands them their opener directly — which is why the
owner reported this as a weapon problem when weapons were the part
working.

Now: **filter first, then index into the survivors.** Every eligible
template is equally likely regardless of where it sits.

#### 2. Fifteen actives is not a pool

`used` deduplicates only **WITHIN one Memory**. Nothing anywhere stopped
two Memories rolling the same Aspect, and with 3 combat slots + 2
trinkets a repeat out of 15 is the pigeonhole principle long before it
is bad luck. **No amount of selection quality fixes a pool that small.**
18 new actives and 14 new passives; every new active has a branch in
main.js's `ASPECT_USED` switch AND a row in `ASPECT_SHAPE_FOR`, added
in the same commit (trap #26). Verified by firing all 44 actives
through the real event: 0 throws, 0 "no effect branch", 0 missing
motions.

#### 3. `avoid` — the actual guarantee

`forge(form, cores, runes, element, avoid)` takes a Set of Aspect keys
the player already carries (`MemoryForgeUI._ownedKeys()`, which reads
the loadout AND the satchel — equipped Memories are not in the bag, so
either alone misses half).

⚠️ **FOUR TIERS, and the order is the point:** fresh-in-family →
fresh-anywhere → family → anywhere. The naive one-check-against-family
version still left **9.5%** of loadouts duplicated, because a small
family runs out of fresh options long before the game does.
⚠️ **It is a PREFERENCE, never a filter.** Tiers 3 and 4 permit a
duplicate rather than returning null — a hard exclusion would shorten a
Memory below its grade the moment the table was exhausted, and grade IS
the Aspect count (data/memories.js's one load-bearing rule). A silently
two-Aspect Epic is a worse bug than a repeated Sweep. Verified: 0
Memories short of grade across 3000 forges.
⚠️ **Optional, and omitting it keeps `forge()` pure.** The seed is the
RECIPE and "same form + same signs + same cores → the same Memory" is a
rule this file's header rests on. Verified: two bare forges of one
recipe are byte-identical; the same recipe WITH `avoid` keeps its
**name, grade and weapon type** and changes only its Aspects.

#### 4. ⚠️ The last duplicates were the weapon signatures, by design

Once the pool fix and `avoid` had taken pooled duplicates to zero, a
stubborn **9.2%** remained — all of it two weapons of the same TYPE.
"A scythe always reaps" is deliberate, and `avoid` could not see it:
the signature never goes through `_makeAbility`.

The fix is **not** to strip the signature — that rule is the entire
reason eleven types are eleven different things to hold.
`_weaponTypeFor()` now prefers a type whose signature you do not
already own. Two greatswords was a dull thing to be carrying anyway;
now you get a different silhouette, melee profile and signature at
once. ⚠️ Preference again, not a filter — if every type the attribute
offers is spoken for, the seeded choice stands, because reaching
outside the attribute's own list would break "a Strength Memory is a
maul".

Verified through the ACTUAL forge panel, not the console shortcut:
forging weapon/weapon/weapon/charm/relic in a row produced **bow,
staff and dagger** — three types, three signatures — and a bar reading
`1=Volley 2=Conduit 3=Gutting Run 4=Sever`, 5 Aspects, 5 distinct.

#### ⚠️ Found while doing this: NO PASSIVE IS READ BY ANYTHING

Grepped all 26 original passive keys (`cleave`, `rend`, `drink`,
`quicken`, `shatter`, `aim`, `punch`, `bulwark`, `tether`, …) across
the whole tree: **every one has zero readers outside the table that
declares it.** `LoadoutSystem._applyPassives()` folds
`attributes.strength` and nothing else. So a passive Aspect is
currently pure readout text — it prints a promise and does nothing.

This pass made passives UNIQUE (0% duplicates, verified) but did NOT
wire them, and the 14 new ones are inert in exactly the same way as the
26 that already existed. That is a deliberate scope call, not an
oversight — wiring 40 passives is a balance change across the damage,
movement and healing paths and belongs in its own pass. It is the
project's own "a grant nothing reads is worse than no grant" rule
(§7.9) at 40× scale, and it is the single largest piece of declared-
but-inert content left in the game.

### ⚠️ "QUAKE / QUAKE / QUAKE" — the pool fix did not reach the SAVE, or the NAME

Owner, with a screenshot of the hotbar: *"see there is the same
attacks, if they have different attributes name them different, or make
a different thing."*

The de-duplication pass above was live and correct, and the owner's
hotbar still read three identical rows. **Two separate reasons, and
neither was the picker.**

#### 1. A third of every Aspect in the game had no name of its own

`nameAbility()` had three styles and `style === 0` returned
`template.verb` **unadorned**. So one Aspect in three carried no
distinguishing text at all: two Memories that rolled `sweep` both read
"Sweep", identically, in the hotbar, the satchel and the bindings
panel. Now four styles, none of them bare — the verb always survives as
the root (it is the word that says what the thing does) and always
carries an adjective, an attribute, or a noun clause with it. Verified:
**0 bare-verb names in 921 generated**, and **0% of five-Memory sets
share a name**.

#### 2. A weapon signature was named `t.verb`, full stop

`_signatureAbility` deliberately kept its authored word, on the
reasoning that "Quake" is the one thing telling the player what they
are holding. True — and it meant **every warhammer in the game carried
an Aspect called exactly "Quake"**. ⚠️ `avoid` cannot reach this: a
signature never passes through `_makeAbility`, so the collision is by
construction whenever two weapons share a type. Now named through
`nameAbility()` like everything else, so it reads "Quake of Vitality"
or "Ashen Quake" — still *quake* first.

⚠️ The shared KEY stays shared on purpose. A warhammer quakes; that is
the identity rule §7 records. What was broken was the label, not the
design — and `_weaponTypeFor` already prefers an unowned signature, so
three warhammers should not arrive together in the first place.

#### 3. ⚠️ FIXING THE GENERATOR DOES NOT FIX THE SAVE

An Aspect's `name` is a STRING baked onto the Memory at forge time and
written into the save. Every naming fix applies only to things forged
*afterwards* — a returning player's satchel keeps its old labels
forever and experiences the fix as **nothing having changed**. This is
the same shape as `ensureGearLetters()`: a new rule needs a migration
or it only exists for new players.

`MemoryForge.repairAspectNames(memories)` runs at boot over the loadout
AND the satchel (a Memory is in exactly one of the two, and the
duplicates span both).
⚠️ **Renames only** — never keys, numbers, costs or cooldowns. Nothing
owned gets weaker or stronger, so the migration is legible as "the
labels got clearer", which is the only kind that can run unannounced on
someone's save. Verified: keys and costs byte-identical before/after.
⚠️ **Two passes.** Names that were ALREADY unique claim their slot
first, so a repair never renames something that was fine merely because
it was visited second.
⚠️ **Uniqueness is forced, not hoped for** — the salt is bumped until
the candidate is unused, with a lettered last resort. "Almost always
distinct" is exactly what produced the original report.
⚠️ An unknown key (pools changed under a saved Memory) **warns and
leaves the name alone** rather than inventing one for something this
build no longer understands.

#### 4. ⚠️ And the repair was invisible, because I rebuilt without repainting

Caught only by looking at the HUD after the reload. `loadout._rebuild()`
refreshes the bar's entries and **emits nothing**, while the hotbar on
screen is painted from LOADOUT_CHANGED — which had already fired during
the save restore, *before* the repair ran. So `loadout.bar` held the
three corrected names and the screen still read "Quake / Quake /
Quake": the exact bug the repair exists to fix, surviving in the one
place the player actually looks. `_paintLoadoutBar()` now follows the
rebuild.

**Verified by reproducing the report exactly**: planted three legacy
warhammers each carrying a bare `Quake`, saved, reloaded →
`[Forge] 3 duplicate Aspect names resolved across 3 Memories`, and the
HUD read **"1 Hollow Quake of Vitality · 2 First Quake of Vitality ·
3 Drowned Quake"** with keys and costs untouched.

### ⚠️ THE BORROWED WEAPON — using another slot's Aspect shows THAT weapon

Owner: *"whenever I have equipped one weapon, but I use the skill of
the other, the model of the initial weapon remains, it should change."*

The viewmodel is driven solely by `loadout.activeWeapon`, so firing the
scythe's Reap while holding a dagger swung **the dagger** through a
scythe's animation. ⚠️ The 1..9 bar deliberately pools all three combat
slots (§7 — "switching slots changes what you swing, never what your
number keys do"), and that design is exactly what makes this visible:
**most Aspects you press belong to something you are not holding.**

`_borrowViewmodelWeapon(memory, seconds)` brings the right weapon up
for the length of its own motion and puts it away after.
⚠️ **Purely visual.** `loadout.activeSlot`, `player.weaponAtk` and the
melee profile are untouched — what you are actually holding never
changes under you.
⚠️ Restores through `_equipViewmodelWeapon` directly, **not**
`player.equipWeapon()` — that method is the sole writer of `weaponAtk`,
emits UI_NOTIFY and rebuilds the body rig, so undoing a cosmetic swap
through it would announce "Equipped X" every time an Aspect finished.
⚠️ Duration comes from the motion's own `ASPECT_SHAPES` entry (+0.22s),
so the two cannot drift and the weapon is still in frame as the swing
settles — snapping away on the last animation frame reads as a flicker.
⚠️ **Non-weapon Memories deliberately swap nothing.** A charm has no
weapon model and `forgeWeapon` would forge a sword from its absent
`weaponType` (trap #11). Their Aspect plays on whatever is held, which
is the honest reading: the charm did it, not your hands.
⚠️ A real `PLAYER_EQUIP_WEAPON` clears the borrow flag, or the borrow's
timer expires later and reverts the weapon the player just swapped to.

Verified: dagger in hand → press the greatsword's Aspect → viewmodel is
`greatsword` → after the motion, back to `dagger`, with `activeSlot`
and the in-hand weapon unchanged. Pressing the dagger's OWN Aspect
correctly swaps nothing.

### ⚠️ PROFILES — "the saves don't overlap"

Owner: *"I should have a menu where I can choose the character so the
saves don't overlap."*

There was **one save key for the entire game** (`mz_save_v1`). Starting
a second character silently overwrote the first the moment the 20-second
autosave ticked — not on request, with no prompt, and no way back past
the single `_prev` generation.

A profile is an id, a name and a save under its own key
(`mz_save_v1__<id>`). **The save format is unchanged**; only which key
it lives at. `#roster-screen` sits BEFORE character creation, because
choosing the profile is what decides which key every later read and
write lands on.

⚠️ `SaveSystem._key()` returns a **scratch** key when no profile is
selected. Autosave ticks regardless of what screen is up, and a stray
write into a stranger's slot is the exact overlap this feature exists
to end.
⚠️ `useProfile()` resets `_dirty` and `_autoTimer`. Carrying them
across a switch writes the PREVIOUS character's pending state into the
newly selected slot on the next tick.
⚠️ The profile id is **not** derived from the name. Players reuse
names, and a name-keyed id would make the second "Aster" overwrite the
first — the precise bug being fixed.
⚠️ **Bindings are per-profile too** (`mz_bindings__<id>`). Gear letters
name MEMORY IDS, so a shared table hands a new character a keyboard
pointing at a stranger's satchel — and `pruneGearBindings()`
deliberately does not run at boot, so those ghosts would survive
indefinitely while eating the free letters the new character needs.
`bindSystem.useProfile()` clears before loading, or the previous
character's table is still in memory and the next `_save()` writes it
into the new key.
⚠️ **`migrateLegacySave()` adopts a pre-profiles run**, copied not
moved, so an older build still finds it. Without it a returning
player's character simply does not appear in the new menu — 
indistinguishable from having been deleted, and the worst possible way
to receive a feature whose entire purpose is not losing characters.
⚠️ It reads `data.player.name`, NOT `data.meta.name` — `meta` holds
only `savedAtLevel`, so the first version adopted every returning
player's character as "Pioneer".
⚠️ `startGame({continuing:true})` from the roster skips profile
creation; without the flag, loading a character forks a duplicate of it
every single time.
⚠️ `addEventListener('click', startGame)` would pass a **MouseEvent as
`opts`**. Harmless today (`opts.continuing` is undefined) and a silent
break the moment a second flag is added — wrapped in an arrow.
⚠️ `SKILLS` is an OBJECT keyed by id, not an array. `.slice()` on it
throws, and the continue path was the only caller.

Verified end to end: clean install → empty roster → made "Aster"
(4242 gold) → made "Brack" (11 gold) → **Aster's save intact at 4242**
→ reload → roster lists both → Continue Aster restores 4242 and its
name and skips creation → delete removes the save, the row and unpoints
the system. Legacy adoption verified from a bare `mz_save_v1`.

#### ⚠️ And a story card was eating every click on the menus

`SceneUI` cards are `position: fixed`, `z-index: 900`,
`pointer-events: auto`. main.js's own note at `questSystem.init()`
records that the first `chunkManager.update()` can complete mq1 and
request **Act II's chapter card during BOOT** — so it rendered over the
loading screen, the roster and character creation and **swallowed every
click on them**. Measured on a clean install: opacity 1, pointer-events
auto, over a roster whose buttons were unreachable.

⚠️ This pre-dates the roster — it was covering character creation the
whole time, and only went unnoticed because every automated check
drives the form with `.click()` on the element directly, which ignores
what is painted on top. A real mouse was blocked.

`SceneUI` now starts **suspended** and `resume()`s when the world does.
⚠️ HELD, not dropped — the act genuinely began, and discarding the card
would cost a story beat to fix a layering problem. Only the LAST card
is kept: replaying a run of them the instant the player gains control
is worse than opening on the one they are at.

### ⚠️ TERRAIN LOD — the lever the chunk-build pass missed

Owner: *"fixing lagg issues"*.

The previous chunk-build pass took one chunk from 16.6→12.7ms median and
concluded the residue was **"raw simplex evaluation, inherent to the
height function"**. That is true PER VERTEX. It never asked **how many
vertices the distant rings need.**

Measured live by instrumenting `TerrainGenerator` at `high` (res 64):

| | per chunk |
|---|---|
| vertices | 4,225 |
| `_getHeight` calls | 9,605 (2.27/vertex) |
| **simplex evaluations** | **38,420** (9.1/vertex) |
| `getBiomeWeights` | 81 — the BIOME_STEP cache works as documented |

Every chunk was built at the full tier resolution **regardless of
distance** (`TerrainGenerator.js` read `quality.settings.chunkResolution`
with no distance argument; `ChunkManager` never varied it). With
renderDistance 2 that is ~105,000 vertices and **~960,500 noise
evaluations to fill the view**, while the outer ring sits 128+ units out
where 0.57m vertex spacing is far below what the screen resolves.

`_lodResFor()` grades by **Chebyshev ring** (the loaded set is a SQUARE —
Euclidean would give a ring's diagonal chunks a different LOD from its
edge chunks and put the seam *inside* the ring). ring≤1 full, ring 2
half, ring 3+ quarter.

**Measured after:** 105,625 → 59,801 vertices in view (**−43%**),
960,500 → 522,228 noise evaluations (**−45.6%**), scene triangles
1,033,593 → 927,191.

⚠️ **The chunk that causes the hitch is the one that got cheapest.**
Newly streamed chunks are always the OUTER ring, which is exactly what
dropped to half res: **38,420 → 11,028 noise evaluations, 3.5x cheaper**,
for the chunk built while you walk into new ground.

⚠️ **Lighting seams are immune to LOD by construction** — normals are
central differences of a world-space analytic field with a FIXED
`EPS = 0.75` world units. Two chunks at different resolutions compute
byte-identical normals at a shared position. This is why LOD is cheap
here at all, and another reason `EPS` must never become segSize-relative.
⚠️ **Geometric cracks are NOT immune.** A res-32 chunk draws a chord
between points 2m apart; its res-64 neighbour has a vertex in the middle
following the real field, and on convex ground the low-res edge sits
below it — you see through the gap. Handled by a **skirt**: a ring of
vertices below the border, dropped `SKIRT_DEPTH = 6.0` and joined by
quads. 260 verts / 512 tris at res 64 (~6%), paid so the other rings can
be built at a quarter. Verified on 34-unit relief: no visible cracks.
⚠️ The skirt ring is **CLOSED** (wraps last→first). Left open it leaves
four corner gaps, which is exactly where two LOD levels meet.
⚠️ Resolution is coerced **EVEN** — an odd res drops the normals pass to
STRIDE 1 *and* puts the far edge off the gradient lattice, which is the
seam this project already fixed once.
⚠️ `geo.computeBoundingSphere()` after merging, or the chunk frustum-culls
while its skirt is still on screen.
⚠️ ChunkManager's hub flatten now clamps **surface vertices only**
(`geo.userData.surfaceVertexCount`) — clamping the skirt to the same
ceiling collapses it and removes the crack cover.
⚠️ **UPGRADE-ONLY, one per chunk crossing.** Downgrading a chunk you
walked away from costs a full rebuild at the exact moment the frame
budget is committed to the chunks ahead of you. Verified: a ring-2 chunk
at LOD 32 became LOD 64 the moment it entered ring 1.

### ⚠️ 100 SHADER PROGRAMS, AND 68 COPIES OF THE SAME MATERIAL

The handoff names **first-sight shader compilation** as the remaining
hitch. Measured in a live 25-chunk view: **201 material instances
collapsing to 23 distinct shader shapes**, **174 redundant material
objects**, and **100 compiled programs**.

`forgeShard` was the culprit — it allocated **two fresh
MeshStandardMaterials and five fresh geometries per shard**, and there
were 68 shards in view: 68 identical copies of the body material, 68 of
the rock. Seven other PropForge functions did the same for one material
each (`crackMat`, `runeMat`, tower glow, gate sheet, keep windows,
brazier fire, well water, stall cloth).

⚠️ `mat()` already existed and already cached — but it **requires a
PROP_SURFACES role** and silently gets no textures for one that is
absent (trap #8), so anything wanting a deliberately untextured material
bypassed it entirely and called `new THREE.MeshStandardMaterial`.
`plainMat()` is the cache for exactly that case, keyed on the full
visual signature.
⚠️ Shard geometry now follows the **shared-unit-geometry** rule the
trees and rocks already use: one cone, scaled per instance, instead of
three fresh `ConeGeometry` per shard purely to vary radius and height.

**Measured at spawn, against the same baseline:** compiled programs
**100 → 20 (−80%)**, redundant material objects **174 → 42 (−76%)**,
material instances 201 → 158. At a shard-dense location distinct
geometries fell **1,107 → 338 (−69%)**.
⚠️ A cached material is SHARED. Anything that would later mutate what
it gets back must not use `plainMat`.

### ⚠️ A BLADE THAT IS ACTUALLY BLADE-SHAPED

Owner: *"model creation of weapons"*.

Every edged weapon had a **`BoxGeometry` blade** — constant width,
constant thickness, guard to tip, with a cone stuck on the end for a
point. The plans around it were genuinely detailed (grip, guard, fuller,
langets, honed bevels, chips) and **all of it was hung on a shape that
reads as a lolly stick**. No amount of surface decoration fixes a
silhouette, and the silhouette is what fills the screen in a
first-person viewmodel.

`_bladeGeometry()` builds a **diamond cross-section tapering in both
width and thickness to a point**. That buys a central ridge that catches
the key light, a silhouette with direction, and real facets for the
flat-shaded house style to shade. Applied to sword, greatsword (which
delegates), dagger and dual blades.
⚠️ Built as ONE geometry, not stacked primitives — the old blade was
body + cone tip + 2 bevels = 4 meshes; the tip is now the geometry's own
point, so the blade's stated length is finally the length you see.
⚠️ The base is **capped**. Left open it shows as a hole through the
guard whenever the camera catches the weapon from below, which in a
first-person viewmodel is most of the time.
⚠️ 4-sided on purpose — a rounder section needs far more vertices and
fights `FACET_ORGANIC`'s flat shading. The diamond IS the look.

### ⚠️ ARMOUR DID NOTHING, FOR THE LIFE OF THE PROJECT

`player.stats.def` was **written and never read**. `recomputeStats()`
kept it honest, armour tokens and Raiment both fed it, the satchel
printed it — and nothing applied it to incoming damage. HANDOFF §7
listed it as open and called it "a real balance change, left for the
owner". Every piece of armour in the game changed a readout.

Applied in `Player.takeDamage()` because that is the **single funnel**
every source of player damage passes through; at the call sites instead,
each new damage source has to remember, and the one that forgets is
invisible (trap #12's shape).

    reduction = def / (def + 110), hard-capped at 0.70

Verified: def 10 (bare) → **8.3%**, def 54 (four Raiment) → **32.9%**,
def 100 → 47.6%, def 250 → 69.4%, def 1,000,000,000 → **70.0%**.

⚠️ **THE CAP IS NOT DECORATION.** Uncapped, the curve asymptotes to 100%
and the player becomes unkillable — and `def` has four independent
contributors, one of which (Raiment) is **uncapped by design**. That is
precisely what makes a cap here mandatory.
⚠️ **NaN-guarded.** `def` is recomputed from four sources; a NaN
reduction makes `dmg` NaN, and `hp <= 0` is false forever after —
silent immortality. Same failure `_sanitiseHp` exists to prevent.
⚠️ **Floored at 1.** A blow landing for 0 reads as a miss.
⚠️ **The wand's unstable-surge self-damage BYPASSES armour**
(`ignoreArmour: true`). It is your own working going wrong, not a blow,
and letting Raiment absorb it removes the risk the mechanic exists to
create. Verified: 100 raw vs 31 for the same hit taken normally.
⚠️ The damage floater now shows the MITIGATED number, so it agrees with
the health bar.

### ⚠️ "THE 3D MODELS ARE STILL THE SAME" — and they were

Owner, after a pass that changed four blade shapes: *"I am not happy
with the 3d models, they are still the same!! Fix them."* Correct. That
pass touched weapons only, and **weapons are not what fills the
screen** — buildings are.

⚠️ **Look at it before theorising.** A screenshot answered this in one
frame: a keep was a slab with square teeth, a tower was a cylinder
wearing a cone, and neither had an opening, a roof edge, a base or any
depth in the wall. `forgeTower` was, in total: one cylinder, one cone,
ten boxes, one glowing strip.

**The vocabulary block in PropForge** (`_opening`, `_band`,
`_corbelRing`, `_crenellation`, `_buttress`) exists because the fix is
not more polygons — it is the five things that say "building" to an eye:

  1. **A base.** A wall meeting the ground at a right angle looks
     dropped on it; a battered plinth looks founded in it.
  2. **An opening.** One door does more than any amount of surface.
  3. **A string course.** A horizontal break gives the silhouette
     scale — without one a tower could be 4m or 40m.
  4. **An overhanging eave.** Flush roof = cone on a tube.
  5. **Vertical relief** — buttresses, corbels, quoins.

⚠️ `_opening()` is a DARK RECESS, not a boolean subtract. Real holes
need CSG per prop at chunk-build time, which is exactly the cost the
chunk-build pass exists to avoid. A near-black inset behind a proud
surround reads as a hole at every distance a player sees it from, for
three cheap boxes.
⚠️ Every helper routes geometry through `geo()`. A building assembled
from per-instance geometry would undo the dedup pass immediately
preceding it (100 shader programs → 20).
⚠️ **Broken crenellations are SHORTER, not ABSENT.** The old tower
skipped 25% of its merlons at random. Random gaps read as missing
geometry; damage has a direction and a cause. A snapped merlon leaves
a stump.
⚠️ The keep's corner turrets now build their tops through the SAME
`_crenellation`/`_corbelRing` helpers as the free-standing towers. They
used to be built inline and the two had drifted to different tooth
counts and proportions — on structures the player sees side by side in
the Sanctuary.
⚠️ The keep's main block had a **FLAT TOP**. Four turrets with conical
caps around a flat slab reads as a wall enclosing nothing; the
silhouette that says "keep" is a pitched mass rising *between* the
turrets. A 4-sided cone IS a hipped roof and costs one mesh.
⚠️ The keep's windows were bare glowing boxes sitting PROUD of the
wall — lamps stuck on a building rather than light coming out of one.
Now recessed behind jambs, sill and lintel, arched on the storey the
eye actually reaches.

### ⚠️ THE FRACTURE STRIKE — the weapon comes apart to do its work

Owner: *"add cooler animations, where the weapon gets divided, performs
action and making it look cool."*

On an active Aspect the held weapon **separates along its own length**:
every piece it is built from flies outward, spins, hangs apart for the
beat the damage lands on, and snaps back. It is the one animation that
could only exist in this game — a world whose central fact is a
Fracture, and a weapon that briefly stops being one object.

⚠️ **IT COSTS NOTHING TO BUILD.** It animates the meshes the weapon is
already made of (`forgeWeapon` returns 6–17 parts) — no new geometry,
no new material, no particle system, no extra draw call. That is why it
can run on every Aspect press without touching the frame budget the
chunk pass fights over.
⚠️ **The offset direction is each part's OWN** — outward from the
weapon's axis to where it already sits, plus a lengthwise push. Bevels
peel sideways, the tip goes forward, the pommel drops back: the weapon
comes apart the way it was assembled. A uniform explosion direction
reads as a bug, because the parts move in a way the object's
construction does not explain.
⚠️ **The envelope is ASYMMETRIC** — a fast break over the first 22% of
its life, then a slower gather. A symmetric in-out reads as breathing;
a hard separation followed by a pull back reads as a strike, and it
puts the widest spread on the frames the damage actually lands on.
⚠️ **Restored ABSOLUTELY from a captured pose, never wound back down.**
Integrating a delta and subtracting it later is how this drifts a mesh
a fraction per cast — and the weapon is rebuilt on equip, so the drift
would appear to fix itself at random and be miserable to track (trap
#48's shape). Verified: **40 consecutive casts, max drift 0.0023
units**, and that residue is `animateWeapon`'s own idle motion, not
accumulation.
⚠️ **Cancels if the weapon is swapped mid-animation.** The captured
parts are detached once the viewmodel rebuilds (a borrow, an equip,
empty hands) and restoring them would write into an orphan. Verified:
unequipping mid-shatter throws nothing.
⚠️ Driven AFTER `animateWeapon()`, never before — that function writes
rotation on the weapon's own named parts, so running the shatter first
has its pose overwritten for exactly those parts and the effect plays
on some pieces and not others.
⚠️ Scratch `Euler`/`Quaternion` at module scope. This runs every frame
per part while live; allocating two objects per part per frame is the
per-frame garbage this project's hot loops get audited for.
⚠️ **Amplitude was tuned by LOOKING, twice.** At 0.06/0.55 the
separation was real and read as a wobble at speed. At 0.14/1.25 pieces
reached the screen edges and read as debris rather than as a weapon
coming apart. 0.10/0.85 sits between: unmistakably separated, still
obviously one weapon.
⚠️ Duration and amplitude scale with the Aspect's **Essence cost**, so
a 9-cost Pommel flickers and a 27-cost Unmake tears the weapon open —
the animation reports the size of what you spent, which no cooldown
number on the bar can do.

### ⚠️ THE HILT, NOT THE BLADE — "the weapons still look the same"

Owner, after a pass that rebuilt every blade into a tapered
diamond section: *"the weapons still look the same."* Twice.

**The blade was the wrong half.** In a first-person viewmodel the blade
points AWAY from the camera and foreshortens to a sliver; the HILT sits
nearest the lens and fills a corner of the screen for the entire game.
And the crossguard was `BoxGeometry(w, 0.035, 0.055)` — **a 3.5cm-tall
flat plate** with no thickness, no shape and no ornament, against a
72cm blade. That is why every weapon read as a stick no matter what was
done to the blade.

A real crossguard has three things, and now so does this one:
  · a **thick central block** taking the blade's shoulder;
  · **arms that taper and flare** — a 4-sided cone per arm tapers along
    its length for one mesh, with a terminal knop to end on. A
    constant-section bar is precisely what reads as a plate;
  · a **langet** reaching up onto the blade, which is what makes a
    guard look forged ONTO a weapon rather than threaded on after.
⚠️ `guardStyle 3` ("no crossguard") still gets a COLLAR. Without one
the grip and blade simply abut, which reads as an unfinished model
rather than as a deliberate hiltless silhouette.

**And grade is finally visible on the object.** `_weaponAccent` gave a
Flawed weapon and a Divine one an identical 5cm gem, so the most
important fact about a weapon — how good it is — existed only as a
number in a panel. The gem now scales with tier, Rare+ adds prongs
caging it, and Legend+ adds a halo ring. Verified: sword mesh count
16 → 20 → 23 across tiers 1/3/5.
⚠️ This is also the first thing that makes ASCENDING visible. Ascension
adds an Aspect and previously changed nothing you could see while
holding the weapon.

### ⚠️ THE FRACTURE STRIKE IS RARE NOW

Owner: *"the splitting animation is shit, and isn't meant for all
attacks."* The second half was the real bug — it fired on **every
active Aspect**. An effect that plays on every press is not a special
move, it is the walk cycle; and a cloud of moving parts buried the
ability's own arc/ring/lance underneath it.

It now plays for exactly two things: a weapon's **signature** (the move
only that type can roll — the move that IS the weapon), and anything
costing **20+ Essence**. Everything else keeps its ordinary viewmodel
motion.
⚠️ A signature always plays at FULL strength regardless of its cost. It
is the weapon's defining move and a cheap one must not look like a
lesser version of an expensive one.
Verified: 9-cost Pommel → no shatter. 14-cost Hew → no shatter.
27-cost Unmake → shatter. 13-cost Riposte (signature) → shatter.

### ⚠️ TERRAIN — seven additive fBm layers look like seven additive fBm layers

Owner: *"for gods sake improve the terrain as well."*

The height stack was **seven additive fBm layers**, and additive fBm
has exactly one look: soft, blobby, isotropic swells. Every ridge runs
in no particular direction and every valley is round. More octaves do
not help — they add smaller versions of the same blobs.

**1. DOMAIN WARP.** The sample coordinates are bent by another noise
field before the two layers that decide the silhouette are read. Ridges
meander and braid, basins elongate, and the ground reads as something
folded rather than summed. Highest ratio of visual change to cost in
procedural terrain.
⚠️ Applied ONLY to continent and mountain. Warping the fine layers
costs four more reads per vertex to move detail nobody can resolve, and
`getGroundY` is the most performance-critical function in the game.
⚠️ `WARP_AMP` is in WORLD UNITS and deliberately large (46). A warp
smaller than the feature it bends does nothing — it has to be a real
fraction of that layer's wavelength or it is just shimmer.
⚠️ Cost is **+2 raw noise reads per `_getHeight`**, not free. It is
affordable because the LOD pass immediately before it removed 45% of
the noise budget.

**2. STRATA.** The final height is snapped toward horizontal bands and
blended back. Flat shelves with steeper risers between them — what
makes a slope read as sedimentary rock instead of a ramp, and what
gives the eye a horizontal reference for how big a hill is. **Pure
arithmetic on a height already computed: no extra noise reads**, which
matters at ~9,600 calls per chunk.

⚠️ **I SHIPPED THIS INVISIBLE ONCE.** The first version blended 42%
toward the bands, which does not terrace — it compresses the slope
slightly. Measured: **0 flat spans in 67 samples** across a 200m
traverse. A shelf is defined by the riser next to it, so most of the
height has to actually snap. At 0.82 it measures **16 flat spans in
150**. ⚠️ Do not take it to 1.0 — the flats become exactly level,
`getGroundY`'s gradient goes to zero across whole shelves, and the
analytic normals have nothing to shade: a stepped world lit like a flat
one.
⚠️ Strength is PATCHY, driven by a layer already in hand (`local`).
Uniform terracing reads as a rendering artefact stamped over the world;
bands that appear on some faces and fade on others read as exposed rock.
⚠️ Applied BEFORE `flattenFactor`, so the spawn bowl still flattens
cleanly instead of terracing into a stepped crater.

**Verified playable, which is the part that could have gone badly.**
Share of ground steeper than 45°: **0% near spawn, 3.3% mid-range,
23.7% only at the world's most extreme point** — a hostility gradient
that matches the existing "tier rises with distance from spawn" rule.
⚠️ And the rendered mesh still agrees with `getGroundY` to **1e-6**, so
physics and terrain did not diverge.

### ⚠️ "THERE ARE NO VISIBLE CHANGES" — twice, and both times it was true

Owner, after two rounds of model work: *"There are no visible
changes."* The changes were real, measured and screenshotted. They were
also **in two places the player never looks**, and finding that out took
one query against the live game that should have been the FIRST thing
either round.

#### 1. The player does not hold `forgeWeapon()` — they hold `forgeWand()`

`viewmodel.wand` is ALWAYS present. `viewmodel.weapon` is **null until a
weapon Memory has been forged and equipped**, which is most of the early
game. Every blade rebuild, every crossguard, every grade ornament went
into `forgeWeapon()` — a function the owner's session may never have
called.

⚠️ And `forgeWand()` was already the most detailed model in the project
(pommel, tapered haft, seven irregular leather wraps, collar filigree, a
four-tine crown cage, orbiting chips). So the one thing on screen was
the one thing not touched, and it also had the least to gain.

**How this was diagnosed, and the lesson:** one console query —
`loadout.activeWeapon` and `distanceFromSpawn` — against the LIVE game.
It returned `sword` / `1390` for my session and would have returned
`null` / `~0` for theirs. ⚠️ **Verify what the player is looking at
before deciding what to improve.** This is trap #74 escalated: not just
"screenshot the right thing" but "confirm the code path is even
REACHABLE from a default save".

#### 2. Spawn was multiplied toward zero height

`flattenFactor = min(1, dist / 120)` flattens everything within 120
units of origin — and that is precisely where a new player spends their
first half-hour. Measured relief across a ring, BEFORE: 60m → **1.0**,
120m → 2.0, 200m → 8.5. Domain warp and strata were both working
perfectly and both invisible, because the whole neighbourhood was being
multiplied by ~0.

Radius 120 → **85**. ⚠️ It cannot go much lower: the Sanctuary's built
footprint (keep at z=-11, corner towers ±14, outer ring ~24, stalls
beyond) needs level ground, and buildings are placed at fixed positions
with **no terrain-conforming foundation**. Verified the footprint stays
level at 0.92 units of relief across ±30.

### ⚠️ THE SHATTER IS GONE — the working part wakes instead

Owner: *"the split animation looks really bad, it shouldn't be used, use
something different for the same, but the splitting if needed can be
done to highlight a part of the weapon used to use the attack."*

Deleted, not tuned. Flinging a weapon into its component meshes read as
the model falling apart rather than as a strike, and a cloud of tumbling
parts buried the ability's own arc/ring/lance underneath it — the effect
competed with the thing it existed to announce.

What replaced it is what the owner described: **the part that does the
work lights up.** A cut wakes the edge, a thrust the point, a hammer
blow the head, a casting the focus stone (`ASPECT_PART_FOR`). The weapon
stays whole and readable; the eye is told where the power went. A strike
is something a weapon DOES, not something that happens TO it.

⚠️ **Parts are TAGGED (`userData.part`), including on the WAND.** An
effect that only tagged forged weapons would have been invisible to
exactly the player who reported it.
⚠️ **Materials are shared and cached.** Writing emissive onto a part's
material would light every weapon sharing it — halo satellites, body
rig, other slots. Each lit mesh gets a private clone made lazily on
first use, kept on the mesh, and is **restored to the shared material**
afterwards. Leaving the clone in place would undo the dedup pass (174
duplicate materials → 42) one swing at a time.
⚠️ **A weapon with no matching part falls back to the focus stone.** A
grimoire has no edge and a dagger has no head; without the fallback the
effect would read as "broken on some weapons".

#### ⚠️ And it did nothing at all until the second writer was found

The flare was applied, cloned, restored — and the wand never lit.
`updateViewmodel` writes `wand-core`'s `emissiveIntensity` **every
frame, unconditionally**, for the channel pulse, and it runs AFTER the
glow. Two writers to one field; the pulse simply overwrote the flare on
the same frame (trap #9, again).

Fixed the way this project always fixes it: the glow **publishes an
additive factor** (`_weaponGlowBoost`) and skips `wand-core`; the
existing owner folds it into its own expression. Verified: rest 0.35 →
peak **3.58** at frame 5 (inside the hit window), cooling back to
exactly 0.35, no NaN.

### ⚠️ "IT DOESN'T FEEL LIKE A GAME" — the world was empty where you play

Owner: *"I don't know why, but the game doesn't feel like a game."* and
*"it's also a bit too fast paced, doesn't feel like a game nor real
life."* Three measured causes, none of them a missing feature.

#### 1. THE KILL QUEST IS ISSUED INTO AN EMPTY WORLD

Measured on a brand-new character, standing where the game puts you:

    active quest      mq2 — "Fell three skeletons beyond the gate"
    enemies at   0m   0
    enemies at  60m   0
    enemies at 120m   0
    enemies at 185m   0
    enemies at 210m   2

`EnemySpawner.sanctuaryRadius` was **190** while `spawnRadius` is
**30** (ring 30–56). So the game hands you a kill objective and then
guarantees nothing killable can exist within 190 units in any
direction. The core loop breaks at its FIRST step — not at reward, not
at combat, at *finding an opponent* — and the player wanders an empty
world wondering what the game is.

⚠️ **THE TWO RADII ARE COUPLED AND NOTHING COUPLED THEM.** A no-spawn
zone more than three times the spawn ring means the ring can never
straddle the boundary, so there is no gradual reintroduction of danger
— just a hard empty circle you must fully exit before the world
contains anything at all.

**190 → 78.** Clears the Sanctuary's built footprint with margin
(furthest structures near 24, stalls beyond) and puts the first
creatures just outside the gate — which is exactly where mq2's text has
said they were the whole time. Verified: **0 at spawn, 0 at 60m
(Sanctuary still safe), 2 at 95m, 3 at 140m.**

#### 2. THE PLAYER MOVED FASTER THAN THE 100m WORLD RECORD

`MOVE_SPEED: 8` is a real number in real units. A brisk human walk is
~1.4 m/s, a jog ~3, a trained sprint ~7; the 100m world record averages
~10.4. The player moved at **8 m/s permanently**, and
`SPRINT_MULTIPLIER 1.6` took that to **12.8 m/s — 23% faster than any
human has ever run**, held indefinitely, through a world built at human
scale.

That single number compounds everything: chunks stream past before they
establish themselves, landmarks arrive before they can be read, and
buildings sized in metres flick by as set dressing.

**8 → 5.2** (sprint 8.3 m/s — hard, athletic, and finally possible).
⚠️ Not lowered further: 64-unit chunks and landmarks hundreds of units
apart mean crossing the world has to stay viable. This is a FEEL
change, not a difficulty one.

#### 3. A FULL DAY LASTED EIGHT AND A HALF MINUTES

`a = _time * 0.012` → 2π/0.012 = **524 seconds**. The sun crossed the
entire sky twice per quarter-hour; shadows visibly swept the ground
while the player stood still. **A day you can watch move is the
strongest possible signal that a world is a toy.**

**0.012 → 0.0035** — 2π/0.0035 ≈ **1795s ≈ 30 minutes**, the range this
genre has converged on: long enough that light reads as a condition you
are in, short enough that a session still sees night fall. Verified
live at **29.9 minutes**.
⚠️ Nothing else needed retuning — every consumer reads `_sunAngle` or
the derived direction, never elapsed time, so they all stretch with it,
and `_refreshEnvironment` is bucketed off sun direction so a slower sun
fires it LESS often.

#### What was NOT wrong (checked, do not re-investigate)

The reward loop is intact and was never the problem. Verified end to
end on a real kill: the enemy dies, **Essence is granted** (15.6 →
22.1), **XP is granted** (65 → 71, scaled down by `_scaleKill` for a
level-4 player against a level-1 creature), **mq2 advances** (0 → 1),
and the player is notified. An earlier probe read "no XP" only because
the kill fell outside its sampling window — ⚠️ `_scaleKill` means a
high-level player killing weak creatures gains very little, which looks
like "XP is broken" if you test with a levelled character.

### ⚠️ THE BROKEN MOON — the Shadow Slave pass, part one

Owner: *"make the map much bigger, take inspiration from Shadow Slave's
maps, change the sky, spawn and structures completely."*

Shadow Slave's look is specific and it is not "dark fantasy" generally:
a **colossal shattered moon** over a dead world, colossal ancient ruins
at inhuman scale, and a sky that is ash rather than fire. Of those, the
moon is the single defining image and the only one visible from frame
one, so it went first.

**Drawn in the SKY SHADER**, not as a billboard or a sphere. It must sit
behind everything at infinite distance, never parallax as the player
walks, and cost nothing to have on screen permanently. `uMoonDir` is
FIXED — like the rift — because a moon that tracked the sun would be a
light source, whereas this is a **landmark**: the one thing in the same
place from every point in the world, which is much of what makes an
open world feel like one place rather than an extruded plane.

⚠️ **Angular size 0.20 rad ≈ 23° of arc.** Our own moon is 0.009 rad
(0.5°) — this is roughly **forty times** the size. It has to dominate,
not decorate.

⚠️ **THE SLIDE MUST BE PERPENDICULAR TO THE CUT.** The first attempt
displaced the broken piece by `(0.30, 0.18)` against a cut normal of
`(0.78, 0.62)` — nearly PARALLEL — so the piece slid ALONG the fracture
instead of away from it, and the moon rendered as an unbroken disc.
Verified by screenshot, not by reading the code: it looked correct in
source. The displacement is now `cutN * 0.34` and the break is
unmistakable.
⚠️ **The gap is cut in the ORIGINAL frame, not the displaced one.**
Cutting after the slide moves the hole along with the piece and closes
it again.
⚠️ **The moon REPLACES the sky colour, it does not add to it.** Added,
the horizon's bloom bled straight through and the disc came out a pale
smudge. A body at infinity should occlude what is behind it. The halo
was also tightened (falloff 5.5 → 26) — a wide halo was what cost the
limb its edge.
⚠️ Drawn BEFORE the rift, so the Fracture reads as passing in FRONT of
the moon. The sky is wounded and the moon is behind the wound, which is
the right way round for this fiction.

**The sky re-graded cold.** The `hell` palette was an ember furnace
(horizon `0x7a3512`, glow `0xc85f26`) that flooded every frame orange
and washed the moon out — the sky was competing with the thing meant to
dominate it. Now ash and slate (`0x141a26` / `0x4a4048` / `0x6b5a66`).
⚠️ The horizon keeps a LITTLE warmth deliberately: a fully monochrome
sky reads as fog rather than dusk, and this project's grade already
crushes saturation hard (§4's vibrancy note) — remove the last colour
and the world goes grey-on-grey.

### ⚠️ THE REALM — Shadow Slave biomes (part one of several)

Owner: *"replicate all the biomes of the realm in Shadow Slave like the
Hollow Mountains, Godgrave, etc."*

Five biomes added — **Godgrave, The Hollow Mountains, The Forgotten
Shore, The Dreaming City, The Bottomless Pit**. The governing idea, and
the thing that separates them from the 22 fantasy biomes above them:
every region is the CORPSE of something enormous, and the player is
small in it. There is no green in this set and that is deliberate.

⚠️ **Separated by SHAPE first, palette second** (§4's rule). These are
now the extremes of the whole table: Godgrave is the FLATTEST thing in
the game (0.30 height / 0.10 roughness — the bones are the relief, and
hills would compete with them), the Hollow Mountains the most vertical
(2.40 / 1.00 mountain), the Dreaming City the most terraced (0.95
plateau — shelves, not hills), and the Bottomless Pit has near-zero
mountainFactor on purpose because it SINKS rather than rises.

#### ⚠️ ORDER DECIDES EXISTENCE — a biome scored 0% across three seeds

The first selection order tested Godgrave's `temp > 0.46` before the
Pit's `humid < 0.44`, so the Pit could only fire in the 2%-wide band
`temp ∈ [0.44, 0.46]`. It was declared, defined, branched — and
**unreachable**, exactly like FLOATING_ISLANDS has been for the life of
the project. Each biome now leads on the axis it OWNS (Mountains =
highest continentality, Shore = lowest, Pit = driest, Godgrave =
hottest, City = coldest) so no later test can be starved by an earlier
one.

⚠️ Verified by **counted sweep over three seeds**, never by reading
branches (trap #3). Realm share of the outer world: **67% / 68% / 67%**,
with every biome between 7% and 22%. The first tuning gave the Hollow
Mountains — the biome the owner named FIRST — a **1.8%** share while a
leftover took 18%.

#### GODGRAVE — a continuous skeleton, not scattered bones

`forgeRib`, `forgeVertebra`, `forgeGodSkull` in PropForge;
`_generateGodBones` places them.

⚠️ **THE SPINE IS ONE CURVE THROUGH WORLD SPACE, not per-chunk
scatter.** `spineZAt(worldX)` is a pure function, so adjacent chunks
agree on where the spine is without communicating — same reasoning as
the analytic height field. Scattering ribs per chunk gives *a desert
with bones in it*; one continuous curve gives *a single skeleton
kilometres long you can walk the length of*. That difference is the
entire biome.
⚠️ Ribs come in MIRRORED PAIRS leaning outward. One row of arcs reads
as a fence; two opposed rows read as a ribcage you stand inside.
⚠️ Everything is SUNK into the ground, never resting on it. A bone on
the surface is a prop that was placed; one emerging from the sand is
something being buried.
⚠️ The skull is **deterministic and rare** (one chunk in 47 along the
spine), not probabilistic. A skull you might meet twice is a monster; a
skull there is exactly one of is a place.
⚠️ Scale is the point: ribs are 16–34 world units, against a Sanctuary
keep of 13. Verified in scene: **tallest bone 34.7 units, 9 over 10
units** in one view. Built at prop scale these would read as animal
bones and the biome would be gone.

#### ⚠️ THE BONES WERE INVISIBLE ON FIRST RUN — the documented trap

`_generateGodBones` follows the **build-and-return** convention, and I
only pushed its output into `decorations` without adding it to
`decorationGroup`. The bones existed, had colliders, were tracked for
unload, and were never parented into the scene. The comment three lines
below the bug says exactly this about `_generateWildernessStructures`.
⚠️ Two conventions coexist in `_loadChunk` and NOTHING marks which a
function follows: `_generateTrees`/`_generateRocks` attach themselves;
`_generateWildernessStructures`/`_generateGodBones` do not.

### ⚠️ THE FLOATING PROPS — and why the obvious suspect was innocent

28 props measured hanging in the air, worst **15 units clear**, real
Poly Haven boulders among them.

⚠️ **IT WAS NOT THE TERRAIN LOD**, which was the obvious suspect and
which the previous session's notes had already accused. Correlating
clearance against each chunk's `lodRes` cleared it immediately:

    LOD 64 (full res)  249 props   avg 0.48   worst **15.7**
    LOD 32 (half res)  633 props   avg 0.58   worst   11.2

Full-resolution chunks held the WORST offenders. A cause that produces
its largest effect where it is least active is not the cause.
**Correlate before you blame** — especially your own most recent change.

**The real cause:** `getDecorationPositions` and `getClutterPositions`
computed height from the chunk's OWN biome parameters
(`biome.heightScale` etc.), while the terrain MESH is built from
per-vertex **blended** parameters (pass 1's `getBiomeWeights` loop).
Wherever two biomes meet the two disagree, so props were placed on a
surface that is not the one being drawn.

⚠️ **THE REALM BIOMES TURNED A LATENT BUG SEVERE.** `heightScale` used
to span roughly 0.5–1.5. The Shadow Slave set spans **0.22 (Forgotten
Shore) to 2.40 (Hollow Mountains)** — a ~10x range — and the blend
error at a boundary scales with that spread. The bug was always there;
adding biomes with extreme shapes is what made it visible. Any future
biome with an unusual heightScale re-creates it if these calls revert.

Fixed by routing all three scatter functions through `getHeightAt()`,
which performs the same blend the mesh does. ⚠️ `biomeManager` is an
OPTIONAL trailing argument and the un-blended path is still the
fallback, so a caller that forgets it degrades instead of throwing —
but every call site in ChunkManager now passes it, trees included
(the tree call was missed on the first edit and caught by grep).

Verified across 2,596 props at four widely separated locations:
**28 floating → 3, worst 15.0 → 4.1**, and average gap is now slightly
NEGATIVE (props sit fractionally into the ground, which is correct).

### ⚠️ THE OTHER FOUR REALM BIOMES — every flag now has a reader

`hollowed`, `drowned` and `deadCity` were declared on their biomes and
read by **nothing**, leaving three of the five realm biomes as
distinctive terrain with generic rocks on it while the table reported
them as having features. `chasm` was added for the Pit at the same time
so all five are symmetrical.

| flag | biome | structures |
|---|---|---|
| `hollowed` | Hollow Mountains | cave mouths, natural arches |
| `drowned` | Forgotten Shore | hull wrecks, drowned pillars |
| `deadCity` | Dreaming City | broken colossi, colossal walls |
| `chasm` | Bottomless Pit | spires rising from below |
| `boneField` | Godgrave | the god's skeleton (earlier pass) |

⚠️ **ONE dispatching function** (`_generateRealmLandmarks`), not four
scatter loops. The placement rules — deterministic hash, blended
ground height, sink depth — are exactly the part that drifts between
copies, and a wreck sitting 2 units higher than a cave mouth for no
reason is what that drift looks like.
⚠️ **The "is there a structure" roll reads the hash's HIGH bits**
(`h >>> 22`) while the position reads its low bits. Sharing them would
correlate whether a chunk has a structure with where it sits in the
chunk — trap #3's family.
⚠️ **A cave mouth needs a SLOPE to be bored into.** On flat ground it
reads as a doorway standing in a field, so the local gradient decides
whether a chunk gets a cave or an arch. Arches work anywhere.
⚠️ **The broken statue is legs and a torso, never a face.** What makes
a ruin feel ancient is that the part which would tell you who it was is
the part that is gone. A complete statue is a monument; a pair of legs
on a plinth is a civilisation nobody remembers.
⚠️ **The wreck is ribs and a keel, not a boat** — deliberately rhyming
with Godgrave's bones, the same idea at two scales.
⚠️ **~1 chunk in 3**, measured at 24–41% per biome. These are 9–33 unit
structures; at tree density they would tile the horizon and stop
reading as landmarks.

Verified: all five flags produce geometry (930 / 886 / 624 / 518 / 31
chunks), all five biomes reachable, tallest structures 12–34 units.

### ⚠️ THE MAP OF THE REALM — `src/data/realm.js`

Owner: *"please don't work without making the entire map of the realm
first."* Correct, and it was the right thing to gate on.

**Until this file the realm had no geography.** The five realm biomes
were selected by CLIMATE NOISE, which means they had no locations:
Godgrave was a statistical tendency, not a place. It could not be
pointed at, navigated to, spawned into, or named in a quest, and two
sessions could never mean the same one.

**Ten named regions**, each at a fixed world position with a radius,
over the five realm terrains:

| region | at | radius | terrain | tier |
|---|---|---|---|---|
| The Forgotten Shore | −2200, 1500 | 950 | shore | 1 |
| The Hollow Mountains | 2400, −1800 | 1100 | mountains | 1 |
| The Valley of Sleep | −1400, −2600 | 780 | city | 1 |
| Godgrave | 3900, 2600 | **1400** | godgrave | 2 |
| The Sea of Sand | 5600, 600 | 1150 | godgrave | 2 |
| The Dreaming City | −4200, −1200 | 1200 | city | 2 |
| The Barren Coast | −3600, 3400 | 900 | shore | 2 |
| The Bottomless Pit | 1200, 5200 | 1000 | pit | 3 |
| The Cold Fortress | 5200, −4400 | 850 | mountains | 3 |
| The Bone Crypt | −5800, 4600 | 900 | godgrave | 3 |

⚠️ **THE MAP WINS OVER CLIMATE, ALWAYS.** `_getNaturalBiomeAt`
consults `realmRegionAt()` BEFORE the Whittaker model and only falls
back outside every region. A region noise could override is not a
place. Verified: **10/10 regions at 100% internal terrain consistency**.
⚠️ **Regions are NOT seeded.** The world seed is `Math.random()` per
load (trap #45); randomising the map with it would move Godgrave
between sessions, which is precisely the property that stops it being
a location. Terrain INSIDE a region still varies with the seed.
⚠️ **Several names share one terrain, deliberately.** Godgrave, the Sea
of Sand and the Bone Crypt are all `godgrave` country but three
different PLACES. Ten regions over five terrains is a map; ten terrains
would be a tech demo.
⚠️ **`realmRegionAt` returns the smallest NORMALISED distance, not the
first match.** Regions may overlap, and "first in the array wins" would
make borders depend on declaration order — so reordering this file for
readability would silently move them.
⚠️ **Radii are large on purpose.** A chunk is 64 units; a 900-unit
region is ~28 chunks across, about three minutes' walk at 5.2 m/s.
Under ~400 it reads as a biome patch, which is what this replaces.
⚠️ **The border is a feathered FRACTION of the radius**, not a fixed
distance — a fixed feather makes small regions all edge and large ones
all interior. Tested at the chunk CENTRE, or borders run along chunk
edges and the boundary looks rectangular at walking scale.

#### ⚠️ THE MAP IMMEDIATELY BROKE THE THING IT WAS MAPPING

`_generateGodBones` ran its spine along a fixed path near the world
origin, written when Godgrave was a climate tendency with no position.
The moment Godgrave became a mapped place at (3900, 2600), the god's
skeleton and the region named after it **stopped intersecting** — the
biome was right, the bones were right, and they were kilometres apart.
Standing at Godgrave's own centre gave **0 bones**.

The spine is now anchored to whichever bone-field region owns the
chunk, so each gets its own skeleton through its own middle, and the
skull keys off the region's chunk column rather than a global modulus
(which would have given one region three skulls and another none).
Verified at all three: **29–32 structures over 10 units, tallest ~40**.

⚠️ **This is the general hazard of adding a map to a procedural
world:** every system that previously placed things by global rule now
has a location it must AGREE with. Anything anchored to world origin —
landmarks, structure scatter, the Descent gates — should be re-checked
against `realmRegionAt` before being trusted inside a region.

### ⚠️ THE FIRST NIGHTMARE — the opening, and where innate power comes from

Owner: *"I spawn at the same place, I need to randomly spawn on one of
the big places... and then after getting out I spawn into the regular
world just like Shadow Slave"*, *"first should be a trial to decide
your innate powers, which is unique to everyone"*, *"each trial should
be unique as well."*

A new Pioneer no longer starts in the Sanctuary. They wake alone in one
of the realm's **arrival** regions, are given a trial that is theirs,
and only reach the waking world by finishing it and walking out.

`data/nightmares.js` (generation) + `systems/NightmareSystem.js`
(runtime). Five trial kinds — **Endure / Hunt / Reach / Gather /
Outlast** — because a list where every entry is "kill N of X" with a
different N is one trial with a difficulty slider.

#### ⚠️ EVERYTHING DERIVES FROM ONE SEED, AND NOTHING IS STORED

The seed is the character's own (`name:createdAt`). `generateNightmare()`
is pure and calls no RNG, so five saved fields rebuild the title,
warden, kind, goal, Aspect and Flaw exactly. Storing the generated
object would let a save written today disagree with a rebalanced table
tomorrow — a player's own First Nightmare silently changing under them.
Same rule, same reasons, as MemoryForge.

**Counted over 20,000 seeds** (trap #3 — never read a distribution):

    trial kinds        5/5    97% min/max
    aspects            8/8    97%
    flaws              6/6    95%
    aspect|flaw PAIRS  48/48   <-- count PAIRS, not halves (trap #17)
    distinct titles  576/576
    whole trials    19,991/20,000 unique (100%)
    deterministic    yes

#### ⚠️ AN ASPECT ALWAYS COMES WITH A FLAW

Power that costs nothing is loot, not identity — the same rule
data/memories.js already applies to Memory grades. Eight Aspects, six
Flaws, and the trial's `leaning` ROTATES the Aspect index rather than
filtering it, so outlasting something tends toward endurance powers
while leaving every Aspect reachable from every trial. Pinning it would
turn the trial kind into a menu and collapse the space to five
outcomes.

⚠️ Every `grant` key is read in `_applyInnate`. This project has
shipped declared-but-inert grants at least four times (§7.9, the biome
flags, all 40 passive Aspects); a key added here without a reader is a
lie the character sheet tells.

#### ⚠️ THE GRANT WAS SILENTLY ERASED BY THE SAVE RESTORE

The bug worth remembering. `_applyInnate()` originally ran inside
`NightmareSystem.restore()`. `SaveSystem.restore()` runs
`put('nightmare')` BEFORE `put('player')`, and the player block
recomputes `maxHp` from level — so the Aspect was applied and then
overwritten moments later, every single load.

⚠️ **The fingerprint was diagnostic and worth learning:** the FLAW
survived while the ASPECT did not. The Flaw is a multiplier the player
folds in per frame; the Aspect writes an absolute pool. When a
multiplier persists and an absolute value resets, you are not looking
at a grant that failed — you are looking at **a later writer**.

Fixed by `reapplyInnate()`, called from main.js after the whole restore
settles. Idempotent per session via `_innateHpApplied` on the player,
which is fresh each load. Verified: **maxHp 122 across a reload, not
244**, Flaw intact.

#### The rest, verified end to end

- Spawns inside the chosen region, never the Sanctuary — measured 721
  units from The Dreaming City's centre against a 1200 radius.
- ⚠️ Only `arrival` regions are offered. The deep realm (the Pit, the
  Cold Fortress, the Bone Crypt) would kill a level-1 Pioneer who has
  chosen nothing yet, and an unsurvivable first five minutes is not
  difficulty.
- ⚠️ The Waking Gate is a REAL structure with a 260-unit light beam,
  placed 45–70 units from wherever the player finished. A trial that
  ends with an invisible trigger somewhere in a 1000-unit region has no
  ending. Measured at 60 units — a walk, not a button under your feet.
- ⚠️ A restored WAKING phase rebuilds its Gate, or a player who saved
  between finishing and stepping through is stranded in the realm
  permanently.
- ⚠️ The Gate is removed by name on waking, or a glowing pillar stands
  in the Sanctuary for the rest of the run.
- ⚠️ A save predating this feature has no `nightmare` block, so that
  Pioneer stays awake rather than being dropped into the realm
  mid-run. Checked on `seed`, NOT on `hasSave()`.

### ⚠️ PER-WEAPON SWING ANIMATION — `COMBO_ARCS` was one table for all

Owner: *"the animation of the weapons is the same, make them better."*
Literally true: `COMBO_ARCS` was a fixed four-beat pattern applied to
EVERY weapon at one fixed decay rate, so a dagger and a warhammer
traced identical paths at identical speed. The eleven-silhouette pass
gave each type its own range, arc, damage and hit count — all real,
none of it animated. §7.11 records this as the piece left open.

`WEAPON_SWING` gives each type four beats plus a `speed` multiplier.
Measured on the real attack path (`player._performAttack()`), sweep in
radians and frames in visible motion:

| weapon | yaw | pitch | frames |
|---|---|---|---|
| dagger | 0.30 | 0.09 | **10** |
| sword | 1.05 | 0.40 | 18 |
| greatsword | 1.55 | 0.45 | **30** |
| warhammer | **0.06** | 0.65 | 25 |
| spear | **0.04** | 0.33 | 11 |
| scythe | **1.95** | 0.65 | 26 |
| dualblades | 0.85 | 0.35 | 12 |

A **6.5x spread in yaw and 3x in duration**. The warhammer and spear
have near-zero yaw on purpose — a hammer that slashes sideways reads as
a sword, and a spear pushes rather than swings. The scythe's 1.95 rad
sweep is the first time its 200° hit arc has ever been visible.

⚠️ **`speed` SCALES THE VISUAL DECAY ONLY.** The hit window stays
latched on `player.attackTimer` between 0.1s and 0.25s in
`checkCombatCollisions`. Coupling them would mean retuning an
animation silently changed what a weapon connects with.
⚠️ Keyed through `weaponPlanKey()` — the same normaliser WEAPON_PLANS,
WEAPON_MELEE and WEAPON_VFX use — and it WARNS on a miss. Four tables
keyed the same way is exactly the shape trap #11 describes.

⚠️ **Testing note that cost time:** setting `player.isAttacking`
externally does nothing — `player.update()` overwrites it from its own
timer every frame, so the probe measured all zeros and looked like the
feature had failed. Drive `_performAttack()` instead.

### ⚠️ THE TRIALS WERE UNWINNABLE FOR STRUCTURAL REASONS

Owner: *"the trials are too hard."* Not a tuning number — the enemy
difficulty ramp keys on **distance from spawn**, and the realm's
arrival regions sit 2,000–6,000 units out. `ramp` was already 1.0, so a
level-1 Pioneer who had never held a weapon met the biome's full
ceiling: enemyLevel 10 on the Shore, 14 in the Hollow Mountains, 16 in
the Dreaming City.

That is the exact bug the ramp was WRITTEN to fix ("the biome table was
never wrong, it just had no idea how far from home it was"), returning
because the First Nightmare made distance stop being a proxy for
progression. **The moment a game can start you anywhere, "far" no
longer means "experienced".**

`spawner.trialCap` caps enemy level to `player.level + 1` while a trial
runs. Three things this needed that the obvious version missed:

⚠️ **Clamp LAST, after every bonus.** Capping the base still produced
level-7 creatures, because the random 0–2 spread and the volatility
bonus are added afterwards — and measured live it produced a **level
12**. A cap that is not the last word is not a cap.
⚠️ **`spawnNamed` obeys it too.** That path bypasses `_spawnEnemy`
entirely (landmark guardians, quest targets), so a cap applied only
there leaves one hand-placed level-12 creature in a level-1 fight.
Bosses are exempt.
⚠️ **Published the MOMENT a trial exists, not from `update()` alone.**
The world streams in during the `chunkManager.update()` that runs
before `engine.start()`, so ambient spawning happens once BEFORE the
first frame — measured as eight level-2 enemies and a single level 12
standing 44 units away. One is enough.
⚠️ **Cleared in `wake()`, not in `update()`.** main.js only calls
update() while `inNightmare`, so a cap cleared there would stay applied
for the rest of the session and make the whole waking world trivial.

Trial goals also cut: endure 55–95s → **28–45s**, hunt 3–6 → **2–3**,
gather 3–5 → **2–3**. Verified: 9 spawned enemies, all level 2 against
a cap of 2, player at full health after 40 seconds.

### ⚠️ THE DISCIPLINE PICKER IS GONE — power comes from the trial

Owner: *"the powers chosen at the start should not be given, as the
innate powers should be given at the start of the trial."*

Character creation no longer offers three disciplines. Choosing powers
from a menu before play is the "declare an identity at a menu" pattern
§2 records this project as having removed twice already (the class, and
the path) — this was the third.

⚠️ The markup is **removed**, not hidden. A hidden section that still
gates `start-game-btn` is an unclickable button with no visible reason,
and the gate's `skills:` entry is now permanently satisfied rather than
deleted so the section list and the gate cannot disagree.
⚠️ `selectedSkills` still gets a neutral three-item kit, because
`player.init()` runs before any restore and must not receive an empty
selection — but it is no longer a choice, and nothing presents it as
one.

⚠️ **The Aspect and Flaw are now granted ON ENTRY** (`grantInnateNow`),
not on completion. Two reasons: a trial you enter with nothing is one
where the power that defines you had no part in how you survived it,
and granting on completion meant the FLAW only ever cost you after the
single fight it might have mattered in. Verified: a fresh Pioneer wakes
in the realm already carrying both.

### ⚠️ THE NIGHTMARE WARP — a trial that does not look like a dungeon

Owner: *"the trials are... way too similar to dungeons, they should
have a different terrain."* Correct: a trial ran on the realm's
ordinary ground with harder enemies on it, which is the definition of
a dungeon.

**The Nightmare does NOT get its own biome.** It gets the region's own
biome wearing a different face, and that is the more unsettling of the
two options: a new biome reads as *somewhere else*, while Godgrave
rendered bloodless and wrong reads as *the place you know, and it has
stopped being right*.

#### 1. The ground — `TerrainGenerator.nightmareWarp`

Two terms, neither of which is "more noise":

- **Concentric ridges** radiating from the Nightmare's centre. A radial
  pattern is the one thing natural terrain never produces — erosion,
  tectonics and fBm are all directionless — so rings centred on a point
  read instantly as something IMPOSED on the landscape.
- **A slow heave** rising toward the centre, so the region tilts inward
  and you are always slightly downhill of what the trial is pulling you
  toward.

Measured along a radius: **max 19.0 units of difference, average 6.0
across 28 samples**. Not a filter — the shape of the land changes.

⚠️ **Centred on the REGION, never the player.** Centred on the player
the rings would follow them like a spotlight and read as a shader bug;
centred on the region they are a fixed feature of a place.
⚠️ **Analytic and stateless**, like the rest of the height stack, so
chunks agree across boundaries and `getGroundY` — which physics, prop
placement and the camera all read — stays exact. A warp applied to the
MESH only would drop the player through the floor.
⚠️ **One boolean guards it.** `_getHeight` is the most
performance-critical function in the game (~9 simplex evaluations per
call, ~522k per view fill); the ordinary world pays one property read.
⚠️ **Static on the class, one writer** (NightmareSystem). It is the
shape of the world, and two writers to one field is this project's
recurring architecture bug (trap #9).

#### 2. The palette — `BiomeManager._nightmareSkin`

Bleached toward luminance, darkened, fog roughly doubled, roughness
×1.45 and mountainFactor ×1.2 — RAISED rather than replaced, so
Godgrave stays flat and the Hollow Mountains stay vertical while
everything about them gets harsher.

⚠️ **CACHED PER SOURCE BIOME.** This runs inside `getBiomeForChunk`,
called for every chunk and four times per biome-weight blend —
allocating an object and four `THREE.Color`s there is per-vertex
garbage in the hot path.
⚠️ **THE DRAIN IS FLOORED, and it needed to be.** Draining alone took
the Hollow Mountains' mid band — already `0x22262c`, among the darkest
in the table — to **0.01 linear**, effectively black ground under
doubled fog. §4's Descent rule ("a fight you cannot see is not
atmospheric, it is broken") applies harder here, because this is the
first thing a new player ever sees. Floored to 0.055; verified at
0.043–0.048 after.
⚠️ The floor is a **lift toward grey, not a per-channel clamp** —
clamping independently would tint the darkest bands blue and leave the
bright ones untouched.

#### 3. ⚠️ WAKING MUST REBUILD EVERY CHUNK, NOT RE-STREAM THEM

Chunk contents are built once and cached, and the chunks the player is
standing among were generated WITH the warp. Calling `chunkManager
.update()` alone loads the Sanctuary's missing chunks while leaving
every already-built one wearing the Nightmare — so the player wakes
into a hub sitting in warped grey ground, which is worse than never
clearing the warp.

`rebuildAllChunks()` already existed for exactly this shape of problem
(props cached before the nature models finished downloading). The warp
is cleared inside `wake()` BEFORE the rebuild, so everything
regenerates as ordinary world.

Verified end to end: warp active in trial → step through the Gate →
warp `null`, biome back to **Verdant Plains**, fogDensity 0.005, enemy
cap lifted. Control check: re-applying the warp at the Sanctuary would
have moved the ground by **16.1 units**, so the absence is real and not
a coincidence of flat terrain.

### ⚠️ "I DON'T HAVE MY ASPECTS TO FIGHT THEM" — the opening was unarmed

Owner, after playing a trial: *"the health is too low and I don't have
my aspects to fight them. They nearly one shot me."* Measured on a
fresh First Nightmare, and every word was literally true:

    hotbar abilities     0
    weapon Memory        none
    attack               18   (the starting wand)
    maxHp                107
    enemies              9 alive, atk 23 each -> 21 after reduction
    hits to die          5

#### 1. An innate power that only edits a number is not a power

The Aspect was a passive stat multiplier. There was nothing to press.

Every `INNATE_ASPECT` now also carries an `ability` — a real active on
the 1..9 bar. ⚠️ **Delivered as a MEMORY through the ordinary loadout**,
not as a bespoke slot, so it reuses the hotbar, the cooldowns keyed on
`memoryId:abilityKey`, the bindings panel, the satchel readout and
ASPECT_USED rather than adding a second way to have a power.
⚠️ **Every `ability.key` is an EXISTING key with a real branch** —
`brace step knit hew aegis chorus rush bloom`, all verified to have
both an ASPECT_USED case and an ASPECT_SHAPE_FOR row. Inventing new
keys would have put the game's very first ability on the `default`
branch, which spends Essence and does nothing (§7.9's failure, on the
worst possible ability).
⚠️ **Its own `formId: 'innate'` budget, uncapped, limited to one.**
Filing it as a charm would spend one of the player's two trinket slots
permanently on something they cannot put down. Verified: trinkets used
0 while the Aspect is equipped.

#### 2. ⚠️ CAPPING LEVEL SAID NOTHING ABOUT DAMAGE

The level cap from the previous pass worked and was the wrong variable.
`atk = template.atk * levelMult`, and TEMPLATES differ enormously
between species: on the Forgotten Shore, three **level-2** creatures
came out at **atk 55, 43 and 55** with the cap and a 0.6 multiplier
already applied — their base was 92.

What the player experiences is damage per hit against their own health,
so that is what is bounded now. `trialAtkCap` is derived from the
player's ACTUAL maxHp (~9%), which means the Aspect that raised it
genuinely makes the trial easier and the Flaw that lowered it genuinely
makes it harder — the innate power affects the fight instead of being a
number on a sheet.

#### 3. Nine at once was the real killer

`trialMaxAlive = 4` against the ordinary 13. Capping level made each
creature survivable and did nothing about the arithmetic of nine
converging on someone with no weapon.

#### 4. Health and terrain

`MAX_HP 100 -> 160`. ⚠️ Raised rather than nerfing enemies globally:
the enemy numbers are right for a Pioneer WITH gear, and the problem is
only the opening, where they have none. A global nerf would make the
whole midgame limp to fix ten minutes of it.

Region radii **x2.1**, centres **x1.55** — 780–1400 units became
1,600–2,900, i.e. **10 to 19 minutes across** at 5.2 m/s instead of
three. ⚠️ Centres moved by LESS than the radii on purpose: scaling
radii alone would have merged Godgrave and the Sea of Sand into one
undifferentiated desert. Verified **0 overlapping pairs**.

**Verified live end to end:** Aspect on the bar and firing on key 1
("Not There"), maxHp 141, region 14.8 minutes across, 4 enemies alive,
**~11 hits to die where it was 5**.

⚠️ Testing note: a bar entry is `{memory, ability, key}` — it has no
`.name`. Reading `entry.name` prints `undefined` and looks like a
broken ability. Use `entry.ability.name`, or `loadout.snapshot().bar`.

### ⚠️ THE BAR NOW FOLLOWS THE WEAPON IN HAND — a deliberate reversal

Owner: *"the current weapon layout system is getting way too
complicated... whenever the weapon is summoned, I can use its spells,
and then changing the weapon changes the spells."*

**§7 records the OPPOSITE rule as the owner's explicit earlier choice**
("the 1..9 bar is NOT re-pointed by the slot keys — every equipped
Memory contributes regardless of which slot is in hand"), and the
reasoning then was sound: a bar that reshuffles mid-fight makes every
number key mean something different depending on invisible state.

⚠️ **Do not "restore" the old behaviour.** What changed is that the
state stopped being invisible: G/H/J switch slots, the summon strip
names what is in hand, and the weapon is on screen in the player's
hands. With three weapons contributing at once the bar reached nine
entries of mixed provenance — which is the complaint. Tied to the
weapon it is two or three keys and the player always knows why.

`barMemories()` is the whole rule: **innate first, then the weapon in
hand, then carried trinkets.**
⚠️ The innate Aspect is always on it and always key 1 — it is what the
Pioneer IS, not something they are holding, and it is their only
ability before they ever forge a weapon. A power whose key moves when
you swap weapons is the exact confusion this change removes.
⚠️ Trinkets still contribute: capped at two, deliberately carried, and
dropping them would make charms and relics unusable rather than
simpler.
⚠️ **`setActiveSlot` now calls `_rebuild()`.** It did not need to
before — the bar was identical across slots — and without it the
previous weapon's spells stay on the keys while a different weapon is
being swung.

Verified: axe in hand → `1=Split Them, 2=Maim`; spear in hand →
`1=Split Them, 2=Impale`. Neither weapon's spell leaks into the other.

### ⚠️ THE INNATE ASPECT WAS READING A FALLBACK

Owner: *"the starting aspects are very shit, and they pose no
effectiveness in battle."* Two causes, and the second was a bug.

**1. They were utility, not weapons.** The first set was `brace`,
`step`, `knit`, `aegis` — an i-frame, a dash, a heal and another
i-frame. All useful to a player who already HAS a weapon, and useless
to someone whose only other option is an 18-attack wand. A first power
has to let you kill something. All eight are now damaging or
space-clearing (`chorus rush rebuke hew sweep scatter cascade bloom`),
each verified to have a real ASPECT_USED branch and a motion row.

**2. ⚠️ `power` WAS NEVER SET, so every innate ability hit for the
default.** Every damaging branch reads
`const power = (memory.power || 20)`. The innate Memory had no `power`
field at all — so the game's first and only ability multiplied **20**
against creatures with 28–53 HP. It was not weak by design; it was
reading a fallback.

Now `max(34, playerAtk * 2.1)`, scaled from the player so it grows with
them rather than becoming worthless by level 5 — and so the Sharpened
Aspect's own +18% attack feeds its ability, which is what makes an
innate power feel like one thing instead of two unrelated bonuses.

Verified: one press of an innate Aspect dealt **99 damage to each of
three level-2 creatures and killed all three**.
⚠️ Testing note: an earlier probe read 0 damage and looked like total
failure — it had left the ability on cooldown from a previous press.
Clear `loadout._cooldowns` between probes.

**Trial lengths cut again** (owner: *"the starting battles are too
long"*): endure 28–45s → **16–26s**, hunt 2–3 → **1–2**, gather 2–3 →
**2**. Third reduction; the first was 55–95s.

### ⚠️ "PRACTICALLY INFINITE ENEMIES" — the spawner had no total, only a rate

Owner: *"there are practically infinite enemies."* Literally true.
`enemies.length < cap` bounds how many exist AT ONCE; the timer re-armed
every `spawnInterval` forever. Kill one and another arrives 4.5 seconds
later, for as long as you stand there. **Nothing anywhere counted how
many a place had already produced**, so a fight could never be
finished — only walked away from.

`trialBudget` is a TOTAL for the First Nightmare: `goal + 4` for a hunt,
8 otherwise. Verified by killing everything on sight for ~100 seconds:
**4 spawned against a budget of 8**, then nothing.

⚠️ **Counted on ACTUAL spawns, not attempts.** `_spawnEnemy` returns
early for the Sanctuary radius, the alive cap and unloaded ground —
counting attempts would drain the budget while standing somewhere
nothing can spawn, and the trial would go silent for no visible reason.
⚠️ **`trialSpawned` resets in `_start()`, never in `_publishCap()`.**
That runs every frame; re-arming the budget there is the same infinite
spawner with extra steps.
⚠️ **NULL in the ordinary world, deliberately.** An open world whose
creatures run out is one you strip-mine and then walk through empty.
The concurrent cap is the right model out there; this bounds the one
fight the player cannot leave.

### ⚠️ THERE WAS NO BASELINE HEALING IN THE GAME AT ALL

Owner: *"there is no healing mechanism except restoration."* Worse than
it sounds: the only continuous heal in the project was
`ascentSystem.grant('healPerSec')` — an **Ascent tier 4** grant. A new
Pioneer, and every Pioneer for many hours, had none. Health moved one
direction until they found a Weave or an Aspect that mended, which made
the First Nightmare survivable exactly once.

**Out-of-combat recovery**: 5 seconds after the last hit, then 4% of
MAX health per second. A full heal from near death takes ~25 seconds of
not fighting.

⚠️ **A FRACTION OF MAX, not a flat rate** — a flat number becomes a
trickle by level 10 and the mechanic quietly stops existing.
⚠️ **Out of combat ONLY, and the delay is the mechanic.** Regeneration
during a fight removes the reason to disengage and turns every fight
into a damage race; regeneration after one removes the need to hoard
consumables to explore.

#### ⚠️ `_lastStruckAt` WAS ONLY WRITTEN FOR ONE EPITHET

The bug this created is the interesting part. `_lastStruckAt` already
existed — the Unbroken epithet uses it to define "a fight" as 6 seconds
without being hit — but it was assigned **inside that epithet's own
branch**, because that grant was its only reader. For every Pioneer
without Unbroken it sat at `0` forever.

So out-of-combat recovery, reading the same clock, saw `since = 999`
permanently and healed **continuously through fights**. The stamp is now
unconditional, outside the branch: one clock, one definition of "in
combat", written by every hit.

⚠️ Reusing an existing timestamp is right — two clocks that both mean
"recently in combat" WILL disagree — but check that the existing one is
written on every path and not just the one its original reader cared
about.

**Verified:** with a real enemy attacking, health falls and never
regenerates (64 → 0 over 8s, net −64). One real hit then left alone:
**62 → 62 across the 5s delay**, then recovery resumes. Undisturbed:
64 → 160 over 16s at 5.9 hp/s against an expected 6.4, capping exactly
at max and never above.

⚠️ Testing note: a synthetic `COMBAT_HIT` with a plain object as
`source` does NOT take the enemy-damage path, so it neither stamps the
clock nor applies the epithet chain. It read as "heals during combat"
and sent me after the wrong thing. Spawn a real enemy.
⚠️ And a DEAD player does not regenerate (`hp > 0` guard) — a probe
that kills the player then measures recovery reads 0 → 0 and looks like
a broken feature.

### ⚠️ "ONLY ONE SKILL COMES EVERY TIME" — the Nightmare was made before the character

Owner: *"there is only one skill which comes every time which is Run
Them Down. How is it a unique aspect?"*

The generator was innocent and I checked it first: sweeping the LIVE
`_start()` over 400 seeds gave all 8 Aspects at ~50 each, and all 5
trial kinds. Uniqueness was never the problem.

**The Nightmare was being generated once per PAGE LOAD, not once per
character.** `initGame()` runs on `window load` — before the roster is
even shown, before any Pioneer exists — and it contained the only call
to `begin()`, guarded by `if (!nightmareSystem.seed)`.

`nightmareSystem` is a module singleton, so:
  · load the page → a Nightmare is generated, belonging to nobody;
  · create a character → the guard is false, nothing regenerates;
  · create another → same;
every Pioneer in that browser session inherited the same trial, region,
Aspect and Flaw. Only reloading the page changed it, which is why it
looked like the Aspect was hardcoded.

⚠️ **The fix belongs in `startGame`, not `initGame`.** `startGame` is
where "a different person now exists" is actually known — `initGame`
runs for continuing characters too, and regenerating there would
overwrite a returning Pioneer's trial mid-run.

⚠️ **Reset ALONE would have been worse than the bug.** With `begin()`
living only in `initGame`, clearing the seed at character creation
would have left every new Pioneer with NO Nightmare at all. The fix is
reset **and** regenerate, together, at the same point.

⚠️ **`reset()` did not clear `seed`.** It cleared phase, trial, region,
gate, progress and grant — everything except the one field the guard
reads. It also missed `_marker` and `_shards`, which are memoised per
trial: a new Nightmare with a stale marker sends the player to a point
in a region they are not in. And it left the spawner's `trialCap`,
`trialAtkCap`, `trialBudget` and `trialSpawned` set, so a fresh
character inherited the previous one's difficulty and spent budget.

**Verified through the real UI**, creating characters in one session
without reloading: A1 → Unbroken / Refuse / Valley of Sleep, then
RealUI2 → Deep-Welled / Loose It / Dreaming City. Across seven
characters: **5 distinct Aspects and 5 distinct abilities of 7**, which
is ordinary variation rather than one repeated answer.

⚠️ **The general shape:** a module singleton initialised at page load
holds state that belongs to a SAVE, not to a session. Anything created
in `initGame` and keyed to a character — this, and anything added
beside it later — must be reset and rebuilt when the character changes,
or the first character's state silently becomes everyone's.

### Known gaps, honestly

- **Screenshots were unavailable late in the last session** (the Browser
  pane stopped compositing). The trait skies, Ascent panel and bind
  panel are verified *numerically and structurally* but several were not
  seen rendered. If colours look wrong, that is the gap.
- **First-sight shader compilation** still hitches when entering an
  unseen biome. Fixing it properly means reducing prop-material variety
  or a warm-up pass over biome variants.
- **`RESERVED_KEYS` is large** (B/G/F/V/I/J/K/L panels, R dodge, Z/X/C
  abilities, WASD). If the owner wants more bindable keys, the clean fix
  is moving panel keys behind one menu key — **ask first**, it is a
  design decision.
- **`player.stats.def` is written and never READ.** `recomputeStats()`
  keeps it honest (and `baseDefense` is no longer 0 while `stats.def`
  initialised to 10 — equipping your first armour could hand you a
  LOWER number than going bare), but nothing applies it to incoming
  damage. Wiring it in is a real balance change and was deliberately
  left for the owner to call.
- **`data/classes.js` is dead code**, kept only for its `skills` arrays.
  Do not re-wire it; read `LeaningSystem`'s header first.
- **Descents have no interior architecture** — bounded regions with
  waves and a Warden. No modular interior kit was ever fetched.
- **`PotionSystem.js` keeps its filename.** It is the verified resolver;
  renaming a working module for cosmetics is a trade this project has
  repeatedly declined. Nothing player-facing says "potion".

### Natural next steps

1. Sit with the owner's real machine and PerfHUD — p95 is the only
   honest performance signal, and the last two lag reports were both
   real while every in-environment measurement disagreed.
2. Descent interiors, or at least varied set dressing per element.
3. ~~Epithets / Facets~~ **Done** — `data/epithets.js` +
   `systems/EpithetSystem.js`. Eight, cap 3, every grant wired.
4. ~~A save system.~~ **Done** — `systems/SaveSystem.js`. See the
   hollowness pass above, and traps #36/#37 before touching it.
5. **Sit with the level curve in real play.** `BASE_XP`/`XP_GROWTH` and
   `GROWTH` in ProgressSystem are one edit each; the first level lands
   in two or three kills by design, and whether that stays right past
   level 10 has only been checked by simulation, not by playing it.
6. **Decide whether `stats.def` should do anything** (see the gap
   above).
7. ~~Lineage/awakening has no SAVE.~~ **Done** — both persist, and
   the restore order is lineage-before-awakening for the same reason
   startGame() uses it (awakening pushes grants INTO lineage).
8. ~~A woken weapon does not look woken.~~ **Done.**
   `_applyAwakenGlow()` scales the accent gem's emissive and its light
   per rung (1 / 1.5 / 2.4 / 3.6), and `WEAPON_AWAKENED` now fires a
   burst and a shake that both scale with the rung.
   ⚠️ It is RE-DERIVED and re-applied on every equip, never
   incremented — the viewmodel weapon is rebuilt from scratch on each
   equip, so a one-shot effect at awaken time would vanish the next
   time the player swapped weapons and swapped back.
9. **`reachMult` and `echoPower` are declared in
   `LINEAGE_GRANT_KINDS` and read by nothing.** Harmless today because
   no lineage grants either — but a future lineage that does will find
   them silently inert. Wire them or drop them.
   (`manaCostMult` and `castSpeedMult` were in this state on first
   write — **the entire Latticer ladder did nothing** — and are now
   read in `WandSystem.cast`. Verified: mana ×1→0.595, cooldown
   0.45s→0.346s across the ladder. A grant nothing reads is worse than
   no grant, because the panel reports it as applied.)
10. **"Improve the mechanics / make it more refined like an RPG" is
   still largely open.** That session delivered the concrete half of
   the brief (fog, vibrancy, terrain, chunk-build cost, wand, weapons)
   and the mechanical half only where it overlapped: declared biome
   fields, weapon variety, viewmodel framing. Combat feel, loot
   economy, and what a weapon TYPE actually does differently in the
   hand are untouched — right now bow/staff/grimoire/scythe are eleven
   silhouettes over **one** melee arc, which is the most obvious next
   thing a player will notice.
11. ~~The new weapons have no attack behaviour of their own.~~
   **Done** — see "ELEVEN SILHOUETTES OVER ONE MOVESET" above.
   `WEAPON_MELEE` gives every type its own range/arc/speed/hits, the
   bow, staff and grimoire fire instead of swinging, and
   `WEAPON_SIGNATURE` gives each type one move nothing else can roll.
   ⚠️ What is STILL open is per-type *animation*: `COMBO_ARCS` and the
   `weaveVFX.arc` roll/sweep table in the PLAYER_ATTACK handler are
   still shared by every melee type. Branching them on
   `weaponPlanKey()` is the natural next step — the FRAMING table in
   `_equipViewmodelWeapon` already keys on exactly that.

### ⚠️ THE INNATE ASPECT WAS THE WRONG ELEMENT, AND SIX OF EIGHT GRANTS WERE INERT

Owner: *"the difficulty of the initial trial is shit, it is
horrendously hard, make it easier, as the abilites aren't effective."*

Two separate causes, both measured live in a real trial (§6 — the tab
was hidden at first, rAF was suspended, and the caps read `null`; that
was **trap #4 biting the measurement itself**, not a bug. Front the tab
or tick the objects by hand before believing any live number).

#### 1. THE ONE ABILITY YOU OWN WAS THE ONE ELEMENT THE BIOME RESISTS

`_applyInnate` built the innate Memory with `element: 'shadow'`,
hardcoded. One raw-40 hit against each creature the Dreaming City
actually spawns:

| creature | neutral | shadow | light |
|---|---|---|---|
| Soul Reaver | 47 | **18** | 193 |
| Count Mordrevain | 47 | **15** | 215 |
| Lychgate Stalker | 12 | 47 | 104 |

**Two of the three resist shadow by ~3x.** So the single power a
Pioneer has for the entire first fight was rolling into a resistance on
most of what it met — the worst available element against the biome the
trial drops you into.

⚠️ **Neutral is the correct type, not a compromise.** It takes the flat
~1.18x everywhere and is resisted by nothing, an innate power granted
before the player has any attunement should not carry an element they
never chose, and an elemental innate makes the trial's difficulty
depend on the **region roll** — Godgrave and the Dreaming City resist
different things, so the same Aspect would be strong or useless
depending on where you woke. That is not difficulty.

⚠️ The damage element comes from `memory.element` (ASPECT_USED opens
`const el = memory.element || 'neutral'`), NOT from the ability's own
`element`. Both are set now, but only one of them was doing the harm —
do not "fix" the other one and conclude it is done.

Measured after, against the creatures a trial actually spawns: the
innate ability **one-shots** (99 dealt vs 78–84 hp, was 15–31 and
killed nothing) and melee kills in **4 hits, was 13**.

#### 2. SIX OF THE EIGHT INNATE GRANTS HAD NO READER ANYWHERE

`data/nightmares.js`'s own header says *"anything added here without a
reader there is a lie the character sheet tells"* — and then shipped
exactly that, in the file carrying the warning. Grepped across `src/`:

| field | Aspect / Flaw | reader before |
|---|---|---|
| `innateHpMult` | Unbroken / Thin-Blooded | ✔ |
| `innateMpMult` | Deep-Welled / Dimmed | ✔ |
| `innateAtkMult` | **Sharpened** / Slow to Anger | **none** |
| `innateDef` | **Warded** / Brittle | **none** |
| `innateMoveMult` | **Quickened** / Heavy-Footed | **none** |
| `innateStamMult` | **Tireless** / Short-Winded | **none** |
| `innateLifesteal` | **Hungering** | **none** |
| `innateEssenceMult` | **Kindled** | **none** |

**Six of eight Aspects and four of six Flaws did nothing at all.** A
Warded Pioneer measured `innateDef: 26` on the player and `stats.def:
10`, and took 13 of a 14-damage hit.

Each is now folded as a **factor at its point of use**, never assigned
(trap #9): `recomputeStats()` for atk and def (still the sole writer),
`_handleMovement` for speed, `_regenStats` for stamina,
`PLAYER_HIT_LANDED` for lifesteal — that event is where all three
player damage pipelines converge, so the return is the same whichever
hand you hit with (trap #12) — and `CoreSystem._gainMult()` for
essence, read off the player rather than assigned onto the system.

⚠️ `stats.def` is clamped at 0. Brittle (−14) on an unarmoured Pioneer
would otherwise go negative, which `takeDamage` reads as an incoming
**bonus**.
⚠️ Lifesteal goes through `player.heal()`, which sanitises — a NaN
damage value must not reach `hp` (trap #20). Verified: 7% of 100 → +7,
0% → no heal, NaN → hp untouched and finite.
⚠️ `_applyInnate` already ends with `p.recomputeStats?.()`, which is
why the two stat grants land. Anything added to that fold that is NOT
read by recomputeStats still needs its own reader.

Verified live: Sharpened atk 24 → 28, Warded def 15 → 41, Brittle
clamps to 0, Kindled essence gain ×1.3.

### ⚠️ THE REALM PALETTES WERE FIVE SHADES OF THE SAME SLATE

Canon's regions are **three near-neutral values plus exactly one hot
colour** — grey sky, black earth, crimson coral. All five realm biomes
were instead near-identical desaturated grey ramps, so shape separated
them (which was deliberate and correct) and colour did not separate
them at all.

- **Godgrave** was a brown-tan desert (`0x6b6455` → `0xc4baa2`) — the
  same warm sand as Ember Dunes, which is what made a dead god's
  remains read as a beach. Now ash at the foot, **bleached bone**
  above, with **vermilion** as the accent.
- **The Hollow Mountains** ran `0x14161a` → `0x4e555f`: four shades of
  one slate, a **0.06→0.31 lightness span**, so the tallest terrain in
  the game had the flattest palette and died against the sky. Now
  near-black hollows to near-white snow — measured span **0.432**.
- **The Forgotten Shore** had no black and no crimson, the two colours
  canon opens the region on. Now black earth, grey above, crimson coral
  accent.
- **The Dreaming City** is silver on **black glass**, not stone.

**`colors.accent` is a real per-vertex feature, not a table field.**
Carried from pass 1 into pass 2 as a *weight* (so it fades across a
biome border instead of stopping at a chunk-shaped line), then blended
by a patchy noise mask and **suppressed on slope**, so it collects in
flats and hollows and never climbs a cliff face.

⚠️ **The accent normalises by its OWN weight, not the total.** Left
un-normalised, a vertex 30% inside Godgrave carries a vermilion that is
70% BLACK, and the accent reads as grime along every border.
⚠️ **COUNTED, not eyeballed** (trap #3). The first threshold tinted
**37% of Godgrave and 51% of the Forgotten Shore** — past roughly a
third the accent IS the ground and the three-value rule is gone.
Retuned to 8.1% / 12.7% / 16.1% / 16.4% across the four accented
regions.
⚠️ **`_nightmareSkin` rebuilds `colors` KEY BY KEY**, so the accent was
silently dropped inside every Nightmare — measured `hasAccent: false`
on a real chunk while the table said true. Any band added to a palette
must be added there too. It is drained like the rest, which is canon:
approaching the Sea of Ash the crimson loses its colour.

**Celestial Peaks' `low` was `0x2030508`** — seven hex digits, the
identical typo already fixed on Astral Highlands in this same file. It
masked to `0x030508`, a near-black under a `0x5070b0` mid. Silent,
because a too-dark low reads as "shadowed valley floor".

⚠️ **STILL OPEN, and measured:** `_rawBiomeColor` ramps on NORMALISED
HEIGHT, so a flat biome never reaches its own `peak`. The Dreaming
City's whole chunk spans lightness **0.054–0.095** against a silver
peak at ~0.71 — **the silver never renders**, and the same is true of
the Forgotten Shore's grey. The palettes are right and the flat regions
cannot show their top band. Fixing it means ramping on something other
than height alone (slope, or a per-biome height normaliser); this is
the next terrain job and it is a real one.

## ⚠️ THE REALISM PASS — RŌNIN's art direction, Mozzarela's mechanics

Owner: *"make it hyper realistic. Take inspiration from the RŌNIN
samurai game… copy the art style… take the 3D models… the mechanics of
this game should still be intact… change the names to make it look
more original… keep it slow paced."* Owner's choices when asked: keep
**the dead realm** (rendered for real, not moved to feudal Japan), and
**keep every HUD panel, restyled**.

RŌNIN lives at `~/AG/Games` (read its `CLAUDE.md` + `docs/PROJECT_STATE.md`).
Its look, measured from its source, is: three's physical Preetham sky,
ACES at exposure 0.7, a sun up to ~2.3 intensity, fog matched to the
sky, bloom thresholded at 2.2, a restrained grade (sat 0.82, light
split, fine grain, no aberration), a wind-blown instanced grass field,
real PBR ground, the Mesh2Motion CC0 human with generated clothing
shells and a sculpted head, SDF first-person hands, and a quiet
lacquer/ivory/gold UI. All of that is now in Mozzarela.

### Verification method — read before measuring anything

The desktop Browser pane is usually HIDDEN in this environment, which
suspends rAF (trap #4) — live reads off it are stale. Headless
Chromium via RŌNIN's Playwright works: the session used a probe that
boots a fresh Pioneer, skips story cards with **Escape** (hiding the
card with CSS leaves the scene "active" and SUPPRESSES THE HUD — a
probe artefact that looks like a bug), teleports to fixed
`(x, z, yaw, pitch)` views and screenshots them. Random trial regions
make un-teleported before/after shots meaningless.
⚠️ **Frame rate is NOT measured.** Identical headless runs ranged from
0.3 to 60 fps. Clouds are HD-only as a precaution. **Ask the owner for
F3 p95.**

### Sky, light, fog — `rendering/PhysicalSky.js`, `Atmosphere.js`

- The gradient dome is gone. **Preetham `Sky` is the base**; the old
  dome survives only as a PREMULTIPLIED overlay drawing the moon and
  the rift (`ONE / ONE_MINUS_SRC_ALPHA`).
- ⚠️ **A CPU port of the same scattering maths** (`skyRadiance`)
  supplies the fog colour (horizon, ×0.58 — ground haze is darker than
  the sky band; at full radiance every trial washed white), the
  hemisphere colour (zenith) and the key colour (extinction along the
  sun path). The fog cannot drift from the sky because there is one
  model. `_readSky()` is the single writer of those colours.
- ⚠️ `AIR.sat` is the one non-physical dial: Preetham keeps a saturated
  blue zenith at any turbidity, and that blue lit the world blue
  through the IBL and hemisphere (bone and ash read as ice). It is
  applied in the shader (injected via `onBeforeCompile`) AND in
  `skyRadiance()`, or fog and sky disagree.
- ⚠️ Fill lights take only a 45% LEAN toward the sky's hue. Unit-
  normalising the zenith gave (0.4, 0.6, 1.0) — pure blue fill.
- The moon is ADDITIVE now (cover 0.10). Any real coverage made it
  darken the sky — a giant dark wedge across the Shore's sky. The rift
  is a soft bleed, no hairline (it read as a glowing rope).
- Traits no longer repaint the sky; they change turbidity and lean the
  horizon's hue at the horizon's own brightness.
- `EnvironmentIBL.init` takes the physical sky as a 4th argument; baking
  the overlay alone would light the world from a black environment.
- Exposure 0.70 (RŌNIN). Sun lowered to ~30°.
- ⚠️ **Bloom threshold 0.92 → 2.2** (RŌNIN). Bloom reads the LINEAR
  scene before exposure; at 0.92 every lit wall glowed.
- ⚠️ **Grade** (`CinematicGrade.GRADE_PRESETS`): it runs AFTER
  OutputPass, so the old `highlightRoll 0.80` was a second tone curve.
  Contrast ~1.05, split ~0.15, sat ~0.85, no aberration, grain 0.02.
- Trap #14 bit again: backticks in a GLSL comment inside a template
  literal broke the build.

### Albedo — the "white marble" problem

Every palette was tuned under the old dark grade, so bright bands sat
at 0.45–0.7 linear reflectance (chalk) and blew out under a real sun.
One **soft knee** (below 0.20 untouched, 35% of the excess kept above)
now runs in `Atmosphere.gradeColor` (terrain) and PropForge's `mat()` /
`plainMat()` via `albedo()` (emissive materials exempt).
The god's bones were `plainMat` (untextured, trap #8) and are now the
`bone`/`bonedark` roles in `PROP_SURFACES`.

### Ground — `rendering/TerrainLayers.js`, `GrassField.js`

- The terrain had ONE texture (rock, reduced to grey detail) for every
  biome. Flat ground now paints four real sets from a per-vertex
  `aLayer` weight (soil, grass, sand, snow); slopes keep triplanar rock.
  `GROUND_BY_BIOME` is keyed by biome ID and attached in BiomeManager.
- ⚠️ The SOIL layer is the **`ash`** set. The set named `dirt`
  (Ground037) is a dry grassy ground averaging olive (153,147,88) and
  made every soil biome read as meadow — measured, not guessed.
- ⚠️ The biome "steer" on layer albedo is CAPPED at 1: a pale biome may
  darken a texture, never brighten it (uncapped, Godgrave's sand went
  snow white).
- ⚠️ The skirt merge in `generateChunkMesh` must carry `aLayer` too,
  or attribute lengths mismatch.
- ⚠️ 12 texture units used (rock 4 + 4×2). A fifth layer breaks the
  WebGL2 16-unit guarantee — pack into an array texture instead.
- **Grass** is RŌNIN's field, ported: instanced clumps around the
  player, wind in the vertex shader, re-seated when you move 6 m.
  Ground sampled on a 1 m lattice (~2.9k `getGroundY` calls) instead of
  per blade. Per-biome `GRASS_BY_BIOME` (vermilion in the bone fields,
  drained grey inside a Crucible, none on rock/ash/glass). Off at `low`.

### First person — `rendering/Hand.js`, `EntityForge.forgeWand`

- RŌNIN's SDF hand (round-cone bones, smooth unions, surface nets,
  gradient normals) under a linen sleeve and laced bracer, built once.
  `buildArm({gripY, gripR})` maps its +z grip frame onto props' +y.
- The wand is now **the focus**: carved blackened rod (procedural grain
  — ⚠️ it is built before the HD textures load, so it cannot use the
  library), spiral leather grip (TubeGeometry helix), iron ferrule and
  crown, and a dark glass shard with light only in its fractures.
  Contracts kept: `wand-core` (part 'focus'), `wand-light`. ⚠️
  `animateWand` must NOT touch the core's emissive — main.js's
  `updateViewmodel` is its single writer (trap #9; the first draft
  compounded a multiply every frame).
- Framing raised (-0.42 → -0.25) and scaled down (1 → 0.8) so the hand
  is in frame.

### People — `rendering/Wanderer.js`, `Face.js`

- RŌNIN's Mesh2Motion CC0 body (copied to `public/hd/models/`, licence
  file beside it) with generated, Laplacian-relaxed, skinned clothing
  shells and RŌNIN's sculpted head. One template per OUTFIT registered
  as `model:Wanderer_<id>` with clips renamed to the KayKit names the
  creature animator already uses (Idle, Walking_A, Running_A, Hit_A,
  Death_A). Pioneer, hollowed, veiled, palelord, bulwark, elder,
  keeper, rival.
- `CREATURE_MODELS[*].real` wins when loaded; the KayKit chibi `key` is
  the fallback (single-file build). NPCs and the Pioneer (body rig and
  portrait) use it too.
- ⚠️ Head parts are NAMED `head-*` / `hood-part`: the first-person body
  hider finds the head by name. Unnamed, your own hair filled the
  bottom-left of the frame.
- ⚠️ The body's own held focus is hidden in first person — on a
  realistic body its hand sits where a real hand would, in view.
- ⚠️ The portrait must tick the rig's mixer or it stands in bind pose.
- Gear halo: the INNATE power no longer floats (it is not on the
  owner's relic/charm/weapon list; it slipped in as formId 'innate').

### Names (display text only)

A tokenizer rewrote **only string literals**, capitalised forms only —
lowercase hits were keys, ids, event names, save fields, CSS classes
and import paths. Nightmare/First Nightmare → **Crucible**; Aspect →
**Facet**; Flaw → **Toll**; Memory → **Remnant**; Echo → **Thrall**;
Dormant → **Silent**, Ascended → **Unbidden** (lineage stages);
Godgrave → **Gravefall**; Hollow Mountains → **the Hushpeaks**;
Forgotten Shore → **the Bleeding Strand**; Dreaming City → **the Still
City**; Bottomless Pit → **the Maw**; Valley of Sleep → **Lanternless
Vale**; Sea of Sand → **Pale Expanse**; Bone Crypt → **Marrow Vault**;
Cold Fortress → **Rimehold**; Barren Coast → **Saltwrack Coast**.
`essences.js` excluded (its "Echo" is a spell modifier). Comments,
identifiers and file names still say the old words on purpose.
Creatures renamed (e.g. Soul Reaver — a trademarked game title — →
**The Unspoken**; Gloopus → **The Seep**; Count Mordrevain → **Lord
Ivel Marrowmere**). ⚠️ Trap #11 was live: `Enemy.update` keyed a float
bob on `this.name === 'Soul Reaver'`; it keys on `typeId` now.
Old saves keep any item names they already stored.

### Pace — `PACE` in `data/constants.js`

One factor table, read at the point of use: walk 5.2 → 4.0, run →
6.6 (RŌNIN's numbers), heavier accel/decel, enemy speed ×0.8, wind-up
×1.55, recovery ×1.45, enemy cooldown ×1.25, player swing ×1.15, spawn
interval ×1.4. Verified live: wind-ups 0.55–0.61 s (were ~0.36).
⚠️ Trap #18 checked: `PACE` is imported in Enemy.js and Player.js.

### HUD — `style-realism.css`

One override layer after `style.css` (remove one `<link>` to revert).
Every panel kept. RŌNIN tokens; Cormorant Garamond + Inter added to
the Google Fonts request; vitals as thin lines; lacquer fades instead
of boxes; notifications as ink lines.

### Honest gaps

- **Frame cost unmeasured** (see above). Grass, ground layers, clouds
  and the skinned people are all new GPU cost. Ask for F3 p95.
- Non-humanoid creatures (slime, spider, wyrm, worm, elementals) are
  still procedural primitives.
- Architecture (keep, towers, ruins, realm landmarks) is still the
  primitive-plus-texture kit; RŌNIN's `Architecture.ts` was not ported.
- Forged weapons are untouched — `docs/SHADOW_SLAVE_FIDELITY.md` §1.5
  is still the plan (no `sweptProfile`, greatsword still a scaled sword).
- The broken moon is 23° wide; when partly in frame its straight cut
  reads as a straight line across the sky. Consider a smaller disc.
- The portrait's pale linen washes out under its key light.
- Props near a Crucible may sit at pre-warp height (floating rocks were
  seen once and not reproduced at the same spot) — check with
  `getGroundY` vs prop Y inside an active warp.
- The single-file artifact build was not re-tested; every new asset
  path has a fallback, but it was not run.

## ⚠️ PERF, HANDS, WEAPONS, MOTION — the second realism session

Owner: *"it takes too much time to load and it is so laggy… other
weapons also need the reworking… new animations… the hands are
inverted… as if my left hand is fully inverted."*

### The hand was inverted, and the left hand was a right hand

- RŌNIN's hand frame has the BACK of the hand at +y. Standing the grip
  up (rotation.x −90°) sent the back of the hand AWAY from the camera,
  so you saw the palm side with the forearm meeting it from behind.
  `Hand.HAND_TURN = π` fixes it; chosen by shooting 5 turns side by side.
- ⚠️ **With a weapon equipped the focus moves to the LEFT and was held
  by the same right-hand mesh** — exactly "my left hand is fully
  inverted". The wand arm is mirrored (`scale.x = −1`) whenever a weapon
  is in hand (`updateViewmodel`).
- ⚠️ Forearms are AIMED each frame from the wrist to a fixed shoulder
  point in camera space (`aimForearm`). Fixed to the prop, a forearm
  swung with the weapon and lay across the whole screen in a cut.

### Lag and load — measured causes, in order of size

1. ⚠️ **Dynamic point lights forced whole-scene shader recompiles.**
   three bakes the light COUNT into every program. Spells, projectiles,
   pickups, every weapon copy (hand, body, portrait, halo), the focus
   and NPCs all added/removed PointLights; each change recompiled every
   visible material. A trace measured weapons alone costing 1–27 s of
   stalled frames. The old ChunkManager budget only engaged above 8
   lights. Now `rendering/LightPool.js`: a FIXED pool of real lights
   (low 0 / medium 2 / high 3 / ultra 4 — every pooled light is
   unrolled into every shader), every other PointLight moved to an
   unrendered layer and treated as a "virtual" light whose visible /
   intensity are INTENT; the pool copies the nearest into its lights.
   The old budget is a no-op (it wrote `.visible` — trap #9).
2. ⚠️ **Texture upload was the end-of-load freeze** (one 3.3 s frame;
   every material compiles in <62 ms on its own — measured). The HD
   library was 36 maps at 2048². Now `public/hd/textures1k/` (1024², as
   RŌNIN ships; originals kept for `ultra`), and `MaterialLibrary.
   preUpload()` uploads 4 per frame under the loading bar.
3. `compileAsync` here blocks for its whole length (measured 3.5–11 s
   as ONE frame), so `_precompileShaders()` compiles one warm-up object
   per frame. `?pctrace` logs each step.
4. Grass re-seat measured 7–22 ms per re-seat; now a generator into a
   hidden second buffer under a 2.5 ms/frame budget, swapped when done.
5. Terrain ground layers: one sample per layer (was two) and zero-weight
   layers skipped by branch.
6. Shadows VSM → PCF soft (RŌNIN's); HD bias retuned for PCF.

Measured after (headless, trap #4 applies — outliers of 20–40 s still
appear in this environment): title ready **6.1 s (was 9.1 s)**;
walking p95 **16.8 ms (was 33.3)**. **Still ask the owner for F3 p95.**

### Weapons — `rendering/Arms.js` (old plans DELETED)

All 11 types rebuilt from anatomy at real size in metres: blades are a
cross-section (double-edged lenticular-diamond, or single-edged wedge)
swept along a centreline with width/thickness functions, so a scythe
curves and a spear leaf swells; fittings lathed; axe/hammer heads
extruded with a tapered wedge; grips a real spiral wrap; procedural
steel/iron/bronze/ash/leather. ~770 lines of old plans removed from
EntityForge — nothing can build an old model. `forgeWeapon` keeps its
contract and returns `userData.grip = {y, r[, x]}`.
⚠️ `'point'` is now tagged (it never was — thrust Facets lit nothing).
⚠️ The set stone (`weapon-core`) is clamped: `animateWeapon` is a no-op.
⚠️ The scythe's blade lies flat: `sweep(..., { ref: (0,1,0) })` sets the
thickness axis; without it a blade swept in x-z stands on edge.
⚠️ Weapons carry NO PointLight any more.
GearHalo satellite scale 0.20 → 0.40 (models halved in units); the aura
is a fresnel RIM (`_rimMaterial`), not a filled ball.

### Motion — `rendering/WeaponMotion.js`

Per-type STANCE + 4 BEATS (wind-up pose, strike-end pose), timeline:
anticipation (ease-in-out) → strike (ease-out, 0.16) → follow-through
(slight overshoot) → slow recovery. The hand is a CHILD of the weapon at
its grip. ⚠️ **Damage now resolves at the impact frame**: Player's
swing lasts `attackTotal = cooldown × 0.96`, `attackElapsed` drives the
pose, and `checkCombatCollisions` fires at `windup + IMPACT_LAG`
(main.js publishes `player.windupFrac`). Verified: an enemy in reach is
untouched 60 ms after the click and hit by the end of the swing (the old
rule hit everything ~50 ms after the click). Damage, reach, arcs and
cooldowns are unchanged.

### Open

- Non-humanoid creatures (slime, spider, wyrm, worm) still procedural.
- The bow does not visibly draw its string (pose only).
- Steel can still glint brightly when the sun is directly behind a blade.
- Architecture / ruins not rebuilt.
- The single-file artifact build is untested since the realism passes.

---

## ⚠️ HANDS (poseArm) + THE FACET GRAMMAR — composed skills, per-skill motion

Owner: *"the hands are still weird as if they are inverted / hypermobile… create a new system on how skills are made, named and their attributes… a new animation unique to each weapon and each skill, no overlaps, no monotonous remakes."*

### Hands — `rendering/Hand.js` `poseArm(arm, shoulderWorld)`
Replaced `aimForearm`. The old version swung the FOREARM to wherever the prop lay, which bent the wrist past anything human ("hypermobile"). Now the forearm's natural line is read off the hand skeleton (knuckle average → wrist), the hand ROLLS (`turn.rotation.y`) to point that line toward the shoulder, and only the remainder bends the wrist, capped at `MAX_WRIST_BEND = 0.6` rad. Shoulder targets in `updateViewmodel` were lowered (camera-space y −0.95/−1.05) so the forearm enters from below the frame. The wand arm is mirrored (`scale.x = -1`) when a weapon is held, so the left hand is a left hand.

### The Facet Grammar — `data/facets.js`
A weapon's ACTIVE skills are no longer picked from `ABILITY_POOLS`; they are composed:
**motion** (5 per weapon type + a `focus` set; each has its own delivery, base numbers, keyframes and impact frames) × **trait** (from the sign's temper family: strike/pierce/spread/move/ward/call/shift — rules + an animation layer) × **element** (status + epithet) × **attribute** (rule + title) × **magnitude**. `composeFacet()` returns an ordinary ability (`key: f_<motion>_<trait>`, name, line, cost, cooldown, active) plus `spec`. Names and descriptions use only parts that are really in the skill; cost/cooldown come from the actual power budget.
- `MemoryForge._signatureAbility` → composed on `SIGNATURE_MOTION[type]`; `_makeAbility` → composed when the picked template is active AND the form is a weapon. The template still decides active vs passive, so pool balance is unchanged. **Passives, Echo summons, relics, the innate Crucible ability and every old save's keyed Facets are untouched** and still run through the ASPECT_USED switch.
- Uniqueness: held motion ids are read from owned keys (`heldMotions`, trait = last `_` segment because motion ids contain underscores) and avoided; within one Remnant no motion repeats and a repeated trait hands over to a fresh one. Measured over 300 forges: 0 Remnants with a repeated motion.

### Runtime
- `systems/FacetCaster.js` — one executor per *delivery* (arc/ring/line/point/leap/dash/volley/target/pull/self). Effects are queued on the skill's own impact frames (`spec.hit`/`rehit` × `spec.dur`) and fired from `facetCaster.update(dt)` in the loop — never setTimeout. Damage is COMBAT_HIT `source:'player'` (trap #12).
- `rendering/FacetMotion.js` — `facetTrack(spec, seed)` / `sampleTrack()` produce a pose OFFSET from the motion's keys + the trait layer (push/snap/spin/lift/hold) + a seeded mirror/amplitude. `updateViewmodel` adds it to the weapon stance (rotation premultiplied = view space) or, with no weapon, to the focus at 0.55 scale.
- main.js ASPECT_USED: `if (ability.spec)` → track + part glow (`_facetPart`) + borrow weapon + `facetCaster.cast()`; `return` before the keyed switch.
- Probe hook: `__mz.skillAnim.set({ spec, seed, t })` freezes a pose (`set(null)` clears).

### Verified (headless) / not verified
Verified: build; forge distribution; casting for sword/scythe/warhammer/spear/bow/dagger lands damage at impact; frozen poses at 0.3/hit/0.8 differ per motion for warhammer, sword, scythe, spear, bow, focus; no console errors. NOT verified: feel at real frame rate, perf (desktop pane suspends rAF — ask the owner for F3 p95), and the bow motions are deliberately small, so two bow skills read closer than two hammer skills.

### ⚠️ THE HAND WAS A LEFT HAND (fixed) — read before touching Hand.js
Owner, with reference POV shots: *"the hands are still wrong… update them using the sample images to understand how the weapon should be grabbed."*
- **Root cause, measured:** the SDF skeleton ported from RŌNIN is authored as a LEFT hand (thumb +z, back +y, wrist −x). In camera space the back of the weapon hand faced INWARD and down — the player saw a palm. No rotation fixes chirality, which is why HAND_TURN / aimForearm / poseArm-roll each only moved the wrong side around. `skeleton()` now mirrors every bone in x (`WRIST` = +x; the authored one is `WRIST_AUTHORED`; surface-nets bounds mirrored).
- **Roll is scored, not solved:** `poseArm(arm, shoulderWorld, dorsumWorld)` tries 32 rolls about the grip, scoring forearm-toward-shoulder + 1.2 × back-of-hand-toward `dorsumWorld`. main.js passes camera-space (±0.55, 0.45, 0.7): out, up, toward the eye. Shoulder targets sit INBOARD of the hands (x ±0.1/0.12, y −0.9, z +0.2) — an outboard shoulder rolls the knuckles away.
- **The fist is anchored, not the weapon:** `_VM_FIST` (0.27, −0.3, −0.42 group space). `_equipViewmodelWeapon` computes `viewmodel.pull` so each weapon's own grip lands there in stance; the same shift rides every beat. Polearms (scythe, spear, hammer) are held at the butt, so positioning the weapon had left their fists below the screen. Spear stance pitch −1.42 → −0.95 (a shaft levelled at the lens laid the forearm across the screen). Wand mount pulled in (z −0.38/−0.40).
- Verified headless: back of hand faces the camera for all 11 weapons + the focus (dorsum·toward-eye > 0.5 except bow 0.76 sideways, spear palm-down overhand); swing frames read naturally. Probe: scratchpad `hands.mjs` + `measure.js` print dorsum/grip/forearm in camera space — use the numbers, screenshots alone fooled four sessions.

---

## ⚠️ SUN GLARE + THE ANIMATION OVERHAUL (Choreo)

### Sun (owner: "fix the sun, it is too bright")
Facing the sun washed the whole frame white (terrain, weapons, HUD). Measured with the CPU sky port: in the `hell` air the sky 11° from the sun is ~63 linear (open sky ~0.5), the disc ~760 000. Fixed in `PhysicalSky.js`: the scattered glow is soft-compressed (`SKY_GLARE_K 0.9`, ceiling ≈ 2.5 — just over bloom's 2.2) and the disc capped on its own (`SUN_DISC_MAX 22`), in the shader AND the CPU port (fog/IBL agree). `GodRaysPass` threshold 0.72 → 2.2 and only the EXCESS scatters (0.72 predated the physical sky; every daytime pixel cleared it).

### Animation (owner: "the animations still are quite similar… complete animation overhaul")
`rendering/Choreo.js` replaces the two-pose blends (WeaponMotion beats) and FacetMotion (deleted). A clip = STROKES baked at 120 Hz and cached:
- `cut` — true arc about the shoulder, edge axis aligned with travel (PROFILE.edge: 'x', scythe '-z'), sine-eased (a cubic peaked at 3× and teleported), ×1.3 authored time; `smash`/`toss` take the hands up out of frame and down into view; `thrust`, `spin` (CAMERA turns a full circle), `draw` (bow: raise, draw, hold, loose with kick), `raise` (casting), `guard`, `wait`.
- Hitstop at every impact (heavier = longer); wind-ups scale with the distance/angle they cover; camera layer (roll/pitch/yaw/dip/push) → `cameraController.motion` (single writer: updateViewmodel; purely visual, aim reads yaw/pitch).
- `COMBOS` — 4 distinct beats × 12 (11 weapons + focus). `SKILLS` — one choreography per composed motion (60), multi-hit motions have one stroke per hit. `KEYED` — each old keyed Facet (innate, Echoes, relics, old saves) its own. Trait layers are STRUCTURAL (`applyTrait`): pierce adds a driven point, spread widens + turns, move arrives on a run, ward ends in a held guard, call repeats the last blow mirrored, shift winds slow and counter-cuts.
- ⚠️ TIMING IS THE ANIMATION'S: basic swings set `player.windupFrac` from the clip's impact per beat; composed Facets call `facetCaster.cast(ability, power, { dur, hits })`.
- Swings run on their own clock (rate clamp 0.85–1.45 vs attackTotal) with a 0.07–0.09 s crossfade between clips — squeezing clips into attackTotal ran daggers at 2×.
- The HAND leads: main.js places each prop so its grip sits on the clip's hand position. Rest = `_VM_FIST` + WeaponMotion stance angle (WeaponMotion now supplies only scale/stance/windup).
- Two-handers (PROFILE.grip2: greatsword, axe, warhammer, scythe, staff) get a mirrored left arm on the haft (`fp-arm2`); the focus reappears in the left hand while a spell is cast (`SPELL_CAST` → `_lastSpellAt`). Axe/warhammer main grips moved up the haft (off hand at the butt) so overheads don't swing a hand into the lens. Spear is one-handed on purpose.
- Arms: `Hand.js` now has forearm (0.42·s) + elbow cap + upper arm (solved by two-bone IK toward a pole, NOT drawn — a first-person eye never sees it, and drawn it crossed the view). Shoulders in main.js are deliberately LOW AND BEHIND (±0.32, −1.5, 0.55) so arms rise into frame from below.
- Probes: `__mz.atkAnim.set({ beat, u })`, `__mz.skillAnim.set({ spec:{motion,trait}, t })`, `__mz.vmDebug()`. Headless screenshot TIMING is unreliable (a "110 ms" capture was 0.43 s in) — freeze poses instead.
- Verified headless: all 48 combo beats + 420 skill×trait clips + keyed clips bake with no NaNs, end exactly on stance, per-frame rotation ≤ 0.3 rad at 120 Hz; frozen-pose grids for sword, warhammer, dagger, spear, scythe, bow, greatsword, skills; casts land damage. NOT verified: feel at real frame rate, perf.

---

## ⚠️ THE COMBAT OVERHAUL — controls, three pools, a readable fight

Owner: *"Fix the combat, it is very confusing."* Asked first; the answers (all recorded): every confusion applies (keys, "did I hit", "was I hit", resources); controls = "mix of the best" → confirmed scheme below; wand and weapon merged by ONE resource; targeting = soft + hard lock combined; feedback = target bar, hit markers + sounds, damage direction, combat log line.

**Controls** (`systems/CombatSystem.js`, single owner of the mouse in a fight):
LMB tap = light combo (fires on RELEASE — holding no longer auto-repeats); hold LMB ≥ 0.3 s = heavy, charged to 1.0 s (×1.7–2.6 dmg, staggers, stamina ×1.6–2.4, does not advance the combo); RMB hold = block (frontal 150°: 80% stopped, stamina 6 + 0.55·dmg, empty stamina → guard break 1 s, 60% through, slows you to 0.45); RMB pressed ≤ 0.2 s before a blow = parry (0 dmg, attacker hitStun 1.4 + attack reset, +10 stamina, riposte 1.6 s: next light ×2.5 + stagger); MMB = hard lock (camera eases onto the target, wheel switches L/R by screen x, breaks at 34 m, flows to the next foe within 12 m on a kill); soft lock always (≈2 m-wide cone around the crosshair). Melee bends toward the target (`meleeAim`, ≤40° soft / any frontal hard) and steps in ≤0.7 m. Swings cost stamina by weight (5 + 10·PROFILE.heavy). Clicks during a swing buffer 0.35 s.

**Three pools:** Health · Stamina · **Focus** = `player.mp`. `CoreSystem.essence/capacity/spend/restore` route to it (getter/setter), so every Remnant-skill call and every wand spell spend ONE pool. Regen `(2 + 0.012·maxMp)/s × water mastery × innateEssenceMult`. Essence bar hidden; mp bar reads "Focus".

**Wiring:** incoming — main.js COMBAT_HIT `target === 'player'` → i-frames first → `combatSystem.resolveIncoming(src, dmg)`; outgoing — `checkCombatCollisions` uses `meleeAim`, `outgoingMult`, `outgoingStagger`. `Player.performAttack(kind, charge)`; `player.combatMoveMult`, `player.isBlocking`. Camera no longer drains the wheel (CombatSystem does). New events: COMBAT_LOG, COMBAT_FEEDBACK, ENEMY_HURT (Enemy.takeDamage). TargetReadUI follows the combat target so every readout names the same enemy.

**Viewmodel:** heavy plays `Choreo.heavyClip` (one per weapon, `HEAVY`); while charging, its wind-up is held at `charge × windEnd` and the release continues from there; block = `Choreo.guardPose` with a jolt per blocked blow.

**HUD** (`ui/CombatHUD.js`, self-styled): target name/level/health (lagging chip, gold edge in a riposte), soft brackets / hard ring, "!" over in-view wind-ups, orange edge wedge for off-screen ones, red wedge toward what hurt you, hit/heavy/kill/block/parry markers each with a sound (AudioSystem playHitTick/Kill/Block/Parry/GuardBreak), heavy charge ring, block shield, stamina arc, one-line combat log under the crosshair ("Not enough Focus — 14 needed, 6 left", "X is recovering — ready in 2.1s", "weak to / resists", guard broken, parried).

**Verified headless with real mouse-button state:** light 43 dmg, full heavy 100, block 30→6 (stamina −22), parry 0 dmg + 1.2 s stun + riposte 100, back-hit full, lock holds through a 0.6 rad camera turn, Focus spend shared, warnings in/off view, no errors. NOT verified: feel at real frame rate; enemy parry timing vs. their telegraph lengths in play.

### Follow-up pass ("work on everything remaining")
- **One hotbar** (`ui/WandUI.js`): three labelled groups in one row — PATH (Z/X/C) · REMNANTS (1–9, `renderRemnants`, called by main.js `_paintLoadoutBar`; the old `#loadout-bar` row is emptied) · WAND (each slot shows its REAL bound key via `bindSystem.keyFor(WEAVE, slot.id)`, "·" dashed when unbound — they used to be labelled 1,2,3, the Remnant digits, on keys that did not fire them). Every slot dims (`.hotbar-poor`) per frame when Focus < cost (`data-cost`, `updateCooldownVisuals`).
- **Notification feed** (`showNotification`): bottom-left, max 4, repeats collapse to "×n", 4.8 s, dims in a fight (`_syncNotifDim`). Combat reasons go to the crosshair log instead.
- **Parry cue**: the wind-up "!" turns red when the blow lands within 0.22 s — exactly when RMB parries.
- **Two-hander off hand** hidden when within 0.42 of the lens (overheads swung a giant fist into view).
- **Echo timing**: FacetCaster aligns a Call-trait echo with the choreography's own echo stroke.
- **Dead code removed** from main.js (~217 lines): ASPECT_SHAPES/ASPECT_SHAPE_FOR/_playAspectMotion/_vmAspect, WEAPON_SWING/_swingProfile, _vmSwingT, _VM_PULL. WeaponMotion's `beats` are now unused (only scale/stance/windup are read) — safe to trim later.
- Tutorial line fixed (it said "tap 1 to cast" — 1 is a Remnant skill; infused spells auto-bind to a letter, Q first).
- Still open: perf (ask the owner for F3 p95 in a fight), parry window/stagger numbers need a real play-test, light attacks fire on RELEASE (by design, so tap vs hold can be told apart).

### Compact HUD (owner: "the UI elements are too big and cluttering the screen")
Default is `body.hud-compact` (style-realism.css "COMPACT HUD" block); **F1** toggles `hud-full` (persisted, `localStorage mz.hudFull`; main.js `_setHudMode` / `_updateHudMode`; F1 preventDefault'd in InputManager). Compact hides the portrait, summon strip, lineage/ascent/leaning lines and the Cursor button; vitals are bare thin bars with shadowed text; the minimap is 72% and frameless; the hotbar is 80%; the TargetRead composition panel docks under the top-centre target bar; key hints show only for the first 180 s of a session (`hints-on`) and in full mode; a small "F1 · controls & details" tag sits bottom-left. Notifications max 3. Enemy name tags: only within 12 m, never on the target the bar already names (`Enemy.hudTarget`, set by CombatHUD), smaller, and no longer drawn through walls (depthTest was false).

---

## ⚠️ LIVING TERRAIN — water, ground cover, wind, particles, combat reacting

Owner: *"Improve the terrain, add different elements like grass or different types of terrain with dynamic movement… subtle grass movement, water physics."* Asked first; chose ALL of: lakes/ponds, rivers/streams, the sea at the Shore, puddles/swamp · flowers & tall weeds, bushes & ferns, dead-realm flora, stones & debris · player interaction, weather wind, ambient particles, combat reacts · scale by quality tier.

- **Hydrology** (`world/Hydrology.js` + `TerrainGenerator._getHeight`): water is CARVED into the one height function, so mesh, `getGroundY`, physics, props and grass agree. Per-biome weights {sea, wet, river, lake} (by `biome.key`, now set in BiomeManager) are blended like heightScale by every caller (mesh pass 1 + both normal passes via `vHy`, `getHeightAt`, `ChunkManager.getGroundY`) into `terrainGen._hy` before calling `_getHeight`. Rivers = isoline of a warped ~700 m field, streams = a narrower one; lakes = noise maxima; puddles = high-frequency hollows; the sea sinks the Strand/flats below `SEA_Y = -0.5`. The weight GATES presence (a low weight made shallow sheets everywhere: 24% of the desert was "water"). Each call records `_wSurf/_wRiver/_wSea`. No water within 110 m of the Sanctuary or on mountain flanks. Coverage measured: plains ~8%, swamp 18%, coast 15%, Strand 78% shallow tidal flat (avg 0.5 m), fire biomes ~0. Height-call cost 2.62 → 2.85 µs.
- **Water** (`rendering/Water.js`, `ChunkManager.water`): one mesh per chunk (1.1 ms to build, disposed on unload), dry vertices sunk under the bank so the depth test cuts the shoreline. MeshStandardMaterial + onBeforeCompile: depth tint per biome (`WATER_TINT`), thin waterline foam (a 0–0.26 m band read as snow in the swamp), sea swell + breaking crests, wind chop from the shared wind, river current advected along `aFlow`, ripple rings (`ripple(x,z,s)`, 10 slots). `ChunkManager.getWaterAt(x,z)` → {bed, surf, river, sea}.
- **Player in water** (`Player._handleGravity`): `waterDepth/waterSurf/isSwimming`; wading slows up to −45% (no sprint), > 1.35 m swims (eyes ~0.3 m above, bob, 55% speed). main.js `_updateWading`: splash on entry, rings while moving.
- **Wind** (`world/Wind.js`): ONE set of uniforms (+ `WIND_GLSL windDisplace`) for grass, flora and water: strength from `weather.intensity` (the old code read a non-existent `weather.windStrength` → constant 0.4), wandering direction, gust bands travelling downwind, plants parting around the player, `wind.impulse(pos, r, s)` flattening (8 slots, 3 s spring-back) + `onImpulse` listeners.
- **Flora** (`rendering/Flora.js`): 13 kinds (flower, seedhead, reed, fern, bush, ashgrass, bonereed, fungus, crystal, stone, pebbles, branch, bone) per biome (`FLORA_BY_BIOME`, one kind per lattice cell by cumulative probability), GrassField's double-buffered time-sliced re-seat (~2.2 ms total), wind-swayed by stiffness, fungus/crystals glow via instance colour → emissive, reeds only at water's edge, nothing else in water. Low tier: debris only. Grass now skips water deeper than 0.2 m.
- **Ambient particles** (`rendering/AmbientParticles.js`): pollen / dust / ash / ember / spore / mote / snow by biome, carried by the wind, camera-relative wrapping box, cross-fade on biome change, dimmed in storms; 0/500/1100/1700 by tier.
- **Combat reacts:** `wind.impulse` from ENEMY_HURT (by player), heavy swings, and every FacetCaster delivery; main.js's listener splashes water or raises dust.
- Verified headless (random seed; the probe finds each feature in-page): lake, river, sea, swamp, meadow, grotto, Gravefall views; swimming (2.3 m deep → swimming, eye +0.3), flora counts, costs, no console errors. NOT verified: real-time feel and frame cost on the owner's machine (ask for F3 p95).

### Water realism + the moon (owner: "too reflective and not realistic… the moon is broken and not as per the need")
Asked: water → "natural, murky"; moon → "shattered, done right".
- **Water** (`rendering/Water.js`): roughness 0.06 → 0.22 (+wind), envMapIntensity 1.15 → 0.32, ripple normals ×0.6, colour closes in within ~1 m (`deepK` over 1.1 m, alpha 0.5 → 0.97 by 0.75 m) so the bottom shows only in shallows; silty natural tints per biome (`WATER_TINT`), only the grotto keeps teal.
- **Moon** (`rendering/Atmosphere.js` sky shader): rebuilt as a lit SPHERE (normal from disc coords, lit by `uMoonSun` = the scene sun → terminator/phase, earthshine on the night side), cratered (cell craters at 3 scales) with maria; JAGGED fracture (`MCUT`, noise along the cut), the broken piece drifted AND rotated, 11 debris fragments in the gap, dust haze, exposed break faces glowing faintly in `uRiftColor`. Size 0.20 → 0.085 rad. Additive by day; solid enough at night (cover 0.85) to hide stars. Note: the sun here is region-driven, not a clock, so the phase follows the region's sun.

### The moon is GEOMETRY now (owner: "still a piece of 2d shit… like real life and 3D")
`rendering/Moon3D.js`, created by `Atmosphere.init` (the sky shader's painted moon is off: `uMoonSize = 0`), updated from `Atmosphere.update` with the sun direction and a sky tint. An icosphere (⚠️ three r183 `IcosahedronGeometry` detail is LINEAR per edge: 6 gave 3.7k tris; 52 gives ~56k) sculpted per vertex: 340 power-law craters (bowl, rim, ejecta, dark floor, bright rim, ray systems on young ones), 3D-noise highlands, low dark maria. Shattered in 3D: a jagged cut surface (`cutAt`); the body's far cap is FLATTENED onto it (a projected cap covers the cross-section once → a solid fracture face, roughened); the piece = the cap surface + that face reversed, drifted 0.62 R along `cutN` and turned; 24 tumbling debris rocks. `setDirection` aims `cutN` up-left and slightly toward the viewer so the gap opens across the view (pointing away hid the piece). Shader: Lommel-Seeliger + Lambert (flat-bright full moon, relief at the terminator), earthshine, vein glow in `uRift` on fracture faces, opaque (transparent pieces ghosted) with a light sky-tinted haze by day. Fixed 900 u from the camera, 0.085 rad radius, fog off, terrain occludes it. Build ~0.5 s at load, ~98k triangles total.
- Moon raised to ~42° elevation (uMoonDir (-0.484, 0.669, -0.563); was ~17°, on the horizon). Same bearing. Out of frame when looking dead level (the view's top edge is ~37°); a slight look up frames it.

### ⚠️ "Weapons and skills stopped working" — a saved-game boot crash (fixed)
`WandSystem.init` compared against `previous.length`, a variable that no longer existed. That branch runs only when the wand is ALREADY equipped — i.e. on Continue/restore — so every saved character threw `ReferenceError: previous is not defined` and the boot stopped half-way (weapons, skill bar and loop not fully up). Now tracks `this._lastSlotCount`. Fresh games never hit it, which is why every new-game probe passed; the probe that found it: forge → summon (Q) → skills → `saveSystem.save()` → reload → Continue → skip the chapter card → 1/2/Q.
Also fixed: `ProgressSystem._applyLevelStats` rebuilt maxHp/maxMp from base and DROPPED the Crucible's innate multiplier (NightmareSystem applies it once), so equipping a weapon cost e.g. a +35% Focus Pioneer 28 Focus. It now folds `innate*Mult` once `_innate*Applied` is set.
Note for probes: after Continue a story chapter card (SceneUI) is up and deliberately swallows every key until Space/Enter/E/Esc — not a bug.

---

## ⚠️ AUDIT + PLAYABILITY PHASE (owner: "check the code holes, review the handoff, identify missing features, grill me, implement")

**Audit** — `tsc --allowJs --checkJs` (RŌNIN's TypeScript, a throwaway tsconfig) over all 56k lines; no undefined names remain. Real holes found and fixed:
- `WandUI.render` read `wandSystem.activeSlot` (gone — slots are a Map by id): the active Weave was never highlighted and clicking a slot passed an index. Now `activeId` / `setActive(slot.id)`.
- `PropForge` passed `seg(6, …)` (a segment COUNT, ~6) as `roundedBox`'s corner RADIUS for hub walls and grave markers → malformed blobs. Now 0.05.
- The key-hint line told the player G=grimoire, F=forge, L=codex, J=journal, N=rite, H=wand; G/H/J are the weapon slots (RESERVED) and the others open from the Tab menu. Rewritten.
- (Previous turn) the saved-game boot crash and the innate-pool loss.
A runtime sweep (every panel key, level-up, trial completion, long teleports, death/respawn) produced no errors.

**Grilling — decisions (owner):** 1) Phase 1 = playability (settings/pause menu, biome stutter); phase 2 = real creature models + dungeon interiors. 2) Music deferred (in-game generative when it comes, unless the owner supplies tracks). 3) Esc pause menu that freezes the game. 4) Settings: master/effects/ambience volume, sensitivity + invert-Y, FOV, quality (reload), frame-time readout, compact/full HUD — saved in the browser for every character.

**Pause menu** (`ui/PauseMenu.js`): Resume · Settings · Controls · Save & quit to title. Esc is checked in the CAPTURE phase so it only opens when no panel/scene is up (panels close themselves on Esc). Chrome swallows Esc while the pointer is locked, so an UNEXPECTED pointer-lock release also opens it — `InputManager.intentionalUnlockAt` marks Alt/Cursor-button releases, and panels that release the lock are visible by the time the check runs. `engine.pause()` freezes the sim. Settings in `localStorage['mz.settings']`, applied per key (so a volume change never undoes a manual F3). New: `AudioSystem.sfx`/`amb` buses under the master (`setSfxVolume`, `setAmbientVolume`; volumes set before the AudioContext exists are remembered); `CameraController.sensMult/invertY/baseFov` (sprint keeps its relative widening). Quality: `quality.setTier` + "Save & reload now".
Verified: Esc opens + pauses; sliders apply live and persist; Esc with the satchel open closes the satchel only; settings survive a reload into a new character.

**Biome stutter** (`rendering/BiomeWarmup.js`): measured first — entering an unseen biome compiled up to 198 programs (volcanic 1.2 s, jungle 0.8 s, tundra 1.0 s); 346 distinct FLAG combinations across standard materials, not code variants. Every 0.5 s the nearest not-yet-seen biome within 4 chunks gets a SAMPLE built with ChunkManager's own generators (trees, rocks, clutter, bone fields, realm landmarks, wilderness structures with `siteSystem.register` stubbed, and its `enemyTypes` creatures) at chunk 7000+, compiled 2 objects/frame with `compileAsync`, then DRAWN ONE FRAME 3 m behind the camera with culling off — compileAsync covers only each object's own material; the shadow-depth and AO normal-override variants compile only when drawn, and they were most of what remained — then cleaned up as an unloaded chunk is. Result (headless, noisy): most biomes now enter with ≤100 ms worst frames (volcanic 198→0 programs in one run). Still not covered: descent gates, named landmarks, the hub; multi-second headless outliers are GPU stalls (trap #4). Ask the owner for real F3 numbers (now a Settings checkbox).

---

## ⚠️ PHASE 2 — CREATURE MODELS + DESCENT DUNGEONS (owner: "start phase 2"; assets "made for uniqueness and perfect fit" = built in code, no packs)

### Creatures (`rendering/Creatures.js`)
The five non-humanoids that were primitive stacks are now sculpted, jointed rigs: **Skitterhusk** (spider: cephalothorax, banded spiked abdomen holding the core, chelicerae + fangs, pedipalps, 8 eyes, 8 four-segment legs on a tetrapod gait; rears on windup, lunges on strike), **The Seep** (slime: translucent gel with an onBeforeCompile wobble seeded per instance, skull/ribs/core suspended inside, puddle; squash-and-stretch hop), **Rimeshade** (ice: 16-shard torso round the core, shard crown, shard-chain arms ending in blades, 10 orbiting tail shards), **Xartharael** (dragon: torso, overlapping-link neck (5) and tail (8) with spikes, hinged jaw with teeth, horns, 4 clawed limbs, finger-boned membrane wings; breathing, neck/tail waves, wingbeat on attack), **The Burrower** (worm: mound + rocks, 9 corrugated lathe segments with plates, a 4-petal toothed mouth that opens on windup).
Kit: `taperTube`, `blob` (merged + lumped), `limbSeg`, `limb(lengths, radii)` → joints, `tinted` material cache. `EntityForge.forgeCreature` tries `buildCreature(archetype, mats)` before the old PLANS; `animateCreature` routes `group.userData.creature` to the rig's `animate(dt, t, {speed, attack, strain})` (speed measured from position delta; the mesh named `core` keeps the strain glow). Verified headless: 5 creatures × idle/walk/windup/strike, no errors. NOT verified: how they read in a real fight at real frame rates.

### Descent dungeons (`world/DungeonLayout.js`, `rendering/DungeonKit.js`, `systems/DescentSystem.js`)
A Descent used to be an open disc of realm terrain inside a glowing cylinder. It is now a built dungeon, deterministic on (element, tier):
- **Layout** (pure data, 2 m grid): the Warden's hall at the realm origin (half-size `0.27R`, 10–20 m), the entry hall at `z = 0.6R` where you arrive, `3 + R/22` side rooms, joined by a Prim MST + 1–3 loops of 4 m corridors, plus ONE exit corridor south past `R + 6` — walking out of it is still how you leave (the old abort rule, unchanged). ⚠️ Every corridor route (L either way, then Z through the midpoint) must stay inside the abort circle — an L-bend between two rim rooms put floor outside `R` and walking there would have ended the Descent. A room with no fitting route is dropped. Checked all 55 (element × tier) layouts: fully connected, nothing outside `R`, a nav agent reaches the entry from the farthest room.
- **Ground**: `TerrainGenerator.flatZone {x, z, r0, r1, h}` presses the terrain flat to the floor height inside `R + 18`, easing back by `R + 34`, and suppresses water there. Set in `enter()` BEFORE the realm chunks stream; cleared in `_teardown()` before `setRealmMode(false)`.
- **Kit** (geometry only, §3): ashlar walls course by course in running bond over a dark merged core (greedy wall rectangles), with a broken crown that is a smooth profile along the wall (⚠️ a per-block coin toss left blocks floating over gaps); flagstone floor over a mortar bed; pillars with bases and capitals, ~22% fallen (shaft lying beside the stump); lintel beams across narrow corridors; rubble; an element-colour inlay line at hand height; a Warden sigil in the hall that wakes (`setAwake`) when the Warden spawns; a gate frame + veil at the exit. Per-element stone tint and dressing: veins (fire/lightning), pools (water/poison), crystals (ice/lightning/light/void/arcane), roots (earth/poison), chains (water/shadow/void), banners (wind/light/arcane). Roofless on purpose (lighting and fog come from above; beams overhead read as "inside").
  Cost (tier 5): ~17–25k instances in ~14 InstancedMeshes, ~250k triangles; build 30–105 ms headless on entry (behind the transition).
- **Collision**: wall rectangles + pillars go into `chunkManager.colliders` tagged `mesh: kit.group` (removed on teardown). Enemies had no collision at all, so `DescentSystem._pushOutOfWalls()` pushes wave creatures and the Warden out of wall boxes (circle vs box, slides along faces).
- **Pathing**: `Enemy` gained two optional hooks set by `DescentSystem._bindNav`: `nav(pos, target, out)` — a BFS flow field from the player's cell (rebuilt only when you change cell) returns the next waypoint when there is no straight floor line, and the creature cannot enter its attack state while routing; `losCheck` — line of sight through the dungeon grid, so nothing strikes or throws through a wall.
- **Waves** spawn on floor cells 12–44 m of WALKING distance from you (rooms first); the Warden still spawns at the origin, in the hall. Pyres moved from a ring into the halls (4 in the Warden's hall, 1 entry, 3 largest rooms; light range 30). The boundary cylinder is not built when a dungeon stands (old path kept as fallback if the build throws). Grass and flora are hidden while `descentSystem.dungeonActive`.
Verified headless: fire t3 and ice t5 end-to-end (enter → creatures on floor → player stopped 0.28 m from a wall → waves cleared → Warden with nav → abort → no leftover colliders, flatZone cleared, grass back); all 11 elements at tier 5 enter/abort with no errors. NOT verified: frame time inside a dungeon on the owner's machine (ask for F3 p95 in a tier-5 Descent), and how well creatures path in real fights (flow field is 4-neighbour on a 2 m grid; big creatures can still clip a corner they are pushed back out of).
Still open: no ceiling/indoor lighting answer, no doors or traps, no loot rooms; music still deferred.

---

## ⚠️ HUD: THE ARMAMENT replaces the hotbar (owner: "feels very AI-ish", "less abilities, more physical combat", "remove the commands at the bottom")
- `ui/WandUI.js` rewritten (same public API). The centred row of glowing glyph circles in three labelled groups (Path / Remnants / Wand, up to 15 slots, numbers on each) is gone. Now a bottom-left equipment cluster after Sekiro / Elden Ring / RŌNIN: the weapon in hand as an item-art silhouette (11 weapon types + the wand, drawn as SVG on the diagonal) with its name and the three combat-slot letters (in-hand one lit); then the three arts (Z/X/C) as plain named lines with a hairline cooldown; then ONLY the active wand weave, with charge pips. Styles at the end of `style-realism.css` ("THE ARMAMENT").
- ⚠️ The Remnants' 1–9 skills are no longer drawn (`renderRemnants` is a no-op); their keys still fire. Their fate belongs to the combat revamp.
- The key legend (`#key-hints`) is deleted from `index.html`, and the "F1 · controls & details" tag is no longer created (F1 still toggles compact/full). Notifications moved up (bottom 250px) and the interaction prompt to 22vh to clear the cluster.
- Verified headless at 1440×900: cluster renders, all 11 silhouettes read, no errors. A combat revamp is being designed with the owner next (grilling).

---

## ⚠️ STEEL — THE COMBAT REVAMP (owner: "too similar to Shadow Slave… a completely new combat system", grilled 2026-10-05, "all at once")

**Decisions (owner, in order):** cut from combat: summoned Memories (G/H/J call-up), Aspect + Flaw at birth, Essence fuel, Echoes/thralls · core = DIRECTIONAL weapon fighting · magic lives IN the weapon (charge → one empowered strike) + RITUALS prepared before a fight; no spell bar · input = STANCE (high/mid/low) sets guard + default combo (click-only works without a mouse) + optional mouse FLICK for the side; hold = committed heavy · defence = block guards your stance's plane, last-instant = DEFLECT; no roll, step out of arcs · resources = Stamina + Balance + Wounds · beasts = a hand rule per creature · weapons = family reach/speed/arcs + one property; Z/X/C = techniques LEARNED by using the family · growth = technique & steel, no XP levels/stat inflation · fights = humanoids in turn-taking small groups, beasts alone or with a swarm · reading = body + faint mark while locked (Settings toggle).

**Where:** rules as data in `data/steel.js` (LINES, STANCE_COMBO, FAMILIES, TECHNIQUES, REGIONS/SEVERITY, BEASTS, RITUALS, TRAITS). `systems/CombatSystem.js` rewritten (same export, same main.js call sites): stance/flick/swing, `resolveSwing()` (called at the impact frame from main.js `checkCombatCollisions`, emits COMBAT_HIT itself), humanoid guards, `beastFactor()`, balance both sides, deflect/riposte, wounds/bleeding/binding (F), rituals, blade charge + unleash (Q), techniques (Z/X/C), body traits (grip/wind/footing), enemy tick (guard adaptation, turn-taking `mayStrike`, attack line choice, cripple/bleed/burn), save/restore. `ui/SteelHUD.js` (Balance in the old Focus bar, Blood label, wound body figure, bind/ritual progress). `rendering/Choreo.js` `steelClip()` (a clip per line / technique). CombatHUD: incoming-line red stroke + faint guard stroke (replaces "!"), target balance line, no levels.
- **Controls:** 1/2/3 or wheel = stance · LMB (flick = side) · hold LMB heavy · RMB guard/deflect · R step (no i-frames, 1.7 m) · Z/X/C techniques · Q unleash · hold F bind · G next belt weapon · MMB lock, Shift+wheel switch · satchel double-click a rite. Pause → Controls lists it.
- **Enemy.js:** level → skill (≈3.5%/level HP, capped; caller hpMult/atkMult compressed ×0.35), `typeIndex` stored, windup COMMITS (stops tracking you in its last 40%) and the strike checks its arc (centre 32°, sides 55°, low 60°) → `Enemy.onWhiff` (footing); body lean tells the plane; hyperArmor (dragon/golem/worm/bosses) don't flinch out of a windup; `Enemy.mayStrike` gate before a windup; `waitTurn` circling; floating name boards hidden.
- **Cut, at their entry points (not deleted):** `updateWandInput()` no longer called (weaves, Remnant 1–9, gear letters) → `updateBeltInput()` (G); Player Z/X/C spells off; `NightmareSystem.grantInnateNow/reapplyInnate` return null/false; `ProgressSystem.award` no-op and `_applyLevelStats` flat; `_syncEchoes` manifests nothing and `LoadoutSystem.equipWeapon` refuses echoes; Rank refusal removed both ways in COMBAT_HIT; wand hidden in the off hand while a weapon is drawn.
- **New Pioneer:** "Pilgrim's Sword" (sword family, 20) put on the belt, and a kit (2 Iron Draught, 1 Ember Oil, 1 Chalk Ward) once (`combatSystem.kitGiven`, saved). Rites drop at 9% from kills. Ritual items registered in `data/itemRegistry.js` (type 'ritual'), satchel compartment "Oils, Wards & Draughts".
- **Save:** `grab/put('steel')` in SaveSystem; verified the block is written.

**Verified headless:** line vs a mid-guarding humanoid (mid lines 0 dmg + balance, others land); unguarded hit → regional wound that bleeds; guard right plane = block (0 dmg), late press = deflect (riposte + 0.25 charge); slime cut 14 vs thrust 51; Rimeshade shards 6→4; wraith 0 while veiled; golem ~0.45×; fire oil applied; unleash 142 on a 56-HP pilgrim; Feint learned at 12 blows; real keys 1/3 change stance, real click swings the stance line, hold charges; three humanoids never strike at once (max 1); spider arrives with 3 Skitterlings; save carries steel; no console errors.
**NOT verified:** feel and timing in hand (windups, deflect window 0.2 s, step 1.7 m, damage numbers are first guesses); the mouse FLICK in a real browser (headless cannot produce movementX reliably); frame time. **Still Shadow-Slave-shaped outside combat:** the Memory forge (runes + soul cores, Facets/flaws on items), the First Nightmare, Ascent ranks, Descent "Gates", Remnant/Essence naming — the owner scoped this pass to combat; they are the next grilling.

---

## ⚠️ HANDS, MODELS, AND THE REST OF SHADOW SLAVE REMOVED (owner: "two hands although only one required… glitchy", "models were way better before" = human enemies + weapons/hands, "remove the Shadow Slave system completely… how do I craft them all")

**Hands / swings (main.js updateViewmodel, Choreo.steelClip)**
- One-handers show ONE hand: `wandMount.visible = !hasWeapon` (the empty off hand / old focus beside a sword read as a broken second grip). Two-handers keep the off hand on the haft; its "too near the lens" hide now has hysteresis (0.30 in / 0.36 out, `_vmOffNear`) — a single 0.42 threshold sat on the idle pose and blinked every bob.
- Swings use each weapon's AUTHORED moves again: `authoredFor(key, line, heavy)` picks the COMBOS beat (or HEAVY blow) whose direction matches the line; the generic per-line stroke is only the fallback.
- `_playWeaponSwing` returns at once for plain steel (`combatSystem.element === 'neutral'`): every branch (lance / ring / arc) drew flat white sheets on a mundane swing. Oiled or elemental blades still trail, and the arc follows the line.

**Models** — human enemies are the KayKit characters again (`forgeCreature` ignores `CREATURE_MODELS[*].real`; NPCs and the Pioneer still use Wanderer). `ModelLibrary._darkenTexture` (65% brightness) + `_tintColorDark` (×0.75 + grime → base colour ~0x38) had crushed them to silhouettes; now saturate 88% / brightness 96% and a white base nudged 6% toward grime. Beasts (Creatures.js) unchanged.

**Shadow Slave removed (entry points, data kept so old saves load)**
- First Nightmare: `NightmareSystem._start/restore` force `PHASE.NONE` — no trial, no warp, no level cap; an old save in a trial wakes out of it.
- Tab menu: only Satchel · Forge · Journal · Codex. Removed: the Loom (Memory forge), the Rite, the Ascent, Bindings, the Wand, the Grimoire, Attunement. HUD hides rank/lineage/attunement/leaning lines.
- Soul cores: `_giveCores` (caches, ruins, graveyards, quarries) now pays smithing stock by richness (iron ore/leather/oak → steel/ash → mithril/silk → eldertree/wyrmscale/starmetal). Shrine asks for ore or hide. Ruins leave a real smithed weapon, not a forged Memory. Monoliths teach +10 practice with the weapon in hand.
- Descents: no Revenant / Memory / Echo payouts; `DESCENT_EXIT` (resolved) pays a weapon by tier + steel/mithril.
- Tutorial t3 is now "Steel of Your Own" (smith anything, `ITEM_CRAFT` → 'forge'); the opening lines teach guard + Forge, not B/V brewing.
- **Damage scale:** the Nightmare's atk cap had been hiding raw template attack (a pilgrim hit 68 of 160 blood). `STEEL_DAMAGE = 0.32` in Enemy's atk; a pilgrim now hits ~20 (a cut).

**Crafting = the Forge only (Tab → F)** — `data/materials.js FORGE_RECIPES`. Added recipes so every family is smithable: Yew Longbow, Hollow Stave, Ribbed Maul, Iron Greatsword (new item), Paired Fangs, The Harvest. Satchel double-click on a weapon puts it on the BELT and draws it (displaced weapon back to the satchel); G cycles the belt.

Verified headless: one-hand / two-hand frames for sword, greatsword, axe, spear; KayKit enemies skinned and readable; no Nightmare on a new game; menu entries; forge an Iron Greatsword → double-click → drawn, family greatsword, G back to the sword; full STEEL combat probe re-run, no errors. NOT verified: feel by hand, perf (F3 p95).

---

## ⚠️ THE WORLD EXPANSION (owner: "expand the game — more biomes, mobs, materials, caves for ores"; grilled 2026-10-06, "all at once")

**Decisions:** depth over count · caves = MIX (surface grottos + open quarry pits for common ore, deep walkable dark caves for rare) · crafted TOOLS with ore HARDNESS · creatures = ALL (wildlife with temperaments, biome monsters, hand-ruled beasts, humanoid factions with camps) · materials = ALL (metal ladder with traits, a signature material per biome, alloys at a smelter) · four new biomes · food heals + buffs, no hunger.

**Data — `data/expansion.js`** (pure data; registered by materials.js/itemRegistry, Enemy.js, steel.js):
- METALS: bronze 12 · iron 16 · steel 21 (keen +10%) · silver 19 (blessed ×1.5 vs UNDEAD) · mithril 26 (light −25% stamina) · obsidian 29 (+35%, blocked → you lose 10 balance) · moonsteel 30 (light + blessed) · starmetal 35 (+20%, −15% stamina) · orichalcum 42 (charge ×1.5). `pick` = hardness that metal's pickaxe breaks (2…7).
- ORES hardness: copper/tin/coal 1 · iron 2 · silver 3 · mithril/obsidian 4 · starmetal 5 · orichalcum 6. WOODS: oak 1, ash/heartwood 2, spiritwood 3, eldertree 4.
- Generated: ingots (smelt at a smelter: bronze = 2 copper + tin + coal → 2; iron = 2 ore + coal; steel = 2 iron ingots + 2 coal — the old 3-ore steel recipe is retired; moonsteel = silver + mithril ingots), every metal × 8 weapon families, pickaxe / woodsman's axe / skinning knife per metal (not obsidian), helm/hauberk/greaves per metal, bows and quarterstaves per wood, tanning (hide → leather at a fire), Campfire and Bloomery kits, 5 foods, rite recipes. 176 forge recipes total. Generated items never shadow existing ids.
- SIGNATURE material per biome (31), BIOME_ORES (surface veins), CAVE_ORES (3 depth bands), BIOME_LIFE (wild / monsters / factions per biome), CAVE_LIFE, NEW_CREATURES (24), QUAD_SPECS.
- Starter kit adds Worn Pickaxe + Worn Hatchet (power 1) and a Campfire; the wand, brewing reagents and starter spell are no longer handed out.

**Biomes** (`BiomeManager`, ids in constants, tables in Hydrology/TerrainLayers/GrassField/Flora/AmbientParticles; `mud` footstep): The Iron Hills (ring <2 high/dry + ring 2–3 dry; quarries), The Sunken Mire (ring 2–3 wettest), The Karst Highlands (ring 2–3 high & wet; cave mouths 50%), The Ashen Caldera (ring 4–6 hot & high). Counted over 4 seeds — all appear. ⚠️ Pre-existing: the CRIMSON RIFT has 0% share (Godgrave's `temp > 0.52` test precedes its `temp > 0.6`); not fixed.

**Creatures** (`ENEMY_TYPES` appended after the original 12 — indices never move; `typeIndexOf(id)`): wildlife deer, elk, goat, boar, antelope, strider, wolf (pack 3), bear, jackal (pack 3), gator (ambush), lynx; monsters Rust Crawler (`plates`), Bog Horror (`rooted`), Marsh Wisp (`veiled` — steel only while it strikes, or an oiled/elemental blade), Cinder Salamander, Obsidian Sentinel (`brittle` — heavy/hammer ×2.2, light ×0.3), Pale Stalker (ambush); cave Blind Crawler (`blind` — hears sprinting/fighting within 16 m), Pale Grub (pack); factions Hill Bandit / Bandit Brute / Ashen Cultist / Oathless Knight / Drowned Thrall on KayKit models (they guard and read your stance). Bodies: `rendering/Creatures.js` `buildQuad(spec)` (parametric animal: antlers, horns, tusks, mane, hump, beak, scutes, spines, sprawl; walk/gallop, grazing, charge, bite) + bespoke beetle/horror/wisp/sentinel(glass ice)/centipede/grub. Natural colours, not element-tinted. Temperaments in `Enemy._temperament` (skittish flee, defensive flee until hurt, ambush sunk + held until 5 m, blind). Hides drop only with a skinning knife carried (`Enemy.hasKnife`). Spawner: 50% wild / 22% monsters / 10% factions from BIOME_LIFE, else the biome's `enemyTypes`; packs spawn together; `realmHold` stops ambient spawns in caves.

**Gathering — `systems/GatherSystem.js`:** T cycles weapon → pickaxe → woodsman's axe → knife (only what you carry); the tool is the weapon in hand via `LoadoutSystem.toolOverride` (new `pickaxe` Arms model + `pickaxe` family). Swinging at nodes → `strikeNodes`: wrong tool / too soft says exactly what is needed. Yields via `chunkManager.yieldOf` (veins ore, rocks stone + 30% biome ore if the pick can break it, trees the biome's wood: ash in the burnt lands, heartwood in old forest/mire, spiritwood sometimes in the jungle). Stations: Forge recipes with `station: 'smelter'|'fire'` need one within 7 m (`crafting.stationOk`); the Sanctuary has a bloomery (−8.5, 5) and fire (−5, 7.5); kits placed from the satchel persist (save 'gather'). Food: double-click to eat (heal + buffs wind/footing/clot/grip read by CombatSystem).

**World features — `world/WorldFeatures.js`:** per chunk: ore veins (biome ores), signature nodes, grottos (overhang + 2–4 veins), quarry pits (terrain carved by `pitCarve` in TerrainGenerator on a 160 m pure-hash grid, 11% of cells, benches + floor, dry; veins, headframe, ladder), cave mouths on the steepest slope (site 'cave'), faction camps (tents, fire, stores = site 'warcamp'; members spawn within 48 m, `updateCamps`). Every harvestable is a top-level decoration (unload safety).

**Deep caves — `systems/CaveSystem.js`:** E at a mouth. Realm band 700 000+; organic layout (`generateDungeon(..., { organic: true })`: noisy-ellipse chambers, wandering tunnels; all 55 layouts verified connected and inside R); roof with stalactites, boulder walls, wet floor, depth glow (fungus / crystal / magma) + up to 6 room lights, a carried lantern, `Atmosphere.setCaveDark(1)` (key ×0.06, floor ×0.18, fog near-black ×2.6). Depth band by distance (<600 shallow, <1500 deep, else abyssal; Karst +1); ores in walls by band, the deep chamber richest, cave pearls as pickups at band ≥1; cave creatures with flow-field nav and wall push-out. Walk back out the mouth tunnel to leave. A Descent cannot open while in a cave.

**Verified headless:** biome distribution (4 seeds); all 24 creatures build; deer/boar flee, boar charges when hurt, gator held hidden (fixed after first run); worn pick refuses iron, breaks tin, drops ore; smelting refused away from a smelter and works at the Sanctuary; cooking; campfire placed; a pit 4.5 m deep with 6 veins; a cave entered (deep band: 22 veins, 17 creatures) and exited cleanly; the four biomes rendered; STEEL combat probe unchanged; no console errors. **Not verified:** feel by hand, perf (more props and pooled lights per chunk; ask for F3 p95), save/load of placed stations, how often you meet a camp. Known: Iron Hills ground reads brown, not the intended red (ground textures dominate the tint).

### Terrain texture variety (owner: "the texture in the terrain is too monotonous… fix it")
`rendering/TerrainLayers.js` (cache key `layers5`). Causes: one sample per layer at a 3 m repeat with only a ±7% sine wobble (visible tiling); each biome a fixed layer mix everywhere (a biome = one texture); and the biome colour steer was CAPPED at 1 per channel, which clipped any palette brighter than mid-grey back to plain texture — why the Iron Hills read brown. Now, all procedural (value-noise fbm, no new texture units): `layPatch` pushes each present layer up/down by its own low-frequency noise and renormalises (grass/bare-earth patches, sand drifts; albedo AND normals use the patched weights); `layTwo` blends a second sample at 2.7× scale rotated 37° by noise (anti-tiling — ⚠️ this is the cost the perf pass removed: up to 2 albedo fetches per present layer, normals still one; watch F3); the biome's HUE (chroma over its luminance) tints ground ×0.38 and rock ×0.18, luminance steer capped as before; tone 0.74–1.10 and warm/cool drift at ~90 m scale, damp hollows (−28%), scree band at the flat→cliff transition (−22%), fine grit. Verified headless in forest, desert, Iron Hills, tundra, steppe: compiles, no errors.

---

## ⚠️ MOB MODELS REBUILT — one smooth skinned body per creature (owner: "improve the mob 3d models, they are so shit")
`rendering/Fauna.js`. The expansion animals were an ellipsoid on four sticks; a second rigid attempt (swept parts + joint balls) still read as a doll — separate shells always show seams. Now each animal is a **signed-distance body** (round-cone flesh per bone, smooth unions — wide for barrel→haunch, tight at knees), meshed ONCE per species with the hand's surface-nets mesher (`Hand.js` now exports `roundCone`, `smin`, `surfaceNets`), **skinned** to a real `THREE.Skeleton` (2 bones/vertex by nearest flesh), vertex-painted (dark back → pale belly, speckle, per-species marks: spots, rosettes, stripes, dorsal line, mask, pale muzzle, socks, tail flag/tip, glow belly, hoof/pad colour at the feet) under a shared FUR material (object-space normal grain + speckle). Ears, eyes, nose pad, snout disc, beak, beard, tusks, teeth, antlers, horns, scutes/crest, bristle ride on bones. Skeleton: root/spine/neck1/neck2/head/jaw/tail0-2 + 3 bones per leg in an anatomical rest pose (hind hock bends back); feet on y=0 by construction. Animation drives bones (stride with reach/plant/lift, gallop pitch, breathing, grazing to the ground, head-low charge, jaw on strike, ear/tail life; lizards sway).
- Species (13): deer, elk, goat, boar, antelope, strider (now a long-legged marsh grazer — the beaked spider-legged one was broken), wolf, bear, jackal, lynx, karst_stalker, gator, cinder_salamander. Per-species `slim`, leg lengths, head keys tuned from studio renders.
- Monsters on the same technique (`skinned(key, def, mat)`): Rust Crawler (plated, banded, six legs, chitin material), Bog Horror (mossy peat heap, bone inclusions, four 5-bone lashing arms), Pale Grub (ringed maggot that wriggles). Centipede, wisp, glass sentinel and the original five beasts unchanged.
- Cost: 10k–38k triangles per creature (one SkinnedMesh + small attachments); meshing 0.05–0.4 s per species, ONCE — `prewarmFauna()` meshes all species in idle callbacks after the game starts. ⚠️ Ask for F3 p95 in a busy biome.
- Verified: studio renders (neutral light, two angles) of every species and the three monsters; in-game walking line-up at night; no console errors. NOT verified: feel at real frame rates; KayKit faction humanoids are unchanged (chibi models, as the owner asked earlier).

---

## MODEL REVISION OF EVERYTHING (beasts, props, metals)

Owner: "take a complete run through and model revision of everything".

### Beasts — `rendering/Bestiary.js` (new)
The seven original beasts are single skinned SDF bodies now (same
technique as `Fauna.js`, whose `skinned` / `glowMat` / hash helpers it
imports). Registered in `Creatures.js` `CREATURE_BUILDERS`; the old
primitive builders stay in Creatures.js as reference, unregistered.
- spider (8 × 3-bone legs, fangs, 8 eyes, abdomen spines), slime
  (translucent gel, skull/ribs/core suspended), dragon (5-bone neck,
  hinged jaw, 8-bone tail, membrane wings on wing bones, ridges),
  sandworm (9 segments, mound, 4 toothed mouth petals that open on
  windup), blind_crawler (13-segment centipede), ice_elemental and
  obsidian_sentinel (flat-shaded low-res crystal skin, shards, blades).
- Every one is still TINTED BY ELEMENT (`m.shell.color`) and keeps a
  mesh named `core`. Checked: 7 beasts × 3 elements animate through
  none/windup/strike/none with no NaN bones and a core present.
- ⚠️ Rigid attachments must not reuse a `vertexColors` material — an
  uncoloured mesh renders black (the ice shards did). Give them their
  own plain material.

### Weapon metals — `rendering/Arms.js`
`buildArm(key, element, tier, seed, metal)`. `METAL_LOOK` repaints the
blade (`metalPart: 'blade'`), edge (`'edge'`) and forged iron heads
(`'head'`); fittings stay as built. Steel = unchanged default. Metal is
threaded through `forgeWeapon(…, metal)`, `Player.equipWeapon` (emits
it on PLAYER_EQUIP_WEAPON), the viewmodel descriptor (`mem.metal`), the
preview panel and GearHalo; `forgeWeapon` also infers it from seeds like
`mithril_sword`.

### Props — `rendering/Sculpt.js` (new) + `PropForge.js`
Sculpted (SDF, meshed once at unit size, cached, scaled): rib,
vertebra, god skull, chasm spires, drowned pillar, broken colossus,
monolith, cave mouth, headstone, gate posts, rubble. Built geometry:
stone arch and descent gate (wedge voussoirs on piers; gate sheet is
arch-shaped, still named `gate_sheet`), ashlar wall segment (merged,
one draw call), lathed brazier (`brazier-fire`/`brazier-light` kept),
laid-stone well with windlass and gable roof, wreck with curved frames
and strakes, stall with sagging canopy and goods. Ruin columns use the
pillar sculpt.
- `prewarmSculpts()` meshes them one per idle slice DURING THE LOADING
  BAR (main.js, next to `materialLibrary.load`). Headless timings:
  ~1.6 s total, skull ~0.56 s alone — it must not move to gameplay.
- Tris after the resolution pass: skull 62k (one per region), statue
  54k, ruin 69k, cave 42k, monolith 22k, vertebra 21k, rib 16k, gate
  15k, wall 13k, pillar 10k, headstone 8k.
- ⚠️ SDF carving trap (hit twice): carve grooves only near the surface
  — `d = max(d, -max(groove, -(d + depth)))`. An unbounded subtract
  deleted the skull's whole face and cut the monolith in two.
- `__mz.PropForge` is exposed (dev handle): render props from the LIVE
  instance; a dynamic import gets a separate instance whose
  materialLibrary never loaded (untextured, misleading renders).

### Not done / not verified
- Keep, tower and colossal wall were judged acceptable and NOT rebuilt.
- KayKit humanoids still chibi-styled (owner's choice; a style clash
  next to the new beasts — worth a decision).
- Studio renders only (headless, SwiftShader); nothing seen on a real
  GPU in-game. PERF UNMEASURED — the sculpted props add real triangles
  (above). Owner: please send F3 p95 in Godgrave (bones), the Dreaming
  City (statues) and a ruin-heavy area.

---

## LAG + "SEEING INSIDE MYSELF" (fixed)

Owner: "it is very laggy, and whenever I am walking the 3d model
overlaps the camera… like I am seeing inside myself".

### The view blocker — NEGATIVE dt (core/Engine.js)
Not the body. Raycasts from the camera hit the VIEWMODEL weapon, scaled
−54 → −8 over a few seconds. `start()`/`resume()` stamp `lastTime` with
`performance.now()`, but the rAF timestamp is the frame's START time;
after a long blocking task it was ~2.5 s EARLIER, so dt ≈ −2.5. That
ran WeaveVFX.materialise's ease at t ≈ −4.5 (scale −42×: a giant
inverted sword over the lens) and drove the fixed-step accumulator
2.5 s negative (physics/movement frozen — part of "laggy").
- Engine: `if (!(dt > 0)) dt = 0;` after the MAX_DELTA clamp.
- WeaveVFX: materialise `t` clamped to 0..1 as well.
- Verified headless: weapon scale stays 1.19–1.38; walking frames clear.

### The body at the lens (entities/Player.js `_clipBodyAtLens`)
Name-hiding only removed head/helmet; torso/collar/cape/arms stayed
(and the realistic body is one mesh). Every body material is CLONED
(KayKit mats are shared with enemy knights) and gets a fragment discard:
within 0.35 m of the camera, or ≤0.5 m below eye height within 0.55 m
horizontally. Legs still visible looking down; shadow pass unaffected.

### Lag — measured (headless, low tier, same walk, per frame)
| | before | after |
|---|---|---|
| draw calls | 1,844 | 902 |
| triangles | 2.30 M | 0.61 M |
| shadow casters | 508 | 226 |
- The big one was MINE (last round): sculpted ruin columns at full res
  at every range — 137 × 10.2k tris = 1.4 M. Now every sculpt is a
  `THREE.LOD` (`Sculpt.sculptLOD`, levels q = 1 / 0.45 / 0.2 ≈ 100% /
  20% / 4% of tris; switch at size×4+8 m and size×12+20 m). LOD levels
  cast no shadow unless the prop's own traverse turns it on (ruins,
  monoliths, headstones cast none by design). Prewarm meshes all three
  levels during loading.
- `PropForge.mergeStatic(g)`: static unnamed parts merged into one mesh
  per material (brazier was 22 meshes, keep 111, tower 48…). Skips
  named meshes (`brazier-fire`, `gate_sheet`), lights, LODs, transparent
  parts. ⚠️ If you add a prop part that must be found/animated later,
  NAME it or it will be merged away.
- No shader compiles during play (logged 0 new programs over a walk);
  the 17.8 s of `getProgramInfoLog` in the CPU profile is the driver
  finishing the load-time precompile on first use (SwiftShader-slow).
- Still always-on: first-person hand 67k tris, moon 96k.
- NOT measured on a real GPU. Owner: F3 p95 please, same three places.

---

## TERRAIN BOUNDARIES: stutter + phasing through the ground (fixed)

Owner: "laggy boundaries when terrain shifts… doesn't allow you to
properly transition… sometimes lets us phase through the terrain".

Measured with a streaming simulation (render loop stopped; player moved
along a ~1.6 km line, `cm.update` + `drainChunkQueue(6)` per simulated
60 fps frame; 26 chunk crossings, 7–8 biomes). Script pattern: scratchpad
`chunks2.mjs`.

1. **Phasing = standing on the function, not the mesh.** `getGroundY`
   evaluated the exact terrain function; the mesh is that function on a
   grid drawn as flat triangles. Measured gap: mean 0.8 m, p95 2.7 m,
   max 17.8 m (cliffs). Sanctuary chunks also clamp their mesh to y ≤ 3
   after generation, which the function never knew. Now
   `ChunkManager.getMeshGroundY(x,z)` interpolates the chunk's own
   triangle (same b–c diagonal as TerrainGenerator's index order) and
   `getGroundY` RETURNS IT wherever a chunk mesh exists; the exact
   function is `getTrueGroundY`. Verified: ground vs drawn = 0.00 m at
   every sample. Player, enemies and props all stand on what is drawn.
2. **Coarse terrain under the player.** LOD upgrades ran ONE per chunk
   crossing, so up to 4 chunks around the player stayed at ¼ res for
   many crossings. Upgrades now drain under the frame budget, nearest
   first (and always one if the player's own 3×3 is coarse). Coarse
   chunks in the 3×3: mean 0.01 (momentarily 4 right at a crossing).
3. **Boundary stutter.** `_loadChunk` built terrain + every decoration
   generator in one frame. It is STAGED now: terrain + water at once,
   then each decoration group is a step in `_decoQueue`, drained a step
   at a time under the same budget; `CHUNK_LOADED` fires when the last
   step lands. `_flushDeco()` runs before realm stashing/rebuilds;
   `isStreaming` includes pending decorations (boot builds the hub
   fully). Result: worst streaming cost in any frame 11.7 ms (was a
   30–70 ms frame per new chunk), chunk terrain stage ~1.1 ms, deco
   steps ~0.2 ms.
- ⚠️ Anything that needs a chunk's props must listen for CHUNK_LOADED,
  not assume they exist right after `_loadChunk`.
- Not verified on a real GPU / at real frame rates — owner's F3 p95
  while running across biomes is the number that matters.
