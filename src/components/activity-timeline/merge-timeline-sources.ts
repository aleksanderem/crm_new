import type { ActivityWithMetadata } from "./presenter/activity-presenter";

export interface TimelineSourceEntry {
  _id: string;
  action: string;
  description: string;
  createdAt: number;
  performedByName?: string;
  metadata?: unknown;
}

export interface SmsEventEntry {
  _id: string;
  direction: "outbound" | "inbound";
  messageBody?: string;
  createdAt: number;
  status?: string;
  parsedIntent?: string;
}

export interface AutomationRunEntry {
  _id: string;
  ruleName?: string;
  status: string;
  createdAt: number;
  actionsSummary?: string;
}

/**
 * Merges heterogeneous timeline sources (activities, SMS events, automation
 * runs) into a single sorted array of `ActivityWithMetadata` entries suitable
 * for rendering with `ActivityTimeline`.
 *
 * Mirrors the logic previously inlined in the appointment-detail page's
 * `buildUnifiedHistoryEntries()`, but decoupled from i18n so it can be reused
 * across any entity detail view.
 */
export function mergeTimelineSources(opts: {
  activities?: TimelineSourceEntry[];
  smsEvents?: SmsEventEntry[];
  automationRuns?: AutomationRunEntry[];
}): ActivityWithMetadata[] {
  const { activities = [], smsEvents = [], automationRuns = [] } = opts;

  const seen = new Set<string>();

  const activityEntries: ActivityWithMetadata[] = activities.map((a) => ({
    _id: a._id,
    action: a.action as ActivityWithMetadata["action"],
    description: a.description,
    createdAt: a.createdAt,
    performedByName: a.performedByName,
    metadata: a.metadata,
  }));

  const smsEntries: ActivityWithMetadata[] = smsEvents.map((event) => {
    const isInbound = event.direction === "inbound";
    return {
      _id: `sms-${event._id}`,
      action: isInbound ? "sms_received" : "sms_sent",
      description: event.messageBody ?? "",
      createdAt: event.createdAt,
      metadata: {
        status: event.status,
        parsedIntent: event.parsedIntent,
        direction: event.direction,
      },
    };
  });

  const automationEntries: ActivityWithMetadata[] = automationRuns.map(
    (run) => ({
      _id: `automation-${run._id}`,
      action: "updated" as const,
      description: run.ruleName
        ? `Automation: ${run.ruleName}`
        : "Automation run",
      createdAt: run.createdAt,
      metadata: {
        automationStatus: run.status,
        actionsSummary: run.actionsSummary,
      },
    }),
  );

  const merged = [
    ...activityEntries,
    ...smsEntries,
    ...automationEntries,
  ];

  // Deduplicate by _id, keeping first occurrence
  const deduped = merged.filter((entry) => {
    if (seen.has(entry._id)) return false;
    seen.add(entry._id);
    return true;
  });

  // Sort descending by createdAt (newest first)
  deduped.sort((a, b) => b.createdAt - a.createdAt);

  return deduped;
}
