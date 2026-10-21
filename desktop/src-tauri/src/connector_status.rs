//! The unpackaged native host never opens the private catalog or DPAPI files.
use std::{path::Path, sync::Arc, time::Duration};
use serde_json::{json, Value};
use crate::{AppState, platform};
use tauri::Manager;
pub fn status(database: &Path, source: &str, browser: &str) -> Result<Value,String> {
    use rusqlite::OptionalExtension;
    if !["instagram","x","youtube","facebook","tiktok","pinterest"].contains(&source) || !["chrome","edge","firefox","brave","vivaldi","chromium"].contains(&browser) {return Err("Choose a supported platform and browser.".into());}
    let db=rusqlite::Connection::open_with_flags(database,rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|_|"Account status is unavailable. Open SavedDesk.")?;
    db.busy_timeout(Duration::from_millis(250)).map_err(|_|"Account status is unavailable.")?;
    let row=db.query_row("SELECT state,username,message FROM accounts WHERE source=?1 AND browser=?2",[source,browser],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?))).optional().map_err(|_|"Account status could not be checked.")?;
    let (state,username,message)=row.ok_or("Start this platform's connection in SavedDesk first.")?;
    Ok(json!({"ok":true,"state":state,"username":username,"message":message.chars().take(2000).collect::<String>()}))
}
#[cfg(windows)]
pub fn start(app:tauri::AppHandle,state:Arc<AppState>)->Result<(),String> {
    let name=format!("{}-Status",platform::pipe_name()?);
    let mut server=platform::server_at(&name)?;
    std::thread::spawn(move || loop {
        if !platform::accept(&server) {std::thread::sleep(Duration::from_millis(25));continue;}
        let response=platform::read_timed(&mut server,Duration::from_secs(3)).and_then(|request| {
            if request["protocol_version"]!=1 {return Err("Unsupported connector protocol.".into());}
            let browser=request["browser"].as_str().unwrap_or("");
            match request["command"].as_str() {
                Some("connection_status")=>status(&state.database,request["source"].as_str().unwrap_or(""),browser),
                Some("connector_probe")=>{
                    if !["chrome","edge","firefox","brave","vivaldi","chromium"].contains(&browser) {return Err("Choose a supported browser.".into());}
                    let private=state.database.parent().ok_or("App data unavailable.")?;
                    let root=crate::connector_storage::directory(&app,private)?;
                    let resources=app.path().resource_dir().map_err(|_|"App resources unavailable.")?;
                    let host=crate::connector_payload::expected_host(&root,&resources.join("saveddesk-native-host.exe"))?;
                    if !platform::connector_registered(browser,&root.join(format!("connector-{browser}.json")),&host) {return Err("Prepare the connector for this browser in SavedDesk first.".into());}
                    crate::connector_presence::record(private,browser,request["extension_version"].as_str().unwrap_or(""),&host)?;
                    Ok(json!({"ok":true,"ready":true,"message":"Browser extension connected. Return to SavedDesk and choose a platform."}))
                }
                _=>Err("Unsupported connector status request.".into()),
            }
        });
        let value=response.unwrap_or_else(|message|json!({"ok":false,"message":message}));
        let _=platform::write_frame(&mut server,&value);let _=platform::read_timed(&mut server,Duration::from_secs(2));
        drop(server);match platform::server_at(&name) {Ok(next)=>server=next,Err(_)=>break}
    });Ok(())
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn status_is_scoped_read_only_and_never_creates_a_catalog() {
        let temp=tempfile::tempdir().unwrap();let path=temp.path().join("catalog.db");
        assert!(status(&path,"x","chrome").is_err());assert!(!path.exists());
        let db=rusqlite::Connection::open(&path).unwrap();
        db.execute_batch("CREATE TABLE accounts(source TEXT,browser TEXT,state TEXT,username TEXT,message TEXT); CREATE TABLE private_test(value TEXT); INSERT INTO private_test VALUES('synthetic-secret'); INSERT INTO accounts VALUES('instagram','chrome','sign_in_needed','','HTTP 400');").unwrap();drop(db);
        let before=std::fs::read(&path).unwrap();let value=status(&path,"instagram","chrome").unwrap();
        assert_eq!(value["state"],"sign_in_needed");assert!(!value.to_string().contains("synthetic-secret"));
        assert!(status(&path,"instagram","edge").is_err());assert!(status(&path,"invalid","chrome").is_err());assert_eq!(std::fs::read(path).unwrap(),before);
    }
}
