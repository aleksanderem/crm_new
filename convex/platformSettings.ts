import { v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requirePlatformAdmin } from "./_helpers/auth";
import { createSupabaseDb } from "./_helpers/supabaseDb";

// Get the current platform settings (singleton). Returns null if not yet
// configured. Reading is allowed for any authenticated context but API key
// values are masked — only `hasResendApiKey` / `hasMailgunApiKey` booleans
// are returned. The internal variant below returns full row for server use.
export const get = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("platformSettings").first();
    if (!row) return null;
    const { resendApiKey, mailgunApiKey, ...safe } = row;
    return {
      ...safe,
      hasResendApiKey: Boolean(resendApiKey),
      hasMailgunApiKey: Boolean(mailgunApiKey),
    };
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
// The frontend admin form sends the full set of fields each save;
// undefined keys clear the override and fall back to env-based defaults.
export const set = mutation({
  args: {
    invitationFromName: v.optional(v.string()),
    invitationFromEmail: v.optional(v.string()),
    invitationReplyToEmail: v.optional(v.string()),
    provider: v.optional(
      v.union(v.literal("resend"), v.literal("mailgun")),
    ),
    resendApiKey: v.optional(v.string()),
    mailgunApiKey: v.optional(v.string()),
    mailgunDomain: v.optional(v.string()),
    mailgunRegion: v.optional(
      v.union(v.literal("us"), v.literal("eu")),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requirePlatformAdmin(ctx);
    const existing = await ctx.db.query("platformSettings").first();
    const now = Date.now();
    // API key fields: undefined in args = "don't touch" (preserve existing);
    // explicit empty string from the form is treated the same as undefined
    // (no accidental clearing). To clear a key, use the dedicated future
    // "Remove key" button (out of scope here).
    const resendApiKey =
      args.resendApiKey && args.resendApiKey.length > 0
        ? args.resendApiKey
        : existing?.resendApiKey;
    const mailgunApiKey =
      args.mailgunApiKey && args.mailgunApiKey.length > 0
        ? args.mailgunApiKey
        : existing?.mailgunApiKey;
    const payload = {
      invitationFromName: args.invitationFromName,
      invitationFromEmail: args.invitationFromEmail,
      invitationReplyToEmail: args.invitationReplyToEmail,
      provider: args.provider,
      resendApiKey,
      mailgunApiKey,
      mailgunDomain: args.mailgunDomain,
      mailgunRegion: args.mailgunRegion,
      updatedAt: now,
      updatedBy: user._id,
    };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("platformSettings", payload);
  },
});

// Bootstrap helper — grants the platform-admin role to a user by email.
// Intended to be called via `npx convex run` (requires admin token), exactly
// once per environment, to seed the first platform admin. Subsequent admins
// can be granted via the admin UI once one exists.
export const _grantPlatformAdmin = internalAction({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();
    const user = await db.query("users").eq("email", args.email).unique();
    if (!user) throw new Error(`No user found for email ${args.email}`);
    await db.patch("users", String(user._id), { isPlatformAdmin: true });
    // Keep Convex in sync — requirePlatformAdmin reads isPlatformAdmin from ctx.db.
    await ctx.runMutation(internal.platformAdmins._patchAdminInConvex, {
      userId: user._id,
      isPlatformAdmin: true,
    });
    return { userId: user._id, email: args.email };
  },
});
