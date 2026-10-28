//! Registry-free extension transport. Secrets never appear in URLs or logs.
use std::{
    collections::HashMap, io::{Read, Write}, net::{TcpListener, TcpStream},
    path::Path, sync::{Arc, Mutex, atomic::{AtomicBool, AtomicUsize, Ordering}},
    time::{Duration, Instant},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use serde_json::{json, Value};
use crate::{AppState, platform};
const CONFIG: &str = "browser-pairing.dpapi";
const LIMIT: usize = 1_048_576;
#[derive(Serialize, Deserialize)]
struct Config { port: u16, tokens: HashMap<String, String> }
struct Running { config: Config, stop: Arc<AtomicBool>, checked: Arc<Mutex<HashMap<String, Instant>>> }
impl Drop for Running { fn drop(&mut self) { self.stop.store(true, Ordering::Relaxed); } }
#[derive(Default)]
pub struct Controller(Mutex<Option<Running>>);
fn token() -> String { format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple()) }
fn valid_token(value: &str) -> bool { value.len()==64 && value.bytes().all(|b|b.is_ascii_hexdigit()) }
fn same_secret(left: &str, right: &str) -> bool {
    left.len()==right.len() && left.bytes().zip(right.bytes()).fold(0u8,|diff,(a,b)|diff|(a^b))==0
}
// RFC 2104 HMAC-SHA256. Pairing keys are exactly one SHA-256 block in ASCII.
fn proof(secret:&str,message:&str)->String {
    let mut inner=[0x36u8;64];let mut outer=[0x5cu8;64];
    for (index,byte) in secret.bytes().enumerate(){inner[index]^=byte;outer[index]^=byte;}
    let mut hash=Sha256::new();hash.update(inner);hash.update(message.as_bytes());
    let digest=hash.finalize();let mut hash=Sha256::new();hash.update(outer);hash.update(digest);
    format!("{:x}",hash.finalize())
}
fn save(path: &Path, config: &Config) -> Result<(),String> {
    let temporary=path.with_extension(format!("{}.pending",uuid::Uuid::new_v4()));
    let bytes=platform::crypt(&serde_json::to_vec(config).map_err(|_|"Pairing settings are unavailable.")?,true)?;
    let result=(|| {
        let mut file=std::fs::OpenOptions::new().write(true).create_new(true).open(&temporary).map_err(|_|"Pairing settings could not be saved.")?;
        file.write_all(&bytes).and_then(|_|file.sync_all()).map_err(|_|"Pairing settings could not be saved.")?;
        drop(file);
        std::fs::rename(&temporary,path).map_err(|_|"Pairing settings could not be saved.".into())
    })();
    if temporary.exists() {let _=std::fs::remove_file(temporary);}
    result
}
fn read_config(path: &Path) -> Result<Config,String> {
    let metadata=std::fs::symlink_metadata(path).map_err(|_|"Pairing settings are unavailable.")?;
    #[cfg(windows)] {use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes()&0x400!=0 {return Err("Linked pairing files are not supported.".into());}
    }
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len()>16384 {return Err("Pairing settings are invalid.".into());}
    let config:Config=serde_json::from_slice(&platform::crypt(&std::fs::read(path).map_err(|_|"Pairing settings are unavailable.")?,false)?).map_err(|_|"Pairing settings are invalid.")?;
    if config.port<1024 || config.tokens.len()!=6 || !["edge","chrome","brave","vivaldi","chromium","firefox"].iter().all(|b|config.tokens.get(*b).is_some_and(|t|valid_token(t))) {return Err("Pairing settings are invalid.".into());}
    Ok(config)
}
impl Controller {
    pub fn start(&self, state: &Arc<AppState>, create: bool) -> Result<(),String> {
        let mut running=self.0.lock().map_err(|_|"Browser connection unavailable.")?;
        if running.is_some() {return Ok(());}
        let path=state.database.parent().ok_or("App data unavailable.")?.join(CONFIG);
        if !path.exists() && !create {return Ok(());}
        let (listener,config)=if path.exists() {
            let config=read_config(&path)?;
            let listener=TcpListener::bind(("127.0.0.1",config.port)).map_err(|_|"The saved local connection port is busy. Close other SavedDesk instances, or remove the browser pairing and prepare it again.")?;
            (listener,config)
        } else {
            let listener=TcpListener::bind(("127.0.0.1",0)).map_err(|_|"The local browser connection could not start.")?;
            let config=Config{port:listener.local_addr().map_err(|_|"The local connection address is unavailable.")?.port(),tokens:["edge","chrome","brave","vivaldi","chromium","firefox"].into_iter().map(|b|(b.to_owned(),token())).collect()};
            save(&path,&config)?;
            (listener,config)
        };
        listener.set_nonblocking(true).map_err(|_|"The local connection could not start.")?;
        let stop=Arc::new(AtomicBool::new(false));
        let checked=Arc::new(Mutex::new(HashMap::new()));
        let active=Arc::new(AtomicUsize::new(0));
        let seen=Arc::new(Mutex::new(HashMap::new()));
        let weak=Arc::downgrade(state);
        let port=config.port;let tokens=config.tokens.clone();
        let halted=stop.clone();let receipts=checked.clone();
        std::thread::spawn(move|| {
            while !halted.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((mut stream,peer))=>{
                        if !peer.ip().is_loopback() || active.load(Ordering::Relaxed)>=8 {continue;}
                        active.fetch_add(1,Ordering::Relaxed);
                        let active=active.clone();let tokens=tokens.clone();let weak=weak.clone();let receipts=receipts.clone();let halted=halted.clone();let seen=seen.clone();
                        std::thread::spawn(move|| {
                            let authenticated=read_request(&mut stream,port,&tokens,&seen);
                            let (status,value,response_proof)=match authenticated {
                                Ok((browser,nonce,request))=>{
                                    let result=(||{
                                        if halted.load(Ordering::Relaxed) {return Err("Browser pairing was removed.".into());}
                                        let state=weak.upgrade().ok_or("SavedDesk is closed.")?;
                                        dispatch(&state,&browser,&request,&receipts)
                                    })();
                                    let value=result.unwrap_or_else(|message:String|json!({"ok":false,"message":message}));
                                    let signature=proof(&tokens[&browser],&format!("{nonce}\n{value}"));
                                    ("200 OK",value,format!("X-SavedDesk-Proof: {signature}\r\n"))
                                }
                                Err(_)=>("403 Forbidden",json!({"ok":false,"message":"The browser connection was refused. Check pairing and the pending request in SavedDesk."}),String::new()),
                            };
                            let body=value.to_string();
                            let _=write!(stream,"HTTP/1.1 {status}\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n{response_proof}Connection: close\r\nContent-Length: {}\r\n\r\n{body}",body.len());
                            active.fetch_sub(1,Ordering::Relaxed);
                        });
                    }
                    Err(e) if e.kind()==std::io::ErrorKind::WouldBlock=>std::thread::sleep(Duration::from_millis(25)),
                    Err(_)=>break,
                }
            }
        });
        *running=Some(Running{config,stop,checked});
        Ok(())
    }
    pub fn code(&self,browser:&str)->Result<String,String> {
        let guard=self.0.lock().map_err(|_|"Browser connection unavailable.")?;
        let running=guard.as_ref().ok_or("Prepare the browser connection first.")?;
        let secret=running.config.tokens.get(browser).ok_or("Choose a supported browser.")?;
        Ok(format!("SD1.{}.{}.{}",running.config.port,browser,secret))
    }
    pub fn status(&self,browser:&str)->Value {
        let guard=self.0.lock().ok();
        let running=guard.as_ref().and_then(|g|g.as_ref());
        let registered=running.is_some();
        let verified=running.is_some_and(|r|r.checked.lock().ok().and_then(|c|c.get(browser).copied()).is_some_and(|t|t.elapsed()<Duration::from_secs(300)));
        json!({"registered":registered,"verified":verified,"message":if verified {"Browser pairing checked. Start a platform connection within five minutes."} else if registered {"Pair the updated extension using the code in setup, then choose Check connection again in its toolbar popup."} else {"Prepare the browser connection and pair its updated extension. No native-host registry registration is required."}})
    }
    pub fn remove(&self,private:&Path)->Result<(),String> {
        let mut guard=self.0.lock().map_err(|_|"Browser connection unavailable.")?;
        // Delete first: a failed deletion must not silently resurrect a revoked pairing on restart.
        let path=private.join(CONFIG);
        if path.exists() {std::fs::remove_file(path).map_err(|_|"The browser pairing could not be removed.")?;}
        *guard=None;Ok(())
    }
}
fn origin_allowed(origin:&str)->bool {
    origin==platform::CHROMIUM_ORIGIN.trim_end_matches('/') ||
        origin.strip_prefix("moz-extension://").is_some_and(|id|uuid::Uuid::parse_str(id).is_ok())
}
fn read_request(stream:&mut TcpStream,port:u16,tokens:&HashMap<String,String>,seen:&Mutex<HashMap<String,Instant>>)->Result<(String,String,Value),String> {
    stream.set_read_timeout(Some(Duration::from_millis(500))).map_err(|_|"Connection unavailable.")?;
    stream.set_write_timeout(Some(Duration::from_secs(2))).map_err(|_|"Connection unavailable.")?;
    let deadline=Instant::now()+Duration::from_secs(3);
    let mut bytes=Vec::new();let mut chunk=[0u8;4096];
    let end=loop {
        if Instant::now()>deadline || bytes.len()>16384 {return Err("Invalid request headers.".into());}
        let count=stream.read(&mut chunk).map_err(|_|"Request timed out.")?;
        if count==0 {return Err("Incomplete request.".into());}
        bytes.extend_from_slice(&chunk[..count]);
        if let Some(offset)=bytes.windows(4).position(|s|s==b"\r\n\r\n") {break offset+4;}
    };
    if end>16384 {return Err("Invalid request headers.".into());}
    let header=std::str::from_utf8(&bytes[..end]).map_err(|_|"Invalid request.")?;
    let mut lines=header.split("\r\n");
    if lines.next()!=Some("POST /connector HTTP/1.1") {return Err("Unsupported endpoint.".into());}
    let mut headers=HashMap::new();
    for line in lines.filter(|s|!s.is_empty()) {
        let (name,value)=line.split_once(':').ok_or("Invalid header.")?;
        if name.is_empty() || !name.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-') || headers.insert(name.to_ascii_lowercase(),value.trim().to_owned()).is_some() {return Err("Invalid or repeated header.".into());}
    }
    if headers.get("host")!=Some(&format!("127.0.0.1:{port}")) ||
        headers.contains_key("transfer-encoding") ||
        headers.get("content-type").map(String::as_str)!=Some("application/json") ||
        headers.get("origin").is_some_and(|s|!origin_allowed(s)) {return Err("Invalid request origin or framing.".into());}
    let authorization=headers.get("authorization").and_then(|s|s.strip_prefix("SavedDesk ")).ok_or("Pairing required.")?;
    let fields:Vec<_>=authorization.split('.').collect();
    if fields.len()!=3 {return Err("Invalid authentication.".into());}
    let browser=fields[0];let nonce=fields[1];let signature=fields[2];
    let secret=tokens.get(browser).ok_or("Invalid browser.")?;
    let (timestamp,random)=nonce.split_once('-').ok_or("Invalid challenge.")?;
    let timestamp=timestamp.parse::<i64>().map_err(|_|"Invalid timestamp.")?;
    if (chrono::Utc::now().timestamp() as i128-timestamp as i128).abs()>30 ||
        random.len()!=32 || !random.bytes().all(|b|b.is_ascii_hexdigit()) || !valid_token(signature) {return Err("Expired or invalid challenge.".into());}
    let size=headers.get("content-length").and_then(|s|s.parse::<usize>().ok()).filter(|n|*n>0&&*n<=LIMIT).ok_or("Invalid payload size.")?;
    let expected=end+size;
    while bytes.len()<expected {
        if Instant::now()>deadline {return Err("Request timed out.".into());}
        let count=stream.read(&mut chunk[..4096.min(expected-bytes.len())]).map_err(|_|"Request timed out.")?;
        if count==0 {return Err("Incomplete request.".into());}
        bytes.extend_from_slice(&chunk[..count]);
    }
    if bytes.len()!=expected {return Err("Unexpected trailing request.".into());}
    let body=std::str::from_utf8(&bytes[end..]).map_err(|_|"Invalid JSON encoding.")?;
    if !same_secret(signature,&proof(secret,&format!("{nonce}\n{body}"))) {return Err("Invalid request proof.".into());}
    let value=serde_json::from_str(body).map_err(|_|"Invalid JSON.")?;
    let mut seen=seen.lock().map_err(|_|"Connection unavailable.")?;
    seen.retain(|_,created|created.elapsed()<Duration::from_secs(60));
    if seen.len()>=4096 || seen.contains_key(nonce) {return Err("Repeated challenge.".into());}
    seen.insert(nonce.into(),Instant::now());
    Ok((browser.to_owned(),nonce.to_owned(),value))
}
fn dispatch(state:&AppState,browser:&str,request:&Value,checked:&Mutex<HashMap<String,Instant>>)->Result<Value,String> {
    if request["protocol_version"]!=1 {return Err("Unsupported connector protocol.".into());}
    match request["command"].as_str() {
        Some("connector_probe")=>{
            let detected=request["browser"].as_str().unwrap_or("");
            let matches=detected==browser || detected=="chromium-family"&&["chrome","chromium","vivaldi"].contains(&browser);
            if !matches || request["extension_version"]!=env!("CARGO_PKG_VERSION") {return Err("Update or re-pair this browser extension.".into());}
            checked.lock().map_err(|_|"Connection unavailable.")?.insert(browser.into(),Instant::now());
            Ok(json!({"ok":true,"ready":true,"message":"Browser paired. Return to SavedDesk and choose a platform."}))
        }
        Some("connection_status") if request["browser"]==browser=>crate::connector_status::status(&state.database,request["source"].as_str().unwrap_or(""),browser),
        Some("request")|Some("authorize")=>{
            if !checked.lock().map_err(|_|"Connection unavailable.")?.get(browser).is_some_and(|t|t.elapsed()<Duration::from_secs(300)) {return Err("Check the extension connection first.".into());}
            if request["command"]=="authorize" && request["browser"]!=browser {return Err("Approval browser mismatch.".into());}
            let mut pipe=platform::connect_at(&platform::pipe_name()?,Duration::from_secs(1))?;
            platform::write_frame(&mut pipe,request)?;
            let response=platform::read_timed(&mut pipe,Duration::from_secs(3))?;
            platform::write_frame(&mut pipe,&json!({"received":true}))?;
            if response["ok"]==true && request["command"]=="request" && response["browser"]!=browser {return Err("Select the matching browser in SavedDesk.".into());}
            Ok(response)
        }
        _=>Err("Unsupported connector command.".into()),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn exchange(raw: impl FnOnce(u16,&str)->String)->Result<(String,String,Value),String> {
        let listener=TcpListener::bind(("127.0.0.1",0)).unwrap();let port=listener.local_addr().unwrap().port();let secret=token();
        let request=raw(port,&secret);
        let sender=std::thread::spawn(move||{let mut stream=TcpStream::connect(("127.0.0.1",port)).unwrap();stream.write_all(request.as_bytes()).unwrap();});
        let (mut stream,_)=listener.accept().unwrap();
        let result=read_request(&mut stream,port,&HashMap::from([("edge".into(),secret)]),&Mutex::new(HashMap::new()));sender.join().unwrap();result
    }
    fn request(port:u16,secret:&str,extra:&str,body:&str)->String {
        let nonce=format!("{}-{}",chrono::Utc::now().timestamp(),uuid::Uuid::new_v4().simple());
        let signature=proof(secret,&format!("{nonce}\n{body}"));
        format!("POST /connector HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: SavedDesk edge.{nonce}.{signature}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n{extra}\r\n{body}",body.len())
    }
    #[test] fn hmac_matches_known_vector_and_key_is_never_a_request_header() {
        assert_eq!(proof(&"a".repeat(64),"test"),"c5a39852c053ac4ed93c3d52ca74531989a21bdea220892581891b5a6b733f4a");
    }
    #[test] fn accepts_authenticated_loopback_json_without_cookie_disclosure() {
        let (browser,_,value)=exchange(|p,t|request(p,t,"",r#"{"command":"request"}"#)).unwrap();
        assert_eq!(browser,"edge");assert_eq!(value["command"],"request");
        assert!(valid_token(&token()));assert!(!same_secret(&token(),&token()));
    }
    #[test] fn rejects_web_origins_wrong_tokens_rebinding_and_smuggling() {
        for mutation in 0..8 {
            assert!(exchange(|p,t| {
                let base=request(p,t,"",r#"{"command":"request"}"#);
                match mutation {
                    0=>base.replace("Authorization: SavedDesk edge.","Authorization: SavedDesk chrome."),
                    1=>base.replace("Content-Type:", "Origin: https://evil.test\r\nContent-Type:"),
                    2=>base.replace(&format!("127.0.0.1:{p}"),"attacker.test"),
                    3=>base.replace("Content-Type:","Transfer-Encoding: chunked\r\nContent-Type:"),
                    4=>base.replace("Content-Type:","Content-Length: 1\r\nContent-Type:"),
                    5=>base.replace("POST /connector","GET /connector"),
                    6=>base.replace("POST /connector","POST /connector?token=secret"),
                    _=>base.replace("Content-Length: 21","Content-Length: 1048577"),
                }
            }).is_err(),"mutation {mutation}");
        }
    }
    #[test] fn repeated_challenges_and_changed_bodies_are_rejected() {
        let listener=TcpListener::bind(("127.0.0.1",0)).unwrap();let port=listener.local_addr().unwrap().port();let secret=token();
        let raw=request(port,&secret,"",r#"{"command":"request"}"#);
        let replay=raw.clone();let changed=raw.replace("request","requesx");
        let seen=Mutex::new(HashMap::new());
        for (index,raw) in [raw,replay,changed].into_iter().enumerate(){
            let sender=std::thread::spawn(move||{let mut stream=TcpStream::connect(("127.0.0.1",port)).unwrap();stream.write_all(raw.as_bytes()).unwrap();});
            let (mut stream,_)=listener.accept().unwrap();
            let result=read_request(&mut stream,port,&HashMap::from([("edge".into(),secret.clone())]),&seen);
            assert_eq!(result.is_ok(),index==0);sender.join().unwrap();
        }
    }
    #[test] fn extension_origins_are_limited_and_private_settings_are_encrypted() {
        assert!(origin_allowed(platform::CHROMIUM_ORIGIN.trim_end_matches('/')));
        assert!(origin_allowed(&format!("moz-extension://{}",uuid::Uuid::new_v4())));
        for origin in ["null","https://127.0.0.1","chrome-extension://fake","moz-extension://invalid","moz-extension://00000000-0000-0000-0000-000000000000/evil"] {assert!(!origin_allowed(origin));}
        let temp=tempfile::tempdir().unwrap();let path=temp.path().join(CONFIG);
        let config=Config{port:41000,tokens:["edge","chrome","brave","vivaldi","chromium","firefox"].into_iter().map(|b|(b.to_owned(),token())).collect()};
        save(&path,&config).unwrap();let bytes=std::fs::read(&path).unwrap();assert!(!String::from_utf8_lossy(&bytes).contains(&config.tokens["edge"]));
        assert_eq!(read_config(&path).unwrap().tokens,config.tokens);
        assert!(Controller::default().remove(temp.path()).is_ok());assert!(!path.exists());
    }
}
