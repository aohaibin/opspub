import { useEffect, useState } from "react";
import { Alert, Button, Empty, Modal, Space, Spin, Tag } from "antd";
import { History, TerminalSquare } from "lucide-react";
import { getErrorMessage } from "@/lib/api/client";
import { deploymentApi } from "@/lib/api/deployment";
import type { DeploymentHistory } from "@/types";
import type { DeploymentRun } from "./deploymentRun";

const verificationLabels: Record<string, string> = {
  passed: "通过",
  failed: "失败",
  not_configured: "未配置",
  pending: "待验证",
  not_run: "未执行",
};

const stageLabels: Record<string, string> = {
  preflight: "预检",
  deploy: "远端执行",
  verification: "健康检查",
  done: "完成",
  failed: "失败",
};

function ResultDetails({ item, stdout, stderr, exitCode, durationMs }: {
  item: DeploymentHistory;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  durationMs?: number;
}) {
  const output = stdout || item.output;
  const error = stderr || item.error;
  const verification = item.verificationStatus;
  const rollback = item.rollbackStatus;
  return (
    <article className="deployment-history-item">
      <header className="deployment-result-heading">
        <strong>{item.targetName}</strong>
        <span>{item.action === "rollback" ? "回滚" : "部署"} · {item.version}</span>
        <Tag color={item.status === "success" ? "success" : item.status === "failed" ? "error" : "default"}>
          {item.status === "success" ? "成功" : item.status === "failed" ? "失败" : item.status}
        </Tag>
        <time>{item.createdAt}</time>
      </header>
      <div className="deployment-result-meta">
        <Tag color={verification === "passed" ? "success" : verification === "failed" ? "error" : "default"}>
          健康检查 · {verificationLabels[verification] ?? "未验证"}
        </Tag>
        {item.action === "rollback" && (
          <Tag color={rollback === "succeeded" ? "success" : rollback === "failed" ? "error" : "default"}>
            回滚 · {rollback === "succeeded" ? "成功" : rollback === "failed" ? "失败" : "未确认"}
          </Tag>
        )}
        {exitCode !== undefined && <span>退出码 {exitCode}</span>}
        {durationMs !== undefined && <span>{durationMs} ms</span>}
      </div>
      {output && <pre aria-label="标准输出">{output}</pre>}
      {error && <pre className="deployment-console-error" aria-label="标准错误">{error}</pre>}
    </article>
  );
}

export function RunPanel({ run }: { run: DeploymentRun }) {
  const { request, status, results, progress } = run;
  const verb = request.action === "rollback" ? "回滚" : request.action === "group" ? "部署组" : "部署";
  const missing = request.targets.filter(({ id }) => !results.some(({ history }) => history.targetId === id));
  const canary = request.targets.find(({ id }) => id === run.canaryTargetId);

  return (
    <section id="deployment-current-run" tabIndex={-1} className="deployment-section deployment-run-panel" aria-label="本次执行">
      <div className="deployment-section-title">
        <TerminalSquare size={17} aria-hidden />
        <h2>{verb} · {request.name}</h2>
        <Tag color={status === "running" ? "processing" : status === "success" ? "success" : "error"}>
          {status === "running" ? "执行中" : status === "success" ? "成功" : "失败"}
        </Tag>
        {run.elapsedMs !== undefined && <span className="deployment-section-hint">总耗时 {run.elapsedMs} ms</span>}
      </div>
      {run.progressError && <Alert type="warning" showIcon message="进度事件不可用" description={run.progressError} />}
      {progress.length > 0 ? (
        <ol className="deployment-console" aria-label="执行日志">
          {progress.map((item, index) => (
            <li key={index}>
              <strong>{request.targets.find(({ id }) => id === item.targetId)?.name ?? item.targetId}</strong>
              {" · "}{stageLabels[item.stage] ?? item.stage}{" · "}{item.message}
            </li>
          ))}
        </ol>
      ) : status === "running" && <p role="status">正在等待部署服务返回进度。</p>}
      {run.error && <Alert type="error" showIcon message={run.error} />}
      {canary && <p>灰度首项 · {canary.name}</p>}
      {run.stoppedAfterCanaryFailure && <Alert type="error" showIcon message="灰度首项失败，已停止后续目标。" />}
      {status === "failed" && !run.error && results.length === 0 && <Alert type="error" showIcon message="部署服务未返回目标结果。" />}
      {status !== "running" && request.action === "group" && missing.length > 0 && (
        <p>{run.error ? "以下目标未收到本次结果，可查看发布历史" : "未执行目标"} · {missing.map(({ name }) => name).join("、")}</p>
      )}
      {results.length > 0 && (
        <div className="deployment-history-list">
          {results.map((result) => (
            <ResultDetails key={result.history.id} item={result.history} stdout={result.stdout} stderr={result.stderr}
              exitCode={result.exitCode} durationMs={result.durationMs} />
          ))}
        </div>
      )}
    </section>
  );
}

export function HistoryDialog({ target, onClose }: {
  target: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const targetId = target?.id;
  const [items, setItems] = useState<DeploymentHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setError("");
    void deploymentApi.listHistory(targetId).then((history) => {
      if (!disposed) setItems(history);
    }).catch((failure) => {
      if (!disposed) setError(getErrorMessage(failure));
    }).finally(() => {
      if (!disposed) setLoading(false);
    });
    return () => { disposed = true; };
  }, [targetId, revision]);

  return (
    <Modal className="deployment-modal" title={
      <Space><History size={16} aria-hidden />发布历史{target && ` · ${target.name}`}</Space>
    } open centered onCancel={onClose} footer={<Button onClick={onClose}>关闭</Button>} width={760}
      styles={{ body: { maxHeight: "calc(90vh - 150px)", overflowY: "auto" } }}>
      {loading ? <div className="deployment-loading"><Spin /></div>
        : error ? <Alert type="error" showIcon message={error}
          action={<Button onClick={() => setRevision((value) => value + 1)}>重试</Button>} />
        : items.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无发布记录" />
        : <div className="deployment-history-list">{items.map((item) => <ResultDetails key={item.id} item={item} />)}</div>}
    </Modal>
  );
}
