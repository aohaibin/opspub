import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Drawer, Spin, Tag } from "antd";
import { ArrowUpRight, Clipboard, FileSearch } from "lucide-react";
import { copilotApi } from "@/lib/api/copilot";
import { projectSensitiveFields } from "@/lib/sensitive-projection";
import { statusLabel } from "@/pages/security/approval";
import type { AiApproval } from "@/types";
import { SOURCE_LABELS, VERDICTS, type AuditRow, type Verdict } from "./audit";

export function AuditVerdict({ verdict }: { verdict: Verdict }) {
  const { label, tone } = VERDICTS[verdict];
  return <Tag className="audit-verdict" style={{
    color: `color-mix(in srgb, ${tone} 75%, var(--text-primary))`,
    background: `color-mix(in srgb, ${tone} 8%, var(--surface-900))`,
    borderColor: `color-mix(in srgb, ${tone} 24%, transparent)`,
  }}>{label}</Tag>;
}

function ApprovalReference({ taskId, server }: { taskId: string; server: string }) {
  const [approval, setApproval] = useState<Pick<AiApproval, "id" | "status" | "result">>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    void copilotApi.listApprovalDetails().then((details) => {
      if (!active) return;
      const matches = details.flatMap(({ mcp, approval }) => {
        if (mcp?.taskId !== taskId) return [];
        const [alias, , result] = projectSensitiveFields([approval.serverAlias, approval.command, approval.result]);
        return alias === server ? [{ id: approval.id, status: approval.status, result }] : [];
      });
      setApproval(matches.length === 1 ? matches[0] : undefined);
      setState("ready");
    }).catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [taskId, server, retry]);

  return <>
    <div>任务 ID <code>{taskId}</code></div>
    {state === "loading" && <Spin size="small" aria-label="读取关联审批" />}
    {state === "error" && <Alert type="warning" showIcon title="读取关联审批失败" action={
      <Button size="small" onClick={() => { setState("loading"); setRetry(retry + 1); }}>重试</Button>
    } />}
    {state === "ready" && (approval ? <>
      <Link to={`/security?approvalId=${approval.id}`} className="audit-link">
        审批工单 #{approval.id} · {statusLabel[approval.status]} <ArrowUpRight size={13} />
      </Link>
      {approval.result && <pre>{approval.result}</pre>}
    </> : <p>最近 100 条审批中没有找到此任务对应的工单。</p>)}
  </>;
}

interface AuditDetailProps {
  id: number;
  row?: AuditRow;
  loading: boolean;
  failed: boolean;
  refreshKey: number;
  onClose: () => void;
  onRefresh: () => void;
  onCopy: (row: AuditRow) => void;
  onExperience: (row: AuditRow) => void;
}

export function AuditDetail({ id, row, loading, failed, refreshKey, onClose, onRefresh, onCopy, onExperience }: AuditDetailProps) {
  const showApproval = row && (row.taskId || row.source === "copilot" || row.source === "mcp"
    || (row.source === "human" && ["approved", "rejected", "blocked"].includes(row.verdict)));

  return <Drawer
    open
    size="min(560px, 100vw)"
    rootClassName="audit-drawer"
    title={`审计记录 #${id}`}
    onClose={onClose}
    extra={<Button size="small" loading={loading} onClick={onRefresh}>刷新详情</Button>}
    footer={row && <div className="audit-drawer-actions">
      <Button icon={<Clipboard size={14} />} onClick={() => onCopy(row)}>复制脱敏命令</Button>
      <Button icon={<FileSearch size={14} />} onClick={() => onExperience(row)}>转为经验</Button>
    </div>}
  >
    {failed && <Alert type="warning" showIcon title={row ? "刷新失败，详情显示上次读取的记录" : "读取失败，请刷新详情"} />}
    {row ? <div className="audit-detail">
      <dl>
        <div><dt>时间</dt><dd>{row.createdAt}</dd></div>
        <div><dt>裁决</dt><dd><AuditVerdict verdict={row.verdict} /></dd></div>
        <div><dt>服务器</dt><dd>{row.server || "—"}</dd></div>
        <div><dt>来源 / 操作主体</dt><dd>{SOURCE_LABELS[row.source]} · {row.actor || "—"}</dd></div>
      </dl>
      <section><h3>命令 / 参数</h3><pre>{row.command || "—"}</pre></section>
      <section><h3>结果 / 执行回执</h3><pre>{row.result || "—"}</pre></section>
      {showApproval && <section className="audit-approval-ref">
        <h3>审批与执行</h3>
        {row.taskId ? <ApprovalReference key={`${row.id}:${refreshKey}`} taskId={row.taskId} server={row.server} />
          : <p>这条日志没有可用于定位工单的关联键。</p>}
        <Link to="/security?view=history" className="audit-link">查看审批历史 <ArrowUpRight size={13} /></Link>
      </section>}
    </div> : loading ? <Spin aria-label="读取审计详情" /> : !failed && <Alert type="info" showIcon
      title="当前页找不到此记录" description="记录可能已移到其他页或超过保留期。可关闭详情后通过分页查找。" />}
  </Drawer>;
}
