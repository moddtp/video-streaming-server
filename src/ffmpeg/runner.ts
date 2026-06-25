import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { ffmpegPath } from './binary';
import { PLAYLIST_NAME } from './hls';
import { logger } from '../logger';

export interface HlsRunnerOptions {
  /** Session working directory; ffmpeg runs here and writes the playlist + segments. */
  cwd: string;
  args: string[];
  label: string;
}

type Status = 'idle' | 'running' | 'finished' | 'error' | 'killed';

/**
 * Owns one long-running ffmpeg HLS transcode for a session: spawns it with the
 * session dir as cwd, pipes stderr to the log, exposes a readiness promise (first
 * segment available) and a clean kill().
 */
export class HlsRunner {
  status: Status = 'idle';
  exitCode: number | null = null;
  /** Resolves when the ffmpeg process has exited (any terminal state). */
  readonly done: Promise<void>;
  private resolveDone!: () => void;
  private proc: ChildProcess | null = null;
  private stderrTail: string[] = [];
  private readonly log = logger.child({ comp: 'ffmpeg' });

  constructor(private readonly opts: HlsRunnerOptions) {
    this.done = new Promise((resolve) => {
      this.resolveDone = resolve;
    });
  }

  start(): void {
    if (this.status !== 'idle') return;
    if (!ffmpegPath) throw new Error('ffmpeg binary not available');
    this.status = 'running';
    this.log.info({ label: this.opts.label, cwd: this.opts.cwd }, 'ffmpeg start');

    const proc = spawn(ffmpegPath, this.opts.args, {
      cwd: this.opts.cwd,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    this.proc = proc;

    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      // Keep a small tail for diagnostics on failure.
      this.stderrTail.push(text);
      if (this.stderrTail.length > 50) this.stderrTail.shift();
    });

    proc.on('error', (err) => {
      this.status = 'error';
      this.log.error({ label: this.opts.label, err: err.message }, 'ffmpeg spawn error');
      this.resolveDone();
    });

    proc.on('close', (code, signal) => {
      this.exitCode = code;
      if (this.status === 'killed') {
        this.log.info({ label: this.opts.label, signal }, 'ffmpeg killed');
      } else if (code === 0) {
        this.status = 'finished';
        this.log.info({ label: this.opts.label }, 'ffmpeg finished');
      } else {
        this.status = 'error';
        this.log.error(
          { label: this.opts.label, code, signal, tail: this.stderrTail.join('').slice(-1200) },
          'ffmpeg exited non-zero',
        );
      }
      this.resolveDone();
    });
  }

  /**
   * Resolve once the playlist exists and references at least one segment whose
   * file is on disk — i.e. playback can begin. Rejects if ffmpeg dies first or
   * the timeout elapses.
   */
  waitForReady(timeoutMs = 30_000): Promise<void> {
    const playlist = path.join(this.opts.cwd, PLAYLIST_NAME);
    const startedAt = Date.now();
    return new Promise((resolve, reject) => {
      const tick = () => {
        if (this.status === 'error') {
          return reject(new Error(`ffmpeg failed: ${this.stderrTail.join('').slice(-600)}`));
        }
        if (this.firstSegmentReady(playlist)) return resolve();
        if (this.status === 'finished') {
          // Finished but produced nothing usable.
          return this.firstSegmentReady(playlist)
            ? resolve()
            : reject(new Error('ffmpeg finished without producing segments'));
        }
        if (Date.now() - startedAt > timeoutMs) {
          return reject(new Error(`timed out waiting for first HLS segment after ${timeoutMs}ms`));
        }
        setTimeout(tick, 150);
      };
      tick();
    });
  }

  private firstSegmentReady(playlist: string): boolean {
    if (!existsSync(playlist)) return false;
    let text: string;
    try {
      text = readFileSync(playlist, 'utf8');
    } catch {
      return false;
    }
    // First segment URI line (non-comment). Confirm the file exists AND has bytes
    // (so playback never starts against a just-created, still-empty segment).
    const seg = text
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#'));
    if (!seg) return false;
    try {
      return statSync(path.join(this.opts.cwd, seg.split('?')[0])).size > 0;
    } catch {
      return false;
    }
  }

  kill(): void {
    if (this.proc && (this.status === 'running' || this.status === 'idle')) {
      this.status = 'killed';
      this.proc.kill('SIGKILL');
    }
  }

  get running(): boolean {
    return this.status === 'running';
  }
}
