#!/usr/bin/env node
// ══════════════════════════════════════════════════════════
// fetch-polyhaven-models — real photoscanned geometry
//
// Why this exists: the world's nature props (rocks, trees, roots,
// debris) were procedural — composed from displaced icosahedra. That
// is fine for a stylised game and completely wrong for the
// photoreal look the owner asked for. No amount of noise
// displacement produces a rock that looks scanned, because a real
// rock's silhouette carries erosion history that noise does not
// model.
//
// The local asset folder cannot help here. The Fantasy Props MegaKit
// (94 props, already embedded) is ENTIRELY interior furniture —
// barrels, books, candles, tables, chests. It contains no tree, rock,
// cliff or terrain asset of any kind. Verified by listing it.
//
// So these come from Poly Haven (polyhaven.com), which publishes
// photogrammetry-derived models under CC0 1.0 — public domain, no
// attribution required, commercial use fine.
//
// ── The decimation problem ────────────────────────────────
//
// Poly Haven models are scan-derived and enormous: one boulder is
// 97,964 triangles. The world scatters ~570 props, so shipping these
// as-authored would be roughly 55 MILLION triangles of props alone.
//
// They decimate extremely well, though, and for a specific reason:
// almost all of the visible detail in a photoscanned rock lives in
// its NORMAL MAP, not its silhouette. Dropping to ~2.5% of the
// original triangle count is visually near-free as long as the normal
// map is preserved. Measured on namaqualand_boulder_02:
//
//     97,964 tris, 5.14 MB  →  2,449 tris, 636 KB
//
// The pipeline below is the same one the project already uses for
// KayKit characters (simplify → resize → webp → weld → quantize →
// meshopt), just with an aggressive ratio.
//
//   node tools/fetch-polyhaven-models.mjs [--force] [--only id,id]
// ══════════════════════════════════════════════════════════

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAME_ROOT = path.resolve(__dirname, '..');
// public/, not assets-src/. These are fetched over HTTP by
// ModelLibrary.preloadExternal() rather than base64-embedded into the
// bundle — 9MB of models would become ~12MB of base64 plus a
// synchronous decode at boot, for no benefit in a build that has no
// "zero external requests" constraint. Vite serves public/ verbatim.
const OUT_DIR = path.join(GAME_ROOT, 'public', 'hd', 'nature');
const BIN = path.join(GAME_ROOT, 'node_modules', '.bin');

// ── Roster ────────────────────────────────────────────────
// `tris` is the target triangle budget, chosen per role rather than
// globally: a boulder the player walks past at 3m needs more silhouette
// fidelity than a pebble, and a fort is a landmark seen from distance
// but rarely instanced, so it can afford more.
//
// `tex` is texture resolution. Ground debris seen at a glancing angle
// does not need 1024.
const ROSTER = [
  // ── Boulders & rocks — replace forgeRock() ──
  { id: 'namaqualand_boulder_02', slug: 'boulder_a',  tris: 2200, tex: 1024, role: 'rock' },
  { id: 'namaqualand_boulder_03', slug: 'boulder_b',  tris: 2200, tex: 1024, role: 'rock' },
  { id: 'namaqualand_boulder_04', slug: 'boulder_c',  tris: 2200, tex: 1024, role: 'rock' },
  { id: 'namaqualand_boulder_05', slug: 'boulder_d',  tris: 2200, tex: 1024, role: 'rock' },
  // boulder_01 (slug boulder_e) DELIBERATELY EXCLUDED. Its mesh
  // ("rock_PROXY_5m") reports more vertices than triangles even after
  // welding, i.e. it is pathologically split, and meshoptimizer cannot
  // collapse it: it stays at ~54,000 triangles against a 2,200 target
  // even with the error bound removed entirely. Welding at explicit
  // tolerances (1e-4, 1e-3) also failed to merge it. Scattering a
  // 54k-triangle prop hundreds of times would cost more than the other
  // seven rocks combined. Seven rocks is ample variety; this one is not
  // worth the fight. If you re-add it, decimate it in Blender first.
  { id: 'rock_07',                slug: 'rock_a',     tris: 1400, tex: 768,  role: 'rock' },
  { id: 'namaqualand_rocks_01',   slug: 'rocks_a',    tris: 1800, tex: 1024, role: 'rock' },
  { id: 'namaqualand_stones_01',  slug: 'stones_a',   tris: 1400, tex: 768,  role: 'rock' },

  // ── Dead trees — the dark-fantasy silhouette ──
  { id: 'dead_tree_trunk',        slug: 'deadtree_a', tris: 3000, tex: 1024, role: 'tree' },
  { id: 'dead_tree_trunk_02',     slug: 'deadtree_b', tris: 3000, tex: 1024, role: 'tree' },
  { id: 'dead_quiver_trunk',      slug: 'deadtree_c', tris: 3000, tex: 1024, role: 'tree' },
  { id: 'tree_stump_01',          slug: 'stump_a',    tris: 1600, tex: 768,  role: 'tree' },
  { id: 'tree_stump_02',          slug: 'stump_b',    tris: 1600, tex: 768,  role: 'tree' },

  // ── Living trees (sparser use) ──
  { id: 'quiver_tree_01',         slug: 'tree_a',     tris: 4000, tex: 1024, role: 'tree' },
  { id: 'quiver_tree_02',         slug: 'tree_b',     tris: 4000, tex: 1024, role: 'tree' },

  // ── Ground detail — replaces the clutter pass ──
  { id: 'root_cluster_01',        slug: 'roots_a',    tris: 1200, tex: 768,  role: 'debris' },
  { id: 'dry_branches_medium_01', slug: 'branches_a', tris: 1200, tex: 768,  role: 'debris' },
  { id: 'bark_debris_01',         slug: 'debris_a',   tris:  800, tex: 512,  role: 'debris' },
  { id: 'shrub_02',               slug: 'shrub_a',    tris: 1200, tex: 768,  role: 'debris' },
  { id: 'shrub_03',               slug: 'shrub_b',    tris: 1200, tex: 768,  role: 'debris' },

  // ── Landmarks ──
  { id: 'namaqualand_cliff_01',   slug: 'cliff_a',    tris: 5000, tex: 1024, role: 'landmark' },
  { id: 'stone_fire_pit',         slug: 'firepit',    tris: 1800, tex: 768,  role: 'landmark' },
  { id: 'modular_fort_01',        slug: 'fort',       tris: 6000, tex: 1024, role: 'landmark' },
];

const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const ONLY = (() => {
  const i = argv.indexOf('--only');
  return i >= 0 ? new Set(argv[i + 1].split(',').map(s => s.trim())) : null;
})();

const log = (...a) => console.log('[ph-models]', ...a);
const gltf = (...args) => execFileP(path.join(BIN, 'gltf-transform'), args, { maxBuffer: 1 << 28 });

async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }

async function fetchJSON(url) {
  const { stdout } = await execFileP('curl', ['-sL', '--fail', '--max-time', '60', url], { maxBuffer: 1 << 28 });
  return JSON.parse(stdout);
}

/**
 * Download the 1k glTF variant and all its side files, preserving the
 * relative `textures/` layout the .gltf references.
 */
async function download(id, dir) {
  const files = await fetchJSON(`https://api.polyhaven.com/files/${id}`);
  const variants = files?.gltf;
  if (!variants) throw new Error('no gltf variants');
  // 1k is plenty: these get re-encoded to <=1024 below anyway, and the
  // 2k download is 2.6x larger for texture data we immediately discard.
  const pick = variants['1k'] ?? variants[Object.keys(variants)[0]];
  const entry = pick.gltf;
  if (!entry) throw new Error('no gltf entry');

  const jobs = [['scene.gltf', entry.url]];
  for (const [name, info] of Object.entries(entry.include || {})) {
    jobs.push([name, info.url]);
  }
  for (const [name, url] of jobs) {
    const dest = path.join(dir, name);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await execFileP('curl', ['-sL', '--fail', '--max-time', '180', '-o', dest, url]);
  }
  // The .gltf references its .bin by the ORIGINAL filename, so the
  // rename to scene.gltf must not break that link — patch the buffer
  // uri to whatever .bin actually landed.
  const gltfPath = path.join(dir, 'scene.gltf');
  const doc = JSON.parse(await fs.readFile(gltfPath, 'utf8'));
  const bins = (await fs.readdir(dir)).filter(f => f.endsWith('.bin'));
  if (bins.length === 1 && doc.buffers?.[0]) doc.buffers[0].uri = bins[0];
  await fs.writeFile(gltfPath, JSON.stringify(doc));
  return gltfPath;
}

async function process1(item) {
  const { id, slug, tris, tex } = item;
  const out = path.join(OUT_DIR, `${slug}.glb`);
  if (!FORCE && await exists(out)) { log(`skip  ${slug} (present)`); return { slug, skipped: true }; }

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `ph-${slug}-`));
  try {
    log(`get   ${slug.padEnd(11)} <- polyhaven/${id}`);
    const src = await download(id, tmp);

    // Triangle count BEFORE, so the log shows what the decimation
    // actually did rather than just asserting it worked.
    const before = await triangleCount(src);
    // simplify takes a RATIO, not an absolute count.
    const ratio = Math.max(0.005, Math.min(1, tris / Math.max(before, 1)));

    const p = n => path.join(tmp, n);

    // WELD FIRST. This ordering is load-bearing, not cosmetic.
    //
    // Photogrammetry exports routinely split vertices along UV seams,
    // so what looks like one continuous surface is topologically many
    // disconnected shells. meshoptimizer's simplifier will not collapse
    // an edge across a seam, so on a seam-heavy mesh it hits the error
    // bound and quits almost immediately. Observed: boulder_e came out
    // at 54,098 triangles against a 2,200 target — a 25x miss — purely
    // because simplify ran before weld.
    //
    // Welding merges those duplicates back into shared vertices first,
    // after which the simplifier can actually reach the target.
    await gltf('weld', src, p('w.glb'));

    // Two-stage error budget. Start tight (2% surface error, invisible
    // under a normal map); if the mesh still misses its target by a
    // wide margin, retry unconstrained. Better a slightly looser
    // silhouette than a prop that ships at 20x its triangle budget.
    await gltf('simplify', p('w.glb'), p('a.glb'), '--ratio', String(ratio), '--error', '0.02');
    if (await triangleCount(p('a.glb')) > tris * 2) {
      log(`  ..  ${slug}: tight simplify missed target, retrying unconstrained`);
      await gltf('simplify', p('w.glb'), p('a.glb'), '--ratio', String(ratio), '--error', '1');
    }
    await gltf('resize', p('a.glb'), p('b.glb'), '--width', String(tex), '--height', String(tex));
    await gltf('webp', p('b.glb'), p('c.glb'), '--quality', '82');
    await gltf('quantize', p('c.glb'), p('e.glb'));
    // meshopt LAST — ModelLibrary's GLTFLoader has the meshopt decoder
    // wired (see HANDOFF), and this is where most of the remaining
    // size goes.
    await gltf('meshopt', p('e.glb'), out);

    const after = await triangleCount(out);
    const kb = ((await fs.stat(out)).size / 1024).toFixed(0);
    log(`  ok  ${slug.padEnd(11)} ${before.toLocaleString()} -> ${after.toLocaleString()} tris, ${kb}KB`);
    return { slug, before, after, kb: +kb };
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

async function triangleCount(file) {
  try {
    const { stdout } = await gltf('inspect', file);
    // The inspect table prints glPrimitives with thousands separators.
    const rows = [...stdout.matchAll(/TRIANGLES\s*│\s*[\d,]+\s*│\s*([\d,]+)/g)];
    return rows.reduce((a, m) => a + parseInt(m[1].replace(/,/g, ''), 10), 0) || 0;
  } catch { return 0; }
}

// ── main ──────────────────────────────────────────────────
const targets = ROSTER.filter(r => !ONLY || ONLY.has(r.slug) || ONLY.has(r.id));
await fs.mkdir(OUT_DIR, { recursive: true });
log(`fetching ${targets.length} CC0 photoscanned model(s) -> assets-src/nature/`);

const results = [];
for (const item of targets) {
  try { results.push(await process1(item)); }
  catch (err) { log(`FAIL  ${item.slug}: ${err.message}`); results.push({ slug: item.slug, error: err.message }); }
}

await fs.writeFile(path.join(OUT_DIR, 'LICENSE.txt'),
`Models in this directory are from Poly Haven (https://polyhaven.com),
released under the Creative Commons CC0 1.0 Universal license:
https://creativecommons.org/publicdomain/zero/1.0/

CC0 places these in the public domain. No attribution is required;
this file records provenance for future maintainers.

They are photogrammetry-derived and were shipped at scan density
(up to ~98,000 triangles each). Every one has been decimated to a
game-appropriate budget and re-encoded (webp textures, quantized
attributes, meshopt compression) by tools/fetch-polyhaven-models.mjs.
The visible surface detail survives decimation because it lives in the
normal map, not the silhouette.

slug          <- polyhaven id                  role
${ROSTER.map(r => `  ${r.slug.padEnd(12)}<- ${r.id.padEnd(28)} ${r.role}`).join('\n')}

Regenerate with:  node tools/fetch-polyhaven-models.mjs [--force]
Then re-embed:    node tools/embed-models.mjs
`);

const ok = results.filter(r => r.after);
const failed = results.filter(r => r.error);
log(`done — ${ok.length} fetched, ${results.filter(r => r.skipped).length} present, ${failed.length} failed`);
if (ok.length) {
  log(`total size: ${(ok.reduce((a, r) => a + r.kb, 0) / 1024).toFixed(1)}MB, ` +
      `${ok.reduce((a, r) => a + r.after, 0).toLocaleString()} triangles across all models`);
}
for (const f of failed) log(`  failed: ${f.slug} — ${f.error}`);
