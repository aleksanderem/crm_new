/**
 * Convex → Supabase ActivityTypes Dual-Write Actions
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient, upsertWithFkRetry } from "./client";

export const writeActivityTypeToSupabase = internalAction({
  args: {
    activityTypeId: v.string(),
    organizationId: v.string(),
    key: v.string(),
    name: v.string(),
    icon: v.string(),
    color: v.optional(v.string()),
    isSystem: v.boolean(),
    order: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();
    const row = {
      id: args.activityTypeId,
      organization_id: args.organizationId,
      key: args.key,
      name: args.name,
      icon: args.icon,
      color: args.color ?? null,
      is_system: args.isSystem,
      "order": args.order,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const data = await upsertWithFkRetry(client, "activity_type_definitions", row);

    console.info(`ActivityType written to Supabase id=${data.id}`);
    return { success: true, id: data.id };
  },
});

export const updateActivityTypeInSupabase = internalAction({
  args: {
    activityTypeId: v.string(),
    name: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    isSystem: v.optional(v.boolean()),
    order: v.optional(v.number()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();
    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.name !== undefined) row.name = args.name;
    if (args.icon !== undefined) row.icon = args.icon;
    if (args.color !== undefined) row.color = args.color;
    if (args.isSystem !== undefined) row.is_system = args.isSystem;
    if (args.order !== undefined) row["order"] = args.order;

    const { data, error } = await client
      .from("activity_type_definitions")
      .update(row)
      .eq("id", args.activityTypeId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for activityType ${args.activityTypeId}: ${error.message}`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`ActivityType updated in Supabase id=${data!.id}`);
    return { success: true, id: data!.id };
  },
});

export const deleteActivityTypeFromSupabase = internalAction({
  args: {
    activityTypeId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("activity_type_definitions")
      .delete()
      .eq("id", args.activityTypeId);

    if (error) {
      const msg = `Supabase delete failed for activityType ${args.activityTypeId}: ${error.message}`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`ActivityType deleted from Supabase id=${args.activityTypeId}`);
    return { success: true, id: args.activityTypeId };
  },
});
