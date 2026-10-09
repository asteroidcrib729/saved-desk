//! Windows-only user isolation and DPAPI. This module has no renderer commands.
use std::{
    io::{Read, Write},
    path::Path,
    time::{Duration, Instant},
};
pub const MAX_PRIVATE: usize = 1024 * 1024;
pub const CHROMIUM_ORIGIN: &str = "chrome-extension://chjglnciihblkjnhnpinocknamjoecim/";
pub const FIREFOX_ID: &str = "saveddesk@local.app";
pub fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(Some(0)).collect()
}
pub fn shell_path(path: &Path) -> String {
    let value = path.to_string_lossy();
    if let Some(rest) = value.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{}", rest)
    } else {
        value.strip_prefix(r"\\?\").unwrap_or(&value).to_string()
    }
}

#[cfg(windows)]
pub fn sid() -> Result<String, String> {
    use windows_sys::Win32::{
        Foundation::*, Security::Authorization::ConvertSidToStringSidW, Security::*,
        System::Threading::*,
    };
    unsafe {
        let mut token = std::ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return Err("Windows user identity is unavailable.".into());
        }
        let mut size = 0;
        GetTokenInformation(token, TokenUser, std::ptr::null_mut(), 0, &mut size);
        let mut buffer = vec![0u8; size as usize];
        let okay = GetTokenInformation(
            token,
            TokenUser,
            buffer.as_mut_ptr().cast(),
            size,
            &mut size,
        );
        CloseHandle(token);
        if okay == 0 {
            return Err("Windows user identity could not be read.".into());
        }
        let user = &*(buffer.as_ptr() as *const TOKEN_USER);
        let mut text = std::ptr::null_mut();
        if ConvertSidToStringSidW(user.User.Sid, &mut text) == 0 {
            return Err("Windows user identity is invalid.".into());
        }
        let mut len = 0;
        while *text.add(len) != 0 {
            len += 1;
        }
        let value = String::from_utf16_lossy(std::slice::from_raw_parts(text, len));
        LocalFree(text.cast());
        Ok(value)
    }
}
#[cfg(not(windows))]
pub fn sid() -> Result<String, String> {
    Err("Browser connection requires Windows.".into())
}
pub fn pipe_name() -> Result<String, String> {
    let mut name = format!(r"\\.\pipe\SavedDesk-{}", sid()?);
    #[cfg(debug_assertions)]
    if let Ok(suffix) = std::env::var("SAVEDDESK_TEST_PIPE_SUFFIX") {
        if suffix.len() > 80
            || !suffix
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-')
        {
            return Err("Invalid test channel suffix.".into());
        }
        name.push('-');
        name.push_str(&suffix);
    }
    Ok(name)
}

#[cfg(windows)]
pub fn crypt(bytes: &[u8], encrypt: bool) -> Result<Vec<u8>, String> {
    use windows_sys::Win32::{Foundation::LocalFree, Security::Cryptography::*};
    if bytes.len() > MAX_PRIVATE {
        return Err("Session payload is too large.".into());
    }
    unsafe {
        let input = CRYPT_INTEGER_BLOB {
            cbData: bytes.len() as u32,
            pbData: bytes.as_ptr() as *mut u8,
        };
        let mut output: CRYPT_INTEGER_BLOB = std::mem::zeroed();
        let okay = if encrypt {
            CryptProtectData(
                &input,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null_mut(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                std::ptr::null(),
                std::ptr::null_mut(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if okay == 0 {
            return Err(
                "The saved browser session cannot be unlocked. Reconnect this account.".into(),
            );
        }
        let value = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        LocalFree(output.pbData.cast());
        Ok(value)
    }
}
#[cfg(not(windows))]
pub fn crypt(_: &[u8], _: bool) -> Result<Vec<u8>, String> {
    Err("Protected sessions require Windows.".into())
}

pub fn write_frame(output: &mut impl Write, value: &serde_json::Value) -> Result<(), String> {
    let payload = serde_json::to_vec(value).map_err(|_| "Invalid connector response.")?;
    if payload.len() > MAX_PRIVATE {
        return Err("Connector response is too large.".into());
    }
    output
        .write_all(&(payload.len() as u32).to_le_bytes())
        .and_then(|_| output.write_all(&payload))
        .and_then(|_| output.flush())
        .map_err(|_| "Browser connector closed.".into())
}
#[allow(dead_code)] // Also compiled into the standalone native-messaging host.
pub fn read_frame(input: &mut impl Read) -> Result<serde_json::Value, String> {
    let mut length = [0; 4];
    input
        .read_exact(&mut length)
        .map_err(|_| "Browser connector closed.")?;
    let size = u32::from_le_bytes(length) as usize;
    if size == 0 || size > MAX_PRIVATE {
        return Err("Invalid connector payload size.".into());
    }
    let mut bytes = vec![0; size];
    input
        .read_exact(&mut bytes)
        .map_err(|_| "Incomplete connector message.")?;
    serde_json::from_slice(&bytes).map_err(|_| "Invalid connector message.".into())
}

#[cfg(windows)]
pub fn server() -> Result<std::fs::File, String> {
    server_at(&pipe_name()?)
}
#[cfg(windows)]
fn server_at(name: &str) -> Result<std::fs::File, String> {
    use std::os::windows::io::FromRawHandle;
    use windows_sys::Win32::{
        Foundation::*,
        Security::{Authorization::*, SECURITY_ATTRIBUTES},
        Storage::FileSystem::*,
        System::Pipes::*,
    };
    unsafe {
        let mut descriptor = std::ptr::null_mut();
        let sddl = wide(&format!("D:P(A;;GA;;;SY)(A;;GA;;;{})", sid()?));
        if ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl.as_ptr(),
            SDDL_REVISION_1,
            &mut descriptor,
            std::ptr::null_mut(),
        ) == 0
        {
            return Err("Browser channel permissions could not be set.".into());
        }
        let security = SECURITY_ATTRIBUTES {
            nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: descriptor,
            bInheritHandle: 0,
        };
        let handle = CreateNamedPipeW(
            wide(name).as_ptr(),
            PIPE_ACCESS_DUPLEX | FILE_FLAG_FIRST_PIPE_INSTANCE,
            PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_NOWAIT | PIPE_REJECT_REMOTE_CLIENTS,
            1,
            MAX_PRIVATE as u32,
            MAX_PRIVATE as u32,
            0,
            &security,
        );
        LocalFree(descriptor);
        if handle == INVALID_HANDLE_VALUE {
            return Err("Another account connection is active. Cancel it first.".into());
        }
        Ok(std::fs::File::from_raw_handle(handle))
    }
}
#[cfg(windows)]
pub fn accept(file: &std::fs::File) -> bool {
    use std::os::windows::io::AsRawHandle;
    unsafe {
        // In NOWAIT mode a nonzero first call means "listening", not connected.
        let connected = windows_sys::Win32::System::Pipes::ConnectNamedPipe(
            file.as_raw_handle(),
            std::ptr::null_mut(),
        );
        connected == 0
            && windows_sys::Win32::Foundation::GetLastError()
                == windows_sys::Win32::Foundation::ERROR_PIPE_CONNECTED
    }
}
pub fn connect() -> Result<std::fs::File, String> {
    connect_at(&pipe_name()?, Duration::from_secs(1))
}
fn connect_at(name: &str, timeout: Duration) -> Result<std::fs::File, String> {
    let deadline=Instant::now()+timeout;
    loop {
        match std::fs::OpenOptions::new().read(true).write(true).open(name) {
            Ok(pipe)=>return Ok(pipe),
            Err(error) if matches!(error.raw_os_error(),Some(2|231)) && Instant::now()<deadline=>std::thread::sleep(Duration::from_millis(20)),
            Err(_)=>return Err("Open SavedDesk and click Connect for this platform first.".into()),
        }
    }
}

pub fn read_timed(
    file: &mut std::fs::File,
    timeout: Duration,
) -> Result<serde_json::Value, String> {
    let end = Instant::now() + timeout;
    let mut bytes = Vec::new();
    let mut expected = 4;
    loop {
        let mut chunk = vec![0u8; (expected - bytes.len()).min(16384)];
        // std::fs::File maps Windows ERROR_NO_DATA to EOF for pipes. Preserve
        // that code here so a not-yet-written frame is retried rather than closed.
        #[cfg(windows)]
        let read = unsafe {
            use std::os::windows::io::AsRawHandle;
            let mut size = 0;
            if windows_sys::Win32::Storage::FileSystem::ReadFile(
                file.as_raw_handle(),
                chunk.as_mut_ptr(),
                chunk.len() as u32,
                &mut size,
                std::ptr::null_mut(),
            ) == 0
            {
                Err(std::io::Error::last_os_error())
            } else {
                Ok(size as usize)
            }
        };
        #[cfg(not(windows))]
        let read = file.read(&mut chunk);
        match read {
            Ok(0) => return Err("Browser connector closed.".into()),
            Ok(size) => bytes.extend_from_slice(&chunk[..size]),
            Err(error) if error.raw_os_error() == Some(232) => {
                std::thread::sleep(Duration::from_millis(20))
            }
            Err(_) => return Err("Browser connector closed.".into()),
        }
        if bytes.len() == 4 && expected == 4 {
            let size = u32::from_le_bytes(bytes[..4].try_into().unwrap()) as usize;
            if size == 0 || size > MAX_PRIVATE {
                return Err("Invalid browser payload size.".into());
            }
            expected = size + 4;
        }
        if bytes.len() == expected {
            return serde_json::from_slice(&bytes[4..])
                .map_err(|_| "Invalid browser message.".into());
        }
        if Instant::now() >= end {
            return Err("Browser authorization timed out. Try again.".into());
        }
    }
}

#[cfg(windows)]
pub fn register(manifest: &Path, browser: &str) -> Result<(), String> {
    use windows_sys::Win32::{Foundation::*, System::Registry::*};
    let prefix = match browser {
        "edge" => "Microsoft\\Edge",
        "chrome" => "Google\\Chrome",
        "brave" => "BraveSoftware\\Brave-Browser",
        "vivaldi" => "Vivaldi",
        "chromium" => "Chromium",
        "firefox" => "Mozilla",
        _ => return Err("Choose a supported browser.".into()),
    };
    unsafe {
        let mut key = std::ptr::null_mut();
        if RegCreateKeyExW(
            HKEY_CURRENT_USER,
            wide(&format!(
                "Software\\{prefix}\\NativeMessagingHosts\\com.saveddesk.connector"
            ))
            .as_ptr(),
            0,
            std::ptr::null(),
            0,
            KEY_SET_VALUE,
            std::ptr::null(),
            &mut key,
            std::ptr::null_mut(),
        ) != ERROR_SUCCESS
        {
            return Err("Browser connector registration failed.".into());
        }
        let value = wide(&shell_path(manifest));
        let result = RegSetValueExW(
            key,
            std::ptr::null(),
            0,
            REG_SZ,
            value.as_ptr().cast(),
            (value.len() * 2) as u32,
        );
        RegCloseKey(key);
        if result != ERROR_SUCCESS {
            return Err("Browser connector registration failed.".into());
        }
        Ok(())
    }
}

pub fn browser_user_agent(value: Option<&serde_json::Value>) -> Result<Option<String>, String> {
    let Some(value) = value else {
        return Ok(None);
    };
    let text = value.as_str().ok_or(
        "The browser returned an invalid client identity. Reload the connector and connect again.",
    )?;
    if text.is_empty() || text.len() > 512 || !text.bytes().all(|c| (32..=126).contains(&c)) {
        return Err("The browser returned an invalid client identity. Reload the connector and connect again.".into());
    }
    Ok(Some(text.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn browser_identity_rejects_header_injection_and_unbounded_payloads() {
        assert_eq!(browser_user_agent(None).unwrap(), None);
        assert_eq!(
            browser_user_agent(Some(&serde_json::json!("Chrome/154"))).unwrap(),
            Some("Chrome/154".into())
        );
        for value in [
            serde_json::json!(""),
            serde_json::json!("private-secret\r\nInjected: value"),
            serde_json::json!("x".repeat(513)),
            serde_json::json!(42),
            serde_json::Value::Null,
        ] {
            let message = browser_user_agent(Some(&value)).unwrap_err();
            assert!(!message.contains("private-secret"));
        }
    }
    #[test]
    fn browser_registration_paths_use_standard_windows_syntax() {
        assert_eq!(
            shell_path(Path::new(r"\\?\C:\Saved Desk\host.exe")),
            r"C:\Saved Desk\host.exe"
        );
        assert_eq!(
            shell_path(Path::new(r"\\?\UNC\server\share\host.exe")),
            r"\\server\share\host.exe"
        );
        assert_eq!(
            shell_path(Path::new(r"C:\Saved Desk\host.exe")),
            r"C:\Saved Desk\host.exe"
        );
    }
    #[cfg(windows)]
    #[test]
    fn local_connector_waits_for_a_delayed_handoff_without_resubmitting() {
        let name=format!(r"\\.\pipe\SavedDesk-test-{}",uuid::Uuid::new_v4());
        let published=name.clone();
        let server_thread=std::thread::spawn(move||{
            std::thread::sleep(Duration::from_millis(100));
            let mut server=server_at(&published).unwrap();
            let end=Instant::now()+Duration::from_secs(2);
            while !accept(&server) {assert!(Instant::now()<end);std::thread::sleep(Duration::from_millis(10));}
            let value=read_timed(&mut server,Duration::from_secs(1)).unwrap();
            assert_eq!(value["command"],"authorize");
        });
        let mut pipe=connect_at(&name,Duration::from_secs(1)).unwrap();
        write_frame(&mut pipe,&serde_json::json!({"command":"authorize"})).unwrap();
        server_thread.join().unwrap();
        let missing=format!(r"\\.\pipe\SavedDesk-test-{}",uuid::Uuid::new_v4());
        assert!(connect_at(&missing,Duration::from_millis(40)).is_err());
    }
    #[test]
    fn frames_reject_oversized_and_truncated_payloads() {
        assert!(read_frame(&mut std::io::Cursor::new(
            (MAX_PRIVATE as u32 + 1).to_le_bytes()
        ))
        .is_err());
        assert!(read_frame(&mut std::io::Cursor::new(vec![5, 0, 0, 0, 123])).is_err());
        let value = serde_json::json!({"protocol_version":1,"command":"request"});
        let mut bytes = Vec::new();
        write_frame(&mut bytes, &value).unwrap();
        assert_eq!(read_frame(&mut std::io::Cursor::new(bytes)).unwrap(), value);
    }
    #[cfg(windows)]
    #[test]
    fn dpapi_protects_and_roundtrips_for_current_user() {
        let value = b"synthetic-session-only";
        let protected = crypt(value, true).unwrap();
        assert_ne!(protected, value);
        assert_eq!(crypt(&protected, false).unwrap(), value);
        assert!(crypt(b"not-dpapi", false).is_err());
    }
    #[cfg(windows)]
    #[test]
    fn named_pipe_waits_for_client_and_delayed_frames_without_false_eof() {
        let name = format!(r"\\.\pipe\SavedDesk-test-{}", uuid::Uuid::new_v4());
        let mut server = server_at(&name).unwrap();
        assert!(!accept(&server));
        let client = std::thread::spawn(move || {
            let mut pipe = std::fs::OpenOptions::new()
                .read(true)
                .write(true)
                .open(name)
                .unwrap();
            std::thread::sleep(Duration::from_millis(200));
            write_frame(&mut pipe, &serde_json::json!({"request":"synthetic"})).unwrap();
            let response = read_frame(&mut pipe).unwrap();
            write_frame(&mut pipe, &serde_json::json!({"received":true})).unwrap();
            response
        });
        let deadline = Instant::now() + Duration::from_secs(3);
        while !accept(&server) {
            assert!(Instant::now() < deadline);
            std::thread::sleep(Duration::from_millis(10));
        }
        let value = read_timed(&mut server, Duration::from_secs(3)).unwrap();
        assert_eq!(value["request"], "synthetic");
        write_frame(&mut server, &serde_json::json!({"ok":true})).unwrap();
        assert_eq!(
            read_timed(&mut server, Duration::from_secs(3)).unwrap()["received"],
            true
        );
        assert_eq!(client.join().unwrap()["ok"], true);
    }
}

// Read only our selected-browser registration; never read another manifest or session.
#[cfg(windows)]
pub fn connector_registered(browser: &str, manifest: &Path, host: &Path) -> bool {
    use windows_sys::Win32::{Foundation::ERROR_SUCCESS, System::Registry::*};
    let prefix = match browser {
        "edge" => r"Microsoft\Edge",
        "chrome" => r"Google\Chrome",
        "brave" => r"BraveSoftware\Brave-Browser",
        "vivaldi" => "Vivaldi",
        "chromium" => "Chromium",
        _ => return false,
    };
    let key = wide(&format!(
        r"Software\{prefix}\NativeMessagingHosts\com.saveddesk.connector"
    ));
    let mut value = vec![0u16; 32768];
    let mut bytes = (value.len() * 2) as u32;
    let result = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            key.as_ptr(),
            std::ptr::null(),
            RRF_RT_REG_SZ,
            std::ptr::null_mut(),
            value.as_mut_ptr().cast(),
            &mut bytes,
        )
    };
    if result != ERROR_SUCCESS || bytes < 2 || bytes % 2 != 0 || bytes as usize > value.len() * 2 {
        return false;
    }
    let count = bytes as usize / 2;
    if value[count - 1] != 0 {
        return false;
    }
    let Ok(path) = String::from_utf16(&value[..count - 1]) else {
        return false;
    };
    let Ok(expected) = manifest.canonicalize() else {
        return false;
    };
    if Path::new(&path).canonicalize().ok().as_ref() != Some(&expected) {
        return false;
    }
    let Ok(file) = std::fs::File::open(&expected) else {
        return false;
    };
    let mut buffer = Vec::new();
    if file.take(16385).read_to_end(&mut buffer).is_err() || buffer.len() > 16384 {
        return false;
    }
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(&buffer) else {
        return false;
    };
    let registered_host = value["path"]
        .as_str()
        .and_then(|v| Path::new(v).canonicalize().ok());
    value["name"] == "com.saveddesk.connector"
        && value["type"] == "stdio"
        && value["allowed_origins"] == serde_json::json!([CHROMIUM_ORIGIN])
        && host
            .canonicalize()
            .ok()
            .is_some_and(|expected| registered_host == Some(expected))
}
#[cfg(not(windows))]
pub fn connector_registered(_browser: &str, _manifest: &Path, _host: &Path) -> bool {
    false
}
