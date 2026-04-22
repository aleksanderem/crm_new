import { query, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { verifyOrgAccess } from "./_helpers/auth";
import { logActivity } from "./_helpers/activities";
import { checkPermission } from "./_helpers/permissions";
import { callOutcomeValidator } from "@cvx/schema";
import { Id } from "./_generated/dataModel";

// Dual-write refs removed — Supabase is now primary for call writes

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    outcome: v.optional(callOutcomeValidator),
    dateFrom: v.optional(v.number()),
    dateTo: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "calls", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const applyScope = (result: any) => {
      if (perm.scope === "own") {
        return { ...result, page: result.page.filter((r: any) => r.createdBy === user._id) };
      }
      return result;
    };

    if (args.outcome) {
      return applyScope(await ctx.db
        .query("calls")
        .withIndex("by_orgAndOutcome", (q) =>
          q.eq("organizationId", args.organizationId).eq("outcome", args.outcome!)
        )
        .order("desc")
        .paginate(args.paginationOpts));
    }

    if (args.dateFrom && args.dateTo) {
      return applyScope(await ctx.db
        .query("calls")
        .withIndex("by_orgAndDate", (q) =>
          q.eq("organizationId", args.organizationId).gte("callDate", args.dateFrom!).lte("callDate", args.dateTo!)
        )
        .order("desc")
        .paginate(args.paginationOpts));
    }

    if (args.dateFrom) {
      return applyScope(await ctx.db
        .query("calls")
        .withIndex("by_orgAndDate", (q) =>
          q.eq("organizationId", args.organizationId).gte("callDate", args.dateFrom!)
        )
        .order("desc")
        .paginate(args.paginationOpts));
    }

    if (args.dateTo) {
      return applyScope(await ctx.db
        .query("calls")
        .withIndex("by_orgAndDate", (q) =>
          q.eq("organizationId", args.organizationId).lte("callDate", args.dateTo!)
        )
        .order("desc")
        .paginate(args.paginationOpts));
    }

    return applyScope(await ctx.db
      .query("calls")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .paginate(args.paginationOpts));
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    callId: v.id("calls"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "calls", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const call = await ctx.db.get(args.callId);
    if (!call || call.organizationId !== args.organizationId) {
      throw new Error("Call not found");
    }
    if (perm.scope === "own" && call.createdBy !== user._id) {
      throw new Error("Permission denied");
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

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    outcome: callOutcomeValidator,
    callDate: v.number(),
    note: v.optional(v.string()),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "calls", action: "create" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const now = Date.now();
    const db = createSupabaseDb();

    const callId = await db.insert("calls", {
      organizationId: String(args.organizationId),
      outcome: args.outcome,
      callDate: args.callDate,
      note: args.note ?? null,
      tagIds: args.tagIds ?? null,
      categoryId: args.categoryId ?? null,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    try {
      await ctx.runMutation(internal.calls._createSideEffects, {
        callId,
        organizationId: args.organizationId,
        outcome: args.outcome,
        createdBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[calls.create] Side effects FAILED for call", callId, ":", e);
    }

    return callId;
  },
});

export const _createSideEffects = internalMutation({
  args: {
    callId: v.string(),
    organizationId: v.id("organizations"),
    outcome: v.string(),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "call",
      entityId: args.callId,
      action: "created",
      description: `Logged a call with outcome "${args.outcome}"`,
      performedBy: args.createdBy as Id<"users">,
    });
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    callId: v.string(),
    outcome: v.optional(callOutcomeValidator),
    callDate: v.optional(v.number()),
    note: v.optional(v.string()),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "calls", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    const call = await db.get("calls", args.callId);
    if (!call || String(call.organizationId) !== String(args.organizationId)) {
      throw new Error("Call not found");
    }
    if (perm.scope === "own" && String(call.createdBy) !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    const { organizationId, callId, ...updates } = args;
    await db.patch("calls", callId, { ...updates, updatedAt: Date.now() });

    try {
      await ctx.runMutation(internal.calls._updateSideEffects, {
        callId,
        organizationId,
        updatedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[calls.update] Side effects FAILED for call", callId, ":", e);
    }

    return callId;
  },
});

export const _updateSideEffects = internalMutation({
  args: {
    callId: v.string(),
    organizationId: v.id("organizations"),
    updatedBy: v.string(),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "call",
      entityId: args.callId,
      action: "updated",
      description: `Updated call`,
      performedBy: args.updatedBy as Id<"users">,
    });
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    callId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "calls", action: "delete" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    const call = await db.get("calls", args.callId);
    if (!call || String(call.organizationId) !== String(args.organizationId)) {
      throw new Error("Call not found");
    }
    if (perm.scope === "own" && String(call.createdBy) !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only delete your own records");
    }

    // Clean up relationships via internalMutation (needs ctx.db)
    await ctx.runMutation(internal.calls._removeRelationships, {
      callId: args.callId,
    });

    // Delete from Supabase
    await db.delete("calls", args.callId);

    try {
      await ctx.runMutation(internal.calls._removeSideEffects, {
        callId: args.callId,
        organizationId: args.organizationId,
        deletedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[calls.remove] Side effects FAILED for call", args.callId, ":", e);
    }

    return args.callId;
  },
});

export const _removeRelationships = internalMutation({
  args: { callId: v.string() },
  handler: async (ctx, args) => {
    const sourceRels = await ctx.db
      .query("objectRelationships")
      .withIndex("by_source", (q) =>
        q.eq("sourceType", "call").eq("sourceId", args.callId)
      )
      .collect();
    for (const rel of sourceRels) {
      await ctx.db.delete(rel._id);
    }
  },
});

export const _removeSideEffects = internalMutation({
  args: {
    callId: v.string(),
    organizationId: v.id("organizations"),
    deletedBy: v.string(),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "call",
      entityId: args.callId,
      action: "deleted",
      description: `Deleted call`,
      performedBy: args.deletedBy as Id<"users">,
    });
  },
});
