#!/usr/bin/env node
// ══════════════════════════════════════════════════════════
// fetch-hd-textures — CC0 PBR surface detail for the HD build
//
// Downloads material sets from ambientCG (CC0 1.0, no attribution
// required but we write a LICENSE.txt anyway), keeps ONLY the four
// maps Three.js actually consumes, and re-encodes them at a sane
// game resolution.
//
// Why this exists rather than inlining into the artifact bundle: the
// HD build has no 16MB ceiling, so surface realism can come from real
// measured/authored PBR data instead of procedural noise. These are
// DETAIL materials — tiled at high frequency and tinted per-biome by
// the terrain's existing vertex colors (see MaterialLibrary.js), NOT
// per-biome albedo replacements. That preserves the hand-tuned biome
// palettes in BiomeManager.js while adding the normal/roughness
// breakup that makes a surface read as real under moving light.
//
// Output: public/hd/textures/<slug>/{color,normal,roughness,ao}.jpg
// Idempotent — skips any slug whose folder already has all 4 maps
// unless you pass --force.
//
//   node tools/fetch-hd-textures.mjs [--force] [--res 2048] [--only slug,slug]
// ══════════════════════════════════════════════════════════

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAME_ROOT = path.resolve(__dirname, '..');
const OUT_ROOT = path.join(GAME_ROOT, 'public', 'hd', 'textures');

// ── The roster ────────────────────────────────────────────
// Chosen for a dark-fantasy palette: coarse, weathered, high
// normal-map contrast. Anything glossy/clean/modern was skipped on
// purpose — it fights the "tarnished metal and dried blood" direction
// established in style.css.
//
// `slug` is the key MaterialLibrary.js looks up. `id` is ambientCG's
// asset id. Keep slugs stable — they're referenced from code.
const SETS = [
  // Terrain detail — these four are blended across every biome.
  { slug: 'rock',       id: 'Rock030',        note: 'cliff / stone terrain detail' },
  { slug: 'dirt',       id: 'Ground037',      note: 'bare soil, the default ground detail' },
  { slug: 'grass',      id: 'Grass004',       note: 'vegetated ground (plains, jungle, swamp)' },
  { slug: 'snow',       id: 'Snow006',        note: 'frozen tundra / celestial peaks' },
  { slug: 'sand',       id: 'Ground054',      note: 'desert ruins' },
  { slug: 'ash',        id: 'Ground041',      note: 'volcanic / obsidian wastes' },

  // Structure + prop detail.
  { slug: 'wood',       id: 'Wood062',        note: 'planks, crates, stalls, shrine timber' },
  { slug: 'metal',      id: 'Metal032',       note: 'tarnished iron — armory, smithy, weapons' },
  { slug: 'stonewall',  id: 'PavingStones131', note: 'ruin masonry, monoliths' },
  { slug: 'fabric',     id: 'Fabric063',      note: 'tents, banners, robes' },
];

// ── args ──────────────────────────────────────────────────
const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
// Output resolution in pixels. Kept separate from SRC_LABEL below —
// ambientCG names its zips with a size *label* ("2K"), not a pixel
// count, so the two must not be conflated (they were, once, and every
// download 404'd).
const RES = (() => {
  const i = argv.indexOf('--res');
  return i >= 0 ? parseInt(argv[i + 1], 10) : 2048;
})();

// The label ambientCG actually puts in the filename. We always pull
// the 2K set and downsample locally if --res asks for less; their 4K/8K
// zips are 150MB+ and buy nothing at the tiling frequencies used here.
const SRC_LABEL = '2K';
const ONLY = (() => {
  const i = argv.indexOf('--only');
  return i >= 0 ? new Set(argv[i + 1].split(',').map(s => s.trim())) : null;
})();

// Which zip members map to which output. ambientCG names them
// consistently: <Id>_<RES>-JPG_<Attribute>.jpg
//
// NormalGL, not NormalDX: Three.js samples normal maps with +Y up
// (OpenGL convention). Using the DX map inverts every surface's
// apparent lighting direction on the green channel, which reads as
// subtly "inside out" bumps that are maddening to diagnose later.
const WANTED = {
  Color:            { out: 'color',     srgb: true  },
  NormalGL:         { out: 'normal',    srgb: false },
  Roughness:        { out: 'roughness', srgb: false },
  AmbientOcclusion: { out: 'ao',        srgb: false },
};

const log = (...a) => console.log('[hd-tex]', ...a);

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function alreadyDone(slug) {
  const dir = path.join(OUT_ROOT, slug);
  for (const { out } of Object.values(WANTED)) {
    if (!(await exists(path.join(dir, `${out}.jpg`)))) return false;
  }
  return true;
}

/**
 * ambientCG serves a predictable download URL, so we skip the API
 * entirely. `-L` because it redirects to their CDN, and a generous
 * timeout because these zips are 30-40MB.
 */
async function download(id, dest) {
  const file = `${id}_${SRC_LABEL}-JPG.zip`;
  const url = `https://ambientcg.com/get?file=${file}`;
  await execFileP('curl', [
    '-sL', '--fail', '--max-time', '300',
    '-o', dest, url,
  ], { maxBuffer: 1 << 28 });
  const st = await fs.stat(dest);
  if (st.size < 100_000) throw new Error(`suspiciously small download (${st.size}B) for ${file}`);
  return st.size;
}

/**
 * Re-encode one map. Normal/roughness/AO are linear data, not color —
 * stripping their embedded profile keeps sharp from "helpfully"
 * applying a gamma curve to values that aren't luminance.
 */
async function convert(src, dest, { srgb }, res) {
  let img = sharp(src).resize(res, res, { fit: 'fill' });
  if (!srgb) img = img.toColourspace('srgb').withMetadata({ icc: undefined });
  // Quality 92 on normals specifically: JPEG chroma artifacts on a
  // normal map show up as shimmering speckle under specular light.
  // 92 is where that stops being visible at these tiling frequencies.
  await img.jpeg({ quality: srgb ? 88 : 92, mozjpeg: true }).toFile(dest);
}

async function processSet({ slug, id, note }) {
  const outDir = path.join(OUT_ROOT, slug);

  if (!FORCE && await alreadyDone(slug)) {
    log(`skip  ${slug.padEnd(10)} (already complete)`);
    return { slug, skipped: true };
  }

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `acg-${slug}-`));
  const zip = path.join(tmp, 'set.zip');

  try {
    log(`get   ${slug.padEnd(10)} <- ambientCG/${id}  (${note})`);
    const bytes = await download(id, zip);
    await execFileP('unzip', ['-qo', zip, '-d', tmp]);

    await fs.mkdir(outDir, { recursive: true });

    const members = await fs.readdir(tmp);
    let written = 0;
    for (const [attr, spec] of Object.entries(WANTED)) {
      const hit = members.find(m => m.endsWith(`_${attr}.jpg`) || m.endsWith(`_${attr}.png`));
      if (!hit) {
        // AO is genuinely absent on a few ambientCG sets. That's fine —
        // MaterialLibrary treats a missing map as "no aoMap" rather
        // than failing the whole material.
        log(`  !   ${slug}: no ${attr} in this set, skipping that map`);
        continue;
      }
      await convert(path.join(tmp, hit), path.join(outDir, `${spec.out}.jpg`), spec, RES);
      written++;
    }

    const sizes = await Promise.all(
      (await fs.readdir(outDir)).map(async f => (await fs.stat(path.join(outDir, f))).size)
    );
    const mb = (sizes.reduce((a, b) => a + b, 0) / 1024 / 1024).toFixed(2);
    log(`  ok  ${slug.padEnd(10)} ${written} maps, ${mb}MB out (from ${(bytes / 1024 / 1024).toFixed(0)}MB zip)`);
    return { slug, written };
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

// ── main ──────────────────────────────────────────────────
const targets = SETS.filter(s => !ONLY || ONLY.has(s.slug));
if (!targets.length) {
  console.error('[hd-tex] no matching sets. available:', SETS.map(s => s.slug).join(', '));
  process.exit(1);
}

log(`fetching ${targets.length} CC0 material set(s) at ${RES}px -> public/hd/textures/`);

const results = [];
for (const set of targets) {
  // Sequential on purpose: these are 30-40MB each and this environment
  // has had flaky outbound bandwidth. Parallel downloads here reliably
  // produced truncated zips.
  try {
    results.push(await processSet(set));
  } catch (err) {
    log(`FAIL  ${set.slug}: ${err.message}`);
    results.push({ slug: set.slug, error: err.message });
  }
}

// License note — ambientCG is CC0 1.0 site-wide. Not legally required,
// but every other asset dir in this project carries one and a future
// reader should not have to go re-verify provenance.
await fs.mkdir(OUT_ROOT, { recursive: true });
await fs.writeFile(path.join(OUT_ROOT, 'LICENSE.txt'),
`PBR material sets in this directory are from ambientCG (https://ambientcg.com),
released under the Creative Commons CC0 1.0 Universal license:
https://creativecommons.org/publicdomain/zero/1.0/

CC0 places these in the public domain. No attribution is required; this
file exists to record provenance for future maintainers.

Sets used (slug <- ambientCG asset id):
${SETS.map(s => `  ${s.slug.padEnd(11)} <- ${s.id.padEnd(16)} ${s.note}`).join('\n')}

Each folder keeps only the four maps Three.js consumes:
  color.jpg      -> map            (sRGB)
  normal.jpg     -> normalMap      (linear, OpenGL +Y convention)
  roughness.jpg  -> roughnessMap   (linear)
  ao.jpg         -> aoMap          (linear, needs uv2 — MaterialLibrary sets it)

Regenerate with:  node tools/fetch-hd-textures.mjs [--force] [--res 2048]
`);

const ok = results.filter(r => r.written).length;
const skipped = results.filter(r => r.skipped).length;
const failed = results.filter(r => r.error);
log(`done — ${ok} fetched, ${skipped} already present, ${failed.length} failed`);
if (failed.length) {
  for (const f of failed) log(`  failed: ${f.slug} — ${f.error}`);
  process.exit(1);
}
