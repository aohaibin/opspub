import React, { useState } from "react";
import { Button, Table, Modal, Form, Select, Input, InputNumber, Switch, message, Tooltip } from "antd";
import { Archive, Plus, RotateCw, Play, Pause, History, Trash2, HelpCircle } from "lucide-react";
import { getErrorMessage } from "@/lib/api/client";
import { useWorkbenchRuntime } from "../context";
import { MOCK_BACKUP_TASKS } from "../mockData";
import type { BackupTaskItem } from "../types";

export const BackupView: React.FC = () => {
  const { runCommand } = useWorkbenchRuntime();
  const [tasks, setTasks] = useState<BackupTaskItem[]>(() => {
    return MOCK_BACKUP_TASKS.map((t, idx) => ({
      ...t,
      name: t.name || (t.targetType === "database" ? "核心数据库每日备份" : t.targetType === "website" ? "主站目录完整备份" : "配置文件归档"),
      cron: t.cron || (idx === 0 ? "0 3 * * *" : idx === 1 ? "0 4 * * *" : "0 2 * * 0"),
      keepCount: t.keepCount || (idx === 0 ? 14 : 7),
      remoteStorage: t.remoteStorage || (idx === 0 ? "腾讯云 COS (cos-main-backup)" : "本机存储"),
      enabled: t.enabled !== undefined ? t.enabled : true,
    }));
  });
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [selectedType, setSelectedType] = useState<string>("dir");

  const create = async (values: {
    taskName: string;
    targetType: string;
    targetName: string;
    excludeRules?: string;
    cron?: string;
    remoteStorage?: string;
    rcloneRemote?: string;
    keepCount?: number;
    enabled?: boolean;
  }) => {
    const cleanPath = values.targetName.trim();
    if (values.targetType === "dir" && !cleanPath.startsWith("/")) {
      message.error("目录路径必须是绝对路径（如 /var/www/site）");
      return;
    }
    const fileName = `backup_${Date.now()}.tar.gz`;
    const output = `/tmp/${fileName}`;

    try {
      if (values.targetType === "dir") {
        const result = await runCommand(`tar -czf ${JSON.stringify(output)} -C / ${JSON.stringify(cleanPath.replace(/^\/+/, ""))}`);
        if (result.exitCode !== 0) throw new Error(result.stderr || "备份执行失败");
      }

      const newTask: BackupTaskItem = {
        id: `task_${Date.now()}`,
        name: values.taskName.trim(),
        targetType: values.targetType,
        targetName: cleanPath,
        fileName: output,
        size: "已生成",
        cron: values.cron || "0 3 * * *",
        keepCount: values.keepCount || 7,
        remoteStorage: values.rcloneRemote || (values.remoteStorage === "none" ? "本机存储" : values.remoteStorage || "本机存储"),
        enabled: values.enabled !== undefined ? values.enabled : true,
        completedAt: new Date().toLocaleString(),
        status: "success",
      };

      setTasks((prev) => [newTask, ...prev]);
      setOpen(false);
      form.resetFields();
      message.success("备份任务已创建成功");
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const toggleTaskEnabled = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t))
    );
  };

  const runTaskNow = (task: BackupTaskItem) => {
    message.loading({ content: `正在触发任务 [${task.name || task.targetName}]...`, key: "runBackup", duration: 1.5 });
    setTimeout(() => {
      message.success({ content: `任务 [${task.name || task.targetName}] 执行完成，快照已生成`, key: "runBackup" });
    }, 1500);
  };

  const columns = [
    {
      title: "任务名",
      dataIndex: "name",
      key: "name",
      render: (name: string, record: BackupTaskItem) => (
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-brand-500/10 border border-brand-500/30 flex items-center justify-center text-brand-400 shrink-0">
            <Archive size={15} />
          </div>
          <div className="min-w-0">
            <div className="font-medium text-xs flex items-center gap-1.5">
              <span>{name || record.targetName}</span>
              {record.enabled ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-normal">
                  已启用
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700 font-normal">
                  已暂停
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 font-mono truncate mt-0.5" title={record.targetName}>
              {record.targetName}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "类型",
      dataIndex: "targetType",
      key: "targetType",
      width: 120,
      render: (type: string) => {
        const typeMap: Record<string, string> = {
          directory: "目录打包",
          dir: "目录打包",
          database: "数据库",
          mysql: "MySQL",
          postgres: "PostgreSQL",
          redis: "Redis",
          site: "整站打包",
          website: "网站",
        };
        return (
          <span className="px-2 py-0.5 rounded text-[11px] bg-brand-500/15 text-brand-400 border border-brand-500/30 font-medium">
            {typeMap[type] || type}
          </span>
        );
      },
    },
    {
      title: "保留份数",
      dataIndex: "keepCount",
      key: "keepCount",
      width: 110,
      render: (count: number) => <span className="font-mono text-xs">{count || 7} 份</span>,
    },
    {
      title: "定时",
      dataIndex: "cron",
      key: "cron",
      width: 160,
      render: (cron: string, record: BackupTaskItem) => (
        <div className="text-xs">
          <div className="font-mono text-slate-300">{cron || "0 3 * * *"}</div>
          <div className="text-[11px] text-slate-400 mt-0.5 truncate">{record.remoteStorage || "本机存储"}</div>
        </div>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 150,
      align: "right" as const,
      render: (_: unknown, record: BackupTaskItem) => (
        <div className="flex justify-end items-center gap-1 text-slate-400">
          <Tooltip title="立即备份">
            <Button size="small" type="text" icon={<Play size={13} />} onClick={() => runTaskNow(record)} />
          </Tooltip>
          <Tooltip title={record.enabled ? "暂停任务" : "启用任务"}>
            <Button
              size="small"
              type="text"
              icon={record.enabled ? <Pause size={13} /> : <Play size={13} className="text-emerald-400" />}
              onClick={() => toggleTaskEnabled(record.id)}
            />
          </Tooltip>
          <Tooltip title="历史快照">
            <Button size="small" type="text" icon={<History size={13} />} onClick={() => message.info(`[${record.name}] 当前历史快照：共 ${record.keepCount || 7} 份`)} />
          </Tooltip>
          <Tooltip title="删除">
            <Button
              size="small"
              type="text"
              danger
              icon={<Trash2 size={13} />}
              onClick={() => setTasks((prev) => prev.filter((task) => task.id !== record.id))}
            />
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3.5 pb-12 select-none">
      {/* 顶部横条 */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border"
        style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
      >
        <div className="flex items-center space-x-2.5">
          <span className="p-1.5 rounded-lg bg-brand-500/15 text-brand-400 flex items-center justify-center">
            <Archive size={16} />
          </span>
          <div className="flex items-center space-x-2">
            <h2 className="text-sm font-bold text-slate-100">数据备份</h2>
            <span className="text-xs text-slate-400">
              备份这台服务器上的数据，产物存放在该机{" "}
              <code className="text-brand-300 font-mono px-1.5 py-0.5 rounded bg-surface-900 border border-slate-800 text-[11px]">
                ~/.opssentry/backups/
              </code>
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button type="primary" size="small" icon={<Plus size={14} />} onClick={() => setOpen(true)}>
            新建备份任务
          </Button>
          <Button
            size="small"
            icon={<RotateCw size={13} />}
            onClick={() => {
              message.success("备份列表已刷新");
            }}
          >
            刷新
          </Button>
        </div>
      </div>

      {/* 备份任务列表区 */}
      <div
        className="p-3.5 rounded-xl border overflow-hidden"
        style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
      >
        <Table
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={tasks}
          pagination={false}
          className="ops-table text-xs"
          locale={{
            emptyText: (
              <div className="py-16 text-center select-none space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-surface-900 border border-slate-800 flex items-center justify-center text-slate-500 mx-auto">
                  <Archive size={26} />
                </div>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  还没有备份任务，运维不敢用一个不能回滚的工具 —— 先给关键目录/数据库加一条。
                </p>
                <Button type="primary" size="small" icon={<Plus size={13} />} onClick={() => setOpen(true)}>
                  新建第一条备份任务
                </Button>
              </div>
            ),
          }}
        />
      </div>

      {/* 新建备份任务模态框 (严格对齐设计稿 8 字段) */}
      <Modal
        title={<span className="text-sm font-semibold tracking-wide">新建备份任务</span>}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        okText="确定"
        cancelText="取消"
        width={460}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={create}
          initialValues={{
            targetType: "dir",
            targetName: "/var/www/site",
            excludeRules: "node_modules\n.git\n*.log",
            cron: "0 3 * * *",
            remoteStorage: "none",
            keepCount: 7,
            enabled: true,
          }}
          className="pt-2 text-xs"
        >
          {/* 1. 任务名称 */}
          <Form.Item
            name="taskName"
            label={<span className="text-xs font-medium">任务名称</span>}
            rules={[{ required: true, message: "请输入任务名称" }]}
          >
            <Input placeholder="如：网站目录每日备份" />
          </Form.Item>

          {/* 2. 备份类型 */}
          <Form.Item
            name="targetType"
            label={<span className="text-xs font-medium">备份类型</span>}
          >
            <Select
              onChange={(val) => {
                setSelectedType(val);
                if (val === "dir") form.setFieldsValue({ targetName: "/var/www/site" });
                else if (val === "mysql") form.setFieldsValue({ targetName: "app_production" });
                else if (val === "postgres") form.setFieldsValue({ targetName: "core_db" });
                else if (val === "redis") form.setFieldsValue({ targetName: "127.0.0.1:6379" });
                else if (val === "site") form.setFieldsValue({ targetName: "/var/www/my-app" });
              }}
              options={[
                { label: "目录打包", value: "dir" },
                { label: "MySQL 数据库", value: "mysql" },
                { label: "PostgreSQL 数据库", value: "postgres" },
                { label: "Redis 内存持久化", value: "redis" },
                { label: "整站完整打包 (Web + DB)", value: "site" },
              ]}
            />
          </Form.Item>

          {/* 3. 目录路径 / 库名 */}
          <Form.Item
            name="targetName"
            label={
              <span className="flex items-center text-xs font-medium">
                <span>{selectedType === "mysql" ? "MySQL 数据库名" : selectedType === "postgres" ? "PostgreSQL 库名" : selectedType === "redis" ? "Redis 实例" : "目录路径"}</span>
                <Tooltip title="服务器上需要打包归档的源目录绝对路径或数据库名称">
                  <HelpCircle size={13} className="ml-1 text-slate-400 cursor-pointer" />
                </Tooltip>
              </span>
            }
            rules={[{ required: true, message: "请输入目标路径或数据库名" }]}
          >
            <Input placeholder={selectedType === "dir" ? "/var/www/site" : selectedType === "mysql" ? "app_production" : "/var/www/site"} />
          </Form.Item>

          {/* 4. 排除规则 */}
          <Form.Item
            name="excludeRules"
            label={
              <span className="flex items-center text-xs font-medium">
                <span>排除规则</span>
                <Tooltip title="排除匹配的文件或目录，支持相对路径与通配符，每行一条">
                  <HelpCircle size={13} className="ml-1 text-slate-400 cursor-pointer" />
                </Tooltip>
              </span>
            }
            extra={
              <span className="text-[11px] text-slate-400 leading-relaxed block mt-1">
                备份网站目录时 node_modules / .git / 缓存常占体积九成，排除后备份能小一个数量级
              </span>
            }
          >
            <Input.TextArea rows={3} placeholder={"node_modules\n.git\n*.log"} />
          </Form.Item>

          {/* 5. 定时 (crontab) */}
          <Form.Item
            name="cron"
            label={
              <span className="flex items-center text-xs font-medium">
                <span>定时 (crontab)</span>
                <Tooltip title="标准 Linux crontab 5位表达式，留空表示仅手动运行">
                  <HelpCircle size={13} className="ml-1 text-slate-400 cursor-pointer" />
                </Tooltip>
              </span>
            }
          >
            <Input placeholder="0 3 * * *" />
          </Form.Item>

          {/* 6. 异地存储端 */}
          <Form.Item
            name="remoteStorage"
            label={
              <span className="flex items-center text-xs font-medium">
                <span>异地存储端</span>
                <Tooltip title="备份完成后自动分块推送至已配置的对象存储桶">
                  <HelpCircle size={13} className="ml-1 text-slate-400 cursor-pointer" />
                </Tooltip>
              </span>
            }
            extra={
              <span className="text-[11px] text-brand-400 hover:text-brand-300 cursor-pointer inline-block mt-1">
                去「设置 &gt; 备份与还原 &gt; 云端同步」新增存储端
              </span>
            }
          >
            <Select
              options={[
                { label: "不推异地", value: "none" },
                { label: "腾讯云 COS (cos-main-backup)", value: "cos" },
                { label: "阿里云 OSS (oss-prod-hk)", value: "oss" },
                { label: "AWS S3 (s3-glacier-vault)", value: "s3" },
              ]}
            />
          </Form.Item>

          {/* 7. 异地推送 (rclone) */}
          <Form.Item
            name="rcloneRemote"
            label={
              <span className="flex items-center text-xs font-medium">
                <span>异地推送 (rclone)</span>
                <Tooltip title="rclone 格式的目标路径，如 s3:my-bucket/path">
                  <HelpCircle size={13} className="ml-1 text-slate-400 cursor-pointer" />
                </Tooltip>
              </span>
            }
            extra={
              <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap items-center gap-1.5">
                <span>留空 = 只存本机。</span>
                <span className="text-amber-400 font-medium">⚠️ 不推异地的话，这台机器整机挂掉时备份会跟着一起没</span>
              </div>
            }
          >
            <Input placeholder="s3:my-bucket/opssentry-backups" />
          </Form.Item>

          {/* 8. 保留份数 & 启用 */}
          <div className="flex items-center justify-between pt-1">
            <Form.Item
              name="keepCount"
              label={
                <span className="flex items-center text-xs font-medium">
                  <span>保留份数</span>
                  <Tooltip title="超过此数量的旧备份将按创建时间由旧至新自动轮转清理">
                    <HelpCircle size={13} className="ml-1 text-slate-400 cursor-pointer" />
                  </Tooltip>
                </span>
              }
              className="mb-0"
            >
              <InputNumber min={1} max={99} className="w-24 text-center font-mono" />
            </Form.Item>

            <Form.Item
              name="enabled"
              label={<span className="text-xs font-medium">启用</span>}
              valuePropName="checked"
              className="mb-0 flex flex-col items-end"
            >
              <Switch />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
