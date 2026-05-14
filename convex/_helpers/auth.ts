import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { auth } from "@cvx/auth";

export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const userId = await auth.getUserId(ctx);
  if (!userId) return null;
  const user = await ctx.db.get(userId);
  return user;
}

export async function requireUser(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);
  if (!user) throw new Error("Not authenticated");
  return user;
}

export async function verifyOrgAccess(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">
) {
  const user = await requireUser(ctx);

  const membership = await ctx.db
    .query("teamMemberships")
    .withIndex("by_orgAndUser", (q) =>
      q.eq("organizationId", organizationId).eq("userId", user._id)
    )
    .unique();

  if (!membership) throw new Error("Not a member of this organization");

  return { user, membership };
}

export async function requireOrgAdmin(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">
) {
  const { user, membership } = await verifyOrgAccess(ctx, organizationId);
  if (membership.role !== "owner" && membership.role !== "admin") {
    throw new Error("Admin access required");
  }
  return { user, membership };
}

// Platform-level admin guard. Used by /admin pages and the platformSettings
// mutation. Distinct from organization roles — a platform admin can configure
// global settings (e.g. invitation From address) regardless of org membership.
export async function requirePlatformAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await requireUser(ctx);
  if (!user.isPlatformAdmin) {
    throw new Error("Platform admin access required");
  }
  return user;
}
