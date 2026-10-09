mod auth;
mod catalog;
mod external_tools;
mod deletion;
mod live_commands;
mod media;
mod platform;
mod platforms;
mod playback_probe;
mod readiness;
mod storage;
mod worker_host;

use catalog::{Result, Settings};
use rusqlite::params;
use serde::Serialize;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{atomic::AtomicBool, Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::{Manager, State};
use tauri_plugin_opener::OpenerExt;

pub(crate) struct AppState {
    auth: auth::Controller,
    database: PathBuf,
    pending: Mutex<HashMap<String, (Instant, usize, usize)>>,
    worker_gate: Mutex<()>,
    deletions: Mutex<HashMap<String, deletion::Pending>>,
    playback_probe: Mutex<playback_probe::ProbeCache>,
    connection: Mutex<Option<live_commands::PendingConnection>>,
    live_pending: Mutex<HashMap<String, live_commands::Draft>>,
    active: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

#[derive(Serialize)]
struct Preflight {
    token: String,
    existing: usize,
    missing: usize,
    items: usize,
}

#[tauri::command]
async fn get_snapshot(state: State<'_, Arc<AppState>>) -> Result<catalog::Snapshot> {
    let path = state.database.clone();
    tauri::async_runtime::spawn_blocking(move || catalog::snapshot(&catalog::open(&path)?))
        .await
        .map_err(|_| "Library loading failed.".to_string())?
}

#[tauri::command]
async fn open_source_post(
    id: i64,
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<()> {
    let path = state.database.clone();
    let url = tauri::async_runtime::spawn_blocking(move || {
        catalog::source_link(&catalog::open(&path)?, id)
    })
    .await
    .map_err(|_| "The original link could not be checked.")??;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|_| "Windows could not open your browser. Try again.".into())
}

#[tauri::command]
async fn query_library(
    query: catalog::Query,
    state: State<'_, Arc<AppState>>,
) -> Result<catalog::Page> {
    let path = state.database.clone();
    tauri::async_runtime::spawn_blocking(move || catalog::query(&catalog::open(&path)?, query))
        .await
        .map_err(|_| "Search failed.".to_string())?
}

#[tauri::command]
async fn get_player_preferences(state:State<'_,Arc<AppState>>) -> Result<catalog::PlayerPreferences> {
    let path=state.database.clone();tauri::async_runtime::spawn_blocking(move||catalog::player_preferences(&catalog::open(&path)?)).await.map_err(|_|"Player preferences could not be read.".to_string())?
}
#[tauri::command]
async fn save_player_preferences(preferences:catalog::PlayerPreferences,state:State<'_,Arc<AppState>>) -> Result<()> {
    let path=state.database.clone();tauri::async_runtime::spawn_blocking(move||catalog::save_player_preferences(&catalog::open(&path)?,&preferences)).await.map_err(|_|"Player preferences could not be saved.".to_string())?
}

#[tauri::command]
async fn save_settings(settings: Settings, state: State<'_, Arc<AppState>>) -> Result<()> {
    let app_state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        settings.validate()?;
        let mut db = catalog::open(&app_state.database)?;
        let existing = catalog::settings(&db)?;
        // Only folder changes need to wait for local previews/repair. Default
        // quality and display settings do not alter an already-running job.
        let _writer = if settings.download_folder != existing.download_folder {
            let active: i64 = db
                .query_row(
                    "SELECT count(*) FROM download_jobs WHERE state IN ('queued','running')",
                    [],
                    |r| r.get(0),
                )
                .map_err(|_| "The download queue could not be checked.")?;
            if active > 0 {
                return Err("Pause or finish downloads before changing the save folder.".into());
            }
            Some(
                app_state
                    .worker_gate
                    .lock()
                    .map_err(|_| "The save folder is unavailable.")?,
            )
        } else {
            None
        };
        if settings.download_folder != existing.download_folder {
            let active: i64 = db
                .query_row(
                    "SELECT count(*) FROM download_jobs WHERE state IN ('queued','running')",
                    [],
                    |r| r.get(0),
                )
                .map_err(|_| "The download queue could not be checked.")?;
            if active > 0 {
                return Err("Pause or finish downloads before changing the save folder.".into());
            }
            let folder = std::fs::canonicalize(&settings.download_folder)
                .map_err(|_| "Choose an existing accessible folder.".to_string())?;
            if !folder.is_dir() {
                return Err("Choose a folder, rather than a file.".into());
            }
            let probe = folder.join(format!(".saveddesk-check-{}", uuid::Uuid::new_v4()));
            std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&probe)
                .map_err(|_| "This folder is not writable. Choose another folder.".to_string())?;
            std::fs::remove_file(probe)
                .map_err(|_| "The folder check could not be cleaned up.".to_string())?;
        }
        let value = serde_json::to_string(&settings)
            .map_err(|_| "Settings could not be saved.".to_string())?;
        db.execute("UPDATE settings SET value=?1 WHERE id=1", [value])
            .map_err(|_| "Settings could not be saved.".to_string())?;
        if settings.download_folder != existing.download_folder {
            storage::repair(&mut db)?;
        }
        Ok(())
    })
    .await
    .map_err(|_| "Settings update failed.".to_string())?
}

#[tauri::command]
async fn prepare_prototype(state: State<'_, Arc<AppState>>) -> Result<Preflight> {
    let app_state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = app_state
            .worker_gate
            .try_lock()
            .map_err(|_| "A test job is already running.".to_string())?;
        let (existing, missing) = catalog::fixture_history(&catalog::open(&app_state.database)?)?;
        let token = uuid::Uuid::new_v4().to_string();
        let mut pending = app_state
            .pending
            .lock()
            .map_err(|_| "A download decision could not be prepared.".to_string())?;
        pending.clear();
        pending.insert(token.clone(), (Instant::now(), existing, missing));
        Ok(Preflight {
            token,
            existing,
            missing,
            items: 3,
        })
    })
    .await
    .map_err(|_| "Download preparation failed.".to_string())?
}

#[tauri::command]
async fn run_prototype(
    token: String,
    mode: String,
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<catalog::Snapshot> {
    let app_state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        if !["new_only", "all_again"].contains(&mode.as_str()) { return Err("Choose a valid download mode.".into()); }
        let _gate = app_state.worker_gate.try_lock().map_err(|_| "A test job is already running.".to_string())?;
        let decision = app_state.pending.lock().map_err(|_| "The download decision is unavailable.".to_string())?.remove(&token).ok_or("This download decision has expired. Try again.")?;
        if decision.0.elapsed() > Duration::from_secs(300) { return Err("This download decision has expired. Try again.".into()); }
        let mut db = catalog::open(&app_state.database)?;
        if catalog::fixture_history(&db)? != (decision.1, decision.2) { return Err("The collection changed. Review the download choice again.".into()); }
        let job_id = uuid::Uuid::new_v4().to_string();
        // Every run gets a new directory. Never overwrite originals or existing partial files.
        storage::download_ready(&db)?;
        let destination = storage::root(&db)?.join(".saveddesk-samples").join(if mode == "all_again" { "re-downloads" } else { "downloads" }).join(&job_id);
        db.execute("INSERT INTO download_jobs(id,title,mode,state,destination,created_at) VALUES(?1,'Sample collection',?2,'running',?3,?4)", params![job_id, mode, destination.to_string_lossy(), chrono::Utc::now().to_rfc3339()]).map_err(|_| "The test job could not be recorded.".to_string())?;
        let result = worker_host::execute(&app, &mut db, &job_id, &mode, &destination);
        let final_state = if result.is_ok() { "completed" } else { "failed" };
        db.execute("UPDATE download_jobs SET state=?1,failed=CASE WHEN ?1='failed' THEN 3-saved-skipped ELSE 0 END WHERE id=?2", params![final_state, job_id]).map_err(|_| "The test result could not be saved.".to_string())?;
        result?;
        catalog::snapshot(&db)
    }).await.map_err(|_| "The test job failed.".to_string())?
}

#[tauri::command]
async fn open_item(id: i64, app: tauri::AppHandle, state: State<'_, Arc<AppState>>) -> Result<()> {
    let path = state.database.clone();
    let file = tauri::async_runtime::spawn_blocking(move || -> Result<PathBuf> {
        let db = catalog::open(&path)?;
        let file: i64 = db
            .query_row(
                "SELECT id FROM media_files WHERE post_id=?1 ORDER BY id DESC LIMIT 1",
                [id],
                |r| r.get(0),
            )
            .map_err(|_| "This file could not be located.")?;
        media::validated(&db, file).map(|v| v.0)
    })
    .await
    .map_err(|_| "This file could not be opened.".to_string())??;
    app.opener()
        .open_path(platform::shell_path(&file), None::<&str>)
        .map_err(|_| "Windows could not open this file.".into())
}

#[tauri::command]
async fn open_job_folder(
    id: String,
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<()> {
    let path = state.database.clone();
    let folder = tauri::async_runtime::spawn_blocking(move || -> Result<PathBuf> {
        let db = catalog::open(&path)?;
        let value: String = db
            .query_row(
                "SELECT destination FROM download_jobs WHERE id=?1",
                [id],
                |r| r.get(0),
            )
            .map_err(|_| "The job could not be found.".to_string())?;
        let resolved = PathBuf::from(value).canonicalize().map_err(|_| {
            "This job did not create a folder. Open an existing item from your library.".to_string()
        })?;
        let resolved = storage::contained(&storage::root(&db)?, &resolved)?;
        if !resolved.is_dir() {
            return Err("The output folder is unavailable.".into());
        }
        Ok(resolved)
    })
    .await
    .map_err(|_| "The folder could not be opened.".to_string())??;
    app.opener()
        .open_path(platform::shell_path(&folder), None::<&str>)
        .map_err(|_| "Windows could not open this folder.".into())
}

pub fn run() {
    // Explicit isolated debug fixtures must not activate another fixture or the owner app.
    // Distribution builds always retain normal single-instance behavior.
    let builder = tauri::Builder::default();
    let isolated_fixture = cfg!(debug_assertions) && std::env::var_os("SAVEDDESK_TEST_DATA_DIR").is_some();
    let builder = if isolated_fixture { builder } else { builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.maximize();
            let _ = window.set_focus();
        }
    })) };
    builder
        .register_asynchronous_uri_scheme_protocol("savedmedia", |context, request, responder| {
            let path = context
                .app_handle()
                .state::<Arc<AppState>>()
                .database
                .clone();
            tauri::async_runtime::spawn_blocking(move || {
                let response = match catalog::open(&path) {
                    Ok(db) => media::response(&db, request),
                    Err(_) => tauri::http::Response::builder()
                        .status(503)
                        .body(Vec::new())
                        .unwrap(),
                };
                responder.respond(response);
            });
        })

        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data = app.path().app_local_data_dir()?;
            #[cfg(debug_assertions)]
            let data = if let Ok(test_path) = std::env::var("SAVEDDESK_TEST_DATA_DIR") {
                if let Some(window) = app.get_webview_window("main") {
                    window.hide()?;
                }
                PathBuf::from(test_path)
            } else {
                data
            };
            std::fs::create_dir_all(&data)?;
            let database = data.join("prototype-catalog.db");
            let default_folder = app.path().download_dir()?.join("SavedDesk");
            #[cfg(debug_assertions)]
            let default_folder = if std::env::var("SAVEDDESK_TEST_DATA_DIR").is_ok() {
                data.join("downloads")
            } else {
                default_folder
            };
            // Create the app default only for a brand-new catalog. An existing
            // selected folder or temporarily disconnected drive is never recreated.
            if !database.exists() {
                std::fs::create_dir_all(&default_folder)?;
            }
            catalog::initialize(&database, &default_folder.to_string_lossy())
                .map_err(std::io::Error::other)?;
            let recovery_db=catalog::open(&database).map_err(std::io::Error::other)?;
            if let Ok(root)=storage::root(&recovery_db) { deletion::recover(&recovery_db,&root).map_err(std::io::Error::other)?; }
            app.manage(Arc::new(AppState {
                auth: auth::Controller::default(),
                database,
                pending: Mutex::new(HashMap::new()),
                worker_gate: Mutex::new(()),
                deletions: Mutex::new(HashMap::new()),
                playback_probe: Mutex::new(playback_probe::ProbeCache::default()),
                connection: Mutex::new(None),
                live_pending: Mutex::new(HashMap::new()),
                active: Mutex::new(HashMap::new()),
            }));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_snapshot,
            auth::get_authentication,
            auth::configure_google_identity,
            auth::import_google_identity,
            auth::reset_google_identity,
            auth::begin_google_identity,
            auth::cancel_google_identity,
            auth::check_google_identity,
            auth::disconnect_google_identity,
            external_tools::get_external_tools,
            external_tools::save_external_tools,
            external_tools::choose_external_tool,
            deletion::prepare_deletion,
            deletion::delete_saved_content,
            readiness::check_readiness,
            query_library,
            open_source_post,
            save_settings,
            get_player_preferences,
            save_player_preferences,
            prepare_prototype,
            run_prototype,
            open_item,
            open_job_folder,
            live_commands::setup_connector,
            live_commands::begin_connection,
            live_commands::cancel_connection,
            live_commands::disconnect_account,
            live_commands::open_browser,
            live_commands::prepare_download,
            live_commands::start_download,
            live_commands::stop_download,
            live_commands::resume_download,
            live_commands::firefox_profiles,
            live_commands::connect_firefox,
            media::prepare_video,
            media::post_files,
            media::open_media_file,
            media::thumbnail,
            media::thumbnails,
            media::repair_library
        ])
        .run(tauri::generate_context!())
        .expect("SavedDesk could not start. Check the WebView2 runtime and local data folder.");
}
