import type { SshCredentials } from "./server";

export interface TerminalOpenRequest extends SshCredentials {
  serverId: number;
}

export type TerminalSessionStatus = "connecting" | "connected" | "closed" | "error";

export interface TerminalSessionInfo {
  sessionId: string;
  serverId: number;
  status: TerminalSessionStatus;
  startedAt: string;
  output: string;
  message: string;
}

export interface TerminalOutputEvent {
  sessionId: string;
  data: string;
}

export interface TerminalStatusEvent {
  sessionId: string;
  status: TerminalSessionStatus;
  message: string;
}
