export interface DeployTarget {
  id: string;
  name: string;
  serverId: number;
  recipe: string;
  remotePath: string;
  artifactPath: string;
  artifactId?: string;
  healthCommand: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeployTargetInput {
  id?: string;
  name: string;
  serverId: number;
  recipe: string;
  remotePath: string;
  artifactPath?: string;
  artifactId?: string;
  healthCommand?: string;
}

export interface DeploymentArtifact {
  id: string;
  name: string;
  path: string;
  size: number;
  sha256: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentGroup {
  id: string;
  name: string;
  description: string;
  stopOnFail: boolean;
  targetIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentGroupInput {
  id?: string;
  name: string;
  description?: string;
  stopOnFail?: boolean;
  targetIds: string[];
}

export interface DeploymentGroupRunResult {
  groupId: string;
  results: DeployRunResult[];
  success: boolean;
  canaryTargetId?: string;
  stoppedAfterCanaryFailure: boolean;
}

export interface DeployRunRequest {
  targetId: string;
  version?: string;
  timeoutSecs?: number;
}

export interface DeploymentHistory {
  id: string;
  targetId: string;
  targetName: string;
  version: string;
  action: string;
  status: string;
  verificationStatus: string;
  rollbackStatus: string;
  output: string;
  error: string;
  createdAt: string;
}

export interface DeployRunResult {
  history: DeploymentHistory;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface DeploymentProgress {
  targetId: string;
  stage: string;
  message: string;
  completed: boolean;
}

