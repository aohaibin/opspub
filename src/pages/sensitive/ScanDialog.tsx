import { useRef, useState } from "react";
import { Alert, Input, Modal, Select } from "antd";
import { sensitiveApi } from "@/lib/api/sensitive";
import type { SensitiveScanResult, Server } from "@/types";

const DEFAULT_SOURCE = "手动测试";

interface Props {
  servers: Server[];
  onSettled: () => Promise<void>;
  onClose: () => void;
}

export function ScanDialog({ servers, onSettled, onClose }: Props) {
  const [serverId, setServerId] = useState<number>();
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const [content, setContent] = useState("");
  const [result, setResult] = useState<Pick<SensitiveScanResult, "matchCount" | "sanitizedContent">>();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const valid = Boolean(content.trim() && source.trim());

  const scan = async () => {
    if (!valid || running.current) return;
    running.current = true;
    setBusy(true);
    setFailed(false);
    setResult(undefined);
    const server = servers.find((item) => item.id === serverId);
    try {
      const output = await sensitiveApi.scan({
        content,
        source: source.trim(),
        serverId: server?.id ?? null,
        serverAlias: server?.alias ?? null,
      });
      setContent("");
      setSource(DEFAULT_SOURCE);
      setResult({
        matchCount: output.matchCount,
        sanitizedContent: output.matchCount > 0 ? output.sanitizedContent : "",
      });
    } catch {
      setFailed(true);
    } finally {
      // 扫描出错前可能已写入部分命中项，重新读取后端记录。
      await onSettled();
      running.current = false;
      setBusy(false);
    }
  };

  const resetResult = () => { setResult(undefined); setFailed(false); };

  return (
    <Modal
      open
      title="测试 AI 出口脱敏规则"
      width={800}
      maskClosable={false}
      closable={!busy}
      keyboard={!busy}
      okText="开始扫描"
      cancelText="关闭"
      okButtonProps={{ disabled: !valid || busy }}
      cancelButtonProps={{ disabled: busy }}
      confirmLoading={busy}
      onCancel={onClose}
      onOk={() => void scan()}
    >
      <div className="flex flex-col gap-3">
        <Alert type="info" showIcon message="请使用合成样例。扫描命中后会保存脱敏记录，来源请填写简短标签。" />
        {failed && <Alert type="error" showIcon message="扫描失败。请检查内容和来源后重试。" />}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="sensitive-scan-content">待扫描文本</label>
            <Input.TextArea
              id="sensitive-scan-content"
              autoComplete="off"
              spellCheck={false}
              rows={8}
              value={content}
              disabled={busy}
              onChange={(event) => { setContent(event.target.value); resetResult(); }}
              placeholder="例如 DATABASE_PASSWORD=synthetic-example"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <div id="sensitive-scan-preview-label">脱敏结果{result && ` · 命中 ${result.matchCount} 条`}</div>
            <pre
              aria-labelledby="sensitive-scan-preview-label"
              aria-live="polite"
              className="m-0 h-46 overflow-auto whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--surface-950)] p-2 text-xs [overflow-wrap:anywhere]"
            >
              {result ? result.sanitizedContent || "未检测到规则命中" : busy ? "正在扫描…" : "等待扫描"}
            </pre>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sensitive-scan-server">关联服务器（可选）</label>
            <Select id="sensitive-scan-server" allowClear showSearch optionFilterProp="label" disabled={busy || !servers.length} value={serverId} onChange={(id) => { setServerId(id); resetResult(); }} placeholder="未关联服务器" options={servers.map((server) => ({ value: server.id, label: server.alias }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sensitive-scan-source">来源</label>
            <Input id="sensitive-scan-source" autoComplete="off" value={source} disabled={busy} onChange={(event) => { setSource(event.target.value); resetResult(); }} />
          </div>
        </div>
      </div>
    </Modal>
  );
}
