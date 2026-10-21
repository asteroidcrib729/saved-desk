// This browser-launched relay has no catalog, session, or AppData access.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
#[path = "../platform.rs"]
#[allow(dead_code)]
mod platform;
fn main() {
    let allowed=std::env::args().skip(1).any(|arg|arg==platform::CHROMIUM_ORIGIN || arg==platform::FIREFOX_ID);
    if !allowed {return;}
    let result=(||->Result<serde_json::Value,String>{
        let request=platform::read_frame(&mut std::io::stdin())?;
        let command=request["command"].as_str().unwrap_or("");
        if request["protocol_version"]!=1 || !["request","authorize","connection_status","connector_probe"].contains(&command) {return Err("Unsupported connector request.".into());}
        let name=if ["connection_status","connector_probe"].contains(&command) {format!("{}-Status",platform::pipe_name()?)} else {platform::pipe_name()?};
        let mut pipe=platform::connect_at(&name,std::time::Duration::from_secs(1))?;
        platform::write_frame(&mut pipe,&request)?;let response=platform::read_frame(&mut pipe)?;
        platform::write_frame(&mut pipe,&serde_json::json!({"received":true}))?;Ok(response)
    })();
    let response=result.unwrap_or_else(|message|serde_json::json!({"ok":false,"message":message}));
    let _=platform::write_frame(&mut std::io::stdout(),&response);
}
