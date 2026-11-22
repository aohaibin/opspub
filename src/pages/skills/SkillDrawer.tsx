import { useState } from "react";
import { Button, Drawer, Input, Tabs, Tag } from "antd";
import { Code2, Eye, FileCode2, LockKeyhole, Pencil, Save } from "lucide-react";
import type { ChatSkill } from "@/lib/copilot-skills";

export const DEFAULT_SKILL_BODY = "## 操作步骤\n\n1. 先收集只读信息并确认影响范围。\n2. 根据结果给出可回滚的处理建议。\n3. 涉及变更时，说明审批和验证要求。\n\n## 注意事项\n\n- 不要把敏感信息写入输出。\n- 高危操作必须经过人工审批。";

export type SkillPanel = {
  mode: "detail" | "edit" | "create";
  skill: ChatSkill;
};

function splitValues(value: string) {
  return [...new Set(value.split(/[,，]/).map((item) => item.trim()).filter(Boolean))];
}

export function skillHeader(skill: ChatSkill) {
  // JSON 引号兼容 YAML 标量，可保留描述中的冒号、引号和换行。
  const fields = [
    "---",
    `name: ${JSON.stringify(skill.name)}`,
    `description: ${JSON.stringify(skill.description)}`,
    `triggers: ${JSON.stringify(skill.triggers)}`,
  ];
  if (skill.dangerous.length) {
    fields.push("dangerous_commands:", ...skill.dangerous.map((command) => `  - ${JSON.stringify(command)}`));
  }
  return [...fields, "---", "", `# ${skill.name}`].join("\n");
}

function SkillDetails({ skill, preview = false }: { skill: ChatSkill; preview?: boolean }) {
  return (
    <div className="grid gap-4 [overflow-wrap:anywhere]">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-3 m-0">
        <dt className="text-[var(--text-secondary)]">描述</dt>
        <dd className="m-0">{skill.description || "尚未填写"}</dd>
        <dt className="text-[var(--text-secondary)]">触发词</dt>
        <dd className="m-0 flex flex-wrap gap-1.5">
          {skill.triggers.length ? [...new Set(skill.triggers)].map((trigger) => (
            <Tag className="m-0 max-w-full whitespace-normal" color="blue" key={trigger}>{trigger}</Tag>
          )) : "尚未填写"}
        </dd>
        <dt className="text-[var(--text-secondary)]">危险命令</dt>
        <dd className="m-0 font-mono">
          {skill.dangerous.length ? skill.dangerous.join(" · ") : skill.source === "builtin" && !skill.content ? "索引未提供" : "无"}
        </dd>
      </dl>
      <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-4">
        <h3 className="m-0 text-sm font-semibold">{preview ? "正文预览" : "技能正文"}</h3>
        <pre className="m-0 mt-3 whitespace-pre-wrap text-xs leading-relaxed text-[var(--text-secondary)]">
          {skill.content || (skill.source === "builtin" ? "索引未提供技能正文" : "暂无正文内容")}
        </pre>
      </section>
    </div>
  );
}

function SkillEditor({ initial, saving, onSave }: {
  initial: ChatSkill;
  saving: boolean;
  onSave: (skill: ChatSkill) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  // 保留输入原文，避免键入分隔符后立即被 trim 移除。
  const [triggerText, setTriggerText] = useState(initial.triggers.join(", "));
  const [dangerousText, setDangerousText] = useState(initial.dangerous.join(", "));
  const [content, setContent] = useState(initial.content);
  const draft = {
    ...initial,
    name: name.trim(),
    description: description.trim(),
    triggers: splitValues(triggerText),
    dangerous: splitValues(dangerousText),
    content: content.trim() || DEFAULT_SKILL_BODY,
  };
  return (
    <form
      id="ops-skill-form"
      className="flex h-full min-h-0 flex-col"
      onSubmit={(event) => { event.preventDefault(); if (!saving) onSave(draft); }}
    >
      <Tabs
        className="flex min-h-0 flex-1 [&_.ant-tabs-content]:h-full [&_.ant-tabs-content-holder]:min-h-0 [&_.ant-tabs-tabpane]:h-full"
        tabBarStyle={{ margin: 0, paddingInline: 20 }}
        items={[
          {
            key: "edit",
            label: "编辑",
            icon: <Code2 size={15} />,
            children: (
              <div className="custom-scrollbar h-full overflow-y-auto p-5">
                <fieldset className="m-0 grid min-w-0 gap-4 border-0 p-0" disabled={saving}>
                  <label className="block text-sm">技能名称 <span className="text-[var(--danger)]">*</span>
                    <Input className="mt-1.5" value={name} aria-required="true" maxLength={64}
                      onChange={(event) => setName(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                      placeholder="例如：redis-cluster-check" />
                  </label>
                  <label className="block text-sm">一句话描述 <span className="text-[var(--danger)]">*</span>
                    <Input className="mt-1.5" value={description} aria-required="true" placeholder="技能解决什么问题"
                      onChange={(event) => setDescription(event.target.value)} />
                  </label>
                  <label className="block text-sm">触发词（逗号分隔） <span className="text-[var(--danger)]">*</span>
                    <Input className="mt-1.5" value={triggerText} aria-required="true" placeholder="redis, cluster, 集群"
                      onChange={(event) => setTriggerText(event.target.value)} />
                  </label>
                  <label className="block text-sm">危险命令（逗号分隔，可选）
                    <Input className="mt-1.5" value={dangerousText} placeholder="例如：重启服务"
                      onChange={(event) => setDangerousText(event.target.value)} />
                  </label>
                  <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-2 font-medium"><FileCode2 size={15} />Frontmatter 与标题</span>
                      <span className="inline-flex items-center gap-1 text-[var(--text-secondary)]"><LockKeyhole size={13} />由表单生成</span>
                    </div>
                    <pre className="m-0 mt-3 whitespace-pre-wrap text-xs text-[var(--text-secondary)] [overflow-wrap:anywhere]">
                      {skillHeader(draft)}
                    </pre>
                  </section>
                  <label className="block text-sm">正文内容（Markdown）
                    <Input.TextArea className="mt-1.5 font-mono" rows={12} value={content} spellCheck={false}
                      onChange={(event) => setContent(event.target.value)} />
                  </label>
                </fieldset>
              </div>
            ),
          },
          {
            key: "preview",
            label: "预览",
            icon: <Eye size={15} />,
            children: <div className="custom-scrollbar h-full overflow-y-auto p-5"><SkillDetails skill={draft} preview /></div>,
          },
        ]}
      />
    </form>
  );
}

export function SkillDrawer({ panel, saving, onClose, onEdit, onSave }: {
  panel: SkillPanel | null;
  saving: boolean;
  onClose: () => void;
  onEdit: (skill: ChatSkill) => void;
  onSave: (skill: ChatSkill) => void;
}) {
  const detail = panel?.mode === "detail";
  const skill = panel?.skill;
  return (
    <Drawer
      open={!!panel}
      placement="right"
      size="min(760px, 100vw)"
      title={skill && (
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 font-mono [overflow-wrap:anywhere]">{panel.mode === "create" ? "新建技能" : skill.name}</span>
          <Tag className="m-0 shrink-0" color={skill.source === "user" ? "green" : "default"}>
            {skill.source === "user" ? "用户" : "内置"}
          </Tag>
        </div>
      )}
      extra={skill && (detail
        ? skill.source === "user" && (
          <Button key="edit" icon={<Pencil size={14} />} onClick={(event) => {
            // 当前点击结束前会切换到提交按钮，取消本次点击的默认动作。
            event.preventDefault();
            onEdit(skill);
          }}>编辑技能</Button>
        )
        : <Button key="save" type="primary" htmlType="submit" form="ops-skill-form" icon={<Save size={15} />} loading={saving}>保存</Button>)}
      mask={{ closable: detail }}
      keyboard={!saving}
      closable={{ disabled: saving }}
      onClose={onClose}
      destroyOnHidden
      styles={{ body: { padding: 0, overflow: "hidden" } }}
    >
      {skill && (detail
        ? <div className="custom-scrollbar h-full overflow-y-auto p-5"><SkillDetails skill={skill} /></div>
        : <SkillEditor key={skill.id} initial={skill} saving={saving} onSave={onSave} />)}
    </Drawer>
  );
}
