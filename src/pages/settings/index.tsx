import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, AutoComplete, Button, Input, Modal, Select, Tag as AntTag, message, Switch } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import { enable as enableAutoStart, disable as disableAutoStart, isEnabled as isAutoStartEnabled } from "@tauri-apps/plugin-autostart";
import { openUrl } from "@tauri-apps/plugin-opener";
import { open as openFileDialog, save as saveFileDialog } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  ArrowLeft,
  AppWindow,
  Archive,
  AlertCircle,
  Bot,
  Check,
  ClipboardList,
  CircleHelp,
  Copy,
  Database,
  ExternalLink,
  FileText,
  FileCheck,
  Download,
  Cloud,
  Database as DatabaseIcon,
  FolderOpen,
  HardDrive,
  Info,
  KeyRound,
  Layers,
  Lock,
  MessageSquare,
  Network,
  Plus,
  Palette,
  Radio as RadioIcon,
  Plug,
  RefreshCw,
  Repeat,
  Upload,
  Power,
  ShieldCheck,
  Shield,
  Smartphone,
  Sparkles,
  Scale,
  Terminal,
  User,
  Users,
  Video,
  Globe,
} from "lucide-react";
import { backupApi, configApi, getErrorMessage } from "@/lib/api";
import type { BackupStorageEndpoint, BackupStorageInput } from "@/lib/api/backup";
import { DeviceChannelSettings, MobilePairingSettings } from "./DeviceSettings";
import { SETTINGS_KEYS, useSettingsStore, type CloseBehavior, type TerminalCursorStyle, type TerminalFontSize, type TerminalLineHeight, type TerminalTheme } from "@/store/settings";
import { TERMINAL_CURSOR_OPTIONS, TERMINAL_FONT_SIZE_OPTIONS, TERMINAL_LINE_HEIGHT_OPTIONS, TERMINAL_THEME_OPTIONS } from "@/components/terminal/terminal-themes";
import { SKINS, useAppStore, type SkinId, type ThemeMode } from "@/store/app";
import { modelServiceApi } from "@/lib/api/model-service";
import type { ModelPreset, ModelProfile, ModelProfileInput, ModelProtocol, ModelVendor } from "@/types";
import { translateSettings } from "./translations";

type SettingsSection =
  | "language"
  | "startup"
  | "window"
  | "appearance"
  | "terminal-theme"
  | "models"
  | "proxy"
  | "whitelist"
  | "ssh-keys"
  | "lock"
  | "blacklist"
  | "audit-retention"
  | "backup"
  | "mobile-pairing"
  | "device-channel"
  | "legal"
  | "community"
  | "apps";

type SettingIcon = typeof Palette;

const NAV_GROUPS: Array<{ title: string; items: Array<{ id: SettingsSection; label: string; icon: SettingIcon }> }> = [
  {
    title: "外观与交互",
    items: [
      { id: "language", label: "界面语言", icon: FileText },
      { id: "startup", label: "启动行为", icon: Power },
      { id: "window", label: "窗口与托盘", icon: AppWindow },
      { id: "appearance", label: "外观主题", icon: Palette },
      { id: "terminal-theme", label: "终端主题", icon: Terminal },
    ],
  },
  {
    title: "AI 与网络",
    items: [
      { id: "models", label: "模型服务", icon: Sparkles },
      { id: "proxy", label: "网络代理", icon: Network },
      { id: "whitelist", label: "出站地址白名单", icon: ShieldCheck },
    ],
  },
  {
    title: "安全",
    items: [
      { id: "ssh-keys", label: "SSH 密钥", icon: KeyRound },
      { id: "lock", label: "主密码 / 应用锁定", icon: Lock },
      { id: "blacklist", label: "命令黑名单", icon: AlertTriangle },
      { id: "audit-retention", label: "审计保留", icon: ClipboardList },
    ],
  },
  {
    title: "数据",
    items: [
      { id: "backup", label: "备份与还原", icon: Database },
      { id: "mobile-pairing", label: "手机配对", icon: Smartphone },
      { id: "device-channel", label: "设备通道", icon: RadioIcon },
    ],
  },
  {
    title: "关于",
    items: [
      { id: "legal", label: "法律声明", icon: FileText },
      { id: "community", label: "作者 & 社区", icon: Users },
      { id: "apps", label: "推荐应用", icon: Sparkles },
    ],
  },
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const returnToCopilot = (location.state as { from?: string } | null)?.from === "copilot";
  const [activeSection, setActiveSection] = useState<SettingsSection>("language");
  const settings = useSettingsStore();
  const t = (text: string) => translateSettings(text, settings.language);
  const theme = useAppStore((state) => state.theme);
  const skin = useAppStore((state) => state.skin);
  const setTheme = useAppStore((state) => state.setTheme);
  const setSkin = useAppStore((state) => state.setSkin);
  const [autoStartBusy, setAutoStartBusy] = useState(false);
  const [proxyAddress, setProxyAddress] = useState("");
  const [proxySaving, setProxySaving] = useState(false);
  const [outboundHosts, setOutboundHosts] = useState<string[]>([]);
  const [outboundHostDraft, setOutboundHostDraft] = useState("");
  const [outboundEnabled, setOutboundEnabled] = useState(false);
  const [outboundSaving, setOutboundSaving] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([configApi.getAll(), isAutoStartEnabled()]).then(([configs, enabled]) => {
      if (!alive) return;
      const values = Object.fromEntries(configs.map(({ key, value }) => [key, value]));
      settings.hydrate(values);
      setProxyAddress(values[SETTINGS_KEYS.proxyAddress] ?? "");
      try {
        const savedHosts: unknown = JSON.parse(values[SETTINGS_KEYS.outboundHosts] ?? "[]");
      const hostList = Array.isArray(savedHosts) ? savedHosts.filter((host): host is string => typeof host === "string") : [];
      setOutboundHosts(hostList);
      settings.setOutboundHosts(hostList);
      } catch {
        setOutboundHosts([]);
      }
      setOutboundEnabled(values[SETTINGS_KEYS.outboundEnabled] === "true");
      if (settings.autoStart !== enabled) settings.setAutoStart(enabled);
    }).catch((error) => {
      if (alive) message.error(getErrorMessage(error));
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    document.documentElement.lang = settings.language;
  }, [settings.language]);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    let frame = 0;
    const syncActiveSection = () => {
      frame = 0;
      const sections = Array.from(container.querySelectorAll<HTMLElement>('[data-settings-section]'));
      if (sections.length === 0) return;

      const containerTop = container.getBoundingClientRect().top;
      const activationOffset = 36;
      let current = sections[0];
      for (const section of sections) {
        if (section.getBoundingClientRect().top - containerTop <= activationOffset) current = section;
        else break;
      }
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 4) current = sections[sections.length - 1];

      const nextSection = current.dataset.settingsSection as SettingsSection | undefined;
      if (nextSection) setActiveSection((previous) => previous === nextSection ? previous : nextSection);
    };

    const handleScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(syncActiveSection);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    syncActiveSection();
    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!returnToCopilot) return;
    setActiveSection("models");
    const timer = window.setTimeout(() => {
      contentRef.current?.querySelector<HTMLElement>('[data-settings-section="models"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [returnToCopilot]);

  async function persistSetting(key: string, value: string) {
    try {
      await configApi.set(key, value);
    } catch (error) {
      message.error(getErrorMessage(error));
      throw error;
    }
  }

  async function changeAutoStart(enabled: boolean) {
    setAutoStartBusy(true);
    try {
      if (enabled) await enableAutoStart();
      else await disableAutoStart();
      settings.setAutoStart(enabled);
      await persistSetting(SETTINGS_KEYS.autoStart, String(enabled));
    message.success(enabled ? t("已加入系统登录启动") : t("已取消系统登录启动"));
    } catch (error) {
      settings.setAutoStart(!enabled);
      message.error(getErrorMessage(error));
    } finally {
      setAutoStartBusy(false);
    }
  }

  async function changeStartMinimized(enabled: boolean) {
    settings.setStartMinimized(enabled);
    try {
      await persistSetting(SETTINGS_KEYS.startMinimized, String(enabled));
    } catch {
      settings.setStartMinimized(!enabled);
    }
  }

  async function changeCloseBehavior(value: CloseBehavior) {
    settings.setCloseBehavior(value);
    try {
      await persistSetting(SETTINGS_KEYS.closeBehavior, value);
    } catch {
      settings.setCloseBehavior("ask");
    }
  }

  async function changeLanguage(value: "zh-CN" | "en-US") {
    settings.setLanguage(value);
    try {
      await persistSetting(SETTINGS_KEYS.language, value);
      message.success(value === "en-US" ? "Language switched to English" : "已切换为简体中文");
    } catch {
      settings.setLanguage(value === "zh-CN" ? "en-US" : "zh-CN");
    }
  }

  async function changeTerminalTheme(value: TerminalTheme) {
    const previous = settings.terminalTheme;
    settings.setTerminalTheme(value);
    try {
      await persistSetting(SETTINGS_KEYS.terminalTheme, value);
    } catch {
      settings.setTerminalTheme(previous);
    }
  }

  async function changeTerminalSetting<T extends string | number>(
    value: T,
    setValue: (next: T) => void,
    key: string,
    previous: T,
  ) {
    setValue(value);
    try {
      await persistSetting(key, String(value));
    } catch {
      setValue(previous);
    }
  }

  function normalizeProxyAddress(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const candidate = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    try {
      const url = new URL(candidate);
      const host = url.hostname.toLowerCase();
      const isLoopback = host === "localhost" || host === "::1" || host === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(host);
      if (!isLoopback || !url.port || url.pathname !== "/" || url.search || url.hash) return null;
      if (!["http:", "https:", "socks5:"].includes(url.protocol)) return null;
      return `${url.protocol}//${url.host}`;
    } catch {
      return null;
    }
  }

  async function saveProxyAddress() {
    const normalized = normalizeProxyAddress(proxyAddress);
    if (normalized === null) {
      message.warning(t("代理地址仅支持本机地址和有效端口，例如 127.0.0.1:7890"));
      return;
    }
    setProxySaving(true);
    try {
      await configApi.set(SETTINGS_KEYS.proxyAddress, normalized);
      setProxyAddress(normalized);
      settings.setProxyAddress(normalized);
      message.success(normalized ? t("代理地址已保存") : t("已关闭全局代理地址"));
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setProxySaving(false);
    }
  }

  function normalizeOutboundHost(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const candidate = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
      const url = new URL(candidate);
      if (url.username || url.password || url.port || (url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) return null;
      const hostname = url.hostname.toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
      if (!hostname || !hostname.includes(".") || !/^[a-z0-9.-]+$/.test(hostname) || hostname.split(".").some((part) => !part || part.startsWith("-") || part.endsWith("-"))) return null;
      return hostname;
    } catch {
      return null;
    }
  }

  function addOutboundHost() {
    const host = normalizeOutboundHost(outboundHostDraft);
    if (!host) {
      message.warning(t("请输入有效域名或只含域名的 URL"));
      return;
    }
    if (outboundHosts.includes(host)) {
      message.info(t("该域名已添加"));
      return;
    }
    setOutboundHosts((current) => [...current, host].sort((a, b) => a.localeCompare(b)));
    settings.setOutboundHosts([...outboundHosts, host].sort((a, b) => a.localeCompare(b)));
    setOutboundHostDraft("");
  }

  async function saveOutboundSettings(nextHosts = outboundHosts, nextEnabled = outboundEnabled) {
    setOutboundSaving(true);
    try {
      await Promise.all([
        configApi.set(SETTINGS_KEYS.outboundHosts, JSON.stringify(nextHosts)),
        configApi.set(SETTINGS_KEYS.outboundEnabled, String(nextEnabled)),
      ]);
      message.success(t("出站地址设置已保存"));
    } catch (error) {
      message.error(getErrorMessage(error));
      throw error;
    } finally {
      setOutboundSaving(false);
    }
  }

  function selectSkin(id: SkinId) {
    setSkin(id);
    const nextTheme = SKINS.find((item) => item.id === id)?.family ?? "dark";
    void persistSetting("ui.theme", nextTheme).catch(() => undefined);
    void persistSetting("ui.skin", id).catch(() => undefined);
  }

  function selectTheme(mode: ThemeMode) {
    setTheme(mode);
    void persistSetting("ui.theme", mode).catch(() => undefined);
  }

  function selectSection(section: SettingsSection) {
    setActiveSection(section);
    contentRef.current?.querySelector<HTMLElement>(`[data-settings-section="${section}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="ops-settings-page flex h-[calc(100vh-82px)] min-h-[620px] w-full overflow-hidden rounded-xl border border-slate-800/80 bg-surface-950/80">
      <aside className="flex w-[230px] shrink-0 flex-col border-r border-slate-800/80 bg-[#0a0e13]/90">
        <div className="shrink-0 border-b border-slate-800/80 px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-teal-500/30 bg-teal-500/10 text-teal-300"><ShieldCheck size={15} /></div>
            <div className="min-w-0">
              <h1 className="text-base font-bold leading-tight text-white">{t("设置")}</h1>
              <p className="truncate text-xs text-slate-500">{t("系统与 AI 配置中心")}</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-3 overflow-y-auto p-2.5 text-xs custom-scrollbar">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="border-t border-slate-800/60 pt-2 first:border-0 first:pt-0">
              <div className="px-2 py-1 text-xs font-semibold tracking-wide text-slate-500">{t(group.title)}</div>
              <div className="mt-0.5 space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectSection(item.id)}
                      className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${active ? "border-teal-500/30 bg-teal-500/10 font-medium text-teal-300" : "border-transparent text-slate-400 hover:bg-surface-900/70 hover:text-slate-200"}`}
                    >
                      <Icon size={14} className={active ? "text-teal-400" : "text-slate-500"} />
                      <span className="truncate">{t(item.label)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <main ref={contentRef} className="min-w-0 flex-1 space-y-4 overflow-y-auto bg-surface-950/40 p-6 custom-scrollbar">
        <div className="mb-1 flex items-end justify-between border-b border-slate-800/80 pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-400">OpsPub Control Center</p>
            <h2 className="mt-1 text-xl font-bold text-white">{t("系统与 AI 设置")}</h2>
            <p className="mt-1 text-sm text-slate-400">{t("外观、窗口行为、模型服务与本地安全策略的统一配置面板")}</p>
          </div>
          <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">{t("本地配置")}</span>
        </div>

        <SettingCard id="language" icon={<FileText size={15} />} title="界面语言" desc="保存语言偏好；当前界面文案仍以简体中文提供。">
          <div className="flex gap-2.5"><StaticButton active={settings.language === "zh-CN"} onClick={() => void changeLanguage("zh-CN")}>简体中文</StaticButton><StaticButton active={settings.language === "en-US"} onClick={() => void changeLanguage("en-US")}>English</StaticButton></div>
        </SettingCard>

        <SettingCard id="startup" icon={<Power size={15} />} title="启动行为" desc="系统登录后自动启动 OpsPub，并按选择决定是否进入托盘。">
          <div className="space-y-3">
            <ToggleRow label="开机自启" desc="随系统登录启动 OpsPub" checked={settings.autoStart} loading={autoStartBusy} onChange={(value) => void changeAutoStart(value)} />
            <ToggleRow label="自启后收进托盘" desc="仅在系统启动应用时隐藏主窗口" checked={settings.startMinimized} onChange={(value) => void changeStartMinimized(value)} disabled={!settings.autoStart} />
          </div>
        </SettingCard>

        <SettingCard id="window" icon={<AppWindow size={15} />} title="窗口与托盘" desc="点击主窗口关闭按钮时的行为。">
          <div className="inline-flex flex-wrap gap-1 rounded-lg border border-slate-700/80 bg-[#141a22] p-0.5"><StaticButton active={settings.closeBehavior === "ask"} onClick={() => void changeCloseBehavior("ask")}>每次询问</StaticButton><StaticButton active={settings.closeBehavior === "minimize"} onClick={() => void changeCloseBehavior("minimize")}>最小化到托盘</StaticButton><StaticButton active={settings.closeBehavior === "exit"} onClick={() => void changeCloseBehavior("exit")}>直接退出</StaticButton></div>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">{t("关闭后仍可保持后台服务与连接会话，双击托盘图标可以重新打开主窗口。")}</p>
        </SettingCard>

        <SettingCard id="appearance" icon={<Palette size={15} />} title="外观主题" desc="选择应用皮肤和明暗模式，预览会同步到整个应用。">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {SKINS.map((item) => (
              <button key={item.id} type="button" aria-pressed={skin === item.id} onClick={() => selectSkin(item.id)} className={`rounded-lg border p-2.5 text-left transition ${skin === item.id ? "border-teal-500/60" : "border-slate-800 hover:border-slate-600"}`} style={{ background: item.preview }}>
                <div className="mb-3 h-7 rounded-md border border-white/10" style={{ background: `linear-gradient(135deg, ${item.swatch}55, transparent)` }} />
                <div className="flex items-center justify-between gap-1"><span className="text-xs font-semibold" style={{ color: item.family === "light" ? "#334155" : "#e2e8f0" }}>{item.name}</span>{skin === item.id && <Check size={13} className="text-teal-300" />}</div>
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2"><StaticButton active={theme === "system"} onClick={() => selectTheme("system")}>跟随系统</StaticButton><StaticButton active={theme === "dark"} onClick={() => selectTheme("dark")}>暗色</StaticButton><StaticButton active={theme === "light"} onClick={() => selectTheme("light")}>亮色</StaticButton></div>
        </SettingCard>

        <SettingCard id="terminal-theme" icon={<Terminal size={15} />} title="终端主题与渲染" desc="控制内嵌 SSH 终端的配色方案、字号与光标渲染样式。更改会立即应用到已连接的终端。">
          <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2 xl:grid-cols-4">
            {TERMINAL_THEME_OPTIONS.map((option) => (
              <button key={option.id} type="button" aria-pressed={settings.terminalTheme === option.id} onClick={() => void changeTerminalTheme(option.id)} className={`rounded-lg border p-3 text-left transition ${settings.terminalTheme === option.id ? "border-teal-500/80 bg-teal-500/5 ring-1 ring-teal-500/40" : "border-slate-800 bg-surface-900/50 hover:border-slate-600"}`}>
                <PreviewTerminal title={option.name} background={option.previewBackground} foreground={option.previewForeground} selected={settings.terminalTheme === option.id} />
                <span className="mt-2 block text-xs text-slate-400">{option.description}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 border-t border-slate-800/70 pt-4 sm:grid-cols-2 xl:grid-cols-3">
            <TerminalSettingSelect label="终端字号" value={settings.terminalFontSize} options={TERMINAL_FONT_SIZE_OPTIONS} onChange={(value) => void changeTerminalSetting<TerminalFontSize>(value, settings.setTerminalFontSize, SETTINGS_KEYS.terminalFontSize, settings.terminalFontSize)} />
            <TerminalSettingSelect label="行高" value={settings.terminalLineHeight} options={TERMINAL_LINE_HEIGHT_OPTIONS} onChange={(value) => void changeTerminalSetting<TerminalLineHeight>(value, settings.setTerminalLineHeight, SETTINGS_KEYS.terminalLineHeight, settings.terminalLineHeight)} />
            <TerminalSettingSelect label="光标样式" value={settings.terminalCursorStyle} options={TERMINAL_CURSOR_OPTIONS} onChange={(value) => void changeTerminalSetting<TerminalCursorStyle>(value, settings.setTerminalCursorStyle, SETTINGS_KEYS.terminalCursorStyle, settings.terminalCursorStyle)} />
          </div>
        </SettingCard>

        <SettingCard id="models" icon={<Sparkles size={17} />} title="模型服务" desc="管理模型服务商、接口端点与系统托管密钥；可测试连接、获取模型并导入或导出配置。">
          <ModelServiceSettings showReturnToCopilot={returnToCopilot} onReturnToCopilot={() => void navigate("/copilot")} />
        </SettingCard>

        <SettingCard id="proxy" icon={<Network size={17} />} title="网络代理" desc="配置本机 HTTP、HTTPS 或 SOCKS5 代理地址。留空可清除保存的地址。">
          <div className="flex max-w-2xl flex-col gap-2 sm:flex-row">
          <Input value={proxyAddress} onChange={(event) => setProxyAddress(event.target.value)} onPressEnter={() => void saveProxyAddress()} placeholder={t("例如 127.0.0.1:7890 或 socks5://127.0.0.1:1080")} className="font-mono text-sm" aria-label={t("本机代理地址")} />
            <Button type="primary" loading={proxySaving} onClick={() => void saveProxyAddress()} className="sm:min-w-28">{t("保存代理地址")}</Button>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">{t("仅接受 localhost 或回环 IP，防止把代理端口暴露给局域网。留空表示清除地址。")}</p>
          <Alert className="mt-3" type="info" showIcon message={t("此地址目前会保存到本机配置；服务器“借用本机代理”隧道尚未读取该设置。")}/>
        </SettingCard>

        <SettingCard id="whitelist" icon={<ShieldCheck size={17} />} title="AI 出站地址白名单" desc="维护允许域名列表。策略启停和域名数据保存在本机配置中。">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><div className="text-sm font-semibold text-slate-200">{t("出站地址策略")}</div><p className="mt-1 text-sm leading-6 text-slate-500">{t("启用后，名单可供后续 AI 命令审批策略使用；当前命令执行引擎尚未读取此列表。")}</p></div>
            <Switch checked={outboundEnabled} onChange={(checked) => {
              const previous = outboundEnabled;
              setOutboundEnabled(checked);
              settings.setOutboundEnabled(checked);
              void saveOutboundSettings(outboundHosts, checked).catch(() => setOutboundEnabled(previous));
            }} aria-label={t("启用出站地址白名单")} />
          </div>
          <div className="mt-4 border-t border-slate-800/70 pt-4">
            <label className="mb-2 block text-sm font-medium text-slate-300">{t("自定义放行域名")}</label>
            <div className="flex max-w-2xl gap-2">
              <Input value={outboundHostDraft} onChange={(event) => setOutboundHostDraft(event.target.value)} onPressEnter={addOutboundHost} placeholder={t("例如 corp.example.com 或 https://repo.example.com")} className="font-mono text-sm" />
              <Button icon={<Plus size={15} />} onClick={addOutboundHost} aria-label={t("添加域名")} title={t("添加域名")} />
            </div>
            <div className="mt-3 flex min-h-10 flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-surface-950/50 p-2.5">
              {outboundHosts.length ? outboundHosts.map((host) => <AntTag key={host} closable onClose={() => {
                const next = outboundHosts.filter((item) => item !== host);
                setOutboundHosts(next);
                settings.setOutboundHosts(next);
              }} className="!m-0 !px-2 !py-1 !font-mono !text-sm">{host}</AntTag>) : <span className="px-1 text-sm text-slate-500">{t("尚未添加自定义域名")}</span>}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">{t("输入完整 URL 时只保存主机名；支持子域名匹配的意图配置，但目前尚未进入命令执行判定。")}</p>
          </div>
          <div className="mt-4 flex justify-end border-t border-slate-800/70 pt-3">
            <Button type="primary" loading={outboundSaving} onClick={() => void saveOutboundSettings()}>{t("保存白名单")}</Button>
          </div>
        </SettingCard>

        <SettingCard id="ssh-keys" icon={<KeyRound size={15} />} title="SSH 密钥" desc="系统凭据管理器中的 SSH 身份与默认认证方式。">
          <div className="overflow-hidden rounded-lg border border-slate-800"><div className="grid grid-cols-[1fr_120px_90px] border-b border-slate-800 bg-surface-900/70 px-3 py-2 text-xs text-slate-500"><span>{t("身份")}</span><span>{t("类型")}</span><span>{t("状态")}</span></div><div className="grid grid-cols-[1fr_120px_90px] px-3 py-2.5 text-sm text-slate-300"><span className="font-mono">{t("系统凭据 · SSH")}</span><span>{t("密码 / 私钥")}</span><span className="text-emerald-300">{t("已托管")}</span></div></div>
        </SettingCard>

        <SettingCard id="lock" icon={<Lock size={15} />} title="主密码 / 应用锁定" desc="保护敏感 SSH 私钥、数据库密码和模型密钥。">
          <div className="grid gap-3 md:grid-cols-2"><div className="rounded-lg border border-slate-800 bg-surface-900/60 p-3"><div className="font-medium text-slate-200">{t("空闲超时自动锁定")}</div><p className="mt-1 text-xs text-slate-500">{t("鼠标键盘无操作后锁定操作台")}</p><div className="mt-3 rounded-md border border-slate-700 bg-[#0a0e14] px-2.5 py-1.5 text-sm text-slate-300">{t("15 分钟（推荐）")}</div></div><div className="flex flex-col justify-between rounded-lg border border-slate-800 bg-surface-900/60 p-3"><div><div className="font-medium text-slate-200">{t("应用主密码")}</div><p className="mt-1 text-xs text-slate-500">{t("修改后重新派生本地加密根密钥")}</p></div><StaticButton>重设主密码</StaticButton></div></div>
        </SettingCard>

        <SettingCard id="blacklist" icon={<AlertTriangle size={15} />} title="命令黑名单" desc="危险命令默认拦截，所有命中记录都会进入审计日志。">
          <div className="overflow-hidden rounded-lg border border-slate-800"><div className="grid grid-cols-[1fr_1fr_80px] border-b border-slate-800 bg-surface-900/70 px-3 py-2 text-xs text-slate-500"><span>{t("规则")}</span><span>{t("说明")}</span><span>{t("来源")}</span></div>{[["rm -rf /", "删除根目录", "内置"], ["mkfs.*", "格式化磁盘", "内置"], ["DROP DATABASE", "删除数据库", "内置"]].map(([rule, desc, source]) => <div key={rule} className="grid grid-cols-[1fr_1fr_80px] border-b border-slate-800/60 px-3 py-2 text-sm last:border-0"><span className="font-mono text-rose-300">{rule}</span><span className="text-slate-400">{t(desc)}</span><span className="text-slate-500">{t(source)}</span></div>)}</div>
        </SettingCard>

        <SettingCard id="audit-retention" icon={<ClipboardList size={15} />} title="审计保留" desc="定期清理过期审计行，避免长期运行后本地数据库膨胀。">
          <div className="flex max-w-xs items-center gap-2"><div className="flex flex-1 items-center rounded-lg border border-slate-700 bg-[#0a0e14] px-3 py-2 font-mono text-xs text-slate-300">90 <span className="ml-auto font-sans text-slate-500">{t("天")}</span></div><StaticButton>保存</StaticButton></div>
        </SettingCard>

        <SettingCard id="backup" icon={<Archive size={15} />} title="备份与还原" desc="将本地工作区导出为加密备份，便于迁移到新设备或灾难恢复。">
          <BackupSettings />
        </SettingCard>

        <SettingCard id="mobile-pairing" icon={<Smartphone size={15} />} title="手机配对" desc="配对服务只绑定所选私网网卡，120 秒后自动关闭，绝不监听公网。">
          <MobilePairingSettings />
        </SettingCard>

        <SettingCard id="device-channel" icon={<RadioIcon size={15} />} title="设备通道" desc="让配对过的手机连回这台电脑，进行审批、应急锁定、AI 对话和知识库查询。">
          <DeviceChannelSettings />
        </SettingCard>

        <SettingCard id="legal" icon={<FileText size={15} />} title="法律声明与隐私保障" desc="全量数据优先驻留本地，未经授权不向外部发送敏感信息。" hideHeader>
          <LegalNotice />
        </SettingCard>

        <SettingCard id="community" icon={<Users size={15} />} title="作者 & 社区" desc="获取项目更新、问题反馈和使用帮助。" hideHeader>
          <CommunitySettings />
        </SettingCard>

        <SettingCard id="apps" icon={<Sparkles size={15} />} title="推荐应用" desc="与 OpsPub 配合使用的终端、编辑器和安全工具。">
          <div className="grid gap-2 sm:grid-cols-3"><AppTile name="Windows Terminal" desc="终端会话" /><AppTile name="VS Code" desc="配置与脚本" /><AppTile name="1Password" desc="凭据托管" /></div>
        </SettingCard>
      </main>
    </div>
  );
}

function SettingCard({ id, icon, title, desc, children, hideHeader = false }: { id: SettingsSection; icon: ReactNode; title: string; desc: string; children: ReactNode; hideHeader?: boolean }) {
  const language = useSettingsStore((state) => state.language);
  const cardClass = hideHeader ? "scroll-mt-5" : "scroll-mt-5 rounded-xl border border-slate-800/80 bg-[#0f141c] p-4 shadow-lg sm:p-5";
  return <section data-settings-section={id} className={cardClass}>{!hideHeader && <div className="flex items-start gap-2"><span className="mt-0.5 text-teal-400">{icon}</span><div><h3 className="text-sm font-semibold text-white">{translateSettings(title, language)}</h3><p className="mt-1 text-xs leading-relaxed text-slate-400">{translateSettings(desc, language)}</p></div></div>}<div className={hideHeader ? "" : "mt-4"}>{children}</div></section>;
}

interface ModelDraft {
  id?: string;
  name: string;
  presetKey: string | null;
  protocol: ModelProtocol;
  baseUrl: string;
  model: string;
  extra: Record<string, string>;
  apiKey: string;
}

const EMPTY_MODEL_DRAFT: ModelDraft = {
  name: "", presetKey: null, protocol: "openai_compatible", baseUrl: "", model: "", extra: {}, apiKey: "",
};

function ModelServiceSettings({ showReturnToCopilot, onReturnToCopilot }: { showReturnToCopilot: boolean; onReturnToCopilot: () => void }) {
  const language = useSettingsStore((state) => state.language);
  const t = (text: string) => translateSettings(text, language);
  const [profiles, setProfiles] = useState<ModelProfile[]>([]);
  const [vendors, setVendors] = useState<ModelVendor[]>([]);
  const [presets, setPresets] = useState<ModelPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [draft, setDraft] = useState<ModelDraft>(EMPTY_MODEL_DRAFT);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [currentModelId, setCurrentModelId] = useState(() => localStorage.getItem("ops_copilot_model_profile"));
  const [modelLimits, setModelLimits] = useState<{ contextWindow: number | null; maxOutput: number | null } | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [profileRows, vendorRows] = await Promise.all([modelServiceApi.listProfiles(), modelServiceApi.listVendors()]);
      const presetRows = await Promise.all(vendorRows.flatMap((vendor) => vendor.presetKeys).map((key) => modelServiceApi.getPreset(key)));
      setProfiles(profileRows);
      setVendors(vendorRows);
      setPresets(presetRows.filter((preset): preset is ModelPreset => preset !== null));
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadData(); }, []);

  function openNew() {
    setDraft({ ...EMPTY_MODEL_DRAFT });
    setModelOptions([]);
    setModelLimits(null);
    setModalOpen(true);
  }

  function openEdit(profile: ModelProfile) {
    setDraft({ id: profile.id, name: profile.name, presetKey: profile.presetKey, protocol: profile.protocol, baseUrl: profile.baseUrl, model: profile.model, extra: profile.extra, apiKey: "" });
    const preset = presets.find((item) => item.key === profile.presetKey);
    setModelOptions(preset?.models.map((model) => model.value) ?? []);
    const selectedModel = preset?.models.find((model) => model.value === profile.model);
    setModelLimits(selectedModel ? { contextWindow: selectedModel.contextWindow, maxOutput: selectedModel.maxOutput } : null);
    setModalOpen(true);
  }

  function choosePreset(key: string | null) {
    const preset = presets.find((item) => item.key === key);
    if (!preset) {
      setDraft((current) => ({ ...current, presetKey: null, protocol: "openai_compatible" }));
      setModelOptions([]);
      setModelLimits(null);
      return;
    }
    setDraft((current) => ({
      ...current,
      name: current.name || preset.label,
      presetKey: preset.key,
      protocol: preset.protocol,
      baseUrl: preset.baseUrl ?? current.baseUrl,
      model: preset.model || current.model,
      extra: { ...Object.fromEntries(preset.defaultExtra), ...current.extra },
    }));
    setModelOptions(preset.models.map((model) => model.value));
    const selectedModel = preset.models.find((model) => model.value === (preset.model || draft.model));
    setModelLimits(selectedModel ? { contextWindow: selectedModel.contextWindow, maxOutput: selectedModel.maxOutput } : null);
  }

  function changeModel(value: string) {
    setDraft((current) => ({ ...current, model: value }));
    const selectedModel = presets.find((preset) => preset.key === draft.presetKey)?.models.find((model) => model.value === value);
    setModelLimits(selectedModel ? { contextWindow: selectedModel.contextWindow, maxOutput: selectedModel.maxOutput } : null);
  }

  function toInput(value = draft): ModelProfileInput {
    return { id: value.id, name: value.name.trim(), presetKey: value.presetKey, protocol: value.protocol, baseUrl: value.baseUrl.trim(), model: value.model.trim(), extra: value.extra, apiKey: value.apiKey, enabled: true };
  }

  async function save() {
    if (!draft.name.trim()) { message.warning(t("请填写配置名称")); return; }
    if (!draft.model.trim()) { message.warning(t("请填写模型名称")); return; }
    if (!draft.baseUrl.trim() && !draft.presetKey) { message.warning(t("请填写接口地址")); return; }
    setSaving(true);
    try {
      await modelServiceApi.saveProfile(toInput());
      message.success(t("模型服务配置已保存"));
      setModalOpen(false);
      await loadData();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function verify() {
    setTesting(true);
    try {
      const outcome = await modelServiceApi.verify(toInput());
      if (outcome.ok && outcome.result) {
        const returnedModels = outcome.result.models;
        setModelOptions(returnedModels);
        setModelLimits(outcome.result.limits ? { contextWindow: outcome.result.limits.contextWindow, maxOutput: outcome.result.limits.maxOutput } : null);
        if (outcome.result.models.length > 0 && !returnedModels.includes(draft.model)) {
          setDraft((current) => ({ ...current, model: returnedModels[0] }));
        }
        message.success(`${t("连接成功 · ")}${outcome.result.latencyMs}${t(" ms，已获取 ")}${returnedModels.length}${t(" 个模型")}`);
        if (outcome.result.dropped > 0) message.info(`${t("已过滤 ")}${outcome.result.dropped}${t(" 个非对话模型")}`);
        if (!outcome.result.modelInList) message.warning(t("当前模型不在服务商返回的清单中，请确认模型名称"));
        return;
      }
      const error = outcome.error;
      if (!error) { message.error(t("模型服务验证失败")); return; }
      switch (error.code) {
        case "not_found":
          if (error.suggested_url) {
            Modal.confirm({ title: t("接口地址不存在"), content: `${t("可尝试服务商建议的地址：")}${error.suggested_url}`, okText: t("应用建议地址"), cancelText: t("稍后处理"), onOk: () => setDraft((current) => ({ ...current, baseUrl: error.suggested_url ?? current.baseUrl })) });
          } else message.error(`${t("接口地址不存在")}: ${error.requested_url}`);
          break;
        case "model_not_found":
          setModelOptions(error.available);
          message.warning(t("当前模型名称无效，已载入服务端可用模型"));
          break;
        case "missing_extra_field":
          message.error(`${t("请填写服务商要求的字段：")}${error.key}`);
          break;
        case "unreachable":
          message.error(error.proxy_hint ? t("无法连接到服务商；该站点可能需要配置网络代理") : t("无法连接到模型服务，请检查地址和网络后重试"));
          break;
        case "auth_failed":
          message.error(`${t("密钥验证失败：")}${error.detail}`);
          break;
        case "protocol_mismatch":
          message.error(`${t("该密钥要求 ")}${error.expect}${t(" 协议，请选择匹配的服务商预置")}`);
          break;
        default:
          message.error(t("模型服务返回了无法识别的响应，请检查配置"));
      }
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setTesting(false);
    }
  }

  async function remove(profile: ModelProfile) {
    Modal.confirm({ title: t("删除模型服务配置"), content: `${t("确定删除“")}${profile.name}${t("”及其系统托管密钥吗？")}`, okText: t("删除"), okButtonProps: { danger: true }, cancelText: t("取消"), onOk: async () => {
      try {
        await modelServiceApi.deleteProfile(profile.id);
        if (currentModelId === profile.id) {
          localStorage.removeItem("ops_copilot_model_profile");
          setCurrentModelId(null);
        }
        message.success(t("配置已删除"));
        await loadData();
      }
      catch (error) { message.error(getErrorMessage(error)); }
    } });
  }

  function setDefaultModel(profile: ModelProfile) {
    localStorage.setItem("ops_copilot_model_profile", profile.id);
    setCurrentModelId(profile.id);
    message.success(`${t("已设为 AI 助手默认模型：")}${profile.name}`);
  }

  async function exportProfile(profile: ModelProfile) {
    try {
      const text = await modelServiceApi.exportProfile(profile.id);
      Modal.confirm({
        title: t("复制 ai.profile 配置"),
        content: profile.hasApiKey
          ? t("导出内容包含明文 API 密钥，仅复制到剪贴板，不会写入本地文件。请确认剪贴板使用完后及时清理。")
          : t("该配置未托管 API 密钥，将复制不含密钥的 ai.profile 配置。"),
        okText: t("复制配置"),
        cancelText: t("取消"),
        onOk: async () => {
          await navigator.clipboard.writeText(text);
          message.success(t("ai.profile 已复制到剪贴板"));
        },
      });
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  }

  async function importProfiles() {
    setImporting(true);
    try {
      const imported = await modelServiceApi.importProfiles(importText);
      message.success(`${t("已导入 ")}${imported.profiles.length}${t(" 条模型服务配置")}${imported.skipped > 0 ? `${t("，跳过 ")}${imported.skipped}${t(" 条不兼容配置")}` : ""}`);
      setImportOpen(false);
      setImportText("");
      await loadData();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setImporting(false);
    }
  }

  const groupedPresetOptions = vendors.map((vendor) => ({
    label: vendor.groupLabel,
    options: presets.filter((preset) => preset.vendorId === vendor.id).map((preset) => ({ label: `${vendor.label} · ${preset.label}`, value: preset.key })),
  })).filter((group) => group.options.length > 0);
  const requiredExtraMissing = presets.find((preset) => preset.key === draft.presetKey)?.extraFields
    .some((field) => field.required && !(draft.extra[field.key] ?? "").trim()) ?? false;

  return <div className="space-y-3">
    {showReturnToCopilot && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-500/25 bg-indigo-500/10 px-3 py-2.5">
      <div className="min-w-0"><div className="text-sm font-semibold text-indigo-200">{t("AI 助手模型配置")}</div><p className="m-0 mt-0.5 text-xs leading-relaxed text-slate-400">{t("配置完成后返回 AI 助手即可直接使用本次选择的模型。")}</p></div>
      <Button size="small" type="primary" ghost icon={<ArrowLeft size={13} />} onClick={onReturnToCopilot}>{t("返回 AI 助手")}</Button>
    </div>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-base text-slate-400">{language === "en-US" ? `${profiles.length} profiles · API keys are stored in the system credential manager` : `${profiles.length} 条配置 · API 密钥由系统凭据管理器托管`}</div>
      <div className="flex gap-2"><Button size="middle" onClick={() => setImportOpen(true)}>{t("粘贴导入")}</Button><Button size="middle" type="primary" onClick={openNew}>{t("新增模型服务")}</Button></div>
    </div>
    {loading ? <div className="rounded-lg border border-slate-800 px-3 py-6 text-center text-sm text-slate-500">{t("正在读取模型服务配置...")}</div> : profiles.length === 0 ? <div className="rounded-lg border border-dashed border-slate-700 px-3 py-7 text-center"><div className="text-sm font-medium text-slate-300">{t("尚未配置模型服务")}</div><p className="mt-1 text-xs text-slate-500">{t("添加后可在此管理、验证和导出模型配置。")}</p></div> : <div className="divide-y divide-slate-800 overflow-hidden rounded-lg border border-slate-800">
      {profiles.map((profile) => <div key={profile.id} className="flex flex-wrap items-center justify-between gap-3 bg-surface-950/50 px-4 py-3.5">
        <div className="min-w-[220px] flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-base font-semibold text-slate-200">{profile.name}</strong><span className="rounded border border-slate-700 px-2 py-1 text-sm text-slate-400">{profile.protocol === "anthropic" ? "Anthropic" : t("OpenAI 兼容")}</span>{profile.hasApiKey ? <span className="text-sm text-emerald-400">{t("密钥已托管")}</span> : <span className="text-sm text-amber-400">{t("未配置密钥")}</span>}{currentModelId === profile.id && <span className="rounded border border-teal-500/30 bg-teal-500/10 px-2 py-1 text-sm text-teal-300">{t("AI 默认")}</span>}</div><div className="mt-1.5 truncate font-mono text-sm text-slate-500">{profile.model || t("未选择模型")} · {profile.baseUrl || t("使用预置端点")}</div></div>
        <div className="flex flex-wrap items-center gap-1"><Button type="text" size="middle" disabled={currentModelId === profile.id} onClick={() => setDefaultModel(profile)}>{currentModelId === profile.id ? t("当前默认") : t("设为默认")}</Button><Button type="text" size="middle" icon={<Copy size={15} />} onClick={() => void exportProfile(profile)}>{t("导出")}</Button><Button type="text" size="middle" onClick={() => openEdit(profile)}>{t("编辑")}</Button><Button type="text" size="middle" danger onClick={() => void remove(profile)}>{t("删除")}</Button></div>
      </div>)}
    </div>}

    <Modal title={<span className="text-sm font-bold">{t(draft.id ? "编辑模型服务" : "新增模型服务")}</span>} open={modalOpen} width={576} centered maskClosable={false} onCancel={() => setModalOpen(false)} confirmLoading={saving} styles={{ mask: { backgroundColor: "rgba(0,0,0,.8)", backdropFilter: "blur(3px)" }, container: { maxWidth: "calc(100vw - 32px)", padding: 0, overflow: "hidden", border: "1px solid var(--border)", background: "var(--bg-secondary)" }, header: { margin: 0, padding: "14px 20px", borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" }, body: { padding: 0 }, footer: { margin: 0, padding: "14px 20px", borderTop: "1px solid var(--border)", background: "var(--bg-primary)" } }} footer={<div className="flex items-center justify-between gap-3"><Button icon={<Plug size={14} />} loading={testing} disabled={requiredExtraMissing} onClick={() => void verify()}>{t("测试连接")}</Button><div className="flex items-center gap-2.5"><Button onClick={() => setModalOpen(false)}>{t("取消")}</Button><Button type="primary" loading={saving} onClick={() => void save()}>{t("确定")}</Button></div></div>}>
      <div className="max-h-[75vh] space-y-4 overflow-y-auto p-5 custom-scrollbar">
        <ModelField label="名称" required>
          <Input value={draft.name} placeholder={t("如：个人 Anthropic、公司 DeepSeek")} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
        </ModelField>

        <ModelField label="服务商" required hint="选择服务商通信协议与官方预设">
          <Select allowClear showSearch optionFilterProp="label" className="w-full" value={draft.presetKey ?? undefined} options={groupedPresetOptions} placeholder={t("选择服务商，或留空使用自定义端点")} onChange={(key: string | undefined) => choosePreset(key ?? null)} />
        </ModelField>
        {draft.presetKey && (() => {
          const selected = presets.find((preset) => preset.key === draft.presetKey);
          return selected ? <div className="-mt-2 rounded-md border border-slate-800 bg-surface-950/60 px-3 py-2 text-sm text-slate-500">{selected.isLocal ? t("本地服务：请先启动模型服务。") : selected.applyUrl ? <a className="text-teal-400 hover:text-teal-300" href={selected.applyUrl} target="_blank" rel="noreferrer">{t("前往服务商申请密钥")}</a> : t("官方服务端点")}{selected.verifiedAt ? ` · ${t("预置核实于")}${selected.verifiedAt}` : t(" · 预置尚未实际核实")}</div> : null;
        })()}

        <ModelField label="API 接口地址 (Base URL)">
          <Input className="font-mono" value={draft.baseUrl} placeholder={t("保留服务商要求的完整版本路径，不会自动补 /v1")} onChange={(event) => setDraft((current) => ({ ...current, baseUrl: event.target.value }))} />
        </ModelField>

        <ModelField label="API 密钥" hint="密钥只保存在系统凭据管理器">
          <Input.Password className="font-mono" value={draft.apiKey} placeholder={t(draft.id ? "留空以保留已托管密钥" : "本地无鉴权服务可留空")} onChange={(event) => setDraft((current) => ({ ...current, apiKey: event.target.value }))} autoComplete="new-password" />
        </ModelField>

        <ModelField label="模型" required>
          <div className="flex items-center gap-2">
            <AutoComplete allowClear className="min-w-0 flex-1 font-mono" value={draft.model} options={modelOptions.map((model) => ({ label: model, value: model }))} filterOption={(input, option) => String(option?.value ?? "").toLowerCase().includes(input.toLowerCase())} placeholder={t("例如 claude-opus-5-5 或 deepseek-reasoner")} onChange={changeModel} onSelect={(model: string) => changeModel(model)} />
            <Button className="shrink-0" loading={testing} disabled={requiredExtraMissing} onClick={() => void verify()} icon={<RefreshCw size={14} />}>{t("获取")}</Button>
          </div>
          <p className="m-0 mt-1.5 text-sm leading-relaxed text-slate-500">{modelOptions.length > 0 ? t("模型已加载，可从建议列表选择，也可手动输入其他模型名。") : t("下拉列表是服务商返回的可用模型；也可以直接输入自定义模型名。")}</p>
        </ModelField>

        <ModelField label="上下文窗口 / 单次输出上限 (tokens)" hint="模型列表接口返回的能力信息；未知时不会主动限制上下文。">
          <div className="grid grid-cols-2 gap-3">
            <LimitField label="窗口" value={modelLimits?.contextWindow} />
            <LimitField label="输出" value={modelLimits?.maxOutput} />
          </div>
        </ModelField>

        {draft.presetKey && presets.find((preset) => preset.key === draft.presetKey)?.extraFields.map((field) => (
          <ModelField key={field.key} label={field.label} required={field.required}>
            <Input value={draft.extra[field.key] ?? ""} placeholder={field.placeholder ?? ""} onChange={(event) => setDraft((current) => ({ ...current, extra: { ...current.extra, [field.key]: event.target.value } }))} />
          </ModelField>
        ))}

        {modelOptions.length > 0 && <p className="m-0 text-sm text-slate-500">{t("已获取 ")}{modelOptions.length}{t(" 个可用模型。验证只请求模型列表，不会发起生成请求。")}</p>}
      </div>
    </Modal>

    <Modal title={t("粘贴 ai.profile 配置")} open={importOpen} width={560} centered maskClosable={false} onCancel={() => setImportOpen(false)} onOk={() => void importProfiles()} confirmLoading={importing} okText={t("导入并托管密钥")} cancelText={t("取消")}>
      <p className="mb-2 text-xs text-slate-500">{t("支持单条 `ai.profile` 和 `ai.profile.bundle`。导入密钥后只保存到系统凭据管理器，不会写入配置文本。")}</p>
      <Input.TextArea rows={10} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder={t("粘贴模型服务 JSON 配置")} />
    </Modal>
  </div>;
}

function ModelField({ label, required = false, hint, children }: { label: string; required?: boolean; hint?: string; children: ReactNode }) {
  return <label className="block space-y-1.5"><span className="flex items-center gap-1 text-sm text-slate-300"><span>{required && <span className="mr-1 text-rose-400">*</span>}{label}</span>{hint && <span title={hint} className="inline-flex cursor-help"><CircleHelp size={13} className="text-slate-500" /></span>}</span>{children}</label>;
}

function LimitField({ label, value }: { label: string; value: number | null | undefined }) {
  return <div className="flex items-center overflow-hidden rounded-lg border border-slate-700/80 bg-surface-950/70"><span className="shrink-0 border-r border-slate-700/80 bg-surface-900 px-2.5 py-2 text-sm text-slate-400">{label}</span><span className="min-w-0 flex-1 px-2.5 py-2 text-sm font-mono text-slate-300">{value == null ? "未知" : value.toLocaleString()}</span></div>;
}

function StaticButton({ active = false, children, className = "", onClick }: { active?: boolean; children: ReactNode; className?: string; onClick?: () => void }) {
  const language = useSettingsStore((state) => state.language);
  const label = typeof children === "string" ? translateSettings(children, language) : children;
  return <button type="button" onClick={onClick} className={`rounded-lg border px-3.5 py-1.5 text-xs font-medium transition ${active ? "border-teal-500/50 bg-teal-500/20 text-teal-200" : "border-slate-700 bg-surface-900 text-slate-300 hover:border-slate-600 hover:text-white"} ${className}`}>{label}</button>;
}

function ToggleRow({ label, desc, checked, onChange, disabled = false, loading = false }: { label: string; desc: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; loading?: boolean }) {
  const language = useSettingsStore((state) => state.language);
  return <div className={`flex items-center gap-3 ${disabled ? "opacity-50" : ""}`}><span className="w-32 shrink-0 text-xs text-slate-300">{translateSettings(label, language)}</span><Switch size="small" checked={checked} loading={loading} disabled={disabled} onChange={onChange} /><span className="text-xs text-slate-500">{translateSettings(desc, language)}</span></div>;
}

function TerminalSettingSelect<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return <label className="block min-w-0"><span className="mb-1.5 block text-xs font-medium text-slate-400">{label}</span><Select className="w-full" value={value} options={options} onChange={onChange} /></label>;
}

function PreviewTerminal({ title, background, foreground, selected }: { title: string; background: string; foreground: string; selected?: boolean }) {
  return <div className="rounded-md border border-white/10 p-3" style={{ background }}><div className="mb-2 flex items-center justify-between text-xs" style={{ color: `${foreground}aa` }}><span className="font-mono font-semibold" style={{ color: foreground }}>{title}</span><span className="font-mono">bash</span></div><pre className="overflow-hidden font-mono text-xs leading-relaxed" style={{ color: foreground }}>$ ssh opspub@server{`\n`}Connected · ready for commands{`\n`}$ <span className={selected ? "animate-pulse" : ""}>█</span></pre></div>;
}

type LegalTab = "eula" | "privacy" | "aiops" | "sbom";

function CommunitySettings() {
  const language = useSettingsStore((state) => state.language);
  const copy = (zh: string, en: string) => language === "en-US" ? en : zh;

  async function copyValue(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      message.success(copy(`${label}已复制`, `${label} copied`));
    } catch {
      message.error(copy("复制失败，请检查剪贴板权限", "Copy failed. Check clipboard permissions."));
    }
  }

  async function openExternal(url: string) {
    try {
      await openUrl(url);
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  }

  const rows: Array<{ key: string; icon: ReactNode; label: string; value: string; url?: string; note?: string; copyLabel?: string }> = [
    { key: "author", icon: <User size={16} />, label: copy("作者", "Author"), value: copy("软宁 Java 全栈 AI 架构师", "Ruoning · Java Full-stack AI Architect") },
    { key: "bilibili", icon: <Video size={16} />, label: copy("B 站主页", "Bilibili profile"), value: copy("点击访问 B 站主页", "Visit Bilibili profile"), url: "https://space.bilibili.com/" },
    { key: "tutorial", icon: <Video size={16} />, label: copy("视频讲解", "Video tutorials"), value: copy("B 站使用教程 / 功能演示", "Bilibili tutorials / product demos"), url: "https://www.bilibili.com/" },
    { key: "group", icon: <MessageSquare size={16} />, label: copy("QQ 交流群", "QQ Community"), value: "4545458", note: copy("Bug 反馈 / 使用交流 / 新功能讨论", "Bug reports / usage / feature discussion"), copyLabel: copy("加群", "Copy group ID") },
    { key: "qq", icon: <MessageSquare size={16} />, label: copy("QQ 号", "QQ ID"), value: "2397344434", note: copy("添加时请备注「来自 OpsPub」", "Mention “from OpsPub” when adding"), copyLabel: copy("复制 QQ 号", "Copy QQ ID") },
    { key: "wechat", icon: <MessageSquare size={16} />, label: copy("微信号", "WeChat ID"), value: "aohai3045", note: copy("添加时请备注「来自 OpsPub」", "Mention “from OpsPub” when adding"), copyLabel: copy("复制微信号", "Copy WeChat ID") },
    { key: "website", icon: <Globe size={16} />, label: copy("官网", "Website"), value: "https://www.opspub.com/", url: "https://www.opspub.com/" },
    { key: "download", icon: <Download size={16} />, label: copy("下载", "Downloads"), value: "https://www.opspub.com/download", url: "https://www.opspub.com/download" },
  ];

  return <div className="space-y-2 rounded-xl border border-slate-800/80 bg-[#0f141c] p-4 shadow-lg sm:p-5">
    <h3 className="border-b border-slate-800/70 pb-2 text-base font-bold text-white">{copy("作者 & 社区", "Author & Community")}</h3>
    <div className="divide-y divide-slate-800/70">
      {rows.map((row) => <div key={row.key} className="flex min-h-14 items-center justify-between gap-3 py-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="shrink-0 text-slate-400">{row.icon}</span>
          <div className="min-w-0">
            <div className="text-xs leading-tight text-slate-400">{row.label}</div>
            {row.url ? <button type="button" onClick={() => void openExternal(row.url!)} className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-left text-sm font-medium text-blue-400 transition hover:text-blue-300 hover:underline">{row.value}</button> : <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-slate-200">
              <span className={row.key === "author" ? "font-medium" : "font-mono font-bold tracking-wide text-white"}>{row.value}</span>
              {row.note && <span className="text-xs text-slate-500">{row.note}</span>}
            </div>}
          </div>
        </div>
        {row.url ? <button type="button" onClick={() => void openExternal(row.url!)} aria-label={copy("在浏览器中打开", "Open in browser")} className="shrink-0 rounded-md p-1.5 text-slate-500 transition hover:bg-surface-800 hover:text-slate-200"><ExternalLink size={16} /></button> : row.copyLabel ? <div className="flex shrink-0 items-center gap-2">
          {row.key === "group" && <button type="button" onClick={() => void copyValue(row.value, copy("群号", "Group ID"))} className="rounded-md px-2 py-1 text-xs font-medium text-blue-400 transition hover:bg-surface-800 hover:text-blue-300">{row.copyLabel}</button>}
          <button type="button" onClick={() => void copyValue(row.value, row.label)} aria-label={row.copyLabel} className="rounded-md p-1.5 text-slate-500 transition hover:bg-surface-800 hover:text-slate-200"><Copy size={15} /></button>
        </div> : null}
      </div>)}
    </div>
  </div>;
}

type BackupTab = "local" | "cloud" | "sync" | "storage";

function BackupSettings() {
  const language = useSettingsStore((state) => state.language);
  const copy = (zh: string, en: string) => language === "en-US" ? en : zh;
  const [tab, setTab] = useState<BackupTab>("local");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [restorePassword, setRestorePassword] = useState("");
  const [busy, setBusy] = useState<"export" | "restore" | null>(null);
  const [storageEndpoints, setStorageEndpoints] = useState<BackupStorageEndpoint[]>([]);
  const [selectedStorageId, setSelectedStorageId] = useState("");
  const [storageModalOpen, setStorageModalOpen] = useState(false);
  const [editingStorage, setEditingStorage] = useState<BackupStorageEndpoint | null>(null);
  const [storageForm, setStorageForm] = useState<BackupStorageInput>({ name: "", url: "", username: "", password: "", remoteDir: "opspub", enabled: true });
  const [storageBusy, setStorageBusy] = useState(false);
  const [remoteFilename, setRemoteFilename] = useState("");

  useEffect(() => {
    void loadStorageEndpoints();
  }, []);

  async function loadStorageEndpoints() {
    try {
      const endpoints = await backupApi.listStorage();
      setStorageEndpoints(endpoints);
      setSelectedStorageId((current) => endpoints.some((endpoint) => endpoint.id === current) ? current : endpoints.find((endpoint) => endpoint.enabled)?.id ?? "");
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  }

  function openStorageForm(endpoint?: BackupStorageEndpoint) {
    setEditingStorage(endpoint ?? null);
    setStorageForm(endpoint
      ? { ...endpoint, password: "" }
      : { name: "", url: "", username: "", password: "", remoteDir: "opspub", enabled: true });
    setStorageModalOpen(true);
  }

  async function saveStorage() {
    setStorageBusy(true);
    try {
      const saved = await backupApi.saveStorage({ ...storageForm, ...(editingStorage ? { id: editingStorage.id } : {}) });
      await loadStorageEndpoints();
      setSelectedStorageId(saved.id);
      setStorageModalOpen(false);
      message.success(copy("存储端配置已保存", "Storage endpoint saved"));
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setStorageBusy(false);
    }
  }

  async function testStorage(input = storageForm) {
    setStorageBusy(true);
    try {
      await backupApi.testStorage(input);
      message.success(copy("WebDAV 连接成功", "WebDAV connection succeeded"));
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setStorageBusy(false);
    }
  }

  async function deleteStorage(endpoint: BackupStorageEndpoint) {
    Modal.confirm({
      title: copy("删除存储端？", "Delete storage endpoint?"),
      content: copy(`将删除“${endpoint.name}”的本地配置和系统托管密码，不会删除远端文件。`, `This removes “${endpoint.name}” and its locally stored credential. Remote files are not deleted.`),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await backupApi.deleteStorage(endpoint.id);
          await loadStorageEndpoints();
        } catch (error) {
          message.error(getErrorMessage(error));
        }
      },
    });
  }

  async function pushExistingBackup() {
    if (!selectedStorageId) return message.warning(copy("请先配置并选择一个启用的存储端", "Configure and select an enabled storage endpoint first"));
    const selection = await openFileDialog({ title: copy("选择要上传的加密备份", "Choose encrypted backup to upload"), multiple: false, directory: false, filters: [{ name: "OpsPub Backup", extensions: ["opspubbak"] }] });
    const path = Array.isArray(selection) ? selection[0] : selection;
    if (!path || typeof path !== "string") return;
    setBusy("export");
    try {
      const result = await backupApi.pushBackup(selectedStorageId, path);
      message.success(copy(`已上传 ${result}`, `Uploaded ${result}`));
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function pullExistingBackup() {
    if (!selectedStorageId) return message.warning(copy("请先配置并选择一个启用的存储端", "Configure and select an enabled storage endpoint first"));
    const filename = remoteFilename.trim();
    if (!filename || filename.includes("/") || filename.includes("\\") || !filename.endsWith(".opspubbak")) return message.warning(copy("请输入远端 .opspubbak 文件名", "Enter a remote .opspubbak filename"));
    const path = await saveFileDialog({ title: copy("选择备份下载位置", "Choose backup download location"), defaultPath: filename, filters: [{ name: "OpsPub Backup", extensions: ["opspubbak"] }] });
    if (!path || typeof path !== "string") return;
    setBusy("restore");
    try {
      await backupApi.pullBackup(selectedStorageId, filename, path);
      message.success(copy("加密备份已下载", "Encrypted backup downloaded"));
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  function validPassword(value: string) {
    const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(value)).length;
    return value.length >= 16 || (value.length >= 12 && classes >= 3);
  }

  async function exportBackup() {
    if (!validPassword(password)) {
      message.warning(copy("备份密码需至少 12 位且包含 3 类字符，或至少 16 位", "Use at least 12 characters with 3 character classes, or 16 characters."));
      return;
    }
    if (password !== confirmPassword) {
      message.warning(copy("两次输入的备份密码不一致", "Backup passwords do not match"));
      return;
    }
    const path = await saveFileDialog({
      title: copy("选择备份保存位置", "Choose backup location"),
      defaultPath: `opspub-backup-${new Date().toISOString().slice(0, 10)}.opspubbak`,
      filters: [{ name: "OpsPub Backup", extensions: ["opspubbak"] }],
    });
    if (!path || typeof path !== "string") return;
    setBusy("export");
    try {
      await backupApi.exportWorkspace(path, password);
      message.success(copy("备份已加密导出", "Encrypted backup exported"));
      setConfirmPassword("");
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function chooseRestoreFile() {
    const selection = await openFileDialog({
      title: copy("选择 OpsPub 备份文件", "Choose an OpsPub backup"),
      multiple: false,
      directory: false,
      filters: [{ name: "OpsPub Backup", extensions: ["opspubbak"] }],
    });
    const path = Array.isArray(selection) ? selection[0] : selection;
    if (!path || typeof path !== "string") return;
    if (!validPassword(restorePassword)) {
      message.warning(copy("请输入创建备份时使用的密码", "Enter the password used to create the backup"));
      return;
    }
    Modal.confirm({
      title: copy("确认还原工作区？", "Restore this workspace?"),
      content: copy("还原会覆盖当前本地数据库中的连接、配置和历史记录。系统凭据管理器中的密码、私钥和 API Key 不会从备份中覆盖。建议先导出当前工作区。", "Restoring replaces the local database connections, settings, and history. Passwords, private keys, and API keys in the system credential manager are not overwritten. Export the current workspace first."),
      okText: copy("确认还原", "Restore"),
      cancelText: copy("取消", "Cancel"),
      okButtonProps: { danger: true },
      onOk: async () => {
        setBusy("restore");
        try {
          await backupApi.restoreWorkspace(path, restorePassword);
          message.success(copy("工作区已还原，正在刷新页面", "Workspace restored. Reloading..."));
          window.setTimeout(() => window.location.reload(), 500);
        } catch (error) {
          message.error(getErrorMessage(error));
        } finally {
          setBusy(null);
        }
      },
    });
  }

  const tabs: Array<{ key: BackupTab; icon: ReactNode; zh: string; en: string }> = [
    { key: "local", icon: <HardDrive size={14} />, zh: "本地备份", en: "Local backup" },
    { key: "cloud", icon: <Cloud size={14} />, zh: "云端同步", en: "Cloud sync" },
    { key: "sync", icon: <Repeat size={14} />, zh: "多设备同步", en: "Multi-device sync" },
    { key: "storage", icon: <DatabaseIcon size={14} />, zh: "存储端", en: "Storage" },
  ];
  const tabButton = (key: BackupTab) => `flex items-center gap-1.5 border-b-2 pb-2.5 text-xs font-medium transition ${tab === key ? "border-indigo-500 text-indigo-400" : "border-transparent text-slate-400 hover:text-slate-200"}`;

  return <div className="space-y-4 rounded-2xl border border-slate-800/80 bg-[#0f141c] p-4 shadow-lg sm:p-5">
    <div><div className="flex items-center gap-2 text-sm font-medium text-white"><HardDrive size={16} className="text-indigo-400" />{copy("备份与还原", "Backup & Restore")}</div><p className="mt-1 text-xs leading-relaxed text-slate-400">{copy("把本地工作区导出为加密备份，便于迁移到新设备或灾难恢复。系统凭据管理器中的密码、私钥和 API Key 不会写入备份文件。", "Export the local workspace as an encrypted backup for migration or disaster recovery. Passwords, private keys, and API keys from the system credential manager are not written to the backup.")}</p></div>
    <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs"><AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-400" /><div className="space-y-1"><div className="font-bold text-amber-300">{copy("备份密码独立于应用主密码，请妥善保管", "The backup password is independent from the app master password")}</div><div className="text-[11px] leading-relaxed text-amber-200/80">{copy("忘记密码无法解密备份。备份包含本机 SQLite 工作区的全部数据（含审计与聊天历史）；系统凭据管理器中的密码、私钥和 API Key 不会导出。", "A forgotten password cannot decrypt the backup. It contains all local SQLite workspace data, including audit and chat history; passwords, private keys, and API keys in the system credential manager are excluded.")}</div></div></div>
    <div className="flex gap-5 overflow-x-auto border-b border-slate-800/80">
      {tabs.map((item) => <button key={item.key} type="button" onClick={() => setTab(item.key)} className={tabButton(item.key)}>{item.icon}<span>{copy(item.zh, item.en)}</span></button>)}
    </div>

    {tab === "local" && <div className="grid grid-cols-1 gap-4 pt-1 lg:grid-cols-2">
      <div className="flex flex-col justify-between space-y-4 rounded-xl border border-slate-800/90 bg-[#111622] p-4">
        <div className="space-y-4"><div className="flex items-center gap-2 text-xs font-medium text-slate-200"><Upload size={14} className="text-indigo-400" />{copy("完整工作区备份", "Full workspace backup")}</div><div className="rounded-lg border border-slate-800 bg-surface-950/50 p-3 text-xs leading-relaxed text-slate-400">{copy("导出当前本机 SQLite 数据库中的全部数据，包括服务器配置、应用设置、策略、审计日志和聊天历史。系统凭据管理器中的密码与密钥另行托管，不包含在此文件中。", "Exports all data in the local SQLite database, including server settings, app settings, policies, audit logs, and chat history. Passwords and keys in the system credential manager are stored separately and are not included.")}</div><div className="space-y-2 border-t border-slate-800 pt-3"><div className="text-xs font-medium text-slate-300">{copy("设置备份密码", "Set backup password")}</div><Input.Password value={password} onChange={(event) => setPassword(event.target.value)} placeholder={copy("至少 12 位，或至少 16 位", "12+ characters, or 16+")} autoComplete="new-password" /><Input.Password value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder={copy("再次输入备份密码", "Repeat backup password")} autoComplete="new-password" /></div></div><Button type="primary" icon={<Upload size={14} />} loading={busy === "export"} onClick={() => void exportBackup()}>{copy("选择保存位置并导出", "Choose location and export")}</Button>
      </div>
      <div className="space-y-4 rounded-xl border border-slate-800/90 bg-[#111622] p-4"><div className="flex items-center gap-2 text-xs font-medium text-slate-200"><Download size={14} className="text-indigo-400" />{copy("本地还原", "Restore local backup")}</div><button type="button" onClick={() => void chooseRestoreFile()} className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-slate-700/80 bg-[#141926]/60 px-4 py-4 text-left text-xs text-slate-300 transition hover:border-indigo-500/80 hover:bg-[#181f30]"><FolderOpen size={17} className="text-slate-400" /><span>{copy("选择备份文件 (.opspubbak)", "Choose backup file (.opspubbak)")}</span></button><Input.Password value={restorePassword} onChange={(event) => setRestorePassword(event.target.value)} placeholder={copy("输入备份密码后选择文件", "Enter backup password before choosing a file")} autoComplete="current-password" />{busy === "restore" && <div className="text-xs text-indigo-300">{copy("正在还原工作区...", "Restoring workspace...")}</div>}</div>
    </div>}

    {(tab === "cloud" || tab === "sync") && <div className="space-y-4 rounded-xl border border-slate-800/90 bg-[#111622] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-medium text-slate-200">{copy(tab === "cloud" ? "云端备份文件" : "多设备备份同步", tab === "cloud" ? "Cloud backup files" : "Multi-device backup sync")}</div><div className="mt-1 text-[11px] text-slate-500">{copy("仅上传已加密的 .opspubbak 文件；远端目录不会保存明文工作区数据。", "Only encrypted .opspubbak files are uploaded. No plaintext workspace data is stored remotely.")}</div></div><Button size="small" icon={<Plus size={13} />} onClick={() => { setTab("storage"); openStorageForm(); }}>{copy("新增存储端", "Add endpoint")}</Button></div>
      <Select className="w-full max-w-lg" placeholder={copy("选择存储端", "Select storage endpoint")} value={selectedStorageId || undefined} onChange={setSelectedStorageId} options={storageEndpoints.filter((item) => item.enabled).map((item) => ({ value: item.id, label: `${item.name} · ${item.url}` }))} />
      <div className="flex flex-wrap gap-2"><Button icon={<Upload size={14} />} loading={busy === "export"} disabled={!selectedStorageId} onClick={() => void pushExistingBackup()}>{copy("上传加密备份", "Upload encrypted backup")}</Button><Input value={remoteFilename} onChange={(event) => setRemoteFilename(event.target.value)} placeholder={copy("远端文件名.opspubbak", "remote-file.opspubbak")} className="max-w-xs" /><Button icon={<Download size={14} />} loading={busy === "restore"} disabled={!selectedStorageId} onClick={() => void pullExistingBackup()}>{copy("下载备份", "Download backup")}</Button></div>
      {storageEndpoints.length === 0 && <BackupEmptyState icon={<Cloud size={24} />} title={copy("尚未配置备份存储端", "No backup storage configured")} description={copy("添加 WebDAV 存储端后即可在设备间传输加密备份文件。", "Add a WebDAV endpoint to transfer encrypted backups between devices.")} onClick={() => { setTab("storage"); openStorageForm(); }} />}
    </div>}
    {tab === "storage" && <div className="space-y-3 rounded-xl border border-slate-800/90 bg-[#111622] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs leading-relaxed text-slate-400">{copy("存储端使用 WebDAV。账号密码通过系统凭据管理器保存；远端仅存放本地加密生成的备份文件。", "WebDAV credentials are stored in the system credential manager. The remote endpoint only receives locally encrypted backups.")}</p><Button type="primary" size="small" icon={<Plus size={14} />} onClick={() => openStorageForm()}>{copy("新增存储端", "Add endpoint")}</Button></div>
      <div className="overflow-x-auto rounded-lg border border-slate-800"><table className="w-full min-w-[620px] text-left text-xs"><thead className="bg-surface-950/70 text-slate-400"><tr><th className="px-3 py-2">{copy("名称", "Name")}</th><th className="px-3 py-2">{copy("WebDAV 地址", "WebDAV URL")}</th><th className="px-3 py-2">{copy("远端目录", "Remote directory")}</th><th className="px-3 py-2">{copy("状态", "Status")}</th><th className="px-3 py-2 text-right">{copy("操作", "Actions")}</th></tr></thead><tbody>{storageEndpoints.length === 0 ? <tr><td colSpan={5} className="py-10 text-center text-slate-500">{copy("还没有存储端配置", "No storage endpoints configured")}</td></tr> : storageEndpoints.map((endpoint) => <tr key={endpoint.id} className="border-t border-slate-800/70"><td className="px-3 py-2.5 text-slate-200">{endpoint.name}</td><td className="max-w-[280px] truncate px-3 py-2.5 text-slate-400" title={endpoint.url}>{endpoint.url}</td><td className="px-3 py-2.5 font-mono text-slate-400">/{endpoint.remoteDir}</td><td className="px-3 py-2.5">{endpoint.enabled ? <AntTag color="green">{copy("启用", "Enabled")}</AntTag> : <AntTag>{copy("停用", "Disabled")}</AntTag>}</td><td className="px-3 py-2.5 text-right"><div className="flex justify-end gap-1"><Button size="small" onClick={() => void testStorage({ ...endpoint, password: "" })}>{copy("测试", "Test")}</Button><Button size="small" onClick={() => openStorageForm(endpoint)}>{copy("编辑", "Edit")}</Button><Button size="small" danger onClick={() => void deleteStorage(endpoint)}>{copy("删除", "Delete")}</Button></div></td></tr>)}</tbody></table></div>
    </div>}

    <Modal open={storageModalOpen} title={copy(editingStorage ? "编辑存储端" : "新增存储端", editingStorage ? "Edit storage endpoint" : "Add storage endpoint")} onCancel={() => setStorageModalOpen(false)} onOk={() => void saveStorage()} confirmLoading={storageBusy} okText={copy("保存", "Save")} cancelText={copy("取消", "Cancel")} maskClosable={false}>
      <div className="space-y-3 py-2"><Input value={storageForm.name} onChange={(event) => setStorageForm({ ...storageForm, name: event.target.value })} placeholder={copy("名称，例如 坚果云-运维", "Name, e.g. WebDAV backup")} /><Input value={storageForm.url} onChange={(event) => setStorageForm({ ...storageForm, url: event.target.value })} placeholder="https://dav.example.com/remote.php/dav/files/user" />
        <div className="flex flex-wrap gap-2 text-xs"><span className="text-slate-500">{copy("快速填充：", "Quick fill:")}</span><button type="button" className="text-indigo-400" onClick={() => setStorageForm({ ...storageForm, name: storageForm.name || "坚果云", url: "https://dav.jianguoyun.com/dav/", remoteDir: "opspub" })}>坚果云</button><button type="button" className="text-indigo-400" onClick={() => setStorageForm({ ...storageForm, name: storageForm.name || "Nextcloud", url: "https://cloud.example.com/remote.php/dav/files/user", remoteDir: "opspub" })}>Nextcloud</button></div>
        <Input value={storageForm.username} onChange={(event) => setStorageForm({ ...storageForm, username: event.target.value })} placeholder={copy("WebDAV 账号", "WebDAV username")} /><Input.Password value={storageForm.password} onChange={(event) => setStorageForm({ ...storageForm, password: event.target.value })} placeholder={copy(editingStorage ? "留空则保留已保存的密码" : "WebDAV 应用密码", editingStorage ? "Leave empty to keep the saved password" : "WebDAV app password")} autoComplete="new-password" /><Input value={storageForm.remoteDir} onChange={(event) => setStorageForm({ ...storageForm, remoteDir: event.target.value })} placeholder={copy("远端目录", "Remote directory")} /><div className="flex items-center justify-between"><span className="text-xs text-slate-400">{copy("启用此存储端", "Enable this endpoint")}</span><Switch checked={storageForm.enabled} onChange={(enabled) => setStorageForm({ ...storageForm, enabled })} /></div><Button loading={storageBusy} onClick={() => void testStorage({ ...storageForm, ...(editingStorage && !storageForm.password ? { password: "" } : {}) })}>{copy("测试连接", "Test connection")}</Button></div>
    </Modal>
  </div>;
}

function BackupEmptyState({ icon, title, description, onClick }: { icon: ReactNode; title: string; description: string; onClick?: () => void }) {
  return <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-slate-800/90 bg-[#111622] p-8 text-center"><div className="mb-4 flex h-12 w-16 items-center justify-center rounded-xl border-2 border-dashed border-slate-700/80 bg-slate-800/20 text-slate-500">{icon}</div><div className="text-xs font-medium text-slate-300">{title}</div><div className="mt-1 max-w-sm text-[11px] leading-relaxed text-slate-500">{description}</div>{onClick && <Button type="link" className="mt-3" onClick={onClick}>{"去配置存储端"}</Button>}</div>;
}

function LegalNotice() {
  const language = useSettingsStore((state) => state.language);
  const [activeTab, setActiveTab] = useState<LegalTab>("eula");
  const copy = (zh: string, en: string) => language === "en-US" ? en : zh;
  const tabClass = (tab: LegalTab) => activeTab === tab
    ? "border-teal-500/40 bg-teal-500/20 text-teal-300"
    : "border-transparent bg-surface-850 text-slate-400 hover:text-slate-200";

  function downloadText(filename: string, content: string) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadLegalSummary() {
    downloadText("opspub-legal-compliance.txt", [
      "OpsPub 法律声明与隐私保障 / Legal & Privacy",
      "===========================================",
      "数据存储：本地优先；敏感凭据：系统托管；遥测：默认关闭。",
      "Data storage: local first; credentials: system managed; telemetry: off by default.",
      "",
      "本文件为 OpsPub 客户端内置合规说明，不构成法律意见。请以项目 LICENSE 和实际部署环境的合同为准。",
    ].join("\n"));
    message.success(copy("合规说明已下载", "Compliance summary downloaded"));
  }

  function exportComplianceReport() {
    const report = {
      product: "OpsPub",
      generatedAt: new Date().toISOString(),
      dataStorage: "local-first",
      credentialStorage: "system-managed",
      telemetry: "off-by-default",
      policy: "The report describes client safeguards; it is not a legal certification.",
    };
    downloadText("opspub-compliance-report.json", JSON.stringify(report, null, 2));
    message.success(copy("本地合规报告已生成", "Local compliance report generated"));
  }

  const tabs: Array<{ key: LegalTab; label: string; en: string; icon: ReactNode }> = [
    { key: "eula", label: "最终用户许可协议 (EULA)", en: "End User License Agreement (EULA)", icon: <FileText size={14} /> },
    { key: "privacy", label: "数据安全与隐私政策", en: "Data Security & Privacy", icon: <Shield size={14} /> },
    { key: "aiops", label: "AI 运维免责与安全边界", en: "AI Operations Safety Boundary", icon: <Bot size={14} /> },
    { key: "sbom", label: "第三方开源许可证清单 (SBOM)", en: "Third-party Open Source Licenses (SBOM)", icon: <Layers size={14} /> },
  ];

  return <div className="space-y-5 rounded-xl border border-slate-800/80 bg-[#0f141c] p-4 shadow-xl sm:p-5">
    <div className="flex flex-col justify-between gap-3 border-b border-slate-800/80 pb-3 sm:flex-row sm:items-center">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm font-bold text-white"><span className="flex h-6 w-6 items-center justify-center rounded-lg border border-teal-500/40 bg-teal-500/20 text-teal-400"><Scale size={14} /></span><span>{copy("法律声明、隐私主权与合规保障", "Legal, Privacy & Compliance")}</span><span className="rounded-full border border-teal-500/30 bg-teal-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-teal-300">Legal & Compliance</span></div>
        <p className="text-xs text-slate-400">{copy("OpsPub 遵循本地优先与数据主权原则。敏感凭据由本机安全存储托管，外部通信仅在用户配置并授权后发生。", "OpsPub follows local-first and data sovereignty principles. Sensitive credentials stay in local secure storage and external communication requires user configuration and authorization.")}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1.5 text-[11px]">
        <span className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-400"><ShieldCheck size={12} />{copy("本地优先", "Local first")}</span>
        <span className="flex items-center gap-1 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 font-medium text-blue-300"><Lock size={12} />{copy("系统托管凭据", "Managed credentials")}</span>
        <span className="flex items-center gap-1 rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 font-medium text-purple-300"><FileCheck size={12} />{copy("许可证可审计", "Auditable license")}</span>
      </div>
    </div>

    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {[
        { icon: <Shield size={16} />, color: "text-teal-400", title: copy("数据主权 · 零遥测", "Data sovereignty · Zero telemetry"), body: copy("不内置广告追踪或行为画像。主机凭据只由本机安全存储托管。", "No advertising trackers or behavior profiling. Host credentials stay in local secure storage."), foot: copy("断网可用", "Works offline") },
        { icon: <Bot size={16} />, color: "text-indigo-400", title: copy("AI 通信 · 严格脱敏", "AI communication · Sanitized"), body: copy("发送到模型前进行敏感信息过滤，AI 生成的操作仍需本地策略与用户确认。", "Sensitive data is filtered before model requests. Generated actions still require local policy and user approval."), foot: copy("支持私有模型", "Private models supported") },
        { icon: <AlertTriangle size={16} />, color: "text-amber-400", title: copy("责任界定 · 免责声明", "Responsibility · Disclaimer"), body: copy("软件提供辅助连接与运维能力，用户对命令、审批和最终结果负责。", "The software assists with connectivity and operations; users remain responsible for commands, approvals, and outcomes."), foot: copy("终审权归属用户", "Final approval remains with the user") },
        { icon: <FileCheck size={16} />, color: "text-purple-400", title: copy("许可与知识产权", "Licensing & IP"), body: copy("第三方依赖遵循各自许可证；本项目的完整授权边界以仓库 LICENSE 文件为准。", "Third-party dependencies follow their respective licenses. The repository LICENSE defines this project's authorization terms."), foot: copy("源码可审计", "Source is auditable") },
      ].map((pillar) => <div key={pillar.title} className="space-y-1.5 rounded-xl border border-slate-800 bg-[#141a22] p-3.5 transition hover:border-teal-500/40"><div className={`flex items-center gap-2 text-xs font-bold ${pillar.color}`}>{pillar.icon}<span>{pillar.title}</span></div><p className="text-[11px] leading-relaxed text-slate-300/90">{pillar.body}</p><div className="border-t border-slate-800/80 pt-1 font-mono text-[10px] text-slate-500">{pillar.foot}</div></div>)}
    </div>

    <div className="overflow-hidden rounded-xl border border-slate-800/90 bg-[#121720]">
      <div className="flex gap-1 overflow-x-auto border-b border-slate-800 bg-[#0c1017] p-2">
        {tabs.map((tab) => <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${tabClass(tab.key)}`}>{tab.icon}<span>{copy(tab.label, tab.en)}</span></button>)}
      </div>
      <div className="max-h-72 overflow-y-auto p-4 text-xs leading-relaxed text-slate-300">
        {activeTab === "eula" && <LegalPanel title={copy("OpsPub 桌面客户端最终用户许可协议", "OpsPub Desktop End User License Agreement")} meta={copy("以仓库 LICENSE 文件为准", "See the repository LICENSE file")}>{copy("本软件按现状提供，用于经授权的服务器连接、文件传输和运维管理。您应确保对目标系统拥有合法授权，不得利用本软件实施未授权访问、攻击或违反适用法律法规的行为。", "The software is provided as-is for authorized server connectivity, file transfer, and operations. You must have permission to access target systems and may not use the software for unauthorized access, attacks, or unlawful activity.")}</LegalPanel>}
        {activeTab === "privacy" && <LegalPanel title={copy("数据安全存储与隐私主权声明", "Data Security & Privacy Statement")} meta={copy("本地优先 · 用户可控", "Local first · User controlled")}>{copy("服务器连接、审计记录和应用配置默认保存在本机。密码、私钥等敏感凭据交由系统凭据管理器托管；模型请求只发送用户主动配置并授权的内容。用户可在备份与还原或系统重置中清理本地数据。", "Server connections, audit records, and application settings are stored locally by default. Passwords and private keys are managed by the system credential store. Model requests contain only content configured and authorized by the user. Local data can be removed from Backup & Restore or system reset.")}</LegalPanel>}
        {activeTab === "aiops" && <LegalPanel title={copy("AI 自动化运维安全边界", "AI Operations Safety Boundary")} meta={copy("策略引擎 + 用户审批", "Policy engine + user approval")}>{copy("AI 只生成辅助性的结构化计划。高风险、改动型或无法确认目标的操作会进入策略检查和审批流程；极高风险命令可能被直接拦截。执行前请核对服务器、命令、参数和影响范围。", "AI only generates assistive structured plans. High-risk, mutating, or ambiguous actions go through policy checks and approval; extremely dangerous commands may be blocked. Verify the server, command, arguments, and blast radius before execution.")}</LegalPanel>}
        {activeTab === "sbom" && <LegalPanel title={copy("第三方开源软件与版权声明", "Third-party Open Source & Copyright") } meta={copy("透明审计 · 许可证合规", "Transparent audit · License compliance")}><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{["Tauri 2.x · MIT / Apache-2.0", "React · MIT", "Rust / rusqlite · MIT", "Lucide React · ISC", "Tailwind CSS · MIT", "Model Context Protocol · MIT"].map((item) => <div key={item} className="rounded-lg border border-slate-800 bg-surface-900 p-2 font-mono text-[11px] text-slate-300">{item}</div>)}</div></LegalPanel>}
      </div>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-slate-800 pt-2 text-[11px]">
      <div className="flex items-center gap-2 text-slate-400"><Info size={14} className="text-slate-500" /><span>{copy("安全与合规问题咨询：", "Security & compliance questions: ")}<a className="text-teal-400 hover:underline" href="mailto:security@opspub.dev">security@opspub.dev</a></span></div>
      <div className="flex items-center gap-2"><button type="button" onClick={downloadLegalSummary} className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-surface-850 px-3 py-1.5 text-slate-200 transition hover:bg-surface-750"><Download size={14} className="text-teal-400" />{copy("下载合规说明", "Download compliance summary")}</button><button type="button" onClick={exportComplianceReport} className="flex items-center gap-1.5 rounded-lg border border-teal-500/40 bg-teal-600/20 px-3 py-1.5 font-medium text-teal-300 transition hover:bg-teal-600/30"><ShieldCheck size={14} className="text-teal-400" />{copy("生成本地合规报告", "Generate local compliance report")}</button></div>
    </div>
  </div>;
}

function LegalPanel({ title, meta, children }: { title: string; meta: string; children: ReactNode }) {
  return <div className="space-y-3"><div className="flex flex-col justify-between gap-1 border-b border-slate-800 pb-1.5 font-bold text-white sm:flex-row"><span>{title}</span><span className="font-mono text-[10px] font-normal text-slate-500">{meta}</span></div><div className="border-l-2 border-teal-500/40 pl-2 text-slate-300">{children}</div></div>;
}

function AppTile({ name, desc }: { name: string; desc: string }) {
  const language = useSettingsStore((state) => state.language);
  return <div className="rounded-lg border border-slate-800 bg-surface-900/60 p-3"><div className="text-sm font-semibold text-slate-200">{translateSettings(name, language)}</div><div className="mt-1 text-xs text-slate-500">{translateSettings(desc, language)}</div></div>;
}
