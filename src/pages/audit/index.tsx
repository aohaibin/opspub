import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Empty, Input, Select, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { save } from "@tauri-apps/plugin-dialog";
import { Clipboard, Download, FileSearch, RefreshCw, ScrollText, Search, ShieldAlert } from "lucide-react";
import { auditApi, serverApi } from "@/lib/api/server";
import { fileApi } from "@/lib/api/file";
import { getErrorMessage } from "@/lib/api/client";
import type { AuditLog, Server } from "@/types";

type Verdict = "success" | "pending" | "blocked" | "rejected" | "failed" | "other";
type AuditSource = "copilot" | "mcp" | "batch" | "terminal" | "system" | "other";

const AUDIT_LIMIT = 10000;
const REDACTION_PATTERNS = [
  /((?:password|passwd|token|secret|api[_-]?key|private[_-]?key)\s*[=:]\s*)([^\s,;]+)/gi,
  /(\b(?:-p|--password)\s+)([^\s]+)/gi,
  /(\b(?:Bearer|Basic)\s+)[A-Za-z0-9._~+/=-]+/gi,
];

function redact(value: string) {
  return REDACTION_PATTERNS.reduce((text, pattern) => text.replace(pattern, (_match, prefix: string) => `${prefix ?? ""}[REDACTED]`), value);
}

function sourceOf(user: string): AuditSource {
  const value = user.toLowerCase();
  if (value.includes("copilot")) return "copilot";
  if (value.includes("mcp")) return "mcp";
  if (value.includes("batch")) return "batch";
  if (value.includes("terminal") || value.includes("ssh") || value.includes("sftp")) return "terminal";
  if (value.includes("system")) return "system";
  return "other";
}

function verdictOf(result: string): Verdict {
  const value = result.toLowerCase();
  if (/pending|pending_approval|queued/.test(value)) return "pending";
  if (/reject/.test(value)) return "rejected";
  if (/block|denied|locked|拦截|阻止/.test(value)) return "blocked";
  if (/fail|error|timeout|panic/.test(value)) return "failed";
  if (/success|completed|exit\s*0|approved|started|dispatched/.test(value)) return "success";
  return "other";
}

function toolOf(command: string) {
  const match = command.trim().match(/^([\w.-]+)/);
  return match?.[1] ?? "unknown";
}

function isBatchLog(item: AuditLog) {
  const source = sourceOf(item.user);
  return source === "batch" || /(?:batch|_multi|multi_exec|parallel)/i.test(`${item.user} ${item.command}`);
}

function displayTime(value: string) {
  const parsed = new Date(value.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("zh-CN", { hour12: false });
}

const SOURCE_LABELS: Record<AuditSource, string> = {
  copilot: "内置助手",
  mcp: "MCP 调用",
  batch: "批量执行",
  terminal: "终端 / SFTP",
  system: "系统",
  other: "其他",
};

const VERDICT_LABELS: Record<Verdict, string> = {
  success: "已完成",
  pending: "待审批",
  blocked: "已拦截",
  rejected: "已拒绝",
  failed: "失败",
  other: "已记录",
};

const VERDICT_COLORS: Record<Verdict, string> = {
  success: "success",
  pending: "processing",
  blocked: "error",
  rejected: "warning",
  failed: "error",
  other: "default",
};

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [toolFilter, setToolFilter] = useState<string>();
  const [verdictFilter, setVerdictFilter] = useState<Verdict>();
  const [sourceFilter, setSourceFilter] = useState<AuditSource>();
  const [serverFilter, setServerFilter] = useState<string>();
  const [dateRange, setDateRange] = useState<[string, string]>(["", ""]);
  const [search, setSearch] = useState("");
  const [collapseRepeated, setCollapseRepeated] = useState(false);
  const [viewMode, setViewMode] = useState<"all" | "batch">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [records, serverList] = await Promise.all([auditApi.getLogs(AUDIT_LIMIT), serverApi.list()]);
      setLogs(records);
      setServers(serverList);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toolOptions = useMemo(() => [...new Set(logs.map((item) => toolOf(item.command)))].sort().map((value) => ({ value, label: value })), [logs]);
  const serverOptions = useMemo(() => {
    const names = new Set([...logs.map((item) => item.server_alias), ...servers.map((item) => item.alias)]);
    return [...names].sort().map((value) => ({ value, label: value }));
  }, [logs, servers]);

  const filteredLogs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const start = dateRange[0];
    const end = dateRange[1];
    const filtered = logs.filter((item) => {
      const time = item.created_at.slice(0, 10);
      return (viewMode === "all" || isBatchLog(item))
        && (!toolFilter || toolOf(item.command) === toolFilter)
        && (!verdictFilter || verdictOf(item.result) === verdictFilter)
        && (!sourceFilter || sourceOf(item.user) === sourceFilter)
        && (!serverFilter || item.server_alias === serverFilter)
        && (!start || time >= start)
        && (!end || time <= end)
        && (!needle || `${item.command} ${item.result} ${item.user} ${item.server_alias}`.toLowerCase().includes(needle));
    });
    if (!collapseRepeated) return filtered;
    const seen = new Set<string>();
    return filtered.filter((item) => {
      const signature = `${item.server_alias}\u0000${item.user}\u0000${item.command}\u0000${item.result}`;
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
  }, [collapseRepeated, dateRange, logs, search, serverFilter, sourceFilter, toolFilter, verdictFilter, viewMode]);

  const today = new Date().toISOString().slice(0, 10);
  const stats = useMemo(() => ({
    total: logs.length,
    today: logs.filter((item) => item.created_at.slice(0, 10) === today).length,
    pending: logs.filter((item) => verdictOf(item.result) === "pending").length,
    rejected: logs.filter((item) => verdictOf(item.result) === "rejected").length,
    blocked: logs.filter((item) => verdictOf(item.result) === "blocked").length,
    redacted: logs.filter((item) => redact(item.command) !== item.command || redact(item.result) !== item.result).length,
  }), [logs, today]);

  const copyCommand = async (command: string) => {
    try {
      await navigator.clipboard.writeText(redact(command));
      message.success("已复制脱敏后的命令");
    } catch {
      message.error("复制失败，请手动选择命令");
    }
  };

  const saveExperience = (record: AuditLog) => {
    try {
      const key = "ops_copilot_experiences";
      const current = JSON.parse(localStorage.getItem(key) ?? "[]") as Array<{ id: string; title: string; content: string; createdAt: number }>;
      const title = `${record.server_alias} · ${toolOf(record.command)}`.slice(0, 80);
      const content = `审计记录 #${record.id}\n时间：${displayTime(record.created_at)}\n来源：${SOURCE_LABELS[sourceOf(record.user)]}\n命令：${redact(record.command)}\n结果：${redact(record.result)}`;
      localStorage.setItem(key, JSON.stringify([{ id: crypto.randomUUID(), title, content, createdAt: Date.now() }, ...current]));
      message.success("已保存到本机经验库");
    } catch {
      message.error("保存经验失败，检查本机存储空间后重试");
    }
  };

  const exportLogs = async () => {
    try {
      const path = await save({
        title: "导出脱敏审计记录",
        defaultPath: `opspub-audit-${new Date().toISOString().replace(/[T:]/g, "-").slice(0, 17)}.json`,
        filters: [{ name: "JSON 文件", extensions: ["json"] }],
      });
      if (!path) return;
      const payload = filteredLogs.map((item) => ({
        id: item.id,
        createdAt: item.created_at,
        source: SOURCE_LABELS[sourceOf(item.user)],
        actor: item.user,
        server: item.server_alias,
        tool: toolOf(item.command),
        command: redact(item.command),
        result: redact(item.result),
        verdict: VERDICT_LABELS[verdictOf(item.result)],
      }));
      await fileApi.writeText(path, JSON.stringify({ exportedAt: new Date().toISOString(), count: payload.length, records: payload }, null, 2));
      message.success(`已导出 ${payload.length} 条脱敏记录：${path}`);
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const columns: ColumnsType<AuditLog> = [
    { title: "时间", dataIndex: "created_at", width: 165, render: (value: string) => <span className="whitespace-nowrap text-slate-400">{displayTime(value)}</span> },
    { title: "来源", dataIndex: "user", width: 110, render: (value: string) => <span className="font-sans text-slate-300">{SOURCE_LABELS[sourceOf(value)]}</span> },
    { title: "服务器", dataIndex: "server_alias", width: 150, ellipsis: true, render: (value: string) => <span className="font-sans text-sky-300">{value}</span> },
    { title: "动作 / 命令", dataIndex: "command", ellipsis: true, render: (value: string) => <span title={redact(value)} className="font-mono text-slate-200">{redact(value)}</span> },
    { title: "结果", dataIndex: "result", width: 210, ellipsis: true, render: (value: string) => { const verdict = verdictOf(value); const color = verdict === "success" ? "text-emerald-400" : verdict === "blocked" || verdict === "failed" ? "text-rose-400" : verdict === "pending" ? "text-amber-400" : "text-slate-400"; return <span className={`font-mono font-semibold ${color}`}>{redact(value)}</span>; } },
    { title: "裁决", dataIndex: "result", width: 95, render: (value: string) => { const verdict = verdictOf(value); return <Tag color={VERDICT_COLORS[verdict]}>{VERDICT_LABELS[verdict]}</Tag>; } },
    { title: "快捷操作", key: "actions", width: 155, align: "right", render: (_value, record) => <div className="flex justify-end gap-1"><Button size="small" type="text" title="复制脱敏命令" aria-label="复制脱敏命令" icon={<Clipboard size={13} />} onClick={() => void copyCommand(record.command)}>复制</Button><Button size="small" type="text" className="text-indigo-300 hover:text-indigo-200" title="保存为经验" aria-label="保存为经验" icon={<FileSearch size={13} />} onClick={() => saveExperience(record)}>转经验</Button></div> },
  ];

  const statItems = [
    { label: "总计", value: stats.total, color: "text-slate-100" },
    { label: "今日", value: stats.today, color: "text-emerald-400" },
    { label: "待审批", value: stats.pending, color: "text-amber-400" },
    { label: "已拒绝", value: stats.rejected, color: "text-rose-400" },
    { label: "已拦截", value: stats.blocked, color: "text-rose-400" },
    { label: "命中脱敏", value: stats.redacted, color: "text-cyan-400" },
  ];

  return (
    <div className="ops-page flex h-full min-h-0 flex-col gap-3 overflow-hidden p-4 text-xs sm:p-5">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><ScrollText size={17} className="text-cyan-400" /><h1 className="m-0 text-base font-bold text-white">审计日志</h1><Tag color="cyan" className="m-0">{logs.length}{logs.length === AUDIT_LIMIT ? "+" : ""} 条存证</Tag></div>
          <p className="mb-0 mt-1 text-[11px] text-slate-400">每次服务器操作（人工命令与 AI/MCP 调用）都会记录；参数已脱敏，不包含凭据。支持展开查看、复制和转为经验。</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-surface-950 p-0.5"><Button size="small" type={viewMode === "all" ? "primary" : "text"} onClick={() => setViewMode("all")}>全部</Button><Button size="small" type={viewMode === "batch" ? "primary" : "text"} onClick={() => setViewMode("batch")}>批次</Button></div>
          <Button size="small" icon={<Download size={14} />} onClick={() => void exportLogs()} disabled={loading}>导出</Button>
          <Button size="small" aria-label="刷新审计记录" title="刷新" icon={<RefreshCw size={14} />} loading={loading} onClick={() => void load()} />
        </div>
      </header>

      <section className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {statItems.map((item) => <div key={item.label} className="min-w-0 rounded-xl border border-slate-800 bg-[#0f141c] px-3 py-2"><div className="text-[11px] text-slate-400">{item.label}</div><div className={`mt-1 font-mono text-xl font-bold ${item.color}`}>{item.value.toLocaleString()}</div></div>)}
      </section>

      <section className="flex shrink-0 flex-wrap items-center gap-2">
        <Select allowClear value={toolFilter} onChange={setToolFilter} placeholder="全部工具" className="w-36" options={toolOptions} />
        <Select allowClear value={verdictFilter} onChange={setVerdictFilter} placeholder="全部裁决" className="w-32" options={Object.entries(VERDICT_LABELS).filter(([value]) => value !== "other").map(([value, label]) => ({ value, label }))} />
        <Select allowClear value={sourceFilter} onChange={setSourceFilter} placeholder="全部来源" className="w-36" options={Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label }))} />
        <Select allowClear showSearch optionFilterProp="label" value={serverFilter} onChange={setServerFilter} placeholder="全部服务器" className="w-40" options={serverOptions} />
        <div className="flex items-center gap-1"><input type="date" value={dateRange[0]} onChange={(event) => setDateRange(([_, end]) => [event.target.value, end])} className="h-8 rounded-md border border-slate-700 bg-surface-900 px-2 text-xs text-slate-300" /><span className="text-slate-500">至</span><input type="date" value={dateRange[1]} onChange={(event) => setDateRange(([start]) => [start, event.target.value])} className="h-8 rounded-md border border-slate-700 bg-surface-900 px-2 text-xs text-slate-300" /></div>
        <Input allowClear value={search} onChange={(event) => setSearch(event.target.value)} prefix={<Search size={14} className="text-slate-500" />} placeholder="搜 tool / params / result..." className="min-w-48 flex-1 sm:max-w-72" />
        <label className="flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap text-slate-400"><input type="checkbox" checked={collapseRepeated} onChange={(event) => setCollapseRepeated(event.target.checked)} className="accent-cyan-500" />折叠重复</label>
      </section>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-800 bg-[#0f141c]">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-3 py-2 text-[11px] text-slate-400"><span>显示 {filteredLogs.length} 条记录</span><span className="inline-flex items-center gap-1"><ShieldAlert size={12} className="text-amber-400" />审计数据来自本地日志库</span></div>
        <div className="custom-scrollbar min-h-0 flex-1 overflow-auto">
          <Table<AuditLog>
            size="small"
            rowKey="id"
            columns={columns}
            dataSource={filteredLogs}
            loading={loading}
            pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: [15, 30, 50, 100], showTotal: (total) => `共 ${total} 条` }}
            scroll={{ x: 1120, y: "calc(100vh - 420px)" }}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={loading ? "正在加载审计记录" : "没有匹配的审计记录"} /> }}
            expandable={{
              expandedRowRender: (record) => <div className="grid gap-3 px-2 py-1 md:grid-cols-2"><div><div className="mb-1 text-[11px] font-semibold text-slate-400">完整命令 / 参数</div><pre className="m-0 max-h-52 overflow-auto whitespace-pre-wrap break-all rounded bg-black/20 p-2 font-mono text-[11px] text-slate-200">{redact(record.command)}</pre></div><div><div className="mb-1 text-[11px] font-semibold text-slate-400">结果 / 裁决</div><pre className="m-0 max-h-52 overflow-auto whitespace-pre-wrap break-all rounded bg-black/20 p-2 font-mono text-[11px] text-slate-300">{redact(record.result)}</pre><div className="mt-2 text-[10px] text-slate-500">记录 #{record.id} · 操作主体 {record.user} · {displayTime(record.created_at)}</div></div></div>,
              rowExpandable: () => true,
              expandRowByClick: false,
            }}
          />
        </div>
      </section>
      <div className="flex shrink-0 items-center gap-1.5 text-[10px] text-slate-500"><ShieldAlert size={12} className="text-amber-500" />当前数据库记录未包含链式哈希字段；页面展示现有日志与筛选结果，不代表密码学防篡改校验。</div>
    </div>
  );
}
