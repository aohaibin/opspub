/** 顶栏版本徽标：自动检查官网更新源，并按原型展示下载与重启状态。 */

import { useEffect, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import type { Update } from "@tauri-apps/plugin-updater";
import { systemApi, updaterApi } from "@/lib/api";
import { UpdateModal } from "@/components/ui/UpdateModal";
import { HeaderDropdown } from "./HeaderDropdown";

type CheckState = "idle" | "checking" | "latest" | "available" | "downloading" | "ready" | "error";

export function VersionBadge() {
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

  const capsuleText = state === "downloading" && update
    ? `v${update.version} · ${progress}%`
    : state === "ready" && update
      ? `v${update.version} · 就绪`
      : `v${version}`;

  return (
    <>
      <HeaderDropdown
        width={320}
        trigger={({ toggle }) => (
          <button
            type="button"
            className={`header-pill ${state === "ready" ? "header-pill-ready" : ""}`}
            onClick={toggle}
            title={update ? `发现 v${update.version} 更新，点击查看` : `当前版本 v${version} · 自动检查更新`}
            aria-label={update ? `发现版本 ${update.version} 更新` : `当前版本 ${version}`}
            style={{ fontFamily: "var(--font-mono)", flexShrink: 0, whiteSpace: "nowrap" }}
          >
            <span>{capsuleText}</span>
            <RotateCw
              size={12}
              style={{
                color: state === "checking" || state === "downloading" ? "var(--brand-400)" : state === "ready" ? "var(--success)" : "var(--text-muted)",
                animation: state === "checking" || state === "downloading" ? "nav-dot-pulse 1.2s linear infinite" : undefined,
              }}
            />
          </button>
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
            {lastChecked ? `上次检查 ${lastChecked} · 官方稳定源` : "启动后自动检查官网最新版本"}
          </p>
        </div>
      </HeaderDropdown>

      <UpdateModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setAutoDownload(false); }}
        update={update}
        currentVersion={version}
        autoDownload={autoDownload}
        onProgress={(value) => { setProgress(value); setState(value >= 100 ? "ready" : "downloading"); }}
        onStatusChange={(next) => { if (next === "downloaded") setState("ready"); }}
      />
    </>
  );
}
