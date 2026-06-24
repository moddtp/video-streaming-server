import fs from 'node:fs';
import { config } from '../config';
import { logger } from '../logger';
import { probeVideo } from '../ffmpeg/probe';
import { createCatalogStore, resolveSourcePath, type VideoMeta } from './store';
import { VIDEO_SEEDS } from './seed-data';

/**
 * Populate the catalog from VIDEO_SEEDS, probing each source file for its real
 * resolution and duration. Run after `npm run make-media`. Idempotent (upsert).
 */
async function seed() {
  const store = await createCatalogStore();
  let ok = 0;
  let missing = 0;

  for (const s of VIDEO_SEEDS) {
    const abs = resolveSourcePath(s.sourceFile);
    const meta: VideoMeta = {
      id: s.id,
      title: s.title,
      category: s.category,
      sourcePath: s.sourceFile,
      durationSec: 0,
      width: null,
      height: null,
    };

    if (!fs.existsSync(abs)) {
      logger.warn({ id: s.id, file: abs }, 'source file missing — seeding metadata without probe (run `npm run make-media`)');
      missing++;
    } else {
      const probe = await probeVideo(abs);
      meta.durationSec = probe.durationSec;
      meta.width = probe.width;
      meta.height = probe.height;
      logger.info(
        { id: s.id, category: s.category, res: `${probe.width}x${probe.height}`, durationSec: probe.durationSec.toFixed(1) },
        'seeded',
      );
      ok++;
    }
    await store.upsertVideo(meta);
  }

  await store.close();
  logger.info({ store: config.catalogStore, seeded: ok, missing }, 'catalog seed complete');
  if (missing > 0) {
    logger.warn('Some sources were missing. Generate them with `npm run make-media`, then re-run `npm run seed`.');
  }
}

seed().catch((err) => {
  logger.error(err);
  process.exit(1);
});
