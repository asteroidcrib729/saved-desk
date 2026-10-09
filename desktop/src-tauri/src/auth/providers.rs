//! Capabilities do not follow from identity alone.
use serde::Serialize;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Provider {
    pub source: &'static str,
    pub identity_flow: &'static str,
    pub private_media: &'static str,
    pub requirement: &'static str,
}
pub fn providers() -> Vec<Provider> {
    vec![
Provider {source:"youtube",identity_flow:"google_desktop",private_media:"not_implemented",requirement:"A Google Desktop OAuth client ID enables identity only. Private downloading needs a separately permitted media route."},
Provider {source:"facebook",identity_flow:"optional",private_media:"excluded",requirement:"Public video and Reel links do not require a new OAuth registration. Facebook identity is optional future work; private content is outside the supported scope."},
Provider {source:"tiktok",identity_flow:"optional",private_media:"excluded",requirement:"Public video and photo links do not require Login Kit setup. TikTok identity is optional future work; private and followers-only content is outside the supported scope."},
Provider {source:"pinterest",identity_flow:"public_links",private_media:"excluded",requirement:"Public pin and board links work without a Pinterest developer app or OAuth setup. Private and secret-board downloads are outside the supported scope."},
Provider {source:"discord",identity_flow:"optional",private_media:"attachment_link",requirement:"Fresh CDN attachment links work without sign-in. OAuth identity would not grant server-message access."},
]
}
