// ══════════════════════════════════════════════════════════
// Bestiary — the original beasts, rebuilt as single skinned bodies
//
// Owner: "take a complete run through and model revision of everything".
// The spider, slime, wyrm, worm, centipede, ice shade and glass warden
// were assemblies of primitives (blobs, tubes, cones). They are rebuilt
// on the same technique as the animals (rendering/Fauna.js `skinned`):
// signed-distance flesh on a skeleton, meshed once, skinned, painted —
// and still TINTED BY THE CREATURE'S ELEMENT (`m.shell.color`), so a
// fire spider and a frost spider read apart. Rigid details (fangs,
// eyes, spikes, horns, wing membranes, mouth petals, blades) ride on
// bones. The core mesh keeps its name, so the strain glow still works.
// Contract: build(m) → Group with userData.creature.animate(dt,t,st).
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { skinned, glowMat, faunaHash as hash, faunaSmooth as ss } from './Fauna.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const A3 = (v) => [v.x, v.y, v.z];
const C = (h) => new THREE.Color(h);
const mats = new Map();
function m1(key, make) { if (!mats.has(key)) mats.set(key, make()); return mats.get(key); }
const keyOf = (name, m) => `${name}:${m.shell?.color?.getHexString?.() || 'x'}`;
function rigid(g, mat, name) { const o = new THREE.Mesh(g, mat); o.castShadow = true; o.receiveShadow = true; if (name) o.name = name; return o; }

// ══════════════════════════════════════════════════════════
// SKITTERHUSK — the husk spider
// ══════════════════════════════════════════════════════════
export function buildSpider(m) {
  const tint = m.shell.color;
  const joints = { root: V(0, 0.55, 0.1), abd: V(0, 0.62, -0.08), head: V(0, 0.52, 0.42) };
  const parent = { root: null, abd: 'root', head: 'root' }, prims = [];
  prims.push({ a: [0, 0.55, 0.0], b: [0, 0.54, 0.38], ra: 0.25, rb: 0.2, bone: 'root', k: 0.05, part: 'thorax' });
  prims.push({ a: [0, 0.6, -0.12], b: [0, 0.68, -0.45], ra: 0.26, rb: 0.42, bone: 'abd', k: 0.04, part: 'abd' });
  prims.push({ a: [0, 0.68, -0.45], b: [0, 0.62, -0.88], ra: 0.42, rb: 0.16, bone: 'abd', k: 0.06, part: 'abd' });
  prims.push({ a: [0, 0.52, 0.38], b: [0, 0.48, 0.52], ra: 0.16, rb: 0.12, bone: 'head', k: 0.03, part: 'head' });
  for (const sx of [-1, 1]) prims.push({ a: [sx * 0.06, 0.46, 0.52], b: [sx * 0.05, 0.3, 0.62], ra: 0.065, rb: 0.035, bone: 'head', k: 0.01, part: 'chel' });
  const legs = [];
  for (let i = 0; i < 8; i++) {
    const s = i < 4 ? -1 : 1, k = i % 4, z = 0.32 - k * 0.14;
    const spread = (1.2 - k * 0.8);   // front legs reach forward, back legs back
    const base = V(s * 0.18, 0.52, z), knee = V(s * 0.62, 0.98, z + spread * 0.32), ank = V(s * 1.0, 0.45, z + spread * 0.58), foot = V(s * 1.12, 0.0, z + spread * 0.68);
    const nm = `l${i}`;
    joints[`${nm}a`] = base; joints[`${nm}b`] = knee; joints[`${nm}c`] = ank;
    parent[`${nm}a`] = 'root'; parent[`${nm}b`] = `${nm}a`; parent[`${nm}c`] = `${nm}b`;
    prims.push({ a: A3(base), b: A3(knee), ra: 0.055, rb: 0.045, bone: `${nm}a`, k: 0.02, part: 'leg' });
    prims.push({ a: A3(knee), b: A3(ank), ra: 0.045, rb: 0.032, bone: `${nm}b`, k: 0.012, part: 'leg' });
    prims.push({ a: A3(ank), b: A3(foot), ra: 0.03, rb: 0.012, bone: `${nm}c`, k: 0.008, part: 'leg' });
    legs.push({ nm, s, k, phase: (k % 2 === 0) === (s > 0) ? 0 : Math.PI });
  }
  const dark = tint.clone().multiplyScalar(0.25), mid = tint.clone().multiplyScalar(0.5).lerp(C(0x3a2a20), 0.4), pale = C(0xb8a888);
  const def = { joints, parent, prims, res: 120, paint: (q, p, n, c) => {
    c.copy(dark).lerp(mid, ss(-0.4, 0.8, n.y));
    if (q.part === 'abd') {
      // Bands and a dorsal chevron pattern on the abdomen.
      const band = Math.sin((p[2] + 0.1) * 22);
      if (band > 0.7 && n.y > -0.2) c.lerp(pale, 0.25);
      if (n.y > 0.5 && Math.abs(p[0]) < 0.06 + Math.abs(Math.sin(p[2] * 9)) * 0.08) c.lerp(tint, 0.6);
    }
    if (q.part === 'leg') { const ring = Math.sin(Math.hypot(p[0], p[1]) * 26); if (ring > 0.75) c.lerp(pale, 0.3); }
    if (q.part === 'chel') c.copy(dark).multiplyScalar(0.8);
  } };
  const mat = m1('chitin', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.2 }));
  const { g, bones } = skinned(keyOf('spider', m), def, mat);
  // Fangs, eyes, abdomen spines, the core.
  const fangs = [];
  for (const sx of [-1, 1]) { const f = rigid(new THREE.ConeGeometry(0.022, 0.16, 6), m.bone); f.rotation.x = Math.PI * 0.85; f.position.set(sx * 0.05, -0.27, 0.22); bones.head.add(f); fangs.push({ f, sx }); }
  for (let i = 0; i < 8; i++) { const row = i < 4 ? 0 : 1, k = i % 4; const e = rigid(new THREE.SphereGeometry(row ? 0.022 : 0.032, 10, 8), m.core); e.position.set((k - 1.5) * (row ? 0.05 : 0.045), 0.1 + row * 0.04, 0.1 - row * 0.03); bones.head.add(e); }
  for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) { const sp = rigid(new THREE.ConeGeometry(0.025, 0.14 + hash(r * 4 + i) * 0.08, 5), m.bone); const a = (r - 1) * 0.55; sp.position.set(Math.sin(a) * 0.36, 0.06 + 0.32 * Math.cos(a), -0.2 - i * 0.16); sp.rotation.set(-0.6, 0, -a); bones.abd.add(sp); }
  const core = rigid(new THREE.IcosahedronGeometry(0.09, 1), m.core, 'core'); core.position.set(0, 0.3, -0.35); core.scale.set(1, 0.5, 1.4); bones.abd.add(core);
  let ph = 0, lunge = 0, rear = 0;
  g.userData.creature = { animate(dt, t, st) {
    const gait = Math.min(1, st.speed / 2.2); ph += dt * (2 + st.speed * 3.2);
    rear += ((st.attack === 'windup' ? 1 : 0) - rear) * Math.min(1, dt * 8);
    lunge += ((st.attack === 'strike' ? 1 : 0) - lunge) * Math.min(1, dt * 14);
    bones.root.position.y = 0.55 + Math.abs(Math.sin(ph)) * 0.02 * gait + Math.sin(t * 2) * 0.005;
    bones.root.rotation.x = -rear * 0.32; bones.root.position.z = 0.1 + lunge * 0.3;
    bones.abd.rotation.x = Math.sin(t * 1.7) * 0.04 + rear * 0.2;
    for (const l of legs) {
      const p = ph + l.phase, lift = Math.max(0, Math.sin(p)) * gait;
      bones[`${l.nm}a`].rotation.y = Math.cos(p) * 0.22 * gait * l.s;
      bones[`${l.nm}a`].rotation.z = l.s * (lift * 0.25 + (l.k === 0 ? rear * 0.6 : 0));
    }
    for (const f of fangs) f.f.rotation.z = f.sx * (0.2 + rear * 0.35 - lunge * 0.5);
  } };
  return g;
}

// ══════════════════════════════════════════════════════════
// THE SEEP — pitch ooze: one gel body, bones and a core suspended in it
// ══════════════════════════════════════════════════════════
export function buildSlime(m) {
  const tint = m.shell.color;
  const joints = { root: V(0, 0.1, 0), body: V(0, 0.45, 0) }, parent = { root: null, body: 'root' }, prims = [];
  prims.push({ a: [0, 0.3, 0], b: [0, 0.75, 0], ra: 0.56, rb: 0.36, bone: 'body', k: 0.12, part: 'body' });
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + 0.3, nm = `lobe${i}`;
    joints[nm] = V(Math.cos(a) * 0.45, 0.1, Math.sin(a) * 0.45); parent[nm] = 'root';
    prims.push({ a: [Math.cos(a) * 0.3, 0.12, Math.sin(a) * 0.3], b: [Math.cos(a) * 0.82, 0.04, Math.sin(a) * 0.82], ra: 0.22, rb: 0.07, bone: nm, k: 0.15, part: 'puddle' });
  }
  const deep = tint.clone().multiplyScalar(0.18), lit = tint.clone().multiplyScalar(0.55).lerp(C(0x9ab070), 0.2);
  const def = { joints, parent, prims, res: 70, paint: (q, p, n, c) => {
    c.copy(deep).lerp(lit, ss(-0.2, 0.9, n.y));
    if (hash(Math.floor(p[0] * 45), Math.floor(p[1] * 45), Math.floor(p[2] * 45)) > 0.975) c.lerp(C(0xd8e0a0), 0.3);   // bubbles caught in it
  } };
  const mat = m1(`gel:${tint.getHexString()}`, () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.05, transparent: true, opacity: 0.72, depthWrite: true, emissive: tint.clone().multiplyScalar(0.12) }));
  const { g, bones } = skinned(keyOf('slime', m), def, mat);
  // What it has eaten: a skull, ribs, the core, hanging in the gel.
  const bone = m.bone;
  const skull = rigid(new THREE.SphereGeometry(0.12, 12, 10), bone); skull.scale.set(1, 0.9, 1.1); skull.position.set(0.12, 0.12, 0.05); skull.rotation.set(0.4, 0.6, 0.2); bones.body.add(skull);
  for (const sx of [-1, 1]) { const e = rigid(new THREE.SphereGeometry(0.03, 8, 6), m1('void', () => new THREE.MeshStandardMaterial({ color: 0x050505 }))); e.position.set(sx * 0.045, 0.02, 0.1); skull.add(e); }
  for (let i = 0; i < 5; i++) { const r = rigid(new THREE.TorusGeometry(0.13 - i * 0.012, 0.012, 5, 14, Math.PI * 1.2), bone); r.position.set(-0.1, -0.05 - i * 0.05, -0.08); r.rotation.set(Math.PI / 2, 0, 0.3); bones.body.add(r); }
  const core = rigid(new THREE.IcosahedronGeometry(0.1, 1), m.core, 'core'); core.position.set(-0.05, 0.05, 0.1); bones.body.add(core);
  let hop = 0, low = 0, lunge = 0;
  g.userData.creature = { animate(dt, t, st) {
    const gait = Math.min(1, st.speed / 1.5); hop += dt * (2.5 + st.speed * 2.5);
    low += ((st.attack === 'windup' ? 1 : 0) - low) * Math.min(1, dt * 7);
    lunge += ((st.attack === 'strike' ? 1 : 0) - lunge) * Math.min(1, dt * 14);
    const b = Math.max(0, Math.sin(hop)) * gait;
    const sy = 1 + b * 0.25 - low * 0.3 + lunge * 0.35 + Math.sin(t * 3) * 0.04, sxz = 1 / Math.sqrt(Math.max(0.5, sy));
    bones.body.scale.set(sxz, sy, sxz);
    bones.body.position.set(0, 0.35 + b * 0.12, lunge * 0.3);
    for (let i = 0; i < 6; i++) { const lb = bones[`lobe${i}`]; const w = 1 + Math.sin(t * 2.4 + i * 1.3) * 0.12 + low * 0.25; lb.scale.set(w, 1, w); }
    core.rotation.y += dt * 0.8;
  } };
  return g;
}

// ══════════════════════════════════════════════════════════
// XARTHARAEL — the ancient wyrm
// ══════════════════════════════════════════════════════════
export function buildDragon(m) {
  const tint = m.shell.color;
  const joints = { root: V(0, 1.35, -0.5), chest: V(0, 1.5, 0.55) }, parent = { root: null, chest: 'root' }, prims = [];
  // Torso: deep chest, narrower hips, a keeled belly.
  prims.push({ a: [0, 1.5, -0.7], b: [0, 1.62, 0.6], ra: 0.5, rb: 0.6, bone: 'root', k: 0.12, part: 'body' });
  prims.push({ a: [0, 1.2, -0.5], b: [0, 1.15, 0.55], ra: 0.42, rb: 0.5, bone: 'chest', k: 0.14, part: 'belly' });
  // Neck: five bones rising forward.
  let prev = V(0, 1.85, 0.85);
  const neckN = 5;
  for (let i = 0; i < neckN; i++) {
    const nm = `n${i}`, nx = prev.clone().add(V(0, 0.3 - i * 0.03, 0.17));
    joints[nm] = prev.clone(); parent[nm] = i ? `n${i - 1}` : 'chest';
    prims.push({ a: A3(prev), b: A3(nx), ra: 0.3 - i * 0.03, rb: 0.27 - i * 0.03, bone: nm, k: 0.06, part: 'neck' });
    prev = nx;
  }
  // Head: skull, long snout, hinged jaw.
  joints.head = prev.clone(); parent.head = `n${neckN - 1}`;
  const hDir = V(0, -0.25, 1).normalize();
  const snout = prev.clone().addScaledVector(hDir, 0.85);
  prims.push({ a: A3(prev), b: A3(prev.clone().addScaledVector(hDir, 0.3)), ra: 0.3, rb: 0.25, bone: 'head', k: 0.05, part: 'head' });
  prims.push({ a: A3(prev.clone().addScaledVector(hDir, 0.3)), b: A3(snout), ra: 0.21, rb: 0.12, bone: 'head', k: 0.03, part: 'head' });
  const jaw0 = prev.clone().addScaledVector(hDir, 0.15).add(V(0, -0.16, 0));
  joints.jaw = jaw0; parent.jaw = 'head';
  prims.push({ a: A3(jaw0), b: A3(snout.clone().add(V(0, -0.12, -0.05))), ra: 0.15, rb: 0.08, bone: 'jaw', k: 0.012, part: 'jaw' });
  // Tail: eight bones tapering back and down, a little swept.
  prev = V(0, 1.45, -1.05);
  for (let i = 0; i < 8; i++) {
    const nm = `t${i}`, nx = prev.clone().add(V(Math.sin(i * 0.4) * 0.05, -0.08 + i * 0.006, -0.34));
    joints[nm] = prev.clone(); parent[nm] = i ? `t${i - 1}` : 'root';
    prims.push({ a: A3(prev), b: A3(nx), ra: 0.42 * (1 - i / 9), rb: 0.42 * (1 - (i + 1) / 9) + 0.02, bone: nm, k: 0.05, part: 'tail' });
    prev = nx;
  }
  // Legs: thick, three bones each, the hind with a back-bent hock.
  const legBones = [];
  for (const front of [true, false]) for (const s of [-1, 1]) {
    const z = front ? 0.45 : -0.55, key = `${front ? 'f' : 'h'}${s > 0 ? 'R' : 'L'}`;
    const top = V(s * 0.42, 1.35, z), knee = V(s * 0.56, 0.8, z + (front ? -0.05 : 0.25)), ank = V(s * 0.6, 0.35, z + (front ? 0.08 : -0.12)), foot = V(s * 0.62, 0.0, z + 0.22);
    joints[`${key}0`] = top; joints[`${key}1`] = knee; joints[`${key}2`] = ank;
    parent[`${key}0`] = front ? 'chest' : 'root'; parent[`${key}1`] = `${key}0`; parent[`${key}2`] = `${key}1`;
    prims.push({ a: A3(top.clone().add(V(-s * 0.1, 0.15, 0))), b: A3(knee), ra: 0.26, rb: 0.15, bone: `${key}0`, k: 0.1, part: 'leg' });
    prims.push({ a: A3(knee), b: A3(ank), ra: 0.14, rb: 0.1, bone: `${key}1`, k: 0.03, part: 'leg' });
    prims.push({ a: A3(ank), b: A3(foot), ra: 0.1, rb: 0.13, bone: `${key}2`, k: 0.03, part: 'leg' });
    legBones.push({ key, front, s, phase: (front === (s > 0)) ? 0 : Math.PI });
  }
  // Wing arms: shoulder → elbow, the membrane rides on them.
  for (const s of [-1, 1]) {
    const k = s > 0 ? 'wR' : 'wL', sh = V(s * 0.35, 1.95, 0.45), el = V(s * 1.7, 2.95, 0.15);
    joints[`${k}0`] = sh; joints[`${k}1`] = el; parent[`${k}0`] = 'chest'; parent[`${k}1`] = `${k}0`;
    prims.push({ a: A3(sh), b: A3(el), ra: 0.12, rb: 0.08, bone: `${k}0`, k: 0.05, part: 'wing' });
    prims.push({ a: A3(el), b: A3(el.clone().add(V(s * 0.75, 0.35, -0.35))), ra: 0.07, rb: 0.05, bone: `${k}1`, k: 0.02, part: 'wing' });
  }
  const back = tint.clone().multiplyScalar(0.28).lerp(C(0x1a1612), 0.3), belly = tint.clone().multiplyScalar(0.55).lerp(C(0xa89068), 0.5);
  const def = { joints, parent, prims, res: 130, paint: (q, p, n, c) => {
    c.copy(back).lerp(belly, ss(0.1, -0.7, n.y));
    // Scales: a fine diamond lattice, the belly in broad plates.
    const sc = Math.sin(p[0] * 40 + p[2] * 40) * Math.sin(p[0] * 40 - p[2] * 40 + p[1] * 30);
    c.multiplyScalar(0.88 + (sc > 0.6 ? 0.18 : 0));
    if (n.y < -0.4 && (q.part === 'belly' || q.part === 'tail' || q.part === 'neck') && Math.sin(p[2] * 18) > 0.75) c.multiplyScalar(0.7);
    if (q.part === 'jaw' || (q.part === 'head' && n.y < -0.3)) c.lerp(C(0x3a1a14), 0.4);
  } };
  const mat = m1('scale', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.18 }));
  const { g, bones } = skinned(keyOf('dragon', m), def, mat);
  // Membranes: a fan from shoulder over the elbow to three finger tips.
  const memMat = m1(`mem:${tint.getHexString()}`, () => new THREE.MeshStandardMaterial({ color: tint.clone().multiplyScalar(0.6).lerp(C(0x7a3428), 0.5), emissive: C(0x1a0604), roughness: 0.75, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }));
  const wings = [];
  for (const s of [-1, 1]) {
    const k = s > 0 ? 'wR' : 'wL', el = joints[`${k}1`];
    const tips = [V(s * 3.1, 3.5, -0.35), V(s * 3.4, 2.3, -1.0), V(s * 2.5, 1.55, -1.45)];
    const root = V(s * 0.35, 1.75, -0.75);
    const fan = [el, ...tips, root];
    const pos = [];
    for (let i = 1; i < fan.length - 1; i++) {
      const a = fan[0], b = fan[i], c2 = fan[i + 1];
      // A slack edge: the membrane scallops between fingers.
      const mid = b.clone().lerp(c2, 0.5).lerp(a, 0.18);
      for (const tri of [[a, b, mid], [a, mid, c2]]) for (const v of tri) pos.push(v.x - el.x, v.y - el.y, v.z - el.z);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
    const mem = rigid(geo, memMat); bones[`${k}1`].add(mem);
    // Finger bones along the leading edges.
    for (const tp of tips) { const curve = new THREE.CatmullRomCurve3([V(0, 0, 0), tp.clone().sub(el).multiplyScalar(0.5).add(V(0, 0.08, 0)), tp.clone().sub(el)]); bones[`${k}1`].add(rigid(new THREE.TubeGeometry(curve, 10, 0.035, 6), mat)); }
    wings.push({ k, s });
  }
  // Horns, brow spikes, teeth, the ridge down the back and tail, eyes.
  const horn = m.bone;
  for (const s of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([V(s * 0.12, 0.12, -0.05), V(s * 0.22, 0.28, -0.3), V(s * 0.2, 0.36, -0.62)]);
    bones.head.add(rigid(new THREE.TubeGeometry(curve, 12, 0.05, 7), horn));
    const tip = rigid(new THREE.ConeGeometry(0.05, 0.18, 7), horn); tip.position.set(s * 0.2, 0.37, -0.68); tip.rotation.x = -1.6; bones.head.add(tip);
    const eye = rigid(new THREE.SphereGeometry(0.04, 10, 8), m.core); eye.position.set(s * 0.17, 0.08, 0.22); bones.head.add(eye);
  }
  for (let i = 0; i < 7; i++) for (const s of [-1, 1]) { const tth = rigid(new THREE.ConeGeometry(0.018, 0.08, 5), horn); tth.position.set(s * (0.1 - i * 0.008), 0.05, 0.12 + i * 0.09); bones.jaw.add(tth); }
  const ridge = (bone, n, y, len) => { for (let i = 0; i < n; i++) { const sp = rigid(new THREE.ConeGeometry(0.05 * (1 - i / (n + 2)), 0.22, 5), horn); sp.position.set(0, y, -i * len / n); sp.rotation.x = -0.5; bone.add(sp); } };
  ridge(bones.root, 4, 0.55, 0.9); ridge(bones.chest, 3, 0.62, 0.6);
  for (let i = 0; i < 8; i++) { const sp = rigid(new THREE.ConeGeometry(0.06 * (1 - i / 9), 0.2, 5), horn); sp.position.set(0, 0.42 * (1 - i / 9), -0.15); sp.rotation.x = -0.5; bones[`t${i}`].add(sp); }
  for (let i = 0; i < neckN; i++) { const sp = rigid(new THREE.ConeGeometry(0.04, 0.16, 5), horn); sp.position.set(0, 0.28, 0.05); sp.rotation.x = -0.5; bones[`n${i}`].add(sp); }
  const core = rigid(new THREE.IcosahedronGeometry(0.16, 1), m.core, 'core'); core.position.set(0, -0.1, 0.1); bones.chest.add(core);
  let ph = 0, rear = 0, snap = 0, beat = 0;
  g.userData.creature = { animate(dt, t, st) {
    const gait = Math.min(1, st.speed / 2.5); ph += dt * (1.6 + st.speed * 1.2);
    rear += ((st.attack === 'windup' ? 1 : 0) - rear) * Math.min(1, dt * 4);
    snap += ((st.attack === 'strike' ? 1 : 0) - snap) * Math.min(1, dt * 12);
    beat += dt * (st.attack !== 'none' ? 9 : 1.4);
    const breathe = Math.sin(t * 1.3);
    bones.root.position.y = 1.35 + breathe * 0.02 + Math.abs(Math.sin(ph)) * 0.04 * gait;
    bones.chest.rotation.x = -rear * 0.22 + snap * 0.15;
    for (let i = 0; i < neckN; i++) bones[`n${i}`].rotation.x = -0.05 - rear * 0.12 + snap * 0.18 + Math.sin(t * 0.9 - i * 0.5) * 0.04;
    bones.head.rotation.x = rear * 0.2 - snap * 0.3; bones.head.rotation.y = Math.sin(t * 0.5) * 0.15;
    bones.jaw.rotation.x = 0.06 + rear * 0.35 + snap * 0.6 + Math.max(0, Math.sin(t * 0.7)) * 0.05;
    for (let i = 0; i < 8; i++) bones[`t${i}`].rotation.y = Math.sin(t * 1.2 - i * 0.55) * 0.08 * (1 + gait);
    for (const l of legBones) { const p = ph + l.phase, sw = Math.sin(p) * 0.35 * gait, lift = Math.max(0, Math.cos(p)) * gait; bones[`${l.key}0`].rotation.x = -sw; bones[`${l.key}1`].rotation.x = (l.front ? 1 : -1) * lift * 0.5; }
    const flap = Math.sin(beat) * (st.attack !== 'none' ? 0.55 : 0.06) + (st.attack === 'none' ? 0.12 : 0.1);
    for (const w of wings) { bones[`${w.k}0`].rotation.z = w.s * flap; bones[`${w.k}1`].rotation.z = w.s * flap * 0.5; }
  } };
  return g;
}

// ══════════════════════════════════════════════════════════
// THE BURROWER — a ringed worm rising from its mound
// ══════════════════════════════════════════════════════════
export function buildWorm(m) {
  const tint = m.shell.color;
  const joints = { root: V(0, 0, 0) }, parent = { root: null }, prims = [];
  prims.push({ a: [0, -0.05, 0], b: [0, 0.25, 0], ra: 1.15, rb: 0.6, bone: 'root', k: 0.25, part: 'mound' });
  for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; prims.push({ a: [Math.cos(a) * 1.0, 0.0, Math.sin(a) * 1.0], b: [Math.cos(a) * 1.3, -0.1, Math.sin(a) * 1.3], ra: 0.25, rb: 0.1, bone: 'root', k: 0.2, part: 'mound' }); }
  const N = 9;
  let prev = V(0, 0.15, 0);
  for (let i = 0; i < N; i++) {
    const nm = `s${i}`, nx = prev.clone().add(V(0, 0.44, 0));
    joints[nm] = prev.clone(); parent[nm] = i ? `s${i - 1}` : 'root';
    const r = 0.5 - i * 0.02;
    prims.push({ a: A3(prev), b: A3(nx), ra: r, rb: r * 0.97, bone: nm, k: 0.025, part: 'seg', i });
    prev = nx;
  }
  joints.head = prev.clone(); parent.head = `s${N - 1}`;
  const hide = tint.clone().multiplyScalar(0.4).lerp(C(0x8a7458), 0.4), plate = tint.clone().multiplyScalar(0.22), dirt = C(0x3a2e22);
  const def = { joints, parent, prims, res: 120, paint: (q, p, n, c) => {
    if (q.part === 'mound') { c.copy(dirt).lerp(C(0x5a4a38), ss(0, 1, n.y)); return; }
    c.copy(hide);
    // Corrugation rings, and armoured plates down its back.
    const ring = Math.sin((p[1] - 0.15) / 0.44 * Math.PI * 2);
    if (ring > 0.7) c.multiplyScalar(0.65);
    if (p[2] < -0.15 && ring < 0.5) c.lerp(plate, 0.7);
  } };
  const mat = m1('wormhide', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.08 }));
  const { g, bones } = skinned(keyOf('worm', m), def, mat);
  // The mouth: four toothed petals around a glowing throat.
  const flesh = m1('wormflesh', () => new THREE.MeshStandardMaterial({ color: 0x5a1e1a, roughness: 0.5, emissive: 0x1a0505 }));
  const throat = rigid(new THREE.CylinderGeometry(0.3, 0.42, 0.26, 18, 1, true), flesh); throat.position.y = 0.24; bones.head.add(throat);
  const gullet = rigid(new THREE.CircleGeometry(0.3, 18), flesh); gullet.rotation.x = -Math.PI / 2; gullet.position.y = 0.3; bones.head.add(gullet);
  const core = rigid(new THREE.IcosahedronGeometry(0.14, 1), m.core, 'core'); core.position.y = 0.26; bones.head.add(core);
  const petals = [];
  const petalMat = m1(`petal:${tint.getHexString()}`, () => new THREE.MeshStandardMaterial({ color: plate.clone().lerp(C(0x6a4a38), 0.4), roughness: 0.4, metalness: 0.2, side: THREE.DoubleSide }));
  for (let i = 0; i < 4; i++) {
    const hinge = new THREE.Group(); hinge.rotation.y = i * Math.PI / 2; hinge.position.y = 0.2; bones.head.add(hinge);
    const p = new THREE.Group(); p.position.z = 0.4; hinge.add(p);
    const sg = new THREE.SphereGeometry(0.62, 14, 10, -0.62, 1.24, 0, Math.PI * 0.42); sg.translate(0, -0.12, -0.42);
    p.add(rigid(sg, petalMat));
    for (let k = 0; k < 5; k++) { const tooth = rigid(new THREE.ConeGeometry(0.03, 0.15, 5), m.bone); tooth.position.set((k - 2) * 0.09, 0.3, -0.16); tooth.rotation.x = -1.1; tooth.scale.setScalar(1.4); p.add(tooth); }
    petals.push(p);
  }
  let rear = 0, snap = 0, ph = 0;
  g.userData.creature = { animate(dt, t, st) {
    ph += dt * (1 + st.speed * 1.5);
    rear += ((st.attack === 'windup' ? 1 : 0) - rear) * Math.min(1, dt * 5);
    snap += ((st.attack === 'strike' ? 1 : 0) - snap) * Math.min(1, dt * 13);
    for (let i = 0; i < N; i++) { const b = bones[`s${i}`], k = i / N; b.rotation.x = Math.sin(ph * 1.3 - i * 0.7) * 0.06 + k * (0.05 - rear * 0.25 + snap * 0.4); b.rotation.z = Math.sin(ph - i * 0.6) * 0.06; }
    const open = 0.45 + Math.max(0, Math.sin(t * 0.9)) * 0.12 + rear * 0.7 - snap * 0.75;
    for (const p of petals) p.rotation.x = -open;
    core.scale.setScalar(1 + Math.sin(t * 3) * 0.08 + st.strain * 0.4);
  } };
  return g;
}

// ══════════════════════════════════════════════════════════
// BLIND CRAWLER — a deep centipede, one segmented body
// ══════════════════════════════════════════════════════════
export function buildCentipede(m) {
  const joints = {}, parent = {}, prims = [];
  const N = 13;
  for (let i = 0; i < N; i++) {
    const nm = `s${i}`, z = 1.0 - i * 0.17;
    joints[nm] = V(0, 0.3, z); parent[nm] = i ? `s${i - 1}` : null;
    const r = i === 0 ? 0.15 : 0.13 - Math.max(0, i - 9) * 0.02;
    prims.push({ a: [0, 0.3, z + 0.06], b: [0, 0.3, z - 0.1], ra: r, rb: r * 0.92, bone: nm, k: 0.018, part: i === 0 ? 'head' : 'seg', i });
  }
  const shellA = C(0x6a3a22).lerp(m.shell.color, 0.2), shellB = C(0x1c120c), belly = C(0xb8a080);
  const def = { joints, parent, prims, res: 110, paint: (q, p, n, c) => {
    c.copy(belly).lerp(shellB, ss(-0.6, 0.0, n.y)).lerp(shellA, ss(0.1, 0.8, n.y) * (q.i % 2 ? 0.7 : 1));
    if (Math.abs(((p[2] - 1.06) / 0.17) % 1) < 0.12) c.multiplyScalar(0.45);
    if (q.part === 'head') c.lerp(C(0x5a2a1a), 0.5);
  } };
  const mat = m1('centi', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.15 }));
  const { g, bones } = skinned(keyOf('centipede', m), def, mat);
  const legMat = m1('centileg', () => new THREE.MeshStandardMaterial({ color: 0x4a2a1a, roughness: 0.45, metalness: 0.15 }));
  const legs = [];
  for (let i = 1; i < N; i++) for (const sx of [-1, 1]) {
    const lg = new THREE.Group(); lg.position.set(sx * 0.11, -0.04, 0); bones[`s${i}`].add(lg);
    const up = rigid(new THREE.CylinderGeometry(0.026, 0.032, 0.24, 6), legMat); up.position.set(sx * 0.1, 0.06, 0); up.rotation.z = sx * -0.85; lg.add(up);
    const lo = rigid(new THREE.CylinderGeometry(0.01, 0.024, 0.3, 6), legMat); lo.position.set(sx * 0.27, -0.08, 0); lo.rotation.z = sx * 0.45; lg.add(lo);
    legs.push({ lg, sx, i });
  }
  for (const sx of [-1, 1]) {
    const an = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(sx * 0.05, 0.06, 0.1), V(sx * 0.18, 0.22, 0.35), V(sx * 0.3, 0.12, 0.62)]), 10, 0.01, 5);
    bones.s0.add(rigid(an, legMat));
    const md = rigid(new THREE.ConeGeometry(0.02, 0.13, 5), m.bone); md.position.set(sx * 0.07, -0.05, 0.16); md.rotation.set(Math.PI / 2, 0, sx * 0.6); bones.s0.add(md);
  }
  const core = rigid(new THREE.IcosahedronGeometry(0.05, 1), m.core, 'core'); core.position.set(0, 0.08, 0.05); bones.s0.add(core);
  let ph = 0, rear = 0;
  g.userData.creature = { animate(dt, t, st) {
    const gait = Math.min(1, st.speed / 2); ph += dt * (3 + st.speed * 3);
    rear += ((st.attack === 'windup' ? 1 : 0) - rear) * Math.min(1, dt * 7);
    for (let i = 1; i < N; i++) bones[`s${i}`].rotation.y = Math.sin(ph * 0.8 - i * 0.5) * 0.08 * (0.3 + gait);
    bones.s0.rotation.x = -rear * 0.4; bones.s1.rotation.x = -rear * 0.3; bones.s2.rotation.x = -rear * 0.2;
    for (const l of legs) l.lg.rotation.y = Math.sin(ph * 2 - l.i * 0.8) * 0.4 * gait * l.sx;
  } };
  return g;
}

// ══════════════════════════════════════════════════════════
// CRYSTAL BODIES — the Rimeshade (ice, floating, a tail of shards)
// and the Obsidian Sentinel (volcanic glass, on legs). A low-resolution
// skin with FLAT shading reads as cut crystal, facets catching the light.
// ══════════════════════════════════════════════════════════
function buildCrystal(m, kind) {
  const glass = kind === 'obsidian';
  const joints = { root: V(0, glass ? 1.1 : 1.35, 0), chest: V(0, glass ? 1.5 : 1.7, 0), head: V(0, glass ? 2.05 : 2.2, 0.05) };
  const parent = { root: null, chest: 'root', head: 'chest' }, prims = [];
  const y0 = joints.root.y;
  prims.push({ a: [0, y0, 0], b: [0, y0 + 0.5, 0.02], ra: glass ? 0.32 : 0.22, rb: glass ? 0.48 : 0.36, bone: 'root', k: 0.06, part: 'body' });
  prims.push({ a: [0, y0 + 0.5, 0.02], b: [0, y0 + 0.75, 0.04], ra: glass ? 0.48 : 0.36, rb: glass ? 0.3 : 0.22, bone: 'chest', k: 0.05, part: 'body' });
  prims.push({ a: [0, y0 + 0.85, 0.05], b: [0, y0 + 1.08, 0.08], ra: 0.17, rb: 0.13, bone: 'head', k: 0.04, part: 'head' });
  for (const s of [-1, 1]) {
    const k = s > 0 ? 'R' : 'L', sh = V(s * (glass ? 0.52 : 0.4), y0 + 0.62, 0), el = V(s * (glass ? 0.78 : 0.62), y0 + 0.15, 0.05);
    joints[`a${k}0`] = sh; joints[`a${k}1`] = el; parent[`a${k}0`] = 'chest'; parent[`a${k}1`] = `a${k}0`;
    prims.push({ a: [s * 0.2, y0 + 0.62, 0], b: A3(sh), ra: 0.2, rb: 0.16, bone: 'chest', k: 0.05, part: 'body' });
    prims.push({ a: A3(sh), b: A3(el), ra: glass ? 0.15 : 0.1, rb: glass ? 0.12 : 0.08, bone: `a${k}0`, k: 0.03, part: 'arm' });
    prims.push({ a: A3(el), b: A3(el.clone().add(V(0, -0.45, 0.15))), ra: glass ? 0.12 : 0.08, rb: glass ? 0.14 : 0.05, bone: `a${k}1`, k: 0.02, part: 'arm' });
    if (glass) {
      const hip = V(s * 0.2, y0, 0), kn = V(s * 0.26, y0 * 0.5, 0.06), ft = V(s * 0.28, 0, 0.02);
      joints[`g${k}0`] = hip; joints[`g${k}1`] = kn; parent[`g${k}0`] = 'root'; parent[`g${k}1`] = `g${k}0`;
      prims.push({ a: A3(hip), b: A3(kn), ra: 0.18, rb: 0.14, bone: `g${k}0`, k: 0.04, part: 'leg' });
      prims.push({ a: A3(kn), b: A3(ft), ra: 0.14, rb: 0.17, bone: `g${k}1`, k: 0.03, part: 'leg' });
    }
  }
  if (!glass) prims.push({ a: [0, y0, 0], b: [0, y0 - 0.8, -0.1], ra: 0.22, rb: 0.03, bone: 'root', k: 0.05, part: 'tail' });
  const base = glass ? C(0x2a2434) : C(0xbcd8ea).lerp(m.shell.color, 0.25), deep = glass ? C(0x221418) : C(0x5a8aa8).lerp(m.shell.color, 0.3);
  const def = { joints, parent, prims, res: glass ? 34 : 30, paint: (q, p, n, c) => {
    c.copy(deep).lerp(base, ss(-0.5, 0.9, n.y));
    // Fracture lines that glow faintly from inside.
    const hv = hash(Math.round(p[0] * 60), Math.round(p[1] * 60), Math.round(p[2] * 60));
    if (hv > 0.965) c.lerp(glass ? C(0xff6a18) : C(0xf4fcff), glass ? 0.55 : 0.6);
  } };
  const mat = m1(glass ? 'obsidian' : `ice:${m.shell.color.getHexString()}`, () => glass
    ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, metalness: 0.35, flatShading: true })
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.05, flatShading: true, transparent: true, opacity: 0.85, emissive: m.accent?.color?.clone().multiplyScalar(0.12) || C(0x000000) }));
  const { g, bones } = skinned(`${kind}:${m.shell.color.getHexString()}`, def, mat);
  // Crown and shoulder shards, blades at the wrists, the core in the chest.
  // ⚠️ Not `mat`: shards carry no vertex colours, and a vertexColors
  // material renders an uncoloured mesh black.
  const shardMat = m1(glass ? 'obsShard' : `iceShard:${m.shell.color.getHexString()}`, () => glass
    ? new THREE.MeshStandardMaterial({ color: 0x1a1620, roughness: 0.05, metalness: 0.4, flatShading: true })
    : new THREE.MeshStandardMaterial({ color: base.clone().lerp(C(0xffffff), 0.3), roughness: 0.05, metalness: 0.05, flatShading: true, transparent: true, opacity: 0.8 }));
  const shard = (r, L) => { const sg = new THREE.OctahedronGeometry(r, 0); sg.scale(1, L / r, 1); return sg; };
  for (let i = 0; i < 6; i++) { const s = rigid(shard(0.05, 0.24 + hash(i) * 0.22), shardMat); const a = (i / 6) * Math.PI * 2; s.position.set(Math.cos(a) * 0.09, 0.2, Math.sin(a) * 0.07 - 0.02); s.rotation.set(-0.4 + Math.sin(a) * 0.35, 0, Math.cos(a) * 0.45); bones.head.add(s); }
  for (const s of [-1, 1]) {
    const k = s > 0 ? 'R' : 'L';
    for (let i = 0; i < 3; i++) { const sp = rigid(shard(0.06, 0.28 + i * 0.06), shardMat); sp.position.set(s * 0.05, 0.12 + i * 0.03, -0.05 - i * 0.06); sp.rotation.set(-0.5, 0, s * (0.6 + i * 0.2)); bones[`a${k}0`].add(sp); }
    const blade = rigid(shard(glass ? 0.07 : 0.05, glass ? 0.6 : 0.5), shardMat); blade.position.set(0, -0.75, 0.25); blade.rotation.x = 0.3; bones[`a${k}1`].add(blade);
  }
  for (const s of [-1, 1]) { const e = rigid(new THREE.SphereGeometry(0.03, 8, 6), m.core); e.position.set(s * 0.06, 0.04, 0.12); bones.head.add(e); }
  const core = rigid(new THREE.IcosahedronGeometry(glass ? 0.14 : 0.12, 1), glass ? glowMat(0xff7a20) : m.core, 'core'); core.position.set(0, 0.05, 0.1); bones.chest.add(core);
  const orbit = [];
  if (!glass) for (let i = 0; i < 8; i++) { const s = rigid(shard(0.04, 0.16), shardMat); s.userData.r = 0.25 - i * 0.02; s.userData.y = y0 - 0.15 - i * 0.1; s.userData.a = i * 0.9; g.add(s); orbit.push(s); }
  let raise = 0, lunge = 0, ph = 0;
  g.userData.creature = { animate(dt, t, st) {
    const gait = Math.min(1, st.speed / 2); ph += dt * (2 + st.speed * 2);
    raise += ((st.attack === 'windup' ? 1 : 0) - raise) * Math.min(1, dt * 7);
    lunge += ((st.attack === 'strike' ? 1 : 0) - lunge) * Math.min(1, dt * 14);
    bones.root.position.y = y0 + (glass ? Math.abs(Math.sin(ph)) * 0.03 * gait : Math.sin(t * 1.4) * 0.07);
    bones.chest.rotation.x = gait * (glass ? 0.05 : 0.2) - raise * 0.1 + lunge * 0.15;
    bones.head.rotation.y = Math.sin(t * 0.6) * 0.2;
    for (const s of [-1, 1]) { const k = s > 0 ? 'R' : 'L'; bones[`a${k}0`].rotation.x = Math.sin(t * 1.1 + s) * 0.1 - raise * 2.0 + lunge * 1.5; bones[`a${k}1`].rotation.x = -0.2 - raise * 0.5 + lunge * 0.3; }
    if (glass) for (const s of [-1, 1]) { const k = s > 0 ? 'R' : 'L'; bones[`g${k}0`].rotation.x = Math.sin(ph + (s > 0 ? 0 : Math.PI)) * 0.4 * gait; }
    for (const s of orbit) { s.userData.a += dt * (1.2 + gait); s.position.set(Math.cos(s.userData.a) * s.userData.r, s.userData.y + Math.sin(t * 1.4) * 0.07, Math.sin(s.userData.a) * s.userData.r); s.rotation.y = -s.userData.a; }
    core.rotation.y += dt;
  } };
  return g;
}
export const buildIce = (m) => buildCrystal(m, 'ice');
export const buildSentinel = (m) => { const g = buildCrystal(m, 'obsidian'); g.scale.setScalar(1.1); return g; };
