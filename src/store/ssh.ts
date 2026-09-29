import { create } from "zustand";
import { serverApi } from "@/lib/api/server";
import type { SshCredentials } from "@/types";

/**
 * SSH 会话凭据状态。
 *
 * 凭据明文只在用户刚完成验证的当前调用链中短暂存在，随后由 Rust 写入当前用户的
 * 系统凭据管理器。这里的值只表示“该服务器已有托管凭据”，不保存密码、私钥口令等敏感值。
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
    // 先落到系统凭据管理器，成功后只在前端保留一个空对象作为“已托管”标记。
    // 后续连接请求可以不携带凭据，由 Rust 在本机凭据库中回读，避免密码进入长期内存。
    await serverApi.saveSshCredentials(serverId, credentials);
    set((state) => ({
      credentialsByServer: {
        ...state.credentialsByServer,
        [serverId]: {},
      },
    }));
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
        const savedIds = await serverApi.listSavedSshCredentials();
        set({
          credentialsByServer: Object.fromEntries(savedIds.map((id) => [id, {}])),
        });
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
