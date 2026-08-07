import { QueryCtx, internalQuery, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { createSupabaseDb } from "./supabaseDb";

/**
 * Check the seat limit for an organization based on its owner's subscription plan.
 * Returns current seat count, limit, and whether more members can be added.
 *
 * Seat count includes both active teamMemberships AND pending invitations, so that
 * inviting someone immediately occupies a seat before they accept.
 * Pass skipPendingInvitations=true at acceptance time (pending→member is a no-op
 * on the total count, so only members are checked then).
 *
 * If subscription lookup fails, defaults to free tier limit (5 seats).
 */
export async function checkSeatLimit(
  ctx: QueryCtx,
  args: {
    organizationId: Id<"organizations">;
    skipPendingInvitations?: boolean;
  }
): Promise<{
  currentSeats: number;
  seatLimit: number;
  canAddMore: boolean;
}> {
  const members = await ctx.db
    .query("teamMemberships")
    .withIndex("by_organizationId", (q) =>
      q.eq("organizationId", args.organizationId)
    )
    .collect();

  let pendingCount = 0;
  if (!args.skipPendingInvitations) {
    const invitations = await ctx.db
      .query("invitations")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    pendingCount = invitations.filter((inv) => inv.status === "pending").length;
  }

  const currentSeats = members.length + pendingCount;

  const org = await ctx.db.get(args.organizationId);
  if (!org) throw new Error("Organization not found");

  // Find active or trialing subscription for org owner
  const subscription = await ctx.db
    .query("subscriptions")
    .withIndex("userId", (q) => q.eq("userId", org.ownerId))
    .filter((q) =>
      q.or(
        q.eq(q.field("status"), "active"),
        q.eq(q.field("status"), "trialing")
      )
    )
    .first();

  // Fail open: default to free tier limit if subscription data is unavailable.
  let seatLimit = 20; // Default free tier
  if (subscription) {
    const plan = await ctx.db.get(subscription.planId);
    if (plan) {
      seatLimit = plan.seatLimit;
    } else {
      console.warn(
        `[seatLimits] Plan ${subscription.planId} not found for subscription ${subscription._id}. Using default seat limit.`
      );
    }
  } else {
    console.warn(
      `[seatLimits] No active subscription found for org owner ${org.ownerId} (org: ${args.organizationId}). Using default free tier limit.`
    );
  }

  return {
    currentSeats,
    seatLimit,
    canAddMore: currentSeats < seatLimit,
  };
}

// Internal query for Convex-only tables (subscriptions + plans are NOT in
// TABLE_MAP and must be read from ctx.db). Called by checkSeatLimitAction.
// Returns the highest seatLimit across all active/trialing subscriptions so
// that orgs with multiple per-module plans get the most generous limit.
export const _getSubscriptionAndPlanData = internalQuery({
  args: { ownerId: v.id("users") },
  handler: async (ctx, args): Promise<{ seatLimit: number }> => {
    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("userId", (q) => q.eq("userId", args.ownerId))
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "active"),
          q.eq(q.field("status"), "trialing"),
        ),
      )
      .collect();

    if (subscriptions.length === 0) {
      console.warn(
        `[seatLimits] No active subscription found for org owner ${args.ownerId}. Using default free tier limit.`,
      );
      return { seatLimit: 20 };
    }

    let maxSeatLimit: number | null = null;
    for (const sub of subscriptions) {
      const plan = await ctx.db.get(sub.planId);
      if (!plan) {
        console.warn(
          `[seatLimits] Plan ${sub.planId} not found for subscription ${sub._id}. Skipping.`,
        );
        continue;
      }
      if (maxSeatLimit === null || plan.seatLimit > maxSeatLimit) {
        maxSeatLimit = plan.seatLimit;
      }
    }

    // Fall back to free tier only when every plan lookup failed (FK issue, etc.)
    return { seatLimit: maxSeatLimit ?? 20 };
  },
});

// Action-based seat limit check: reads TABLE_MAP tables (teamMemberships,
// invitations, organizations) from Supabase. Call via ctx.runAction from
// action handlers — mutations cannot make HTTP calls, so they must delegate
// this check to the outer action layer instead.
export const checkSeatLimitAction = internalAction({
  args: {
    organizationId: v.id("organizations"),
    skipPendingInvitations: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ currentSeats: number; seatLimit: number; canAddMore: boolean }> => {
    const db = createSupabaseDb();

    const members = await db
      .query("teamMemberships")
      .eq("organizationId", String(args.organizationId))
      .collect();

    let pendingCount = 0;
    if (!args.skipPendingInvitations) {
      const invitations = await db
        .query("invitations")
        .eq("organizationId", String(args.organizationId))
        .collect();
      pendingCount = invitations.filter((inv) => inv.status === "pending").length;
    }

    const currentSeats = members.length + pendingCount;

    const org = await db.get("organizations", String(args.organizationId));
    if (!org) throw new Error("Organization not found");

    const { seatLimit } = await ctx.runQuery(
      internal._helpers.seatLimits._getSubscriptionAndPlanData,
      { ownerId: org.ownerId },
    );

    return { currentSeats, seatLimit, canAddMore: currentSeats < seatLimit };
  },
});
