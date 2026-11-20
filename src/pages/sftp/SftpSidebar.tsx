import { Progress } from "antd";
import { FileUp, Folder, Plus, Server } from "lucide-react";
import { isTransferActive, useSftpTransferStore } from "@/store/sftp-transfers";
import type { SftpSessionTab } from "./types";
import type { SftpPane } from "./workspace-state";

const remotePaths = ["/opt/ops-stacks", "/var/log/nginx", "/etc/nginx/conf.d", "/root"];
const sectionClass = "space-y-1 border-t border-[var(--border)] pt-2";
const headingClass = "px-2 text-[11px] font-semibold text-[var(--text-secondary)]";
const itemClass = "flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-[var(--surface-800)] disabled:cursor-not-allowed disabled:opacity-50";

interface SftpSidebarProps {
  sessions: SftpSessionTab[];
  activeTab: SftpSessionTab | null;
  pane: SftpPane;
  split: boolean;
  ready: boolean;
  onSelectSession: (id: string) => void;
  onChooseServer: () => void;
  onOpenPath: (path: string) => void;
}

export function SftpSidebar({ sessions, activeTab, pane, split, ready, onSelectSession, onChooseServer, onOpenPath }: SftpSidebarProps) {
  const tasks = useSftpTransferStore((state) => state.tasks);
  const showTransfers = useSftpTransferStore((state) => state.setDisplay);
  const activeTasks = tasks.filter((task) => isTransferActive(task.status));
  const latest = activeTasks[0] ?? tasks[tasks.length - 1];
  const percent = latest?.status === "completed" ? 100 : latest?.total
    ? Math.min(100, Math.floor(latest.loaded / latest.total * 100))
    : 0;

  return (
    <section aria-label="SFTP 导航" className="space-y-3 px-1 pt-1 text-[var(--text-primary)]">
      <div className={sectionClass}>
        <h3 className={headingClass}>{split ? (pane === "left" ? "左窗格连接" : "右窗格连接") : "SFTP 连接"}</h3>
        <button type="button" className={itemClass} disabled={!ready} onClick={onChooseServer}>
          <Plus size={14} aria-hidden className="shrink-0" />
          选择服务器
        </button>
        {sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            title={session.serverName}
            aria-pressed={session.id === activeTab?.id}
            className={`${itemClass} aria-pressed:bg-[var(--surface-800)] aria-pressed:text-[var(--accent)]`}
            onClick={() => onSelectSession(session.id)}
          >
            <Server size={14} aria-hidden className="shrink-0" />
            <span className="truncate">{session.serverName}</span>
          </button>
        ))}
      </div>
      <div className={sectionClass}>
        <h3 className={headingClass}>远程路径书签</h3>
        {remotePaths.map((path) => (
          <button
            key={path}
            type="button"
            title={path}
            aria-pressed={activeTab?.serverId != null && activeTab.currentPath === path}
            disabled={activeTab?.serverId == null}
            className={`${itemClass} font-mono aria-pressed:text-[var(--accent)]`}
            onClick={() => onOpenPath(path)}
          >
            <Folder size={14} aria-hidden className="shrink-0 text-[var(--accent)]" />
            <span className="truncate">{path}</span>
          </button>
        ))}
      </div>
      <div className={sectionClass}>
        <h3 className={headingClass}>传输队列状态</h3>
        <button type="button" className={itemClass} disabled={!latest} onClick={() => showTransfers("expanded")}>
          <FileUp size={14} aria-hidden className="shrink-0" />
          {latest ? `查看传输 · ${activeTasks.length} 项进行中` : "暂无上传任务"}
        </button>
        {latest && (
          <div className="space-y-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs">
            <div className="truncate" title={latest.name}>{latest.name}</div>
            <Progress
              percent={percent}
              size="small"
              status={latest.status === "failed" ? "exception" : latest.status === "completed" ? "success" : "normal"}
            />
            {latest.status === "cancelled" && <span className="text-[var(--text-secondary)]">已取消</span>}
          </div>
        )}
      </div>
    </section>
  );
}
