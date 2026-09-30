import { useState, useMemo } from "react";
import {
  FolderTree,
  History,
  Layers,
  Plus,
  Star,
  Pencil,
  ArrowRightLeft,
  FolderMinus,
  CornerDownRight,
  Folder,
  Compass,
  MoreVertical,
  GripVertical,
} from "lucide-react";
import { Dropdown, Modal, Input, message } from "antd";
import type { MenuProps } from "antd";
import type { Server } from "@/types";
import {
  VIRTUAL_GROUP_ALL,
  VIRTUAL_GROUP_RECENT,
  VIRTUAL_GROUP_STARRED,
} from "../lib/serverMeta";

interface ServerGroupPanelProps {
  /** 未经筛选的全部服务器，用于统计各分组数量 */
  servers: Server[];
  activeGroup: string;
  onSelectGroup: (key: string) => void;
  /** 点「+」新建分组 */
  onCreateGroup: () => void;
  /** 右键重命名分组 */
  onRenameGroup?: (oldName: string, newName: string) => Promise<void> | void;
  /** 右键解散分组 */
  onDissolveGroup?: (groupName: string) => Promise<void> | void;
  /** 右键新建子分组 */
  onCreateSubGroup?: (parentGroupName: string, subGroupName: string) => Promise<void> | void;
  /** 右键移动分组 */
  onMoveGroup?: (groupName: string, targetParent: string) => Promise<void> | void;
  /** 全量标签及计数 */
  tagStats: { tag: string; count: number }[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
}

/** 分组图标：虚拟分组固定图标，自定义分组统一用文件夹 */
function GroupIcon({ groupKey }: { groupKey: string }) {
  const size = 14;
  if (groupKey === VIRTUAL_GROUP_ALL) return <Layers size={size} />;
  if (groupKey === VIRTUAL_GROUP_STARRED) return <Star size={size} className="fill-amber-400/20" />;
  if (groupKey === VIRTUAL_GROUP_RECENT) return <History size={size} />;
  return <Folder size={size} />;
}

/** 统一的分组数量徽章组件：规范化圆角药丸胶囊、等宽字体与居中排布，彻底消除突兀感与跳动 */
function GroupCountBadge({ count, active }: { count: number; active: boolean }) {
  const isZero = count === 0;
  return (
    <span
      className={`min-w-[20px] h-[18px] px-1.5 inline-flex items-center justify-center rounded-full text-[10px] font-mono tabular-nums shrink-0 transition-all ${
        isZero ? "opacity-30" : ""
      } ${
        !active
          ? "group-hover/item:border-slate-600/70 group-hover/item:text-slate-200"
          : ""
      }`}
      style={{
        background: active
          ? "rgba(99, 102, 241, 0.22)"
          : "rgba(255, 255, 255, 0.05)",
        border: active
          ? "1px solid rgba(99, 102, 241, 0.45)"
          : "1px solid rgba(255, 255, 255, 0.08)",
        color: active ? "var(--accent-hover)" : "var(--text-muted)",
        fontWeight: active ? 600 : 500,
        boxShadow: active ? "0 0 6px rgba(99, 102, 241, 0.2)" : "none",
      }}
    >
      {count}
    </span>
  );
}

export function ServerGroupPanel({

  servers,
  activeGroup,
  onSelectGroup,
  onCreateGroup,
  onRenameGroup,
  onDissolveGroup,
  onCreateSubGroup,
  onMoveGroup,
  tagStats,
  selectedTags,
  onToggleTag,
  onClearTags,
}: ServerGroupPanelProps) {
  const [subGroupModalOpen, setSubGroupModalOpen] = useState(false);
  const [subGroupTarget, setSubGroupTarget] = useState("");
  const [subGroupName, setSubGroupName] = useState("");

  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState("");
  const [renameNewName, setRenameNewName] = useState("");

  const [dissolveModalOpen, setDissolveModalOpen] = useState(false);
  const [dissolveTarget, setDissolveTarget] = useState("");

  // 拖拽移动分组建立父子级与同级排序状态
  const [draggingGroup, setDraggingGroup] = useState<string | null>(null);
  const [dragOverInfo, setDragOverInfo] = useState<{
    targetKey: string;
    position: "before" | "after" | "inside";
  } | null>(null);
  const [dragOverRoot, setDragOverRoot] = useState(false);
  const [groupOrderVersion, setGroupOrderVersion] = useState(0);

  const handleDragStart = (e: React.DragEvent, groupKey: string) => {
    setDraggingGroup(groupKey);
    e.dataTransfer.setData("text/plain", groupKey);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOverItem = (e: React.DragEvent, targetKey: string) => {
    if (!draggingGroup || draggingGroup === targetKey) return;
    // 禁止将父级拖入其自身的子孙分组中（避免循环结构）
    if (targetKey.startsWith(`${draggingGroup}/`)) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    let pos: "before" | "after" | "inside" = "inside";
    if (ratio < 0.25) pos = "before";
    else if (ratio > 0.75) pos = "after";
    else pos = "inside";

    if (
      !dragOverInfo ||
      dragOverInfo.targetKey !== targetKey ||
      dragOverInfo.position !== pos
    ) {
      setDragOverInfo({ targetKey, position: pos });
    }
  };

  const handleDragLeaveItem = (targetKey: string) => {
    if (dragOverInfo?.targetKey === targetKey) {
      setDragOverInfo(null);
    }
  };

  const handleReorderGroup = (
    sourceKey: string,
    targetKey: string,
    pos: "before" | "after"
  ) => {
    const sourceParent = sourceKey.includes("/")
      ? sourceKey.substring(0, sourceKey.lastIndexOf("/"))
      : "root";
    const targetParent = targetKey.includes("/")
      ? targetKey.substring(0, targetKey.lastIndexOf("/"))
      : "root";

    // 若父级不同，先对其父级进行归一移动
    if (sourceParent !== targetParent) {
      void onMoveGroup?.(sourceKey, targetParent);
    }

    // 更新本地排序索引，使其持久化保持顺序
    const currentKeys = customGroups.map((g) => g.key);
    const dragIdx = currentKeys.indexOf(sourceKey);
    if (dragIdx > -1) {
      currentKeys.splice(dragIdx, 1);
      const targetIdx = currentKeys.indexOf(targetKey);
      const insertIdx = pos === "before" ? targetIdx : targetIdx + 1;
      currentKeys.splice(insertIdx, 0, sourceKey);

      try {
        localStorage.setItem("ops_server_group_order", JSON.stringify(currentKeys));
        setGroupOrderVersion((v) => v + 1);
        message.success("已调整分组显示顺序");
      } catch (_) {}
    }
  };

  const handleDropOnItem = (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    const info = dragOverInfo;
    setDragOverInfo(null);
    if (!draggingGroup || !info) return;

    if (info.position === "inside") {
      // 拖入文件夹主体内部：建立父子级关系
      if (targetKey.startsWith(`${draggingGroup}/`)) {
        message.warning("无法将分组移入其自身的子分组中");
        setDraggingGroup(null);
        return;
      }

      const currentParent = draggingGroup.includes("/")
        ? draggingGroup.substring(0, draggingGroup.lastIndexOf("/"))
        : "root";
      if (currentParent === targetKey) {
        message.info("该分组已在此目录下");
        setDraggingGroup(null);
        return;
      }

      void onMoveGroup?.(draggingGroup, targetKey);
    } else {
      // 拖入两个文件夹中间：同级重新排序 (before / after)
      handleReorderGroup(draggingGroup, targetKey, info.position);
    }

    setDraggingGroup(null);
  };

  const handleDragOverRootZone = (e: React.DragEvent) => {
    if (!draggingGroup || !draggingGroup.includes("/")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!dragOverRoot) setDragOverRoot(true);
  };

  const handleDragLeaveRootZone = () => {
    setDragOverRoot(false);
  };

  const handleDropOnRootZone = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverRoot(false);
    if (!draggingGroup || !draggingGroup.includes("/")) return;
    void onMoveGroup?.(draggingGroup, "root");
    setDraggingGroup(null);
  };

  const handleDragEnd = () => {
    setDraggingGroup(null);
    setDragOverInfo(null);
    setDragOverRoot(false);
  };

  const virtualGroups = useMemo(() => {
    return [
      {
        key: VIRTUAL_GROUP_ALL,
        label: "全部主机",
        count: servers.length,
        accent: "#818cf8",
      },
      {
        key: VIRTUAL_GROUP_STARRED,
        label: "我的收藏",
        count: servers.filter((s) => s.favorite).length,
        accent: "#fbbf24",
      },
      {
        key: VIRTUAL_GROUP_RECENT,
        label: "最近用过",
        count: servers.filter((s) => s.last_used_at).length,
        accent: "#22d3ee",
      },
    ];
  }, [servers]);

  // ★ 完整递归提取祖先与子孙分组树，确保无论父级移动到哪里其旗下子集永久保留且层级清晰
  const customGroups = useMemo(() => {
    const directCounts = new Map<string, number>();
    const allPaths = new Set<string>();

    for (const server of servers) {
      const groupPath = server.group?.trim();
      if (!groupPath) continue;

      directCounts.set(groupPath, (directCounts.get(groupPath) ?? 0) + 1);

      // 提取路径中的各级祖先，确保即使父级没有直接的主机也不会丢
      const parts = groupPath.split("/");
      let curr = "";
      for (const part of parts) {
        curr = curr ? `${curr}/${part}` : part;
        allPaths.add(curr);
      }
    }

    const groupNodes = Array.from(allPaths).map((path) => {
      const parts = path.split("/");
      const name = parts[parts.length - 1];
      const parent = parts.length > 1 ? parts.slice(0, -1).join("/") : null;
      const depth = parts.length - 1;
      const count = directCounts.get(path) ?? 0;

      return {
        key: path,
        label: path,
        displayName: name,
        parent,
        depth,
        count,
        accent: "#f59e0b",
      };
    });

    const childrenMap = new Map<string | null, typeof groupNodes>();
    for (const node of groupNodes) {
      const list = childrenMap.get(node.parent) ?? [];
      list.push(node);
      childrenMap.set(node.parent, list);
    }

    const orderMap = new Map<string, number>();
    try {
      const saved = localStorage.getItem("ops_server_group_order");
      if (saved) {
        const arr: string[] = JSON.parse(saved);
        arr.forEach((k, idx) => orderMap.set(k, idx));
      }
    } catch (_) {}

    const sortFn = (a: typeof groupNodes[0], b: typeof groupNodes[0]) => {
      const orderA = orderMap.get(a.key) ?? 9999;
      const orderB = orderMap.get(b.key) ?? 9999;
      if (orderA !== orderB) return orderA - orderB;
      return a.displayName.localeCompare(b.displayName, "zh-CN");
    };

    // 深度优先递归遍历，确保父级在上面，旗下所有子孙分组无论嵌套多深都紧密跟随并逐级缩进
    const sortedTreeList: typeof groupNodes = [];
    const traverse = (parentKey: string | null) => {
      const children = childrenMap.get(parentKey) ?? [];
      children.sort(sortFn);
      for (const child of children) {
        sortedTreeList.push(child);
        traverse(child.key);
      }
    };

    traverse(null);
    return sortedTreeList;
  }, [servers, groupOrderVersion]);

  const getContextMenuItems = (groupKey: string, groupLabel: string): MenuProps["items"] => {
    const otherGroups = customGroups.filter((g) => g.key !== groupKey);

    return [
      {
        key: "subgroup",
        icon: <Plus size={14} />,
        label: "新建子分组",
        onClick: () => {
          setSubGroupTarget(groupKey);
          setSubGroupName("");
          setSubGroupModalOpen(true);
        },
      },
      {
        key: "rename",
        icon: <Pencil size={14} />,
        label: "重命名",
        onClick: () => {
          setRenameTarget(groupKey);
          setRenameNewName(groupLabel);
          setRenameModalOpen(true);
        },
      },
      {
        key: "move",
        icon: <ArrowRightLeft size={14} />,
        label: "移动到",
        children: [
          {
            key: "move-root",
            icon: <FolderTree size={14} />,
            label: "根目录 (顶级)",
            onClick: () => void onMoveGroup?.(groupKey, "root"),
          },
          ...(otherGroups.length > 0
            ? otherGroups.map((g) => ({
                key: `move-${g.key}`,
                icon: <Folder size={14} />,
                label: g.label,
                onClick: () => void onMoveGroup?.(groupKey, g.key),
              }))
            : [
                {
                  key: "no-targets",
                  disabled: true,
                  label: "无其他分组",
                },
              ]),
        ],
      },
      { type: "divider" },
      {
        key: "dissolve",
        icon: <FolderMinus size={14} />,
        label: "解散分组",
        danger: true,
        onClick: () => {
          setDissolveTarget(groupKey);
          setDissolveModalOpen(true);
        },
      },
    ];
  };

  const handleConfirmSubGroup = () => {
    const name = subGroupName.trim();
    if (!name) {
      message.warning("请输入子分组名称");
      return;
    }
    setSubGroupModalOpen(false);
    void onCreateSubGroup?.(subGroupTarget, name);
  };

  const handleConfirmRename = () => {
    const name = renameNewName.trim();
    if (!name) {
      message.warning("请输入分组名称");
      return;
    }
    setRenameModalOpen(false);
    void onRenameGroup?.(renameTarget, name);
  };

  const handleConfirmDissolve = () => {
    setDissolveModalOpen(false);
    void onDissolveGroup?.(dissolveTarget);
  };

  return (
    <div className="glass-card ops-server-group rounded-xl p-3">
      <div
        className="flex items-center justify-between pb-2"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <span
          className="flex items-center gap-1.5 text-xs font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          <FolderTree size={14} style={{ color: "var(--accent)" }} />
          <span>服务器分组</span>
        </span>
      </div>

      <div className="ops-server-group-list custom-scrollbar space-y-1 py-2 pr-0.5">
        {/* 顶部固定分组 (系统预设视图，不可删除/不可重命名) */}
        <div className="space-y-1">
          {/* 预设视图专属标头 */}
          <div className="px-1.5 pt-0.5 pb-1 flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 font-semibold" style={{ color: "var(--text-secondary)" }}>
              <Compass size={13} style={{ color: "var(--accent)" }} />
              <span>系统视图</span>
            </span>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded font-medium"
              style={{
                background: "rgba(255, 255, 255, 0.06)",
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
              }}
              title="系统内置筛选视图，不可重命名或解散"
            >
              🔒 内置固定
            </span>
          </div>

          {virtualGroups.map((group) => {
            const active = group.key === activeGroup;
            return (
              <button
                key={group.key}
                type="button"
                onClick={() => onSelectGroup(group.key)}
                className="group/item w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition select-none cursor-pointer"
                style={{
                  background: active ? "rgba(99, 102, 241, 0.18)" : "transparent",
                  border: active ? "1px solid rgba(99, 102, 241, 0.45)" : "1px solid transparent",
                  color: active ? "var(--accent-hover)" : "var(--text-secondary)",
                  fontWeight: active ? 600 : 400,
                }}
                title="系统固定分组 (不可删除/重命名)"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span style={{ color: group.accent, display: "flex" }}>
                    <GroupIcon groupKey={group.key} />
                  </span>
                  <span className="truncate">{group.label}</span>
                </span>
                <GroupCountBadge count={group.count} active={active} />
              </button>
            );
          })}

        </div>

        {/* 醒目的分界线与自定义业务分组标题 (同时作为拖拽移至顶级根目录的释放区) */}
        <div
          onDragOver={handleDragOverRootZone}
          onDragLeave={handleDragLeaveRootZone}
          onDrop={handleDropOnRootZone}
          className={`pt-2.5 pb-1 px-1.5 flex items-center justify-between text-[11px] font-medium mt-1.5 transition-all rounded-lg ${
            dragOverRoot ? "ring-2 ring-indigo-500/70 bg-indigo-500/20 p-1.5" : ""
          }`}
          style={{ borderTop: dragOverRoot ? "none" : "1px dashed var(--border)" }}
          title={draggingGroup && draggingGroup.includes("/") ? "拖拽松开移至根目录 (顶级)" : undefined}
        >
          <span className="flex items-center gap-1.5 font-semibold" style={{ color: "var(--text-secondary)" }}>
            <Folder size={13} style={{ color: "#f59e0b" }} />
            <span>业务分组</span>
            <span className="text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>
              ({customGroups.length})
            </span>
            {dragOverRoot && (
              <span className="text-[10px] font-medium text-indigo-300 ml-1">
                ↳ 移至根目录
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={onCreateGroup}
            title="新建业务分组"
            className="group/btn inline-flex items-center gap-1 h-[20px] px-2 rounded-md text-[10px] font-medium transition-all duration-150 cursor-pointer select-none active:scale-95 hover:border-indigo-500/50 hover:bg-indigo-500/15 hover:text-indigo-300 hover:shadow-[0_0_8px_rgba(99,102,241,0.2)]"
            style={{
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.09)",
              color: "var(--text-muted)",
            }}
          >
            <Plus size={11} className="transition-transform duration-200 group-hover/btn:rotate-90 group-hover/btn:text-indigo-400" />
            <span>新建</span>
          </button>
        </div>

        {/* 自定义业务分组列表 */}
        {customGroups.length === 0 ? (
          <div
            className="py-3 px-2 text-center text-[10px] rounded-lg border border-dashed my-1"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
          >
            <span>暂无业务分组</span>
            <button
              type="button"
              onClick={onCreateGroup}
              className="mt-1 block mx-auto text-xs cursor-pointer font-medium"
              style={{ color: "var(--accent-hover)" }}
            >
              + 新建业务分组
            </button>
          </div>
        ) : (
          customGroups.map((group) => {
            const active = group.key === activeGroup;
            const menuItems = getContextMenuItems(group.key, group.label);
            const isDragging = draggingGroup === group.key;
            const isTarget = dragOverInfo?.targetKey === group.key;
            const targetPos = isTarget ? dragOverInfo?.position : null;

            const buttonNode = (
              <div
                draggable
                onDragStart={(e) => handleDragStart(e, group.key)}
                onDragOver={(e) => handleDragOverItem(e, group.key)}
                onDragLeave={() => handleDragLeaveItem(group.key)}
                onDrop={(e) => handleDropOnItem(e, group.key)}
                onDragEnd={handleDragEnd}
                onClick={() => onSelectGroup(group.key)}
                className={`group/item w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition select-none cursor-grab active:cursor-grabbing relative ${
                  group.depth > 0 ? "border-l-2" : ""
                } ${
                  targetPos === "inside"
                    ? "ring-2 ring-indigo-500 shadow-md"
                    : targetPos === "before"
                    ? "border-t-2 border-t-indigo-400"
                    : targetPos === "after"
                    ? "border-b-2 border-b-indigo-400"
                    : ""
                }`}
                style={{
                  opacity: isDragging ? 0.35 : 1,
                  paddingLeft: `${8 + group.depth * 14}px`,
                  background:
                    targetPos === "inside"
                      ? "rgba(99, 102, 241, 0.25)"
                      : targetPos === "before" || targetPos === "after"
                      ? "rgba(99, 102, 241, 0.1)"
                      : active
                      ? "rgba(99, 102, 241, 0.15)"
                      : "transparent",
                  borderLeftColor: group.depth > 0 ? "var(--border)" : undefined,
                  border:
                    targetPos === "inside"
                      ? "1px dashed #6366f1"
                      : active
                      ? "1px solid rgba(99, 102, 241, 0.4)"
                      : "1px solid transparent",
                  color: active ? "var(--accent-hover)" : "var(--text-secondary)",
                  fontWeight: active ? 600 : 400,
                }}
                title="拖到中间移入成为子分组 / 拖到上下边缘调整排序"
              >
                <span className="flex items-center gap-1 min-w-0 pr-1">
                  <span title="按住拖拽" className="inline-flex items-center cursor-grab">
                    <GripVertical
                      size={11}
                      className="opacity-0 group-hover/item:opacity-40 hover:opacity-100 shrink-0 text-slate-400 -ml-1 transition"
                    />
                  </span>
                  {group.depth > 0 ? (
                    <CornerDownRight size={12} className="opacity-60 shrink-0 text-slate-400" />
                  ) : (
                    <Folder size={13} style={{ color: "#f59e0b", flexShrink: 0 }} />
                  )}
                  <span className="truncate">{group.displayName}</span>
                  {targetPos === "inside" && (
                    <span className="text-[9px] text-indigo-300 font-medium shrink-0 ml-0.5">
                      ↳ 移入成为子分组
                    </span>
                  )}
                  {targetPos === "before" && (
                    <span className="text-[9px] text-indigo-300 font-medium shrink-0 ml-0.5">
                      ↑ 移至上方 (排序)
                    </span>
                  )}
                  {targetPos === "after" && (
                    <span className="text-[9px] text-indigo-300 font-medium shrink-0 ml-0.5">
                      ↓ 移至下方 (排序)
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1 shrink-0 ml-1">
                  <Dropdown menu={{ items: menuItems }} trigger={["click"]}>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 flex items-center justify-center rounded transition cursor-pointer opacity-0 group-hover/item:opacity-100 hover:bg-slate-700/60"
                      style={{ color: "var(--text-muted)" }}
                      title="分组管理菜单"
                    >
                      <MoreVertical size={12} />
                    </button>
                  </Dropdown>
                  <GroupCountBadge count={group.count} active={active} />
                </span>
              </div>
            );


            return (
              <Dropdown
                key={group.key}
                menu={{ items: menuItems }}
                trigger={["contextMenu"]}
              >
                <div>{buttonNode}</div>
              </Dropdown>
            );
          })
        )}
      </div>

      {/* 弹窗 1: 新建子分组 */}
      <Modal
        title="新建子分组"
        open={subGroupModalOpen}
        onOk={handleConfirmSubGroup}
        onCancel={() => setSubGroupModalOpen(false)}
        okText="确认创建"
        cancelText="取消"
        destroyOnClose
      >
        <div className="space-y-3 py-2 text-xs">
          <div>
            <span className="text-slate-400 block mb-1">所属上级分组</span>
            <div className="p-2 rounded bg-slate-800/40 border border-slate-700/50 text-indigo-300 font-medium">
              {subGroupTarget}
            </div>
          </div>
          <div>
            <span className="text-slate-400 block mb-1">子分组名称</span>
            <Input
              value={subGroupName}
              onChange={(e) => setSubGroupName(e.target.value)}
              placeholder="如: 华南节点、生产网关"
              onPressEnter={handleConfirmSubGroup}
              autoFocus
            />
          </div>
        </div>
      </Modal>

      {/* 弹窗 2: 重命名分组 */}
      <Modal
        title="重命名分组"
        open={renameModalOpen}
        onOk={handleConfirmRename}
        onCancel={() => setRenameModalOpen(false)}
        okText="确认修改"
        cancelText="取消"
        destroyOnClose
      >
        <div className="space-y-3 py-2 text-xs">
          <div>
            <span className="text-slate-400 block mb-1">原分组名称</span>
            <div className="p-2 rounded bg-slate-800/40 border border-slate-700/50 text-slate-400">
              {renameTarget}
            </div>
          </div>
          <div>
            <span className="text-slate-400 block mb-1">新分组名称</span>
            <Input
              value={renameNewName}
              onChange={(e) => setRenameNewName(e.target.value)}
              placeholder="请输入新的分组名称"
              onPressEnter={handleConfirmRename}
              autoFocus
            />
          </div>
        </div>
      </Modal>

      {/* 弹窗 3: 解散分组确认 */}
      <Modal
        title="解散分组确认"
        open={dissolveModalOpen}
        onOk={handleConfirmDissolve}
        onCancel={() => setDissolveModalOpen(false)}
        okText="确认解散"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        destroyOnClose
      >
        <div className="space-y-2 py-2 text-xs text-slate-300">
          <p>
            确认要解散分组 <strong className="text-white">【{dissolveTarget}】</strong> 吗？
          </p>
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300">
            解散分组仅移除分组层级目录，组内服务器资产将<strong>完整保留</strong>并自动归入「全部主机」，不会删除任何服务器。
          </div>
        </div>
      </Modal>

      <div className="mt-auto shrink-0 space-y-2 border-t pt-2" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between">
          <span
            className="text-[10px] font-medium uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            标签快捷过滤
          </span>
          {selectedTags.length > 0 && (
            <button
              type="button"
              onClick={onClearTags}
              className="text-[10px]"
              style={{ color: "var(--accent-hover)" }}
            >
              清空
            </button>
          )}
        </div>

        {tagStats.length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            暂无标签
          </p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {/* 只展示出现最多的前 12 个标签，全量标签交给右侧筛选下拉，
                否则左栏会被长尾标签撑得很长，把分组列表挤下去 */}
            {tagStats.slice(0, 12).map(({ tag, count }) => {
              const active = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onToggleTag(tag)}
                  title={`${count} 台主机使用该标签`}
                  className="px-2 py-0.5 rounded text-[10px] transition"
                  style={{
                    background: active
                      ? "rgba(99, 102, 241, 0.25)"
                      : "var(--bg-tertiary)",
                    color: active ? "var(--accent-hover)" : "var(--text-secondary)",
                  }}
                >
                  {tag}
                  <span className="ml-1 opacity-60">{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
