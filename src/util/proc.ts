import { spawn, type SpawnOptions } from 'node:child_process';

export interface CaptureResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface CaptureOptions extends SpawnOptions {
  /** Kill the process after this many ms (e.g. for a remote ffprobe that hangs). */
  timeoutMs?: number;
}

/**
 * Run a command to completion and capture its output. Used for short-lived
 * tooling calls (ffmpeg -filters, ffprobe -show_streams). Never use this for
 * the long-running HLS transcode — see ffmpeg/runner.ts for that.
 */
export function capture(bin: string, args: string[], opts: CaptureOptions = {}): Promise<CaptureResult> {
  const { timeoutMs, ...spawnOpts } = opts;
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { ...spawnOpts, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = timeoutMs ? setTimeout(() => child.kill('SIGKILL'), timeoutMs) : undefined;
    timer?.unref?.();
    child.stdout?.on('data', (d) => (stdout += d.toString()));
    child.stderr?.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}
