import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Checkbox, Empty, Modal, Radio, Spin, Tag, Tooltip, message } from "antd";
import { open as openDialog, save } from "@tauri-apps/plugin-dialog";
import { FileCode, FileSpreadsheet, Folder, HelpCircle, RotateCw, ShieldCheck } from "lucide-react";
import type { AIPolicy, AuthType } from "@/types";
import { getErrorCode, getErrorMessage } from "@/lib/api/client";
import { serverImportApi, type ServerImportPreview, type ServerImportSource, type ServerImportOutcome } from "@/lib/api/server-import";
import { useSshSessionStore } from "@/store/ssh";
import { serverSetupStyles } from "./serverSetupStyles";
import { ImportPolicySelect } from "./ImportPolicySelect";
import { SpreadsheetImportSource } from "./SpreadsheetImportSource";

interface Props { source: ServerImportSource; open: boolean; onCancel: () => void; onImported: () => void }
const META = {
  ssh_config: { title: "导入 ~/.ssh/config", Icon: FileCode, description: "自动检测 ~/.ssh/config，也可选择其他 SSH 配置文件。解析具体 Host 块，跳过通配符模板。不读取私钥文件内容；连接信息入库后 AI 权限默认禁用。请编辑补充凭据，首次连接时核对主机指纹。" },
  finalshell: { title: "从 FinalShell 导入", Icon: Folder, description: "选择 FinalShell 导出的文件夹，自动扫描连接文件并保留分组与子分组。导入前可逐台预览、勾选；同名服务器会跳过，不覆盖已有连接。" },
  spreadsheet: { title: "从 Excel / CSV 表格导入", Icon: FileSpreadsheet, description: "选择整理好的服务器表格，预览并勾选后导入。不确定怎么填写时，可先下载模板；同名服务器会跳过，不覆盖已有连接。" },
};

export function ImportServersModal({ source, open, onCancel, onImported }: Props) {
  const [preview, setPreview] = useState<ServerImportPreview | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  // 仅记录用户选中的路径；默认文件的重新检测仍按可选配置处理。
  const [path, setPath] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [missingDefaultConfig, setMissingDefaultConfig] = useState(false);
  const [outcomes, setOutcomes] = useState<ServerImportOutcome[]>([]);
  const [policy, setPolicy] = useState<AIPolicy>("disabled");
  const [auth, setAuth] = useState<"password" | "key" | "key_passphrase" | "agent">("key");
  const generation = useRef(0);
  const token = useRef<string | undefined>(undefined);
  const clearToken = useCallback(() => {
    if (token.current) void serverImportApi.discard(token.current).catch(() => {});
    token.current = undefined;
  }, []);
  const load = useCallback(async (filePath?: string) => {
    const current = ++generation.current;
    clearToken(); setLoading(true); setError(""); setMissingDefaultConfig(false); setPreview(null); setSelected([]); setOutcomes([]);
    try {
      const next = await serverImportApi.preview(source, filePath);
      if (current !== generation.current) { await serverImportApi.discard(next.token); return; }
      token.current = next.token; setPreview(next); setPath(filePath);
      // 不默认勾选生产机器；用户必须确认具体目标。
    } catch (e) {
      if (current === generation.current) {
        // 仅自动检测的缺省文件进入空状态，不吞掉用户所选文件的读取错误。
        if (source === "ssh_config" && !filePath && getErrorCode(e) === "NOT_FOUND") setMissingDefaultConfig(true);
        else setError(getErrorMessage(e));
      }
    }
    finally { if (current === generation.current) setLoading(false); }
  }, [clearToken, source]);

  useEffect(() => {
    if (open) {
      setPreview(null); setSelected([]); setPath(undefined); setError(""); setMissingDefaultConfig(false); setOutcomes([]); setPolicy("disabled"); setAuth("key"); setLoading(false);
      if (source === "ssh_config") void load();
    }
    return () => { generation.current += 1; clearToken(); };
  }, [open, source, load, clearToken]);

  const choose = async () => {
    const current = generation.current;
    try {
      const file = await openDialog({ title: META[source].title, directory: source === "finalshell", multiple: false, ...(source === "spreadsheet" ? { filters: [{ name: "Excel / CSV", extensions: ["xlsx", "csv"] }] } : {}) });
      if (current !== generation.current) return;
      if (typeof file === "string") { setPath(file); await load(file); }
    } catch (e) { message.error(getErrorMessage(e)); }
  };
  const download = async () => {
    setDownloading(true);
    try {
      const target = await save({ title: "保存服务器导入模板", defaultPath: "OpsPub-服务器导入模板.xlsx", filters: [{ name: "Excel", extensions: ["xlsx"] }] });
      if (!target) return;
      await serverImportApi.saveTemplate(target); message.success(`模板已保存：${target}`);
    } catch (e) { message.error(getErrorMessage(e)); }
    finally { setDownloading(false); }
  };
  const submit = async () => {
    if (!preview || !selected.length || importing) return;
    setImporting(true); setError("");
    try {
      const result = await serverImportApi.commit(preview.token, selected, policy, (auth === "key_passphrase" ? "key" : auth) as AuthType);
      token.current = undefined;
      const count = result.filter(r => r.serverId !== null).length;
      setOutcomes(result); setSelected([]); setPreview(null);
      if (count > 0) {
        message.success(`已导入 ${count} 台服务器`);
        await useSshSessionStore.getState().hydrateCredentials();
        onImported();
      }
      if (result.every(r => r.serverId !== null)) onCancel();
    } catch (e) { setError(getErrorMessage(e)); setPreview(null); setSelected([]); }
    finally { setImporting(false); }
  };
  const available = preview?.rows.filter(row => !row.error) ?? [];
  const { title, Icon, description } = META[source];
  return <Modal open={open} centered width={700} title={<span className="flex items-center gap-2.5 text-sm font-bold"><Icon size={17} />{title}</span>}
    onCancel={() => { if (!importing) onCancel(); }} maskClosable={false} keyboard={!importing} closable={!importing} styles={serverSetupStyles}
    footer={<div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3" style={{ textAlign: "left" }}>
      {source !== "ssh_config" ? <div className="flex flex-wrap items-center gap-2" style={{ color: "var(--text-secondary)", fontSize: 13 }}>
        <span className="whitespace-nowrap">导入后的 AI 档位</span><ImportPolicySelect value={policy} disabled={importing} onChange={setPolicy} />
        <Tooltip title="导入后可在服务器列表调整 AI 权限；RDP 条目始终禁用 AI"><button type="button" aria-label="AI 档位说明" className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-[var(--bg-hover)]"><HelpCircle size={15} /></button></Tooltip>
      </div> : <span className="text-xs" style={{ color: "var(--text-muted)" }}>已选 {selected.length} / 可导入 {available.length}</span>}
      <div className="flex gap-2"><Button disabled={importing} onClick={onCancel}>取消</Button><Button type="primary" disabled={!preview || !selected.length || loading} loading={importing} onClick={() => void submit()}>导入 {selected.length} 台</Button></div>
    </div>}>
    <div className="flex flex-col gap-4" style={source !== "ssh_config" ? { fontSize: 14 } : undefined}>
      <p style={{ color: "var(--text-secondary)", margin: 0 }}>{description}</p>
      {source === "ssh_config" && <div className="space-y-2"><div style={{ color: "var(--text-secondary)" }}>默认认证方式</div>
        <Radio.Group value={auth} disabled={importing} onChange={e => setAuth(e.target.value)} className="grid grid-cols-1 gap-y-2 sm:grid-cols-2">
          <Radio value="password">密码 · 导入后补充密码</Radio><Radio value="key">私钥 (PEM) · 导入后设置私钥</Radio>
          <Radio value="key_passphrase">私钥 + 口令</Radio><Radio value="agent">ssh-agent · 先用 ssh-add 加载密钥</Radio>
        </Radio.Group></div>}
      {source === "finalshell" ? <>
        <div className="flex flex-wrap items-center gap-3 rounded-xl p-4" style={{ background: "var(--bg-primary)", border: "1px dashed var(--border)" }}>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg" style={{ background: "color-mix(in srgb, var(--info) 12%, transparent)", color: "var(--info)" }}><Folder size={23} /></div>
          <div className="min-w-0 flex-1 basis-48">
            <div className="font-medium" style={{ color: "var(--text-primary)" }}>FinalShell 导出目录</div>
            <div className="mt-1 break-all text-xs" style={{ color: "var(--text-secondary)" }}>{preview?.path || path || "还没有选择文件夹，支持递归读取子目录中的 JSON 连接配置。"}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button icon={<Folder size={14} />} disabled={loading || importing} onClick={() => void choose()}>{path ? "重新选择" : "选择导出文件夹"}</Button>
            {path && <Button icon={<RotateCw size={14} />} disabled={loading || importing} onClick={() => void load(path)}>重新解析</Button>}
          </div>
        </div>
        <div className="flex items-start gap-2 text-[13px]" style={{ color: "var(--text-secondary)" }}>
          <ShieldCheck size={16} className="mt-0.5 shrink-0" style={{ color: "var(--success)" }} />
          <span>支持的密码在本机解码并存入系统凭据管理器，不显示明文；无法解码时会提示补录。RDP 连接仅用于打开系统远程桌面。</span>
        </div>
      </> : source === "spreadsheet" ? <SpreadsheetImportSource path={preview?.path || path} busy={loading || importing} downloading={downloading}
        onChoose={() => void choose()} onReload={() => void load(path)} onDownload={() => void download()} /> : <div className="flex flex-wrap items-center gap-2.5">
        <Button icon={<Icon size={14} />} disabled={loading || importing} onClick={() => void choose()}>选择配置文件</Button>
        <Button icon={<RotateCw size={14} />} disabled={loading || importing} onClick={() => void load(path)}>{missingDefaultConfig ? "重新检测" : "重新解析"}</Button>
        <span className="w-full break-all text-xs" style={{ color: "var(--text-muted)" }}>{preview?.path || path || "默认查找位置：~/.ssh/config（当前用户目录）"}</span>
      </div>}
      {missingDefaultConfig && <div role="status" className="flex flex-col items-center gap-2 rounded-xl px-5 py-8 text-center" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
        <FileCode size={30} style={{ color: "var(--text-muted)" }} />
        <p className="m-0 font-medium" style={{ color: "var(--text-primary)" }}>未找到默认 SSH 配置文件</p>
        <p className="m-0" style={{ color: "var(--text-secondary)" }}>点击“选择配置文件”，选取本机或从其他电脑复制的 SSH config 文件。</p>
        <p className="m-0 text-xs" style={{ color: "var(--text-muted)" }}>没有配置文件也可以直接在服务器页添加连接。</p>
      </div>}
      {error && <Alert type="warning" showIcon title="未能完成导入" description={error} />}
      {!!preview?.warnings.length && <Alert type="info" showIcon description={preview.warnings.join("；")} />}
      {loading ? <div className="flex justify-center py-10"><Spin tip="正在解析本机文件…" /></div> : preview && (preview.rows.length ? <>
        <div className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
          <span>检测到 {preview.rows.length} 台 · 可导入 {available.length} 台</span>
          <Checkbox disabled={importing || !available.length} checked={!!available.length && selected.length === available.length} indeterminate={selected.length > 0 && selected.length < available.length} onChange={e => setSelected(e.target.checked ? available.map(r => r.index) : [])}>全选</Checkbox>
        </div>
        <div className="max-h-64 space-y-2 overflow-y-auto custom-scrollbar pr-1">
          {preview.rows.map(row => <label key={row.index} className="flex items-start gap-3 rounded-lg p-3" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", opacity: row.error ? .65 : 1 }}>
            <Checkbox aria-label={`选择 ${row.alias || "未命名"}`} className="mt-1" disabled={!!row.error || importing} checked={selected.includes(row.index)} onChange={e => setSelected(prev => e.target.checked ? [...prev, row.index] : prev.filter(i => i !== row.index))} />
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2 font-medium">{row.alias || "未命名"}<Tag>{row.group}</Tag>{row.protocol === "rdp" ? <Tag color="blue">仅远程桌面</Tag> : source === "spreadsheet" && <Tag>{row.osType === "windows" ? "Windows SSH" : "Linux SSH"}</Tag>}</div>
              <div className="break-all font-mono text-xs" style={{ color: "var(--text-secondary)" }}>{row.username}@{row.hostname}:{row.port}</div>
              {row.tags.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{row.tags.map((tag, index) => <Tag key={`${index}-${tag}`}>{tag}</Tag>)}</div>}
              {(row.error || row.warning) && <div className="mt-1 text-xs" style={{ color: row.error ? "var(--danger)" : "var(--warning)" }}>{row.error || row.warning}</div>}
            </div><span className="shrink-0 text-xs" style={{ color: "var(--text-muted)" }}>{row.hasPassword ? "含密码 · 本机保存" : "待补凭据"}</span>
          </label>)}
        </div>
      </> : <Empty className="py-5" description={source === "ssh_config" ? "未找到具体 Host（通配符模板已跳过）" : source === "finalshell" ? "未找到 FinalShell 连接，请选择包含连接 JSON 文件的导出目录。" : "未找到可导入的服务器"} />)}
      {outcomes.length > 0 && <Alert type="warning" showIcon title={`导入成功 ${outcomes.filter(r => r.serverId !== null).length} 台，失败 ${outcomes.filter(r => r.error).length} 台`} description={<div className="max-h-48 overflow-auto">{outcomes.filter(r => r.error).map(r => <div key={r.index}>{r.alias}：{r.error}</div>)}<div>修正后点击“重新解析”，已导入的连接会自动跳过。</div></div>} />}
    </div>
  </Modal>;
}
