import type { ITheme } from "@xterm/xterm";

export type TerminalTheme = "monokai-pro" | "catppuccin" | "dracula" | "matrix-green";
export type TerminalCursorStyle = "block" | "bar" | "underline";
export type TerminalFontSize = 13 | 14 | 16;
export type TerminalLineHeight = 1.2 | 1.35 | 1.5;

export type TerminalThemeOption = {
  id: TerminalTheme;
  name: string;
  description: string;
  previewBackground: string;
  previewForeground: string;
};

export const TERMINAL_THEMES: Record<TerminalTheme, ITheme> = {
  "monokai-pro": {
    background: "#0c1015", foreground: "#f8f8f2", cursor: "#a6e22e", cursorAccent: "#0c1015",
    selectionBackground: "#49483e", black: "#272822", red: "#f92672", green: "#a6e22e", yellow: "#e6db74",
    blue: "#66d9ef", magenta: "#ae81ff", cyan: "#a1efe4", white: "#f8f8f2", brightBlack: "#75715e",
    brightRed: "#f92672", brightGreen: "#a6e22e", brightYellow: "#e6db74", brightBlue: "#66d9ef",
    brightMagenta: "#ae81ff", brightCyan: "#a1efe4", brightWhite: "#f8f8f2",
  },
  catppuccin: {
    background: "#1e1e2e", foreground: "#cdd6f4", cursor: "#f5e0e6", cursorAccent: "#1e1e2e",
    selectionBackground: "#585b7066", black: "#45475a", red: "#f38ba8", green: "#a6e3a1", yellow: "#f9e2af",
    blue: "#89b4fa", magenta: "#cba6f7", cyan: "#94e2d5", white: "#bac2de", brightBlack: "#585b70",
    brightRed: "#f38ba8", brightGreen: "#a6e3a1", brightYellow: "#f9e2af", brightBlue: "#89b4fa",
    brightMagenta: "#cba6f7", brightCyan: "#94e2d5", brightWhite: "#a6adc8",
  },
  dracula: {
    background: "#282a36", foreground: "#f8f8f2", cursor: "#f8f8f2", cursorAccent: "#282a36",
    selectionBackground: "#44475a", black: "#21222c", red: "#ff5555", green: "#50fa7b", yellow: "#f1fa8c",
    blue: "#bd93f9", magenta: "#ff79c6", cyan: "#8be9fd", white: "#f8f8f2", brightBlack: "#6272a4",
    brightRed: "#ff6e6e", brightGreen: "#69ff94", brightYellow: "#ffffa5", brightBlue: "#d6acff",
    brightMagenta: "#ff92d0", brightCyan: "#a4ffff", brightWhite: "#ffffff",
  },
  "matrix-green": {
    background: "#001408", foreground: "#7dff9c", cursor: "#00ff66", cursorAccent: "#001408",
    selectionBackground: "#0b532666", black: "#001408", red: "#ff5f5f", green: "#00ff66", yellow: "#d8ff5f",
    blue: "#5fffaf", magenta: "#8affc1", cyan: "#00ffff", white: "#d8ffe2", brightBlack: "#356b45",
    brightRed: "#ff8888", brightGreen: "#7dff9c", brightYellow: "#ecff88", brightBlue: "#9bffd0",
    brightMagenta: "#b0ffda", brightCyan: "#88ffff", brightWhite: "#ffffff",
  },
};

export const TERMINAL_THEME_OPTIONS: TerminalThemeOption[] = [
  { id: "monokai-pro", name: "Monokai Pro", description: "深灰底色 + 霓虹高亮", previewBackground: "#0c1015", previewForeground: "#a6e22e" },
  { id: "catppuccin", name: "Catppuccin", description: "柔和莫兰迪色系", previewBackground: "#1e1e2e", previewForeground: "#cba6f7" },
  { id: "dracula", name: "Dracula", description: "经典吸血鬼暗紫", previewBackground: "#282a36", previewForeground: "#ff79c6" },
  { id: "matrix-green", name: "Matrix Green", description: "黑客绿荧光终端", previewBackground: "#001408", previewForeground: "#00ff66" },
];

export const TERMINAL_FONT_SIZE_OPTIONS: Array<{ value: TerminalFontSize; label: string }> = [
  { value: 13, label: "13px（紧凑高效）" },
  { value: 14, label: "14px（推荐）" },
  { value: 16, label: "16px（大屏适中）" },
];

export const TERMINAL_LINE_HEIGHT_OPTIONS: Array<{ value: TerminalLineHeight; label: string }> = [
  { value: 1.35, label: "1.35（标准）" },
  { value: 1.2, label: "1.20（紧密）" },
  { value: 1.5, label: "1.50（宽松）" },
];

export const TERMINAL_CURSOR_OPTIONS: Array<{ value: TerminalCursorStyle; label: string }> = [
  { value: "block", label: "闪烁方块" },
  { value: "bar", label: "垂直光标细线" },
  { value: "underline", label: "静态下划线" },
];
