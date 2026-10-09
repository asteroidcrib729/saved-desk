//! Supported media routes; approved browser transport is separate from OAuth identity.
use crate::catalog::Result;
pub const PUBLIC: &[&str] = &[
    "youtube",
    "facebook",
    "tiktok",
    "pinterest",
    "discord",
];
pub fn is_public(source: &str) -> bool {
    PUBLIC.contains(&source)
}
pub fn supported(source: &str) -> bool {
    is_public(source) || ["instagram", "x"].contains(&source)
}
pub fn label(source: &str) -> &str {
    match source {
        "youtube" => "YouTube",
        "facebook" => "Facebook",
        "tiktok" => "TikTok",
        "pinterest" => "Pinterest",
        "discord" => "Discord",
        "instagram" => "Instagram",
        "x" => "X",
        _ => "Platform",
    }
}
pub fn collection(source: &str, target: &str) -> bool {
    (source == "youtube" && target.contains("/playlist?"))
        || (source == "pinterest" && !target.contains("/pin/"))
        || target.contains("/saved/")
        || target.ends_with("/i/bookmarks")
}
pub fn requires_browser_session(source: &str, target: &str) -> bool {
    source == "youtube" && matches!(target, "https://www.youtube.com/playlist?list=WL" | "https://www.youtube.com/playlist?list=LL")
}
fn token(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 120
        && s.bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"_-".contains(&c))
}
fn digits(s: &str) -> bool {
    !s.is_empty() && s.len() <= 40 && s.bytes().all(|c| c.is_ascii_digit())
}
fn handle(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 120
        && s.bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))
}
pub fn canonical(source: &str, input: &str) -> Result<String> {
    let value = input.trim();
    if value.contains('\\')
        || value.to_ascii_lowercase().contains("%2e")
        || value.split(['/', '?', '#']).any(|s| s == "." || s == "..")
    {
        return Err("Use a valid HTTPS link without path traversal.".into());
    }
    let url = tauri::Url::parse(value)
        .map_err(|_| "Use a valid HTTPS link for the selected platform.")?;
    if !is_public(source)
        || value.len() > 2000
        || url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
    {
        return Err("Use a valid HTTPS link for the selected platform.".into());
    }
    let host = url.host_str().unwrap_or("");
    let path = url.path().trim_end_matches('/');
    let parts: Vec<_> = path.trim_start_matches('/').split('/').collect();
    let one = |key: &str| -> String {
        let values: Vec<_> = url
            .query_pairs()
            .filter(|(k, _)| k == key)
            .map(|(_, v)| v.into_owned())
            .collect();
        if values.len() == 1 {
            values[0].clone()
        } else {
            String::new()
        }
    };
    match source {
        "youtube" => {
            let video = if host == "youtu.be" {
                path.trim_start_matches('/').to_string()
            } else if ["youtube.com", "www.youtube.com", "m.youtube.com"].contains(&host) {
                if path == "/watch" {
                    one("v")
                } else if parts.len() == 2 && ["shorts", "live", "embed"].contains(&parts[0]) {
                    parts[1].to_string()
                } else if path == "/playlist"
                    && token(&one("list"))
                    && (["WL", "LL"].contains(&one("list").as_str()) || one("list").len() >= 10)
                    && !one("list").starts_with("RD")
                {
                    return Ok(format!(
                        "https://www.youtube.com/playlist?list={}",
                        one("list")
                    ));
                } else {
                    String::new()
                }
            } else {
                String::new()
            };
            if video.len() == 11 && token(&video) {
                return Ok(format!("https://www.youtube.com/watch?v={video}"));
            }
        }
        "facebook" if ["facebook.com", "www.facebook.com", "m.facebook.com"].contains(&host) => {
            if ["/watch", "/video.php"].contains(&path) && digits(&one("v")) {
                return Ok(format!("https://www.facebook.com/watch/?v={}", one("v")));
            }
            if (parts.len() == 2 && parts[0] == "reel" && digits(parts[1]))
                || (parts.len() == 3
                    && handle(parts[0])
                    && parts[1] == "videos"
                    && digits(parts[2]))
            {
                return Ok(format!("https://www.facebook.com{path}/"));
            }
        }
        "tiktok" if ["tiktok.com", "www.tiktok.com"].contains(&host) => {
            if parts.len() == 3
                && parts[0].starts_with('@')
                && handle(&parts[0][1..])
                && ["video", "photo"].contains(&parts[1])
                && digits(parts[2])
            {
                return Ok(format!("https://www.tiktok.com{path}"));
            }
        }
        "pinterest" if ["pinterest.com", "www.pinterest.com"].contains(&host) => {
            if parts.len() == 2 && parts[0] == "pin" && digits(parts[1]) {
                return Ok(format!("https://www.pinterest.com{path}/"));
            }
            if [2, 3].contains(&parts.len())
                && ![
                    "pin", "ideas", "search", "settings", "login", "business", "today",
                ]
                .contains(&parts[0])
                && parts.iter().all(|p| token(p))
            {
                return Ok(format!("https://www.pinterest.com{path}/"));
            }
        }
        "discord" if host == "cdn.discordapp.com" => {
            if parts.len()==4 && parts[0]=="attachments" && digits(parts[1]) && digits(parts[2]) {
                let filename=percent_encoding::percent_decode_str(parts[3]).decode_utf8().map_err(|_|"This attachment filename is invalid.")?;
                let ext=filename.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
                if !filename.is_empty() && filename.len()<=240 && !filename.chars().any(|c|c.is_control()||"/\\<>:\"|?*#%".contains(c)) && ![".",".."].contains(&filename.as_ref()) && ["jpg","jpeg","png","webp","gif","bmp","avif","mp4","mkv","webm","mov","m4v","avi","mp3","m4a","wav","ogg","opus","flac","aac"].contains(&ext.as_str()) {
                    const FILENAME: &percent_encoding::AsciiSet = &percent_encoding::NON_ALPHANUMERIC.remove(b'.').remove(b'_').remove(b'-').remove(b'~');
                    let encoded=percent_encoding::utf8_percent_encode(&filename,FILENAME);
                    let mut result=tauri::Url::parse(&format!("https://cdn.discordapp.com/attachments/{}/{}/{}",parts[1],parts[2],encoded)).unwrap();
                    let mut signatures=Vec::new();
                    for key in ["ex","is","hm"] {
                        if url.query_pairs().any(|(k,_)|k==key) {
                            let val=one(key);
                            if val.is_empty()||val.len()>128||!val.bytes().all(|c|c.is_ascii_hexdigit()) {return Err("This attachment link has an invalid signature.".into());}
                            signatures.push((key,val));
                        }
                    }
                    if !signatures.is_empty(){let mut pairs=result.query_pairs_mut();for(key,val)in signatures{pairs.append_pair(key,&val);}}
                    return Ok(result.to_string());
                }
            }
        }
        _ => {}
    }
    Err("Paste a full supported post, video, YouTube playlist, or Pinterest board link from the selected platform. For Discord, copy an image, video or audio attachment link from cdn.discordapp.com. Short share links are not supported yet.".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn personal_playlists_require_scoped_browser_transport() {
        for id in ["WL", "LL"] {
            let target = canonical("youtube", &format!("https://m.youtube.com/playlist?list={id}")).unwrap();
            assert!(requires_browser_session("youtube", &target));
            assert!(collection("youtube", &target));
            assert!(!requires_browser_session("facebook", &target));
        }
        assert!(!requires_browser_session("youtube", "https://www.youtube.com/playlist?list=PL123456789012"));
        assert!(!requires_browser_session("youtube", "https://www.youtube.com/watch?v=BaW_jenozKc"));
    }
    #[test]
    fn public_target_contract_matches_worker() {
        let cases: serde_json::Value =
            serde_json::from_str(include_str!("../../../contracts/platform-targets.json")).unwrap();
        for case in cases.as_array().unwrap() {
            let result = canonical(
                case["source"].as_str().unwrap(),
                case["input"].as_str().unwrap(),
            );
            if let Some(expected) = case["output"].as_str() {
                assert_eq!(result.unwrap(), expected, "{case}");
            } else {
                assert!(result.is_err(), "{case}");
            }
        }
    }
}
