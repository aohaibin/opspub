import { useEffect, useRef, useState } from "react";
import { Alert, Button, Modal, Select, message } from "antd";
import { listen } from "@tauri-apps/api/event";
import { ShieldAlert, Unlock } from "lucide-react";
import { copilotApi } from "@/lib/api/copilot";
import { getErrorMessage } from "@/lib/api/client";
import { useAppStore } from "@/store/app";

interface UnlockRequest {
  sourceClient: string;
  tokenId: number;
  tool: string;
}

const CLIENT_NAMES: Record<string, string> = {
  claude: "Claude Code", codex: "Codex", cursor: "Cursor", opencode: "OpenCode",
};

/** 挂在应用外壳，切换菜单或最小化后仍能处理 MCP 的人工授权提示。 */
export function McpAiUnlockModal() {
  const [request, setRequest] = useState<UnlockRequest | null>(null);
  const [duration, setDuration] = useState<"30m" | "2h" | "1d">("30m");
  const [saving, setSaving] = useState(false);
  const openRef = useRef(false);
  const dismissedAt = useRef(0);
  const aiLocked = useAppStore((state) => state.aiLocked);

  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    void listen<UnlockRequest>("mcp-ai-unlock-requested", (event) => {
      if (disposed || openRef.current || Date.now() - dismissedAt.current < 15_000) return;
      openRef.current = true;
      // 事件到达与用户操作可能交错，弹窗前重新读取后端总锁，避免显示过期提示。
      void copilotApi.getLock().then((lock) => {
        if (disposed) return;
        useAppStore.getState().setAiLockState(lock.locked, lock.unlockUntil === null ? null : lock.unlockUntil * 1000);
        if (!lock.locked) { openRef.current = false; return; }
        setDuration("30m");
        setRequest(event.payload);
      }).catch((error) => {
        openRef.current = false;
        if (!disposed) message.error(getErrorMessage(error));
      });
    }).then((unlisten) => { if (disposed) unlisten(); else stop = unlisten; })
      .catch((error) => { if (!disposed) console.error("MCP 开启 AI 提示监听失败", error); });
    return () => { disposed = true; stop?.(); };
  }, []);

  const close = () => {
    dismissedAt.current = Date.now();
    openRef.current = false;
    setRequest(null);
  };

  useEffect(() => {
    // 从顶栏或 AI 助手开启后，关闭仍在显示的同一提示。
    if (!aiLocked) {
      openRef.current = false;
      setRequest(null);
    }
  }, [aiLocked]);

  const unlock = async () => {
    setSaving(true);
    try {
      const lock = await copilotApi.setLock(duration);
      if (lock.locked) throw new Error("AI 操作仍处于锁定状态，请重试");
      const store = useAppStore.getState();
      store.setAiUnlockDuration(duration);
      store.setAiLockState(lock.locked, lock.unlockUntil === null ? null : lock.unlockUntil * 1000);
      close();
      message.success("AI 操作已开启，请回到外部客户端重新发起调用");
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally { setSaving(false); }
  };

  return (
    <Modal
      open={request !== null}
      centered
      width={540}
      maskClosable={false}
      closable={!saving}
      keyboard={!saving}
      onCancel={() => { if (!saving) close(); }}
      title={<span className="flex items-center gap-2.5 text-base"><ShieldAlert size={21} style={{ color: "var(--warning)" }} />MCP 调用需要开启 AI 操作</span>}
      footer={[
        <Button key="cancel" disabled={saving} onClick={close}>暂不开启</Button>,
        <Button key="unlock" type="primary" loading={saving} onClick={() => void unlock()} icon={<Unlock size={16} />}>确认开启</Button>,
      ]}
      styles={{ body: { fontSize: 15, lineHeight: 1.8, paddingTop: 12 } }}
    >
      <div className="flex flex-col gap-4" style={{ color: "var(--text-secondary)" }}>
        <p style={{ margin: 0 }}>外部 MCP 客户端正在请求操作服务器，当前 AI 操作总开关处于锁定状态。</p>
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
          <div>授权客户端：<strong style={{ color: "var(--text-primary)" }}>{request ? CLIENT_NAMES[request.sourceClient] ?? "自定义客户端" : ""}</strong></div>
          <div>令牌 ID：{request?.tokenId}</div>
          <div>请求工具：<code>{request?.tool}</code></div>
        </div>
        <label className="flex items-center gap-3">
          <span id="mcp-ai-unlock-duration-label">开启时长</span>
          <Select
            aria-labelledby="mcp-ai-unlock-duration-label"
            value={duration}
            disabled={saving}
            onChange={setDuration}
            style={{ minWidth: 160 }}
            options={[{ value: "30m", label: "30 分钟" }, { value: "2h", label: "2 小时" }, { value: "1d", label: "1 天" }]}
          />
        </label>
        <Alert type="info" showIcon title="开启后仍受原有权限和审批限制" description="这是全局 AI 操作开关，不会扩大令牌权限；改动仍需按策略审批。到期自动锁定。本次被拦截的调用尚未执行，开启后请回到外部客户端重新发起。" />
      </div>
    </Modal>
  );
}
