import { useState } from "react";
import { Button, Checkbox, Empty, Pagination, Spin } from "antd";
import { Eye } from "lucide-react";
import type { SensitiveEntry } from "@/types";
import { displayTime, SensitiveStatusTag, TYPE_LABELS } from "./SensitiveDetail";

const PAGE_SIZE = 25;
const HEADERS: [string, string][] = [
  ["时间", "w-[15%]"],
  ["服务器", "w-[13%]"],
  ["类型", "w-[10%]"],
  ["标签", "w-[15%]"],
  ["脱敏预览", "w-[14%]"],
  ["来源", "w-[15%]"],
  ["状态", "w-[10%]"],
  ["操作", "w-[8%]"],
];

interface Props {
  entries: SensitiveEntry[];
  total: number | undefined;
  loading: boolean;
  unavailable: boolean;
  selectionDisabled: boolean;
  selected: number[];
  onSelect: (ids: number[]) => void;
  onDetail: (id: number) => void;
}

export function SensitiveTable({ entries, total, loading, unavailable, selectionDisabled, selected, onSelect, onDetail }: Props) {
  const [page, setPage] = useState(1);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(entries.length / PAGE_SIZE)));
  const rows = entries.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const checked = new Set(selected);
  const allSelected = entries.length > 0 && selected.length === entries.length;
  return (
    <section className="ops-panel min-w-0 overflow-hidden" aria-label="敏感记录列表" aria-busy={loading}>
      <Spin spinning={loading}>
        {rows.length > 0 ? (
          <div className="custom-scrollbar max-h-[calc(100dvh-18rem)] min-h-40 overflow-auto">
            <table className="w-full min-w-[720px] table-fixed text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[var(--surface-950)] text-[var(--text-secondary)]">
                <tr>
                  <th scope="col" className="w-8 px-2 py-2.5">
                    <Checkbox
                      aria-label="全选当前筛选结果"
                      disabled={selectionDisabled}
                      checked={allSelected}
                      indeterminate={selected.length > 0 && !allSelected}
                      onChange={(event) => onSelect(event.target.checked ? entries.map((entry) => entry.id) : [])}
                    />
                  </th>
                  {HEADERS.map(([label, width]) => (
                    <th key={label} scope="col" className={`${width} whitespace-nowrap px-2 py-2.5 font-medium`}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <tr key={entry.id} className="border-t border-[var(--border)] hover:bg-[var(--bg-hover)]">
                    <td className="px-2 py-2">
                      <Checkbox
                        checked={checked.has(entry.id)}
                        disabled={selectionDisabled}
                        aria-label={`选择敏感记录 ${entry.id}`}
                        onChange={(event) => onSelect(event.target.checked ? [...selected, entry.id] : selected.filter((id) => id !== entry.id))}
                      />
                    </td>
                    <td className="px-2 py-2 tabular-nums text-[var(--text-secondary)]">{displayTime(entry.detectedAt)}</td>
                    <td className="px-2 py-2"><div className="truncate">{entry.serverAlias || "未关联服务器"}</div></td>
                    <td className="px-2 py-2"><div className="truncate">{TYPE_LABELS.get(entry.secretType) ?? entry.secretType}</div></td>
                    <th scope="row" className="px-2 py-2 font-medium"><div className="truncate">{entry.label}</div></th>
                    <td className="px-2 py-2"><code className="block truncate text-[var(--success)]">{entry.maskedValue}</code></td>
                    <td className="px-2 py-2 text-[var(--text-secondary)]"><div className="truncate">{entry.source}</div></td>
                    <td className="px-2 py-2"><SensitiveStatusTag status={entry.status} /></td>
                    <td className="px-2 py-2">
                      <Button type="text" size="small" aria-label={`查看敏感记录 ${entry.id}`} title="查看详情" icon={<Eye size={15} />} onClick={() => onDetail(entry.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid min-h-40 place-items-center">
            {!loading && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={unavailable ? "敏感记录暂不可用" : total ? "没有匹配的敏感记录" : "暂无敏感记录"} />}
          </div>
        )}
      </Spin>
      {total !== undefined && !unavailable && (
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-3 py-2 text-[var(--text-secondary)]">
          <span>{loading ? "正在读取记录…" : `筛选结果 ${entries.length} / ${total} 条 · 仅含脱敏元数据`}</span>
          {entries.length > PAGE_SIZE && <Pagination size="small" current={currentPage} total={entries.length} pageSize={PAGE_SIZE} showSizeChanger={false} onChange={setPage} />}
        </footer>
      )}
    </section>
  );
}
