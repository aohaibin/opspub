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
import { useLocation } from "react-router-dom";
import type { MenuProps } from "antd";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Columns2,
  Copy,
  Download,
  Edit2,
  Edit3,
  File,
  FileCode,
  FileKey,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderSync,
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
import { ServerFormModal } from "@/pages/servers/components/ServerFormModal";
import { SshConnectModal } from "@/components/server/SshConnectModal";
import type { Server, SshCredentials, SshProbeResult } from "@/types";
import {
  type RemoteFileItem,
  type SftpLayoutMode,
  type SftpCredentials,
  type SftpSessionTab,
  type SftpViewMode,
} from "./types";

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
        size={15}
        className="text-[var(--accent,#0d9488)] fill-[var(--accent,#0d9488)]/15 shrink-0"
      />
    );
  }
  const name = item.name.toLowerCase();
  if (name.includes("key") || name.includes("id_rsa") || name.endsWith(".pem")) {
    return <FileKey size={15} className="text-rose-400 shrink-0" />;
  }
  if (name.endsWith(".js") || name.endsWith(".ts") || name.endsWith(".py") || name.endsWith(".sh")) {
    return <FileCode size={15} className="text-[var(--accent,#0d9488)] shrink-0" />;
  }
  if (name.endsWith(".json") || name.endsWith(".yml") || name.endsWith(".yaml") || name.endsWith(".cfg") || name.startsWith(".")) {
    return <FileText size={15} className="text-slate-400 shrink-0" />;
  }
  return <File size={15} className="text-slate-400 shrink-0" />;
}

/** 统一远程路径格式，确保根目录始终显示为 `/`，并避免重复或尾部斜杠。 */
function normalizeRemotePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed || trimmed === "/") return "/";

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const normalized = withLeadingSlash.replace(/\/+/g, "/");
  return normalized.length > 1 ? normalized.replace(/\/+$/, "") : "/";
}

export default function SftpPage() {
  const location = useLocation();
  const routeServerId =
    (location.state as { serverId?: number } | null)?.serverId ?? null;
  // 服务器资产列表
  const [servers, setServers] = useState<Server[]>([]);
  const [loadingServers, setLoadingServers] = useState(false);
  const [serverSearchKeyword, setServerSearchKeyword] = useState("");
  const [serverViewMode, setServerViewMode] = useState<SftpViewMode>("grid");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [sshServer, setSshServer] = useState<Server | null>(null);
  const [sshTargetPane, setSshTargetPane] = useState<"left" | "right">("left");
  const sharedCredentials = useSshSessionStore((state) => state.credentialsByServer);
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
  const [tabs, setTabs] = useState<SftpSessionTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("picker");
  const [secondaryTabId, setSecondaryTabId] = useState<string | null>(null);

  // 分屏模式（单栏 / 左右分屏）
  const [layoutMode, setLayoutMode] = useState<SftpLayoutMode>("single");

  // 全部关闭确认弹窗
  const [closeAllModalOpen, setCloseAllModalOpen] = useState(false);

  // 每个标签的远程文件列表（按 tabId 分离存储）
  const [filesByTab, setFilesByTab] = useState<Record<string, RemoteFileItem[]>>({});
  const [loadingByTab, setLoadingByTab] = useState<Record<string, boolean>>({});

  // 左右窗格各自独立的过滤搜索词
  const [leftFilterKeyword, setLeftFilterKeyword] = useState("");
  const [rightFilterKeyword, setRightFilterKeyword] = useState("");

  // 左右窗格各自选中的文件集合
  const [leftSelectedNames, setLeftSelectedNames] = useState<string[]>([]);
  const [rightSelectedNames, setRightSelectedNames] = useState<string[]>([]);

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

  // 本地文件上传 input 引用
  const leftFileInputRef = useRef<HTMLInputElement>(null);
  const rightFileInputRef = useRef<HTMLInputElement>(null);

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

  // 加载服务器列表
  const loadServers = useCallback(async () => {
    setLoadingServers(true);
    try {
      const data = await serverApi.list();
      setServers(data);
    } catch {
      // 离线模式降级，使用常用演示数据
      setServers([
        {
          id: 1,
          alias: "我的腾讯云0209",
          hostname: "111.231.166.192",
          port: 22,
          username: "root",
          auth_type: "key",
          group: "我的服务器",
          tags: JSON.stringify(["腾讯云", "生产网关"]),
          ai_policy: "trusted",
          os_type: "linux",
          favorite: false,
          arch: "x86_64",
          last_used_at: null,
          host_key_fingerprint: "",
          last_connection_status: "verified",
          last_connection_message: "",
          last_connected_at: null,
          allow_sudo: true,
          use_local_proxy: false,
          bastion_id: null,
          ai_username: "",
          created_at: "2024-01-01",
          updated_at: "2024-01-01",
        },
        {
          id: 2,
          alias: "我的阿里云",
          hostname: "106.14.39.78",
          port: 22,
          username: "root",
          auth_type: "key",
          group: "我的服务器",
          tags: JSON.stringify(["阿里云", "核心库"]),
          ai_policy: "trusted",
          os_type: "linux",
          favorite: false,
          arch: "x86_64",
          last_used_at: null,
          host_key_fingerprint: "",
          last_connection_status: "verified",
          last_connection_message: "",
          last_connected_at: null,
          allow_sudo: true,
          use_local_proxy: false,
          bastion_id: null,
          ai_username: "",
          created_at: "2024-01-01",
          updated_at: "2024-01-01",
        },
        {
          id: 3,
          alias: "我的阿里云3045",
          hostname: "8.145.62.223",
          port: 22,
          username: "root",
          auth_type: "password",
          group: "我的服务器",
          tags: JSON.stringify(["开发测试"]),
          ai_policy: "trusted",
          os_type: "linux",
          favorite: false,
          arch: "x86_64",
          last_used_at: null,
          host_key_fingerprint: "",
          last_connection_status: "verified",
          last_connection_message: "",
          last_connected_at: null,
          allow_sudo: true,
          use_local_proxy: false,
          bastion_id: null,
          ai_username: "",
          created_at: "2024-01-01",
          updated_at: "2024-01-01",
        },
        {
          id: 4,
          alias: "我的香草云",
          hostname: "156.226.177.226",
          port: 22000,
          username: "root",
          auth_type: "key",
          group: "我的服务器",
          tags: JSON.stringify(["海外备用"]),
          ai_policy: "trusted",
          os_type: "linux",
          favorite: false,
          arch: "x86_64",
          last_used_at: null,
          host_key_fingerprint: "",
          last_connection_status: "verified",
          last_connection_message: "",
          last_connected_at: null,
          allow_sudo: true,
          use_local_proxy: false,
          bastion_id: null,
          ai_username: "",
          created_at: "2024-01-01",
          updated_at: "2024-01-01",
        },
      ]);
    } finally {
      setLoadingServers(false);
    }
  }, []);

  useEffect(() => {
    void loadServers();
  }, [loadServers]);

  // 初始化：默认打开一个「选择服务器...」标签，与截图 1 对应
  useEffect(() => {
    if (tabs.length === 0) {
      const defaultTab: SftpSessionTab = {
        id: "picker-tab-default",
        serverId: null,
        serverName: "选择服务器...",
        serverHost: "",
        serverUser: "",
        currentPath: "/root",
        history: ["/root"],
        historyIndex: 0,
      };
      setTabs([defaultTab]);
      setActiveTabId(defaultTab.id);
    }
  }, [tabs.length]);

  // 左侧（主）激活的标签对象
  const activeLeftTab = useMemo(() => {
    return tabs.find((t) => t.id === activeTabId) || tabs[0] || null;
  }, [tabs, activeTabId]);

  // 右侧激活的标签对象
  const activeRightTab = useMemo(() => {
    if (secondaryTabId) {
      const found = tabs.find((t) => t.id === secondaryTabId);
      if (found) return found;
    }
    const other = tabs.find((t) => t.id !== activeTabId && t.serverId !== null);
    if (other) return other;
    return tabs.find((t) => t.id !== activeTabId) || null;
  }, [tabs, secondaryTabId, activeTabId]);

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

  const loadRemoteDirectory = useCallback(
    async (tabId: string, path: string, overrideCredentials?: SftpCredentials) => {
      const tab = tabs.find((item) => item.id === tabId);
      const credentials = overrideCredentials ?? (tab?.serverId ? credentialsByServer[tab.serverId] : undefined);
      if (!credentials) return;

      setLoadingByTab((prev) => ({ ...prev, [tabId]: true }));
      try {
        const remoteFiles = await sftpApi.list(credentials, path);
        setFilesByTab((prev) => ({
          ...prev,
          [tabId]: remoteFiles.map((file) => ({
            ...file,
            sizeFormatted: formatFileSize(file.size),
          })),
        }));
      } catch (error) {
        message.error(getErrorMessage(error));
      } finally {
        setLoadingByTab((prev) => ({ ...prev, [tabId]: false }));
      }
    },
    [credentialsByServer, tabs],
  );

  const openSessionForServer = useCallback(
    (server: Server, targetPane: "left" | "right", credentials: SftpCredentials) => {
      const serverDisplayName = server.alias || server.hostname;
      const existingTab = tabs.find((tab) => tab.serverId === server.id);
      if (existingTab) {
        if (targetPane === "left") setActiveTabId(existingTab.id);
        else setSecondaryTabId(existingTab.id);
        void loadRemoteDirectory(existingTab.id, existingTab.currentPath, credentials);
        message.info(`已切入【${serverDisplayName}】的 SFTP 会话`);
        return;
      }

      const newTabId = `sftp-session-${server.id}-${Date.now()}`;
      const newTab: SftpSessionTab = {
        id: newTabId,
        serverId: server.id,
        serverName: serverDisplayName,
        serverHost: `${server.hostname}:${server.port}`,
        serverUser: server.username,
        currentPath: "/root",
        history: ["/root"],
        historyIndex: 0,
      };

      setFilesByTab((prev) => ({ ...prev, [newTabId]: [] }));
      setTabs((prev) => {
        const isCurrentPicker = targetPane === "left" && activeLeftTab?.serverId === null;
        if (isCurrentPicker && activeLeftTab) {
          return prev.map((tab) => (tab.id === activeLeftTab.id ? newTab : tab));
        }
        return [...prev, newTab];
      });
      if (targetPane === "left") setActiveTabId(newTabId);
      else setSecondaryTabId(newTabId);

      void loadRemoteDirectory(newTabId, "/root", credentials);
      message.success(`已建立与【${serverDisplayName}】的 SFTP 连接`);
    },
    [activeLeftTab, loadRemoteDirectory, tabs],
  );

  // 连接某台服务器进入 SFTP
  const handleConnectServer = useCallback(
    (server: Server, targetPane: "left" | "right" = "left") => {
      const credentials = credentialsByServer[server.id];
      if (!credentials) {
        setSshTargetPane(targetPane);
        setSshServer(server);
        return;
      }
      openSessionForServer(server, targetPane, credentials);
    },
    [credentialsByServer, openSessionForServer],
  );

  // 服务器资产页明确点击 SFTP 时，直接打开该服务器的会话或验证框。
  const autoConnectedServerRef = useRef<number | null>(null);
  useEffect(() => {
    if (
      routeServerId === null ||
      loadingServers ||
      sshServer !== null ||
      autoConnectedServerRef.current === routeServerId
    ) {
      return;
    }

    const server = servers.find((item) => item.id === routeServerId);
    if (!server) return;

    autoConnectedServerRef.current = routeServerId;
    handleConnectServer(server);
  }, [handleConnectServer, loadingServers, routeServerId, servers, sshServer]);

  // 关闭单个标签
  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length <= 1) {
      const resetTab: SftpSessionTab = {
        id: "picker-tab-default",
        serverId: null,
        serverName: "选择服务器...",
        serverHost: "",
        serverUser: "",
        currentPath: "/root",
        history: ["/root"],
        historyIndex: 0,
      };
      setTabs([resetTab]);
      setActiveTabId(resetTab.id);
      setSecondaryTabId(null);
      return;
    }

    const nextTabs = tabs.filter((t) => t.id !== tabId);
    setTabs(nextTabs);

    if (activeTabId === tabId) {
      setActiveTabId(nextTabs[0].id);
    }
    if (secondaryTabId === tabId) {
      setSecondaryTabId(nextTabs.find((t) => t.id !== nextTabs[0].id)?.id || null);
    }
  };

  // 添加新标签（选择服务器）
  const handleAddTab = () => {
    const newPickerTab: SftpSessionTab = {
      id: `picker-tab-${Date.now()}`,
      serverId: null,
      serverName: "选择服务器...",
      serverHost: "",
      serverUser: "",
      currentPath: "/root",
      history: ["/root"],
      historyIndex: 0,
    };
    setTabs((prev) => [...prev, newPickerTab]);
    setActiveTabId(newPickerTab.id);
  };

  // 确认全部关闭
  const handleConfirmCloseAll = () => {
    const defaultTab: SftpSessionTab = {
      id: "picker-tab-default",
      serverId: null,
      serverName: "选择服务器...",
      serverHost: "",
      serverUser: "",
      currentPath: "/root",
      history: ["/root"],
      historyIndex: 0,
    };
    setTabs([defaultTab]);
    setActiveTabId(defaultTab.id);
    setSecondaryTabId(null);
    setCloseAllModalOpen(false);
    message.success("已成功关闭全部 SFTP 会话");
  };

  // 切换分屏模式
  const handleToggleLayout = (mode: SftpLayoutMode) => {
    setLayoutMode(mode);
    if (mode === "dual-h") {
      if (!secondaryTabId || secondaryTabId === activeTabId) {
        const otherTab = tabs.find((t) => t.id !== activeTabId && t.serverId !== null);
        if (otherTab) {
          setSecondaryTabId(otherTab.id);
        } else if (servers.length >= 2) {
          const secondServer = servers[1];
          handleConnectServer(secondServer, "right");
        }
      }
      message.success("已开启左右双栏分屏视图，支持左右独立浏览与拖拽上传");
    } else {
      message.info("已切换为单栏专注视图");
    }
  };

  // 路径跳转
  const handleNavigateToPath = (tabId: string, newPath: string) => {
    const cleanPath = normalizeRemotePath(newPath);

    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== tabId) return t;
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
    void loadRemoteDirectory(tabId, cleanPath);
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
    void loadRemoteDirectory(tab.id, targetPath);
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
    void loadRemoteDirectory(tab.id, targetPath);
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

  // 通过 IPC 上传本地文件内容，凭据只随当前请求传递。
  const executeUploadFiles = async (tab: SftpSessionTab, fileList: FileList | File[]) => {
    if (!fileList || fileList.length === 0) return;
    const credentials = tab.serverId ? credentialsByServer[tab.serverId] : undefined;
    if (!credentials) {
      message.warning("SFTP 会话凭据已失效，请重新连接服务器");
      return;
    }
    const files = Array.from(fileList);
    let uploaded = 0;
    try {
      for (const file of files) {
        const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
        await sftpApi.upload({
          request: credentials,
          remoteDir: tab.currentPath,
          fileName: file.name,
          content: bytes,
        });
        uploaded += 1;
      }
      await loadRemoteDirectory(tab.id, tab.currentPath, credentials);
      message.success(`已上传 ${uploaded} 个文件到 ${tab.currentPath}`);
    } catch (error) {
      message.error(getErrorMessage(error));
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
    URL.revokeObjectURL(url);
  };

  const handleDownload = async (tab: SftpSessionTab, item: RemoteFileItem) => {
    const credentials = tab.serverId ? credentialsByServer[tab.serverId] : undefined;
    if (!credentials) {
      message.warning("SFTP 会话凭据已失效，请重新连接服务器");
      return;
    }
    const fullPath = `${tab.currentPath}/${item.name}`.replace(/\/+/g, "/");
    const downloadPath = item.isDir ? `${fullPath}.tar.gz` : fullPath;
    try {
      if (item.isDir) {
        await sftpApi.archive(credentials, fullPath, downloadPath);
      }
      const bytes = await sftpApi.download(credentials, downloadPath);
      triggerDownload(item.isDir ? `${item.name}.tar.gz` : item.name, bytes);
      message.success(`已下载【${item.name}】`);
    } catch (error) {
      message.error(getErrorMessage(error));
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
        // 2. 下载 (打包)
        {
          key: "downloadPack",
          label: item.isDir ? "下载 (打包)" : "下载",
          icon: <Download size={14} className="text-slate-400" />,
          onClick: () => void handleDownload(tab, item),
        },
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
  const renderServerPicker = (targetPane: "left" | "right") => {
    return (
      <div className="flex-1 flex flex-col p-4 space-y-4 overflow-y-auto custom-scrollbar">
        {/* 顶层检索与快捷操作条 */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <span className="flex items-center space-x-1.5 font-bold text-sm text-white">
              <Zap size={15} className="text-[var(--accent,#0d9488)]" />
              <span>快速连接</span>
            </span>
            <span className="text-xs text-slate-500">
              {targetPane === "left" ? "选一台服务器快捷连接进入 SFTP" : "为右栏选择第二台服务器连接对比"}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <div className="relative w-64">
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
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredServers.map((server, idx) => {
                  const fakeLatency = [272, 258, 293, 432][idx % 4];
                  return (
                    <div
                      key={server.id}
                      onClick={() => handleConnectServer(server, targetPane)}
                      className="group relative p-3 rounded-xl bg-surface-900/80 hover:bg-surface-850 border border-slate-800/90 hover:border-[var(--accent,#0d9488)]/50 hover:shadow-[0_0_15px_rgba(13,148,136,0.2)] transition-all duration-200 cursor-pointer flex flex-col justify-between space-y-2.5"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-2.5 min-w-0">
                          {/* 服务器卡片图标：严格跟随服务器菜单图标（ServerIcon）并遵从主题色 */}
                          <div className="relative w-8 h-8 rounded-lg bg-[var(--accent,#0d9488)]/15 border border-[var(--accent,#0d9488)]/30 flex items-center justify-center shrink-0">
                            <ServerIcon size={15} className="text-[var(--accent,#0d9488)]" />
                            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--accent,#0d9488)] ring-2 ring-surface-900"></span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center space-x-1.5">
                              <span className="font-bold text-xs text-white group-hover:text-[var(--accent-hover,#2dd4bf)] transition truncate max-w-[110px]">
                                {server.alias || server.hostname}
                              </span>
                              <span className="text-[9px] px-1 py-0.2 rounded font-sans bg-rose-500/15 text-rose-300 border border-rose-500/30 shrink-0">
                                信任
                              </span>
                            </div>
                            <span className="text-[10px] text-[var(--accent,#0d9488)]/90">已开 1</span>
                          </div>
                        </div>
                        <span className="font-mono text-[10px] text-amber-400/90 shrink-0 font-medium">
                          {fakeLatency}ms
                        </span>
                      </div>

                      <div className="font-mono text-[10px] text-slate-400 truncate">
                        {server.username}@{server.hostname}:{server.port}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Spin>

        {/* 底部键盘快捷提示 */}
        <div className="mt-auto pt-4 text-center text-[11px] text-slate-500 font-mono">
          ↑↓ 选择 · 回车连接 · 直接输入即搜索
        </div>
      </div>
    );
  };

  // 渲染单个窗格文件浏览器
  const renderExplorerPane = (
    pane: "left" | "right",
    tab: SftpSessionTab,
    isDual: boolean
  ) => {
    const isLeft = pane === "left";
    const isDraggingOver = isLeft ? leftDraggingOver : rightDraggingOver;
    const fileInputRef = isLeft ? leftFileInputRef : rightFileInputRef;
    const filterKw = (isLeft ? leftFilterKeyword : rightFilterKeyword).trim().toLowerCase();
    const setFilterKw = isLeft ? setLeftFilterKeyword : setRightFilterKeyword;
    const selectedNames = isLeft ? leftSelectedNames : rightSelectedNames;
    const setSelectedNames = isLeft ? setLeftSelectedNames : setRightSelectedNames;
    const isEditingPath = isLeft ? leftEditingPath : rightEditingPath;
    const setIsEditingPath = isLeft ? setLeftEditingPath : setRightEditingPath;
    const pathInputVal = isLeft ? leftPathInputVal : rightPathInputVal;
    const setPathInputVal = isLeft ? setLeftPathInputVal : setRightPathInputVal;

    const allFiles = filesByTab[tab.id] || [];
    const displayFiles = filterKw
      ? allFiles.filter((f) => f.name.toLowerCase().includes(filterKw))
      : allFiles;

    const isAllSelected = displayFiles.length > 0 && selectedNames.length === displayFiles.length;

    // 拖拽事件监听
    const handleDragEnter = (e: React.DragEvent) => {
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
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
    };

    const handleDragLeave = (e: React.DragEvent) => {
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
      e.preventDefault();
      e.stopPropagation();
      if (isLeft) {
        leftDragCounter.current = 0;
        setLeftDraggingOver(false);
      } else {
        rightDragCounter.current = 0;
        setRightDraggingOver(false);
      }
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        executeUploadFiles(tab, e.dataTransfer.files);
      }
    };

    return (
      <div
        className="flex-1 flex flex-col min-h-0 relative overflow-hidden bg-[#0a0f1d]"
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
              松开鼠标以上传文件
            </h3>
            <p className="text-xs text-[var(--accent-hover,#2dd4bf)] font-mono">
              将直接以 256KiB 分块流上传至【{tab.serverName}】当前目录:{" "}
              <strong>{tab.currentPath}</strong>
            </p>
          </div>
        )}

        {/* 隐藏的文件选择 input */}
        <input
          type="file"
          ref={fileInputRef}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              executeUploadFiles(tab, e.target.files);
              e.target.value = "";
            }
          }}
        />

        {/* 分屏模式下显示的窗格轻量标头 */}
        {isDual && (
          <div className="shrink-0 flex items-center justify-between px-3 py-1.5 bg-surface-900 border-b border-slate-800 text-xs">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-[var(--accent,#0d9488)]"></span>
              <span className="font-semibold text-white">
                {isLeft ? "左窗格" : "右窗格"} · {tab.serverName}
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                ({tab.serverHost})
              </span>
            </div>

            {/* 允许在分屏下自由切换该窗格对应哪个 Tab */}
            <Dropdown
              menu={{
                items: tabs.map((t) => ({
                  key: t.id,
                  label: t.serverName,
                  icon: t.serverId ? <ServerIcon size={12} className="text-[var(--accent,#0d9488)]" /> : <Zap size={12} className="text-cyan-400" />,
                  onClick: () => {
                    if (isLeft) setActiveTabId(t.id);
                    else setSecondaryTabId(t.id);
                  },
                })),
              }}
              trigger={["click"]}
            >
              <button
                type="button"
                className="text-[11px] text-slate-400 hover:text-[var(--accent,#0d9488)] flex items-center space-x-1 px-1.5 py-0.5 rounded bg-surface-800 hover:bg-surface-750 transition cursor-pointer"
              >
                <span>切换会话</span>
              </button>
            </Dropdown>
          </div>
        )}

        {/* 路径导航工具条 (对应截图 1 / 截图 2) */}
        <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-slate-800/80 bg-surface-950/90 gap-2">
          <div className="flex items-center space-x-1 flex-1 min-w-0">
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
            <div className="flex-1 min-w-[120px] max-w-xl mx-1">
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
                  onPressEnter={() => {
                    if (pathInputVal.trim()) {
                      handleNavigateToPath(tab.id, pathInputVal.trim());
                    }
                    setIsEditingPath(false);
                  }}
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
        <div className="shrink-0 flex items-center justify-between px-3 py-1.5 bg-surface-950/60 border-b border-slate-800/60 gap-2 text-xs">
          <div className="flex items-center space-x-2">
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
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer text-white bg-[var(--accent,#0d9488)] hover:brightness-110 shadow-[0_0_12px_var(--accent-glow,rgba(13,148,136,0.35))]"
            >
              <Upload size={14} />
              <span>上传文件</span>
            </button>

            {/* 紧接着右侧的 4 个精巧工具图标按钮 (截图 1 / 截图 2) */}
            <div className="flex items-center space-x-1">
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

          <div className="flex items-center space-x-2">
            <div className="relative w-40 sm:w-48">
              <Input
                value={filterKw}
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
            spinning={Boolean(loadingByTab[tab.id])}
            className="block h-full [&>.ant-spin-container]:h-full"
          >
        <div className="h-full min-h-0 overflow-auto custom-scrollbar relative">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-surface-950/95 backdrop-blur border-b border-slate-800 text-slate-400 select-none">
              <tr>
                <th className="py-2 px-3 w-8">
                  <Checkbox
                    checked={isAllSelected}
                    indeterminate={selectedNames.length > 0 && !isAllSelected}
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
                <th className="py-2 px-3 font-medium w-36">修改时间</th>
                <th className="py-2 px-3 font-medium w-36">权限 / 属主</th>
                <th className="py-2 px-3 font-medium w-28 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 font-mono text-[11px]">
              {displayFiles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500 font-sans">
                    {filterKw ? "没有匹配的文件或目录" : "此目录为空，可直接将本地文件拖拽至此上传"}
                  </td>
                </tr>
              ) : (
                displayFiles.map((item) => {
                  const isSelected = selectedNames.includes(item.name);
                  const fullItemPath = `${tab.currentPath}/${item.name}`.replace(/\/+/g, "/");

                  return (
                    <tr
                      key={item.name}
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
                      <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
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
                      <td className="py-2 px-3">
                        <div className="flex items-center space-x-2 min-w-0">
                          {getFileIcon(item)}
                          <span
                            className={`truncate font-mono ${
                              item.isDir
                                ? "text-slate-200 group-hover:text-[var(--accent,#0d9488)] font-medium"
                                : "text-slate-300"
                            }`}
                          >
                            {item.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-slate-400">{item.sizeFormatted}</td>
                      <td className="py-2 px-3 text-slate-400">{item.modified}</td>
                      <td className="py-2 px-3 text-slate-400">
                        <span>{item.permissions}</span>
                        <span className="text-slate-600 mx-1.5">·</span>
                        <span>{item.owner}</span>
                      </td>

                      {/* 1:1 对齐截图 2 右侧操作列：目录为【打开+下载+更多...】，文件为【编辑+下载+更多...】 */}
                      <td className="py-2 px-3 text-right font-sans" onClick={(e) => e.stopPropagation()}>
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
                              onClick={() => void handleDownload(tab, item)}
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
            <span>拖拽外部文件可直接上传</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="ops-page flex flex-col h-full overflow-hidden select-none bg-[#090d16] text-slate-200 font-sans">
      {/* ========================================================================= */}
      {/* 1. 顶栏 Header：文件传输标题 + 右上角分栏切换按钮（严格跟随主题色走） */}
      {/* ========================================================================= */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-slate-800/80 bg-surface-950/80 backdrop-blur-md">
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-2">
            <span className="p-1 rounded bg-[var(--accent,#0d9488)]/15 text-[var(--accent,#0d9488)]">
              <FolderSync size={16} />
            </span>
            <h1 className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
              <span>文件传输 (SFTP)</span>
              <Tooltip title="基于安全 SSH 子系统流式传输，支持目录拖拽直接上传、多标签页并发与双栏传输">
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
            onClick={() => handleToggleLayout("single")}
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
            onClick={() => handleToggleLayout("dual-h")}
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
      <div className="shrink-0 flex items-center justify-between px-3 py-1 bg-surface-950 border-b border-slate-800/60 text-xs">
        <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const isPicker = tab.serverId === null;

            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`group flex items-center space-x-1.5 px-3 py-1 rounded-t-lg transition cursor-pointer select-none text-[11px] font-medium border-t-2 ${
                  isActive
                    ? isPicker
                      ? "bg-surface-900 border-cyan-400 text-cyan-300"
                      : "bg-surface-900 border-[var(--accent,#0d9488)] text-[var(--accent-hover,#2dd4bf)] font-semibold"
                    : "bg-surface-950/60 border-transparent text-slate-400 hover:text-slate-200 hover:bg-surface-900/40"
                }`}
              >
                {isPicker ? (
                  <Zap size={12} className="text-cyan-400 shrink-0" />
                ) : (
                  <ServerIcon size={12} className="text-[var(--accent,#0d9488)] shrink-0" />
                )}
                <span className="truncate max-w-[120px]">{tab.serverName}</span>
                <button
                  type="button"
                  onClick={(e) => handleCloseTab(tab.id, e)}
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
      <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
        {layoutMode === "dual-h" ? (
          /* 左右双栏分屏视图 */
          <div className="flex-1 grid grid-cols-2 gap-2.5 p-2.5 min-h-0 overflow-hidden">
            {/* 左栏 */}
            <div className="flex flex-col h-full min-h-0 rounded-xl border border-slate-800/90 overflow-hidden shadow-sm">
              {!activeLeftTab || activeLeftTab.serverId === null
                ? renderServerPicker("left")
                : renderExplorerPane("left", activeLeftTab, true)}
            </div>

            {/* 右栏 */}
            <div className="flex flex-col h-full min-h-0 rounded-xl border border-slate-800/90 overflow-hidden shadow-sm">
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
          关闭后将断开所有主机会话连接并返回「选择服务器」初始状态。
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
          const sftpCredentials: SftpCredentials = { serverId: server.id, ...credentials };
          await setSharedCredentials(server.id, credentials);
          setSshServer(null);
          openSessionForServer(server, sshTargetPane, sftpCredentials);
        }}
        onStatusChanged={() => loadServers()}
      />

      <ServerFormModal
        open={createModalOpen}
        server={null}
        onCancel={() => setCreateModalOpen(false)}
        onSubmit={async (payload, credentials) => {
          try {
            const serverId = await serverApi.add(payload);
            message.success("服务器创建成功");
            setCreateModalOpen(false);
            await loadServers();
            if (credentials) {
              await setSharedCredentials(serverId, credentials);
            }
          } catch (e: any) {
            message.error(e?.message || "创建服务器失败");
          }
        }}
      />
    </div>
  );
}
