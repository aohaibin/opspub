import assert from "node:assert/strict";
import { test } from "node:test";
import { parseProbeOutput } from "./probeOutput.ts";

// Captured from the fixed Rust probe with local system query fixtures.
const stdout = "HOST\tbeta.fixture.invalid\nUPTIME\tup 10 days\nMEM\t25%DISK\t64%\nPORTS\t127.0.0.1:3306 SSHROOT\tno\nSSHPASS\tno\nDOCKER137\t0\n";
const success = { exitCode: 0, stdout, stderr: "" };

test("reads adjacent markers in the original probe response", () => {
  assert.deepEqual(parseProbeOutput(success), {
    disk: 64, memory: 25, ports: "127.0.0.1:3306",
    sshRoot: false, sshPassword: false, dockerOom: 0,
  });
});

test("reads newline-separated fields and CRLF", () => {
  const separated = stdout.replace("%DISK", "%\nDISK").replace(" SSHROOT", "\nSSHROOT");
  assert.deepEqual(parseProbeOutput({ ...success, stdout: separated.replaceAll("\n", "\r\n") }), parseProbeOutput(success));
});

test("empty optional fields stop at the next marker", () => {
  const adjacent = "HOST\thost\nUPTIME\tMEM\t0%DISK\t0%\nPORTS\tSSHROOT\tSSHPASS\tyes\nDOCKER137\t2\n";
  assert.deepEqual(parseProbeOutput({ ...success, stdout: adjacent }), {
    disk: 0, memory: 0, ports: "",
    sshRoot: false, sshPassword: true, dockerOom: 2,
  });
});

test("rejects missing or invalid required values", () => {
  assert.throws(() => parseProbeOutput({ ...success, stdout: stdout.replace("MEM\t25%", "MEM\t") }), /内存使用率/);
  assert.throws(() => parseProbeOutput({ ...success, stdout: stdout.replace("DISK\t64%", "DISK\tunavailable") }), /根分区使用率/);
});

test("a nonzero exit takes precedence over usable metrics", () => {
  assert.throws(() => parseProbeOutput({ ...success, exitCode: 7, stderr: "ALPHA_EXIT_ONLY" }), /探针退出码为 7：ALPHA_EXIT_ONLY/);
});
