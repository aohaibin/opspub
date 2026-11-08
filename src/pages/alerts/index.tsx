import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Checkbox, Drawer, Empty, Input, InputNumber, Modal, Select, Segmented, Switch, Table, Tag, message } from "antd";
import { Activity, Bell, BellRing, Check, CheckCircle2, ExternalLink, Plus, RefreshCw, Search, Send, Settings2, ShieldCheck, Siren, Trash2, VolumeX } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { alertsApi, DEFAULT_ALERT_CHANNELS, DEFAULT_ALERT_RULES, type AlertChannel, type AlertEvent, type AlertMetric, type AlertOperator, type AlertRule, type AlertSeverity } from "@/lib/api/alerts";
import { getErrorMessage } from "@/lib/api/client";
import { inspectionApi } from "@/lib/api/inspection";
import { serverApi } from "@/lib/api/server";
import type { Server } from "@/types";
import "./alerts.css";

type Tab = "events" | "rules" | "channels";
type EventFilter = "active" | "all";
type ProbeSample = { server: Server; output: string; error?: string };
type RuleDraft = Pick<AlertRule, "name" | "metric" | "operator" | "threshold" | "severity" | "target" | "enabled">;

const severityLabel: Record<AlertSeverity, string> = { critical: "严重", warning: "警告", info: "提示" };
const severityColor: Record<AlertSeverity, string> = { critical: "red", warning: "gold", info: "blue" };
const metricLabel: Record<AlertMetric, string> = { disk: "根分区磁盘使用率", memory: "内存使用率", "public-listen": "MySQL / Redis 公网监听", "docker-oom": "容器 OOM 退出" };
const operatorLabel: Record<AlertOperator, string> = { ">": ">", ">=": "≥", "<": "<", "<=": "≤" };
const emptyDraft: RuleDraft = { name: "", metric: "disk", operator: ">=", threshold: 85, severity: "warning", target: "all", enabled: true };

function nowIso() { return new Date().toISOString(); }
function formatTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false }); }
function getMetricValue(output: string, metric: AlertMetric) {
  if (metric === "disk") return output.match(/^DISK\s+(\d+)%?\s*$/m)?.[1];
  if (metric === "memory") return output.match(/^MEM\s+(\d+)%?\s*$/m)?.[1];
  if (metric === "public-listen") {
    const ports = output.match(/^PORTS\s*(.*)$/m);
    if (!ports) return undefined;
    return /(?:0\.0\.0\.0|\*):(?:3306|6379)(?:\s|$)/m.test(ports[1]) ? "开放" : "关闭";
  }
  return output.match(/^DOCKER137\s+(\d+)\s*$/m)?.[1];
}
function violates(rule: AlertRule, raw: string) {
  if (rule.metric === "public-listen") return raw === "开放";
  const value = Number(raw);
  if (!Number.isFinite(value)) return false;
  switch (rule.operator) {
    case ">": return value > rule.threshold;
    case ">=": return value >= rule.threshold;
    case "<": return value < rule.threshold;
    case "<=": return value <= rule.threshold;
  }
}
function thresholdText(rule: AlertRule) { return rule.metric === "public-listen" ? "0.0.0.0:3306 / 6379" : `${operatorLabel[rule.operator]} ${rule.threshold}${rule.metric === "disk" || rule.metric === "memory" ? "%" : ""}`; }
function recommendation(metric: AlertMetric) {
  switch (metric) {
    case "disk": return "核查大文件与日志增长趋势，清理前先确认保留策略和业务依赖。";
    case "memory": return "检查内存占用进程、容器限制和近期流量变化，确认是否持续增长。";
    case "public-listen": return "核对服务 bind-address 与防火墙来源范围；变更请通过审批流程执行。";
    case "docker-oom": return "查看容器退出记录、内存限制与宿主机压力，再评估是否需要调整资源。";
  }
}

export default function AlertsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("events");
  const [servers, setServers] = useState<Server[]>([]);
  const [rules, setRules] = useState<AlertRule[]>(DEFAULT_ALERT_RULES);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const [samples, setSamples] = useState<ProbeSample[]>([]);
  const [lastCheckAt, setLastCheckAt] = useState<string>();
  const [eventFilter, setEventFilter] = useState<EventFilter>("active");
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity>();
  const [serverFilter, setServerFilter] = useState<number>();
  const [search, setSearch] = useState("");
  const [ruleSearch, setRuleSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<AlertRule | null>(null);
  const [draft, setDraft] = useState<RuleDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [intervalMinutes, setIntervalMinutes] = useState(5);
  const [channels, setChannels] = useState<AlertChannel[]>(DEFAULT_ALERT_CHANNELS);
  const [channelStatuses, setChannelStatuses] = useState<Record<string, boolean>>({});
  const [channelDrawerKind, setChannelDrawerKind] = useState<"feishu" | "wecom" | "custom" | null>(null);
  const [channelUrl, setChannelUrl] = useState("");
  const [channelSaving, setChannelSaving] = useState(false);
  const checkLock = useRef(false);

  const linuxServers = useMemo(() => servers.filter((server) => server.os_type === "linux"), [servers]);
  const activeCount = events.filter((event) => event.status !== "resolved").length;
  const criticalCount = events.filter((event) => event.status === "active" && event.severity === "critical").length;
  const visibleEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return events.filter((event) => (eventFilter === "all" || event.status !== "resolved")
      && (!severityFilter || event.severity === severityFilter)
      && (!serverFilter || event.serverId === serverFilter)
      && (!query || `${event.ruleName} ${event.serverAlias} ${event.hostname} ${event.summary} ${event.value}`.toLowerCase().includes(query)))
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  }, [events, eventFilter, severityFilter, serverFilter, search]);
  const visibleRules = useMemo(() => rules.filter((rule) => `${rule.name} ${metricLabel[rule.metric]}`.toLowerCase().includes(ruleSearch.trim().toLowerCase())), [rules, ruleSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const remoteKinds = ["feishu", "wecom", "custom"] as const;
      const [serverList, savedRules, savedEvents, savedChannels, statuses] = await Promise.all([
        serverApi.list(),
        alertsApi.getRules(),
        alertsApi.getEvents(),
        alertsApi.getChannels(),
        Promise.all(remoteKinds.map(async (kind) => [kind, await alertsApi.getChannelStatus(kind).catch(() => false)] as const)),
      ]);
      setServers(serverList);
      setRules(savedRules);
      setEvents(savedEvents);
      setChannels(DEFAULT_ALERT_CHANNELS.map((item) => savedChannels.find((saved) => saved.id === item.id) ?? item));
      setChannelStatuses(Object.fromEntries(statuses));
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const persistEvents = async (next: AlertEvent[]) => {
    setEvents(next);
    try { await alertsApi.saveEvents(next); }
    catch (error) { message.error(getErrorMessage(error)); }
  };

  const runCheck = useCallback(async (quiet = false) => {
    if (checkLock.current) return;
    const enabledRules = rules.filter((rule) => rule.enabled);
    const targetServers = linuxServers.filter((server) => enabledRules.some((rule) => rule.target === "all" || server.favorite));
    if (!targetServers.length) {
      if (!quiet) message.warning("没有符合规则范围的 Linux 服务器");
      return;
    }
    checkLock.current = true;
    setChecking(true);
    const nextSamples: ProbeSample[] = [];
    for (const server of targetServers) {
      try {
        const result = await inspectionApi.runProbe(server.id);
        if (result.exitCode !== 0) nextSamples.push({ server, output: result.stdout, error: result.stderr || `探针退出码 ${result.exitCode}` });
        else nextSamples.push({ server, output: result.stdout });
      } catch (error) {
        nextSamples.push({ server, output: "", error: getErrorMessage(error) });
      }
    }
    setSamples(nextSamples);
    const timestamp = nowIso();
    setLastCheckAt(timestamp);
    const next = [...events];
    const triggered: AlertEvent[] = [];
    let sampleFailures = 0;
    for (const sample of nextSamples) {
      if (sample.error) { sampleFailures += 1; continue; }
      const targetRules = enabledRules.filter((rule) => rule.target === "all" || sample.server.favorite);
      for (const rule of targetRules) {
        const raw = getMetricValue(sample.output, rule.metric);
        if (raw === undefined) continue;
        const existingIndex = next.findIndex((event) => event.serverId === sample.server.id && event.ruleId === rule.id && event.status !== "resolved");
        if (violates(rule, raw)) {
          if (existingIndex >= 0) {
            const current = next[existingIndex];
            const muteExpired = current.status === "silenced" && current.silencedUntil && new Date(current.silencedUntil).getTime() <= Date.now();
            next[existingIndex] = { ...current, status: muteExpired ? "active" : current.status, silencedUntil: muteExpired ? undefined : current.silencedUntil, value: raw + (rule.metric === "disk" || rule.metric === "memory" ? "%" : ""), lastSeenAt: timestamp, summary: `${rule.name}：当前值 ${raw}${rule.metric === "disk" || rule.metric === "memory" ? "%" : ""}，触发条件 ${thresholdText(rule)}` };
            if (muteExpired) triggered.push(next[existingIndex]);
          } else {
            const event: AlertEvent = {
              id: `ALT-${Date.now()}-${sample.server.id}-${rule.id}`,
              ruleId: rule.id,
              ruleName: rule.name,
              serverId: sample.server.id,
              serverAlias: sample.server.alias,
              hostname: sample.server.hostname,
              severity: rule.severity,
              metric: rule.metric,
              value: raw + (rule.metric === "disk" || rule.metric === "memory" ? "%" : ""),
              threshold: thresholdText(rule),
              summary: `${rule.name}：当前值 ${raw}${rule.metric === "disk" || rule.metric === "memory" ? "%" : ""}，触发条件 ${thresholdText(rule)}`,
              recommendation: recommendation(rule.metric),
              status: "active",
              firstSeenAt: timestamp,
              lastSeenAt: timestamp,
            };
            next.unshift(event);
            triggered.push(event);
          }
        } else if (existingIndex >= 0) {
          next[existingIndex] = { ...next[existingIndex], status: "resolved", resolvedAt: timestamp, lastSeenAt: timestamp, value: raw + (rule.metric === "disk" || rule.metric === "memory" ? "%" : "") };
        }
      }
    }
    const trimmed = next.slice(0, 300);
    await persistEvents(trimmed);
    if (triggered.length) {
      const title = `OpsPub 告警：${triggered.length} 条新事件`;
      const body = triggered.map((event) => `${event.severity === "critical" ? "严重" : event.severity === "warning" ? "警告" : "提示"} · ${event.serverAlias} · ${event.summary}`).join("\n");
      if (channels.some((channel) => channel.kind === "local" && channel.enabled)) {
        message.info(`${title}。请在告警事件中查看详情。`);
      }
      const targets = channels.filter((channel) => channel.enabled && channel.kind !== "local" && channelStatuses[channel.kind]);
      const results = await Promise.allSettled(targets.map((channel) => alertsApi.sendChannel(channel.kind as "feishu" | "wecom" | "custom", title, body)));
      if (results.some((result) => result.status === "rejected")) {
        message.warning("告警已记录，但至少一个通知渠道发送失败，请检查渠道配置。");
      }
    }
    setChecking(false);
    checkLock.current = false;
    if (triggered.length) {
      const highest = triggered.some((event) => event.severity === "critical");
      (highest ? message.error : message.warning)(`巡检发现 ${triggered.length} 条新告警`);
    } else if (!quiet) {
      message.success(sampleFailures ? `检查完成，${sampleFailures} 台服务器采集失败，结果请核查` : "检查完成，未发现新告警");
    }
  }, [channels, channelStatuses, events, linuxServers, rules]);

  useEffect(() => {
    if (!monitoring) return;
    const timer = window.setInterval(() => { void runCheck(true); }, intervalMinutes * 60_000);
    return () => window.clearInterval(timer);
  }, [monitoring, intervalMinutes, runCheck]);

  const saveRules = async (next: AlertRule[]) => {
    setSaving(true);
    try {
      await alertsApi.saveRules(next);
      setRules(next);
      setDrawerOpen(false);
      message.success("告警规则已保存");
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const openAddRule = () => { setEditing(null); setDraft(emptyDraft); setDrawerOpen(true); };
  const openEditRule = (rule: AlertRule) => { setEditing(rule); setDraft({ name: rule.name, metric: rule.metric, operator: rule.operator, threshold: rule.threshold, severity: rule.severity, target: rule.target, enabled: rule.enabled }); setDrawerOpen(true); };
  const submitRule = async () => {
    if (!draft.name.trim()) { message.warning("请填写规则名称"); return; }
    if (draft.metric !== "public-listen" && (!Number.isFinite(draft.threshold) || draft.threshold < 0 || draft.threshold > 100)) { message.warning("阈值需为 0 到 100 的数字"); return; }
    const timestamp = nowIso();
    const nextRule: AlertRule = { ...draft, name: draft.name.trim(), id: editing?.id ?? `custom-${Date.now()}`, createdAt: editing?.createdAt || timestamp, updatedAt: timestamp };
    const next = editing ? rules.map((rule) => rule.id === editing.id ? nextRule : rule) : [nextRule, ...rules];
    await saveRules(next);
  };
  const toggleRule = (rule: AlertRule, enabled: boolean) => void saveRules(rules.map((item) => item.id === rule.id ? { ...item, enabled, updatedAt: nowIso() } : item));
  const deleteRule = (rule: AlertRule) => Modal.confirm({ title: `删除规则“${rule.name}”？`, content: "已生成的告警历史会保留。", okText: "删除", cancelText: "取消", okButtonProps: { danger: true }, onOk: () => saveRules(rules.filter((item) => item.id !== rule.id)) });

  const updateEvent = async (event: AlertEvent, action: "resolve" | "silence") => {
    const timestamp = nowIso();
    const next = events.map((item) => item.id !== event.id ? item : action === "resolve"
      ? { ...item, status: "resolved" as const, resolvedAt: timestamp }
      : { ...item, status: "silenced" as const, silencedUntil: new Date(Date.now() + 60 * 60_000).toISOString() });
    await persistEvents(next);
    message.success(action === "resolve" ? "事件已标记恢复" : "已静音 1 小时");
  };

  const saveChannels = async (next: AlertChannel[]) => {
    try {
      await alertsApi.saveChannels(next);
      setChannels(next);
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const toggleChannel = (channel: AlertChannel, enabled: boolean) => {
    void saveChannels(channels.map((item) => item.id === channel.id ? { ...item, enabled } : item));
  };

  const openChannelDrawer = (kind: "feishu" | "wecom" | "custom") => {
    setChannelDrawerKind(kind);
    setChannelUrl("");
  };

  const saveChannel = async () => {
    if (!channelDrawerKind || !channelUrl.trim()) {
      message.warning("请输入通知渠道地址");
      return;
    }
    setChannelSaving(true);
    try {
      await alertsApi.saveChannelUrl(channelDrawerKind, channelUrl.trim());
      setChannelStatuses((current) => ({ ...current, [channelDrawerKind]: true }));
      await saveChannels(channels.map((item) => item.kind === channelDrawerKind ? { ...item, enabled: true } : item));
      setChannelDrawerKind(null);
      setChannelUrl("");
      message.success("通知渠道已保存");
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setChannelSaving(false);
    }
  };

  const testChannel = async (kind: "feishu" | "wecom" | "custom") => {
    if (!channelStatuses[kind]) {
      openChannelDrawer(kind);
      return;
    }
    setChannelSaving(true);
    try {
      await alertsApi.sendChannel(kind, "OpsPub 测试告警", "这是一条来自 OpsPub 告警中心的测试通知。");
      message.success("测试告警已发送");
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setChannelSaving(false);
    }
  };

  const deleteChannel = (kind: "feishu" | "wecom" | "custom") => {
    Modal.confirm({
      title: "删除通知渠道配置？",
      content: "删除后该渠道不会再收到新告警，历史事件仍会保留。",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await alertsApi.deleteChannelUrl(kind);
          setChannelStatuses((current) => ({ ...current, [kind]: false }));
          await saveChannels(channels.map((item) => item.kind === kind ? { ...item, enabled: false } : item));
          message.success("通知渠道配置已删除");
        } catch (error) {
          message.error(getErrorMessage(error));
        }
      },
    });
  };

  const channelMeta: Record<AlertChannel["kind"], { title: string; description: string; color: string; icon: React.ReactNode }> = {
    local: { title: "应用内通知", description: "告警产生时在应用内提示，并写入本机历史。", color: "emerald", icon: <BellRing size={16} /> },
    feishu: { title: "飞书群机器人", description: "发送交互卡片，适合团队群内接收告警。", color: "blue", icon: <Send size={16} /> },
    wecom: { title: "企业微信机器人", description: "发送 Markdown 群聊通知，保留严重级别与来源。", color: "emerald", icon: <Bell size={16} /> },
    custom: { title: "自定义 HTTP Webhook", description: "发送 title、body、source 标准 JSON 到自建接收端。", color: "purple", icon: <Settings2 size={16} /> },
  };

  const ruleColumns = [
    { title: "状态", dataIndex: "enabled", width: 72, render: (enabled: boolean, rule: AlertRule) => <Switch size="small" checked={enabled} onChange={(checked) => toggleRule(rule, checked)} /> },
    { title: "规则名称", dataIndex: "name", render: (name: string, rule: AlertRule) => <div><strong>{name}</strong><small className="block text-slate-500">{rule.id}</small></div> },
    { title: "指标与阈值", key: "metric", render: (_: unknown, rule: AlertRule) => <div><span>{metricLabel[rule.metric]}</span><small className="block font-mono text-cyan-300">{thresholdText(rule)}</small></div> },
    { title: "级别", dataIndex: "severity", width: 92, render: (severity: AlertSeverity) => <Tag color={severityColor[severity]}>{severityLabel[severity]}</Tag> },
    { title: "生效范围", dataIndex: "target", width: 130, render: (target: AlertRule["target"]) => target === "all" ? "全部 Linux 主机" : "收藏的 Linux 主机" },
    { title: "操作", key: "actions", width: 120, align: "right" as const, render: (_: unknown, rule: AlertRule) => <span className="inline-flex gap-2"><Button type="link" size="small" onClick={() => openEditRule(rule)}>编辑</Button><Button type="link" size="small" danger onClick={() => deleteRule(rule)}>删除</Button></span> },
  ];

  return <main className="ops-page alerts-page flex h-full min-h-0 flex-col gap-3 overflow-hidden p-4 text-xs sm:p-5">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
      <div className="min-w-0"><div className="flex items-center gap-2"><BellRing size={18} className="text-rose-400" /><h1 className="m-0 text-base font-bold text-white">告警</h1><Tag color={activeCount ? "red" : "green"} className="m-0">{activeCount} 个活跃事件</Tag></div><p className="mb-0 mt-1 text-xs text-slate-400">本机规则评估固定只读探针结果；不会自动执行修复命令。通知只使用已明确配置的渠道。</p></div>
      <div className="flex shrink-0 flex-wrap items-center gap-2"><Button size="small" icon={<RefreshCw size={14} />} loading={loading || checking} onClick={() => { void load(); }}>刷新</Button>{tab === "events" && <><Select size="small" value={intervalMinutes} onChange={setIntervalMinutes} options={[{ label: "每 1 分钟", value: 1 }, { label: "每 5 分钟", value: 5 }, { label: "每 15 分钟", value: 15 }]} /><Button size="small" type={monitoring ? "default" : "primary"} icon={<Activity size={14} />} onClick={() => setMonitoring((value) => !value)}>{monitoring ? "停止监控" : "开启页面监控"}</Button><Button size="small" type="primary" loading={checking} disabled={!linuxServers.length} onClick={() => void runCheck()}>{checking ? "检查中" : "立即检查"}</Button></>}</div>
    </header>

    <section className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="告警视图"><button className={`alert-tab ${tab === "events" ? "active" : ""}`} onClick={() => setTab("events")}><Bell size={14} />告警事件 <b>{activeCount}</b></button><button className={`alert-tab ${tab === "rules" ? "active" : ""}`} onClick={() => setTab("rules")}><ShieldCheck size={14} />告警规则 <b>{rules.length}</b></button><button className={`alert-tab ${tab === "channels" ? "active" : ""}`} onClick={() => setTab("channels")}><Send size={14} />通知渠道</button></div>
      {tab === "events" && <Segmented size="small" value={eventFilter} onChange={(value) => setEventFilter(value as EventFilter)} options={[{ label: "活跃", value: "active" }, { label: "全部", value: "all" }]} />}
    </section>

    {monitoring && <Alert className="shrink-0" type="info" showIcon message={`页面监控已开启：每 ${intervalMinutes} 分钟连接目标 Linux 服务器读取只读指标。离开本页或关闭应用后自动停止。`} />}

    {tab === "events" && <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <section className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4"><Kpi label="活跃事件" value={activeCount} icon={<BellRing size={15} />} tone="rose" /><Kpi label="严重事件" value={criticalCount} icon={<Siren size={15} />} tone="red" /><Kpi label="告警规则" value={rules.filter((rule) => rule.enabled).length} icon={<ShieldCheck size={15} />} tone="cyan" /><Kpi label="纳管 Linux 主机" value={linuxServers.length} icon={<Activity size={15} />} tone="green" /></section>
      <section className="flex shrink-0 flex-wrap items-center gap-2"><Select allowClear size="small" value={severityFilter} onChange={setSeverityFilter} placeholder="全部级别" className="w-32" options={Object.entries(severityLabel).map(([value, label]) => ({ value, label }))} /><Select allowClear showSearch optionFilterProp="label" size="small" value={serverFilter} onChange={setServerFilter} placeholder="全部服务器" className="w-48" options={linuxServers.map((server) => ({ value: server.id, label: server.alias }))} /><Input allowClear size="small" prefix={<Search size={13} />} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索事件 / 服务器" className="max-w-72 flex-1" /><span className="ml-auto text-[11px] text-slate-500">最近一次采样：{lastCheckAt ? formatTime(lastCheckAt) : "尚未执行"}</span></section>
      {samples.some((sample) => sample.error) && <Alert className="shrink-0" type="warning" showIcon message={`有 ${samples.filter((sample) => sample.error).length} 台服务器采集失败`} description={<div className="max-h-20 overflow-auto">{samples.filter((sample) => sample.error).map((sample) => <div key={sample.server.id}>{sample.server.alias}：{sample.error}</div>)}</div>} />}
      <section className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-800 bg-[#0f141c]">
      {visibleEvents.length ? <div className="flex flex-col divide-y divide-slate-800">{visibleEvents.map((event) => <article key={event.id} className={`alert-event ${event.severity}`}><header className="flex flex-wrap items-start justify-between gap-2"><div className="flex min-w-0 items-start gap-2"><Tag color={severityColor[event.severity]}>{event.status === "resolved" ? "已恢复" : event.status === "silenced" ? "已静音" : severityLabel[event.severity]}</Tag><div className="min-w-0"><strong className="block text-sm text-slate-100">{event.summary}</strong><span className="mt-1 block text-[11px] text-slate-400">{event.serverAlias} · {event.hostname} · {event.ruleName}</span></div></div><span className="shrink-0 font-mono text-[11px] text-slate-500">{formatTime(event.firstSeenAt)}</span></header><div className="mt-3 rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2"><div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-300"><Activity size={13} />处置建议</div><p className="mb-0 mt-1 leading-relaxed text-slate-300">{event.recommendation}</p></div><footer className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/70 pt-2"><span className="text-[10px] text-slate-500">首次 {formatTime(event.firstSeenAt)} · 最近 {formatTime(event.lastSeenAt)}{event.silencedUntil ? ` · 静音至 ${formatTime(event.silencedUntil)}` : ""}</span><div className="flex gap-1"><Button size="small" icon={<ExternalLink size={13} />} onClick={() => void navigate("/terminal", { state: { serverId: event.serverId } })}>打开终端</Button>{event.status !== "resolved" && <Button size="small" icon={<VolumeX size={13} />} onClick={() => void updateEvent(event, "silence")}>静音 1 小时</Button>}{event.status !== "resolved" && <Button size="small" type="primary" ghost icon={<Check size={13} />} onClick={() => void updateEvent(event, "resolve")}>标记已恢复</Button>}</div></footer></article>)}</div> : <Empty className="py-12" image={Empty.PRESENTED_IMAGE_SIMPLE} description={loading ? "正在加载告警事件" : eventFilter === "active" ? "暂无活跃告警，完成一次检查以获取真实指标" : "暂无历史事件"}><Button size="small" onClick={() => setTab("rules")}>查看告警规则</Button></Empty>}
      </section>
    </div>}

    {tab === "rules" && <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"><section className="flex shrink-0 flex-wrap items-center justify-between gap-2"><div><strong className="text-sm text-slate-200">本机只读探针规则库</strong><p className="mb-0 mt-1 text-[11px] text-slate-400">规则只评估固定探针采样项；不支持的指标不会伪装成已监控。</p></div><div className="flex flex-wrap gap-2"><Input allowClear size="small" prefix={<Search size={13} />} value={ruleSearch} onChange={(event) => setRuleSearch(event.target.value)} placeholder="搜索告警规则" className="w-56" /><Button size="small" type="primary" icon={<Plus size={14} />} onClick={openAddRule}>添加监控规则</Button></div></section><section className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-800 bg-[#0f141c]"><Table<AlertRule> size="small" rowKey="id" loading={loading} dataSource={visibleRules} columns={ruleColumns} pagination={{ pageSize: 10, showSizeChanger: false }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的规则" /> }} /></section><Alert className="shrink-0" type="warning" showIcon message="删除规则不会删除历史事件。改变规则阈值后，下次采样才会按新阈值评估。" /></div>}

    {tab === "channels" && <div className="min-h-0 flex-1 overflow-auto"><div className="grid grid-cols-1 gap-3 lg:grid-cols-3">{channels.map((channel) => {
      const meta = channelMeta[channel.kind];
      const remote = channel.kind !== "local";
      const configured = channel.kind === "local" || Boolean(channelStatuses[channel.kind]);
      return <ChannelCard key={channel.id} icon={meta.icon} title={meta.title} status={configured ? (channel.enabled ? "已启用" : "已暂停") : "未配置"} color={meta.color} description={meta.description} action={<div className="flex flex-wrap items-center justify-between gap-2"><Switch size="small" checked={channel.enabled} disabled={remote && !configured} onChange={(enabled) => toggleChannel(channel, enabled)} /><div className="flex flex-wrap gap-2">{!remote && <Button size="small" onClick={() => message.info("OpsPub 测试通知：告警事件会显示在本机应用内。")}>发送测试</Button>}{remote && <Button size="small" icon={<Settings2 size={13} />} onClick={() => openChannelDrawer(channel.kind as "feishu" | "wecom" | "custom")}>{configured ? "修改配置" : "配置地址"}</Button>}{remote && <Button size="small" disabled={!configured} loading={channelSaving} onClick={() => void testChannel(channel.kind as "feishu" | "wecom" | "custom")}>发送测试</Button>}{remote && configured && <Button size="small" danger type="text" icon={<Trash2 size={13} />} onClick={() => deleteChannel(channel.kind as "feishu" | "wecom" | "custom")} aria-label="删除渠道配置" />}</div></div>} />;
    })}</div><Alert className="mt-3" type="info" showIcon message="告警只在检查发现新触发或静音到期后发送一次；启用的已配置渠道会同时收到通知。" /></div>}

    <Drawer title={editing ? "编辑告警规则" : "新建告警规则"} open={drawerOpen} onClose={() => setDrawerOpen(false)} width={480} maskClosable={false} extra={<Button type="primary" loading={saving} onClick={() => void submitRule()}>保存规则</Button>}><div className="flex flex-col gap-4"><label className="alert-form-field">规则名称<Input value={draft.name} maxLength={80} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} placeholder="例如：生产主机根分区水位" /></label><label className="alert-form-field">监控指标<Select value={draft.metric} onChange={(metric) => setDraft((value) => ({ ...value, metric }))} options={Object.entries(metricLabel).map(([value, label]) => ({ value, label }))} /></label>{draft.metric !== "public-listen" && <div className="grid grid-cols-[120px_1fr] gap-3"><label className="alert-form-field">比较符<Select value={draft.operator} onChange={(operator) => setDraft((value) => ({ ...value, operator }))} options={Object.entries(operatorLabel).map(([value, label]) => ({ value, label }))} /></label><label className="alert-form-field">阈值{draft.metric === "disk" || draft.metric === "memory" ? " (%)" : ""}<InputNumber min={0} max={100} value={draft.threshold} onChange={(threshold) => setDraft((value) => ({ ...value, threshold: threshold ?? 0 }))} className="w-full" /></label></div>}<label className="alert-form-field">告警级别<Select value={draft.severity} onChange={(severity) => setDraft((value) => ({ ...value, severity }))} options={Object.entries(severityLabel).map(([value, label]) => ({ value, label }))} /></label><label className="alert-form-field">生效服务器<Select value={draft.target} onChange={(target) => setDraft((value) => ({ ...value, target }))} options={[{ value: "all", label: "全部 Linux 主机" }, { value: "favorites", label: "收藏的 Linux 主机" }]} /></label><Checkbox checked={draft.enabled} onChange={(event) => setDraft((value) => ({ ...value, enabled: event.target.checked }))}>启用此规则</Checkbox><Alert type="info" showIcon message="告警只提供诊断建议，不会自动执行修复命令。" /></div></Drawer>
    <Drawer title={channelDrawerKind ? `配置${channelMeta[channelDrawerKind].title}` : "配置通知渠道"} open={Boolean(channelDrawerKind)} onClose={() => setChannelDrawerKind(null)} width={440} maskClosable={false} extra={<Button type="primary" loading={channelSaving} onClick={() => void saveChannel()}>保存配置</Button>}><div className="flex flex-col gap-4"><label className="alert-form-field">Webhook 地址<Input value={channelUrl} onChange={(event) => setChannelUrl(event.target.value)} placeholder={channelDrawerKind === "feishu" ? "https://open.feishu.cn/open-apis/bot/v2/hook/..." : channelDrawerKind === "wecom" ? "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..." : "https://example.com/hooks/..."} autoComplete="off" /></label><Alert type="info" showIcon message="地址保存在系统凭据管理器。飞书和企业微信会分别发送原生卡片或 Markdown 格式；自定义渠道发送标准 JSON。" /><div className="flex items-center gap-2 text-xs text-slate-500"><CheckCircle2 size={14} className="text-emerald-400" />请求体不会包含服务器密码。</div></div></Drawer>
  </main>;
}

function Kpi({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: "rose" | "red" | "cyan" | "green" }) {
  return <div className={`alert-kpi ${tone}`}><span>{icon}{label}</span><strong>{value}</strong></div>;
}

function ChannelCard({ icon, title, status, color, description, action }: { icon: React.ReactNode; title: string; status: string; color: string; description: string; action: React.ReactNode }) {
  return <section className="alert-channel-card"><header><span className={`channel-icon ${color}`}>{icon}</span><div className="min-w-0 flex-1"><strong>{title}</strong><span className={`channel-status ${color}`}>{status}</span></div></header><p>{description}</p><footer>{action}</footer></section>;
}
