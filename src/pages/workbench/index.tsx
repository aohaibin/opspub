import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Spin, message } from "antd";
import { useLocation } from "react-router-dom";
import { getErrorMessage } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";
import { workbenchApi } from "@/lib/api/workbench";
import { SshConnectModal } from "@/components/server/SshConnectModal";
import { useAppStore } from "@/store/app";
import { useSshSessionStore } from "@/store/ssh";
import type { Server, SshCredentials, SshProbeResult } from "@/types";
import type { WorkbenchViewKey } from "./types";
import { WorkbenchHeader } from "./components/WorkbenchHeader";
import { WorkbenchSidebar } from "./components/WorkbenchSidebar";
import { OverviewView } from "./views/OverviewView";
import { AppStorePrototypeView as AppStoreView } from "./views/AppStorePrototypeView";
import { WebsiteView } from "./views/WebsiteView";
import { DatabaseView } from "./views/DatabaseView";
import { ContainersView } from "./views/ContainersView";
import { FileView } from "./views/FileView";
import { BackupView } from "./views/BackupView";
import { CronView } from "./views/CronView";
import { SystemView } from "./views/SystemView";
import { TerminalView } from "./views/TerminalView";
import { LogsView } from "./views/LogsView";
import { WorkspaceView } from "./views/WorkspaceView";
import { SettingsView } from "./views/SettingsView";
import { WorkbenchRuntimeContext } from "./context";

export default function WorkbenchPage() {
  const location = useLocation();
  const routeServerId =
    (location.state as { serverId?: number } | null)?.serverId ?? null;
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // 导航历史状态管理
  const [history, setHistory] = useState<WorkbenchViewKey[]>(["overview"]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const currentView = history[historyIndex] ?? "overview";

  // 侧边栏折叠与后台监控开关
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [bgMonitor, setBgMonitor] = useState(true);
  const [sshServer, setSshServer] = useState<Server | null>(null);
  const credentialsByServer = useSshSessionStore((state) => state.credentialsByServer);
  const setCredentials = useSshSessionStore((state) => state.setCredentials);
  const [pendingCommand, setPendingCommand] = useState<{
    command: string;
    resolve: (result: Awaited<ReturnType<typeof workbenchApi.execute>>) => void;
    reject: (error: unknown) => void;
  } | null>(null);

  const setActiveServerId = useAppStore((s) => s.setActiveServerId);

  const loadServers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await serverApi.list();
      setServers(data);
      setSelectedId((current) => {
        if (routeServerId !== null && data.some((server) => server.id === routeServerId)) {
          return routeServerId;
        }
        if (current !== null && data.some((server) => server.id === current)) {
          return current;
        }
        const fromSession = useAppStore.getState().activeServerId;
        if (fromSession !== null && data.some((server) => server.id === fromSession)) {
          return fromSession;
        }
        return data[0]?.id ?? null;
      });
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [routeServerId]);

  const selectServer = useCallback(
    (id: number) => {
      setSelectedId(id);
      setActiveServerId(id);
    },
    [setActiveServerId]
  );

  useEffect(() => {
    void loadServers();
  }, [loadServers]);

  const selectedServer = useMemo(
    () => servers.find((server) => server.id === selectedId) ?? null,
    [servers, selectedId]
  );

  const openConnection = useCallback(() => {
    if (!selectedServer) {
      message.warning("请先选择服务器");
      return;
    }
    if (credentialsByServer[selectedServer.id]) {
      message.success("已使用服务器凭证连接");
      return;
    }
    setSshServer(selectedServer);
  }, [credentialsByServer, selectedServer]);

  // 服务器资产页明确点击工作台时，进入后立即使用目标服务器；没有凭证才弹验证框。
  const autoConnectedServerRef = useRef<number | null>(null);
  useEffect(() => {
    if (
      routeServerId === null ||
      loading ||
      !selectedServer ||
      selectedServer.id !== routeServerId ||
      sshServer !== null ||
      autoConnectedServerRef.current === routeServerId
    ) {
      return;
    }

    autoConnectedServerRef.current = routeServerId;
    if (!credentialsByServer[routeServerId]) {
      setSshServer(selectedServer);
    }
  }, [credentialsByServer, loading, routeServerId, selectedServer, sshServer]);

  const executeCommand = useCallback(
    async (server: Server, credentials: SshCredentials, command: string) => {
      return workbenchApi.execute({
        serverId: server.id,
        command,
        password: credentials.password,
        privateKeyPath: credentials.privateKeyPath,
        passphrase: credentials.passphrase,
      });
    },
    [],
  );

  const runCommand = useCallback(
    (command: string) => {
      if (!selectedServer) {
        return Promise.reject(new Error("请先选择服务器"));
      }
      const credentials = credentialsByServer[selectedServer.id];
      if (credentials) {
        return executeCommand(selectedServer, credentials, command);
      }
      setSshServer(selectedServer);
      return new Promise<Awaited<ReturnType<typeof workbenchApi.execute>>>((resolve, reject) => {
        setPendingCommand({ command, resolve, reject });
      });
    },
    [credentialsByServer, executeCommand, selectedServer],
  );

  const runtime = useMemo(
    () => ({
      server: selectedServer,
      connected: Boolean(selectedServer && credentialsByServer[selectedServer.id]),
      openConnection,
      runCommand,
    }),
    [credentialsByServer, openConnection, runCommand, selectedServer],
  );

  // 导航跳转动作
  const navigateTo = useCallback(
    (view: WorkbenchViewKey) => {
      if (view === currentView) return;
      const nextHistory = history.slice(0, historyIndex + 1);
      nextHistory.push(view);
      setHistory(nextHistory);
      setHistoryIndex(nextHistory.length - 1);
    },
    [currentView, history, historyIndex]
  );

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;

  const handleHistoryBack = useCallback(() => {
    if (canGoBack) {
      setHistoryIndex((idx) => idx - 1);
    }
  }, [canGoBack]);

  const handleHistoryForward = useCallback(() => {
    if (canGoForward) {
      setHistoryIndex((idx) => idx + 1);
    }
  }, [canGoForward]);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* 1. 顶栏控制器 */}
        <WorkbenchHeader
        currentView={currentView}
        servers={servers}
        selectedServerId={selectedId}
        onSelectServer={selectServer}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onHistoryBack={handleHistoryBack}
        onHistoryForward={handleHistoryForward}
        bgMonitor={bgMonitor}
        onToggleBgMonitor={setBgMonitor}
        connected={runtime.connected}
        onConnect={openConnection}
      />

      {/* 2. 工作台主体结构：左侧二级侧边栏 + 右侧主内容视口 */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* 左侧机器面板 */}
        <WorkbenchSidebar
          currentView={currentView}
          onSelectView={navigateTo}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* 右侧主内容视口 (可独立纵向滚动) */}
        <main
          className="flex-1 min-w-0 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar p-4"
          style={{
            background: "var(--bg-primary)",
          }}
        >
          <WorkbenchRuntimeContext.Provider value={runtime}>
          <Spin spinning={loading && servers.length === 0}>
            {currentView === "overview" && <OverviewView server={selectedServer} />}
            {currentView === "appstore" && <AppStoreView />}
            {currentView === "website" && <WebsiteView />}
            {currentView === "database" && <DatabaseView />}
            {currentView === "containers" && <ContainersView />}
            {currentView === "file" && <FileView />}
            {currentView === "backup" && <BackupView />}
            {currentView === "cron" && <CronView />}
            {currentView === "system" && <SystemView />}
            {currentView === "terminal" && <TerminalView server={selectedServer} />}
            {currentView === "logs" && <LogsView />}
            {currentView === "workspace" && <WorkspaceView />}
            {currentView === "settings" && <SettingsView server={selectedServer} />}
          </Spin>
          </WorkbenchRuntimeContext.Provider>
        </main>
      </div>

      <SshConnectModal
        open={sshServer !== null}
        server={sshServer}
        initialCredentials={sshServer ? credentialsByServer[sshServer.id] : undefined}
        onCancel={() => {
          setSshServer(null);
          if (pendingCommand) {
            pendingCommand.reject(new Error("已取消 SSH 验证"));
            setPendingCommand(null);
          }
        }}
        onVerified={async (_result: SshProbeResult, credentials: SshCredentials) => {
          if (!sshServer) return;
          const server = sshServer;
          await setCredentials(server.id, credentials);
          setSshServer(null);
          if (pendingCommand) {
            try {
              const result = await executeCommand(server, credentials, pendingCommand.command);
              pendingCommand.resolve(result);
            } catch (error) {
              pendingCommand.reject(error);
            } finally {
              setPendingCommand(null);
            }
          }
          await loadServers();
        }}
        onStatusChanged={loadServers}
      />
    </div>
  );
}
