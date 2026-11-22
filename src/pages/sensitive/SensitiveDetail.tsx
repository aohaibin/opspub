import { Button, Descriptions, Modal, Tag } from "antd";
import { Bookmark, ThumbsDown, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { SensitiveEntry, SensitiveStatus } from "@/types";

export const STATUS_LABELS: Record<SensitiveStatus, string> = {
  pending: "待处理",
  retained: "已保留",
  false_positive: "误判",
  discarded: "已丢弃",
};

const STATUS_COLORS = new Map([["pending", "gold"], ["retained", "green"], ["discarded", "red"]]);

export const TYPE_LABELS = new Map([
  ["credential", "凭据"],
  ["private_key", "私钥"],
  ["token", "Token"],
  ["ip", "公网 IP"],
]);

export function displayTime(value: string) {
  const parsed = new Date(value.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("zh-CN", { hour12: false });
}

export function SensitiveStatusTag({ status }: { status: string }) {
  return (
    <Tag color={STATUS_COLORS.get(status)} className="m-0 max-w-full truncate align-middle">
      {Object.prototype.hasOwnProperty.call(STATUS_LABELS, status) ? STATUS_LABELS[status as SensitiveStatus] : status}
    </Tag>
  );
}

interface Props {
  entry: SensitiveEntry | undefined;
  busy: boolean;
  canUpdate: boolean;
  feedback: ReactNode;
  onClose: () => void;
  onStatus: (id: number, status: SensitiveStatus) => void;
}

export function SensitiveDetail({ entry, busy, canUpdate, feedback, onClose, onStatus }: Props) {
  return (
    <Modal
      open={Boolean(entry)}
      title="敏感条目详情"
      width={580}
      destroyOnHidden
      maskClosable={false}
      closable={!busy}
      keyboard={!busy}
      onCancel={onClose}
      footer={entry && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button icon={<Bookmark size={14} />} disabled={!canUpdate || entry.status === "retained"} onClick={() => onStatus(entry.id, "retained")}>保留</Button>
          <Button icon={<ThumbsDown size={14} />} disabled={!canUpdate || entry.status === "false_positive"} onClick={() => onStatus(entry.id, "false_positive")}>标记误判</Button>
          <Button danger icon={<Trash2 size={14} />} disabled={!canUpdate || entry.status === "discarded"} onClick={() => onStatus(entry.id, "discarded")}>丢弃</Button>
          <Button type="primary" disabled={busy} onClick={onClose}>关闭</Button>
        </div>
      )}
    >
      {entry && (
        <div className="flex flex-col gap-3 [overflow-wrap:anywhere]" aria-busy={busy}>
          {feedback}
          <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
            <Descriptions.Item label="服务器">{entry.serverAlias || "未关联服务器"}</Descriptions.Item>
            <Descriptions.Item label="状态"><SensitiveStatusTag status={entry.status} /></Descriptions.Item>
            <Descriptions.Item label="检测时间">{displayTime(entry.detectedAt)}</Descriptions.Item>
            <Descriptions.Item label="更新时间">{displayTime(entry.updatedAt)}</Descriptions.Item>
            <Descriptions.Item label="类型">{TYPE_LABELS.get(entry.secretType) ?? entry.secretType}</Descriptions.Item>
            <Descriptions.Item label="命中次数">{entry.matchCount}</Descriptions.Item>
            <Descriptions.Item label="标签" span="filled">{entry.label}</Descriptions.Item>
            <Descriptions.Item label="脱敏预览" span="filled"><code>{entry.maskedValue}</code></Descriptions.Item>
            <Descriptions.Item label="来源" span="filled">{entry.source}</Descriptions.Item>
            <Descriptions.Item label="匹配指纹" span="filled"><code className="text-xs">{entry.valueHash}</code></Descriptions.Item>
          </Descriptions>
        </div>
      )}
    </Modal>
  );
}
