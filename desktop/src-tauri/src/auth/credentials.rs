//! Tokens and subject stay inside a versioned current-user DPAPI envelope.
use crate::{catalog::Result, platform};
use serde::{Deserialize, Serialize};
use std::{io::Write, path::Path};
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Envelope {
    pub version: u8,
    pub client_id: String,
    #[serde(default)]
    pub desktop_secret: Option<String>,
    pub grant: Option<Grant>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Grant {
    pub issuer: String,
    pub subject: String,
    pub name: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub scopes: Vec<String>,
    pub expires_at: i64,
    pub generation: String,
}
pub fn load(path: &Path) -> Result<Envelope> {
    if !path.exists() {
        return Ok(Envelope {
            version: 1,
            ..Default::default()
        });
    }
    if std::fs::metadata(path)
        .map_err(|_| "Account storage could not be read.")?
        .len()
        > platform::MAX_PRIVATE as u64
    {
        return Err("Account storage is invalid.".into());
    }
    let encrypted = std::fs::read(path).map_err(|_| "Account storage could not be read.")?;
    let value:Envelope=serde_json::from_slice(&platform::crypt(&encrypted,false).map_err(|_|"The protected Google account storage could not be unlocked. Reset Google identity setup and import its Desktop configuration again.")?).map_err(|_|"Account storage is invalid. Remove the local OAuth connection and configure it again.")?;
    if value.version != 1 {
        return Err("This account storage version is unsupported.".into());
    }
    Ok(value)
}
pub fn save(path: &Path, value: &Envelope) -> Result<()> {
    let encrypted = platform::crypt(
        &serde_json::to_vec(value).map_err(|_| "Account storage is invalid.")?,
        true,
    )?;
    let temp = path.with_extension(format!("{}.pending", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(|_| "Account storage could not be created.")?;
        file.write_all(&encrypted)
            .and_then(|_| file.sync_all())
            .map_err(|_| "Account storage could not be saved.")?;
        drop(file);
        std::fs::rename(&temp, path)
            .map_err(|_| "Account storage could not be replaced.".to_string())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(temp);
    }
    result
}
