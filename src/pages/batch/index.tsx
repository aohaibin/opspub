import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Alert, Button, Input, InputNumber, Modal, Popconfirm, Segmented, Select, Switch, message } from "antd";
import { Check, FileCode2, Layers3, Play, RotateCcw, Save, Sparkles, X } from "lucide-react";
import { batchApi } from "@/lib/api/batch";
import { configApi } from "@/lib/api/config";
import { getErrorMessage } from "@/lib/api/client";
import { modelServiceApi } from "@/lib/api/model-service";
import { serverApi } from "@/lib/api/server";
import { BatchHosts } from "@/pages/batch/components/BatchHosts";
import { BatchResults } from "@/pages/batch/components/BatchResults";
import { PRESETS, type Mode, type RunRow } from "@/pages/batch/types";
import type { ModelProfile, Server } from "@/types";
import "@/pages/batch/batch.css";

const SNIPPET_KEY = "batch.command_snippets";
const MODE_OPTIONS: { label: string; value: Mode }[] = [{ label: "并发 (上限 10)", value: "concurrent" }, { label: "滚动批次", value: "rolling" }, { label: "串行", value: "serial" }];

function confirmDispatch(count: number, command: string): Promise<boolean> {
  return new Promise((resolve) => {
    Modal.confirm({ title: `确认向 ${count} 台服务器下发命令`,
      content: <pre className="batch-confirm-command">{command}</pre>,
      okText: "确认执行", cancelText: "取消", okButtonProps: { danger: true },
      onOk: () => { resolve(true); }, onCancel: () => { resolve(false); },
    });
  });
}

export default function BatchPage() {
  const location = useLocation();
  const [servers, setServers] = useState<Server[]>([]);
  const [loadingServers, setLoadingServers] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>((location.state as { serverIds?: number[] } | null)?.serverIds ?? []);
  const [prompt, setPrompt] = useState("");
  const [command, setCommand] = useState("");
  const [mode, setMode] = useState<Mode>("concurrent");
  const [timeoutSecs, setTimeoutSecs] = useState(30);
  const [failStop, setFailStop] = useState(false);
  const [running, setRunning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [rows, setRows] = useState<RunRow[]>([]);
  const [snippets, setSnippets] = useState<string[]>([]);
  const [snippetsReady, setSnippetsReady] = useState(false);
  const [snippetSaving, setSnippetSaving] = useState(false);
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const [profiles, setProfiles] = useState<ModelProfile[]>([]);
  const [profileId, setProfileId] = useState<string>();
  const [error, setError] = useState("");
  const [favoriteLoadingIds, setFavoriteLoadingIds] = useState<number[]>([]);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [lastRun, setLastRun] = useState({ command: "", timeout: 30, mode: "concurrent" as Mode, failStop: false });
  const runIdRef = useRef(0);
  const busyRef = useRef(false);
  const disabled = running || generating || confirming;

  useEffect(() => {
    let active = true;
    void serverApi.list().then((items) => { if (active) setServers(items); })
      .catch((failure) => { if (active) setError(getErrorMessage(failure)); })
      .finally(() => { if (active) setLoadingServers(false); });
    void modelServiceApi.listProfiles().then((items) => {
      if (!active) return;
      const enabled = items.filter((item) => item.enabled);
      setProfiles(enabled); setProfileId(enabled[0]?.id);
    }).catch((failure) => { if (active) setError(getErrorMessage(failure)); });
    void configApi.getAll().then((configs) => {
      const raw = configs.find((item) => item.key === SNIPPET_KEY)?.value;
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) throw new Error("命令片段数据格式无效");
      if (active) { setSnippets(parsed as string[]); setSnippetsReady(true); }
    }).catch((failure) => { if (active) setError(getErrorMessage(failure)); });
    // 离开页面后停止后续派发，已提交的远端命令仍由后端完成并写审计。
    return () => { active = false; runIdRef.current += 1; };
  }, []);

  const selectedServers = servers.filter((server) => server.os_type === "linux" && selectedIds.includes(server.id));
  const updateRow = (id: number, patch: Partial<RunRow>) => setRows((current) => current.map((row) => row.server.id === id ? { ...row, ...patch } : row));

  const executeOne = async (server: Server, text: string, timeout: number, runId: number, attempts = 1) => {
    updateRow(server.id, { status: "running", attempts, result: undefined, error: undefined });
    try {
      const result = await batchApi.executeTarget(server.id, text, timeout);
      if (runId === runIdRef.current) updateRow(server.id, { status: result.exitCode === 0 ? "success" : "failed", result });
      return result.exitCode === 0;
    } catch (failure) {
      if (runId === runIdRef.current) updateRow(server.id, { status: "failed", error: getErrorMessage(failure) });
      return false;
    }
  };

  const runTargets = async (targets: Server[], text: string, runMode: Mode, stopOnFailure: boolean, timeout: number) => {
    const runId = ++runIdRef.current;
    const started = performance.now();
    setRunning(true); setElapsedMs(null);
    setLastRun({ command: text, timeout, mode: runMode, failStop: stopOnFailure });
    setRows(targets.map((server) => ({ server, status: "queued", attempts: 0 })));
    const width = runMode === "serial" ? 1 : runMode === "rolling" ? 3 : 10;
    // 等当前批次的真实结果后再派发下一批；失败即停不伪装成取消已执行的命令。
    for (let offset = 0; offset < targets.length && runId === runIdRef.current; offset += width) {
      const results = await Promise.all(targets.slice(offset, offset + width).map((server) => executeOne(server, text, timeout, runId)));
      if (stopOnFailure && results.some((ok) => !ok)) {
        setRows((current) => current.map((row) => row.status === "queued" ? { ...row, status: "skipped" } : row));
        break;
      }
    }
    if (runId === runIdRef.current) { setElapsedMs(Math.round(performance.now() - started)); setRunning(false); }
  };

  const dispatch = async (rerun = false) => {
    if (busyRef.current || disabled) return;
    const targets = rerun ? rows.map((row) => row.server) : selectedServers;
    const text = rerun ? lastRun.command : command.trim();
    const timeout = rerun ? lastRun.timeout : timeoutSecs;
    if (!targets.length) return message.warning("请先选择 Linux 服务器");
    if (!text || /[\r\n]/.test(text) || text.length > 4096) return message.warning("请输入 4096 字以内的单行命令");
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 600) return message.warning("单台超时须在 1 到 600 秒之间");
    busyRef.current = true; setConfirming(true);
    const currentRunId = runIdRef.current;
    try {
      if (!await confirmDispatch(targets.length, text) || currentRunId !== runIdRef.current) return;
      setConfirming(false);
      await runTargets(targets, text, rerun ? lastRun.mode : mode, rerun ? lastRun.failStop : failStop, timeout);
    } finally { busyRef.current = false; setConfirming(false); }
  };

  const retry = async (row: RunRow) => {
    if (busyRef.current || disabled) return;
    busyRef.current = true; setConfirming(true);
    const currentRunId = runIdRef.current;
    try {
      if (!await confirmDispatch(1, lastRun.command) || currentRunId !== runIdRef.current) return;
      setConfirming(false); setRunning(true);
      const started = performance.now();
      await executeOne(row.server, lastRun.command, lastRun.timeout, runIdRef.current, row.attempts + 1);
      setElapsedMs((current) => (current ?? 0) + Math.round(performance.now() - started));
    } finally { busyRef.current = false; setConfirming(false); setRunning(false); }
  };

  const generate = async () => {
    if (disabled) return;
    if (!prompt.trim()) return message.warning("请先填写运维需求");
    if (!profileId) return message.warning("请先在设置中启用模型服务");
    setGenerating(true); setError("");
    try { const draft = await batchApi.generateCommand(profileId, prompt.trim()); setCommand(draft); message.success("命令草稿已生成，请检查后再执行"); }
    catch (failure) { setError(getErrorMessage(failure)); }
    finally { setGenerating(false); }
  };

  const persistSnippets = async (next: string[]) => {
    if (!snippetsReady || snippetSaving) return;
    setSnippetSaving(true);
    try { await configApi.set(SNIPPET_KEY, JSON.stringify(next)); setSnippets(next); message.success("命令片段已保存到本机"); }
    catch (failure) { setError(getErrorMessage(failure)); }
    finally { setSnippetSaving(false); }
  };

  const favorite = async (server: Server) => {
    if (favoriteLoadingIds.includes(server.id)) return;
    setFavoriteLoadingIds((current) => [...current, server.id]);
    try { const value = await serverApi.setFavorite(server.id, !server.favorite); setServers((current) => current.map((item) => item.id === server.id ? { ...item, favorite: value } : item)); }
    catch (failure) { setError(getErrorMessage(failure)); }
    finally { setFavoriteLoadingIds((current) => current.filter((id) => id !== server.id)); }
  };

  const clear = () => { setRows([]); setElapsedMs(null); };
  const reset = () => { setPrompt(""); setCommand(""); setSelectedIds([]); setMode("concurrent"); setTimeoutSecs(30); setFailStop(false); setError(""); clear(); };

  return <div className="ops-page ops-batch-page">
    <header className="batch-page-heading">
      <div className="batch-title"><div className="batch-title-icon"><Layers3 size={21} /></div><div><h1>批量执行</h1><p>一条命令发往多台机器；以服务器主账号执行，每台独立超时、失败可即停，全过程写审计</p></div></div>
      <div className="batch-actions"><Button icon={<RotateCcw size={15} />} onClick={reset} disabled={disabled} title="重置命令与执行结果" aria-label="重置批量执行表单" /><Button type="primary" icon={<Play size={15} />} onClick={() => void dispatch()} loading={running} disabled={disabled || !selectedServers.length || !command.trim()}>开始批量执行 ({selectedServers.length})</Button></div>
    </header>
    {error && <Alert type="error" showIcon closable title={error} onClose={() => setError("")} />}
    <section className="batch-panel batch-config">
      <div className="batch-prompt-row"><Sparkles size={17} /><Input variant="borderless" value={prompt} disabled={disabled} maxLength={2000} onChange={(event) => setPrompt(event.target.value)} onPressEnter={() => void generate()} placeholder="用一句话描述要做什么，AI 帮你写命令（例：查看磁盘占用、排除 tmpfs）" aria-label="批量命令生成需求" />
        <Select aria-label="命令生成模型" value={profileId} disabled={disabled || !profiles.length} options={profiles.map((item) => ({ label: item.name, value: item.id }))} placeholder="选择模型" popupMatchSelectWidth={false} />
        <Button icon={<Sparkles size={14} />} loading={generating} disabled={disabled || !profileId || !prompt.trim()} onClick={() => void generate()}>AI 生成</Button></div>
      {!profiles.length && <p className="batch-model-note">AI 生成需要启用模型服务，<Link to="/settings">前往设置</Link>；也可使用下方快捷命令。</p>}
      <div className="batch-presets"><span>试试:</span>{PRESETS.map((item) => <button type="button" key={item.label} disabled={disabled} onClick={() => { setPrompt(item.label); setCommand(item.command); }}>{item.label}</button>)}</div>
      <Input.TextArea className="batch-command" aria-label="批量执行命令" value={command} disabled={disabled} onChange={(event) => setCommand(event.target.value)} rows={2} maxLength={4096} placeholder="单条命令（如 uptime / docker ps / systemctl status nginx）；多行脚本请使用终端工作台。" />
      <div className="batch-controls">
        <div className="batch-control-fields"><label>模式 <Segmented<Mode> value={mode} onChange={setMode} disabled={disabled} options={MODE_OPTIONS} /></label>
          <label>单台超时(秒) <InputNumber aria-label="单台超时秒数" min={1} max={600} precision={0} value={timeoutSecs} disabled={disabled} onChange={(value) => setTimeoutSecs(value ?? 30)} /></label>
          <label title="开启后，当前批次任一机器失败便停止后续批次；已下发的机器仍等待真实结果">失败即停 <Switch size="small" checked={failStop} disabled={disabled} onChange={setFailStop} /> <span>?</span></label></div>
        <div className="batch-actions"><Button size="small" icon={<FileCode2 size={14} />} disabled={disabled} onClick={() => setSnippetsOpen(true)}>片段</Button><Button size="small" icon={<Save size={14} />} loading={snippetSaving} disabled={disabled || !snippetsReady || !command.trim()} onClick={() => {
          const value = command.trim();
          if (/[\r\n]/.test(value)) return message.warning("只能保存单行命令片段");
          if (snippets.includes(value)) return message.info("此命令片段已保存");
          void persistSnippets([value, ...snippets]);
        }}>存为片段</Button></div>
      </div>
    </section>
    <div className="batch-workspace">
      <BatchHosts servers={servers} selectedIds={selectedIds} onSelection={setSelectedIds} loading={loadingServers} disabled={disabled} favoriteLoadingIds={favoriteLoadingIds} onFavorite={(server) => void favorite(server)} />
      <BatchResults rows={rows} command={lastRun.command} running={running} disabled={disabled} elapsedMs={elapsedMs} onRetry={(row) => void retry(row)} onRerun={() => void dispatch(true)} onClear={clear} />
    </div>
    <Modal title="命令片段" open={snippetsOpen} onCancel={() => setSnippetsOpen(false)} footer={null} width={720}>
      <div className="batch-snippets custom-scrollbar">{[...PRESETS.map((preset) => preset.command), ...snippets.filter((snippet) => !PRESETS.some((preset) => preset.command === snippet))].map((snippet) => <div key={snippet}><code>{snippet}</code><Button size="small" title="载入片段" aria-label={`载入 ${snippet}`} icon={<Check size={14} />} onClick={() => { setCommand(snippet); setSnippetsOpen(false); }} />{snippets.includes(snippet) && <Popconfirm title="删除此命令片段？" onConfirm={() => persistSnippets(snippets.filter((item) => item !== snippet))}><Button size="small" disabled={snippetSaving} title="删除片段" aria-label={`删除 ${snippet}`} icon={<X size={14} />} /></Popconfirm>}</div>)}</div>
    </Modal>
  </div>;
}
