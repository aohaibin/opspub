import { createContext, useContext } from "react";
import type { Server } from "@/types";
import type { WorkbenchCommandResult } from "@/lib/api/workbench";

export interface WorkbenchRuntime {
  server: Server | null;
  connected: boolean;
  openConnection: () => void;
  runCommand: (command: string) => Promise<WorkbenchCommandResult>;
}

export const WorkbenchRuntimeContext = createContext<WorkbenchRuntime | null>(null);

export function useWorkbenchRuntime(): WorkbenchRuntime {
  const runtime = useContext(WorkbenchRuntimeContext);
  if (!runtime) {
    throw new Error("工作台运行时未初始化");
  }
  return runtime;
}
