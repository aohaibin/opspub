import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useSettingsStore } from "@/store";
import { TerminalInteractions } from "@/components/terminal/TerminalInteractions";
import type { Server, TerminalSessionInfo } from "@/types";
import { TERMINAL_THEMES } from "@/components/terminal/terminal-themes";

interface TerminalPaneProps {
  session: TerminalSessionInfo;
  server: Server;
  output: string;
  statusMessage: string;
  onInput: (sessionId: string, data: string) => void;
  onResize: (sessionId: string, cols: number, rows: number) => void;
  onFocus: (sessionId: string) => void;
}

export function TerminalPane({
  session,
  server,
  output,
  statusMessage,
  onInput,
  onResize,
  onFocus,
}: TerminalPaneProps) {
  const themeId = useSettingsStore((state) => state.terminalTheme);
  const fontSize = useSettingsStore((state) => state.terminalFontSize);
  const lineHeight = useSettingsStore((state) => state.terminalLineHeight);
  const cursorStyle = useSettingsStore((state) => state.terminalCursorStyle);
  const terminalTheme = TERMINAL_THEMES[themeId];
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const [activeTerminal, setActiveTerminal] = useState<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const writtenOutputRef = useRef("");
  const inputHandlerRef = useRef(onInput);
  const resizeHandlerRef = useRef(onResize);
  const focusHandlerRef = useRef(onFocus);

  inputHandlerRef.current = onInput;
  resizeHandlerRef.current = onResize;
  focusHandlerRef.current = onFocus;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: false,
      cursorBlink: cursorStyle !== "underline",
      cursorStyle,
      fontFamily: "Cascadia Code, JetBrains Mono, Consolas, monospace",
      fontSize,
      lineHeight,
      scrollback: 8_000,
      theme: terminalTheme,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);
    terminalRef.current = terminal;
    setActiveTerminal(terminal);
    fitRef.current = fit;

    const dataDisposable = terminal.onData((data) => {
      inputHandlerRef.current(session.sessionId, data);
    });
    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      resizeHandlerRef.current(session.sessionId, cols, rows);
    });
    const handleFocus = () => {
      focusHandlerRef.current(session.sessionId);
    };
    host.addEventListener("focusin", handleFocus);

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(() => {
        try {
          fit.fit();
        } catch {
          // 分屏切换过程中容器可能短暂为 0 尺寸，下一次 ResizeObserver 会重试。
        }
      });
    });
    observer.observe(host);
    window.requestAnimationFrame(() => {
      fit.fit();
      terminal.focus();
    });

    return () => {
      observer.disconnect();
      dataDisposable.dispose();
      resizeDisposable.dispose();
      host.removeEventListener("focusin", handleFocus);
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
      writtenOutputRef.current = "";
    };
  }, [session.sessionId]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.fontSize = fontSize;
    terminal.options.lineHeight = lineHeight;
    terminal.options.cursorStyle = cursorStyle;
    terminal.options.cursorBlink = cursorStyle !== "underline";
    window.requestAnimationFrame(() => fitRef.current?.fit());
  }, [fontSize, lineHeight, cursorStyle]);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.options.theme = terminalTheme;
  }, [terminalTheme]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal || output === writtenOutputRef.current) return;

    if (output.startsWith(writtenOutputRef.current)) {
      terminal.write(output.slice(writtenOutputRef.current.length));
    } else {
      terminal.reset();
      terminal.write(output);
    }
    writtenOutputRef.current = output;
  }, [output]);

  const disconnected = session.status === "closed" || session.status === "error";

  return (
    <div
      className={`ops-terminal-pane ${disconnected ? "is-disconnected" : ""}`}
      onMouseDown={(event) => { if (event.button === 0) onFocus(session.sessionId); }}
    >
      <div className="ops-terminal-pane-head">
        <span>
          <span className="ops-terminal-online-dot" data-status={session.status} />
          {server.username}@{server.alias} ({server.hostname}:{server.port})
        </span>
        <span>{session.status === "connected" ? "SSH PTY · UTF-8" : statusMessage}</span>
      </div>
      <div className="ops-terminal-viewport">
        <div className="ops-terminal-xterm" ref={hostRef} />
      </div>
      <TerminalInteractions
        key={session.sessionId}
        terminal={activeTerminal}
        server={server}
        sessionId={session.sessionId}
        connected={session.status === "connected"}
        onInterrupt={() => onInput(session.sessionId, "\x03")}
      />
      {disconnected && (
        <div className="ops-terminal-disconnected">
          <strong>{session.status === "error" ? "会话异常中断" : "会话已断开"}</strong>
          <span>{statusMessage || "重新连接需要再次验证凭据"}</span>
        </div>
      )}
    </div>
  );
}
