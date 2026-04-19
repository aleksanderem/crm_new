/**
 * Convex → Supabase Leave Balance Write Actions
 *
 * Internal actions that persist gabinet leave balance data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern: Convex mutations
 * write to Convex first, then schedule these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient, upsertWithFkRetry } from "../client";

export const writeLeaveBalanceToSupabase = internalAction({
  args: {
    balanceId: v.string(),
    organizationId: v.string(),
    employeeId: v.string(),
    leaveTypeId: v.string(),
    year: v.number(),
    totalDays: v.number(),
    usedDays: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.balanceId,
      organization_id: args.organizationId,
      employee_id: args.employeeId,
      leave_type_id: args.leaveTypeId,
      year: args.year,
      total_days: args.totalDays,
      used_days: args.usedDays,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const data = await upsertWithFkRetry(client, "gabinet_leave_balances", row);

    console.info(`Leave balance written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateLeaveBalanceInSupabase = internalAction({
  args: {
    balanceId: v.string(),
    organizationId: v.string(),
    totalDays: v.optional(v.number()),
    usedDays: v.optional(v.number()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.totalDays !== undefined) row.total_days = args.totalDays;
    if (args.usedDays !== undefined) row.used_days = args.usedDays;

    const { data, error } = await client
      .from("gabinet_leave_balances")
      .update(row)
      .eq("id", args.balanceId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for leave balance ${args.balanceId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Leave balance updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});
