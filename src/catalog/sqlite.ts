import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { CatalogStore, VideoMeta } from './store';

// Mirror of schema.sql, inlined so the store is self-initializing regardless of cwd.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS videos (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  category     TEXT NOT NULL,
  source_path  TEXT NOT NULL,
  duration_sec REAL NOT NULL DEFAULT 0,
  width        INTEGER,
  height       INTEGER,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

interface Row {
  id: string;
  title: string;
  category: string;
  source_path: string;
  duration_sec: number;
  width: number | null;
  height: number | null;
  created_at: string;
}

function rowToMeta(row: Row): VideoMeta {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    sourcePath: row.source_path,
    durationSec: row.duration_sec,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
  };
}

export class SqliteCatalogStore implements CatalogStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  async listVideos(): Promise<VideoMeta[]> {
    const rows = this.db.prepare('SELECT * FROM videos ORDER BY title').all() as Row[];
    return rows.map(rowToMeta);
  }

  async getVideo(id: string): Promise<VideoMeta | null> {
    const row = this.db.prepare('SELECT * FROM videos WHERE id = ?').get(id) as Row | undefined;
    return row ? rowToMeta(row) : null;
  }

  async upsertVideo(v: VideoMeta): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO videos (id, title, category, source_path, duration_sec, width, height)
         VALUES (@id, @title, @category, @sourcePath, @durationSec, @width, @height)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           category = excluded.category,
           source_path = excluded.source_path,
           duration_sec = excluded.duration_sec,
           width = excluded.width,
           height = excluded.height`,
      )
      .run({
        id: v.id,
        title: v.title,
        category: v.category,
        sourcePath: v.sourcePath,
        durationSec: v.durationSec,
        width: v.width,
        height: v.height,
      });
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
