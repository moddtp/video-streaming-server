import fs from 'node:fs/promises';
import path from 'node:path';
import type { CatalogStore, VideoMeta } from './store';

/**
 * JSON-file catalog store. Implements the same contract as the SQLite store so
 * the user can choose "a JSON file or something like that" (CATALOG_STORE=json),
 * and it serves as the automatic fallback when better-sqlite3 is unavailable.
 */
export class JsonCatalogStore implements CatalogStore {
  constructor(private readonly filePath: string) {}

  private async read(): Promise<VideoMeta[]> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as VideoMeta[]) : [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }

  private async write(list: VideoMeta[]): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(list, null, 2) + '\n', 'utf8');
  }

  async listVideos(): Promise<VideoMeta[]> {
    const list = await this.read();
    return [...list].sort((a, b) => a.title.localeCompare(b.title));
  }

  async getVideo(id: string): Promise<VideoMeta | null> {
    return (await this.read()).find((v) => v.id === id) ?? null;
  }

  async upsertVideo(v: VideoMeta): Promise<void> {
    const list = await this.read();
    const idx = list.findIndex((x) => x.id === v.id);
    if (idx >= 0) list[idx] = { ...list[idx], ...v };
    else list.push(v);
    await this.write(list);
  }

  async close(): Promise<void> {
    /* nothing to close */
  }
}
