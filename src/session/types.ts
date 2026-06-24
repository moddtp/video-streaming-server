import type { HlsRunner } from '../ffmpeg/runner';

export type SessionStatus = 'starting' | 'ready' | 'ended' | 'error';

/** A single playback session: one authenticated user watching one video, with
 * its own watermarked HLS output directory and ffmpeg process. */
export interface Session {
  id: string;
  userId: string;
  /** Authenticated user email — the first field of the burned-in watermark. */
  email: string;
  videoId: string;
  /** Video category — the second field of the watermark. */
  category: string;
  /** Absolute per-session output directory (playlist, segments, ASS file). */
  dir: string;
  width: number | null;
  height: number | null;
  createdAt: number;
  expiresAt: number;
  lastAccessAt: number;
  status: SessionStatus;
  runner: HlsRunner;
}
