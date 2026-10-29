import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Empty, Input, Modal, Popconfirm, Select, Spin, Tag, message } from "antd";
import {
  Activity,
  Bookmark,
  Bot,
  ChevronDown,
  Database,
  GitMerge,
  History,
  Lock,
  Plus,
  Power,
  Puzzle,
  Send,
  ShieldAlert,
  ShieldCheck,
  TerminalSquare,
  Unlock,
  X,
} from "lucide-react";
import { copilotApi } from "@/lib/api/copilot";
import { getErrorMessage } from "@/lib/api/client";
import { modelServiceApi } from "@/lib/api/model-service";
import { serverApi } from "@/lib/api/server";
import { UNLOCK_DURATIONS, useAppStore, type UnlockDuration } from "@/store/app";
import type { AiApproval, CopilotProgress, CopilotToolCall, ModelProfile, Server } from "@/types";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: CopilotToolCall[];
  warnings?: string[];
  modelName?: string | null;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

interface CopilotExperience {
  id: string;
  title: string;
  content: string;
  createdAt: number;
}

const CHAT_SESSIONS_KEY = "ops_copilot_sessions";
const ACTIVE_CHAT_SESSION_KEY = "ops_copilot_active_session";
const LEGACY_HISTORY_KEY = "ops_copilot_history";
const EXPERIENCES_KEY = "ops_copilot_experiences";

const QUICK_PROMPTS = [
  { icon: Activity, color: "text-emerald-400", iconBg: "bg-emerald-500/10 border-emerald-500/20", title: "检查一台机器的健康度", description: "磁盘 / 内存 / 关键服务，只使用只读工具", prompt: "帮我检查当前机器的健康度" },
  { icon: ShieldAlert, color: "text-amber-400", iconBg: "bg-amber-500/10 border-amber-500/20", title: "最近有哪些 AI 操作被拦截", description: "查看审计记录和策略拦截原因", prompt: "查看最近被拦截的高危操作审计" },
  { icon: GitMerge, color: "text-indigo-400", iconBg: "bg-indigo-500/10 border-indigo-500/20", title: "部署前检查一台机器", description: "先检查环境与部署目标，不会直接执行变更", prompt: "帮我检查当前服务器的部署环境" },
  { icon: Database, color: "text-cyan-400", iconBg: "bg-cyan-500/10 border-cyan-500/20", title: "给我一份 Nginx 排障思路", description: "分析常见原因并给出验证步骤", prompt: "给我一份针对当前服务器的 nginx 排障思路" },
];

const INITIAL_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "你好，我是本地受控运维助手。可运行只读探针；改动操作只开放明确选择服务器后的“重启 nginx”申请，需解锁总开关并经人工批准。其他改动指令不会执行。",
};

function sessionTitle(messages: ChatMessage[]) {
  const firstUser = messages.find((item) => item.role === "user" && item.content.trim());
  if (!firstUser) return "新建对话";
  const title = firstUser.content.replace(/\s+/g, " ").trim();
  return title.length > 32 ? `${title.slice(0, 32)}…` : title;
}

function newChatSession(messages: ChatMessage[] = [INITIAL_MESSAGE]): ChatSession {
  const now = Date.now();
  return { id: crypto.randomUUID(), title: sessionTitle(messages), createdAt: now, updatedAt: now, messages };
}

function loadChatState(): { sessions: ChatSession[]; activeSessionId: string } {
  try {
    const stored = localStorage.getItem(CHAT_SESSIONS_KEY);
    const parsed = stored ? JSON.parse(stored) as ChatSession[] : [];
    const valid = Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item.id === "string" && Array.isArray(item.messages))
      : [];
    if (valid.length > 0) {
      const sessions = valid.map((item) => ({
        ...item,
        title: typeof item.title === "string" ? item.title : sessionTitle(item.messages),
        createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
        updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now(),
      }));
      const savedActiveId = localStorage.getItem(ACTIVE_CHAT_SESSION_KEY);
      return {
        sessions,
        activeSessionId: sessions.some((item) => item.id === savedActiveId) ? savedActiveId! : sessions[0].id,
      };
    }
    const legacy = localStorage.getItem(LEGACY_HISTORY_KEY);
    const oldMessages = legacy ? JSON.parse(legacy) as ChatMessage[] : [];
    const session = newChatSession(Array.isArray(oldMessages) && oldMessages.length > 0 ? oldMessages : [INITIAL_MESSAGE]);
    return { sessions: [session], activeSessionId: session.id };
  } catch {
    const session = newChatSession();
    return { sessions: [session], activeSessionId: session.id };
  }
}

function loadExperiences(): CopilotExperience[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(EXPERIENCES_KEY) ?? "[]") as CopilotExperience[];
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item.id === "string" && typeof item.title === "string" && typeof item.content === "string")
      : [];
  } catch {
    return [];
  }
}

function experienceDraft(messages: ChatMessage[]) {
  return messages
    .filter((item) => item.id !== "welcome" && item.content.trim())
    .map((item) => `${item.role === "user" ? "问题" : "处理思路"}：${item.content.trim()}`)
    .join("\n\n");
}

export default function CopilotPage() {
  const navigate = useNavigate();
  const aiLocked = useAppStore((state) => state.aiLocked);
  const aiUnlockUntil = useAppStore((state) => state.aiUnlockUntil);
  const aiUnlockDuration = useAppStore((state) => state.aiUnlockDuration);
  const setAiLockState = useAppStore((state) => state.setAiLockState);
  const setAiUnlockDuration = useAppStore((state) => state.setAiUnlockDuration);
  const syncAiLock = useAppStore((state) => state.syncAiLock);
  const activeServerId = useAppStore((state) => state.activeServerId);
  const setActiveServerId = useAppStore((state) => state.setActiveServerId);
  const [servers, setServers] = useState<Server[]>([]);
  const [serverId, setServerId] = useState<number | null>(activeServerId);
  const [modelProfiles, setModelProfiles] = useState<ModelProfile[]>([]);
  const [modelProfileId, setModelProfileId] = useState<string | null>(() => localStorage.getItem("ops_copilot_model_profile"));
  const [input, setInput] = useState("");
  const [chatState] = useState(loadChatState);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [experienceSaveOpen, setExperienceSaveOpen] = useState(false);
  const [experienceLibraryOpen, setExperienceLibraryOpen] = useState(false);
  const [experienceQuery, setExperienceQuery] = useState("");
  const [experienceTitle, setExperienceTitle] = useState("");
  const [experienceContent, setExperienceContent] = useState("");
  const [experiences, setExperiences] = useState<CopilotExperience[]>(loadExperiences);
  const [sessions, setSessions] = useState<ChatSession[]>(chatState.sessions);
  const [activeSessionId, setActiveSessionId] = useState(chatState.activeSessionId);
  const messages = useMemo(
    () => sessions.find((session) => session.id === activeSessionId)?.messages ?? [INITIAL_MESSAGE],
    [sessions, activeSessionId],
  );
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<CopilotProgress | null>(null);
  const [approvals, setApprovals] = useState<AiApproval[]>([]);
  const [approvalBusy, setApprovalBusy] = useState<number | null>(null);
  const [lockSaving, setLockSaving] = useState(false);
  const [lockPopoverOpen, setLockPopoverOpen] = useState(false);
  const [lockedPromptOpen, setLockedPromptOpen] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [sessionReadOnlyMode, setSessionReadOnlyMode] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const bottomRef = useRef<HTMLDivElement>(null);
  const lockWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void copilotApi.getLock().then((state) => {
      if (!active) return;
      if (!state.locked && state.unlockUntil === null) setAiUnlockDuration("forever");
      setAiLockState(state.locked, state.unlockUntil === null ? null : state.unlockUntil * 1000);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [setAiLockState, setAiUnlockDuration]);

  useEffect(() => {
    if (!lockPopoverOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!lockWrapperRef.current?.contains(event.target as Node)) setLockPopoverOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [lockPopoverOpen]);

  useEffect(() => {
    if (aiLocked || aiUnlockUntil === null) return;
    const timer = window.setInterval(() => { setNow(Date.now()); syncAiLock(); }, 1000);
    return () => window.clearInterval(timer);
  }, [aiLocked, aiUnlockUntil, syncAiLock]);

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
    let mounted = true;
    void modelServiceApi.listProfiles().then((items) => {
      if (!mounted) return;
      const enabled = items.filter((item) => item.enabled);
      setModelProfiles(enabled);
      if (modelProfileId && !enabled.some((item) => item.id === modelProfileId)) setModelProfileId(null);
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);

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

  const changeLock = async (duration: "locked" | UnlockDuration) => {
    setLockSaving(true);
    try {
      const result = await copilotApi.setLock(duration);
      if (duration !== "locked") setAiUnlockDuration(duration);
      setAiLockState(result.locked, result.unlockUntil === null ? null : result.unlockUntil * 1000);
      return !result.locked;
    } catch (error) { message.error(getErrorMessage(error)); }
    finally { setLockSaving(false); }
    return false;
  };

  const isForever = !aiLocked && aiUnlockUntil === null;
  const remainingSeconds = aiUnlockUntil === null ? 0 : Math.max(0, Math.floor((aiUnlockUntil - now) / 1000));
  const formatRemaining = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const pad = (value: number) => String(value).padStart(2, "0");
    return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`;
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
    if (modelProfileId) localStorage.setItem("ops_copilot_model_profile", modelProfileId);
    else localStorage.removeItem("ops_copilot_model_profile");
  }, [modelProfileId]);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_SESSIONS_KEY, JSON.stringify(sessions));
      localStorage.setItem(ACTIVE_CHAT_SESSION_KEY, activeSessionId);
      localStorage.removeItem(LEGACY_HISTORY_KEY);
    } catch {
      message.warning("本机历史记录空间不足，较早对话可能无法继续保存");
    }
  }, [sessions]);

  useEffect(() => {
    try {
      localStorage.setItem(EXPERIENCES_KEY, JSON.stringify(experiences));
    } catch {
      message.warning("本机空间不足，经验内容未能保存");
    }
  }, [experiences]);

  const updateSessionMessages = (sessionId: string, update: (current: ChatMessage[]) => ChatMessage[]) => {
    setSessions((current) => current.map((session) => {
      if (session.id !== sessionId) return session;
      const nextMessages = update(session.messages);
      return {
        ...session,
        title: sessionTitle(nextMessages),
        updatedAt: Date.now(),
        messages: nextMessages,
      };
    }));
  };

  const createSession = () => {
    const session = newChatSession();
    setSessions((current) => [session, ...current]);
    setActiveSessionId(session.id);
    setHistoryOpen(false);
    setInput("");
  };

  const switchSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setHistoryOpen(false);
    setInput("");
    setProgress(null);
  };

  const deleteSession = (sessionId: string) => {
    const remaining = sessions.filter((session) => session.id !== sessionId);
    if (remaining.length === 0) {
      const fresh = newChatSession();
      setSessions([fresh]);
      setActiveSessionId(fresh.id);
      return;
    }
    setSessions(remaining);
    if (sessionId === activeSessionId) setActiveSessionId(remaining[0].id);
  };

  useEffect(() => {
    localStorage.setItem(ACTIVE_CHAT_SESSION_KEY, activeSessionId);
  }, [activeSessionId]);

  const serverOptions = useMemo(() => [
    { value: null, label: "自动选择（问题中指定或单台服务器）" },
    ...servers.map((server) => ({ value: server.id, label: `${server.alias} · ${server.hostname}` })),
  ], [servers]);

  const send = async (prompt = input, bypassLockPrompt = false) => {
    const text = prompt.trim();
    if (!text || loading) return;
    if (!bypassLockPrompt && !sessionReadOnlyMode) {
      try {
        const lockState = await copilotApi.getLock();
        setAiLockState(lockState.locked, lockState.unlockUntil === null ? null : lockState.unlockUntil * 1000);
        if (lockState.locked) {
          setPendingPrompt(text);
          setLockedPromptOpen(true);
          return;
        }
      } catch (error) {
        message.error(getErrorMessage(error));
        return;
      }
    }
    const requestSessionId = activeSessionId;
    setInput("");
    updateSessionMessages(requestSessionId, (current) => [...current, { id: crypto.randomUUID(), role: "user", content: text }]);
    setLoading(true);
    setProgress({ stage: "queued", message: "正在分析问题并选择受控工具", serverAlias: null, completed: false });
    try {
      const history = messages.filter((item) => item.id !== "welcome").slice(-12).map((item) => ({ role: item.role, content: item.content }));
      const result = await copilotApi.chat({ message: text, serverId: serverId ?? null, provider: modelProfileId ? "model" : "local-safe-tools", modelProfileId, history });
      updateSessionMessages(requestSessionId, (current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: result.reply, modelName: result.modelName, toolCalls: result.toolCalls, warnings: result.warnings }]);
      if (result.toolCalls.some((tool) => tool.approvalId)) await refreshApprovals();
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      updateSessionMessages(requestSessionId, (current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: `请求失败：${errorMessage}` }]);
      message.error(errorMessage);
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const continuePendingPrompt = async (mode: "readonly" | "unlock") => {
    const prompt = pendingPrompt;
    if (!prompt) {
      setLockedPromptOpen(false);
      return;
    }
    if (mode === "unlock") {
      const unlocked = await changeLock("30m");
      if (!unlocked) return;
    } else {
      setSessionReadOnlyMode(true);
    }
    setPendingPrompt(null);
    setLockedPromptOpen(false);
    await send(prompt, true);
  };

  const clearHistory = () => {
    updateSessionMessages(activeSessionId, () => [INITIAL_MESSAGE]);
    setProgress(null);
  };

  const openExperienceSave = () => {
    const draft = experienceDraft(messages);
    if (!draft) {
      message.info("当前对话还没有可保存的内容");
      return;
    }
    setExperienceTitle(sessionTitle(messages) === "新建对话" ? "运维排障经验" : sessionTitle(messages));
    setExperienceContent(draft);
    setExperienceSaveOpen(true);
  };

  const saveExperience = () => {
    const title = experienceTitle.trim();
    const content = experienceContent.trim();
    if (!title || !content) {
      message.warning("请填写经验标题和内容");
      return;
    }
    const item: CopilotExperience = { id: crypto.randomUUID(), title, content, createdAt: Date.now() };
    setExperiences((current) => [item, ...current]);
    setExperienceSaveOpen(false);
    message.success("已保存到本机经验库");
  };

  const matchingSessions = sessions
    .filter((session) => `${session.title} ${session.messages.map((item) => item.content).join(" ")}`.toLocaleLowerCase().includes(historyQuery.trim().toLocaleLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const matchingExperiences = experiences.filter((item) => `${item.title} ${item.content}`.toLocaleLowerCase().includes(experienceQuery.trim().toLocaleLowerCase()));

  const lockControl = (
    <div className="w-72 space-y-3.5 p-1 text-xs">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <span className="flex items-center gap-2 font-semibold text-slate-100"><Power size={14} className="text-slate-400" />{aiLocked ? "AI 操作已锁定" : "AI 操作已放行"}</span>
        <button type="button" disabled={lockSaving} onClick={() => void changeLock(aiLocked ? aiUnlockDuration : "locked")} title="点击解锁或锁定" aria-label={aiLocked ? "解锁 AI 操作" : "锁定 AI 操作"} aria-pressed={!aiLocked} className={`relative h-5 w-10 shrink-0 rounded-full border-2 border-transparent transition-colors disabled:cursor-wait disabled:opacity-60 ${aiLocked ? "bg-slate-700" : "bg-emerald-600"}`}>
          <span className={`pointer-events-none absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] duration-200 ${aiLocked ? "left-0.5" : "left-[22px]"}`} />
        </button>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]"><span className="font-medium text-slate-400">限时放行</span>{!aiLocked && <span className="font-mono text-[10px] text-emerald-400">{isForever ? "永久不过期" : `倒计时 ${formatRemaining(remainingSeconds)}`}</span>}</div>
        <div className="grid grid-cols-4 gap-1 rounded-xl border border-slate-800 bg-surface-950 p-1 text-center font-mono text-xs">
          {UNLOCK_DURATIONS.map((duration) => {
            const selected = aiUnlockDuration === duration.id;
            return <button key={duration.id} type="button" disabled={lockSaving} onClick={() => void changeLock(duration.id as UnlockDuration)} className={`rounded-lg border py-1 transition disabled:cursor-wait disabled:opacity-50 ${selected ? "border-slate-700 bg-surface-800 font-bold text-white" : "border-transparent text-slate-400 hover:text-white"}`}>{duration.label}</button>;
          })}
        </div>
      </div>
      <p className="m-0 border-t border-slate-800/80 pt-2 text-[11px] leading-relaxed text-slate-400">关闭总开关后，AI 的改动型操作会被拒绝，只读工具仍可使用；限时放行到期后自动锁定。</p>
    </div>
  );

  return (
    <div className="ops-page ops-copilot-page flex h-full min-h-0 flex-col overflow-hidden bg-[#0a0d14] p-0 font-sans" style={{ color: "var(--text-secondary)" }}>
      <Modal
        open={lockedPromptOpen}
        centered
        width={480}
        footer={null}
        closable
        maskClosable={false}
        onCancel={() => { setLockedPromptOpen(false); setPendingPrompt(null); }}
        title={<span className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/20 text-amber-400"><ShieldAlert size={16} /></span><span className="text-sm font-bold">AI 操作当前已锁定</span></span>}
      >
        <div className="space-y-2 text-xs leading-relaxed text-slate-300">
          <p className="m-0 font-medium text-slate-200">是否开启 AI 操作 30 分钟，让 AI 能运行改动型工具？</p>
          <p className="m-0 text-[11px] text-slate-400">选择“仅只读模式”：AI 只能运行 system_info、disk_usage、tail_log 等只读工具，本会话内不再询问；也可以随时在上方状态条开启。</p>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <Button size="small" onClick={() => void continuePendingPrompt("readonly")}>仅只读模式</Button>
          <Button size="small" type="primary" loading={lockSaving} disabled={lockSaving} onClick={() => void continuePendingPrompt("unlock")}><span className="inline-flex items-center gap-1.5"><Unlock size={13} />开启 30 分钟</span></Button>
        </div>
      </Modal>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-surface-900/95 px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2"><Bot size={18} className="text-indigo-400" /><div><h1 className="m-0 text-sm font-bold text-white">AI 助手</h1><p className="m-0 mt-0.5 text-[11px] text-slate-400">让 AI 帮你查看和操作服务器；每一步都受 AI 操作策略约束，并记入审计</p></div></div>
        <div className="flex items-center gap-2">
          <div ref={lockWrapperRef} className="relative">
            <button type="button" aria-expanded={lockPopoverOpen} onClick={() => setLockPopoverOpen((open) => !open)} className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium shadow-sm transition ${aiLocked ? "border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"}`}>
              {aiLocked ? <Lock size={13} /> : <Unlock size={13} />}
              <span>{aiLocked ? "AI 操作已锁定" : isForever ? "AI 操作放行中 · 永久" : `放行中 · ${formatRemaining(remainingSeconds)}`}</span>
              <ChevronDown size={12} />
            </button>
            {lockPopoverOpen && <div onPointerDown={(event) => event.stopPropagation()} className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-slate-700 bg-[#0f141c] p-4 text-xs shadow-2xl">
              {lockControl}
            </div>}
          </div>
          <Button size="small" icon={<ShieldCheck size={13} />} onClick={() => void navigate("/settings")}>接入与策略</Button>
        </div>
      </header>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 bg-surface-950/60 px-5 py-2 text-xs">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-800 bg-[#0e131b] px-2.5 text-slate-400"><Bot size={14} className="text-indigo-400" /><span className="text-[11px]">内置对话</span><Select size="small" variant="borderless" className="min-w-44" value={modelProfileId ?? "local-safe-tools"} onChange={(value) => setModelProfileId(value === "local-safe-tools" ? null : value)} options={[{ value: "local-safe-tools", label: "本地受控工具" }, ...modelProfiles.map((profile) => ({ value: profile.id, label: `${profile.name} · ${profile.model || "未指定模型"}` }))]} /></label>
          <label className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-800 bg-[#0e131b] px-2.5 text-slate-400"><Database size={14} className="text-teal-400" /><span className="sr-only">目标服务器</span><Select size="small" variant="borderless" className="min-w-52 max-w-72" value={serverId} onChange={(value) => { setServerId(value); setActiveServerId(value); }} options={serverOptions} /></label>
          <Button size="small" className="!h-8 !border-slate-800 !bg-[#0e131b] !text-slate-300" icon={<Puzzle size={14} className="text-amber-400" />} onClick={() => message.info("AI 工具由当前服务器策略和 MCP 接入配置共同控制")}>外部工具</Button>
          <span className="px-1 text-[11px] text-slate-500">{sessions.length} 个会话</span>
        </div>
        <div className="flex items-center gap-3 text-slate-400">
          <button type="button" onClick={() => setHistoryOpen(true)} className="flex items-center gap-1 transition hover:text-white"><History size={14} />历史</button>
          <button type="button" onClick={openExperienceSave} className="flex items-center gap-1 transition hover:text-white"><Bookmark size={14} />存为经验</button>
          <button type="button" onClick={() => setExperienceLibraryOpen(true)} className="flex items-center gap-1 transition hover:text-white">经验库{experiences.length > 0 ? ` (${experiences.length})` : ""}</button>
          <button type="button" onClick={createSession} className="flex items-center gap-1 font-medium text-slate-300 transition hover:text-white"><Plus size={14} />新对话</button>
          <Popconfirm title="清空当前对话内容？" okText="清空" cancelText="取消" onConfirm={clearHistory}><button type="button" className="text-[11px] transition hover:text-rose-300">清空</button></Popconfirm>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-amber-500/20 bg-amber-950/15 px-4 py-1.5 text-[11px]"><div className="flex items-center gap-2 text-amber-200"><ShieldAlert size={13} /><span>选择模型后，当前问题、最近对话和脱敏后的只读结果会发送给对应模型服务商；SSH 凭据不会发送。</span></div><Button type="link" size="small" className="text-emerald-400" onClick={() => void navigate("/credentials")}>查看凭据状态</Button></div>

      {approvals.length > 0 && <section className="custom-scrollbar max-h-40 shrink-0 overflow-y-auto border-b border-amber-500/30 bg-amber-950/10 p-3"><div className="mb-2 font-semibold text-amber-300">人工审批 · 待处理 {approvals.filter((item) => item.status === "pending").length}</div>{approvals.filter((item) => item.status === "pending").map((item) => <div key={item.id} className="mb-1 flex flex-wrap items-center justify-between gap-2 rounded border border-slate-700 px-2 py-1"><span>#{item.id} · {item.serverAlias} · {item.command} · {new Date(item.expiresAt * 1000).toLocaleTimeString()} 过期</span><span className="flex gap-1"><Button size="small" disabled={approvalBusy !== null} onClick={() => void rejectApproval(item.id)}>拒绝</Button><Button size="small" danger loading={approvalBusy === item.id} disabled={approvalBusy !== null && approvalBusy !== item.id} onClick={() => approveApproval(item)}>批准并执行</Button></span></div>)}<details className="mt-1 text-slate-400"><summary className="cursor-pointer">最近审批记录</summary>{approvals.filter((item) => item.status !== "pending").slice(0, 10).map((item) => <div key={item.id} className="border-b border-slate-800 py-1">#{item.id} · {item.serverAlias} · {item.command} · {item.status}{item.result ? ` · ${item.result}` : ""}</div>)}</details></section>}

      <Modal title={<span className="flex items-center gap-2"><History size={16} />历史对话 <Tag className="m-0">{sessions.length}</Tag></span>} open={historyOpen} onCancel={() => setHistoryOpen(false)} footer={null} width={620} destroyOnClose>
        <div className="mb-3 flex items-center justify-between gap-2"><Input.Search allowClear value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="搜索对话标题或内容" className="max-w-sm" /><Button icon={<Plus size={13} />} onClick={createSession}>新建对话</Button></div>
        <div className="max-h-[55vh] space-y-1 overflow-y-auto pr-1">
          {matchingSessions.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={historyQuery ? "没有匹配的对话" : "暂无历史对话"} /> : matchingSessions.map((session) => (
            <div key={session.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 ${session.id === activeSessionId ? "border-indigo-500/60 bg-indigo-950/30" : "border-slate-800 bg-surface-950"}`}>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => switchSession(session.id)}>
                <div className="flex items-center gap-2"><span className="truncate text-xs font-semibold text-slate-200">{session.title}</span>{session.id === activeSessionId && <Tag color="blue" className="m-0">当前</Tag>}</div>
                <div className="mt-1 truncate text-[11px] text-slate-500">{session.messages.find((item) => item.role === "user")?.content ?? "暂无提问"}</div>
                <div className="mt-1 text-[10px] text-slate-500">{session.messages.filter((item) => item.role === "user").length} 条提问 · {new Date(session.updatedAt).toLocaleString()}</div>
              </button>
              <Button size="small" type={session.id === activeSessionId ? "default" : "primary"} ghost={session.id !== activeSessionId} onClick={() => switchSession(session.id)}>{session.id === activeSessionId ? "已打开" : "继续"}</Button>
              <Popconfirm title="删除这段历史对话？" okText="删除" cancelText="取消" onConfirm={() => deleteSession(session.id)}>
                <Button type="text" danger size="small">删除</Button>
              </Popconfirm>
            </div>
          ))}
        </div>
      </Modal>

      <Modal title="存为经验" open={experienceSaveOpen} onCancel={() => setExperienceSaveOpen(false)} onOk={saveExperience} okText="保存到本机" cancelText="取消" width={640} destroyOnClose maskClosable={false}>
        <div className="space-y-3">
          <label className="block text-xs text-slate-400">经验标题<Input className="mt-1" maxLength={80} value={experienceTitle} onChange={(event) => setExperienceTitle(event.target.value)} placeholder="例如：Nginx 502 排查流程" /></label>
          <label className="block text-xs text-slate-400">排障过程与结论<Input.TextArea className="mt-1" rows={9} maxLength={12000} showCount value={experienceContent} onChange={(event) => setExperienceContent(event.target.value)} placeholder="整理可复用的问题、检查步骤和结论" /></label>
          <Alert type="warning" showIcon message="内容仅保存在本机，不会同步给团队。保存前请检查并移除主机地址、账号、密钥等敏感信息；工具原始输出不会自动写入经验。" />
        </div>
      </Modal>

      <Modal title={<span className="flex items-center gap-2"><Bookmark size={16} />本机经验库 <Tag className="m-0">{experiences.length}</Tag></span>} open={experienceLibraryOpen} onCancel={() => setExperienceLibraryOpen(false)} footer={null} width={720} destroyOnClose>
        <div className="mb-3 flex items-center justify-between gap-2"><Input.Search allowClear value={experienceQuery} onChange={(event) => setExperienceQuery(event.target.value)} placeholder="搜索经验标题或内容" className="max-w-sm" /><Button icon={<Bookmark size={13} />} onClick={() => { setExperienceLibraryOpen(false); openExperienceSave(); }}>从当前对话保存</Button></div>
        <div className="max-h-[58vh] space-y-2 overflow-y-auto pr-1">
          {matchingExperiences.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={experienceQuery ? "没有匹配的经验" : "还没有保存的经验"} /> : matchingExperiences.map((item) => (
            <article key={item.id} className="rounded-lg border border-slate-800 bg-surface-950 p-3">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="m-0 truncate text-sm font-semibold text-slate-100">{item.title}</h3><p className="mb-0 mt-1 text-[10px] text-slate-500">保存于 {new Date(item.createdAt).toLocaleString()}</p></div><div className="flex shrink-0 items-center gap-1"><Button size="small" onClick={() => { setInput((current) => current ? `${current}\n\n参考本机经验「${item.title}」：\n${item.content}` : `参考本机经验「${item.title}」：\n${item.content}`); setExperienceLibraryOpen(false); }}>放入对话</Button><Popconfirm title="删除这条本机经验？" okText="删除" cancelText="取消" onConfirm={() => setExperiences((current) => current.filter((experience) => experience.id !== item.id))}><Button size="small" danger type="text">删除</Button></Popconfirm></div></div>
              <details className="mt-2"><summary className="cursor-pointer text-[11px] text-indigo-300">查看内容</summary><pre className="mb-0 mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-black/20 p-2 text-xs leading-relaxed text-slate-300">{item.content}</pre></details>
            </article>
          ))}
        </div>
      </Modal>

      <main className="custom-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
        <div className="flex w-full flex-col gap-5">
          {messages.length === 1 && messages[0]?.id === "welcome" ? <div className="space-y-6 py-8 text-center">
            <div className="mx-auto max-w-3xl space-y-2"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-500/25 bg-indigo-500/10 text-indigo-400 shadow-inner"><Bot size={24} /></div><h2 className="m-0 text-base font-bold text-white">有什么可以帮你？</h2><p className="mx-auto max-w-md text-xs leading-relaxed text-slate-400">AI 会调用你授权的工具查看、操作服务器，每一步都受 AI 操作策略约束并记入审计。</p></div>
            <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-3 text-left md:grid-cols-2">{QUICK_PROMPTS.map((item) => { const Icon = item.icon; return <button key={item.title} type="button" disabled={loading} onClick={() => void send(item.prompt)} className="group space-y-1.5 rounded-xl border border-slate-800/80 bg-[#0f141c] p-4 text-left transition hover:border-slate-700 hover:bg-surface-900/60 disabled:opacity-60"><div className="flex items-center gap-2 text-xs font-bold text-white transition group-hover:text-indigo-400"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${item.iconBg}`}><Icon size={14} className={item.color} /></span><span>{item.title}</span></div><p className="m-0 pl-9 text-[11px] leading-relaxed text-slate-400">{item.description}</p></button>; })}</div>
            <div className="mx-auto flex max-w-3xl items-center justify-center gap-1.5 pt-2 text-[11px] text-slate-500"><History size={14} className="text-slate-600" /><span>对话会自动保存，可在上方“历史”中继续。</span></div>
          </div> : messages.filter((item) => item.id !== "welcome").map((item) => item.role === "user" ? (
            <div key={item.id} className="flex w-full justify-end pr-1 sm:pr-2"><article className="inline-flex max-w-2xl items-center rounded-2xl rounded-tr-md border border-slate-700/80 bg-[#1e2330] px-5 py-2.5 text-xs leading-normal text-slate-100 shadow-sm transition hover:bg-[#242a3a]"><div className="whitespace-pre-wrap break-words">{item.content}</div></article></div>
          ) : (
            <article key={item.id} className="w-full space-y-3.5 rounded-2xl border border-slate-800/90 bg-[#0f141c] p-5 text-xs shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5"><div className="flex flex-wrap items-center gap-2"><span className="flex items-center gap-1.5 font-bold text-white"><Bot size={15} className="text-indigo-400" />OpsPub AI 助手</span><Tag bordered={false} color={item.content.startsWith("请求失败：") ? "error" : "success"} className="m-0">{item.content.startsWith("请求失败：") ? "未完成" : "已完成"}</Tag>{item.toolCalls?.length ? <Tag bordered={false} color="blue" className="m-0">{item.toolCalls.length} 次工具调用</Tag> : null}</div><span className="text-[11px] text-slate-500">{item.modelName ? `模型 · ${item.modelName}` : "本地受控模式"}</span></div>
              <div className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-200">{item.content}</div>
              {item.toolCalls?.length ? <details className="overflow-hidden rounded-xl border border-slate-800/80 bg-[#0b0f16]"><summary className="flex cursor-pointer list-none items-center justify-between gap-2 bg-surface-900/60 px-3.5 py-2.5 text-xs transition hover:bg-surface-850/80"><span className="flex min-w-0 items-center gap-2 font-semibold text-slate-200"><TerminalSquare size={14} className="shrink-0 text-cyan-400" />执行过程 <span className="truncate font-normal text-slate-400">{item.toolCalls.length} 次工具调用</span></span><span className="shrink-0 text-[11px] text-slate-500">点击展开</span></summary><div className="space-y-2 border-t border-slate-800/80 bg-[#090c12] p-3.5">{item.toolCalls.map((tool, index) => <div key={`${tool.tool}-${tool.serverAlias}-${index}`} className="rounded-lg border border-slate-800/80 bg-[#0d121a] p-2.5"><div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-cyan-300"><TerminalSquare size={13} />{tool.tool}{tool.serverAlias ? <span className="font-sans font-normal text-slate-500">@{tool.serverAlias}</span> : null}</span><Tag color={tool.status === "success" ? "success" : tool.status === "blocked" ? "warning" : tool.status === "skipped" ? "default" : tool.status === "pending" ? "processing" : "error"}>{tool.status}</Tag></div><pre className="m-0 mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded bg-black/20 p-2 font-mono text-[11px] leading-relaxed text-slate-400">{tool.output || "无输出"}</pre></div>)}</div></details> : null}
              {item.warnings?.map((warning) => <Alert key={warning} className="mt-2" type="warning" showIcon message={warning} />)}
            </article>
          ))}
          {loading && <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-surface-900 p-3 text-slate-400"><Spin size="small" />{progress?.message ?? "正在处理..."}{progress?.serverAlias ? ` · ${progress.serverAlias}` : ""}</div>}
          <div ref={bottomRef} />
        </div>
      </main>

      <div className="mx-5 mb-2 flex shrink-0 items-center justify-between gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-2 text-xs text-amber-300"><div className="flex min-w-0 items-center gap-2"><ShieldAlert size={15} className="shrink-0 text-amber-400" /><span className="leading-relaxed">改动型操作受 AI 总开关、服务器策略和人工审批共同约束；模型服务仅接收当前对话及脱敏结果，不会收到 SSH 凭据。</span></div><button type="button" onClick={() => void navigate("/settings")} className="shrink-0 font-medium underline decoration-amber-500/50 underline-offset-2 hover:text-white">查看策略</button></div>

      <footer className="shrink-0 bg-surface-900 px-5 pb-4 pt-1"><div className="w-full space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500"><div className="flex items-center gap-2"><span className="text-slate-400">{serverId === null ? `可见 ${servers.length} 台` : "已选定服务器"}</span><span>·</span><span className="text-slate-400">{modelProfiles.find((profile) => profile.id === modelProfileId)?.model ?? (modelProfileId ? "已配置模型" : "本地受控工具")}</span></div><div className="flex flex-wrap items-center gap-1.5">{["继续", "建议", "验证", "重试", "说明", "总结"].map((chip) => <button key={chip} type="button" disabled={loading} onClick={() => setInput((current) => current ? `${current} ${chip}` : chip)} className="rounded border border-slate-800 bg-[#131924] px-2 py-0.5 text-[11px] text-slate-400 transition hover:bg-[#1a2332] hover:text-slate-200 disabled:opacity-50">{chip}</button>)}</div></div>
        <div className="flex items-end gap-2 rounded-2xl border border-slate-800 bg-[#0e131b] p-1.5 pl-4 shadow-lg transition hover:border-slate-700 focus-within:border-indigo-500/80"><Input.TextArea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} autoSize={{ minRows: 1, maxRows: 5 }} disabled={loading} bordered={false} className="!resize-none !bg-transparent" style={{ fontSize: 12, lineHeight: 1.5, fontFamily: "inherit" }} placeholder="问点什么…（AI 只看到服务器别名，看不到任何凭据）" /><Button size="small" type="text" aria-label="清空输入" title="清空输入" disabled={!input} onClick={() => setInput("")} className="!text-slate-500 hover:!text-slate-200"><X size={15} /></Button><Button size="small" type="primary" icon={<Send size={14} />} loading={loading} disabled={!input.trim()} onClick={() => void send()}>发送</Button></div>
      </div></footer>
    </div>
  );
}
