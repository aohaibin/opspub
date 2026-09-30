/**
 * 应用外壳：顶栏 + 左侧导航轨 + 内容区。
 *
 * 严格对齐原型 docs/remote-ops-ai-prototype.html 的 header + aside#appSidebar：
 *   顶栏左  —— OpsSentry Logo + 品牌名 + 本地安全模式提示
 *   顶栏右  —— 版本徽标 / AI 操作锁 / 皮肤调色盘 / 告警铃 / 窗口三键
 *   主体    —— 68px 图标导轨 + 右侧内容区
 *
 * 与原型的一处必要差异：原型是单页 switchTab，这里是多路由 <Outlet />。
 */

import { useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Layout } from "antd";
import { getCurrentWindow, type Window } from "@tauri-apps/api/window";
import { NavRail } from "./NavRail";
import { WindowControls } from "./WindowControls";
import { AiLockControl } from "./header/AiLockControl";
import { SkinSwitcher } from "./header/SkinSwitcher";
import { AlertBell } from "./header/AlertBell";
import { VersionBadge } from "./header/VersionBadge";
import { CommandPalette } from "./CommandPalette";

const { Content } = Layout;

function getAppWindow(): Window | null {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

/**
 * 顶栏的空白拖拽区。
 * 窗口开了 decorations: false，没有原生标题栏，拖拽只能自己实现；
 * 顶栏中间的空白区域作为拖拽区，避免把额外标题栏渲染到原型之外。
 */
function DragRegion({ className }: { className?: string }) {
  const windowRef = useRef<Window | null>(getAppWindow());

  function handleMouseDown(e: React.MouseEvent) {
    if (e.buttons === 1 && windowRef.current) {
      if (e.detail === 2) {
        // 双击标题栏区域最大化 / 还原，符合桌面端习惯
        windowRef.current.toggleMaximize();
      } else {
        windowRef.current.startDragging();
      }
    }
  }

  return (
    <div
      className={className}
      onMouseDown={handleMouseDown}
      style={{ flex: 1, height: "100%", minWidth: 24, cursor: "default", userSelect: "none" }}
    />
  );
}

export function AppLayout() {
  const location = useLocation();
  const isTerminal = location.pathname.startsWith("/terminal");

  return (
    <Layout style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        className="glass-nav shrink-0 flex items-center"
        style={{
          height: "var(--header-height)",
          padding: "0 16px",
          gap: 12,
          zIndex: 40,
          userSelect: "none",
        }}
      >
        {/* 左侧：Logo、品牌名和本地安全模式提示 */}
        <div className="flex items-center shrink-0" style={{ gap: 8 }}>
            <div
              className="flex items-center justify-center overflow-hidden"
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                filter: "drop-shadow(0 0 8px rgba(16, 185, 129, 0.35))",
              }}
            >
              <img
                src="/logo.png"
                alt="OpsSentry Logo"
                width={28}
                height={28}
                style={{ display: "block", objectFit: "contain" }}
              />
            </div>
            <span
              style={{
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: "0.02em",
                color: "var(--text-primary)",
              }}
            >
              OpsSentry
            </span>
            <span style={{ color: "var(--text-muted)" }}>|</span>
            <span
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: "var(--text-secondary)",
                whiteSpace: "nowrap",
              }}
            >
              本地安全模式 · MCP 仅监听 127.0.0.1
            </span>
        </div>

        {/* 中间留白区域同时承担无边框窗口拖拽 */}
        <DragRegion />

        {/* 右侧：版本 / AI 锁 / 皮肤 / 告警 / 窗口控制 */}
        <div className="flex items-center shrink-0" style={{ gap: 8 }}>
          <VersionBadge />
          <AiLockControl />
          <SkinSwitcher />
          <AlertBell />
          <div
            className="flex items-center shrink-0"
            style={{ gap: 1, paddingLeft: 8, borderLeft: "1px solid var(--border)" }}
          >
            <WindowControls />
          </div>
        </div>
      </header>

      {/*
        内层 Layout 必须显式 flexDirection: "row"。
        antd 的 Layout 默认是 column，只有检测到 <Sider> 子组件时才会自动加
        ant-layout-has-sider 切成横向。这里用的是原生 <aside> 导航轨，
        拿不到那个类，不写这一行内容区会被整块挤到视口外面（表现是右侧一片空白）。
      */}
      <Layout style={{ flex: 1, minHeight: 0, flexDirection: "row" }}>
        <NavRail />
        <Content
          className="custom-scrollbar"
          style={{
            padding: isTerminal ? 0 : 20,
            overflow: isTerminal ? "hidden" : "auto",
            overscrollBehavior: "contain",
            minHeight: 0,
            minWidth: 0,
            background: "var(--surface-950)",
          }}
        >
          <Outlet />
        </Content>
      </Layout>

      <CommandPalette />
    </Layout>
  );
}
