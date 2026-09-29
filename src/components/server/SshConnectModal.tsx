import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  Space,
  Typography,
  message,
} from "antd";
import { KeyRound, RotateCcw, ShieldCheck } from "lucide-react";
import { serverApi } from "@/lib/api/server";
import { getErrorMessage } from "@/lib/api/client";
import type { Server, SshCredentials, SshProbeResult } from "@/types";

interface SshConnectModalProps {
  open: boolean;
  server: Server | null;
  initialCredentials?: SshCredentials;
  onCancel: () => void;
  onVerified: (
    result: SshProbeResult,
    credentials: SshCredentials,
  ) => Promise<void> | void;
  onStatusChanged?: () => Promise<void> | void;
}

export function SshConnectModal({
  open,
  server,
  initialCredentials,
  onCancel,
  onVerified,
  onStatusChanged,
}: SshConnectModalProps) {
  const [form] = Form.useForm<SshCredentials>();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SshProbeResult | null>(null);

  useEffect(() => {
    form.resetFields();
    if (initialCredentials) {
      form.setFieldsValue(initialCredentials);
    }
    setResult(null);
    setSubmitting(false);
  }, [form, initialCredentials, open, server?.id]);

  const clearAndClose = () => {
    form.resetFields();
    setResult(null);
    onCancel();
  };

  const confirmHostKey = (probe: SshProbeResult) =>
    new Promise<boolean>((resolve) => {
      Modal.confirm({
        title: "确认 SSH 主机身份",
        icon: <ShieldCheck size={20} color="var(--warning)" />,
        width: 560,
        content: (
          <div className="space-y-3 text-xs">
            <Alert
              type="warning"
              showIcon
              message="这是该服务器的首次 SSH 连接"
              description="请核对主机公钥指纹。确认后会保存指纹，后续如发生变化将自动拒绝认证。"
            />
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="服务器">
                {server?.alias}（{server?.hostname}:{server?.port}）
              </Descriptions.Item>
              <Descriptions.Item label="密钥类型">
                {probe.host_key_type}
              </Descriptions.Item>
              <Descriptions.Item label="SHA-256 指纹">
                <Typography.Text
                  copyable
                  style={{ fontFamily: "var(--font-mono)", wordBreak: "break-all" }}
                >
                  {probe.fingerprint}
                </Typography.Text>
              </Descriptions.Item>
            </Descriptions>
          </div>
        ),
        okText: "信任并继续",
        cancelText: "取消",
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });

  const runProbe = async (values: SshCredentials) => {
    if (!server) return;

    setSubmitting(true);
    try {
      const request = {
        serverId: server.id,
        password: values.password,
        privateKeyPath: values.privateKeyPath,
        passphrase: values.passphrase,
        trustHostKey: false,
      };
      let probe = await serverApi.testSsh(request);

      if (probe.requires_host_key_trust) {
        setSubmitting(false);
        const trusted = await confirmHostKey(probe);
        if (!trusted) return;
        setSubmitting(true);
        probe = await serverApi.testSsh({ ...request, trustHostKey: true });
      }

      if (!probe.connected) {
        throw new Error(probe.message || "SSH 认证未完成");
      }

      await onVerified(probe, values);
      form.resetFields();
      setResult(probe);
      message.success(`「${server.alias}」SSH 认证成功`);
    } catch (error) {
      message.error(getErrorMessage(error));
      await onStatusChanged?.();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={server ? `SSH 验证 · ${server.alias}` : "SSH 验证"}
      width={600}
      onCancel={clearAndClose}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={clearAndClose}>{result ? "关闭" : "取消"}</Button>
          {result ? (
            <Button icon={<RotateCcw size={14} />} onClick={() => setResult(null)}>
              重新验证
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<ShieldCheck size={14} />}
              loading={submitting}
              onClick={() => form.submit()}
            >
              验证连接
            </Button>
          )}
        </Space>
      }
    >
      {result ? (
        <div className="space-y-3">
          <Alert type="success" showIcon message="SSH 身份认证通过" description={result.message} />
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="远程主机名">
              {result.remote_hostname}
            </Descriptions.Item>
            <Descriptions.Item label="操作系统">{result.os_name}</Descriptions.Item>
            <Descriptions.Item label="CPU 架构">{result.arch || "未知"}</Descriptions.Item>
            <Descriptions.Item label="运行时间">{result.uptime || "未知"}</Descriptions.Item>
            <Descriptions.Item label="认证耗时">{result.latency_ms} ms</Descriptions.Item>
            <Descriptions.Item label="主机指纹">
              <Typography.Text
                copyable
                style={{ fontFamily: "var(--font-mono)", wordBreak: "break-all" }}
              >
                {result.fingerprint}
              </Typography.Text>
            </Descriptions.Item>
          </Descriptions>
        </div>
      ) : (
        <Form<SshCredentials>
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={runProbe}
        >
          <Alert
            type="info"
            showIcon
            className="mb-4"
            message={`${server?.username ?? ""}@${server?.hostname ?? ""}:${server?.port ?? ""}`}
            description="凭据仅用于本次 SSH 认证；验证成功后由本地系统凭据管理器安全托管，不写入资产库或审计日志。"
          />

          {server?.auth_type === "key" ? (
            <>
              <Form.Item
                name="privateKeyPath"
                label="私钥路径"
                rules={[{ required: true, message: "请输入私钥文件路径" }]}
              >
                <Input
                  prefix={<KeyRound size={14} />}
                  placeholder="~/.ssh/id_ed25519"
                  autoComplete="off"
                />
              </Form.Item>
              <Form.Item name="passphrase" label="私钥口令（可选）">
                <Input.Password autoComplete="new-password" placeholder="未加密私钥可留空" />
              </Form.Item>
            </>
          ) : (
            <Form.Item
              name="password"
              label="SSH 登录密码"
              rules={[{ required: true, message: "请输入 SSH 登录密码" }]}
            >
              <Input.Password autoComplete="new-password" placeholder="输入本次连接凭据" />
            </Form.Item>
          )}
        </Form>
      )}
    </Modal>
  );
}
