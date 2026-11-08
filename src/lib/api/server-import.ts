import { invoke } from "./client";
import type { AIPolicy, AuthType } from "@/types";

export type ServerImportSource = "ssh_config" | "finalshell" | "spreadsheet";
export interface ServerImportRow {
  index: number;
  alias: string;
  hostname: string;
  port: number;
  username: string;
  group: string;
  tags: string[];
  osType: string;
  protocol: string;
  authType: string;
  hasPassword: boolean;
  error: string | null;
  warning: string | null;
}
export interface ServerImportPreview {
  token: string;
  path: string;
  rows: ServerImportRow[];
  warnings: string[];
}
export interface ServerImportOutcome {
  index: number;
  alias: string;
  serverId: number | null;
  error: string | null;
}
export const serverImportApi = {
  preview: (source: ServerImportSource, path?: string) => invoke<ServerImportPreview>("preview_server_import", { request: { source, path } }),
  commit: (token: string, indices: number[], aiPolicy: AIPolicy, defaultAuthType: AuthType) => invoke<ServerImportOutcome[]>("commit_server_import", { request: { token, indices, aiPolicy, defaultAuthType } }),
  discard: (token: string) => invoke<void>("discard_server_import", { token }),
  saveTemplate: (path: string) => invoke<void>("save_server_import_template", { path }),
  openRemoteDesktop: (serverId: number) => invoke<void>("open_server_remote_desktop", { serverId }),
};
