export interface DeployTarget {
  id: string;
  name: string;
  serverId: number;
  recipe: string;
  remotePath: string;
  artifactPath: string;
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
  healthCommand?: string;
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
