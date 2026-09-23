import React from "react";
import { Tooltip } from "antd";
import {
  LayoutDashboard,
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
import type { WorkbenchViewKey } from "../types";

interface WorkbenchSidebarProps {
  currentView: WorkbenchViewKey;
  onSelectView: (view: WorkbenchViewKey) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const WorkbenchSidebar: React.FC<WorkbenchSidebarProps> = ({
  currentView,
  onSelectView,
  collapsed,
  onToggleCollapse,
}) => {
  const renderItem = (
    key: WorkbenchViewKey,
    label: string,
    IconComponent: React.ComponentType<{ size?: number; className?: string }>,
    badge?: number | string
  ) => {
    const isActive = currentView === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => onSelectView(key)}
        className={`w-full flex items-center ${
          collapsed ? "justify-center px-1" : "justify-between px-2.5"
        } py-1.5 rounded-lg text-xs font-medium transition cursor-pointer select-none`}
        style={{
          background: isActive ? "rgba(20, 184, 166, 0.15)" : "transparent",
          color: isActive ? "#2dd4bf" : "var(--text-secondary)",
          border: isActive
            ? "1px solid rgba(20, 184, 166, 0.3)"
            : "1px solid transparent",
          boxShadow: isActive ? "0 0 10px rgba(20,184,166,0.12)" : undefined,
        }}
        title={collapsed ? label : undefined}
      >
        <div className="flex items-center space-x-2.5">
          <IconComponent
            size={15}
            className={isActive ? "text-teal-400" : "text-slate-400 shrink-0"}
          />
          {!collapsed && <span>{label}</span>}
        </div>
        {!collapsed && badge !== undefined && (
          <span
            className="px-1.5 py-0.2 rounded-full text-[10px] font-mono"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
            }}
          >
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside
      className={`shrink-0 flex flex-col border-r select-none py-2 px-2 overflow-y-auto custom-scrollbar transition-all duration-200`}
      style={{
        width: collapsed ? 56 : 176,
        borderColor: "var(--border)",
        background: "var(--bg-secondary)",
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
          {renderItem("appstore", "应用商店", ShoppingBag, 1)}
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
