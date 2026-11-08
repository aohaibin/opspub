import { useEffect, useState } from "react";
import { Alert, Button, Form, Input, InputNumber, Modal, message } from "antd";
import { Monitor, Wifi } from "lucide-react";
import type { Server, ServerPayload, SshCredentials } from "@/types";
import { serverApi } from "@/lib/api/server";
import { getErrorMessage } from "@/lib/api/client";
import { serverSetupStyles } from "./serverSetupStyles";

interface Values { alias: string; hostname: string; port: number; username: string; group: string }
export function RdpServerModal({ server, onCancel, onSubmit }: { server: Server; onCancel: () => void; onSubmit: (payload: ServerPayload, credentials?: SshCredentials) => Promise<void> }) {
  const [form] = Form.useForm<Values>();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  useEffect(() => { form.setFieldsValue(server); }, [server, form]);
  const submit = async () => {
    let values: Values;
    try { values = await form.validateFields(); } catch { return; }
    setSaving(true);
    try { await onSubmit({ ...values, auth_type: "password", os_type: "windows", ai_policy: "disabled", tags: server.tags }); }
    finally { setSaving(false); }
  };
  const probe = async () => {
    setTesting(true);
    try { const values = await form.validateFields(["hostname", "port"]); const result = await serverApi.testConnectivity(values.hostname, values.port); message[result.ok ? "success" : "error"](result.message); }
    catch (e) { if (!(typeof e === "object" && e && "errorFields" in e)) message.error(getErrorMessage(e)); }
    finally { setTesting(false); }
  };
  return <Modal open centered width={560} onCancel={onCancel} styles={serverSetupStyles} title={<span className="flex items-center gap-2"><Monitor size={16} />编辑远程桌面连接</span>}
    footer={<div className="flex justify-between"><Button icon={<Wifi size={14} />} loading={testing} onClick={() => void probe()}>测试端口</Button><div className="flex gap-2"><Button onClick={onCancel}>取消</Button><Button type="primary" loading={saving} onClick={() => void submit()}>保存</Button></div></div>}>
    <Alert className="mb-4" type="info" showIcon description="仅远程桌面条目不提供 SSH、SFTP 和 AI 操作。连接时打开系统远程桌面客户端，登录与身份确认由系统客户端处理。" />
    <Form form={form} layout="vertical">
      <Form.Item name="alias" label="别名" rules={[{ required: true }]}><Input /></Form.Item>
      <div className="grid grid-cols-3 gap-3"><Form.Item className="col-span-2" name="hostname" label="主机" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="port" label="端口" rules={[{ required: true }]}><InputNumber min={1} max={65535} className="w-full" /></Form.Item></div>
      <Form.Item name="username" label="用户名" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item name="group" label="分组"><Input placeholder="默认 / 子分组" /></Form.Item>
    </Form>
  </Modal>;
}
