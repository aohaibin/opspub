import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/lib/terminal-interactions.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } });
const { terminalShortcut, inspectTerminalPaste, parseTerminalLibrary, saveTerminalLibraryItem, readTerminalLibrary, removeTerminalSnippet } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const ctrl = { key: "c", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false };

test("Ctrl+C 有选区只复制，无选区才中断，保留普通键与 Alt 组合", () => {
  assert.equal(terminalShortcut(ctrl, true), "copy");
  assert.equal(terminalShortcut(ctrl, false), "interrupt");
  assert.equal(terminalShortcut({ ...ctrl, key: "C" }, true), "copy");
  assert.equal(terminalShortcut({ ...ctrl, shiftKey: true }, false), "copy");
  assert.equal(terminalShortcut({ ...ctrl, ctrlKey: false, metaKey: true }, false), "copy");
  assert.equal(terminalShortcut({ ...ctrl, ctrlKey: false }, true), null);
  assert.equal(terminalShortcut({ ...ctrl, altKey: true }, false), null);
  assert.equal(terminalShortcut({ ...ctrl, key: "Backspace" }, false), null);
  assert.equal(terminalShortcut({ ...ctrl, key: "v" }, false), "paste");
});

test("多行粘贴需确认，拒绝能注入终端控制序列的粘贴", () => {
  assert.equal(inspectTerminalPaste(""), "empty");
  assert.equal(inspectTerminalPaste("docker ps -a"), "direct");
  assert.equal(inspectTerminalPaste("echo ok\t# 备注"), "direct");
  for (const text of ["echo one\necho two", "exit\r", "echo ok\r\n"]) assert.equal(inspectTerminalPaste(text), "confirm");
  for (const text of ["\x1b[201~rm file", "ls\x03", "abc\x00", "\x9b201~"]) assert.equal(inspectTerminalPaste(text), "unsafe");
});

test("保存命令片段与经验使用独立存储，刷新读取，不覆盖旧条目", () => {
  const memory = new Map();
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  globalThis.window = new EventTarget();
  const a = saveTerminalLibraryItem("snippet", "  容器查询  ", "docker ps");
  saveTerminalLibraryItem("snippet", "磁盘", "df -h");
  const experience = saveTerminalLibraryItem("experience", "报错经验", "错误与排查过程");
  assert.equal(readTerminalLibrary("snippet").length, 2);
  assert.equal(readTerminalLibrary("snippet")[1].title, "容器查询");
  assert.equal(JSON.parse(memory.get("ops_copilot_experiences"))[0].id, experience.id);
  removeTerminalSnippet(a.id);
  assert.deepEqual(readTerminalLibrary("snippet").map((item) => item.title), ["磁盘"]);
  assert.equal(readTerminalLibrary("experience").length, 1);
  assert.throws(() => saveTerminalLibraryItem("snippet", "", "ls"));
  assert.throws(() => saveTerminalLibraryItem("snippet", "标题", "x".repeat(12001)));
  memory.set("ops_terminal_snippets", "bad-json");
  assert.throws(() => saveTerminalLibraryItem("snippet", "新内容", "ls"));
  assert.equal(memory.get("ops_terminal_snippets"), "bad-json");
});

test("历史库的非法项不渲染，损坏的库不会被保存动作静默覆盖", () => {
  assert.deepEqual(parseTerminalLibrary(null), []);
  assert.deepEqual(parseTerminalLibrary('[null,1,{"id":2}]'), []);
  assert.throws(() => parseTerminalLibrary("{}"));
  assert.throws(() => parseTerminalLibrary("broken"));
});
