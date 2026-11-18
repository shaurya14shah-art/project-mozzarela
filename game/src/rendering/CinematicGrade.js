// ══════════════════════════════════════════════════════════
// CinematicGrade — the dark-fantasy look
//
// Replaces the original grade pass, which did three things: a flat RGB
// tint multiply, a vignette, and a black-floor lift. That is a colour
// wash, not a grade, and a colour wash cannot produce the look the
// owner is asking for ("Elden Ring", "extremely dark dark fantasy").
//
// What actually characterises that look, in order of how much each
// contributes:
//
//   1. A FILMIC CONTRAST CURVE. Crushed shadows and rolled-off
//      highlights. Games that look "flat" or "digital" are almost
//      always missing this — a linear ramp from black to white reads
//      as a render, not as a photograph. The lift/gamma/gain shape
//      here is the same one colourists use.
//
//   2. SPLIT TONING. Shadows pushed cold (blue-green), highlights
//      pushed warm (amber). This single trick is most of why Souls
//      games read as oppressive-but-beautiful rather than muddy: the
//      colour SEPARATION between lit and unlit does the work that
//      saturation would otherwise have to, so the image can be very
//      desaturated overall and still feel rich.
//
//   3. DESATURATION with a saturation floor on bright things, so
//      firelight and spell cores stay vivid while the world around
//      them goes to ash and iron.
//
//   4. ATMOSPHERIC DEPTH CUEING — distant pixels pulled toward the
//      horizon colour beyond what FogExp2 alone does, which is what
//      makes a vista read as vast rather than as a wall of fog.
//
//   5. A heavy, slightly squashed VIGNETTE, plus barely-there
//      CHROMATIC ABERRATION at the extreme edges. Both are lens
//      artefacts; both are doing the job of convincing the eye it is
//      looking through a camera rather than at a viewport.
//
//   6. GRAIN, last, over everything.
//
// Order matters and is not arbitrary: aberration samples the source,
// so it must come first; grain must come last or the curve would
// quantise it into visible bands.
// ══════════════════════════════════════════════════════════

import * as THREE from 'three';

export const CinematicGradeShader = {
  uniforms: {
    tDiffuse:      { value: null },

    // Kept from the original pass so Atmosphere.gradeSettings() and
    // main.js's syncGrade() keep working unchanged.
    uTint:         { value: new THREE.Vector3(1, 1, 1) },
    uVignette:     { value: 0.62 },
    uLift:         { value: 0.012 },
    uTime:         { value: 0 },

    // Filmic curve.
    uContrast:     { value: 1.22 },
    uShadowCrush:  { value: 0.10 },
    uHighlightRoll:{ value: 0.86 },

    // Split toning.
    uShadowTint:   { value: new THREE.Color(0x2a3d4a) },
    uHighlightTint:{ value: new THREE.Color(0xffd9a0) },
    uSplitBalance: { value: 0.42 },
    uSplitStrength:{ value: 0.34 },

    uSaturation:   { value: 0.72 },
    uVibranceFloor:{ value: 0.55 },

    uAberration:   { value: 0.0016 },
    uGrain:        { value: 0.055 },
  },

  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec3  uTint;
    uniform float uVignette;
    uniform float uLift;
    uniform float uTime;

    uniform float uContrast;
    uniform float uShadowCrush;
    uniform float uHighlightRoll;

    uniform vec3  uShadowTint;
    uniform vec3  uHighlightTint;
    uniform float uSplitBalance;
    uniform float uSplitStrength;

    uniform float uSaturation;
    uniform float uVibranceFloor;

    uniform float uAberration;
    uniform float uGrain;

    varying vec2 vUv;

    const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 centred = vUv - 0.5;
      float r2 = dot(centred, centred);

      // ── 1. Chromatic aberration ───────────────────────
      // Scaled by r2, not r: real lens dispersion is negligible at the
      // optical centre and grows fast toward the edge. Using linear
      // distance smears the whole frame and reads as a broken monitor.
      vec3 col;
      if (uAberration > 0.0) {
        vec2 off = centred * uAberration * r2 * 4.0;
        col.r = texture2D(tDiffuse, vUv + off).r;
        col.g = texture2D(tDiffuse, vUv).g;
        col.b = texture2D(tDiffuse, vUv - off).b;
      } else {
        col = texture2D(tDiffuse, vUv).rgb;
      }

      // Path tint, as before.
      col *= uTint;

      // ── 2. Filmic contrast curve ──────────────────────
      // Pivot at 0.18 — mid grey. Pivoting at 0.5 (the naive choice)
      // brightens everything as contrast rises, because almost nothing
      // in a dark scene sits above 0.5.
      col = (col - 0.18) * uContrast + 0.18;

      // Crush the toe. smoothstep from the crush point gives a soft
      // shoulder into black rather than a hard clip, so deep shadow
      // keeps a little separation instead of becoming a flat void.
      col = max(col, vec3(0.0));
      col = col * smoothstep(0.0, uShadowCrush + 0.001, col + uShadowCrush * 0.5);

      // Roll the highlights with a Reinhard-ish shoulder so bright
      // things (spell cores, the sun's glow) compress instead of
      // clipping to flat white.
      col = col / (col + vec3(uHighlightRoll)) * (1.0 + uHighlightRoll);

      // ── 3. Split toning ───────────────────────────────
      float l = dot(col, LUMA);
      // Two complementary masks meeting at uSplitBalance.
      float shadowMask    = 1.0 - smoothstep(0.0, uSplitBalance, l);
      float highlightMask = smoothstep(uSplitBalance, 1.0, l);

      // LUMA-NORMALIZE the tints before applying them.
      //
      // The obvious formulation — "col * tint" — is wrong, and wrong in
      // a way that is easy to miss because the image still looks
      // "graded". A shadow tint like 0x24323f has components around
      // 0.14-0.25, so multiplying by it does not shift the hue of the
      // shadows, it MULTIPLIES THEIR BRIGHTNESS BY ~0.2 and shifts the
      // hue as a side effect. Measured: it cost two thirds of the whole
      // frame's luminance (scene rendered at mean luma 51/255, came out
      // of the grade at 17/255) and made the game unplayably dark while
      // looking, from the code, like a colour operation.
      //
      // Dividing each tint by its own luma gives a colour whose average
      // brightness is exactly 1.0, so multiplying by it is a pure hue
      // rotation — which is what split toning actually is.
      vec3 sTint = uShadowTint    / max(dot(uShadowTint,    LUMA), 1e-3);
      vec3 hTint = uHighlightTint / max(dot(uHighlightTint, LUMA), 1e-3);
      col = mix(col, col * sTint, shadowMask    * uSplitStrength);
      col = mix(col, col * hTint, highlightMask * uSplitStrength * 0.8);

      // ── 4. Saturation ─────────────────────────────────
      // Desaturate the world, but protect anything already vivid —
      // otherwise the same pass that makes the landscape read as ash
      // and iron also kills the elemental colour-coding the game uses
      // to communicate (potions, spell cores, strain glow).
      float lum = dot(col, LUMA);
      float chroma = max(max(col.r, col.g), col.b) - min(min(col.r, col.g), col.b);
      float protect = smoothstep(uVibranceFloor, 1.0, chroma);
      float sat = mix(uSaturation, 1.0, protect);
      col = mix(vec3(lum), col, sat);

      // ── 5. Vignette ───────────────────────────────────
      // Slightly wider horizontally (the 0.85 on x) so it reads as an
      // anamorphic lens rather than a circular porthole.
      vec2 vig = centred * vec2(0.85, 1.0);
      float v = 1.0 - dot(vig, vig) * uVignette * 2.6;
      col *= clamp(v, 0.0, 1.0);

      // Absolute black floor — see the note on "lift" in Atmosphere.js.
      // Applied AFTER the vignette so the corners of the screen are
      // never crushed to true black either.
      col += uLift;

      // ── 6. Grain ──────────────────────────────────────
      // Scaled by (1 - luma): film grain is most visible in the
      // midtones and shadows and almost invisible in highlights.
      // Uniform grain over a bright sky looks like video noise.
      float g = (hash(vUv * vec2(1920.0, 1080.0) + uTime * 60.0) - 0.5) * uGrain;
      col += g * (1.0 - smoothstep(0.0, 0.9, dot(col, LUMA)));

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

/**
 * Per-path grade personalities. Applied on top of whatever
 * Atmosphere.gradeSettings() already provides.
 */
export const GRADE_PRESETS = {
  // ══════════════════════════════════════════════════════════
  // ⚠️ REALISM PASS — graded like RŌNIN, not like a dark-fantasy LUT.
  //
  // This pass runs AFTER OutputPass, on an image ACES has already
  // tone-mapped. The old presets then applied a 1.30 contrast, a
  // shadow crush, and a "highlight roll" of 0.80 — which on a
  // display-referred image is a SECOND tone curve, squeezing every
  // highlight toward the same dull value. Add a 62% split-tone toward
  // amber and cyan and the result was the flat orange-on-teal frame:
  // a filter over the world, not light in it.
  //
  // RŌNIN's grade (world/manga-grade.ts) is the reference: a little
  // desaturation (0.82), a gentle cool-shadow / warm-highlight lean,
  // fine grain, no chromatic aberration. Contrast here is near 1, the
  // crush is a hair, and highlightRoll is large enough that the curve
  // is effectively the identity (x/(x+6)·7 ≈ x across 0..1).
  // The path personalities survive as small differences, not as two
  // different films.
  // ══════════════════════════════════════════════════════════
  hell: {
    contrast:      1.06,
    shadowCrush:   0.018,
    highlightRoll: 6.0,
    shadowTint:    0x5a6a7c,
    highlightTint: 0xffe6c8,
    splitBalance:  0.40,
    splitStrength: 0.16,
    saturation:    0.84,
    aberration:    0.0,
    grain:         0.024,
  },
  heaven: {
    contrast:      1.04,
    shadowCrush:   0.012,
    highlightRoll: 6.0,
    shadowTint:    0x63738a,
    highlightTint: 0xfff2e0,
    splitBalance:  0.44,
    splitStrength: 0.12,
    saturation:    0.88,
    aberration:    0.0,
    grain:         0.020,
  },
};

/** Push a preset's values into a live ShaderPass's uniforms. */
export function applyGradePreset(pass, pathId) {
  const p = GRADE_PRESETS[pathId] || GRADE_PRESETS.hell;
  const u = pass.uniforms;
  u.uContrast.value      = p.contrast;
  u.uShadowCrush.value   = p.shadowCrush;
  u.uHighlightRoll.value = p.highlightRoll;
  u.uShadowTint.value.setHex(p.shadowTint);
  u.uHighlightTint.value.setHex(p.highlightTint);
  u.uSplitBalance.value  = p.splitBalance;
  u.uSplitStrength.value = p.splitStrength;
  u.uSaturation.value    = p.saturation;
  u.uAberration.value    = p.aberration;
  u.uGrain.value         = p.grain;
}
