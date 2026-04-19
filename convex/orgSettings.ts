import { query, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

export const get = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const settings = await ctx.db
      .query("orgSettings")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .unique();

    return settings;
  },
});

export const upsert = action({
  args: {
    organizationId: v.id("organizations"),
    allowCustomLostReason: v.optional(v.boolean()),
    lostReasonRequired: v.optional(v.boolean()),
    defaultCurrency: v.optional(v.string()),
    timezone: v.optional(v.string()),
    reminderEnabled: v.optional(v.boolean()),
    reminderHoursBefore: v.optional(v.number()),
    appointmentWorkflowConfig: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const now = Date.now();

    const existing = await db
      .query("orgSettings")
      .eq("organizationId", String(args.organizationId))
      .first();

    if (existing) {
      const updates: Record<string, unknown> = { updatedAt: now };
      if (args.allowCustomLostReason !== undefined) updates.allowCustomLostReason = args.allowCustomLostReason;
      if (args.lostReasonRequired !== undefined) updates.lostReasonRequired = args.lostReasonRequired;
      if (args.defaultCurrency !== undefined) updates.defaultCurrency = args.defaultCurrency;
      if (args.timezone !== undefined) updates.timezone = args.timezone;
      if (args.reminderEnabled !== undefined) updates.reminderEnabled = args.reminderEnabled;
      if (args.reminderHoursBefore !== undefined) updates.reminderHoursBefore = args.reminderHoursBefore;
      if (args.appointmentWorkflowConfig !== undefined) updates.appointmentWorkflowConfig = args.appointmentWorkflowConfig;

      await db.patch("orgSettings", existing._id as string, updates);
      return existing._id as string;
    }

    const settingsId = await db.insert("orgSettings", {
      organizationId: String(args.organizationId),
      allowCustomLostReason: args.allowCustomLostReason ?? false,
      lostReasonRequired: args.lostReasonRequired ?? false,
      defaultCurrency: args.defaultCurrency ?? null,
      timezone: args.timezone ?? null,
      reminderEnabled: args.reminderEnabled ?? null,
      reminderHoursBefore: args.reminderHoursBefore ?? null,
      appointmentWorkflowConfig: args.appointmentWorkflowConfig ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return settingsId;
  },
});
