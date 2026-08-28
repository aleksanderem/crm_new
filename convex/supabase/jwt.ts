import { SignJWT } from "jose";
import { v } from "convex/values";
import { action } from "@cvx/_generated/server";
import { auth } from "@cvx/auth";
import { internal } from "@cvx/_generated/api";
import { SUPABASE_JWT_SECRET } from "@cvx/env";
import { createSupabaseDb } from "@cvx/_helpers/supabaseDb";
import { logAudit } from "@cvx/auditLog";

export const mintSupabaseToken = action({
  args: { organizationId: v.string() },
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

    const db = createSupabaseDb();
    const org = await db.get("organizations", String(args.organizationId));
    if (org && (org as { status?: string }).status === "suspended") {
      throw new Error("Organization suspended");
    }

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

/**
 * Mint a user-scoped Supabase JWT with no org context.
 *
 * Used by the bootstrap "my organizations" query in DashboardLayout, which
 * must run before OrgProvider (and therefore before SupabaseProvider) is
 * mounted. The resulting token carries only `sub` — no `org_id` claim — so
 * it works with the user-own SELECT policies on team_memberships and
 * organizations (migration 00102).
 */
export const mintUserToken = action({
  args: {},
  returns: v.object({ token: v.string(), expiresAt: v.number() }),
  handler: async (ctx, _args): Promise<{ token: string; expiresAt: number }> => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.runQuery(internal._helpers.authAction._getAuthUser, { userId });
    if (!user) throw new Error("User not found");

    const db = createSupabaseDb();
    const u = await db.get("users", String(userId));
    if (u && (u as { isSuspended?: boolean }).isSuspended) {
      throw new Error("User suspended");
    }

    if (!SUPABASE_JWT_SECRET) {
      throw new Error("SUPABASE_JWT_SECRET not configured");
    }

    const secret = new TextEncoder().encode(SUPABASE_JWT_SECRET);
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 3600;

    const token: string = await new SignJWT({
      sub: String(userId),
      role: "authenticated",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer("supabase")
      .setIssuedAt(now)
      .setExpirationTime(expiresAt)
      .sign(secret);

    console.info(`User-scoped JWT minted for user=${String(userId)}`);

    return { token, expiresAt };
  },
});

/**
 * Mint a Supabase JWT for read-only support impersonation ("Wejdź jako").
 *
 * Security model:
 * - Guard: caller must be a platform admin (verifyPlatformAdmin).
 * - The JWT carries the TARGET org's `org_id` claim, so Supabase-direct reads
 *   (RLS-filtered by org_id) will return that org's rows.
 * - The `imp: true` claim marks the token as an impersonation token for
 *   auditing and future policy enforcement.
 * - KNOWN LIMITATION: write mutations and Convex-action-backed reads are
 *   unavailable during impersonation by design. Every Convex mutation calls
 *   verifyOrgAccess, which checks teamMemberships for the REAL authenticated
 *   user (the admin). Since the admin is NOT a member of the target org,
 *   verifyOrgAccess throws "Not a member" — write access is structurally
 *   blocked without any special-casing required.
 */
export const mintImpersonationToken = action({
  args: { organizationId: v.string() },
  returns: v.object({ token: v.string(), expiresAt: v.number() }),
  handler: async (ctx, args): Promise<{ token: string; expiresAt: number }> => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore -- TS2589: type instantiation depth in generated api types
    const { userId } = await ctx.runAction(
      internal._helpers.authAction.verifyPlatformAdmin,
      {},
    );

    if (!SUPABASE_JWT_SECRET) {
      throw new Error("SUPABASE_JWT_SECRET not configured");
    }

    const secret = new TextEncoder().encode(SUPABASE_JWT_SECRET);
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 3600; // 1 hour

    const token: string = await new SignJWT({
      sub: String(userId),
      org_id: args.organizationId,
      role: "authenticated",
      imp: true,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer("supabase")
      .setIssuedAt(now)
      .setExpirationTime(expiresAt)
      .sign(secret);

    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: String(userId),
      action: "organization_impersonation_started",
      entityType: "organization",
      entityId: args.organizationId,
    });

    console.info(
      `Impersonation token minted by admin=${String(userId)} for org=${args.organizationId}`,
    );

    return { token, expiresAt };
  },
});
