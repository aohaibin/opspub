import { useEffect, useRef, useState } from "react";
import { Alert, Button, Modal, Select } from "antd";
import { Copy, FileCheck2 } from "lucide-react";
import type { McpClientConfig, McpStatus, McpToken } from "@/types/mcp";
import { mcpApi } from "@/lib/api/mcp";
import { getErrorMessage } from "@/lib/api/client";
import {
  clientName,
  copyText,
  modalStyles,
  tokenState,
  toolScopeLabel,
} from "@/pages/mcp/shared";

interface Props {
  client: string | null;
  tokens: McpToken[];
  initialTokenId?: number;
  running: boolean;
  endpoint: McpStatus | null;
  onClose: () => void;
  onCreate: (client: string) => void;
  onInjected: () => Promise<void>;
}

export function ClientConfigModal({
  client,
  tokens,
  initialTokenId,
  running,
  endpoint,
  onClose,
  onCreate,
  onInjected,
}: Props) {
  const [tokenId, setTokenId] = useState<number>();
  const [config, setConfig] = useState<McpClientConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [injecting, setInjecting] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const sequence = useRef(0);
  const available = tokens.filter(
    (t) =>
      tokenState(t) === "active" &&
      (t.client === client || t.client === "custom"),
  );
  const selected = available.find((t) => t.id === tokenId);
  const windows =
    /^[A-Za-z]:[\\/]/.test(endpoint?.stdioPath ?? "") ||
    endpoint?.stdioPath.startsWith("\\\\");
  const launcher = endpoint?.stdioPath ?? "";
  const quotedLauncher = windows
    ? `'${launcher.replace(/'/g, "''")}'`
    : `'${launcher.replace(/'/g, "'\\''")}'`;
  const launchCommand =
    selected && endpoint
      ? `${windows ? "& " : ""}${quotedLauncher} --mcp-stdio --token-id ${selected.id} --port ${endpoint.httpPort}`
      : "";
  useEffect(() => {
    setTokenId(initialTokenId);
    setConfig(null);
    setError("");
    setBusy(false);
    sequence.current++;
  }, [client, initialTokenId]);
  useEffect(() => {
    const current = ++sequence.current;
    setConfig(null);
    setError("");
    setSaved(false);
    if (!client || !selected) {
      setBusy(false);
      return;
    }
    setBusy(true);
    void mcpApi
      .getConfig(selected.id, client)
      .then((value) => {
        if (current === sequence.current) setConfig(value);
      })
      .catch((e) => {
        if (current === sequence.current) setError(getErrorMessage(e));
      })
      .finally(() => {
        if (current === sequence.current) setBusy(false);
      });
    return () => {
      sequence.current++;
    };
  }, [client, selected?.id, endpoint?.httpPort]);
  const inject = async () => {
    if (!client || !selected || !config) return;
    setInjecting(true);
    setError("");
    try {
      setConfig(await mcpApi.injectConfig(selected.id, client));
      setSaved(true);
      await onInjected();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setInjecting(false);
    }
  };
  return (
    <Modal
      title={`${clientName(client ?? "")} · 接入配置`}
      open={!!client}
      width={720}
      centered
      maskClosable={false}
      destroyOnHidden
      styles={modalStyles}
      rootClassName="mcp-modal"
      onCancel={injecting ? undefined : onClose}
      closable={!injecting}
      keyboard={!injecting}
      footer={
        <div className="mcp-modal-footer">
          <Button disabled={injecting} onClick={onClose}>
            关闭
          </Button>
          <Button
            icon={<Copy size={15} />}
            disabled={!config || busy || injecting}
            onClick={() =>
              config &&
              void copyText(config.content).catch((e) =>
                setError(getErrorMessage(e)),
              )
            }
          >
            复制配置
          </Button>
          <Button
            type="primary"
            icon={<FileCheck2 size={15} />}
            loading={injecting}
            disabled={!config || !selected || busy}
            onClick={() => void inject()}
          >
            备份并注入
          </Button>
        </div>
      }
    >
      <div className="mcp-modal-stack">
        <p className="mcp-muted">
          选择本次接入使用的令牌，核对范围后写入。客户端需要重启或重新加载 MCP
          配置。
        </p>
        <label className="mcp-field-label" htmlFor="mcp-client-token">
          接入令牌
        </label>
        <div className="mcp-token-select">
          <Select
            id="mcp-client-token"
            value={tokenId}
            onChange={setTokenId}
            disabled={injecting}
            placeholder="请选择有效令牌"
            options={available.map((t) => ({
              value: t.id,
              label: `${t.name} · ${toolScopeLabel(t.toolScope)}`,
            }))}
          />
          <Button
            disabled={injecting}
            onClick={() => client && onCreate(client)}
          >
            新建令牌
          </Button>
        </div>
        {selected && (
          <div className="mcp-scope-summary">
            <span>
              服务器：
              {selected.serverScope === "*"
                ? "全部 SSH 服务器（含后续新增）"
                : selected.serverScope}
            </span>
            <span>有效期：{selected.expiresAt ?? "永久"}</span>
            <span>工具：{toolScopeLabel(selected.toolScope)}</span>
          </div>
        )}
        {!running && (
          <Alert
            showIcon
            type="info"
            title="端点尚未启动，可先保存配置，使用前请启动端点。"
          />
        )}
        {error && <Alert showIcon type="error" title={error} />}
        {saved && !config?.backupPath && (
          <Alert
            type="success"
            showIcon
            title="配置文件已创建，请重启客户端加载。"
          />
        )}
        {busy && <div className="mcp-empty">正在生成配置…</div>}
        {config && (
          <>
            <div className="mcp-caption mcp-config-path">
              {config.path} · {config.format}
            </div>
            <pre className="mcp-code">{config.content}</pre>
            {launchCommand && (
              <details className="mcp-schema">
                <summary>{windows ? "PowerShell" : "Shell"} 启动命令</summary>
                <pre className="mcp-code">{launchCommand}</pre>
                <Button
                  type="link"
                  icon={<Copy size={14} />}
                  onClick={() =>
                    void copyText(launchCommand).catch((e) =>
                      setError(getErrorMessage(e)),
                    )
                  }
                >
                  复制启动命令
                </Button>
              </details>
            )}
            <p className="mcp-caption">
              配置使用系统凭据索引，无需将真实令牌写入文件或启动参数。
            </p>
            {config.backupPath && (
              <Alert
                type="success"
                showIcon
                title="配置已写入，原文件已备份"
                description={
                  <span className="mcp-break">{config.backupPath}</span>
                }
              />
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
