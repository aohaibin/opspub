import { invoke } from "@tauri-apps/api/core";
import type {
  DeployRunRequest,
  DeployRunResult,
  DeployTarget,
  DeployTargetInput,
  DeploymentArtifact,
  DeploymentGroup,
  DeploymentGroupInput,
  DeploymentGroupRunResult,
  DeploymentHistory,
} from "@/types";

export const deploymentApi = {
  authorizeArtifactRoot: (path: string) => invoke<string>("authorize_deploy_artifact_root", { path }),
  listArtifactRoots: () => invoke<string[]>("list_deploy_artifact_roots"),
  registerArtifact: (path: string) => invoke<DeploymentArtifact>("register_deploy_artifact", { path }),
  listArtifacts: () => invoke<DeploymentArtifact[]>("list_deploy_artifacts"),
  revokeArtifact: (id: string) => invoke<boolean>("revoke_deploy_artifact", { id }),
  listTargets: () => invoke<DeployTarget[]>("list_deploy_targets"),
  saveTarget: (input: DeployTargetInput) => invoke<DeployTarget>("save_deploy_target", { input }),
  deleteTarget: (id: string) => invoke<boolean>("delete_deploy_target", { id }),
  listGroups: () => invoke<DeploymentGroup[]>("list_deployment_groups"),
  saveGroup: (input: DeploymentGroupInput) => invoke<DeploymentGroup>("save_deployment_group", { input }),
  deleteGroup: (id: string) => invoke<boolean>("delete_deployment_group", { id }),
  deployGroup: (groupId: string, canaryFirst = false) => invoke<DeploymentGroupRunResult>("deploy_group", { request: { groupId, canaryFirst } }),
  listHistory: (targetId?: string) => invoke<DeploymentHistory[]>("list_deployment_history", { targetId: targetId ?? null }),
  deployTarget: (request: DeployRunRequest) => invoke<DeployRunResult>("deploy_target", { request }),
  rollbackTarget: (request: DeployRunRequest) => invoke<DeployRunResult>("rollback_deploy_target", { request }),
};
