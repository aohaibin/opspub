import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { getCurrentWindow, type Window } from "@tauri-apps/api/window";
import { Checkbox, Modal, Radio, theme as antdTheme } from "antd";
import { exit } from "@tauri-apps/plugin-process";
import { Check, Copy, Minus, Minimize2, Power, Shield, Square, X } from "lucide-react";
import { configApi } from "@/lib/api";
import { useSettingsStore } from "@/store";

type CloseBehavior = "ask" | "minimize" | "exit";
type CloseChoice = Exclude<CloseBehavior, "ask">;
const CONFIG_KEY_CLOSE_BEHAVIOR = "ui.close_behavior";

function getAppWindow(): Window | null {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

export function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closeChoice, setCloseChoice] = useState<CloseChoice>("minimize");
  const [rememberCloseChoice, setRememberCloseChoice] = useState(false);
  const { token } = antdTheme.useToken();
  const windowRef = useRef<Window | null>(getAppWindow());
  const closeBehavior = useSettingsStore((s) => s.closeBehavior);
  const setCloseBehavior = useSettingsStore((s) => s.setCloseBehavior);
  const closeBehaviorRef = useRef<CloseBehavior>(closeBehavior);
  closeBehaviorRef.current = closeBehavior;

  const executeClose = useCallback(async (choice: CloseChoice) => {
    setCloseModalOpen(false);
    if (choice === "minimize") {
      await windowRef.current?.hide();
      return;
    }
    await exit(0);
  }, []);

  const requestClose = useCallback(() => {
    const behavior = closeBehaviorRef.current;
    if (behavior === "ask") {
      setCloseChoice("minimize");
      setRememberCloseChoice(false);
      setCloseModalOpen(true);
      return;
    }
    void executeClose(behavior);
  }, [executeClose]);

  useEffect(() => {
    const win = windowRef.current;
    if (!win) return;

    void win.isMaximized().then(setIsMaximized);
    const unlistenResize = win.onResized(async () => {
      setIsMaximized(await win.isMaximized());
    });
    const unlistenClose = win.onCloseRequested((event) => {
      event.preventDefault();
      requestClose();
    });

    void configApi.getAll().then((configs) => {
      const saved = configs.find((config) => config.key === CONFIG_KEY_CLOSE_BEHAVIOR)?.value;
      if (saved === "ask" || saved === "minimize" || saved === "exit") {
        setCloseBehavior(saved);
      }
    }).catch(() => undefined);

    return () => {
      unlistenResize.then((fn) => fn());
      unlistenClose.then((fn) => fn());
    };
  }, [requestClose, setCloseBehavior]);

  const confirmClose = useCallback(() => {
    if (rememberCloseChoice) {
      setCloseBehavior(closeChoice);
      void configApi.set(CONFIG_KEY_CLOSE_BEHAVIOR, closeChoice).catch(() => undefined);
    }
    void executeClose(closeChoice);
  }, [closeChoice, executeClose, rememberCloseChoice, setCloseBehavior]);

  const getButtonStyle = (id: string): CSSProperties => {
    if (hovered === id && id === "close") return { backgroundColor: "#e81123", color: "#fff" };
    if (hovered === id) return { backgroundColor: token.colorFillSecondary };
    return {};
  };

  const baseStyle: CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 32, height: 26, border: "none", borderRadius: 5, background: "transparent",
    color: token.colorTextSecondary, cursor: "pointer", transition: "all 0.15s ease",
    outline: "none", padding: 0,
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 1, height: 32 }}>
        <button style={{ ...baseStyle, ...getButtonStyle("min") }} onMouseEnter={() => setHovered("min")} onMouseLeave={() => setHovered(null)} onClick={() => void windowRef.current?.minimize()} title="最小化"><Minus size={15} strokeWidth={1.5} /></button>
        <button style={{ ...baseStyle, ...getButtonStyle("max") }} onMouseEnter={() => setHovered("max")} onMouseLeave={() => setHovered(null)} onClick={() => void windowRef.current?.toggleMaximize()} title={isMaximized ? "还原" : "最大化"}>{isMaximized ? <Copy size={12} strokeWidth={1.5} /> : <Square size={12} strokeWidth={1.5} />}</button>
        <button style={{ ...baseStyle, ...getButtonStyle("close") }} onMouseEnter={() => setHovered("close")} onMouseLeave={() => setHovered(null)} onClick={requestClose} title="关闭客户端"><X size={15} strokeWidth={1.5} /></button>
      </div>

      <Modal open={closeModalOpen} centered width={460} maskClosable={false} onCancel={() => setCloseModalOpen(false)} onOk={confirmClose} okText="确定" cancelText="取消" okButtonProps={{ icon: <Check size={14} /> }} title={<div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, background: "var(--nav-active-bg)", color: "var(--nav-active-icon)" }}><Shield size={17} /></span><span><span style={{ display: "block", fontSize: 14 }}>关闭客户端确认</span><span style={{ display: "block", marginTop: 2, fontSize: 11, fontWeight: 400, color: "var(--text-secondary)" }}>请选择您希望执行的关闭操作</span></span></div>} styles={{ header: { margin: 0, padding: "16px 18px", borderBottom: "1px solid var(--border)" }, body: { padding: "16px 18px" }, footer: { margin: 0, padding: "12px 18px", borderTop: "1px solid var(--border)" } }}>
        <Radio.Group value={closeChoice} onChange={(event) => setCloseChoice(event.target.value)} style={{ display: "grid", gap: 10, width: "100%" }}>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 10, border: `1px solid ${closeChoice === "minimize" ? "var(--nav-active-border)" : "var(--border)"}`, background: closeChoice === "minimize" ? "var(--nav-active-bg)" : "var(--surface-950)", cursor: "pointer" }}><Radio value="minimize" /><span style={{ flex: 1 }}><span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--text-primary)" }}><Minimize2 size={14} style={{ color: "var(--nav-active-icon)" }} />最小化到系统托盘</span><span style={{ display: "block", marginTop: 5, fontSize: 11, lineHeight: 1.6, color: "var(--text-secondary)" }}>程序将在后台继续运行，保持服务器监控和 MCP 服务；双击托盘图标可重新打开窗口。</span></span></label>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 10, border: `1px solid ${closeChoice === "exit" ? "rgba(239,68,68,.45)" : "var(--border)"}`, background: closeChoice === "exit" ? "rgba(127,29,29,.16)" : "var(--surface-950)", cursor: "pointer" }}><Radio value="exit" /><span style={{ flex: 1 }}><span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--text-primary)" }}><Power size={14} style={{ color: "var(--danger)" }} />彻底退出应用</span><span style={{ display: "block", marginTop: 5, fontSize: 11, lineHeight: 1.6, color: "var(--text-secondary)" }}>退出程序并断开当前连接，释放本地 MCP 服务和系统资源。</span></span></label>
        </Radio.Group>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--text-secondary)" }}><Checkbox checked={rememberCloseChoice} onChange={(event) => setRememberCloseChoice(event.target.checked)}>记住我的选择，以后不再提示</Checkbox><span style={{ color: "var(--text-muted)" }}>可在系统设置修改</span></div>
      </Modal>
    </>
  );
}
