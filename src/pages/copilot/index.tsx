import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useNavigate } from "react-router-dom";
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
  Plus,
  Pencil,
  Power,
  Puzzle,
  RotateCw,
  Send,
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
import { chatSkillContext, matchChatSkills, parseBuiltinSkills, parseUserSkills, resolveChatSkills, SKILLS_STORAGE_KEY, skillDocument, type ChatSkill } from "@/lib/copilot-skills";
import { UNLOCK_DURATIONS, useAppStore, type UnlockDuration } from "@/store/app";
import type { AiApproval, AiApprovalDetail, CopilotProgress, CopilotToolCall, ModelProfile, Server } from "@/types";
import skillsIndex from "../../../docs/skills-index-20261006.md?raw";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: CopilotToolCall[];
  warnings?: string[];
  modelName?: string | null;
  skillNames?: string[];
  triggeredSkillNames?: string[];
  manualSkillNames?: string[];
  historyCount?: number;
  historyTrimmed?: number;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  skillIds?: string[];
}

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
  { icon: Activity, color: "text-emerald-400", iconBg: "bg-emerald-500/10 border-emerald-500/20", title: "检查一台机器的健康度", description: "磁盘 / 内存 / 关键服务，只使用只读工具", prompt: "帮我检查当前机器的健康度" },
  { icon: ShieldAlert, color: "text-amber-400", iconBg: "bg-amber-500/10 border-amber-500/20", title: "最近有哪些 AI 操作被拦截", description: "查看审计记录和策略拦截原因", prompt: "查看最近被拦截的高危操作审计" },
  { icon: GitMerge, color: "text-indigo-400", iconBg: "bg-indigo-500/10 border-indigo-500/20", title: "部署前检查一台机器", description: "先检查环境与部署目标，不会直接执行变更", prompt: "帮我检查当前服务器的部署环境" },
  { icon: Database, color: "text-cyan-400", iconBg: "bg-cyan-500/10 border-cyan-500/20", title: "给我一份 Nginx 排障思路", description: "分析常见原因并给出验证步骤", prompt: "给我一份针对当前服务器的 nginx 排障思路" },
];

const INITIAL_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "你好，我是 OpsPub 运维助手。你可以直接用自然语言查询服务器信息，不需要逐条创建模板。查询命令会先由后端校验为安全只读操作；改动操作仍受风险策略和人工审批约束。",
};

let initialChatState: { sessions: ChatSession[]; activeSessionId: string } | null = null;

function sessionTitle(messages: ChatMessage[]) {
  const firstUser = messages.find((item) => item.role === "user" && item.content.trim());
  if (!firstUser) return "新建对话";
  const title = firstUser.content.replace(/\s+/g, " ").trim();
  return title.length > 32 ? `${title.slice(0, 32)}…` : title;
}

function hasConversationContent(messages: ChatMessage[]) {
  return messages.some((item) => item.role === "user" && item.content.trim().length > 0);
}

function newChatSession(messages: ChatMessage[] = [INITIAL_MESSAGE]): ChatSession {
  const now = Date.now();
  return { id: crypto.randomUUID(), title: sessionTitle(messages), createdAt: now, updatedAt: now, messages };
}

function loadChatState(): { sessions: ChatSession[]; activeSessionId: string } {
  if (initialChatState) return initialChatState;

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
    initialChatState = { sessions, activeSessionId: activeSession.id };
    return initialChatState;
  } catch {
    const session = newChatSession();
    sessionStorage.setItem(RUNTIME_CHAT_SESSION_KEY, session.id);
    initialChatState = { sessions: [session], activeSessionId: session.id };
    return initialChatState;
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

const MUTATING_TOOL_NAMES = new Set(["execute_command", "write_file", "sftp_write"]);

function isMutatingTool(tool: string) {
  return MUTATING_TOOL_NAMES.has(tool) || tool.startsWith("restart_");
}

function toolStatusLabel(status: CopilotToolCall["status"]) {
  return status === "success" ? "已完成" : status === "failed" ? "失败" : status === "blocked" ? "已拦截" : status === "pending" ? "待审批" : "已跳过";
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
  // 顶部会话选择器和 AI 对话必须共用同一个目标，避免本地副本在切换后继续发送旧 ID。
  const serverId = activeServerId;
  const [modelProfiles, setModelProfiles] = useState<ModelProfile[]>([]);
  const [modelProfileId, setModelProfileId] = useState<string | null>(() => localStorage.getItem("ops_copilot_model_profile"));
  const [input, setInput] = useState("");
  const [chatState] = useState(loadChatState);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showPolicyNotice, setShowPolicyNotice] = useState(() => sessionStorage.getItem(RUNTIME_POLICY_NOTICE_DISMISSED_KEY) !== "true");
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
  const [sessions, setSessions] = useState<ChatSession[]>(chatState.sessions);
  const [activeSessionId, setActiveSessionId] = useState(chatState.activeSessionId);
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
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<CopilotProgress | null>(null);
  const [approvals, setApprovals] = useState<AiApproval[]>([]);
  const [approvalDetails, setApprovalDetails] = useState<AiApprovalDetail[]>([]);
  const [approvalBusy, setApprovalBusy] = useState<number | null>(null);
  const [lockSaving, setLockSaving] = useState(false);
  const [lockPopoverOpen, setLockPopoverOpen] = useState(false);
  const [lockedPromptOpen, setLockedPromptOpen] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [pendingRegenerateMessageId, setPendingRegenerateMessageId] = useState<string | null>(null);
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
    void listen<CopilotProgress>("copilot-progress", (event) => {
      if (!disposed) setProgress(event.payload);
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

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, progress]);

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
    setApprovalBusy(id);
    try {
      await copilotApi.rejectApproval(id);
      updateApprovalToolCall(id, "blocked", "人工已拒绝，此命令未执行");
      await refreshApprovals();
    }
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
          updateApprovalToolCall(
            item.id,
            result.status === "completed" ? "success" : "failed",
            result.result || (result.status === "completed" ? "操作执行并验证完成" : "操作执行失败"),
          );
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
      // 只有真正发送过问题的会话才进入历史；新建但未提问的窗口仅保留在当前内存中。
      const persistedSessions = sessions.filter((session) => hasConversationContent(session.messages));
      if (persistedSessions.length > 0) localStorage.setItem(CHAT_SESSIONS_KEY, JSON.stringify(persistedSessions));
      else localStorage.removeItem(CHAT_SESSIONS_KEY);
      localStorage.setItem(ACTIVE_CHAT_SESSION_KEY, activeSessionId);
      localStorage.removeItem(LEGACY_HISTORY_KEY);
      initialChatState = { sessions, activeSessionId };
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
    setSuppressedAutoSkillIds([]);
  };

  const switchSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setHistoryOpen(false);
    setInput("");
    setProgress(null);
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

  useEffect(() => {
    localStorage.setItem(ACTIVE_CHAT_SESSION_KEY, activeSessionId);
    sessionStorage.setItem(RUNTIME_CHAT_SESSION_KEY, activeSessionId);
  }, [activeSessionId]);

  const serverOptions = useMemo(() => [
    { value: null, label: "自动选择（问题中指定或单台服务器）" },
    ...servers.map((server) => ({ value: server.id, label: `${server.alias} · ${server.hostname}` })),
  ], [servers]);

  const send = async (prompt = input, bypassLockPrompt = false, regenerateMessageId: string | null = null) => {
    const text = prompt.trim();
    if (!text || loading) return;
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
    const requestSessionId = activeSessionId;
    const currentMessages = sessions.find((session) => session.id === requestSessionId)?.messages ?? messages;
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
    setInput("");
    updateSessionMessages(requestSessionId, (current) => regenerateIndex >= 0
      ? current.slice(0, regenerateIndex)
      : [...current, { id: crypto.randomUUID(), role: "user", content: text }]);
    setLoading(true);
    setProgress({ stage: "queued", message: "正在分析问题并选择受控工具", serverAlias: null, completed: false });
    try {
      const history = historyMessages.filter((item) => item.id !== "welcome").slice(-12).map((item) => ({ role: item.role, content: item.content }));
      const skillContext = chatSkillContext(activeSkills);
      const result = await copilotApi.chat({ message: text, serverId: serverId ?? null, provider: modelProfileId ? "model" : "local-safe-tools", modelProfileId, history, skillIds: activeSkills.map((skill) => skill.id), skillContext });
      updateSessionMessages(requestSessionId, (current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: result.reply, modelName: result.modelName, toolCalls: result.toolCalls, warnings: result.warnings, skillNames: activeSkills.map((skill) => skill.name), triggeredSkillNames, manualSkillNames, historyCount: history.length, historyTrimmed: result.historyTrimmed }]);
      if (result.toolCalls.some((tool) => tool.approvalId)) await refreshApprovals();
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      updateSessionMessages(requestSessionId, (current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: `请求失败：${errorMessage}` }]);
      message.error(errorMessage);
    } finally {
      setLoading(false);
      setProgress(null);
      setSuppressedAutoSkillIds([]);
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
    setProgress(null);
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
        width={520}
        footer={null}
        closable
        maskClosable={false}
        onCancel={() => { setLockedPromptOpen(false); setPendingPrompt(null); setPendingRegenerateMessageId(null); }}
        title={
          <span className="flex items-center gap-2.5" style={{ color: "var(--text-primary)" }}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/20 text-amber-400">
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
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">待分析命令或请求
            <Input.TextArea className="mt-2 font-mono" value={explainText} onChange={(event) => setExplainText(event.target.value)} maxLength={4000} showCount rows={5} placeholder="粘贴被拦截的命令或命令请求" />
          </label>
          {explainResult && <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
            <h3 className="mb-2 mt-0 text-base font-semibold text-slate-900 dark:text-slate-100">分析结果</h3>
            <div className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700 dark:text-slate-300">{explainResult}</div>
          </section>}
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

      <div className="flex shrink-0 flex-col gap-2 border-b border-slate-800/80 bg-surface-950/60 px-5 py-2 text-xs">
        <div className="flex items-center justify-between gap-2.5 flex-wrap">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-800 bg-[#0e131b] px-2.5 text-slate-400"><Bot size={14} className="text-indigo-400" /><span className="text-[11px]">内置对话</span><Select size="small" variant="borderless" className="min-w-44" value={modelProfileId ?? "local-safe-tools"} onChange={(value) => setModelProfileId(value === "local-safe-tools" ? null : value)} options={[{ value: "local-safe-tools", label: "本地受控工具" }, ...modelProfiles.map((profile) => ({ value: profile.id, label: `${profile.name} · ${profile.model || "未指定模型"}` }))]} /><Button type="text" size="small" aria-label="配置模型服务" title="配置模型服务" icon={<Settings2 size={14} />} onClick={() => navigate("/settings", { state: { from: "copilot" } })} className="!h-6 !w-6 !p-0 !text-slate-400 hover:!text-white" /></div>
            <label className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-800 bg-[#0e131b] px-2.5 text-slate-400"><Database size={14} className="text-teal-400" /><span className="sr-only">目标服务器</span><Select size="small" variant="borderless" className="min-w-52 max-w-72" value={serverId} onChange={(value) => setActiveServerId(value === null || value === undefined ? null : Number(value))} options={serverOptions} /></label>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <Button size="small" className="!h-8 !border-slate-800 !bg-[#0e131b] !text-slate-300" icon={<Puzzle size={14} className="text-amber-400" />} onClick={() => message.info("AI 工具由当前服务器策略和 MCP 接入配置共同控制")}>外部工具</Button>
            <div className="flex min-h-8 min-w-[240px] max-w-[32rem] flex-1 items-center gap-1.5 rounded-lg border border-slate-800 bg-[#0e131b] px-2.5 text-slate-400">
              <Puzzle size={14} className="shrink-0 text-amber-400" /><span className="shrink-0 text-xs">本轮技能</span>
              <Select aria-label="本轮技能" mode="multiple" size="small" variant="borderless" allowClear showSearch maxTagCount="responsive" className="min-w-0 flex-1" placeholder="输入问题后自动匹配，也可手动补充" value={visibleSkillIds} disabled={loading} optionFilterProp="label" onChange={(ids: string[]) => {
              // 删除某个自动技能时，不要把其余自动匹配项变成会话固定项。
              setSelectedSkillIds(ids.filter((id) => selectedSkillIds.includes(id) || suppressedAutoSkillIds.includes(id) || !matchedSkills.some((skill) => skill.id === id)));
              setSuppressedAutoSkillIds(matchedSkills.filter((skill) => !ids.includes(skill.id)).map((skill) => skill.id));
            }} options={chatSkills.map((skill) => ({ value: skill.id, label: `${skill.name} · ${matchedSkills.some((item) => item.id === skill.id) && !selectedSkillIds.includes(skill.id) ? "自动" : skill.source === "user" ? "用户" : "内置"}`, title: skill.description }))} />
          </div>
            </div>
          </div>
        <div className="flex items-center justify-between gap-2 text-xs flex-wrap">
          <div className="flex min-w-0 items-center gap-2 text-[11px] text-slate-500"><span>技能按问题关键词自动匹配（最多 3 项），手动选择可额外补充；无需预先指定</span><span className="shrink-0">{historySessions.length} 个会话</span></div>
          <div className="flex items-center gap-3 text-slate-400">
            <button type="button" onClick={() => void navigate("/credentials")} className="flex items-center gap-1 transition hover:text-white"><ShieldCheck size={14} />查看凭据状态</button>
            <button type="button" onClick={() => setHistoryOpen(true)} className="flex items-center gap-1 transition hover:text-white"><History size={14} />历史</button>
            <button type="button" onClick={openExperienceSave} className="flex items-center gap-1 transition hover:text-white"><Bookmark size={14} />存为经验</button>
            <button type="button" onClick={() => setExperienceLibraryOpen(true)} className="flex items-center gap-1 transition hover:text-white">经验库{experiences.length > 0 ? ` (${experiences.length})` : ""}</button>
            <button type="button" onClick={createSession} className="flex items-center gap-1 font-medium text-slate-300 transition hover:text-white"><Plus size={14} />新对话</button>
            <Popconfirm title="清空当前对话内容？" okText="清空" cancelText="取消" onConfirm={clearHistory}><button type="button" className="flex items-center gap-1 text-slate-400 transition hover:text-rose-300"><X size={13} />清空</button></Popconfirm>
          </div>
        </div>
      </div>

      {approvals.length > 0 && <section className="custom-scrollbar max-h-52 shrink-0 overflow-y-auto border-b border-amber-500/30 bg-amber-950/10 p-3"><div className="mb-2 font-semibold text-amber-300">人工审批 · 待处理 {approvals.filter((item) => item.status === "pending").length}</div>{approvals.filter((item) => item.status === "pending").map((item) => <div key={item.id} className="mb-2 rounded border border-slate-700 px-2 py-2"><div className="flex flex-wrap items-center justify-between gap-2"><span>#{item.id} · {item.serverAlias} · {item.command} · {new Date(item.expiresAt * 1000).toLocaleTimeString()} 过期</span><span className="flex gap-1"><Button size="small" disabled={approvalBusy !== null} onClick={() => void rejectApproval(item.id)}>拒绝</Button><Button size="small" danger loading={approvalBusy === item.id} disabled={approvalBusy !== null && approvalBusy !== item.id} onClick={() => approveApproval(item)}>批准并执行</Button></span></div><CopilotApprovalPlanSummary detail={approvalDetailById.get(item.id)} /></div>)}<details className="mt-1 text-slate-400"><summary className="cursor-pointer">最近审批记录</summary>{approvals.filter((item) => item.status !== "pending").slice(0, 10).map((item) => <div key={item.id} className="border-b border-slate-800 py-1">#{item.id} · {item.serverAlias} · {item.command} · {item.status}{item.result ? ` · ${item.result}` : ""}</div>)}</details></section>}

      <Modal title={<span className="flex items-center gap-2"><History size={16} />历史对话 <Tag className="m-0">{historySessions.length}</Tag></span>} open={historyOpen} onCancel={() => setHistoryOpen(false)} footer={null} width={620} destroyOnClose>
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
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="m-0 truncate text-sm font-semibold text-slate-100">{item.title}</h3><p className="mb-0 mt-1 text-[10px] text-slate-500">保存于 {new Date(item.createdAt).toLocaleString()}</p></div><div className="flex shrink-0 items-center gap-1"><Button size="small" type="dashed" onClick={() => openSkillDraft(item)}>提炼为技能</Button><Button size="small" onClick={() => { setInput((current) => current ? `${current}\n\n参考本机经验「${item.title}」：\n${item.content}` : `参考本机经验「${item.title}」：\n${item.content}`); setExperienceLibraryOpen(false); }}>放入对话</Button><Popconfirm title="删除这条本机经验？" okText="删除" cancelText="取消" onConfirm={() => setExperiences((current) => current.filter((experience) => experience.id !== item.id))}><Button size="small" danger type="text">删除</Button></Popconfirm></div></div>
              <details className="mt-2"><summary className="cursor-pointer text-[11px] text-indigo-300">查看内容</summary><pre className="mb-0 mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-black/20 p-2 text-xs leading-relaxed text-slate-300">{item.content}</pre></details>
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

      <main className="custom-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
        <div className="flex w-full flex-col gap-5">
          {messages.length === 1 && messages[0]?.id === "welcome" ? <div className="space-y-6 py-8 text-center">
            <div className="mx-auto max-w-3xl space-y-2"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-500/25 bg-indigo-500/10 text-indigo-400 shadow-inner"><Bot size={24} /></div><h2 className="m-0 text-base font-bold text-white">有什么可以帮你？</h2><p className="mx-auto max-w-md text-xs leading-relaxed text-slate-400">AI 会调用你授权的工具查看、操作服务器，每一步都受 AI 操作策略约束并记入审计。</p></div>
            <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-3 text-left md:grid-cols-2">{QUICK_PROMPTS.map((item) => { const Icon = item.icon; return <button key={item.title} type="button" disabled={loading} onClick={() => void send(item.prompt)} className="group space-y-1.5 rounded-xl border border-slate-800/80 bg-[#0f141c] p-4 text-left transition hover:border-slate-700 hover:bg-surface-900/60 disabled:opacity-60"><div className="flex items-center gap-2 text-xs font-bold text-white transition group-hover:text-indigo-400"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${item.iconBg}`}><Icon size={14} className={item.color} /></span><span>{item.title}</span></div><p className="m-0 pl-9 text-[11px] leading-relaxed text-slate-400">{item.description}</p></button>; })}</div>
            <div className="mx-auto flex max-w-3xl items-center justify-center gap-1.5 pt-2 text-[11px] text-slate-500"><History size={14} className="text-slate-600" /><span>对话会自动保存，可在上方“历史”中继续。</span></div>
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
                <article className="inline-flex items-center rounded-2xl rounded-tr-md border border-slate-700/80 bg-[#1e2330] px-5 py-2.5 text-xs leading-normal text-slate-100 shadow-sm transition hover:bg-[#242a3a]"><div className="whitespace-pre-wrap break-words">{item.content}</div></article>
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
              const targetAliases = Array.from(new Set(item.toolCalls?.map((tool) => tool.serverAlias).filter((alias): alias is string => Boolean(alias)) ?? []));
              const contextCount = item.historyCount ?? 0;
              const hasPendingApproval = item.toolCalls?.some((tool) => tool.status === "pending") ?? false;
              const hasBlockedTool = item.toolCalls?.some((tool) => tool.status === "blocked") ?? false;
              const hasFailedTool = item.toolCalls?.some((tool) => tool.status === "failed") ?? false;
              const hasMutationTool = item.toolCalls?.some((tool) => isMutatingTool(tool.tool)) ?? false;
              const intentSummary = toolCount ? `已匹配 ${item.toolCalls?.map((tool) => tool.tool).join("、")}` : "未调用服务器工具";
              const policySummary = hasPendingApproval ? "改动操作 · 等待人工审批" : hasBlockedTool ? "策略阻断 · 未执行" : hasFailedTool ? "受控探针执行失败" : hasMutationTool ? "改动工具 · 受审批策略约束" : toolCount ? "受控只读查询 · 不执行改动" : "未命中远程工具";
              return (
            <article key={item.id} className="w-full space-y-3.5 rounded-2xl border border-slate-800/90 bg-[#0f141c] p-5 text-xs shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                <div className="flex flex-wrap items-center gap-2"><span className="flex items-center gap-1.5 font-bold text-white"><Bot size={15} className="text-indigo-400" />OpsPub AI 助手</span><Tag bordered={false} color={item.content.startsWith("请求失败：") ? "error" : "success"} className="m-0">{item.content.startsWith("请求失败：") ? "未完成" : "已完成"}</Tag>{triggeredSkillNames.length > 0 && <Tag bordered={false} color="gold" className="m-0"><span className="inline-flex items-center gap-1"><Puzzle size={12} />关键词触发：{triggeredSkillNames.join("、")}</span></Tag>}{manualSkillNames.length > 0 && <Tag bordered={false} color="blue" className="m-0"><span className="inline-flex items-center gap-1"><Puzzle size={12} />手动补充：{manualSkillNames.join("、")}</span></Tag>}</div>
                <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate-400"><span>本轮 1 轮</span><span className="text-slate-700">·</span><span>{completedToolCount}/{toolCount} 次工具完成</span><span className="text-slate-700">·</span><span>{usedSkillCount} 个技能</span><span className="text-slate-700">·</span><span>上下文 {contextCount} 条{item.historyTrimmed ? `（裁剪 ${item.historyTrimmed}）` : ""}</span><span className="text-slate-600">·</span><span>{item.modelName ? `模型 · ${item.modelName}` : "本地受控模式"}</span></div>
              </div>
              <CopilotMarkdown content={item.content} />
              <details open={Boolean(item.toolCalls?.length)} className="overflow-hidden rounded-xl border border-slate-800/80 bg-[#0b0f16]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 bg-surface-900/60 px-3.5 py-2.5 text-xs transition hover:bg-surface-850/80">
                  <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-200"><FileText size={14} className="shrink-0 text-cyan-400" />分析与执行过程 <span className="truncate font-normal text-slate-400">{item.toolCalls?.length ? `${item.toolCalls.length} 条工具记录` : "请求与策略摘要"}</span></span>
                  <span className="shrink-0 text-[11px] text-slate-500">查看过程摘要</span>
                </summary>
                <div className="space-y-3 border-t border-slate-800/80 bg-[#090c12] p-3.5">
                  <div><div className="mb-1 text-[11px] font-semibold text-slate-300">本轮问题</div><p className="m-0 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-400">{sourceRequest || "未找到关联问题"}</p></div>
                  <div className="grid grid-cols-1 gap-2 text-[11px] text-slate-400 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg border border-slate-800/80 bg-[#0d121a] p-2.5"><span className="block text-slate-500">意图识别</span><strong className="mt-1 block break-words font-medium text-slate-200">{intentSummary}</strong></div>
                    <div className="rounded-lg border border-slate-800/80 bg-[#0d121a] p-2.5"><span className="block text-slate-500">目标选择</span><strong className="mt-1 block break-words font-medium text-slate-200">{targetAliases.length ? targetAliases.join("、") : "未建立远程会话"}</strong></div>
                    <div className="rounded-lg border border-slate-800/80 bg-[#0d121a] p-2.5"><span className="block text-slate-500">策略判定</span><strong className={`mt-1 block break-words font-medium ${hasBlockedTool || hasFailedTool ? "text-amber-300" : hasPendingApproval || hasMutationTool ? "text-amber-200" : "text-emerald-300"}`}>{policySummary}</strong></div>
                    <div className="rounded-lg border border-slate-800/80 bg-[#0d121a] p-2.5"><span className="block text-slate-500">会话上下文</span><strong className="mt-1 block font-medium text-slate-200">最近 {contextCount} 条消息</strong><span className="mt-1 block text-slate-500">不包含跨会话语义记忆检索</span></div>
                  </div>
                  {item.skillNames?.length ? <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400"><Puzzle size={13} /><span>参考技能</span>{item.skillNames.map((name) => <Tag key={name} className="m-0">{name}</Tag>)}</div> : null}
                  {item.toolCalls?.length ? <div className="space-y-2">{item.toolCalls.map((tool, index) => <div key={`${tool.tool}-${tool.serverAlias}-${index}`} className="rounded-lg border border-slate-800/80 bg-[#0d121a] p-2.5"><div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-cyan-300"><TerminalSquare size={13} />{tool.tool}{tool.serverAlias ? <span className="font-sans font-normal text-slate-500">@{tool.serverAlias}</span> : null}</span><Tag color={tool.status === "success" ? "success" : tool.status === "blocked" ? "warning" : tool.status === "skipped" ? "default" : tool.status === "pending" ? "processing" : "error"}>{toolStatusLabel(tool.status)}</Tag></div><pre className="m-0 mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded bg-black/20 p-2 font-mono text-[11px] leading-relaxed text-slate-400">{tool.output || "无输出"}</pre></div>)}</div> : <p className="m-0 text-[11px] text-slate-500">没有调用服务器工具；以上内容由模型根据对话上下文生成。</p>}
                  {item.warnings?.length ? <div className="space-y-1">{item.warnings.map((warning) => <p key={warning} className="m-0 text-[11px] text-amber-300">策略提示：{warning}</p>)}</div> : null}
                  <p className="m-0 border-t border-slate-800 pt-2 text-[10px] text-slate-600">此处展示可核验的策略状态和工具记录，不包含模型隐藏思维链。</p>
                </div>
              </details>
              {item.toolCalls?.map((tool) => {
                if (typeof tool.approvalId !== "number") return null;
                const detail = approvalDetailById.get(tool.approvalId);
                const approval = detail?.approval;
                const pending = approval?.status === "pending";
                const statusLabel = approval?.status === "pending" ? "等待审批" : approval?.status === "completed" ? "执行完成" : approval?.status === "rejected" ? "已拒绝" : approval?.status === "expired" ? "已过期" : approval?.status === "failed" ? "执行失败" : approval?.status ?? "状态同步中";
                return <section key={`approval-${tool.approvalId}`} className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 font-semibold text-amber-200"><ShieldAlert size={15} />人工审批 #{tool.approvalId}<Tag color={pending ? "processing" : approval?.status === "completed" ? "success" : approval?.status === "failed" ? "error" : "default"}>{statusLabel}</Tag></div>{approval && <span className="text-[11px] text-slate-500">{pending ? `失效时间 ${new Date(approval.expiresAt * 1000).toLocaleTimeString()}` : approval.decidedAt ? `处理于 ${new Date(approval.decidedAt * 1000).toLocaleString()}` : ""}</span>}</div>
                  <div className="mt-2 grid gap-1 text-[11px] text-slate-400"><span>目标：{approval?.serverAlias ?? tool.serverAlias ?? "待同步"}</span><span>操作：{approval?.action ?? tool.tool}</span><code className="break-all rounded bg-black/20 p-2 text-amber-100">{approval?.command ?? tool.output}</code></div>
                  <CopilotApprovalPlanSummary detail={detail} />
                  {approval?.result && !pending && <p className="mb-0 mt-2 whitespace-pre-wrap break-words text-[11px] text-slate-400">结果：{approval.result}</p>}
                  {pending && approval && <div className="mt-3 flex justify-end gap-2"><Button size="small" disabled={approvalBusy !== null} onClick={() => void rejectApproval(approval.id)}>拒绝</Button><Button size="small" danger loading={approvalBusy === approval.id} disabled={approvalBusy !== null && approvalBusy !== approval.id} onClick={() => approveApproval(approval)}>批准并执行</Button></div>}
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
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-2">
                <span className="text-[10px] text-slate-600">{item.modelName ? `由 ${item.modelName} 生成` : "OpsPub 受控助手"}</span>
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
          {loading && <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-surface-900 p-3 text-slate-400"><Spin size="small" />{progress?.message ?? "正在处理..."}{progress?.serverAlias ? ` · ${progress.serverAlias}` : ""}</div>}
          <div ref={bottomRef} />
        </div>
      </main>

      {showPolicyNotice && <div className="mx-5 mb-2 flex shrink-0 items-center justify-between gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-2 text-xs text-amber-300"><div className="flex min-w-0 items-center gap-2"><ShieldAlert size={15} className="shrink-0 text-amber-400" /><span className="leading-relaxed">改动型操作受 AI 总开关、服务器策略和人工审批共同约束；模型服务仅接收当前对话及脱敏结果，不会收到 SSH 凭据。</span></div><div className="flex shrink-0 items-center gap-3"><button type="button" onClick={() => void navigate("/settings")} className="font-medium underline decoration-amber-500/50 underline-offset-2 hover:text-white">查看策略</button><button type="button" aria-label="关闭安全提示" title="关闭提示" onClick={() => { sessionStorage.setItem(RUNTIME_POLICY_NOTICE_DISMISSED_KEY, "true"); setShowPolicyNotice(false); }} className="rounded p-1 text-amber-300/70 transition hover:bg-amber-500/15 hover:text-white"><X size={15} /></button></div></div>}

      <footer className="shrink-0 bg-surface-900 px-5 pb-4 pt-1"><div className="w-full space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500"><div className="flex items-center gap-2"><span className="text-slate-400">{serverId === null ? `可见 ${servers.length} 台` : "已选定服务器"}</span><span>·</span><span className="text-slate-400">{modelProfiles.find((profile) => profile.id === modelProfileId)?.model ?? (modelProfileId ? "已配置模型" : "本地受控工具")}</span></div><div className="flex flex-wrap items-center gap-1.5">{["继续", "建议", "验证", "重试", "说明", "总结"].map((chip) => <button key={chip} type="button" disabled={loading} onClick={() => setInput((current) => current ? `${current} ${chip}` : chip)} className="rounded border border-slate-800 bg-[#131924] px-2 py-0.5 text-[11px] text-slate-400 transition hover:bg-[#1a2332] hover:text-slate-200 disabled:opacity-50">{chip}</button>)}</div></div>
        <div className="flex items-end gap-2 rounded-2xl border border-slate-800 bg-[#0e131b] p-1.5 pl-4 shadow-lg transition hover:border-slate-700 focus-within:border-indigo-500/80"><Input.TextArea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} autoSize={{ minRows: 1, maxRows: 5 }} disabled={loading} bordered={false} className="!resize-none !bg-transparent" style={{ fontSize: 12, lineHeight: 1.5, fontFamily: "inherit" }} placeholder="问点什么…（AI 只看到服务器别名，看不到任何凭据）" /><Button size="small" type="text" aria-label="清空输入" title="清空输入" disabled={!input} onClick={() => setInput("")} className="!text-slate-500 hover:!text-slate-200"><X size={15} /></Button><Button size="small" type="primary" icon={<Send size={14} />} loading={loading} disabled={!input.trim()} onClick={() => void send()}>发送</Button></div>
      </div></footer>
    </div>
  );
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
  return <div className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1 text-[10px] text-slate-500 sm:grid-cols-2">
    <span>风险：{risk}</span>
    <span>计划：{plan.status}</span>
    <span className="truncate" title={plan.commandSha256}>哈希：{plan.commandSha256.slice(0, 16)}…</span>
    <span className="truncate" title={plan.ruleVersion}>策略：{plan.ruleVersion || "--"}</span>
    <span className="sm:col-span-2">验证：{plan.verificationSteps.map((step) => step.label).join("、") || "无"}</span>
  </div>;
}
