import { SignJWT } from "jose";
import { v } from "convex/values";
import { action, internalQuery } from "@cvx/_generated/server";
import { auth } from "@cvx/auth";
import { internal } from "@cvx/_generated/api";
import { SUPABASE_JWT_SECRET } from "@cvx/env";

// Internal query: get authenticated user for use from actions
export const _getCurrentUser = internalQuery({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;
    return ctx.db.get(userId);
  },
});

// Internal query: verify org membership for use from actions
export const _verifyOrgMembership = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Not authenticated");

    const membership = await ctx.db
      .query("teamMemberships")
      .withIndex("by_orgAndUser", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", user._id)
      )
      .unique();

    if (!membership) throw new Error("Not a member of this organization");
    return { userId: user._id, membershipId: membership._id };
  },
});

export const mintSupabaseToken = action({
  args: { organizationId: v.id("organizations") },
  returns: v.object({ token: v.string(), expiresAt: v.number() }),
  handler: async (ctx, args): Promise<{ token: string; expiresAt: number }> => {
    // Verify auth + org membership via internal queries
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore -- TS2589: type instantiation depth in generated api types
    const verifyOrgRef = internal.supabase.jwt._verifyOrgMembership;
    const membership: { userId: string; membershipId: string } =
      await ctx.runQuery(verifyOrgRef, {
        organizationId: args.organizationId,
      });

    if (!SUPABASE_JWT_SECRET) {
      throw new Error("SUPABASE_JWT_SECRET not configured");
    }

    const secret = new TextEncoder().encode(SUPABASE_JWT_SECRET);
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 3600; // 1 hour

    const token: string = await new SignJWT({
      sub: membership.userId as string,
      org_id: args.organizationId as string,
      role: "authenticated",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer("supabase")
      .setIssuedAt(now)
      .setExpirationTime(expiresAt)
      .sign(secret);

    console.info(
      `JWT minted for user=${membership.userId} org=${args.organizationId}`
    );

    return { token, expiresAt };
  },
});
