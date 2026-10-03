/**
 * 顶栏「AI 操作锁」控件。
 *
 * 这是整套系统里最关键的一个开关：关闭时 AI 的一切改动型工具直接被拒，
 * 只读探针仍可用；放行可以限时（30m / 2h / 1d）或永久，到点自动回归锁定。
 *
 * 交互与配色严格对齐原型 applyAILockState() / startUnlockCountdown()：
 *   锁定 → 玫红；放行 → 翠绿；按钮文案随剩余时间走。
 */

import { useEffect, useState } from "react";
import { message } from "antd";
import { ChevronDown, Power } from "lucide-react";
import { copilotApi } from "@/lib/api/copilot";
import { getErrorMessage } from "@/lib/api/client";
import { useAppStore, UNLOCK_DURATIONS, type UnlockDuration } from "@/store/app";
import { HeaderDropdown } from "./HeaderDropdown";

/** 剩余毫秒 → 倒计时文案。超过 1 小时用 HH:MM:SS，否则 MM:SS */
function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function AiLockControl() {
  const aiLocked = useAppStore((s) => s.aiLocked);
  const aiUnlockUntil = useAppStore((s) => s.aiUnlockUntil);
  const aiUnlockDuration = useAppStore((s) => s.aiUnlockDuration);
  const setAiLockState = useAppStore((s) => s.setAiLockState);
  const setAiUnlockDuration = useAppStore((s) => s.setAiUnlockDuration);
  const syncAiLock = useAppStore((s) => s.syncAiLock);

  // 每秒重算一次剩余时间。放行到期由 syncAiLock 负责翻回锁定态。
  const [now, setNow] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => void copilotApi.getLock().then((state) => {
      if (active) {
        if (!state.locked && state.unlockUntil === null) setAiUnlockDuration("forever");
        setAiLockState(state.locked, state.unlockUntil === null ? null : state.unlockUntil * 1000);
      }
    }).catch((error) => { if (active) message.error(getErrorMessage(error)); });
    refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [setAiLockState, setAiUnlockDuration]);

  const changeLock = async (duration: "locked" | UnlockDuration) => {
    setSaving(true);
    try {
      const state = await copilotApi.setLock(duration);
      if (duration !== "locked") setAiUnlockDuration(duration);
      setAiLockState(state.locked, state.unlockUntil === null ? null : state.unlockUntil * 1000);
    } catch (error) { message.error(getErrorMessage(error)); }
    finally { setSaving(false); }
  };
  useEffect(() => {
    if (aiLocked || aiUnlockUntil === null) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      syncAiLock();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [aiLocked, aiUnlockUntil, syncAiLock]);

  const forever = !aiLocked && aiUnlockUntil === null;
  const remainingMs = aiUnlockUntil === null ? 0 : aiUnlockUntil - now;

  const headerText = aiLocked
    ? "AI 操作: 已锁定"
    : forever
      ? "AI 操作: 已放行 (永久)"
      : `AI 操作: 已放行 (${formatRemaining(remainingMs)})`;

  // 锁定=玫红，放行=翠绿；两态用同一组透明度，避免切换时按钮尺寸跳动
  const tone = aiLocked
    ? { fg: "#fda4af", bg: "rgba(244, 63, 94, 0.2)", border: "rgba(244, 63, 94, 0.4)", dot: "#fb7185" }
    : { fg: "#6ee7b7", bg: "rgba(16, 185, 129, 0.2)", border: "rgba(16, 185, 129, 0.4)", dot: "#34d399" };

  return (
    <HeaderDropdown
      width={320}
      trigger={({ toggle }) => (
        <button
          type="button"
          className="header-pill"
          onClick={toggle}
          style={{
            background: tone.bg,
            borderColor: tone.border,
            color: tone.fg,
            fontWeight: 500,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 9999,
              background: tone.dot,
              animation: "nav-dot-pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
            }}
          />
          <span style={{ whiteSpace: "nowrap" }}>{headerText}</span>
          <ChevronDown size={12} />
        </button>
      )}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* 总开关 */}
        <div
          className="flex items-center justify-between"
          style={{ paddingBottom: 4, borderBottom: "1px solid var(--border)" }}
        >
          <span
            className="flex items-center"
            style={{ gap: 6, fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}
          >
            <Power size={14} style={{ color: "var(--text-muted)" }} />
            {aiLocked ? "AI 操作已锁定" : "AI 操作已放行"}
          </span>
          <button
            type="button"
            disabled={saving}
            onClick={() => void changeLock(aiLocked ? aiUnlockDuration : "locked")}
            title="点击解锁或锁定"
            style={{
              position: "relative",
              width: 40,
              height: 20,
              flexShrink: 0,
              borderRadius: 9999,
              border: "none",
              cursor: "pointer",
              background: aiLocked ? "#334155" : "#059669",
              transition: "background 0.2s ease",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: aiLocked ? 2 : 22,
                width: 16,
                height: 16,
                borderRadius: 9999,
                background: "#fff",
                boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
                transition: "left 0.2s ease",
              }}
            />
          </button>
        </div>

        {/* 限时放行档位 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="flex items-center justify-between" style={{ fontSize: 11 }}>
            <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>限时放行</span>
            {!aiLocked && (
              <span
                style={{
                  color: forever ? "var(--text-secondary)" : "#34d399",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                }}
              >
                {forever ? "放行模式: 永久不过期" : `倒计时: ${formatRemaining(remainingMs)}`}
              </span>
            )}
          </div>

          <div
            className="grid grid-cols-4"
            style={{
              gap: 4,
              padding: 4,
              borderRadius: 12,
              background: "var(--surface-950)",
              border: "1px solid var(--border)",
              textAlign: "center",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
            }}
          >
            {UNLOCK_DURATIONS.map((d) => {
              const selected = aiUnlockDuration === (d.id as UnlockDuration);
              return (
                <button
                  key={d.id}
                  type="button"
                  disabled={saving}
                  onClick={() => void changeLock(d.id as UnlockDuration)}
                  style={{
                    padding: "4px 0",
                    borderRadius: 8,
                    border: `1px solid ${selected ? "var(--border)" : "transparent"}`,
                    background: selected ? "var(--bg-secondary)" : "transparent",
                    color: selected ? "var(--text-primary)" : "var(--text-muted)",
                    fontWeight: selected ? 700 : 400,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 说明文案：与原型逐字一致 */}
        <p
          style={{
            paddingTop: 8,
            borderTop: "1px solid var(--border)",
            fontSize: 11,
            lineHeight: 1.7,
            color: "var(--text-secondary)",
          }}
        >
          「AI 操作」总开关：关闭时 AI 的一切改动型工具直接拒绝，只读工具仍可用。到点自动回归锁定。
        </p>
      </div>
    </HeaderDropdown>
  );
}
