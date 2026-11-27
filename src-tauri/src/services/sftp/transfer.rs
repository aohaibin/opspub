use std::io::{Cursor, Read, Seek, SeekFrom, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use super::{connect, file_entry, normalize_path, validate_name, SftpManager};
use crate::database::Database;
use crate::error::AppError;
use crate::models::{
    SftpDownloadTransferRequest, SftpDragDownloadRequest, SftpFileEntry, SftpStageDropAction,
    SftpTransferProgress, SftpTransferRequest,
};

impl SftpManager {
    pub fn prepare_drag_download(
        &self,
        db: &Database,
        input: SftpDragDownloadRequest,
    ) -> Result<Vec<String>, AppError> {
        if uuid::Uuid::parse_str(&input.task_id).is_err() {
            return Err(AppError::InvalidInput("传输任务编号无效".into()));
        }
        if input.remote_paths.is_empty() {
            return Err(AppError::InvalidInput("请选择要拖出的远程文件".into()));
        }
        if self.download_staging.contains_key(&input.task_id) {
            return Err(AppError::InvalidInput("拖放任务已存在".into()));
        }

        let staging = tempfile::tempdir()?;
        let mut local_paths = Vec::with_capacity(input.remote_paths.len());
        for (index, remote_path) in input.remote_paths.iter().enumerate() {
            let name = local_name(
                remote_path
                    .trim_end_matches('/')
                    .rsplit('/')
                    .next()
                    .unwrap_or_default(),
            )?;
            self.download_transfer(
                db,
                SftpDownloadTransferRequest {
                    task_id: format!("{}-{index}", input.task_id),
                    request: input.request.clone(),
                    remote_path: remote_path.clone(),
                    local_dir: staging.path().to_string_lossy().into_owned(),
                },
                &AtomicBool::new(false),
                |_| {},
            )?;
            local_paths.push(
                staging
                    .path()
                    .join(name)
                    .to_str()
                    .ok_or_else(|| AppError::InvalidInput("本地临时路径不是有效 UTF-8".into()))?
                    .to_owned(),
            );
        }

        match self.download_staging.entry(input.task_id) {
            dashmap::mapref::entry::Entry::Occupied(_) => {
                Err(AppError::InvalidInput("拖放任务已存在".into()))
            }
            dashmap::mapref::entry::Entry::Vacant(entry) => {
                entry.insert(staging);
                Ok(local_paths)
            }
        }
    }

    pub fn release_drag_download(&self, task_id: &str) {
        self.download_staging.remove(task_id);
    }

    pub fn stage_upload_drop(&self, id: &str, input: SftpStageDropAction) -> Result<(), AppError> {
        if uuid::Uuid::parse_str(id).is_err() {
            return Err(AppError::InvalidInput("传输任务编号无效".into()));
        }
        let path = match input {
            SftpStageDropAction::Begin => {
                match self.upload_staging.entry(id.into()) {
                    dashmap::mapref::entry::Entry::Vacant(entry) => {
                        entry.insert(tempfile::tempdir()?);
                    }
                    dashmap::mapref::entry::Entry::Occupied(_) => {
                        return Err(AppError::InvalidInput("传输任务已存在".into()));
                    }
                }
                return Ok(());
            }
            SftpStageDropAction::Release => {
                self.upload_staging.remove(id);
                return Ok(());
            }
            SftpStageDropAction::Directory { ref path }
            | SftpStageDropAction::Chunk { ref path, .. } => path,
        };
        if path.is_empty() {
            return Err(AppError::InvalidInput("上传路径不能为空".into()));
        }
        check_depth(path.len() - 1)?;
        let staging = self
            .upload_staging
            .get_mut(id)
            .ok_or_else(|| AppError::InvalidInput("上传临时目录已释放".into()))?;
        let mut target = staging.path().to_path_buf();
        for component in path {
            target.push(local_name(component)?);
        }
        match input {
            SftpStageDropAction::Directory { .. } => std::fs::create_dir(&target)?,
            SftpStageDropAction::Chunk { offset, data, .. } => {
                if data.len() > 256 * 1024 {
                    return Err(AppError::InvalidInput("文件分块超过 256 KiB".into()));
                }
                let mut options = std::fs::OpenOptions::new();
                options.write(true).create_new(offset == 0);
                let mut file = options.open(target)?;
                if file.metadata()?.len() != offset {
                    return Err(AppError::InvalidInput("上传文件分块错位".into()));
                }
                file.seek(SeekFrom::Start(offset))?;
                file.write_all(&data)?;
            }
            _ => {}
        }
        Ok(())
    }

    pub fn reserve_transfer(&self, id: &str) -> Result<Arc<AtomicBool>, AppError> {
        if uuid::Uuid::parse_str(id).is_err() {
            return Err(AppError::InvalidInput("传输任务编号无效".into()));
        }
        match self.transfers.entry(id.into()) {
            dashmap::mapref::entry::Entry::Occupied(_) => {
                Err(AppError::InvalidInput("传输任务已存在".into()))
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
        mut input: SftpTransferRequest,
        cancelled: &AtomicBool,
        progress: impl Fn(SftpTransferProgress),
    ) -> Result<SftpFileEntry, AppError> {
        validate_name(&input.file_name, "文件名")?;
        let remote_dir = normalize_path(&input.remote_dir)?;
        let staging = if input.staged == Some(true) {
            if input.local_path.is_some() || input.content.is_some() {
                return Err(AppError::InvalidInput("上传必须指定一个来源".into()));
            }
            let (_, staging) = self
                .upload_staging
                .remove(&input.task_id)
                .ok_or_else(|| AppError::InvalidInput("上传临时目录已释放".into()))?;
            let source = staging.path().join(local_name(&input.file_name)?);
            input.local_path = Some(
                source
                    .to_str()
                    .ok_or_else(|| AppError::InvalidInput("本地临时路径不是有效 UTF-8".into()))?
                    .into(),
            );
            Some(staging)
        } else {
            None
        };
        let _staging = staging;
        if let (Some(local_path), None) = (input.local_path.clone(), input.content.as_ref()) {
            let source_path = Path::new(&local_path);
            if source_path.is_dir() {
                return upload_directory_transfer(
                    db,
                    input,
                    source_path,
                    &remote_dir,
                    cancelled,
                    progress,
                );
            }
        }
        let (mut source, total): (Box<dyn Read>, u64) = match (input.local_path, input.content) {
            (Some(path), None) => {
                let metadata = local_metadata(Path::new(&path))?;
                let file = std::fs::File::open(path)?;
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
        let mut remote = sftp
            .open_mode(
                &temporary,
                ssh2::OpenFlags::WRITE | ssh2::OpenFlags::CREATE | ssh2::OpenFlags::EXCLUSIVE,
                0o644,
                ssh2::OpenType::File,
            )
            .map_err(|error| AppError::Custom(format!("创建上传临时文件失败: {error}")))?;
        let result = (|| {
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
            let stat = sftp
                .lstat(&temporary)
                .map_err(|e| AppError::Custom(format!("读取上传结果失败: {e}")))?;
            let entry = file_entry(&target, &stat)?;
            commit_upload_file(&sftp, &temporary, &target, input.overwrite)?;
            progress(SftpTransferProgress { loaded, total });
            Ok(entry)
        })();
        drop(remote);
        if result.is_err() {
            let _ = sftp.unlink(&temporary);
        }
        result
    }

    pub fn download_transfer(
        &self,
        db: &Database,
        input: SftpDownloadTransferRequest,
        cancelled: &AtomicBool,
        progress: impl Fn(SftpTransferProgress),
    ) -> Result<(), AppError> {
        let remote_path = &input.remote_path;
        if !remote_path.starts_with('/')
            || remote_path.contains('\\')
            || remote_path
                .split('/')
                .any(|part| matches!(part, "." | ".."))
        {
            return Err(AppError::InvalidInput("远程下载路径无效".into()));
        }
        let destination = PathBuf::from(&input.local_dir);
        if !destination.is_dir() {
            return Err(AppError::InvalidInput(
                "请选择已存在的本地目标文件夹".into(),
            ));
        }
        check_cancelled(cancelled)?;
        progress(SftpTransferProgress {
            loaded: 0,
            total: 0,
        });
        let (_, session) = connect(db, input.request)?;
        session.set_timeout(15_000);
        check_cancelled(cancelled)?;
        let sftp = session
            .sftp()
            .map_err(|error| AppError::Custom(format!("初始化下载连接失败: {error}")))?;
        let source = Path::new(remote_path);
        let stat = sftp
            .lstat(source)
            .map_err(|error| AppError::Custom(format!("读取远程下载目标失败: {error}")))?;
        let name = local_name(
            remote_path
                .trim_end_matches('/')
                .rsplit('/')
                .next()
                .unwrap_or_default(),
        )?;
        let target = destination.join(name);
        ensure_local_target_available(&target)?;
        let total = remote_tree_size(&sftp, source, &stat, cancelled, 0)?;
        let mut transfer = TransferProgress::new(total, cancelled, &progress);
        // 失败或取消时只清理本次任务的临时文件。
        if stat.is_dir() {
            let staging = tempfile::tempdir_in(&destination)?;
            let staged = staging.path().join("payload");
            download_node(&sftp, source, &staged, &mut transfer, 0)?;
            check_cancelled(cancelled)?;
            #[cfg(windows)]
            std::fs::rename(&staged, &target)?;
            #[cfg(not(windows))]
            {
                // Unix rename 可替换空目录，先独占创建目标。
                std::fs::create_dir(&target)?;
                if let Err(error) = std::fs::rename(&staged, &target) {
                    // 保留目标目录，避免清理时误删并发创建或写入的用户数据。
                    return Err(error.into());
                }
            }
        } else {
            let mut temporary = tempfile::NamedTempFile::new_in(&destination)?;
            download_file(&sftp, source, &stat, &mut temporary, &mut transfer)?;
            temporary.as_file().sync_all()?;
            check_cancelled(cancelled)?;
            temporary
                .persist_noclobber(&target)
                .map_err(|error| error.error)?;
        }
        transfer.report();
        Ok(())
    }
}

fn upload_directory_transfer(
    db: &Database,
    input: SftpTransferRequest,
    source: &Path,
    remote_dir: &str,
    cancelled: &AtomicBool,
    progress: impl Fn(SftpTransferProgress),
) -> Result<SftpFileEntry, AppError> {
    progress(SftpTransferProgress {
        loaded: 0,
        total: 0,
    });
    let total = local_tree_size(source, cancelled, 0)?;
    let (_, session) = connect(db, input.request)?;
    session.set_timeout(15_000);
    check_cancelled(cancelled)?;
    let sftp = session
        .sftp()
        .map_err(|error| AppError::Custom(format!("初始化上传连接失败: {error}")))?;
    let target = remote_child(remote_dir, &input.file_name);
    let merge_existing_directory = match remote_upload_target(&sftp, Path::new(&target))? {
        Some(stat) if input.overwrite && stat.is_dir() => true,
        Some(_) => return Err(AppError::SftpUploadConflict(target)),
        None => false,
    };
    let temporary = remote_child(
        remote_dir,
        &format!(".opspub-upload-{}.part", input.task_id),
    );
    if !merge_existing_directory {
        sftp.mkdir(Path::new(&temporary), 0o755).map_err(sftp_error)?;
    }
    let upload_root = if merge_existing_directory { &target } else { &temporary };
    let mut transfer = TransferProgress::new(total, cancelled, &progress);
    let result = (|| {
        upload_local_directory(&sftp, source, upload_root, &mut transfer, 0, merge_existing_directory)?;
        check_cancelled(cancelled)?;
        let stat = sftp.lstat(Path::new(upload_root)).map_err(sftp_error)?;
        let mut entry = file_entry(Path::new(upload_root), &stat)?;
        entry.name = input.file_name;
        entry.size = transfer.loaded;
        if !merge_existing_directory {
            commit_new_upload(&sftp, Path::new(&temporary), Path::new(&target))?;
        }
        transfer.report();
        Ok(entry)
    })();
    if result.is_err() && !merge_existing_directory {
        if let Err(cleanup) = remove_staged_remote(&sftp, &temporary, 0) {
            log::warn!("未清理远程上传临时目录 {temporary}: {cleanup}");
        }
    }
    result
}

struct TransferProgress<'a> {
    loaded: u64,
    total: u64,
    cancelled: &'a AtomicBool,
    notify: &'a dyn Fn(SftpTransferProgress),
    last_report: Instant,
}

impl<'a> TransferProgress<'a> {
    fn new(
        total: u64,
        cancelled: &'a AtomicBool,
        notify: &'a dyn Fn(SftpTransferProgress),
    ) -> Self {
        let mut progress = Self {
            loaded: 0,
            total,
            cancelled,
            notify,
            last_report: Instant::now(),
        };
        progress.report();
        progress
    }

    fn report(&mut self) {
        (self.notify)(SftpTransferProgress {
            loaded: self.loaded,
            total: self.total.max(self.loaded),
        });
        self.last_report = Instant::now();
    }

    fn copy(&mut self, source: &mut impl Read, target: &mut impl Write) -> Result<u64, AppError> {
        let initial = self.loaded;
        stream_upload(source, target, self.cancelled, |bytes| {
            self.loaded = initial + bytes;
            if self.last_report.elapsed() >= Duration::from_millis(100) {
                self.report();
            }
        })
    }
}

fn ensure_local_target_available(path: &Path) -> Result<(), AppError> {
    match std::fs::symlink_metadata(path) {
        Ok(_) => Err(AppError::InvalidInput(format!(
            "本地目标已存在: {}",
            path.display()
        ))),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn local_name(name: &str) -> Result<&str, AppError> {
    validate_name(name, "文件名")?;
    let mut components = Path::new(name).components();
    if !matches!(components.next(), Some(Component::Normal(part)) if part == name)
        || components.next().is_some()
    {
        return Err(AppError::InvalidInput(format!(
            "本地不支持此文件名: {name}"
        )));
    }
    #[cfg(windows)]
    {
        let stem = name
            .split('.')
            .next()
            .unwrap_or_default()
            .trim_end()
            .to_ascii_uppercase();
        let device_number = stem
            .strip_prefix("COM")
            .or_else(|| stem.strip_prefix("LPT"));
        if name.ends_with([' ', '.'])
            || name
                .chars()
                .any(|character| character.is_control() || "<>:\"|?*".contains(character))
            || matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
            || matches!(
                device_number,
                Some("1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³")
            )
        {
            return Err(AppError::InvalidInput(format!(
                "Windows 不支持此文件名: {name}"
            )));
        }
    }
    Ok(name)
}

fn remote_child(parent: &str, name: &str) -> String {
    format!("{}/{}", parent.trim_end_matches('/'), name)
}

fn sftp_error(error: ssh2::Error) -> AppError {
    AppError::Custom(format!("SFTP 目录传输失败: {error}"))
}

fn check_depth(depth: usize) -> Result<(), AppError> {
    if depth > 128 {
        return Err(AppError::InvalidInput("目录层级超过 128 层".into()));
    }
    Ok(())
}

fn local_metadata(path: &Path) -> Result<std::fs::Metadata, AppError> {
    let metadata = std::fs::symlink_metadata(path)?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err(AppError::InvalidInput("目录传输不跟随重解析点".into()));
        }
    }
    if !metadata.is_file() && !metadata.is_dir() {
        return Err(AppError::InvalidInput(
            "目录传输只支持普通文件和目录".into(),
        ));
    }
    Ok(metadata)
}

fn local_tree_size(path: &Path, cancelled: &AtomicBool, depth: usize) -> Result<u64, AppError> {
    check_cancelled(cancelled)?;
    check_depth(depth)?;
    let metadata = local_metadata(path)?;
    if metadata.is_file() {
        return Ok(metadata.len());
    }
    let mut total = 0;
    for entry in std::fs::read_dir(path)? {
        total += local_tree_size(&entry?.path(), cancelled, depth + 1)?;
    }
    Ok(total)
}

fn upload_local_directory(
    sftp: &ssh2::Sftp,
    local: &Path,
    remote: &str,
    transfer: &mut TransferProgress<'_>,
    depth: usize,
    overwrite: bool,
) -> Result<(), AppError> {
    check_depth(depth)?;
    for entry in std::fs::read_dir(local)? {
        check_cancelled(transfer.cancelled)?;
        let entry = entry?;
        let path = entry.path();
        let metadata = local_metadata(&path)?;
        let name = entry.file_name();
        let name = name
            .to_str()
            .ok_or_else(|| AppError::InvalidInput("文件名不是有效 UTF-8".into()))?;
        validate_name(name, "文件名")?;
        let child = remote_child(remote, name);
        if metadata.is_dir() {
            match sftp.mkdir(Path::new(&child), 0o755) {
                Ok(()) => {}
                Err(_) if overwrite && remote_upload_target(sftp, Path::new(&child))?.is_some_and(|stat| stat.is_dir()) => {}
                Err(error) => return Err(sftp_error(error)),
            }
            upload_local_directory(sftp, &path, &child, transfer, depth + 1, overwrite)?;
        } else {
            let mut source = std::fs::File::open(&path)?;
            let temporary = remote_child(
                remote,
                &format!(".opspub-upload-{}.part", uuid::Uuid::new_v4()),
            );
            let mut target = sftp
                .open_mode(
                    Path::new(&temporary),
                    ssh2::OpenFlags::WRITE | ssh2::OpenFlags::CREATE | ssh2::OpenFlags::EXCLUSIVE,
                    0o644,
                    ssh2::OpenType::File,
                )
                .map_err(sftp_error)?;
            let write_result = transfer.copy(&mut source, &mut target);
            let close_result = target.close().map_err(sftp_error);
            let written = match (write_result, close_result) {
                (Ok(written), Ok(())) => written,
                (Err(error), _) | (_, Err(error)) => {
                    let _ = sftp.unlink(Path::new(&temporary));
                    return Err(error);
                }
            };
            if written != metadata.len() {
                let _ = sftp.unlink(Path::new(&temporary));
                return Err(AppError::Custom(format!(
                    "文件在上传过程中发生变化: {name}"
                )));
            }
            let result = check_cancelled(transfer.cancelled).and_then(|()| {
                commit_upload_file(sftp, Path::new(&temporary), Path::new(&child), overwrite)
            });
            if let Err(error) = result {
                let _ = sftp.unlink(Path::new(&temporary));
                return Err(error);
            }
        }
    }
    Ok(())
}

fn remote_upload_target(sftp: &ssh2::Sftp, path: &Path) -> Result<Option<ssh2::FileStat>, AppError> {
    match sftp.lstat(path) {
        Ok(stat) => Ok(Some(stat)),
        Err(error) if error.code() == ssh2::ErrorCode::SFTP(2) => Ok(None),
        Err(error) => Err(sftp_error(error)),
    }
}

fn commit_new_upload(sftp: &ssh2::Sftp, source: &Path, target: &Path) -> Result<(), AppError> {
    match sftp.rename(source, target, Some(ssh2::RenameFlags::empty())) {
        Ok(()) => Ok(()),
        Err(error) => {
            if remote_upload_target(sftp, target)?.is_some() {
                return Err(AppError::SftpUploadConflict(target.display().to_string()));
            }
            Err(sftp_error(error))
        }
    }
}

fn commit_upload_file(
    sftp: &ssh2::Sftp,
    source: &Path,
    target: &Path,
    overwrite: bool,
) -> Result<(), AppError> {
    if !overwrite {
        return commit_new_upload(sftp, source, target);
    }
    match remote_upload_target(sftp, target)? {
        None => return commit_new_upload(sftp, source, target),
        Some(stat) if stat.is_file() => {}
        Some(_) => return Err(AppError::SftpUploadConflict(target.display().to_string())),
    }
    if sftp.rename(source, target, Some(ssh2::RenameFlags::OVERWRITE)).is_ok() {
        return Ok(());
    }

    // OpenSSH 的 SFTP v3 不接收覆盖标志。先保留原文件，提交失败时恢复。
    let backup = source.with_extension("backup");
    commit_new_upload(sftp, target, &backup)?;
    if let Err(error) = commit_new_upload(sftp, source, target) {
        if let Err(restore) = commit_new_upload(sftp, &backup, target) {
            return Err(AppError::Custom(format!(
                "上传失败：{error}。恢复原文件失败：{restore}。原文件保存在 {}",
                backup.display()
            )));
        }
        return Err(error);
    }
    if let Err(error) = sftp.unlink(&backup) {
        log::warn!("未清理 SFTP 覆盖备份 {}: {error}", backup.display());
    }
    Ok(())
}

fn remote_children(
    sftp: &ssh2::Sftp,
    path: &Path,
    cancelled: Option<&AtomicBool>,
) -> Result<Vec<(String, ssh2::FileStat)>, AppError> {
    let mut directory = sftp.opendir(path).map_err(sftp_error)?;
    let mut entries = Vec::new();
    loop {
        if let Some(cancelled) = cancelled {
            check_cancelled(cancelled)?;
        }
        let (entry, stat) = match directory.readdir() {
            Ok(entry) => entry,
            // ssh2 用此错误表示已读到目录末尾。
            Err(error)
                if error.code() == ssh2::ErrorCode::Session(-16)
                    && error.message() == "no more files" =>
            {
                break
            }
            Err(error) => return Err(sftp_error(error)),
        };
        let name = entry
            .to_str()
            .ok_or_else(|| AppError::InvalidInput("远程文件名不是有效 UTF-8".into()))?;
        if matches!(name, "." | "..") {
            continue;
        }
        validate_name(name, "远程文件名")?;
        entries.push((name.to_owned(), stat));
    }
    Ok(entries)
}

fn remote_tree_size(
    sftp: &ssh2::Sftp,
    path: &Path,
    stat: &ssh2::FileStat,
    cancelled: &AtomicBool,
    depth: usize,
) -> Result<u64, AppError> {
    check_cancelled(cancelled)?;
    check_depth(depth)?;
    if stat.is_file() {
        return Ok(stat.size.unwrap_or_default());
    }
    if !stat.is_dir() {
        return Err(AppError::InvalidInput("下载只支持普通文件和目录".into()));
    }
    let mut total = 0;
    for (name, stat) in remote_children(sftp, path, Some(cancelled))? {
        local_name(&name)?;
        total += remote_tree_size(sftp, &path.join(name), &stat, cancelled, depth + 1)?;
    }
    Ok(total)
}

fn download_node(
    sftp: &ssh2::Sftp,
    remote: &Path,
    local: &Path,
    transfer: &mut TransferProgress<'_>,
    depth: usize,
) -> Result<(), AppError> {
    check_cancelled(transfer.cancelled)?;
    check_depth(depth)?;
    let stat = sftp.lstat(remote).map_err(sftp_error)?;
    if stat.is_dir() {
        std::fs::create_dir(local)?;
        for (name, _) in remote_children(sftp, remote, Some(transfer.cancelled))? {
            let name = local_name(&name)?;
            download_node(
                sftp,
                &remote.join(name),
                &local.join(name),
                transfer,
                depth + 1,
            )?;
        }
    } else if stat.is_file() {
        let mut target = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(local)?;
        download_file(sftp, remote, &stat, &mut target, transfer)?;
        target.sync_all()?;
    } else {
        return Err(AppError::InvalidInput("下载只支持普通文件和目录".into()));
    }
    Ok(())
}

fn download_file(
    sftp: &ssh2::Sftp,
    remote: &Path,
    stat: &ssh2::FileStat,
    target: &mut impl Write,
    transfer: &mut TransferProgress<'_>,
) -> Result<(), AppError> {
    let mut source = sftp.open(remote).map_err(sftp_error)?;
    let written = transfer.copy(&mut source, target)?;
    if stat.size.is_some_and(|size| written != size) {
        return Err(AppError::Custom(format!(
            "文件在下载过程中发生变化: {}",
            remote.display()
        )));
    }
    Ok(())
}

fn remove_staged_remote(sftp: &ssh2::Sftp, path: &str, depth: usize) -> Result<(), AppError> {
    check_depth(depth)?;
    let remote = Path::new(path);
    for (name, stat) in remote_children(sftp, remote, None)? {
        let child = remote_child(path, &name);
        if stat.is_dir() {
            remove_staged_remote(sftp, &child, depth + 1)?;
        } else {
            sftp.unlink(Path::new(&child)).map_err(sftp_error)?;
        }
    }
    sftp.rmdir(remote).map_err(sftp_error)
}

fn check_cancelled(cancelled: &AtomicBool) -> Result<(), AppError> {
    if cancelled.load(Ordering::Acquire) {
        return Err(AppError::Custom("传输已取消".into()));
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stages_nested_files_including_empty_directories() -> Result<(), AppError> {
        let manager = SftpManager::default();
        let id = uuid::Uuid::new_v4().to_string();
        manager.stage_upload_drop(&id, SftpStageDropAction::Begin)?;
        for path in [vec!["sample".into()], vec!["sample".into(), "empty".into()]] {
            manager.stage_upload_drop(&id, SftpStageDropAction::Directory { path })?;
        }
        let path = vec!["sample".into(), "file.txt".into()];
        for (offset, data) in [(0, b"first".to_vec()), (5, b"second".to_vec())] {
            manager.stage_upload_drop(
                &id,
                SftpStageDropAction::Chunk {
                    path: path.clone(),
                    offset,
                    data,
                },
            )?;
        }
        let root = manager
            .upload_staging
            .get(&id)
            .ok_or_else(|| AppError::NotFound("上传临时目录".into()))?
            .path()
            .to_path_buf();
        assert!(root.join("sample/empty").is_dir());
        assert_eq!(std::fs::read(root.join("sample/file.txt"))?, b"firstsecond");
        assert_eq!(local_tree_size(&root, &AtomicBool::new(false), 0)?, 11);
        manager.stage_upload_drop(&id, SftpStageDropAction::Release)?;
        assert!(!root.exists());
        Ok(())
    }

    #[test]
    fn rejects_unsafe_download_names_and_preserves_existing_destinations() -> Result<(), AppError> {
        for name in ["..", ".", "/absolute", "../outside", "sub\\file"] {
            assert!(local_name(name).is_err(), "{name}");
        }
        #[cfg(windows)]
        for name in ["C:relative", "file:stream", "COM1.txt", "name."] {
            assert!(local_name(name).is_err(), "{name}");
        }
        let dir = tempfile::tempdir()?;
        let destination = dir.path().join("existing");
        std::fs::write(&destination, b"keep")?;
        assert!(ensure_local_target_available(&destination).is_err());
        assert_eq!(std::fs::read(destination)?, b"keep");
        Ok(())
    }

    #[test]
    fn streaming_stops_when_cancelled_between_chunks() {
        let cancelled = AtomicBool::new(false);
        let mut source = Cursor::new(vec![1; 512 * 1024]);
        let mut target = Vec::new();
        let result = stream_upload(&mut source, &mut target, &cancelled, |_| {
            cancelled.store(true, Ordering::Release);
        });
        assert!(result.is_err());
        assert_eq!(target.len(), 256 * 1024);
    }
}
