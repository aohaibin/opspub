import { useEffect, useRef, useState } from "react";
import { Modal, Button, Progress, Space } from "antd";
import { CheckCircleOutlined, DownloadOutlined, SyncOutlined } from "@ant-design/icons";
import type { Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getErrorMessage } from "@/lib/api";

type UpdateStatus = "found" | "downloading" | "downloaded";

interface UpdateModalProps {
  open: boolean;
  onClose: () => void;
  update: Update | null;
  currentVersion?: string;
  autoDownload?: boolean;
  onProgress?: (progress: number) => void;
  onStatusChange?: (status: UpdateStatus) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UpdateModal({
  open,
  onClose,
  update,
  currentVersion,
  autoDownload = false,
  onProgress,
  onStatusChange,
}: UpdateModalProps) {
  const [status, setStatus] = useState<UpdateStatus>("found");
  const [progress, setProgress] = useState(0);
  const [downloadedSize, setDownloadedSize] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const totalSizeRef = useRef(0);
  const autoStartedRef = useRef<string | null>(null);

  function changeStatus(next: UpdateStatus) {
    setStatus(next);
    onStatusChange?.(next);
  }

  useEffect(() => {
    if (!update) return;
    changeStatus("found");
    setProgress(0);
    setDownloadedSize(0);
    setTotalSize(0);
    totalSizeRef.current = 0;
    autoStartedRef.current = null;
    onProgress?.(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [update?.version]);

  async function handleInstall() {
    if (!update) return;

    if (status === "downloading") return;
    changeStatus("downloading");
    setProgress(0);
    setDownloadedSize(0);
    setTotalSize(0);
    totalSizeRef.current = 0;
    onProgress?.(0);

    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          const contentLength = event.data.contentLength ?? 0;
          totalSizeRef.current = contentLength;
          setTotalSize(contentLength);
        } else if (event.event === "Progress") {
          setDownloadedSize((previous) => {
            const newSize = previous + event.data.chunkLength;
            const nextProgress = totalSizeRef.current > 0
              ? Math.min(100, Math.round((newSize / totalSizeRef.current) * 100))
              : 0;
            setProgress(nextProgress);
            onProgress?.(nextProgress);
            return newSize;
          });
        } else if (event.event === "Finished") {
          setProgress(100);
          onProgress?.(100);
        }
      });

      changeStatus("downloaded");
      setProgress(100);
      onProgress?.(100);
    } catch (error) {
      changeStatus("found");
      onProgress?.(0);
      Modal.error({ title: "更新失败", content: getErrorMessage(error) });
    }
  }

  useEffect(() => {
    if (!open || !update || !autoDownload || autoStartedRef.current === update.version) return;
    autoStartedRef.current = update.version;
    void handleInstall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, update, autoDownload]);

  async function handleRelaunch() {
    await relaunch();
  }

  function handleClose() {
    if (status === "downloading") return;
    if (status !== "downloaded") {
      changeStatus("found");
      setProgress(0);
      setDownloadedSize(0);
      setTotalSize(0);
      onProgress?.(0);
    }
    onClose();
  }

  const releaseDate = update?.date ? new Date(update.date).toLocaleDateString("zh-CN") : "";

  return (
    <Modal
      title={<span className="flex items-center gap-2 text-[15px] font-semibold"><DownloadOutlined style={{ color: "var(--success)" }} />OpsPub 软件更新</span>}
      open={open}
      width={540}
      onCancel={handleClose}
      closable={status !== "downloading"}
      maskClosable={status !== "downloading"}
      footer={
        status === "found" ? (
          <Space>
            <Button onClick={handleClose}>稍后</Button>
            <Button type="primary" icon={<DownloadOutlined />} onClick={() => void handleInstall()}>
              下载并安装
            </Button>
          </Space>
        ) : status === "downloaded" ? (
          <Button type="primary" icon={<SyncOutlined />} onClick={() => void handleRelaunch()}>
            立即安装并重启
          </Button>
        ) : null
      }
    >
      {update && (
        <div className="space-y-4 text-[13px]">
          <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-950)] px-4 py-3">
            <div><div className="text-[12px] text-[var(--text-muted)]">当前运行版本</div><div className="mt-1 font-mono text-base font-bold">v{currentVersion ?? "-"}</div></div>
            <span className="text-[var(--text-muted)]">→</span>
            <div className="text-right"><div className="text-[12px] text-[var(--text-muted)]">发现最新版本</div><div className="mt-1 flex items-center justify-end gap-2 font-mono text-base font-bold text-[var(--success)]">v{update.version}<span className="rounded border border-[var(--brand-500)]/40 bg-[var(--brand-500)]/10 px-1.5 py-0.5 text-[10px] text-[var(--brand-400)]">NEW</span></div></div>
          </div>
          <div className="rounded-xl border border-[var(--success)]/30 bg-[var(--success)]/5 p-4">
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 font-medium">{status === "downloading" ? <SyncOutlined spin /> : <CheckCircleOutlined style={{ color: "var(--success)" }} />}{status === "found" && "发现新版本，可开始下载"}{status === "downloading" && "正在下载更新包"}{status === "downloaded" && "更新包已下载完毕，随时可安装"}</span><span className="font-mono font-bold text-[var(--success)]">{progress}%</span></div>
            <Progress percent={progress} showInfo={false} strokeColor="var(--success)" trailColor="var(--border)" className="mb-1 mt-2" />
            <div className="flex justify-between font-mono text-[11px] text-[var(--text-muted)]"><span>{totalSize > 0 ? `${formatSize(downloadedSize)} / ${formatSize(totalSize)}` : status === "found" ? "等待下载" : "正在准备下载"}</span><span>{releaseDate ? `发布时间 ${releaseDate}` : "官方稳定源"}</span></div>
          </div>
          <div><div className="mb-2 flex items-center justify-between font-semibold"><span>v{update.version} 更新内容</span><span className="text-[11px] font-normal text-[var(--text-muted)]">来自 Git 提交记录</span></div><div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface-950)] p-3.5 text-[13px] leading-6 text-[var(--text-secondary)]">{update.body?.trim() || "本次版本包含功能优化与问题修复。"}</div></div>
        </div>
      )}
    </Modal>
  );
}
