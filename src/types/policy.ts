export type ActionRiskLevel = "extreme" | "high" | "medium" | "low_readonly" | "unknown";
export type PolicyRuleAction = "block" | "review";

export interface PolicyRule {
  id: string;
  label: string;
  pattern: string;
  riskLevel: ActionRiskLevel;
  action: PolicyRuleAction;
  enabled: boolean;
  builtin: boolean;
  ruleVersion: string;
  createdAt: number;
  updatedAt: number;
}
