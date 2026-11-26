import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Empty, Spin } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import { create } from "zustand";
import { WorkspaceSidebarSlot } from "@/components/layout/WorkspaceNavigation";
import { SshConnectModal } from "@/components/server/SshConnectModal";
import { getErrorMessage } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";
import { workbenchApi, type WorkbenchCommandResult } from "@/lib/api/workbench";
import { useAppStore } from "@/store/app";
import { useSshSessionStore } from "@/store/ssh";
import type { Server, SshCredentials } from "@/types";
import type { WorkbenchViewKey } from "@/pages/workbench/types";
import { WorkbenchHeader } from "@/pages/workbench/components/WorkbenchHeader";
import { WorkbenchSidebar, WorkbenchWorkspaceNavigation } from "@/pages/workbench/components/WorkbenchSidebar";
import { OverviewView } from "@/pages/workbench/views/OverviewView";
import { AppStorePrototypeView as AppStoreView } from "@/pages/workbench/views/AppStorePrototypeView";
import { WebsiteView } from "@/pages/workbench/views/WebsiteView";
import { DatabaseView } from "@/pages/workbench/views/DatabaseView";
import { ContainersView } from "@/pages/workbench/views/ContainersView";
import { FileView } from "@/pages/workbench/views/FileView";
import { BackupView } from "@/pages/workbench/views/BackupView";
import { CronView } from "@/pages/workbench/views/CronView";
import { SystemView } from "@/pages/workbench/views/SystemView";
import { TerminalView } from "@/pages/workbench/views/TerminalView";
import { LogsView } from "@/pages/workbench/views/LogsView";
import { WorkspaceView } from "@/pages/workbench/views/WorkspaceView";
import { SettingsView } from "@/pages/workbench/views/SettingsView";
import { WorkbenchRuntimeContext } from "@/pages/workbench/context";

const useWorkbenchSelection = create<{ serverId: number | null; autoRefresh: boolean }>()(() => ({
  serverId: null,
  autoRefresh: true,
}));

interface WorkbenchScope {
  serverId: number | null;
  view: WorkbenchViewKey;
}

interface ConnectionRequest {
  scope: WorkbenchScope;
  server: Server;
  pending?: {
    command: string;
    resolve: (result: WorkbenchCommandResult) => void;
    reject: (error: unknown) => void;
  };
}

/** 仅在 Rust 确认是 SSH 凭据问题时弹出验证窗口。 */
function needsSshCredentials(error: unknown): boolean {
  const errorMessage = getErrorMessage(error).toLowerCase();
  if (!errorMessage.includes("ssh")) return false;

  return [
    "password",
    "credential",
    "fingerprint",
    "host key",
    "authenticate",
    "auth",
    "凭据",
    "密码",
    "指纹",
    "认证",
    "公钥",
  ].some((hint) => errorMessage.includes(hint));
}

function connectionStatus(server: Server | null, latency: number | undefined) {
  switch (server?.last_connection_status) {
    case "verified": return latency === undefined ? "SSH 已验证" : `SSH 已验证 · ${latency} ms`;
    case "failed": return "上次 SSH 验证失败";
    case "host_key_changed": return "SSH 主机指纹已变更";
    default: return "SSH 未验证";
  }
}

function executeCommand(serverId: number, command: string, credentials: SshCredentials = {}) {
  const { password, privateKeyPath, passphrase } = credentials;
  return workbenchApi.execute({ serverId, command, password, privateKeyPath, passphrase });
}

export default function WorkbenchPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const routeState = location.state as { serverId?: number } | null;
  const routeServerId = routeState?.serverId;
  const [entrySelection] = useState(() => ({
    rememberedId: useWorkbenchSelection.getState().serverId,
    sharedId: useAppStore.getState().activeServerId,
  }));
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const requestNumber = useRef(0);

  const [history, setHistory] = useState<{ views: WorkbenchViewKey[]; index: number }>({ views: ["overview"], index: 0 });
  const currentView = history.views[history.index];
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const autoRefresh = useWorkbenchSelection((state) => state.autoRefresh);

  const [connection, setConnection] = useState<ConnectionRequest | null>(null);
  const pendingConnection = useRef<ConnectionRequest | null>(null);
  const [probeLatency, setProbeLatency] = useState<Record<number, number>>({});
  const credentialsByServer = useSshSessionStore((state) => state.credentialsByServer);
  const setCredentials = useSshSessionStore((state) => state.setCredentials);

  const loadServers = useCallback(async () => {
    const request = ++requestNumber.current;
    setLoading(true);
    setListError(null);
    try {
      const data = await serverApi.list();
      if (request === requestNumber.current) setServers(data.filter((server) => server.protocol !== "rdp"));
    } catch (error) {
      if (request === requestNumber.current) setListError(getErrorMessage(error));
    } finally {
      if (request === requestNumber.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadServers();
    return () => { requestNumber.current += 1; };
  }, [loadServers]);

  // 显式直达和工作台上次选择优先。目标已失效时留空，避免对第一台主机发出操作。
  const requestedId = routeServerId ?? entrySelection.rememberedId;
  const selectedServer = requestedId != null
    ? servers.find(({ id }) => id === requestedId) ?? null
    : servers.find(({ id }) => id === entrySelection.sharedId) ?? servers[0] ?? null;
  const selectedId = selectedServer?.id ?? null;
  const status = connectionStatus(selectedServer, selectedId === null ? undefined : probeLatency[selectedId]);

  useLayoutEffect(() => {
    if (selectedId === null) return;
    useWorkbenchSelection.setState({ serverId: selectedId });
    useAppStore.getState().setActiveServerId(selectedId);
  }, [selectedId]);

  const selectServer = useCallback((id: number) => {
    // 替换当前历史项的目标，使浏览器前进/后退也能恢复这一项最终选中的主机。
    void navigate(location.pathname + location.search + location.hash, {
      replace: true,
      state: { ...routeState, serverId: id },
    });
  }, [location.hash, location.pathname, location.search, navigate, routeState]);

  useEffect(() => {
    if (routeServerId == null && selectedId !== null) selectServer(selectedId);
  }, [routeServerId, selectServer, selectedId]);

  const scope = useMemo<WorkbenchScope>(() => ({ serverId: selectedId, view: currentView }), [selectedId, currentView]);
  const activeScope = useRef<WorkbenchScope | null>(null);
  useLayoutEffect(() => {
    activeScope.current = scope;
    return () => {
      activeScope.current = null;
      const request = pendingConnection.current;
      pendingConnection.current = null;
      request?.pending?.reject(new Error("已退出当前工作台工具，SSH 验证已取消"));
    };
  }, [scope]);

  const openConnection = useCallback(() => {
    if (!selectedServer || activeScope.current !== scope || pendingConnection.current) return;
    const request = { scope, server: selectedServer };
    pendingConnection.current = request;
    setConnection(request);
  }, [scope, selectedServer]);

  const runCommand = useCallback(async (command: string) => {
    if (!selectedServer || activeScope.current !== scope) throw new Error("当前工作台工具没有可用的服务器目标");
    // 从会话 Store 读取托管标记。真实 SSH 凭据由 Rust 从系统凭据管理器读取。
    try {
      return await executeCommand(selectedServer.id, command, useSshSessionStore.getState().getCredentials(selectedServer.id));
    } catch (error) {
      if (activeScope.current !== scope || !needsSshCredentials(error) || pendingConnection.current) throw error;
      return new Promise<WorkbenchCommandResult>((resolve, reject) => {
        const request = { scope, server: selectedServer, pending: { command, resolve, reject } };
        pendingConnection.current = request;
        setConnection(request);
      });
    }
  }, [scope, selectedServer]);

  const connected = selectedId !== null && Boolean(credentialsByServer[selectedId]);
  const runtime = useMemo(() => ({
    server: selectedServer,
    connected,
    openConnection,
    runCommand,
  }), [connected, openConnection, runCommand, selectedServer]);

  const navigateTo = (view: WorkbenchViewKey) => {
    setHistory((current) => current.views[current.index] === view ? current : {
      views: [...current.views.slice(0, current.index + 1), view],
      index: current.index + 1,
    });
  };
  const go = (delta: number) => setHistory((current) => ({
    ...current,
    index: Math.min(current.views.length - 1, Math.max(0, current.index + delta)),
  }));

  const activeConnection = connection?.scope === scope ? connection : null;

  return (
    <div className="ops-workbench-page flex h-full w-full flex-col overflow-hidden">
      <WorkspaceSidebarSlot>
        <WorkbenchWorkspaceNavigation server={selectedServer} status={status} currentView={currentView} onSelectView={navigateTo} />
      </WorkspaceSidebarSlot>

      <WorkbenchHeader
        currentView={currentView}
        servers={servers}
        server={selectedServer}
        loading={loading}
        onSelectServer={selectServer}
        canGoBack={history.index > 0}
        canGoForward={history.index < history.views.length - 1}
        onHistoryBack={() => go(-1)}
        onHistoryForward={() => go(1)}
        autoRefresh={autoRefresh}
        onToggleAutoRefresh={(checked) => useWorkbenchSelection.setState({ autoRefresh: checked })}
        onConnect={openConnection}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <WorkbenchSidebar
          currentView={currentView}
          onSelectView={navigateTo}
          disabled={!selectedServer}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((value) => !value)}
        />
        {/* 换机或换工具时重建内容，防止上一台机器的列表、趋势和输入显示在新目标下。 */}
        <section
          key={`${selectedId ?? "none"}:${currentView}`}
          aria-label="工作台内容"
          className="custom-scrollbar min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain bg-[var(--surface-950)] p-4"
        >
          {listError && <Alert className="mb-3" type="error" showIcon message="服务器列表加载失败" description={listError} action={<Button size="small" onClick={() => void loadServers()}>重试</Button>} />}
          {selectedServer ? (
            <WorkbenchRuntimeContext.Provider value={runtime}>
              {currentView === "overview" && <OverviewView server={selectedServer} autoRefresh={autoRefresh} onOpenWebsites={() => navigateTo("website")} />}
              {currentView === "appstore" && <AppStoreView />}
              {currentView === "website" && <WebsiteView />}
              {currentView === "database" && <DatabaseView hostScoped />}
              {currentView === "containers" && <ContainersView />}
              {currentView === "file" && <FileView />}
              {currentView === "backup" && <BackupView />}
              {currentView === "cron" && <CronView />}
              {(currentView === "system" || currentView === "processes" || currentView === "ports" || currentView === "firewall") && (
                <SystemView tab={currentView} onSelectTab={navigateTo} />
              )}
              {currentView === "terminal" && <TerminalView server={selectedServer} />}
              {currentView === "logs" && <LogsView />}
              {currentView === "workspace" && <WorkspaceView />}
              {currentView === "settings" && <SettingsView server={selectedServer} />}
            </WorkbenchRuntimeContext.Provider>
          ) : loading ? (
            <div className="grid min-h-64 place-items-center"><Spin /></div>
          ) : !listError && (
            <Empty
              className="py-16"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={requestedId != null ? "目标服务器已移除或不支持 SSH，请选择其他服务器" : "暂无可用的 SSH 服务器"}
            />
          )}
        </section>
      </div>

      <SshConnectModal
        open={activeConnection !== null}
        server={activeConnection?.server ?? null}
        initialCredentials={activeConnection ? credentialsByServer[activeConnection.server.id] : undefined}
        onCancel={() => {
          if (pendingConnection.current !== activeConnection) return;
          pendingConnection.current = null;
          activeConnection?.pending?.reject(new Error("已取消 SSH 验证"));
          setConnection(null);
        }}
        onVerified={async (result, credentials) => {
          if (!activeConnection || pendingConnection.current !== activeConnection) return;
          const { server, pending } = activeConnection;
          await setCredentials(server.id, credentials);
          if (pendingConnection.current !== activeConnection) return;
          pendingConnection.current = null;
          setConnection(null);
          setProbeLatency((current) => ({ ...current, [server.id]: result.latency_ms }));
          if (pending) {
            try {
              pending.resolve(await executeCommand(server.id, pending.command, credentials));
            } catch (error) {
              pending.reject(error);
            }
          }
          if (activeScope.current === activeConnection.scope) await loadServers();
        }}
        onStatusChanged={() => {
          if (activeScope.current === activeConnection?.scope) return loadServers();
        }}
      />
    </div>
  );
}
