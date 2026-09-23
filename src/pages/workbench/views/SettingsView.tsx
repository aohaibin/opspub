import React, { useEffect, useState } from "react";
import { Tag, Switch, message, Button } from "antd";
import { Settings, Shield, CheckCircle2 } from "lucide-react";
import { getErrorMessage } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";
import type { AIPolicy, Server } from "@/types";

interface SettingsViewProps { server: Server | null; }
type PolicyOption = "trust" | "observe" | "restrict";
const policyToServer: Record<PolicyOption, AIPolicy> = { trust: "trusted", observe: "approval", restrict: "denied" };
const serverToPolicy = (policy?: string): PolicyOption => policy === "denied" || policy === "strict" ? "restrict" : policy === "approval" || policy === "readonly" ? "observe" : "trust";

export const SettingsView: React.FC<SettingsViewProps> = ({ server }) => {
  const [policy, setPolicy] = useState<PolicyOption>(serverToPolicy(server?.ai_policy));
  const [allowSudo, setAllowSudo] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setPolicy(serverToPolicy(server?.ai_policy)); setAllowSudo(Boolean(server?.allow_sudo)); }, [server]);
  const save = async (nextPolicy: PolicyOption, nextSudo: boolean) => {
    if (!server) { message.warning("请先选择服务器"); return; }
    setSaving(true);
    try {
      await serverApi.update(server.id, { alias: server.alias, hostname: server.hostname, port: server.port, username: server.username, auth_type: server.auth_type === "key" ? "key" : "password", os_type: server.os_type === "windows" ? "windows" : "linux", arch: server.arch, group: server.group, tags: server.tags, ai_policy: policyToServer[nextPolicy], allow_sudo: nextSudo, use_local_proxy: server.use_local_proxy, bastion_id: server.bastion_id, ai_username: server.ai_username });
      setPolicy(nextPolicy); setAllowSudo(nextSudo); message.success("服务器设置已保存");
    } catch (error) { message.error(getErrorMessage(error)); }
    finally { setSaving(false); }
  };
  return <div className="space-y-4 pb-12 select-none"><div className="p-4 rounded-xl border space-y-1" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}><div className="flex items-center gap-2 text-white font-bold text-sm"><Settings size={16} className="text-teal-400" /><span>服务器配置 · {server?.alias || "未选择服务器"}</span></div><p className="text-xs text-slate-400">设置 AI 操作策略和特权命令权限，修改会持久化到当前服务器。</p></div><div className="p-4 rounded-xl border space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Shield size={15} className="text-teal-400" /><span className="font-bold text-xs text-white">AI 操作策略</span></div><Tag color={policy === "trust" ? "success" : policy === "observe" ? "warning" : "error"}>{policy === "trust" ? "信任" : policy === "observe" ? "审批" : "受限"}</Tag></div><div className="grid grid-cols-1 md:grid-cols-3 gap-3">{([ ["trust", "信任 (Trusted)", "允许自动执行运维命令"], ["observe", "审批 (Approval)", "写入和高风险操作需要确认"], ["restrict", "受限 (Denied)", "仅允许只读查询"] ] as const).map(([key, label, desc]) => <button type="button" key={key} onClick={() => void save(key, allowSudo)} disabled={saving || !server} className={`text-left p-3 rounded-xl border transition ${policy === key ? "bg-teal-500/10 border-teal-500/60" : "border-slate-800 hover:bg-slate-800/40"}`}><div className="flex items-center justify-between"><span className="font-bold text-xs text-white">{label}</span>{policy === key && <CheckCircle2 size={14} className="text-teal-400" />}</div><p className="text-xs mt-1 text-slate-400">{desc}</p></button>)}</div></div><div className="p-4 rounded-xl border space-y-4" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}><div className="flex items-center justify-between py-2"><div><div className="font-bold text-xs text-white">允许 AI 执行 sudo</div><p className="text-xs text-slate-400 mt-0.5">允许执行需要特权的系统维护命令。</p></div><Switch checked={allowSudo} disabled={saving || !server} onChange={(checked) => void save(policy, checked)} /></div><div className="flex items-center justify-between py-2 border-t border-slate-800"><div><div className="font-bold text-xs text-white">安全沙箱</div><p className="text-xs text-slate-400 mt-0.5">由服务端策略引擎统一控制。</p></div><Tag color="cyan">已启用</Tag></div><Button size="small" loading={saving} disabled={!server} onClick={() => void save(policy, allowSudo)}>保存当前设置</Button></div></div>;
};
