import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Progress, Spin } from "antd";
import {
  ArrowRight,
  Clock3,
  Database,
  Globe,
  HardDrive,
  Laptop,
  Network,
  PackageCheck,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { getErrorMessage } from "@/lib/api/client";
import type { Server } from "@/types";
import { useWorkbenchRuntime } from "@/pages/workbench/context";
import { readWebsiteInventory } from "@/pages/workbench/websiteInventory";
import "./overview.css";

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
  cpuModel: string;
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
  partitions: DiskPartition[];
}

interface DiskPartition {
  mount: string;
  device: string;
  used: number;
  total: number;
  available: number;
}

interface Sample {
  timestamp: number;
  cpu: number;
  memory: number;
  network: number;
  disk: number;
  load: number;
  networkTx: number;
  networkRx: number;
  diskRead: number;
  diskWrite: number;
}

const EMPTY_METRICS: Metrics = {
  cpuCores: 0,
  cpuTotalTicks: 0,
  cpuIdleTicks: 0,
  cpuPercent: 0,
  memoryUsed: 0,
  memoryTotal: 0,
  cpuModel: "-",
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
  partitions: [],
};

// POSIX df 的容量字段在中间定位，保留设备名和挂载路径里的空格。
const PARTITION_COMMAND = String.raw`(LC_ALL=C df -kP -x tmpfs -x devtmpfs 2>/dev/null || LC_ALL=C df -kP 2>/dev/null) | awk '
  NR > 1 && match($0, /[ \t]+[0-9]+[ \t]+[0-9]+[ \t]+-?[0-9]+[ \t]+[0-9]+%[ \t]+/) {
    device = substr($0, 1, RSTART - 1)
    mount = substr($0, RSTART + RLENGTH)
    if (mount != "/" && (device == "tmpfs" || device == "devtmpfs" || device == "none" || device == "overlay")) next
    if (device ~ /^[/]dev[/]loop[0-9]+$/ && mount ~ /^[/]snap[/]/) next
    fields = substr($0, RSTART, RLENGTH)
    sub(/^[ \t]+/, "", fields)
    split(fields, capacity, /[ \t]+/)
    printf "PART\t%s\t%s\t%s\t%s\t%s\n", mount, device, capacity[2], capacity[1], capacity[3]
  }'`;

const SAMPLE_COMMAND = [
  "printf 'CPU\\t%s\\n' \"$(nproc 2>/dev/null || echo 0)\"",
  "printf 'CPUTICKS\\t'; awk '/^cpu / {printf \"%.0f:%.0f\\n\", $2+$3+$4+$5+$6+$7+$8+$9, $5+$6; exit}' /proc/stat",
  "printf 'MEM\\t'; free -m 2>/dev/null | awk 'NR==2 {print $2 \":\" $7}'",
  PARTITION_COMMAND,
  "printf 'CPUMODEL\\t'; awk -F ': *' '/^model name[[:space:]]*:/ {model=$2; exit} END {print model}' /proc/cpuinfo 2>/dev/null",
  "printf 'LOAD\\t'; cut -d' ' -f1-3 /proc/loadavg 2>/dev/null",
  "printf 'UPTIME\\t'; uptime -p 2>/dev/null || uptime",
  "printf 'HOSTNAME\\t'; hostname 2>/dev/null",
  "printf 'OS\\t'; . /etc/os-release 2>/dev/null && printf '%s\\n' \"$PRETTY_NAME\" || uname -s",
  "printf 'KERNEL\\t'; uname -r 2>/dev/null",
  "printf 'IP\\t'; hostname -I 2>/dev/null | awk 'NR==1 {ip=$1} END {print ip}'",
  "printf 'NET\\t'; awk 'NR>2 && $1 !~ /^lo:/ {rx+=$2; tx+=$10} END {printf \"%.0f:%.0f\\n\",rx,tx}' /proc/net/dev 2>/dev/null",
  "printf 'DIO\\t'; awk '{read += $6*512; write += $10*512} END {printf \"%.0f:%.0f\\n\",read,write}' /proc/diskstats 2>/dev/null",
  "printf 'APP\\t'; docker ps -q 2>/dev/null | wc -l",
  "printf 'DB\\t'; systemctl list-units --type=service --state=running --no-legend 2>/dev/null | grep -Eic 'mysql|mariadb|postgres|redis|mongo' || true",
  "printf 'CRON\\t'; crontab -l 2>/dev/null | grep -Ev '^\\s*(#|$)' | wc -l",
].join("; ");

function number(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseMetrics(stdout: string, previous: Metrics | null, elapsedSeconds: number): Metrics {
  const result = { ...EMPTY_METRICS };
  const partitions: DiskPartition[] = [];
  stdout.split(/\r?\n/).forEach((line) => {
    const [key, ...parts] = line.split("\t");
    const value = parts.join("\t").trim();
    if (!key) return;
    if (key === "PART" && parts.length >= 5) {
      const [mount, device, used, total, available] = parts;
      const parsedUsed = number(used);
      const parsedTotal = number(total);
      if (mount && parsedTotal > 0) {
        partitions.push({ mount, device, used: parsedUsed, total: parsedTotal, available: Math.max(0, number(available)) });
      }
      return;
    }
    if (key === "CPU") result.cpuCores = number(value);
    if (key === "CPUTICKS") {
      const [total, idle] = value.split(":");
      result.cpuTotalTicks = number(total);
      result.cpuIdleTicks = number(idle);
    }
    if (key === "MEM") {
      const [total, available] = value.split(":");
      result.memoryTotal = number(total);
      result.memoryUsed = Math.max(0, result.memoryTotal - number(available));
    }
    if (key === "CPUMODEL") result.cpuModel = value || "-";
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
  });

  result.partitions = partitions;
  if (previous) {
    const totalTicks = result.cpuTotalTicks - previous.cpuTotalTicks;
    const idleTicks = result.cpuIdleTicks - previous.cpuIdleTicks;
    result.cpuPercent = totalTicks > 0
      ? Math.min(100, Math.max(0, Number((((totalTicks - idleTicks) / totalTicks) * 100).toFixed(1))))
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

function formatCapacity(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const value = Math.max(0, bytes);
  const unit = value < 1024 ? 0 : Math.min(units.length - 1, Math.floor(Math.log2(value) / 10));
  const scaled = value / (1024 ** unit);
  return `${unit < 2 ? Math.round(scaled) : Number(scaled.toFixed(1))} ${units[unit]}`;
}

function formatRate(value: number): string {
  return `${formatCapacity(value)}/s`;
}

function percent(used: number, total: number): number {
  return total > 0 ? Math.min(100, Number(((used / total) * 100).toFixed(1))) : 0;
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
  if (metric === "network" || metric === "disk") return formatRate(value);
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

interface OverviewViewProps {
  server: Server;
  autoRefresh: boolean;
  onOpenWebsites: () => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({ server, autoRefresh, onOpenWebsites }) => {
  const { runCommand } = useWorkbenchRuntime();
  const [metrics, setMetrics] = useState(EMPTY_METRICS);
  const [websites, setWebsites] = useState<{ count: number; partial: boolean } | null>(null);
  const [websiteScanFailed, setWebsiteScanFailed] = useState(false);
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
  const unsupported = server.os_type === "windows";

  const refresh = useCallback(async (silent = false) => {
    if (refreshing.current || unsupported) return;
    refreshing.current = true;
    setLoading(!silent);
    try {
      const result = await runCommand(SAMPLE_COMMAND);
      if (result.exitCode !== 0 && !result.stdout.trim()) throw new Error(result.stderr || "远程概述指标采集失败");
      const firstSample = previousMetrics.current === null;
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
          networkTx: parsed.networkTxRate,
          networkRx: parsed.networkRxRate,
          diskRead: parsed.diskReadRate,
          diskWrite: parsed.diskWriteRate,
        },
      ].slice(-300));
      // 网站配置扫描成本比指标采样高，只在进入概览和手动刷新时读取。
      if (!silent || firstSample) {
        try {
          setWebsites(await readWebsiteInventory(runCommand));
          setWebsiteScanFailed(false);
        } catch {
          setWebsiteScanFailed(true);
        }
      }
    } catch (error) {
      const text = getErrorMessage(error);
      setLastError(text);
    } finally {
      refreshing.current = false;
      setLoading(false);
    }
  }, [runCommand, unsupported]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh || unsupported) return;
    const timer = window.setInterval(() => void refresh(true), 5000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, refresh, unsupported]);

  const visibleSamples = useMemo(() => {
    const limits: Record<TrendRange, number> = { "1h": 60, "6h": 120, "1d": 240, "7d": 300 };
    return samples.slice(-limits[trendRange]);
  }, [samples, trendRange]);
  const selectedSample = hoveredIndex === null ? null : visibleSamples[hoveredIndex] ?? null;
  const latestSample = visibleSamples[visibleSamples.length - 1];
  const memoryPercent = percent(metrics.memoryUsed, metrics.memoryTotal);
  // 圆环标明对应挂载点，所有已采集分区都在下方单独展示。
  const primaryPartition = metrics.partitions.find(({ mount }) => mount === "/data")
    ?? metrics.partitions.find(({ mount }) => mount === "/")
    ?? metrics.partitions[0];
  const diskPercent = primaryPartition ? percent(primaryPartition.used, primaryPartition.total) : 0;
  const loadPercent = percent(metrics.load, metrics.cpuCores);

  const overviewCards = [
    { label: "运行容器", value: metrics.appCount, icon: <PackageCheck size={15} /> },
    { label: "数据库服务", value: metrics.dbCount, icon: <Database size={15} /> },
    { label: "用户计划任务", value: metrics.cronCount, icon: <Clock3 size={15} /> },
  ];
  const resources = [
    { label: "CPU", percent: metrics.cpuPercent, value: samples.length > 1 ? `${metrics.cpuPercent}%` : "—", detail: metrics.cpuCores > 0 ? `${samples.length > 1 ? (metrics.cpuPercent * metrics.cpuCores / 100).toFixed(1) : "—"} / ${metrics.cpuCores} 核` : "—" },
    { label: "内存", percent: memoryPercent, value: metrics.memoryTotal > 0 ? `${memoryPercent}%` : "—", detail: metrics.memoryTotal > 0 ? `${formatCapacity(metrics.memoryUsed * 1024 ** 2)} / ${formatCapacity(metrics.memoryTotal * 1024 ** 2)}` : "—" },
    { label: "负载", percent: loadPercent, value: metrics.loadText === "-" ? "—" : metrics.load.toFixed(2), detail: metrics.loadText === "-" ? "—" : `1 / 5 / 15 分钟 · ${metrics.loadText}` },
    { label: "磁盘", percent: diskPercent, value: primaryPartition ? `${diskPercent}%` : "—", detail: primaryPartition ? `${primaryPartition.mount} · 可用 ${formatCapacity(primaryPartition.available * 1024)}` : "—" },
  ];

  return (
    <div className="ops-workbench-overview">
      <Spin spinning={loading}>
        <div className="ops-workbench-overview-sections">
        {lastError && <Alert type="warning" showIcon message="概览采样失败" description={lastError} />}
        {unsupported && <Alert type="info" showIcon message="资源概览目前支持 Linux 主机。" />}
        <section className="workbench-overview-card">
          <div className="flex items-center justify-between gap-3">
            <h2 className="workbench-overview-title">概览</h2>
            <Button size="small" type="text" disabled={unsupported} loading={loading} icon={<RefreshCw size={13} />} onClick={() => void refresh()}>刷新状态</Button>
          </div>
          <div className="workbench-overview-stats">
            {overviewCards.map((card) => (
              <div key={card.label} className="workbench-overview-stat">
                <div>{card.icon}{card.label}</div>
                <strong data-empty={!latestSample || card.value === 0}>{latestSample ? card.value : "—"}</strong>
              </div>
            ))}
            <button
              type="button"
              className="workbench-overview-stat workbench-overview-link"
              onClick={onOpenWebsites}
              aria-label="打开当前主机的网站"
            >
              <span><Globe size={15} aria-hidden />网站 <ArrowRight size={14} aria-hidden /></span>
              <strong data-empty={websites == null || websites.count === 0}>
                {websites ? `${websites.count}${websites.partial ? "+" : ""}` : "—"}
              </strong>
              {(websiteScanFailed || websites?.partial) && (
                <small>{websiteScanFailed ? "扫描失败" : "部分站点未能读取"}</small>
              )}
            </button>
          </div>
        </section>

        <section className="workbench-overview-card">
          <h2 className="workbench-overview-title">状态</h2>
          <div className="workbench-overview-resources">
            {resources.map((resource) => (
              <div key={resource.label} className="workbench-overview-resource">
                <Progress
                  type="circle"
                  percent={resource.percent}
                  size={112}
                  strokeWidth={6}
                  strokeColor="var(--workbench-meter)"
                  trailColor="var(--workbench-track)"
                  format={() => (
                    <span className="workbench-overview-meter-label">
                      <strong>{resource.value}</strong>
                      <span>{resource.label}</span>
                    </span>
                  )}
                />
                <span>{resource.detail}</span>
              </div>
            ))}
          </div>
          <div className="workbench-overview-partitions">
            <h3>各分区</h3>
            {metrics.partitions.length > 0 ? (
              <div className="workbench-overview-partition-grid">
                {metrics.partitions.map((partition) => {
                  const usage = percent(partition.used, partition.total);
                  return (
                    <div key={partition.mount} className="workbench-overview-partition" data-warning={usage >= 85}>
                      <div className="workbench-overview-partition-label">
                        <div><strong>{partition.mount}</strong> <span>{partition.device}</span></div>
                        <span>可用 {formatCapacity(partition.available * 1024)} / 共 {formatCapacity(partition.total * 1024)}</span>
                        <b>{usage}%</b>
                      </div>
                      <div className="workbench-overview-bar" aria-hidden>
                        <div style={{ width: `${usage}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <p>暂无分区数据</p>}
          </div>
        </section>

        <section className="workbench-overview-card workbench-overview-host" aria-label="主机信息">
          <span><Laptop size={14} aria-hidden />主机名 <strong>{metrics.hostname}</strong></span>
          <span>系统 <strong>{metrics.os}</strong></span>
          <span>内核 <strong>{metrics.kernel}</strong></span>
          <span><Clock3 size={14} aria-hidden />运行 <strong>{metrics.uptime}</strong></span>
          <span>主机 IP <strong>{metrics.ip}</strong></span>
          <span>处理器 <strong>{metrics.cpuModel}</strong></span>
        </section>

        <section className="workbench-overview-card">
          <h2 className="workbench-overview-title">监控</h2>
          <div className="workbench-overview-monitor-grid">
            <MiniMetricChart
              title="网络流量"
              icon={<Network size={14} />}
              samples={visibleSamples}
              sampled={samples.length > 1}
              series={[["↑ 上行", "networkTx"], ["↓ 下行", "networkRx"]]}
              footer={latestSample ? `总发送 ${formatCapacity(metrics.networkTxTotal)} · 总接收 ${formatCapacity(metrics.networkRxTotal)}` : undefined}
            />
            <MiniMetricChart
              title="磁盘 I/O"
              icon={<HardDrive size={14} />}
              samples={visibleSamples}
              sampled={samples.length > 1}
              series={[["↓ 读", "diskRead"], ["↑ 写", "diskWrite"]]}
            />
          </div>
        </section>

        <section className="space-y-4 rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-2" style={{ borderColor: "var(--border)" }}>
            <div className="flex flex-wrap items-center gap-2"><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400"><TrendingUp size={15} /></span><span className="font-bold text-sm">历史趋势</span></div><div className="flex items-center gap-1 rounded-lg border p-0.5 text-xs" style={{ borderColor: "var(--border)", background: "var(--surface-950)" }}>{(Object.keys(TREND_META) as TrendMetric[]).map((key) => <button key={key} type="button" onClick={() => { setTrendMetric(key); setHoveredIndex(null); }} className={`rounded-md px-2.5 py-1 transition ${trendMetric === key ? "bg-teal-500/15 text-teal-300" : "text-slate-400 hover:text-white"}`}>{TREND_META[key].label}</button>)}</div></div>
            <div className="flex flex-wrap items-center gap-2 text-xs"><div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ borderColor: "var(--border)", background: "var(--surface-950)" }}>{(["single", "grid4"] as TrendLayout[]).map((layout) => <button key={layout} type="button" onClick={() => setTrendLayout(layout)} className={`rounded px-2 py-1 ${trendLayout === layout ? "bg-surface-800 text-teal-300" : "text-slate-400 hover:text-white"}`}>{layout === "single" ? "单图" : "四分图"}</button>)}</div><div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ borderColor: "var(--border)", background: "var(--surface-950)" }}>{(["1h", "6h", "1d", "7d"] as TrendRange[]).map((range) => <button key={range} type="button" onClick={() => setTrendRange(range)} className={`rounded px-2 py-1 ${trendRange === range ? "bg-surface-800 text-teal-300" : "text-slate-400 hover:text-white"}`}>{range}</button>)}</div><Button size="small" type="text" icon={<RefreshCw size={13} />} onClick={() => void refresh()} aria-label="刷新趋势" /></div>
          </div>
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
          <div className="px-1 font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>{autoRefresh && !unsupported ? "每 5 秒刷新" : "自动刷新已关闭"} · 当前样本 {visibleSamples.length} · 范围 {trendRange}</div>
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

type MonitorMetric = "networkTx" | "networkRx" | "diskRead" | "diskWrite";

interface MiniMetricChartProps {
  title: string;
  icon: React.ReactNode;
  samples: Sample[];
  sampled: boolean;
  series: [string, MonitorMetric][];
  footer?: string;
}

function MiniMetricChart({ title, icon, samples, sampled, series, footer }: MiniMetricChartProps) {
  const latestSample = samples[samples.length - 1];
  const maxValue = Math.max(1, ...samples.flatMap((sample) => series.map(([, metric]) => sample[metric])));
  return (
    <div className="workbench-overview-monitor">
      <div className="workbench-overview-monitor-legend">
        <h3>{icon}{title}</h3>
        {series.map(([label, metric]) => (
          <span key={metric} data-metric={metric}>{label} {sampled && latestSample ? formatRate(latestSample[metric]) : "—"}</span>
        ))}
      </div>
      <div className="workbench-overview-chart">
        {sampled && samples.length > 1 ? (
          <svg viewBox="0 0 500 60" preserveAspectRatio="none" role="img" aria-label={`${title}趋势`}>
            {series.map(([, metric]) => {
              const points = samples.map((sample, index) => {
                const x = (index / (samples.length - 1)) * 500;
                const y = 58 - (sample[metric] / maxValue) * 55;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
              }).join(" ");
              return (
                <g key={metric} data-metric={metric}>
                  <polygon fill="currentColor" opacity=".08" points={`0,60 ${points} 500,60`} />
                  <polyline fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" points={points} />
                </g>
              );
            })}
          </svg>
        ) : <span>等待采样数据</span>}
      </div>
      {footer && <p>{footer}</p>}
    </div>
  );
}
