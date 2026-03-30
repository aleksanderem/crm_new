/**
 * Convex → Supabase AuditLog Dual-Write Actions
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writeAuditLogToSupabase = internalAction({
  args: {
    auditLogId: v.string(),
    organizationId: v.string(),
    userId: v.string(),
    action: v.string(),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    details: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    createdAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();
    const row = {
      id: args.auditLogId,
      organization_id: args.organizationId,
      user_id: args.userId,
      action: args.action,
      entity_type: args.entityType ?? null,
      entity_id: args.entityId ?? null,
      details: args.details ?? null,
      ip_address: args.ipAddress ?? null,
      created_at: args.createdAt,
    };

    const { data, error } = await client
      .from("audit_log")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for auditLog: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`AuditLog written to Supabase id=${data!.id}`);
    return { success: true, id: data!.id };
  },
});
