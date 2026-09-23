import React, { useCallback, useMemo, useState } from "react";
import { Input, message } from "antd";
import {
  CheckCircle2,
  ChevronDown,
  Download,
  RotateCw,
  Search,
  SearchX,
} from "lucide-react";
import { getErrorMessage } from "@/lib/api/client";
import { useWorkbenchRuntime } from "../context";
import { MOCK_APPS } from "../mockData";
import type { AppStoreItem } from "../types";
import { APP_LOGOS } from "./AppStoreView";

const CATEGORIES = [
  ["all", "全部"],
  ["basic", "基础"],
  ["web", "Web"],
  ["db", "数据库"],
  ["site", "建站"],
  ["dev", "开发工具"],
  ["monitor", "监控"],
  ["ai", "AI"],
  ["storage", "存储"],
  ["mq", "消息队列"],
] as const;

const APP_COPY: Record<string, string> = {
  docker: "容器运行时，为其他数据服务提供统一的部署基础。",
  openresty: "高性能 Web 服务器与反向代理，支持 Nginx 与 Lua 扩展。",
  mysql: "稳定易用的关系型数据库，支持 Docker 部署与远程访问。",
  redis: "高性能内存键值数据库，适合缓存、队列和会话存储。",
  postgresql: "功能完整的开源关系型数据库，支持事务与丰富扩展。",
  mongodb: "面向文档的 NoSQL 数据库，适合灵活的数据模型。",
  clickhouse: "面向分析场景的列式数据库，适合海量数据查询。",
  wordpress: "开箱即用的网站与博客 CMS，支持一键部署。",
  halo: "现代化开源博客与建站系统，适合快速搭建内容站点。",
  gitea: "轻量级自托管 Git 服务，支持仓库、组织和协作管理。",
  jenkins: "成熟的 CI/CD 自动化服务，支持流水线与构建任务。",
  grafana: "可视化监控套件，集中展示 Grafana 与 Prometheus 指标。",
  uptime_kuma: "轻量级网站与服务可用性监控，支持多种通知方式。",
  ollama: "本地大模型运行时，支持常见开源模型与 API 调用。",
  open_webui: "兼容 Ollama 与 OpenAI API 的大模型对话前端。",
};

const statusLabel = (status: AppStoreItem["status"]) => {
  if (status === "installed") return "已安装";
  if (status === "external") return "外部已装";
  return "";
};

export const AppStorePrototypeView: React.FC = () => {
  const runtime = useWorkbenchRuntime();
  const [currentTab, setCurrentTab] = useState<"all" | "installed" | "upgradable">("all");
  const [category, setCategory] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [versions, setVersions] = useState<Record<string, string>>({});

  const installedCount = MOCK_APPS.filter((app) => app.status !== "available").length;
  const filteredApps = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    return MOCK_APPS.filter((app) => {
      if (currentTab === "installed" && app.status === "available") return false;
      if (currentTab === "upgradable" && app.status !== "installed") return false;
      if (category !== "all" && app.category !== category) return false;
      if (!normalized) return true;
      const desc = APP_COPY[app.id] ?? app.desc;
      return `${app.name} ${desc}`.toLowerCase().includes(normalized);
    });
  }, [category, currentTab, keyword]);

  const probeDocker = useCallback(async () => {
    const result = await runtime.runCommand("command -v docker >/dev/null 2>&1 && docker info --format '{{.ServerVersion}}'");
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || "远程服务器上的 Docker 不可用");
    }
    return result.stdout.trim();
  }, [runtime]);

  const refreshStatus = useCallback(async () => {
    if (!runtime.server) {
      message.warning("请先在顶部选择服务器");
      return;
    }
    setRefreshing(true);
    try {
      const version = await probeDocker();
      message.success(`已刷新 ${runtime.server.alias} 状态 · Docker ${version || "已就绪"}`);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setRefreshing(false);
    }
  }, [probeDocker, runtime.server]);

  const handleAction = useCallback(async (app: AppStoreItem) => {
    if (app.btnType === "external") return;
    if (!runtime.server) {
      message.warning("请先在顶部选择服务器");
      return;
    }
    setBusyId(app.id);
    try {
      const dockerVersion = await probeDocker();
      const version = versions[app.id] ?? app.versions?.[0] ?? app.version ?? "最新版";
      message.info(
        `${app.name} 已确认 Docker ${dockerVersion || "可用"}。版本 ${version} 的端口和凭据仍需确认，请在终端执行部署。`,
        5,
      );
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  }, [probeDocker, runtime.server, versions]);

  return (
    <section className="ops-appstore-page space-y-4 pb-8 select-none">
      <div className="flex flex-col gap-3 border-b pb-3" style={{ borderColor: "var(--border)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            className="flex items-center gap-1 rounded-lg border p-0.5 text-xs"
            style={{ background: "var(--surface-950)", borderColor: "var(--border)" }}
          >
            {([
              ["all", "全部"],
              ["installed", `已安装 (${installedCount})`],
              ["upgradable", "可升级"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setCurrentTab(key)}
                className="rounded px-3 py-1 transition"
                style={currentTab === key
                  ? { background: "var(--bg-tertiary)", color: "var(--text-primary)", boxShadow: "var(--shadow-sm)" }
                  : { color: "var(--text-secondary)" }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Input
              prefix={<Search size={14} style={{ color: "var(--text-muted)" }} />}
              placeholder="搜索应用..."
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              allowClear
              className="w-full text-xs sm:w-56"
              style={{ background: "var(--surface-900)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            />
            <button
              type="button"
              onClick={() => void refreshStatus()}
              disabled={refreshing}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition disabled:cursor-wait disabled:opacity-70"
              style={{ background: "var(--surface-900)", borderColor: "var(--border)", color: "var(--text-secondary)" }}
            >
              <RotateCw size={13} className={refreshing ? "animate-spin" : ""} />
              <span>{refreshing ? "检查中" : "刷新状态"}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 text-xs">
          {CATEGORIES.map(([key, label]) => {
            const active = category === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(key)}
                className="rounded-md border px-2.5 py-1 transition"
                style={active
                  ? { background: "var(--nav-active-bg)", borderColor: "var(--nav-active-border)", color: "var(--nav-active-text)", fontWeight: 600 }
                  : { background: "var(--surface-900)", borderColor: "var(--border)", color: "var(--text-secondary)" }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
        {filteredApps.length === 0 ? (
          <div className="col-span-full flex flex-col items-center gap-2 py-16 text-xs" style={{ color: "var(--text-muted)" }}>
            <SearchX size={28} strokeWidth={1.5} />
            <span>没有找到符合条件的应用</span>
          </div>
        ) : filteredApps.map((app) => {
          const desc = APP_COPY[app.id] ?? app.desc;
          const selectedVersion = versions[app.id] ?? app.versions?.[0];
          const busy = busyId === app.id;
          const showPort = app.id !== "docker" && Boolean(app.port) && !app.port?.includes("鈥") && app.port !== "—";
          return (
            <article
              key={app.id}
              className="flex min-h-[184px] flex-col justify-between gap-3.5 rounded-xl border p-3.5 transition hover:-translate-y-0.5"
              style={{ background: "var(--glass-card-bg)", borderColor: "var(--border)", boxShadow: "var(--shadow-sm)" }}
            >
              <div className="space-y-2">
                <div className="flex items-start gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center">{APP_LOGOS[app.id] ?? <span>{app.name[0]}</span>}</div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h4 className="text-xs font-bold tracking-wide" style={{ color: "var(--text-primary)" }}>{app.name}</h4>
                      {statusLabel(app.status) && (
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px]"
                          style={app.status === "installed"
                            ? { background: "color-mix(in srgb, var(--success) 15%, transparent)", border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)", color: "var(--success)" }
                            : { background: "var(--bg-tertiary)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
                        >
                          {statusLabel(app.status)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <p className="line-clamp-2 text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }} title={desc}>{desc}</p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs" style={{ borderColor: "var(--border)" }}>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {app.versions?.length ? (
                    <label className="flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
                      <span>版本</span>
                      <span className="relative inline-flex">
                        <select
                          value={selectedVersion}
                          onChange={(event) => setVersions((current) => ({ ...current, [app.id]: event.target.value }))}
                          className="appearance-none rounded border py-0.5 pl-2 pr-5 text-[11px] outline-none"
                          style={{ background: "var(--surface-950)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                        >
                          {app.versions.map((version) => <option key={version} value={version}>{version}</option>)}
                        </select>
                        <ChevronDown size={12} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
                      </span>
                    </label>
                  ) : app.version ? (
                    <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                      <span>版本</span><code className="rounded border px-1.5 py-0.5" style={{ background: "var(--surface-950)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>{app.version}</code>
                    </span>
                  ) : null}
                  {showPort && (
                    <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                      <span>端口</span><code className="rounded border px-1.5 py-0.5" style={{ background: "var(--surface-950)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>{app.port}</code>
                    </span>
                  )}
                </div>

                {app.btnType === "external" ? (
                  <button type="button" disabled className="flex cursor-not-allowed items-center gap-1.5 rounded-lg border px-3.5 py-1 text-xs" style={{ background: "var(--surface-950)", borderColor: "var(--border)", color: "var(--text-muted)" }}>
                    <CheckCircle2 size={12} />外部已装
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleAction(app)}
                    disabled={busy}
                    className="flex items-center gap-1.5 rounded-lg border px-3.5 py-1 text-xs font-semibold text-white transition disabled:cursor-wait disabled:opacity-70"
                    style={{ background: "var(--accent)", borderColor: "color-mix(in srgb, var(--accent) 65%, white)" }}
                  >
                    {busy ? <RotateCw size={12} className="animate-spin" /> : app.btnType === "reinstall" ? <RotateCw size={12} /> : <Download size={12} />}
                    {busy ? "检查中" : app.btnType === "reinstall" ? "重装" : "安装"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
