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
import { configApi } from "@/lib/api";
import { useSettingsStore } from "@/store/settings";

function App() {
  const appTheme = useAppStore((s) => s.theme);
  const skin = useAppStore((s) => s.skin);
  const hydrateCredentials = useSshSessionStore((s) => s.hydrateCredentials);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const language = useSettingsStore((s) => s.language);
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
    void configApi.getAll().then((configs) => {
      hydrateSettings(Object.fromEntries(configs.map(({ key, value }) => [key, value])));
    }).catch(() => undefined);
  }, [hydrateSettings]);

  useEffect(() => {
    if (appTheme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) =>
      setSystemTheme(e.matches ? "dark" : "light");
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [appTheme]);

  const resolved = appTheme === "system" ? systemTheme : appTheme;

  // 将 resolved theme 和 skin 原子写入 DOM，驱动 CSS 变量瞬间切换
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", resolved);
    root.setAttribute("data-skin", skin);
    root.classList.toggle("dark", resolved === "dark");
  }, [resolved, skin]);

  const antdTheme = useMemo(
    () => getAntdTheme(resolved, skin),
    [resolved, skin]
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
