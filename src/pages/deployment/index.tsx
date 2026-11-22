import { useCallback, useEffect, useRef, useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { Alert, Button, Empty, Modal, Popconfirm, Space, Spin, Tag, message } from "antd";
import {
  Box, FileCode2, Folder, History, Layers3, Pencil, Plus, RefreshCw, Rocket,
  RotateCcw, Server as ServerIcon, TerminalSquare, Trash2, WandSparkles,
} from "lucide-react";
import { WorkspaceSidebarSlot } from "@/components/layout/WorkspaceNavigation";
import { getErrorMessage } from "@/lib/api/client";
import { deploymentApi } from "@/lib/api/deployment";
import { serverApi } from "@/lib/api/server";
import type { DeployTarget, DeployTargetInput, DeploymentArtifact, DeploymentGroup, DeploymentGroupInput, Server } from "@/types";
import { DeployWizard, GroupEditor, TargetEditor } from "./DeploymentEditors";
import { HistoryDialog, RunPanel } from "./DeploymentResults";
import { startDeploymentRun, useDeploymentRun } from "./deploymentRun";
import { RECIPES } from "./recipes";
import "./deployment.css";

export default function DeploymentPage() {
  const [targets, setTargets] = useState<DeployTarget[]>([]);
  const [groups, setGroups] = useState<DeploymentGroup[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [artifacts, setArtifacts] = useState<DeploymentArtifact[]>([]);
  const [artifactRoots, setArtifactRoots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [artifactAction, setArtifactAction] = useState<"authorize" | "register" | null>(null);
  const [targetEditor, setTargetEditor] = useState<Partial<DeployTargetInput> | null>(null);
  const [groupEditor, setGroupEditor] = useState<Partial<DeploymentGroupInput> | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<DeployTarget | null | undefined>();
  const [groupToRun, setGroupToRun] = useState<DeploymentGroup | null>(null);
  const run = useDeploymentRun((state) => state.run);
  const running = run?.status === "running";
  const loadVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setLoadError("");
    try {
      const [nextTargets, nextGroups, nextServers, nextArtifacts, nextRoots] = await Promise.all([
        deploymentApi.listTargets(), deploymentApi.listGroups(), serverApi.list(),
        deploymentApi.listArtifacts(), deploymentApi.listArtifactRoots(),
      ]);
      if (version !== loadVersion.current) return;
      setTargets(nextTargets);
      setGroups(nextGroups);
      setServers(nextServers);
      setArtifacts(nextArtifacts);
      setArtifactRoots(nextRoots);
    } catch (error) {
      if (version === loadVersion.current) setLoadError(getErrorMessage(error));
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { loadVersion.current += 1; };
  }, [load]);

  const serverMap = new Map(servers.map((server) => [server.id, server]));
  const targetMap = new Map(targets.map((target) => [target.id, target]));
  const artifactMap = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const serverOptions = servers.filter((server) => server.os_type === "linux" && (!server.protocol || server.protocol === "ssh"))
    .map((server) => ({ value: server.id, label: `${server.alias} · ${server.hostname}` }));
  const targetOptions = targets.map((target) => ({ value: target.id, label: target.name }));
  const artifactOptions = artifacts.map((item) => ({ value: item.id, label: `${item.name} · ${(item.size / 1024 / 1024).toFixed(1)} MiB` }));

  const unavailable = loading || Boolean(loadError);

  async function manageArtifact(action: "authorize" | "register") {
    if (artifactAction) return;
    if (action === "register" && artifactRoots.length === 0) {
      message.warning("请先授权本地产物目录");
      return;
    }
    const authorize = action === "authorize";
    setArtifactAction(action);
    try {
      const selected = await openFileDialog({
        directory: authorize, multiple: false, title: authorize ? "授权本地产物目录" : "选择要登记的部署制品",
      });
      if (!selected || Array.isArray(selected)) return;
      if (authorize) await deploymentApi.authorizeArtifactRoot(selected);
      else await deploymentApi.registerArtifact(selected);
      message.success(authorize ? "本地产物目录已授权" : "制品已登记并计算 SHA-256");
      await load();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setArtifactAction(null);
    }
  }

  async function saveTarget(values: DeployTargetInput) {
    await deploymentApi.saveTarget({
      ...values, id: targetEditor?.id, artifactPath: values.artifactPath?.trim(), healthCommand: values.healthCommand?.trim(),
    });
    message.success(targetEditor?.id ? "部署目标已更新" : "部署目标已创建");
    setTargetEditor(null);
    await load();
  }

  async function saveGroup(values: DeploymentGroupInput) {
    await deploymentApi.saveGroup({ ...values, id: groupEditor?.id });
    message.success(groupEditor?.id ? "部署组已更新" : "部署组已创建");
    setGroupEditor(null);
    await load();
  }

  async function remove(kind: "target" | "group", id: string) {
    const label = kind === "target" ? "部署目标" : "部署组";
    try {
      const removed = kind === "target" ? await deploymentApi.deleteTarget(id) : await deploymentApi.deleteGroup(id);
      if (removed) message.success(`${label}已删除`);
      else message.warning(`${label}已不存在`);
      await load();
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  }

  function executeGroup(group: DeploymentGroup, canaryFirst: boolean) {
    setGroupToRun(null);
    void startDeploymentRun({
      action: "group", id: group.id, name: group.name, canaryFirst,
      targets: group.targetIds.map((id) => ({ id, name: targetMap.get(id)?.name ?? "目标已删除" })),
    });
  }

  return (
    <div className="ops-page deployment-page">
      <WorkspaceSidebarSlot>
        <div className="deployment-sidebar-actions">
          <Button block icon={<WandSparkles size={15} />} disabled={unavailable || running}
            onClick={() => setWizardOpen(true)}>新建方案（向导）</Button>
        </div>
      </WorkspaceSidebarSlot>

      <header className="deployment-page-head">
        <h1><Rocket size={20} aria-hidden />部署</h1>
        <Space wrap>
          <Button icon={<RefreshCw size={15} />} aria-label="刷新部署列表" title="刷新部署列表" loading={loading} onClick={() => void load()} />
          {run && <Button icon={<TerminalSquare size={15} />} onClick={() => {
            document.getElementById("deployment-current-run")?.focus();
          }}>本次执行</Button>}
          <Button icon={<History size={15} />} onClick={() => setHistoryTarget(null)}>发布历史</Button>
          <Button icon={<WandSparkles size={15} />} disabled={unavailable || running} onClick={() => setWizardOpen(true)}>新建方案（向导）</Button>
          <Button type="primary" icon={<Plus size={15} />} disabled={unavailable || running} onClick={() => setTargetEditor({})}>新建部署目标</Button>
        </Space>
      </header>

      {loadError && <Alert type="error" showIcon message="部署列表加载失败" description={loadError}
        action={<Button onClick={() => void load()}>重试</Button>} />}

      <section className="deployment-section" aria-label="部署目标">
        <div className="deployment-section-title"><Rocket size={17} aria-hidden /><h2>部署目标</h2><Tag>{targets.length}</Tag></div>
        {loading && targets.length === 0 ? <div className="deployment-loading"><Spin /></div>
          : !loadError && targets.length === 0 ? (
            <Empty className="deployment-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无部署目标" />
          ) : (
            <div className="deployment-target-grid">
              {targets.map((target) => {
                const server = serverMap.get(target.serverId);
                const artifact = target.artifactId ? artifactMap.get(target.artifactId) : undefined;
                const busy = running && run.request.action !== "group" && run.request.targets[0].id === target.id;
                return (
                  <article key={target.id} className="deployment-target-card">
                    <div className="deployment-card-name"><Rocket size={16} aria-hidden /><h3>{target.name}</h3><Tag>{target.recipe}</Tag></div>
                    <div className="deployment-target-meta">
                      <div><ServerIcon size={14} aria-hidden /><span>{server ? `${server.alias} · ${server.hostname}` : "未找到绑定服务器"}</span></div>
                      <div><Folder size={14} aria-hidden /><code>{target.remotePath}</code></div>
                      {(target.artifactPath || target.artifactId) && <div><Box size={14} aria-hidden />
                        <span>{[artifact?.name ?? (target.artifactId ? "制品记录不可用" : ""), target.artifactPath].filter(Boolean).join(" · ")}</span></div>}
                    </div>
                    <div className="deployment-card-actions">
                      <Button type="primary" icon={<Rocket size={15} />} loading={busy && run.request.action === "deploy"}
                        disabled={unavailable || running} onClick={() => void startDeploymentRun({ action: "deploy", name: target.name, targets: [target] })}>部署</Button>
                      <Space size={2} wrap>
                        <Button type="text" icon={<History size={15} />} title="部署日志/历史" aria-label="部署日志/历史" onClick={() => setHistoryTarget(target)} />
                        <Button type="text" icon={<RotateCcw size={15} />} title="回滚" aria-label="回滚"
                          loading={busy && run.request.action === "rollback"} disabled={unavailable || running}
                          onClick={() => void startDeploymentRun({ action: "rollback", name: target.name, targets: [target] })} />
                        <Button type="text" icon={<Pencil size={15} />} title="编辑部署目标" aria-label="编辑部署目标"
                          disabled={unavailable || running} onClick={() => setTargetEditor(target)} />
                        <Popconfirm title="确认删除该部署目标？" okText="删除" cancelText="取消" onConfirm={() => remove("target", target.id)}>
                          <Button danger type="text" icon={<Trash2 size={15} />} title="删除部署目标" aria-label="删除部署目标" disabled={unavailable || running} />
                        </Popconfirm>
                      </Space>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
      </section>

      {run && <RunPanel run={run} />}

      <section className="deployment-section" aria-label="部署组">
        <div className="deployment-section-title">
          <Layers3 size={17} aria-hidden /><h2>部署组</h2><Tag>{groups.length}</Tag>
          <Button className="deployment-section-action" type="link" icon={<Plus size={15} />}
            disabled={unavailable || running} onClick={() => setGroupEditor({})}>新建部署组</Button>
        </div>
        {!unavailable && groups.length === 0 && (
          <Empty className="deployment-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无部署组" />
        )}
        <div className="deployment-group-grid">
          {groups.map((group) => (
            <article key={group.id} className="deployment-group-card">
              <div className="deployment-card-name">
                <Layers3 size={16} aria-hidden /><h3>{group.name}</h3>
                <Tag color={group.stopOnFail ? "gold" : "default"}>{group.stopOnFail ? "失败即停" : "继续执行"}</Tag>
                <Tag>{group.targetIds.length} 个目标</Tag>
              </div>
              {group.description && <p className="deployment-group-description">{group.description}</p>}
              <ol className="deployment-group-targets">
                {group.targetIds.map((id, index) => <li key={`${id}-${index}`}>{index + 1}. {targetMap.get(id)?.name ?? "目标已删除"}</li>)}
              </ol>
              <div className="deployment-card-actions">
                <Button type="primary" icon={<Rocket size={15} />} disabled={unavailable || running || group.targetIds.length === 0}
                  loading={running && run.request.action === "group" && run.request.id === group.id}
                  onClick={() => group.targetIds.length > 1 ? setGroupToRun(group) : executeGroup(group, false)}>一键部署</Button>
                <Space size={2}>
                  <Button type="text" icon={<Pencil size={15} />} title="编辑部署组" aria-label="编辑部署组"
                    disabled={unavailable || running} onClick={() => setGroupEditor(group)} />
                  <Popconfirm title="确认删除该部署组？" okText="删除" cancelText="取消" onConfirm={() => remove("group", group.id)}>
                    <Button danger type="text" icon={<Trash2 size={15} />} title="删除部署组" aria-label="删除部署组" disabled={unavailable || running} />
                  </Popconfirm>
                </Space>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="deployment-section" aria-label="部署配方">
        <div className="deployment-section-title"><FileCode2 size={17} aria-hidden /><h2>部署配方</h2><Tag>{RECIPES.length}</Tag></div>
        <div className="deployment-recipe-grid">
          {RECIPES.map((recipe) => (
            <button key={recipe.value} className="deployment-recipe-card" type="button" disabled={unavailable || running}
              onClick={() => setTargetEditor({ recipe: recipe.value })}>
              <strong><FileCode2 size={15} aria-hidden />{recipe.value}</strong>
              <span>{recipe.description}</span>
              <span className="deployment-recipe-tags">{recipe.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="deployment-section" aria-label="本地部署制品">
        <div className="deployment-section-title">
          <Box size={17} aria-hidden /><h2>本地部署制品</h2><Tag>{artifacts.length}</Tag>
          <Space className="deployment-section-action" wrap>
            <Button disabled={unavailable || Boolean(artifactAction)} loading={artifactAction === "authorize"}
              onClick={() => void manageArtifact("authorize")}>授权目录</Button>
            <Button disabled={unavailable || Boolean(artifactAction)} loading={artifactAction === "register"}
              onClick={() => void manageArtifact("register")}>登记制品</Button>
          </Space>
        </div>
        <p className="deployment-artifact-roots">授权目录 · {artifactRoots.length ? artifactRoots.join("、") : "尚未授权"}</p>
        <p>仅支持授权目录内的普通文件，上限 512 MiB。</p>
        {artifacts.length > 0 && <ul className="deployment-group-targets">
          {artifacts.map((item) => (
            <li key={item.id} title={`${item.size} bytes · SHA-256 ${item.sha256}`}>
              {item.name} · {(item.size / 1024 / 1024).toFixed(1)} MiB
            </li>
          ))}
        </ul>}
      </section>

      {targetEditor && <TargetEditor initialValues={targetEditor} servers={serverOptions} artifacts={artifactOptions}
        onClose={() => setTargetEditor(null)} onSave={saveTarget} />}
      {wizardOpen && <DeployWizard servers={serverOptions} onClose={() => setWizardOpen(false)} onContinue={(values) => {
        setWizardOpen(false);
        setTargetEditor(values);
      }} />}
      {groupEditor && <GroupEditor initialValues={groupEditor} targets={targetOptions} onClose={() => setGroupEditor(null)} onSave={saveGroup} />}
      {historyTarget !== undefined && <HistoryDialog target={historyTarget} onClose={() => setHistoryTarget(undefined)} />}
      {groupToRun && (
        <Modal open centered maskClosable={false} className="deployment-modal" title={`执行部署组 · ${groupToRun.name}`}
          onCancel={() => setGroupToRun(null)} footer={[
            <Button key="cancel" onClick={() => setGroupToRun(null)}>取消</Button>,
            <Button key="all" onClick={() => executeGroup(groupToRun, false)}>全量执行</Button>,
            <Button key="canary" type="primary" onClick={() => executeGroup(groupToRun, true)}>先灰度首项</Button>,
          ]}>
          <p>按以下顺序执行。选择灰度时，首项目标失败会停止后续部署。</p>
          <ol className="deployment-confirm-targets">
            {groupToRun.targetIds.map((id, index) => <li key={`${id}-${index}`}>{targetMap.get(id)?.name ?? "目标已删除"}</li>)}
          </ol>
        </Modal>
      )}
    </div>
  );
}
