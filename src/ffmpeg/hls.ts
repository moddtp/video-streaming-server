import path from 'node:path';

/** Output file names, written into the session directory (ffmpeg runs with cwd = session dir). */
export const PLAYLIST_NAME = 'index.m3u8';
export const SEGMENT_PATTERN = 'seg_%05d.ts';
export const SEGMENT_PREFIX = 'seg_';
export const ASS_NAME = 'session.ass';

/** A served file is only ever the playlist or a numbered segment. */
export const STREAM_FILE_RE = /^(index\.m3u8|seg_\d{5}\.ts)$/;

/** A resolved static logo overlay, in video pixels. */
export interface LogoOverlay {
  path: string;
  sw: number;
  sh: number;
  x: number;
  y: number;
  opacity: number;
}

export interface HlsBuildOptions {
  inputPath: string;
  segmentSeconds: number;
  x264Preset: string;
  x264Crf: number;
  hasAudio: boolean;
  audioCodec: string | null;
  /** Absolute path to the per-session ASS subtitle file (watermark). Null = no watermark. */
  assPath: string | null;
  /** Absolute fonts directory for libass (used only when assPath is set). */
  fontsDir: string;
  /** Static logo overlay (pixel-resolved), or null for none. */
  logo: LogoOverlay | null;
}

/**
 * Escape a value for inclusion inside an ffmpeg filtergraph option. The filter
 * parser treats `:` as an option separator and `\` / `'` as specials.
 */
export function escapeFilterValue(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

/**
 * Build the ffmpeg argument vector to transcode `inputPath` into a live ("event")
 * HLS playlist + MPEG-TS segments. The watermark, when present, is burned in via
 * the libass `subtitles` filter reading the per-session ASS file.
 *
 * IMPORTANT: the runner must spawn ffmpeg with cwd = the session directory. The
 * ASS file, playlist and segments are referenced by relative name so we never
 * have to escape directory paths in the filtergraph (a classic footgun).
 */
export function buildHlsArgs(opts: HlsBuildOptions): string[] {
  const args = ['-hide_banner', '-loglevel', 'warning', '-nostdin', '-y', '-i', opts.inputPath];
  if (opts.logo) args.push('-i', opts.logo.path);

  // The moving text is burned via the libass `subtitles` filter (relative ASS
  // name; cwd = session dir). Only the absolute fontsdir needs escaping.
  const subs = opts.assPath ? `subtitles=${ASS_NAME}:fontsdir=${escapeFilterValue(opts.fontsDir)}` : null;

  if (opts.logo) {
    // [1:v] = the logo: apply opacity, then overlay it at a fixed corner, then
    // (optionally) burn the text on top. A single still fed to `overlay` persists
    // for the whole clip — do NOT use `-loop 1` (that makes an infinite input and
    // the event playlist would never terminate).
    const { sw, sh, x, y, opacity } = opts.logo;
    const lg = `[1:v]format=rgba,scale=${sw}:${sh},colorchannelmixer=aa=${opacity.toFixed(3)}[lg]`;
    const fc = subs
      ? `${lg};[0:v][lg]overlay=${x}:${y}[bg];[bg]${subs}[out]`
      : `${lg};[0:v][lg]overlay=${x}:${y}[out]`;
    // -map "[out]" disables default stream selection, so map audio explicitly.
    args.push('-filter_complex', fc, '-map', '[out]', '-map', '0:a?');
  } else if (subs) {
    args.push('-vf', subs);
  }

  // Burning pixels requires a video re-encode (cannot -c:v copy). Force keyframes
  // at segment boundaries so segments land near segmentSeconds.
  args.push(
    '-c:v',
    'libx264',
    '-preset',
    opts.x264Preset,
    '-crf',
    String(opts.x264Crf),
    '-pix_fmt',
    'yuv420p',
    '-force_key_frames',
    `expr:gte(t,n_forced*${opts.segmentSeconds})`,
  );

  // Audio is independent of the (video-only) watermark filter, so copying an
  // already-AAC track is always safe and cheap.
  if (!opts.hasAudio) args.push('-an');
  else if (opts.audioCodec === 'aac') args.push('-c:a', 'copy');
  else args.push('-c:a', 'aac', '-b:a', '128k');

  args.push(
    '-f',
    'hls',
    '-hls_time',
    String(opts.segmentSeconds),
    '-hls_playlist_type',
    'event',
    '-hls_segment_type',
    'mpegts',
    '-hls_flags',
    'independent_segments',
    '-hls_segment_filename',
    SEGMENT_PATTERN,
    PLAYLIST_NAME,
  );
  return args;
}

/** Relative segment file name for index N (matches SEGMENT_PATTERN). */
export function segmentName(n: number): string {
  return `${SEGMENT_PREFIX}${String(n).padStart(5, '0')}.ts`;
}

/** Absolute playlist path within a session dir. */
export function playlistPath(sessionDir: string): string {
  return path.join(sessionDir, PLAYLIST_NAME);
}
