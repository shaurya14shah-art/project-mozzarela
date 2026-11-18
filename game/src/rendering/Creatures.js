// ══════════════════════════════════════════════════════════
// Creatures — the non-humanoid dead, built and animated in code
//
// Owner (phase 2, after a grilling session): "real creature models…
// try making them for uniqueness and perfect fit." The humanoids are
// rigged models; these five were primitive stacks (an ovoid on eight
// sticks, a sphere, a cone). Each is now a JOINTED BODY with its own
// procedural animation, driven by the creature's real state:
//
//   spider        Skitterhusk — 8 three-segment legs on an alternating
//                 tetrapod gait, husk-spiked abdomen, chelicerae, 8 eyes;
//                 rears on its front legs and lunges to strike
//   slime         The Seep — a gel body wobbling in the vertex shader,
//                 bones and a burning heart suspended inside; it hops by
//                 squash and stretch, and lunges as a reaching tongue
//   ice_elemental Rimeshade — a hovering body of ice shards around a
//                 core; shard-chain arms ending in blades; orbiting shards
//   dragon        Xartharael — a jointed spine (neck, body, tail) that
//                 waves, a horned skull with an opening jaw, membrane
//                 wings that fold and beat, four legs, dorsal spines
//   sandworm      The Burrower — ringed armour segments rising from a
//                 churned mound, a four-petal mouth with teeth and a
//                 glowing throat; it undulates, rears back and strikes
//
// Contract with EntityForge: `buildCreature(type, mats)` returns a Group
// facing +Z whose `userData.creature.animate(dt, t, s)` is called every
// frame with s = { speed (m/s), attack ('none'|'windup'|'strike'|
// 'recover'), strain 0..1 }. The mesh named 'core' carries the
// composition's strain glow, exactly like the old plans.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
function h(i, s = 0) { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); }

// ── Geometry kit ──────────────────────────────────────────

/** Tapered tube along a curve; r(t) gives the radius 0..1 along it. */
function taperTube(curve, r, segs = 16, rad = 10, ry = 1) {
  const frames = curve.computeFrenetFrames(segs, false);
  const pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, p = curve.getPointAt(t), N = frames.normals[i], B = frames.binormals[i], rr = r(t);
    for (let j = 0; j <= rad; j++) {
      const a = (j / rad) * TAU, c = Math.cos(a), s = Math.sin(a);
      pos.push(p.x + rr * (c * N.x + s * B.x * ry), p.y + rr * (c * N.y + s * B.y * ry), p.z + rr * (c * N.z + s * B.z * ry));
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < rad; j++) {
    const a = i * (rad + 1) + j, b = a + rad + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** A lumpy ellipsoid (smooth-shaded). */
function blob(rx, ry, rz, detail = 3, lump = 0.06, seed = 1) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + (Math.sin(x * 5.1 + seed) * Math.sin(y * 4.3 + seed * 2) * Math.sin(z * 4.7) + h(i, seed) * 0.4 - 0.2) * lump;
    p.setXYZ(i, x * rx * n, y * ry * n, z * rz * n);
  }
  g.computeVertexNormals();
  return g;
}
/** A segment (bone of a limb) along +X, length L, radius r0 → r1. */
function limbSeg(L, r0, r1, rad = 7) {
  const g = new THREE.CylinderGeometry(r1, r0, L, rad, 3);
  g.rotateZ(-Math.PI / 2); g.translate(L / 2, 0, 0);
  return g;
}
function cone(r, L, rad = 6) { const g = new THREE.ConeGeometry(r, L, rad); g.translate(0, L / 2, 0); return g; }
function mesh(g, m, name) { const o = new THREE.Mesh(g, m); if (name) o.name = name; o.castShadow = true; o.receiveShadow = true; return o; }

/** A jointed limb: joints[i] rotate; segments run along each joint's +X. */
function limb(lengths, radii, mat, knob = null) {
  const root = new THREE.Group(), joints = [];
  let parent = root;
  lengths.forEach((L, i) => {
    const j = new THREE.Group();
    parent.add(j); joints.push(j);
    j.add(mesh(limbSeg(L, radii[i], radii[i + 1] ?? radii[i] * 0.6), mat));
    if (knob) { const k = mesh(new THREE.SphereGeometry(radii[i] * 1.15, 8, 6), knob); j.add(k); }
    const next = new THREE.Group(); next.position.x = L; j.add(next);
    parent = next;
  });
  return { root, joints, tip: parent };
}

// Element-tinted variants of the shared materials, cached per element.
const _matCache = new Map();
function tinted(key, base, make) {
  const k = `${key}:${base.uuid}`;
  if (!_matCache.has(k)) _matCache.set(k, make());
  return _matCache.get(k);
}

// ══════════════════════════════════════════════════════════
// SKITTERHUSK — the husk spider
// ══════════════════════════════════════════════════════════
function buildSpider(m) {
  const g = new THREE.Group();
  const chitin = tinted('chitin', m.shell, () => { const c = m.shell.clone(); c.roughness = 0.45; c.metalness = 0.15; c.flatShading = false; return c; });
  const dark = tinted('chitinDark', m.shell, () => { const c = m.shell.clone(); c.color = m.shell.color.clone().multiplyScalar(0.45); c.roughness = 0.6; c.flatShading = false; return c; });
  const body = new THREE.Group(); body.position.y = 0.52; g.add(body);
  // Cephalothorax: a domed plate with a ridge.
  const thorax = mesh(blob(0.3, 0.15, 0.34, 3, 0.05, 2), chitin); thorax.position.z = 0.18; body.add(thorax);
  const ridge = mesh(blob(0.06, 0.05, 0.26, 2, 0.1, 3), dark); ridge.position.set(0, 0.12, 0.16); body.add(ridge);
  // Abdomen: bulbous, banded, husk spikes in rows, the core seated in it.
  const abd = new THREE.Group(); abd.position.set(0, 0.12, -0.36); abd.rotation.x = -0.25; body.add(abd);
  abd.add(mesh(blob(0.42, 0.36, 0.52, 3, 0.07, 5), chitin));
  for (let i = 0; i < 4; i++) {
    const band = mesh(new THREE.TorusGeometry(0.4 - Math.abs(i - 1.5) * 0.07, 0.025, 6, 22), dark);
    band.rotation.y = Math.PI / 2; band.scale.set(1, 0.85, 1); band.position.z = -0.3 + i * 0.2; abd.add(band);
  }
  for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) {
    const sp = mesh(cone(0.03, 0.16 + h(r * 4 + i) * 0.1, 5), m.bone);
    const a = (r - 1) * 0.5;
    sp.position.set(Math.sin(a) * 0.32, 0.26 + Math.cos(a) * 0.04, -0.3 + i * 0.18);
    sp.rotation.set(-0.5, 0, -a * 0.9); abd.add(sp);
  }
  const core = mesh(new THREE.IcosahedronGeometry(0.1, 1), m.core, 'core'); core.position.set(0, 0.3, -0.05); core.scale.set(1, 0.5, 1.4); abd.add(core);
  // Head: chelicerae with fangs, pedipalps, eight eyes.
  const head = new THREE.Group(); head.position.set(0, 0.0, 0.48); body.add(head);
  const fangs = [];
  for (const s of [-1, 1]) {
    const ch = new THREE.Group(); ch.position.set(s * 0.07, -0.02, 0); head.add(ch);
    ch.add(mesh(blob(0.06, 0.08, 0.07, 2, 0.08, s + 7), chitin));
    const fang = new THREE.Group(); fang.position.set(0, -0.06, 0.03); ch.add(fang);
    const f = mesh(cone(0.022, 0.16, 5), m.bone); f.rotation.x = Math.PI * 0.85; fang.add(f);
    fangs.push({ g: fang, s });
    const palp = limb([0.14, 0.12], [0.022, 0.016, 0.01], chitin);
    palp.root.position.set(s * 0.12, 0, 0); palp.root.rotation.set(0, s > 0 ? -0.8 : -Math.PI + 0.8, -0.4); head.add(palp.root);
  }
  const eyeMat = m.accent;
  for (let i = 0; i < 8; i++) {
    const row = i < 4 ? 0 : 1, k = i % 4;
    const e = mesh(new THREE.SphereGeometry(row ? 0.024 : 0.034, 8, 6), m.core);
    e.position.set((k - 1.5) * (row ? 0.05 : 0.045), 0.1 + row * 0.04, row ? -0.02 : 0.02); head.add(e);
  }
  // Legs: 4 per side, coxa→femur→tibia→tarsus.
  const legs = [];
  for (let i = 0; i < 8; i++) {
    const s = i < 4 ? -1 : 1, k = i % 4;
    const L = limb([0.12, 0.5, 0.55, 0.3], [0.05, 0.045, 0.032, 0.02, 0.008], chitin, dark);
    L.root.position.set(s * 0.22, 0, 0.32 - k * 0.15);
    // Splay: the leg's +X points outward; front pair angled forward, back pair back.
    L.root.rotation.y = s > 0 ? (0.95 - k * 0.62) : Math.PI - (0.95 - k * 0.62);
    L.joints[0].rotation.z = 0.35;  // coxa up
    L.joints[1].rotation.z = 0.55;  // femur rising to the knee
    L.joints[2].rotation.z = -1.65; // tibia down
    L.joints[3].rotation.z = -0.55; // tarsus to the ground
    body.add(L.root);
    legs.push({ L, s, k, phase: (k % 2 === 0) === (s > 0) ? 0 : Math.PI, base: L.root.rotation.y });
  }
  let ph = 0, lunge = 0;
  g.userData.creature = {
    animate(dt, t, st) {
      const gait = Math.min(1, st.speed / 2.2);
      ph += dt * (2 + st.speed * 3.2);
      const atk = st.attack === 'windup' ? 1 : st.attack === 'strike' ? 2 : 0;
      lunge += ((atk === 2 ? 1 : 0) - lunge) * Math.min(1, dt * 14);
      const rear = st.attack === 'windup' ? 1 : 0;
      body.position.y = 0.52 + Math.abs(Math.sin(ph)) * 0.025 * gait + Math.sin(t * 2) * 0.006;
      body.rotation.x += ((rear ? -0.32 : 0) - body.rotation.x) * Math.min(1, dt * 8);
      body.position.z = lunge * 0.3;
      abd.rotation.x = -0.25 + Math.sin(t * 1.7) * 0.04 + Math.sin(ph * 2) * 0.03 * gait;
      for (const lg of legs) {
        const p = ph + lg.phase;
        const lift = Math.max(0, Math.sin(p)) * gait;
        lg.L.root.rotation.y = lg.base + Math.cos(p) * 0.22 * gait * (lg.s > 0 ? 1 : -1);
        lg.L.joints[1].rotation.z = 0.55 + lift * 0.35 + (lg.k === 0 ? rear * 0.9 : 0);
        lg.L.joints[2].rotation.z = -1.65 + lift * 0.25 + (lg.k === 0 ? rear * 0.7 : 0);
      }
      for (const f of fangs) f.g.rotation.z = f.s * (0.25 + (rear ? 0.35 : 0) - lunge * 0.5 + Math.sin(t * 9) * 0.03);
    },
  };
  return g;
}

// ══════════════════════════════════════════════════════════
// THE SEEP — pitch ooze
// ══════════════════════════════════════════════════════════
function buildSlime(m) {
  const g = new THREE.Group();
  const gel = tinted('gel', m.shell, () => {
    const c = new THREE.MeshStandardMaterial({
      color: m.shell.color.clone().multiplyScalar(0.55), roughness: 0.12, metalness: 0.05,
      transparent: true, opacity: 0.8, emissive: m.accent.color.clone().multiplyScalar(0.08),
    });
    c.onBeforeCompile = (sh) => {
      sh.uniforms.uT = { value: 0 }; c.userData.uT = sh.uniforms.uT;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
float seed = modelMatrix[3][0] * 0.37 + modelMatrix[3][2] * 0.71;
float w = sin(position.x * 7.0 + uT * 2.3 + seed) * sin(position.y * 6.0 + uT * 1.7) * sin(position.z * 6.5 + uT * 2.9 + seed);
transformed += normal * w * 0.06;
// The base spreads and sticks to the ground.
if (transformed.y < -0.25) { transformed.y = -0.25 + (transformed.y + 0.25) * 0.15; transformed.xz *= 1.15; }`);
    };
    return c;
  });
  const bodyG = new THREE.Group(); bodyG.position.y = 0.42; g.add(bodyG);
  const skin = mesh(new THREE.IcosahedronGeometry(0.5, 5), gel); bodyG.add(skin);
  // Suspended in it: a burning heart, a skull, ribs.
  const core = mesh(new THREE.IcosahedronGeometry(0.13, 2), m.core, 'core'); core.position.set(0.04, 0.02, 0); bodyG.add(core);
  const skull = mesh(blob(0.09, 0.08, 0.1, 2, 0.15, 3), m.bone); skull.position.set(-0.14, 0.14, 0.12); skull.rotation.set(0.6, 0.4, 0.2); bodyG.add(skull);
  for (let i = 0; i < 3; i++) {
    const rib = mesh(new THREE.TorusGeometry(0.1 + i * 0.02, 0.012, 5, 14, Math.PI * 1.1), m.bone);
    rib.position.set(0.12, -0.08 + i * 0.07, -0.08); rib.rotation.set(0.4, 1.2, 0.3 * i); bodyG.add(rib);
  }
  const puddle = mesh(new THREE.CircleGeometry(0.62, 24), gel); puddle.rotation.x = -Math.PI / 2; puddle.position.y = 0.01; g.add(puddle);
  let ph = 0, lunge = 0;
  g.userData.creature = {
    animate(dt, t, st) {
      if (gel.userData.uT) gel.userData.uT.value = t;
      const gait = Math.min(1, st.speed / 1.6);
      ph += dt * (1.5 + st.speed * 2.6);
      const hop = Math.max(0, Math.sin(ph)) * gait;
      const atk = st.attack;
      lunge += ((atk === 'strike' ? 1 : 0) - lunge) * Math.min(1, dt * 12);
      const crouch = atk === 'windup' ? 1 : 0;
      const sq = 1 + Math.sin(ph * 2) * 0.12 * gait + Math.sin(t * 2.1) * 0.04 - crouch * 0.28 + lunge * 0.15;
      bodyG.scale.set(1 / Math.sqrt(sq), sq, (1 / Math.sqrt(sq)) * (1 + lunge * 0.55));
      bodyG.position.y = 0.42 * sq + hop * 0.22;
      bodyG.position.z = lunge * 0.35;
      core.rotation.y += dt * 0.7; skull.rotation.z += dt * 0.2;
      core.position.y = 0.02 + Math.sin(t * 1.3) * 0.04;
    },
  };
  return g;
}

// ══════════════════════════════════════════════════════════
// RIMESHADE — the frost shade
// ══════════════════════════════════════════════════════════
function buildIce(m) {
  const g = new THREE.Group();
  const ice = tinted('ice', m.shell, () => new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xcfe6f2).lerp(m.shell.color, 0.25), roughness: 0.08, metalness: 0.1,
    transparent: true, opacity: 0.72, emissive: m.accent.color.clone().multiplyScalar(0.18),
  }));
  const shard = (r, L) => { const s = new THREE.OctahedronGeometry(r, 0); s.scale(1, L / r, 1); return s; };
  const torso = new THREE.Group(); torso.position.y = 1.35; g.add(torso);
  const core = mesh(new THREE.IcosahedronGeometry(0.14, 1), m.core, 'core'); torso.add(core);
  const shell = [];
  for (let i = 0; i < 16; i++) {
    const a = h(i, 1) * TAU, y = (h(i, 2) - 0.45) * 0.7, r = 0.22 + h(i, 3) * 0.1;
    const s = mesh(shard(0.06 + h(i, 4) * 0.05, 0.22 + h(i, 5) * 0.2), ice);
    s.position.set(Math.cos(a) * r, y, Math.sin(a) * r * 0.7);
    s.rotation.set((h(i, 6) - 0.5) * 1.2, a, (h(i, 7) - 0.5) * 1.2);
    s.userData.base = s.position.clone(); torso.add(s); shell.push(s);
  }
  const head = new THREE.Group(); head.position.y = 0.55; torso.add(head);
  for (let i = 0; i < 6; i++) {
    const s = mesh(shard(0.05, 0.22 + h(i, 9) * 0.25), ice);
    const a = (i / 6) * TAU;
    s.position.set(Math.cos(a) * 0.08, 0.1, Math.sin(a) * 0.06 - 0.03);
    s.rotation.set(-0.5 + Math.sin(a) * 0.4, 0, Math.cos(a) * 0.5); head.add(s);
  }
  for (const sx of [-1, 1]) { const e = mesh(new THREE.SphereGeometry(0.03, 8, 6), m.core); e.position.set(sx * 0.06, 0.04, 0.1); head.add(e); }
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.36, 0.25, 0); torso.add(sh);
    const up = new THREE.Group(); sh.add(up);
    const u = mesh(shard(0.07, 0.36), ice); u.position.y = -0.2; up.add(u);
    const el = new THREE.Group(); el.position.y = -0.4; up.add(el);
    const f = mesh(shard(0.06, 0.32), ice); f.position.y = -0.18; el.add(f);
    const blade = mesh(shard(0.05, 0.5), ice); blade.position.y = -0.62; el.add(blade);
    up.rotation.z = s * 0.25;
    arms.push({ up, el, s });
  }
  // The trailing lower body: shards spiralling down into nothing.
  const tail = [];
  for (let i = 0; i < 10; i++) {
    const s = mesh(shard(0.05 - i * 0.003, 0.18), ice);
    s.userData.orbitR = 0.18 - i * 0.012; s.userData.y = 1.0 - i * 0.09; s.userData.a = i * 0.9;
    g.add(s); tail.push(s);
  }
  let lunge = 0, raise = 0;
  g.userData.creature = {
    animate(dt, t, st) {
      const gait = Math.min(1, st.speed / 2);
      torso.position.y = 1.35 + Math.sin(t * 1.4) * 0.07;
      torso.rotation.x += ((gait * 0.25) - torso.rotation.x) * Math.min(1, dt * 4);
      raise += ((st.attack === 'windup' ? 1 : 0) - raise) * Math.min(1, dt * 7);
      lunge += ((st.attack === 'strike' ? 1 : 0) - lunge) * Math.min(1, dt * 14);
      for (const a of arms) {
        a.up.rotation.x = Math.sin(t * 1.1 + a.s) * 0.12 - raise * 2.2 + lunge * 1.6;
        a.el.rotation.x = -0.3 - raise * 0.6 + lunge * 0.3;
      }
      for (let i = 0; i < shell.length; i++) {
        const s = shell[i]; s.position.copy(s.userData.base).multiplyScalar(1 + Math.sin(t * 2 + i) * 0.04 + st.strain * 0.15);
        s.rotation.y += dt * 0.15;
      }
      for (const s of tail) {
        s.userData.a += dt * (1.2 + gait);
        s.position.set(Math.cos(s.userData.a) * s.userData.orbitR, s.userData.y + Math.sin(t * 1.4) * 0.07, Math.sin(s.userData.a) * s.userData.orbitR);
        s.rotation.y = -s.userData.a;
      }
      core.rotation.y += dt;
    },
  };
  return g;
}

// ══════════════════════════════════════════════════════════
// XARTHARAEL — the ancient wyrm
// ══════════════════════════════════════════════════════════
function buildDragon(m) {
  const g = new THREE.Group();
  const scale = tinted('scale', m.shell, () => { const c = m.shell.clone(); c.roughness = 0.55; c.metalness = 0.2; c.flatShading = false; return c; });
  const belly = tinted('belly', m.shell, () => { const c = m.shell.clone(); c.color = m.shell.color.clone().lerp(new THREE.Color(0xb8a68a), 0.45); c.roughness = 0.7; c.flatShading = false; return c; });
  const membrane = tinted('membrane', m.shell, () => new THREE.MeshStandardMaterial({
    color: m.shell.color.clone().multiplyScalar(0.5).lerp(m.accent.color, 0.15), roughness: 0.8, side: THREE.DoubleSide, transparent: true, opacity: 0.88,
  }));
  // Torso: the root of the spine.
  const torso = new THREE.Group(); torso.position.y = 1.55; g.add(torso);
  torso.add(mesh(blob(0.62, 0.55, 1.05, 3, 0.04, 4), scale));
  const bel = mesh(blob(0.5, 0.35, 0.9, 3, 0.03, 5), belly); bel.position.y = -0.22; torso.add(bel);
  const core = mesh(new THREE.IcosahedronGeometry(0.16, 1), m.core, 'core'); core.position.set(0, -0.15, 0.6); torso.add(core);
  // A spine chain: each link is a joint Group holding a tapered segment along +Z (or −Z).
  const chain = (n, len, r0, r1, dir, parent, z0) => {
    const links = []; let p = parent;
    for (let i = 0; i < n; i++) {
      const j = new THREE.Group(); j.position.z = i === 0 ? z0 : dir * len; p.add(j);
      const r = r0 + (r1 - r0) * (i / Math.max(1, n - 1));
      // Overlapping links (len·0.95 half-length): one continuous neck, not a string of beads.
      const sgm = mesh(blob(r, r * 0.92, len * 0.95, 2, 0.03, i + (dir > 0 ? 10 : 20)), scale); sgm.position.z = dir * len * 0.5; j.add(sgm);
      const spike = mesh(cone(r * 0.32, r * 1.1, 5), m.bone); spike.position.set(0, r * 0.82, dir * len * 0.5); spike.rotation.x = -dir * 0.6; j.add(spike);
      links.push(j); p = j;
    }
    return links;
  };
  const neck = chain(5, 0.36, 0.3, 0.2, 1, torso, 0.95);
  const tail = chain(8, 0.42, 0.34, 0.06, -1, torso, -0.95);
  // Skull at the neck's end: snout, jaw, horns, brow, eyes.
  const head = new THREE.Group(); head.position.z = 0.36; neck[neck.length - 1].add(head);
  const skull = mesh(blob(0.24, 0.2, 0.42, 3, 0.05, 31), scale); skull.position.z = 0.2; head.add(skull);
  const jaw = new THREE.Group(); jaw.position.set(0, -0.1, 0.0); head.add(jaw);
  const jm = mesh(blob(0.19, 0.07, 0.4, 2, 0.05, 32), belly); jm.position.z = 0.28; jaw.add(jm);
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {
    const t1 = mesh(cone(0.018, 0.07, 4), m.bone); t1.position.set(s * 0.12, 0.05, 0.12 + i * 0.07); jaw.add(t1);
    const t2 = mesh(cone(0.018, 0.07, 4), m.bone); t2.position.set(s * 0.13, -0.15, 0.14 + i * 0.07); t2.rotation.x = Math.PI; head.add(t2);
  }
  for (const s of [-1, 1]) {
    const horn = mesh(taperTube(new THREE.CatmullRomCurve3([V(0, 0, 0), V(s * 0.12, 0.12, -0.2), V(s * 0.2, 0.18, -0.5), V(s * 0.16, 0.32, -0.75)]), (t) => 0.06 * (1 - t) + 0.006, 12, 7), m.bone);
    horn.position.set(s * 0.12, 0.12, 0.05); head.add(horn);
    const eye = mesh(new THREE.SphereGeometry(0.035, 8, 6), m.core); eye.position.set(s * 0.15, 0.07, 0.3); head.add(eye);
    const brow = mesh(cone(0.04, 0.16, 4), scale); brow.position.set(s * 0.15, 0.13, 0.32); brow.rotation.set(-1.2, 0, s * 0.3); head.add(brow);
  }
  // Legs.
  const legs = [];
  for (const [z, front] of [[0.6, true], [-0.6, false]]) for (const s of [-1, 1]) {
    const L = limb([0.55, 0.6, 0.3], [0.17, 0.12, 0.08, 0.05], scale);
    L.root.position.set(s * 0.5, -0.1, z); L.root.rotation.set(0, s > 0 ? 0 : Math.PI, -1.15);
    L.joints[1].rotation.z = front ? 0.6 : -0.7; L.joints[2].rotation.z = front ? -0.45 : 0.75;
    for (let c = 0; c < 3; c++) { const cl = mesh(cone(0.025, 0.14, 4), m.bone); cl.position.set(0.28, -0.03, (c - 1) * 0.05); cl.rotation.z = -1.9; L.joints[2].add(cl); }
    torso.add(L.root); legs.push({ L, s, front, phase: (front === (s > 0)) ? 0 : Math.PI });
  }
  // Wings: arm bone + four fingers, membrane between them and the flank.
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(s * 0.45, 0.35, 0.35); torso.add(w);
    const pts = [V(0, 0, 0), V(s * 0.9, 0.45, -0.1), V(s * 1.8, 0.55, -0.35)];
    w.add(mesh(taperTube(new THREE.CatmullRomCurve3(pts), (t) => 0.07 * (1 - t) + 0.025, 10, 6), m.bone));
    const tipsL = [V(s * 2.7, 0.3, -0.7), V(s * 2.5, -0.1, -1.3), V(s * 2.0, -0.35, -1.8), V(s * 1.2, -0.45, -2.0)];
    for (const tp of tipsL) w.add(mesh(taperTube(new THREE.CatmullRomCurve3([pts[2], pts[2].clone().lerp(tp, 0.5).add(V(0, 0.08, 0)), tp]), (t) => 0.03 * (1 - t) + 0.008, 8, 5), m.bone));
    // Membrane: a fan of triangles from the wrist and the flank to the fingertips.
    const P = [pts[2], ...tipsL, V(s * 0.1, -0.2, -1.4), V(0, 0, 0)];
    const tri = [];
    for (let i = 1; i < P.length - 1; i++) tri.push(P[0], P[i], P[i + 1]);
    tri.push(P[0], P[P.length - 1], pts[1]);
    const mg = new THREE.BufferGeometry().setFromPoints(tri); mg.computeVertexNormals();
    const mm = new THREE.Mesh(mg, membrane); mm.castShadow = true; w.add(mm);
    wings.push({ w, s });
  }
  let ph = 0, rear = 0, snap = 0;
  g.userData.creature = {
    animate(dt, t, st) {
      const gait = Math.min(1, st.speed / 2.5);
      ph += dt * (1 + st.speed * 1.8);
      rear += ((st.attack === 'windup' ? 1 : 0) - rear) * Math.min(1, dt * 4);
      snap += ((st.attack === 'strike' ? 1 : 0) - snap) * Math.min(1, dt * 12);
      const breathe = Math.sin(t * 1.2);
      torso.scale.set(1 + breathe * 0.02, 1 + breathe * 0.03, 1);
      torso.position.y = 1.55 + Math.abs(Math.sin(ph)) * 0.05 * gait;
      torso.rotation.x = -rear * 0.25;
      neck.forEach((j, i) => {
        j.rotation.y = Math.sin(t * 0.9 - i * 0.5) * 0.08;
        j.rotation.x = -0.15 + Math.sin(t * 0.7 - i * 0.4) * 0.04 - rear * 0.08 + snap * 0.2;
      });
      jaw.rotation.x = 0.12 + Math.max(0, Math.sin(t * 0.8)) * 0.05 + rear * 0.45 + snap * 0.2;
      tail.forEach((j, i) => { j.rotation.y = Math.sin(t * 1.3 - i * 0.6) * (0.1 + gait * 0.08); j.rotation.x = 0.06 + Math.sin(t * 0.9 - i * 0.4) * 0.03; });
      for (const w of wings) {
        const beat = st.attack !== 'none' ? Math.sin(t * 5) * 0.5 : Math.sin(t * 0.6) * 0.08;
        w.w.rotation.z = w.s * (0.25 + beat + rear * 0.6);
        w.w.rotation.y = -w.s * (0.5 - rear * 0.4);
      }
      for (const lg of legs) {
        const p = ph + lg.phase;
        lg.L.root.rotation.x = Math.sin(p) * 0.35 * gait * lg.s;
        lg.L.joints[1].rotation.z = (lg.front ? 0.6 : -0.7) + Math.max(0, Math.cos(p)) * 0.3 * gait;
      }
    },
  };
  return g;
}

// ══════════════════════════════════════════════════════════
// THE BURROWER — sand wyrm
// ══════════════════════════════════════════════════════════
function buildWorm(m) {
  const g = new THREE.Group();
  const hide = tinted('wormHide', m.shell, () => { const c = m.shell.clone(); c.roughness = 0.65; c.flatShading = false; c.color = m.shell.color.clone().lerp(new THREE.Color(0x8a7458), 0.3); return c; });
  const plate = tinted('wormPlate', m.shell, () => { const c = m.shell.clone(); c.roughness = 0.4; c.metalness = 0.25; c.flatShading = false; c.color = m.shell.color.clone().multiplyScalar(0.55); return c; });
  const flesh = tinted('wormFlesh', m.shell, () => new THREE.MeshStandardMaterial({ color: 0x5a1e1a, roughness: 0.5, emissive: 0x1a0505 }));
  // The mound it breaks from.
  const mound = mesh(blob(1.1, 0.25, 1.1, 3, 0.25, 9), hide); mound.position.y = 0.02; g.add(mound);
  for (let i = 0; i < 7; i++) { const r = mesh(blob(0.12 + h(i) * 0.1, 0.08, 0.12, 1, 0.3, i), plate); const a = i / 7 * TAU; r.position.set(Math.cos(a) * 1.0, 0.08, Math.sin(a) * 1.0); g.add(r); }
  // Segments: corrugated rings rising from the ground.
  const segs = []; let parent = g;
  const N = 9;
  for (let i = 0; i < N; i++) {
    const j = new THREE.Group(); j.position.y = i === 0 ? -0.2 : 0.42; parent.add(j);
    const r = 0.5 - i * 0.022;
    const prof = [];
    for (let k = 0; k <= 8; k++) { const t = k / 8; prof.push(new THREE.Vector2(r * (0.9 + 0.1 * Math.sin(t * Math.PI)) + (k % 4 === 0 ? 0.03 : 0), t * 0.44)); }
    const ring = mesh(new THREE.LatheGeometry(prof, 20), hide); j.add(ring);
    const pl = mesh(new THREE.CylinderGeometry(r * 1.04, r * 1.06, 0.12, 20, 1, true, -1.1, 2.2), plate); pl.position.y = 0.28; j.add(pl);
    segs.push(j); parent = j;
  }
  // The mouth: four petals hinged at the rim, rings of teeth, a glowing throat.
  const head = new THREE.Group(); head.position.y = 0.44; parent.add(head);
  const throat = mesh(new THREE.CylinderGeometry(0.2, 0.32, 0.25, 16, 1, true), flesh); throat.position.y = 0.05; head.add(throat);
  const core = mesh(new THREE.IcosahedronGeometry(0.14, 1), m.core, 'core'); core.position.y = -0.05; head.add(core);
  const petals = [];
  for (let i = 0; i < 4; i++) {
    const hinge = new THREE.Group(); hinge.rotation.y = i * Math.PI / 2; head.add(hinge);
    const p = new THREE.Group(); p.position.z = 0.36; hinge.add(p);
    const shellG = new THREE.SphereGeometry(0.42, 12, 8, -0.5, 1.0, 0, Math.PI * 0.45); shellG.translate(0, -0.05, -0.36);
    p.add(mesh(shellG, plate));
    for (let k = 0; k < 4; k++) { const tooth = mesh(cone(0.03, 0.14, 4), m.bone); tooth.position.set((k - 1.5) * 0.08, 0.2, -0.12); tooth.rotation.x = -0.9; p.add(tooth); }
    petals.push(p);
  }
  let rear = 0, snap = 0, ph = 0;
  g.userData.creature = {
    animate(dt, t, st) {
      ph += dt * (1 + st.speed * 1.5);
      rear += ((st.attack === 'windup' ? 1 : 0) - rear) * Math.min(1, dt * 5);
      snap += ((st.attack === 'strike' ? 1 : 0) - snap) * Math.min(1, dt * 13);
      segs.forEach((j, i) => {
        const k = i / N;
        j.rotation.x = Math.sin(ph * 1.3 - i * 0.7) * 0.07 + k * (0.06 - rear * 0.28 + snap * 0.42);
        j.rotation.z = Math.sin(ph - i * 0.6) * 0.06;
      });
      const open = 0.15 + Math.max(0, Math.sin(t * 0.9)) * 0.1 + rear * 0.9 - snap * 0.6;
      for (const p of petals) p.rotation.x = -open;
      core.scale.setScalar(1 + Math.sin(t * 3) * 0.08 + st.strain * 0.4);
    },
  };
  return g;
}


// ══════════════════════════════════════════════════════════
// THE WORLD EXPANSION'S CREATURES (data/expansion.js)
//
// Animals are NOT element-tinted: a deer is the colour of a deer.
// `natural(color, rough)` caches one material per colour.
// ══════════════════════════════════════════════════════════
const _nat = new Map();
function natural(color, rough = 0.9, extra = {}) {
  const k = `${color}:${rough}:${JSON.stringify(extra)}`;
  if (!_nat.has(k)) _nat.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
  return _nat.get(k);
}

/**
 * The generic four-legged animal. A spec (QUAD_SPECS) gives body
 * proportions in metres, leg length and thickness, neck, head, colours
 * and the parts that make a species: antlers, curled or spiked horns,
 * tusks, a mane, a hump, a long snout, a beak, a beard, scutes, spines,
 * a glowing belly, a sprawled (lizard) stance.
 * Animation: a diagonal-pair walk/gallop from speed, head-down grazing
 * when still, head-low charge on windup, a lunge on strike.
 */
export function buildQuad(sp) {
  const g = new THREE.Group();
  const fur = natural(sp.fur, 0.92), belly = natural(sp.belly, 0.95);
  const horn = natural(0xd8ccb0, 0.6), dark = natural(0x1a1612, 0.7), eyeM = natural(0x0a0806, 0.25);
  const [bx, by, bz] = sp.body;
  const sprawl = !!sp.sprawl;
  // ⚠️ Hip height = the leg's own length: legs hang from −0.3·by under the
  // body centre and are 1.04·legLen long, so anything else floats or sinks.
  const H = sprawl ? sp.legLen * 0.75 + by * 0.6 : sp.legLen * 1.04 + by * 0.3 - sp.legR * 0.5;
  const body = new THREE.Group(); body.position.y = H; g.add(body);
  body.add(mesh(blob(bx, by, bz, 3, 0.05, sp.legLen * 10), fur));
  const bel = mesh(blob(bx * 0.82, by * 0.55, bz * 0.82, 2, 0.04, 3), belly); bel.position.y = -by * 0.42; body.add(bel);
  if (sp.hump) { const hm = mesh(blob(bx * 0.7, by * 0.5, bz * 0.4, 2, 0.08, 4), fur); hm.position.set(0, by * 0.75, bz * 0.45); body.add(hm); }
  if (sp.scutes) for (let i = 0; i < 9; i++) { const sc = mesh(cone(0.04, 0.09, 4), dark); sc.position.set((i % 2 ? 1 : -1) * bx * 0.25, by * 0.9, bz * (0.8 - i * 0.2)); body.add(sc); }
  if (sp.spines) for (let i = 0; i < 7; i++) { const sc = mesh(cone(0.025, 0.14, 5), natural(sp.glow || 0xd04a18, 0.4, { emissive: sp.glow || 0, emissiveIntensity: 0.7 })); sc.position.set(0, by * 0.95, bz * (0.7 - i * 0.22)); sc.rotation.x = -0.3; body.add(sc); }
  if (sp.bristle) for (let i = 0; i < 10; i++) { const sc = mesh(cone(0.02, 0.1, 4), dark); sc.position.set(0, by * 0.95, bz * (0.75 - i * 0.12)); sc.rotation.x = -0.6; body.add(sc); }
  if (sp.glow) { const gl = mesh(blob(bx * 0.6, by * 0.2, bz * 0.7, 2, 0.1, 6), natural(sp.glow, 0.5, { emissive: sp.glow, emissiveIntensity: 0.9 }), 'core'); gl.position.y = -by * 0.62; body.add(gl); }
  // Neck and head.
  const neckBase = new THREE.Group(); neckBase.position.set(0, by * 0.35, bz * 0.82); body.add(neckBase);
  const neckLen = Math.max(0.08, sp.neck);
  const neckRise = sprawl ? 0.05 : 0.75;
  const neckDir = V(0, neckRise, 1).normalize();
  const nTip = neckDir.clone().multiplyScalar(neckLen);
  const neckR = Math.min(bx, by) * 0.55;
  neckBase.add(mesh(taperTube(new THREE.CatmullRomCurve3([V(0, 0, -0.05), nTip.clone().multiplyScalar(0.5), nTip]), (t) => neckR * (1 - t * 0.35), 8, 10), fur));
  if (sp.mane) { const mn = mesh(blob(neckR * 0.6, neckR * 1.1, neckLen * 0.55, 2, 0.15, 7), natural(sp.mane, 0.95)); mn.position.copy(nTip).multiplyScalar(0.5); mn.position.y += neckR * 0.5; mn.lookAt(nTip.clone().add(V(0, neckR, 0))); neckBase.add(mn); }
  const head = new THREE.Group(); head.position.copy(nTip); neckBase.add(head);
  const [hx, hy, hz] = sp.head;
  const skull = mesh(blob(hx, hy, hz * 0.6, 2, 0.04, 8), fur); skull.position.z = hz * 0.15; head.add(skull);
  const muzzle = mesh(blob(hx * 0.62, hy * 0.6, hz * 0.55, 2, 0.04, 9), sp.beak ? horn : fur); muzzle.position.set(0, -hy * 0.25, hz * (sp.snout || sp.beak ? 0.75 : 0.55)); head.add(muzzle);
  if (sp.beak) { const bk = mesh(cone(hx * 0.3, hz * 0.9, 6), horn); bk.rotation.x = Math.PI / 2; bk.position.set(0, -hy * 0.2, hz * 0.95); head.add(bk); }
  const nose = mesh(new THREE.SphereGeometry(hx * 0.18, 6, 5), dark); nose.position.set(0, -hy * 0.15, hz * (sp.snout ? 1.28 : 1.02)); head.add(nose);
  // A jaw that opens on the strike.
  const jaw = new THREE.Group(); jaw.position.set(0, -hy * 0.45, hz * 0.3); head.add(jaw);
  jaw.add(mesh(blob(hx * 0.5, hy * 0.18, hz * 0.55, 1, 0.03, 10), fur)).position.z = hz * 0.35;
  for (const sx of [-1, 1]) { const ey = mesh(new THREE.SphereGeometry(hx * 0.13, 7, 5), eyeM); ey.position.set(sx * hx * 0.68, hy * 0.2, hz * 0.45); head.add(ey); }
  const earN = sp.ears || 0;
  for (const sx of [-1, 1]) if (earN) {
    const L = earN === 4 ? hy * 1.1 : earN === 3 ? hy * 1.3 : hy * 0.8;
    const ea = mesh(cone(hx * 0.22, L, 5), fur); ea.position.set(sx * hx * 0.55, hy * 0.75, hz * 0.05); ea.rotation.z = -sx * 0.35; head.add(ea);
    if (earN === 4) { const tuft = mesh(cone(hx * 0.05, L * 0.4, 3), dark); tuft.position.set(sx * hx * 0.62, hy * 0.75 + L, hz * 0.05); head.add(tuft); }
  }
  if (sp.antlers) for (const sx of [-1, 1]) {
    const pts = [V(sx * hx * 0.4, hy * 0.7, 0), V(sx * hx * 1.3, hy * 2.2, -hz * 0.3), V(sx * hx * 2.0 * sp.antlers, hy * 3.6 * Math.sqrt(sp.antlers), -hz * 0.5)];
    head.add(mesh(taperTube(new THREE.CatmullRomCurve3(pts), (t) => 0.025 * (1 - t * 0.6), 10, 6), horn));
    for (let k = 1; k <= 1 + sp.antlers; k++) {
      const base = new THREE.CatmullRomCurve3(pts).getPoint(k / (2 + sp.antlers));
      const tine = [base, base.clone().add(V(sx * 0.06, 0.22, 0.12))];
      head.add(mesh(taperTube(new THREE.CatmullRomCurve3(tine), (t) => 0.016 * (1 - t * 0.7), 4, 5), horn));
    }
  }
  if (sp.horns === 'curl') for (const sx of [-1, 1]) {
    const pts = []; for (let k = 0; k <= 8; k++) { const a = k / 8 * 4.2; pts.push(V(sx * (hx * 0.4 + Math.sin(a) * 0.1 + k * 0.012), hy * 0.7 + Math.cos(a) * 0.1, -hz * 0.1 - Math.sin(a * 0.5) * 0.12)); }
    head.add(mesh(taperTube(new THREE.CatmullRomCurve3(pts), (t) => 0.035 * (1 - t * 0.7), 16, 7), horn));
  }
  if (sp.horns === 'spike') for (const sx of [-1, 1]) {
    const hn = mesh(cone(0.022, hy * 3.2, 6), dark); hn.position.set(sx * hx * 0.35, hy * 0.7, -hz * 0.05); hn.rotation.set(-0.45, 0, -sx * 0.1); head.add(hn);
  }
  if (sp.tusks) for (const sx of [-1, 1]) { const tk = mesh(cone(0.022, 0.13, 5), horn); tk.position.set(sx * hx * 0.45, -hy * 0.3, hz * 1.0); tk.rotation.set(-0.5, 0, -sx * 0.6); head.add(tk); }
  if (sp.beard) { const bd = mesh(cone(hx * 0.2, hy * 0.7, 5), natural(0xe8e4d8, 0.95)); bd.rotation.x = Math.PI; bd.position.set(0, -hy * 0.75, hz * 0.7); head.add(bd); }
  // Legs: thigh → shin → foot, hanging down (or out and down when sprawled).
  const legs = [];
  const L = sp.legLen, lr = sp.legR;
  for (let i = 0; i < 4; i++) {
    const front = i < 2, sx = i % 2 ? 1 : -1;
    const lg = limb(sprawl ? [L * 0.45, L * 0.75] : [L * 0.48, L * 0.44, L * 0.12], sprawl ? [lr, lr * 0.85, lr * 0.6] : [lr * 1.25, lr, lr * 0.75, lr * 0.65], fur);
    lg.root.position.set(sx * bx * 0.62, -by * 0.3, (front ? 1 : -1) * bz * 0.62);
    if (sprawl) { lg.root.rotation.set(0, sx > 0 ? 0 : Math.PI, -0.35); lg.joints[1].rotation.z = -1.6; }
    else { lg.root.rotation.z = -Math.PI / 2; lg.joints[1].rotation.z = front ? -0.15 : 0.25; lg.joints[2].rotation.z = front ? 0.1 : -0.2; }
    const hoof = mesh(new THREE.SphereGeometry(lr * 0.95, 6, 5), dark); lg.tip.add(hoof);
    body.add(lg.root);
    legs.push({ lg, front, sx, phase: (front === (sx > 0)) ? 0 : Math.PI });
  }
  // Tail.
  let tail = null;
  if (sp.tail) {
    tail = new THREE.Group(); tail.position.set(0, by * 0.3, -bz * 0.92); body.add(tail);
    const tl = sp.tail, droop = sprawl ? -0.05 : -0.6;
    tail.add(mesh(taperTube(new THREE.CatmullRomCurve3([V(0, 0, 0), V(0, droop * tl * 0.4, -tl * 0.5), V(0, droop * tl, -tl)]), (t) => Math.max(0.01, (sprawl ? by * 0.55 : 0.05 + tl * 0.08) * (1 - t * 0.85)), 10, 7), fur));
  }
  let ph = h(sp.legLen * 7) * 6, lunge = 0, low = 0, graze = 0;
  g.userData.creature = {
    animate(dt, t, st) {
      const gait = Math.min(1, st.speed / 2.5), run = Math.min(1, Math.max(0, (st.speed - 3) / 3));
      ph += dt * (2.2 + st.speed * (sprawl ? 2.4 : 1.7));
      low += ((st.attack === 'windup' ? 1 : 0) - low) * Math.min(1, dt * 8);
      lunge += ((st.attack === 'strike' ? 1 : 0) - lunge) * Math.min(1, dt * 14);
      // Head down to graze when standing still, now and then.
      const wantGraze = st.speed < 0.2 && st.attack === 'none' && Math.sin(t * 0.4 + sp.legLen * 3) > 0.3 ? 1 : 0;
      graze += (wantGraze - graze) * Math.min(1, dt * 2);
      body.position.y = H + Math.abs(Math.sin(ph)) * (0.03 + run * 0.06) * gait - low * 0.08;
      body.position.z = lunge * 0.35;
      body.rotation.x = Math.sin(ph * 2) * 0.03 * run + low * 0.08;
      neckBase.rotation.x = graze * (sprawl ? 0.1 : 1.0) + low * 0.55 - lunge * 0.4 + Math.sin(ph) * 0.04 * gait;
      jaw.rotation.x = lunge * 0.55 + low * 0.15 + (graze ? Math.max(0, Math.sin(t * 6)) * 0.12 : 0);
      for (const l of legs) {
        const p = ph + l.phase + (run && l.front ? 0.6 : 0);
        const swing = Math.sin(p) * (0.35 + run * 0.35) * gait;
        if (sprawl) { l.lg.root.rotation.y = (l.sx > 0 ? 0 : Math.PI) + swing * 0.8 * l.sx; }
        else {
          l.lg.joints[0].rotation.y = swing;
          l.lg.joints[1].rotation.y = Math.max(0, -Math.sin(p)) * 0.6 * gait * (l.front ? -1 : 1);
        }
      }
      if (tail) { tail.rotation.y = Math.sin(t * 2.4 + ph * 0.3) * (sprawl ? 0.4 : 0.25); tail.rotation.x = run * 0.3; }
    },
  };
  return g;
}

/** Rust Crawler — a plated, six-legged ore-eater. */
function buildBeetle(m) {
  const g = new THREE.Group();
  const shellM = natural(0x7a3a20, 0.45, { metalness: 0.45 }), under = natural(0x2a1a14, 0.8), rust = natural(0xa85a2a, 0.7, { metalness: 0.3 });
  const body = new THREE.Group(); body.position.y = 0.42; g.add(body);
  body.add(mesh(blob(0.42, 0.18, 0.62, 2, 0.06, 3), under));
  for (let i = 0; i < 4; i++) { const pl = mesh(blob(0.46 - i * 0.04, 0.12, 0.2, 2, 0.08, i + 1), i % 2 ? rust : shellM); pl.position.set(0, 0.12 + Math.sin(i) * 0.02, 0.36 - i * 0.24); body.add(pl); }
  const core = mesh(new THREE.IcosahedronGeometry(0.07, 1), m.core, 'core'); core.position.set(0, 0.06, -0.62); body.add(core);
  const head = new THREE.Group(); head.position.set(0, 0, 0.66); body.add(head);
  head.add(mesh(blob(0.2, 0.12, 0.16, 2, 0.05, 9), shellM));
  const mands = [];
  for (const s of [-1, 1]) { const md = new THREE.Group(); md.position.set(s * 0.1, -0.03, 0.12); head.add(md); const c = mesh(cone(0.035, 0.2, 5), natural(0x1a1410, 0.4)); c.rotation.set(Math.PI / 2, 0, s * 0.5); md.add(c); mands.push({ md, s }); }
  const legs = [];
  for (let i = 0; i < 6; i++) {
    const s = i < 3 ? -1 : 1, k = i % 3;
    const lg = limb([0.3, 0.34], [0.04, 0.03, 0.015], under);
    lg.root.position.set(s * 0.32, -0.04, 0.3 - k * 0.3); lg.root.rotation.y = s > 0 ? 0.3 - k * 0.3 : Math.PI - 0.3 + k * 0.3;
    lg.joints[0].rotation.z = 0.4; lg.joints[1].rotation.z = -1.5; body.add(lg.root);
    legs.push({ lg, s, base: lg.root.rotation.y, phase: (k % 2 === 0) === (s > 0) ? 0 : Math.PI });
  }
  let ph = 0, lunge = 0;
  g.userData.creature = { animate(dt, t, st) {
    const gait = Math.min(1, st.speed / 2); ph += dt * (3 + st.speed * 3);
    lunge += ((st.attack === 'strike' ? 1 : 0) - lunge) * Math.min(1, dt * 12);
    body.position.z = lunge * 0.25; body.position.y = 0.42 + Math.abs(Math.sin(ph)) * 0.015 * gait;
    for (const l of legs) { l.lg.root.rotation.y = l.base + Math.cos(ph + l.phase) * 0.25 * gait * l.s; l.lg.joints[0].rotation.z = 0.4 + Math.max(0, Math.sin(ph + l.phase)) * 0.3 * gait; }
    for (const md of mands) md.md.rotation.y = md.s * (0.25 + (st.attack === 'windup' ? 0.35 : 0) - lunge * 0.5);
  } };
  return g;
}

/** Bog Horror — a rooted mound of peat and bone with long tendril arms. */
function buildHorror(m) {
  const g = new THREE.Group();
  const peat = natural(0x2a2214, 0.95), moss = natural(0x3a4a22, 0.95), bone = m.bone;
  g.add(mesh(blob(1.0, 0.35, 1.0, 3, 0.2, 2), peat));
  const trunk = new THREE.Group(); trunk.position.y = 0.3; g.add(trunk);
  trunk.add(mesh(blob(0.55, 0.8, 0.45, 3, 0.12, 4), peat)).position.y = 0.6;
  const mossy = mesh(blob(0.5, 0.25, 0.42, 2, 0.2, 5), moss); mossy.position.y = 1.25; trunk.add(mossy);
  for (let i = 0; i < 5; i++) { const r = mesh(cone(0.03, 0.25, 4), bone); r.position.set(Math.sin(i) * 0.4, 0.7 + i * 0.1, 0.3); r.rotation.set(1.2, 0, Math.sin(i)); trunk.add(r); }
  const core = mesh(new THREE.IcosahedronGeometry(0.12, 1), m.core, 'core'); core.position.set(0, 1.0, 0.35); trunk.add(core);
  for (const sx of [-1, 1]) { const e = mesh(new THREE.SphereGeometry(0.05, 8, 6), natural(0xc8f070, 0.3, { emissive: 0x88c040, emissiveIntensity: 1.2 })); e.position.set(sx * 0.15, 1.35, 0.32); trunk.add(e); }
  // Tendrils: chains of segments that wave and lash.
  const arms = [];
  for (let k = 0; k < 4; k++) {
    const root = new THREE.Group(); const a = (k / 4) * TAU + 0.4;
    root.position.set(Math.cos(a) * 0.45, 0.9, Math.sin(a) * 0.3 + 0.1); root.rotation.y = a; trunk.add(root);
    const segs = []; let par = root;
    for (let i = 0; i < 7; i++) { const j = new THREE.Group(); j.position.x = i ? 0.32 : 0; par.add(j); j.add(mesh(limbSeg(0.34, 0.09 - i * 0.011, 0.08 - i * 0.011), i % 2 ? moss : peat)); segs.push(j); par = j; }
    arms.push({ segs, k });
  }
  let lash = 0;
  g.userData.creature = { animate(dt, t, st) {
    lash += ((st.attack === 'strike' ? 1 : st.attack === 'windup' ? -0.6 : 0) - lash) * Math.min(1, dt * 8);
    trunk.rotation.z = Math.sin(t * 0.7) * 0.05; trunk.position.y = 0.3 + Math.sin(t * 1.1) * 0.03;
    for (const a of arms) a.segs.forEach((j, i) => {
      j.rotation.z = Math.sin(t * 1.6 + i * 0.6 + a.k) * 0.25 - 0.15 + lash * (i === 0 ? -0.8 : 0.12);
      j.rotation.y = Math.cos(t * 1.1 + i * 0.5 + a.k * 2) * 0.2;
    });
  } };
  return g;
}

/** Marsh Wisp — a cold light that floats, with motes circling it. */
function buildWisp(m) {
  const g = new THREE.Group();
  const glow = natural(0xc8f0ff, 0.2, { emissive: 0x90d8ff, emissiveIntensity: 2.2, transparent: true, opacity: 0.9 });
  const halo = natural(0x90d8ff, 0.2, { emissive: 0x6ab0e0, emissiveIntensity: 1, transparent: true, opacity: 0.18, depthWrite: false });
  const c = new THREE.Group(); c.position.y = 1.4; g.add(c);
  const core = mesh(new THREE.IcosahedronGeometry(0.16, 2), glow, 'core'); c.add(core);
  const hal = mesh(new THREE.SphereGeometry(0.45, 16, 12), halo); hal.castShadow = false; c.add(hal);
  const motes = [];
  for (let i = 0; i < 5; i++) { const mo = mesh(new THREE.SphereGeometry(0.035, 6, 5), glow); mo.castShadow = false; c.add(mo); motes.push(mo); }
  const trail = [];
  for (let i = 0; i < 4; i++) { const tr = mesh(new THREE.SphereGeometry(0.1 - i * 0.02, 8, 6), halo); tr.castShadow = false; tr.position.y = -0.2 - i * 0.18; c.add(tr); trail.push(tr); }
  g.userData.creature = { animate(dt, t, st) {
    c.position.y = 1.4 + Math.sin(t * 1.3) * 0.18 + (st.attack === 'windup' ? 0.25 : 0);
    hal.scale.setScalar(1 + Math.sin(t * 5) * 0.08 + (st.attack === 'strike' ? 0.6 : 0));
    motes.forEach((mo, i) => { const a = t * (1.5 + i * 0.3) + i * 1.3; mo.position.set(Math.cos(a) * 0.32, Math.sin(a * 1.7) * 0.18, Math.sin(a) * 0.32); });
    trail.forEach((tr, i) => { tr.position.x = Math.sin(t * 2 - i) * 0.08; });
  } };
  return g;
}

/** Obsidian Sentinel — the shard warden, in volcanic glass. */
function buildSentinel(m) {
  const glass = new THREE.MeshStandardMaterial({ color: 0x0e0a12, roughness: 0.05, metalness: 0.2, emissive: 0x120604 });
  const ember = new THREE.MeshStandardMaterial({ color: 0xffa040, emissive: 0xff7020, emissiveIntensity: 2.2, roughness: 0.4 });
  const g = buildIce({ ...m, shell: glass, accent: ember, core: ember, bone: m.bone });
  g.traverse(o => { if (o.isMesh && o.material?.transparent) { o.material = glass; } });
  g.scale.setScalar(1.15);
  return g;
}

/** Blind Crawler — a deep centipede. */
function buildCentipede(m) {
  const g = new THREE.Group();
  const shellM = natural(0xb8a890, 0.5, { metalness: 0.1 }), dark = natural(0x3a3228, 0.7);
  const segs = [];
  for (let i = 0; i < 12; i++) {
    const s = new THREE.Group(); s.position.set(0, 0.32, 0.9 - i * 0.18); g.add(s);
    s.add(mesh(blob(0.2 - i * 0.006, 0.11, 0.13, 2, 0.05, i), i % 2 ? shellM : dark));
    const legs = [];
    for (const sx of [-1, 1]) { const lg = limb([0.18, 0.22], [0.022, 0.016, 0.008], dark); lg.root.position.set(sx * 0.16, -0.02, 0); lg.root.rotation.y = sx > 0 ? 0 : Math.PI; lg.joints[0].rotation.z = 0.3; lg.joints[1].rotation.z = -1.4; s.add(lg.root); legs.push({ lg, sx }); }
    segs.push({ s, legs, i });
  }
  const head = segs[0].s;
  const core = mesh(new THREE.IcosahedronGeometry(0.05, 1), m.core, 'core'); core.position.set(0, 0.05, 0.12); head.add(core);
  for (const sx of [-1, 1]) { const an = mesh(taperTube(new THREE.CatmullRomCurve3([V(sx * 0.06, 0.05, 0.1), V(sx * 0.2, 0.2, 0.35), V(sx * 0.32, 0.12, 0.6)]), (t) => 0.012 * (1 - t * 0.7), 8, 5), dark); head.add(an); }
  let ph = 0, rear = 0;
  g.userData.creature = { animate(dt, t, st) {
    const gait = Math.min(1, st.speed / 2); ph += dt * (3 + st.speed * 3);
    rear += ((st.attack === 'windup' ? 1 : 0) - rear) * Math.min(1, dt * 7);
    for (const sg of segs) {
      sg.s.position.x = Math.sin(ph * 0.8 - sg.i * 0.5) * 0.08 * (0.3 + gait);
      sg.s.position.y = 0.32 + (sg.i < 4 ? rear * (4 - sg.i) * 0.14 : 0);
      for (const l of sg.legs) l.lg.root.rotation.y = (l.sx > 0 ? 0 : Math.PI) + Math.sin(ph * 2 - sg.i * 0.8) * 0.4 * gait * l.sx;
    }
  } };
  return g;
}

/** Pale Grub — soft, segmented, blind. */
function buildGrub(m) {
  const g = new THREE.Group();
  const skin = natural(0xe8dcc8, 0.6), seg = [];
  for (let i = 0; i < 5; i++) { const s = mesh(blob(0.22 - i * 0.025, 0.18 - i * 0.02, 0.16, 2, 0.06, i), skin); s.position.set(0, 0.18, 0.3 - i * 0.2); g.add(s); seg.push(s); }
  const core = mesh(new THREE.IcosahedronGeometry(0.05, 1), m.core, 'core'); core.position.set(0, 0.24, 0.42); g.add(core);
  g.userData.creature = { animate(dt, t, st) { seg.forEach((s, i) => { s.position.y = 0.18 + Math.max(0, Math.sin(t * 5 - i * 0.8)) * 0.05 * Math.min(1, st.speed + 0.3); s.scale.z = 1 + Math.sin(t * 5 - i * 0.8) * 0.1; }); } };
  return g;
}

import { QUAD_SPECS } from '../data/expansion.js';
// ⚠️ Owner: "the mob models are so shit" — the animals are built by
// rendering/Fauna.js now (anatomical swept bodies, real limbs, coats).
// buildQuad stays only as the fallback for a spec Fauna lacks.
import { buildAnimal, FAUNA_IDS, buildGrub as buildGrubSkin, buildHorror as buildHorrorSkin, buildBeetle as buildBeetleSkin } from './Fauna.js';
const QUAD_BUILDERS = Object.fromEntries(Object.keys(QUAD_SPECS).map(id => [id, () => (FAUNA_IDS.includes(id) ? buildAnimal(id) : null) || buildQuad(QUAD_SPECS[id])]));

// ⚠️ "Model revision of everything": the original beasts are single
// skinned bodies now (rendering/Bestiary.js). The builders above stay as
// reference and fallback but are no longer registered.
import * as Bestiary from './Bestiary.js';
export const CREATURE_BUILDERS = { spider: Bestiary.buildSpider, slime: Bestiary.buildSlime, ice_elemental: Bestiary.buildIce, dragon: Bestiary.buildDragon, sandworm: Bestiary.buildWorm,
  ...QUAD_BUILDERS, rust_crawler: buildBeetleSkin, bog_horror: buildHorrorSkin, wisp: buildWisp, obsidian_sentinel: Bestiary.buildSentinel, blind_crawler: Bestiary.buildCentipede, cave_grub: buildGrubSkin };

/** @returns {THREE.Group|null} */
export function buildCreature(archetype, mats) {
  const b = CREATURE_BUILDERS[archetype];
  if (!b) return null;
  const g = b(mats);
  g.userData.isCrafted = true;
  return g;
}
