/** 返回交给本地处理的快捷键，避免复制和 PTY 中断同时发生。 */
export function terminalShortcut(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
  hasSelection: boolean,
): "copy" | "interrupt" | "paste" | null {
  if ((!event.ctrlKey && !event.metaKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === "v") return "paste";
  if (key !== "c") return null;
  if (hasSelection) return "copy";
  return event.ctrlKey && !event.shiftKey ? "interrupt" : "copy";
}

export function inspectTerminalPaste(text: string): "empty" | "unsafe" | "confirm" | "direct" {
  if (!text) return "empty";
  // 粘贴中的 ESC 等控制字符可能伪造 bracketed-paste 边界，不直接交给远程 shell。
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(text)) return "unsafe";
  return /[\r\n]/.test(text) ? "confirm" : "direct";
}

export interface TerminalLibraryItem {
  id: string;
  title: string;
  content: string;
  createdAt: number;
}

export type TerminalLibraryKind = "snippet" | "experience";
export const TERMINAL_LIBRARY_EVENT = "ops-terminal-library-changed";
export const TERMINAL_PASTE_EVENT = "ops-terminal-paste-request";
const LIBRARY_KEYS = { snippet: "ops_terminal_snippets", experience: "ops_copilot_experiences" };

export function parseTerminalLibrary(raw: string | null): TerminalLibraryItem[] {
  const parsed: unknown = JSON.parse(raw ?? "[]");
  if (!Array.isArray(parsed)) throw new Error("本机片段/经验数据格式异常，请先检查已有数据");
  return parsed.filter((item): item is TerminalLibraryItem => (
    !!item && typeof item === "object" && typeof item.id === "string"
    && typeof item.title === "string" && typeof item.content === "string"
    && typeof item.createdAt === "number"
  ));
}

export function readTerminalLibrary(kind: TerminalLibraryKind): TerminalLibraryItem[] {
  return parseTerminalLibrary(localStorage.getItem(LIBRARY_KEYS[kind]));
}

export function saveTerminalLibraryItem(kind: TerminalLibraryKind, title: string, content: string) {
  if (!title.trim() || !content.trim()) throw new Error("请填写标题和内容");
  if (title.trim().length > 80 || content.length > 12_000) throw new Error("标题最多 80 字，内容最多 12000 字");
  // 每次保存重新读取，避免多个分屏用旧快照覆盖彼此刚保存的内容。
  const items = readTerminalLibrary(kind);
  const item = { id: crypto.randomUUID(), title: title.trim(), content, createdAt: Date.now() };
  localStorage.setItem(LIBRARY_KEYS[kind], JSON.stringify([item, ...items]));
  window.dispatchEvent(new Event(TERMINAL_LIBRARY_EVENT));
  return item;
}

export function removeTerminalSnippet(id: string) {
  const items = readTerminalLibrary("snippet").filter((item) => item.id !== id);
  localStorage.setItem(LIBRARY_KEYS.snippet, JSON.stringify(items));
  window.dispatchEvent(new Event(TERMINAL_LIBRARY_EVENT));
}
