#!/usr/bin/env node
// ══════════════════════════════════════════════════════════
// Strip unused animation clips from a character GLB.
//
// KayKit's character packs ship a shared ~80-clip library
// (sitting, lying, cheering, crossbow reloads, dual-wield
// variants...). This game drives at most a handful. Every unused
// clip is pure weight in a single-file build where the whole page
// must stay under the artifact size ceiling — and animation
// sampler data is the single largest contributor in these files.
//
// Keeps only KEEP_CLIPS (plus anything passed on the CLI), then
// prunes the accessors those clips no longer reference.
//
//   node tools/trim-animations.mjs <in.glb> <out.glb> [extraClip...]
// ══════════════════════════════════════════════════════════

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';

// The clips the game actually drives, plus the ones a combat pass
// needs. Anything not here is dropped.
const KEEP_CLIPS = new Set([
  'Idle',
  'Walking_A',
  'Running_A',
  '2H_Melee_Attack_Chop',
  'Hit_A',
  'Death_A',
]);

const [, , inPath, outPath, ...extra] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: trim-animations.mjs <in.glb> <out.glb> [extraClip...]');
  process.exit(1);
}
for (const e of extra) KEEP_CLIPS.add(e);

// Input must NOT be meshopt-compressed — the standalone meshoptimizer
// codec isn't installable here. Decompress first with the CLI, which
// vendors it:  npx gltf-transform cp in.glb raw.glb
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inPath);
const root = doc.getRoot();

const before = root.listAnimations().length;
let kept = 0;
for (const anim of root.listAnimations()) {
  const name = anim.getName();
  if (KEEP_CLIPS.has(name)) {
    kept++;
    continue;
  }
  // Dispose the clip's samplers/channels too, or their accessors
  // survive as orphans and prune() has nothing to hang the removal on.
  for (const ch of anim.listChannels()) ch.dispose();
  for (const s of anim.listSamplers()) s.dispose();
  anim.dispose();
}

await doc.transform(dedup(), prune());
await io.write(outPath, doc);

const names = root.listAnimations().map(a => a.getName());
console.log(`${inPath}: ${before} clips -> ${kept} kept [${names.join(', ')}]`);
