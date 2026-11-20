import type { SshCredentials } from "./server";

export interface TerminalOpenRequest extends SshCredentials {
  serverId: number;
}

export type TerminalSessionStatus = "connecting" | "connected" | "closing" | "closed" | "error";

export interface TerminalSessionInfo {
  sessionId: string;
  serverId: number;
  status: TerminalSessionStatus;
  startedAt: string;
  output: string;
  /** 快照已覆盖的最后一个输出事件。 */
  outputSequence: number;
  message: string;
}

export interface TerminalOutputEvent {
  sessionId: string;
  data: string;
  sequence: number;
}

export interface TerminalStatusEvent {
  sessionId: string;
  status: TerminalSessionStatus;
  message: string;
}
