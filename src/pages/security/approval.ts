import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { copilotApi } from "@/lib/api/copilot";
import type { AiApproval, AiApprovalDetail } from "@/types";

export const statusLabel: Record<AiApproval["status"], string> = {
  pending: "待审批",
  rejected: "已拒绝",
  expired: "已超时",
  executing: "执行中",
  completed: "已完成",
  failed: "执行失败",
  unknown: "状态未知",
};

export const statusColor: Record<AiApproval["status"], string> = {
  pending: "warning", rejected: "error", expired: "default", executing: "processing",
  completed: "success", failed: "error", unknown: "purple",
};

export function formatTime(timestamp: number | null) {
  return timestamp ? new Date(timestamp * 1000).toLocaleString("zh-CN", { hour12: false }) : "—";
}

export function canDecide(approval: AiApproval, now = Date.now()) {
  return approval.status === "pending" && approval.expiresAt * 1000 > now;
}

export function remaining(expiresAt: number, now: number) {
  const seconds = Math.max(0, Math.ceil((expiresAt * 1000 - now) / 1000));
  return `剩余 ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// 审批预览保留可核对的命令结构，并遮住常见凭据参数与密钥块。
export function displayApprovalText(text: string) {
  return text
    .replace(/-----BEGIN [^-\r\n]+-----[\s\S]*?(?:-----END [^-\r\n]+-----|$)/g, "[REDACTED]")
    .replace(/(\b(?:password|passwd|passphrase|token|secret|api[_-]?key|private[_-]?key)["']?\s*[=:]\s*|(?:^|\s)(?:-p|--password|--token|--secret|--api-key)(?:\s+|=))(?:"(?:\\.|[^"\\\r\n])*(?:"|(?=\r?$))|'[^'\r\n]*(?:'|(?=\r?$))|[^\s,;]+)/gim, "$1[REDACTED]")
    .replace(/(\b(?:Bearer|Basic)\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]")
    .replace(/(:\/\/[^\s:/@]+:)[^\s@/]+(@)/g, "$1[REDACTED]$2");
}

export function useApprovalQueue() {
  const [rows, setRows] = useState<AiApprovalDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(Date.now);
  const request = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    try {
      const next = await copilotApi.listApprovalDetails();
      if (id !== request.current) return;
      setRows(next);
      setFailed(false);
    } catch {
      if (id === request.current) setFailed(true);
    } finally {
      if (id === request.current) {
        setNow(Date.now());
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    void refresh();
    void listen("copilot-approval-changed", () => { if (!disposed) void refresh(); })
      .then((unlisten) => { if (disposed) unlisten(); else stop = unlisten; })
      .catch(() => undefined);
    const poll = window.setInterval(() => void refresh(), 30_000);
    return () => {
      disposed = true;
      request.current += 1;
      stop?.();
      window.clearInterval(poll);
    };
  }, [refresh]);

  useEffect(() => {
    const received = Date.now();
    const nextExpiry = Math.min(...rows
      .filter(({ approval }) => canDecide(approval, received))
      .map(({ approval }) => approval.expiresAt * 1000));
    if (!Number.isFinite(nextExpiry)) return;
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const expiry = window.setTimeout(() => {
      setNow(Date.now());
      void refresh();
    }, nextExpiry - received);
    return () => {
      window.clearInterval(clock);
      window.clearTimeout(expiry);
    };
  }, [rows, refresh]);

  const applyDecision = (updated: AiApproval) => {
    setRows((current) => current.map((row) => (
      row.approval.id === updated.id ? { ...row, approval: updated } : row
    )));
  };

  // 本地时钟只负责即时禁用；下次读取会以 Rust 返回的状态与结果为准。
  const details = rows.map((row) => (
    row.approval.status === "pending" && !canDecide(row.approval, now)
      ? { ...row, approval: { ...row.approval, status: "expired" as const } }
      : row
  ));

  return { details, now, loading, failed, refresh, applyDecision };
}
