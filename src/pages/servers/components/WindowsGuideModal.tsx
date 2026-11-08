import { useState } from "react";
import { Button, Modal, message } from "antd";
import { Check, Copy, Download, Terminal } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { fileApi } from "@/lib/api/file";
import { getErrorMessage } from "@/lib/api/client";
import sshScript from "../lib/setup-openssh.ps1?raw";
import chocoScript from "../lib/setup-chocolatey.ps1?raw";
import { serverSetupStyles } from "./serverSetupStyles";

interface WindowsGuideModalProps { open: boolean; onCancel: () => void }

function ScriptBlock({ name, script }: { name: string; script: string }) {
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(script); setCopied(true); message.success("脚本已复制"); }
    catch (e) { message.error("复制失败：" + getErrorMessage(e)); }
  };
  const download = async () => {
    setSaving(true);
    try {
      const path = await save({ title: "保存 Windows 准备脚本", defaultPath: name, filters: [{ name: "PowerShell", extensions: ["ps1"] }] });
      if (!path) return;
      await fileApi.writeText(path, script); message.success("脚本已保存：" + path);
    } catch (e) { message.error(getErrorMessage(e)); }
    finally { setSaving(false); }
  };
  return <div className="space-y-3">
    <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--border)", background: "var(--bg-primary)" }}>
      <div className="flex items-center justify-between px-4 py-2 font-mono text-xs" style={{ borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>
        <span className="flex items-center gap-2"><Terminal size={14} style={{ color: "var(--info)" }} />{name}</span><span>PowerShell 5.1+</span>
      </div>
      <pre className="m-0 max-h-56 overflow-auto p-4 text-xs leading-relaxed custom-scrollbar" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{script}</pre>
    </div>
    <div className="flex gap-3"><Button type="primary" icon={copied ? <Check size={14} /> : <Copy size={14} />} onClick={() => void copy()}>{copied ? "已复制" : "复制脚本"}</Button><Button icon={<Download size={14} />} loading={saving} onClick={() => void download()}>另存为 .ps1</Button></div>
  </div>;
}

export function WindowsGuideModal({ open, onCancel }: WindowsGuideModalProps) {
  return <Modal open={open} onCancel={onCancel} centered destroyOnHidden width={780} styles={serverSetupStyles}
    title={<span className="flex items-center gap-2 text-sm font-bold"><Terminal size={17} style={{ color: "var(--info)" }} />Windows 服务器接入 · 准备脚本</span>}
    footer={<Button type="primary" onClick={onCancel}>我知道了</Button>}>
    <div className="space-y-6" style={{ color: "var(--text-secondary)" }}>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>① 开通 SSH（必需 — OpsPub 靠 SSH 连接）</h3>
        <p>OpsPub 通过 SSH 管理服务器。请先在目标 Windows 开通 OpenSSH Server，再配置 OpsPub 连接。</p>
        <p>在目标机的「管理员 PowerShell」执行下面的脚本，可通过远程桌面或云控制台的「发送命令」进入。脚本可以重复执行。</p>
        <ScriptBlock name="setup-openssh.ps1" script={sshScript} />
        <p className="flex items-start gap-2 text-xs" style={{ color: "var(--warning)" }}><span>●</span><span>云服务器还要在「安全组」入方向放行 TCP 22。系统防火墙与云安全组都需要允许连接。</span></p>
      </section>
      <section className="space-y-3 border-t pt-5" style={{ borderColor: "var(--border)" }}>
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>② 装 Chocolatey（Windows 原生装应用的前提，可选）</h3>
        <p>需要使用 choco 安装 Windows 应用时，再执行此脚本。安装使用 Chocolatey 官方源，需要目标机可访问公网；Chocolatey 2.x 需要 .NET Framework 4.8。</p>
        <ScriptBlock name="setup-chocolatey.ps1" script={chocoScript} />
      </section>
      <p className="border-t pt-4" style={{ borderColor: "var(--border)" }}>开通后回到服务器页点击「纳管服务器」，选择 Windows，填写主机、端口 22、登录账号与凭据，再测试连接。首次 SSH 连接请核对目标机的主机指纹。</p>
    </div>
  </Modal>;
}
