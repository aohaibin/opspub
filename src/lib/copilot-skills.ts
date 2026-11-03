export interface ChatSkill {
  id: string;
  name: string;
  source: "builtin" | "user";
  description: string;
  triggers: string[];
  dangerous: string[];
  content: string;
  hits?: number;
}

export const SKILLS_STORAGE_KEY = "opspub_user_skills";

export function parseBuiltinSkills(index: string): ChatSkill[] {
  const headings = [...index.matchAll(/^## (\d+)\. `([^`]+)`[^\r\n]*$/gm)];
  return headings.flatMap((heading, position) => {
    if (Number(heading[1]) < 1 || Number(heading[1]) > 41) return [];
    const section = index.slice(heading.index! + heading[0].length, headings[position + 1]?.index ?? index.length);
    const description = section.match(/^\*\*描述\*\*：?(.+)$/m)?.[1]?.trim() ?? "";
    const triggerStart = section.indexOf("**触发词**：");
    const triggerSection = triggerStart >= 0 ? section.slice(triggerStart).split(/\r?\n\s*\r?\n/, 1)[0] : "";
    const triggers = [...triggerSection.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim()).filter(Boolean);
    if (!description || !triggers.length) return [];
    // 索引只有元数据，不能声称已加载原始技能的执行配方。
    return [{ id: `builtin-${heading[2]}`, name: heading[2], source: "builtin" as const, description, triggers, dangerous: [], content: "" }];
  });
}

export function parseUserSkills(stored: string | null): ChatSkill[] {
  try {
    const parsed: unknown = JSON.parse(stored ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item: unknown) => {
      if (!item || typeof item !== "object") return [];
      const skill = item as Partial<ChatSkill>;
      if (skill.source !== "user" || typeof skill.id !== "string" || typeof skill.name !== "string" || !skill.name.trim()) return [];
      const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && !!entry.trim()) : [];
      return [{ ...skill, id: skill.id, name: skill.name, source: "user" as const, description: typeof skill.description === "string" ? skill.description : "", content: typeof skill.content === "string" ? skill.content : "", triggers: strings(skill.triggers), dangerous: strings(skill.dangerous) }];
    });
  } catch {
    return [];
  }
}

export function matchChatSkills(skills: ChatSkill[], prompt: string): ChatSkill[] {
  const value = prompt.trim().toLowerCase();
  if (!value) return [];
  return skills.map((skill) => ({
    skill,
    score: Math.max(value.includes(skill.name.toLowerCase()) ? skill.name.length : 0, ...skill.triggers.map((trigger) => value.includes(trigger.toLowerCase()) ? trigger.length : 0)),
  })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map((item) => item.skill);
}

export function resolveChatSkills(skills: ChatSkill[], manualIds: string[], prompt: string, automatic: boolean): ChatSkill[] {
  const ids = new Set([...manualIds, ...(automatic ? matchChatSkills(skills, prompt).map((skill) => skill.id) : [])]);
  return skills.filter((skill) => ids.has(skill.id));
}

export function chatSkillContext(skills: ChatSkill[]): string {
  let context = "";
  for (const skill of skills) {
    const metadata = [
    `技能：${skill.name}`,
    `描述：${skill.description}`,
    `触发词：${skill.triggers.join(", ")}`,
    skill.dangerous.length ? `需重点复核的操作：${skill.dangerous.join(", ")}` : "",
    ].filter(Boolean).join("\n");
    const prefix = context ? "\n\n" : "";
    let entry = `${metadata}\n${skill.content ? `正文：\n${skill.content}` : "仅提供索引摘要，请先确认环境并给出分析建议；此摘要不是执行配方。"}`;
    // 整条省略正文，避免截断私钥结束标记后影响后端敏感内容扫描。
    if (context.length + prefix.length + entry.length > 24_000) entry = `${metadata}\n正文超出本轮长度限制，仅发送元数据。`;
    if (context.length + prefix.length + entry.length <= 24_000) context += prefix + entry;
  }
  return context;
}

export function skillDocument(skill: Pick<ChatSkill, "name" | "description" | "triggers" | "content">): string {
  // JSON 引号也是合法的 YAML 字符串，避免描述中的冒号或换行破坏 frontmatter。
  return `---\nname: ${JSON.stringify(skill.name)}\ndescription: ${JSON.stringify(`${skill.description}\n\n触发词：${skill.triggers.join("、")}`)}\ntriggers: ${JSON.stringify(skill.triggers)}\n---\n\n# ${skill.name}\n\n${skill.content}\n`;
}
