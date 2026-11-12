/**
 * 顶栏告警铃铛。
 *
 * 原型行为很简单：显示活跃告警数角标，点击跳到告警页。
 * 这里的角标数暂由 store 提供（告警模块未实现，固定为原型的 2），
 * 等告警规则落地后改成订阅真实数据即可，组件本身不用动。
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { Bell } from "lucide-react";
import { useAppStore } from "@/store/app";
import { alertsApi } from "@/lib/api/alerts";
import { copilotApi } from "@/lib/api/copilot";

export function AlertBell() {
  const navigate = useNavigate();
  const count = useAppStore((s) => s.activeAlertCount);
  const setActiveAlertCount = useAppStore((s) => s.setActiveAlertCount);
  const [pendingApprovalIds, setPendingApprovalIds] = useState<number[]>([]);

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

  const approvalCount = pendingApprovalIds.length;
  const totalCount = count + approvalCount;
  const title = approvalCount > 0
    ? `${approvalCount} 个待审批操作${count > 0 ? `，${count} 个活跃告警` : ""}`
    : count > 0 ? `${count} 个活跃告警待处理` : "暂无待处理通知";

  return (
    <button
      type="button"
      onClick={() => navigate(approvalCount > 0 ? `/copilot?approvalId=${pendingApprovalIds[0]}` : "/alerts")}
      className="header-icon-btn"
      title={title}
      aria-label={title}
      style={{ position: "relative" }}
    >
      <Bell size={16} />
      {totalCount > 0 && (
        <span
          className="flex items-center justify-center"
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            minWidth: 16,
            height: 16,
            padding: "0 4px",
            borderRadius: 9999,
            background: "#f43f5e",
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            lineHeight: 1,
            boxShadow: "0 0 12px rgba(244, 63, 94, 0.4)",
          }}
        >
          {totalCount > 99 ? "99+" : totalCount}
        </span>
      )}
    </button>
  );
}
