import { create } from "zustand";

export type ThemeMode = "light" | "dark" | "system";

/** 解析实际生效的主题（system → 读取系统偏好） */
export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode !== "system") return mode;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/* ────────────────────────────────────────────────────────────
 * 主题皮肤
 * 原型顶栏的调色盘下拉提供 6 套皮肤（3 暗 3 亮），这里如实还原。
 * 皮肤只覆盖 CSS 变量，不改组件结构，因此新增一套皮肤的成本是几十行 CSS。
 * ──────────────────────────────────────────────────────────── */

export type SkinId =
  | "obsidian"
  | "graphite"
  | "amber"
  | "sky"
  | "warm"
  | "aurora";

export interface SkinDef {
  id: SkinId;
  name: string;
  /** 皮肤归属的明暗族，选中皮肤时同步切换 data-theme */
  family: "dark" | "light";
  /** 色卡圆点颜色（原型色卡上的小圆） */
  swatch: string;
  /** 色卡底色，用于在调色盘里预览该皮肤的主背景 */
  preview: string;
}

export const SKINS: SkinDef[] = [
  { id: "obsidian", name: "午夜耀石", family: "dark", swatch: "#34d399", preview: "#090d16" },
  { id: "graphite", name: "石墨暗黑", family: "dark", swatch: "#818cf8", preview: "#0a0a0b" },
  { id: "amber", name: "暮薇暖橙", family: "dark", swatch: "#fbbf24", preview: "#12100e" },
  { id: "sky", name: "晴空素白", family: "light", swatch: "#3b82f6", preview: "#f8fafc" },
  { id: "warm", name: "活力晨光", family: "light", swatch: "#f97316", preview: "#fffbeb" },
  { id: "aurora", name: "极光浅葱", family: "light", swatch: "#14b8a6", preview: "#f0fdfa" },
];

/* ────────────────────────────────────────────────────────────
 * AI 操作锁
 * 原型顶栏的核心安全开关：「关闭时 AI 的一切改动型工具直接拒绝，只读工具仍可用。
 * 到点自动回归锁定。」默认锁定，可限时放行 30m / 2h / 1d / 永久。
 * ──────────────────────────────────────────────────────────── */

export type UnlockDuration = "30m" | "2h" | "1d" | "forever";

export const UNLOCK_DURATIONS: { id: UnlockDuration; label: string }[] = [
  { id: "30m", label: "30m" },
  { id: "2h", label: "2h" },
  { id: "1d", label: "1d" },
  { id: "forever", label: "永久" },
];

/** 档位 → 毫秒；永久档不参与倒计时 */
const DURATION_MS: Record<Exclude<UnlockDuration, "forever">, number> = {
  "30m": 30 * 60 * 1000,
  "2h": 2 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};

export { DURATION_MS };

interface AppStore {
  /* ---- 主题 ---- */
  /** 主题模式（含跟随系统） */
  theme: ThemeMode;
  /** 当前皮肤 */
  skin: SkinId;
  /** 三态切换主题：dark → light → system → dark */
  toggleTheme: () => void;
  /** 设置主题 */
  setTheme: (theme: ThemeMode) => void;
  /** 选中皮肤，同时把主题切到该皮肤所属的明暗族 */
  setSkin: (skin: SkinId) => void;

  /* ---- 当前会话主机（顶栏会话选择器） ---- */
  /** 当前选中的服务器 id；null 表示尚未选择 */
  activeServerId: number | null;
  setActiveServerId: (id: number | null) => void;

  /* ---- AI 操作锁 ---- */
  /** 是否处于锁定态。锁定 = 拒绝 AI 的改动型工具 */
  aiLocked: boolean;
  /** 限时放行的到期时间戳（ms）；null = 未放行 */
  aiUnlockUntil: number | null;
  /** 当前选中的放行档位 */
  aiUnlockDuration: UnlockDuration;
  /** 直接设置锁定态（用户手动拨开关） */
  setAiLocked: (locked: boolean) => void;
  /** Rust 权威状态同步到前端显示；后端才是执行权限的最终判定。 */
  setAiLockState: (locked: boolean, unlockUntil: number | null) => void;
  /** 选择限时放行档位并立即生效 */
  setAiUnlockDuration: (duration: UnlockDuration) => void;
  /** 到点自动回归锁定。由顶栏的定时器调用 */
  syncAiLock: () => void;

  /* ---- 全局搜索 ---- */
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  /* ---- 告警 ---- */
  /**
   * 顶栏铃铛的角标数。
   * 告警模块尚未实现，先固定为原型里的 2；等告警规则落地后改为订阅真实数据。
   */
  activeAlertCount: number;
}

const TOGGLE_ORDER: ThemeMode[] = ["dark", "light", "system"];

const getStoredSkin = (): SkinId => {
  try {
    const s = localStorage.getItem("ops_skin") as SkinId;
    if (SKINS.some((item) => item.id === s)) return s;
  } catch {}
  return "obsidian";
};

const getStoredTheme = (): ThemeMode => {
  try {
    const t = localStorage.getItem("ops_theme") as ThemeMode;
    if (t === "dark" || t === "light" || t === "system") return t;
  } catch {}
  return "dark";
};

export const useAppStore = create<AppStore>((set, get) => ({
  theme: getStoredTheme(),
  skin: getStoredSkin(),
  toggleTheme: () =>
    set((s) => {
      const idx = TOGGLE_ORDER.indexOf(s.theme);
      const next = TOGGLE_ORDER[(idx + 1) % TOGGLE_ORDER.length];
      try {
        localStorage.setItem("ops_theme", next);
      } catch {}
      return { theme: next };
    }),
  setTheme: (theme) => {
    try {
      localStorage.setItem("ops_theme", theme);
    } catch {}
    set({ theme });
  },
  setSkin: (skin) => {
    const def = SKINS.find((s) => s.id === skin);
    const nextTheme = def ? def.family : "dark";
    try {
      localStorage.setItem("ops_skin", skin);
      localStorage.setItem("ops_theme", nextTheme);
    } catch {}
    // 皮肤自带明暗族，选中即同步主题，避免出现「选了亮色皮肤但仍是暗色主题」的错配
    set(def ? { skin, theme: def.family } : { skin });
  },

  activeServerId: null,
  setActiveServerId: (activeServerId) => set({ activeServerId }),

  // 原型默认「AI 操作: 已锁定」
  aiLocked: true,
  aiUnlockUntil: null,
  aiUnlockDuration: "30m",
  setAiLocked: (locked) =>
    set({ aiLocked: locked, aiUnlockUntil: locked ? null : get().aiUnlockUntil }),
  setAiLockState: (locked, unlockUntil) => set({ aiLocked: locked, aiUnlockUntil: unlockUntil }),
  setAiUnlockDuration: (duration) => {
    if (duration === "forever") {
      // 永久放行没有到期时间，倒计时区随之隐藏
      set({ aiUnlockDuration: duration, aiLocked: false, aiUnlockUntil: null });
      return;
    }
    set({
      aiUnlockDuration: duration,
      aiLocked: false,
      aiUnlockUntil: Date.now() + DURATION_MS[duration],
    });
  },
  syncAiLock: () => {
    const { aiLocked, aiUnlockUntil } = get();
    if (aiLocked || aiUnlockUntil === null) return;
    if (Date.now() >= aiUnlockUntil) {
      set({ aiLocked: true, aiUnlockUntil: null });
    }
  },

  commandPaletteOpen: false,
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),

  activeAlertCount: 2,
}));
