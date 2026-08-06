import { SignJWT } from "jose";
import { v } from "convex/values";
import { action } from "@cvx/_generated/server";
import { internal } from "@cvx/_generated/api";
import { SUPABASE_JWT_SECRET } from "@cvx/env";

export const mintSupabaseToken = action({
  args: { organizationId: v.id("organizations") },
  returns: v.object({ token: v.string(), expiresAt: v.number() }),
  handler: async (ctx, args): Promise<{ token: string; expiresAt: number }> => {
    // Verify auth + org membership via Supabase (authoritative post-migration).
    // teamMemberships lives in Supabase; reading from ctx.db would be stale.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore -- TS2589: type instantiation depth in generated api types
    const membership: { userId: string; membershipId: string } =
      await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
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
