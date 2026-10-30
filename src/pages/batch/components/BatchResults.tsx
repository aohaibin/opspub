import { Button, Progress, message } from "antd";
import { Check, CircleAlert, Clock3, Copy, ListChecks, LoaderCircle, RotateCw, X } from "lucide-react";
import { getErrorMessage } from "@/lib/api/client";
import { formatResult, type RunRow } from "@/pages/batch/types";

interface Props {
  rows: RunRow[];
  running: boolean;
  disabled: boolean;
  command: string;
  elapsedMs: number | null;
  onRetry: (row: RunRow) => void;
  onRerun: () => void;
  onClear: () => void;
}

export function BatchResults({ rows, running, disabled, command, elapsedMs, onRetry, onRerun, onClear }: Props) {
  const success = rows.filter((row) => row.status === "success").length;
  const failed = rows.filter((row) => row.status === "failed").length;
  const skipped = rows.filter((row) => row.status === "skipped").length;
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); message.success("执行结果已复制"); }
    catch (error) { message.error(getErrorMessage(error)); }
  };

  return <section className="batch-panel batch-results">
    {!rows.length ? <div className="batch-empty">
      <div className="batch-empty-icon"><ListChecks size={25} /></div>
      <h2>尚未运行</h2><p>勾选左侧服务器 → 写好命令 → 点击右上角「开始批量执行」</p>
    </div> : <>
      <div className="batch-result-heading">
        <div><strong>{running ? "正在批量执行" : "执行完成"}（{rows.length} 台目标）</strong>
          <p>{elapsedMs === null ? "正在计时" : `总耗时 ${elapsedMs}ms`} · 成功 {success} · 失败 {failed} · 跳过 {skipped}</p></div>
        <div className="batch-actions">
          <Button size="small" icon={<Copy size={13} />} disabled={running} onClick={() => void copy(rows.map((row) => formatResult(row, command)).join("\n\n"))}>复制全部</Button>
          <Button size="small" icon={<RotateCw size={13} />} disabled={disabled} onClick={onRerun}>重新执行</Button>
          <Button size="small" icon={<X size={13} />} disabled={disabled} onClick={onClear}>清空结果</Button>
        </div>
      </div>
      {running && <Progress percent={Math.round((success + failed + skipped) / rows.length * 100)} showInfo={false} size="small" />}
      <div className="batch-output-list custom-scrollbar">{rows.map((row) => <article key={row.server.id} className="batch-output-card">
        <header>
          <div className="batch-output-identity">
            {row.status === "running" ? <LoaderCircle size={15} className="animate-spin" /> : row.status === "success" ? <Check size={15} style={{ color: "var(--success)" }} /> : row.status === "failed" ? <CircleAlert size={15} style={{ color: "var(--danger)" }} /> : <Clock3 size={15} />}
            <strong title={`${row.server.alias} (${row.server.hostname})`}>{row.server.alias}</strong>
            <span>{row.result ? `EXIT ${row.result.exitCode}` : { queued: "待执行", running: "执行中", success: "成功", failed: "失败", skipped: "已跳过" }[row.status]}</span>
          </div>
          <div className="batch-actions"><span>{row.result && `${row.result.durationMs}ms`}</span>
            <Button size="small" type="text" title="复制执行结果" aria-label={`复制 ${row.server.alias} 执行结果`} icon={<Copy size={13} />} disabled={row.status === "running" || row.status === "queued"} onClick={() => void copy(formatResult(row, command))} />
            {row.status === "failed" && <Button size="small" onClick={() => onRetry(row)} disabled={disabled} icon={<RotateCw size={13} />}>重试</Button>}
          </div>
        </header>
        <div className="batch-output-meta">{row.server.username}@{row.server.hostname}:{row.server.port} · 第 {row.attempts} 次执行</div>
        <pre className="batch-output-command">$ {command}</pre>
        <div className="batch-output-body custom-scrollbar"><pre>{row.error || row.result?.stdout || (row.status === "running" ? "正在等待远端响应…" : row.status === "skipped" ? "失败即停，未向此主机下发" : row.status === "queued" ? "等待下发命令…" : "（无标准输出）")}</pre>
          {row.result?.stderr && <pre className="batch-stderr">{row.result.stderr}</pre>}</div>
      </article>)}</div>
    </>}
  </section>;
}
