import { create } from "zustand";
import { message } from "antd";
import { sftpApi } from "@/lib/api/sftp";
import { getErrorMessage } from "@/lib/api/client";

export type UploadStatus = "queued" | "connecting" | "uploading" | "cancelling" | "completed" | "cancelled" | "failed";
export interface SftpUploadTask {
  id: string;
  serverId: number;
  serverName: string;
  remoteDir: string;
  name: string;
  loaded: number;
  total: number;
  speed: number;
  status: UploadStatus;
  error?: string;
}
type UploadSource = File | string;
interface UploadTarget { serverId: number; serverName: string; remoteDir: string }
interface TransferStore {
  tasks: SftpUploadTask[];
  display: "expanded" | "collapsed" | "hidden";
  directoryVersions: Record<string, number>;
  enqueue: (target: UploadTarget, sources: UploadSource[]) => void;
  cancel: (id: string) => Promise<void>;
  retry: (id: string) => void;
  remove: (id: string) => void;
  setDisplay: (display: TransferStore["display"]) => void;
}

// File/本地路径只在当前进程内保留用于重试；任务不持有 SSH 密码，也不持久化到历史配置。
const sources = new Map<string, UploadSource>();
let running = 0;
export const isTransferActive = (status: UploadStatus) =>
  status === "queued" || status === "connecting" || status === "uploading" || status === "cancelling";
export const transferDirectoryKey = (serverId: number, path: string) => `${serverId}:${path.replace(/\/+$/, "") || "/"}`;

export const useSftpTransferStore = create<TransferStore>((set, get) => ({
  tasks: [],
  display: "hidden",
  directoryVersions: {},
  enqueue: (target, files) => {
    const tasks = files.map((source): SftpUploadTask => {
      const id = crypto.randomUUID();
      sources.set(id, source);
      return {
        ...target, id, name: typeof source === "string" ? source.split(/[\\/]/).pop() || source : source.name,
        loaded: 0, total: typeof source === "string" ? 0 : source.size, speed: 0, status: "queued",
      };
    });
    set((state) => ({ tasks: [...state.tasks, ...tasks], display: "expanded" }));
    pump();
  },
  setDisplay: (display) => set({ display }),
  cancel: async (id) => {
    const task = get().tasks.find((task) => task.id === id);
    if (!task || !isTransferActive(task.status)) return;
    if (task.status === "queued") {
      patch(id, { status: "cancelled", speed: 0 });
      return;
    }
    patch(id, { status: "cancelling" });
    try { await sftpApi.cancelTransfer(id); }
    catch (error) {
      patch(id, { status: task.status });
      message.error(`取消上传失败：${getErrorMessage(error)}`);
    }
  },
  retry: (id) => {
    const task = get().tasks.find((task) => task.id === id);
    if (!task || isTransferActive(task.status)) return;
    const source = sources.get(id);
    if (!source) return;
    // 重试使用新 ID，避免上一轮延迟进度影响当前任务。
    get().remove(id);
    get().enqueue(task, [source]);
  },
  remove: (id) => {
    if (get().tasks.some((task) => task.id === id && isTransferActive(task.status))) return;
    sources.delete(id);
    set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) }));
  },
}));

function patch(id: string, update: Partial<SftpUploadTask>) {
  useSftpTransferStore.setState((state) => ({ tasks: state.tasks.map((task) => task.id === id ? { ...task, ...update } : task) }));
}

function pump() {
  // 两路并发避免大量文件同时建 SSH 连接；排队期间可逐个取消。
  while (running < 2) {
    const next = useSftpTransferStore.getState().tasks.find((task) => task.status === "queued");
    if (!next) break;
    running += 1;
    patch(next.id, { status: "connecting" });
    void run(next).finally(() => { running -= 1; pump(); });
  }
}

async function run(task: SftpUploadTask) {
  let sampleAt = performance.now();
  let sampleBytes = 0;
  try {
    const source = sources.get(task.id);
    if (!source) throw new Error("本地文件已不可用，请重新选择");
    const payload = typeof source === "string" ? { localPath: source } : {
      content: Array.from(new Uint8Array(await source.arrayBuffer())),
    };
    if (useSftpTransferStore.getState().tasks.find((t) => t.id === task.id)?.status === "cancelling") {
      patch(task.id, { status: "cancelled", speed: 0 });
      return;
    }
    const file = await sftpApi.uploadTransfer({
      taskId: task.id, request: { serverId: task.serverId }, remoteDir: task.remoteDir, fileName: task.name, ...payload,
    }, ({ loaded, total }) => {
      const current = useSftpTransferStore.getState().tasks.find((t) => t.id === task.id);
      if (!current || !isTransferActive(current.status)) return;
      if (current.status === "cancelling") {
        // 建连前取消也要在后端注册成功后送达，不能只把界面改成“已取消”。
        void sftpApi.cancelTransfer(task.id).catch(() => undefined);
        return;
      }
      const now = performance.now();
      const elapsed = (now - sampleAt) / 1000;
      const speed = elapsed > 0 ? (loaded - sampleBytes) / elapsed : 0;
      if (loaded > 0) { sampleAt = now; sampleBytes = loaded; }
      else { sampleAt = now; }
      patch(task.id, { loaded, total, speed, status: "uploading" });
    });
    patch(task.id, { status: "completed", loaded: file.size, total: file.size, speed: 0 });
    sources.delete(task.id);
    const key = transferDirectoryKey(task.serverId, task.remoteDir);
    useSftpTransferStore.setState((state) => ({ directoryVersions: {
      ...state.directoryVersions, [key]: (state.directoryVersions[key] ?? 0) + 1,
    } }));
  } catch (error) {
    const reason = getErrorMessage(error);
    patch(task.id, { status: reason.includes("上传已取消") ? "cancelled" : "failed", speed: 0, error: reason });
  }
}
