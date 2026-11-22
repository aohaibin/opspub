import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { create } from "zustand";
import { getErrorMessage } from "@/lib/api/client";
import { deploymentApi } from "@/lib/api/deployment";
import type { DeployRunResult, DeploymentProgress } from "@/types";

type RunTarget = { id: string; name: string };

export type RunRequest =
  | { action: "deploy" | "rollback"; name: string; targets: [RunTarget] }
  | { action: "group"; id: string; name: string; targets: RunTarget[]; canaryFirst: boolean };

export interface DeploymentRun {
  runId: string;
  request: RunRequest;
  status: "running" | "success" | "failed";
  progress: DeploymentProgress[];
  progressError?: string;
  results: DeployRunResult[];
  elapsedMs?: number;
  error?: string;
  canaryTargetId?: string;
  stoppedAfterCanaryFailure?: boolean;
}

// 执行和事件监听共用生命周期，切换工作区时仍可回到同一条任务。
export const useDeploymentRun = create<{ run: DeploymentRun | null }>(() => ({ run: null }));

export async function startDeploymentRun(request: RunRequest) {
  const { getState, setState } = useDeploymentRun;
  if (getState().run?.status === "running") return;
  const runId = crypto.randomUUID();
  setState({ run: { runId, request, status: "running", results: [], progress: [] } });
  const update = (patch: Partial<DeploymentRun>) => {
    const { run } = getState();
    if (run?.runId === runId && run.status === "running") setState({ run: { ...run, ...patch } });
  };
  const targetIds = new Set(request.targets.map(({ id }) => id));
  const belongsToRun = (item: { runId: string; targetId: string }) =>
    item.runId === runId && targetIds.has(item.targetId);

  let unlisten: UnlistenFn | undefined;
  try {
    unlisten = await listen<DeploymentProgress>("deployment-progress", ({ payload }) => {
      const { run } = getState();
      if (run && belongsToRun(payload)) update({ progress: [...run.progress, payload] });
    });
  } catch (error) {
    update({ progressError: getErrorMessage(error) });
  }

  const started = performance.now();
  try {
    if (request.action === "group") {
      const result = await deploymentApi.deployGroup(request.id, request.canaryFirst, runId);
      if (result.runId !== runId || result.groupId !== request.id
        || result.results.some(({ history }) => !belongsToRun(history))
        || (result.canaryTargetId != null && !targetIds.has(result.canaryTargetId))) {
        throw new Error("部署组返回的执行标识或目标与本次请求不匹配");
      }
      update({
        status: result.success && result.results.length > 0 ? "success" : "failed",
        results: result.results,
        canaryTargetId: result.canaryTargetId,
        stoppedAfterCanaryFailure: result.stoppedAfterCanaryFailure,
        elapsedMs: Math.round(performance.now() - started),
      });
    } else {
      const params = { targetId: request.targets[0].id, runId };
      const result = request.action === "deploy"
        ? await deploymentApi.deployTarget(params)
        : await deploymentApi.rollbackTarget(params);
      if (!belongsToRun(result.history)) {
        throw new Error("部署服务返回的执行标识或目标与本次请求不匹配");
      }
      update({
        status: result.exitCode === 0 && result.history.verificationStatus !== "failed" ? "success" : "failed",
        results: [result],
        elapsedMs: Math.round(performance.now() - started),
      });
    }
  } catch (error) {
    update({
      status: "failed",
      error: getErrorMessage(error),
      elapsedMs: Math.round(performance.now() - started),
    });
  } finally {
    unlisten?.();
  }
}
