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
  forgetCredentials: (serverId: number) => Promise<void>;
  refreshCredentials: () => Promise<void>;
  hydrateCredentials: () => Promise<void>;
}

export const useSshSessionStore = create<SshSessionStore>((set, get) => ({
  credentialsByServer: {},
  setCredentials: async (serverId, credentials) => {
    const hasCredential = Boolean(
      credentials.password?.trim()
      || credentials.privateKeyPath?.trim()
      || credentials.privateKeyText?.trim()
    );
    if (!hasCredential) {
      // 空值只用于标记后端已通过系统凭据库验证成功，不覆盖凭据库中的秘密。
      set((state) => ({
        credentialsByServer: {
          ...state.credentialsByServer,
          [serverId]: {},
        },
      }));
      return;
    }
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
  forgetCredentials: async (serverId) => {
    // Rust 可能返回删除失败，此时保留标记，待调用方重新读取系统凭据状态。
    await serverApi.deleteSshCredentials(serverId);
    set((state) => {
      const next = { ...state.credentialsByServer };
      delete next[serverId];
      return { credentialsByServer: next };
    });
  },
  refreshCredentials: async () => {
    const savedIds = await serverApi.listSavedSshCredentials();
    set({ credentialsByServer: Object.fromEntries(savedIds.map((id) => [id, {}])) });
  },
  hydrateCredentials: async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await get().refreshCredentials();
        return;
      } catch {
        if (attempt < 2) {
          await new Promise((resolve) => window.setTimeout(resolve, 150 * (attempt + 1)));
        }
      }
    }
    // 系统凭据库不可用时，保留现有标记并允许稍后重试。
    console.warn("SSH 凭据恢复失败");
  },
}));
