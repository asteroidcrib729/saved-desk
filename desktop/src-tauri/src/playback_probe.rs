//! Bounded MP4 metadata inspection. Never scans compressed frame payloads or starts a process.
use std::{fs::File, io::{Read, Seek, SeekFrom}, path::Path};
const MAX_METADATA: u64 = 4 * 1024 * 1024;
const MAX_BOXES: usize = 16384;
const MAX_CACHED_FILES: usize = 128;
const CACHE_TTL: std::time::Duration = std::time::Duration::from_secs(300);

#[derive(Hash, PartialEq, Eq)]
struct Fingerprint {
    path: std::path::PathBuf,
    size: u64,
    modified: std::time::SystemTime,
    created: Option<std::time::SystemTime>,
}
/// Decisions only: no cached file handles, media bytes, account data or authorization.
/// Callers revalidate the current selected folder and file before every lookup.
#[derive(Default)]
pub struct ProbeCache {
    entries: std::collections::HashMap<Fingerprint, (std::time::Instant, bool)>,
    #[cfg(test)]
    reads: usize,
}
impl ProbeCache {
    pub fn ordinary_avc(&mut self, path: &Path, metadata: &std::fs::Metadata) -> bool {
        let Ok(modified) = metadata.modified() else { return ordinary_avc(path); };
        let key = Fingerprint { path: path.to_owned(), size: metadata.len(), modified, created: metadata.created().ok() };
        if let Some((checked, decision)) = self.entries.get(&key) {
            if checked.elapsed() < CACHE_TTL { return *decision; }
        }
        #[cfg(test)] { self.reads += 1; }
        let decision = ordinary_avc(path);
        // Bounded memory and expiry; no background polling or persistent sidecar.
        self.entries.retain(|_, (checked, _)| checked.elapsed() < CACHE_TTL);
        if self.entries.len() >= MAX_CACHED_FILES { self.entries.clear(); }
        self.entries.insert(key, (std::time::Instant::now(), decision));
        decision
    }
}

fn boxes(data: &[u8]) -> Option<Vec<([u8; 4], &[u8])>> {
    let mut found = Vec::new();
    let mut at = 0;
    while at < data.len() {
        if found.len() >= MAX_BOXES || data.len() - at < 8 { return None; }
        let short = u32::from_be_bytes(data[at..at+4].try_into().ok()?);
        let tag = data[at+4..at+8].try_into().ok()?;
        let (size, header) = match short {
            0 => ((data.len() - at) as u64, 8),
            1 => (u64::from_be_bytes(data.get(at+8..at+16)?.try_into().ok()?), 16),
            n => (n as u64, 8),
        };
        let size = usize::try_from(size).ok()?;
        if size < header || size > data.len() - at { return None; }
        found.push((tag, &data[at+header..at+size]));
        at += size;
    }
    Some(found)
}
fn child<'a>(data: &'a [u8], tag: &[u8;4]) -> Option<&'a [u8]> {
    boxes(data)?.into_iter().find(|(kind,_)|kind==tag).map(|(_,body)|body)
}
fn avc_tracks(moov: &[u8]) -> Option<bool> {
    let mut videos = 0;
    for (_,track) in boxes(moov)?.into_iter().filter(|(tag,_)|tag==b"trak") {
        let mdia = child(track,b"mdia")?;
        let handler = child(mdia,b"hdlr")?;
        if handler.get(8..12)? != b"vide" { continue; }
        videos += 1;
        let stsd = child(child(child(mdia,b"minf")?,b"stbl")?,b"stsd")?;
        let count = u32::from_be_bytes(stsd.get(4..8)?.try_into().ok()?);
        let entries = boxes(stsd.get(8..)?)?;
        if count == 0 || entries.len() != count as usize { return None; }
        for (codec,body) in entries {
            // VisualSampleEntry's fixed header is 78 bytes. Do not accept a bare codec string.
            if body.len()<78 || ![b"avc1",b"avc3"].contains(&&codec) { return Some(false); }
            let config = child(&body[78..],b"avcC")?;
            // Standard 8-bit AVC profiles; extended/high-bit-depth streams use the existing probe.
            if config.len()<7 || config[0]!=1 || ![66,77,88,100].contains(&config[1]) { return Some(false); }
        }
    }
    Some(videos>0)
}
/// Only a validated ordinary AVC MP4 gets the fast path. Unknown/malformed metadata
/// falls back to the existing preparation policy, without claiming codec support.
pub fn ordinary_avc(path: &Path) -> bool {
    if !path.extension().is_some_and(|v|v.eq_ignore_ascii_case("mp4")) { return false; }
    inspect(path).unwrap_or(false)
}
fn inspect(path: &Path) -> Option<bool> {
    let mut file = File::open(path).ok()?;
    let length = file.metadata().ok()?.len();
    let mut at = 0u64;
    for _ in 0..256 {
        if at==length { return Some(false); }
        if length.checked_sub(at)? < 8 { return None; }
        file.seek(SeekFrom::Start(at)).ok()?;
        let mut header = [0u8;8]; file.read_exact(&mut header).ok()?;
        let short = u32::from_be_bytes(header[..4].try_into().ok()?);
        let (size,head) = match short {
            0 => (length-at,8),
            1 => { let mut wide=[0u8;8];file.read_exact(&mut wide).ok()?;(u64::from_be_bytes(wide),16) },
            n => (n as u64,8),
        };
        if size<head || size>length-at { return None; }
        if &header[4..]==b"moov" {
            let body_size=size-head;
            if body_size>MAX_METADATA { return None; }
            let mut data=vec![0;body_size as usize];file.read_exact(&mut data).ok()?;
            return avc_tracks(&data);
        }
        at=at.checked_add(size)?;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    fn atom(tag: &[u8;4], data: &[u8]) -> Vec<u8> { let mut v=((data.len()+8) as u32).to_be_bytes().to_vec();v.extend(tag);v.extend(data);v }
    fn movie(codec: &[u8;4]) -> Vec<u8> {
        let mut entry=vec![0;78];entry.extend(atom(b"avcC", &[1,100,0,40,255,225,0]));
        let mut stsd=vec![0;4];stsd.extend(1u32.to_be_bytes());stsd.extend(atom(codec,&entry));
        let mut handler=vec![0;8];handler.extend(b"vide");
        let mut mdia=atom(b"hdlr",&handler);mdia.extend(atom(b"minf",&atom(b"stbl",&atom(b"stsd",&stsd))));
        atom(b"trak",&atom(b"mdia",&mdia))
    }
    #[test] fn cache_reuses_metadata_but_expires_and_invalidates_changed_files() {
        let dir=tempfile::tempdir().unwrap();let path=dir.path().join("video.mp4");
        let movie_file=|codec| { let mut data=atom(b"ftyp",b"isom0000");data.extend(atom(b"moov",&movie(codec)));data };
        std::fs::write(&path,movie_file(b"avc1")).unwrap();
        let mut cache=ProbeCache::default();
        assert!(cache.ordinary_avc(&path,&std::fs::metadata(&path).unwrap()));
        assert!(cache.ordinary_avc(&path,&std::fs::metadata(&path).unwrap()));assert_eq!(cache.reads,1);
        // Same byte count, changed codec and explicit mtime must not reuse the old decision.
        std::fs::write(&path,movie_file(b"vp09")).unwrap();
        File::options().write(true).open(&path).unwrap().set_times(std::fs::FileTimes::new().set_modified(std::time::UNIX_EPOCH+std::time::Duration::from_secs(123456))).unwrap();
        assert!(!cache.ordinary_avc(&path,&std::fs::metadata(&path).unwrap()));assert_eq!(cache.reads,2);
        for (checked,_) in cache.entries.values_mut() {*checked=std::time::Instant::now()-CACHE_TTL-std::time::Duration::from_secs(1);}
        assert!(!cache.ordinary_avc(&path,&std::fs::metadata(&path).unwrap()));assert_eq!(cache.reads,3);
        for index in 0..MAX_CACHED_FILES+2 {
            let other=dir.path().join(format!("{index}.mp4"));std::fs::write(&other,movie_file(b"avc1")).unwrap();
            assert!(cache.ordinary_avc(&other,&std::fs::metadata(&other).unwrap()));
            assert!(cache.entries.len()<=MAX_CACHED_FILES);
        }
    }
    #[test] fn recognizes_tracks_and_rejects_other_codecs() {
        assert_eq!(avc_tracks(&movie(b"avc1")),Some(true));
        assert_eq!(avc_tracks(&movie(b"avc3")),Some(true));
        for codec in [b"vp09",b"hev1",b"av01"] { assert_eq!(avc_tracks(&movie(codec)),Some(false)); }
        let mut mixed=movie(b"avc1");mixed.extend(movie(b"vp09"));assert_eq!(avc_tracks(&mixed),Some(false));
    }
    #[test] fn malformed_and_payload_codec_strings_cannot_enable_fast_path() {
        for n in 0..8 { assert!(boxes(&[0u8;8][..n]).is_none() || n==0); }
        assert!(boxes(&[0,0,0,4,b'm',b'o',b'o',b'v']).is_none());
        assert!(boxes(&[0,0,0,1,b'm',b'o',b'o',b'v']).is_none());
        assert_eq!(avc_tracks(&atom(b"mdat",b"avc1")),Some(false));
        let mut corrupt=movie(b"avc1");corrupt.pop();assert!(avc_tracks(&corrupt).is_none());
    }
    #[test] fn seeks_past_large_payload_and_bounds_metadata() {
        let path=std::env::temp_dir().join(format!("saveddesk-probe-{}.mp4",uuid::Uuid::new_v4()));
        let mut data=atom(b"ftyp",b"isom0000");data.extend(atom(b"mdat",&vec![0;1024*1024]));data.extend(atom(b"moov",&movie(b"avc1")));
        std::fs::write(&path,&data).unwrap();assert!(ordinary_avc(&path));
        std::fs::write(&path,atom(b"moov",&vec![0;MAX_METADATA as usize+1])).unwrap();assert!(!ordinary_avc(&path));
        std::fs::remove_file(path).unwrap();
    }
}
