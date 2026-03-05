import { QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Check the seat limit for an organization based on its owner's subscription plan.
 * Returns current seat count, limit, and whether more members can be added.
 *
 * Seat count is based on active teamMemberships only (not pending invitations).
 * If subscription lookup fails, defaults to free tier limit (5 seats).
 */
export async function checkSeatLimit(
  ctx: QueryCtx,
  args: {
    organizationId: Id<"organizations">;
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

  const currentSeats = members.length;

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

  let seatLimit = 5; // Default free tier
  if (subscription) {
    const plan = await ctx.db.get(subscription.planId);
    if (plan) seatLimit = plan.seatLimit;
  }

  return {
    currentSeats,
    seatLimit,
    canAddMore: currentSeats < seatLimit,
  };
}
