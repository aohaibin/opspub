import { create } from "zustand";
import { alertsApi, type AlertEvent } from "@/lib/api/alerts";
import { getErrorCode, getErrorMessage } from "@/lib/api/client";
import { configApi } from "@/lib/api/config";

const READ_KEY = "ops_alert_read_ids";

function loadReadIds(): ReadonlySet<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(READ_KEY) ?? "[]");
    if (Array.isArray(value)) return new Set(value.filter((id): id is string => typeof id === "string"));
  } catch {
    // A missing or unreadable preference leaves the saved events available.
  }
  return new Set();
}

const eventTextFields = [
  "ruleId", "ruleName", "serverAlias", "hostname", "value", "threshold",
  "summary", "recommendation", "firstSeenAt", "lastSeenAt",
] as const satisfies readonly (keyof AlertEvent)[];

function isAlertEvent(value: unknown): value is AlertEvent {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && row.id.trim().length > 0
    && typeof row.serverId === "number" && Number.isSafeInteger(row.serverId) && row.serverId > 0
    && eventTextFields.every((field) => typeof row[field] === "string")
    && (row.severity === "critical" || row.severity === "warning" || row.severity === "info")
    && (row.metric === "disk" || row.metric === "memory" || row.metric === "public-listen" || row.metric === "docker-oom")
    && (row.status === "active" || row.status === "silenced" || row.status === "resolved")
    && (row.silencedUntil === undefined || typeof row.silencedUntil === "string")
    && (row.resolvedAt === undefined || typeof row.resolvedAt === "string");
}

async function loadEvents(): Promise<Pick<AlertsState, "events" | "error">> {
  // The legacy getEvents helper falls back to an empty list for every error.
  // Only a missing config key is an empty history when refreshing this workspace.
  const raw = await configApi.get("alerts.events").catch((error: unknown) => {
    if (getErrorCode(error) === "NOT_FOUND") return "[]";
    throw error;
  });
  const records: unknown = JSON.parse(raw);
  if (!Array.isArray(records)) throw new Error("告警历史格式无效");

  const ids = new Set<string>();
  const events = records.filter((record: unknown): record is AlertEvent => {
    if (!isAlertEvent(record) || ids.has(record.id)) return false;
    ids.add(record.id);
    return true;
  });
  const invalid = records.length - events.length;
  // Saving replaces the full history, so a partially readable snapshot stays read-only.
  return { events, error: invalid ? `告警历史包含 ${invalid} 条无效记录，请重试读取` : null };
}

interface AlertsState {
  events: AlertEvent[];
  readIds: ReadonlySet<string>;
  loaded: boolean;
  refreshing: boolean;
  saving: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  save: (next: AlertEvent[], newNotifications?: AlertEvent[]) => Promise<void>;
  markRead: (ids: string[], read: boolean) => void;
}

export const useAlertsStore = create<AlertsState>((set, get) => {
  let pendingRefresh: Promise<void> | undefined;
  function saveReadIds(readIds: Set<string>) {
    localStorage.setItem(READ_KEY, JSON.stringify([...readIds]));
    set({ readIds });
  }

  return {
    events: [],
    readIds: loadReadIds(),
    loaded: false,
    refreshing: false,
    saving: false,
    error: null,
    refresh: () => {
      if (get().saving) return Promise.resolve();
      if (pendingRefresh) return pendingRefresh;
      set({ refreshing: true });
      pendingRefresh = loadEvents()
        .then((snapshot) => set({ ...snapshot, loaded: true }))
        .catch((error: unknown) => set({ error: getErrorMessage(error) }))
        .finally(() => {
          pendingRefresh = undefined;
          set({ refreshing: false });
        });
      return pendingRefresh;
    },
    save: async (next, newNotifications = []) => {
      const { loaded, error, refreshing, saving } = get();
      if (!loaded || error || refreshing || saving) throw new Error("告警列表暂不可写，请刷新后重试");
      set({ saving: true });
      try {
        const events = next.slice(0, 300);
        await alertsApi.saveEvents(events);
        const newIds = new Set(newNotifications.map((event) => event.id));
        const readIds = new Set(events.filter((event) => get().readIds.has(event.id) && !newIds.has(event.id)).map((event) => event.id));
        set({ events, readIds });
        try { saveReadIds(readIds); } catch { /* The event save has already succeeded. */ }
      } finally {
        set({ saving: false });
      }
    },
    markRead: (ids, read) => {
      const readIds = new Set(get().readIds);
      for (const id of ids) {
        if (read) readIds.add(id);
        else readIds.delete(id);
      }
      saveReadIds(readIds);
    },
  };
});

export function latestAlerts(events: AlertEvent[]) {
  return [...events].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}
