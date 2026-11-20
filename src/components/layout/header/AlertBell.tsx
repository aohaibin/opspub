/**
 * 工作区通知入口与待处理计数。
 */

import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { Bell } from "lucide-react";
import { useAppStore } from "@/store/app";
import { useSettingsStore } from "@/store/settings";
import { alertsApi } from "@/lib/api/alerts";
import { copilotApi } from "@/lib/api/copilot";

export function AlertBell({ active }: { active: boolean }) {
  const locationKey = useLocation().key;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const english = useSettingsStore((s) => s.language) === "en-US";
  const count = useAppStore((s) => s.activeAlertCount);
  const setActiveAlertCount = useAppStore((s) => s.setActiveAlertCount);
  const [pendingApprovalIds, setPendingApprovalIds] = useState<number[]>([]);

  // 从其他入口导航时收起浮层，避免浏览器返回后自动打开上一次的通知面板。
  useEffect(() => setOpen(false), [locationKey]);

  useEffect(() => {
    let disposed = false;

    const refreshCount = async () => {
      const [alertsResult, approvalsResult] = await Promise.allSettled([
        alertsApi.getEvents(),
        copilotApi.listApprovals(),
      ]);
      if (disposed) return;
      if (alertsResult.status === "fulfilled") {
        setActiveAlertCount(alertsResult.value.filter((event) => event.status !== "resolved").length);
      }
      if (approvalsResult.status === "fulfilled") {
        setPendingApprovalIds(
          approvalsResult.value
            .filter((approval) => approval.status === "pending")
            .map((approval) => approval.id),
        );
      }
    };

    void refreshCount();
    const timer = window.setInterval(() => void refreshCount(), 15_000);
    let stop: (() => void) | undefined;
    void listen("copilot-approval-changed", () => { if (!disposed) void refreshCount(); })
      .then((unlisten) => { if (disposed) unlisten(); else stop = unlisten; })
      .catch(() => undefined);
    return () => { disposed = true; stop?.(); window.clearInterval(timer); };
  }, [setActiveAlertCount]);

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

  const approvalCount = pendingApprovalIds.length;
  const totalCount = count + approvalCount;
  const title = english ? "Alerts & notifications" : "通知与告警";
  const firstApprovalId = pendingApprovalIds[0];

  return (
    <div ref={rootRef} className="workspace-notifications">
      <button
        ref={buttonRef}
        type="button"
        className="workspace-dock-button"
        title={title}
        aria-label={totalCount > 0 ? `${title} (${totalCount})` : title}
        aria-expanded={open}
        aria-controls="workspace-notification-panel"
        data-active={active}
        onClick={() => setOpen((current) => !current)}
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
          <h2>{title}</h2>
          {totalCount === 0 && <p>{english ? "No pending notifications" : "暂无待处理通知"}</p>}
          {firstApprovalId !== undefined && (
            <Link to={`/copilot?approvalId=${firstApprovalId}`} onClick={() => setOpen(false)}>
              {english ? `Pending approvals (${approvalCount})` : `待处理审批 (${approvalCount})`}
            </Link>
          )}
          <Link to="/alerts" onClick={() => setOpen(false)}>
            {english ? `Alert center (${count})` : `进入告警中心 (${count})`}
          </Link>
        </section>
      )}
    </div>
  );
}
