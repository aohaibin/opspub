/**
 * 模块注册表 —— 左侧导轨、路由、占位页共用的唯一数据源。
 *
 * 为什么单独抽一个文件：原型把导航项、页面标题、视图内容写在同一份 HTML 里，
 * 而项目是「导航 / 路由 / 页面」三处分离。若三处各写一份清单，新增一个模块要改三遍，
 * 且极易漏项（典型症状：导航里有入口，点进去却是空白页）。
 * 这里收敛成一份，三处都从这里读。
 *
 * 顺序、短标签、角标颜色均严格对齐原型 docs/remote-ops-ai-prototype.html 的 aside#appSidebar。
 */

import {
  Bell,
  Bot,
  Database,
  FolderSync,
  KeyRound,
  Layers,
  LayoutGrid,
  PlugZap,
  Rocket,
  ScrollText,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  type LucideIcon,
} from "lucide-react";

/**
 * 导航分组。原型在第 7 项（部署）与第 8 项（AI 助手）之间插了一条分割线，
 * 把「核心运维」与「AI + 安全」在视觉上分开，这里用同一套分组语义。
 */
export type ModuleGroup = "core" | "ai" | "security";

/** 导轨右上角的状态圆点（原型 nav-btn 内的绝对定位小圆） */
export type ModuleDot = "amber" | "rose" | "rose-pulse";

export interface ModuleDef {
  /** 路由片段，与原型 tabId 的后缀保持一致（tab-servers → servers） */
  key: string;
  /** 导轨上的短标签（原型 .nav-label，最长 5 字，避免撑破 52px） */
  navLabel: string;
  /** 模块全名（原型 data-title，同时作为页面标题） */
  title: string;
  /** 页面副标题，取自原型各 VIEW 标题的括号说明 */
  subtitle: string;
  /** 定位说明：这个模块在整套系统里解决什么问题 */
  desc: string;
  /** 核心能力点，占位页用它说明「这个模块要做什么」 */
  capabilities: string[];
  icon: LucideIcon;
  group: ModuleGroup;
  /** 状态圆点 */
  dot?: ModuleDot;
  /** 是否固定在导轨底部（原型里只有「设置」固定） */
  pinned?: boolean;
  /** 是否已完成实现；false → 路由指向通用占位页 */
  implemented?: boolean;
}

/**
 * 全部 17 个模块。前 16 个进滚动区，`pinned` 的进底部固定区。
 * 改这里就能同时改掉导航、路由和占位页文案，不需要第二处同步。
 */
export const MODULES: ModuleDef[] = [
  {
    key: "servers",
    navLabel: "服务器",
    title: "服务器资产清单",
    subtitle: "支持密码、私钥、SSH-Agent、ProxyJump 跳板机、Windows WinRM",
    desc: "所有终端、SFTP、工作台、数据库、批量执行与 AI 工具调用的根源基石",
    capabilities: [
      "分组树 + 标签双维度检索，支持收藏与最近用过",
      "TCP 连通性探活，区分 DNS 解析失败与端口不可达",
      "AI 策略分级：可信 / 白名单 / 需审批 / 禁止",
      "批量测通、批量打标签、批量调策略",
      "Windows 接入向导与 ~/.ssh/config 导入",
    ],
    icon: Server,
    group: "core",
    implemented: true,
  },
  {
    key: "terminal",
    navLabel: "终端",
    title: "远程终端",
    subtitle: "田字分屏 / 广播输入",
    desc: "多标签 + 四宫格分屏，一条命令同时下发到多个会话",
    capabilities: [
      "多标签页与田字分屏布局",
      "广播输入：一次输入下发到所有已选会话",
      "终端配色自动跟随主题皮肤",
      "全量会话录制，写入不可篡改审计",
    ],
    icon: Terminal,
    group: "core",
    implemented: true,
  },
  {
    key: "workbench",
    navLabel: "工作台",
    title: "主机工作台",
    subtitle: "实时监控探针",
    desc: "单主机的 CPU / 内存 / 磁盘 / 网络实时探针与快捷操作台",
    capabilities: [
      "实时资源探针：CPU / 内存 / 磁盘 / 网络",
      "主机身份与 SSH 指纹核验",
      "快捷操作条：进 SFTP、开数据库、批量重载",
      "异常指标高亮并联动告警中心",
    ],
    icon: LayoutGrid,
    group: "core",
    implemented: true,
  },
  {
    key: "sftp",
    navLabel: "SFTP",
    title: "SFTP 文件传输",
    subtitle: "russh-sftp 安全信道 · 目录拖拽分块上传 · 在线代码审查 · AI 凭据泄露打码",
    desc: "本地与远程双栏目录对拷，支持大文件分块续传与在线预览",
    capabilities: [
      "流式分块上传与断点续传",
      "双栏目录对拷与拖拽上传",
      "在线代码审查：不落地直接看",
      "AI 出口凭据泄露打码",
    ],
    icon: FolderSync,
    group: "core",
    implemented: true,
  },
  {
    key: "database",
    navLabel: "数据库",
    title: "数据库统一工作台",
    subtitle: "SQL / Redis / MongoDB 多引擎与 AI NL2SQL 自然语言查询",
    desc: "一套界面管理多种数据引擎，用自然语言直接查数据",
    capabilities: [
      "多引擎：MySQL / PostgreSQL / Redis / MongoDB",
      "AI NL2SQL：自然语言转查询语句",
      "结果集表格化、排序与导出",
      "写操作强制走审批闸门",
    ],
    icon: Database,
    group: "core",
    implemented: true,
  },
  {
    key: "batch",
    navLabel: "批量",
    title: "批量执行 (Batch Command Runner)",
    subtitle: "多机并发编排",
    desc: "一条命令发往多台机器；每台独立超时，失败可重试，全流程不可篡改审计",
    capabilities: [
      "多机并发下发，每台独立超时",
      "失败主机单机重试",
      "逐机结果对比与差异高亮",
      "全流程写入审计存证",
    ],
    icon: Layers,
    group: "core",
    implemented: true,
  },
  {
    key: "deploy",
    navLabel: "部署",
    title: "应用部署与发布管理 (Deployment)",
    subtitle: "版本追踪 · 原子软链发布 · 失败自动秒级回滚 · 多端编排",
    desc: "从拉码到健康检查的完整流水线，发布即产物，回滚即换链",
    capabilities: [
      "流水线阶段视图：拉码 → 构建 → 制品 → 分发 → 软链切换 → 健康检查",
      "实时构建日志与阶段耗时",
      "制品与版本树（releases/ + current）",
      "原子软链切换与失败秒级回滚",
      "生产环境发布前强制审批",
    ],
    icon: Rocket,
    group: "core",
    implemented: true,
  },
  {
    key: "copilot",
    navLabel: "AI助手",
    title: "AI 桥接中心",
    subtitle: "Copilot & Multi-Agent",
    desc: "一套工具实现 + 一套策略，挂在 stdio sidecar / 页面内对话 / 本地 HTTP 三个通道",
    capabilities: [
      "页面内对话与工具调用",
      "多 Agent 协同编排",
      "只读工具默认放行，改动型工具受 AI 操作锁约束",
      "对话上下文自动注入技能库检索结果",
    ],
    icon: Bot,
    group: "ai",
    dot: "amber",
    implemented: true,
  },
  {
    key: "mcp",
    navLabel: "MCP接入",
    title: "MCP 接入中心 (Model Context Protocol)",
    subtitle: "Claude Code / Codex / Cursor",
    desc: "把 OpsSentry 暴露的 MCP 服务提供给 Claude Code / Codex / Cursor / OpenCode；一键注入 stdio sidecar、HTTP 暴露供外部 AI 远程调用受控运维能力",
    capabilities: [
      "MCP 端点状态与测试连接",
      "stdio sidecar 一键注入到各客户端配置",
      "本地 HTTP 暴露，仅监听 127.0.0.1",
      "按客户端粒度授权可用工具集",
    ],
    icon: PlugZap,
    group: "ai",
    implemented: true,
  },
  {
    key: "skills",
    navLabel: "技能",
    title: "技能与经验库",
    subtitle: "39 项技能 / 19 篇事故复盘 SOP",
    desc: "运维技能库与故障处置经验库，AI 自动检索命中即注入对话上下文",
    capabilities: [
      "技能条目增删改查与版本管理",
      "事故复盘 Runbook（SOP）",
      "AI 自动检索命中即注入对话上下文",
      "来源标记：内置 / 自建 / 外部导入",
    ],
    icon: Sparkles,
    group: "ai",
  },
  {
    key: "inspector",
    navLabel: "巡检",
    title: "AI 巡检与漏洞雷达",
    subtitle: "2 项高危需加固",
    desc: "定期巡检与漏洞扫描，AI 自动根因推导并给出秒级修复建议",
    capabilities: [
      "多主机批量巡检与基线核查",
      "漏洞雷达与风险分级",
      "AI 诊断出风险清单与修复建议",
      "一键生成受控审批工单",
    ],
    icon: ShieldAlert,
    group: "security",
    dot: "rose",
  },
  {
    key: "sensitive",
    navLabel: "敏感库",
    title: "敏感库",
    subtitle: "出口脱敏 / 7 条待处理拦截",
    desc: "AI 出口流量敏感信息识别与脱敏，防止凭据、密钥、内网地址外泄",
    capabilities: [
      "出站内容实时识别与拦截",
      "规则库与自定义正则",
      "待处理拦截的人工裁决",
      "拦截记录导出 CSV",
    ],
    icon: Shield,
    group: "security",
    dot: "amber",
  },
  {
    key: "credentials",
    navLabel: "服务凭据",
    title: "服务凭据",
    subtitle: "AES-256 硬件脱钩加密",
    desc: "本地隔离的凭据金库，云端零知识；云端 AI 仅使用虚拟引用句柄",
    capabilities: [
      "AES-256-GCM 信封加密",
      "Windows DPAPI / TPM 密钥保护",
      "云端零知识（Zero-Knowledge）",
      "AI 仅见虚拟引用句柄，永不见明文",
    ],
    icon: KeyRound,
    group: "security",
    implemented: true,
  },
  {
    key: "alerts",
    navLabel: "告警",
    title: "告警与通知",
    subtitle: "2 个活跃事件待处理",
    desc: "告警规则、活跃事件与通知通道，AI 自动根因推导与秒级修复建议",
    capabilities: [
      "告警规则配置（阈值 / 探针）",
      "活跃事件列表与历史趋势",
      "通知通道：桌面 / 邮件 / Webhook",
      "一键跳转终端与审计核查",
    ],
    icon: Bell,
    group: "security",
    dot: "rose-pulse",
  },
  {
    key: "security",
    navLabel: "审批",
    title: "安全闸门与操作审批中心 (Security Gates & Approval)",
    subtitle: "1 待办工单需人工裁决",
    desc: "人机协同终极安全屏障：AI 负责探查分析与起草自愈脚本，人类工程师掌握高危操作终审裁决权",
    capabilities: [
      "高危操作自动工单化",
      "人工裁决：放行 / 拒绝 / 限时放行",
      "闸门策略配置：哪些操作必须审批",
      "裁决结果写入不可篡改审计",
    ],
    icon: ShieldCheck,
    group: "security",
    dot: "amber",
  },
  {
    key: "audit",
    navLabel: "审计",
    title: "不可篡改审计日志",
    subtitle: "1374 条存证 / SHA-256 防篡改",
    desc: "全量操作存证，链式哈希防篡改，支持按主机 / 用户 / 时间多维检索",
    capabilities: [
      "链式哈希防篡改存证",
      "多维度检索与导出",
      "AI 操作与人工操作的归因区分",
      "关联跳转到对应审批工单",
    ],
    icon: ScrollText,
    group: "security",
  },
  {
    key: "settings",
    navLabel: "设置",
    title: "系统与模型配置",
    subtitle: "API Profiles / 外观 / 托盘",
    desc: "外观与交互、窗口行为、模型 Profile、代理、安全策略与备份",
    capabilities: [
      "外观与交互：主题皮肤、界面密度",
      "窗口行为：启动位置、托盘、最小化策略",
      "模型 Profile 与 API 端点管理",
      "网络代理与安全策略",
      "配置备份与恢复",
    ],
    icon: Settings,
    group: "security",
    pinned: true,
    implemented: true,
  },
];

/** 滚动区的模块（不含底部固定项） */
export const NAV_MODULES = MODULES.filter((m) => !m.pinned);

/** 底部固定区的模块 */
export const PINNED_MODULES = MODULES.filter((m) => m.pinned);

/** 按 key 查模块；查不到返回 undefined，调用方自行兜底 */
export function findModule(key: string): ModuleDef | undefined {
  return MODULES.find((m) => m.key === key);
}

/**
 * 按 key 取模块，取不到直接抛错。
 * 用于「写死 key」的场景（页面顶部标题、路由生成）——key 写错属于编程错误，
 * 越早炸越好；返回 undefined 会让标题静默变成空白，很难查。
 */
export function requireModule(key: string): ModuleDef {
  const mod = findModule(key);
  if (!mod) throw new Error(`未注册的模块 key: ${key}`);
  return mod;
}

/** 路由路径 → /servers、/terminal … */
export function modulePath(key: string): string {
  return `/${key}`;
}

/** 应用默认落地页。原型的首个导航项是「服务器资产」，首页不再是独立页面。 */
export const DEFAULT_MODULE_KEY = "servers";
