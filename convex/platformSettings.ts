import { v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { requirePlatformAdmin } from "./_helpers/auth";

// Get the current platform settings (singleton). Returns null if not yet
// configured. Reading is allowed for any authenticated context — the
// invitation-send action needs the From overrides at runtime — so we don't
// guard this with requirePlatformAdmin. There are no secrets in the row.
export const get = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("platformSettings").first();
    return row ?? null;
  },
});

// Internal variant for server-side callers (e.g. the invitation send action).
// Same shape — separate so we can keep `get` public without worrying about
// circular auth dependencies.
export const _getInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("platformSettings").first();
    return row ?? null;
  },
});

// Upsert the singleton settings row. Platform admin only.
// The frontend admin form (PR #295+) sends the full set of fields each save;
// undefined keys clear the override and fall back to env-based defaults.
export const set = mutation({
  args: {
    invitationFromName: v.optional(v.string()),
    invitationFromEmail: v.optional(v.string()),
    invitationReplyToEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePlatformAdmin(ctx);
    const existing = await ctx.db.query("platformSettings").first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        invitationFromName: args.invitationFromName,
        invitationFromEmail: args.invitationFromEmail,
        invitationReplyToEmail: args.invitationReplyToEmail,
        updatedAt: now,
        updatedBy: user._id,
      });
      return existing._id;
    }
    return await ctx.db.insert("platformSettings", {
      invitationFromName: args.invitationFromName,
      invitationFromEmail: args.invitationFromEmail,
      invitationReplyToEmail: args.invitationReplyToEmail,
      updatedAt: now,
      updatedBy: user._id,
    });
  },
});

// Bootstrap helper — grants the platform-admin role to a user by email.
// Intended to be called via `npx convex run` (requires admin token), exactly
// once per environment, to seed the first platform admin. Subsequent admins
// can be granted via the admin UI once one exists.
export const _grantPlatformAdmin = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .unique();
    if (!user) throw new Error(`No user found for email ${args.email}`);
    await ctx.db.patch(user._id, { isPlatformAdmin: true });
    return { userId: user._id, email: args.email };
  },
});
