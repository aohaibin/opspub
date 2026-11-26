import { create } from "zustand";
import { message } from "antd";
import { sftpApi } from "@/lib/api/sftp";
import { getErrorMessage } from "@/lib/api/client";
import { useSettingsStore } from "@/store/settings";

export type TransferStatus = "queued" | "connecting" | "transferring" | "cancelling" | "completed" | "cancelled" | "failed";
export interface SftpTransferTask {
  id: string;
  direction: "upload" | "download";
  serverId: number;
  serverName: string;
  remoteDir: string;
  name: string;
  localDir?: string;
  loaded: number;
  total: number;
  speed: number;
  status: TransferStatus;
  error?: string;
}
export type UploadSource = File | FileSystemEntry | string;
type TransferSource = { direction: "upload"; source: UploadSource } | { direction: "download"; remotePath: string; localDir: string };
interface UploadTarget { serverId: number; serverName: string; remoteDir: string }
interface TransferStore {
  tasks: SftpTransferTask[];
  display: "expanded" | "collapsed" | "hidden";
  directoryVersions: Record<string, number>;
  enqueue: (target: UploadTarget, sources: UploadSource[]) => void;
  enqueueDownload: (target: UploadTarget, remotePath: string, localDir: string, name: string) => void;
  cancel: (id: string) => Promise<void>;
  retry: (id: string) => void;
  remove: (id: string) => void;
  setDisplay: (display: TransferStore["display"]) => void;
}

// File/本地路径只在当前进程内保留用于重试；任务不持有 SSH 密码，也不持久化到历史配置。
const sources = new Map<string, TransferSource>();
let running = 0;
export const isTransferActive = (status: TransferStatus) =>
  status === "queued" || status === "connecting" || status === "transferring" || status === "cancelling";
export const transferDirectoryKey = (serverId: number, path: string) => `${serverId}:${path.replace(/\/+$/, "") || "/"}`;

export const useSftpTransferStore = create<TransferStore>((set, get) => ({
  tasks: [],
  display: "hidden",
  directoryVersions: {},
  enqueue: (target, files) => {
    const tasks = files.map((source): SftpTransferTask => {
      const id = crypto.randomUUID();
      sources.set(id, { direction: "upload", source });
      return {
        ...target, id, direction: "upload", name: typeof source === "string" ? source.split(/[\\/]/).filter(Boolean).pop() || source : source.name,
        loaded: 0, total: source instanceof File ? source.size : 0, speed: 0, status: "queued",
      };
    });
    set((state) => ({ tasks: [...state.tasks, ...tasks], display: "expanded" }));
    pump();
  },
  enqueueDownload: (target, remotePath, localDir, name) => {
    const id = crypto.randomUUID();
    sources.set(id, { direction: "download", remotePath, localDir });
    set((state) => ({
      tasks: [...state.tasks, {
        ...target, id, direction: "download", name, localDir,
        loaded: 0, total: 0, speed: 0, status: "queued",
      }],
      display: "expanded",
    }));
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
      message.error(`取消传输失败：${getErrorMessage(error)}`);
    }
  },
  retry: (id) => {
    const task = get().tasks.find((task) => task.id === id);
    if (!task || isTransferActive(task.status)) return;
    const source = sources.get(id);
    if (!source) return;
    // 重试使用新 ID，避免上一轮延迟进度影响当前任务。
    get().remove(id);
    if (source.direction === "upload") get().enqueue(task, [source.source]);
    else get().enqueueDownload(task, source.remotePath, source.localDir, task.name);
  },
  remove: (id) => {
    if (get().tasks.some((task) => task.id === id && isTransferActive(task.status))) return;
    sources.delete(id);
    set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) }));
  },
}));

useSettingsStore.subscribe((state, previous) => {
  if (state.sftpMaxConcurrency !== previous.sftpMaxConcurrency) pump();
});

function patch(id: string, update: Partial<SftpTransferTask>) {
  useSftpTransferStore.setState((state) => ({ tasks: state.tasks.map((task) => task.id === id ? { ...task, ...update } : task) }));
}

function pump() {
  // 并发上限来自设置，降低上限时只影响后续排队任务。
  while (running < useSettingsStore.getState().sftpMaxConcurrency) {
    const next = useSftpTransferStore.getState().tasks.find((task) => task.status === "queued");
    if (!next) break;
    running += 1;
    patch(next.id, { status: "connecting" });
    void run(next).finally(() => { running -= 1; pump(); });
  }
}

async function run(task: SftpTransferTask) {
  let sampleAt = performance.now();
  let sampleBytes = 0;
  let staged = false;
  const checkCancelled = () => {
    if (useSftpTransferStore.getState().tasks.find((item) => item.id === task.id)?.status === "cancelling") {
      throw new Error("传输已取消");
    }
  };
  try {
    const source = sources.get(task.id);
    if (!source) throw new Error("传输来源已不可用，请重新选择");
    checkCancelled();
    const onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
      const current = useSftpTransferStore.getState().tasks.find((t) => t.id === task.id);
      if (!current || !isTransferActive(current.status)) return;
      if (current.status === "cancelling") {
        // 建连前取消也要在后端注册成功后送达，不能只把界面改成“已取消”。
        void sftpApi.cancelTransfer(task.id).catch(() => undefined);
        return;
      }
      const now = performance.now();
      const elapsed = (now - sampleAt) / 1000;
      const speed = elapsed > 0 ? Math.max(0, loaded - sampleBytes) / elapsed : 0;
      sampleAt = now;
      sampleBytes = loaded;
      patch(task.id, { loaded, total, speed, status: loaded > 0 ? "transferring" : current.status });
    };
    if (source.direction === "download") {
      await sftpApi.downloadTransfer({
        taskId: task.id,
        request: { serverId: task.serverId },
        remotePath: source.remotePath,
        localDir: source.localDir,
      }, onProgress);
    } else {
      const localPath = typeof source.source === "string" ? source.source : undefined;
      if (typeof source.source !== "string") {
        await sftpApi.stageUploadDrop(task.id, { action: "begin" });
        staged = true;
        await writeDroppedEntry(task.id, source.source, [task.name], checkCancelled);
      }
      checkCancelled();
      const file = await sftpApi.uploadTransfer({
        taskId: task.id, request: { serverId: task.serverId }, remoteDir: task.remoteDir, fileName: task.name, localPath, staged,
      }, onProgress);
      staged = false;
      patch(task.id, { loaded: file.size, total: file.size });
    }
    patch(task.id, { status: "completed", speed: 0 });
    sources.delete(task.id);
    if (task.direction === "upload") {
      const key = transferDirectoryKey(task.serverId, task.remoteDir);
      useSftpTransferStore.setState((state) => ({ directoryVersions: {
        ...state.directoryVersions, [key]: (state.directoryVersions[key] ?? 0) + 1,
      } }));
    }
  } catch (error) {
    const reason = getErrorMessage(error);
    const cancelled = reason === "传输已取消";
    patch(task.id, { status: cancelled ? "cancelled" : "failed", speed: 0, error: cancelled ? undefined : reason });
  } finally {
    if (staged) await sftpApi.stageUploadDrop(task.id, { action: "release" }).catch(() => undefined);
  }
}

async function writeDroppedEntry(taskId: string, entry: File | FileSystemEntry, path: string[], checkCancelled: () => void): Promise<void> {
  checkCancelled();
  if (!(entry instanceof File) && entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    await sftpApi.stageUploadDrop(taskId, { action: "directory", path });
    for (;;) {
      checkCancelled();
      const children = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (children.length === 0) return;
      for (const child of children) {
        await writeDroppedEntry(taskId, child, [...path, child.name], checkCancelled);
      }
    }
  }
  const file = entry instanceof File
    ? entry
    : await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
  const chunkSize = 256 * 1024;
  for (let offset = 0; offset < Math.max(1, file.size); offset += chunkSize) {
    checkCancelled();
    const chunk = new Uint8Array(await file.slice(offset, offset + chunkSize).arrayBuffer());
    await sftpApi.stageUploadDrop(taskId, { action: "chunk", path, offset, data: Array.from(chunk) });
  }
}
