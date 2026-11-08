import { useState } from "react";
import { Button, Input, Select, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { KeyRound, Plus, Search } from "lucide-react";
import type { McpToken } from "@/types/mcp";
import {
  clientName,
  stateName,
  tokenState,
  toolScopeLabel,
} from "@/pages/mcp/shared";

export function TokenPanel({
  tokens,
  loading,
  running,
  onCreate,
  onInspect,
  onRevoke,
}: {
  tokens: McpToken[];
  loading: boolean;
  running: boolean;
  onCreate: () => void;
  onInspect: (token: McpToken, test: boolean) => void;
  onRevoke: (token: McpToken) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const rows = tokens.filter(
    (t) =>
      (filter === "all" || tokenState(t) === filter) &&
      `${t.name} ${clientName(t.client)} ${t.serverScope}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const columns: ColumnsType<McpToken> = [
    {
      title: "名称 / 授权范围",
      key: "name",
      width: "34%",
      render: (_, token) => (
        <div className="mcp-token-cell">
          <div className="mcp-token-name">
            <strong>{token.name}</strong>
            <Tag
              color={
                tokenState(token) === "active"
                  ? "success"
                  : tokenState(token) === "expired"
                    ? "warning"
                    : "default"
              }
            >
              {stateName(tokenState(token))}
            </Tag>
          </div>
          <span className="mcp-caption">
            {clientName(token.client)} ·{" "}
            {token.serverScope === "*"
              ? "全部 SSH 服务器"
              : token.serverScope.split(",").join("、")}
          </span>
        </div>
      ),
    },
    {
      title: "工具权限",
      key: "tools",
      width: "21%",
      render: (_, t) => (
        <span className="mcp-break">{toolScopeLabel(t.toolScope)}</span>
      ),
    },
    {
      title: "令牌 / 有效期",
      key: "expiry",
      width: "24%",
      render: (_, t) => (
        <div className="mcp-token-cell">
          <code>{t.tokenHint}</code>
          <span className="mcp-caption">{t.expiresAt ?? "永久有效"}</span>
        </div>
      ),
    },
    {
      title: "操作",
      key: "action",
      width: 177,
      render: (_, t) => (
        <div className="mcp-table-actions">
          <Button type="link" onClick={() => onInspect(t, false)}>
            详情
          </Button>
          <Button
            type="link"
            disabled={tokenState(t) !== "active" || !running}
            onClick={() => onInspect(t, true)}
          >
            测试
          </Button>
          <Button
            type="link"
            danger
            disabled={tokenState(t) === "revoked"}
            onClick={() => onRevoke(t)}
          >
            撤销
          </Button>
        </div>
      ),
    },
  ];
  return (
    <section className="mcp-section mcp-tokens">
      <div className="mcp-section-heading">
        <h2>
          <KeyRound size={17} className="mcp-warning" />
          Scoped Tokens <span className="mcp-heading-sub">作用域令牌</span>
        </h2>
        <span className="mcp-caption">
          {tokens.filter((t) => tokenState(t) === "active").length} 个有效 / 共{" "}
          {tokens.length} 个
        </span>
        <Button type="primary" icon={<Plus size={15} />} onClick={onCreate}>
          新建 Token
        </Button>
      </div>
      <div className="mcp-token-toolbar">
        <Input
          allowClear
          prefix={<Search size={15} />}
          placeholder="搜索名称、客户端或服务器"
          aria-label="搜索令牌"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          aria-label="令牌状态"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "全部状态" },
            { value: "active", label: "有效" },
            { value: "expired", label: "已过期" },
            { value: "revoked", label: "已撤销" },
          ]}
        />
      </div>
      <Table<McpToken>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        pagination={false}
        size="middle"
        scroll={{ x: 680 }}
        locale={{
          emptyText: tokens.length
            ? "没有匹配的令牌"
            : "暂无令牌，创建后即可配置外部 AI 客户端",
        }}
      />
    </section>
  );
}
