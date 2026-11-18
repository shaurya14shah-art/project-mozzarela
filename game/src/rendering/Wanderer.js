// ══════════════════════════════════════════════════════════
// Wanderer — realistic people for the realm (from RŌNIN's swordsman)
//
// Every humanoid in Mozzarela was a KayKit chibi: a toy body with a
// head a third of its height. The realism pass replaces them with the
// body RŌNIN uses — the Mesh2Motion CC0 human (66-bone rig, real
// proportions, a real clip library) — dressed the way RŌNIN dresses it:
//
//   · CLOTHING SHELLS generated from the body mesh itself, each vertex
//     pushed out along its normal by a per-region offset, then Laplacian-
//     relaxed so cloth drapes over the body instead of tracing every
//     muscle, and skinned to the SAME skeleton so it deforms exactly with
//     it. (RŌNIN client/src/characters/Swordsman.ts `dress`/`relax`.)
//   · A SCULPTED HEAD (rendering/Face.js) replaces the mannequin's blank
//     egg, which is tucked inside it.
//
// Mozzarela's own part is the wardrobe: OUTFITS below dress the realm's
// people and its dead — the Pioneer in weathered travelling linen, the
// Hollowed in burial wrappings, the Veiled in long hooded robes, the
// Pale Lord in dark layered coats, the Bulwark in hide and iron.
//
// Each outfit is dressed ONCE into a template and registered with the
// ModelLibrary as `model:Wanderer_<id>`, with the clips renamed to the
// names EntityForge's creature animator already asks for (Idle,
// Walking_A, Running_A, Hit_A, Death_A) — so nothing downstream had to
// learn a new rig.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { buildHead } from './Face.js';

/**
 * The wardrobe. Colours are cloth albedo (the weave texture adds the
 * thread detail). `flare` widens the leg shell toward the ankle: 0 is a
 * trouser, ~0.1 a loose trouser, ~0.3 a robe falling to the feet.
 */
export const OUTFITS = {
  pioneer: {
    skin: 0x8c654f, hair: 0x1f1a15, idle: 'Idle_A',
    torso: 0x7a6e5e, belt: 0x4a3626, forearm: 0x6a5f52, legs: 0x4f4840, flare: 0.04, feet: 0x3a2f24, hood: null,
  },
  hollowed: {      // the realm's dead — burial wrappings, ash-grey, hollow-faced
    skin: 0x6e6a64, hair: null, hollow: true, idle: 'Fighting Idle',
    torso: 0x5e574e, belt: 0x3a3229, forearm: 0x6b6358, legs: 0x4c463f, flare: 0.08, feet: 0x3a342d, hood: 0x4a443d,
  },
  veiled: {        // hooded robe to the feet — the drifting ones
    skin: 0x8a8278, hair: null, hollow: true, idle: 'Fighting Idle',
    torso: 0x34313a, belt: 0x24222a, forearm: 0x34313a, legs: 0x34313a, flare: 0.3, feet: 0x26242b, hood: 0x2f2c34,
  },
  palelord: {      // a noble the realm kept — long dark coat, a sash the colour of old blood
    skin: 0xb5a89c, hair: 0x0e0c0c, idle: 'Fighting Idle',
    torso: 0x332a2f, belt: 0x6a2220, forearm: 0x332a2f, legs: 0x2a2328, flare: 0.22, feet: 0x1e1a1c, hood: null,
  },
  // ── The Sanctuary's living (NPC.js) ──
  elder: {         // grey hooded robe, a long life in it
    skin: 0x9a7a66, hair: 0x9a948a, idle: 'Idle_Subtle',
    torso: 0x6a665e, belt: 0x3e3226, forearm: 0x6a665e, legs: 0x5f5b54, flare: 0.26, feet: 0x2e271f, hood: 0x5c5850,
  },
  keeper: {        // working clothes: a leather apron over linen
    skin: 0x8a634c, hair: 0x2a2018, idle: 'Idle_A',
    torso: 0x5a3f2c, belt: 0x2e2218, forearm: 0x7c705e, legs: 0x4a4038, flare: 0.05, feet: 0x2e2419, hood: null,
  },
  rival: {         // a Pioneer who went further — dark travelling coat, ember-red sash
    skin: 0x7e5a44, hair: 0x120e0b, idle: 'Fighting Idle',
    torso: 0x2c2a2a, belt: 0x6e2a18, forearm: 0x3a3634, legs: 0x262424, flare: 0.12, feet: 0x1c1a19, hood: null,
  },
  bulwark: {       // big, hide and iron — the ones that stand in the way
    skin: 0x7a5a46, hair: 0x15110e, idle: 'Fighting Idle',
    torso: 0x6a5440, belt: 0x77736b, forearm: 0x77736b, legs: 0x55453a, flare: 0.05, feet: 0x3a3028, hood: null,
  },
};

/** Clip renames into EntityForge's vocabulary (KayKit names). */
function renamedClips(clips, idleName) {
  const by = new Map(clips.map(c => [c.name, c]));
  const out = [...clips];
  const alias = (from, to) => { const c = by.get(from); if (c) { const k = c.clone(); k.name = to; out.push(k); } };
  alias(idleName, 'Idle');
  alias('Walk', 'Walking_A');
  alias('Jog', 'Running_A');
  alias('Hit_Chest', 'Hit_A');
  // Death_A already carries the right name.
  return out;
}

// ── Dressing (ported from RŌNIN) ──────────────────────────

const HEAD_CENTRE = new THREE.Vector3(0, 1.692, 0.006);
const _v = new THREE.Vector3(), _m = new THREE.Matrix4();

function findBody(root) {
  let body = null;
  root.traverse(o => { if (o.isSkinnedMesh && !body) body = o; });
  return body;
}

/** Pull the mannequin's own head inward, out of sight inside the sculpted head. */
function tuckHead(body) {
  const g = body.geometry.clone();
  const p = g.attributes.position, j = g.attributes.skinIndex, w = g.attributes.skinWeight;
  for (let i = 0; i < p.count; i++) {
    let hw = 0;
    for (let k = 0; k < 4; k++) if (j.getComponent(i, k) === 6 || j.getComponent(i, k) === 7) hw += w.getComponent(i, k);
    if (hw < 0.5) continue;
    p.setXYZ(i, HEAD_CENTRE.x + (p.getX(i) - HEAD_CENTRE.x) * 0.7, HEAD_CENTRE.y + (p.getY(i) - HEAD_CENTRE.y) * 0.7, HEAD_CENTRE.z + (p.getZ(i) - HEAD_CENTRE.z) * 0.7);
  }
  g.computeVertexNormals();
  body.geometry = g;
}

/** Laplacian relaxation: cloth drapes instead of tracing muscle; never sinks into the body. */
function relax(geo, keep, iterations, skin, normals, offsets) {
  const pos = geo.attributes.position;
  const key = i => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  const weld = new Map(), canon = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) { const k = key(i); if (!weld.has(k)) weld.set(k, i); canon[i] = weld.get(k); }
  const nbrs = new Map();
  const idx = geo.index.array;
  for (let t = 0; t < idx.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = canon[idx[t + e]], b = canon[idx[t + (e + 1) % 3]];
      if (!nbrs.has(a)) nbrs.set(a, new Set());
      if (!nbrs.has(b)) nbrs.set(b, new Set());
      nbrs.get(a).add(b); nbrs.get(b).add(a);
    }
  }
  const p = new Float32Array(pos.array);
  for (let it = 0; it < iterations; it++) {
    const next = new Float32Array(p);
    for (const [v, set] of nbrs) {
      if (!keep[v] || set.size < 3) continue;
      let x = 0, y = 0, z = 0;
      for (const n of set) { x += p[n * 3]; y += p[n * 3 + 1]; z += p[n * 3 + 2]; }
      const k = 0.5 / set.size;
      next[v * 3] = p[v * 3] * 0.5 + x * k;
      next[v * 3 + 1] = p[v * 3 + 1] * 0.5 + y * k;
      next[v * 3 + 2] = p[v * 3 + 2] * 0.5 + z * k;
    }
    p.set(next);
  }
  for (let i = 0; i < pos.count; i++) {
    const c = canon[i];
    let x = p[c * 3], y = p[c * 3 + 1], z = p[c * 3 + 2];
    const nx = normals.getX(i), ny = normals.getY(i), nz = normals.getZ(i);
    const depth = (x - skin.getX(i)) * nx + (y - skin.getY(i)) * ny + (z - skin.getZ(i)) * nz;
    const min = offsets[i] * 0.85;
    if (depth < min) { x += nx * (min - depth); y += ny * (min - depth); z += nz * (min - depth); }
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
}

let _weave = null;
function weaveTexture() {
  if (_weave || typeof document === 'undefined') return _weave;
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  // Near-white base: the weave only adds thread detail; the outfit colour
  // carries the albedo. A mid-grey base halved every outfit to black.
  g.fillStyle = '#e4e4e4'; g.fillRect(0, 0, S, S);
  let seed = 5;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 9000; i++) {
    const v = 170 + rnd() * 85, horiz = rnd() < 0.5, x = rnd() * S, y = rnd() * S, l = 2 + rnd() * 5;
    g.fillStyle = `rgba(${v},${v},${v},0.3)`;
    g.fillRect(x, y, horiz ? l : 1, horiz ? 1 : l);
  }
  // Wear and grime: cloth that has been walked through a dead land.
  for (let i = 0; i < 60; i++) {
    const x = rnd() * S, y = rnd() * S, r = 8 + rnd() * 30;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(40,36,30,${0.15 + rnd() * 0.2})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  _weave = new THREE.CanvasTexture(c);
  _weave.colorSpace = THREE.SRGBColorSpace;
  _weave.wrapS = _weave.wrapT = THREE.RepeatWrapping;
  _weave.repeat.set(6, 6);
  return _weave;
}

function dress(body, o) {
  const g = body.geometry;
  const pos = g.attributes.position, nrm = g.attributes.normal;
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const bones = body.skeleton.bones;
  const bindY = (name) => {
    const i = bones.findIndex(b => b.name === name);
    return i < 0 ? 1.0 : _v.setFromMatrixPosition(_m.copy(body.skeleton.boneInverses[i]).invert()).y;
  };
  const waist = bindY('spine_01');
  const torso = new THREE.Color(o.torso), belt = new THREE.Color(o.belt), legs = new THREE.Color(o.legs);
  const feet = new THREE.Color(o.feet), forearm = o.forearm != null ? new THREE.Color(o.forearm) : null;
  const out = new Float32Array(pos.count * 3), col = new Float32Array(pos.count * 3);
  const keep = new Uint8Array(pos.count), offsets = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
    const name = bones[best].name;
    const y = pos.getY(i);
    let off = 0, c = null;
    if (/^(spine|clavicle|upperarm|neck_01$)/.test(name) || (name === 'pelvis' && y > waist - 0.02)) {
      c = Math.abs(y - (waist + 0.03)) < 0.05 ? belt : torso;
      off = c === belt ? 0.028 : 0.022;
      if (name === 'neck_01' && y > waist + 0.62) c = null;
    } else if (/^lowerarm/.test(name)) {
      if (forearm) { c = forearm; off = 0.022; }
    } else if (/^(pelvis|thigh|calf)/.test(name)) {
      c = legs;
      const drop = THREE.MathUtils.clamp((waist - y) / (waist - 0.05), 0, 1);
      off = 0.022 + o.flare * drop * drop;
    } else if (/^(foot|ball)/.test(name)) {
      c = feet; off = 0.008;
    }
    if (!c) continue;
    keep[i] = 1;
    offsets[i] = off;
    out[i * 3] = pos.getX(i) + nrm.getX(i) * off;
    out[i * 3 + 1] = pos.getY(i) + nrm.getY(i) * off;
    out[i * 3 + 2] = pos.getZ(i) + nrm.getZ(i) * off;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const shell = g.clone();
  shell.setAttribute('position', new THREE.BufferAttribute(out, 3));
  shell.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const index = g.index ? Array.from(g.index.array) : Array.from({ length: pos.count }, (_, i) => i);
  const tris = [];
  for (let t = 0; t < index.length; t += 3) {
    if (keep[index[t]] && keep[index[t + 1]] && keep[index[t + 2]]) tris.push(index[t], index[t + 1], index[t + 2]);
  }
  shell.setIndex(tris);
  relax(shell, keep, 4, pos, nrm, offsets);
  shell.computeVertexNormals();
  const mesh = new THREE.SkinnedMesh(shell, new THREE.MeshStandardMaterial({
    vertexColors: true, map: weaveTexture(), roughness: 0.94, side: THREE.DoubleSide,
  }));
  mesh.name = 'wanderer-cloth';
  mesh.bind(body.skeleton, body.bindMatrix);
  body.parent.add(mesh);
}

/** Seat the sculpted head on the head bone (and a hood over it if the outfit has one). */
function addHead(root, body, o) {
  tuckHead(body);
  const head = root.getObjectByName('head');
  if (!head) return;
  root.updateMatrixWorld(true);
  const parts = buildHead(o.skin, { hair: o.hair, hollow: !!o.hollow });
  const centre = body.localToWorld(HEAD_CENTRE.clone());
  head.worldToLocal(centre);
  parts.group.position.copy(centre);
  parts.group.quaternion.copy(head.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(body.getWorldQuaternion(new THREE.Quaternion())));
  if (o.hood != null) parts.group.add(hood(o.hood));
  head.add(parts.group);
}

/** A cowl: open at the face, falling to the shoulders. Head space (+z = face). */
function hood(colorHex) {
  const mat = new THREE.MeshStandardMaterial({ color: colorHex, map: weaveTexture(), roughness: 0.95, side: THREE.DoubleSide });
  const g = new THREE.Group();
  // Crown: a sphere cap missing its front, a little larger than the skull.
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.118, 40, 24, Math.PI * 0.68, Math.PI * 1.64, 0, Math.PI * 0.72), mat);
  cap.scale.set(0.98, 1.14, 1.08);
  cap.position.set(0, 0.012, -0.008);
  // The drape: an open cone falling from the jaw to the shoulders.
  const pts = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(0.105 + t * t * 0.09, -0.02 - t * 0.2)); }
  const drape = new THREE.Mesh(new THREE.LatheGeometry(pts, 36, Math.PI * 0.62, Math.PI * 1.76), mat);
  drape.position.set(0, 0.0, -0.012);
  g.add(cap, drape);
  g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.name = 'hood-part'; } });
  return g;
}

/**
 * Load the body and clips, dress every outfit once, and register each
 * as `model:Wanderer_<id>` on the given ModelLibrary.
 * @returns {Promise<number>} outfits registered
 */
export async function registerWanderers(modelLibrary, baseUrl = '/hd/models') {
  const loader = new GLTFLoader();
  let body, anims;
  try {
    [body, anims] = await Promise.all([
      loader.loadAsync(`${baseUrl}/wanderer.glb`),
      loader.loadAsync(`${baseUrl}/wanderer-anims.glb`),
    ]);
  } catch (err) {
    console.warn('[Wanderer] body unavailable — humanoids keep the old models:', err?.message || err);
    return 0;
  }
  let n = 0;
  for (const [id, o] of Object.entries(OUTFITS)) {
    try {
      const root = SkeletonUtils.clone(body.scene);
      const b = findBody(root);
      b.material = new THREE.MeshStandardMaterial({ color: o.skin, roughness: 0.62 });
      dress(b, o);
      addHead(root, b, o);
      root.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
      modelLibrary._templates.set(`model:Wanderer_${id}`, { scene: root, animations: renamedClips(anims.animations, o.idle) });
      n++;
    } catch (err) {
      console.warn(`[Wanderer] outfit "${id}" failed:`, err);
    }
  }
  console.log(`[Wanderer] ${n}/${Object.keys(OUTFITS).length} outfits dressed`);
  return n;
}
