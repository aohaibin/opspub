import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Alert, Button, Checkbox, Drawer, Input, InputNumber, Modal, Progress, Select, Segmented, Switch, Table, Tag, message } from "antd";
import { Activity, Archive, BellRing, CheckCircle2, Clipboard, Clock3, Download, FileText, History, Info, Loader2, Plus, Radar, RefreshCw, Search, Server as ServerIcon, ShieldAlert, ShieldCheck, SlidersHorizontal, Terminal, Trash2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { save } from "@tauri-apps/plugin-dialog";
import { WorkspaceSidebarSlot } from "@/components/layout/WorkspaceNavigation";
import { fileApi } from "@/lib/api/file";
import { configApi } from "@/lib/api/config";
import { getErrorMessage } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";
import { inspectionApi } from "@/lib/api/inspection";
import type { Server } from "@/types";
import { parseProbeOutput } from "./probeOutput";
import "./inspector.css";

const RULES_KEY = "inspection.rules";
const SCHEDULE_KEY = "inspection.schedule";
const REPORTS_KEY = "inspection.reports";
type Severity = "critical" | "warning" | "info";
type SubTab = "diagnose" | "rules" | "schedule" | "history";
interface Finding { id: string; rule: string; title: string; severity: Severity; evidence: string; recommendation: string; serverAlias?: string; }
interface InspectionReport { id: string; createdAt: string; serverIds: number[]; targetLabel: string; score: number | null; findings: Finding[]; output: string; trigger: "manual" | "schedule"; hosts?: HostResult[]; }
interface InspectionRule { id: string; name: string; category: string; severity: Severity; probe: string; threshold: string; enabled: boolean; builtin?: boolean; }
interface ScheduleConfig { enabled: boolean; cron: string; scope: "all" | "linux" | "favorites"; scoreThreshold: number; criticalAlert: boolean; summaryAlert: boolean; }
type HostResult = { serverId: number; alias: string } & (
  { score: number; findingCount: number; error?: never } |
  { error: string; score?: never; findingCount?: never }
);

const views = [
  { key: "diagnose", label: "健康诊断", Icon: Activity },
  { key: "rules", label: "巡检规则库", Icon: SlidersHorizontal },
  { key: "schedule", label: "定时调度与通知", Icon: Clock3 },
  { key: "history", label: "历史走势与报告", Icon: History },
] as const;

// 路由离开后探针仍可能在 Rust 中运行，返回时要等报告写入再读取。
let pendingScan: Promise<void> | undefined;

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

function sameTargets(left: number[], right: number[]) {
  return left.length === right.length && left.every((id) => right.includes(id));
}

function runSummary(report: InspectionReport) {
  if (!report.hosts) return "历史报告";
  const failures = report.hosts.filter((host) => host.error !== undefined).length;
  return failures === report.hosts.length ? "巡检失败" : failures ? "部分完成" : "巡检完成";
}

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

function scoreFromProbe(
  { disk, memory, ports, sshRoot, sshPassword, dockerOom }: ReturnType<typeof parseProbeOutput>,
  activeRules: InspectionRule[],
) {
  const rulesById = new Map(activeRules.filter((item) => item.enabled).map((item) => [item.id, item]));
  const enabled = new Set(rulesById.keys());
  const threshold = (id: string, fallback: number) => {
    const matched = rulesById.get(id)?.threshold.match(/[0-9]+(?:\.[0-9]+)?/);
    return matched ? Number(matched[0]) : fallback;
  };
  const findings: Finding[] = [];
  const diskLimit = threshold("disk-root", 80);
  if (enabled.has("disk-root") && disk >= Math.max(90, diskLimit + 10)) findings.push({ id: "disk-critical", rule: "disk-root", title: "根分区空间严重不足", severity: "critical", evidence: `根分区已使用 ${disk}%`, recommendation: "清理无用日志、扩容磁盘，并为根分区设置告警阈值。" });
  else if (enabled.has("disk-root") && disk >= diskLimit) findings.push({ id: "disk-warning", rule: "disk-root", title: "根分区使用率偏高", severity: "warning", evidence: `根分区已使用 ${disk}%`, recommendation: `检查大文件和日志轮转，建议将使用率控制在 ${diskLimit}% 以下。` });
  if (enabled.has("memory") && memory >= threshold("memory", 85)) findings.push({ id: "memory-warning", rule: "memory", title: "内存使用率偏高", severity: "warning", evidence: `内存使用率 ${memory}%`, recommendation: "检查内存占用进程，确认是否存在持续增长或缓存异常。" });
  if (enabled.has("public-mysql") && /(?:0\.0\.0\.0|\*):3306/.test(ports)) findings.push({ id: "mysql-public", rule: "public-mysql", title: "MySQL 端口可能对公网开放", severity: "critical", evidence: ports.trim(), recommendation: "限制 bind-address 或防火墙来源，仅允许业务网段访问。" });
  if (enabled.has("public-redis") && /(?:0\.0\.0\.0|\*):6379/.test(ports)) findings.push({ id: "redis-public", rule: "public-redis", title: "Redis 端口可能对公网开放", severity: "critical", evidence: ports.trim(), recommendation: "关闭公网监听并设置网络访问白名单。" });
  if (enabled.has("ssh-root") && sshRoot) findings.push({ id: "ssh-root-risk", rule: "ssh-root", title: "SSH 允许 root 直接登录", severity: "critical", evidence: "PermitRootLogin yes", recommendation: "评估业务依赖后，将 root 远程登录限制为密钥或禁用，并先通过审批验证变更。" });
  if (enabled.has("ssh-password") && sshPassword) findings.push({ id: "ssh-password-risk", rule: "ssh-password", title: "SSH 密码认证仍开启", severity: "warning", evidence: "PasswordAuthentication yes", recommendation: "优先改用密钥认证，并保留可用的应急登录方式。" });
  if (enabled.has("docker") && dockerOom > 0) findings.push({ id: "docker-oom", rule: "docker", title: "发现容器 OOM 退出记录", severity: "warning", evidence: `最近退出码 137 的容器数 ${dockerOom}`, recommendation: "检查容器内存限制、宿主机压力和近期容器事件。" });
  const score = Math.max(0, 100 - findings.reduce((sum, item) => sum + (item.severity === "critical" ? 18 : item.severity === "warning" ? 8 : 2), 0));
  return { score, findings };
}

function reportMarkdown(report: InspectionReport) {
  const findings = report.findings.length ? report.findings.map((item, index) => `${index + 1}. [${severityLabel[item.severity]}] ${item.serverAlias ? `${item.serverAlias} · ` : ""}${item.title}\n   - 依据：${item.evidence}\n   - 建议：${item.recommendation}`).join("\n") : "暂无风险记录。";
  const score = report.score === null ? "未生成" : `${report.score}/100`;
  return `# 服务器健康巡检报告\n- 报告编号：${report.id}\n- 巡检范围：${report.targetLabel}\n- 巡检时间：${formatTime(report.createdAt)}\n- 执行状态：${runSummary(report)}\n- 综合健康分：${score}\n\n## 风险与建议\n${findings}\n\n## 探针输出\n${report.output}\n`;
}

export default function InspectorPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [rules, setRules] = useState<InspectionRule[]>(DEFAULT_RULES);
  const [schedule, setSchedule] = useState<ScheduleConfig>(DEFAULT_SCHEDULE);
  const [activeSchedule, setActiveSchedule] = useState<ScheduleConfig>(DEFAULT_SCHEDULE);
  const [reports, setReports] = useState<InspectionReport[]>([]);
  const [params, setParams] = useSearchParams();
  const activeTab = views.find(({ key }) => key === params.get("view"))?.key ?? "diagnose";
  const target = params.get("target") ?? "all";
  const changeParam = (key: "view" | "target", value: string) => {
    const next = new URLSearchParams(params);
    if (value === "diagnose" || value === "all") next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };
  const setActiveTab = (tab: SubTab) => changeParam("view", tab);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scanMessage, setScanMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [hostResults, setHostResults] = useState<HostResult[]>([]);
  const [runningTargets, setRunningTargets] = useState<number[]>([]);
  const [runningHost, setRunningHost] = useState<number>();
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
  const selectedIds = selectedServers.map(({ id }) => id);
  const scopeReports = reports.filter((item) => sameTargets(item.serverIds, selectedIds));
  const latest = scopeReports[0];
  const historyReports = target === "all" ? reports : scopeReports;
  const diffIndex = diffReport ? reports.findIndex(({ id }) => id === diffReport.id) : -1;
  const previous = diffReport && diffIndex >= 0 && reports.slice(diffIndex + 1).find(
    (item) => sameTargets(item.serverIds, diffReport.serverIds),
  );
  const canRun = !loading && !loadError && !scanning && selectedServers.length > 0;
  const filteredRules = useMemo(() => rules.filter((item) => (!ruleCategory || ruleCategory === "全部" || item.category === ruleCategory) && `${item.name} ${item.probe} ${item.id}`.toLowerCase().includes(ruleSearch.trim().toLowerCase())), [ruleCategory, ruleSearch, rules]);
  const categories = ["全部", ...new Set(rules.map((item) => item.category))];
  const lastScheduledSlot = useRef(localStorage.getItem("inspection.lastScheduledSlot") ?? "");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await pendingScan;
      const [serverList, configs] = await Promise.all([serverApi.list(), configApi.getAll()]);
      setServers(serverList);
      const storedRules = readJson<InspectionRule[]>(configs, RULES_KEY, DEFAULT_RULES);
      setRules(storedRules.length ? storedRules : DEFAULT_RULES);
      const storedSchedule = { ...DEFAULT_SCHEDULE, ...readJson(configs, SCHEDULE_KEY, DEFAULT_SCHEDULE) };
      setSchedule(storedSchedule);
      setActiveSchedule(storedSchedule);
      setReports(readJson<InspectionReport[]>(configs, REPORTS_KEY, []));
      setHostResults([]);
      setSaveError("");
      setLoadError("");
    } catch (error) { setLoadError(getErrorMessage(error)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const persist = async (key: string, value: unknown) => {
    try { await configApi.set(key, JSON.stringify(value)); }
    catch (error) { message.error(getErrorMessage(error)); throw error; }
  };

  const runScan = useCallback((scheduled = false, explicitTargets?: Server[]) => {
    if (pendingScan || loading || loadError) return;
    const targets = explicitTargets ?? selectedServers;
    if (!targets.length) return;
    const serverIds = targets.map(({ id }) => id);
    const collect = async () => {
      setScanning(true);
      setProgress(0);
      setRunningTargets(serverIds);
      setHostResults([]);
      setSaveError("");
      setConsoleLines([]);
      const hosts: HostResult[] = [];
      const findings: Finding[] = [];
      const outputs: string[] = [];
      const scores: number[] = [];
      for (const [index, { id: serverId, alias }] of targets.entries()) {
        setRunningHost(serverId);
        setScanMessage(`正在检查 ${alias}（${index + 1}/${targets.length}）`);
        setConsoleLines((current) => [...current, `[Probe] ${alias}`]);
        let stdout = "";
        try {
          const result = await inspectionApi.runProbe(serverId);
          stdout = result.stdout;
          const analysis = scoreFromProbe(parseProbeOutput(result), rules);
          scores.push(analysis.score);
          findings.push(...analysis.findings.map((finding) => ({
            ...finding, id: `${serverId}-${finding.id}`, serverAlias: alias,
          })));
          hosts.push({ serverId, alias, score: analysis.score, findingCount: analysis.findings.length });
          outputs.push(`HOST ${alias}\n${stdout}`);
          setConsoleLines((current) => [...current, `[Result] ${alias} · ${analysis.score} 分`]);
        } catch (error) {
          const detail = getErrorMessage(error);
          hosts.push({ serverId, alias, error: detail });
          outputs.push(`HOST ${alias}\nERROR ${detail}\n${stdout}`);
          setConsoleLines((current) => [...current, `[Error] ${alias} · ${detail}`]);
        }
        setHostResults([...hosts]);
        setProgress(Math.round(((index + 1) / targets.length) * 100));
      }
      setRunningHost(undefined);
      setScanMessage("正在保存巡检报告");
      const score = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null;
      const report: InspectionReport = {
        id: `INSP-${crypto.randomUUID()}`,
        createdAt: new Date().toISOString(), serverIds, hosts, findings, score,
        targetLabel: targets.length === 1 ? targets[0].alias : `Linux 集群（${targets.length} 台）`,
        output: outputs.join("\n"), trigger: scheduled ? "schedule" : "manual",
      };
      const nextReports = [report, ...reports].slice(0, 50);
      await configApi.set(REPORTS_KEY, JSON.stringify(nextReports));
      setReports(nextReports);
      const status = runSummary(report);
      if (scores.length !== targets.length) message.warning(`${status}，成功 ${scores.length}/${targets.length} 台`);
      else if (!scheduled) message.success(`巡检完成，健康分 ${score} 分`);
      else if ((activeSchedule.criticalAlert && findings.some((item) => item.severity === "critical")) ||
        (activeSchedule.scoreThreshold > 0 && score !== null && score < activeSchedule.scoreThreshold)) {
        message.warning(`定时巡检发现风险：健康分 ${score}，风险 ${findings.length} 项`);
      } else if (activeSchedule.summaryAlert) {
        message.info(`定时巡检完成：健康分 ${score}，风险 ${findings.length} 项`);
      }
    };
    pendingScan = collect()
      .catch((error) => setSaveError(getErrorMessage(error)))
      .finally(() => {
        pendingScan = undefined;
        setScanning(false);
        setRunningHost(undefined);
      });
  }, [activeSchedule, loadError, loading, reports, rules, selectedServers]);

  useEffect(() => {
    if (loading || loadError || !activeSchedule.enabled) return;
    const targets = linuxServers.filter((item) => activeSchedule.scope !== "favorites" || item.favorite);
    if (!targets.length) return;
    const timer = window.setInterval(() => {
      const now = new Date();
      const slot = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
      if (cronMatches(activeSchedule.cron, now) && lastScheduledSlot.current !== slot && !pendingScan) {
        lastScheduledSlot.current = slot;
        localStorage.setItem("inspection.lastScheduledSlot", slot);
        void runScan(true, targets);
      }
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [activeSchedule, linuxServers, loadError, loading, runScan]);

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

  const viewButtons = views.map(({ key, label, Icon }) => (
    <button key={key} type="button" aria-pressed={activeTab === key} onClick={() => setActiveTab(key)}>
      <Icon size={14} aria-hidden />{label}{key === "rules" ? ` (${rules.length})` : ""}
    </button>
  ));
  const storedHosts = new Map<number, HostResult>();
  for (const report of reports) {
    const [serverId] = report.serverIds;
    const hosts = report.hosts ?? (report.serverIds.length === 1 && report.score !== null && report.score > 0
      ? [{ serverId, alias: report.targetLabel, score: report.score, findingCount: report.findings.length }]
      : []);
    for (const host of hosts) {
      if (!storedHosts.has(host.serverId)) storedHosts.set(host.serverId, host);
    }
  }
  const liveHosts = new Map(hostResults.map((host) => [host.serverId, host]));
  const currentRows = selectedServers.map((server) => ({
    server,
    result: (scanning && runningTargets.includes(server.id)) || liveHosts.has(server.id)
      ? liveHosts.get(server.id) : storedHosts.get(server.id),
    running: scanning && runningHost === server.id,
    queued: scanning && runningTargets.includes(server.id),
  }));

  const copyReport = async (report: InspectionReport) => {
    try {
      await navigator.clipboard.writeText(reportMarkdown(report));
      message.success("报告 Markdown 已复制");
    } catch (error) { message.error(getErrorMessage(error)); }
  };

  return (
    <div className="ops-page inspector-page">
      <WorkspaceSidebarSlot>
        <nav className="inspector-sidebar" aria-label="巡检视图">{viewButtons}</nav>
      </WorkspaceSidebarSlot>
      <header className="inspector-header">
        <div className="inspector-title">
          <span className="inspector-title-icon"><ShieldCheck size={19} aria-hidden /></span>
          <div><h1>深度巡检诊断</h1><p>Linux 主机只读巡检与风险报告</p></div>
        </div>
        <div className="inspector-actions">
          <label className="inspector-target">
            <ServerIcon size={15} aria-hidden />巡检目标
            <Select
              aria-label="巡检目标"
              value={target}
              onChange={(value) => changeParam("target", value)}
              disabled={loading || scanning}
              options={[
                { value: "all", label: `全部 Linux 主机（${linuxServers.length} 台）` },
                ...linuxServers.map(({ id, alias, hostname }) => ({ value: String(id), label: `${alias} · ${hostname}` })),
                ...(target !== "all" && !selectedServers.length ? [{ value: target, label: "所选服务器不可用", disabled: true }] : []),
              ]}
            />
          </label>
          <Button type="primary" icon={<Radar size={15} />} loading={scanning} disabled={!canRun} onClick={() => runScan()}>
            {scanning ? "巡检执行中" : "启动巡检"}
          </Button>
        </div>
      </header>
      <div className="inspector-status">
        <nav className="inspector-subtabs" aria-label="巡检工作区视图">{viewButtons}</nav>
        <div className="inspector-actions">
          <Button size="small" icon={<Terminal size={14} />} aria-expanded={consoleOpen} onClick={() => setConsoleOpen(!consoleOpen)}>探针输出</Button>
          <Button size="small" icon={<FileText size={14} />} disabled={!latest} onClick={() => setReportOpen(latest)}>查看报告</Button>
          <Button size="small" icon={<RefreshCw size={14} />} aria-label="刷新巡检数据" title="刷新巡检数据" loading={loading} disabled={scanning} onClick={() => void load()} />
        </div>
      </div>
      {loadError && <Alert type="error" showIcon title="巡检数据加载失败" description={loadError} />}
      {saveError && <Alert type="error" showIcon title="巡检报告保存失败" description={saveError} />}
      {scanning && (
        <div className="inspector-progress" role="status">
          <div><span><Loader2 size={14} className="animate-spin" aria-hidden />{scanMessage}</span><b>{progress}%</b></div>
          <Progress percent={progress} showInfo={false} size="small" />
        </div>
      )}
      {consoleOpen && (
        <section className="inspector-console">
          <div><span><Terminal size={14} aria-hidden />本次探针流水</span><Button type="text" size="small" icon={<Trash2 size={13} />} onClick={() => setConsoleLines([])}>清空</Button></div>
          <pre>{consoleLines.length ? consoleLines.join("\n") : "等待巡检输出"}</pre>
        </section>
      )}
      {activeTab === "diagnose" && (
        <DiagnoseView rows={currentRows} latest={latest} loading={loading} schedule={activeSchedule}
          onSchedule={() => setActiveTab("schedule")} onReport={setReportOpen} rules={rules} />
      )}
      {activeTab === "rules" && <RulesView rules={filteredRules} categories={categories} category={ruleCategory} search={ruleSearch} onCategory={setRuleCategory} onSearch={setRuleSearch} onToggle={async (rule) => saveRules(rules.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item))} onAdd={openNewRule} onEdit={openEditRule} onDelete={deleteRule} onReset={resetRules} />}
      {activeTab === "schedule" && <ScheduleView value={schedule} onChange={setSchedule} onSave={() => void saveSchedule()} onTest={sendTestAlert} />}
      {activeTab === "history" && <HistoryView reports={historyReports} onReport={setReportOpen} onDiff={setDiffReport} />}
      <Modal
        title={`巡检报告 · ${reportOpen?.targetLabel ?? ""}`}
        open={Boolean(reportOpen)}
        onCancel={() => setReportOpen(null)}
        footer={reportOpen && <>
          <Button icon={<Clipboard size={13} />} onClick={() => void copyReport(reportOpen)}>复制 Markdown</Button>
          <Button type="primary" icon={<Download size={13} />} onClick={() => void exportReport(reportOpen)}>导出文件</Button>
        </>}
        width={760}
        styles={dialogStyles}
      >
        <ReportContent report={reportOpen} />
      </Modal>
      <Modal title="巡检 Diff 对比" open={Boolean(diffReport)} onCancel={() => setDiffReport(null)} onOk={() => setDiffReport(null)} cancelButtonProps={{ style: { display: "none" } }} okText="关闭" styles={dialogStyles}>
        <DiffContent current={diffReport} previous={previous || undefined} />
      </Modal>
    <Drawer title={editingRule ? "编辑巡检规则" : "新建自定义巡检规则"} open={ruleDrawer} onClose={() => setRuleDrawer(false)} width={460} maskClosable={false} footer={<div className="inspector-drawer-footer"><Button onClick={() => setRuleDrawer(false)}>取消</Button><Button type="primary" loading={saving} onClick={() => void submitRule()}>保存</Button></div>}><div className="inspector-rule-form"><label>规则名称<Input value={ruleDraft.name} onChange={(event) => setRuleDraft((v) => ({ ...v, name: event.target.value }))} maxLength={80} /></label><label>分类<Select value={ruleDraft.category} onChange={(value) => setRuleDraft((v) => ({ ...v, category: value }))} options={["资源", "网络", "服务", "安全", "灾备", "自定义"].map((value) => ({ value, label: value }))} /></label><label>危害等级<Select value={ruleDraft.severity} onChange={(value) => setRuleDraft((v) => ({ ...v, severity: value }))} options={Object.entries(severityLabel).map(([value, label]) => ({ value, label }))} /></label><label>探针命令<Input.TextArea value={ruleDraft.probe} onChange={(event) => setRuleDraft((v) => ({ ...v, probe: event.target.value }))} rows={3} placeholder="填写拟纳入基线的只读命令" /></label><label>通过阈值<Input value={ruleDraft.threshold} onChange={(event) => setRuleDraft((v) => ({ ...v, threshold: event.target.value }))} placeholder="例如：使用率 < 80%" /></label><Alert type="warning" showIcon message="自定义规则当前仅保存为检查清单，不会执行其中的命令；需扩展受控探针后才能纳入自动检测。" /></div></Drawer>
    </div>
  );
}

const dialogStyles = { body: { maxHeight: "calc(100dvh - 210px)", overflowY: "auto" as const } };

function DiagnoseView({ rows, latest, loading, schedule, onSchedule, onReport, rules }: {
  rows: { server: Server; result?: HostResult; running: boolean; queued: boolean }[];
  latest?: InspectionReport;
  loading: boolean;
  schedule: ScheduleConfig;
  onSchedule: () => void;
  onReport: (report: InspectionReport) => void;
  rules: InspectionRule[];
}) {
  const hasScore = latest?.score != null;
  const critical = hasScore ? latest.findings.filter((item) => item.severity === "critical").length : undefined;
  const enabledRules = rules.filter((item) => item.enabled);
  return (
    <div className="inspector-content">
      <div className="inspector-kpis">
        <Kpi label="最近同范围健康分" value={String(latest?.score ?? "—")} suffix={latest?.score != null ? "/100" : ""} tone="info" icon={<Activity size={16} />} />
        <Kpi label="严重风险" value={String(critical ?? "—")} suffix={hasScore ? "项" : ""} tone="danger" icon={<ShieldAlert size={16} />} />
        <Kpi label="检测风险" value={hasScore ? String(latest.findings.length) : "—"} suffix={hasScore ? "项" : ""} tone="warning" icon={<BellRing size={16} />} />
        <Kpi label="启用检查项" value={String(enabledRules.length)} suffix="项" tone="success" icon={<CheckCircle2 size={16} />} />
      </div>
      <section className="inspector-panel">
        <div className="inspector-section-title">
          <span><ServerIcon size={15} aria-hidden />主机巡检结果</span>
          <small>{rows.length} 台 · 每台主机最近一次探针结果</small>
        </div>
        {rows.length ? <ul className="inspector-results" aria-label="主机巡检结果">
          {rows.map(({ server, result, running, queued }) => (
            <li key={server.id} className="inspector-result-row">
              <div className="inspector-host-name">
                <strong>{server.alias}</strong>
                <small>{server.hostname}:{server.port}</small>
              </div>
              <Tag color={result?.error !== undefined ? "error" : result ? "success" : running ? "processing" : "default"}>
                {result?.error !== undefined ? "失败" : result ? "完成" : running ? "执行中" : queued ? "等待执行" : "待巡检"}
              </Tag>
              <span className={result?.error !== undefined ? "inspector-result-error" : "inspector-muted"}>
                {result?.error ?? (result ? `${result.score} 分 · ${result.findingCount} 项风险` : "—")}
              </span>
            </li>
          ))}
        </ul> : <p className="inspector-empty-inline">{loading ? "正在读取服务器与巡检配置…" : "当前范围没有可巡检的 Linux 服务器"}</p>}
      </section>
      <section className="inspector-panel">
        <div className="inspector-section-title">
          <span><SlidersHorizontal size={15} aria-hidden />检查项</span>
          <small>{enabledRules.length} / {rules.length} 项已启用</small>
        </div>
        <ul className="inspector-check-items">
          {rules.map((rule) => <li key={rule.id}>{rule.name}<Tag color={!rule.enabled || !rule.builtin ? "default" : "success"}>{!rule.enabled ? "停用" : rule.builtin ? "启用" : "清单"}</Tag></li>)}
        </ul>
      </section>
      <div className="inspector-overview-grid">
        <section className="inspector-panel">
          <div className="inspector-section-title"><span><Clock3 size={15} />定时巡检计划</span><Tag color={schedule.enabled ? "success" : "default"}>{schedule.enabled ? "已启用" : "未启用"}</Tag></div>
          <div className="inspector-detail-list"><span>Cron · <b>{schedule.cron}</b></span><span>范围 · <b>{schedule.scope === "favorites" ? "收藏的 Linux 主机" : "Linux 主机"}</b></span></div>
          <div className="inspector-card-actions"><Button onClick={onSchedule}>打开巡检计划</Button></div>
        </section>
        <section className="inspector-panel">
          <div className="inspector-section-title"><span><History size={15} />本范围最近报告</span><Button type="link" size="small" disabled={!latest} onClick={() => latest && onReport(latest)}>查看报告</Button></div>
          {latest && <div className="inspector-detail-list">{runSummary(latest)} · {formatTime(latest.createdAt)}</div>}
          {latest?.findings.length ? (
            <div className="inspector-risk-feed">
              {latest.findings.slice(0, 4).map((item) => <div key={item.id}><i className={`dot-${item.severity}`} /><span>{item.serverAlias ? `${item.serverAlias} · ` : ""}{item.title}</span><Tag color={severityColor[item.severity]}>{severityLabel[item.severity]}</Tag></div>)}
            </div>
          ) : !latest && <div className="inspector-empty-inline">暂无巡检报告</div>}
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, suffix, tone, icon }: { label: string; value: string; suffix: string; tone: "success" | "danger" | "warning" | "info"; icon: ReactNode }) { return <div className={`inspector-kpi ${tone}`}><div><span>{icon}{label}</span><strong>{value}<small>{suffix}</small></strong></div></div>; }

function RulesView({ rules, categories, category, search, onCategory, onSearch, onToggle, onAdd, onEdit, onDelete, onReset }: { rules: InspectionRule[]; categories: string[]; category: string; search: string; onCategory: (value: string) => void; onSearch: (value: string) => void; onToggle: (rule: InspectionRule) => void; onAdd: () => void; onEdit: (rule: InspectionRule) => void; onDelete: (rule: InspectionRule) => void; onReset: () => void }) { return <div className="inspector-content"><section className="inspector-panel inspector-rules-head"><div><div className="inspector-section-title"><span><SlidersHorizontal size={15} />全域巡检规则中心</span><Tag color="purple">CIS Benchmark</Tag></div><p>内置规则由固定只读探针执行；自定义规则保存为检查清单，不会向服务器下发任意命令。</p></div><div className="inspector-card-actions"><Button type="primary" icon={<Plus size={14} />} onClick={onAdd}>新建自定义探针规则</Button><Button icon={<RefreshCw size={14} />} onClick={onReset}>恢复推荐基线</Button></div></section><section className="inspector-rule-toolbar"><Segmented value={category} onChange={(value) => onCategory(String(value))} options={categories} /><Input allowClear value={search} onChange={(event) => onSearch(event.target.value)} prefix={<Search size={14} />} placeholder="搜索规则名称 / 探针命令 / ID" /></section><section className="inspector-panel inspector-table-wrap"><Table<InspectionRule> size="small" rowKey="id" pagination={{ pageSize: 10, showSizeChanger: false }} dataSource={rules} columns={[{ title: "状态", dataIndex: "enabled", width: 72, render: (value: boolean, row) => <Switch size="small" checked={value} onChange={() => onToggle(row)} /> }, { title: "规则标识 / 名称", dataIndex: "name", render: (value: string, row) => <div><strong>{value}</strong><small>{row.id}</small></div> }, { title: "分类", dataIndex: "category", width: 90 }, { title: "危害等级", dataIndex: "severity", width: 90, render: (value: Severity) => <Tag color={severityColor[value]}>{severityLabel[value]}</Tag> }, { title: "探针命令 / 逻辑", dataIndex: "probe", render: (value: string, row) => <div className="rule-probe"><code>{value}</code><small>{row.threshold || "未配置阈值"}</small></div> }, { title: "操作", key: "actions", width: 130, align: "right", render: (_: unknown, row) => <span className="table-actions"><Button type="link" size="small" disabled={row.builtin} onClick={() => onEdit(row)}>{row.builtin ? "内置规则" : "编辑"}</Button><Button type="link" danger size="small" disabled={row.builtin} onClick={() => onDelete(row)}>删除</Button></span> }]} /></section></div>; }

function ScheduleView({ value, onChange, onSave, onTest }: { value: ScheduleConfig; onChange: (value: ScheduleConfig) => void; onSave: () => void; onTest: () => void }) { return <div className="inspector-content"><div className="inspector-schedule-grid"><section className="inspector-panel inspector-form-panel"><div className="inspector-section-title"><span><Clock3 size={15} />无人值守定时自动化体检引擎</span><Switch checked={value.enabled} onChange={(enabled) => onChange({ ...value, enabled })} /></div>{value.enabled && <Alert type="warning" showIcon message="计划仅在 OpsPub 保持运行期间生效，应用关闭后不会在服务器后台执行。" />}<div className="inspector-form-grid"><label>执行频率模板<Select value={["0 4 * * *", "0 */6 * * *", "0 8 * * 1"].includes(value.cron) ? value.cron : "custom"} onChange={(cron) => onChange({ ...value, cron: cron === "custom" ? value.cron : cron })} options={[{ label: "每日凌晨 04:00（推荐）", value: "0 4 * * *" }, { label: "每 6 小时", value: "0 */6 * * *" }, { label: "每周一 08:00", value: "0 8 * * 1" }, { label: "自定义 Cron", value: "custom" }]} /></label><label>Cron 调度表达式<Input value={value.cron} onChange={(event) => onChange({ ...value, cron: event.target.value })} /></label><label>定时巡检资产范围<Select value={value.scope} onChange={(scope) => onChange({ ...value, scope })} options={[{ label: "全部服务器", value: "all" }, { label: "Linux 主机", value: "linux" }, { label: "收藏服务器", value: "favorites" }]} /></label><label>健康分告警阈值<InputNumber min={0} max={100} value={value.scoreThreshold} onChange={(scoreThreshold) => onChange({ ...value, scoreThreshold: scoreThreshold ?? 80 })} /></label></div><div className="inspector-protection"><Info size={14} /><span>只读探针通过已认证 SSH 会话执行；不修改远端配置，不上传原始凭据，输出保留在本机报告库。</span></div></section><section className="inspector-panel inspector-form-panel"><div className="inspector-section-title"><span><BellRing size={15} />告警策略与通知联动</span><Button size="small" onClick={onTest}>发送测试告警卡片</Button></div><div className="inspector-checks"><Checkbox checked={value.scoreThreshold > 0} onChange={(event) => onChange({ ...value, scoreThreshold: event.target.checked ? 80 : 0 })}>综合健康分低于阈值时提醒</Checkbox><Checkbox checked={value.criticalAlert} onChange={(event) => onChange({ ...value, criticalAlert: event.target.checked })}>发现严重风险立即提醒</Checkbox><Checkbox checked={value.summaryAlert} onChange={(event) => onChange({ ...value, summaryAlert: event.target.checked })}>巡检结束发送总结简报</Checkbox></div><div className="inspector-notice-card"><BellRing size={16} /><div><strong>通知渠道</strong><p>当前使用应用内通知和审计记录；钉钉、企业微信、邮件通道可在后续通知设置中绑定。</p></div></div><Button type="primary" onClick={onSave}>保存调度配置</Button></section></div></div>; }

function HistoryView({ reports, onReport, onDiff }: {
  reports: InspectionReport[];
  onReport: (report: InspectionReport) => void;
  onDiff: (report: InspectionReport) => void;
}) {
  const latest = reports[0];
  const trend = latest ? reports.filter((item) => sameTargets(item.serverIds, latest.serverIds)).slice(0, 8) : [];
  return (
    <div className="inspector-content">
      <section className="inspector-panel">
        <div className="inspector-section-title"><span><Activity size={15} />健康得分走势</span><small>{latest?.targetLabel}</small></div>
        {trend.length ? <div className="inspector-score-history">
          {trend.map((report) => (
            <div key={report.id}>
              <span>{formatTime(report.createdAt)}</span>
              <div><i style={{ width: `${report.score ?? 0}%` }} className={report.score === null || report.score < 80 ? "danger" : report.score < 90 ? "warning" : "success"} /></div>
              <b>{report.score ?? "—"}</b>
            </div>
          ))}
        </div> : <p className="inspector-empty-inline">暂无历史报告</p>}
      </section>
      <section className="inspector-panel inspector-table-wrap">
        <div className="inspector-section-title"><span><Archive size={15} />巡检报告归档</span><small>{reports.length} 份</small></div>
        <Table<InspectionReport> size="small" rowKey="id" dataSource={reports} pagination={{ pageSize: 8, hideOnSinglePage: true }}
          columns={[
            { title: "巡检时间", dataIndex: "createdAt", render: formatTime },
            { title: "巡检范围", dataIndex: "targetLabel" },
            { title: "状态", key: "status", render: (_, report) => runSummary(report) },
            { title: "健康分", dataIndex: "score", render: (score: number | null) => score ?? "—" },
            { title: "风险数", key: "findings", render: (_, report) => report.score === null ? "—" : report.findings.length },
            { title: "操作", key: "actions", align: "right", render: (_, report) => (
              <span className="inspector-table-actions">
                <Button size="small" onClick={() => onReport(report)}>查看报告</Button>
                <Button size="small" onClick={() => onDiff(report)}>Diff 对比</Button>
              </span>
            ) },
          ]}
        />
      </section>
    </div>
  );
}

function ReportContent({ report }: { report: InspectionReport | null }) {
  if (!report) return null;
  return (
    <div className="inspector-report">
      <div className="inspector-report-summary">
        <span>状态<strong>{runSummary(report)}</strong></span>
        <span>健康分<strong>{report.score === null ? "—" : `${report.score}/100`}</strong></span>
        <span>主机<strong>{report.serverIds.length} 台</strong></span>
        <span>时间<strong>{formatTime(report.createdAt)}</strong></span>
      </div>
      {report.hosts?.some((host) => host.error !== undefined) && (
        <Alert type={report.score === null ? "error" : "warning"} showIcon title={runSummary(report)}
          description={<ul>{report.hosts.filter((host) => host.error !== undefined).map((host) => (
            <li key={host.serverId}>{host.alias} · {host.error}</li>
          ))}</ul>}
        />
      )}
      <div className="inspector-findings">
        {report.findings.map((item) => <article key={item.id}>
          <header><Tag color={severityColor[item.severity]}>{severityLabel[item.severity]}</Tag><strong>{item.serverAlias ? `${item.serverAlias} · ` : ""}{item.title}</strong></header>
          <p>依据：{item.evidence}</p><p>建议：{item.recommendation}</p>
        </article>)}
        {!report.findings.length && report.score !== null && (
          <Alert type="info" showIcon title={report.hosts ? "已完成的探针未发现风险" : "历史报告未记录风险"} />
        )}
      </div>
      <pre className="inspector-report-output">{report.output || "无探针输出"}</pre>
    </div>
  );
}

function DiffContent({ current, previous }: { current: InspectionReport | null; previous?: InspectionReport }) {
  if (!current) return null;
  const delta = previous?.score != null && current.score != null ? current.score - previous.score : null;
  return (
    <div className="inspector-diff">
      <Alert type={delta !== null && delta < 0 ? "warning" : "info"} showIcon title={
        delta !== null && previous
          ? `相比 ${formatTime(previous.createdAt)}，健康分变化 ${delta > 0 ? "+" : ""}${delta} 分`
          : previous ? "有报告未生成健康分" : "暂无同范围的上一份报告"
      } />
      <div className="inspector-diff-columns">
        {[current, previous].map((report, index) => <div key={index}>
          <strong>{index === 0 ? "本轮风险" : "上一轮风险"}</strong>
          {report?.findings.map((item) => <p key={item.id}><Tag color={severityColor[item.severity]}>{severityLabel[item.severity]}</Tag>{item.title}</p>)}
          {!report?.findings.length && <p className="inspector-muted">暂无风险记录</p>}
        </div>)}
      </div>
    </div>
  );
}
