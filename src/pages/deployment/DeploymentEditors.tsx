import { useRef, useState } from "react";
import { Alert, Button, Checkbox, Form, Input, Modal, Select, Space, Switch } from "antd";
import { ChevronDown, ChevronUp } from "lucide-react";
import { getErrorMessage } from "@/lib/api/client";
import type { DeployTargetInput, DeploymentGroupInput } from "@/types";
import { RECIPE_OPTIONS, TARGET_DEFAULTS } from "./recipes";

type Option<T> = { value: T; label: string };
type WizardValues = Pick<DeployTargetInput, "name" | "recipe" | "serverId" | "remotePath">;

type EditorProps<T> = {
  initialValues: Partial<T>;
  onClose: () => void;
  onSave: (values: T) => Promise<void> | void;
};

const nameRules = [{ required: true, whitespace: true, message: "请输入名称" }, { max: 80, message: "名称不能超过 80 个字符" }];
const pathRules = [
  { required: true, message: "请输入部署根目录" },
  { pattern: /^\/(?!.*\.\.)[^\r\n]*$/, message: "请输入不含 .. 的远端绝对路径" },
];

function useSave<T>(onSave: EditorProps<T>["onSave"]) {
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save(values: T) {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      await onSave(values);
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  return { saving, error, save };
}

const modalProps = {
  open: true,
  centered: true,
  maskClosable: false,
  cancelText: "取消",
  className: "deployment-modal",
  styles: { body: { maxHeight: "calc(90vh - 150px)", overflowY: "auto" as const } },
};

export function TargetEditor({ initialValues, onClose, onSave, servers, artifacts }: EditorProps<DeployTargetInput> & {
  servers: Option<number>[];
  artifacts: Option<string>[];
}) {
  const [form] = Form.useForm<DeployTargetInput>();
  const { saving, error, save } = useSave(onSave);
  return (
    <Modal {...modalProps} title={initialValues.id ? "编辑部署目标" : "新建部署目标"}
      width={740} onCancel={onClose} cancelButtonProps={{ disabled: saving }}
      closable={!saving} keyboard={!saving} onOk={() => form.submit()} okText="保存目标" confirmLoading={saving}>
      <Form form={form} layout="vertical" initialValues={{ ...TARGET_DEFAULTS, ...initialValues }} onFinish={save}>
        <div className="deployment-form-grid">
          <Form.Item name="name" label="目标名称" rules={nameRules}>
            <Input placeholder="例如 prod-web" />
          </Form.Item>
          <Form.Item name="recipe" label="部署配方" rules={[{ required: true, message: "请选择部署配方" }]}>
            <Select options={RECIPE_OPTIONS} />
          </Form.Item>
        </div>
        <Form.Item name="serverId" label="目标服务器" rules={[{ required: true, message: "请选择 Linux SSH 服务器" }]}>
          <Select showSearch optionFilterProp="label" placeholder="选择 Linux SSH 服务器" options={servers} />
        </Form.Item>
        <Form.Item name="remotePath" label="部署根目录" rules={pathRules}>
          <Input placeholder="/opt/apps/my-app" />
        </Form.Item>
        <div className="deployment-form-grid">
          <Form.Item name="artifactPath" label="远端制品路径" dependencies={["artifactId"]}
            rules={[({ getFieldValue }) => ({
              required: Boolean(getFieldValue("artifactId")),
              whitespace: true,
              message: "使用本地制品时请输入远端制品路径",
            })]}>
            <Input placeholder="/tmp/releases/my-app.tar.gz" />
          </Form.Item>
          <Form.Item name="artifactId" label="本地制品（可选）">
            <Select allowClear placeholder="不选择本地制品" options={artifacts} />
          </Form.Item>
        </div>
        <Form.Item name="healthCommand" label="健康检查命令（可选）">
          <Input placeholder="curl -fsS http://127.0.0.1:8080/health" />
        </Form.Item>
        {error && <Alert type="error" showIcon message={error} />}
      </Form>
    </Modal>
  );
}

export function DeployWizard({ servers, onClose, onContinue }: {
  servers: Option<number>[];
  onClose: () => void;
  onContinue: (values: WizardValues) => void;
}) {
  const [form] = Form.useForm<WizardValues>();
  return (
    <Modal {...modalProps} title="新建部署方案（向导）" width={640}
      onCancel={onClose} onOk={() => form.submit()} okText="继续配置">
      <Form form={form} layout="vertical" initialValues={TARGET_DEFAULTS} onFinish={onContinue}>
        <Form.Item name="name" label="方案名称" rules={nameRules}>
          <Input placeholder="例如 frontend-prod" />
        </Form.Item>
        <div className="deployment-form-grid">
          <Form.Item name="recipe" label="部署配方" rules={[{ required: true }]}>
            <Select options={RECIPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="serverId" label="目标服务器" rules={[{ required: true, message: "请选择服务器" }]}>
            <Select showSearch optionFilterProp="label" placeholder="选择 Linux SSH 服务器" options={servers} />
          </Form.Item>
        </div>
        <Form.Item name="remotePath" label="部署根目录" rules={pathRules}>
          <Input placeholder="/opt/apps/my-app" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function OrderedTargets({ value = [], onChange, options, id }: {
  value?: string[];
  onChange?: (value: string[]) => void;
  options: Option<string>[];
  id?: string;
}) {
  function move(index: number, offset: number) {
    const next = [...value];
    const destination = index + offset;
    [next[index], next[destination]] = [next[destination], next[index]];
    onChange?.(next);
  }
  return (
    <div id={id} className="deployment-target-checks">
      {value.length > 0 && (
        <ol className="deployment-target-order" aria-label="部署顺序">
          {value.map((targetId, index) => {
            const label = options.find((option) => option.value === targetId)?.label ?? "目标已删除";
            return (
              <li key={targetId}>
                <span>{index + 1}. {label}</span>
                <Space size={2}>
                  <Button size="small" type="text" icon={<ChevronUp size={15} />} aria-label={`上移 ${label}`}
                    disabled={index === 0} onClick={() => move(index, -1)} />
                  <Button size="small" type="text" icon={<ChevronDown size={15} />} aria-label={`下移 ${label}`}
                    disabled={index === value.length - 1} onClick={() => move(index, 1)} />
                </Space>
              </li>
            );
          })}
        </ol>
      )}
      {options.length === 0 && <p>请先创建部署目标。</p>}
      <div className="deployment-target-candidates">
        {options.map(({ value: targetId, label }) => (
          <Checkbox key={targetId} checked={value.includes(targetId)} onChange={({ target }) => {
            // 勾选时追加到末尾，编辑时保留已有执行顺序。
            onChange?.(target.checked ? [...value, targetId] : value.filter((item) => item !== targetId));
          }}>{label}</Checkbox>
        ))}
      </div>
    </div>
  );
}

export function GroupEditor({ initialValues, onClose, onSave, targets }: EditorProps<DeploymentGroupInput> & {
  targets: Option<string>[];
}) {
  const [form] = Form.useForm<DeploymentGroupInput>();
  const { saving, error, save } = useSave(onSave);
  return (
    <Modal {...modalProps} title={initialValues.id ? "编辑部署组" : "新建部署组"} width={640}
      onCancel={onClose} cancelButtonProps={{ disabled: saving }} closable={!saving} keyboard={!saving}
      onOk={() => form.submit()} okText="保存部署组" confirmLoading={saving}>
      <Form form={form} layout="vertical" initialValues={{ stopOnFail: true, targetIds: [], ...initialValues }} onFinish={save}>
        <Form.Item name="name" label="组名称" rules={nameRules}><Input placeholder="例如 ruoyi-全栈" /></Form.Item>
        <Form.Item name="description" label="说明（可选）"><Input placeholder="例如 后端 + 前端 + 移动端" /></Form.Item>
        <Form.Item name="stopOnFail" label="失败即停" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name="targetIds" label="组内目标（从上到下为部署顺序）"
          rules={[{ validator: (_, ids?: string[]) => ids?.some((id) => targets.some((target) => target.value === id))
            ? Promise.resolve()
            : Promise.reject(new Error("至少选择一个有效的部署目标")) }]}>
          <OrderedTargets options={targets} />
        </Form.Item>
        {error && <Alert type="error" showIcon message={error} />}
      </Form>
    </Modal>
  );
}
