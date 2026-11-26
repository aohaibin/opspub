/**
 * 新版工作区外壳。使用现有路由渲染页面，双轨和标题随当前路由同步。
 */

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { getCurrentWindow, type Window } from "@tauri-apps/api/window";
import { ChevronRight, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { modulePath } from "@/navigation/modules";
import { translateModule } from "@/navigation/translations";
import { resolveWorkspace, WORKSPACE_DOMAINS, type WorkspaceDomain } from "@/navigation/workspace";
import { useAppStore } from "@/store/app";
import { useSettingsStore } from "@/store/settings";
import TerminalPage from "@/pages/terminal";
import {
  WorkspaceNavigation,
  WorkspaceSidebarTarget,
  WORKSPACE_SIDEBAR_ID,
  workspaceDomainLabel,
} from "./WorkspaceNavigation";
import { WindowControls } from "./WindowControls";
import { BrandLogo } from "./BrandLogo";
import { AiLockControl } from "./header/AiLockControl";
import { McpAiUnlockModal } from "./header/McpAiUnlockModal";
import { SkinSwitcher } from "./header/SkinSwitcher";
import { VersionBadge } from "./header/VersionBadge";
import { CommandPalette } from "./CommandPalette";
import { SftpTransferWidget } from "./SftpTransferWidget";

import "./workspace.css";

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
function DragRegion() {
  const windowRef = useRef<Window | null>(getAppWindow());

  function handleMouseDown(e: MouseEvent) {
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
      className="workspace-drag-region"
      onMouseDown={handleMouseDown}
    />
  );
}

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { domain, module } = resolveWorkspace(location.pathname);
  const language = useSettingsStore((state) => state.language);
  const english = language === "en-US";
  const openSearch = useAppStore((state) => state.setCommandPaletteOpen);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTarget, setSidebarTarget] = useState<HTMLDivElement | null>(null);
  const sidebarToggle = useRef<HTMLButtonElement>(null);
  const SidebarIcon = sidebarOpen ? PanelLeftClose : PanelLeftOpen;

  const activateDomain = useCallback((next: WorkspaceDomain) => {
    setSidebarOpen(true);
    if (module && next.key === domain.key) return;
    void navigate(modulePath(next.modules[0]));
  }, [domain.key, module, navigate]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      // 终端、编辑器和弹窗需要保留自己的数字输入和 Ctrl+B 行为。
      if (event.target instanceof Element && event.target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], .xterm, [role="dialog"]',
      )) return;
      if (event.altKey || event.shiftKey) return;
      const isToggle = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b";
      if (isToggle) {
        event.preventDefault();
        if (document.getElementById(WORKSPACE_SIDEBAR_ID)?.contains(document.activeElement)) {
          sidebarToggle.current?.focus();
        }
        setSidebarOpen((open) => !open);
        return;
      }
      if (event.ctrlKey || event.metaKey) return;
      const destination = WORKSPACE_DOMAINS.find((item) => item.shortcut === event.key);
      if (destination) {
        event.preventDefault();
        activateDomain(destination);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activateDomain]);

  const terminalActive = module?.key === "terminal";
  const [terminalVisited, setTerminalVisited] = useState(terminalActive);
  useEffect(() => {
    if (terminalActive) setTerminalVisited(true);
  }, [terminalActive]);

  const domainLabel = workspaceDomainLabel(domain, language);
  const moduleLabel = module ? translateModule(module, language).title : undefined;
  const toggleLabel = sidebarOpen
    ? english ? "Collapse sidebar" : "收起二级栏"
    : english ? "Expand sidebar" : "展开二级栏";
  const searchLabel = english ? "Search modules" : "搜索模块";

  return (
    <div className="workspace-shell">
      <header className="workspace-header glass-nav">
        <div className="workspace-brand">
          <BrandLogo size={24} />
          <span>OpsPub</span>
        </div>
        <button
          ref={sidebarToggle}
          type="button"
          className="workspace-plain-button workspace-header-toggle"
          aria-label={toggleLabel}
          aria-expanded={sidebarOpen}
          aria-controls={WORKSPACE_SIDEBAR_ID}
          title={`${toggleLabel} (Ctrl+B)`}
          onClick={() => setSidebarOpen((open) => !open)}
        >
          <SidebarIcon size={17} aria-hidden />
        </button>
        <div className="workspace-breadcrumb" aria-label={english ? "Current location" : "当前位置"}>
          <span title={domainLabel}>{domainLabel}</span>
          {moduleLabel && (
            <>
              <ChevronRight size={13} aria-hidden />
              <span title={moduleLabel} aria-current="page">{moduleLabel}</span>
            </>
          )}
        </div>
        <DragRegion />
        <button
          type="button"
          className="workspace-search header-pill"
          title={`${searchLabel} (Ctrl+K)`}
          onClick={() => openSearch(true)}
        >
          <Search size={15} aria-hidden />
          <span>{searchLabel}</span>
          <kbd aria-hidden>Ctrl K</kbd>
        </button>
        <DragRegion />
        <div className="workspace-header-controls">
          <VersionBadge />
          <AiLockControl />
          <SkinSwitcher />
          <div className="workspace-window-controls">
            <WindowControls />
          </div>
        </div>
      </header>

      <div className="workspace-body">
        <WorkspaceNavigation
          activeDomain={domain}
          activeModuleKey={module?.key}
          language={language}
          sidebarOpen={sidebarOpen}
          onActivate={activateDomain}
          onCollapse={() => {
            setSidebarOpen(false);
            sidebarToggle.current?.focus();
          }}
          sidebarRef={setSidebarTarget}
        />
        <main className="workspace-content custom-scrollbar" data-full-bleed={terminalActive || module?.key === "workbench" || module?.key === "settings"}>
          <WorkspaceSidebarTarget.Provider value={sidebarTarget}>
            {/* 终端首次访问后留在工作区，切换模块时继续保存会话输出和当前标签。 */}
            {(terminalActive || terminalVisited) && <TerminalPage active={terminalActive} />}
            <Outlet />
          </WorkspaceSidebarTarget.Provider>
        </main>
      </div>

      <CommandPalette />
      <McpAiUnlockModal />
      <SftpTransferWidget />
    </div>
  );
}
