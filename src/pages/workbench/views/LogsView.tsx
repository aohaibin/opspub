import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input, Tag, message } from "antd";
import { Search, Pause, Play, Download, RefreshCw } from "lucide-react";
import { getErrorMessage } from "@/lib/api/client";
import { useWorkbenchRuntime } from "../context";

interface LogSource { id: string; name: string; desc: string; badge: string; command: string; }
const LOG_SOURCES: LogSource[] = [
  { id: "journalctl", name: "journalctl", desc: "systemd 系统与内核日志", badge: "系统", command: "journalctl -n 200 --no-pager" },
  { id: "syslog", name: "/var/log/syslog", desc: "Linux 系统通用日志", badge: "内核", command: "tail -n 200 /var/log/syslog" },
  { id: "auth", name: "/var/log/auth.log", desc: "SSH 登录与 sudo 审计", badge: "安全", command: "tail -n 200 /var/log/auth.log" },
  { id: "docker", name: "docker events", desc: "容器运行事件", badge: "容器", command: "docker events --since 1h --until now" },
  { id: "nginx_access", name: "nginx/access.log", desc: "HTTP 访问请求", badge: "网站", command: "tail -n 200 /var/log/nginx/access.log" },
  { id: "nginx_error", name: "nginx/error.log", desc: "Nginx 异常日志", badge: "网站", command: "tail -n 200 /var/log/nginx/error.log" },
];

export const LogsView: React.FC = () => {
  const { runCommand } = useWorkbenchRuntime();
  const [activeSource, setActiveSource] = useState("journalctl");
  const [isStreaming, setIsStreaming] = useState(false);
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const source = useMemo(() => LOG_SOURCES.find((item) => item.id === activeSource) ?? LOG_SOURCES[0], [activeSource]);
  const refresh = useCallback(async () => { setLoading(true); try { const result = await runCommand(source.command); if (result.exitCode !== 0 && !result.stdout) throw new Error(result.stderr || "日志读取失败"); setLines(result.stdout.split(/\r?\n/).filter(Boolean)); } catch (error) { message.error(getErrorMessage(error)); } finally { setLoading(false); } }, [runCommand, source]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (!isStreaming) return; const timer = window.setInterval(() => { void refresh(); }, 5000); return () => window.clearInterval(timer); }, [isStreaming, refresh]);
  const filtered = lines.filter((line) => !search || line.toLowerCase().includes(search.toLowerCase()));
  const exportLogs = () => { const blob = new Blob([filtered.join("\n")], { type: "text/plain;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${activeSource}-${new Date().toISOString().slice(0, 10)}.log`; anchor.click(); URL.revokeObjectURL(url); };
  return <div className="flex h-[calc(100vh-10rem)] min-h-[500px] rounded-xl border overflow-hidden select-none" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}><div className="w-56 shrink-0 border-r p-2.5 flex flex-col gap-1.5 overflow-y-auto custom-scrollbar" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}><div className="text-[11px] font-semibold text-slate-400 px-2 py-1">日志来源</div>{LOG_SOURCES.map((item) => <button key={item.id} type="button" onClick={() => setActiveSource(item.id)} className={`w-full text-left p-2 rounded-lg border ${activeSource === item.id ? "bg-teal-500/15 border-teal-500/30" : "border-transparent"}`}><div className="flex items-center justify-between"><span className="font-mono text-xs font-semibold">{item.name}</span><Tag color="cyan" className="m-0 text-[10px]">{item.badge}</Tag></div><p className="text-[11px] line-clamp-1 text-slate-500">{item.desc}</p></button>)}</div><div className="flex-1 flex flex-col min-w-0 bg-[#0d1117]"><div className="shrink-0 flex items-center justify-between px-3 py-2 bg-[#161b22] border-b border-slate-800 text-xs"><div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${isStreaming ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} /><span className="font-mono text-slate-300">{source.name}</span></div><div className="flex items-center gap-2"><Input prefix={<Search size={13} />} placeholder="过滤关键词" value={search} onChange={(e) => setSearch(e.target.value)} size="small" style={{ width: 160 }} allowClear /><Button size="small" type="text" loading={loading} icon={<RefreshCw size={12} />} onClick={() => void refresh()} /><Button size="small" type="text" icon={isStreaming ? <Pause size={12} /> : <Play size={12} />} onClick={() => setIsStreaming((value) => !value)}>{isStreaming ? "暂停" : "实时"}</Button><Button size="small" type="text" icon={<Download size={12} />} onClick={exportLogs}>导出</Button></div></div><div className="flex-1 p-4 font-mono text-xs overflow-y-auto space-y-1.5 text-slate-300 custom-scrollbar leading-relaxed">{filtered.map((line, idx) => <div key={`${idx}-${line.slice(0, 10)}`} className="hover:bg-slate-800/40 px-1 rounded"><span className="text-slate-500 mr-2">{idx + 1}</span><span className={/error|failed|denied/i.test(line) ? "text-rose-400" : /accepted|started|success/i.test(line) ? "text-teal-300" : "text-slate-300"}>{line}</span></div>)}{!loading && filtered.length === 0 && <div className="text-slate-500">暂无日志</div>}</div></div></div>;
};
