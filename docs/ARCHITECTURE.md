# Architecture

## Goal

Stream MP4 sources to Flutter / React Native apps as chunked HLS, with a
**distinct, per-user, moving watermark burned into the video on the fly**, while
**never modifying the source files**. The watermark (`email | Category`) is a
forensic anti-piracy mark: rendered into the pixels, it survives screen-recording
and re-streaming and identifies the leaking account.

## Why HLS ("streaming as chunks")

Serving one big MP4 makes seeking/buffering clunky and hands the client a single
downloadable file. HLS instead cuts each stream into short **segments** (here ~4s
MPEG-TS) listed in a **playlist** (`.m3u8`); the player fetches them in order.

HLS is the lowest-friction choice for these clients: it plays **natively** on iOS
(AVPlayer) and Android (ExoPlayer/Media3), so the same stream works for Flutter's
`video_player` and React Native's `react-native-video` with no extra decoding
libraries. (DASH has no native iOS path; we use HLS. fMP4/CMAF and a multi-bitrate
ladder are possible later optimizations.)

## Playback flow

```
POST /api/login              {email,password} → access JWT (carries verified email)
GET  /api/videos             list catalog (public metadata)
POST /api/videos/:id/play    → server: look up category + source, generate the
                               per-user watermark schedule + ASS file, spawn ffmpeg
                               (source → watermarked HLS), wait for the first
                               segment, return {playlistUrl, sessionToken}
GET  /stream/:sid/index.m3u8?t=…   playlist; segment URIs rewritten to carry ?t=
GET  /stream/:sid/seg_NNNNN.ts?t=… segments, served from the per-session dir
```

A background sweeper reaps idle/expired sessions (kills ffmpeg, removes the dir),
and shutdown kills all ffmpeg children.

## The watermark engine

The novel part. Instead of hundreds of chained `drawtext` filters (which also
can't rotate text), we generate a per-session **ASS subtitle file** and let
libass burn it in via ffmpeg's `subtitles` filter. ASS natively expresses
everything the requirement needs:

| Requirement                         | ASS mechanism                                  |
| ----------------------------------- | ---------------------------------------------- |
| show at a position from t1..t2      | one `Dialogue:` line per interval with Start/End |
| absolute position                   | `\pos(x,y)` (PlayResX/Y = video size ⇒ pixels) |
| **vertical text on left/right**     | `\frz90` (left, reads up) / `\frz270` (right, reads down) |
| opacity 50–75%                      | alpha in the colour (`&H59FFFFFF` = white @ ~65%) |
| white text + legibility             | white primary, black outline + shadow          |

### Schedule (`src/watermark/schedule.ts`)

Tiles the **whole duration** with intervals; each lasts a random **3–12s**, then
the watermark "suddenly" jumps. Each interval hugs a **random border** (with the
gap) so the mark is always near an edge, never floating in the dead centre:
top/bottom → horizontal, left/right → vertical. Consecutive intervals never reuse
the same border, guaranteeing visible movement. A fixed `seed` reproduces a
schedule (used by tests); otherwise it's random per session.

### Units → pixels (a documented approximation)

The server burns pixels and can't know a phone's physical DPI, so the requested
mm/cm map to a fraction of the frame (all in `.env`): text height ≈ 3.5% of
height (≈ "4–6 mm"), border gap ≈ 4% (≈ "1.5–2.5 cm"), opacity 0.65 (≈ "50–75%").
(A client-side overlay *could* honour mm/cm because the device knows its DPI —
that's part of the tradeoff below.)

### Burn command

`ffmpeg` runs with the session dir as cwd, so the ASS/playlist/segment names are
relative and we avoid escaping directory paths in the filtergraph:

```
ffmpeg -i <source.mp4> \
  -vf "subtitles=session.ass:fontsdir=<assets/fonts>" \
  -c:v libx264 -preset veryfast -crf 21 -pix_fmt yuv420p \
  -force_key_frames "expr:gte(t,n_forced*4)" \
  -c:a copy \                # audio is untouched by the (video-only) watermark
  -f hls -hls_time 4 -hls_playlist_type event -hls_segment_type mpegts \
  -hls_segment_filename seg_%05d.ts index.m3u8
```

Burning pixels requires a video re-encode (no `-c:v copy`). A bundled DejaVu Sans
(`assets/fonts/`) is passed via `fontsdir` so libass never silently substitutes.

## On-the-fly architecture & scaling

Because the watermark embeds the user's email, **segments can't be shared or
cached across users**. The MVP starts one ffmpeg per session writing an `event`
playlist and serves segments as they appear; a counting semaphore caps concurrent
transcodes (`MAX_CONCURRENT_TRANSCODES`, default = CPU cores) and returns `503` +
`Retry-After` when full. The transcode slot is released when ffmpeg exits, not
when the session ends (a finished session still serves its cached segments).

For real scale, per-user burn-in is the cost lever:

- **Hardware encoders** — `h264_nvenc` / `h264_qsv` / `h264_vaapi` (5–20× throughput).
- **Job queue** — BullMQ/Redis worker pools with backpressure + autoscale.
- **Idle reclaim** — already kills ffmpeg + dir when a session goes idle.

## Burned-in vs client-overlay (the tradeoff)

| Dimension                 | Server-side burned-in (this server)        | Client-side overlay                         |
| ------------------------- | ------------------------------------------ | ------------------------------------------- |
| Forensic strength         | Strong — survives screen-record / re-stream | Weak — a modified app or raw-stream capture strips it |
| CPU cost / scale          | High — per-user re-encode (needs HW/queue) | Near-zero — one shared stream for everyone  |
| Honours mm/cm literally   | No (no DPI) — maps to % of frame           | Yes (device knows DPI)                      |
| Stream cacheability       | None (per-user pixels)                     | Full                                        |

This server implements burned-in because the watermark's purpose is forensic. The
catalog/session layers would be reusable if you later add an overlay path.

## Security model

- The watermark email is taken from the **verified access token**, never from a
  request body.
- Stream filenames are an allowlist (`index.m3u8` / `seg_NNNNN.ts`) resolved
  strictly inside the session dir — no path traversal.
- The session token (separate from the access token, bound to `sid`) guards every
  playlist/segment request, accepted as `Authorization: Bearer` or `?t=` query.
- Per-user content is served `Cache-Control: no-store`.
- Sources under `media/` are only ever read; the smoke test asserts the source
  SHA-256 is unchanged after a session.

## Note on the bundled FFmpeg

The bundled `ffmpeg-static` build (John Van Sickle, FFmpeg 7) is used **only to
encode** (source MP4 → watermarked HLS), which it does correctly. Its MPEG-TS
*demuxer* can crash in this environment, so verification tooling validates
segments with **ffprobe** instead of ffmpeg. This does not affect playback:
hls.js and the native iOS/Android players use their own demuxers. The startup
self-check (`src/ffmpeg/binary.ts`) verifies the libass burn path before serving;
`npm run setup:ffmpeg` repairs a truncated download or you can point `FFMPEG_PATH`
at a system ffmpeg built `--enable-libass`.
