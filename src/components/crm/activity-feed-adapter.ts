/**
 * Adapter: MappedActivity (Supabase) / Activity (legacy) → FeedEntry for ActivityFeed component.
 *
 * Converts the flat activity records from the data layer into the rich FeedEntry
 * format expected by ActivityFeed, mapping action types to feed types and extracting
 * email/call/system metadata from the metadata JSON blob.
 */

import type { FeedEntry } from "@/components/crm/activity-feed";
import type { ActivityAction } from "@cvx/schema";
import {
  translateActivityDescription,
  type Translator,
} from "@/components/activity-timeline/translate-description";

function readEnvelopeActorLabel(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const envelope = (metadata as { activityEnvelope?: unknown }).activityEnvelope;
  if (!envelope || typeof envelope !== "object") return undefined;
  const actor = (envelope as { actor?: unknown }).actor;
  if (!actor || typeof actor !== "object") return undefined;
  const label = (actor as { label?: unknown }).label;
  return typeof label === "string" && label.trim().length > 0 ? label.trim() : undefined;
}

function looksLikeOpaqueId(value: string | undefined): boolean {
  if (!value) return false;
  return /^[a-z0-9]{20,}$/i.test(value);
}

/** Shape returned by useSupabaseActivitiesByEntity */
export interface MappedActivityLike {
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
      action === "package_assigned") return "activity";
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
 *
 * Pass `t` to translate known stored English description templates (e.g.
 * `Updated appointment`, `Automation: <name>`) into the current language.
 */
export function activitiesToFeedEntries(
  activities: MappedActivityLike[],
  t?: Translator,
): FeedEntry[] {
  return activities.map((a): FeedEntry => {
    const meta = extractMetadata(a.metadata);
    const feedType = actionToFeedType(a.action);

    const actorLabel = a.performedByName ?? readEnvelopeActorLabel(a.metadata);
    const safeLegacyActor = looksLikeOpaqueId(a.performedBy) ? undefined : a.performedBy;

    const translatedDescription = translateActivityDescription(a.description, t) ?? a.description;
    const translatedBody = a.contentSnapshot
      ? a.contentSnapshot
      : translatedDescription;

    const entry: FeedEntry = {
      _id: a._id,
      type: feedType,
      action: a.action as ActivityAction,
      title: translatedDescription,
      body: translatedBody,
      createdAt: a.createdAt,
      performedBy: actorLabel ?? safeLegacyActor
        ? { name: actorLabel ?? safeLegacyActor! }
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
