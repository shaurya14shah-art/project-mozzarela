// ══════════════════════════════════════════════════════════
// Quality — one place that decides how expensive the frame is
//
// The project used to ship exactly one target: a single-file Claude
// Artifact under a hard 16MB ceiling, running on whatever machine
// opened the link. Every rendering decision was therefore tuned for
// the worst plausible case — 1024² shadows, quarter-res bloom, no
// ambient occlusion, pixel ratio capped at 1.3, and zero external
// assets.
//
// The HD build has none of those constraints. It runs locally, from a
// dev server or a built folder, on a known machine, and can stream in
// as many megabytes of PBR texture data as it likes. So the renderer
// needs to stop being one fixed configuration and start being a tier.
//
// Tiers, cheapest to most expensive:
//
//   low     — parity with the old artifact build. No AO, no IBL, no
//             HD textures. This is the *floor*, and it is what any
//             machine that fails detection gets.
//   medium  — IBL + HD textures, still no screen-space AO.
//   high    — adds GTAO and better shadows. The default for the HD
//             build on anything with a real GPU.
//   ultra   — adds temporal AA, depth of field, higher pixel ratio,
//             and 2048² shadows. Intended for a desktop GPU.
//
// Two escape hatches, because auto-detection is a heuristic and will
// occasionally be wrong:
//   ?q=low|medium|high|ultra   — force a tier via the URL
//   localStorage 'mz.quality'  — sticky override across reloads
//
// Nothing here touches the scene graph, so unlike ModelLibrary et al
// this one is safe to construct at import time.
// ══════════════════════════════════════════════════════════

export const TIERS = ['low', 'medium', 'high', 'ultra'];

/**
 * Per-tier render settings. Read these rather than hardcoding numbers
 * at the call site, so a tier change actually moves everything at once.
 */
const PRESETS = {
  low: {
    pixelRatioCap:   1.0,
    shadowMapSize:   1024,
    shadowRadius:    42,     // half-extent of the sun's ortho frustum
    // Image-based lighting: reflections and ambient come from an
    // environment map instead of a flat AmbientLight term. This is the
    // single largest realism lever available, and it costs one PMREM
    // convolution at load (plus a re-bake when the sky changes), not
    // per-frame time. It is off at `low` only to preserve exact parity
    // with the shipped artifact build.
    ibl:             false,
    iblIntensity:    0,
    hdTextures:      false,
    ao:              false,
    aoRadius:        0,
    taa:             false,
    dof:             false,
    bloomDiv:        4,
    anisotropy:      1,
    godRays:         false,
    // Vertices per chunk edge. The chunk is 64 world units, so 24 puts
    // a vertex every 2.67m — triangles big enough to READ as triangles,
    // which is the single largest reason the ground looked faceted and
    // blocky. Kept at 24 here only for artifact parity.
    chunkResolution: 24,
    // ── RENDER DISTANCE, in chunks each way ──
    // ⚠️ This was a single hardcoded WORLD.RENDER_DISTANCE = 1 — a 3×3
    // grid, 192 units across. The entire world was 192m wide, and thick
    // fog existed to hide an unload boundary that was ~96m from the
    // player's face. That is backwards: the fog was a symptom of the
    // tiny world, and "everything is foggy" and "the world feels small"
    // were the same bug.
    //
    // Now tier-driven, and the fog is a light haze rather than a wall
    // (see Atmosphere.setDrawDistance). Terrain is ONE DRAW CALL per
    // chunk, so the cost here is triangles and chunk-build time, both
    // of which are already budgeted (drainChunkQueue).
    // ── RENDER DISTANCE (terrain) vs DECORATION DISTANCE (props) ──
    //
    // ⚠️ These are two different numbers ON PURPOSE, and conflating
    // them is expensive. Measured at renderDistance 6 with decorations
    // everywhere: 169 chunks, **13,194 meshes and 11.3 MILLION
    // triangles**. 13k meshes is 13k draw calls — instantly the worst
    // performance regression in the project's history.
    //
    // Terrain is ONE draw call per chunk and is what makes the world
    // feel big, so it can go far. Props are ~78 meshes per chunk and
    // are only legible up close, so they stop much sooner. This is
    // exactly what Minecraft does — distant terrain, near detail — and
    // it is what lets the fog become haze instead of a curtain without
    // paying for it in frames.
    //
    // Measured at ultra, 704m-wide world, counting only ACTUALLY-VISIBLE
    // meshes (⚠️ Object3D.traverse does NOT prune hidden subtrees — a
    // child reports .visible === true under a hidden parent, which
    // inflated the first measurement by 3.5x):
    //     decorationDistance 1 →   962 meshes / 1.8M tris
    //     decorationDistance 2 → 1,895 meshes / 2.4M tris   ← chosen
    //     decorationDistance 3 → 3,628 meshes / 3.5M tris
    //     (no culling at all   → 13,194 meshes / 11.3M tris)
    renderDistance:  2,
    decorationDistance: 1,
    // Subdivision level for the icosahedra that props are built from.
    // 0 = a 20-face die. Every rock in the world was one of these.
    propDetail:      0,
    // How many distinct noise-displaced variants to generate per prop
    // shape. 1 = every rock in the world is literally the same mesh.
    propVariants:    1,
    // Scatter grid step in world units; SMALLER = denser. 9 -> 8x8=64
    // candidate cells per chunk. See getDecorationPositions().
    scatterStep:     9,
  },
  medium: {
    pixelRatioCap:   1.0,
    shadowMapSize:   1536,
    shadowRadius:    48,
    ibl:             true,
    iblIntensity:    0.55,
    hdTextures:      true,
    ao:              false,
    aoRadius:        0,
    taa:             false,
    dof:             false,
    bloomDiv:        3,
    anisotropy:      4,
    godRays:         false,
    chunkResolution: 40,
    renderDistance:  2,
    decorationDistance: 1,
    propDetail:      1,
    propVariants:    6,
    scatterStep:     7,
  },
  high: {
    pixelRatioCap:   1.15,
    shadowMapSize:   2048,
    shadowRadius:    52,
    ibl:             true,
    iblIntensity:    0.7,
    hdTextures:      true,
    ao:              true,
    // GTAO radius in world units. The world's scale reference is a
    // 1.62m eye height (CAMERA.EYE_HEIGHT), so ~0.5m of occlusion
    // gather reads as contact shadow under props and in crevices
    // without darkening whole hillsides into mud.
    aoRadius:        0.5,
    taa:             false,
    dof:             false,
    bloomDiv:        2,
    anisotropy:      8,
    godRays:         true,
    chunkResolution: 64,
    renderDistance:  2,
    decorationDistance: 2,
    propDetail:      2,
    propVariants:    10,
    scatterStep:     6,
  },
  ultra: {
    // 2.0 was rendering 2880x1800 = 5.2 MEGAPIXELS through six
    // fullscreen post passes. On a retina panel that is by far the most
    // expensive single setting in the game, and the visual difference
    // between 1.5 and 2.0 is small once SMAA is doing edge
    // reconstruction. Dropped after the owner reported lag that could
    // not be reproduced in the dev environment — when in doubt, spend
    // the pixels you can prove you need.
    // ⚠️ 1.25, down from 1.5. §7 records pixel ratio as THE single most
    // expensive setting in the game — every post pass is fullscreen, so
    // cost scales with the SQUARE of this number. 1.5 → 1.25 is a 31%
    // cut in every fullscreen pass at once, which is a bigger win than
    // any individual pass optimisation available.
    //
    // Safe to drop because linear fog now hides the world edge again
    // (see Atmosphere.setDrawDistance) and SMAA reconstructs edges.
    pixelRatioCap:   1.25,
    shadowMapSize:   2048,
    shadowRadius:    58,
    ibl:             true,
    iblIntensity:    0.8,
    hdTextures:      true,
    ao:              true,
    aoRadius:        0.55,
    taa:             true,
    dof:             true,
    bloomDiv:        2,
    anisotropy:      16,
    godRays:         true,
    chunkResolution: 72,
    renderDistance:  3,
    decorationDistance: 2,
    // 3, not 2 — ultra exists to spend budget on looking good, and
    // propDetail is the cheapest place to spend it: it costs
    // triangles on a few dozen CACHED geometries, never draw calls
    // and never per-frame work. It also crosses GeoForge.seg()'s
    // 18-side floor threshold and unlocks the wider shadow penumbra
    // in SceneManager.
    propDetail:      3,
    propVariants:    14,
    scatterStep:     6,
  },
};

class Quality {
  constructor() {
    this.tier = 'high';
    this.settings = PRESETS.high;
    this._detected = null;
    this._listeners = new Set();
    // Set true by MaterialLibrary once it has confirmed the HD texture
    // set is actually on disk and fetchable. Code that wants HD
    // materials must check THIS, not settings.hdTextures — the tier
    // only expresses intent, this expresses reality.
    this.hdAssetsAvailable = false;
  }

  /**
   * Pick a tier. Explicit override wins; otherwise a coarse GPU sniff.
   * Called once from main.js before the renderer is configured.
   */
  init() {
    const forced = this._forcedTier();
    this.tier = forced || this._detectTier();
    this.settings = PRESETS[this.tier];
    console.log(
      `[Quality] tier=${this.tier}${forced ? ' (forced)' : ' (auto)'}`,
      `renderer="${this._detected || 'unknown'}"`
    );
    return this;
  }

  _forcedTier() {
    try {
      const q = new URLSearchParams(location.search).get('q');
      if (q && TIERS.includes(q)) {
        localStorage.setItem('mz.quality', q);
        return q;
      }
      const stored = localStorage.getItem('mz.quality');
      if (stored && TIERS.includes(stored)) return stored;
    } catch {
      // Private-browsing / file:// can throw on localStorage. Not a
      // reason to fail to start a game.
    }
    return null;
  }

  /**
   * Coarse capability sniff. WEBGL_debug_renderer_info is deliberately
   * fuzzed or absent in several browsers now (fingerprinting), so this
   * has to degrade gracefully to "medium" rather than assume a miss
   * means a weak GPU.
   */
  _detectTier() {
    let renderer = '';
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return 'low';          // no WebGL at all — nothing will help
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      renderer = (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '') || '';
      this._detected = renderer;
      // A machine that can't give us enough texture units for a full
      // PBR material stack (albedo+normal+rough+ao+env) has no business
      // on a high tier regardless of what its name says.
      if (gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) < 12) return 'low';
    } catch {
      return 'medium';
    }

    const r = renderer.toLowerCase();

    // Software rasterizers. These will run, very slowly, and the worst
    // outcome is a user concluding the game is broken when it is
    // actually just unaccelerated.
    if (/swiftshader|llvmpipe|software|basic render/.test(r)) return 'low';

    // Apple Silicon reports as "Apple M1/M2/M3/M4...". These were
    // mapped to `ultra`, which turned out to be optimistic: the base
    // (non-Pro/Max) parts share memory bandwidth with the CPU and this
    // pipeline is bandwidth-heavy at high pixel ratios. `high` is the
    // safer landing point, and /quality or ?q=ultra raises it for
    // anyone whose machine can take it.
    if (/apple m\d/.test(r)) return 'high';

    // Discrete desktop parts.
    if (/rtx\s*(30|40|50)|radeon rx (6|7|9)\d{3}/.test(r)) return 'ultra';
    if (/nvidia|geforce|radeon rx|arc a\d/.test(r)) return 'high';

    // Integrated Intel. Iris Xe and newer are usable at medium; older
    // HD/UHD parts are not.
    if (/iris xe|arc graphics/.test(r)) return 'medium';
    if (/intel.*(hd|uhd) graphics/.test(r)) return 'low';

    // Unknown but present GPU — mid tier, and let the adaptive scaler
    // in main.js walk it down if frames are slow.
    return 'medium';
  }

  /** Force a tier at runtime (settings UI, or the console while tuning). */
  setTier(tier) {
    if (!TIERS.includes(tier)) return false;
    this.tier = tier;
    this.settings = PRESETS[tier];
    try { localStorage.setItem('mz.quality', tier); } catch { /* ignore */ }
    for (const fn of this._listeners) {
      try { fn(tier, this.settings); } catch (e) { console.warn('[Quality] listener threw', e); }
    }
    console.log(`[Quality] tier -> ${tier}`);
    return true;
  }

  /** Subscribe to tier changes. Returns an unsubscribe function. */
  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  /** Convenience predicates, so call sites read as prose. */
  get isHD()     { return this.tier !== 'low'; }
  get wantsAO()  { return this.settings.ao; }
  get wantsIBL() { return this.settings.ibl; }
  /** True only when the tier wants HD textures AND they actually loaded. */
  get useHDTextures() { return this.settings.hdTextures && this.hdAssetsAvailable; }
}

export const quality = new Quality();
