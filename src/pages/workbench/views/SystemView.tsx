import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Spin, Table, Tag, Tooltip, message } from "antd";
import { RotateCw, Square } from "lucide-react";
import { getErrorMessage } from "@/lib/api/client";
import { useWorkbenchRuntime } from "@/pages/workbench/context";
import type { SystemServiceItem } from "@/pages/workbench/types";

const tools = {
  system: { label: "系统服务", command: "systemctl list-units --type=service --all --no-legend --no-pager" },
  processes: { label: "实时进程", command: "ps -eo pid,user,pcpu,pmem,args --no-headers | head -n 100" },
  ports: { label: "网络监听端口", command: "ss -tulpn" },
  firewall: { label: "防火墙", command: "ufw status 2>/dev/null | tail -n +4" },
};
type SystemTab = keyof typeof tools;

interface ProcessRow { pid: string; user: string; cpu: string; mem: string; command: string }
interface FirewallRow { id: number; port: string; action: string; from: string }

function parseService(line: string): SystemServiceItem {
  // systemctl 用圆点标记失败单元，移除标记后再读取列。
  const [, unit = "", state, desc = ""] = line.trim().match(/^(?:●\s+)?(\S+)\s+\S+\s+(\S+)\s+\S+(?:\s+(.*))?$/) ?? [];
  return {
    name: unit.replace(/\.service$/, ""),
    desc,
    status: state === "active" ? "active" : state === "failed" ? "failed" : "inactive",
    enabled: false,
    type: "systemd",
  };
}

const processColumns = [
  { title: "PID", dataIndex: "pid" },
  { title: "USER", dataIndex: "user" },
  { title: "%CPU", dataIndex: "cpu" },
  { title: "%MEM", dataIndex: "mem" },
  { title: "COMMAND", dataIndex: "command" },
];
const firewallColumns = [
  { title: "规则", dataIndex: "port" },
  { title: "动作", dataIndex: "action", render: (value: string) => <Tag color="success">{value}</Tag> },
  { title: "来源", dataIndex: "from" },
];

export function SystemView({ tab, onSelectTab }: { tab: SystemTab; onSelectTab: (tab: SystemTab) => void }) {
  const { server, runCommand } = useWorkbenchRuntime();
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unsupported = server?.os_type === "windows";

  const refresh = useCallback(async () => {
    if (unsupported) return;
    setLoading(true);
    setError(null);
    try {
      const { stdout, stderr, exitCode } = await runCommand(tools[tab].command);
      if (exitCode !== 0) throw new Error(stderr || `${tools[tab].label}查询失败`);
      setOutput(stdout);
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [runCommand, tab, unsupported]);
  useEffect(() => { void refresh(); }, [refresh]);

  const serviceAction = async (name: string, action: "restart" | "stop") => {
    try {
      const result = await runCommand(`systemctl ${action} -- ${name}`);
      if (result.exitCode !== 0) throw new Error(result.stderr || "服务操作失败");
      message.success("服务操作成功");
      await refresh();
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };
  const serviceColumns = [
    { title: "服务名称", dataIndex: "name" },
    { title: "描述", dataIndex: "desc" },
    {
      title: "状态", dataIndex: "status",
      render: (value: SystemServiceItem["status"]) => <Tag color={value === "active" ? "success" : value === "failed" ? "error" : "default"}>{value}</Tag>,
    },
    {
      title: "操作", key: "action", width: 110,
      render: (_: unknown, item: SystemServiceItem) => (
        <div className="flex justify-end">
          <Tooltip title="重启"><Button aria-label="重启服务" size="small" type="text" icon={<RotateCw size={13} />} onClick={() => void serviceAction(item.name, "restart")} /></Tooltip>
          <Tooltip title="停止"><Button aria-label="停止服务" size="small" type="text" icon={<Square size={13} />} onClick={() => void serviceAction(item.name, "stop")} /></Tooltip>
        </div>
      ),
    },
  ];
  const lines = output.split(/\r?\n/).filter((line) => line.trim());

  function renderResults() {
    if (unsupported) return <Alert type="info" showIcon message="这些系统工具适用于 Linux。Windows 主机可使用工作台终端。" />;
    switch (tab) {
      case "system":
        return <Table rowKey="name" size="small" columns={serviceColumns} dataSource={lines.map(parseService)} loading={loading} pagination={false} className="ops-table text-xs" />;
      case "processes":
        return <Table<ProcessRow> rowKey="pid" size="small" columns={processColumns} loading={loading} pagination={false} className="ops-table text-xs"
          dataSource={lines.map((line) => {
            const [, pid = "", user = "", cpu = "", mem = "", command = ""] = line.trim().match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/) ?? [];
            return { pid, user, cpu, mem, command };
          })}
        />;
      case "ports":
        return <Spin spinning={loading}><pre className="m-0 min-h-24 overflow-auto p-2 font-mono text-xs text-[var(--text-primary)]">{output.trim() || (loading || error ? "" : "暂无监听端口")}</pre></Spin>;
      case "firewall":
        return <Table<FirewallRow> rowKey="id" size="small" columns={firewallColumns} loading={loading} pagination={false} className="ops-table text-xs"
          dataSource={lines.map((line, id) => {
            const [port = "", action = "", from = ""] = line.trim().split(/\s{2,}/);
            return { id, port, action, from };
          })}
        />;
    }
  }

  return (
    <div className="space-y-3 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-900)] p-3">
        <nav aria-label="系统工具" className="flex flex-wrap items-center gap-1">
          {(Object.keys(tools) as SystemTab[]).map((key) => (
            <Button key={key} size="small" type={tab === key ? "primary" : "text"} aria-current={tab === key ? "true" : undefined} onClick={() => onSelectTab(key)}>
              {tools[key].label}
            </Button>
          ))}
        </nav>
        <Button size="small" disabled={unsupported} loading={loading} icon={<RotateCw size={13} />} onClick={() => void refresh()}>刷新</Button>
      </div>
      {error && <Alert type="error" showIcon message={error} />}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-900)] p-3">
        {renderResults()}
      </div>
    </div>
  );
}
