import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Input, Modal, Select, Tag } from "antd";
import { save } from "@tauri-apps/plugin-dialog";
import { Download, FlaskConical, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { fileApi } from "@/lib/api/file";
import { sensitiveApi } from "@/lib/api/sensitive";
import { serverApi } from "@/lib/api/server";
import type { SensitiveEntry, SensitiveStatus, Server } from "@/types";
import { SensitiveDetail, STATUS_LABELS, TYPE_LABELS } from "./SensitiveDetail";
import { SensitiveTable } from "./SensitiveTable";
import { ScanDialog } from "./ScanDialog";

const EMPTY_ENTRIES: SensitiveEntry[] = [];
type Activity = "refresh" | "status" | "export";
type Feedback = { type: "error" | "success"; message: string };

export default function SensitivePage() {
  const [entries, setEntries] = useState<SensitiveEntry[] | null>(null);
  const [servers, setServers] = useState<Server[]>([]);
  const [listFailed, setListFailed] = useState(false);
  const [serversFailed, setServersFailed] = useState(false);
  const [activity, setActivity] = useState<Activity | null>("refresh");
  const active = useRef<Activity | null>(null);
  const [feedback, setFeedback] = useState<Feedback>();
  const [serverId, setServerId] = useState<number>();
  const [status, setStatus] = useState<SensitiveStatus>();
  const [secretType, setSecretType] = useState<string>();
  const [search, setSearch] = useState("");
  const [match, setMatch] = useState<{ query: string; snapshot: SensitiveEntry[]; rows: SensitiveEntry[] | null }>();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detailId, setDetailId] = useState<number>();
  const [discardIds, setDiscardIds] = useState<number[]>([]);
  const [scanOpen, setScanOpen] = useState(false);
  const query = search.trim();
  const snapshot = entries ?? EMPTY_ENTRIES;
  const searchResult = match?.query === query && match.snapshot === entries ? match : undefined;
  const searching = Boolean(query && entries && !searchResult && !listFailed);
  const searchFailed = searchResult?.rows === null;
  const matchingRows = query ? searchResult?.rows ?? EMPTY_ENTRIES : snapshot;
  const visible = matchingRows.filter((entry) =>
    (serverId === undefined || entry.serverId === serverId)
    && (!status || entry.status === status)
    && (!secretType || entry.secretType === secretType),
  );
  const detail = matchingRows.find((entry) => entry.id === detailId) ?? snapshot.find((entry) => entry.id === detailId);
  const visibleIds = new Set(visible.map((entry) => entry.id));
  const selected = selectedIds.filter((id) => visibleIds.has(id));
  const ready = entries !== null && !activity && !listFailed && !searching && !searchFailed;

  const reloadEntries = useCallback(async () => {
    try {
      const rows = await sensitiveApi.list();
      setEntries(rows);
      const ids = new Set(rows.map((entry) => entry.id));
      setSelectedIds((current) => current.filter((id) => ids.has(id)));
      setDetailId((id) => id !== undefined && ids.has(id) ? id : undefined);
      setListFailed(false);
    } catch {
      setListFailed(true);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (active.current) return;
    active.current = "refresh";
    setActivity("refresh");
    await Promise.all([
      reloadEntries(),
      serverApi.list().then((rows) => {
        setServers(rows);
        setServersFailed(false);
      }, () => setServersFailed(true)),
    ]);
    active.current = null;
    setActivity(null);
  }, [reloadEntries]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!query || !entries || listFailed) return;
    let current = true;
    // 搜索与 CSV 使用同一个后端查询，避免页面和导出的匹配范围不同。
    const timer = window.setTimeout(() => {
      void sensitiveApi.list({ search: query }).then(
        (rows) => { if (current) setMatch({ query, snapshot: entries, rows }); },
        () => { if (current) setMatch({ query, snapshot: entries, rows: null }); },
      );
    }, 220);
    return () => { current = false; window.clearTimeout(timer); };
  }, [query, entries, listFailed]);

  const applyStatus = async (ids: number[], nextStatus: SensitiveStatus) => {
    if (!ready || active.current || ids.length === 0) return;
    active.current = "status";
    setActivity("status");
    setFeedback(undefined);
    // 逐条确认后端结果。批量请求可能部分成功，也可能返回记录已不存在。
    const completed = new Set<number>();
    for (const id of ids) {
      try {
        if (await sensitiveApi.updateStatus(id, nextStatus)) completed.add(id);
      } catch {
        // 继续处理本次选择中的其他记录，最后以重新读取的状态为准。
      }
    }
    const failed = ids.length - completed.size;
    setSelectedIds((current) => current.filter((id) => !completed.has(id)));
    await reloadEntries();
    setFeedback(failed
      ? { type: "error", message: `状态更新完成：成功 ${completed.size} 条，失败 ${failed} 条。请核对刷新后的记录再重试。` }
      : { type: "success", message: `已更新 ${completed.size} 条记录为「${STATUS_LABELS[nextStatus]}」` });
    active.current = null;
    setActivity(null);
  };

  const exportCsv = async () => {
    if (!ready || !visible.length || active.current) return;
    active.current = "export";
    setActivity("export");
    setFeedback(undefined);
    try {
      const path = await save({
        title: "导出敏感库脱敏记录",
        defaultPath: `opspub-sensitive-${new Date().toISOString().slice(0, 10)}.csv`,
        filters: [{ name: "CSV 文件", extensions: ["csv"] }],
      });
      if (!path) return;
      const csv = await sensitiveApi.exportCsv({ serverId, status, secretType, search: query || null });
      await fileApi.writeText(path, csv);
      setFeedback({ type: "success", message: "已导出当前筛选的脱敏记录" });
    } catch {
      setFeedback({ type: "error", message: "脱敏 CSV 导出失败。请检查保存位置后重试。" });
    } finally {
      active.current = null;
      setActivity(null);
    }
  };

  const serverLabels = new Map(servers.map((server) => [server.id, server.alias]));
  const types = new Map(TYPE_LABELS);
  for (const entry of snapshot) {
    if (entry.serverId !== null && !serverLabels.has(entry.serverId)) serverLabels.set(entry.serverId, entry.serverAlias);
    if (!types.has(entry.secretType)) types.set(entry.secretType, entry.secretType);
  }
  const alerts = (
    <>
      {listFailed && <Alert showIcon type="error" message="敏感记录读取失败。请刷新后重试。" />}
      {searchFailed && <Alert showIcon type="error" message="敏感记录搜索失败。请刷新或修改搜索条件。" />}
      {feedback && <Alert showIcon closable type={feedback.type} message={feedback.message} onClose={() => setFeedback(undefined)} />}
    </>
  );

  return (
    <div className="ops-page ops-sensitive-page flex min-w-0 flex-col gap-3 p-4 text-xs">
      <header className="ops-page-head">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="ops-page-title m-0"><ShieldAlert size={17} className="text-[var(--warning)]" />敏感库</h1>
            {entries && !listFailed && <Tag color="gold">{snapshot.filter((entry) => entry.status === "pending").length} 待处理拦截</Tag>}
          </div>
          <p className="ops-page-desc mb-0">AI 出口脱敏记录</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="small" icon={<Download size={14} />} disabled={!ready || !visible.length} loading={activity === "export"} onClick={() => void exportCsv()}>导出 CSV</Button>
          <Button size="small" type="primary" icon={<FlaskConical size={14} />} disabled={Boolean(activity)} onClick={() => setScanOpen(true)}>测试脱敏规则</Button>
          <Button size="small" aria-label="刷新敏感库" title="刷新敏感库" icon={<RefreshCw size={14} />} disabled={Boolean(activity)} loading={activity === "refresh"} onClick={() => void refresh()} />
        </div>
      </header>

      {serversFailed && <Alert showIcon type="warning" message="服务器列表读取失败，暂时无法为扫描关联服务器。" />}
      {!detail && alerts}

      <div className="flex flex-wrap items-center gap-2" aria-label="敏感库筛选">
        <Select allowClear showSearch optionFilterProp="label" aria-label="按服务器筛选" value={serverId} onChange={(value) => { setServerId(value); setSelectedIds([]); }} placeholder="全部服务器" className="w-36" options={[...serverLabels].map(([value, label]) => ({ value, label }))} />
        <Select allowClear aria-label="按状态筛选" value={status} onChange={(value) => { setStatus(value); setSelectedIds([]); }} placeholder="全部状态" className="w-29" options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
        <Select allowClear aria-label="按类型筛选" value={secretType} onChange={(value) => { setSecretType(value); setSelectedIds([]); }} placeholder="全部类型" className="w-28" options={[...types].map(([value, label]) => ({ value, label }))} />
        <Input allowClear aria-label="搜索敏感记录" value={search} onChange={(event) => { setSearch(event.target.value); setSelectedIds([]); }} prefix={<Search size={14} />} placeholder="搜索标签、服务器或来源" className="min-w-48 flex-1" />
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span>已选 {selected.length} 条</span>
          <Button size="small" disabled={!ready} onClick={() => void applyStatus(selected, "retained")}>批量保留</Button>
          <Button size="small" disabled={!ready} onClick={() => void applyStatus(selected, "false_positive")}>批量误判</Button>
          <Button size="small" danger disabled={!ready} onClick={() => setDiscardIds(selected)}>批量丢弃</Button>
          <Button size="small" type="text" disabled={Boolean(activity)} onClick={() => setSelectedIds([])}>取消选择</Button>
        </div>
      )}

      <SensitiveTable
        entries={visible}
        total={entries?.length}
        loading={activity === "refresh" || searching}
        unavailable={searchFailed || (listFailed && (!entries || Boolean(query && !searchResult)))}
        selectionDisabled={!ready}
        selected={selected}
        onSelect={setSelectedIds}
        onDetail={(id) => { setFeedback(undefined); setDetailId(id); }}
      />

      {scanOpen && <ScanDialog servers={serversFailed ? [] : servers} onSettled={reloadEntries} onClose={() => setScanOpen(false)} />}
      <SensitiveDetail
        entry={detail}
        busy={activity === "status"}
        canUpdate={ready}
        feedback={alerts}
        onClose={() => setDetailId(undefined)}
        onStatus={(id, nextStatus) => nextStatus === "discarded" ? setDiscardIds([id]) : void applyStatus([id], nextStatus)}
      />
      <Modal
        title={`丢弃选中的 ${discardIds.length} 条敏感记录？`}
        open={discardIds.length > 0}
        maskClosable={false}
        okText="确认丢弃"
        cancelText="取消"
        okButtonProps={{ danger: true, disabled: !ready }}
        onCancel={() => setDiscardIds([])}
        onOk={() => { void applyStatus(discardIds, "discarded"); setDiscardIds([]); }}
      >
        <p className="m-0">丢弃会将这些记录标记为「已丢弃」，脱敏元数据仍会保留。</p>
      </Modal>
    </div>
  );
}
