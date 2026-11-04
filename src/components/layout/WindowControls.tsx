import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { getCurrentWindow, type Window } from "@tauri-apps/api/window";
import { Checkbox, Modal, Radio, theme as antdTheme } from "antd";
import { exit } from "@tauri-apps/plugin-process";
import { Check, Copy, Minus, Minimize2, Power, Square, X } from "lucide-react";
import { configApi } from "@/lib/api";
import { terminalApi } from "@/lib/api/terminal";
import { sftpApi } from "@/lib/api/sftp";
import { useSettingsStore } from "@/store";
import { SETTINGS_KEYS } from "@/store/settings";
import "./window-controls.css";

type CloseBehavior = "ask" | "minimize" | "exit";
type CloseChoice = Exclude<CloseBehavior, "ask">;
const CONFIG_KEY_CLOSE_BEHAVIOR = SETTINGS_KEYS.closeBehavior;

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
    // 彻底退出前通知 Rust 端关闭所有后台 PTY；切换菜单/最小化不会走这里。
    try {
      await terminalApi.closeAll();
      await sftpApi.closeAll();
    } finally {
      await exit(0);
    }
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

      <Modal
        open={closeModalOpen}
        centered
        width={560}
        className="ops-close-modal"
        classNames={{
          container: "ops-close-modal__container",
          header: "ops-close-modal__header",
          body: "ops-close-modal__body",
          footer: "ops-close-modal__footer",
        }}
        mask={{ closable: false }}
        onCancel={() => setCloseModalOpen(false)}
        onOk={confirmClose}
        okText="确定"
        cancelText="取消"
        okButtonProps={{ icon: <Check size={16} />, className: "ops-close-modal__button" }}
        cancelButtonProps={{ className: "ops-close-modal__button" }}
        title={
          <div className="ops-close-modal__heading">
            <img className="ops-close-modal__logo" src="/logo.png" alt="" />
            <div>
              <span className="ops-close-modal__title">关闭客户端确认</span>
              <span className="ops-close-modal__subtitle">请选择您希望执行的关闭操作</span>
            </div>
          </div>
        }
        footer={(_, { OkBtn, CancelBtn }) => (
          <div className="ops-close-modal__actions">
            <span className="ops-close-modal__escape">按 Esc 键可直接取消</span>
            <div className="ops-close-modal__buttons"><CancelBtn /><OkBtn /></div>
          </div>
        )}
      >
        <Radio.Group
          className="ops-close-modal__options"
          aria-label="关闭操作"
          value={closeChoice}
          onChange={(event) => setCloseChoice(event.target.value)}
        >
          <Radio value="minimize" className="ops-close-option ops-close-option--minimize">
            <span className="ops-close-option__heading">
              <span className="ops-close-option__title"><Minimize2 size={17} />最小化到系统托盘</span>
              <span className="ops-close-option__badge ops-close-option__badge--recommended">推荐 · 后台运行</span>
            </span>
            <span className="ops-close-option__description">
              程序将在后台继续运行，保持服务器监控和 MCP 服务；双击托盘图标可重新打开窗口。
            </span>
          </Radio>
          <Radio value="exit" className="ops-close-option ops-close-option--exit">
            <span className="ops-close-option__heading">
              <span className="ops-close-option__title"><Power size={17} />彻底退出应用</span>
              <span className="ops-close-option__badge">安全注销</span>
            </span>
            <span className="ops-close-option__description">
              退出 OpsPub 并断开当前连接，释放本地 MCP 服务和系统资源。
            </span>
          </Radio>
        </Radio.Group>
        <div className="ops-close-modal__remember">
          <Checkbox checked={rememberCloseChoice} onChange={(event) => setRememberCloseChoice(event.target.checked)}>
            记住我的选择，以后不再提示
          </Checkbox>
          <span>可在【系统设置】随时修改</span>
        </div>
      </Modal>
    </>
  );
}
