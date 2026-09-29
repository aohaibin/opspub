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
  setCredentials: (serverId: number, credentials: SshCredentials) => Promise<void>;
  getCredentials: (serverId: number) => SshCredentials | undefined;
  clearCredentials: (serverId?: number) => void;
  hydrateCredentials: () => Promise<void>;
}

export const useSshSessionStore = create<SshSessionStore>((set, get) => ({
  credentialsByServer: {},
  setCredentials: async (serverId, credentials) => {
    set((state) => ({
      credentialsByServer: {
        ...state.credentialsByServer,
        [serverId]: credentials,
      },
    }));
    // 等系统凭据库写入完成后再结束验证流程，避免用户立即关闭应用导致保存请求丢失。
    await serverApi.saveSshCredentials(serverId, credentials);
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
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const saved = await serverApi.listSavedSshCredentials();
        set({ credentialsByServer: saved });
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 2) {
          await new Promise((resolve) => window.setTimeout(resolve, 150 * (attempt + 1)));
        }
      }
    }
    // 浏览器预览模式或系统凭据库不可用时，保持空缓存并允许手动验证；保留日志便于定位安装版恢复失败。
    console.warn("SSH 凭据恢复失败，将在本次会话中允许重新验证", lastError);
  },
}));
