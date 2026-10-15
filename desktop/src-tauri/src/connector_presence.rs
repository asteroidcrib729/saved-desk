//! An authenticated native-message round trip, not registry presence, proves readiness.
use std::{path::{Path,PathBuf},time::{SystemTime,UNIX_EPOCH}};
use sha2::{Digest,Sha256};
use serde_json::{json,Value};
fn group(browser:&str)->Result<&'static str,String>{
    match browser {"edge"=>Ok("edge"),"brave"=>Ok("brave"),"firefox"=>Ok("firefox"),"chrome"|"chromium"|"vivaldi"|"chromium-family"=>Ok("chromium-family"),_=>Err("Choose a supported browser.".into())}
}
fn file(data:&Path,browser:&str)->Result<PathBuf,String>{Ok(data.join(format!("connector-presence-{}.dpapi",group(browser)?)))}
fn hash(path:&Path)->Result<String,String>{std::fs::read(path).map(|v|format!("{:x}",Sha256::digest(v))).map_err(|_|"The browser connector host could not be read.".into())}
fn now()->u64{SystemTime::now().duration_since(UNIX_EPOCH).map(|d|d.as_secs()).unwrap_or(0)}
pub fn record(data:&Path,browser:&str,version:&str,host:&Path)->Result<(),String>{
    if version!=env!("CARGO_PKG_VERSION"){return Err("Update or reload the SavedDesk browser extension from this installation, then check again.".into());}
    let value=json!({"browser":group(browser)?,"version":version,"host_sha256":hash(host)?,"checked_at":now()});
    let protected=crate::platform::crypt(&serde_json::to_vec(&value).map_err(|_|"Invalid browser check.")?,true)?;
    let target=file(data,browser)?;
    let temporary=target.with_extension(format!("{}.pending",uuid::Uuid::new_v4()));
    std::fs::write(&temporary,protected).map_err(|_|"The browser check could not be saved.")?;
    let result=std::fs::rename(&temporary,&target).map_err(|_|"The browser check could not be finalized.".into());
    if result.is_err(){let _=std::fs::remove_file(temporary);}
    result
}
pub fn verified(data:&Path,browser:&str,host:&Path)->bool{
    let result=(||->Result<bool,String>{
        let path=file(data,browser)?;
        let meta=std::fs::symlink_metadata(&path).map_err(|_|"Browser check unavailable.")?;
        if meta.len()>16384 || meta.file_type().is_symlink(){return Ok(false);}
        let bytes=crate::platform::crypt(&std::fs::read(path).map_err(|_|"Browser check unavailable.")?,false)?;
        let value:Value=serde_json::from_slice(&bytes).map_err(|_|"Invalid browser check.")?;
        let Some(checked)=value["checked_at"].as_u64() else{return Ok(false);};
        Ok(value["browser"]==group(browser)? && value["version"]==env!("CARGO_PKG_VERSION") && value["host_sha256"]==hash(host)? && checked<=now() && now().saturating_sub(checked)<300)
    })();
    result.unwrap_or(false)
}
#[cfg(test)]
mod tests{
 use super::*;
 #[test]fn unknown_and_unchecked_browsers_never_claim_ready(){let d=tempfile::tempdir().unwrap();let host=d.path().join("host.exe");std::fs::write(&host,b"host").unwrap();assert!(!verified(d.path(),"edge",&host));assert!(!verified(d.path(),"unknown",&host));}
 #[cfg(windows)]#[test]fn receipt_is_bound_to_host_version_and_browser(){let d=tempfile::tempdir().unwrap();let host=d.path().join("host.exe");std::fs::write(&host,b"one").unwrap();assert!(record(d.path(),"edge","old",&host).is_err());record(d.path(),"edge",env!("CARGO_PKG_VERSION"),&host).unwrap();assert!(verified(d.path(),"edge",&host));assert!(!verified(d.path(),"chrome",&host));std::fs::write(&host,b"two").unwrap();assert!(!verified(d.path(),"edge",&host));}
}
