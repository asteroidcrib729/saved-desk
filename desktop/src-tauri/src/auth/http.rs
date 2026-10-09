//! Platform TLS validation; fixed HTTPS endpoints, bounded responses, no redirects.
use crate::catalog::Result;
pub trait Http: Send + Sync {
    fn request(
        &self,
        url: &str,
        form: Option<&str>,
        bearer: Option<&str>,
    ) -> Result<(u32, Vec<u8>)>;
}
pub struct WindowsHttp;
#[cfg(windows)]
impl Http for WindowsHttp {
    fn request(
        &self,
        url: &str,
        form: Option<&str>,
        bearer: Option<&str>,
    ) -> Result<(u32, Vec<u8>)> {
        use std::{ffi::c_void, ptr};
        use windows_sys::Win32::Networking::WinHttp::*;
        struct Handle(*mut c_void);
        impl Drop for Handle {
            fn drop(&mut self) {
                unsafe {
                    WinHttpCloseHandle(self.0);
                }
            }
        }
        fn handle(p: *mut c_void) -> Result<Handle> {
            if p.is_null() {
                Err("The account service could not be reached.".into())
            } else {
                Ok(Handle(p))
            }
        }
        let parsed = url::Url::parse(url).map_err(|_| "Invalid account endpoint.")?;
        if !matches!(
            url,
            "https://oauth2.googleapis.com/token"
                | "https://oauth2.googleapis.com/revoke"
                | "https://openidconnect.googleapis.com/v1/userinfo"
        ) {
            return Err("Unapproved account endpoint.".into());
        }
        unsafe {
            let session = handle(WinHttpOpen(
                crate::platform::wide("SavedDesk account sign-in").as_ptr(),
                WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
                ptr::null(),
                ptr::null(),
                0,
            ))?;
            if WinHttpSetTimeouts(session.0, 5000, 5000, 10000, 10000) == 0 {
                return Err("Account timeouts could not be set.".into());
            }
            let connection = handle(WinHttpConnect(
                session.0,
                crate::platform::wide(parsed.host_str().ok_or("Invalid account host.")?).as_ptr(),
                443,
                0,
            ))?;
            let method = crate::platform::wide(if form.is_some() { "POST" } else { "GET" });
            let request = handle(WinHttpOpenRequest(
                connection.0,
                method.as_ptr(),
                crate::platform::wide(parsed.path()).as_ptr(),
                ptr::null(),
                ptr::null(),
                ptr::null(),
                WINHTTP_FLAG_SECURE,
            ))?;
            let disable = WINHTTP_DISABLE_REDIRECTS;
            if WinHttpSetOption(
                request.0,
                WINHTTP_OPTION_DISABLE_FEATURE,
                (&disable as *const u32).cast(),
                4,
            ) == 0
            {
                return Err("Account safety could not be configured.".into());
            }
            let mut headers = String::from("Accept: application/json\r\n");
            if form.is_some() {
                headers.push_str("Content-Type: application/x-www-form-urlencoded\r\n");
            }
            if let Some(token) = bearer {
                if token.len() > 16384 || token.contains(['\r', '\n']) {
                    return Err("The account credential is invalid.".into());
                }
                headers.push_str(&format!("Authorization: Bearer {token}\r\n"));
            }
            let headers = crate::platform::wide(&headers);
            let body = form.unwrap_or("").as_bytes();
            if WinHttpSendRequest(
                request.0,
                headers.as_ptr(),
                u32::MAX,
                if body.is_empty() {
                    ptr::null()
                } else {
                    body.as_ptr().cast()
                },
                body.len() as u32,
                body.len() as u32,
                0,
            ) == 0
                || WinHttpReceiveResponse(request.0, ptr::null_mut()) == 0
            {
                return Err("The account service did not respond. Try again.".into());
            }
            let mut status = 0u32;
            let mut size = 4u32;
            if WinHttpQueryHeaders(
                request.0,
                WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                ptr::null(),
                (&mut status as *mut u32).cast(),
                &mut size,
                ptr::null_mut(),
            ) == 0
            {
                return Err("The account response is invalid.".into());
            }
            let mut bytes = Vec::new();
            loop {
                let mut buffer = [0u8; 4096];
                let mut count = 0;
                if WinHttpReadData(request.0, buffer.as_mut_ptr().cast(), 4096, &mut count) == 0 {
                    return Err("The account response was interrupted.".into());
                }
                if count == 0 {
                    break;
                }
                if bytes.len() + count as usize > 65536 {
                    return Err("The account response is too large.".into());
                }
                bytes.extend_from_slice(&buffer[..count as usize]);
            }
            Ok((status, bytes))
        }
    }
}
#[cfg(not(windows))]
impl Http for WindowsHttp {
    fn request(&self, _: &str, _: Option<&str>, _: Option<&str>) -> Result<(u32, Vec<u8>)> {
        Err("Account sign-in requires Windows.".into())
    }
}
