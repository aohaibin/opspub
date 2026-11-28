import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { ConfigProvider } from "antd";
import { StyleProvider } from "@ant-design/cssinjs";
import GlobalNativeTooltip from "@/components/GlobalNativeTooltip";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useAppStore } from "@/store";
import { useSshSessionStore } from "@/store/ssh";
import { getAntdTheme } from "@/theme/antdTheme";
import { AppRouter } from "@/Router";
import { logoUrl } from "@/lib/logo";
import { loadSettings, useSettingsStore } from "@/store/settings";

function App() {
  const appTheme = useAppStore((s) => s.theme);
  const skin = useAppStore((s) => s.skin);
  const hydrateCredentials = useSshSessionStore((s) => s.hydrateCredentials);
  const language = useSettingsStore((s) => s.language);
  const logoColor = useSettingsStore((s) => s.logoColor);
  const uiFontSize = useSettingsStore((s) => s.uiFontSize);
  const uiFontFamily = useSettingsStore((s) => s.uiFontFamily);
  const [credentialsReady, setCredentialsReady] = useState(false);
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(() =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
  );

  useEffect(() => {
    let active = true;
    const restoreCredentials = async () => {
      try {
        await hydrateCredentials();
      } finally {
        // 页面必须等系统凭据恢复完成后再挂载，否则终端/SFTP 会把空缓存误判为未验证。
        if (active) setCredentialsReady(true);
      }
    };

    void restoreCredentials();
    return () => {
      active = false;
    };
  }, [hydrateCredentials]);

  useEffect(() => {
    void loadSettings().catch(() => undefined);
  }, []);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) =>
      setSystemTheme(e.matches ? "dark" : "light");
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const resolved = appTheme === "system" ? systemTheme : appTheme;

  // 将 resolved theme 和 skin 原子写入 DOM，驱动 CSS 变量瞬间切换
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", resolved);
    root.setAttribute("data-skin", skin);
    root.classList.toggle("dark", resolved === "dark");
  }, [resolved, skin]);

  useLayoutEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useLayoutEffect(() => {
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (favicon) favicon.href = logoUrl.app(logoColor);
  }, [logoColor]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const scale = uiFontSize / 14;
    const font = (value: number) => `${Math.max(10, Math.round(value * scale))}px`;
    root.style.setProperty("--font-size", `${uiFontSize}px`);
    root.style.setProperty("--font-size-sm", font(12));
    root.style.setProperty("--font-size-lg", font(14));
    root.style.setProperty("--ui-base-font-size", `${uiFontSize}px`);
    root.style.setProperty("--ui-font-scale", scale.toFixed(3));
    root.style.setProperty("--font-ui", uiFontFamily === "rounded"
      ? 'var(--font-rounded-ui)'
      : uiFontFamily === "inter"
        ? 'Inter, "Microsoft YaHei UI", sans-serif'
        : '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans SC", sans-serif');

    // 页面中仍有少量 Tailwind 固定字号，按原型的整数像素阶梯同步覆盖，
    // 终端输出区域继续由终端专属字号设置控制。
    let styleTag = document.getElementById("dynamic-ui-font-scale-style");
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = "dynamic-ui-font-scale-style";
      document.head.appendChild(styleTag);
    }
    styleTag.textContent = `
      #root {
        font-size: ${uiFontSize}px;
      }
      #root .ops-settings-page {
        font-size: ${uiFontSize}px !important;
      }
      #root .text-\\[8px\\],
      #root .text-\\[9px\\] {
        font-size: ${font(10)} !important;
      }
      #root .text-\\[10px\\] {
        font-size: ${font(11)} !important;
      }
      #root .text-\\[11px\\],
      #root .header-tool-tooltip {
        font-size: ${font(12)} !important;
      }
      #root .text-xs {
        font-size: ${font(13)} !important;
      }
      #root .text-sm {
        font-size: ${font(14)} !important;
      }
      #root .text-base {
        font-size: ${font(16)} !important;
      }
      #root .text-lg {
        font-size: ${font(18)} !important;
      }
      #root .text-xl {
        font-size: ${font(20)} !important;
      }
      #root input:not([type="checkbox"]):not([type="radio"]),
      #root select,
      #root textarea {
        font-size: ${font(13)} !important;
      }
    `;

    return () => {
      styleTag?.remove();
    };
  }, [uiFontSize, uiFontFamily]);

  const antdTheme = useMemo(
    () => getAntdTheme(resolved, skin, uiFontSize),
    [resolved, skin, uiFontSize]
  );

  return (
    // StyleProvider layer：把 antd 运行时注入的样式装进 @layer antd。
    // 层顺序由 src/styles/global.css 首行的 @layer 声明决定（antd 排在 utilities 之前），
    // 否则 antd 层会被追加到序列末尾，Tailwind 工具类照样覆盖不了。
    <StyleProvider layer>
      <ConfigProvider locale={language === "en-US" ? enUS : zhCN} theme={antdTheme}>
        <ErrorBoundary>
          {credentialsReady ? (
            <AppRouter />
          ) : (
            <div
              className="flex h-full items-center justify-center"
              style={{ color: "var(--text-secondary)", fontSize: 13 }}
            >
              正在恢复 SSH 凭据…
            </div>
          )}
        </ErrorBoundary>
        <GlobalNativeTooltip />
      </ConfigProvider>
    </StyleProvider>
  );
}

export default App;
