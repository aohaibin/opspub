import React, { useMemo, useState } from "react";
import { Input, message } from "antd";
import { Search, RotateCw, Download, ChevronDown } from "lucide-react";
import { MOCK_APPS } from "../mockData";
import type { AppStoreItem } from "../types";

// =========================================================================
// 15 款应用高保真矢量品牌图标
// =========================================================================
export const APP_LOGOS: Record<string, React.ReactNode> = {
  docker: (
    <svg viewBox="0 0 24 24" className="w-7 h-7 shrink-0" fill="none">
      <path
        fill="#2496ED"
        d="M13.98 11.08h2.12c.1 0 .19-.08.19-.19V9.01c0-.1-.08-.19-.19-.19h-2.12a.19.19 0 00-.18.19v1.89c0 .1.08.18.18.18zm-2.95-5.43h2.12c.1 0 .18-.08.18-.19V3.57c0-.1-.08-.18-.18-.18h-2.12a.19.19 0 00-.19.18v1.89c0 .1.09.19.19.19zm0 2.71h2.12c.1 0 .18-.08.18-.18V6.29c0-.1-.08-.19-.18-.19h-2.12a.19.19 0 00-.19.19v1.88c0 .1.09.19.19.19zm-2.93 0h2.12c.1 0 .18-.08.18-.18V6.29c0-.1-.08-.19-.18-.19H8.1a.19.19 0 00-.18.19v1.88c0 .1.08.19.18.19zm-2.96 0h2.12c.1 0 .19-.08.19-.18V6.29c0-.1-.09-.19-.19-.19H5.15c-.1 0-.19.09-.19.19v1.88c0 .1.09.19.19.19zm5.89 2.72h2.12c.1 0 .18-.09.18-.19V9.01c0-.1-.08-.19-.18-.19h-2.12a.19.19 0 00-.19.19v1.89c0 .1.09.18.19.18zm-2.93 0h2.12c.1 0 .18-.09.18-.19V9.01c0-.1-.08-.19-.18-.19h-2.12a.19.19 0 00-.19.19v1.89c0 .1.09.18.19.18zm-2.96 0h2.12c.1 0 .19-.09.19-.19V9.01c0-.1-.09-.19-.19-.19H5.15c-.1 0-.19.09-.19.19v1.89c0 .1.09.18.19.18zm-2.93 0h2.12c.1 0 .19-.09.19-.19V9.01c0-.1-.09-.19-.19-.19H2.22c-.1 0-.19.09-.19.19v1.89c0 .1.09.18.19.18zm18.72 1.44a3.46 3.46 0 00-1.85-.52 3.52 3.52 0 00-.64.06 4.3 4.3 0 00-1.27-.95 4.42 4.42 0 00-1.87-.41c-.16 0-.32 0-.48.03V7.27c0-.1-.09-.19-.19-.19h-2.12a.19.19 0 00-.18.19v3.8c-.76.1-1.49.34-2.12.73H.19c-.1 0-.19.08-.19.19 0 3.23 1.56 5.76 4.07 7.02 1.7.85 3.74 1.07 5.76 1.07 6.16 0 10.74-4.04 11.23-10.15.08-.96-.48-1.57-1.12-2z"
      />
    </svg>
  ),
  openresty: (
    <svg viewBox="0 0 24 24" className="w-7 h-7 shrink-0" fill="none">
      <path
        d="M2.5 15.5C4 18 7.5 20.5 12 20.5c6 0 9.5-4 9.5-9 0-3-1.5-6-4.5-8.5-1-.8-2-1.5-3-1.8 1.5 2.5 2 5.5 1.2 8.3-.7 2.4-2.5 4.3-4.7 5-2.2.7-4.5.3-6.5-.8-.7-.4-1.2-.2-1.5.3z"
        fill="#13B13C"
      />
      <path
        d="M7 11c1.5 1.5 3.5 2.3 5.5 2 2-.3 3.8-1.5 4.8-3.2 1.2-2 1.5-4.5.8-6.8-1 1.5-2.5 2.7-4.2 3.3-2.1.8-4.5.5-6.2-.7-.4-.3-.8-.1-.9.4-.1.4.1.7.2 1z"
        fill="#00D26A"
      />
      <path
        d="M12.5 5.5c-.8.8-1.8 1.4-2.8 1.6-1.2.2-2.5-.2-3.4-1-.3-.3-.6-.2-.7.2-.1.3 0 .7.3.9 1.2 1 2.8 1.3 4.3 1 1.2-.3 2.3-1 3.1-2 .2-.2.1-.5-.1-.7-.2-.2-.5-.2-.7 0z"
        fill="#75F94C"
      />
    </svg>
  ),
  mysql: (
    <svg viewBox="0 0 24 24" className="w-7 h-7 shrink-0" fill="none">
      <path
        d="M21.7 13.5c-.5-.8-1.3-1.4-2.1-1.7-1.1-.4-2.3-.3-3.4-.1-1.5.3-3 .7-4.5.7-1.6 0-3.2-.3-4.7-.8-.7-.2-1.4-.6-2-.9-.4-.2-.8-.4-1.2-.4-.6 0-1.1.4-1.3 1-.3.8.1 1.7.9 2 1.3.5 2.7.8 4.1.9 1.8.1 3.6-.1 5.3-.5 1.4-.3 2.8-.7 4.2-.7.8 0 1.6.2 2.3.6.8.5 1.4 1.2 1.7 2.1.2.5.7.8 1.2.7.5-.1.9-.6.8-1.1-.1-.7-.3-1.4-.6-1.7z"
        fill="#00758F"
      />
      <path
        d="M17.8 7.3c-.6-.7-1.4-1.2-2.3-1.4-1-.2-2.1 0-3.1.5-1.7.8-3 2.2-4.1 3.8-.9 1.3-1.6 2.8-2.5 4.1-.4.6-.9 1.2-1.5 1.6-.4.3-.8.5-1.3.5-.3 0-.6-.1-.8-.3-.3-.3-.4-.7-.2-1.1.4-.9 1.1-1.7 1.8-2.4 1.2-1.2 2.6-2.2 4-3.1 1.6-1 3.3-1.7 5.1-1.9 1.2-.1 2.5.1 3.6.7.7.4 1.2 1 1.5 1.7.2.5 0 1-.4 1.3-.4.3-1 .2-1.3-.2-.2-.5-.5-.8-.9-1z"
        fill="#00618A"
      />
      <path
        d="M6.5 17c.5-.1 1.1-.3 1.5-.7.8-.8 1.2-1.9 1.8-2.9.8-1.4 1.8-2.7 3-3.7 1.1-.9 2.4-1.5 3.8-1.8.5-.1 1 0 1.4.3.4.3.6.8.5 1.3-.1.5-.5.9-1 .9-1.1.1-2.2.5-3.1 1.2-.9.7-1.6 1.7-2.3 2.7-.6 1-1.3 2-2.1 2.8-.6.6-1.4 1-2.3 1.1-.5.1-.9-.2-1.1-.6-.2-.5.1-1 .4-1.2z"
        fill="#F29111"
      />
      <circle cx="16.5" cy="8" r="0.8" fill="#FFFFFF" />
    </svg>
  ),
  redis: (
    <svg viewBox="0 0 24 24" className="w-7 h-7 shrink-0" fill="none">
      <path d="M12 2L2 6.5l10 4.5 10-4.5L12 2z" fill="#EF4444" />
      <path d="M2 8.5l10 4.5 10-4.5-1.5-.7-8.5 3.8-8.5-3.8L2 8.5z" fill="#DC2626" />
      <path d="M2 12l10 4.5 10-4.5-1.5-.7-8.5 3.8-8.5-3.8L2 12z" fill="#B91C1C" />
      <path d="M2 15.5l10 4.5 10-4.5-1.5-.7-8.5 3.8-8.5-3.8-1.5.7z" fill="#991B1B" />
      <ellipse cx="14" cy="6" rx="1.5" ry="0.8" fill="#FFFFFF" opacity="0.6" />
    </svg>
  ),
  postgresql: (
    <svg viewBox="0 0 24 24" className="w-7 h-7 shrink-0" fill="none">
      <path
        d="M18.8 6.2c-.8-1.6-2.2-2.8-4-3.4-2.2-.7-4.6-.3-6.4 1-1.5 1-2.5 2.6-3 4.3-.5 1.6-.4 3.4.2 5 .4 1.1 1.1 2 2 2.7.4.3.9.5 1.4.6v2.8c0 .5.3.9.8 1.1.5.2 1.1.1 1.5-.3l2-1.8c.8.2 1.6.3 2.4.2 1.8-.2 3.5-1.1 4.7-2.5 1.5-1.7 2.2-4 2-6.3-.1-1-.4-1.9-.9-2.7z"
        fill="#336791"
      />
      <path
        d="M8.5 10.5c.3-1.2.9-2.3 1.8-3.1 1.1-1 2.6-1.5 4.1-1.3 1 .1 2 .6 2.7 1.3.8.8 1.2 1.9 1.3 3 .1 1.3-.4 2.6-1.3 3.5-.9.9-2.1 1.4-3.4 1.4-.4 0-.8 0-1.2-.1l-1.8 1.6v-2.3c-.7-.6-1.3-1.4-1.6-2.3-.3-.5-.5-1.1-.6-1.7z"
        fill="#4B8BBE"
      />
      <path
        d="M7 11.5c-.8.5-1.4 1.3-1.7 2.2-.3 1-.2 2 .3 2.9.4.7 1 1.2 1.7 1.5.6.3 1.3.4 2 .3v-1.5c-.4 0-.8-.1-1.2-.3-.5-.2-.9-.6-1.1-1.1-.3-.6-.3-1.2-.1-1.8.2-.6.6-1.1 1.1-1.4L7 11.5z"
        fill="#FFFFFF"
      />
      <circle cx="14" cy="8.5" r="1" fill="#FFFFFF" />
      <circle cx="14.3" cy="8.5" r="0.5" fill="#1E293B" />
    </svg>
  ),
  mongodb: (
    <svg viewBox="0 0 24 24" className="w-7 h-7 shrink-0" fill="none">
      <path d="M12 1.5s-.3.3-.7.8C9.8 4.2 6.5 8.7 6.5 13c0 3.6 2.2 6.7 5.2 8.1.1.1.2.1.3.2V1.5z" fill="#13AA52" />
      <path d="M12 1.5s.3.3.7.8c1.5 1.9 4.8 6.4 4.8 10.7 0 3.6-2.2 6.7-5.2 8.1-.1.1-.2.1-.3.2V1.5z" fill="#116149" />
      <path
        d="M12 19.5c-.1 0-.2 0-.2-.1-.8-.4-1.8-1.5-1.8-3.4 0-1.8 1.1-3.6 2-4.8.1-.1.2-.1.3 0 .8 1.2 1.8 3 1.8 4.8 0 1.9-.9 3-1.8 3.4-.1.1-.2.1-.3.1z"
        fill="#FFEAA5"
        opacity="0.8"
      />
    </svg>
  ),
  clickhouse: (
    <svg viewBox="0 0 24 24" className="w-7 h-7 shrink-0" fill="none">
      <rect x="2" y="7" width="1.8" height="10" rx="0.9" fill="#FFCC01" />
      <rect x="4.5" y="4" width="1.8" height="16" rx="0.9" fill="#FFCC01" />
      <rect x="7" y="6" width="1.8" height="12" rx="0.9" fill="#FFCC01" />
      <rect x="9.5" y="2" width="1.8" height="20" rx="0.9" fill="#FA4D56" />
      <rect x="12" y="5" width="1.8" height="14" rx="0.9" fill="#FFCC01" />
      <rect x="14.5" y="8" width="1.8" height="8" rx="0.9" fill="#FFCC01" />
      <rect x="17" y="3" width="1.8" height="18" rx="0.9" fill="#FFCC01" />
      <rect x="19.5" y="7" width="1.8" height="10" rx="0.9" fill="#FFCC01" />
    </svg>
  ),
  wordpress: (
    <svg viewBox="0 0 24 24" className="w-7 h-7 shrink-0" fill="none">
      <circle cx="12" cy="12" r="10" fill="#21759B" />
      <path
        d="M12 3.2c4.8 0 8.8 4 8.8 8.8 0 1.8-.6 3.5-1.5 4.9L15.8 8.3c.3-.1.6-.2.8-.2.2 0 .4-.2.4-.4 0-.3-.4-.3-.7-.3l-2.4.1c-.2 0-.5.2-.5.4 0 .3.3.3.6.3.3 0 .6.1.7.2l2.3 6.6-3.3-9.8c.3-.1.5-.2.7-.2.2 0 .4-.2.4-.4 0-.3-.4-.3-.7-.3l-3.3.1c-.2 0-.5.2-.5.4 0 .3.3.3.6.3.3 0 .7.1.8.2L8 16.4l-2.6-7.3c.3 0 .6-.1.8-.2.2 0 .3-.2.3-.4 0-.3-.3-.3-.6-.3l-2.4.1c-.2 0-.5.2-.5.4 0 .3.3.3.5.3.3 0 .6.1.7.3l3.6 10.1C5.3 18.3 3.2 15.4 3.2 12c0-4.8 4-8.8 8.8-8.8zm-4.7 13.9l2.8-8.2 2.2 6.5-5 1.7zm6.7-.4l2-5.7 1.7 4.8c-.9.8-2.2 1.4-3.7.9z"
        fill="#FFFFFF"
      />
    </svg>
  ),
  halo: (
    <svg viewBox="0 0 24 24" className="w-7 h-7 shrink-0" fill="none">
      <path d="M5 4h3.5v6.5h7V4H19v16h-3.5v-6.5h-7V20H5V4z" fill="#0284C7" />
      <path d="M8.5 10.5h7v3h-7v-3z" fill="#38BDF8" />
    </svg>
  ),
  gitea: (
    <svg viewBox="0 0 24 24" className="w-7 h-7 shrink-0" fill="none">
      <path d="M4 8h13c0 4.5-2.5 9-6.5 9S4 12.5 4 8z" fill="#609926" />
      <path d="M17 9.5c1.8 0 3 1.2 3 2.8s-1.2 2.7-3 2.7v-1.5c1 0 1.5-.5 1.5-1.2s-.5-1.3-1.5-1.3V9.5z" fill="#609926" />
      <path d="M10 5c-.5 1-1.5 1.5-2 2h4c-.5-.5-1.5-1-2-2z" fill="#87C440" />
      <path d="M8 8v3l2-1 2 1V8H8z" fill="#FFFFFF" opacity="0.8" />
    </svg>
  ),
  jenkins: (
    <svg viewBox="0 0 24 24" className="w-7 h-7 shrink-0" fill="none">
      <circle cx="12" cy="12" r="10" fill="#1E293B" />
      <path d="M7 6c1-2 4-3 6.5-2.5 2.5.5 4.5 2.5 4.5 4.5H7V6z" fill="#334155" />
      <ellipse cx="12" cy="12" rx="4.5" ry="4" fill="#FCD34D" />
      <path d="M10 11.5c.5-.2 1-.2 1.5 0M13.5 11.5c.5-.2 1-.2 1.5 0" stroke="#78350F" strokeWidth="0.8" strokeLinecap="round" />
      <circle cx="10.8" cy="12.5" r="0.6" fill="#78350F" />
      <circle cx="14.2" cy="12.5" r="0.6" fill="#78350F" />
      <path d="M10 14.5c1 .8 3 .8 4 0" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M9.5 17.5l2.5 1.5-2.5 1.5v-3zM14.5 17.5L12 19l2.5 1.5v-3z" fill="#DC2626" />
      <circle cx="12" cy="19" r="0.7" fill="#B91C1C" />
    </svg>
  ),
  grafana: (
    <svg viewBox="0 0 24 24" className="w-7 h-7 shrink-0" fill="none">
      <path
        d="M12 2C9.5 5 7 7.5 7 11.5c0 2.8 1.8 5.2 4.2 6.1-.4-.9-.6-2-.3-3 .5-1.8 2.1-3 2.6-4.8.4 1.5 1.2 2.6 2.5 3.3.8.5 1.5 1.3 1.8 2.2.8-1.2 1.2-2.5 1.2-3.8C19 6.5 15.5 4 12 2z"
        fill="#F46800"
      />
      <path
        d="M12 13.5c-1 0-1.8.8-1.8 1.8 0 1.2 1 2.2 2.2 2.2s2.2-1 2.2-2.2c0-.5-.2-1-.5-1.3-.4.8-1.2 1.3-2.1 1.3-.8 0-1.5-.7-1.5-1.5 0-.5.2-.9.5-1.2-.5.3-1 .5-1.5.5z"
        fill="#FFB020"
      />
      <circle cx="12" cy="19.5" r="1.5" fill="#FA8C16" />
    </svg>
  ),
  uptime_kuma: (
    <svg viewBox="0 0 24 24" className="w-7 h-7 shrink-0" fill="none">
      <circle cx="12" cy="12" r="9" stroke="#3BD671" strokeWidth="3" fill="none" />
      <circle cx="12" cy="12" r="4.5" fill="#3BD671" />
    </svg>
  ),
  ollama: (
    <svg viewBox="0 0 24 24" className="w-7 h-7 shrink-0" fill="none">
      <path d="M8 3.5c0-.8.7-1.5 1.5-1.5S11 2.7 11 3.5V6h-3V3.5zM13 3.5c0-.8.7-1.5 1.5-1.5s1.5.7 1.5 1.5V6h-3V3.5z" fill="#E2E8F0" />
      <path
        d="M7 6h10c1.1 0 2 .9 2 2v6c0 1.7-1.3 3-3 3h-1v4c0 .6-.4 1-1 1h-1c-.6 0-1-.4-1-1v-4h-2v4c0 .6-.4 1-1 1H8c-.6 0-1-.4-1-1v-4H6c-1.7 0-3-1.3-3-3V8c0-1.1.9-2 2-2h2z"
        fill="#FFFFFF"
      />
      <circle cx="9.5" cy="9.5" r="1" fill="#0F172A" />
      <circle cx="14.5" cy="9.5" r="1" fill="#0F172A" />
      <ellipse cx="12" cy="12" rx="1.5" ry="1" fill="#CBD5E1" />
    </svg>
  ),
  open_webui: (
    <svg viewBox="0 0 24 24" className="w-7 h-7 shrink-0" fill="none">
      <circle cx="12" cy="12" r="9" stroke="#10A37F" strokeWidth="2.5" fill="none" />
      <circle cx="12" cy="12" r="4" fill="#10A37F" />
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" stroke="#10A37F" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
};

const CATEGORIES = [
  { key: "all", label: "全部" },
  { key: "basic", label: "基础" },
  { key: "web", label: "Web" },
  { key: "db", label: "数据库" },
  { key: "site", label: "建站" },
  { key: "dev", label: "开发工具" },
  { key: "monitor", label: "监控" },
  { key: "ai", label: "AI" },
  { key: "storage", label: "存储" },
  { key: "mq", label: "消息队列" },
];

export const AppStoreView: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<"all" | "installed" | "upgradable">("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [searchKeyword, setSearchKeyword] = useState("");

  const filteredApps = useMemo(() => {
    return MOCK_APPS.filter((app: AppStoreItem) => {
      if (currentTab === "installed" && app.status !== "installed" && app.status !== "external") return false;
      if (currentTab === "upgradable" && app.status !== "installed") return false;
      if (filterCategory !== "all" && app.category !== filterCategory) return false;
      if (searchKeyword) {
        const kw = searchKeyword.toLowerCase();
        return app.name.toLowerCase().includes(kw) || app.desc.toLowerCase().includes(kw);
      }
      return true;
    });
  }, [currentTab, filterCategory, searchKeyword]);

  const handleAction = (app: AppStoreItem) => {
    if (app.btnType === "reinstall") {
      message.loading({ content: `正在重新配置并部署 ${app.name}...`, key: app.id, duration: 1.5 });
      setTimeout(() => {
        message.success({ content: `${app.name} 重装就绪`, key: app.id });
      }, 1500);
    } else if (app.btnType === "install") {
      message.loading({ content: `正在拉取镜像并部署 ${app.name}...`, key: app.id, duration: 1.8 });
      setTimeout(() => {
        message.success({ content: `${app.name} 安装成功并已启动`, key: app.id });
      }, 1800);
    }
  };

  return (
    <div className="space-y-4 pb-12 select-none">
      {/* 顶部工具栏：Tab 过滤 + 搜索 + 刷新 */}
      <div className="flex flex-col space-y-3 pb-2 border-b border-slate-800/80">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* 一级过滤 Tabs */}
          <div className="flex items-center space-x-1 p-0.5 rounded-lg bg-surface-950 border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setCurrentTab("all")}
              className={`px-3 py-1 rounded transition cursor-pointer ${
                currentTab === "all" ? "font-medium bg-surface-800 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              全部
            </button>
            <button
              type="button"
              onClick={() => setCurrentTab("installed")}
              className={`px-3 py-1 rounded transition cursor-pointer ${
                currentTab === "installed" ? "font-medium bg-surface-800 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              已安装 (10)
            </button>
            <button
              type="button"
              onClick={() => setCurrentTab("upgradable")}
              className={`px-3 py-1 rounded transition cursor-pointer ${
                currentTab === "upgradable" ? "font-medium bg-surface-800 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              可升级
            </button>
          </div>

          {/* 搜索与刷新状态 */}
          <div className="flex items-center space-x-2">
            <Input
              prefix={<Search size={14} className="text-slate-400" />}
              placeholder="搜索应用..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-56 bg-surface-900 border-slate-700/80 text-xs rounded-lg text-slate-200 placeholder:text-slate-500"
              allowClear
            />
            <button
              type="button"
              onClick={() => message.success("已更新应用商店最新包状态")}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-surface-900 hover:bg-surface-800 text-slate-300 hover:text-white border border-slate-700/80 text-xs transition cursor-pointer"
            >
              <RotateCw size={13} />
              <span>刷新状态</span>
            </button>
          </div>
        </div>

        {/* 二级分类 Pills */}
        <div className="flex flex-wrap gap-1.5 text-xs select-none">
          {CATEGORIES.map((cat) => {
            const isActive = filterCategory === cat.key;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => setFilterCategory(cat.key)}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer text-xs ${
                  isActive
                    ? "bg-teal-500/20 text-teal-300 border border-teal-500/40 font-medium shadow-sm"
                    : "bg-surface-900 text-slate-400 hover:text-slate-200 hover:border-slate-700 border border-slate-800"
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3 列应用卡片网格 (15 个应用组件) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {filteredApps.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-500 text-xs">没有找到符合条件的应用组件</div>
        ) : (
          filteredApps.map((app) => {
            const logo = APP_LOGOS[app.id] || (
              <div className="w-7 h-7 rounded-lg bg-surface-800 border border-slate-700/80 flex items-center justify-center text-teal-400 font-bold shrink-0">
                {app.name.charAt(0)}
              </div>
            );

            return (
              <div
                key={app.id}
                className="p-3.5 rounded-xl border border-slate-800/90 bg-surface-900/60 flex flex-col justify-between space-y-3 hover:border-slate-700 transition"
                style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
              >
                {/* 头部：品牌 Logo + 应用名 + 状态徽标 */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-7 h-7 flex items-center justify-center shrink-0">{logo}</div>
                      <div>
                        <div className="flex items-center space-x-1.5">
                          <h4 className="text-xs font-bold text-white tracking-wide">{app.name}</h4>
                          {app.status === "installed" && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              已安装
                            </span>
                          )}
                          {app.status === "external" && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700/80">
                              外部已装
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2" title={app.desc}>
                    {app.desc}
                  </p>
                </div>

                {/* 底部：版本下拉 + 端口 + 操作按钮 */}
                <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2">
                    {app.versions && app.versions.length > 0 ? (
                      <div className="flex items-center space-x-1 text-slate-400 text-xs">
                        <span>版本</span>
                        <div className="relative inline-flex items-center">
                          <select
                            style={{
                              backgroundColor: "var(--bg-primary, #090d16)",
                              color: "var(--text-primary, #f1f5f9)",
                              borderColor: "rgba(148, 163, 184, 0.28)",
                            }}
                            className="border rounded px-2 py-0.5 pr-5 text-[11px] appearance-none focus:outline-none focus:border-teal-500 cursor-pointer"
                          >
                            {app.versions.map((v) => (
                              <option key={v} value={v} style={{ backgroundColor: "#0b0f19", color: "#f1f5f9" }}>
                                {v}
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={12} className="text-slate-400 absolute right-1 pointer-events-none" />
                        </div>
                      </div>
                    ) : app.version && app.id !== "docker" ? (
                      <div className="text-[11px] text-slate-400 flex items-center space-x-1">
                        <span>版本</span>
                        <span
                          style={{
                            backgroundColor: "var(--bg-primary, #090d16)",
                            borderColor: "rgba(148, 163, 184, 0.25)",
                            color: "var(--text-secondary, #cbd5e1)",
                          }}
                          className="border rounded px-1.5 py-0.5 text-[11px] font-mono"
                        >
                          {app.version}
                        </span>
                      </div>
                    ) : null}

                    {app.port && app.port !== "—" && (
                      <div className="flex items-center space-x-1 text-slate-400 text-xs">
                        <span>端口</span>
                        <span
                          style={{
                            backgroundColor: "var(--bg-primary, #090d16)",
                            borderColor: "rgba(148, 163, 184, 0.25)",
                            color: "var(--text-secondary, #cbd5e1)",
                          }}
                          className="border rounded px-1.5 py-0.5 text-[11px] font-mono"
                        >
                          {app.port}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* 操作按钮 */}
                  {app.btnType === "reinstall" ? (
                    <button
                      type="button"
                      onClick={() => handleAction(app)}
                      style={{
                        backgroundColor: "var(--bg-tertiary, #1e293b)",
                        borderColor: "rgba(148, 163, 184, 0.3)",
                        color: "var(--text-primary, #e2e8f0)",
                      }}
                      className="flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs border transition cursor-pointer shadow-sm hover:border-teal-500/60"
                    >
                      <RotateCw size={12} />
                      <span>重装</span>
                    </button>
                  ) : app.btnType === "external" ? (
                    <button
                      type="button"
                      style={{
                        backgroundColor: "rgba(15, 23, 42, 0.6)",
                        borderColor: "rgba(148, 163, 184, 0.2)",
                        color: "#94a3b8",
                      }}
                      className="px-3.5 py-1 rounded-lg text-xs border cursor-not-allowed"
                    >
                      外部已装
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleAction(app)}
                      className="flex items-center space-x-1.5 px-3.5 py-1 rounded-lg bg-teal-500 hover:bg-teal-600 text-white text-xs font-semibold transition cursor-pointer shadow-sm border border-teal-400/40 hover:shadow-[0_0_10px_rgba(20,184,166,0.35)]"
                    >
                      <Download size={12} />
                      <span>安装</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
