import { invoke } from "@tauri-apps/api/core";
import type {
  DeployRunRequest,
  DeployRunResult,
  DeployTarget,
  DeployTargetInput,
  DeploymentHistory,
} from "@/types";

export const deploymentApi = {
  listTargets: () => invoke<DeployTarget[]>("list_deploy_targets"),
  saveTarget: (input: DeployTargetInput) => invoke<DeployTarget>("save_deploy_target", { input }),
  deleteTarget: (id: string) => invoke<boolean>("delete_deploy_target", { id }),
  listHistory: (targetId?: string) => invoke<DeploymentHistory[]>("list_deployment_history", { targetId: targetId ?? null }),
  deployTarget: (request: DeployRunRequest) => invoke<DeployRunResult>("deploy_target", { request }),
  rollbackTarget: (request: DeployRunRequest) => invoke<DeployRunResult>("rollback_deploy_target", { request }),
};
