import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Button, Form, Input, Modal, Select, Table, Tag, message } from "antd";
import { Activity, Clipboard, Code2, Cpu, ExternalLink, Globe, KeyRound, PlugZap, RefreshCw, Terminal } from "lucide-react";
import { mcpApi } from "@/lib/api/mcp";
import { getErrorMessage } from "@/lib/api/client";
import type { McpClientConfig, McpStatus, McpToken, McpTokenInput } from "@/types/mcp";

const CLIENTS = [
  { key: "claude", name: "Claude Code", short: "C", color: "#fbbf24", path: "~/.claude.json" },
  { key: "codex", name: "Codex", short: "X", color: "#34d399", path: "~/.codex/config.toml" },
  { key: "cursor", name: "Cursor", short: "</>", color: "#22d3ee", path: "~/.cursor/mcp.json" },
  { key: "opencode", name: "OpenCode", short: "O", color: "#818cf8", path: "~/.config/opencode/opencode.json" },
] as const;

function copyText(value: string) {
  void navigator.clipboard.writeText(value).then(() => message.success("已复制到剪贴板")).catch(() => message.error("复制失败，请手动选择文本"));
}

export default function McpPage() {
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [endpointBusy, setEndpointBusy] = useState(false);
  const [port, setPort] = useState("18180");
  const [modalOpen, setModalOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [config, setConfig] = useState<McpClientConfig | null>(null);
  const [configBusy, setConfigBusy] = useState<string | null>(null);
  const [form] = Form.useForm<McpTokenInput>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextStatus, nextTokens] = await Promise.all([mcpApi.status(), mcpApi.listTokens()]);
      setStatus(nextStatus); setTokens(nextTokens);
    } catch (error) { message.error(getErrorMessage(error)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const testConnection = async () => {
    setTesting(true);
    try { setStatus(await mcpApi.testConnection()); }
    catch (error) { message.error(getErrorMessage(error)); }
    finally { setTesting(false); }
  };

  const toggleEndpoint = async () => {
    setEndpointBusy(true);
    try {
      setStatus(status?.httpRunning ? await mcpApi.stopHttp() : await mcpApi.startHttp(Number(port) || 18180));
      message.success(status?.httpRunning ? "MCP HTTP 端点已停止" : "MCP HTTP 端点已启动");
    } catch (error) { message.error(getErrorMessage(error)); }
    finally { setEndpointBusy(false); }
  };

  const submitToken = async () => {
    try {
      const result = await mcpApi.createToken(await form.validateFields());
      setTokens((current) => [result.token, ...current]);
      setModalOpen(false); form.resetFields(); setSecret(result.secret);
      message.success("Scoped Token 已创建。完整令牌只显示这一次。");
    } catch (error) { message.error(getErrorMessage(error)); }
  };

  const revoke = (token: McpToken) => {
    Modal.confirm({ title: "撤销此令牌？", content: `${token.name} 撤销后，外部客户端将无法继续使用。`, okText: "撤销", okButtonProps: { danger: true }, cancelText: "取消", async onOk() {
      try { await mcpApi.revokeToken(token.id); setTokens((current) => current.map((item) => item.id === token.id ? { ...item, status: "revoked", revokedAt: new Date().toISOString() } : item)); message.success("令牌已撤销"); }
      catch (error) { message.error(getErrorMessage(error)); }
    } });
  };

  const useConfig = async (client: string, inject: boolean) => {
    const token = tokens.find((item) => item.status === "active" && (item.client === client || item.client === "custom"));
    if (!token) { message.warning("请先创建一个有效的 Scoped Token"); return; }
    setConfigBusy(`${client}:${inject ? "inject" : "preview"}`);
    try { const result = inject ? await mcpApi.injectConfig(token.id, client) : await mcpApi.getConfig(token.id, client); setConfig(result); if (inject) message.success(`已备份并写入 ${result.path}`); }
    catch (error) { message.error(getErrorMessage(error)); }
    finally { setConfigBusy(null); }
  };

  const columns = useMemo(() => [
    { title: "名称", dataIndex: "name", key: "name", render: (value: string, row: McpToken) => <div><div className="font-semibold text-slate-100">{value} <Tag color={row.status === "active" ? "success" : row.status === "expired" ? "warning" : "default"}>{row.status === "active" ? "有效" : row.status === "expired" ? "已过期" : "已撤销"}</Tag></div><div className="text-[11px] text-slate-500">客户端：{row.client} · 服务器：{row.serverScope}</div></div> },
    { title: "工具范围", dataIndex: "toolScope", key: "toolScope", render: (value: string) => <span className="font-mono text-[11px] text-slate-300">{value}</span> },
    { title: "令牌", dataIndex: "tokenHint", key: "tokenHint", render: (value: string) => <span className="font-mono text-[11px] text-slate-400">{value}</span> },
    { title: "有效期", dataIndex: "expiresAt", key: "expiresAt", render: (value: string | null) => value || "永久" },
    { title: "操作", key: "action", align: "right" as const, render: (_: unknown, row: McpToken) => <Button size="small" danger disabled={row.status === "revoked"} onClick={() => revoke(row)}>撤销</Button> },
  ], [tokens]);

  return <div className="ops-page space-y-4 overflow-y-auto">
    <div className="ops-page-head"><div style={{ minWidth: 0 }}><h1 className="ops-page-title"><PlugZap size={18} className="text-amber-400" /><span>MCP 接入中心 (Model Context Protocol)</span></h1><p className="ops-page-desc">把受控运维工具安全接入 Claude Code / Codex / Cursor / OpenCode；HTTP 仅监听本机，stdio 复用当前应用进程</p></div><div className="flex items-center gap-2"><Button icon={<Activity size={14} />} loading={testing} onClick={() => void testConnection()}>测试连接</Button><Button type={status?.httpRunning ? "default" : "primary"} loading={endpointBusy} onClick={() => void toggleEndpoint()}>{status?.httpRunning ? "停止端点" : "启动端点"}</Button></div></div>

    <section className="ops-panel space-y-3"><div className="flex flex-wrap items-center gap-2 text-xs font-bold text-white"><span className={`h-2 w-2 rounded-full ${status?.httpRunning || status?.stdioReady ? "bg-emerald-400" : "bg-amber-400"}`} /><span>端点状态</span><span className="font-mono text-[11px] text-slate-500">协议 2024-11-05 · 版本 {status?.version ?? "-"}</span><Button type="text" size="small" icon={<RefreshCw size={12} />} loading={loading} onClick={() => void load()} /></div><div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-surface-950 p-2 text-[11px] text-slate-400"><span>HTTP 端口</span><Input size="small" value={port} onChange={(event) => setPort(event.target.value.replace(/\D/g, "").slice(0, 5))} disabled={status?.httpRunning} className="w-24" /><span>仅绑定 127.0.0.1，不接受公网连接</span>{status?.httpStartedAt && <span className="text-emerald-400">启动于 {status.httpStartedAt}</span>}</div><div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <Endpoint icon={<Terminal size={14} />} title="stdio sidecar" state={status?.stdioReady ? "可用" : "未启动"} tone={status?.stdioReady ? "success" : "warning"} value={status?.stdioPath ?? "检查中..."} action={<><Button type="link" size="small" onClick={() => status && copyText(status.stdioPath)}>复制路径</Button><Button type="link" size="small" onClick={() => void useConfig("claude", false)}>复制配置</Button></>} />
      <Endpoint icon={<Globe size={14} />} title="streamable HTTP" state={status?.httpRunning ? "在线" : "未启动"} tone={status?.httpRunning ? "success" : "warning"} value={status?.httpUrl ?? "http://127.0.0.1:18180/mcp"} action={<><Button type="link" size="small" icon={<ExternalLink size={12} />} onClick={() => window.open(status?.httpUrl, "_blank")}>浏览器打开</Button><Button type="link" size="small" onClick={() => status && copyText(status.httpUrl)}>复制</Button></>} />
      <Endpoint icon={<Cpu size={14} />} title="进程内 (In-Process)" state="已就绪" tone="info" value="页面内置 AI 助手，无网络回环" action={<span className="text-[11px] text-emerald-400">● 可用</span>} />
    </div><div className="text-[11px] text-slate-400">{status?.message ?? "正在读取端点状态..."} · {status?.endpointMessage ?? "等待检测"}{status?.endpointError ? ` · ${status.endpointError}` : ""}{status?.lastTestedAt ? ` · 最近测试 ${status.lastTestedAt}` : ""}</div></section>

    <section className="space-y-2"><div className="flex items-center justify-between text-xs"><span className="flex items-center gap-1.5 font-bold text-white"><Code2 size={15} className="text-amber-400" />一键接入 AI 客户端</span><span className="text-[11px] text-slate-500">配置文件写入前自动备份，令牌按客户端作用域生成</span></div><div className="grid grid-cols-1 gap-3 md:grid-cols-2">{CLIENTS.map((client) => <div key={client.key} className="ops-panel space-y-2"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="flex h-6 min-w-6 items-center justify-center rounded-lg bg-slate-800 px-1 text-xs font-bold" style={{ color: client.color }}>{client.short}</span><div><div className="text-xs font-bold text-white">{client.name}</div><div className="text-[10px] text-slate-500">{client.path}</div></div></div><div className="flex gap-1"><Button size="small" onClick={() => void useConfig(client.key, false)}>预览</Button><Button size="small" type="primary" loading={configBusy === `${client.key}:inject`} onClick={() => void useConfig(client.key, true)}>一键注入</Button></div></div><p className="m-0 text-[11px] text-slate-400">使用本地 stdio sidecar，凭据由系统凭据管理器托管。</p></div>)}</div></section>

    <section className="ops-panel overflow-hidden p-0"><div className="flex items-center justify-between border-b border-slate-800 bg-surface-900 p-3 text-xs"><div className="flex items-center gap-2 font-bold text-white"><KeyRound size={15} className="text-amber-400" />Scoped Tokens (作用域令牌分配)</div><Button type="link" icon={<KeyRound size={13} />} onClick={() => setModalOpen(true)}>新建 Token</Button></div><Table className="ops-table" size="small" rowKey="id" loading={loading} columns={columns} dataSource={tokens} pagination={false} locale={{ emptyText: "暂无令牌，请为外部客户端创建一个受限令牌" }} /></section>

  <Modal title="新建 Scoped Token" open={modalOpen} maskClosable={false} onCancel={() => setModalOpen(false)} onOk={() => void submitToken()} okText="创建令牌" cancelText="取消"><Form form={form} layout="vertical" initialValues={{ client: "claude", serverScope: "*", toolScope: "readonly" }}><Form.Item name="name" label="令牌名称" rules={[{ required: true, message: "请输入令牌名称" }]}><Input placeholder="例如：Claude 只读运维" /></Form.Item><Form.Item name="client" label="客户端" rules={[{ required: true }]}><Select options={CLIENTS.map((item) => ({ value: item.key, label: item.name }))} /></Form.Item><Form.Item name="serverScope" label="授权服务器范围" rules={[{ required: true }]}><Input placeholder="* 或服务器别名，多个用逗号分隔" /></Form.Item><Form.Item name="toolScope" label="工具范围" rules={[{ required: true }]}><Select options={[{ value: "readonly", label: "只读探针（推荐）" }, { value: "*", label: "全部已实现工具（仍受策略和审批约束）" }]} /></Form.Item><Form.Item name="expiresAt" label="有效期（可选）"><Input placeholder="2026-12-31 23:59:59，留空为永久" /></Form.Item></Form></Modal>
    <Modal title="配置内容" open={Boolean(config)} onCancel={() => setConfig(null)} footer={<Button onClick={() => config && copyText(config.content)} icon={<Clipboard size={13} />}>复制配置</Button>} width={680}><div className="mb-2 text-xs text-slate-400">{config?.client} · {config?.path} · {config?.format}</div><pre className="max-h-96 overflow-auto rounded-lg border border-slate-800 bg-black p-3 text-[11px] text-emerald-300">{config?.content}</pre></Modal>
    <Modal title="新建令牌成功" open={Boolean(secret)} onCancel={() => setSecret(null)} footer={<Button type="primary" onClick={() => { if (secret) copyText(secret); setSecret(null); }}>复制并关闭</Button>}><div className="space-y-3 text-xs"><div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-amber-200">完整令牌只显示这一次，关闭后无法再次读取。</div><code className="block break-all rounded-lg bg-black p-3 font-mono text-emerald-300">{secret}</code></div></Modal>
  </div>;
}

function Endpoint({ icon, title, state, tone, value, action }: { icon: ReactNode; title: string; state: string; tone: "success" | "warning" | "info"; value: string; action: ReactNode }) {
  const color = tone === "success" ? "text-emerald-300 bg-emerald-500/20" : tone === "warning" ? "text-amber-300 bg-amber-500/20" : "text-indigo-300 bg-indigo-500/20";
  return <div className="rounded-lg border border-slate-800 bg-surface-950 p-3"><div className="flex items-center justify-between"><span className="flex items-center gap-1.5 font-mono text-xs font-bold text-white">{icon}{title}</span><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${color}`}>{state}</span></div><div className="mt-2 truncate font-mono text-[11px] text-slate-400" title={value}>{value}</div><div className="mt-1 flex items-center gap-1">{action}</div></div>;
}
