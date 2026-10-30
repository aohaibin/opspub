import { invoke } from "@/lib/api/client";
import type { WorkbenchCommandResult } from "@/lib/api/workbench";

export const inspectionApi = {
  runProbe: (serverId: number) =>
    invoke<WorkbenchCommandResult>("run_inspection_probe", { serverId }),
};
