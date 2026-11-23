import { create } from "zustand";
import { disable as disableAutoStart, enable as enableAutoStart, isEnabled as isAutoStartEnabled } from "@tauri-apps/plugin-autostart";
import { configApi } from "@/lib/api/config";
import type { TerminalCursorStyle, TerminalFontSize, TerminalLineHeight, TerminalTheme } from "@/components/terminal/terminal-themes";

export type CloseBehavior = "ask" | "minimize" | "exit";
export type { TerminalCursorStyle, TerminalFontSize, TerminalLineHeight, TerminalTheme } from "@/components/terminal/terminal-themes";

type AutoStartStatus = "loading" | "ready" | "saving" | "unavailable";
type AutoStartSaveResult = "saved" | "ignored" | unknown[];

interface SettingsStore {
  language: "zh-CN" | "en-US";
  setLanguage: (language: "zh-CN" | "en-US") => void;
  autoStart: boolean | null;
  storedAutoStart: boolean;
  autoStartStatus: AutoStartStatus;
  refreshAutoStart: (configRead: Promise<void>) => Promise<void>;
  saveAutoStart: (enabled: boolean) => Promise<AutoStartSaveResult>;
  startMinimized: boolean;
  setStartMinimized: (enabled: boolean) => void;
  closeBehavior: CloseBehavior;
  setCloseBehavior: (behavior: CloseBehavior) => void;
  terminalTheme: TerminalTheme;
  setTerminalTheme: (theme: TerminalTheme) => void;
  terminalFontSize: TerminalFontSize;
  setTerminalFontSize: (fontSize: TerminalFontSize) => void;
  terminalLineHeight: TerminalLineHeight;
  setTerminalLineHeight: (lineHeight: TerminalLineHeight) => void;
  terminalCursorStyle: TerminalCursorStyle;
  setTerminalCursorStyle: (cursorStyle: TerminalCursorStyle) => void;
  proxyAddress: string;
  setProxyAddress: (address: string) => void;
  outboundHosts: string[];
  setOutboundHosts: (hosts: string[]) => void;
  outboundEnabled: boolean;
  setOutboundEnabled: (enabled: boolean) => void;
  hydrate: (values: Record<string, string>) => void;
}

export const SETTINGS_KEYS = {
  language: "ui.language",
  autoStart: "ui.auto_start",
  startMinimized: "ui.start_minimized",
  closeBehavior: "ui.close_behavior",
  terminalTheme: "ui.terminal_theme",
  terminalFontSize: "ui.terminal_font_size",
  terminalLineHeight: "ui.terminal_line_height",
  terminalCursorStyle: "ui.terminal_cursor_style",
  proxyAddress: "network.proxy_address",
  outboundHosts: "network.outbound_hosts",
  outboundEnabled: "network.outbound_enabled",
} as const;

let autoStartReadId = 0;

function applySystemAutoStart(enabled: boolean): Promise<void> {
  return enabled ? enableAutoStart() : disableAutoStart();
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  language: "zh-CN",
  setLanguage: (language) => set({ language }),
  autoStart: null,
  storedAutoStart: false,
  autoStartStatus: "loading",
  refreshAutoStart: async (configRead) => {
    // 保存期间系统可能处于中间状态，新页面直接订阅保存的最终结果。
    if (get().autoStartStatus === "saving") return;
    const readId = ++autoStartReadId;
    set({ autoStartStatus: "loading" });
    const [, system] = await Promise.allSettled([configRead, isAutoStartEnabled()]);
    if (readId !== autoStartReadId) return;
    if (system.status === "fulfilled") {
      set({ autoStart: system.value, autoStartStatus: "ready" });
    } else {
      set({ autoStartStatus: "unavailable" });
      throw system.reason;
    }
  },
  saveAutoStart: async (enabled) => {
    const { autoStart: previous, autoStartStatus } = get();
    if (autoStartStatus !== "ready" || previous === null || enabled === previous) return "ignored";

    set({ autoStartStatus: "saving" });
    let current = previous;
    let status: AutoStartStatus = "ready";
    try {
      await applySystemAutoStart(enabled);
      try {
        await configApi.set(SETTINGS_KEYS.autoStart, String(enabled));
      } catch (writeError) {
        // 配置拒绝后仍持有保存状态，直到补偿结束或重新确认系统状态。
        try {
          await applySystemAutoStart(previous);
        } catch (restoreError) {
          try {
            current = await isAutoStartEnabled();
          } catch (readError) {
            status = "unavailable";
            return [writeError, restoreError, readError];
          }
          return [writeError, restoreError];
        }
        return [writeError];
      }
      current = enabled;
      return "saved";
    } catch (systemError) {
      return [systemError];
    } finally {
      set({ autoStart: current, autoStartStatus: status });
    }
  },
  startMinimized: false,
  setStartMinimized: (startMinimized) => set({ startMinimized }),
  closeBehavior: "ask",
  setCloseBehavior: (closeBehavior) => set({ closeBehavior }),
  terminalTheme: "monokai-pro",
  setTerminalTheme: (terminalTheme) => set({ terminalTheme }),
  terminalFontSize: 14,
  setTerminalFontSize: (terminalFontSize) => set({ terminalFontSize }),
  terminalLineHeight: 1.35,
  setTerminalLineHeight: (terminalLineHeight) => set({ terminalLineHeight }),
  terminalCursorStyle: "block",
  setTerminalCursorStyle: (terminalCursorStyle) => set({ terminalCursorStyle }),
  proxyAddress: "",
  setProxyAddress: (proxyAddress) => set({ proxyAddress }),
  outboundHosts: [],
  setOutboundHosts: (outboundHosts) => set({ outboundHosts }),
  outboundEnabled: false,
  setOutboundEnabled: (outboundEnabled) => set({ outboundEnabled }),
  hydrate: (values) => set({
    language: values[SETTINGS_KEYS.language] === "en-US" ? "en-US" : "zh-CN",
    storedAutoStart: values[SETTINGS_KEYS.autoStart] === "true",
    startMinimized: values[SETTINGS_KEYS.startMinimized] === "true",
    closeBehavior: values[SETTINGS_KEYS.closeBehavior] === "minimize" || values[SETTINGS_KEYS.closeBehavior] === "exit"
      ? (values[SETTINGS_KEYS.closeBehavior] as CloseBehavior)
      : "ask",
    terminalTheme: values[SETTINGS_KEYS.terminalTheme] === "high-contrast"
      ? "matrix-green"
      : values[SETTINGS_KEYS.terminalTheme] === "opspub-dark"
        ? "monokai-pro"
        : values[SETTINGS_KEYS.terminalTheme] === "catppuccin" || values[SETTINGS_KEYS.terminalTheme] === "dracula" || values[SETTINGS_KEYS.terminalTheme] === "matrix-green"
          ? values[SETTINGS_KEYS.terminalTheme] as TerminalTheme
          : "monokai-pro",
    terminalFontSize: values[SETTINGS_KEYS.terminalFontSize] === "13" || values[SETTINGS_KEYS.terminalFontSize] === "16"
      ? Number(values[SETTINGS_KEYS.terminalFontSize]) as TerminalFontSize
      : 14,
    terminalLineHeight: values[SETTINGS_KEYS.terminalLineHeight] === "1.2" || values[SETTINGS_KEYS.terminalLineHeight] === "1.5"
      ? Number(values[SETTINGS_KEYS.terminalLineHeight]) as TerminalLineHeight
      : 1.35,
    terminalCursorStyle: values[SETTINGS_KEYS.terminalCursorStyle] === "bar" || values[SETTINGS_KEYS.terminalCursorStyle] === "underline"
      ? values[SETTINGS_KEYS.terminalCursorStyle] as TerminalCursorStyle
      : "block",
    proxyAddress: values[SETTINGS_KEYS.proxyAddress] ?? "",
    outboundHosts: (() => {
      try {
        const parsed: unknown = JSON.parse(values[SETTINGS_KEYS.outboundHosts] ?? "[]");
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
      } catch {
        return [];
      }
    })(),
    outboundEnabled: values[SETTINGS_KEYS.outboundEnabled] === "true",
  }),
}));

let settingsRead: Promise<void> | undefined;

export function loadSettings(): Promise<void> {
  // 应用和设置页共用同一次在途读取，避免旧快照在页面可写后再次回填。
  settingsRead ??= configApi.getAll().then((configs) => {
    const values = Object.fromEntries(configs.map(({ key, value }) => [key, value]));
    useSettingsStore.getState().hydrate(values);
  }).finally(() => {
    settingsRead = undefined;
  });
  return settingsRead;
}
