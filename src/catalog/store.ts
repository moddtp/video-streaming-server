import path from 'node:path';
import { config } from '../config';
import { logger } from '../logger';

export interface VideoMeta {
  id: string;
  title: string;
  category: string;
  /** Filename relative to MEDIA_DIR, or an absolute path. Never exposed to clients. */
  sourcePath: string;
  durationSec: number;
  width: number | null;
  height: number | null;
  createdAt?: string;
}

/** Client-facing projection — deliberately omits sourcePath. */
export interface PublicVideo {
  id: string;
  title: string;
  category: string;
  durationSec: number;
  width: number | null;
  height: number | null;
  /** 'local' = a generated/uploaded MP4; 'external' = a remote M3U8/HLS URL. */
  kind: 'local' | 'external';
}

export function toPublic(v: VideoMeta): PublicVideo {
  return {
    id: v.id,
    title: v.title,
    category: v.category,
    durationSec: v.durationSec,
    width: v.width,
    height: v.height,
    kind: isExternalSource(v.sourcePath) ? 'external' : 'local',
  };
}

/** True when the source is a remote http(s) URL (e.g. an external M3U8/HLS stream). */
export function isExternalSource(sourcePath: string): boolean {
  return /^https?:\/\//i.test(sourcePath);
}

/** Resolve a catalog sourcePath to an absolute file path under MEDIA_DIR, or pass
 * through a remote URL unchanged (ffmpeg ingests it directly). */
export function resolveSourcePath(sourcePath: string): string {
  if (isExternalSource(sourcePath)) return sourcePath;
  return path.isAbsolute(sourcePath) ? sourcePath : path.join(config.mediaDir, sourcePath);
}

export interface CatalogStore {
  listVideos(): Promise<VideoMeta[]>;
  getVideo(id: string): Promise<VideoMeta | null>;
  upsertVideo(video: VideoMeta): Promise<void>;
  close(): Promise<void>;
}

/**
 * Build the configured catalog store. Defaults to SQLite ("DBMS table"); if
 * better-sqlite3 can't be loaded (e.g. native build unavailable), transparently
 * falls back to the JSON-file store so the server still runs.
 */
export async function createCatalogStore(): Promise<CatalogStore> {
  if (config.catalogStore === 'sqlite') {
    try {
      const { SqliteCatalogStore } = await import('./sqlite');
      return new SqliteCatalogStore(config.catalogDbPath);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'SQLite catalog store unavailable; falling back to JSON file store',
      );
    }
  }
  const { JsonCatalogStore } = await import('./json');
  return new JsonCatalogStore(config.catalogJsonPath);
}
