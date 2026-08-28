/**
 * SP3 Task 1 — Platform-admin read action: getUserDetail.
 *
 * Returns a user's metadata + platform-admin/suspended flags + their
 * organizations & roles.
 *
 * Every action first calls verifyPlatformAdmin to enforce the access guard.
 *
 * Read path: createSupabaseDb().get()/query().collect() returns rows with
 * camelCase keys and `_id` as the primary key (mirrors
 * convex/admin/organizations.ts accessor style exactly).
 *
 * Note: isSuspended reads the field added in Task 2. Until that migration
 * runs the field is absent; Boolean(undefined) = false, so this is safe.
 */

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

const membershipRowValidator = v.object({
  organizationId: v.string(),
  organizationName: v.string(),
  role: v.string(),
  joinedAt: v.number(),
});

const userDetailValidator = v.object({
  userId: v.string(),
  name: v.union(v.string(), v.null()),
  email: v.union(v.string(), v.null()),
  username: v.union(v.string(), v.null()),
  language: v.union(v.string(), v.null()),
  theme: v.union(v.string(), v.null()),
  timezone: v.union(v.string(), v.null()),
  isPlatformAdmin: v.boolean(),
  isSuspended: v.boolean(),
  memberships: v.array(membershipRowValidator),
});

// ---------------------------------------------------------------------------
// getUserDetail
// ---------------------------------------------------------------------------

export const getUserDetail = action({
  args: { userId: v.id("users") },
  returns: userDetailValidator,
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyPlatformAdmin, {});
    const db = createSupabaseDb();
    const user = await db.get("users", String(args.userId));
    if (!user) throw new Error("User not found");
    const memberships = await db
      .query("teamMemberships")
      .eq("userId", String(args.userId))
      .collect();
    const orgIds = [...new Set(memberships.map((m) => String(m.organizationId)))];
    const orgs = await db.getMany("organizations", orgIds);
    const orgName = new Map(orgs.map((o) => [String(o._id), (o.name as string) ?? ""]));
    return {
      userId: String(user._id),
      name: (user.name as string | null) ?? null,
      email: (user.email as string | null) ?? null,
      username: (user.username as string | null) ?? null,
      language: (user.language as string | null) ?? null,
      theme: (user.theme as string | null) ?? null,
      timezone: (user.timezone as string | null) ?? null,
      isPlatformAdmin: Boolean(user.isPlatformAdmin),
      isSuspended: Boolean((user as Record<string, unknown>).isSuspended),
      memberships: memberships
        .map((m) => ({
          organizationId: String(m.organizationId),
          organizationName: orgName.get(String(m.organizationId)) ?? "",
          role: String(m.role),
          joinedAt: Number(m.joinedAt ?? 0),
        }))
        .sort((a, b) => a.organizationName.localeCompare(b.organizationName)),
    };
  },
});
