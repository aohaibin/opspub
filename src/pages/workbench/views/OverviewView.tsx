import React, { useCallback, useEffect, useState } from "react";
import { Progress, Tag, Button, message } from "antd";
import { Globe, Database, Container, AlertCircle, Cpu, HardDrive, Activity, Wifi, RefreshCw } from "lucide-react";
import { getErrorMessage } from "@/lib/api/client";
import type { Server } from "@/types";
import { useWorkbenchRuntime } from "../context";

interface OverviewViewProps { server: Server | null; }
interface Metrics { cpuCores: number; cpuPercent: number; memoryUsed: number; memoryTotal: number; diskUsed: number; diskTotal: number; load: string; uptime: string; }

const EMPTY_METRICS: Metrics = { cpuCores: 0, cpuPercent: 0, memoryUsed: 0, memoryTotal: 0, diskUsed: 0, diskTotal: 0, load: "-", uptime: "-" };

function parseMetrics(stdout: string): Metrics {
  const result = { ...EMPTY_METRICS };
  stdout.split(/\r?\n/).forEach((line) => {
    const [key, value = ""] = line.split("\t");
    if (key === "CPU") result.cpuCores = Number(value) || 0;
    if (key === "MEM") { const [total, used] = value.split(":").map(Number); result.memoryTotal = total || 0; result.memoryUsed = used || 0; }
    if (key === "DISK") { const [total, used] = value.split(":").map(Number); result.diskTotal = total || 0; result.diskUsed = used || 0; }
    if (key === "LOAD") result.load = value;
    if (key === "UPTIME") result.uptime = value;
  });
  return result;
}

export const OverviewView: React.FC<OverviewViewProps> = ({ server }) => {
  const { runCommand } = useWorkbenchRuntime();
  const [metrics, setMetrics] = useState(EMPTY_METRICS);
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    if (!server) { setMetrics(EMPTY_METRICS); return; }
    setLoading(true);
    try {
      const command = "printf 'CPU\\t%s\\n' \"$(nproc 2>/dev/null || echo 0)\"; printf 'MEM\\t'; free -m 2>/dev/null | awk 'NR==2 {print $2 \":\" $3}'; printf 'DISK\\t'; df -Pm / 2>/dev/null | awk 'NR==2 {print $2 \":\" $3}'; printf 'LOAD\\t'; cut -d' ' -f1-3 /proc/loadavg 2>/dev/null; printf 'UPTIME\\t'; uptime -p 2>/dev/null || uptime";
      const result = await runCommand(command);
      if (result.exitCode !== 0 && !result.stdout.trim()) throw new Error(result.stderr || "远程指标命令执行失败");
      const parsed = parseMetrics(result.stdout);
      parsed.cpuPercent = parsed.cpuCores > 0 ? Math.min(100, Math.round((Number(parsed.load.split(" ")[0]) / parsed.cpuCores) * 100)) : 0;
      setMetrics(parsed);
    } catch (error) { message.error(getErrorMessage(error)); }
    finally { setLoading(false); }
  }, [runCommand, server]);
  useEffect(() => { void refresh(); }, [refresh]);

  const memoryPercent = metrics.memoryTotal ? Math.round(metrics.memoryUsed / metrics.memoryTotal * 100) : 0;
  const diskPercent = metrics.diskTotal ? Math.round(metrics.diskUsed / metrics.diskTotal * 100) : 0;
  const cards = [
    { label: "网站", value: "-", icon: <Globe size={18} />, color: "text-teal-400" },
    { label: "数据库", value: "-", icon: <Database size={18} />, color: "text-blue-400" },
    { label: "容器", value: "-", icon: <Container size={18} />, color: "text-purple-400" },
    { label: "待更新", value: "-", icon: <AlertCircle size={18} />, color: "text-amber-400" },
  ];
  const resources = [
    { label: "CPU 使用率", percent: metrics.cpuPercent, detail: `${metrics.cpuCores || "-"} 核 · 负载 ${metrics.load}`, icon: <Cpu size={14} />, color: "#2dd4bf" },
    { label: "内存使用率", percent: memoryPercent, detail: `${metrics.memoryUsed || "-"} MB / ${metrics.memoryTotal || "-"} MB`, icon: <Activity size={14} />, color: "#38bdf8" },
    { label: "系统磁盘", percent: diskPercent, detail: `${metrics.diskUsed || "-"} MB / ${metrics.diskTotal || "-"} MB`, icon: <HardDrive size={14} />, color: "#a855f7" },
  ];

  return <div className="space-y-4 pb-12 select-none">
    <section className="p-4 rounded-xl border space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
      <div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="w-1 h-3.5 rounded bg-teal-400" /><span className="font-bold text-xs">概览指标</span></div><Button size="small" type="text" loading={loading} icon={<RefreshCw size={12} />} onClick={() => void refresh()}>刷新</Button></div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">{cards.map((card) => <div key={card.label} className="flex items-center justify-between p-3 rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}><div className="flex items-center gap-2.5"><div className={`p-2 rounded bg-slate-500/15 ${card.color}`}>{card.icon}</div><div><div style={{ color: "var(--text-muted)" }}>{card.label}</div><div className="font-bold text-sm">{card.value}</div></div></div><Tag color="default" className="m-0 text-[10px]">需刷新模块</Tag></div>)}</div>
    </section>
    <section className="p-4 rounded-xl border space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
      <div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="w-1 h-3.5 rounded bg-teal-400" /><span className="font-bold text-xs">系统实时资源</span></div><span className="text-xs text-slate-400">{server ? `${server.hostname} · ${metrics.uptime}` : "请选择服务器"}</span></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{resources.map((item) => <div key={item.label} className="flex flex-col items-center justify-center p-3 rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}><div className="text-xs mb-2 flex items-center gap-1 text-slate-300">{React.cloneElement(item.icon, { className: "text-teal-400" })}<span>{item.label}</span></div><Progress type="circle" percent={item.percent} size={90} strokeColor={item.color} format={(p) => <span className="text-xs font-mono font-bold">{p}%</span>} /><div className="text-[11px] mt-2 font-mono text-slate-400">{item.detail}</div></div>)}</div>
      <div className="flex items-center gap-2 text-xs text-slate-400"><Wifi size={14} className="text-amber-400" />负载：<span className="font-mono text-slate-200">{metrics.load}</span></div>
    </section>
    <section className="p-4 rounded-xl border space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}><div className="font-bold text-xs">服务器配置与环境</div><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-xs"><div className="flex justify-between py-1 border-b border-slate-800"><span className="text-slate-400">操作系统</span><span className="font-mono">{server?.os_type || "-"} · {server?.arch || "-"}</span></div><div className="flex justify-between py-1 border-b border-slate-800"><span className="text-slate-400">主机名 / 别名</span><span>{server?.alias || "-"}</span></div><div className="flex justify-between py-1 border-b border-slate-800"><span className="text-slate-400">连接目标</span><span className="font-mono text-teal-400">{server ? `${server.username}@${server.hostname}:${server.port}` : "-"}</span></div><div className="flex justify-between py-1 border-b border-slate-800"><span className="text-slate-400">AI 策略</span><Tag color="cyan" className="m-0 text-[10px]">{server?.ai_policy || "-"}</Tag></div></div></section>
  </div>;
};
