import { create } from "zustand";
export type CloseBehavior = "ask" | "minimize" | "exit";
import type { TerminalCursorStyle, TerminalFontSize, TerminalLineHeight, TerminalTheme } from "@/components/terminal/terminal-themes";
export type { TerminalCursorStyle, TerminalFontSize, TerminalLineHeight, TerminalTheme } from "@/components/terminal/terminal-themes";

interface SettingsStore {
  language: "zh-CN" | "en-US";
  setLanguage: (language: "zh-CN" | "en-US") => void;
  autoStart: boolean;
  setAutoStart: (enabled: boolean) => void;
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

export const useSettingsStore = create<SettingsStore>((set) => ({
  language: "zh-CN",
  setLanguage: (language) => set({ language }),
  autoStart: false,
  setAutoStart: (autoStart) => set({ autoStart }),
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
    autoStart: values[SETTINGS_KEYS.autoStart] === "true",
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
