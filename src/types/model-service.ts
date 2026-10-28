export type ModelKind = "chat";
export type ModelProtocol = "anthropic" | "openai_compatible";

export interface ModelOption {
  value: string;
  label: string;
  contextWindow: number | null;
  maxOutput: number | null;
}

export interface ModelExtraField {
  key: string;
  labelKey: string;
  label: string;
  placeholder: string | null;
  required: boolean;
}

export interface ModelPreset {
  key: string;
  vendorId: string;
  kind: ModelKind;
  groupKey: string;
  groupLabel: string;
  labelKey: string;
  label: string;
  hintKey: string | null;
  hint: string | null;
  baseUrl: string | null;
  model: string;
  models: ModelOption[];
  protocol: ModelProtocol;
  matchHosts: string[];
  extraFields: ModelExtraField[];
  defaultExtra: [string, string][];
  applyUrl: string | null;
  isLocal: boolean;
  verifiedAt: string | null;
  thinkingOff: Record<string, unknown> | null;
}

export interface ModelVendor {
  id: string;
  label: string;
  groupKey: string;
  groupLabel: string;
  kinds: ModelKind[];
  presetKeys: string[];
  host: string | null;
  applyUrl: string | null;
  isLocal: boolean;
}

export interface ModelProfile {
  id: string;
  name: string;
  presetKey: string | null;
  protocol: ModelProtocol;
  baseUrl: string;
  model: string;
  extra: Record<string, string>;
  enabled: boolean;
  hasApiKey: boolean;
  updatedAt: string;
}

export interface ModelProfileInput {
  id?: string;
  name: string;
  presetKey?: string | null;
  protocol: ModelProtocol;
  baseUrl: string;
  model: string;
  extra: Record<string, string>;
  apiKey?: string;
  enabled: boolean;
}

export interface ModelVerifyResult {
  latencyMs: number;
  models: string[];
  dropped: number;
  droppedModels: string[];
  modelInList: boolean;
  limits: { contextWindow: number | null; maxOutput: number | null; source: "user" | "endpoint" | "preset" } | null;
  modelLimits: Array<[string, { contextWindow: number | null; maxOutput: number | null; source: "user" | "endpoint" | "preset" }] >;
}

export type ModelVerifyError =
  | { code: "auth_failed"; detail: string }
  | { code: "not_found"; requested_url: string; suggested_url: string | null }
  | { code: "unreachable"; proxy_hint: boolean }
  | { code: "model_not_found"; available: string[] }
  | { code: "protocol_mismatch"; expect: ModelProtocol }
  | { code: "missing_extra_field"; key: string }
  | { code: "malformed"; detail: string };

export interface ModelVerifyOutcome {
  ok: boolean;
  result: ModelVerifyResult | null;
  error: ModelVerifyError | null;
  actionable: boolean;
}

export interface ModelImportResult {
  name: string;
  presetKey: string | null;
  protocol: ModelProtocol;
  baseUrl: string;
  model: string;
  modelFallback: boolean;
}

export interface ModelImportBatchResult {
  profiles: ModelImportResult[];
  skipped: number;
  bundle: boolean;
}
