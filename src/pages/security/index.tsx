import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Drawer, Empty, Input, Modal, Select, Spin, Switch, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Ban, CheckCircle2, Clock3, History, Inbox, LockKeyhole, RefreshCw, ScrollText, ShieldAlert, ShieldCheck, Sliders, Trash2 } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { configApi } from "@/lib/api/config";
import { getErrorCode, getErrorMessage } from "@/lib/api/client";
import { copilotApi } from "@/lib/api/copilot";
import { policyApi } from "@/lib/api/policy";
import { serverApi } from "@/lib/api/server";
import { useAppStore } from "@/store/app";
import type { AiApproval, PolicyRule, Server } from "@/types";
import { ApprovalActions, ApprovalDetailContent, ApprovalStatus, ApprovalTicket, type DecisionAction } from "./ApprovalDetails";
import { canDecide, displayApprovalText, formatTime, statusLabel, useApprovalQueue } from "./approval";
import "./security.css";

type SecurityTab = "pending" | "history" | "policies" | "blacklist";
type GatePolicy = {
  productionDoubleApproval: boolean;
  testingAutofix: boolean;
  nightMode: boolean;
  zeroPresenceLock: boolean;
};
type LegacyBlacklistRule = { id: string; pattern: string; label: string; builtin?: boolean };

const POLICY_KEY = "security.gatePolicy";
const BLACKLIST_KEY = "security.blacklist";
const DEFAULT_POLICY: GatePolicy = { productionDoubleApproval: true, testingAutofix: false, nightMode: true, zeroPresenceLock: true };

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}
function todayStart() { const date = new Date(); date.setHours(0, 0, 0, 0); return Math.floor(date.getTime() / 1000); }

export default function SecurityPage() {
  const [params, setParams] = useSearchParams();
  const { details, now, loading, failed, refresh, applyDecision } = useApprovalQueue();
  const aiLocked = useAppStore((state) => state.aiLocked);
  const aiUnlockUntil = useAppStore((state) => state.aiUnlockUntil);
  const [policy, setPolicy] = useState<GatePolicy>(DEFAULT_POLICY);
  const [policyReady, setPolicyReady] = useState(false);
  const [policyError, setPolicyError] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [blacklist, setBlacklist] = useState<PolicyRule[]>([]);
  const [rulesError, setRulesError] = useState(false);
  const [servers, setServers] = useState<Server[]>([]);
  const [serverError, setServerError] = useState(false);
  const [decision, setDecision] = useState<{ id: number; action: DecisionAction }>();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const mounted = useRef(false);
  const submittingRef = useRef(false);
  const [decisionError, setDecisionError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AiApproval["status"] | undefined>();
  const [ruleDrawerOpen, setRuleDrawerOpen] = useState(false);
  const [ruleDraft, setRuleDraft] = useState({ pattern: "", label: "" });
  const [ruleTest, setRuleTest] = useState("");

  const loadPolicy = useCallback(async () => {
    try {
      const policyValue = await configApi.get(POLICY_KEY).catch((error: unknown) => {
        if (getErrorCode(error) === "NOT_FOUND") return null;
        throw error;
      });
      setPolicy({ ...DEFAULT_POLICY, ...parseJson<Partial<GatePolicy>>(policyValue, {}) });
      setPolicyReady(true);
      setPolicyError(false);
    } catch { setPolicyError(true); }
  }, []);

  const loadServers = useCallback(async () => {
    try {
      setServers(await serverApi.list());
      setServerError(false);
    } catch { setServerError(true); }
  }, []);

  const loadRules = useCallback(async () => {
    try {
      const [blacklistValue, storedRules] = await Promise.all([
        configApi.get(BLACKLIST_KEY).catch(() => null),
        policyApi.listRules(true),
      ]);
      const legacyRules = parseJson<LegacyBlacklistRule[]>(blacklistValue, []);
      const storedIds = new Set(storedRules.map((rule) => rule.id));
      for (const legacy of legacyRules) {
        if (legacy.builtin || storedIds.has(legacy.id) || !legacy.id.startsWith("custom-")) continue;
        try {
          await policyApi.saveRule({
            id: legacy.id,
            label: legacy.label,
            pattern: legacy.pattern,
            riskLevel: "high",
            action: "review",
            enabled: true,
            builtin: false,
            ruleVersion: "policy-v1",
            createdAt: 0,
            updatedAt: 0,
          });
        } catch {
          // Ignore malformed legacy rules; new rules are validated by the Rust service.
        }
      }
      setBlacklist(legacyRules.length ? await policyApi.listRules(true) : storedRules);
      setRulesError(false);
    } catch { setRulesError(true); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void loadPolicy();
    void loadServers();
    void loadRules();
    return () => { mounted.current = false; };
  }, [loadPolicy, loadRules, loadServers]);

  const refreshPage = () => {
    void refresh();
    void loadServers();
    if (policyError) void loadPolicy();
    if (tab === "blacklist" || rulesError) void loadRules();
  };

  const approvals = details.map(({ approval }) => approval);
  const pending = details.filter(({ approval }) => approval.status === "pending");
  const detailId = Number(params.get("approvalId"));
  const detailOpen = Number.isSafeInteger(detailId) && detailId > 0;
  const selected = details.find(({ approval }) => approval.id === detailId);
  const decisionItem = approvals.find((item) => item.id === decision?.id);
  const tabParam = params.get("view");
  const tab: SecurityTab = tabParam === "policies" || tabParam === "blacklist" || tabParam === "history"
    ? tabParam
    : selected && selected.approval.status !== "pending" ? "history" : "pending";
  const showView = (view: SecurityTab) => {
    setParams(view === "pending" ? {} : { view });
  };
  const showDetail = (id: number) => setParams({ view: tab, approvalId: String(id) });
  const serverFor = (item: AiApproval) => serverError ? undefined
    : servers.find((server) => server.id === item.serverId && server.alias === item.serverAlias);
  const today = todayStart();
  const approvedToday = approvals.filter((item) => item.status === "completed" && (item.finishedAt ?? item.decidedAt ?? 0) >= today).length;
  const rejectedCount = approvals.filter((item) => item.status === "rejected").length;
  const decisionTimes = approvals.flatMap(({ decidedAt, requestedAt }) => (
    decidedAt !== null && decidedAt >= requestedAt ? [decidedAt - requestedAt] : []
  ));
  const averageMinutes = decisionTimes.length
    ? (decisionTimes.reduce((sum, seconds) => sum + seconds, 0) / (60 * decisionTimes.length)).toFixed(1)
    : "—";
  const history = approvals.filter((item) => item.status !== "pending");
  const query = search.trim().toLowerCase();
  const visibleHistory = history.filter((item) => (
    (!statusFilter || item.status === statusFilter)
    && (!query || displayApprovalText(`${item.id} ${item.serverAlias} ${item.action} ${item.command}\n${item.result}`).toLowerCase().includes(query))
  ));

  const openDecision = (item: AiApproval, action: DecisionAction) => {
    if (decision || submittingRef.current || failed || !canDecide(item)) return;
    setReason("");
    setDecisionError("");
    setDecision({ id: item.id, action });
  };

  const rejection = displayApprovalText(reason.trim()) || "人工审批驳回";
  const reasonTooLong = new TextEncoder().encode(rejection).length > 500;
  const submitDecision = async () => {
    if (!decision || !decisionItem || submittingRef.current || failed) return;
    if (!canDecide(decisionItem)) { void refresh(); return; }
    const lock = useAppStore.getState();
    if (decision.action === "approve" && (lock.aiLocked || (lock.aiUnlockUntil !== null && lock.aiUnlockUntil <= Date.now()))) return;
    if (decision.action === "reject" && reasonTooLong) return;

    // 同步占用防住 React 重绘前的连续点击；Rust 仍独立检查并原子裁决。
    submittingRef.current = true;
    setSubmitting(true);
    setDecisionError("");
    try {
      if (decision.action === "approve") {
        applyDecision(await copilotApi.approveApproval(decision.id));
      } else {
        await copilotApi.rejectApproval(decision.id, rejection);
        applyDecision({ ...decisionItem, status: "rejected", result: rejection });
      }
      if (mounted.current) {
        setDecision(undefined);
        setSearch("");
        setStatusFilter(undefined);
        setParams({ view: "history", ...(detailOpen ? { approvalId: String(decision.id) } : {}) }, { replace: detailOpen });
      }
    } catch {
      if (mounted.current) setDecisionError("裁决请求失败。请核对审批状态、AI 操作锁与目标服务器策略。");
    } finally {
      if (mounted.current) await refresh();
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const savePolicy = async () => {
    setSavingPolicy(true);
    try { await configApi.set(POLICY_KEY, JSON.stringify(policy)); message.success("安全闸门策略已保存到本机"); }
    catch { message.error("安全闸门策略保存失败，请重试"); }
    finally { setSavingPolicy(false); }
  };
  const addRule = async () => {
    if (!ruleDraft.pattern.trim() || !ruleDraft.label.trim()) { message.warning("请填写规则正则和说明"); return; }
    try {
      await policyApi.saveRule({
        id: `custom-${Date.now()}`,
        label: ruleDraft.label.trim(),
        pattern: ruleDraft.pattern.trim(),
        riskLevel: "high",
        action: "review",
        enabled: true,
        builtin: false,
        ruleVersion: "policy-v1",
        createdAt: 0,
        updatedAt: 0,
      });
      setBlacklist(await policyApi.listRules(true));
      setRuleDraft({ pattern: "", label: "" });
      setRuleDrawerOpen(false);
      message.success("高危复核规则已保存到后端策略库");
    } catch (error) { message.error(displayApprovalText(getErrorMessage(error))); }
  };

  const setRuleEnabled = async (rule: PolicyRule, enabled: boolean) => {
    try {
      await policyApi.setRuleEnabled(rule.id, enabled);
      setBlacklist(await policyApi.listRules(true));
    } catch (error) { message.error(displayApprovalText(getErrorMessage(error))); }
  };

  const deleteRule = async (rule: PolicyRule) => {
    try {
      await policyApi.deleteRule(rule.id);
      setBlacklist(await policyApi.listRules(true));
      message.success("自定义规则已删除");
    } catch (error) { message.error(displayApprovalText(getErrorMessage(error))); }
  };

const columns: ColumnsType<AiApproval> = [
    {
      title: "审批编号 / 操作",
      key: "action",
      render: (_, item) => <>
        <Button type="link" size="small" className="security-history-link" onClick={() => showDetail(item.id)}>
          #{item.id} · {displayApprovalText(item.action)}
        </Button>
        <code className="security-command">{displayApprovalText(item.command)}</code>
      </>,
    },
    { title: "目标服务器", dataIndex: "serverAlias", width: 132, render: displayApprovalText },
    { title: "申请时间", dataIndex: "requestedAt", width: 145, render: formatTime },
    { title: "裁决结果", dataIndex: "status", width: 94, render: (status: AiApproval["status"]) => <ApprovalStatus status={status} /> },
    { title: "结果 / 原因", dataIndex: "result", render: (value: string) => <span className="security-result">{displayApprovalText(value) || "—"}</span> },
  ];
  const isLocked = aiLocked || (aiUnlockUntil !== null && aiUnlockUntil <= now);
  const decisionUnavailable = !decisionItem || !canDecide(decisionItem, now);
  const unavailableMessage = !decisionItem ? "审批记录已不可用"
    : decisionItem.status === "expired" ? "审批已超时" : `当前状态为${statusLabel[decisionItem.status]}`;
  const approvalDisabled = failed || !!decision;
  const tabs = [
    ["pending", <Inbox size={14} />, `待决审批队列 (${pending.length})`],
    ["history", <History size={14} />, `已审批轨迹记录 (${history.length})`],
    ["policies", <Sliders size={14} />, "安全闸门策略配置"],
    ["blacklist", <Ban size={14} />, "高危指令拦截库"],
  ] as const;

  return (
    <div className="security-page">
      <header className="security-header">
        <div>
          <div className="security-heading">
            <ShieldAlert size={20} aria-hidden />
            <h1>安全闸门与操作审批中心</h1>
          </div>
          <div className="security-lock-state">
            <Tag color={isLocked ? "error" : "success"} icon={<LockKeyhole size={12} aria-hidden />}>
              {isLocked ? "AI 操作已锁定" : "AI 操作已放行"}
            </Tag>
            {!isLocked && <span>{aiUnlockUntil === null ? "永久放行" : `放行至 ${formatTime(aiUnlockUntil / 1000)}`}</span>}
          </div>
        </div>
        <div className="security-actions">
          <Link className="security-audit-link" to="/audit"><ScrollText size={14} aria-hidden />查看审计日志</Link>
          <Button size="small" icon={<Sliders size={14} />} onClick={() => showView("policies")}>策略配置</Button>
          <Button size="small" icon={<RefreshCw size={14} />} loading={loading} onClick={refreshPage}>刷新</Button>
        </div>
      </header>

      <section className="security-kpis" aria-label="审批统计">
        <Kpi icon={<Inbox size={15} />} label="待决操作工单" value={pending.length} tone="amber" />
        <Kpi icon={<CheckCircle2 size={15} />} label="今日执行完成" value={approvedToday} tone="green" />
        <Kpi icon={<Ban size={15} />} label="人工拒绝" value={rejectedCount} tone="rose" />
        <Kpi icon={<Clock3 size={15} />} label="平均裁决耗时（分钟）" value={averageMinutes} tone="indigo" />
      </section>

      <nav className="security-tabs" aria-label="审批视图">
        {tabs.map(([key, icon, label]) => (
          <button type="button" key={key} aria-current={tab === key ? "page" : undefined} onClick={() => showView(key)}>
            {icon}{label}
          </button>
        ))}
      </nav>

      {(tab === "pending" || tab === "history") && failed && (
        <Alert type="error" showIcon message="审批列表读取失败，请刷新后再裁决。" />
      )}

      {tab === "pending" && <section className="security-scroll" aria-label="待决操作工单">
        {pending.length > 0 ? <div className="security-ticket-list">
          {pending.map((item) => <ApprovalTicket
            key={item.approval.id}
            detail={item}
            now={now}
            server={serverFor(item.approval)}
            disabled={approvalDisabled}
            aiLocked={isLocked}
            onOpen={() => showDetail(item.approval.id)}
            onDecide={(action) => openDecision(item.approval, action)}
          />)}
        </div> : loading ? <div className="security-empty"><Spin /></div>
          : !failed && <Empty className="security-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待裁决审批" />}
      </section>}

      {tab === "history" && <section className="security-scroll security-history" aria-label="审批轨迹记录">
        <div className="security-filters">
          <Input.Search allowClear value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索服务器、动作、命令或结果" className="max-w-sm" />
          <Select allowClear value={statusFilter} onChange={setStatusFilter} placeholder="全部状态"
            options={Object.entries(statusLabel).filter(([key]) => key !== "pending").map(([value, label]) => ({ value, label }))} />
          <Tag>共 {visibleHistory.length} 条</Tag>
        </div>
        <Table<AiApproval>
          size="small" rowKey="id" loading={loading} dataSource={visibleHistory} columns={columns}
          tableLayout="fixed" scroll={{ x: 650 }} pagination={{ pageSize: 10, showSizeChanger: false }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={failed ? "审批轨迹读取失败" : "暂无审批轨迹"} /> }}
        />
      </section>}

      {tab === "policies" && <section className="security-scroll">
        <div className="security-panel">
          <div className="security-section-title">
            <div><ShieldCheck size={16} aria-hidden /><div><h2>分级放行规则体系</h2>
              <p>下方为本机策略偏好。运行时使用全局 AI 操作锁、服务器 AI 策略和后端动作规则。</p>
            </div></div>
            <Button type="primary" loading={savingPolicy} disabled={!policyReady || policyError} onClick={() => void savePolicy()}>
              保存策略偏好
            </Button>
          </div>
          {policyError ? <Alert className="mt-3" type="error" showIcon message="策略偏好读取失败，请刷新重试。" /> : !policyReady
            ? <div className="security-empty"><Spin /></div>
            : <div className="security-policy-list">
              <PolicyRow title="生产集群双人审批" description="记录生产环境双人复核的偏好。" checked={policy.productionDoubleApproval} onChange={(checked) => setPolicy((value) => ({ ...value, productionDoubleApproval: checked }))} />
              <PolicyRow title="测试集群低风险自愈" description="记录测试环境低风险自愈的偏好。" checked={policy.testingAutofix} onChange={(checked) => setPolicy((value) => ({ ...value, testingAutofix: checked }))} />
              <PolicyRow title="夜间强化防护" description="记录 22:00 至 08:00 的防护偏好。" checked={policy.nightMode} onChange={(checked) => setPolicy((value) => ({ ...value, nightMode: checked }))} />
              <PolicyRow title="无人值守保护" description="记录失焦、最小化或锁屏时的保护偏好。" checked={policy.zeroPresenceLock} onChange={(checked) => setPolicy((value) => ({ ...value, zeroPresenceLock: checked }))} />
            </div>}
        </div>
      </section>}

    {tab === "blacklist" && (rulesError ? <Alert type="error" showIcon message="规则库读取失败，请刷新重试。" /> : <section className="security-scroll"><div className="security-panel"><div className="security-section-title"><div><Ban size={16} className="security-danger" /><div><h2>高危命令策略规则库</h2><p>规则由 Rust 后端校验并持久化；内置规则不可删除或关闭，用户规则只允许阻断或人工复核。</p></div></div><Button icon={<Sliders size={14} />} onClick={() => setRuleDrawerOpen(true)}>新增复核规则</Button></div><div className="security-rule-test"><Input value={ruleTest} onChange={(event) => setRuleTest(event.target.value)} placeholder="输入命令测试规则命中情况" /><Tag color={ruleTest && blacklist.some((rule) => rule.enabled && (() => { try { return new RegExp(rule.pattern, "i").test(ruleTest); } catch { return false; } })()) ? "red" : "default"}>{ruleTest && blacklist.some((rule) => rule.enabled && (() => { try { return new RegExp(rule.pattern, "i").test(ruleTest); } catch { return false; } })()) ? "命中启用规则" : "未命中"}</Tag></div><div className="security-blacklist-grid">{blacklist.map((rule) => <div key={rule.id} className="security-blacklist-item"><div className="min-w-0"><code>{rule.pattern}</code><span>{rule.label} · {rule.riskLevel === "extreme" ? "极高危" : rule.riskLevel === "high" ? "高危" : "需复核"}</span></div><div className="flex items-center gap-2">{rule.builtin ? <Tag color="red">内置</Tag> : <><Switch size="small" checked={rule.enabled} onChange={(checked) => void setRuleEnabled(rule, checked)} /><Button type="text" danger size="small" icon={<Trash2 size={14} />} aria-label={`删除 ${rule.label}`} onClick={() => Modal.confirm({ title: `删除拦截规则“${rule.label}”？`, okText: "删除", cancelText: "取消", okButtonProps: { danger: true }, onOk: () => void deleteRule(rule) })} /></>}</div></div>)}</div></div></section>)}

      <Drawer
        title={`审批 #${detailId} 详情`}
        open={detailOpen} onClose={() => setParams(tab === "pending" ? {} : { view: tab }, { replace: true })}
        size={560}
        footer={selected && <div className="security-detail-footer">
          <Link className="security-audit-link" to="/audit"><ScrollText size={14} aria-hidden />查看审计日志</Link>
          <ApprovalActions disabled={approvalDisabled || !canDecide(selected.approval, now)} approveDisabled={isLocked}
            onDecide={(action) => openDecision(selected.approval, action)} />
        </div>}
      >
        {failed && <Alert type="error" showIcon message="审批详情未能更新"
          action={<Button size="small" onClick={refreshPage}>重试</Button>} />}
        {selected ? <ApprovalDetailContent detail={selected} server={serverFor(selected.approval)} now={now} />
          : loading ? <div className="security-empty"><Spin /></div>
            : !failed && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前审批记录不可用" />}
      </Drawer>

      <Modal
        title={decision?.action === "approve" ? `批准并执行审批 #${decision.id}？` : `驳回审批 #${decision?.id}？`}
        open={!!decision}
        onCancel={() => setDecision(undefined)}
        onOk={() => void submitDecision()}
        confirmLoading={submitting}
        closable={!submitting}
        keyboard={!submitting}
        mask={{ closable: false }}
        okText={decision?.action === "approve" ? "确认批准执行" : "驳回申请"}
        cancelText="取消"
        cancelButtonProps={{ disabled: submitting }}
        okButtonProps={{
          danger: true,
          disabled: submitting || failed || decisionUnavailable
            || (decision?.action === "approve" ? isLocked : reasonTooLong),
        }}
      >
        {decisionItem && <div className="security-confirm">
          <p>目标服务器 <strong>{displayApprovalText(decisionItem.serverAlias)}</strong></p>
          {decision?.action === "approve" ? <>
            <div className="security-script"><pre>{displayApprovalText(decisionItem.command)}</pre></div>
            <Alert type="warning" showIcon message="批准后，后端将复核有效期、AI 操作锁、服务器策略和受控动作规则。" />
          </> : <label>驳回原因（可选）
            <Input.TextArea value={reason} rows={3} disabled={submitting || decisionUnavailable}
              onChange={(event) => setReason(event.target.value)} placeholder="填写驳回原因" />
          </label>}
          {reasonTooLong && <Alert type="warning" showIcon message="驳回原因不能超过 500 字节。" />}
          {isLocked && decision?.action === "approve" && <Alert type="warning" showIcon message="AI 操作已锁定" />}
        </div>}
        {decisionUnavailable && !submitting && <Alert className="mt-2" type="warning" showIcon message={unavailableMessage} />}
        {(decisionError || failed) && <Alert className="mt-2" type="error" showIcon
          message={failed ? "审批状态读取失败，请关闭弹窗后刷新。" : decisionError} />}
      </Modal>

    <Drawer title="新增高危复核正则" open={ruleDrawerOpen} onClose={() => setRuleDrawerOpen(false)} width={440} maskClosable={false} extra={<Button type="primary" onClick={() => void addRule()}>保存规则</Button>}><div className="security-form"><label>规则说明<Input value={ruleDraft.label} onChange={(event) => setRuleDraft((value) => ({ ...value, label: event.target.value }))} placeholder="例如：停止生产数据库服务" /></label><label>正则表达式<Input.TextArea rows={4} value={ruleDraft.pattern} onChange={(event) => setRuleDraft((value) => ({ ...value, pattern: event.target.value }))} placeholder={String.raw`^systemctl\s+stop\s+mysql$`} /></label><Alert type="warning" showIcon message="自定义规则只会阻断或升级为人工复核，不能配置自动放行。" /></div></Drawer>
    </div>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number | string; tone: string }) {
  return <div className={`security-kpi ${tone}`}><span>{icon}{label}</span><strong>{value}</strong></div>;
}

function PolicyRow({ title, description, checked, onChange }: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return <div className="security-policy-row">
    <div><strong>{title}</strong><p>{description}</p></div>
    <Switch aria-label={title} checked={checked} onChange={onChange} />
  </div>;
}
