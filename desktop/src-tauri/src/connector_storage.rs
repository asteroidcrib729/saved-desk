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
pub async fn remove_browser_connector(app:tauri::AppHandle,state:State<'_,Arc<AppState>>)->Result<Value,String> {
    let state=state.inner().clone();
    tauri::async_runtime::spawn_blocking(move|| {
        if state.connection.lock().map_err(|_|"Connection state unavailable.")?.is_some() {return Err("Complete or cancel your browser connection before removing its connector.".into());}
        let root=directory(&app,state.database.parent().ok_or("App data unavailable.")?)?;
        if !root.exists() {return Ok(json!({"message":"No shared browser connector files were found. Your library is unchanged."}));}
        prepare(&root)?;
        let resources=app.path().resource_dir().map_err(|_|"App resources unavailable.")?;
        let host=crate::connector_payload::expected_host(&root,&resources.join("saveddesk-native-host.exe"))?;
        let mut command=std::process::Command::new("powershell.exe");
        command.args(["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File"]).arg(crate::platform::shell_path(&resources.join("maintenance/unregister-connector.ps1")))
            .arg("-ConnectorDirectory").arg(crate::platform::shell_path(&root)).arg("-InstallDirectory").arg(crate::platform::shell_path(host.parent().ok_or("Connector host unavailable.")?)).arg("-Remove");
        #[cfg(windows)] {use std::os::windows::process::CommandExt;command.creation_flags(0x08000000);}
        #[cfg(debug_assertions)]
        if let Some(scope)=crate::platform::connector_test_scope()? {
            command.arg("-TestMode").arg("-RegistryBase").arg(format!(r"HKCU:\Software\SavedDesk\CertificationTests\{scope}"));
        }
        let output=command.output().map_err(|_|"The connector cleanup tool could not start.")?;
        if !output.status.success() {return Err("Connector cleanup could not finish. Close its browser popup and try again. Your library was not removed.".into());}
        let value:Value=serde_json::from_str(String::from_utf8_lossy(&output.stdout).trim_start_matches('\u{feff}').trim()).map_err(|_|"The connector cleanup result could not be checked.")?;
        let changed=value["preservedChangedArtifacts"].as_array().map_or(0,Vec::len);
        Ok(json!({"message":if changed==0 {"The owned browser connector registrations and files were removed. Remove its browser extension separately. Your library and saved accounts are unchanged."} else {"Connector cleanup preserved changed files for your review. Open its folder to check them. Your library and saved accounts are unchanged."}}))
    }).await.map_err(|_|"Connector cleanup did not finish.".to_string())?
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn a_file_cannot_become_a_connector_directory() {
        let temp=tempfile::tempdir().unwrap();let path=temp.path().join("connector");
        std::fs::write(&path,b"keep").unwrap();assert!(prepare(&path).is_err());assert_eq!(std::fs::read(path).unwrap(),b"keep");
    }
}
