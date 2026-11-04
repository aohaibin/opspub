/**
 * 顶栏版本号徽标。
 *
 * 原型点开是一个版本弹窗；这里做成下拉卡片，并把「检查更新」接上真实的
 * Tauri updater（沿用设置页的 UpdateModal），不摆空按钮。
 * 注意：自动更新要真正可用，还需要把 tauri.conf.json 里的 updater.endpoints
 * 换成真实更新仓库并托管 update.json，否则检查更新只会走失败分支。
 */

import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import type { Update } from "@tauri-apps/plugin-updater";
import { systemApi, updaterApi } from "@/lib/api";
import { UpdateModal } from "@/components/ui/UpdateModal";
import { HeaderDropdown } from "./HeaderDropdown";

type CheckState = "idle" | "checking" | "latest" | "error";

export function VersionBadge() {
  const [version, setVersion] = useState("0.1.0");
  const [state, setState] = useState<CheckState>("idle");
  const [message, setMessage] = useState("");
  const [update, setUpdate] = useState<Update | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    systemApi
      .getSystemInfo()
      .then((info) => setVersion(info.appVersion))
      .catch(() => {
        // 后端未就绪时保留默认版本号，不阻塞顶栏渲染
      });
  }, []);

  async function handleCheck() {
    setState("checking");
    setMessage("");
    try {
      const result = await updaterApi.checkUpdate();
      if (result) {
        setUpdate(result);
        setModalOpen(true);
        setState("idle");
      } else {
        setState("latest");
        setMessage("当前已是最新版本");
      }
    } catch (e) {
      setState("error");
      setMessage(String(e));
    }
  }

  return (
    <>
      <HeaderDropdown
        width={304}
        trigger={({ toggle }) => (
          <button
            type="button"
            className="header-pill"
            onClick={toggle}
            title={`当前版本 v${version} · 点击检查更新与更新日志`}
            aria-label={`当前版本 v${version}，点击检查更新与更新日志`}
            style={{ fontFamily: "var(--font-mono)" }}
          >
            <span style={{ fontFamily: "var(--font-sans)", fontWeight: 500 }}>版本</span>
            <span>v{version}</span>
            <RotateCw
              size={12}
              style={{
                color: state === "checking" ? "var(--brand-400)" : "var(--text-muted)",
                animation: state === "checking" ? "nav-dot-pulse 1.2s linear infinite" : undefined,
              }}
            />
          </button>
        )}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>
              版本与更新
            </span>
            <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
              v{version}
            </span>
          </div>

          <button
            type="button"
            onClick={() => void handleCheck()}
            disabled={state === "checking"}
            className="flex items-center justify-center"
            style={{
              gap: 6,
              height: 30,
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              fontSize: 12,
              cursor: state === "checking" ? "wait" : "pointer",
            }}
          >
            <RotateCw
              size={12}
              style={{ animation: state === "checking" ? "nav-dot-pulse 1.2s linear infinite" : undefined }}
            />
            {state === "checking" ? "正在检查…" : "检查更新"}
          </button>

          {message && (
            <p
              style={{
                fontSize: 11,
                lineHeight: 1.7,
                color: state === "error" ? "var(--warning)" : "var(--success)",
              }}
            >
              {message}
            </p>
          )}

          <p
            style={{
              paddingTop: 8,
              borderTop: "1px solid var(--border)",
              fontSize: 11,
              lineHeight: 1.7,
              color: "var(--text-muted)",
            }}
          >
            自动更新依赖更新仓库中的 update.json。未配置真实仓库前，检查更新会走失败分支。
          </p>
        </div>
      </HeaderDropdown>

      <UpdateModal open={modalOpen} onClose={() => setModalOpen(false)} update={update} />
    </>
  );
}
