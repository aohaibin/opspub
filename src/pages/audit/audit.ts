import type { AuditLog } from "@/types";
import { projectSensitiveFields } from "@/lib/sensitive-projection";

export const PAGE_SIZES = [20, 50, 100];
export const DEFAULT_PAGE_SIZE = 50;
// 与现有 get_audit_logs_page 接受的最大 offset 一致。
export const MAX_OFFSET = 1_000_000;

export const SOURCE_LABELS = {
  copilot: "内置助手",
  mcp: "MCP 调用",
  batch: "批量执行",
  terminal: "终端 / SFTP",
  human: "人工操作",
  system: "系统",
  other: "其他",
};

export const VERDICTS = {
  success: { label: "已完成", tone: "var(--success)" },
  approved: { label: "已批准", tone: "var(--success)" },
  pending: { label: "待审批", tone: "var(--info)" },
  running: { label: "已发起", tone: "var(--info)" },
  blocked: { label: "已拦截", tone: "var(--danger)" },
  rejected: { label: "已拒绝", tone: "var(--warning)" },
  failed: { label: "失败", tone: "var(--danger)" },
  expired: { label: "已超时", tone: "var(--warning)" },
  other: { label: "已记录", tone: "var(--text-secondary)" },
};

export type AuditSource = keyof typeof SOURCE_LABELS;
export type Verdict = keyof typeof VERDICTS;

function sourceOf(user: string): AuditSource {
  const value = user.toLowerCase();
  if (value.includes("copilot")) return "copilot";
  if (value.includes("mcp")) return "mcp";
  if (value.includes("batch")) return "batch";
  if (/terminal|ssh|sftp/.test(value)) return "terminal";
  if (value === "human") return "human";
  if (value.includes("system")) return "system";
  return "other";
}

function verdictOf(result: string): Verdict {
  // 只识别结果开头的状态码，原因或输出中的关键词不能改变裁决。
  const value = result.trim().toLowerCase();
  const exit = /^exit(?:\s*[=:]\s*|\s+)(-?\d+)\b/.exec(value);
  if (exit) return Number(exit[1]) === 0 ? "success" : "failed";
  const status = /^\[?([a-z_]+)/.exec(value)?.[1] ?? "";
  if (/^(?:pending|pending_approval|queued)$/.test(status)) return "pending";
  if (/^(?:approved)$/.test(status)) return "approved";
  if (/^(?:reject|rejected)$/.test(status) || /^已拒绝/.test(value)) return "rejected";
  if (/^(?:block|blocked|denied|locked)$/.test(status) || /^(?:拦截|阻止|已拦截)/.test(value)) return "blocked";
  if (/^(?:expired|approval_timeout|timeout)$/.test(status) || /^已超时/.test(value)) return "expired";
  if (/(?:^|_)(?:fail|failed|error|panic)$/.test(status)) return "failed";
  if (/(?:^|_)(?:success|completed|passed|ok)$/.test(status)) return "success";
  if (/(?:^|_)(?:started|dispatched|requested|executing)$/.test(status)) return "running";
  return "other";
}

export function prepareAuditRow(log: AuditLog) {
  const { id, created_at: createdAt } = log;
  const [actor, server, command, result] = projectSensitiveFields([log.user, log.server_alias, log.command, log.result]);
  const source = sourceOf(actor);
  const tool = /^(?:tools\/call\s+)?([\w.-]+)/.exec(command.trim())?.[1] ?? "unknown";
  // 只接受 MCP 待审批日志写入器生成的字段顺序，避免把任意回显当作关联键。
  const taskId = actor === "mcp"
    ? /^pending_approval task_id=([\w-]+) token_id=\d+ client=/.exec(result)?.[1]
    : undefined;
  return {
    id, createdAt, actor, server, command, result, source, tool, taskId,
    verdict: verdictOf(result),
    batch: source === "batch" || /(?:batch|_multi|multi_exec|parallel)/i.test(`${actor} ${command}`),
    redacted: [actor, server, command, result].some((field) => /\[REDACTED(?::[^\]]*)?\]/i.test(field)),
  };
}

export type AuditRow = ReturnType<typeof prepareAuditRow>;

export const EMPTY_FILTERS = {
  tool: "", verdict: "", source: "", server: "", start: "", end: "", search: "", collapse: false,
};

export function filterAuditRows(rows: AuditRow[], filters: typeof EMPTY_FILTERS, batch: boolean) {
  const needle = filters.search.trim().toLowerCase();
  const seen = new Set<string>();
  return rows.filter((row) => {
    const date = row.createdAt.slice(0, 10);
    if ((batch && !row.batch)
      || (filters.tool && row.tool !== filters.tool)
      || (filters.verdict && row.verdict !== filters.verdict)
      || (filters.source && row.source !== filters.source)
      || (filters.server && row.server !== filters.server)
      || (filters.start && date < filters.start)
      || (filters.end && date > filters.end)
      || (needle && !`${row.id} ${row.command} ${row.result} ${row.actor} ${row.server} ${SOURCE_LABELS[row.source]}`.toLowerCase().includes(needle))) return false;
    if (!filters.collapse) return true;
    const signature = JSON.stringify([row.server, row.actor, row.command, row.result]);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}
