import { invoke } from "@tauri-apps/api/core";
import type { SshCredentials } from "@/types";

export interface WorkbenchCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface WorkbenchCommandRequest extends SshCredentials {
  serverId: number;
  command: string;
}

export const workbenchApi = {
  execute: (request: WorkbenchCommandRequest) =>
    invoke<WorkbenchCommandResult>("execute_workbench_command", { request }),
};
