import { Bell, Bot, Server, Settings, ShieldCheck, Zap } from "lucide-react";
import { modulePath, requireModule } from "./modules";

/** 一级业务域和二级入口按新版原型排序，模块路由仍由现有注册表维护。 */
export const WORKSPACE_DOMAINS = [
  {
    key: "ops", label: "主机运维", english: "Host Operations", icon: Server, shortcut: "1",
    modules: ["servers", "terminal", "workbench", "sftp", "database"],
  },
  {
    key: "automation", label: "自动化中心", english: "Automation", icon: Zap, shortcut: "2",
    modules: ["batch", "deploy"],
  },
  {
    key: "ai", label: "AI 智维中枢", english: "AI Operations", icon: Bot, shortcut: "3",
    modules: ["copilot", "skills", "mcp", "inspector"],
  },
  {
    key: "gov", label: "安全与治理", english: "Security & Governance", icon: ShieldCheck, shortcut: "4",
    modules: ["credentials", "sensitive", "security", "audit"],
  },
  {
    key: "alerts", label: "告警通知中心", english: "Alerts & Notifications", icon: Bell, shortcut: null,
    modules: ["alerts"],
  },
  {
    key: "settings", label: "系统与偏好设置", english: "System Settings", icon: Settings, shortcut: null,
    modules: ["settings"],
  },
] as const;

export type WorkspaceDomain = typeof WORKSPACE_DOMAINS[number];
type WorkspaceModuleKey = WorkspaceDomain["modules"][number];

export const WORKSPACE_MODULE_LABELS: Record<WorkspaceModuleKey, string> = {
  servers: "服务器资产",
  terminal: "远程终端",
  workbench: "主机工作台",
  sftp: "SFTP 文件传输",
  database: "数据库工作台",
  batch: "批量执行与下发",
  deploy: "CI/CD 部署发布",
  copilot: "智维助理 (Copilot)",
  skills: "专家技能库 (Skills)",
  mcp: "MCP 协议工具",
  inspector: "深度巡检诊断",
  credentials: "服务凭据",
  sensitive: "敏感库 (脱敏)",
  security: "安全闸门与审批",
  audit: "审计存证日志",
  alerts: "告警与通知",
  settings: "系统设置",
};

export function resolveWorkspace(pathname: string) {
  const path = pathname.toLowerCase().replace(/\/+$/, "");
  for (const domain of WORKSPACE_DOMAINS) {
    const key = domain.modules.find((moduleKey) => modulePath(moduleKey) === path);
    if (key) return { domain, module: requireModule(key) };
  }
  return { domain: WORKSPACE_DOMAINS[0], module: undefined };
}
