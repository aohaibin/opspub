import React, { useState } from "react";
import { Button } from "antd";
import { Terminal as TerminalIcon, Play, Trash2 } from "lucide-react";
import { getErrorMessage } from "@/lib/api/client";
import type { Server } from "@/types";
import { useWorkbenchRuntime } from "../context";

interface TerminalViewProps {
  server: Server | null;
}

export const TerminalView: React.FC<TerminalViewProps> = ({ server }) => {
  const { runCommand } = useWorkbenchRuntime();
  const [logs, setLogs] = useState<string[]>(["远程终端已就绪。首次执行命令时会验证 SSH 凭据。"]);
  const [inputVal, setInputVal] = useState("");
  const [running, setRunning] = useState(false);

  const handleCommand = async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed || running) return;
    if (trimmed === "clear") {
      setLogs([]);
      setInputVal("");
      return;
    }
    setLogs((prev) => [...prev, `${server?.username || "root"}@${server?.hostname || "host"}:~# ${trimmed}`]);
    setInputVal("");
    setRunning(true);
    try {
      const result = await runCommand(trimmed);
      const output = [result.stdout.trim(), result.stderr.trim() ? `[stderr]\n${result.stderr.trim()}` : ""]
        .filter(Boolean).join("\n");
      setLogs((prev) => [...prev, output || `[Exit ${result.exitCode}]`, ...(result.exitCode !== 0 ? [`命令执行失败，退出码 ${result.exitCode}`] : [])]);
    } catch (error) {
      setLogs((prev) => [...prev, `执行失败: ${getErrorMessage(error)}`]);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] min-h-[500px] rounded-xl border overflow-hidden select-none" style={{ borderColor: "var(--border)", background: "#0d1117" }}>
      <div className="shrink-0 flex items-center justify-between px-3 py-2 bg-[#161b22] border-b border-slate-800 text-xs">
        <div className="flex items-center space-x-2">
          <TerminalIcon size={14} className="text-teal-400" />
          <span className="font-mono text-white">{server ? `${server.alias} (${server.username}@${server.hostname}:${server.port})` : "嵌入式 Shell 终端"}</span>
          <span className="px-2 py-0.5 rounded text-[10px] bg-teal-500/15 text-teal-300 border border-teal-500/30 font-mono">SSH</span>
        </div>
        <div className="flex items-center space-x-1.5">
          {["uptime", "free -m", "df -h", "docker ps"].map((cmd) => (
            <button key={cmd} type="button" disabled={running} onClick={() => void handleCommand(cmd)} className="px-2 py-0.5 rounded bg-surface-800 text-slate-300 hover:text-white hover:bg-surface-700 transition font-mono text-[11px] border border-slate-700 cursor-pointer disabled:opacity-50">{cmd}</button>
          ))}
          <Button size="small" type="text" icon={<Trash2 size={12} className="text-slate-400" />} onClick={() => setLogs([])} title="清屏" />
        </div>
      </div>
      <div className="flex-1 p-4 font-mono text-xs overflow-y-auto space-y-1 text-slate-300 custom-scrollbar leading-relaxed">
        {logs.map((log, idx) => <div key={`${idx}-${log.slice(0, 12)}`} className="whitespace-pre-wrap">{log}</div>)}
      </div>
      <div className="shrink-0 p-2.5 bg-[#161b22] border-t border-slate-800 flex items-center space-x-2">
        <span className="font-mono text-xs text-teal-400">{server?.username || "root"}@host:~#</span>
        <input type="text" value={inputVal} disabled={running} onChange={(e) => setInputVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void handleCommand(inputVal); }} placeholder={server ? "输入命令..." : "请先选择服务器"} className="bg-transparent flex-1 text-xs font-mono text-white focus:outline-none disabled:opacity-50" />
        <Button size="small" type="primary" loading={running} icon={<Play size={12} />} onClick={() => void handleCommand(inputVal)}>执行</Button>
      </div>
    </div>
  );
};
