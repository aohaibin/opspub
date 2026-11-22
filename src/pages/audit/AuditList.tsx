import { Button, Checkbox, Empty, Input, Select, Table } from "antd";
import type { TableColumnsType } from "antd";
import { Clipboard, FileSearch, Search } from "lucide-react";
import { AuditVerdict } from "./AuditDetail";
import { EMPTY_FILTERS, SOURCE_LABELS, VERDICTS, type AuditRow } from "./audit";

const sourceOptions = Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label }));
const verdictOptions = Object.entries(VERDICTS).map(([value, { label }]) => ({ value, label }));

function optionsOf(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort().map((value) => ({ value, label: value }));
}

interface AuditFiltersProps {
  rows: AuditRow[];
  serverAliases: string[];
  value: typeof EMPTY_FILTERS;
  onChange: (value: typeof EMPTY_FILTERS) => void;
}

export function AuditFilters({ rows, serverAliases, value, onChange }: AuditFiltersProps) {
  const set = <K extends keyof typeof EMPTY_FILTERS>(key: K, next: (typeof EMPTY_FILTERS)[K]) =>
    onChange({ ...value, [key]: next });
  return <section className="audit-filters" aria-label="筛选当前页">
    <Select size="small" aria-label="工具" allowClear showSearch={{ optionFilterProp: "label" }}
      value={value.tool || undefined} onChange={(next) => set("tool", next ?? "")} placeholder="全部工具"
      options={optionsOf([value.tool, ...rows.map((row) => row.tool)])} />
    <Select size="small" aria-label="裁决" allowClear value={value.verdict || undefined}
      onChange={(next) => set("verdict", next ?? "")} placeholder="全部裁决" options={verdictOptions} />
    <Select size="small" aria-label="来源" allowClear value={value.source || undefined}
      onChange={(next) => set("source", next ?? "")} placeholder="全部来源" options={sourceOptions} />
    <Select size="small" aria-label="服务器" allowClear showSearch={{ optionFilterProp: "label" }}
      value={value.server || undefined} onChange={(next) => set("server", next ?? "")} placeholder="全部服务器"
      options={optionsOf([value.server, ...serverAliases, ...rows.map((row) => row.server)])} />
    <div className="audit-dates">
      <input aria-label="起始日期" type="date" max={value.end || undefined} value={value.start} onChange={(event) => set("start", event.target.value)} />
      <span aria-hidden>至</span>
      <input aria-label="结束日期" type="date" min={value.start || undefined} value={value.end} onChange={(event) => set("end", event.target.value)} />
    </div>
    <Input className="audit-search" size="small" aria-label="搜索审计记录" allowClear value={value.search}
      onChange={(event) => set("search", event.target.value)} prefix={<Search size={14} />}
      placeholder="搜索命令、结果、服务器或记录 ID" />
    <Checkbox checked={value.collapse} onChange={(event) => set("collapse", event.target.checked)}>折叠重复</Checkbox>
    <Button size="small" type="text" disabled={!Object.values(value).some(Boolean)} onClick={() => onChange(EMPTY_FILTERS)}>清空筛选</Button>
  </section>;
}

interface AuditTableProps {
  rows: AuditRow[];
  loading: boolean;
  emptyText: string;
  onDetail: (row: AuditRow) => void;
  onCopy: (row: AuditRow) => void;
  onExperience: (row: AuditRow) => void;
}

export function AuditTable({ rows, loading, emptyText, onDetail, onCopy, onExperience }: AuditTableProps) {
  const columns: TableColumnsType<AuditRow> = [
    { title: "时间", dataIndex: "createdAt", width: 146, render: (time: string) => <span className="audit-time">{time}</span> },
    { title: "来源", dataIndex: "source", width: 88, render: (source: AuditRow["source"]) => SOURCE_LABELS[source] },
    { title: "服务器", dataIndex: "server", width: 100, ellipsis: true, render: (server: string) => <span className="audit-server">{server || "—"}</span> },
    { title: "动作 / 命令", key: "command", ellipsis: { showTitle: false }, render: (_, row) => (
      <Button size="small" type="link" className="audit-command" aria-label={`查看记录 #${row.id}`} onClick={() => onDetail(row)}>
        {row.command || `记录 #${row.id}`}
      </Button>
    ) },
    { title: "结果", dataIndex: "result", width: 102, ellipsis: true, render: (result: string) => <code>{result || "—"}</code> },
    { title: "裁决", dataIndex: "verdict", width: 78, render: (verdict: AuditRow["verdict"]) => <AuditVerdict verdict={verdict} /> },
    { title: "快捷操作", key: "actions", width: 122, align: "right", render: (_, row) => <div className="audit-row-actions">
      <Button size="small" type="text" title="复制脱敏命令" icon={<Clipboard size={13} />} onClick={() => onCopy(row)}>复制</Button>
      <Button size="small" type="text" title="保存为经验" icon={<FileSearch size={13} />} onClick={() => onExperience(row)}>转经验</Button>
    </div> },
  ];

  return <Table<AuditRow> size="small" rowKey="id" columns={columns} dataSource={rows} loading={loading}
    pagination={false} scroll={{ x: 750 }}
    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} /> }} />;
}
