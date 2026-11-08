import type { ModalProps } from "antd";

/** 三种导入和 Windows 向导共用原型的分隔式头尾；长内容只在正文滚动。 */
export const serverSetupStyles: ModalProps["styles"] = {
  mask: { background: "rgba(0,0,0,.75)", backdropFilter: "blur(3px)" },
  container: { padding: 0, borderRadius: 16, overflow: "hidden", border: "1px solid var(--border)", background: "var(--bg-secondary)", maxWidth: "calc(100vw - 32px)" },
  header: { margin: 0, padding: "16px 48px 16px 20px", background: "var(--bg-primary)", borderBottom: "1px solid var(--border)" },
  body: { padding: 20, maxHeight: "calc(88vh - 140px)", overflowY: "auto", fontSize: 13, lineHeight: 1.7 },
  footer: { margin: 0, padding: "14px 20px", borderTop: "1px solid var(--border)", background: "var(--bg-primary)" },
};
