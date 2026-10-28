import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Empty, Input, Slider, Spin, message } from "antd";
import { listen } from "@tauri-apps/api/event";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  ChevronDown,
  Clock3,
  Circle,
  Code2,
  Columns2,
  Copy,
  Download,
  Folder,
  FolderTree,
  Grid2X2,
  LayoutGrid,
  List,
  PanelRight,
  Plus,
  Radio,
  Rows2,
  RefreshCw,
  Search,
  Send,
  Server as ServerIcon,
  Settings2,
  Sparkles,
  Square,
  Terminal as TerminalIcon,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { SshConnectModal } from "@/components/server/SshConnectModal";
import { TerminalPane } from "@/components/terminal/TerminalPane";
import { getErrorMessage } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";
import { ServerFormModal } from "@/pages/servers/components/ServerFormModal";
import {
  TERMINAL_OUTPUT_EVENT,
  TERMINAL_STATUS_EVENT,
  terminalApi,
} from "@/lib/api/terminal";
import { useAppStore } from "@/store/app";
import { useSshSessionStore } from "@/store/ssh";
import type {
  Server,
  ServerPayload,
  SshCredentials,
  SshProbeResult,
  TerminalOutputEvent,
  TerminalSessionInfo,
  TerminalStatusEvent,
} from "@/types";
import { AI_POLICY_META, OS_TYPE_LABEL } from "@/pages/servers/lib/serverMeta";

type SplitMode = "single" | "dual-h" | "dual-v" | "quad";
type DrawerTab = "monitor" | "commands" | "sftp" | "ai" | "settings" | "history" | "snippets";

const SPLIT_META: { id: SplitMode; label: string; icon: ReactNode }[] = [
  { id: "single", label: "单屏显示", icon: <Square size={14} /> },
  { id: "dual-h", label: "左右双分屏", icon: <Columns2 size={14} /> },
  { id: "dual-v", label: "上下双分屏", icon: <Rows2 size={14} /> },
  { id: "quad", label: "田字四分屏", icon: <Grid2X2 size={14} /> },
];

function splitPaneCount(mode: SplitMode): 1 | 2 | 4 {
  if (mode === "quad") return 4;
  if (mode === "single") return 1;
  return 2;
}

function needsSshCredentials(error: unknown): boolean {
  const message = getErrorMessage(error);
  return [
    "请输入 SSH 登录密码",
    "请选择或填写 SSH 私钥路径",
    "SSH 密码认证失败",
    "SSH 私钥认证失败",
    "请先完成 SSH 验证并确认主机公钥指纹",
  ]
    .some((hint) => message.includes(hint));
}

export default function TerminalPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeServerId =
    (location.state as { serverId?: number } | null)?.serverId ?? null;
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [layout, setLayout] = useState<"grid" | "list" | "tree">("grid");
  const [splitMode, setSplitMode] = useState<SplitMode>("single");
  const [syncInput, setSyncInput] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [sessions, setSessions] = useState<TerminalSessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [quickTabs, setQuickTabs] = useState<string[]>(["quick-1"]);
  const [activeQuickTabId, setActiveQuickTabId] = useState("quick-1");
  const [tabOrder, setTabOrder] = useState<string[]>(["quick:quick-1"]);
  const [draggingTab, setDraggingTab] = useState<string | null>(null);
  const nextQuickTabId = useRef(2);
  const [terminalOutputs, setTerminalOutputs] = useState<Record<string, string>>({});
  const [sessionMessages, setSessionMessages] = useState<Record<string, string>>({});
  const [sshServer, setSshServer] = useState<Server | null>(null);
  const [createServerOpen, setCreateServerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("ai");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [fontSize, setFontSize] = useState(13.5);
  const lineBuffersRef = useRef(new Map<string, string>());
  const setActiveServerId = useAppStore((state) => state.setActiveServerId);
  const sharedCredentials = useSshSessionStore((state) => state.credentialsByServer);
  const setSharedCredentials = useSshSessionStore((state) => state.setCredentials);

  const loadServers = useCallback(async (): Promise<Server[]> => {
    setLoading(true);
    try {
      const data = await serverApi.list();
      setServers(data);
      const current = useAppStore.getState().activeServerId;
      if (current === null || !data.some((server) => server.id === current)) {
        setActiveServerId(data[0]?.id ?? null);
      }
      return data;
    } catch (error) {
      message.error(getErrorMessage(error));
      return [];
    } finally {
      setLoading(false);
    }
  }, [setActiveServerId]);

  useEffect(() => {
    void loadServers();
  }, [loadServers]);

  // 终端页面是路由页面，会在切换菜单时卸载；SSH 会话不随页面卸载，
  // 重新进入时从 Rust 全局会话管理器恢复标签、状态和离线期间的输出。
  useEffect(() => {
    let disposed = false;
    void terminalApi.list().then((restored) => {
      if (disposed) return;
      setSessions(restored);
      if (restored.length > 0) {
        setQuickTabs([]);
        setTabOrder(restored.map((session) => `session:${session.sessionId}`));
      }
      setTerminalOutputs(Object.fromEntries(restored.map((session) => [session.sessionId, session.output ?? ""])));
      setSessionMessages(Object.fromEntries(restored.map((session) => [session.sessionId, session.message ?? ""])));
      const preferredServerId = routeServerId ?? useAppStore.getState().activeServerId;
      const preferred = restored.find((session) => session.serverId === preferredServerId) ?? restored[0];
      if (preferred) {
        setActiveSessionId(preferred.sessionId);
        setActiveServerId(preferred.serverId);
      }
    }).catch((error) => {
      if (!disposed) message.error(getErrorMessage(error));
    });
    return () => { disposed = true; };
  }, [routeServerId, setActiveServerId]);

  useEffect(() => {
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    void Promise.all([
      listen<TerminalOutputEvent>(TERMINAL_OUTPUT_EVENT, ({ payload }) => {
        setTerminalOutputs((current) => {
          const previous = current[payload.sessionId] ?? "";
          const next = `${previous}${payload.data}`;
          return {
            ...current,
            [payload.sessionId]: next.length > 750_000 ? next.slice(-600_000) : next,
          };
        });
      }),
      listen<TerminalStatusEvent>(TERMINAL_STATUS_EVENT, ({ payload }) => {
        setSessionMessages((current) => ({
          ...current,
          [payload.sessionId]: payload.message,
        }));
        setSessions((current) =>
          current.map((session) =>
            session.sessionId === payload.sessionId
              ? { ...session, status: payload.status }
              : session
          )
        );
      }),
    ]).then((cleanups) => {
      if (disposed) cleanups.forEach((cleanup) => cleanup());
      else unlisteners.push(...cleanups);
    }).catch((error) => {
      message.error(getErrorMessage(error));
    });

    return () => {
      disposed = true;
      unlisteners.forEach((cleanup) => cleanup());
    };
  }, []);

  const filteredServers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return servers;
    return servers.filter((server) =>
      [server.alias, server.hostname, server.username, server.group, server.tags]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [search, servers]);

  const activeSession = sessions.find((session) => session.sessionId === activeSessionId) ?? null;
  const activeServer = servers.find((server) => server.id === activeSession?.serverId) ?? null;
  const visibleSessions = useMemo(() => {
    if (!activeSessionId) return [];
    const ordered = [
      ...sessions.filter((session) => session.sessionId === activeSessionId),
      ...sessions.filter((session) => session.sessionId !== activeSessionId),
    ];
    if (splitMode === "single") return ordered.slice(0, 1);
    const count = splitMode === "quad" ? 4 : 2;
    return ordered.slice(0, count);
  }, [activeSessionId, sessions, splitMode]);

  const openTerminalSession = useCallback(async (server: Server, credentials: SshCredentials) => {
    const session = await terminalApi.open({
      serverId: server.id,
      password: credentials.password,
      privateKeyPath: credentials.privateKeyPath,
      passphrase: credentials.passphrase,
    });
    setSessions((current) => current.some((item) => item.sessionId === session.sessionId)
      ? current.map((item) => item.sessionId === session.sessionId ? session : item)
      : [...current, session]);
    const replaceQuickTab = activeSessionId === null ? activeQuickTabId : null;
    if (replaceQuickTab) setQuickTabs((current) => current.filter((id) => id !== replaceQuickTab));
    setTabOrder((current) => {
      const withoutActiveQuick = replaceQuickTab
        ? current.filter((key) => key !== `quick:${replaceQuickTab}`)
        : current;
      const sessionKey = `session:${session.sessionId}`;
      return withoutActiveQuick.includes(sessionKey) ? withoutActiveQuick : [...withoutActiveQuick, sessionKey];
    });
    setTerminalOutputs((current) => ({ ...current, [session.sessionId]: session.output ?? current[session.sessionId] ?? "" }));
    setSessionMessages((current) => ({
      ...current,
      [session.sessionId]: session.message || "SSH 终端已连接",
    }));
    setActiveSessionId(session.sessionId);
    setActiveServerId(server.id);
    await loadServers();
  }, [activeQuickTabId, activeSessionId, loadServers, setActiveServerId]);

  const openConnection = (server: Server) => {
    setDropdownOpen(false);
    setActiveServerId(server.id);
    const cachedCredentials = sharedCredentials[server.id];
    // 即使前端启动恢复没有拿到状态，也先让 Rust 从系统凭据管理器尝试连接；
    // 只有确认缺少或失效凭据时才弹窗，避免重启后因 WebView 内存为空重复验证。
    void openTerminalSession(server, cachedCredentials ?? {}).catch((error) => {
      if (needsSshCredentials(error)) {
        setSshServer(server);
      } else {
        message.error(getErrorMessage(error));
      }
    });
  };

  // 服务器资产页的“连接”动作会携带目标主机，进入终端后立即复用会话或打开验证框。
  // 用 ref 保证加载服务器列表、凭证状态变化时不会重复创建同一条终端会话。
  const autoConnectedRouteRef = useRef<string | null>(null);
  useEffect(() => {
    const routeKey = `${location.key}:${routeServerId}`;
    if (
      routeServerId === null ||
      loading ||
      sshServer !== null ||
      autoConnectedRouteRef.current === routeKey
    ) {
      return;
    }

    const server = servers.find((item) => item.id === routeServerId);
    if (!server) return;

    autoConnectedRouteRef.current = routeKey;
    const existingSession = sessions.find((session) => session.serverId === server.id);
    if (existingSession) {
      setActiveSessionId(existingSession.sessionId);
      setActiveServerId(existingSession.serverId);
      return;
    }
    openConnection(server);
  }, [loading, location.key, openConnection, routeServerId, servers, sessions, setActiveServerId, sshServer]);

  const handleCreateServer = async (
    payload: ServerPayload,
    credentials?: SshCredentials,
  ) => {
    try {
      const serverId = await serverApi.add(payload);
      message.success("服务器已纳管");
      setCreateServerOpen(false);

      const nextServers = await loadServers();
      const savedServer = nextServers.find((server) => server.id === serverId);
      if (credentials && savedServer) {
        await setSharedCredentials(savedServer.id, credentials);
      }
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const handleVerified = async (
    _result: SshProbeResult,
    credentials: SshCredentials,
  ) => {
    if (!sshServer) return;
    const server = sshServer;
    await setSharedCredentials(server.id, credentials);
    setSshServer(null);
    await openTerminalSession(server, credentials);
  };

  const closeSession = (sessionId: string) => {
    void terminalApi.close(sessionId).catch((error) => {
      message.error(getErrorMessage(error));
    });
    const remaining = sessions.filter((session) => session.sessionId !== sessionId);
    setSessions(remaining);
    setTerminalOutputs((current) => {
      const next = { ...current };
      delete next[sessionId];
      return next;
    });
    lineBuffersRef.current.delete(sessionId);
    if (activeSessionId === sessionId) {
      const next = remaining[0] ?? null;
      if (next) {
        setActiveSessionId(next.sessionId);
        setActiveServerId(next.serverId);
      } else if (quickTabs.length > 0) {
        setActiveSessionId(null);
        setActiveQuickTabId(quickTabs[quickTabs.length - 1]);
        setActiveServerId(null);
      } else {
        const quickId = `quick-${nextQuickTabId.current++}`;
        setQuickTabs([quickId]);
        setActiveQuickTabId(quickId);
        setTabOrder([`quick:${quickId}`]);
        setActiveSessionId(null);
        setActiveServerId(null);
      }
    }
    setTabOrder((current) => current.filter((key) => key !== `session:${sessionId}`));
  };

  const createQuickTab = () => {
    const quickId = `quick-${nextQuickTabId.current++}`;
    setQuickTabs((current) => [...current, quickId]);
    setTabOrder((current) => [...current, `quick:${quickId}`]);
    setActiveQuickTabId(quickId);
    setActiveSessionId(null);
    setActiveServerId(null);
  };

  const closeQuickTab = (quickId: string) => {
    const remainingQuickTabs = quickTabs.filter((id) => id !== quickId);
    setQuickTabs(remainingQuickTabs);
    setTabOrder((current) => current.filter((key) => key !== `quick:${quickId}`));
    if (activeSessionId !== null || activeQuickTabId !== quickId) return;

    const nextQuickId = remainingQuickTabs[0];
    if (nextQuickId) {
      setActiveQuickTabId(nextQuickId);
      setActiveServerId(null);
      return;
    }
    const nextSession = sessions[0];
    if (nextSession) {
      setActiveSessionId(nextSession.sessionId);
      setActiveServerId(nextSession.serverId);
      return;
    }
    const fallbackId = `quick-${nextQuickTabId.current++}`;
    setQuickTabs([fallbackId]);
    setActiveQuickTabId(fallbackId);
    setTabOrder([`quick:${fallbackId}`]);
  };

  const reorderTab = (targetKey: string, event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!draggingTab || draggingTab === targetKey) return;
    setTabOrder((current) => {
      const from = current.indexOf(draggingTab);
      const to = current.indexOf(targetKey);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      next.splice(from, 1);
      next.splice(to, 0, draggingTab);
      return next;
    });
    setDraggingTab(null);
  };

  const recordInputHistory = (sessionId: string, data: string) => {
    let buffer = lineBuffersRef.current.get(sessionId) ?? "";
    for (const character of data) {
      if (character === "\r" || character === "\n") {
        const command = buffer.trim();
        if (command) {
          setCommandHistory((current) => [...current.slice(-99), command]);
        }
        buffer = "";
      } else if (character === "\x7f" || character === "\x08") {
        buffer = buffer.slice(0, -1);
      } else if (character >= " " && character !== "\x1b") {
        buffer += character;
      }
    }
    lineBuffersRef.current.set(sessionId, buffer);
  };

  const writeToSession = (sessionId: string, data: string) => {
    void terminalApi.write(sessionId, data).catch((error) => {
      setSessionMessages((current) => ({
        ...current,
        [sessionId]: getErrorMessage(error),
      }));
      setSessions((current) =>
        current.map((session) =>
          session.sessionId === sessionId ? { ...session, status: "error" } : session
        )
      );
    });
  };

  const handleTerminalInput = (sessionId: string, data: string) => {
    recordInputHistory(sessionId, data);
    const targets = syncInput
      ? visibleSessions.filter((session) => session.status === "connected")
      : sessions.filter((session) => session.sessionId === sessionId && session.status === "connected");
    targets.forEach((session) => writeToSession(session.sessionId, data));
  };

  const insertCommand = (value: string, execute = false) => {
    if (!activeSession || activeSession.status !== "connected") {
      message.warning("请先选择一个已连接的终端会话");
      return;
    }
    writeToSession(activeSession.sessionId, `${value}${execute ? "\r" : ""}`);
  };

  return (
    <div className="ops-terminal-page">
      <section className="ops-terminal-shell">
        <div className="ops-terminal-toolbar">
          <div className="flex items-center gap-2">
            <div className="ops-terminal-split-buttons">
              {SPLIT_META.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={splitMode === item.id ? "active" : ""}
                  title={item.label}
                  aria-label={item.label}
                  aria-pressed={splitMode === item.id}
                  onClick={() => setSplitMode(item.id)}
                >
                  {item.icon}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`ops-terminal-sync ${syncInput ? "active" : ""}`}
              onClick={() => setSyncInput((current) => !current)}
              title="开启或关闭多屏实时广播输入"
            >
              <Radio size={14} />
              <span>同步输入</span>
            </button>
          </div>

          <div className="relative">
            <button
              type="button"
              className="ops-terminal-open-button"
              onClick={() => setDropdownOpen((current) => !current)}
            >
              <Plus size={14} />
              打开终端...
              <ChevronDown size={14} />
            </button>
            {dropdownOpen && (
              <div className="ops-terminal-dropdown">
                <div className="ops-terminal-dropdown-title">选择已有服务器连接</div>
                {servers.map((server) => (
                  <button key={server.id} type="button" onClick={() => openConnection(server)}>
                    <span className="flex min-w-0 items-center gap-2">
                      <Circle size={8} fill="var(--success)" color="var(--success)" />
                      <span className="truncate">{server.alias}</span>
                    </span>
                    <span>{server.hostname}</span>
                  </button>
                ))}
                {servers.length === 0 && <div className="ops-terminal-empty">暂无纳管服务器</div>}
                <button className="create" type="button" onClick={() => { setDropdownOpen(false); setCreateServerOpen(true); }}>
                  <Plus size={14} /> 新建服务器连接...
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="ops-terminal-tabs">
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto custom-scrollbar">
            {tabOrder.map((tabKey) => {
              const [kind, id] = tabKey.split(":");
              if (kind === "quick") {
                if (!quickTabs.includes(id)) return null;
                return (
                  <button
                    key={tabKey}
                    type="button"
                    draggable
                    className={`ops-terminal-tab ops-terminal-quick-tab tab-draggable ${activeSessionId === null && activeQuickTabId === id ? "active" : ""} ${draggingTab === tabKey ? "dragging" : ""}`}
                    onClick={() => { setActiveSessionId(null); setActiveQuickTabId(id); setActiveServerId(null); }}
                    onDragStart={() => setDraggingTab(tabKey)}
                    onDragOver={(event) => reorderTab(tabKey, event)}
                    onDragEnd={() => setDraggingTab(null)}
                  >
                    <Zap size={13} />
                    <span>快速连接</span>
                    <X size={12} onClick={(event) => { event.stopPropagation(); closeQuickTab(id); }} />
                  </button>
                );
              }
              const session = sessions.find((item) => item.sessionId === id);
              const server = session ? servers.find((item) => item.id === session.serverId) : null;
              if (!session || !server) return null;
              return (
                <button
                  key={tabKey}
                  type="button"
                  draggable
                  className={`ops-terminal-tab tab-draggable ${activeSessionId === session.sessionId ? "active" : ""} ${draggingTab === tabKey ? "dragging" : ""}`}
                  onClick={() => { setActiveSessionId(session.sessionId); setActiveServerId(session.serverId); }}
                  onDragStart={() => setDraggingTab(tabKey)}
                  onDragOver={(event) => reorderTab(tabKey, event)}
                  onDragEnd={() => setDraggingTab(null)}
                >
                  <Circle size={8} fill={session.status === "connected" ? "var(--success)" : "var(--danger)"} color={session.status === "connected" ? "var(--success)" : "var(--danger)"} />
                  <span>{server.alias}</span>
                  <X size={12} onClick={(event) => { event.stopPropagation(); closeSession(session.sessionId); }} />
                </button>
              );
            })}
            <button type="button" className="ops-terminal-new-tab" title="新建终端连接" onClick={createQuickTab}>
              <Plus size={14} />
            </button>
          </div>
        </div>

        {syncInput && (
          <div className="ops-terminal-notice">
            <Zap size={14} />
            <span><strong>同步输入已激活：</strong>键盘命令将广播到所有可见终端窗格。</span>
            <span className="ops-terminal-badge">BROADCAST_ACTIVE</span>
          </div>
        )}

        <div className="ops-terminal-workspace">
          <main className="ops-terminal-main">
            {activeSessionId === null ? (
              <QuickConnectView
                servers={filteredServers}
                sessions={sessions}
                loading={loading}
                search={search}
                layout={layout}
                onSearch={setSearch}
                onLayout={setLayout}
                onOpen={openConnection}
                onCreate={() => setCreateServerOpen(true)}
              />
            ) : (
              <SessionView
                servers={servers}
                visibleSessions={visibleSessions}
                terminalOutputs={terminalOutputs}
                sessionMessages={sessionMessages}
                splitMode={splitMode}
                fontSize={fontSize}
                onInput={handleTerminalInput}
                onOpenTerminal={() => setDropdownOpen(true)}
                onResize={(sessionId, cols, rows) => {
                  void terminalApi.resize(sessionId, cols, rows);
                }}
                onFocus={(sessionId) => {
                  const session = sessions.find((item) => item.sessionId === sessionId);
                  setActiveSessionId(sessionId);
                  setActiveServerId(session?.serverId ?? null);
                }}
              />
            )}
          </main>

          {drawerOpen && (
            <TerminalDrawer
              tab={drawerTab}
              commandHistory={commandHistory}
              activeSession={activeSession}
              activeServer={activeServer}
              fontSize={fontSize}
              onClose={() => setDrawerOpen(false)}
              onInsertCommand={(value) => insertCommand(value)}
              onRunCommand={(value) => insertCommand(value, true)}
              onFontSizeChange={setFontSize}
              onOpenSftp={() => navigate("/sftp")}
            />
          )}
          <TerminalToolRail
            active={drawerOpen ? drawerTab : null}
            onSelect={(tab) => {
              setDrawerTab(tab);
              setDrawerOpen(true);
            }}
            onToggle={() => setDrawerOpen((current) => !current)}
            onTransfer={() => navigate("/sftp")}
          />
        </div>
      </section>

      <SshConnectModal
        open={sshServer !== null}
        server={sshServer}
        initialCredentials={sshServer ? sharedCredentials[sshServer.id] : undefined}
        onCancel={() => {
          setSshServer(null);
        }}
        onVerified={handleVerified}
        onStatusChanged={() => {
          void loadServers();
        }}
      />

      <ServerFormModal
        open={createServerOpen}
        server={null}
        existingServers={servers}
        onCancel={() => setCreateServerOpen(false)}
        onSubmit={handleCreateServer}
      />
    </div>
  );
}

function QuickConnectView({
  servers,
  sessions,
  loading,
  search,
  layout,
  onSearch,
  onLayout,
  onOpen,
  onCreate,
}: {
  servers: Server[];
  sessions: TerminalSessionInfo[];
  loading: boolean;
  search: string;
  layout: "grid" | "list" | "tree";
  onSearch: (value: string) => void;
  onLayout: (value: "grid" | "list" | "tree") => void;
  onOpen: (server: Server) => void;
  onCreate: () => void;
}) {
  // 使用真实会话状态展示已打开数量，避免把历史认证当作当前连接。
  const openSessionCounts = useMemo(() => {
    const counts = new Map<number, number>();
    sessions.forEach((session) => {
      if (session.status === "connected") {
        counts.set(session.serverId, (counts.get(session.serverId) ?? 0) + 1);
      }
    });
    return counts;
  }, [sessions]);

  return (
    <div className="ops-terminal-quick custom-scrollbar">
      <div className="ops-terminal-quick-head">
        <div className="ops-terminal-quick-intro">
          <Zap size={19} style={{ color: "var(--nav-active-icon)" }} />
          <h2>快速连接</h2>
          <span className="ops-terminal-quick-subtitle">选一台服务器新建终端</span>
        </div>
        <div className="ops-terminal-quick-actions">
          <Input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            prefix={<Search size={14} />}
            placeholder="搜索别名 / IP / 标签..."
            aria-label="搜索服务器别名、IP、标签或分组"
            className="ops-terminal-search"
            allowClear
          />
          <div className="ops-terminal-view-toggle" role="group" aria-label="服务器显示方式">
            <button type="button" className={layout === "grid" ? "active" : ""} aria-pressed={layout === "grid"} title="网格卡片视图" onClick={() => onLayout("grid")}><LayoutGrid size={14} /></button>
            <button type="button" className={layout === "list" ? "active" : ""} aria-pressed={layout === "list"} title="列表精简视图" onClick={() => onLayout("list")}><List size={14} /></button>
            <button type="button" className={layout === "tree" ? "active" : ""} aria-pressed={layout === "tree"} title="树形层级视图" onClick={() => onLayout("tree")}><FolderTree size={14} /></button>
          </div>
          <button type="button" className="ops-terminal-create-button" onClick={onCreate}>
            <Plus size={14} />
            <span>新建服务器</span>
          </button>
        </div>
      </div>

      <div className="ops-terminal-server-heading">
        <span><Circle size={8} fill="var(--success)" color="var(--success)" /> 我的服务器</span>
        <span className="ops-terminal-server-count" aria-live="polite">{servers.length} 台</span>
      </div>

      {loading && servers.length === 0 ? <Spin /> : servers.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无匹配的服务器" />
      ) : layout === "tree" ? (
        <TerminalServerTree servers={servers} onOpen={onOpen} />
      ) : (
        <div className={layout === "grid" ? "ops-terminal-server-grid" : "ops-terminal-server-list"}>
          {servers.map((server) => <ServerCard key={server.id} server={server} openCount={openSessionCounts.get(server.id) ?? 0} compact={layout === "list"} onOpen={onOpen} />)}
        </div>
      )}

      <div className="ops-terminal-hints">
        <span>{layout === "tree" ? "单击查看属性 · 双击服务器或点击连接开启终端" : "点击服务器开启终端 · 支持搜索别名 / IP / 标签 / 分组"}</span>
        <span>已有会话保持连接，可通过顶部标签切换</span>
      </div>
    </div>
  );
}

function ServerCard({ server, compact, openCount, onOpen }: { server: Server; compact: boolean; openCount: number; onOpen: (server: Server) => void }) {
  const policy = AI_POLICY_META[server.ai_policy as keyof typeof AI_POLICY_META];
  const status = openCount > 0 ? "connected" : server.last_connection_status === "verified" ? "verified" : "pending";
  const alias = server.alias || server.hostname;
  return (
    <button
      type="button"
      className={`ops-terminal-server-card ${compact ? "compact" : ""}`}
      onClick={() => onOpen(server)}
      aria-label={`连接 ${alias}，${server.hostname}:${server.port}`}
    >
      <span className="ops-terminal-server-icon">
        <ServerIcon size={compact ? 17 : 20} />
        <span data-status={status} />
      </span>
      <span className="ops-terminal-server-info">
        <span className="ops-terminal-server-title">
          <strong title={alias}>{alias}</strong>
          <em title={policy?.hint} data-policy={server.ai_policy}>{policy?.short ?? policy?.label ?? server.ai_policy}</em>
          {openCount > 0 && <span className="ops-terminal-server-session-count">已开 {openCount}</span>}
        </span>
        <span className="ops-terminal-server-address" title={`${server.username}@${server.hostname}:${server.port}`}>{server.username}@{server.hostname}:{server.port}</span>
        {compact && <span className="ops-terminal-server-meta" title={server.group || "未分组"}>
          {OS_TYPE_LABEL[server.os_type as keyof typeof OS_TYPE_LABEL] ?? server.os_type}
          {server.group ? ` · ${server.group}` : ""}
        </span>}
      </span>
      <span className="ops-terminal-server-latency" data-status={status}>{openCount > 0 ? "已连接" : server.last_connection_status === "verified" ? "已认证" : "待验证"}</span>
    </button>
  );
}

function TerminalServerTree({ servers, onOpen }: { servers: Server[]; onOpen: (server: Server) => void }) {
  const [selectedId, setSelectedId] = useState<number | null>(servers[0]?.id ?? null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [probeState, setProbeState] = useState<Record<number, { loading: boolean; message: string; latency: number | null }>>({});
  const selectedServer = servers.find((server) => server.id === selectedId) ?? servers[0] ?? null;

  const groups = useMemo(() => {
    const grouped = new Map<string, Server[]>();
    servers.forEach((server) => {
      const name = server.group?.trim() || "我的服务器";
      grouped.set(name, [...(grouped.get(name) ?? []), server]);
    });
    return Array.from(grouped.entries());
  }, [servers]);

  const handleProbe = async (server: Server) => {
    setProbeState((current) => ({ ...current, [server.id]: { loading: true, message: "正在检测", latency: null } }));
    try {
      const result = await serverApi.testConnectivity(server.hostname, server.port, server.id);
      setProbeState((current) => ({
        ...current,
        [server.id]: { loading: false, message: result.ok ? "在线" : "不可达", latency: result.latency_ms },
      }));
    } catch (error) {
      setProbeState((current) => ({ ...current, [server.id]: { loading: false, message: getErrorMessage(error), latency: null } }));
    }
  };

  const getStatus = (server: Server) => {
    const probe = probeState[server.id];
    if (probe) return probe;
    if (server.last_connection_status === "verified") return { loading: false, message: "在线", latency: null };
    if (server.last_connection_status === "failed" || server.last_connection_status === "host_key_changed") {
      return { loading: false, message: "连接异常", latency: null };
    }
    return { loading: false, message: "待验证", latency: null };
  };

  return (
    <div className="ops-terminal-tree-view">
      <div className="ops-terminal-tree-sidebar">
        {groups.map(([groupName, groupServers]) => {
          const collapsed = collapsedGroups[groupName] ?? false;
          return (
            <div key={groupName} className="ops-terminal-tree-group">
              <button
                type="button"
                className="ops-terminal-tree-group-head"
                onClick={() => setCollapsedGroups((current) => ({ ...current, [groupName]: !collapsed }))}
                aria-expanded={!collapsed}
              >
                <span className="ops-terminal-tree-group-label">
                  <ChevronDown size={14} className={collapsed ? "-rotate-90" : ""} />
                  <Folder size={14} />
                  <strong>{groupName}</strong>
                </span>
                <span className="ops-terminal-tree-count">{groupServers.length}</span>
              </button>
              {!collapsed && (
                <div className="ops-terminal-tree-items">
                  {groupServers.map((server) => {
                    const status = getStatus(server);
                    const policy = AI_POLICY_META[server.ai_policy as keyof typeof AI_POLICY_META];
                    return (
                      <div
                        key={server.id}
                        className={`ops-terminal-tree-item ${selectedServer?.id === server.id ? "active" : ""}`}
                        onClick={() => setSelectedId(server.id)}
                        onDoubleClick={() => onOpen(server)}
                        title="单击查看属性，双击连接终端"
                      >
                        <span className="ops-terminal-tree-item-main">
                          <ServerIcon size={16} />
                          <span className="ops-terminal-tree-item-text">
                            <strong>{server.alias}</strong>
                            <em>{server.hostname}:{server.port}</em>
                          </span>
                        </span>
                        <span className={`ops-terminal-tree-item-status ${status.message === "在线" ? "online" : status.message === "待验证" ? "pending" : "error"}`}>
                          <Circle size={6} fill="currentColor" />
                          {status.latency !== null ? `${status.latency}ms` : status.message === "在线" ? "在线" : ""}
                        </span>
                        <span className="ops-terminal-tree-policy" title={policy?.hint ?? server.ai_policy}>{policy?.short ?? server.ai_policy}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedServer ? (() => {
        const status = getStatus(selectedServer);
        const policy = AI_POLICY_META[selectedServer.ai_policy as keyof typeof AI_POLICY_META];
        return (
          <section className="ops-terminal-tree-detail">
            <div className="ops-terminal-tree-detail-head">
              <div className="ops-terminal-tree-detail-title">
                <span className="ops-terminal-tree-detail-icon"><ServerIcon size={20} /></span>
                <span>
                  <span className="ops-terminal-tree-detail-name"><strong>{selectedServer.alias}</strong><em>{policy?.label ?? selectedServer.ai_policy}</em></span>
                  <span className={`ops-terminal-tree-detail-status ${status.message === "在线" ? "online" : status.message === "待验证" ? "pending" : "error"}`}>
                    <Circle size={7} fill="currentColor" />
                    {status.latency !== null ? `${status.message} · ${status.latency}ms` : status.message}
                  </span>
                </span>
              </div>
              <button type="button" className="ops-terminal-tree-connect" onClick={() => onOpen(selectedServer)}>
                <TerminalIcon size={14} />
                <span>连接</span>
              </button>
            </div>
            <div className="ops-terminal-tree-details">
              <div><span>主机</span><strong>{selectedServer.hostname}:{selectedServer.port}</strong></div>
              <div><span>用户名</span><strong>{selectedServer.username}</strong></div>
              <div><span>分组</span><strong>{selectedServer.group || "我的服务器"}</strong></div>
              <div><span>策略</span><strong>{policy?.label ?? selectedServer.ai_policy}</strong></div>
              <div><span>系统</span><strong>{OS_TYPE_LABEL[selectedServer.os_type as keyof typeof OS_TYPE_LABEL] ?? selectedServer.os_type}</strong></div>
              <div className="ops-terminal-tree-online-row"><span>在线状态</span><strong className={status.message === "在线" ? "online" : status.message === "待验证" ? "pending" : "error"}>{status.latency !== null ? `${status.message} · ${status.latency}ms` : status.message}</strong><button type="button" onClick={() => void handleProbe(selectedServer)} disabled={status.loading}><RefreshCw size={13} className={status.loading ? "animate-spin" : ""} />重测</button></div>
            </div>
          </section>
        );
      })() : (
        <div className="ops-terminal-tree-detail ops-terminal-tree-empty"><FolderTree size={28} /><span>请选择一台服务器查看详情</span></div>
      )}
    </div>
  );
}

function SessionView({
  servers,
  visibleSessions,
  terminalOutputs,
  sessionMessages,
  splitMode,
  fontSize,
  onInput,
  onOpenTerminal,
  onResize,
  onFocus,
}: {
  servers: Server[];
  visibleSessions: TerminalSessionInfo[];
  terminalOutputs: Record<string, string>;
  sessionMessages: Record<string, string>;
  splitMode: SplitMode;
  fontSize: number;
  onInput: (sessionId: string, data: string) => void;
  onOpenTerminal: () => void;
  onResize: (sessionId: string, cols: number, rows: number) => void;
  onFocus: (sessionId: string) => void;
}) {
  if (visibleSessions.length === 0) return <Empty description="请选择终端会话" />;
  const paneCount = splitPaneCount(splitMode);
  const panes = Array.from({ length: paneCount }, (_, index) => visibleSessions[index] ?? null);

  return (
    <div
      className="ops-terminal-session-grid"
      data-split-count={paneCount}
      data-split-mode={splitMode}
    >
      {panes.map((session, index) => {
        if (!session) {
          return <EmptyTerminalPane key={`empty-${index}`} paneIndex={index + 1} onOpenTerminal={onOpenTerminal} />;
        }
        const server = servers.find((item) => item.id === session.serverId);
        if (!server) return null;
        return (
          <TerminalPane
            key={session.sessionId}
            session={session}
            server={server}
            output={terminalOutputs[session.sessionId] ?? ""}
            statusMessage={sessionMessages[session.sessionId] ?? ""}
            fontSize={fontSize}
            onInput={onInput}
            onResize={onResize}
            onFocus={onFocus}
          />
        );
      })}
    </div>
  );
}

function EmptyTerminalPane({
  paneIndex,
  onOpenTerminal,
}: {
  paneIndex: number;
  onOpenTerminal: () => void;
}) {
  return (
    <div className="ops-terminal-empty-pane">
      <TerminalIcon size={22} />
      <strong>窗格 {paneIndex} 尚未连接</strong>
      <span>打开另一台服务器后，这里会显示对应终端</span>
      <button type="button" onClick={onOpenTerminal}>
        <Plus size={13} />
        打开终端
      </button>
    </div>
  );
}

function TerminalToolRail({
  active,
  onSelect,
  onToggle,
  onTransfer,
}: {
  active: DrawerTab | null;
  onSelect: (tab: DrawerTab) => void;
  onToggle: () => void;
  onTransfer: () => void;
}) {
  const tools: { id: DrawerTab; label: string; icon: ReactNode }[] = [
    { id: "monitor", label: "主机实时探针监控", icon: <Activity size={16} /> },
    { id: "commands", label: "常用快捷命令库", icon: <TerminalIcon size={16} /> },
    { id: "sftp", label: "SFTP 实时文件树", icon: <Folder size={16} /> },
    { id: "ai", label: "AI 智能排障协同", icon: <Sparkles size={16} /> },
    { id: "settings", label: "终端外观与连接配置", icon: <Settings2 size={16} /> },
    { id: "history", label: "命令历史记录", icon: <Clock3 size={16} /> },
    { id: "snippets", label: "常用脚本片段库", icon: <Code2 size={16} /> },
  ];

  return (
    <aside className="ops-terminal-rail">
      {tools.slice(0, 3).map((tool) => (
        <button key={tool.id} type="button" className={active === tool.id ? "active" : ""} title={tool.label} onClick={() => onSelect(tool.id)}>
          {tool.icon}
        </button>
      ))}
      <button type="button" title="前往 SFTP 上传文件" onClick={onTransfer}><Upload size={16} /></button>
      <button type="button" title="前往 SFTP 下载文件" onClick={onTransfer}><Download size={16} /></button>
      {tools.slice(3).map((tool) => (
        <button key={tool.id} type="button" className={active === tool.id ? "active" : ""} title={tool.label} onClick={() => onSelect(tool.id)}>
          {tool.icon}
        </button>
      ))}
      <button type="button" className="mt-auto" title="展开或收起辅助工具抽屉" onClick={onToggle}><PanelRight size={16} /></button>
    </aside>
  );
}

function TerminalDrawer({
  tab,
  commandHistory,
  activeSession,
  activeServer,
  fontSize,
  onClose,
  onInsertCommand,
  onRunCommand,
  onFontSizeChange,
  onOpenSftp,
}: {
  tab: DrawerTab;
  commandHistory: string[];
  activeSession: TerminalSessionInfo | null;
  activeServer: Server | null;
  fontSize: number;
  onClose: () => void;
  onInsertCommand: (command: string) => void;
  onRunCommand: (command: string) => void;
  onFontSizeChange: (value: number) => void;
  onOpenSftp: () => void;
}) {
  const titles: Record<DrawerTab, string> = {
    monitor: "主机实时探针",
    commands: "常用快捷命令",
    sftp: "SFTP 实时文件树",
    ai: "AI 智能排障协同",
    settings: "终端显示设置",
    history: "终端会话历史",
    snippets: "常用脚本片段",
  };
  const commands = [
    "systemctl status nginx",
    "docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'",
    "ss -tulwn | grep LISTEN",
    "tail -f -n 100 /var/log/nginx/error.log",
  ];
  const monitorCommands = [
    { label: "CPU / 内存快照", command: "top -b -n 1 | head -n 12" },
    { label: "磁盘占用", command: "df -h" },
    { label: "系统负载", command: "uptime" },
    { label: "监听端口", command: "ss -tulwn" },
  ];

  return (
    <aside className="ops-terminal-drawer">
      <div className="ops-terminal-drawer-head">
        <span><Sparkles size={15} />{titles[tab]}</span>
        <button type="button" title="关闭辅助工具" onClick={onClose}><X size={14} /></button>
      </div>
      <div className="ops-terminal-drawer-body custom-scrollbar">
        {tab === "ai" && (
          <>
            <div className="ops-terminal-drawer-note">
              <Sparkles size={14} />
              <span>选中终端中的报错信息后，可在这里继续诊断。</span>
            </div>
            <div className="ops-terminal-drawer-card">
              <strong>诊断建议</strong>
              <p>先检查服务状态、端口监听和最近错误日志，再决定是否执行变更操作。</p>
            </div>
            <div className="ops-terminal-ai-input">
              <Input placeholder="输入排障指令或追问..." />
              <button type="button" title="发送给 AI"><Send size={14} /></button>
            </div>
          </>
        )}
        {tab === "commands" && (
          <div className="space-y-2">
            {commands.map((item) => (
              <div className="ops-terminal-command-row" key={item}>
                <button type="button" className="ops-terminal-command-item" onClick={() => onInsertCommand(item)}>
                  <span>{item}</span><Copy size={13} />
                </button>
                <button type="button" className="ops-terminal-command-run" title="立即执行" onClick={() => onRunCommand(item)}>
                  <Send size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        {tab === "monitor" && (
          <div className="space-y-2">
            <div className="ops-terminal-drawer-card">
              <strong>{activeServer?.alias ?? "未选择会话"}</strong>
              <p>{activeSession?.status === "connected" ? "终端已连接，可执行实时只读探针" : "请先连接服务器"}</p>
            </div>
            {monitorCommands.map((item) => (
              <button key={item.label} type="button" className="ops-terminal-command-item" onClick={() => onRunCommand(item.command)}>
                <span>{item.label}</span><Activity size={13} />
              </button>
            ))}
          </div>
        )}
        {tab === "sftp" && (
          <div className="ops-terminal-drawer-empty">
            <Folder size={18} />
            <span>在独立 SFTP 工作区管理远程文件</span>
            <button type="button" className="ops-terminal-drawer-action" onClick={onOpenSftp}>打开 SFTP</button>
          </div>
        )}
        {tab === "settings" && (
          <div className="ops-terminal-settings-list">
            <div><span>终端字体</span><strong>Cascadia Code</strong></div>
            <div><span>字符编码</span><strong>UTF-8</strong></div>
            <div className="ops-terminal-font-setting">
              <span>字号</span>
              <strong>{fontSize.toFixed(1).replace(/\.0$/, "")}px</strong>
              <Slider min={12} max={20} step={0.5} value={fontSize} onChange={onFontSizeChange} />
            </div>
            <div><span>颜色方案</span><strong>OpsPub Dark</strong></div>
          </div>
        )}
        {tab === "history" && (
          commandHistory.length > 0
            ? [...commandHistory].reverse().map((item, index) => <button key={`${item}-${index}`} type="button" className="ops-terminal-history-item" onClick={() => onInsertCommand(item)}>{item}</button>)
            : <DrawerEmpty icon={<Clock3 size={18} />} text="暂无命令记录" />
        )}
        {tab === "snippets" && (
          <div className="space-y-2">
            {[
              "journalctl -xeu nginx.service --no-pager | tail -n 80",
              "find /var/log -type f -size +100M -printf '%s %p\\n' | sort -nr | head",
              "docker stats --no-stream",
            ].map((item) => (
              <button key={item} type="button" className="ops-terminal-command-item" onClick={() => onInsertCommand(item)}>
                <span>{item}</span><Code2 size={13} />
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function DrawerEmpty({ icon, text }: { icon: ReactNode; text: string }) {
  return <div className="ops-terminal-drawer-empty">{icon}<span>{text}</span></div>;
}
