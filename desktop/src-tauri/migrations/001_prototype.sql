PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS schema_versions(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS posts(
    id INTEGER PRIMARY KEY, source TEXT NOT NULL, account_id TEXT NOT NULL,
    native_id TEXT NOT NULL, creator TEXT NOT NULL, caption TEXT NOT NULL,
    kind TEXT NOT NULL, collection TEXT NOT NULL, saved_at TEXT NOT NULL,
    prototype INTEGER NOT NULL DEFAULT 1,
    UNIQUE(source, account_id, native_id)
);
CREATE TABLE IF NOT EXISTS download_jobs(
    id TEXT PRIMARY KEY, title TEXT NOT NULL, mode TEXT NOT NULL,
    state TEXT NOT NULL, destination TEXT NOT NULL, created_at TEXT NOT NULL,
    saved INTEGER NOT NULL DEFAULT 0, skipped INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS media_files(
    id INTEGER PRIMARY KEY, post_id INTEGER NOT NULL REFERENCES posts(id),
    job_id TEXT NOT NULL REFERENCES download_jobs(id),
    path TEXT NOT NULL UNIQUE, bytes INTEGER NOT NULL CHECK(bytes>0)
);
CREATE TABLE IF NOT EXISTS download_items(
    job_id TEXT NOT NULL REFERENCES download_jobs(id), native_id TEXT NOT NULL,
    state TEXT NOT NULL, PRIMARY KEY(job_id,native_id)
);
CREATE INDEX IF NOT EXISTS post_source_id ON posts(source,id DESC);
CREATE INDEX IF NOT EXISTS media_post ON media_files(post_id);
INSERT OR IGNORE INTO schema_versions VALUES(1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
