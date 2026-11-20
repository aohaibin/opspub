import type { CSSProperties, ReactNode } from "react";
import { Dropdown, Tooltip } from "antd";
import {
  Database,
  FolderSync,
  LayoutDashboard,
  Network,
  Monitor,
  MoreHorizontal,
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
  compact: boolean;
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
  compact,
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
  const isRdp = server.protocol === "rdp";
  const actions = [
    ...(isRdp || !server.connection_options?.rdpEnabled ? [] : [{
      key: "rdp",
      title: "远程桌面",
      icon: <Monitor size={14} />,
      tone: "info" as const,
      onClick: () => onOpenRdp(server),
    }]),
    { key: "sftp", title: "在 SFTP 中打开", icon: <FolderSync size={14} />, tone: "success" as const, disabled: isRdp, onClick: () => onOpenSftp(server) },
    { key: "workbench", title: "打开工作台", icon: <LayoutDashboard size={14} />, disabled: isRdp, onClick: () => onOpenWorkbench(server) },
    { key: "probe", title: probing ? "正在测试连接" : "连接测试", icon: <Wifi size={14} className={probing ? "animate-pulse" : undefined} />, tone: "success" as const, disabled: probing, onClick: () => onProbe(server) },
    { key: "tunnel", title: "隧道", icon: <Network size={14} />, tone: "info" as const, disabled: isRdp, onClick: () => onOpenTunnel(server) },
    { key: "credentials", title: "服务凭证", icon: <Database size={14} />, tone: "success" as const, onClick: () => onOpenCredentials(server) },
    { key: "edit", title: "编辑", icon: <Pencil size={14} />, onClick: () => onEdit(server) },
    { key: "delete", title: "删除", icon: <Trash2 size={14} />, tone: "danger" as const, onClick: () => onDelete(server) },
  ];
  return (
    <div className="ops-asset-row-actions">
      <ConnectButton rdp={isRdp} onClick={() => onConnect(server)} />
      {compact ? (
        <Dropdown
          placement="bottomRight"
          trigger={["click"]}
          menu={{
            items: actions.map(({ key, title, icon, tone, disabled, onClick }) => ({
              key, label: title, icon, danger: tone === "danger", disabled, onClick,
            })),
          }}
        >
          <button type="button" className="ops-server-row-icon" aria-label={`${server.alias}更多操作`} aria-haspopup="menu">
            <MoreHorizontal size={15} aria-hidden />
          </button>
        </Dropdown>
      ) : actions.map(({ key, icon, ...action }) => (
        <ActionIconButton key={key} {...action}>{icon}</ActionIconButton>
      ))}
    </div>
  );
}
