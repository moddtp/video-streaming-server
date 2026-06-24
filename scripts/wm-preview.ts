/**
 * Dev tool: render a few still frames showing the burned-in watermark (moving
 * text + optional static logo) for a catalog video, so you can eyeball styling
 * — size, opacity, vertical text, and that the text avoids the logo — without a
 * player. Honors the same LOGO_* config the server uses. Outputs PNGs to
 * data/preview/<videoId>/.
 *
 *   LOGO_POSITION=bottom-right npx tsx scripts/wm-preview.ts [videoId] [email] [seed]
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { config } from '../src/config';
import { ffmpegPath } from '../src/ffmpeg/binary';
import { probeVideo } from '../src/ffmpeg/probe';
import { createCatalogStore, resolveSourcePath } from '../src/catalog/store';
import { generateSchedule } from '../src/watermark/schedule';
import { renderAss } from '../src/watermark/ass';
import { computeLogoBox } from '../src/watermark/geometry';
import { ASS_NAME } from '../src/ffmpeg/hls';
import type { Border, Rect } from '../src/watermark/types';

async function main() {
  const videoId = process.argv[2] ?? 'vid_mv_001';
  const email = process.argv[3] ?? 'vdowatermark@vdowatermark.th';
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

  // Resolve the static logo (same rules as the server) → overlay params + no-go rect.
  let logo: { path: string; sw: number; sh: number; x: number; y: number; opacity: number } | null = null;
  let exclusion: Rect | null = null;
  const pos = config.logo.position;
  if (pos !== 'disabled' && existsSync(config.logo.file)) {
    const lp = await probeVideo(config.logo.file);
    if (lp.width && lp.height) {
      const box = computeLogoBox(width, height, lp.width, lp.height, {
        position: pos,
        sizePct: config.logo.sizePct,
        gapXPct: config.logo.gapXPct,
        gapYPct: config.logo.gapYPct,
      });
      logo = { path: config.logo.file, sw: box.w, sh: box.h, x: box.x, y: box.y, opacity: config.logo.opacity };
      exclusion = box;
    }
  }

  const outDir = path.join(config.root, 'data', 'preview', videoId);
  mkdirSync(outDir, { recursive: true });
  const plan = generateSchedule({ durationSec: probe.durationSec, width, height, text, config: config.watermark, seed, exclusion });
  writeFileSync(path.join(outDir, ASS_NAME), renderAss(plan, text), 'utf8');

  console.log(`video=${videoId} ${width}x${height} dur=${probe.durationSec}s intervals=${plan.intervals.length} seed=${seed}`);
  console.log(`text="${text}"`);
  console.log(logo ? `logo=${pos} box=(${logo.x},${logo.y} ${logo.sw}x${logo.sh}) opacity=${logo.opacity}` : 'logo=disabled');

  // Pick the first interval for each border so we capture both orientations.
  const wanted: Border[] = ['left', 'right', 'top', 'bottom'];
  const picks = wanted
    .map((b) => plan.intervals.find((iv) => iv.border === b))
    .filter((iv): iv is NonNullable<typeof iv> => Boolean(iv));

  for (const iv of picks) {
    const t = (iv.startSec + iv.endSec) / 2;
    const outFile = path.join(outDir, `frame_${iv.border}_t${t.toFixed(1)}.png`);
    const subs = `subtitles=${ASS_NAME}:fontsdir=${config.fontsDir}`;
    const sel = `select=gte(t\\,${t.toFixed(3)})`;
    let args: string[];
    if (logo) {
      // Match the server's filter_complex; append the frame selector to the chain.
      const lg = `[1:v]format=rgba,scale=${logo.sw}:${logo.sh},colorchannelmixer=aa=${logo.opacity.toFixed(3)}[lg]`;
      const fc = `${lg};[0:v][lg]overlay=${logo.x}:${logo.y}[bg];[bg]${subs},${sel}[out]`;
      args = ['-hide_banner', '-loglevel', 'error', '-i', src, '-i', logo.path, '-filter_complex', fc, '-map', '[out]', '-frames:v', '1', '-y', outFile];
    } else {
      args = ['-hide_banner', '-loglevel', 'error', '-i', src, '-vf', `${subs},${sel}`, '-frames:v', '1', '-y', outFile];
    }
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
