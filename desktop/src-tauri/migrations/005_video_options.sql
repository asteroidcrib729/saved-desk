ALTER TABLE download_jobs ADD COLUMN video_options TEXT NOT NULL DEFAULT '{"encoder":"auto","preset":"superfast","crf":23,"audioBitrate":128}';
INSERT INTO schema_versions VALUES(5,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
