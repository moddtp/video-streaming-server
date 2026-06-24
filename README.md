# video-streaming-server

A Video-on-Demand (VOD) streaming server that streams MP4 sources to **Flutter**
and **React Native** apps as chunked **HLS**, and burns a **distinct, per-user,
moving watermark** into the video **on the fly** — without ever modifying the
source files.

The watermark renders `user@email.com | Category` (e.g.
`vdowatermark@vdowatermark.th | Drama`) so a leaked screen-recording traces back to
one account. Because the email is rendered into the pixels, it survives
screen-recording and re-streaming.

## Highlights

- **Chunked HLS** (`.m3u8` + MPEG-TS segments) — plays natively on iOS & Android,
  so one stream works for Flutter (`video_player`) and React Native
  (`react-native-video`). The client never receives one downloadable MP4.
- **On-the-fly per-user watermark**, burned in with FFmpeg + libass:
  - content: `email | Category` (category from a SQLite/JSON catalog);
  - white text, ~3.5% of frame height, ~65% opacity (all configurable);
  - hugs a random border with a gap, **jumps to a new random spot every 3–12s**;
  - renders **vertically (rotated 90°/270°) on the left/right borders**, horizontally on top/bottom.
- **Optional static logo watermark** (also burned in): a corner-placed PNG/JPEG
  (GitHub mark by default) with configurable size (≤ 1/8 of the frame), border gap,
  and opacity — and the moving text automatically steers clear of it.
- **Sources are never modified** — only ever read (verified by the smoke test).
- **Auth + session tokens** guard the playlist and every segment.
- **Bundled FFmpeg** (`ffmpeg-static`) — no system install required; a startup
  self-check verifies the libass burn path and a repair script fixes truncated downloads.
- **Concurrency cap** with `503` backpressure (per-user burn-in is CPU-heavy).

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design, the
burned-in vs client-overlay tradeoff, and scaling notes.

## Requirements

- Node.js ≥ 20 (developed on Node 22)
- No system FFmpeg needed — `npm install` bundles one (`ffmpeg-static`, with libass)

## Quickstart

```bash
npm install            # installs deps + bundled ffmpeg (postinstall self-repairs a truncated download)
npm run make-media     # generate sample MP4s into media/ (the repo ships none)
npm run seed           # probe the samples and populate the catalog (SQLite by default)
npm run dev            # start the server (logs "ffmpeg OK: libass burn available …")
```

Then open <http://localhost:3000/> for the **web test player**: sign in with a
demo login, pick a video, and watch the watermark move (and flip vertical near
the side borders). Verify headlessly with:

```bash
npm run smoke          # end-to-end: login → play → HLS → auth → source integrity
npm test               # unit tests for the watermark schedule/geometry/ASS
npm run wm:preview vid_mv_001 vdowatermark@vdowatermark.th   # render still frames to data/preview/
```

Demo logins: `vdowatermark@vdowatermark.th` / `vdowatermark9630` · `demo@example.com` / `demo1234`.

## API

| Method | Path                       | Auth          | Purpose                                            |
| ------ | -------------------------- | ------------- | -------------------------------------------------- |
| POST   | `/api/login`               | —             | `{email,password}` → `{accessToken, email}`        |
| GET    | `/api/videos`              | Bearer access | List catalog (public metadata only)                |
| GET    | `/api/videos/:id`          | Bearer access | One video's metadata                               |
| POST   | `/api/videos/:id/play`     | Bearer access | Start a watermarked session → `{playlistUrl, sessionToken, …}` |
| DELETE | `/api/sessions/:sid`       | Bearer access | End a session (owner only)                          |
| GET    | `/stream/:sid/index.m3u8`  | session token | HLS playlist (segment URIs rewritten to carry the token) |
| GET    | `/stream/:sid/seg_NNNNN.ts`| session token | HLS segment                                        |

The session token is accepted as `Authorization: Bearer` **or** `?t=` query —
the query form is required because mobile players and hls.js don't forward
headers to segment requests.

## Configuration

Copy `.env.example` to `.env` and adjust. Key watermark knobs (physical mm/cm
can't be honored in burned-in video since the server has no screen DPI, so they
map to a fraction of the frame):

| Variable                    | Default  | Meaning                                            |
| --------------------------- | -------- | -------------------------------------------------- |
| `WM_TEXT_HEIGHT_PCT`        | `0.035`  | Text height as a fraction of video height (~4–6 mm)|
| `WM_GAP_PCT`                | `0.04`   | Border gap as a fraction of the dimension (~1.5–2.5 cm) |
| `WM_OPACITY`                | `0.65`   | Text opacity (0–1; ~50–75%)                        |
| `WM_MIN_INTERVAL_SEC` / `_MAX_` | `3`/`12` | Random reposition period bounds                |
| `LOGO_POSITION`             | `bottom-right` | `disabled` or a corner (`top-left`…`bottom-right`) |
| `LOGO_FILE`                 | GitHub mark | PNG/JPEG logo to burn in                        |
| `LOGO_SIZE_PCT` / `_GAP_X_PCT` / `_GAP_Y_PCT` / `_OPACITY` | `0.10`/`0.03`/`0.03`/`0.85` | Logo size (≤1/8), gaps, opacity |
| `MAX_CONCURRENT_TRANSCODES` | cores    | Concurrent burn-in jobs before `503`               |
| `CATALOG_STORE`             | `sqlite` | `sqlite` (DBMS table) or `json`                    |

## Project layout

```
src/
  ffmpeg/      binary self-check, HLS arg builder, spawn runner, ffprobe
  watermark/   geometry, random schedule generator, ASS renderer
  catalog/     CatalogStore (sqlite | json), schema, seed
  auth/        JWT, bcrypt users, requireAuth / session guard
  session/     session manager (per-session dir + ffmpeg + cleanup + concurrency)
  routes/      auth, catalog, session, stream
test-player/   browser HLS player (hls.js) — served at /
clients/       flutter_sample/ + react_native_sample/  (built in your toolchain)
docs/          ARCHITECTURE + CLIENT-FLUTTER + CLIENT-REACT-NATIVE
scripts/       make-test-media, setup-ffmpeg, wm-preview, smoke-test
```

## Clients

- **Web** — `test-player/`, served at `/` for instant verification.
- **Flutter** — [`clients/flutter_sample/`](clients/flutter_sample/) · [`docs/CLIENT-FLUTTER.md`](docs/CLIENT-FLUTTER.md)
- **React Native** — [`clients/react_native_sample/`](clients/react_native_sample/) · [`docs/CLIENT-REACT-NATIVE.md`](docs/CLIENT-REACT-NATIVE.md)

## Security & production notes

- Watermark email comes from the verified access token, never from a request body.
- Stream files are an allowlist (`index.m3u8` / `seg_NNNNN.ts`) resolved strictly
  inside the session dir (no path traversal); per-user content is `Cache-Control: no-store`.
- Per-user burn-in is CPU-bound: for scale, use hardware encoders
  (`h264_nvenc`/`qsv`/`vaapi`), a job queue, and short-lived caches — see
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## License

MIT — see [LICENSE](LICENSE). Bundled DejaVu Sans font under its own permissive
license (see `assets/fonts/`).
