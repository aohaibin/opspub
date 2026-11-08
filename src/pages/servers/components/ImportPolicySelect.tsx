import { Select } from "antd";
import type { AIPolicy } from "@/types";

interface PolicyOption {
  value: AIPolicy;
  label: string;
  color: string;
  description: string;
}

const OPTIONS: PolicyOption[] = [
  { value: "disabled", label: "禁用", color: "var(--text-muted)", description: "默认选项，导入后不允许 AI 操作" },
  { value: "readonly", label: "只读探测", color: "var(--info)", description: "允许查询服务器信息与状态" },
  { value: "approval", label: "人工审批", color: "var(--warning)", description: "AI 操作需要人工审批后执行" },
  { value: "trusted", label: "信任自主", color: "var(--success)", description: "允许自主操作，仍受全局安全规则约束" },
];

function PolicyLabel({ option }: { option: PolicyOption }) {
  return <span className="flex items-center gap-2" style={{ fontSize: 13, textAlign: "left" }}>
    <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: option.color }} />
    <span>{option.label}</span>
  </span>;
}

export function ImportPolicySelect({ value, disabled, onChange }: {
  value: AIPolicy;
  disabled: boolean;
  onChange: (value: AIPolicy) => void;
}) {
  return <Select<AIPolicy, PolicyOption>
    aria-label="导入后的 AI 档位"
    value={value}
    disabled={disabled}
    onChange={onChange}
    style={{ width: 148, flexShrink: 0, textAlign: "left" }}
    // Modal 的 footer 默认右对齐；选择项必须有自己的对齐规则。
    styles={{ content: { textAlign: "left" }, popup: { root: { padding: 6, borderRadius: 12 }, listItem: { padding: "9px 10px" } } }}
    popupMatchSelectWidth={280}
    options={OPTIONS}
    labelRender={({ value: selected }) => <PolicyLabel option={OPTIONS.find(option => option.value === selected) ?? OPTIONS[0]} />}
    optionRender={({ data }) => <div className="space-y-1 text-left">
      <PolicyLabel option={data} />
      <div className="pl-3.5 text-xs" style={{ color: "var(--text-secondary)" }}>{data.description}</div>
    </div>}
  />;
}
