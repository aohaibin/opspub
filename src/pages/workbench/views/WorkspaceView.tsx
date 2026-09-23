import React, { useState } from "react";
import { Button, Table, Select, Tooltip, message } from "antd";
import {
  Briefcase,
  Download,
  Trash2,
  Archive,
  FileText,
  Code,
  Terminal,
} from "lucide-react";
import { MOCK_WORKSPACE_FILES } from "../mockData";
import type { WorkspaceFileItem } from "../types";

export const WorkspaceView: React.FC = () => {
  const [tab, setTab] = useState<"backups" | "logs" | "scripts" | "runs">("backups");
  const [files, setFiles] = useState<WorkspaceFileItem[]>(MOCK_WORKSPACE_FILES);
  const [cleanDays, setCleanDays] = useState("7");

  const filtered = files.filter((f) => f.category === tab);

  const handleClean = () => {
    const cutoff = Date.now() - Number(cleanDays) * 24 * 60 * 60 * 1000;
    const nextFiles = files.filter((file) => file.category !== tab || Number.isNaN(Date.parse(file.mtime)) || Date.parse(file.mtime) >= cutoff);
    const removed = files.length - nextFiles.length;
    setFiles(nextFiles);
    message.success(removed > 0 ? `已清理 ${removed} 个旧文件` : "没有符合条件的旧文件");
    return;
    message.success(`已清理 ${cleanDays} 天前的旧${tab}文件 (释放 120MB 空间)`);
  };

  const columns = [
    {
      title: "文件名称",
      dataIndex: "name",
      key: "name",
      render: (name: string) => {
        const Icon =
          tab === "backups"
            ? Archive
            : tab === "logs"
            ? FileText
            : tab === "scripts"
            ? Code
            : Terminal;
        return (
          <div className="flex items-center space-x-2">
            <Icon size={15} className="text-teal-400 shrink-0" />
            <span className="font-mono text-xs font-medium text-white">{name}</span>
          </div>
        );
      },
    },
    {
      title: "大小",
      dataIndex: "size",
      key: "size",
      width: 120,
      render: (size: string) => (
        <span className="font-mono text-xs text-slate-300 font-bold">{size}</span>
      ),
    },
    {
      title: "更新时间",
      dataIndex: "mtime",
      key: "mtime",
      width: 180,
      render: (mtime: string) => (
        <span className="font-mono text-xs text-slate-400">{mtime}</span>
      ),
    },
    {
      title: "操作",
      key: "actions",
      align: "right" as const,
      width: 120,
      render: (_: unknown, record: WorkspaceFileItem) => (
        <div className="flex items-center justify-end space-x-1">
          <Tooltip title="下载">
            <Button
              size="small"
              type="text"
              icon={<Download size={13} />}
              onClick={() => {
                const blob = new Blob([`${record.name}\n大小: ${record.size}\n更新时间: ${record.mtime}`], { type: "text/plain;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = record.name;
                anchor.click();
                URL.revokeObjectURL(url);
              }}
            />
          </Tooltip>
          <Tooltip title="删除">
            <Button
              size="small"
              type="text"
              danger
              icon={<Trash2 size={13} />}
              onClick={() => {
                if (confirm(`确认要删除工作区文件「${record.name}」吗？`)) {
                  setFiles(files.filter((f) => f.id !== record.id));
                  message.success(`已删除: ${record.name}`);
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
      {/* 顶部工具栏 */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border"
        style={{
          borderColor: "var(--border)",
          background: "var(--bg-secondary)",
        }}
      >
        <div className="flex items-center space-x-2">
          {[
            { key: "backups", label: "备份文件" },
            { key: "logs", label: "运行日志" },
            { key: "scripts", label: "常用脚本" },
            { key: "runs", label: "执行记录" },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key as typeof tab)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                tab === t.key
                  ? "bg-teal-500/20 text-teal-300 border border-teal-500/40"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center space-x-2 text-xs">
          <span style={{ color: "var(--text-muted)" }}>清理超过</span>
          <Select
            size="small"
            value={cleanDays}
            onChange={(val) => setCleanDays(val)}
            style={{ width: 80 }}
            options={[
              { label: "3 天", value: "3" },
              { label: "7 天", value: "7" },
              { label: "30 天", value: "30" },
            ]}
          />
          <Button size="small" danger onClick={handleClean}>
            一键清理
          </Button>
        </div>
      </div>

      {/* 表格内容 */}
      <div
        className="p-4 rounded-xl border space-y-3"
        style={{
          borderColor: "var(--border)",
          background: "var(--bg-secondary)",
        }}
      >
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold text-white flex items-center gap-1.5">
            <Briefcase size={14} className="text-teal-400" />
            <span>本地工作区存储</span>
            <span className="text-slate-500 font-normal">（当前分类共 {filtered.length} 个文件）</span>
          </div>
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
    </div>
  );
};
