/** 发版脚本和更新弹窗共用的纯文本摘要；不在用户电脑上请求 Git 或调用模型。 */
const FALLBACK_NOTE = "优化应用使用体验与运行稳定性。";
const COMMIT = /^(feat|fix|perf|refactor|style|chore|docs|test|ci|build|release|revert)(?:\(([^)]+)\))?!?:\s*(.+)$/i;
const INTERNAL_TYPES = new Set(["docs", "test", "ci", "build", "release"]);
const MODULES = [
  ["AI 助手", /copilot|agent|AI\s*(?:助手|聊天|对话)/i],
  ["MCP 接入", /mcp/i],
  ["技能", /skills?|技能/i],
  ["服务器管理", /servers?|服务器|主机/i],
  ["终端", /terminal|终端|ssh/i],
  ["SFTP 文件管理", /sftp|文件传输/i],
  ["数据库", /database|\bdb\b|mysql|sqlite|数据库/i],
  ["告警", /alerts?|告警|警告/i],
  ["部署", /deploy|部署/i],
  ["工作台", /workbench|工作台|资源概览/i],
  ["设置", /settings?|设置/i],
  ["审计", /audit|审计/i],
  ["敏感信息保护", /sensitive|vault|敏感库|敏感信息/i],
  ["版本更新", /updater|release|版本更新|自动更新/i],
];

// 将跨次提交反复提及的同一能力归并为用户能理解的事项，不逐条罗列提交标题。
const HIGHLIGHTS = [
  [/forty.one|41\s*(?:项|个|套)|四十一/i, "41 项内置运维技能"],
  [/twenty\s*rounds?|20\s*轮|二十轮/i, "最多 20 轮 Agent 对话"],
  [/approval\s*timeout|审批超时/i, "审批超时处理"],
  [/execution\s*(?:timeline|process)|执行(?:时间线|过程)/i, "执行过程展示"],
  [/stream|流式|实时回复/i, "流式回复"],
  [/chat\s*history|copilot\s*history|历史(?:对话|会话|记录)/i, "历史对话管理"],
  [/external\s*operations\s*workflow|外部.*(?:运维|工作流)/i, "外部工具调用运维能力"],
  [/客户端配置|client\s*config/i, "客户端接入配置"],
  [/接入中心/i, "接入中心"],
  [/notification\s*channels?|通知渠道/i, "通知渠道"],
  [/deployment\s*groups?|部署分组/i, "部署分组管理"],
  [/device\s*channels?|设备通道/i, "设备通道"],
  [/backup|restore|备份|还原/i, "备份与还原"],
  [/automatic\s*(?:website\s*)?updates?|自动(?:检测|检查|下载|更新)/i, "官网版本检测与自动更新"],
  [/typography|字体|字号|文字大小/i, "字体与文字可读性"],
  [/light\s*theme|亮色|浅色|主题配色/i, "亮色主题配色"],
  [/server\s*management|服务器管理/i, "服务器管理"],
  [/resource\s*overview|资源概览/i, "资源概览"],
];

function cleanLine(line) {
  return line.trim().replace(/^(?:[-*+]\s+|\d+[.、)]\s*)/, "").trim();
}

function getModule(scope, subject) {
  return MODULES.find(([, pattern]) => pattern.test(scope))?.[0]
    ?? MODULES.find(([, pattern]) => pattern.test(subject))?.[0]
    ?? "应用";
}

function describeChange(subject) {
  const highlights = HIGHLIGHTS.filter(([pattern]) => pattern.test(subject)).map(([, label]) => label);
  if (highlights.length) return highlights;
  if (/[\u3400-\u9fff]/u.test(subject)) {
    return [subject
      .replace(/\s*\[scope:[^\]]+\]/gi, "")
      .replace(/^(?:新增|添加|实现|完善|优化|调整|修复|解决|支持|改进|修正|重构|整理)\s*/u, "")
      .replace(/[。；;]+$/u, "")];
  }
  // 未识别的英文细节不原样暴露为开发记录，也不凭空生成具体功能承诺。
  return [];
}

export function summarizeCommits(subjects) {
  const groups = new Map();
  for (const raw of subjects) {
    const line = cleanLine(raw);
    if (!line || /^(?:merge\b|revert\b|合并\b)/i.test(line)) continue;
    const match = COMMIT.exec(line);
    const type = match?.[1].toLowerCase() ?? "";
    const scope = match?.[2] ?? "";
    const subject = match?.[3] ?? line;
    if (INTERNAL_TYPES.has(type)) continue;
    // chore 通常属于内部维护；只有明确涉及用户界面的改动才计入更新说明。
    if (type === "chore" && !/history|界面|主题|字体|交互|对话/i.test(subject)) continue;
    const category = type === "fix" || /^(?:修复|解决|修正)/u.test(subject)
      ? "修复" : type === "feat" || /^(?:新增|添加|支持|实现)/u.test(subject) ? "新增" : "优化";
    const module = getModule(scope, subject);
    const key = `${category}:${module}`;
    if (!groups.has(key)) groups.set(key, { category, module, details: new Set() });
    for (const detail of describeChange(subject)) if (detail) groups.get(key).details.add(detail);
  }
  const items = [];
  for (const category of ["新增", "优化", "修复"]) {
    for (const group of groups.values()) {
      if (group.category !== category) continue;
      const noun = category === "新增" ? "功能" : category === "优化" ? "体验" : "问题";
      const details = [...group.details];
      const separator = /^[A-Za-z]/.test(group.module) ? " " : "";
      items.push(`${category}${separator}${group.module}${noun}${details.length ? `：${details.join("、")}` : ""}。`);
    }
  }
  return items.length ? items : [FALLBACK_NOTE];
}

export function parseReleaseNotes(body) {
  const lines = (body ?? "").split(/\r?\n/).map(cleanLine).filter(Boolean);
  // 兼容已经在线的旧版 update.json；更新弹窗也不会继续直接展示 feat/fix 等提交标题。
  if (lines.some((line) => COMMIT.test(line))) {
    const commits = lines.filter((line) => COMMIT.test(line));
    const extra = lines.filter((line) => !COMMIT.test(line) && !/^#{1,6}\s/.test(line));
    return [...summarizeCommits(commits), ...extra];
  }
  const items = lines.filter((line) => !/^#{1,6}\s|^\*\*Full Changelog\*\*/i.test(line));
  return items.length ? items : [FALLBACK_NOTE];
}

export function formatReleaseNotes(items) {
  return items.map((item, index) => `${index + 1}、${item}`).join("\n");
}

export function formatReleaseDate(value) {
  if (!value) return "待公布";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "待公布";
  return date.toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}
