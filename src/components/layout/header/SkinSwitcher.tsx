/**
 * 顶栏「外观主题皮肤」调色盘。
 *
 * 原型给了 6 套皮肤（3 暗 3 亮），选中即生效；皮肤本身只覆盖 CSS 变量，
 * 因此这里的按钮只需要改 store，无需触碰组件树。
 */

import { useNavigate } from "react-router-dom";
import { Check, Palette } from "lucide-react";
import { SKINS, useAppStore, type SkinDef } from "@/store/app";
import { useSettingsStore } from "@/store/settings";
import { HeaderDropdown, DropdownHeading } from "./HeaderDropdown";

export function SkinSwitcher({ showLabel }: { showLabel: boolean }) {
  const skin = useAppStore((s) => s.skin);
  const setSkin = useAppStore((s) => s.setSkin);
  const navigate = useNavigate();
  const english = useSettingsStore((state) => state.language) === "en-US";
  const buttonLabel = english ? "Theme" : "主题";

  const darkSkins = SKINS.filter((s) => s.family === "dark");
  const lightSkins = SKINS.filter((s) => s.family === "light");

  return (
    <HeaderDropdown
      width={288}
      trigger={({ toggle }) => (
        <button
          type="button"
          className={showLabel ? "header-pill" : "header-icon-btn"}
          onClick={toggle}
          title={english ? "Switch appearance theme" : "切换外观主题皮肤"}
          aria-label={buttonLabel}
        >
          <Palette size={16} style={{ color: "var(--nav-active-icon)" }} aria-hidden />
          {showLabel && <span>{buttonLabel}</span>}
        </button>
      )}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <DropdownHeading
          icon={<Palette size={13} style={{ color: "#34d399" }} />}
          title="外观主题皮肤"
          hint="即选即生效"
        />

        <SkinGroup label="暗色主题 (Dark)" skins={darkSkins} current={skin} onPick={setSkin} />
        <SkinGroup label="亮色主题 (Light)" skins={lightSkins} current={skin} onPick={setSkin} />

        <div
          className="flex items-center justify-between"
          style={{
            paddingTop: 8,
            borderTop: "1px solid var(--border)",
            fontSize: 10,
          }}
        >
          <span style={{ color: "var(--text-muted)" }}>终端配色自动跟随主题</span>
          <button
            type="button"
            onClick={() => navigate("/settings")}
            style={{
              border: "none",
              background: "transparent",
              color: "var(--brand-400)",
              fontSize: 10,
              cursor: "pointer",
            }}
          >
            高级外观设置 ➜
          </button>
        </div>
      </div>
    </HeaderDropdown>
  );
}

function SkinGroup({
  label,
  skins,
  current,
  onPick,
}: {
  label: string;
  skins: SkinDef[];
  current: string;
  onPick: (id: SkinDef["id"]) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
        }}
      >
        {label}
      </div>

      <div className="grid grid-cols-3" style={{ gap: 8 }}>
        {skins.map((skin) => {
          const active = current === skin.id;
          // 亮色皮肤用深色文字，否则白底上看不见
          const onSkin = skin.family === "dark" ? "#e2e8f0" : "#1e293b";
          return (
            <button
              key={skin.id}
              type="button"
              onClick={() => onPick(skin.id)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                padding: 8,
                borderRadius: 12,
                background: skin.preview,
                border: `2px solid ${active ? "#10b981" : "var(--border)"}`,
                cursor: "pointer",
                transition: "border-color 0.15s ease",
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 9999,
                  background: skin.swatch,
                }}
              />
              <span style={{ fontSize: 10, fontWeight: 700, color: onSkin }}>
                {skin.name}
              </span>
              {active && (
                <span
                  className="flex items-center"
                  style={{ gap: 2, fontSize: 9, color: "#34d399", fontFamily: "var(--font-mono)" }}
                >
                  <Check size={9} />
                  当前
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
