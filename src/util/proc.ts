import { spawn, type SpawnOptions } from 'node:child_process';

export interface CaptureResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Run a command to completion and capture its output. Used for short-lived
 * tooling calls (ffmpeg -filters, ffprobe -show_streams). Never use this for
 * the long-running HLS transcode — see ffmpeg/runner.ts for that.
 */
export function capture(bin: string, args: string[], opts: SpawnOptions = {}): Promise<CaptureResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => (stdout += d.toString()));
    child.stderr?.on('data', (d) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}
