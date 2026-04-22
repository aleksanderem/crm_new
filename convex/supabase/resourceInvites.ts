/**
 * Convex → Supabase ResourceInvites Dual-Write Action
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient, upsertWithFkRetry } from "./client";

export const writeResourceInviteToSupabase = internalAction({
  args: {
    resourceInviteId: v.string(),
    organizationId: v.string(),
    email: v.string(),
    userId: v.optional(v.string()),
    resourceType: v.string(),
    resourceId: v.string(),
    accessLevel: v.string(),
    invitedBy: v.string(),
    token: v.string(),
    status: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();

    const row = {
      id: args.resourceInviteId,
      organization_id: args.organizationId,
      email: args.email,
      user_id: args.userId ?? null,
      resource_type: args.resourceType,
      resource_id: args.resourceId,
      access_level: args.accessLevel,
      invited_by: args.invitedBy,
      token: args.token,
      status: args.status,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const data = await upsertWithFkRetry(client, "resource_invites", row);

    console.info(`ResourceInvite written to Supabase id=${data.id}`);
    return { success: true, id: data.id };
  },
});
