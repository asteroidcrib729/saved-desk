//! Keep the native-messaging entry point executable by an unpackaged browser.
use std::path::{Path, PathBuf};
use sha2::{Digest, Sha256};

fn packaged() -> bool {
    #[cfg(windows)]
    {
        #[link(name = "kernel32")]
        extern "system" { fn GetCurrentPackageFullName(length: *mut u32, name: *mut u16) -> i32; }
        let mut length = 0;
        // A package identity requires a buffer; an unpackaged process reports
        // APPMODEL_ERROR_NO_PACKAGE instead. No guessed WindowsApps path.
        return unsafe { GetCurrentPackageFullName(&mut length, std::ptr::null_mut()) } == 122;
    }
    #[cfg(not(windows))]
    false
}

fn cached_path(data: &Path, source: &Path) -> Result<PathBuf, String> {
    let bytes = std::fs::read(source).map_err(|_| "The connector host could not be read.")?;
    Ok(data.join("connector-bin").join(format!("{:x}", Sha256::digest(&bytes))).join("saveddesk-native-host.exe"))
}

pub fn expected_host(data: &Path, source: &Path) -> Result<PathBuf, String> {
    if packaged() { cached_path(data, source) } else { Ok(source.to_owned()) }
}

fn safe_directory(path: &Path) -> Result<(), String> {
    if !path.exists() { std::fs::create_dir(path).map_err(|_| "The connector folder could not be created.")?; }
    let meta = std::fs::symlink_metadata(path).map_err(|_| "The connector folder is unavailable.")?;
    #[cfg(windows)]
    { use std::os::windows::fs::MetadataExt;
      if meta.file_attributes() & 0x400 != 0 { return Err("Linked connector folders are not supported.".into()); }
    }
    if !meta.is_dir() || meta.file_type().is_symlink() { return Err("The connector folder is unsafe.".into()); }
    Ok(())
}

fn stage_host(data: &Path, source: &Path) -> Result<PathBuf, String> {
    let target = cached_path(data, source)?;
    safe_directory(data)?;
    safe_directory(&data.join("connector-bin"))?;
    safe_directory(target.parent().ok_or("Invalid connector folder.")?)?;
    let original = std::fs::read(source).map_err(|_| "The connector host could not be read.")?;
    if target.exists() {
        let meta = std::fs::symlink_metadata(&target).map_err(|_| "The connector host is unavailable.")?;
        #[cfg(windows)]
        { use std::os::windows::fs::MetadataExt;
          if meta.file_attributes() & 0x400 != 0 { return Err("Linked connector hosts are not supported.".into()); }
        }
        if !meta.is_file() || meta.file_type().is_symlink() || std::fs::read(&target).ok().as_deref() != Some(original.as_slice()) {
            return Err("The cached connector host differs from this app. Remove that host copy and run connector setup again.".into());
        }
        return Ok(target);
    }
    use std::io::Write;
    let temporary = target.with_extension(format!("{}.pending", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&temporary).map_err(|_| "The connector copy could not be created.")?;
        file.write_all(&original).and_then(|_| file.sync_all()).map_err(|_| "The connector copy could not be written.")?;
        drop(file);
        std::fs::rename(&temporary, &target).map_err(|_| "The connector copy could not be installed.")?;
        if std::fs::read(&target).ok().as_deref() != Some(original.as_slice()) { return Err("The installed connector copy did not verify.".into()); }
        Ok(target.clone())
    })();
    if temporary.exists() { let _ = std::fs::remove_file(&temporary); }
    result
}

pub fn install_host(data: &Path, source: &Path) -> Result<PathBuf, String> {
    if packaged() { stage_host(data, source) } else { Ok(source.to_owned()) }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn copied_host_is_verified_reused_and_content_addressed() {
        let root = tempfile::tempdir().unwrap(); let data=root.path().join("profile"); std::fs::create_dir(&data).unwrap();
        let source=root.path().join("host.exe"); std::fs::write(&source,b"test host one").unwrap();
        let first=stage_host(&data,&source).unwrap(); assert_eq!(std::fs::read(&first).unwrap(),b"test host one");
        assert_eq!(stage_host(&data,&source).unwrap(),first);
        std::fs::write(&source,b"test host two").unwrap(); let second=stage_host(&data,&source).unwrap();
        assert_ne!(first,second); assert_eq!(std::fs::read(&first).unwrap(),b"test host one");
    }
    #[test]
    fn modified_cached_host_is_rejected_without_overwriting_it() {
        let root=tempfile::tempdir().unwrap(); let source=root.path().join("host.exe"); std::fs::write(&source,b"original").unwrap();
        let copy=stage_host(root.path(),&source).unwrap(); std::fs::write(&copy,b"modified").unwrap();
        assert!(stage_host(root.path(),&source).is_err()); assert_eq!(std::fs::read(copy).unwrap(),b"modified");
    }
    #[test]
    fn file_in_place_of_cache_directory_is_rejected() {
        let root=tempfile::tempdir().unwrap(); let source=root.path().join("host.exe"); std::fs::write(&source,b"original").unwrap();
        std::fs::write(root.path().join("connector-bin"),b"keep").unwrap();
        assert!(stage_host(root.path(),&source).is_err()); assert_eq!(std::fs::read(root.path().join("connector-bin")).unwrap(),b"keep");
    }
}
