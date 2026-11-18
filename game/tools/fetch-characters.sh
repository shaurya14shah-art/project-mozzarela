#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════
# Fetch + optimize the CC0 KayKit character models.
#
# Each source GLB is ~3.5-4.7 MB, almost all of it an ~80-95 clip
# shared animation library this game drives 6 of. Download, strip to
# the clips actually used, quantize + meshopt, and drop into
# assets-src/models/ (~260 KB each, ~94% off).
#
# Both packs are CC0 1.0 — see assets-src/models/LICENSE.txt.
#   bash tools/fetch-characters.sh
# ══════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")/.."

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
RAW=https://raw.githubusercontent.com/KayKit-Game-Assets

SK="$RAW/KayKit-Character-Pack-Skeletons-1.0/main/addons/kaykit_character_pack_skeletons/Characters/gltf"
AD="$RAW/KayKit-Character-Pack-Adventures-1.0/main/addons/kaykit_character_pack_adventures/Characters/gltf"

# name<TAB>url
ENTRIES=(
  "Skeleton_Warrior	$SK/Skeleton_Warrior.glb"
  "Skeleton_Minion	$SK/Skeleton_Minion.glb"
  "Skeleton_Mage	$SK/Skeleton_Mage.glb"
  "Skeleton_Rogue	$SK/Skeleton_Rogue.glb"
  "Knight	$AD/Knight.glb"
  "Barbarian	$AD/Barbarian.glb"
  "Mage	$AD/Mage.glb"
  "Rogue	$AD/Rogue.glb"
  "Rogue_Hooded	$AD/Rogue_Hooded.glb"
)

mkdir -p assets-src/models
for e in "${ENTRIES[@]}"; do
  name="${e%%	*}"; url="${e##*	}"
  out="assets-src/models/$name.glb"
  if [ -f "$out" ] && [ "${1:-}" != "--force" ]; then
    printf "  %-20s (already present, skipping)\n" "$name"
    continue
  fi
  curl -sL -o "$TMP/$name.raw.glb" "$url"
  # Guard against a silent 404/HTML body landing on disk as a "model".
  if [ "$(head -c 4 "$TMP/$name.raw.glb")" != "glTF" ]; then
    echo "  $name: download did not return a GLB — skipped"; continue
  fi
  node tools/trim-animations.mjs "$TMP/$name.raw.glb" "$TMP/$name.trim.glb" >/dev/null 2>&1
  npx gltf-transform quantize "$TMP/$name.trim.glb" "$TMP/$name.q.glb" >/dev/null 2>&1
  npx gltf-transform meshopt "$TMP/$name.q.glb" "$out" >/dev/null 2>&1
  printf "  %-20s %s KB\n" "$name" "$(( $(wc -c < "$out") / 1024 ))"
done
echo "models dir: $(du -sh assets-src/models | cut -f1)"
