import { useMemo, useState } from "react";
import { Button, Checkbox, Empty, Input, Spin } from "antd";
import { ChevronDown, Search, Star } from "lucide-react";
import { parseTags } from "@/pages/servers/lib/serverMeta";
import type { Server } from "@/types";

interface Props {
  servers: Server[];
  selectedIds: number[];
  onSelection: (ids: number[]) => void;
  disabled: boolean;
  loading: boolean;
  favoriteLoadingIds: number[];
  onFavorite: (server: Server) => void;
}

export function BatchHosts({ servers, selectedIds, onSelection, disabled, loading, favoriteLoadingIds, onFavorite }: Props) {
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const linux = servers.filter((server) => server.os_type === "linux");
  const visible = linux.filter((server) => [server.alias, server.hostname, server.group, ...parseTags(server.tags)].join(" ").toLowerCase().includes(filter.trim().toLowerCase()));
  const groups = useMemo(() => {
    const map = new Map<string, Server[]>();
    for (const server of visible) {
      const group = server.group || "我的服务器";
      map.set(group, [...(map.get(group) ?? []), server]);
    }
    return [...map];
  }, [visible]);
  const selected = visible.filter((server) => selectedIds.includes(server.id));
  const toggle = (items: Server[], checked: boolean) => {
    const ids = items.map((item) => item.id);
    onSelection(checked ? [...new Set([...selectedIds, ...ids])] : selectedIds.filter((id) => !ids.includes(id)));
  };

  return <aside className="batch-panel batch-hosts">
    <Input prefix={<Search size={15} />} allowClear value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="搜别名 / 主机 / 标签..." aria-label="搜索批量执行服务器" />
    <div className="batch-selection-bar">
      <Checkbox disabled={disabled || !visible.length} checked={visible.length > 0 && selected.length === visible.length} indeterminate={selected.length > 0 && selected.length < visible.length} onChange={(event) => toggle(visible, event.target.checked)}>全选</Checkbox>
      <span>{linux.filter((server) => selectedIds.includes(server.id)).length}/{linux.length}</span>
    </div>
    <div className="batch-host-list custom-scrollbar">
      {loading ? <div className="batch-loading"><Spin /></div> : !visible.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的 Linux 主机" /> : groups.map(([group, items]) => {
        const count = items.filter((server) => selectedIds.includes(server.id)).length;
        const closed = collapsed.includes(group);
        return <section key={group}>
          <div className="batch-group-heading">
            <button type="button" onClick={() => setCollapsed((current) => closed ? current.filter((item) => item !== group) : [...current, group])} aria-expanded={!closed}>
              <ChevronDown size={15} style={{ transform: closed ? "rotate(-90deg)" : undefined }} /><span className="batch-group-dot" /><span className="truncate">{group}</span>
            </button>
            <Checkbox disabled={disabled} aria-label={`选择分组 ${group}`} checked={count === items.length} indeterminate={count > 0 && count < items.length} onChange={(event) => toggle(items, event.target.checked)}>{count}/{items.length}</Checkbox>
          </div>
          {!closed && <div className="batch-group-servers">{items.map((server) => <div key={server.id} className={`batch-host ${selectedIds.includes(server.id) ? "is-selected" : ""}`}>
            <Checkbox disabled={disabled} checked={selectedIds.includes(server.id)} onChange={(event) => toggle([server], event.target.checked)}>
              <span className="batch-host-name">{server.alias}</span>
              <span className="batch-host-address">{server.username}@{server.hostname}:{server.port}</span>
            </Checkbox>
            <Button type="text" size="small" title={server.favorite ? "取消收藏服务器" : "收藏服务器"} aria-label={`${server.favorite ? "取消收藏" : "收藏"} ${server.alias}`} disabled={favoriteLoadingIds.includes(server.id)} icon={<Star size={15} fill={server.favorite ? "currentColor" : "none"} style={{ color: server.favorite ? "var(--warning)" : "var(--text-muted)" }} />} onClick={() => onFavorite(server)} />
          </div>)}</div>}
        </section>;
      })}
    </div>
    {servers.some((server) => server.os_type === "windows") && <p className="batch-host-note">此执行器支持 Linux SSH 主机，Windows 主机暂不列出。</p>}
  </aside>;
}
