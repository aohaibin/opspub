import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FileUp, LoaderCircle, RotateCw, Square, Trash2, TriangleAlert, X } from "lucide-react";
import { isTransferActive, useSftpTransferStore } from "@/store/sftp-transfers";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "计算中";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function SftpTransferWidget() {
  const tasks = useSftpTransferStore((state) => state.tasks);
  const display = useSftpTransferStore((state) => state.display);
  const setDisplay = useSftpTransferStore((state) => state.setDisplay);
  const cancel = useSftpTransferStore((state) => state.cancel);
  const retry = useSftpTransferStore((state) => state.retry);
  const remove = useSftpTransferStore((state) => state.remove);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const activeTasks = tasks.filter((task) => isTransferActive(task.status));
  const activeCount = activeTasks.length;
  const total = activeTasks.reduce((sum, task) => sum + task.total, 0);
  const loaded = activeTasks.reduce((sum, task) => sum + task.loaded, 0);
  const percent = total ? Math.min(100, Math.floor((loaded / total) * 100)) : 0;
  const failedCount = tasks.filter((task) => task.status === "failed").length;
  const cancelledCount = tasks.filter((task) => task.status === "cancelled").length;
  const allCompleted = tasks.length > 0 && activeCount === 0 && failedCount === 0 && cancelledCount === 0;
  const title = activeCount > 0 ? `正在上传 ${activeCount} 个文件` :
    failedCount > 0 ? `${failedCount} 项上传失败` :
    cancelledCount > 0 ? `${cancelledCount} 项上传已取消` : "上传已完成";

  useEffect(() => {
    if (!allCompleted) return;
    // 完成时自动收起一次。用户从二级栏重新展开后可继续查看任务。
    const timer = window.setTimeout(() => {
      if (useSftpTransferStore.getState().display === "expanded") setDisplay("collapsed");
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [allCompleted, setDisplay]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current;
      const panel = panelRef.current;
      if (!drag || !panel) return;
      setPosition({
        left: Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, drag.left + event.clientX - drag.x)),
        top: Math.max(8, Math.min(window.innerHeight - panel.offsetHeight - 8, drag.top + event.clientY - drag.y)),
      });
    };
    const stop = () => { dragRef.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  if (display === "hidden" || tasks.length === 0) return null;
  const positionStyle = position ? {
    left: `min(${position.left}px, max(8px, calc(100vw - min(380px, 100vw - 32px) - 8px)))`,
    top: `min(${position.top}px, calc(100vh - 80px))`,
    right: "auto",
    bottom: "auto",
  } : {};

  if (display === "collapsed") {
    return (
      <button
        type="button"
        onClick={() => setDisplay("expanded")}
        title="打开文件传输进度"
        aria-label="打开文件传输进度"
        className="fixed z-[100] right-6 bottom-6 flex size-13 items-center justify-center rounded-full border-2 shadow-lg transition hover:scale-105"
        style={{ ...positionStyle, background: "var(--surface-900)", borderColor: "var(--border)", color: "var(--accent)" }}
      >
        <FileUp size={23} />
        {activeCount > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1 text-center text-xs font-semibold leading-5 text-white">{activeCount}</span>}
        {allCompleted && <span className="absolute -right-1 -top-1 rounded-full bg-emerald-500 p-0.5 text-white"><Check size={11} /></span>}
        {failedCount > 0 && activeCount === 0 && <span className="absolute -right-1 -top-1 rounded-full bg-red-500 p-0.5 text-white"><TriangleAlert size={11} /></span>}
      </button>
    );
  }

  return (
    <section
      ref={panelRef}
      aria-label="SFTP 文件传输"
      className="fixed right-6 bottom-6 z-[100] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2"
      style={{ ...positionStyle, color: "var(--text-primary)" }}
    >
      <header
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;
          const rect = panelRef.current?.getBoundingClientRect();
          if (rect) dragRef.current = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
        }}
        className="flex cursor-grab items-center justify-between rounded-lg border px-3 py-2 shadow-lg active:cursor-grabbing"
        style={{ background: "var(--surface-900)", borderColor: "var(--border)" }}
      >
        <div className="flex min-w-0 items-center gap-2 text-sm">
          {activeCount > 0 && <RotateCw size={16} className="shrink-0 animate-spin" style={{ color: "var(--accent)" }} />}
          {allCompleted && <Check size={16} className="shrink-0 text-emerald-500" />}
          {activeCount === 0 && failedCount > 0 && <TriangleAlert size={16} className="shrink-0 text-red-500" />}
          <span className="truncate font-medium">{title}</span>
          {activeCount > 0 && <span className="shrink-0 text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>{percent}%</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" title="收起到悬浮球" aria-label="收起到悬浮球" onClick={() => setDisplay("collapsed")} className="rounded p-1.5 hover:bg-black/10"><ChevronDown size={15} /></button>
          <button type="button" title="隐藏传输面板，任务继续运行" aria-label="隐藏传输面板" onClick={() => setDisplay("hidden")} className="rounded p-1.5 hover:bg-black/10"><X size={15} /></button>
        </div>
      </header>

      <div className="max-h-[min(420px,60vh)] space-y-2 overflow-y-auto">
        {tasks.map((task) => {
          const active = isTransferActive(task.status);
          const taskPercent = task.status === "completed" ? 100 : task.total ? Math.min(100, Math.floor(task.loaded / task.total * 100)) : 0;
          const eta = task.speed > 0 ? formatTime((task.total - task.loaded) / task.speed) : "计算中";
          return (
            <article key={task.id} className="rounded-lg border p-3 shadow-md" style={{ background: "var(--surface-900)", borderColor: "var(--border)" }}>
              <div className="flex items-start gap-2">
                <div className="mt-0.5 shrink-0" style={{ color: task.status === "completed" ? "var(--success)" : task.status === "failed" ? "var(--danger)" : "var(--accent)" }}>
                  {active ? <LoaderCircle size={16} className={task.status === "connecting" || task.status === "uploading" ? "animate-spin" : ""} /> : task.status === "completed" ? <Check size={16} /> : <FileUp size={16} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium" title={task.name}>{task.name}</div>
                  <div className="mt-0.5 truncate text-xs" style={{ color: "var(--text-secondary)" }} title={`${task.serverName} · ${task.remoteDir}`}>{task.serverName} · {task.remoteDir}</div>
                </div>
                {active ? (
                  <button type="button" title="取消上传" aria-label={`取消上传 ${task.name}`} onClick={() => void cancel(task.id)} disabled={task.status === "cancelling"} className="rounded p-1.5 hover:bg-red-500/10 disabled:opacity-50"><Square size={14} /></button>
                ) : (
                  <div className="flex shrink-0 items-center gap-1">
                    {task.status === "failed" && <button type="button" title="重试上传" aria-label={`重试上传 ${task.name}`} onClick={() => retry(task.id)} className="rounded p-1.5 hover:bg-black/10"><RotateCw size={14} /></button>}
                    <button type="button" title="移除记录" aria-label={`移除 ${task.name}`} onClick={() => remove(task.id)} className="rounded p-1.5 hover:bg-black/10"><Trash2 size={14} /></button>
                  </div>
                )}
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--surface-800)" }}>
                <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${taskPercent}%`, background: task.status === "failed" ? "var(--danger)" : task.status === "completed" ? "var(--success)" : "var(--accent)" }} />
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2 text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>
                <span>{formatBytes(task.loaded)} / {formatBytes(task.total)}</span>
                <span>{task.status === "queued" ? "等待中" : task.status === "connecting" ? "正在建立连接" : task.status === "cancelling" ? "正在取消" : task.status === "uploading" ? `${formatBytes(task.speed)}/s · 剩余 ${eta}` : task.status === "completed" ? "已就绪" : task.status === "failed" ? "上传失败" : "已取消"}</span>
              </div>
              {task.error && <p className="mt-1 break-words text-xs" style={{ color: "var(--danger)" }}>{task.error}</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
