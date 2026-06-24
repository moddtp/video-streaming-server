/**
 * Dev tool: render a few still frames showing the burned-in watermark for a
 * catalog video, so you can eyeball the styling (size, opacity, vertical text)
 * without a player. Outputs PNGs to data/preview/<videoId>/.
 *
 *   npx tsx scripts/wm-preview.ts [videoId] [email] [seed]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { config } from '../src/config';
import { ffmpegPath } from '../src/ffmpeg/binary';
import { probeVideo } from '../src/ffmpeg/probe';
import { createCatalogStore, resolveSourcePath } from '../src/catalog/store';
import { generateSchedule } from '../src/watermark/schedule';
import { renderAss } from '../src/watermark/ass';
import { ASS_NAME } from '../src/ffmpeg/hls';
import type { Border } from '../src/watermark/types';

async function main() {
  const videoId = process.argv[2] ?? 'vid_mv_001';
  const email = process.argv[3] ?? 'phirapong@icbsolution.com';
  const seed = process.argv[4] ? Number(process.argv[4]) : 42;

  const store = await createCatalogStore();
  const video = await store.getVideo(videoId);
  await store.close();
  if (!video) throw new Error(`No video "${videoId}"`);

  const src = resolveSourcePath(video.sourcePath);
  const probe = await probeVideo(src);
  const width = probe.width!;
  const height = probe.height!;
  const text = `${email} | ${video.category}`;

  const outDir = path.join(config.root, 'data', 'preview', videoId);
  mkdirSync(outDir, { recursive: true });
  const plan = generateSchedule({ durationSec: probe.durationSec, width, height, text, config: config.watermark, seed });
  writeFileSync(path.join(outDir, ASS_NAME), renderAss(plan, text), 'utf8');

  console.log(`video=${videoId} ${width}x${height} dur=${probe.durationSec}s intervals=${plan.intervals.length} seed=${seed}`);
  console.log(`text="${text}"`);

  // Pick the first interval for each border so we capture both orientations.
  const wanted: Border[] = ['left', 'right', 'top', 'bottom'];
  const picks = wanted
    .map((b) => plan.intervals.find((iv) => iv.border === b))
    .filter((iv): iv is NonNullable<typeof iv> => Boolean(iv));

  for (const iv of picks) {
    const t = (iv.startSec + iv.endSec) / 2;
    const outFile = path.join(outDir, `frame_${iv.border}_t${t.toFixed(1)}.png`);
    // Decode from start, burn the ASS, select the frame at time t (escape the comma).
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      src,
      '-vf',
      `subtitles=${ASS_NAME}:fontsdir=${config.fontsDir},select=gte(t\\,${t.toFixed(3)})`,
      '-frames:v',
      '1',
      '-y',
      outFile,
    ];
    const r = spawnSync(ffmpegPath!, args, { cwd: outDir, encoding: 'utf8' });
    if (r.status !== 0) {
      console.error(`frame ${iv.border} @${t.toFixed(1)}s FAILED: ${r.stderr}`);
    } else {
      console.log(`frame ${iv.border.padEnd(6)} @${t.toFixed(1).padStart(5)}s  rot=${iv.rotation}  pos=(${iv.x},${iv.y})  -> ${path.relative(config.root, outFile)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
