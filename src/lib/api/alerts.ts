import { configApi } from "./config";
import { invoke } from "./client";

const RULES_KEY = "alerts.rules";
const EVENTS_KEY = "alerts.events";
const CHANNELS_KEY = "alerts.channels";

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertMetric = "disk" | "memory" | "public-listen" | "docker-oom";
export type AlertOperator = ">" | ">=" | "<" | "<=";
export type AlertEventStatus = "active" | "silenced" | "resolved";
export type AlertChannelKind = "local" | "webhook";

export interface AlertChannel {
  id: string;
  name: string;
  kind: AlertChannelKind;
  enabled: boolean;
}

export interface AlertRule {
  id: string;
  name: string;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  severity: AlertSeverity;
  target: "all" | "favorites";
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  serverId: number;
  serverAlias: string;
  hostname: string;
  severity: AlertSeverity;
  metric: AlertMetric;
  value: string;
  threshold: string;
  summary: string;
  recommendation: string;
  status: AlertEventStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  silencedUntil?: string;
  resolvedAt?: string;
}

export const DEFAULT_ALERT_RULES: AlertRule[] = [
  { id: "disk-root", name: "根分区磁盘水位", metric: "disk", operator: ">=", threshold: 85, severity: "critical", target: "all", enabled: true, createdAt: "", updatedAt: "" },
  { id: "memory-used", name: "内存使用率", metric: "memory", operator: ">=", threshold: 90, severity: "warning", target: "all", enabled: true, createdAt: "", updatedAt: "" },
  { id: "public-database", name: "数据库端口公网监听", metric: "public-listen", operator: ">", threshold: 0, severity: "critical", target: "all", enabled: true, createdAt: "", updatedAt: "" },
  { id: "docker-oom", name: "容器 OOM 退出", metric: "docker-oom", operator: ">", threshold: 0, severity: "warning", target: "all", enabled: true, createdAt: "", updatedAt: "" },
];

export const DEFAULT_ALERT_CHANNELS: AlertChannel[] = [
  { id: "local", name: "应用内通知", kind: "local", enabled: true },
  { id: "webhook", name: "通用 HTTP Webhook", kind: "webhook", enabled: false },
];

function parseArray<T>(value: string | null, fallback: T[]): T[] {
  if (!value) return fallback;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : fallback;
  } catch {
    return fallback;
  }
}

export const alertsApi = {
  async getRules() {
    return parseArray(await configApi.get(RULES_KEY).catch(() => null), DEFAULT_ALERT_RULES);
  },
  saveRules(rules: AlertRule[]) {
    return configApi.set(RULES_KEY, JSON.stringify(rules));
  },
  async getEvents() {
    return parseArray<AlertEvent>(await configApi.get(EVENTS_KEY).catch(() => null), []);
  },
  saveEvents(events: AlertEvent[]) {
    return configApi.set(EVENTS_KEY, JSON.stringify(events.slice(0, 300)));
  },
  async getChannels() {
    return parseArray(await configApi.get(CHANNELS_KEY).catch(() => null), DEFAULT_ALERT_CHANNELS);
  },
  saveChannels(channels: AlertChannel[]) {
    return configApi.set(CHANNELS_KEY, JSON.stringify(channels));
  },
  sendTestWebhook(title: string, body: string) {
    return invoke<void>("send_alert_webhook", { title, body });
  },
  saveWebhookUrl: (url: string) => invoke<void>("save_alert_webhook_url", { url }),
  getWebhookStatus: () => invoke<boolean>("get_alert_webhook_status"),
  deleteWebhookUrl: () => invoke<void>("delete_alert_webhook_url"),
};
