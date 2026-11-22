import { Button, Tag } from "antd";
import { FileSearch } from "lucide-react";
import type { AiApproval, AiApprovalDetail, Server } from "@/types";
import { AI_POLICY_META } from "@/pages/servers/lib/serverMeta";
import { displayApprovalText, formatTime, remaining, statusColor, statusLabel } from "./approval";

export type DecisionAction = "approve" | "reject";

export function ApprovalStatus({ status }: { status: AiApproval["status"] }) {
  return <Tag color={statusColor[status]}>{statusLabel[status]}</Tag>;
}

export function ApprovalActions({ disabled, approveDisabled, onDecide }: {
  disabled: boolean;
  approveDisabled: boolean;
  onDecide: (action: DecisionAction) => void;
}) {
  return (
    <div className="security-actions">
      <Button size="small" danger disabled={disabled} onClick={() => onDecide("reject")}>驳回并填报原因</Button>
      <Button size="small" type="primary" disabled={disabled || approveDisabled} onClick={() => onDecide("approve")}>
        确认批准放行执行
      </Button>
    </div>
  );
}

function ApprovalSource({ detail }: { detail: AiApprovalDetail }) {
  return detail.mcp
    ? <>MCP · {displayApprovalText(detail.mcp.sourceClient)}</>
    : <>内置 AI 助手</>;
}

function PolicyTag({ server }: { server?: Server }) {
  const policy = Object.entries(AI_POLICY_META).find(([key]) => key === server?.ai_policy)?.[1];
  return <Tag color={policy?.color}>{policy?.label ?? "未知"}</Tag>;
}

export function ApprovalTicket({ detail, now, server, disabled, aiLocked, onOpen, onDecide }: {
  detail: AiApprovalDetail;
  now: number;
  server?: Server;
  disabled: boolean;
  aiLocked: boolean;
  onOpen: () => void;
  onDecide: (action: DecisionAction) => void;
}) {
  const { approval, plan } = detail;
  return (
    <article className="security-ticket" aria-label={`工单 #${approval.id}`}>
      <header>
        <div>
          <ApprovalStatus status={approval.status} />
          <strong>工单 #{approval.id} · {displayApprovalText(plan?.summary || approval.action)}</strong>
        </div>
        <span className="security-expiry">{remaining(approval.expiresAt, now)}</span>
      </header>
      <div className="security-ticket-meta">
        <span>目标服务器 <b>{displayApprovalText(approval.serverAlias)}</b></span>
        <span>申请方 <ApprovalSource detail={detail} /></span>
        <span>服务器 AI 策略 <PolicyTag server={server} /></span>
        <span>到期时间 {formatTime(approval.expiresAt)}</span>
      </div>
      <div className="security-script">
        <div className="security-script-title">
          <span>拟执行命令</span>
          <Button type="link" size="small" icon={<FileSearch size={13} />} onClick={onOpen}>查看详情</Button>
        </div>
        <pre>{displayApprovalText(approval.command)}</pre>
      </div>
      {plan?.risk.reason && <p className="security-risk">风险评估 · {displayApprovalText(plan.risk.reason)}</p>}
      <footer>
        <span>{aiLocked ? "通过审批前，请从顶栏解除 AI 操作锁。" : "后端会在执行前复核审批、目标与策略。"}</span>
        <ApprovalActions disabled={disabled} approveDisabled={aiLocked} onDecide={onDecide} />
      </footer>
    </article>
  );
}

export function ApprovalDetailContent({ detail, server, now }: {
  detail: AiApprovalDetail;
  server?: Server;
  now: number;
}) {
  const { approval, plan } = detail;
  return (
    <div className="security-detail">
      <dl className="security-detail-meta">
        <div><dt>裁决状态</dt><dd><ApprovalStatus status={approval.status} /></dd></div>
        <div><dt>服务器 AI 策略</dt><dd><PolicyTag server={server} /></dd></div>
        <div><dt>目标服务器</dt><dd>{displayApprovalText(approval.serverAlias)}</dd></div>
        <div><dt>申请方</dt><dd><ApprovalSource detail={detail} /></dd></div>
        <div><dt>申请时间</dt><dd>{formatTime(approval.requestedAt)}</dd></div>
        <div><dt>到期时间</dt><dd>{formatTime(approval.expiresAt)}</dd></div>
        {approval.status === "pending" && <div><dt>有效期</dt><dd>{remaining(approval.expiresAt, now)}</dd></div>}
        {approval.decidedAt && <div><dt>裁决时间</dt><dd>{formatTime(approval.decidedAt)}</dd></div>}
        {approval.finishedAt && <div><dt>结束时间</dt><dd>{formatTime(approval.finishedAt)}</dd></div>}
      </dl>
      <div className="security-script">
        <div className="security-script-title">拟执行命令</div>
        <pre>{displayApprovalText(approval.command)}</pre>
      </div>
      {approval.result && <div className="security-script">
        <div className="security-script-title">结果 / 原因</div>
        <pre>{displayApprovalText(approval.result)}</pre>
      </div>}
      {plan && <section className="security-plan">
        <h3>操作计划</h3>
        <p>{displayApprovalText(plan.summary)}</p>
        <dl className="security-detail-meta">
          <div><dt>风险等级</dt><dd>{{ low_readonly: "只读", medium: "中危", high: "高危", extreme: "极高危", unknown: "需复核" }[plan.risk.level]}</dd></div>
          <div><dt>计划状态</dt><dd>{displayApprovalText(plan.status)}</dd></div>
          <div><dt>策略版本</dt><dd>{displayApprovalText(plan.ruleVersion) || "—"}</dd></div>
          <div><dt>命令哈希</dt><dd><code>{plan.commandSha256}</code></dd></div>
          <div><dt>规则命中</dt><dd>{displayApprovalText(plan.risk.matchedRules.join("、")) || "内置静态检查"}</dd></div>
          <div><dt>风险说明</dt><dd>{displayApprovalText(plan.risk.reason)}</dd></div>
        </dl>
        {plan.executionSteps.length > 0 && <>
          <h3>执行步骤</h3>
          <ol className="security-steps">
            {plan.executionSteps.map((step) => <li key={step.id}>
              <strong>{displayApprovalText(step.label)}</strong>
              <pre>{displayApprovalText(step.command)}</pre>
              {step.verificationCommand && <p>验证 · {displayApprovalText(step.verificationCommand)}</p>}
            </li>)}
          </ol>
        </>}
        {plan.verificationSteps.length > 0 && <p>后置验证 · {displayApprovalText(plan.verificationSteps.map((step) => step.label).join("、"))}</p>}
      </section>}
    </div>
  );
}
