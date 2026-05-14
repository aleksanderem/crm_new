import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requirePlatformAdmin } from "./_helpers/auth";

// List all users with their platform-admin flag. Used by the /admin/users
// page to render the toggle. Platform admin only — this exposes user emails
// across the entire deployment.
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requirePlatformAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    return users
      .map((u) => ({
        _id: u._id,
        name: u.name ?? null,
        email: u.email ?? null,
        isPlatformAdmin: Boolean(u.isPlatformAdmin),
        createdAt: u._creationTime,
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
export const setRole = mutation({
  args: {
    userId: v.id("users"),
    isPlatformAdmin: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePlatformAdmin(ctx);

    if (!args.isPlatformAdmin) {
      // About to demote someone — ensure at least one platform admin remains.
      const allAdmins = await ctx.db.query("users").collect();
      const remainingAdmins = allAdmins.filter(
        (u) => u.isPlatformAdmin && u._id !== args.userId,
      );
      if (remainingAdmins.length === 0) {
        throw new Error(
          "Cannot remove the last platform admin — promote another user first.",
        );
      }
    }

    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found");

    await ctx.db.patch(args.userId, { isPlatformAdmin: args.isPlatformAdmin });
    return {
      userId: args.userId,
      isPlatformAdmin: args.isPlatformAdmin,
      actorId: actor._id,
    };
  },
});
