use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc};
use std::thread;

use chrono::TimeZone;
use dashmap::DashMap;
use ssh2::{FileStat, Session};

use crate::database::Database;
use crate::error::AppError;
use crate::models::{
    SftpArchiveRequest, SftpChmodRequest, SftpCopyRequest, SftpFileEntry, SftpPathRequest,
    SftpRenameRequest, SftpRequest, SftpSessionInfo, SftpUploadRequest, TerminalOpenRequest,
};
use crate::services::server::ServerService;

enum SftpOperation {
    List {
        path: String,
        response: mpsc::Sender<Result<Vec<SftpFileEntry>, AppError>>,
    },
    Upload {
        remote_dir: String,
        file_name: String,
        content: Vec<u8>,
        response: mpsc::Sender<Result<SftpFileEntry, AppError>>,
    },
    Download {
        path: String,
        response: mpsc::Sender<Result<Vec<u8>, AppError>>,
    },
    Mkdir {
        path: String,
        response: mpsc::Sender<Result<(), AppError>>,
    },
    Rename {
        source_path: String,
        target_path: String,
        response: mpsc::Sender<Result<(), AppError>>,
    },
    Copy {
        source_path: String,
        target_path: String,
        response: mpsc::Sender<Result<(), AppError>>,
    },
    Chmod {
        path: String,
        mode: u32,
        response: mpsc::Sender<Result<(), AppError>>,
    },
    Delete {
        path: String,
        response: mpsc::Sender<Result<(), AppError>>,
    },
    Archive {
        source_path: String,
        archive_path: String,
        response: mpsc::Sender<Result<(), AppError>>,
    },
    Close,
}

struct SftpSessionHandle {
    session_id: String,
    sender: mpsc::Sender<SftpOperation>,
}

/// 全局 SFTP 会话管理器。
///
/// 页面卸载、路由切换和最小化都不会触发会话关闭；每个服务器只保留一个
/// SSH/SFTP 后台线程，直到用户手动关闭该服务器或应用退出。
pub struct SftpManager {
    sessions: Arc<DashMap<i64, SftpSessionHandle>>,
    session_info: Arc<DashMap<i64, SftpSessionInfo>>,
    sequence: AtomicU64,
}

impl Default for SftpManager {
    fn default() -> Self {
        Self {
            sessions: Arc::new(DashMap::new()),
            session_info: Arc::new(DashMap::new()),
            sequence: AtomicU64::new(1),
        }
    }
}

impl Drop for SftpManager {
    fn drop(&mut self) {
        self.close_all();
    }
}

impl SftpManager {
    pub fn open(&self, db: &Database, request: SftpRequest) -> Result<SftpSessionInfo, AppError> {
        let _ = self.ensure(db, &request)?;
        self.session_info
            .get(&request.server_id)
            .map(|info| info.value().clone())
            .ok_or_else(|| AppError::Custom("SFTP 会话初始化失败".into()))
    }

    fn ensure(&self, db: &Database, request: &SftpRequest) -> Result<SftpSessionHandle, AppError> {
        if let Some(existing) = self.sessions.get(&request.server_id) {
            if self
                .session_info
                .get(&request.server_id)
                .map(|info| info.status == "connected")
                .unwrap_or(false)
            {
                return Ok(SftpSessionHandle {
                    session_id: existing.session_id.clone(),
                    sender: existing.sender.clone(),
                });
            }
        }
        self.sessions.remove(&request.server_id);
        self.session_info.remove(&request.server_id);

        let (server, session) = connect(db, request.clone())?;
        let sftp = session
            .sftp()
            .map_err(|error| AppError::Custom(format!("初始化 SFTP 子系统失败: {error}")))?;
        let sequence = self.sequence.fetch_add(1, Ordering::Relaxed);
        let session_id = format!(
            "sftp-{}-{}-{}",
            server.id,
            chrono::Utc::now().timestamp_millis(),
            sequence
        );
        let info = SftpSessionInfo {
            session_id: session_id.clone(),
            server_id: server.id,
            status: "connected".into(),
            started_at: chrono::Local::now().to_rfc3339(),
            message: "SFTP 已连接".into(),
        };
        let (sender, receiver) = mpsc::channel();
        self.sessions.insert(
            server.id,
            SftpSessionHandle {
                session_id: session_id.clone(),
                sender: sender.clone(),
            },
        );
        self.session_info.insert(server.id, info);

        let sessions = Arc::clone(&self.sessions);
        let session_info = Arc::clone(&self.session_info);
        let worker_id = session_id.clone();
        let server_id = server.id;
        thread::Builder::new()
            .name(format!("ssh-sftp-{worker_id}"))
            .spawn(move || {
                run_sftp_session(
                    worker_id,
                    server_id,
                    session,
                    sftp,
                    receiver,
                    sessions,
                    session_info,
                )
            })
            .map_err(|error| {
                self.sessions.remove(&server.id);
                self.session_info.remove(&server.id);
                AppError::Custom(format!("启动 SFTP 会话线程失败: {error}"))
            })?;

        Ok(SftpSessionHandle { session_id, sender })
    }

    pub fn list_sessions(&self) -> Vec<SftpSessionInfo> {
        self.session_info
            .iter()
            .map(|item| item.value().clone())
            .collect()
    }

    pub fn close(&self, server_id: i64) {
        if let Some((_, handle)) = self.sessions.remove(&server_id) {
            let _ = handle.sender.send(SftpOperation::Close);
        }
        self.session_info.remove(&server_id);
    }

    pub fn close_all(&self) {
        let ids: Vec<i64> = self.sessions.iter().map(|item| *item.key()).collect();
        for server_id in ids {
            self.close(server_id);
        }
    }

    pub fn list(
        &self,
        db: &Database,
        request: SftpRequest,
        path: &str,
    ) -> Result<Vec<SftpFileEntry>, AppError> {
        let handle = self.ensure(db, &request)?;
        let (tx, rx) = mpsc::channel();
        handle
            .sender
            .send(SftpOperation::List {
                path: path.into(),
                response: tx,
            })
            .map_err(|_| AppError::Custom("SFTP 会话已断开".into()))?;
        rx.recv()
            .map_err(|_| AppError::Custom("SFTP 会话已断开".into()))?
    }

    pub fn upload(
        &self,
        db: &Database,
        input: SftpUploadRequest,
    ) -> Result<SftpFileEntry, AppError> {
        let handle = self.ensure(db, &input.request)?;
        let (tx, rx) = mpsc::channel();
        handle
            .sender
            .send(SftpOperation::Upload {
                remote_dir: input.remote_dir,
                file_name: input.file_name,
                content: input.content,
                response: tx,
            })
            .map_err(|_| AppError::Custom("SFTP 会话已断开".into()))?;
        rx.recv()
            .map_err(|_| AppError::Custom("SFTP 会话已断开".into()))?
    }

    pub fn download(&self, db: &Database, input: SftpPathRequest) -> Result<Vec<u8>, AppError> {
        let handle = self.ensure(db, &input.request)?;
        let (tx, rx) = mpsc::channel();
        handle
            .sender
            .send(SftpOperation::Download {
                path: input.path,
                response: tx,
            })
            .map_err(|_| AppError::Custom("SFTP 会话已断开".into()))?;
        rx.recv()
            .map_err(|_| AppError::Custom("SFTP 会话已断开".into()))?
    }

    pub fn mkdir(&self, db: &Database, input: SftpPathRequest) -> Result<(), AppError> {
        self.unit(db, &input.request, |response| SftpOperation::Mkdir {
            path: input.path,
            response,
        })
    }

    pub fn rename(&self, db: &Database, input: SftpRenameRequest) -> Result<(), AppError> {
        self.unit(db, &input.request, |response| SftpOperation::Rename {
            source_path: input.source_path,
            target_path: input.target_path,
            response,
        })
    }

    pub fn copy(&self, db: &Database, input: SftpCopyRequest) -> Result<(), AppError> {
        self.unit(db, &input.request, |response| SftpOperation::Copy {
            source_path: input.source_path,
            target_path: input.target_path,
            response,
        })
    }

    pub fn chmod(&self, db: &Database, input: SftpChmodRequest) -> Result<(), AppError> {
        let mode = input.mode;
        self.unit(db, &input.request, |response| SftpOperation::Chmod {
            path: input.path,
            mode,
            response,
        })
    }

    pub fn delete(&self, db: &Database, input: SftpPathRequest) -> Result<(), AppError> {
        self.unit(db, &input.request, |response| SftpOperation::Delete {
            path: input.path,
            response,
        })
    }

    pub fn archive(&self, db: &Database, input: SftpArchiveRequest) -> Result<(), AppError> {
        self.unit(db, &input.request, |response| SftpOperation::Archive {
            source_path: input.source_path,
            archive_path: input.archive_path,
            response,
        })
    }

    fn unit<F>(&self, db: &Database, request: &SftpRequest, build: F) -> Result<(), AppError>
    where
        F: FnOnce(mpsc::Sender<Result<(), AppError>>) -> SftpOperation,
    {
        let handle = self.ensure(db, request)?;
        let (tx, rx) = mpsc::channel();
        handle
            .sender
            .send(build(tx))
            .map_err(|_| AppError::Custom("SFTP 会话已断开".into()))?;
        rx.recv()
            .map_err(|_| AppError::Custom("SFTP 会话已断开".into()))?
    }
}

fn run_sftp_session(
    session_id: String,
    server_id: i64,
    session: Session,
    sftp: ssh2::Sftp,
    receiver: mpsc::Receiver<SftpOperation>,
    sessions: Arc<DashMap<i64, SftpSessionHandle>>,
    session_info: Arc<DashMap<i64, SftpSessionInfo>>,
) {
    while let Ok(operation) = receiver.recv() {
        match operation {
            SftpOperation::List { path, response } => {
                let _ = response.send(list_on_sftp(&sftp, path));
            }
            SftpOperation::Upload {
                remote_dir,
                file_name,
                content,
                response,
            } => {
                let _ = response.send(upload_on_sftp(&sftp, remote_dir, file_name, content));
            }
            SftpOperation::Download { path, response } => {
                let _ = response.send(download_on_sftp(&sftp, path));
            }
            SftpOperation::Mkdir { path, response } => {
                let _ = response.send(mkdir_on_sftp(&sftp, path));
            }
            SftpOperation::Rename {
                source_path,
                target_path,
                response,
            } => {
                let _ = response.send(rename_on_sftp(&sftp, source_path, target_path));
            }
            SftpOperation::Copy {
                source_path,
                target_path,
                response,
            } => {
                let _ = response.send(copy_on_session(&session, source_path, target_path));
            }
            SftpOperation::Chmod {
                path,
                mode,
                response,
            } => {
                let _ = response.send(chmod_on_sftp(&sftp, path, mode));
            }
            SftpOperation::Delete { path, response } => {
                let _ = response.send(delete_on_sftp(&sftp, path));
            }
            SftpOperation::Archive {
                source_path,
                archive_path,
                response,
            } => {
                let _ = response.send(archive_on_session(&session, source_path, archive_path));
            }
            SftpOperation::Close => break,
        }
    }

    sessions.remove_if(&server_id, |_id, handle| handle.session_id == session_id);
    session_info.remove(&server_id);
    drop(sftp);
    let _ = session.disconnect(None, "SFTP session closed", None);
}

fn list_on_sftp(sftp: &ssh2::Sftp, path: String) -> Result<Vec<SftpFileEntry>, AppError> {
    let path = normalize_path(&path)?;
    let mut entries = sftp
        .readdir(Path::new(&path))
        .map_err(|error| AppError::Custom(format!("读取远程目录失败: {error}")))?
        .into_iter()
        .map(|(entry_path, stat)| file_entry(&entry_path, &stat))
        .collect::<Result<Vec<_>, _>>()?;
    entries.sort_by_key(|entry| (!entry.is_dir, entry.name.to_lowercase()));
    Ok(entries)
}

fn upload_on_sftp(
    sftp: &ssh2::Sftp,
    remote_dir: String,
    file_name: String,
    content: Vec<u8>,
) -> Result<SftpFileEntry, AppError> {
    validate_name(&file_name, "文件名")?;
    let remote_dir = normalize_path(&remote_dir)?;
    let remote_path = PathBuf::from(&remote_dir).join(&file_name);
    let mut remote_file = sftp
        .create(&remote_path)
        .map_err(|error| AppError::Custom(format!("创建远程文件失败: {error}")))?;
    remote_file
        .write_all(&content)
        .map_err(|error| AppError::Custom(format!("上传文件失败: {error}")))?;
    let stat = sftp
        .stat(&remote_path)
        .map_err(|error| AppError::Custom(format!("读取上传结果失败: {error}")))?;
    file_entry(&remote_path, &stat)
}

fn download_on_sftp(sftp: &ssh2::Sftp, path: String) -> Result<Vec<u8>, AppError> {
    let path = normalize_path(&path)?;
    let mut remote_file = sftp
        .open(Path::new(&path))
        .map_err(|error| AppError::Custom(format!("打开远程文件失败: {error}")))?;
    let mut content = Vec::new();
    remote_file
        .read_to_end(&mut content)
        .map_err(|error| AppError::Custom(format!("下载远程文件失败: {error}")))?;
    Ok(content)
}

fn mkdir_on_sftp(sftp: &ssh2::Sftp, path: String) -> Result<(), AppError> {
    let path = normalize_path(&path)?;
    sftp.mkdir(Path::new(&path), 0o755)
        .map_err(|error| AppError::Custom(format!("创建远程目录失败: {error}")))
}

fn rename_on_sftp(sftp: &ssh2::Sftp, source: String, target: String) -> Result<(), AppError> {
    let source = normalize_path(&source)?;
    let target = normalize_path(&target)?;
    sftp.rename(Path::new(&source), Path::new(&target), None)
        .map_err(|error| AppError::Custom(format!("重命名远程文件失败: {error}")))
}

fn copy_on_session(session: &Session, source: String, target: String) -> Result<(), AppError> {
    let source = normalize_path(&source)?;
    let target = normalize_path(&target)?;
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

fn chmod_on_sftp(sftp: &ssh2::Sftp, path: String, mode: u32) -> Result<(), AppError> {
    if mode > 0o7777 {
        return Err(AppError::InvalidInput("权限必须是有效的八进制掩码".into()));
    }
    let path = normalize_path(&path)?;
    sftp.setstat(
        Path::new(&path),
        FileStat {
            size: None,
            uid: None,
            gid: None,
            perm: Some(mode),
            atime: None,
            mtime: None,
        },
    )
    .map_err(|error| AppError::Custom(format!("修改远程权限失败: {error}")))
}

fn delete_on_sftp(sftp: &ssh2::Sftp, path: String) -> Result<(), AppError> {
    let path = normalize_path(&path)?;
    delete_recursive(sftp, Path::new(&path))
}

fn archive_on_session(session: &Session, source: String, archive: String) -> Result<(), AppError> {
    let source = normalize_path(&source)?;
    let archive = normalize_path(&archive)?;
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
