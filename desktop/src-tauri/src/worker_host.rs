use crate::catalog::{self, Result};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::mpsc,
    time::Duration,
};
use tauri::{Emitter, Manager};

const MAX_FRAME: u64 = 256 * 1024;

struct OwnedWorker {
    child: Child,
    #[cfg(windows)]
    job: windows_sys::Win32::Foundation::HANDLE,
}

impl Drop for OwnedWorker {
    fn drop(&mut self) {
        #[cfg(windows)]
        unsafe {
            if !self.job.is_null() {
                windows_sys::Win32::Foundation::CloseHandle(self.job);
            }
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn launch<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<OwnedWorker> {
    let mut command;
    let packaged = app
        .path()
        .resource_dir()
        .map_err(|_| "The worker package could not be found.")?
        .join("worker/saveddesk-worker.exe");
    if packaged.is_file() {
        command = Command::new(packaged);
    } else if cfg!(debug_assertions)
        && std::env::var_os("SAVEDDESK_REQUIRE_PACKAGED_WORKER").is_none()
    {
        let project = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .and_then(|p| p.parent())
            .ok_or("Project folder is unavailable.")?
            .to_path_buf();
        command = Command::new(project.join(".venv/Scripts/python.exe"));
        command.args(["-m", "social_downloader.worker"]);
        command.env("PYTHONPATH", project.join("backend/src"));
    } else {
        return Err("The packaged worker is missing. Repair the app installation.".into());
    }
    let data=app.path().app_local_data_dir().map_err(|_|"Tool settings unavailable.")?;
    #[cfg(debug_assertions)]
    let data=std::env::var("SAVEDDESK_TEST_DATA_DIR").map(PathBuf::from).unwrap_or(data);
    let tools=crate::external_tools::load(&data)?;
    if !tools.gallery_python.is_empty() {command.env("SAVEDDESK_GALLERY_PYTHON",tools.gallery_python);}
    if !tools.ffmpeg.is_empty() {command.env("SAVEDDESK_FFMPEG",tools.ffmpeg);}
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let child = command.spawn().map_err(|_| {
        "The test worker could not start. Rebuild its package and try again.".to_string()
    })?;
    #[cfg(windows)]
    {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::System::JobObjects::*;
        let mut worker = OwnedWorker {
            child,
            job: std::ptr::null_mut(),
        };
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return Err("Worker process supervision is unavailable.".into());
            }
            worker.job = job;
            let mut information: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            information.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &information as *const _ as *const std::ffi::c_void,
                std::mem::size_of_val(&information) as u32,
            ) == 0
                || AssignProcessToJobObject(job, worker.child.as_raw_handle()) == 0
            {
                return Err("Worker process supervision could not be initialized.".into());
            }
        }
        Ok(worker)
    }
    #[cfg(not(windows))]
    {
        Ok(OwnedWorker { child })
    }
}

pub struct Session {
    worker: OwnedWorker,
    input: std::process::ChildStdin,
    receiver: mpsc::Receiver<Result<Value>>,
    sequence: u64,
}
impl Session {
    pub fn start<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<Self> {
        let mut worker = launch(app)?;
        let input = worker
            .child
            .stdin
            .take()
            .ok_or("Worker input is unavailable.")?;
        let output = worker
            .child
            .stdout
            .take()
            .ok_or("Worker output is unavailable.")?;
        let errors = worker
            .child
            .stderr
            .take()
            .ok_or("Worker diagnostics are unavailable.")?;
        std::thread::spawn(move || {
            let mut reader = BufReader::new(errors);
            let mut buffer = [0; 4096];
            while reader.read(&mut buffer).is_ok_and(|n| n > 0) {}
        });
        let (sender, receiver) = mpsc::sync_channel(16);
        std::thread::spawn(move || {
            let mut reader = BufReader::new(output);
            loop {
                let mut line = Vec::new();
                if !(&mut reader)
                    .take(MAX_FRAME + 1)
                    .read_until(b'\n', &mut line)
                    .is_ok_and(|n| n > 0)
                {
                    break;
                }
                if line.len() as u64 > MAX_FRAME || line.last() != Some(&b'\n') {
                    let _ = sender.send(Err("Invalid worker response size.".into()));
                    break;
                }
                if sender
                    .send(
                        serde_json::from_slice(&line)
                            .map_err(|_| "Invalid worker response.".into()),
                    )
                    .is_err()
                {
                    break;
                }
            }
        });
        let mut session = Self {
            worker,
            input,
            receiver,
            sequence: 0,
        };
        let hello = session
            .next(Duration::from_secs(20))?
            .ok_or("Worker startup timed out.")?;
        if hello["event"] != "hello" {
            return Err("The worker package is incompatible. Rebuild or repair the app.".into());
        }
        Ok(session)
    }
    pub fn send(&mut self, value: Value) -> Result<()> {
        let bytes = serde_json::to_vec(&value).map_err(|_| "Invalid worker request.")?;
        if bytes.len() > crate::platform::MAX_PRIVATE {
            return Err("Private worker request is too large.".into());
        }
        self.input
            .write_all(&bytes)
            .and_then(|_| self.input.write_all(b"\n"))
            .and_then(|_| self.input.flush())
            .map_err(|_| "The worker connection closed.".into())
    }
    pub fn next(&mut self, timeout: Duration) -> Result<Option<Value>> {
        let value = match self.receiver.recv_timeout(timeout) {
            Ok(value) => value?,
            Err(mpsc::RecvTimeoutError::Timeout) => return Ok(None),
            Err(_) => {
                return Err("The worker closed unexpectedly. Completed files are preserved.".into())
            }
        };
        if value["protocol_version"] != 1 || value["sequence"].as_u64() != Some(self.sequence + 1) {
            return Err("The worker protocol is incompatible.".into());
        }
        self.sequence += 1;
        Ok(Some(value))
    }
    pub fn finish(&mut self) -> Result<()> {
        self.send(json!({"protocol_version":1,"command":"shutdown"}))?;
        for _ in 0..100 {
            if let Some(status) = self
                .worker
                .child
                .try_wait()
                .map_err(|_| "Worker shutdown failed.")?
            {
                return if status.success() {
                    Ok(())
                } else {
                    Err("The worker stopped unexpectedly.".into())
                };
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        Err("Worker shutdown timed out.".into())
    }
}

pub(crate) fn browser_source(source: &str) -> bool {["youtube","facebook","tiktok","pinterest"].contains(&source)}
pub(crate) fn valid_browser_identity(source: &str, identity: &str) -> bool {
    browser_source(source) && identity.strip_prefix("session_").is_some_and(|hash|hash.len()==64 && hash.bytes().all(|c|c.is_ascii_hexdigit() && !c.is_ascii_uppercase()))
}

pub fn verify<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    source: &str,
    cookies: &Value,
    user_agent: Option<&str>,
    stop: &std::sync::atomic::AtomicBool,
) -> Result<Value> {
    let mut session = Session::start(app)?;
    let mut command = json!({"protocol_version":1,"command":if browser_source(source){"approve_browser_session"}else{"verify_account"},"source":source,"cookies":cookies,"user_agent":user_agent});
    #[cfg(debug_assertions)]
    if let Ok(origin) = std::env::var("SAVEDDESK_TEST_PLATFORM_ORIGIN") {
        command["test_origin"] = json!(origin);
    }
    session.send(command)?;
    let deadline = std::time::Instant::now() + Duration::from_secs(55);
    let event = loop {
        if stop.load(std::sync::atomic::Ordering::Relaxed) {
            return Err("Connection cancelled. Saved files are preserved.".into());
        }
        if let Some(event) = session.next(Duration::from_millis(250))? {
            break event;
        }
        if std::time::Instant::now() > deadline {
            return Err("Account verification timed out. Check your connection and retry.".into());
        }
    };
    if event["event"] != if browser_source(source){"browser_session_ready"}else{"account_verified"} {
        return Err(event["data"]["message"]
            .as_str()
            .unwrap_or("The account could not be verified. Sign in again in your browser.")
            .to_string());
    }
    let identity = event["data"]["account_id"]
        .as_str()
        .ok_or("The account ID is missing.")?;
    let username = event["data"]["username"]
        .as_str()
        .ok_or("The username is missing.")?;
    if identity.is_empty()
        || (browser_source(source) && !valid_browser_identity(source,identity))
        || (!browser_source(source) && (identity.len()>30 || !identity.chars().all(|c|c.is_ascii_digit())))
        || username.len() > 80
        || !username
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.')
    {
        return Err("The platform returned an invalid account identity.".into());
    }
    session.finish()?;
    Ok(event["data"].clone())
}

fn safe_progress(detail: &Value, pending: Option<&Value>, transfer: bool) -> Result<Value> {
    if !transfer || pending.is_none_or(|p|p["item_id"]!=detail["item_id"]) {return Err("Progress belongs to an unapproved transfer.".into());}
    let phase=detail["phase"].as_str().filter(|p|["downloading","processing"].contains(p)).ok_or("Invalid progress phase.")?;
    let received=detail["received"].as_u64().filter(|n|*n<=10*1024u64.pow(4)).ok_or("Invalid progress size.")?;
    let total=if detail["total"].is_null(){None}else{Some(detail["total"].as_u64().filter(|n|*n>0 && *n<=10*1024u64.pow(4) && received<=*n).ok_or("Invalid progress total.")?)};
    Ok(json!({"phase":phase,"received":received,"total":total}))
}

pub fn execute_live<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    db: &mut Connection,
    command: Value,
    stop: &std::sync::atomic::AtomicBool,
) -> Result<()> {
    use std::sync::atomic::Ordering;
    let job = command["job_id"]
        .as_str()
        .ok_or("Missing job ID.")?
        .to_string();
    let source = command["source"]
        .as_str()
        .ok_or("Missing source.")?
        .to_string();
    let account = command["account_id"]
        .as_str()
        .ok_or("Missing account.")?
        .to_string();
    let quality = command["quality"]
        .as_str()
        .unwrap_or("original")
        .to_string();
    let profile = command["profile"]
        .as_str()
        .unwrap_or("original")
        .to_string();
    let mode = command["download_mode"]
        .as_str()
        .ok_or("Missing download mode.")?
        .to_string();
    let root = PathBuf::from(
        command["destination"]
            .as_str()
            .ok_or("Missing destination.")?,
    );
    std::fs::create_dir_all(&root)
        .map_err(|_| "The download folder cannot be created. Choose another folder in Settings.")?;
    let root = root
        .canonicalize()
        .map_err(|_| "The download folder is unavailable.")?;
    let mut session = Session::start(app)?;
    session.send(command)?;
    let mut pending: Option<Value> = None;
    let mut transfer = false;
    let mut seen = std::collections::HashSet::new();
    let mut activity = std::time::Instant::now();
    loop {
        if stop.load(Ordering::Relaxed) {
            return Err("stopped".into());
        }
        let Some(event) = session.next(Duration::from_millis(250))? else {
            if activity.elapsed() > Duration::from_secs(90) {
                return Err("The download stopped responding. Completed files are preserved; retry when your connection is ready.".into());
            }
            continue;
        };
        activity = std::time::Instant::now();
        if event["job_id"] != job {
            return Err("The worker response belongs to another job.".into());
        }
        let detail = &event["data"];
        let key = detail["item_id"].as_str().unwrap_or("");
        match event["event"].as_str() {
            Some("started" | "heartbeat") => {}
            Some("download_progress") => {
                let safe = safe_progress(detail,pending.as_ref(),transfer)?;
                let _=app.emit("worker-event",json!({"event":"download_progress","job_id":job,"sequence":event["sequence"],"data":safe}));
                continue;
            }
            Some("item_decision_required") => {
                if pending.is_some()
                    || key.is_empty()
                    || key.len() > 140
                    || !key
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
                    || seen.contains(key)
                {
                    return Err("Invalid media transfer request.".into());
                }
                let native = detail["native_id"].as_str().unwrap_or("");
                if native.is_empty()
                    || native.len() > 120
                    || !native
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
                    || detail["caption"].as_str().unwrap_or("").len() > 8000
                    || !["image", "video", "audio", "text"].contains(&detail["kind"].as_str().unwrap_or(""))
                {
                    return Err("Unsupported platform media metadata.".into());
                }
                // Recheck physical files before each request; resume also skips this job's committed files.
                let file_quality = if detail["kind"] == "video" {
                    quality.as_str()
                } else {
                    "original"
                };
                let file_profile = if detail["kind"] == "video" {
                    profile.as_str()
                } else {
                    "original"
                };
                transfer = !catalog::live_present(
                    db,
                    &source,
                    &account,
                    key,
                    file_quality,
                    file_profile,
                    Some(&job),
                )? && (mode == "all_again"
                    || !catalog::live_present(
                        db,
                        &source,
                        &account,
                        key,
                        file_quality,
                        file_profile,
                        None,
                    )?);
                if transfer {
                    let selected = crate::storage::download_ready(db)?;
                    crate::storage::contained(&selected, &root)?;
                }
                pending = Some(detail.clone());
                session.send(json!({"protocol_version":1,"command":"item_decision","job_id":job,"item_id":key,"transfer":transfer}))?;
            }
            Some("item_completed") => {
                let approved = pending
                    .as_ref()
                    .filter(|d| d["item_id"] == key)
                    .ok_or("Unapproved media completion.")?;
                if !transfer {
                    return Err("An unapproved transfer was rejected.".into());
                }
                let relative = detail["relative_path"]
                    .as_str()
                    .ok_or("Missing output path.")?;
                let file = root
                    .join(relative)
                    .canonicalize()
                    .map_err(|_| "The downloaded file is missing.")?;
                let ext = file
                    .extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_ascii_lowercase();
                let bytes = detail["bytes_written"]
                    .as_u64()
                    .ok_or("Missing file size.")?;
                if !file.starts_with(&root)
                    || file.parent() != Some(root.as_path())
                    || ![
                        "bmp", "avif", "mp3", "wav", "ogg", "opus", "flac", "aac", "jpg", "jpeg", "png", "webp", "gif", "mp4", "mkv", "webm", "m4a", "txt",
                    ]
                    .contains(&ext.as_str())
                    || bytes == 0
                    || !std::fs::metadata(&file).is_ok_and(|m| m.is_file() && m.len() == bytes)
                {
                    return Err("The downloaded file failed verification.".into());
                }
                let file_quality = if approved["kind"] == "video" {
                    quality.as_str()
                } else {
                    "original"
                };
                let file_profile = if approved["kind"] == "video" {
                    profile.as_str()
                } else {
                    "original"
                };
                let mut recorded = approved.clone();
                if let Some(relative) = detail["original_path"].as_str().filter(|v| !v.is_empty()) {
                    let original = crate::storage::contained(&root, &root.join(relative))?;
                    if approved["kind"] != "video" || file_profile != "compatible_mp4" || original.parent() != Some(root.as_path()) || original == file
                        || !["mp4","mkv","webm"].contains(&original.extension().and_then(|v|v.to_str()).unwrap_or(""))
                        || !file.file_name().unwrap().to_string_lossy().starts_with(&format!("{}.compatible",original.file_stem().unwrap().to_string_lossy()))
                        || !std::fs::metadata(&original).is_ok_and(|m| m.is_file() && m.len() > 0) {
                        return Err("The preserved original failed verification.".into());
                    }
                    recorded["original_path"] = json!(original.to_string_lossy());
                    recorded["original_bytes"] = json!(std::fs::metadata(&original).map_err(|_|"Preserved original unavailable.")?.len());
                }
                catalog::record_live(
                    db,
                    &job,
                    &source,
                    &account,
                    &recorded,
                    &file,
                    bytes,
                    file_quality,
                    file_profile,
                )?;
                session.send(json!({"protocol_version":1,"command":"item_recorded","job_id":job,"item_id":key}))?;
                seen.insert(key.to_string());
                pending = None;
            }
            Some("item_skipped" | "item_failed") => {
                if pending.as_ref().is_none_or(|d| d["item_id"] != key)
                    || (event["event"] == "item_skipped" && transfer)
                {
                    return Err("Invalid media outcome.".into());
                }
                catalog::record_outcome(
                    db,
                    &job,
                    key,
                    if event["event"] == "item_skipped" {
                        "skipped"
                    } else {
                        "failed"
                    },
                )?;
                seen.insert(key.to_string());
                pending = None;
            }
            Some("completed") if pending.is_none() => {
                session.finish()?;
                return Ok(());
            }
            Some("failed") => {
                if let Some(approved) = pending.as_ref() {
                    let failed_key = approved["item_id"]
                        .as_str()
                        .ok_or("Missing failed media identity.")?;
                    catalog::record_outcome(db, &job, failed_key, "failed")?;
                }
                if detail["category"] == "processing" {
                    return Err(detail["message"].as_str().filter(|message| message.len() <= 2000).unwrap_or("Video processing failed. The original is preserved. Retry or choose another profile.").to_string());
                }
                if detail["category"] == "connection" {
                    let message = detail["message"]
                        .as_str()
                        .unwrap_or("Reconnect this account in your signed-in browser.");
                    db.execute("UPDATE accounts SET state='session_expired',message=?1 WHERE source=?2 AND account_id=?3",params![message,source,account]).map_err(|_|"Account state could not be recorded.")?;
                    return Err(message.to_string());
                }
                if crate::platforms::is_public(&source) {return Err("The public download stopped. Check the link and your connection, then retry unfinished items. Completed files are preserved.".into());}
                return Err("The platform download stopped. Check your connection or reconnect this account, then retry. Completed files are preserved.".into());
            }
            _ => return Err("The worker sent an unsupported download event.".into()),
        }
        // Only safe status goes to React; never forward unknown/private worker frames.
        let _ = app.emit(
            "worker-event",
            json!({"event":event["event"],"job_id":job,"sequence":event["sequence"],"data":{}}),
        );
    }
}

pub fn execute<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    db: &mut Connection,
    job_id: &str,
    mode: &str,
    root: &Path,
) -> Result<()> {
    let mut worker = launch(app)?;
    let mut input = worker
        .child
        .stdin
        .take()
        .ok_or("Worker input is unavailable.")?;
    let output = worker
        .child
        .stdout
        .take()
        .ok_or("Worker output is unavailable.")?;
    let diagnostics = worker
        .child
        .stderr
        .take()
        .ok_or("Worker diagnostics are unavailable.")?;
    // Drain stderr concurrently. Never forward unknown diagnostic text to the renderer.
    std::thread::spawn(move || {
        let mut reader = BufReader::new(diagnostics);
        let mut buffer = [0u8; 4096];
        while reader.read(&mut buffer).is_ok_and(|size| size > 0) {}
    });
    let (sender, receiver) = mpsc::sync_channel(16);
    std::thread::spawn(move || {
        let mut reader = BufReader::new(output);
        loop {
            let mut line = Vec::new();
            let read = (&mut reader)
                .take(MAX_FRAME + 1)
                .read_until(b'\n', &mut line);
            if !read.is_ok_and(|size| size > 0) {
                break;
            }
            if line.len() as u64 > MAX_FRAME || line.last() != Some(&b'\n') {
                let _ = sender.send(Err("The worker sent an invalid frame.".to_string()));
                break;
            }
            if sender
                .send(
                    serde_json::from_slice::<Value>(&line)
                        .map_err(|_| "The worker sent invalid JSON.".to_string()),
                )
                .is_err()
            {
                break;
            }
        }
    });
    let write = |input: &mut std::process::ChildStdin, message: Value| -> Result<()> {
        serde_json::to_writer(&mut *input, &message)
            .map_err(|_| "The worker request failed.".to_string())?;
        input
            .write_all(b"\n")
            .and_then(|_| input.flush())
            .map_err(|_| "The worker connection closed.".to_string())
    };
    let mut sequence = 0;
    let hello = receiver
        .recv_timeout(Duration::from_secs(15))
        .map_err(|_| "The worker did not respond.".to_string())??;
    if hello["event"] != "hello" || hello["protocol_version"] != 1 || hello["sequence"] != 1 {
        return Err("The worker protocol is incompatible.".into());
    }
    sequence += 1;
    write(
        &mut input,
        json!({ "protocol_version": 1, "command": "fixture_download", "job_id": job_id,
        "destination": root, "download_mode": mode,
        "items": [{"id":"fixture-1"},{"id":"fixture-2"},{"id":"fixture-3"}] }),
    )?;
    let mut pending_item: Option<String> = None;
    let mut approved_transfer = false;
    let mut processed = std::collections::HashSet::new();
    loop {
        let event = receiver
            .recv_timeout(Duration::from_secs(15))
            .map_err(|_| {
                "The worker stopped responding. Your completed files are preserved.".to_string()
            })??;
        if event["protocol_version"] != 1
            || event["sequence"].as_u64() != Some(sequence + 1)
            || event["job_id"] != job_id
        {
            return Err("The worker event does not match this job.".into());
        }
        sequence += 1;
        let id = event["data"]["item_id"].as_str().unwrap_or_default();
        match event["event"].as_str() {
            Some("started") if sequence == 2 => {}
            Some("item_decision_required") => {
                if pending_item.is_some()
                    || !["fixture-1", "fixture-2", "fixture-3"].contains(&id)
                    || processed.contains(id)
                {
                    return Err("Unexpected worker transfer request.".into());
                }
                let transfer = mode == "all_again" || !catalog::present(db, id)?;
                approved_transfer = transfer;
                pending_item = Some(id.into());
                write(
                    &mut input,
                    json!({ "protocol_version": 1, "command": "item_decision", "job_id": job_id, "item_id": id, "transfer": transfer }),
                )?;
            }
            Some("item_completed") => {
                if pending_item.as_deref() != Some(id) || !approved_transfer {
                    return Err("An unapproved file completion was rejected.".into());
                }
                let relative = event["data"]["relative_path"]
                    .as_str()
                    .ok_or("The file path is missing.")?;
                if relative != format!("{id}.svg") {
                    return Err("An unexpected output path was rejected.".into());
                }
                let file = root
                    .join(relative)
                    .canonicalize()
                    .map_err(|_| "The completed file is unavailable.".to_string())?;
                let approved_root = root
                    .canonicalize()
                    .map_err(|_| "The output folder is unavailable.".to_string())?;
                let bytes = event["data"]["bytes_written"]
                    .as_u64()
                    .ok_or("The file size is missing.")?;
                if !file.starts_with(approved_root)
                    || bytes == 0
                    || bytes > 65536
                    || std::fs::metadata(&file)
                        .map_err(|_| "The output cannot be verified.")?
                        .len()
                        != bytes
                {
                    return Err("The completed file could not be verified.".into());
                }
                catalog::record(db, job_id, id, &file, bytes)?;
                processed.insert(id.to_string());
                pending_item = None;
                write(
                    &mut input,
                    json!({ "protocol_version": 1, "command": "item_recorded", "job_id": job_id, "item_id": id }),
                )?;
            }
            Some("item_skipped") => {
                if pending_item.as_deref() != Some(id)
                    || approved_transfer
                    || mode == "all_again"
                    || !catalog::present(db, id)?
                {
                    return Err("An invalid skip result was rejected.".into());
                }
                db.execute(
                    "INSERT INTO download_items(job_id,native_id,state) VALUES(?1,?2,'skipped')",
                    params![job_id, id],
                )
                .map_err(|_| "The skip result could not be saved.".to_string())?;
                db.execute(
                    "UPDATE download_jobs SET skipped=skipped+1 WHERE id=?1",
                    [job_id],
                )
                .map_err(|_| "The job result could not be saved.".to_string())?;
                processed.insert(id.to_string());
                pending_item = None;
            }
            Some("completed") if pending_item.is_none() && processed.len() == 3 => {
                write(
                    &mut input,
                    json!({ "protocol_version": 1, "command": "shutdown" }),
                )?;
                drop(input);
                for _ in 0..100 {
                    if let Some(status) = worker
                        .child
                        .try_wait()
                        .map_err(|_| "Worker shutdown failed.".to_string())?
                    {
                        return if status.success() {
                            Ok(())
                        } else {
                            Err("The worker exited unexpectedly.".into())
                        };
                    }
                    std::thread::sleep(Duration::from_millis(20));
                }
                return Err("Worker shutdown timed out.".into());
            }
            _ => return Err("The worker could not complete this test job.".into()),
        }
        let _ = app.emit("worker-event", &event);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_host_records_skips_and_repeats_real_worker_files() {
        let directory = tempfile::tempdir().unwrap();
        let database = directory.path().join("catalog.db");
        catalog::initialize(&database, directory.path().to_str().unwrap()).unwrap();
        let mut db = catalog::open(&database).unwrap();
        let app = tauri::test::mock_app();
        for (job, mode, expected_saved, expected_skipped) in [
            ("first", "new_only", 3, 0),
            ("skip", "new_only", 0, 3),
            ("repeat", "all_again", 3, 0),
        ] {
            let output = directory.path().join(job);
            db.execute("INSERT INTO download_jobs(id,title,mode,state,destination,created_at) VALUES(?1,'Test',?2,'running',?3,?4)", params![job, mode, output.to_string_lossy(), chrono::Utc::now().to_rfc3339()]).unwrap();
            execute(app.handle(), &mut db, job, mode, &output).unwrap();
            let counts: (i64, i64) = db
                .query_row(
                    "SELECT saved,skipped FROM download_jobs WHERE id=?1",
                    [job],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .unwrap();
            assert_eq!(counts, (expected_saved, expected_skipped));
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
            6
        );
        assert!(!directory.path().join("skip").exists());
        assert_eq!(
            std::fs::read(directory.path().join("first/fixture-1.svg")).unwrap(),
            std::fs::read(directory.path().join("repeat/fixture-1.svg")).unwrap()
        );
    }
}

#[cfg(test)]
mod progress_tests {
    use super::*;
    #[test] fn progress_requires_approved_transfer_and_sanitizes_payload() {
        let pending=json!({"item_id":"asset"});
        let detail=json!({"item_id":"asset","phase":"downloading","received":25,"total":100,"url":"secret-url","cookies":"secret"});
        assert!(safe_progress(&detail,None,true).is_err());
        assert!(safe_progress(&detail,Some(&pending),false).is_err());
        assert!(safe_progress(&detail,Some(&json!({"item_id":"other"})),true).is_err());
        assert_eq!(safe_progress(&detail,Some(&pending),true).unwrap(),json!({"phase":"downloading","received":25,"total":100}));
    }
    #[test] fn progress_rejects_overflow_invalid_phase_and_false_total() {
        let pending=json!({"item_id":"asset"});
        for detail in [json!({"item_id":"asset","phase":"downloading","received":101,"total":100}),json!({"item_id":"asset","phase":"private","received":1,"total":null}),json!({"item_id":"asset","phase":"downloading","received":-1,"total":null})] {
            assert!(safe_progress(&detail,Some(&pending),true).is_err());
        }
        assert!(safe_progress(&json!({"item_id":"asset","phase":"processing","received":0,"total":null}),Some(&pending),true).is_ok());
        assert!(valid_browser_identity("youtube", &format!("session_{}","a".repeat(64))));
        assert!(!valid_browser_identity("instagram", &format!("session_{}","a".repeat(64))));
        assert!(!valid_browser_identity("youtube","12345"));
    }
}
