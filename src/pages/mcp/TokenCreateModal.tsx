import { useEffect, useState } from "react";
import { Alert, Form, Input, Modal, Radio, Select } from "antd";
import type { Server } from "@/types/server";
import type { McpTokenCreated, McpToolDefinition } from "@/types/mcp";
import { mcpApi } from "@/lib/api/mcp";
import { getErrorMessage } from "@/lib/api/client";
import { CLIENTS, modalStyles } from "@/pages/mcp/shared";

interface Values {
  name: string;
  client: string;
  serverMode: "selected" | "all";
  servers: string[];
  toolMode: "readonly" | "selected";
  tools: string[];
  expiry: string;
  expiresAt?: string;
}

export function TokenCreateModal({
  open,
  client,
  servers,
  tools,
  onClose,
  onCreated,
}: {
  open: boolean;
  client: string;
  servers: Server[];
  tools: McpToolDefinition[];
  onClose: () => void;
  onCreated: (created: McpTokenCreated) => void;
}) {
  const [form] = Form.useForm<Values>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const serverMode = Form.useWatch("serverMode", form);
  const toolMode = Form.useWatch("toolMode", form);
  const expiry = Form.useWatch("expiry", form);
  const sshServers = servers.filter((s) => s.protocol !== "rdp");
  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({ client });
      setError("");
    }
  }, [open, client, form]);
  const submit = async () => {
    let values: Values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setBusy(true);
    setError("");
    try {
      let expiresAt: string | null = null;
      if (values.expiry !== "never") {
        const date =
          values.expiry === "custom"
            ? new Date(values.expiresAt ?? "")
            : new Date(Date.now() + Number(values.expiry) * 86_400_000);
        if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now())
          throw new Error("请选择晚于当前时间的有效期");
        const pad = (n: number) => String(n).padStart(2, "0");
        // 后端使用本地时间，不能用 UTC ISO 字符串偷偷改变令牌到期时刻。
        expiresAt = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
      }
      const result = await mcpApi.createToken({
        name: values.name.trim(),
        client: values.client,
        serverScope:
          values.serverMode === "all" ? "*" : values.servers.join(","),
        toolScope:
          values.toolMode === "readonly" ? "readonly" : values.tools.join(","),
        expiresAt,
      });
      onCreated(result);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="新建 Scoped Token"
      open={open}
      centered
      width={620}
      maskClosable={false}
      styles={modalStyles}
      rootClassName="mcp-modal"
      onCancel={busy ? undefined : onClose}
      closable={!busy}
      keyboard={!busy}
      onOk={() => void submit()}
      confirmLoading={busy}
      okText="创建令牌"
      cancelText="取消"
      cancelButtonProps={{ disabled: busy }}
    >
      <p className="mcp-muted">
        为客户端分配可访问的服务器和工具；所有调用仍受 AI
        开关、服务器策略与审批限制。
      </p>
      {error && (
        <Alert showIcon type="error" title={error} className="mcp-form-error" />
      )}
      <Form
        form={form}
        layout="vertical"
        disabled={busy}
        initialValues={{
          name: "",
          client,
          serverMode: "selected",
          servers: [],
          toolMode: "readonly",
          tools: [],
          expiry: "30",
        }}
      >
        <div className="mcp-form-grid">
          <Form.Item
            name="name"
            label="令牌名称"
            rules={[
              { required: true, whitespace: true, message: "请输入令牌名称" },
            ]}
          >
            <Input maxLength={80} placeholder="例如：日常巡检助手" />
          </Form.Item>
          <Form.Item
            name="client"
            label="使用客户端"
            rules={[{ required: true }]}
          >
            <Select
              options={[
                ...CLIENTS.map((c) => ({ value: c.key, label: c.name })),
                { value: "custom", label: "自定义 / 多客户端" },
              ]}
            />
          </Form.Item>
        </div>
        <Form.Item name="serverMode" label="授权服务器">
          <Radio.Group
            options={[
              { value: "selected", label: "指定服务器" },
              { value: "all", label: "全部 SSH 服务器" },
            ]}
          />
        </Form.Item>
        {serverMode === "selected" ? (
          <Form.Item
            name="servers"
            rules={[
              {
                required: true,
                type: "array",
                min: 1,
                message: "请至少选择一台服务器",
              },
            ]}
            extra="只列出 SSH 服务器。含逗号或 * 的别名请先修改后再单独授权。"
          >
            <Select
              mode="multiple"
              optionFilterProp="label"
              placeholder="搜索并选择服务器"
              options={sshServers.map((s) => ({
                value: s.alias,
                label: `${s.alias} · ${s.hostname}`,
                disabled: s.alias.includes(",") || s.alias === "*",
              }))}
            />
          </Form.Item>
        ) : (
          <Alert
            type="info"
            showIcon
            title="此令牌也会覆盖后续新增的 SSH 服务器。"
            className="mcp-form-error"
          />
        )}
        <Form.Item name="toolMode" label="可用工具">
          <Radio.Group
            options={[
              { value: "readonly", label: "全部只读工具" },
              { value: "selected", label: "指定工具" },
            ]}
          />
        </Form.Item>
        {toolMode === "selected" && (
          <Form.Item
            name="tools"
            rules={[
              {
                required: true,
                type: "array",
                min: 1,
                message: "请至少选择一个工具",
              },
            ]}
          >
            <Select
              mode="multiple"
              optionFilterProp="label"
              placeholder="选择此客户端需要的工具"
              options={tools.map((t) => ({
                value: t.name,
                label: `${t.name} · ${t.description}`,
              }))}
            />
          </Form.Item>
        )}
        <div className="mcp-caption mcp-form-error">
          当前开放 {tools.length} 个只读工具，远程探针支持 Linux
          SSH；暂不提供任意命令执行。
        </div>
        <Form.Item name="expiry" label="令牌有效期">
          <Select
            options={[
              { value: "7", label: "7 天" },
              { value: "30", label: "30 天（推荐）" },
              { value: "90", label: "90 天" },
              { value: "never", label: "永久有效" },
              { value: "custom", label: "自定义到期时间" },
            ]}
          />
        </Form.Item>
        {expiry === "custom" && (
          <Form.Item
            name="expiresAt"
            label="到期时间（本地时间）"
            rules={[{ required: true, message: "请选择到期时间" }]}
          >
            <Input type="datetime-local" />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
