use crate::{
    error::AppError,
    models::{McpClientConfig, McpClientState, McpToken},
};
use serde_json::{json, Value};
use std::{
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};

const CLIENTS: [&str; 4] = ["claude", "codex", "cursor", "opencode"];
static WRITE_LOCK: Mutex<()> = Mutex::new(());

fn invalid(message: &str) -> AppError {
    AppError::InvalidInput(message.into())
}

pub(super) fn path(home: &Path, client: &str) -> Result<PathBuf, AppError> {
    Ok(match client {
        "claude" => home.join(".claude.json"),
        "codex" => home.join(".codex/config.toml"),
        "cursor" => home.join(".cursor/mcp.json"),
        "opencode" => home.join(".config/opencode/opencode.json"),
        _ => return Err(invalid("不支持的 MCP 客户端类型")),
    })
}

pub(super) fn render(
    home: &Path,
    launcher: &Path,
    port: u16,
    id: i64,
    client: &str,
) -> Result<McpClientConfig, AppError> {
    let path = path(home, client)?;
    // 配置只包含凭据索引，stdio 子进程在本机系统凭据库读取令牌，避免令牌进入命令行和配置文件。
    let args = vec![
        "--mcp-stdio".to_string(),
        "--token-id".into(),
        id.to_string(),
        "--port".into(),
        port.to_string(),
    ];
    let (format, content) = if client == "codex" {
        let mut doc = toml_edit::DocumentMut::new();
        doc["mcp_servers"]["opspub"]["command"] =
            toml_edit::value(launcher.to_string_lossy().as_ref());
        let mut values = toml_edit::Array::new();
        for arg in &args {
            values.push(arg.as_str());
        }
        doc["mcp_servers"]["opspub"]["args"] = toml_edit::value(values);
        ("TOML", doc.to_string())
    } else {
        let value = if client == "opencode" {
            let mut command = vec![launcher.to_string_lossy().into_owned()];
            command.extend(args);
            json!({"mcp":{"opspub":{"type":"local","command":command,"enabled":true}}})
        } else {
            json!({"mcpServers":{"opspub":{"command":launcher,"args":args}}})
        };
        ("JSON", serde_json::to_string_pretty(&value)?)
    };
    Ok(McpClientConfig {
        client: client.into(),
        path: path.to_string_lossy().into_owned(),
        format: format.into(),
        content,
        backup_path: None,
    })
}

pub(super) fn merge(
    existing: &str,
    generated: &str,
    client: &str,
    format: &str,
) -> Result<String, AppError> {
    let existing = existing.trim_start_matches('\u{feff}');
    if format == "TOML" {
        let mut current = existing
            .parse::<toml_edit::DocumentMut>()
            .map_err(|_| invalid("客户端 TOML 配置无法解析，请先修复文件；原文件未修改"))?;
        let incoming = generated
            .parse::<toml_edit::DocumentMut>()
            .map_err(|_| invalid("生成的 TOML 配置无效"))?;
        if current.get("mcp_servers").is_none() {
            current["mcp_servers"] = toml_edit::Item::Table(toml_edit::Table::new());
        }
        let servers = current["mcp_servers"]
            .as_table_like_mut()
            .ok_or_else(|| invalid("mcp_servers 必须是 TOML 表"))?;
        servers.remove("opssentry");
        servers.insert("opspub", incoming["mcp_servers"]["opspub"].clone());
        return Ok(current.to_string());
    }
    let mut current: Value = serde_json::from_str(existing)
        .map_err(|_| invalid("客户端 JSON 配置无法解析，请先修复文件；原文件未修改"))?;
    let generated: Value = serde_json::from_str(generated)?;
    let key = if client == "opencode" {
        "mcp"
    } else {
        "mcpServers"
    };
    let root = current
        .as_object_mut()
        .ok_or_else(|| invalid("客户端配置根节点必须是 JSON 对象"))?;
    let servers = root
        .entry(key)
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .ok_or_else(|| invalid("MCP 配置节点必须是对象"))?;
    let node = generated
        .get(key)
        .and_then(|v| v.get("opspub"))
        .ok_or_else(|| invalid("生成的配置缺少 opspub 节点"))?;
    servers.remove("opssentry");
    servers.insert("opspub".into(), node.clone());
    Ok(serde_json::to_string_pretty(&current)? + "\n")
}

pub(super) fn write(config: &mut McpClientConfig) -> Result<(), AppError> {
    let _guard = WRITE_LOCK
        .lock()
        .map_err(|_| invalid("配置文件正在写入，请重试"))?;
    let path = Path::new(&config.path);
    let parent = path.parent().ok_or_else(|| invalid("配置文件路径无效"))?;
    std::fs::create_dir_all(parent)?;
    let old = match std::fs::read_to_string(path) {
        Ok(content) => Some(content),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(e.into()),
    };
    // 先校验并合并，再备份和替换；解析失败不会碰原文件。
    let content = match &old {
        Some(old) => merge(old, &config.content, &config.client, &config.format)?,
        None => config.content.clone(),
    };
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    temporary.write_all(content.as_bytes())?;
    temporary.as_file().sync_all()?;
    if let Some(old) = &old {
        if std::fs::read_to_string(path)? != *old {
            return Err(invalid("配置文件已被其他程序修改，请刷新后重试"));
        }
        let backup = path.with_extension(format!("bak.{}", uuid::Uuid::new_v4().simple()));
        let mut backup_file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&backup)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            backup_file.set_permissions(std::fs::Permissions::from_mode(0o600))?;
        }
        backup_file.write_all(old.as_bytes())?;
        backup_file.sync_all()?;
        config.backup_path = Some(backup.to_string_lossy().into_owned());
    } else if path.exists() {
        return Err(invalid("配置文件刚被其他程序创建，请刷新后重试"));
    }
    temporary.persist(path).map_err(|e| {
        AppError::Custom(format!("替换客户端配置失败，原文件与备份保留：{}", e.error))
    })?;
    Ok(())
}

// 检查磁盘上的实际节点，不把“已生成配置”误报成“已接入”；不返回其他客户端配置或令牌内容。
pub(super) fn inspect(
    home: &Path,
    launcher: &Path,
    port: u16,
    tokens: &[McpToken],
) -> Vec<McpClientState> {
    CLIENTS
        .into_iter()
        .map(|client| {
            let path = match path(home, client) {
                Ok(path) => path,
                Err(error) => {
                    return McpClientState {
                        client: client.into(),
                        path: String::new(),
                        state: "invalid".into(),
                        message: error.to_string(),
                        token_id: None,
                    }
                }
            };
            let mut result = McpClientState {
                client: client.into(),
                path: path.to_string_lossy().into_owned(),
                state: "unconfigured".into(),
                message: "尚未写入 OpsPub 配置".into(),
                token_id: None,
            };
            let check = (|| -> Result<(), AppError> {
                let content = match std::fs::read_to_string(&path) {
                    Ok(s) => s,
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
                    Err(e) => return Err(e.into()),
                };
                let content = content.trim_start_matches('\u{feff}');
                let (command, args, enabled) = if client == "codex" {
                    let doc = content
                        .parse::<toml_edit::DocumentMut>()
                        .map_err(|_| invalid("TOML 格式错误"))?;
                    let Some(servers) = doc.get("mcp_servers") else {
                        return Ok(());
                    };
                    if servers.as_table_like().is_none() {
                        return Err(invalid("mcp_servers 必须是 TOML 表"));
                    }
                    let Some(node) = servers.get("opspub").or_else(|| servers.get("opssentry"))
                    else {
                        return Ok(());
                    };
                    let args = node
                        .get("args")
                        .and_then(|v| v.as_array())
                        .map(|a| {
                            a.iter()
                                .filter_map(|v| v.as_str().map(str::to_owned))
                                .collect()
                        })
                        .unwrap_or_default();
                    (
                        node.get("command")
                            .and_then(|v| v.as_str())
                            .unwrap_or_default()
                            .to_string(),
                        args,
                        node.get("enabled")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(true),
                    )
                } else {
                    let doc: Value =
                        serde_json::from_str(content).map_err(|_| invalid("JSON 格式错误"))?;
                    if !doc.is_object() {
                        return Err(invalid("客户端配置必须是 JSON 对象"));
                    }
                    let key = if client == "opencode" {
                        "mcp"
                    } else {
                        "mcpServers"
                    };
                    let Some(servers) = doc.get(key) else {
                        return Ok(());
                    };
                    if !servers.is_object() {
                        return Err(invalid("MCP 配置节点必须是对象"));
                    }
                    let Some(node) = servers.get("opspub").or_else(|| servers.get("opssentry"))
                    else {
                        return Ok(());
                    };
                    if client == "opencode" {
                        let mut command = node
                            .get("command")
                            .and_then(Value::as_array)
                            .map(|a| {
                                a.iter()
                                    .filter_map(|v| v.as_str().map(str::to_owned))
                                    .collect::<Vec<_>>()
                            })
                            .unwrap_or_default();
                        let executable = if command.is_empty() {
                            String::new()
                        } else {
                            command.remove(0)
                        };
                        (
                            executable,
                            command,
                            node.get("enabled").and_then(Value::as_bool).unwrap_or(true),
                        )
                    } else {
                        (
                            node.get("command")
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .to_string(),
                            node.get("args")
                                .and_then(Value::as_array)
                                .map(|a| {
                                    a.iter()
                                        .filter_map(|v| v.as_str().map(str::to_owned))
                                        .collect()
                                })
                                .unwrap_or_default(),
                            !node
                                .get("disabled")
                                .and_then(Value::as_bool)
                                .unwrap_or(false),
                        )
                    }
                };
                result.state = "outdated".into();
                result.message = "配置与当前端点不一致，请重新注入".into();
                let argument =
                    |key: &str| args.windows(2).find(|p| p[0] == key).map(|p| p[1].as_str());
                result.token_id = argument("--token-id").and_then(|s| s.parse().ok());
                if !enabled {
                    result.message = "客户端中此 MCP 配置已禁用".into();
                    return Ok(());
                }
                if argument("--token").is_some() {
                    result.message = "旧配置含明文令牌，重新注入可改用系统凭据索引".into();
                    return Ok(());
                }
                let Some(token) = tokens.iter().find(|t| {
                    Some(t.id) == result.token_id
                        && t.status == "active"
                        && (t.client == client || t.client == "custom")
                }) else {
                    result.message = "配置中的令牌已失效或不匹配，请重新选择".into();
                    return Ok(());
                };
                if Path::new(&command) == launcher
                    && argument("--port").and_then(|s| s.parse::<u16>().ok()) == Some(port)
                    && args.iter().any(|a| a == "--mcp-stdio")
                {
                    result.state = "configured".into();
                    result.message = format!("已配置 · {}（重启客户端后加载）", token.name);
                }
                Ok(())
            })();
            if let Err(error) = check {
                result.state = "invalid".into();
                result.message = format!("配置读取失败：{error}");
            }
            result
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn invalid_existing_config_is_never_overwritten() {
        let dir = tempfile::tempdir().expect("dir");
        for client in CLIENTS {
            let mut config =
                render(dir.path(), &dir.path().join("app.exe"), 18180, 7, client).expect("render");
            let path = Path::new(&config.path);
            std::fs::create_dir_all(path.parent().expect("parent")).expect("mkdir");
            std::fs::write(path, "broken = [{").expect("old");
            assert!(write(&mut config).is_err());
            assert_eq!(
                std::fs::read_to_string(&config.path).expect("read"),
                "broken = [{"
            );
            assert!(config.backup_path.is_none());
        }
        assert!(inspect(dir.path(), Path::new("app.exe"), 18180, &[])
            .iter()
            .all(|s| s.state == "invalid"));
    }

    #[test]
    fn codex_config_preserves_windows_path_and_quoted_characters() {
        let executable = Path::new(r#"C:\Program Files\OpsPub\应用.exe"#);
        let config = render(Path::new("."), executable, 18180, 7, "codex").expect("render");
        let document = config
            .content
            .parse::<toml_edit::DocumentMut>()
            .expect("parse");
        assert_eq!(
            document["mcp_servers"]["opspub"]["command"].as_str(),
            executable.to_str()
        );
    }
    #[test]
    fn mcp_configs_roundtrip_without_plaintext_tokens_and_report_real_state() {
        let dir = tempfile::tempdir().expect("dir");
        let exe = dir.path().join("Ops Pub.exe");
        let token = McpToken {
            id: 7,
            name: "test".into(),
            client: "custom".into(),
            server_scope: "*".into(),
            tool_scope: "readonly".into(),
            status: "active".into(),
            expires_at: None,
            token_hint: "masked".into(),
            created_at: String::new(),
            revoked_at: None,
        };
        for client in CLIENTS {
            let mut config = render(dir.path(), &exe, 18190, 7, client).expect("render");
            assert!(!config.content.contains("\"--token\""));
            write(&mut config).expect("write");
            assert!(config.backup_path.is_none());
            write(&mut config).expect("replace");
            assert!(Path::new(config.backup_path.as_ref().expect("backup")).is_file());
        }
        assert!(inspect(dir.path(), &exe, 18190, &[token.clone()])
            .iter()
            .all(|c| c.state == "configured"));
        assert!(inspect(dir.path(), &exe, 18191, &[token])
            .iter()
            .all(|c| c.state == "outdated"));
        assert!(inspect(dir.path(), &exe, 18190, &[])
            .iter()
            .all(|c| c.state == "outdated"));
    }
    #[test]
    fn mcp_merge_preserves_toml_comments_other_tables_and_removes_nested_old_settings() {
        let old = "# settings\nmodel = 'custom'\n[mcp_servers.opspub]\ncommand='old'\n[mcp_servers.opspub.env]\nTOKEN='old-secret'\n[mcp_servers.other]\ncommand='keep'\n";
        let result = merge(
            old,
            "[mcp_servers.opspub]\ncommand='new'\n",
            "codex",
            "TOML",
        )
        .expect("merge");
        assert!(result.contains("# settings"));
        assert!(result.contains("command='keep'"));
        assert!(!result.contains("old-secret"));
        assert!(merge("broken {", "{}", "claude", "JSON").is_err());
        assert!(merge(
            "invalid = [",
            "[mcp_servers.opspub]\ncommand='new'",
            "codex",
            "TOML"
        )
        .is_err());
    }
}
