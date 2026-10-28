import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Empty, Progress, Spin, Tag, message } from "antd";
import {
  Activity,
  AlertCircle,
  Clock3,
  Database,
  Globe,
  HardDrive,
  Laptop,
  Network,
  PackageCheck,
  RefreshCw,
  TrendingUp,
  Wifi,
} from "lucide-react";
import { getErrorMessage } from "@/lib/api/client";
import type { Server } from "@/types";
import { useWorkbenchRuntime } from "../context";

type TrendMetric = "cpu" | "memory" | "network" | "disk" | "load";
type TrendLayout = "single" | "grid4";
type TrendRange = "1h" | "6h" | "1d" | "7d";

interface Metrics {
  cpuCores: number;
  cpuTotalTicks: number;
  cpuIdleTicks: number;
  cpuPercent: number;
  memoryUsed: number;
  memoryTotal: number;
  diskUsed: number;
  diskTotal: number;
  load: number;
  loadText: string;
  uptime: string;
  hostname: string;
  os: string;
  kernel: string;
  ip: string;
  networkRxTotal: number;
  networkTxTotal: number;
  diskReadTotal: number;
  diskWriteTotal: number;
  networkRxRate: number;
  networkTxRate: number;
  diskReadRate: number;
  diskWriteRate: number;
  appCount: number;
  dbCount: number;
  cronCount: number;
  websiteCount: number;
}

interface Sample {
  timestamp: number;
  cpu: number;
  memory: number;
  network: number;
  disk: number;
  load: number;
}

const EMPTY_METRICS: Metrics = {
  cpuCores: 0,
  cpuTotalTicks: 0,
  cpuIdleTicks: 0,
  cpuPercent: 0,
  memoryUsed: 0,
  memoryTotal: 0,
  diskUsed: 0,
  diskTotal: 0,
  load: 0,
  loadText: "-",
  uptime: "-",
  hostname: "-",
  os: "-",
  kernel: "-",
  ip: "-",
  networkRxTotal: 0,
  networkTxTotal: 0,
  diskReadTotal: 0,
  diskWriteTotal: 0,
  networkRxRate: 0,
  networkTxRate: 0,
  diskReadRate: 0,
  diskWriteRate: 0,
  appCount: 0,
  dbCount: 0,
  cronCount: 0,
  websiteCount: 0,
};

const SAMPLE_COMMAND = [
  "printf 'CPU\\t%s\\n' \"$(nproc 2>/dev/null || echo 0)\"",
  "printf 'CPUTICKS\\t'; awk '/^cpu / {print $2+$3+$4+$5+$6+$7+$8 \":\" $5+$6; exit}' /proc/stat",
  "printf 'MEM\\t'; free -m 2>/dev/null | awk 'NR==2 {print $2 \":\" $3}'",
  "printf 'DISK\\t'; df -Pm / 2>/dev/null | awk 'NR==2 {print $2 \":\" $3}'",
  "printf 'LOAD\\t'; cut -d' ' -f1-3 /proc/loadavg 2>/dev/null",
  "printf 'UPTIME\\t'; uptime -p 2>/dev/null || uptime",
  "printf 'HOSTNAME\\t'; hostname 2>/dev/null",
  "printf 'OS\\t'; . /etc/os-release 2>/dev/null && printf '%s' \"$PRETTY_NAME\" || uname -s",
  "printf 'KERNEL\\t'; uname -r 2>/dev/null",
  "printf 'IP\\t'; hostname -I 2>/dev/null | awk '{print $1}'",
  "printf 'NET\\t'; awk 'NR>2 && $1 !~ /^lo:/ {rx+=$2; tx+=$10} END {printf \"%d:%d\",rx,tx}' /proc/net/dev 2>/dev/null",
  "printf 'DIO\\t'; awk '{read += $6*512; write += $10*512} END {printf \"%d:%d\",read,write}' /proc/diskstats 2>/dev/null",
  "printf 'APP\\t'; docker ps -q 2>/dev/null | wc -l",
  "printf 'DB\\t'; systemctl list-units --type=service --state=running --no-legend 2>/dev/null | grep -Eic 'mysql|mariadb|postgres|redis|mongo' || true",
  "printf 'CRON\\t'; crontab -l 2>/dev/null | grep -Ev '^\\s*(#|$)' | wc -l",
  "printf 'WEB\\t'; systemctl list-units --type=service --state=running --no-legend 2>/dev/null | grep -Eic 'nginx|openresty|apache|caddy' || true",
].join("; ");

function number(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseMetrics(stdout: string, previous: Metrics | null, elapsedSeconds: number): Metrics {
  const result = { ...EMPTY_METRICS };
  stdout.split(/\r?\n/).forEach((line) => {
    const [key, ...parts] = line.split("\t");
    const value = parts.join("\t").trim();
    if (!key) return;
    if (key === "CPU") result.cpuCores = number(value);
    if (key === "CPUTICKS") {
      const [total, idle] = value.split(":");
      result.cpuTotalTicks = number(total);
      result.cpuIdleTicks = number(idle);
    }
    if (key === "MEM") {
      const [total, used] = value.split(":");
      result.memoryTotal = number(total);
      result.memoryUsed = number(used);
    }
    if (key === "DISK") {
      const [total, used] = value.split(":");
      result.diskTotal = number(total);
      result.diskUsed = number(used);
    }
    if (key === "LOAD") {
      result.loadText = value || "-";
      result.load = number(value.split(" ")[0]);
    }
    if (key === "UPTIME") result.uptime = value || "-";
    if (key === "HOSTNAME") result.hostname = value || "-";
    if (key === "OS") result.os = value || "-";
    if (key === "KERNEL") result.kernel = value || "-";
    if (key === "IP") result.ip = value || "-";
    if (key === "NET") {
      const [rx, tx] = value.split(":");
      result.networkRxTotal = number(rx);
      result.networkTxTotal = number(tx);
    }
    if (key === "DIO") {
      const [read, write] = value.split(":");
      result.diskReadTotal = number(read);
      result.diskWriteTotal = number(write);
    }
    if (key === "APP") result.appCount = Math.max(0, number(value));
    if (key === "DB") result.dbCount = Math.max(0, number(value));
    if (key === "CRON") result.cronCount = Math.max(0, number(value));
    if (key === "WEB") result.websiteCount = Math.max(0, number(value));
  });

  result.memoryUsed = result.memoryUsed || 0;
  result.memoryTotal = result.memoryTotal || 0;
  result.diskUsed = result.diskUsed || 0;
  result.diskTotal = result.diskTotal || 0;
  if (previous) {
    const totalTicks = result.cpuTotalTicks - previous.cpuTotalTicks;
    const idleTicks = result.cpuIdleTicks - previous.cpuIdleTicks;
    result.cpuPercent = totalTicks > 0
      ? Math.min(100, Math.max(0, Math.round(((totalTicks - idleTicks) / totalTicks) * 100)))
      : 0;
  }

  if (previous && elapsedSeconds > 0) {
    result.networkRxRate = Math.max(0, (result.networkRxTotal - previous.networkRxTotal) / elapsedSeconds);
    result.networkTxRate = Math.max(0, (result.networkTxTotal - previous.networkTxTotal) / elapsedSeconds);
    result.diskReadRate = Math.max(0, (result.diskReadTotal - previous.diskReadTotal) / elapsedSeconds);
    result.diskWriteRate = Math.max(0, (result.diskWriteTotal - previous.diskWriteTotal) / elapsedSeconds);
  }
  return result;
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B/s";
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB/s`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB/s`;
  return `${Math.round(value)} B/s`;
}

function formatMegabytes(value: number): string {
  if (!value) return "-";
  if (value >= 1024) return `${(value / 1024).toFixed(1)} GB`;
  return `${Math.round(value)} MB`;
}

function percent(used: number, total: number): number {
  return total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
}

const TREND_META: Record<TrendMetric, { label: string; color: string; unit: string }> = {
  cpu: { label: "CPU", color: "#2dd4bf", unit: "%" },
  memory: { label: "内存", color: "#a855f7", unit: "%" },
  network: { label: "网络流量", color: "#38bdf8", unit: "" },
  disk: { label: "磁盘 IO", color: "#fbbf24", unit: "" },
  load: { label: "负载", color: "#fb7185", unit: "" },
};

function sampleValue(sample: Sample, metric: TrendMetric): number {
  return sample[metric];
}

function formatTrendValue(value: number, metric: TrendMetric): string {
  if (metric === "network" || metric === "disk") return formatBytes(value);
  if (metric === "load") return value.toFixed(2);
  return `${value.toFixed(1)}%`;
}

interface TrendChartProps {
  samples: Sample[];
  metric: TrendMetric;
  compact?: boolean;
  onHover?: (index: number | null) => void;
  hoveredIndex?: number | null;
}

function TrendChart({ samples, metric, compact = false, onHover, hoveredIndex }: TrendChartProps) {
  const width = 760;
  const height = compact ? 112 : 240;
  const padding = compact ? 12 : 26;
  const values = samples.map((sample) => sampleValue(sample, metric));
  const maxValue = Math.max(...values, metric === "load" ? 1 : 100);
  const minValue = Math.min(...values, 0);
  const range = Math.max(maxValue - minValue, 1);
  const points = values.map((value, index) => {
    const x = padding + (index / Math.max(values.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - ((value - minValue) / range) * (height - padding * 2);
    return { x, y, value };
  });
  const path = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const meta = TREND_META[metric];

  if (samples.length === 0) {
    return <div className="flex h-full items-center justify-center text-xs" style={{ color: "var(--text-muted)" }}>等待采样数据</div>;
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" preserveAspectRatio="none" role="img" aria-label={`${meta.label}趋势图`}>
      {!compact && [0.25, 0.5, 0.75].map((ratio) => (
        <line key={ratio} x1={padding} x2={width - padding} y1={padding + (height - padding * 2) * ratio} y2={padding + (height - padding * 2) * ratio} stroke="var(--border)" strokeOpacity=".55" strokeDasharray="3 5" />
      ))}
      <polyline points={path} fill="none" stroke={meta.color} strokeWidth={compact ? 2 : 2.5} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((point, index) => (
        <circle
          key={`${point.x}-${point.y}`}
          cx={point.x}
          cy={point.y}
          r={hoveredIndex === index ? 4 : compact ? 1.5 : 2.5}
          fill={meta.color}
          stroke={hoveredIndex === index ? "var(--surface-950)" : "none"}
          strokeWidth="2"
          onMouseEnter={() => onHover?.(index)}
          onMouseLeave={() => onHover?.(null)}
        />
      ))}
    </svg>
  );
}

interface OverviewViewProps { server: Server | null; }

export const OverviewView: React.FC<OverviewViewProps> = ({ server }) => {
  const { runCommand } = useWorkbenchRuntime();
  const [metrics, setMetrics] = useState(EMPTY_METRICS);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("cpu");
  const [trendLayout, setTrendLayout] = useState<TrendLayout>("single");
  const [trendRange, setTrendRange] = useState<TrendRange>("6h");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const previousMetrics = useRef<Metrics | null>(null);
  const previousSampleAt = useRef<number | null>(null);
  const refreshing = useRef(false);
  const sampledServerId = useRef<number | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (refreshing.current) return;
    if (!server) {
      setMetrics(EMPTY_METRICS);
      setSamples([]);
      setLastError(null);
      previousMetrics.current = null;
      previousSampleAt.current = null;
      return;
    }
    refreshing.current = true;
    setLoading(!silent);
    try {
      const result = await runCommand(SAMPLE_COMMAND);
      if (result.exitCode !== 0 && !result.stdout.trim()) throw new Error(result.stderr || "远程概述指标采集失败");
      const now = Date.now();
      const elapsed = previousSampleAt.current ? (now - previousSampleAt.current) / 1000 : 0;
      const parsed = parseMetrics(result.stdout, previousMetrics.current, elapsed);
      previousMetrics.current = parsed;
      previousSampleAt.current = now;
      setMetrics(parsed);
      setLastError(null);
      setSamples((current) => [
        ...current,
        {
          timestamp: now,
          cpu: parsed.cpuPercent,
          memory: percent(parsed.memoryUsed, parsed.memoryTotal),
          network: parsed.networkRxRate + parsed.networkTxRate,
          disk: parsed.diskReadRate + parsed.diskWriteRate,
          load: parsed.load,
        },
      ].slice(-300));
    } catch (error) {
      const text = getErrorMessage(error);
      setLastError(text);
      if (!silent) message.error(text);
    } finally {
      refreshing.current = false;
      setLoading(false);
    }
  }, [runCommand, server]);

  useEffect(() => {
    if (sampledServerId.current !== server?.id) {
      sampledServerId.current = server?.id ?? null;
      previousMetrics.current = null;
      previousSampleAt.current = null;
      setSamples([]);
      setHoveredIndex(null);
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const visibleSamples = useMemo(() => {
    const limits: Record<TrendRange, number> = { "1h": 60, "6h": 120, "1d": 240, "7d": 300 };
    return samples.slice(-limits[trendRange]);
  }, [samples, trendRange]);
  const selectedSample = hoveredIndex === null ? null : visibleSamples[hoveredIndex] ?? null;
  const latestSample = visibleSamples[visibleSamples.length - 1];
  const memoryPercent = percent(metrics.memoryUsed, metrics.memoryTotal);
  const diskPercent = percent(metrics.diskUsed, metrics.diskTotal);

  const overviewCards = [
    { label: "运行容器", value: metrics.appCount, icon: <PackageCheck size={17} />, color: "#2dd4bf" },
    { label: "数据库服务", value: metrics.dbCount, icon: <Database size={17} />, color: "#38bdf8" },
    { label: "用户计划任务", value: metrics.cronCount, icon: <Clock3 size={17} />, color: "#fbbf24" },
    { label: "Web 服务", value: metrics.websiteCount, icon: <Globe size={17} />, color: "#a78bfa" },
  ];
  const resources = [
    { label: "CPU", value: metrics.cpuPercent, detail: `${metrics.cpuCores || "-"} 核 · 负载 ${metrics.loadText}`, color: "#2dd4bf" },
    { label: "内存", value: memoryPercent, detail: `${formatMegabytes(metrics.memoryUsed)} / ${formatMegabytes(metrics.memoryTotal)}`, color: "#a855f7" },
    { label: "磁盘 /", value: diskPercent, detail: `${formatMegabytes(metrics.diskUsed)} / ${formatMegabytes(metrics.diskTotal)}`, color: "#fbbf24" },
    { label: "负载", value: metrics.load, detail: `${metrics.cpuCores || "-"} 核 · ${metrics.loadText}`, color: "#fb7185", raw: true },
  ];

  if (!server) {
    return <div className="flex h-full min-h-[420px] items-center justify-center"><Empty description="请选择一台服务器查看概述" /></div>;
  }

  return (
    <div className="ops-workbench-overview pb-12 select-none">
      <Spin spinning={loading}>
        <div className="ops-workbench-overview-sections">
        <section className="space-y-3 rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><span className="h-3.5 w-1 rounded bg-teal-400" /><span className="font-bold text-sm">概览</span></div>
            <Button size="small" type="text" loading={loading} icon={<RefreshCw size={13} />} onClick={() => void refresh()}>刷新状态</Button>
          </div>
          <div className="ops-overview-metric-grid grid grid-cols-2 sm:grid-cols-4">
            {overviewCards.map((card) => (
              <div key={card.label} className="flex items-center justify-between rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-900)" }}>
                <div className="flex min-w-0 items-center gap-2.5"><div className="rounded-lg p-2" style={{ color: card.color, background: `${card.color}18` }}>{card.icon}</div><div className="min-w-0"><div className="text-xs" style={{ color: "var(--text-muted)" }}>{card.label}</div><div className="font-mono text-2xl font-bold" style={{ color: card.color }}>{card.value}</div></div></div>
                <Tag color="default" className="m-0 text-[10px]">实时</Tag>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="h-3.5 w-1 rounded bg-teal-400" /><span className="font-bold text-sm">状态</span></div><span className="text-xs" style={{ color: "var(--text-muted)" }}>{server.hostname} · {metrics.uptime}</span></div>
          <div className="ops-overview-resource-grid grid grid-cols-2 md:grid-cols-4">
            {resources.map((resource) => (
              <div key={resource.label} className="flex flex-col items-center justify-center gap-2 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-900)" }}>
                <Progress type="circle" percent={resource.raw ? Math.min(100, Math.round(resource.value * 100 / Math.max(metrics.cpuCores, 1))) : resource.value} size={92} strokeColor={resource.color} format={() => <span className="font-mono text-sm font-bold">{resource.raw ? resource.value.toFixed(2) : `${resource.value}%`}</span>} />
                <span className="flex items-center gap-1 text-xs font-medium"><Activity size={13} style={{ color: resource.color }} />{resource.label}</span>
                <span className="text-center font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>{resource.detail}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border p-2.5 font-mono text-[11px]" style={{ borderColor: "var(--border)", background: "var(--surface-950)", color: "var(--text-muted)" }}>
            <span className="flex items-center gap-1.5"><Laptop size={13} />主机名 <strong style={{ color: "var(--text-primary)" }}>{metrics.hostname}</strong></span>
            <span>系统 <strong style={{ color: "var(--text-primary)" }}>{metrics.os}</strong></span>
            <span>内核 <strong style={{ color: "var(--text-primary)" }}>{metrics.kernel}</strong></span>
            <span>内网 IP <strong style={{ color: "var(--text-primary)" }}>{metrics.ip}</strong></span>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="h-3.5 w-1 rounded bg-teal-400" /><span className="font-bold text-sm">监控</span></div><div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}><span className="flex items-center gap-1.5"><Network size={13} className="text-sky-400" />上行 {formatBytes(metrics.networkTxRate)}</span><span className="flex items-center gap-1.5"><Wifi size={13} className="text-teal-400" />下行 {formatBytes(metrics.networkRxRate)}</span><span className="flex items-center gap-1.5"><HardDrive size={13} className="text-amber-400" />读 {formatBytes(metrics.diskReadRate)} · 写 {formatBytes(metrics.diskWriteRate)}</span></div></div>
          <div className="ops-overview-monitor-grid grid grid-cols-1 md:grid-cols-2">
            <MiniMetricChart title="网络流量" icon={<Network size={14} />} color="#38bdf8" samples={visibleSamples} metric="network" />
            <MiniMetricChart title="磁盘 IO" icon={<HardDrive size={14} />} color="#fbbf24" samples={visibleSamples} metric="disk" />
          </div>
        </section>

        <section className="space-y-4 rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-2" style={{ borderColor: "var(--border)" }}>
            <div className="flex flex-wrap items-center gap-2"><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400"><TrendingUp size={15} /></span><span className="font-bold text-sm">历史趋势</span></div><div className="flex items-center gap-1 rounded-lg border p-0.5 text-xs" style={{ borderColor: "var(--border)", background: "var(--surface-950)" }}>{(Object.keys(TREND_META) as TrendMetric[]).map((key) => <button key={key} type="button" onClick={() => { setTrendMetric(key); setHoveredIndex(null); }} className={`rounded-md px-2.5 py-1 transition ${trendMetric === key ? "bg-teal-500/15 text-teal-300" : "text-slate-400 hover:text-white"}`}>{TREND_META[key].label}</button>)}</div></div>
            <div className="flex flex-wrap items-center gap-2 text-xs"><div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ borderColor: "var(--border)", background: "var(--surface-950)" }}>{(["single", "grid4"] as TrendLayout[]).map((layout) => <button key={layout} type="button" onClick={() => setTrendLayout(layout)} className={`rounded px-2 py-1 ${trendLayout === layout ? "bg-surface-800 text-teal-300" : "text-slate-400 hover:text-white"}`}>{layout === "single" ? "单图" : "四分图"}</button>)}</div><div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ borderColor: "var(--border)", background: "var(--surface-950)" }}>{(["1h", "6h", "1d", "7d"] as TrendRange[]).map((range) => <button key={range} type="button" onClick={() => setTrendRange(range)} className={`rounded px-2 py-1 ${trendRange === range ? "bg-surface-800 text-teal-300" : "text-slate-400 hover:text-white"}`}>{range}</button>)}</div><Button size="small" type="text" icon={<RefreshCw size={13} />} onClick={() => void refresh()} aria-label="刷新趋势" /></div>
          </div>
          {lastError && <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "color-mix(in srgb, var(--warning) 35%, var(--border))", background: "color-mix(in srgb, var(--warning) 10%, transparent)", color: "var(--warning)" }}><AlertCircle size={14} />{lastError}</div>}
          {trendLayout === "single" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[
                ["当前", latestSample ? formatTrendValue(sampleValue(latestSample, trendMetric), trendMetric) : "-"],
                ["峰值", visibleSamples.length ? formatTrendValue(Math.max(...visibleSamples.map((item) => sampleValue(item, trendMetric))), trendMetric) : "-"],
                ["平均", visibleSamples.length ? formatTrendValue(visibleSamples.reduce((sum, item) => sum + sampleValue(item, trendMetric), 0) / visibleSamples.length, trendMetric) : "-"],
                ["最低", visibleSamples.length ? formatTrendValue(Math.min(...visibleSamples.map((item) => sampleValue(item, trendMetric))), trendMetric) : "-"],
              ].map(([label, value]) => <div key={label} className="rounded-lg border p-2.5" style={{ borderColor: "var(--border)", background: "var(--surface-950)" }}><div className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</div><div className="font-mono text-base font-bold" style={{ color: TREND_META[trendMetric].color }}>{value}</div></div>)}</div>
              <div className="relative h-56 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-950)" }}><TrendChart samples={visibleSamples} metric={trendMetric} hoveredIndex={hoveredIndex} onHover={setHoveredIndex} />{selectedSample && hoveredIndex !== null && <div className="pointer-events-none absolute right-3 top-3 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}>{new Date(selectedSample.timestamp).toLocaleTimeString()} · {formatTrendValue(sampleValue(selectedSample, trendMetric), trendMetric)}</div>}</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{(Object.keys(TREND_META) as TrendMetric[]).filter((metric) => metric !== "load").map((metric) => <div key={metric} className="space-y-2 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-950)" }}><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-xs font-semibold"><span className="h-2 w-2 rounded-full" style={{ background: TREND_META[metric].color }} />{TREND_META[metric].label}</span><span className="font-mono text-xs" style={{ color: TREND_META[metric].color }}>{latestSample ? formatTrendValue(sampleValue(latestSample, metric), metric) : "-"}</span></div><div className="h-24"><TrendChart samples={visibleSamples} metric={metric} compact /></div><div className="flex justify-between font-mono text-[11px]" style={{ color: "var(--text-muted)" }}><span>峰值 {visibleSamples.length ? formatTrendValue(Math.max(...visibleSamples.map((item) => sampleValue(item, metric))), metric) : "-"}</span><span>样本 {visibleSamples.length}</span></div></div>)}</div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 font-mono text-[11px]" style={{ color: "var(--text-muted)" }}><span>每 5 秒刷新 · 当前样本 {visibleSamples.length} · 范围 {trendRange}</span><span>网络为全网卡合计，磁盘 IO 为物理磁盘合计</span></div>
        </section>

        <section className="space-y-3 rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
          <div className="flex items-center gap-2"><span className="h-3.5 w-1 rounded bg-teal-400" /><span className="font-bold text-sm">服务器配置与环境</span></div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-xs md:grid-cols-2 lg:grid-cols-3">{[
            ["操作系统", `${metrics.os} · ${server.os_type || "-"}`],
            ["主机名 / 别名", `${metrics.hostname} · ${server.alias || "-"}`],
            ["连接目标", `${server.username}@${server.hostname}:${server.port}`],
            ["AI 策略", server.ai_policy || "-"],
            ["系统内核", metrics.kernel],
            ["运行时间", metrics.uptime],
          ].map(([label, value]) => <div key={label} className="flex min-w-0 justify-between gap-4 border-b py-1.5" style={{ borderColor: "var(--border)" }}><span style={{ color: "var(--text-muted)" }}>{label}</span><span className="truncate text-right font-mono" style={{ color: "var(--text-primary)" }}>{value}</span></div>)}</div>
        </section>
        </div>
      </Spin>
    </div>
  );
};

function MiniMetricChart({ title, icon, color, samples, metric }: { title: string; icon: React.ReactNode; color: string; samples: Sample[]; metric: TrendMetric }) {
  const latestSample = samples[samples.length - 1];
  return <div className="space-y-2"><div className="flex items-center justify-between text-xs"><span className="flex items-center gap-2 font-medium" style={{ color: "var(--text-secondary)" }}>{icon}{title}</span><span className="font-mono" style={{ color }}>{latestSample ? formatTrendValue(sampleValue(latestSample, metric), metric) : "-"}</span></div><div className="h-28 overflow-hidden rounded-lg border p-2" style={{ borderColor: "var(--border)", background: "var(--surface-950)" }}><TrendChart samples={samples} metric={metric} compact /></div></div>;
}
