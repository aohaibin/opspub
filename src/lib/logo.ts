export const LOGO_COLORS = [
  { id: "mint", label: "薄荷绿" },
  { id: "tech-blue", label: "科技蓝" },
  { id: "china-red", label: "中国红" },
  { id: "violet", label: "紫罗兰" },
  { id: "warm-orange", label: "暖橙" },
  { id: "graphite", label: "石墨灰" },
] as const;

export type LogoColor = (typeof LOGO_COLORS)[number]["id"];
export type LogoTheme = "dark" | "light";
export const DEFAULT_LOGO_COLOR: LogoColor = "mint";

export function parseLogoColor(value?: string): LogoColor {
  return LOGO_COLORS.find(({ id }) => id === value)?.id ?? DEFAULT_LOGO_COLOR;
}

const logos = import.meta.glob<string>(
  ["/docs/icons/inapp/*-{dark,light}.svg", "/docs/icons/app-icon/*-squircle.svg", "/docs/icons/desktop/*.svg"],
  { eager: true, query: "?url", import: "default" },
);

export const logoUrl = {
  inApp: (color: LogoColor, theme: LogoTheme) => logos[`/docs/icons/inapp/${color}-${theme}.svg`],
  app: (color: LogoColor) => logos[`/docs/icons/app-icon/${color}-squircle.svg`],
  desktop: (color: LogoColor) => logos[`/docs/icons/desktop/${color}.svg`],
};
