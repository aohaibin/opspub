import { invoke } from "@tauri-apps/api/core";
import type { AiApproval, AiLockState, CopilotRequest, CopilotResponse } from "@/types";

export const copilotApi = {
  chat: (request: CopilotRequest) => invoke<CopilotResponse>("copilot_chat", { request }),
  getLock: () => invoke<AiLockState>("get_ai_lock"),
  setLock: (duration: "locked" | "30m" | "2h" | "1d" | "forever") => invoke<AiLockState>("set_ai_lock", { duration }),
  listApprovals: () => invoke<AiApproval[]>("list_ai_approvals"),
  rejectApproval: (id: number, reason = "人工审批驳回") => invoke<void>("reject_ai_approval", { id, reason }),
  approveApproval: (id: number) => invoke<AiApproval>("approve_ai_approval", { id }),
};
