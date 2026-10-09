//! Explicitly selected user-installed tools, separate from shipped application dependencies.
use crate::{catalog::Result, AppState};
use serde::{Deserialize, Serialize};
use std::{path::{Path,PathBuf}, sync::Arc};
use tauri::State;

#[derive(Clone,Default,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Config {
    #[serde(default)] pub gallery_python:String,
    #[serde(default)] pub ffmpeg:String,
}
pub fn load(data:&Path)->Result<Config> {
    let path=data.join("external-tools.json");
    if !path.exists(){return Ok(Config::default());}
    if std::fs::metadata(&path).map_err(|_|"Tool settings unavailable.")?.len()>8192{return Err("Tool settings are invalid.".into());}
    serde_json::from_slice(&std::fs::read(path).map_err(|_|"Tool settings unavailable.")?).map_err(|_|"Tool settings are invalid.".into())
}
fn selected(value:&str)->Result<String> {
    if value.is_empty(){return Ok(String::new());}
    let path=Path::new(value);
    if value.len()>32767 || !path.is_absolute() || !path.is_file() || path.extension().is_none_or(|v|!v.eq_ignore_ascii_case("exe")) {
        return Err("Select an existing executable using Choose file.".into());
    }
    Ok(path.to_string_lossy().into_owned())
}
#[tauri::command]
pub fn get_external_tools(state:State<'_,Arc<AppState>>)->Result<Config> {
    load(state.database.parent().ok_or("App data unavailable.")?)
}
#[tauri::command]
pub async fn save_external_tools(config:Config,state:State<'_,Arc<AppState>>)->Result<Config> {
    let state=state.inner().clone();
    tauri::async_runtime::spawn_blocking(move||{
        let _gate=state.worker_gate.try_lock().map_err(|_|"Finish the current download, connection or preview before changing tools.")?;
        let db=crate::catalog::open(&state.database)?;
        let busy:bool=db.query_row("SELECT EXISTS(SELECT 1 FROM download_jobs WHERE state IN ('queued','running'))",[],|r|r.get(0)).map_err(|_|"Queue unavailable.")?;
        if busy{return Err("Finish or pause downloads before changing tools.".into());}
        let value=Config{gallery_python:selected(&config.gallery_python)?,ffmpeg:selected(&config.ffmpeg)?};
        let data=state.database.parent().ok_or("App data unavailable.")?;
        let path=data.join("external-tools.json");
        let bytes=serde_json::to_vec(&value).map_err(|_|"Tool settings could not be saved.")?;
        std::fs::write(path,bytes).map_err(|_|"Tool settings could not be saved.")?;
        Ok(value)
    }).await.map_err(|_|"Tool settings could not be saved.".to_string())?
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
 #[test] fn missing_config_keeps_tools_unconfigured() {let d=tempfile::tempdir().unwrap();let c=load(d.path()).unwrap();assert!(c.gallery_python.is_empty()&&c.ffmpeg.is_empty());assert!(!d.path().join("external-tools.json").exists());}
 #[test] fn selected_executable_must_be_real_and_absolute() {assert!(selected("python.exe").is_err());let d=tempfile::tempdir().unwrap();let p=d.path().join("python.exe");std::fs::write(&p,b"fixture").unwrap();assert!(selected(p.to_str().unwrap()).is_ok());assert!(selected("").is_ok());}
}
