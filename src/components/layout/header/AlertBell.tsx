/**
 * 工作区通知入口与待处理计数。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { Bell } from "lucide-react";
import { message } from "antd";
import { useSettingsStore } from "@/store/settings";
import { latestAlerts, useAlertsStore } from "@/store/alerts";
import { getErrorMessage } from "@/lib/api/client";
import { copilotApi } from "@/lib/api/copilot";

export function AlertBell({ active }: { active: boolean }) {
  const locationKey = useLocation().key;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const english = useSettingsStore((s) => s.language) === "en-US";
  const events = useAlertsStore((s) => s.events);
  const readIds = useAlertsStore((s) => s.readIds);
  const loaded = useAlertsStore((s) => s.loaded);
  const refresh = useAlertsStore((s) => s.refresh);
  const refreshError = useAlertsStore((s) => s.error);
  const markRead = useAlertsStore((s) => s.markRead);
  const [pendingApprovalIds, setPendingApprovalIds] = useState<number[]>([]);

  // 从其他入口导航时收起浮层，避免浏览器返回后自动打开上一次的通知面板。
  useEffect(() => setOpen(false), [locationKey]);

  useEffect(() => {
    let disposed = false;

    let approvalRequest = 0;
    const refreshApprovals = async () => {
      const request = ++approvalRequest;
      try {
        const approvals = await copilotApi.listApprovals();
        if (disposed || request !== approvalRequest) return;
        setPendingApprovalIds(
          approvals
            .filter((approval) => approval.status === "pending")
            .map((approval) => approval.id),
        );
      } catch {
        // Keep the last successful count during a temporary approval read failure.
      }
    };
    const refreshCount = () => {
      void refresh();
      void refreshApprovals();
    };
    void refreshCount();
    const timer = window.setInterval(() => void refreshCount(), 15_000);
    let stop: (() => void) | undefined;
    void listen("copilot-approval-changed", () => { if (!disposed) void refreshApprovals(); })
      .then((unlisten) => { if (disposed) unlisten(); else stop = unlisten; })
      .catch(() => undefined);
    return () => { disposed = true; stop?.(); window.clearInterval(timer); };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    function dismissOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const focusIsInside = rootRef.current?.contains(document.activeElement);
      setOpen(false);
      if (focusIsInside) buttonRef.current?.focus();
    }
    window.addEventListener("pointerdown", dismissOutside);
    window.addEventListener("keydown", dismissOnEscape);
    return () => {
      window.removeEventListener("pointerdown", dismissOutside);
      window.removeEventListener("keydown", dismissOnEscape);
    };
  }, [open]);

  const unread = useMemo(() => latestAlerts(events.filter((event) => !readIds.has(event.id))), [events, readIds]);
  const count = unread.length;
  const approvalCount = pendingApprovalIds.length;
  const totalCount = count + approvalCount;
  const title = english ? "Alerts & notifications" : "通知与告警";
  const firstApprovalId = pendingApprovalIds[0];
  const readAlerts = (ids: string[]) => {
    try { markRead(ids, true); }
    catch (error) { message.error(getErrorMessage(error)); }
  };

  return (
    <div ref={rootRef} className="workspace-notifications">
      <button
        ref={buttonRef}
        type="button"
        className="workspace-dock-button"
        data-domain="alerts"
        title={title}
        aria-label={totalCount > 0 ? `${title} (${totalCount})` : title}
        aria-expanded={open}
        aria-controls="workspace-notification-panel"
        data-active={active}
        onClick={() => {
          if (!open) void refresh();
          setOpen(!open);
        }}
      >
        <Bell size={19} aria-hidden />
        {totalCount > 0 && (
          <span className="workspace-notification-count" aria-hidden>
            {totalCount > 99 ? "99+" : totalCount}
          </span>
        )}
      </button>
      {open && (
        <section className="workspace-notification-panel" id="workspace-notification-panel" aria-label={title}>
          <header className="workspace-notification-heading">
            <h2>{title}</h2>
            <button type="button" disabled={!count} onClick={() => readAlerts(unread.map((event) => event.id))}>
              {english ? "Mark alerts as read" : "告警全部已读"}
            </button>
          </header>
          {refreshError && <p role="status">{english ? "Could not refresh alerts" : "告警刷新失败"}</p>}
          {!loaded && !refreshError && <p>{english ? "Loading alerts" : "正在读取告警"}</p>}
          {loaded && !refreshError && totalCount === 0 && <p>{english ? "No unread notifications" : "暂无未读通知"}</p>}
          {firstApprovalId !== undefined && (
            <Link to={`/copilot?approvalId=${firstApprovalId}`} onClick={() => setOpen(false)}>
              {english ? `Pending approvals (${approvalCount})` : `待处理审批 (${approvalCount})`}
            </Link>
          )}
          {count > 0 && <div className="workspace-notification-events">
            {unread.slice(0, 5).map((event) => <Link
              key={event.id}
              className="workspace-notification-event"
              data-severity={event.severity}
              to={`/alerts?${new URLSearchParams({ status: "all", eventId: event.id })}`}
              onClick={() => { readAlerts([event.id]); setOpen(false); }}
            >
              <strong>{event.summary}</strong>
              <small>{event.serverAlias} · {new Date(event.lastSeenAt).toLocaleString()}</small>
            </Link>)}
          </div>}
          {count > 5 && <Link to="/alerts?status=all&read=unread">{english ? "View all unread alerts" : "查看全部未读告警"}</Link>}
          <Link to="/alerts" onClick={() => setOpen(false)}>
            {english ? `Alert center (${count})` : `进入告警中心 (${count})`}
          </Link>
        </section>
      )}
    </div>
  );
}
