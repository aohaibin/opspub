import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tooltip,
  message,
  type TableProps,
} from "antd";
import {
  FileCode,
  Loader2,
  Lock,
  Monitor,
  CircleDot,
  Plus,
  ShieldCheck,
  Star,
} from "lucide-react";
import type {
  AIPolicy,
  AuthType,
  ConnectivityResult,
  OsType,
  Server,
  ServerPayload,
  SshCredentials,
} from "@/types";
import { serverApi } from "@/lib/api/server";
import { getErrorMessage } from "@/lib/api/client";
import { SshConnectModal } from "@/components/server/SshConnectModal";
import { useAppStore } from "@/store/app";
import { useSshSessionStore } from "@/store/ssh";
import { modulePath, requireModule } from "@/navigation/modules";
import { ServerGroupPanel } from "./components/ServerGroupPanel";
import {
  ServerToolbar,
  type OsFilter,
  type StatusFilter,
  type PolicyFilter,
} from "./components/ServerToolbar";
import { ServerFormModal } from "./components/ServerFormModal";
import { BatchActionBar } from "./components/BatchActionBar";
import { WindowsGuideModal } from "./components/WindowsGuideModal";
import { ImportSSHConfigModal } from "./components/ImportSSHConfigModal";
import { AiPolicyBadge } from "./components/AiPolicyBadge";
import { AiApprovalBypassPopover } from "./components/AiApprovalBypassPopover";
import { ServerRowActions } from "./components/ServerRowActions";

import {
  AI_POLICY_META,
  AI_POLICY_ORDER,
  AUTH_TYPE_LABEL,
  VIRTUAL_GROUP_ALL,
  VIRTUAL_GROUP_RECENT,
  VIRTUAL_GROUP_STARRED,
  collectTagStats,
  matchServer,
  normalizeAIPolicy,
  parseTags,
} from "./lib/serverMeta";


/** 模块元信息（标题 / 副标题 / 定位说明）取自注册表，避免与导航、占位页三处各写一份 */
const MODULE = requireModule("servers");

/** 每行的探测状态：探测中、已出结果、或尚未探测 */
type ProbeState = Record<number, ConnectivityResult | "testing">;

/** 行内标签胶囊，对齐原型（px-1.5 rounded text-[10px] bg-slate-800 border-slate-700） */
const TAG_PILL: CSSProperties = {
  padding: "1px 6px",
  borderRadius: 4,
  fontSize: 10,
  lineHeight: "16px",
  background: "var(--bg-secondary)",
  border: "1px solid var(--border)",
  color: "var(--text-secondary)",
};

/**
 * SSH 身份认证状态。
 *
 * SSH 身份状态用于凭证盾牌的悬停说明，避免把认证结果误当作网络连通状态。
 */
const SSH_STATUS_META: Record<string, { label: string; tone: string }> = {
  unknown: { label: "未验证", tone: "var(--text-muted)" },
  verified: { label: "已认证", tone: "var(--success)" },
  failed: { label: "验证失败", tone: "var(--danger)" },
  host_key_changed: { label: "指纹变化", tone: "var(--warning)" },
};

export default function ServersPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(false);
  const [probeStates, setProbeStates] = useState<ProbeState>({});

  const [keyword, setKeyword] = useState("");
  const [osFilter, setOsFilter] = useState<OsFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [policyFilter, setPolicyFilter] = useState<PolicyFilter>("all");
  const [activeGroup, setActiveGroup] = useState<string>(VIRTUAL_GROUP_ALL);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [batchPinging, setBatchPinging] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<Server | null>(null);
  const [presetGroup, setPresetGroup] = useState<string | undefined>(undefined);

  const [windowsGuideOpen, setWindowsGuideOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [sshServer, setSshServer] = useState<Server | null>(null);
  const [sshInitialCredentials, setSshInitialCredentials] = useState<SshCredentials>();

  const [groupNameOpen, setGroupNameOpen] = useState(false);
  const [pendingGroupName, setPendingGroupName] = useState("");

  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [policyModalOpen, setPolicyModalOpen] = useState(false);
  const [policyInput, setPolicyInput] = useState<AIPolicy>("approval");

  /** 左侧分组栏宽度（支持拖拽调整、双击还原 190px 以及 localStorage 持久化） */
  const [groupWidth, setGroupWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("ops_server_group_width");
      if (saved) {
        const num = parseInt(saved, 10);
        if (num >= 140 && num <= 450) return num;
      }
    } catch {}
    return 190;
  });

  const handleResizerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = groupWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    let currentW = startW;
    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      let nextW = startW + delta;
      if (nextW < 140) nextW = 140;
      if (nextW > 450) nextW = 450;
      currentW = nextW;
      setGroupWidth(nextW);
    };

    const onMouseUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      try {
        localStorage.setItem("ops_server_group_width", String(currentW));
      } catch {}
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleResizerDoubleClick = () => {
    setGroupWidth(190);
    try {
      localStorage.setItem("ops_server_group_width", "190");
    } catch {}
    message.info("已恢复分组栏默认宽度 (190px)");
  };

  const navigate = useNavigate();
  const setActiveServerId = useAppStore((s) => s.setActiveServerId);
  const setSharedCredentials = useSshSessionStore((s) => s.setCredentials);

  const loadServers = useCallback(async (): Promise<Server[]> => {
    setLoading(true);
    try {
      const data = await serverApi.list();
      setServers(data);
      // 记录可能已被批量删除，同步清掉失效的选中项，否则批量条会显示幽灵计数
      setSelectedIds((prev) => prev.filter((id) => data.some((s) => s.id === id)));
      return data;
    } catch (e) {
      message.error(getErrorMessage(e));
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadServers();
  }, [loadServers]);

  const tagStats = useMemo(() => collectTagStats(servers), [servers]);

  /** 应用分组 / 状态 / 策略 / 搜索 / 标签多重过滤，但不含系统筛选——系统计数要基于这一层统计 */
  const baseList = useMemo(() => {
    return servers.filter((server) => {
      if (activeGroup === VIRTUAL_GROUP_STARRED && !server.favorite) return false;
      if (activeGroup === VIRTUAL_GROUP_RECENT && !server.last_used_at) return false;
      if (
        activeGroup !== VIRTUAL_GROUP_ALL &&
        activeGroup !== VIRTUAL_GROUP_STARRED &&
        activeGroup !== VIRTUAL_GROUP_RECENT &&
        server.group !== activeGroup
      ) {
        return false;
      }

      // 快速状态过滤
      if (statusFilter !== "all") {
        const probe = probeStates[server.id];
        const isOnline = probe && probe !== "testing" ? probe.ok : true;
        if (statusFilter === "online" && !isOnline) return false;
        if (statusFilter === "offline" && isOnline) return false;
      }

      // 快速策略过滤 (使用 normalizeAIPolicy 双向兼容新旧策略代号)
      if (
        policyFilter !== "all" &&
        normalizeAIPolicy(server.ai_policy) !== normalizeAIPolicy(policyFilter)
      ) {
        return false;
      }


      if (selectedTags.length > 0) {
        const tags = parseTags(server.tags);
        if (!selectedTags.every((tag) => tags.includes(tag))) return false;
      }

      return matchServer(server, keyword);
    });
  }, [servers, activeGroup, selectedTags, keyword, statusFilter, policyFilter, probeStates]);

  const osCounts = useMemo<Record<OsFilter, number>>(
    () => ({
      all: baseList.length,
      linux: baseList.filter((s) => s.os_type === "linux").length,
      windows: baseList.filter((s) => s.os_type === "windows").length,
    }),
    [baseList]
  );

  const visibleServers = useMemo(() => {
    const list =
      osFilter === "all"
        ? baseList
        : baseList.filter((s) => s.os_type === osFilter);

    // 「最近用过」按最后探活时间倒序，否则这个分组看不出「最近」的含义
    if (activeGroup === VIRTUAL_GROUP_RECENT) {
      return [...list].sort((a, b) =>
        (b.last_used_at ?? "").localeCompare(a.last_used_at ?? "")
      );
    }
    return list;
  }, [baseList, osFilter, activeGroup]);

  const handleToggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const resetAllFilters = () => {
    setKeyword("");
    setOsFilter("all");
    setStatusFilter("all");
    setPolicyFilter("all");
    setSelectedTags([]);
    setActiveGroup(VIRTUAL_GROUP_ALL);
  };

  /**
   * 跳到目标模块，并把该主机写进顶栏的「当前会话」。
   * 原型是 switchHost() + switchTab()，这里对应 setActiveServerId() + 路由跳转——
   * 不同步会话的话，切过去看到的会是上一次选中的机器，在多机运维里属于危险误导。
   */
  const goModule = useCallback(
    (moduleKey: string, server: Server) => {
      setActiveServerId(server.id);
      // 将列表中明确点击的主机带入目标模块，目标页可以直接建立该主机的会话，
      // 不再跳转后让用户从服务器列表重新选择一次。
      navigate(
        modulePath(moduleKey),
        { state: { serverId: server.id } },
      );
    },
    [navigate, setActiveServerId]
  );

  const handleSave = async (payload: ServerPayload, credentials?: SshCredentials) => {
    try {
      let savedServerId: number;
      if (editingServer) {
        await serverApi.update(editingServer.id, payload);
        savedServerId = editingServer.id;
        message.success("服务器已更新");
      } else {
        savedServerId = await serverApi.add(payload);
        message.success("服务器已纳管");
      }
      setFormOpen(false);
      setEditingServer(null);
      setPresetGroup(undefined);
      const nextServers = await loadServers();
      const savedServer = nextServers.find((item) => item.id === savedServerId);
      if (credentials && savedServer) {
        // 服务器表单已经收集了认证信息，验证后交给系统凭据管理器托管。
        // 终端、SFTP 和工作台后续入口会在 Rust 侧复用它，只有凭证缺失或失效时才要求验证。
        await setSharedCredentials(savedServer.id, credentials);
      }
    } catch (e) {
      message.error(getErrorMessage(e));
    }
  };

  const handleDelete = (server: Server) => {
    Modal.confirm({
      title: "移除服务器",
      content: `确定将「${server.alias}」从资产清单中移除吗？该操作不可撤销。`,
      okText: "移除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await serverApi.delete(server.id);
          message.success("已移除");
          await loadServers();
        } catch (e) {
          message.error(getErrorMessage(e));
        }
      },
    });
  };

  const handleToggleFavorite = async (server: Server) => {
    try {
      await serverApi.setFavorite(server.id, !server.favorite);
      // 本地先改，避免整表刷新导致的闪烁；失败时 loadServers 会把状态拉回真实值
      setServers((prev) =>
        prev.map((item) =>
          item.id === server.id ? { ...item, favorite: !item.favorite } : item
        )
      );
    } catch (e) {
      message.error(getErrorMessage(e));
      await loadServers();
    }
  };

  const probeOne = useCallback(async (server: Server): Promise<boolean> => {
    setProbeStates((prev) => ({ ...prev, [server.id]: "testing" }));
    try {
      const result = await serverApi.testConnectivity(
        server.hostname,
        server.port,
        server.id
      );
      setProbeStates((prev) => ({ ...prev, [server.id]: result }));
      return result.ok;
    } catch (e) {
      setProbeStates((prev) => ({
        ...prev,
        [server.id]: { ok: false, latency_ms: null, message: getErrorMessage(e) },
      }));
      return false;
    }
  }, []);

  const handleProbe = async (server: Server) => {
    const ok = await probeOne(server);
    // 探活成功会在后端刷新「最近用过」，重新拉一次列表让左栏计数同步，
    // 比在前端手工拼时间戳更可靠（本地时钟与数据库时钟可能不一致）
    if (ok) {
      await loadServers();
    }
  };

  const handleBatchPing = async () => {
    const targets = servers.filter((s) => selectedIds.includes(s.id));
    if (targets.length === 0) return;

    setBatchPinging(true);
    // 并发探测：单台最长阻塞 3 秒，串行探测 20 台要等一分钟，体验无法接受
    const results = await Promise.all(targets.map((server) => probeOne(server)));
    setBatchPinging(false);

    const okCount = results.filter(Boolean).length;
    const failCount = results.length - okCount;
    if (failCount === 0) {
      message.success(`${okCount} 台主机全部连通`);
    } else {
      message.warning(`${okCount} 台连通，${failCount} 台不可达，详见各行状态`);
    }

    if (okCount > 0) {
      await loadServers();
    }
  };

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return;
    const aliases = servers
      .filter((s) => selectedIds.includes(s.id))
      .map((s) => s.alias);

    Modal.confirm({
      title: "批量移除服务器",
      width: 520,
      content: (
        <div className="text-xs space-y-2">
          <p>以下 {aliases.length} 台服务器将从资产清单中移除，该操作不可撤销：</p>
          <div
            className="max-h-40 overflow-y-auto custom-scrollbar p-2 rounded"
            style={{ background: "var(--bg-secondary)" }}
          >
            {aliases.map((alias) => (
              <div key={alias} style={{ fontFamily: "var(--font-mono)" }}>
                {alias}
              </div>
            ))}
          </div>
        </div>
      ),
      okText: "全部移除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          const removed = await serverApi.batchDelete(selectedIds);
          message.success(`已移除 ${removed} 台`);
          setSelectedIds([]);
          await loadServers();
        } catch (e) {
          message.error(getErrorMessage(e));
        }
      },
    });
  };

  const handleBatchTag = async () => {
    const tags = tagInput
      .split(/[,，、]/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length === 0) {
      message.warning("请填写至少一个标签");
      return;
    }

    try {
      const handled = await serverApi.batchAddTags(selectedIds, tags);
      message.success(`已为 ${handled} 台主机追加标签`);
      setTagModalOpen(false);
      setTagInput("");
      setSelectedIds([]);
      await loadServers();
    } catch (e) {
      message.error(getErrorMessage(e));
    }
  };

  const handleBatchPolicy = async () => {
    try {
      const handled = await serverApi.batchUpdatePolicy(selectedIds, policyInput);
      message.success(`已将 ${handled} 台主机的 AI 策略调整为「${AI_POLICY_META[policyInput].label}」`);
      setPolicyModalOpen(false);
      setSelectedIds([]);
      await loadServers();
    } catch (e) {
      message.error(getErrorMessage(e));
    }
  };

  /** 行内调整单台 AI 策略：复用批量接口只传一个 id，避免为单条再开一个命令 */
  const handleInlinePolicyChange = async (server: Server, policy: AIPolicy) => {
    try {
      await serverApi.batchUpdatePolicy([server.id], policy);
      setServers((prev) =>
        prev.map((item) =>
          item.id === server.id ? { ...item, ai_policy: policy } : item
        )
      );
      message.success(`「${server.alias}」策略已调整为 ${AI_POLICY_META[policy].label}`);
    } catch (e) {
      message.error(getErrorMessage(e));
      await loadServers();
    }
  };

  const handleCreateGroup = () => {
    setPendingGroupName("");
    setGroupNameOpen(true);
  };

  const confirmCreateGroup = () => {
    const name = pendingGroupName.trim();
    if (!name) {
      message.warning("请填写分组名称");
      return;
    }
    setGroupNameOpen(false);
    // 分组随主机存在：直接带进新增表单，避免留下一个点进去空无一物的分组
    setEditingServer(null);
    setPresetGroup(name);
    setFormOpen(true);
  };

  const handleCreateSubGroup = (parentGroupName: string, subGroupName: string) => {
    const fullName = `${parentGroupName}/${subGroupName}`;
    setEditingServer(null);
    setPresetGroup(fullName);
    setFormOpen(true);
  };

  const toServerGroupPayload = (s: Server, newGroup: string): ServerPayload => ({
    alias: s.alias,
    hostname: s.hostname,
    port: s.port,
    username: s.username,
    auth_type: (s.auth_type === "key" ? "key" : "password") as AuthType,
    group: newGroup,
    tags: s.tags,
    os_type: (s.os_type === "windows" ? "windows" : "linux") as OsType,
    ai_policy: (s.ai_policy as AIPolicy) || "approval",
    arch: s.arch,
    allow_sudo: s.allow_sudo,
    use_local_proxy: s.use_local_proxy,
    bastion_id: s.bastion_id,
    ai_username: s.ai_username,
  });

  const handleRenameGroup = async (oldName: string, newName: string) => {
    const targets = servers.filter((s) => s.group === oldName);
    if (targets.length === 0) return;
    try {
      for (const s of targets) {
        await serverApi.update(s.id, toServerGroupPayload(s, newName));
      }
      message.success(`已将分组【${oldName}】重命名为【${newName}】`);
      if (activeGroup === oldName) {
        setActiveGroup(newName);
      }
      await loadServers();
    } catch (e) {
      message.error(getErrorMessage(e));
    }
  };

  const handleDissolveGroup = async (groupName: string) => {
    const targets = servers.filter((s) => s.group === groupName);
    try {
      for (const s of targets) {
        await serverApi.update(s.id, toServerGroupPayload(s, ""));
      }
      message.success(`分组【${groupName}】已解散，${targets.length} 台主机已归入全部主机`);
      if (activeGroup === groupName) {
        setActiveGroup(VIRTUAL_GROUP_ALL);
      }
      await loadServers();
    } catch (e) {
      message.error(getErrorMessage(e));
    }
  };

  const handleMoveGroup = async (groupName: string, targetParent: string) => {
    const simpleName = groupName.includes("/") ? groupName.split("/").pop()! : groupName;
    const newGroupName = targetParent === "root" ? simpleName : `${targetParent}/${simpleName}`;
    if (newGroupName === groupName) return;
    // 递归匹配该分组自身及旗下所有子分组
    const targets = servers.filter(
      (s) => s.group === groupName || (s.group && s.group.startsWith(`${groupName}/`))
    );
    try {
      for (const s of targets) {
        const updatedGroup = s.group === groupName
          ? newGroupName
          : s.group!.replace(`${groupName}/`, `${newGroupName}/`);
        await serverApi.update(s.id, toServerGroupPayload(s, updatedGroup));
      }
      message.success(
        targetParent === "root"
          ? `已将分组【${simpleName}】移至根目录 (顶级)`
          : `已将分组【${simpleName}】移入【${targetParent}】作为子分组`
      );
      if (activeGroup === groupName) {
        setActiveGroup(newGroupName);
      } else if (activeGroup.startsWith(`${groupName}/`)) {
        setActiveGroup(activeGroup.replace(`${groupName}/`, `${newGroupName}/`));
      }
      await loadServers();
    } catch (e) {
      message.error(getErrorMessage(e));
    }
  };

  const groupOptions = useMemo(
    () => Array.from(new Set(servers.map((server) => server.group).filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-CN")),
    [servers]
  );

  const handleInlineGroupChange = async (server: Server, group: string) => {
    if (group === server.group) return;
    try {
      await serverApi.update(server.id, toServerGroupPayload(server, group));
      await loadServers();
      message.success(`已将「${server.alias}」移动到${group || "全部主机"}`);
    } catch (e) {
      message.error(getErrorMessage(e));
    }
  };

  /** 原型字段：别名/主机、分组、AI 策略、凭证、状态、操作。 */
  const columns: TableProps<Server>["columns"] = [
    {
      title: "别名 / 主机",
      key: "alias",
      width: 220,
      sorter: (a, b) => a.alias.localeCompare(b.alias, "zh-CN"),
      render: (_: unknown, server: Server) => {
        const tags = parseTags(server.tags);
        const isWindows = server.os_type === "windows";

        return (
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="ops-server-os-badge"
              data-os={server.os_type}
              title={`${isWindows ? "Windows" : "Linux"} 主机`}
            >
              {isWindows ? <Monitor size={15} /> : <CircleDot size={15} />}
            </span>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-bold" style={{ color: "var(--text-primary)" }}>
                <span
                  className="truncate cursor-pointer hover:underline text-xs"
                  onClick={() => goModule("workbench", server)}
                  title="点击进入工作台"
                >
                  {server.alias}
                </span>
                <Lock size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleToggleFavorite(server);
                  }}
                  title={server.favorite ? "取消收藏" : "加入收藏"}
                  className="inline-flex items-center justify-center"
                  style={{ color: server.favorite ? "var(--warning)" : "var(--text-muted)" }}
                >
                  <Star size={13} fill={server.favorite ? "currentColor" : "none"} />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                <span className="ops-server-host-label">
                  {server.username}@{server.hostname}:{server.port}
                </span>
                {tags.map((tag) => (
                  <span key={tag} style={TAG_PILL}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      title: "分组",
      key: "group",
      width: 120,
      render: (_: unknown, server: Server) => {
        return (
          <select
            value={server.group || ""}
            onChange={(event) => void handleInlineGroupChange(server, event.target.value)}
            className="ops-server-group-select"
            aria-label={`${server.alias}所属分组`}
            title="点击更改所属分组"
          >
            <option value="">全部主机</option>
            {groupOptions.map((group) => (
              <option key={group} value={group}>{group}</option>
            ))}
          </select>
        );
      },
    },
    {
      title: "AI 策略",
      key: "ai_policy",
      width: 130,
      sorter: (a, b) => (a.ai_policy || "").localeCompare(b.ai_policy || ""),
      render: (_: unknown, server: Server) => (
        <div className="flex items-center gap-1.5">
          <AiPolicyBadge
            policy={server.ai_policy as AIPolicy}
            onChange={(policy) => handleInlinePolicyChange(server, policy)}
          />
          <AiApprovalBypassPopover server={server} />
        </div>
      ),
    },
    {
      title: <ShieldCheck size={14} className="mx-auto" />,
      key: "credentials",
      width: 48,
      align: "center",
      render: (_: unknown, server: Server) => {
        const meta = SSH_STATUS_META[server.last_connection_status] ?? SSH_STATUS_META.unknown;
        return (
          <Tooltip title={`${AUTH_TYPE_LABEL[server.auth_type as AuthType] ?? server.auth_type} · ${meta.label}`}>
            <button
              type="button"
              onClick={() => setSshServer(server)}
              className="ops-server-credential-icon"
              aria-label="凭证安全与主密钥托管"
            >
              <ShieldCheck size={15} />
            </button>
          </Tooltip>
        );
      },
    },
    {
      title: "状态",
      key: "status",
      width: 112,
      sorter: (a, b) => a.hostname.localeCompare(b.hostname),
      render: (_: unknown, server: Server) => {
        const state = probeStates[server.id];
        const probing = state === "testing";
        const result = state && state !== "testing" ? state : null;
        const tone = probing
          ? "var(--warning)"
          : result
            ? result.ok ? "var(--success)" : "var(--danger)"
            : "var(--text-muted)";
        return (
          <button
            type="button"
            onClick={() => void handleProbe(server)}
            disabled={probing}
            className="ops-server-status"
            style={{ color: tone }}
            title={result?.message || "点击查看连通性与握手诊断报告"}
          >
            {probing
              ? <Loader2 size={11} className="animate-spin" />
              : <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone }} />}
            <span>{probing ? "探测中" : result ? result.ok ? `${result.latency_ms ?? "--"} ms` : "不可达" : "未探测"}</span>
          </button>
        );
      },
    },
    {
      title: "操作",
      key: "action",
      width: 280,
      fixed: "right",
      render: (_: unknown, server: Server) => (
        <ServerRowActions
          server={server}
          probing={probeStates[server.id] === "testing"}
          onConnect={(item) => goModule("terminal", item)}
          onOpenSftp={(item) => goModule("sftp", item)}
          onOpenWorkbench={(item) => goModule("workbench", item)}
          onProbe={handleProbe}
          onOpenTunnel={(item) => message.info(`「${item.alias}」的快速操作面板正在建设中`)}
          onOpenCredentials={(item) => goModule("database", item)}
          onEdit={(item) => {
            setEditingServer(item);
            setPresetGroup(undefined);
            setFormOpen(true);
          }}
          onDelete={handleDelete}
        />
      ),
    },
  ];

  return (
    <div className="ops-page ops-server-page">
      <div className="ops-page-head">
        <div style={{ minWidth: 0 }}>
          {/* 标题与说明取自模块注册表，保证与左侧导航的 tooltip、占位页文案三处一致 */}
          <h1 className="ops-page-title">
            <span>{MODULE.title}</span>
            <span className="ops-page-subtitle">（{MODULE.subtitle}）</span>
          </h1>
          <p className="ops-page-desc">{MODULE.desc}</p>
        </div>

        <Space className="ops-server-actions" size={8}>
          {/* 三个按钮与原型头部严格一致。原型头部没有「刷新」——
              列表在进入页面、增删改、切换分组后都会自动重载，手动刷新属于冗余入口。 */}
          <Button
            icon={<Monitor size={14} />}
            onClick={() => setWindowsGuideOpen(true)}
            style={{
              background: "color-mix(in srgb, var(--info) 20%, transparent)",
              color: "var(--info)",
              borderColor: "color-mix(in srgb, var(--info) 40%, transparent)",
            }}
          >
            Windows 接入
          </Button>
          <Button
            icon={<FileCode size={14} />}
            onClick={() => setImportOpen(true)}
          >
            导入 ~/.ssh/config
          </Button>
          <Button
            type="primary"
            icon={<Plus size={14} />}
            onClick={() => {
              setEditingServer(null);
              setPresetGroup(undefined);
              setFormOpen(true);
            }}
          >
            新增服务器
          </Button>
        </Space>
      </div>

      <div
        className="ops-server-main"
        style={{
          display: "flex",
          gap: 6,
          alignItems: "stretch",
        }}
      >
        <div className="ops-server-group-slot" style={{ width: groupWidth, flexShrink: 0, minWidth: 140, maxWidth: 450 }}>
          <ServerGroupPanel
            servers={servers}
            activeGroup={activeGroup}
            onSelectGroup={setActiveGroup}
            onCreateGroup={handleCreateGroup}
            onRenameGroup={handleRenameGroup}
            onDissolveGroup={handleDissolveGroup}
            onCreateSubGroup={handleCreateSubGroup}
            onMoveGroup={handleMoveGroup}
            tagStats={tagStats}
            selectedTags={selectedTags}
            onToggleTag={handleToggleTag}
            onClearTags={() => setSelectedTags([])}
          />
        </div>

        {/* 垂直宽度拖拽分割条 */}
        <div
          onMouseDown={handleResizerMouseDown}
          onDoubleClick={handleResizerDoubleClick}
          className="ops-server-resizer"
          title="按住左右拖拽调整宽度，双击恢复默认 (190px)"
        >
          <div className="ops-server-resizer-handle" />
        </div>

        <div className="ops-panel ops-server-table-panel" style={{ flex: "1 1 0%", minWidth: 0 }}>
          <ServerToolbar
            keyword={keyword}
            onKeywordChange={setKeyword}
            osFilter={osFilter}
            onOsFilterChange={setOsFilter}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            policyFilter={policyFilter}
            onPolicyFilterChange={setPolicyFilter}
            osCounts={osCounts}
            tagStats={tagStats}
            selectedTags={selectedTags}
            onToggleTag={handleToggleTag}
            onResetTags={() => setSelectedTags([])}
          />

          <Table<Server>
              className="ops-table"
              columns={columns}
              dataSource={visibleServers}
              rowKey="id"
              loading={loading}
              size="middle"
              pagination={false}
              scroll={{ x: "max-content" }}
              rowSelection={{
                columnWidth: 42,
                selectedRowKeys: selectedIds,
                onChange: (keys) => setSelectedIds(keys as number[]),
              }}
              locale={{
                emptyText:
                  servers.length === 0
                    ? "还没有纳管任何服务器，点击右上角「新增服务器」开始"
                    : (
                      <div className="py-6 space-y-2">
                        <p style={{ color: "var(--text-muted)" }}>
                          没有匹配当前过滤条件的服务器
                        </p>
                        <Button type="link" size="small" onClick={resetAllFilters}>
                          重置所有过滤条件
                        </Button>
                      </div>
                    ),
              }}
            />

          <BatchActionBar
            count={selectedIds.length}
            pinging={batchPinging}
            onBatchPing={handleBatchPing}
            onOpenTagModal={() => {
              setTagInput("");
              setTagModalOpen(true);
            }}
            onOpenPolicyModal={() => {
              setPolicyInput("approval");
              setPolicyModalOpen(true);
            }}
            onBatchExecute={() => navigate(modulePath("batch"))}
            onBatchDelete={handleBatchDelete}
            onClear={() => setSelectedIds([])}
          />
        </div>
      </div>

      <ServerFormModal
        open={formOpen}
        server={editingServer}
        presetGroup={presetGroup}
        existingServers={servers}
        onCancel={() => {
          setFormOpen(false);
          setEditingServer(null);
          setPresetGroup(undefined);
        }}
        onSubmit={handleSave}
        onOpenWindowsGuide={() => setWindowsGuideOpen(true)}
      />

      <WindowsGuideModal
        open={windowsGuideOpen}
        onCancel={() => setWindowsGuideOpen(false)}
      />

      <ImportSSHConfigModal
        open={importOpen}
        existingAliases={servers.map((s) => s.alias)}
        onCancel={() => setImportOpen(false)}
        onImported={() => void loadServers()}
      />

      <SshConnectModal
        open={sshServer !== null}
        server={sshServer}
        initialCredentials={sshInitialCredentials}
        onCancel={() => {
          setSshServer(null);
          setSshInitialCredentials(undefined);
        }}
        onVerified={async (_result, credentials) => {
          if (sshServer) {
            await setSharedCredentials(sshServer.id, credentials);
          }
          await loadServers();
        }}
        onStatusChanged={async () => {
          await loadServers();
        }}
      />

      <Modal
        open={groupNameOpen}
        title="新建分组"
        onCancel={() => setGroupNameOpen(false)}
        onOk={confirmCreateGroup}
        okText="下一步"
        cancelText="取消"
        width={420}
      >
        <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
          分组随主机一起创建。填好名称后会直接打开新增服务器表单，保存后分组即出现在左侧列表。
        </p>
        <Input
          value={pendingGroupName}
          onChange={(e) => setPendingGroupName(e.target.value)}
          onPressEnter={confirmCreateGroup}
          placeholder="如：生产集群"
        />
      </Modal>

      <Modal
        open={tagModalOpen}
        title={`批量为 ${selectedIds.length} 台主机追加标签`}
        onCancel={() => setTagModalOpen(false)}
        onOk={handleBatchTag}
        okText="追加"
        cancelText="取消"
        width={460}
      >
        <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
          标签与已有标签取并集，不会覆盖原有标签。多个标签用逗号分隔。
        </p>
        <Input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onPressEnter={handleBatchTag}
          placeholder="如：生产环境, 华东一区"
        />
      </Modal>

      <Modal
        open={policyModalOpen}
        title={`批量调整 ${selectedIds.length} 台主机的 AI 策略`}
        onCancel={() => setPolicyModalOpen(false)}
        onOk={handleBatchPolicy}
        okText="应用"
        cancelText="取消"
        width={460}
      >
        <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
          策略决定 AI 在这些主机上的执行权限，会直接影响审批闸门的放行判定。
        </p>
        <Select
          value={policyInput}
          onChange={(value) => setPolicyInput(value as AIPolicy)}
          style={{ width: "100%" }}
          options={AI_POLICY_ORDER.map((policy) => ({
            value: policy,
            label: `${AI_POLICY_META[policy].label} — ${AI_POLICY_META[policy].hint}`,
          }))}
        />
      </Modal>
    </div>
  );
}
