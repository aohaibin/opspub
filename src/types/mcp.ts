export interface McpStatus {
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
}
