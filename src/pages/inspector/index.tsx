import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Alert, Button, Checkbox, Drawer, Input, InputNumber, Modal, Progress, Select, Segmented, Switch, Table, Tag, message } from "antd";
import { Activity, Archive, BellRing, CheckCircle2, Clipboard, Clock3, Download, FileText, History, Info, Loader2, Play, Plus, Radar, RefreshCw, Search, ShieldAlert, ShieldCheck, SlidersHorizontal, Terminal, Trash2 } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { fileApi } from "@/lib/api/file";
import { configApi } from "@/lib/api/config";
import { getErrorMessage } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";
import { inspectionApi } from "@/lib/api/inspection";
import type { WorkbenchCommandResult } from "@/lib/api/workbench";
import type { Server } from "@/types";
import "./inspector.css";

const RULES_KEY = "inspection.rules";
const SCHEDULE_KEY = "inspection.schedule";
const REPORTS_KEY = "inspection.reports";
type Severity = "critical" | "warning" | "info";
type SubTab = "diagnose" | "rules" | "schedule" | "history";
interface Finding { id: string; rule: string; title: string; severity: Severity; evidence: string; recommendation: string; serverAlias?: string; }
interface InspectionReport { id: string; createdAt: string; serverIds: number[]; targetLabel: string; score: number; findings: Finding[]; output: string; trigger: "manual" | "schedule"; }
interface InspectionRule { id: string; name: string; category: string; severity: Severity; probe: string; threshold: string; enabled: boolean; builtin?: boolean; }
interface ScheduleConfig { enabled: boolean; cron: string; scope: "all" | "linux" | "favorites"; scoreThreshold: number; criticalAlert: boolean; summaryAlert: boolean; }
interface HostResult { server: Server; result?: WorkbenchCommandResult; error?: string; }

const DEFAULT_RULES: InspectionRule[] = [
  { id: "disk-root", name: "根分区使用率", category: "资源", severity: "warning", probe: "df -P /", threshold: "使用率 < 80%", enabled: true, builtin: true },
  { id: "memory", name: "内存使用率", category: "资源", severity: "warning", probe: "free -m", threshold: "使用率 < 85%", enabled: true, builtin: true },
  { id: "ssh-root", name: "SSH root 口令登录", category: "安全", severity: "critical", probe: "sshd_config", threshold: "PermitRootLogin != yes", enabled: true, builtin: true },
  { id: "ssh-password", name: "SSH 密码认证策略", category: "安全", severity: "critical", probe: "sshd_config", threshold: "PasswordAuthentication != yes", enabled: true, builtin: true },
  { id: "public-mysql", name: "数据库公网监听", category: "网络", severity: "critical", probe: "ss -lnt", threshold: "3306 不监听 0.0.0.0", enabled: true, builtin: true },
  { id: "public-redis", name: "Redis 公网监听", category: "网络", severity: "critical", probe: "ss -lnt", threshold: "6379 不监听 0.0.0.0", enabled: true, builtin: true },
  { id: "docker", name: "容器异常退出", category: "服务", severity: "warning", probe: "docker ps -a", threshold: "无 Exit 137", enabled: true, builtin: true },
];

const DEFAULT_SCHEDULE: ScheduleConfig = { enabled: false, cron: "0 4 * * *", scope: "linux", scoreThreshold: 80, criticalAlert: true, summaryAlert: true };
const severityLabel: Record<Severity, string> = { critical: "严重", warning: "警告", info: "提示" };
const severityColor: Record<Severity, string> = { critical: "error", warning: "warning", info: "processing" };

function readJson<T>(configs: Array<{ key: string; value: string }>, key: string, fallback: T): T {
  const raw = configs.find((item) => item.key === key)?.value;
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function formatTime(value: string) { return new Date(value).toLocaleString("zh-CN", { hour12: false }); }

function cronMatches(expression: string, date: Date) {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const matches = (field: string, value: number) => {
    if (field === "*") return true;
    if (field.startsWith("*/")) { const step = Number(field.slice(2)); return Number.isInteger(step) && step > 0 && value % step === 0; }
    return field.split(",").some((part) => Number(part) === value);
  };
  const weekdayMatches = (fields[4] === "7" && date.getDay() === 0) || matches(fields[4], date.getDay());
  return matches(fields[0], date.getMinutes()) && matches(fields[1], date.getHours()) && matches(fields[2], date.getDate()) && matches(fields[3], date.getMonth() + 1) && weekdayMatches;
}

function isSupportedCron(expression: string) {
  const fields = expression.trim().split(/\s+/);
  const limits: Array<[number, number]> = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
  return fields.length === 5 && fields.every((field, index) => {
    if (field === "*") return true;
    if (/^\*\/\d+$/.test(field)) return Number(field.slice(2)) > 0 && Number(field.slice(2)) <= limits[index][1] + 1;
    return field.split(",").every((part) => /^\d+$/.test(part) && Number(part) >= limits[index][0] && Number(part) <= limits[index][1]);
  });
}

function scoreFromOutput(output: string, activeRules: InspectionRule[] = DEFAULT_RULES) {
  const rulesById = new Map(activeRules.filter((item) => item.enabled).map((item) => [item.id, item]));
  const enabled = new Set(rulesById.keys());
  const threshold = (id: string, fallback: number) => {
    const matched = rulesById.get(id)?.threshold.match(/[0-9]+(?:\.[0-9]+)?/);
    return matched ? Number(matched[0]) : fallback;
  };
  const disk = Number(output.match(/DISK\s+([0-9]+)%/)?.[1] ?? 0);
  const memory = Number(output.match(/MEM\s+([0-9]+)%/)?.[1] ?? 0);
  const findings: Finding[] = [];
  const diskLimit = threshold("disk-root", 80);
  if (enabled.has("disk-root") && disk >= Math.max(90, diskLimit + 10)) findings.push({ id: "disk-critical", rule: "disk-root", title: "根分区空间严重不足", severity: "critical", evidence: `根分区已使用 ${disk}%`, recommendation: "清理无用日志、扩容磁盘，并为根分区设置告警阈值。" });
  else if (enabled.has("disk-root") && disk >= diskLimit) findings.push({ id: "disk-warning", rule: "disk-root", title: "根分区使用率偏高", severity: "warning", evidence: `根分区已使用 ${disk}%`, recommendation: `检查大文件和日志轮转，建议将使用率控制在 ${diskLimit}% 以下。` });
  if (enabled.has("memory") && memory >= threshold("memory", 85)) findings.push({ id: "memory-warning", rule: "memory", title: "内存使用率偏高", severity: "warning", evidence: `内存使用率 ${memory}%`, recommendation: "检查内存占用进程，确认是否存在持续增长或缓存异常。" });
  const ports = output.match(/PORTS\s+(.+)/)?.[1] ?? "";
  if (enabled.has("public-mysql") && /(?:0\.0\.0\.0|\*):3306/.test(ports)) findings.push({ id: "mysql-public", rule: "public-mysql", title: "MySQL 端口可能对公网开放", severity: "critical", evidence: ports.trim(), recommendation: "限制 bind-address 或防火墙来源，仅允许业务网段访问。" });
  if (enabled.has("public-redis") && /(?:0\.0\.0\.0|\*):6379/.test(ports)) findings.push({ id: "redis-public", rule: "public-redis", title: "Redis 端口可能对公网开放", severity: "critical", evidence: ports.trim(), recommendation: "关闭公网监听并设置网络访问白名单。" });
  if (enabled.has("ssh-root") && /SSHROOT\s+yes\b/i.test(output)) findings.push({ id: "ssh-root-risk", rule: "ssh-root", title: "SSH 允许 root 直接登录", severity: "critical", evidence: "PermitRootLogin yes", recommendation: "评估业务依赖后，将 root 远程登录限制为密钥或禁用，并先通过审批验证变更。" });
  if (enabled.has("ssh-password") && /SSHPASS\s+yes\b/i.test(output)) findings.push({ id: "ssh-password-risk", rule: "ssh-password", title: "SSH 密码认证仍开启", severity: "warning", evidence: "PasswordAuthentication yes", recommendation: "优先改用密钥认证，并保留可用的应急登录方式。" });
  if (enabled.has("docker") && /DOCKER137\s+[1-9]/.test(output)) findings.push({ id: "docker-oom", rule: "docker", title: "发现容器 OOM 退出记录", severity: "warning", evidence: `最近退出码 137 的容器数 ${output.match(/DOCKER137\s+(\d+)/)?.[1]}`, recommendation: "检查容器内存限制、宿主机压力和近期容器事件。" });
  const score = Math.max(0, 100 - findings.reduce((sum, item) => sum + (item.severity === "critical" ? 18 : item.severity === "warning" ? 8 : 2), 0));
  return { score, findings };
}

function probeOutputProblem(result: WorkbenchCommandResult) {
  if (result.exitCode !== 0) return "探针退出码为 " + result.exitCode + (result.stderr ? "：" + result.stderr.trim() : "");
  if (!/^DISK\s+\d+%?\s*$/m.test(result.stdout)) return "未采集到有效的根分区使用率";
  if (!/^MEM\s+\d+%?\s*$/m.test(result.stdout)) return "未采集到有效的内存使用率";
  return undefined;
}

function reportMarkdown(report: InspectionReport) {
  const findings = report.findings.length ? report.findings.map((item, index) => `${index + 1}. [${severityLabel[item.severity]}] ${item.title}\n   - 依据：${item.evidence}\n   - 建议：${item.recommendation}`).join("\n") : "未发现风险，启用的规则全部通过。";
  return `# 服务器健康巡检报告\n- 报告编号：${report.id}\n- 巡检范围：${report.targetLabel}\n- 巡检时间：${formatTime(report.createdAt)}\n- 综合健康分：${report.score}/100\n\n## 风险与建议\n${findings}\n\n## 探针输出\n${report.output}\n`;
}

export default function InspectorPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [rules, setRules] = useState<InspectionRule[]>(DEFAULT_RULES);
  const [schedule, setSchedule] = useState<ScheduleConfig>(DEFAULT_SCHEDULE);
  const [activeSchedule, setActiveSchedule] = useState<ScheduleConfig>(DEFAULT_SCHEDULE);
  const [reports, setReports] = useState<InspectionReport[]>([]);
  const [activeTab, setActiveTab] = useState<SubTab>("diagnose");
  const [target, setTarget] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scanMessage, setScanMessage] = useState("");
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [hostResults, setHostResults] = useState<HostResult[]>([]);
  const [reportOpen, setReportOpen] = useState<InspectionReport | null>(null);
  const [diffReport, setDiffReport] = useState<InspectionReport | null>(null);
  const [ruleSearch, setRuleSearch] = useState("");
  const [ruleCategory, setRuleCategory] = useState("全部");
  const [ruleDrawer, setRuleDrawer] = useState(false);
  const [editingRule, setEditingRule] = useState<InspectionRule | null>(null);
  const [ruleDraft, setRuleDraft] = useState({ name: "", category: "自定义", severity: "warning" as Severity, probe: "", threshold: "" });
  const [saving, setSaving] = useState(false);

  const linuxServers = useMemo(() => servers.filter((item) => item.os_type === "linux"), [servers]);
  const selectedServers = useMemo(() => target === "all" ? linuxServers : linuxServers.filter((item) => String(item.id) === target), [linuxServers, target]);
  const latest = reports[0];
  const filteredRules = useMemo(() => rules.filter((item) => (!ruleCategory || ruleCategory === "全部" || item.category === ruleCategory) && `${item.name} ${item.probe} ${item.id}`.toLowerCase().includes(ruleSearch.trim().toLowerCase())), [ruleCategory, ruleSearch, rules]);
  const categories = ["全部", ...new Set(rules.map((item) => item.category))];
  const scanLock = useRef(false);
  const lastScheduledSlot = useRef(localStorage.getItem("inspection.lastScheduledSlot") ?? "");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [serverList, configs] = await Promise.all([serverApi.list(), configApi.getAll()]);
      setServers(serverList);
      const storedRules = readJson<InspectionRule[]>(configs, RULES_KEY, DEFAULT_RULES);
      setRules(storedRules.length ? storedRules : DEFAULT_RULES);
      setSchedule(readJson(configs, SCHEDULE_KEY, DEFAULT_SCHEDULE));
      setActiveSchedule(readJson(configs, SCHEDULE_KEY, DEFAULT_SCHEDULE));
      setReports(readJson<InspectionReport[]>(configs, REPORTS_KEY, []));
    } catch (error) { message.error(getErrorMessage(error)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const persist = async (key: string, value: unknown) => {
    try { await configApi.set(key, JSON.stringify(value)); }
    catch (error) { message.error(getErrorMessage(error)); throw error; }
  };

  const runScan = async (scheduled = false, explicitTargets?: Server[]) => {
    if (scanLock.current) return;
    const targets = explicitTargets ?? selectedServers;
    if (!targets.length) { if (!scheduled) message.warning("没有可巡检的 Linux 服务器"); return; }
    scanLock.current = true;
    setScanning(true); setProgress(4); setConsoleOpen(true); setHostResults([]); setScanMessage("正在初始化只读探针...");
    setConsoleLines([`[${new Date().toLocaleTimeString()}] 初始化 ${targets.length} 台 Linux 主机的只读巡检`]);
    const results: HostResult[] = [];
    for (let index = 0; index < targets.length; index += 1) {
      const server = targets[index];
      setProgress(Math.round(8 + (index / targets.length) * 82)); setScanMessage(`正在检查 ${server.alias} (${index + 1}/${targets.length})`);
      setConsoleLines((current) => [...current, `[Probe] ${server.alias} · 固定只读探针`]);
      try {
        const result = await inspectionApi.runProbe(server.id);
        const problem = probeOutputProblem(result);
        results.push({ server, result, error: problem });
        setConsoleLines((current) => [...current, problem ? "[Warning] " + server.alias + " · " + problem : "[Result] " + server.alias + " · exit=" + result.exitCode + " · " + (result.stderr || "探针完成")]);
      } catch (error) {
        const detail = getErrorMessage(error); results.push({ server, error: detail });
        setConsoleLines((current) => [...current, `[Error] ${server.alias} · ${detail}`]);
      }
      setHostResults([...results]);
    }
    const combined = results.map((item) => "HOST " + item.server.alias + "\n" + (item.error ? "ERROR " + item.error + "\n" : "") + (item.result?.stdout ?? "")).join("\n");
    const perHost = results.flatMap((item) => {
      if (!item.result || item.error) return [];
      const analysis = scoreFromOutput(item.result.stdout, rules);
      return analysis.findings.map((finding) => ({ ...finding, id: `${item.server.id}-${finding.id}`, serverAlias: item.server.alias }));
    });
    const scores = results.filter((item) => item.result && !item.error).map((item) => scoreFromOutput(item.result!.stdout, rules).score);
    const report: InspectionReport = { id: `INSP-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12)}-${Math.floor(100 + Math.random() * 900)}`, createdAt: new Date().toISOString(), serverIds: targets.map((item) => item.id), targetLabel: targets.length === 1 ? targets[0].alias : `Linux 集群 (${targets.length} 台)`, score: scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0, findings: perHost, output: combined, trigger: scheduled ? "schedule" : "manual" };
    const nextReports = [report, ...reports].slice(0, 50);
    setReports(nextReports); setProgress(100); setScanMessage("巡检完成，风险分析已生成"); setHostResults(results);
    try { await persist(REPORTS_KEY, nextReports); message.success(`巡检完成，健康分 ${report.score} 分`); } catch { /* persist 已提示 */ }
    if (scheduled && ((activeSchedule.criticalAlert && report.findings.some((item) => item.severity === "critical")) || (activeSchedule.scoreThreshold > 0 && report.score < activeSchedule.scoreThreshold))) {
      message.warning(`定时巡检发现风险：健康分 ${report.score}，严重风险 ${report.findings.filter((item) => item.severity === "critical").length} 项`);
    } else if (scheduled && activeSchedule.summaryAlert) {
      message.info(`定时巡检完成：健康分 ${report.score}，风险 ${report.findings.length} 项`);
    }
    setScanning(false); scanLock.current = false;
  };

  useEffect(() => {
    if (!activeSchedule.enabled || !servers.length) return;
    const targets = servers.filter((item) => item.os_type === "linux" && (activeSchedule.scope !== "favorites" || item.favorite));
    const timer = window.setInterval(() => {
      const now = new Date();
      const slot = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
      if (cronMatches(activeSchedule.cron, now) && lastScheduledSlot.current !== slot && !scanLock.current) {
        lastScheduledSlot.current = slot;
        localStorage.setItem("inspection.lastScheduledSlot", slot);
        void runScan(true, targets);
      }
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [activeSchedule, servers]);

  const saveRules = async (next: InspectionRule[]) => { setRules(next); await persist(RULES_KEY, next); message.success("巡检规则已保存"); };
  const saveSchedule = async () => { if (!isSupportedCron(schedule.cron)) { message.warning("Cron 仅支持 5 段格式、数字、*、*/步长和逗号列表"); return; } await persist(SCHEDULE_KEY, schedule); setActiveSchedule(schedule); message.success("定时巡检配置已保存"); };
  const resetRules = () => Modal.confirm({ title: "恢复推荐规则？", content: "自定义规则不会被删除，内置规则状态将恢复默认。", okText: "恢复", cancelText: "取消", async onOk() { const custom = rules.filter((item) => !item.builtin); await saveRules([...DEFAULT_RULES, ...custom]); } });
  const openNewRule = () => { setEditingRule(null); setRuleDraft({ name: "", category: "自定义", severity: "warning", probe: "", threshold: "" }); setRuleDrawer(true); };
  const openEditRule = (rule: InspectionRule) => { setEditingRule(rule); setRuleDraft({ name: rule.name, category: rule.category, severity: rule.severity, probe: rule.probe, threshold: rule.threshold }); setRuleDrawer(true); };
  const submitRule = async () => {
    if (!ruleDraft.name.trim() || !ruleDraft.probe.trim()) { message.warning("请输入规则名称和探针命令"); return; }
    const item: InspectionRule = { id: editingRule?.id ?? `custom-${Date.now()}`, ...ruleDraft, enabled: editingRule?.enabled ?? true, builtin: false };
    const next = editingRule ? rules.map((rule) => rule.id === editingRule.id ? item : rule) : [...rules, item];
    setSaving(true); try { await saveRules(next); setRuleDrawer(false); } finally { setSaving(false); }
  };
  const deleteRule = (rule: InspectionRule) => Modal.confirm({ title: `删除规则“${rule.name}”？`, okText: "删除", okButtonProps: { danger: true }, cancelText: "取消", async onOk() { await saveRules(rules.filter((item) => item.id !== rule.id)); } });
  const exportReport = async (report: InspectionReport) => {
    try { const path = await save({ title: "导出巡检报告", defaultPath: `${report.id}.md`, filters: [{ name: "Markdown", extensions: ["md"] }] }); if (!path) return; await fileApi.writeText(path, reportMarkdown(report)); message.success(`报告已导出：${path}`); }
    catch (error) { message.error(getErrorMessage(error)); }
  };
  const sendTestAlert = () => message.info("测试仅在本机展示；外部通知渠道尚未配置。手动发送不会连接服务器。");

  return <div className="ops-page inspector-page">
    <header className="inspector-header"><div className="inspector-title"><span className="inspector-title-icon"><ShieldCheck size={21} /></span><div><h1>AI 全域自动化巡检与漏洞雷达</h1><p>多主机只读探针、风险分级与健康趋势；执行结果保存在本机，修复动作仍需人工审批。</p></div></div><div className="inspector-actions"><Select value={target} onChange={setTarget} disabled={scanning} options={[{ value: "all", label: `全体 Linux 主机 (${linuxServers.length})` }, ...linuxServers.map((item) => ({ value: String(item.id), label: `${item.alias} · ${item.hostname}` }))]} /><Button icon={<Terminal size={14} />} onClick={() => setConsoleOpen((value) => !value)}>{consoleOpen ? "收起终端" : "探针终端"}</Button><Button icon={<Download size={14} />} disabled={!latest} onClick={() => latest && void exportReport(latest)}>导出报告</Button><Button type="primary" icon={scanning ? <Loader2 size={14} className="animate-spin" /> : <Radar size={14} />} disabled={scanning || !selectedServers.length} onClick={() => void runScan()}>{scanning ? "巡检执行中" : "启动全机 AI 巡检"}</Button></div></header>
    <section className="inspector-status"><div className="inspector-subtabs"><button className={activeTab === "diagnose" ? "active" : ""} onClick={() => setActiveTab("diagnose")}><Activity size={14} />健康诊断{latest && <b>{latest.findings.length}</b>}</button><button className={activeTab === "rules" ? "active" : ""} onClick={() => setActiveTab("rules")}><SlidersHorizontal size={14} />巡检规则库 ({rules.length})</button><button className={activeTab === "schedule" ? "active" : ""} onClick={() => setActiveTab("schedule")}><Clock3 size={14} />定时调度与通知</button><button className={activeTab === "history" ? "active" : ""} onClick={() => setActiveTab("history")}><History size={14} />历史走势与报告</button></div><span className="inspector-engine"><i />巡检引擎：只读 SSH 探针 · {latest ? `上次 ${formatTime(latest.createdAt)}` : "尚未执行"}<Button type="text" size="small" icon={<RefreshCw size={13} />} loading={loading} onClick={() => void load()} /></span></section>
    {scanning && <div className="inspector-progress"><div><span><Loader2 size={14} className="animate-spin" />{scanMessage}</span><b>{progress}%</b></div><Progress percent={progress} showInfo={false} size="small" /></div>}
    {activeTab === "diagnose" && <DiagnoseView servers={selectedServers} results={hostResults} latest={latest} reports={reports} schedule={activeSchedule} onSchedule={() => setActiveTab("schedule")} onReport={setReportOpen} onScan={runScan} rules={rules} />}
    {activeTab === "rules" && <RulesView rules={filteredRules} categories={categories} category={ruleCategory} search={ruleSearch} onCategory={setRuleCategory} onSearch={setRuleSearch} onToggle={async (rule) => saveRules(rules.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item))} onAdd={openNewRule} onEdit={openEditRule} onDelete={deleteRule} onReset={resetRules} />}
    {activeTab === "schedule" && <ScheduleView value={schedule} onChange={setSchedule} onSave={() => void saveSchedule()} onTest={sendTestAlert} />}
    {activeTab === "history" && <HistoryView reports={reports} onReport={setReportOpen} onDiff={setDiffReport} />}
    {consoleOpen && <section className="inspector-console"><div><span><Terminal size={14} />OpsPub Probe Engine 实时探针流水</span><Button type="text" size="small" icon={<Trash2 size={13} />} onClick={() => setConsoleLines([])}>清空</Button></div><pre>{consoleLines.length ? consoleLines.join("\n") : "等待下一轮巡检..."}</pre></section>}
    <Modal title={`巡检报告 · ${reportOpen?.id ?? ""}`} open={Boolean(reportOpen)} onCancel={() => setReportOpen(null)} footer={<><Button icon={<Clipboard size={13} />} onClick={() => reportOpen && navigator.clipboard.writeText(reportMarkdown(reportOpen)).then(() => message.success("报告 Markdown 已复制"))}>复制 Markdown</Button><Button type="primary" icon={<Download size={13} />} onClick={() => reportOpen && void exportReport(reportOpen)}>导出文件</Button></>} width={760}><ReportContent report={reportOpen} /></Modal>
    <Modal title="巡检 Diff 对比" open={Boolean(diffReport)} onCancel={() => setDiffReport(null)} footer={null}><DiffContent current={diffReport} previous={reports[reports.findIndex((item) => item.id === diffReport?.id) + 1]} /></Modal>
    <Drawer title={editingRule ? "编辑巡检规则" : "新建自定义巡检规则"} open={ruleDrawer} onClose={() => setRuleDrawer(false)} width={460} maskClosable={false} extra={<Button type="primary" loading={saving} onClick={() => void submitRule()}>保存</Button>}><div className="inspector-rule-form"><label>规则名称<Input value={ruleDraft.name} onChange={(event) => setRuleDraft((v) => ({ ...v, name: event.target.value }))} maxLength={80} /></label><label>分类<Select value={ruleDraft.category} onChange={(value) => setRuleDraft((v) => ({ ...v, category: value }))} options={["资源", "网络", "服务", "安全", "灾备", "自定义"].map((value) => ({ value, label: value }))} /></label><label>危害等级<Select value={ruleDraft.severity} onChange={(value) => setRuleDraft((v) => ({ ...v, severity: value }))} options={Object.entries(severityLabel).map(([value, label]) => ({ value, label }))} /></label><label>探针命令<Input.TextArea value={ruleDraft.probe} onChange={(event) => setRuleDraft((v) => ({ ...v, probe: event.target.value }))} rows={3} placeholder="填写拟纳入基线的只读命令" /></label><label>通过阈值<Input value={ruleDraft.threshold} onChange={(event) => setRuleDraft((v) => ({ ...v, threshold: event.target.value }))} placeholder="例如：使用率 < 80%" /></label><Alert type="warning" showIcon message="自定义规则当前仅保存为检查清单，不会执行其中的命令；需扩展受控探针后才能纳入自动检测。" /></div></Drawer>
  </div>;
}

function DiagnoseView({ servers, results, latest, reports, schedule, onSchedule, onReport, onScan, rules }: { servers: Server[]; results: HostResult[]; latest?: InspectionReport; reports: InspectionReport[]; schedule: ScheduleConfig; onSchedule: () => void; onReport: (report: InspectionReport) => void; onScan: () => void; rules: InspectionRule[] }) {
  const findingCount = latest?.findings.length ?? 0;
  const critical = latest?.findings.filter((item) => item.severity === "critical").length ?? 0;
  return <div className="inspector-content"><div className="inspector-kpis"><Kpi label="全网健康均分" value={latest ? `${latest.score}` : "--"} suffix="/100" tone={latest && latest.score < 80 ? "danger" : "success"} icon={<Activity size={17} />} /><Kpi label="待处置严重风险" value={String(critical)} suffix="项" tone="danger" icon={<ShieldAlert size={17} />} /><Kpi label="巡检发现风险" value={String(findingCount)} suffix="项" tone="warning" icon={<BellRing size={17} />} /><Kpi label="启用规则" value={String(rules.filter((item) => item.enabled).length)} suffix={`${schedule.enabled ? "· 已定时" : "· 手动"}`} tone="info" icon={<CheckCircle2 size={17} />} /></div><section className="inspector-panel"><div className="inspector-section-title"><span><ShieldCheck size={15} />纳管主机体检分布</span><small>{servers.length} 台目标 · 点击启动后查看实时结果</small></div><div className="inspector-host-grid">{servers.map((server) => { const item = results.find((entry) => entry.server.id === server.id); const parsed = item?.result ? scoreFromOutput(item.result.stdout, rules) : null; return <article key={server.id} className={`inspector-host-card ${item?.error ? "failed" : parsed && parsed.score < 80 ? "risk" : ""}`}><header><div><strong>{server.alias}</strong><span>{server.username}@{server.hostname}:{server.port}</span></div><Tag color={item?.error ? "error" : parsed ? parsed.score >= 90 ? "success" : parsed.score >= 80 ? "warning" : "error" : "default"}>{item?.error ? "失败" : parsed ? `${parsed.score} 分` : "待巡检"}</Tag></header><div className="inspector-host-body">{item?.error ? item.error : item?.result ? <><div className="inspector-mini-stat"><span>退出码</span><b>{item.result.exitCode}</b></div><pre>{item.result.stdout || "无探针输出"}</pre></> : <span className="inspector-muted">尚未执行探针</span>}</div></article>; })}</div>{!servers.length && <Alert type="warning" showIcon message="没有可巡检的 Linux 服务器，请先在服务器菜单添加并完成 SSH 验证。" />}</section><div className="inspector-overview-grid"><section className="inspector-panel inspector-schedule-card"><div className="inspector-section-title"><span><Clock3 size={15} />无人值守定时体检计划</span><Tag color={schedule.enabled ? "success" : "default"}>{schedule.enabled ? "已启用" : "未启用"}</Tag></div><div className="inspector-detail-list"><span>周期：<b>{schedule.cron}</b></span><span>范围：<b>{schedule.scope === "all" ? "全部服务器" : schedule.scope === "linux" ? "Linux 主机" : "收藏服务器"}</b></span><span>阈值：低于 <b>{schedule.scoreThreshold}</b> 分或严重风险触发</span></div><div className="inspector-card-actions"><Button onClick={onSchedule}>调度与告警设置</Button><Button onClick={() => message.info("测试消息仅在本机展示；尚未配置外部通知渠道。")}>模拟推送</Button></div></section><section className="inspector-panel"><div className="inspector-section-title"><span><History size={15} />最近风险漂移</span><Button type="link" size="small" onClick={() => reports[0] && onReport(reports[0])} disabled={!reports[0]}>查看最新报告</Button></div>{latest?.findings.length ? <div className="inspector-risk-feed">{latest.findings.slice(0, 4).map((item) => <div key={item.id}><i className={`dot-${item.severity}`} /><span>{item.serverAlias ? `${item.serverAlias} · ` : ""}{item.title}<small>{item.evidence}</small></span><Tag color={severityColor[item.severity]}>{severityLabel[item.severity]}</Tag></div>)}</div> : <div className="inspector-empty-inline">暂无风险漂移，执行一次巡检后显示。</div>}</section></div><section className="inspector-panel inspector-ai-card"><div><div className="inspector-section-title"><span><Radar size={15} />巡检风险建议</span><Tag color="purple">基于规则的只读分析</Tag></div><p>{latest ? `本轮检查发现 ${latest.findings.length} 项风险。请先查看报告证据，再通过审批菜单创建受控整改工单。` : "执行巡检后将根据探针证据生成风险清单和整改建议。"}</p></div><div className="inspector-card-actions"><Button type="primary" icon={<Play size={14} />} onClick={onScan} disabled={!servers.length}>重新巡检</Button><Button icon={<FileText size={14} />} onClick={() => latest && onReport(latest)} disabled={!latest}>查看报告</Button></div></section></div>;
}

function Kpi({ label, value, suffix, tone, icon }: { label: string; value: string; suffix: string; tone: "success" | "danger" | "warning" | "info"; icon: ReactNode }) { return <div className={`inspector-kpi ${tone}`}><div><span>{icon}{label}</span><strong>{value}<small>{suffix}</small></strong></div></div>; }

function RulesView({ rules, categories, category, search, onCategory, onSearch, onToggle, onAdd, onEdit, onDelete, onReset }: { rules: InspectionRule[]; categories: string[]; category: string; search: string; onCategory: (value: string) => void; onSearch: (value: string) => void; onToggle: (rule: InspectionRule) => void; onAdd: () => void; onEdit: (rule: InspectionRule) => void; onDelete: (rule: InspectionRule) => void; onReset: () => void }) { return <div className="inspector-content"><section className="inspector-panel inspector-rules-head"><div><div className="inspector-section-title"><span><SlidersHorizontal size={15} />全域巡检规则中心</span><Tag color="purple">CIS Benchmark</Tag></div><p>内置规则由固定只读探针执行；自定义规则保存为检查清单，不会向服务器下发任意命令。</p></div><div className="inspector-card-actions"><Button type="primary" icon={<Plus size={14} />} onClick={onAdd}>新建自定义探针规则</Button><Button icon={<RefreshCw size={14} />} onClick={onReset}>恢复推荐基线</Button></div></section><section className="inspector-rule-toolbar"><Segmented value={category} onChange={(value) => onCategory(String(value))} options={categories} /><Input allowClear value={search} onChange={(event) => onSearch(event.target.value)} prefix={<Search size={14} />} placeholder="搜索规则名称 / 探针命令 / ID" /></section><section className="inspector-panel inspector-table-wrap"><Table<InspectionRule> size="small" rowKey="id" pagination={{ pageSize: 10, showSizeChanger: false }} dataSource={rules} columns={[{ title: "状态", dataIndex: "enabled", width: 72, render: (value: boolean, row) => <Switch size="small" checked={value} onChange={() => onToggle(row)} /> }, { title: "规则标识 / 名称", dataIndex: "name", render: (value: string, row) => <div><strong>{value}</strong><small>{row.id}</small></div> }, { title: "分类", dataIndex: "category", width: 90 }, { title: "危害等级", dataIndex: "severity", width: 90, render: (value: Severity) => <Tag color={severityColor[value]}>{severityLabel[value]}</Tag> }, { title: "探针命令 / 逻辑", dataIndex: "probe", render: (value: string, row) => <div className="rule-probe"><code>{value}</code><small>{row.threshold || "未配置阈值"}</small></div> }, { title: "操作", key: "actions", width: 130, align: "right", render: (_: unknown, row) => <span className="table-actions"><Button type="link" size="small" disabled={row.builtin} onClick={() => onEdit(row)}>{row.builtin ? "内置规则" : "编辑"}</Button><Button type="link" danger size="small" disabled={row.builtin} onClick={() => onDelete(row)}>删除</Button></span> }]} /></section></div>; }

function ScheduleView({ value, onChange, onSave, onTest }: { value: ScheduleConfig; onChange: (value: ScheduleConfig) => void; onSave: () => void; onTest: () => void }) { return <div className="inspector-content"><div className="inspector-schedule-grid"><section className="inspector-panel inspector-form-panel"><div className="inspector-section-title"><span><Clock3 size={15} />无人值守定时自动化体检引擎</span><Switch checked={value.enabled} onChange={(enabled) => onChange({ ...value, enabled })} /></div>{value.enabled && <Alert type="warning" showIcon message="计划仅在 OpsPub 保持运行期间生效，应用关闭后不会在服务器后台执行。" />}<div className="inspector-form-grid"><label>执行频率模板<Select value={["0 4 * * *", "0 */6 * * *", "0 8 * * 1"].includes(value.cron) ? value.cron : "custom"} onChange={(cron) => onChange({ ...value, cron: cron === "custom" ? value.cron : cron })} options={[{ label: "每日凌晨 04:00（推荐）", value: "0 4 * * *" }, { label: "每 6 小时", value: "0 */6 * * *" }, { label: "每周一 08:00", value: "0 8 * * 1" }, { label: "自定义 Cron", value: "custom" }]} /></label><label>Cron 调度表达式<Input value={value.cron} onChange={(event) => onChange({ ...value, cron: event.target.value })} /></label><label>定时巡检资产范围<Select value={value.scope} onChange={(scope) => onChange({ ...value, scope })} options={[{ label: "全部服务器", value: "all" }, { label: "Linux 主机", value: "linux" }, { label: "收藏服务器", value: "favorites" }]} /></label><label>健康分告警阈值<InputNumber min={0} max={100} value={value.scoreThreshold} onChange={(scoreThreshold) => onChange({ ...value, scoreThreshold: scoreThreshold ?? 80 })} /></label></div><div className="inspector-protection"><Info size={14} /><span>只读探针通过已认证 SSH 会话执行；不修改远端配置，不上传原始凭据，输出保留在本机报告库。</span></div></section><section className="inspector-panel inspector-form-panel"><div className="inspector-section-title"><span><BellRing size={15} />告警策略与通知联动</span><Button size="small" onClick={onTest}>发送测试告警卡片</Button></div><div className="inspector-checks"><Checkbox checked={value.scoreThreshold > 0} onChange={(event) => onChange({ ...value, scoreThreshold: event.target.checked ? 80 : 0 })}>综合健康分低于阈值时提醒</Checkbox><Checkbox checked={value.criticalAlert} onChange={(event) => onChange({ ...value, criticalAlert: event.target.checked })}>发现严重风险立即提醒</Checkbox><Checkbox checked={value.summaryAlert} onChange={(event) => onChange({ ...value, summaryAlert: event.target.checked })}>巡检结束发送总结简报</Checkbox></div><div className="inspector-notice-card"><BellRing size={16} /><div><strong>通知渠道</strong><p>当前使用应用内通知和审计记录；钉钉、企业微信、邮件通道可在后续通知设置中绑定。</p></div></div><Button type="primary" onClick={onSave}>保存调度配置</Button></section></div></div>; }

function HistoryView({ reports, onReport, onDiff }: { reports: InspectionReport[]; onReport: (report: InspectionReport) => void; onDiff: (report: InspectionReport) => void }) { const latestScore = reports[0]?.score; return <div className="inspector-content"><div className="inspector-kpis"><Kpi label="累计执行体检" value={String(reports.length)} suffix="次" tone="info" icon={<History size={17} />} /><Kpi label="累计闭环风险" value="--" suffix="项" tone="success" icon={<CheckCircle2 size={17} />} /><Kpi label="最近 Diff 漂移" value={reports[1] && latestScore ? `${latestScore - reports[1].score}` : "--"} suffix="分" tone="danger" icon={<Activity size={17} />} /><Kpi label="报告保留" value="50" suffix="份" tone="warning" icon={<Archive size={17} />} /></div><section className="inspector-panel"><div className="inspector-section-title"><span><Activity size={15} />健康得分走势</span><small>分数越高表示启用的基线越稳定</small></div><div className="inspector-score-history">{reports.slice(0, 8).map((report) => <div key={report.id}><span>{formatTime(report.createdAt)}</span><div><i style={{ width: `${report.score}%` }} className={report.score < 80 ? "danger" : report.score < 90 ? "warning" : "success"} /></div><b>{report.score}</b></div>)}</div>{!reports.length && <div className="inspector-empty-inline">暂无历史报告，完成第一次巡检后会在这里形成趋势。</div>}</section><section className="inspector-panel inspector-table-wrap"><div className="inspector-section-title"><span><Archive size={15} />历史巡检报告归档台账</span></div><Table<InspectionReport> size="small" rowKey="id" dataSource={reports} pagination={{ pageSize: 8 }} columns={[{ title: "报告编号", dataIndex: "id", render: (value: string) => <code>{value}</code> }, { title: "巡检时间", dataIndex: "createdAt", render: (value: string) => formatTime(value) }, { title: "巡检范围", dataIndex: "targetLabel" }, { title: "健康得分", dataIndex: "score", render: (value: number) => <strong className={value < 80 ? "text-danger" : value < 90 ? "text-warning" : "text-success"}>{value} 分</strong> }, { title: "风险数", key: "findings", render: (_: unknown, row) => `${row.findings.length} 项` }, { title: "操作", key: "actions", align: "right", render: (_: unknown, row) => <span className="table-actions"><Button size="small" onClick={() => onReport(row)}>查看报告</Button><Button size="small" onClick={() => onDiff(row)}>Diff 对比</Button></span> }]} /></section></div>; }

function ReportContent({ report }: { report: InspectionReport | null }) { if (!report) return null; return <div className="inspector-report"><div className="inspector-report-summary"><span>健康得分<strong>{report.score}</strong>/100</span><span>风险<strong>{report.findings.length}</strong>项</span><span>主机<strong>{report.serverIds.length}</strong>台</span><span>时间<strong>{formatTime(report.createdAt)}</strong></span></div><div className="inspector-findings">{report.findings.length ? report.findings.map((item) => <article key={item.id}><header><Tag color={severityColor[item.severity]}>{severityLabel[item.severity]}</Tag><strong>{item.title}</strong></header><p>依据：{item.evidence}</p><p>建议：{item.recommendation}</p></article>) : <Alert type="success" showIcon message="本轮未发现风险" />}</div><pre className="inspector-report-output">{report.output || "无探针输出"}</pre></div>; }

function DiffContent({ current, previous }: { current: InspectionReport | null; previous?: InspectionReport }) { if (!current) return null; const delta = previous ? current.score - previous.score : 0; return <div className="inspector-diff"><Alert type={delta < 0 ? "warning" : "success"} showIcon message={previous ? `相比 ${formatTime(previous.createdAt)}，健康分 ${delta >= 0 ? "提升" : "下降"} ${Math.abs(delta)} 分` : "没有上一份报告可供对比"} /><div className="inspector-diff-columns"><div><strong>本轮风险 ({current.findings.length})</strong>{current.findings.map((item) => <p key={item.id}><Tag color={severityColor[item.severity]}>{severityLabel[item.severity]}</Tag>{item.title}</p>)}</div><div><strong>上一轮风险 ({previous?.findings.length ?? 0})</strong>{previous?.findings.map((item) => <p key={item.id}><Tag color={severityColor[item.severity]}>{severityLabel[item.severity]}</Tag>{item.title}</p>) ?? <p className="inspector-muted">无数据</p>}</div></div></div>; }
