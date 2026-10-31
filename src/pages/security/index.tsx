import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Drawer, Empty, Input, Modal, Select, Switch, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Ban, CheckCircle2, Clock3, FileSearch, History, Inbox, RefreshCw, ScrollText, ShieldAlert, ShieldCheck, Sliders, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { configApi } from "@/lib/api/config";
import { copilotApi } from "@/lib/api/copilot";
import { getErrorMessage } from "@/lib/api/client";
import type { AiApproval } from "@/types";
import "./security.css";

type SecurityTab = "pending" | "history" | "policies" | "blacklist";
type GatePolicy = {
  productionDoubleApproval: boolean;
  testingAutofix: boolean;
  nightMode: boolean;
  zeroPresenceLock: boolean;
};
type BlacklistRule = { id: string; pattern: string; label: string; builtin?: boolean };

const POLICY_KEY = "security.gatePolicy";
const BLACKLIST_KEY = "security.blacklist";
const DEFAULT_POLICY: GatePolicy = { productionDoubleApproval: true, testingAutofix: false, nightMode: true, zeroPresenceLock: true };
const DEFAULT_BLACKLIST: BlacklistRule[] = [
  { id: "rm-root", pattern: String.raw`^rm\s+-(rf|fr)\s+/(.*)?$`, label: "根目录强制删除", builtin: true },
  { id: "mkfs-device", pattern: String.raw`^mkfs(\.[a-z0-9]+)?\s+/dev/.*$`, label: "格式化块设备", builtin: true },
  { id: "dd-device", pattern: String.raw`^dd\s+if=.*\s+of=/dev/[a-z]+$`, label: "底层裸盘复写", builtin: true },
  { id: "iptables-flush", pattern: String.raw`^iptables\s+-(F|X|Z)$`, label: "清空所有防护链", builtin: true },
  { id: "drop-database", pattern: String.raw`DROP\s+DATABASE\s+.*`, label: "直接删除主数据库", builtin: true },
  { id: "chmod-root", pattern: String.raw`^chmod\s+-R\s+777\s+/$`, label: "根目录危险越权", builtin: true },
];

const statusLabel: Record<AiApproval["status"], string> = {
  pending: "待审批", rejected: "已拒绝", expired: "已过期", executing: "执行中", completed: "已完成", failed: "执行失败", unknown: "状态未知",
};
const statusColor: Record<AiApproval["status"], string> = { pending: "warning", rejected: "error", expired: "default", executing: "processing", completed: "success", failed: "error", unknown: "purple" };

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}
function formatTime(timestamp: number | null) {
  if (!timestamp) return "--";
  return new Date(timestamp * 1000).toLocaleString("zh-CN", { hour12: false });
}
function remaining(expiresAt: number) {
  const seconds = expiresAt - Math.floor(Date.now() / 1000);
  if (seconds <= 0) return "已过期";
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `剩余 ${minutes} 分钟` : `剩余 ${seconds} 秒`;
}
function todayStart() { const date = new Date(); date.setHours(0, 0, 0, 0); return Math.floor(date.getTime() / 1000); }

export default function SecurityPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<SecurityTab>("pending");
  const [approvals, setApprovals] = useState<AiApproval[]>([]);
  const [policy, setPolicy] = useState<GatePolicy>(DEFAULT_POLICY);
  const [blacklist, setBlacklist] = useState<BlacklistRule[]>(DEFAULT_BLACKLIST);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AiApproval["status"] | undefined>();
  const [ruleDrawerOpen, setRuleDrawerOpen] = useState(false);
  const [ruleDraft, setRuleDraft] = useState({ pattern: "", label: "" });
  const [ruleTest, setRuleTest] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [items, policyValue, blacklistValue] = await Promise.all([
        copilotApi.listApprovals(),
        configApi.get(POLICY_KEY).catch(() => null),
        configApi.get(BLACKLIST_KEY).catch(() => null),
      ]);
      setApprovals(items);
      setPolicy({ ...DEFAULT_POLICY, ...parseJson<Partial<GatePolicy>>(policyValue, {}) });
      setBlacklist(parseJson<BlacklistRule[]>(blacklistValue, DEFAULT_BLACKLIST));
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => { void load(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const pending = approvals.filter((item) => item.status === "pending");
  const today = todayStart();
  const approvedToday = approvals.filter((item) => item.status === "completed" && (item.finishedAt ?? item.decidedAt ?? 0) >= today).length;
  const rejectedCount = approvals.filter((item) => item.status === "rejected" || item.status === "failed").length;
  const averageMinutes = useMemo(() => {
    const decided = approvals.filter((item) => item.decidedAt && item.decidedAt >= item.requestedAt && item.status !== "pending");
    if (!decided.length) return "--";
    return (decided.reduce((sum, item) => sum + (item.decidedAt! - item.requestedAt) / 60, 0) / decided.length).toFixed(1);
  }, [approvals]);
  const visibleHistory = useMemo(() => approvals.filter((item) => {
    const query = search.trim().toLowerCase();
    return item.status !== "pending" && (!statusFilter || item.status === statusFilter) && (!query || `${item.id} ${item.serverAlias} ${item.action} ${item.command} ${item.result}`.toLowerCase().includes(query));
  }), [approvals, search, statusFilter]);

  const decide = (item: AiApproval, action: "approve" | "reject") => {
    if (action === "approve") {
      Modal.confirm({
        title: `批准并执行审批 #${item.id}？`,
        content: <div className="security-confirm"><p>目标：{item.serverAlias}</p><pre>{item.command}</pre><Alert type="warning" showIcon message="批准后后端会再次校验全局 AI 开关、服务器策略、审批有效期和动作白名单；执行一旦开始不可重复批准。" /></div>,
        okText: "确认批准执行", cancelText: "取消", okButtonProps: { danger: true }, maskClosable: false,
        onOk: async () => {
          setBusyId(item.id);
          try { const result = await copilotApi.approveApproval(item.id); setApprovals((current) => current.map((entry) => entry.id === result.id ? result : entry)); message.success(`审批 #${item.id} 已处理：${statusLabel[result.status]}`); }
          catch (error) { message.error(getErrorMessage(error)); await load(); }
          finally { setBusyId(null); }
        },
      });
      return;
    }
    let reason = "";
    Modal.confirm({
      title: `驳回审批 #${item.id}？`,
      content: <Input.TextArea autoFocus rows={3} placeholder="填写驳回原因（可选）" onChange={(event) => { reason = event.target.value; }} />,
      okText: "驳回申请", cancelText: "取消", okButtonProps: { danger: true }, maskClosable: false,
      onOk: async () => {
        setBusyId(item.id);
        try { await copilotApi.rejectApproval(item.id, reason.trim() || "人工审批驳回"); message.success(`审批 #${item.id} 已驳回`); await load(); }
        catch (error) { message.error(getErrorMessage(error)); }
        finally { setBusyId(null); }
      },
    });
  };

  const savePolicy = async () => {
    try { await configApi.set(POLICY_KEY, JSON.stringify(policy)); message.success("安全闸门策略已保存到本机"); }
    catch (error) { message.error(getErrorMessage(error)); }
  };
  const saveBlacklist = async (next: BlacklistRule[]) => {
    try { await configApi.set(BLACKLIST_KEY, JSON.stringify(next)); setBlacklist(next); message.success("高危拦截规则已保存"); }
    catch (error) { message.error(getErrorMessage(error)); }
  };
  const addRule = async () => {
    if (!ruleDraft.pattern.trim() || !ruleDraft.label.trim()) { message.warning("请填写规则正则和说明"); return; }
    try { new RegExp(ruleDraft.pattern); } catch { message.error("正则表达式格式无效"); return; }
    await saveBlacklist([...blacklist, { id: `custom-${Date.now()}`, pattern: ruleDraft.pattern.trim(), label: ruleDraft.label.trim() }]);
    setRuleDraft({ pattern: "", label: "" }); setRuleDrawerOpen(false);
  };

  const columns: ColumnsType<AiApproval> = [
    { title: "审批编号 / 操作", key: "action", render: (_, item) => <div><strong className="text-slate-100">#{item.id} · {item.action}</strong><code className="security-command">{item.command}</code></div> },
    { title: "目标服务器", dataIndex: "serverAlias", width: 150, render: (value: string, item) => <div><span>{value}</span><small className="block text-slate-500">ID {item.serverId}</small></div> },
    { title: "申请时间", dataIndex: "requestedAt", width: 155, render: (value: number) => formatTime(value) },
    { title: "裁决结果", dataIndex: "status", width: 110, render: (value: AiApproval["status"]) => <Tag color={statusColor[value]}>{statusLabel[value]}</Tag> },
    { title: "结果 / 原因", dataIndex: "result", render: (value: string) => <span className="security-result">{value || "--"}</span> },
  ];

  return <main className="ops-page security-page flex h-full min-h-0 flex-col gap-3 overflow-hidden p-4 text-xs sm:p-5">
    <header className="security-header"><div><div className="flex items-center gap-2"><ShieldAlert size={20} className="text-rose-400" /><h1>安全闸门与操作审批中心</h1><Tag color={pending.length ? "gold" : "green"}>{pending.length} 项待裁决</Tag></div><p>AI 负责探查、分析和起草；高危改动由工程师人工裁决，审批结果写入本机审计记录。</p></div><div className="flex flex-wrap gap-2"><Button size="small" icon={<ScrollText size={14} />} onClick={() => void navigate("/audit")}>查看关联审计</Button><Button size="small" icon={<RefreshCw size={14} />} loading={loading} onClick={() => void load()}>刷新</Button></div></header>
    <section className="security-kpis"><Kpi icon={<Inbox size={15} />} label="待决操作工单" value={pending.length} tone="amber" hint="需人工裁决" /><Kpi icon={<CheckCircle2 size={15} />} label="今日安全放行" value={approvedToday} tone="green" hint="24 小时统计" /><Kpi icon={<Ban size={15} />} label="拒绝 / 执行失败" value={rejectedCount} tone="rose" hint="后端安全门结果" /><Kpi icon={<Clock3 size={15} />} label="平均审批时效" value={averageMinutes} tone="indigo" hint="分钟" /></section>
    <nav className="security-tabs" aria-label="审批视图">{([ ["pending", <Inbox size={14} />, `待决审批队列 (${pending.length})`], ["history", <History size={14} />, "已审批轨迹记录"], ["policies", <Sliders size={14} />, "安全闸门策略配置"], ["blacklist", <Ban size={14} />, "高危指令拦截库"] ] as const).map(([key, icon, label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{icon}{label}</button>)}</nav>

    {tab === "pending" && <section className="security-scroll">{pending.length === 0 ? <Empty className="py-16" image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待裁决审批。AI 发起改动型操作后，申请会出现在这里。" /> : <div className="security-ticket-list">{pending.map((item) => <article key={item.id} className="security-ticket"><header><div className="min-w-0"><Tag color="gold">待审批</Tag><strong>工单 #{item.id} · {item.action}</strong></div><span className="security-expiry">{remaining(item.expiresAt)}</span></header><div className="security-ticket-meta"><span>目标服务器：<b>{item.serverAlias}</b></span><span>申请时间：{formatTime(item.requestedAt)}</span><span>到期时间：{formatTime(item.expiresAt)}</span></div><div className="security-script"><div className="security-script-title"><span>拟执行命令</span><Button type="link" size="small" icon={<FileSearch size={13} />} onClick={() => Modal.info({ title: `审批 #${item.id} 命令详情`, content: <pre className="security-command-detail">{item.command}</pre>, width: 680 })}>查看详情</Button></div><pre>{item.command}</pre></div><Alert type="warning" showIcon message="审批只允许后端受控白名单动作；命令会在执行前再次检查服务器策略和全局 AI 锁定状态。" /><footer><span>超过有效期后自动失效，不能重复执行</span><div><Button size="small" danger disabled={busyId !== null} onClick={() => decide(item, "reject")}>驳回并填报原因</Button><Button size="small" type="primary" loading={busyId === item.id} disabled={busyId !== null && busyId !== item.id} onClick={() => decide(item, "approve")}>确认批准放行执行</Button></div></footer></article>)}</div>}</section>}

    {tab === "history" && <section className="security-scroll security-history"><div className="security-filters"><Input.Search allowClear value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索服务器、动作、命令或结果" className="max-w-sm" /><Select allowClear value={statusFilter} onChange={setStatusFilter} placeholder="全部状态" options={Object.entries(statusLabel).filter(([key]) => key !== "pending").map(([value, label]) => ({ value, label }))} /><Tag color="blue">共 {visibleHistory.length} 条</Tag></div><Table<AiApproval> size="small" rowKey="id" loading={loading} dataSource={visibleHistory} columns={columns} pagination={{ pageSize: 10, showSizeChanger: false }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无审批轨迹" /> }} /></section>}

    {tab === "policies" && <section className="security-scroll"><div className="security-panel"><div className="security-section-title"><div><ShieldCheck size={16} className="text-indigo-400" /><div><h2>分级放行规则体系</h2><p>保存为本机策略偏好。真正的执行权限仍以 Rust 后端的全局锁、服务器 AI 档位和动作白名单为准。</p></div></div><Button type="primary" onClick={() => void savePolicy()}>保存策略变更</Button></div><div className="security-policy-list"><PolicyRow title="生产集群强制双人审批制" description="生产主机的配置变更、服务重启与网络调整必须经过人工审批。" checked={policy.productionDoubleApproval} onChange={(checked) => setPolicy((value) => ({ ...value, productionDoubleApproval: checked }))} /><PolicyRow title="测试集群低风险自愈免审" description="仅作为策略标记；当前后端不会因该开关绕过受控动作白名单。" checked={policy.testingAutofix} onChange={(checked) => setPolicy((value) => ({ ...value, testingAutofix: checked }))} /><PolicyRow title="夜间非运维时段强化防护" description="22:00 至 08:00 标记为高风险时段，建议保持 AI 放行状态锁定。" checked={policy.nightMode} onChange={(checked) => setPolicy((value) => ({ ...value, nightMode: checked }))} /><PolicyRow title="界面失焦与无人值守保护" description="应用失焦、最小化或锁屏后，配合 AI 总开关回归锁定状态。" checked={policy.zeroPresenceLock} onChange={(checked) => setPolicy((value) => ({ ...value, zeroPresenceLock: checked }))} /></div><Alert type="info" showIcon message="安全边界说明：关闭页面策略开关不会解锁 AI，也不会放宽服务器策略。要执行改动，必须通过 AI 总开关、服务器策略、审批有效期和后端动作白名单的联合校验。" /></div></section>}

    {tab === "blacklist" && <section className="security-scroll"><div className="security-panel"><div className="security-section-title"><div><Ban size={16} className="text-rose-400" /><div><h2>高危命令硬拦截规则库</h2><p>内置规则用于展示安全边界；危险命令仍由后端固定校验直接阻断，不能通过页面关闭。</p></div></div><Button icon={<Sliders size={14} />} onClick={() => setRuleDrawerOpen(true)}>新增拦截正则</Button></div><div className="security-rule-test"><Input value={ruleTest} onChange={(event) => setRuleTest(event.target.value)} placeholder="输入命令测试规则命中情况" /><Tag color={ruleTest && blacklist.some((rule) => { try { return new RegExp(rule.pattern, "i").test(ruleTest); } catch { return false; } }) ? "red" : "default"}>{ruleTest && blacklist.some((rule) => { try { return new RegExp(rule.pattern, "i").test(ruleTest); } catch { return false; } }) ? "命中拦截规则" : "未命中"}</Tag></div><div className="security-blacklist-grid">{blacklist.map((rule) => <div key={rule.id} className="security-blacklist-item"><div className="min-w-0"><code>{rule.pattern}</code><span>{rule.label}</span></div>{rule.builtin ? <Tag color="red">内置</Tag> : <Button type="text" danger size="small" icon={<Trash2 size={14} />} aria-label={`删除 ${rule.label}`} onClick={() => Modal.confirm({ title: `删除拦截规则“${rule.label}”？`, okText: "删除", cancelText: "取消", okButtonProps: { danger: true }, onOk: () => saveBlacklist(blacklist.filter((item) => item.id !== rule.id)) })} />}</div>)}</div></div></section>}

    <Drawer title="新增高危拦截正则" open={ruleDrawerOpen} onClose={() => setRuleDrawerOpen(false)} width={440} maskClosable={false} extra={<Button type="primary" onClick={() => void addRule()}>保存规则</Button>}><div className="security-form"><label>规则说明<Input value={ruleDraft.label} onChange={(event) => setRuleDraft((value) => ({ ...value, label: event.target.value }))} placeholder="例如：停止生产数据库服务" /></label><label>正则表达式<Input.TextArea rows={4} value={ruleDraft.pattern} onChange={(event) => setRuleDraft((value) => ({ ...value, pattern: event.target.value }))} placeholder={String.raw`^systemctl\s+stop\s+mysql$`} /></label><Alert type="warning" showIcon message="自定义规则用于本机策略记录和命令预检展示。生产环境的危险命令仍由 Rust 后端固定安全规则最终拦截。" /></div></Drawer>
  </main>;
}

function Kpi({ icon, label, value, tone, hint }: { icon: React.ReactNode; label: string; value: number | string; tone: string; hint: string }) { return <div className={`security-kpi ${tone}`}><span>{icon}{label}</span><strong>{value}</strong><small>{hint}</small></div>; }
function PolicyRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) { return <div className="security-policy-row"><div><strong>{title}</strong><p>{description}</p></div><Switch checked={checked} onChange={onChange} /></div>; }
