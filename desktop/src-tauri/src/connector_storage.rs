//! Only browser integration artifacts leave the MSIX private AppData view.
use std::path::{Path, PathBuf};
use tauri::Manager;
use tauri::State;
use serde_json::{json,Value};
use std::sync::Arc;
use crate::AppState;
pub fn directory(app: &tauri::AppHandle, private: &Path) -> Result<PathBuf, String> {
    if crate::connector_payload::packaged() {
        Ok(app.path().document_dir().map_err(|_| "Your Documents folder is unavailable.")?.join("SavedDesk Browser Connector"))
    } else { Ok(private.to_path_buf()) }
}
pub fn prepare(path: &Path) -> Result<(), String> {
    if !path.exists() { std::fs::create_dir(path).map_err(|_| "The browser connector folder could not be created. Check Documents permissions.")?; }
    let meta=std::fs::symlink_metadata(path).map_err(|_| "The browser connector folder is unavailable.")?;
    #[cfg(windows)] { use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 { return Err("Linked connector folders are not supported.".into()); }
    }
    if !meta.is_dir() || meta.file_type().is_symlink() { return Err("The browser connector folder is unsafe.".into()); }
    Ok(())
}
pub fn export_cleanup(root: &Path, resources: &Path) -> Result<(), String> {
    let bytes=std::fs::read(resources.join("maintenance/unregister-connector.ps1")).map_err(|_| "The connector cleanup tool is missing. Repair SavedDesk.")?;
    let target=root.join("Remove-SavedDesk-Connector.ps1");
    if target.exists() {
        let meta=std::fs::symlink_metadata(&target).map_err(|_| "The cleanup tool could not be checked.")?;
        #[cfg(windows)] { use std::os::windows::fs::MetadataExt;
            if meta.file_attributes() & 0x400 != 0 { return Err("Linked cleanup tools are not supported.".into()); }
        }
        if !meta.is_file() || meta.file_type().is_symlink() { return Err("The cleanup tool path is unsafe.".into()); }
    }
    std::fs::write(target,bytes).map_err(|_| "The connector cleanup tool could not be saved.".into())
}
#[tauri::command]
pub fn get_connector_maintenance(app:tauri::AppHandle,state:State<'_,Arc<AppState>>)->Result<Value,String> {
    let root=directory(&app,state.database.parent().ok_or("App data unavailable.")?)?;
    Ok(json!({"directory":crate::platform::shell_path(&root),"packaged":crate::connector_payload::packaged(),"cleanupTool":"Remove-SavedDesk-Connector.ps1"}))
}
#[tauri::command]
pub async fn open_connector_folder(app:tauri::AppHandle,state:State<'_,Arc<AppState>>)->Result<(),String> {
    use tauri_plugin_opener::OpenerExt;
    let root=directory(&app,state.database.parent().ok_or("App data unavailable.")?)?;
    if !root.is_dir() {return Err("Prepare the browser connector first.".into());}
    app.opener().open_path(crate::platform::shell_path(&root),None::<&str>).map_err(|_|"The connector folder could not be opened.".into())
}
#[tauri::command]
pub async fn remove_browser_connector(state:State<'_,Arc<AppState>>)->Result<Value,String> {
    let state=state.inner().clone();
    tauri::async_runtime::spawn_blocking(move|| {
        let pending=state.connection.lock().map_err(|_|"Connection state unavailable.")?;
        if pending.is_some() {return Err("Complete or cancel your account connection before removing browser pairing.".into());}
        let private=state.database.parent().ok_or("App data unavailable.")?;
        state.connector.remove(private)?;
        Ok(json!({"message":"Browser pairing removed. Remove the browser extension and exported files separately. Legacy native-host registrations from older releases are unused; their optional cleanup tool can be run explicitly outside SavedDesk. Your library and saved accounts are unchanged."}))
    }).await.map_err(|_|"Browser pairing removal did not finish.".to_string())?
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn a_file_cannot_become_a_connector_directory() {
        let temp=tempfile::tempdir().unwrap();let path=temp.path().join("connector");
        std::fs::write(&path,b"keep").unwrap();assert!(prepare(&path).is_err());assert_eq!(std::fs::read(path).unwrap(),b"keep");
    }
}
