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
  manageCredentials?: boolean;
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
  manageCredentials = false,
  onCancel,
  onVerified,
  onStatusChanged,
}: SshConnectModalProps) {
  const [form] = Form.useForm<SshCredentials>();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SshProbeResult | null>(null);
  const [verificationFailed, setVerificationFailed] = useState(false);

  useEffect(() => {
    form.resetFields();
    if (initialCredentials) {
      form.setFieldsValue(initialCredentials);
    }
    setResult(null);
    setVerificationFailed(false);
    setSubmitting(false);
  }, [form, initialCredentials, open, server?.id]);

  const clearAndClose = () => {
    if (manageCredentials && submitting) return;
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
              description="请核对主机公钥指纹。确认后会保存指纹，后续如发生变化将自动拒绝认证。已保存的 SSH 凭据会自动从系统凭据管理器读取。"
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
    if (!server || submitting) return;

    setSubmitting(true);
    setVerificationFailed(false);
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
        if (!manageCredentials) setSubmitting(false);
        const trusted = await confirmHostKey(probe);
        if (!trusted) return;
        setSubmitting(true);
        probe = await serverApi.testSsh({ ...request, trustHostKey: true });
      }

      if (!probe.connected) {
        throw new Error(probe.message || "SSH 认证未完成");
      }

      if (manageCredentials) form.resetFields();
      await onVerified(probe, values);
      if (!manageCredentials) {
        form.resetFields();
        setResult(probe);
        message.success(`「${server.alias}」SSH 认证成功`);
      }
    } catch (error) {
      if (manageCredentials) {
        // 凭据管理页只呈现固定提示，避免把驱动错误原文带入界面。
        form.resetFields();
        setVerificationFailed(true);
      } else {
        message.error(getErrorMessage(error));
      }
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
      maskClosable={manageCredentials ? false : undefined}
      closable={!manageCredentials || !submitting}
      keyboard={!manageCredentials || !submitting}
      className={manageCredentials ? "[&_input::-ms-reveal]:hidden" : undefined}
      destroyOnHidden
      footer={
        <Space>
          <Button disabled={manageCredentials && submitting} onClick={clearAndClose}>{result ? "关闭" : "取消"}</Button>
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
          disabled={manageCredentials && submitting}
        >
          <Alert
            type="info"
            showIcon
            className="mb-4"
            message={`${server?.username ?? ""}@${server?.hostname ?? ""}:${server?.port ?? ""}`}
            description="留空将尝试使用系统凭据管理器中已保存的凭据；输入新凭据则在验证成功后更新托管凭据。凭据不会写入资产库或审计日志。"
          />
          {verificationFailed && (
            <Alert
              type="error"
              showIcon
              className="mb-4"
              message="SSH 验证或托管失败"
              description="请核对主机指纹、连接信息和凭据后重试，并确认系统凭据管理器可用。"
            />
          )}

          {server?.auth_type === "agent" ? <Alert type="info" showIcon description="使用系统 ssh-agent 中已加载的密钥。请确保 OpenSSH Authentication Agent 已启动，并已执行 ssh-add。" /> : server?.auth_type === "key" ? (
            <>
              <Form.Item
                name="privateKeyPath"
                label="私钥路径"
              >
                <Input
                  prefix={<KeyRound size={14} />}
                  type={manageCredentials ? "password" : "text"}
                  placeholder="留空使用已保存凭据，或输入 ~/.ssh/id_ed25519"
                  autoComplete="off"
                />
              </Form.Item>
              <Form.Item name="passphrase" label="私钥口令（可选）">
                <Input.Password visibilityToggle={!manageCredentials} autoComplete="new-password" placeholder="未加密私钥可留空" />
              </Form.Item>
            </>
          ) : (
            <Form.Item
              name="password"
              label="SSH 登录密码"
            >
              <Input.Password visibilityToggle={!manageCredentials} autoComplete="new-password" placeholder="留空使用已保存密码，或输入新密码" />
            </Form.Item>
          )}
        </Form>
      )}
    </Modal>
  );
}
