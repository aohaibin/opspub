import { create } from "zustand";
import { serverApi } from "@/lib/api/server";
import type { SshCredentials } from "@/types";

/**
 * SSH 会话凭据缓存。
 *
 * 明文只短暂存在当前 WebView 内存，持久化由 Rust 写入当前用户的系统凭据管理器；
 * 不使用 localStorage 或 SQLite 保存密码、私钥口令等敏感值。
 */
interface SshSessionStore {
  credentialsByServer: Record<number, SshCredentials>;
  setCredentials: (serverId: number, credentials: SshCredentials) => void;
  getCredentials: (serverId: number) => SshCredentials | undefined;
  clearCredentials: (serverId?: number) => void;
  hydrateCredentials: () => Promise<void>;
}

export const useSshSessionStore = create<SshSessionStore>((set, get) => ({
  credentialsByServer: {},
  setCredentials: (serverId, credentials) => {
    set((state) => ({
      credentialsByServer: {
        ...state.credentialsByServer,
        [serverId]: credentials,
      },
    }));
    void serverApi.saveSshCredentials(serverId, credentials).catch(() => {
      // 浏览器预览模式没有 Tauri IPC；内存缓存仍可供本次会话使用。
    });
  },
  getCredentials: (serverId) => get().credentialsByServer[serverId],
  clearCredentials: (serverId) => {
    const existingIds = Object.keys(get().credentialsByServer).map(Number);
    set((state) => {
      if (serverId === undefined) return { credentialsByServer: {} };
      const next = { ...state.credentialsByServer };
      delete next[serverId];
      return { credentialsByServer: next };
    });
    if (serverId === undefined) {
      existingIds.forEach((id) => void serverApi.deleteSshCredentials(id).catch(() => {}));
    } else {
      void serverApi.deleteSshCredentials(serverId).catch(() => {});
    }
  },
  hydrateCredentials: async () => {
    try {
      const saved = await serverApi.listSavedSshCredentials();
      set({ credentialsByServer: saved });
    } catch {
      // 浏览器预览模式或系统凭据库不可用时，保持空缓存并允许手动验证。
    }
  },
}));
