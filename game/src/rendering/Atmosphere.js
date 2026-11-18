// ══════════════════════════════════════════════════════════
// Atmosphere — the world's art direction
//
// The world used to render a hardcoded "Anime Blue Sky" at permanent
// high noon, lit by a purple rim light, while the interface was a
// dark occult manuscript. They looked like two different games.
//
// This owns the sky, the fog, the light rig and the grade, and it
// takes all of them from the player's chosen path — so the world you
// walk through and the book you read from are finally the same object.
//
//   HELL   — a sky full of ash lit from below by something burning.
//            Everything is ember, iron and dried blood.
//   HEAVEN — blown-out, bleached, too bright to look at directly.
//            Bone, pale gold and washed grey-blue.
//
// Neither is "daylight". Both are weather.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Moon3D } from './Moon3D.js';
import { AIR, createPhysicalSky, applyAir, horizonColor, zenithColor, sunColor } from './PhysicalSky.js';
// One-way dependency: Weather.js imports Quality only, never Atmosphere
// (it receives the atmosphere instance as an init() argument), so this
// import cannot form a cycle.
import { weather } from './Weather.js';
// Ground mist is off at the `low` tier (artifact parity) — see
// _buildGroundMist.
import { quality } from './Quality.js';

/** Mist is paler and greyer than the sky it hangs under. */
const MIST_BONE = new THREE.Color(0xc8c4bc);
/** Reused every frame — fog colour composition must not allocate. */
const _FOG_SCRATCH = new THREE.Color();

/**
 * The colour the air warms toward inside the Sanctuary — hearth and
 * lamplight, deliberately the same in BOTH paths.
 *
 * Not path-keyed on purpose: the whole point of the hub is that it is
 * the one place the Fracture's argument is not being had. A Cinderbound
 * player and an Ascendant player should walk into the same warm room.
 */
const SANCTUARY_HAZE = new THREE.Color(0xd9a86a);

// Scratch for the snapped shadow anchor — see the key-light block in
// update(). Allocating a Vector3 per frame there would be exactly the
// kind of cost that block exists to remove.
const _shadowAnchor = new THREE.Vector3();

/**
 * How the world looks under each dominant trait.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────
 * The world's palette used to follow the PATH — a choice made from two
 * cards before the player had done anything. That choice is gone (see
 * main.js's note where the path grid used to be), and the thing that
 * replaced it is the same thing that replaced classes: what you ARE is
 * decided by what you DO.
 *
 * So the sky follows your dominant ATTUNEMENT. Cast light and the world
 * is bright and clear; cast void and it closes in. Nobody tells you
 * this happens — you notice the horizon has changed colour and work out
 * why.
 *
 * ⚠️ These are OVERRIDES BLENDED OVER the base palette, not
 * replacements. Blend weight is the element's share of your profile, so
 * a scattered caster sits near the base and only a committed one
 * re-colours the world. A hard swap would strobe the sky every time the
 * dominant element changed hands.
 *
 * `fog` is a MULTIPLIER on density, and it is the whole reason
 * lightbound reads as "bright and colourful, not foggy" — the owner's
 * words. Light and wind clear the air; void, shadow and poison thicken
 * it.
 */
export const TRAIT_SKIES = {
  light:     { zenith: 0x9fb8d8, horizon: 0xffeec4, glow: 0xfff6e0, fog: 0.45, exposure: 1.22, sat: 1.20 },
  arcane:    { zenith: 0x4a3a78, horizon: 0xc9a0ff, glow: 0xe0c8ff, fog: 0.75, exposure: 1.08, sat: 1.18 },
  ice:       { zenith: 0x5d7e96, horizon: 0xd6f0ff, glow: 0xeafaff, fog: 0.70, exposure: 1.12, sat: 1.05 },
  wind:      { zenith: 0x6f9a95, horizon: 0xcdf3ea, glow: 0xe8fff9, fog: 0.55, exposure: 1.10, sat: 1.10 },
  water:     { zenith: 0x2c4f70, horizon: 0x7fc0f0, glow: 0xc4e8ff, fog: 0.85, exposure: 1.02, sat: 1.08 },
  lightning: { zenith: 0x3d3a5c, horizon: 0xffe98a, glow: 0xfff6c0, fog: 0.65, exposure: 1.14, sat: 1.16 },
  fire:      { zenith: 0x3a1810, horizon: 0xff7a3a, glow: 0xffb066, fog: 1.00, exposure: 0.96, sat: 1.12 },
  earth:     { zenith: 0x3a3a24, horizon: 0xb8b070, glow: 0xd8d0a0, fog: 1.05, exposure: 0.94, sat: 0.92 },
  poison:    { zenith: 0x24361c, horizon: 0x9ee04a, glow: 0xc8f090, fog: 1.20, exposure: 0.90, sat: 1.06 },
  shadow:    { zenith: 0x1a1226, horizon: 0x5a3a7a, glow: 0x8a5ab0, fog: 1.30, exposure: 0.84, sat: 0.86 },
  void:      { zenith: 0x120a1c, horizon: 0x4a2060, glow: 0x8030a8, fog: 1.45, exposure: 0.78, sat: 0.80 },
};

// ── PALETTES ──────────────────────────────────────────────
export const SKIES = {
  // Dialled darker/grimmer from the previous pass on purpose, but not
  // back toward the original bug — that was ambient/hemisphere too
  // WEAK to act as a visibility floor at all, and a rim light aimed at
  // the wrong point in space. Those are still fixed. This is mood
  // (lower exposure, heavier vignette, a cooler/dirtier grade tint,
  // thicker fog), layered on top of a scene that still actually
  // renders what's in the shadows.
  hell: {
    // ══════════════════════════════════════════════════════
    // ⚠️ RE-GRADED COLD. Owner asked for the world to take after
    // Shadow Slave, and that setting's look is not a burning sky — it
    // is a DEAD one: ash-grey, faintly blue, lit mostly by a broken
    // moon, with any warmth confined to a bruise on the horizon.
    //
    // The old values were an ember furnace (horizon 0x7a3512, glow
    // 0xc85f26) which flooded every frame with orange and washed the
    // moon out to a smudge — the sky was competing with the thing
    // that is supposed to dominate it.
    //
    // ⚠️ The horizon keeps a LITTLE warmth on purpose. A fully
    // monochrome sky reads as fog rather than as dusk, and this
    // project's own grade already crushes saturation hard (§4's
    // vibrancy note) — pull the last colour out here and the world
    // goes grey-on-grey.
    // ══════════════════════════════════════════════════════
    zenith:   0x141a26,   // cold slate — night bleeding into the dome
    horizonC: 0x4a4048,   // ash and old blood, not fire
    glow:     0x6b5a66,   // a bruise past the edge of the map
    sun:      0xb8a898,
    // Nudged up ~8% from 0.0024: the dimmer, more-linear PBR light rig
    // (see ambient/key/rim below) means less ambient glow is doing the
    // job of softening distant terrain, so distance haze needed a hair
    // more density to keep selling depth. Small on purpose — this also
    // feeds ChunkManager's per-biome fog multiplier, and the general
    // open-world case is still floor-clamped by setDrawDistance().
    fogDensity: 0.0026,

    // Ambient/hemisphere are still the visibility FLOOR — anything in
    // shadow is lit by these two ALONE, and they still have to be
    // strong enough that the inside of a structure isn't a black hole.
    // Dialled down again from the previous grimdark pass, but the
    // floor itself (see `lift` below) is untouched.
    //
    // Retuned for MeshStandardMaterial (was toon-material-calibrated):
    // MeshToonMaterial's gradient map only quantized the SUN's own
    // contribution into 4 bands floored at ~0.51, which both hid
    // dark-side falloff and pushed the average lit-surface brightness
    // well above true Lambertian — ambient/hemi/key were all tuned
    // high enough to punch through that. The standard material has no
    // such floor (dot(N,L) can go to true zero) and adds a real
    // roughness-shaped specular highlight the toon material never had,
    // so the old numbers read blown-out/hot. Roughly ~40-45% of the
    // old values gets back to a comparable perceived brightness.
    // Dark-fantasy retune. The ambient/hemi FLOOR is cut hard — that
    // floor is what was making the world read as evenly lit and
    // therefore flat. Elden Ring's oppressiveness comes from a large
    // range between what the key light touches and what it does not,
    // and you cannot have that range while a strong uniform ambient is
    // filling every shadow. The key light goes UP to compensate, so
    // lit surfaces are actually brighter than before while unlit ones
    // are far darker. The IBL environment (EnvironmentIBL.js) now
    // supplies directionally-correct fill in place of the flat term.
    //
    // Ambient is tinted COLD against a warm key on purpose — the split
    // between cold shadow and warm light is doing most of the mood.
    // ══════════════════════════════════════════════════════
    // ⚠️ REALISM PASS — the light colours below are now only the
    // FALLBACK. update() derives the key's colour from the sun's path
    // through the air, the hemisphere's from the sky's own zenith and
    // the ambient's from the horizon (PhysicalSky.js), every frame. A
    // hand-picked orange key under a hand-picked orange rim was most
    // of why every frame read as one flat amber wash. Intensities are
    // in RŌNIN's range (key up to ~2.3, ambient well under 1).
    // ⚠️ The rim is cut nearly to nothing. A back-light that follows
    // the camera is a studio trick; outdoors there is one sun and the
    // sky, and a strong rim is what makes a world read as a render.
    // ══════════════════════════════════════════════════════
    air:      AIR.hell,
    ambient:  { color: 0x8a96a6, intensity: 0.26 },
    hemi:     { sky: 0x9aa8b8, ground: 0x2e2822, intensity: 0.42 },
    key:      { color: 0xffe2c0, intensity: 1.70 },
    rim:      { color: 0x9aa6b8, intensity: 0.12 },

    // Under 1.0 now. With ACES tonemapping this pulls the whole image
    // down into the toe of the curve, which is where filmic contrast
    // actually lives — the old 1.18 was lifting everything into the
    // linear midsection and flattening it.
    exposure: 0.70,   // RŌNIN's EXPOSURE
    // `lift` is an absolute post-tonemap floor — the one lever that
    // guarantees no pixel anywhere, however deep in shadow, renders
    // as literal black. Lowered again, not zeroed: shadows should
    // read as dark, not as a rendering bug. 0.045 is the floor this
    // file is willing to go — below that is the original black-hole
    // bug, not mood.
    // Vignette roughly doubled and the lift floor cut — CinematicGrade
    // now has a soft shadow shoulder of its own, so the crude absolute
    // floor no longer has to carry "don't render pure black" alone.
    // ⚠️ Neutral tint, light vignette, almost no lift. The textures and
    // the sky carry the colour now; a grade that re-tints every pixel
    // brown is a filter over the world, not a world.
    grade:    { tint: [1.0, 1.0, 1.0], vignette: 0.40, lift: 0.004 },
    // ⚠️ The old terrain grade desaturated by 44% and then dragged 26%
    // toward a brown — the ground's own photographed colour barely
    // survived it. Light touch now, so the PBR sets read as soil, ash
    // and stone.
    terrain:  { desaturate: 0.16, tint: 0x6a6052, tintAmount: 0.06 },
    particle: 0xb8ab98,   // dust and ash, not embers — embers read as a fire nearby
    // The Fracture itself — see SKY_FRAG's rift block. Molten: an
    // ember crack with a white-hot core, "the thing burning past the
    // edge of the map" made literal instead of only implied by uGlow.
    rift: { color: 0xb8664a, core: 0xffe8c8, strength: 0.22 },
  },

  heaven: {
    zenith:   0x7c8fa0,   // washed grey-blue, never cartoon
    horizonC: 0xe6dabe,   // bone
    glow:     0xf5eddc,
    sun:      0xfff8e8,
    fogDensity: 0.0028,   // same small ~8% bump as Hell, same reasoning; ordering vs Hell unchanged

    // Retuned for MeshStandardMaterial — see Hell's note above for the
    // mechanism. Same ~40-45% scale-down, applied to Heaven's own
    // (already slightly lower on key/rim) numbers so the two palettes'
    // RELATIVE brightness ordering is unchanged; the "too bright to
    // look at directly" read still comes chiefly from Heaven's
    // near-white hues, higher `lift` floor and paler grade tint
    // (untouched, out of scope here) rather than from raw intensity.
    // Same retune as Hell — see the note there. Heaven keeps its
    // higher absolute level (it is the blown-out path) but gains the
    // same large lit/unlit range, so it reads as harsh glare with real
    // shadow under it rather than as uniform milk.
    air:      AIR.heaven,
    ambient:  { color: 0x9aa4b2, intensity: 0.30 },
    hemi:     { sky: 0xb0c0d0, ground: 0x3a342a, intensity: 0.46 },
    key:      { color: 0xfff4de, intensity: 1.85 },
    rim:      { color: 0xa8a08c, intensity: 0.12 },

    // Still "too bright to look at directly" — that blown-out quality
    // IS Heaven's own unsettling note, the opposite of Hell's dark, so
    // this stays deliberately lighter-touch than Hell's darkening —
    // a slightly heavier vignette so even the blown-out light starts
    // to feel like it's closing in, not a wholesale re-grade.
    exposure: 0.74,
    grade:    { tint: [1.0, 1.0, 1.0], vignette: 0.36, lift: 0.006 },
    terrain:  { desaturate: 0.14, tint: 0xb0a37e, tintAmount: 0.06 },
    particle: 0xfff0c8,
    // Blinding white-gold — "too bright to look at directly," the
    // same unsettling note the rest of Heaven's palette already
    // carries, applied to the wound instead of just the weather.
    rift: { color: 0xfff6e0, core: 0xffffff, strength: 0.85 },
  },
};

// ── SKY DOME ──────────────────────────────────────────────
// A single inverted sphere with a vertical gradient and a directional
// glow toward the sun. Cheap, and it removes the flat background
// colour that made the world read as a screensaver.
const SKY_VERT = /* glsl */`
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const SKY_FRAG = /* glsl */`
  uniform float uTime;
  // ── The Fracture ──────────────────────────────────────
  // Every line of dialogue in this game is about a broken sky, and
  // until now the sky was a smooth, unbroken gradient. This is the
  // literal wound: a jagged emissive crack running across the dome
  // along a fixed axis, present in every screenshot from now on
  // rather than only implied by uGlow's horizon bloom.
  uniform vec3 uRiftAxis;    // the crack's pole — fixed, world-space, never re-set per frame
  uniform vec3 uRiftColor;
  uniform vec3 uRiftCore;
  uniform float uRiftStrength;
  // ── THE BROKEN MOON ───────────────────────────────────
  // A colossal shattered moon, hanging in a fixed place in the sky.
  // Owner asked for the world to take after Shadow Slave, and this is
  // that setting's single defining image: not a moon you notice, a
  // moon you live under. It is drawn IN THE SKY SHADER rather than as
  // a billboard or a sphere because it must sit behind absolutely
  // everything at infinite distance, never parallax as the player
  // walks, and cost exactly nothing to have on screen at all times.
  uniform vec3 uMoonDir;     // fixed world direction — the moon does not move
  uniform vec3 uMoonColor;
  uniform vec3 uMoonGlow;
  uniform float uMoonSize;   // angular radius, radians
  uniform vec3 uMoonSun;     // direction TO the sun — lights the moon as a sphere (phases)
  varying vec3 vWorldPos;

  // ── Moon surface (only ever evaluated on moon pixels) ──
  float mh21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float mvn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(mh21(i), mh21(i + vec2(1, 0)), u.x), mix(mh21(i + vec2(0, 1)), mh21(i + vec2(1, 1)), u.x), u.y); }
  // Craters: a jittered cell field; each has a dark floor and a bright rim.
  float mcraters(vec2 p, float scale) {
    vec2 g = p * scale, i = floor(g); float c = 0.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 cell = i + vec2(float(x), float(y));
      vec2 ctr = cell + vec2(mh21(cell), mh21(cell + 7.1));
      float r = 0.16 + 0.34 * mh21(cell + 3.3);
      float d = length(g - ctr) / r;
      if (d < 1.4 && mh21(cell + 11.7) > 0.35) {
        c += smoothstep(0.72, 0.95, d) * (1.0 - smoothstep(0.95, 1.3, d)) * 0.55 - (1.0 - smoothstep(0.0, 0.85, d)) * 0.4;
      }
    }
    return c;
  }
  float malbedo(vec2 q) {
    float maria = smoothstep(0.48, 0.72, mvn(q * 1.5 + 3.0) * 0.6 + mvn(q * 3.4 + 11.0) * 0.4);
    float a = mix(1.0, 0.58, maria);
    a *= 1.0 + mcraters(q, 2.6) * 0.38 + mcraters(q + 9.1, 6.5) * 0.22 + mcraters(q + 4.7, 14.0) * 0.12;
    return a * (0.94 + mvn(q * 22.0) * 0.12);
  }
  // A patch of sphere at disc coords q (|q| < 1): lit by the real sun.
  vec3 mshade(vec2 q, vec3 mu, vec3 mv, vec3 md, float night) {
    float z = sqrt(max(0.0, 1.0 - dot(q, q)));
    vec3 n = normalize(mu * q.x + mv * q.y - md * z);
    float lit = smoothstep(-0.04, 0.3, dot(n, normalize(uMoonSun)));
    float a = malbedo(q);
    // Earthshine: the night side is faintly there, never black paper.
    return uMoonColor * a * (lit * mix(0.62, 1.05, night) + 0.05 + 0.05 * night);
  }

  // ⚠️ The 2D haze noise that used to live here is GONE. It cost four
  // sin()-based hash lookups per sky fragment — and the sky is most of
  // the screen — to contribute ±0.028 to the final colour, which is
  // roughly 3/255 and genuinely invisible against the gradient. It was
  // the single most expensive thing in this shader and the least
  // visible. Do not add it back without measuring what it buys.
  //
  // 1D hash/noise remains, for the crack's own wobble only.
  float hash1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
  float noise1(float x) {
    float i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(hash1(i), hash1(i + 1.0), f);
  }

  void main() {
    vec3 dir = normalize(vWorldPos);

    // ⚠️ THIS DOME NO LONGER PAINTS THE SKY. The realism pass put the
    // physical Preetham sky (PhysicalSky.js, the one RŌNIN uses) behind
    // it; this pass now draws ONLY what the physical model cannot — the
    // moon and the rift — as a PREMULTIPLIED overlay. 'col' is light
    // added on top; 'cover' is how much of the sky behind is hidden.
    // The old zenith/horizon gradient and its sun glow are gone: two
    // painted colours over a scattering model is exactly the seam that
    // makes a realistic sky read as a backdrop.
    vec3 col = vec3(0.0);
    float cover = 0.0;

    // ── The broken moon ──────────────────────────────────
    // Drawn BEFORE the crack, so the Fracture reads as passing in
    // front of it — the sky is wounded, and the moon is behind the
    // wound, which is the right way round for this fiction.
    vec3 mdir = normalize(uMoonDir);
    float mcos = dot(dir, mdir);
    float mang = acos(clamp(mcos, -1.0, 1.0));       // angle from moon centre
    float mr = mang / max(uMoonSize, 0.0001);        // 0 at centre, 1 at limb

    if (mr < 2.8) {
      // ══════════════════════════════════════════════════
      // ⚠️ THE SHATTERED MOON, DONE AS A BODY (owner: "the moon is
      // broken and not as per the need"; chose "shattered, done right").
      // It was a giant flat pale disc with a ruler-straight gap. Now:
      //   · a SPHERE lit by the actual sun — phases, a terminator, a
      //     faint earthshine on the night side;
      //   · cratered rock (cell craters at three scales) and dark maria;
      //   · a JAGGED break (noise along the cut), the broken piece
      //     drifted off AND turned, debris strung through the gap;
      //   · the exposed faces of the break glowing faintly in the
      //     Fracture's own colour — the same wound as the sky's crack.
      // Smaller than before (uMoonSize), so it is eerie, not a decal.
      // ══════════════════════════════════════════════════
      vec3 mref = abs(mdir.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
      vec3 mu = normalize(cross(mref, mdir));
      vec3 mv = cross(mdir, mu);
      vec2 p = vec2(dot(dir, mu), dot(dir, mv)) / max(uMoonSize, 0.0001);
      float night = smoothstep(0.08, -0.12, normalize(uMoonSun).y);
      vec2 cutN = normalize(vec2(0.78, 0.62)), cutT = vec2(-cutN.y, cutN.x);
      // The jagged fracture line: signed distance across it, bent by noise.
      #define MCUT(q) (dot(q, cutN) - (0.2 + (noise1(dot(q, cutT) * 5.0 + 3.0) - 0.5) * 0.14 + (noise1(dot(q, cutT) * 17.0) - 0.5) * 0.05))
      vec3 mcol = vec3(0.0); float mbody = 0.0;
      // Main body: the unit disc on the near side of the break.
      float rM = length(p), cM = MCUT(p);
      float inM = (1.0 - smoothstep(0.985, 1.0, rM)) * (1.0 - smoothstep(-0.008, 0.0, cM));
      if (inM > 0.001) {
        vec3 c = mshade(p, mu, mv, mdir, night);
        // The broken face: darker exposed rock, and a faint glow deep in it.
        float face = 1.0 - smoothstep(0.0, 0.07, -cM);
        c = mix(c, c * 0.35, face * 0.8) + uRiftColor * face * face * (0.34 + 0.14 * sin(uTime * 0.6)) * (0.4 + night);
        mcol += c * inM; mbody = max(mbody, inM);
      }
      // The broken piece: drifted off the break and turned.
      vec2 off = cutN * 0.46 + cutT * 0.12;
      float ang = -0.22; mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
      vec2 q = rot * (p - off);
      float rP = length(q), cP = MCUT(q);
      float inP = (1.0 - smoothstep(0.985, 1.0, rP)) * smoothstep(0.03, 0.04, cP) * (1.0 - inM);
      if (inP > 0.001) {
        vec3 c = mshade(q, mu, mv, mdir, night);
        float face = 1.0 - smoothstep(0.0, 0.07, cP - 0.035);
        c = mix(c, c * 0.35, face * 0.8) + uRiftColor * face * face * (0.34 + 0.14 * sin(uTime * 0.6 + 1.3)) * (0.4 + night);
        mcol += c * inP; mbody = max(mbody, inP);
      }
      // Debris strung through the gap and spilling past it.
      vec2 gapMid = cutN * 0.42 + off * 0.35;
      for (int i = 0; i < 11; i++) {
        float fi = float(i);
        vec2 dp = gapMid + cutT * (hash1(fi * 3.1) - 0.5) * 1.5 + cutN * (hash1(fi * 7.7) - 0.35) * 0.55;
        float rr = 0.022 + 0.06 * hash1(fi * 5.3) * hash1(fi * 1.9);
        vec2 d = p - dp;
        float shape = length(d) / rr * (1.0 + 0.28 * sin(atan(d.y, d.x) * 3.0 + fi * 2.0) + 0.12 * sin(atan(d.y, d.x) * 7.0 + fi));
        float inD = (1.0 - smoothstep(0.9, 1.0, shape)) * (1.0 - mbody);
        if (inD > 0.001) {
          vec2 lq = clamp(d / rr, -0.95, 0.95) * 0.7;
          vec3 c = mshade(lq, mu, mv, mdir, night) * (0.75 + 0.25 * hash1(fi));
          mcol += c * inD; mbody = max(mbody, inD);
        }
      }
      // A thin haze of dust in the gap.
      vec2 g = p - gapMid;
      float haze = exp(-pow(dot(g, cutN) / 0.18, 2.0)) * (1.0 - smoothstep(0.5, 1.4, abs(dot(g, cutT))));
      mcol += uMoonGlow * haze * 0.05 * (0.4 + night) * (1.0 - mbody);
      // The air is in front of it by day (it only ever adds); by night it
      // is solid enough to hide the stars behind it.
      col = mcol * mix(0.55, 1.0, night);
      cover = mbody * mix(0.08, 0.85, night);
      // Halo — tight, stronger at night.
      float rr0 = min(rM, rP);
      float halo = exp(-pow(max(0.0, rr0 - 0.98), 2.0) * 18.0);
      col += uMoonGlow * halo * (0.03 + 0.05 * night) * (1.0 - mbody);
      #undef MCUT
    }
    // ── The Fracture crack ───────────────────────────────
    // uRiftAxis is the pole of the crack's great circle. Build an
    // orthonormal frame around it so we have (a) an angle running
    // ALONG the crack and (b) a signed angular distance AWAY from its
    // centre line — the two coordinates a crack needs: where along
    // its length, and how far off it you're looking.
    vec3 axis = normalize(uRiftAxis);
    vec3 refV = abs(axis.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 riftU = normalize(cross(refV, axis));
    vec3 riftV = cross(axis, riftU);

    float along = atan(dot(dir, riftV), dot(dir, riftU));   // -PI..PI, position along the crack
    float off   = asin(clamp(dot(dir, axis), -1.0, 1.0));   // signed angular distance from centre

    // Jagged centreline: 1D noise bends where the crack actually sits
    // along its length, so it reads as a fracture and not a drawn arc.
    // ⚠️ ONE octave, not two. The second octave was ±0.07 radians of
    // extra wiggle on a line that is already ~0.01 radians wide — it
    // moved the crack by less than its own thickness while doubling
    // the noise cost of every sky fragment.
    float wobble = (noise1(along * 2.2) - 0.5) * 0.22;
    float crackDist = abs(off - wobble);

    // Bright hairline core + a wider soft bleed, same two-tier shape
    // real light through a crack has: a hot line and a glow around it.
    // ⚠️ Softer than it was: a hairline at 1.4x over a narrow bleed read
    // as a glowing rope strung across a photographed sky. A wide dim
    // bleed with a faint core reads as light leaking through a scar —
    // closer to an aurora than to a neon tube.
    float core = 1.0 - smoothstep(0.0, 0.006, crackDist);
    float bleed = exp(-crackDist * crackDist * 260.0);

    // Intensity varies along the crack's length rather than being one
    // uniform brightness the whole way round the sky — a few flare
    // points, thinner and dimmer stretches between them. Also fades
    // toward the anti-pole (behind/below, off = near ±HALF_PI is the
    // pole itself; nothing to fade there since the crack is a single
    // circle) — instead fade with altitude so it reads as a sky
    // feature, not something also cutting through the ground.
    // Reuses noise1 at a low frequency; kept because unlike the two
    // removed lookups this one IS visible — it is what stops the crack
    // being one uniform brightness the whole way round the sky.
    float flare = 0.55 + 0.45 * noise1(along * 0.6 + 100.0);
    float altitudeFade = smoothstep(-0.15, 0.25, dir.y);

    vec3 riftGlow = uRiftColor * bleed * 0.7;
    col += riftGlow * uRiftStrength * flare * altitudeFade;

    gl_FragColor = vec4(col, cover);
  }
`;

const _CAVE_FOG = new THREE.Color(0x050506);
class Atmosphere {
  constructor() {
    this.path = 'hell';
    this.palette = SKIES.hell;
    this.scene = null;
    this.renderer = null;
    this._time = 0;
    this._fogFloor = 0;
    // ── FOG STRENGTH, one owner ──────────────────────────
    // A single global multiplier on how thick the air reads, for both
    // the distance fog and the ground mist. Exposed so it can be tuned
    // (?fog=1.4, or atmosphere.setFogStrength) without editing the
    // composition maths, and so there is exactly ONE place to turn it
    // down if it ever reads as too much — rather than the historical
    // failure mode of two contributors quietly fighting.
    this._fogStrength = this._readFogPref();
    this._mistStrength = 1;
    this._mist = null;
    this._mistLayers = [];
    // Per-biome air thickness, published by ChunkManager.setBiomeFog().
    // 1 = the path's own density, untouched.
    this._biomeFog = 1;
    this._unease = 0; // 0..1, driven by SaturationSystem's volatile reading (main.js)
    // A Descent's element colour, 0..1 strength — published by
    // DescentSystem.setDescentTint(), composed into fog/grade below.
    // A FACTOR, like every other contributor here; nothing outside
    // update() writes fog.density or key.intensity. See the fog
    // composition note further down and HANDOFF §4.
    this._descentTint = null;
    this._descentAmount = 0;
    // ── The Sanctuary ──
    // 0..1, how far inside the safe hub the player is. Published by
    // main.js from distance-to-spawn and eased, never snapped, so
    // walking out through the gate is a gradual loss of shelter rather
    // than a light switch.
    //
    // ⚠️ Like every other contributor in this file, this is a FACTOR.
    // It does not write fog.density or key.intensity; update() composes
    // it with the palette, biome, weather and Descent factors. See the
    // fog composition block and HANDOFF §4 — this contract has been
    // broken twice by systems that wrote the field directly and
    // silently erased each other.
    this._sanctuary = 0;
    // The dominant trait and how committed to it the player is — see
    // TRAIT_SKIES. Published by main.js from AttunementSystem, so the
    // sky follows what you actually cast.
    this._trait = null;
    this._traitWeight = 0;
    this._traitSaturation = 1;
  }

  /** Called once by SceneManager after the scene exists. */
  init(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;

    // Comfortably inside the camera's far plane (1400, CameraController.js)
    // — the dome is re-centred on the camera every frame, so every point
    // on it sits at this exact Euclidean distance regardless of view
    // angle, and it was previously bigger than far itself.
    // ── THE PHYSICAL SKY ─────────────────────────────────
    // The base layer: Preetham scattering, as in RŌNIN. Everything the
    // eye reads as "sky" — the sun's halo, the warm low horizon, the
    // deepening zenith — comes from here now. See PhysicalSky.js.
    this.physSky = createPhysicalSky();
    applyAir(this.physSky, this.palette.air || AIR.hell);
    scene.add(this.physSky);

    const geo = new THREE.SphereGeometry(900, 32, 20);
    const mat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      // ⚠️ PREMULTIPLIED overlay over the physical sky: the shader
      // writes (light added, coverage). ONE / ONE_MINUS_SRC_ALPHA is
      // the premultiplied "over" operator — the moon hides the sky
      // behind it, the rift's glow adds on top of it.
      transparent: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      uniforms: {
        uTime:    { value: 0 },
        // Fixed once, here, and never touched again — the crack's
        // position in the sky is part of the world's identity, not
        // something that should drift with time of day or path. Tilted
        // rather than vertical/horizontal so it reads as a diagonal
        // wound crossing near the zenith, visible from most headings
        // instead of only when looking straight up or along one axis.
        uRiftAxis:     { value: new THREE.Vector3(0.32, 0.86, 0.4).normalize() },
        uRiftColor:    { value: new THREE.Color(this.palette.rift.color) },
        uRiftCore:     { value: new THREE.Color(this.palette.rift.core) },
        uRiftStrength: { value: this.palette.rift.strength },
        // ⚠️ FIXED, like the rift. A moon that tracked the sun would
        // be a light source; this is a landmark — the one thing that
        // is in the same place from every point in the world, which is
        // exactly what makes an open world feel like one place rather
        // than an extruded plane. Low in the sky so it is visible in
        // ordinary play without the player ever looking up.
        // ⚠️ ~42° up (was ~17°, on the horizon — owner: "higher in sky,
        // not near the horizon"). Same bearing. High enough to hang over
        // the world, low enough to be in frame with a slight look up.
        uMoonDir:   { value: new THREE.Vector3(-0.484, 0.669, -0.563).normalize() },
        uMoonColor: { value: new THREE.Color(0xcfd6e2) },
        uMoonGlow:  { value: new THREE.Color(0x8ea4c4) },
        // ⚠️ 0.20 rad ≈ 23° of arc. For scale, our own moon is 0.009
        // rad (0.5°) — this is roughly FORTY TIMES the size, which is
        // the whole point: it has to dominate, not decorate.
        uMoonSize:  { value: 0.085 },   // was 0.20 (23° — a decal); still ~10x our moon
        uMoonSun:   { value: new THREE.Vector3(0, 1, 0) },
      },
    });

    this.sky = new THREE.Mesh(geo, mat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    scene.add(this.sky);

    // ⚠️ THE MOON IS A BODY NOW (rendering/Moon3D.js) — owner: "make it
    // like real life and 3D". The painted disc in this shader is off
    // (uMoonSize 0); the sculpted, shattered sphere sits in the same
    // fixed direction, lit by the same sun.
    this.moon3d = new Moon3D();
    this.moon3d.setDirection(mat.uniforms.uMoonDir.value);
    this.moon3d.material.uniforms.uRift.value.set(this.palette.rift.color);
    mat.uniforms.uMoonSize.value = 0;
    scene.add(this.moon3d.group);

    scene.background = null;   // the dome is the background now
    // Fog is always the sky's own horizon colour — see the note by
    // SKIES above. There is no separate `fog` field to drift out of sync.
    // ── ⚠️ LINEAR FOG, NOT FogExp2 ──
    //
    // Exponential fog starts at the camera: density applies from zero
    // distance outward, so making it thick enough to hide the world
    // edge ALWAYS greys out what is right in front of you. That is why
    // "everything is foggy" and "I can't see" were the same complaint,
    // and why removing it entirely was the only way to get clear
    // vision.
    //
    // Linear fog has a NEAR plane. Nothing closer than `near` is
    // touched at all — the player's actual field of view is completely
    // clear — and it ramps to full only at `far`, which is pinned to
    // the world edge. So the fog is doing its real job (hiding the
    // chunk boundary, letting render distance stay small and cheap)
    // while never blocking the view.
    //
    // near/far are set by setDrawDistance(); see there for the ratios.
    scene.fog = new THREE.Fog(this.palette.horizonC, 40, 400);

    this._buildGroundMist(scene);

    return this;
  }

  // ── GROUND MIST ─────────────────────────────────────────
  // Distance fog alone reads as "the horizon is washed out", not as
  // weather — it has no near-field presence at all, because linear fog
  // deliberately starts a long way out (see the note by scene.fog).
  // The thing that actually reads as fog while you walk is low-lying
  // mist you move THROUGH.
  //
  // Three big horizontal sheets riding just above the ground, following
  // the camera in XZ so the field is effectively infinite. Cost is 3
  // draw calls and no per-frame allocation; the texture is generated
  // once into a canvas, so it adds nothing to the bundle and makes no
  // external request (the artifact build forbids those).
  //
  // ⚠️ depthWrite MUST stay false. These are large transparent sheets
  // and writing depth would let them occlude everything behind them
  // and fight each other in whatever order they happen to sort.
  // ⚠️ Off at the `low` tier, which is exact parity with the artifact
  // build — three full-screen-ish transparent layers is exactly the
  // kind of fill-rate cost the low tier exists to avoid.
  _buildGroundMist(scene) {
    if (quality.tier === 'low') return;

    const tex = this._mistTexture();
    this._mist = new THREE.Group();
    this._mist.renderOrder = -1;
    this._mistLayers = [];

    // ⚠️ EVERY layer sits BELOW eye height, and the offsets are
    // relative to the ground under the player (see _updateGroundMist),
    // not absolute world Y.
    //
    // Both of those are corrections to a first version that put sheets
    // at absolute y = 2 / 6 / 13. A horizontal plane at eye level is
    // seen edge-on, and a 365-unit plane seen edge-on covers the ENTIRE
    // frame — the result was not ground mist, it was a full-screen
    // colour wash that turned the whole world one flat hue. Mist has to
    // be something you look DOWN onto for it to read as lying on the
    // ground. Absolute Y had a second bug behind the first: on high
    // terrain the sheets were underground and invisible entirely.
    //
    // Two layers, not three. The third existed for parallax and bought
    // very little once the layers were correctly below the horizon.
    const LAYERS = [
      { y: 0.35, size: 2.0, opacity: 0.20, drift: 0.0030, scale: 3.2 },
      { y: 1.05, size: 2.7, opacity: 0.12, drift: -0.0019, scale: 2.1 },
    ];

    for (const L of LAYERS) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: L.opacity,
        depthWrite: false,
        depthTest: true,
        color: this.palette.horizonC,
        side: THREE.DoubleSide,
        fog: false,          // the sheet IS the fog; fogging it twice greys it out
      });
      const geo = new THREE.PlaneGeometry(1, 1);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.frustumCulled = false;   // it is always around the camera
      mesh.userData.mist = L;
      this._mist.add(mesh);
      this._mistLayers.push(mesh);
    }
    scene.add(this._mist);
  }

  /** Soft blotchy alpha, drawn once into a canvas. No external asset. */
  _mistTexture() {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    // Layered soft blobs give a cloudy alpha without needing a real
    // noise implementation or a texture file.
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * S, y = Math.random() * S;
      const r = 12 + Math.random() * 46;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const a = 0.05 + Math.random() * 0.10;
      grad.addColorStop(0, `rgba(255,255,255,${a})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  /**
   * Keep the mist around the camera and match it to the current air.
   * `thickness` is the same composed factor that drives the fog range,
   * so mist and distance fog always agree about how thick the air is —
   * one input, two expressions of it, rather than two dials to keep in
   * sync by hand.
   */
  _updateGroundMist(cameraPosition, thickness) {
    if (!this._mist) return;
    const span = Math.max(120, this.drawDistance);
    // Snap to a coarse grid so the sheets do not shimmer as you walk;
    // the texture offset supplies the actual motion.
    const snap = 8;
    this._mist.position.set(
      Math.round(cameraPosition.x / snap) * snap,
      0,
      Math.round(cameraPosition.z / snap) * snap,
    );
    const t = Math.max(0.25, Math.min(3, thickness));
    // Ground under the player, approximated from the eye position. The
    // camera rides a fixed eye height above the ground, so this tracks
    // terrain without Atmosphere needing to know about ChunkManager.
    const groundY = cameraPosition.y - 1.7;
    for (const mesh of this._mistLayers) {
      const L = mesh.userData.mist;
      mesh.scale.set(span * L.size, span * L.size, 1);
      mesh.position.y = groundY + L.y;
      mesh.material.opacity = L.opacity * Math.min(1.6, t) * this._mistStrength;
      // ⚠️ Toward the fog colour but LIFTED toward bone, never the fog
      // colour itself. Tinting a large sheet with the fully-saturated
      // horizon hue means every pixel it covers gets pushed to that one
      // hue — which is how the first version undid the whole vibrancy
      // pass by flooding the frame with a single colour. Mist is
      // suspended water; it is paler and greyer than the sky it hangs
      // under.
      mesh.material.color.copy(this.scene.fog.color).lerp(MIST_BONE, 0.45);
      const m = mesh.material.map;
      if (m) {
        m.repeat.set(L.scale, L.scale);
        m.offset.x = (m.offset.x + L.drift * 0.6) % 1;
        m.offset.y = (m.offset.y + L.drift * 0.35) % 1;
      }
    }
  }

  /** Hand it the light rig SceneManager already built. */
  bindLights({ ambient, hemi, key, rim }) {
    this.lights = { ambient, hemi, key, rim };
    this.apply(this.path);
  }

  /**
   * Hand it the IBL baker so sky changes can re-derive the environment
   * map. Optional — everything here still works with it unbound, which
   * is the case at the `low` quality tier.
   */
  bindEnvironment(ibl) {
    this._ibl = ibl;
  }

  /**
   * Ask for a re-bake. `bake()` dedupes on the key, so this is safe to
   * call every frame — which is exactly what update() does, since the
   * sun is always drifting and we want the environment to follow it
   * without anyone having to remember to invalidate.
   */
  _refreshEnvironment() {
    if (!this._ibl?.enabled) return;
    // Quantize the sun's azimuth into 24 buckets. The sun completes a
    // revolution roughly every 8-9 minutes of play, so this re-bakes
    // about every 20 seconds — frequent enough that reflections track
    // the light, rare enough that the cost is invisible.
    const bucket = Math.floor(((this._sunAngle || 0) / (Math.PI * 2)) * 24);
    // The ground half of the environment takes the path's TERRAIN
    // tint, not its sky zenith. It stands in for light bouncing off
    // the ground back onto the undersides of things, so it has to be
    // the colour of the ground — using a sky colour here lit every
    // overhang and chin with skylight from below, which is the exact
    // "floating over a lightbox" artefact the ground disc exists to
    // prevent.
    this._ibl.bake(`${this.path}:${bucket}`, this.palette.terrain.tint);
  }

  /** Switch the whole world to a path's weather. */
  apply(pathId) {
    const base = SKIES[pathId] || SKIES.hell;
    this.path = pathId;
    // Blend the dominant trait over the base palette. A shallow copy
    // with the blended fields replaced — the palette object is read all
    // over this file and elsewhere, so it must keep every other key.
    const t = this._trait ? TRAIT_SKIES[this._trait] : null;
    const p = t ? { ...base } : base;
    if (!t) this._traitSaturation = 1;
    if (t) {
      const w = this._traitWeight;
      const mix = (a, b) => new THREE.Color(a).lerp(new THREE.Color(b), w).getHex();
      p.zenith    = mix(base.zenith, t.zenith);
      p.horizonC  = mix(base.horizonC, t.horizon);
      p.glow      = mix(base.glow, t.glow);
      p.fogDensity = base.fogDensity * (1 + (t.fog - 1) * w);
      p.exposure  = base.exposure * (1 + (t.exposure - 1) * w);
      // ⚠️ Saturation is NOT part of the palette's grade block — it
      // lives on the CinematicGrade pass (uSaturation, set by
      // applyGradePreset). Writing a `saturation` key here would add a
      // field nothing reads and look like it worked. Exposed as a
      // multiplier instead, and applied by main.js's syncGrade() AFTER
      // applyGradePreset has set the path's base value.
      p.grade = { ...base.grade };
      this._traitSaturation = 1 + (t.sat - 1) * w;
      // ⚠️ A trait no longer REPAINTS the sky — a physical sky has no
      // zenith colour to swap. It changes the AIR instead: thick-air
      // elements (void, shadow, poison) raise the haze, clear-air ones
      // (light, wind) lower it, and the horizon picks up the element's
      // hue in update(). Same mechanic — the sky follows what you cast
      // — expressed the way real air changes.
      p.air = { ...base.air, turbidity: base.air.turbidity * (1 + (t.fog - 1) * w * 0.55) };
    }
    this.palette = p;

    if (this.physSky) applyAir(this.physSky, p.air || AIR.hell);
    if (this.sky) {
      const u = this.sky.material.uniforms;
      // uRiftAxis deliberately untouched — see its own comment at
      // init(): the crack's position is part of the world's fixed
      // identity, only its colour changes with the path.
      u.uRiftColor.value.setHex(p.rift.color);
      u.uRiftCore.value.setHex(p.rift.core);
      u.uRiftStrength.value = p.rift.strength;
    }

    if (this.scene?.fog) {
      // Colour comes from the sky itself, in update() via _readSky().
      // ⚠️ min(), not max(). The floor used to be a MINIMUM density
      // that no palette could undercut, because it was hiding the
      // unload boundary. It is now a CEILING: the haze must never get
      // thicker than the "half-strength at the far edge" target, or the
      // curtain comes back. A palette can still be clearer than this.
      this._applyFogRange();
    }

    if (this.renderer) this.renderer.toneMappingExposure = p.exposure;
    if (this.particles) this.particles.material.color.setHex(p.particle);

    const L = this.lights;
    if (L) {
      if (L.ambient) { L.ambient.color.setHex(p.ambient.color); L.ambient.intensity = p.ambient.intensity; }
      if (L.hemi)    { L.hemi.color.setHex(p.hemi.sky); L.hemi.groundColor.setHex(p.hemi.ground); L.hemi.intensity = p.hemi.intensity; }
      if (L.key)     { L.key.color.setHex(p.key.color); L.key.intensity = p.key.intensity; }
      if (L.rim)     { L.rim.color.setHex(p.rim.color); L.rim.intensity = p.rim.intensity; }
    }

    // Precipitation type/colour follows the path. No baseline
    // bookkeeping needed here: weather publishes multipliers and
    // update() re-derives fog and key from the palette every frame, so
    // there is nothing cached that a path switch could invalidate.
    if (weather.enabled) weather.setPath(pathId);

    // A path switch changes every sky colour at once, so force the
    // environment to follow immediately rather than waiting for the
    // next azimuth bucket — otherwise reflections keep showing the
    // *previous* path's sky for up to 20 seconds.
    if (this._ibl?.enabled) {
      this._ibl._lastKey = null;
      this._refreshEnvironment();
      // apply() has just overwritten the ambient pair with this path's
      // full intensities, undoing the IBL compensation. Re-apply it.
      this._ibl.compensateLights({ ambient: L?.ambient, hemi: L?.hemi });
    }

    return p;
  }

  /**
   * Drive the sun. It moves, but it stays low-ish and in-palette —
   * this is weather with a time of day, not a full day/night cycle.
   *
   * The elevation floor matters more than it looks: ground is a
   * horizontal surface, so its lambertian term is dot(up, sunDir) —
   * i.e. it's driven almost entirely by the sun's Y component. The
   * original 0.12–0.32 range ("low, dramatic, never overhead") meant
   * the ground was getting barely 12–32% of the key light's strength
   * at any elevation, which read as "nothing is lit" no matter how
   * high the light's own intensity number was. 0.55–0.72 keeps the
   * long moody shadows but actually illuminates the floor.
   */
  update(dt, cameraPosition) {
    this._time += dt;
    if (this.moon3d && cameraPosition) this.moon3d.update(dt, { position: cameraPosition }, this.sunDirection, this.scene?.fog?.color || null);

    // ══════════════════════════════════════════════════════
    // ⚠️ 0.012 → 0.0035. A full day was EIGHT AND A HALF MINUTES.
    //
    // 2π / 0.012 = 524 seconds. The sun crossed the whole sky twice in
    // a quarter of an hour, so shadows visibly swept across the ground
    // while the player stood still and the sky changed colour faster
    // than any weather could. Owner: *"doesn't feel like a game nor
    // real life."* A day you can watch move is the single strongest
    // signal that a world is a toy.
    //
    // 2π / 0.0035 = **1795 seconds ≈ 30 minutes**, which is in the
    // range this genre has converged on for good reason: long enough
    // that the light feels like a condition you are in rather than an
    // animation playing at you, short enough that a session still
    // sees night fall.
    //
    // ⚠️ Nothing else needs retuning for this. Every consumer of the
    // cycle reads `_sunAngle` or the derived direction, never elapsed
    // time, so they all stretch with it — and `_refreshEnvironment`
    // is bucketed off the sun direction, so a slower sun makes it
    // fire LESS often, not more.
    // ══════════════════════════════════════════════════════
    const a = this._time * 0.0035;
    this._sunAngle = a % (Math.PI * 2);
    // ⚠️ LOWER THAN IT WAS (0.62 → ~0.42 before normalising, about
    // 30° up). The old high sun was there to light the ground through
    // a weak ambient; with the sky now lighting the scene through the
    // IBL and a real hemisphere, a lower sun gives what RŌNIN's frames
    // have and these did not — long shadows, a warm low key, and a
    // horizon that brightens toward the sun.
    const dir = new THREE.Vector3(
      Math.cos(a) * 0.82,
      0.42 + Math.sin(a * 0.5) * 0.08,
      Math.sin(a) * 0.82
    ).normalize();

    if (this.sky) {
      this.sky.material.uniforms.uTime.value = this._time;
      if (cameraPosition) this.sky.position.copy(cameraPosition);
    }
    if (this.physSky) {
      const u = this.physSky.material.uniforms;
      u.sunPosition.value.copy(dir);
      if (u.time) u.time.value = this._time;
      if (cameraPosition) this.physSky.position.copy(cameraPosition);
    }
    // ── READ THE LIGHT OFF THE SKY ───────────────────────
    // See PhysicalSky.js: the same scattering model, on the CPU. The
    // fog fades into the sky's real horizon, the hemisphere is lit by
    // its real zenith, and the sun's colour is what survives the air.
    this._readSky(dir);

    // Keep the environment map tracking the sun. Deduped by bucket, so
    // this is a cheap early-out on the overwhelming majority of frames.
    this._refreshEnvironment();

    // Weather rides on this same update because it needs exactly what
    // this function already has in hand: the camera position (to
    // recentre the precipitation volume) and the light rig (to dim the
    // key as a storm rolls in). Driving it from main.js instead would
    // mean plumbing both through a second call site for no gain.
    //
    // Runs BEFORE the unease flicker below, so that the flicker
    // multiplies whatever intensity the weather has settled on rather
    // than the two fighting over key.intensity.
    weather.update(dt, cameraPosition, this.lights);

    // The sun direction is what the god-ray pass needs to know where to
    // put its light source on screen; publish it rather than making
    // main.js recompute the same angle from the same clock.
    this.sunDirection = dir;
    // The moon is lit by this same sun (phases).
    if (this.sky?.material?.uniforms?.uMoonSun) this.sky.material.uniforms.uMoonSun.value.copy(dir);

    const key = this.lights?.key;
    if (key && cameraPosition) {
      // ── ⚠️ SNAPPED, NOT CONTINUOUS ──
      //
      // Keeping the shadow frustum centred on the player is correct;
      // doing it EVERY FRAME was the lag while moving.
      //
      // Moving a shadow camera by any amount invalidates the shadow
      // map, so the whole scene re-renders into a 2048² VSM map with
      // 16-sample blur every single frame the player is walking.
      // Measured: render 7.3ms standing still vs 21.1ms moving, with
      // chunk update and chunk building both at 0ms — the entire
      // difference was here.
      //
      // Snapping to a 6-unit grid means the map is only re-rendered
      // when the player crosses a cell, so most frames reuse it. The
      // frustum is 58 units wide (shadowRadius), so a 6-unit slop is
      // nowhere near its edge and nothing pops.
      const SNAP = 6;
      const sx = Math.round(cameraPosition.x / SNAP) * SNAP;
      const sz = Math.round(cameraPosition.z / SNAP) * SNAP;
      if (sx !== this._shadowAnchorX || sz !== this._shadowAnchorZ) {
        this._shadowAnchorX = sx;
        this._shadowAnchorZ = sz;
        _shadowAnchor.set(sx, cameraPosition.y, sz);
        key.position.copy(_shadowAnchor).addScaledVector(dir, 120);
        key.target.position.copy(_shadowAnchor);
        key.target.updateMatrixWorld();
      }
    }

    const rim = this.lights?.rim;
    if (rim && cameraPosition) {
      // Was aimed at world-origin (0,0,0) forever, since its .target
      // was never added to the scene graph — matrixWorld never got
      // recomputed, so as soon as the player walked away from spawn
      // this light was firing in a near-random direction and doing
      // almost nothing. Track the player like the key light does.
      rim.position.copy(cameraPosition).addScaledVector(dir, -90).setY(cameraPosition.y + 40);
      rim.target.position.copy(cameraPosition);
      rim.target.updateMatrixWorld();
    }

    // Unease — standing on volatile ground makes the key light itself
    // unsteady: an irregular, arrhythmic dimming rather than a clean
    // sine flicker, so it reads as "wrong" rather than "broken bulb".
    // Recomputed from the palette's own base intensity every frame
    // rather than accumulated, so it can never drift the light dimmer
    // permanently or fight with a path change.
    if (key) {
      // Composed, not overwritten. Both the unease flicker and the
      // weather dimming want to scale the key light, and both are
      // expressed as factors on the palette's value so neither can
      // stomp the other — which is what would happen if either one
      // assigned key.intensity from its own baseline.
      let flicker = 1;
      if (this._unease > 0.01) {
        const n = Math.sin(this._time * 23.0) * 0.5 + Math.sin(this._time * 61.0) * 0.3 + Math.random() * 0.4 - 0.2;
        flicker = 1 - Math.max(0, Math.min(1, n)) * this._unease * 0.4;
      }
      // Inside the Sanctuary the key light comes UP and the unease
      // flicker is suppressed entirely. The hub is meant to read as a
      // regular, safe RPG town — the dark-fantasy grade is what you
      // walk OUT into, and it lands far harder for having somewhere
      // safe to be compared against.
      // Raised from 0.65 to take over the brightening job that ambient
      // was doing badly — the key light is directional, so more of it
      // brightens AND deepens contrast rather than flattening it.
      // ── THE TONAL SPLIT ──
      // The Sanctuary lifts the key; a Descent CRUSHES it. This is the
      // owner's brief made mechanical: "keep the spawn normal and
      // regular fantasy… but battles, trials and all dark like a dark
      // fantasy." Both are factors on the same palette value, so the
      // two can never fight — walking a Descent open next to the hub
      // correctly reads as the dark winning, because 0.45 beats 1.95.
      const sanctKey = 1 + this._sanctuary * 0.95;
      // ⚠️ 0.34, not 0.55 (key ×0.66 at full Descent, was ×0.45).
      // The tonal split is intact and deliberate — a Descent must
      // still read as markedly darker than the surface — but 0.45 was
      // set when the air was thin. It now stacks with a much thicker
      // base fog AND with a Descent's own fog thickening, and the
      // three together did not read as dark, they read as blind.
      // "A fight you cannot see is not atmospheric, it is broken" is
      // this file's own rule. Real point lights (DescentSystem's
      // pyres) now carry the mood instead of raw crush.
      // ⚠️ WORLD EXPANSION: a deep cave is DARK — the sun all but gone,
      // the lantern and the glowing things in the rock are the light.
      const descentKey = (1 - this._descentAmount * 0.34) * (1 - (this._caveDark || 0) * 0.94);
      const flick = 1 - (1 - flicker) * (1 - this._sanctuary);
      key.intensity = this.palette.key.intensity * flick * weather.keyMultiplier * sanctKey * descentKey;
    }

    // The Sanctuary also lifts the two lights that act as the
    // visibility FLOOR (see the palette comments) — this is what stops
    // the hub's interiors and doorways reading as black holes, which
    // is correct dread out in the world and wrong inside the walls.
    // ⚠️ These multipliers were +0.9 / +0.7 and that was too much.
    // Ambient is DIRECTIONLESS: raising it does not make a scene
    // brighter so much as flatter, because it lifts the shadowed side
    // of every surface toward the lit side and destroys the form
    // reading that shading provides. The Sanctuary came out looking
    // washed and papery rather than warm.
    //
    // The warmth now comes from the key light and the eight braziers
    // (which are real point lights and DO have direction), and ambient
    // only lifts enough to stop doorways being black holes.
    // A Descent takes the visibility floor down with it. Not to zero —
    // the floor exists so shadowed geometry is not a black hole, and a
    // fight you cannot see is not atmospheric, it is broken — but far
    // enough that the element's own emissive light and the boundary
    // become the things you navigate by.
    // ⚠️ 0.26, not 0.45 (floor ×0.74 at full Descent, was ×0.55). Same
    // reasoning as descentKey above. The floor is what stops shadowed
    // geometry being a black hole, and it was doing that job at the
    // old value only because the air used to be clear.
    const descentFloor = (1 - this._descentAmount * 0.26) * (1 - (this._caveDark || 0) * 0.82);
    if (this.lights?.ambient) {
      this.lights.ambient.intensity =
        this.palette.ambient.intensity * (1 + this._sanctuary * 0.35) * descentFloor;
    }
    if (this.lights?.hemi) {
      this.lights.hemi.intensity =
        this.palette.hemi.intensity * (1 + this._sanctuary * 0.3) * descentFloor;
    }

    // Fog is composed here, once, from three independent contributors:
    //   palette   — the path's own weather (Atmosphere)
    //   biome     — how thick the air is in this place (ChunkManager)
    //   weather   — whether a storm is rolling in (Weather)
    // Each publishes a factor; this is the only line that writes
    // fog.density. The floor still applies so lowering draw distance
    // can never expose the chunk unload boundary.
    if (this.scene?.fog) {
      // ⚠️ min(), matching apply(). This line runs EVERY FRAME and is
      // the actual authority on fog density — leaving it as max() while
      // apply() used min() meant the curtain came straight back one
      // frame after any palette change, which is exactly the kind of
      // two-writers-disagreeing bug §4's fog contract exists to stop.
      // ── Fog RANGE, composed from the same factors as before ──
      // Everything that used to multiply density now multiplies how
      // EARLY the fog starts. A thicker contributor pulls `near` in
      // toward the player; a clearer one pushes it out. `far` stays
      // pinned to the world edge so the boundary is always covered.
      const thickness =
        this._biomeFog *
        weather.fogMultiplier *
        // ⚠️ 0.22, not 0.8. A Descent is a BOUNDED arena a few dozen
        // units across, not an open vista — thickening its air by 1.8×
        // on top of an already-thicker base pulled `near` in to ~22
        // units, i.e. 82% of the view was inside the fog and the
        // Warden was invisible until it was hitting you. The Descent
        // still reads as closer air, just not as a wall.
        (1 + this._descentAmount * 0.22) *    // Descents close in
        (1 + (this._caveDark || 0) * 1.6) *   // a cave's air is close and black
        (1 - this._sanctuary * 0.55) *        // the hub clears
        (this.palette.fogDensity / 0.0026) *  // the trait's own multiplier
        this._fogStrength;                    // the global dial
      this._applyFogRange(thickness);
      // Mist reads the SAME composed thickness — see _updateGroundMist.
      this._updateGroundMist(cameraPosition, thickness);

      // The fog COLOUR is a blend away from the path's own horizon
      // colour, not an assignment — at amount 0 it is exactly what
      // apply() set (palette.horizonC, see line ~380), at amount 1 it
      // is the element's. Re-set from horizonC on the zero branch too,
      // so clearing a Descent restores the path's air rather than
      // leaving it stained at whatever the last frame blended to.
      if (this._caveDark > 0) {
        this.scene.fog.color.copy(this._skyHorizon).lerp(_CAVE_FOG, this._caveDark * 0.95);
      } else if (this._descentTint && this._descentAmount > 0) {
        this.scene.fog.color.copy(this._skyHorizon).lerp(this._descentTint, this._descentAmount * 0.75);
      } else {
        this.scene.fog.color.copy(this._skyHorizon);
      }
      // ── Pull the haze off full saturation ────────────────
      // ⚠️ Fog colour tracks the horizon so distant terrain dissolves
      // into the sky instead of ending on a mismatched band — that
      // part is right and must stay. But taking the horizon at FULL
      // saturation means every pixel past `near` is pushed toward one
      // vivid hue, and with the thicker air that is now most of the
      // frame: a Frozen Tundra whose ground is #90a8c8 rendered solid
      // ember, because the fog over it was solid ember. Real aerial
      // haze desaturates what it covers; it does not paint it.
      // Small (22%) on purpose — enough to stop the hue flooding, far
      // too little to show as a seam against the sky it still matches.
      const fc = this.scene.fog.color;
      fc.lerp(_FOG_SCRATCH.setRGB(
        fc.r * 0.2126 + fc.g * 0.7152 + fc.b * 0.0722,
        fc.r * 0.2126 + fc.g * 0.7152 + fc.b * 0.0722,
        fc.r * 0.2126 + fc.g * 0.7152 + fc.b * 0.0722,
      ), 0.22);
      // Warm the haze toward hearth-light inside the walls, on TOP of
      // whichever branch above ran — so a Descent opened next to the
      // hub still reads as the Descent's colour, just warmer.
      if (this._sanctuary > 0) {
        this.scene.fog.color.lerp(SANCTUARY_HAZE, this._sanctuary * 0.6);
      }
    }
  }

  /**
   * Biomes nudge how thick the air is. Called by ChunkManager on biome
   * change; composed into the density above rather than written
   * straight to the fog, so it survives the per-frame recomposition.
   */
  /**
   * Derive fog, hemisphere and key colours from the physical sky.
   *
   * ⚠️ ONE WRITER of these colours, every frame: the sky. The palette's
   * hex values are now only fallbacks for a tier with no physical sky.
   * ⚠️ Trait hue is applied as a HUE at the horizon's own brightness,
   * not as a raw colour — the trait table holds display colours (an
   * ember 0xff7a3a), and lerping the linear horizon toward that raw
   * value would brighten the fog as well as tint it.
   */
  _readSky(sunDir) {
    const air = this.palette.air || AIR.hell;
    this._skyHorizon = this._skyHorizon || new THREE.Color();
    this._skyZenith = this._skyZenith || new THREE.Color();
    this._sunCol = this._sunCol || new THREE.Color();
    horizonColor(sunDir, air, this._skyHorizon);
    // ⚠️ GROUND HAZE IS DARKER THAN THE SKY BAND ABOVE IT. Fog that
    // took the horizon's full radiance washed every trial white — the
    // trial pulls its fog band close (a 1-chunk draw distance, fog
    // doubled), so near terrain faded into the brightest part of the
    // sky. The haze a few metres off the ground is lit by the same sun
    // and sky but sees darker ground beneath it, so it reads a good
    // deal dimmer than the sky at the horizon. Measured by eye against
    // RŌNIN's frames, not derived.
    this._skyHorizon.multiplyScalar(0.58);
    zenithColor(sunDir, air, this._skyZenith);
    sunColor(sunDir, air, this._sunCol);

    if (this._trait && this._traitWeight > 0) {
      const t = TRAIT_SKIES[this._trait];
      const h = this._skyHorizon;
      const lum = h.r * 0.2126 + h.g * 0.7152 + h.b * 0.0722;
      const tc = _FOG_SCRATCH.setHex(t.horizon);
      const tl = Math.max(1e-4, tc.r * 0.2126 + tc.g * 0.7152 + tc.b * 0.0722);
      tc.multiplyScalar(lum / tl);
      h.lerp(tc, this._traitWeight * 0.35);
    }

    const L = this.lights;
    if (!L) return;
    // Light COLOURS want unit brightness — intensity is the palette's.
    // ⚠️ Only a LEAN toward the sky's hue. Normalising the zenith to
    // unit brightness made the hemisphere light (0.4, 0.6, 1.0) — pure
    // blue fill — and every surface in shadow went cold blue. Real
    // skylight is bluish, but the ground bounces warm light back into
    // the same shadows; a 45% lean toward the sky's hue keeps both.
    const unit = (c, out, lean = 0.45) => {
      const m = Math.max(c.r, c.g, c.b, 1e-6);
      return out.setRGB(1 + (c.r / m - 1) * lean, 1 + (c.g / m - 1) * lean, 1 + (c.b / m - 1) * lean);
    };
    if (L.key) L.key.color.copy(this._sunCol);
    if (L.hemi) unit(this._skyZenith, L.hemi.color);
    if (L.ambient) unit(this._skyHorizon, L.ambient.color);
  }

  setBiomeFog(multiplier) {
    this._biomeFog = Math.max(0.1, multiplier || 1);
  }

  /**
   * 0..1 — how volatile the ground the player is standing on is (see
   * SaturationSystem.js). Purely a light-flicker cue; never touches
   * damage, spawns, or anything mechanical. Restrained horror, not a
   * hazard.
   */
  setUnease(amount) {
    this._unease = Math.max(0, Math.min(1, amount));
  }

  /**
   * A Descent re-tints the air in its element's colour while it is
   * open. Published as a factor + colour, composed in update() — same
   * contract as setBiomeFog/setUnease, for the same reason (HANDOFF
   * §4: two systems that both WROTE fog.density silently erased each
   * other, twice).
   *
   * @param {number|null} colorHex null to clear
   * @param {number} amount 0..1
   */
  /**
   * How sheltered the player currently is, 0 (open world) … 1 (standing
   * in the plaza). Published by main.js every frame from distance to
   * spawn; see this method's field note in the constructor.
   */
  /**
   * Re-colour the world for a dominant trait.
   *
   * @param {string|null} element dominant attunement, null to clear
   * @param {number} share 0..1 — its share of the profile, used as the
   *   blend weight so an uncommitted caster barely shifts the sky
   */
  applyTrait(element, share) {
    const next = TRAIT_SKIES[element] ? element : null;
    const w = next ? Math.max(0, Math.min(1, share || 0)) : 0;
    // ⚠️ Only re-apply when it MEANS something. apply() re-bakes the
    // IBL cubemap, so calling this every frame from the update loop
    // would re-bake the environment map continuously. 0.04 is below
    // perceptible and far above the noise floor of a decaying profile.
    if (next === this._trait && Math.abs(w - this._traitWeight) < 0.04) return;
    this._trait = next;
    this._traitWeight = w;
    this.apply(this.path);
  }

  /** The blended trait palette, or the base one when uncommitted. */
  get trait() { return this._trait; }

  /** Multiplier the grade pass should apply on top of its preset. */
  get traitSaturation() { return this._traitSaturation; }

  setSanctuary(amount) {
    this._sanctuary = Math.max(0, Math.min(1, amount || 0));
  }

  /** 0..1 — read by main.js to suppress the dread/unease overlays. */
  get sanctuary() { return this._sanctuary; }

  /** 0..1 — inside a deep cave (systems/CaveSystem.js). A factor, like the rest. */
  setCaveDark(amount) { this._caveDark = Math.max(0, Math.min(1, amount || 0)); }

  setDescentTint(colorHex, amount) {
    if (colorHex === null || !amount) {
      this._descentTint = null;
      this._descentAmount = 0;
      return;
    }
    this._descentTint = new THREE.Color(colorHex);
    this._descentAmount = Math.max(0, Math.min(1, amount));
  }

  /**
   * Tie fog to how far terrain is actually kept loaded, so lowering
   * render distance for performance hides its own edge instead of
   * showing up as chunks visibly popping in and out.
   *
   * FogExp2's falloff is `exp(-(density·dist)²)`, gentle near the
   * camera and steep further out — exactly the shape we want: barely
   * touches nearby visibility, but is ~95% opaque by the time it
   * reaches the unload boundary.
   */
  /**
   * Set the fog's near/far from the draw distance and a thickness
   * factor.
   *
   * `far` sits just inside the world edge so the last visible chunk
   * fades out rather than popping. `near` is a FRACTION of far, so a
   * "thicker" atmosphere brings the haze closer without ever reaching
   * the player — clamped so it can never come nearer than 18 units,
   * which is the guarantee that fog never blocks the view.
   */
  _applyFogRange(thickness = 1) {
    if (!this.scene?.fog) return;
    const far = Math.max(60, this.drawDistance * 0.96);
    const t = Math.max(0.25, Math.min(3, thickness));
    // Thick → near collapses toward 0.18 of far. Clear → out to 0.68.
    //
    // Both ends pulled in from (0.28 … 0.75 / 0.62) on the owner's
    // "add fog" note. The old window started the haze at ~74% of the
    // draw distance in ordinary air, which is so far out that on a
    // clear palette there was effectively no fog in play at all — it
    // only ever showed on the last slice of the horizon.
    //
    // ⚠️ Base 0.52, not the 0.42 this pass first used. 0.42 put ~58% of
    // the view inside the haze, which is past the point where fog
    // stops adding depth and starts erasing the thing it is meant to
    // add depth TO — every biome's ground colour went with it. ~48%
    // keeps the near and middle distance showing true terrain colour
    // while the far half still clearly reads as weather.
    //
    // ⚠️ `far` is still pinned to the world edge, so this makes the air
    // thicker WITHOUT re-creating the curtain that used to hide the
    // unload boundary: the boundary stays covered either way, and the
    // world does not get smaller. That distinction is the whole of
    // HANDOFF §4's fog note — the failure was fog sized to hide a
    // too-near boundary, not fog itself.
    const ratio = Math.max(0.18, Math.min(0.68, 0.52 / t));
    // ⚠️ A hard floor in WORLD UNITS on top of the ratio. The ratio
    // alone is relative to `far`, so a short draw distance and a thick
    // palette could still multiply out to fog starting almost at the
    // camera. 45 units is roughly "the far side of a Descent arena" —
    // past this point fog stops being depth and starts being a
    // blindfold, and no combination of contributors may cross it.
    this.scene.fog.near = Math.max(45, far * ratio);
    this.scene.fog.far = Math.max(this.scene.fog.near + 40, far);
  }

  /**
   * `?fog=` on the URL, remembered afterwards. 1 = the tuned default.
   * Deliberately the same shape as Quality's `?q=` and the peace-mode
   * pref, because a third convention for "an override you can set from
   * the address bar and forget" would be one too many.
   */
  _readFogPref() {
    try {
      const q = new URLSearchParams(location.search).get('fog');
      if (q !== null) {
        const v = Math.max(0, Math.min(3, parseFloat(q)));
        if (Number.isFinite(v)) { localStorage.setItem('mz_fog', String(v)); return v; }
      }
      const stored = parseFloat(localStorage.getItem('mz_fog'));
      return Number.isFinite(stored) ? Math.max(0, Math.min(3, stored)) : 1;
    } catch { return 1; }
  }

  /** Set how thick the air reads. Affects distance fog AND mist. */
  setFogStrength(v) {
    this._fogStrength = Math.max(0, Math.min(3, v));
    try { localStorage.setItem('mz_fog', String(this._fogStrength)); } catch { /* private mode */ }
    return this._fogStrength;
  }

  setDrawDistance(units) {
    this.drawDistance = units;

    // ── ⚠️ FOG IS NO LONGER A WALL ──
    //
    // This used to compute a fog floor dense enough to be fully opaque
    // at 88% of the draw distance — a deliberate curtain hiding the
    // chunk unload boundary. With RENDER_DISTANCE = 1 that boundary was
    // ~96m away, so the curtain sat almost on the player's face and
    // everything past a short radius was grey soup. "Everything is
    // foggy" and "the world feels small" were one bug.
    //
    // The owner's call, and it is the right one: show the edge instead
    // of hiding it, the way Minecraft does. Chunks simply stop, sky
    // beyond. Fog is now light aerial haze for depth cues only, tuned
    // to be roughly HALF-strength at the far edge rather than opaque
    // well before it — so distance still reads, and the world stops
    // ending three steps away.
    //
    // 0.69 ≈ -ln(0.5) — the FogExp2 density that reaches 50% at
    // `targetDist`. Derived rather than hand-tuned so raising the
    // render distance keeps the same *look* instead of needing a new
    // magic number.
    this._applyFogRange();
    this.apply(this.path); // re-apply so the new range takes effect now
  }

  /** Terrain grading, so the ground sits in the same world as the sky. */
  gradeColor(color) {
    const p = this.palette.terrain;
    const c = color.clone();
    const grey = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
    c.lerp(new THREE.Color(grey, grey, grey), p.desaturate);
    c.lerp(new THREE.Color(p.tint), p.tintAmount);
    // ── ALBEDO KNEE — the realism pass ─────────────────────
    // ⚠️ Biome palettes were tuned under the old dark grade, so their
    // bright bands (bone 0xc0b6a4, snow 0xd8dde3, silver 0xa8b4c2) are
    // 0.45–0.7 linear reflectance: fresh snow and chalk. Lit by a real
    // sun they read as white marble — measured exactly that way in
    // Godgrave and the Hollow Mountains. Real ground (soil, ash, stone,
    // weathered bone) sits between ~0.08 and ~0.30.
    // A soft knee, not a clamp: everything below 0.20 is untouched, so
    // dark biomes keep their exact colour, and above it the excess is
    // kept at 35% — the bright regions stay the brightest, they just
    // stop being paper. Hue is preserved (uniform scale per colour).
    const lum = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
    const K = 0.20;
    if (lum > K) c.multiplyScalar((K + (lum - K) * 0.35) / lum);
    return c;
  }

  /** SceneManager hands its mote system over so it can be re-tinted. */
  bindParticles(points) { this.particles = points; this.apply(this.path); }

  particleColor() { return this.palette.particle; }
  gradeSettings() { return this.palette.grade; }
}

export const atmosphere = new Atmosphere();
