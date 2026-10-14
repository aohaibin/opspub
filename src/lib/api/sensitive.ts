import { invoke } from "@tauri-apps/api/core";
import type {
  SensitiveEntry,
  SensitiveListFilter,
  SensitiveScanRequest,
  SensitiveScanResult,
  SensitiveStatus,
} from "@/types/sensitive";

const normalizeFilter = (filter: SensitiveListFilter) => ({
  serverId: filter.serverId ?? null,
  status: filter.status ?? null,
  secretType: filter.secretType ?? null,
  search: filter.search ?? null,
});

export const sensitiveApi = {
  list: (filter: SensitiveListFilter = {}) =>
    invoke<SensitiveEntry[]>("list_sensitive_entries", { filter: normalizeFilter(filter) }),
  scan: (request: SensitiveScanRequest) =>
    invoke<SensitiveScanResult>("scan_sensitive_content", { request }),
  updateStatus: (id: number, status: SensitiveStatus) =>
    invoke<boolean>("update_sensitive_status", { id, status }),
  remove: (id: number) =>
    invoke<boolean>("delete_sensitive_entry", { id }),
  exportCsv: (filter: SensitiveListFilter = {}) =>
    invoke<string>("export_sensitive_csv", { filter: normalizeFilter(filter) }),
};
