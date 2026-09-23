import React from "react";
import { Button, Select, Switch, Tooltip, message } from "antd";
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Bell,
  Activity,
} from "lucide-react";
import type { Server } from "@/types";
import type { WorkbenchViewKey } from "../types";

const VIEW_LABEL_MAP: Record<WorkbenchViewKey, string> = {
  overview: "概览",
  appstore: "应用商店",
  website: "网站",
  database: "数据库",
  containers: "容器",
  file: "文件",
  backup: "数据备份",
  cron: "计划任务",
  system: "系统",
  terminal: "终端",
  logs: "日志",
  workspace: "工作区",
  settings: "设置",
};

interface WorkbenchHeaderProps {
  currentView: WorkbenchViewKey;
  servers: Server[];
  selectedServerId: number | null;
  onSelectServer: (id: number) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onHistoryBack: () => void;
  onHistoryForward: () => void;
  bgMonitor: boolean;
  onToggleBgMonitor: (checked: boolean) => void;
  connected: boolean;
  onConnect: () => void;
}

export const WorkbenchHeader: React.FC<WorkbenchHeaderProps> = ({
  currentView,
  servers,
  selectedServerId,
  onSelectServer,
  canGoBack,
  canGoForward,
  onHistoryBack,
  onHistoryForward,
  bgMonitor,
  onToggleBgMonitor,
  connected,
  onConnect,
}) => {
  return (
    <div
      className="shrink-0 flex items-center justify-between px-4 py-2 border-b select-none transition-colors"
      style={{
        borderColor: "var(--border)",
        background: "var(--bg-secondary)",
      }}
    >
      {/* 左侧：前进后退 + 面包屑 + 服务器切换下拉 + 状态 */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-1">
          <Tooltip title="后退">
            <Button
              type="text"
              size="small"
              disabled={!canGoBack}
              icon={<ChevronLeft size={14} />}
              onClick={onHistoryBack}
            />
          </Tooltip>
          <Tooltip title="前进">
            <Button
              type="text"
              size="small"
              disabled={!canGoForward}
              icon={<ChevronRight size={14} />}
              onClick={onHistoryForward}
            />
          </Tooltip>
        </div>

        {/* 面包屑 */}
        <div className="flex items-center space-x-1.5 text-xs">
          <span className="p-1 rounded bg-teal-500/15 text-teal-400">
            <LayoutGrid size={14} />
          </span>
          <span style={{ color: "var(--text-secondary)" }}>工作台</span>
          <span style={{ color: "var(--text-muted)" }}>/</span>
          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
            {VIEW_LABEL_MAP[currentView] ?? "概览"}
          </span>
        </div>

        {/* 服务器切换下拉选择 */}
        <div className="ml-2">
          <Select
            value={selectedServerId ?? undefined}
            onChange={(val) => onSelectServer(val)}
            placeholder="选择服务器..."
            size="small"
            style={{ width: 230 }}
            options={servers.map((s) => ({
              label: (
                <div className="flex items-center justify-between gap-1 text-xs">
                  <span className="truncate font-medium">{s.alias}</span>
                  <span
                    className="text-[10px] opacity-70"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {s.hostname}:{s.port}
                  </span>
                </div>
              ),
              value: s.id,
            }))}
          />
        </div>

        {/* 在线与延迟标志 */}
        <div className={`flex items-center space-x-2 text-[11px] font-mono ${connected ? "text-teal-400" : "text-slate-400"}`}>
          <Button size="small" type="link" onClick={onConnect} className="!px-0 !text-[11px]">
            {connected ? "重连" : "连接"}
          </Button>
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-teal-400 shadow-[0_0_6px_rgba(45,212,191,0.8)] animate-pulse" : "bg-slate-500"}`} />
          <span>在线 445ms</span>
        </div>
      </div>

      {/* 右侧：后台监控开关与告警链接 */}
      <div className="flex items-center space-x-4 text-xs">
        <div className="flex items-center space-x-2" style={{ color: "var(--text-secondary)" }}>
          <Activity size={14} className="text-teal-400" />
          <span>后台监控</span>
          <Switch
            size="small"
            checked={bgMonitor}
            onChange={onToggleBgMonitor}
          />
        </div>

        <button
          type="button"
          onClick={() => message.info("已打开告警规则配置中心")}
          className="flex items-center space-x-1 transition cursor-pointer hover:underline"
          style={{ color: "var(--text-secondary)" }}
        >
          <Bell size={13} />
          <span>去配置告警规则</span>
        </button>
      </div>
    </div>
  );
};
