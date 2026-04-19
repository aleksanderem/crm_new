/**
 * Convex → Supabase OrgPermissions Dual-Write Action
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient, upsertWithFkRetry } from "./client";

export const writeOrgPermissionToSupabase = internalAction({
  args: {
    orgPermissionId: v.string(),
    organizationId: v.string(),
    role: v.string(),
    permissions: v.string(),
    updatedBy: v.string(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();

    const row = {
      id: args.orgPermissionId,
      organization_id: args.organizationId,
      role: args.role,
      permissions: JSON.parse(args.permissions),
      updated_by: args.updatedBy,
      updated_at: args.updatedAt,
    };

    const data = await upsertWithFkRetry(client, "org_permissions", row);

    console.info(`OrgPermission written to Supabase id=${data.id}`);
    return { success: true, id: data.id };
  },
});
