export interface CopilotRequest {
  message: string;
  serverId?: number | null;
  provider?: string;
  modelProfileId?: string | null;
  skillIds?: string[];
  skillContext?: string | null;
  history?: CopilotHistoryMessage[];
}

export interface CopilotHistoryMessage {
  role: "user" | "assistant";
  content: string;
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

import type { ActionRiskLevel } from "./policy";

export interface ActionPlanTarget {
  serverId: number;
  serverAlias: string;
  role: string;
  status: string;
}

export interface VerificationStep {
  id: string;
  label: string;
  command: string;
  expectedResult: string;
  required: boolean;
}

export interface ActionPlan {
  id: string;
  conversationId: string | null;
  action: string;
  summary: string;
  originalRequest: string;
  originalCommand: string;
  normalizedCommand: string;
  commandSha256: string;
  ruleVersion: string;
  risk: {
    level: ActionRiskLevel;
    reason: string;
    matchedRules: string[];
    requiresApproval: boolean;
  };
  targets: ActionPlanTarget[];
  verificationSteps: VerificationStep[];
  status: string;
  expiresAt: number;
  createdAt: number;
}

export interface AiApprovalDetail {
  approval: AiApproval;
  plan: ActionPlan | null;
}

export interface CopilotResponse {
  reply: string;
  toolCalls: CopilotToolCall[];
  warnings: string[];
  modelName?: string | null;
  historyTrimmed: number;
}

export interface CopilotProgress {
  stage: string;
  message: string;
  serverAlias: string | null;
  completed: boolean;
}
