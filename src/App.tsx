import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { ConfigProvider } from "antd";
import { StyleProvider } from "@ant-design/cssinjs";
import GlobalNativeTooltip from "@/components/GlobalNativeTooltip";
import zhCN from "antd/locale/zh_CN";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useAppStore } from "@/store";
import { useSshSessionStore } from "@/store/ssh";
import { getAntdTheme } from "@/theme/antdTheme";
import { AppRouter } from "@/Router";

function App() {
  const appTheme = useAppStore((s) => s.theme);
  const skin = useAppStore((s) => s.skin);
  const hydrateCredentials = useSshSessionStore((s) => s.hydrateCredentials);
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(() =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
  );

  useEffect(() => {
    void hydrateCredentials();
  }, [hydrateCredentials]);

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
      <ConfigProvider locale={zhCN} theme={antdTheme}>
        <ErrorBoundary>
          <AppRouter />
        </ErrorBoundary>
        <GlobalNativeTooltip />
      </ConfigProvider>
    </StyleProvider>
  );
}

export default App;
