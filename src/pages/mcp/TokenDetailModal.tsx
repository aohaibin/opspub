import { useEffect, useRef, useState } from "react";
import { Alert, Button, Descriptions, Modal, Tag } from "antd";
import { Activity } from "lucide-react";
import type { McpToken, McpTokenTest } from "@/types/mcp";
import { mcpApi } from "@/lib/api/mcp";
import { getErrorMessage } from "@/lib/api/client";
import {
  clientName,
  modalStyles,
  stateName,
  tokenState,
  toolScopeLabel,
} from "@/pages/mcp/shared";

export function TokenDetailModal({
  token,
  autoTest,
  running,
  onClose,
}: {
  token: McpToken | null;
  autoTest: boolean;
  running: boolean;
  onClose: () => void;
}) {
  const [result, setResult] = useState<McpTokenTest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const test = async (id: number) => {
    const request = ++sequence.current;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const value = await mcpApi.testToken(id);
      if (sequence.current === request) setResult(value);
    } catch (e) {
      if (sequence.current === request) setError(getErrorMessage(e));
    } finally {
      if (sequence.current === request) setBusy(false);
    }
  };
  useEffect(() => {
    setResult(null);
    setError("");
    setBusy(false);
    if (token && autoTest) void test(token.id);
    return () => {
      sequence.current++;
    };
  }, [token?.id, autoTest]);
  return (
    <Modal
      title="令牌详情与连通测试"
      open={!!token}
      centered
      width={680}
      styles={modalStyles}
      rootClassName="mcp-modal"
      onCancel={onClose}
      footer={
        <>
          <Button onClick={onClose}>关闭</Button>
          <Button
            type="primary"
            icon={<Activity size={15} />}
            loading={busy}
            disabled={!token || tokenState(token) !== "active" || !running}
            onClick={() => token && void test(token.id)}
          >
            测试授权
          </Button>
        </>
      }
    >
      {token && (
        <div className="mcp-modal-stack">
          <Descriptions
            column={1}
            size="small"
            items={[
              { key: "name", label: "名称", children: token.name },
              {
                key: "client",
                label: "客户端",
                children: clientName(token.client),
              },
              {
                key: "state",
                label: "状态",
                children: stateName(tokenState(token)),
              },
              {
                key: "hint",
                label: "令牌",
                children: <code>{token.tokenHint}</code>,
              },
              {
                key: "servers",
                label: "服务器",
                children:
                  token.serverScope === "*"
                    ? "全部 SSH 服务器（含后续新增）"
                    : token.serverScope,
              },
              {
                key: "tools",
                label: "工具",
                children: toolScopeLabel(token.toolScope),
              },
              { key: "created", label: "创建时间", children: token.createdAt },
              {
                key: "expires",
                label: "到期时间",
                children: token.expiresAt ?? "永久有效",
              },
              ...(token.revokedAt
                ? [
                    {
                      key: "revoked",
                      label: "撤销时间",
                      children: token.revokedAt,
                    },
                  ]
                : []),
            ]}
          />
          <Alert
            type={result?.toolCallVerified ? "success" : "info"}
            showIcon
            title={result?.toolCallVerified ? `本地工具调用已验证：${result.testedTool}` : "测试不连接远程服务器。具备本地探针授权时会执行真实 MCP 工具调用。"}
          />
          {!running && (
            <Alert type="warning" showIcon title="请先启动 MCP 端点再测试。" />
          )}
          {error && (
            <Alert
              type="error"
              showIcon
              title="令牌测试失败"
              description={error}
            />
          )}
          {result && (
            <Alert
              type={result.toolCallVerified ? "success" : "warning"}
              showIcon
              title={`授权检查通过 · ${result.latencyMs} ms`}
              description={
                <div className="mcp-modal-stack">
                  <span>{result.message}</span>
                  <span>{result.testedAt}</span>
                  <div className="mcp-tool-tags">
                    {result.tools.map((t) => (
                      <Tag key={t}>{t}</Tag>
                    ))}
                  </div>
                </div>
              }
            />
          )}
        </div>
      )}
    </Modal>
  );
}
