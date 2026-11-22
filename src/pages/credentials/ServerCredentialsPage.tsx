import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Descriptions, Empty, Input, Modal, Select, Spin, Tag, message } from "antd";
import { KeyRound, Plus, RefreshCw, Search, Server, Trash2, Wifi } from "lucide-react";
import { SshConnectModal } from "@/components/server/SshConnectModal";
import { serverApi } from "@/lib/api/server";
import { serverImportApi } from "@/lib/api/server-import";
import { useSshSessionStore } from "@/store/ssh";
import type { Server as ServerRecord } from "@/types";

const verificationStatus: Record<string, { label: string; color?: string }> = {
  verified: { label: "服务器已验证", color: "success" },
  failed: { label: "上次验证失败", color: "error" },
  host_key_changed: { label: "主机指纹变化", color: "warning" },
  unknown: { label: "尚未验证" },
};

function usesKeyring(server: ServerRecord) {
  return server.protocol !== "rdp" && server.auth_type !== "agent";
}

function authLabel(server: ServerRecord) {
  if (server.protocol === "rdp") return "远程桌面";
  if (server.auth_type === "agent") return "SSH Agent";
  return server.auth_type === "key" ? "SSH 私钥" : "SSH 密码";
}

function CredentialStatus({ server, saved, unavailable }: { server: ServerRecord; saved: boolean; unavailable: boolean }) {
  if (server.protocol === "rdp") return <Tag>由系统客户端登录</Tag>;
  if (!usesKeyring(server)) return <Tag>由 SSH Agent 提供</Tag>;
  if (unavailable) return <Tag color="warning">状态不可用</Tag>;
  return saved ? <Tag color="success">已托管</Tag> : <Tag>未托管</Tag>;
}

function VerificationStatus({ server }: { server: ServerRecord }) {
  if (server.protocol === "rdp") return <span>不适用</span>;
  const status = Object.prototype.hasOwnProperty.call(verificationStatus, server.last_connection_status)
    ? verificationStatus[server.last_connection_status]
    : verificationStatus.unknown;
  return <Tag color={status.color}>{status.label}</Tag>;
}

const endpoint = (server: ServerRecord) => `${server.hostname}:${server.port}`;
const groupOf = (server: ServerRecord) => server.group || "默认分组";

export default function ServerCredentialsPage() {
  const [servers, setServers] = useState<ServerRecord[] | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [serverReadFailed, setServerReadFailed] = useState(false);
  const [credentialReadFailed, setCredentialReadFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>();
  const [detailId, setDetailId] = useState<number>();
  const [adding, setAdding] = useState(false);
  const [addId, setAddId] = useState<number>();
  const [verifying, setVerifying] = useState<ServerRecord | null>(null);
  const [forgetOpen, setForgetOpen] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const [forgetFailed, setForgetFailed] = useState(false);
  const [feedback, feedbackHolder] = message.useMessage();
  const credentialsByServer = useSshSessionStore((state) => state.credentialsByServer);
  const loadInFlight = useRef<Promise<boolean> | null>(null);

  const reload = useCallback(() => {
    if (loadInFlight.current) return loadInFlight.current;
    setRefreshing(true);
    const request = Promise.allSettled([
      serverApi.list(),
      useSshSessionStore.getState().refreshCredentials(),
    ]).then(([assets, credentials]) => {
      if (assets.status === "fulfilled") setServers(assets.value);
      setServerReadFailed(assets.status === "rejected");
      setCredentialReadFailed(credentials.status === "rejected");
      return assets.status === "fulfilled" && credentials.status === "fulfilled";
    }).finally(() => {
      loadInFlight.current = null;
      setRefreshing(false);
    });
    loadInFlight.current = request;
    return request;
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const knownServers = servers ?? [];
  const groups = [...new Set(knownServers.map(groupOf))];
  const activeGroup = group && groups.includes(group) ? group : undefined;
  const term = query.trim().toLowerCase();
  const visibleServers = knownServers.filter((server) => (
    (!activeGroup || groupOf(server) === activeGroup)
    && [server.alias, endpoint(server), groupOf(server)].some((value) => value.toLowerCase().includes(term))
  ));
  const saved = (server: ServerRecord) => usesKeyring(server) && Boolean(credentialsByServer[server.id]);
  const candidates = knownServers.filter((server) => usesKeyring(server) && !saved(server));
  const addTarget = candidates.find(({ id }) => id === addId);
  const detail = knownServers.find(({ id }) => id === detailId);
  const mutationReady = !refreshing && !serverReadFailed && !credentialReadFailed;

  async function handleVerified() {
    if (!verifying) return;
    // 验证 IPC 已完成托管。保存标记即可，避免二次写入凭据和覆盖 Rust 补齐的字段。
    await useSshSessionStore.getState().setCredentials(verifying.id, {});
    setVerifying(null);
    feedback.success(usesKeyring(verifying) ? "SSH 验证通过，凭据已托管" : "SSH 验证通过");
    await reload();
  }

  async function handleForget() {
    if (!detail || !saved(detail) || !mutationReady || forgetting) return;
    setForgetting(true);
    setForgetFailed(false);
    try {
      await useSshSessionStore.getState().forgetCredentials(detail.id);
      setForgetOpen(false);
      feedback.success("已忘记本机托管的 SSH 凭据");
    } catch {
      setForgetFailed(true);
    } finally {
      // 系统凭据管理器的返回值为准，包括部分删除失败后的实际状态。
      await reload();
      setForgetting(false);
    }
  }

  function startConnection(server: ServerRecord) {
    if (server.protocol === "rdp") {
      void serverImportApi.openRemoteDesktop(server.id).catch(() => feedback.error("无法打开远程桌面"));
    } else {
      setVerifying(server);
    }
  }

  return (
    <div className="ops-page space-y-4">
      {feedbackHolder}
      <header className="ops-page-head">
        <h1 className="ops-page-title">
          <KeyRound aria-hidden size={18} className="text-[var(--nav-active-icon)]" />
          服务凭据
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="primary"
            icon={<Plus size={15} />}
            disabled={!mutationReady || candidates.length === 0}
            onClick={() => { setAddId(undefined); setAdding(true); }}
          >
            添加凭据
          </Button>
          <Button
            icon={<RefreshCw size={14} />}
            loading={refreshing}
            onClick={async () => { if (await reload()) feedback.success("凭据状态已刷新"); }}
          >
            刷新
          </Button>
        </div>
      </header>

      {(serverReadFailed || credentialReadFailed) && (
        <Alert type="error" showIcon message={[
          serverReadFailed && "服务器列表读取失败",
          credentialReadFailed && "系统凭据状态读取失败",
        ].filter(Boolean).join("，")} description="请刷新后重试。" />
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <Input
          allowClear
          aria-label="搜索服务器凭据"
          placeholder="搜索服务器、地址或分组"
          prefix={<Search size={14} aria-hidden className="text-[var(--text-muted)]" />}
          className="max-w-85 flex-[1_1_14rem]"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Select
          allowClear
          aria-label="按服务器分组筛选"
          className="w-40"
          placeholder="全部分组"
          value={activeGroup}
          onChange={setGroup}
          options={groups.map((value) => ({ value, label: value }))}
        />
      </div>

      <section className="ops-panel overflow-hidden" aria-label="服务器凭据列表" aria-busy={refreshing}>
        {servers === null ? (
          <div className="flex min-h-44 items-center justify-center">
            {refreshing ? <Spin aria-label="正在载入凭据" /> : <Empty description="服务器列表不可用" />}
          </div>
        ) : visibleServers.length === 0 ? (
          <Empty className="py-10" description={knownServers.length ? "没有匹配的服务器" : "暂无服务器，请先到服务器资产添加"} />
        ) : (
          <div className="max-h-[calc(100dvh-16rem)] overflow-auto">
            <table className="w-full min-w-[660px] text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[var(--surface-950)] text-[var(--text-secondary)]">
                <tr>
                  {["服务器", "认证方式", "凭据状态", "验证状态", "最近验证成功"].map((label) => (
                    <th key={label} scope="col" className="whitespace-nowrap px-3 py-3 font-medium">{label}</th>
                  ))}
                  <th scope="col" className="px-3 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleServers.map((server) => (
                  <tr key={server.id} className="border-t border-[var(--border-secondary)] hover:bg-[var(--bg-hover)]">
                    <th scope="row" className="px-3 py-2.5 font-normal">
                      <div className="flex items-center gap-2.5">
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface-950)] text-[var(--nav-active-icon)]">
                          <Server size={15} aria-hidden />
                        </span>
                        <div className="min-w-0 [overflow-wrap:anywhere]">
                          <div className="font-semibold">{server.alias}</div>
                          <div className="mt-0.5 font-mono text-[var(--text-secondary)]">{endpoint(server)}</div>
                        </div>
                      </div>
                    </th>
                    <td className="whitespace-nowrap px-3 py-2.5">{authLabel(server)}</td>
                    <td className="px-3 py-2.5"><CredentialStatus server={server} saved={saved(server)} unavailable={credentialReadFailed} /></td>
                    <td className="px-3 py-2.5"><VerificationStatus server={server} /></td>
                    <td className="px-3 py-2.5 text-[var(--text-secondary)]">{server.last_connected_at || "—"}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Button size="small" aria-label={`查看 ${server.alias} 的凭据详情`} onClick={() => setDetailId(server.id)}>详情</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {servers !== null && (
          <div className="flex flex-wrap justify-between gap-2 border-t border-[var(--border)] px-3 py-2.5 text-xs text-[var(--text-secondary)]">
            <span>显示 {visibleServers.length} / {knownServers.length} 台服务器</span>
            {!credentialReadFailed && <span>{knownServers.filter(saved).length} 台已托管 · 系统凭据管理器</span>}
          </div>
        )}
      </section>

      <Modal
        open={adding}
        title="添加 SSH 凭据"
        okText="继续验证"
        cancelText="取消"
        destroyOnHidden
        maskClosable={false}
        okButtonProps={{ disabled: !addTarget || !mutationReady }}
        onCancel={() => setAdding(false)}
        onOk={() => {
          if (!addTarget || !mutationReady) return;
          setAdding(false);
          setVerifying(addTarget);
        }}
      >
        <label htmlFor="credential-server">服务器</label>
        <Select
          id="credential-server"
          showSearch
          placeholder="选择需要托管凭据的服务器"
          className="mt-2 w-full"
          value={addId}
          onChange={setAddId}
          optionFilterProp="label"
          options={candidates.map((server) => ({ value: server.id, label: `${server.alias} · ${endpoint(server)}` }))}
        />
      </Modal>

      {detail && (
        <Modal
          open={!verifying && !forgetOpen}
          title={`${detail.alias} · 凭据详情`}
          onCancel={() => setDetailId(undefined)}
          footer={(
            <div className="flex flex-wrap justify-end gap-2">
              {saved(detail) && !credentialReadFailed && (
                <Button danger disabled={!mutationReady} icon={<Trash2 size={14} />} onClick={() => { setForgetFailed(false); setForgetOpen(true); }}>
                  忘记凭据
                </Button>
              )}
              <Button type="primary" disabled={detail.protocol === "rdp" ? serverReadFailed || refreshing : !mutationReady} icon={<Wifi size={14} />} onClick={() => startConnection(detail)}>
                {detail.protocol === "rdp" ? "打开远程桌面" : saved(detail) ? "重新验证" : usesKeyring(detail) ? "连接并托管" : "验证连接"}
              </Button>
            </div>
          )}
        >
          <Descriptions bordered size="small" column={1} className="my-3 [overflow-wrap:anywhere]">
            <Descriptions.Item label="连接地址"><span className="font-mono">{endpoint(detail)}</span></Descriptions.Item>
            <Descriptions.Item label="分组">{groupOf(detail)}</Descriptions.Item>
            <Descriptions.Item label="认证方式">{authLabel(detail)}</Descriptions.Item>
            <Descriptions.Item label="凭据状态"><CredentialStatus server={detail} saved={saved(detail)} unavailable={credentialReadFailed} /></Descriptions.Item>
            <Descriptions.Item label="验证状态"><VerificationStatus server={detail} /></Descriptions.Item>
            <Descriptions.Item label="最近验证成功">{detail.last_connected_at || "—"}</Descriptions.Item>
          </Descriptions>
        </Modal>
      )}

      <SshConnectModal
        open={verifying !== null}
        server={verifying}
        manageCredentials
        onCancel={() => setVerifying(null)}
        onVerified={handleVerified}
        onStatusChanged={async () => { await reload(); }}
      />

      <Modal
        open={forgetOpen}
        title="忘记 SSH 凭据？"
        okText="忘记凭据"
        cancelText="取消"
        okButtonProps={{ danger: true, disabled: !detail || !saved(detail) || !mutationReady }}
        cancelButtonProps={{ disabled: forgetting }}
        confirmLoading={forgetting}
        maskClosable={false}
        keyboard={!forgetting}
        closable={!forgetting}
        onCancel={() => setForgetOpen(false)}
        onOk={() => void handleForget()}
      >
        <p>将从系统凭据管理器删除「{detail?.alias}」的 SSH 凭据。下次登录时需要重新输入，服务器资产会保留。</p>
        {forgetFailed && (
          <Alert className="mt-3" type="error" showIcon message="系统凭据删除失败" description="请核对凭据状态后重试。" />
        )}
      </Modal>
    </div>
  );
}
