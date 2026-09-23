/**
 * 路由表。
 *
 * 两个刻意的改动：
 *
 * 1. createBrowserRouter → createHashRouter。
 *    桌面端打包后走的是 asset 协议，history 模式没有服务端来做 fallback 重写，
 *    刷新或深链会直接 404。AGENTS.md 里约定的也是 HashRouter。
 *
 * 2. `/` 不再指向「首页」。原型没有首页这个概念，首个导航项就是服务器资产，
 *    因此根路径直接重定向到默认模块。
 *
 * 路由由 navigation/modules.ts 驱动：已实现的模块挂真实页面，
 * 其余挂通用占位页，新增模块只需改那一份注册表。
 */

import { createElement, type ComponentType } from "react";
import {
  createHashRouter,
  Navigate,
  RouterProvider,
  useLocation,
  type RouteObject,
} from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  DEFAULT_MODULE_KEY,
  MODULES,
  modulePath,
} from "@/navigation/modules";
import ServersPage from "@/pages/servers";
import WorkbenchPage from "@/pages/workbench";
import TerminalPage from "@/pages/terminal";
import SftpPage from "@/pages/sftp";
import SettingsPage from "@/pages/settings";
import ServerCredentialsPage from "@/pages/credentials/ServerCredentialsPage";
import { ModulePlaceholder } from "@/pages/module";

/** 已实现模块的 key → 页面组件 */
const IMPLEMENTED_PAGES: Record<string, ComponentType> = {
  servers: ServersPage,
  workbench: WorkbenchPage,
  terminal: TerminalPage,
  sftp: SftpPage,
  settings: SettingsPage,
  credentials: ServerCredentialsPage,
};

/** 路由路径按模块注册表的顺序生成，与左侧导航轨严格同序 */
const moduleRoutes: RouteObject[] = MODULES.map((mod) => {
  const Page = IMPLEMENTED_PAGES[mod.key];
  return {
    path: mod.key,
    element: Page ? createElement(Page) : <ModulePlaceholder module={mod} />,
  };
});

/** 兜底页：未知路径给出明确去向，而不是白屏 */
function NotFound() {
  const { pathname } = useLocation();
  return (
    <div className="ops-page flex flex-col items-center justify-center" style={{ gap: 10, minHeight: 320 }}>
      <p style={{ fontSize: 13, color: "var(--text-primary)" }}>
        没有找到路径 <span style={{ fontFamily: "var(--font-mono)" }}>{pathname}</span>
      </p>
      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
        请从左侧导航选择一个模块，或按 Ctrl K 搜索。
      </p>
    </div>
  );
}

const router = createHashRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to={modulePath(DEFAULT_MODULE_KEY)} replace /> },
      ...moduleRoutes,
      { path: "*", element: <NotFound /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
