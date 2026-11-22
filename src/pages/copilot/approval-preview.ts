import { createStore } from "zustand/vanilla";
import type { AiApprovalDetail } from "@/types";

export interface ApprovalRequestOwner {
  sessionId: string;
  requestId: string;
}

export interface ApprovalPreview {
  detail: AiApprovalDetail;
  owner: ApprovalRequestOwner | null;
}

export function visibleApprovalPreview(preview: ApprovalPreview | null, activeSessionId: string) {
  return preview?.owner && preview.owner.sessionId !== activeSessionId ? null : preview;
}

export function createApprovalPreviewStore() {
  const store = createStore<ApprovalPreview | null>(() => null);
  const close = () => store.setState(null, true);
  const open = (detail: AiApprovalDetail, owner: ApprovalRequestOwner | null) => {
    store.setState({ detail, owner }, true);
  };
  const openFromRequest = (detail: AiApprovalDetail, owner: ApprovalRequestOwner, activeSessionId: string) => {
    // 后台请求仍可刷新待审列表，自动预览只能占用当前会话的空闲弹窗。
    if (owner.sessionId !== activeSessionId || visibleApprovalPreview(store.getState(), activeSessionId)) return false;
    open(detail, owner);
    return true;
  };
  const reviewedApprovalId = (preview: ApprovalPreview, activeSessionId: string) => {
    return visibleApprovalPreview(store.getState(), activeSessionId) === preview ? preview.detail.approval.id : null;
  };

  return { ...store, open, openFromRequest, close, reviewedApprovalId };
}
