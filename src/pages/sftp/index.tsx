/**
 * SFTP 远程文件传输页面。
 *
 * 核心升级：
 * 1. 右侧表格操作列与「更多」下拉菜单完全 1:1 对齐用户最新截图 media_1790091992059.png：
 *    - 目录行：【打开】+【下载】+【更多（悬停浮现“更多”提示，点击弹出 11 项全功能菜单）】
 *    - 文件行：【在线编辑】+【下载】+【更多】
 *    - 更多操作菜单项：打开、下载(打包)、在终端 cd 此目录、复制、剪切、压缩、重命名、权限、复制路径、复制文件名、删除。
 * 2. 按钮与图标全面绑定并跟随主题色走（使用 CSS 变量 var(--accent) / var(--brand-500)）：
 *    - 上传文件大按钮、右上角分屏选中按钮、Tab 激活边框等全面对齐主题色。
 *    - 目录文件夹图标由黄色全面重构为精致的主题品牌色（如截图所示的高级青绿），与系统主题切换无缝联动。
 * 3. 严格遵循 UTF-8（无 BOM）规范与项目分层架构。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Checkbox, Dropdown, Input, Modal, Spin, Tooltip, message } from "antd";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { downloadDir } from "@tauri-apps/api/path";
import { useLocation } from "react-router-dom";
import { useSettingsStore } from "@/store/settings";
import { SETTINGS_KEYS } from "@/store/settings";
import { configApi } from "@/lib/api";
import type { MenuProps } from "antd";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Columns2,
  ChevronDown,
  Copy,
  Download,
  Edit2,
  Edit3,
  File as FileIcon,
  FileCode,
  FileKey,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderUp,
  FolderSync,
  FolderTree,
  HelpCircle,
  History,
  Home,
  LayoutGrid,
  Link,
  List,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Scissors,
  Search,
  Server as ServerIcon,
  ShieldCheck,
  Square,
  Terminal,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { serverApi } from "@/lib/api/server";
import { sftpApi } from "@/lib/api/sftp";
import { getErrorMessage } from "@/lib/api/client";
import { useSshSessionStore } from "@/store/ssh";
import { isTransferActive, transferDirectoryKey, useSftpTransferStore, type UploadSource } from "@/store/sftp-transfers";
import { WorkspaceSidebarSlot } from "@/components/layout/WorkspaceNavigation";
import { ServerFormModal } from "@/pages/servers/components/ServerFormModal";
import { AI_POLICY_META, normalizeAIPolicy } from "@/pages/servers/lib/serverMeta";
import { SshConnectModal } from "@/components/server/SshConnectModal";
import type { Server, SshCredentials, SshProbeResult } from "@/types";
import { SftpSidebar } from "./SftpSidebar";
import { UploadConflictModal, type UploadConflict, type UploadConflictAction } from "./UploadConflictModal";
import { useSftpWorkspaceStore, type SftpPane } from "./workspace-state";
import {
  type RemoteFileItem,
  type SftpCredentials,
  type SftpSessionInfo,
  type SftpSessionTab,
  type SftpViewMode,
} from "./types";

interface DirectoryView {
  path: string;
  files: RemoteFileItem[];
  loading: boolean;
  error?: string;
}

interface FileSelection {
  directory: string;
  names: string[];
}

interface UploadCandidate {
  source: UploadSource;
  name: string;
  isDir: boolean;
  size: number;
  itemCount: number;
}
interface PendingUpload {
  id: string;
  target: { serverId: number; serverName: string; remoteDir: string };
  candidates: UploadCandidate[];
  conflicts: UploadConflict[];
  existingNames: Set<string>;
  ignoreCase: boolean;
  recoveryTaskId?: string;
}

// 跨菜单返回时，同一主机仍可能在建立连接。
const connectingServers = new Set<number>();
// 浏览器前进和后退会复用历史条目的 key，页面卸载后仍需记住已处理的资产直达。
const handledSftpEntries = new Set<string>();

/** 格式化字节为易读大小 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** 获取文件图标（完全遵从主题色设计） */
function getFileIcon(item: RemoteFileItem) {
  if (item.isDir) {
    // 目录图标：完全遵循主题强调色（青绿/Accent），带柔和微填充，完全对齐截图
    return (
      <Folder
        size={17}
        className="text-[var(--accent,#0d9488)] fill-[var(--accent,#0d9488)]/15 shrink-0"
      />
    );
  }
  const name = item.name.toLowerCase();
  if (name.includes("key") || name.includes("id_rsa") || name.endsWith(".pem")) {
    return <FileKey size={17} className="text-rose-400 shrink-0" />;
  }
  if (name.endsWith(".js") || name.endsWith(".ts") || name.endsWith(".py") || name.endsWith(".sh")) {
    return <FileCode size={17} className="text-[var(--accent,#0d9488)] shrink-0" />;
  }
  if (name.endsWith(".json") || name.endsWith(".yml") || name.endsWith(".yaml") || name.endsWith(".cfg") || name.startsWith(".")) {
    return <FileText size={17} className="text-slate-400 shrink-0" />;
  }
  return <FileIcon size={17} className="text-slate-400 shrink-0" />;
}

/** 统一远程路径格式，确保根目录始终显示为 `/`，并避免重复或尾部斜杠。 */
function normalizeRemotePath(path: string): string {
  const trimmed = path.trim().replace(/\\/g, "/");
  if (!trimmed || trimmed === "/") return "/";

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const normalized = withLeadingSlash.replace(/\/+/g, "/");
  return normalized.length > 1 ? normalized.replace(/\/+$/, "") : "/";
}

async function inspectDroppedEntry(entry: FileSystemEntry, depth = 0): Promise<{ count: number; size: number }> {
  if (depth > 128) throw new Error("目录层级超过 128 层");
  if (entry.isDirectory) {
    const directory = entry as FileSystemDirectoryEntry;
    const reader = directory.createReader();
    let count = 1;
    let size = 0;
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (batch.length === 0) return { count, size };
      for (const child of batch) {
        const nested = await inspectDroppedEntry(child, depth + 1);
        count += nested.count;
        size += nested.size;
      }
    }
  }
  const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
  return { count: 1, size: file.size };
}

async function describeUploadSource(source: UploadSource): Promise<UploadCandidate> {
  if (typeof source === "string") {
    const manifest = await sftpApi.inspectLocalUpload(source);
    const root = manifest[0];
    if (!root) throw new Error("无法读取本地上传项目");
    return {
      source, name: root.path[root.path.length - 1], isDir: root.isDir,
      size: manifest.reduce((total, entry) => total + entry.size, 0),
      itemCount: Math.max(1, manifest.length - 1),
    };
  }
  if (source instanceof File) {
    return { source, name: source.name, isDir: false, size: source.size, itemCount: 1 };
  }
  const { count, size } = await inspectDroppedEntry(source);
  return { source, name: source.name, isDir: source.isDirectory, size, itemCount: Math.max(1, count - 1) };
}

export default function SftpPage() {
  const location = useLocation();
  const configuredDownloadDir = useSettingsStore((state) => state.sftpDownloadDir);
  const allowRecursiveDrag = useSettingsStore((state) => state.sftpDragRecursive);
  const showHiddenFiles = useSettingsStore((state) => state.sftpShowHidden);
  const routeServerId =
    (location.state as { serverId?: number } | null)?.serverId ?? null;
  // 服务器资产列表
  const [servers, setServers] = useState<Server[]>([]);
  const [loadingServers, setLoadingServers] = useState(true);
  const [serverLoadError, setServerLoadError] = useState<string>();
  const [sessionLoadError, setSessionLoadError] = useState<string>();
  const [serverSearchKeyword, setServerSearchKeyword] = useState("");
  const [serverViewMode, setServerViewMode] = useState<SftpViewMode>("grid");
  const [selectedTreeServerId, setSelectedTreeServerId] = useState<number | null>(null);
  const [collapsedServerGroups, setCollapsedServerGroups] = useState<Record<string, boolean>>({});
  const [connectivityByServer, setConnectivityByServer] = useState<Record<number, { loading: boolean; result?: { ok: boolean; latency_ms: number | null; message: string } }>>({});
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [sshServer, setSshServer] = useState<Server | null>(null);
  const sshTarget = useRef<{ pane: SftpPane; originTabId: string | null }>({ pane: "left", originTabId: null });
  const sharedCredentials = useSshSessionStore((state) => state.credentialsByServer);
  const enqueueUpload = useSftpTransferStore((state) => state.enqueue);
  const enqueueDownload = useSftpTransferStore((state) => state.enqueueDownload);
  const showTransfers = useSftpTransferStore((state) => state.setDisplay);
  const hasTransfers = useSftpTransferStore((state) => state.tasks.length > 0);
  const transferDirectoryVersions = useSftpTransferStore((state) => state.directoryVersions);
  const setSharedCredentials = useSshSessionStore((state) => state.setCredentials);
  const credentialsByServer = useMemo<Record<number, SftpCredentials>>(
    () => Object.fromEntries(
      Object.entries(sharedCredentials).map(([id, credentials]) => [
        Number(id),
        { serverId: Number(id), ...credentials },
      ])
    ),
    [sharedCredentials],
  );
  const [remoteClipboard, setRemoteClipboard] = useState<{
    tabId: string;
    path: string;
    name: string;
    cut: boolean;
  } | null>(null);

  // 多标签页状态
  const { tabs, setTabs, initialized, activeTabId, secondaryTabId, activePane, layoutMode, selectTab, openPicker, setLayoutMode } = useSftpWorkspaceStore();
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const [dragOverSide, setDragOverSide] = useState<"left" | "right" | null>(null);

  // 全部关闭确认弹窗
  const [closeAllModalOpen, setCloseAllModalOpen] = useState(false);

  // 每个标签的远程文件列表（按 tabId 分离存储）
  const [directoryByTab, setDirectoryByTab] = useState<Record<string, DirectoryView>>({});
  const directoryRequests = useRef(new Map<string, { path: string; version: number }>());

  // 左右窗格各自独立的过滤搜索词
  const [leftFilterKeyword, setLeftFilterKeyword] = useState("");
  const [rightFilterKeyword, setRightFilterKeyword] = useState("");

  // 左右窗格各自选中的文件集合
  const [leftSelection, setLeftSelection] = useState<FileSelection>();
  const [rightSelection, setRightSelection] = useState<FileSelection>();

  // 左右窗格各自路径输入框聚焦与编辑状态
  const [leftEditingPath, setLeftEditingPath] = useState(false);
  const [leftPathInputVal, setLeftPathInputVal] = useState("");
  const [rightEditingPath, setRightEditingPath] = useState(false);
  const [rightPathInputVal, setRightPathInputVal] = useState("");

  // 拖拽悬停状态（左栏与右栏独立）
  const [leftDraggingOver, setLeftDraggingOver] = useState(false);
  const leftDragCounter = useRef(0);
  const [rightDraggingOver, setRightDraggingOver] = useState(false);
  const rightDragCounter = useRef(0);
  const [localDownloadDir, setLocalDownloadDir] = useState<string>();
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [uploadPreflight, setUploadPreflight] = useState(false);
  const uploadCheckRunning = useRef(false);
  const attemptedRecovery = useRef<string | undefined>(undefined);
  const conflictingUpload = useSftpTransferStore((state) => state.tasks.find((task) => task.needsOverwriteDecision));
  useEffect(() => {
    let active = true;
    void downloadDir().then((path) => {
      if (active) setLocalDownloadDir((current) => configuredDownloadDir || current || path);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [configuredDownloadDir]);

  // 新建文件夹弹窗
  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderTargetTabId, setNewFolderTargetTabId] = useState<string>("");

  // 重命名弹窗
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameOldName, setRenameOldName] = useState("");
  const [renameNewName, setRenameNewName] = useState("");
  const [renameTargetTabId, setRenameTargetTabId] = useState("");

  // 权限修改弹窗
  const [permissionModalOpen, setPermissionModalOpen] = useState(false);
  const [permissionTargetItem, setPermissionTargetItem] = useState<{ tabId: string; name: string; mode: string } | null>(null);
  const [permissionValue, setPermissionValue] = useState("0755");

  // 在线编辑器与新建文件都通过 SFTP 上传覆盖，避免只修改前端演示数据。
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTarget, setEditorTarget] = useState<{ tabId: string; name: string } | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [newFileModalOpen, setNewFileModalOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("untitled.txt");
  const [newFileTargetTabId, setNewFileTargetTabId] = useState("");

  // 资产列表失败时保留真实错误，避免把示例服务器 ID 用于实际连接。
  const loadServers = useCallback(async () => {
    setLoadingServers(true);
    setServerLoadError(undefined);
    setSessionLoadError(undefined);
    try {
      setServers((await serverApi.list()).filter((server) => server.protocol !== "rdp"));
    } catch (error) {
      setServerLoadError(getErrorMessage(error));
    } finally {
      setLoadingServers(false);
    }
  }, []);

  useEffect(() => {
    void loadServers();
  }, [loadServers]);

  // 首次进入时接回后端会话，切菜单后的标签和路径从前端进程内状态恢复。
  useEffect(() => {
    if (initialized || loadingServers || serverLoadError || sessionLoadError) return;
    let disposed = false;
    const restore = (sessions: SftpSessionInfo[]) => {
      if (!disposed) useSftpWorkspaceStore.getState().restore(sessions, servers);
    };
    void sftpApi.listSessions().then(restore).catch((error) => {
      if (!disposed) setSessionLoadError(getErrorMessage(error));
    });
    return () => { disposed = true; };
  }, [initialized, loadingServers, serverLoadError, servers, sessionLoadError]);

  const activeLeftTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const activeRightTab = tabs.find((tab) => tab.id === secondaryTabId) ?? null;
  const sidebarTab = activePane === "right" ? activeRightTab : activeLeftTab;

  // 过滤后的服务器列表（选机视图搜索）
  const filteredServers = useMemo(() => {
    const kw = serverSearchKeyword.trim().toLowerCase();
    if (!kw) return servers;
    return servers.filter(
      (s) =>
        (s.alias && s.alias.toLowerCase().includes(kw)) ||
        (s.hostname && s.hostname.toLowerCase().includes(kw)) ||
        (s.tags && s.tags.toLowerCase().includes(kw))
    );
  }, [servers, serverSearchKeyword]);

  const serverGroups = useMemo(() => {
    const groups = new Map<string, Server[]>();
    filteredServers.forEach((server) => {
      const groupName = server.group?.trim() || "我的服务器";
      groups.set(groupName, [...(groups.get(groupName) ?? []), server]);
    });
    return Array.from(groups.entries()).map(([name, items]) => ({ name, items }));
  }, [filteredServers]);

  const selectedTreeServer =
    filteredServers.find((server) => server.id === selectedTreeServerId) ?? filteredServers[0] ?? null;

  const handleRetestServer = async (server: Server) => {
    setConnectivityByServer((current) => ({
      ...current,
      [server.id]: { ...current[server.id], loading: true },
    }));
    try {
      const result = await serverApi.testConnectivity(server.hostname, server.port, server.id);
      setConnectivityByServer((current) => ({ ...current, [server.id]: { loading: false, result } }));
      message[result.ok ? "success" : "warning"](result.message || (result.ok ? "服务器可达" : "服务器不可达"));
    } catch (error) {
      const result = { ok: false, latency_ms: null, message: getErrorMessage(error) };
      setConnectivityByServer((current) => ({ ...current, [server.id]: { loading: false, result } }));
      message.error(result.message);
    }
  };

  const loadRemoteDirectory = useCallback(
    async (tabId: string, path: string, overrideCredentials?: SftpCredentials) => {
      const tab = useSftpWorkspaceStore.getState().tabs.find((item) => item.id === tabId);
      if (tab?.serverId == null || tab.currentPath !== path) return;
      const serverId = tab.serverId;
      const credentials = overrideCredentials ?? { serverId, ...useSshSessionStore.getState().getCredentials(serverId) };
      const key = transferDirectoryKey(serverId, path);
      const request = { path, version: useSftpTransferStore.getState().directoryVersions[key] ?? 0 };
      directoryRequests.current.set(tabId, request);
      setDirectoryByTab((current) => ({
        ...current,
        [tabId]: { path, files: current[tabId]?.path === path ? current[tabId].files : [], loading: true },
      }));
      const isCurrentRequest = () => directoryRequests.current.get(tabId) === request &&
        useSftpWorkspaceStore.getState().tabs.some((item) => item.id === tabId && item.currentPath === path);

      try {
        const remoteFiles = await sftpApi.list(credentials, path);
        if (!isCurrentRequest()) return;
        const files = remoteFiles.map((file) => ({ ...file, sizeFormatted: formatFileSize(file.size) }));
        setDirectoryByTab((current) => ({ ...current, [tabId]: { path, files, loading: false } }));
      } catch (error) {
        if (!isCurrentRequest()) return;
        setDirectoryByTab((current) => ({
          ...current,
          [tabId]: { path, files: [], loading: false, error: getErrorMessage(error) },
        }));
      }
    },
    [],
  );

  useEffect(() => {
    const requests = directoryRequests.current;
    return () => { requests.clear(); };
  }, []);

  useEffect(() => {
    for (const tab of tabs) {
      if (tab.serverId === null) continue;
      const key = transferDirectoryKey(tab.serverId, tab.currentPath);
      const version = transferDirectoryVersions[key] ?? 0;
      const request = directoryRequests.current.get(tab.id);
      // 仅重读实际写入的主机和目录。切页回来时本地目录列表为空，会重新读取当前路径。
      if (request?.path !== tab.currentPath || request.version !== version) {
        void loadRemoteDirectory(tab.id, tab.currentPath);
      }
    }
  }, [loadRemoteDirectory, tabs, transferDirectoryVersions]);

  const openSessionForServer = useCallback(
    async (server: Server, targetPane: SftpPane, originTabId: string | null, credentials: SftpCredentials) => {
      if (connectingServers.has(server.id)) return;
      connectingServers.add(server.id);
      try {
        const session = await sftpApi.open(credentials);
        useSftpWorkspaceStore.getState().attachSession(session, server, targetPane, originTabId);
      } catch (error) {
        message.error(`连接 SFTP 失败：${getErrorMessage(error)}`);
      } finally {
        connectingServers.delete(server.id);
      }
    },
    [],
  );

  // 连接某台服务器进入 SFTP
  const handleConnectServer = useCallback(
    (server: Server, targetPane: SftpPane = "left") => {
      const workspace = useSftpWorkspaceStore.getState();
      const existing = workspace.tabs.find((tab) => tab.serverId === server.id);
      if (existing) {
        workspace.selectTab(existing.id, targetPane);
        return;
      }
      if (connectingServers.has(server.id)) return;

      const originTabId = targetPane === "left" ? workspace.activeTabId : workspace.secondaryTabId;
      const credentials = credentialsByServer[server.id];
      // 首次连接沿用 SSH 验证弹窗，确认主机指纹并写入系统凭据库。
      if (!credentials || !server.host_key_fingerprint) {
        sshTarget.current = { pane: targetPane, originTabId };
        setSshServer(server);
        return;
      }
      void openSessionForServer(server, targetPane, originTabId, credentials);
    },
    [credentialsByServer, openSessionForServer],
  );

  useEffect(() => {
    if (routeServerId === null || loadingServers || serverLoadError || !initialized || sshServer) return;
    if (handledSftpEntries.has(location.key)) return;
    handledSftpEntries.add(location.key);
    const server = servers.find((item) => item.id === routeServerId);
    if (server) handleConnectServer(server);
    else message.warning("找不到该服务器的 SFTP 连接");
  }, [handleConnectServer, initialized, loadingServers, location.key, routeServerId, serverLoadError, servers, sshServer]);

  // 明确关闭标签才会断开后端会话，页面卸载不会关闭连接。
  const handleCloseTab = async (tab: SftpSessionTab, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      if (tab.serverId !== null) await sftpApi.close(tab.serverId);
      useSftpWorkspaceStore.getState().removeTab(tab.id);
      directoryRequests.current.delete(tab.id);
      setDirectoryByTab(({ [tab.id]: _, ...remaining }) => remaining);
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  // 添加新标签（选择服务器）
  const handleAddTab = () => openPicker("left");

  const handleTabDragStart = (event: React.DragEvent<HTMLDivElement>, tabId: string) => {
    setDraggingTabId(tabId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", tabId);
  };

  const handleTabDragOver = (event: React.DragEvent<HTMLDivElement>, tabId: string) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (!draggingTabId || draggingTabId === tabId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setDragOverTabId(tabId);
    setDragOverSide(event.clientX - rect.left < rect.width / 2 ? "left" : "right");
  };

  const handleTabDrop = (event: React.DragEvent<HTMLDivElement>, targetTabId: string) => {
    event.preventDefault();
    const sourceTabId = draggingTabId;
    const side = dragOverSide;
    setDraggingTabId(null);
    setDragOverTabId(null);
    setDragOverSide(null);
    if (!sourceTabId || sourceTabId === targetTabId) return;

    setTabs((current) => {
      const sourceIndex = current.findIndex((tab) => tab.id === sourceTabId);
      const targetIndex = current.findIndex((tab) => tab.id === targetTabId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      const adjustedTargetIndex = next.findIndex((tab) => tab.id === targetTabId);
      const insertIndex = side === "right" ? adjustedTargetIndex + 1 : adjustedTargetIndex;
      next.splice(Math.max(0, insertIndex), 0, moved);
      return next;
    });
  };

  const handleTabDragEnd = () => {
    setDraggingTabId(null);
    setDragOverTabId(null);
    setDragOverSide(null);
  };

  // 确认全部关闭
  const handleConfirmCloseAll = async () => {
    if (connectingServers.size > 0) {
      message.info("请等待 SFTP 建连完成");
      return;
    }
    try {
      const { tasks, cancel } = useSftpTransferStore.getState();
      await Promise.all(tasks.filter((task) => isTransferActive(task.status)).map((task) => cancel(task.id)));
      await sftpApi.closeAll();
      useSftpWorkspaceStore.getState().clearTabs();
      directoryRequests.current.clear();
      setDirectoryByTab({});
      setCloseAllModalOpen(false);
      message.success("已成功关闭全部 SFTP 会话");
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  // 路径跳转
  const handleNavigateToPath = (tabId: string, newPath: string) => {
    const cleanPath = normalizeRemotePath(newPath);

    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== tabId || t.currentPath === cleanPath) return t;
        const newHistory = t.history.slice(0, t.historyIndex + 1);
        newHistory.push(cleanPath);
        return {
          ...t,
          currentPath: cleanPath,
          history: newHistory,
          historyIndex: newHistory.length - 1,
        };
      })
    );
    if (tabId === activeTabId) setLeftPathInputVal(cleanPath);
    if (tabId === activeRightTab?.id) setRightPathInputVal(cleanPath);
  };

  // 后退
  const handleHistoryBack = (tab: SftpSessionTab) => {
    if (tab.historyIndex <= 0) return;
    const nextIdx = tab.historyIndex - 1;
    const targetPath = normalizeRemotePath(tab.history[nextIdx]);
    setTabs((prev) =>
      prev.map((t) => (t.id === tab.id ? { ...t, historyIndex: nextIdx, currentPath: targetPath } : t))
    );
    if (tab.id === activeTabId) setLeftPathInputVal(targetPath);
    if (tab.id === activeRightTab?.id) setRightPathInputVal(targetPath);
  };

  // 前进
  const handleHistoryForward = (tab: SftpSessionTab) => {
    if (tab.historyIndex >= tab.history.length - 1) return;
    const nextIdx = tab.historyIndex + 1;
    const targetPath = normalizeRemotePath(tab.history[nextIdx]);
    setTabs((prev) =>
      prev.map((t) => (t.id === tab.id ? { ...t, historyIndex: nextIdx, currentPath: targetPath } : t))
    );
    if (tab.id === activeTabId) setLeftPathInputVal(targetPath);
    if (tab.id === activeRightTab?.id) setRightPathInputVal(targetPath);
  };

  // 上一级目录
  const handleNavigateUp = (tab: SftpSessionTab) => {
    const currentPath = normalizeRemotePath(tab.currentPath);
    if (currentPath === "/") return;
    const segments = currentPath.split("/").filter(Boolean);
    segments.pop();
    handleNavigateToPath(tab.id, segments.length > 0 ? `/${segments.join("/")}` : "/");
  };

  // 刷新当前目录
  const handleRefreshPath = (tab: SftpSessionTab) => {
    void loadRemoteDirectory(tab.id, tab.currentPath);
  };

  const openRemoteEditor = async (tab: SftpSessionTab, item: RemoteFileItem) => {
    if (item.isDir) {
      handleNavigateToPath(tab.id, `${tab.currentPath}/${item.name}`.replace(/\/+/g, "/"));
      return;
    }
    const credentials = tab.serverId ? credentialsByServer[tab.serverId] : undefined;
    if (!credentials) {
      message.warning("SFTP 会话凭据已失效，请重新连接服务器");
      return;
    }
    setEditorLoading(true);
    try {
      const bytes = await sftpApi.download(
        credentials,
        `${tab.currentPath}/${item.name}`.replace(/\/+/g, "/"),
      );
      setEditorTarget({ tabId: tab.id, name: item.name });
      setEditorContent(new TextDecoder().decode(new Uint8Array(bytes)));
      setEditorOpen(true);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setEditorLoading(false);
    }
  };

  const saveRemoteEditor = async () => {
    if (!editorTarget) return;
    const tab = tabs.find((item) => item.id === editorTarget.tabId);
    const credentials = tab?.serverId ? credentialsByServer[tab.serverId] : undefined;
    if (!tab || !credentials) {
      message.warning("SFTP 会话已关闭，请重新连接服务器");
      return;
    }
    setEditorSaving(true);
    try {
      await sftpApi.upload({
        request: credentials,
        remoteDir: tab.currentPath,
        fileName: editorTarget.name,
        content: Array.from(new TextEncoder().encode(editorContent)),
      });
      setEditorOpen(false);
      await loadRemoteDirectory(tab.id, tab.currentPath, credentials);
      message.success(`已保存 ${editorTarget.name}`);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setEditorSaving(false);
    }
  };

  const createRemoteFile = async () => {
    const name = newFileName.trim();
    const tab = tabs.find((item) => item.id === newFileTargetTabId);
    const credentials = tab?.serverId ? credentialsByServer[tab.serverId] : undefined;
    if (!name) {
      message.warning("请输入文件名");
      return;
    }
    if (!tab || !credentials) return;
    try {
      await sftpApi.upload({
        request: credentials,
        remoteDir: tab.currentPath,
        fileName: name,
        content: [],
      });
      setNewFileModalOpen(false);
      setNewFileName("untitled.txt");
      await loadRemoteDirectory(tab.id, tab.currentPath, credentials);
      message.success(`已创建文件 ${name}`);
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const pasteRemoteItem = async (targetTab: SftpSessionTab) => {
    if (!remoteClipboard) return;
    const sourceTab = tabs.find((item) => item.id === remoteClipboard.tabId);
    const credentials = targetTab.serverId ? credentialsByServer[targetTab.serverId] : undefined;
    if (!sourceTab || !credentials || sourceTab.serverId !== targetTab.serverId) {
      message.warning("复制或剪切内容必须来自同一台服务器");
      return;
    }
    const targetPath = `${targetTab.currentPath}/${remoteClipboard.name}`.replace(/\/+/g, "/");
    try {
      if (remoteClipboard.cut) {
        await sftpApi.rename(credentials, remoteClipboard.path, targetPath);
      } else {
        await sftpApi.copy(credentials, remoteClipboard.path, targetPath);
      }
      await loadRemoteDirectory(targetTab.id, targetTab.currentPath, credentials);
      if (remoteClipboard.cut && sourceTab.id !== targetTab.id) {
        await loadRemoteDirectory(sourceTab.id, sourceTab.currentPath, credentials);
      }
      setRemoteClipboard(null);
      message.success("已粘贴到当前目录");
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const submitUploads = useCallback((batch: PendingUpload, choices: Map<number, UploadConflictAction>) => {
    const { candidates, conflicts, existingNames, target, ignoreCase, recoveryTaskId } = batch;
    const byIndex = new Map(conflicts.map((conflict) => [conflict.index, conflict]));
    const nameKey = (name: string) => ignoreCase ? name.toLowerCase() : name;
    const usedNames = new Set([...existingNames, ...candidates.map(({ name }) => nameKey(name))]);
    const selectedSources: UploadSource[] = [];
    const options: Array<{ name: string; overwrite: boolean }> = [];
    for (const [index, candidate] of candidates.entries()) {
      const conflict = byIndex.get(index);
      const action = conflict ? choices.get(index) ?? "skip" : undefined;
      if (action === "skip" || (action === "overwrite" && !conflict?.canOverwrite)) continue;
      let { name } = candidate;
      if (action === "rename") {
        const dot = candidate.isDir ? -1 : name.lastIndexOf(".");
        const stem = dot > 0 ? name.slice(0, dot) : name;
        const extension = dot > 0 ? name.slice(dot) : "";
        let suffix = 1;
        do {
          name = stem + " (" + suffix + ")" + extension;
          suffix += 1;
        } while (usedNames.has(nameKey(name)));
      }
      usedNames.add(nameKey(name));
      selectedSources.push(candidate.source);
      options.push({ name, overwrite: action === "overwrite" });
    }
    if (recoveryTaskId) useSftpTransferStore.getState().remove(recoveryTaskId);
    if (selectedSources.length === 0) {
      message.info("已跳过同名上传");
      return;
    }
    enqueueUpload(target, selectedSources, options);
    message.success(selectedSources.length + " 项已加入后台上传队列");
  }, [enqueueUpload]);

  const queueUploadSourcesWithConflict = useCallback(async (
    target: PendingUpload["target"],
    sources: UploadSource[],
    recovery?: { id: string; name: string },
  ) => {
    if (sources.length === 0 || uploadCheckRunning.current || pendingUpload) return;
    const credentials = credentialsByServer[target.serverId] ?? { serverId: target.serverId };
    const ignoreCase = servers.some((server) => server.id === target.serverId && server.os_type === "windows");
    const nameKey = (name: string) => ignoreCase ? name.toLowerCase() : name;
    uploadCheckRunning.current = true;
    setUploadPreflight(true);
    const stopLoading = message.loading("正在检查远程目录中的同名项目…", 0);
    try {
      const remoteEntries = await sftpApi.list(credentials, target.remoteDir);
      const remoteByName = new Map(remoteEntries.map((entry) => [nameKey(entry.name), entry]));
      const candidates: UploadCandidate[] = [];
      for (const source of sources) {
        const candidate = await describeUploadSource(source);
        candidates.push(recovery ? { ...candidate, name: recovery.name } : candidate);
      }
      const transferKey = transferDirectoryKey(target.serverId, target.remoteDir);
      const reserved = new Set(useSftpTransferStore.getState().tasks
        .filter((task) => task.direction === "upload" && isTransferActive(task.status)
          && transferDirectoryKey(task.serverId, task.remoteDir) === transferKey)
        .map((task) => nameKey(task.name)));
      const existingNames = new Set([...remoteByName.keys(), ...reserved]);
      const conflicts: UploadConflict[] = [];
      for (const [index, candidate] of candidates.entries()) {
        const key = nameKey(candidate.name);
        const entry = remoteByName.get(key);
        const alreadyQueued = reserved.has(key);
        if (entry || alreadyQueued || recovery) {
          conflicts.push({
            index,
            name: candidate.name,
            isDir: candidate.isDir,
            localDetails: candidate.isDir
              ? candidate.itemCount + " 项（" + formatFileSize(candidate.size) + "）"
              : formatFileSize(candidate.size),
            remoteDetails: alreadyQueued
              ? "已有同名项目等待上传"
              : entry && ("远程现有：" + formatFileSize(entry.size) + " · " + entry.modified),
            canOverwrite: !alreadyQueued && (!entry || entry.isDir === candidate.isDir),
          });
        }
        reserved.add(key);
      }
      const batch: PendingUpload = {
        id: crypto.randomUUID(), target, candidates, conflicts, existingNames, ignoreCase, recoveryTaskId: recovery?.id,
      };
      const { sftpConflictPolicy } = useSettingsStore.getState();
      if (conflicts.length === 0) {
        submitUploads(batch, new Map());
      } else if (!recovery && sftpConflictPolicy !== "ask"
        && (sftpConflictPolicy !== "overwrite" || conflicts.every(({ canOverwrite }) => canOverwrite))) {
        submitUploads(batch, new Map(conflicts.map(({ index }) => [index, sftpConflictPolicy])));
      } else {
        setPendingUpload(batch);
      }
    } catch (error) {
      message.error("检查上传冲突失败：" + getErrorMessage(error));
    } finally {
      uploadCheckRunning.current = false;
      setUploadPreflight(false);
      stopLoading();
    }
  }, [credentialsByServer, pendingUpload, servers, submitUploads]);

  useEffect(() => {
    if (uploadPreflight || pendingUpload || !conflictingUpload || attemptedRecovery.current === conflictingUpload.id) return;
    const source = useSftpTransferStore.getState().getConflictingUploadSource(conflictingUpload.id);
    if (!source) return;
    attemptedRecovery.current = conflictingUpload.id;
    void queueUploadSourcesWithConflict(conflictingUpload, [source], conflictingUpload);
  }, [conflictingUpload, pendingUpload, queueUploadSourcesWithConflict, uploadPreflight]);

  const prepareUpload = (tab: SftpSessionTab, sources: UploadSource[]) => {
    if (tab.serverId === null) return;
    if (uploadCheckRunning.current || pendingUpload) {
      message.info("请先完成当前批次的上传检查或冲突处理");
      return;
    }
    void queueUploadSourcesWithConflict({
      serverId: tab.serverId, serverName: tab.serverName, remoteDir: tab.currentPath,
    }, sources);
  };

  const cancelUploadConflicts = () => {
    if (pendingUpload?.recoveryTaskId) useSftpTransferStore.getState().remove(pendingUpload.recoveryTaskId);
    setPendingUpload(null);
  };

  const confirmUploadConflicts = (choices: Map<number, UploadConflictAction>, remember: boolean) => {
    if (!pendingUpload) return;
    const policy = choices.values().next().value;
    if (remember && policy && [...choices.values()].every((choice) => choice === policy)) {
      void configApi.set(SETTINGS_KEYS.sftpConflictPolicy, policy)
        .then(() => useSettingsStore.getState().setSftpConflictPolicy(policy))
        .catch((error) => message.error("保存同名文件冲突策略失败：" + getErrorMessage(error)));
    }
    submitUploads(pendingUpload, choices);
    setPendingUpload(null);
  };

  const selectUploadFiles = async (tab: SftpSessionTab) => {
    try {
      const selected = await openFileDialog({ multiple: true, directory: false });
      if (!selected) return;
      prepareUpload(tab, Array.isArray(selected) ? selected : [selected]);
    } catch (error) {
      message.error(`打开本地文件失败：${getErrorMessage(error)}`);
    }
  };

  const selectUploadFolder = async (tab: SftpSessionTab) => {
    try {
      const selected = await openFileDialog({ directory: true, multiple: false });
      if (typeof selected === "string") prepareUpload(tab, [selected]);
    } catch (error) {
      message.error(`打开本地文件夹失败：${getErrorMessage(error)}`);
    }
  };

  // 创建文件夹确认
  const handleConfirmCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      message.warning("请输入目录名称");
      return;
    }
    if (!newFolderTargetTabId) return;

    const tab = tabs.find((item) => item.id === newFolderTargetTabId);
    const credentials = tab?.serverId ? credentialsByServer[tab.serverId] : undefined;
    if (!tab || !credentials) return;
    try {
      await sftpApi.mkdir(credentials, `${tab.currentPath}/${name}`.replace(/\/+/g, "/"));
      setNewFolderModalOpen(false);
      setNewFolderName("");
      await loadRemoteDirectory(tab.id, tab.currentPath, credentials);
      message.success(`已创建目录: ${name}`);
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  // 重命名确认
  const handleConfirmRename = async () => {
    const newName = renameNewName.trim();
    if (!newName) {
      message.warning("请输入新名称");
      return;
    }
    if (!renameTargetTabId || !renameOldName) return;

    const tab = tabs.find((item) => item.id === renameTargetTabId);
    const credentials = tab?.serverId ? credentialsByServer[tab.serverId] : undefined;
    if (!tab || !credentials) return;
    try {
      await sftpApi.rename(
        credentials,
        `${tab.currentPath}/${renameOldName}`.replace(/\/+/g, "/"),
        `${tab.currentPath}/${newName}`.replace(/\/+/g, "/"),
      );
      setRenameModalOpen(false);
      await loadRemoteDirectory(tab.id, tab.currentPath, credentials);
      message.success(`已成功重命名为: ${newName}`);
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  // 修改权限确认
  const handleConfirmPermissions = async () => {
    if (!permissionTargetItem) return;
    const modeText = permissionValue.trim() || "0755";
    if (!/^[0-7]{3,4}$/.test(modeText)) {
      message.warning("请输入 3 或 4 位八进制权限掩码");
      return;
    }
    const tab = tabs.find((item) => item.id === permissionTargetItem.tabId);
    const credentials = tab?.serverId ? credentialsByServer[tab.serverId] : undefined;
    if (!tab || !credentials) return;
    try {
      await sftpApi.chmod(
        credentials,
        `${tab.currentPath}/${permissionTargetItem.name}`.replace(/\/+/g, "/"),
        Number.parseInt(modeText, 8),
      );
      setPermissionModalOpen(false);
      await loadRemoteDirectory(tab.id, tab.currentPath, credentials);
      message.success(`已更新【${permissionTargetItem.name}】权限为 ${modeText}`);
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const triggerDownload = (fileName: string, bytes: number[]) => {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // 让 WebView 先接收下载请求，再回收 Blob URL。
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownload = async (tab: SftpSessionTab, item: RemoteFileItem) => {
    if (tab.serverId === null) return;
    const credentials = credentialsByServer[tab.serverId] ?? { serverId: tab.serverId };
    const fullPath = `${tab.currentPath}/${item.name}`.replace(/\/+/g, "/");
    // 每次打包使用单独的远程临时文件，避免覆盖同名归档或影响并发下载。
    const archivePath = item.isDir
      ? normalizeRemotePath(`${tab.currentPath}/.opspub-download-${crypto.randomUUID()}.tar.gz`)
      : null;
    try {
      if (archivePath) await sftpApi.archive(credentials, fullPath, archivePath);
      const bytes = await sftpApi.download(credentials, archivePath ?? fullPath);
      triggerDownload(item.isDir ? `${item.name}.tar.gz` : item.name, bytes);
      message.success(`已发起【${item.name}】的下载`);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      if (archivePath) {
        try {
          await sftpApi.delete(credentials, archivePath);
        } catch (error) {
          message.warning(`未能清理下载临时归档 ${archivePath}：${getErrorMessage(error)}`);
        }
      }
    }
  };

  const selectLocalDownloadDir = async () => {
    const selected = await openFileDialog({
      directory: true, multiple: false, title: "选择下载保存位置", defaultPath: localDownloadDir,
    });
    if (typeof selected !== "string") return;
    setLocalDownloadDir(selected);
    useSettingsStore.getState().setSftpDownloadDir(selected);
    void configApi.set(SETTINGS_KEYS.sftpDownloadDir, selected).catch((error) => message.error(`保存默认下载目录失败：${getErrorMessage(error)}`));
    return selected;
  };

  const downloadToLocalFolder = async (tab: SftpSessionTab, items: RemoteFileItem[], destination?: string) => {
    if (tab.serverId === null || items.length === 0) return;
    try {
      const localDir = destination ?? await selectLocalDownloadDir();
      if (!localDir) return;
      const target = { serverId: tab.serverId, serverName: tab.serverName, remoteDir: tab.currentPath };
      for (const item of items) {
        enqueueDownload(target, `${tab.currentPath.replace(/\/$/, "")}/${item.name}`, localDir, item.name);
      }
      message.success(`${items.length} 项已加入后台下载队列`);
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const startNativeDownloadDrag = async (tab: SftpSessionTab, items: RemoteFileItem[]) => {
    if (tab.serverId === null || items.length === 0) return;
    const taskId = crypto.randomUUID();
    const credentials = credentialsByServer[tab.serverId] ?? { serverId: tab.serverId };
    const remotePaths = items.map((item) => `${tab.currentPath.replace(/\/$/, "")}/${item.name}`);
    const loadingKey = `sftp-drag-${taskId}`;
    let prepared = false;
    let dropped = false;
    message.loading({ content: `正在准备 ${items.length} 个下载项…`, key: loadingKey, duration: 0 });
    try {
      const localPaths = await sftpApi.prepareDragDownload({ taskId, request: credentials, remotePaths });
      prepared = true;
      const canvas = document.createElement("canvas");
      canvas.width = 48;
      canvas.height = 48;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("无法创建拖放预览图标");
      context.fillStyle = "#0d9488";
      context.beginPath();
      context.roundRect(4, 4, 40, 40, 10);
      context.fill();
      context.fillStyle = "#ffffff";
      context.font = "bold 28px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("↓", 24, 24);
      message.destroy(loadingKey);
      await startDrag({ item: localPaths, icon: canvas.toDataURL("image/png"), mode: "copy" }, (result) => {
        dropped = result.result === "Dropped";
      });
      if (dropped) message.success(`${items.length} 个项目已拖放到目标文件夹`);
    } catch (error) {
      message.error({ content: `拖拽下载失败：${getErrorMessage(error)}`, key: loadingKey });
    } finally {
      message.destroy(loadingKey);
      if (prepared) await sftpApi.releaseDragDownload(taskId).catch(() => undefined);
    }
  };

  // 构建远程文件操作菜单，所有会改变远程状态的操作都通过 SFTP Command 执行。
  const getFileRowMenu = (tab: SftpSessionTab, item: RemoteFileItem): MenuProps => {
    const fullPath = `${tab.currentPath}/${item.name}`.replace(/\/+/g, "/");
    const credentials = tab.serverId ? credentialsByServer[tab.serverId] : undefined;

    return {
      items: [
        // 1. 打开
        {
          key: "open",
          label: "打开",
          icon: <FolderOpen size={14} className="text-slate-400" />,
          onClick: () => {
            if (item.isDir) {
              handleNavigateToPath(tab.id, fullPath);
            } else {
              void openRemoteEditor(tab, item);
            }
          },
        },
        {
          key: "download",
          label: item.isDir ? "下载文件夹…" : "下载文件…",
          icon: <Download size={14} className="text-slate-400" />,
          onClick: () => void downloadToLocalFolder(tab, [item]),
        },
        ...(item.isDir ? [{
          key: "downloadPack",
          label: "打包下载",
          icon: <Archive size={14} className="text-slate-400" />,
          onClick: () => void handleDownload(tab, item),
        }] : []),
        // 3. 在终端 cd 此目录
        {
          key: "terminalCd",
          label: item.isDir ? "在终端 cd 此目录" : "在终端打开所在目录",
          icon: <Terminal size={14} className="text-slate-400" />,
          onClick: () => {
            const command = `cd "${item.isDir ? fullPath : tab.currentPath}"`;
            void navigator.clipboard.writeText(command);
            message.info(`已复制终端命令: ${command}`);
          },
        },
        { type: "divider" },
        // 4. 复制
        {
          key: "copy",
          label: "复制",
          icon: <Copy size={14} className="text-slate-400" />,
          onClick: () => {
            setRemoteClipboard({ tabId: tab.id, path: fullPath, name: item.name, cut: false });
            message.info(`已复制【${item.name}】，可前往目标目录粘贴`);
          },
        },
        // 5. 剪切
        {
          key: "cut",
          label: "剪切",
          icon: <Scissors size={14} className="text-slate-400" />,
          onClick: () => {
            setRemoteClipboard({ tabId: tab.id, path: fullPath, name: item.name, cut: true });
            message.info(`已剪切【${item.name}】，请在目标目录点击粘贴`);
          },
        },
        { type: "divider" },
        // 6. 压缩
        {
          key: "compress",
          label: "压缩",
          icon: <Archive size={14} className="text-slate-400" />,
          onClick: async () => {
            if (!credentials) return message.warning("SFTP 会话凭据已失效，请重新连接服务器");
            const archivePath = `${fullPath}.tar.gz`;
            try {
              await sftpApi.archive(credentials, fullPath, archivePath);
              await loadRemoteDirectory(tab.id, tab.currentPath, credentials);
              message.success(`已生成压缩归档: ${item.name}.tar.gz`);
            } catch (error) {
              message.error(getErrorMessage(error));
            }
          },
        },
        // 7. 重命名
        {
          key: "rename",
          label: "重命名",
          icon: <Edit3 size={14} className="text-slate-400" />,
          onClick: () => {
            setRenameTargetTabId(tab.id);
            setRenameOldName(item.name);
            setRenameNewName(item.name);
            setRenameModalOpen(true);
          },
        },
        // 8. 权限
        {
          key: "permissions",
          label: "权限",
          icon: <ShieldCheck size={14} className="text-slate-400" />,
          onClick: () => {
            setPermissionTargetItem({ tabId: tab.id, name: item.name, mode: item.permissions });
            setPermissionValue("0755");
            setPermissionModalOpen(true);
          },
        },
        // 9. 复制路径
        {
          key: "copyPath",
          label: "复制路径",
          icon: <Link size={14} className="text-slate-400" />,
          onClick: () => {
            void navigator.clipboard.writeText(fullPath);
            message.success(`已复制绝对路径: ${fullPath}`);
          },
        },
        // 10. 复制文件名
        {
          key: "copyName",
          label: "复制文件名",
          icon: <FileText size={14} className="text-slate-400" />,
          onClick: () => {
            void navigator.clipboard.writeText(item.name);
            message.success(`已复制文件名: ${item.name}`);
          },
        },
        { type: "divider" },
        // 11. 删除 (危险红字)
        {
          key: "delete",
          danger: true,
          label: "删除",
          icon: <Trash2 size={14} />,
          onClick: () => {
            Modal.confirm({
              title: `确认删除【${item.name}】？`,
              content: `此操作将从远程主机永久删除该${item.isDir ? "目录及其内部所有文件" : "文件"}，无法撤销。`,
              okText: "确认删除",
              okButtonProps: { danger: true },
              cancelText: "取消",
              onOk: async () => {
                if (!credentials) {
                  message.warning("SFTP 会话凭据已失效，请重新连接服务器");
                  return;
                }
                try {
                  await sftpApi.delete(credentials, fullPath);
                  await loadRemoteDirectory(tab.id, tab.currentPath, credentials);
                  message.success(`已删除: ${item.name}`);
                } catch (error) {
                  message.error(getErrorMessage(error));
                }
              },
            });
          },
        },
      ],
    };
  };

  // 渲染选机视图卡片（当没有选中具体服务器时）
  const renderServerPicker = (targetPane: SftpPane) => {
    const loadError = serverLoadError ?? sessionLoadError;
    if (loadingServers || (!initialized && !loadError)) {
      return <div className="grid flex-1 place-items-center"><Spin aria-label="正在加载 SFTP 连接" /></div>;
    }
    if (loadError) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4">
          <p role="status">{serverLoadError ? "无法加载服务器" : "无法恢复 SFTP 会话"}：{loadError}</p>
          <button type="button" className="text-[var(--accent)] underline" onClick={() => void loadServers()}>重试</button>
        </div>
      );
    }
    return (
      <div className="@container/sftp-picker flex-1 flex flex-col p-4 space-y-4 overflow-y-auto custom-scrollbar">
        {/* 顶层检索与快捷操作条 */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <span className="flex items-center space-x-1.5 font-bold text-sm text-white">
              <Zap size={15} className="text-[var(--accent,#0d9488)]" />
              <span>快速连接</span>
            </span>
            <span className="text-xs text-slate-500">
              {targetPane === "left" ? "选一台服务器快捷连接进入 SFTP" : "为右栏选择第二台服务器连接对比"}
            </span>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="relative w-64 max-w-full">
              <Input
                value={serverSearchKeyword}
                onChange={(e) => setServerSearchKeyword(e.target.value)}
                placeholder="搜索别名 / IP / 标签..."
                prefix={<Search size={13} className="text-[var(--accent,#0d9488)] mr-1" />}
                allowClear
                className="bg-surface-900 border-[var(--accent,#0d9488)]/40 hover:border-[var(--accent,#0d9488)] focus:border-[var(--accent,#0d9488)] text-xs rounded-lg text-slate-200 placeholder:text-slate-500"
              />
            </div>

            <div className="flex items-center p-0.5 rounded-lg bg-surface-900 border border-slate-800 text-slate-400">
              <button
                type="button"
                onClick={() => setServerViewMode("grid")}
                className={`p-1 rounded transition ${serverViewMode === "grid" ? "bg-surface-800 text-white" : "hover:text-white"}`}
                title="网格视图"
              >
                <LayoutGrid size={13} />
              </button>
              <button
                type="button"
                onClick={() => setServerViewMode("list")}
                className={`p-1 rounded transition ${serverViewMode === "list" ? "bg-surface-800 text-white" : "hover:text-white"}`}
                title="列表视图"
              >
                <List size={13} />
              </button>
              <button
                type="button"
                onClick={() => setServerViewMode("tree")}
                className={`p-1 rounded transition ${serverViewMode === "tree" ? "bg-surface-800 text-white" : "hover:text-white"}`}
                title="树形视图"
                aria-label="树形视图"
              >
                <FolderTree size={13} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-surface-900 hover:bg-surface-800 text-slate-200 border border-slate-700/80 hover:border-slate-600 transition text-xs font-medium cursor-pointer"
            >
              <Plus size={13} />
              <span>新建服务器</span>
            </button>
          </div>
        </div>

        {/* 分组与服务器卡片列表 */}
        <Spin spinning={loadingServers}>
          <div className="space-y-2.5 min-h-[140px]">
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300">
              <span className="w-2 h-2 rounded-full bg-[var(--accent,#0d9488)]"></span>
              <span>我的服务器</span>
              <span className="text-slate-500 font-normal">{filteredServers.length} 台</span>
            </div>

            {filteredServers.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-slate-800 rounded-2xl text-xs text-slate-500">
                没有匹配的服务器，请更换搜索词或新建服务器
              </div>
            ) : serverViewMode === "tree" ? (
              <div className="sftp-tree-view @max-[650px]/sftp-picker:flex-col">
                <aside className="sftp-tree-sidebar @max-[650px]/sftp-picker:w-full @max-[650px]/sftp-picker:max-h-52" aria-label="服务器分组">
                  {serverGroups.map(({ name, items }) => {
                    const collapsed = collapsedServerGroups[name] ?? false;
                    return (
                      <div key={name} className="sftp-tree-group">
                        <button
                          type="button"
                          className="sftp-tree-group-head"
                          onClick={() => setCollapsedServerGroups((current) => ({ ...current, [name]: !collapsed }))}
                        >
                          <span className="sftp-tree-group-label">
                            <ChevronDown size={14} className={collapsed ? "-rotate-90" : ""} />
                            <Folder size={14} />
                            <strong>{name}</strong>
                          </span>
                          <span className="sftp-tree-count">{items.length}</span>
                        </button>
                        {!collapsed && (
                          <div className="sftp-tree-items">
                            {items.map((server) => {
                              const probe = connectivityByServer[server.id]?.result;
                              const online = probe?.ok ?? server.last_connection_status === "verified";
                              return (
                                <button
                                  key={server.id}
                                  type="button"
                                  className={`sftp-tree-item ${selectedTreeServer?.id === server.id ? "active" : ""}`}
                                  onClick={() => setSelectedTreeServerId(server.id)}
                                  onDoubleClick={() => handleConnectServer(server, targetPane)}
                                  title="单击查看属性，双击连接 SFTP"
                                >
                                  <span className="sftp-tree-item-main">
                                    <ServerIcon size={15} />
                                    <span className="sftp-tree-item-text">
                                      <strong>{server.alias || server.hostname}</strong>
                                      <em>{server.hostname}:{server.port}</em>
                                    </span>
                                  </span>
                                  <span className={`sftp-tree-item-status ${online ? "online" : "pending"}`}>
                                    <span className="sftp-tree-status-dot" />
                                    {probe?.latency_ms != null ? `${probe.latency_ms}ms` : online ? "在线" : "未验证"}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </aside>
                {selectedTreeServer ? (() => {
                  const server = selectedTreeServer;
                  const probe = connectivityByServer[server.id];
                  const isOnline = probe?.result?.ok ?? server.last_connection_status === "verified";
                  const policyLabel = AI_POLICY_META[normalizeAIPolicy(server.ai_policy)]?.label ?? "未知";
                  return (
                    <section className="sftp-tree-detail">
                      <div className="sftp-tree-detail-head @max-[380px]/sftp-picker:flex-wrap">
                        <div className="sftp-tree-detail-title">
                          <span className="sftp-tree-detail-icon"><ServerIcon size={20} /></span>
                          <span>
                            <span className="sftp-tree-detail-name">
                              <strong>{server.alias || server.hostname}</strong>
                              <em>{policyLabel}</em>
                            </span>
                            <span className={`sftp-tree-detail-status ${isOnline ? "online" : "pending"}`}>
                              <span className="sftp-tree-status-dot" />
                              {probe?.result?.latency_ms != null ? `在线 · ${probe.result.latency_ms}ms` : isOnline ? "在线" : "未验证"}
                            </span>
                          </span>
                        </div>
                        <button type="button" className="sftp-tree-connect" onClick={() => handleConnectServer(server, targetPane)}>
                          <Link size={14} />
                          <span>连接 SFTP</span>
                        </button>
                      </div>
                      <div className="sftp-tree-details">
                        <div><span>主机</span><strong>{server.hostname}:{server.port}</strong></div>
                        <div><span>用户名</span><strong>{server.username}</strong></div>
                        <div><span>分组</span><strong>{server.group || "我的服务器"}</strong></div>
                        <div><span>AI 策略</span><strong>{policyLabel}</strong></div>
                        <div><span>系统</span><strong>{server.os_type === "windows" ? "Windows" : "Linux"}</strong></div>
                        <div className="sftp-tree-online-row">
                          <span>在线状态</span>
                          <strong className={isOnline ? "online" : "pending"}>{isOnline ? "在线" : "未验证"}</strong>
                          <button type="button" onClick={() => void handleRetestServer(server)} disabled={probe?.loading}>
                            <RefreshCw size={13} className={probe?.loading ? "animate-spin" : ""} />
                            <span>{probe?.loading ? "检测中" : "重新检测"}</span>
                          </button>
                        </div>
                      </div>
                    </section>
                  );
                })() : (
                  <section className="sftp-tree-detail sftp-tree-empty">
                    <ServerIcon size={22} />
                    <span>没有匹配的服务器</span>
                  </section>
                )}
              </div>
            ) : (
              <div className={serverViewMode === "list" ? "grid grid-cols-1 gap-2" : "grid grid-cols-1 @min-[440px]/sftp-picker:grid-cols-2 @min-[660px]/sftp-picker:grid-cols-3 @min-[880px]/sftp-picker:grid-cols-4 gap-3"}>
                {filteredServers.map((server) => {
                  const probe = connectivityByServer[server.id]?.result;
                  const connected = tabs.some((tab) => tab.serverId === server.id);
                  const policyLabel = AI_POLICY_META[normalizeAIPolicy(server.ai_policy)]?.label ?? "未知";
                  return (
                    <button
                      key={server.id}
                      type="button"
                      onClick={() => handleConnectServer(server, targetPane)}
                      className="group relative min-w-0 p-3 text-left rounded-xl bg-surface-900/80 hover:bg-surface-850 border border-slate-800/90 hover:border-[var(--accent,#0d9488)]/50 transition-all duration-200 cursor-pointer flex flex-col justify-between space-y-2.5"
                    >
                      <span className="flex w-full items-start justify-between gap-2">
                        <span className="flex items-center space-x-2.5 min-w-0">
                          {/* 服务器卡片图标：严格跟随服务器菜单图标（ServerIcon）并遵从主题色 */}
                          <span className="relative w-8 h-8 rounded-lg bg-[var(--accent,#0d9488)]/15 border border-[var(--accent,#0d9488)]/30 flex items-center justify-center shrink-0">
                            <ServerIcon size={15} className="text-[var(--accent,#0d9488)]" />
                            {connected && <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--accent,#0d9488)] ring-2 ring-surface-900" />}
                          </span>
                          <span className="min-w-0">
                            <span className="flex items-center space-x-1.5">
                              <span className="font-bold text-xs text-[var(--text-primary)] group-hover:text-[var(--accent-hover)] transition truncate">
                                {server.alias || server.hostname}
                              </span>
                              <span className="text-[9px] px-1 py-0.2 rounded font-sans bg-rose-500/15 text-rose-300 border border-rose-500/30 shrink-0">
                                {policyLabel}
                              </span>
                            </span>
                            {connected && <span className="text-[10px] text-[var(--accent)]">会话已打开</span>}
                          </span>
                        </span>
                        {probe?.ok && probe.latency_ms !== null && (
                          <span className="font-mono text-[10px] text-[var(--text-secondary)] shrink-0">{probe.latency_ms}ms</span>
                        )}
                      </span>

                      <span className="block w-full font-mono text-[10px] text-[var(--text-secondary)] truncate">
                        {server.username}@{server.hostname}:{server.port}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Spin>

      </div>
    );
  };

  // 渲染单个窗格文件浏览器
  const renderExplorerPane = (
    pane: SftpPane,
    tab: SftpSessionTab,
    isDual: boolean
  ) => {
    const isLeft = pane === "left";
    const isDraggingOver = isLeft ? leftDraggingOver : rightDraggingOver;
    const filterInput = isLeft ? leftFilterKeyword : rightFilterKeyword;
    const filterKw = filterInput.trim().toLowerCase();
    const setFilterKw = isLeft ? setLeftFilterKeyword : setRightFilterKeyword;
    const selection = isLeft ? leftSelection : rightSelection;
    const setSelection = isLeft ? setLeftSelection : setRightSelection;
    const selectionDirectory = `${tab.id}:${tab.currentPath}`;
    const selectedNames = selection?.directory === selectionDirectory ? selection.names : [];
    const setSelectedNames = (names: string[]) => setSelection({ directory: selectionDirectory, names });
    const isEditingPath = isLeft ? leftEditingPath : rightEditingPath;
    const setIsEditingPath = isLeft ? setLeftEditingPath : setRightEditingPath;
    const pathInputVal = isLeft ? leftPathInputVal : rightPathInputVal;
    const setPathInputVal = isLeft ? setLeftPathInputVal : setRightPathInputVal;

    const directory = directoryByTab[tab.id];
    const currentDirectory = directory?.path === tab.currentPath ? directory : undefined;
    const allFiles = currentDirectory?.files ?? [];
    const visibleFiles = showHiddenFiles ? allFiles : allFiles.filter((file) => !file.name.startsWith("."));
    const displayFiles = filterKw
      ? visibleFiles.filter((f) => f.name.toLowerCase().includes(filterKw))
      : visibleFiles;

    const visibleSelected = displayFiles.filter((file) => selectedNames.includes(file.name)).length;
    const isAllSelected = displayFiles.length > 0 && visibleSelected === displayFiles.length;
    const selectedItems = allFiles.filter((item) => selectedNames.includes(item.name));

    // 拖拽事件监听
    const handleDragEnter = (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      if (isLeft) {
        leftDragCounter.current++;
        setLeftDraggingOver(true);
      } else {
        rightDragCounter.current++;
        setRightDraggingOver(true);
      }
    };

    const handleDragOver = (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
    };

    const handleDragLeave = (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      if (isLeft) {
        leftDragCounter.current--;
        if (leftDragCounter.current <= 0) {
          leftDragCounter.current = 0;
          setLeftDraggingOver(false);
        }
      } else {
        rightDragCounter.current--;
        if (rightDragCounter.current <= 0) {
          rightDragCounter.current = 0;
          setRightDraggingOver(false);
        }
      }
    };

    const handleDrop = (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      if (isLeft) {
        leftDragCounter.current = 0;
        setLeftDraggingOver(false);
      } else {
        rightDragCounter.current = 0;
        setRightDraggingOver(false);
      }
      // 目录条目只能在 drop 回调期间从 DataTransfer 取出。
      const sources: UploadSource[] = [];
      for (const item of Array.from(e.dataTransfer.items)) {
        if (item.kind !== "file") continue;
        const source = item.webkitGetAsEntry?.() ?? item.getAsFile();
        if (source) sources.push(source);
      }
      if (!allowRecursiveDrag && sources.some((source) => typeof source !== "string" && "isDirectory" in source && source.isDirectory)) {
        message.info("已在设置中关闭文件夹递归拖拽上传");
        return;
      }
      prepareUpload(tab, sources.length > 0 ? sources : Array.from(e.dataTransfer.files));
    };

    return (
      <div
        className="@container/sftp-pane flex-1 flex flex-col min-w-0 min-h-0 relative overflow-hidden bg-[var(--surface-950)]"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* 本地文件拖拽上传悬停虚线遮罩层 */}
        {isDraggingOver && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[var(--surface-950)]/90 backdrop-blur-md border-2 border-dashed border-[var(--accent,#0d9488)] animate-in fade-in zoom-in-95 pointer-events-none">
            <div className="p-4 rounded-full bg-[var(--accent,#0d9488)]/20 text-[var(--accent,#0d9488)] mb-3 animate-bounce">
              <Upload size={32} />
            </div>
            <h3 className="text-base font-bold text-white mb-1">
              松开鼠标以上传文件或文件夹
            </h3>
            <p className="text-xs text-[var(--accent-hover,#2dd4bf)] font-mono">
              上传至 {tab.serverName} ·{" "}
              <strong>{tab.currentPath}</strong>
            </p>
          </div>
        )}

        {/* 分屏模式下显示的窗格轻量标头 */}
        {isDual && (
          <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-1.5 bg-surface-900 border-b border-slate-800 text-xs">
            <div className="flex min-w-0 items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-[var(--accent,#0d9488)]"></span>
              <span className="truncate font-semibold text-white" title={tab.serverName}>
                {isLeft ? "左窗格" : "右窗格"} · {tab.serverName}
              </span>
              <span className="truncate font-mono text-[10px] text-slate-400" title={tab.serverHost}>
                ({tab.serverHost})
              </span>
            </div>

            {/* 允许在分屏下自由切换该窗格对应哪个 Tab */}
            <Dropdown
              menu={{
                selectedKeys: [tab.id],
                items: [
                  { key: "pick-server", label: "选择服务器…", icon: <Plus size={12} />, onClick: () => openPicker(pane) },
                  ...tabs.filter((t) => t.serverId !== null).map((t) => ({
                    key: t.id,
                    label: t.serverName,
                    icon: <ServerIcon size={12} className="text-[var(--accent,#0d9488)]" />,
                    onClick: () => selectTab(t.id, pane),
                  })),
                ],
              }}
              trigger={["click"]}
            >
              <button
                type="button"
                className="shrink-0 text-[11px] text-slate-400 hover:text-[var(--accent,#0d9488)] flex items-center space-x-1 px-1.5 py-0.5 rounded bg-surface-800 hover:bg-surface-750 transition cursor-pointer"
              >
                <span>切换会话</span>
              </button>
            </Dropdown>
          </div>
        )}

        {/* 路径导航工具条 (对应截图 1 / 截图 2) */}
        <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-slate-800/80 bg-surface-950/90 gap-2">
          <div className="flex flex-wrap items-center gap-1 flex-1 min-w-0">
            <button
              type="button"
              onClick={() => handleHistoryBack(tab)}
              disabled={tab.historyIndex <= 0}
              className="p-1.5 rounded-lg hover:bg-surface-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
              title="后退"
            >
              <ArrowLeft size={13} />
            </button>
            <button
              type="button"
              onClick={() => handleHistoryForward(tab)}
              disabled={tab.historyIndex >= tab.history.length - 1}
              className="p-1.5 rounded-lg hover:bg-surface-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
              title="前进"
            >
              <ArrowRight size={13} />
            </button>
            <button
              type="button"
              onClick={() => handleNavigateUp(tab)}
              className="p-1.5 rounded-lg hover:bg-surface-800 text-slate-400 hover:text-white transition cursor-pointer"
              title="上一级目录"
            >
              <ArrowUp size={13} />
            </button>
            <button
              type="button"
              onClick={() => handleNavigateToPath(tab.id, "/root")}
              className="p-1.5 rounded-lg hover:bg-surface-800 text-slate-400 hover:text-white transition cursor-pointer"
              title="回到家目录"
            >
              <Home size={13} />
            </button>

            {/* 面包屑路径输入框 */}
            <div className="flex-1 basis-28 min-w-0 max-w-xl mx-1">
              {isEditingPath ? (
                <Input
                  value={pathInputVal}
                  onChange={(e) => setPathInputVal(e.target.value)}
                  onBlur={() => {
                    if (pathInputVal.trim()) {
                      handleNavigateToPath(tab.id, pathInputVal.trim());
                    }
                    setIsEditingPath(false);
                  }}
                  onPressEnter={(event) => event.currentTarget.blur()}
                  autoFocus
                  size="small"
                  className="bg-surface-900 border-[var(--accent,#0d9488)] font-mono text-xs text-white"
                />
              ) : (
                <div
                  onClick={() => {
                    setPathInputVal(tab.currentPath);
                    setIsEditingPath(true);
                  }}
                  className="px-2.5 py-1 rounded bg-surface-900/90 hover:bg-surface-850 border border-slate-800/80 hover:border-slate-700 font-mono text-xs text-slate-200 cursor-text truncate transition flex items-center space-x-1.5"
                  title="点击编辑路径或按回车跳转"
                >
                  <span>{normalizeRemotePath(tab.currentPath)}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setPathInputVal(tab.currentPath);
                setIsEditingPath(true);
              }}
              className="p-1.5 rounded-lg hover:bg-surface-800 text-slate-400 hover:text-white transition cursor-pointer"
              title="编辑路径"
            >
              <Edit2 size={13} />
            </button>
            <button
              type="button"
              onClick={() => message.info(`历史访问栈: ${tab.history.join(" → ")}`)}
              className="p-1.5 rounded-lg hover:bg-surface-800 text-slate-400 hover:text-white transition cursor-pointer"
              title="历史记录"
            >
              <History size={13} />
            </button>
            <button
              type="button"
              onClick={() => handleRefreshPath(tab)}
              className="p-1.5 rounded-lg hover:bg-surface-800 text-slate-400 hover:text-white transition cursor-pointer"
              title="刷新目录"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {/* 操作工具栏：上传文件大按钮(主题色) + 紧随其后 4 个工具图标按钮 + 搜索过滤 (截图 1 / 截图 2) */}
        <div className="shrink-0 flex flex-wrap items-center justify-between px-3 py-1.5 bg-surface-950/60 border-b border-slate-800/60 gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {remoteClipboard && (
              <button
                type="button"
                onClick={() => void pasteRemoteItem(tab)}
                className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg font-medium transition cursor-pointer text-[var(--accent-hover,#2dd4bf)] bg-[var(--accent,#0d9488)]/15 hover:bg-[var(--accent,#0d9488)]/25 border border-[var(--accent,#0d9488)]/30"
              >
                <FolderSync size={14} />
                <span>粘贴</span>
              </button>
            )}
            {/* 上传文件主按钮：严格按照主题色走 */}
            <div className="flex rounded-lg bg-[var(--accent)] text-white">
              <button
                type="button"
                onClick={() => void selectUploadFiles(tab)}
                title={`上传至 ${tab.serverName} · ${tab.currentPath}`}
                className="flex items-center gap-1.5 rounded-l-lg px-3 py-1.5 font-semibold hover:bg-white/15"
              >
                <Upload size={14} />
                <span>上传文件</span>
              </button>
              <Dropdown
                trigger={["click"]}
                menu={{
                  items: [
                    { key: "upload", label: "选择本地文件…", icon: <Upload size={14} />, onClick: () => void selectUploadFiles(tab) },
                    { key: "upload-folder", label: "选择本地文件夹…", icon: <FolderUp size={14} />, onClick: () => void selectUploadFolder(tab) },
                    { type: "divider" },
                    { key: "transfers", label: "打开传输任务", icon: <List size={14} />, disabled: !hasTransfers, onClick: () => showTransfers("expanded") },
                  ],
                }}
              >
                <button type="button" aria-label="上传选项" className="rounded-r-lg border-l border-white/25 px-1.5 hover:bg-white/15">
                  <ChevronDown size={14} />
                </button>
              </Dropdown>
            </div>

            {/* 紧接着右侧的 4 个精巧工具图标按钮 (截图 1 / 截图 2) */}
            <div className="flex items-center space-x-1">
              <Tooltip title="上传本地文件夹">
                <button type="button" aria-label="上传本地文件夹" onClick={() => void selectUploadFolder(tab)}
                  className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-secondary)] hover:text-[var(--accent)]">
                  <FolderUp size={14} />
                </button>
              </Tooltip>
              <Tooltip title="下载选中的文件和文件夹">
                <button type="button" aria-label="下载选中项" disabled={selectedItems.length === 0}
                  onClick={() => void downloadToLocalFolder(tab, selectedItems)}
                  className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-secondary)] hover:text-[var(--accent)] disabled:opacity-40">
                  <Download size={14} />
                </button>
              </Tooltip>
              <Tooltip title="新建文件夹">
                <button
                  type="button"
                  onClick={() => {
                    setNewFolderTargetTabId(tab.id);
                    setNewFolderName("");
                    setNewFolderModalOpen(true);
                  }}
                  className="p-1.5 rounded-lg bg-surface-900 hover:bg-surface-800 text-slate-300 hover:text-[var(--accent,#0d9488)] border border-slate-800 hover:border-slate-700 transition cursor-pointer"
                >
                  <FolderPlus size={14} />
                </button>
              </Tooltip>

              <Tooltip title="新建文件">
                <button
                  type="button"
                  onClick={() => {
                    setNewFileTargetTabId(tab.id);
                    setNewFileName("untitled.txt");
                    setNewFileModalOpen(true);
                  }}
                  className="p-1.5 rounded-lg bg-surface-900 hover:bg-surface-800 text-slate-300 hover:text-[var(--accent,#0d9488)] border border-slate-800 hover:border-slate-700 transition cursor-pointer"
                >
                  <FileCode size={14} />
                </button>
              </Tooltip>

              <Tooltip title="在终端中打开当前目录">
                <button
                  type="button"
                  onClick={() => {
                    const command = `cd "${tab.currentPath}"`;
                    void navigator.clipboard.writeText(command);
                    message.info(`已复制终端命令: ${command}`);
                  }}
                  className="p-1.5 rounded-lg bg-surface-900 hover:bg-surface-800 text-slate-300 hover:text-[var(--accent,#0d9488)] border border-slate-800 hover:border-slate-700 transition cursor-pointer"
                >
                  <Terminal size={14} />
                </button>
              </Tooltip>
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <div className="relative w-40 sm:w-48">
              <Input
                value={filterInput}
                onChange={(e) => setFilterKw(e.target.value)}
                placeholder="过滤"
                prefix={<Search size={12} className="text-slate-500 mr-1" />}
                size="small"
                allowClear
                className="bg-surface-900 border-slate-800 text-xs rounded text-slate-200 focus:border-[var(--accent,#0d9488)]"
              />
            </div>
          </div>
        </div>

        {/* 文件表格核心区 (表头、图标主题色与右侧操作列完全对齐截图 1 / 截图 2) */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <Spin
            spinning={!currentDirectory || currentDirectory.loading}
            className="block h-full [&>.ant-spin-container]:h-full"
          >
        <div className="h-full min-h-0 overflow-auto custom-scrollbar relative">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-surface-950/95 backdrop-blur border-b border-slate-800 text-slate-400 select-none">
              <tr>
                <th className="py-2 px-3 w-8">
                  <Checkbox
                    checked={isAllSelected}
                    indeterminate={visibleSelected > 0 && !isAllSelected}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedNames(displayFiles.map((f) => f.name));
                      } else {
                        setSelectedNames([]);
                      }
                    }}
                  />
                </th>
                <th className="py-2 px-3 font-medium">名称</th>
                <th className="py-2 px-3 font-medium w-24">大小</th>
                <th className="py-2 px-3 font-medium w-36 @max-[540px]/sftp-pane:hidden">修改时间</th>
                <th className="py-2 px-3 font-medium w-36 @max-[540px]/sftp-pane:hidden">权限 / 属主</th>
                <th className="py-2 px-3 font-medium w-28 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 font-mono text-xs">
              {displayFiles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500 font-sans">
                    {currentDirectory?.error ? (
                      <span role="status" className="text-[var(--danger)]">无法读取目录：{currentDirectory.error}</span>
                    ) : currentDirectory?.loading === false ? (
                      filterKw ? "没有匹配的文件或目录" : "此目录为空，可直接将本地文件拖拽至此上传"
                    ) : null}
                  </td>
                </tr>
              ) : (
                displayFiles.map((item) => {
                  const isSelected = selectedNames.includes(item.name);
                  const fullItemPath = `${tab.currentPath}/${item.name}`.replace(/\/+/g, "/");

                  return (
                    <tr
                      key={item.name}
                      draggable
                      onDragStart={(event) => {
                        event.preventDefault();
                        void startNativeDownloadDrag(tab, isSelected ? selectedItems : [item]);
                      }}
                      onDoubleClick={() => {
                        if (item.isDir) {
                          handleNavigateToPath(tab.id, fullItemPath);
                        } else {
                          void openRemoteEditor(tab, item);
                        }
                      }}
                      className={`group hover:bg-surface-850/80 transition-colors duration-150 cursor-pointer ${
                        isSelected ? "bg-[var(--accent,#0d9488)]/10" : ""
                      }`}
                    >
                      <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedNames([...selectedNames, item.name]);
                            } else {
                              setSelectedNames(selectedNames.filter((n) => n !== item.name));
                            }
                          }}
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center space-x-2.5 min-w-0">
                          {getFileIcon(item)}
                          <span
                            className={`truncate font-mono text-sm ${
                              item.isDir
                                ? "text-slate-100 group-hover:text-[var(--accent,#0d9488)] font-semibold"
                                : "text-slate-200 hover:text-white font-medium"
                            }`}
                          >
                            {item.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">{item.sizeFormatted}</td>
                      <td className="py-2.5 px-3 text-slate-400 @max-[540px]/sftp-pane:hidden">{item.modified}</td>
                      <td className="py-2.5 px-3 text-slate-400 @max-[540px]/sftp-pane:hidden">
                        <span>{item.permissions}</span>
                        <span className="text-slate-600 mx-1.5">·</span>
                        <span>{item.owner}</span>
                      </td>

                      {/* 1:1 对齐截图 2 右侧操作列：目录为【打开+下载+更多...】，文件为【编辑+下载+更多...】 */}
                      <td className="py-2.5 px-3 text-right font-sans" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end space-x-1">
                          {item.isDir ? (
                            <Tooltip title="打开目录">
                              <button
                                type="button"
                                onClick={() => handleNavigateToPath(tab.id, fullItemPath)}
                                className="p-1 rounded hover:bg-surface-800 text-slate-400 hover:text-[var(--accent,#0d9488)] transition cursor-pointer"
                              >
                                <Folder size={14} />
                              </button>
                            </Tooltip>
                          ) : (
                            <Tooltip title="在线编辑">
                              <button
                                type="button"
                                onClick={() => void openRemoteEditor(tab, item)}
                                className="p-1 rounded hover:bg-surface-800 text-slate-400 hover:text-[var(--accent,#0d9488)] transition cursor-pointer"
                              >
                                <Edit3 size={14} />
                              </button>
                            </Tooltip>
                          )}

                          <Tooltip title="下载">
                            <button
                              type="button"
                              onClick={() => void downloadToLocalFolder(tab, [item])}
                              aria-label={`下载 ${item.name}`}
                              className="p-1 rounded hover:bg-surface-800 text-slate-400 hover:text-[var(--accent,#0d9488)] transition cursor-pointer"
                            >
                              <Download size={14} />
                            </button>
                          </Tooltip>

                          {/* 更多按钮：悬停显示“更多”气泡提示，点击弹出截图 2 中的 11 项操作 */}
                          <Dropdown menu={getFileRowMenu(tab, item)} trigger={["click"]} placement="bottomRight">
                            <Tooltip title="更多">
                              <button
                                type="button"
                                className="p-1 rounded hover:bg-surface-800 text-slate-400 hover:text-white transition cursor-pointer group-hover:text-slate-300"
                              >
                                <MoreHorizontal size={14} />
                              </button>
                            </Tooltip>
                          </Dropdown>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
          </Spin>
        </div>

        {/* 底部状态信息 */}
        <div className="shrink-0 flex items-center justify-between px-3 py-1.5 bg-surface-950 border-t border-slate-800 text-[11px] text-slate-500 font-mono">
          <div className="flex items-center space-x-3">
            <span>共 {displayFiles.length} 项</span>
            {selectedNames.length > 0 && (
              <span className="text-[var(--accent,#0d9488)] font-semibold">已选 {selectedNames.length} 项</span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <button type="button" className="min-w-0 truncate hover:text-[var(--accent)]"
              title={localDownloadDir ?? "选择下载目录"}
              onClick={() => void selectLocalDownloadDir().catch((error: unknown) => message.error(getErrorMessage(error)))}>
              本地目录 · {localDownloadDir?.split(/[\\/]/).filter(Boolean).pop() ?? "选择"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const focusPane = (pane: SftpPane) => {
    if (useSftpWorkspaceStore.getState().activePane !== pane) {
      useSftpWorkspaceStore.setState({ activePane: pane });
    }
  };

  return (
    <div className="ops-page ops-sftp-page flex flex-col h-full overflow-hidden select-none bg-[var(--bg-primary)] text-slate-200 font-sans">
      <WorkspaceSidebarSlot>
        <SftpSidebar
          sessions={tabs.filter((tab) => tab.serverId !== null)}
          activeTab={sidebarTab}
          pane={activePane}
          split={layoutMode === "dual-h"}
          ready={initialized}
          onSelectSession={(id) => selectTab(id, activePane)}
          onChooseServer={() => {
            if (!sidebarTab || sidebarTab.serverId !== null) openPicker(activePane);
          }}
          onOpenPath={(path) => {
            if (sidebarTab?.serverId != null) handleNavigateToPath(sidebarTab.id, path);
          }}
        />
      </WorkspaceSidebarSlot>
      {/* ========================================================================= */}
      {/* 1. 顶栏 Header：文件传输标题 + 右上角分栏切换按钮（严格跟随主题色走） */}
      {/* ========================================================================= */}
      <div className="ops-sftp-header shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-slate-800/80 bg-surface-950/80 backdrop-blur-md">
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-2">
            <span className="p-1 rounded bg-[var(--accent,#0d9488)]/15 text-[var(--accent,#0d9488)]">
              <FolderSync size={16} />
            </span>
            <h1 className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
              <span>文件传输 (SFTP)</span>
              <Tooltip title="通过 SFTP 上传和下载文件。可以选择本地文件，或将文件拖入目标窗格。">
                <HelpCircle size={13} className="text-slate-500 hover:text-slate-300 cursor-pointer" />
              </Tooltip>
            </h1>
          </div>
          <span className="text-[11px] text-slate-400 font-normal ml-1">
            浏览远程文件、双栏对比、上传下载与本地直接拖拽上传
          </span>
        </div>

        {/* 右上角分栏模式选择（完全跟随主题色高亮发光） */}
        <div className="flex items-center space-x-1 p-1 rounded-lg bg-surface-900 border border-slate-800 text-slate-400">
          <button
            type="button"
            onClick={() => setLayoutMode("single")}
            aria-pressed={layoutMode === "single"}
            disabled={!initialized}
            title="单栏专注视图"
            className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
              layoutMode === "single"
                ? "bg-[var(--accent,#0d9488)]/20 text-[var(--accent,#0d9488)] border border-[var(--accent,#0d9488)]/40 shadow-[0_0_12px_rgba(13,148,136,0.25)] font-semibold"
                : "hover:text-white hover:bg-surface-800/60 border border-transparent"
            }`}
          >
            <Square size={13} />
            <span>单栏</span>
          </button>
          <button
            type="button"
            onClick={() => setLayoutMode("dual-h")}
            aria-pressed={layoutMode === "dual-h"}
            disabled={!initialized}
            title="左右双栏对比与传输"
            className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
              layoutMode === "dual-h"
                ? "bg-[var(--accent,#0d9488)]/20 text-[var(--accent,#0d9488)] border border-[var(--accent,#0d9488)]/40 shadow-[0_0_12px_rgba(13,148,136,0.25)] font-semibold"
                : "hover:text-white hover:bg-surface-800/60 border border-transparent"
            }`}
          >
            <Columns2 size={13} />
            <span>左右分屏</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. 标签栏 (Tab Bar)：多标签管理 + 主题色激活下边框 + 全部关闭 (X) 按钮 */}
      {/* ========================================================================= */}
      <div className="ops-sftp-tabs shrink-0 flex items-center justify-between px-3 py-1 bg-surface-950 border-b border-slate-800/60 text-xs">
        <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const isPicker = tab.serverId === null;

            return (
              <div
                key={tab.id}
                draggable
                onClick={() => selectTab(tab.id, "left")}
                onDragStart={(event) => handleTabDragStart(event, tab.id)}
                onDragOver={(event) => handleTabDragOver(event, tab.id)}
                onDragLeave={() => {
                  if (dragOverTabId === tab.id) {
                    setDragOverTabId(null);
                    setDragOverSide(null);
                  }
                }}
                onDrop={(event) => handleTabDrop(event, tab.id)}
                onDragEnd={handleTabDragEnd}
                className={`sftp-session-tab group flex items-center space-x-1.5 px-3 py-1.5 rounded-t-lg transition cursor-pointer select-none text-[11px] font-medium border-t-2 ${
                  isActive
                    ? isPicker
                      ? "bg-surface-900 border-cyan-400 text-cyan-300"
                      : "bg-surface-900 border-[var(--accent,#0d9488)] text-[var(--accent-hover,#2dd4bf)] font-semibold"
                    : "bg-surface-950/60 border-transparent text-slate-400 hover:text-slate-200 hover:bg-surface-900/40"
                } ${isActive ? (isPicker ? "sftp-session-tab-picker-active" : "sftp-session-tab-active") : ""} ${draggingTabId === tab.id ? "sftp-session-tab-dragging" : ""} ${dragOverTabId === tab.id && dragOverSide === "left" ? "sftp-session-tab-drop-left" : ""} ${dragOverTabId === tab.id && dragOverSide === "right" ? "sftp-session-tab-drop-right" : ""}`}
              >
                {isPicker ? (
                  <Zap size={12} className="text-cyan-400 shrink-0" />
                ) : (
                  <ServerIcon size={12} className="text-[var(--accent,#0d9488)] shrink-0" />
                )}
                <span className="truncate max-w-[120px]">{tab.serverName}</span>
                <button
                  type="button"
                  onClick={(e) => void handleCloseTab(tab, e)}
                  className="opacity-40 group-hover:opacity-100 hover:text-rose-400 rounded p-0.5 transition"
                  title="关闭标签页"
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={handleAddTab}
            disabled={!initialized}
            title="新建会话标签"
            className="p-1 rounded hover:bg-surface-800 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <Plus size={13} />
          </button>
        </div>

        {/* 顶部第二行右侧：全部关闭 (X) 按钮 */}
        <div className="flex items-center space-x-1">
          <Tooltip title="关闭所有已打开的会话标签">
            <button
              type="button"
              onClick={() => {
                const connectedTabs = tabs.filter((t) => t.serverId !== null);
                if (connectedTabs.length === 0) {
                  message.info("暂无可关闭的主机会话");
                  return;
                }
                setCloseAllModalOpen(true);
              }}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition cursor-pointer"
            >
              <X size={13} className="text-rose-400" />
              <span>全部关闭</span>
            </button>
          </Tooltip>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. 主视口内容区：支持单栏模式 / 左右双栏分屏模式 */}
      {/* ========================================================================= */}
      <div className="ops-sftp-main flex-1 flex flex-col min-h-0 relative overflow-hidden">
        {layoutMode === "dual-h" ? (
          /* 左右双栏分屏视图 */
          <div className="flex-1 grid grid-cols-2 gap-2.5 p-2.5 min-h-0 overflow-hidden">
            {/* 左栏 */}
            <div
              className="flex flex-col h-full min-h-0 min-w-0 rounded-xl border border-slate-800/90 overflow-hidden shadow-sm"
              onFocusCapture={() => focusPane("left")}
              onPointerDownCapture={() => focusPane("left")}
            >
              {!activeLeftTab || activeLeftTab.serverId === null
                ? renderServerPicker("left")
                : renderExplorerPane("left", activeLeftTab, true)}
            </div>

            {/* 右栏 */}
            <div
              className="flex flex-col h-full min-h-0 min-w-0 rounded-xl border border-slate-800/90 overflow-hidden shadow-sm"
              onFocusCapture={() => focusPane("right")}
              onPointerDownCapture={() => focusPane("right")}
            >
              {!activeRightTab || activeRightTab.serverId === null
                ? renderServerPicker("right")
                : renderExplorerPane("right", activeRightTab, true)}
            </div>
          </div>
        ) : (
          /* 单栏模式视图 */
          <div className="flex-1 flex flex-col min-h-0 relative">
            {!activeLeftTab || activeLeftTab.serverId === null
              ? renderServerPicker("left")
              : renderExplorerPane("left", activeLeftTab, false)}
          </div>
        )}
      </div>

      {/* 全部关闭确认 Modal */}
      <Modal
        open={closeAllModalOpen}
        title={
          <div className="flex items-center space-x-2 text-rose-400 font-semibold text-sm">
            <AlertTriangle size={16} />
            <span>确认关闭全部 SFTP 会话</span>
          </div>
        }
        onCancel={() => setCloseAllModalOpen(false)}
        onOk={handleConfirmCloseAll}
        okText="确认关闭"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        width={420}
      >
        <div className="py-2 text-slate-300 text-xs leading-relaxed">
          确定要关闭所有当前已建立的 SFTP 文件传输会话吗？
          <br />
          关闭后将断开所有主机会话，并取消正在进行的后台传输。
        </div>
      </Modal>

      {/* 新建文件夹 Modal */}
      <Modal
        title="新建远程文件夹"
        open={newFolderModalOpen}
        onOk={handleConfirmCreateFolder}
        onCancel={() => setNewFolderModalOpen(false)}
        okText="确认创建"
        cancelText="取消"
        destroyOnClose
      >
        <div className="py-2 space-y-2 text-xs">
          <span className="text-slate-400 block">请输入新建文件夹名称:</span>
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="例如: backup、logs、dist"
            onPressEnter={handleConfirmCreateFolder}
            autoFocus
          />
        </div>
      </Modal>

      {/* 重命名 Modal */}
      <Modal
        title={`重命名【${renameOldName}】`}
        open={renameModalOpen}
        onOk={handleConfirmRename}
        onCancel={() => setRenameModalOpen(false)}
        okText="确认修改"
        cancelText="取消"
        destroyOnClose
      >
        <div className="py-2 space-y-2 text-xs">
          <span className="text-slate-400 block">请输入新名称:</span>
          <Input
            value={renameNewName}
            onChange={(e) => setRenameNewName(e.target.value)}
            onPressEnter={handleConfirmRename}
            autoFocus
          />
        </div>
      </Modal>

      {/* 权限修改 Modal */}
      <Modal
        title={`修改权限【${permissionTargetItem?.name}】`}
        open={permissionModalOpen}
        onOk={handleConfirmPermissions}
        onCancel={() => setPermissionModalOpen(false)}
        okText="应用权限"
        cancelText="取消"
        destroyOnClose
      >
        <div className="py-2 space-y-3 text-xs">
          <span className="text-slate-400 block">请输入八进制权限掩码 (例如 0755 / 0644):</span>
          <Input
            value={permissionValue}
            onChange={(e) => setPermissionValue(e.target.value)}
            placeholder="0755"
            onPressEnter={handleConfirmPermissions}
            autoFocus
          />
          <div className="p-2.5 rounded bg-surface-900 border border-slate-800 text-[11px] text-slate-400 space-y-1">
            <div>常用参考：</div>
            <div>• <strong className="text-slate-200">0755</strong>：可读、可执行、属主可写（目录/脚本推荐）</div>
            <div>• <strong className="text-slate-200">0644</strong>：可读、属主可写（普通文件配置推荐）</div>
            <div>• <strong className="text-slate-200">0600</strong>：仅属主可读写（私钥/敏感凭据推荐）</div>
          </div>
        </div>
      </Modal>

      {/* 新建服务器 Modal */}
      <Modal
        title={editorTarget ? `在线编辑 · ${editorTarget.name}` : "在线编辑"}
        open={editorOpen}
        width={820}
        onCancel={() => setEditorOpen(false)}
        onOk={() => void saveRemoteEditor()}
        okText="保存到服务器"
        cancelText="取消"
        confirmLoading={editorSaving}
        destroyOnClose
      >
        <Input.TextArea
          value={editorContent}
          onChange={(event) => setEditorContent(event.target.value)}
          autoSize={{ minRows: 16, maxRows: 30 }}
          disabled={editorLoading || editorSaving}
          className="font-mono text-xs"
          placeholder="文件内容"
        />
      </Modal>

      <Modal
        title="新建远程文件"
        open={newFileModalOpen}
        onCancel={() => setNewFileModalOpen(false)}
        onOk={() => void createRemoteFile()}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <Input
          value={newFileName}
          onChange={(event) => setNewFileName(event.target.value)}
          onPressEnter={() => void createRemoteFile()}
          placeholder="例如 .env、deploy.sh"
          autoFocus
        />
      </Modal>

      {pendingUpload && <UploadConflictModal
        key={pendingUpload.id}
        serverName={pendingUpload.target.serverName}
        remoteDir={pendingUpload.target.remoteDir}
        conflicts={pendingUpload.conflicts}
        otherCount={pendingUpload.candidates.length - pendingUpload.conflicts.length}
        onCancel={cancelUploadConflicts}
        onConfirm={confirmUploadConflicts}
      />}

      <SshConnectModal
        open={sshServer !== null}
        server={sshServer}
        initialCredentials={
          sshServer && credentialsByServer[sshServer.id]
            ? {
                password: credentialsByServer[sshServer.id].password,
                privateKeyPath: credentialsByServer[sshServer.id].privateKeyPath,
                passphrase: credentialsByServer[sshServer.id].passphrase,
              }
            : undefined
        }
        onCancel={() => setSshServer(null)}
        onVerified={async (_result: SshProbeResult, credentials: SshCredentials) => {
          if (!sshServer) return;
          const server = sshServer;
          const { pane, originTabId } = sshTarget.current;
          const sftpCredentials: SftpCredentials = { serverId: server.id, ...credentials };
          await setSharedCredentials(server.id, credentials);
          setSshServer(null);
          void openSessionForServer(server, pane, originTabId, sftpCredentials);
        }}
        onStatusChanged={() => loadServers()}
      />

      <ServerFormModal
        allowRdp={false}
        existingServers={servers}
        open={createModalOpen}
        server={null}
        onCancel={() => setCreateModalOpen(false)}
        onSubmit={async (payload, credentials) => {
          try {
            const serverId = await serverApi.saveForm(null, payload, credentials);
            message.success("服务器创建成功");
            setCreateModalOpen(false);
            await loadServers();
            await setSharedCredentials(serverId, {});
          } catch (e: unknown) {
            throw e;
          }
        }}
      />
    </div>
  );
}
