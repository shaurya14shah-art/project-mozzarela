# Shadow Slave Fidelity — research findings and evolution plan

**Status: research + proposal. No code changed.** Three parallel audits:
weapon-mesh code, terrain/realm code, and Shadow Slave canon (pulled from
the Fandom wiki via `api.php`, which works where normal fetching is blocked).

Read `HANDOFF.md` §0 (trap list), §3 (house style) and §4 (rendering)
before acting on any of this. Every proposal below is costed against
those constraints, not invented free.

---

## 0. THE CORRECTIONS — canon says otherwise

Four things this project believes are Shadow Slave, and are not. Each
was checked by full-text search across the wiki's 2,895 pages.

### 0.1 ⚠️ THE BROKEN MOON IS NOT A SHADOW SLAVE MOTIF

`HANDOFF.md` §7 "THE BROKEN MOON — the Shadow Slave pass, part one"
opens: *"a colossal shattered moon over a dead world"* and calls it
**"the single defining image"**. Zero wiki hits support this. The only
"broken sky" in canon is one line about True Bastion, and it describes
an unmasked illusion, not a celestial body.

**What canon actually says about the moon** (Moonlight Shard lore): the
stars were extinguished and fell; a lone moon remained in an empty sky;
with no sun to shine on it, it **grew dim, withered, and died**.

So the emblem is a **dead, withered moon in an empty starless sky** —
not a shattered one. That is a *smaller, dimmer, colourless* disc, which
is nearly the opposite art direction from the current 23°-wide
fractured body.

⚠️ **Do not delete the broken moon on the strength of this alone.** It
is well built (correctly composited as a replace, fixed direction,
costs nothing), the owner asked for it, and it works as a landmark.
Three options, in the order I'd recommend them:

1. **Keep it and make it diegetic** — this world is canonically a
   *patchwork of shattered realms, each with its own sky and its own
   number of moons*. A broken moon over one region is then correct by
   construction, and the patchwork rule (§6.7) becomes the fiction that
   justifies it.
2. Re-grade it toward the canon emblem — dimmer, greyer, smaller —
   and lose the landmark quality.
3. Leave as-is and accept it as an original flourish.

Option 1 costs the least and buys the most: it turns a continuity error
into the world's central rule.

### 0.2 The named weapons in the brief do not exist

| asked for | canon status |
|---|---|
| Gil / the Nether Blade | no page, no text hit |
| Fang of Nine Hells | no hit |
| Saint Bloodwalker armour | no hit |
| Antikythera mechanism | no hit |
| Sword of the Morning Star | no hit |

Sunny's signature black blade is the **Soul Serpent in Soul Weapon
form** — see §1.2. The real named-gear list is far richer than the
invented one and is reproduced in §1.

### 0.3 Six of the ten realm region names are invented

`src/data/realm.js` ships: Bottomless Pit, Sea of Sand, Cold Fortress,
Bone Crypt, Barren Coast, Valley of Sleep. **None are canon.** Canon
near-equivalents, all with real described geography:

| current (invented) | canon replacement | what it actually is |
|---|---|---|
| The Bottomless Pit | **The Abyss** / the Underworld's lower stratum | chasm below the Hollow Mountains |
| The Sea of Sand | **Nightmare Desert** (Hell of Ariel) | white dunes, azure sky, black pyramid |
| The Cold Fortress | **Bastion** or **True Bastion** | ringed artificial mountain on a lake |
| The Bone Crypt | **Bone Ridge** | leviathan skeleton, spine as a road |
| The Barren Coast | **Sea of Ash / Ashen Barrow** | grey drained coral → ash waste |
| The Valley of Sleep | **Nether's City** or **the Dark City** | weathered stone city on a crater rim |

⚠️ Renaming regions is cheap in `realm.js` and expensive everywhere a
quest, save or chronicle entry references an id. Rename the **labels**,
keep the **ids**, unless a grep says otherwise.

### 0.4 "The Dreaming City" is really the Eternal City, and it is METAL

The current `DREAMING_CITY` biome is terraced grey rock with broken
stone statues. Canon's Eternal City is **silver spires on smooth black
glass at the bottom of an ocean**, under an invisible dome, and its
palace is **cast from metal with no seams** — no brick, no stone, no
frame — resembling *"a titanic organ built from countless hollow
pipes."* Interiors read as *"the metal bowels of a giant, dead beast."*

This is the single largest gap between the game and the book: the
project built a ruined **stone** city where canon has a pristine
**metal** one.

---

## 1. WEAPONS — canon, current state, and the plan

### 1.1 The current state, measured

Full audit in the session transcript; the load-bearing facts:

- The entire weapon vocabulary is **six primitives**: Box, Cylinder,
  Cone, Torus, Octahedron, plus one hand-rolled 21-vertex diamond
  (`_bladeGeometry`, `EntityForge.js:1817`). No lathe, no extrude, no
  swept tube, no boolean.
- **`greatsword` is `plan_wpn_sword` then `g.scale.setScalar(1.55)`**
  (`EntityForge.js:1968`). Zero unique geometry on the most cinematic
  weapon in the game.
- **Curves are faked by stacking boxes**, on exactly the two weapons
  whose identity is a curve: the scythe blade is 5 `BoxGeometry` chunks
  in a fan with visible mitre gaps (`:2237`); the bow's string is a
  straight `Box(0.006, …)` that does not meet its own limb arc
  (`:2085`).
- **Tier is one colour lerp** (`0x352a18 → 0x5c6066`, `:1529`) plus a
  gem that grows and gains prongs. **Element is one octahedron**, in
  the same place on every weapon.
- `GeoForge`'s `displace` / `weather` / `pool` / `pick` are proven on
  props and called by **zero** weapons. Objects held 30 cm from the
  lens are the only mathematically perfect surfaces in the game.
- `MaterialLibrary` has `metal` and `wood` PBR sets **already loaded in
  memory**, and `applyTriplanar` needs no UVs by construction. Zero
  weapon call sites.
- **No geometry cache for weapons at all** — `PropForge.geo()` is
  module-private, so every equip / preview / halo rebuild allocates
  fresh `BufferGeometry`.

### 1.2 What canon gear actually looks like

**Soul Serpent (Soul Weapon form)** — a **black-bladed odachi, as long
as its wielder is tall including the hilt**, surprisingly light. Almost
invisible on the dark steel, **a lifelike coiling serpent is etched
into the blade**. Via `[Serpentine Steel]` it becomes any weapon its
owner knows well; fidelity scales with how precisely they can imagine
it. `[Formless]` first **collapses it into a mass of liquid darkness**
before it reshapes.

**Sin of Solace** (Transcendent) — straight double-edged greatsword,
narrow guard, **light as a feather**; hilt of **black obsidian**, blade
**stark white with etched patterns**. Touching the cool hilt produces
**a whisper just below the threshold of words**.

**Midnight Shard** — austere **tachi, 70–80 cm**, bright lustrous metal,
polished black wood hilt. *"Forged from the shard of a fallen star."*

**Moonlight Shard** — slender dagger tapering to a **needle point**,
simple cross-guard, glossy black wood handle, **seemingly forged of
clear misty glass**; nearly invisible in darkness.

**Blessing** (Nephis's god-slayer) — narrow flawlessly straight blade
**gleaming nearly blinding in sunlight**, **ivory hilt**, **simple
elegant design with no unnecessary embellishment**; aura simultaneously
cold and scorching.

**Mirror of Truth** — round dark-silver hand mirror, front **like a
pool of still mercury**, and it **visibly cracks as it degrades**.

**Undying Chain** (armour) — **lusterless bleak steel**, few gaps,
chainmail beneath, and **a featureless helmet mask with only several
vertical slits cut for vision**. Fits like a second skin.

**Mantle of the Underworld** — **onyx armour** whose runes are
**partially eroded and unreadable**: *"M… Un…old"*.

**Weaver's Mask** — **black lacquered wood carved as a demon's face**,
**four protruding fangs**, **three twisted horns like a crown**, and
inside the eye chasms, nothing but darkness.

**Shadow Lantern** — palm-sized, black material **resembling stone more
than metal**, engraved so it **looks and feels like serpent scales**,
walls of **glossy black morion**. On appearing, **the surrounding night
instantly becomes deeper, colder and impenetrable.** A lantern that
emits darkness.

### 1.3 ⚠️ THE RULE THAT INVERTS THE CURRENT TIER SYSTEM

**Ornament runs INVERSE to rank at the top end.** Blessing is
explicitly praised for eschewing embellishment. Sin of Solace is a
plain white blade. The Crown of Dawn is *"a simple band of metal."*
Meanwhile Awakened-rank junk gets fussy — twisting guards, engraved
chalices, coral gems.

**Ancient is not encrusted. Ancient is perfect, minimal, and slightly
wrong.**

The game currently does the opposite: `_weaponAccent` (`:1552`) makes a
Divine weapon by **adding** a bigger gem, then prongs, then a halo ring.
That is a JRPG loot ladder, not this book.

### 1.4 ⚠️ RANK AND TIER ARE TWO AXES, AND THE GAME COLLAPSES THEM

Canon separates them completely:

- **Rank** (7: Dormant → Awakened → Ascended → Transcendent → Supreme →
  Sacred → Divine) = **quality / potency**.
- **Tier** (I–VII) = **the Class of the creature that left the Memory**,
  and it caps **how many enchantments the weave can hold**.

And the visual: **every Memory contains a bright ember at the heart of
its weave — the anchor the strings are structured around. Tier-I has
one ember. Higher tiers have several.**

That is a *countable* tier readout, straight from the text. It maps
onto this project better than anything invented:

| axis | canon meaning | proposed engine mapping |
|---|---|---|
| **Rank** | potency | **light behaviour + material purity**, and ornament goes DOWN |
| **Tier** | enchantment capacity | **ember count** in the weave, and ornament goes UP |

A high-Rank low-Tier item is sublime but plain. A low-Rank high-Tier
item is busy, encrusted and cheap. That single sentence gives the forge
two readable, opposed visual dials where it currently has one.

Proposed Rank → light ladder (INFERENCE, not canon):

| rank | the object |
|---|---|
| Dormant | inert matter, no sheen |
| Awakened | faint sheen |
| Ascended | subtle internal glow |
| Transcendent | bends light around it; impossibly light or dark |
| Supreme | visibly alters its surroundings (cf. the Shadow Lantern deepening the night) |
| Sacred | interferes with causality — distort the frame itself |

### 1.5 The weapon-model plan, in dependency order

**Phase W1 — the missing primitive (unblocks everything else).**
`GeoForge` has no swept-curve builder, and the bow's own comment at
`EntityForge.js:2063` says so: a `TubeGeometry` *"would need a curve
nobody else in this file builds."* Add **`sweptProfile(curve, profileFn,
stations)`** — a profile swept along a `CatmullRomCurve3`, section
scaled per station. One helper fixes the scythe's mitre gaps, the bow's
limbs and string, the Soul Serpent's coil, and every future curved
blade. It is the highest ratio of visual change to code in this list.

**Phase W2 — a real blade profile table.** `_bladeGeometry` is a linear
taper with 5 stations and no ricasso, no shoulder, no distal-taper
break, no clip point, no leaf or waisted profile. Replace the scalar
taper with a **per-type profile curve** (width and thickness sampled
along the length). Cost: same vertex budget, since stations are already
parameterised. This is what makes an odachi read as an odachi.

**Phase W3 — kill the greatsword-is-a-scaled-sword line.** Give it its
own plan. Canon reference is Sin of Solace: straight, double-edged,
**narrow** guard, white blade, obsidian hilt.

**Phase W4 — Rank/Tier split in `_weaponAccent`.** Embers (Tier) as N
small emissive nodes along the weave; Rank as material purity and light
behaviour, with ornament **decreasing** toward Divine.
⚠️ §3's "one emissive focal point per object" is a real house rule and
N embers challenges it. Resolve deliberately: either embers are the one
focal point *as a group* (tight cluster, one light), or the rule gets
an explicit documented exception. Do not just add N point lights —
`ChunkManager._updatePointLightBudget` exists because a shader
recompile cost 667 ms.

**Phase W5 — surface.** Call `weather({amount: 0.006})` on blades (free,
breaks specular), and wire `applyTriplanar` with the already-loaded
`metal` / `wood` sets. Stop hard-forcing `flatShading: true` on blade
and edge materials at HD (`:1531`, `:1548`) — every other material in
the game respects `FACET_ORGANIC()`.

**Phase W6 — etched identity.** The serpent etched into the Soul
Serpent, the eroded unreadable runes on the Mantle, the engraved scales
on the Shadow Lantern. All are *surface pattern carrying meaning*, and
the project already has a stroked-geometry ornament vocabulary in
`ui/Sigil.js` (§3 rule 4: "ornament is stroked geometry, never
texture"). An emissive-line etch along a blade is on-style and cheap.

**Phase W7 — manifestation.** Canon: **summoning has a visible delay**
— `[Unseen]` exists *specifically* to remove it, which means the delay
is the default and removing it is a rare enchantment. Build it
ember-first: motes ignite, strings unspool and knit the silhouette,
strings opaque into matter. Dismissal reverses, embers return to the
chest. `[Formless]` collapses to **liquid darkness** first.
⚠️ This replaces nothing — the removed Fracture Strike (`main.js:324`)
was a *combat* effect; this is an *equip* effect, and equip is
currently instant and silent.

**Two bugs found in passing, worth fixing regardless of this plan:**

1. **`userData.part = 'point'` is tagged on no mesh in the file.** Every
   thrust ability (skewer, impale, lunge, riposte, charge) falls back to
   the focus gem — and on a NEUTRAL weapon that gem does not exist, so
   it lights nothing at all. `'head'` is also missing from the
   warhammer, so `quake` on a warhammer lights nothing. This is
   trap #26's exact shape: *count the actives against their branches.*
2. **`plan_wpn_grimoire:2176` allocates an uncached
   `MeshStandardMaterial` on every forge** — a fresh shader program per
   equip, directly undoing the 100→20 dedup pass.

---

## 2. TERRAIN — canon, current state, and the plan

### 2.1 The current state, measured

- **The realm starts at `ring >= 7` ≈ 448 world units from spawn**
  (`BiomeManager.js:978`), but `realm.js`'s named regions sit
  **2,100–11,500 units out**. Between them the player walks Verdant
  Plains → Living Jungle → Glowing Grotto. Nothing gates, transitions
  or announces the realm.
- **Nothing has scale.** Max relief in the game is
  `TERRAIN_HEIGHT_SCALE 32 × heightScale 2.40 × 0.55 ≈ 42 units`.
  Godgrave's *entire* height range is **5.3 units**. The god's skull is
  **24 units** — a six-storey building — and appears once per region.
- **The Bottomless Pit rises.** `heightScale 1.70`, and the height
  stack has **no negative term anywhere**: `continent` is clamped
  `max(0, ·)` (`TerrainGenerator.js:641`). It is a bumpy plateau with
  four cones on it.
- **`hollowed` is geometrically a lie.** Terrain is a strict 2D
  heightmap — no caves, no overhangs, no negative space.
  `forgeCaveMouth` is a 7×9-unit black cylinder pressed against a slope
  with a `CircleGeometry` backstop behind it. No interior, no volume,
  no entry.
- **No water exists in the codebase.** No sea plane, no `WATER_LEVEL`,
  no shoreline mask, no wet/dry split. "Drowned" means props sunk 1.3
  units further into dry grey ground.
- **The five realm flags are read at exactly two call sites**
  (`ChunkManager.js:653`, `:658`) and do nothing but spawn one prop per
  three chunks. They do not touch height, fog, light, grade, audio,
  spawns or loot.
- **The Sanctuary owns the only real architecture kit.** `forgeKeep`,
  `forgeTower`, `forgeWallSegment`, `_buildCityHub` exist and are never
  used by the Dreaming City, which gets 6-part broken statues and
  8-part wall fragments that compose into nothing.
- **The sky is good and the ground never answers it.** Biome palettes
  are still saturated fantasy ramps (`0x7bbf59` grass, `0x00d8a8` cyan)
  under an ash sky.

### 2.2 The canon regions, with the detail that matters

**Godgrave.** A titanic skull on the slopes of the Hollow Mountains;
**one eye socket empty, the other socket, forehead and entire left side
shattered by a single blow.** The skeleton stretches **at least 5,000 km**;
the creature was **at least ten thousand kilometres tall**. Colour is
**sun-bleached bone**, apparently continuous white but **riddled with
cracks and fissures leading into deep hollows within the bone**. Below
the bones, **a sea of ash**. Accents: fields of **vibrant vermilion
grass**, **bloodred moss**.

⚠️ **The sky is the antagonist.** Godgrave has **no night and no dark**
— permanently veiled by cloud, light **grey and diffused**. But if the
veil tears, **the radiant white sky is revealed and everything beneath
it is erased and scattered as ash.** No exception, no salvation,
unpredictable timing.

⚠️ **Three traversal routes are three level types**: the ground under a
carpet of ash (deadliest things hide *beneath* the ash); **inside** the
bones through the great hollows, hidden from the sky; and **across the
surface** of the bone, exposed but with weaker inhabitants.

⚠️ **Everything grows at visible speed** because the sky may open at any
moment. A bare white plain is **teeming with life within an hour or
two.** The **Breastbone Hollow** is *"comparable in size to a modest
continent"* and holds a subterranean jungle: **colossal pillars of
abominable flora rising to the dome of the sternum**, bloodred moss
over everything, overgrown stone ruins beneath the canopy.

**Hollow Mountains.** *"Tall and jagged, piercing the skies like the
fangs of a giant dragon."* Thousands of kilometres long. **No sky at
all** — total white mist, and inside it **no colour, no sound, no
scent, no movement**; one realises one does not exist.

⚠️ **They are called hollow but they are FILLED** — with elemental True
Darkness. **The hollows are where darkness lives and where it comes
from.** The peaks are **enormous vertical caverns widening from top to
bottom.** Below: a quarry, mine tunnels with **intricate stone carvings
deeper down**, a **circular hall with a dark chasm at its centre "like
the gates of the Underworld,"** and at the bottom **an underground
river black as ink** with **a stone pillar and a beautiful boat of pale
wood tied to it.**

**Forgotten Shore.** The strongest palette in the book, and it is three
values with one accent: **somber grey sky / black earth / vibrant
crimson coral.** The Labyrinth is **multi-layered**, twisting **without
any logic**, dead-ending or looping, some paths entering *inside* coral
mounds as dark tunnels. The coral **is not coral**; it is speculated to
be **part of a single colossal living creature — a giant maw**.

**Bone Ridge**: a leviathan skeleton, **arching spine protruding high
above the ground**, **bones forming natural arches and palaces**,
**coral growing out of old bone like solidified rivers of blood**. Its
**cracked skull's upper jaw forms a cavernous cave**, and the **hollow
interior of the spine is as wide as a road — a highway in a tunnel lit
by shafts of light between vertebrae.**

**Sea of Ash**: the crimson **loses its colour** — coral turns grey,
misshapen, diseased, brittle — giving way to ash-grey wasteland,
**eerily quiet, utterly lifeless, not a single monster moving**, rising
to **a mountain of ash crowned by a giant black-barked tree with
blood-red leaves.**

**The Crater**: the whole island sits on the rim of a depression
**hundreds of kilometres in diameter**, and the Soul Tree's roots far
below **look like tiny blades of grass** against the abyssal wall.

**Eternal City** (the real "Dreaming City"). **Silver spires on smooth
black glass at the bottom of an ocean**, under a colossal invisible
dome, **completely intact and pristine**. The palace is **a dark mass
of sharp interconnected lifeless black spires**, **cast from metal with
no seams** — no brick, wood, stone or frame — resembling **"a titanic
organ built from countless hollow pipes."** Interiors are **smooth
metal corridors stretching endlessly**, **black mould and spores**,
debris resembling **broken esoteric machinery**, **no spaces fit for
mundane activity** — *"the metal bowels of a giant, dead beast."*

**Nightmare Desert.** The **brightest** environment in the series:
**blinding incandescent sun**, **flawlessly white sand**, **deep
cloudless azure sky "like an ancient ocean."** At night, two cursed
armies rise from beneath the sand. On the horizon, the **Tomb of Ariel
— a giant black pyramid appearing as a haunting mirage**, unreachable
by day. The survivors' camp is built around **five polished metal
towers in a semicircle, the shortest several dozen metres** — which are
**the five fingers of a steel gauntlet buried in the sand.**

**Underworld entrance** — the best single piece of architecture in the
book: a **dark fissure brimming with cold impenetrable darkness**,
framed by **pillars carved from black rock** under a **triangular
pediment of reliefs eroded into unclear shapes of dark wings.**
*"Rather than resembling a road descending into hell, the path to the
Underworld looked like an entrance to a temple."* The tunnel floor is
**jagged rock over white powder — bone dust** — thickening until the
whole tunnel is **carpeted in bone.** It opens into a spherical chamber
floored with **mounds of stone shards: the shattered remnants of
countless Stone Saints**, a broken head showing the contour of a brow,
a closed eye, a slightly parted mouth.

### 2.3 The ten rules that make a place read as Shadow Slave

1. **Everything is a corpse, and the corpse is the terrain.** Godgrave
   is a dead god you walk *inside*. Bone Ridge is a leviathan you drive
   through the spine of. Twilight is built on a living carapace. Bastion
   sits on a charred titan. The default answer to "what is this
   landmark made of" is **a dead thing, at a scale that stops reading
   as anatomy.**
2. **Colossal scale expressed through a small, wrong detail.** Not "the
   skull is huge" — *its left side is shattered by one blow*. Not "the
   crater is vast" — *the tree's roots look like blades of grass*. Not
   "the towers are tall" — *the towers are five fingers*. **Always
   establish scale with an object whose ordinary size the player
   knows.**
3. **Absence of green.** The only green in canon is inside a locket, a
   3 km meadow **drawn like a child's crayon picture**, where the world
   **turns into a crude painting** at the boundary. Green must be a
   shock, an artifact, or a lie.
4. **Three-value palettes, one saturated accent.** Grey sky / black
   earth / crimson coral. White bone / grey sky / vermilion grass.
   Silver light / black glass / nothing. **Never more than one hot
   colour per region.**
5. **Ruins whose faces were deliberately erased.** The Terror beheaded
   the Seven Heroes' statues and destroyed every depiction of their
   faces. The pediment reliefs eroded to unreadable wings. The Mantle's
   runes read *"M… Un…old"*. **Damage here targets identity, not
   structure.**
6. **The light is the antagonist.** Godgrave's white sky annihilates.
   The Shore's freed sun wiped out most life. The Lighthouse's silver
   radiance is **cold** and its island has **no shadows anywhere**,
   presented as horror. **Darkness is home; blinding white light is
   death.** The hero's top-tier item is a lantern that emits darkness.
7. **Patchwork skies. Never blend two biomes — cut hard.** Different
   regions have **different stars, different constellations, a
   different number of moons**, because the realm is a quilt of
   shattered worlds.
8. **Ash is the universal end-state**, and the deadliest things hide
   beneath it.
9. **Everything has a name and a parable.** Every Memory carries a
   short bracketed story. Nothing is "Iron Sword +2." Extend this to
   landmarks.
10. **Mirror-symmetry between holy and profane.** Seven ascending ranks
    and seven descending ones. Design every monster as **the inverse of
    a saint**, and every sanctuary as a cage.

### 2.4 The terrain plan, in dependency order

**Phase T1 — a negative term in the height stack.** Everything else
about the Pit, the Crater, the chasm and the Hollow Mountains' vertical
caverns is blocked on this. `continent` is clamped `max(0, ·)` and no
layer subtracts. Add a **carve field**: a warped ridged mask multiplied
by a per-biome `carveDepth`, applied after the stack and before
`flattenFactor`.
⚠️ Costed in noise reads per vertex. `getGroundY` is the hottest
function in the game (§4). Gate it exactly the way `mountainFactor` is
early-outed at `:658` — `carveDepth <= 0.004` returns immediately, so
21 of 27 biomes pay nothing.
⚠️ The rendered mesh must still agree with `getGroundY` to 1e-6, and
the previous terrain pass verified this explicitly. Re-verify.

**Phase T2 — the realm must start where the map says it does.**
`ring >= 7` (448u) versus regions at 2,100–11,500u is the single
biggest structural incoherence in the world. Options: move the ring
threshold out to meet the map, or — better, and canon-supported by
rule 7 — **make the realm boundary a hard cut**, not a climate ring.
A patchwork world does not fade from jungle to bone; it changes at a
line. `realmRegionAt` already returns a normalised distance, so the
feather is a one-constant change (`EDGE_FEATHER = 0.22`).
⚠️ Trap: `getBiomeWeights` bilinear-blends four samples. A hard cut in
selection still blends in the mesh. The cut has to be honoured in the
weight function too, or the boundary reappears as a 50-unit smear.

**Phase T3 — scale.** Godgrave's 5.3-unit total relief cannot hold a
5,000 km skeleton. The bones are the relief — that was a deliberate
decision (`heightScale 0.30`, "hills would compete with them") and it
is right. What is wrong is the **bone scale**: ribs at 16–32 units and
a skull at 24 against a keep of 13. Canon's move (rule 2) is to make
the *anatomy* stop reading as anatomy — a rib should be a **landform**
you path around, not a prop you walk past. Target the skull at 120–200
units and gate it behind LOD, or accept it as a distant silhouette
only.
⚠️ This collides with `renderDistance` clamped to 1 in realm mode
(`ChunkManager.js:181`). A 200-unit landmark inside a 64-unit chunk
with a 1-chunk render distance pops in at 3 chunks' notice. Landmarks
of this size need their own far-field draw, separate from chunk
streaming — this is a real architectural piece of work, not a constant.

**Phase T4 — the flags must do more than spawn a prop.** All five are
read at two call sites. Each should publish a **factor** (never assign
a field — trap #9) into: fog density and colour, the light rig, the
grade, the ambient audio bed, and the spawn table. `Atmosphere` already
has the single-writer factor contract (`setBiomeFog`, `setUnease`,
`setDescentTint`), so this is following an existing pattern rather than
inventing one.

**Phase T5 — the antagonist sky (Godgrave).** The highest-value single
feature in this whole document, because it is a *mechanic and a
palette and a story* at once: the veil tears, the white sky is
revealed, everything beneath is erased as ash. It gives Godgrave a
reason to have cover geometry, a reason to move, and a light source
that kills. It also inverts the genre exactly as rule 6 demands.
⚠️ It needs `Atmosphere`'s exposure and key-light path to accept a
short violent excursion, and the existing single-writer contract makes
that safe to add.

**Phase T6 — water, for the Shore.** No sea plane exists. This is a
genuinely large piece (plane, shoreline mask in the height field,
wet/dry colour split, audio) and it is the prerequisite for
`drowned` meaning anything.

**Phase T7 — the Eternal City in metal.** Reuse `forgeTower` /
`forgeWallSegment` / `_buildCityHub` — the modular kit the Sanctuary
already owns — retargeted to **seamless black metal spires** with the
`metal` triplanar set, and composed into **streets and islands**
instead of scattered one-per-three-chunks. Canon's "no seams, no brick,
no frame" is *easier* to build than masonry, not harder: it removes the
band/quoin/corbel vocabulary rather than adding to it.

**Phase T8 — palettes.** Re-grade every realm biome to three values and
one accent (rule 4). Godgrave: bone white / grey / **vermilion**. Shore:
grey / black / **crimson**. Eternal City: silver / black glass /
nothing. This is a table edit and the cheapest visual win in the
document.
⚠️ Incidental bug found: Celestial Peaks' `low` is `0x2030508` — seven
hex digits, the same class as the Astral Highlands bug already fixed at
`BiomeManager.js:486`.

---

## 3. RECOMMENDED ORDER

Ranked by (visual change) ÷ (cost), respecting dependencies:

| # | item | phase | why first |
|---|---|---|---|
| 1 | Realm palettes to 3-value + accent | T8 | table edit, changes every frame in the realm |
| 2 | `sweptProfile` in GeoForge | W1 | one helper unblocks scythe, bow, and every curved blade |
| 3 | Rank/Tier split, ornament inverted | W4 | fixes a system-wide misreading; mostly table work |
| 4 | Fix `'point'` / warhammer `'head'` tags | — | live bug, minutes to fix |
| 5 | Hard realm boundary | T2 | closes the biggest world incoherence |
| 6 | Negative carve term | T1 | unblocks Pit, Crater, chasms, vertical caverns |
| 7 | Godgrave's antagonist sky | T5 | the single most on-brand feature available |
| 8 | Per-type blade profiles + greatsword plan | W2/W3 | | 
| 9 | Weapon surface: `weather()` + triplanar | W5 | cheap, and weapons are the closest objects to the lens |
| 10 | Flags publish factors | T4 | makes the realm feel different, not just look different |
| 11 | Manifestation VFX | W7 | high impact, but new system |
| 12 | Landmark far-field draw | T3 | real architecture work |
| 13 | Water | T6 | large |
| 14 | Eternal City in metal | T7 | large |

---

## 4. OPEN QUESTIONS FOR THE OWNER

1. **The broken moon** — keep as a patchwork-region sky (recommended),
   re-grade toward the canon dead moon, or leave alone? §0.1.
2. **Region names** — adopt canon names (Bone Ridge, Nightmare Desert,
   the Abyss, Sea of Ash), or keep the invented ones? §0.3.
3. **Is Godgrave's killing sky wanted as a MECHANIC** (periodic,
   forces you into cover) or only as a visual event?
4. **How far can the Eternal City diverge from the current Dreaming
   City?** Canon says pristine metal; the game has ruined stone. This
   is a rewrite of a biome, not a tweak.

## 5. SOURCES

Canon extracted from `https://shadowslave.fandom.com/api.php` — pages:
*Memory, Aspect, Flaw, Shard Memory, Soulbound Weapon, Nightmare
Creatures, Shadow (Creature), Shadow Dance, Shadow Saint, Shadow
Slayer, Soul Serpent, Nightmare (Black Steed), Marvelous Mimic,
Sunny/Memories, Nephis/Memories, Cassie/Memories, Effie/Memories,
Kai/Memories, Jet/Memories, Mordret/Memories, Dream Realm, Godgrave,
Hollow Mountains, Forgotten Shore, Dark City, Bright Castle, Nightmare
Desert, Underworld, Eternal City, Bastion, Twilight.*

⚠️ The wiki is a fan compilation that paraphrases the prose. Quotes
above are quotes **of the wiki**, not guaranteed verbatim Guiltythree.
For a true mood board, pull the cited chapters directly.
