import { ffprobePath } from './binary';
import { capture } from '../util/proc';

export interface ProbeResult {
  width: number | null;
  height: number | null;
  durationSec: number;
  hasAudio: boolean;
  audioCodec: string | null;
}

/** Inspect a media file (local path OR remote URL) with ffprobe to get
 * resolution, duration, and audio info. For remote inputs, pass `{ remote: true }`
 * to add a read timeout and bound the call. */
export async function probeVideo(file: string, opts: { remote?: boolean } = {}): Promise<ProbeResult> {
  if (!ffprobePath) throw new Error('ffprobe binary not found (ffprobe-static missing).');
  const args = ['-v', 'quiet'];
  if (opts.remote) args.push('-rw_timeout', '15000000'); // 15s read timeout for remote
  args.push('-print_format', 'json', '-show_format', '-show_streams', file);
  const { stdout, code, stderr } = await capture(ffprobePath, args, opts.remote ? { timeoutMs: 20000 } : {});
  if (code !== 0) {
    throw new Error(`ffprobe failed for "${file}": ${stderr.trim() || 'unreachable or timed out'}`);
  }

  const data = JSON.parse(stdout) as {
    streams?: Array<{ codec_type?: string; width?: number; height?: number; duration?: string; codec_name?: string }>;
    format?: { duration?: string };
  };
  const streams = data.streams ?? [];
  const video = streams.find((s) => s.codec_type === 'video');
  const audio = streams.find((s) => s.codec_type === 'audio');
  const durationSec = Number(data.format?.duration ?? video?.duration ?? 0) || 0;

  return {
    width: video?.width ?? null,
    height: video?.height ?? null,
    durationSec,
    hasAudio: Boolean(audio),
    audioCodec: audio?.codec_name ?? null,
  };
}
