import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config';
import { logger } from '../logger';
import { resolveSourcePath, type VideoMeta } from '../catalog/store';
import { probeVideo } from '../ffmpeg/probe';
import { buildHlsArgs, ASS_NAME } from '../ffmpeg/hls';
import { HlsRunner } from '../ffmpeg/runner';
import { generateSchedule } from '../watermark/schedule';
import { renderAss } from '../watermark/ass';
import { Semaphore } from '../util/semaphore';
import type { Session } from './types';

export interface CreateSessionInput {
  video: VideoMeta;
  email: string;
  userId: string;
}

/** Thrown when all transcode slots are busy; the route maps this to HTTP 503. */
export class TranscodeBusyError extends Error {
  readonly busy = true;
  constructor(message = 'All transcode slots are busy') {
    super(message);
    this.name = 'TranscodeBusyError';
  }
}

/** Tracks live playback sessions and owns their ffmpeg processes + output dirs. */
export class SessionManager {
  private readonly sessions = new Map<string, Session>();
  private sweepTimer: NodeJS.Timeout | null = null;
  private readonly transcodeSlots = new Semaphore(config.maxConcurrentTranscodes);

  async createSession({ video, email, userId }: CreateSessionInput): Promise<Session> {
    // Cap concurrent burn-in transcodes (each is CPU-heavy). 503 when full.
    const release = this.transcodeSlots.tryAcquire();
    if (!release) throw new TranscodeBusyError();

    const id = randomUUID().replace(/-/g, '');
    const dir = path.join(config.sessionsDir, id);
    let runner: HlsRunner | undefined;
    try {
      await mkdir(dir, { recursive: true });

      const inputPath = resolveSourcePath(video.sourcePath);
      const probe = await probeVideo(inputPath);
      const width = probe.width ?? video.width;
      const height = probe.height ?? video.height;
      const durationSec = probe.durationSec || video.durationSec || 0;

      // Generate the per-user watermark: "<email> | <category>", scheduled to move
      // to a random border every 3–12s (vertical on the left/right edges), then burn
      // it in via the ASS file. Source is only read, never written.
      let assPath: string | null = null;
      if (width && height && durationSec > 0) {
        const text = `${email} | ${video.category}`;
        const plan = generateSchedule({ durationSec, width, height, text, config: config.watermark });
        assPath = path.join(dir, ASS_NAME);
        await writeFile(assPath, renderAss(plan, text), 'utf8');
        logger.info(
          { id, res: `${width}x${height}`, fontPx: plan.style.fontPx, intervals: plan.intervals.length, seed: plan.seed },
          'watermark schedule generated',
        );
      } else {
        logger.warn({ id, width, height, durationSec }, 'missing dimensions/duration — streaming without watermark');
      }

      const args = buildHlsArgs({
        inputPath,
        segmentSeconds: config.hlsSegmentSeconds,
        x264Preset: config.x264Preset,
        x264Crf: config.x264Crf,
        hasAudio: probe.hasAudio,
        audioCodec: probe.audioCodec,
        assPath,
        fontsDir: config.fontsDir,
      });

      runner = new HlsRunner({ cwd: dir, args, label: `${video.id}:${id.slice(0, 8)}` });
      const now = Date.now();
      const session: Session = {
        id,
        userId,
        email,
        videoId: video.id,
        category: video.category,
        dir,
        width,
        height,
        createdAt: now,
        expiresAt: now + config.sessionTtlMs,
        lastAccessAt: now,
        status: 'starting',
        runner,
      };
      this.sessions.set(id, session);

      runner.start();
      // Release the transcode slot when ffmpeg exits (finished/killed/error), not when
      // the session ends — a finished session still serves its already-written segments.
      void runner.done.finally(release);

      await runner.waitForReady();
      session.status = 'ready';
      logger.info({ id, videoId: video.id, userId, slotsInUse: this.transcodeSlots.inUse }, 'session ready');
      return session;
    } catch (err) {
      release();
      if (runner) runner.kill();
      this.sessions.delete(id);
      await this.cleanup({ id, dir });
      throw err;
    }
  }

  get(id: string): Session | undefined {
    const s = this.sessions.get(id);
    if (s) s.lastAccessAt = Date.now();
    return s;
  }

  list(): Session[] {
    return [...this.sessions.values()];
  }

  async endSession(id: string): Promise<void> {
    const s = this.sessions.get(id);
    if (!s) return;
    s.status = 'ended';
    s.runner.kill();
    this.sessions.delete(id);
    await this.cleanup(s);
    logger.info({ id }, 'session ended');
  }

  private async cleanup(s: { id: string; dir: string }): Promise<void> {
    try {
      await rm(s.dir, { recursive: true, force: true });
    } catch (err) {
      logger.warn({ id: s.id, err: err instanceof Error ? err.message : String(err) }, 'session cleanup failed');
    }
  }

  /** Periodically reap expired and idle (abandoned) sessions. */
  startSweeper(intervalMs = 30_000): void {
    if (this.sweepTimer) return;
    const idleMs = config.sessionIdleTimeoutSec * 1000;
    this.sweepTimer = setInterval(() => {
      const now = Date.now();
      for (const s of this.sessions.values()) {
        const expired = now > s.expiresAt;
        const idle = now - s.lastAccessAt > idleMs;
        if (expired || idle) {
          logger.info({ id: s.id, reason: expired ? 'expired' : 'idle' }, 'reaping session');
          void this.endSession(s.id);
        }
      }
    }, intervalMs);
    this.sweepTimer.unref();
  }

  stopSweeper(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /** Stop sweeping and kill all ffmpeg children (called on server shutdown). */
  async shutdown(): Promise<void> {
    this.stopSweeper();
    for (const s of this.sessions.values()) s.runner.kill();
  }
}
