//! User-requested local checks. No platform requests, session reads or catalog export.
use crate::{
    catalog::{self, Result},
    platform, storage, worker_host, AppState,
};
use serde::Serialize;
use std::{path::Path, sync::Arc, time::Duration};
use tauri::{Manager, State};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Check {
    id: &'static str,
    label: &'static str,
    state: &'static str,
    message: String,
    action: &'static str,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    checks: Vec<Check>,
    free_bytes: Option<u64>,
}
fn check(
    id: &'static str,
    label: &'static str,
    state: &'static str,
    message: impl Into<String>,
    action: &'static str,
) -> Check {
    Check {
        id,
        label,
        state,
        message: message.into(),
        action,
    }
}

// Only the selected folder receives an empty, uniquely owned write probe.
fn writable(folder: &Path) -> Result<()> {
    let path = folder.join(format!(".saveddesk-check-{}", uuid::Uuid::new_v4()));
    let file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|_| "This folder is not writable. Choose another folder in Settings.")?;
    drop(file);
    std::fs::remove_file(path)
        .map_err(|_| "The folder check could not be cleaned up. Check its permissions.".into())
}
fn folder_checks(db: &rusqlite::Connection) -> (Vec<Check>, Option<u64>) {
    let mut checks = vec![];
    let root = match storage::root(db) {
        Ok(root) => root,
        Err(message) => {
            return (
                vec![
                    check("folder", "Save folder", "blocked", message, "folder"),
                    check(
                        "space",
                        "Free space",
                        "pending",
                        "Reconnect the drive or choose a folder, then check again.",
                        "folder",
                    ),
                ],
                None,
            )
        }
    };
    match writable(&root) {
        Ok(()) => checks.push(check(
            "folder",
            "Save folder",
            "ready",
            "Your selected folder is available and writable.",
            "none",
        )),
        Err(message) => checks.push(check("folder", "Save folder", "blocked", message, "folder")),
    }
    let free = storage::free_bytes(&root).ok();
    let (state, message) = match free {
        Some(bytes) if bytes < storage::MIN_FREE_BYTES => ("blocked", "Less than 256 MiB is available. Free space or choose another folder before downloading."),
        Some(bytes) if bytes < 1024 * 1024 * 1024 => ("warning", "Less than 1 GiB is available. Large videos or collections may need more space."),
        Some(_) => ("ready", "Space is available. Collection sizes are unknown until their media is discovered."),
        None => ("blocked", "Free space could not be checked. Reconnect the drive or check folder permissions before downloading."),
    };
    checks.push(check(
        "space",
        "Free space",
        state,
        message,
        if state == "ready" { "none" } else { "folder" },
    ));
    (checks, free)
}

#[tauri::command]
pub async fn check_readiness(
    browser: String,
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<Report> {
    if !["chrome", "edge", "brave", "vivaldi", "chromium", "firefox"].contains(&browser.as_str()) {
        return Err("Choose a supported browser.".into());
    }
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let db = catalog::open(&state.database)?;
        let (mut checks, free_bytes) = folder_checks(&db);
        // try_lock avoids waiting behind a download or account verification.
        if let Ok(_gate) = state.worker_gate.try_lock() {
            let probe = (|| -> Result<(bool, bool, bool, bool)> {
                let mut session = worker_host::Session::start(&app)?;
                session.send(serde_json::json!({"protocol_version":1,"command":"probe_capabilities"}))?;
                let event = session.next(Duration::from_secs(30))?.ok_or("Local tools check timed out.")?;
                if event["event"] != "capabilities" || event["data"]["live_downloads"] != true {
                    return Err("Worker capabilities are incompatible.".into());
                }
                let ffmpeg = event["data"]["ffmpeg"].as_bool().ok_or("Invalid tools result.")?;
                let ffprobe = event["data"]["ffprobe"].as_bool().ok_or("Invalid tools result.")?;
                session.finish()?;
                Ok((ffmpeg, ffprobe, event["data"]["youtube_runtime"].as_bool().unwrap_or(false), event["data"]["gallery"].as_bool().unwrap_or(false)))
            })();
            match probe {
                Ok((ffmpeg, ffprobe, youtube, gallery)) => {
                    checks.push(check("gallery", "Gallery tools", if gallery {"ready"} else {"blocked"}, if gallery {"The separately installed gallery environment is available."} else {"Select a supported gallery Python environment in Settings -> Download tools."}, "none"));
                    checks.push(check("youtube", "YouTube support", if youtube {"ready"} else {"blocked"}, if youtube {"The JavaScript runtime and YouTube support scripts are installed."} else {"YouTube support is incomplete. Repair the app installation."}, "none"));
                    checks.push(check("worker", "Download engine", "ready", "The local download engine started and responded correctly.", "none"));
                    checks.push(check("ffmpeg", "Video conversion", if ffmpeg { "ready" } else { "warning" },
                        if ffmpeg { "FFmpeg starts correctly. Compatible MP4 conversion is available." } else { "FFmpeg is unavailable. Select its separately installed executable in Settings -> Download tools before downloading videos." }, "none"));
                    checks.push(check("ffprobe", "Video inspection", if ffprobe { "ready" } else { "warning" },
                        if ffprobe { "The video inspection tool starts correctly." } else { "FFprobe is unavailable. Some video inspection features will be limited; original downloads remain available." }, "none"));
                }
                Err(_) => checks.push(check("worker", "Download engine", "blocked", "The local engine could not complete its check. Repair the app installation, then check again.", "none")),
            }
        } else {
            checks.push(check("worker", "Download engine", "pending", "A download, connection, or preview is using the engine. Check again when it finishes.", "none"));
        }
        let resources = app.path().resource_dir().map_err(|_| "App resources are unavailable.")?;
        if browser == "firefox" {
            checks.push(check("connector", "Browser connection", "pending", "Regular Firefox profiles can connect directly. Use Accounts to choose and approve your profile.", "accounts"));
        } else {
            let mut host = resources.join("saveddesk-native-host.exe");
            if !host.is_file() && cfg!(debug_assertions) {
                host = std::env::current_exe().map_err(|_| "App folder is unavailable.")?.with_file_name("saveddesk-native-host.exe");
            }
            let manifest = state.database.parent().ok_or("App data is unavailable.")?.join(format!("connector-{browser}.json"));
            let packaged = resources.join("browser-connector/chromium/manifest.json").is_file() && host.is_file();
            let registered = packaged && platform::connector_registered(&browser, &manifest, &host);
            checks.push(check("connector", "Browser connection", if registered { "ready" } else { "warning" },
                if registered { "The browser host is registered for this app. Extension installation and account approval must still be checked in your browser." }
                else if packaged { "Set up the connector for this browser in Accounts, then load or reload the extension." }
                else { "The connector package is missing. Repair the app installation before connecting this browser." }, "accounts"));
        }
        checks.push(check("runtime", "App interface", "ready", "The Windows desktop interface is running. This check does not contact Instagram or X.", "none"));
        Ok(Report { checks, free_bytes })
    }).await.map_err(|_| "The setup check could not finish. Try again.")?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn offline_folder_is_not_recreated_or_replaced() {
        let temp = tempfile::tempdir().unwrap();
        let missing = temp.path().join("offline");
        let database = temp.path().join("catalog.db");
        catalog::initialize(&database, &missing.to_string_lossy()).unwrap();
        let (checks, free) = folder_checks(&catalog::open(&database).unwrap());
        assert_eq!(checks[0].state, "blocked");
        assert_eq!(checks[1].state, "pending");
        assert!(free.is_none());
        assert!(!missing.exists());
    }
    #[test]
    fn check_removes_only_its_own_probe_and_reports_user_space() {
        let temp = tempfile::tempdir().unwrap();
        let media = temp.path().join("keep.jpg");
        std::fs::write(&media, b"fixture").unwrap();
        writable(temp.path()).unwrap();
        assert_eq!(std::fs::read(&media).unwrap(), b"fixture");
        assert_eq!(std::fs::read_dir(temp.path()).unwrap().count(), 1);
        assert!(storage::free_bytes(temp.path()).unwrap() > 0);
    }
}
