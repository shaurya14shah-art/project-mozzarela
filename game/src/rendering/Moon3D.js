// ══════════════════════════════════════════════════════════
// Moon3D — the broken moon as a BODY, not a painting
//
// Owner: "the moon is still a piece of 2d shit, make it better, make it
// like real life and 3D." Every previous moon was drawn inside the sky
// dome's fragment shader — a disc with shading on it — and a disc can
// only ever read as flat. This is geometry:
//
//   · A SPHERE (icosphere, ~28k vertices) whose surface is SCULPTED:
//     hundreds of craters (power-law sizes; bowl, raised rim, ejecta),
//     rough highlands (3D noise), smooth low maria, bright ray systems
//     around a few young craters. Albedo per vertex.
//   · SHATTERED IN 3D. A jagged cut surface splits it. The main body's
//     far cap is flattened ONTO that surface — projecting a spherical
//     cap along its axis covers the cross-section exactly once, so it
//     becomes a solid fracture face, roughened like broken rock. The
//     broken piece is the cap itself plus the same face reversed; it has
//     drifted off and turned. Real rock debris tumbles in the gap.
//   · LIT LIKE THE MOON. Lommel-Seeliger (the regolith's back-scatter,
//     why a full moon looks flat-bright edge to edge) blended with
//     Lambert, so crater relief stands out along the terminator; faint
//     earthshine on the night side; the fracture's cracks glow in the
//     sky-rift's colour (the same wound as the crack across the sky).
//
// It sits at a fixed direction (atmosphere's uMoonDir) at a fixed
// distance from the CAMERA every frame, so it never parallaxes, and the
// terrain occludes it. The old painted moon in the sky shader is turned
// off (uMoonSize = 0).
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createNoise3D } from 'simplex-noise';

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const DIST = 900;              // world units from the camera (inside the far plane)
const ANG_RADIUS = 0.085;      // radians — matches the old sky moon's size
const DETAIL = 52;   // linear subdivisions per edge (three r183): 20·53² ≈ 56k triangles

export class Moon3D {
  constructor(seed = 7) {
    const R = rng(seed);
    const n3 = createNoise3D(R), n3b = createNoise3D(R);
    // ── Craters: power-law sizes, scattered over the sphere ──
    const craters = [];
    for (let i = 0; i < 340; i++) {
      const u = R() * 2 - 1, th = R() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const c = new THREE.Vector3(s * Math.cos(th), u, s * Math.sin(th));
      const r = 0.018 + Math.pow(R(), 3.2) * 0.22;           // angular radius (rad)
      craters.push({ c, r, depth: r * (0.45 + R() * 0.3), young: r > 0.06 && R() < 0.12, seed: R() * 100 });
    }
    const maria = (v) => {
      const m = n3(v.x * 1.1 + 3, v.y * 1.1, v.z * 1.1) * 0.65 + n3(v.x * 2.4, v.y * 2.4 + 7, v.z * 2.4) * 0.35;
      return Math.min(1, Math.max(0, (m - 0.12) / 0.3));
    };

    // ── The sculpted sphere ──
    let geo = new THREE.IcosahedronGeometry(1, DETAIL);
    geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
    geo = mergeVertices(geo);
    const pos = geo.attributes.position, N = pos.count;
    const height = new Float32Array(N), albedo = new Float32Array(N);
    const v = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const mar = maria(v);
      let h = (n3b(v.x * 3, v.y * 3, v.z * 3) * 0.6 + n3b(v.x * 7, v.y * 7, v.z * 7) * 0.3 + n3b(v.x * 16, v.y * 16, v.z * 16) * 0.1) * 0.012 * (1 - mar * 0.7);
      h -= mar * 0.006;
      let a = 0.66 - mar * 0.36 + n3(v.x * 9, v.y * 9, v.z * 9) * 0.05;
      for (const k of craters) {
        const d = Math.acos(Math.min(1, Math.max(-1, v.dot(k.c))));
        const x = d / k.r;
        if (x > 3.5) continue;
        if (mar > 0.6 && k.r < 0.05 && (k.seed % 1) < 0.6) continue;   // maria are younger, smoother
        if (x < 1) h -= k.depth * 0.09 * (1 - x * x);                      // bowl
        h += k.depth * 0.05 * Math.exp(-(((x - 1) / 0.16) ** 2));           // rim
        if (x > 1 && x < 2.5) h += k.depth * 0.012 * (2.5 - x) / 1.5;      // ejecta blanket
        if (x < 0.9) a -= 0.06;                                            // dark floor
        if (x > 0.9 && x < 1.15) a += 0.08;                                // bright rim
        if (k.young && x > 1 && x < 7) {                                   // ray system
          const az = Math.atan2(v.clone().cross(k.c).y, v.x - k.c.x);
          const ray = Math.pow(Math.max(0, Math.sin(az * 9 + k.seed) * Math.sin(az * 4 - k.seed)), 6);
          a += ray * 0.16 * (1 - (x - 1) / 6);
        }
      }
      height[i] = h; albedo[i] = Math.min(0.95, Math.max(0.18, a));
    }

    // ── The break: a jagged cut surface ──
    const cutN = new THREE.Vector3(0.74, 0.55, 0.2).normalize();
    this.cutN = cutN;
    const cutAt = (w) => 0.3 + n3(w.x * 2.2, w.y * 2.2, w.z * 2.2) * 0.08 + n3(w.x * 7, w.y * 7, w.z * 7) * 0.025;
    const surf = new Float32Array(N * 3), flat = new Float32Array(N * 3), fracRough = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const r = 1 + height[i];
      surf.set([v.x * r, v.y * r, v.z * r], i * 3);
      // Projected onto the cut surface, roughened like broken rock.
      const d = v.dot(cutN), c = cutAt(v);
      const rough = n3b(v.x * 11, v.y * 11, v.z * 11) * 0.018 + n3b(v.x * 27, v.y * 27, v.z * 27) * 0.007;
      const p = v.clone().addScaledVector(cutN, c + rough - d);
      flat.set([p.x, p.y, p.z], i * 3);
      fracRough[i] = rough;
    }
    const idx = geo.index.array;
    const above = (i) => { v.fromBufferAttribute(pos, i).normalize(); return v.dot(cutN) > cutAt(v); };
    const isAbove = new Uint8Array(N);
    for (let i = 0; i < N; i++) isAbove[i] = above(i) ? 1 : 0;

    const build = (useFlat, triFilter, reverse) => {
      const P = [], A = [], F = [];
      for (let t = 0; t < idx.length; t += 3) {
        const tri = [idx[t], idx[t + 1], idx[t + 2]];
        if (!triFilter(tri)) continue;
        const order = reverse ? [tri[0], tri[2], tri[1]] : tri;
        for (const i of order) {
          const f = useFlat(i);
          const src = f ? flat : surf;
          P.push(src[i * 3], src[i * 3 + 1], src[i * 3 + 2]);
          A.push(f ? 0.22 + fracRough[i] * 3 : albedo[i]);
          F.push(f ? 1 : 0);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('albedo', new THREE.Float32BufferAttribute(A, 1));
      g.setAttribute('frac', new THREE.Float32BufferAttribute(F, 1));
      const m = mergeVertices(g, 1e-5);
      m.computeVertexNormals();
      return m;
    };
    // Main body: everything, its cap flattened into the fracture face.
    const bodyGeo = build((i) => isAbove[i], () => true, false);
    // Piece: the cap's surface (cut-side vertices flattened) + the face, reversed.
    const capTri = (tri) => isAbove[tri[0]] || isAbove[tri[1]] || isAbove[tri[2]];
    const pieceA = build((i) => !isAbove[i], capTri, false);
    const pieceB = build(() => true, capTri, true);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uSun: { value: new THREE.Vector3(0, 1, 0) },
        uNight: { value: 0 },
        uRift: { value: new THREE.Color(0x9a6cff) },
        uTime: { value: 0 },
        uHaze: { value: 0 },
        uSkyTint: { value: new THREE.Color(0x8fa2bf) },
      },
      transparent: false, depthWrite: true, fog: false,   // ⚠️ opaque: see-through pieces ghosted over each other
      vertexShader: /* glsl */`
        attribute float albedo; attribute float frac;
        varying float vA; varying float vF; varying vec3 vN; varying vec3 vW; varying vec3 vL;
        void main() {
          vA = albedo; vF = frac; vL = position;
          vN = normalize(mat3(modelMatrix) * normal);
          vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uSun; uniform float uNight; uniform vec3 uRift; uniform float uTime; uniform float uHaze; uniform vec3 uSkyTint;
        varying float vA; varying float vF; varying vec3 vN; varying vec3 vW; varying vec3 vL;
        float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        void main() {
          vec3 n = normalize(vN), L = normalize(uSun), V = normalize(cameraPosition - vW);
          float mu0 = max(dot(n, L), 0.0), mu = max(dot(n, V), 0.001);
          // Lommel-Seeliger (regolith back-scatter) + Lambert for relief.
          float ls = mu0 / (mu0 + mu);
          float light = mix(mu0, ls * 2.0, 0.55);
          vec3 rock = mix(vec3(0.62, 0.61, 0.59), vec3(0.52, 0.47, 0.42), vF);   // interior rock is browner
          vec3 col = rock * vA * (light * mix(1.05, 1.5, uNight) + 0.035 + 0.03 * uNight);
          // The fracture's cracks glow faintly — the sky's wound, in the moon.
          if (vF > 0.5) {
            // Veins, not specks: thin bright lines where a warped field crosses zero.
            vec3 q = vL * 9.0 + vec3(sin(vL.y * 13.0), sin(vL.z * 11.0), sin(vL.x * 12.0)) * 0.35;
            float f = sin(q.x * 1.7 + sin(q.y * 2.3)) + sin(q.z * 1.9 + sin(q.x * 1.3));
            float vein = (1.0 - smoothstep(0.0, 0.06, abs(f))) * (0.55 + 0.45 * sin(uTime * 0.6 + q.y));
            col += uRift * vein * (0.5 + uNight * 0.7) + uRift * 0.035;
          }
          // By day the sky's scattered light lies in front of the moon.
          col = mix(col, uSkyTint * 0.9, uHaze) + uSkyTint * uHaze * 0.12;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });

    this.group = new THREE.Group();
    this.group.name = 'moon3d';
    this.group.renderOrder = -999;
    const add = (g) => { const m = new THREE.Mesh(g, this.material); m.frustumCulled = false; m.renderOrder = -999; return m; };
    this.body = add(bodyGeo);
    this.piece = new THREE.Group();
    this.piece.add(add(pieceA), add(pieceB));
    // The piece has drifted straight off the break, and turned.
    const tang = new THREE.Vector3(0, 0, 1).cross(cutN).normalize();
    this.piece.position.copy(cutN).multiplyScalar(0.62).addScaledVector(tang, 0.14);
    this.piece.rotation.set(0.12, -0.28, 0.2);
    this.group.add(this.body, this.piece);

    // Debris: rocks strung through the gap, tumbling slowly.
    this.debris = [];
    const dgeoBase = mergeVertices((() => { const g = new THREE.IcosahedronGeometry(1, 1); g.deleteAttribute('normal'); g.deleteAttribute('uv'); return g; })());
    for (let i = 0; i < 24; i++) {
      const g = dgeoBase.clone();
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) { v.fromBufferAttribute(p, k); v.multiplyScalar(0.7 + R() * 0.55); p.setXYZ(k, v.x, v.y, v.z); }
      const a = new Float32Array(p.count).fill(0.35 + R() * 0.25), f = new Float32Array(p.count).fill(R() < 0.3 ? 1 : 0);
      g.setAttribute('albedo', new THREE.BufferAttribute(a, 1));
      g.setAttribute('frac', new THREE.BufferAttribute(f, 1));
      g.computeVertexNormals();
      const m = add(g);
      const s = 0.012 + Math.pow(R(), 2.2) * 0.07;
      m.scale.setScalar(s);
      const along = 0.25 + R() * 0.6, spread = (R() - 0.5) * 1.6, lift = (R() - 0.5) * 1.2;
      const bit = new THREE.Vector3().crossVectors(cutN, tang);
      m.position.copy(cutN).multiplyScalar(along).addScaledVector(tang, spread).addScaledVector(bit, lift);
      m.userData.spin = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(0.25);
      m.userData.drift = cutN.clone().multiplyScalar(0.0006 + R() * 0.0008);
      m.userData.home = m.position.clone();
      this.debris.push(m);
      this.group.add(m);
    }
    this._dir = new THREE.Vector3(-0.484, 0.669, -0.563).normalize();
    this._q = new THREE.Quaternion();
    this._t = 0;
  }

  /** @param {THREE.Vector3} moonDir fixed world direction to the moon */
  setDirection(moonDir) {
    this._dir.copy(moonDir).normalize();
    // ⚠️ AIM THE BREAK ACROSS THE VIEW. The piece drifts along cutN; if
    // cutN points away from the viewer the piece hides behind the body
    // (it did). Turn the moon so cutN points up-left on screen and a
    // little toward the eye: the gap opens across the view, the piece
    // shows its outer surface, the body shows part of its fracture face.
    const d = this._dir, up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(d, up).normalize();
    const sUp = new THREE.Vector3().crossVectors(right, d).normalize();
    const want = right.clone().multiplyScalar(-0.62).addScaledVector(sUp, 0.62).addScaledVector(d, -0.32).normalize();
    this._q.setFromUnitVectors(this.cutN, want);
    // A turn about the break's own axis, so the body's terminator falls obliquely.
    this._q.premultiply(new THREE.Quaternion().setFromAxisAngle(want, 0.6));
    this.group.quaternion.copy(this._q);
  }

  /**
   * @param {number} dt
   * @param {THREE.Camera} camera
   * @param {THREE.Vector3} sunDir direction TO the sun
   */
  update(dt, camera, sunDir, skyTint = null) {
    this._t += dt;
    const R = DIST * Math.tan(ANG_RADIUS);
    this.group.scale.setScalar(R);
    this.group.position.copy(camera.position).addScaledVector(this._dir, DIST);
    const u = this.material.uniforms;
    if (sunDir) u.uSun.value.copy(sunDir);
    const night = THREE.MathUtils.smoothstep(-(sunDir?.y ?? 0.5), -0.08, 0.12);
    u.uNight.value = night;
    // By day the air is in front of it: washed toward the sky, never paper.
    u.uHaze.value = 0.14 * (1 - night);
    // The tint is the SKY's (cool), not the ground fog's (warm, pale) — the
    // fog washed the disc pink.
    if (skyTint) u.uSkyTint.value.copy(skyTint).lerp(this._blue || (this._blue = new THREE.Color(0x6f86aa)), 0.6);
    u.uTime.value = this._t;
    for (const d of this.debris) {
      d.rotation.x += d.userData.spin.x * dt; d.rotation.y += d.userData.spin.y * dt; d.rotation.z += d.userData.spin.z * dt;
      // A slow outward drift that loops (no debris escapes the frame forever).
      const k = (this._t * 0.02) % 1;
      d.position.copy(d.userData.home).addScaledVector(d.userData.drift, Math.sin(k * Math.PI * 2) * 60);
    }
  }
}
