/**
 * Convex → Supabase Leave Type Write Actions
 *
 * Internal actions that persist gabinet leave type data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern: Convex mutations
 * write to Convex first, then schedule these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "../client";

export const writeLeaveTypeToSupabase = internalAction({
  args: {
    leaveTypeId: v.string(),
    organizationId: v.string(),
    name: v.string(),
    color: v.optional(v.string()),
    isPaid: v.boolean(),
    annualQuotaDays: v.optional(v.number()),
    requiresApproval: v.boolean(),
    isActive: v.boolean(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.leaveTypeId,
      organization_id: args.organizationId,
      name: args.name,
      color: args.color ?? null,
      is_paid: args.isPaid,
      annual_quota_days: args.annualQuotaDays ?? null,
      requires_approval: args.requiresApproval,
      is_active: args.isActive,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("gabinet_leave_types")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for leave type: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`Leave type written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateLeaveTypeInSupabase = internalAction({
  args: {
    leaveTypeId: v.string(),
    organizationId: v.string(),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    isPaid: v.optional(v.boolean()),
    annualQuotaDays: v.optional(v.number()),
    requiresApproval: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.name !== undefined) row.name = args.name;
    if (args.color !== undefined) row.color = args.color;
    if (args.isPaid !== undefined) row.is_paid = args.isPaid;
    if (args.annualQuotaDays !== undefined) row.annual_quota_days = args.annualQuotaDays;
    if (args.requiresApproval !== undefined) row.requires_approval = args.requiresApproval;
    if (args.isActive !== undefined) row.is_active = args.isActive;

    const { data, error } = await client
      .from("gabinet_leave_types")
      .update(row)
      .eq("id", args.leaveTypeId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for leave type ${args.leaveTypeId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Leave type updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteLeaveTypeFromSupabase = internalAction({
  args: {
    leaveTypeId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    // Soft-delete: match Convex behavior (isActive = false)
    const { error } = await client
      .from("gabinet_leave_types")
      .update({ is_active: false, updated_at: Date.now() })
      .eq("id", args.leaveTypeId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for leave type ${args.leaveTypeId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Leave type soft-deleted in Supabase id=${args.leaveTypeId} org=${args.organizationId}`);
    return { success: true, id: args.leaveTypeId };
  },
});
