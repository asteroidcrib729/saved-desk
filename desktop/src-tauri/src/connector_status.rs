//! The unpackaged native host never opens the private catalog or DPAPI files.
use std::{path::Path, time::Duration};
use serde_json::{json, Value};
pub fn status(database: &Path, source: &str, browser: &str) -> Result<Value,String> {
    use rusqlite::OptionalExtension;
    if !["instagram","x","youtube","facebook","tiktok","pinterest"].contains(&source) || !["chrome","edge","firefox","brave","vivaldi","chromium"].contains(&browser) {return Err("Choose a supported platform and browser.".into());}
    let db=rusqlite::Connection::open_with_flags(database,rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|_|"Account status is unavailable. Open SavedDesk.")?;
    db.busy_timeout(Duration::from_millis(250)).map_err(|_|"Account status is unavailable.")?;
    let row=db.query_row("SELECT state,username,message FROM accounts WHERE source=?1 AND browser=?2",[source,browser],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?))).optional().map_err(|_|"Account status could not be checked.")?;
    let (state,username,message)=row.ok_or("Start this platform's connection in SavedDesk first.")?;
    Ok(json!({"ok":true,"state":state,"username":username,"message":message.chars().take(2000).collect::<String>()}))
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
