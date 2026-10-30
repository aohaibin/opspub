import type { BatchTargetResult } from "@/lib/api/batch";
import type { Server } from "@/types";

export type Mode = "concurrent" | "rolling" | "serial";
export interface RunRow {
  server: Server;
  status: "queued" | "running" | "success" | "failed" | "skipped";
  result?: BatchTargetResult;
  error?: string;
  attempts: number;
}

export const PRESETS = [
  { label: "巡检: 磁盘+内存+负载", command: "df -h -x tmpfs -x devtmpfs && free -h && uptime" },
  { label: "nginx 状态", command: "systemctl status nginx --no-pager" },
  { label: "TOP 10 CPU 进程", command: "ps aux --sort=-%cpu | head -n 11" },
  { label: "最近 50 行日志", command: "journalctl -n 50 --no-pager" },
  { label: "端口占用", command: "ss -tulpn" },
];

export function formatResult(row: RunRow, command: string): string {
  return [
    `${row.server.alias} (${row.server.hostname})`, `$ ${command}`,
    row.result?.stdout, row.result?.stderr ? `STDERR:\n${row.result.stderr}` : "",
    row.error ? `ERROR:\n${row.error}` : "",
    row.result ? `EXIT ${row.result.exitCode} · ${row.result.durationMs}ms` : "",
  ].filter(Boolean).join("\n");
}
