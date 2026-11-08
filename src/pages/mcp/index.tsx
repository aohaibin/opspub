import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Modal } from "antd";
import { Activity, Copy, ListChecks, PlugZap } from "lucide-react";
import { mcpApi } from "@/lib/api/mcp";
import { serverApi } from "@/lib/api/server";
import { getErrorMessage } from "@/lib/api/client";
import type { Server } from "@/types/server";
import type {
  McpClientState,
  McpStatus,
  McpToken,
  McpTokenCreated,
  McpToolDefinition,
} from "@/types/mcp";
import { EndpointPanel } from "@/pages/mcp/EndpointPanel";
import { ClientPanel } from "@/pages/mcp/ClientPanel";
import { ClientConfigModal } from "@/pages/mcp/ClientConfigModal";
import { TokenCreateModal } from "@/pages/mcp/TokenCreateModal";
import { TokenPanel } from "@/pages/mcp/TokenPanel";
import { TokenDetailModal } from "@/pages/mcp/TokenDetailModal";
import { ToolCatalog } from "@/pages/mcp/ToolCatalog";
import { copyText, modalStyles } from "@/pages/mcp/shared";
import "@/pages/mcp/mcp.css";

export default function McpPage() {
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [clients, setClients] = useState<McpClientState[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [tools, setTools] = useState<McpToolDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [endpointBusy, setEndpointBusy] = useState(false);
  const [error, setError] = useState("");
  const [createClient, setCreateClient] = useState<string | null>(null);
  const [configClient, setConfigClient] = useState<string | null>(null);
  const [configToken, setConfigToken] = useState<number>();
  const [created, setCreated] = useState<McpTokenCreated | null>(null);
  const [secretError, setSecretError] = useState("");
  const [copying, setCopying] = useState(false);
  const [detail, setDetail] = useState<{ id: number; test: boolean } | null>(
    null,
  );
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [modal, contextHolder] = Modal.useModal();
  const resumeClient = useRef<string | null>(null);
  const loadSequence = useRef(0);
  const mounted = useRef(true);
  const reportError = (e: unknown) => setError(getErrorMessage(e));

  const load = useCallback(async (visible = true) => {
    const sequence = ++loadSequence.current;
    if (visible) setLoading(true);
    const results = await Promise.allSettled([
      mcpApi.status(),
      mcpApi.listTokens(),
      mcpApi.clients(),
      mcpApi.tools(),
      serverApi.list(),
    ]);
    if (!mounted.current || sequence !== loadSequence.current) return;
    const [endpoint, list, configured, catalog, hosts] = results;
    if (endpoint.status === "fulfilled") setStatus(endpoint.value);
    else setStatus(null);
    if (list.status === "fulfilled") setTokens(list.value);
    if (configured.status === "fulfilled") setClients(configured.value);
    else setClients([]);
    if (catalog.status === "fulfilled") setTools(catalog.value);
    if (hosts.status === "fulfilled") setServers(hosts.value);
    const failed = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    if (failed.length)
      setError(
        failed
          .map((r) => getErrorMessage(r.reason))
          .filter((s, i, all) => all.indexOf(s) === i)
          .join("；"),
      );
    else if (visible) setError("");
    setLoading(false);
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    const refresh = () => {
      if (!document.hidden) void load(false);
    };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      mounted.current = false;
      loadSequence.current++;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  const testEndpoint = async () => {
    setTesting(true);
    setError("");
    try {
      setStatus(await mcpApi.testConnection());
    } catch (e) {
      reportError(e);
    } finally {
      setTesting(false);
    }
  };
  const toggleEndpoint = async (port: number) => {
    setEndpointBusy(true);
    setError("");
    try {
      setStatus(
        status?.httpRunning
          ? await mcpApi.stopHttp()
          : await mcpApi.startHttp(port),
      );
      await load(false);
    } catch (e) {
      reportError(e);
    } finally {
      setEndpointBusy(false);
    }
  };
  const openConfig = (client: string) => {
    setConfigToken(
      clients.find((c) => c.client === client)?.tokenId ?? undefined,
    );
    setConfigClient(client);
  };
  const openCreate = (client = "claude", resume: string | null = null) => {
    resumeClient.current = resume;
    setConfigClient(null);
    setCreateClient(client);
  };
  const onCreated = (value: McpTokenCreated) => {
    setCreateClient(null);
    setCreated(value);
    setSecretError("");
    setTokens((current) => [value.token, ...current]);
    void load(false);
  };
  const closeSecret = () => {
    if (resumeClient.current && created) {
      setConfigToken(created.token.id);
      setConfigClient(resumeClient.current);
    }
    resumeClient.current = null;
    setCreated(null);
    setSecretError("");
  };
  const copySecret = async () => {
    if (!created) return;
    setCopying(true);
    setSecretError("");
    try {
      await copyText(created.secret);
      closeSecret();
    } catch {
      setSecretError("复制失败，令牌仍保留在此窗口，可手动选中复制或重试。");
    } finally {
      setCopying(false);
    }
  };
  const revoke = (token: McpToken) => {
    modal.confirm({
      title: `撤销「${token.name}」？`,
      content:
        "使用此令牌的客户端将无法发起新的 MCP 请求。已经执行中的操作不会因此中止。",
      okText: "撤销令牌",
      cancelText: "取消",
      okButtonProps: { danger: true },
      async onOk() {
        setError("");
        try {
          await mcpApi.revokeToken(token.id);
        } catch (e) {
          reportError(e);
          throw e;
        } finally {
          await load(false);
        }
      },
    });
  };
  return (
    <div className="ops-page mcp-page">
      {contextHolder}
      <header className="mcp-page-heading">
        <div>
          <h1>
            <PlugZap size={21} className="mcp-warning" />
            MCP 接入中心 <span>Model Context Protocol</span>
          </h1>
          <p>将受控运维工具接入 AI 客户端，统一管理端点、配置和授权范围。</p>
        </div>
        <div className="mcp-header-actions">
          <Button
            icon={<ListChecks size={16} />}
            onClick={() => setCatalogOpen(true)}
          >
            工具目录
          </Button>
          <Button
            icon={<Activity size={16} />}
            loading={testing}
            disabled={!status || endpointBusy}
            onClick={() => void testEndpoint()}
          >
            测试连接
          </Button>
        </div>
      </header>
      {error && (
        <Alert
          showIcon
          type="error"
          title="MCP 操作未完成"
          description={error}
          closable
          onClose={() => setError("")}
        />
      )}
      <EndpointPanel
        status={status}
        busy={endpointBusy}
        loading={loading}
        onToggle={toggleEndpoint}
        onRefresh={() => void load()}
        onConfig={() => openConfig("claude")}
        onError={reportError}
      />
      <ClientPanel clients={clients} loading={loading} onOpen={openConfig} />
      <TokenPanel
        tokens={tokens}
        loading={loading}
        running={!!status?.httpRunning}
        onCreate={() => openCreate()}
        onInspect={(token, test) => setDetail({ id: token.id, test })}
        onRevoke={revoke}
      />
      <ClientConfigModal
        endpoint={status}
        client={configClient}
        tokens={tokens}
        initialTokenId={configToken}
        running={!!status?.httpRunning}
        onClose={() => setConfigClient(null)}
        onCreate={(client) => openCreate(client, client)}
        onInjected={() => load(false)}
      />
      <TokenCreateModal
        open={createClient !== null}
        client={createClient ?? "claude"}
        servers={servers}
        tools={tools}
        onClose={() => {
          setCreateClient(null);
          if (resumeClient.current) setConfigClient(resumeClient.current);
          resumeClient.current = null;
        }}
        onCreated={onCreated}
      />
      <TokenDetailModal
        token={tokens.find((t) => t.id === detail?.id) ?? null}
        autoTest={!!detail?.test}
        running={!!status?.httpRunning}
        onClose={() => setDetail(null)}
      />
      <ToolCatalog
        open={catalogOpen}
        tools={tools}
        onClose={() => setCatalogOpen(false)}
      />
      <Modal
        title="令牌已创建"
        open={!!created}
        centered
        width={640}
        maskClosable={false}
        styles={modalStyles}
        rootClassName="mcp-modal"
        onCancel={copying ? undefined : closeSecret}
        closable={!copying}
        keyboard={!copying}
        footer={
          <>
            <Button disabled={copying} onClick={closeSecret}>
              使用系统托管，关闭
            </Button>
            <Button
              type="primary"
              icon={<Copy size={15} />}
              loading={copying}
              onClick={() => void copySecret()}
            >
              复制并关闭
            </Button>
          </>
        }
      >
        <div className="mcp-modal-stack">
          <Alert
            type="success"
            showIcon
            title="已保存到系统凭据库"
            description="内置客户端配置可直接使用此令牌，无需手动复制。完整令牌仅在此展示一次，使用自定义 HTTP 客户端时请妥善保存。"
          />
          <code className="mcp-code mcp-secret">{created?.secret}</code>
          {secretError && <Alert showIcon type="error" title={secretError} />}
        </div>
      </Modal>
    </div>
  );
}
