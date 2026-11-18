// ══════════════════════════════════════════════════════════
// Arms — every weapon, rebuilt from its anatomy (realism pass)
//
// Owner: *"other weapons also need the reworking… the Reaper, the sword,
// everything… with the newer models, no, I do not want any of the old
// models ever again."* The old plans (EntityForge WEAPON_PLANS) were
// stacked primitives: box blades, a scythe made of five rectangles, a
// greatsword that was the sword scaled ×1.55. They are no longer built.
//
// What these are built FROM, in the spirit of RŌNIN's katana
// (forge/mesh-generator.ts — "a katana built from its real anatomy"):
//
//   · BLADES are a cross-section swept along a centreline, station by
//     station. Double-edged blades carry a lenticular-diamond section
//     (edge → bevel → ridge), single-edged ones a wedge (thick spine →
//     flat → bevel → edge). Width and thickness are functions along the
//     length, so a leaf spear swells, a longsword has a ricasso, a
//     scythe narrows to a needle, and the centreline can CURVE.
//   · FITTINGS are lathed (pommels, ferrules, collars, sockets).
//   · HEADS are extruded 2D silhouettes whose thickness then tapers to
//     the edge (a bearded axe, a hammer's beak).
//   · GRIPS are a real spiral of leather or cord over a wooden core.
//   · SURFACES are procedural: brushed and forge-mottled steel with a
//     bright honed edge, blackened iron, bronze for finer fittings, ash
//     wood with grain, oiled leather.
//
// Real size, in METRES. The frame every caller already relies on is
// kept: grip along +y through the origin's axis, business end up (+y),
// hand at the grip. Each weapon reports `userData.grip = {y, r}` — the
// centre and radius of where a hand closes — so the first-person hand
// is placed on the actual handle, not on a guess.
//
// Part tags kept for the Facet highlighter (main.js ASPECT_PART_FOR):
// 'edge' on cutting edges, 'point' on points (never tagged before — every
// thrust Facet lit nothing), 'head' on axe/hammer heads, 'focus' on the
// stone set in the weapon (`name: 'weapon-core'`).
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ELEMENTS, ELEMENT_COLORS } from '../data/constants.js';
import { leatherMaterial } from './Hand.js';

const hexOf = (css) => parseInt(String(css || '#888888').replace('#', ''), 16);

// ── Seeded randomness ────────────────────────────────────
function rng(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6D2B79F5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ══════════════════════════════════════════════════════════
// SURFACES
// ══════════════════════════════════════════════════════════
const _tex = new Map();
function canvasTex(key, w, h, paint, { srgb = true, repeat = [1, 1] } = {}) {
  if (_tex.has(key)) return _tex.get(key);
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  _tex.set(key, t);
  return t;
}
function rnd(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

/** Brushed steel: long streaks along v (the blade's length) and forge mottling. */
function steelMaps() {
  const albedo = canvasTex('steel-a', 128, 512, (g, W, H) => {
    const r = rnd(7);
    g.fillStyle = '#9a9ea2'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 1600; i++) {
      const v = 120 + r() * 110;
      g.fillStyle = `rgba(${v},${v + 2},${v + 5},0.10)`;
      g.fillRect(r() * W, r() * H, 1, 20 + r() * 140);
    }
    for (let i = 0; i < 70; i++) {           // forge mottling, faint
      const x = r() * W, y = r() * H, rad = 6 + r() * 26;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, `rgba(60,58,56,${0.06 + r() * 0.08})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  });
  const rough = canvasTex('steel-r', 128, 512, (g, W, H) => {
    const r = rnd(11);
    g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 1400; i++) {
      const v = 90 + r() * 120;
      g.fillStyle = `rgba(${v},${v},${v},0.16)`;
      g.fillRect(r() * W, r() * H, 1, 15 + r() * 120);
    }
  }, { srgb: false });
  return { albedo, rough };
}

/** Hammer-mottled blackened iron. */
function ironMap() {
  return canvasTex('iron', 256, 256, (g, W, H) => {
    const r = rnd(19);
    g.fillStyle = '#4a4744'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) {
      const x = r() * W, y = r() * H, rad = 3 + r() * 12;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      const d = r() < 0.5;
      grd.addColorStop(0, d ? 'rgba(20,18,17,0.35)' : 'rgba(120,114,106,0.18)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }, { repeat: [2, 2] });
}

/** Ash wood: grain along v. */
function woodMap() {
  return canvasTex('ashwood', 128, 512, (g, W, H) => {
    const r = rnd(29);
    g.fillStyle = '#6e5841'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) {
      const x = r() * W, w = 0.5 + r() * 2.2, l = 40 + r() * 300, y = r() * H;
      g.fillStyle = r() < 0.55 ? `rgba(40,28,18,${0.18 + r() * 0.3})` : `rgba(150,124,92,${0.10 + r() * 0.16})`;
      g.fillRect(x, y, w, l);
    }
    for (let i = 0; i < 6; i++) {            // a few knots
      const x = r() * W, y = r() * H;
      g.strokeStyle = 'rgba(30,20,12,0.5)'; g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(x, y, 3 + r() * 4, 7 + r() * 9, 0, 0, Math.PI * 2); g.stroke();
    }
  }, { repeat: [1, 3] });
}

/** Ink-dark leather-bound board and cream page edges for the book. */
function pageEdgeMap() {
  return canvasTex('pages', 256, 64, (g, W, H) => {
    const r = rnd(41);
    g.fillStyle = '#cfc2a0'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 1) {
      g.fillStyle = `rgba(90,74,50,${0.05 + r() * 0.14})`; g.fillRect(0, y, W, 1);
    }
    const grd = g.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, 'rgba(60,46,28,0.35)'); grd.addColorStop(0.5, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(60,46,28,0.35)');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
  });
}

const _mats = new Map();
const mat = (k, make) => { if (!_mats.has(k)) _mats.set(k, make()); return _mats.get(k); };

/** Blade steel. Tier polishes it: lower roughness, cleaner colour. */
function steel(tier) {
  const t = Math.max(0, Math.min(6, tier | 0));
  return mat(`steel:${t}`, () => {
    const m = steelMaps();
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x8e9399).lerp(new THREE.Color(0xc4c9cf), t / 6),
      map: m.albedo, roughnessMap: m.rough,
      roughness: 0.66 - t * 0.04, metalness: 1.0,   // never mirror-bright: a sun glint on a mirror blade blooms the frame
      userData: { metalPart: 'blade' },
    });
  });
}
/** The honed edge: a bright, finely polished bevel. */
function edgeSteel(tier) {
  return mat(`edge:${tier | 0}`, () => new THREE.MeshStandardMaterial({
    color: 0xc8ccd1, roughness: 0.36 - Math.min(6, tier | 0) * 0.015, metalness: 1.0,
    userData: { metalPart: 'edge' },
  }));
}
function iron() {
  return mat('iron', () => new THREE.MeshStandardMaterial({ color: 0x8a8580, map: ironMap(), roughness: 0.58, metalness: 0.85, userData: { metalPart: 'head' } }));
}
function bronze() {
  return mat('bronze', () => new THREE.MeshStandardMaterial({ color: 0xa47c48, map: ironMap(), roughness: 0.42, metalness: 1.0 }));
}
function silver() {
  return mat('silver', () => new THREE.MeshStandardMaterial({ color: 0x6d6c70, map: ironMap(), roughness: 0.36, metalness: 1.0 }));
}
/** Fittings by tier: plain iron, then bronze, then blackened silver. */
function fitting(tier) { return tier >= 5 ? silver() : tier >= 3 ? bronze() : iron(); }
function wood() {
  return mat('ash', () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: woodMap(), roughness: 0.72, metalness: 0 }));
}
function darkWood() {
  return mat('darkash', () => new THREE.MeshStandardMaterial({ color: 0x6a6056, map: woodMap(), roughness: 0.66, metalness: 0 }));
}
function cord() {
  return mat('cord', () => new THREE.MeshStandardMaterial({ color: 0x3a3029, roughness: 0.92, metalness: 0 }));
}
function horn() {
  return mat('horn', () => new THREE.MeshStandardMaterial({ color: 0x2a241f, roughness: 0.35, metalness: 0 }));
}
/** The set stone: dark glass whose light is the element (like the focus). */
function stone(element, tier) {
  const c = hexOf(ELEMENT_COLORS[element] || ELEMENT_COLORS[ELEMENTS.NEUTRAL]);
  // NOT cached: the Facet highlighter clones per mesh, and retints are per element.
  return new THREE.MeshPhysicalMaterial({
    color: 0x101114, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08,
    emissive: c, emissiveIntensity: 0.35 + Math.min(6, tier) * 0.08, flatShading: true,
  });
}

// ══════════════════════════════════════════════════════════
// GEOMETRY
// ══════════════════════════════════════════════════════════

/**
 * Sweep a closed 2D cross-section along a centreline.
 *
 * @param {(t:number)=>THREE.Vector3} centre   point at t ∈ [0,1]
 * @param {(t:number)=>[number,number][]} section  CCW points (w across, h thick) at t
 * @param {number} stations
 * @param {{capStart?:boolean, tip?:boolean, widthAxis?:THREE.Vector3}} opts
 * @returns faceted BufferGeometry (crisp bevels), u around / v along
 */
function sweep(centre, section, stations, { capStart = true, tip = true, ref = null } = {}) {
  const rings = [];
  // Thickness direction reference: +z (a blade standing in the x-y plane)
  // unless the caller lays it another way (a scythe blade lies flat: +y).
  const up = ref ? ref.clone() : new THREE.Vector3(0, 0, 1);
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    const p = centre(t);
    const p2 = centre(Math.min(1, t + 1e-3)), p1 = centre(Math.max(0, t - 1e-3));
    const T = p2.clone().sub(p1).normalize();
    const B = up.clone().sub(T.clone().multiplyScalar(up.dot(T))).normalize();  // thickness
    const N = new THREE.Vector3().crossVectors(B, T).normalize();               // width
    const sec = section(t);
    rings.push(sec.map(([w, h]) => p.clone().addScaledVector(N, w).addScaledVector(B, h)));
  }
  const n = rings[0].length;
  const pos = [], uv = [];
  const quad = (a, b, c, d, u0, u1, v0, v1) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
  };
  for (let i = 0; i < stations; i++) {
    const A = rings[i], Bn = rings[i + 1];
    const v0 = i / stations, v1 = (i + 1) / stations;
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n;
      if (tip && i === stations - 1) {
        // Last ring collapses to the point: triangles, not slivers of quads.
        const pt = Bn[0].clone();
        for (const q of Bn) pt.add(q); pt.multiplyScalar(1 / (n + 1));
        pos.push(A[k].x, A[k].y, A[k].z, A[k2].x, A[k2].y, A[k2].z, pt.x, pt.y, pt.z);
        uv.push(k / n, v0, (k + 1) / n, v0, (k + 0.5) / n, 1);
      } else {
        quad(A[k], A[k2], Bn[k2], Bn[k], k / n, (k + 1) / n, v0, v1);
      }
    }
  }
  if (capStart) {
    const A = rings[0], c = A.reduce((s, q) => s.add(q), new THREE.Vector3()).multiplyScalar(1 / n);
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n;
      pos.push(c.x, c.y, c.z, A[k2].x, A[k2].y, A[k2].z, A[k].x, A[k].y, A[k].z);
      uv.push(0.5, 0, 0, 0, 1, 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Double-edged lenticular-diamond section: edge → bevel → ridge, mirrored. */
const dblSection = (w, th, bevel = 0.18) => [
  [w, 0], [w * (1 - bevel), th * 0.42], [0, th], [-w * (1 - bevel), th * 0.42],
  [-w, 0], [-w * (1 - bevel), -th * 0.42], [0, -th], [w * (1 - bevel), -th * 0.42],
];
/** Single-edged wedge: spine (w<0 side) thick, edge at +w. */
const sglSection = (w, th, bevel = 0.3) => [
  [w, 0], [w * (1 - bevel), th * 0.55], [-w * 0.92, th], [-w, th * 0.6],
  [-w, -th * 0.6], [-w * 0.92, -th], [w * (1 - bevel), -th * 0.55],
];

function lathe(profile, segs = 24) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(1e-4, r), y)), segs);
}

/** A strap wound round a cylinder from y0 to y1. */
function helixWrap(y0, y1, r, turns, tube, seg = 6) {
  const curve = new THREE.Curve();
  curve.getPoint = (t, out = new THREE.Vector3()) => {
    const a = t * turns * Math.PI * 2;
    return out.set(Math.cos(a) * r, y0 + (y1 - y0) * t, Math.sin(a) * r);
  };
  return new THREE.TubeGeometry(curve, Math.max(24, Math.round(turns * 20)), tube, seg, false);
}

/** Extrude a 2D outline (x right, y up) by `depth` along z, centred, then taper toward +x edge. */
function headFrom(points, depth, { taperFrom = null, taperTo = 0.12, bevel = 0.004 } = {}) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 12,
  });
  g.translate(0, 0, -depth / 2);
  if (taperFrom !== null) {
    // Thickness falls off toward the cutting edge: a real axe is a wedge.
    const p = g.attributes.position;
    let maxX = -Infinity;
    for (let i = 0; i < p.count; i++) maxX = Math.max(maxX, p.getX(i));
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      if (x <= taperFrom) continue;
      const k = Math.min(1, (x - taperFrom) / Math.max(1e-4, maxX - taperFrom));
      p.setZ(i, p.getZ(i) * (1 - k * (1 - taperTo)));
    }
  }
  g.computeVertexNormals();
  return g;
}

const mesh = (geo, material, extra = {}) => {
  const m = new THREE.Mesh(geo, material);
  Object.assign(m.userData, extra);
  return m;
};
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ══════════════════════════════════════════════════════════
// SHARED PARTS
// ══════════════════════════════════════════════════════════

/** Wooden core + spiral leather wrap, centred on y, length L. */
function grip(g, y, L, r = 0.0155, wrapMat = null) {
  const core = mesh(lathe([[r * 0.92, -L / 2], [r, -L / 2 + 0.01], [r * 1.04, 0], [r, L / 2 - 0.01], [r * 0.92, L / 2]], 16), darkWood());
  core.position.y = y;
  const wrap = mesh(helixWrap(-L / 2 + 0.006, L / 2 - 0.006, r + 0.0012, L / 0.011, 0.0034), wrapMat || leatherMaterial());
  wrap.position.y = y;
  g.add(core, wrap);
}

/** The element's stone, set as a cabochon. Skipped for neutral. */
function setStone(g, element, tier, at, size = 0.011) {
  if (!element || element === ELEMENTS.NEUTRAL || element === 'neutral') return null;
  const geo = new THREE.IcosahedronGeometry(size, 1);
  geo.scale(1, 1.25, 0.7);
  const s = mesh(geo, stone(element, tier), { part: 'focus' });
  s.name = 'weapon-core';
  s.userData.clamped = true;
  s.position.copy(at);
  g.add(s);
  return s;
}

/** A crossguard: a lathe-profiled bar, arms tapering to knobbed ends, slightly arched. */
function crossguard(g, half, tier, { arch = 0.012, thick = 0.011 } = {}) {
  const m = fitting(tier);
  const curve = new THREE.CatmullRomCurve3([V(-half, -arch, 0), V(-half * 0.5, -arch * 0.25, 0), V(0, 0, 0), V(half * 0.5, -arch * 0.25, 0), V(half, -arch, 0)]);
  const prof = (t) => {
    const d = Math.abs(t - 0.5) * 2;                  // 0 centre → 1 tip
    const r = thick * (1.25 - d * 0.55);
    return [[r, 0], [0, r * 1.2], [-r, 0], [0, -r * 1.2]];
  };
  const bar = mesh(sweep((t) => curve.getPoint(t), (t) => prof(t).map(([a, b]) => [b * 0.85, a]), 24, { tip: false, capStart: true }), m);
  g.add(bar);
  for (const s of [-1, 1]) {
    const knob = mesh(new THREE.SphereGeometry(thick * 0.95, 12, 8), m);
    knob.position.set(s * half, -arch, 0);
    g.add(knob);
  }
  // The block that seats the blade's shoulder.
  const block = mesh(lathe([[0.013, -0.012], [0.017, -0.006], [0.017, 0.006], [0.012, 0.014]], 8), m);
  block.scale.set(1.1, 1, 0.75);
  g.add(block);
}

function wheelPommel(g, y, tier, r = 0.022) {
  const p = mesh(lathe([[0.008, 0.012], [r * 0.8, 0.01], [r, 0], [r * 0.8, -0.01], [0.006, -0.013]], 24), fitting(tier));
  p.rotation.z = Math.PI / 2;
  p.position.y = y;
  p.scale.set(1, 1, 0.55);
  g.add(p);
  return p;
}

// ══════════════════════════════════════════════════════════
// THE WEAPONS — each returns grip {y, r}
// ══════════════════════════════════════════════════════════

/** A straight double-edged blade from y=0 up. width(t), thick(t) in metres. */
function straightBlade(g, len, width, thick, tier, { y0 = 0, stations = 36, bevel = 0.18 } = {}) {
  const geo = sweep((t) => V(0, y0 + t * len, 0), (t) => dblSection(width(t), thick(t), bevel), stations);
  const b = mesh(geo, steel(tier), { part: 'edge' });
  g.add(b);
  // The point, tagged separately so a thrust lights the tip.
  const tipGeo = sweep((t) => V(0, y0 + len * (0.9 + t * 0.1), 0), (t) => dblSection(width(0.9 + t * 0.1) * 1.01, thick(0.9 + t * 0.1) * 1.01, bevel), 6);
  g.add(mesh(tipGeo, edgeSteel(tier), { part: 'point' }));
  return b;
}

const ARMS = {
  /** Arming sword: tapering double edge, fuller, arched guard, wheel pommel. */
  sword(g, r, tier) {
    const len = 0.74 + r() * 0.1, w0 = 0.024 + r() * 0.005;
    straightBlade(g, len,
      (t) => w0 * (1 - Math.pow(t, 1.6) * 0.82) * (t > 0.9 ? (1 - t) / 0.1 : 1),
      (t) => 0.0042 * (1 - t * 0.55), tier);
    crossguard(g, 0.085 + r() * 0.03, tier);
    grip(g, -0.075, 0.11);
    wheelPommel(g, -0.145, tier);
    return { y: -0.075, r: 0.0155 };
  },

  /** Longsword: long blade, a short leather-wrapped ricasso, long two-hand grip, scent-stopper pommel. */
  greatsword(g, r, tier) {
    const len = 1.05 + r() * 0.12, w0 = 0.027;
    straightBlade(g, len,
      (t) => (t < 0.09 ? w0 * 0.82 : w0 * (1 - Math.pow((t - 0.09) / 0.91, 1.4) * 0.8)) * (t > 0.92 ? (1 - t) / 0.08 : 1),
      (t) => 0.0055 * (1 - t * 0.6), tier, { stations: 44 });
    // Ricasso leather and the parrying lugs above it.
    const ric = mesh(helixWrap(0.01, 0.085, 0.0245, 6, 0.003), leatherMaterial());
    ric.scale.set(1, 1, 0.3);
    g.add(ric);
    for (const s of [-1, 1]) {
      const lug = mesh(new THREE.ConeGeometry(0.008, 0.03, 8), fitting(tier));
      lug.rotation.z = -s * Math.PI / 2;
      lug.position.set(s * 0.034, 0.092, 0);
      g.add(lug);
    }
    crossguard(g, 0.13 + r() * 0.03, tier, { arch: 0.016, thick: 0.013 });
    grip(g, -0.13, 0.22, 0.0165);
    const pommel = mesh(lathe([[0.006, -0.276], [0.018, -0.266], [0.024, -0.25], [0.02, -0.238], [0.009, -0.236]], 20), fitting(tier));
    g.add(pommel);
    return { y: -0.07, r: 0.0165 };
  },

  /** Rondel dagger: stiff triangular blade, disc guard and disc pommel. */
  dagger(g, r, tier) {
    const len = 0.24 + r() * 0.05;
    straightBlade(g, len, (t) => 0.014 * (1 - t * 0.92), (t) => 0.0065 * (1 - t * 0.7), tier, { bevel: 0.45, stations: 18 });
    const disc = (y) => { const d = mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.008, 24), fitting(tier)); d.position.y = y; g.add(d); };
    disc(-0.002);
    grip(g, -0.055, 0.095, 0.0145);
    disc(-0.106);
    return { y: -0.055, r: 0.0145 };
  },

  /** A pair of short, slightly curved single-edged blades. */
  dualblades(g, r, tier) {
    for (const s of [-1, 1]) {
      const one = new THREE.Group();
      const len = 0.46 + r() * 0.06;
      const geo = sweep((t) => V(Math.sin(t * 1.2) * 0.035 * s * -1, t * len, 0),
        (t) => sglSection(0.017 * (1 - t * 0.45) * (t > 0.86 ? (1 - t) / 0.14 : 1), 0.0045 * (1 - t * 0.5)).map(([a, b]) => [a * -s, b]), 28);
      one.add(mesh(geo, steel(tier), { part: 'edge' }));
      const guard = mesh(lathe([[0.004, -0.006], [0.03, -0.004], [0.03, 0.004], [0.004, 0.006]], 6), fitting(tier));
      guard.scale.set(1, 1, 0.45);
      one.add(guard);
      grip(one, -0.06, 0.1, 0.0145);
      const cap = mesh(lathe([[0.012, -0.112], [0.017, -0.118], [0.004, -0.13]], 12), fitting(tier));
      one.add(cap);
      one.position.x = s * 0.11;
      one.rotation.z = s * 0.06;
      g.add(one);
    }
    return { y: -0.06, r: 0.0145, x: 0.11 };
  },

  /** Bearded axe: ash haft with a swell, forged head with a wedge taper, iron langets. */
  axe(g, r, tier) {
    const haft = mesh(lathe([[0.016, -0.55], [0.0175, -0.5], [0.015, -0.2], [0.0165, 0.12], [0.019, 0.2]], 16), wood());
    g.add(haft);
    const butt = mesh(lathe([[0.019, -0.565], [0.02, -0.555], [0.018, -0.545]], 16), iron());
    g.add(butt);
    grip(g, -0.42, 0.14, 0.0175, cord());
    const beard = 0.07 + r() * 0.04;
    const head = mesh(headFrom([
      [0.02, 0.05], [0.07, 0.045], [0.135, 0.08], [0.15, 0.05], [0.15, -beard], [0.12, -beard + 0.01],
      [0.07, -0.02], [0.02, -0.03], [-0.03, -0.022], [-0.035, 0.04],
    ], 0.034, { taperFrom: 0.06, taperTo: 0.08 }), iron(), { part: 'head' });
    head.position.y = 0.17;
    g.add(head);
    // The honed bit along the edge.
    const bit = mesh(new THREE.BoxGeometry(0.008, 0.1 + beard, 0.004), edgeSteel(tier), { part: 'edge' });
    bit.position.set(0.15, 0.17 + 0.065 - (0.1 + beard) / 2, 0);
    g.add(bit);
    for (const s of [-1, 1]) {
      const lang = mesh(new THREE.BoxGeometry(0.012, 0.11, 0.003), iron());
      lang.position.set(0, 0.1, s * 0.019);
      g.add(lang);
    }
    // The leading hand high on the haft; the off hand takes the cord wrap
    // at the butt (Choreo PROFILE.axe.grip2), so an overhead chop keeps
    // both hands in front of the eye.
    return { y: -0.22, r: 0.0175 };
  },

  /** Pickaxe (world expansion): an ash haft, a curved iron head — a point one side, a chisel the other. */
  pickaxe(g, r, tier) {
    const haft = mesh(lathe([[0.016, -0.5], [0.0175, -0.45], [0.015, -0.15], [0.017, 0.12], [0.02, 0.2]], 16), wood());
    g.add(haft);
    grip(g, -0.38, 0.14, 0.0175, cord());
    const head = new THREE.Group(); head.position.y = 0.18; g.add(head);
    // The head: a swept bar, thickest at the eye, curving down to a point
    // one way and flaring to a chisel the other.
    const bar = new THREE.CatmullRomCurve3([V(-0.2, -0.05, 0), V(-0.1, 0.01, 0), V(0, 0.025, 0), V(0.1, 0.01, 0), V(0.2, -0.05, 0)]);
    head.add(mesh(new THREE.TubeGeometry(bar, 24, 0.016, 8, false), iron(), { part: 'head' }));
    const pick = mesh(new THREE.ConeGeometry(0.016, 0.05, 8), edgeSteel(tier), { part: 'edge' });
    pick.position.set(0.215, -0.068, 0); pick.rotation.z = -2.3; head.add(pick);
    const chisel = mesh(new THREE.BoxGeometry(0.03, 0.006, 0.034), edgeSteel(tier));
    chisel.position.set(-0.21, -0.06, 0); chisel.rotation.z = 0.7; head.add(chisel);
    const eye = mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.05, 10), iron());
    eye.position.set(0, 0.01, 0); head.add(eye);
    return { y: -0.22, r: 0.0175 };
  },

  /** Spear: long ash shaft, leaf blade with a midrib, socket, butt spike. */
  spear(g, r, tier) {
    const top = 0.95, bot = -1.0;
    const shaft = mesh(lathe([[0.016, bot], [0.0175, -0.5], [0.0175, 0.3], [0.015, top]], 14), wood());
    g.add(shaft);
    const sock = mesh(lathe([[0.017, top - 0.02], [0.0185, top], [0.015, top + 0.08], [0.009, top + 0.13]], 14), iron());
    g.add(sock);
    const leaf = (t) => 0.026 * Math.sin(Math.min(1, t * 1.15) * Math.PI) * (1 - t * 0.2) + 0.002;
    straightBlade(g, 0.3 + r() * 0.06, leaf, (t) => 0.0055 * (1 - t * 0.6), tier, { y0: top + 0.12, bevel: 0.35, stations: 26 });
    const spike = mesh(new THREE.ConeGeometry(0.015, 0.11, 12), iron());
    spike.rotation.x = Math.PI;
    spike.position.y = bot - 0.055;
    g.add(spike);
    grip(g, 0.0, 0.16, 0.0175, cord());
    return { y: 0.0, r: 0.0175 };
  },

  /** War hammer: faceted striking face, curved back beak, langets down the haft. */
  warhammer(g, r, tier) {
    const haft = mesh(lathe([[0.018, -0.62], [0.0185, -0.3], [0.017, 0.1], [0.02, 0.17]], 16), wood());
    g.add(haft);
    grip(g, -0.5, 0.15, 0.019, cord());
    const m = iron();
    const face = mesh(lathe([[0.001, 0.07], [0.026, 0.07], [0.032, 0.06], [0.03, 0.0], [0.024, -0.01]], 8), m, { part: 'head' });
    face.rotation.z = -Math.PI / 2;
    face.position.set(0.0, 0.2, 0);
    g.add(face);
    const beakCurve = new THREE.CatmullRomCurve3([V(-0.01, 0.2, 0), V(-0.07, 0.205, 0), V(-0.13, 0.18, 0), V(-0.16, 0.14, 0)]);
    const beak = mesh(sweep((t) => beakCurve.getPoint(t), (t) => dblSection(0.018 * (1 - t * 0.9), 0.012 * (1 - t * 0.85), 0.3).map(([a, b]) => [b, a]), 16), m, { part: 'point' });
    g.add(beak);
    const collar = mesh(lathe([[0.024, 0.16], [0.028, 0.18], [0.028, 0.23], [0.022, 0.25]], 12), m);
    g.add(collar);
    for (const s of [-1, 1]) {
      const lang = mesh(new THREE.BoxGeometry(0.012, 0.2, 0.003), m);
      lang.position.set(0, 0.07, s * 0.0195);
      g.add(lang);
    }
    return { y: -0.28, r: 0.019 };   // off hand at the butt (Choreo PROFILE)
  },

  /** The scythe — the Reaper: an S-curved snath with two nibs, a long single-edged blade sweeping to a needle. */
  scythe(g, r, tier) {
    const snathCurve = new THREE.CatmullRomCurve3([V(0, -0.85, 0), V(0.03, -0.3, 0), V(-0.02, 0.25, 0), V(0.0, 0.72, 0)]);
    const snath = mesh(sweep((t) => snathCurve.getPoint(t), (t) => {
      const rr = 0.017 - t * 0.003, n = 10, out = [];
      for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; out.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
      return out;
    }, 32, { tip: false }), wood());
    g.add(snath);
    // Two nibs (the side handles) — the hand takes the upper one.
    const nib = (y, len) => {
      const n = mesh(lathe([[0.013, 0], [0.014, len * 0.5], [0.012, len]], 12), darkWood());
      n.rotation.z = -Math.PI / 2;
      n.position.set(0.0, y, 0);
      g.add(n);
      const ring = mesh(new THREE.TorusGeometry(0.019, 0.004, 6, 16), iron());
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, y, 0);
      g.add(ring);
    };
    nib(-0.05, 0.13);
    nib(-0.5, 0.12);
    // Blade: from the heel at the snath's top it runs out along +x and
    // sweeps forward (−z) to a needle point, lying FLAT (thickness along
    // y), edge on the inner, concave side — the way a scythe blade sits.
    const reach = 0.8 + r() * 0.1, hook = 0.26 + r() * 0.08, Y = 0.72;
    const bladeCurve = new THREE.CatmullRomCurve3([V(0.0, Y, 0), V(reach * 0.4, Y + 0.01, -hook * 0.08), V(reach * 0.78, Y, -hook * 0.4), V(reach, Y - 0.02, -hook)]);
    const bw = (t) => 0.05 * (1 - Math.pow(t, 1.3) * 0.88) * (t > 0.9 ? (1 - t) / 0.1 : 1) + 0.001;
    g.add(mesh(sweep((t) => bladeCurve.getPoint(t), (t) => sglSection(bw(t), 0.0042 * (1 - t * 0.5), 0.35), 44,
      { ref: V(0, 1, 0) }), steel(tier), { part: 'edge' }));
    const tipM = mesh(new THREE.ConeGeometry(0.005, 0.06, 6), edgeSteel(tier), { part: 'point' });
    tipM.position.copy(bladeCurve.getPoint(0.97));
    tipM.quaternion.setFromUnitVectors(V(0, 1, 0), bladeCurve.getTangent(0.97));
    g.add(tipM);
    // The tang strap binding the blade's heel to the snath.
    const collar = mesh(lathe([[0.02, 0.69], [0.026, 0.7], [0.026, 0.75], [0.02, 0.76]], 12), iron());
    g.add(collar);
    return { y: -0.05, r: 0.0175 };
  },

  /** Recurve bow: tapering limbs swept along a real curve, horn tips, a string that meets the nocks. */
  bow(g, r, tier) {
    const half = 0.62 + r() * 0.06, recurve = 0.05 + r() * 0.03, set = 0.085;
    const limbPts = (s) => [V(0, s * 0.06, 0), V(-set * 0.55, s * half * 0.45, 0), V(-set, s * half * 0.85, 0), V(-set + recurve, s * half, 0)];
    const nocks = [];
    for (const s of [-1, 1]) {
      const c = new THREE.CatmullRomCurve3(limbPts(s));
      const limb = mesh(sweep((t) => c.getPoint(t), (t) => {
        const w = 0.017 * (1 - t * 0.55), th = 0.0075 * (1 - t * 0.4);
        return [[w, 0], [w * 0.7, th], [-w * 0.7, th], [-w, 0], [-w * 0.7, -th], [w * 0.7, -th]].map(([a, b]) => [b, a]);
      }, 28, { tip: false }), tier >= 3 ? horn() : darkWood());
      g.add(limb);
      const tip = mesh(new THREE.SphereGeometry(0.008, 10, 8), horn());
      tip.position.copy(c.getPoint(1));
      g.add(tip);
      nocks.push(c.getPoint(1));
    }
    const riser = mesh(lathe([[0.016, -0.075], [0.019, -0.04], [0.02, 0.04], [0.016, 0.075]], 14), darkWood());
    riser.scale.set(1, 1, 0.75);
    g.add(riser);
    grip(g, 0, 0.1, 0.0185);
    // The string runs EXACTLY between the two nock points (the old one did not meet its limbs).
    const a = nocks[0], b = nocks[1];
    const str = mesh(new THREE.CylinderGeometry(0.0013, 0.0013, a.distanceTo(b), 6), cord());
    str.position.copy(a).add(b).multiplyScalar(0.5);
    str.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
    str.name = 'bow-string';
    g.add(str);
    return { y: 0, r: 0.0185 };
  },

  /** Warden's staff: a gnarled, slightly bent ash staff with a root crown holding a raw stone. */
  staff(g, r, tier) {
    const bend = new THREE.CatmullRomCurve3([V(0, -0.95, 0), V(0.012, -0.3, 0.008), V(-0.01, 0.3, -0.006), V(0.006, 0.72, 0)]);
    const gn = rng('gnarl' + r());
    const knots = Array.from({ length: 7 }, () => [gn(), 0.002 + gn() * 0.004]);
    const staff = mesh(sweep((t) => bend.getPoint(t), (t) => {
      let rr = 0.0185 - t * 0.004;
      for (const [kt, a] of knots) rr += a * Math.exp(-((t - kt) ** 2) / 0.0008);
      const n = 12, out = [];
      for (let k = 0; k < n; k++) { const ang = (k / n) * Math.PI * 2; const wob = 1 + Math.sin(ang * 3 + t * 9) * 0.06; out.push([Math.cos(ang) * rr * wob, Math.sin(ang) * rr * wob]); }
      return out;
    }, 48, { tip: false }), darkWood());
    g.add(staff);
    const fer = mesh(lathe([[0.018, -0.95], [0.019, -0.97], [0.012, -1.0]], 12), iron());
    g.add(fer);
    // Root crown: three tines curling up round the stone.
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.4;
      const cv = new THREE.CatmullRomCurve3([V(Math.cos(a) * 0.012, 0.7, Math.sin(a) * 0.012), V(Math.cos(a) * 0.04, 0.78, Math.sin(a) * 0.04), V(Math.cos(a) * 0.034, 0.87, Math.sin(a) * 0.034), V(Math.cos(a) * 0.012, 0.91, Math.sin(a) * 0.012)]);
      g.add(mesh(new THREE.TubeGeometry(cv, 16, 0.006, 6, false), darkWood()));
    }
    const s = setStone(g, g.userData.element, tier, V(0, 0.8, 0), 0.03) ;
    if (!s) {
      const plain = mesh(new THREE.IcosahedronGeometry(0.03, 1), stone(ELEMENTS.NEUTRAL, 0), { part: 'focus' });
      plain.position.set(0, 0.8, 0); g.add(plain);
    }
    grip(g, 0.0, 0.14, 0.019, cord());
    return { y: 0, r: 0.019 };
  },

  /** A bound book, closed in the hand: leather boards, corner fittings, a clasp, page edges. */
  grimoire(g, r, tier) {
    const W = 0.17, H = 0.24, T = 0.055;
    const board = leatherMaterial();   // leather over wooden boards
    const pages = mat('pageedge', () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: pageEdgeMap(), roughness: 0.92 }));
    const box = (w, h, d, m, x, y, z) => { const b = mesh(new THREE.BoxGeometry(w, h, d, 2, 2, 1), m); b.position.set(x, y, z); g.add(b); return b; };
    box(W, H, 0.008, board, 0, 0.1, T / 2);
    box(W, H, 0.008, board, 0, 0.1, -T / 2);
    box(W - 0.012, H - 0.012, T - 0.012, pages, 0.004, 0.1, 0);
    const spine = mesh(new THREE.CylinderGeometry(T / 2 + 0.004, T / 2 + 0.004, H, 16, 1, false, Math.PI / 2, Math.PI), board);
    spine.position.set(-W / 2, 0.1, 0);
    g.add(spine);
    // Raised bands across the spine, where the cords run under the leather.
    for (const by of [-0.07, -0.025, 0.025, 0.07]) {
      const band = mesh(new THREE.CylinderGeometry(T / 2 + 0.008, T / 2 + 0.008, 0.008, 16, 1, false, Math.PI / 2, Math.PI), board);
      band.position.set(-W / 2, 0.1 + by, 0);
      g.add(band);
    }
    // A bezel on the front board for the stone.
    const bezel = mesh(new THREE.TorusGeometry(0.016, 0.004, 8, 24), fitting(tier));
    bezel.position.set(0.0, 0.1, T / 2 + 0.006);
    g.add(bezel);
    for (const sx of [1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const c = mesh(new THREE.BoxGeometry(0.03, 0.03, 0.01), fitting(tier));
      c.position.set(sx * (W / 2 - 0.012), 0.1 + sy * (H / 2 - 0.012), sz * (T / 2 + 0.002));
      g.add(c);
    }
    const clasp = mesh(new THREE.BoxGeometry(0.04, 0.03, T + 0.012), fitting(tier));
    clasp.position.set(W / 2 + 0.008, 0.1, 0);
    g.add(clasp);
    setStone(g, g.userData.element, tier, V(0.0, 0.1, T / 2 + 0.008), 0.011);
    // Held by the spine.
    return { y: 0.1, r: 0.03, x: -W / 2 };
  },
};

/** Names the Facet and swing systems already key on. */
export const ARM_TYPES = Object.keys(ARMS);

/**
 * Build a weapon. Same contract as the old forgeWeapon body:
 * grip along +y at userData.grip, business end up.
 */
// ── Metals ────────────────────────────────────────────────
// "Model revision of everything": every forged metal used to come out
// as the same grey steel, so a mithril blade looked like a bronze one.
// The forge's metal now repaints the blade and its edge (the fittings —
// guard, pommel, wood, cord — stay as built). Steel is the default and
// unchanged. Values are finishes, not just tints: obsidian is glass,
// mithril and moonsteel hold a faint cold light, orichalcum a warm one.
const METAL_LOOK = {
  bronze:     { body: 0xb07c46, edge: 0xdcae70, rough: 0.46 },
  iron:       { body: 0x6e6e72, edge: 0xa8a8ac, rough: 0.62 },
  silver:     { body: 0xd2d6de, edge: 0xf2f4f8, rough: 0.26 },
  mithril:    { body: 0xaec8ea, edge: 0xe2eeff, rough: 0.2, glow: 0x0a1626 },
  obsidian:   { body: 0x15111b, edge: 0x4a3c5a, rough: 0.06, metalness: 0.25 },
  moonsteel:  { body: 0xcad8f2, edge: 0xf0f6ff, rough: 0.18, glow: 0x101a2e },
  starmetal:  { body: 0x46568a, edge: 0x9aaee0, rough: 0.3, glow: 0x0a0e22 },
  orichalcum: { body: 0xd2913e, edge: 0xffd08a, rough: 0.3, glow: 0x1c0e02 },
};
export const ARM_METALS = Object.keys(METAL_LOOK);
function metalMat(src, metal) {
  const L = METAL_LOOK[metal], part = src.userData.metalPart;
  return mat(`${metal}:${src.uuid}`, () => {
    const m = src.clone();
    // Axe and hammer heads are forged iron (darker, hammer-scaled); the
    // metal tints them a shade under the blade colour.
    m.color.setHex(part === 'edge' ? L.edge : L.body);
    if (part === 'head') m.color.multiplyScalar(0.85);
    m.roughness = part === 'edge' ? Math.max(0.04, L.rough - 0.12) : L.rough;
    if (L.metalness != null) m.metalness = L.metalness;
    // ⚠️ Glow only on the blade and edge, and faint: on a forged (less
    // reflective) axe head the same emissive drowns the lighting and the
    // head reads as flat plastic.
    if (L.glow && part !== 'head') m.emissive = new THREE.Color(L.glow).multiplyScalar(0.6);
    // A fine metal does not carry the grey steel's grime and scale.
    if (part !== 'edge' && L.rough < 0.35) { m.roughnessMap = null; if (part === 'blade') m.map = null; }
    return m;
  });
}

export function buildArm(key, element, tier, seed, metal = null) {
  const g = new THREE.Group();
  g.userData.element = element;
  const r = rng(`${key}:${seed || ''}:${tier}`);
  const build = ARMS[key] || ARMS.sword;
  const grip = build(g, r, tier);
  // The element stone, for blades and heads (staff and book set their own).
  if (!['staff', 'grimoire'].includes(key)) {
    const at = key === 'dualblades' ? V(0.11, 0.004, 0.011) : key === 'scythe' ? V(0, 0.72, 0.03) : key === 'bow' ? V(0.02, 0, 0) : key === 'spear' ? V(0, 0.98, 0.02)
      : key === 'axe' || key === 'warhammer' || key === 'pickaxe' ? V(0, 0.2, 0.02) : V(0, 0.004, 0.011);
    setStone(g, element, tier, at, key === 'dagger' ? 0.007 : 0.009);
  }
  g.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    if (metal && METAL_LOOK[metal] && o.material?.userData?.metalPart) o.material = metalMat(o.material, metal);
  });
  g.userData.metal = metal;
  g.userData.grip = grip;
  g.userData.isArm = true;
  return g;
}
