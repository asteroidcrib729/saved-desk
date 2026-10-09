use crate::{
    catalog::{self, Result},
    platform, storage, worker_host, AppState,
};
use base64::Engine;
use rusqlite::Connection;
use serde::Serialize;
use std::{
    collections::HashMap,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};
use tauri::State;
use tauri_plugin_opener::OpenerExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedFile {
    id: i64,
    name: String,
    job_id: String,
    bytes: i64,
    quality: String,
    profile: String,
    available: bool,
    kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    playback: Option<&'static str>,
}
pub fn files(db: &Connection, post: i64) -> Result<Vec<SavedFile>> {
    let root = storage::root(db).ok();
    let mut q=db.prepare("SELECT id,path,job_id,bytes,quality,profile FROM media_files WHERE post_id=?1 ORDER BY id DESC LIMIT 100").map_err(|_| "Saved copies could not be read.")?;
    let rows = q
        .query_map([post], |r| {
            let path: String = r.get(1)?;
            let bytes: i64 = r.get(3)?;
            let p = Path::new(&path);
            Ok(SavedFile {
                id: r.get(0)?,
                name: p
                    .file_name()
                    .map(|v| v.to_string_lossy().into())
                    .unwrap_or_default(),
                job_id: r.get(2)?,
                bytes,
                quality: r.get(4)?,
                profile: r.get(5)?,
                available: storage::available(root.as_deref(), &path, bytes),
                kind: kind(p).into(),
                playback: None,
            })
        })
        .map_err(|_| "Saved copies could not be read.")?;
    rows.collect::<std::result::Result<Vec<_>, _>>()
        .map_err(|_| "File history contains an invalid record.".into())
}
fn kind(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "mp4" | "mkv" | "webm" => "video",
        "m4a" | "mp3" | "wav" | "ogg" | "opus" | "flac" | "aac" => "audio",
        "txt" => "text",
        _ => "image",
    }
}
pub fn validated(db: &Connection, id: i64) -> Result<(PathBuf, PathBuf)> {
    validated_details(db,id).map(|(path,root,_)|(path,root))
}
fn validated_details(db: &Connection, id: i64) -> Result<(PathBuf, PathBuf, std::fs::Metadata)> {
    let (file,bytes,prototype):(String,i64,bool)=db.query_row("SELECT m.path,m.bytes,p.prototype FROM media_files m JOIN posts p ON p.id=m.post_id WHERE m.id=?1",[id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).map_err(|_| "This saved file could not be located.")?;
    let root = storage::root(db)?;
    let path = storage::contained(&root, Path::new(&file))?;
    let ext = path
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let metadata=std::fs::metadata(&path).map_err(|_| "This saved file could not be checked.")?;
    if bytes<=0 || !metadata.is_file() || metadata.len()!=bytes as u64
        || !(prototype && ext == "svg"
            || [
                "bmp", "avif", "mp3", "wav", "ogg", "opus", "flac", "aac", "jpg", "jpeg", "png", "gif", "webp", "mp4", "mkv", "webm", "m4a", "txt",
            ]
            .contains(&ext.as_str()))
    {
        return Err("This file could not be verified inside the selected save folder.".into());
    }
    Ok((path, root, metadata))
}
pub fn supported_content(path: &Path) -> Result<&'static str> {
    let mut file = std::fs::File::open(path).map_err(|_| "This media file could not be read.")?;
    let mut header = [0; 64];
    let n = file
        .read(&mut header)
        .map_err(|_| "This media file could not be checked.")?;
    let h = &header[..n];
    let ext = path
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" if h.starts_with(&[255, 216, 255]) => "image/jpeg",
        "png" if h.starts_with(b"\x89PNG\r\n\x1a\n") => "image/png",
        "gif" if h.starts_with(b"GIF87a") || h.starts_with(b"GIF89a") => "image/gif",
        "webp" if h.starts_with(b"RIFF") && h.get(8..12) == Some(b"WEBP") => "image/webp",
        "bmp" if h.starts_with(b"BM") => "image/bmp",
        "avif" if h.get(4..8)==Some(b"ftyp") && (h.get(8..12)==Some(b"avif") || h.get(8..12)==Some(b"avis") || h.get(16..h.len().min(u32::from_be_bytes(h[..4].try_into().unwrap()) as usize)).is_some_and(|v|v.chunks_exact(4).any(|brand|brand==b"avif" || brand==b"avis"))) => "image/avif",
        "mp3" if h.starts_with(b"ID3") || h.len()>1 && h[0]==255 && h[1]&224==224 => "audio/mpeg",
        "wav" if h.starts_with(b"RIFF") && h.get(8..12)==Some(b"WAVE") => "audio/wav",
        "ogg" | "opus" if h.starts_with(b"OggS") => "audio/ogg",
        "flac" if h.starts_with(b"fLaC") => "audio/flac",
        "aac" if h.len()>1 && h[0]==255 && h[1]&246==240 => "audio/aac",
        "mp4" if h.get(4..8) == Some(b"ftyp") => "video/mp4",
        "m4a" if h.get(4..8) == Some(b"ftyp") => "audio/mp4",
        "mkv" if h.starts_with(&[0x1a, 0x45, 0xdf, 0xa3]) => "video/x-matroska",
        "webm" if h.starts_with(&[0x1a, 0x45, 0xdf, 0xa3]) => "video/webm",
        "txt" => "text/plain; charset=utf-8",
        _ => return Err("This file's contents do not match a supported media format.".into()),
    };
    Ok(mime)
}
#[cfg(test)]
fn playback_candidate(path: &Path, id: i64) -> Result<PathBuf> {
    let metadata=std::fs::metadata(path).map_err(|_| "This video could not be checked.")?;
    playback_candidate_from(path,id,&metadata)
}
fn playback_candidate_from(path: &Path, id: i64, metadata: &std::fs::Metadata) -> Result<PathBuf> {
    let modified=metadata.modified().ok().and_then(|v|v.duration_since(std::time::UNIX_EPOCH).ok()).map(|v|v.as_nanos()).ok_or("This video's modification time is unavailable.")?;
    Ok(path.parent().ok_or("Video folder unavailable.")?.join(".playback").join(format!("{id}-{}-{modified}.mp4",metadata.len())))
}
fn validated_playback_from(source: &Path,root: &Path,id: i64,metadata: &std::fs::Metadata) -> Result<PathBuf> {
    let modified=metadata.modified().ok().and_then(|v|v.duration_since(std::time::UNIX_EPOCH).ok()).map(|v|v.as_nanos()).ok_or("Video time unavailable.")?;
    let downloaded=source.parent().ok_or("Video folder unavailable.")?.join(".playback").join(format!("{}-{}-{modified}.mp4",source.file_name().ok_or("Video name unavailable.")?.to_string_lossy(),metadata.len()));
    let candidate=if downloaded.is_file(){downloaded}else{playback_candidate_from(source,id,metadata)?};
    let path=storage::contained(root,&candidate)?;
    if kind(source)!="video" || supported_content(&path)?!="video/mp4" || std::fs::metadata(&path).map_err(|_| "Playback copy unavailable.")?.len()==0 {return Err("Playback copy unavailable.".into());}
    Ok(path)
}
fn validated_playback(db: &Connection, id: i64) -> Result<PathBuf> {
    let (source,root,metadata)=validated_details(db,id)?;
    validated_playback_from(&source,&root,id,&metadata)
}
fn ready_video(source: &Path,root: &Path,id: i64,metadata: &std::fs::Metadata,cache: &std::sync::Mutex<crate::playback_probe::ProbeCache>,force: bool) -> Option<bool> {
    if validated_playback_from(source,root,id,metadata).is_ok() { return Some(true); }
    if !force && cache.lock().map(|mut probe|probe.ordinary_avc(source,metadata)).unwrap_or_else(|_|crate::playback_probe::ordinary_avc(source)) { return Some(false); }
    None
}
fn initial_playback(db: &Connection,files: &mut [SavedFile],cache: &std::sync::Mutex<crate::playback_probe::ProbeCache>) {
    // Bounded to this post (100 files); reuse download-time caches without worker startup.
    for file in files.iter_mut().filter(|file|file.available) {
        if file.kind=="video" {
            if let Ok((source,root,metadata))=validated_details(db,file.id) {
                file.playback=ready_video(&source,&root,file.id,&metadata,cache,false).map(|converted|if converted {"cached"} else {"original"});
            }
        }
    }
}
#[tauri::command]
pub async fn prepare_video(id: i64, force: bool, app: tauri::AppHandle, state: State<'_, Arc<AppState>>) -> Result<bool> {
    let state=state.inner().clone();
    tauri::async_runtime::spawn_blocking(move||{
        let db=catalog::open(&state.database)?;
        let (source,root,metadata)=validated_details(&db,id)?;
        if kind(&source)!="video" {return Err("Choose a saved video.".into());}
        if let Some(converted)=ready_video(&source,&root,id,&metadata,&state.playback_probe,force) {return Ok(converted);}
        let busy=||->Result<bool>{db.query_row("SELECT count(*) FROM download_jobs WHERE state IN ('queued','running')",[],|r|r.get::<_,i64>(0)).map(|n|n>0).map_err(|_| "Download activity could not be checked.".into())};
        if busy()? {return Err("Finish or pause downloads, then use compatible playback. The original remains available with Windows.".into());}
        // Wait for short local preview work off the UI thread instead of showing
        // a spurious compatibility failure when a post is opened immediately.
        let _gate=state.worker_gate.lock().map_err(|_| "Video preparation is unavailable. Restart the app and try again.")?;
        if busy()? {return Err("Finish or pause downloads, then use compatible playback. The original remains available with Windows.".into());}
        let target=playback_candidate_from(&source,id,&metadata)?;
        // Reject links/junctions before the worker can create a playback copy.
        storage::ensure_destination(&root,target.parent().ok_or("Video folder unavailable.")?)?;
        let relative=source.strip_prefix(&root).map_err(|_| "Video outside the selected folder.")?;
        let output=target.strip_prefix(&root).map_err(|_| "Playback outside the selected folder.")?;
        let mut session=worker_host::Session::start(&app)?;
        session.send(serde_json::json!({"protocol_version":1,"command":"prepare_playback","destination":root,"relative":relative,"output":output,"force":force}))?;
        let deadline=std::time::Instant::now()+Duration::from_secs(1900);
        loop {
            if std::time::Instant::now()>deadline{return Err("Video preparation timed out. The original is preserved.".into());}
            let event=session.next(Duration::from_secs(35))?.ok_or("Video preparation timed out.")?;
            match event["event"].as_str(){
                Some("playback_heartbeat")=>{},
                Some("playback_ready")=>{let converted=event["data"]["converted"].as_bool().ok_or("Invalid playback result.")?;session.finish()?;if converted{validated_playback(&db,id)?;}return Ok(converted);},
                Some("failed")=>return Err(event["data"]["message"].as_str().unwrap_or("Video preparation failed. The original is preserved.").to_string()),
                _=>return Err("Invalid playback response.".into())
            }
        }
    }).await.map_err(|_| "Video preparation could not finish.".to_string())?
}

#[tauri::command]
pub async fn post_files(id: i64, state: State<'_, Arc<AppState>>) -> Result<Vec<SavedFile>> {
    let state=state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let db=catalog::open(&state.database)?;
        let mut saved=files(&db,id)?;
        initial_playback(&db,&mut saved,&state.playback_probe);
        Ok(saved)
    }).await.map_err(|_| "Saved copies could not be loaded.".to_string())?
}

#[tauri::command]
pub async fn open_media_file(
    id: i64,
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<()> {
    let path = state.database.clone();
    let file = tauri::async_runtime::spawn_blocking(move || {
        validated(&catalog::open(&path)?, id).map(|v| v.0)
    })
    .await
    .map_err(|_| "This file could not be opened.".to_string())??;
    app.opener()
        .open_path(platform::shell_path(&file), None::<&str>)
        .map_err(|_| "Windows could not open this media file.".into())
}
fn preview(db: &Connection, id: i64) -> Result<Option<String>> {
    for saved in files(db, id)?.iter().take(16) {
        let Ok((file, root)) = validated(db, saved.id) else {
            continue;
        };
        let Some(name) = file.file_name() else {
            continue;
        };
        let Some(parent) = file.parent() else {
            continue;
        };
        let Ok(path) = storage::contained(
            &root,
            &parent
                .join(".previews")
                .join(format!("{}.jpg", name.to_string_lossy())),
        ) else {
            continue;
        };
        if !std::fs::metadata(&path).is_ok_and(|m| m.is_file() && m.len() > 0 && m.len() <= 65536) {
            continue;
        }
        let mut bytes = Vec::new();
        std::fs::File::open(path)
            .map_err(|_| "Preview could not be read.")?
            .take(65537)
            .read_to_end(&mut bytes)
            .map_err(|_| "Preview could not be read.")?;
        if bytes.len() > 65536 {
            continue;
        }
        if bytes.starts_with(&[255, 216, 255]) {
            return Ok(Some(format!(
                "data:image/jpeg;base64,{}",
                base64::engine::general_purpose::STANDARD.encode(bytes)
            )));
        }
    }
    Ok(None)
}
#[tauri::command]
pub async fn thumbnail(id: i64, state: State<'_, Arc<AppState>>) -> Result<Option<String>> {
    let path = state.database.clone();
    tauri::async_runtime::spawn_blocking(move || preview(&catalog::open(&path)?, id))
        .await
        .map_err(|_| "Preview could not be loaded.".to_string())?
}
#[tauri::command]
pub async fn thumbnails(
    ids: Vec<i64>,
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<HashMap<i64, Option<String>>> {
    if ids.len() > 18 || ids.iter().any(|id| *id < 1) {
        return Err("Choose at most 18 visible posts.".into());
    }
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move||{
        let db=catalog::open(&state.database)?;let root=storage::root(&db).ok();let mut result=HashMap::new();let mut missing=Vec::new();
        for id in &ids {let value=preview(&db,*id)?;if value.is_none(){for file in files(&db,*id)?.into_iter().take(16) {if let Ok((p,_))=validated(&db,file.id){if ["image","video"].contains(&kind(&p))&&supported_content(&p).is_ok(){missing.push(p);break;}}}}result.insert(*id,value);}
        if !missing.is_empty(){if let (Some(root),Ok(_gate))=(root,state.worker_gate.try_lock()) {
            let relative:Vec<_>=missing.iter().filter_map(|p|p.strip_prefix(&root).ok()).map(|p|p.to_string_lossy().to_string()).collect();
            if let Ok(mut session)=worker_host::Session::start(&app){
                session.send(serde_json::json!({"protocol_version":1,"command":"generate_previews","destination":root,"files":relative}))?;
                for _ in 0..ids.len()+1 {let event=session.next(Duration::from_secs(25))?.ok_or("Preview generation timed out.")?;if event["event"]=="previews_completed"{break;}if event["event"]!="preview_progress"{return Err("Previews could not be generated.".into());}}
                session.finish()?;
                for id in ids {result.insert(id,preview(&db,id)?);}
            }
        }} Ok(result)
    }).await.map_err(|_| "Previews could not be loaded.".to_string())?
}
#[tauri::command]
pub async fn repair_library(state: State<'_, Arc<AppState>>) -> Result<storage::Repair> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _gate = state
            .worker_gate
            .try_lock()
            .map_err(|_| "Pause or finish downloads before checking the save folder.")?;
        storage::repair(&mut catalog::open(&state.database)?)
    })
    .await
    .map_err(|_| "File repair could not finish.".to_string())?
}

// ID-only protocol: no path supplied by the renderer is ever opened. Video data
// is bounded to 2 MiB per range response and never serialized through JSON IPC.
pub fn response(
    db: &Connection,
    request: tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    use tauri::http::{Method, Response, StatusCode};
    let error = |status| {
        Response::builder()
            .status(status)
            .header("Cache-Control", "no-store")
            .body(Vec::new())
            .unwrap()
    };
    let origin = request
        .headers()
        .get("Origin")
        .and_then(|v| v.to_str().ok());
    let allowed = origin.is_none_or(|v| {
        [
            "http://tauri.localhost",
            "https://tauri.localhost",
            "tauri://localhost",
        ]
        .contains(&v)
            || cfg!(debug_assertions) && v == "http://127.0.0.1:3000"
    });
    if !allowed {
        return error(StatusCode::FORBIDDEN);
    }
    let route = request.uri().path().trim_start_matches('/');
    let (key,playback)=match route.split_once('/') {Some((id,"playback"))=>(id,true),None=>(route,false),_=>return error(StatusCode::NOT_FOUND)};
    if request.uri().query().is_some() || key.is_empty() || !key.bytes().all(|v| v.is_ascii_digit())
    {
        return error(StatusCode::NOT_FOUND);
    }
    let Ok(id) = key.parse::<i64>() else {
        return error(StatusCode::NOT_FOUND);
    };
    if request.method() == Method::OPTIONS {
        let Some(origin) = origin else {
            return error(StatusCode::FORBIDDEN);
        };
        let method = request
            .headers()
            .get("Access-Control-Request-Method")
            .and_then(|v| v.to_str().ok());
        let headers = request
            .headers()
            .get("Access-Control-Request-Headers")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if !matches!(method, Some("GET" | "HEAD"))
            || headers
                .split(',')
                .any(|v| !v.trim().is_empty() && !v.trim().eq_ignore_ascii_case("range"))
        {
            return error(StatusCode::FORBIDDEN);
        }
        return Response::builder()
            .status(204)
            .header("Access-Control-Allow-Origin", origin)
            .header("Access-Control-Allow-Methods", "GET, HEAD")
            .header("Access-Control-Allow-Headers", "Range")
            .header("Vary", "Origin")
            .header("Cache-Control", "no-store")
            .body(Vec::new())
            .unwrap();
    }
    if request.method() != Method::GET && request.method() != Method::HEAD {
        return error(StatusCode::METHOD_NOT_ALLOWED);
    }
    let file_path=if playback{validated_playback(db,id)}else{validated(db,id).map(|v|v.0)};
    let Ok(path) = file_path else {
        return error(StatusCode::NOT_FOUND);
    };
    let Ok(mime) = supported_content(&path) else {
        return error(StatusCode::UNSUPPORTED_MEDIA_TYPE);
    };
    let Ok(mut file) = std::fs::File::open(&path) else {
        return error(StatusCode::NOT_FOUND);
    };
    let Ok(size) = file.metadata().map(|v| v.len()) else {
        return error(StatusCode::NOT_FOUND);
    };
    let range = request.headers().get("Range").and_then(|v| v.to_str().ok());
    let chunk = 2 * 1024 * 1024u64;
    let streaming = mime.starts_with("video/") || mime.starts_with("audio/");
    if !streaming && size > 32 * 1024 * 1024 {
        return error(StatusCode::PAYLOAD_TOO_LARGE);
    }
    let ranged = range.is_some() || streaming && size > chunk;
    let selected = range
        .map(|v| byte_range(v, size, chunk))
        .unwrap_or_else(|| {
            Ok((
                0,
                if ranged {
                    size.saturating_sub(1).min(chunk - 1)
                } else {
                    size.saturating_sub(1)
                },
            ))
        });
    let Ok((start, end)) = selected else {
        return Response::builder()
            .status(416)
            .header("Content-Range", format!("bytes */{size}"))
            .body(Vec::new())
            .unwrap();
    };
    let count = end - start + 1;
    let mut body = Vec::new();
    if request.method() != Method::HEAD {
        if file.seek(SeekFrom::Start(start)).is_err()
            || file.take(count).read_to_end(&mut body).is_err()
            || body.len() as u64 != count
        {
            return error(StatusCode::INTERNAL_SERVER_ERROR);
        }
    }
    let mut builder = Response::builder()
        .status(if ranged { 206 } else { 200 })
        .header("Content-Type", mime)
        .header("Content-Length", count)
        .header("Accept-Ranges", "bytes")
        .header("Cache-Control", "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .header(
            "Access-Control-Expose-Headers",
            "Content-Range, Accept-Ranges",
        );
    if let Some(origin) = origin {
        builder = builder
            .header("Access-Control-Allow-Origin", origin)
            .header("Vary", "Origin");
    }
    if ranged {
        builder = builder.header("Content-Range", format!("bytes {start}-{end}/{size}"));
    }
    builder.body(body).unwrap()
}
fn byte_range(value: &str, size: u64, limit: u64) -> Result<(u64, u64)> {
    if size == 0 {
        return Err("Empty media.".into());
    }
    let value = value.strip_prefix("bytes=").ok_or("Invalid range.")?;
    let (a, b) = value.split_once('-').ok_or("Invalid range.")?;
    let (start, end) = if a.is_empty() {
        let length = b.parse::<u64>().map_err(|_| "Invalid range.")?;
        if length == 0 {
            return Err("Invalid range.".into());
        }
        (size.saturating_sub(length), size - 1)
    } else {
        let start = a.parse::<u64>().map_err(|_| "Invalid range.")?;
        let end = if b.is_empty() {
            size - 1
        } else {
            b.parse::<u64>()
                .map_err(|_| "Invalid range.")?
                .min(size - 1)
        };
        (start, end)
    };
    if start >= size || end < start {
        return Err("Invalid range.".into());
    }
    Ok((start, end.min(start.saturating_add(limit - 1))))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, Connection, PathBuf, i64, i64) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("selected");
        std::fs::create_dir(&root).unwrap();
        let database = dir.path().join("catalog.db");
        catalog::initialize(&database, root.to_str().unwrap()).unwrap();
        let mut db = catalog::open(&database).unwrap();
        let job = root.join("instagram/downloads/job-1");
        std::fs::create_dir_all(&job).unwrap();
        let file = job.join("101.jpg");
        std::fs::write(&file, b"\xff\xd8\xffsaved-photo").unwrap();
        db.execute("INSERT INTO download_jobs(id,title,mode,state,destination,created_at,source,account_id,target) VALUES('job-1','Saved','new_only','completed',?1,'now','instagram','42','target')",[job.to_string_lossy()]).unwrap();
        let detail = serde_json::json!({"item_id":"101","native_id":"100","creator":"Creator","caption":"Caption","kind":"image","url":"https://www.instagram.com/p/test/"});
        catalog::record_live(
            &mut db,
            "job-1",
            "instagram",
            "42",
            &detail,
            &file,
            14,
            "original",
            "original",
        )
        .unwrap();
        let id = db
            .query_row("SELECT id FROM media_files", [], |r| r.get(0))
            .unwrap();
        let post = db
            .query_row("SELECT id FROM posts", [], |r| r.get(0))
            .unwrap();
        (dir, db, root, id, post)
    }
    #[test]
    fn attachment_media_types_reject_disguised_web_documents() {
        let dir=tempfile::tempdir().unwrap();
        for (name,bytes,mime) in [
            ("voice.wav",&b"RIFFxxxxWAVEdata"[..],"audio/wav"),
            ("song.mp3",&b"ID3audio"[..],"audio/mpeg"),
            ("voice.ogg",&b"OggSaudio"[..],"audio/ogg"),
            ("voice.opus",&b"OggSaudio"[..],"audio/ogg"),
            ("song.flac",&b"fLaCaudio"[..],"audio/flac"),
            ("song.aac",&[255,241,80,128][..],"audio/aac"),
            ("photo.bmp",&b"BMphoto"[..],"image/bmp"),
            ("photo.avif",&b"\x00\x00\x00\x18ftypmif1\x00\x00\x00\x00avifmif1"[..],"image/avif"),
        ] {
            let path=dir.path().join(name);
            std::fs::write(&path,bytes).unwrap();
            assert_eq!(supported_content(&path).unwrap(),mime);
            std::fs::write(&path,b"<html>not media</html>").unwrap();
            assert!(supported_content(&path).is_err());
        }
    }
    #[test]
    fn selected_folder_guards_media_previews_and_external_open() {
        let (dir, db, root, id, post) = fixture();
        assert!(validated(&db, id).is_ok());
        assert!(files(&db, post).unwrap()[0].available);
        let (file, _) = validated(&db, id).unwrap();
        let previews = file.parent().unwrap().join(".previews");
        std::fs::create_dir(&previews).unwrap();
        std::fs::write(previews.join("101.jpg.jpg"), [255, 216, 255, 1]).unwrap();
        assert!(preview(&db, post).unwrap().is_some());
        let outside = dir.path().join("outside.jpg");
        std::fs::write(&outside, b"\xff\xd8\xffsaved-photo").unwrap();
        db.execute(
            "UPDATE media_files SET path=?1",
            [outside.to_string_lossy()],
        )
        .unwrap();
        assert!(!files(&db, post).unwrap()[0].available);
        assert!(validated(&db, id).is_err());
        assert!(preview(&db, post).unwrap().is_none());
        assert!(storage::contained(&root.canonicalize().unwrap(), &outside).is_err());
    }
    #[test]
    fn repair_relinks_a_preserved_layout_without_reading_old_files() {
        let (dir, mut db, old, id, post) = fixture();
        let new = dir.path().join("new");
        std::fs::rename(&old, &new).unwrap();
        let mut settings = catalog::settings(&db).unwrap();
        settings.download_folder = new.to_string_lossy().into();
        db.execute(
            "UPDATE settings SET value=?1",
            [serde_json::to_string(&settings).unwrap()],
        )
        .unwrap();
        assert!(!files(&db, post).unwrap()[0].available);
        let repaired = storage::repair(&mut db).unwrap();
        assert_eq!(repaired.relinked, 1);
        assert_eq!(repaired.available, 1);
        assert_eq!(repaired.missing, 0);
        assert!(validated(&db, id)
            .unwrap()
            .0
            .starts_with(new.canonicalize().unwrap()));
        let job: String = db
            .query_row("SELECT destination FROM download_jobs", [], |r| r.get(0))
            .unwrap();
        assert!(Path::new(&job).starts_with(new.canonicalize().unwrap()));
        assert_eq!(storage::repair(&mut db).unwrap().relinked, 0);
        assert!(
            catalog::live_present(&db, "instagram", "42", "101", "original", "original", None)
                .unwrap()
        );
    }
    #[test]
    fn repair_accepts_unique_flat_moves_but_rejects_ambiguous_and_wrong_size_files() {
        let (dir, mut db, old, id, _) = fixture();
        let new = dir.path().join("flat");
        std::fs::create_dir(&new).unwrap();
        let mut settings = catalog::settings(&db).unwrap();
        settings.download_folder = new.to_string_lossy().into();
        db.execute(
            "UPDATE settings SET value=?1",
            [serde_json::to_string(&settings).unwrap()],
        )
        .unwrap();
        std::fs::write(new.join("101.jpg"), b"\xff\xd8\xffwrong").unwrap();
        assert_eq!(storage::repair(&mut db).unwrap().missing, 1);
        std::fs::write(new.join("101.jpg"), b"\xff\xd8\xffsaved-photo").unwrap();
        std::fs::create_dir(new.join("other")).unwrap();
        std::fs::copy(new.join("101.jpg"), new.join("other/101.jpg")).unwrap();
        assert_eq!(storage::repair(&mut db).unwrap().ambiguous, 1);
        assert!(validated(&db, id).is_err());
        std::fs::remove_file(new.join("other/101.jpg")).unwrap();
        assert_eq!(storage::repair(&mut db).unwrap().relinked, 1);
        assert!(old.join("instagram/downloads/job-1/101.jpg").is_file());
        assert!(validated(&db, id).is_ok());
    }
    #[test]
    fn protocol_validates_ids_origins_methods_headers_and_ranges() {
        let (_directory, db, _root, id, _post) = fixture();
        let request = |path: &str, range: Option<&str>| {
            let mut q =
                tauri::http::Request::builder().uri(format!("http://savedmedia.localhost/{path}"));
            if let Some(range) = range {
                q = q.header("Range", range);
            }
            q.body(Vec::new()).unwrap()
        };
        let r = response(&db, request(&id.to_string(), None));
        assert_eq!(r.status(), 200);
        assert_eq!(r.headers()["Content-Type"], "image/jpeg");
        assert_eq!(r.headers()["Cache-Control"], "no-store");
        assert_eq!(r.body().len(), 14);
        let r = response(&db, request(&id.to_string(), Some("bytes=3-7")));
        assert_eq!(r.status(), 206);
        assert_eq!(r.headers()["Content-Range"], "bytes 3-7/14");
        assert_eq!(r.body(), b"saved");
        for range in ["bytes=99-", "bytes=7-3", "bytes=0-1,3-4", "bad", "bytes=-0"] {
            assert_eq!(
                response(&db, request(&id.to_string(), Some(range))).status(),
                416
            );
        }
        assert_eq!(response(&db, request("../private.txt", None)).status(), 404);
        assert_eq!(
            response(
                &db,
                tauri::http::Request::builder()
                    .uri(format!("http://savedmedia.localhost/{id}"))
                    .header("Origin", "https://example.com")
                    .body(Vec::new())
                    .unwrap()
            )
            .status(),
            403
        );
        assert_eq!(
            response(
                &db,
                tauri::http::Request::builder()
                    .method("HEAD")
                    .uri(format!("http://savedmedia.localhost/{id}"))
                    .body(Vec::new())
                    .unwrap()
            )
            .body()
            .len(),
            0
        );
        assert_eq!(
            byte_range("bytes=0-", 10_000_000, 2_097_152).unwrap(),
            (0, 2_097_151)
        );
        assert_eq!(byte_range("bytes=-4", 14, 100).unwrap(), (10, 13));
    }
    #[test]
    fn range_preflight_is_scoped_to_the_app_origin_and_read_only_headers() {
        let (_dir, db, _root, id, _post) = fixture();
        let request = |origin: &str, method: &str, headers: &str| {
            tauri::http::Request::builder()
                .method("OPTIONS")
                .uri(format!("http://savedmedia.localhost/{id}"))
                .header("Origin", origin)
                .header("Access-Control-Request-Method", method)
                .header("Access-Control-Request-Headers", headers)
                .body(Vec::new())
                .unwrap()
        };
        assert_eq!(
            response(&db, request("http://tauri.localhost", "GET", "range")).status(),
            204
        );
        assert_eq!(
            response(&db, request("https://example.com", "GET", "range")).status(),
            403
        );
        assert_eq!(
            response(&db, request("http://tauri.localhost", "DELETE", "range")).status(),
            403
        );
        assert_eq!(
            response(
                &db,
                request("http://tauri.localhost", "GET", "authorization")
            )
            .status(),
            403
        );
    }
    #[test]
    fn playback_route_requires_a_current_scoped_original_and_valid_copy() {
        let (_dir,db,root,id,_post)=fixture();
        let source=root.join("original.mp4");let payload=b"\0\0\0\x18ftypisom00000000";
        std::fs::write(&source,payload).unwrap();
        db.execute("UPDATE media_files SET path=?1,bytes=?2",rusqlite::params![source.to_string_lossy(),payload.len() as i64]).unwrap();
        let source=source.canonicalize().unwrap();let target=playback_candidate(&source,id).unwrap();
        std::fs::create_dir(target.parent().unwrap()).unwrap();std::fs::write(&target,payload).unwrap();
        let request=|route:String|tauri::http::Request::builder().uri(format!("http://savedmedia.localhost/{route}")).body(Vec::new()).unwrap();
        assert_eq!(response(&db,request(format!("{id}/playback"))).status(),200);
        assert_eq!(response(&db,request(format!("{id}/playback/other"))).status(),404);
        assert_eq!(response(&db,request(format!("{id}/arbitrary"))).status(),404);
        std::fs::write(&target,b"bad content").unwrap();assert_eq!(response(&db,request(format!("{id}/playback"))).status(),404);
        std::fs::write(&target,payload).unwrap();std::fs::remove_file(source).unwrap();
        assert_eq!(response(&db,request(format!("{id}/playback"))).status(),404);
    }
    #[test]
    fn initial_playback_is_selected_only_and_cannot_reuse_outside_root() {
        let (dir,db,root,id,post)=fixture();let cache=std::sync::Mutex::new(crate::playback_probe::ProbeCache::default());
        let mut saved=files(&db,post).unwrap();initial_playback(&db,&mut saved,&cache);
        assert!(saved[0].playback.is_none()); // Initially selected image; no video probe.
        let source=root.join("original.mp4");let payload=b"\0\0\0\x18ftypisom00000000";
        std::fs::write(&source,payload).unwrap();
        db.execute("UPDATE media_files SET path=?1,bytes=?2",rusqlite::params![source.to_string_lossy(),payload.len() as i64]).unwrap();
        let source=source.canonicalize().unwrap();let target=playback_candidate(&source,id).unwrap();
        std::fs::create_dir(target.parent().unwrap()).unwrap();std::fs::write(&target,payload).unwrap();
        let mut saved=files(&db,post).unwrap();initial_playback(&db,&mut saved,&cache);assert_eq!(saved[0].playback,Some("cached"));
        let elsewhere=dir.path().join("different-root");std::fs::create_dir(&elsewhere).unwrap();
        let mut settings=catalog::settings(&db).unwrap();settings.download_folder=elsewhere.to_string_lossy().into();
        db.execute("UPDATE settings SET value=?1",[serde_json::to_string(&settings).unwrap()]).unwrap();
        let mut saved=files(&db,post).unwrap();initial_playback(&db,&mut saved,&cache);
        assert!(!saved[0].available);assert!(saved[0].playback.is_none());assert!(validated_playback(&db,id).is_err());
    }
    #[test]
    fn protocol_refuses_a_header_mismatch_and_file_size_change() {
        let (_directory, db, _root, id, _post) = fixture();
        let (file, _) = validated(&db, id).unwrap();
        std::fs::write(&file, b"<html>BAD</htm").unwrap();
        let request = || {
            tauri::http::Request::builder()
                .uri(format!("http://savedmedia.localhost/{id}"))
                .body(Vec::new())
                .unwrap()
        };
        assert_eq!(response(&db, request()).status(), 415);
        std::fs::write(&file, b"different length").unwrap();
        assert_eq!(response(&db, request()).status(), 404);
    }
}
