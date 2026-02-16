import type { GenericMutationCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";
import type { Id } from "./_generated/dataModel";
import { GABINET_ACTIVITY_TYPES } from "./gabinet/_registry";

type MutationCtx = GenericMutationCtx<DataModel>;

async function seedOrganizationDefaultsHandler(
  ctx: MutationCtx,
  args: { organizationId: Id<"organizations">; userId: Id<"users"> },
) {
  const { organizationId, userId } = args;
  const now = Date.now();

  // --- Sources ---
  const existingSources = await ctx.db
    .query("sources")
    .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
    .first();

  if (!existingSources) {
    const sources = [
      "Website",
      "Referral",
      "Cold Call",
      "Social Media",
      "Email Campaign",
      "Trade Show",
      "Other",
    ];
    for (let i = 0; i < sources.length; i++) {
      await ctx.db.insert("sources", {
        organizationId,
        name: sources[i],
        order: i,
        isActive: true,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // --- Lost Reasons ---
  const existingReasons = await ctx.db
    .query("lostReasons")
    .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
    .first();

  if (!existingReasons) {
    const reasons = [
      "Budget constraints",
      "Chose competitor",
      "No response",
      "Timing not right",
      "Requirements changed",
      "Price too high",
      "Other",
    ];
    for (let i = 0; i < reasons.length; i++) {
      await ctx.db.insert("lostReasons", {
        organizationId,
        label: reasons[i],
        order: i,
        isActive: true,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // --- Default Pipeline + Stages ---
  const existingPipelines = await ctx.db
    .query("pipelines")
    .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
    .first();

  if (!existingPipelines) {
    const pipelineId = await ctx.db.insert("pipelines", {
      organizationId,
      name: "Sales Pipeline",
      description: "Default sales pipeline",
      isDefault: true,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    const stages = [
      { name: "New", color: "#3b82f6" },
      { name: "Qualified", color: "#8b5cf6" },
      { name: "Proposal", color: "#f59e0b" },
      { name: "Negotiation", color: "#f97316" },
      { name: "Won", color: "#22c55e", isWonStage: true },
      { name: "Lost", color: "#ef4444", isLostStage: true },
    ];

    for (let i = 0; i < stages.length; i++) {
      await ctx.db.insert("pipelineStages", {
        pipelineId,
        organizationId,
        name: stages[i].name,
        color: stages[i].color,
        order: i,
        isWonStage: stages[i].isWonStage,
        isLostStage: stages[i].isLostStage,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // --- Activity Type Definitions ---
  const existingActivityTypes = await ctx.db
    .query("activityTypeDefinitions")
    .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
    .first();

  if (!existingActivityTypes) {
    const activityTypes = [
      { key: "call", name: "Call", icon: "phone", color: "#3b82f6" },
      { key: "meeting", name: "Meeting", icon: "clock", color: "#a855f7" },
      { key: "email", name: "Email", icon: "mail", color: "#22c55e" },
      { key: "task", name: "Task", icon: "check-circle", color: "#f97316" },
      // Gabinet activity types
      ...GABINET_ACTIVITY_TYPES.map((at) => ({
        key: at.key,
        name: at.name,
        icon: at.icon,
        color: at.color,
      })),
    ];

    for (let i = 0; i < activityTypes.length; i++) {
      const def = activityTypes[i];
      await ctx.db.insert("activityTypeDefinitions", {
        organizationId,
        key: def.key,
        name: def.name,
        icon: def.icon,
        color: def.color,
        isSystem: true,
        order: i,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // --- Org Settings ---
  const existingSettings = await ctx.db
    .query("orgSettings")
    .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
    .first();

  if (!existingSettings) {
    await ctx.db.insert("orgSettings", {
      organizationId,
      allowCustomLostReason: true,
      lostReasonRequired: false,
      defaultCurrency: "USD",
      createdAt: now,
      updatedAt: now,
    });
  }
}

/**
 * Public wrapper — call from frontend to seed an existing org.
 */
export const seedAll = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    await seedOrganizationDefaultsHandler(ctx, {
      organizationId: args.organizationId,
      userId: user._id,
    });
  },
});

/**
 * Internal — called from completeOnboarding and organizations.create.
 */
export const seedOrganizationDefaults = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await seedOrganizationDefaultsHandler(ctx, args);
  },
});
