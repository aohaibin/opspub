import { useLayoutEffect, useRef, useState } from "react";
import { Dropdown } from "antd";
import { Ellipsis } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { modulePath } from "@/navigation/modules";
import { translateModule } from "@/navigation/translations";
import type { SettingsLanguage } from "@/pages/settings/translations";
import { windowShortcutModule, type WindowConfigItem } from "@/store/settings";

interface WorkspaceHeaderShortcutsProps {
  items: WindowConfigItem[];
  activeModule?: string;
  language: SettingsLanguage;
}

export function WorkspaceHeaderShortcuts({ items, activeModule, language }: WorkspaceHeaderShortcutsProps) {
  const navigate = useNavigate();
  const viewport = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(items.length);
  const shortcuts = items.flatMap((item) => {
    const module = windowShortcutModule(item.id);
    return module ? [{ item, module, ...translateModule(module, language) }] : [];
  });

  useLayoutEffect(() => {
    const container = viewport.current;
    const row = strip.current;
    if (!container || !row) return;

    function measure() {
      if (!container || !row) return;
      const buttons = Array.from(row.children) as HTMLElement[];
      if (row.offsetWidth <= container.clientWidth) {
        setVisibleCount(buttons.length);
        return;
      }
      // 隐藏的按钮仍参与测量。给「更多」留出 34px 和 6px 的间隔。
      setVisibleCount(buttons.filter((button) => button.offsetLeft + button.offsetWidth <= container.clientWidth - 40).length);
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(row);
    for (const button of row.children) observer.observe(button);
    return () => observer.disconnect();
  }, [items, language]);

  const overflow = shortcuts.slice(visibleCount);
  const overflowActive = overflow.some(({ module }) => module.key === activeModule);
  const moreLabel = language === "en-US" ? "More shortcuts" : "更多快捷入口";

  return (
    <nav className="workspace-header-shortcuts" aria-label={language === "en-US" ? "Module shortcuts" : "模块快捷入口"}>
      <div ref={viewport} className="workspace-header-shortcut-viewport">
        <div ref={strip} className="workspace-header-shortcut-strip">
          {shortcuts.map(({ item, module, title, navLabel }, index) => {
            const Icon = module.icon;
            const active = module.key === activeModule;
            return (
              <Link
                key={item.id}
                to={modulePath(module.key)}
                className="workspace-header-shortcut"
                title={title}
                aria-label={title}
                aria-current={active ? "page" : undefined}
                data-overflowed={index >= visibleCount}
                onClick={(event) => { if (active) event.preventDefault(); }}
              >
                <Icon size={16} aria-hidden />
                {item.showLabel && <span>{navLabel}</span>}
              </Link>
            );
          })}
        </div>
      </div>
      {overflow.length > 0 && (
        <div className="workspace-header-shortcut-more">
          <Dropdown trigger={["click"]} menu={{
            selectedKeys: activeModule ? [activeModule] : [],
            items: overflow.map(({ module, title }) => ({
              key: module.key,
              label: title,
              icon: <module.icon size={15} aria-hidden />,
            })),
            onClick: ({ key }) => { if (key !== activeModule) void navigate(modulePath(key)); },
          }}>
            <button type="button" className="workspace-header-shortcut" title={moreLabel} aria-label={moreLabel} data-active={overflowActive} aria-haspopup="menu">
              <Ellipsis size={18} aria-hidden />
            </button>
          </Dropdown>
        </div>
      )}
    </nav>
  );
}
