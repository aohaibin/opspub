/** 顶栏版本徽标：自动检查官网更新源，并按原型展示下载与重启状态。 */

import { useEffect, useRef, useState } from "react";
import { Tooltip } from "antd";
import { CircleArrowDown, RotateCw } from "lucide-react";
import type { Update } from "@tauri-apps/plugin-updater";
import { systemApi, updaterApi } from "@/lib/api";
import { UpdateModal } from "@/components/ui/UpdateModal";
import { useSettingsStore } from "@/store/settings";
import { HeaderDropdown } from "./HeaderDropdown";

type CheckState = "idle" | "checking" | "latest" | "available" | "downloading" | "ready" | "error";

export function VersionBadge({ showLabel }: { showLabel: boolean }) {
  const english = useSettingsStore((s) => s.language) === "en-US";
  const [version, setVersion] = useState("0.1.0");
  const [state, setState] = useState<CheckState>("idle");
  const [message, setMessage] = useState("");
  const [update, setUpdate] = useState<Update | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [autoDownload, setAutoDownload] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastChecked, setLastChecked] = useState("");
  const checkInProgressRef = useRef(false);

  useEffect(() => {
    systemApi
      .getSystemInfo()
      .then((info) => {
        const appVersion = info.appVersion?.trim();
        if (appVersion) setVersion(appVersion);
      })
      .catch(() => undefined);

    const startupTimer = window.setTimeout(() => void handleCheck(true), 1500);
    const refreshTimer = window.setInterval(() => void handleCheck(true), 6 * 60 * 60 * 1000);
    return () => {
      window.clearTimeout(startupTimer);
      window.clearInterval(refreshTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCheck(automatic = false) {
    if (checkInProgressRef.current) return;
    checkInProgressRef.current = true;
    setState("checking");
    if (!automatic) setMessage("");

    try {
      const result = await updaterApi.checkUpdate();
      setLastChecked(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }));
      if (result) {
        setUpdate(result);
        setProgress(0);
        setAutoDownload(automatic);
        setModalOpen(true);
        setState(automatic ? "downloading" : "available");
        setMessage(automatic ? "发现新版本，正在自动下载" : `发现新版本 v${result.version}`);
      } else {
        setUpdate(null);
        setModalOpen(false);
        setAutoDownload(false);
        setState("latest");
        if (!automatic) setMessage("当前已是最新版本");
      }
    } catch (error) {
      setState("error");
      if (!automatic) setMessage(`更新检查失败：${String(error)}`);
      else window.setTimeout(() => setState("idle"), 3000);
    } finally {
      checkInProgressRef.current = false;
    }
  }

  const updateStatus = state === "downloading" ? `${progress}%`
    : state === "ready" ? (english ? "Ready" : "已就绪")
    : (english ? "Update available" : "待更新");
  const label = update ? updateStatus : `v${version}`;
  const tooltip = update
    ? `v${version} → v${update.version} · ${updateStatus}`
    : `v${version} · ${english
      ? (state === "checking" ? "Checking for updates…" : "Version and updates")
      : (state === "checking" ? "正在检查更新…" : "版本与更新")}`;

  return (
    <>
      <HeaderDropdown
        width={320}
        trigger={({ open, toggle }) => (
          <Tooltip title={open ? null : tooltip} placement="bottom" mouseEnterDelay={0.15}>
            <button
              type="button"
              className="workspace-header-status workspace-header-update"
              data-labeled={showLabel}
              data-state={update && state !== "downloading" && state !== "ready" ? "available" : state}
              aria-label={tooltip}
              aria-expanded={open}
              onClick={toggle}
            >
              <CircleArrowDown size={16} aria-hidden />
              {showLabel && <span>{label}</span>}
              {update && <span className="workspace-header-status-dot" aria-hidden />}
            </button>
          </Tooltip>
        )}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>版本与更新</span>
            <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>v{version}</span>
          </div>

          {update && (
            <div className="rounded-lg border border-[var(--success)]/30 bg-[var(--success)]/5 px-3 py-2 text-[12px]">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--success)]">发现新版本 v{update.version}</span>
                <span className="font-mono text-[var(--text-muted)]">{state === "downloading" ? `${progress}%` : state === "ready" ? "已就绪" : "待处理"}</span>
              </div>
              <button type="button" onClick={() => { setAutoDownload(false); setModalOpen(true); }} className="mt-2 w-full rounded-md border border-[var(--border)] bg-[var(--surface-950)] py-1.5 text-[12px] text-[var(--text-primary)] hover:border-[var(--brand-500)]">
                查看更新内容
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleCheck(false)}
            disabled={state === "checking" || state === "downloading"}
            className="flex items-center justify-center"
            style={{ gap: 6, height: 32, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)", fontSize: 12, cursor: state === "checking" ? "wait" : "pointer" }}
          >
            <RotateCw size={12} style={{ animation: state === "checking" ? "nav-dot-pulse 1.2s linear infinite" : undefined }} />
            {state === "checking" ? "正在检查…" : "检查最新版本"}
          </button>

          {message && <p style={{ fontSize: 11, lineHeight: 1.6, color: state === "error" ? "var(--warning)" : "var(--success)" }}>{message}</p>}
          <p style={{ paddingTop: 8, borderTop: "1px solid var(--border)", fontSize: 11, lineHeight: 1.6, color: "var(--text-muted)" }}>
            {lastChecked ? `上次检查 ${lastChecked} · 每 6 小时自动检查` : "启动后自动检查官网最新版本，运行期间每 6 小时检查一次"}
          </p>
        </div>
      </HeaderDropdown>

      <UpdateModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setAutoDownload(false); }}
        update={update}
        currentVersion={version}
        autoDownload={autoDownload}
        onProgress={setProgress}
        onStatusChange={(next) => {
          setState(next === "downloaded" ? "ready" : next === "downloading" ? "downloading" : "available");
        }}
      />
    </>
  );
}
