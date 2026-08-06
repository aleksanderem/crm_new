import { v } from "convex/values";
import { action, internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";

// List all users with their platform-admin flag. Used by the /admin/users
// page to render the toggle. Platform admin only — this exposes user emails
// across the entire deployment.
export const list = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runQuery(internal._helpers.authAction.verifyPlatformAdmin, {});
    const db = createSupabaseDb();
    const users = await db.query("users").collect();
    return users
      .map((u) => ({
        _id: u._id,
        name: u.name ?? null,
        email: u.email ?? null,
        isPlatformAdmin: Boolean(u.isPlatformAdmin),
      }))
      .sort((a, b) => {
        // Platform admins first, then alphabetical by email
        if (a.isPlatformAdmin !== b.isPlatformAdmin) {
          return a.isPlatformAdmin ? -1 : 1;
        }
        return (a.email ?? "").localeCompare(b.email ?? "");
      });
  },
});

// Toggle isPlatformAdmin for a target user. Platform admin only. Prevents
// removing the last platform admin (would lock the system out of /admin).
export const setRole = action({
  args: {
    userId: v.id("users"),
    isPlatformAdmin: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId: actorId } = await ctx.runQuery(
      internal._helpers.authAction.verifyPlatformAdmin,
      {},
    );

    if (!args.isPlatformAdmin) {
      // About to demote someone — ensure at least one platform admin remains.
      const db = createSupabaseDb();
      const allUsers = await db.query("users").collect();
      const remainingAdmins = allUsers.filter(
        (u) => u.isPlatformAdmin && String(u._id) !== String(args.userId),
      );
      if (remainingAdmins.length === 0) {
        throw new Error(
          "Cannot remove the last platform admin — promote another user first.",
        );
      }
    }

    const db = createSupabaseDb();
    const target = await db.get("users", String(args.userId));
    if (!target) throw new Error("User not found");

    await db.patch("users", String(args.userId), {
      isPlatformAdmin: args.isPlatformAdmin,
    });
    // Dual-write to Convex so requirePlatformAdmin (ctx.db.get path) stays in sync.
    await ctx.runMutation(internal.platformAdmins._patchAdminInConvex, {
      userId: args.userId,
      isPlatformAdmin: args.isPlatformAdmin,
    });
    return {
      userId: args.userId,
      isPlatformAdmin: args.isPlatformAdmin,
      actorId,
    };
  },
});

// Convex-side patch called by setRole to keep ctx.db in sync with the
// Supabase write. Required because requirePlatformAdmin reads from ctx.db.
export const _patchAdminInConvex = internalMutation({
  args: {
    userId: v.id("users"),
    isPlatformAdmin: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { isPlatformAdmin: args.isPlatformAdmin });
  },
});

// Supabase-side patch called by _grantPlatformAdmin (internalMutation) which
// cannot reach Supabase directly (V8 runtime). Scheduled via ctx.scheduler.
export const _syncAdminFlagToSupabase = internalAction({
  args: {
    userId: v.string(),
    isPlatformAdmin: v.boolean(),
  },
  handler: async (_ctx, args) => {
    const db = createSupabaseDb();
    await db.patch("users", args.userId, { isPlatformAdmin: args.isPlatformAdmin });
  },
});
