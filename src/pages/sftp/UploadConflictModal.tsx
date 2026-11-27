import { useState } from "react";
import { Button, Checkbox, Modal, Radio } from "antd";
import { FileText, FileWarning, Folder } from "lucide-react";
import type { SftpConflictPolicy } from "@/store/settings";

export type UploadConflictAction = Exclude<SftpConflictPolicy, "ask">;

export interface UploadConflict {
  index: number;
  name: string;
  isDir: boolean;
  localDetails: string;
  remoteDetails?: string;
  canOverwrite: boolean;
}

const ACTIONS = [
  { label: "覆盖", value: "overwrite" },
  { label: "重命名", value: "rename" },
  { label: "跳过", value: "skip" },
] as const;

export function UploadConflictModal({ serverName, remoteDir, conflicts, otherCount, onCancel, onConfirm }: {
  serverName: string;
  remoteDir: string;
  conflicts: UploadConflict[];
  otherCount: number;
  onCancel: () => void;
  onConfirm: (choices: Map<number, UploadConflictAction>, remember: boolean) => void;
}) {
  const [choices, setChoices] = useState(new Map<number, UploadConflictAction>());
  const [remember, setRemember] = useState(false);
  const multiple = conflicts.length > 1;
  const canOverwrite = conflicts.some((conflict) => conflict.canOverwrite);
  const batchChoices = (action: UploadConflictAction) => new Map(conflicts.map(({ index, canOverwrite }) => [
    index, action === "overwrite" && !canOverwrite ? "skip" : action,
  ]));
  const selected = conflicts.map(({ index }) => choices.get(index) ?? "skip");
  const canRemember = !multiple || selected.every((action) => action === selected[0]);

  return (
    <Modal
      open
      centered
      width={560}
      maskClosable={false}
      styles={{
        mask: { backdropFilter: "blur(4px)" },
        container: { padding: 0, background: "var(--surface-900)", border: "1px solid var(--border)", borderRadius: 16 },
        header: { background: "transparent", marginBottom: 0 },
        footer: { marginTop: 0 },
      }}
      title={
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4 pr-12">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] text-[var(--warning)]">
            <FileWarning size={16} />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-bold text-[var(--text-primary)]">发现 {conflicts.length} 项同名文件冲突</div>
            <div className="break-all font-mono text-xs font-normal text-[var(--text-secondary)]">目标目录：{remoteDir} · {serverName}</div>
          </div>
        </div>
      }
      onCancel={onCancel}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-5 py-3">
          <Button onClick={multiple || otherCount > 0 ? onCancel : () => onConfirm(batchChoices("skip"), remember)}>
            {multiple || otherCount > 0 ? "取消本次上传" : "取消同名上传"}
          </Button>
          <div className="flex flex-wrap gap-2">
            {multiple ? <>
              {otherCount > 0 && <Button onClick={() => onConfirm(batchChoices("skip"), false)}>跳过同名</Button>}
              <Button type="primary" onClick={() => onConfirm(new Map(conflicts.map(({ index }) => [index, choices.get(index) ?? "skip"])), canRemember && remember)}>
                确认按以上选择处理
              </Button>
            </> : <>
              {otherCount > 0 && <Button onClick={() => onConfirm(batchChoices("skip"), remember)}>跳过同名</Button>}
              <Button onClick={() => onConfirm(batchChoices("rename"), remember)}>重命名保留</Button>
              <Button type="primary" disabled={!canOverwrite} onClick={() => onConfirm(batchChoices("overwrite"), remember)}>覆盖替换</Button>
            </>}
          </div>
        </div>
      }
    >
      <div className="flex max-h-[min(60vh,420px)] flex-col gap-3 overflow-auto px-5 py-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-950)] px-3 py-2 text-xs text-[var(--text-primary)]">
          {otherCount > 0 ? `有 ${otherCount} 项可直接上传。` : ""}请选择如何处理以下同名项目。
        </div>
        {multiple && <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-[var(--text-secondary)]">
            {selected.filter((action) => action === "overwrite").length} 项覆盖 · {selected.filter((action) => action === "rename").length} 项重命名 · {selected.filter((action) => action === "skip").length} 项跳过
          </span>
          <div className="flex flex-wrap gap-1">
            {ACTIONS.map(({ label, value }) => <Button key={value} size="small" disabled={value === "overwrite" && !canOverwrite} onClick={() => setChoices(batchChoices(value))}>全部{label}</Button>)}
          </div>
        </div>}
        <div className="max-h-60 space-y-2 overflow-y-auto">
          {conflicts.map((conflict) => {
            const Icon = conflict.isDir ? Folder : FileText;
            return (
              <div key={conflict.index} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-950)] px-3 py-2.5">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-900)] text-[var(--accent)]"><Icon size={14} /></span>
                  <div className="min-w-0">
                    <div className="break-all font-mono text-xs font-semibold text-[var(--text-primary)]">
                      {conflict.name}
                      <span className="ml-2 inline-block rounded border border-[var(--border)] px-1 font-sans font-normal text-[var(--accent)]">{conflict.isDir ? "同名目录" : "同名文件"}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-[var(--text-secondary)]">
                      <span>新传入：{conflict.localDetails}</span>
                      <span>{conflict.remoteDetails ?? "目标名称已被占用"}</span>
                    </div>
                    {!conflict.canOverwrite && <div className="mt-1 text-xs text-[var(--warning)]">请选择重命名保留或跳过</div>}
                  </div>
                </div>
                {multiple && <Radio.Group
                  aria-label={`${conflict.name} 的冲突处理方式`}
                  size="small"
                  optionType="button"
                  value={choices.get(conflict.index) ?? "skip"}
                  options={ACTIONS.map(({ label, value }) => ({ label, value, disabled: value === "overwrite" && !conflict.canOverwrite }))}
                  onChange={({ target }) => setChoices((previous) => new Map(previous).set(conflict.index, target.value as UploadConflictAction))}
                />}
              </div>
            );
          })}
        </div>
        <Checkbox checked={canRemember && remember} disabled={!canRemember} onChange={({ target }) => setRemember(target.checked)}>
          <span className="text-xs text-[var(--text-secondary)]">记住我的选择（同步至「设置 → SFTP → 同名文件冲突策略」）</span>
        </Checkbox>
      </div>
    </Modal>
  );
}
