/**
 * Adapter: MappedActivity (Supabase) / Activity (legacy) → FeedEntry for ActivityFeed component.
 *
 * Converts the flat activity records from the data layer into the rich FeedEntry
 * format expected by ActivityFeed, mapping action types to feed types and extracting
 * email/call/system metadata from the metadata JSON blob.
 */

import type { FeedEntry } from "@/components/crm/activity-feed";
import type { ActivityAction } from "@cvx/schema";

/** Shape returned by useSupabaseActivitiesByEntity */
interface MappedActivityLike {
  _id: string;
  action: string;
  description: string;
  performedBy?: string;
  performedByName?: string;
  createdAt: number;
  contentSnapshot?: string;
  metaLines?: string[];
  metadata?: unknown;
  entityType?: string;
  entityId?: string;
}

/**
 * Determine the feed entry type from an activity action string.
 */
function actionToFeedType(action: string): FeedEntry["type"] {
  if (action === "note_added") return "note";
  if (action.startsWith("email_")) return "email";
  if (action === "call" || action === "call_made" || action === "call_received") return "call";
  if (action === "created" || action === "updated" || action === "deleted" ||
      action === "stage_changed" || action === "status_changed" ||
      action === "assigned" || action === "relationship_added" ||
      action === "relationship_removed" || action === "document_uploaded" ||
      action === "package_assigned") return "system";
  return "activity";
}

/**
 * Extract structured metadata from the JSON blob if present.
 */
function extractMetadata(meta: unknown): Record<string, unknown> {
  if (!meta || typeof meta !== "object") return {};
  return meta as Record<string, unknown>;
}

/**
 * Convert an array of MappedActivity-like objects to FeedEntry[] for ActivityFeed.
 */
export function activitiesToFeedEntries(
  activities: MappedActivityLike[],
): FeedEntry[] {
  return activities.map((a): FeedEntry => {
    const meta = extractMetadata(a.metadata);
    const feedType = actionToFeedType(a.action);

    const entry: FeedEntry = {
      _id: a._id,
      type: feedType,
      action: a.action as ActivityAction,
      title: a.description,
      body: a.contentSnapshot ?? a.description,
      createdAt: a.createdAt,
      performedBy: a.performedByName ?? a.performedBy
        ? { name: a.performedByName ?? a.performedBy! }
        : undefined,
    };

    // Enrich email entries
    if (feedType === "email") {
      entry.emailSubject = (meta.subject as string) ?? a.description;
      entry.emailTo = meta.to as string[] | undefined;
      if (meta.htmlBody) entry.htmlBody = meta.htmlBody as string;
    }

    // Enrich call entries
    if (feedType === "call") {
      entry.callDirection = (meta.direction as "inbound" | "outbound") ?? "outbound";
      entry.callDuration = meta.duration as number | undefined;
    }

    // Enrich system entries (status/stage changes)
    if (feedType === "system") {
      entry.fromStatus = meta.fromStatus as string | undefined;
      entry.toStatus = meta.toStatus as string | undefined;
    }

    return entry;
  });
}
