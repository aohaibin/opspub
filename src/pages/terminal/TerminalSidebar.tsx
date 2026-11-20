import { Select } from "antd";
import type { Server, TerminalSessionInfo } from "@/types";

interface TerminalSidebarProps {
  servers: Server[];
  sessions: TerminalSessionInfo[];
  activeSessionId: string | null;
  loading: boolean;
  disabled: boolean;
  onOpenServer: (server: Server) => void;
  onSelectSession: (session: TerminalSessionInfo) => void;
}

const STATUS_LABELS = {
  connected: "已连接",
  connecting: "连接中",
  closing: "正在关闭",
  closed: "已断开",
  error: "异常中断",
};

export function TerminalSidebar({
  servers,
  sessions,
  activeSessionId,
  loading,
  disabled,
  onOpenServer,
  onSelectSession,
}: TerminalSidebarProps) {
  const connectedCount = sessions.filter((session) => session.status === "connected").length;

  return (
    <section className="ops-terminal-sidebar" aria-label="远程终端会话">
      <div className="ops-terminal-sidebar-picker">
        <Select<number>
          aria-label="选择服务器打开终端"
          value={null}
          placeholder={loading ? "正在加载终端…" : servers.length ? "打开终端…" : "暂无纳管 SSH 服务器"}
          disabled={disabled || loading || servers.length === 0}
          showSearch={{ optionFilterProp: "label" }}
          options={servers.map((server) => ({
            value: server.id,
            label: `${server.alias} · ${server.hostname}:${server.port}`,
          }))}
          // 下拉保留在二级栏内，收起侧栏时与其他二级栏控件一起失去交互。
          getPopupContainer={(trigger) => trigger.parentElement ?? trigger}
          onSelect={(serverId) => {
            const server = servers.find((item) => item.id === serverId);
            if (server) onOpenServer(server);
          }}
        />
      </div>

      <div className="ops-terminal-sidebar-heading">
        <h3>终端会话</h3>
        <span>{connectedCount} 个活跃</span>
      </div>
      {sessions.length === 0 && !loading && <p className="ops-terminal-sidebar-empty">暂无终端会话</p>}
      {sessions.map((session) => {
        const alias = servers.find((server) => server.id === session.serverId)?.alias ?? `服务器 #${session.serverId}`;
        const status = STATUS_LABELS[session.status];
        return (
          <button
            key={session.sessionId}
            type="button"
            className="ops-terminal-sidebar-session"
            aria-pressed={session.sessionId === activeSessionId}
            disabled={disabled}
            title={`${alias} · ${status}`}
            onClick={() => onSelectSession(session)}
          >
            <span className="ops-terminal-sidebar-dot" data-status={session.status} aria-hidden />
            <span className="ops-terminal-sidebar-alias">{alias}</span>
            <span className="ops-terminal-sidebar-status">
              {session.status === "connected" ? <><span className="sr-only">{status} · </span>SSH</> : status}
            </span>
          </button>
        );
      })}
    </section>
  );
}
