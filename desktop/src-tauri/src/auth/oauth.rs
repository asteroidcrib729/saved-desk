//! One-use system-browser authorization; no embedded login or renderer credentials.
use super::{credentials::Grant, http::Http};
use crate::catalog::Result;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    io::{Read, Write},
    net::TcpListener,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
pub const ISSUER: &str = "https://accounts.google.com";
pub const TOKEN: &str = "https://oauth2.googleapis.com/token";
pub const USERINFO: &str = "https://openidconnect.googleapis.com/v1/userinfo";
pub const REVOKE: &str = "https://oauth2.googleapis.com/revoke";
pub fn form(values: &[(&str, &str)]) -> String {
    url::form_urlencoded::Serializer::new(String::new())
        .extend_pairs(values.iter().copied())
        .finish()
}
pub fn challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}
pub fn random() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}
pub fn validate_client(value: &str) -> Result<()> {
    let suffix = ".apps.googleusercontent.com";
    if value.len() > 240
        || !value.ends_with(suffix)
        || value.len() <= suffix.len()
        || !value[..value.len() - suffix.len()]
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err("Enter a Google Desktop OAuth client ID, not a secret or token.".into());
    }
    Ok(())
}
pub struct Attempt {
    pub listener: TcpListener,
    pub client: String,
    pub desktop_secret: Option<String>,
    pub redirect: String,
    pub state: String,
    pub verifier: String,
    pub created: Instant,
    pub stop: Arc<AtomicBool>,
    pub generation: u64,
    pub consumed: AtomicBool,
}
impl Attempt {
    pub fn new(client: String, generation: u64, stop: Arc<AtomicBool>) -> Result<Self> {
        validate_client(&client)?;
        let listener = TcpListener::bind(("127.0.0.1", 0))
            .map_err(|_| "The local sign-in callback could not start.")?;
        listener
            .set_nonblocking(true)
            .map_err(|_| "The local sign-in callback is unavailable.")?;
        let redirect = format!(
            "http://127.0.0.1:{}/oauth2/callback",
            listener
                .local_addr()
                .map_err(|_| "The local sign-in callback is unavailable.")?
                .port()
        );
        Ok(Self {
            listener,
            client,
            desktop_secret: None,
            redirect,
            state: random(),
            verifier: random(),
            created: Instant::now(),
            stop,
            generation,
            consumed: AtomicBool::new(false),
        })
    }
    pub fn url(&self) -> String {
        format!(
            "https://accounts.google.com/o/oauth2/v2/auth?{}",
            form(&[
                ("client_id", &self.client),
                ("redirect_uri", &self.redirect),
                ("response_type", "code"),
                ("scope", "openid profile"),
                ("state", &self.state),
                ("code_challenge", &challenge(&self.verifier)),
                ("code_challenge_method", "S256"),
                ("access_type", "offline"),
                ("prompt", "consent select_account")
            ])
        )
    }
    pub fn wait(&self) -> Result<String> {
        if self.consumed.swap(true, Ordering::SeqCst) {
            return Err("This callback attempt was already consumed.".into());
        }
        while self.created.elapsed() < Duration::from_secs(300) && !self.stop.load(Ordering::SeqCst)
        {
            match self.listener.accept() {
                Ok((mut stream, peer)) => {
                    if !peer.ip().is_loopback() {
                        continue;
                    }
                    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
                    let _ = stream.set_write_timeout(Some(Duration::from_millis(500)));
                    let start = Instant::now();
                    let mut data = Vec::new();
                    let mut chunk = [0u8; 1024];
                    while data.len() < 8192 && start.elapsed() < Duration::from_secs(2) {
                        match stream.read(&mut chunk) {
                            Ok(0) | Err(_) => break,
                            Ok(count) => {
                                data.extend_from_slice(&chunk[..count]);
                                if data.windows(4).any(|w| w == b"\r\n\r\n") {
                                    break;
                                }
                            }
                        }
                    }
                    let request = String::from_utf8(data).unwrap_or_default();
                    let result = callback(&request, &self.redirect, &self.state);
                    let matched = result.is_ok();
                    let body = if matched {
                        "SavedDesk received your sign-in response. Return to the app. You can close this tab."
                    } else {
                        "This sign-in callback was rejected. Return to SavedDesk and retry sign-in."
                    };
                    let status = if matched { "200 OK" } else { "400 Bad Request" };
                    let response=format!("HTTP/1.1 {status}\r\nContent-Type: text/plain; charset=utf-8\r\nCache-Control: no-store\r\nContent-Security-Policy: default-src 'none'; frame-ancestors 'none'\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{body}",body.len());
                    let _ = stream.write_all(response.as_bytes());
                    if self.stop.load(Ordering::SeqCst) {
                        return Err("Sign-in was cancelled.".into());
                    }
                    if self.created.elapsed() >= Duration::from_secs(300) {
                        break;
                    }
                    if let Ok(value) = result {
                        return value.ok_or_else(||"Sign-in permission was declined. Your previous connection was kept.".into());
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(40))
                }
                Err(_) => return Err("The local sign-in callback stopped.".into()),
            }
        }
        Err(if self.stop.load(Ordering::SeqCst) {
            "Sign-in was cancelled."
        } else {
            "Sign-in timed out after five minutes. Try again."
        }
        .into())
    }
}
// An invalid callback does not consume the attempt; a matching code or denial does.
pub fn callback(request: &str, redirect: &str, expected: &str) -> Result<Option<String>> {
    if request.len() > 8192 || !request.ends_with("\r\n\r\n") {
        return Err("Invalid callback.".into());
    }
    let mut lines = request.split("\r\n");
    let first = lines.next().ok_or("Invalid callback.")?;
    let parts: Vec<_> = first.split(' ').collect();
    if parts.len() != 3
        || parts[0] != "GET"
        || !["HTTP/1.0", "HTTP/1.1"].contains(&parts[2])
        || !parts[1].starts_with("/oauth2/callback?")
    {
        return Err("Invalid callback path.".into());
    }
    let origin = url::Url::parse(redirect).map_err(|_| "Invalid callback.")?;
    let expected_host = format!(
        "127.0.0.1:{}",
        origin.port().ok_or("Invalid callback port.")?
    );
    let headers: Vec<_> = lines.filter(|l| !l.is_empty()).collect();
    let hosts: Vec<_> = headers
        .iter()
        .filter_map(|h| h.split_once(':'))
        .filter(|(k, _)| k.eq_ignore_ascii_case("host"))
        .map(|(_, v)| v.trim())
        .collect();
    if hosts != vec![expected_host.as_str()]
        || headers
            .iter()
            .any(|h| h.starts_with(' ') || h.starts_with('\t'))
    {
        return Err("Invalid callback host.".into());
    }
    let parsed = url::Url::parse(&format!("http://{expected_host}{}", parts[1]))
        .map_err(|_| "Invalid callback query.")?;
    if parsed.path() != origin.path() || parsed.fragment().is_some() {
        return Err("Invalid callback path.".into());
    }
    let query = parsed.query().ok_or("Missing callback query.")?;
    let b = query.as_bytes();
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            if i + 2 >= b.len() || !b[i + 1].is_ascii_hexdigit() || !b[i + 2].is_ascii_hexdigit() {
                return Err("Invalid callback encoding.".into());
            }
            i += 2;
        }
        i += 1;
    }
    let mut fields = HashMap::new();
    for (k, v) in parsed.query_pairs() {
        if fields.insert(k.to_string(), v.to_string()).is_some() {
            return Err("Duplicate callback field.".into());
        }
    }
    let state = fields.get("state").ok_or("Missing callback state.")?;
    if state.len() != expected.len()
        || state
            .bytes()
            .zip(expected.bytes())
            .fold(0u8, |diff, (a, b)| diff | (a ^ b))
            != 0
    {
        return Err("Incorrect callback state.".into());
    }
    match (fields.get("code"), fields.get("error")) {
        (Some(code), None)
            if !code.is_empty() && code.len() <= 4096 && !code.chars().any(char::is_control) =>
        {
            Ok(Some(code.clone()))
        }
        (None, Some(_)) => Ok(None),
        _ => Err("Invalid authorization response.".into()),
    }
}
fn json_response(
    http: &dyn Http,
    url: &str,
    form: Option<&str>,
    bearer: Option<&str>,
) -> Result<serde_json::Value> {
    let (status, body) = http.request(url, form, bearer)?;
    if status != 200 {
        return Err(if status == 400 || status == 401 || status == 403 {
            "The account grant was rejected. Sign in again; downloads already saved are preserved."
        } else {
            "The account service is unavailable. Try again later."
        }
        .into());
    }
    if body.len() > 65536 {
        return Err("The account response is too large.".into());
    }
    serde_json::from_slice(&body).map_err(|_| "The account response is invalid.".into())
}
fn text(value: &serde_json::Value, key: &str) -> Result<String> {
    let s = value
        .get(key)
        .and_then(|v| v.as_str())
        .ok_or("The account response is incomplete.")?;
    if s.is_empty() || s.len() > 16384 || s.chars().any(char::is_control) {
        return Err("The account response is invalid.".into());
    }
    Ok(s.to_string())
}
pub fn identity(http: &dyn Http, token: &str) -> Result<(String, String)> {
    let value = json_response(http, USERINFO, None, Some(token))?;
    let subject = text(&value, "sub")?;
    if subject.len() > 255 {
        return Err("The verified account identifier is invalid.".into());
    }
    let name = value
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("Google account")
        .chars()
        .filter(|c| !c.is_control())
        .take(120)
        .collect::<String>();
    Ok((subject, name))
}
fn grant(http: &dyn Http, form_body: &str, previous: Option<&Grant>) -> Result<Grant> {
    let value = json_response(http, TOKEN, Some(form_body), None)?;
    if value.get("token_type").and_then(|v| v.as_str()) != Some("Bearer") {
        return Err("The account token type is unsupported.".into());
    }
    let access_token = text(&value, "access_token")?;
    let expires = value
        .get("expires_in")
        .and_then(|v| v.as_i64())
        .filter(|n| *n > 0 && *n <= 86400)
        .ok_or("The account token lifetime is invalid.")?;
    // A refresh may retain an already verified grant, never infer additional scopes.
    let scopes: Vec<String> = match value.get("scope") {
        Some(v) => v
            .as_str()
            .ok_or("The account scope response is invalid.")?
            .split_whitespace()
            .map(str::to_string)
            .collect(),
        None => previous
            .map(|g| g.scopes.clone())
            .ok_or("The account grant did not report its permissions.")?,
    };
    if !scopes.iter().any(|s| s == "openid") {
        return Err("The account identity permission was not granted.".into());
    }
    let (subject, name) = identity(http, &access_token)?;
    if let Some(old) = previous {
        if old.issuer != ISSUER || old.subject != subject {
            return Err("The refreshed account identity changed. Sign in again.".into());
        }
    }
    let refresh_token = match value.get("refresh_token") {
        Some(_) => Some(text(&value, "refresh_token")?),
        None => previous.and_then(|g| g.refresh_token.clone()),
    };
    Ok(Grant {
        issuer: ISSUER.into(),
        subject,
        name,
        access_token,
        refresh_token,
        scopes,
        expires_at: chrono::Utc::now().timestamp() + expires,
        generation: uuid::Uuid::new_v4().to_string(),
    })
}
pub fn exchange(http: &dyn Http, attempt: &Attempt, code: &str) -> Result<Grant> {
    let mut fields = vec![
        ("client_id", attempt.client.as_str()),
        ("code", code),
        ("code_verifier", attempt.verifier.as_str()),
        ("redirect_uri", attempt.redirect.as_str()),
        ("grant_type", "authorization_code"),
    ];
    if let Some(secret) = attempt.desktop_secret.as_deref() {
        fields.push(("client_secret", secret));
    }
    grant(http, &form(&fields), None)
}
pub fn refresh(http: &dyn Http, client: &str, secret: Option<&str>, old: &Grant) -> Result<Grant> {
    let token = old
        .refresh_token
        .as_deref()
        .ok_or("This account has no refresh grant. Sign in again.")?;
    let mut fields = vec![
        ("client_id", client),
        ("refresh_token", token),
        ("grant_type", "refresh_token"),
    ];
    if let Some(secret) = secret {
        fields.push(("client_secret", secret));
    }
    grant(http, &form(&fields), Some(old))
}
pub fn revoke(http: &dyn Http, old: &Grant) -> Result<()> {
    let (status, _) = http.request(
        REVOKE,
        Some(&form(&[(
            "token",
            old.refresh_token.as_deref().unwrap_or(&old.access_token),
        )])),
        None,
    )?;
    if status == 200 {
        Ok(())
    } else {
        Err("Local access was removed, but Google revocation was not confirmed. Remove SavedDesk access in your Google account.".into())
    }
}
pub fn key(client: &str, grant: &Grant) -> String {
    // Scope and credential generation are deliberately excluded.
    let namespace = serde_json::to_vec(&("youtube", ISSUER, client, &grant.subject))
        .expect("String tuple serialization");
    format!("google:{:x}", Sha256::digest(namespace))
}
