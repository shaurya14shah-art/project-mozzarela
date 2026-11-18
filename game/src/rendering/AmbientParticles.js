// ══════════════════════════════════════════════════════════
// AmbientParticles — what the air is carrying
//
// Owner: "ambient particles… carried by the same wind". A box of points
// that travels with the camera and wraps (a mote leaving one side
// re-enters the other, so the density never thins). The KIND follows the
// biome underfoot and cross-fades over ~2 s when it changes:
//
//   pollen  plains, forest, jungle, steppe        warm, slow, drifting
//   dust    deserts, dunes, petrified wood       streaks with the wind
//   ash     volcanic, godgrave, still city, maw   grey flakes, falling
//   ember   volcanic, crimson, obsidian           rising, glowing
//   spore   swamp, fungal, grotto                 hanging, glowing faintly
//   mote    crystal, astral, celestial, verge     pale lights
//   snow    tundra, glacier (when no snow storm)  falling, drifting
//
// All velocity is the wind's (world/Wind.js) plus the kind's own drift,
// so a gust you see bending the grass also sweeps the pollen past you.
// ⚠️ Off on `low`; counts per tier. Additive, no depth write.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { wind, windUniforms } from '../world/Wind.js';
import { quality } from './Quality.js';

const COUNT = { low: 0, medium: 500, high: 1100, ultra: 1700 };
const BOX = 36, HALF = BOX / 2, HEIGHT = 16;

// kind: colour, size (px at 10 m), drift (m/s), wind share, glow, alpha
const KIND = {
  pollen: { col: 0xf2e0a0, size: 3.0, drift: [0, -0.05, 0], wind: 0.55, alpha: 0.55 },
  dust:   { col: 0xc8b090, size: 2.6, drift: [0, -0.02, 0], wind: 1.2, alpha: 0.38 },
  ash:    { col: 0xa8a29a, size: 3.4, drift: [0, -0.35, 0], wind: 0.6, alpha: 0.6 },
  ember:  { col: 0xff8a3a, size: 2.8, drift: [0, 0.55, 0], wind: 0.5, alpha: 0.95, glow: true },
  spore:  { col: 0x9be0a8, size: 2.6, drift: [0, 0.04, 0], wind: 0.25, alpha: 0.7, glow: true },
  mote:   { col: 0xb8c8ff, size: 2.4, drift: [0, 0.08, 0], wind: 0.2, alpha: 0.8, glow: true },
  snow:   { col: 0xf4f6fa, size: 3.6, drift: [0, -0.9, 0], wind: 0.7, alpha: 0.85 },
};
const BIOME_KIND = {
  iron_hills: 'dust', sunken_mire: 'spore', highland_karst: 'pollen', ashen_caldera: 'ember',
  plains: 'pollen', enchanted_forest: 'pollen', living_jungle: 'pollen', amber_steppe: 'pollen', floating_islands: 'pollen',
  desert_ruins: 'dust', ember_dunes: 'dust', petrified_wood: 'dust', stormwrack_coast: 'dust',
  volcanic_wastes: 'ember', crimson_rift: 'ember', obsidian_wastes: 'ember',
  godgrave: 'ash', dreaming_city: 'ash', bottomless_pit: 'ash', shadow_realm: 'ash', hollow_mountains: 'ash', forgotten_shore: 'ash', drowned_flats: 'spore',
  twilight_swamp: 'spore', fungal_wastes: 'spore', bioluminescent_grotto: 'spore',
  crystal_caverns: 'mote', astral_highlands: 'mote', celestial_peaks: 'mote', the_verge: 'mote',
  frozen_tundra: 'snow', glacier_shelf: 'snow',
};

export class AmbientParticles {
  constructor() {
    this.n = COUNT[quality.tier] ?? 600;
    this.enabled = this.n > 0;
    this.group = new THREE.Group();
    if (!this.enabled) return;
    const pos = new Float32Array(this.n * 3), seed = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * BOX; pos[i * 3 + 1] = Math.random() * HEIGHT - 3; pos[i * 3 + 2] = (Math.random() - 0.5) * BOX;
      seed[i] = Math.random();
    }
    this.pos = pos;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.uniforms = {
      uCol: { value: new THREE.Color(0xffffff) }, uSize: { value: 3 }, uAlpha: { value: 0 }, uGlow: { value: 0 },
      uTime: windUniforms.uTime, uPix: { value: Math.min(2, window.devicePixelRatio || 1) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: /* glsl */`
        attribute float seed; uniform float uSize; uniform float uTime; uniform float uPix; varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = -mv.z;
          gl_PointSize = uSize * uPix * (10.0 / max(1.0, d)) * (0.6 + seed * 0.8);
          // Fade at the box's edges and very near the lens.
          vA = smoothstep(0.6, 2.5, d) * (1.0 - smoothstep(${(HALF * 0.75).toFixed(1)}, ${HALF.toFixed(1)}, d)) * (0.55 + 0.45 * sin(uTime * (1.5 + seed * 2.0) + seed * 40.0));
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uCol; uniform float uAlpha; uniform float uGlow; varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5; float r = length(c);
          float a = smoothstep(0.5, 0.1 + uGlow * 0.15, r);
          gl_FragColor = vec4(uCol * (1.0 + uGlow * 1.5), a * uAlpha * vA);
        }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.group.add(this.points);
    this.kind = null; this._fade = 0;
    this._wv = new THREE.Vector3();
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} camPos
   * @param {object} biome the biome underfoot
   * @param {boolean} precip weather already falling (rain/snow/ash) — dims ours
   */
  update(dt, camPos, biome, precip = false) {
    if (!this.enabled) return;
    const want = BIOME_KIND[biome?.key] || null;
    // Cross-fade: out, swap, in.
    if (want !== this.kind) { this._fade = Math.max(0, this._fade - dt * 0.8); if (this._fade === 0) this._setKind(want); }
    else this._fade = Math.min(1, this._fade + dt * 0.6);
    const k = KIND[this.kind];
    this.uniforms.uAlpha.value = k ? k.alpha * this._fade * (precip ? 0.4 : 1) : 0;
    if (!k) return;
    this.group.position.set(camPos.x, camPos.y, camPos.z);
    const w = wind.velocity(this._wv).multiplyScalar(k.wind);
    const p = this.pos, t = windUniforms.uTime.value;
    for (let i = 0; i < this.n; i++) {
      const s = (i * 0.618) % 1;
      // Each mote wanders a little on its own, so they never move as a sheet.
      p[i * 3]     += (w.x + k.drift[0] + Math.sin(t * 0.7 + i) * 0.15) * dt;
      p[i * 3 + 1] += (k.drift[1] * (0.7 + s * 0.6) + Math.sin(t * 1.1 + i * 1.7) * 0.06) * dt;
      p[i * 3 + 2] += (w.z + k.drift[2] + Math.cos(t * 0.6 + i * 0.5) * 0.15) * dt;
    }
    // Wrap in the camera-relative box. The box follows the camera, so a
    // mote's local position must be shifted by how far the camera moved.
    const dx = camPos.x - (this._lx ?? camPos.x), dy = camPos.y - (this._ly ?? camPos.y), dz = camPos.z - (this._lz ?? camPos.z);
    this._lx = camPos.x; this._ly = camPos.y; this._lz = camPos.z;
    for (let i = 0; i < this.n; i++) {
      let x = p[i * 3] - dx, y = p[i * 3 + 1] - dy, z = p[i * 3 + 2] - dz;
      if (x > HALF) x -= BOX; else if (x < -HALF) x += BOX;
      if (z > HALF) z -= BOX; else if (z < -HALF) z += BOX;
      if (y > HEIGHT - 3) y -= HEIGHT; else if (y < -3) y += HEIGHT;
      p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  _setKind(kind) {
    this.kind = kind;
    const k = KIND[kind];
    if (!k) return;
    this.uniforms.uCol.value.setHex(k.col);
    this.uniforms.uSize.value = k.size;
    this.uniforms.uGlow.value = k.glow ? 1 : 0;
  }
}
