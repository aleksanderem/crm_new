import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { verifyOrgAccess, requireOrgAdmin } from "./_helpers/auth";

// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const writeReasonRef = internal.supabase.lostReasons.writeLostReasonToSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const updateReasonRef = internal.supabase.lostReasons.updateLostReasonInSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const deleteReasonRef = internal.supabase.lostReasons.deleteLostReasonFromSupabase;

export const list = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const reasons = await ctx.db
      .query("lostReasons")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    reasons.sort((a, b) => a.order - b.order);
    return reasons;
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    label: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);
    const now = Date.now();

    const existing = await ctx.db
      .query("lostReasons")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const maxOrder = existing.length > 0 ? Math.max(...existing.map((r) => r.order)) : -1;

    const reasonId = await ctx.db.insert("lostReasons", {
      organizationId: args.organizationId,
      label: args.label,
      order: maxOrder + 1,
      isActive: true,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    // Dual-write: replicate new lost reason to Supabase
    await ctx.scheduler.runAfter(0, writeReasonRef, {
      reasonId: reasonId as string,
      organizationId: args.organizationId as string,
      label: args.label,
      order: maxOrder + 1,
      isActive: true,
      createdBy: user._id as string,
      createdAt: now,
      updatedAt: now,
    });

    return reasonId;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    reasonId: v.id("lostReasons"),
    label: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);

    const reason = await ctx.db.get(args.reasonId);
    if (!reason || reason.organizationId !== args.organizationId) {
      throw new Error("Lost reason not found");
    }

    const { organizationId, reasonId, ...updates } = args;
    const now = Date.now();
    await ctx.db.patch(reasonId, { ...updates, updatedAt: now });

    // Dual-write: replicate update to Supabase
    await ctx.scheduler.runAfter(0, updateReasonRef, {
      reasonId: reasonId as string,
      organizationId: organizationId as string,
      ...updates,
      updatedAt: now,
    });

    return reasonId;
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    reasonId: v.id("lostReasons"),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);

    const reason = await ctx.db.get(args.reasonId);
    if (!reason || reason.organizationId !== args.organizationId) {
      throw new Error("Lost reason not found");
    }

    // Dual-write: schedule delete from Supabase BEFORE removing from Convex
    await ctx.scheduler.runAfter(0, deleteReasonRef, {
      reasonId: args.reasonId as string,
      organizationId: args.organizationId as string,
    });

    await ctx.db.delete(args.reasonId);
    return args.reasonId;
  },
});

export const seed = mutation({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();

    const existing = await ctx.db
      .query("lostReasons")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    if (existing.length > 0) return [];

    const defaults = [
      "Budget constraints",
      "Chose competitor",
      "No response",
      "Timing not right",
      "Requirements changed",
      "Price too high",
      "Other",
    ];
    const ids = [];

    for (let i = 0; i < defaults.length; i++) {
      const id = await ctx.db.insert("lostReasons", {
        organizationId: args.organizationId,
        label: defaults[i],
        order: i,
        isActive: true,
        createdBy: user._id,
        createdAt: now,
        updatedAt: now,
      });
      ids.push(id);
    }

    return ids;
  },
});

export const reorder = mutation({
  args: {
    organizationId: v.id("organizations"),
    reasonIds: v.array(v.id("lostReasons")),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);

    for (let i = 0; i < args.reasonIds.length; i++) {
      const reason = await ctx.db.get(args.reasonIds[i]);
      if (!reason || reason.organizationId !== args.organizationId) {
        throw new Error("Lost reason not found");
      }
      await ctx.db.patch(args.reasonIds[i], { order: i, updatedAt: Date.now() });
    }

    return true;
  },
});
