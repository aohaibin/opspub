import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, Button, Pagination, Segmented, message } from "antd";
import { save } from "@tauri-apps/plugin-dialog";
import { ArrowUpRight, Download, RefreshCw, ScrollText } from "lucide-react";
import { auditApi, serverApi } from "@/lib/api/server";
import { fileApi } from "@/lib/api/file";
import { getErrorMessage } from "@/lib/api/client";
import { projectSensitiveText } from "@/lib/sensitive-projection";
import { saveTerminalLibraryItem } from "@/lib/terminal-interactions";
import type { AuditLogPage } from "@/types";
import { AuditDetail } from "./AuditDetail";
import { AuditFilters, AuditTable } from "./AuditList";
import {
  DEFAULT_PAGE_SIZE, EMPTY_FILTERS, MAX_OFFSET, PAGE_SIZES, SOURCE_LABELS, VERDICTS,
  filterAuditRows, prepareAuditRow, type AuditRow,
} from "./audit";
import "./audit.css";

function positiveInteger(value: string | null) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

export default function AuditPage() {
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [refreshKey, setRefreshKey] = useState(0);
  const [snapshot, setSnapshot] = useState<Omit<AuditLogPage, "records"> & { records: AuditRow[] }>();
  const [settled, setSettled] = useState<{ key: string; error?: string }>();
  const [serverAliases, setServerAliases] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const exportInProgress = useRef(false);
  const [notice, noticeHolder] = message.useMessage({ top: 64, maxCount: 1 });

  const view = params.get("view") === "batch" ? "batch" : "all";
  const requestedSize = positiveInteger(params.get("pageSize"));
  const pageSize = PAGE_SIZES.includes(requestedSize) ? requestedSize : DEFAULT_PAGE_SIZE;
  const maxPage = Math.floor(MAX_OFFSET / pageSize) + 1;
  const page = Math.min(maxPage, positiveInteger(params.get("page")) || 1);
  const auditId = positiveInteger(params.get("auditId"));
  const offset = (page - 1) * pageSize;
  const key = `${offset}:${pageSize}:${refreshKey}`;
  const loading = settled?.key !== key;
  const error = loading ? undefined : settled.error;
  const currentPage = snapshot?.offset === offset && snapshot.limit === pageSize ? snapshot : undefined;
  const rows = useMemo(() => currentPage?.records ?? [], [currentPage]);
  const visibleRows = useMemo(() => filterAuditRows(rows, filters, view === "batch"), [rows, filters, view]);
  const selected = rows.find((row) => row.id === auditId);
  const lastPage = Math.max(1, Math.ceil((currentPage?.total ?? 0) / pageSize));

  useEffect(() => {
    let active = true;
    setSettled(undefined);
    void auditApi.getLogsPage(pageSize, offset).then((result) => {
      if (!active) return;
      setSnapshot({ ...result, records: result.records.map(prepareAuditRow) });
      setSettled({ key });
    }).catch((cause) => {
      if (active) setSettled({ key, error: projectSensitiveText(getErrorMessage(cause)) || "审计日志读取失败" });
    });
    return () => { active = false; };
  }, [key, offset, pageSize]);

  useEffect(() => {
    // 服务器列表只补充筛选选项。已删除目标及列表读取失败时，仍可使用日志中的别名。
    let active = true;
    void serverApi.list().then((servers) => {
      if (active) setServerAliases(servers.map((server) => projectSensitiveText(server.alias)));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [refreshKey]);

  useEffect(() => {
    if (loading || error || !currentPage || page <= lastPage) return;
    // 保留期清理可能删掉末页。重新读取范围内的最后一页。
    const next = new URLSearchParams(params);
    if (lastPage === 1) next.delete("page");
    else next.set("page", String(lastPage));
    setParams(next, { replace: true });
  }, [currentPage, error, lastPage, loading, page, params, setParams]);

  function changeParams(changes: Record<string, string | null>, replace = false) {
    const next = new URLSearchParams(params);
    for (const [name, value] of Object.entries(changes)) {
      if (value === null) next.delete(name);
      else next.set(name, value);
    }
    setParams(next, { replace });
  }

  const refresh = () => setRefreshKey((value) => value + 1);

  async function copyCommand(row: AuditRow) {
    try {
      await navigator.clipboard.writeText(row.command);
      void notice.success("已复制脱敏命令");
    } catch {
      void notice.error("复制失败，可在详情中手动选择命令");
    }
  }

  function saveExperience(row: AuditRow) {
    try {
      const title = `${row.server} · ${row.tool}`.slice(0, 80);
      const content = `审计记录 #${row.id}\n时间：${row.createdAt}\n来源：${SOURCE_LABELS[row.source]}\n命令：${row.command}\n结果：${row.result}`;
      const marker = "\n…（内容已截断）";
      const shortened = content.length > 12_000;
      saveTerminalLibraryItem("experience", title, shortened ? content.slice(0, 12_000 - marker.length) + marker : content);
      void notice.success(shortened ? "已保存到本机经验库，超长内容已截断" : "已保存到本机经验库");
    } catch (cause) {
      void notice.error(projectSensitiveText(getErrorMessage(cause)));
    }
  }

  async function exportPage() {
    if (exportInProgress.current || loading || error || !visibleRows.length) return;
    exportInProgress.current = true;
    setExporting(true);
    try {
      const exportedAt = new Date().toISOString();
      const records = visibleRows.map(({ id, createdAt, source, actor, server, tool, command, result, verdict }) => ({
        id, createdAt, source: SOURCE_LABELS[source], actor, server, tool, command, result, verdict: VERDICTS[verdict].label,
      }));
      const path = await save({
        title: "导出当前页脱敏审计记录",
        defaultPath: `opspub-audit-${exportedAt.replace(/[T:]/g, "-").slice(0, 17)}.json`,
        filters: [{ name: "JSON 文件", extensions: ["json"] }],
      });
      if (!path) return;
      await fileApi.writeText(path, JSON.stringify({ exportedAt, count: records.length, records }, null, 2));
      void notice.success(`已导出 ${records.length} 条脱敏记录`);
    } catch (cause) {
      void notice.error(projectSensitiveText(getErrorMessage(cause)));
    } finally {
      exportInProgress.current = false;
      setExporting(false);
    }
  }

  // 日志的 created_at 使用本地时区，今日计数也按本地日期比较。
  const today = new Date().toLocaleDateString("sv-SE");
  const stats = [
    { label: "总计", value: snapshot?.total, tone: "var(--info)" },
    { label: "本页今日", value: rows.filter((row) => row.createdAt.startsWith(today)).length, tone: "var(--success)" },
    { label: "本页待审批", value: rows.filter((row) => row.verdict === "pending").length, tone: "var(--warning)" },
    { label: "本页已拒绝", value: rows.filter((row) => row.verdict === "rejected").length, tone: "var(--danger)" },
    { label: "本页已拦截", value: rows.filter((row) => row.verdict === "blocked").length, tone: "var(--danger)" },
    { label: "本页命中脱敏", value: rows.filter((row) => row.redacted).length, tone: "var(--info)" },
  ];

  return <div className="audit-page">
    {noticeHolder}
    <header className="audit-header">
      <div>
        <h1><ScrollText size={18} aria-hidden />审计日志</h1>
        <p>查看本机记录的操作、裁决与执行结果。</p>
      </div>
      <div className="audit-actions">
        <Link to="/security" className="audit-link">安全闸门与审批 <ArrowUpRight size={13} /></Link>
        <Segmented size="small" aria-label="审计视图" value={view} onChange={(next) =>
          changeParams({ view: next === "all" ? null : next })}
          options={[{ value: "all", label: "全部" }, { value: "batch", label: "批次" }]} />
        <Button size="small" icon={<Download size={14} />} loading={exporting}
          disabled={loading || !!error || !visibleRows.length} onClick={() => void exportPage()}>导出当前页</Button>
        <Button size="small" icon={<RefreshCw size={14} />} loading={loading} onClick={refresh}>刷新</Button>
      </div>
    </header>

    <dl className="audit-stats" aria-label="审计统计">
      {stats.map(({ label, value, tone }, index) => <div key={label} style={{ borderInlineStartColor: tone }}>
        <dt>{label}</dt><dd>{(index === 0 || currentPage) ? value?.toLocaleString() ?? "—" : "—"}</dd>
      </div>)}
    </dl>

    <AuditFilters rows={rows} serverAliases={serverAliases} value={filters} onChange={setFilters} />
    {error && <Alert type="error" title={currentPage ? "刷新失败，显示上次读取的记录" : "审计日志读取失败"}
      description={error} showIcon action={<Button size="small" onClick={refresh}>重试</Button>} />}

    <section className="audit-results" aria-label="审计记录">
      <div className="audit-results-meta">
        <span role="status">当前页匹配 {visibleRows.length} 条 · 筛选、搜索和导出仅限当前页</span>
      </div>
      <div className="audit-table custom-scrollbar">
        <AuditTable rows={visibleRows} loading={loading}
          emptyText={loading ? "正在读取审计记录" : error && !currentPage ? "暂无可显示的记录"
            : !rows.length ? "暂无审计记录" : "当前页没有匹配的记录"}
          onDetail={(row) => changeParams({ auditId: String(row.id) })}
          onCopy={(row) => void copyCommand(row)} onExperience={saveExperience} />
      </div>
      <footer className="audit-pagination">
        <span>按时间从新到旧</span>
        <Pagination size="small" current={page} pageSize={pageSize} showSizeChanger pageSizeOptions={PAGE_SIZES}
          total={Math.min(maxPage * pageSize, snapshot?.total ?? 0)} disabled={loading}
          onChange={(nextPage, nextSize) => changeParams({
            page: nextSize !== pageSize || nextPage === 1 ? null : String(nextPage),
            pageSize: nextSize === DEFAULT_PAGE_SIZE ? null : String(nextSize),
            auditId: null,
          })} />
      </footer>
    </section>

    {auditId > 0 && <AuditDetail id={auditId} row={selected} loading={loading} failed={!!error}
      refreshKey={refreshKey} onClose={() => changeParams({ auditId: null }, true)} onRefresh={refresh}
      onCopy={(row) => void copyCommand(row)} onExperience={saveExperience} />}
  </div>;
}
