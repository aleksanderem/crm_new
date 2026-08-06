import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { logActivity } from "./_helpers/activities";
import { callOutcomeValidator } from "@cvx/schema";
import { Id } from "./_generated/dataModel";

// Dual-write refs removed — Supabase is now primary for call writes

export const list = action({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    outcome: v.optional(callOutcomeValidator),
    dateFrom: v.optional(v.number()),
    dateTo: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "calls", action: "view" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    let q = db
      .query<{ createdBy: string }>("calls")
      .eq("organizationId", String(args.organizationId));
    if (args.outcome) q = q.eq("outcome", args.outcome);
    if (args.dateFrom !== undefined) q = q.gte("callDate", args.dateFrom);
    if (args.dateTo !== undefined) q = q.lte("callDate", args.dateTo);
    if (perm.scope === "own") q = q.eq("createdBy", String(authResult.userId));

    const rows = await q
      .order("callDate", false)
      .take(args.paginationOpts.numItems)
      .collect();

    return { page: rows, isDone: true, continueCursor: "" };
  },
});

export const _getRelationshipsBySource = internalQuery({
  args: { callId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("objectRelationships")
      .withIndex("by_source", (q) =>
        q.eq("sourceType", "call").eq("sourceId", args.callId)
      )
      .collect();
  },
});

export const getById = action({
  args: {
    organizationId: v.id("organizations"),
    callId: v.string(),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "calls", action: "view" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const call = await db.get<{ organizationId: string; createdBy: string }>(
      "calls",
      args.callId,
    );
    if (!call || String(call.organizationId) !== String(args.organizationId)) {
      throw new Error("Call not found");
    }
    if (perm.scope === "own" && String(call.createdBy) !== String(authResult.userId)) {
      throw new Error("Permission denied");
    }

    const relationships = await ctx.runQuery(
      internal.calls._getRelationshipsBySource,
      { callId: args.callId },
    );

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
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
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
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
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
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
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
