import { v } from "convex/values";
import {
  mutation,
  internalMutation,
  query,
} from "./_generated/server";
import { requirePlatformAdmin, getCurrentUser } from "./_helpers/auth";

const MAX_STACK = 8000;
const MAX_ARGS = 4000;
const MAX_MESSAGE = 4000;

function clip(s: string | undefined, n: number) {
  if (!s) return s;
  return s.length > n ? s.slice(0, n) + "…[truncated]" : s;
}

// Public-facing endpoint for the FRONTEND to report errors. No platform-admin
// guard — we want every user's browser to be able to push errors. We DO bind
// the userId server-side from the session, so reporters can't impersonate.
export const record = mutation({
  args: {
    source: v.union(v.literal("convex"), v.literal("frontend")),
    scope: v.optional(v.string()),
    fnName: v.optional(v.string()),
    level: v.optional(v.union(v.literal("error"), v.literal("warn"))),
    message: v.string(),
    stack: v.optional(v.string()),
    url: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    argsJson: v.optional(v.string()),
    requestId: v.optional(v.string()),
    organizationId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    return await ctx.db.insert("errorLogs", {
      ts: Date.now(),
      source: args.source,
      scope: args.scope,
      fnName: args.fnName,
      level: args.level ?? "error",
      message: clip(args.message, MAX_MESSAGE)!,
      stack: clip(args.stack, MAX_STACK),
      url: args.url,
      userAgent: args.userAgent,
      userId: user?._id,
      organizationId: args.organizationId,
      argsJson: clip(args.argsJson, MAX_ARGS),
      requestId: args.requestId,
    });
  },
});

// Internal variant for server-side callers (HOC logError helper). Same shape
// minus auth binding — caller passes userId/organizationId if known.
export const _recordInternal = internalMutation({
  args: {
    source: v.union(v.literal("convex"), v.literal("frontend")),
    scope: v.optional(v.string()),
    fnName: v.optional(v.string()),
    level: v.optional(v.union(v.literal("error"), v.literal("warn"))),
    message: v.string(),
    stack: v.optional(v.string()),
    argsJson: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    organizationId: v.optional(v.id("organizations")),
    requestId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("errorLogs", {
      ts: Date.now(),
      source: args.source,
      scope: args.scope,
      fnName: args.fnName,
      level: args.level ?? "error",
      message: clip(args.message, MAX_MESSAGE)!,
      stack: clip(args.stack, MAX_STACK),
      userId: args.userId,
      organizationId: args.organizationId,
      argsJson: clip(args.argsJson, MAX_ARGS),
      requestId: args.requestId,
    });
  },
});

// Platform-admin only — list recent errors. Hydrates the userId field
// with email so the admin UI doesn't need to round-trip per row.
export const list = query({
  args: {
    limit: v.optional(v.number()),
    scope: v.optional(v.string()),
    source: v.optional(v.union(v.literal("convex"), v.literal("frontend"))),
    sinceTs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    const limit = Math.min(args.limit ?? 100, 500);

    let rows;
    if (args.scope) {
      const q = ctx.db
        .query("errorLogs")
        .withIndex("by_scope_ts", (q) => q.eq("scope", args.scope!));
      rows = await q.order("desc").take(limit);
    } else {
      const q = ctx.db.query("errorLogs").withIndex("by_ts");
      rows = await q.order("desc").take(limit);
    }

    const filtered = rows.filter((r) => {
      if (args.source && r.source !== args.source) return false;
      if (args.sinceTs && r.ts < args.sinceTs) return false;
      return true;
    });

    const userIds = Array.from(
      new Set(filtered.map((r) => r.userId).filter((v): v is NonNullable<typeof v> => Boolean(v))),
    );
    const users = await Promise.all(userIds.map((id) => ctx.db.get(id)));
    const userMap = new Map(
      users.filter((u): u is NonNullable<typeof u> => u !== null).map((u) => [u._id, { name: u.name ?? null, email: u.email ?? null }]),
    );

    return filtered.map((r) => ({
      ...r,
      _user: r.userId ? userMap.get(r.userId) ?? null : null,
    }));
  },
});

export const get = query({
  args: { id: v.id("errorLogs") },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    const row = await ctx.db.get(args.id);
    if (!row) return null;
    const user = row.userId ? await ctx.db.get(row.userId) : null;
    return {
      ...row,
      _user: user ? { name: user.name ?? null, email: user.email ?? null } : null,
    };
  },
});
