/**
 * 左侧导航轨（NavRail）
 *
 * 严格对齐原型 docs/remote-ops-ai-prototype.html 的 aside#appSidebar：
 * 68px 宽的紧凑 Dock，图标在上、文字在下，16 项滚动区 + 底部固定的「设置」。
 *
 * 为什么不用 Ant Design 的 Menu：原型是图标导轨形态，Menu 的 inline 模式会强制
 * 撑到 200px+ 并带上自己的选中样式，改造成本比直接写一个高得多，而且会引入
 * 与原型不一致的动画和层级。这里只依赖 <Link> 和 CSS。
 */

import { Fragment } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSettingsStore } from "@/store/settings";
import {
  NAV_MODULES,
  PINNED_MODULES,
  modulePath,
  type ModuleDef,
} from "@/navigation/modules";
import { translateModule } from "@/navigation/translations";

/** 核心运维组有几项 —— 原型在这之后插一条分割线，与 AI/安全组分开 */
const CORE_COUNT = NAV_MODULES.filter((m) => m.group === "core").length;

export function NavRail() {
  const language = useSettingsStore((state) => state.language);

  return (
    <aside
      className="h-full flex flex-col shrink-0 select-none"
      style={{
        width: 68,
        background: "var(--surface-900)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/*
        overscroll-contain：滚轮滚到列表底部时不把滚动传递给右侧内容区。
        原型的注释里专门提到了这一点，窗口高度不足时体验差别很明显。
      */}
      <div
        className="flex-1 flex flex-col items-center custom-scrollbar"
        style={{
          overflowY: "auto",
          overscrollBehavior: "contain",
          padding: "8px 4px",
          gap: 4,
        }}
      >
        {NAV_MODULES.map((mod, idx) => (
          <Fragment key={mod.key}>
            <NavRailItem mod={mod} language={language} />
            {idx === CORE_COUNT - 1 && (
              <div
                style={{
                  width: 32,
                  borderTop: "1px solid var(--border)",
                  margin: "4px 0",
                }}
              />
            )}
          </Fragment>
        ))}
      </div>

      <div
        className="shrink-0 flex flex-col items-center"
        style={{
          padding: 6,
          borderTop: "1px solid var(--border)",
          background: "var(--surface-900)",
        }}
      >
        {PINNED_MODULES.map((mod) => (
          <NavRailItem key={mod.key} mod={mod} language={language} />
        ))}
      </div>
    </aside>
  );
}

function NavRailItem({ mod, language }: { mod: ModuleDef; language: "zh-CN" | "en-US" }) {
  const location = useLocation();
  const path = modulePath(mod.key);
  const active = location.pathname === path;
  const Icon = mod.icon;
  const labels = translateModule(mod, language);

  // 悬停提示沿用原型的 title 写法：模块全名 + 括号副标题
  const tooltip = language === "en-US"
    ? labels.title
    : mod.subtitle
      ? `${labels.title} (${mod.subtitle})`
      : labels.title;

  return (
    <Link
      to={path}
      title={tooltip}
      data-active={active}
      className="nav-rail-item"
    >
      <span className="relative flex items-center justify-center">
        <Icon size={20} style={active ? { color: "var(--nav-active-icon)" } : undefined} />
        {mod.dot && <span className={`nav-dot nav-dot-${mod.dot}`} />}
      </span>
      <span className="nav-rail-label">{labels.navLabel}</span>
    </Link>
  );
}
