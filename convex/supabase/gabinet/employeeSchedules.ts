/**
 * Convex → Supabase Employee Schedule Write Actions
 *
 * Internal actions that persist gabinet employee schedule data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern: Convex mutations
 * write to Convex first, then schedule these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient, upsertWithFkRetry } from "../client";

export const writeEmployeeScheduleToSupabase = internalAction({
  args: {
    scheduleId: v.string(),
    organizationId: v.string(),
    userId: v.string(),
    dayOfWeek: v.number(),
    startTime: v.string(),
    endTime: v.string(),
    isWorking: v.boolean(),
    breakStart: v.optional(v.string()),
    breakEnd: v.optional(v.string()),
    effectiveFrom: v.optional(v.string()),
    effectiveTo: v.optional(v.string()),
    locationId: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.scheduleId,
      organization_id: args.organizationId,
      user_id: args.userId,
      day_of_week: args.dayOfWeek,
      start_time: args.startTime,
      end_time: args.endTime,
      is_working: args.isWorking,
      break_start: args.breakStart ?? null,
      break_end: args.breakEnd ?? null,
      effective_from: args.effectiveFrom ?? null,
      effective_to: args.effectiveTo ?? null,
      location_id: args.locationId ?? null,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const data = await upsertWithFkRetry(client, "gabinet_employee_schedules", row);

    console.info(`Employee schedule written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateEmployeeScheduleInSupabase = internalAction({
  args: {
    scheduleId: v.string(),
    organizationId: v.string(),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    isWorking: v.optional(v.boolean()),
    breakStart: v.optional(v.string()),
    breakEnd: v.optional(v.string()),
    effectiveFrom: v.optional(v.string()),
    effectiveTo: v.optional(v.string()),
    locationId: v.optional(v.string()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.startTime !== undefined) row.start_time = args.startTime;
    if (args.endTime !== undefined) row.end_time = args.endTime;
    if (args.isWorking !== undefined) row.is_working = args.isWorking;
    if (args.breakStart !== undefined) row.break_start = args.breakStart;
    if (args.breakEnd !== undefined) row.break_end = args.breakEnd;
    if (args.effectiveFrom !== undefined) row.effective_from = args.effectiveFrom;
    if (args.effectiveTo !== undefined) row.effective_to = args.effectiveTo;
    if (args.locationId !== undefined) row.location_id = args.locationId;

    const { data, error } = await client
      .from("gabinet_employee_schedules")
      .update(row)
      .eq("id", args.scheduleId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for employee schedule ${args.scheduleId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Employee schedule updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteEmployeeScheduleFromSupabase = internalAction({
  args: {
    scheduleId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    // Hard-delete: match Convex behavior (ctx.db.delete)
    const { error } = await client
      .from("gabinet_employee_schedules")
      .delete()
      .eq("id", args.scheduleId);

    if (error) {
      const msg = `Supabase delete failed for employee schedule ${args.scheduleId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Employee schedule deleted from Supabase id=${args.scheduleId} org=${args.organizationId}`);
    return { success: true, id: args.scheduleId };
  },
});
