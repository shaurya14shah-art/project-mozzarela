// ══════════════════════════════════════════════════════════
// PhysicalSky — the RŌNIN sky, and the same sky evaluated on the CPU
//
// The realism pass replaced Mozzarela's hand-painted gradient dome with
// the physically based Preetham sky that RŌNIN uses (three's
// `examples/jsm/objects/Sky.js`). A gradient dome is two colours and a
// glow; a scattering model has a sun that sits in a real halo, a
// horizon that brightens and warms as the sun drops, and a zenith that
// deepens on its own. That is most of the difference between the two
// games' screenshots.
//
// ⚠️ THE CPU PORT IS THE OTHER HALF, AND IT IS WHY THIS FILE EXISTS.
// A physical sky next to a fog colour picked by hand is the single most
// common way to make a realistic sky look fake: the terrain fades into
// one colour and the sky behind it is another, and the eye reads the
// seam as a backdrop. `skyRadiance()` is a line-for-line port of the
// shader's maths, so the fog, the hemisphere light and the sun's colour
// are READ OFF THE SKY rather than chosen beside it. The two cannot
// drift, because there is only one model.
//
// ⚠️ Radiance is LINEAR and scene-referred, exactly what the shader
// writes before OutputPass tone-maps it. Fog colour in three is applied
// in that same linear space, so the value is usable as-is.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { quality } from './Quality.js';

/**
 * Air presets. `hell` and `heaven` are the two paths' skies.
 *
 * ⚠️ Turbidity is the dial that turns a postcard sky into a dead one.
 * High turbidity is haze and ash in the air: the blue drains out, the
 * sun spreads into a pale wide glare, and the horizon goes the colour
 * of dust. Low rayleigh takes out more of the blue. Together they give
 * the realm a sky that is still physically lit, and still bleak.
 */
//
// ⚠️ `sat` is the one non-physical dial, and it exists because physics
// alone could not make the realm bleak. Preetham keeps a saturated blue
// zenith at any turbidity (it models clean air thickened, not ash), and
// that blue lit the whole world blue through the IBL and hemisphere — bone
// and ash both read as ice. The sky's own colour is pulled toward its
// luminance by this amount, IN THE SHADER AND IN skyRadiance() ALIKE, so
// the fog and lights still match the sky exactly.
export const AIR = {
  hell:   { turbidity: 15.0, rayleigh: 0.78, mie: 0.0070, mieG: 0.84, clouds: 0.46, cloudDensity: 0.55, sat: 0.42 },
  heaven: { turbidity: 4.2,  rayleigh: 1.35, mie: 0.0048, mieG: 0.82, clouds: 0.30, cloudDensity: 0.40, sat: 0.80 },
};

// The sky's glow ceiling — linear luminance. Below K the sky is untouched;
// above it, it rolls off toward K + R. Shared by the shader and the CPU
// port so the fog colour and the IBL agree with what the eye sees.
// Ceiling ≈ 2.5 — just over bloom's 2.2, so the glow blooms a little and
// no more (at 5.4 the hazy `hell` air still washed half the frame white).
const SKY_GLARE_K = 0.9, SKY_GLARE_R = 1.6, SUN_DISC_MAX = 22.0;
const SKY_GLARE_GLSL = `
#define SUN_DISC_MAX ${SUN_DISC_MAX.toFixed(1)}
vec3 glareCompress( vec3 c ) {
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  if ( l <= ${SKY_GLARE_K.toFixed(2)} ) return c;
  float e = l - ${SKY_GLARE_K.toFixed(2)};
  float lc = ${SKY_GLARE_K.toFixed(2)} + e / ( 1.0 + e / ${SKY_GLARE_R.toFixed(2)} );
  return c * ( lc / l );
}
`;
function glareCompressCPU(out) {
  const l = out.r * 0.2126 + out.g * 0.7152 + out.b * 0.0722;
  if (l <= SKY_GLARE_K) return out;
  const e = l - SKY_GLARE_K, lc = SKY_GLARE_K + e / (1 + e / SKY_GLARE_R);
  return out.multiplyScalar(lc / l);
}

/** The sky mesh. Re-centred on the camera every frame by Atmosphere. */
export function createPhysicalSky() {
  const sky = new Sky();
  // ⚠️ Inside the camera's far plane (1400). The box's corners sit at
  // scale·√3/2, so 1000 → 866. The shader pins depth to the far plane
  // itself (`gl_Position.z = gl_Position.w`), so the size only matters
  // for clipping, never for what draws in front of what.
  sky.scale.setScalar(1000);
  sky.frustumCulled = false;
  sky.renderOrder = -1001;
  sky.material.fog = false;
  // Inject the saturation dial after the scattering, before clouds.
  sky.material.uniforms.uSkySat = { value: 1.0 };
  sky.material.onBeforeCompile = (shader) => {
    shader.uniforms.uSkySat = sky.material.uniforms.uSkySat;
    shader.fragmentShader = shader.fragmentShader
      .replace('uniform float time;', 'uniform float time;\nuniform float uSkySat;\n' + SKY_GLARE_GLSL)
      // ⚠️ THE SUN WAS WHITING OUT THE FRAME. Owner screenshot: facing
      // the sun, terrain, weapons and HUD all washed to white. Measured
      // with the CPU port below: in the `hell` air the sky 11° from the
      // sun is ~63 linear (open sky ~0.5) and the disc itself ~760000.
      // Exposure + bloom spread that over the whole screen. The glow is
      // soft-compressed (shape kept, ceiling SKY_GLARE_K + SKY_GLARE_R)
      // and the disc capped on its own, so the sun still reads as the
      // brightest thing and still blooms — as a sun, not a whiteout.
      .replace('vec3 texColor = ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );',
        'vec3 texColor = glareCompress( Lin * 0.04 ) + min( L0 * 0.04, vec3( SUN_DISC_MAX ) ) + vec3( 0.0, 0.0003, 0.00075 );')
      .replace('// Clouds', 'texColor = mix(vec3(dot(texColor, vec3(0.2126, 0.7152, 0.0722))), texColor, uSkySat);\n\t\t\t// Clouds');
  };
  return sky;
}

/** Push an AIR preset into the sky's uniforms. */
export function applyAir(sky, air) {
  const u = sky.material.uniforms;
  u.turbidity.value = air.turbidity;
  u.rayleigh.value = air.rayleigh;
  u.mieCoefficient.value = air.mie;
  u.mieDirectionalG.value = air.mieG;
  if (u.uSkySat) u.uSkySat.value = air.sat ?? 1;
  if (u.cloudCoverage) {
    // ⚠️ Clouds only on the HD tiers. They are ten noise octaves per sky
    // pixel, drawn again into every face of every IBL bake; the low and
    // medium tiers exist to avoid exactly that kind of fill cost. Frame
    // cost was NOT measurable in this environment (HANDOFF trap #4 —
    // identical headless runs ranged 0.3 to 60 fps), so this is a
    // precaution, not a measurement. Ask the owner for F3 p95.
    u.cloudCoverage.value = quality.isHD ? air.clouds : 0;
    u.cloudDensity.value = air.cloudDensity;
    u.cloudScale.value = 0.00022;
    u.cloudSpeed.value = 0.00006;
    u.cloudElevation.value = 0.55;
  }
}

// ── CPU PREETHAM ──────────────────────────────────────────
// Constants copied from Sky.js's shader, with its own comments' names.
const E = Math.E;
const TOTAL_RAYLEIGH = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MIE_CONST = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
const CUTOFF = 1.6110731556870734;
const STEEPNESS = 1.5;
const EE = 1000.0;
const RAYLEIGH_ZENITH = 8.4e3;
const MIE_ZENITH = 1.25e3;
const THREE_OVER_16PI = 0.05968310365946075;
const ONE_OVER_4PI = 0.07957747154594767;

function sunIntensity(zenithCos) {
  const c = Math.max(-1, Math.min(1, zenithCos));
  return EE * Math.max(0, 1 - Math.pow(E, -((CUTOFF - Math.acos(c)) / STEEPNESS)));
}

/**
 * Linear sky radiance in direction `dir` (unit), sun at `sunDir`
 * (unit), for an AIR preset. Writes into `out` (THREE.Color).
 *
 * The solar disc and the clouds are left out on purpose: a fog colour
 * that included the disc would flash when the sun crossed the sample
 * direction, and clouds are decoration on top of the air, not the air.
 */
export function skyRadiance(dir, sunDir, air, out) {
  const sunE = sunIntensity(sunDir.y);
  // sunfade: the shader feeds a POSITION; a unit direction makes this
  // ≈ 1, which is also what the shader effectively sees at this scale.
  const sunfade = 1 - Math.max(0, Math.min(1, 1 - Math.exp(sunDir.y / 450000)));
  const rc = air.rayleigh - (1 - sunfade);
  const c = 0.2 * air.turbidity * 10e-18;
  const betaR = TOTAL_RAYLEIGH.map(v => v * rc);
  const betaM = MIE_CONST.map(v => 0.434 * c * v * air.mie);

  const zenith = Math.acos(Math.max(0, dir.y));
  const inv = 1 / (Math.cos(zenith) + 0.15 * Math.pow(93.885 - (zenith * 180) / Math.PI, -1.253));
  const sR = RAYLEIGH_ZENITH * inv;
  const sM = MIE_ZENITH * inv;

  const cosT = dir.x * sunDir.x + dir.y * sunDir.y + dir.z * sunDir.z;
  const rPhase = THREE_OVER_16PI * (1 + Math.pow(cosT * 0.5 + 0.5, 2));
  const g = air.mieG, g2 = g * g;
  const mPhase = ONE_OVER_4PI * ((1 - g2) / Math.pow(1 - 2 * g * cosT + g2, 1.5));
  const horizonMix = Math.max(0, Math.min(1, Math.pow(1 - sunDir.y, 5)));

  const rgb = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const fex = Math.exp(-(betaR[i] * sR + betaM[i] * sM));
    const ratio = (betaR[i] * rPhase + betaM[i] * mPhase) / (betaR[i] + betaM[i]);
    let lin = Math.pow(sunE * ratio * (1 - fex), 1.5);
    lin *= 1 + (Math.pow(sunE * ratio * fex, 0.5) - 1) * horizonMix;
    rgb[i] = (lin + 0.1 * fex) * 0.04;
  }
  out.setRGB(rgb[0], rgb[1], rgb[2]);
  glareCompressCPU(out);
  out.r += 0.0; out.g += 0.0003; out.b += 0.00075;
  const sat = air.sat ?? 1;
  if (sat !== 1) {
    const l = out.r * 0.2126 + out.g * 0.7152 + out.b * 0.0722;
    out.setRGB(l + (out.r - l) * sat, l + (out.g - l) * sat, l + (out.b - l) * sat);
  }
  return out;
}

/**
 * What survives of sunlight after crossing the air toward the ground,
 * normalised to a colour with max channel 1 — the KEY LIGHT's colour.
 * A low sun goes amber because the blue is scattered out on the long
 * path; that falls out of the same extinction term the sky uses.
 */
export function sunColor(sunDir, air, out) {
  const c = 0.2 * air.turbidity * 10e-18;
  const zenith = Math.acos(Math.max(0.02, sunDir.y));
  const inv = 1 / (Math.cos(zenith) + 0.15 * Math.pow(93.885 - (zenith * 180) / Math.PI, -1.253));
  const rgb = TOTAL_RAYLEIGH.map((r, i) =>
    Math.exp(-(r * air.rayleigh * RAYLEIGH_ZENITH * inv + 0.434 * c * MIE_CONST[i] * air.mie * MIE_ZENITH * inv)));
  const m = Math.max(rgb[0], rgb[1], rgb[2], 1e-6);
  return out.setRGB(rgb[0] / m, rgb[1] / m, rgb[2] / m);
}

const _d = new THREE.Vector3();
const _c = new THREE.Color();

/**
 * The colour of the horizon band as the eye sees it — what distance
 * fog should fade INTO. Averaged around the full circle a little above
 * the horizon, so it does not jump as the player turns toward or away
 * from the sun (fog in three is one colour, not view-dependent).
 */
export function horizonColor(sunDir, air, out, elevation = 0.06) {
  out.setRGB(0, 0, 0);
  const N = 8;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    _d.set(Math.cos(a), elevation, Math.sin(a)).normalize();
    skyRadiance(_d, sunDir, air, _c);
    out.r += _c.r / N; out.g += _c.g / N; out.b += _c.b / N;
  }
  return out;
}

/** Straight up — the hemisphere light's sky colour. */
export function zenithColor(sunDir, air, out) {
  _d.set(0, 1, 0);
  return skyRadiance(_d, sunDir, air, out);
}
