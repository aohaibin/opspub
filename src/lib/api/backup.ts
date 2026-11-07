import { invoke } from "./client";

export interface BackupStorageEndpoint {
  id: string;
  name: string;
  url: string;
  username: string;
  remoteDir: string;
  enabled: boolean;
}

export interface BackupStorageInput {
  id?: string;
  name: string;
  url: string;
  username: string;
  password: string;
  remoteDir: string;
  enabled: boolean;
}

export const backupApi = {
  exportWorkspace: (path: string, passphrase: string) =>
    invoke<void>("export_workspace_backup", { path, passphrase }),
  restoreWorkspace: (path: string, passphrase: string) =>
    invoke<void>("restore_workspace_backup", { path, passphrase }),
  listStorage: () => invoke<BackupStorageEndpoint[]>("list_backup_storage"),
  saveStorage: (input: BackupStorageInput) =>
    invoke<BackupStorageEndpoint>("save_backup_storage", { input }),
  deleteStorage: (id: string) => invoke<void>("delete_backup_storage", { id }),
  testStorage: (input: BackupStorageInput) => invoke<void>("test_backup_storage", { input }),
  pushBackup: (endpointId: string, localPath: string) =>
    invoke<string>("push_backup_to_storage", { endpointId, localPath }),
  pullBackup: (endpointId: string, filename: string, localPath: string) =>
    invoke<void>("pull_backup_from_storage", { endpointId, filename, localPath }),
};
