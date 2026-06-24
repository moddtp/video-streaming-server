#!/usr/bin/env node
// Ensure the ffmpeg-static binary is present and actually executable.
//
// The npm postinstall download is occasionally truncated (interrupted stream,
// flaky network/proxy), leaving a corrupt binary that segfaults. This script
// verifies the bundled binary runs and, if not, re-downloads the correct
// release asset from GitHub. Run automatically (postinstall) and via
// `npm run setup:ffmpeg`. Override entirely with FFMPEG_PATH if you prefer a
// system ffmpeg (must be built --enable-libass).
import { spawnSync } from 'node:child_process';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function log(msg) {
  process.stdout.write(`[setup:ffmpeg] ${msg}\n`);
}

if (process.env.FFMPEG_PATH && process.env.FFMPEG_PATH.trim() !== '') {
  log(`FFMPEG_PATH is set (${process.env.FFMPEG_PATH}); skipping bundled-binary repair.`);
  process.exit(0);
}

let binPath;
try {
  binPath = require('ffmpeg-static');
} catch {
  log('ffmpeg-static is not installed; run `npm install` first.');
  process.exit(0); // don't hard-fail install
}
if (!binPath) {
  log('ffmpeg-static reported no binary for this platform.');
  process.exit(0);
}

function runs(p) {
  if (!existsSync(p)) return false;
  const r = spawnSync(p, ['-hide_banner', '-version'], { encoding: 'utf8' });
  return r.status === 0 && /ffmpeg version/i.test(r.stdout || '');
}

if (runs(binPath)) {
  log(`OK: ${binPath} (${(statSync(binPath).size / 1e6).toFixed(1)} MB) runs.`);
  process.exit(0);
}

log(`bundled ffmpeg at ${binPath} is missing or broken — re-downloading…`);

// Determine the release asset name from ffmpeg-static's own package.json.
const pkgDir = dirname(binPath);
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const tag = process.env.FFMPEG_BINARY_RELEASE || pkg['ffmpeg-static']['binary-release-tag'];
const asset = `ffmpeg-${process.platform}-${process.arch}${process.platform === 'win32' ? '.exe' : ''}`;
const url =
  (process.env.FFMPEG_BINARIES_URL ||
    'https://github.com/eugeneware/ffmpeg-static/releases/download') + `/${tag}/${asset}`;

if (!spawnSync('curl', ['--version'], { encoding: 'utf8' }).stdout) {
  log('curl is not available. Manually download the asset and set FFMPEG_PATH:');
  log(`  ${url}`);
  process.exit(1);
}

// Use the agent/proxy CA bundle if one is configured (harmless otherwise).
const caCandidates = [process.env.NODE_EXTRA_CA_CERTS, '/root/.ccr/ca-bundle.crt'].filter(Boolean);
const ca = caCandidates.find((p) => existsSync(p));
const args = ['-fSL', '--retry', '3', '--retry-delay', '2', url, '-o', binPath];
if (ca) args.unshift('--cacert', ca);

log(`downloading ${url}`);
const dl = spawnSync('curl', args, { stdio: 'inherit' });
if (dl.status !== 0) {
  log('download failed. Set FFMPEG_PATH to a working ffmpeg (built --enable-libass).');
  process.exit(1);
}
spawnSync('chmod', ['+x', binPath]);

const size = statSync(binPath).size;
if (size < 30_000_000) {
  log(`downloaded file is suspiciously small (${(size / 1e6).toFixed(1)} MB); likely truncated.`);
  process.exit(1);
}
if (!runs(binPath)) {
  log('re-downloaded binary still does not run. Set FFMPEG_PATH to a working ffmpeg.');
  process.exit(1);
}
log(`repaired: ${binPath} (${(size / 1e6).toFixed(1)} MB) now runs.`);
