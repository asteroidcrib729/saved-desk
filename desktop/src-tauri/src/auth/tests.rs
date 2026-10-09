use super::http::Http;
use super::*;
use std::{
    collections::VecDeque,
    io::{Read, Write},
    net::TcpStream,
    sync::{atomic::AtomicUsize, Barrier},
    time::{Duration, Instant},
};
const CLIENT: &str = "123-test.apps.googleusercontent.com";
struct Mock {
    responses: Mutex<VecDeque<(u32, Vec<u8>)>>,
    calls: Mutex<Vec<(String, Option<String>, Option<String>)>>,
}
impl Mock {
    fn new(values: Vec<serde_json::Value>) -> Self {
        Self {
            responses: Mutex::new(
                values
                    .into_iter()
                    .map(|v| (200, serde_json::to_vec(&v).unwrap()))
                    .collect(),
            ),
            calls: Mutex::new(vec![]),
        }
    }
}
impl Http for Mock {
    fn request(
        &self,
        url: &str,
        form: Option<&str>,
        bearer: Option<&str>,
    ) -> Result<(u32, Vec<u8>)> {
        self.calls.lock().unwrap().push((
            url.into(),
            form.map(str::to_string),
            bearer.map(str::to_string),
        ));
        self.responses
            .lock()
            .unwrap()
            .pop_front()
            .ok_or("Unexpected test request.".into())
    }
}
fn grant() -> Grant {
    Grant {
        issuer: oauth::ISSUER.into(),
        subject: "subject-42".into(),
        name: "Test identity".into(),
        access_token: "TEST_ACCESS_CREDENTIAL".into(),
        refresh_token: Some("TEST_REFRESH_CREDENTIAL".into()),
        scopes: vec!["openid".into(), "profile".into()],
        expires_at: chrono::Utc::now().timestamp() + 3600,
        generation: "first".into(),
    }
}
fn configured(path: &std::path::Path, grant: Option<Grant>) {
    credentials::save(
        path,
        &Envelope {
            version: 1,
            client_id: CLIENT.into(),
            desktop_secret: None,
            grant,
        },
    )
    .unwrap();
}
fn response_token() -> serde_json::Value {
    serde_json::json!({"access_token":"NEW_TEST_CREDENTIAL","token_type":"Bearer","expires_in":3600,"scope":"openid profile","refresh_token":"NEW_TEST_REFRESH"})
}
fn user(subject: &str) -> serde_json::Value {
    serde_json::json!({"sub":subject,"name":"Updated name"})
}
fn request(redirect: &str, query: &str) -> String {
    let uri = url::Url::parse(redirect).unwrap();
    format!(
        "GET /oauth2/callback?{query} HTTP/1.1\r\nHost: 127.0.0.1:{}\r\n\r\n",
        uri.port().unwrap()
    )
}
#[test]
fn pkce_matches_rfc7636_vector() {
    assert_eq!(
        oauth::challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
        "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    );
}
#[test]
fn random_attempts_have_distinct_state_and_verifier() {
    let a = oauth::Attempt::new(CLIENT.into(), 1, Arc::new(AtomicBool::new(false))).unwrap();
    let b = oauth::Attempt::new(CLIENT.into(), 2, Arc::new(AtomicBool::new(false))).unwrap();
    assert_ne!(a.state, b.state);
    assert_ne!(a.verifier, b.verifier);
    assert_ne!(a.state, a.verifier);
    assert_eq!(a.verifier.len(), 64);
    let url = url::Url::parse(&a.url()).unwrap();
    let fields: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
    assert_eq!(fields["scope"], "openid profile");
    assert_eq!(fields["code_challenge_method"], "S256");
    assert!(!fields.contains_key("client_secret"));
}
#[test]
fn callback_rejects_wrong_missing_duplicate_and_malformed_fields() {
    let redirect = "http://127.0.0.1:42123/oauth2/callback";
    for q in [
        "code=test",
        "state=wrong&code=test",
        "state=expected&state=expected&code=test",
        "state=expected&code=a&code=b",
        "state=expected&code=test&error=denied",
        "state=expected&code=",
        "state=expected&code=%ZZ",
        "state=expected&code=%0D",
        "state=expected&code=test#fragment",
    ] {
        assert!(
            oauth::callback(&request(redirect, q), redirect, "expected").is_err(),
            "{q}"
        );
    }
    assert_eq!(
        oauth::callback(
            &request(redirect, "state=expected&code=valid"),
            redirect,
            "expected"
        )
        .unwrap(),
        Some("valid".into())
    );
    assert_eq!(
        oauth::callback(
            &request(redirect, "state=expected&error=access_denied"),
            redirect,
            "expected"
        )
        .unwrap(),
        None
    );
}
#[test]
fn callback_rejects_wrong_host_path_method_and_oversized_payload() {
    let r = "http://127.0.0.1:42123/oauth2/callback";
    let good = request(r, "state=expected&code=valid");
    for bad in [
        good.replace("GET", "POST"),
        good.replace("Host: 127.0.0.1:42123", "Host: attacker.invalid"),
        good.replace("/oauth2/callback", "/other"),
        good.replace("\r\n\r\n", "\r\nHost: 127.0.0.1:42123\r\n\r\n"),
        good.clone() + &"x".repeat(8192),
    ] {
        assert!(oauth::callback(&bad, r, "expected").is_err());
    }
}
#[test]
fn real_loopback_accepts_matching_response_once_and_ignores_wrong_state() {
    let attempt = oauth::Attempt::new(CLIENT.into(), 1, Arc::new(AtomicBool::new(false))).unwrap();
    let address = attempt.listener.local_addr().unwrap();
    let redirect = attempt.redirect.clone();
    let state = attempt.state.clone();
    let send = std::thread::spawn(move || {
        for query in [
            "state=wrong&code=no".to_string(),
            format!("state={state}&code=good"),
        ] {
            let mut stream = TcpStream::connect(address).unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(3)))
                .unwrap();
            stream
                .write_all(request(&redirect, &query).as_bytes())
                .unwrap();
            let mut response = String::new();
            stream.read_to_string(&mut response).unwrap();
            assert!(!response.contains(&state));
            assert!(!response.contains("code=good"));
        }
    });
    assert_eq!(attempt.wait().unwrap(), "good");
    send.join().unwrap();
    assert!(attempt.wait().is_err());
}
#[test]
fn cancelled_and_expired_attempts_cannot_accept_codes() {
    let mut attempt =
        oauth::Attempt::new(CLIENT.into(), 1, Arc::new(AtomicBool::new(false))).unwrap();
    attempt.created = Instant::now() - Duration::from_secs(301);
    assert!(attempt.wait().is_err());
    let a = oauth::Attempt::new(CLIENT.into(), 1, Arc::new(AtomicBool::new(true))).unwrap();
    assert!(a.wait().is_err());
}
#[test]
fn desktop_import_rejects_web_clients_secrets_endpoints_and_oversize() {
    let good = serde_json::json!({"installed":{"client_id":CLIENT,"client_secret":"DESKTOP_TEST_ONLY","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":oauth::TOKEN}});
    assert_eq!(
        desktop_config(&serde_json::to_vec(&good).unwrap())
            .unwrap()
            .0,
        CLIENT
    );
    for bad in [
        serde_json::json!({"web":{"client_id":CLIENT,"client_secret":"CONFIDENTIAL"}}),
        serde_json::json!({"installed":{"client_id":CLIENT,"auth_uri":"http://attacker/","token_uri":oauth::TOKEN}}),
    ] {
        assert!(desktop_config(&serde_json::to_vec(&bad).unwrap()).is_err());
    }
    assert!(desktop_config(&vec![b'x'; 16385]).is_err());
    for bad in [
        "",
        "secret",
        "https://fake.apps.googleusercontent.com",
        "x.apps.googleusercontent.com\r\n",
    ] {
        assert!(oauth::validate_client(bad).is_err());
    }
}
#[test]
fn exchange_uses_pkce_native_credentials_and_verified_subject() {
    let mut a = oauth::Attempt::new(CLIENT.into(), 1, Arc::new(AtomicBool::new(false))).unwrap();
    a.desktop_secret = Some("DESKTOP_TEST_ONLY".into());
    let mock = Mock::new(vec![response_token(), user("subject-42")]);
    let g = oauth::exchange(&mock, &a, "ONE_USE_TEST_CODE").unwrap();
    assert_eq!(g.subject, "subject-42");
    let calls = mock.calls.lock().unwrap();
    assert_eq!(calls[0].0, oauth::TOKEN);
    let fields: std::collections::HashMap<_, _> =
        url::form_urlencoded::parse(calls[0].1.as_ref().unwrap().as_bytes())
            .into_owned()
            .collect();
    assert_eq!(fields["code_verifier"], a.verifier);
    assert_eq!(fields["client_secret"], "DESKTOP_TEST_ONLY");
    assert_eq!(calls[1].2.as_deref(), Some("NEW_TEST_CREDENTIAL"));
    assert!(calls[1].1.is_none());
}
#[test]
fn identity_only_grant_cannot_create_private_capability() {
    let providers = providers::providers();
    assert_eq!(providers.len(), 5);
    for p in providers {
        if p.source != "discord" {
            assert_eq!(p.private_media, if p.source == "youtube" { "not_implemented" } else { "excluded" });
        }
    }
    let mock = Mock::new(vec![response_token(), user("subject-42")]);
    let a = oauth::Attempt::new(CLIENT.into(), 1, Arc::new(AtomicBool::new(false))).unwrap();
    assert!(oauth::exchange(&mock, &a, "test").is_ok());
}
#[test]
fn unreported_permissions_wrong_type_and_invalid_lifetime_fail_closed() {
    for update in [
        serde_json::json!({"scope":"profile"}),
        serde_json::json!({"scope":null}),
        serde_json::json!({"token_type":"Other"}),
        serde_json::json!({"expires_in":0}),
        serde_json::json!({"expires_in":999999}),
    ] {
        let mut token = response_token();
        for (k, v) in update.as_object().unwrap() {
            token[k] = v.clone();
        }
        let mock = Mock::new(vec![token, user("subject-42")]);
        let a = oauth::Attempt::new(CLIENT.into(), 1, Arc::new(AtomicBool::new(false))).unwrap();
        assert!(oauth::exchange(&mock, &a, "test").is_err());
    }
}
#[test]
fn refresh_retains_absent_refresh_token_but_rejects_subject_switch() {
    let old = grant();
    let mut token = response_token();
    token.as_object_mut().unwrap().remove("refresh_token");
    let mock = Mock::new(vec![token, user("subject-42")]);
    let g = oauth::refresh(&mock, CLIENT, None, &old).unwrap();
    assert_eq!(g.refresh_token, old.refresh_token);
    let wrong = Mock::new(vec![response_token(), user("another-account")]);
    assert!(oauth::refresh(&wrong, CLIENT, None, &old).is_err());
}
#[test]
fn stable_identity_ignores_tokens_name_and_generation_but_separates_clients_subjects() {
    let old = grant();
    let mut changed = old.clone();
    changed.name = "Renamed".into();
    changed.access_token = "rotated".into();
    changed.generation = "second".into();
    assert_eq!(oauth::key(CLIENT, &old), oauth::key(CLIENT, &changed));
    assert_ne!(
        oauth::key("other.apps.googleusercontent.com", &old),
        oauth::key(CLIENT, &old)
    );
    changed.subject = "different".into();
    assert_ne!(oauth::key(CLIENT, &changed), oauth::key(CLIENT, &old));
}
#[test]
fn provider_errors_and_status_dtos_never_expose_credentials() {
    let mock = Mock {
        responses: Mutex::new(VecDeque::from([(
            401,
            b"{\"error\":\"PRIVATE_TEST_VALUE\"}".to_vec(),
        )])),
        calls: Mutex::new(vec![]),
    };
    let error = oauth::identity(&mock, "TEST_ACCESS_CREDENTIAL").unwrap_err();
    assert!(!error.contains("PRIVATE_TEST_VALUE"));
    assert!(!error.contains("TEST_ACCESS_CREDENTIAL"));
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("oauth.dpapi");
    configured(&path, Some(grant()));
    let dto = serde_json::to_string(&Controller::default().status(&path).unwrap()).unwrap();
    for secret in [
        "TEST_ACCESS_CREDENTIAL",
        "TEST_REFRESH_CREDENTIAL",
        "subject-42",
        "generation",
    ] {
        assert!(!dto.contains(secret));
    }
}
#[test]
fn dpapi_round_trip_atomic_replacement_and_version_rejection() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("oauth.dpapi");
    configured(&path, Some(grant()));
    let bytes = std::fs::read(&path).unwrap();
    assert!(!String::from_utf8_lossy(&bytes).contains("TEST_ACCESS_CREDENTIAL"));
    let mut e = credentials::load(&path).unwrap();
    e.grant.as_mut().unwrap().name = "Changed".into();
    credentials::save(&path, &e).unwrap();
    assert_eq!(
        credentials::load(&path).unwrap().grant.unwrap().name,
        "Changed"
    );
    assert_eq!(std::fs::read_dir(d.path()).unwrap().count(), 1);
    e.version = 99;
    credentials::save(&path, &e).unwrap();
    assert!(credentials::load(&path).is_err());
}
#[test]
fn cancellation_disconnect_and_client_changes_reject_late_signin() {
    for mode in 0..3 {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("oauth.dpapi");
        configured(&path, None);
        let c = Controller::default();
        let a = c.begin(&path).unwrap();
        match mode {
            0 => c.cancel().unwrap(),
            1 => c.disconnect(&path, false, &Mock::new(vec![])).unwrap(),
            _ => c
                .configure(&path, "other.apps.googleusercontent.com".into())
                .unwrap(),
        }
        assert!(c.complete(&path, &a, Ok(grant())).is_err());
        assert!(credentials::load(&path).unwrap().grant.is_none());
    }
}
#[test]
fn failed_signin_keeps_previous_grant_and_legacy_files_untouched() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("oauth.dpapi");
    let legacy = d.path().join("session-youtube.dpapi");
    std::fs::write(&legacy, b"legacy-preserved").unwrap();
    configured(&path, Some(grant()));
    let c = Controller::default();
    let a = c.begin(&path).unwrap();
    c.complete(&path, &a, Err("Permission declined.".into()))
        .unwrap();
    assert_eq!(
        credentials::load(&path).unwrap().grant.unwrap().subject,
        "subject-42"
    );
    assert_eq!(std::fs::read(legacy).unwrap(), b"legacy-preserved");
    assert!(c.status(&path).unwrap().google.account_key.is_some());
}
struct Blocking {
    entered: Arc<Barrier>,
    resume: Arc<Barrier>,
    calls: AtomicUsize,
}
impl Http for Blocking {
    fn request(&self, _: &str, _: Option<&str>, _: Option<&str>) -> Result<(u32, Vec<u8>)> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        self.entered.wait();
        self.resume.wait();
        Ok((200, serde_json::to_vec(&user("subject-42")).unwrap()))
    }
}
#[test]
fn disconnect_during_identity_check_never_restores_credentials() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("oauth.dpapi");
    configured(&path, Some(grant()));
    let c = Arc::new(Controller::default());
    let h = Arc::new(Blocking {
        entered: Arc::new(Barrier::new(2)),
        resume: Arc::new(Barrier::new(2)),
        calls: AtomicUsize::new(0),
    });
    let thread = {
        let c = c.clone();
        let h = h.clone();
        let path = path.clone();
        std::thread::spawn(move || c.check(&path, &*h))
    };
    h.entered.wait();
    c.disconnect(&path, false, &Mock::new(vec![])).unwrap();
    h.resume.wait();
    assert!(thread.join().unwrap().is_err());
    assert!(credentials::load(&path).unwrap().grant.is_none());
}
#[test]
fn remote_revoke_failure_still_removes_local_credentials() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("oauth.dpapi");
    configured(&path, Some(grant()));
    let mock = Mock {
        responses: Mutex::new(VecDeque::from([(503, vec![])])),
        calls: Mutex::new(vec![]),
    };
    let c = Controller::default();
    assert!(c.disconnect(&path, true, &mock).is_err());
    assert!(credentials::load(&path).unwrap().grant.is_none());
    assert!(c
        .status(&path)
        .unwrap()
        .google
        .message
        .contains("not confirmed"));
}
#[test]
fn corrupted_envelope_does_not_turn_into_anonymous_identity() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("oauth.dpapi");
    std::fs::write(&path, b"broken").unwrap();
    assert!(Controller::default().status(&path).is_err());
}
#[test]
fn https_boundary_rejects_unapproved_endpoints_before_network() {
    for url in [
        "http://oauth2.googleapis.com/token",
        "https://attacker.invalid/",
        "https://oauth2.googleapis.com/token?token=private",
        "https://oauth2.googleapis.com@attacker.invalid/token",
    ] {
        assert!(WindowsHttp.request(url, None, None).is_err());
    }
}

#[test]
fn concurrent_refresh_is_singleflight_and_binds_same_account() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("oauth.dpapi");
    let mut old = grant();
    old.expires_at = 0;
    configured(&path, Some(old));
    let c = Arc::new(Controller::default());
    let mock = Arc::new(Mock::new(vec![
        response_token(),
        user("subject-42"),
        user("subject-42"),
    ]));
    let handles: Vec<_> = (0..2)
        .map(|_| {
            let c = c.clone();
            let path = path.clone();
            let mock = mock.clone();
            std::thread::spawn(move || c.check(&path, &*mock))
        })
        .collect();
    for h in handles {
        h.join().unwrap().unwrap();
    }
    let calls = mock.calls.lock().unwrap();
    assert_eq!(calls.iter().filter(|c| c.0 == oauth::TOKEN).count(), 1);
    assert_eq!(
        credentials::load(&path).unwrap().grant.unwrap().subject,
        "subject-42"
    );
}
#[test]
fn expired_completion_clears_pending_and_keeps_previous_identity() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("oauth.dpapi");
    configured(&path, Some(grant()));
    let c = Controller::default();
    let mut a = c.begin(&path).unwrap();
    a.created = Instant::now() - Duration::from_secs(301);
    assert!(c.complete(&path, &a, Ok(grant())).is_err());
    assert_eq!(c.status(&path).unwrap().google.state, "identity_verified");
    assert!(c
        .status(&path)
        .unwrap()
        .google
        .message
        .contains("timed out"));
}
#[test]
fn google_identity_reconnect_preserves_catalog_and_browser_connections() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("catalog.db");
    let root = d.path().join("downloads");
    std::fs::create_dir(&root).unwrap();
    crate::catalog::initialize(&db, root.to_str().unwrap()).unwrap();
    let before = std::fs::read(&db).unwrap();
    let path = d.path().join("oauth-google.dpapi");
    configured(&path, None);
    let c = Controller::default();
    let a = c.begin(&path).unwrap();
    c.complete(&path, &a, Ok(grant())).unwrap();
    c.disconnect(&path, false, &Mock::new(vec![])).unwrap();
    assert_eq!(std::fs::read(db).unwrap(), before);
}

#[test]
fn reset_recovers_corrupt_oauth_storage_without_touching_legacy_data() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("oauth.dpapi");
    let legacy = d.path().join("session-instagram.dpapi");
    std::fs::write(&legacy, b"keep").unwrap();
    std::fs::write(&path, b"broken").unwrap();
    let c = Controller::default();
    assert!(c.status(&path).is_err());
    c.reset(&path).unwrap();
    assert_eq!(c.status(&path).unwrap().google.state, "setup_required");
    assert_eq!(std::fs::read(legacy).unwrap(), b"keep");
}

#[test]
fn refresh_may_retain_verified_scopes_when_provider_omits_unchanged_scope() {
    let mut response = response_token();
    response.as_object_mut().unwrap().remove("scope");
    let old = grant();
    let mock = Mock::new(vec![response, user("subject-42")]);
    let updated = oauth::refresh(&mock, CLIENT, None, &old).unwrap();
    assert_eq!(updated.scopes, old.scopes);
}

#[test]
#[ignore = "Explicit live HTTPS transport check; no account or credentials involved."]
fn google_https_transport_reaches_official_endpoints_without_credentials() {
    let (status, _) = WindowsHttp.request(oauth::USERINFO, None, None).unwrap();
    assert_eq!(status, 401, "Google must reject unauthenticated userinfo");
    let (status, _) = WindowsHttp.request(
        oauth::TOKEN,
        Some("grant_type=saveddesk_transport_probe"),
        None,
    ).unwrap();
    assert_eq!(status, 400, "Google must reject the deliberately invalid grant");
}

#[test]
fn cancel_after_completion_reports_no_pending_attempt_and_keeps_identity() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("oauth.dpapi");
    configured(&path, Some(grant()));
    let controller = Controller::default();
    controller.cancel().unwrap();
    let status = controller.status(&path).unwrap();
    assert_eq!(status.google.state, "identity_verified");
    assert!(status.google.message.contains("No Google sign-in is pending"));
}


#[test]
fn public_only_providers_do_not_require_private_or_oauth_setup() {
    let entries = providers::providers();
    for source in ["facebook", "tiktok", "pinterest"] {
        let provider = entries.iter().find(|p| p.source == source).unwrap();
        assert_eq!(provider.private_media, "excluded");
    }
    let pinterest = entries.iter().find(|p| p.source == "pinterest").unwrap();
    assert_eq!(pinterest.identity_flow, "public_links");
}

#[test]
fn controlled_google_lifecycle_refresh_cancel_disconnect_and_revoke() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("oauth-google.dpapi");
    let legacy = dir.path().join("session-youtube.dpapi");
    let media = dir.path().join("owner-media.bin");
    std::fs::write(&legacy, b"browser-approval-preserved").unwrap();
    std::fs::write(&media, b"download-preserved").unwrap();
    let mut old = grant();
    old.expires_at = 0;
    configured(&path, Some(old.clone()));
    let controller = Controller::default();
    let key = controller.status(&path).unwrap().google.account_key;
    assert_eq!(controller.status(&path).unwrap().google.state, "refresh_needed");

    let http = Mock::new(vec![response_token(), user("subject-42")]);
    controller.check(&path, &http).unwrap();
    let refreshed = credentials::load(&path).unwrap().grant.unwrap();
    assert!(refreshed.expires_at > chrono::Utc::now().timestamp());
    assert_ne!(refreshed.generation, old.generation);
    assert_eq!(controller.status(&path).unwrap().google.account_key, key);
    let calls = http.calls.lock().unwrap();
    assert_eq!(calls[0].0, oauth::TOKEN);
    assert!(calls[0].1.as_ref().unwrap().contains("grant_type=refresh_token"));
    assert_eq!(calls[1].0, oauth::USERINFO);
    drop(calls);

    let attempt = controller.begin(&path).unwrap();
    assert_eq!(controller.status(&path).unwrap().google.state, "waiting_for_browser");
    controller.cancel().unwrap();

    assert!(controller.complete(&path, &attempt, Ok(grant())).is_err());
    assert_eq!(controller.status(&path).unwrap().google.account_key, key);

    let no_network = Mock::new(vec![]);
    controller.disconnect(&path, false, &no_network).unwrap();
    assert!(no_network.calls.lock().unwrap().is_empty());
    let status = controller.status(&path).unwrap().google;
    assert_eq!(status.state, "not_connected");
    assert_eq!(status.client_id, CLIENT);
    assert!(status.account_key.is_none());
    assert!(credentials::load(&path).unwrap().grant.is_none());

    // A fresh controlled grant exercises the real controller's remote success path.
    configured(&path, Some(refreshed));
    let remote = Mock::new(vec![serde_json::json!({})]);
    controller.disconnect(&path, true, &remote).unwrap();
    let calls = remote.calls.lock().unwrap();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].0, oauth::REVOKE);
    assert!(calls[0].1.as_ref().unwrap().starts_with("token="));
    assert!(calls[0].2.is_none());
    assert!(controller.status(&path).unwrap().google.message.contains("revocation confirmed"));
    assert!(credentials::load(&path).unwrap().grant.is_none());
    assert_eq!(std::fs::read(legacy).unwrap(), b"browser-approval-preserved");
    assert_eq!(std::fs::read(media).unwrap(), b"download-preserved");
}

#[test]
fn rejected_expired_refresh_preserves_identity_without_exposing_provider_response() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("oauth.dpapi");
    let mut old = grant();
    old.expires_at = 0;
    configured(&path, Some(old));
    let before = std::fs::read(&path).unwrap();
    let http = Mock {
        responses: Mutex::new(VecDeque::from([(400, b"{\"error\":\"invalid_grant\",\"debug\":\"TEST_PRIVATE_RESPONSE\"}".to_vec())])),
        calls: Mutex::new(vec![]),
    };
    let controller = Controller::default();
    let error = controller.check(&path, &http).unwrap_err();
    assert!(!error.contains("TEST_PRIVATE_RESPONSE"));
    assert!(!error.contains("TEST_REFRESH_CREDENTIAL"));
    assert_eq!(std::fs::read(&path).unwrap(), before);
    assert_eq!(controller.status(&path).unwrap().google.state, "refresh_needed");
}

#[test]
fn refresh_cannot_replace_credentials_with_another_google_subject() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("oauth.dpapi");
    let mut old = grant();
    old.expires_at = 0;
    configured(&path, Some(old));
    let before = std::fs::read(&path).unwrap();
    let controller = Controller::default();
    let http = Mock::new(vec![response_token(), user("unrelated-subject")]);
    assert!(controller.check(&path, &http).is_err());
    assert_eq!(std::fs::read(&path).unwrap(), before);
}

#[test]
fn revoke_uses_access_token_when_no_refresh_grant_exists() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("oauth.dpapi");
    let mut old = grant();
    old.refresh_token = None;
    configured(&path, Some(old));
    let controller = Controller::default();
    let remote = Mock::new(vec![serde_json::json!({})]);
    controller.disconnect(&path, true, &remote).unwrap();
    assert_eq!(remote.calls.lock().unwrap()[0].1.as_deref(), Some("token=TEST_ACCESS_CREDENTIAL"));
    assert!(credentials::load(&path).unwrap().grant.is_none());
}

#[test]
#[ignore = "Explicit live Google revocation rejection; only an invented invalid credential is sent."]
fn google_revoke_rejects_invented_credential_without_owner_grants() {
    let (status, _) = WindowsHttp.request(
        oauth::REVOKE, Some("token=saveddesk-invalid-lifecycle-probe"), None
    ).unwrap();
    assert_eq!(status, 400);
}
