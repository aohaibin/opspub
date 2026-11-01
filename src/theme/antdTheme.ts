import type { ThemeConfig } from "antd";
import { theme } from "antd";
import type { SkinId } from "@/store/app";

/**
 * 暗色/亮色主题的共享 token
 * 与 variables.css 设计令牌保持同步
 */
const sharedToken: ThemeConfig["token"] = {
  borderRadius: 8,
  borderRadiusSM: 6,
  borderRadiusLG: 12,
  fontSize: 13,
  controlHeight: 32,
  controlHeightSM: 24,
  controlHeightLG: 40,
};

/** 共享的组件级覆盖 */
const sharedComponents: ThemeConfig["components"] = {
  Button: {
    borderRadius: 6,
  },
  Input: {
    borderRadius: 6,
  },
  Select: {
    borderRadius: 6,
  },
  Modal: {
    borderRadiusLG: 12,
  },
  Table: {
    borderRadius: 6,
  },
};

/** 暗色主题（与 variables.css :root[data-theme="dark"] 同步 - 运维助手风格） */
export const darkTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    ...sharedToken,
    colorPrimary: "#6366f1",
    colorSuccess: "#22c55e",
    colorWarning: "#f59e0b",
    colorError: "#ef4444",
    colorInfo: "#3b82f6",
    colorBgContainer: "#1e293b",
    colorBgElevated: "#334155",
    colorBgLayout: "#0f172a",
    colorText: "#f1f5f9",
    colorTextSecondary: "#94a3b8",
    colorTextTertiary: "#64748b",
    colorBorder: "rgba(255, 255, 255, 0.08)",
    colorBorderSecondary: "rgba(255, 255, 255, 0.04)",
  },
  components: {
    ...sharedComponents,
    Layout: {
      bodyBg: "#0f172a",
      siderBg: "#1e293b",
      headerBg: "rgba(15, 23, 42, 0.95)",
    },
    Menu: {
      darkItemBg: "#1e293b",
      darkItemSelectedBg: "rgba(99, 102, 241, 0.15)",
      darkItemHoverBg: "#334155",
    },
    Card: {
      borderRadiusLG: 12,
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
    },
    Tooltip: {
      colorBgSpotlight: "#334155",
      colorTextLightSolid: "#f1f5f9",
    },
    Table: {
      headerBg: "#1e293b",
      rowHoverBg: "#334155",
    },
  },
};

/** 亮色主题 */
export const lightTheme: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    ...sharedToken,
    colorPrimary: "#315fce",
    colorSuccess: "#22c55e",
    colorWarning: "#a96808",
    colorError: "#c53b46",
    colorInfo: "#2563a8",
    colorBgContainer: "#ffffff",
    colorBgElevated: "#ffffff",
    colorBgLayout: "#f4f7fb",
    colorText: "#0f172a",
    colorTextSecondary: "#526174",
    colorTextTertiary: "#748196",
    colorBorder: "#d7e0eb",
    colorBorderSecondary: "#e7edf4",
  },
  components: {
    ...sharedComponents,
    Layout: {
      bodyBg: "#f4f7fb",
      siderBg: "#ffffff",
      headerBg: "rgba(255, 255, 255, 0.96)",
    },
    Menu: {
      itemBg: "#ffffff",
      itemHoverBg: "#e8eef6",
      itemSelectedBg: "#e4efff",
      itemSelectedColor: "#315fce",
      itemColor: "#526174",
      itemHoverColor: "#172033",
    },
    Card: {
      colorBgContainer: "#ffffff",
      colorBorderSecondary: "#d7e0eb",
      boxShadowTertiary: "0 1px 2px rgba(24, 39, 62, 0.05)",
    },
    Modal: {
      contentBg: "#ffffff",
      headerBg: "#ffffff",
      titleColor: "#0f172a",
    },
    Drawer: {
      colorBgElevated: "#ffffff",
    },
    Input: {
      colorBgContainer: "#ffffff",
      activeBorderColor: "#315fce",
      hoverBorderColor: "#4776e2",
    },
    Select: {
      colorBgContainer: "#ffffff",
      optionSelectedBg: "#e4efff",
      optionActiveBg: "#e8eef6",
    },
    Table: {
      headerBg: "#edf2f8",
      headerColor: "#526174",
      rowHoverBg: "#e8eef6",
      borderColor: "#d7e0eb",
    },
    Tooltip: {
      colorBgSpotlight: "#0f172a",
      colorTextLightSolid: "#ffffff",
    },
  },
};

interface SkinAntdOverrides {
  colorPrimary: string;
  colorBgContainer?: string;
  colorBgElevated?: string;
  colorBgLayout?: string;
}

const SKIN_ANTD_MAP: Record<SkinId, SkinAntdOverrides> = {
  obsidian: {
    colorPrimary: "#34d399",
    colorBgContainer: "#0f172a",
    colorBgElevated: "#1e293b",
    colorBgLayout: "#090d16",
  },
  graphite: {
    colorPrimary: "#818cf8",
    colorBgContainer: "#18181b",
    colorBgElevated: "#27272a",
    colorBgLayout: "#0a0a0b",
  },
  amber: {
    colorPrimary: "#fbbf24",
    colorBgContainer: "#1c1917",
    colorBgElevated: "#292524",
    colorBgLayout: "#12100e",
  },
  sky: {
    colorPrimary: "#3b82f6",
    colorBgContainer: "#ffffff",
    colorBgElevated: "#ffffff",
    colorBgLayout: "#f8fafc",
  },
  warm: {
    colorPrimary: "#f97316",
    colorBgContainer: "#ffffff",
    colorBgElevated: "#ffffff",
    colorBgLayout: "#fffbeb",
  },
  aurora: {
    colorPrimary: "#14b8a6",
    colorBgContainer: "#ffffff",
    colorBgElevated: "#ffffff",
    colorBgLayout: "#f0fdfa",
  },
};

/** 根据 resolved theme 和 skin 获取对应 Ant Design 主题配置 */
export function getAntdTheme(resolved: "light" | "dark", skin?: SkinId): ThemeConfig {
  const base = resolved === "dark" ? darkTheme : lightTheme;
  if (!skin || !SKIN_ANTD_MAP[skin]) return base;

  const overrides = SKIN_ANTD_MAP[skin];
  return {
    ...base,
    token: {
      ...base.token,
      colorPrimary: overrides.colorPrimary,
      ...(overrides.colorBgContainer ? { colorBgContainer: overrides.colorBgContainer } : {}),
      ...(overrides.colorBgElevated ? { colorBgElevated: overrides.colorBgElevated } : {}),
      ...(overrides.colorBgLayout ? { colorBgLayout: overrides.colorBgLayout } : {}),
    },
    components: {
      ...base.components,
      ...(resolved === "dark"
        ? {
            Layout: {
              bodyBg: overrides.colorBgLayout || "#0f172a",
              siderBg: overrides.colorBgContainer || "#1e293b",
              headerBg: overrides.colorBgContainer || "rgba(15, 23, 42, 0.95)",
            },
            Table: {
              headerBg: overrides.colorBgElevated || "#1e293b",
              rowHoverBg: overrides.colorBgElevated || "#334155",
            },
          }
        : {
            Layout: {
              bodyBg: overrides.colorBgLayout || "#f8fafc",
              siderBg: overrides.colorBgContainer || "#ffffff",
              headerBg: overrides.colorBgContainer || "#ffffff",
            },
            Table: {
              headerBg: overrides.colorBgLayout || "#f8fafc",
              rowHoverBg: overrides.colorBgElevated || "#f1f5f9",
            },
          }),
    },
  };
}
