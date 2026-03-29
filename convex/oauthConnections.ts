import { query, mutation, internalQuery, internalMutation, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { verifyOrgAccess, requireOrgAdmin } from "./_helpers/auth";

/** Strip sensitive tokens from an OAuth connection before returning to the client. */
function stripTokens(c: Doc<"oauthConnections">) {
  return {
    _id: c._id,
    _creationTime: c._creationTime,
    organizationId: c.organizationId,
    provider: c.provider,
    providerAccountId: c.providerAccountId,
    isActive: c.isActive,
    lastSyncedAt: c.lastSyncedAt,
    scope: c.scope,
    connectedBy: c.connectedBy,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const connections = await ctx.db
      .query("oauthConnections")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return connections.map(stripTokens);
  },
});

export const getByProvider = query({
  args: {
    organizationId: v.id("organizations"),
    provider: v.literal("google"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const connection = await ctx.db
      .query("oauthConnections")
      .withIndex("by_orgAndProvider", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("provider", args.provider)
          .eq("isActive", true)
      )
      .first();

    if (!connection) return null;

    return stripTokens(connection);
  },
});

export const getMyGoogleConnection = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    // Try per-user connection first
    const perUser = await ctx.db
      .query("oauthConnections")
      .withIndex("by_userOrgAndProvider", (q) =>
        q
          .eq("userId", user._id)
          .eq("organizationId", args.organizationId)
          .eq("provider", "google")
          .eq("isActive", true)
      )
      .first();
    if (perUser) return perUser;
    // Fall back to org-level connection (legacy, no userId)
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

export const revokeAndDeactivate = action({
  args: {
    organizationId: v.id("organizations"),
    connectionId: v.id("oauthConnections"),
  },
  handler: async (ctx, args) => {
    // Verify the calling user is an admin of this org (auth context propagates to internal queries)
    await ctx.runQuery(internal.oauthConnections.verifyAdminAccess, {
      organizationId: args.organizationId,
    });

    const connection = await ctx.runQuery(internal.oauthConnections.getForRevocation, {
      connectionId: args.connectionId,
      organizationId: args.organizationId,
    });

    if (!connection) {
      throw new Error("Connection not found");
    }

    try {
      const response = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: connection.refreshToken,
        }),
      });

      if (!response.ok) {
        console.warn("Google token revocation failed:", await response.text());
      }
    } catch (error) {
      console.warn("Google token revocation error:", error);
    }

    await ctx.runMutation(internal.oauthConnections.internalDeactivate, {
      connectionId: args.connectionId,
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
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    if (args.userId) {
      // Deactivate existing active Google connections for this user+org
      const existing = await ctx.db
        .query("oauthConnections")
        .withIndex("by_userOrgAndProvider", (q) =>
          q
            .eq("userId", args.userId)
            .eq("organizationId", args.organizationId)
            .eq("provider", "google")
            .eq("isActive", true)
        )
        .collect();

      for (const conn of existing) {
        await ctx.db.patch(conn._id, { isActive: false, updatedAt: now });
      }
    } else {
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
      userId: args.userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getById = internalQuery({
  args: { connectionId: v.id("oauthConnections") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.connectionId);
  },
});

export const verifyAdminAccess = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);
  },
});

export const getForRevocation = internalQuery({
  args: {
    connectionId: v.id("oauthConnections"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.organizationId !== args.organizationId) {
      return null;
    }
    return connection;
  },
});

export const internalDeactivate = internalMutation({
  args: {
    connectionId: v.id("oauthConnections"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectionId, {
      isActive: false,
      updatedAt: Date.now(),
    });
  },
});

export const updateTokens = internalMutation({
  args: {
    connectionId: v.id("oauthConnections"),
    accessToken: v.string(),
    expiresAt: v.number(),
    refreshToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectionId, {
      accessToken: args.accessToken,
      expiresAt: args.expiresAt,
      updatedAt: Date.now(),
      ...(args.refreshToken ? { refreshToken: args.refreshToken } : {}),
    });
  },
});
