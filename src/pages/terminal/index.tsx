import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  Eraser,
  Folder,
  Grid2X2,
  LayoutGrid,
  List,
  Maximize2,
  PanelRight,
  Plus,
  Radio,
  Rows2,
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

export default function TerminalPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeServerId =
    (location.state as { serverId?: number } | null)?.serverId ?? null;
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [splitMode, setSplitMode] = useState<SplitMode>("single");
  const [syncInput, setSyncInput] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [sessions, setSessions] = useState<TerminalSessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [terminalOutputs, setTerminalOutputs] = useState<Record<string, string>>({});
  const [sessionMessages, setSessionMessages] = useState<Record<string, string>>({});
  const [sshServer, setSshServer] = useState<Server | null>(null);
  const [createServerOpen, setCreateServerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("ai");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [fontSize, setFontSize] = useState(13);
  const sessionsRef = useRef<TerminalSessionInfo[]>([]);
  const lineBuffersRef = useRef(new Map<string, string>());
  const setActiveServerId = useAppStore((state) => state.setActiveServerId);
  const sharedCredentials = useSshSessionStore((state) => state.credentialsByServer);
  const setSharedCredentials = useSshSessionStore((state) => state.setCredentials);
  const clearSharedCredentials = useSshSessionStore((state) => state.clearCredentials);

  sessionsRef.current = sessions;

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

  useEffect(() => () => {
    sessionsRef.current.forEach((session) => {
      void terminalApi.close(session.sessionId);
    });
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
    setSessions((current) => [...current, session]);
    setSessionMessages((current) => ({
      ...current,
      [session.sessionId]: "SSH 终端已连接",
    }));
    setActiveSessionId(session.sessionId);
    setActiveServerId(server.id);
    await loadServers();
  }, [loadServers, setActiveServerId]);

  const openConnection = (server: Server) => {
    setDropdownOpen(false);
    setActiveServerId(server.id);
    const cachedCredentials = sharedCredentials[server.id];
    if (cachedCredentials) {
      void openTerminalSession(server, cachedCredentials).catch((error) => {
        message.error(getErrorMessage(error));
        clearSharedCredentials(server.id);
        setSshServer(server);
      });
      return;
    }
    setSshServer(server);
  };

  // 服务器资产页的“连接”动作会携带目标主机，进入终端后立即复用会话或打开验证框。
  // 用 ref 保证加载服务器列表、凭证状态变化时不会重复创建同一条终端会话。
  const autoConnectedServerRef = useRef<number | null>(null);
  useEffect(() => {
    if (
      routeServerId === null ||
      loading ||
      sshServer !== null ||
      autoConnectedServerRef.current === routeServerId
    ) {
      return;
    }

    const server = servers.find((item) => item.id === routeServerId);
    if (!server) return;

    autoConnectedServerRef.current = routeServerId;
    const existingSession = sessions.find((session) => session.serverId === server.id);
    if (existingSession) {
      setActiveSessionId(existingSession.sessionId);
      setActiveServerId(existingSession.serverId);
      return;
    }
    openConnection(server);
  }, [loading, openConnection, routeServerId, servers, sessions, setActiveServerId, sshServer]);

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
        setSharedCredentials(savedServer.id, credentials);
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
    setSharedCredentials(server.id, credentials);
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
      setActiveSessionId(next?.sessionId ?? null);
      setActiveServerId(next?.serverId ?? null);
    }
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

  const clearActiveTerminal = () => {
    if (!activeSessionId) return;
    setTerminalOutputs((current) => ({ ...current, [activeSessionId]: "" }));
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
            {sessions.map((session) => {
              const server = servers.find((item) => item.id === session.serverId);
              if (!server) return null;
              return (
                <button
                  key={session.sessionId}
                  type="button"
                  className={`ops-terminal-tab ${activeSessionId === session.sessionId ? "active" : ""}`}
                  onClick={() => {
                    setActiveSessionId(session.sessionId);
                    setActiveServerId(session.serverId);
                  }}
                >
                  <Circle
                    size={8}
                    fill={session.status === "connected" ? "var(--success)" : "var(--danger)"}
                    color={session.status === "connected" ? "var(--success)" : "var(--danger)"}
                  />
                  <span>{server.alias}</span>
                  <X size={12} onClick={(event) => { event.stopPropagation(); closeSession(session.sessionId); }} />
                </button>
              );
            })}
            <button
              type="button"
              className={`ops-terminal-tab ops-terminal-quick-tab ${activeSessionId === null ? "active" : ""}`}
              onClick={() => setActiveSessionId(null)}
            >
              <Zap size={13} />
              <span>快速连接</span>
            </button>
            <button type="button" className="ops-terminal-new-tab" title="新建终端连接" onClick={() => setActiveSessionId(null)}>
              <Plus size={14} />
            </button>
          </div>
          <div className="ops-terminal-pane-actions">
            <button type="button" title="左右双分屏" onClick={() => setSplitMode("dual-h")}><Columns2 size={14} /></button>
            <button type="button" title="最大化当前窗格" onClick={() => setSplitMode("single")}><Maximize2 size={14} /></button>
            <button type="button" title="清空当前终端显示" onClick={clearActiveTerminal}><Eraser size={14} /></button>
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
  loading,
  search,
  layout,
  onSearch,
  onLayout,
  onOpen,
  onCreate,
}: {
  servers: Server[];
  loading: boolean;
  search: string;
  layout: "grid" | "list";
  onSearch: (value: string) => void;
  onLayout: (value: "grid" | "list") => void;
  onOpen: (server: Server) => void;
  onCreate: () => void;
}) {
  return (
    <div className="ops-terminal-quick custom-scrollbar">
      <div className="ops-terminal-quick-head">
        <div className="flex min-w-0 items-center gap-2.5">
          <Zap size={19} style={{ color: "var(--nav-active-icon)" }} />
          <h2>快速连接</h2>
          <span>选一台服务器连接终端</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            prefix={<Search size={14} />}
            placeholder="搜索别名 / IP / 标签..."
            className="ops-terminal-search"
            allowClear
          />
          <div className="ops-terminal-view-toggle">
            <button type="button" className={layout === "grid" ? "active" : ""} title="网格卡片视图" onClick={() => onLayout("grid")}><LayoutGrid size={14} /></button>
            <button type="button" className={layout === "list" ? "active" : ""} title="列表精简视图" onClick={() => onLayout("list")}><List size={14} /></button>
          </div>
          <button type="button" className="ops-terminal-create-button" onClick={onCreate}>
            <Plus size={14} />
            <span>新建服务器</span>
          </button>
        </div>
      </div>

      <div className="ops-terminal-server-heading">
        <span><Circle size={8} fill="var(--success)" color="var(--success)" /> 我的服务器</span>
        <span>{servers.length} 台</span>
      </div>

      {loading && servers.length === 0 ? <Spin /> : servers.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无匹配的服务器" />
      ) : (
        <div className={layout === "grid" ? "ops-terminal-server-grid" : "ops-terminal-server-list"}>
          {servers.map((server) => <ServerCard key={server.id} server={server} compact={layout === "list"} onOpen={onOpen} />)}
        </div>
      )}

      <div className="ops-terminal-hints">
        <span>↑↓ 选择 · 回车连接 · 直接输入即搜索</span>
        <span>双击卡片开启终端 · OpsSentry PTY Engine</span>
      </div>
    </div>
  );
}

function ServerCard({ server, compact, onOpen }: { server: Server; compact: boolean; onOpen: (server: Server) => void }) {
  const policy = AI_POLICY_META[server.ai_policy as keyof typeof AI_POLICY_META];
  return (
    <button
      type="button"
      className={`ops-terminal-server-card ${compact ? "compact" : ""}`}
      onClick={() => onOpen(server)}
      onDoubleClick={() => onOpen(server)}
    >
      <span className="ops-terminal-server-icon">
        <ServerIcon size={compact ? 17 : 20} />
        <span />
      </span>
      <span className="ops-terminal-server-info">
        <span className="ops-terminal-server-title">
          <strong>{server.alias}</strong>
          <em>{policy?.label ?? server.ai_policy}</em>
        </span>
        <span className="ops-terminal-server-address">{server.username}@{server.hostname}:{server.port}</span>
        <span className="ops-terminal-server-meta">
          {OS_TYPE_LABEL[server.os_type as keyof typeof OS_TYPE_LABEL] ?? server.os_type}
          {server.group ? ` · ${server.group}` : ""}
        </span>
      </span>
      <span className="ops-terminal-server-latency">{server.last_connection_status === "verified" ? "已认证" : "待验证"}</span>
    </button>
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
              <strong>{fontSize}px</strong>
              <Slider min={11} max={20} step={1} value={fontSize} onChange={onFontSizeChange} />
            </div>
            <div><span>颜色方案</span><strong>OpsSentry Dark</strong></div>
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
