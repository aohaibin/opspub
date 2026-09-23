import React, { useCallback, useEffect, useState } from "react";
import { Button, Table, Tag, Tooltip, message } from "antd";
import { RotateCw, Square } from "lucide-react";
import { getErrorMessage } from "@/lib/api/client";
import { useWorkbenchRuntime } from "../context";
import type { SystemServiceItem } from "../types";

export const SystemView: React.FC = () => {
  const { server, runCommand } = useWorkbenchRuntime();
  const [tab, setTab] = useState<"services" | "processes" | "firewall">("services");
  const [services, setServices] = useState<SystemServiceItem[]>([]);
  const [rows, setRows] = useState<SystemServiceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const unsupported = server?.os_type === "windows";
  const refresh = useCallback(async () => {
    if (unsupported) { setServices([]); return; }
    setLoading(true);
    try {
      if (tab === "services") {
        const result = await runCommand("systemctl list-units --type=service --all --no-legend --no-pager");
        if (result.exitCode !== 0) throw new Error(result.stderr || "服务查询失败");
        setServices(result.stdout.split(/\r?\n/).filter(Boolean).map((line) => { const p = line.trim().split(/\s+/, 5); return { name: p[0]?.replace(/\.service$/, "") || "", desc: p[4] || "", status: p[2] === "active" ? "active" : p[2] === "failed" ? "failed" : "inactive", enabled: false, type: "systemd" } as SystemServiceItem; }));
      } else if (tab === "processes") {
        const result = await runCommand("ps -eo pid,user,pcpu,pmem,args --no-headers | head -n 100");
        setRows(result.stdout.split(/\r?\n/).filter(Boolean).map((line) => { const p = line.trim().split(/\s+/, 5); return { name: p[0] || "", desc: p[4] || "", status: "active", enabled: false, type: "process", pid: p[0] || "", user: p[1] || "", cpu: p[2] || "", mem: p[3] || "", command: p[4] || "" } as SystemServiceItem; }));
      } else {
        const result = await runCommand("ufw status 2>/dev/null | tail -n +4");
        setRows(result.stdout.split(/\r?\n/).filter(Boolean).map((line) => { const p = line.trim().split(/\s{2,}/); return { name: p[0] || "", desc: p[2] || "", status: "active", enabled: false, type: "firewall", port: p[0] || "", action: p[1] || "", from: p[2] || "" } as SystemServiceItem; }));
      }
    } catch (error) { message.error(getErrorMessage(error)); }
    finally { setLoading(false); }
  }, [runCommand, tab, unsupported]);
  useEffect(() => { void refresh(); }, [refresh]);
  const serviceAction = async (name: string, action: "restart" | "stop") => { try { const result = await runCommand(`systemctl ${action} -- ${name}`); if (result.exitCode !== 0) throw new Error(result.stderr || "服务操作失败"); message.success("服务操作成功"); await refresh(); } catch (error) { message.error(getErrorMessage(error)); } };
  const serviceColumns = [{ title: "服务名称", dataIndex: "name", key: "name", render: (v: string) => <span className="font-mono text-xs font-semibold">{v}</span> }, { title: "描述", dataIndex: "desc", key: "desc", render: (v: string) => <span className="text-xs text-slate-400">{v}</span> }, { title: "状态", dataIndex: "status", key: "status", render: (v: string) => <Tag color={v === "active" ? "success" : v === "failed" ? "error" : "default"} className="m-0 text-[10px]">{v}</Tag> }, { title: "操作", key: "action", width: 110, render: (_: unknown, item: SystemServiceItem) => <div className="flex justify-end"><Tooltip title="重启"><Button size="small" type="text" icon={<RotateCw size={13} />} onClick={() => void serviceAction(item.name, "restart")} /></Tooltip><Tooltip title="停止"><Button size="small" type="text" icon={<Square size={13} />} onClick={() => void serviceAction(item.name, "stop")} /></Tooltip></div> }];
  const processColumns = [{ title: "PID", dataIndex: "pid", key: "pid" }, { title: "USER", dataIndex: "user", key: "user" }, { title: "%CPU", dataIndex: "cpu", key: "cpu" }, { title: "%MEM", dataIndex: "mem", key: "mem" }, { title: "COMMAND", dataIndex: "command", key: "command" }];
  const firewallColumns = [{ title: "规则", dataIndex: "port", key: "port" }, { title: "动作", dataIndex: "action", key: "action", render: (v: string) => <Tag color="success">{v}</Tag> }, { title: "来源", dataIndex: "from", key: "from" }];
  return <div className="space-y-4 pb-12 select-none"><div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}><div className="flex items-center gap-2">{[["services", "系统服务"], ["processes", "实时进程"], ["firewall", "防火墙"]].map(([key, label]) => <button key={key} type="button" onClick={() => setTab(key as typeof tab)} className={`px-3 py-1 rounded-lg text-xs ${tab === key ? "bg-teal-500/20 text-teal-300 border border-teal-500/40" : "text-slate-400"}`}>{label}</button>)}</div><Button size="small" loading={loading} icon={<RotateCw size={12} />} onClick={() => void refresh()}>刷新</Button></div><div className="p-4 rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>{unsupported ? <div className="py-10 text-center text-xs text-slate-400">Windows 暂不支持 systemd、UFW 视图，请使用终端执行对应命令。</div> : <Table rowKey={tab === "services" ? "name" : tab === "processes" ? "pid" : "port"} size="small" columns={tab === "services" ? serviceColumns : tab === "processes" ? processColumns : firewallColumns} dataSource={tab === "services" ? services : rows} loading={loading} pagination={false} className="ops-table text-xs" />}</div></div>;
};
