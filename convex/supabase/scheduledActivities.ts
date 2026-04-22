/**
 * Convex → Supabase ScheduledActivities Dual-Write Actions
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient, upsertWithFkRetry } from "./client";

export const writeScheduledActivityToSupabase = internalAction({
  args: {
    scheduledActivityId: v.string(),
    organizationId: v.string(),
    title: v.string(),
    activityType: v.string(),
    dueDate: v.number(),
    endDate: v.optional(v.number()),
    isCompleted: v.boolean(),
    completedAt: v.optional(v.number()),
    ownerId: v.string(),
    description: v.optional(v.string()),
    linkedEntityType: v.optional(v.string()),
    linkedEntityId: v.optional(v.string()),
    location: v.optional(v.string()),
    meetingUrl: v.optional(v.string()),
    googleEventId: v.optional(v.string()),
    googleCalendarId: v.optional(v.string()),
    lastGoogleSyncAt: v.optional(v.number()),
    requiresCompletion: v.optional(v.boolean()),
    sourceType: v.optional(v.string()),
    syncConfigId: v.optional(v.string()),
    visibilityOverride: v.optional(v.string()),
    moduleRef: v.optional(v.any()),
    resourceId: v.optional(v.string()),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();
    const row = {
      id: args.scheduledActivityId,
      organization_id: args.organizationId,
      title: args.title,
      activity_type: args.activityType,
      due_date: args.dueDate,
      end_date: args.endDate ?? null,
      is_completed: args.isCompleted,
      completed_at: args.completedAt ?? null,
      owner_id: args.ownerId,
      description: args.description ?? null,
      linked_entity_type: args.linkedEntityType ?? null,
      linked_entity_id: args.linkedEntityId ?? null,
      location: args.location ?? null,
      meeting_url: args.meetingUrl ?? null,
      google_event_id: args.googleEventId ?? null,
      google_calendar_id: args.googleCalendarId ?? null,
      last_google_sync_at: args.lastGoogleSyncAt ?? null,
      requires_completion: args.requiresCompletion ?? null,
      source_type: args.sourceType ?? null,
      sync_config_id: args.syncConfigId ?? null,
      visibility_override: args.visibilityOverride ?? null,
      module_ref: args.moduleRef ?? null,
      resource_id: args.resourceId ?? null,
      tag_ids: args.tagIds ?? null,
      category_id: args.categoryId ?? null,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const data = await upsertWithFkRetry(client, "scheduled_activities", row);

    console.info(`ScheduledActivity written to Supabase id=${data.id}`);
    return { success: true, id: data.id };
  },
});

export const updateScheduledActivityInSupabase = internalAction({
  args: {
    scheduledActivityId: v.string(),
    title: v.optional(v.string()),
    activityType: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    isCompleted: v.optional(v.boolean()),
    completedAt: v.optional(v.number()),
    ownerId: v.optional(v.string()),
    description: v.optional(v.string()),
    linkedEntityType: v.optional(v.string()),
    linkedEntityId: v.optional(v.string()),
    location: v.optional(v.string()),
    meetingUrl: v.optional(v.string()),
    requiresCompletion: v.optional(v.boolean()),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();
    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.title !== undefined) row.title = args.title;
    if (args.activityType !== undefined) row.activity_type = args.activityType;
    if (args.dueDate !== undefined) row.due_date = args.dueDate;
    if (args.endDate !== undefined) row.end_date = args.endDate;
    if (args.isCompleted !== undefined) row.is_completed = args.isCompleted;
    if (args.completedAt !== undefined) row.completed_at = args.completedAt;
    if (args.ownerId !== undefined) row.owner_id = args.ownerId;
    if (args.description !== undefined) row.description = args.description;
    if (args.linkedEntityType !== undefined) row.linked_entity_type = args.linkedEntityType;
    if (args.linkedEntityId !== undefined) row.linked_entity_id = args.linkedEntityId;
    if (args.location !== undefined) row.location = args.location;
    if (args.meetingUrl !== undefined) row.meeting_url = args.meetingUrl;
    if (args.requiresCompletion !== undefined) row.requires_completion = args.requiresCompletion;
    if (args.tagIds !== undefined) row.tag_ids = args.tagIds;
    if (args.categoryId !== undefined) row.category_id = args.categoryId;

    const { data, error } = await client
      .from("scheduled_activities")
      .update(row)
      .eq("id", args.scheduledActivityId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for scheduledActivity ${args.scheduledActivityId}: ${error.message}`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`ScheduledActivity updated in Supabase id=${data!.id}`);
    return { success: true, id: data!.id };
  },
});

export const deleteScheduledActivityFromSupabase = internalAction({
  args: {
    scheduledActivityId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("scheduled_activities")
      .delete()
      .eq("id", args.scheduledActivityId);

    if (error) {
      const msg = `Supabase delete failed for scheduledActivity ${args.scheduledActivityId}: ${error.message}`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`ScheduledActivity deleted from Supabase id=${args.scheduledActivityId}`);
    return { success: true, id: args.scheduledActivityId };
  },
});
