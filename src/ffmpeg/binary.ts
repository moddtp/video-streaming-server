import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { config } from '../config';
import { logger } from '../logger';
import { capture } from '../util/proc';

/** Absolute path to the ffmpeg binary (env override, else the bundled static build). */
export const ffmpegPath: string | null =
  config.ffmpegPathOverride ?? (ffmpegStatic as unknown as string | null) ?? null;

/** Absolute path to the ffprobe binary (env override, else the bundled static build). */
export const ffprobePath: string | null =
  config.ffprobePathOverride ?? (ffprobeStatic as { path?: string } | undefined)?.path ?? null;

export interface FfmpegFeatures {
  version: string;
  runs: boolean;
  /** The `subtitles` filter (libass) — our primary watermark burn path. */
  subtitles: boolean;
  /** The `ass` filter (libass) — an equivalent fallback burn path. */
  ass: boolean;
  /** `drawtext` (libfreetype) — optional; many static builds omit it, so we don't require it. */
  drawtext: boolean;
  libass: boolean;
}

/** Probe the ffmpeg binary for the filters and libraries this server depends on. */
export async function verifyFeatures(): Promise<FfmpegFeatures> {
  if (!ffmpegPath) {
    throw new Error(
      'ffmpeg binary not found. Install dependencies (npm install pulls ffmpeg-static), ' +
        'run `npm run setup:ffmpeg` to repair a truncated download, ' +
        'or set FFMPEG_PATH to a system ffmpeg built with --enable-libass.',
    );
  }
  const [filters, build, version] = await Promise.all([
    capture(ffmpegPath, ['-hide_banner', '-filters']),
    capture(ffmpegPath, ['-hide_banner', '-buildconf']),
    capture(ffmpegPath, ['-hide_banner', '-version']),
  ]);
  const filtersText = `${filters.stdout}\n${filters.stderr}`;
  const buildText = `${build.stdout}\n${build.stderr}`;
  const versionLine = (version.stdout || version.stderr).split('\n')[0]?.trim() ?? '';
  // Match the filter *name* column specifically (avoids matching "subtitles" in a description).
  const hasFilter = (name: string) =>
    new RegExp(`^\\s*[A-Z.]{3}\\s+${name}\\s`, 'm').test(filtersText);
  return {
    version: versionLine || 'unknown',
    runs: version.code === 0 && /ffmpeg version/i.test(versionLine),
    subtitles: hasFilter('subtitles'),
    ass: hasFilter('ass'),
    drawtext: hasFilter('drawtext'),
    libass: /enable-libass/.test(buildText),
  };
}

/**
 * Verify ffmpeg can do everything we need, or throw with a remediation hint.
 * Called once at startup so the server fails fast instead of at first playback.
 * We require a working binary plus at least one libass burn path (subtitles/ass).
 */
export async function assertFeatures(): Promise<FfmpegFeatures> {
  const f = await verifyFeatures();
  if (!f.runs) {
    throw new Error(
      `ffmpeg at "${ffmpegPath}" does not execute (likely a truncated/corrupt download). ` +
        'Run `npm run setup:ffmpeg` to re-download it, or set FFMPEG_PATH to a working ffmpeg.',
    );
  }
  if (!f.subtitles && !f.ass) {
    throw new Error(
      `ffmpeg at "${ffmpegPath}" has no libass burn filter (subtitles/ass not found). ` +
        'The watermark requires an ffmpeg built with --enable-libass. ' +
        'Install one and point FFMPEG_PATH at it.',
    );
  }
  logger.info(
    {
      version: f.version,
      burnFilter: f.subtitles ? 'subtitles' : 'ass',
      ass: f.ass,
      drawtext: f.drawtext,
      libass: f.libass,
      ffmpegPath,
      ffprobePath,
    },
    `ffmpeg OK: libass burn available via "${f.subtitles ? 'subtitles' : 'ass'}" filter`,
  );
  return f;
}
