#!/usr/bin/env bash
# Render adegan Blender dicicil per batch + jeda pendingin (laptop mudah mati saat GPU penuh terus-menerus).
# Pakai: render_cicil.sh <folder_frame> <total_frame> [ghost.png] [batch] [jeda_detik]
set -u
OUT="$1"; TOTAL="$2"; GHOST="${3:-}"; BATCH="${4:-30}"; REST="${5:-25}"
BLENDER="E:/SteamLibrary/steamapps/common/Blender/blender.exe"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT"
for ((s = 1; s <= TOTAL; s += BATCH)); do
  e=$(( s + BATCH - 1 )); (( e > TOTAL )) && e=$TOTAL
  missing=0
  for ((f = s; f <= e; f++)); do [ -f "$OUT/$(printf 'frame_%04d.png' "$f")" ] || missing=1; done
  if (( missing == 0 )); then echo "batch $s-$e sudah ada, lewati"; continue; fi
  t0=$(date +%s)
  "$BLENDER" -b --factory-startup --python "$HERE/horror_corridor.py" -- --out "$OUT" --frames "$TOTAL" \
    --start "$s" --end "$e" ${GHOST:+--ghost "$GHOST"} 2>&1 | grep -iE "error|traceback" | head -3
  echo "batch $s-$e selesai ($(( $(date +%s) - t0 )) dtk), jeda ${REST} dtk"
  (( e < TOTAL )) && sleep "$REST"
done
echo "TOTAL FRAME: $(ls "$OUT" | grep -c '^frame_')"
