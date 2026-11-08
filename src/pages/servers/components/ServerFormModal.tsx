import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Alert,
  AutoComplete,
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Modal,
  Segmented,
  Select,
  Switch,
  Tooltip,
  message,
} from "antd";
import { FolderOpen, HelpCircle, Monitor, Wand2, Wifi } from "lucide-react";
import { open as selectFile } from "@tauri-apps/plugin-dialog";
import type {
  AIPolicy,
  OsType,
  Server,
  ServerConnectionOptions,
  ServerPayload,
  SshCredentials,
  SshProbeResult,
} from "@/types";
import { getErrorMessage } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";
import { parseTags, serializeTags, splitTagInput } from "../lib/serverMeta";
import { serverSetupStyles } from "./serverSetupStyles";
import "./ServerFormModal.css";

type AuthMode = "password" | "key" | "key_pass" | "agent";
interface Values extends SshCredentials {
  protocol: "ssh" | "rdp";
  alias: string;
  hostname: string;
  port: number;
  username: string;
  authMode: AuthMode;
  os_type: OsType;
  group: string;
  tags: string;
  ai_policy: AIPolicy;
  ai_username: string;
  allow_sudo: boolean;
  use_local_proxy: boolean;
  bastion_id: number | null;
  options: ServerConnectionOptions;
}
interface Props {
  open: boolean;
  /** null 表示新增；所有入口共用表单，避免终端和服务器页面保存行为不同。 */
  server: Server | null;
  presetGroup?: string;
  existingServers?: Server[];
  onCancel: () => void;
  onSubmit: (
    payload: ServerPayload,
    credentials?: SshCredentials,
  ) => Promise<void>;
  onOpenWindowsGuide?: () => void;
  allowRdp?: boolean;
}
const OPTIONS: ServerConnectionOptions = {
  networkEnv: "auto",
  connectionProxy: "",
  rdpEnabled: false,
  rdpPort: 3389,
  rdpDisplayMode: "system",
  rdpAdminSession: false,
};
const DEFAULTS: Values = {
  protocol: "ssh",
  alias: "",
  hostname: "",
  port: 22,
  username: "root",
  authMode: "password",
  os_type: "linux",
  group: "",
  tags: "",
  ai_policy: "disabled",
  ai_username: "",
  allow_sudo: false,
  use_local_proxy: false,
  bastion_id: null,
  options: OPTIONS,
};
const POLICIES = [
  { value: "disabled", label: "禁用（AI 操作不可用）" },
  { value: "readonly", label: "只读探测（纯只读命令）" },
  { value: "approval", label: "严格审批（每次执行需人工确认）" },
  { value: "trusted", label: "完全信任（自动执行安全指令）" },
  { value: "allowlist", label: "白名单（仅允许白名单命令）" },
];
const DISPLAY_MODES = [
  { value: "system", label: "跟随系统默认" },
  { value: "fullscreen", label: "全屏" },
  { value: "1920x1080", label: "1920 × 1080" },
  { value: "1440x900", label: "1440 × 900" },
];
function Label({ children, help }: { children: ReactNode; help?: string }) {
  return (
    <span className="server-form-label">
      {children}
      {help && (
        <Tooltip title={help}>
          <HelpCircle size={13} />
        </Tooltip>
      )}
    </span>
  );
}
const required = (label: string) => [
  { required: true, whitespace: true, message: `请填写${label}` },
];
const portRules = [
  {
    required: true,
    type: "integer" as const,
    min: 1,
    max: 65535,
    message: "端口应为 1–65535 的整数",
  },
];

export function ServerFormModal({
  open,
  server,
  presetGroup,
  existingServers = [],
  onCancel,
  onSubmit,
  onOpenWindowsGuide,
  allowRdp = true,
}: Props) {
  const [form] = Form.useForm<Values>();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [keySource, setKeySource] = useState<"text" | "file">("text");
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [trust, setTrust] = useState<SshProbeResult | null>(null);
  const [token, setToken] = useState<string>();
  const revision = useRef(0);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const busy = saving || testing;
  const protocol = Form.useWatch("protocol", form) ?? "ssh";
  const platform = Form.useWatch("os_type", form) ?? "linux";
  const authMode = Form.useWatch("authMode", form) ?? "password";
  const rdpEnabled = Form.useWatch(["options", "rdpEnabled"], form);
  const useProxy = Form.useWatch("use_local_proxy", form);
  const bastion = Form.useWatch("bastion_id", form);

  const invalidate = () => {
    revision.current++;
    setToken(undefined);
    setTrust(null);
    setFeedback(null);
  };
  useEffect(() => {
    revision.current++;
    if (!open) {
      // Modal 销毁子树后 Form 实例仍存活，关闭时主动清除输入过的凭据。
      form.resetFields();
      return;
    }
    form.resetFields();
    setFeedback(null);
    setTrust(null);
    setToken(undefined);
    setTesting(false);
    setKeySource("text");
    form.setFieldsValue(
      server
        ? {
            ...DEFAULTS,
            alias: server.alias,
            hostname: server.hostname,
            port: server.port,
            username: server.username,
            protocol: server.protocol ?? "ssh",
            os_type: server.os_type === "windows" ? "windows" : "linux",
            authMode:
              server.auth_type === "key"
                ? "key_pass"
                : server.auth_type === "agent"
                  ? "agent"
                  : "password",
            group: server.group,
            tags: parseTags(server.tags).join(", "),
            ai_policy: (server.ai_policy === "strict"
              ? "approval"
              : server.ai_policy === "denied"
                ? "disabled"
                : server.ai_policy === "autonomous"
                  ? "trusted"
                  : server.ai_policy) as AIPolicy,
            ai_username: server.ai_username,
            allow_sudo: server.allow_sudo,
            use_local_proxy: server.use_local_proxy,
            bastion_id: server.bastion_id,
            options: { ...OPTIONS, ...server.connection_options },
          }
        : {
            ...DEFAULTS,
            group: presetGroup?.trim() || "",
            options: { ...OPTIONS },
          },
    );
    return () => {
      revision.current++;
    };
  }, [open, server, presetGroup, form]);

  useEffect(() => {
    // 测试结果位于长表单末尾，返回后让反馈进入可视区域，避免看起来没有响应。
    if (feedback || trust)
      feedbackRef.current?.scrollIntoView({ block: "nearest" });
  }, [feedback, trust]);

  const groups = useMemo(
    () =>
      Array.from(
        new Set(existingServers.map((s) => s.group).filter(Boolean)),
      ).map((value) => ({ value })),
    [existingServers],
  );
  const jumps = useMemo(
    () =>
      existingServers
        .filter((s) => s.id !== server?.id && s.protocol !== "rdp")
        .map((s) => ({
          value: s.id,
          label: `${s.alias} (${s.hostname}:${s.port})`,
        })),
    [existingServers, server],
  );
  const changeProtocol = (next: string | number) => {
    invalidate();
    const rdp = next === "rdp";
    const port = form.getFieldValue("port");
    const user = form.getFieldValue("username");
    form.setFieldsValue({
      protocol: rdp ? "rdp" : "ssh",
      port: port === 22 && rdp ? 3389 : port === 3389 && !rdp ? 22 : port,
      ...(rdp
        ? {
            os_type: "windows",
            username: !user || user === "root" ? "Administrator" : user,
          }
        : {}),
    });
  };
  const changePlatform = (next: string | number) => {
    invalidate();
    const user = form.getFieldValue("username");
    form.setFieldsValue({
      os_type: next as OsType,
      username:
        next === "windows" && (!user || user === "root")
          ? "Administrator"
          : next === "linux" && (!user || user === "Administrator")
            ? "root"
            : user,
    });
  };

  async function request() {
    await form.validateFields();
    // 读取未挂载字段，避免 osType 等 IPC 必填参数因条件渲染丢失。
    const v = form.getFieldsValue(true) as Values;
    const rdp = v.protocol === "rdp";
    const auth =
      rdp || v.authMode === "password"
        ? "password"
        : v.authMode === "agent"
          ? "agent"
          : "key";
    const canReuse =
      server &&
      server.hostname === v.hostname.trim() &&
      server.port === v.port &&
      server.username === v.username.trim() &&
      server.auth_type === auth &&
      (server.protocol ?? "ssh") === v.protocol;
    let credentials: SshCredentials | undefined;
    if (auth === "password" && v.password)
      credentials = { password: v.password };
    if (auth === "key") {
      const key =
        keySource === "text"
          ? v.privateKeyText?.trim()
          : v.privateKeyPath?.trim();
      if (key || v.passphrase)
        credentials = {
          ...(keySource === "text"
            ? { privateKeyText: key }
            : { privateKeyPath: key }),
          passphrase: v.authMode === "key_pass" ? v.passphrase : "",
        };
      if (!key && !canReuse) throw new Error("请输入私钥文本或选择私钥文件");
    }
    if (!rdp && auth === "password" && !v.password && !canReuse)
      throw new Error("请输入登录密码");
    const payload: ServerPayload = {
      alias: v.alias.trim(),
      hostname: v.hostname.trim(),
      port: v.port,
      username: v.username.trim(),
      auth_type: auth,
      protocol: v.protocol,
      os_type: rdp ? "windows" : v.os_type,
      group: v.group?.trim() || "默认",
      tags: serializeTags(splitTagInput(v.tags || "")),
      ai_policy: rdp ? "disabled" : v.ai_policy,
      ai_username: rdp ? "" : v.ai_username?.trim() || "",
      allow_sudo: !rdp && v.allow_sudo,
      use_local_proxy: !rdp && v.use_local_proxy,
      bastion_id: rdp ? null : (v.bastion_id ?? null),
      arch: server?.arch ?? "",
      connection_options: {
        ...OPTIONS,
        ...v.options,
        rdpEnabled: rdp || v.options.rdpEnabled,
        rdpPort: rdp ? v.port : v.options.rdpPort,
        connectionProxy: rdp ? "" : v.options.connectionProxy?.trim() || "",
      },
      verification_token: token,
    };
    return { payload, credentials };
  }
  const report = (error: unknown) => {
    if (typeof error === "object" && error && "errorFields" in error) {
      const fields = error.errorFields as { name: (string | number)[] }[];
      if (fields[0])
        form.scrollToField(fields[0].name, { block: "center", focus: true });
      return;
    }
    setFeedback({ ok: false, text: getErrorMessage(error) });
  };
  const test = async (fingerprint?: string) => {
    const current = revision.current;
    setTesting(true);
    setFeedback(null);
    setToken(undefined);
    try {
      const { payload, credentials } = await request();
      if (payload.protocol === "rdp") {
        const result = await serverApi.testConnectivity(
          payload.hostname,
          payload.port,
        );
        if (current !== revision.current) return;
        setFeedback({
          ok: result.ok,
          text: result.ok
            ? `远程桌面端口可达（${result.latency_ms ?? 0} ms），账号登录由系统远程桌面客户端验证。`
            : result.message,
        });
      } else {
        const response = await serverApi.testForm(
          server?.id ?? null,
          payload,
          credentials,
          fingerprint,
        );
        if (current !== revision.current) return;
        setTrust(
          response.result.requires_host_key_trust ? response.result : null,
        );
        setToken(response.verificationToken ?? undefined);
        if (!response.result.requires_host_key_trust)
          setFeedback({
            ok: response.result.connected,
            text: response.result.message,
          });
      }
    } catch (error) {
      if (current === revision.current) report(error);
    } finally {
      if (current === revision.current) setTesting(false);
    }
  };
  const save = async () => {
    setSaving(true);
    try {
      const { payload, credentials } = await request();
      await onSubmit(payload, credentials);
    } catch (error) {
      report(error);
    } finally {
      setSaving(false);
    }
  };

  const rdpFields = (
    <>
      <Form.Item name={["options", "rdpDisplayMode"]} label="显示方式">
        <Select options={DISPLAY_MODES} />
      </Form.Item>
      <Form.Item
        label=" "
        colon={false}
        name={["options", "rdpAdminSession"]}
        valuePropName="checked"
      >
        <Checkbox>管理员会话</Checkbox>
      </Form.Item>
    </>
  );
  return (
    <Modal
      open={open}
      centered
      width={672}
      rootClassName="server-form-modal"
      destroyOnHidden
      maskClosable={false}
      title={server ? "编辑服务器" : "新增服务器"}
      onCancel={busy ? undefined : onCancel}
      closable={!busy}
      keyboard={!busy}
      styles={{
        ...serverSetupStyles,
        header: {
          margin: 0,
          background: "var(--bg-primary)",
          borderBottom: "1px solid var(--border)",
          padding: "18px 48px 18px 24px",
        },
        body: {
          padding: "20px 24px",
          maxHeight: "calc(90dvh - 148px)",
          overflowY: "auto",
        },
        footer: {
          margin: 0,
          background: "var(--bg-primary)",
          borderTop: "1px solid var(--border)",
          padding: "16px 24px",
        },
      }}
      footer={
        <div className="flex justify-end gap-2.5">
          <Button disabled={busy} onClick={onCancel}>
            取消
          </Button>
          <Button
            icon={<Wifi size={15} />}
            loading={testing}
            disabled={saving}
            onClick={() => void test()}
          >
            测试连接
          </Button>
          <Button
            type="primary"
            loading={saving}
            disabled={testing}
            onClick={() => void save()}
          >
            确定
          </Button>
        </div>
      }
    >
      <Form
        form={form}
        initialValues={DEFAULTS}
        layout="horizontal"
        labelCol={{ flex: "128px" }}
        wrapperCol={{ flex: "auto" }}
        labelAlign="left"
        colon
        requiredMark
        disabled={busy}
        className="server-form"
        onValuesChange={invalidate}
      >
        <Form.Item
          label={
            <Label help="SSH 提供终端、文件和 AI 运维；RDP 使用本机 Windows 远程桌面客户端。">
              连接方式
            </Label>
          }
        >
          <Form.Item name="protocol" noStyle>
            <Segmented
              options={
                allowRdp
                  ? [
                      { label: "SSH", value: "ssh" },
                      { label: "仅远程桌面 (RDP)", value: "rdp" },
                    ]
                  : [{ label: "SSH", value: "ssh" }]
              }
              onChange={changeProtocol}
            />
          </Form.Item>
        </Form.Item>
        {protocol === "rdp" ? (
          <Alert
            className="server-form-banner"
            showIcon
            type="info"
            description="使用本机 Windows 远程桌面打开此服务器。需要终端、文件管理或 AI 运维时，请先在目标 Windows 开通 OpenSSH，再改用 SSH。"
          />
        ) : (
          <Form.Item label="目标平台">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Form.Item name="os_type" noStyle>
                <Segmented
                  options={[
                    { label: "Linux", value: "linux" },
                    { label: "Windows", value: "windows" },
                  ]}
                  onChange={changePlatform}
                />
              </Form.Item>
              {platform === "windows" && onOpenWindowsGuide && (
                <Button
                  type="link"
                  size="small"
                  icon={<Monitor size={14} />}
                  onClick={onOpenWindowsGuide}
                >
                  Windows 接入向导
                </Button>
              )}
            </div>
          </Form.Item>
        )}
        <Form.Item name="alias" label="别名" rules={required("别名")}>
          <Input
            maxLength={100}
            placeholder="如 prod-web-01（AI 通过别名识别服务器）"
          />
        </Form.Item>
        <Form.Item label="主机" required>
          <div className="server-form-pair">
            <Form.Item
              name="hostname"
              noStyle
              rules={[
                ...required("主机"),
                {
                  pattern: /^(?!-)[^\s/@\\]+$/,
                  message: "请填写 IP 或域名，不要包含协议或路径",
                },
              ]}
            >
              <Input placeholder="10.0.1.11 或 example.com" />
            </Form.Item>
            <span className="server-form-inline-label">
              {protocol === "rdp" ? "RDP 端口" : "端口"}:
            </span>
            <Form.Item name="port" noStyle rules={portRules}>
              <InputNumber
                controls={false}
                min={1}
                max={65535}
                precision={0}
                aria-label="端口"
                className="server-form-port"
              />
            </Form.Item>
          </div>
        </Form.Item>
        <Form.Item label="用户名" required>
          <div className="server-form-pair">
            <Form.Item name="username" noStyle rules={required("用户名")}>
              <Input
                placeholder={
                  platform === "windows"
                    ? "Administrator 或 域名\\用户名"
                    : "root / ubuntu / ai-ops"
                }
              />
            </Form.Item>
            {protocol === "rdp" ? (
              <Button
                type="link"
                onClick={() => {
                  invalidate();
                  form.setFieldValue("username", "Administrator");
                }}
              >
                Administrator
              </Button>
            ) : (
              <>
                <span className="server-form-inline-label">认证方式:</span>
                <Form.Item name="authMode" noStyle>
                  <Select
                    aria-label="认证方式"
                    className="server-form-auth"
                    options={[
                      { value: "password", label: "密码" },
                      { value: "key", label: "私钥 (PEM)" },
                      { value: "key_pass", label: "私钥 + 口令" },
                      { value: "agent", label: "ssh-agent" },
                    ]}
                  />
                </Form.Item>
              </>
            )}
          </div>
        </Form.Item>
        {protocol === "ssh" && (
          <Form.Item
            label={
              <Label help="当前仅保存账号名称，独立账号的创建、凭据配置和 AI 执行通道尚未接入。">
                AI 专用账号
              </Label>
            }
            extra="当前仅记录账号名称，不自动创建或切换账号；终端与 AI 执行仍使用主账号。"
          >
            <div className="server-form-pair">
              <Form.Item name="ai_username" noStyle>
                <Input placeholder="留空 = 使用主账号" />
              </Form.Item>
              <Button
                icon={<Wand2 size={14} />}
                onClick={() => {
                  invalidate();
                  form.setFieldValue(
                    "ai_username",
                    platform === "windows" ? "ai_ops" : "ai-ops",
                  );
                }}
              >
                默认
              </Button>
            </div>
          </Form.Item>
        )}
        {(protocol === "rdp" || authMode === "password") && (
          <Form.Item
            name="password"
            label="密码"
            required={!server && protocol === "ssh"}
            extra={
              protocol === "rdp"
                ? "可不填，在远程桌面中手动输入；填写后保存到系统凭据管理器。"
                : "密码保存在系统凭据管理器，AI 无法获取明文。"
            }
          >
            <Input.Password
              autoComplete="new-password"
              placeholder={
                server
                  ? "留空复用原连接凭据（主机与账号不变时）"
                  : "服务器登录密码（加密存储）"
              }
            />
          </Form.Item>
        )}
        {protocol === "ssh" &&
          (authMode === "key" || authMode === "key_pass") && (
            <>
              <Form.Item
                label="私钥文本"
                required={!server}
                extra={
                  server
                    ? "留空复用已有私钥；更换主机、账号或认证方式需重新填写。"
                    : "支持 PEM / OpenSSH 私钥，也可选择本机私钥文件。"
                }
              >
                <Segmented
                  size="small"
                  className="mb-2"
                  value={keySource}
                  options={[
                    { value: "text", label: "粘贴文本" },
                    { value: "file", label: "私钥文件" },
                  ]}
                  onChange={(v) => {
                    invalidate();
                    setKeySource(v as "text" | "file");
                  }}
                />
                {keySource === "text" ? (
                  <Form.Item name="privateKeyText" noStyle>
                    <Input.TextArea
                      rows={3}
                      spellCheck={false}
                      autoComplete="off"
                      placeholder={
                        "-----BEGIN OPENSSH PRIVATE KEY-----\n粘贴完整的 PEM 或 OpenSSH 私钥文本"
                      }
                      style={{ fontFamily: "var(--font-mono)" }}
                    />
                  </Form.Item>
                ) : (
                  <div className="server-form-pair">
                    <Form.Item name="privateKeyPath" noStyle>
                      <Input placeholder="~/.ssh/id_ed25519 或私钥文件路径" />
                    </Form.Item>
                    <Button
                      aria-label="选择私钥文件"
                      icon={<FolderOpen size={15} />}
                      onClick={async () => {
                        try {
                          const path = await selectFile({
                            multiple: false,
                            directory: false,
                            title: "选择 SSH 私钥文件",
                          });
                          if (path) {
                            invalidate();
                            form.setFieldValue("privateKeyPath", path);
                          }
                        } catch (e) {
                          message.error(getErrorMessage(e));
                        }
                      }}
                    />
                  </div>
                )}
              </Form.Item>
              {authMode === "key_pass" && (
                <Form.Item name="passphrase" label="私钥口令">
                  <Input.Password
                    autoComplete="new-password"
                    placeholder="私钥未加密可留空"
                  />
                </Form.Item>
              )}
            </>
          )}
        {protocol === "ssh" && authMode === "agent" && (
          <Form.Item label="SSH Agent">
            <span className="server-form-hint">
              使用本机 ssh-agent 已加载的私钥；请先启动 OpenSSH Authentication
              Agent 并执行 ssh-add。
            </span>
          </Form.Item>
        )}
        {protocol === "rdp" && rdpFields}
        <Form.Item
          label={
            <Label help="选择已有分组，或输入如 生产/网关 的新分组。">
              所在分组
            </Label>
          }
          name="group"
        >
          <AutoComplete
            options={groups}
            placeholder="选择已有分组或输入新分组名"
            filterOption={(v, o) =>
              String(o?.value).toLowerCase().includes(v.toLowerCase())
            }
          />
        </Form.Item>
        <Form.Item name="tags" label="标签">
          <Input placeholder="如 生产环境、数据库、自用" />
        </Form.Item>
        {protocol === "ssh" && (
          <>
            <Form.Item
              name="ai_policy"
              label="AI 操作策略"
              rules={[{ required: true }]}
            >
              <Select options={POLICIES} />
            </Form.Item>
            <Form.Item
              name="allow_sudo"
              label={
                <Label help="允许 AI 发起提权命令，仍需经过安全策略和审批。">
                  {platform === "windows" ? "管理员权限" : "允许 sudo"}
                </Label>
              }
              valuePropName="checked"
            >
              <Switch size="small" />
            </Form.Item>
            <Form.Item
              name="use_local_proxy"
              label={
                <Label help="通过设置中的本机 HTTP / SOCKS5 代理连接此服务器。">
                  借用本机代理
                </Label>
              }
              valuePropName="checked"
              extra="需先在「设置 · 网络代理」配置本机代理地址。"
            >
              <Switch
                size="small"
                disabled={busy || !!bastion}
                onChange={(v) => {
                  if (v) form.setFieldValue(["options", "connectionProxy"], "");
                }}
              />
            </Form.Item>
            <Form.Item
              name={["options", "networkEnv"]}
              label={
                <Label help="连接超时：内网 3 秒、自动 8 秒、公网 10 秒、跨境 30 秒。">
                  网络环境
                </Label>
              }
            >
              <Select
                options={[
                  { value: "auto", label: "自动判断" },
                  { value: "public", label: "公网直连" },
                  { value: "lan", label: "局域网 / 内网" },
                  { value: "cross_border", label: "跨国跨境" },
                ]}
              />
            </Form.Item>
            <Form.Item
              name="bastion_id"
              label={
                <Label help="通过已配置并确认过主机指纹的服务器建立 SSH 隧道。">
                  跳板机
                </Label>
              }
              extra="留空 = 直连。支持最多 5 跳，禁止循环；代理可配置在跳板机上。"
            >
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="直连（不经跳板机）"
                options={jumps}
                onChange={(v) => {
                  if (v) {
                    form.setFieldValue("use_local_proxy", false);
                    form.setFieldValue(["options", "connectionProxy"], "");
                  }
                }}
              />
            </Form.Item>
            <Form.Item
              name={["options", "connectionProxy"]}
              label={
                <Label help="支持无需用户名密码的 HTTP CONNECT / SOCKS5 代理地址。">
                  连接代理
                </Label>
              }
            >
              <AutoComplete
                disabled={busy || useProxy || !!bastion}
                options={[{ value: "", label: "直连（不经代理）" }]}
                placeholder="直连，或输入 socks5://127.0.0.1:1080"
              />
            </Form.Item>
            <div className="server-form-divider">远程桌面 (RDP)</div>
            <Form.Item
              name={["options", "rdpEnabled"]}
              label={
                <Label help="在服务器列表提供远程桌面入口；目标主机需已启用 RDP 服务。">
                  启用远程桌面
                </Label>
              }
              valuePropName="checked"
            >
              <Switch size="small" />
            </Form.Item>
            {rdpEnabled && (
              <>
                <Form.Item
                  name={["options", "rdpPort"]}
                  label="远程桌面端口"
                  rules={portRules}
                >
                  <InputNumber min={1} max={65535} precision={0} />
                </Form.Item>
                {rdpFields}
              </>
            )}
          </>
        )}
      </Form>
      <div ref={feedbackRef} aria-live="polite">
        {trust && (
          <Alert
            className="server-form-feedback"
            type="warning"
            showIcon
            title="首次连接：请核对主机公钥指纹"
            description={
              <div>
                <code className="break-all">
                  {trust.host_key_type} · {trust.fingerprint}
                </code>
                <p>确认与目标服务器一致后，再验证登录凭据。</p>
                <Button
                  loading={testing}
                  onClick={() => void test(trust.fingerprint)}
                >
                  确认指纹并验证
                </Button>
              </div>
            }
          />
        )}
        {feedback && (
          <Alert
            className="server-form-feedback"
            type={feedback.ok ? "success" : "error"}
            showIcon
            description={feedback.text}
          />
        )}
      </div>
    </Modal>
  );
}
