// ══════════════════════════════════════════════════════════
// Entity Forge — creatures built from what they're made of
//
// The old models were BoxGeometry stacked into humanoids, which is
// exactly the look this rebuild exists to kill. Nothing here is a
// box unless a box is the right shape.
//
// The rule: a creature's silhouette comes from its ARCHETYPE, and
// its surface comes from its ELEMENT. A fire golem and an ice golem
// share a body plan and read as completely different materials.
// Every creature carries one emissive core whose colour is its
// dominant element and whose brightness is its live strain — so you
// can see a composition approaching detonation from across a field,
// without a health bar.
//
// Build rules followed throughout:
//   · A body is a GROUP of 4+ primitives, never a single mesh.
//   · Materials vary on purpose: a dull rough shell, a metallic
//     accent, and exactly one emissive focal point.
//   · Silhouette does the work, not polygon count.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { buildCreature } from './Creatures.js';
import { quality } from './Quality.js';
import { ELEMENTS, ELEMENT_COLORS } from '../data/constants.js';
import { modelLibrary } from './ModelLibrary.js';

// ⚠️ roundedBox is used by the grimoire and warhammer plans. A missing
// import here does NOT fail the build — the call sites are only
// reached when that weapon is actually forged, so it would have shipped
// as a ReferenceError the first time a player equipped one.
import { seg, icoDetail, roundedBox, displace } from './GeoForge.js';
import { materialLibrary } from './MaterialLibrary.js';
import { buildArm as buildArmModel, ARM_TYPES, ARM_METALS } from './Arms.js';
import { leatherMaterial } from './Hand.js';
// Registry keys in src/data/generatedModels.js are capitalized
// ("model:Knight", "model:Skeleton_Warrior") — registry keys now carry
// a category prefix (model:/item:/prop:) since embed-models.mjs grew
// to scan three source directories, not just one; this is the single
// source of truth for those strings so a typo anywhere below is a
// ReferenceError, not a silent null lookup.
const MODEL_KEY_KNIGHT = 'model:Knight';

const hex = (css) => parseInt((css || '#888888').replace('#', ''), 16);

// ── ELEMENT SURFACES ──────────────────────────────────────
// How a material behaves, per element. This is where a fire thing
// stops looking like an ice thing.
// Light pass for tonal consistency with the (now grimed) real models.
// ICE, LIGHT and WIND were pulled off pastel/toy-bright in an earlier
// round of this same pass and are frozen — do not retune them again.
// This round pushes two more that still read too saturated/bright next
// to that trio: EARTH (was a lit khaki-brown, now a dead, dusty clay)
// and WATER (was a clean sky-teal, now a near-black drowned blue) —
// same "tarnished metal, bone, ash" direction as the style.css tokens.
// Everything else here (fire/lightning/poison/shadow/void/arcane/
// neutral) was already dark and desaturated and is left alone.
const SURFACES = {
  [ELEMENTS.FIRE]:      { rough: 0.85, metal: 0.05, emissive: 0.9, shell: 0x2a1208, flat: true  },
  [ELEMENTS.ICE]:       { rough: 0.10, metal: 0.10, emissive: 0.4, shell: 0x7ea3ad, glassy: true }, // was 0x9fd8ef — muted frost-slate, not sky blue
  [ELEMENTS.LIGHTNING]: { rough: 0.35, metal: 0.75, emissive: 1.1, shell: 0x3a3416, flat: false },
  [ELEMENTS.POISON]:    { rough: 0.95, metal: 0.00, emissive: 0.5, shell: 0x24361a, flat: true  },
  [ELEMENTS.SHADOW]:    { rough: 0.60, metal: 0.20, emissive: 0.6, shell: 0x140f1c, flat: true  },
  [ELEMENTS.LIGHT]:     { rough: 0.30, metal: 0.45, emissive: 0.8, shell: 0xa89870, flat: false }, // was 0xe8dcb4 — aged bone/parchment, not cream
  [ELEMENTS.VOID]:      { rough: 0.05, metal: 0.90, emissive: 0.7, shell: 0x0a0510, flat: false },
  [ELEMENTS.ARCANE]:    { rough: 0.25, metal: 0.60, emissive: 0.8, shell: 0x2a1d3d, flat: false },
  [ELEMENTS.EARTH]:     { rough: 1.00, metal: 0.00, emissive: 0.3, shell: 0x362c1f, flat: true  }, // was 0x4a4030 — dead dusty clay, not lit khaki
  [ELEMENTS.WIND]:      { rough: 0.40, metal: 0.15, emissive: 0.5, shell: 0x7c948c, flat: false }, // was 0x9fbdb4 — dulled sage-grey, not light mint
  [ELEMENTS.WATER]:     { rough: 0.15, metal: 0.10, emissive: 0.4, shell: 0x14293a, glassy: true }, // was 0x1c3f56 — near-black drowned blue, not clean sky-teal
  [ELEMENTS.NEUTRAL]:   { rough: 0.70, metal: 0.15, emissive: 0.4, shell: 0x3a3630, flat: true  },
};

function surfaceFor(element) {
  return SURFACES[element] || SURFACES[ELEMENTS.NEUTRAL];
}

// Every one of shell/accent/core's outputs is fully determined by
// `element` alone (12 possible values) — nothing per-instance. They
// were allocating a brand new MeshStandardMaterial on every single
// creature spawn regardless, so with a spawner constantly cycling
// enemies that's a steady stream of throwaway GPU shader program
// compiles, one of the least obvious but nastier sources of stutter.
// Capped at 12 elements × 3 roles = 36 materials, ever, for the life
// of the page — same pattern PropForge.js already uses for props.
const _matCache = new Map();
function cached(key, build) {
  if (!_matCache.has(key)) _matCache.set(key, build());
  return _matCache.get(key);
}

function shellMaterial(element) {
  return cached(`shell:${element}`, () => {
    const s = surfaceFor(element);
    return new THREE.MeshStandardMaterial({
      color: s.shell,
      roughness: s.rough,
      metalness: s.metal,
      flatShading: !!s.flat,
      transparent: !!s.glassy,
      opacity: s.glassy ? 0.82 : 1,
    });
  });
}

function accentMaterial(element) {
  return cached(`accent:${element}`, () => {
    const s = surfaceFor(element);
    return new THREE.MeshStandardMaterial({
      color: hex(ELEMENT_COLORS[element]),
      roughness: Math.max(0.05, s.rough * 0.4),
      metalness: Math.min(1, s.metal + 0.35),
      flatShading: !!s.flat,
    });
  });
}

function coreMaterial(element) {
  // NOT cached, unlike shell/accent above: animateCreature() mutates
  // .emissiveIntensity on this exact material every frame to render
  // that creature's live strain. Sharing one cached instance across
  // every creature of an element would sync their glow together —
  // one fire golem nearing detonation would make every other fire
  // creature on screen flash with it.
  const c = hex(ELEMENT_COLORS[element]);
  return new THREE.MeshStandardMaterial({
    color: c,
    emissive: c,
    emissiveIntensity: surfaceFor(element).emissive,
    roughness: 0.2,
    metalness: 0,
  });
}

// Element-independent tertiary materials. shell/accent/core above cover
// "this creature's substance" and "this creature's glow" — every plan
// below also needs a few parts that are neither: scavenged iron on a
// blade or rivet, old bone on a fang or horn, cured hide on a strap.
// Giving those their own flat, unglamorous materials (instead of
// reaching for shellMaterial() again out of convenience) is what keeps
// the one accent/core focal point actually reading as a focal point —
// everything mundane around it stays mundane on purpose. Cached once,
// shared by every creature and weapon, same reasoning as _matCache.
// `flatShading` is the single biggest contributor to the "robot" read
// on organic bodies: it forces one constant normal per triangle, so a
// low-poly limb becomes a visibly faceted prism no matter how it is lit.
// It stays ON at the `low` tier (artifact parity — the faceted look was
// the deliberate art direction there) and comes OFF at every HD tier,
// where the higher segment counts make smooth normals read as a curved
// surface instead of a soft blob.
//
// Iron keeps its facets at every tier on purpose: forged plate and
// blades SHOULD read as beaten flats catching light at angles. Bone and
// hide are organic and should not.
const FACET_ORGANIC = () => !quality.isHD;
const ironMaterial = () => cached('shared:iron', () => new THREE.MeshStandardMaterial({
  color: 0x33302a, roughness: 0.55, metalness: 0.6, flatShading: true,
}));
const boneMaterial = () => cached('shared:bone', () => new THREE.MeshStandardMaterial({
  color: 0x7d7669, roughness: 0.85, metalness: 0.0, flatShading: FACET_ORGANIC(),
}));
const hideMaterial = () => cached('shared:hide', () => new THREE.MeshStandardMaterial({
  color: 0x2b1f16, roughness: 0.95, metalness: 0.0, flatShading: FACET_ORGANIC(),
}));

// ── BODY PLANS ────────────────────────────────────────────
// Silhouettes. Deliberately non-humanoid where possible — a floating
// shard-cluster reads as "creature from a broken world" in a way a
// box-man never will.

// ── BODY PLANS ────────────────────────────────────────────
// Silhouettes. One plan per creature TYPE now, not per archetype —
// the old version had 11 creature types sharing 5 plans, so a goblin
// and a skeleton and a spider were the literal same mesh in different
// paint (all "stalker"), and a golem and an ice elemental were the
// same stacked-box body ("bulwark"). That's the actual reason the
// models read as bad: not polygon count, but three or four things on
// screen ever having a genuinely different shape.
//
// Design pass follows the standard low-poly method: one PRIMARY shape
// per creature (sphere for the slime, cylinder-stack for the worm,
// cone-veil for the ghosts, blocky prism for the golem...), a
// SECONDARY shape for accents, and every plan gets a black-silhouette
// gut check — if it isn't identifiable as a flat shape, the design
// failed regardless of material work on top.
// (github: low-poly readability — primary/secondary/forbidden shape method)

function plan_slime(g, el) {
  // Primary: sphere. A squashed, wobbling blob with drip-nubs at its
  // hem and two simple eye-dots — the least "creature-shaped" thing
  // in the roster on purpose, so it reads as ooze at a glance.
  // shellMaterial() is cached and shared across every creature of
  // this element — clone before mutating opacity, or every other
  // instance sharing the cache (and whichever of slime/wraith spawns
  // second) goes translucent with it.
  const shell = shellMaterial(el).clone();
  shell.transparent = true;
  shell.opacity = 0.85;
  const accent = accentMaterial(el);
  const iron = ironMaterial();

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.6, seg(12), seg(9)), shell);
  body.scale.set(1.15, 0.76, 1.15);
  body.position.y = 0.48;
  g.add(body);

  // Blisters — a handful of smaller overlapping bulges so the
  // silhouette isn't a perfect bead; actual ooze bulges unevenly.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const blister = new THREE.Mesh(new THREE.SphereGeometry(0.16 + (i % 2) * 0.05, seg(8), seg(6)), shell);
    blister.position.set(Math.cos(a) * 0.42, 0.36 + (i % 2) * 0.14, Math.sin(a) * 0.42);
    blister.scale.set(1, 0.7, 1);
    g.add(blister);
  }

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const drip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, seg(5)), shell);
    drip.position.set(Math.cos(a) * 0.48, 0.12, Math.sin(a) * 0.48);
    drip.rotation.x = Math.PI;
    g.add(drip);
  }

  // Sludge ring at the base — where it's actively eating the ground.
  const puddle = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, seg(5), seg(14)), shell);
  puddle.position.y = 0.05;
  puddle.rotation.x = Math.PI / 2;
  puddle.scale.set(1, 1, 0.6);
  g.add(puddle);

  // Swallowed scrap: a half-dissolved iron shard and a bleached bone
  // splinter suspended in the body — two dull, unglamorous materials
  // breaking up the wet shell, and a hint this thing has eaten before.
  const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.07, icoDetail(0)), iron);
  shard.position.set(0.2, 0.42, 0.05);
  shard.rotation.set(0.6, 1.1, 0);
  g.add(shard);

  const bone = boneMaterial();
  const splinter = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, seg(4)), bone);
  splinter.position.set(-0.18, 0.34, -0.14);
  splinter.rotation.set(1.4, 0.3, 0.8);
  g.add(splinter);

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.065, seg(6), seg(6)), accent);
    eye.position.set(side * 0.2, 0.64, 0.4);
    g.add(eye);
  }

  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, icoDetail(0)), coreMaterial(el));
  core.position.y = 0.52;
  core.name = 'core';
  g.add(core);
  return g;
}

function plan_skeleton(g, el) {
  // Primary: thin cylinders (bone). A gaunt ribcage lattice instead
  // of a solid torso, so light passes through it the way it should
  // for something that shouldn't be standing.
  const shell = shellMaterial(el);
  const accent = accentMaterial(el);

  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 1.05, seg(5)), shell);
  spine.position.y = 1.05;
  g.add(spine);

  for (let i = 0; i < 4; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.27 - i * 0.02, 0.022, seg(4), seg(8), Math.PI * 1.3), shell);
    rib.position.y = 1.4 - i * 0.16;
    rib.rotation.y = Math.PI / 2;
    rib.rotation.z = -0.6;
    g.add(rib);
  }

  const skull = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, icoDetail(0)), accent);
  skull.position.y = 1.78;
  skull.scale.set(0.9, 1.05, 1.05);
  g.add(skull);

  const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.16, seg(4)), accent);
  jaw.position.y = 1.62;
  jaw.rotation.x = Math.PI;
  g.add(jaw);

  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.045, 0.85, seg(4)), shell);
    arm.position.set(side * 0.32, 1.08, 0);
    arm.rotation.z = side * 0.22;
    arm.name = 'leg';
    arm.userData.leg = { side, idx: 0 };
    g.add(arm);

    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.98, seg(4)), shell);
    leg.position.set(side * 0.13, 0.42, 0);
    leg.name = 'leg';
    leg.userData.leg = { side, idx: 1 };
    g.add(leg);
  }

  const core = new THREE.Mesh(new THREE.TetrahedronGeometry(0.15, icoDetail(0)), coreMaterial(el));
  core.position.y = 1.18;
  core.name = 'core';
  g.add(core);
  return g;
}

function plan_goblin(g, el) {
  // Primary: stubby cone/cylinder. Small, hunched, wide bat-ears and
  // an oversized head on a squat body — reads as "quick and mean",
  // not "dangerous", from across a field.
  const shell = shellMaterial(el);
  const accent = accentMaterial(el);
  const iron = ironMaterial();
  const bone = boneMaterial();
  const hide = hideMaterial();

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.58, seg(6)), shell);
  torso.position.y = 0.72;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.27, icoDetail(0)), accent);
  head.position.set(0, 1.22, 0.05);
  head.scale.set(1, 0.9, 1.05);
  g.add(head);

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, seg(4)), accent);
    ear.position.set(side * 0.26, 1.3, -0.02);
    ear.rotation.z = side * 0.95;
    g.add(ear);
  }

  // Tusks — pale worn bone, not the elemental accent, so the mouth
  // reads as anatomy rather than another glowing surface.
  for (const side of [-1, 1]) {
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.13, seg(4)), bone);
    tusk.position.set(side * 0.09, 1.1, 0.24);
    tusk.rotation.x = Math.PI * 0.55;
    g.add(tusk);
  }

  // Scavenger harness — a strap, belt and pouch in cured hide, worn
  // gear layered over the shell rather than more skin/accent.
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.62, 0.32), hide);
  strap.position.set(0.02, 0.74, 0);
  strap.rotation.z = 0.55;
  g.add(strap);

  const beltRing = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.035, seg(5), seg(10)), hide);
  beltRing.position.y = 0.56;
  beltRing.rotation.x = Math.PI / 2;
  g.add(beltRing);

  const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.09), hide);
  pouch.position.set(-0.3, 0.5, 0.18);
  g.add(pouch);

  // Scavenged pauldron — a single asymmetric plate of scrap iron
  // strapped over the off shoulder. Deliberately lopsided (one shoulder
  // armoured, one bare) so it reads as looted gear, not a matched set.
  const pauldron = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, icoDetail(0)), iron);
  pauldron.position.set(-0.34, 0.98, 0);
  pauldron.scale.set(1, 0.65, 1);
  g.add(pauldron);

  // A trophy tooth on a cord at the belt — pale bone against dark hide.
  const trophy = new THREE.Mesh(new THREE.TetrahedronGeometry(0.045, icoDetail(0)), bone);
  trophy.position.set(0.28, 0.42, 0.2);
  trophy.rotation.set(0.4, 0.6, 0);
  g.add(trophy);

  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.52, seg(5)), shell);
    arm.position.set(side * 0.34, 0.8, 0);
    arm.rotation.z = side * 0.3;
    arm.name = 'leg';
    arm.userData.leg = { side, idx: 0 };
    g.add(arm);

    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.48, seg(5)), shell);
    leg.position.set(side * 0.15, 0.26, 0);
    leg.name = 'leg';
    leg.userData.leg = { side, idx: 1 };
    g.add(leg);
  }

  // Blade — scavenged iron, deliberately not the glow color. Keeps the
  // eyes and core as the only two things on this body that read as lit.
  const blade = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.46, seg(4)), iron);
  blade.position.set(0.46, 0.86, 0.14);
  blade.rotation.z = -0.65;
  g.add(blade);

  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, icoDetail(0)), coreMaterial(el));
  core.position.y = 0.84;
  core.name = 'core';
  g.add(core);
  return g;
}

function plan_spider(g, el) {
  // Primary: two stacked ovoids (abdomen + thorax) on eight thin
  // splayed legs. Low, wide, unmistakably arachnid.
  const shell = shellMaterial(el);
  const accent = accentMaterial(el);
  const bone = boneMaterial();

  const abdomen = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, icoDetail(0)), shell);
  abdomen.scale.set(1, 0.8, 1.35);
  abdomen.position.set(0, 0.46, -0.28);
  g.add(abdomen);

  const thorax = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, icoDetail(0)), accent);
  thorax.position.set(0, 0.48, 0.26);
  g.add(thorax);

  // Fangs — pale chitin, not the elemental accent, so the venom bead
  // at each tip is the one thing on the face that actually glows.
  for (let i = 0; i < 2; i++) {
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.26, seg(4)), bone);
    fang.position.set((i ? 1 : -1) * 0.09, 0.35, 0.48);
    fang.rotation.x = Math.PI * 0.92;
    g.add(fang);
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.026, seg(6), seg(6)), accent);
    bead.position.set((i ? 1 : -1) * 0.09, 0.24, 0.57);
    g.add(bead);
  }

  // Eye cluster — a huddle of tiny beads on the thorax, the
  // "too many eyes" detail low-poly arachnids live and die by.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, seg(5), seg(5)), accent);
    eye.position.set(Math.cos(a) * 0.12, 0.57, 0.42 + Math.sin(a) * 0.05);
    g.add(eye);
  }

  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1;
    const idx = i % 4;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.018, 0.82, seg(4)), shell);
    leg.position.set(side * 0.34, 0.32, (idx - 1.5) * 0.2);
    leg.rotation.z = side * 0.72;
    leg.name = 'leg';
    leg.userData.leg = { side, idx };
    g.add(leg);

    // Hip knuckle — a small iron-dull joint bead where each leg meets
    // the body, breaking up eight identical chitin cylinders with a
    // second material at the one place actual arachnid legs articulate.
    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.045, seg(6), seg(5)), bone);
    knuckle.position.set(side * 0.24, 0.4, (idx - 1.5) * 0.14);
    g.add(knuckle);
  }

  // Spinnerets — a pair of short bone nubs at the abdomen's rear, the
  // detail that reads "this thing spins silk" from a black silhouette.
  for (const side of [-1, 1]) {
    const spinneret = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, seg(4)), bone);
    spinneret.position.set(side * 0.06, 0.32, -0.62);
    spinneret.rotation.x = -Math.PI / 2.4;
    g.add(spinneret);
  }

  const core = new THREE.Mesh(new THREE.SphereGeometry(0.14, seg(10), seg(8)), coreMaterial(el));
  core.position.set(0, 0.54, 0.02);
  core.name = 'core';
  g.add(core);
  return g;
}

function plan_golem(g, el) {
  // Primary: stacked hexagonal prisms. Heavy, low, plated — reads as
  // "do not melee this" purely from its blocky, wide-based mass.
  const shell = shellMaterial(el);
  const accent = accentMaterial(el);
  const iron = ironMaterial();

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, 0.55, seg(6)), shell);
  base.position.y = 0.3;
  g.add(base);

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.82, 1.0, seg(6)), shell);
  trunk.position.y = 1.05;
  g.add(trunk);

  // Shoulder boulders — asymmetric mass at the top of the trunk so the
  // silhouette isn't a clean cylinder stack from every angle.
  for (const side of [-1, 1]) {
    const boulder = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, icoDetail(0)), shell);
    boulder.position.set(side * 0.62, 1.55, 0);
    boulder.scale.set(1, 0.85, 1);
    g.add(boulder);
  }

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.72, 0.18), accent);
    plate.position.set(Math.cos(a) * 0.7, 1.1, Math.sin(a) * 0.7);
    plate.lookAt(0, 1.1, 0);
    g.add(plate);

    // A rivet per plate — the one place iron shows through the molten
    // accent, so the plates read as bolted armour, not glowing hide.
    const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.035, seg(5), seg(5)), iron);
    rivet.position.set(Math.cos(a) * 0.79, 1.28, Math.sin(a) * 0.79);
    g.add(rivet);
  }

  // A stitched seam of old iron bracing down the trunk's front.
  for (let i = 0; i < 3; i++) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.04), iron);
    brace.position.set(0, 0.75 + i * 0.22, 0.58);
    brace.rotation.x = 0.1;
    g.add(brace);
  }

  // Rubble at the foundation — loose iron-dark fragments dragged up
  // with the base, so the widest part of the silhouette reads as
  // "grinding against the ground" instead of a clean cylinder edge.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.5;
    const rubble = new THREE.Mesh(new THREE.TetrahedronGeometry(0.09 + (i % 2) * 0.03, icoDetail(0)), iron);
    rubble.position.set(Math.cos(a) * 0.95, 0.1, Math.sin(a) * 0.95);
    rubble.rotation.set(a, a * 1.3, 0);
    g.add(rubble);
  }

  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, icoDetail(0)), coreMaterial(el));
  core.position.y = 1.62;
  core.name = 'core';
  g.add(core);

  const crown = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, seg(6), seg(12)), accent);
  crown.position.y = 1.62;
  crown.rotation.x = Math.PI / 2;
  g.add(crown);
  return g;
}

function plan_ice_elemental(g, el) {
  // Primary: stacked icosahedra (crystal). An angular, jagged column
  // of ice with spikes jutting at random angles — the "forbidden
  // shape" here is anything round or soft, on purpose, to keep it
  // from reading as the golem's cousin.
  const shell = shellMaterial(el);
  const accent = accentMaterial(el);
  const iron = ironMaterial();

  const sizes = [0.48, 0.38, 0.28, 0.18];
  sizes.forEach((r, i) => {
    // `bead`, not `seg` — `seg` is the imported tier-aware segment-count
    // helper (GeoForge) and a local of that name shadows it.
    const bead = new THREE.Mesh(new THREE.IcosahedronGeometry(r, icoDetail(0)), i % 2 ? accent : shell);
    bead.position.y = 0.32 + i * 0.4;
    bead.rotation.set(i * 0.7, i * 0.5, 0);
    g.add(bead);
  });

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.5, seg(4)), shell);
    spike.position.set(Math.cos(a) * 0.4, 0.8 + Math.sin(i * 2) * 0.18, Math.sin(a) * 0.4);
    spike.rotation.set(Math.sin(a) * 0.7, a, Math.cos(a) * 0.7);
    g.add(spike);
  }

  // Something frozen mid-fall inside the lowest, largest segment — a
  // scrap of iron this thing swept up and never let go of.
  for (let i = 0; i < 2; i++) {
    const relic = new THREE.Mesh(new THREE.TetrahedronGeometry(0.06, icoDetail(0)), iron);
    relic.position.set(0.1 - i * 0.2, 0.3 + i * 0.12, 0.15);
    relic.rotation.set(i, i * 1.5, 0);
    g.add(relic);
  }

  // Frost-shatter ring at the base where it meets the ground.
  const shatter = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.03, seg(4), seg(12)), accent);
  shatter.position.y = 0.04;
  shatter.rotation.x = Math.PI / 2;
  shatter.scale.set(1, 1, 0.7);
  g.add(shatter);

  // Drifting shard motes — small chips orbiting the column, sheared
  // off and held aloft rather than falling. Reuses the same
  // userData.orbit mechanic animateCreature already drives for the
  // vampire's motes, so this needs no new animation code.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const mote = new THREE.Mesh(new THREE.TetrahedronGeometry(0.05, icoDetail(0)), accent);
    mote.position.set(Math.cos(a) * 0.62, 0.9 + i * 0.14, Math.sin(a) * 0.62);
    mote.userData.orbit = { angle: a, radius: 0.62, speed: 0.55 + i * 0.15 };
    g.add(mote);
  }

  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.19, icoDetail(0)), coreMaterial(el));
  core.position.y = 1.1;
  core.name = 'core';
  g.add(core);
  return g;
}

function plan_wraith(g, el) {
  // Primary: a hollow cone (veil). Formless, tattered, no legs — it
  // doesn't touch the ground because it isn't really there.
  // Clone — see plan_slime's note. shellMaterial() is the same shared,
  // cached instance every other creature of this element uses.
  const shell = shellMaterial(el).clone();
  shell.transparent = true;
  shell.opacity = 0.4;
  const accent = accentMaterial(el);
  const iron = ironMaterial();

  const veil = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, seg(7), seg(1), true), shell);
  veil.position.y = 0.9;
  veil.rotation.x = Math.PI;
  g.add(veil);

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const tatter = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.5 + (i % 3) * 0.12, seg(3), seg(1), true), shell);
    tatter.position.set(Math.cos(a) * 0.34, 0.22, Math.sin(a) * 0.34);
    tatter.rotation.x = Math.PI;
    g.add(tatter);
  }

  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.3, seg(8), seg(6), 0, Math.PI * 2, 0, Math.PI * 0.6), accent);
  hood.position.y = 1.56;
  g.add(hood);

  // Two ember pinpricks sunk in the hood's hollow — the only hint of a
  // face this thing gets, small enough to read as eyes and not a mask.
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, seg(5), seg(5)), accent);
    eye.position.set(side * 0.09, 1.52, 0.24);
    g.add(eye);
  }

  // Broken shackle links, still trailing from whatever bound it in
  // life — one hint of a former body on an otherwise formless thing.
  for (let i = 0; i < 3; i++) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.014, seg(4), seg(8)), iron);
    link.position.set(0.16, 1.15 - i * 0.16, 0.05 + i * 0.03);
    link.rotation.set(Math.PI / 2, i * 0.6, 0);
    g.add(link);
  }

  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, icoDetail(1)), coreMaterial(el));
  core.position.y = 1.5;
  core.name = 'core';
  g.add(core);
  return g;
}

function plan_vampire(g, el) {
  // Primary: a tall narrow cone (cloak) with two sharp collar points
  // behind the head. Upright and composed where the wraith is
  // formless — the two ghosts of the roster read as opposites.
  const shell = shellMaterial(el);
  const accent = accentMaterial(el);
  const iron = ironMaterial();
  const bone = boneMaterial();

  const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.44, 1.7, seg(8), seg(1), true), shell);
  cloak.position.y = 0.95;
  g.add(cloak);

  for (const side of [-1, 1]) {
    const point = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.58, seg(3)), accent);
    point.position.set(side * 0.2, 1.76, -0.08);
    point.rotation.z = side * 0.35;
    point.rotation.x = -0.15;
    g.add(point);
  }

  const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, icoDetail(0)), accent);
  head.position.y = 1.72;
  head.scale.set(0.9, 1.1, 0.9);
  g.add(head);

  // Fangs — the one un-glamorous detail on an otherwise composed face.
  for (const side of [-1, 1]) {
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, seg(4)), bone);
    fang.position.set(side * 0.05, 1.62, 0.13);
    fang.rotation.x = Math.PI;
    g.add(fang);
  }

  // Clasp — a single worked-iron brooch holding the collar shut.
  const clasp = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, icoDetail(0)), iron);
  clasp.position.set(0, 1.55, 0.2);
  g.add(clasp);

  // Widow's peak — a small point of the same accent material at the
  // hairline, the one bit of anatomy the composed silhouette gets.
  const peak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, seg(3)), accent);
  peak.position.set(0, 1.88, 0.1);
  peak.rotation.x = Math.PI;
  g.add(peak);

  // A thin iron thread traces the cloak's hem — old embroidery, worked
  // metal against cloth rather than more raw accent colour.
  const hemTrim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.012, seg(4), seg(14)), iron);
  hemTrim.position.y = 0.14;
  hemTrim.rotation.x = Math.PI / 2;
  g.add(hemTrim);

  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, icoDetail(0)), coreMaterial(el));
  core.position.y = 1.35;
  core.name = 'core';
  g.add(core);

  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const mote = new THREE.Mesh(new THREE.TetrahedronGeometry(0.085, icoDetail(0)), accent);
    mote.position.set(Math.cos(a) * 0.5, 1.3, Math.sin(a) * 0.5);
    mote.userData.orbit = { angle: a, radius: 0.5, speed: 0.75 + i * 0.2 };
    g.add(mote);
  }
  return g;
}

function plan_dragon(g, el) {
  // Primary: elongated ellipsoid body with a long neck, wings and
  // tail. The only winged silhouette in the roster, and by far the
  // largest — nothing else should read as "boss" the way this does.
  const shell = shellMaterial(el);
  const accent = accentMaterial(el);
  const iron = ironMaterial();
  const bone = boneMaterial();

  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, icoDetail(1)), shell);
  body.scale.set(1, 0.85, 1.6);
  body.position.y = 1.1;
  g.add(body);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.9, seg(6)), shell);
  neck.position.set(0, 1.7, 0.75);
  neck.rotation.x = -0.5;
  g.add(neck);

  const head = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.72, seg(5)), accent);
  head.position.set(0, 2.22, 1.32);
  head.rotation.x = Math.PI / 2 - 0.3;
  g.add(head);

  // Horns — pale worn bone, curling back from the skull.
  for (const side of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.32, seg(4)), bone);
    horn.position.set(side * 0.12, 2.5, 1.05);
    horn.rotation.set(-1.0, 0, side * 0.3);
    g.add(horn);
  }

  // Teeth — a jawline of small bone cones along the head's underside,
  // so the head reads as a maw up close and not a smooth spearpoint.
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.1, seg(4)), bone);
    tooth.position.set((i % 2 ? 1 : -1) * 0.05, 2.02 + t * 0.42, 1.02 + t * 0.5);
    tooth.rotation.x = Math.PI;
    g.add(tooth);
  }

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.25, seg(5)), shell);
  tail.position.set(0, 0.9, -1.1);
  tail.rotation.x = Math.PI / 2 + 0.3;
  g.add(tail);

  // Spine ridge — a run of small plates down the back, alternating
  // iron and shell, breaking the smooth ellipsoid body into something
  // armoured rather than a plain balloon with a neck.
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const ridge = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, seg(4)), i % 2 ? iron : shell);
    ridge.position.set(0, 1.55 - t * 0.1, 1.0 - t * 2.0);
    ridge.rotation.x = -0.3;
    g.add(ridge);
  }

  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.4, seg(3), seg(1), true), accent);
    wing.position.set(side * 0.45, 1.5, -0.05);
    wing.rotation.z = side * 1.15;
    wing.rotation.y = side * 0.3;
    wing.scale.set(0.14, 1, 1);
    wing.name = 'leg'; // cheap flap: reuses the walk-swing rotation.x oscillation
    wing.userData.leg = { side, idx: 0 };
    g.add(wing);
  }

  // Underbelly scutes — a row of small iron-dull plates along the
  // belly, the one place the body reads as armoured hide rather than
  // a single smooth shell colour from underneath.
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    const scute = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.22), iron);
    scute.position.set(0, 0.6, 0.9 - t * 1.6);
    g.add(scute);
  }

  // Clawed feet — small anchor points near the base so the body reads
  // as grounded, not a balloon floating on nothing.
  for (const side of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, icoDetail(0)), shell);
    foot.position.set(side * 0.4, 0.32, 0.15);
    g.add(foot);
    for (let c = 0; c < 3; c++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.14, seg(4)), bone);
      claw.position.set(side * 0.4 + (c - 1) * 0.08, 0.16, 0.32);
      claw.rotation.x = Math.PI * 0.6;
      g.add(claw);
    }
  }

  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, icoDetail(0)), coreMaterial(el));
  core.position.set(0, 1.3, 0.3);
  core.name = 'core';
  g.add(core);
  return g;
}

function plan_sandworm(g, el) {
  // Primary: stacked tapering cylinders (a segmented tube) rising out
  // of the ground into a circular toothed maw. No head, no limbs —
  // pure "something is coming up out of the sand".
  const shell = shellMaterial(el);
  const accent = accentMaterial(el);
  const iron = ironMaterial();
  const bone = boneMaterial();
  const segCount = 6;
  const topY = 0.3 + (segCount - 1) * 0.4 + 0.2;

  for (let i = 0; i < segCount; i++) {
    const r = 0.5 - i * 0.045;
    // ⚠️ `ring`, not `seg`. A local `const seg` here shadowed the
    // imported seg() helper AND was referenced inside its own
    // initialiser — a temporal-dead-zone ReferenceError that crashed
    // every sandworm spawn.
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, 0.4, seg(8)), i % 2 ? accent : shell);
    ring.position.y = 0.3 + i * 0.4;
    ring.name = 'segment';
    ring.userData.segment = i;
    g.add(ring);

    // Crusted debris stuck to alternating segments — this thing just
    // tore up through rock and dragged half of it along.
    if (i % 2 === 0 && i > 0) {
      const crust = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, icoDetail(0)), iron);
      crust.position.set(r * 0.75, 0.3 + i * 0.4, r * 0.4);
      g.add(crust);
    }
  }

  const maw = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.085, seg(6), seg(10)), accent);
  maw.position.y = topY;
  g.add(maw);

  // Breach collar — a ring of shattered iron-dark rock at the very
  // base, where the body first tore up through the ground. Echoes the
  // slime's puddle ring and the ice elemental's frost-shatter ring:
  // the same "something is disturbing the ground here" cue.
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, seg(5), seg(14)), iron);
  collar.position.y = 0.12;
  collar.rotation.x = Math.PI / 2;
  collar.scale.set(1, 1, 0.8);
  g.add(collar);

  // A ring of shorter barb-spikes just below the toothline — a second
  // tier of hostility between the maw and the body proper.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const barb = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, seg(3)), bone);
    barb.position.set(Math.cos(a) * 0.38, topY - 0.2, Math.sin(a) * 0.38);
    barb.rotation.set(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6);
    g.add(barb);
  }

  // Teeth — pale bone, not the elemental shell, so the maw's ring of
  // accent and the teeth read as two distinct materials up close.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.15, seg(3)), bone);
    tooth.position.set(Math.cos(a) * 0.3, topY, Math.sin(a) * 0.3);
    tooth.rotation.x = Math.PI;
    g.add(tooth);
  }

  const core = new THREE.Mesh(new THREE.SphereGeometry(0.15, seg(10), seg(8)), coreMaterial(el));
  core.position.y = topY - 0.3;
  core.name = 'core';
  g.add(core);
  return g;
}

const PLANS = {
  // Real-model archetypes whose procedural fallback is the skeleton's
  // body plan (see CREATURE_MODELS) — they are risen dead too.
  bone_acolyte: plan_skeleton,
  grave_stalker: plan_skeleton,
  slime:         plan_slime,
  skeleton:      plan_skeleton,
  goblin:        plan_goblin,
  spider:        plan_spider,
  golem:         plan_golem,
  ice_elemental: plan_ice_elemental,
  wraith:        plan_wraith,
  vampire:       plan_vampire,
  dragon:        plan_dragon,
  sandworm:      plan_sandworm,
};

// Every creature type now owns its own plan 1:1 — kept as a map
// (rather than calling PLANS[typeId] directly) so an unrecognised or
// future typeId still falls back to something instead of throwing.
// 'shade' isn't a spawnable ENEMY_TYPES entry (SaturationSystem lists
// it in spawnBias hints only) but is kept mapped for safety.
import { NEW_CREATURES } from '../data/expansion.js';
export const ARCHETYPES = {
  slime:         'slime',
  goblin:        'goblin',
  skeleton:      'skeleton',
  golem:         'golem',
  wraith:        'wraith',
  spider:        'spider',
  vampire:       'vampire',
  dragon:        'dragon',
  ice_elemental: 'ice_elemental',
  sandworm:      'sandworm',
  shade:         'wraith',
  // Both new undead fall back to the skeleton body plan if their real
  // model is unavailable — they're risen dead, same as it.
  bone_acolyte:  'bone_acolyte',
  grave_stalker: 'grave_stalker',
  // The world expansion (data/expansion.js): every new creature is its
  // own archetype — bodies from rendering/Creatures.js, factions KayKit.
  ...Object.fromEntries(NEW_CREATURES.map(c => [c.id, c.id])),
};

/** Uniform scale factor that makes object3D's measured height equal targetHeight. */
function _scaleFactorForHeight(object3D, targetHeight) {
  const box = new THREE.Box3().setFromObject(object3D);
  const size = box.getSize(new THREE.Vector3());
  if (!size.y || !isFinite(size.y) || size.y <= 0) return 1;
  return targetHeight / size.y;
}

// ── Real character models, per creature archetype ────────────
//
// The bestiary used to be one real model (the skeleton) and ten
// primitive-built bodies standing next to it, which made the roster
// read as half-finished — the one real creature only drew attention
// to the nine that weren't.
//
// The KayKit CC0 character packs cover nine humanoid/undead bodies,
// so every archetype whose silhouette is genuinely humanoid now gets
// one, cast to type:
//   goblin  -> Skeleton_Minion (small, scrappy, hunched)
//   wraith  -> Rogue_Hooded    (a hood with nothing readable in it)
//   vampire -> Mage            (robed, upright, patrician)
//   golem   -> Barbarian       (the heaviest frame in the set)
//
// Keyed by ARCHETYPE, not creature type — `shade` is an alias for the
// `wraith` archetype (see ARCHETYPES above), so it inherits the hood
// rather than needing an entry of its own. Skeleton_Mage/Skeleton_Rogue
// are downloaded and embedded but intentionally unmapped for now: the
// roster has no caster/rogue undead type to hang them on, and inventing
// one to justify an asset is backwards.
//
// Deliberately NOT mapped: slime, spider, dragon, sandworm,
// ice_elemental. Those are non-humanoid by design, and forcing a
// biped onto them would be a downgrade from their purpose-built
// procedural silhouettes — a humanoid "spider" reads worse than a
// low-poly one with eight legs. They keep their plan_* bodies.
// ⚠️ REALISM PASS: `real` is the Mesh2Motion body dressed by
// rendering/Wanderer.js (RŌNIN's character, real proportions) and wins
// whenever its HD assets loaded; `key` is the old KayKit chibi, kept
// as the fallback for builds without them (the single-file artifact).
const CREATURE_MODELS = {
  skeleton: { real: 'model:Wanderer_hollowed', key: 'model:Skeleton_Warrior', height: 1.8 },
  goblin:   { real: 'model:Wanderer_hollowed', key: 'model:Skeleton_Minion',  height: 1.5 },
  wraith:   { real: 'model:Wanderer_veiled',   key: 'model:Rogue_Hooded',     height: 1.9 },
  vampire:  { real: 'model:Wanderer_palelord', key: 'model:Mage',             height: 1.92 },
  golem:    { real: 'model:Wanderer_bulwark',  key: 'model:Barbarian',        height: 2.3 },
  bone_acolyte:  { real: 'model:Wanderer_veiled',   key: 'model:Skeleton_Mage',  height: 1.85 },
  grave_stalker: { real: 'model:Wanderer_hollowed', key: 'model:Skeleton_Rogue', height: 1.75 },
  ...Object.fromEntries(NEW_CREATURES.filter(c => c.model).map(c => [c.id, { key: c.model, height: 1.8 * (c.scale || 1) / 0.9 }])),
};

/**
 * Real-model creature, built from an imported KayKit glTF instead of
 * the archetype's plan_* function. Returns null on ANY failure
 * (missing template, malformed clone, whatever) so the caller can
 * fall back to the procedural plan unconditionally — a spawn must
 * never throw or come back empty/invisible.
 */
function _forgeRealCreature(spec, element) {
  try {
    const inst = modelLibrary.instantiate(spec.key);
    if (!inst || !inst.group) return null;
    const { group, mixer, actions } = inst;

    group.scale.setScalar(_scaleFactorForHeight(group, spec.height));

    // The "Glow" material is this model's elemental tell — the real-
    // model equivalent of the procedural core mesh. SkeletonUtils.clone
    // reuses materials BY REFERENCE (verified against the vendored
    // three.js source), so every skeleton instance would otherwise
    // share and fight over one material's emissiveIntensity/color —
    // clone it per-instance before mutating anything on it.
    let glowMaterial = null;
    group.traverse((o) => {
      if (!glowMaterial && o.isMesh && o.material && o.material.name === 'Glow') {
        o.material = o.material.clone();
        glowMaterial = o.material;
      }
    });
    if (glowMaterial) {
      const c = hex(ELEMENT_COLORS[element]);
      glowMaterial.color.setHex(c);
      if (glowMaterial.emissive) glowMaterial.emissive.setHex(c);
      glowMaterial.emissiveIntensity = surfaceFor(element).emissive;
    }

    group.userData.mixer = mixer;
    group.userData.actions = actions;
    group.userData.isRealModel = true;
    group.userData.glowMaterial = glowMaterial;
    return group;
  } catch (err) {
    console.warn(`[EntityForge] real model "${spec.key}" failed, falling back to procedural:`, err);
    return null;
  }
}

/**
 * Build a creature body.
 * @param typeId   creature type
 * @param element  dominant element of its composition
 * @param scale    size multiplier
 */
export function forgeCreature(typeId, element = ELEMENTS.NEUTRAL, scale = 1) {
  const archetype = ARCHETYPES[typeId] || 'drifter';

  const spec0 = CREATURE_MODELS[archetype];
  // ⚠️ Owner: "the models were way better before" — the human enemies
  // are the KayKit characters again (armoured skeletons, hooded rogue,
  // mage, barbarian, with their own clips), not the dark Wanderer
  // mannequins the realism pass put on them. `real` is ignored here;
  // NPCs and the Pioneer still use Wanderer through their own paths.
  const modelSpec = spec0;
  if (modelSpec && modelLibrary.isReady(modelSpec.key)) {
    const realGroup = _forgeRealCreature(modelSpec, element);
    if (realGroup) {
      realGroup.scale.multiplyScalar(scale);
      realGroup.userData.element = element;
      realGroup.userData.archetype = archetype;
      return realGroup;
    }
    // Model not usable for whatever reason — fall through to the
    // exact same procedural path every other archetype takes below.
  }

  // ⚠️ The non-humanoids are BUILT BODIES now (rendering/Creatures.js) —
  // jointed, with their own procedural animation. PLANS remain as the
  // fallback for anything without a builder.
  const crafted = buildCreature(archetype, {
    shell: shellMaterial(element), accent: accentMaterial(element), bone: boneMaterial(), core: coreMaterial(element), element,
  });
  if (crafted) {
    crafted.scale.setScalar(scale);
    crafted.userData.element = element;
    crafted.userData.archetype = archetype;
    return crafted;
  }
  const group = new THREE.Group();
  const plan = PLANS[archetype];
  plan(group, element);

  group.scale.setScalar(scale);
  group.traverse(o => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });

  group.userData.element = element;
  group.userData.archetype = archetype;
  return group;
}

/**
 * Per-frame life. Also renders strain: as a composition approaches
 * detonation its core burns brighter and its parts shake.
 *
 * `attackState` mirrors Enemy.js's own windup/strike/recover/none
 * machine (the same field that already drives the procedural
 * coil-then-punch scale tell) — passed through, not re-derived, so
 * the real-model attack clip and the procedural attack tell are
 * always in sync with the actual hit-resolution timing.
 */
/**
 * Play a flinch. Called when a real-model creature takes damage.
 *
 * HANDOFF.md listed Hit_A/Death_A as "trimmed-in but not wired" — the
 * clips were being shipped inside every character GLB and never
 * played, so enemies absorbed hits with no bodily acknowledgement at
 * all and death was a pure scale-down.
 *
 * No-ops safely for procedural creatures (no mixer, no actions) and
 * for any rig whose Hit_A clip didn't survive trimming.
 *
 * @returns {boolean} whether a clip actually started
 */
export function playCreatureHit(group) {
  if (!group?.userData?.isRealModel || group.userData._dying) return false;
  const actions = group.userData.actions;
  const hit = actions && actions.get('Hit_A');
  if (!hit) return false;

  const prev = actions.get(group.userData._animKey);

  // LoopOnce: a flinch that loops reads as a seizure.
  hit.reset();
  hit.setLoop(THREE.LoopOnce, 1);
  hit.clampWhenFinished = true;
  // Faster than the 0.12 locomotion crossfade. A hit reaction has to
  // land on the same frame the damage does or it stops reading as
  // cause-and-effect; a long blend smears the impact.
  hit.fadeIn(0.04).play();
  if (prev && prev !== hit) prev.fadeOut(0.04);

  group.userData._animKey = 'Hit_A';
  // Hold for most of the clip, but cap it: KayKit's Hit_A runs ~1s on
  // some rigs, and an enemy that cannot move or retaliate for a full
  // second per hit is a stunlock, not a flinch. Cutting back to
  // locomotion early looks fine because the tail of the clip is the
  // recovery, which the walk/idle blend covers anyway.
  const clipDur = hit.getClip()?.duration ?? 0.4;
  group.userData._hitTimer = Math.min(clipDur * 0.7, 0.35);
  return true;
}

/**
 * Play the death clip and hold its final pose.
 *
 * Pairs with tickCreatureMixer() below: once an enemy is dead,
 * Enemy.update() stops running, so nothing is advancing the mixer any
 * more. The caller's fade-out loop has to drive it explicitly or the
 * corpse freezes on frame 0 of the death animation.
 *
 * @returns {number} the clip's duration in seconds, or 0 if unavailable
 */
export function playCreatureDeath(group) {
  if (!group?.userData?.isRealModel) return 0;
  const actions = group.userData.actions;
  const death = actions && actions.get('Death_A');
  if (!death) return 0;

  // Set before fading so animateCreature() bails out immediately if it
  // happens to run once more this frame.
  group.userData._dying = true;
  group.userData._hitTimer = 0;

  const prev = actions.get(group.userData._animKey);
  death.reset();
  death.setLoop(THREE.LoopOnce, 1);
  // Without this the action resets to its first frame when it ends and
  // the corpse springs back upright for the tail of the fade.
  death.clampWhenFinished = true;
  death.fadeIn(0.08).play();
  if (prev && prev !== death) prev.fadeOut(0.08);

  group.userData._animKey = 'Death_A';
  return death.getClip()?.duration ?? 0;
}

/**
 * Advance a creature's animation mixer outside the normal update path.
 *
 * Exists solely for the death fade-out, which runs on its own
 * requestAnimationFrame loop after the enemy has been removed from the
 * simulation. Harmless for procedural creatures.
 */
/** Scratch for the locomotion probe — runs per rig per frame. */
const _locoPos = new THREE.Vector3();

export function tickCreatureMixer(group, dt) {
  if (group?.userData?.mixer) group.userData.mixer.update(dt);
}

export function animateCreature(group, dt, time, strainRatio = 0, attackState = 'none') {
  if (!group) return;

  if (group.userData.isRealModel) {
    if (group.userData.mixer) group.userData.mixer.update(dt);

    // A death animation owns the rig outright until the corpse is
    // gone. Returning before the locomotion logic below is what stops
    // a dying enemy from being crossfaded back to Idle on the very
    // next frame — the clip is playing on the mixer we just ticked,
    // and playCreatureDeath() has already clamped it to hold its last
    // pose, so there is nothing left to do here.
    if (group.userData._dying) return;

    const actions = group.userData.actions;
    const isAttacking = attackState === 'windup' || attackState === 'strike';

    // A hit reaction is a one-shot that outranks locomotion but not
    // death. Counting the window down here (rather than listening for
    // the mixer's 'finished' event) keeps it in the same dt the rest
    // of this function uses, so it can't drift out of step when the
    // tab throttles or the engine pauses.
    if (group.userData._hitTimer > 0) {
      group.userData._hitTimer -= dt;
      if (group.userData._hitTimer <= 0) {
        // Deliberately LEAVE _animKey as 'Hit_A'. The obvious-looking
        // move here is to null it so the next locomotion decision
        // registers as a change — but _crossfadeTo() fades out
        // `actions.get(_animKey)`, so nulling it means nothing ever
        // fades Hit_A back out. It stays at full weight and blends
        // into every subsequent pose for the rest of the creature's
        // life. Keeping the key set makes the handoff a real
        // crossfade; the key differs from any locomotion key anyway,
        // so the transition still fires.
        group.userData._hitTimer = 0;
      } else {
        return;
      }
    }

    const _crossfadeTo = (key) => {
      if (key === group.userData._animKey) return;
      const nextAction = actions && actions.get(key);
      const prevAction = actions && actions.get(group.userData._animKey);
      if (nextAction) nextAction.reset().fadeIn(0.12).play();
      if (prevAction) prevAction.fadeOut(0.12);
      group.userData._animKey = key;
    };

    if (isAttacking) {
      // One clip covers the whole windup->strike beat (KayKit's melee
      // clips are cut to roughly that length already) rather than
      // trying to split windup vs. strike across two separate clips —
      // the procedural coil/punch scale tell (still applied by Enemy.js
      // on top of this, real model or not) already carries the
      // moment-of-impact read.
      _crossfadeTo('2H_Melee_Attack_Chop');
      group.userData._prevPos = group.getWorldPosition(new THREE.Vector3()); // don't read attack-root-motion as locomotion
    } else if (!group.userData._prevPos) {
      group.userData._prevPos = group.getWorldPosition(new THREE.Vector3());
      _crossfadeTo('Idle');
    } else {
      // Self-detect locomotion by comparing XZ position frame-to-frame
      // (not Enemy.js's job to pass a "moving" flag — keeps most of
      // that call site untouched). XZ-only, deliberately ignoring Y:
      // the idle bob at the bottom of this function nudges
      // group.position.y every single frame, which would otherwise
      // read as constant "walking".
      // ⚠️ WORLD position, not local.
      //
      // An enemy's group IS its scene-graph root, so `group.position`
      // was world space and this worked. The PLAYER's rig is a CHILD
      // of `player.mesh` — the mesh moves and the rig sits at local
      // (0,0,0) forever — so reading `group.position` for the player
      // reports zero movement always, and the body would stand in Idle
      // no matter how fast you ran. One accessor covers both.
      const prevPos = group.userData._prevPos;
      group.getWorldPosition(_locoPos);
      const dx = _locoPos.x - prevPos.x;
      const dz = _locoPos.z - prevPos.z;
      const speed = dt > 1e-5 ? Math.sqrt(dx * dx + dz * dz) / dt : 0;
      const desiredKey = speed > 3.2 ? 'Running_A' : speed > 0.15 ? 'Walking_A' : 'Idle';
      _crossfadeTo(desiredKey);
      prevPos.copy(_locoPos);
    }

    // Strain glow — the real-model equivalent of the procedural core's
    // brightness readout, same formula for visual consistency between
    // real and procedural creatures sharing the screen.
    const glowMaterial = group.userData.glowMaterial;
    if (glowMaterial) {
      const base = surfaceFor(group.userData.element).emissive;
      glowMaterial.emissiveIntensity = base + strainRatio * 3.2 +
        Math.sin(time * (3 + strainRatio * 14)) * (0.15 + strainRatio * 0.5);
    }

    // No named "core"/"leg" meshes on a real skinned rig, and jittering
    // a rigged mesh's local position mid-skeletal-animation would look
    // broken rather than "juicy" — deliberately skip that strain-jitter
    // and the fake leg-swing walk cycle for real models.
    group.position.y += Math.sin(time * 1.5) * 0.0016;
    return;
  }

  // Built bodies (rendering/Creatures.js): their own rig, driven by real
  // speed (measured from movement, as the rigged models are) and the AI's
  // attack state; the core keeps the composition's strain glow.
  const cr = group.userData.creature;
  if (cr) {
    group.getWorldPosition(_locoPos);
    const prev = group.userData._prevPos || (group.userData._prevPos = _locoPos.clone());
    const sp = dt > 1e-5 ? Math.hypot(_locoPos.x - prev.x, _locoPos.z - prev.z) / dt : 0;
    group.userData._spd = (group.userData._spd || 0) + (Math.min(8, sp) - (group.userData._spd || 0)) * Math.min(1, dt * 6);
    prev.copy(_locoPos);
    cr.animate(dt, time, { speed: group.userData._spd, attack: attackState || 'none', strain: strainRatio });
    const core = group.getObjectByName('core');
    if (core?.material) {
      const base = surfaceFor(group.userData.element).emissive;
      core.material.emissiveIntensity = base + strainRatio * 3.2 + Math.sin(time * (3 + strainRatio * 14)) * (0.15 + strainRatio * 0.5);
    }
    return;
  }

  const shake = strainRatio > 0.05 ? strainRatio * 0.09 : 0;

  group.traverse(o => {
    if (o.name === 'core') {
      const base = surfaceFor(group.userData.element).emissive;
      // Brightness is the readout. No bar needed.
      o.material.emissiveIntensity = base + strainRatio * 3.2 +
        Math.sin(time * (3 + strainRatio * 14)) * (0.15 + strainRatio * 0.5);
      const s = 1 + strainRatio * 0.35;
      o.scale.setScalar(s);
    } else if (o.userData.orbit) {
      const orb = o.userData.orbit;
      orb.angle += dt * orb.speed;
      if (orb.radius > 0) {
        o.position.x = Math.cos(orb.angle) * orb.radius;
        o.position.z = Math.sin(orb.angle) * orb.radius;
      }
      o.rotation.y += dt * orb.speed;
    } else if (o.name === 'segment') {
      const i = o.userData.segment;
      o.position.x = Math.sin(time * 1.6 + i * 0.6) * (0.1 + i * 0.045);
      o.position.z = Math.cos(time * 1.3 + i * 0.6) * (0.08 + i * 0.03);
    } else if (o.name === 'leg') {
      const { side, idx } = o.userData.leg;
      o.rotation.x = Math.sin(time * 6 + idx * 1.4 + (side > 0 ? Math.PI : 0)) * 0.34;
    }

    if (shake && o.isMesh && o.name !== 'core') {
      o.position.x += (Math.random() - 0.5) * shake;
      o.position.z += (Math.random() - 0.5) * shake;
    }
  });

  group.position.y += Math.sin(time * 1.5) * 0.0016;
}

// ── THE WAND ──────────────────────────────────────────────

/**
 * The Fracture Wand. It is the only weapon in the game, so it gets
 * actual attention: a split haft with a shard suspended in the gap,
 * and a band that takes the caster's attuned colour.
 */
/**
 * The Fracture Wand — the one object on screen every single frame.
 *
 * The previous build was six primitives: a cylinder, three torus
 * bands, two tines and a sphere. At viewmodel scale that reads as two
 * dark sticks holding a ball, which is exactly what it was.
 *
 * Rebuilt to the house rules rather than by adding clutter:
 *  · ONE emissive focal point (the shard). The cage, collar and
 *    bindings are all unlit geometry whose only job is to frame it —
 *    adding a second glow is what makes a prop read as a toy.
 *  · Ornament is stroked geometry, never texture (§3).
 *  · PBR throughout; `createToonMaterial` is a vestigial name.
 *  · Every geometry call goes through seg()/icoDetail() so the low
 *    tier degrades instead of paying for detail it cannot show.
 *    ⚠️ seg() needs the FLOOR it already provides — a 4-sided cone
 *    still reads as a prism no matter what it is meant to be.
 *
 * Silhouette: a tapered haft, a bound leather grip, a filigree collar,
 * and a four-tine claw opening into a cage with the shard floating in
 * the gap. Two counter-rotating rings and three orbiting chips give it
 * motion that is legible at viewmodel distance.
 */
export function forgeWand(attunedElement = ELEMENTS.ARCANE) {
  // ══════════════════════════════════════════════════════════
  // ⚠️ THE FOCUS — rebuilt for the realism pass.
  //
  // This was a gilded octahedron pommel, a cylinder haft, seven torus
  // "wraps", gold spurs, four iron tines, and at the top an emissive
  // octahedron shard inside two orbiting rings with three orbiting
  // chips — which rendered, every frame, as a glowing orange ball on a
  // black stick. It was the most stylised object in the game and the
  // one always on screen.
  //
  // Now it is a thing a person could have made: a hand-carved rod of
  // blackened ash, a spiral leather grip, an iron ferrule, and a raw
  // split shard of dark glass clamped in a forged iron crown with wire.
  // The element shows as light LEAKING THROUGH THE SHARD'S FRACTURES
  // (an emissive map of cracks), not as a coloured orb.
  //
  // ⚠️ CONTRACTS KEPT: `wand-core` (the shard, part 'focus' — the
  // Aspect highlighter and main.js's single emissive writer both find it
  // by name), `wand-light`. `wand-halo*` and `wand-chip*` are gone;
  // retintWand/animateWand tolerate their absence.
  // ══════════════════════════════════════════════════════════
  const g = new THREE.Group();
  const lib = materialLibrary.ready ? materialLibrary : null;

  // Blackened ash, real grain where the texture library is loaded.
  // ⚠️ Its own grain, generated — NOT the texture library. The focus is
  // built in setupViewmodel(), before the HD sets finish loading, so a
  // library-dependent material silently fell back to a flat pinkish tan
  // (measured in the first screenshot). A canvas has no load order.
  const wood = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: _woodGrainMap(), bumpMap: _woodGrainMap(), bumpScale: 0.8,
    roughness: 0.74, metalness: 0.0,
  });
  const iron = new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 0.48, metalness: 0.85 });
  if (lib) lib.applyUV(iron, 'metal', 1);

  // ── Haft: one lathe, hand-carved — not a perfect cylinder ──
  const prof = [];
  const Y0 = -0.66, Y1 = 0.03;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, y = Y0 + (Y1 - Y0) * t;
    let r = 0.029 + 0.004 * Math.sin(t * Math.PI);          // gentle swell
    if (y > -0.37 && y < -0.06) r += 0.003;                  // the grip, worn fuller
    r += 0.0016 * Math.sin(y * 61) + 0.0011 * Math.sin(y * 137 + 1.3);   // knife facets / knots
    if (t > 0.92) r *= 0.92;                                  // shoulder under the crown
    prof.push(new THREE.Vector2(r, y));
  }
  const haft = new THREE.Mesh(new THREE.LatheGeometry(prof, seg(14)), wood);
  g.add(haft);

  // ── Grip: a leather strap wound in a real spiral ──
  // The grip sits high on the rod, so the hand that holds it is in frame.
  const turns = 8, gy0 = -0.36, gy1 = -0.07;
  const helix = new THREE.Curve();
  helix.getPoint = (t, out = new THREE.Vector3()) => {
    const a = t * turns * Math.PI * 2;
    const y = gy0 + (gy1 - gy0) * t;
    return out.set(Math.cos(a) * 0.0365, y, Math.sin(a) * 0.0365);
  };
  const strap = new THREE.Mesh(new THREE.TubeGeometry(helix, turns * 24, 0.0058, 6, false), leatherMaterial());
  strap.scale.set(1, 1, 1);
  g.add(strap);

  // ── Ferrule at the butt ──
  const fer = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    fer.push(new THREE.Vector2(0.001 + Math.sqrt(Math.max(0, 1 - (1 - t) ** 2)) * 0.034, -0.72 + t * 0.075));
  }
  fer.push(new THREE.Vector2(0.0335, -0.64));
  g.add(new THREE.Mesh(new THREE.LatheGeometry(fer, seg(16)), iron));

  // ── Crown: collar and three forged tines clasping the shard ──
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.031, 0.05, seg(16)), iron);
  collar.position.y = 0.02;
  g.add(collar);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    const pt = (r, y) => new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    const curve = new THREE.CatmullRomCurve3([pt(0.028, 0.03), pt(0.06, 0.11), pt(0.062, 0.22), pt(0.034, 0.33), pt(0.022, 0.36)]);
    const tine = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.0062, 6, false), iron);
    g.add(tine);
  }
  for (const [y, r] of [[0.15, 0.064], [0.27, 0.058]]) {
    const wire = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0022, 5, seg(28)), iron);
    wire.rotation.x = Math.PI / 2;
    wire.position.y = y;
    g.add(wire);
  }

  // ── The shard: dark glass, light leaking through its fractures ──
  const shardGeo = displace(new THREE.IcosahedronGeometry(1, 1), { amount: 0.28, freq: 1.9, octaves: 2, offset: 4.1 });
  shardGeo.scale(0.052, 0.13, 0.047);
  shardGeo.computeVertexNormals();
  const c = hex(ELEMENT_COLORS[attunedElement] || ELEMENT_COLORS[ELEMENTS.NEUTRAL]);
  const shard = new THREE.Mesh(shardGeo, new THREE.MeshPhysicalMaterial({
    color: 0x0d0e12, roughness: 0.16, metalness: 0.0,
    clearcoat: 1, clearcoatRoughness: 0.08,
    emissive: c, emissiveIntensity: 0.6, emissiveMap: _fractureMap(),
    flatShading: true,
  }));
  shard.position.y = 0.235;
  shard.rotation.set(0.12, 0.6, -0.08);
  shard.name = 'wand-core';
  shard.userData.part = 'focus';
  shard.userData.keepBody = true;     // retintWand: emissive only, the glass stays dark
  shard.userData.clamped = true;      // animateWand: it is held in iron, it does not float
  g.add(shard);

  const light = new THREE.PointLight(c, 0.8, 3);
  light.position.y = 0.235;
  light.name = 'wand-light';
  g.add(light);

  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** Blackened ash: dark, oily grain running along the rod (v = length). */
let _woodTex = null;
function _woodGrainMap() {
  if (_woodTex || typeof document === 'undefined') return _woodTex;
  const W = 128, H = 512, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g2 = cv.getContext('2d');
  g2.fillStyle = '#2b211a'; g2.fillRect(0, 0, W, H);
  let seed = 31;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 220; i++) {
    const x = rnd() * W, w = 0.6 + rnd() * 2.2, l = 30 + rnd() * 200, y = rnd() * H;
    const v = rnd();
    g2.fillStyle = v < 0.5 ? `rgba(14,10,8,${0.25 + rnd() * 0.35})` : `rgba(92,70,52,${0.12 + rnd() * 0.22})`;
    g2.fillRect(x, y, w, l);
  }
  // Polish where the hand wears it: a lighter, smoother band.
  const grd = g2.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0.0, 'rgba(0,0,0,0)'); grd.addColorStop(0.45, 'rgba(120,96,74,0.10)');
  grd.addColorStop(0.75, 'rgba(120,96,74,0.10)'); grd.addColorStop(1.0, 'rgba(0,0,0,0)');
  g2.fillStyle = grd; g2.fillRect(0, 0, W, H);
  _woodTex = new THREE.CanvasTexture(cv);
  _woodTex.colorSpace = THREE.SRGBColorSpace;
  _woodTex.wrapS = _woodTex.wrapT = THREE.RepeatWrapping;
  _woodTex.repeat.set(2, 1);
  return _woodTex;
}

/**
 * Fractures for the focus shard's emissive map: dark glass with bright
 * jagged cracks. Generated once into a canvas (no asset, no request).
 */
let _fractureTex = null;
function _fractureMap() {
  if (_fractureTex || typeof document === 'undefined') return _fractureTex;
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g2 = cv.getContext('2d');
  g2.fillStyle = '#000'; g2.fillRect(0, 0, S, S);
  let seed = 23;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  g2.lineCap = 'round';
  for (let k = 0; k < 14; k++) {
    let x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI * 2;
    const w = 0.6 + rnd() * 1.8;
    g2.strokeStyle = `rgba(255,255,255,${0.35 + rnd() * 0.6})`;
    g2.lineWidth = w;
    g2.beginPath(); g2.moveTo(x, y);
    for (let s = 0; s < 18; s++) {
      a += (rnd() - 0.5) * 0.9;
      x += Math.cos(a) * 9; y += Math.sin(a) * 9;
      g2.lineTo(x, y);
    }
    g2.stroke();
  }
  // A faint inner glow so the whole shard is not black between cracks.
  const grd = g2.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,0.14)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g2.fillStyle = grd; g2.fillRect(0, 0, S, S);
  _fractureTex = new THREE.CanvasTexture(cv);
  _fractureTex.colorSpace = THREE.SRGBColorSpace;
  return _fractureTex;
}

/** Re-tint the wand as the caster's attunement drifts. */
export function retintWand(wandGroup, element) {
  if (!wandGroup) return;
  const c = hex(ELEMENT_COLORS[element] || ELEMENT_COLORS[ELEMENTS.NEUTRAL]);
  wandGroup.traverse(o => {
    // ⚠️ Every emissive part by name. A part added to forgeWand and
    // missed here keeps the PREVIOUS element's colour forever, which
    // reads as the wand only half-changing when your attunement drifts.
    if (o.name === 'wand-core' || o.name === 'wand-halo' ||
        o.name === 'wand-halo2' || o.name?.startsWith('wand-chip')) {
      // The focus shard is dark glass: only the light in its cracks
      // takes the element's colour (see forgeWand).
      if (!o.userData.keepBody) o.material.color.setHex(c);
      if (o.material.emissive) o.material.emissive.setHex(c);
    } else if (o.name === 'wand-light') {
      o.color.setHex(c);
    }
  });
}

export function animateWand(wandGroup, time) {
  if (!wandGroup) return;
  // ⚠️ Allocation-free — this runs every frame, forever, on the one
  // object that is always on screen.
  wandGroup.traverse(o => {
    if (o.name === 'wand-core' && o.userData.clamped) {
      // Held in iron: it does not spin or bob. Its glow is NOT touched
      // here — main.js's updateViewmodel is the single writer of the
      // core's emissive (trap #9).
    } else if (o.name === 'wand-core') {
      o.rotation.y = time * 1.4;
      o.rotation.x = time * 0.8;
      o.position.y = 0.255 + Math.sin(time * 2) * 0.011;
    } else if (o.name === 'wand-halo') {
      o.rotation.z = time * 0.9;
    } else if (o.name === 'wand-halo2') {
      // Counter-rotating, and slower. Two rings turning the same way
      // read as one ring; opposed, they read as a mechanism.
      o.rotation.z = -time * 0.62;
      o.rotation.y = 0.7 + Math.sin(time * 0.5) * 0.25;
    } else if (o.name?.startsWith('wand-chip')) {
      const a = o.userData.orbit + time * 0.75;
      o.position.set(Math.cos(a) * 0.16, 0.255 + Math.sin(time * 1.3 + o.userData.orbit) * 0.045, Math.sin(a) * 0.16);
      o.rotation.y = time * 1.9;
      o.rotation.x = time * 1.2;
    }
  });
}

export { SURFACES, surfaceFor };

// ── FORGED WEAPONS ────────────────────────────────────────
// ⚠️ REBUILT (realism pass). Every weapon model now comes from
// rendering/Arms.js — blades swept from real cross-sections, lathed
// fittings, extruded heads, wrapped grips, real size in metres. The old
// stacked-primitive plans (WEAPON_PLANS, _bladeGeometry, the box scythe,
// the scaled-sword greatsword) were DELETED, not bypassed, on the owner's
// "I do not want any of the old models ever again". weaponPlanKey stays:
// it is the normaliser every weapon table keys on (trap #11).

/**
 * Normalise whatever the caller had for a weapon type.
 *
 * ⚠️ ItemGenerator's WEAPON_TYPES are Capitalised display strings
 * ('Sword', 'Dual Blades', 'Bow') and this table is keyed lowercase,
 * so EVERY procedurally generated weapon missed its plan and fell
 * through to the sword. That fallback is why the bug was invisible:
 * the lookup never failed loudly, it just quietly handed back a sword
 * for a bow. Display name and lookup key should not be the same
 * string — same lesson as biome.surface / biome.enemyTypes.
 */
export function weaponPlanKey(weaponType) {
  return String(weaponType || 'sword').toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * A forged melee weapon: grip below the origin, business end above —
 * the same "hand at (0,0,0)" convention forgeWand uses, so it drops
 * straight into the same held-prop code (body rig, FPS viewmodel,
 * character preview) without special-casing.
 */
/** Weapon types already warned about, so the log stays readable. */
const _warnedWeapon = new Set();

/**
 * Forge a weapon (rendering/Arms.js). Seeded: the same Remnant re-forges
 * the identical object on every equip, in every rig.
 * `userData.grip = {y, r}` is where a hand closes on it.
 */
export function forgeWeapon(weaponType = 'sword', element = ELEMENTS.NEUTRAL, tierLevel = 1, seed = '', metal = null) {
  // Forged metal weapons are ids like `mithril_sword`; a caller that
  // only has the seed (preview, gear halo) still gets the right metal.
  if (!metal && typeof seed === 'string') metal = ARM_METALS.find(m => seed.startsWith(`${m}_`)) || null;
  const key = weaponPlanKey(weaponType);
  if (!ARM_TYPES.includes(key) && !_warnedWeapon.has(key)) {
    _warnedWeapon.add(key);
    console.warn(`[EntityForge] no weapon model for "${weaponType}" — forging a sword instead`);
  }
  const g = buildArmModel(ARM_TYPES.includes(key) ? key : 'sword', element, tierLevel, seed || `${key}:${element}:${tierLevel}`, metal);
  g.userData.weaponType = weaponType;
  g.userData.element = element;
  return g;
}

export function animateWeapon(weaponGroup, time) {
  // The set stone is clamped in steel: it neither spins nor bobs. Its
  // glow is the Facet highlighter's to change, not this function's.
}

// ── THE PIONEER ───────────────────────────────────────────

/**
 * The player. Previously a stack of boxes with a cape made of a thin
 * box — the single most visible reason the game read as a toy, since
 * it is on screen every frame.
 *
 * Built as a hooded figure in a heavy travelling robe: the silhouette
 * carries it, the face is a dark void with two attuned embers in it,
 * and the robe hides the legs so locomotion never has to be good.
 *
 * Returns the same rig the animation code already drives:
 * { group, leftLeg, rightLeg, leftArm, rightArm, weaponGroup }.
 */
function _buildProceduralPioneer(attunedElement) {
  const g = new THREE.Group();

  // ⚠️ Cloth and leather, on the PLAYER's own body — this rig feeds
  // both the first-person viewmodel arms and the character-preview
  // panel, so it is the most closely-looked-at geometry in the game.
  // Faceted cloth at arm's length is the single most obvious remaining
  // low-poly tell. FACET_ORGANIC keeps `low` at artifact parity.
  const robeDark  = new THREE.MeshStandardMaterial({ color: 0x1e1a24, roughness: 0.9, metalness: 0.05, flatShading: FACET_ORGANIC() });
  const robeMid   = new THREE.MeshStandardMaterial({ color: 0x2b2532, roughness: 0.85, metalness: 0.05, flatShading: FACET_ORGANIC() });
  const leather   = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.95, metalness: 0.0,  flatShading: FACET_ORGANIC() });
  const metal     = new THREE.MeshStandardMaterial({ color: 0xc9a24e, roughness: 0.35, metalness: 0.85 });
  const voidFace  = new THREE.MeshStandardMaterial({ color: 0x05040a, roughness: 1.0, metalness: 0.0 });
  const ember     = coreMaterial(attunedElement);

  // ── Robe: a tapered skirt, widest at the ground ──
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.86, 1.65, seg(8)), robeDark);
  robe.position.y = 0.82;
  g.add(robe);

  // Hem, slightly flared so it reads as cloth
  const hem = new THREE.Mesh(new THREE.ConeGeometry(0.94, 0.42, seg(8), seg(1), true), robeMid);
  hem.position.y = 0.2;
  hem.rotation.x = Math.PI;
  g.add(hem);

  // ── Torso and belt ──
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.46, 0.72, seg(7)), robeMid);
  chest.position.y = 1.94;
  g.add(chest);

  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.055, seg(5), seg(12)), leather);
  belt.position.y = 1.6;
  belt.rotation.x = Math.PI / 2;
  g.add(belt);

  const buckle = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, icoDetail(0)), metal);
  buckle.position.set(0, 1.6, 0.44);
  g.add(buckle);

  // ── Hood: cone shell with a dark hollow where a face would be ──
  // ⚠️ EVERY PART ABOVE THE NECK IS NAMED `pioneer-head`.
  // In first person the camera sits inside this skull, so these are
  // the parts — and the ONLY parts — that have to be hidden for the
  // player to be able to see. Naming them is what makes a real
  // first-person body possible: the whole rig used to be hidden
  // wholesale, so looking down showed nothing at all.
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.78, seg(7)), robeDark);
  hood.position.y = 2.58;
  hood.name = 'pioneer-head';
  g.add(hood);

  const cowl = new THREE.Mesh(new THREE.SphereGeometry(0.34, seg(10), seg(8), 0, Math.PI * 2, 0, Math.PI * 0.62), robeDark);
  cowl.position.y = 2.44;
  cowl.rotation.x = -0.22;
  cowl.name = 'pioneer-head';
  g.add(cowl);

  const face = new THREE.Mesh(new THREE.SphereGeometry(0.26, seg(10), seg(8)), voidFace);
  face.position.set(0, 2.36, 0.08);
  face.name = 'pioneer-head';
  g.add(face);

  // Two embers where the eyes are — these take the attuned colour.
  // ⚠️ Still named `pioneer-eye`: `retintPioneer` finds them by that
  // name, and renaming them to `pioneer-head` would silently stop the
  // attunement recolour working. Hidden by TYPE in first person
  // instead — see Player._setFirstPersonBody.
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, seg(6), seg(6)), ember);
    eye.position.set(side * 0.1, 2.38, 0.26);
    eye.name = 'pioneer-eye';
    g.add(eye);
  }

  // ── Shoulders: angled slabs, not cubes ──
  for (const side of [-1, 1]) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.22, seg(6)), leather);
    pad.position.set(side * 0.46, 2.16, 0);
    pad.rotation.z = side * 0.5;
    g.add(pad);
  }

  // ── Mantle / cloak, hanging behind ──
  const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.5, seg(6), seg(1), true), robeMid);
  cloak.position.set(0, 1.55, -0.24);
  cloak.rotation.set(Math.PI + 0.1, 0, 0);
  cloak.scale.set(1, 1, 0.42);
  g.add(cloak);

  // ── Rig: kept so existing locomotion animation still works ──
  const mkLimb = (r1, r2, len, mat) => {
    const grp = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg(6)), mat);
    m.position.y = -len / 2;
    grp.add(m);
    return grp;
  };

  const rightArm = mkLimb(0.11, 0.08, 0.78, robeMid);
  rightArm.position.set(0.5, 2.06, 0);
  g.add(rightArm);

  const leftArm = mkLimb(0.11, 0.08, 0.78, robeMid);
  leftArm.position.set(-0.5, 2.06, 0);
  g.add(leftArm);

  // Legs live under the robe — present for the animation rig, barely seen.
  const leftLeg = mkLimb(0.11, 0.09, 0.7, robeDark);
  leftLeg.position.set(-0.17, 0.78, 0);
  g.add(leftLeg);

  const rightLeg = mkLimb(0.11, 0.09, 0.7, robeDark);
  rightLeg.position.set(0.17, 0.78, 0);
  g.add(rightLeg);

  const weaponGroup = new THREE.Group();
  weaponGroup.position.set(0, -0.66, 0.06);
  rightArm.add(weaponGroup);

  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  return { group: g, leftLeg, rightLeg, leftArm, rightArm, weaponGroup };
}

// Memoized once, lazily: the real Knight model has no design-given
// "target height" the way the skeleton's 1.8 was handed to us, so we
// derive one from the existing procedural rig's own measured height
// instead of guessing a number — CharacterPreviewUI.js's fixed camera
// framing already assumes this exact figure (~2.97, feet at y=0; see
// its own comment), so matching it precisely (not approximately) is
// what keeps that panel framed correctly for a real-model Pioneer too.
let _proceduralPioneerHeight = null;
function _measuredProceduralPioneerHeight() {
  if (_proceduralPioneerHeight != null) return _proceduralPioneerHeight;
  const probe = _buildProceduralPioneer(ELEMENTS.NEUTRAL);
  const box = new THREE.Box3().setFromObject(probe.group);
  const size = box.getSize(new THREE.Vector3());
  _proceduralPioneerHeight = (size.y && isFinite(size.y) && size.y > 0) ? size.y : 2.97;
  return _proceduralPioneerHeight;
}

/**
 * Real-model Pioneer, built from the imported Knight glTF. Returns
 * null on ANY failure so forgePioneer can fall back to the procedural
 * rig unconditionally, same bulletproof contract as _forgeRealSkeleton.
 *
 * Player.js has at least one unguarded `this.rightArm.rotation.x = …`
 * (combat swing) that isn't gated behind a truthiness check, so
 * leftLeg/rightLeg/leftArm/rightArm below are real (if inert, detached)
 * THREE.Group instances rather than null — setting .rotation on them
 * is a harmless no-op instead of a crash. The real model loses arm/leg
 * swing on combat attacks as a result (acceptable: this rig is meant
 * to be a standing display body per the task brief, not a combat rig).
 */
function _forgeRealPioneer(attunedElement) {
  try {
    // The Pioneer is a real person now (rendering/Wanderer.js), the
    // KayKit knight only where the HD body is missing.
    const key = modelLibrary.isReady('model:Wanderer_pioneer') ? 'model:Wanderer_pioneer' : MODEL_KEY_KNIGHT;
    const inst = modelLibrary.instantiate(key);
    if (!inst || !inst.group) return null;
    const { group, mixer, actions } = inst;

    group.scale.setScalar(_scaleFactorForHeight(group, key === MODEL_KEY_KNIGHT ? _measuredProceduralPioneerHeight() : 1.78));

    group.userData.mixer = mixer;
    group.userData.actions = actions;
    group.userData.isRealModel = true;

    const idle = actions.get('Idle');
    if (idle) idle.play();

    // Attach the held-prop group to the right-hand bone if we can find
    // it, so the wand/weapon tracks the hand through whatever animation
    // is playing instead of sitting static at the model root.
    let handNode = null;
    // 'hand.r' on the KayKit rig, 'hand_r' on the Mesh2Motion one.
    group.traverse((o) => { if (!handNode && (o.name === 'hand.r' || o.name === 'hand_r')) handNode = o; });
    const weaponGroup = new THREE.Group();
    (handNode || group).add(weaponGroup);

    // Detached dummy limbs — see function doc comment above.
    const leftLeg = new THREE.Group();
    const rightLeg = new THREE.Group();
    const leftArm = new THREE.Group();
    const rightArm = new THREE.Group();

    return { group, leftLeg, rightLeg, leftArm, rightArm, weaponGroup };
  } catch (err) {
    console.warn('[EntityForge] real knight model failed, falling back to procedural:', err);
    return null;
  }
}

export function forgePioneer(attunedElement = ELEMENTS.ARCANE, variant = 'mage') {
  if (modelLibrary.isReady('model:Wanderer_pioneer') || modelLibrary.isReady(MODEL_KEY_KNIGHT)) {
    const realRig = _forgeRealPioneer(attunedElement);
    if (realRig) return realRig;
  }
  return _buildProceduralPioneer(attunedElement);
}

/** Re-light the Pioneer's eyes as attunement drifts. */
export function retintPioneer(group, element) {
  if (!group) return;
  const c = hex(ELEMENT_COLORS[element] || ELEMENT_COLORS[ELEMENTS.NEUTRAL]);
  group.traverse(o => {
    if (o.name === 'pioneer-eye') {
      o.material.color.setHex(c);
      o.material.emissive.setHex(c);
    }
  });
}

const crackMaterial = () => cached('pioneer:crack', () => new THREE.MeshStandardMaterial({
  color: 0x050308, roughness: 1.0, metalness: 0.0, flatShading: true,
}));

/**
 * Mastering an element (see AttunementSystem.MASTERY_AT) leaves a mark
 * — not a costume change, a permanent one-time scar. Two thin, asymmetric
 * cracks over the hood and cheek (an "ordered shape made wrong", the
 * same restrained-dread technique the void-face already uses) and the
 * eyes burn a little harder from then on. Idempotent: safe to call
 * every attunement update, only ever does anything once per rig.
 */
export function applyPioneerCorruption(group, active) {
  if (!group || !active || group.userData.corrupted) return;
  group.userData.corrupted = true;

  const crack = crackMaterial();
  const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.36, 0.02), crack);
  c1.position.set(0.12, 2.5, 0.24);
  c1.rotation.z = 0.5;
  group.add(c1);
  const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.18, 0.015), crack);
  c2.position.set(0.2, 2.3, 0.22);
  c2.rotation.z = -0.35;
  group.add(c2);

  group.traverse(o => {
    if (o.name === 'pioneer-eye' && o.material?.emissiveIntensity !== undefined) {
      o.material.emissiveIntensity *= 1.6;
    }
  });
}
