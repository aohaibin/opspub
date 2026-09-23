import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Empty, Popconfirm, Spin, Tag, message } from "antd";
import {
  CheckCircle2,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
  UserRound,
  Wifi,
} from "lucide-react";
import { getErrorMessage } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";
import { SshConnectModal } from "@/components/server/SshConnectModal";
import { useSshSessionStore } from "@/store/ssh";
import type { Server as ServerRecord, SshCredentials, SshProbeResult } from "@/types";

const statusMeta: Record<string, { label: string; color: "success" | "warning" | "error" | "default" }> = {
  verified: { label: "服务器已验证", color: "success" },
  failed: { label: "上次验证失败", color: "error" },
  host_key_changed: { label: "主机指纹变化", color: "warning" },
  unknown: { label: "尚未验证", color: "default" },
};

function authLabel(server: ServerRecord) {
  return server.auth_type === "key" ? "SSH 私钥" : "SSH 密码";
}

export default function ServerCredentialsPage() {
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeServer, setActiveServer] = useState<ServerRecord | null>(null);
  const credentialsByServer = useSshSessionStore((state) => state.credentialsByServer);
  const setCredentials = useSshSessionStore((state) => state.setCredentials);
  const clearCredentials = useSshSessionStore((state) => state.clearCredentials);

  const loadServers = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      setServers(await serverApi.list());
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadServers();
  }, [loadServers]);

  const connectedCount = useMemo(
    () => servers.filter((server) => Boolean(credentialsByServer[server.id])).length,
    [credentialsByServer, servers],
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadServers(false);
      message.success("服务器凭证状态已刷新");
    } finally {
      setRefreshing(false);
    }
  };

  const handleVerified = async (result: SshProbeResult, credentials: SshCredentials) => {
    if (!activeServer) return;
    setCredentials(activeServer.id, credentials);
    setActiveServer(null);
    await loadServers(false);
    message.success(`${activeServer.alias} 已验证，终端和 SFTP 将复用本次会话`);
    void result;
  };

  const handleForget = (server: ServerRecord) => {
    clearCredentials(server.id);
    message.success(`${server.alias} 的本机会话凭证已清除`);
  };

  return (
    <div className="ops-page flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-5">
      <div className="ops-page-head">
        <div className="min-w-0">
          <h1 className="ops-page-title">
            <KeyRound size={18} style={{ color: "var(--nav-active-icon)" }} />
            <span>服务凭证</span>
            <span className="ops-page-subtitle">（服务器 SSH 凭证金库）</span>
          </h1>
          <p className="ops-page-desc">
            凭证只保存在当前应用进程内存中，页面和 AI 只看到状态与引用，不显示真实密码；应用退出后自动清除。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-md border px-2 py-1 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
            {connectedCount}/{servers.length} 台已托管
          </span>
          <Button icon={<RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />} loading={refreshing} onClick={() => void handleRefresh()}>
            刷新
          </Button>
        </div>
      </div>

      <Alert
        showIcon
        icon={<ShieldCheck size={16} />}
        type="info"
        message="端侧凭证隔离已启用"
        description="SSH 密码、私钥口令只在连接时传给本地 Rust 驱动，并按服务器保存在内存会话中。AI 操作使用服务器引用，不会读取或回传凭证内容。"
      />

      <div className="ops-panel min-h-0 overflow-hidden rounded-xl">
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>服务器凭证</h2>
            <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>验证一次后，终端、SFTP、工作台会话共享同一份内存凭证。</p>
          </div>
          <LockKeyhole size={17} style={{ color: "var(--text-muted)" }} />
        </div>

        {loading ? (
          <div className="flex min-h-[260px] items-center justify-center"><Spin /></div>
        ) : servers.length === 0 ? (
          <div className="py-16"><Empty description="暂无服务器，请先到服务器菜单添加" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead style={{ background: "var(--surface-950)", color: "var(--text-secondary)" }}>
                <tr>
                  <th className="px-4 py-3 font-medium">服务器</th>
                  <th className="px-4 py-3 font-medium">连接地址</th>
                  <th className="px-4 py-3 font-medium">认证方式</th>
                  <th className="px-4 py-3 font-medium">凭证状态</th>
                  <th className="px-4 py-3 font-medium">最近验证</th>
                  <th className="px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {servers.map((server) => {
                  const cached = Boolean(credentialsByServer[server.id]);
                  const meta = statusMeta[server.last_connection_status] ?? statusMeta.unknown;
                  return (
                    <tr key={server.id} className="border-t transition hover:bg-[var(--bg-hover)]" style={{ borderColor: "var(--border-secondary)" }}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--surface-950)", color: "var(--nav-active-icon)" }}>
                            <Server size={15} />
                          </span>
                          <div className="min-w-0">
                            <div className="truncate font-medium" style={{ color: "var(--text-primary)" }}>{server.alias}</div>
                            <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--text-muted)" }}>{server.group || "默认分组"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px]" style={{ color: "var(--text-secondary)" }}>{server.hostname}:{server.port}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                          {server.auth_type === "key" ? <KeyRound size={13} /> : <UserRound size={13} />}
                          {authLabel(server)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {cached ? (
                          <Tag icon={<CheckCircle2 size={12} />} color="success">已托管到本机会话</Tag>
                        ) : (
                          <Tag color={meta.color}>{meta.label}</Tag>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[11px]" style={{ color: "var(--text-muted)" }}>{server.last_connected_at || "尚未验证"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="small" type={cached ? "default" : "primary"} icon={<Wifi size={13} />} onClick={() => setActiveServer(server)}>
                            {cached ? "重新验证" : "连接并托管"}
                          </Button>
                          {cached && (
                            <Popconfirm title="清除本机会话凭证？" description="清除后下次进入终端或 SFTP 需要重新验证，不会删除服务器配置。" okText="清除" cancelText="取消" onConfirm={() => handleForget(server)}>
                              <Button size="small" danger type="text" icon={<Trash2 size={14} />} aria-label={`清除 ${server.alias} 凭证`} />
                            </Popconfirm>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SshConnectModal
        open={activeServer !== null}
        server={activeServer}
        initialCredentials={activeServer ? credentialsByServer[activeServer.id] : undefined}
        onCancel={() => setActiveServer(null)}
        onVerified={handleVerified}
        onStatusChanged={() => loadServers(false)}
      />
    </div>
  );
}

