import { Channel, invoke } from "@tauri-apps/api/core";
import type { SftpCredentials, SftpRemoteFile, SftpSessionInfo } from "@/pages/sftp/types";

type StageDropAction =
  | { action: "begin" | "release" }
  | { action: "directory"; path: string[] }
  | { action: "chunk"; path: string[]; offset: number; data: number[] };

export const sftpApi = {
  inspectLocalUpload: (path: string) =>
    invoke<Array<{ path: string[]; isDir: boolean; size: number }>>("sftp_inspect_local_upload", { path }),
  openDownloadFolder: () => invoke<void>("sftp_open_download_folder"),
  stageUploadDrop: (taskId: string, input: StageDropAction) =>
    invoke<void>("sftp_stage_upload_drop", { taskId, input }),

  uploadTransfer: (
    input: { taskId: string; request: SftpCredentials; remoteDir: string; fileName: string; localPath?: string; staged?: boolean; overwrite?: boolean },
    onProgress: (progress: { loaded: number; total: number }) => void,
  ) => {
    const channel = new Channel<{ loaded: number; total: number }>();
    channel.onmessage = onProgress;
    return invoke<SftpRemoteFile>("sftp_upload_transfer", { input, onProgress: channel });
  },

  downloadTransfer: (
    input: { taskId: string; request: SftpCredentials; remotePath: string; localDir: string },
    onProgress: (progress: { loaded: number; total: number }) => void,
  ) => {
    const channel = new Channel<{ loaded: number; total: number }>();
    channel.onmessage = onProgress;
    return invoke<void>("sftp_download_transfer", { input, onProgress: channel });
  },

  prepareDragDownload: (input: { taskId: string; request: SftpCredentials; remotePaths: string[] }) =>
    invoke<string[]>("sftp_prepare_drag_download", { input }),

  releaseDragDownload: (taskId: string) => invoke<void>("sftp_release_drag_download", { taskId }),

  cancelTransfer: (taskId: string) => invoke<void>("sftp_cancel_transfer", { taskId }),

  open: (request: SftpCredentials) =>
    invoke<SftpSessionInfo>("open_sftp_session", { request }),

  listSessions: () => invoke<SftpSessionInfo[]>("list_sftp_sessions"),

  close: (serverId: number) =>
    invoke<void>("close_sftp_session", { serverId }),

  closeAll: () => invoke<void>("close_all_sftp_sessions"),

  list: (request: SftpCredentials, path: string) =>
    invoke<SftpRemoteFile[]>("sftp_list", { request, path }),

  upload: (input: {
    request: SftpCredentials;
    remoteDir: string;
    fileName: string;
    content: number[];
  }) => invoke<SftpRemoteFile>("sftp_upload", { input }),

  download: (request: SftpCredentials, path: string) =>
    invoke<number[]>("sftp_download", { input: { request, path } }),

  mkdir: (request: SftpCredentials, path: string) =>
    invoke<void>("sftp_mkdir", { input: { request, path } }),

  rename: (request: SftpCredentials, sourcePath: string, targetPath: string) =>
    invoke<void>("sftp_rename", { input: { request, sourcePath, targetPath } }),

  copy: (request: SftpCredentials, sourcePath: string, targetPath: string) =>
    invoke<void>("sftp_copy", { input: { request, sourcePath, targetPath } }),

  chmod: (request: SftpCredentials, path: string, mode: number) =>
    invoke<void>("sftp_chmod", { input: { request, path, mode } }),

  delete: (request: SftpCredentials, path: string) =>
    invoke<void>("sftp_delete", { input: { request, path } }),

  archive: (request: SftpCredentials, sourcePath: string, archivePath: string) =>
    invoke<void>("sftp_archive", { input: { request, sourcePath, archivePath } }),
};
