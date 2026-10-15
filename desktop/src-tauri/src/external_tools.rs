//! Separate user-acquired gallery tools and reviewed bundled media executables.
use crate::{catalog::Result, worker_host, AppState};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{path::{Path,PathBuf}, sync::Arc, time::{Duration,Instant}};
use tauri::{Emitter,Manager,State};

#[derive(Clone,Default,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Config {
    #[serde(default)] pub gallery_python:String,
    #[serde(default)] pub ffmpeg:String,
}
pub fn load(data:&Path)->Result<Config> {
    let path=data.join("external-tools.json");
    if !path.exists(){return Ok(Config::default());}
    let meta=std::fs::symlink_metadata(&path).map_err(|_|"Tool settings unavailable.")?;
    if meta.file_type().is_symlink() || meta.len()>8192{return Err("Tool settings are invalid.".into());}
    serde_json::from_slice(&std::fs::read(path).map_err(|_|"Tool settings unavailable.")?).map_err(|_|"Tool settings are invalid.".into())
}
pub(crate) fn effective<R:tauri::Runtime>(app:&tauri::AppHandle<R>,data:&Path)->Result<Config> {
    let mut config=load(data)?;
    if config.ffmpeg.is_empty() {
        let bundled=app.path().resource_dir().map_err(|_|"App resources unavailable.")?.join("media-tools/ffmpeg.exe");
        if bundled.is_file(){config.ffmpeg=bundled.to_string_lossy().into_owned();}
    }
    Ok(config)
}
fn selected(value:&str)->Result<String> {
    if value.is_empty(){return Ok(String::new());}
    let path=Path::new(value);
    if value.len()>32767 || !path.is_absolute() || !path.is_file() || path.extension().is_none_or(|v|!v.eq_ignore_ascii_case("exe")) {
        return Err("Select an existing executable using Choose file.".into());
    }
    Ok(path.to_string_lossy().into_owned())
}
fn write(data:&Path,value:&Config)->Result<()> {
    let path=data.join("external-tools.json");
    let temporary=data.join(format!("external-tools-{}.pending",uuid::Uuid::new_v4()));
    let result=(||{
        use std::io::Write;
        let mut output=std::fs::OpenOptions::new().write(true).create_new(true).open(&temporary).map_err(|_|"Tool settings could not be created.")?;
        output.write_all(&serde_json::to_vec(value).map_err(|_|"Invalid tool settings.")?).and_then(|_|output.sync_all()).map_err(|_|"Tool settings could not be saved.")?;
        drop(output);
        std::fs::rename(&temporary,&path).map_err(|_|"Tool settings could not be finalized.".into())
    })();
    if result.is_err(){let _=std::fs::remove_file(&temporary);}
    result
}
fn idle(state:&AppState)->Result<()> {
    let db=crate::catalog::open(&state.database)?;
    let busy:bool=db.query_row("SELECT EXISTS(SELECT 1 FROM download_jobs WHERE state IN ('queued','running'))",[],|r|r.get(0)).map_err(|_|"Queue unavailable.")?;
    if busy || state.connection.lock().map_err(|_|"Connection unavailable.")?.is_some(){return Err("Finish or pause downloads and cancel any pending browser connection before changing tools.".into());}
    Ok(())
}
pub(crate) fn gallery_required(source:&str,target:&str)->bool {
    ["instagram","x","pinterest"].contains(&source) || source=="tiktok" && target.contains("/photo/")
}
pub(crate) fn require(app:&tauri::AppHandle,data:&Path,source:&str,target:&str,video:bool)->Result<()> {
    let config=effective(app,data)?;
    if gallery_required(source,target) && (config.gallery_python.is_empty() || !Path::new(&config.gallery_python).is_file()){
        return Err("Gallery downloads need setup. Open Settings > Download tools and select Set up gallery downloads. No download has been started.".into());
    }
    let attachment_image=source=="discord" && target.split('?').next().is_some_and(|p|[".png",".jpg",".jpeg",".webp",".gif",".avif"].iter().any(|e|p.to_ascii_lowercase().ends_with(e)));
    if video && !attachment_image && (config.ffmpeg.is_empty() || !Path::new(&config.ffmpeg).is_file()){
        return Err("The bundled video tools are unavailable. Repair the SavedDesk installation or select FFmpeg under Settings > Download tools. No download has been started.".into());
    }
    Ok(())
}
pub(crate) fn probe(app:&tauri::AppHandle)->Result<Value> {
    let mut session=worker_host::Session::start(app)?;
    session.send(json!({"protocol_version":1,"command":"probe_capabilities"}))?;
    let event=session.next(Duration::from_secs(35))?.ok_or("Download tools check timed out.")?;
    if event["event"]!="capabilities"{return Err("Download tools check failed.".into());}
    session.finish()?;
    Ok(event["data"].clone())
}
#[tauri::command]
pub fn get_external_tools(app:tauri::AppHandle,state:State<'_,Arc<AppState>>)->Result<Config> {
    effective(&app,state.database.parent().ok_or("App data unavailable.")?)
}
#[tauri::command]
pub async fn get_download_tools_status(app:tauri::AppHandle,state:State<'_,Arc<AppState>>)->Result<Value> {
    let state=state.inner().clone();
    tauri::async_runtime::spawn_blocking(move||{
        let _gate=state.worker_gate.try_lock().map_err(|_|"Finish the current download or preview before checking tools.")?;
        let result=probe(&app)?;
        let config=effective(&app,state.database.parent().ok_or("App data unavailable.")?)?;
        Ok(json!({"galleryReady":result["gallery"],"ffmpegReady":result["ffmpeg"],"ffprobeReady":result["ffprobe"],"galleryPython":config.gallery_python,"ffmpeg":config.ffmpeg}))
    }).await.map_err(|_|"Download tools check failed.".to_string())?
}
#[tauri::command]
pub async fn save_external_tools(config:Config,app:tauri::AppHandle,state:State<'_,Arc<AppState>>)->Result<Config> {
    let state=state.inner().clone();
    tauri::async_runtime::spawn_blocking(move||{
        let _gate=state.worker_gate.try_lock().map_err(|_|"Finish the current download, connection or preview before changing tools.")?;
        idle(&state)?;
        let bundled=app.path().resource_dir().map_err(|_|"App resources unavailable.")?.join("media-tools/ffmpeg.exe");
        let ffmpeg=if Path::new(&config.ffmpeg)==bundled {String::new()}else{selected(&config.ffmpeg)?};
        let value=Config{gallery_python:selected(&config.gallery_python)?,ffmpeg};
        write(state.database.parent().ok_or("App data unavailable.")?,&value)?;
        Ok(value)
    }).await.map_err(|_|"Tool settings could not be saved.".to_string())?
}
#[tauri::command]
pub async fn install_gallery_tools(consent:bool,app:tauri::AppHandle,state:State<'_,Arc<AppState>>)->Result<Config> {
    if !consent{return Err("Approve the separate download tools installation first.".into());}
    let state=state.inner().clone();
    tauri::async_runtime::spawn_blocking(move||{
        let _gate=state.worker_gate.try_lock().map_err(|_|"Finish the current download or preview before setting up tools.")?;
        idle(&state)?;
        let data=state.database.parent().ok_or("App data unavailable.")?;
        let mut session=worker_host::Session::start(&app)?;
        session.send(json!({"protocol_version":1,"command":"install_gallery_tools","consent":true,"destination":data}))?;
        let deadline=Instant::now()+Duration::from_secs(900);
        loop {
            if Instant::now()>deadline{return Err("Gallery setup timed out. Existing settings were preserved.".into());}
            let event=session.next(Duration::from_secs(45))?.ok_or("Gallery setup stopped responding. Check your connection and try again.")?;
            match event["event"].as_str().unwrap_or("") {
                "tools_progress"=>{let _=app.emit("download-tools-progress",&event["data"]);},
                "tools_installed"=>{
                    let path=event["data"]["python"].as_str().ok_or("Gallery setup returned an invalid path.")?;
                    let expected=data.join("tools").canonicalize().map_err(|_|"Gallery tools unavailable.")?;
                    let installed=Path::new(path).canonicalize().map_err(|_|"Gallery tools unavailable.")?;
                    if !installed.starts_with(expected) || installed.file_name().is_none_or(|n|n!="python.exe"){return Err("Gallery setup returned an unexpected installation path.".into());}
                    session.finish()?;
                    let mut config=load(data)?;config.gallery_python=selected(path)?;
                    write(data,&config)?;
                    return effective(&app,data);
                },
                "failed"=>return Err(event["data"]["message"].as_str().unwrap_or("Gallery setup failed. Existing settings were preserved.").into()),
                _=>return Err("Gallery setup returned an unexpected response.".into())
            }
        }
    }).await.map_err(|_|"Gallery setup failed. Existing settings were preserved.".to_string())?
}
#[tauri::command]
pub async fn choose_external_tool(app:tauri::AppHandle)->Result<Option<String>> {
    use tauri_plugin_dialog::DialogExt;
    tauri::async_runtime::spawn_blocking(move||{
        Ok(app.dialog().file().add_filter("Executable",&["exe"]).blocking_pick_file().and_then(|f|f.into_path().ok()).map(|p:PathBuf|p.to_string_lossy().into_owned()))
    }).await.map_err(|_|"A tool could not be selected.".to_string())?
}
#[cfg(test)]
mod tests {
 use super::*;
 #[test] fn missing_config_keeps_tools_unconfigured(){let d=tempfile::tempdir().unwrap();let c=load(d.path()).unwrap();assert!(c.gallery_python.is_empty()&&c.ffmpeg.is_empty());}
 #[test] fn selected_executable_must_be_real_and_absolute(){assert!(selected("python.exe").is_err());let d=tempfile::tempdir().unwrap();let p=d.path().join("python.exe");std::fs::write(&p,b"fixture").unwrap();assert!(selected(p.to_str().unwrap()).is_ok());}
 #[test] fn gallery_requirements_cover_all_external_routes(){for s in ["instagram","x","pinterest"]{assert!(gallery_required(s,"https://example.com"));}assert!(gallery_required("tiktok","https://www.tiktok.com/@x/photo/1"));for s in ["youtube","facebook","discord"]{assert!(!gallery_required(s,"https://example.com"));}}
 #[test] fn tool_configuration_is_atomically_replaced(){let d=tempfile::tempdir().unwrap();write(d.path(),&Config{gallery_python:"one".into(),ffmpeg:String::new()}).unwrap();write(d.path(),&Config{gallery_python:"two".into(),ffmpeg:String::new()}).unwrap();assert_eq!(load(d.path()).unwrap().gallery_python,"two");assert_eq!(std::fs::read_dir(d.path()).unwrap().count(),1);}
}
