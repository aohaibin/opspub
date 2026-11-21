import { useState } from "react";
import { Alert, Button, Checkbox, Empty, Input, Spin } from "antd";
import { ChevronDown, Search, Star } from "lucide-react";
import { parseTags } from "@/pages/servers/lib/serverMeta";
import type { Server } from "@/types";

interface Props {
  servers: Server[];
  selectedIds: number[];
  onSelection: (ids: number[]) => void;
  disabled: boolean;
  loading: boolean;
  error: string;
  onReload: () => void;
  unavailableCount: number;
  excludedCount: number;
  favoriteLoadingIds: number[];
  onFavorite: (server: Server) => void;
}

export function BatchHosts({
  servers, selectedIds, onSelection, disabled, loading, error, onReload,
  unavailableCount, excludedCount, favoriteLoadingIds, onFavorite,
}: Props) {
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const search = filter.trim().toLowerCase();
  const visible = servers.filter((server) =>
    [server.alias, server.hostname, server.group, ...parseTags(server.tags)].join(" ").toLowerCase().includes(search),
  );
  const groups = new Map<string, Server[]>();
  for (const server of visible) {
    const group = server.group || "我的服务器";
    const members = groups.get(group);
    if (members) members.push(server);
    else groups.set(group, [server]);
  }
  const selected = new Set(selectedIds);
  const visibleSelectedCount = visible.filter((server) => selected.has(server.id)).length;
  const toggle = (items: Server[], checked: boolean) => {
    const ids = new Set(items.map((item) => item.id));
    // 搜索和分组全选只更新当前范围，保留其他范围已勾选的目标。
    onSelection(checked ? [...new Set([...selectedIds, ...ids])] : selectedIds.filter((id) => !ids.has(id)));
  };

  return <aside className="batch-panel batch-hosts" aria-label="目标服务器">
    <Input prefix={<Search size={15} />} allowClear value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="搜别名 / 主机 / 分组 / 标签" aria-label="搜索批量执行服务器" />
    <div className="batch-selection-bar">
      <Checkbox disabled={disabled || !visible.length} checked={visible.length > 0 && visibleSelectedCount === visible.length} indeterminate={visibleSelectedCount > 0 && visibleSelectedCount < visible.length} onChange={(event) => toggle(visible, event.target.checked)}>{search ? "全选搜索结果" : "全选"}</Checkbox>
      <span aria-live="polite">已选 {servers.filter((server) => selected.has(server.id)).length}/{servers.length}</span>
    </div>
    <div className="batch-host-list custom-scrollbar" aria-busy={loading}>
      {loading ? <div className="batch-loading" role="status"><Spin /> 正在加载服务器</div> : error ? (
        <Alert type="error" showIcon title="服务器加载失败" description={error} action={<Button size="small" onClick={onReload}>重试</Button>} />
      ) : !visible.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={servers.length ? "没有匹配的服务器" : "没有可用于批量执行的 Linux SSH 主机"} /> : Array.from(groups, ([group, items]) => {
        const count = items.filter((server) => selected.has(server.id)).length;
        const closed = collapsed.includes(group);
        return <section key={group}>
          <div className="batch-group-heading">
            <button type="button" onClick={() => setCollapsed((current) => closed ? current.filter((item) => item !== group) : [...current, group])} aria-expanded={!closed}>
              <ChevronDown size={15} style={{ transform: closed ? "rotate(-90deg)" : undefined }} /><span className="batch-group-dot" /><span className="truncate">{group}</span>
            </button>
            <Checkbox disabled={disabled} aria-label={`选择分组 ${group}`} checked={count === items.length} indeterminate={count > 0 && count < items.length} onChange={(event) => toggle(items, event.target.checked)}>{count}/{items.length}</Checkbox>
          </div>
          {!closed && <div className="batch-group-servers">{items.map((server) => <div key={server.id} className={`batch-host ${selected.has(server.id) ? "is-selected" : ""}`}>
            <Checkbox disabled={disabled} checked={selected.has(server.id)} onChange={(event) => toggle([server], event.target.checked)}>
              <span className="batch-host-name">{server.alias}</span>
              <span className="batch-host-address">{server.username}@{server.hostname}:{server.port}</span>
            </Checkbox>
            <Button type="text" size="small" title={server.favorite ? "取消收藏服务器" : "收藏服务器"} aria-label={`${server.favorite ? "取消收藏" : "收藏"} ${server.alias}`} disabled={favoriteLoadingIds.includes(server.id)} icon={<Star size={15} fill={server.favorite ? "currentColor" : "none"} style={{ color: server.favorite ? "var(--warning)" : "var(--text-muted)" }} />} onClick={() => onFavorite(server)} />
          </div>)}</div>}
        </section>;
      })}
    </div>
    {!loading && !error && (unavailableCount > 0 || excludedCount > 0) && <p className="batch-host-note" role="status">
      {unavailableCount > 0
        ? `${unavailableCount} 台预选主机已移除或不支持批量执行。`
        : "此执行器支持 Linux SSH 主机。"}
    </p>}
  </aside>;
}
