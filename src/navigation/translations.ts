import type { ModuleDef } from "./modules";
import type { SettingsLanguage } from "@/pages/settings/translations";

const englishLabels: Record<string, { navLabel: string; title: string }> = {
  servers: { navLabel: "Servers", title: "Server Inventory" },
  terminal: { navLabel: "Terminal", title: "Remote Terminal" },
  workbench: { navLabel: "Workbench", title: "Host Workbench" },
  sftp: { navLabel: "SFTP", title: "SFTP File Transfer" },
  database: { navLabel: "Database", title: "Database Workspace" },
  batch: { navLabel: "Batch", title: "Batch Execution" },
  deploy: { navLabel: "Deploy", title: "Application Deployment" },
  copilot: { navLabel: "Copilot", title: "AI Copilot" },
  mcp: { navLabel: "MCP", title: "MCP Integrations" },
  skills: { navLabel: "Skills", title: "Skills & Experience" },
  inspector: { navLabel: "Inspect", title: "AI Inspection" },
  sensitive: { navLabel: "Secrets", title: "Sensitive Data Vault" },
  credentials: { navLabel: "Credentials", title: "Credential Vault" },
  alerts: { navLabel: "Alerts", title: "Alerts & Notifications" },
  security: { navLabel: "Approvals", title: "Security & Approvals" },
  audit: { navLabel: "Audit", title: "Audit Log" },
  settings: { navLabel: "Settings", title: "System Settings" },
};

export function translateModule(
  mod: ModuleDef,
  language: SettingsLanguage,
): { navLabel: string; title: string } {
  if (language === "en-US") {
    return englishLabels[mod.key] ?? { navLabel: mod.navLabel, title: mod.title };
  }
  return { navLabel: mod.navLabel, title: mod.title };
}
