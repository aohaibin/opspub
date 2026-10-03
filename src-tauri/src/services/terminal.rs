use std::collections::VecDeque;
use std::io::{ErrorKind, Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc};
use std::thread;
use std::time::Duration;

use dashmap::DashMap;
use ssh2::{Channel, Session};
use tauri::{AppHandle, Emitter};

use crate::database::Database;
use crate::error::AppError;
use crate::models::{
    TerminalOpenRequest, TerminalOutputEvent, TerminalSessionInfo, TerminalStatusEvent,
};
use crate::services::server::ServerService;

pub const TERMINAL_OUTPUT_EVENT: &str = "terminal-output";
pub const TERMINAL_STATUS_EVENT: &str = "terminal-status";

enum TerminalControl {
    Input(Vec<u8>),
    Resize { cols: u32, rows: u32 },
    Close,
}

/// 交互式 SSH 会话注册表。注册表只保存控制通道，不保存任何认证凭据。
pub struct TerminalManager {
    sessions: Arc<DashMap<String, mpsc::Sender<TerminalControl>>>,
    session_info: Arc<DashMap<String, TerminalSessionInfo>>,
    server_sessions: Arc<DashMap<i64, String>>,
    output_history: Arc<DashMap<String, String>>,
    sequence: AtomicU64,
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self {
            sessions: Arc::new(DashMap::new()),
            session_info: Arc::new(DashMap::new()),
            server_sessions: Arc::new(DashMap::new()),
            output_history: Arc::new(DashMap::new()),
            sequence: AtomicU64::new(1),
        }
    }
}

impl Drop for TerminalManager {
    fn drop(&mut self) {
        // 兜底处理非标准退出路径，正常关闭按钮/托盘退出会提前调用 close_all。
        self.close_all();
    }
}

impl TerminalManager {
    pub fn open(
        &self,
        app: AppHandle,
        db: &Database,
        request: TerminalOpenRequest,
    ) -> Result<TerminalSessionInfo, AppError> {
        // 一个服务器只复用一条终端会话。这样从服务器列表重复点击、或切换菜单回来，
        // 都不会重新握手、重复弹出 SSH 验证框。
        if let Some(existing_id) = self
            .server_sessions
            .get(&request.server_id)
            .map(|id| id.clone())
        {
            if let Some(existing) = self.session_info.get(&existing_id) {
                if existing.status == "connected" || existing.status == "connecting" {
                    return Ok(existing.clone());
                }
            }
            self.server_sessions.remove(&request.server_id);
        }

        let (server, session) = ServerService::connect_terminal(db, &request)?;
        let mut channel = session
            .channel_session()
            .map_err(|error| AppError::Custom(format!("创建 SSH 终端通道失败: {error}")))?;
        channel
            .request_pty("xterm-256color", None, Some((120, 32, 0, 0)))
            .map_err(|error| AppError::Custom(format!("申请远程 PTY 失败: {error}")))?;
        channel
            .shell()
            .map_err(|error| AppError::Custom(format!("启动远程 Shell 失败: {error}")))?;
        session.set_blocking(false);

        let sequence = self.sequence.fetch_add(1, Ordering::Relaxed);
        let session_id = format!(
            "term-{}-{}-{}",
            server.id,
            chrono::Utc::now().timestamp_millis(),
            sequence
        );
        let info = TerminalSessionInfo {
            session_id: session_id.clone(),
            server_id: server.id,
            status: "connected".into(),
            started_at: chrono::Local::now().to_rfc3339(),
            output: String::new(),
            message: "SSH 终端已连接".into(),
        };
        let (sender, receiver) = mpsc::channel();
        self.sessions.insert(session_id.clone(), sender);
        self.session_info.insert(session_id.clone(), info.clone());
        self.server_sessions.insert(server.id, session_id.clone());
        self.output_history
            .insert(session_id.clone(), String::new());

        let registry = Arc::clone(&self.sessions);
        let session_info = Arc::clone(&self.session_info);
        let server_sessions = Arc::clone(&self.server_sessions);
        let output_history = Arc::clone(&self.output_history);
        let worker_id = session_id.clone();
        thread::Builder::new()
            .name(format!("ssh-{worker_id}"))
            .spawn(move || {
                run_terminal(
                    app,
                    registry,
                    session_info,
                    server_sessions,
                    output_history,
                    worker_id,
                    server.id,
                    session,
                    channel,
                    receiver,
                )
            })
            .map_err(|error| {
                self.sessions.remove(&session_id);
                self.session_info.remove(&session_id);
                self.server_sessions.remove(&server.id);
                self.output_history.remove(&session_id);
                AppError::Custom(format!("启动 SSH 终端线程失败: {error}"))
            })?;

        Ok(info)
    }

    pub fn write(&self, session_id: &str, data: String) -> Result<(), AppError> {
        if data.is_empty() {
            return Ok(());
        }
        self.send(session_id, TerminalControl::Input(data.into_bytes()))
    }

    pub fn resize(&self, session_id: &str, cols: u32, rows: u32) -> Result<(), AppError> {
        if !(2..=500).contains(&cols) || !(1..=300).contains(&rows) {
            return Err(AppError::InvalidInput(format!(
                "终端尺寸无效: {cols}x{rows}"
            )));
        }
        self.send(session_id, TerminalControl::Resize { cols, rows })
    }

    pub fn close(&self, session_id: &str) -> Result<(), AppError> {
        // 先把会话标记为 closing 并解除服务器映射，再发送关闭信号。
        // 这样用户关闭后立即重新连接时不会短暂复用旧 PTY；旧线程收尾时
        // 也不会误删随后创建的新会话映射。
        let server_id = self.session_info.get_mut(session_id).and_then(|mut info| {
            if info.status == "closed" || info.status == "error" {
                return None;
            }
            info.status = "closing".into();
            info.message = "正在关闭 SSH 终端".into();
            Some(info.server_id)
        });
        if let Some(server_id) = server_id {
            remove_server_mapping_if_matches(&self.server_sessions, server_id, session_id);
        }

        if let Some(sender) = self.sessions.get(session_id) {
            sender
                .send(TerminalControl::Close)
                .map_err(|_| AppError::Custom("终端会话已经结束".into()))?;
        }
        Ok(())
    }

    /// 返回当前进程仍保持的所有会话及离线期间缓存的输出。
    pub fn list(&self) -> Vec<TerminalSessionInfo> {
        self.session_info
            .iter()
            .map(|item| {
                let mut info = item.value().clone();
                info.output = self
                    .output_history
                    .get(item.key())
                    .map(|value| value.clone())
                    .unwrap_or_default();
                info
            })
            .collect()
    }

    /// 应用退出前发送关闭信号。即使进程随后立即退出，SSH Session 被丢弃也会主动断开 TCP。
    pub fn close_all(&self) {
        let ids: Vec<String> = self
            .sessions
            .iter()
            .map(|item| item.key().clone())
            .collect();
        for id in ids {
            let _ = self.close(&id);
        }
    }

    fn send(&self, session_id: &str, control: TerminalControl) -> Result<(), AppError> {
        let sender = self
            .sessions
            .get(session_id)
            .ok_or_else(|| AppError::NotFound("终端会话不存在或已经结束".into()))?;
        sender
            .send(control)
            .map_err(|_| AppError::Custom("终端会话已经结束".into()))
    }
}

fn run_terminal(
    app: AppHandle,
    registry: Arc<DashMap<String, mpsc::Sender<TerminalControl>>>,
    session_info: Arc<DashMap<String, TerminalSessionInfo>>,
    server_sessions: Arc<DashMap<i64, String>>,
    output_history: Arc<DashMap<String, String>>,
    session_id: String,
    server_id: i64,
    session: Session,
    mut channel: Channel,
    receiver: mpsc::Receiver<TerminalControl>,
) {
    update_session(
        &session_info,
        &output_history,
        &session_id,
        "connected",
        "SSH 终端已连接",
    );
    emit_status(&app, &session_id, "connected", "SSH 终端已连接");
    let mut pending = VecDeque::<u8>::new();
    let mut stdout = [0_u8; 8192];
    let mut stderr = [0_u8; 4096];
    let mut stderr_stream = channel.stderr();
    let mut close_requested = false;
    let mut failure_message = None;

    while !close_requested {
        loop {
            match receiver.try_recv() {
                Ok(TerminalControl::Input(data)) => pending.extend(data),
                Ok(TerminalControl::Resize { cols, rows }) => {
                    if let Err(error) = channel.request_pty_size(cols, rows, None, None) {
                        failure_message = Some(format!("调整终端尺寸失败: {error}"));
                        close_requested = true;
                        break;
                    }
                }
                Ok(TerminalControl::Close) | Err(mpsc::TryRecvError::Disconnected) => {
                    close_requested = true;
                    break;
                }
                Err(mpsc::TryRecvError::Empty) => break,
            }
        }

        if !pending.is_empty() {
            let contiguous = pending.make_contiguous();
            match channel.write(contiguous) {
                Ok(written) => {
                    pending.drain(..written);
                    let _ = channel.flush();
                }
                Err(error) if is_would_block(&error) => {}
                Err(error) => {
                    failure_message = Some(format!("写入 SSH 终端失败: {error}"));
                    break;
                }
            }
        }

        let mut received_output = false;
        match channel.read(&mut stdout) {
            Ok(0) => {}
            Ok(size) => {
                received_output = true;
                append_output(&output_history, &session_id, &stdout[..size]);
                emit_output(&app, &session_id, &stdout[..size]);
            }
            Err(error) if is_would_block(&error) => {}
            Err(error) => {
                failure_message = Some(format!("读取 SSH 终端输出失败: {error}"));
                break;
            }
        }

        match stderr_stream.read(&mut stderr) {
            Ok(0) => {}
            Ok(size) => {
                received_output = true;
                append_output(&output_history, &session_id, &stderr[..size]);
                emit_output(&app, &session_id, &stderr[..size]);
            }
            Err(error) if is_would_block(&error) => {}
            Err(error) => {
                failure_message = Some(format!("读取 SSH 终端错误输出失败: {error}"));
                break;
            }
        }

        if channel.eof() {
            break;
        }
        if !received_output {
            thread::sleep(Duration::from_millis(if pending.is_empty() {
                12
            } else {
                4
            }));
        }
    }

    session.set_blocking(true);
    session.set_timeout(1_000);
    let _ = channel.send_eof();
    let _ = channel.close();
    let _ = channel.wait_close();
    registry.remove(&session_id);
    remove_server_mapping_if_matches(&server_sessions, server_id, &session_id);

    if let Some(message) = failure_message {
        update_session(
            &session_info,
            &output_history,
            &session_id,
            "error",
            &message,
        );
        emit_status(&app, &session_id, "error", &message);
    } else {
        update_session(
            &session_info,
            &output_history,
            &session_id,
            "closed",
            "SSH 终端已断开",
        );
        emit_status(&app, &session_id, "closed", "SSH 终端已断开");
    }
    session_info.remove(&session_id);
    output_history.remove(&session_id);
}

fn remove_server_mapping_if_matches(
    server_sessions: &DashMap<i64, String>,
    server_id: i64,
    session_id: &str,
) {
    server_sessions.remove_if(&server_id, |_server_id, mapped| mapped == session_id);
}

fn append_output(history: &DashMap<String, String>, session_id: &str, bytes: &[u8]) {
    let mut entry = history.entry(session_id.to_string()).or_default();
    entry.push_str(&String::from_utf8_lossy(bytes));
    if entry.len() > 750_000 {
        let mut start = entry.len() - 600_000;
        while !entry.is_char_boundary(start) {
            start += 1;
        }
        entry.drain(..start);
    }
}

fn update_session(
    info: &DashMap<String, TerminalSessionInfo>,
    history: &DashMap<String, String>,
    session_id: &str,
    status: &str,
    message: &str,
) {
    if let Some(mut item) = info.get_mut(session_id) {
        item.status = status.to_string();
        item.message = message.to_string();
        item.output = history
            .get(session_id)
            .map(|value| value.clone())
            .unwrap_or_default();
    }
}

fn is_would_block(error: &std::io::Error) -> bool {
    error.kind() == ErrorKind::WouldBlock
        || error.to_string().contains("would block")
        || error.to_string().contains("EAGAIN")
}

fn emit_output(app: &AppHandle, session_id: &str, bytes: &[u8]) {
    let payload = TerminalOutputEvent {
        session_id: session_id.to_string(),
        data: String::from_utf8_lossy(bytes).into_owned(),
    };
    if let Err(error) = app.emit(TERMINAL_OUTPUT_EVENT, payload) {
        log::warn!("推送终端输出失败 (session={}): {}", session_id, error);
    }
}

fn emit_status(app: &AppHandle, session_id: &str, status: &str, message: &str) {
    let payload = TerminalStatusEvent {
        session_id: session_id.to_string(),
        status: status.to_string(),
        message: message.to_string(),
    };
    if let Err(error) = app.emit(TERMINAL_STATUS_EVENT, payload) {
        log::warn!("推送终端状态失败 (session={}): {}", session_id, error);
    }
}
