ALTER TABLE media_files ADD COLUMN original_path TEXT NOT NULL DEFAULT '';
ALTER TABLE media_files ADD COLUMN original_bytes INTEGER NOT NULL DEFAULT 0;
INSERT INTO schema_versions VALUES(3,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
