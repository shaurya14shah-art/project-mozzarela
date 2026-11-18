#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════
# Extract selected props from the Fantasy Props MegaKit into
# assets-src/megakit/ as optimized, self-contained .glb files.
#
# The kit ships .gltf + .bin + 13 shared trim-sheet PNGs totalling
# ~42 MB — far too heavy to embed wholesale in a single-file build.
# Each prop is converted individually and squeezed: textures down to
# 512px WebP, geometry welded + quantized. Textures do get duplicated
# per-file this way (they're trim sheets shared across the kit), but
# at 512/WebP each set lands around 20 KB, which costs far less than
# the complexity of a shared-atlas loader would.
#
# Idempotent: re-running just overwrites. Only the names listed in
# PROPS are extracted, so adding a prop to the game means adding its
# name here and re-running.
#
#   bash tools/extract-megakit.sh [name...]     (default: full PROPS list)
# ══════════════════════════════════════════════════════════
set -euo pipefail

cd "$(dirname "$0")/.."
SRC="Fantasy Props MegaKit[Standard]/Exports/glTF"
OUT="assets-src/megakit"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$OUT"

PROPS=(
  # ── already shipped ──
  Anvil Axe_Bronze Barrel Bench BookGroup_Small_1 Book_Stack_1 Bookcase_2
  CandleStick_Stand Cauldron Chalice Chandelier Chest_Wood Crate_Wooden
  Lantern_Wall Mug Pickaxe_Bronze Rope_1 Scroll_1 Shield_Wooden Sword_Bronze
  Table_Large Torch_Metal Vase_2 WeaponStand Workbench
  # ── pickups: what a dropped item should actually look like ──
  Coin Coin_Pile Key_Metal Key_Gold Bag Pouch_Large Bottle_1 SmallBottle
  Potion_1 Potion_2 Carrot Whetstone
  # ── hub furnishing ──
  Bed_Twin1 Cabinet Chair_1 Stool Shelf_Simple Shelf_Arch Nightstand_Shelf
  Banner_1 Banner_2 Stall_Empty Cage_Small Pot_1 Bucket_Wooden_1 Chain_Coil
  Dummy Peg_Rack Candle_1 CandleStick_Triple Table_Plate Barrel_Apples
  Crate_Metal FarmCrate_Apple BookStand Shelf_Small_Bottles
)

if [ "$#" -gt 0 ]; then PROPS=("$@"); fi

ok=0; skip=0
for name in "${PROPS[@]}"; do
  in="$SRC/$name.gltf"
  if [ ! -f "$in" ]; then
    echo "  skip (not in kit): $name"
    skip=$((skip + 1))
    continue
  fi
  npx gltf-transform resize "$in" "$TMP/a.glb" --width 512 --height 512 >/dev/null 2>&1
  npx gltf-transform webp "$TMP/a.glb" "$TMP/b.glb" --quality 78 >/dev/null 2>&1
  npx gltf-transform weld "$TMP/b.glb" "$TMP/c.glb" >/dev/null 2>&1
  npx gltf-transform quantize "$TMP/c.glb" "$OUT/$name.glb" >/dev/null 2>&1
  printf "  %-24s %s KB\n" "$name" "$(( $(wc -c < "$OUT/$name.glb") / 1024 ))"
  ok=$((ok + 1))
done

echo "extracted $ok prop(s), skipped $skip"
echo "total assets-src/megakit: $(du -sh "$OUT" | cut -f1)"
