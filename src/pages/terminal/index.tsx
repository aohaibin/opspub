import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Empty, Input, Select, Spin, message } from "antd";
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
import { WorkspaceSidebarSlot } from "@/components/layout/WorkspaceNavigation";
import { TerminalPane } from "@/components/terminal/TerminalPane";
import { TerminalSnippets } from "@/components/terminal/TerminalSnippets";
import { TERMINAL_PASTE_EVENT } from "@/lib/terminal-interactions";
import { configApi, getErrorMessage } from "@/lib/api";
import { serverApi } from "@/lib/api/server";
import { ServerFormModal } from "@/pages/servers/components/ServerFormModal";
import {
  TERMINAL_OUTPUT_EVENT,
  TERMINAL_STATUS_EVENT,
  terminalApi,
} from "@/lib/api/terminal";
import { useAppStore } from "@/store/app";
import { useSshSessionStore } from "@/store/ssh";
import { SETTINGS_KEYS, useSettingsStore, type TerminalFontSize } from "@/store/settings";
import { TERMINAL_FONT_SIZE_OPTIONS } from "@/components/terminal/terminal-themes";
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
import { TerminalSidebar } from "./TerminalSidebar";
import "./terminal-workspace.css";

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

const TERMINAL_OUTPUT_LIMIT = 750_000;
const TERMINAL_OUTPUT_RETAINED = 600_000;

function appendTerminalOutput(previous: string, data: string): string {
  const next = previous + data;
  return next.length > TERMINAL_OUTPUT_LIMIT ? next.slice(-TERMINAL_OUTPUT_RETAINED) : next;
}

function canReuseSession(status: TerminalSessionInfo["status"]): boolean {
  return status === "connected" || status === "connecting";
}

function canApplySessionStatus(current: TerminalSessionInfo["status"], incoming: TerminalSessionInfo["status"]): boolean {
  if (incoming === "closed" || incoming === "error") return true;
  if (current === "closed" || current === "error") return false;
  return current !== "closing" || incoming === "closing";
}

function reconcileSessionStatus(session: TerminalSessionInfo, event?: TerminalStatusEvent): TerminalSessionInfo {
  if (!event || !canApplySessionStatus(session.status, event.status)) return session;
  return { ...session, status: event.status, message: event.message };
}

interface TerminalOutputBuffer {
  text: string | null;
  sequence: number;
  chunks: Map<number, string>;
  pendingLength: number;
}

function drainTerminalOutput(buffer: TerminalOutputBuffer) {
  if (buffer.text === null) return;

  // 高序号先到时跨过缺口会把迟到的输出判为重复，也会打乱终端控制序列。
  let next = buffer.chunks.get(buffer.sequence + 1);
  while (next !== undefined) {
    buffer.sequence += 1;
    buffer.chunks.delete(buffer.sequence);
    buffer.pendingLength -= next.length;
    buffer.text = appendTerminalOutput(buffer.text, next);
    next = buffer.chunks.get(buffer.sequence + 1);
  }
}

function flushTerminalOutput(buffer: TerminalOutputBuffer) {
  drainTerminalOutput(buffer);
  if (buffer.text === null || buffer.pendingLength <= TERMINAL_OUTPUT_LIMIT) return;

  // 确认快照覆盖范围后才限制未合并队列，避免快照已含的事件触发额外截断。
  // 缺口后已收到的输出超过历史窗口时，旧文本和最早的等待块自然移出保留范围。
  buffer.text = "";
  for (const [sequence, data] of [...buffer.chunks].sort(([left], [right]) => left - right)) {
    if (buffer.pendingLength - data.length < TERMINAL_OUTPUT_RETAINED) break;
    buffer.chunks.delete(sequence);
    buffer.pendingLength -= data.length;
    buffer.sequence = sequence;
  }
  drainTerminalOutput(buffer);
}

export default function TerminalPage({ active }: { active: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const routeServerId = active
    ? (location.state as { serverId?: number } | null)?.serverId ?? null
    : null;
  const initialServerId = useRef(routeServerId);
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [serverListResult, setServerListResult] = useState<{ key: string; ok: boolean } | null>(null);
  const serverListRequest = useRef(0);
  const [handledRouteKey, setHandledRouteKey] = useState<string | null>(null);
  const awaitingRouteTarget = routeServerId !== null && handledRouteKey !== location.key;
  const [search, setSearch] = useState("");
  const [layout, setLayout] = useState<"grid" | "list" | "tree">("grid");
  const [splitMode, setSplitMode] = useState<SplitMode>("single");
  const [syncInput, setSyncInput] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [sessions, setSessions] = useState<TerminalSessionInfo[]>([]);
  const discardedSessionIds = useRef(new Set<string>());
  const [sessionsRestored, setSessionsRestored] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [quickTabs, setQuickTabs] = useState<string[]>(["quick-1"]);
  const [activeQuickTabId, setActiveQuickTabId] = useState("quick-1");
  const [tabOrder, setTabOrder] = useState<string[]>(["quick:quick-1"]);
  const [draggingTab, setDraggingTab] = useState<string | null>(null);
  const nextQuickTabId = useRef(2);
  const [terminalOutputs, setTerminalOutputs] = useState<Record<string, string>>({});
  const [sessionMessages, setSessionMessages] = useState<Record<string, string>>({});
  const outputBuffers = useRef(new Map<string, TerminalOutputBuffer>());
  const observedStatuses = useRef(new Map<string, TerminalStatusEvent>());
  const [sshServer, setSshServer] = useState<Server | null>(null);
  const requestedServerId = useRef<number | null>(null);
  const openingServers = useRef(new Set<number>());
  const [createServerOpen, setCreateServerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("ai");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const fontSize = useSettingsStore((state) => state.terminalFontSize);
  const setTerminalFontSize = useSettingsStore((state) => state.setTerminalFontSize);
  const lineBuffersRef = useRef(new Map<string, string>());
  const setActiveServerId = useAppStore((state) => state.setActiveServerId);
  const sharedCredentials = useSshSessionStore((state) => state.credentialsByServer);
  const setSharedCredentials = useSshSessionStore((state) => state.setCredentials);

  const loadServers = useCallback(async (): Promise<Server[] | null> => {
    const request = ++serverListRequest.current;
    setLoading(true);
    try {
      const data = await serverApi.list();
      if (request === serverListRequest.current) setServers(data);
      return data;
    } catch (error) {
      if (request === serverListRequest.current) message.error(getErrorMessage(error));
      return null;
    } finally {
      if (request === serverListRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    let disposed = false;
    // 终端保活期间，资产可能已在其他菜单新增、编辑或删除。
    void loadServers().then((data) => {
      if (!disposed) setServerListResult({ key: location.key, ok: data !== null });
    });
    return () => { disposed = true; };
  }, [active, loadServers, location.key]);

  const getOutputBuffer = useCallback((sessionId: string) => {
    let buffer = outputBuffers.current.get(sessionId);
    if (!buffer) {
      buffer = { text: null, sequence: 0, chunks: new Map<number, string>(), pendingLength: 0 };
      outputBuffers.current.set(sessionId, buffer);
    }
    return buffer;
  }, []);

  const restoreOutput = useCallback(({ sessionId, output, outputSequence }: TerminalSessionInfo) => {
    const buffer = getOutputBuffer(sessionId);
    buffer.text = output;
    buffer.sequence = outputSequence;
    for (const [sequence, data] of buffer.chunks) {
      if (sequence <= outputSequence) {
        buffer.chunks.delete(sequence);
        buffer.pendingLength -= data.length;
      }
    }
    flushTerminalOutput(buffer);
    return buffer.text;
  }, [getOutputBuffer]);

  // 先订阅，再恢复快照。等待快照期间暂存事件，合并后才允许直达复用会话。
  useEffect(() => {
    let disposed = false;
    let restoring = true;
    const unlisteners: Array<() => void> = [];
    const trackListener = async (registration: Promise<() => void>) => {
      const unlisten = await registration;
      if (disposed) unlisten();
      else unlisteners.push(unlisten);
    };

    const subscriptions = Promise.allSettled([
      trackListener(listen<TerminalOutputEvent>(TERMINAL_OUTPUT_EVENT, ({ payload: { sessionId, data, sequence } }) => {
        if (disposed || discardedSessionIds.current.has(sessionId)) return;
        const buffer = getOutputBuffer(sessionId);
        if (sequence <= buffer.sequence || buffer.chunks.has(sequence)) return;
        buffer.chunks.set(sequence, data);
        buffer.pendingLength += data.length;
        const previous = buffer.text;
        flushTerminalOutput(buffer);
        const output = buffer.text;
        if (output !== null && output !== previous) {
          setTerminalOutputs((current) => ({ ...current, [sessionId]: output }));
        }
      })),
      trackListener(listen<TerminalStatusEvent>(TERMINAL_STATUS_EVENT, ({ payload }) => {
        if (disposed || discardedSessionIds.current.has(payload.sessionId)) return;
        const previous = observedStatuses.current.get(payload.sessionId);
        // 同一个会话 ID 结束后不会再次连接，迟到的 connected 不能回退状态或提示。
        if (previous && !canApplySessionStatus(previous.status, payload.status)) return;
        observedStatuses.current.set(payload.sessionId, payload);
        if (restoring) return;
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
      })),
    ]);

    const restoreSessions = async () => {
      const registered = await subscriptions;
      if (disposed) return;
      for (const result of registered) {
        if (result.status === "rejected") message.error(getErrorMessage(result.reason));
      }
      const snapshot = await terminalApi.list().catch((error) => {
        if (!disposed) message.error(getErrorMessage(error));
        return [];
      });
      if (disposed) return;

      const outputs: Record<string, string> = {};
      const messages: Record<string, string> = {};
      const restored = snapshot.map((session) => {
        const { sessionId } = session;
        const updated = reconcileSessionStatus(session, observedStatuses.current.get(sessionId));
        observedStatuses.current.set(sessionId, { sessionId, status: updated.status, message: updated.message });
        outputs[sessionId] = restoreOutput(session);
        messages[sessionId] = updated.message;
        return updated;
      });
      restoring = false;
      setSessions(restored);
      setTerminalOutputs(outputs);
      setSessionMessages(messages);

      const directTarget = initialServerId.current;
      const preferredServerId = directTarget ?? useAppStore.getState().activeServerId;
      const preferred = restored.find((session) => session.serverId === preferredServerId && canReuseSession(session.status))
        ?? (directTarget === null ? restored[0] : undefined);
      setTabOrder((current) => [
        ...restored.map((session) => `session:${session.sessionId}`),
        ...(preferred ? [] : current),
      ]);
      if (preferred) {
        setQuickTabs([]);
        setActiveSessionId(preferred.sessionId);
      }
      setSessionsRestored(true);
    };
    void restoreSessions();

    return () => {
      disposed = true;
      unlisteners.forEach((cleanup) => cleanup());
    };
  }, [getOutputBuffer, restoreOutput]);

  const sshServers = useMemo(() => servers.filter((server) => server.protocol !== "rdp"), [servers]);
  const filteredServers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sshServers;
    return sshServers.filter((server) =>
      [server.alias, server.hostname, server.username, server.group, server.tags]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [search, sshServers]);

  const activeSession = sessions.find((session) => session.sessionId === activeSessionId) ?? null;
  const activeServer = servers.find((server) => server.id === activeSession?.serverId) ?? null;
  const currentServerId = activeSession?.serverId;
  useEffect(() => {
    if (active && !awaitingRouteTarget && currentServerId !== undefined) {
      setActiveServerId(currentServerId);
    }
  }, [active, awaitingRouteTarget, currentServerId, setActiveServerId]);

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

  const showSession = useCallback((session: TerminalSessionInfo) => {
    requestedServerId.current = null;
    setSshServer(null);
    setActiveSessionId(session.sessionId);
    setActiveServerId(session.serverId);
  }, [setActiveServerId]);

  const showQuickTab = useCallback((quickId: string) => {
    requestedServerId.current = null;
    setSshServer(null);
    setActiveSessionId(null);
    setActiveQuickTabId(quickId);
    setActiveServerId(null);
  }, [setActiveServerId]);

  const createQuickTab = useCallback(() => {
    const quickId = `quick-${nextQuickTabId.current++}`;
    setQuickTabs((current) => [...current, quickId]);
    setTabOrder((current) => [...current, `quick:${quickId}`]);
    showQuickTab(quickId);
    return quickId;
  }, [showQuickTab]);

  const openTerminalSession = useCallback(async (
    server: Server,
    credentials: SshCredentials,
    quickTab: string | null,
  ) => {
    const snapshot = await terminalApi.open({
      serverId: server.id,
      password: credentials.password,
      privateKeyPath: credentials.privateKeyPath,
      passphrase: credentials.passphrase,
    });
    const { sessionId } = snapshot;
    if (discardedSessionIds.current.has(sessionId)) throw new Error("SSH 终端已结束，请重新连接");
    const session = reconcileSessionStatus(snapshot, observedStatuses.current.get(sessionId));
    observedStatuses.current.set(sessionId, { sessionId, status: session.status, message: session.message });
    if (outputBuffers.current.get(sessionId)?.text == null) {
      const output = restoreOutput(snapshot);
      setTerminalOutputs((current) => ({ ...current, [sessionId]: output }));
    }
    setSessions((current) => current.some((item) => item.sessionId === session.sessionId)
      ? current.map((item) => item.sessionId === session.sessionId ? session : item)
      : [...current, session]);
    // 较早的连接请求仍可加入标签，但不能抢走用户后来选中的会话。
    const activateSession = requestedServerId.current === server.id;
    const replaceQuickTab = activateSession ? quickTab : null;
    if (replaceQuickTab) setQuickTabs((current) => current.filter((id) => id !== replaceQuickTab));
    setTabOrder((current) => {
      const withoutActiveQuick = replaceQuickTab
        ? current.filter((key) => key !== `quick:${replaceQuickTab}`)
        : current;
      const sessionKey = `session:${session.sessionId}`;
      return withoutActiveQuick.includes(sessionKey) ? withoutActiveQuick : [...withoutActiveQuick, sessionKey];
    });
    setSessionMessages((current) => ({
      ...current,
      [session.sessionId]: session.message || "SSH 终端已连接",
    }));
    if (activateSession) {
      requestedServerId.current = null;
      setActiveSessionId(session.sessionId);
    }
    void loadServers();
  }, [loadServers, restoreOutput]);

  const openConnection = useCallback((server: Server, quickTab = activeSessionId === null ? activeQuickTabId : null) => {
    if (!sessionsRestored) return;
    setDropdownOpen(false);
    setSshServer(null);
    requestedServerId.current = server.id;
    if (quickTab !== null) setActiveServerId(server.id);
    if (openingServers.current.has(server.id)) return;
    openingServers.current.add(server.id);
    const cachedCredentials = sharedCredentials[server.id];
    // 即使前端启动恢复没有拿到状态，也先让 Rust 从系统凭据管理器尝试连接；
    // 只有确认缺少或失效凭据时才弹窗，避免重启后因 WebView 内存为空重复验证。
    void openTerminalSession(server, cachedCredentials ?? {}, quickTab).catch((error) => {
      if (requestedServerId.current !== server.id) return;
      if (needsSshCredentials(error)) {
        setSshServer(server);
      } else {
        requestedServerId.current = null;
        message.error(getErrorMessage(error));
      }
    }).finally(() => {
      openingServers.current.delete(server.id);
    });
  }, [activeQuickTabId, activeSessionId, openTerminalSession, sessionsRestored, setActiveServerId, sharedCredentials]);

  // 服务器资产页的“连接”动作会携带目标主机，进入终端后立即复用会话或打开验证框。
  useEffect(() => {
    if (!awaitingRouteTarget || !sessionsRestored || serverListResult?.key !== location.key || loading) return;
    setHandledRouteKey(location.key);
    const server = serverListResult.ok ? sshServers.find((item) => item.id === routeServerId) : undefined;
    const targetSessions = sessions
      .filter((session) => session.serverId === routeServerId)
      .map((session) => reconcileSessionStatus(session, observedStatuses.current.get(session.sessionId)));
    const endedIds = new Set(targetSessions
      .filter((session) => !canReuseSession(session.status))
      .map((session) => session.sessionId));
    if (endedIds.size > 0) {
      // 结束状态已由后端上报。清理本地标签和缓冲，并忽略该会话的迟到事件。
      for (const sessionId of endedIds) {
        discardedSessionIds.current.add(sessionId);
        outputBuffers.current.delete(sessionId);
        observedStatuses.current.delete(sessionId);
        lineBuffersRef.current.delete(sessionId);
      }
      const clearEntries = (current: Record<string, string>) => {
        const next = { ...current };
        for (const sessionId of endedIds) delete next[sessionId];
        return next;
      };
      setSessions((current) => current.filter((session) => !endedIds.has(session.sessionId)));
      setTabOrder((current) => current.filter((key) => !key.startsWith("session:") || !endedIds.has(key.slice("session:".length))));
      setTerminalOutputs(clearEntries);
      setSessionMessages(clearEntries);
    }
    const existingSession = server && targetSessions.find((session) => canReuseSession(session.status));
    if (existingSession) {
      showSession(existingSession);
      return;
    }
    const quickId = activeSessionId === null ? activeQuickTabId : quickTabs[0];
    if (quickId) showQuickTab(quickId);
    const targetQuickId = quickId ?? createQuickTab();
    if (server) openConnection(server, targetQuickId);
    else if (serverListResult.ok) message.error("找不到可用的 SSH 服务器");
  }, [
    activeQuickTabId, activeSessionId, awaitingRouteTarget, createQuickTab, loading, location.key,
    openConnection, quickTabs, routeServerId, serverListResult, sessions, sessionsRestored,
    showQuickTab, showSession, sshServers,
  ]);

  const handleCreateServer = async (
    payload: ServerPayload,
    credentials?: SshCredentials,
  ) => {
    try {
      const serverId = await serverApi.saveForm(null, payload, credentials);
      message.success("服务器已纳管");
      setCreateServerOpen(false);

      const nextServers = await loadServers();
      const savedServer = nextServers?.find((server) => server.id === serverId);
      if (savedServer) {
        await setSharedCredentials(savedServer.id, {});
      }
    } catch (error) {
      throw error;
    }
  };

  const handleVerified = async (
    _result: SshProbeResult,
    credentials: SshCredentials,
  ) => {
    if (!sshServer) return;
    const server = sshServer;
    await setSharedCredentials(server.id, credentials);
    if (requestedServerId.current !== server.id) return;
    setSshServer(null);
    const quickTab = activeSessionId === null ? activeQuickTabId : null;
    openingServers.current.add(server.id);
    try {
      await openTerminalSession(server, credentials, quickTab);
    } finally {
      openingServers.current.delete(server.id);
    }
  };

  const closeSession = (sessionId: string) => {
    discardedSessionIds.current.add(sessionId);
    outputBuffers.current.delete(sessionId);
    observedStatuses.current.delete(sessionId);
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
        showSession(next);
      } else if (quickTabs.length > 0) {
        showQuickTab(quickTabs[quickTabs.length - 1]);
      } else {
        const quickId = `quick-${nextQuickTabId.current++}`;
        setQuickTabs([quickId]);
        setTabOrder([`quick:${quickId}`]);
        showQuickTab(quickId);
      }
    }
    setTabOrder((current) => current.filter((key) => key !== `session:${sessionId}`));
  };

  const closeQuickTab = (quickId: string) => {
    const remainingQuickTabs = quickTabs.filter((id) => id !== quickId);
    setQuickTabs(remainingQuickTabs);
    setTabOrder((current) => current.filter((key) => key !== `quick:${quickId}`));
    if (activeSessionId !== null || activeQuickTabId !== quickId) return;

    const nextQuickId = remainingQuickTabs[0];
    if (nextQuickId) {
      showQuickTab(nextQuickId);
      return;
    }
    const nextSession = sessions[0];
    if (nextSession) {
      showSession(nextSession);
      return;
    }
    const fallbackId = `quick-${nextQuickTabId.current++}`;
    setQuickTabs([fallbackId]);
    showQuickTab(fallbackId);
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
      } else if (character === "\x03") {
        // 被 Ctrl+C 取消的半行不应混入下一条命令历史。
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
    if (execute) writeToSession(activeSession.sessionId, `${value}\r`);
    else window.dispatchEvent(new CustomEvent(TERMINAL_PASTE_EVENT, {
      detail: { sessionId: activeSession.sessionId, text: value },
    }));
  };

  // 会话和输出留在页面状态中，离开页面时卸载视图及其浮层，避免挡住其他模块。
  if (!active) return null;

  return (
    <div className="ops-terminal-page">
      <WorkspaceSidebarSlot>
        <TerminalSidebar
          servers={sshServers}
          sessions={sessions}
          activeSessionId={activeSessionId}
          loading={loading || !sessionsRestored}
          disabled={awaitingRouteTarget}
          onSelectSession={showSession}
          onOpenServer={openConnection}
        />
      </WorkspaceSidebarSlot>
      {awaitingRouteTarget && <div className="ops-terminal-route-loading" role="status">正在定位终端会话…</div>}
      <section className="ops-terminal-shell" hidden={awaitingRouteTarget}>
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
              disabled={!sessionsRestored}
              onClick={() => setDropdownOpen((current) => !current)}
            >
              <Plus size={14} />
              打开终端...
              <ChevronDown size={14} />
            </button>
            {dropdownOpen && (
              <div className="ops-terminal-dropdown">
                <div className="ops-terminal-dropdown-title">选择已有服务器连接</div>
                {sshServers.map((server) => (
                  <button key={server.id} type="button" onClick={() => openConnection(server)}>
                    <span className="flex min-w-0 items-center gap-2">
                      <Circle size={8} fill="var(--success)" color="var(--success)" />
                      <span className="truncate">{server.alias}</span>
                    </span>
                    <span>{server.hostname}</span>
                  </button>
                ))}
                {sshServers.length === 0 && <div className="ops-terminal-empty">暂无纳管 SSH 服务器</div>}
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
                    onClick={() => showQuickTab(id)}
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
              if (!session) return null;
              return (
                <button
                  key={tabKey}
                  type="button"
                  draggable
                  className={`ops-terminal-tab tab-draggable ${activeSessionId === session.sessionId ? "active" : ""} ${draggingTab === tabKey ? "dragging" : ""}`}
                  onClick={() => showSession(session)}
                  onDragStart={() => setDraggingTab(tabKey)}
                  onDragOver={(event) => reorderTab(tabKey, event)}
                  onDragEnd={() => setDraggingTab(null)}
                >
                  <Circle size={8} fill={session.status === "connected" ? "var(--success)" : "var(--danger)"} color={session.status === "connected" ? "var(--success)" : "var(--danger)"} />
                  <span>{server?.alias ?? `服务器 #${session.serverId}`}</span>
                  <X size={12} onClick={(event) => { event.stopPropagation(); closeSession(session.sessionId); }} />
                </button>
              );
            })}
            <button type="button" className="ops-terminal-new-tab" title="新建终端连接" disabled={!sessionsRestored} onClick={createQuickTab}>
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
            {awaitingRouteTarget ? null : activeSessionId === null ? (
              <QuickConnectView
                servers={filteredServers}
                sessions={sessions}
                loading={loading || !sessionsRestored}
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
                onInput={handleTerminalInput}
                onOpenTerminal={() => setDropdownOpen(true)}
                onResize={(sessionId, cols, rows) => {
                  void terminalApi.resize(sessionId, cols, rows);
                }}
                onFocus={(sessionId) => {
                  const session = sessions.find((item) => item.sessionId === sessionId);
                  if (session && !awaitingRouteTarget && session.sessionId !== activeSessionId) showSession(session);
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
              onFontSizeChange={(value: TerminalFontSize) => {
                const previous = useSettingsStore.getState().terminalFontSize;
                setTerminalFontSize(value);
                void configApi.set(SETTINGS_KEYS.terminalFontSize, String(value)).catch((error) => {
                  setTerminalFontSize(previous);
                  message.error(getErrorMessage(error));
                });
              }}
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
        open={sshServer !== null && !awaitingRouteTarget}
        server={sshServer}
        initialCredentials={sshServer ? sharedCredentials[sshServer.id] : undefined}
        onCancel={() => {
          requestedServerId.current = null;
          setSshServer(null);
        }}
        onVerified={handleVerified}
        onStatusChanged={() => {
          void loadServers();
        }}
      />

      <ServerFormModal
        allowRdp={false}
        open={createServerOpen && !awaitingRouteTarget}
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
  onFontSizeChange: (value: TerminalFontSize) => void;
  onOpenSftp: () => void;
}) {
  const terminalTheme = useSettingsStore((state) => state.terminalTheme);
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
              <Select className="w-full" value={fontSize} options={TERMINAL_FONT_SIZE_OPTIONS} onChange={(value) => onFontSizeChange(value as TerminalFontSize)} />
            </div>
            <div><span>颜色方案</span><strong>{({ "monokai-pro": "Monokai Pro", catppuccin: "Catppuccin", dracula: "Dracula", "matrix-green": "Matrix Green" })[terminalTheme]}</strong></div>
          </div>
        )}
        {tab === "history" && (
          commandHistory.length > 0
            ? [...commandHistory].reverse().map((item, index) => <button key={`${item}-${index}`} type="button" className="ops-terminal-history-item" onClick={() => onInsertCommand(item)}>{item}</button>)
            : <DrawerEmpty icon={<Clock3 size={18} />} text="暂无命令记录" />
        )}
        {tab === "snippets" && (
          <TerminalSnippets onInsert={onInsertCommand} />
        )}
      </div>
    </aside>
  );
}

function DrawerEmpty({ icon, text }: { icon: ReactNode; text: string }) {
  return <div className="ops-terminal-drawer-empty">{icon}<span>{text}</span></div>;
}
