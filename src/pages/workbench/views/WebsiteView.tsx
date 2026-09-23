import React, { useState } from "react";
import { Button, Table, Tag, Input, Modal, Form, message } from "antd";
import {
  Globe,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { MOCK_WEBSITES } from "../mockData";
import type { WebsiteItem } from "../types";
import { getErrorMessage } from "@/lib/api/client";
import { useWorkbenchRuntime } from "../context";

export const WebsiteView: React.FC = () => {
  const { runCommand } = useWorkbenchRuntime();
  const [websites, setWebsites] = useState<WebsiteItem[]>(MOCK_WEBSITES);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();

  const reloadWebServer = async () => {
    try {
      const result = await runCommand("nginx -t && (systemctl reload openresty || systemctl reload nginx)");
      if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout || "Web 服务重载失败");
      message.success("Web 服务配置已检查并重载");
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const filtered = websites.filter(
    (w) =>
      w.domain.toLowerCase().includes(search.toLowerCase()) ||
      w.remark.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = (values: { domain: string; port: number; remark: string }) => {
    const newSite: WebsiteItem = {
      id: Date.now().toString(),
      domain: values.domain,
      docRoot: `/www/sites/${values.domain}`,
      status: "running",
      port: values.port || 80,
      ssl: false,
      remark: values.remark || "新建反代站点",
    };
    setWebsites([newSite, ...websites]);
    setIsModalOpen(false);
    form.resetFields();
    message.success(`✓ 站点 [${values.domain}] 已成功创建并在 OpenResty 中生效`);
  };

  const handleDelete = (id: string, domain: string) => {
    if (confirm(`确定要删除站点「${domain}」吗？`)) {
      setWebsites(websites.filter((w) => w.id !== id));
      message.success(`已删除站点: ${domain}`);
    }
  };

  const columns = [
    {
      title: "域名 / 别名",
      dataIndex: "domain",
      key: "domain",
      render: (domain: string) => (
        <div className="flex items-center space-x-2">
          <Globe size={15} className="text-teal-400 shrink-0" />
          <span className="font-semibold text-xs text-white">{domain}</span>
        </div>
      ),
    },
    {
      title: "网站根目录",
      dataIndex: "docRoot",
      key: "docRoot",
      render: (path: string) => (
        <span className="font-mono text-xs text-slate-400">{path}</span>
      ),
    },
    {
      title: "端口",
      dataIndex: "port",
      key: "port",
      width: 80,
      render: (port: number) => (
        <span className="font-mono text-xs text-slate-300">{port}</span>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 90,
      render: (status: string) => (
        <Tag color={status === "running" ? "success" : "default"} className="m-0 text-[10px]">
          {status === "running" ? "运行中" : "已停止"}
        </Tag>
      ),
    },
    {
      title: "SSL 证书",
      dataIndex: "ssl",
      key: "ssl",
      render: (ssl: boolean, record: WebsiteItem) => (
        <div className="flex items-center space-x-1.5 text-xs">
          {ssl ? (
            <>
              <ShieldCheck size={14} className="text-emerald-400" />
              <span className="text-emerald-400 text-[11px]">{record.sslExpiry ?? "正常"}</span>
            </>
          ) : (
            <>
              <ShieldAlert size={14} className="text-slate-500" />
              <span className="text-slate-500 text-[11px]">未配置</span>
            </>
          )}
        </div>
      ),
    },
    {
      title: "备注",
      dataIndex: "remark",
      key: "remark",
      render: (text: string) => <span className="text-xs text-slate-400">{text}</span>,
    },
    {
      title: "操作",
      key: "actions",
      align: "right" as const,
      width: 140,
      render: (_: unknown, record: WebsiteItem) => (
        <div className="flex items-center justify-end space-x-1">
          <Button
            size="small"
            type="text"
            icon={<Settings size={13} />}
            title="配置"
            onClick={() => message.info(`打开站点 ${record.domain} 反代配置`)}
          />
          <Button
            size="small"
            type="text"
            icon={<RefreshCw size={13} />}
            title="重载"
            onClick={() => void reloadWebServer()}
          />
          <Button
            size="small"
            type="text"
            danger
            icon={<Trash2 size={13} />}
            title="删除"
            onClick={() => handleDelete(record.id, record.domain)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4 pb-12 select-none">
      {/* 顶部 OpenResty 状态横条 */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border"
        style={{
          borderColor: "var(--border)",
          background: "var(--bg-secondary)",
        }}
      >
        <div className="flex items-center space-x-3">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          <div className="text-xs">
            <span className="font-bold text-white mr-2">OpenResty 1.27.1.2</span>
            <Tag color="cyan" className="m-0 text-[10px]">
              主反向代理服务
            </Tag>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            size="small"
            icon={<RefreshCw size={12} />}
            onClick={() => void reloadWebServer()}
          >
            重载配置
          </Button>
          <Button
            type="primary"
            size="small"
            icon={<Plus size={14} />}
            onClick={() => setIsModalOpen(true)}
          >
            创建站点
          </Button>
        </div>
      </div>

      {/* 站点检索与表格 */}
      <div
        className="p-4 rounded-xl border space-y-3"
        style={{
          borderColor: "var(--border)",
          background: "var(--bg-secondary)",
        }}
      >
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold text-white flex items-center gap-1.5">
            <span>站点列表</span>
            <span className="text-slate-500 font-normal">（共 {filtered.length} 个站点）</span>
          </div>
          <Input
            prefix={<Search size={14} className="text-slate-400" />}
            placeholder="搜索域名或备注..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="small"
            style={{ width: 220 }}
            allowClear
          />
        </div>

        <Table
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={filtered}
          pagination={false}
          className="ops-table text-xs"
        />
      </div>

      {/* 创建站点弹窗 */}
      <Modal
        title="新建网站"
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={() => form.submit()}
        maskClosable={false}
        okText="立即创建"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} className="mt-4">
          <Form.Item
            name="domain"
            label="站点域名 / 主机名"
            rules={[{ required: true, message: "请输入域名或IP" }]}
          >
            <Input placeholder="例如: demo.example.com 或 127.0.0.1" />
          </Form.Item>
          <Form.Item name="port" label="监听端口" initialValue={80}>
            <Input type="number" placeholder="80" />
          </Form.Item>
          <Form.Item name="remark" label="站点备注">
            <Input placeholder="输入站点说明..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
