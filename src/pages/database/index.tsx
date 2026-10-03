import { useCallback, useEffect, useMemo, useState } from "react";
import { message } from "antd";
import { getErrorMessage } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";
import { workbenchApi, type WorkbenchCommandResult } from "@/lib/api/workbench";
import { useAppStore } from "@/store/app";
import { useSshSessionStore } from "@/store/ssh";
import type { Server } from "@/types";
import { WorkbenchRuntimeContext, type WorkbenchRuntime } from "@/pages/workbench/context";
import { DatabaseView } from "@/pages/workbench/views/DatabaseView";

/**
 * 最外层数据库菜单的运行时适配。
 *
 * 数据库查询本身通过 databaseApi 完成，MongoDB 的集合探查还需要一个 SSH
 * 命令通道。这里复用工作台已有的运行时协议，但不渲染工作台的二级导航，
 * 因而最外层数据库菜单与原型的独立双栏布局保持一致。
 */
export default function DatabasePage() {
  const [servers, setServers] = useState<Server[]>([]);
  const activeServerId = useAppStore((state) => state.activeServerId);
  const credentialsByServer = useSshSessionStore((state) => state.credentialsByServer);

  useEffect(() => {
    let cancelled = false;
    void serverApi.list()
      .then((items) => {
        if (!cancelled) setServers(items);
      })
      .catch((error) => {
        if (!cancelled) message.error(getErrorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedServer = useMemo(
    () => servers.find((server) => server.id === activeServerId) ?? servers[0] ?? null,
    [activeServerId, servers],
  );

  const runCommand = useCallback(
    (command: string): Promise<WorkbenchCommandResult> => {
      if (!selectedServer) {
        return Promise.reject(new Error("请先在服务器菜单配置服务器"));
      }
      // 凭据只传“已托管”标记，Rust 会从系统凭据管理器读取真实内容。
      return workbenchApi.execute({
        serverId: selectedServer.id,
        command,
        ...(credentialsByServer[selectedServer.id] ?? {}),
      });
    },
    [credentialsByServer, selectedServer],
  );

  const runtime = useMemo<WorkbenchRuntime>(
    () => ({
      server: selectedServer,
      connected: Boolean(selectedServer && credentialsByServer[selectedServer.id]),
      openConnection: () => {
        message.info("请先在服务器菜单完成 SSH 验证");
      },
      runCommand,
    }),
    [credentialsByServer, runCommand, selectedServer],
  );

  return (
    <div className="h-full min-h-0 w-full overflow-hidden">
      <WorkbenchRuntimeContext.Provider value={runtime}>
        <DatabaseView />
      </WorkbenchRuntimeContext.Provider>
    </div>
  );
}
