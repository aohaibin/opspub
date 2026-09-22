/**
 * SFTP 远程文件传输模块类型定义。
 *
 * 严格对齐设计原型与用户截图：
 *   - 多标签页会话（已连接主机 / 选择服务器）
 *   - 远程文件/目录元数据（大小、时间、权限属主）
 *   - 本地拖拽上传任务与过滤
 */

export interface RemoteFileItem {
  name: string;
  isDir: boolean;
  size: number;
  sizeFormatted: string;
  modified: string;
  permissions: string;
  owner: string;
  isSensitive?: boolean;
}

/** 传给 SFTP Command 的短时认证凭据，不持久化到本地。 */
export interface SftpCredentials {
  serverId: number;
  password?: string;
  privateKeyPath?: string;
  passphrase?: string;
}

/** Rust SFTP Command 返回的远程条目。 */
export interface SftpRemoteFile {
  name: string;
  isDir: boolean;
  size: number;
  modified: string;
  permissions: string;
  owner: string;
}

export interface SftpSessionTab {
  id: string;
  /** 关联的主机 ID，null 表示处于「选择服务器...」选机视图 */
  serverId: number | null;
  serverName: string;
  serverHost: string;
  serverUser: string;
  currentPath: string;
  history: string[];
  historyIndex: number;
}

export type SftpLayoutMode = "single" | "dual-h" | "dual-v" | "quad";

export type SftpViewMode = "grid" | "list";

/** 默认预设的远程初始文件演示数据（完全对齐设计图 2 的 /root 目录清单） */
export const DEFAULT_ROOT_FILES: RemoteFileItem[] = [
  {
    name: ".cache",
    isDir: true,
    size: 0,
    sizeFormatted: "—",
    modified: "2024/12/17 17:43:48",
    permissions: "rwxr-xr-x",
    owner: "uid:0 (root)",
  },
  {
    name: ".pip",
    isDir: true,
    size: 0,
    sizeFormatted: "—",
    modified: "2024/4/28 17:14:10",
    permissions: "rwxr-xr-x",
    owner: "uid:0 (root)",
  },
  {
    name: ".reeve",
    isDir: true,
    size: 0,
    sizeFormatted: "—",
    modified: "2026/8/11 10:33:56",
    permissions: "rwxr-xr-x",
    owner: "uid:0 (root)",
  },
  {
    name: ".ssh",
    isDir: true,
    size: 0,
    sizeFormatted: "—",
    modified: "2024/4/26 15:53:39",
    permissions: "rwx------",
    owner: "uid:0 (root)",
  },
  {
    name: ".bash_history",
    isDir: false,
    size: 188,
    sizeFormatted: "188 B",
    modified: "2026/9/20 21:52:35",
    permissions: "rw-------",
    owner: "uid:0 (root)",
  },
  {
    name: ".bashrc",
    isDir: false,
    size: 3072,
    sizeFormatted: "3.0 KB",
    modified: "2024/4/22 21:04:27",
    permissions: "rw-r--r--",
    owner: "uid:0 (root)",
  },
  {
    name: ".npmrc",
    isDir: false,
    size: 44,
    sizeFormatted: "44 B",
    modified: "2026/7/30 14:27:12",
    permissions: "rw-r--r--",
    owner: "uid:0 (root)",
  },
  {
    name: ".profile",
    isDir: false,
    size: 161,
    sizeFormatted: "161 B",
    modified: "2024/4/22 21:04:27",
    permissions: "rw-r--r--",
    owner: "uid:0 (root)",
  },
  {
    name: ".pydistutils.cfg",
    isDir: false,
    size: 73,
    sizeFormatted: "73 B",
    modified: "2026/7/30 14:27:12",
    permissions: "rw-r--r--",
    owner: "uid:0 (root)",
  },
  {
    name: ".viminfo",
    isDir: false,
    size: 1228,
    sizeFormatted: "1.2 KB",
    modified: "2026/7/30 23:02:18",
    permissions: "rw-------",
    owner: "uid:0 (root)",
  },
];
