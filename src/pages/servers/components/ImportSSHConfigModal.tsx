import { ImportServersModal } from "./ImportServersModal";

/** 保留旧入口兼容性；重复检测和批量保存统一由 Rust 导入服务完成。 */
export function ImportSSHConfigModal(props: { open: boolean; existingAliases: string[]; onCancel: () => void; onImported: () => void }) {
  return <ImportServersModal source="ssh_config" open={props.open} onCancel={props.onCancel} onImported={props.onImported} />;
}
