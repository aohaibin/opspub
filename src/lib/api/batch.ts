import { invoke } from "@tauri-apps/api/core";

export interface BatchTargetResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export const batchApi = {
  executeTarget: (serverId: number, command: string, timeoutSecs: number) =>
    invoke<BatchTargetResult>("execute_batch_target", {
      request: { serverId, command, timeoutSecs },
    }),
};
