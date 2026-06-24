#!/usr/bin/env bash
# Generate sample MP4 source files (the repo ships none) using the bundled
# ffmpeg. Uses the `testsrc2` pattern (moving elements + an on-screen timer) so
# the watermark's motion and vertical flips are easy to see. Set FORCE=1 to
# regenerate existing files.
set -euo pipefail
cd "$(dirname "$0")/.."

MEDIA_DIR="${MEDIA_DIR:-media}"
mkdir -p "$MEDIA_DIR"

FF="$(node -e 'process.stdout.write(require("ffmpeg-static")||"")')"
if [ -z "$FF" ] || [ ! -x "$FF" ]; then
  echo "ffmpeg-static binary not found/executable. Run: npm run setup:ffmpeg" >&2
  exit 1
fi

gen() {
  local name="$1" w="$2" h="$3" dur="$4" freq="$5"
  local out="$MEDIA_DIR/$name"
  if [ -f "$out" ] && [ "${FORCE:-0}" != "1" ]; then
    echo "skip   $out (exists; set FORCE=1 to regenerate)"
    return
  fi
  echo "create $out  (${w}x${h}, ${dur}s)"
  "$FF" -hide_banner -loglevel error -y \
    -f lavfi -i "testsrc2=size=${w}x${h}:rate=30" \
    -f lavfi -i "sine=frequency=${freq}:sample_rate=48000" \
    -t "$dur" \
    -c:v libx264 -preset veryfast -pix_fmt yuv420p \
    -c:a aac -b:a 128k -shortest \
    "$out"
}

gen sample-drama.mp4 1280 720 30 220
gen sample-doc.mp4   1280 720 24 330
gen sample-mv.mp4    1920 1080 18 523

echo "done. Source files in $MEDIA_DIR:"
ls -la "$MEDIA_DIR"/*.mp4
