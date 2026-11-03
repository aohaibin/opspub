import { invoke } from "@tauri-apps/api/core";
import type { AiApproval, AiApprovalDetail, AiLockState, CopilotRequest, CopilotResponse } from "@/types";

export const copilotApi = {
  chat: (request: CopilotRequest) => invoke<CopilotResponse>("copilot_chat", { request }),
  explainCommand: (profileId: string, commandText: string) => invoke<string>("explain_copilot_command", { profileId, commandText }),
  getLock: () => invoke<AiLockState>("get_ai_lock"),
  setLock: (duration: "locked" | "30m" | "2h" | "1d" | "forever") => invoke<AiLockState>("set_ai_lock", { duration }),
  listApprovals: () => invoke<AiApproval[]>("list_ai_approvals"),
  listApprovalDetails: () => invoke<AiApprovalDetail[]>("list_ai_approval_details"),
  rejectApproval: (id: number, reason = "人工审批驳回") => invoke<void>("reject_ai_approval", { id, reason }),
  approveApproval: (id: number) => invoke<AiApproval>("approve_ai_approval", { id }),
};
