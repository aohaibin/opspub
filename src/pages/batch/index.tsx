import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Button, Checkbox, Empty, Input, InputNumber, Modal, Segmented, Switch, Tooltip, message } from "antd";
import { Check, CircleAlert, Clock3, FileCode2, Layers3, ListChecks, LoaderCircle, Play, RotateCcw, RotateCw, Save, Search, Sparkles, X } from "lucide-react";
import { batchApi, type BatchTargetResult } from "@/lib/api/batch";
import { getErrorMessage } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";
import { parseTags } from "@/pages/servers/lib/serverMeta";
import type { Server } from "@/types";

type Mode = "concurrent" | "rolling" | "serial";
type RowStatus = "queued" | "running" | "success" | "failed" | "skipped";
interface RunRow {
  server: Server;
  status: RowStatus;
  result?: BatchTargetResult;
  error?: string;
  attempts: number;
}

const PRESETS = [
  { label: "巡检: 磁盘 / 内存 / 负载", linux: "df -h -x tmpfs -x devtmpfs && free -h && uptime" },
  { label: "nginx 状态", linux: "systemctl status nginx --no-pager" },
  { label: "CPU 前 10 进程", linux: "ps aux --sort=-%cpu | head -n 11" },
  { label: "最近 50 行日志", linux: "journalctl -n 50 --no-pager" },
  { label: "端口占用", linux: "ss -tulpn" },
];

function suggestCommand(prompt: string): string | null {
  const value = prompt.toLowerCase();
  if (/磁盘|内存|负载|巡检/.test(value)) return PRESETS[0].linux;
  if (/nginx/.test(value)) return PRESETS[1].linux;
  if (/cpu|进程/.test(value)) return PRESETS[2].linux;
  if (/日志|journal/.test(value)) return PRESETS[3].linux;
  if (/端口|监听|port/.test(value)) return PRESETS[4].linux;
  return null;
}

function confirmDispatch(count: number, command: string): Promise<boolean> {
  return new Promise((resolve) => {
    Modal.confirm({
      title: `确认向 ${count} 台服务器下发命令`,
      content: <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-surface-950 p-3 text-xs text-emerald-300">{command}</pre>,
      okText: "确认执行",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}

export default function BatchPage() {
  const location = useLocation();
  const incomingIds = (location.state as { serverIds?: number[] } | null)?.serverIds;
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>(incomingIds ?? []);
  const [filter, setFilter] = useState("");
  const [prompt, setPrompt] = useState("");
  const [command, setCommand] = useState(PRESETS[0].linux);
  const [mode, setMode] = useState<Mode>("concurrent");
  const [timeoutSecs, setTimeoutSecs] = useState(30);
  const [failStop, setFailStop] = useState(true);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<RunRow[]>([]);
  const [snippets, setSnippets] = useState<string[]>([]);
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [lastRunCommand, setLastRunCommand] = useState("");
  const runIdRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    void serverApi.list().then((items) => {
      if (mounted) setServers(items);
    }).catch((error) => {
      if (mounted) message.error(getErrorMessage(error));
    });
    return () => { mounted = false; };
  }, []);

  const linuxServers = useMemo(() => servers.filter((server) => server.os_type === "linux"), [servers]);
  const visibleServers = useMemo(() => linuxServers.filter((server) =>
    [server.alias, server.hostname, server.group, ...parseTags(server.tags)]
      .join(" ").toLowerCase().includes(filter.trim().toLowerCase()),
  ), [filter, linuxServers]);
  const selectedServers = linuxServers.filter((server) => selectedIds.includes(server.id));
  const successCount = rows.filter((row) => row.status === "success").length;
  const failedCount = rows.filter((row) => row.status === "failed").length;

  const updateRow = (id: number, patch: Partial<RunRow>) => {
    setRows((current) => current.map((row) => row.server.id === id ? { ...row, ...patch } : row));
  };

  const executeOne = async (server: Server, text: string, timeout: number, attempts = 1): Promise<boolean> => {
    updateRow(server.id, { status: "running", attempts, result: undefined, error: undefined });
    try {
      const result = await batchApi.executeTarget(server.id, text, timeout);
      updateRow(server.id, { status: result.exitCode === 0 ? "success" : "failed", result });
      return result.exitCode === 0;
    } catch (error) {
      updateRow(server.id, { status: "failed", error: getErrorMessage(error) });
      return false;
    }
  };

  const runTargets = async (targets: Server[], text: string, runMode: Mode, stopOnFailure: boolean, timeout: number) => {
    const runId = ++runIdRef.current;
    const started = performance.now();
    setRunning(true);
    setElapsedMs(null);
    setLastRunCommand(text);
    setRows(targets.map((server) => ({ server, status: "queued", attempts: 0 })));
    let stopped = false;
    const width = runMode === "serial" ? 1 : runMode === "rolling" ? 3 : 10;

    // 每批最多 width 台；失败即停只阻止尚未下发的批次，已下发主机仍等候真实结果。
    for (let offset = 0; offset < targets.length; offset += width) {
      if (stopped) break;
      const batch = targets.slice(offset, offset + width);
      const results = await Promise.all(batch.map((server) => executeOne(server, text, timeout)));
      if (stopOnFailure && results.some((ok) => !ok)) stopped = true;
    }
    if (stopped) {
      setRows((current) => current.map((row) => row.status === "queued" ? { ...row, status: "skipped" } : row));
    }
    if (runId === runIdRef.current) {
      setElapsedMs(Math.round(performance.now() - started));
      setRunning(false);
    }
  };

  const start = async () => {
    const text = command.trim();
    if (!selectedServers.length) return message.warning("请先选择 Linux 服务器");
    if (!text || text.includes("\n") || text.includes("\r")) return message.warning("请输入单行命令");
    if (!Number.isInteger(timeoutSecs) || timeoutSecs < 1 || timeoutSecs > 300) return message.warning("单台超时须在 1 到 300 秒之间");
    if (!await confirmDispatch(selectedServers.length, text)) return;
    await runTargets(selectedServers, text, mode, failStop, timeoutSecs);
  };

  const retry = async (row: RunRow) => {
    if (!await confirmDispatch(1, lastRunCommand)) return;
    setRunning(true);
    await executeOne(row.server, lastRunCommand, timeoutSecs, row.attempts + 1);
    setRunning(false);
  };

  const reset = () => {
    setPrompt("");
    setCommand(PRESETS[0].linux);
    setMode("concurrent");
    setTimeoutSecs(30);
    setFailStop(true);
    setRows([]);
    setElapsedMs(null);
    setLastRunCommand("");
  };

  return (
    <div className="ops-page flex min-h-full flex-col gap-4 text-xs" style={{ color: "var(--text-secondary)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-2">
        <div>
          <h1 className="flex items-center gap-2 text-base font-bold text-white"><Layers3 size={20} className="text-emerald-400" />批量执行 (Batch Command Runner)</h1>
          <p className="mt-0.5">一条命令发往多台机器；每台独立超时，失败可重试，全流程记录审计</p>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip title="重置表单"><Button icon={<RotateCcw size={14} />} onClick={reset} disabled={running} aria-label="重置表单" /></Tooltip>
          <Button type="primary" icon={<Play size={14} />} onClick={() => void start()} loading={running} disabled={!selectedServers.length}>开始批量执行 ({selectedServers.length})</Button>
        </div>
      </div>

      <section className="rounded-lg border border-emerald-500/30 bg-surface-900 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold text-white"><Sparkles size={16} className="text-emerald-400" />命令快捷生成 <span className="font-normal text-slate-400">基于内置安全模板</span></div>
          <span className="rounded border border-slate-800 bg-surface-950 px-2 py-0.5 font-mono text-emerald-300">Linux</span>
        </div>
        <div className="flex gap-2"><Input value={prompt} onChange={(event) => setPrompt(event.target.value)} onPressEnter={() => {
          const generated = suggestCommand(prompt);
          if (generated) setCommand(generated); else message.info("未匹配内置模板，请直接编辑命令");
        }} placeholder="输入运维意图，如：巡检磁盘空间、查看 nginx 状态" />
          <Button onClick={() => { const generated = suggestCommand(prompt); if (generated) setCommand(generated); else message.info("未匹配内置模板，请直接编辑命令"); }}>生成命令</Button></div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5"><span className="text-slate-500">试试：</span>{PRESETS.map((item) => <button key={item.label} type="button" onClick={() => { setPrompt(item.label); setCommand(item.linux); }} className="rounded border border-slate-700 bg-surface-800 px-2 py-0.5 text-[11px] text-slate-300 hover:text-emerald-300">{item.label}</button>)}</div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-surface-900 p-3.5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span>单条命令（多行脚本请在脚本工作台执行）</span><div className="flex gap-2"><Button size="small" type="text" icon={<FileCode2 size={13} />} onClick={() => setSnippetsOpen(true)}>片段</Button><Button size="small" type="text" icon={<Save size={13} />} onClick={() => { if (!command.trim()) return message.warning("命令为空"); setSnippets((current) => current.includes(command.trim()) ? current : [command.trim(), ...current]); message.success("已存为本次会话片段"); }}>存为片段</Button></div></div>
        <Input.TextArea value={command} onChange={(event) => setCommand(event.target.value)} rows={2} maxLength={4096} className="font-mono" />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
          <div className="flex flex-wrap items-center gap-4"><label className="flex items-center gap-2">模式 <Segmented<Mode> value={mode} onChange={setMode} options={[{ label: "并发 (上限 10)", value: "concurrent" }, { label: "滚动批次 (每批 3 台)", value: "rolling" }, { label: "串行", value: "serial" }]} /></label><label className="flex items-center gap-2">单台超时(秒) <InputNumber min={1} max={300} precision={0} value={timeoutSecs} onChange={(value) => setTimeoutSecs(value ?? 30)} className="w-20" /></label><label className="flex items-center gap-2">失败即停 <Switch size="small" checked={failStop} onChange={setFailStop} /></label></div>
          <span className="text-[11px] text-slate-500">命中高危操作阻断规则的命令不可下发</span>
        </div>
      </section>

      <div className="grid min-h-[380px] flex-1 grid-cols-1 gap-4 lg:grid-cols-5">
        <aside className="flex min-h-[380px] flex-col rounded-lg border border-slate-800 bg-surface-900 p-3 lg:col-span-1">
          <Input prefix={<Search size={14} />} value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="搜索别名 / 主机 / 标签" allowClear />
          <div className="mt-3 flex items-center justify-between border-b border-slate-800 pb-2"><Checkbox checked={visibleServers.length > 0 && visibleServers.every((server) => selectedIds.includes(server.id))} indeterminate={visibleServers.some((server) => selectedIds.includes(server.id)) && !visibleServers.every((server) => selectedIds.includes(server.id))} onChange={(event) => { const visibleIds = visibleServers.map((server) => server.id); setSelectedIds((current) => event.target.checked ? [...new Set([...current, ...visibleIds])] : current.filter((id) => !visibleIds.includes(id))); }} disabled={running}>全选</Checkbox><span className="font-mono text-emerald-400">{selectedServers.length} / {linuxServers.length}</span></div>
          <div className="custom-scrollbar mt-2 max-h-[440px] min-h-0 flex-1 space-y-1 overflow-y-auto">
            {visibleServers.length ? visibleServers.map((server) => <label key={server.id} className={`flex cursor-pointer items-start gap-2 rounded border p-2 ${selectedIds.includes(server.id) ? "border-emerald-500/30 bg-emerald-950/20" : "border-transparent hover:bg-surface-800"}`}><Checkbox checked={selectedIds.includes(server.id)} disabled={running} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, server.id] : current.filter((id) => id !== server.id))} /><span className="min-w-0"><span className="block truncate font-medium text-slate-200">{server.alias}</span><span className="block truncate font-mono text-[10px] text-slate-500">{server.hostname}:{server.port}</span></span></label>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的 Linux 主机" />}
          </div>
          {servers.some((server) => server.os_type === "windows") && <div className="border-t border-slate-800 pt-2 text-[11px] text-slate-500">Windows 主机暂不支持此 SSH 命令执行器</div>}
        </aside>

        <section className="min-w-0 rounded-lg border border-slate-800 bg-surface-900 p-4 lg:col-span-4">
          {!rows.length ? <div className="flex min-h-[345px] flex-col items-center justify-center gap-2 text-center"><ListChecks size={28} className="text-slate-600" /><h2 className="text-sm font-semibold text-white">尚未运行批量命令</h2><span>勾选主机、检查命令后开始执行</span></div> : <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3"><div className="flex items-center gap-3"><strong className="text-white">{running ? "执行中" : "执行完成"} ({rows.length} 台目标)</strong><span className="font-mono">{elapsedMs === null ? "正在计时" : `总耗时 ${elapsedMs}ms`} · 成功 {successCount} · 失败 {failedCount} · 跳过 {rows.filter((row) => row.status === "skipped").length}</span></div><Button size="small" icon={<RotateCw size={13} />} disabled={running} onClick={() => void start()}>重新执行</Button></div>
            <div className="custom-scrollbar mt-3 max-h-[520px] space-y-3 overflow-y-auto pr-1">{rows.map((row) => <div key={row.server.id} className="overflow-hidden rounded border border-slate-800 bg-surface-950"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2"><div className="flex min-w-0 items-center gap-2">{row.status === "running" ? <LoaderCircle size={14} className="animate-spin text-cyan-400" /> : row.status === "success" ? <Check size={14} className="text-emerald-400" /> : row.status === "failed" ? <CircleAlert size={14} className="text-rose-400" /> : <Clock3 size={14} className="text-slate-500" />}<strong className="truncate text-slate-200">{row.server.alias} ({row.server.hostname})</strong><span className="shrink-0 font-mono text-[10px] text-slate-400">{row.result ? `EXIT ${row.result.exitCode}` : row.status === "queued" ? "待执行" : row.status === "skipped" ? "已跳过" : row.status === "running" ? "执行中" : "连接失败"}</span></div><div className="flex items-center gap-2">{row.result && <span className="font-mono text-[11px]">{row.result.durationMs}ms</span>}{row.status === "failed" && <Button size="small" icon={<RotateCw size={12} />} disabled={running} onClick={() => void retry(row)}>重试</Button>}</div></div><div className="max-h-44 overflow-auto whitespace-pre-wrap break-all bg-black px-3 py-2 font-mono text-[11px] leading-relaxed text-emerald-300">{row.error || row.result?.stdout || (row.status === "running" ? "正在等待远端响应..." : row.status === "skipped" ? "失败即停，未向此主机下发" : "")}{row.result?.stderr && <pre className="mt-2 whitespace-pre-wrap text-rose-300">{row.result.stderr}</pre>}</div></div>)}</div>
          </>}
        </section>
      </div>

      <Modal title="命令片段" open={snippetsOpen} onCancel={() => setSnippetsOpen(false)} footer={null}><div className="space-y-2">{[...PRESETS.map((preset) => preset.linux), ...snippets.filter((snippet) => !PRESETS.some((preset) => preset.linux === snippet))].map((snippet) => <div key={snippet} className="flex items-start gap-2 rounded border border-slate-800 p-2"><code className="min-w-0 flex-1 break-all text-xs">{snippet}</code><Tooltip title="载入片段"><Button size="small" icon={<Check size={13} />} onClick={() => { setCommand(snippet); setSnippetsOpen(false); }} /></Tooltip>{snippets.includes(snippet) && <Tooltip title="移除本次会话片段"><Button size="small" icon={<X size={13} />} onClick={() => setSnippets((current) => current.filter((item) => item !== snippet))} /></Tooltip>}</div>)}</div></Modal>
    </div>
  );
}
