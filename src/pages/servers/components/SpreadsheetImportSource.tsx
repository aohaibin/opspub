import { Button } from "antd";
import { Download, FileSpreadsheet, RotateCw, ShieldCheck } from "lucide-react";

interface Props {
  path?: string;
  busy: boolean;
  downloading: boolean;
  onChoose: () => void;
  onReload: () => void;
  onDownload: () => void;
}

/** 将填写说明与文件操作分开，预览出现后仍能清楚找到重新选择和模板入口。 */
export function SpreadsheetImportSource({ path, busy, downloading, onChoose, onReload, onDownload }: Props) {
  return <div className="flex flex-col gap-4">
    <div className="rounded-xl p-4" style={{ background: "var(--bg-primary)", border: "1px dashed var(--border)" }}>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg" style={{ background: "color-mix(in srgb, var(--success) 12%, transparent)", color: "var(--success)" }}><FileSpreadsheet size={23} /></div>
        <div className="min-w-0 flex-1">
          <div className="font-medium" style={{ color: "var(--text-primary)" }}>{path ? "已选择服务器清单" : "选择服务器清单"}</div>
          <div className="mt-1 break-all text-[13px]" style={{ color: "var(--text-secondary)" }}>{path || "支持 .xlsx / .csv，单个文件不超过 20 MB，最多 5000 台。"}</div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button icon={<FileSpreadsheet size={15} />} disabled={busy} onClick={onChoose}>{path ? "重新选择文件" : "选择表格文件"}</Button>
        {path && <Button icon={<RotateCw size={14} />} disabled={busy} onClick={onReload}>重新解析</Button>}
        <Button icon={<Download size={14} />} disabled={busy} loading={downloading} onClick={onDownload}>下载模板</Button>
      </div>
    </div>
    <div className="flex flex-col gap-2 text-[13px]" style={{ color: "var(--text-secondary)" }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium" style={{ color: "var(--text-primary)" }}>必填字段</span>
        <span>主机、用户名</span>
        <span style={{ color: "var(--text-muted)" }}>支持中文或英文表头</span>
      </div>
      <div><span className="mr-3 font-medium" style={{ color: "var(--text-primary)" }}>可选字段</span>别名、端口、密码、分组、标签、类型</div>
      <div>分组用 <code>/</code> 分级，标签用 <code>;</code> 分隔。模板包含填写批注及类型、分组下拉选项。</div>
      <div className="flex items-start gap-2">
        <ShieldCheck size={16} className="mt-0.5 shrink-0" style={{ color: "var(--success)" }} />
        <span>密码可留空，导入后补充凭据；已填写的密码仅存入本机系统凭据管理器，预览不显示明文。</span>
      </div>
    </div>
  </div>;
}
