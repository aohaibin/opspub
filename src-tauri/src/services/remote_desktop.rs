use crate::{database::Database, error::AppError, models::Server};

fn configuration(server: &Server) -> Result<String, AppError> {
    super::server_transport::validate_host(&server.hostname)?;
    let options = &server.connection_options;
    let port = if server.protocol == "rdp" {
        server.port
    } else {
        i32::from(options.rdp_port)
    };
    if !(1..=65535).contains(&port) || server.username.chars().any(char::is_control) {
        return Err(AppError::InvalidInput("远程桌面端口或用户名无效".into()));
    }
    let host = if server.hostname.contains(':') && !server.hostname.starts_with('[') {
        format!("[{}]", server.hostname)
    } else {
        server.hostname.clone()
    };
    let mut content = format!("full address:s:{host}:{port}\r\nusername:s:{}\r\nauthentication level:i:2\r\nadministrative session:i:{}\r\n", server.username, i32::from(options.rdp_admin_session));
    match options.rdp_display_mode.as_str() {
        "system" => {}
        "fullscreen" => content.push_str("screen mode id:i:2\r\n"),
        "1920x1080" => content
            .push_str("screen mode id:i:1\r\ndesktopwidth:i:1920\r\ndesktopheight:i:1080\r\n"),
        "1440x900" => {
            content.push_str("screen mode id:i:1\r\ndesktopwidth:i:1440\r\ndesktopheight:i:900\r\n")
        }
        _ => return Err(AppError::InvalidInput("远程桌面显示方式无效".into())),
    }
    Ok(content)
}

pub fn open(db: &Database, server_id: i64) -> Result<(), AppError> {
    let server = db
        .get_server_by_id(server_id)?
        .ok_or_else(|| AppError::NotFound("服务器不存在".into()))?;
    if server.protocol != "rdp" && !server.connection_options.rdp_enabled {
        return Err(AppError::InvalidInput(
            "请先在服务器设置中启用远程桌面".into(),
        ));
    }
    let content = configuration(&server)?;
    #[cfg(windows)]
    {
        use std::io::Write;
        let mut content = content;
        if let Some(password) = super::credential::CredentialService::get(server_id)?
            .and_then(|c| c.password)
            .filter(|p| !p.is_empty())
        {
            // RDP 文件中只写当前 Windows 用户 DPAPI 加密后的密码，绝不放命令行或明文。
            content.push_str(&format!(
                "password 51:b:{}\r\nprompt for credentials:i:0\r\n",
                protect_password(&password)?
            ));
        }
        let mut file = tempfile::Builder::new()
            .prefix("opspub-rdp-")
            .suffix(".rdp")
            .tempfile()?;
        let bytes: Vec<u8> = std::iter::once(0xfeffu16)
            .chain(content.encode_utf16())
            .flat_map(u16::to_le_bytes)
            .collect();
        file.write_all(&bytes)?;
        file.flush()?;
        let mut child = std::process::Command::new("mstsc.exe")
            .arg(file.path())
            .spawn()?;
        std::thread::Builder::new()
            .name("rdp-file-cleanup".into())
            .spawn(move || {
                let _file = file;
                let _ = child.wait();
            })?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = content;
        Err(AppError::Custom(
            "一键远程桌面目前支持 Windows 客户端".into(),
        ))
    }
}

#[cfg(windows)]
fn protect_password(password: &str) -> Result<String, AppError> {
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB},
    };
    let mut bytes: Vec<u8> = password.encode_utf16().flat_map(u16::to_le_bytes).collect();
    let input = CRYPT_INTEGER_BLOB {
        cbData: bytes.len() as u32,
        pbData: bytes.as_mut_ptr(),
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    // 输入缓冲区在调用期间有效；输出由 DPAPI 分配，并用 LocalFree 配对释放。
    let ok = unsafe {
        CryptProtectData(
            &input,
            std::ptr::null(),
            std::ptr::null(),
            std::ptr::null(),
            std::ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    bytes.fill(0);
    if ok == 0 {
        return Err(AppError::Custom("Windows 无法加密远程桌面凭据".into()));
    }
    let encrypted = unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize) };
    let hex = encrypted.iter().map(|b| format!("{b:02x}")).collect();
    unsafe {
        LocalFree(output.pbData.cast());
    }
    Ok(hex)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn remote_desktop_configuration_preserves_display_ipv6_and_admin_options() {
        let db = Database::init(":memory:").expect("db");
        let request = serde_json::from_value(serde_json::json!({
            "alias": "rdp-test", "hostname": "::1", "port": 3390, "username": "DOMAIN\\Admin",
            "authType": "password", "protocol": "rdp", "osType": "windows", "group": "test",
            "tags": "[]", "aiPolicy": "disabled", "allowSudo": false,
            "useLocalProxy": false, "aiUsername": "", "connectionOptions": {
                "rdpDisplayMode": "1440x900", "rdpAdminSession": true
            }
        }))
        .expect("request");
        let mut server = crate::services::server_form::draft_server(&db, &request).expect("draft");
        let content = configuration(&server).expect("configuration");
        assert!(content.contains("full address:s:[::1]:3390\r\n"));
        assert!(content.contains("desktopwidth:i:1440\r\ndesktopheight:i:900"));
        assert!(content.contains("administrative session:i:1"));
        assert!(!content.contains("password"));
        server.username = "user\r\nredirectclipboard:i:1".into();
        assert!(configuration(&server).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn remote_desktop_password_uses_windows_dpapi_roundtrip() {
        use windows_sys::Win32::{
            Foundation::LocalFree,
            Security::Cryptography::{
                CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
            },
        };
        let password = "synthetic-密码-🔐";
        let hex = protect_password(password).expect("encrypt");
        let mut bytes: Vec<u8> = (0..hex.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).expect("hex"))
            .collect();
        let input = CRYPT_INTEGER_BLOB {
            cbData: bytes.len() as u32,
            pbData: bytes.as_mut_ptr(),
        };
        let mut output = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: std::ptr::null_mut(),
        };
        let ok = unsafe {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        assert_ne!(ok, 0);
        let recovered =
            unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
        unsafe {
            LocalFree(output.pbData.cast());
        }
        let expected: Vec<u8> = password.encode_utf16().flat_map(u16::to_le_bytes).collect();
        assert_eq!(recovered, expected);
    }
}
