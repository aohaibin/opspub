import { Alert, Drawer, Tag } from "antd";
import type { McpToolDefinition } from "@/types/mcp";

export function ToolCatalog({
  open,
  tools,
  onClose,
}: {
  open: boolean;
  tools: McpToolDefinition[];
  onClose: () => void;
}) {
  return (
    <Drawer
      title={`已开放工具 · ${tools.length} 项`}
      open={open}
      onClose={onClose}
      size={560}
      rootClassName="mcp-modal"
    >
      <div className="mcp-modal-stack">
        <Alert
          type="info"
          showIcon
          title="当前为受控只读工具集"
          description="远程探针支持 Linux SSH，需开启 AI 操作且服务器允许只读访问。逐次审批档位尚未接入 MCP 审批流，将明确拒绝执行。凭据由 OpsPub 注入，客户端不会拿到服务器密码。"
        />
        {tools.map((t) => (
          <article className="mcp-section" key={t.name}>
            <div className="mcp-card-heading">
              <h3 className="mcp-mono">{t.name}</h3>
              <Tag color="success">只读</Tag>
            </div>
            <p className="mcp-muted">{t.description}</p>
            <p className="mcp-caption">
              {t.name === "list_servers"
                ? "无需参数；只返回令牌授权的 SSH 服务器。"
                : "serverAlias（服务器别名）或 serverId（编号）至少提供一个。"}
            </p>
            <details className="mcp-schema">
              <summary>查看参数定义</summary>
              <pre className="mcp-code">
                {JSON.stringify(t.inputSchema, null, 2)}
              </pre>
            </details>
          </article>
        ))}
      </div>
    </Drawer>
  );
}
