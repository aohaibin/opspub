import { useEffect, useState } from "react";
import { Popconfirm, message } from "antd";
import { Code2, Trash2 } from "lucide-react";
import { getErrorMessage } from "@/lib/api/client";
import { readTerminalLibrary, removeTerminalSnippet, TERMINAL_LIBRARY_EVENT, type TerminalLibraryItem } from "@/lib/terminal-interactions";

const BUILTIN_SNIPPETS = [
  "journalctl -xeu nginx.service --no-pager | tail -n 80",
  "find /var/log -type f -size +100M -printf '%s %p\\n' | sort -nr | head",
  "docker stats --no-stream",
];

export function TerminalSnippets({ onInsert }: { onInsert: (content: string) => void }) {
  const [items, setItems] = useState<TerminalLibraryItem[]>([]);
  useEffect(() => {
    const refresh = () => {
      try { setItems(readTerminalLibrary("snippet")); }
      catch (error) { message.error(getErrorMessage(error)); }
    };
    refresh();
    window.addEventListener(TERMINAL_LIBRARY_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(TERMINAL_LIBRARY_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return (
    <div className="ops-terminal-saved-snippets space-y-2">
      <p>点击片段填入当前终端，由你确认后执行。</p>
      {items.map((item) => (
        <div key={item.id} className="ops-terminal-saved-snippet">
          <button type="button" title={item.content} onClick={() => onInsert(item.content)}>
            <strong>{item.title}</strong><code>{item.content}</code>
          </button>
          <Popconfirm title="删除这个命令片段？" okText="删除" cancelText="取消" onConfirm={() => {
            try { removeTerminalSnippet(item.id); }
            catch (error) { message.error(getErrorMessage(error)); }
          }}>
            <button type="button" title="删除片段"><Trash2 size={14} /></button>
          </Popconfirm>
        </div>
      ))}
      {BUILTIN_SNIPPETS.map((item) => (
        <button key={item} type="button" className="ops-terminal-command-item" onClick={() => onInsert(item)}>
          <span>{item}</span><Code2 size={13} />
        </button>
      ))}
    </div>
  );
}
