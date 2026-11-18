// ══════════════════════════════════════════════════════════
// Face — RŌNIN's sculpted head, ported for the people of the realm
//
// From RŌNIN (client/src/characters/Face.ts). A dense sphere is pushed
// into a skull and jaw, then given a face by smooth Gaussian features:
// brow ridge, eye sockets, cheekbones, a nose with wings, lips, chin.
// Eyes sit in the sockets under lids; brows, ears and a hairline shell
// complete it. Skin varies through vertex colour (lips, cheeks, sockets,
// stubble). It replaces the Mesh2Motion mannequin's blank egg of a head.
//
// Mozzarela's changes: no samurai topknot; a `hollow` option for the
// realm's dead (sunken sockets, no eyes, drawn lips, ash skin) — the
// face is still a human face, which is what makes them unsettling.
//
// Space: metres, centred on the middle of the head; +z is the face.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const G = (d, s) => Math.exp(-(d * d) / (2 * s * s));
const RX = 0.077, RY = 0.115, RZ = 0.098;
const clamp = THREE.MathUtils.clamp;

function skull(dx, dy, dz) {
  let x = dx * RX, y = dy * RY, z = dz * RZ;
  if (dz < 0) z *= 1.1 - 0.12 * Math.max(0, -dy);
  if (dy < 0) x *= 1 - 0.3 * Math.pow(-dy, 1.6) * (dz > -0.3 ? 1 : 0.6);
  if (dz > 0) z *= 1 - 0.18 * Math.pow(Math.abs(dx), 2);
  if (dy < -0.55 && dz > 0) z += 0.012 * (-dy - 0.55) * 2 * dz;
  if (dy < -0.75) y = Math.max(y, -RY * 0.98 + (1 - dz) * 0.01);
  return new THREE.Vector3(x, y, z);
}

function relief(x, y, hollow) {
  const ax = Math.abs(x);
  let r = 0;
  const sock = hollow ? 0.019 : 0.0105;
  r -= sock * G(ax - 0.031, 0.015) * G(y - 0.012, 0.011);               // eye sockets
  r += 0.0055 * G(ax - 0.029, 0.021) * G(y - 0.031, 0.0065);            // brow ridge
  r += 0.003 * G(x, 0.02) * G(y - 0.034, 0.01);                          // glabella
  const t = clamp((0.024 - y) / 0.06, 0, 1);
  const ridge = (0.003 + 0.019 * Math.pow(t, 1.5)) * (y > -0.038 ? 1 : G(y + 0.038, 0.005));
  r += ridge * G(x, 0.0065 + t * 0.004) * (hollow ? 0.8 : 1);
  r += 0.0062 * G(ax - 0.0125, 0.0065) * G(y + 0.033, 0.0055);           // alae
  r += 0.0058 * G(ax - 0.046, 0.017) * G(y + 0.004, 0.012) * (hollow ? 1.5 : 1);  // cheekbones
  r -= (hollow ? 0.0075 : 0.0025) * G(ax - 0.04, 0.012) * G(y + 0.03, 0.012);     // under them
  r += 0.0016 * G(x, 0.004) * G(y + 0.047, 0.004);                       // philtrum
  r += (hollow ? 0.0035 : 0.0058) * G(x, 0.017) * G(y + 0.055, 0.0042);  // upper lip
  r += (hollow ? 0.004 : 0.0068) * G(x, 0.015) * G(y + 0.066, 0.0045);   // lower lip
  r -= 0.003 * G(x, 0.019) * G(y + 0.0605, 0.0016);                      // mouth line
  r -= 0.0025 * G(x, 0.014) * G(y + 0.077, 0.004);
  r += 0.0075 * G(x, 0.017) * G(y + 0.094, 0.011);                       // chin
  return r;
}

function tint(p, c, hollow) {
  const ax = Math.abs(p.x);
  c.setRGB(1, 1, 1);
  if (p.z <= 0) return c;
  const lips = G(p.y + 0.06, 0.007) * G(p.x, 0.016);
  if (!hollow) { c.r += lips * 0.12; c.g -= lips * 0.12; c.b -= lips * 0.08; }
  else c.multiplyScalar(1 - lips * 0.25);
  const cheeks = G(ax - 0.044, 0.016) * G(p.y + 0.012, 0.014);
  if (!hollow) { c.r += cheeks * 0.06; c.g -= cheeks * 0.03; }
  const sockets = G(ax - 0.031, 0.016) * G(p.y - 0.01, 0.012);
  c.multiplyScalar(1 - sockets * (hollow ? 0.75 : 0.22));
  const jaw = p.y < -0.05 ? Math.min(1, (-p.y - 0.05) / 0.02) * (1 - G(p.x, 0.01) * G(p.y + 0.06, 0.006)) : 0;
  const lipShadow = G(p.x, 0.02) * G(p.y + 0.046, 0.004) * 0.6;
  const beard = hollow ? 0 : Math.max(jaw * (ax < 0.07 ? 1 : 0.4), lipShadow) * (lips > 0.5 ? 0 : 1);
  c.multiplyScalar(1 - beard * 0.22);
  c.b += beard * 0.015;
  return c;
}

const _heads = new Map();
function sculpt(hollow) {
  const key = hollow ? 'hollow' : 'living';
  if (_heads.has(key)) return _heads.get(key);
  const g = mergeVertices(new THREE.SphereGeometry(1, 96, 72), 1e-4);
  g.deleteAttribute('uv');
  const p = g.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const v = skull(p.getX(i), p.getY(i), p.getZ(i));
    if (v.z > 0) v.z += relief(v.x, v.y, hollow) * THREE.MathUtils.smoothstep(v.z, 0.02, 0.06);
    p.setXYZ(i, v.x, v.y, v.z);
    tint(v, c, hollow);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  _heads.set(key, g);
  return g;
}

function faceZ(x, y, hollow) {
  let best = 0, err = Infinity;
  for (let a = -1; a <= 1; a += 0.02) {
    for (let b = -1; b <= 1; b += 0.02) {
      const dz2 = 1 - a * a - b * b;
      if (dz2 <= 0) continue;
      const v = skull(a, b, Math.sqrt(dz2));
      const e = Math.hypot(v.x - x, v.y - y);
      if (e < err) { err = e; best = v.z; }
    }
  }
  return best + relief(x, y, hollow);
}

let _eyeTex = null;
function eyeTexture() {
  if (_eyeTex) return _eyeTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#d6cfc2'; g.fillRect(0, 0, 128, 128);
  g.save(); g.translate(32, 64); g.scale(1, 2);
  const iris = g.createRadialGradient(0, 0, 1, 0, 0, 8.5);
  iris.addColorStop(0, '#070504'); iris.addColorStop(0.3, '#070504');
  iris.addColorStop(0.38, '#3e3426'); iris.addColorStop(0.85, '#2a241a'); iris.addColorStop(1, '#100c08');
  g.fillStyle = iris; g.beginPath(); g.arc(0, 0, 8.5, 0, Math.PI * 2); g.fill();
  g.restore();
  _eyeTex = new THREE.CanvasTexture(c);
  _eyeTex.colorSpace = THREE.SRGBColorSpace;
  return _eyeTex;
}

let _hairGeo = null;
function hairShell() {
  if (_hairGeo) return _hairGeo;
  const hairGeo = sculpt(false).clone();
  const hp = hairGeo.attributes.position, idx = hairGeo.index;
  const above = new Float32Array(hp.count);
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
    const front = 0.058 - 0.04 * Math.pow(Math.abs(x) / RX, 2);
    const back = THREE.MathUtils.smoothstep(-z, -0.02, 0.06);
    const line = THREE.MathUtils.lerp(front, -0.07, back);
    const ear = G(Math.abs(x) - RX, 0.02) * G(z + 0.012, 0.03) * 0.045;
    above[i] = y - (line + ear);
  }
  const keep = [];
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
    if (Math.max(above[a], above[b], above[c]) > -0.004) keep.push(a, b, c);
  }
  const rgba = new Float32Array(hp.count * 4);
  const v = new THREE.Vector3();
  for (let i = 0; i < hp.count; i++) {
    v.set(hp.getX(i), hp.getY(i), hp.getZ(i));
    // Cropped and a little unkempt — fuller than RŌNIN's tied-back hair.
    v.addScaledVector(v.clone().normalize(), 0.005 + Math.max(0, v.y) * 0.034);
    hp.setXYZ(i, v.x, v.y, v.z);
    rgba.set([1, 1, 1, clamp(0.5 + above[i] / 0.006, 0, 1)], i * 4);
  }
  hairGeo.setIndex(keep);
  hairGeo.setAttribute('color', new THREE.BufferAttribute(rgba, 4));
  hairGeo.computeVertexNormals();
  _hairGeo = hairGeo;
  return hairGeo;
}

/**
 * @param {number} skinHex
 * @param {{hair?:number|null, hollow?:boolean}} opts  hair: colour, or null for none
 */
export function buildHead(skinHex, { hair = 0x1a1612, hollow = false } = {}) {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: skinHex, vertexColors: true, roughness: hollow ? 0.8 : 0.56 });
  const head = new THREE.Mesh(sculpt(hollow), skin);
  head.castShadow = true;
  group.add(head);

  const plainSkin = new THREE.MeshStandardMaterial({ color: skinHex, roughness: hollow ? 0.8 : 0.56 });
  const eyeMat = hollow
    ? new THREE.MeshStandardMaterial({ color: 0x0b0a09, roughness: 0.35 })   // the dead's eyes are dark and wet
    : new THREE.MeshStandardMaterial({ map: eyeTexture(), roughness: 0.25 });
  for (const side of [-1, 1]) {
    const x = side * 0.031, y = 0.012;
    const z = faceZ(x, y, hollow) - (hollow ? 0.006 : 0.0085);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0118, 24, 16), eyeMat);
    eye.position.set(x, y, z);
    group.add(eye);
    const upper = new THREE.Mesh(new THREE.SphereGeometry(0.0127, 24, 12, 0, Math.PI * 2, 0, Math.PI * (hollow ? 0.5 : 0.42)), plainSkin);
    upper.position.copy(eye.position);
    upper.rotation.x = 0.03;
    const lower = new THREE.Mesh(new THREE.SphereGeometry(0.0124, 24, 12, 0, Math.PI * 2, Math.PI * 0.655, Math.PI * 0.345), plainSkin);
    lower.position.copy(eye.position);
    group.add(upper, lower);
    if (hair !== null && !hollow) {
      const pts = [-0.019, -0.006, 0.008, 0.02].map((dx, i) => {
        const bx = x + side * dx, by = 0.03 + [0.0, 0.003, 0.003, -0.001][i];
        return new THREE.Vector3(bx, by, faceZ(bx, by, false) + 0.0012);
      });
      const brow = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.0022, 6),
        new THREE.MeshStandardMaterial({ color: hair, roughness: 0.9 }));
      brow.scale.set(1, 1.15, 0.7);
      group.add(brow);
    }
  }

  const earSkin = plainSkin.clone();
  earSkin.side = THREE.DoubleSide;
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(0.004 + Math.sin(t * Math.PI) * 0.016, (t - 0.5) * 0.058)); }
    const ear = new THREE.Mesh(new THREE.LatheGeometry(pts, 14, 0, Math.PI), earSkin);
    ear.scale.set(1, 1, 0.45);
    ear.rotation.set(0, side > 0 ? -Math.PI / 2 - 0.25 : Math.PI / 2 + 0.25, 0);
    ear.position.set(side * (RX - 0.004), -0.008, -0.012);
    group.add(ear);
  }

  if (hair !== null && !hollow) {
    const hairMat = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.62, metalness: 0.04, vertexColors: true, alphaTest: 0.5 });
    const h = new THREE.Mesh(hairShell(), hairMat);
    h.castShadow = true;
    group.add(h);
  }
  // ⚠️ Every part named 'head-…'. Player._setFirstPersonBody hides the
  // head by NAME (/head|hood|…/) so the camera, which sits inside the
  // skull, does not see the hair and eyes from within — measured as a
  // dark shape filling the bottom-left of the first-person frame.
  group.name = 'head-sculpt';
  group.traverse(o => { if (o.isMesh && !o.name) o.name = 'head-part'; });
  return { group, skin };
}
