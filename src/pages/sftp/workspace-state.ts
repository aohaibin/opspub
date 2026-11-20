import { create } from "zustand";
import type { Server } from "@/types";
import type { SftpSessionInfo, SftpSessionTab } from "./types";

export type SftpPane = "left" | "right";
type Layout = "single" | "dual-h";

function createTab(id: string, server?: Server): SftpSessionTab {
  return {
    id,
    serverId: server?.id ?? null,
    serverName: server ? server.alias || server.hostname : "选择服务器…",
    serverHost: server ? `${server.hostname}:${server.port}` : "",
    serverUser: server?.username ?? "",
    currentPath: "/root",
    history: ["/root"],
    historyIndex: 0,
  };
}

interface SftpWorkspaceState {
  initialized: boolean;
  tabs: SftpSessionTab[];
  activeTabId: string;
  secondaryTabId: string | null;
  activePane: SftpPane;
  layoutMode: Layout;
  restore: (sessions: SftpSessionInfo[], servers: Server[]) => void;
  setTabs: (update: (tabs: SftpSessionTab[]) => SftpSessionTab[]) => void;
  selectTab: (id: string, pane: SftpPane) => void;
  openPicker: (pane: SftpPane) => void;
  attachSession: (session: SftpSessionInfo, server: Server, pane: SftpPane, originTabId: string | null) => void;
  removeTab: (id: string) => void;
  clearTabs: () => void;
  setLayoutMode: (mode: Layout) => void;
}

// 路由切换会卸载页面。只在应用进程内保留会话标签及目录历史，文件列表返回时重新读取。
export const useSftpWorkspaceStore = create<SftpWorkspaceState>((set, get) => ({
  initialized: false,
  tabs: [],
  activeTabId: "",
  secondaryTabId: null,
  activePane: "left",
  layoutMode: "single",
  restore: (sessions, servers) => {
    if (get().initialized) return;
    const tabs = sessions.flatMap((session) => {
      const server = servers.find((item) => item.id === session.serverId);
      return server && session.status === "connected" ? [createTab(session.sessionId, server)] : [];
    });
    if (tabs.length === 0) tabs.push(createTab("picker-tab-default"));
    set({ initialized: true, tabs, activeTabId: tabs[0].id });
  },
  setTabs: (update) => set((state) => ({ tabs: update(state.tabs) })),
  selectTab: (id, pane) => {
    const { tabs, activeTabId, secondaryTabId, layoutMode } = get();
    if (!tabs.some((tab) => tab.id === id) || (pane === "right" && layoutMode === "single")) return;
    // 选中另一栏正在使用的标签时交换位置，让两个栏始终各自对应一个会话。
    if (pane === "left") {
      set({
        activeTabId: id,
        secondaryTabId: id === secondaryTabId ? activeTabId : secondaryTabId,
        activePane: "left",
      });
    } else if (id === activeTabId) {
      const picker = secondaryTabId ? null : createTab(`picker-tab-${crypto.randomUUID()}`);
      set({
        tabs: picker ? [...tabs, picker] : tabs,
        activeTabId: picker ? picker.id : secondaryTabId!,
        secondaryTabId: id,
        activePane: "right",
      });
    } else {
      set({ secondaryTabId: id, activePane: "right" });
    }
  },
  openPicker: (pane) => {
    const tab = createTab(`picker-tab-${crypto.randomUUID()}`);
    set((state) => ({ tabs: [...state.tabs, tab] }));
    get().selectTab(tab.id, pane);
  },
  attachSession: (session, server, pane, originTabId) => {
    const state = get();
    const existing = state.tabs.find((tab) => tab.serverId === server.id);
    const tab = existing ?? createTab(session.sessionId, server);
    // 异步建连完成时，用户可能已切走原来的选机标签或关闭了双栏。
    const currentTabId = pane === "left" ? state.activeTabId : state.secondaryTabId;
    const shouldSelect = currentTabId === originTabId && (pane === "left" || state.layoutMode === "dual-h");
    const picker = shouldSelect && state.tabs.find((item) => item.id === originTabId && item.serverId === null);
    if (!existing) set({ tabs: picker ? state.tabs.map((item) => item === picker ? tab : item) : [...state.tabs, tab] });
    if (shouldSelect) {
      get().selectTab(tab.id, pane);
      if (existing && picker) get().removeTab(picker.id);
    }
  },
  removeTab: (id) => {
    set((state) => {
      const tabs = state.tabs.filter((tab) => tab.id !== id);
      if (tabs.length === 0) tabs.push(createTab("picker-tab-default"));
      const activeTabId = state.activeTabId === id
        ? (tabs.find((tab) => tab.id === state.secondaryTabId) ?? tabs[0]).id
        : state.activeTabId;
      const secondaryTabId = state.secondaryTabId === id || state.secondaryTabId === activeTabId
        ? null
        : state.secondaryTabId;
      return { tabs, activeTabId, secondaryTabId, activePane: secondaryTabId ? state.activePane : "left" };
    });
  },
  clearTabs: () => set({
    tabs: [createTab("picker-tab-default")],
    activeTabId: "picker-tab-default",
    secondaryTabId: null,
    activePane: "left",
  }),
  setLayoutMode: (mode) => set((state) => ({
    layoutMode: mode,
    activePane: mode === "single" ? "left" : state.activePane,
    secondaryTabId: mode === "dual-h"
      ? state.secondaryTabId ?? state.tabs.find((tab) => tab.id !== state.activeTabId && tab.serverId !== null)?.id ?? null
      : state.secondaryTabId,
  })),
}));
