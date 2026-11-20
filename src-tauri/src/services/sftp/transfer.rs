use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use super::{connect, file_entry, normalize_path, validate_name, SftpManager};
use crate::database::Database;
use crate::error::AppError;
use crate::models::{SftpFileEntry, SftpTransferProgress, SftpTransferRequest};

impl SftpManager {
    pub fn reserve_transfer(&self, id: &str) -> Result<Arc<AtomicBool>, AppError> {
        if uuid::Uuid::parse_str(id).is_err() {
            return Err(AppError::InvalidInput("上传任务编号无效".into()));
        }
        match self.transfers.entry(id.into()) {
            dashmap::mapref::entry::Entry::Occupied(_) => {
                Err(AppError::InvalidInput("上传任务已存在".into()))
            }
            dashmap::mapref::entry::Entry::Vacant(entry) => {
                let cancelled = Arc::new(AtomicBool::new(false));
                entry.insert(cancelled.clone());
                Ok(cancelled)
            }
        }
    }

    pub fn cancel_transfer(&self, id: &str) {
        if let Some(task) = self.transfers.get(id) {
            task.store(true, Ordering::Release);
        }
    }

    pub fn finish_transfer(&self, id: &str) {
        self.transfers.remove(id);
    }

    /// 独立 SSH 连接承载上传，不能排进文件浏览的串行 worker，否则浏览/重命名也会等待上传。
    pub fn transfer(
        &self,
        db: &Database,
        input: SftpTransferRequest,
        cancelled: &AtomicBool,
        progress: impl Fn(SftpTransferProgress),
    ) -> Result<SftpFileEntry, AppError> {
        validate_name(&input.file_name, "文件名")?;
        let remote_dir = normalize_path(&input.remote_dir)?;
        let (mut source, total): (Box<dyn Read>, u64) = match (input.local_path, input.content) {
            (Some(path), None) => {
                let file = std::fs::File::open(path)?;
                let metadata = file.metadata()?;
                if !metadata.is_file() {
                    return Err(AppError::InvalidInput(
                        "请选择文件上传，暂不支持目录".into(),
                    ));
                }
                (Box::new(file), metadata.len())
            }
            (None, Some(content)) => {
                let size = content.len() as u64;
                (Box::new(Cursor::new(content)), size)
            }
            _ => return Err(AppError::InvalidInput("上传必须指定一个文件来源".into())),
        };
        check_cancelled(cancelled)?;
        progress(SftpTransferProgress { loaded: 0, total });
        let (_, session) = connect(db, input.request)?;
        // 为单次网络读写设置上限，断网或取消后不会永久挂起工作线程。
        session.set_timeout(15_000);
        check_cancelled(cancelled)?;
        let sftp = session
            .sftp()
            .map_err(|e| AppError::Custom(format!("初始化上传连接失败: {e}")))?;
        let target = PathBuf::from(&remote_dir).join(&input.file_name);
        let temporary =
            PathBuf::from(&remote_dir).join(format!(".opspub-upload-{}.part", input.task_id));
        let result = (|| {
            let mut remote = sftp
                .open_mode(
                    &temporary,
                    ssh2::OpenFlags::WRITE | ssh2::OpenFlags::CREATE | ssh2::OpenFlags::EXCLUSIVE,
                    0o644,
                    ssh2::OpenType::File,
                )
                .map_err(|e| AppError::Custom(format!("创建上传临时文件失败: {e}")))?;
            let mut last_progress = Instant::now();
            let loaded = stream_upload(&mut source, &mut remote, cancelled, |loaded| {
                // 限制 IPC 频率，实际进度仍由成功写入的字节驱动。
                if last_progress.elapsed() >= Duration::from_millis(100) {
                    progress(SftpTransferProgress { loaded, total });
                    last_progress = Instant::now();
                }
            })?;
            remote
                .close()
                .map_err(|e| AppError::Custom(format!("关闭上传文件失败: {e}")))?;
            check_cancelled(cancelled)?;
            if loaded != total {
                return Err(AppError::Custom(
                    "本地文件在上传过程中发生变化，请重新上传".into(),
                ));
            }
            // 不先删目标文件；失败和取消仅清理本次临时文件，保留已有正式文件。
            sftp.rename(&temporary, &target, Some(ssh2::RenameFlags::OVERWRITE))
                .map_err(|e| AppError::Custom(format!("提交上传文件失败: {e}")))?;
            let stat = sftp
                .stat(Path::new(&target))
                .map_err(|e| AppError::Custom(format!("读取上传结果失败: {e}")))?;
            progress(SftpTransferProgress { loaded, total });
            file_entry(&target, &stat)
        })();
        if result.is_err() {
            let _ = sftp.unlink(&temporary);
        }
        result
    }
}

fn check_cancelled(cancelled: &AtomicBool) -> Result<(), AppError> {
    if cancelled.load(Ordering::Acquire) {
        return Err(AppError::Custom("上传已取消".into()));
    }
    Ok(())
}

fn stream_upload(
    source: &mut impl Read,
    target: &mut impl Write,
    cancelled: &AtomicBool,
    mut progress: impl FnMut(u64),
) -> Result<u64, AppError> {
    let mut buffer = vec![0; 256 * 1024];
    let mut loaded = 0;
    loop {
        check_cancelled(cancelled)?;
        let size = source.read(&mut buffer)?;
        if size == 0 {
            break;
        }
        target.write_all(&buffer[..size])?;
        loaded += size as u64;
        progress(loaded);
    }
    Ok(loaded)
}
