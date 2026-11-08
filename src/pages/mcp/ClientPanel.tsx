import { Button, Tag } from "antd";
import { Sparkles } from "lucide-react";
import type { McpClientState } from "@/types/mcp";
import { CLIENTS, stateName } from "@/pages/mcp/shared";

export function ClientPanel({
  clients,
  onOpen,
  loading,
}: {
  clients: McpClientState[];
  onOpen: (client: string) => void;
  loading: boolean;
}) {
  return (
    <section className="mcp-clients-section">
      <div className="mcp-section-heading">
        <h2>
          <Sparkles size={17} className="mcp-warning" />
          一键接入 AI 客户端
        </h2>
        <span className="mcp-caption">写入前自动备份，只更新 opspub 节点</span>
      </div>
      <div className="mcp-client-grid">
        {CLIENTS.map((client) => {
          const state = clients.find((c) => c.client === client.key);
          return (
            <article key={client.key} className="mcp-section mcp-client-card">
              <div className="mcp-card-heading">
                <div className="mcp-client-name">
                  <span className={`mcp-client-icon tone-${client.tone}`}>
                    {client.icon}
                  </span>
                  <h3>{client.name}</h3>
                  <Tag
                    color={
                      state?.state === "configured"
                        ? "success"
                        : state?.state === "invalid"
                          ? "error"
                          : state?.state === "outdated"
                            ? "warning"
                            : "default"
                    }
                  >
                    {state ? stateName(state.state) : "待检测"}
                  </Tag>
                </div>
                <div className="mcp-client-actions">
                  <Button disabled={loading} onClick={() => onOpen(client.key)}>
                    预览
                  </Button>
                  <Button
                    className={`mcp-inject tone-${client.tone}`}
                    disabled={loading}
                    onClick={() => onOpen(client.key)}
                  >
                    一键注入
                  </Button>
                </div>
              </div>
              <div
                className="mcp-caption mcp-config-path"
                title={state?.path ?? client.path}
              >
                {client.kind} · {client.path}
              </div>
              <p className="mcp-client-note" title={state?.message}>
                {state?.message ?? "正在读取配置状态"}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
