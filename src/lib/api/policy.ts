import { invoke } from "@tauri-apps/api/core";
import type { PolicyRule } from "@/types";

export const policyApi = {
  listRules: (includeDisabled = true) =>
    invoke<PolicyRule[]>("list_policy_rules", { includeDisabled }),
  saveRule: (rule: PolicyRule) =>
    invoke<PolicyRule>("save_policy_rule", { rule }),
  setRuleEnabled: (id: string, enabled: boolean) =>
    invoke<boolean>("set_policy_rule_enabled", { id, enabled }),
  deleteRule: (id: string) => invoke<boolean>("delete_policy_rule", { id }),
};
