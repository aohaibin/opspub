import type { CSSProperties, ReactNode } from "react";
import { Tooltip } from "antd";
import {
  Database,
  FolderSync,
  LayoutDashboard,
  Network,
  Monitor,
  Pencil,
  SquareTerminal,
  Trash2,
  Wifi,
} from "lucide-react";
import type { Server } from "@/types";

type ActionTone = "normal" | "success" | "info" | "danger";

function ActionIconButton({
  title,
  tone = "normal",
  disabled = false,
  onClick,
  children,
}: {
  title: string;
  tone?: ActionTone;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const hoverColor = {
    normal: "var(--text-primary)",
    success: "var(--success)",
    info: "var(--info)",
    danger: "var(--danger)",
  }[tone];

  return (
    <Tooltip title={title} placement="top">
      <button
        type="button"
        aria-label={title}
        disabled={disabled}
        onClick={onClick}
        className="ops-server-row-icon"
        style={{ "--server-action-hover": hoverColor } as CSSProperties}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function ConnectButton({ onClick, rdp = false }: { onClick: () => void; rdp?: boolean }) {
  return (
    <Tooltip title={rdp ? "打开系统远程桌面客户端" : "立即发起终端连接"} placement="top">
      <button type="button" onClick={onClick} className="ops-server-connect-button">
        {rdp ? <Monitor size={14} /> : <SquareTerminal size={14} />}
        <span>{rdp ? "远程桌面" : "连接"}</span>
      </button>
    </Tooltip>
  );
}

interface ServerRowActionsProps {
  server: Server;
  probing: boolean;
  onConnect: (server: Server) => void;
  onOpenSftp: (server: Server) => void;
  onOpenWorkbench: (server: Server) => void;
  onOpenRdp: (server: Server) => void;
  onProbe: (server: Server) => void;
  onOpenTunnel: (server: Server) => void;
  onOpenCredentials: (server: Server) => void;
  onEdit: (server: Server) => void;
  onDelete: (server: Server) => void;
}

/** 原型操作列使用纯图标，文案通过悬停提示呈现，避免挤压服务器字段。 */
export function ServerRowActions({
  server,
  probing,
  onConnect,
  onOpenSftp,
  onOpenWorkbench,
  onOpenRdp,
  onProbe,
  onOpenTunnel,
  onOpenCredentials,
  onEdit,
  onDelete,
}: ServerRowActionsProps) {
  return (
    <div className="flex items-center justify-end flex-nowrap gap-1">
      <ConnectButton rdp={server.protocol === "rdp"} onClick={() => onConnect(server)} />
      {server.protocol !== "rdp" && server.connection_options?.rdpEnabled && <ActionIconButton title="远程桌面" tone="info" onClick={() => onOpenRdp(server)}><Monitor size={14} /></ActionIconButton>}
      <ActionIconButton title="在 SFTP 中打开" disabled={server.protocol === "rdp"} tone="success" onClick={() => onOpenSftp(server)}>
        <FolderSync size={14} />
      </ActionIconButton>
      <ActionIconButton title="打开工作台" disabled={server.protocol === "rdp"} onClick={() => onOpenWorkbench(server)}>
        <LayoutDashboard size={14} />
      </ActionIconButton>
      <ActionIconButton
        title={probing ? "正在测试连接" : "连接测试"}
        tone="success"
        disabled={probing}
        onClick={() => onProbe(server)}
      >
        <Wifi size={14} className={probing ? "animate-pulse" : undefined} />
      </ActionIconButton>
      <ActionIconButton title="隧道" disabled={server.protocol === "rdp"} tone="info" onClick={() => onOpenTunnel(server)}>
        <Network size={14} />
      </ActionIconButton>
      <ActionIconButton title="服务凭证" tone="success" onClick={() => onOpenCredentials(server)}>
        <Database size={14} />
      </ActionIconButton>
      <ActionIconButton title="编辑" onClick={() => onEdit(server)}>
        <Pencil size={14} />
      </ActionIconButton>
      <ActionIconButton title="删除" tone="danger" onClick={() => onDelete(server)}>
        <Trash2 size={14} />
      </ActionIconButton>
    </div>
  );
}
