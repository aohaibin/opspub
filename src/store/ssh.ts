import { create } from "zustand";
import type { SshCredentials } from "@/types";

/**
 * 当前应用进程内的 SSH 凭据缓存。
 * 凭据只保存在内存，供工作台、终端和 SFTP 页面复用，不写入 localStorage 或数据库。
 */
interface SshSessionStore {
  credentialsByServer: Record<number, SshCredentials>;
  setCredentials: (serverId: number, credentials: SshCredentials) => void;
  getCredentials: (serverId: number) => SshCredentials | undefined;
  clearCredentials: (serverId?: number) => void;
}

export const useSshSessionStore = create<SshSessionStore>((set, get) => ({
  credentialsByServer: {},
  setCredentials: (serverId, credentials) =>
    set((state) => ({
      credentialsByServer: {
        ...state.credentialsByServer,
        [serverId]: credentials,
      },
    })),
  getCredentials: (serverId) => get().credentialsByServer[serverId],
  clearCredentials: (serverId) =>
    set((state) => {
      if (serverId === undefined) return { credentialsByServer: {} };
      const next = { ...state.credentialsByServer };
      delete next[serverId];
      return { credentialsByServer: next };
    }),
}));
