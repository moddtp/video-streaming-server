#!/usr/bin/env bash
# End-to-end smoke test: login -> play -> watermarked HLS -> auth enforcement ->
# segment validity -> source integrity. Starts the server itself if one isn't
# already running, and tears it down on exit. CI-friendly (exits non-zero on failure).
#
#   npm run smoke
#   BASE_URL=http://host:3000 npm run smoke   # against an already-running server
set -uo pipefail
cd "$(dirname "$0")/.."

BASE="${BASE_URL:-http://127.0.0.1:3000}"
EMAIL="${SMOKE_EMAIL:-demo@example.com}"
PASSWORD="${SMOKE_PASSWORD:-demo1234}"
VIDEO="${SMOKE_VIDEO:-vid_drama_001}"
SRC_FILE="${SMOKE_SRC:-media/sample-drama.mp4}"

TMP="$(mktemp -d)"
FAIL=0
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill -TERM -- -"$SERVER_PID" 2>/dev/null
    sleep 0.3
    kill -KILL -- -"$SERVER_PID" 2>/dev/null
    fuser -k "${BASE##*:}/tcp" 2>/dev/null
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

jget() { python3 -c "import sys,json
try:
  print(json.load(sys.stdin)$1)
except Exception:
  print('')" 2>/dev/null; }

check() { # description actual expected
  if [ "$2" = "$3" ]; then echo "  ok    $1 ($2)"; else echo "  FAIL  $1 (got '$2', want '$3')"; FAIL=1; fi
}
okmsg() { echo "  ok    $1"; }
failmsg() { echo "  FAIL  $1"; FAIL=1; }

# --- ensure a server is running -------------------------------------------------
if ! curl -sf "$BASE/health" >/dev/null 2>&1; then
  echo "no server at $BASE — starting one..."
  setsid npx tsx src/server.ts > "$TMP/server.log" 2>&1 < /dev/null &
  SERVER_PID=$!
  for i in $(seq 1 120); do curl -sf "$BASE/health" >/dev/null 2>&1 && break; sleep 0.25; done
fi
curl -sf "$BASE/health" >/dev/null 2>&1 || { echo "server not reachable at $BASE"; cat "$TMP/server.log" 2>/dev/null; exit 1; }
echo "server: $BASE"

# --- auth -----------------------------------------------------------------------
TOK=$(curl -sS -X POST "$BASE/api/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" | jget "['accessToken']")
[ -n "$TOK" ] && okmsg "login" || failmsg "login"

code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/login" \
  -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"wrong\"}")
check "bad password rejected" "$code" "401"

code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/videos/$VIDEO/play")
check "play requires auth" "$code" "401"

# --- source integrity baseline --------------------------------------------------
SUM_BEFORE=$(sha256sum "$SRC_FILE" 2>/dev/null | awk '{print $1}')

# --- play -----------------------------------------------------------------------
PLAY=$(curl -sS -X POST "$BASE/api/videos/$VIDEO/play" -H "Authorization: Bearer $TOK")
SID=$(echo "$PLAY" | jget "['sessionId']")
STOK=$(echo "$PLAY" | jget "['sessionToken']")
WM=$(echo "$PLAY" | jget "['watermark']['text']")
[ -n "$SID" ] && okmsg "play -> session $SID  (watermark: $WM)" || failmsg "play"

# --- playlist -------------------------------------------------------------------
PL=$(curl -sS "$BASE/stream/$SID/index.m3u8?t=$STOK")
SEGS=$(echo "$PL" | grep -c '^seg_')
[ "${SEGS:-0}" -ge 1 ] && okmsg "playlist lists $SEGS segment(s)" || failmsg "playlist segments"
echo "$PL" | grep -q 'seg_.*?t=' && okmsg "segment URIs carry token" || failmsg "segment token rewrite"

code=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/stream/$SID/index.m3u8")
check "playlist requires token" "$code" "401"

# --- segment --------------------------------------------------------------------
curl -sS "$BASE/stream/$SID/seg_00000.ts?t=$STOK" -o "$TMP/seg.ts"
SZ=$(stat -c%s "$TMP/seg.ts" 2>/dev/null || echo 0)
[ "${SZ:-0}" -gt 1000 ] && okmsg "segment downloaded ($SZ bytes)" || failmsg "segment download"

code=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/stream/$SID/seg_00000.ts")
check "segment requires token" "$code" "401"

# Validate with ffprobe (the bundled static ffmpeg's TS demuxer is unreliable; ffprobe works).
FP=$(node -e 'process.stdout.write(require("ffprobe-static").path)')
CODEC=$("$FP" -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$TMP/seg.ts" 2>/dev/null | grep -m1 -v '^$')
check "segment video is h264" "$CODEC" "h264"

# --- source integrity -----------------------------------------------------------
SUM_AFTER=$(sha256sum "$SRC_FILE" 2>/dev/null | awk '{print $1}')
check "source file unmodified" "$SUM_AFTER" "$SUM_BEFORE"

# --- cleanup session ------------------------------------------------------------
curl -sS -o /dev/null -X DELETE "$BASE/api/sessions/$SID" -H "Authorization: Bearer $TOK"

echo
if [ "$FAIL" = "0" ]; then echo "✅ SMOKE TEST PASSED"; else echo "❌ SMOKE TEST FAILED"; fi
exit "$FAIL"
