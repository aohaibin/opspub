import { message } from "antd";
import type { McpToken } from "@/types/mcp";

export const CLIENTS = [
  {
    key: "claude",
    name: "Claude Code",
    icon: "C",
    tone: "warning",
    path: "~/.claude.json",
    kind: "本地全局配置",
  },
  {
    key: "codex",
    name: "Codex",
    icon: "X",
    tone: "success",
    path: "~/.codex/config.toml",
    kind: "TOML 全局配置",
  },
  {
    key: "cursor",
    name: "Cursor",
    icon: "</>",
    tone: "info",
    path: "~/.cursor/mcp.json",
    kind: "本地全局配置",
  },
  {
    key: "opencode",
    name: "OpenCode",
    icon: "O",
    tone: "accent",
    path: "~/.config/opencode/opencode.json",
    kind: "本地全局配置",
  },
] as const;

export const clientName = (key: string) =>
  CLIENTS.find((c) => c.key === key)?.name ?? "自定义客户端";
export const tokenState = (token: McpToken) =>
  token.status === "active" &&
  token.expiresAt &&
  new Date(token.expiresAt.replace(" ", "T")).getTime() <= Date.now()
    ? "expired"
    : token.status;
const STATE_NAMES: Record<string, string> = {
  active: "有效",
  expired: "已过期",
  revoked: "已撤销",
  configured: "已配置",
  unconfigured: "未注入",
  outdated: "需更新",
  invalid: "配置异常",
};
export const stateName = (state: string) => STATE_NAMES[state] ?? state;
export const toolScopeLabel = (scope: string) =>
  scope === "readonly"
    ? "只读工具"
    : scope === "*"
      ? "全部工具（含后续新增）"
      : scope.split(",").join("、");

export async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
  message.success("已复制到剪贴板");
}

export const modalStyles = {
  body: { maxHeight: "calc(85dvh - 150px)", overflowY: "auto" as const },
};
