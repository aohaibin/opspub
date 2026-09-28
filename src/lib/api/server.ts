import { invoke } from "@tauri-apps/api/core";
import type {
  Server,
  AuditLog,
  ConnectivityResult,
  SshProbeRequest,
  SshProbeResult,
  ServerPayload,
  SshConfigHost,
} from "@/types";
import type { SshCredentials } from "@/types";

/**
 * 把表单载荷转成 IPC 参数
 *
 * 这里的命名不对称必须留意：
 * - **发出去**用 camelCase：Tauri 会把 Rust 参数名转成 camelCase 作为 IPC 键
 *   （tauri-macros 的 argument_case 默认就是 Camel，且查找是精确匹配、没有 snake_case 兜底），
 *   少写一个大小写就会得到 `command add_server missing required key authType`。
 * - **收回来**仍是 snake_case：Server 结构体没有加 rename_all，序列化保留字段原名。
 */
function toIpcPayload(payload: ServerPayload) {
  return {
    alias: payload.alias,
    hostname: payload.hostname,
    port: payload.port,
    username: payload.username,
    // 这三个是后端 validate_enum 的必填项，缺键会在 Rust 侧直接报错而不是走默认值。
    // 兜底不是偷懒：表单里 os_type 由协议卡片驱动、不渲染 Form.Item，
    // validateFields() 拿不到未注册字段的值，曾经因此出现 undefined 被序列化丢键。
    // 在这里兜一层，任何新增调用路径都不会再踩同一个坑。
    authType: payload.auth_type ?? "password",
    aiPolicy: payload.ai_policy ?? "approval",
    osType: payload.os_type ?? "linux",
    tags: payload.tags,
    group: payload.group ?? "默认",
    arch: payload.arch ?? "",
    allowSudo: payload.allow_sudo ?? false,
    useLocalProxy: payload.use_local_proxy ?? false,
    bastionId: payload.bastion_id ?? null,
    aiUsername: payload.ai_username ?? "",
  };
}

export const serverApi = {
  /** 获取所有服务器 */
  list: () => invoke<Server[]>("list_servers"),

  /** 从系统凭据管理器恢复当前用户已保存的 SSH 凭据。 */
  listSavedSshCredentials: () =>
    invoke<Record<number, SshCredentials>>("list_saved_ssh_credentials"),

  /** 将 SSH 凭据保存到系统凭据管理器，而不是 SQLite/localStorage。 */
  saveSshCredentials: (serverId: number, credentials: SshCredentials) =>
    invoke<void>("save_ssh_credentials", {
      serverId,
      password: credentials.password,
      privateKeyPath: credentials.privateKeyPath,
      passphrase: credentials.passphrase,
    }),

  /** 删除指定服务器的系统 SSH 凭据。 */
  deleteSshCredentials: (serverId: number) =>
    invoke<void>("delete_ssh_credentials", { serverId }),

  /** 添加服务器，返回新记录 id */
  add: (params: ServerPayload) => invoke<number>("add_server", toIpcPayload(params)),

  /** 更新服务器 */
  update: (id: number, params: ServerPayload) =>
    invoke<void>("update_server", { id, ...toIpcPayload(params) }),

  /** 删除服务器 */
  delete: (id: number) => invoke<boolean>("delete_server", { id }),

  /** 批量删除服务器，返回实际删除条数 */
  batchDelete: (ids: number[]) =>
    invoke<number>("batch_delete_servers", { ids }),

  /** 批量设置 AI 策略档位，返回实际更新条数 */
  batchUpdatePolicy: (ids: number[], aiPolicy: string) =>
    invoke<number>("batch_update_server_policy", { ids, aiPolicy }),

  /** 批量追加标签（与已有标签取并集），返回实际处理条数 */
  batchAddTags: (ids: number[], tags: string[]) =>
    invoke<number>("batch_add_server_tags", { ids, tags }),

  /** 切换收藏状态 */
  setFavorite: (id: number, favorite: boolean) =>
    invoke<boolean>("set_server_favorite", { id, favorite }),

  /**
   * 测试连通性（TCP 握手探测）
   *
   * 传入 serverId 时，探测成功后会在后端刷新「最近用过」时间；
   * 表单里尚未保存的服务器可以不传。
   */
  testConnectivity: (hostname: string, port: number, serverId?: number) =>
    invoke<ConnectivityResult>("test_server_connectivity", {
      hostname,
      port,
      serverId: serverId ?? null,
    }),

  /** 真实 SSH 握手、主机指纹校验、凭据认证及只读系统摘要探测 */
  testSsh: (request: SshProbeRequest) =>
    invoke<SshProbeResult>("test_server_ssh", { request }),

  /**
   * 读取并解析 ~/.ssh/config，返回可导入的主机清单
   *
   * 只做预览，不会自动写入资产表；导入需要由调用方逐条调 add 完成。
   */
  importSshConfig: () => invoke<SshConfigHost[]>("import_ssh_config"),
};

export const auditApi = {
  /** 获取审核日志 */
  getLogs: (limit: number) => invoke<AuditLog[]>("get_audit_logs", { limit }),

  /**
   * 添加审核日志
   *
   * 参数名用 camelCase：对应的 Rust 参数是 server_alias，IPC 键会转成 serverAlias。
   */
  addLog: (params: {
    serverAlias: string;
    command: string;
    user: string;
    result: string;
  }) => invoke<number>("add_audit_log", params),
};
