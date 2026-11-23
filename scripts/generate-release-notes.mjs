import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { formatReleaseNotes, parseReleaseNotes, summarizeCommits } from "../src/lib/release-notes.mjs";

const VERSION_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;

function compareTags(a, b) {
  const left = a.slice(1).split(".").map(Number);
  const right = b.slice(1).split(".").map(Number);
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

export function collectReleaseChanges(repository, tag) {
  if (!VERSION_TAG.test(tag)) throw new Error("版本标签必须使用 vX.Y.Z 格式。");
  const git = (...args) => execFileSync("git", ["-C", repository, ...args], {
    encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, LC_ALL: "C.UTF-8" },
  }).trim();
  // 浅克隆无法证明已覆盖整个版本区间，必须失败，避免悄悄漏掉旧提交。
  if (git("rev-parse", "--is-shallow-repository") === "true") {
    throw new Error("无法从浅克隆生成完整更新说明，请先获取完整历史和版本标签。");
  }
  git("rev-parse", "--verify", `${tag}^{commit}`);
  const tags = git("tag", "--merged", tag).split(/\r?\n/).filter((value) => VERSION_TAG.test(value));
  const previousTag = tags.filter((value) => compareTags(value, tag) < 0).sort(compareTags).at(-1) ?? null;
  const range = previousTag ? `${previousTag}..${tag}` : tag;
  const subjects = git("log", "--no-merges", "--reverse", "--format=%s", range, "--").split(/\r?\n/).filter(Boolean);
  return { tag, previousTag, range, subjects };
}

export function generateReleaseSummary(repository, tag, notesFile) {
  const changes = collectReleaseChanges(repository, tag);
  const items = notesFile
    ? parseReleaseNotes(readFileSync(resolve(notesFile), "utf8"))
    : summarizeCommits(changes.subjects);
  return {
    version: tag.slice(1), tag, previousTag: changes.previousTag, range: changes.range,
    commitCount: changes.subjects.length, items, notes: formatReleaseNotes(items),
  };
}

function main() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!["--tag", "--repository", "--notes-file", "--github-output"].includes(args[i]) || !args[i + 1]) {
      throw new Error(`无效参数：${args[i] ?? ""}`);
    }
    options[args[i]] = args[i + 1];
  }
  if (!options["--tag"]) throw new Error("请传入 --tag vX.Y.Z。");
  const repository = options["--repository"] ?? fileURLToPath(new URL("../", import.meta.url));
  const summary = generateReleaseSummary(repository, options["--tag"], options["--notes-file"]);
  if (options["--github-output"]) {
    const delimiter = `opspub_notes_${randomUUID()}`;
    appendFileSync(options["--github-output"], `notes<<${delimiter}\n${summary.notes}\n${delimiter}\n`, "utf8");
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { main(); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
