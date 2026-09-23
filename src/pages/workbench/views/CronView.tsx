import React, { useState } from "react";
import { Button, Table, Tag, Switch, Modal, Form, Input, Select, Tooltip, message } from "antd";
import {
  Clock,
  Plus,
  Play,
  FileText,
  Trash2,
} from "lucide-react";
import { MOCK_CRON_TASKS } from "../mockData";
import type { CronTaskItem } from "../types";

export const CronView: React.FC = () => {
  const [tasks, setTasks] = useState<CronTaskItem[]>(MOCK_CRON_TASKS);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [logModal, setLogModal] = useState<{ open: boolean; task: CronTaskItem | null }>({
    open: false,
    task: null,
  });
  const [form] = Form.useForm();

  const handleToggle = (id: string, enabled: boolean) => {
    setTasks(tasks.map((t) => (t.id === id ? { ...t, enabled } : t)));
    message.success(enabled ? "已启用定时任务" : "已暂停定时任务");
  };

  const handleRunNow = (task: CronTaskItem) => {
    message.loading(`正在触发任务: ${task.name}...`, 0.8).then(() => {
      message.success(`✓ 任务 [${task.name}] 执行完毕 (耗时 1.1s)`);
    });
  };

  const handleCreate = (values: { name: string; cronExpr: string; cycleDesc: string; type: "shell" | "backup" | "clean" }) => {
    const newTask: CronTaskItem = {
      id: Date.now().toString(),
      name: values.name,
      type: values.type,
      cronExpr: values.cronExpr,
      cycleDesc: values.cycleDesc || "自定义周期",
      enabled: true,
      lastRunAt: "尚未执行",
      lastDuration: "—",
      lastStatus: "success",
    };
    setTasks([newTask, ...tasks]);
    setIsModalOpen(false);
    form.resetFields();
    message.success(`✓ 定时任务 [${values.name}] 已加入系统计划任务调度`);
  };

  const columns = [
    {
      title: "任务名称",
      dataIndex: "name",
      key: "name",
      render: (name: string, record: CronTaskItem) => {
        const typeTag =
          record.type === "shell"
            ? { color: "blue", label: "Shell 脚本" }
            : record.type === "backup"
            ? { color: "purple", label: "定时备份" }
            : { color: "cyan", label: "自动清理" };
        return (
          <div className="flex items-center space-x-2">
            <Clock size={15} className="text-teal-400 shrink-0" />
            <span className="font-semibold text-xs text-white">{name}</span>
            <Tag color={typeTag.color} className="m-0 text-[10px]">
              {typeTag.label}
            </Tag>
          </div>
        );
      },
    },
    {
      title: "执行周期 / Cron 表达式",
      key: "cycle",
      render: (_: unknown, record: CronTaskItem) => (
        <div className="flex items-center space-x-2">
          <span className="text-xs text-slate-300">{record.cycleDesc}</span>
          <span className="font-mono text-xs text-teal-400 px-1.5 py-0.2 rounded bg-surface-900 border border-slate-800">
            {record.cronExpr}
          </span>
        </div>
      ),
    },
    {
      title: "最近执行 / 耗时",
      key: "lastRun",
      render: (_: unknown, record: CronTaskItem) => (
        <div className="text-xs font-mono text-slate-400">
          <span>{record.lastRunAt}</span>
          {record.lastDuration !== "—" && (
            <span className="text-slate-500 ml-1.5">({record.lastDuration})</span>
          )}
        </div>
      ),
    },
    {
      title: "状态",
      dataIndex: "enabled",
      key: "enabled",
      width: 90,
      render: (enabled: boolean, record: CronTaskItem) => (
        <Switch
          size="small"
          checked={enabled}
          onChange={(checked) => handleToggle(record.id, checked)}
        />
      ),
    },
    {
      title: "操作",
      key: "actions",
      align: "right" as const,
      width: 140,
      render: (_: unknown, record: CronTaskItem) => (
        <div className="flex items-center justify-end space-x-1">
          <Tooltip title="立即执行一次">
            <Button
              size="small"
              type="text"
              icon={<Play size={13} className="text-emerald-400" />}
              onClick={() => handleRunNow(record)}
            />
          </Tooltip>
          <Tooltip title="查看运行日志">
            <Button
              size="small"
              type="text"
              icon={<FileText size={13} />}
              onClick={() => setLogModal({ open: true, task: record })}
            />
          </Tooltip>
          <Tooltip title="删除任务">
            <Button
              size="small"
              type="text"
              danger
              icon={<Trash2 size={13} />}
              onClick={() => {
                if (confirm(`确认要删除计划任务「${record.name}」吗？`)) {
                  setTasks(tasks.filter((t) => t.id !== record.id));
                  message.success("已删除任务");
                }
              }}
            />
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4 pb-12 select-none">
      {/* 顶部横条 */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border"
        style={{
          borderColor: "var(--border)",
          background: "var(--bg-secondary)",
        }}
      >
        <div className="flex items-center space-x-2 text-xs">
          <span className="w-2.5 h-2.5 rounded-full bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.8)]" />
          <span className="font-bold text-white">Cron 定时任务调度器</span>
          <span className="text-slate-500 font-normal">
            （Linux Crontab 托管服务，支持秒级调度与日志捕获）
          </span>
        </div>

        <Button
          type="primary"
          size="small"
          icon={<Plus size={14} />}
          onClick={() => setIsModalOpen(true)}
        >
          添加计划任务
        </Button>
      </div>

      {/* 任务表格 */}
      <div
        className="p-4 rounded-xl border space-y-3"
        style={{
          borderColor: "var(--border)",
          background: "var(--bg-secondary)",
        }}
      >
        <Table
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={tasks}
          pagination={false}
          className="ops-table text-xs"
        />
      </div>

      {/* 新建任务弹窗 */}
      <Modal
        title="添加系统计划任务"
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={() => form.submit()}
        maskClosable={false}
        okText="保存并启用"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} className="mt-4">
          <Form.Item
            name="name"
            label="任务名称"
            rules={[{ required: true, message: "请输入任务名称" }]}
          >
            <Input placeholder="例如: 每日凌晨数据汇总巡检" />
          </Form.Item>
          <Form.Item name="type" label="任务类型" initialValue="shell">
            <Select
              options={[
                { label: "Shell 脚本", value: "shell" },
                { label: "数据备份任务", value: "backup" },
                { label: "自动清理任务", value: "clean" },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="cronExpr"
            label="Cron 表达式"
            initialValue="0 3 * * *"
            rules={[{ required: true }]}
          >
            <Input className="font-mono" placeholder="分 时 日 月 周" />
          </Form.Item>
          <Form.Item name="cycleDesc" label="周期描述" initialValue="每天凌晨 03:00">
            <Input placeholder="简短描述执行周期..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* 任务执行日志弹窗 */}
      <Modal
        title={`任务日志 · ${logModal.task?.name ?? ""}`}
        open={logModal.open}
        onCancel={() => setLogModal({ open: false, task: null })}
        footer={null}
        width={640}
      >
        <pre
          className="p-3 rounded-lg text-xs font-mono whitespace-pre overflow-x-auto text-emerald-400 border mt-2"
          style={{
            borderColor: "var(--border)",
            background: "#0d1117",
          }}
        >
          {`[2026-09-23 10:00:00] [INFO] 开始触发定时计划任务: ${logModal.task?.name}\n[2026-09-23 10:00:00] [INFO] 当前执行环境: bash /tmp/cron_job_${logModal.task?.id}.sh\n[2026-09-23 10:00:01] [SUCCESS] 任务执行完毕，退出码 0，耗时 1.2s。\n[2026-09-23 10:00:01] [INFO] 调度器下次预期触发时间: 2026-09-23 12:00:00`}
        </pre>
      </Modal>
    </div>
  );
};
