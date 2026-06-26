# Handoff — `video-streaming-server`

A handoff note for the **next Claude Code session (or developer) working locally on
THIS project**. It captures the current state, how to run and verify, the design
decisions that aren't obvious from the code, and the open follow-ups — so you can
get productive without re-reading every file.

> Scope: this file is **only** about `moddtp/video-streaming-server`. It is not a
> general note and has nothing to do with any other repository or session.

---

## 1. What this project is (in one breath)

A Video-on-Demand server that streams MP4 sources to Flutter / React Native (and a
web test player) as chunked **HLS**, burning a **distinct, per-user, moving
watermark** (`email | Category`) into the pixels **on the fly** — without ever
modifying the source files. The watermark is the anti-piracy point: because the
viewer's email is in the pixels, a leaked screen-recording traces back to one
account. See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full design and the
burned-in-vs-overlay rationale.

Status: **feature-complete and verified.** Server + web player run and are tested
here; the Flutter/RN samples are delivered as buildable source (build them in your
own mobile toolchain).

---

## 2. Run it locally

```bash
npm install          # also fetches the bundled ffmpeg (postinstall self-repairs a truncated download)
npm run make-media   # generate the 3 sample MP4s into media/ (repo ships none)
npm run seed         # probe the local samples + register external streams in the catalog
npm run dev          # starts on :3000; logs "ffmpeg OK: libass burn available …"
```

Open <http://localhost:3000/>, sign in, pick a video, watch the watermark move and
flip vertical near the side borders.

Demo logins: `vdowatermark@vdowatermark.th` / `vdowatermark9630` ·
`demo@example.com` / `demo1234`.

### Verify (do this after any change)

```bash
npm run typecheck    # tsc --noEmit, must be clean
npm test             # 14 watermark unit tests (schedule/geometry/ASS) — must stay green
npm run smoke        # end-to-end: login → play → HLS → auth → source integrity
npm run wm:preview vid_mv_001 vdowatermark@vdowatermark.th   # render still frames to data/preview/
```

The unit tests pin a **byte-identical schedule** for the seeded RNG when no logo
exclusion is active — if you touch `src/watermark/`, expect to understand why a
diff there can break those 14 tests, and keep the no-logo path unchanged.

---

## 3. Where things live

```
src/
  server.ts          Fastify bootstrap + startup ffmpeg self-check; serves test-player at /, /ad.mp4
  config.ts          zod-validated env → typed config (watermark %, logo, concurrency, EXTERNAL_MAX_SECONDS)
  ffmpeg/
    binary.ts        resolve ffmpeg-static; verifyFeatures() asserts the libass burn path
    hls.ts           buildHlsArgs(): input → subtitles/overlay filter → HLS (event) muxer flags
    runner.ts        spawn wrapper: lifecycle, stderr→log, done promise, waitForReady (first segment)
    probe.ts         ffprobe wrapper (remote-aware: reconnect + read timeout)
  watermark/
    geometry.ts      mm/cm→px mapping, edge zones, rotation/anchor, opacity→alpha, computeLogoBox()
    schedule.ts      generateSchedule(): random {x,y,duration,vertical,rotation} tiling full duration
    ass.ts           renderAss(): schedule → valid .ass (the core artifact libass burns)
  catalog/
    store.ts         CatalogStore interface; resolveSourcePath / isExternalSource; toPublic (kind: local|external)
    sqlite.ts json.ts  two interchangeable stores (CATALOG_STORE=sqlite|json)
    seed.ts seed-data.ts  catalog seed: 3 local samples + curated external HLS URLs
  auth/              jwt.ts (HS256), users.ts (bcrypt demo creds), middleware (requireAuth / session guard)
  session/           manager.ts (per-session dir + ffmpeg + concurrency + cleanup), types.ts
  routes/            auth / catalog / session / stream routes
test-player/         browser HLS player (hls.js) — served at /
clients/             flutter_sample/ + react_native_sample/  (built in your toolchain)
scripts/             make-test-media, setup-ffmpeg, wm-preview, smoke-test
assets/              fonts/ (DejaVu Sans), logos/github.png, ad.mp4 (4s pre-roll)
data/                gitignored: catalog.db, sessions/<sid>/…  ·  media/ holds source MP4s (read-only)
```

---

## 4. Design decisions you must not silently undo

- **Sources are read-only.** Nothing ever opens `media/` for write. The smoke test
  asserts byte-identical sources before/after a session. Keep it that way.
- **The watermark is server-side burned-in**, never a client overlay. Do **not**
  add a watermark layer in the web/Flutter/RN clients — that would be trivially
  removable and defeats the forensic purpose. The clients only play the stream.
- **The email comes from the verified access token**, never a request body.
- **Per-user pixels ⇒ segments are not cacheable/shareable.** Output is
  `Cache-Control: no-store`. Don't add a shared segment cache keyed by video id.
- **Segment auth uses a `?t=` query token** as well as the `Authorization` header —
  mobile players and hls.js don't forward headers to segment requests, so the query
  fallback is mandatory. The playlist route rewrites each segment URI to carry it.
- **Filename allowlist** (`^(index\.m3u8|seg_\d{5}\.ts)$`) resolved strictly inside
  the session dir guards against path traversal. Keep it.
- **HLS playlist type is `event`**, finalized with `#EXT-X-ENDLIST` on completion.
  No `-loop 1` anywhere (a looped still → infinite input → the playlist never ends).
- **Concurrency is capped** (`MAX_CONCURRENT_TRANSCODES`, default = CPU cores) with
  `503` backpressure, because per-user burn-in is CPU-heavy.

---

## 5. The double-play fix (why `/play` waits on local sources)

Symptom that was reported: with the simulated ad **off**, the player would play ~4s
then restart and play the whole clip ("double-play"). Cause: `/play` used to return
as soon as the first 4s segment existed, so hls.js loaded a still-growing `event`
playlist, treated it as **live**, played the one available segment, then re-seeked
to 0 once more segments / the ENDLIST arrived. (Turning the ad on masked it by
delaying the player ~4s.)

Fix, in `src/session/manager.ts`:

- For **local** sources, `/play` now waits for ffmpeg to finish (the playlist is
  finalized to VOD with `#EXT-X-ENDLIST`) before returning, bounded by
  `LOCAL_FINALIZE_TIMEOUT_MS` (90s). The sample clips finalize in ~10s, so this is
  cheap; a pathologically long local file falls back to stream-while-transcoding
  past the cap.
- The player also passes `startPosition: 0` to hls.js, so even a still-growing
  `event` playlist (external/long sources, which we can't wait on) starts at the
  true beginning instead of adopting a live edge.

If you ever make local playback start *before* finalize again (e.g. for very long
local files), expect the double-play to return unless the player side fully handles
the live→VOD transition. The clean general fix for huge files is HW-accelerated,
faster-than-realtime transcoding plus a proper live-playback config — see §7.

---

## 6. External / URL streams

The catalog accepts `http(s)` M3U8 URLs as sources (`isExternalSource`). The server
ingests the remote stream with ffmpeg (reconnect + `-rw_timeout` flags), caps live /
very long inputs to `EXTERNAL_MAX_SECONDS` (120) via `-t`, and burns the **same**
watermark on the fly. They're probed at play time, not seed time.

Caveats:
- They only work where **the server itself** has direct internet egress. If a play
  attempt fails with "unreachable or timed out", the host can't reach that URL — not
  a bug in the pipeline. (The cloud build environment blocks external egress, so
  external plays only work when you run this locally / on a box with open internet.)
- Free public test streams **rot**. The seeds in `seed-data.ts` are the long-lived
  reference streams (Apple / Mux / Bitmovin / Unified Streaming); scraped IPTV links
  die quickly, so prefer adding reference-grade URLs there.

---

## 7. Open follow-ups / future work

- **Scale the encode**: hardware encoders (`h264_nvenc` / `qsv` / `vaapi`), a real
  job queue (BullMQ/Redis), and short-lived per-user caches. This is also what makes
  starting playback on **long** files fast without the double-play tradeoff in §5.
- **ABR ladder / fMP4 (CMAF)**: currently a single rendition matching the source.
- **Catalog/admin**: there's no upload/management UI; seeding is via `seed-data.ts`.
- **Real user store**: demo users are bcrypt entries in `src/auth/users.ts`; wire a
  real DB + signup/roles for production.
- **Mobile apps**: `clients/flutter_sample` and `clients/react_native_sample` are
  buildable source; build/run them against a reachable server (see the `CLIENT-*.md`
  docs). They were not built here (no mobile SDK in this environment).

---

## 8. Conventions

- Branch for changes, then open a PR to `master` (don't push straight to `master`).
- `npm run typecheck && npm test && npm run smoke` should all pass before a PR.
- Never reintroduce the retired demo email anywhere (`grep -ri phirapong` must be
  empty); keep `demo@example.com` / `demo1234` and the `vdowatermark@…` login.
