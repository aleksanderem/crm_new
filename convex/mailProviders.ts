import { query, mutation, action } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";
import { api, internal } from "./_generated/api";

// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const writeProviderRef = internal.supabase.mailProviders.writeMailProviderToSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const updateProviderRef = internal.supabase.mailProviders.updateMailProviderInSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const deleteProviderRef = internal.supabase.mailProviders.deleteMailProviderFromSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const getByIdRef = api.mailProviders.getById;

const providerTypeValidator = v.union(
  v.literal("google"),
  v.literal("microsoft"),
  v.literal("mailgun"),
  v.literal("resend"),
);

const capabilitiesValidator = v.object({
  canSend: v.boolean(),
  canReceive: v.boolean(),
  canSync: v.boolean(),
});

export const list = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const providers = await ctx.db
      .query("mailProviders")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    return providers.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    providerId: v.id("mailProviders"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const provider = await ctx.db.get(args.providerId);
    if (!provider || provider.organizationId !== args.organizationId) {
      throw new Error("Mail provider not found");
    }

    return provider;
  },
});

export const getDefault = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    return await ctx.db
      .query("mailProviders")
      .withIndex("by_org_default", (q) =>
        q.eq("organizationId", args.organizationId).eq("isDefault", true)
      )
      .first();
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    providerType: providerTypeValidator,
    fromName: v.string(),
    fromEmail: v.string(),
    replyToEmail: v.optional(v.string()),
    apiConfig: v.optional(
      v.object({
        apiKey: v.optional(v.string()),
        domain: v.optional(v.string()),
        region: v.optional(v.string()),
      })
    ),
    oauthTokens: v.optional(
      v.object({
        accessToken: v.string(),
        refreshToken: v.optional(v.string()),
        expiresAt: v.optional(v.number()),
        scope: v.optional(v.string()),
      })
    ),
    capabilities: capabilitiesValidator,
    isShared: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const now = Date.now();

    // Check if this is the first provider for the org
    const existing = await ctx.db
      .query("mailProviders")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .first();
    const isFirst = existing === null;

    // Determine initial status
    const isOAuthProvider =
      args.providerType === "google" || args.providerType === "microsoft";
    const hasOAuthTokens = !!args.oauthTokens?.accessToken;
    const status =
      isOAuthProvider && !hasOAuthTokens ? "pending_auth" : "active";

    const providerId = await ctx.db.insert("mailProviders", {
      organizationId: args.organizationId,
      name: args.name,
      providerType: args.providerType,
      fromName: args.fromName,
      fromEmail: args.fromEmail,
      replyToEmail: args.replyToEmail,
      apiConfig: args.apiConfig,
      oauthTokens: args.oauthTokens,
      capabilities: args.capabilities,
      isDefault: isFirst,
      isShared: args.isShared ?? false,
      status,
      createdAt: now,
      updatedAt: now,
    });

    // Dual-write: replicate new provider to Supabase
    await ctx.scheduler.runAfter(0, writeProviderRef, {
      providerId: providerId as string,
      organizationId: args.organizationId as string,
      name: args.name,
      providerType: args.providerType,
      oauthTokens: args.oauthTokens,
      apiConfig: args.apiConfig,
      fromName: args.fromName,
      fromEmail: args.fromEmail,
      replyToEmail: args.replyToEmail,
      capabilities: args.capabilities,
      isDefault: isFirst,
      isShared: args.isShared ?? false,
      status,
      createdAt: now,
      updatedAt: now,
    });

    return providerId;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    providerId: v.id("mailProviders"),
    name: v.optional(v.string()),
    fromName: v.optional(v.string()),
    fromEmail: v.optional(v.string()),
    replyToEmail: v.optional(v.string()),
    apiConfig: v.optional(
      v.object({
        apiKey: v.optional(v.string()),
        domain: v.optional(v.string()),
        region: v.optional(v.string()),
      })
    ),
    capabilities: v.optional(capabilitiesValidator),
    isShared: v.optional(v.boolean()),
    assignedUserIds: v.optional(v.array(v.id("users"))),
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("pending_auth"),
        v.literal("error"),
        v.literal("inactive"),
      )
    ),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const provider = await ctx.db.get(args.providerId);
    if (!provider || provider.organizationId !== args.organizationId) {
      throw new Error("Mail provider not found");
    }

    const { organizationId: _orgId, providerId, ...fields } = args;

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        patch[key] = value;
      }
    }

    await ctx.db.patch(providerId, patch);

    // Dual-write: replicate update to Supabase
    await ctx.scheduler.runAfter(0, updateProviderRef, {
      providerId: providerId as string,
      organizationId: args.organizationId as string,
      name: args.name,
      fromName: args.fromName,
      fromEmail: args.fromEmail,
      replyToEmail: args.replyToEmail,
      apiConfig: args.apiConfig,
      capabilities: args.capabilities,
      isShared: args.isShared,
      assignedUserIds: args.assignedUserIds?.map((id) => id as string),
      status: args.status,
      updatedAt: patch.updatedAt as number,
    });

    return providerId;
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    providerId: v.id("mailProviders"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const provider = await ctx.db.get(args.providerId);
    if (!provider || provider.organizationId !== args.organizationId) {
      throw new Error("Mail provider not found");
    }

    // Dual-write: schedule delete BEFORE Convex delete (Knowledge Pattern #4)
    await ctx.scheduler.runAfter(0, deleteProviderRef, {
      providerId: args.providerId as string,
      organizationId: args.organizationId as string,
    });

    await ctx.db.delete(args.providerId);

    // If this was the default, assign default to another provider if any remain
    if (provider.isDefault) {
      const remaining = await ctx.db
        .query("mailProviders")
        .withIndex("by_org", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .first();

      if (remaining) {
        await ctx.db.patch(remaining._id, {
          isDefault: true,
          updatedAt: Date.now(),
        });
      }
    }

    return args.providerId;
  },
});

export const setDefault = mutation({
  args: {
    organizationId: v.id("organizations"),
    providerId: v.id("mailProviders"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const provider = await ctx.db.get(args.providerId);
    if (!provider || provider.organizationId !== args.organizationId) {
      throw new Error("Mail provider not found");
    }

    const now = Date.now();

    // Unset isDefault on all other providers for this org
    const allProviders = await ctx.db
      .query("mailProviders")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    for (const p of allProviders) {
      if (p._id !== args.providerId && p.isDefault) {
        await ctx.db.patch(p._id, { isDefault: false, updatedAt: now });
      }
    }

    // Set the target as default
    await ctx.db.patch(args.providerId, { isDefault: true, updatedAt: now });

    // Dual-write: replicate setDefault to Supabase
    await ctx.scheduler.runAfter(0, updateProviderRef, {
      providerId: args.providerId as string,
      organizationId: args.organizationId as string,
      isDefault: true,
      updatedAt: now,
    });

    return args.providerId;
  },
});

export const testConnection = action({
  args: {
    organizationId: v.id("organizations"),
    providerId: v.id("mailProviders"),
  },
  handler: async (ctx, args) => {
    const provider = await ctx.runQuery(getByIdRef, {
      organizationId: args.organizationId,
      providerId: args.providerId,
    });

    let result: { success: boolean; error?: string; accountEmail?: string };

    try {
      if (provider.providerType === "mailgun") {
        const { createMailgunAdapter } = await import("./mail/adapters/mailgun");
        const adapter = createMailgunAdapter(
          provider.apiConfig?.apiKey ?? "",
          provider.apiConfig?.domain ?? "",
          provider.fromEmail,
          provider.fromName,
          provider.apiConfig?.region ?? "us",
        );
        result = adapter.testConnection
          ? await adapter.testConnection()
          : { success: true, accountEmail: provider.fromEmail };
      } else if (provider.providerType === "google") {
        const { createGoogleAdapter } = await import("./mail/adapters/google");
        const adapter = createGoogleAdapter(
          provider.oauthTokens?.accessToken ?? "",
          provider.oauthTokens?.refreshToken ?? "",
          provider.fromEmail,
          provider.fromName,
          process.env.GOOGLE_CLIENT_ID ?? "",
          process.env.GOOGLE_CLIENT_SECRET ?? "",
          provider.oauthTokens?.expiresAt ?? 0,
        );
        result = adapter.testConnection
          ? await adapter.testConnection()
          : { success: true, accountEmail: provider.fromEmail };
      } else if (provider.providerType === "microsoft") {
        const { createMicrosoftAdapter } = await import("./mail/adapters/microsoft");
        const adapter = createMicrosoftAdapter(
          provider.oauthTokens?.accessToken ?? "",
          provider.oauthTokens?.refreshToken ?? "",
          provider.fromEmail,
          provider.fromName,
        );
        result = adapter.testConnection
          ? await adapter.testConnection()
          : { success: true, accountEmail: provider.fromEmail };
      } else {
        // Resend has no testConnection — check that API key is present
        result = provider.apiConfig?.apiKey
          ? { success: true, accountEmail: provider.fromEmail }
          : { success: false, error: "Missing API key" };
      }
    } catch (err) {
      result = { success: false, error: String(err) };
    }

    // Update provider status based on test result
    if (result.success && provider.status !== "active") {
      await ctx.runMutation(api.mailProviders.update, {
        organizationId: args.organizationId,
        providerId: args.providerId,
        status: "active",
      });
    } else if (!result.success && provider.status === "active") {
      await ctx.runMutation(api.mailProviders.update, {
        organizationId: args.organizationId,
        providerId: args.providerId,
        status: "error",
      });
    }

    return { ...result, providerId: args.providerId };
  },
});
