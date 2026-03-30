import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

// @ts-ignore — TS2589
const writeOrgSettingsRef = internal.supabase.orgSettings.writeOrgSettingsToSupabase;

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

export const upsert = mutation({
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
    await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();

    const existing = await ctx.db
      .query("orgSettings")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .unique();

    if (existing) {
      const { organizationId, ...updates } = args;
      await ctx.db.patch(existing._id, { ...updates, updatedAt: now });
      // Dual-write: upsert with existing ID
      await ctx.scheduler.runAfter(0, writeOrgSettingsRef, {
        orgSettingsId: existing._id as any,
        organizationId: args.organizationId as any,
        allowCustomLostReason: args.allowCustomLostReason ?? existing.allowCustomLostReason,
        lostReasonRequired: args.lostReasonRequired ?? existing.lostReasonRequired,
        defaultCurrency: args.defaultCurrency ?? existing.defaultCurrency,
        timezone: args.timezone ?? existing.timezone,
        reminderEnabled: args.reminderEnabled ?? existing.reminderEnabled,
        reminderHoursBefore: args.reminderHoursBefore ?? existing.reminderHoursBefore,
        appointmentWorkflowConfig: args.appointmentWorkflowConfig ?? existing.appointmentWorkflowConfig,
        createdAt: existing.createdAt,
        updatedAt: now,
      });
      return existing._id;
    }

    const settingsId = await ctx.db.insert("orgSettings", {
      organizationId: args.organizationId,
      allowCustomLostReason: args.allowCustomLostReason ?? false,
      lostReasonRequired: args.lostReasonRequired ?? false,
      defaultCurrency: args.defaultCurrency,
      timezone: args.timezone,
      reminderEnabled: args.reminderEnabled,
      reminderHoursBefore: args.reminderHoursBefore,
      appointmentWorkflowConfig: args.appointmentWorkflowConfig,
      createdAt: now,
      updatedAt: now,
    });

    // Dual-write: insert new settings
    await ctx.scheduler.runAfter(0, writeOrgSettingsRef, {
      orgSettingsId: settingsId as any,
      organizationId: args.organizationId as any,
      allowCustomLostReason: args.allowCustomLostReason ?? false,
      lostReasonRequired: args.lostReasonRequired ?? false,
      defaultCurrency: args.defaultCurrency,
      timezone: args.timezone,
      reminderEnabled: args.reminderEnabled,
      reminderHoursBefore: args.reminderHoursBefore,
      appointmentWorkflowConfig: args.appointmentWorkflowConfig,
      createdAt: now,
      updatedAt: now,
    });

    return settingsId;
  },
});
