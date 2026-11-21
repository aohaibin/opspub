import { Button, Select, Switch, Tooltip } from "antd";
import { Activity, ArrowLeft, ArrowRight, Bell, LayoutGrid } from "lucide-react";
import { Link } from "react-router-dom";
import { modulePath } from "@/navigation/modules";
import type { Server } from "@/types";
import type { WorkbenchViewKey } from "@/pages/workbench/types";

const VIEW_LABELS: Record<WorkbenchViewKey, string> = {
  overview: "概览",
  appstore: "应用商店",
  website: "网站",
  database: "数据库",
  containers: "容器",
  file: "文件",
  backup: "数据备份",
  cron: "计划任务",
  system: "系统服务",
  processes: "实时进程",
  ports: "网络端口",
  firewall: "防火墙",
  terminal: "终端",
  logs: "日志",
  workspace: "工作区",
  settings: "设置",
};

interface WorkbenchHeaderProps {
  currentView: WorkbenchViewKey;
  servers: Server[];
  server: Server | null;
  loading: boolean;
  onSelectServer: (id: number) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onHistoryBack: () => void;
  onHistoryForward: () => void;
  autoRefresh: boolean;
  onToggleAutoRefresh: (checked: boolean) => void;
  onConnect: () => void;
}

export function WorkbenchHeader({
  currentView,
  servers,
  server,
  loading,
  onSelectServer,
  canGoBack,
  canGoForward,
  onHistoryBack,
  onHistoryForward,
  autoRefresh,
  onToggleAutoRefresh,
  onConnect,
}: WorkbenchHeaderProps) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[var(--border)] bg-[var(--surface-950)] px-4 py-2 text-[var(--text-secondary)]">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex gap-0.5">
          <Tooltip title="工作台后退">
            <Button type="text" size="small" aria-label="工作台后退" disabled={!canGoBack} icon={<ArrowLeft size={15} />} onClick={onHistoryBack} />
          </Tooltip>
          <Tooltip title="工作台前进">
            <Button type="text" size="small" aria-label="工作台前进" disabled={!canGoForward} icon={<ArrowRight size={15} />} onClick={onHistoryForward} />
          </Tooltip>
        </div>
        <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
          <span className="rounded bg-[var(--nav-active-bg)] p-1 text-[var(--nav-active-text)]"><LayoutGrid size={14} aria-hidden /></span>
          <span>工作台</span>
          <span aria-hidden>/</span>
          <span className="font-semibold text-[var(--text-primary)]">{VIEW_LABELS[currentView]}</span>
        </div>
        <Select<number>
          aria-label="工作台目标服务器"
          value={server?.id}
          onChange={onSelectServer}
          placeholder="选择服务器"
          size="small"
          className="w-56"
          loading={loading}
          showSearch={{ optionFilterProp: "label" }}
          options={servers.map(({ id, alias, hostname, port }) => ({
            value: id,
            label: `${alias} · ${hostname}:${port}`,
          }))}
        />
        <Button size="small" type="link" disabled={!server} onClick={onConnect}>
          验证 SSH
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <div className="flex items-center gap-1.5">
          <Activity size={14} aria-hidden />
          <span>概览自动刷新</span>
          <Switch aria-label="概览自动刷新" size="small" checked={autoRefresh} onChange={onToggleAutoRefresh} />
        </div>
        <Link to={modulePath("alerts")} className="flex items-center gap-1.5 hover:text-[var(--text-primary)] hover:underline">
          <Bell size={14} aria-hidden />
          <span>告警中心</span>
        </Link>
      </div>
    </div>
  );
}
