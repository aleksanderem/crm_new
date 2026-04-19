/**
 * Convex → Supabase Activity Write Action
 *
 * Activities are append-only timeline entries — write-only, no update/delete.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient, upsertWithFkRetry } from "./client";

export const writeActivityToSupabase = internalAction({
  args: {
    activityId: v.string(),
    organizationId: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    action: v.string(),
    description: v.string(),
    metadata: v.optional(v.any()),
    performedBy: v.string(),
    createdAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.activityId,
      organization_id: args.organizationId,
      entity_type: args.entityType,
      entity_id: args.entityId,
      action: args.action,
      description: args.description,
      metadata: args.metadata ?? null,
      performed_by: args.performedBy,
      created_at: args.createdAt,
    };

    const data = await upsertWithFkRetry(client, "activities", row);

    console.info(`Activity written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});
