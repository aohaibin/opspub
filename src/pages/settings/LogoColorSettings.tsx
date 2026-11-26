import { useState } from "react";
import { Alert, Button, Modal } from "antd";
import { Check, Palette, Sparkles } from "lucide-react";
import { configApi, getErrorMessage } from "@/lib/api";
import { LOGO_COLORS, logoUrl, type LogoColor } from "@/lib/logo";
import { useSettingsStore } from "@/store/settings";

const ENGLISH_LABELS: Record<LogoColor, string> = {
  mint: "Mint",
  "tech-blue": "Tech Blue",
  "china-red": "China Red",
  violet: "Violet",
  "warm-orange": "Warm Orange",
  graphite: "Graphite",
};

export function LogoColorSettings({ disabled }: { disabled: boolean }) {
  const color = useSettingsStore((state) => state.logoColor);
  const setColor = useSettingsStore((state) => state.setLogoColor);
  const english = useSettingsStore((state) => state.language) === "en-US";
  const [draft, setDraft] = useState<LogoColor | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const copy = (zh: string, en: string) => english ? en : zh;
  const name = (id: LogoColor) => english ? ENGLISH_LABELS[id] : LOGO_COLORS.find((option) => option.id === id)?.label;
  const preview = draft ?? color;
  const title = copy("Logo 颜色", "Logo color");

  async function save() {
    if (draft === null || saving) return;
    setSaving(true);
    setError("");
    try {
      const result = await configApi.saveLogoColor(draft);
      setColor(draft);
      const notes = [...result.warnings];
      if (result.desktopShortcut === "missing") {
        notes.push(copy("未找到指向当前安装的桌面快捷方式。", "No desktop shortcut points to this installation."));
      } else if (result.desktopShortcut === "unsupported") {
        notes.push(copy("桌面快捷方式同步适用于 Windows 安装版。", "Desktop shortcut sync is available in the installed Windows app."));
      }
      setNotice(notes.join("\n"));
      setDraft(null);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="ops-logo-setting">
        <img src={logoUrl.app(color)} width={32} height={32} alt="" />
        <div className="ops-logo-setting-copy">
          <strong>{title}</strong>
        </div>
        <div className="ops-logo-setting-actions">
          <span>{name(color)}</span>
          <Button icon={<Palette size={14} />} disabled={disabled || saving} aria-haspopup="dialog" onClick={() => {
            setError("");
            setDraft(color);
          }}>{copy("选择", "Choose")}</Button>
        </div>
      </div>
      {notice && <Alert className="mt-3 whitespace-pre-line" type="warning" showIcon title={notice} closable onClose={() => setNotice("")} />}
      <Modal
        open={draft !== null}
        title={title}
        width={540}
        centered
        maskClosable={false}
        closable={!saving}
        keyboard={!saving}
        confirmLoading={saving}
        cancelButtonProps={{ disabled: saving }}
        okText={copy("确定", "Apply")}
        cancelText={copy("取消", "Cancel")}
        onCancel={() => { if (!saving) setDraft(null); }}
        onOk={() => void save()}
        styles={{ body: { maxHeight: "calc(100dvh - 160px)", overflowY: "auto" } }}
      >
        <div className="ops-logo-options" role="group" aria-label={title}>
          {LOGO_COLORS.map(({ id }) => (
            <button key={id} type="button" className="ops-settings-preview ops-logo-option" aria-pressed={preview === id} disabled={saving} onClick={() => setDraft(id)}>
              {preview === id && <Check className="ops-logo-check" size={15} aria-hidden />}
              <img src={logoUrl.app(id)} width={44} height={44} alt="" />
              <span>{name(id)}</span>
            </button>
          ))}
        </div>
        <div className="ops-logo-preview">
          <div className="ops-logo-preview-heading">
            <span><Sparkles size={14} aria-hidden />{copy("应用与桌面同步预览", "App and desktop preview")}</span>
            <span>{name(preview)}</span>
          </div>
          <div className="ops-logo-preview-grid">
            <div>
              <span className="ops-logo-preview-themes">
                <img className="ops-logo-preview-dark" src={logoUrl.inApp(preview, "dark")} width={32} height={32} alt={copy("暗色", "Dark")} />
                <img className="ops-logo-preview-light" src={logoUrl.inApp(preview, "light")} width={32} height={32} alt={copy("亮色", "Light")} />
              </span>
              <span>{copy("顶栏深/浅自适应", "Dark / light title bar")}</span>
            </div>
            <div>
              <img src={logoUrl.app(preview)} width={32} height={32} alt="" />
              <span>{copy("应用图标", "App icon")}</span>
            </div>
            <div>
              <span className="ops-logo-preview-shortcut">
                <img src={logoUrl.desktop(preview)} width={32} height={32} alt="" />
                <span aria-hidden>↗</span>
              </span>
              <span>{copy("桌面快捷方式", "Desktop shortcut")}</span>
            </div>
          </div>
        </div>
        {error && <Alert className="mt-3" type="error" showIcon title={error} />}
      </Modal>
    </>
  );
}
