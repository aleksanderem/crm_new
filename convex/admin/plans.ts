/**
 * SP4 Task 1 — Platform-admin plans list + update actions.
 *
 * `plans` is Convex-only (NOT in Supabase TABLE_MAP). All reads and writes
 * go through ctx.db inside internalQuery / internalMutation. The public
 * actions guard with verifyPlatformAdmin first (which reads Supabase), then
 * delegate to the internal helpers via ctx.runQuery / ctx.runMutation.
 *
 * updatePlan may ONLY patch name / description / seatLimit.
 * key, productKey, stripeId, and prices are NEVER mutated here.
 */

import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";

type PlanRow = {
  _id: string;
  key: string;
  productKey: string | null;
  name: string;
  description: string;
  seatLimit: number;
  stripeId: string;
  prices: unknown;
};

// ---------------------------------------------------------------------------
// Internal query — reads plans from Convex ctx.db
// ---------------------------------------------------------------------------

export const _listPlans = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.string(),
      key: v.string(),
      productKey: v.union(v.string(), v.null()),
      name: v.string(),
      description: v.string(),
      seatLimit: v.number(),
      stripeId: v.string(),
      prices: v.any(),
    }),
  ),
  handler: async (ctx) => {
    const plans = await ctx.db.query("plans").collect();
    return plans.map((p) => ({
      _id: String(p._id),
      key: p.key,
      productKey: p.productKey ?? null,
      name: p.name,
      description: p.description,
      seatLimit: p.seatLimit,
      stripeId: p.stripeId,
      prices: p.prices, // read-only display
    }));
  },
});

// ---------------------------------------------------------------------------
// Internal mutation — patches plans in Convex ctx.db
// ---------------------------------------------------------------------------

export const _updatePlan = internalMutation({
  args: {
    planId: v.id("plans"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    seatLimit: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.description !== undefined) patch.description = args.description;
    if (args.seatLimit !== undefined) patch.seatLimit = args.seatLimit;
    await ctx.db.patch(args.planId, patch);
  },
});

// ---------------------------------------------------------------------------
// Public action: listPlans
// ---------------------------------------------------------------------------

export const listPlans = action({
  args: {},
  returns: v.array(
    v.object({
      _id: v.string(),
      key: v.string(),
      productKey: v.union(v.string(), v.null()),
      name: v.string(),
      description: v.string(),
      seatLimit: v.number(),
      stripeId: v.string(),
      prices: v.any(),
    }),
  ),
  handler: async (ctx): Promise<PlanRow[]> => {
    await ctx.runAction(internal._helpers.authAction.verifyPlatformAdmin, {});
    return await ctx.runQuery(internal.admin.plans._listPlans, {});
  },
});

// ---------------------------------------------------------------------------
// Public action: updatePlan
// ---------------------------------------------------------------------------

export const updatePlan = action({
  args: {
    planId: v.id("plans"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    seatLimit: v.optional(v.number()),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const { userId } = await ctx.runAction(
      internal._helpers.authAction.verifyPlatformAdmin,
      {},
    );

    if (
      args.seatLimit !== undefined &&
      !(Number.isInteger(args.seatLimit) && args.seatLimit > 0)
    ) {
      throw new Error("seatLimit must be a positive integer");
    }

    await ctx.runMutation(internal.admin.plans._updatePlan, {
      planId: args.planId,
      name: args.name,
      description: args.description,
      seatLimit: args.seatLimit,
    });

    console.info(
      `[admin/plans] plan_updated planId=${args.planId} by=${userId}`,
    );

    return { ok: true };
  },
});
