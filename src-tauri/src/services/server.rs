use std::io::Read;
use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use ssh2::{HashType, HostKeyType, Session};

use crate::database::Database;
use crate::error::AppError;
use crate::services::credential::CredentialService;
use crate::models::{
    ConnectivityResult, Server, SshConfigHost, SshProbeRequest, SshProbeResult, TerminalOpenRequest,
};

/// 连通性探测超时（毫秒）
///
/// 3 秒是权衡值：公网跨地域 RTT 通常在 300ms 内，3 秒足以覆盖慢链路；
/// 而内网误填地址时又要尽快失败，避免用户盯着转圈等太久。
const CONNECT_TIMEOUT_MS: u64 = 3000;

/// SSH 握手、认证和只读命令共用的超时，避免网络半开时后台线程长期悬挂。
const SSH_TIMEOUT_MS: u32 = 10_000;

/// AI 策略允许的档位
const AI_POLICIES: [&str; 4] = ["trusted", "allowlist", "approval", "denied"];

/// 服务器管理服务
pub struct ServerService;

impl ServerService {
    /// 获取所有服务器
    pub fn get_all(db: &Database) -> Result<Vec<Server>, AppError> {
        db.get_all_servers()
    }

    /// 添加服务器
    #[allow(clippy::too_many_arguments)]
    pub fn add(
        db: &Database,
        alias: &str,
        hostname: &str,
        port: i32,
        username: &str,
        auth_type: &str,
        tags: &str,
        group: &str,
        ai_policy: &str,
        os_type: &str,
        arch: &str,
        allow_sudo: bool,
        use_local_proxy: bool,
        bastion_id: Option<i64>,
        ai_username: &str,
    ) -> Result<i64, AppError> {
        let alias = alias.trim();
        let hostname = hostname.trim();
        if alias.is_empty() || hostname.is_empty() {
            return Err(AppError::InvalidInput("别名和主机名不能为空".into()));
        }

        validate_port(port)?;
        validate_enum("认证方式", auth_type, &["password", "key"])?;
        validate_enum("操作系统", os_type, &["linux", "windows"])?;
        validate_enum("AI 策略", ai_policy, &AI_POLICIES)?;

        db.add_server(
            alias,
            hostname,
            port,
            username.trim(),
            auth_type,
            &normalize_tags(tags)?,
            group.trim(),
            ai_policy,
            os_type,
            arch.trim(),
            allow_sudo,
            use_local_proxy,
            bastion_id,
            ai_username.trim(),
        )
    }

    /// 更新服务器
    #[allow(clippy::too_many_arguments)]
    pub fn update(
        db: &Database,
        id: i64,
        alias: &str,
        hostname: &str,
        port: i32,
        username: &str,
        auth_type: &str,
        tags: &str,
        group: &str,
        ai_policy: &str,
        os_type: &str,
        arch: &str,
        allow_sudo: bool,
        use_local_proxy: bool,
        bastion_id: Option<i64>,
        ai_username: &str,
    ) -> Result<(), AppError> {
        let alias = alias.trim();
        let hostname = hostname.trim();
        if alias.is_empty() || hostname.is_empty() {
            return Err(AppError::InvalidInput("别名和主机名不能为空".into()));
        }

        validate_port(port)?;
        validate_enum("认证方式", auth_type, &["password", "key"])?;
        validate_enum("操作系统", os_type, &["linux", "windows"])?;
        validate_enum("AI 策略", ai_policy, &AI_POLICIES)?;

        db.update_server(
            id,
            alias,
            hostname,
            port,
            username.trim(),
            auth_type,
            &normalize_tags(tags)?,
            group.trim(),
            ai_policy,
            os_type,
            arch.trim(),
            allow_sudo,
            use_local_proxy,
            bastion_id,
            ai_username.trim(),
        )
    }

    /// 删除服务器
    pub fn delete(db: &Database, id: i64) -> Result<bool, AppError> {
        let deleted = db.delete_server(id)?;
        if deleted {
            if let Err(error) = CredentialService::delete(id) {
                log::warn!("删除服务器凭据失败 (id={}): {}", id, error);
            }
        }
        Ok(deleted)
    }

    /// 批量删除服务器
    pub fn batch_delete(db: &Database, ids: &[i64]) -> Result<usize, AppError> {
        if ids.is_empty() {
            return Err(AppError::InvalidInput("请先选择要移除的服务器".into()));
        }
        let deleted = db.batch_delete_servers(ids)?;
        for id in ids {
            if let Err(error) = CredentialService::delete(*id) {
                log::warn!("删除服务器凭据失败 (id={}): {}", id, error);
            }
        }
        Ok(deleted)
    }

    /// 批量设置 AI 策略档位
    pub fn batch_update_policy(
        db: &Database,
        ids: &[i64],
        ai_policy: &str,
    ) -> Result<usize, AppError> {
        if ids.is_empty() {
            return Err(AppError::InvalidInput("请先选择要调整的服务器".into()));
        }
        validate_enum("AI 策略", ai_policy, &AI_POLICIES)?;
        db.batch_update_policy(ids, ai_policy)
    }

    /// 批量追加标签
    pub fn batch_add_tags(db: &Database, ids: &[i64], tags: &[String]) -> Result<usize, AppError> {
        if ids.is_empty() {
            return Err(AppError::InvalidInput("请先选择要打标签的服务器".into()));
        }

        // 去重 + trim，前端可能因为用户连按回车而传入重复项
        let mut cleaned: Vec<String> = Vec::new();
        for tag in tags {
            let tag = tag.trim().to_string();
            if !tag.is_empty() && !cleaned.contains(&tag) {
                cleaned.push(tag);
            }
        }
        if cleaned.is_empty() {
            return Err(AppError::InvalidInput("请至少填写一个标签".into()));
        }

        db.batch_add_tags(ids, &cleaned)
    }

    /// 切换收藏状态
    pub fn set_favorite(db: &Database, id: i64, favorite: bool) -> Result<bool, AppError> {
        db.set_favorite(id, favorite)
    }

    /// 刷新「最近探活」时间
    pub fn touch_last_used(db: &Database, id: i64) -> Result<(), AppError> {
        db.touch_last_used(id)
    }

    /// 读取并解析 ~/.ssh/config，返回可纳管的主机条目
    ///
    /// 文件不存在时返回 NotFound 而不是空列表：两者对用户的含义完全不同，
    /// 空列表会被理解成「配置里没有主机」，从而白白排查半天。
    pub fn read_ssh_config(path: &std::path::Path) -> Result<Vec<SshConfigHost>, AppError> {
        if !path.exists() {
            return Err(AppError::NotFound(format!(
                "未找到 SSH 配置文件：{}",
                path.display()
            )));
        }
        let content = std::fs::read_to_string(path)?;
        Ok(parse_ssh_config(&content))
    }

    /// 连通性探测（纯 TCP 三次握手）
    ///
    /// 只握手、不认证：成功仅代表「网络可达 + 该端口有服务监听」，
    /// 凭据是否正确需要等 SSH 会话落地后才能真正验证，因此结果文案里要写明这一点，
    /// 否则用户会把「端口通」误当成「能登录」。
    ///
    /// 返回 ConnectivityResult 而不是 Err：探测失败属于正常的业务结果
    /// （网络不通是预期内的常见情况），用 Err 表达会让前端把「连不上」显示成红色异常弹窗。
    pub fn test_connectivity(hostname: &str, port: i32) -> ConnectivityResult {
        let hostname = hostname.trim();
        if hostname.is_empty() {
            return ConnectivityResult {
                ok: false,
                latency_ms: None,
                message: "主机地址不能为空".into(),
            };
        }
        if !(1..=65535).contains(&port) {
            return ConnectivityResult {
                ok: false,
                latency_ms: None,
                message: format!("端口 {} 超出有效范围 1-65535", port),
            };
        }

        // DNS 解析失败与 TCP 不可达是两类不同的问题，分开提示能省掉一轮排查
        let addrs = match (hostname, port as u16).to_socket_addrs() {
            Ok(iter) => iter.collect::<Vec<_>>(),
            Err(e) => {
                return ConnectivityResult {
                    ok: false,
                    latency_ms: None,
                    message: format!("域名解析失败：{}", e),
                }
            }
        };

        if addrs.is_empty() {
            return ConnectivityResult {
                ok: false,
                latency_ms: None,
                message: format!("主机 {} 未解析出任何可用地址", hostname),
            };
        }

        let timeout = Duration::from_millis(CONNECT_TIMEOUT_MS);
        let mut last_error = None;

        // 双栈域名可能解析出 IPv4/IPv6 多个地址，逐个尝试；耗时按单次握手计，
        // 不能把多次尝试的时间累加，否则延迟数字会虚高。
        for addr in addrs {
            let started = Instant::now();
            match TcpStream::connect_timeout(&addr, timeout) {
                Ok(_stream) => {
                    let latency = started.elapsed().as_millis() as u64;
                    return ConnectivityResult {
                        ok: true,
                        latency_ms: Some(latency),
                        message: format!(
                            "TCP 可达（{}），握手耗时 {} ms；未验证登录凭据",
                            addr, latency
                        ),
                    };
                }
                Err(e) => last_error = Some(e),
            }
        }

        ConnectivityResult {
            ok: false,
            latency_ms: None,
            message: format!(
                "连接失败：{}",
                last_error
                    .map(|e| e.to_string())
                    .unwrap_or_else(|| "未知错误".into())
            ),
        }
    }

    /// 建立真实 SSH 会话并读取远端系统摘要。
    ///
    /// 密码、私钥路径和口令只存在于当前调用栈；验证成功后由命令层显式写入系统凭据管理器，
    /// 服务器数据库只保存验证状态、主机指纹和系统摘要。
    pub fn test_ssh(db: &Database, request: SshProbeRequest) -> Result<SshProbeResult, AppError> {
        let server = db
            .get_server_by_id(request.server_id)?
            .ok_or_else(|| AppError::NotFound(format!("服务器 {} 不存在", request.server_id)))?;

        match probe_ssh(&server, &request) {
            Ok(result) => {
                if result.connected {
                    db.record_ssh_result(
                        server.id,
                        "verified",
                        &result.message,
                        &result.fingerprint,
                        &result.arch,
                    )?;
                }
                Ok(result)
            }
            Err(failure) => {
                if let Err(error) =
                    db.record_ssh_result(server.id, failure.status, &failure.message, "", "")
                {
                    log::warn!("记录 SSH 验证失败状态时出错 (id={}): {}", server.id, error);
                }
                Err(AppError::Custom(failure.message))
            }
        }
    }

    /// 为交互式终端建立已认证会话。
    ///
    /// 终端只能使用已经确认过的主机指纹，避免绕过首次连接的人工信任步骤。
    pub(crate) fn connect_terminal(
        db: &Database,
        request: &TerminalOpenRequest,
    ) -> Result<(Server, Session), AppError> {
        let server = db
            .get_server_by_id(request.server_id)?
            .ok_or_else(|| AppError::NotFound(format!("服务器 {} 不存在", request.server_id)))?;

        if server.host_key_fingerprint.is_empty() {
            return Err(AppError::InvalidInput(
                "请先完成 SSH 验证并确认主机公钥指纹".into(),
            ));
        }

        let stream = connect_tcp(&server.hostname, server.port)
            .map_err(|failure| AppError::Custom(failure.message))?;
        stream.set_read_timeout(Some(Duration::from_millis(SSH_TIMEOUT_MS.into())))?;
        stream.set_write_timeout(Some(Duration::from_millis(SSH_TIMEOUT_MS.into())))?;

        let mut session = Session::new()
            .map_err(|error| AppError::Custom(format!("初始化 SSH 会话失败: {error}")))?;
        session.set_timeout(SSH_TIMEOUT_MS);
        session.set_tcp_stream(stream);
        session
            .handshake()
            .map_err(|error| AppError::Custom(format!("SSH 握手失败: {error}")))?;

        let fingerprint = session
            .host_key_hash(HashType::Sha256)
            .map(format_sha256_fingerprint)
            .ok_or_else(|| AppError::Custom("无法计算 SSH 主机公钥指纹".into()))?;
        if server.host_key_fingerprint != fingerprint {
            return Err(AppError::Custom(format!(
                "主机指纹已变化，已拒绝打开终端。已保存：{}；当前：{}",
                server.host_key_fingerprint, fingerprint
            )));
        }

        let stored = CredentialService::get(request.server_id)?.unwrap_or_default();
        let probe_request = SshProbeRequest {
            server_id: request.server_id,
            password: request.password.clone().or(stored.password),
            private_key_path: request.private_key_path.clone().or(stored.private_key_path),
            passphrase: request.passphrase.clone().or(stored.passphrase),
            trust_host_key: false,
        };
        authenticate(&session, &server, &probe_request)
            .map_err(|failure| AppError::Custom(failure.message))?;
        if !session.authenticated() {
            return Err(AppError::Custom(
                "SSH 认证失败，请检查凭据和登录策略".into(),
            ));
        }

        Ok((server, session))
    }
}

#[derive(Debug)]
struct SshProbeFailure {
    status: &'static str,
    message: String,
}

impl SshProbeFailure {
    fn failed(message: impl Into<String>) -> Self {
        Self {
            status: "failed",
            message: message.into(),
        }
    }

    fn host_key_changed(message: impl Into<String>) -> Self {
        Self {
            status: "host_key_changed",
            message: message.into(),
        }
    }
}

fn probe_ssh(
    server: &Server,
    request: &SshProbeRequest,
) -> Result<SshProbeResult, SshProbeFailure> {
    let username = server.username.trim();
    if username.is_empty() {
        return Err(SshProbeFailure::failed("SSH 用户名不能为空"));
    }

    let started = Instant::now();
    let stream = connect_tcp(&server.hostname, server.port)?;
    stream
        .set_read_timeout(Some(Duration::from_millis(SSH_TIMEOUT_MS.into())))
        .map_err(|error| SshProbeFailure::failed(format!("设置 SSH 读取超时失败: {error}")))?;
    stream
        .set_write_timeout(Some(Duration::from_millis(SSH_TIMEOUT_MS.into())))
        .map_err(|error| SshProbeFailure::failed(format!("设置 SSH 写入超时失败: {error}")))?;

    let mut session = Session::new()
        .map_err(|error| SshProbeFailure::failed(format!("初始化 SSH 会话失败: {error}")))?;
    session.set_timeout(SSH_TIMEOUT_MS);
    session.set_tcp_stream(stream);
    session
        .handshake()
        .map_err(|error| SshProbeFailure::failed(format!("SSH 握手失败: {error}")))?;

    let (_, host_key_type) = session
        .host_key()
        .ok_or_else(|| SshProbeFailure::failed("SSH 服务端未提供主机公钥"))?;
    let fingerprint = session
        .host_key_hash(HashType::Sha256)
        .map(format_sha256_fingerprint)
        .ok_or_else(|| SshProbeFailure::failed("无法计算 SSH 主机公钥指纹"))?;
    let host_key_type = host_key_type_label(host_key_type).to_string();

    if !server.host_key_fingerprint.is_empty() && server.host_key_fingerprint != fingerprint {
        return Err(SshProbeFailure::host_key_changed(format!(
            "主机指纹已变化，已拒绝认证。已保存：{}；当前：{}",
            server.host_key_fingerprint, fingerprint
        )));
    }

    if server.host_key_fingerprint.is_empty() && !request.trust_host_key {
        return Ok(SshProbeResult {
            connected: false,
            requires_host_key_trust: true,
            fingerprint,
            host_key_type,
            latency_ms: started.elapsed().as_millis() as u64,
            remote_hostname: String::new(),
            os_name: String::new(),
            arch: String::new(),
            uptime: String::new(),
            message: "首次连接需要确认主机公钥指纹".into(),
        });
    }

    authenticate(&session, server, request)?;
    if !session.authenticated() {
        return Err(SshProbeFailure::failed(
            "SSH 认证失败，请检查凭据和登录策略",
        ));
    }

    let output = execute_system_summary(&session, &server.os_type)?;
    let (os_name, arch, remote_hostname, uptime) = parse_system_summary(&output)?;
    let latency_ms = started.elapsed().as_millis() as u64;
    let message = format!(
        "SSH 认证成功：{} · {} · {} ms",
        remote_hostname, os_name, latency_ms
    );

    Ok(SshProbeResult {
        connected: true,
        requires_host_key_trust: false,
        fingerprint,
        host_key_type,
        latency_ms,
        remote_hostname,
        os_name,
        arch,
        uptime,
        message,
    })
}

fn connect_tcp(hostname: &str, port: i32) -> Result<TcpStream, SshProbeFailure> {
    let hostname = hostname.trim();
    if hostname.is_empty() {
        return Err(SshProbeFailure::failed("主机地址不能为空"));
    }
    if !(1..=65535).contains(&port) {
        return Err(SshProbeFailure::failed(format!(
            "端口 {port} 超出有效范围 1-65535"
        )));
    }

    let addresses = (hostname, port as u16)
        .to_socket_addrs()
        .map_err(|error| SshProbeFailure::failed(format!("域名解析失败: {error}")))?
        .collect::<Vec<_>>();
    if addresses.is_empty() {
        return Err(SshProbeFailure::failed(format!(
            "主机 {hostname} 未解析出可用地址"
        )));
    }

    let timeout = Duration::from_millis(CONNECT_TIMEOUT_MS);
    let mut last_error = None;
    for address in addresses {
        match TcpStream::connect_timeout(&address, timeout) {
            Ok(stream) => return Ok(stream),
            Err(error) => last_error = Some(error),
        }
    }

    Err(SshProbeFailure::failed(format!(
        "SSH 端口连接失败: {}",
        last_error
            .map(|error| error.to_string())
            .unwrap_or_else(|| "未知错误".into())
    )))
}

fn authenticate(
    session: &Session,
    server: &Server,
    request: &SshProbeRequest,
) -> Result<(), SshProbeFailure> {
    match server.auth_type.as_str() {
        "password" => {
            let password = request
                .password
                .as_deref()
                .filter(|value| !value.is_empty())
                .ok_or_else(|| SshProbeFailure::failed("请输入 SSH 登录密码"))?;
            session
                .userauth_password(server.username.trim(), password)
                .map_err(|_| SshProbeFailure::failed("SSH 密码认证失败，请检查账号或密码"))?;
        }
        "key" => {
            let private_key = request
                .private_key_path
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| SshProbeFailure::failed("请选择或填写 SSH 私钥路径"))?;
            let private_key = expand_home_path(private_key);
            if !private_key.is_file() {
                return Err(SshProbeFailure::failed(format!(
                    "私钥文件不存在或不可读取：{}",
                    private_key.display()
                )));
            }
            let passphrase = request
                .passphrase
                .as_deref()
                .filter(|value| !value.is_empty());
            session
                .userauth_pubkey_file(server.username.trim(), None, &private_key, passphrase)
                .map_err(|_| {
                    SshProbeFailure::failed("SSH 私钥认证失败，请检查私钥、口令或服务端授权")
                })?;
        }
        _ => {
            return Err(SshProbeFailure::failed(format!(
                "不支持的 SSH 认证方式：{}",
                server.auth_type
            )))
        }
    }
    Ok(())
}

fn execute_system_summary(session: &Session, os_type: &str) -> Result<String, SshProbeFailure> {
    let command = if os_type == "windows" {
        r#"powershell -NoProfile -NonInteractive -Command "$os=[Environment]::OSVersion.VersionString; $arch=$env:PROCESSOR_ARCHITECTURE; $hostName=$env:COMPUTERNAME; $boot=(Get-CimInstance Win32_OperatingSystem).LastBootUpTime; $up=(Get-Date)-$boot; Write-Output $os; Write-Output $arch; Write-Output $hostName; Write-Output ('Up {0}d {1}h {2}m' -f $up.Days,$up.Hours,$up.Minutes)""#
    } else {
        r#"printf '%s\n' "$(uname -s 2>/dev/null || echo Linux)" "$(uname -m 2>/dev/null)" "$(hostname 2>/dev/null)" "$(uptime -p 2>/dev/null || uptime 2>/dev/null)""#
    };

    let mut channel = session
        .channel_session()
        .map_err(|error| SshProbeFailure::failed(format!("创建 SSH 命令通道失败: {error}")))?;
    channel
        .exec(command)
        .map_err(|error| SshProbeFailure::failed(format!("执行系统信息探测失败: {error}")))?;

    let mut output = String::new();
    channel
        .read_to_string(&mut output)
        .map_err(|error| SshProbeFailure::failed(format!("读取系统信息失败: {error}")))?;
    channel
        .wait_close()
        .map_err(|error| SshProbeFailure::failed(format!("关闭 SSH 命令通道失败: {error}")))?;
    let exit_status = channel
        .exit_status()
        .map_err(|error| SshProbeFailure::failed(format!("读取远程命令状态失败: {error}")))?;
    if exit_status != 0 {
        return Err(SshProbeFailure::failed(format!(
            "远程系统信息命令执行失败（退出码 {exit_status}）"
        )));
    }
    Ok(output)
}

fn parse_system_summary(output: &str) -> Result<(String, String, String, String), SshProbeFailure> {
    let lines = output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();
    if lines.len() < 3 {
        return Err(SshProbeFailure::failed(
            "SSH 已认证，但远程系统摘要返回不完整",
        ));
    }

    Ok((
        lines[0].to_string(),
        lines[1].to_string(),
        lines[2].to_string(),
        lines.get(3).copied().unwrap_or("未知").to_string(),
    ))
}

fn format_sha256_fingerprint(bytes: &[u8]) -> String {
    let hex = bytes
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<Vec<_>>()
        .join(":");
    format!("SHA256:{hex}")
}

fn host_key_type_label(key_type: HostKeyType) -> &'static str {
    match key_type {
        HostKeyType::Rsa => "RSA",
        HostKeyType::Dss => "DSA",
        HostKeyType::Ecdsa256 => "ECDSA-256",
        HostKeyType::Ecdsa384 => "ECDSA-384",
        HostKeyType::Ecdsa521 => "ECDSA-521",
        HostKeyType::Ed25519 => "ED25519",
        HostKeyType::Unknown => "UNKNOWN",
    }
}

fn expand_home_path(raw: &str) -> PathBuf {
    let path = raw.trim().trim_matches('"');
    if path == "~" || path.starts_with("~/") || path.starts_with("~\\") {
        let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"));
        if let Some(home) = home {
            let suffix = path
                .strip_prefix("~/")
                .or_else(|| path.strip_prefix("~\\"))
                .unwrap_or("");
            return Path::new(&home).join(suffix);
        }
    }
    PathBuf::from(path)
}

/// 解析 ~/.ssh/config 文本，返回可纳管的主机条目
///
/// 只识别 Host / HostName / User / Port / IdentityFile 五个关键字 ——
/// 其余指令（ProxyJump、ForwardAgent 等）在纳管阶段还没有对应字段可落，
/// 强行解析只会得到一个丢信息的假条目，等 SSH 会话能力就绪后再补。
///
/// 两类内容会被刻意跳过：
/// - 通配符 Host（如 `Host *.example.com`、`Host !prod-*`）代表一组配置模板而非具体机器，
///   导入后会产出一堆永远连不上的垃圾资产；
/// - 第一个 Host 之前的全局默认段不属于任何主机。
fn parse_ssh_config(content: &str) -> Vec<SshConfigHost> {
    let mut current: Option<SshConfigHost> = None;
    let mut result: Vec<SshConfigHost> = Vec::new();

    let flush = |current: &mut Option<SshConfigHost>, result: &mut Vec<SshConfigHost>| {
        if let Some(host) = current.take() {
            result.push(host);
        }
    };

    for raw_line in content.lines() {
        // ssh_config 用 # 注释；先剥注释再判断空行，否则整行注释会被当成空行之外的脏数据
        let line = raw_line.split('#').next().unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }

        // 兼容 `Key Value` 与 `Key=Value` 两种写法
        let (key, value) = match line.split_once('=') {
            Some((k, v)) => (k.trim(), v.trim()),
            None => match line.split_once(char::is_whitespace) {
                Some((k, v)) => (k.trim(), v.trim()),
                None => (line, ""),
            },
        };

        if key.eq_ignore_ascii_case("host") {
            flush(&mut current, &mut result);

            // `Host a b` 表示多个别名共用同一段配置。这里只取第一个具体别名：
            // 其余别名在资产表里会被当成独立主机，反而造成重复纳管。
            let alias = value
                .split_whitespace()
                .find(|p| !p.contains('*') && !p.contains('?') && !p.starts_with('!'));

            current = alias.map(|a| SshConfigHost {
                alias: a.to_string(),
                // ssh 在 HostName 缺省时直接用别名连接，这里保持同样的回退行为
                hostname: a.to_string(),
                port: 22,
                username: "root".to_string(),
                identity_file: String::new(),
            });
            continue;
        }

        let Some(host) = current.as_mut() else {
            continue;
        };

        if key.eq_ignore_ascii_case("hostname") {
            host.hostname = value.to_string();
        } else if key.eq_ignore_ascii_case("user") {
            host.username = value.to_string();
        } else if key.eq_ignore_ascii_case("port") {
            // 端口写错时保留默认 22，不因为一行脏配置丢掉整台机器
            if let Ok(port) = value.parse::<i32>() {
                if (1..=65535).contains(&port) {
                    host.port = port;
                }
            }
        } else if key.eq_ignore_ascii_case("identityfile") {
            host.identity_file = value.trim_matches('"').to_string();
        }
    }

    flush(&mut current, &mut result);
    result
}

/// 校验端口范围
fn validate_port(port: i32) -> Result<(), AppError> {
    if !(1..=65535).contains(&port) {
        return Err(AppError::InvalidInput(format!(
            "端口 {} 超出有效范围 1-65535",
            port
        )));
    }
    Ok(())
}

/// 校验枚举字段取值
fn validate_enum(field: &str, value: &str, allowed: &[&str]) -> Result<(), AppError> {
    if !allowed.contains(&value) {
        return Err(AppError::InvalidInput(format!(
            "{}取值非法：{}（可选 {}）",
            field,
            value,
            allowed.join(" / ")
        )));
    }
    Ok(())
}

/// 把用户输入的标签文本规范化为 JSON 数组字符串
///
/// 统一存储格式的原因：历史数据里同时存在 `[]` 和 `a,b` 两种写法，
/// 只靠读取端容错会让格式继续发散，写入端收紧后才能逐步收敛。
fn normalize_tags(raw: &str) -> Result<String, AppError> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Ok("[]".into());
    }

    // 已是 JSON 数组（例如由批量打标签回写）时直接复用，避免被当成普通文本切碎
    if let Ok(list) = serde_json::from_str::<Vec<String>>(raw) {
        let mut uniq: Vec<String> = Vec::new();
        for tag in list {
            let tag = tag.trim().to_string();
            if !tag.is_empty() && !uniq.contains(&tag) {
                uniq.push(tag);
            }
        }
        return Ok(serde_json::to_string(&uniq)?);
    }

    let mut uniq: Vec<String> = Vec::new();
    for tag in raw.split(&[',', '，', '、'][..]) {
        let tag = tag.trim().to_string();
        if !tag.is_empty() && !uniq.contains(&tag) {
            uniq.push(tag);
        }
    }
    Ok(serde_json::to_string(&uniq)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_tags_handles_comma_and_json() {
        assert_eq!(
            normalize_tags("web, api ，api").unwrap(),
            r#"["web","api"]"#
        );
        assert_eq!(normalize_tags(r#"["a","b"]"#).unwrap(), r#"["a","b"]"#);
        assert_eq!(normalize_tags("   ").unwrap(), "[]");
    }

    #[test]
    fn validate_enum_rejects_unknown_value() {
        assert!(validate_enum("AI 策略", "trusted", &AI_POLICIES).is_ok());
        assert!(validate_enum("AI 策略", "root", &AI_POLICIES).is_err());
    }

    #[test]
    fn test_connectivity_rejects_bad_input() {
        assert!(!ServerService::test_connectivity("", 22).ok);
        assert!(!ServerService::test_connectivity("127.0.0.1", 0).ok);
        assert!(!ServerService::test_connectivity("127.0.0.1", 70000).ok);
    }

    #[test]
    fn test_connectivity_reports_unreachable_port() {
        // 本机回环上一个几乎不可能监听的端口：必须返回 ok=false 而不是 panic
        let result = ServerService::test_connectivity("127.0.0.1", 1);
        assert!(!result.ok);
        assert!(result.latency_ms.is_none());
    }

    #[test]
    fn format_sha256_fingerprint_is_stable_and_readable() {
        assert_eq!(
            format_sha256_fingerprint(&[0x00, 0x0a, 0xff]),
            "SHA256:00:0a:ff"
        );
    }

    #[test]
    fn parse_system_summary_requires_identity_fields() {
        let parsed = parse_system_summary("Linux\nx86_64\nprod-01\nup 3 days\n").unwrap();
        assert_eq!(parsed.0, "Linux");
        assert_eq!(parsed.1, "x86_64");
        assert_eq!(parsed.2, "prod-01");
        assert_eq!(parsed.3, "up 3 days");

        assert!(parse_system_summary("Linux\nx86_64\n").is_err());
    }

    #[test]
    fn parse_ssh_config_extracts_concrete_hosts() {
        let config = "\
# 全局默认段，应被忽略
User global-user

Host prod-web
    HostName 10.0.0.1
    User deploy
    Port 2222
    IdentityFile ~/.ssh/id_prod

Host *.internal
    User nobody

Host dev-box
    HostName=dev.local
    IdentityFile \"~/.ssh/id dev\"
";
        let hosts = parse_ssh_config(config);
        assert_eq!(hosts.len(), 2, "通配符 Host 必须被跳过");

        assert_eq!(hosts[0].alias, "prod-web");
        assert_eq!(hosts[0].hostname, "10.0.0.1");
        assert_eq!(hosts[0].username, "deploy");
        assert_eq!(hosts[0].port, 2222);
        assert_eq!(hosts[0].identity_file, "~/.ssh/id_prod");

        // HostName 缺省时回退为别名，与 ssh 自身行为一致
        assert_eq!(hosts[1].alias, "dev-box");
        assert_eq!(hosts[1].hostname, "dev.local");
        assert_eq!(hosts[1].username, "root");
        assert_eq!(hosts[1].port, 22);
    }

    #[test]
    fn parse_ssh_config_keeps_defaults_on_bad_port() {
        let hosts = parse_ssh_config("Host a\n  Port not-a-number\n  HostName 1.2.3.4\n");
        assert_eq!(hosts.len(), 1);
        assert_eq!(hosts[0].port, 22);
        assert_eq!(hosts[0].hostname, "1.2.3.4");
    }
}
