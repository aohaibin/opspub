import type { WorkbenchCommandResult } from "@/lib/api/workbench";

function percentage(value: string | undefined) {
  const match = value?.match(/^(\d+)%?$/);
  return match ? Number(match[1]) : undefined;
}

export function parseProbeOutput({ exitCode, stdout, stderr }: WorkbenchCommandResult) {
  if (exitCode !== 0) {
    throw new Error("探针退出码为 " + exitCode + (stderr ? "：" + stderr.trim() : ""));
  }

  // 固定探针的部分命令不输出换行，后续字段标记可能紧接着前一个值。
  const markers = [...stdout.matchAll(/(HOST|UPTIME|MEM|DISK|PORTS|SSHROOT|SSHPASS|DOCKER137)\t/g)];
  const fields = new Map(markers.map((marker, index) => {
    const value = stdout.slice(marker.index + marker[0].length, markers[index + 1]?.index);
    return [marker[1], value.split(/\r?\n/, 1)[0].trim()];
  }));

  const disk = percentage(fields.get("DISK"));
  if (disk === undefined) throw new Error("未采集到有效的根分区使用率");
  const memory = percentage(fields.get("MEM"));
  if (memory === undefined) throw new Error("未采集到有效的内存使用率");

  const dockerCount = fields.get("DOCKER137") ?? "";
  return {
    disk,
    memory,
    ports: fields.get("PORTS") ?? "",
    sshRoot: fields.get("SSHROOT")?.toLowerCase() === "yes",
    sshPassword: fields.get("SSHPASS")?.toLowerCase() === "yes",
    dockerOom: /^\d+$/.test(dockerCount) ? Number(dockerCount) : 0,
  };
}
