import { invoke } from "./client";
import type { AppConfig } from "@/types";
import type { LogoColor } from "@/lib/logo";

interface LogoSyncResult {
  desktopShortcut: "synced" | "missing" | "unsupported" | "failed";
  warnings: string[];
}

/** 配置管理 API */
export const configApi = {
  getAll: () => invoke<AppConfig[]>("get_all_config"),
  get: (key: string) => invoke<string>("get_config", { key }),
  set: (key: string, value: string) =>
    invoke<void>("set_config", { key, value }),
  delete: (key: string) => invoke<void>("delete_config", { key }),
  saveLogoColor: (color: LogoColor) => invoke<LogoSyncResult>("save_logo_color", { color }),
};
