import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Input, Modal, Select, message, Switch } from "antd";
import { enable as enableAutoStart, disable as disableAutoStart, isEnabled as isAutoStartEnabled } from "@tauri-apps/plugin-autostart";
import {
  AlertTriangle,
  AppWindow,
  Archive,
  Check,
  ClipboardList,
  Copy,
  Database,
  FileText,
  KeyRound,
  Lock,
  Network,
  Palette,
  Power,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal,
  Users,
} from "lucide-react";
import { configApi, getErrorMessage } from "@/lib/api";
import { SETTINGS_KEYS, useSettingsStore, type CloseBehavior, type TerminalTheme } from "@/store/settings";
import { SKINS, useAppStore, type SkinId, type ThemeMode } from "@/store/app";
import { modelServiceApi } from "@/lib/api/model-service";
import type { ModelPreset, ModelProfile, ModelProfileInput, ModelProtocol, ModelVendor } from "@/types";

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
  | "license"
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
    ],
  },
  {
    title: "关于",
    items: [
      { id: "license", label: "授权管理", icon: Shield },
      { id: "legal", label: "法律声明", icon: FileText },
      { id: "community", label: "作者 & 社区", icon: Users },
      { id: "apps", label: "推荐应用", icon: Sparkles },
    ],
  },
];

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingsSection>("language");
  const settings = useSettingsStore();
  const theme = useAppStore((state) => state.theme);
  const skin = useAppStore((state) => state.skin);
  const setTheme = useAppStore((state) => state.setTheme);
  const setSkin = useAppStore((state) => state.setSkin);
  const [autoStartBusy, setAutoStartBusy] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([configApi.getAll(), isAutoStartEnabled()]).then(([configs, enabled]) => {
      if (!alive) return;
      settings.hydrate(Object.fromEntries(configs.map(({ key, value }) => [key, value])));
      if (settings.autoStart !== enabled) settings.setAutoStart(enabled);
    }).catch((error) => {
      if (alive) message.error(getErrorMessage(error));
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    document.documentElement.lang = settings.language;
  }, [settings.language]);

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
      message.success(enabled ? "已加入系统登录启动" : "已取消系统登录启动");
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
    } catch {
      settings.setLanguage(value === "zh-CN" ? "en-US" : "zh-CN");
    }
  }

  async function changeTerminalTheme(value: TerminalTheme) {
    settings.setTerminalTheme(value);
    try {
      await persistSetting(SETTINGS_KEYS.terminalTheme, value);
    } catch {
      settings.setTerminalTheme(value === "opspub-dark" ? "high-contrast" : "opspub-dark");
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
    <div className="flex h-[calc(100vh-82px)] min-h-[620px] w-full overflow-hidden rounded-xl border border-slate-800/80 bg-surface-950/80">
      <aside className="flex w-[230px] shrink-0 flex-col border-r border-slate-800/80 bg-[#0a0e13]/90">
        <div className="shrink-0 border-b border-slate-800/80 px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-teal-500/30 bg-teal-500/10 text-teal-300"><ShieldCheck size={15} /></div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold leading-tight text-white">设置</h1>
              <p className="truncate text-[11px] text-slate-500">系统与 AI 配置中心</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-3 overflow-y-auto p-2.5 text-xs custom-scrollbar">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="border-t border-slate-800/60 pt-2 first:border-0 first:pt-0">
              <div className="px-2 py-1 text-[11px] font-semibold tracking-wide text-slate-500">{group.title}</div>
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
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <main ref={contentRef} className="min-w-0 flex-1 space-y-4 overflow-y-auto bg-surface-950/40 p-5 custom-scrollbar">
        <div className="mb-1 flex items-end justify-between border-b border-slate-800/80 pb-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-400">OpsPub Control Center</p>
            <h2 className="mt-1 text-lg font-bold text-white">系统与 AI 设置</h2>
            <p className="mt-1 text-xs text-slate-400">外观、窗口行为、模型服务与本地安全策略的统一配置面板</p>
          </div>
          <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300">本地配置</span>
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
          <p className="mt-3 text-xs leading-relaxed text-slate-500">关闭后仍可保持后台服务与连接会话，双击托盘图标可以重新打开主窗口。</p>
        </SettingCard>

        <SettingCard id="appearance" icon={<Palette size={15} />} title="外观主题" desc="选择应用皮肤和明暗模式，预览会同步到整个应用。">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {SKINS.map((item) => (
              <button key={item.id} type="button" aria-pressed={skin === item.id} onClick={() => selectSkin(item.id)} className={`rounded-lg border p-2.5 text-left transition ${skin === item.id ? "border-teal-500/60" : "border-slate-800 hover:border-slate-600"}`} style={{ background: item.preview }}>
                <div className="mb-3 h-7 rounded-md border border-white/10" style={{ background: `linear-gradient(135deg, ${item.swatch}55, transparent)` }} />
                <div className="flex items-center justify-between gap-1"><span className="text-[11px] font-semibold" style={{ color: item.family === "light" ? "#334155" : "#e2e8f0" }}>{item.name}</span>{skin === item.id && <Check size={13} className="text-teal-300" />}</div>
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2"><StaticButton active={theme === "system"} onClick={() => selectTheme("system")}>跟随系统</StaticButton><StaticButton active={theme === "dark"} onClick={() => selectTheme("dark")}>暗色</StaticButton><StaticButton active={theme === "light"} onClick={() => selectTheme("light")}>亮色</StaticButton></div>
        </SettingCard>

        <SettingCard id="terminal-theme" icon={<Terminal size={15} />} title="终端主题" desc="终端字体、光标与配色预览。">
          <div className="grid gap-3 md:grid-cols-2"><button type="button" aria-pressed={settings.terminalTheme === "opspub-dark"} onClick={() => void changeTerminalTheme("opspub-dark")} className={`rounded-lg text-left ${settings.terminalTheme === "opspub-dark" ? "ring-1 ring-teal-500" : ""}`}><PreviewTerminal title="OpsPub Dark" background="#090d16" /></button><button type="button" aria-pressed={settings.terminalTheme === "high-contrast"} onClick={() => void changeTerminalTheme("high-contrast")} className={`rounded-lg text-left ${settings.terminalTheme === "high-contrast" ? "ring-1 ring-teal-500" : ""}`}><PreviewTerminal title="High Contrast" background="#000000" /></button></div>
        </SettingCard>

        <SettingCard id="models" icon={<Sparkles size={15} />} title="模型服务" desc="通过 ai-profile 管理服务商预置、模型端点和系统凭据。">
          <ModelServiceSettings />
        </SettingCard>

        <SettingCard id="proxy" icon={<Network size={15} />} title="网络代理" desc="为服务器安装、模型请求和远程访问配置本机代理。">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]"><div className="rounded-lg border border-slate-800 bg-[#0a0e14] px-3 py-2 font-mono text-xs text-slate-400">127.0.0.1:7890</div><StaticButton>保存代理地址</StaticButton></div>
          <p className="mt-2 text-[11px] text-slate-500">留空表示全局禁用，代理凭据由系统凭据管理器托管。</p>
        </SettingCard>

        <SettingCard id="whitelist" icon={<ShieldCheck size={15} />} title="出站地址白名单" desc="限制 AI 和后台服务可以访问的外部地址。">
          <div className="flex flex-wrap gap-2"><Tag text="api.openai.com" /><Tag text="api.anthropic.com" /><Tag text="github.com" /><span className="rounded-md border border-dashed border-slate-700 px-2 py-1 text-[11px] text-slate-500">+ 添加地址</span></div>
        </SettingCard>

        <SettingCard id="ssh-keys" icon={<KeyRound size={15} />} title="SSH 密钥" desc="系统凭据管理器中的 SSH 身份与默认认证方式。">
          <div className="overflow-hidden rounded-lg border border-slate-800"><div className="grid grid-cols-[1fr_120px_90px] border-b border-slate-800 bg-surface-900/70 px-3 py-2 text-[11px] text-slate-500"><span>身份</span><span>类型</span><span>状态</span></div><div className="grid grid-cols-[1fr_120px_90px] px-3 py-2.5 text-xs text-slate-300"><span className="font-mono">系统凭据 · SSH</span><span>密码 / 私钥</span><span className="text-emerald-300">已托管</span></div></div>
        </SettingCard>

        <SettingCard id="lock" icon={<Lock size={15} />} title="主密码 / 应用锁定" desc="保护敏感 SSH 私钥、数据库密码和模型密钥。">
          <div className="grid gap-3 md:grid-cols-2"><div className="rounded-lg border border-slate-800 bg-surface-900/60 p-3"><div className="font-medium text-slate-200">空闲超时自动锁定</div><p className="mt-1 text-[11px] text-slate-500">鼠标键盘无操作后锁定操作台</p><div className="mt-3 rounded-md border border-slate-700 bg-[#0a0e14] px-2.5 py-1.5 text-xs text-slate-300">15 分钟（推荐）</div></div><div className="flex flex-col justify-between rounded-lg border border-slate-800 bg-surface-900/60 p-3"><div><div className="font-medium text-slate-200">应用主密码</div><p className="mt-1 text-[11px] text-slate-500">修改后重新派生本地加密根密钥</p></div><StaticButton>重设主密码</StaticButton></div></div>
        </SettingCard>

        <SettingCard id="blacklist" icon={<AlertTriangle size={15} />} title="命令黑名单" desc="危险命令默认拦截，所有命中记录都会进入审计日志。">
          <div className="overflow-hidden rounded-lg border border-slate-800"><div className="grid grid-cols-[1fr_1fr_80px] border-b border-slate-800 bg-surface-900/70 px-3 py-2 text-[11px] text-slate-500"><span>规则</span><span>说明</span><span>来源</span></div>{[["rm -rf /", "删除根目录", "内置"], ["mkfs.*", "格式化磁盘", "内置"], ["DROP DATABASE", "删除数据库", "内置"]].map(([rule, desc, source]) => <div key={rule} className="grid grid-cols-[1fr_1fr_80px] border-b border-slate-800/60 px-3 py-2 text-xs last:border-0"><span className="font-mono text-rose-300">{rule}</span><span className="text-slate-400">{desc}</span><span className="text-slate-500">{source}</span></div>)}</div>
        </SettingCard>

        <SettingCard id="audit-retention" icon={<ClipboardList size={15} />} title="审计保留" desc="定期清理过期审计行，避免长期运行后本地数据库膨胀。">
          <div className="flex max-w-xs items-center gap-2"><div className="flex flex-1 items-center rounded-lg border border-slate-700 bg-[#0a0e14] px-3 py-2 font-mono text-xs text-slate-300">90 <span className="ml-auto font-sans text-slate-500">天</span></div><StaticButton>保存</StaticButton></div>
        </SettingCard>

        <SettingCard id="backup" icon={<Archive size={15} />} title="备份与还原" desc="服务器连接、审计日志与本地配置可打包为加密归档。">
          <div className="flex flex-wrap gap-2"><StaticButton>导出本地加密数据包</StaticButton><StaticButton>从备份文件还原工作区</StaticButton></div>
        </SettingCard>

        <SettingCard id="mobile-pairing" icon={<Smartphone size={15} />} title="手机配对" desc="配对移动端审批助手，接收高风险操作通知。">
          <div className="flex items-center gap-4"><div className="flex h-24 w-24 items-center justify-center rounded-xl bg-white text-center font-mono text-[9px] text-slate-900">[ QR CODE ]</div><div><div className="font-semibold text-slate-200">暂无已绑定设备</div><p className="mt-1 text-xs text-slate-500">扫描二维码后接收审批通知</p><StaticButton className="mt-2">刷新配对码</StaticButton></div></div>
        </SettingCard>

        <SettingCard id="license" icon={<Shield size={15} />} title="授权管理" desc="查看当前版本授权状态与设备绑定信息。">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-500/25 bg-teal-500/5 p-4"><div><div className="font-semibold text-white">OpsPub Community</div><p className="mt-1 text-xs text-slate-400">本地运行 · 无需在线授权</p></div><span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">有效</span></div>
        </SettingCard>

        <SettingCard id="legal" icon={<FileText size={15} />} title="法律声明与隐私保障" desc="全量数据优先驻留本地，未经授权不向外部发送敏感信息。">
          <div className="grid gap-2 sm:grid-cols-3"><Metric label="数据存储" value="本地优先" /><Metric label="敏感凭据" value="系统托管" /><Metric label="遥测" value="默认关闭" /></div>
        </SettingCard>

        <SettingCard id="community" icon={<Users size={15} />} title="作者 & 社区" desc="获取项目更新、问题反馈和使用帮助。">
          <div className="flex flex-wrap gap-2"><Tag text="GitHub / opspub" /><Tag text="问题反馈" /><Tag text="版本更新" /></div>
        </SettingCard>

        <SettingCard id="apps" icon={<Sparkles size={15} />} title="推荐应用" desc="与 OpsPub 配合使用的终端、编辑器和安全工具。">
          <div className="grid gap-2 sm:grid-cols-3"><AppTile name="Windows Terminal" desc="终端会话" /><AppTile name="VS Code" desc="配置与脚本" /><AppTile name="1Password" desc="凭据托管" /></div>
        </SettingCard>
      </main>
    </div>
  );
}

function SettingCard({ id, icon, title, desc, children }: { id: SettingsSection; icon: ReactNode; title: string; desc: string; children: ReactNode }) {
  return <section data-settings-section={id} className="scroll-mt-5 rounded-xl border border-slate-800/80 bg-[#0f141c] p-4 shadow-lg sm:p-5"><div className="flex items-start gap-2"><span className="mt-0.5 text-teal-400">{icon}</span><div><h3 className="text-sm font-semibold text-white">{title}</h3><p className="mt-1 text-xs leading-relaxed text-slate-400">{desc}</p></div></div><div className="mt-4">{children}</div></section>;
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

function ModelServiceSettings() {
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
    setModalOpen(true);
  }

  function openEdit(profile: ModelProfile) {
    setDraft({ id: profile.id, name: profile.name, presetKey: profile.presetKey, protocol: profile.protocol, baseUrl: profile.baseUrl, model: profile.model, extra: profile.extra, apiKey: "" });
    setModelOptions([]);
    setModalOpen(true);
  }

  function choosePreset(key: string | null) {
    const preset = presets.find((item) => item.key === key);
    if (!preset) {
      setDraft((current) => ({ ...current, presetKey: null }));
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
  }

  function toInput(value = draft): ModelProfileInput {
    return { id: value.id, name: value.name.trim(), presetKey: value.presetKey, protocol: value.protocol, baseUrl: value.baseUrl.trim(), model: value.model.trim(), extra: value.extra, apiKey: value.apiKey, enabled: true };
  }

  async function save() {
    if (!draft.name.trim()) { message.warning("请填写配置名称"); return; }
    if (!draft.baseUrl.trim() && !draft.presetKey) { message.warning("请填写接口地址"); return; }
    setSaving(true);
    try {
      await modelServiceApi.saveProfile(toInput());
      message.success("模型服务配置已保存");
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
        if (outcome.result.models.length > 0 && !returnedModels.includes(draft.model)) {
          setDraft((current) => ({ ...current, model: returnedModels[0] }));
        }
        message.success(`连接成功 · ${outcome.result.latencyMs} ms，已获取 ${returnedModels.length} 个模型`);
        if (outcome.result.dropped > 0) message.info(`已过滤 ${outcome.result.dropped} 个非对话模型`);
        if (!outcome.result.modelInList) message.warning("当前模型不在服务商返回的清单中，请确认模型名称");
        return;
      }
      const error = outcome.error;
      if (!error) { message.error("模型服务验证失败"); return; }
      switch (error.code) {
        case "not_found":
          if (error.suggested_url) {
            Modal.confirm({ title: "接口地址不存在", content: `可尝试服务商建议的地址：${error.suggested_url}`, okText: "应用建议地址", cancelText: "稍后处理", onOk: () => setDraft((current) => ({ ...current, baseUrl: error.suggested_url ?? current.baseUrl })) });
          } else message.error(`接口地址不存在：${error.requested_url}`);
          break;
        case "model_not_found":
          setModelOptions(error.available);
          message.warning("当前模型名称无效，已载入服务端可用模型");
          break;
        case "missing_extra_field":
          message.error(`请填写服务商要求的字段：${error.key}`);
          break;
        case "unreachable":
          message.error(error.proxy_hint ? "无法连接到服务商；该站点可能需要配置网络代理" : "无法连接到模型服务，请检查地址和网络后重试");
          break;
        case "auth_failed":
          message.error(`密钥验证失败：${error.detail}`);
          break;
        case "protocol_mismatch":
          message.error(`该密钥要求 ${error.expect} 协议，请选择匹配的服务商预置`);
          break;
        default:
          message.error("模型服务返回了无法识别的响应，请检查配置");
      }
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setTesting(false);
    }
  }

  async function remove(profile: ModelProfile) {
    Modal.confirm({ title: "删除模型服务配置", content: `确定删除“${profile.name}”及其系统托管密钥吗？`, okText: "删除", okButtonProps: { danger: true }, cancelText: "取消", onOk: async () => {
      try { await modelServiceApi.deleteProfile(profile.id); message.success("配置已删除"); await loadData(); }
      catch (error) { message.error(getErrorMessage(error)); }
    } });
  }

  async function exportProfile(profile: ModelProfile) {
    try {
      const text = await modelServiceApi.exportProfile(profile.id);
      Modal.confirm({
        title: "复制 ai.profile 配置",
        content: profile.hasApiKey
          ? "导出内容包含明文 API 密钥，仅复制到剪贴板，不会写入本地文件。请确认剪贴板使用完后及时清理。"
          : "该配置未托管 API 密钥，将复制不含密钥的 ai.profile 配置。",
        okText: "复制配置",
        cancelText: "取消",
        onOk: async () => {
          await navigator.clipboard.writeText(text);
          message.success("ai.profile 已复制到剪贴板");
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
      message.success(`已导入 ${imported.profiles.length} 条模型服务配置${imported.skipped > 0 ? `，跳过 ${imported.skipped} 条不兼容配置` : ""}`);
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
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="text-xs text-slate-400">{profiles.length} 条配置 · API 密钥由系统凭据管理器托管</div>
      <div className="flex gap-2"><Button size="small" onClick={() => setImportOpen(true)}>粘贴导入</Button><Button size="small" type="primary" onClick={openNew}>新增模型服务</Button></div>
    </div>
    {loading ? <div className="rounded-lg border border-slate-800 px-3 py-6 text-center text-xs text-slate-500">正在读取模型服务配置...</div> : profiles.length === 0 ? <div className="rounded-lg border border-dashed border-slate-700 px-3 py-7 text-center"><div className="text-xs font-medium text-slate-300">尚未配置模型服务</div><p className="mt-1 text-[11px] text-slate-500">添加后可在此管理、验证和导出模型配置。</p></div> : <div className="divide-y divide-slate-800 overflow-hidden rounded-lg border border-slate-800">
      {profiles.map((profile) => <div key={profile.id} className="flex flex-wrap items-center justify-between gap-3 bg-surface-950/50 px-3 py-3">
        <div className="min-w-[220px] flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-xs text-slate-200">{profile.name}</strong><span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">{profile.protocol === "anthropic" ? "Anthropic" : "OpenAI 兼容"}</span>{profile.hasApiKey ? <span className="text-[10px] text-emerald-400">密钥已托管</span> : <span className="text-[10px] text-amber-400">未配置密钥</span>}</div><div className="mt-1 truncate font-mono text-[11px] text-slate-500">{profile.model || "未选择模型"} · {profile.baseUrl || "使用预置端点"}</div></div>
        <div className="flex items-center gap-1"><Button type="text" size="small" icon={<Copy size={13} />} onClick={() => void exportProfile(profile)}>导出</Button><Button type="text" size="small" onClick={() => openEdit(profile)}>编辑</Button><Button type="text" size="small" danger onClick={() => void remove(profile)}>删除</Button></div>
      </div>)}
    </div>}

    <Modal title={draft.id ? "编辑模型服务" : "新增模型服务"} open={modalOpen} width={620} centered maskClosable={false} onCancel={() => setModalOpen(false)} onOk={() => void save()} confirmLoading={saving} okText="保存配置" cancelText="取消" footer={<div className="flex justify-between"><Button loading={testing} disabled={requiredExtraMissing} onClick={() => void verify()}>测试连接并获取模型</Button><div className="flex gap-2"><Button onClick={() => setModalOpen(false)}>取消</Button><Button type="primary" loading={saving} onClick={() => void save()}>保存配置</Button></div></div>}>
      <div className="max-h-[65vh] space-y-3 overflow-y-auto py-2 pr-1">
        <label className="block text-xs text-slate-400">配置名称<Input className="mt-1" value={draft.name} placeholder="例如：DeepSeek 主账号" onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
        <label className="block text-xs text-slate-400">服务商预置<Select allowClear showSearch optionFilterProp="label" className="mt-1 w-full" value={draft.presetKey ?? undefined} options={groupedPresetOptions} placeholder="选择服务商，或留空使用自定义端点" onChange={(key: string | undefined) => choosePreset(key ?? null)} /></label>
        {draft.presetKey && (() => { const selected = presets.find((preset) => preset.key === draft.presetKey); return selected ? <div className="rounded-md border border-slate-800 bg-surface-950/60 px-3 py-2 text-[11px] text-slate-500">{selected.isLocal ? "本地服务：请先启动模型服务。" : selected.applyUrl ? <a className="text-teal-400 hover:text-teal-300" href={selected.applyUrl} target="_blank" rel="noreferrer">前往服务商申请密钥</a> : "官方服务端点"}{selected.verifiedAt ? ` · 预置核实于 ${selected.verifiedAt}` : " · 预置尚未实际核实"}</div> : null; })()}
        <label className="block text-xs text-slate-400">接口地址<Input className="mt-1 font-mono" value={draft.baseUrl} placeholder="保留服务商要求的完整版本路径，不会自动补 /v1" onChange={(event) => setDraft((current) => ({ ...current, baseUrl: event.target.value }))} /></label>
        <label className="block text-xs text-slate-400">API 密钥<Input.Password className="mt-1" value={draft.apiKey} placeholder={draft.id ? "留空以保留已托管密钥" : "本地无鉴权服务可留空"} onChange={(event) => setDraft((current) => ({ ...current, apiKey: event.target.value }))} autoComplete="new-password" /></label>
        <label className="block text-xs text-slate-400">模型名称{modelOptions.length ? <Select showSearch optionFilterProp="label" className="mt-1 w-full" value={draft.model || undefined} options={modelOptions.map((model) => ({ label: model, value: model }))} onChange={(model) => setDraft((current) => ({ ...current, model }))} /> : <Input className="mt-1 font-mono" value={draft.model} placeholder="可先测试连接获取模型清单" onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))} />}</label>
        {draft.presetKey && presets.find((preset) => preset.key === draft.presetKey)?.extraFields.map((field) => <label key={field.key} className="block text-xs text-slate-400">{field.label}{field.required && <span className="ml-1 text-rose-400">必填</span>}<Input className="mt-1" value={draft.extra[field.key] ?? ""} placeholder={field.placeholder ?? ""} onChange={(event) => setDraft((current) => ({ ...current, extra: { ...current.extra, [field.key]: event.target.value } }))} /></label>)}
        {modelOptions.length > 0 && <p className="text-[11px] text-slate-500">已获取 {modelOptions.length} 个可用模型。验证只请求模型列表，不会发起生成请求。</p>}
      </div>
    </Modal>

    <Modal title="粘贴 ai.profile 配置" open={importOpen} width={560} centered maskClosable={false} onCancel={() => setImportOpen(false)} onOk={() => void importProfiles()} confirmLoading={importing} okText="导入并托管密钥" cancelText="取消">
      <p className="mb-2 text-xs text-slate-500">支持单条 `ai.profile` 和 `ai.profile.bundle`。导入密钥后只保存到系统凭据管理器，不会写入配置文本。</p>
      <Input.TextArea rows={10} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="粘贴模型服务 JSON 配置" />
    </Modal>
  </div>;
}

function StaticButton({ active = false, children, className = "", onClick }: { active?: boolean; children: ReactNode; className?: string; onClick?: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-lg border px-3.5 py-1.5 text-xs font-medium transition ${active ? "border-teal-500/50 bg-teal-500/20 text-teal-200" : "border-slate-700 bg-surface-900 text-slate-300 hover:border-slate-600 hover:text-white"} ${className}`}>{children}</button>;
}

function ToggleRow({ label, desc, checked, onChange, disabled = false, loading = false }: { label: string; desc: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; loading?: boolean }) {
  return <div className={`flex items-center gap-3 ${disabled ? "opacity-50" : ""}`}><span className="w-32 shrink-0 text-xs text-slate-300">{label}</span><Switch size="small" checked={checked} loading={loading} disabled={disabled} onChange={onChange} /><span className="text-xs text-slate-500">{desc}</span></div>;
}

function PreviewTerminal({ title, background }: { title: string; background: string }) {
  return <div className="rounded-lg border border-slate-800 p-3" style={{ background }}><div className="mb-2 flex items-center justify-between text-[11px] text-slate-400"><span>{title}</span><span className="font-mono">bash</span></div><pre className="font-mono text-[11px] leading-relaxed text-emerald-300">$ ssh opspub@server{`\n`}Connected · ready for commands{`\n`}$ _</pre></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-800 bg-surface-900/60 px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-xs font-medium text-slate-200">{value}</div></div>;
}

function Tag({ text }: { text: string }) {
  return <span className="rounded-md border border-slate-700 bg-surface-900 px-2 py-1 text-[11px] text-slate-300">{text}</span>;
}

function AppTile({ name, desc }: { name: string; desc: string }) {
  return <div className="rounded-lg border border-slate-800 bg-surface-900/60 p-3"><div className="text-xs font-semibold text-slate-200">{name}</div><div className="mt-1 text-[11px] text-slate-500">{desc}</div></div>;
}
