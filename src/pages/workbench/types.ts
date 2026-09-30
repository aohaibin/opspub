export type WorkbenchViewKey =
  | "overview"
  | "appstore"
  | "website"
  | "database"
  | "containers"
  | "file"
  | "backup"
  | "cron"
  | "system"
  | "terminal"
  | "logs"
  | "workspace"
  | "settings";

export interface WorkbenchNavItem {
  key: WorkbenchViewKey;
  label: string;
  badge?: number | string;
  iconName: string;
  group: "pinned" | "business" | "data" | "ops" | "other";
}

export interface ContainerItem {
  id: string;
  name: string;
  tag: string;
  image: string;
  status: "running" | "stopped" | "restarting";
  ports: string;
}

export interface WebsiteItem {
  id: string;
  domain: string;
  docRoot: string;
  status: "running" | "stopped";
  port: number;
  ssl: boolean;
  sslExpiry?: string;
  remark: string;
}

export interface DatabaseItem {
  id: string;
  name: string;
  type: "mysql" | "redis";
  charset?: string;
  engine?: string;
  size: string;
  backupCount: number;
  status: "normal" | "warning";
}

export interface BackupTaskItem {
  id: string;
  name?: string;
  targetType: "database" | "website" | "directory" | string;
  targetName: string;
  fileName: string;
  size: string;
  cron?: string;
  keepCount?: number;
  remoteStorage?: string;
  enabled?: boolean;
  completedAt: string;
  status: "success" | "running" | "failed";
}

export interface CronTaskItem {
  id: string;
  name: string;
  type: "shell" | "backup" | "clean";
  cronExpr: string;
  cycleDesc: string;
  enabled: boolean;
  lastRunAt: string;
  lastDuration: string;
  lastStatus: "success" | "failed";
}

export interface SystemServiceItem {
  name: string;
  desc: string;
  status: "active" | "inactive" | "failed";
  enabled: boolean;
  type: string;
}

export interface WorkspaceFileItem {
  id: string;
  name: string;
  size: string;
  mtime: string;
  category: "backups" | "logs" | "scripts" | "runs";
}

export interface AppStoreItem {
  id: string;
  name: string;
  desc: string;
  category: "basic" | "web" | "db" | "site" | "dev" | "monitor" | "ai" | "storage" | "mq";
  status: "installed" | "external" | "available";
  statusText?: string;
  version?: string;
  versions?: string[];
  port?: string;
  btnType: "reinstall" | "external" | "install";
  buttonText: string;
}
