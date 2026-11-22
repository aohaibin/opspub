import { useMemo, useRef, useState } from "react";
import { Button, Empty, Input, Pagination, Popconfirm, Segmented, Switch, Tag, message } from "antd";
import { Eye, FlaskConical, Pencil, Plus, Search, Trash2, Workflow } from "lucide-react";
import { getErrorMessage } from "@/lib/api/client";
import { skillsApi } from "@/lib/api/skills";
import { parseUserSkills, SKILLS_STORAGE_KEY, type ChatSkill } from "@/lib/copilot-skills";
import { DEFAULT_SKILL_BODY, SkillDrawer, skillHeader, type SkillPanel } from "./SkillDrawer";
import skillsIndex from "../../../docs/skills-index-20261006.md?raw";

const BUILTIN_BODIES = import.meta.glob("../../../docs/skills/*.md", { eager: true, query: "?raw", import: "default" }) as Record<string, string>;

type SkillSource = ChatSkill["source"];

type Experience = { id: string; title: string; category: string; summary: string; steps: string[]; date: string };

function parseDangerousCommands(content: string): string[] {
  const marker = content.indexOf("dangerous_commands:");
  if (marker < 0) return [];
  const block = content.slice(marker).split(/\r?\n---\s*\r?\n/, 1)[0];
  return block
    .split(/\r?\n/)
    .map((line) => line.match(/^\s+-\s+(['"])(.*)\1\s*$/)?.[2]?.trim() ?? "")
    .filter(Boolean);
}

function parseBuiltinSkills(index: string): ChatSkill[] {
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
    const content = BUILTIN_BODIES[`../../../docs/skills/${name}.md`] ?? "";
    return [{
      id: `builtin-${name}`,
      name,
      source: "builtin" as const,
      description,
      triggers,
      dangerous: parseDangerousCommands(content),
      content,
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


const PROMPT_SAMPLES = ["nginx 502 怎么排查", "docker 容器一直 restarting"];
const CELL = "px-2.5 py-2.5 align-top [overflow-wrap:anywhere]";
const TABLE_HEADERS = [
  ["名称", "w-[17%]"],
  ["来源", "w-[8%]"],
  ["描述", "w-[25%]"],
  ["触发词", "w-[18%]"],
  ["危险命令", "w-[13%]"],
  ["命中", "w-[7%]"],
  ["操作", "w-[12%] text-right"],
];

type View = "skills" | "experiences" | "runbooks";
type SourceFilter = "all" | SkillSource;

function loadUserSkills() {
  try {
    return parseUserSkills(localStorage.getItem(SKILLS_STORAGE_KEY));
  } catch {
    return [];
  }
}

function ExperienceList({ onTest }: { onTest: (prompt: string) => void }) {
  return (
    <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3 text-xs text-[var(--text-secondary)]">
        <span>故障复盘与处置 SOP</span>
        <Button type="link" size="small" onClick={() => message.info("经验同步需要接入团队知识库服务")}>同步最新复盘</Button>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {EXPERIENCES.map((item) => (
          <article key={item.id} className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Tag color="gold">{item.category}</Tag>
              <time className="text-xs text-[var(--text-secondary)]" dateTime={item.date}>{item.date}</time>
            </div>
            <h2 className="mt-3 text-sm font-bold">{item.title}</h2>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{item.summary}</p>
            <ol className="mt-3 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-[var(--text-secondary)]">
              {item.steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
            <div className="mt-3 flex justify-end">
              <Button size="small" onClick={() => onTest(`${item.title}：${item.summary}`)}>测试匹配技能</Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export default function SkillsPage() {
  const [view, setView] = useState<View>("skills");
  const [source, setSource] = useState<SourceFilter>("all");
  const [showBuiltin, setShowBuiltin] = useState(true);
  const [query, setQuery] = useState("");
  const [promptInput, setPromptInput] = useState("");
  const [prompt, setPrompt] = useState("");
  const [userSkills, setUserSkills] = useState(loadUserSkills);
  const [panel, setPanel] = useState<SkillPanel | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const listRef = useRef<HTMLDivElement>(null);
  const allSkills = useMemo(() => [...userSkills, ...BUILTIN_SKILLS], [userSkills]);

  const visibleSkills = useMemo(() => {
    const search = query.trim().toLowerCase();
    const text = prompt.toLowerCase();
    return allSkills
      .filter((skill) => (source === "all" || skill.source === source) && (showBuiltin || skill.source !== "builtin"))
      .filter((skill) => `${skill.name} ${skill.description} ${skill.triggers.join(" ")}`.toLowerCase().includes(search))
      .map((skill) => {
        const triggers = [...new Set(skill.triggers)];
        const matches = triggers.filter((trigger) => text.includes(trigger.toLowerCase()));
        return { ...skill, triggers, matches };
      })
      .sort((a, b) => b.matches.length - a.matches.length);
  }, [allSkills, prompt, query, showBuiltin, source]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(visibleSkills.length / pageSize)));
  const pageSkills = visibleSkills.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const matchedCount = visibleSkills.filter((skill) => skill.matches.length > 0).length;

  function changePage(next: number) {
    setPage(next);
    if (listRef.current) listRef.current.scrollTop = 0;
  }

  function runMatch(value: string) {
    setPromptInput(value);
    setPrompt(value.trim());
    setView("skills");
    changePage(1);
  }

  function openCreate() {
    setPanel({
      mode: "create",
      skill: { id: crypto.randomUUID(), source: "user", name: "", description: "", triggers: [], dangerous: [], content: DEFAULT_SKILL_BODY, hits: 0 },
    });
  }

  function updateUserSkills(next: ChatSkill[]) {
    setUserSkills(next);
    try {
      localStorage.setItem(SKILLS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      message.warning("技能文件已更新，但列表缓存写入失败，重新打开后可能显示旧记录");
    }
  }

  async function saveSkill(skill: ChatSkill) {
    if (saving || !panel || panel.mode === "detail") return;
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(skill.name)) {
      message.warning("技能名称须以小写字母或数字开头，最多 64 个字符，只能包含小写字母、数字、连字符和下划线");
      return;
    }
    if (!skill.description || !skill.triggers.length) {
      message.warning("请填写技能描述和至少一个触发词");
      return;
    }
    if (allSkills.some((item) => item.id !== skill.id && item.name.toLowerCase() === skill.name.toLowerCase())) {
      message.warning("技能名称已存在");
      return;
    }

    setSaving(true);
    try {
      await skillsApi.save(skill.name, `${skillHeader(skill)}\n\n${skill.content}\n`);
      if (panel.mode === "edit" && panel.skill.name !== skill.name) {
        try {
          await skillsApi.remove(panel.skill.name);
        } catch (error) {
          message.error(`新名称对应的文件已保存，清理旧文件失败，可重试保存。${getErrorMessage(error)}`);
          return;
        }
      }
      updateUserSkills(panel.mode === "create"
        ? [skill, ...userSkills]
        : userSkills.map((item) => item.id === skill.id ? skill : item));
      if (panel.mode === "create") {
        setSource("user");
        setQuery("");
        runMatch("");
      }
      setPanel(null);
      message.success("技能已保存");
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function deleteSkill(skill: ChatSkill) {
    if (deleting || skill.source !== "user") return;
    setDeleting(true);
    try {
      await skillsApi.remove(skill.name);
      updateUserSkills(userSkills.filter((item) => item.id !== skill.id));
      if (visibleSkills.length === (currentPage - 1) * pageSize + 1) changePage(Math.max(1, currentPage - 1));
      message.success("技能已删除");
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="ops-skills-workspace flex h-full min-h-0 min-w-0 flex-col gap-3 text-[var(--text-primary)]">
      <header className="shrink-0 border-b border-[var(--border)] pb-2.5">
        <Segmented<View>
          aria-label="技能库视图"
          value={view}
          onChange={setView}
          options={[
            { value: "skills", label: `技能 ${allSkills.length}` },
            { value: "experiences", label: `经验库 ${EXPERIENCES.length}` },
            { value: "runbooks", label: "Runbook 0" },
          ]}
        />
      </header>

      {view === "skills" && (
        <>
          <section aria-label="关键词匹配测试" className="shrink-0 border-b border-[var(--border)] pb-3">
            <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => {
              event.preventDefault();
              runMatch(promptInput);
            }}>
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold" htmlFor="skills-match-input">
                <FlaskConical size={15} className="text-[var(--accent)]" />关键词匹配测试
              </label>
              <Input id="skills-match-input" className="min-w-40 flex-1" value={promptInput} placeholder="输入一条任务描述"
                onChange={(event) => setPromptInput(event.target.value)} />
              <Button htmlType="submit" disabled={!promptInput.trim()}>测试匹配</Button>
              {(promptInput || prompt) && <Button type="text" onClick={() => runMatch("")}>清除</Button>}
            </form>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {PROMPT_SAMPLES.map((sample) => (
                <Button key={sample} size="small" type="link" className="h-auto p-0" onClick={() => runMatch(sample)}>{sample}</Button>
              ))}
              {prompt && <span role="status" className="text-[var(--text-secondary)]">当前列表命中 {matchedCount} 项</span>}
            </div>
          </section>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2.5">
              <Segmented<SourceFilter>
                aria-label="技能来源"
                value={source}
                onChange={(value) => {
                  setSource(value);
                  if (value === "builtin") setShowBuiltin(true);
                  changePage(1);
                }}
                options={[
                  { value: "all", label: `全部 ${allSkills.length}` },
                  { value: "user", label: `用户 ${userSkills.length}` },
                  { value: "builtin", label: `内置 ${BUILTIN_SKILLS.length}` },
                ]}
              />
              <Input aria-label="搜索技能" allowClear value={query} onChange={(event) => { setQuery(event.target.value); changePage(1); }}
                prefix={<Search size={14} />} placeholder="按名称、描述、触发词搜索" className="w-60 max-w-full" />
              <label className="inline-flex items-center gap-2 whitespace-nowrap text-xs text-[var(--text-secondary)]">
                <Switch size="small" aria-label="显示内置" checked={showBuiltin} onChange={(checked) => {
                  setShowBuiltin(checked);
                  if (!checked && source === "builtin") setSource("all");
                  changePage(1);
                }} />
                显示内置
              </label>
            </div>
            <Button type="primary" icon={<Plus size={15} />} onClick={openCreate} disabled={deleting}>新建技能</Button>
          </div>

          <section aria-label="技能列表" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
            <div ref={listRef} className="custom-scrollbar min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[730px] table-fixed text-left text-xs">
                <thead className="sticky top-0 z-[1] bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                  <tr>{TABLE_HEADERS.map(([label, width]) => (
                    <th key={label} scope="col" className={`px-2.5 py-2.5 font-medium ${width}`}>{label}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {pageSkills.map((skill) => (
                    <tr key={skill.id} className="border-t border-[var(--border)] hover:bg-[var(--bg-hover)]">
                      <td className={CELL}>
                        <button type="button" className="text-left font-mono font-semibold hover:underline"
                          onClick={() => setPanel({ mode: "detail", skill })}>{skill.name}</button>
                      </td>
                      <td className={CELL}><Tag className="m-0" color={skill.source === "user" ? "blue" : "default"}>{skill.source === "user" ? "用户" : "内置"}</Tag></td>
                      <td className={`${CELL} leading-relaxed text-[var(--text-secondary)]`}>{skill.description}</td>
                      <td className={CELL}>
                        <div className="flex flex-wrap gap-1">
                          {skill.triggers.map((trigger) => (
                            <Tag key={trigger} color={skill.matches.includes(trigger) ? "cyan" : "default"}
                              className="m-0 max-w-full whitespace-normal">{trigger}</Tag>
                          ))}
                        </div>
                      </td>
                      <td className={`${CELL} font-mono`}>
                        {skill.dangerous.length
                          ? <span className="text-[var(--danger)]">{skill.dangerous.join(" · ")}</span>
                          : <span className="text-[var(--text-secondary)]">{skill.source === "builtin" && !skill.content ? "索引未提供" : "无"}</span>}
                      </td>
                      <td className={`${CELL} tabular-nums`}>{skill.matches.length || "—"}</td>
                      <td className={CELL}>
                        <div className="flex justify-end gap-0.5">
                          <Button size="small" type="text" icon={<Eye size={14} />} title="查看技能" aria-label="查看技能"
                            onClick={() => setPanel({ mode: "detail", skill })} />
                          {skill.source === "user" && (
                            <>
                              <Button size="small" type="text" icon={<Pencil size={14} />} title="编辑技能" aria-label="编辑技能" disabled={deleting}
                                onClick={() => setPanel({ mode: "edit", skill })} />
                              <Popconfirm title="删除技能？" description={skill.name} okText="删除" cancelText="取消"
                                okButtonProps={{ danger: true }} disabled={deleting} onConfirm={() => deleteSkill(skill)}>
                                <Button size="small" danger type="text" icon={<Trash2 size={14} />} title="删除技能" aria-label="删除技能" disabled={deleting} />
                              </Popconfirm>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!pageSkills.length && <Empty className="my-8" image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的技能" />}
            </div>
            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--text-secondary)]">
              <span>共 {visibleSkills.length} 条技能</span>
              <Pagination
                size="small"
                current={currentPage}
                pageSize={pageSize}
                total={visibleSkills.length}
                pageSizeOptions={[10, 20, 50]}
                showSizeChanger
                onChange={(next, size) => {
                  changePage(size === pageSize ? next : 1);
                  setPageSize(size);
                }}
              />
            </footer>
          </section>
        </>
      )}

      {view === "experiences" && <ExperienceList onTest={(value) => {
        setSource("all");
        setQuery("");
        setShowBuiltin(true);
        runMatch(value);
      }} />}
      {view === "runbooks" && (
        <div className="grid min-h-0 flex-1 place-items-center overflow-auto">
          <Empty image={<Workflow size={36} className="mx-auto mt-4 text-[var(--text-muted)]" />} description="暂无 Runbook">
            <Button onClick={() => setView("experiences")}>查看处置经验</Button>
          </Empty>
        </div>
      )}

      <SkillDrawer panel={panel} saving={saving} onClose={() => { if (!saving) setPanel(null); }}
        onEdit={(skill) => setPanel({ mode: "edit", skill })} onSave={saveSkill} />
    </div>
  );
}
