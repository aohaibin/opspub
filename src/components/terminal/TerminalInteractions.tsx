import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Input, Modal, Select, Spin, message } from "antd";
import { Bot, Check, ChevronDown, ChevronUp, Clipboard, Code2, Copy, Lightbulb, Terminal as TerminalIcon, Trash2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Terminal } from "@xterm/xterm";
import { getErrorMessage } from "@/lib/api/client";
import { modelServiceApi } from "@/lib/api/model-service";
import { terminalApi } from "@/lib/api/terminal";
import { inspectTerminalPaste, saveTerminalLibraryItem, terminalShortcut, TERMINAL_PASTE_EVENT, type TerminalLibraryKind } from "@/lib/terminal-interactions";
import type { ModelProfile, Server } from "@/types";
import "./terminal-interactions.css";

interface Props {
  terminal: Terminal | null;
  server: Server;
  sessionId: string;
  connected: boolean;
  onInterrupt: () => void;
}

interface Explanation {
  text: string;
  answer: string;
  error: string;
  loading: boolean;
}

export function TerminalInteractions({ terminal, server, sessionId, connected, onInterrupt }: Props) {
  const [modal, modalHolder] = Modal.useModal();
  const [selection, setSelection] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; selection: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [saveDraft, setSaveDraft] = useState<{ kind: TerminalLibraryKind; title: string; content: string } | null>(null);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [profiles, setProfiles] = useState<ModelProfile[]>([]);
  const [profileId, setProfileId] = useState<string>();
  const menuRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);
  const aliveRef = useRef(true);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const connectedRef = useRef(connected);
  connectedRef.current = connected;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      requestRef.current += 1;
      clearTimeout(copyTimerRef.current);
    };
  }, []);

  const copy = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (!aliveRef.current) return;
      setCopied(true);
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1600);
      message.success("已复制选中内容");
    } catch {
      message.error("无法写入剪贴板，请检查系统剪贴板权限");
    }
  };

  const pasteText = (text: string) => {
    if (!terminal || !connectedRef.current) {
      message.warning("终端已断开，无法粘贴");
      return;
    }
    const mode = inspectTerminalPaste(text);
    if (mode === "empty") return;
    if (mode === "unsafe") {
      message.warning("剪贴板含终端控制字符，请移除后再粘贴");
      return;
    }
    const insert = () => {
      if (!aliveRef.current || !connectedRef.current) return;
      // 使用 xterm 原生 bracketed paste，仍走此分屏原有的输入/同步输入通道。
      terminal.paste(text);
      terminal.focus();
    };
    if (mode === "direct") insert();
    else modal.confirm({
      title: "确认粘贴多行内容？",
      content: <div className="ops-terminal-paste-preview"><p>换行可能立即执行命令，请核对后再粘贴。开启同步输入时会发送到所有已连接分屏。</p><pre>{text}</pre></div>,
      okText: "确认粘贴", cancelText: "取消", width: 560,
      onOk: insert,
      onCancel: () => terminal.focus(),
    });
  };

  const readClipboard = async () => {
    try { pasteText(await navigator.clipboard.readText()); }
    catch { message.warning("无法读取剪贴板，请聚焦终端后按 Ctrl+V 粘贴"); }
  };

  const explain = async (text: string, selectedProfile?: string) => {
    if (!text.trim()) return;
    if ([...text].length > 12_000) {
      message.warning("选中文字过长，请缩小到 12000 字以内再解释");
      return;
    }
    const request = ++requestRef.current;
    setCollapsed(false);
    setExplanation({ text, answer: "", error: "", loading: true });
    try {
      const enabled = (await modelServiceApi.listProfiles()).filter((item) => item.enabled);
      if (!aliveRef.current || request !== requestRef.current) return;
      setProfiles(enabled);
      const preferred = selectedProfile ?? profileId ?? localStorage.getItem("ops_copilot_model_profile");
      const profile = enabled.find((item) => item.id === preferred) ?? enabled[0];
      if (!profile) throw new Error("请先在设置 → 模型服务中添加并启用一个模型，然后点击重新解释");
      setProfileId(profile.id);
      const answer = await terminalApi.explainSelection(profile.id, server.id, text);
      if (aliveRef.current && request === requestRef.current) setExplanation({ text, answer, error: "", loading: false });
    } catch (error) {
      if (aliveRef.current && request === requestRef.current) setExplanation({ text, answer: "", error: getErrorMessage(error), loading: false });
    }
  };

  const openSave = (kind: TerminalLibraryKind, text: string) => {
    if (!text.trim()) return;
    if (text.length > 12_000) {
      message.warning("选中文字过长，请缩小到 12000 字以内再保存");
      return;
    }
    setSaveDraft({ kind, title: `${server.alias} · ${kind === "snippet" ? "命令片段" : "终端经验"}`.slice(0, 80), content: text });
  };

  const actionsRef = useRef({ copy, pasteText, onInterrupt });
  actionsRef.current = { copy, pasteText, onInterrupt };

  useEffect(() => {
    if (!terminal?.element) return;
    const host = terminal.element;
    const selected = terminal.onSelectionChange(() => setSelection(terminal.getSelection()));
    terminal.attachCustomKeyEventHandler((event) => {
      const action = terminalShortcut(event, terminal.hasSelection());
      if (!action) return true;
      // Ctrl+V 保留浏览器默认 paste 事件；只由下方捕获监听处理一次。
      if (action === "paste") return false;
      event.preventDefault();
      event.stopPropagation();
      if (event.type === "keydown" && !event.repeat) {
        if (action === "copy") void actionsRef.current.copy(terminal.getSelection());
        else if (connectedRef.current) actionsRef.current.onInterrupt();
      }
      return false;
    });
    const paste = (event: ClipboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      actionsRef.current.pasteText(event.clipboardData?.getData("text/plain") ?? "");
    };
    const contextMenu = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setMenu({ x: event.clientX, y: event.clientY, selection: terminal.getSelection() });
    };
    const preserveSelection = (event: MouseEvent) => {
      if (event.button === 2) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    host.addEventListener("paste", paste, true);
    host.addEventListener("contextmenu", contextMenu, true);
    host.addEventListener("mousedown", preserveSelection, true);
    return () => {
      selected.dispose();
      terminal.attachCustomKeyEventHandler(() => true);
      host.removeEventListener("paste", paste, true);
      host.removeEventListener("contextmenu", contextMenu, true);
      host.removeEventListener("mousedown", preserveSelection, true);
    };
  }, [terminal]);

  useEffect(() => {
    const insert = (event: Event) => {
      const request = (event as CustomEvent<{ sessionId: string; text: string }>).detail;
      if (request?.sessionId === sessionId && typeof request.text === "string") actionsRef.current.pasteText(request.text);
    };
    window.addEventListener(TERMINAL_PASTE_EVENT, insert);
    return () => window.removeEventListener(TERMINAL_PASTE_EVENT, insert);
  }, [sessionId]);

  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const element = menuRef.current;
    const bounds = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - bounds.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - bounds.height - 8))}px`;
    element.focus();
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const close = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      setMenu(null);
    };
    const resize = () => setMenu(null);
    document.addEventListener("pointerdown", close, true);
    window.addEventListener("resize", resize);
    window.addEventListener("blur", resize);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      window.removeEventListener("resize", resize);
      window.removeEventListener("blur", resize);
    };
  }, [menu]);

  const menuAction = (action: () => void) => {
    setMenu(null);
    terminal?.focus();
    action();
  };

  return <>
    {modalHolder}
    {selection && <div className="ops-terminal-selection-tools" onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}>
      <button type="button" title="复制选中内容 · Ctrl+C" onClick={() => void copy(selection)}>{copied ? <Check size={13} /> : <Copy size={13} />}<span>{copied ? "已复制" : "复制"}</span></button>
      <button type="button" title="AI 解释选中内容" onClick={() => void explain(selection)}><Bot size={13} /><span>AI 解释</span></button>
    </div>}
    {menu && createPortal(<div
      ref={menuRef} className="ops-terminal-context-menu" role="menu" aria-label="终端右键菜单" tabIndex={-1}
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={(event) => event.preventDefault()}
      onMouseDown={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === "Escape" || event.key === "Tab") { setMenu(null); terminal?.focus(); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
          const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const next = current < 0 ? (event.key === "ArrowDown" ? 0 : buttons.length - 1) : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }
      }}>
      <button type="button" role="menuitem" disabled={!menu.selection} onClick={() => menuAction(() => void copy(menu.selection))}><Copy size={15} /><span>复制</span><kbd>Ctrl+C</kbd></button>
      <button type="button" role="menuitem" disabled={!connected} onClick={() => menuAction(() => void readClipboard())}><Clipboard size={15} /><span>粘贴</span><kbd>Ctrl+V</kbd></button>
      <button type="button" role="menuitem" onClick={() => menuAction(() => terminal?.selectAll())}><TerminalIcon size={15} /><span>全选输出</span></button>
      <hr />
      <button type="button" role="menuitem" className="is-ai" disabled={!menu.selection.trim()} onClick={() => menuAction(() => void explain(menu.selection))}><Bot size={15} /><span>问 AI：解释选中</span></button>
      <button type="button" role="menuitem" disabled={!menu.selection.trim()} onClick={() => menuAction(() => openSave("snippet", menu.selection))}><Code2 size={15} /><span>存为命令片段</span></button>
      <button type="button" role="menuitem" className="is-experience" disabled={!menu.selection.trim()} onClick={() => menuAction(() => openSave("experience", menu.selection))}><Lightbulb size={15} /><span>存为经验</span></button>
      <hr />
      <button type="button" role="menuitem" onClick={() => menuAction(() => { terminal?.clear(); terminal?.clearSelection(); })}><Trash2 size={15} /><span>清屏</span></button>
    </div>, document.body)}
    {explanation && <section className={`ops-terminal-inline-ai ${collapsed ? "is-collapsed" : ""}`} onMouseDown={(event) => event.stopPropagation()} aria-label="终端选区 AI 解释">
      <header>
        <span><Bot size={15} /><strong>AI 解释</strong><small>{server.alias} · 仅分析选中文字</small></span>
        <div>
          <button type="button" title={collapsed ? "展开解释" : "收起解释"} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
          <button type="button" title="关闭解释" onClick={() => { requestRef.current += 1; setExplanation(null); }}><X size={15} /></button>
        </div>
      </header>
      {!collapsed && <div className="ops-terminal-inline-ai-body">
        <details><summary>查看本次选中的原文</summary><pre>{explanation.text}</pre></details>
        {explanation.loading ? <div role="status"><Spin size="small" /> 正在分析选中文字…</div>
          : explanation.error ? <p className="ops-terminal-ai-error" role="alert">{explanation.error}</p>
            : <div className="ops-terminal-ai-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ children }) => <span>{children}</span>, img: () => null }}>{explanation.answer}</ReactMarkdown></div>}
        <footer>
          <Select size="small" aria-label="终端解释使用的模型" placeholder="选择已配置模型" value={profileId} onChange={setProfileId} disabled={explanation.loading} options={profiles.map((profile) => ({ value: profile.id, label: profile.name }))} />
          <Button size="small" disabled={explanation.loading} onClick={() => void explain(explanation.text, profileId)}>重新解释</Button>
          {explanation.answer && <Button size="small" icon={<Copy size={12} />} onClick={() => void copy(explanation.answer)}>复制</Button>}
        </footer>
      </div>}
    </section>}
    <Modal title={saveDraft?.kind === "snippet" ? "存为命令片段" : "存为经验"} open={!!saveDraft} mask={{ closable: false }} okText="保存到本机" cancelText="取消" onCancel={() => setSaveDraft(null)} onOk={() => {
      if (!saveDraft) return;
      try {
        saveTerminalLibraryItem(saveDraft.kind, saveDraft.title, saveDraft.content);
        message.success(saveDraft.kind === "snippet" ? "已保存，可在终端右侧「常用脚本片段库」查看" : "已保存，可在 AI 助手「经验库」查看");
        setSaveDraft(null);
      } catch (error) { message.error(getErrorMessage(error)); }
    }}>
      <div className="ops-terminal-save-fields">
        <label>标题<Input maxLength={80} value={saveDraft?.title ?? ""} onChange={(event) => setSaveDraft((current) => current && ({ ...current, title: event.target.value }))} /></label>
        <label>内容<Input.TextArea rows={8} maxLength={12_000} showCount value={saveDraft?.content ?? ""} onChange={(event) => setSaveDraft((current) => current && ({ ...current, content: event.target.value }))} /></label>
      </div>
    </Modal>
  </>;
}
