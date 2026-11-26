import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { listen } from "@tauri-apps/api/event";
import { useStore } from "zustand";
import { useLocation, useNavigate } from "react-router-dom";
import { Alert, Button, Empty, Input, Modal, Popconfirm, Select, Spin, Tag, Tooltip, message } from "antd";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Activity,
  BadgeInfo,
  Bookmark,
  Bot,
  Copy,
  ChevronDown,
  Database,
  FileText,
  GitFork,
  GitMerge,
  History,
  Lock,
  Layers,
  Plus,
  Pencil,
  Power,
  Puzzle,
  RotateCw,
  Send,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  Settings2,
  TerminalSquare,
  Unlock,
  X,
} from "lucide-react";
import { copilotApi } from "@/lib/api/copilot";
import { getErrorMessage } from "@/lib/api/client";
import { modelServiceApi } from "@/lib/api/model-service";
import { serverApi } from "@/lib/api/server";
import { skillsApi } from "@/lib/api/skills";
import { WorkspaceSidebarSlot } from "@/components/layout/WorkspaceNavigation";
import { chatSkillContext, matchChatSkills, parseBuiltinSkills, parseUserSkills, resolveChatSkills, SKILLS_STORAGE_KEY, skillDocument, type ChatSkill } from "@/lib/copilot-skills";
import { UNLOCK_DURATIONS, useAppStore, type UnlockDuration } from "@/store/app";
import type { AiApproval, AiApprovalDetail, CopilotProgress, CopilotToolCall, ModelProfile, Server } from "@/types";
import { createApprovalPreviewStore, visibleApprovalPreview, type ApprovalPreview, type ApprovalRequestOwner } from "./approval-preview";
import { createCopilotChatStore, sessionTitle, type ChatMessage, type ChatSession } from "./chat-state";
import skillsIndex from "../../../docs/skills-index-20261006.md?raw";

interface CopilotExperience {
  id: string;
  title: string;
  content: string;
  createdAt: number;
}

const CHAT_SESSIONS_KEY = "ops_copilot_sessions";
const ACTIVE_CHAT_SESSION_KEY = "ops_copilot_active_session";
const RUNTIME_CHAT_SESSION_KEY = "ops_copilot_runtime_session";
const RUNTIME_POLICY_NOTICE_DISMISSED_KEY = "ops_copilot_policy_notice_dismissed";
const LEGACY_HISTORY_KEY = "ops_copilot_history";
const EXPERIENCES_KEY = "ops_copilot_experiences";

const BUILTIN_CHAT_SKILLS = parseBuiltinSkills(skillsIndex);

const QUICK_PROMPTS = [
  { icon: Activity, color: "text-[var(--success)]", iconBg: "bg-emerald-500/10 border-emerald-500/20", title: "检查一台机器的健康度", description: "磁盘 / 内存 / 关键服务，只使用只读工具", prompt: "帮我检查当前机器的健康度" },
  { icon: ShieldAlert, color: "text-[var(--warning)]", iconBg: "bg-amber-500/10 border-amber-500/20", title: "最近有哪些 AI 操作被拦截", description: "查看审计记录和策略拦截原因", prompt: "查看最近被拦截的高危操作审计" },
  { icon: GitMerge, color: "text-[var(--accent)]", iconBg: "bg-indigo-500/10 border-indigo-500/20", title: "部署前检查一台机器", description: "先检查环境与部署目标，不会直接执行变更", prompt: "帮我检查当前服务器的部署环境" },
  { icon: Database, color: "text-[var(--info)]", iconBg: "bg-cyan-500/10 border-cyan-500/20", title: "给我一份 Nginx 排障思路", description: "分析常见原因并给出验证步骤", prompt: "给我一份针对当前服务器的 nginx 排障思路" },
];

const INITIAL_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "你好，我是 OpsPub 运维助手。你可以直接用自然语言查询服务器信息，不需要逐条创建模板。查询命令会先由后端校验为安全只读操作；改动操作仍受风险策略和人工审批约束。",
};

function hasConversationContent(messages: ChatMessage[]) {
  return messages.some((item) => item.role === "user" && item.content.trim().length > 0);
}

function newChatSession(messages: ChatMessage[] = [INITIAL_MESSAGE]): ChatSession {
  const now = Date.now();
  return { id: crypto.randomUUID(), title: sessionTitle(messages), createdAt: now, updatedAt: now, messages };
}

function loadChatState(): { sessions: ChatSession[]; activeSessionId: string } {
  try {
    const stored = localStorage.getItem(CHAT_SESSIONS_KEY);
    const parsed = stored ? JSON.parse(stored) as ChatSession[] : [];
    let sessions = Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item.id === "string" && Array.isArray(item.messages) && hasConversationContent(item.messages))
      : [];
    if (sessions.length > 0) {
      sessions = sessions.map((item) => ({
        ...item,
        title: typeof item.title === "string" ? item.title : sessionTitle(item.messages),
        createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
        updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now(),
        skillIds: Array.isArray(item.skillIds) ? item.skillIds.filter((id): id is string => typeof id === "string") : [],
      }));
    } else {
      const legacy = localStorage.getItem(LEGACY_HISTORY_KEY);
      const oldMessages = legacy ? JSON.parse(legacy) as ChatMessage[] : [];
      if (Array.isArray(oldMessages) && hasConversationContent(oldMessages)) {
        sessions = [newChatSession(oldMessages)];
      }
    }

    const runtimeSessionId = sessionStorage.getItem(RUNTIME_CHAT_SESSION_KEY);
    let activeSession = sessions.find((session) => session.id === runtimeSessionId);
    if (!activeSession) {
      activeSession = newChatSession();
      sessions = [activeSession, ...sessions];
      sessionStorage.setItem(RUNTIME_CHAT_SESSION_KEY, activeSession.id);
    }
    return { sessions, activeSessionId: activeSession.id };
  } catch {
    const session = newChatSession();
    sessionStorage.setItem(RUNTIME_CHAT_SESSION_KEY, session.id);
    return { sessions: [session], activeSessionId: session.id };
  }
}

let chatStore: ReturnType<typeof createCopilotChatStore> | undefined;

function getChatStore() {
  if (chatStore) return chatStore;

  // 聊天记录的写入随请求存活，路由卸载后收到的最终答复也要保存。
  const store = createCopilotChatStore(loadChatState());
  store.subscribe((state, previous) => {
    try {
      if (state.sessions !== previous.sessions) {
        const persisted = state.sessions.filter((session) => hasConversationContent(session.messages));
        if (persisted.length > 0) localStorage.setItem(CHAT_SESSIONS_KEY, JSON.stringify(persisted));
        else localStorage.removeItem(CHAT_SESSIONS_KEY);
        localStorage.removeItem(LEGACY_HISTORY_KEY);
      }
      if (state.activeSessionId !== previous.activeSessionId) {
        localStorage.setItem(ACTIVE_CHAT_SESSION_KEY, state.activeSessionId);
        sessionStorage.setItem(RUNTIME_CHAT_SESSION_KEY, state.activeSessionId);
      }
    } catch {
      message.warning("本机历史记录空间不足，较早对话可能无法继续保存");
    }
  });
  chatStore = store;
  return store;
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

const MUTATING_TOOL_NAMES = new Set(["execute_command", "write_file", "sftp_write"]);

function isMutatingTool(tool: string) {
  return MUTATING_TOOL_NAMES.has(tool) || tool.startsWith("restart_");
}

function toolStatusLabel(status: CopilotToolCall["status"]) {
  return status === "success" ? "已完成" : status === "failed" ? "失败" : status === "blocked" ? "已拦截" : status === "pending" ? "待审批" : status === "running" ? "执行中" : "已跳过";
}

function approvalSecondsRemaining(expiresAt: number, nowMs: number) {
  return Math.max(0, Math.ceil((expiresAt * 1000 - nowMs) / 1000));
}

function formatApprovalCountdown(expiresAt: number, nowMs: number) {
  const remaining = approvalSecondsRemaining(expiresAt, nowMs);
  return `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
}

export default function CopilotPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const aiLocked = useAppStore((state) => state.aiLocked);
  const aiUnlockUntil = useAppStore((state) => state.aiUnlockUntil);
  const aiUnlockDuration = useAppStore((state) => state.aiUnlockDuration);
  const setAiLockState = useAppStore((state) => state.setAiLockState);
  const setAiUnlockDuration = useAppStore((state) => state.setAiUnlockDuration);
  const syncAiLock = useAppStore((state) => state.syncAiLock);
  const activeServerId = useAppStore((state) => state.activeServerId);
  const setActiveServerId = useAppStore((state) => state.setActiveServerId);
  const [servers, setServers] = useState<Server[]>([]);
  // 顶部会话选择器和 AI 对话必须共用同一个目标，避免本地副本在切换后继续发送旧 ID。
  const serverId = activeServerId;
  const [modelProfiles, setModelProfiles] = useState<ModelProfile[]>([]);
  const [modelProfileId, setModelProfileId] = useState<string | null>(() => localStorage.getItem("ops_copilot_model_profile"));
  const [input, setInput] = useState("");
  const [store] = useState(getChatStore);
  const [historyOpen, setHistoryOpen] = useState(false);
  // 安全提示的关闭选择跨软件重启保留；未关闭时每次进入 AI 助手都显示。
  const [showPolicyNotice, setShowPolicyNotice] = useState(() => localStorage.getItem(RUNTIME_POLICY_NOTICE_DISMISSED_KEY) !== "true");
  const [historyQuery, setHistoryQuery] = useState("");
  const [experienceSaveOpen, setExperienceSaveOpen] = useState(false);
  const [experienceLibraryOpen, setExperienceLibraryOpen] = useState(false);
  const [experienceQuery, setExperienceQuery] = useState("");
  const [experienceTitle, setExperienceTitle] = useState("");
  const [experienceContent, setExperienceContent] = useState("");
  const [skillDraftOpen, setSkillDraftOpen] = useState(false);
  const [skillDraft, setSkillDraft] = useState({ name: "", description: "", triggers: "", content: "" });
  const [skillDraftSaving, setSkillDraftSaving] = useState(false);
  const [chatSkills, setChatSkills] = useState<ChatSkill[]>(() => [...parseUserSkills(localStorage.getItem(SKILLS_STORAGE_KEY)), ...BUILTIN_CHAT_SKILLS]);
  const [suppressedAutoSkillIds, setSuppressedAutoSkillIds] = useState<string[]>([]);
  const [explainOpen, setExplainOpen] = useState(false);
  const [explainText, setExplainText] = useState("");
  const [explainResult, setExplainResult] = useState("");
  const [explainLoading, setExplainLoading] = useState(false);
  const [experiences, setExperiences] = useState<CopilotExperience[]>(loadExperiences);
  const sessions = useStore(store, (state) => state.sessions);
  const activeSessionId = useStore(store, (state) => state.activeSessionId);
  const request = useStore(store, (state) => state.requests.get(state.activeSessionId));
  const { setSessions, setActiveSessionId } = store;
  const selectedSkillIds = sessions.find((session) => session.id === activeSessionId)?.skillIds ?? [];
  const setSelectedSkillIds = (ids: string[]) => {
    setSessions((current) => current.map((session) => session.id === activeSessionId ? { ...session, skillIds: ids, updatedAt: Date.now() } : session));
  };
  const messages = useMemo(
    () => sessions.find((session) => session.id === activeSessionId)?.messages ?? [INITIAL_MESSAGE],
    [sessions, activeSessionId],
  );
  const matchedSkills = useMemo(() => matchChatSkills(chatSkills, input), [chatSkills, input]);
  const visibleSkillIds = useMemo(() => Array.from(new Set([
    ...selectedSkillIds.filter((id) => chatSkills.some((skill) => skill.id === id)),
    ...matchedSkills.filter((skill) => !suppressedAutoSkillIds.includes(skill.id)).map((skill) => skill.id),
  ])), [selectedSkillIds, chatSkills, matchedSkills, suppressedAutoSkillIds]);
  const loading = request !== undefined;
  const progress = request?.progress;
  const [approvals, setApprovals] = useState<AiApproval[]>([]);
  const [approvalDetails, setApprovalDetails] = useState<AiApprovalDetail[]>([]);
  const [approvalPreviewStore] = useState(createApprovalPreviewStore);
  const approvalPreview = useStore(approvalPreviewStore, (preview) => visibleApprovalPreview(preview, activeSessionId));
  const [approvalProgress, setApprovalProgress] = useState<CopilotProgress[]>([]);
  const [approvalBusy, setApprovalBusy] = useState<number | null>(null);
  const [lockSaving, setLockSaving] = useState(false);
  const [lockPopoverOpen, setLockPopoverOpen] = useState(false);
  const [lockedPromptOpen, setLockedPromptOpen] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [pendingRegenerateMessageId, setPendingRegenerateMessageId] = useState<string | null>(null);
  const [sessionReadOnlyMode, setSessionReadOnlyMode] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [highlightedApprovalId, setHighlightedApprovalId] = useState<number | null>(null);
  const chatScrollRef = useRef<HTMLElement>(null);
  const shouldFollowChatRef = useRef(true);
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
    if (!approvals.some((item) => item.status === "pending")) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [approvals]);

  useEffect(() => {
    let mounted = true;
    void serverApi.list().then((items) => {
      if (!mounted) return;
      setServers(items);
      const selectedStillExists = activeServerId !== null && items.some((item) => item.id === activeServerId);
      if (!selectedStillExists) {
        // 服务器被删除或首次只有一台时，修正全局选择，保证后端收到的 ID 一定来自当前列表。
        setActiveServerId(items.length === 1 ? items[0].id : null);
      }
    }).catch((error) => { if (mounted) message.error(getErrorMessage(error)); });
    return () => { mounted = false; };
  }, [activeServerId, setActiveServerId]);

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
    const syncUserSkills = () => {
      setChatSkills([...parseUserSkills(localStorage.getItem(SKILLS_STORAGE_KEY)), ...BUILTIN_CHAT_SKILLS]);
    };
    window.addEventListener("storage", syncUserSkills);
    return () => window.removeEventListener("storage", syncUserSkills);
  }, []);

  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    void listen<CopilotProgress>("copilot-progress", ({ payload }) => {
      if (!disposed && !payload.requestId && payload.stage.startsWith("plan_step")) {
        setApprovalProgress((current) => [...current, payload].slice(-20));
      }
    }).then((unlisten) => {
      if (disposed) unlisten(); else stop = unlisten;
    }).catch(() => undefined);
    return () => { disposed = true; stop?.(); };
  }, []);

  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    void listen("copilot-approval-changed", () => { if (!disposed) void refreshApprovals(); })
      .then((unlisten) => { if (disposed) unlisten(); else stop = unlisten; })
      .catch(() => undefined);
    return () => { disposed = true; stop?.(); };
  }, []);

  useLayoutEffect(() => {
    const container = chatScrollRef.current;
    const streamingFinalReply = loading && progress?.stage === "model_stream";
    if (!container || !shouldFollowChatRef.current) return;
    if (loading && !streamingFinalReply) {
      const activeEvents = container.querySelectorAll<HTMLElement>("[data-copilot-active-event]");
      activeEvents.item(activeEvents.length - 1)?.scrollIntoView({ behavior: "auto", block: "center" });
    } else {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, progress, loading]);

  const refreshApprovals = async () => {
    try {
      const details = await copilotApi.listApprovalDetails();
      setApprovalDetails(details);
      setApprovals(details.map((item) => item.approval));
    }
    catch (error) { message.error(getErrorMessage(error)); }
  };

  const approvalDetailById = useMemo(
    () => new Map(approvalDetails.map((item) => [item.approval.id, item])),
    [approvalDetails],
  );

  useEffect(() => {
    void refreshApprovals();
    const timer = window.setInterval(() => void refreshApprovals(), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const approvalIdFromQuery = useMemo(() => {
    const raw = new URLSearchParams(location.search).get("approvalId");
    if (!raw || !/^[1-9]\d*$/.test(raw)) return null;
    const value = Number(raw);
    return Number.isSafeInteger(value) ? value : null;
  }, [location.search]);

  useEffect(() => {
    if (approvalIdFromQuery === null) return;
    setHighlightedApprovalId(approvalIdFromQuery);
    const timer = window.setTimeout(() => {
      document.getElementById(`copilot-approval-${approvalIdFromQuery}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [approvalIdFromQuery, approvals, approvalDetails]);

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

  const updateApprovalToolCall = (id: number, status: CopilotToolCall["status"], output: string) => {
    setSessions((current) => current.map((session) => ({
      ...session,
      messages: session.messages.map((item) => ({
        ...item,
        toolCalls: item.toolCalls?.map((tool) => tool.approvalId === id ? { ...tool, status, output } : tool),
      })),
    })));
  };

  const copyAssistantMessage = async (item: ChatMessage, includeProcess = false) => {
    const lines = [item.content.trim()];
    if (includeProcess) {
      lines.push("", "### 分析与执行过程");
      if (item.skillNames?.length) lines.push(`- 参考技能：${item.skillNames.join("、")}`);
      item.toolCalls?.forEach((tool) => {
        lines.push(`- ${tool.tool}${tool.serverAlias ? ` @${tool.serverAlias}` : ""}：${toolStatusLabel(tool.status)}`);
        if (tool.output.trim()) lines.push(`  - 输出：${tool.output.trim().replace(/\n/g, "\n    ")}`);
      });
      const approvalIds = item.toolCalls?.map((tool) => tool.approvalId).filter((id): id is number => typeof id === "number") ?? [];
      approvalIds.forEach((id) => {
        const detail = approvalDetailById.get(id);
        if (detail) lines.push(`- 审批 #${id}：${detail.approval.status}，目标 ${detail.approval.serverAlias}，命令 ${detail.approval.command}`);
      });
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      message.success(includeProcess ? "回答与过程已复制" : "回答已复制");
    } catch (error) {
      message.error(`复制失败：${getErrorMessage(error)}`);
    }
  };

  const copyUserMessage = async (item: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(item.content);
      message.success("消息已复制");
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const editUserMessage = (messageId: string) => {
    if (loading) return;
    const index = messages.findIndex((item) => item.id === messageId && item.role === "user");
    if (index < 0) return;
    const item = messages[index];
    const followingMessages = messages.slice(index + 1);
    const hasPendingApproval = followingMessages.some((entry) => entry.toolCalls?.some((tool) => {
      if (tool.status === "pending") return true;
      if (typeof tool.approvalId !== "number") return false;
      return ["pending", "executing"].includes(approvalDetailById.get(tool.approvalId)?.approval.status ?? "");
    }));
    if (hasPendingApproval) {
      message.warning("后续对话存在待处理审批，请先处理审批后再编辑");
      return;
    }
    const hasExecutedMutation = followingMessages.some((entry) => entry.toolCalls?.some((tool) =>
      tool.status === "success" && isMutatingTool(tool.tool),
    ));
    const applyEdit = () => {
      setInput(item.content);
      updateSessionMessages(activeSessionId, (current) => {
        const currentIndex = current.findIndex((entry) => entry.id === messageId);
        return currentIndex < 0 ? current : current.slice(0, currentIndex);
      });
      message.info("已将消息放入输入框，后续回复已移除");
    };
    if (hasExecutedMutation) {
      Modal.confirm({
        title: "编辑这条消息？",
        content: "这会移除本机对话中的本消息及后续回复。已经执行的服务器操作不会撤销。",
        okText: "继续编辑",
        cancelText: "取消",
        onOk: applyEdit,
      });
      return;
    }
    applyEdit();
  };

  const forkFromMessage = (messageId: string) => {
    const index = messages.findIndex((item) => item.id === messageId);
    if (index < 0) return;
    const branch = newChatSession(messages.slice(0, index + 1).map((item) => ({
      ...item,
      toolCalls: item.toolCalls?.map((tool) => ({ ...tool })),
    })));
    branch.skillIds = [...selectedSkillIds];
    setSessions((current) => [branch, ...current]);
    setActiveSessionId(branch.id);
    setHistoryOpen(false);
    setInput("");
    setSuppressedAutoSkillIds([]);
    message.success("已从此回答创建分支对话");
  };

  const regenerateMessage = (item: ChatMessage) => {
    const index = messages.findIndex((entry) => entry.id === item.id);
    if (index < 0) return;
    const lastAssistantIndex = messages.reduce((last, entry, currentIndex) => entry.role === "assistant" ? currentIndex : last, -1);
    const isLatestAssistant = lastAssistantIndex === index && index === messages.length - 1;
    const hasPendingApproval = item.toolCalls?.some((tool) => tool.status === "pending" || (typeof tool.approvalId === "number" && ["pending", "executing"].includes(approvalDetailById.get(tool.approvalId)?.approval.status ?? ""))) ?? false;
    const hasExecutedMutation = item.toolCalls?.some((tool) => tool.status === "success" && isMutatingTool(tool.tool)) ?? false;
    if (!isLatestAssistant || hasPendingApproval || hasExecutedMutation) return;
    const sourceRequest = messages.slice(0, index).reverse().find((entry) => entry.role === "user")?.content;
    if (sourceRequest) void send(sourceRequest, false, item.id);
  };

  const rejectApproval = async (id: number) => {
    const approval = approvals.find((item) => item.id === id);
    if (approval && approvalSecondsRemaining(approval.expiresAt, Date.now()) === 0) {
      await refreshApprovals();
      message.warning("审批已超时，本次命令和后续步骤均未执行");
      return;
    }
    setApprovalBusy(id);
    try {
      await copilotApi.rejectApproval(id);
      updateApprovalToolCall(id, "blocked", "人工已拒绝，此命令未执行");
      await refreshApprovals();
    }
    catch (error) { message.error(getErrorMessage(error)); }
    finally { setApprovalBusy(null); }
  };

  const openApprovalPreview = (id: number, owner: ApprovalRequestOwner | null = null) => {
    const detail = approvalDetailById.get(id);
    if (detail) {
      setApprovalProgress([]);
      approvalPreviewStore.open(detail, owner);
    }
  };

  const reviewApproval = async (item: AiApproval, owner: ApprovalRequestOwner | null = null) => {
    if (approvalSecondsRemaining(item.expiresAt, Date.now()) === 0) {
      await refreshApprovals();
      message.warning("审批已超时，本次命令和后续步骤均未执行");
      return;
    }
    openApprovalPreview(item.id, owner);
  };

  const approveApproval = async (preview: ApprovalPreview) => {
    const id = approvalPreviewStore.reviewedApprovalId(preview, store.getState().activeSessionId);
    if (id === null) return;
    const item = approvalDetailById.get(id)?.approval ?? preview.detail.approval;
    if (approvalSecondsRemaining(item.expiresAt, Date.now()) === 0) {
      await refreshApprovals();
      message.warning("审批已超时，本次命令和后续步骤均未执行");
      return;
    }
    setApprovalBusy(id);
    setApprovalProgress([]);
    setApprovalDetails((current) => current.map((detail) => detail.approval.id === id
      ? { ...detail, approval: { ...detail.approval, status: "executing" } }
      : detail));
    try {
      const result = await copilotApi.approveApproval(id);
      updateApprovalToolCall(
        id,
        result.status === "completed" ? "success" : "failed",
        result.result || (result.status === "completed" ? "操作执行并验证完成" : "操作执行失败"),
      );
      await refreshApprovals();
      if (result.status === "completed") message.success("操作执行成功");
      else message.error(result.result || "操作执行失败");
    } catch (error) { message.error(getErrorMessage(error)); }
    finally { setApprovalBusy(null); }
  };

  useEffect(() => {
    if (modelProfileId) localStorage.setItem("ops_copilot_model_profile", modelProfileId);
    else localStorage.removeItem("ops_copilot_model_profile");
  }, [modelProfileId]);

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
    setSuppressedAutoSkillIds([]);
  };

  const switchSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setHistoryOpen(false);
    setInput("");
    setSuppressedAutoSkillIds([]);
  };

  const deleteSession = (sessionId: string) => {
    if (sessionId === activeSessionId) { setInput(""); setSuppressedAutoSkillIds([]); }
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

  const serverOptions = useMemo(() => [
    { value: null, label: "自动选择（问题中指定或单台服务器）" },
    ...servers.map((server) => ({ value: server.id, label: `${server.alias} · ${server.hostname}` })),
  ], [servers]);
  const selectedServer = servers.find((server) => server.id === serverId) ?? null;

  const send = async (prompt = input, bypassLockPrompt = false, regenerateMessageId: string | null = null) => {
    const text = prompt.trim();
    const requestSessionId = activeSessionId;
    if (!text || store.getState().requests.has(requestSessionId)) return;
    shouldFollowChatRef.current = true;
    if (!bypassLockPrompt && !sessionReadOnlyMode) {
      try {
        const lockState = await copilotApi.getLock();
        setAiLockState(lockState.locked, lockState.unlockUntil === null ? null : lockState.unlockUntil * 1000);
        if (lockState.locked) {
          setPendingPrompt(text);
          setPendingRegenerateMessageId(regenerateMessageId);
          setLockedPromptOpen(true);
          return;
        }
      } catch (error) {
        message.error(getErrorMessage(error));
        return;
      }
    }
    const currentMessages = store.getState().sessions.find((session) => session.id === requestSessionId)?.messages;
    if (!currentMessages) return;
    const regenerateIndex = regenerateMessageId ? currentMessages.findIndex((item) => item.id === regenerateMessageId) : -1;
    const requestMessages = regenerateIndex >= 0 ? currentMessages.slice(0, regenerateIndex) : currentMessages;
    const regenerateUserIndex = regenerateIndex >= 0
      ? requestMessages.reduce((last, item, index) => item.role === "user" ? index : last, -1)
      : -1;
    const historyMessages = regenerateUserIndex >= 0 ? requestMessages.slice(0, regenerateUserIndex) : requestMessages;
    // 每次重新匹配实际问题；自动命中的技能不写回会话，避免污染下一轮。
    const eligibleSkills = chatSkills.filter((skill) => !suppressedAutoSkillIds.includes(skill.id));
    const matchedThisTurn = matchChatSkills(eligibleSkills, text);
    const activeSkills = resolveChatSkills(eligibleSkills, selectedSkillIds, text, true);
    const activeSkillIds = new Set(activeSkills.map((skill) => skill.id));
    const triggeredSkillNames = matchedThisTurn.filter((skill) => activeSkillIds.has(skill.id)).map((skill) => skill.name);
    const manualSkillNames = activeSkills.filter((skill) => selectedSkillIds.includes(skill.id)).map((skill) => skill.name);
    const history = historyMessages.filter((item) => item.id !== "welcome").slice(-12).map((item) => ({ role: item.role, content: item.content }));
    const requestId = crypto.randomUUID();
    const started = store.beginRequest(requestSessionId, {
      id: requestId,
      role: "assistant",
      content: "",
      progressEvents: [{
        kind: "phase",
        stage: "skill_match",
        message: activeSkills.length > 0
          ? `已匹配 ${activeSkills.length} 个技能，正在探测可用工具`
          : "正在探测可用受控工具",
        serverAlias: null,
        completed: false,
      }],
      skillNames: activeSkills.map((skill) => skill.name),
      triggeredSkillNames,
      manualSkillNames,
      historyCount: history.length,
    }, (current) => regenerateIndex >= 0
      ? current.slice(0, regenerateIndex)
      : [...current, { id: crypto.randomUUID(), role: "user", content: text }]);
    if (!started) return;
    if (store.getState().activeSessionId === requestSessionId) {
      setInput("");
      setSuppressedAutoSkillIds([]);
    }
    let stopProgress: (() => void) | undefined;
    try {
      const skillContext = chatSkillContext(activeSkills);
      // 先注册监听再启动请求。监听随请求结束释放，页面卸载期间也能接收事件。
      stopProgress = await listen<CopilotProgress>("copilot-progress", ({ payload }) => {
        if (payload.requestId !== requestId) return;
        // 逐条提交，避免同一批事件等到任务结束后才渲染。
        flushSync(() => store.receiveProgress(requestSessionId, payload));
      }).catch(() => undefined);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const result = await copilotApi.chat({ requestId, message: text, serverId: serverId ?? null, provider: modelProfileId ? "model" : "local-safe-tools", modelProfileId, history, skillIds: activeSkills.map((skill) => skill.id), skillContext });
      store.finishRequest(requestSessionId, requestId, { result });
      if (result.toolCalls.some((tool) => tool.approvalId)) {
        const details = await copilotApi.listApprovalDetails();
        setApprovalDetails(details);
        setApprovals(details.map((item) => item.approval));
        const approvalId = result.toolCalls.find((tool) => typeof tool.approvalId === "number")?.approvalId;
        if (typeof approvalId === "number") {
          const detail = details.find((item) => item.approval.id === approvalId);
          if (detail && approvalPreviewStore.openFromRequest(detail, { sessionId: requestSessionId, requestId }, store.getState().activeSessionId)) {
            setApprovalProgress([]);
          }
        }
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      store.finishRequest(requestSessionId, requestId, { error: errorMessage });
      message.error(errorMessage);
    } finally {
      stopProgress?.();
    }
  };

  const openCommandExplanation = (text: string) => {
    if (!modelProfileId) {
      message.info("请先在顶部选择已配置的模型服务，再使用命令解析。");
      return;
    }
    setExplainText(text);
    setExplainResult("");
    setExplainOpen(true);
  };

  const explainCommand = async () => {
    if (!modelProfileId || !explainText.trim()) return;
    setExplainLoading(true);
    try {
      setExplainResult(await copilotApi.explainCommand(modelProfileId, explainText));
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setExplainLoading(false);
    }
  };

  const continuePendingPrompt = async (mode: "readonly" | "unlock") => {
    const prompt = pendingPrompt;
    const regenerateMessageId = pendingRegenerateMessageId;
    if (!prompt) {
      setLockedPromptOpen(false);
      setPendingRegenerateMessageId(null);
      return;
    }
    if (mode === "unlock") {
      const unlocked = await changeLock("30m");
      if (!unlocked) return;
    } else {
      setSessionReadOnlyMode(true);
    }
    setPendingPrompt(null);
    setPendingRegenerateMessageId(null);
    setLockedPromptOpen(false);
    await send(prompt, true, regenerateMessageId);
  };

  const clearHistory = () => {
    updateSessionMessages(activeSessionId, () => [INITIAL_MESSAGE]);
    setSuppressedAutoSkillIds([]);
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

  const openSkillDraft = (experience: CopilotExperience) => {
    const normalizedName = `${experience.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "ops-experience"}-${crypto.randomUUID().slice(0, 8)}`;
    const triggerCandidates = experience.title.split(/[\s，。,:：/]+/).map((item) => item.trim()).filter((item) => item.length >= 2).slice(0, 6);
    setSkillDraft({
      name: normalizedName,
      description: experience.title,
      triggers: triggerCandidates.join(", "),
      content: `## 操作步骤\n\n${experience.content}\n\n## 安全约束\n\n- 先执行只读检查并确认目标范围。\n- 变更命令必须经过后端风险规则、白名单和人工审批。\n- 执行完成后进行只读健康验证并记录结果。`,
    });
    setExperienceLibraryOpen(false);
    setSkillDraftOpen(true);
  };

  const saveSkillDraft = async () => {
    if (skillDraftSaving) return;
    const name = skillDraft.name.trim();
    const description = skillDraft.description.trim();
    const triggers = [...new Set(skillDraft.triggers.split(/[,，、\n]/).map((item) => item.trim()).filter(Boolean))];
    const content = skillDraft.content.trim();
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(name) || !description || triggers.length === 0 || !content) {
      message.warning("请填写合法的技能名称、描述、触发词和正文");
      return;
    }
    const existing = parseUserSkills(localStorage.getItem(SKILLS_STORAGE_KEY));
    if ([...existing, ...BUILTIN_CHAT_SKILLS].some((skill) => skill.name === name)) {
      message.warning("技能名称已存在，请更换名称；已有技能可在技能菜单编辑");
      return;
    }
    setSkillDraftSaving(true);
    try {
      const document = skillDocument({ name, description, triggers, content });
      const nextSkill: ChatSkill = { id: crypto.randomUUID(), name, source: "user", description, triggers, dangerous: [], content, hits: 0 };
      // 提前序列化，避免文件保存后才发现浏览器数据无法编码。
      const stored = JSON.stringify([nextSkill, ...existing]);
      await skillsApi.save(name, document);
      localStorage.setItem(SKILLS_STORAGE_KEY, stored);
      setChatSkills([nextSkill, ...existing, ...BUILTIN_CHAT_SKILLS]);
      setSelectedSkillIds(Array.from(new Set([...selectedSkillIds, nextSkill.id])));
      setSkillDraftOpen(false);
      message.success("技能草稿已审核保存，并可用于后续对话匹配");
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSkillDraftSaving(false);
    }
  };

  const historySessions = sessions.filter((session) => hasConversationContent(session.messages));
  const matchingSessions = historySessions
    .filter((session) => `${session.title} ${session.messages.map((item) => item.content).join(" ")}`.toLocaleLowerCase().includes(historyQuery.trim().toLocaleLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const matchingExperiences = experiences.filter((item) => `${item.title} ${item.content}`.toLocaleLowerCase().includes(experienceQuery.trim().toLocaleLowerCase()));

  const lockControl = (
    <div className="w-72 space-y-3.5 p-1 text-xs">
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
        <span className="flex items-center gap-2 font-semibold text-[var(--text-primary)]"><Power size={14} className="text-[var(--text-secondary)]" />{aiLocked ? "AI 操作已锁定" : "AI 操作已放行"}</span>
        <button type="button" disabled={lockSaving} onClick={() => void changeLock(aiLocked ? aiUnlockDuration : "locked")} title="点击解锁或锁定" aria-label={aiLocked ? "解锁 AI 操作" : "锁定 AI 操作"} aria-pressed={!aiLocked} className={`relative h-5 w-10 shrink-0 rounded-full border-2 border-transparent transition-colors disabled:cursor-wait disabled:opacity-60 ${aiLocked ? "bg-surface-700" : "bg-emerald-600"}`}>
          <span className={`pointer-events-none absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] duration-200 ${aiLocked ? "left-0.5" : "left-[22px]"}`} />
        </button>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]"><span className="font-medium text-[var(--text-secondary)]">限时放行</span>{!aiLocked && <span className="font-mono text-[10px] text-[var(--success)]">{isForever ? "永久不过期" : `倒计时 ${formatRemaining(remainingSeconds)}`}</span>}</div>
        <div className="grid grid-cols-4 gap-1 rounded-xl border border-[var(--border)] bg-surface-950 p-1 text-center font-mono text-xs">
          {UNLOCK_DURATIONS.map((duration) => {
            const selected = aiUnlockDuration === duration.id;
            return <button key={duration.id} type="button" disabled={lockSaving} onClick={() => void changeLock(duration.id as UnlockDuration)} className={`rounded-lg border py-1 transition disabled:cursor-wait disabled:opacity-50 ${selected ? "border-[var(--border)] bg-surface-800 font-bold text-[var(--text-primary)]" : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>{duration.label}</button>;
          })}
        </div>
      </div>
      <p className="m-0 border-t border-[var(--border)]/80 pt-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">关闭总开关后，AI 的改动型操作会被拒绝，只读工具仍可使用；限时放行到期后自动锁定。</p>
    </div>
  );

  return (
    <div className="ops-page ops-copilot-page flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface-950)] p-0 font-sans" style={{ color: "var(--text-secondary)" }}>
      <Modal
        open={approvalPreview !== null}
        centered
        width={760}
        onCancel={approvalPreviewStore.close}
        footer={null}
        maskClosable={false}
        title={<span className="flex items-center gap-2"><ShieldAlert size={17} className="text-amber-500" />变更计划审批</span>}
      >
        {approvalPreview && (() => {
          const detail = approvalDetailById.get(approvalPreview.detail.approval.id) ?? approvalPreview.detail;
          const approval = detail.approval;
          const rejectReviewedApproval = () => {
            const id = approvalPreviewStore.reviewedApprovalId(approvalPreview, store.getState().activeSessionId);
            if (id !== null) void rejectApproval(id);
          };
          const expired = approval.status === "pending" && approvalSecondsRemaining(approval.expiresAt, now) === 0;
          const pending = approval.status === "pending" && !expired;
          return <div className="space-y-4 text-sm">
            <Alert type={pending ? "warning" : "info"} showIcon message={pending ? "命令和后续步骤已暂停。批准后才会按顺序执行计划并运行只读验证；拒绝或超时后不会继续。" : expired || approval.status === "expired" ? "审批已超时，命令未执行，本次计划及后续步骤已暂停。" : approval.status === "rejected" ? "审批已拒绝，命令未执行，本次计划及后续步骤已暂停。" : "批准后将按顺序执行计划，并在每一步后运行只读验证；任一步失败都会停止后续步骤。"} />
            <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-surface-950 p-3 sm:grid-cols-2">
              <span>目标服务器：<strong>{approval.serverAlias}</strong></span>
              <span>审批状态：<Tag color={pending || approval.status === "executing" ? "processing" : approval.status === "completed" ? "success" : "error"}>{expired ? "已超时" : approval.status === "rejected" ? "已拒绝" : approval.status}</Tag></span>
              <span className="sm:col-span-2">原始请求：{detail.plan?.originalRequest ?? approval.command}</span>
              <span className="sm:col-span-2">{pending ? `剩余审批时间：${formatApprovalCountdown(approval.expiresAt, now)}（300 秒内有效）` : `失效时间：${new Date(approval.expiresAt * 1000).toLocaleString()}`}</span>
            </div>
            <CopilotApprovalPlanSummary detail={detail} />
            {approvalProgress.length > 0 && <section className="rounded-lg border border-[var(--border)] bg-surface-950 p-3"><h3 className="mb-2 mt-0 text-sm font-semibold">实时执行过程</h3><ol className="m-0 space-y-2">{approvalProgress.map((entry, index) => <li key={`${entry.stage}-${index}`} className="flex items-start gap-2"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${entry.status === "success" ? "bg-emerald-500" : entry.status === "failed" ? "bg-rose-500" : "animate-pulse bg-cyan-400"}`} /><span>{entry.message}{entry.delta ? <code className="ml-2 text-xs text-[var(--text-secondary)]">{entry.delta}</code> : null}</span></li>)}</ol></section>}
            {approval.result && !pending && <Alert type={approval.status === "completed" ? "success" : "error"} showIcon message={approval.status === "completed" ? "执行与验证已完成" : "计划执行未完成"} description={approval.result} />}
            <div className="flex justify-end gap-2"><Button onClick={approvalPreviewStore.close}>关闭</Button>{pending && <><Button disabled={approvalBusy !== null} onClick={rejectReviewedApproval}>拒绝并暂停</Button><Button danger loading={approvalBusy === approval.id} disabled={approvalBusy !== null && approvalBusy !== approval.id} onClick={() => approveApproval(approvalPreview)}>批准并执行</Button></>}</div>
          </div>;
        })()}
      </Modal>
      <Modal
        open={lockedPromptOpen}
        centered
        width={520}
        footer={null}
        closable
        maskClosable={false}
        onCancel={() => { setLockedPromptOpen(false); setPendingPrompt(null); setPendingRegenerateMessageId(null); }}
        title={
          <span className="flex items-center gap-2.5" style={{ color: "var(--text-primary)" }}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/20 text-[var(--warning)]">
              <ShieldAlert size={18} />
            </span>
            <span className="text-base font-bold">AI 操作当前已锁定</span>
          </span>
        }
        styles={{
          body: { paddingTop: 8 },
        }}
      >
        <div className="space-y-3 text-sm leading-7" style={{ color: "var(--text-secondary)" }}>
          <p className="m-0 text-[15px] font-semibold leading-6" style={{ color: "var(--text-primary)" }}>
            是否开启 AI 操作 30 分钟，让 AI 能运行改动型工具？
          </p>
          <p className="m-0 text-[13px] leading-6" style={{ color: "var(--text-secondary)" }}>
            选择“仅只读模式”：AI 只能运行 system_info、disk_usage、tail_log 等只读工具，本会话内不再询问；也可以随时在上方状态条开启。
          </p>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <Button onClick={() => void continuePendingPrompt("readonly")}>仅只读模式</Button>
          <Button type="primary" loading={lockSaving} disabled={lockSaving} onClick={() => void continuePendingPrompt("unlock")}>
            <span className="inline-flex items-center gap-1.5"><Unlock size={15} />开启 30 分钟</span>
          </Button>
        </div>
      </Modal>
      <Modal
        title={<span className="flex items-center gap-2"><BadgeInfo size={17} className="text-amber-500" />AI 命令静态解析</span>}
        open={explainOpen}
        onCancel={() => setExplainOpen(false)}
        onOk={() => void explainCommand()}
        okText={explainResult ? "重新解析" : "开始解析"}
        cancelText="关闭"
        confirmLoading={explainLoading}
        okButtonProps={{ disabled: !explainText.trim() }}
        width={680}
        destroyOnClose
        maskClosable={false}
      >
        <div className="space-y-3">
          <Alert type="warning" showIcon message="此功能只分析文本，不会连接服务器、执行命令或批准操作。命令仍需人工同意，并继续受白名单和审批策略限制。" />
          <label className="block text-sm font-medium text-[var(--text-secondary)] ">待分析命令或请求
            <Input.TextArea className="mt-2 font-mono" value={explainText} onChange={(event) => setExplainText(event.target.value)} maxLength={4000} showCount rows={5} placeholder="粘贴被拦截的命令或命令请求" />
          </label>
          {explainResult && <section className="rounded-lg border border-[var(--border)] bg-surface-850 p-4 ">
            <h3 className="mb-2 mt-0 text-base font-semibold text-[var(--text-primary)] ">分析结果</h3>
            <div className="whitespace-pre-wrap break-words text-sm leading-7 text-[var(--text-secondary)] ">{explainResult}</div>
          </section>}
        </div>
      </Modal>
      <header className="flex shrink-0 flex-nowrap items-center justify-between gap-3 border-b border-[var(--border)] bg-surface-900/95 px-5 py-3.5">
        <div className="flex min-w-0 flex-1 items-center gap-2"><Bot size={18} className="shrink-0 text-[var(--accent)]" /><div className="min-w-0"><h1 className="m-0 text-sm font-bold text-[var(--text-primary)]">AI 助手</h1><p className="m-0 mt-0.5 truncate text-[11px] text-[var(--text-secondary)]">让 AI 帮你查看和操作服务器；每一步都受 AI 操作策略约束，并记入审计</p></div></div>
        <div className="flex shrink-0 items-center gap-2">
          <div ref={lockWrapperRef} className="relative">
            <button type="button" aria-expanded={lockPopoverOpen} onClick={() => setLockPopoverOpen((open) => !open)} className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium shadow-sm transition ${aiLocked ? "border-rose-500/30 bg-rose-500/10 text-[var(--danger)] hover:bg-rose-500/20" : "border-emerald-500/30 bg-emerald-500/10 text-[var(--success)] hover:bg-emerald-500/20"}`}>
              {aiLocked ? <Lock size={13} /> : <Unlock size={13} />}
              <span>{aiLocked ? "AI 操作已锁定" : isForever ? "AI 操作放行中 · 永久" : `放行中 · ${formatRemaining(remainingSeconds)}`}</span>
              <ChevronDown size={12} />
            </button>
            {lockPopoverOpen && <div onPointerDown={(event) => event.stopPropagation()} className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-[var(--border)] bg-[var(--surface-900)] p-4 text-xs shadow-2xl">
              {lockControl}
            </div>}
          </div>
          <Button size="small" icon={<ShieldCheck size={13} />} onClick={() => void navigate("/settings")}>接入与策略</Button>
        </div>
      </header>

      <div className="flex shrink-0 flex-col gap-2 border-b border-[var(--border)]/80 bg-surface-950/60 px-5 py-2 text-xs">
        <div className="flex items-center justify-between gap-2.5 flex-wrap">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-900)] px-2.5 text-[var(--text-secondary)]"><Bot size={14} className="text-[var(--accent)]" /><span className="text-[11px]">内置对话</span><Select size="small" variant="borderless" className="min-w-44" value={modelProfileId ?? "local-safe-tools"} onChange={(value) => setModelProfileId(value === "local-safe-tools" ? null : value)} options={[{ value: "local-safe-tools", label: "本地受控工具" }, ...modelProfiles.map((profile) => ({ value: profile.id, label: `${profile.name} · ${profile.model || "未指定模型"}` }))]} /><Button type="text" size="small" aria-label="配置模型服务" title="配置模型服务" icon={<Settings2 size={14} />} onClick={() => navigate("/settings", { state: { from: "copilot" } })} className="!h-6 !w-6 !p-0 !text-[var(--text-secondary)] hover:!text-[var(--text-primary)]" /></div>
            <label className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-900)] px-2.5 text-[var(--text-secondary)]"><Database size={14} className="text-[var(--success)]" /><span className="sr-only">目标服务器</span><Select size="small" variant="borderless" className="min-w-52 max-w-72" value={serverId} onChange={(value) => setActiveServerId(value === null || value === undefined ? null : Number(value))} options={serverOptions} /></label>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <Button size="small" className="!h-8 !border-[var(--border)] !bg-[var(--surface-900)] !text-[var(--text-secondary)]" icon={<Puzzle size={14} className="text-[var(--warning)]" />} onClick={() => message.info("AI 工具由当前服务器策略和 MCP 接入配置共同控制")}>外部工具</Button>
            <div className="flex min-h-8 min-w-[240px] max-w-[32rem] flex-1 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-900)] px-2.5 text-[var(--text-secondary)]">
              <Puzzle size={14} className="shrink-0 text-[var(--warning)]" /><span className="shrink-0 text-xs">本轮技能</span>
              <Select aria-label="本轮技能" mode="multiple" size="small" variant="borderless" allowClear showSearch maxTagCount="responsive" className="min-w-0 flex-1" placeholder="输入问题后自动匹配，也可手动补充" value={visibleSkillIds} disabled={loading} optionFilterProp="label" onChange={(ids: string[]) => {
              // 删除某个自动技能时，不要把其余自动匹配项变成会话固定项。
              setSelectedSkillIds(ids.filter((id) => selectedSkillIds.includes(id) || suppressedAutoSkillIds.includes(id) || !matchedSkills.some((skill) => skill.id === id)));
              setSuppressedAutoSkillIds(matchedSkills.filter((skill) => !ids.includes(skill.id)).map((skill) => skill.id));
            }} options={chatSkills.map((skill) => ({ value: skill.id, label: `${skill.name} · ${matchedSkills.some((item) => item.id === skill.id) && !selectedSkillIds.includes(skill.id) ? "自动" : skill.source === "user" ? "用户" : "内置"}`, title: skill.description }))} />
          </div>
            </div>
          </div>
        <div className="flex items-center justify-between gap-2 text-xs flex-wrap">
          <div className="flex min-w-0 items-center gap-2 text-[11px] text-[var(--text-muted)]"><span>技能按问题关键词自动匹配（最多 3 项），手动选择可额外补充；无需预先指定</span><span className="shrink-0">{historySessions.length} 个会话</span></div>
          <div className="flex items-center gap-3 text-[var(--text-secondary)]">
            <button type="button" onClick={() => void navigate("/credentials")} className="flex items-center gap-1 transition hover:text-[var(--text-primary)]"><ShieldCheck size={14} />查看凭据状态</button>
            <button type="button" onClick={() => setHistoryOpen(true)} className="flex items-center gap-1 transition hover:text-[var(--text-primary)]"><History size={14} />历史</button>
            <button type="button" onClick={openExperienceSave} className="flex items-center gap-1 transition hover:text-[var(--text-primary)]"><Bookmark size={14} />存为经验</button>
            <button type="button" onClick={() => setExperienceLibraryOpen(true)} className="flex items-center gap-1 transition hover:text-[var(--text-primary)]">经验库{experiences.length > 0 ? ` (${experiences.length})` : ""}</button>
            <button type="button" onClick={createSession} className="flex items-center gap-1 font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"><Plus size={14} />新对话</button>
            <Popconfirm title="清空当前对话内容？" okText="清空" cancelText="取消" onConfirm={clearHistory}><button type="button" className="flex items-center gap-1 text-[var(--text-secondary)] transition hover:text-[var(--danger)]"><X size={13} />清空</button></Popconfirm>
          </div>
        </div>
      </div>

      <WorkspaceSidebarSlot>
        <div className="space-y-2 px-2 pb-3">
          <Button block type="primary" icon={<Plus size={14} />} onClick={createSession}>新对话</Button>
          <Input.Search allowClear value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="搜索历史对话" />
          <div className="flex items-center justify-between px-2 pb-1 pt-2 text-[11px] text-[var(--text-muted)]">
            <span>历史对话</span><span>{matchingSessions.length}</span>
          </div>
          {matchingSessions.length === 0 ? <div className="px-3 py-4 text-center text-xs text-[var(--text-muted)]">{historyQuery ? "没有匹配的对话" : "暂无历史对话"}</div> : matchingSessions.map((session) => {
            const active = session.id === activeSessionId;
            const firstQuestion = session.messages.find((item) => item.role === "user")?.content ?? "暂无提问";
            return <div key={session.id} className={`group flex min-w-0 items-start gap-1 rounded-md border px-2 py-2 transition ${active ? "border-[var(--accent)]/35 bg-[var(--bg-active)]" : "border-transparent hover:bg-[var(--bg-hover)]"}`}>
              <button type="button" onClick={() => switchSession(session.id)} aria-current={active ? "page" : undefined} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-xs font-medium text-[var(--text-primary)]">{session.title}</span>
                <span className="mt-1 block truncate text-[10px] text-[var(--text-secondary)]">{firstQuestion}</span>
                <span className="mt-1 block text-[10px] text-[var(--text-muted)]">{new Date(session.updatedAt).toLocaleString()}</span>
              </button>
              <Popconfirm title="删除这段历史对话？" okText="删除" cancelText="取消" onConfirm={() => deleteSession(session.id)}>
                <Button type="text" danger size="small" icon={<X size={13} />} aria-label={`删除对话 ${session.title}`} title="删除对话" className="!h-6 !w-6 !shrink-0 !p-0 opacity-0 transition group-hover:opacity-100 focus:opacity-100" />
              </Popconfirm>
            </div>;
          })}
          <button type="button" onClick={() => setHistoryOpen(true)} className="w-full px-2 py-2 text-left text-[11px] text-[var(--accent)] hover:bg-[var(--bg-hover)]">查看全部历史与管理</button>
          <div className="mt-2 border-t border-[var(--border)] px-2 pt-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]"><Database size={13} className="text-[var(--success)]" />当前服务器上下文</div>
            {selectedServer ? <div className="min-w-0 space-y-1">
              <div className="truncate text-xs font-semibold text-[var(--text-primary)]">{selectedServer.alias}</div>
              <div className="truncate font-mono text-[10px] text-[var(--text-secondary)]">{selectedServer.hostname}:{selectedServer.port}</div>
              <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--text-muted)]"><span>策略</span><span className="truncate">{selectedServer.ai_policy || "未设置"}</span></div>
              <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--text-muted)]"><span>连接状态</span><span className="truncate">{selectedServer.last_connection_status || "未知"}</span></div>
            </div> : <p className="m-0 text-[11px] leading-relaxed text-[var(--text-muted)]">自动选择。问题中指定目标，或使用唯一可用服务器。</p>}
          </div>
        </div>
      </WorkspaceSidebarSlot>

      {approvals.length > 0 && <section className="custom-scrollbar max-h-52 shrink-0 overflow-y-auto overscroll-contain border-b border-amber-500/30 bg-amber-950/10 p-3">
        <div className="mb-2 font-semibold text-[var(--warning)]">人工审批 · 待处理 {approvals.filter((item) => item.status === "pending" && approvalSecondsRemaining(item.expiresAt, now) > 0).length}</div>
        {approvals.filter((item) => item.status === "pending").map((item) => {
          const expired = approvalSecondsRemaining(item.expiresAt, now) === 0;
          return <div id={`copilot-approval-${item.id}`} data-approval-id={item.id} key={item.id} className={`mb-2 rounded border px-2 py-2 transition ${highlightedApprovalId === item.id ? "border-amber-300 bg-amber-500/15 shadow-[0_0_0_2px_rgba(251,191,36,0.25)]" : "border-[var(--border)]"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" className="text-left underline decoration-amber-500/40 underline-offset-2" onClick={() => openApprovalPreview(item.id)}>#{item.id} · {item.serverAlias} · {item.command}</button>
              {expired ? <span className="text-xs font-semibold text-[var(--danger)]">审批已超时 · 后续步骤已暂停</span> : <span className="flex items-center gap-2"><span className="text-xs tabular-nums text-[var(--warning)]">剩余 {formatApprovalCountdown(item.expiresAt, now)}</span><Button size="small" disabled={approvalBusy !== null} onClick={() => void rejectApproval(item.id)}>拒绝并暂停</Button><Button size="small" danger loading={approvalBusy === item.id} disabled={approvalBusy !== null && approvalBusy !== item.id} onClick={() => reviewApproval(item)}>批准并执行</Button></span>}
            </div>
            <CopilotApprovalPlanSummary detail={approvalDetailById.get(item.id)} />
            <p className="mb-0 mt-1 text-[11px] text-[var(--text-secondary)]">当前命令尚未执行，审批通过前所有后续步骤保持暂停。</p>
          </div>;
        })}
        <details className="mt-1 text-[var(--text-secondary)]"><summary className="cursor-pointer">最近审批记录</summary>{approvals.filter((item) => item.status !== "pending").slice(0, 10).map((item) => <div id={`copilot-approval-${item.id}`} data-approval-id={item.id} key={item.id} className={`border-b py-1 ${highlightedApprovalId === item.id ? "border-amber-300 bg-amber-500/10" : "border-[var(--border)]"}`}>#{item.id} · {item.serverAlias} · {item.command} · {item.status}{item.result ? ` · ${item.result}` : ""}</div>)}</details>
      </section>}

      <Modal
        rootClassName="copilot-history-modal"
        title={<div className="copilot-history-title"><span className="copilot-history-title-icon"><History size={16} /></span><span><strong>历史对话</strong><small>继续处理之前的运维问题</small></span><Tag className="copilot-history-count">{historySessions.length}</Tag></div>}
        open={historyOpen}
        onCancel={() => setHistoryOpen(false)}
        footer={null}
        width={700}
        destroyOnClose
      >
        <div className="copilot-history-toolbar">
          <Input.Search allowClear value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="搜索标题或消息内容" />
          <Button type="primary" icon={<Plus size={14} />} onClick={createSession}>新建对话</Button>
        </div>
        <div className="copilot-history-list custom-scrollbar">
          {matchingSessions.length === 0 ? <div className="copilot-history-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={historyQuery ? "没有匹配的对话" : "暂无历史对话"} /></div> : matchingSessions.map((session) => {
            const questionCount = session.messages.filter((item) => item.role === "user").length;
            const firstQuestion = session.messages.find((item) => item.role === "user")?.content ?? "暂无提问";
            const active = session.id === activeSessionId;
            return <article key={session.id} className={`copilot-history-item ${active ? "is-active" : ""}`}>
              <button type="button" className="copilot-history-main" onClick={() => switchSession(session.id)}>
                <span className="copilot-history-item-icon"><History size={15} /></span>
                <span className="copilot-history-item-copy">
                  <span className="copilot-history-item-heading"><strong>{session.title}</strong>{active && <Tag color="blue">当前会话</Tag>}</span>
                  <span className="copilot-history-item-preview">{firstQuestion}</span>
                  <span className="copilot-history-item-meta">{questionCount} 条提问 <i /> {new Date(session.updatedAt).toLocaleString()}</span>
                </span>
              </button>
              <span className="copilot-history-actions">
                <Button size="small" type={active ? "default" : "primary"} ghost={!active} onClick={() => switchSession(session.id)}>{active ? "已打开" : "继续"}</Button>
                <Popconfirm title="删除这段历史对话？" okText="删除" cancelText="取消" onConfirm={() => deleteSession(session.id)}>
                  <Button type="text" danger size="small" icon={<X size={14} />} aria-label="删除历史对话" title="删除历史对话" />
                </Popconfirm>
              </span>
            </article>;
          })}
        </div>
      </Modal>

      <Modal title="存为经验" open={experienceSaveOpen} onCancel={() => setExperienceSaveOpen(false)} onOk={saveExperience} okText="保存到本机" cancelText="取消" width={640} destroyOnClose maskClosable={false}>
        <div className="space-y-3">
          <label className="block text-xs text-[var(--text-secondary)]">经验标题<Input className="mt-1" maxLength={80} value={experienceTitle} onChange={(event) => setExperienceTitle(event.target.value)} placeholder="例如：Nginx 502 排查流程" /></label>
          <label className="block text-xs text-[var(--text-secondary)]">排障过程与结论<Input.TextArea className="mt-1" rows={9} maxLength={12000} showCount value={experienceContent} onChange={(event) => setExperienceContent(event.target.value)} placeholder="整理可复用的问题、检查步骤和结论" /></label>
          <Alert type="warning" showIcon message="内容仅保存在本机，不会同步给团队。保存前请检查并移除主机地址、账号、密钥等敏感信息；工具原始输出不会自动写入经验。" />
        </div>
      </Modal>

      <Modal title={<span className="flex items-center gap-2"><Bookmark size={16} />本机经验库 <Tag className="m-0">{experiences.length}</Tag></span>} open={experienceLibraryOpen} onCancel={() => setExperienceLibraryOpen(false)} footer={null} width={720} destroyOnClose>
        <div className="mb-3 flex items-center justify-between gap-2"><Input.Search allowClear value={experienceQuery} onChange={(event) => setExperienceQuery(event.target.value)} placeholder="搜索经验标题或内容" className="max-w-sm" /><Button icon={<Bookmark size={13} />} onClick={() => { setExperienceLibraryOpen(false); openExperienceSave(); }}>从当前对话保存</Button></div>
        <div className="max-h-[58vh] space-y-2 overflow-y-auto pr-1">
          {matchingExperiences.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={experienceQuery ? "没有匹配的经验" : "还没有保存的经验"} /> : matchingExperiences.map((item) => (
            <article key={item.id} className="rounded-lg border border-[var(--border)] bg-surface-950 p-3">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="m-0 truncate text-sm font-semibold text-[var(--text-primary)]">{item.title}</h3><p className="mb-0 mt-1 text-[10px] text-[var(--text-muted)]">保存于 {new Date(item.createdAt).toLocaleString()}</p></div><div className="flex shrink-0 items-center gap-1"><Button size="small" type="dashed" onClick={() => openSkillDraft(item)}>提炼为技能</Button><Button size="small" onClick={() => { setInput((current) => current ? `${current}\n\n参考本机经验「${item.title}」：\n${item.content}` : `参考本机经验「${item.title}」：\n${item.content}`); setExperienceLibraryOpen(false); }}>放入对话</Button><Popconfirm title="删除这条本机经验？" okText="删除" cancelText="取消" onConfirm={() => setExperiences((current) => current.filter((experience) => experience.id !== item.id))}><Button size="small" danger type="text">删除</Button></Popconfirm></div></div>
              <details className="mt-2"><summary className="cursor-pointer text-[11px] text-[var(--accent)]">查看内容</summary><pre className="mb-0 mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-black/20 p-2 text-xs leading-relaxed text-[var(--text-secondary)]">{item.content}</pre></details>
            </article>
          ))}
        </div>
      </Modal>

      <Modal title={<span className="flex items-center gap-2"><Puzzle size={17} />提炼为用户技能 · 审核草稿</span>} open={skillDraftOpen} onCancel={() => { if (!skillDraftSaving) setSkillDraftOpen(false); }} onOk={() => void saveSkillDraft()} okText="审核并保存技能" cancelText="取消" confirmLoading={skillDraftSaving} cancelButtonProps={{ disabled: skillDraftSaving }} closable={!skillDraftSaving} maskClosable={false} width={760} styles={{ body: { maxHeight: "65vh", overflowY: "auto" } }}>
        <div className="space-y-4 py-2">
          <Alert type="info" showIcon message="经验已整理为草稿，请审核适用环境、操作步骤与验证方式，移除敏感信息后保存。" />
          <label className="block text-sm">技能名称<Input className="mt-2" value={skillDraft.name} maxLength={64} disabled={skillDraftSaving} onChange={(event) => setSkillDraft((current) => ({ ...current, name: event.target.value }))} placeholder="例如 nginx-troubleshooting" /></label>
          <label className="block text-sm">描述<Input className="mt-2" value={skillDraft.description} maxLength={500} disabled={skillDraftSaving} onChange={(event) => setSkillDraft((current) => ({ ...current, description: event.target.value }))} /></label>
          <label className="block text-sm">触发词（逗号分隔）<Input className="mt-2" value={skillDraft.triggers} maxLength={1000} disabled={skillDraftSaving} onChange={(event) => setSkillDraft((current) => ({ ...current, triggers: event.target.value }))} placeholder="nginx, 502, 网关错误" /></label>
          <label className="block text-sm">正文（Markdown）<Input.TextArea className="mt-2 font-mono" rows={12} maxLength={20000} showCount value={skillDraft.content} disabled={skillDraftSaving} onChange={(event) => setSkillDraft((current) => ({ ...current, content: event.target.value }))} /></label>
          <Alert type="warning" showIcon message="保存后可在技能菜单管理并用于后续聊天。技能不会绕过黑白名单、风险规则、人工审批或后置验证。" />
        </div>
      </Modal>

      <main
        ref={chatScrollRef}
        onScroll={(event) => {
          const container = event.currentTarget;
          const activeEvents = loading && progress?.stage !== "model_stream"
            ? container.querySelectorAll<HTMLElement>("[data-copilot-active-event]")
            : null;
          const activeEvent = activeEvents && activeEvents.length > 0 ? activeEvents.item(activeEvents.length - 1) : null;
          if (activeEvent) {
            const viewport = container.getBoundingClientRect();
            const active = activeEvent.getBoundingClientRect();
            shouldFollowChatRef.current = active.top >= viewport.top && active.bottom <= viewport.bottom;
          } else {
            shouldFollowChatRef.current = container.scrollHeight - container.scrollTop - container.clientHeight < 96;
          }
        }}
        className="custom-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-6"
      >
        <div className="flex w-full flex-col gap-5">
          {messages.length === 1 && messages[0]?.id === "welcome" ? <div className="space-y-6 py-8 text-center">
            <div className="mx-auto max-w-3xl space-y-2"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-500/25 bg-indigo-500/10 text-[var(--accent)] shadow-inner"><Bot size={24} /></div><h2 className="m-0 text-base font-bold text-[var(--text-primary)]">有什么可以帮你？</h2><p className="mx-auto max-w-md text-xs leading-relaxed text-[var(--text-secondary)]">AI 会调用你授权的工具查看、操作服务器，每一步都受 AI 操作策略约束并记入审计。</p></div>
            <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-3 text-left md:grid-cols-2">{QUICK_PROMPTS.map((item) => { const Icon = item.icon; return <button key={item.title} type="button" disabled={loading} onClick={() => void send(item.prompt)} className="group space-y-1.5 rounded-xl border border-[var(--border)]/80 bg-[var(--surface-900)] p-4 text-left transition hover:border-[var(--border)] hover:bg-surface-900/60 disabled:opacity-60"><div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)] transition group-hover:text-[var(--accent)]"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${item.iconBg}`}><Icon size={14} className={item.color} /></span><span>{item.title}</span></div><p className="m-0 pl-9 text-[11px] leading-relaxed text-[var(--text-secondary)]">{item.description}</p></button>; })}</div>
            <div className="mx-auto flex max-w-3xl items-center justify-center gap-1.5 pt-2 text-[11px] text-[var(--text-muted)]"><History size={14} className="text-[var(--text-muted)]" /><span>对话会自动保存，可在上方“历史”中继续。</span></div>
          </div> : messages.map((item, messageIndex) => item.id === "welcome" ? null : item.role === "user" ? (
            <div key={item.id} className="group flex w-full justify-end pr-1 sm:pr-2">
              <div className="flex max-w-2xl items-end gap-1.5">
                <div className="flex shrink-0 items-center gap-0.5 self-end pb-1 opacity-60 transition group-hover:opacity-100 focus-within:opacity-100">
                  <Tooltip title="复制这条消息" placement="top" mouseEnterDelay={0.15}>
                    <span className="inline-flex"><Button size="small" type="text" aria-label="复制这条消息" icon={<Copy size={14} />} onClick={() => void copyUserMessage(item)} /></span>
                  </Tooltip>
                  <Tooltip title="编辑此消息；内容会放回输入框，并移除这条消息之后的回复" placement="top" mouseEnterDelay={0.15}>
                    <span className="inline-flex"><Button size="small" type="text" aria-label="编辑这条消息" icon={<Pencil size={14} />} onClick={() => editUserMessage(item.id)} disabled={loading} /></span>
                  </Tooltip>
                </div>
                <article className="inline-flex items-center rounded-2xl rounded-tr-md border border-[var(--border)]/80 bg-[var(--bg-active)] px-5 py-2.5 text-xs leading-normal text-[var(--text-primary)] shadow-sm transition hover:bg-[var(--bg-hover)]"><div className="whitespace-pre-wrap break-words">{item.content}</div></article>
              </div>
            </div>
          ) : (
            (() => {
              const blockedCall = item.toolCalls?.find((tool) => tool.status === "blocked" && (tool.tool === "policy_guard" || tool.output.includes("白名单")));
              const sourceRequest = messages.slice(0, messageIndex).reverse().find((entry) => entry.role === "user")?.content ?? "";
              const toolCount = item.toolCalls?.length ?? 0;
              const completedToolCount = item.toolCalls?.filter((tool) => tool.status === "success").length ?? 0;
              const triggeredSkillNames = item.triggeredSkillNames ?? [];
              const manualSkillNames = item.manualSkillNames ?? [];
              const usedSkillCount = item.skillNames?.length ?? 0;
              const progressRounds = (item.progressEvents ?? []).map((entry) => entry.round ?? 0).filter((round) => round > 0);
              const agentRoundCount = progressRounds.length > 0 ? Math.max(...progressRounds) : item.progressEvents?.length ? 1 : 0;
              const latestProgress = [...(item.progressEvents ?? [])].reverse().find((entry) => entry.message.trim() && entry.kind !== "text_delta");
              const contextCount = item.historyCount ?? 0;
              return (
            <article key={item.id} className="w-full space-y-3.5 rounded-2xl border border-[var(--border)]/90 bg-[var(--surface-900)] p-5 text-xs shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)]/80 pb-2.5">
                <div className="flex flex-wrap items-center gap-2"><span className="flex items-center gap-1.5 font-bold text-[var(--text-primary)]"><Bot size={15} className="text-[var(--accent)]" />OpsPub 助手</span><Tag bordered={false} color={item.streaming ? "processing" : item.content.startsWith("请求失败：") ? "error" : "success"} className="m-0">{item.streaming ? "正在生成" : item.content.startsWith("请求失败：") ? "未完成" : "已完成"}</Tag>{triggeredSkillNames.length > 0 && <Tag bordered={false} color="gold" className="m-0"><span className="inline-flex items-center gap-1"><Puzzle size={12} />关键词触发：{triggeredSkillNames.join("、")}</span></Tag>}{manualSkillNames.length > 0 && <Tag bordered={false} color="blue" className="m-0"><span className="inline-flex items-center gap-1"><Puzzle size={12} />手动补充：{manualSkillNames.join("、")}</span></Tag>}</div>
                <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-[var(--text-secondary)]"><span>本轮 {agentRoundCount} 轮</span><span className="text-[var(--text-secondary)]">·</span><span>{completedToolCount}/{toolCount} 次工具完成</span><span className="text-[var(--text-secondary)]">·</span><span>{usedSkillCount} 个技能</span><span className="text-[var(--text-secondary)]">·</span><span>上下文 {contextCount} 条{item.historyTrimmed ? `（裁剪 ${item.historyTrimmed}）` : ""}</span><span className="text-[var(--text-muted)]">·</span><span>{item.modelName ? `模型 · ${item.modelName}` : "本地受控模式"}</span></div>
              </div>
              {agentRoundCount > 1 && <div className="text-[11px] text-[var(--info)]">已完成 {agentRoundCount} 轮受控工具规划</div>}
              {item.progressEvents?.length ? (
                <section className="overflow-hidden rounded-xl border border-[var(--border)]/80 bg-[var(--surface-950)]">
                  <CopilotExecutionTimeline events={item.progressEvents} streaming={item.streaming} statusMessage={item.streaming ? `${latestProgress?.round ? `第 ${latestProgress.round} 轮 · ` : "处理中 · "}${latestProgress?.message ?? "等待下一步"}` : "执行记录已完成"} />
                </section>
              ) : item.toolCalls?.length ? (
                <div className="space-y-2">{item.toolCalls.map((tool, index) => <div key={`${tool.tool}-${tool.serverAlias}-${index}`} className="rounded-lg border border-[var(--border)]/80 bg-[var(--surface-950)] p-2.5"><div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-[var(--info)]"><TerminalSquare size={13} />{tool.tool}{tool.serverAlias ? <span className="font-sans font-normal text-[var(--text-muted)]">@{tool.serverAlias}</span> : null}</span><Tag color={tool.status === "success" ? "success" : tool.status === "blocked" ? "warning" : tool.status === "skipped" ? "default" : tool.status === "pending" || tool.status === "running" ? "processing" : "error"}>{toolStatusLabel(tool.status)}</Tag></div><pre className="m-0 mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded bg-black/20 p-2 font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]">{tool.output || "无输出"}</pre></div>)}</div>
              ) : item.streaming ? (
                <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-950)] px-3 py-2 text-[11px] text-[var(--text-secondary)]"><Spin size="small" />正在等待第一条执行事件…</div>
              ) : <p className="m-0 text-[11px] text-[var(--text-muted)]">没有调用服务器工具；以上内容由模型根据对话上下文生成。</p>}
              {item.content ? <CopilotMarkdown content={item.content} /> : item.streaming ? <div className="flex items-center gap-2 py-1 text-xs text-[var(--text-secondary)]"><Spin size="small" />正在汇总检查结果…</div> : null}
              {item.toolCalls?.map((tool) => {
                if (typeof tool.approvalId !== "number") return null;
                const detail = approvalDetailById.get(tool.approvalId);
                const approval = detail?.approval;
                const expired = approval?.status === "pending" && approvalSecondsRemaining(approval.expiresAt, now) === 0;
                const pending = approval?.status === "pending" && !expired;
                const statusLabel = expired || approval?.status === "expired" ? "已超时，后续暂停" : approval?.status === "pending" ? "等待审批" : approval?.status === "completed" ? "执行完成" : approval?.status === "rejected" ? "已拒绝，后续暂停" : approval?.status === "failed" ? "执行失败" : approval?.status ?? "状态同步中";
                return <section key={`approval-${tool.approvalId}`} className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 font-semibold text-[var(--warning)]"><ShieldAlert size={15} />人工审批 #{tool.approvalId}<Tag color={pending ? "processing" : approval?.status === "completed" ? "success" : expired || approval?.status === "expired" || approval?.status === "rejected" ? "error" : "default"}>{statusLabel}</Tag></div>{approval && <span className="text-[11px] text-[var(--text-muted)]">{pending ? `剩余 ${formatApprovalCountdown(approval.expiresAt, now)}` : approval.decidedAt ? `处理于 ${new Date(approval.decidedAt * 1000).toLocaleString()}` : ""}</span>}</div>
                  <div className="mt-2 grid gap-1 text-[11px] text-[var(--text-secondary)]"><span>目标：{approval?.serverAlias ?? tool.serverAlias ?? "待同步"}</span><span>操作：{approval?.action ?? tool.tool}</span><code className="break-all rounded bg-black/20 p-2 text-[var(--warning)]">{approval?.command ?? tool.output}</code></div>
                  <p className="mb-0 mt-2 text-xs text-[var(--warning)]/80">{pending ? "危险命令尚未执行；等待审批期间，计划中的后续操作全部暂停。" : expired || approval?.status === "expired" ? "审批超时，命令未执行，后续步骤已暂停。" : approval?.status === "rejected" ? "审批已拒绝，命令未执行，后续步骤已暂停。" : null}</p>
                  <CopilotApprovalPlanSummary detail={detail} />
                  {approval?.result && !pending && <p className="mb-0 mt-2 whitespace-pre-wrap break-words text-[11px] text-[var(--text-secondary)]">结果：{approval.result}</p>}
                  {pending && approval && <div className="mt-3 flex justify-end gap-2"><Button size="small" disabled={approvalBusy !== null} onClick={() => void rejectApproval(approval.id)}>拒绝并暂停</Button><Button size="small" danger loading={approvalBusy === approval.id} disabled={approvalBusy !== null && approvalBusy !== approval.id} onClick={() => reviewApproval(approval, { sessionId: activeSessionId, requestId: item.id })}>批准并执行</Button></div>}
                </section>;
              })}
              {blockedCall && <Alert
                className="mt-2"
                type="warning"
                showIcon
                message="该命令不在受控白名单中，已拦截，需要人工同意"
                description={<div className="space-y-2"><p className="m-0">命令没有发送到服务器。你可以先让 AI 解释它的用途、参数和风险；解析结果不会代替人工同意，也不会执行命令。</p><Button size="middle" icon={<BadgeInfo size={15} />} disabled={!modelProfileId} onClick={() => openCommandExplanation(sourceRequest)}>AI 解析命令</Button>{!modelProfileId && <span className="ml-2">请先选择已配置的模型。</span>}</div>}
              />}
              {item.warnings?.map((warning) => <Alert key={warning} className="mt-2" type="warning" showIcon message={warning} />)}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)]/80 pt-2">
                <span className="text-[10px] text-[var(--text-muted)]">{item.modelName ? `由 ${item.modelName} 生成` : "OpsPub 受控助手"}</span>
                <div className="flex items-center gap-1">
                  <Tooltip title="复制纯文本回答" placement="top" mouseEnterDelay={0.15}><span className="inline-flex"><Button size="small" type="text" aria-label="复制回答" icon={<Copy size={14} />} onClick={() => void copyAssistantMessage(item)}>复制</Button></span></Tooltip>
                  <Tooltip title="复制包含问题和工具执行过程的 Markdown 报告" placement="top" mouseEnterDelay={0.15}><span className="inline-flex"><Button size="small" type="text" aria-label="复制回答和过程摘要" icon={<FileText size={14} />} onClick={() => void copyAssistantMessage(item, true)}>连过程复制</Button></span></Tooltip>
                  {(() => { const latestAssistant = messageIndex === messages.length - 1 && messages.reduce((last, entry, currentIndex) => entry.role === "assistant" ? currentIndex : last, -1) === messageIndex; const hasPendingApproval = item.toolCalls?.some((tool) => tool.status === "pending" || (typeof tool.approvalId === "number" && ["pending", "executing"].includes(approvalDetailById.get(tool.approvalId)?.approval.status ?? ""))) ?? false; const hasExecutedMutation = item.toolCalls?.some((tool) => tool.status === "success" && isMutatingTool(tool.tool)) ?? false; const canRegenerate = latestAssistant && !hasPendingApproval && !hasExecutedMutation && Boolean(sourceRequest); return <Tooltip title={canRegenerate ? "重新思考并重新生成本轮回复" : "仅最新且未涉及审批或变更的回答可以重新生成"} placement="top" mouseEnterDelay={0.15}><span className="inline-flex"><Button size="small" type="text" aria-label="重新生成回答" disabled={!canRegenerate || loading} icon={<RotateCw size={14} />} onClick={() => regenerateMessage(item)}>重新生成</Button></span></Tooltip>; })()}
                  <Tooltip title="剪裁到这一轮为止，另存为一条新对话并切换过去" placement="top" mouseEnterDelay={0.15}><span className="inline-flex"><Button size="small" type="text" aria-label="从这里分叉" disabled={loading} icon={<GitFork size={14} />} onClick={() => forkFromMessage(item.id)}>从这里分叉</Button></span></Tooltip>
                </div>
              </div>
            </article>
              );
            })()
          ))}
          {loading && <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-surface-900 p-3 text-[var(--text-secondary)]"><Spin size="small" />{progress?.message ?? "正在处理..."}{progress?.serverAlias ? ` · ${progress.serverAlias}` : ""}</div>}
        </div>
      </main>

      {showPolicyNotice && <div className="mx-5 mb-2 flex shrink-0 items-center justify-between gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-2 text-xs text-[var(--warning)]"><div className="flex min-w-0 items-center gap-2"><ShieldAlert size={15} className="shrink-0 text-[var(--warning)]" /><span className="leading-relaxed">改动型操作受 AI 总开关、服务器策略和人工审批共同约束；模型服务仅接收当前对话及脱敏结果，不会收到 SSH 凭据。</span></div><div className="flex shrink-0 items-center gap-3"><button type="button" onClick={() => void navigate("/settings")} className="font-medium underline decoration-amber-500/50 underline-offset-2 hover:text-[var(--text-primary)]">查看策略</button><button type="button" aria-label="关闭安全提示" title="关闭提示" onClick={() => { localStorage.setItem(RUNTIME_POLICY_NOTICE_DISMISSED_KEY, "true"); setShowPolicyNotice(false); }} className="rounded p-1 text-[var(--warning)]/70 transition hover:bg-amber-500/15 hover:text-[var(--text-primary)]"><X size={15} /></button></div></div>}

      <footer className="shrink-0 bg-surface-900 px-5 pb-4 pt-1"><div className="w-full space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]"><div className="flex items-center gap-2"><span className="text-[var(--text-secondary)]">{serverId === null ? `可见 ${servers.length} 台` : "已选定服务器"}</span><span>·</span><span className="text-[var(--text-secondary)]">{modelProfiles.find((profile) => profile.id === modelProfileId)?.model ?? (modelProfileId ? "已配置模型" : "本地受控工具")}</span></div><div className="flex flex-wrap items-center gap-1.5">{["继续", "建议", "验证", "重试", "说明", "总结"].map((chip) => <button key={chip} type="button" disabled={loading} onClick={() => setInput((current) => current ? `${current} ${chip}` : chip)} className="rounded border border-[var(--border)] bg-[var(--surface-850)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50">{chip}</button>)}</div></div>
        <div className="flex items-end gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-900)] p-1.5 pl-4 shadow-lg transition hover:border-[var(--border)] focus-within:border-indigo-500/80"><Input.TextArea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} autoSize={{ minRows: 1, maxRows: 5 }} disabled={loading} bordered={false} className="!resize-none !bg-transparent" style={{ fontSize: 12, lineHeight: 1.5, fontFamily: "inherit" }} placeholder="问点什么…（AI 只看到服务器别名，看不到任何凭据）" /><Button size="small" type="text" aria-label="清空输入" title="清空输入" disabled={!input} onClick={() => setInput("")} className="!text-[var(--text-muted)] hover:!text-[var(--text-primary)]"><X size={15} /></Button><Button size="small" type="primary" icon={<Send size={14} />} loading={loading} disabled={!input.trim()} onClick={() => void send()}>发送</Button></div>
      </div></footer>
    </div>
  );
}

function CopilotExecutionTimeline({ events, streaming, statusMessage }: { events: CopilotProgress[]; streaming?: boolean; statusMessage: string }) {
  const [expanded, setExpanded] = useState(Boolean(streaming));
  useEffect(() => {
    if (streaming) setExpanded(true);
  }, [streaming]);

  const visibleEvents = events.filter((event) => event.kind !== "text_delta");
  const toolEvents = visibleEvents.filter((event) => event.kind === "tool" || event.stage === "plan_step_ready" || event.stage === "tool_result");
  const toolAttemptKey = (event: CopilotProgress) => event.toolCallId ?? `${event.round ?? 0}-${event.step ?? 0}-${event.tool ?? "tool"}`;
  const attempts = new Map<string, { key: string; round: number; events: CopilotProgress[] }>();
  for (const event of toolEvents) {
    const key = toolAttemptKey(event);
    const attempt = attempts.get(key) ?? { key, round: event.round ?? 1, events: [] };
    attempt.events.push(event);
    attempts.set(key, attempt);
  }
  const roundNumbers = new Set<number>([
    ...visibleEvents.map((event) => event.round ?? 1),
    ...[...attempts.values()].map((attempt) => attempt.round),
  ]);
  const rounds = [...roundNumbers].sort((a, b) => a - b).map((round) => ({
    number: round,
    notes: visibleEvents.filter((event) => (event.round ?? 1) === round && !toolEvents.includes(event) && event.message.trim()),
    tools: [...attempts.values()].filter((attempt) => attempt.round === round).map((attempt) => {
      const latest = attempt.events[attempt.events.length - 1];
      const commandEvent = attempt.events.find((event) => event.stage === "plan_step_ready" || event.status === "running");
      const resultEvent = [...attempt.events].reverse().find((event) => event.stage === "tool_result" || event.status === "success" || event.status === "failed" || event.status === "blocked");
      return { ...attempt, latest, command: commandEvent?.delta ?? "", output: resultEvent?.delta ?? "" };
    }),
  }));
  const toolCount = attempts.size;
  const completedCount = [...attempts.values()].filter(({ events: attemptEvents }) => attemptEvents[attemptEvents.length - 1]?.status === "success").length;
  const runningCount = [...attempts.values()].filter(({ events: attemptEvents }) => attemptEvents[attemptEvents.length - 1]?.status === "running").length;
  const failedCount = [...attempts.values()].filter(({ events: attemptEvents }) => ["failed", "blocked"].includes(attemptEvents[attemptEvents.length - 1]?.status ?? "")).length;
  const activeRound = Math.max(1, ...roundNumbers);

  return <div>
    <button type="button" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)} className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition hover:bg-white/[0.025]">
      <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-[var(--text-primary)]"><ChevronDown size={13} className={`shrink-0 text-[var(--text-secondary)] transition-transform ${expanded ? "" : "-rotate-90"}`} /><span className="truncate">执行过程</span><span role="status" className="hidden truncate font-normal text-[var(--text-secondary)] sm:inline">{statusMessage}</span></span>
      <span className="flex shrink-0 items-center gap-2 text-[11px] text-[var(--text-secondary)]"><span>{rounds.length} 轮 · {toolCount} 次工具调用 · {completedCount} 成功{runningCount > 0 ? ` · ${runningCount} 执行中` : ""}{failedCount > 0 ? ` · ${failedCount} 异常` : ""}</span><span className="text-[var(--text-muted)]">{expanded ? "点击收起" : "点击展开"}</span></span>
    </button>
    {expanded && <div className="border-t border-[var(--border)]/80 p-3">
    <div className="flex items-center gap-2 border-b border-[var(--border)]/70 pb-2 text-[11px] text-[var(--text-secondary)]"><Activity size={13} className="text-[var(--accent)]" /><span>已完成 {completedCount} / {toolCount} 次工具调用</span>{runningCount > 0 && <span className="text-[var(--info)]">· {runningCount} 项执行中</span>}{failedCount > 0 && <span className="text-[var(--danger)]">· {failedCount} 项异常</span>}</div>
    <div className="space-y-3 pt-2">
      {rounds.map((round) => <section key={round.number} className="relative border-l border-dashed border-[var(--border)] pl-4">
        <span className="absolute -left-[4px] top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]" />
        <h4 className="m-0 mb-1.5 text-[11px] font-medium text-[var(--text-secondary)]">第 {round.number} 轮</h4>
        {round.notes.map((note, index) => <p key={`${round.number}-note-${index}`} className="mb-1 mt-0 text-[11px] leading-relaxed text-[var(--text-secondary)]">{note.message}</p>)}
        {round.tools.length > 0 && <div className="space-y-0.5">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] text-[var(--accent)]"><Layers size={12} />本轮 {round.tools.length} 个工具调用{round.tools.length > 1 ? "（依次执行）" : ""}</div>
          {round.tools.map((tool, index) => {
            const failed = tool.latest.status === "failed" || tool.latest.status === "blocked";
            const done = tool.latest.status === "success";
            const running = tool.latest.status === "running";
            const description = tool.latest.message || tool.command || tool.output || "等待工具返回";
            return <details key={tool.key} data-copilot-active-event={round.number === activeRound && index === round.tools.length - 1 && running ? "true" : undefined} open={running} className="group border-b border-[var(--border)]/60 last:border-b-0">
              <summary className="flex min-w-0 cursor-pointer list-none items-center gap-2 py-1.5 text-[11px] hover:bg-white/[0.025]">
                <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border text-[9px] ${done ? "border-emerald-500 text-[var(--success)]" : failed ? "border-rose-500 text-[var(--danger)]" : running ? "border-cyan-500 text-[var(--info)]" : "border-[var(--border)] text-[var(--text-muted)]"}`}>{done ? "✓" : failed ? "!" : running ? "·" : ""}</span>
                <span className="shrink-0 font-mono font-medium text-[var(--text-primary)]">{tool.latest.tool ?? "受控工具"}</span>
                {tool.latest.serverAlias && <span className="max-w-36 shrink-0 truncate rounded bg-surface-800/80 px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">@{tool.latest.serverAlias}</span>}
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-[var(--text-secondary)]">{description}</span>
                {tool.latest.durationMs != null && <span className="shrink-0 text-[10px] text-[var(--text-muted)]">{tool.latest.durationMs}ms</span>}
                <ChevronRight size={13} className="shrink-0 text-[var(--text-muted)] transition-transform group-open:rotate-90" />
              </summary>
              <div className="space-y-1.5 pb-2 pl-6 pr-2 text-[10px]">
                {tool.command && <div><div className="mb-1 text-[var(--text-muted)]">执行内容</div><pre className="m-0 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded bg-black/20 p-2 font-mono text-[var(--text-secondary)]">{tool.command}</pre></div>}
                {tool.output && <div><div className="mb-1 text-[var(--text-muted)]">执行结果</div><pre className="m-0 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-black/20 p-2 font-mono text-[var(--text-secondary)]">{tool.output}</pre></div>}
                {!tool.command && !tool.output && <p className="m-0 text-[var(--text-muted)]">{tool.latest.message || "暂无额外返回内容"}</p>}
              </div>
            </details>;
          })}
        </div>}
      </section>)}
      {streaming && <div className="flex items-center gap-2 pl-4 text-[11px] text-[var(--text-muted)]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />正在继续分析和执行下一步</div>}
    </div>
  </div>}
  </div>;
}

function CopilotMarkdown({ content }: { content: string }) {
  return <div className="copilot-markdown">
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
  </div>;
}

function CopilotApprovalPlanSummary({ detail }: { detail?: AiApprovalDetail }) {
  const plan = detail?.plan;
  if (!plan) return null;
  const risk = plan.risk.level === "high" ? "高危" : plan.risk.level === "medium" ? "中危" : plan.risk.level === "extreme" ? "极高危" : "需复核";
  return <div className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1 text-[10px] text-[var(--text-muted)] sm:grid-cols-2">
    {detail?.mcp && <span className="sm:col-span-2">来源：MCP 客户端 {detail.mcp.sourceClient} · Token #{detail.mcp.tokenId} · 任务 {detail.mcp.taskId}</span>}
    <span>影响范围：{plan.targets.length} 台 · {plan.targets.map((target) => target.serverAlias).join("、") || "目标缺失"}</span>
    <span>风险：{risk}</span>
    <span className="sm:col-span-2">风险说明：{plan.risk.reason}</span>
    {plan.executionSteps.length > 0 && <div className="sm:col-span-2"><div className="mb-1 font-medium text-[var(--text-secondary)]">已审批的执行步骤（{plan.executionSteps.length}）</div><ol className="space-y-1">{plan.executionSteps.map((step, index) => <li key={step.id} className="rounded border border-[var(--border)] bg-black/20 px-2 py-1"><span>{index + 1}. {step.label}</span><code className="mt-1 block break-all whitespace-pre-wrap text-[var(--text-secondary)]">{step.command}</code>{step.verificationCommand && <span className="mt-1 block break-all">验证：{step.verificationCommand}</span>}</li>)}</ol></div>}
    <span>计划：{plan.status}</span>
    <span className="truncate" title={plan.commandSha256}>哈希：{plan.commandSha256.slice(0, 16)}…</span>
    <span className="truncate" title={plan.ruleVersion}>策略：{plan.ruleVersion || "--"}</span>
    <span className="sm:col-span-2">验证：{plan.verificationSteps.map((step) => `${step.label}（${step.command} → ${step.expectedResult}）`).join("；") || "无"}</span>
    <span className="sm:col-span-2">回滚：当前审批动作未配置自动回滚步骤；若验证失败需人工恢复。</span>
  </div>;
}
