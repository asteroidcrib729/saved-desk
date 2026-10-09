//! Native-only account control plane, additive to existing browser-session downloads.
mod credentials;
mod http;
mod oauth;
mod providers;
#[cfg(test)]
mod tests;
use crate::{catalog::Result, AppState};
#[cfg(test)]
use credentials::Envelope;
use credentials::Grant;
use http::WindowsHttp;
use serde::Serialize;
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::State;
use tauri_plugin_opener::OpenerExt;

#[derive(Default)]
pub struct Controller {
    inner: Mutex<Inner>,
    refresh_gate: Mutex<()>,
}
#[derive(Default)]
struct Inner {
    epoch: u64,
    pending: Option<Arc<AtomicBool>>,
    message: String,
    revoking: bool,
}
impl Inner {
    fn invalidate(&mut self) {
        self.epoch += 1;
        if let Some(stop) = self.pending.take() {
            stop.store(true, Ordering::SeqCst);
        }
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleStatus {
    client_id: String,
    state: &'static str,
    display_name: Option<String>,
    account_key: Option<String>,
    expires_at: Option<i64>,
    granted_scopes: Vec<String>,
    message: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    providers: Vec<providers::Provider>,
    google: GoogleStatus,
}
fn path(state: &AppState) -> Result<PathBuf> {
    Ok(state
        .database
        .parent()
        .ok_or("Account storage is unavailable.")?
        .join("oauth-google.dpapi"))
}
impl Controller {
    fn status(&self, path: &std::path::Path) -> Result<Report> {
        let inner = self
            .inner
            .lock()
            .map_err(|_| "Account state is unavailable.")?;
        let envelope = credentials::load(path)?;
        let grant = envelope.grant.as_ref();
        let state = if inner.pending.is_some() {
            "waiting_for_browser"
        } else if inner.revoking {
            "revoking"
        } else if let Some(g) = grant {
            if g.expires_at <= chrono::Utc::now().timestamp() {
                "refresh_needed"
            } else {
                "identity_verified"
            }
        } else if envelope.client_id.is_empty() {
            "setup_required"
        } else {
            "not_connected"
        };
        Ok(Report {
            providers: providers::providers(),
            google: GoogleStatus {
                client_id: envelope.client_id.clone(),
                state,
                display_name: grant.map(|g| g.name.clone()),
                account_key: grant.map(|g| oauth::key(&envelope.client_id, g)),
                expires_at: grant.map(|g| g.expires_at),
                granted_scopes: grant.map(|g| g.scopes.clone()).unwrap_or_default(),
                message: inner.message.clone(),
            },
        })
    }
    fn reset(&self, path: &std::path::Path) -> Result<()> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "Account state is unavailable.")?;
        if inner.revoking {
            return Err("Wait for Google revocation to finish.".into());
        }
        if path.exists() {
            std::fs::remove_file(path)
                .map_err(|_| "The local Google configuration could not be removed.")?;
        }
        inner.invalidate();
        inner.message="Local Google identity setup was reset. Remote grants, browser connections and downloaded files were kept.".into();
        Ok(())
    }
    fn configure(&self, path: &std::path::Path, client: String) -> Result<()> {
        oauth::validate_client(&client)?;
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "Account state is unavailable.")?;
        if inner.revoking {
            return Err("Wait for Google revocation to finish.".into());
        }
        let mut envelope = credentials::load(path)?;
        if envelope.grant.is_some() && envelope.client_id != client {
            return Err("Disconnect the Google identity before changing its client ID.".into());
        }
        if envelope.client_id != client {
            envelope.desktop_secret = None;
        }
        envelope.client_id = client;
        credentials::save(path, &envelope)?;
        inner.invalidate();
        inner.message =
            "Desktop client configured. Google identity and media access are separate.".into();
        Ok(())
    }
    fn begin(&self, path: &std::path::Path) -> Result<oauth::Attempt> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "Account state is unavailable.")?;
        if inner.revoking {
            return Err("Wait for Google revocation to finish.".into());
        }
        let envelope = credentials::load(path)?;
        let stop = Arc::new(AtomicBool::new(false));
        let generation = inner.epoch + 1;
        let mut attempt = oauth::Attempt::new(envelope.client_id, generation, stop.clone())?;
        attempt.desktop_secret = envelope.desktop_secret;
        inner.invalidate();
        inner.pending = Some(stop);
        inner.message = "Complete Google sign-in in your browser within five minutes.".into();
        Ok(attempt)
    }
    fn complete(
        &self,
        path: &std::path::Path,
        attempt: &oauth::Attempt,
        result: Result<Grant>,
    ) -> Result<()> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "Account state is unavailable.")?;
        if inner.epoch != attempt.generation || attempt.stop.load(Ordering::SeqCst) {
            return Err("This sign-in attempt has ended.".into());
        }
        if attempt.created.elapsed() >= std::time::Duration::from_secs(300) {
            inner.invalidate();
            inner.message = "Sign-in timed out after five minutes. Try again.".into();
            return Err(inner.message.clone());
        }
        inner.pending = None;
        match result {
            Ok(grant) => {
                let mut envelope = credentials::load(path)?;
                if envelope.client_id != attempt.client {
                    return Err("The account client changed. Sign in again.".into());
                }
                envelope.grant = Some(grant);
                let result = credentials::save(path, &envelope);
                inner.message = if result.is_ok() {
                    "Google identity verified. Private YouTube downloading is not enabled by this connection.".into()
                } else {
                    "The verified identity could not be saved. Sign in again.".into()
                };
                result
            }
            Err(error) => {
                inner.message = error;
                Ok(())
            }
        }
    }
    fn cancel(&self) -> Result<()> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "Account state is unavailable.")?;
        if inner.pending.is_none() {
            inner.message = "No Google sign-in is pending. Any existing identity was kept.".into();
            return Ok(());
        }
        inner.invalidate();
        inner.message = "Sign-in cancelled. Any previous identity was kept.".into();
        Ok(())
    }
    fn check(&self, path: &std::path::Path, http: &dyn http::Http) -> Result<()> {
        // Only one refresh may run at a time. Disconnect does not wait for the network.
        let _single = self
            .refresh_gate
            .lock()
            .map_err(|_| "Account refresh is unavailable.")?;
        let (envelope, epoch) = {
            let inner = self
                .inner
                .lock()
                .map_err(|_| "Account state is unavailable.")?;
            if inner.pending.is_some() || inner.revoking {
                return Err("Finish or cancel the pending account operation first.".into());
            }
            (credentials::load(path)?, inner.epoch)
        };
        let old = envelope
            .grant
            .as_ref()
            .ok_or("Sign in with Google first.")?;
        let updated = if old.expires_at <= chrono::Utc::now().timestamp() + 60 {
            oauth::refresh(
                http,
                &envelope.client_id,
                envelope.desktop_secret.as_deref(),
                old,
            )
        } else {
            oauth::identity(http, &old.access_token).and_then(|(subject, name)| {
                if subject != old.subject {
                    return Err("The account identity changed. Sign in again.".into());
                }
                let mut g = old.clone();
                g.name = name;
                Ok(g)
            })
        };
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "Account state is unavailable.")?;
        if inner.epoch != epoch {
            return Err(
                "The account changed while it was being checked. No credentials were saved.".into(),
            );
        }
        match updated {
            Ok(grant) => {
                let mut updated = envelope;
                updated.grant = Some(grant);
                credentials::save(path, &updated)?;
                inner.message =
                    "Google identity checked. This grants no private-media capability.".into();
                Ok(())
            }
            Err(error) => {
                inner.message = error.clone();
                Err(error)
            }
        }
    }
    fn disconnect(
        &self,
        path: &std::path::Path,
        revoke: bool,
        http: &dyn http::Http,
    ) -> Result<()> {
        let old = {
            let mut inner = self
                .inner
                .lock()
                .map_err(|_| "Account state is unavailable.")?;
            if inner.revoking {
                return Err("Revocation is already in progress.".into());
            }
            let mut envelope = credentials::load(path)?;
            let old = envelope.grant.take();
            // Remove local credentials BEFORE remote I/O and invalidate every late response.
            credentials::save(path, &envelope)?;
            inner.invalidate();
            inner.revoking = revoke && old.is_some();
            inner.message="Google identity disconnected locally. Downloaded files and browser approvals were kept.".into();
            old
        };
        if revoke {
            if let Some(old) = old {
                let result = oauth::revoke(http, &old);
                let mut inner = self
                    .inner
                    .lock()
                    .map_err(|_| "Account state is unavailable.")?;
                inner.revoking = false;
                inner.message = match &result {
                    Ok(()) => "Google revocation confirmed and local credentials removed.".into(),
                    Err(e) => e.clone(),
                };
                return result;
            }
        }
        Ok(())
    }
}

#[tauri::command]
pub async fn get_authentication(state: State<'_, Arc<AppState>>) -> Result<Report> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.auth.status(&path(&state)?))
        .await
        .map_err(|_| "Account state could not be loaded.".to_string())?
}
#[tauri::command]
pub async fn configure_google_identity(
    client_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<()> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        state
            .auth
            .configure(&path(&state)?, client_id.trim().into())
    })
    .await
    .map_err(|_| "Account setup could not be saved.".to_string())?
}
#[tauri::command]
pub async fn begin_google_identity(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<()> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let path = path(&state)?;
        let attempt = state.auth.begin(&path)?;
        if app.opener().open_url(attempt.url(), None::<&str>).is_err() {
            state.auth.cancel()?;
            return Err("Windows could not open the sign-in browser.".into());
        }
        std::thread::spawn(move || {
            let result = attempt
                .wait()
                .and_then(|code| oauth::exchange(&WindowsHttp, &attempt, &code));
            let _ = state.auth.complete(&path, &attempt, result);
        });
        Ok(())
    })
    .await
    .map_err(|_| "Google sign-in could not start.".to_string())?
}
#[tauri::command]
pub async fn cancel_google_identity(state: State<'_, Arc<AppState>>) -> Result<()> {
    state.auth.cancel()
}
#[tauri::command]
pub async fn check_google_identity(state: State<'_, Arc<AppState>>) -> Result<()> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.auth.check(&path(&state)?, &WindowsHttp))
        .await
        .map_err(|_| "The Google identity check stopped.".to_string())?
}
#[tauri::command]
pub async fn disconnect_google_identity(
    revoke: bool,
    state: State<'_, Arc<AppState>>,
) -> Result<()> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        state.auth.disconnect(&path(&state)?, revoke, &WindowsHttp)
    })
    .await
    .map_err(|_| "Google disconnect could not finish.".to_string())?
}

// Google labels its Desktop client credential a client secret, but installed
// applications cannot keep it confidential. Never accept a Web/client-server file.
fn desktop_config(bytes: &[u8]) -> Result<(String, Option<String>)> {
    if bytes.len() > 16384 {
        return Err("The Desktop OAuth configuration is too large.".into());
    }
    let value: serde_json::Value = serde_json::from_slice(bytes)
        .map_err(|_| "Select the Desktop OAuth JSON downloaded from Google.")?;
    let installed=value.get("installed").and_then(|v|v.as_object()).ok_or("Only a Google Desktop OAuth configuration is supported. Web client secrets must stay on a server.")?;
    if value.get("web").is_some() {
        return Err("Web OAuth credentials are not supported in this app.".into());
    }
    for (key, expected) in [
        ("auth_uri", "https://accounts.google.com/o/oauth2/auth"),
        ("token_uri", oauth::TOKEN),
    ] {
        if installed.get(key).and_then(|v| v.as_str()) != Some(expected) {
            return Err("This configuration has an unsupported Google endpoint.".into());
        }
    }
    let client = installed
        .get("client_id")
        .and_then(|v| v.as_str())
        .ok_or("The Desktop configuration has no client ID.")?
        .to_string();
    oauth::validate_client(&client)?;
    let secret = match installed.get("client_secret") {
        None => None,
        Some(v) => {
            let s = v
                .as_str()
                .filter(|s| {
                    !s.is_empty() && s.len() <= 256 && s.bytes().all(|b| b.is_ascii_graphic())
                })
                .ok_or("The Desktop client credential is invalid.")?;
            Some(s.to_string())
        }
    };
    Ok((client, secret))
}
#[tauri::command]
pub async fn import_google_identity(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<bool> {
    use tauri_plugin_dialog::DialogExt;
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move||{
 let Some(selected)=app.dialog().file().add_filter("Google Desktop OAuth configuration",&["json"]).blocking_pick_file()else{return Ok(false);};
 let selected=selected.into_path().map_err(|_|"Select a local Desktop OAuth JSON file.")?;
 if std::fs::metadata(&selected).map_err(|_|"The selected file could not be read.")?.len()>16384{return Err("The Desktop OAuth configuration is too large.".into());}
 let(client,secret)=desktop_config(&std::fs::read(selected).map_err(|_|"The selected file could not be read.")?)?;
 let mut inner=state.auth.inner.lock().map_err(|_|"Account state is unavailable.")?;
 if inner.revoking{return Err("Wait for Google revocation to finish.".into());}
 let path=path(&state)?;let mut envelope=credentials::load(&path)?;
 if envelope.grant.is_some()&&envelope.client_id!=client{return Err("Disconnect Google identity before changing its Desktop client.".into());}
 envelope.client_id=client;envelope.desktop_secret=secret;credentials::save(&path,&envelope)?;
 inner.invalidate();inner.message="Google Desktop configuration imported locally. No confidential Web secret was accepted.".into();
 Ok(true)
 }).await.map_err(|_|"Desktop OAuth configuration could not be imported.".to_string())?
}

#[tauri::command]
pub async fn reset_google_identity(state: State<'_, Arc<AppState>>) -> Result<()> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.auth.reset(&path(&state)?))
        .await
        .map_err(|_| "Google setup could not be reset.".to_string())?
}
