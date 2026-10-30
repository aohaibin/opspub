import { useMemo, useState } from "react";
import { Button, Input, Modal, Tag, message } from "antd";
import { BookOpen, CheckCircle2, Code2, FileText, Pencil, Plus, Search, Sparkles, Trash2, Workflow, X } from "lucide-react";
import skillsIndex from "../../../docs/skills-index-20261006.md?raw";

type SkillSource = "builtin" | "user";
type Skill = {
  id: string;
  name: string;
  source: SkillSource;
  description: string;
  triggers: string[];
  dangerous: string[];
  content: string;
  hits: number;
};

type Experience = { id: string; title: string; category: string; summary: string; steps: string[]; date: string };

function parseBuiltinSkills(index: string): Skill[] {
  const headings = [...index.matchAll(/^## (\d+)\. `([^`]+)`[^\r\n]*$/gm)];
  return headings.flatMap((heading, position) => {
    const number = Number(heading[1]);
    if (number < 1 || number > 41) return [];

    const start = heading.index! + heading[0].length;
    const end = headings[position + 1]?.index ?? index.length;
    const section = index.slice(start, end);
    const description = section.match(/^\*\*描述\*\*：(.+)$/m)?.[1]?.trim();
    // 索引把触发词放在标题下一行；不要用带多行 `$` 的正则，否则会在标题行末提前结束匹配。
    const triggerMarker = "**触发词**：";
    const triggerStart = section.indexOf(triggerMarker);
    const triggerSection = triggerStart >= 0
      ? section.slice(triggerStart + triggerMarker.length).split(/\r?\n\s*\r?\n/, 1)[0]
      : "";
    const triggers = [...triggerSection.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim()).filter(Boolean);

    if (!description || triggers.length === 0) return [];
    const name = heading[2];
    return [{
      id: `builtin-${name}`,
      name,
      source: "builtin" as const,
      description,
      triggers,
      dangerous: [],
      content: "",
      hits: 0,
    }];
  });
}

const BUILTIN_SKILLS = parseBuiltinSkills(skillsIndex);
if (import.meta.env.DEV && BUILTIN_SKILLS.length !== 41) {
  console.warn(`内置技能索引应包含 41 项，实际解析到 ${BUILTIN_SKILLS.length} 项`);
}

const EXPERIENCES: Experience[] = [
  { id: "exp-nginx-502", title: "Nginx 502 Bad Gateway 突发排障 SOP", category: "Web 服务", summary: "从 upstream、PHP-FPM/Node 进程池和错误日志入手，逐步缩小连接超时原因。", steps: ["确认 Nginx 配置语法和 upstream 状态", "检查后端进程池与连接数", "核对 error.log 时间窗口", "只在确认影响范围后平滑重载"], date: "2026-08-19" },
  { id: "exp-pg-lock", title: "PostgreSQL 长事务与行锁诊断", category: "数据库", summary: "定位长事务、阻塞关系和连接池耗尽原因，输出只读诊断结果。", steps: ["查询活跃事务和等待事件", "确认阻塞链与事务持续时间", "核对应用连接池状态", "生成诊断建议并交由负责人确认"], date: "2026-07-22" },
  { id: "exp-docker-oom", title: "Docker 容器 OOMKilled 恢复预案", category: "容器", summary: "从内核日志、容器限制和应用内存曲线判断是否为 cgroup 限制。", steps: ["读取 dmesg OOM 记录", "查看 docker stats 与容器限制", "确认应用是否存在内存泄漏", "提交资源调整审批"], date: "2026-06-11" },
  { id: "exp-inode", title: "Linux Inode 耗尽排查", category: "存储", summary: "定位大量小文件目录，先统计再给出可回滚的清理方案。", steps: ["查看 df -i", "按目录统计文件数量", "确认缓存和临时文件归属", "生成清理清单后人工执行"], date: "2026-05-03" },
];

const SKILLS_STORAGE_KEY = "opspub_user_skills";

function loadUserSkills() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SKILLS_STORAGE_KEY) ?? "[]") as Skill[];
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.source === "user" && typeof item.name === "string") : [];
  } catch {
    return [];
  }
}

function matchCount(skill: Skill, prompt: string) {
  const value = prompt.trim().toLowerCase();
  if (!value) return 0;
  return skill.triggers.filter((trigger) => value.includes(trigger.toLowerCase())).length;
}

export default function SkillsPage() {
  const [activeTab, setActiveTab] = useState<"skills" | "experiences" | "runbooks">("skills");
  const [source, setSource] = useState<"all" | SkillSource>("all");
  const [showBuiltin, setShowBuiltin] = useState(true);
  const [query, setQuery] = useState("");
  const [prompt, setPrompt] = useState("");
  const [userSkills, setUserSkills] = useState<Skill[]>(loadUserSkills);
  const [editing, setEditing] = useState<Skill | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const allSkills = useMemo(() => [...userSkills, ...BUILTIN_SKILLS], [userSkills]);
  const visibleSkills = useMemo(() => allSkills
    .map((skill) => ({ ...skill, hits: matchCount(skill, prompt) }))
    .filter((skill) => (source === "all" || skill.source === source) && (showBuiltin || skill.source !== "builtin"))
    .filter((skill) => `${skill.name} ${skill.description} ${skill.triggers.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => b.hits - a.hits || Number(a.source === "builtin") - Number(b.source === "builtin")), [allSkills, prompt, query, showBuiltin, source]);

  const saveSkill = () => {
    if (!editing) return;
    const normalized = { ...editing, name: editing.name.trim(), description: editing.description.trim(), triggers: editing.triggers.map((item) => item.trim()).filter(Boolean), dangerous: editing.dangerous.map((item) => item.trim()).filter(Boolean) };
    if (!normalized.name || !normalized.description || normalized.triggers.length === 0) { message.warning("请填写技能名称、描述和至少一个触发词"); return; }
    if (allSkills.some((item) => item.id !== normalized.id && item.name.toLowerCase() === normalized.name.toLowerCase())) { message.warning("技能名称已存在"); return; }
    const next = userSkills.some((item) => item.id === normalized.id) ? userSkills.map((item) => item.id === normalized.id ? normalized : item) : [normalized, ...userSkills];
    setUserSkills(next); localStorage.setItem(SKILLS_STORAGE_KEY, JSON.stringify(next)); setEditorOpen(false); setEditing(null); message.success("技能已保存到本机");
  };

  const deleteSkill = (skill: Skill) => {
    if (skill.source !== "user") { message.info("内置技能不可删除"); return; }
    const next = userSkills.filter((item) => item.id !== skill.id); setUserSkills(next); localStorage.setItem(SKILLS_STORAGE_KEY, JSON.stringify(next)); message.success("技能已删除");
  };

  const testPrompt = (value: string) => { setPrompt(value); setActiveTab("skills"); };

  return (
    <div className="ops-page ops-skills-page flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4 font-sans sm:p-5" style={{ color: "var(--text-secondary)" }}>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2"><Sparkles size={18} className="text-cyan-400" /><div><h1 className="m-0 text-base font-bold text-white">技能与经验库</h1><p className="m-0 mt-1 text-[11px] text-slate-400">已载入 41 项内置技能，可按名称、描述和触发词检索。</p></div></div>
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-surface-950 p-1"><button type="button" onClick={() => setActiveTab("skills")} className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${activeTab === "skills" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}><BookOpen size={13} className="mr-1 inline" />技能 {allSkills.length}</button><button type="button" onClick={() => setActiveTab("experiences")} className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${activeTab === "experiences" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}>经验库 {EXPERIENCES.length}</button><button type="button" onClick={() => setActiveTab("runbooks")} className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${activeTab === "runbooks" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}><Workflow size={13} className="mr-1 inline" />Runbook 0</button></div>
      </header>

      {activeTab === "skills" && <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto">
        <section className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-surface-900/90 p-3 text-xs"><Sparkles size={15} className="shrink-0 text-cyan-400" /><span className="font-medium text-slate-300">试试 Prompt：</span><button type="button" onClick={() => testPrompt("nginx 502 怎么排查")} className="text-cyan-400 hover:underline">“nginx 502 怎么排查”</button><span className="text-slate-500">或</span><button type="button" onClick={() => testPrompt("docker 容器一直 restarting")} className="text-cyan-400 hover:underline">“docker 容器一直 restarting”</button>{prompt && <button type="button" onClick={() => setPrompt("")} className="ml-auto inline-flex items-center gap-1 text-slate-500 hover:text-white"><X size={13} />清除测试</button>}</section>
        {prompt && <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-[11px] text-cyan-200">当前命中 {visibleSkills.filter((item) => item.hits > 0).length} 项技能，列表已按命中数优先排序。</div>}
        <section className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2"><div className="inline-flex rounded-lg border border-slate-800 bg-surface-950 p-0.5"><button type="button" onClick={() => setSource("all")} className={`rounded-md px-3 py-1.5 text-xs ${source === "all" ? "bg-surface-800 text-blue-400 font-medium" : "text-slate-400 hover:text-slate-200"}`}>全部 {allSkills.length}</button><button type="button" onClick={() => setSource("user")} className={`rounded-md px-3 py-1.5 text-xs ${source === "user" ? "bg-surface-800 text-blue-400 font-medium" : "text-slate-400 hover:text-slate-200"}`}>用户 {userSkills.length}</button><button type="button" onClick={() => setSource("builtin")} className={`rounded-md px-3 py-1.5 text-xs ${source === "builtin" ? "bg-surface-800 text-blue-400 font-medium" : "text-slate-400 hover:text-slate-200"}`}>内置 {BUILTIN_SKILLS.length}</button></div><Input allowClear value={query} onChange={(event) => setQuery(event.target.value)} prefix={<Search size={14} className="text-slate-500" />} placeholder="按名称、描述、触发词搜索" className="w-64" /><label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-xs text-slate-300"><input type="checkbox" checked={showBuiltin} onChange={(event) => setShowBuiltin(event.target.checked)} className="accent-blue-500" />显示内置</label></div><Button type="primary" icon={<Plus size={14} />} onClick={() => { setEditing({ id: crypto.randomUUID(), name: "", source: "user", description: "", triggers: [], dangerous: [], content: "", hits: 0 }); setEditorOpen(true); }}>新建技能</Button>
        </section>
        <section className="overflow-hidden rounded-xl border border-slate-800 bg-surface-900/75">
          <div className="custom-scrollbar overflow-x-auto"><table className="w-full min-w-[980px] text-left text-xs"><thead className="border-b border-slate-800 bg-surface-900/90 text-[11px] text-slate-400"><tr><th className="w-52 p-3 font-medium">名称</th><th className="w-20 p-3 font-medium">来源</th><th className="min-w-64 p-3 font-medium">描述</th><th className="min-w-56 p-3 font-medium">触发词</th><th className="min-w-48 p-3 font-medium">危险命令</th><th className="w-20 p-3 font-medium">命中</th><th className="w-28 p-3 text-right font-medium">操作</th></tr></thead><tbody className="divide-y divide-slate-800/60">{visibleSkills.map((skill) => <tr key={skill.id} className="transition hover:bg-surface-850/50"><td className="p-3"><div className="font-mono font-semibold text-slate-200">{skill.name}</div><div className="mt-1 max-w-48 truncate text-[10px] text-slate-500">{skill.content || (skill.source === "builtin" ? "索引未提供技能正文" : "未填写技能正文")}</div></td><td className="p-3">{skill.source === "user" ? <Tag color="blue">用户</Tag> : <Tag color="default">内置</Tag>}</td><td className="p-3 leading-relaxed text-slate-400">{skill.description}</td><td className="p-3"><div className="flex flex-wrap gap-1">{skill.triggers.map((trigger) => <span key={trigger} className={`rounded border px-1.5 py-0.5 text-[10px] ${skill.hits > 0 && prompt.toLowerCase().includes(trigger.toLowerCase()) ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300" : "border-slate-700 text-slate-400"}`}>{trigger}</span>)}</div></td><td className="p-3 font-mono text-[10px] text-rose-300">{skill.dangerous.length ? skill.dangerous.join(" · ") : skill.source === "builtin" ? "索引未提供" : "无"}</td><td className="p-3 font-mono text-cyan-300">{skill.hits || "-"}</td><td className="p-3 text-right"><div className="flex justify-end gap-1">{skill.source === "user" && <><Button size="small" type="text" icon={<Pencil size={13} />} title="编辑技能" aria-label="编辑技能" onClick={() => { setEditing(skill); setEditorOpen(true); }} /><Button size="small" danger type="text" icon={<Trash2 size={13} />} title="删除技能" aria-label="删除技能" onClick={() => deleteSkill(skill)} /></>}</div></td></tr>)}</tbody></table>{visibleSkills.length === 0 && <div className="p-10 text-center text-xs text-slate-500">没有匹配的技能</div>}</div>
        </section>
      </div>}

      {activeTab === "experiences" && <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto"><div className="flex items-center justify-between rounded-xl border border-slate-800 bg-surface-900/90 p-3 text-xs text-slate-300"><span className="inline-flex items-center gap-2"><FileText size={15} className="text-amber-400" />经验库沉淀事故复盘后的处置 SOP，可作为技能命中测试的场景。</span><Button type="link" size="small" onClick={() => message.info("经验同步需要接入团队知识库服务")}>同步最新复盘</Button></div><div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{EXPERIENCES.map((item) => <article key={item.id} className="rounded-xl border border-slate-800 bg-surface-900/80 p-4 transition hover:border-amber-500/40"><div className="flex items-center justify-between gap-2"><Tag color="gold">{item.category}</Tag><span className="text-[11px] text-slate-500">{item.date}</span></div><h2 className="mt-3 text-sm font-bold text-white">{item.title}</h2><p className="mt-2 text-xs leading-relaxed text-slate-400">{item.summary}</p><ol className="mt-3 space-y-1 rounded-lg border border-slate-800 bg-surface-950 p-3 text-[11px] leading-relaxed text-emerald-300">{item.steps.map((step, index) => <li key={step}>{index + 1}. {step}</li>)}</ol><div className="mt-3 flex items-center justify-between"><span className="text-[11px] text-slate-500">来源：事故复盘沉淀</span><Button size="small" onClick={() => { setPrompt(`${item.title}：${item.summary}`); setActiveTab("skills"); }}>测试匹配技能</Button></div></article>)}</div></div>}

      {activeTab === "runbooks" && <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto"><section className="w-full max-w-xl rounded-xl border border-slate-800 bg-surface-900/50 p-8 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-800 text-slate-500"><Workflow size={24} /></div><h2 className="mt-3 text-sm font-medium text-slate-200">暂无独立 Runbook 自动化工作流</h2><p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-500">Runbook 可通过经验库的处置 SOP 创建，支持多节点自动化编排与审批放行。</p><Button size="small" className="mt-4" onClick={() => setActiveTab("experiences")}>查看处置经验</Button></section></div>}

      <Modal title={<span className="inline-flex items-center gap-2"><Code2 size={16} />{editing?.id && userSkills.some((item) => item.id === editing.id) ? "编辑技能" : "新建技能"}</span>} open={editorOpen} width={650} centered maskClosable={false} destroyOnClose onCancel={() => { setEditorOpen(false); setEditing(null); }} footer={<div className="flex justify-end gap-2"><Button onClick={() => { setEditorOpen(false); setEditing(null); }}>取消</Button><Button type="primary" onClick={saveSkill}>保存到本机</Button></div>}>
        {editing && <div className="space-y-3"><label className="block text-xs text-slate-400">技能名称<Input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} className="mt-1" placeholder="例如：redis-cluster-check" /></label><label className="block text-xs text-slate-400">一句话描述<Input value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} className="mt-1" placeholder="技能解决什么问题" /></label><label className="block text-xs text-slate-400">触发词（用逗号分隔）<Input value={editing.triggers.join(", ")} onChange={(event) => setEditing({ ...editing, triggers: event.target.value.split(",") })} className="mt-1" placeholder="redis, cluster, 集群" /></label><label className="block text-xs text-slate-400">危险命令（用逗号分隔，可选）<Input value={editing.dangerous.join(", ")} onChange={(event) => setEditing({ ...editing, dangerous: event.target.value.split(",") })} className="mt-1" placeholder="FLUSHALL, restart" /></label><label className="block text-xs text-slate-400">技能正文<textarea value={editing.content} onChange={(event) => setEditing({ ...editing, content: event.target.value })} rows={8} className="mt-1 w-full resize-y rounded-lg border border-slate-700 bg-surface-950 p-3 text-xs leading-relaxed text-slate-200 outline-none focus:border-blue-500" placeholder="写入排查步骤、注意事项和审批要求" /></label><div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-[11px] text-amber-300"><CheckCircle2 size={13} />技能只保存在本机浏览器存储，暂不会自动同步给其他设备。</div></div>}
      </Modal>
    </div>
  );
}
