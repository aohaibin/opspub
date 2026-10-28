import { create } from "zustand";

export type CloseBehavior = "ask" | "minimize" | "exit";
export type TerminalTheme = "opspub-dark" | "high-contrast";

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
  hydrate: (values: Record<string, string>) => void;
}

export const SETTINGS_KEYS = {
  language: "ui.language",
  autoStart: "ui.auto_start",
  startMinimized: "ui.start_minimized",
  closeBehavior: "ui.close_behavior",
  terminalTheme: "ui.terminal_theme",
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
  terminalTheme: "opspub-dark",
  setTerminalTheme: (terminalTheme) => set({ terminalTheme }),
  hydrate: (values) => set({
    language: values[SETTINGS_KEYS.language] === "en-US" ? "en-US" : "zh-CN",
    autoStart: values[SETTINGS_KEYS.autoStart] === "true",
    startMinimized: values[SETTINGS_KEYS.startMinimized] === "true",
    closeBehavior: values[SETTINGS_KEYS.closeBehavior] === "minimize" || values[SETTINGS_KEYS.closeBehavior] === "exit"
      ? (values[SETTINGS_KEYS.closeBehavior] as CloseBehavior)
      : "ask",
    terminalTheme: values[SETTINGS_KEYS.terminalTheme] === "high-contrast" ? "high-contrast" : "opspub-dark",
  }),
}));
