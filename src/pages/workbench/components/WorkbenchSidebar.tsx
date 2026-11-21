import React from "react";
import { Tooltip } from "antd";
import {
  LayoutDashboard,
  Activity,
  Radio,
  ShoppingBag,
  Globe,
  Database,
  Container,
  Folder,
  Archive,
  Clock,
  Cpu,
  Terminal,
  FileText,
  Briefcase,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import type { Server } from "@/types";
import type { WorkbenchViewKey } from "@/pages/workbench/types";

const shortcuts = [
  { view: "overview", label: "系统状态总览", icon: Activity },
  { view: "processes", label: "实时进程管理器", icon: Cpu },
  { view: "ports", label: "网络监听端口", icon: Radio },
  { view: "system", label: "Systemd 服务控制", icon: Settings },
  { view: "containers", label: "Docker 容器", icon: Container },
] as const;

export function WorkbenchWorkspaceNavigation({
  server,
  status,
  currentView,
  onSelectView,
}: {
  server: Server | null;
  status: string;
  currentView: WorkbenchViewKey;
  onSelectView: (view: WorkbenchViewKey) => void;
}) {
  return (
    <section aria-label="工作台导航" className="space-y-3 px-2 pt-1">
      <div className="space-y-1.5 border-t border-[var(--border)] pt-2">
        <h3 className="px-1.5 text-[11px] font-semibold text-[var(--text-secondary)]">当前监控目标</h3>
        <div className="space-y-1 rounded-xl border border-[var(--nav-active-border)] bg-[var(--nav-active-bg)] px-2.5 py-2 text-[var(--nav-active-text)]">
          <div className="truncate text-xs font-semibold" title={server?.alias}>{server?.alias ?? "未选择服务器"}</div>
          {server && (
            <>
              <div className="truncate font-mono text-[11px]" title={`${server.hostname}:${server.port}`}>{server.hostname}:{server.port}</div>
              <div className="text-[11px] text-[var(--text-secondary)]">{status}</div>
            </>
          )}
        </div>
      </div>
      <nav aria-label="工作台模块导航" className="space-y-0.5 border-t border-[var(--border)] pt-2">
        <h3 className="px-1.5 pb-1 text-[11px] font-semibold text-[var(--text-secondary)]">工作台模块导航</h3>
        {shortcuts.map(({ view, label, icon: Icon }) => (
          <button
            key={view}
            type="button"
            aria-current={currentView === view ? "true" : undefined}
            disabled={!server}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-800)] aria-current:bg-[var(--surface-800)] aria-current:text-[var(--nav-active-text)] disabled:opacity-50"
            onClick={() => onSelectView(view)}
          >
            <Icon size={14} className="shrink-0" aria-hidden />
            {label}
          </button>
        ))}
      </nav>
    </section>
  );
}

interface WorkbenchSidebarProps {
  currentView: WorkbenchViewKey;
  onSelectView: (view: WorkbenchViewKey) => void;
  disabled: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const WorkbenchSidebar: React.FC<WorkbenchSidebarProps> = ({
  currentView,
  onSelectView,
  disabled,
  collapsed,
  onToggleCollapse,
}) => {
  const renderItem = (
    key: WorkbenchViewKey,
    label: string,
    IconComponent: React.ComponentType<{ size?: number; className?: string }>,
  ) => {
    const isActive = currentView === key ||
      (key === "system" && (currentView === "processes" || currentView === "ports" || currentView === "firewall"));
    return (
      <button
        key={key}
        type="button"
        aria-current={isActive ? "true" : undefined}
        aria-label={collapsed ? label : undefined}
        disabled={disabled}
        onClick={() => onSelectView(key)}
        className={`w-full flex items-center ${
          collapsed ? "justify-center px-1" : "justify-between px-2.5"
        } py-1.5 rounded-lg text-xs font-medium transition cursor-pointer select-none hover:bg-[var(--surface-800)] disabled:cursor-not-allowed disabled:opacity-50`}
        style={{
          backgroundColor: isActive ? "var(--nav-active-bg)" : undefined,
          color: isActive ? "var(--nav-active-text)" : "var(--text-secondary)",
          border: `1px solid ${isActive ? "var(--nav-active-border)" : "transparent"}`,
        }}
        title={collapsed ? label : undefined}
      >
        <div className="flex items-center space-x-2.5">
          <IconComponent
            size={15}
            className="shrink-0"
          />
          {!collapsed && <span>{label}</span>}
        </div>
      </button>
    );
  };

  return (
    <aside
      aria-label="机器面板"
      className={`shrink-0 flex flex-col border-r select-none py-2 px-2 overflow-y-auto custom-scrollbar transition-all duration-200`}
      style={{
        width: collapsed ? 56 : 176,
        borderColor: "var(--border)",
        background: "var(--surface-950)",
      }}
    >
      {/* 侧边栏标题与折叠开关 */}
      <div
        className={`flex items-center ${
          collapsed ? "justify-center" : "justify-between px-2"
        } py-1 text-xs font-medium mb-1`}
        style={{ color: "var(--text-muted)" }}
      >
        {!collapsed && <span>机器面板</span>}
        <Tooltip title={collapsed ? "展开面板" : "折叠面板"}>
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-label={collapsed ? "展开面板" : "折叠面板"}
            onClick={onToggleCollapse}
            className="p-1 rounded transition hover:text-white"
            style={{ color: "var(--text-muted)" }}
          >
            {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </button>
        </Tooltip>
      </div>

      <div className="space-y-3 mt-1 text-xs">
        {/* 概览置顶 */}
        <div>{renderItem("overview", "概览", LayoutDashboard)}</div>

        {/* 业务 */}
        <div className="space-y-0.5">
          {!collapsed && (
            <div
              className="px-2 pb-0.5 text-[10px] font-semibold tracking-wider uppercase"
              style={{ color: "var(--text-muted)" }}
            >
              业务
            </div>
          )}
          {renderItem("appstore", "应用商店", ShoppingBag)}
          {renderItem("website", "网站", Globe)}
          {renderItem("database", "数据库", Database)}
          {renderItem("containers", "容器", Container)}
        </div>

        {/* 数据 */}
        <div className="space-y-0.5">
          {!collapsed && (
            <div
              className="px-2 pb-0.5 text-[10px] font-semibold tracking-wider uppercase"
              style={{ color: "var(--text-muted)" }}
            >
              数据
            </div>
          )}
          {renderItem("file", "文件", Folder)}
          {renderItem("backup", "数据备份", Archive)}
        </div>

        {/* 运维 */}
        <div className="space-y-0.5">
          {!collapsed && (
            <div
              className="px-2 pb-0.5 text-[10px] font-semibold tracking-wider uppercase"
              style={{ color: "var(--text-muted)" }}
            >
              运维
            </div>
          )}
          {renderItem("cron", "计划任务", Clock)}
          {renderItem("system", "系统", Cpu)}
          {renderItem("terminal", "终端", Terminal)}
          {renderItem("logs", "日志", FileText)}
        </div>

        {/* 其他 */}
        <div className="space-y-0.5">
          {!collapsed && (
            <div
              className="px-2 pb-0.5 text-[10px] font-semibold tracking-wider uppercase"
              style={{ color: "var(--text-muted)" }}
            >
              其他
            </div>
          )}
          {renderItem("workspace", "工作区", Briefcase)}
          {renderItem("settings", "设置", Settings)}
        </div>
      </div>
    </aside>
  );
};
