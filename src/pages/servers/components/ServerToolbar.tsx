import { useState } from "react";
import { Badge, Checkbox, Dropdown, Input, Popover, type MenuProps } from "antd";
import { ChevronDown, Filter, Search } from "lucide-react";
import type { AIPolicy, OsType } from "@/types";
import { AI_POLICY_ORDER, POLICY_STYLES } from "../lib/serverMeta";

export type OsFilter = "all" | OsType;
export type StatusFilter = "all" | "online" | "offline";
export type PolicyFilter = "all" | AIPolicy;

const OS_TABS: { key: OsFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "linux", label: "Linux" },
  { key: "windows", label: "Windows" },
];

interface ServerToolbarProps {
  keyword: string;
  onKeywordChange: (value: string) => void;
  osFilter: OsFilter;
  onOsFilterChange: (value: OsFilter) => void;
  /** 保留这些回调以兼容页面的状态过滤逻辑，原型不再显示对应控件。 */
  statusFilter?: StatusFilter;
  onStatusFilterChange?: (value: StatusFilter) => void;
  policyFilter?: PolicyFilter;
  onPolicyFilterChange?: (value: PolicyFilter) => void;
  osCounts: Record<OsFilter, number>;
  tagStats: { tag: string; count: number }[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onResetTags: () => void;
}

export function ServerToolbar({
  keyword,
  onKeywordChange,
  osFilter,
  onOsFilterChange,
  statusFilter = "all",
  onStatusFilterChange,
  policyFilter = "all",
  onPolicyFilterChange,
  osCounts,
  tagStats,
  selectedTags,
  onToggleTag,
  onResetTags,
}: ServerToolbarProps) {
  const [tagPanelOpen, setTagPanelOpen] = useState(false);

  const statusItems: MenuProps["items"] = [
    { key: "all", label: "全部状态", icon: <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />, onClick: () => onStatusFilterChange?.("all") },
    { key: "online", label: "在线", icon: <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />, onClick: () => onStatusFilterChange?.("online") },
    { key: "offline", label: "离线", icon: <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />, onClick: () => onStatusFilterChange?.("offline") },
  ];

  const policyItems: MenuProps["items"] = [
    { key: "all", label: "全部策略", icon: <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />, onClick: () => onPolicyFilterChange?.("all") },
    ...AI_POLICY_ORDER.map((policy) => ({
      key: policy,
      label: POLICY_STYLES[policy].label,
      icon: <span className="h-1.5 w-1.5 rounded-full" style={{ background: POLICY_STYLES[policy].dot }} />,
      onClick: () => onPolicyFilterChange?.(policy),
    })),
  ];

  const selectedStatusLabel = statusFilter === "online" ? "在线" : statusFilter === "offline" ? "离线" : "全部状态";
  const selectedPolicyLabel = policyFilter && policyFilter !== "all"
    ? POLICY_STYLES[policyFilter]?.label ?? "全部策略"
    : "全部策略";

  const filterButtonStyle = {
    background: "var(--surface-900)",
    border: "1px solid var(--border)",
    color: "var(--text-secondary)",
  };

  const tagPanel = (
    <div className="w-56 space-y-2">
      <div
        className="flex items-center justify-between pb-1.5"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <span className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
          选择过滤标签
        </span>
        <button
          type="button"
          onClick={onResetTags}
          className="text-[10px]"
          style={{ color: "var(--accent-hover)" }}
        >
          重置
        </button>
      </div>

      {tagStats.length === 0 ? (
        <p className="text-[11px] py-2" style={{ color: "var(--text-muted)" }}>
          还没有任何标签，可在编辑服务器时添加
        </p>
      ) : (
        <div className="max-h-48 overflow-y-auto space-y-1 custom-scrollbar">
          {tagStats.map(({ tag, count }) => (
            <label
              key={tag}
              className="flex items-center justify-between gap-2 px-1 py-0.5 rounded cursor-pointer text-xs"
              style={{ color: "var(--text-primary)" }}
            >
              <span className="flex items-center gap-2 min-w-0">
                <Checkbox checked={selectedTags.includes(tag)} onChange={() => onToggleTag(tag)} />
                <span className="truncate">{tag}</span>
              </span>
              <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
                {count}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div
      className="px-3 py-3 flex flex-wrap items-center justify-between gap-3"
      style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" }}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <Input
          allowClear
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder="搜索别名 / 主机 / 标签 / 用户..."
          prefix={<Search size={13} style={{ color: "var(--text-muted)" }} />}
          className="min-w-[220px] max-w-xl flex-1"
          style={{ height: 32 }}
        />

        <Dropdown menu={{ items: statusItems }} trigger={["click"]}>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-2 rounded-xl px-3 text-xs transition hover:border-slate-500"
            style={filterButtonStyle}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusFilter === "online" ? "bg-emerald-400" : statusFilter === "offline" ? "bg-slate-500" : "bg-slate-400"}`} />
            <span>{selectedStatusLabel}</span>
            <ChevronDown size={12} style={{ color: "var(--text-muted)" }} />
          </button>
        </Dropdown>

        <Dropdown menu={{ items: policyItems }} trigger={["click"]}>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-2 rounded-xl px-3 text-xs transition hover:border-slate-500"
            style={filterButtonStyle}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: policyFilter && policyFilter !== "all" ? POLICY_STYLES[policyFilter]?.dot : "#94a3b8" }}
            />
            <span>{selectedPolicyLabel}</span>
            <ChevronDown size={12} style={{ color: "var(--text-muted)" }} />
          </button>
        </Dropdown>
      </div>

      <div className="flex items-center gap-1.5">
        {OS_TABS.map(({ key, label }) => {
          const active = osFilter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onOsFilterChange(key)}
              className="px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer flex items-center gap-1"
              style={{
                background: active ? "rgba(99, 102, 241, 0.2)" : "var(--bg-tertiary)",
                color: active ? "var(--accent-hover)" : "var(--text-secondary)",
                border: active ? "1px solid rgba(99, 102, 241, 0.5)" : "1px solid var(--border)",
                fontWeight: active ? 500 : 400,
                boxShadow: active ? "0 0 8px rgba(99, 102, 241, 0.25)" : "none",
              }}
            >
              <span>{label}</span>
              <span
                className="text-[10px] font-mono px-1 py-0.2 rounded-full"
                style={{ background: active ? "rgba(99, 102, 241, 0.3)" : "rgba(0,0,0,0.15)" }}
              >
                {osCounts[key]}
              </span>
            </button>
          );
        })}

        <Popover
          content={tagPanel}
          trigger="click"
          open={tagPanelOpen}
          onOpenChange={setTagPanelOpen}
          placement="bottomRight"
        >
          <button
            type="button"
            className="px-2.5 py-1 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            style={{
              background: selectedTags.length > 0 ? "rgba(99, 102, 241, 0.15)" : "var(--bg-tertiary)",
              color: selectedTags.length > 0 ? "var(--accent-hover)" : "var(--text-secondary)",
              border: selectedTags.length > 0 ? "1px solid rgba(99, 102, 241, 0.4)" : "1px solid var(--border)",
            }}
          >
            <Filter size={11} className="opacity-70" />
            <span>标签筛选</span>
            {selectedTags.length > 0 && <Badge count={selectedTags.length} size="small" style={{ backgroundColor: "var(--accent)" }} />}
            <ChevronDown size={11} />
          </button>
        </Popover>
      </div>
    </div>
  );
}
