use super::finalshell::decode_password;
use crate::{
    error::AppError,
    models::server_import::{ImportServerRow, ImportSource},
    services::server::ServerService,
};
use calamine::{Reader, Xlsx};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{collections::HashSet, io::Cursor, path::Path};

const MAX_FILE: u64 = 20 * 1024 * 1024;
const MAX_ROWS: usize = 5000;

// 此类型不实现 Debug/Serialize，避免密码随日志或预览响应流出 Rust。
pub(super) struct Entry {
    pub row: ImportServerRow,
    pub password: Option<String>,
}

pub(super) struct Parsed {
    pub entries: Vec<Entry>,
    pub warnings: Vec<String>,
    pub digest: Vec<u8>,
}

fn invalid(message: &str) -> AppError {
    AppError::InvalidInput(message.into())
}

fn read_limited(path: &Path) -> Result<Vec<u8>, AppError> {
    let info = std::fs::symlink_metadata(path)?;
    if info.file_type().is_symlink() || !info.is_file() || info.len() > MAX_FILE {
        return Err(invalid("请选择不超过 20 MB 的普通文件，不支持符号链接"));
    }
    use std::io::Read;
    let mut data = Vec::new();
    std::fs::File::open(path)?
        .take(MAX_FILE + 1)
        .read_to_end(&mut data)?;
    if data.len() as u64 > MAX_FILE {
        return Err(invalid("文件超过 20 MB 限制"));
    }
    Ok(data)
}

fn decode_text(bytes: &[u8]) -> Result<String, AppError> {
    if let Ok(s) = std::str::from_utf8(bytes) {
        return Ok(s.trim_start_matches('\u{feff}').into());
    }
    let (text, _, errors) = encoding_rs::GBK.decode(bytes);
    if errors {
        return Err(invalid("无法识别文件编码，请另存为 UTF-8 后导入"));
    }
    Ok(text.into_owned())
}

fn new_entry() -> Entry {
    Entry {
        row: ImportServerRow {
            index: 0,
            alias: String::new(),
            hostname: String::new(),
            port: 22,
            username: String::new(),
            group: "默认".into(),
            tags: vec![],
            os_type: "linux".into(),
            protocol: "ssh".into(),
            auth_type: "password".into(),
            has_password: false,
            error: None,
            warning: None,
        },
        password: None,
    }
}

fn connection_type(value: &str, row: &mut ImportServerRow) {
    match value.trim().to_lowercase().as_str() {
        "" | "ssh" | "linux" | "linux ssh" => {}
        "windows" | "win" | "windows ssh" | "win-ssh" => row.os_type = "windows".into(),
        "rdp" | "远程桌面" | "仅远程桌面" | "windows rdp" => {
            row.os_type = "windows".into();
            row.protocol = "rdp".into();
            row.port = 3389;
        }
        _ => row.error = Some("类型必须为 Linux / Windows / RDP".into()),
    }
}

fn port(raw: &str, row: &mut ImportServerRow) {
    if raw.trim().is_empty() {
        return;
    }
    match raw.trim().parse::<i32>() {
        Ok(value) if (1..=65535).contains(&value) => row.port = value,
        _ => row.error = Some("端口必须是 1–65535 的整数".into()),
    }
}

fn header(value: &str) -> String {
    let normalized = value
        .trim()
        .trim_start_matches('\u{feff}')
        .to_lowercase()
        .replace(['_', ' ', '-'], "");
    match normalized.as_str() {
        "别名" | "名称" | "连接名称" | "alias" | "name" => "alias",
        "主机" | "主机地址" | "ip" | "地址" | "host" | "hostname" => "host",
        "端口" | "port" => "port",
        "用户名" | "用户" | "username" | "user" => "user",
        "密码" | "password" | "pass" => "password",
        "分组" | "group" => "group",
        "标签" | "tags" | "tag" => "tags",
        "类型" | "type" | "协议" | "protocol" | "os" => "type",
        _ => "",
    }
    .into()
}

pub(super) fn table_rows(rows: Vec<Vec<String>>) -> Result<Vec<Entry>, AppError> {
    let first = rows
        .iter()
        .position(|row| row.iter().any(|s| !s.trim().is_empty()))
        .ok_or_else(|| invalid("表格为空，请先填写服务器清单"))?;
    let columns: Vec<_> = rows[first].iter().map(|s| header(s)).collect();
    for required in ["host", "user"] {
        if !columns.iter().any(|s| s == required) {
            return Err(invalid("表头缺少主机或用户名列，请参考模板"));
        }
    }
    let mut names = HashSet::new();
    if columns
        .iter()
        .filter(|s| !s.is_empty())
        .any(|s| !names.insert(s))
    {
        return Err(invalid("表头中存在重复含义的列，请保留一列后重试"));
    }
    let mut entries = vec![];
    for cells in rows.into_iter().skip(first + 1) {
        if cells.iter().all(|v| v.trim().is_empty()) {
            continue;
        }
        if entries.len() >= MAX_ROWS {
            return Err(invalid("单次最多导入 5000 台，请拆分文件"));
        }
        let get = |key: &str| {
            columns
                .iter()
                .position(|s| s == key)
                .and_then(|i| cells.get(i))
                .map(String::as_str)
                .unwrap_or("")
        };
        let mut item = new_entry();
        connection_type(get("type"), &mut item.row);
        port(get("port"), &mut item.row);
        item.row.hostname = get("host").trim().into();
        item.row.username = get("user").trim().into();
        item.row.alias = get("alias").trim().into();
        if !get("group").trim().is_empty() {
            item.row.group = get("group").trim().replace('\\', "/");
        }
        item.row.tags = get("tags")
            .split([';', '；'])
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
            .collect();
        // 密码保留首尾空格；不要像普通文本列那样 trim 后破坏真实凭据。
        if !get("password").is_empty() {
            item.password = Some(get("password").into());
        }
        entries.push(item);
    }
    Ok(entries)
}

pub(super) fn csv_rows(bytes: &[u8]) -> Result<Vec<Entry>, AppError> {
    let text = decode_text(bytes)?;
    let delimiter = if text.lines().next().unwrap_or("").contains('\t') {
        b'\t'
    } else {
        b','
    };
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(false)
        .delimiter(delimiter)
        .from_reader(text.as_bytes());
    let mut rows = vec![];
    for result in reader.records() {
        // 不回传底层解析错误中的原始单元格，里面可能是密码。
        let record =
            result.map_err(|_| invalid("CSV 列数或引号格式错误，请使用模板并保存为 CSV"))?;
        rows.push(record.iter().map(str::to_owned).collect());
        if rows.len() > MAX_ROWS + 1 {
            return Err(invalid("单次最多读取 5000 行服务器"));
        }
    }
    table_rows(rows)
}

fn json_text(value: &Value, keys: &[&str]) -> String {
    for key in keys {
        if let Some(v) = value.get(*key) {
            if let Some(s) = v.as_str() {
                return s.into();
            }
            if v.is_number() {
                return v.to_string();
            }
        }
    }
    String::new()
}

fn finalshell_entry(value: &Value, group: &str) -> Option<Entry> {
    let host = json_text(value, &["host", "hostname"]);
    if host.is_empty() {
        return None;
    } // 文件夹配置、布局配置不属于连接。
    let mut entry = new_entry();
    // FinalShell 导出格式沿用拼写 conection_type：100 为 SSH，101 为 RDP。
    let kind = json_text(
        value,
        &["conection_type", "connection_type", "type", "protocol"],
    );
    match kind.to_lowercase().as_str() {
        "101" | "2" | "rdp" => connection_type("rdp", &mut entry.row),
        "100" | "" | "1" | "ssh" => {}
        _ => entry.row.error = Some("此 FinalShell 连接类型暂不支持，仅支持 SSH 和 RDP".into()),
    }
    entry.row.alias = json_text(value, &["name", "alias"]).trim().into();
    entry.row.hostname = host.trim().into();
    entry.row.username = json_text(value, &["user_name", "username", "user"])
        .trim()
        .into();
    entry.row.group = group.into();
    port(&json_text(value, &["port"]), &mut entry.row);
    let encrypted = json_text(value, &["password"]);
    if !encrypted.is_empty() {
        match decode_password(&encrypted) {
            Ok(password) => entry.password = Some(password),
            Err(_) => {
                entry.row.warning =
                    Some("该版本的密码格式无法解析，将只导入连接信息，请在导入后补充凭据".into())
            }
        }
    }
    let key_id = json_text(value, &["secret_key_id"]);
    // 某些导出版本用 0 / -1 表示未选择私钥，不能因此丢弃密码认证信息。
    let has_key_id = !matches!(key_id.trim(), "" | "0" | "-1");
    let has_key_path = ["private_key_path", "key_path"]
        .iter()
        .any(|key| !json_text(value, &[*key]).trim().is_empty());
    if entry.row.protocol == "ssh"
        && (json_text(value, &["authentication_type"]) == "2" || has_key_id || has_key_path)
    {
        entry.row.auth_type = "key".into();
        entry.password = None;
        entry.row.warning = Some("私钥文件不会读取或复制，请导入后设置私钥路径及口令".into());
    }
    if value.get("proxy_enable").and_then(Value::as_bool) == Some(true) {
        entry.row.warning = Some("此条目使用代理，请导入后核对跳板机配置及凭据".into());
    }
    Some(entry)
}

fn scan_folder(
    root: &Path,
    directory: &Path,
    depth: usize,
    digest: &mut Sha256,
    entries: &mut Vec<Entry>,
    warnings: &mut Vec<String>,
    count: &mut usize,
    bytes: &mut u64,
) -> Result<(), AppError> {
    if depth > 16 {
        return Err(invalid(
            "文件夹层级超过 16 层，请选择 FinalShell 的连接导出目录",
        ));
    }
    let mut files = std::fs::read_dir(directory)?.collect::<Result<Vec<_>, _>>()?;
    files.sort_by_key(|item| item.file_name());
    for file in files {
        *count += 1;
        if *count > 10000 {
            return Err(invalid("目录条目过多，请选择 FinalShell 连接导出目录"));
        }
        let kind = file.file_type()?;
        if kind.is_symlink() {
            continue;
        }
        if kind.is_dir() {
            scan_folder(
                root,
                &file.path(),
                depth + 1,
                digest,
                entries,
                warnings,
                count,
                bytes,
            )?;
            continue;
        }
        let path = file.path();
        if path
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| !s.eq_ignore_ascii_case("json"))
            .unwrap_or(true)
        {
            continue;
        }
        let data = read_limited(&path)?;
        *bytes += data.len() as u64;
        if *bytes > 50 * 1024 * 1024 {
            return Err(invalid("导出目录超过 50 MB，请拆分后导入"));
        }
        digest.update(
            path.strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .as_bytes(),
        );
        digest.update(&data);
        // Windows 编辑器可能为导出 JSON 添加 UTF-8 BOM，不能把有效连接误判为坏文件。
        let json = data.strip_prefix(b"\xef\xbb\xbf").unwrap_or(&data);
        let value: Value = match serde_json::from_slice(json) {
            Ok(value) => value,
            Err(_) => {
                warnings.push(format!(
                    "已跳过无法解析的 JSON 文件：{}",
                    path.strip_prefix(root).unwrap_or(&path).to_string_lossy()
                ));
                continue;
            }
        };
        let relative = directory
            .strip_prefix(root)
            .unwrap_or(directory)
            .to_string_lossy()
            .replace('\\', "/");
        let group = if relative.is_empty() {
            "默认"
        } else {
            &relative
        };
        if let Some(entry) = finalshell_entry(&value, group) {
            entries.push(entry);
        }
        if entries.len() > MAX_ROWS {
            return Err(invalid("单次最多导入 5000 台，请拆分目录"));
        }
    }
    Ok(())
}

pub(super) fn parse(source: ImportSource, path: &Path) -> Result<Parsed, AppError> {
    let mut digest = Sha256::new();
    let mut warnings = vec![];
    let mut entries = match source {
        ImportSource::SshConfig => {
            let data = read_limited(path)?;
            digest.update(&data);
            let text = decode_text(&data)?;
            if text.lines().any(|s| {
                ["include", "proxyjump", "proxycommand", "match"]
                    .iter()
                    .any(|keyword| s.trim().to_lowercase().starts_with(keyword))
            }) {
                warnings.push("Include / Match / ProxyJump / ProxyCommand 不会执行或展开；请导入后核对连接地址和跳板机".into());
            }
            ServerService::parse_import_ssh_config(&text)
                .into_iter()
                .map(|host| {
                    let mut item = new_entry();
                    item.row.alias = host.alias;
                    item.row.hostname = host.hostname;
                    item.row.port = host.port;
                    item.row.username = host.username;
                    item.row.tags = vec!["导入自 ssh config".into()];
                    if !host.identity_file.is_empty() {
                        item.row.warning =
                            Some("已识别 IdentityFile，私钥内容不会读取，请导入后补充凭据".into());
                    }
                    item
                })
                .collect()
        }
        ImportSource::Spreadsheet => {
            let data = read_limited(path)?;
            digest.update(&data);
            match path
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase()
                .as_str()
            {
                "csv" => csv_rows(&data)?,
                "xlsx" => {
                    let mut book: Xlsx<_> = Xlsx::new(Cursor::new(data))
                        .map_err(|_| invalid("无法读取 Excel 文件，请选择未加密的 .xlsx 文件"))?;
                    let range = book
                        .worksheet_range_at(0)
                        .ok_or_else(|| invalid("Excel 没有工作表"))?
                        .map_err(|_| invalid("无法读取第一个工作表"))?;
                    if range.height() > MAX_ROWS + 1 || range.width() > 128 {
                        return Err(invalid("表格超过 5000 行或 128 列，请缩小导入范围"));
                    }
                    warnings.push("读取第一个工作表；公式使用文件中保存的计算结果".into());
                    table_rows(
                        range
                            .rows()
                            .map(|r| r.iter().map(ToString::to_string).collect())
                            .collect(),
                    )?
                }
                _ => return Err(invalid("请选择 .xlsx 或 .csv 文件")),
            }
        }
        ImportSource::Finalshell => {
            let mut list = vec![];
            if !path.is_dir() || std::fs::symlink_metadata(path)?.file_type().is_symlink() {
                return Err(invalid("请选择 FinalShell 导出文件夹"));
            }
            scan_folder(
                path,
                path,
                0,
                &mut digest,
                &mut list,
                &mut warnings,
                &mut 0,
                &mut 0,
            )?;
            list
        }
    };
    let mut aliases = HashSet::new();
    for (index, item) in entries.iter_mut().enumerate() {
        let row = &mut item.row;
        row.index = index;
        row.has_password = item.password.as_ref().is_some_and(|s| !s.is_empty());
        if row.alias.is_empty() {
            row.alias = row.hostname.clone();
        }
        if row.hostname.is_empty() || row.username.is_empty() {
            row.error = Some("主机和用户名不能为空".into());
        }
        if row.hostname.starts_with('-')
            || row.hostname.contains(['/', '\\', '\r', '\n', '\t', ' '])
        {
            row.error = Some("主机应为 IP 或域名，不能包含协议前缀、路径或空白".into());
        }
        if !(1..=65535).contains(&row.port) {
            row.error = Some("端口必须在 1–65535 之间".into());
        }
        if [&row.alias, &row.username, &row.group]
            .iter()
            .any(|s| s.len() > 256 || s.chars().any(char::is_control))
        {
            row.error = Some("别名、用户名或分组过长或包含控制字符".into());
        }
        if !aliases.insert(row.alias.to_lowercase()) {
            row.error = Some("导入文件内别名重复，请修改后重新选择".into());
        }
    }
    Ok(Parsed {
        entries,
        warnings,
        digest: digest.finalize().to_vec(),
    })
}
