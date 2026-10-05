import { invoke } from "@tauri-apps/api/core";
import type { McpClientConfig, McpStatus, McpToken, McpTokenCreated, McpTokenInput } from "@/types/mcp";

export const mcpApi = {
  status: () => invoke<McpStatus>("get_mcp_status"),
  testConnection: () => invoke<McpStatus>("test_mcp_connection"),
  startHttp: (port?: number) => invoke<McpStatus>("start_mcp_http", { port }),
  stopHttp: () => invoke<McpStatus>("stop_mcp_http"),
  listTokens: () => invoke<McpToken[]>("list_mcp_tokens"),
  createToken: (input: McpTokenInput) => invoke<McpTokenCreated>("create_mcp_token", { input }),
  revokeToken: (id: number) => invoke<boolean>("revoke_mcp_token", { id }),
  getConfig: (tokenId: number, client: string) => invoke<McpClientConfig>("get_mcp_client_config", { tokenId, client }),
  injectConfig: (tokenId: number, client: string) => invoke<McpClientConfig>("inject_mcp_client_config", { tokenId, client }),
};
