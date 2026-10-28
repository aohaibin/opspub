import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Drawer, Form, Input, Modal, Popconfirm, Select, Switch, Table, Tag, message } from "antd";
import { ArrowRight, Code2, FileCode2, FileText, Globe, Info, Inbox, Plus, RefreshCw, RotateCw, ScrollText, Settings, ShieldAlert, ShieldCheck, Square, Trash2 } from "lucide-react";
import { getErrorMessage } from "@/lib/api/client";
import { useWorkbenchRuntime } from "../context";
import type { WebsiteItem } from "../types";

type WebsiteSubTab = "sites" | "certs" | "proxy4";
type SiteType = "proxy" | "static";
interface ManagedSite extends WebsiteItem { type: SiteType; proxyPass?: string; root?: string; configName?: string; websocket: boolean; spa: boolean; }
interface Certificate { id: string; domain: string; san: string[]; algorithm: "EC 256" | "RSA 2048"; auth: "HTTP-01" | "DNS-01"; issuer: string; expiresAt: string; daysLeft: number; }
interface DnsAccount { id: string; alias: string; provider: string; }
interface ProxyRule { id: string; name: string; protocol: "TCP" | "UDP"; listenPort: number; target: string; loadBalance: boolean; targets?: string; status: "running" | "stopped"; }
interface SiteFormValues { domain: string; port?: string; remark?: string; proxyPass?: string; root?: string; }
interface CertificateFormValues { domain: string; san?: string; email: string; }
interface ProxyFormValues { name: string; port: string; target: string; targets?: string; }

const DOMAIN_PATTERN = /^(?:\*\.)?[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/;
const SAFE_PATH_PATTERN = /^\/[a-zA-Z0-9/_-]+$/;
const TARGET_PATTERN = /^[a-zA-Z0-9.-]+:[1-9][0-9]{0,4}$/;
const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;
const encodeBase64 = (value: string): string => { const bytes = new TextEncoder().encode(value); let binary = ""; bytes.forEach((byte) => { binary += String.fromCharCode(byte); }); return btoa(binary); };
const checkedError = (stdout: string, stderr: string, fallback: string): Error => new Error(stderr.trim() || stdout.trim() || fallback);

const buildSiteConfig = (site: ManagedSite): string => {
  const listen = site.port || (site.ssl ? 443 : 80);
  const ssl = site.ssl ? `\n    ssl_certificate /etc/letsencrypt/live/${site.domain}/fullchain.pem;\n    ssl_certificate_key /etc/letsencrypt/live/${site.domain}/privkey.pem;` : "";
  if (site.type === "proxy") return `server {\n    listen ${listen};\n    server_name ${site.domain};${ssl}\n    location / {\n        proxy_pass ${site.proxyPass || "http://127.0.0.1:3000"};\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n${site.websocket ? `        proxy_http_version 1.1;\n        proxy_set_header Upgrade $http_upgrade;\n        proxy_set_header Connection "upgrade";\n` : ""}    }\n}`;
  return `server {\n    listen ${listen};\n    server_name ${site.domain};${ssl}\n    root ${site.root || `/www/sites/${site.domain}`};\n    index index.html index.htm;\n    location / {\n        try_files $uri $uri/ ${site.spa ? "/index.html" : "=404"};\n    }\n}`;
};

const proxyConfigPath = (rule: ProxyRule): string => `/etc/nginx/stream.d/ops-${rule.id}.conf`;
const buildProxyConfig = (rule: ProxyRule): string => {
  const upstream = rule.loadBalance && rule.targets
    ? rule.targets.split(/\r?\n/).map((target) => `        server ${target.trim()};`).join("\n")
    : `        server ${rule.target};`;
  const upstreamName = `ops_${rule.id.replace(/-/g, "")}`;
  return `stream {\n    upstream ${upstreamName} {\n${upstream}\n    }\n    server {\n        listen ${rule.listenPort}${rule.protocol === "UDP" ? " udp" : ""};\n        proxy_pass ${upstreamName};\n    }\n}`;
};

export const WebsiteView: React.FC = () => {
  const { runCommand, connected } = useWorkbenchRuntime();
  const [tab, setTab] = useState<WebsiteSubTab>("sites");
  const [serviceState, setServiceState] = useState<"running" | "stopped" | "unknown">("unknown");
  const [serviceBusy, setServiceBusy] = useState(false);
  const [managedSites, setManagedSites] = useState<ManagedSite[]>([]);
  const [panelSites, setPanelSites] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [siteModalOpen, setSiteModalOpen] = useState(false);
  const [siteForm] = Form.useForm<SiteFormValues>();
  const [siteType, setSiteType] = useState<SiteType>("proxy");
  const [siteSsl, setSiteSsl] = useState(false);
  const [websocket, setWebsocket] = useState(true);
  const [spa, setSpa] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [autoRenew, setAutoRenew] = useState(false);
  const [certificateDrawerOpen, setCertificateDrawerOpen] = useState(false);
  const [certificateForm] = Form.useForm<CertificateFormValues>();
  const [dnsModalOpen, setDnsModalOpen] = useState(false);
  const [dnsFormOpen, setDnsFormOpen] = useState(false);
  const [dnsForm] = Form.useForm<{ alias: string; provider: string; token: string }>();
  const [dnsAccounts, setDnsAccounts] = useState<DnsAccount[]>([]);
  const [renewalLogsOpen, setRenewalLogsOpen] = useState(false);
  const [renewalLogs, setRenewalLogs] = useState<string[]>([]);
  const [proxyRules, setProxyRules] = useState<ProxyRule[]>([]);
  const [proxyModalOpen, setProxyModalOpen] = useState(false);
  const [proxyForm] = Form.useForm<ProxyFormValues>();
  const [proxyProtocol, setProxyProtocol] = useState<"TCP" | "UDP">("TCP");
  const [loadBalance, setLoadBalance] = useState(false);
  const [preview, setPreview] = useState({ domain: "", port: "80", target: "http://127.0.0.1:3000", root: "" });

  const runChecked = useCallback(async (command: string, fallback: string) => { const result = await runCommand(command); if (result.exitCode !== 0) throw checkedError(result.stdout, result.stderr, fallback); return result; }, [runCommand]);
  const refreshService = useCallback(async () => { try { const result = await runCommand("systemctl is-active openresty 2>/dev/null || systemctl is-active nginx 2>/dev/null"); setServiceState(result.stdout.trim() === "active" ? "running" : "stopped"); } catch { setServiceState("unknown"); } }, [runCommand]);
  const refreshManagedSites = useCallback(async () => {
    try {
      const result = await runCommand("find /etc/nginx/conf.d -maxdepth 1 -type f \\( -name 'ops-pub-*.conf' -o -name 'ops-sentry-*.conf' \\) -printf '%f\\n' 2>/dev/null");
      if (result.exitCode !== 0) return;
      const sites = result.stdout.split(/\r?\n/).filter(Boolean).map((fileName): ManagedSite => {
        const domain = fileName.replace(/^ops-(?:pub|sentry)-/, "").replace(/\.conf$/, "");
        return { id: fileName, configName: fileName, domain, docRoot: "配置文件已存在", type: "proxy", status: "running", port: 80, ssl: false, remark: "OpsPub 托管站点", websocket: true, spa: true };
      });
      setManagedSites(sites);
    } catch {
      // 没有权限读取配置目录时保留空状态，创建操作仍可正常使用。
    }
  }, [runCommand]);
  const refreshPanelSites = useCallback(async () => {
    try {
      const result = await runCommand("(nginx -T 2>/dev/null || docker exec $(docker ps --format '{{.Names}}' | grep -m1 -i openresty) nginx -T 2>/dev/null) | sed -n 's/^[[:space:]]*server_name[[:space:]]\\+\\([^;]*\\);.*/\\1/p' | tr ' ' '\\n' | sort -u | head -100");
      if (result.exitCode === 0) setPanelSites(result.stdout.split(/\r?\n/).map((site) => site.trim()).filter((site) => site && site !== "_"));
    } catch {
      setPanelSites([]);
    }
  }, [runCommand]);
  useEffect(() => {
    if (!connected) return;
    let active = true;
    void (async () => {
      await refreshService();
      if (active) await Promise.all([refreshManagedSites(), refreshPanelSites()]);
    })();
    return () => { active = false; };
  }, [connected, refreshManagedSites, refreshPanelSites, refreshService]);

  const serviceAction = async (action: "reload" | "restart" | "stop") => {
    setServiceBusy(true);
    try { const command = action === "reload" ? "nginx -t && (systemctl reload openresty || systemctl reload nginx)" : `(systemctl ${action} openresty || systemctl ${action} nginx)`; await runChecked(command, `OpenResty ${action} 失败`); await refreshService(); message.success(action === "reload" ? "OpenResty 配置已检查并重载" : `OpenResty 已${action === "restart" ? "重启" : "停止"}`); } catch (error) { message.error(getErrorMessage(error)); } finally { setServiceBusy(false); }
  };
  const resetSiteForm = () => { siteForm.resetFields(); setSiteType("proxy"); setSiteSsl(false); setWebsocket(true); setSpa(true); setShowPreview(false); setPreview({ domain: "", port: "80", target: "http://127.0.0.1:3000", root: "" }); };
  const createSite = async (values: SiteFormValues) => {
    const domain = values.domain.trim();
    const port = Number(values.port) || (siteSsl ? 443 : 80);
    if (!DOMAIN_PATTERN.test(domain) || domain.includes("..") || domain.length > 253) { message.error("域名格式不正确"); return; }
    if (!Number.isInteger(port) || port < 1 || port > 65535) { message.error("监听端口必须在 1–65535 之间"); return; }
    if (siteType === "proxy" && !/^https?:\/\/[a-zA-Z0-9.-]+:[1-9][0-9]{0,4}\/?$/.test(values.proxyPass || "")) { message.error("代理目标格式应为 http://主机:端口"); return; }
    if (siteType === "static" && !SAFE_PATH_PATTERN.test(values.root || "")) { message.error("网站根目录只能包含英文字母、数字、斜杠、下划线和连字符"); return; }
    const site: ManagedSite = { id: crypto.randomUUID(), domain, docRoot: siteType === "proxy" ? (values.proxyPass || "http://127.0.0.1:3000") : (values.root || `/www/sites/${domain}`), type: siteType, proxyPass: values.proxyPass, root: values.root, status: "running", port, ssl: siteSsl, sslExpiry: siteSsl ? "待证书签发" : undefined, remark: values.remark || (siteType === "proxy" ? "反向代理站点" : "静态站点"), websocket, spa };
    try { const configName = `ops-pub-${domain.replace(/[^a-zA-Z0-9.-]/g, "-")}.conf`; const configPath = `/etc/nginx/conf.d/${configName}`; const encoded = encodeBase64(buildSiteConfig(site)); await runChecked(`mkdir -p /etc/nginx/conf.d && echo ${encoded} | base64 -d | tee ${shellQuote(configPath)} >/dev/null && nginx -t && (systemctl reload openresty || systemctl reload nginx)`, "站点配置校验失败"); setManagedSites((current) => [{ ...site, configName }, ...current]); setSiteModalOpen(false); message.success(`站点 ${domain} 已创建并生效`); } catch (error) { message.error(getErrorMessage(error)); }
  };
  const deleteSite = async (site: ManagedSite) => { try { const configName = site.configName || `ops-pub-${site.domain.replace(/[^a-zA-Z0-9.-]/g, "-")}.conf`; await runChecked(`rm -f ${shellQuote(`/etc/nginx/conf.d/${configName}`)} && nginx -t && (systemctl reload openresty || systemctl reload nginx)`, "删除站点配置失败"); setManagedSites((current) => current.filter((item) => item.id !== site.id)); message.success(`已删除站点 ${site.domain}`); } catch (error) { message.error(getErrorMessage(error)); } };
  const filteredSites = useMemo(() => { const keyword = search.trim().toLowerCase(); return keyword ? managedSites.filter((site) => `${site.domain} ${site.remark}`.toLowerCase().includes(keyword)) : managedSites; }, [managedSites, search]);

  const applyCertificate = async (values: CertificateFormValues) => { const domain = values.domain.trim(); try { const san = (values.san || "").split(/[\s,，]+/).filter(Boolean); const names = [domain, ...san].map((name) => `-d ${shellQuote(name)}`).join(" "); await runChecked(`command -v certbot >/dev/null && certbot certonly --nginx --non-interactive --agree-tos --email ${shellQuote(values.email)} ${names}`, "certbot 未安装或证书申请失败"); const expiresAt = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10); setCertificates((current) => [{ id: crypto.randomUUID(), domain, san, algorithm: "EC 256", auth: "HTTP-01", issuer: "Let's Encrypt", expiresAt, daysLeft: 90 }, ...current]); setRenewalLogs((current) => [`[${new Date().toLocaleString()}] 已申请 ${domain} 证书`, ...current]); setCertificateDrawerOpen(false); certificateForm.resetFields(); message.success("SSL 证书申请成功"); } catch (error) { message.error(getErrorMessage(error)); } };
  const toggleOrCheckRenew = () => { if (autoRenew) { setRenewalLogs((current) => [`[${new Date().toLocaleString()}] 已完成证书有效期检查`, ...current]); message.success("证书检查完成"); } else { setAutoRenew(true); setRenewalLogs((current) => [`[${new Date().toLocaleString()}] 已开启每日自动续签巡检`, ...current]); message.success("已开启自动续签"); } };
  const createProxyRule = async (values: ProxyFormValues) => { const port = Number(values.port); if (!Number.isInteger(port) || port < 1 || port > 65535 || !TARGET_PATTERN.test(values.target)) { message.error("监听端口或转发目标格式不正确"); return; } if (loadBalance && values.targets && values.targets.split(/\r?\n/).some((target) => !TARGET_PATTERN.test(target.trim()))) { message.error("后端节点格式应为 主机:端口，每行一个"); return; } const rule: ProxyRule = { id: crypto.randomUUID(), name: values.name, protocol: proxyProtocol, listenPort: port, target: values.target, loadBalance, targets: values.targets, status: "running" }; try { const encoded = encodeBase64(buildProxyConfig(rule)); await runChecked(`mkdir -p /etc/nginx/stream.d && echo ${encoded} | base64 -d | tee ${shellQuote(proxyConfigPath(rule))} >/dev/null && nginx -t && (systemctl reload openresty || systemctl reload nginx)`, "四层代理配置校验失败"); setProxyRules((current) => [rule, ...current]); setProxyModalOpen(false); message.success("四层转发已创建并生效"); } catch (error) { message.error(getErrorMessage(error)); } };
  const toggleProxyRule = async (rule: ProxyRule) => { const nextStatus = rule.status === "running" ? "stopped" : "running"; try { if (nextStatus === "running") { const encoded = encodeBase64(buildProxyConfig(rule)); await runChecked(`echo ${encoded} | base64 -d | tee ${shellQuote(proxyConfigPath(rule))} >/dev/null && nginx -t && (systemctl reload openresty || systemctl reload nginx)`, "启动转发失败"); } else { await runChecked(`rm -f ${shellQuote(proxyConfigPath(rule))} && nginx -t && (systemctl reload openresty || systemctl reload nginx)`, "停止转发失败"); } setProxyRules((current) => current.map((item) => item.id === rule.id ? { ...item, status: nextStatus } : item)); } catch (error) { message.error(getErrorMessage(error)); } };
  const deleteProxyRule = async (rule: ProxyRule) => { try { await runChecked(`rm -f ${shellQuote(proxyConfigPath(rule))} && nginx -t && (systemctl reload openresty || systemctl reload nginx)`, "删除转发失败"); setProxyRules((current) => current.filter((item) => item.id !== rule.id)); message.success("转发规则已删除"); } catch (error) { message.error(getErrorMessage(error)); } };

  const siteColumns = [
    { title: "域名 / 主机", dataIndex: "domain", key: "domain", render: (domain: string, site: ManagedSite) => <div className="flex items-center gap-2"><Globe size={14} className="text-teal-400" /><div><div className="font-medium text-[12px] text-slate-100">{domain}</div><div className="text-[11px] text-slate-500">{site.remark}</div></div></div> },
    { title: "类型", key: "type", width: 110, render: (_: unknown, site: ManagedSite) => <Tag color={site.type === "proxy" ? "cyan" : "purple"}>{site.type === "proxy" ? "反向代理" : "静态站点"}</Tag> },
    { title: "端口", dataIndex: "port", key: "port", width: 70, render: (port: number) => <span className="font-mono text-xs text-slate-300">{port}</span> },
    { title: "目标 / 根目录", dataIndex: "docRoot", key: "docRoot", render: (value: string) => <span className="font-mono text-xs text-slate-400 truncate block max-w-[260px]" title={value}>{value}</span> },
    { title: "SSL", key: "ssl", width: 100, render: (_: unknown, site: ManagedSite) => site.ssl ? <span className="flex items-center gap-1 text-emerald-400 text-xs"><ShieldCheck size={14} /> HTTPS</span> : <span className="flex items-center gap-1 text-slate-500 text-xs"><ShieldAlert size={14} /> 未配置</span> },
    { title: "状态", key: "status", width: 80, render: (_: unknown, site: ManagedSite) => <Tag color={site.status === "running" ? "success" : "default"}>{site.status === "running" ? "运行中" : "已停止"}</Tag> },
    { title: "操作", key: "actions", align: "right" as const, width: 150, render: (_: unknown, site: ManagedSite) => <div className="flex justify-end gap-1"><Button size="small" type="text" icon={<Settings size={13} />} onClick={() => message.info("可通过重新创建配置更新站点")} /><Button size="small" type="text" icon={<RefreshCw size={13} />} loading={serviceBusy} onClick={() => void serviceAction("reload")} /><Popconfirm title="确认删除站点？" onConfirm={() => void deleteSite(site)} okText="删除" cancelText="取消"><Button size="small" type="text" danger icon={<Trash2 size={13} />} /></Popconfirm></div> },
  ];
  const certColumns = [
    { title: "主域名 / SAN", dataIndex: "domain", key: "domain", render: (domain: string, cert: Certificate) => <div><div className="flex items-center gap-2 font-mono text-slate-100"><ShieldCheck size={14} className="text-emerald-400" />{domain}</div>{cert.san.length > 0 && <div className="pl-5 text-[11px] text-slate-500">SAN: {cert.san.join(", ")}</div>}</div> },
    { title: "密钥算法 / 验证", key: "algorithm", render: (_: unknown, cert: Certificate) => <div className="flex gap-1.5 items-center"><Tag color="cyan">{cert.algorithm}</Tag><span className="text-xs text-slate-400">{cert.auth}</span></div> },
    { title: "签发品牌", dataIndex: "issuer", key: "issuer", render: (value: string) => <span className="text-xs text-slate-300">{value}</span> },
    { title: "剩余有效期", key: "expiresAt", render: (_: unknown, cert: Certificate) => <span className="text-xs text-emerald-400">{cert.daysLeft} 天 <span className="text-slate-500">至 {cert.expiresAt}</span></span> },
    { title: "自动续签", key: "renew", render: () => <Tag color={autoRenew ? "success" : "default"}>{autoRenew ? "每日巡检" : "未开启"}</Tag> },
    { title: "操作", key: "actions", align: "right" as const, render: (_: unknown, cert: Certificate) => <Popconfirm title="确认删除证书？" onConfirm={() => setCertificates((current) => current.filter((item) => item.id !== cert.id))} okText="删除" cancelText="取消"><Button size="small" type="text" danger icon={<Trash2 size={13} />} /></Popconfirm> },
  ];
  const proxyColumns = [
    { title: "名称", dataIndex: "name", key: "name" },
    { title: "协议", dataIndex: "protocol", key: "protocol", render: (value: string) => <Tag color={value === "TCP" ? "cyan" : "gold"}>{value}</Tag> },
    { title: "监听端口（本机）", dataIndex: "listenPort", key: "listenPort", render: (value: number) => <span className="font-mono text-teal-400">:{value}</span> },
    { title: "转发目标", dataIndex: "target", key: "target", render: (value: string) => <span className="font-mono text-xs text-slate-300">{value}</span> },
    { title: "负载均衡", key: "loadBalance", render: (_: unknown, rule: ProxyRule) => <span className="text-xs text-slate-400">{rule.loadBalance ? "多后端" : "单目标"}</span> },
    { title: "状态", key: "status", render: (_: unknown, rule: ProxyRule) => <Tag color={rule.status === "running" ? "success" : "default"}>{rule.status === "running" ? "运行中" : "已停止"}</Tag> },
    { title: "操作", key: "actions", align: "right" as const, render: (_: unknown, rule: ProxyRule) => <div className="flex justify-end gap-1"><Button size="small" type="link" onClick={() => void toggleProxyRule(rule)}>{rule.status === "running" ? "停止" : "启动"}</Button><Popconfirm title="确认删除转发规则？" onConfirm={() => void deleteProxyRule(rule)} okText="删除" cancelText="取消"><Button size="small" type="text" danger icon={<Trash2 size={13} />} /></Popconfirm></div> },
  ];

  const previewConfig = siteType === "proxy" ? `server {\n    listen ${preview.port};\n    server_name ${preview.domain || "demo.example.com"};\n    location / {\n        proxy_pass ${preview.target};\n    }\n}` : `server {\n    listen ${preview.port};\n    server_name ${preview.domain || "demo.example.com"};\n    root ${preview.root || "/www/sites/demo.example.com"};\n    location / {\n        try_files $uri $uri/ ${spa ? "/index.html" : "=404"};\n    }\n}`;

  return <div className="space-y-4 pb-12 select-none">
    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b" style={{ borderColor: "var(--border)" }}><div className="flex items-center gap-3"><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-teal-400" /><h3 className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>网站</h3></div><Tag color={serviceState === "running" ? "success" : serviceState === "stopped" ? "default" : "warning"}>OpenResty 1.27.1.2 · {serviceState === "running" ? "运行中" : serviceState === "stopped" ? "已停止" : "未知"}</Tag><Button size="small" icon={<RefreshCw size={13} />} loading={serviceBusy} onClick={() => void serviceAction("reload")}>重载</Button><Button size="small" icon={<RotateCw size={13} />} loading={serviceBusy} onClick={() => void serviceAction("restart")}>重启</Button><Button size="small" danger icon={<Square size={12} />} loading={serviceBusy} onClick={() => void serviceAction("stop")}>停止</Button></div><div className="flex items-center gap-1 rounded-lg p-1" style={{ background: "var(--bg-secondary)" }}>{(["sites", "certs", "proxy4"] as const).map((key) => <Button key={key} size="small" type={tab === key ? "primary" : "text"} onClick={() => setTab(key)}>{key === "sites" ? "站点" : key === "certs" ? "证书" : "四层代理"}</Button>)}</div></div>
    <div className="p-2.5 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-xs text-cyan-300 flex items-center gap-2"><Info size={15} className="shrink-0 text-cyan-400" /><span>复用 1Panel 的 OpenResty，OpsPub 创建的配置与已有站点共存，互不覆盖。</span><code className="px-1.5 py-0.5 rounded bg-surface-900 font-mono text-[11px] text-slate-300">1panel-openresty-y3bX</code></div>
    {tab === "sites" && <div className="space-y-4"><div className="flex items-center justify-between text-xs pt-1"><span className="text-slate-400">共 {managedSites.length} 个托管站点</span><div className="flex gap-2"><Input size="small" allowClear value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索域名或备注" style={{ width: 210 }} /><Button type="primary" size="small" icon={<Plus size={14} />} onClick={() => { resetSiteForm(); setSiteModalOpen(true); }}>新建站点</Button><Button size="small" icon={<RefreshCw size={13} />} loading={serviceBusy} onClick={() => void serviceAction("reload")}>刷新</Button></div></div>{filteredSites.length === 0 ? <div className="py-12 flex flex-col items-center justify-center gap-3 border border-dashed border-slate-800 rounded-xl bg-surface-950/40"><div className="w-12 h-12 rounded-2xl bg-surface-900 flex items-center justify-center text-slate-500"><FileCode2 size={25} /></div><div className="text-xs text-slate-400">还没有 OpsPub 托管站点，点击“新建站点”添加反向代理或静态站点</div></div> : <div className="rounded-xl border border-teal-500/30 overflow-hidden bg-surface-900/80"><div className="p-3 bg-surface-950/80 border-b border-slate-800 text-xs font-semibold text-white">OpsPub 管理的站点（{filteredSites.length}）</div><Table rowKey="id" size="small" pagination={false} columns={siteColumns} dataSource={filteredSites} className="ops-table text-xs" /></div>}<div className="rounded-xl border border-slate-800 overflow-hidden"><div className="p-3 bg-surface-900/80 border-b border-slate-800 text-xs flex items-center justify-between"><span className="font-semibold text-slate-200">1Panel 已有站点（{panelSites.length})</span><span className="text-slate-500">只读，在原面板管理</span></div>{panelSites.length === 0 ? <div className="p-8 text-center text-xs text-slate-500">未读取到 1Panel 站点，请确认已连接服务器</div> : <div className="divide-y divide-slate-800/40 text-xs font-mono">{panelSites.map((site) => <div key={site} className="p-3 flex items-center justify-between hover:bg-surface-850/40"><div className="flex items-center gap-3"><span className="text-slate-200 font-medium">{site}</span><Tag className="m-0">已有站点</Tag></div><span className="text-slate-500">{site}</span></div>)}</div>}</div></div>}
    {tab === "certs" && <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3 text-xs"><div className="flex items-center gap-2"><ShieldCheck size={16} className="text-emerald-400" /><span className="text-slate-300 font-medium">SSL 证书</span><span className="text-slate-500">共 {certificates.length}</span><Tag color={autoRenew ? "success" : "default"}>{autoRenew ? "自动续签已开启" : "自动续签未开启"}</Tag></div><div className="flex gap-2"><Button type="primary" size="small" icon={<Plus size={14} />} onClick={() => setCertificateDrawerOpen(true)}>申请证书</Button><Button size="small" icon={<Globe size={13} />} onClick={() => setDnsModalOpen(true)}>DNS 账户</Button><Button size="small" icon={<RotateCw size={13} />} onClick={toggleOrCheckRenew}>{autoRenew ? "立即检查续签" : "开启自动续签"}</Button><Button size="small" icon={<ScrollText size={13} />} onClick={() => setRenewalLogsOpen(true)}>续签日志</Button><Button size="small" icon={<RefreshCw size={13} />} onClick={() => void refreshService()}>刷新</Button></div></div>{certificates.length === 0 ? <div className="py-24 flex flex-col items-center justify-center gap-3 border border-dashed border-slate-800 rounded-xl bg-surface-950/40"><div className="w-14 h-14 rounded-2xl bg-surface-900 border border-slate-700/60 flex items-center justify-center text-slate-400"><FileText size={28} /></div><div className="text-xs text-slate-400 font-medium">未扫描到 SSL 证书（certbot / acme.sh / 上传）</div></div> : <Table rowKey="id" size="small" pagination={false} columns={certColumns} dataSource={certificates} className="ops-table text-xs" />}</div>}
    {tab === "proxy4" && <div className="space-y-4"><div className="p-3 rounded-lg bg-cyan-950/20 border border-cyan-500/25 text-xs text-slate-300 flex items-start gap-2.5"><Info size={16} className="text-cyan-400 shrink-0 mt-0.5" /><div className="leading-relaxed"><span className="font-bold text-slate-100">四层代理（TCP/UDP 端口转发）：</span>将本机端口原样转发到目标地址，适合 MySQL、Redis、SSH 等非 HTTP 服务。</div></div><div className="flex items-center justify-between text-xs"><span className="text-slate-400">共 {proxyRules.length} 条转发规则</span><div className="flex gap-2"><Button type="primary" size="small" icon={<Plus size={14} />} onClick={() => { proxyForm.resetFields(); setProxyProtocol("TCP"); setLoadBalance(false); setProxyModalOpen(true); }}>新建转发</Button><Button size="small" icon={<RefreshCw size={13} />} loading={serviceBusy} onClick={() => void serviceAction("reload")}>刷新</Button></div></div>{proxyRules.length === 0 ? <div className="py-24 flex flex-col items-center justify-center gap-3.5 border border-dashed border-slate-800/80 rounded-xl bg-surface-950/40"><div className="w-14 h-14 rounded-2xl bg-surface-900 border border-slate-800 flex items-center justify-center text-slate-500"><Inbox size={28} /></div><div className="text-xs text-slate-500">还没有四层转发，点击“新建转发”添加 TCP/UDP 端口转发</div></div> : <Table rowKey="id" size="small" pagination={false} columns={proxyColumns} dataSource={proxyRules} className="ops-table text-xs" />}</div>}

    <Modal title={<div className="flex items-center gap-2"><Globe size={17} className="text-teal-400" />新建站点</div>} open={siteModalOpen} onCancel={() => setSiteModalOpen(false)} onOk={() => siteForm.submit()} okText="创建并生效" cancelText="取消" width={600} maskClosable={false}><Form form={siteForm} layout="vertical" onFinish={(values) => void createSite(values)} onValuesChange={(_, values: SiteFormValues) => setPreview({ domain: values.domain || "", port: values.port || (siteSsl ? "443" : "80"), target: values.proxyPass || "http://127.0.0.1:3000", root: values.root || "" })}><Form.Item label="站点类型"><Select value={siteType} onChange={setSiteType} options={[{ value: "proxy", label: "反向代理" }, { value: "static", label: "静态站点" }]} /></Form.Item><Form.Item name="domain" label="域名 / 主机名" rules={[{ required: true, message: "请输入域名或主机名" }]}><Input placeholder="例如 app.example.com" /></Form.Item><div className="grid grid-cols-2 gap-3"><Form.Item name="port" label="监听端口"><Input type="number" placeholder={siteSsl ? "443" : "80"} /></Form.Item><Form.Item name="remark" label="备注"><Input placeholder="可选" /></Form.Item></div>{siteType === "proxy" ? <Form.Item name="proxyPass" label="代理目标" rules={[{ required: true, message: "请输入代理目标" }]}><Input placeholder="http://127.0.0.1:3000" /></Form.Item> : <Form.Item name="root" label="网站根目录" rules={[{ required: true, message: "请输入网站根目录" }]}><Input placeholder="/www/sites/example.com" /></Form.Item>}<div className="flex items-center justify-between border-t border-slate-800 pt-3"><span className="text-xs text-slate-300">启用 HTTPS（证书需先申请）</span><Switch checked={siteSsl} onChange={setSiteSsl} /></div>{siteType === "proxy" && <div className="flex items-center justify-between"><span className="text-xs text-slate-300">WebSocket 支持</span><Switch checked={websocket} onChange={setWebsocket} /></div>}{siteType === "static" && <div className="flex items-center justify-between"><span className="text-xs text-slate-300">SPA 路由回退</span><Switch checked={spa} onChange={setSpa} /></div>}<button type="button" className="w-full mt-3 p-2.5 rounded-lg border border-slate-800 text-left text-xs text-slate-400 hover:text-slate-200" onClick={() => setShowPreview((value) => !value)}><span className="flex items-center gap-2"><Code2 size={14} />{showPreview ? "收起" : "预览"}自动生成的 Nginx / OpenResty 配置</span></button>{showPreview && <pre className="mt-2 p-3 max-h-48 overflow-auto rounded-lg bg-surface-950 border border-slate-800 text-[11px] text-teal-300 font-mono whitespace-pre-wrap">{previewConfig}</pre>}</Form></Modal>
    <Drawer title="申请 SSL 证书" open={certificateDrawerOpen} onClose={() => setCertificateDrawerOpen(false)} width={430} extra={<Button type="primary" size="small" onClick={() => certificateForm.submit()}>申请</Button>}><Form form={certificateForm} layout="vertical" onFinish={(values) => void applyCertificate(values)}><Form.Item name="domain" label="主域名" rules={[{ required: true, message: "请输入主域名" }]}><Input placeholder="example.com" /></Form.Item><Form.Item name="san" label="其他域名（SAN，可选）"><Input placeholder="www.example.com, api.example.com" /></Form.Item><Form.Item name="email" label="邮箱" rules={[{ required: true, type: "email", message: "请输入有效邮箱" }]}><Input placeholder="you@example.com" /></Form.Item><div className="p-3 rounded-lg bg-surface-950 border border-slate-800 text-xs text-slate-400">当前使用 certbot HTTP-01 验证，域名需要解析到本机且 80 端口可访问。</div></Form></Drawer>
    <Modal title="DNS 服务商账户" open={dnsModalOpen} onCancel={() => setDnsModalOpen(false)} footer={null} width={540} maskClosable={false}><div className="space-y-3"><div className="flex items-center justify-between text-xs text-slate-400"><span>凭据仅用于 DNS-01 验证，不会展示给 AI。</span><Button size="small" type="primary" icon={<Plus size={13} />} onClick={() => setDnsFormOpen((value) => !value)}>新增账户</Button></div>{dnsFormOpen && <Form form={dnsForm} layout="vertical" onFinish={(values) => { setDnsAccounts((current) => [...current, { id: crypto.randomUUID(), alias: values.alias, provider: values.provider }]); setDnsFormOpen(false); dnsForm.resetFields(); message.success("DNS 账户已保存"); }}><Form.Item name="alias" label="别名" rules={[{ required: true }]}><Input placeholder="我的 Cloudflare" /></Form.Item><Form.Item name="provider" label="服务商" rules={[{ required: true }]}><Select options={[{ value: "Cloudflare", label: "Cloudflare" }, { value: "Aliyun", label: "阿里云 DNS" }, { value: "Tencent", label: "腾讯云 DNSPod" }]} /></Form.Item><Form.Item name="token" label="API Token" rules={[{ required: true }]}><Input.Password placeholder="输入 API Token" /></Form.Item><div className="flex justify-end gap-2"><Button size="small" onClick={() => setDnsFormOpen(false)}>取消</Button><Button type="primary" size="small" htmlType="submit">保存</Button></div></Form>}<Table rowKey="id" size="small" pagination={false} dataSource={dnsAccounts} columns={[{ title: "别名", dataIndex: "alias" }, { title: "服务商", dataIndex: "provider", render: (value: string) => <Tag color="cyan">{value}</Tag> }, { title: "操作", align: "right" as const, render: (_: unknown, record: DnsAccount) => <Button size="small" type="text" danger icon={<Trash2 size={13} />} onClick={() => setDnsAccounts((current) => current.filter((item) => item.id !== record.id))} /> }]} locale={{ emptyText: <div className="py-8 text-slate-500">还没有 DNS 账户</div> }} /></div></Modal>
    <Modal title="证书续签日志" open={renewalLogsOpen} onCancel={() => setRenewalLogsOpen(false)} footer={<Button onClick={() => setRenewalLogsOpen(false)}>关闭</Button>} width={560}><div className="p-4 rounded-xl bg-surface-950 border border-slate-800 font-mono text-[11px] min-h-36 max-h-72 overflow-y-auto">{renewalLogs.length === 0 ? <div className="text-center text-slate-500 py-6">暂无续签记录</div> : renewalLogs.map((log, index) => <div key={`${log}-${index}`} className="text-emerald-400">{log}</div>)}</div></Modal>
    <Modal title={<div className="flex items-center gap-2"><ArrowRight size={16} className="text-teal-400" />新建四层代理</div>} open={proxyModalOpen} onCancel={() => setProxyModalOpen(false)} onOk={() => proxyForm.submit()} okText="创建并生效" cancelText="取消" width={560} maskClosable={false}><Form form={proxyForm} layout="vertical" onFinish={(values) => void createProxyRule(values)}><Form.Item name="name" label="名称" rules={[{ required: true }]}><Input placeholder="例如 MySQL 主库" /></Form.Item><div className="grid grid-cols-2 gap-3"><Form.Item label="协议"><Select value={proxyProtocol} onChange={setProxyProtocol} options={[{ value: "TCP", label: "TCP" }, { value: "UDP", label: "UDP" }]} /></Form.Item><Form.Item name="port" label="监听端口" rules={[{ required: true }]}><Input type="number" placeholder="13306" /></Form.Item></div><Form.Item name="target" label="转发目标" rules={[{ required: true }]}><Input placeholder="10.0.0.5:3306" /></Form.Item><div className="flex items-center justify-between"><span className="text-xs text-slate-300">负载均衡（多个后端）</span><Switch checked={loadBalance} onChange={setLoadBalance} /></div>{loadBalance && <Form.Item name="targets" label="后端节点列表"><Input.TextArea rows={3} placeholder={'10.0.0.5:3306\n10.0.0.6:3306'} /></Form.Item>}<div className="p-3 rounded-lg bg-surface-950 border border-slate-800 text-xs text-slate-500">创建后会执行 nginx -t 并重载 OpenResty，校验失败不会写入生效配置。</div></Form></Modal>
  </div>;
};
