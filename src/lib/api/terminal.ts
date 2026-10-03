import { invoke } from "@tauri-apps/api/core";
import type { TerminalOpenRequest, TerminalSessionInfo } from "@/types";

export const TERMINAL_OUTPUT_EVENT = "terminal-output";
export const TERMINAL_STATUS_EVENT = "terminal-status";

export const terminalApi = {
  open: (request: TerminalOpenRequest) =>
    invoke<TerminalSessionInfo>("open_terminal_session", { request }),

  list: () => invoke<TerminalSessionInfo[]>("list_terminal_sessions"),

  closeAll: () => invoke<void>("close_all_terminal_sessions"),

  write: (sessionId: string, data: string) =>
    invoke<void>("write_terminal_session", { sessionId, data }),

  resize: (sessionId: string, cols: number, rows: number) =>
    invoke<void>("resize_terminal_session", { sessionId, cols, rows }),

  close: (sessionId: string) =>
    invoke<void>("close_terminal_session", { sessionId }),
};
