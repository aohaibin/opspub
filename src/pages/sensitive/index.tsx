import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Empty, Input, Modal, Select, Tag, message } from "antd";
import { save } from "@tauri-apps/plugin-dialog";
import { Download, Eye, FileWarning, Filter, FlaskConical, Info, RefreshCw, Search, ShieldAlert, ThumbsDown, Trash2 } from "lucide-react";
import { fileApi } from "@/lib/api/file";
import { getErrorMessage } from "@/lib/api/client";
import { sensitiveApi } from "@/lib/api/sensitive";
import { serverApi } from "@/lib/api/server";
import type { SensitiveEntry, SensitiveStatus, Server } from "@/types";

const STATUS_LABELS: Record<SensitiveStatus, string> = {
  pending: "待处理",
  retained: "已保留",
  false_positive: "误判",
  discarded: "已丢弃",
};

const STATUS_COLORS: Record<SensitiveStatus, string> = {
  pending: "gold",
  retained: "green",
  false_positive: "default",
  discarded: "red",
};

const TYPE_LABELS: Record<string, string> = {
  credential: "凭据",
  private_key: "私钥",
  token: "Token",
  ip: "公网 IP",
};

function displayTime(value: string) {
  const parsed = new Date(value.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("zh-CN", { hour12: false });
}

function typeLabel(value: string) {
  return TYPE_LABELS[value] ?? value;
}

function statusLabel(value: string) {
  return STATUS_LABELS[value as SensitiveStatus] ?? value;
}

function sourceLabel(value: string) {
  return value.length > 42 ? `${value.slice(0, 42)}...` : value;
}

export default function SensitivePage() {
  const [entries, setEntries] = useState<SensitiveEntry[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [serverFilter, setServerFilter] = useState<number>();
  const [statusFilter, setStatusFilter] = useState<SensitiveStatus>();
  const [typeFilter, setTypeFilter] = useState<string>();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [detailEntry, setDetailEntry] = useState<SensitiveEntry | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [scanServerId, setScanServerId] = useState<number>();
  const [scanSource, setScanSource] = useState("手动测试");
  const [scanContent, setScanContent] = useState("");
  const [scanPreview, setScanPreview] = useState("");
  const [scanMatchCount, setScanMatchCount] = useState(0);
  const [scanLoading, setScanLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [entryList, serverList] = await Promise.all([sensitiveApi.list(), serverApi.list()]);
      setEntries(entryList);
      setServers(serverList);
      setSelectedIds(new Set());
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visibleEntries = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return entries.filter((entry) => {
      const haystack = `${entry.serverAlias} ${entry.label} ${entry.source} ${entry.maskedValue} ${typeLabel(entry.secretType)}`.toLowerCase();
      return (!serverFilter || entry.serverId === serverFilter)
        && (!statusFilter || entry.status === statusFilter)
        && (!typeFilter || entry.secretType === typeFilter)
        && (!needle || haystack.includes(needle));
    });
  }, [entries, search, serverFilter, statusFilter, typeFilter]);

  const pendingCount = useMemo(() => entries.filter((entry) => entry.status === "pending").length, [entries]);

  const allVisibleSelected = visibleEntries.length > 0 && visibleEntries.every((entry) => selectedIds.has(entry.id));

  const toggleSelected = (id: number) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleEntries.forEach((entry) => next.delete(entry.id));
      else visibleEntries.forEach((entry) => next.add(entry.id));
      return next;
    });
  };

  const updateStatus = async (entry: SensitiveEntry, status: SensitiveStatus) => {
    try {
      await sensitiveApi.updateStatus(entry.id, status);
      setEntries((current) => current.map((item) => item.id === entry.id ? { ...item, status } : item));
      setSelectedIds((current) => { const next = new Set(current); next.delete(entry.id); return next; });
      message.success(`已标记为${STATUS_LABELS[status]}`);
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const bulkUpdate = async (status: SensitiveStatus) => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (status === "discarded") {
      Modal.confirm({
        title: `确认丢弃选中的 ${ids.length} 条记录？`,
        content: "丢弃只会更新本地记录状态，不会恢复或暴露原始敏感内容。",
        okText: "确认丢弃",
        cancelText: "取消",
        okButtonProps: { danger: true },
        onOk: () => applyBulkStatus(ids, status),
      });
      return;
    }
    await applyBulkStatus(ids, status);
  };

  const applyBulkStatus = async (ids: number[], status: SensitiveStatus) => {
    try {
      await Promise.all(ids.map((id) => sensitiveApi.updateStatus(id, status)));
      setEntries((current) => current.map((item) => ids.includes(item.id) ? { ...item, status } : item));
      setSelectedIds(new Set());
      message.success(`已批量标记 ${ids.length} 条为${STATUS_LABELS[status]}`);
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const closeTestModal = () => {
    setTestOpen(false);
    setScanContent("");
    setScanPreview("");
    setScanMatchCount(0);
  };

  const discardEntry = (entry: SensitiveEntry) => {
    Modal.confirm({
      title: "丢弃这条敏感记录？",
      content: "丢弃只会更新本地记录状态，不会恢复或暴露原始敏感内容。",
      okText: "确认丢弃",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: () => updateStatus(entry, "discarded"),
    });
  };

  const exportCsv = async () => {
    try {
      const path = await save({
        title: "导出敏感库脱敏记录",
        defaultPath: `opspub-sensitive-${new Date().toISOString().slice(0, 10)}.csv`,
        filters: [{ name: "CSV 文件", extensions: ["csv"] }],
      });
      if (!path) return;
      const csv = await sensitiveApi.exportCsv({ serverId: serverFilter ?? null, status: statusFilter ?? null, secretType: typeFilter ?? null, search: search.trim() || null });
      await fileApi.writeText(path, csv);
      message.success(`已导出脱敏记录：${path}`);
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const testMasking = async () => {
    const content = scanContent.trim();
    const source = scanSource.trim();
    if (!content || !source) {
      message.warning("请填写待扫描内容和来源");
      return;
    }
    const server = servers.find((item) => item.id === scanServerId);
    setScanLoading(true);
    try {
      const result = await sensitiveApi.scan({ serverId: scanServerId ?? null, serverAlias: server?.alias ?? null, source, content });
      if (result.entries.length) {
        setEntries((current) => {
          const byId = new Map(current.map((entry) => [entry.id, entry]));
          result.entries.forEach((entry) => byId.set(entry.id, entry));
          return [...byId.values()].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt) || b.id - a.id);
        });
      }
      setScanPreview(result.sanitizedContent);
      setScanMatchCount(result.matchCount);
      message.success(result.matchCount ? `检测到 ${result.matchCount} 条敏感信息，已保存脱敏记录` : "未检测到敏感信息");
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setScanLoading(false);
    }
  };

  return (
    <div className="ops-page ops-sensitive-page flex h-full min-h-0 flex-col gap-3 overflow-hidden p-4 text-xs sm:p-5">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><ShieldAlert size={17} className="text-amber-400" /><h1 className="m-0 text-base font-bold text-white">敏感库</h1><Tag color="gold" className="m-0">{pendingCount} 待处理拦截</Tag></div>
          <p className="mb-0 mt-1 text-[11px] text-slate-400">AI 出口脱敏：识别密码、Token、私钥和 IP 地址，只保存脱敏预览，防止生产机密上云。</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="small" icon={<Download size={14} />} onClick={() => void exportCsv()} disabled={loading}>导出 CSV</Button>
          <Button size="small" type="primary" icon={<FlaskConical size={14} />} onClick={() => setTestOpen(true)}>测试脱敏规则</Button>
          <Button size="small" aria-label="刷新敏感库" title="刷新" icon={<RefreshCw size={14} />} loading={loading} onClick={() => void load()} />
        </div>
      </header>

      <section className="flex shrink-0 items-start gap-3 rounded-xl border border-slate-800 bg-surface-900/90 p-3.5">
        <div className="mt-0.5 shrink-0 rounded-lg border border-amber-500/20 bg-amber-500/10 p-1.5 text-amber-400"><Info size={16} /></div>
        <div className="min-w-0 space-y-1"><div className="font-semibold text-slate-200">这里不是日常入口，为什么会有条目？</div><p className="m-0 leading-relaxed text-slate-400">AI 读取 .env、进程参数或错误堆栈时，如果回显包含未经遮蔽的密码串或 PEM 私钥，安全网关会在发送给外部模型前替换为掩码，并把脱敏元数据记录在这里。原始命中内容不会写入本地数据库。</p></div>
      </section>

      <section className="flex shrink-0 flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-slate-400"><Filter size={14} />筛选：</span>
        <Select allowClear showSearch optionFilterProp="label" value={serverFilter} onChange={setServerFilter} placeholder="全部服务器" className="w-40" options={servers.map((server) => ({ value: server.id, label: server.alias }))} />
        <Select allowClear value={statusFilter} onChange={setStatusFilter} placeholder="全部状态" className="w-32" options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
        <Select allowClear value={typeFilter} onChange={setTypeFilter} placeholder="全部类型" className="w-28" options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
        <Input allowClear value={search} onChange={(event) => setSearch(event.target.value)} prefix={<Search size={14} className="text-slate-500" />} placeholder="搜索 label / 命令 / 提示..." className="min-w-52 flex-1 sm:max-w-80" />
        {selectedIds.size > 0 && <div className="ml-auto flex items-center gap-1"><span className="text-slate-400">已选 {selectedIds.size}</span><Button size="small" onClick={() => void bulkUpdate("retained")}>批量保留</Button><Button size="small" onClick={() => void bulkUpdate("false_positive")}>批量误判</Button><Button size="small" danger onClick={() => void bulkUpdate("discarded")}>批量丢弃</Button></div>}
      </section>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-800 bg-surface-900/75">
        <div className="custom-scrollbar min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[1120px] text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-slate-800 bg-surface-900/95 text-[11px] text-slate-400"><tr><th className="w-10 p-3"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="全选当前筛选结果" className="accent-amber-500" /></th><th className="w-44 p-3 font-medium">时间</th><th className="w-36 p-3 font-medium">服务器</th><th className="w-24 p-3 font-medium">类型</th><th className="w-44 p-3 font-medium">标签</th><th className="w-40 p-3 font-medium">脱敏预览</th><th className="min-w-56 p-3 font-medium">来源</th><th className="w-24 p-3 font-medium">状态</th><th className="w-64 p-3 text-right font-medium">操作</th></tr></thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px] text-slate-300">
              {visibleEntries.map((entry) => <tr key={entry.id} className="transition hover:bg-surface-850/40"><td className="p-3"><input type="checkbox" checked={selectedIds.has(entry.id)} onChange={() => toggleSelected(entry.id)} aria-label={`选择敏感记录 ${entry.id}`} className="accent-amber-500" /></td><td className="p-3 whitespace-nowrap text-slate-400">{displayTime(entry.detectedAt)}</td><td className="p-3 font-sans font-medium text-sky-300">{entry.serverAlias || "未关联服务器"}</td><td className="p-3"><Tag color={entry.secretType === "private_key" ? "purple" : "red"}>{typeLabel(entry.secretType)}</Tag></td><td className="p-3 font-sans text-slate-300">{entry.label}</td><td className="p-3"><span className="rounded bg-surface-950 px-2 py-1 font-mono font-bold text-emerald-300">{entry.maskedValue}</span></td><td className="p-3 text-slate-400" title={entry.source}>{sourceLabel(entry.source)}</td><td className="p-3"><Tag color={STATUS_COLORS[entry.status as SensitiveStatus] ?? "default"}>{statusLabel(entry.status)}</Tag></td><td className="p-3"><div className="flex justify-end gap-1 font-sans"><Button size="small" type="text" icon={<Eye size={13} />} onClick={() => setDetailEntry(entry)}>查看</Button><Button size="small" type="text" icon={<FileWarning size={13} />} onClick={() => void updateStatus(entry, "retained")}>保留</Button><Button size="small" type="text" icon={<ThumbsDown size={13} />} onClick={() => void updateStatus(entry, "false_positive")}>误判</Button><Button size="small" danger type="text" icon={<Trash2 size={13} />} onClick={() => discardEntry(entry)}>丢弃</Button></div></td></tr>)}
            </tbody>
          </table>
          {!loading && visibleEntries.length === 0 && <div className="p-12"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的敏感记录" /></div>}
        </div>
        <div className="flex shrink-0 items-center justify-between border-t border-slate-800 bg-surface-900/60 px-3 py-2 text-[11px] text-slate-400"><span>显示 {visibleEntries.length} / {entries.length} 条记录</span><span className="inline-flex items-center gap-1"><ShieldAlert size={12} className="text-amber-400" />仅展示脱敏元数据</span></div>
      </section>

      <Modal className="ops-sensitive-modal" title="测试 AI 出口脱敏规则" open={testOpen} width={860} centered maskClosable={false} destroyOnClose onCancel={closeTestModal} onOk={() => void testMasking()} okText="开始扫描" cancelText="关闭" confirmLoading={scanLoading}>
        <div className="space-y-3"><p className="m-0 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] leading-relaxed text-amber-200">输入任意包含密码、Token 或私钥的文本，后端只保存匹配类型、掩码、来源和哈希，不保存原文。右侧展示实际发往模型前的脱敏结果。</p><div className="grid gap-3 md:grid-cols-2"><div><label className="block text-xs font-semibold text-slate-400">原始输入文本</label><textarea value={scanContent} onChange={(event) => { setScanContent(event.target.value); setScanPreview(""); setScanMatchCount(0); }} rows={9} className="mt-1 w-full resize-y rounded-lg border border-slate-700 bg-surface-950 p-3 font-mono text-xs leading-relaxed text-slate-200 outline-none focus:border-amber-500" placeholder={'例如：DATABASE_PASSWORD=example-password\nAuthorization: Bearer example-token'} /></div><div><div className="flex items-center justify-between"><label className="block text-xs font-semibold text-emerald-400">出口脱敏预览</label><span className="text-[11px] text-slate-500">命中 {scanMatchCount} 条</span></div><pre className="mt-1 min-h-[216px] max-h-[300px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-emerald-500/30 bg-surface-950 p-3 font-mono text-xs leading-relaxed text-emerald-300">{scanPreview || "点击开始扫描后显示脱敏结果"}</pre></div></div><div className="grid gap-3 md:grid-cols-2"><label className="block text-xs text-slate-400">关联服务器（可选）<Select allowClear showSearch optionFilterProp="label" value={scanServerId} onChange={setScanServerId} placeholder="未关联服务器" className="mt-1 w-full" options={servers.map((server) => ({ value: server.id, label: `${server.alias} · ${server.hostname}` }))} /></label><label className="block text-xs text-slate-400">来源<Input value={scanSource} onChange={(event) => setScanSource(event.target.value)} className="mt-1" placeholder="例如：ssh_exec · .env 检查" /></label></div></div>
      </Modal>

      <Modal title="敏感条目详情" open={Boolean(detailEntry)} width={560} footer={<Button onClick={() => setDetailEntry(null)}>关闭</Button>} onCancel={() => setDetailEntry(null)}>
        {detailEntry && <div className="space-y-3 text-xs"><div className="grid grid-cols-2 gap-3"><div><div className="text-slate-500">服务器</div><div className="mt-1 text-sky-300">{detailEntry.serverAlias || "未关联服务器"}</div></div><div><div className="text-slate-500">检测时间</div><div className="mt-1 text-slate-300">{displayTime(detailEntry.detectedAt)}</div></div><div><div className="text-slate-500">类型</div><div className="mt-1 text-slate-300">{typeLabel(detailEntry.secretType)}</div></div><div><div className="text-slate-500">状态</div><div className="mt-1"><Tag color={STATUS_COLORS[detailEntry.status as SensitiveStatus] ?? "default"}>{statusLabel(detailEntry.status)}</Tag></div></div><div><div className="text-slate-500">命中次数</div><div className="mt-1 font-mono text-slate-300">{detailEntry.matchCount}</div></div><div><div className="text-slate-500">更新时间</div><div className="mt-1 text-slate-300">{displayTime(detailEntry.updatedAt)}</div></div></div><div><div className="text-slate-500">标签</div><div className="mt-1 text-slate-200">{detailEntry.label}</div></div><div><div className="text-slate-500">脱敏预览</div><code className="mt-1 block rounded-lg border border-slate-800 bg-surface-950 p-3 font-mono text-emerald-300">{detailEntry.maskedValue}</code></div><div><div className="text-slate-500">来源</div><div className="mt-1 break-all text-slate-300">{detailEntry.source}</div></div><div><div className="text-slate-500">匹配指纹（SHA-256）</div><code className="mt-1 block break-all font-mono text-[11px] text-slate-500">{detailEntry.valueHash}</code></div></div>}
      </Modal>
    </div>
  );
}
