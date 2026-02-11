import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess, requireOrgAdmin } from "./_helpers/auth";

export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("oauthConnections")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

export const getByProvider = query({
  args: {
    organizationId: v.id("organizations"),
    provider: v.literal("google"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("oauthConnections")
      .withIndex("by_orgAndProvider", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("provider", args.provider)
          .eq("isActive", true)
      )
      .first();
  },
});

export const deactivate = mutation({
  args: {
    organizationId: v.id("organizations"),
    connectionId: v.id("oauthConnections"),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);

    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.organizationId !== args.organizationId) {
      throw new Error("Connection not found");
    }

    await ctx.db.patch(args.connectionId, {
      isActive: false,
      updatedAt: Date.now(),
    });
  },
});

// --- Internal functions for backend use ---

export const getActiveGoogle = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("oauthConnections")
      .withIndex("by_orgAndProvider", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("provider", "google")
          .eq("isActive", true)
      )
      .first();
  },
});

export const createOrUpdate = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    providerAccountId: v.string(),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),
    scope: v.string(),
    tokenType: v.string(),
    connectedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Deactivate any existing active Google connections for this org
    const existing = await ctx.db
      .query("oauthConnections")
      .withIndex("by_orgAndProvider", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("provider", "google")
          .eq("isActive", true)
      )
      .collect();

    for (const conn of existing) {
      await ctx.db.patch(conn._id, { isActive: false, updatedAt: now });
    }

    return await ctx.db.insert("oauthConnections", {
      organizationId: args.organizationId,
      provider: "google",
      providerAccountId: args.providerAccountId,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      expiresAt: args.expiresAt,
      scope: args.scope,
      tokenType: args.tokenType,
      isActive: true,
      connectedBy: args.connectedBy,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateTokens = internalMutation({
  args: {
    connectionId: v.id("oauthConnections"),
    accessToken: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectionId, {
      accessToken: args.accessToken,
      expiresAt: args.expiresAt,
      updatedAt: Date.now(),
    });
  },
});
