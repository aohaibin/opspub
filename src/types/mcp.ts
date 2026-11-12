export interface McpStatus {
  endpointState: "ready" | "not_started" | "start_failed" | "health_failed";
  protocolVersion: string;
  version: string;
  stdioPath: string;
  httpUrl: string;
  httpPort: number;
  httpRunning: boolean;
  stdioReady: boolean;
  inProcessReady: boolean;
  httpStartedAt: string | null;
  endpointMessage: string;
  endpointError: string | null;
  lastTestedAt: string | null;
  message: string;
}

export interface McpToken {
  id: number;
  name: string;
  client: string;
  serverScope: string;
  toolScope: string;
  expiresAt: string | null;
  status: "active" | "revoked" | string;
  tokenHint: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface McpTokenInput {
  name: string;
  client: string;
  serverScope: string;
  toolScope: string;
  expiresAt?: string | null;
}

export interface McpTokenCreated {
  token: McpToken;
  secret: string;
}

export interface McpClientConfig {
  client: string;
  path: string;
  format: string;
  content: string;
  backupPath: string | null;
}

export interface McpClientState {
  client: string;
  path: string;
  state: "unconfigured" | "configured" | "outdated" | "invalid";
  message: string;
  tokenId: number | null;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpTokenTest {
  tools: string[];
  toolCallVerified: boolean;
  testedTool: string | null;
  latencyMs: number;
  testedAt: string;
  message: string;
}

export type McpTaskStatus =
  | "draft"
  | "pending_approval"
  | "queued"
  | "executing"
  | "verifying"
  | "succeeded"
  | "failed"
  | "rejected"
  | "expired"
  | "cancelled"
  | "unknown";

export interface McpSkillReference {
  id: string;
  name: string;
  version: string;
  description: string;
  triggers: string[];
  contentAvailable: boolean;
  trust: "untrusted_reference_only" | string;
}

export type McpTaskStepStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "unknown";

export interface McpTaskStep {
  id: string;
  sequence: number;
  kind: string;
  targetServerId: number | null;
  status: McpTaskStepStatus;
  inputSha256: string;
  result: string | null;
  exitCode: number | null;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface McpOperationTask {
  id: string;
  tokenId: number;
  sourceClient: string;
  idempotencyKey: string;
  requestSha256: string;
  planId: string | null;
  summary: string;
  status: McpTaskStatus;
  errorCode: string | null;
  result: string | null;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  skillIds: string[];
  steps: McpTaskStep[];
}
