import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import { collectReleaseChanges, generateReleaseSummary } from "./generate-release-notes.mjs";
import { formatReleaseDate, formatReleaseNotes, parseReleaseNotes, summarizeCommits } from "../src/lib/release-notes.mjs";

test("跨提交合并同一模块，按新增、优化、修复输出用户摘要，过滤内部记录", () => {
  const notes = summarizeCommits([
    "feat(copilot): expand agent timeline to twenty rounds",
    "feat(copilot): add approval timeout and execution timeline",
    "feat(copilot): add approval timeout and execution timeline",
    "fix(server): 修复新增服务器测试连接报错",
    "style(theme): 优化亮色主题下策略标签配色",
    "docs: 更新开发文档", "release: OpsPub v1.0.0", "ci: configure runner",
  ]);
  assert.equal(notes.length, 3);
  assert.match(notes[0], /^新增 AI 助手功能/u);
  for (const detail of ["最多 20 轮", "审批超时处理", "执行过程展示"]) assert.ok(notes[0].includes(detail));
  assert.equal(notes[0].split("审批超时处理").length, 2);
  assert.match(notes[1], /^优化/u);
  assert.match(notes[2], /^修复服务器管理/u);
  assert.doesNotMatch(notes.join(""), /feat\(|fix\(|docs:|release:|ci:/);
  assert.match(formatReleaseNotes(notes), /^1、.+\n2、.+\n3、/u);
});

test("更新弹窗兼容旧版原始提交记录，保留新编号说明及补充信息", () => {
  assert.deepEqual(parseReleaseNotes("1、新增文件树视图。\n2. 优化下载进度展示。"), ["新增文件树视图。", "优化下载进度展示。"]);
  const legacy = parseReleaseNotes("- feat(skills): bundle forty-one built-in operations skills\n- docs: 更新文档\n- 请在更新前保存工作。");
  assert.match(legacy[0], /41 项内置运维技能/u);
  assert.ok(legacy.includes("请在更新前保存工作。"));
  assert.equal(parseReleaseNotes(null).length, 1);
  assert.equal(parseReleaseNotes("# 本次更新\n").length, 1);
  assert.doesNotMatch(formatReleaseNotes(legacy), /feat\(|docs:/);
});

test("发布时间使用有效发布元数据，缺失或非法日期不会显示 Invalid Date", () => {
  assert.equal(formatReleaseDate(undefined), "待公布");
  assert.equal(formatReleaseDate("not-a-date"), "待公布");
  assert.match(formatReleaseDate("2026-11-18T03:15:00Z"), /2026/);
  assert.match(formatReleaseDate("2026-11-18T03:15:00Z"), /\d{2}:\d{2}/);
});

test("读取完整版本区间，排除移动端及其他分支标签，不截断成最近 12 条", () => {
  const root = mkdtempSync(join(tmpdir(), "opspub-release-notes-"));
  const repository = join(root, "source");
  const git = (...args) => execFileSync("git", ["-C", repository, ...args], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    execFileSync("git", ["init", repository], { windowsHide: true, stdio: "ignore" });
    git("config", "user.name", "Release tests");
    git("config", "user.email", "release-tests@example.invalid");
    const commit = (subject) => git("-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", subject);
    commit("feat: 初次发布"); git("tag", "v0.1.0");
    commit("feat(server): 添加旧版本分组"); git("tag", "v0.2.0");
    const stable = git("branch", "--show-current");
    git("switch", "-c", "unreleased-branch");
    commit("feat: 其他分支功能"); git("tag", "v0.9.0");
    git("switch", stable);
    for (let index = 0; index < 16; index++) commit(`fix(server): 修复连接问题 ${index + 1}`);
    git("tag", "mobile-v9.0.0");
    git("tag", "v0.8.0-beta.1");
    git("tag", "v0.10.0");
    const summary = generateReleaseSummary(repository, "v0.10.0");
    assert.equal(summary.previousTag, "v0.2.0");
    assert.equal(summary.range, "v0.2.0..v0.10.0");
    assert.equal(summary.commitCount, 16);
    assert.ok(summary.notes.includes("连接问题 1"));
    assert.ok(summary.notes.includes("连接问题 16"));
    assert.doesNotMatch(summary.notes, /旧版本|其他分支|feat\(|fix\(/);
    assert.equal(collectReleaseChanges(repository, "v0.1.0").previousTag, null);
    commit("fix: 修复新版本问题"); git("tag", "v0.11.0");
    assert.equal(collectReleaseChanges(repository, "v0.11.0").previousTag, "v0.10.0");
    assert.throws(() => collectReleaseChanges(repository, "HEAD"), /版本标签/);
    assert.throws(() => collectReleaseChanges(repository, "v9.0.0"));

    const notesFile = join(root, "summary.txt");
    writeFileSync(notesFile, "1、新增服务器批量管理。\n2、优化查询体验。", "utf8");
    assert.equal(generateReleaseSummary(repository, "v0.10.0", notesFile).items.length, 2);

    const outputFile = join(root, "github-output.txt");
    const result = execFileSync(process.execPath, [fileURLToPath(new URL("./generate-release-notes.mjs", import.meta.url)), "--repository", repository, "--tag", "v0.10.0", "--github-output", outputFile], { encoding: "utf8", windowsHide: true });
    assert.equal(JSON.parse(result).commitCount, 16);
    assert.match(readFileSync(outputFile, "utf8"), /notes<<opspub_notes_/);

    const shallow = join(root, "shallow");
    execFileSync("git", ["clone", "--depth", "1", pathToFileURL(repository).href, shallow], { windowsHide: true, stdio: "ignore" });
    assert.throws(() => collectReleaseChanges(shallow, "v0.11.0"), /浅克隆/);
  } finally {
    // 只清理本用例创建的独立临时仓库，不触碰当前项目或其他会话。
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    rmSync(root, { recursive: true, force: true });
  }
});
