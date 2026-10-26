// ─── API 统一入口（Re-export Hub） ─────────────────────
// 按业务模块拆分，每个模块独立文件，此处统一导出

// 基础工具（错误解析 + invoke 封装）
export {
  parseCommandError,
  getErrorMessage,
  getErrorCode,
  invoke,
} from "./client";
export type { CommandError } from "./client";

// 业务 API
export { systemApi } from "./system";
export { configApi } from "./config";
export { updaterApi } from "./updater";
export { serverApi, auditApi } from "./server";
export {
  terminalApi,
  TERMINAL_OUTPUT_EVENT,
  TERMINAL_STATUS_EVENT,
} from "./terminal";
export { sftpApi } from "./sftp";
export { workbenchApi } from "./workbench";
export { databaseApi } from "./database";
export { deploymentApi } from "./deployment";
export { copilotApi } from "./copilot";
export { mcpApi } from "./mcp";
export { sensitiveApi } from "./sensitive";
export { fileApi } from "./file";
