import { useEffect, useMemo, useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
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
  DeploymentArtifact,
  DeploymentGroup,
  DeploymentHistory,
  DeploymentProgress,
  Server,
} from "@/types";
import "@/pages/deployment/deployment.css";

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
type WizardValues = { name: string; recipe: string; serverId: number; remotePath: string };

export default function DeploymentPage() {
  const [targets, setTargets] = useState<DeployTarget[]>([]);
  const [artifacts, setArtifacts] = useState<DeploymentArtifact[]>([]);
  const [artifactRoots, setArtifactRoots] = useState<string[]>([]);
  const [groups, setGroups] = useState<DeploymentGroup[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editing, setEditing] = useState<DeployTarget | null>(null);
  const [editingGroup, setEditingGroup] = useState<DeploymentGroup | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<DeployTarget | null>(null);
  const [history, setHistory] = useState<DeploymentHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [runState, setRunState] = useState<RunState>("idle");
  const [activeTarget, setActiveTarget] = useState<DeployTarget | null>(null);
  const [activeGroup, setActiveGroup] = useState<DeploymentGroup | null>(null);
  const [runOutput, setRunOutput] = useState("");
  const [runError, setRunError] = useState("");
  const [progress, setProgress] = useState<DeploymentProgress | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [runVerification, setRunVerification] = useState<"passed" | "unverified" | "failed">("unverified");
  const [form] = Form.useForm<DeployTargetInput>();
  const [groupForm] = Form.useForm();
  const [wizardForm] = Form.useForm<WizardValues>();

  const load = async () => {
    setLoading(true);
    try {
      const [nextTargets, nextGroups, nextServers, nextArtifacts, nextArtifactRoots] = await Promise.all([deploymentApi.listTargets(), deploymentApi.listGroups(), serverApi.list(), deploymentApi.listArtifacts(), deploymentApi.listArtifactRoots()]);
      setTargets(nextTargets); setGroups(nextGroups); setServers(nextServers); setArtifacts(nextArtifacts); setArtifactRoots(nextArtifactRoots);
    } catch (error) { message.error(getErrorMessage(error)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    let disposed = false; let unlisten: (() => void) | undefined;
    void listen<DeploymentProgress>("deployment-progress", (event) => {
      if (!disposed) { setProgress(event.payload); setRunOutput((current) => current ? `${current}\n${event.payload.message}` : event.payload.message); }
    }).then((stop) => { if (disposed) stop(); else unlisten = stop; }).catch(() => undefined);
    return () => { disposed = true; unlisten?.(); };
  }, []);

  const serverMap = useMemo(() => new Map(servers.map((server) => [server.id, server])), [servers]);
  const linuxServers = useMemo(() => servers.filter((server) => server.os_type === "linux"), [servers]);
  const recipeOptions = RECIPES.map((recipe) => ({ value: recipe.value, label: recipe.label }));
  const targetOptions = targets.map((target) => ({ value: target.id, label: target.name }));

  const openCreate = (recipe?: string) => {
    setEditing(null); form.resetFields();
    form.setFieldsValue({ recipe: recipe ?? "docker-compose", remotePath: "/opt/apps/my-app", artifactPath: "", healthCommand: "",  });
    setModalOpen(true);
  };
  const openEdit = (target: DeployTarget) => { setEditing(target); form.setFieldsValue(target); setModalOpen(true); };
  const authorizeArtifactDirectory = async () => {
    const selected = await openFileDialog({ directory: true, multiple: false, title: "授权本地产物目录" });
    if (!selected || Array.isArray(selected)) return;
    try { await deploymentApi.authorizeArtifactRoot(selected); message.success("本地产物目录已授权"); await load(); }
    catch (error) { message.error(getErrorMessage(error)); }
  };
  const registerArtifact = async () => {
    if (artifactRoots.length === 0) { message.warning("请先授权本地产物目录"); return; }
    const selected = await openFileDialog({ directory: false, multiple: false, title: "选择要登记的部署制品" });
    if (!selected || Array.isArray(selected)) return;
    try { await deploymentApi.registerArtifact(selected); message.success("制品已登记并计算 SHA-256"); await load(); }
    catch (error) { message.error(getErrorMessage(error)); }
  };
  const save = async (values: DeployTargetInput) => {
    try {
      await deploymentApi.saveTarget({ ...values, id: editing?.id, artifactPath: values.artifactPath?.trim(), healthCommand: values.healthCommand?.trim() });
      message.success(editing ? "部署目标已更新" : "部署目标已创建"); setModalOpen(false); await load();
    } catch (error) { message.error(getErrorMessage(error)); }
  };
  const remove = async (target: DeployTarget) => {
    try { await deploymentApi.deleteTarget(target.id); message.success("部署目标已删除"); await load(); }
    catch (error) { message.error(getErrorMessage(error)); }
  };
  const run = async (target: DeployTarget, action: "deploy" | "rollback") => {
    if (runState === "running") return;
    setActiveTarget(target); setActiveGroup(null); setRunState("running"); setRunVerification("unverified"); setRunOutput(""); setRunError(""); setElapsedMs(null);
    setProgress({ targetId: target.id, stage: "queued", message: action === "deploy" ? "正在准备部署" : "正在准备回滚", completed: false });
    const started = performance.now();
    try {
      const result = action === "deploy" ? await deploymentApi.deployTarget({ targetId: target.id }) : await deploymentApi.rollbackTarget({ targetId: target.id });
      setRunOutput(result.stdout || result.history.output || "命令已完成，但没有输出"); setRunError(result.stderr || result.history.error || ""); setElapsedMs(result.durationMs ?? Math.round(performance.now() - started)); setRunVerification(result.history.verificationStatus === "passed" ? "passed" : result.history.verificationStatus === "failed" ? "failed" : "unverified"); setRunState(result.exitCode === 0 ? "success" : "failed");
      message[result.exitCode === 0 ? "success" : "error"](result.exitCode === 0 ? `${action === "deploy" ? "部署" : "回滚"}完成` : "远端命令执行失败");
    } catch (error) { setElapsedMs(Math.round(performance.now() - started)); setRunError(getErrorMessage(error)); setRunState("failed"); message.error(getErrorMessage(error)); }
  };
  const executeGroup = async (group: DeploymentGroup, canaryFirst: boolean) => {
    if (runState === "running") return;
    setActiveTarget(null); setActiveGroup(group); setRunState("running"); setRunVerification("unverified"); setRunOutput(""); setRunError(""); setElapsedMs(null);
    const started = performance.now();
    try {
      const result = await deploymentApi.deployGroup(group.id, canaryFirst);
      const output = result.results.flatMap((item) => [item.stdout, item.stderr].filter(Boolean)).join("\n");
      const canaryMessage = result.stoppedAfterCanaryFailure ? "灰度首台失败，已停止后续目标" : "";
      setRunOutput(output || "部署组已执行，但没有输出");
      setRunVerification(result.results.every((item) => item.history.verificationStatus === "passed") ? "passed" : result.results.some((item) => item.history.verificationStatus === "failed") ? "failed" : "unverified");
      setRunError(result.success ? canaryMessage : `部署组中存在失败目标${canaryMessage ? `；${canaryMessage}` : ""}`);
      setElapsedMs(Math.round(performance.now() - started));
      setRunState(result.success ? "success" : "failed");
      message[result.success ? "success" : "error"](result.success ? "部署组执行完成" : (canaryMessage || "部署组执行失败"));
    } catch (error) { setElapsedMs(Math.round(performance.now() - started)); setRunError(getErrorMessage(error)); setRunState("failed"); message.error(getErrorMessage(error)); }
  };
  const runGroup = (group: DeploymentGroup) => {
    if (runState === "running") return;
    if (group.targetIds.length <= 1) {
      void executeGroup(group, false);
      return;
    }
    Modal.confirm({
      title: "多机部署确认",
      content: `本次将影响 ${group.targetIds.length} 台服务器。建议先在首台服务器灰度验证，再继续其余目标。`,
      closable: false,
      maskClosable: false,
      keyboard: false,
      okText: "先灰度首台",
      cancelText: "全量执行",
      onOk: () => executeGroup(group, true),
      onCancel: () => executeGroup(group, false),
    });
  };
  const openGroup = (group?: DeploymentGroup) => { setEditingGroup(group ?? null); groupForm.resetFields(); groupForm.setFieldsValue(group ?? { stopOnFail: true, targetIds: [] }); setGroupModalOpen(true); };
  const saveGroup = async (values: { name: string; description?: string; stopOnFail?: boolean; targetIds: string[] }) => {
    try { await deploymentApi.saveGroup({ ...values, id: editingGroup?.id, targetIds: values.targetIds ?? [] }); message.success(editingGroup ? "部署组已更新" : "部署组已创建"); setGroupModalOpen(false); await load(); }
    catch (error) { message.error(getErrorMessage(error)); }
  };
  const removeGroup = async (group: DeploymentGroup) => { try { await deploymentApi.deleteGroup(group.id); message.success("部署组已删除"); await load(); } catch (error) { message.error(getErrorMessage(error)); } };
  const showHistory = async (target: DeployTarget) => { setHistoryTarget(target); setHistoryOpen(true); setHistoryLoading(true); try { setHistory(await deploymentApi.listHistory(target.id)); } catch (error) { message.error(getErrorMessage(error)); } finally { setHistoryLoading(false); } };
  const submitWizard = async (values: WizardValues) => { setWizardOpen(false); setEditing(null); form.resetFields(); form.setFieldsValue({ ...values, artifactPath: "", healthCommand: "",  }); setModalOpen(true); };

  return <div className="ops-page deployment-page flex min-h-full flex-col gap-5">
    <div className="deployment-page-head flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4"><div><h1 className="flex items-center gap-2 text-lg font-bold text-white"><Rocket size={21} className="text-cyan-400" />应用部署与发布管理</h1><p className="mt-1 text-sm text-slate-400">配方驱动 · 原子软链发布 · 失败自动回滚 · 多端编排</p></div><Space wrap><Button icon={<WandSparkles size={15} />} onClick={() => { wizardForm.resetFields(); wizardForm.setFieldsValue({ recipe: "docker-compose", remotePath: "/opt/apps/my-app" }); setWizardOpen(true); }}>新建方案（向导）</Button><Button type="primary" icon={<Plus size={15} />} onClick={() => openCreate()}>新建部署目标</Button></Space></div>
    <section className="deployment-section"><div className="deployment-section-title"><FileCode2 size={17} className="text-amber-400" /><span>本地部署制品</span><Tag>{artifacts.length}</Tag><Space className="ml-auto"><Button onClick={() => void authorizeArtifactDirectory()}>授权目录</Button><Button type="primary" onClick={() => void registerArtifact()}>登记制品</Button></Space></div><div className="deployment-target-meta"><div>授权目录：{artifactRoots.length ? artifactRoots.join("、") : "尚未授权"}</div><div>仅登记授权目录内的普通文件；文件上限 512 MiB，私钥、凭据和环境文件会被拒绝。</div></div>{artifacts.length > 0 && <div className="deployment-group-targets">{artifacts.map((artifact) => <Tag key={artifact.id} title={`${artifact.size} bytes · SHA-256 ${artifact.sha256}`}>{artifact.name} · {(artifact.size / 1024 / 1024).toFixed(1)} MiB</Tag>)}</div>}</section>

    <section className="deployment-section"><div className="deployment-section-title"><Box size={17} className="text-cyan-400" /><span>部署目标</span><Tag>{targets.length} 项活动目标</Tag></div>{loading ? <div className="flex justify-center py-12"><Spin /></div> : targets.length === 0 ? <Card className="deployment-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有部署目标，先创建一个目标吧" /><Button type="primary" icon={<Plus size={15} />} onClick={() => openCreate()}>创建部署目标</Button></Card> : <div className="deployment-target-grid">{targets.map((target) => { const server = serverMap.get(target.serverId); const busy = runState === "running" && activeTarget?.id === target.id; return <Card key={target.id} className="deployment-target-card" styles={{ body: { padding: 16 } }}><div className="deployment-card-head"><div className="min-w-0"><div className="deployment-card-name"><Box size={16} className="text-cyan-400" /><span>{target.name}</span><Tag bordered={false}>{target.recipe}</Tag></div><div className="deployment-card-server"><span className="deployment-status-dot" />{server ? `${server.alias} · ${server.hostname}` : "未找到绑定服务器"}</div></div></div><div className="deployment-target-meta"><div title={target.remotePath}>远端目录：{target.remotePath}</div><div>制品：{target.artifactPath || "按目标目录现有内容"}</div></div><div className="deployment-card-actions"><Button size="middle" type="primary" ghost icon={<Play size={14} />} loading={busy} disabled={runState === "running"} onClick={() => void run(target, "deploy")}>部署</Button><Space size={2}><Button size="small" type="text" icon={<RotateCcw size={15} />} disabled={runState === "running"} onClick={() => void run(target, "rollback")} title="回滚" /><Button size="small" type="text" icon={<History size={15} />} onClick={() => void showHistory(target)} title="发布历史" /><Button size="small" type="text" icon={<Pencil size={15} />} onClick={() => openEdit(target)} title="编辑目标" /><Popconfirm title="确认删除该部署目标？" onConfirm={() => void remove(target)}><Button size="small" danger type="text" icon={<Trash2 size={15} />} title="删除" /></Popconfirm></Space></div></Card>; })}</div>}</section>

    <section className="deployment-section"><div className="deployment-section-title"><Layers3 size={17} className="text-violet-400" /><span>部署组</span><Tag>{groups.length}</Tag><span className="deployment-section-hint">把多个目标编成一组，按顺序执行</span><Button type="link" size="middle" className="ml-auto" onClick={() => openGroup()}>+ 新建部署组</Button></div>{groups.length === 0 ? <div className="deployment-empty deployment-group-empty"><Layers3 size={34} className="text-slate-600" /><p>还没有部署组，把后端、前端、移动端等目标组合成一组即可一键部署。</p><Button onClick={() => openGroup()}>创建部署组</Button></div> : <div className="deployment-group-grid">{groups.map((group) => <Card key={group.id} className="deployment-group-card" styles={{ body: { padding: 16 } }}><div className="deployment-card-name"><Layers3 size={16} className="text-violet-400" /><span>{group.name}</span><Tag color={group.stopOnFail ? "gold" : "default"}>{group.stopOnFail ? "失败即停" : "继续执行"}</Tag><Tag color={group.targetIds.length > 3 ? "warning" : "default"}>{group.targetIds.length} 台服务器</Tag></div>{group.targetIds.length > 3 && <Alert className="my-2" type="warning" showIcon message={`爆炸半径：本次最多影响 ${group.targetIds.length} 台服务器，建议先灰度验证。`} />}{group.description && <p className="deployment-group-description">{group.description}</p>}<div className="deployment-group-targets">{group.targetIds.map((id, index) => <Tag key={id}>{index + 1}. {targets.find((target) => target.id === id)?.name ?? "目标已删除"}</Tag>)}</div><div className="deployment-card-actions"><Button type="primary" ghost icon={<Play size={14} />} disabled={runState === "running"} onClick={() => runGroup(group)}>一键部署</Button><Space size={2}><Button size="small" type="text" icon={<Pencil size={15} />} onClick={() => openGroup(group)} title="编辑部署组" /><Popconfirm title="确认删除该部署组？" onConfirm={() => void removeGroup(group)}><Button size="small" danger type="text" icon={<Trash2 size={15} />} title="删除" /></Popconfirm></Space></div></Card>)}</div>}</section>

    <section className="deployment-section"><div className="deployment-section-title"><FileCode2 size={17} className="text-amber-400" /><span>部署配方</span><span className="deployment-section-hint">7 个内置模板，点击后快速创建目标</span></div><div className="deployment-recipe-grid">{RECIPES.map((recipe) => <button key={recipe.value} type="button" onClick={() => openCreate(recipe.value)} className="deployment-recipe-card"><div className="deployment-card-name"><FileCode2 size={15} className="text-slate-400" /><span>{recipe.label}</span><Tag bordered={false}>内置</Tag></div><p>{recipe.description}</p><div className="deployment-recipe-tags">{recipe.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></button>)}</div></section>

    {(activeTarget || activeGroup) && <section className="deployment-section deployment-run-panel"><div className="deployment-section-title"><TerminalSquare size={17} className="text-cyan-400" /><span>部署执行面板 · {activeTarget?.name ?? activeGroup?.name}</span><Tag color={runState === "success" ? "success" : runState === "failed" ? "error" : "processing"}>{runState === "running" ? "执行中" : runState === "success" ? "成功" : runState === "failed" ? "失败" : "等待"}</Tag>{elapsedMs !== null && <Text type="secondary">耗时 {elapsedMs}ms</Text>}</div><div className="deployment-console"><div className="mb-2 text-cyan-300">{progress ? `${progress.stage}: ${progress.message}` : "等待执行"}</div><pre>{runOutput || "暂无日志"}</pre>{runError && <pre className="deployment-console-error">{runError}</pre>}</div>{runState === "success" && <Alert className="mt-3" type={runVerification === "passed" ? "success" : "warning"} showIcon icon={<CheckCircle2 size={16} />} message={runVerification === "passed" ? "部署与远端健康检查均已通过。" : "部署命令已完成，但未配置健康检查（未验证）。"} />}{runState === "failed" && <Alert className="mt-3" type="error" showIcon message={runVerification === "failed" ? "健康检查失败，不能视为部署健康成功。" : "部署未通过，请查看分段输出。"} />}</section>}

    <Modal className="deployment-modal" rootClassName="deployment-modal-root" title={editing ? "编辑部署目标" : "新建部署目标"} open={modalOpen} onCancel={() => setModalOpen(false)} destroyOnClose maskClosable={false} footer={null} width={780} centered styles={{ body: { maxHeight: "calc(90vh - 150px)", overflowY: "auto" } }}><Form form={form} layout="vertical" onFinish={(values) => void save(values)} initialValues={{ recipe: "docker-compose", remotePath: "/opt/apps/my-app" }}><div className="deployment-form-grid"><Form.Item name="name" label="目标名称" rules={[{ required: true, message: "请输入目标名称" }, { max: 80, message: "名称不能超过 80 个字符" }]}><Input placeholder="例如 prod-web" /></Form.Item><Form.Item name="recipe" label="部署配方" rules={[{ required: true, message: "请选择部署配方" }]}><Select options={recipeOptions} /></Form.Item></div><Form.Item name="serverId" label="目标服务器" rules={[{ required: true, message: "请选择 Linux SSH 服务器" }]}><Select showSearch optionFilterProp="label" placeholder="选择 Linux SSH 服务器" options={linuxServers.map((server) => ({ value: server.id, label: `${server.alias} · ${server.hostname}` }))} /></Form.Item><Form.Item name="remotePath" label="部署根目录" rules={[{ required: true, message: "请输入绝对路径" }, { pattern: /^\/(?!.*\.\.)[^\r\n]*$/, message: "必须是安全的绝对路径" }]}><Input placeholder="/opt/apps/my-app" /></Form.Item><div className="deployment-form-grid"><Form.Item name="artifactPath" label="远端制品路径（可选）"><Input placeholder="/tmp/releases/my-app.tar.gz" /></Form.Item><Form.Item name="artifactId" label="本地制品（可选）"><Select allowClear placeholder="不上传本地制品" options={artifacts.map((artifact) => ({ value: artifact.id, label: `${artifact.name} · ${(artifact.size / 1024 / 1024).toFixed(1)} MiB` }))} /></Form.Item></div><div className="deployment-form-switches"></div><Form.Item name="healthCommand" label="健康检查命令（可选）"><Input placeholder="curl -fsS http://127.0.0.1:8080/health" /></Form.Item><div className="deployment-modal-footer"><Button onClick={() => setModalOpen(false)}>取消</Button><Button type="primary" htmlType="submit">保存目标</Button></div></Form></Modal>

    <Modal className="deployment-modal" rootClassName="deployment-modal-root" title="新建部署方案（向导）" open={wizardOpen} onCancel={() => setWizardOpen(false)} destroyOnClose maskClosable={false} footer={null} width={650} centered styles={{ body: { maxHeight: "calc(85vh - 150px)", overflowY: "auto" } }}><Form form={wizardForm} layout="vertical" onFinish={(values) => void submitWizard(values)}><Form.Item name="name" label="方案名称" rules={[{ required: true, message: "请输入方案名称" }]}><Input placeholder="例如 frontend-prod" /></Form.Item><div className="deployment-form-grid"><Form.Item name="recipe" label="部署配方" rules={[{ required: true }]}><Select options={recipeOptions} /></Form.Item><Form.Item name="serverId" label="目标服务器" rules={[{ required: true, message: "请选择服务器" }]}><Select placeholder="选择 Linux SSH 服务器" options={linuxServers.map((server) => ({ value: server.id, label: `${server.alias} · ${server.hostname}` }))} /></Form.Item></div><Form.Item name="remotePath" label="远端部署目录" rules={[{ required: true, message: "请输入远端目录" }]}><Input placeholder="/opt/apps/my-app" /></Form.Item><Alert type="info" showIcon message="向导会先创建部署目标，保存后可继续补充制品、健康检查和回滚策略。" /><div className="deployment-modal-footer"><Button onClick={() => setWizardOpen(false)}>取消</Button><Button type="primary" htmlType="submit">创建目标并继续配置</Button></div></Form></Modal>

    <Modal className="deployment-modal" rootClassName="deployment-modal-root" title={editingGroup ? "编辑部署组" : "新建部署组"} open={groupModalOpen} onCancel={() => setGroupModalOpen(false)} destroyOnClose maskClosable={false} footer={null} width={640} centered styles={{ body: { maxHeight: "calc(85vh - 150px)", overflowY: "auto" } }}><Form form={groupForm} layout="vertical" onFinish={(values) => void saveGroup(values)} initialValues={{ stopOnFail: true, targetIds: [] }}><Form.Item name="name" label="组名称" rules={[{ required: true, message: "请输入组名称" }, { max: 80, message: "名称不能超过 80 个字符" }]}><Input placeholder="例如 ruoyi-全栈" /></Form.Item><Form.Item name="description" label="说明（可选）"><Input placeholder="例如 后端 + 前端 + 移动端" /></Form.Item><Form.Item name="stopOnFail" valuePropName="checked" label="失败即停"><Switch /></Form.Item><Form.Item name="targetIds" label="组内目标（从上到下为部署顺序）" rules={[{ required: true, type: "array", min: 1, message: "至少选择一个部署目标" }]}><Checkbox.Group className="deployment-target-checks" options={targetOptions} /></Form.Item><div className="deployment-modal-footer"><Button onClick={() => setGroupModalOpen(false)}>取消</Button><Button type="primary" htmlType="submit">保存部署组</Button></div></Form></Modal>

    <Modal className="deployment-modal" rootClassName="deployment-modal-root" title={`发布历史${historyTarget ? ` · ${historyTarget.name}` : ""}`} open={historyOpen} onCancel={() => setHistoryOpen(false)} footer={null} width={760} centered styles={{ body: { maxHeight: "calc(85vh - 150px)", overflowY: "auto" } }}>{historyLoading ? <div className="py-8 text-center"><Spin /></div> : history.length === 0 ? <Empty description="暂无发布记录" /> : <div className="deployment-history-list">{history.map((item) => <div key={item.id} className="deployment-history-item"><div className="flex flex-wrap items-center justify-between gap-2"><Space><Tag color={item.status === "success" ? "success" : "error"}>{item.status}</Tag><Text strong>{item.action === "rollback" ? "回滚" : "部署"} · {item.version}</Text></Space><Text type="secondary">{item.createdAt}</Text></div><div className="mt-2 flex flex-wrap gap-2"><Tag color={item.verificationStatus === "passed" ? "success" : item.verificationStatus === "failed" ? "error" : "default"}>健康检查：{item.verificationStatus === "passed" ? "通过" : item.verificationStatus === "failed" ? "失败" : item.verificationStatus === "not_configured" ? "未配置（未验证）" : item.verificationStatus === "pending" ? "进行中" : "未执行"}</Tag>{item.action === "rollback" && <Tag color={item.rollbackStatus === "succeeded" ? "success" : "error"}>回滚：{item.rollbackStatus === "succeeded" ? "成功" : "失败"}</Tag>}</div>{item.output && <pre>{item.output}</pre>}{item.error && <pre className="deployment-console-error">{item.error}</pre>}</div>)}</div>}</Modal>
  </div>;
}

undefined
