import React, { useCallback, useEffect, useState } from "react";
import { Button, Table, Tag, Input, Tooltip, message, Modal } from "antd";
import { Container, Play, Square, RotateCw, Terminal, FileText, Trash2, Search, RefreshCw } from "lucide-react";
import { getErrorMessage } from "@/lib/api/client";
import { useWorkbenchRuntime } from "../context";
import type { ContainerItem } from "../types";

function parseContainers(stdout: string): ContainerItem[] {
  return stdout.split(/\r?\n/).filter(Boolean).map((line) => { const [id = "", name = "", image = "", statusText = "", ports = ""] = line.split("\t"); return { id, name, image, ports, tag: "docker", status: /^Up/i.test(statusText) ? "running" : "stopped" } as ContainerItem; });
}

export const ContainersView: React.FC = () => {
  const { runCommand } = useWorkbenchRuntime();
  const [containers, setContainers] = useState<ContainerItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => { setLoading(true); try { const result = await runCommand("docker ps -a --format '{{.ID}}\\t{{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}'"); if (result.exitCode !== 0) throw new Error(result.stderr || "Docker 查询失败"); setContainers(parseContainers(result.stdout)); } catch (error) { message.error(getErrorMessage(error)); } finally { setLoading(false); } }, [runCommand]);
  useEffect(() => { void refresh(); }, [refresh]);
  const action = async (name: string, verb: "start" | "stop" | "restart" | "rm -f") => { try { const result = await runCommand(`docker ${verb} -- ${name}`); if (result.exitCode !== 0) throw new Error(result.stderr || `docker ${verb} 失败`); message.success(`${name} 操作成功`); await refresh(); } catch (error) { message.error(getErrorMessage(error)); } };
  const filtered = containers.filter((c) => `${c.name} ${c.image}`.toLowerCase().includes(search.toLowerCase()));
  const columns = [
    { title: "容器名称", dataIndex: "name", key: "name", render: (name: string, record: ContainerItem) => <div className="flex items-center gap-2"><Container size={15} className="text-purple-400" /><span className="font-semibold text-xs text-white">{name}</span><Tag className="m-0 text-[10px]">{record.tag}</Tag></div> },
    { title: "镜像", dataIndex: "image", key: "image", render: (value: string) => <span className="font-mono text-xs text-slate-400">{value}</span> },
    { title: "状态", dataIndex: "status", key: "status", render: (value: string) => <Tag color={value === "running" ? "success" : "default"} className="m-0 text-[10px]">{value}</Tag> },
    { title: "端口映射", dataIndex: "ports", key: "ports", render: (value: string) => <span className="font-mono text-xs text-slate-400">{value || "-"}</span> },
    { title: "操作", key: "actions", width: 190, render: (_: unknown, record: ContainerItem) => <div className="flex items-center justify-end gap-1">{record.status === "running" ? <Tooltip title="停止"><Button size="small" type="text" icon={<Square size={13} />} onClick={() => void action(record.name, "stop")} /></Tooltip> : <Tooltip title="启动"><Button size="small" type="text" icon={<Play size={13} className="text-emerald-400" />} onClick={() => void action(record.name, "start")} /></Tooltip>}<Tooltip title="重启"><Button size="small" type="text" icon={<RotateCw size={13} />} onClick={() => void action(record.name, "restart")} /></Tooltip><Tooltip title="终端命令"><Button size="small" type="text" icon={<Terminal size={13} className="text-teal-400" />} onClick={() => message.info(`可在终端执行 docker exec -it ${record.name} sh`)} /></Tooltip><Tooltip title="日志"><Button size="small" type="text" icon={<FileText size={13} />} onClick={() => message.info(`请在终端执行 docker logs --tail 200 ${record.name}`)} /></Tooltip><Tooltip title="删除"><Button size="small" type="text" danger icon={<Trash2 size={13} />} onClick={() => Modal.confirm({ title: "确认删除容器？", content: record.name, okText: "删除", okType: "danger", cancelText: "取消", onOk: () => action(record.name, "rm -f") })} /></Tooltip></div> },
  ];
  return <div className="space-y-4 pb-12 select-none"><div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}><div className="flex items-center gap-2 text-xs"><span className="w-2.5 h-2.5 rounded-full bg-purple-400" /><span className="font-bold text-white">Docker 容器</span><Tag color="purple" className="m-0 text-[10px]">实时列表</Tag></div><div className="flex items-center gap-2"><Input prefix={<Search size={14} />} placeholder="搜索容器或镜像" value={search} onChange={(e) => setSearch(e.target.value)} size="small" style={{ width: 200 }} allowClear /><Button size="small" icon={<RefreshCw size={14} />} loading={loading} onClick={() => void refresh()}>刷新</Button></div></div><div className="p-4 rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}><div className="text-xs font-bold text-white mb-3">容器实例（共 {filtered.length} 个）</div><Table rowKey="id" size="small" columns={columns} dataSource={filtered} loading={loading} pagination={false} className="ops-table text-xs" /></div></div>;
};
