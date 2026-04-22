/**
 * Convex → Supabase Leave Write Actions
 *
 * Internal actions that persist gabinet leave data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern: Convex mutations
 * write to Convex first, then schedule these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient, upsertWithFkRetry } from "../client";

export const writeLeaveToSupabase = internalAction({
  args: {
    leaveId: v.string(),
    organizationId: v.string(),
    userId: v.string(),
    type: v.string(),
    leaveTypeId: v.optional(v.string()),
    startDate: v.string(),
    endDate: v.string(),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    status: v.string(),
    reason: v.optional(v.string()),
    approvedBy: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.leaveId,
      organization_id: args.organizationId,
      user_id: args.userId,
      type: args.type,
      leave_type_id: args.leaveTypeId ?? null,
      start_date: args.startDate,
      end_date: args.endDate,
      start_time: args.startTime ?? null,
      end_time: args.endTime ?? null,
      status: args.status,
      reason: args.reason ?? null,
      approved_by: args.approvedBy ?? null,
      approved_at: args.approvedAt ?? null,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const data = await upsertWithFkRetry(client, "gabinet_leaves", row);

    console.info(`Leave written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateLeaveInSupabase = internalAction({
  args: {
    leaveId: v.string(),
    organizationId: v.string(),
    userId: v.optional(v.string()),
    type: v.optional(v.string()),
    leaveTypeId: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    status: v.optional(v.string()),
    reason: v.optional(v.string()),
    approvedBy: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.userId !== undefined) row.user_id = args.userId;
    if (args.type !== undefined) row.type = args.type;
    if (args.leaveTypeId !== undefined) row.leave_type_id = args.leaveTypeId;
    if (args.startDate !== undefined) row.start_date = args.startDate;
    if (args.endDate !== undefined) row.end_date = args.endDate;
    if (args.startTime !== undefined) row.start_time = args.startTime;
    if (args.endTime !== undefined) row.end_time = args.endTime;
    if (args.status !== undefined) row.status = args.status;
    if (args.reason !== undefined) row.reason = args.reason;
    if (args.approvedBy !== undefined) row.approved_by = args.approvedBy;
    if (args.approvedAt !== undefined) row.approved_at = args.approvedAt;

    const { data, error } = await client
      .from("gabinet_leaves")
      .update(row)
      .eq("id", args.leaveId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for leave ${args.leaveId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Leave updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteLeaveFromSupabase = internalAction({
  args: {
    leaveId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    // Hard-delete: leaves can be permanently removed
    const { error } = await client
      .from("gabinet_leaves")
      .delete()
      .eq("id", args.leaveId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for leave ${args.leaveId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Leave deleted from Supabase id=${args.leaveId} org=${args.organizationId}`);
    return { success: true, id: args.leaveId };
  },
});
