import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from "antd";
import {
  Box,
  CheckCircle2,
  FileCode2,
  History,
  Layers3,
  Pencil,
  Play,
  Plus,
  Rocket,
  RotateCcw,
  TerminalSquare,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { deploymentApi } from "@/lib/api/deployment";
import { getErrorMessage } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";
import type {
  DeployTarget,
  DeployTargetInput,
  DeploymentHistory,
  DeploymentProgress,
  Server,
} from "@/types";

const { Text } = Typography;

const RECIPES = [
  { value: "1panel-app", label: "1panel-app", description: "1Panel 应用包，按 compose 目录约定发布", tags: ["1panel", "docker"] },
  { value: "custom-script", label: "custom-script", description: "通用发布方案，保留 releases/current 原子切换", tags: ["custom"] },
  { value: "docker-compose", label: "docker-compose", description: "复制制品并执行 Docker Compose 构建与更新", tags: ["docker"] },
  { value: "node-pm2", label: "node-pm2", description: "Node 应用 npm 安装后由 PM2 平滑重载", tags: ["node", "backend"] },
  { value: "static-nginx", label: "static-nginx", description: "前端静态资源发布到 Nginx 站点", tags: ["static", "frontend"] },
  { value: "static-openresty", label: "static-openresty", description: "OpenResty 静态站点发布并重载配置", tags: ["static", "frontend"] },
  { value: "systemd-binary", label: "systemd-binary", description: "Java、Go、Rust 二进制由 systemd 托管", tags: ["java", "go", "backend"] },
] as const;

type RunState = "idle" | "running" | "success" | "failed";

export default function DeploymentPage() {
  const [targets, setTargets] = useState<DeployTarget[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DeployTarget | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<DeployTarget | null>(null);
  const [history, setHistory] = useState<DeploymentHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [runState, setRunState] = useState<RunState>("idle");
  const [activeTarget, setActiveTarget] = useState<DeployTarget | null>(null);
  const [runOutput, setRunOutput] = useState("");
  const [runError, setRunError] = useState("");
  const [progress, setProgress] = useState<DeploymentProgress | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [form] = Form.useForm<DeployTargetInput>();

  const load = async () => {
    setLoading(true);
    try {
      const [nextTargets, nextServers] = await Promise.all([deploymentApi.listTargets(), serverApi.list()]);
      setTargets(nextTargets);
      setServers(nextServers);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<DeploymentProgress>("deployment-progress", (event) => {
      if (!disposed) {
        setProgress(event.payload);
        setRunOutput((current) => current ? `${current}\n${event.payload.message}` : event.payload.message);
      }
    }).then((stop) => {
      if (disposed) stop(); else unlisten = stop;
    }).catch(() => undefined);
    return () => { disposed = true; unlisten?.(); };
  }, []);

  const serverMap = useMemo(() => new Map(servers.map((server) => [server.id, server])), [servers]);
  const openCreate = (recipe?: string) => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ recipe: recipe ?? "docker-compose", remotePath: "/opt/apps/my-app", artifactPath: "", healthCommand: "" });
    setModalOpen(true);
  };
  const openEdit = (target: DeployTarget) => {
    setEditing(target);
    form.setFieldsValue(target);
    setModalOpen(true);
  };
  const save = async (values: DeployTargetInput) => {
    try {
      await deploymentApi.saveTarget({ ...values, id: editing?.id, artifactPath: values.artifactPath?.trim(), healthCommand: values.healthCommand?.trim() });
      message.success(editing ? "部署目标已更新" : "部署目标已创建");
      setModalOpen(false);
      await load();
    } catch (error) { message.error(getErrorMessage(error)); }
  };
  const remove = async (target: DeployTarget) => {
    try {
      await deploymentApi.deleteTarget(target.id);
      message.success("部署目标已删除");
      await load();
    } catch (error) { message.error(getErrorMessage(error)); }
  };
  const run = async (target: DeployTarget, action: "deploy" | "rollback") => {
    if (runState === "running") return;
    setActiveTarget(target);
    setRunState("running");
    setRunOutput("");
    setRunError("");
    setProgress({ targetId: target.id, stage: "queued", message: action === "deploy" ? "正在准备部署" : "正在准备回滚", completed: false });
    const started = performance.now();
    try {
      const result = action === "deploy"
        ? await deploymentApi.deployTarget({ targetId: target.id })
        : await deploymentApi.rollbackTarget({ targetId: target.id });
      setRunOutput(result.stdout || result.history.output || "命令已完成，但没有输出");
      setRunError(result.stderr || result.history.error || "");
      setElapsedMs(result.durationMs ?? Math.round(performance.now() - started));
      setRunState(result.exitCode === 0 ? "success" : "failed");
      message[result.exitCode === 0 ? "success" : "error"](result.exitCode === 0 ? `${action === "deploy" ? "部署" : "回滚"}完成` : "远端命令执行失败");
    } catch (error) {
      setElapsedMs(Math.round(performance.now() - started));
      setRunError(getErrorMessage(error));
      setRunState("failed");
      message.error(getErrorMessage(error));
    }
  };
  const showHistory = async (target: DeployTarget) => {
    setHistoryTarget(target);
    setHistoryOpen(true);
    setHistoryLoading(true);
    try { setHistory(await deploymentApi.listHistory(target.id)); }
    catch (error) { message.error(getErrorMessage(error)); }
    finally { setHistoryLoading(false); }
  };

  return (
    <div className="ops-page flex min-h-full flex-col gap-4 text-xs" style={{ color: "var(--text-secondary)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-2">
        <div>
          <h1 className="flex items-center gap-2 text-base font-bold text-white"><Rocket size={20} className="text-cyan-400" />应用部署与发布管理</h1>
          <p className="mt-0.5 text-slate-400">版本追踪 · 原子软链发布 · 失败自动回滚 · 多端编排</p>
        </div>
        <Space>
          <Button icon={<WandSparkles size={14} />} onClick={() => openCreate("custom-script")}>新建方案（向导）</Button>
          <Button type="primary" icon={<Plus size={14} />} onClick={() => openCreate()}>新建部署目标</Button>
        </Space>
      </div>

      <section className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-white"><Box size={16} className="text-cyan-400" />部署目标 <span className="font-normal text-slate-500">（{targets.length} 项活动目标）</span></div>
        {loading ? <div className="flex justify-center py-12"><Spin /></div> : targets.length === 0 ? <Card className="border-dashed border-slate-700 bg-surface-900"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有部署目标，先创建一个目标吧" /><div className="text-center"><Button type="primary" icon={<Plus size={14} />} onClick={() => openCreate()}>创建部署目标</Button></div></Card> :
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{targets.map((target) => {
            const server = serverMap.get(target.serverId);
            const busy = runState === "running" && activeTarget?.id === target.id;
            return <Card key={target.id} size="small" className="border-slate-800 bg-surface-900 transition hover:border-cyan-500/50" styles={{ body: { padding: 14 } }}>
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="flex items-center gap-2"><Box size={15} className="text-cyan-400" /><span className="truncate text-sm font-bold text-white">{target.name}</span><Tag bordered={false} className="m-0 font-mono text-[10px]">{target.recipe}</Tag></div><div className="mt-1 flex items-center gap-1 text-slate-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{server ? `${server.alias} (${server.hostname})` : "未找到绑定服务器"}</div></div></div>
              <div className="mt-3 rounded border border-slate-800/80 bg-surface-950 p-2 font-mono text-[11px] text-slate-400"><div className="truncate">路径：{target.remotePath}</div><div className="text-slate-500">构建：artifact · 链接：symlink 原子发布</div></div>
              <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-2"><Button size="small" type="primary" ghost icon={<Play size={12} />} loading={busy} disabled={runState === "running"} onClick={() => void run(target, "deploy")}>部署</Button><Space size={2}><Button size="small" type="text" icon={<RotateCcw size={14} />} disabled={runState === "running"} onClick={() => void run(target, "rollback")} title="回滚" /><Button size="small" type="text" icon={<History size={14} />} onClick={() => void showHistory(target)} title="发布历史" /><Button size="small" type="text" icon={<Pencil size={14} />} onClick={() => openEdit(target)} title="编辑目标" /><Popconfirm title="确认删除该部署目标？" onConfirm={() => void remove(target)}><Button size="small" danger type="text" icon={<Trash2 size={14} />} title="删除" /></Popconfirm></Space></div>
            </Card>;
          })}</div>}
      </section>

      <section className="rounded-xl border border-slate-800 bg-surface-900 p-4"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-bold text-white"><Layers3 size={16} className="text-violet-400" />部署组（编排 · 勾选要发布的统一步骤）</div><Button type="link" size="small" onClick={() => message.info("部署组编排将在部署目标稳定后开放")}>+ 新建部署组</Button></div><div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-800 bg-surface-950/60 p-7 text-center text-slate-400"><Layers3 size={30} className="text-slate-600" /><p className="m-0">还没有部署组，把后端、前端、移动端等目标组合成一组即可一键部署。</p><Button size="small" onClick={() => message.info("请先创建至少两个部署目标")}>+ 创建部署组</Button></div></section>

      <section className="space-y-2"><div className="flex items-center gap-1.5 text-xs font-bold text-white"><FileCode2 size={16} className="text-amber-400" />部署配方 <span className="font-normal text-slate-500">（开箱即用）</span></div><div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">{RECIPES.map((recipe) => <button key={recipe.value} type="button" onClick={() => openCreate(recipe.value)} className="rounded-xl border border-slate-800 bg-surface-900 p-3.5 text-left transition hover:border-slate-600"><div className="flex items-center justify-between"><span className="font-mono font-bold text-white">{recipe.label}</span><Tag bordered={false} className="m-0 text-[10px]">内置</Tag></div><p className="mt-2 min-h-9 text-[11px] leading-relaxed text-slate-400">{recipe.description}</p><div className="mt-2 flex gap-1 font-mono text-[10px]">{recipe.tags.map((tag) => <span key={tag} className="rounded bg-surface-950 px-1.5 py-0.5 text-slate-400">{tag}</span>)}</div></button>)}</div></section>

      {activeTarget && <section className="rounded-xl border border-slate-800 bg-surface-900 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 text-xs font-bold text-white"><TerminalSquare size={16} className="text-cyan-400" />部署执行面板 · {activeTarget.name}<Tag color={runState === "success" ? "success" : runState === "failed" ? "error" : "processing"}>{runState === "running" ? "执行中" : runState === "success" ? "成功" : runState === "failed" ? "失败" : "等待"}</Tag></div>{elapsedMs !== null && <Text type="secondary">耗时 {elapsedMs}ms</Text>}</div><div className="mt-3 rounded border border-slate-800 bg-black p-3 font-mono text-[11px] leading-relaxed"><div className="mb-2 text-cyan-300">{progress?.targetId === activeTarget.id ? `${progress.stage}: ${progress.message}` : "等待执行"}</div><pre className="m-0 max-h-48 overflow-auto whitespace-pre-wrap text-emerald-300">{runOutput || "暂无日志"}</pre>{runError && <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-rose-300">{runError}</pre>}</div>{runState === "success" && <Alert className="mt-3" type="success" showIcon icon={<CheckCircle2 size={16} />} message="部署已完成，远端健康检查通过或命令正常退出。" />}</section>}

      <Modal title={editing ? "编辑部署目标" : "新建部署目标"} open={modalOpen} onCancel={() => setModalOpen(false)} destroyOnClose footer={null} width={600}><Form form={form} layout="vertical" onFinish={(values) => void save(values)} initialValues={{ recipe: "docker-compose", remotePath: "/opt/apps/my-app" }}><Form.Item name="name" label="目标名称" rules={[{ required: true, message: "请输入目标名称" }, { max: 80, message: "名称不能超过 80 个字符" }]}><Input placeholder="例如 remote_relay" /></Form.Item><Form.Item name="serverId" label="部署服务器" rules={[{ required: true, message: "请选择服务器" }]}><Select placeholder="选择 Linux SSH 服务器" options={servers.filter((server) => server.os_type === "linux").map((server) => ({ value: server.id, label: `${server.alias} · ${server.hostname}` }))} /></Form.Item><Form.Item name="recipe" label="部署配方" rules={[{ required: true }]}><Select options={RECIPES.map((recipe) => ({ value: recipe.value, label: recipe.label }))} /></Form.Item><Form.Item name="remotePath" label="远端路径" rules={[{ required: true, message: "请输入绝对路径" }, { pattern: /^\/(?!.*\.\.)[^\r\n]*$/, message: "必须是安全的绝对路径" }]}><Input prefix="/" placeholder="/opt/apps/my-app" /></Form.Item><Form.Item name="artifactPath" label="制品路径（可选）" extra="可以是远端已存在的文件或目录；凭据不会写入部署目标"><Input placeholder="/tmp/releases/my-app.tar.gz" /></Form.Item><Form.Item name="healthCommand" label="健康检查命令（可选）"><Input placeholder="curl -fsS http://127.0.0.1:8080/health" /></Form.Item><div className="flex justify-end gap-2"><Button onClick={() => setModalOpen(false)}>取消</Button><Button type="primary" htmlType="submit">保存目标</Button></div></Form></Modal>

      <Modal title={`发布历史${historyTarget ? ` · ${historyTarget.name}` : ""}`} open={historyOpen} onCancel={() => setHistoryOpen(false)} footer={null} width={760}>{historyLoading ? <div className="py-8 text-center"><Spin /></div> : history.length === 0 ? <Empty description="暂无发布记录" /> : <div className="max-h-[480px] space-y-2 overflow-auto">{history.map((item) => <div key={item.id} className="rounded border border-slate-800 bg-surface-950 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><Space><Tag color={item.status === "success" ? "success" : "error"}>{item.status}</Tag><Text strong>{item.action === "rollback" ? "回滚" : "部署"} · {item.version}</Text></Space><Text type="secondary">{item.createdAt}</Text></div>{item.output && <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap text-xs text-emerald-300">{item.output}</pre>}{item.error && <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap text-xs text-rose-300">{item.error}</pre>}</div>)}</div>}</Modal>
    </div>
  );
}
