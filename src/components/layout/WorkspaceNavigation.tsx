import { createContext, useContext, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { modulePath, requireModule } from "@/navigation/modules";
import { translateModule } from "@/navigation/translations";
import { WORKSPACE_DOMAINS, WORKSPACE_MODULE_LABELS, type WorkspaceDomain } from "@/navigation/workspace";
import type { SettingsLanguage } from "@/pages/settings/translations";
import { useSettingsStore } from "@/store/settings";
import { AlertBell } from "./header/AlertBell";

export const WorkspaceSidebarTarget = createContext<HTMLElement | null>(null);

/** 页面仍持有筛选与会话状态，只把专属导航渲染到工作区侧栏。 */
export function WorkspaceSidebarSlot({ children }: { children: ReactNode }) {
  const target = useContext(WorkspaceSidebarTarget);
  return target ? createPortal(children, target) : null;
}

export const WORKSPACE_SIDEBAR_ID = "workspace-secondary-sidebar";

export function workspaceDomainLabel(domain: WorkspaceDomain, language: SettingsLanguage) {
  return language === "en-US" ? domain.english : domain.label;
}

interface WorkspaceNavigationProps {
  activeDomain: WorkspaceDomain;
  activeModuleKey: string | undefined;
  language: SettingsLanguage;
  sidebarOpen: boolean;
  onActivate: (domain: WorkspaceDomain) => void;
  onToggle: () => void;
  sidebarToggleRef: RefObject<HTMLButtonElement | null>;
  sidebarRef: (element: HTMLDivElement | null) => void;
}

export function WorkspaceNavigation({
  activeDomain,
  activeModuleKey,
  language,
  sidebarOpen,
  onActivate,
  onToggle,
  sidebarToggleRef,
  sidebarRef,
}: WorkspaceNavigationProps) {
  const english = language === "en-US";
  const sidebarConfig = useSettingsStore((state) => state.windowConfig.sidebar);
  const DomainIcon = activeDomain.icon;
  const configuredDomains = WORKSPACE_DOMAINS.map((domain) => ({
    domain,
    item: sidebarConfig.find((entry) => entry.id === `domain-${domain.key}`),
  })).filter(({ item }) => item?.enabled && item.location !== "hidden");
  const primaryDomains = configuredDomains.filter(({ item }) => item?.location === "primary").sort((a, b) => sidebarConfig.findIndex((entry) => entry.id === `domain-${a.domain.key}`) - sidebarConfig.findIndex((entry) => entry.id === `domain-${b.domain.key}`)).map(({ domain }) => domain);
  const secondaryDomains = configuredDomains.filter(({ item }) => item?.location === "secondary").sort((a, b) => sidebarConfig.findIndex((entry) => entry.id === `domain-${a.domain.key}`) - sidebarConfig.findIndex((entry) => entry.id === `domain-${b.domain.key}`)).map(({ domain }) => domain);
  const visibleModules = activeDomain.modules
    .map((key) => ({ key, item: sidebarConfig.find((entry) => entry.id === `module-${key}`) }))
    .filter(({ item }) => item?.enabled && item.location !== "hidden")
    .sort((a, b) => Number(a.item?.location === "secondary") - Number(b.item?.location === "secondary") || sidebarConfig.findIndex((entry) => entry.id === `module-${a.key}`) - sidebarConfig.findIndex((entry) => entry.id === `module-${b.key}`));

  function domainButton(domain: WorkspaceDomain) {
    const Icon = domain.icon;
    const active = domain.key === activeDomain.key;
    const label = workspaceDomainLabel(domain, language);
    return (
      <button
        key={domain.key}
        type="button"
        className="workspace-dock-button"
        data-domain={domain.key}
        aria-label={label}
        aria-pressed={active}
        data-active={active}
        title={domain.shortcut ? `${label} (${domain.shortcut})` : label}
        onClick={() => onActivate(domain)}
      >
        <Icon size={20} aria-hidden />
        {domain.key === "ai" && <span className="workspace-dock-status-pulse" aria-hidden />}
      </button>
    );
  }

  return (
    <>
      <aside className="workspace-dock" aria-label={english ? "Workspace domains" : "工作区业务域"}>
        <div className="workspace-dock-group">
          {primaryDomains.map(domainButton)}
        </div>
        <div className="workspace-dock-group workspace-dock-footer">
          {secondaryDomains.map((domain) => domain.key === "alerts" ? <AlertBell key={domain.key} active={activeDomain.key === "alerts"} /> : domainButton(domain))}
        </div>
      </aside>

      <aside
        id={WORKSPACE_SIDEBAR_ID}
        className="workspace-subnav"
        data-open={sidebarOpen}
        aria-label={english ? "Workspace navigation" : "二级工作区导航"}
      >
        <div className="workspace-subnav-inner" inert={!sidebarOpen}>
          <div className="workspace-subnav-heading">
            <div className="workspace-subnav-heading-label">
              <DomainIcon size={15} aria-hidden />
              <span title={workspaceDomainLabel(activeDomain, language)}>
                {workspaceDomainLabel(activeDomain, language)}
              </span>
            </div>
            <button
              ref={sidebarOpen ? sidebarToggleRef : undefined}
              type="button"
              className="workspace-plain-button workspace-sidebar-toggle"
              onClick={onToggle}
              title={english ? "Collapse sidebar (Ctrl+B)" : "收起二级栏 (Ctrl+B)"}
              aria-label={english ? "Collapse sidebar" : "收起二级栏"}
              aria-expanded={sidebarOpen}
              aria-controls={WORKSPACE_SIDEBAR_ID}
            >
              <PanelLeftClose size={16} aria-hidden />
            </button>
          </div>
          <div className="workspace-subnav-scroll custom-scrollbar">
            <nav className="workspace-subnav-links" aria-label={english ? "Modules" : "模块"}>
              {visibleModules.map(({ key }) => {
                const module = requireModule(key);
                const Icon = module.icon;
                const { title } = translateModule(module, language);
                const label = english ? title : WORKSPACE_MODULE_LABELS[key];
                const active = activeModuleKey === key;
                return (
                  <Link
                    key={key}
                    to={modulePath(key)}
                    className="workspace-module-link"
                    aria-current={active ? "page" : undefined}
                    title={title}
                    onClick={(event) => {
                      // 点击当前入口时继续保留深链查询参数与跳转携带的状态。
                      if (active) event.preventDefault();
                    }}
                  >
                    <Icon size={16} aria-hidden />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </nav>
            <div ref={sidebarRef} className="workspace-subnav-slot" />
          </div>
        </div>
        <div className="workspace-subnav-collapsed-rail" aria-label={english ? "Quick navigation" : "快捷导航"}>
          <button
            ref={!sidebarOpen ? sidebarToggleRef : undefined}
            type="button"
            className="workspace-plain-button workspace-sidebar-toggle"
            onClick={onToggle}
            title={english ? "Expand sidebar (Ctrl+B)" : "展开二级栏 (Ctrl+B)"}
            aria-label={english ? "Expand sidebar" : "展开二级栏"}
            aria-expanded={sidebarOpen}
            aria-controls={WORKSPACE_SIDEBAR_ID}
          >
            <PanelLeftOpen size={16} aria-hidden />
          </button>
          <div className="workspace-subnav-rail-divider" />
          <nav className="workspace-subnav-rail-links" aria-label={english ? "Modules" : "模块快捷入口"}>
            {visibleModules.map(({ key }) => {
              const module = requireModule(key);
              const Icon = module.icon;
              const { title } = translateModule(module, language);
              const active = activeModuleKey === key;
              return (
                <Link
                  key={key}
                  to={modulePath(key)}
                  className="workspace-subnav-rail-link"
                  aria-current={active ? "page" : undefined}
                  title={title}
                  aria-label={title}
                >
                  <Icon size={16} aria-hidden />
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
    </>
  );
}
