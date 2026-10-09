// Desktop and connector binaries must not create a console in any Windows build.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
#[path = "../platform.rs"]
#[allow(dead_code)]
mod platform;

fn connection_status(
    database: &std::path::Path,
    source: &str,
    browser: &str,
) -> Result<serde_json::Value, String> {
    use rusqlite::OptionalExtension;
    if !["instagram", "x", "youtube", "facebook", "tiktok", "pinterest"].contains(&source)
        || !["chrome", "edge", "firefox", "brave", "vivaldi", "chromium"].contains(&browser)
    {
        return Err("Choose a supported platform and browser.".into());
    }
    // Read status only: no session cache, decryption, cookie values or SQL writes.
    let db =
        rusqlite::Connection::open_with_flags(database, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|_| "The verification result is unavailable. Check Accounts in SavedDesk.")?;
    db.busy_timeout(std::time::Duration::from_millis(250))
        .map_err(|_| "Account status is unavailable.")?;
    let result = db
        .query_row(
            "SELECT state,username,message FROM accounts WHERE source=?1 AND browser=?2",
            [source, browser],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .optional()
        .map_err(|_| "The verification result is unavailable. Check Accounts in SavedDesk.")?;
    let (state, username, message) =
        result.ok_or("No matching account request was found. Start Connect in SavedDesk.")?;
    Ok(
        serde_json::json!({"ok":true,"state":state,"username":username,"message":message.chars().take(2000).collect::<String>()}),
    )
}

fn status_database() -> Result<std::path::PathBuf, String> {
    #[cfg(debug_assertions)]
    if let Some(data) = std::env::var_os("SAVEDDESK_TEST_DATA_DIR") {
        return Ok(std::path::PathBuf::from(data).join("prototype-catalog.db"));
    }
    let local =
        std::env::var_os("LOCALAPPDATA").ok_or("The account status folder is unavailable.")?;
    Ok(std::path::PathBuf::from(local)
        .join("com.saveddesk.desktop")
        .join("prototype-catalog.db"))
}

fn main() {
    // No logs, credential command line, session-file handoff, or localhost web server.
    let allowed = std::env::args()
        .skip(1)
        .any(|argument| argument == platform::CHROMIUM_ORIGIN || argument == platform::FIREFOX_ID);
    if !allowed {
        return;
    }
    let result = (|| -> Result<serde_json::Value, String> {
        let request = platform::read_frame(&mut std::io::stdin())?;
        if request["protocol_version"] != 1
            || !["request", "authorize", "connection_status"]
                .contains(&request["command"].as_str().unwrap_or(""))
        {
            return Err("Unsupported connector request.".into());
        }
        if request["command"] == "connection_status" {
            return connection_status(
                &status_database()?,
                request["source"].as_str().unwrap_or(""),
                request["browser"].as_str().unwrap_or(""),
            );
        }
        let mut pipe = platform::connect()?;
        platform::write_frame(&mut pipe, &request)?;
        let response = platform::read_frame(&mut pipe)?;
        // Confirm receipt so the server can close without discarding buffered bytes.
        platform::write_frame(&mut pipe, &serde_json::json!({"received":true}))?;
        Ok(response)
    })();
    let response =
        result.unwrap_or_else(|message| serde_json::json!({"ok":false,"message":message}));
    let _ = platform::write_frame(&mut std::io::stdout(), &response);
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn status_is_read_only_scoped_metadata_without_session_data() {
        let data = tempfile::tempdir().unwrap();
        let path = data.path().join("catalog.db");
        let db = rusqlite::Connection::open(&path).unwrap();
        db.execute_batch("CREATE TABLE accounts(source TEXT,browser TEXT,state TEXT,username TEXT,message TEXT); CREATE TABLE private_test(value TEXT); INSERT INTO private_test VALUES('synthetic-secret'); INSERT INTO accounts VALUES('instagram','chrome','sign_in_needed','','Instagram rejected account verification (HTTP 400).');").unwrap();
        drop(db);
        let before = std::fs::read(&path).unwrap();
        let result = connection_status(&path, "instagram", "chrome").unwrap();
        assert_eq!(result["state"], "sign_in_needed");
        assert!(result["message"].as_str().unwrap().contains("HTTP 400"));
        assert!(!result.to_string().contains("synthetic-secret"));
        assert!(connection_status(&path, "instagram", "edge").is_err());
        assert!(connection_status(&path, "facebook", "chrome").is_err());
        assert_eq!(std::fs::read(&path).unwrap(), before);
    }
    #[test]
    fn missing_status_catalog_is_not_created() {
        let data = tempfile::tempdir().unwrap();
        let path = data.path().join("missing.db");
        assert!(connection_status(&path, "x", "chrome").is_err());
        assert!(!path.exists());
    }
}
