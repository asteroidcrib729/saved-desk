//! Export extension files to an ordinary user-readable folder, outside WindowsApps.
use std::path::{Path,PathBuf};
use sha2::{Digest,Sha256};
const FILES:[&str;4]=["manifest.json","popup.html","popup.js","popup.css"];
pub fn export(data:&Path,source:&Path,browser:&str)->Result<PathBuf,String>{
    if !["edge","chrome","firefox","brave","chromium","vivaldi"].contains(&browser){return Err("Unsupported browser.".into());}
    let mut digest=Sha256::new();
    for name in FILES{
        let path=source.join(name);
        let meta=std::fs::symlink_metadata(&path).map_err(|_|"The bundled browser extension is incomplete.")?;
        if !meta.is_file() || meta.file_type().is_symlink() || meta.len()>1024*1024{return Err("The bundled browser extension is invalid.".into());}
        digest.update(name.as_bytes());digest.update(std::fs::read(path).map_err(|_|"The bundled browser extension could not be read.")?);
    }
    let target=data.join("browser-extensions").join(browser).join(format!("{:x}",digest.finalize()));
    let mut cursor=data.to_path_buf();
    for segment in ["browser-extensions".to_string(),browser.to_string(),target.file_name().unwrap().to_string_lossy().into_owned()]{
        cursor=cursor.join(segment);
        if !cursor.exists(){std::fs::create_dir(&cursor).map_err(|_|"The browser extension folder could not be created.")?;}
        let meta=std::fs::symlink_metadata(&cursor).map_err(|_|"The browser extension folder is unavailable.")?;
        #[cfg(windows)]{use std::os::windows::fs::MetadataExt;if meta.file_attributes()&0x400!=0{return Err("Linked browser extension folders are not supported.".into());}}
        if !meta.is_dir() || meta.file_type().is_symlink(){return Err("The browser extension folder is unsafe.".into());}
    }
    for name in FILES{
        let expected=std::fs::read(source.join(name)).map_err(|_|"The browser extension could not be read.")?;
        let path=target.join(name);
        if path.exists(){
            let meta=std::fs::symlink_metadata(&path).map_err(|_|"The exported extension is unavailable.")?;
            if !meta.is_file() || meta.file_type().is_symlink() || std::fs::read(&path).ok().as_deref()!=Some(expected.as_slice()){return Err("The exported extension was changed. Remove that copy and repeat setup.".into());}
        }else{
            use std::io::Write;
            let mut f=std::fs::OpenOptions::new().write(true).create_new(true).open(path).map_err(|_|"The browser extension could not be exported.")?;
            f.write_all(&expected).and_then(|_|f.sync_all()).map_err(|_|"The browser extension could not be saved.")?;
        }
    }
    Ok(target)
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn exported_extension_is_readable_verified_and_never_overwrites_changes(){
 let d=tempfile::tempdir().unwrap();let source=d.path().join("source");let data=d.path().join("profile");std::fs::create_dir(&source).unwrap();std::fs::create_dir(&data).unwrap();
 for name in FILES{std::fs::write(source.join(name),name.as_bytes()).unwrap();}
 let target=export(&data,&source,"edge").unwrap();assert!(target.starts_with(&data));assert_eq!(std::fs::read(target.join("popup.js")).unwrap(),b"popup.js");
 assert_eq!(export(&data,&source,"edge").unwrap(),target);std::fs::write(target.join("popup.js"),b"changed").unwrap();assert!(export(&data,&source,"edge").is_err());assert_eq!(std::fs::read(target.join("popup.js")).unwrap(),b"changed");
 }
}
