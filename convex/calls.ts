import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { verifyOrgAccess } from "./_helpers/auth";
import { logActivity } from "./_helpers/activities";
import { callOutcomeValidator } from "@cvx/schema";

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    outcome: v.optional(callOutcomeValidator),
    dateFrom: v.optional(v.number()),
    dateTo: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    if (args.outcome) {
      return await ctx.db
        .query("calls")
        .withIndex("by_orgAndOutcome", (q) =>
          q.eq("organizationId", args.organizationId).eq("outcome", args.outcome!)
        )
        .order("desc")
        .paginate(args.paginationOpts);
    }

    if (args.dateFrom && args.dateTo) {
      return await ctx.db
        .query("calls")
        .withIndex("by_orgAndDate", (q) =>
          q.eq("organizationId", args.organizationId).gte("callDate", args.dateFrom!).lte("callDate", args.dateTo!)
        )
        .order("desc")
        .paginate(args.paginationOpts);
    }

    if (args.dateFrom) {
      return await ctx.db
        .query("calls")
        .withIndex("by_orgAndDate", (q) =>
          q.eq("organizationId", args.organizationId).gte("callDate", args.dateFrom!)
        )
        .order("desc")
        .paginate(args.paginationOpts);
    }

    if (args.dateTo) {
      return await ctx.db
        .query("calls")
        .withIndex("by_orgAndDate", (q) =>
          q.eq("organizationId", args.organizationId).lte("callDate", args.dateTo!)
        )
        .order("desc")
        .paginate(args.paginationOpts);
    }

    return await ctx.db
      .query("calls")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    callId: v.id("calls"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const call = await ctx.db.get(args.callId);
    if (!call || call.organizationId !== args.organizationId) {
      throw new Error("Call not found");
    }

    // Fetch linked contacts via objectRelationships
    const relationships = await ctx.db
      .query("objectRelationships")
      .withIndex("by_source", (q) =>
        q.eq("sourceType", "call").eq("sourceId", args.callId)
      )
      .collect();

    return { ...call, relationships };
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    outcome: callOutcomeValidator,
    callDate: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();

    const callId = await ctx.db.insert("calls", {
      ...args,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "call",
      entityId: callId,
      action: "created",
      description: `Logged a call with outcome "${args.outcome}"`,
      performedBy: user._id,
    });

    return callId;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    callId: v.id("calls"),
    outcome: v.optional(callOutcomeValidator),
    callDate: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    const call = await ctx.db.get(args.callId);
    if (!call || call.organizationId !== args.organizationId) {
      throw new Error("Call not found");
    }

    const { organizationId, callId, ...updates } = args;
    await ctx.db.patch(callId, { ...updates, updatedAt: Date.now() });

    await logActivity(ctx, {
      organizationId,
      entityType: "call",
      entityId: callId,
      action: "updated",
      description: `Updated call`,
      performedBy: user._id,
    });

    return callId;
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    callId: v.id("calls"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    const call = await ctx.db.get(args.callId);
    if (!call || call.organizationId !== args.organizationId) {
      throw new Error("Call not found");
    }

    // Clean up relationships
    const sourceRels = await ctx.db
      .query("objectRelationships")
      .withIndex("by_source", (q) =>
        q.eq("sourceType", "call").eq("sourceId", args.callId)
      )
      .collect();
    for (const rel of sourceRels) {
      await ctx.db.delete(rel._id);
    }

    await ctx.db.delete(args.callId);

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "call",
      entityId: args.callId,
      action: "deleted",
      description: `Deleted call`,
      performedBy: user._id,
    });

    return args.callId;
  },
});
