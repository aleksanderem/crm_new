import { query, action, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

export const _getSettings = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orgSettings")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .unique();
  },
});

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
    reminderSms48h: v.optional(v.boolean()),
    reminderSms24h: v.optional(v.boolean()),
    reminderEmail48h: v.optional(v.boolean()),
    reminderEmail24h: v.optional(v.boolean()),
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
      if (args.reminderSms48h !== undefined) updates.reminderSms48h = args.reminderSms48h;
      if (args.reminderSms24h !== undefined) updates.reminderSms24h = args.reminderSms24h;
      if (args.reminderEmail48h !== undefined) updates.reminderEmail48h = args.reminderEmail48h;
      if (args.reminderEmail24h !== undefined) updates.reminderEmail24h = args.reminderEmail24h;

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
      reminderSms48h: args.reminderSms48h ?? null,
      reminderSms24h: args.reminderSms24h ?? null,
      reminderEmail48h: args.reminderEmail48h ?? null,
      reminderEmail24h: args.reminderEmail24h ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return settingsId;
  },
});

// Mirrors resourceSharingEnabled into the Convex table so the public
// getResourceSharingEnabled query (which can't reach Supabase) stays in sync.
export const _syncResourceSharingToConvex = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    resourceSharingEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("orgSettings")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        resourceSharingEnabled: args.resourceSharingEnabled,
      });
    } else {
      await ctx.db.insert("orgSettings", {
        organizationId: args.organizationId,
        allowCustomLostReason: false,
        lostReasonRequired: false,
        resourceSharingEnabled: args.resourceSharingEnabled,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});
