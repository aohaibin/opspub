import { createStore } from "zustand/vanilla";
import type { CopilotProgress, CopilotResponse, CopilotToolCall } from "@/types";

export interface ChatMessage {
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
  streaming?: boolean;
  progressEvents?: CopilotProgress[];
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  skillIds?: string[];
}

interface ActiveRequest {
  id: string;
  progress: CopilotProgress;
}

export function sessionTitle(messages: ChatMessage[]) {
  const firstUser = messages.find((item) => item.role === "user" && item.content.trim());
  if (!firstUser) return "新建对话";
  const title = firstUser.content.replace(/\s+/g, " ").trim();
  return title.length > 32 ? `${title.slice(0, 32)}…` : title;
}

function applyProgress(item: ChatMessage, update: CopilotProgress): ChatMessage {
  const progressEvents = update.kind === "text_delta"
    ? item.progressEvents
    // 保留多轮工具事件，避免前几轮的执行记录被过早截掉。
    : [...(item.progressEvents ?? []), update].slice(-500);
  const content = update.kind === "text_delta" ? `${item.content}${update.delta ?? ""}` : item.content;
  let toolCalls = item.toolCalls ?? [];
  if (update.kind === "tool" && update.tool) {
    const existing = update.status === "running"
      ? -1
      : toolCalls.map((call) => call.tool === update.tool && call.serverAlias === update.serverAlias && call.status === "running").lastIndexOf(true);
    const nextCall: CopilotToolCall = {
      tool: update.tool,
      serverAlias: update.serverAlias ?? null,
      status: (update.status ?? "pending") as CopilotToolCall["status"],
      output: update.delta ?? "",
    };
    toolCalls = existing >= 0
      ? toolCalls.map((call, index) => index === existing ? { ...call, ...nextCall } : call)
      : [...toolCalls, nextCall];
  }
  return { ...item, content, toolCalls, progressEvents, streaming: update.kind !== "done" && update.kind !== "error" };
}

export function createCopilotChatStore(initial: { sessions: ChatSession[]; activeSessionId: string }) {
  const store = createStore(() => ({ ...initial, requests: new Map<string, ActiveRequest>() }));

  const setSessions = (update: ChatSession[] | ((current: ChatSession[]) => ChatSession[])) => {
    store.setState(({ sessions }) => ({ sessions: typeof update === "function" ? update(sessions) : update }));
  };

  const setActiveSessionId = (activeSessionId: string) => store.setState({ activeSessionId });

  const beginRequest = (sessionId: string, reply: ChatMessage, updateMessages: (messages: ChatMessage[]) => ChatMessage[]) => {
    const { sessions, requests } = store.getState();
    if (requests.has(sessionId) || !sessions.some((session) => session.id === sessionId)) return false;
    const progress: CopilotProgress = { kind: "phase", stage: "queued", message: "正在分析问题并选择受控工具", serverAlias: null, completed: false };
    store.setState({
      requests: new Map(requests).set(sessionId, { id: reply.id, progress }),
      sessions: sessions.map((session) => {
        if (session.id !== sessionId) return session;
        const messages = [...updateMessages(session.messages), { ...reply, streaming: true }];
        return { ...session, messages, title: sessionTitle(messages), updatedAt: Date.now() };
      }),
    });
    return true;
  };

  const receiveProgress = (sessionId: string, update: CopilotProgress) => {
    const { sessions, requests } = store.getState();
    const request = requests.get(sessionId);
    if (!request || request.id !== update.requestId) return;
    const owner = sessions.find((session) => session.id === sessionId);
    if (!owner?.messages.some((item) => item.id === request.id && item.streaming)) return;
    store.setState({
      requests: new Map(requests).set(sessionId, { ...request, progress: update }),
      sessions: sessions.map((session) => session === owner
        ? { ...session, messages: session.messages.map((item) => item.id === request.id ? applyProgress(item, update) : item) }
        : session),
    });
  };

  const finishRequest = (sessionId: string, requestId: string, outcome: { result: CopilotResponse } | { error: string }) => {
    const { sessions, requests } = store.getState();
    if (requests.get(sessionId)?.id !== requestId) return;
    const remaining = new Map(requests);
    remaining.delete(sessionId);
    const nextSessions = sessions.map((session) => {
      if (session.id !== sessionId || !session.messages.some((item) => item.id === requestId)) return session;
      return {
        ...session,
        updatedAt: Date.now(),
        messages: session.messages.map((item) => {
          if (item.id !== requestId) return item;
          if ("error" in outcome) {
            return { ...item, content: item.content || `请求失败：${outcome.error}`, streaming: false, warnings: [...(item.warnings ?? []), outcome.error] };
          }
          const { reply, modelName, toolCalls, warnings, historyTrimmed } = outcome.result;
          return { ...item, content: reply, modelName, toolCalls, warnings, historyTrimmed, streaming: false };
        }),
      };
    });
    store.setState({ sessions: nextSessions, requests: remaining });
  };

  return { ...store, setSessions, setActiveSessionId, beginRequest, receiveProgress, finishRequest };
}
