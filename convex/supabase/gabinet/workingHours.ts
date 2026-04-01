/**
 * Convex → Supabase Working Hours Write Actions
 *
 * Internal actions that persist gabinet working hours data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern: Convex mutations
 * write to Convex first, then schedule these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "../client";

export const writeWorkingHoursToSupabase = internalAction({
  args: {
    workingHoursId: v.string(),
    organizationId: v.string(),
    dayOfWeek: v.number(),
    startTime: v.string(),
    endTime: v.string(),
    isOpen: v.boolean(),
    breakStart: v.optional(v.string()),
    breakEnd: v.optional(v.string()),
    locationId: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.workingHoursId,
      organization_id: args.organizationId,
      day_of_week: args.dayOfWeek,
      start_time: args.startTime,
      end_time: args.endTime,
      is_open: args.isOpen,
      break_start: args.breakStart ?? null,
      break_end: args.breakEnd ?? null,
      location_id: args.locationId ?? null,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("gabinet_working_hours")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for working hours: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`Working hours written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateWorkingHoursInSupabase = internalAction({
  args: {
    workingHoursId: v.string(),
    organizationId: v.string(),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    isOpen: v.optional(v.boolean()),
    breakStart: v.optional(v.string()),
    breakEnd: v.optional(v.string()),
    locationId: v.optional(v.string()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.startTime !== undefined) row.start_time = args.startTime;
    if (args.endTime !== undefined) row.end_time = args.endTime;
    if (args.isOpen !== undefined) row.is_open = args.isOpen;
    if (args.breakStart !== undefined) row.break_start = args.breakStart;
    if (args.breakEnd !== undefined) row.break_end = args.breakEnd;
    if (args.locationId !== undefined) row.location_id = args.locationId;

    const { data, error } = await client
      .from("gabinet_working_hours")
      .update(row)
      .eq("id", args.workingHoursId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for working hours ${args.workingHoursId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Working hours updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});
