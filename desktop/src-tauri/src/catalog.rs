use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{path::Path, time::Duration};

pub type Result<T> = std::result::Result<T, String>;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AdvancedVideoSettings {
    pub encoder: String,
    pub preset: String,
    pub crf: u8,
    pub audio_bitrate: u16,
}
impl Default for AdvancedVideoSettings {
    fn default() -> Self { Self { encoder: "auto".into(), preset: "superfast".into(), crf: 23, audio_bitrate: 128 } }
}
impl AdvancedVideoSettings {
    pub fn validate(&self) -> Result<()> {
        if !["auto", "software"].contains(&self.encoder.as_str()) || !["superfast", "fast", "slow"].contains(&self.preset.as_str())
            || ![18,23,28].contains(&self.crf) || ![96,128,192,256].contains(&self.audio_bitrate) {
            return Err("Choose supported advanced video settings.".into());
        }
        Ok(())
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub download_folder: String,
    pub low_resource: bool,
    pub quality: String,
    pub profile: String,
    #[serde(default)]
    pub advanced: AdvancedVideoSettings,
    #[serde(default = "default_sidebar_expanded")]
    pub sidebar_expanded: bool,
}
fn default_sidebar_expanded() -> bool { true }

impl Settings {
    pub fn validate(&self) -> Result<()> {
        self.advanced.validate()?;
        if !["original", "360", "480", "720", "1080", "1440", "2160"]
            .contains(&self.quality.as_str())
            || !["original", "compatible_mp4"].contains(&self.profile.as_str())
        {
            return Err("Choose a supported video setting.".into());
        }
        if self.download_folder.len() > 32767 {
            return Err("The folder path is too long.".into());
        }
        Ok(())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    id: i64,
    source: String,
    native_id: String,
    creator: String,
    caption: String,
    kind: String,
    collection: String,
    saved_at: String,
    available: bool,
    prototype: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Query {
    pub search: String,
    pub source: Option<String>,
    pub kind: Option<String>,
    pub cursor: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    items: Vec<Item>,
    total: i64,
    next_cursor: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    id: String,
    title: String,
    state: String,
    saved: i64,
    skipped: i64,
    failed: i64,
    mode: String,
    created_at: String,
    error: String,
    collection: bool,
    source: Option<String>,
    supported: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub source: String,
    pub account_id: String,
    pub username: String,
    pub browser: String,
    pub state: String,
    pub message: String,
}
#[derive(Serialize)]
pub struct Collection {
    pub source: String,
    pub title: String,
    pub target: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    total: i64,
    images: i64,
    videos: i64,
    jobs: Vec<Job>,
    settings: Settings,
    live_downloads: bool,
    browser_connection: bool,
    native: bool,
    accounts: Vec<Account>,
    collections: Vec<Collection>,
}

pub fn open(path: &Path) -> Result<Connection> {
    let db =
        Connection::open(path).map_err(|_| "Download history could not be opened.".to_string())?;
    db.busy_timeout(Duration::from_secs(2))
        .map_err(|_| "Download history is busy.".to_string())?;
    db.execute_batch("PRAGMA foreign_keys=ON;")
        .map_err(|_| "Download history is unavailable.".to_string())?;
    Ok(db)
}

pub fn initialize(path: &Path, default_folder: &str) -> Result<()> {
    let db = open(path)?;
    db.execute_batch("PRAGMA journal_mode=WAL;")
        .map_err(|_| "The catalog could not be initialized.".to_string())?;
    db.execute_batch(include_str!("../migrations/001_prototype.sql"))
        .map_err(|_| "The catalog schema is unavailable.".to_string())?;
    let migrated: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM schema_versions WHERE version=2)",
            [],
            |r| r.get(0),
        )
        .map_err(|_| "Schema history could not be read.")?;
    if !migrated {
        let backup_path =
            path.with_file_name(format!("catalog-before-v02-{}.db", uuid::Uuid::new_v4()));
        let mut destination = open(&backup_path)?;
        rusqlite::backup::Backup::new(&db, &mut destination)
            .and_then(|backup| backup.run_to_completion(100, Duration::from_millis(5), None))
            .map_err(|_| "The pre-upgrade backup failed. Your catalog was not changed.")?;
        db.execute_batch("BEGIN IMMEDIATE;")
            .map_err(|_| "The catalog is busy.")?;
        if db
            .execute_batch(include_str!("../migrations/002_live.sql"))
            .is_err()
        {
            let _ = db.execute_batch("ROLLBACK;");
            return Err(
                "Catalog upgrade failed. Your history and its backup are preserved.".into(),
            );
        }
        db.execute_batch("COMMIT;")
            .map_err(|_| "The catalog upgrade could not finish.")?;
    }
    if !db.query_row("SELECT EXISTS(SELECT 1 FROM schema_versions WHERE version=3)", [], |r| r.get::<_, bool>(0)).map_err(|_| "Schema history could not be read.")? {
        db.execute_batch("BEGIN IMMEDIATE;").map_err(|_| "The catalog is busy.")?;
        if db.execute_batch(include_str!("../migrations/003_owned_originals.sql")).is_err() {
            let _ = db.execute_batch("ROLLBACK;"); return Err("Original-file tracking could not be initialized.".into());
        }
        db.execute_batch("COMMIT;").map_err(|_| "The catalog upgrade could not finish.")?;
    }
    if !db.query_row("SELECT EXISTS(SELECT 1 FROM schema_versions WHERE version=4)", [], |r| r.get::<_, bool>(0)).map_err(|_| "Schema history could not be read.")? {
        db.execute_batch("BEGIN IMMEDIATE;").map_err(|_| "The catalog is busy.")?;
        if db.execute_batch(include_str!("../migrations/004_player_preferences.sql")).is_err() {
            let _ = db.execute_batch("ROLLBACK;"); return Err("Player preferences could not be initialized.".into());
        }
        db.execute_batch("COMMIT;").map_err(|_| "Player preferences could not be initialized.")?;
    }
    if !db.query_row("SELECT EXISTS(SELECT 1 FROM schema_versions WHERE version=5)", [], |r| r.get::<_, bool>(0)).map_err(|_| "Schema history could not be read.")? {
        db.execute_batch("BEGIN IMMEDIATE;").map_err(|_| "The catalog is busy.")?;
        if db.execute_batch(include_str!("../migrations/005_video_options.sql")).is_err() {
            let _ = db.execute_batch("ROLLBACK;"); return Err("Download video settings could not be initialized.".into());
        }
        db.execute_batch("COMMIT;").map_err(|_| "Download video settings could not be initialized.")?;
    }
    let value = serde_json::to_string(&Settings {
        download_folder: default_folder.into(),
        low_resource: true,
        quality: "original".into(),
        profile: "original".into(),
        advanced: AdvancedVideoSettings::default(),
        sidebar_expanded: true,
    })
    .map_err(|_| "Settings are unavailable.".to_string())?;
    db.execute(
        "INSERT OR IGNORE INTO settings(id,value) VALUES(1,?1)",
        [value],
    )
    .map_err(|_| "Settings could not be initialized.".to_string())?;
    // Running jobs are never silently restarted after process termination.
    db.execute(
        "UPDATE download_jobs SET state='interrupted' WHERE state IN ('running','queued')",
        [],
    )
    .map_err(|_| "Interrupted jobs could not be reconciled.".to_string())?;
    db.execute("UPDATE accounts SET state='not_connected',message='Account connection was interrupted. Connect again from your browser.' WHERE state IN ('connecting','awaiting_permission')",[]).map_err(|_|"Account connection recovery failed.")?;
    Ok(())
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PlayerPreferences { pub volume:f64, pub muted:bool }

pub fn player_preferences(db:&Connection) -> Result<PlayerPreferences> {
    db.query_row("SELECT volume,muted FROM player_preferences WHERE id=1",[],|r|Ok(PlayerPreferences{volume:r.get(0)?,muted:r.get(1)?})).map_err(|_|"Player preferences could not be read.".into())
}
pub fn save_player_preferences(db:&Connection,preferences:&PlayerPreferences) -> Result<()> {
    if !preferences.volume.is_finite() || !(0.0..=1.0).contains(&preferences.volume) {return Err("Choose a volume between 0 and 100 percent.".into());}
    db.execute("UPDATE player_preferences SET volume=?1,muted=?2 WHERE id=1",params![preferences.volume,preferences.muted]).map_err(|_|"Player preferences could not be saved.")?;
    Ok(())
}

pub fn settings(db: &Connection) -> Result<Settings> {
    let value: String = db
        .query_row("SELECT value FROM settings WHERE id=1", [], |row| {
            row.get(0)
        })
        .map_err(|_| "Settings could not be read.".to_string())?;
    serde_json::from_str(&value).map_err(|_| "Settings need recovery.".into())
}

pub fn snapshot(db: &Connection) -> Result<Snapshot> {
    let counts = db.query_row("SELECT count(*),coalesce(sum(kind='image'),0),coalesce(sum(kind='video'),0) FROM posts", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).map_err(|_| "Library counts could not be read.".to_string())?;
    let mut statement = db.prepare("SELECT id,title,state,saved,skipped,failed,mode,created_at,error,source,target FROM download_jobs ORDER BY CASE WHEN state IN ('queued','running') THEN 0 ELSE 1 END,created_at DESC,id DESC LIMIT 100").map_err(|_| "Download history could not be read.".to_string())?;
    let jobs = statement
        .query_map([], |r| {
            Ok(Job {
                id: r.get(0)?,
                title: r.get(1)?,
                state: r.get(2)?,
                saved: r.get(3)?,
                skipped: r.get(4)?,
                failed: r.get(5)?,
                mode: r.get(6)?,
                created_at: r.get(7)?,
                error: r.get(8)?,
                source: r.get(9)?,
                supported: r.get::<_,Option<String>>(9)?.is_none_or(|s|crate::platforms::supported(&s)),
                collection: crate::platforms::collection(&r.get::<_,Option<String>>(9)?.unwrap_or_default(),&r.get::<_,Option<String>>(10)?.unwrap_or_default()),
            })
        })
        .map_err(|_| "Download history could not be read.".to_string())?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(|_| "Download history contains an invalid record.".to_string())?;
    Ok(Snapshot {
        total: counts.0,
        images: counts.1,
        videos: counts.2,
        jobs,
        settings: settings(db)?,
        live_downloads: true,
        browser_connection: true,
        native: true,
        accounts: accounts(db)?,
        collections: collections(db)?,
    })
}

pub fn accounts(db: &Connection) -> Result<Vec<Account>> {
    let mut statement = db
        .prepare(
            "SELECT source,account_id,username,browser,state,message FROM accounts ORDER BY source",
        )
        .map_err(|_| "Accounts could not be read.")?;
    let rows = statement
        .query_map([], |r| {
            Ok(Account {
                source: r.get(0)?,
                account_id: r.get(1)?,
                username: r.get(2)?,
                browser: r.get(3)?,
                state: r.get(4)?,
                message: r.get(5)?,
            })
        })
        .map_err(|_| "Accounts could not be read.")?;
    rows.collect::<std::result::Result<Vec<_>, _>>()
        .map_err(|_| "Accounts contain an invalid record.".into())
}
fn collections(db: &Connection) -> Result<Vec<Collection>> {
    let mut statement = db.prepare("SELECT j.source,j.title,j.target FROM download_jobs j LEFT JOIN accounts a ON a.source=j.source AND a.account_id=j.account_id WHERE j.target IS NOT NULL AND (a.source IS NOT NULL OR (j.account_id='public' AND j.source IN ('youtube','facebook','tiktok','pinterest','discord'))) GROUP BY j.source,j.target ORDER BY max(j.created_at) DESC LIMIT 20").map_err(|_| "Collections could not be read.")?;
    let rows = statement
        .query_map([], |r| {
            Ok(Collection {
                source: r.get(0)?,
                title: r.get(1)?,
                target: r.get(2)?,
            })
        })
        .map_err(|_| "Collections could not be read.")?;
    rows.collect::<std::result::Result<Vec<_>, _>>()
        .map_err(|_| "Collections contain an invalid record.".into())
}

pub fn live_present(
    db: &Connection,
    source: &str,
    account: &str,
    file_key: &str,
    quality: &str,
    profile: &str,
    job: Option<&str>,
) -> Result<bool> {
    let authorized_root = crate::storage::root(db).ok();
    let mut statement=db.prepare("SELECT m.path,m.bytes FROM media_files m JOIN posts p ON p.id=m.post_id WHERE p.source=?1 AND p.account_id=?2 AND m.file_key=?3 AND m.quality=?4 AND m.profile=?5 AND (?6 IS NULL OR m.job_id=?6)").map_err(|_| "Download history could not be checked.")?;
    let rows = statement
        .query_map(
            params![source, account, file_key, quality, profile, job],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)),
        )
        .map_err(|_| "Download history could not be checked.")?;
    for row in rows {
        let (path, bytes) = row.map_err(|_| "Invalid file history.")?;
        if crate::storage::available(authorized_root.as_deref(), &path, bytes) {
            return Ok(true);
        }
    }
    Ok(false)
}

pub fn record_live(
    db: &mut Connection,
    job: &str,
    source: &str,
    account: &str,
    detail: &serde_json::Value,
    path: &Path,
    bytes: u64,
    quality: &str,
    profile: &str,
) -> Result<()> {
    let size = i64::try_from(bytes).map_err(|_| "File size is too large.")?;
    if size <= 0 {
        return Err("An empty file cannot be recorded.".into());
    }
    let tx = db.transaction().map_err(|_| "Download history is busy.")?;
    let key = detail["item_id"].as_str().ok_or("Missing file identity.")?;
    let native = detail["native_id"]
        .as_str()
        .ok_or("Missing post identity.")?;
    let title: String = tx
        .query_row("SELECT title FROM download_jobs WHERE id=?1", [job], |r| {
            r.get(0)
        })
        .map_err(|_| "The job is unavailable.")?;
    tx.execute("INSERT INTO posts(source,account_id,native_id,creator,caption,kind,collection,saved_at,prototype,url) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,0,?9) ON CONFLICT(source,account_id,native_id) DO UPDATE SET kind=CASE WHEN excluded.kind='video' THEN 'video' WHEN excluded.kind='image' AND posts.kind='text' THEN 'image' ELSE posts.kind END",params![source,account,native,detail["creator"].as_str().unwrap_or(""),detail["caption"].as_str().unwrap_or(""),detail["kind"].as_str().unwrap_or("image"),title,chrono::Utc::now().to_rfc3339(),detail["url"].as_str().unwrap_or("")]).map_err(|_| "Saved content could not be recorded.")?;
    let post: i64 = tx
        .query_row(
            "SELECT id FROM posts WHERE source=?1 AND account_id=?2 AND native_id=?3",
            params![source, account, native],
            |r| r.get(0),
        )
        .map_err(|_| "The post identity is unavailable.")?;
    tx.execute("INSERT OR IGNORE INTO media_files(post_id,job_id,path,bytes,file_key,quality,profile,original_path,original_bytes) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",params![post,job,path.to_string_lossy(),size,key,quality,profile,detail["original_path"].as_str().unwrap_or(""),detail["original_bytes"].as_u64().and_then(|v|i64::try_from(v).ok()).unwrap_or(0)]).map_err(|_| "The saved file could not be recorded.")?;
    let previous: Option<String> = tx
        .query_row(
            "SELECT state FROM download_items WHERE job_id=?1 AND native_id=?2",
            params![job, key],
            |r| r.get(0),
        )
        .ok();
    tx.execute("INSERT INTO download_items(job_id,native_id,state) VALUES(?1,?2,'saved') ON CONFLICT(job_id,native_id) DO UPDATE SET state='saved'",params![job,key]).map_err(|_| "The result could not be recorded.")?;
    if previous.as_deref() != Some("saved") {
        tx.execute(
            "UPDATE download_jobs SET saved=saved+1,failed=max(0,failed-?2) WHERE id=?1",
            params![
                job,
                if previous.as_deref() == Some("failed") {
                    1
                } else {
                    0
                }
            ],
        )
        .map_err(|_| "The result could not be recorded.")?;
    }
    tx.commit()
        .map_err(|_| "The saved file could not be committed.".into())
}

pub fn record_outcome(db: &Connection, job: &str, key: &str, state: &str) -> Result<()> {
    if !["skipped", "failed"].contains(&state) {
        return Err("Invalid item outcome.".into());
    }
    let count = db
        .execute(
            "INSERT OR IGNORE INTO download_items(job_id,native_id,state) VALUES(?1,?2,?3)",
            params![job, key, state],
        )
        .map_err(|_| "The item outcome could not be recorded.")?;
    if count > 0 {
        db.execute(
            &format!("UPDATE download_jobs SET {state}={state}+1 WHERE id=?1"),
            [job],
        )
        .map_err(|_| "The job result could not be recorded.")?;
    }
    Ok(())
}

pub fn query(db: &Connection, query: Query) -> Result<Page> {
    if query.search.len() > 500
        || query.cursor.is_some_and(|id| id < 1)
        || query
            .source
            .as_ref()
            .is_some_and(|s| !crate::platforms::supported(s))
        || query
            .kind
            .as_ref()
            .is_some_and(|s| !["image", "video", "audio", "text"].contains(&s.as_str()))
    {
        return Err("Choose a valid library filter.".into());
    }
    let pattern = format!(
        "%{}%",
        query
            .search
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_")
    );
    let filter = "(?1 IS NULL OR p.source=?1) AND (?2 IS NULL OR p.kind=?2) AND (p.creator LIKE ?3 ESCAPE '\\' OR p.caption LIKE ?3 ESCAPE '\\' OR p.collection LIKE ?3 ESCAPE '\\')";
    let total = db
        .query_row(
            &format!("SELECT count(*) FROM posts p WHERE {filter}"),
            params![query.source, query.kind, pattern],
            |r| r.get(0),
        )
        .map_err(|_| "Search could not be completed.".to_string())?;
    let sql = format!("SELECT p.id,p.source,p.native_id,p.creator,p.caption,p.kind,p.collection,p.saved_at,p.prototype,(SELECT path FROM media_files WHERE post_id=p.id ORDER BY id DESC LIMIT 1) FROM posts p WHERE {filter} AND (?4 IS NULL OR p.id<?4) ORDER BY p.id DESC LIMIT 101");
    let mut statement = db
        .prepare(&sql)
        .map_err(|_| "Search could not be prepared.".to_string())?;
    let authorized_root = crate::storage::root(db).ok();
    let mut items = statement
        .query_map(
            params![query.source, query.kind, pattern, query.cursor],
            |r| {
                let path: Option<String> = r.get(9)?;
                Ok(Item {
                    id: r.get(0)?,
                    source: r.get(1)?,
                    native_id: r.get(2)?,
                    creator: r.get(3)?,
                    caption: r.get(4)?,
                    kind: r.get(5)?,
                    collection: r.get(6)?,
                    saved_at: r.get(7)?,
                    prototype: r.get(8)?,
                    available: path.is_some_and(|p| {
                        authorized_root.as_ref().is_some_and(|root| {
                            crate::storage::contained(root, Path::new(&p))
                                .is_ok_and(|p| p.is_file())
                        })
                    }),
                })
            },
        )
        .map_err(|_| "Search could not be read.".to_string())?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(|_| "The library contains an invalid record.".to_string())?;
    let next_cursor = if items.len() > 100 {
        items.truncate(100);
        items.last().map(|i| i.id)
    } else {
        None
    };
    Ok(Page {
        items,
        total,
        next_cursor,
    })
}

pub fn fixture_history(db: &Connection) -> Result<(usize, usize)> {
    let authorized_root = crate::storage::root(db).ok();
    let mut existing = 0;
    let mut missing = 0;
    for id in ["fixture-1", "fixture-2", "fixture-3"] {
        let mut statement = db.prepare("SELECT m.path FROM media_files m JOIN posts p ON m.post_id=p.id WHERE p.account_id='fixture-account' AND p.native_id=?1").map_err(|_| "History could not be checked.".to_string())?;
        let paths = statement
            .query_map([id], |r| r.get::<_, String>(0))
            .map_err(|_| "History could not be checked.".to_string())?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|_| "History contains an invalid record.".to_string())?;
        if !paths.is_empty() {
            existing += 1;
            if !paths.iter().any(|p| {
                authorized_root.as_ref().is_some_and(|root| {
                    crate::storage::contained(root, Path::new(p)).is_ok_and(|p| p.is_file())
                })
            }) {
                missing += 1;
            }
        }
    }
    Ok((existing, missing))
}

pub fn present(db: &Connection, id: &str) -> Result<bool> {
    let authorized_root = crate::storage::root(db).ok();
    let mut statement = db.prepare("SELECT m.path,m.bytes FROM media_files m JOIN posts p ON m.post_id=p.id WHERE p.account_id='fixture-account' AND p.native_id=?1").map_err(|_| "History could not be checked.".to_string())?;
    let rows = statement
        .query_map([id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))
        .map_err(|_| "History could not be checked.".to_string())?;
    for row in rows {
        let (path, bytes) = row.map_err(|_| "History contains an invalid record.".to_string())?;
        if crate::storage::available(authorized_root.as_deref(), &path, bytes) {
            return Ok(true);
        }
    }
    Ok(false)
}

pub fn record(db: &mut Connection, job: &str, id: &str, path: &Path, bytes: u64) -> Result<()> {
    let recorded_bytes =
        i64::try_from(bytes).map_err(|_| "The file size cannot be recorded.".to_string())?;
    if recorded_bytes <= 0 {
        return Err("An empty file cannot be recorded as successful.".into());
    }
    let tx = db
        .transaction()
        .map_err(|_| "Download history is busy.".to_string())?;
    let (creator, caption) = match id {
        "fixture-1" => ("Outside Journal", "A little inspiration from the outdoors."),
        "fixture-2" => (
            "Everyday Kitchen",
            "A recipe worth keeping for the weekend.",
        ),
        "fixture-3" => ("Studio Notes", "Small spaces, thoughtful details."),
        _ => return Err("Unexpected test content identity.".into()),
    };
    tx.execute("INSERT INTO posts(source,account_id,native_id,creator,caption,kind,collection,saved_at) VALUES('instagram','fixture-account',?1,?2,?3,'image','Sample collection',?4) ON CONFLICT(source,account_id,native_id) DO NOTHING", params![id, creator, caption, chrono::Utc::now().to_rfc3339()]).map_err(|_| "Saved content could not be recorded.".to_string())?;
    let post_id: i64 = tx
        .query_row(
            "SELECT id FROM posts WHERE account_id='fixture-account' AND native_id=?1",
            [id],
            |r| r.get(0),
        )
        .map_err(|_| "Saved content identity is unavailable.".to_string())?;
    tx.execute(
        "INSERT OR IGNORE INTO media_files(post_id,job_id,path,bytes) VALUES(?1,?2,?3,?4)",
        params![post_id, job, path.to_string_lossy(), recorded_bytes],
    )
    .map_err(|_| "The saved file could not be recorded.".to_string())?;
    let inserted = tx
        .execute(
            "INSERT OR IGNORE INTO download_items(job_id,native_id,state) VALUES(?1,?2,'saved')",
            params![job, id],
        )
        .map_err(|_| "The item result could not be recorded.".to_string())?;
    if inserted > 0 {
        tx.execute("UPDATE download_jobs SET saved=saved+1 WHERE id=?1", [job])
            .map_err(|_| "The job result could not be recorded.".to_string())?;
    }
    tx.commit()
        .map_err(|_| "The saved file could not be committed to history.".to_string())
}

#[cfg(test)]
mod tests {
    #[test]
    fn advanced_video_options_migrate_and_preserve_job_choices() {
        let directory=tempfile::tempdir().unwrap();let path=directory.path().join("catalog.db");
        initialize(&path,directory.path().to_str().unwrap()).unwrap();let db=open(&path).unwrap();
        let legacy:Settings=serde_json::from_str(r#"{"downloadFolder":"C:\\Library","lowResource":true,"quality":"original","profile":"original"}"#).unwrap();
        assert_eq!(legacy.advanced,AdvancedVideoSettings::default());assert!(legacy.sidebar_expanded);
        let chosen=AdvancedVideoSettings{encoder:"software".into(),preset:"slow".into(),crf:18,audio_bitrate:256};chosen.validate().unwrap();
        let mut settings=settings(&db).unwrap();settings.advanced=chosen.clone();settings.sidebar_expanded=false;
        db.execute("UPDATE settings SET value=?1 WHERE id=1",[serde_json::to_string(&settings).unwrap()]).unwrap();
        db.execute("INSERT INTO download_jobs(id,title,mode,state,destination,created_at,video_options) VALUES('advanced','Video','new_only','failed','folder','now',?1)",[serde_json::to_string(&chosen).unwrap()]).unwrap();
        drop(db);initialize(&path,directory.path().to_str().unwrap()).unwrap();let db=open(&path).unwrap();
        assert_eq!(super::settings(&db).unwrap().advanced,chosen);assert!(!super::settings(&db).unwrap().sidebar_expanded);
        db.execute("UPDATE download_jobs SET state='queued' WHERE id='advanced'",[]).unwrap();
        let stored:String=db.query_row("SELECT video_options FROM download_jobs WHERE id='advanced'",[],|r|r.get(0)).unwrap();
        assert_eq!(serde_json::from_str::<AdvancedVideoSettings>(&stored).unwrap(),chosen);
        assert_eq!(db.query_row("SELECT count(*) FROM schema_versions WHERE version=5",[],|r|r.get::<_,i64>(0)).unwrap(),1);
        for value in [r#"{"encoder":"software","preset":"slow","crf":0,"audioBitrate":128}"#,r#"{"encoder":"unsafe","preset":"fast","crf":23,"audioBitrate":128}"#,r#"{"encoder":"auto","preset":"fast","crf":23,"audioBitrate":128,"args":"injected"}"#] {
            assert!(serde_json::from_str::<AdvancedVideoSettings>(value).map(|v|v.validate().is_err()).unwrap_or(true));
        }
    }

    use super::*;
    #[test]
    fn player_preferences_survive_catalog_reopen_and_reject_invalid_values() {
        let folder=tempfile::tempdir().unwrap();let path=folder.path().join("catalog.db");
        initialize(&path,folder.path().to_str().unwrap()).unwrap();
        {let db=open(&path).unwrap();save_player_preferences(&db,&PlayerPreferences{volume:0.37,muted:true}).unwrap();
         for volume in [-0.01,1.01,f64::NAN,f64::INFINITY] {assert!(save_player_preferences(&db,&PlayerPreferences{volume,muted:false}).is_err());}}
        initialize(&path,folder.path().to_str().unwrap()).unwrap();let db=open(&path).unwrap();let prefs=player_preferences(&db).unwrap();assert_eq!(prefs.volume,0.37);assert!(prefs.muted);
        assert_eq!(db.query_row("SELECT count(*) FROM schema_versions WHERE version=4",[],|r|r.get::<_,i64>(0)).unwrap(),1);
        assert!(serde_json::from_str::<PlayerPreferences>(r#"{"volume":0.5,"muted":true,"path":"elsewhere"}"#).is_err());
    }

    #[test]
    fn active_queue_stays_visible_after_many_completed_jobs() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("catalog.db");
        initialize(&path, path.parent().unwrap().to_str().unwrap()).unwrap();
        let db = open(&path).unwrap();
        db.execute("INSERT INTO download_jobs(id,title,mode,state,destination,created_at) VALUES('active','Old active job','new_only','queued','','2000')",[]).unwrap();
        for id in 0..150 {
            db.execute("INSERT INTO download_jobs(id,title,mode,state,destination,created_at) VALUES(?1,'Done','new_only','completed','','2026')",[format!("completed-{id}")]).unwrap();
        }
        let result = snapshot(&db).unwrap();
        assert_eq!(result.jobs.len(), 100);
        assert_eq!(result.jobs[0].id, "active");
    }
    #[test]
    fn public_text_with_photos_is_classified_as_media_without_an_account_record() {
        let directory=tempfile::tempdir().unwrap();let path=directory.path().join("catalog.db");
        initialize(&path,directory.path().to_str().unwrap()).unwrap();let mut db=open(&path).unwrap();
        db.execute("INSERT INTO download_jobs(id,title,mode,state,destination,created_at,source,account_id,target) VALUES('public','Pinterest pin','new_only','running','','now','pinterest','public','https://www.pinterest.com/pin/123456789/')",[]).unwrap();
        for (key,kind,extension) in [("123456789_text","text","txt"),("123456789_1","image","jpg"),("123456789_2","video","mp4"),("123456789_3","image","jpg")] {
            let file=directory.path().join(format!("{key}.{extension}"));std::fs::write(&file,b"test").unwrap();
            let detail=serde_json::json!({"item_id":key,"native_id":"123456789","creator":"Creator","caption":"Caption","kind":kind,"url":"https://www.pinterest.com/pin/123456789/"});
            record_live(&mut db,"public","pinterest","public",&detail,&file,4,"original","original").unwrap();
            let stored:String=db.query_row("SELECT kind FROM posts",[],|r|r.get(0)).unwrap();
            assert_eq!(stored,if key=="123456789_3" {"video"} else {kind});
        }
        assert_eq!(db.query_row("SELECT count(*) FROM accounts",[],|r|r.get::<_,i64>(0)).unwrap(),0);
        assert_eq!(collections(&db).unwrap().len(),1);
        assert_eq!(public_post_url("pinterest","https://www.pinterest.com/pin/123456789/").unwrap(),"https://www.pinterest.com/pin/123456789/");
    }
    #[test]
    fn live_carousel_resume_and_account_isolation_preserve_versions() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("catalog.db");
        initialize(&path, path.parent().unwrap().to_str().unwrap()).unwrap();
        let mut db = open(&path).unwrap();
        for (job, source, account) in [
            ("first", "instagram", "42"),
            ("repeat", "instagram", "42"),
            ("other-account", "instagram", "43"),
            ("other-source", "x", "42"),
        ] {
            db.execute("INSERT INTO download_jobs(id,title,mode,state,destination,created_at,source,account_id,target) VALUES(?1,'Carousel','all_again','running','',?2,?3,?4,?1)",params![job,chrono::Utc::now().to_rfc3339(),source,account]).unwrap();
            for key in ["101", "102"] {
                let file = directory.path().join(format!("{job}-{key}.jpg"));
                std::fs::write(&file, b"test").unwrap();
                let detail = serde_json::json!({"item_id":key,"native_id":"100","creator":"Creator","caption":"Caption","kind":"image","url":"https://www.instagram.com/p/test/"});
                record_live(
                    &mut db, job, source, account, &detail, &file, 4, "original", "original",
                )
                .unwrap();
                record_live(
                    &mut db, job, source, account, &detail, &file, 4, "original", "original",
                )
                .unwrap();
            }
        }
        assert_eq!(
            db.query_row("SELECT count(*) FROM posts", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            3
        );
        assert_eq!(
            db.query_row("SELECT count(*) FROM media_files", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            8
        );
        assert_eq!(
            db.query_row("SELECT sum(saved) FROM download_jobs", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            8
        );
        assert!(live_present(&db, "instagram", "42", "101", "original", "original", None).unwrap());
        assert!(
            !live_present(&db, "instagram", "44", "101", "original", "original", None).unwrap()
        );
        assert!(!live_present(&db, "instagram", "42", "101", "720", "original", None).unwrap());
        assert!(!live_present(
            &db,
            "instagram",
            "42",
            "101",
            "original",
            "original",
            Some("new-job")
        )
        .unwrap());
    }
    #[test]
    fn migration_backs_up_existing_catalog_and_preserves_legacy_rows() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("catalog.db");
        {
            let db = open(&path).unwrap();
            db.execute_batch(include_str!("../migrations/001_prototype.sql"))
                .unwrap();
            db.execute("INSERT INTO posts(source,account_id,native_id,creator,caption,kind,collection,saved_at) VALUES('instagram','fixture-account','fixture-1','Creator','Caption','image','Sample','now')",[]).unwrap();
        }
        initialize(&path, path.parent().unwrap().to_str().unwrap()).unwrap();
        assert_eq!(
            open(&path)
                .unwrap()
                .query_row("SELECT count(*) FROM posts", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
        let backups: Vec<_> = std::fs::read_dir(directory.path())
            .unwrap()
            .flatten()
            .filter(|e| {
                e.file_name()
                    .to_string_lossy()
                    .starts_with("catalog-before-v02-")
            })
            .collect();
        assert_eq!(backups.len(), 1);
        assert_eq!(
            open(&backups[0].path())
                .unwrap()
                .query_row("SELECT max(version) FROM schema_versions", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
        initialize(&path, path.parent().unwrap().to_str().unwrap()).unwrap();
        assert_eq!(
            std::fs::read_dir(directory.path())
                .unwrap()
                .flatten()
                .filter(|e| e
                    .file_name()
                    .to_string_lossy()
                    .starts_with("catalog-before-v02-"))
                .count(),
            1
        );
    }
    #[test]
    fn fifty_thousand_posts_are_paged_without_loading_the_whole_library() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("catalog.db");
        initialize(&path, path.parent().unwrap().to_str().unwrap()).unwrap();
        let mut db = open(&path).unwrap();
        let tx = db.transaction().unwrap();
        {
            let mut insert = tx.prepare("INSERT INTO posts(source,account_id,native_id,creator,caption,kind,collection,saved_at) VALUES('instagram','benchmark',?1,'Creator','Caption','image','Benchmark','2026-10-04T00:00:00Z')").unwrap();
            for id in 1..=50_000 {
                insert.execute([id.to_string()]).unwrap();
            }
        }
        tx.commit().unwrap();
        let started = std::time::Instant::now();
        let first = query(
            &db,
            Query {
                search: "".into(),
                source: None,
                kind: None,
                cursor: None,
            },
        )
        .unwrap();
        assert_eq!(first.total, 50_000);
        assert_eq!(first.items.len(), 100);
        let second = query(
            &db,
            Query {
                search: "".into(),
                source: None,
                kind: None,
                cursor: first.next_cursor,
            },
        )
        .unwrap();
        assert_eq!(second.items.len(), 100);
        assert!(first.items.last().unwrap().id > second.items.first().unwrap().id);
        eprintln!(
            "50,000-post catalog: two bounded pages in {:?}; this is not a full-app benchmark",
            started.elapsed()
        );
    }
    #[test]
    fn repeats_keep_one_post_and_multiple_files_and_ack_is_idempotent() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("catalog.db");
        initialize(&path, path.parent().unwrap().to_str().unwrap()).unwrap();
        let mut db = open(&path).unwrap();
        for job in ["first", "repeat"] {
            db.execute("INSERT INTO download_jobs(id,title,mode,state,destination,created_at) VALUES(?1,'Test','all_again','running','',?2)", params![job, chrono::Utc::now().to_rfc3339()]).unwrap();
            let media = directory.path().join(format!("{job}.svg"));
            std::fs::write(&media, "test").unwrap();
            record(&mut db, job, "fixture-1", &media, 4).unwrap();
            record(&mut db, job, "fixture-1", &media, 4).unwrap();
        }
        assert_eq!(
            db.query_row("SELECT count(*) FROM posts", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            db.query_row("SELECT count(*) FROM media_files", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            2
        );
        assert_eq!(
            db.query_row("SELECT sum(saved) FROM download_jobs", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            2
        );
        assert!(present(&db, "fixture-1").unwrap());
    }

    #[test]
    fn source_account_and_literal_search_do_not_overlap() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("catalog.db");
        initialize(&path, path.parent().unwrap().to_str().unwrap()).unwrap();
        let db = open(&path).unwrap();
        db.execute("INSERT INTO posts(source,account_id,native_id,creator,caption,kind,collection,saved_at) VALUES('x','real-account','1','100% real','caption','text','Bookmarks','2026-10-03T00:00:00Z')", []).unwrap();
        assert_eq!(
            query(
                &db,
                Query {
                    search: "%".into(),
                    source: None,
                    kind: None,
                    cursor: None
                }
            )
            .unwrap()
            .total,
            1
        );
        assert_eq!(
            query(
                &db,
                Query {
                    search: "".into(),
                    source: Some("instagram".into()),
                    kind: None,
                    cursor: None
                }
            )
            .unwrap()
            .total,
            0
        );
        assert_eq!(fixture_history(&db).unwrap(), (0, 0));
    }
}

// Validate stored provider metadata before handing a link to the Windows browser.
pub fn public_post_url(source: &str, stored: &str) -> Result<String> {
    if crate::platforms::is_public(source) {return crate::platforms::canonical(source,stored);}
    let url = tauri::Url::parse(stored).map_err(|_| "This post has no supported original link.")?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
    {
        return Err("This post has no supported original link.".into());
    }
    let parts: Vec<_> = url.path().trim_matches('/').split('/').collect();
    let valid_id = |id: &str| {
        !id.is_empty()
            && id.len() <= 120
            && id
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
    };
    match (source, url.host_str()) {
        ("instagram", Some("instagram.com" | "www.instagram.com"))
            if parts.len() == 2
                && ["p", "reel", "reels", "tv"].contains(&parts[0])
                && valid_id(parts[1]) =>
        {
            Ok(format!(
                "https://www.instagram.com/{}/{}/",
                if parts[0]=="reels" {"reel"} else {parts[0]}, parts[1]
            ))
        }
        ("x", Some("x.com" | "www.x.com" | "twitter.com" | "www.twitter.com"))
            if parts.len() == 3
                && valid_id(parts[0])
                && parts[1] == "status"
                && !parts[2].is_empty()
                && parts[2].len() <= 30
                && parts[2].bytes().all(|c| c.is_ascii_digit()) =>
        {
            Ok(format!("https://x.com/{}/status/{}", parts[0], parts[2]))
        }
        _ => Err("This post has no supported original link.".into()),
    }
}
pub fn source_link(db: &Connection, id: i64) -> Result<String> {
    let (source, stored): (String, String) = db
        .query_row(
            "SELECT source,url FROM posts WHERE id=?1 AND prototype=0",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "This post has no supported original link.")?;
    public_post_url(&source, &stored)
}
#[cfg(test)]
mod source_link_tests {
    use super::*;
    #[test]
    fn original_links_allow_only_public_provider_posts_without_tracking() {
        assert_eq!(
            public_post_url(
                "instagram",
                "https://www.instagram.com/reel/Abc_123/?igsh=private#caption"
            )
            .unwrap(),
            "https://www.instagram.com/reel/Abc_123/"
        );
        assert_eq!(
            public_post_url(
                "x",
                "https://twitter.com/creator/status/123?tracking=private"
            )
            .unwrap(),
            "https://x.com/creator/status/123"
        );
        for (source, url) in [
            ("instagram", "file:///C:/private.txt"),
            ("instagram", "https://instagram.com.evil.test/p/123/"),
            ("instagram", "https://private@www.instagram.com/p/123/"),
            ("instagram", "https://www.instagram.com/accounts/login/"),
            ("instagram", "https://www.instagram.com/p/%2foutside/"),
            ("instagram", "https://www.instagram.com:8443/p/123/"),
            ("x", "https://x.com/i/bookmarks"),
            ("x", "https://x.com/creator/status/123/extra"),
            ("x", "https://www.instagram.com/p/123/"),
            ("unknown", "https://x.com/creator/status/123"),
        ] {
            assert!(public_post_url(source, url).is_err(), "{source} {url}");
        }
    }
}
