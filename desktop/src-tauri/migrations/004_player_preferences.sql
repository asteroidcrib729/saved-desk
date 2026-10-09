CREATE TABLE player_preferences(id INTEGER PRIMARY KEY CHECK(id=1), volume REAL NOT NULL CHECK(volume>=0 AND volume<=1), muted INTEGER NOT NULL CHECK(muted IN (0,1)));
INSERT INTO player_preferences VALUES(1,1,0);
INSERT INTO schema_versions VALUES(4,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
