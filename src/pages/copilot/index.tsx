import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Input, Modal, Select, Spin, Tag, message } from "antd";
import {
  Activity,
  Bot,
  Database,
  GitMerge,
  History,
  Lock,
  Send,
  ShieldAlert,
  ShieldCheck,
  TerminalSquare,
  Unlock,
} from "lucide-react";
import { copilotApi } from "@/lib/api/copilot";
import { getErrorMessage } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";
import { useAppStore } from "@/store";
import type { AiApproval, CopilotProgress, CopilotToolCall, Server } from "@/types";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: CopilotToolCall[];
  warnings?: string[];
}

const QUICK_PROMPTS = [
  { icon: Activity, color: "text-emerald-400", title: "检查服务器健康", description: "磁盘 / 内存 / uptime，只读探针", prompt: "检查所有服务器的健康状态" },
  { icon: Database, color: "text-cyan-400", title: "查看磁盘和内存", description: "快速定位资源使用异常", prompt: "查看当前服务器的磁盘和内存" },
  { icon: ShieldAlert, color: "text-amber-400", title: "确认 Nginx 状态", description: "检查服务是否正在运行", prompt: "检查当前服务器 nginx 状态" },
  { icon: GitMerge, color: "text-violet-400", title: "查看最近日志", description: "返回最近 50 行系统日志", prompt: "查看当前服务器最近日志" },
];

const INITIAL_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "你好，我是本地受控运维助手。可运行只读探针；改动操作只开放明确选择服务器后的“重启 nginx”申请，需解锁总开关并经人工批准。其他改动指令不会执行。",
};

export default function CopilotPage() {
  const navigate = useNavigate();
  const aiLocked = useAppStore((state) => state.aiLocked);
  const setAiLockState = useAppStore((state) => state.setAiLockState);
  const setAiUnlockDuration = useAppStore((state) => state.setAiUnlockDuration);
  const activeServerId = useAppStore((state) => state.activeServerId);
  const setActiveServerId = useAppStore((state) => state.setActiveServerId);
  const [servers, setServers] = useState<Server[]>([]);
  const [serverId, setServerId] = useState<number | null>(activeServerId);
  const [provider, setProvider] = useState(() => localStorage.getItem("ops_copilot_provider") ?? "local-safe-tools");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem("ops_copilot_history");
      const parsed = saved ? JSON.parse(saved) as ChatMessage[] : [];
      return parsed.length ? parsed : [INITIAL_MESSAGE];
    } catch {
      return [INITIAL_MESSAGE];
    }
  });
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<CopilotProgress | null>(null);
  const [approvals, setApprovals] = useState<AiApproval[]>([]);
  const [approvalBusy, setApprovalBusy] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    void serverApi.list().then((items) => {
      if (!mounted) return;
      setServers(items);
      if (activeServerId && items.some((item) => item.id === activeServerId)) setServerId(activeServerId);
      else if (items.length === 1) setServerId(items[0].id);
    }).catch((error) => { if (mounted) message.error(getErrorMessage(error)); });
    return () => { mounted = false; };
  }, [activeServerId]);

  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    void listen<CopilotProgress>("copilot-progress", (event) => {
      if (!disposed) setProgress(event.payload);
    }).then((unlisten) => {
      if (disposed) unlisten(); else stop = unlisten;
    }).catch(() => undefined);
    return () => { disposed = true; stop?.(); };
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, progress]);

  const refreshApprovals = async () => {
    try { setApprovals(await copilotApi.listApprovals()); }
    catch (error) { message.error(getErrorMessage(error)); }
  };

  useEffect(() => {
    void refreshApprovals();
    const timer = window.setInterval(() => void refreshApprovals(), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const changeLock = async () => {
    try {
      const result = await copilotApi.setLock(aiLocked ? "30m" : "locked");
      if (aiLocked) setAiUnlockDuration("30m");
      setAiLockState(result.locked, result.unlockUntil === null ? null : result.unlockUntil * 1000);
    } catch (error) { message.error(getErrorMessage(error)); }
  };

  const rejectApproval = async (id: number) => {
    setApprovalBusy(id);
    try { await copilotApi.rejectApproval(id); await refreshApprovals(); }
    catch (error) { message.error(getErrorMessage(error)); }
    finally { setApprovalBusy(null); }
  };

  const approveApproval = (item: AiApproval) => {
    Modal.confirm({
      title: "批准并执行远程操作？",
      content: `${item.serverAlias}：${item.command}。放行后会立即执行，不能撤销。`,
      okText: "批准并执行",
      okButtonProps: { danger: true },
      cancelText: "取消",
      async onOk() {
        setApprovalBusy(item.id);
        try {
          const result = await copilotApi.approveApproval(item.id);
          await refreshApprovals();
          if (result.status === "completed") message.success("操作执行成功");
          else message.error(result.result || "操作执行失败");
        } catch (error) { message.error(getErrorMessage(error)); }
        finally { setApprovalBusy(null); }
      },
    });
  };

  useEffect(() => {
    localStorage.setItem("ops_copilot_provider", provider);
  }, [provider]);

  useEffect(() => {
    if (messages.length > 1) localStorage.setItem("ops_copilot_history", JSON.stringify(messages));
  }, [messages]);

  const serverOptions = useMemo(() => [
    { value: null, label: "自动选择（问题中指定或单台服务器）" },
    ...servers.map((server) => ({ value: server.id, label: `${server.alias} · ${server.hostname}` })),
  ], [servers]);

  const send = async (prompt = input) => {
    const text = prompt.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: text }]);
    setLoading(true);
    setProgress({ stage: "queued", message: "正在分析问题并选择受控工具", serverAlias: null, completed: false });
    try {
      const result = await copilotApi.chat({ message: text, serverId: serverId ?? null, provider });
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: result.reply, toolCalls: result.toolCalls, warnings: result.warnings }]);
      if (result.toolCalls.some((tool) => tool.approvalId)) await refreshApprovals();
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: `请求失败：${errorMessage}` }]);
      message.error(errorMessage);
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const clearHistory = () => {
    setMessages([INITIAL_MESSAGE]);
    localStorage.removeItem("ops_copilot_history");
    setProgress(null);
  };

  return (
    <div className="ops-page flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-800 bg-surface-950 p-0 text-xs" style={{ color: "var(--text-secondary)" }}>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-surface-900/95 p-3">
        <div className="flex min-w-0 items-center gap-2"><Bot size={17} className="text-indigo-400" /><div><h1 className="m-0 text-sm font-bold text-white">AI 桥接中心</h1><p className="m-0 mt-0.5 text-[11px] text-slate-400">受控工具调用 · 页面内对话 · 凭据隔离</p></div></div>
        <div className="flex items-center gap-2"><Button size="small" danger={aiLocked} type={aiLocked ? "default" : "primary"} icon={aiLocked ? <Lock size={13} /> : <Unlock size={13} />} onClick={() => void changeLock()}>{aiLocked ? "AI 操作已锁定" : "AI 操作已放行"}</Button><Button size="small" icon={<ShieldCheck size={13} />} onClick={() => void navigate("/settings")}>接入与策略</Button></div>
      </header>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-surface-950/80 px-4 py-2"><div className="flex flex-wrap items-center gap-4"><label className="flex items-center gap-2 text-slate-400">AI 服务商<Select size="small" value={provider} onChange={setProvider} options={[{ value: "local-safe-tools", label: "本地受控工具（推荐）" }, { value: "deepseek", label: "DeepSeek（需在设置中配置）" }, { value: "anthropic", label: "Anthropic（需在设置中配置）" }, { value: "openai", label: "OpenAI（需在设置中配置）" }]} /></label><label className="flex items-center gap-2 text-slate-400">目标服务器<Select size="small" className="min-w-64" value={serverId} onChange={(value) => { setServerId(value); setActiveServerId(value); }} options={serverOptions} /></label></div><Button size="small" type="text" icon={<History size={14} />} onClick={clearHistory}>清空对话</Button></div>

      <div className="flex shrink-0 items-center justify-between border-b border-emerald-500/20 bg-gradient-to-r from-emerald-950/40 via-surface-900 to-indigo-950/40 px-4 py-1.5 text-[11px]"><div className="flex items-center gap-2 text-emerald-300"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /><strong>凭据安全隔离已激活</strong><span className="text-slate-400">·</span><span className="text-slate-300">AI 只使用服务器别名和受控工具，SSH 凭据由系统凭据管理器托管</span></div><Button type="link" size="small" className="text-emerald-400" onClick={() => void navigate("/credentials")}>查看凭据状态</Button></div>

      {approvals.length > 0 && <section className="custom-scrollbar max-h-40 shrink-0 overflow-y-auto border-b border-amber-500/30 bg-amber-950/10 p-3"><div className="mb-2 font-semibold text-amber-300">人工审批 · 待处理 {approvals.filter((item) => item.status === "pending").length}</div>{approvals.filter((item) => item.status === "pending").map((item) => <div key={item.id} className="mb-1 flex flex-wrap items-center justify-between gap-2 rounded border border-slate-700 px-2 py-1"><span>#{item.id} · {item.serverAlias} · {item.command} · {new Date(item.expiresAt * 1000).toLocaleTimeString()} 过期</span><span className="flex gap-1"><Button size="small" disabled={approvalBusy !== null} onClick={() => void rejectApproval(item.id)}>拒绝</Button><Button size="small" danger loading={approvalBusy === item.id} disabled={approvalBusy !== null && approvalBusy !== item.id} onClick={() => approveApproval(item)}>批准并执行</Button></span></div>)}<details className="mt-1 text-slate-400"><summary className="cursor-pointer">最近审批记录</summary>{approvals.filter((item) => item.status !== "pending").slice(0, 10).map((item) => <div key={item.id} className="border-b border-slate-800 py-1">#{item.id} · {item.serverAlias} · {item.command} · {item.status}{item.result ? ` · ${item.result}` : ""}</div>)}</details></section>}

      <main className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4"><div className="mx-auto flex max-w-4xl flex-col gap-4">{messages.length === 1 && <div className="grid grid-cols-1 gap-3 pt-1 md:grid-cols-2">{QUICK_PROMPTS.map((item) => { const Icon = item.icon; return <button key={item.title} type="button" onClick={() => void send(item.prompt)} className="rounded-xl border border-slate-800 bg-surface-900 p-3.5 text-left transition hover:border-indigo-500/50 hover:bg-surface-850/60"><div className="flex items-center gap-2 font-bold text-white"><Icon size={16} className={item.color} /><span>{item.title}</span></div><p className="m-0 mt-1 text-[11px] text-slate-400">{item.description}</p></button>; })}</div>}{messages.map((item) => <article key={item.id} className={`rounded-xl border p-3.5 ${item.role === "user" ? "ml-auto max-w-3xl border-indigo-500/30 bg-indigo-950/30" : "mr-auto w-full border-slate-800 bg-surface-900"}`}><div className="mb-2 flex items-center gap-2 text-[11px] font-semibold">{item.role === "user" ? <><span className="text-indigo-300">你</span></> : <><Bot size={14} className="text-indigo-400" /><span className="text-slate-300">AI 助手</span></>}<span className="font-normal text-slate-600">{item.role === "assistant" ? "本地受控模式" : ""}</span></div><div className="whitespace-pre-wrap break-words leading-relaxed text-slate-200">{item.content}</div>{item.toolCalls?.length ? <div className="mt-3 space-y-2 border-t border-slate-800 pt-2">{item.toolCalls.map((tool, index) => <div key={`${tool.tool}-${tool.serverAlias}-${index}`} className="rounded border border-slate-800 bg-surface-950 p-2"><div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-1.5 font-mono text-[11px] text-cyan-300"><TerminalSquare size={13} />{tool.tool}{tool.serverAlias ? ` · ${tool.serverAlias}` : ""}</span><Tag color={tool.status === "success" ? "success" : tool.status === "blocked" ? "warning" : tool.status === "skipped" ? "default" : "error"}>{tool.status}</Tag></div><pre className="m-0 mt-1 max-h-52 overflow-auto whitespace-pre-wrap break-words text-[11px] text-slate-400">{tool.output}</pre></div>)}</div> : null}{item.warnings?.map((warning) => <Alert key={warning} className="mt-2" type="warning" showIcon message={warning} />)}</article>)}{loading && <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-surface-900 p-3 text-slate-400"><Spin size="small" />{progress?.message ?? "正在处理..."}{progress?.serverAlias ? ` · ${progress.serverAlias}` : ""}</div>}<div ref={bottomRef} /></div></main>

      <footer className="shrink-0 border-t border-slate-800 bg-surface-900 p-3"><div className="mb-2 flex items-center justify-between text-[11px] text-slate-500"><span>问点什么... AI 不会看到明文私钥或密码</span><div className="flex gap-1"><Tag bordered={false}>常用</Tag><Tag bordered={false}>监控</Tag><Tag bordered={false}>审批</Tag></div></div><div className="flex items-end gap-2"><Input.TextArea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} autoSize={{ minRows: 1, maxRows: 5 }} disabled={loading} placeholder="向 AI 咨询服务器状态、生成排障命令或分析日志..." /><Button type="primary" icon={<Send size={14} />} loading={loading} disabled={!input.trim()} onClick={() => void send()}>发送</Button></div><div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-300"><ShieldAlert size={12} />只读探针默认放行；仅支持经人工审批后重启 Nginx，其他改动请求不会执行。</div></footer>
    </div>
  );
}
