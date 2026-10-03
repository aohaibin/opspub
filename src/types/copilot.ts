export interface CopilotRequest {
  message: string;
  serverId?: number | null;
  provider?: string;
}

export interface CopilotToolCall {
  tool: string;
  serverAlias: string | null;
  status: "success" | "failed" | "blocked" | "skipped" | "pending";
  output: string;
  approvalId?: number | null;
}

export interface AiLockState {
  locked: boolean;
  unlockUntil: number | null;
}

export interface AiApproval {
  id: number;
  serverId: number;
  serverAlias: string;
  action: string;
  command: string;
  status: "pending" | "rejected" | "expired" | "executing" | "completed" | "failed" | "unknown";
  requestedAt: number;
  expiresAt: number;
  decidedAt: number | null;
  finishedAt: number | null;
  result: string;
}

export interface CopilotResponse {
  reply: string;
  toolCalls: CopilotToolCall[];
  warnings: string[];
}

export interface CopilotProgress {
  stage: string;
  message: string;
  serverAlias: string | null;
  completed: boolean;
}
