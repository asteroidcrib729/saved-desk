use crate::{
    catalog::{self, Result},
    platform, worker_host, AppState,
};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tauri::{Manager, State};
use tauri_plugin_opener::OpenerExt;

pub struct PendingConnection {
    source: String,
    browser: String,
    nonce: String,
    created: Instant,
    stop: Arc<AtomicBool>,
    submitted: bool,
}
pub struct Draft {
    source: String,
    account: String,
    target: String,
    title: String,
    created: Instant,
    existing: i64,
    quality: String,
    profile: String,
    advanced: catalog::AdvancedVideoSettings,
}
#[derive(Serialize)]
pub struct Preparation {
    token: String,
    existing: i64,
    collection: bool,
    title: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DownloadRequest {
    source: String,
    target: String,
    title: String,
    quality: String,
    profile: String,
    #[serde(default)]
    advanced: Option<catalog::AdvancedVideoSettings>,
}
fn valid_source(source: &str) -> Result<()> {
    if ["instagram", "x", "youtube", "facebook", "tiktok", "pinterest"].contains(&source) {
        Ok(())
    } else {
        Err("Choose a platform with browser-session connection support.".into())
    }
}
fn valid_browser(browser: &str) -> Result<()> {
    if ["edge", "chrome", "firefox", "brave", "vivaldi", "chromium"].contains(&browser) {
        Ok(())
    } else {
        Err("Choose a supported browser.".into())
    }
}
fn data(state: &AppState) -> Result<&Path> {
    state
        .database
        .parent()
        .ok_or("App data is unavailable.".into())
}
fn session_path(state: &AppState, source: &str) -> Result<PathBuf> {
    valid_source(source)?;
    Ok(data(state)?.join(format!("session-{source}.dpapi")))
}
fn load_session(state: &AppState, source: &str) -> Result<Value> {
    let path = session_path(state, source)?;
    let bytes = std::fs::read(path).map_err(|_| "Connect this account from your browser first.")?;
    serde_json::from_slice(&platform::crypt(&bytes, false)?)
        .map_err(|_| "The saved session is invalid. Reconnect this account.".into())
}
fn store_session(state: &AppState, source: &str, value: &Value) -> Result<()> {
    store_protected(&session_path(state, source)?,value)
}
fn store_protected(path: &Path, value: &Value) -> Result<()> {
    use std::io::Write;
    let temporary = path.with_extension(format!("{}.pending", uuid::Uuid::new_v4()));
    let protected = platform::crypt(
        &serde_json::to_vec(value).map_err(|_| "Invalid browser session payload.")?,
        true,
    )?;
    let result = (|| -> Result<()> {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|_| "The protected session could not be created.")?;
        file.write_all(&protected)
            .and_then(|_| file.sync_all())
            .map_err(|_| "The protected session could not be saved.")?;
        drop(file);
        std::fs::rename(&temporary, &path)
            .map_err(|_| "The protected session could not be finalized.")?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result
}

#[tauri::command]
pub async fn firefox_profiles(app: tauri::AppHandle) -> Result<Value> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut worker = worker_host::Session::start(&app)?;
        let mut command = json!({"protocol_version":1,"command":"firefox_profiles"});
        #[cfg(debug_assertions)]
        if let Ok(root) = std::env::var("SAVEDDESK_TEST_FIREFOX_ROOT") {
            command["test_profile_root"] = json!(root);
        }
        worker.send(command)?;
        let response = worker
            .next(Duration::from_secs(20))?
            .ok_or("Firefox profile discovery timed out.")?;
        if response["event"] != "browser_profiles" {
            return Err("Firefox profiles could not be discovered.".into());
        }
        let profiles = response["data"]["profiles"].clone();
        if !profiles.is_array() || profiles.as_array().is_some_and(|p| p.len() > 50) {
            return Err("Invalid Firefox profile list.".into());
        }
        worker.finish()?;
        Ok(profiles)
    })
    .await
    .map_err(|_| "Firefox profile discovery failed.".to_string())?
}

#[tauri::command]
pub async fn connect_firefox(
    source: String,
    profile_id: String,
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<()> {
    valid_source(&source)?;
    if profile_id.len() != 64 || !profile_id.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Choose an available Firefox profile.".into());
    }
    let state = state.inner().clone();
    let stop = Arc::new(AtomicBool::new(false));
    {
        let _gate = state
            .worker_gate
            .try_lock()
            .map_err(|_| "Pause the active job before changing browser accounts.")?;
        let mut pending = state
            .connection
            .lock()
            .map_err(|_| "Account connection is unavailable.")?;
        if pending.is_some() {
            return Err("Complete or cancel the current browser connection first.".into());
        }
        *pending = Some(PendingConnection {
            source: source.clone(),
            browser: "firefox".into(),
            nonce: uuid::Uuid::new_v4().to_string(),
            created: Instant::now(),
            stop: stop.clone(),
            submitted: true,
        });
    }
    catalog::open(&state.database)?.execute("INSERT INTO accounts(source,account_id,username,browser,state,message) VALUES(?1,'','','firefox','connecting','Verifying the selected Firefox account...') ON CONFLICT(source) DO UPDATE SET browser='firefox',state='connecting',message=excluded.message",[&source]).map_err(|_|"The connection request could not be saved.")?;
    std::thread::spawn(move || {
        let result = (|| -> Result<()> {
            let _gate = state
                .worker_gate
                .try_lock()
                .map_err(|_| "Pause the active download and connect again.")?;
            let mut worker = worker_host::Session::start(&app)?;
            let mut command = json!({"protocol_version":1,"command":"firefox_connect","source":source,"profile_id":profile_id});
            #[cfg(debug_assertions)]
            {
                if let Ok(root) = std::env::var("SAVEDDESK_TEST_FIREFOX_ROOT") {
                    command["test_profile_root"] = json!(root);
                }
                if let Ok(origin) = std::env::var("SAVEDDESK_TEST_PLATFORM_ORIGIN") {
                    command["test_origin"] = json!(origin);
                }
            }
            worker.send(command)?;
            let deadline = Instant::now() + Duration::from_secs(55);
            let event = loop {
                if stop.load(Ordering::Relaxed) {
                    return Err("Connection cancelled. Your downloads are preserved.".into());
                }
                if let Some(event) = worker.next(Duration::from_millis(250))? {
                    break event;
                }
                if Instant::now() > deadline {
                    return Err("Firefox connection timed out. Check sign-in and retry.".into());
                }
            };
            if event["event"] != "browser_session" {
                return Err(event["data"]["message"]
                    .as_str()
                    .unwrap_or(
                        "Firefox connection failed. Sign in in the selected profile and retry.",
                    )
                    .to_string());
            }
            let identity = event["data"]["account_id"]
                .as_str()
                .ok_or("Missing verified account ID.")?;
            let username = event["data"]["username"]
                .as_str()
                .ok_or("Missing verified account username.")?;
            if identity.is_empty()
                || (worker_host::browser_source(&source) && !worker_host::valid_browser_identity(&source,identity))
                || (!worker_host::browser_source(&source) && (identity.len()>30 || !identity.chars().all(|c|c.is_ascii_digit())))
                || username.len() > 80
                || !username
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.')
            {
                return Err("Firefox returned an unsupported account identity.".into());
            }
            worker.finish()?;
            let pending = state
                .connection
                .lock()
                .map_err(|_| "Connection state is unavailable.")?;
            if stop.load(Ordering::Relaxed)
                || pending
                    .as_ref()
                    .is_none_or(|p| !Arc::ptr_eq(&p.stop, &stop))
            {
                return Err("Connection cancelled. Your downloads are preserved.".into());
            }
            store_session(
                &state,
                &source,
                &json!({"account_id":identity,"cookies":event["data"]["cookies"]}),
            )?;
            catalog::open(&state.database)?.execute("INSERT INTO accounts(source,account_id,username,browser,state,message,verified_at) VALUES(?1,?2,?3,'firefox',?4,'',?5) ON CONFLICT(source) DO UPDATE SET account_id=excluded.account_id,username=excluded.username,browser='firefox',state=excluded.state,message='',verified_at=excluded.verified_at",params![source,identity,username,if worker_host::browser_source(&source){"session_ready"}else{"connected"},if worker_host::browser_source(&source){None}else{Some(chrono::Utc::now().to_rfc3339())}]).map_err(|_|"The verified Firefox account could not be recorded.")?;
            Ok(())
        })();
        if let Err(message) = result {
            if let Ok(db) = catalog::open(&state.database) {
                let _ = db.execute(
                    "UPDATE accounts SET state='sign_in_needed',message=?1 WHERE source=?2",
                    params![message, source],
                );
            }
        }
        if let Ok(mut pending) = state.connection.lock() {
            if pending
                .as_ref()
                .is_some_and(|p| Arc::ptr_eq(&p.stop, &stop))
            {
                *pending = None;
            }
        }
    });
    Ok(())
}

#[tauri::command]
pub async fn setup_connector(
    browser: String,
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<()> {
    valid_browser(&browser)?;
    let app_state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move|| {
        let resources=app.path().resource_dir().map_err(|_|"App resources are unavailable.")?;
        let mut host=resources.join("saveddesk-native-host.exe");
        if !host.is_file() && cfg!(debug_assertions) { host=std::env::current_exe().map_err(|_|"App folder is unavailable.")?.with_file_name("saveddesk-native-host.exe"); }
        if !host.is_file() { return Err("The browser connector host is missing. Repair the app installation.".into()); }
        let directory=resources.join("browser-connector").join(if browser=="firefox"{"firefox"}else{"chromium"});
        if !directory.join("manifest.json").is_file() { return Err("The companion connector package is missing. Repair the app installation.".into()); }
        let profile=data(&app_state)?;
        let host=crate::connector_payload::install_host(&profile,&host)?;
        let manifest=profile.join(format!("connector-{browser}.json"));
        let mut value=json!({"name":"com.saveddesk.connector","description":"SavedDesk selected-platform browser connector","path":platform::shell_path(&host),"type":"stdio"});
        if browser=="firefox" { value["allowed_extensions"]=json!([platform::FIREFOX_ID]); } else { value["allowed_origins"]=json!([platform::CHROMIUM_ORIGIN]); }
        std::fs::write(&manifest,serde_json::to_vec(&value).map_err(|_|"Invalid connector registration.")?).map_err(|_|"Connector registration could not be written.")?;
        platform::register(&manifest,&browser)?;
        app.opener().open_path(platform::shell_path(&directory),None::<&str>).map_err(|_|"Windows could not open the connector folder.")?;
        Ok(())
    }).await.map_err(|_|"Connector setup failed.".to_string())?
}

#[tauri::command]
pub async fn begin_connection(
    source: String,
    browser: String,
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<()> {
    valid_source(&source)?;
    valid_browser(&browser)?;
    let app_state = state.inner().clone();
    let nonce = uuid::Uuid::new_v4().to_string();
    let stop = Arc::new(AtomicBool::new(false));
    let mut connection = app_state
        .connection
        .lock()
        .map_err(|_| "Account connection is unavailable.")?;
    if connection.is_some() {
        return Err("An account connection is still active. Complete or cancel it first; cancellation may take a moment to finish.".into());
    }
    let server = platform::server()?;
    *connection = Some(PendingConnection {
        source: source.clone(),
        browser: browser.clone(),
        nonce,
        created: Instant::now(),
        stop: stop.clone(),
        submitted: false,
    });
    drop(connection);
    let db = catalog::open(&app_state.database)?;
    db.execute("INSERT INTO accounts(source,account_id,username,browser,state,message) VALUES(?1,'','',?2,'awaiting_permission','Open the SavedDesk connector in your signed-in browser profile and approve this platform.') ON CONFLICT(source) DO UPDATE SET browser=excluded.browser,state=excluded.state,message=excluded.message",params![source,browser]).map_err(|_|"The connection request could not be recorded.")?;
    std::thread::spawn(move || connection_loop(app, app_state, server, source, browser, stop));
    Ok(())
}

fn connection_loop(
    app: tauri::AppHandle,
    state: Arc<AppState>,
    mut server: std::fs::File,
    source: String,
    browser: String,
    stop: Arc<AtomicBool>,
) {
    let deadline = Instant::now() + Duration::from_secs(300);
    let result = (|| -> Result<()> {
        while Instant::now() < deadline && !stop.load(Ordering::Relaxed) {
            if !platform::accept(&server) {
                std::thread::sleep(Duration::from_millis(100));
                continue;
            }
            let response=platform::read_timed(&mut server,Duration::from_secs(10)).and_then(|request| {
                let mut pending=state.connection.lock().map_err(|_|"Account connection is unavailable.")?;
                let connection=pending.as_mut().filter(|p|!p.submitted&&p.source==source&&p.browser==browser&&!p.stop.load(Ordering::Relaxed)&&p.created.elapsed()<Duration::from_secs(300)).ok_or("This connection request expired. Start again in SavedDesk.")?;
                if request["protocol_version"]!=1 { return Err("Unsupported connector version.".into()); }
                if request["command"]=="request" { return Ok(json!({"ok":true,"protocol_version":1,"source":source,"browser":browser,"nonce":connection.nonce})); }
                if request["command"]!="authorize" || request["nonce"]!=connection.nonce || request["source"]!=source || request["browser"]!=browser || !request["cookies"].is_array() { return Err("This browser approval does not match the pending connection.".into()); }
                let user_agent = platform::browser_user_agent(request.get("user_agent"))?;
                // Consume the nonce before verification: stale/replayed submissions cannot attach sessions.
                connection.submitted=true;
                let approval_stop=connection.stop.clone();
                drop(pending);
                let cookies=request["cookies"].clone();
                let db=catalog::open(&state.database)?;
                db.execute("UPDATE accounts SET state='connecting',message='Verifying your account with the platform...' WHERE source=?1",[&source]).map_err(|_|"Account state could not be saved.")?;
                let app=app.clone();let state=state.clone();let source=source.clone();let browser=browser.clone();
                std::thread::spawn(move|| {
                    let checked=worker_host::verify(&app,&source,&cookies,user_agent.as_deref(),&approval_stop).and_then(|identity| {
                        // Disconnect/cancel racing a slow verification must not reconnect the user.
                        let pending=state.connection.lock().map_err(|_|"Connection state is unavailable.")?;
                        if approval_stop.load(Ordering::Relaxed) || pending.as_ref().is_none_or(|p|p.source!=source||!Arc::ptr_eq(&p.stop,&approval_stop)){return Err("Connection cancelled. Saved files and history are preserved.".into());}
                        store_session(&state,&source,&json!({"account_id":identity["account_id"],"cookies":cookies,"user_agent":user_agent}))?;
                        let db=catalog::open(&state.database)?;
                        db.execute("UPDATE accounts SET account_id=?1,username=?2,browser=?3,state=?4,message='',verified_at=?5 WHERE source=?6",params![identity["account_id"].as_str(),identity["username"].as_str(),browser,if worker_host::browser_source(&source){"session_ready"}else{"connected"},if worker_host::browser_source(&source){None}else{Some(chrono::Utc::now().to_rfc3339())},source]).map_err(|_|"The verified account could not be saved.")?;
                        Ok(())
                    });
                    if let Err(message)=checked { if let Ok(db)=catalog::open(&state.database){let _=db.execute("UPDATE accounts SET state='sign_in_needed',message=?1 WHERE source=?2",params![message,source]);} }
                    if let Ok(mut pending)=state.connection.lock(){if pending.as_ref().is_some_and(|p|Arc::ptr_eq(&p.stop,&approval_stop)){*pending=None;}}
                });
                Ok(json!({"ok":true,"message":"Permission received. SavedDesk is verifying your account."}))
            });
            let terminal = state
                .connection
                .lock()
                .map(|c| c.as_ref().is_none_or(|p| p.submitted))
                .unwrap_or(true);
            let value = response.unwrap_or_else(|message| json!({"ok":false,"message":message}));
            let _ = platform::write_frame(&mut server, &value);
            let _ = platform::read_timed(&mut server, Duration::from_secs(3));
            if terminal {
                return Ok(());
            }
            drop(server);
            server = platform::server()?;
        }
        Err(if stop.load(Ordering::Relaxed) {
            "Connection cancelled. Your downloads are preserved."
        } else {
            "Browser permission timed out. Click Connect and try again."
        }
        .into())
    })();
    if let Err(message) = result {
        if let Ok(mut connection) = state.connection.lock() {
            if connection.as_ref().is_some_and(|c| c.source == source) {
                *connection = None;
            }
        }
        if let Ok(db) = catalog::open(&state.database) {
            let _=db.execute("UPDATE accounts SET state='not_connected',message=?1 WHERE source=?2 AND state='awaiting_permission'",params![message,source]);
        }
    }
}

#[tauri::command]
pub fn cancel_connection(state: State<'_, Arc<AppState>>) -> Result<()> {
    if let Some(pending) = state
        .connection
        .lock()
        .map_err(|_| "Connection unavailable.")?
        .as_ref()
    {
        pending.stop.store(true, Ordering::Relaxed);
    }
    Ok(())
}
#[tauri::command]
pub async fn disconnect_account(source: String, state: State<'_, Arc<AppState>>) -> Result<()> {
    valid_source(&source)?;
    let app_state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move||{
        let _gate=app_state.worker_gate.try_lock().map_err(|_|"Stop the active download before disconnecting this account.")?;
        if let Some(pending)=app_state.connection.lock().map_err(|_|"Connection unavailable.")?.as_ref(){if pending.source==source{pending.stop.store(true,Ordering::Relaxed);}}
        let path=session_path(&app_state,&source)?;
        if path.exists(){std::fs::remove_file(path).map_err(|_|"The protected session could not be removed.")?;}
        catalog::open(&app_state.database)?.execute("UPDATE accounts SET state='not_connected',message='Disconnected. Saved files and history are preserved.' WHERE source=?1",[source]).map_err(|_|"The account could not be disconnected.")?;
        Ok(())
    }).await.map_err(|_|"Account disconnection failed.".to_string())?
}

#[tauri::command]
pub async fn open_browser(source: String, browser: String) -> Result<()> {
    valid_source(&source)?;
    valid_browser(&browser)?;
    tauri::async_runtime::spawn_blocking(move||{
        let relative=match browser.as_str(){"edge"=>"Microsoft/Edge/Application/msedge.exe","chrome"=>"Google/Chrome/Application/chrome.exe","firefox"=>"Mozilla Firefox/firefox.exe","brave"=>"BraveSoftware/Brave-Browser/Application/brave.exe","vivaldi"=>"Vivaldi/Application/vivaldi.exe",_=>"Chromium/Application/chrome.exe"};
        let roots=["ProgramFiles","ProgramFiles(x86)","LOCALAPPDATA"];
        let executable=roots.iter().filter_map(std::env::var_os).map(|p|PathBuf::from(p).join(relative)).find(|p|p.is_file()).ok_or("This browser was not found at its usual location. Open your browser manually and choose your signed-in profile.")?;
        let mut command=std::process::Command::new(executable);
        command.arg(match source.as_str(){"instagram"=>"https://www.instagram.com/","x"=>"https://x.com/","youtube"=>"https://www.youtube.com/","facebook"=>"https://www.facebook.com/","tiktok"=>"https://www.tiktok.com/",_=>"https://www.pinterest.com/"});
        #[cfg(windows)]{use std::os::windows::process::CommandExt;command.creation_flags(0x08000000);}
        command.spawn().map_err(|_|"The browser could not be opened.")?;
        Ok(())
    }).await.map_err(|_|"Browser launch failed.".to_string())?
}

fn canonical(source: &str, input: &str, username: &str) -> Result<String> {
    if crate::platforms::is_public(source) {return crate::platforms::canonical(source, input);}
    valid_source(source)?;
    let value = if input.trim().is_empty() {
        if source == "instagram" {
            format!("https://www.instagram.com/{username}/saved/")
        } else {
            "https://x.com/i/bookmarks".into()
        }
    } else {
        input.trim().to_string()
    };
    let url = tauri::Url::parse(&value).map_err(|_| "Use an Instagram or X HTTPS link.")?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || value.len() > 2000
    {
        return Err("Use an Instagram or X HTTPS link.".into());
    }
    let mut parts: Vec<_> = url.path().trim_matches('/').split('/').collect();
    let allowed = |s: &str| {
        !s.is_empty()
            && s.chars()
                .all(|c| c.is_ascii_alphanumeric() || "_.-%".contains(c))
    };
    if source == "instagram"
        && ["instagram.com", "www.instagram.com"].contains(&url.host_str().unwrap_or(""))
    {
        if parts.len() == 2 && parts[0] == "reels" { parts[0] = "reel"; }
        if (parts.len() == 2 && ["p", "reel"].contains(&parts[0]) && allowed(parts[1]))
            || (parts.len() >= 2
                && parts[0] == username
                && parts[1] == "saved"
                && (parts.len() == 2
                    || (parts.len() == 3 && parts[2] == "all-posts")
                    || (parts.len() == 4
                        && allowed(parts[2])
                        && parts[3].chars().all(|c| c.is_ascii_digit()))))
        {
            return Ok(format!("https://www.instagram.com/{}/", parts.join("/")));
        }
    }
    if source == "x"
        && ["x.com", "www.x.com", "twitter.com", "www.twitter.com"]
            .contains(&url.host_str().unwrap_or(""))
        && ((parts == ["i", "bookmarks"])
            || (parts.len() == 3
                && allowed(parts[0])
                && parts[1] == "status"
                && !parts[2].is_empty()
                && parts[2].chars().all(|c| c.is_ascii_digit())))
    {
        return Ok(format!("https://x.com/{}", parts.join("/")));
    }
    Err("Choose your saved posts/collection, X bookmarks, or a single post link.".into())
}

// Attachment URL signatures are bearer capabilities: keep them out of SQLite/UI.
fn history_target(source: &str, target: &str) -> String {if source=="discord" {target.split('?').next().unwrap_or(target).to_string()} else {target.to_string()}}
fn attachment_path(state: &AppState, job: &str) -> Result<PathBuf> {
    let id=uuid::Uuid::parse_str(job).map_err(|_| "Invalid attachment job.")?;
    Ok(data(state)?.join(format!("attachment-{id}.dpapi")))
}
fn attachment_target(state: &AppState, job: &str, stored: &str) -> Result<String> {
    let bytes=std::fs::read(attachment_path(state,job)?).map_err(|_| "Copy a fresh attachment link from Discord and add it again.")?;
    let value:Value=serde_json::from_slice(&platform::crypt(&bytes,false)?).map_err(|_| "This attachment link could not be restored. Copy a fresh link from Discord.")?;
    let target=crate::platforms::canonical("discord",value["target"].as_str().unwrap_or(""))?;
    if history_target("discord",&target)!=stored {return Err("This attachment link does not match its job.".into());}
    Ok(target)
}

// Public jobs have a stable catalog namespace, never a fabricated connected account.
fn download_session(state: &AppState, db: &rusqlite::Connection, source: &str, expected: Option<&str>) -> Result<(String, String, serde_json::Value)> {
    if crate::platforms::is_public(source) {
        // Existing public jobs stay anonymous even after a browser session is approved.
        let ready = worker_host::browser_source(source) && catalog::accounts(db)?.iter().any(|a|a.source==source && a.state=="session_ready");
        if expected==Some("public") || (expected.is_none() && !ready) {
            return Ok(("public".into(),String::new(),json!({"cookies":[]})));
        }
        if !worker_host::browser_source(source) {return Err("This download has an invalid session scope.".into());}
    }
    valid_source(source)?;
    let account=catalog::accounts(db)?.into_iter().find(|a| a.source==source && (a.state=="connected" || (worker_host::browser_source(source) && a.state=="session_ready")) && expected.is_none_or(|id| id==a.account_id)).ok_or("Connect the original account on the Accounts screen before downloading.")?;
    let session=load_session(state,source)?;
    if session["account_id"]!=account.account_id {return Err("The browser account changed. Reconnect the original account before downloading.".into());}
    Ok((account.account_id,account.username,session))
}

#[tauri::command]
pub async fn prepare_download(
    request: DownloadRequest,
    state: State<'_, Arc<AppState>>,
) -> Result<Preparation> {
    let app_state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move||{
        let db=catalog::open(&app_state.database)?;
        crate::storage::download_ready(&db)?;
        let mut video=catalog::settings(&db)?;video.quality=request.quality.clone();video.profile=request.profile.clone();if let Some(advanced)=request.advanced {video.advanced=advanced;}video.validate()?;
        let (account,username,_)=download_session(&app_state,&db,&request.source,None)?;
        let target=canonical(&request.source,&request.target,&username)?;
        if account=="public" && crate::platforms::requires_browser_session(&request.source,&target) {return Err("Watch Later and Liked videos require an approved YouTube browser session. Connect or reconnect YouTube under Accounts > Browser connections and legacy approvals. Google identity sign-in alone does not supply this session.".into());}
        let lookup=history_target(&request.source,&target);
        let collection=crate::platforms::collection(&request.source,&target);
        let title=if request.title.trim().is_empty(){if request.source=="instagram" && collection {"Instagram saved posts".into()} else if request.source=="x" && collection {"X bookmarks".into()} else if request.source=="discord" {"Discord attachment".into()} else {format!("{} {}",crate::platforms::label(&request.source),if collection {"collection"} else {"post"})}}else{request.title.trim().chars().take(120).collect()};
        let existing:i64=db.query_row("SELECT count(*) FROM download_jobs WHERE source=?1 AND account_id=?2 AND target=?3",params![request.source,account,lookup],|r|r.get(0)).map_err(|_|"History could not be checked.")?;
        let post_history:i64=db.query_row("SELECT count(*) FROM posts WHERE source=?1 AND account_id=?2 AND url=?3",params![request.source,account,lookup.trim_end_matches('/')],|r|r.get(0)).unwrap_or(0);
        let token=uuid::Uuid::new_v4().to_string();
        let mut pending=app_state.live_pending.lock().map_err(|_|"Download preparation is unavailable.")?;
        pending.retain(|_,draft|draft.created.elapsed()<Duration::from_secs(300));
        if pending.len()>20{pending.clear();}
        pending.insert(token.clone(),Draft{source:request.source,account:account,target,title:title.clone(),created:Instant::now(),existing:existing+post_history,quality:request.quality,profile:request.profile,advanced:video.advanced});
        Ok(Preparation{token,existing:existing+post_history,collection,title})
    }).await.map_err(|_|"Download preparation failed.".to_string())?
}

#[tauri::command]
pub async fn start_download(
    token: String,
    mode: String,
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<String> {
    if !["new_only", "all_again"].contains(&mode.as_str()) {
        return Err("Choose a valid download mode.".into());
    }
    let app_state = state.inner().clone();
    let job=tauri::async_runtime::spawn_blocking({let app_state=app_state.clone();move||->Result<String>{
        let draft=app_state.live_pending.lock().map_err(|_|"Download decision unavailable.")?.remove(&token).ok_or("This download choice expired. Review it again.")?;
        if draft.created.elapsed()>Duration::from_secs(300){return Err("This download choice expired. Review it again.".into());}
        let db=catalog::open(&app_state.database)?;
        download_session(&app_state,&db,&draft.source,Some(&draft.account))?;
        let lookup=history_target(&draft.source,&draft.target);
        let competing:i64=db.query_row("SELECT count(*) FROM download_jobs WHERE source=?1 AND account_id=?2 AND target=?3 AND state IN ('queued','running')",params![draft.source,draft.account,lookup],|r|r.get(0)).map_err(|_|"Queue could not be checked.")?;
        if competing>0{return Err("This content is already queued or downloading. View the existing job on Downloads.".into());}
        let queued:i64=db.query_row("SELECT count(*) FROM download_jobs WHERE state IN ('queued','running')",[],|r|r.get(0)).map_err(|_|"Queue could not be checked.")?;
        if queued>=100{return Err("The queue is full. Let some downloads finish before adding more.".into());}
        let current:i64=db.query_row("SELECT count(*) FROM download_jobs WHERE source=?1 AND account_id=?2 AND target=?3",params![draft.source,draft.account,lookup],|r|r.get(0)).map_err(|_|"History could not be checked.")?;
        if current>draft.existing{return Err("Download history changed. Review this download choice again.".into());}
        let mut settings=catalog::settings(&db)?;settings.quality=draft.quality;settings.profile=draft.profile;settings.advanced=draft.advanced;settings.validate()?;
        let video_options=serde_json::to_string(&settings.advanced).map_err(|_|"Video settings could not be saved.")?;
        let base=crate::storage::download_ready(&db)?;
        let job=uuid::Uuid::new_v4().to_string();let destination=base.join(&draft.source).join(if mode=="all_again"{"re-downloads"}else{"downloads"}).join(&job);
        if draft.source=="discord" {store_protected(&attachment_path(&app_state,&job)?,&json!({"target":draft.target}))?;}
        db.execute("INSERT INTO download_jobs(id,title,mode,state,destination,created_at,source,account_id,target,quality,profile,video_options) VALUES(?1,?2,?3,'queued',?4,?5,?6,?7,?8,?9,?10,?11)",params![job,draft.title,mode,destination.to_string_lossy(),chrono::Utc::now().to_rfc3339(),draft.source,draft.account,lookup,settings.quality,settings.profile,video_options]).map_err(|_|"The download could not be queued.")?;
        Ok(job)
    }}).await.map_err(|_|"Download queueing failed.".to_string())??;
    schedule(app, app_state);
    Ok(job)
}

fn schedule(app: tauri::AppHandle, state: Arc<AppState>) {
    std::thread::spawn(move || {
        let Ok(_gate) = state.worker_gate.lock() else {
            return;
        };
        loop {
            let Ok(mut db) = catalog::open(&state.database) else {
                return;
            };
            let selected:std::result::Result<(String,String,String,String,String,String,String,String,String),_>=db.query_row("SELECT id,source,account_id,target,mode,destination,quality,profile,video_options FROM download_jobs WHERE state='queued' AND source IS NOT NULL ORDER BY created_at LIMIT 1",[],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?,r.get(6)?,r.get(7)?,r.get(8)?)));
            let Ok((job, source, account, target, mode, destination, quality, profile, video_options)) = selected
            else {
                return;
            };
            let stop = Arc::new(AtomicBool::new(false));
            if let Ok(mut active) = state.active.lock() {
                if !db.execute("UPDATE download_jobs SET state='running',error='' WHERE id=?1 AND state='queued'",[&job]).is_ok_and(|n|n==1){continue;}
                active.insert(job.clone(), stop.clone());
            } else {
                return;
            }
            let result = (|| -> Result<()> {
                let advanced:catalog::AdvancedVideoSettings=serde_json::from_str(&video_options).map_err(|_|"Stored video settings are invalid.")?;
                advanced.validate()?;
                let authorized = crate::storage::download_ready(&db)?;
                let destination_path = PathBuf::from(&destination);
                crate::storage::ensure_destination(&authorized, &destination_path)?;
                let (_,username,session)=download_session(&state,&db,&source,Some(&account))?;
                // Revalidate stored targets before they reach the worker or filesystem.
                let target=if source=="discord" {attachment_target(&state,&job,&target)?} else {canonical(&source,&target,&username)?};
                let mut command = json!({"protocol_version":1,"command":"live_download","job_id":job,"source":source,"account_id":account,"target":target,"cookies":session["cookies"],"user_agent":session["user_agent"],"download_mode":mode,"destination":destination,"quality":quality,"resolution":quality.parse::<u32>().ok(),"profile":profile,"advanced":advanced});
                #[cfg(debug_assertions)]
                if let Ok(origin) = std::env::var("SAVEDDESK_TEST_PLATFORM_ORIGIN") {
                    command["test_origin"] = json!(origin);
                }
                worker_host::execute_live(&app, &mut db, command, &stop)
            })();
            let state_now: String = db
                .query_row("SELECT state FROM download_jobs WHERE id=?1", [&job], |r| {
                    r.get(0)
                })
                .unwrap_or("failed".into());
            if !["paused", "cancelled"].contains(&state_now.as_str()) {
                let (status, error) = match result {
                    Ok(()) => ("completed", String::new()),
                    Err(message) => ("failed", message),
                };
                let _ = db.execute(
                    "UPDATE download_jobs SET state=?1,error=?2 WHERE id=?3 AND state='running'",
                    params![status, error, job],
                );
            }
            let final_state:String=db.query_row("SELECT state FROM download_jobs WHERE id=?1",[&job],|r|r.get(0)).unwrap_or_default();
            if source=="discord" && ["completed","cancelled"].contains(&final_state.as_str()) {if let Ok(path)=attachment_path(&state,&job) {let _=std::fs::remove_file(path);}}
            if let Ok(mut active) = state.active.lock() {
                active.remove(&job);
            }
        }
    });
}

#[tauri::command]
pub async fn stop_download(id: String, pause: bool, state: State<'_, Arc<AppState>>) -> Result<()> {
    let active = state
        .active
        .lock()
        .map_err(|_| "Download controls are unavailable.")?;
    let db = catalog::open(&state.database)?;
    db.execute("UPDATE download_jobs SET state=?1,error='' WHERE id=?2 AND source IS NOT NULL AND state IN ('queued','running')",params![if pause{"paused"}else{"cancelled"},id]).map_err(|_|"The download could not be stopped.")?;
    if !pause {if let Ok(path)=attachment_path(&state,&id) {let _=std::fs::remove_file(path);}}
    if let Some(stop) = active.get(&id) {
        stop.store(true, Ordering::Relaxed);
    }
    Ok(())
}
// Keep the stopped generation registered until its worker and descendants exit.
// Waiting runs off the async executor; the active lock makes the final SQL update
// atomic with scheduler registration. A deleted/cancelled job is never resurrected.
fn queue_resume(database: &Path, active: &std::sync::Mutex<std::collections::HashMap<String, Arc<AtomicBool>>>, id: &str) -> Result<()> {
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        {
            let active = active.lock().map_err(|_| "Download controls are unavailable.")?;
            let db = catalog::open(database)?;
            let resumable: bool = db.query_row("SELECT state IN ('paused','failed','interrupted') AND source IS NOT NULL FROM download_jobs WHERE id=?1", [id], |row| row.get(0)).unwrap_or(false);
            if !resumable { return Err("This download cannot be resumed from its current state.".into()); }
            if !active.contains_key(id) {
                crate::storage::download_ready(&db)?;
                let changed = db.execute("UPDATE download_jobs SET state='queued',error='' WHERE id=?1 AND source IS NOT NULL AND state IN ('paused','failed','interrupted')", [id]).map_err(|_| "The download could not be resumed.")?;
                return if changed == 1 { Ok(()) } else { Err("This download cannot be resumed from its current state.".into()) };
            }
        }
        if Instant::now() >= deadline { return Err("The previous worker did not stop within 30 seconds. Restart SavedDesk; completed files are preserved.".into()); }
        std::thread::sleep(Duration::from_millis(25));
    }
}
#[tauri::command]
pub async fn resume_download(id: String, app: tauri::AppHandle, state: State<'_, Arc<AppState>>) -> Result<()> {
    let state = state.inner().clone();
    let waiting = state.clone();
    tauri::async_runtime::spawn_blocking(move || queue_resume(&waiting.database, &waiting.active, &id))
        .await.map_err(|_| "Download resume failed.".to_string())??;
    schedule(app, state);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn resume_fixture() -> (PathBuf, PathBuf) {
        let folder = std::env::temp_dir().join(format!("saveddesk-resume-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&folder).unwrap();
        let database = folder.join("catalog.db");
        catalog::initialize(&database, folder.to_str().unwrap()).unwrap();
        catalog::open(&database).unwrap().execute("INSERT INTO download_jobs(id,title,mode,state,destination,created_at,source) VALUES('resume','Resume','new_only','paused',?1,'2026-10-08','instagram')", [folder.to_str().unwrap()]).unwrap();
        (folder,database)
    }
    #[test]
    fn one_resume_waits_for_stopped_generation_and_only_queues_once() {
        let (folder,database) = resume_fixture();
        let active = Arc::new(std::sync::Mutex::new(std::collections::HashMap::from([("resume".to_owned(), Arc::new(AtomicBool::new(true)))])));
        let retiring = active.clone();
        let thread = std::thread::spawn(move || { std::thread::sleep(Duration::from_millis(150)); retiring.lock().unwrap().remove("resume"); });
        assert!(queue_resume(&database,&active,"resume").is_ok());
        thread.join().unwrap();
        assert!(queue_resume(&database,&active,"resume").is_err());
        assert_eq!(catalog::open(&database).unwrap().query_row("SELECT state FROM download_jobs WHERE id='resume'", [], |r| r.get::<_,String>(0)).unwrap(), "queued");
        std::fs::remove_dir_all(folder).unwrap();
    }
    #[test]
    fn resume_does_not_resurrect_job_cancelled_during_shutdown() {
        let (folder,database) = resume_fixture();
        let active = std::sync::Mutex::new(std::collections::HashMap::from([("resume".to_owned(), Arc::new(AtomicBool::new(true)))]));
        let cancelling = database.clone();
        let thread = std::thread::spawn(move || { std::thread::sleep(Duration::from_millis(100)); catalog::open(&cancelling).unwrap().execute("UPDATE download_jobs SET state='cancelled' WHERE id='resume'", []).unwrap(); });
        assert!(queue_resume(&database,&active,"resume").is_err()); thread.join().unwrap();
        assert_eq!(catalog::open(&database).unwrap().query_row("SELECT state FROM download_jobs WHERE id='resume'", [], |r| r.get::<_,String>(0)).unwrap(), "cancelled");
        std::fs::remove_dir_all(folder).unwrap();
    }
    #[test]
    fn resume_refuses_live_generation_or_deleted_job() {
        let (folder,database) = resume_fixture();
        let active = std::sync::Mutex::new(std::collections::HashMap::from([("resume".to_owned(), Arc::new(AtomicBool::new(false)))]));
        catalog::open(&database).unwrap().execute("UPDATE download_jobs SET state='running' WHERE id='resume'", []).unwrap();
        assert!(queue_resume(&database,&active,"resume").is_err());
        catalog::open(&database).unwrap().execute("DELETE FROM download_jobs WHERE id='resume'", []).unwrap();
        assert!(queue_resume(&database,&active,"resume").is_err());
        std::fs::remove_dir_all(folder).unwrap();
    }
    #[test]
    fn reels_alias_normalizes_to_the_same_post() {
        assert_eq!(canonical("instagram", "https://www.instagram.com/reels/Dd6qbtPRCnt/?igsh=tracking", "mine").unwrap(), "https://www.instagram.com/reel/Dd6qbtPRCnt/");
        assert!(canonical("instagram", "https://instagram.com.evil.test/reels/Dd6qbtPRCnt/", "mine").is_err());
        assert!(canonical("instagram", "https://www.instagram.com/reels/", "mine").is_err());
    }
    #[test]
    fn targets_reject_foreign_accounts_and_hosts() {
        assert!(canonical(
            "instagram",
            "https://www.instagram.com/someoneelse/saved/",
            "mine"
        )
        .is_err());
        assert!(canonical(
            "instagram",
            "https://instagram.com.evil.test/mine/saved/",
            "mine"
        )
        .is_err());
        assert!(canonical("x", "https://x.com@evil.test/i/bookmarks", "mine").is_err());
        assert_eq!(
            canonical(
                "x",
                "https://twitter.com/mine/status/123?tracking=1",
                "mine"
            )
            .unwrap(),
            "https://x.com/mine/status/123"
        );
        assert_eq!(
            canonical("instagram", "", "mine").unwrap(),
            "https://www.instagram.com/mine/saved/"
        );
    }
}
