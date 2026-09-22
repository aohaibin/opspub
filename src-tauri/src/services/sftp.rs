use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use chrono::TimeZone;
use ssh2::{FileStat, Session};

use crate::database::Database;
use crate::error::AppError;
use crate::models::{
    SftpArchiveRequest, SftpChmodRequest, SftpCopyRequest, SftpFileEntry, SftpPathRequest,
    SftpRenameRequest, SftpRequest, SftpUploadRequest, TerminalOpenRequest,
};
use crate::services::server::ServerService;

/// SFTP 业务服务。
///
/// 每个操作建立一次短时 SSH/SFTP 会话，避免在应用状态中保存密码、私钥口令或失效的
/// libssh2 句柄。对小文件和目录管理操作而言，这个策略更容易保证凭据生命周期和错误隔离。
pub struct SftpService;

impl SftpService {
    pub fn list(
        db: &Database,
        request: SftpRequest,
        path: &str,
    ) -> Result<Vec<SftpFileEntry>, AppError> {
        let (_, session) = connect(db, request)?;
        let sftp = session
            .sftp()
            .map_err(|error| AppError::Custom(format!("初始化 SFTP 子系统失败: {error}")))?;
        let path = normalize_path(path)?;
        let mut entries = sftp
            .readdir(Path::new(&path))
            .map_err(|error| AppError::Custom(format!("读取远程目录失败: {error}")))?
            .into_iter()
            .map(|(entry_path, stat)| file_entry(&entry_path, &stat))
            .collect::<Result<Vec<_>, _>>()?;
        entries.sort_by_key(|entry| (!entry.is_dir, entry.name.to_lowercase()));
        Ok(entries)
    }

    pub fn upload(db: &Database, input: SftpUploadRequest) -> Result<SftpFileEntry, AppError> {
        validate_name(&input.file_name, "文件名")?;
        let (_, session) = connect(db, input.request)?;
        let sftp = session
            .sftp()
            .map_err(|error| AppError::Custom(format!("初始化 SFTP 子系统失败: {error}")))?;
        let remote_dir = normalize_path(&input.remote_dir)?;
        let remote_path = PathBuf::from(&remote_dir).join(&input.file_name);
        let mut remote_file = sftp
            .create(&remote_path)
            .map_err(|error| AppError::Custom(format!("创建远程文件失败: {error}")))?;
        remote_file
            .write_all(&input.content)
            .map_err(|error| AppError::Custom(format!("上传文件失败: {error}")))?;
        let stat = sftp
            .stat(&remote_path)
            .map_err(|error| AppError::Custom(format!("读取上传结果失败: {error}")))?;
        file_entry(&remote_path, &stat)
    }

    pub fn download(db: &Database, input: SftpPathRequest) -> Result<Vec<u8>, AppError> {
        let (_, session) = connect(db, input.request)?;
        let sftp = session
            .sftp()
            .map_err(|error| AppError::Custom(format!("初始化 SFTP 子系统失败: {error}")))?;
        let path = normalize_path(&input.path)?;
        let mut remote_file = sftp
            .open(Path::new(&path))
            .map_err(|error| AppError::Custom(format!("打开远程文件失败: {error}")))?;
        let mut content = Vec::new();
        remote_file
            .read_to_end(&mut content)
            .map_err(|error| AppError::Custom(format!("下载远程文件失败: {error}")))?;
        Ok(content)
    }

    pub fn mkdir(db: &Database, input: SftpPathRequest) -> Result<(), AppError> {
        let (_, session) = connect(db, input.request)?;
        let sftp = session
            .sftp()
            .map_err(|error| AppError::Custom(format!("初始化 SFTP 子系统失败: {error}")))?;
        let path = normalize_path(&input.path)?;
        sftp.mkdir(Path::new(&path), 0o755)
            .map_err(|error| AppError::Custom(format!("创建远程目录失败: {error}")))
    }

    pub fn rename(db: &Database, input: SftpRenameRequest) -> Result<(), AppError> {
        let (_, session) = connect(db, input.request)?;
        let sftp = session
            .sftp()
            .map_err(|error| AppError::Custom(format!("初始化 SFTP 子系统失败: {error}")))?;
        let source = normalize_path(&input.source_path)?;
        let target = normalize_path(&input.target_path)?;
        sftp.rename(Path::new(&source), Path::new(&target), None)
            .map_err(|error| AppError::Custom(format!("重命名远程文件失败: {error}")))
    }

    pub fn copy(db: &Database, input: SftpCopyRequest) -> Result<(), AppError> {
        let (_, session) = connect(db, input.request)?;
        let source = normalize_path(&input.source_path)?;
        let target = normalize_path(&input.target_path)?;
        let command = format!("cp -a -- {} {}", shell_quote(&source), shell_quote(&target));
        let mut channel = session
            .channel_session()
            .map_err(|error| AppError::Custom(format!("创建远程复制通道失败: {error}")))?;
        channel
            .exec(&command)
            .map_err(|error| AppError::Custom(format!("启动远程复制失败: {error}")))?;
        let mut stderr = String::new();
        channel
            .stderr()
            .read_to_string(&mut stderr)
            .map_err(|error| AppError::Custom(format!("读取复制结果失败: {error}")))?;
        channel
            .wait_close()
            .map_err(|error| AppError::Custom(format!("等待复制任务结束失败: {error}")))?;
        if channel.exit_status().unwrap_or(1) != 0 {
            return Err(AppError::Custom(if stderr.trim().is_empty() {
                "远程复制命令执行失败".into()
            } else {
                format!("远程复制失败: {}", stderr.trim())
            }));
        }
        Ok(())
    }

    pub fn chmod(db: &Database, input: SftpChmodRequest) -> Result<(), AppError> {
        if input.mode > 0o7777 {
            return Err(AppError::InvalidInput("权限必须是有效的八进制掩码".into()));
        }
        let (_, session) = connect(db, input.request)?;
        let sftp = session
            .sftp()
            .map_err(|error| AppError::Custom(format!("初始化 SFTP 子系统失败: {error}")))?;
        let path = normalize_path(&input.path)?;
        sftp.setstat(
            Path::new(&path),
            FileStat {
                size: None,
                uid: None,
                gid: None,
                perm: Some(input.mode),
                atime: None,
                mtime: None,
            },
        )
        .map_err(|error| AppError::Custom(format!("修改远程权限失败: {error}")))
    }

    pub fn delete(db: &Database, input: SftpPathRequest) -> Result<(), AppError> {
        let (_, session) = connect(db, input.request)?;
        let sftp = session
            .sftp()
            .map_err(|error| AppError::Custom(format!("初始化 SFTP 子系统失败: {error}")))?;
        let path = normalize_path(&input.path)?;
        delete_recursive(&sftp, Path::new(&path))
    }

    pub fn archive(db: &Database, input: SftpArchiveRequest) -> Result<(), AppError> {
        let (_, session) = connect(db, input.request)?;
        let source = normalize_path(&input.source_path)?;
        let archive = normalize_path(&input.archive_path)?;
        let command = format!(
            "tar -czf {} -- {}",
            shell_quote(&archive),
            shell_quote(&source)
        );
        let mut channel = session
            .channel_session()
            .map_err(|error| AppError::Custom(format!("创建远程命令通道失败: {error}")))?;
        channel
            .exec(&command)
            .map_err(|error| AppError::Custom(format!("启动远程压缩失败: {error}")))?;
        let mut stderr = String::new();
        channel
            .stderr()
            .read_to_string(&mut stderr)
            .map_err(|error| AppError::Custom(format!("读取压缩结果失败: {error}")))?;
        channel
            .wait_close()
            .map_err(|error| AppError::Custom(format!("等待压缩任务结束失败: {error}")))?;
        if channel.exit_status().unwrap_or(1) != 0 {
            return Err(AppError::Custom(if stderr.trim().is_empty() {
                "远程压缩命令执行失败".into()
            } else {
                format!("远程压缩失败: {}", stderr.trim())
            }));
        }
        Ok(())
    }
}

fn connect(
    db: &Database,
    request: SftpRequest,
) -> Result<(crate::models::Server, Session), AppError> {
    ServerService::connect_terminal(
        db,
        &TerminalOpenRequest {
            server_id: request.server_id,
            password: request.password,
            private_key_path: request.private_key_path,
            passphrase: request.passphrase,
        },
    )
}

fn normalize_path(path: &str) -> Result<String, AppError> {
    let path = path.trim();
    if path.is_empty() {
        return Err(AppError::InvalidInput("远程路径不能为空".into()));
    }
    let mut normalized = path.replace('\\', "/");
    if !normalized.starts_with('/') {
        normalized.insert(0, '/');
    }
    while normalized.contains("//") {
        normalized = normalized.replace("//", "/");
    }
    if normalized.split('/').any(|segment| segment == "..") {
        return Err(AppError::InvalidInput("远程路径不能包含 ..".into()));
    }
    Ok(normalized)
}

fn validate_name(name: &str, label: &str) -> Result<(), AppError> {
    let name = name.trim();
    if name.is_empty() || name == "." || name == ".." || name.contains('/') || name.contains('\\') {
        return Err(AppError::InvalidInput(format!("{}包含非法路径字符", label)));
    }
    Ok(())
}

fn file_entry(path: &Path, stat: &FileStat) -> Result<SftpFileEntry, AppError> {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| AppError::Custom("远程文件名不是有效 UTF-8".into()))?
        .to_string();
    let perm = stat.perm.unwrap_or(0);
    let is_dir = perm & 0o170000 == 0o040000;
    let modified = stat
        .mtime
        .and_then(|seconds| chrono::Local.timestamp_opt(seconds as i64, 0).single())
        .map(|time| time.format("%Y-%m-%d %H:%M:%S").to_string())
        .unwrap_or_else(|| "未知".into());
    Ok(SftpFileEntry {
        name,
        is_dir,
        size: stat.size.unwrap_or(0),
        modified,
        permissions: format_permissions(perm, is_dir),
        owner: format!(
            "uid:{} gid:{}",
            stat.uid.unwrap_or(0),
            stat.gid.unwrap_or(0)
        ),
    })
}

fn format_permissions(mode: u32, is_dir: bool) -> String {
    let bits = mode & 0o777;
    let mut result = String::with_capacity(10);
    result.push(if is_dir { 'd' } else { '-' });
    for shift in [6, 3, 0] {
        let value = (bits >> shift) & 0o7;
        result.push(if value & 0o4 != 0 { 'r' } else { '-' });
        result.push(if value & 0o2 != 0 { 'w' } else { '-' });
        result.push(if value & 0o1 != 0 { 'x' } else { '-' });
    }
    result
}

fn delete_recursive(sftp: &ssh2::Sftp, path: &Path) -> Result<(), AppError> {
    let stat = sftp
        .stat(path)
        .map_err(|error| AppError::Custom(format!("读取删除目标失败: {error}")))?;
    if stat.perm.unwrap_or(0) & 0o170000 == 0o040000 {
        for (child, _) in sftp
            .readdir(path)
            .map_err(|error| AppError::Custom(format!("读取远程目录失败: {error}")))?
        {
            delete_recursive(sftp, &child)?;
        }
        sftp.rmdir(path)
            .map_err(|error| AppError::Custom(format!("删除远程目录失败: {error}")))?;
    } else {
        sftp.unlink(path)
            .map_err(|error| AppError::Custom(format!("删除远程文件失败: {error}")))?;
    }
    Ok(())
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}
