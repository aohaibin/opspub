import { useEffect, useState, type ReactNode } from "react";
import { Button, InputNumber, Tag } from "antd";
import { Cpu, Globe, RefreshCw, Terminal } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { McpStatus } from "@/types/mcp";
import { copyText } from "@/pages/mcp/shared";

interface Props {
  status: McpStatus | null;
  busy: boolean;
  loading: boolean;
  onToggle: (port: number) => Promise<void>;
  onRefresh: () => void;
  onConfig: () => void;
  onError: (error: unknown) => void;
}

export function EndpointPanel({
  status,
  busy,
  loading,
  onToggle,
  onRefresh,
  onConfig,
  onError,
}: Props) {
  const [port, setPort] = useState<number | null>(18180);
  useEffect(() => {
    if (status) setPort(status.httpPort);
  }, [status?.httpPort]);
  const url = status?.httpUrl ?? `http://127.0.0.1:${port ?? 18180}/mcp`;
  return (
    <section className="mcp-section">
      <div className="mcp-section-heading">
        <h2>
          <span
            className={`mcp-dot ${status?.httpRunning ? "is-online" : ""}`}
          />
          端点状态
        </h2>
        <span className="mcp-caption mcp-mono">
          协议 {status?.protocolVersion ?? "—"} · 版本 {status?.version ?? "—"}
        </span>
        <Button
          type="text"
          aria-label="刷新 MCP 状态"
          title="刷新状态与客户端配置"
          icon={<RefreshCw size={15} />}
          loading={loading}
          onClick={onRefresh}
        />
      </div>
      <div className="mcp-port-bar">
        <label htmlFor="mcp-http-port">HTTP 端口</label>
        <InputNumber
          id="mcp-http-port"
          min={1}
          max={65535}
          precision={0}
          controls={false}
          value={port}
          onChange={setPort}
          disabled={!status || status.httpRunning || busy}
        />
        <Button
          type={status?.httpRunning ? "default" : "primary"}
          danger={status?.httpRunning}
          loading={busy}
          disabled={
            !status ||
            (!status.httpRunning && (!port || port < 1 || port > 65535))
          }
          onClick={() => void onToggle(port ?? 18180)}
        >
          {status?.httpRunning ? "停止端点" : "启动端点"}
        </Button>
        <span>仅绑定 127.0.0.1，不接受公网连接</span>
        <span className={status?.httpRunning ? "mcp-success" : "mcp-muted"}>
          {status?.endpointMessage ?? "正在读取状态"}
        </span>
      </div>
      <div className="mcp-endpoint-grid">
        <Endpoint
          icon={<Terminal size={16} />}
          title="stdio sidecar"
          state={status?.stdioReady ? "可用" : "未就绪"}
          ready={status?.stdioReady}
        >
          <p title={status?.stdioPath}>当前应用 · --mcp-stdio</p>
          <small>通过本机 HTTP 转发，需保持 OpsPub 运行</small>
          <div className="mcp-links">
            <Button type="link" disabled={!status} onClick={onConfig}>
              复制启动命令
            </Button>
            <Button type="link" onClick={onConfig}>
              配置客户端
            </Button>
          </div>
        </Endpoint>
        <Endpoint
          icon={<Globe size={16} />}
          title="Streamable HTTP"
          state={status?.httpRunning ? "在线" : "未启动"}
          ready={status?.httpRunning}
        >
          <p className="mcp-mono" title={url}>
            {url}
          </p>
          <small>请求需携带 Bearer Token</small>
          <div className="mcp-links">
            <Button
              type="link"
              disabled={!status?.httpRunning}
              onClick={() =>
                void openUrl(url.replace(/\/mcp$/, "/health")).catch(onError)
              }
            >
              打开健康检查
            </Button>
            <Button
              type="link"
              disabled={!status}
              onClick={() => void copyText(url).catch(onError)}
            >
              复制地址
            </Button>
          </div>
        </Endpoint>
        <Endpoint
          icon={<Cpu size={16} />}
          title="进程内 (In-Process)"
          state={status?.inProcessReady ? "内置" : "待检测"}
          ready={status?.inProcessReady}
        >
          <p>内置 AI 助手 · 无网络回环</p>
          <small>沿用 AI 总开关、服务器策略与审计</small>
          <div className="mcp-links mcp-caption">
            {status?.inProcessReady ? "● 可用" : "正在检查"}
          </div>
        </Endpoint>
      </div>
      <div className="mcp-caption mcp-status-note">
        {status?.lastTestedAt
          ? `最近测试 ${status.lastTestedAt} · ${status.message}`
          : "尚未测试端点。健康检查验证服务，令牌测试验证认证和工具授权。"}
      </div>
      {status?.endpointError && (
        <div className="mcp-error-text">{status.endpointError}</div>
      )}
    </section>
  );
}

function Endpoint({
  icon,
  title,
  state,
  ready,
  children,
}: {
  icon: ReactNode;
  title: string;
  state: string;
  ready?: boolean;
  children: ReactNode;
}) {
  return (
    <article className="mcp-endpoint">
      <div className="mcp-card-heading">
        <h3>
          {icon}
          {title}
        </h3>
        <Tag color={ready ? "success" : "default"}>{state}</Tag>
      </div>
      {children}
    </article>
  );
}
