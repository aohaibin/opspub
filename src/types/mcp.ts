export interface McpStatus {
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
  latencyMs: number;
  testedAt: string;
  message: string;
}
