/** 服务器类型 */
export interface Server {
  id: number;
  alias: string;
  hostname: string;
  port: number;
  username: string;
  auth_type: string;
  /** JSON 数组字符串，如 ["生产环境","腾讯云"]；历史数据可能是逗号分隔，读取请用 parseTags */
  tags: string;
  group: string;
  ai_policy: string;
  os_type: string;
  /** 是否收藏（左侧「我的收藏」分组） */
  favorite: boolean;
  /** CPU 架构；空串表示尚未探测，不要当成 linux/amd64 展示 */
  arch: string;
  /** 最近一次成功探活时间；null 表示从未使用过 */
  last_used_at: string | null;
  /** 已确认的 SSH 主机公钥指纹；空串表示尚未确认 */
  host_key_fingerprint: string;
  /** unknown / verified / failed / host_key_changed */
  last_connection_status: string;
  /** 最近一次 SSH 验证摘要，不包含凭据 */
  last_connection_message: string;
  /** 最近一次 SSH 认证成功时间 */
  last_connected_at: string | null;
  /** 是否允许 sudo 提权 */
  allow_sudo: boolean;
  /** 是否借用本机代理连接 */
  use_local_proxy: boolean;
  /** 跳板机服务器 ID，null 表示直连 */
  bastion_id: number | null;
  /** AI 专用 SSH 账号（留空则与主账号一致） */
  ai_username: string;
  created_at: string;
  updated_at: string;
}

/** 审核日志 */
export interface AuditLog {
  id: number;
  server_alias: string;
  command: string;
  user: string;
  result: string;
  created_at: string;
}

/** AI 策略档位 (禁用 / 只读 / 审批 / 白名单 / 信任，并兼容历史代号) */
export type AIPolicy =
  | 'disabled'
  | 'readonly'
  | 'approval'
  | 'allowlist'
  | 'trusted'
  | 'strict'
  | 'autonomous'
  | 'denied';

/** 认证方式 */
export type AuthType = 'password' | 'key';

/** 操作系统 */
export type OsType = 'linux' | 'windows';

/**
 * 连通性探测结果
 *
 * 探测只做 TCP 三次握手、不校验凭据：ok=true 仅代表「网络可达 + 端口有服务监听」。
 */
export interface ConnectivityResult {
  ok: boolean;
  /** TCP 握手耗时（毫秒）；失败时为 null */
  latency_ms: number | null;
  message: string;
}

/** SSH 认证凭据；前端只在当前验证调用链短暂使用，持久化由 Rust 系统凭据管理器负责 */
export interface SshCredentials {
  password?: string;
  privateKeyPath?: string;
  passphrase?: string;
}

/** SSH 认证测试请求；凭据仅用于当前 IPC 调用，验证成功后由 Rust 写入系统凭据管理器 */
export interface SshProbeRequest extends SshCredentials {
  serverId: number;
  trustHostKey?: boolean;
}

/** SSH 认证及远端只读系统摘要 */
export interface SshProbeResult {
  connected: boolean;
  requires_host_key_trust: boolean;
  fingerprint: string;
  host_key_type: string;
  latency_ms: number;
  remote_hostname: string;
  os_name: string;
  arch: string;
  uptime: string;
  message: string;
}

/** 服务器新增/编辑表单载荷 */
export interface ServerPayload {
  alias: string;
  hostname: string;
  port: number;
  username: string;
  auth_type: AuthType;
  tags: string;
  group: string;
  ai_policy: AIPolicy;
  os_type: OsType;
  arch?: string;
  allow_sudo?: boolean;
  use_local_proxy?: boolean;
  bastion_id?: number | null;
  ai_username?: string;
}

/** 从 ~/.ssh/config 解析出的主机条目（仅用于导入预览） */
export interface SshConfigHost {
  alias: string;
  hostname: string;
  port: number;
  username: string;
  /** IdentityFile 路径；空串表示该条目未显式指定私钥 */
  identity_file: string;
}
