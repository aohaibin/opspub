export type SensitiveStatus = "pending" | "retained" | "false_positive" | "discarded";

export interface SensitiveEntry {
  id: number;
  serverId: number | null;
  serverAlias: string;
  detectedAt: string;
  secretType: string;
  label: string;
  maskedValue: string;
  source: string;
  status: SensitiveStatus | string;
  valueHash: string;
  matchCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SensitiveListFilter {
  serverId?: number | null;
  status?: SensitiveStatus | string | null;
  secretType?: string | null;
  search?: string | null;
}

export interface SensitiveScanRequest {
  serverId?: number | null;
  serverAlias?: string | null;
  source: string;
  content: string;
}

export interface SensitiveScanResult {
  entries: SensitiveEntry[];
  matchCount: number;
}
