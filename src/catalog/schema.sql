-- Catalog schema (reference). The same DDL is applied programmatically in
-- src/catalog/sqlite.ts so the store is self-initializing. A JSON-file store
-- (src/catalog/json.ts) implements the same CatalogStore contract.
--
-- `source_path` is a filename relative to MEDIA_DIR (or an absolute path); the
-- raw file is never served to clients — it is only read by ffmpeg to transcode.
-- `category` is the watermark's second field (Drama, Documentary, Music Video…).

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
