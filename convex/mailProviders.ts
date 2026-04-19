import { query, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

// Dual-write refs removed — Supabase is now primary for mail provider writes

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

export const create = action({
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
    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const now = Date.now();
    const db = createSupabaseDb();

    // Check if this is the first provider for the org
    const existing = await db.query("mailProviders")
      .eq("organizationId", String(args.organizationId))
      .first();
    const isFirst = existing === null;

    // Determine initial status
    const isOAuthProvider =
      args.providerType === "google" || args.providerType === "microsoft";
    const hasOAuthTokens = !!args.oauthTokens?.accessToken;
    const status =
      isOAuthProvider && !hasOAuthTokens ? "pending_auth" : "active";

    const providerId = await db.insert("mailProviders", {
      organizationId: String(args.organizationId),
      name: args.name,
      providerType: args.providerType,
      fromName: args.fromName,
      fromEmail: args.fromEmail,
      replyToEmail: args.replyToEmail ?? null,
      apiConfig: args.apiConfig ?? null,
      oauthTokens: args.oauthTokens ?? null,
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

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    providerId: v.string(),
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
    assignedUserIds: v.optional(v.array(v.string())),
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
    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();

    const provider = await db.get("mailProviders", args.providerId);
    if (!provider || String(provider.organizationId) !== String(args.organizationId)) {
      throw new Error("Mail provider not found");
    }

    const { organizationId: _orgId, providerId, ...fields } = args;

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        patch[key] = value;
      }
    }

    await db.patch("mailProviders", providerId, patch);

    return providerId;
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    providerId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();

    const provider = await db.get("mailProviders", args.providerId);
    if (!provider || String(provider.organizationId) !== String(args.organizationId)) {
      throw new Error("Mail provider not found");
    }

    await db.delete("mailProviders", args.providerId);

    // If this was the default, assign default to another provider if any remain
    if (provider.isDefault) {
      const remaining = await db.query("mailProviders")
        .eq("organizationId", String(args.organizationId))
        .first();

      if (remaining) {
        await db.patch("mailProviders", remaining._id as string, {
          isDefault: true,
          updatedAt: Date.now(),
        });
      }
    }

    return args.providerId;
  },
});

export const setDefault = action({
  args: {
    organizationId: v.id("organizations"),
    providerId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();

    const provider = await db.get("mailProviders", args.providerId);
    if (!provider || String(provider.organizationId) !== String(args.organizationId)) {
      throw new Error("Mail provider not found");
    }

    const now = Date.now();

    // Unset isDefault on all other providers for this org
    const allProviders = await db.query("mailProviders")
      .eq("organizationId", String(args.organizationId))
      .collect();

    for (const p of allProviders) {
      if ((p._id as string) !== args.providerId && p.isDefault) {
        await db.patch("mailProviders", p._id as string, {
          isDefault: false,
          updatedAt: now,
        });
      }
    }

    // Set the target as default
    await db.patch("mailProviders", args.providerId, {
      isDefault: true,
      updatedAt: now,
    });

    return args.providerId;
  },
});

export const testConnection = action({
  args: {
    organizationId: v.id("organizations"),
    providerId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();

    const provider = await db.get("mailProviders", args.providerId);
    if (!provider || String(provider.organizationId) !== String(args.organizationId)) {
      throw new Error("Mail provider not found");
    }

    let result: { success: boolean; error?: string; accountEmail?: string };

    try {
      if (provider.providerType === "mailgun") {
        const { createMailgunAdapter } = await import("./mail/adapters/mailgun");
        const adapter = createMailgunAdapter(
          (provider.apiConfig as any)?.apiKey ?? "",
          (provider.apiConfig as any)?.domain ?? "",
          provider.fromEmail as string,
          provider.fromName as string,
          (provider.apiConfig as any)?.region ?? "us",
        );
        result = adapter.testConnection
          ? await adapter.testConnection()
          : { success: true, accountEmail: provider.fromEmail as string };
      } else if (provider.providerType === "google") {
        const { createGoogleAdapter } = await import("./mail/adapters/google");
        const adapter = createGoogleAdapter(
          (provider.oauthTokens as any)?.accessToken ?? "",
          (provider.oauthTokens as any)?.refreshToken ?? "",
          provider.fromEmail as string,
          provider.fromName as string,
          process.env.GOOGLE_CLIENT_ID ?? "",
          process.env.GOOGLE_CLIENT_SECRET ?? "",
          (provider.oauthTokens as any)?.expiresAt ?? 0,
        );
        result = adapter.testConnection
          ? await adapter.testConnection()
          : { success: true, accountEmail: provider.fromEmail as string };
      } else if (provider.providerType === "microsoft") {
        const { createMicrosoftAdapter } = await import("./mail/adapters/microsoft");
        const adapter = createMicrosoftAdapter(
          (provider.oauthTokens as any)?.accessToken ?? "",
          (provider.oauthTokens as any)?.refreshToken ?? "",
          provider.fromEmail as string,
          provider.fromName as string,
        );
        result = adapter.testConnection
          ? await adapter.testConnection()
          : { success: true, accountEmail: provider.fromEmail as string };
      } else {
        // Resend has no testConnection — check that API key is present
        result = (provider.apiConfig as any)?.apiKey
          ? { success: true, accountEmail: provider.fromEmail as string }
          : { success: false, error: "Missing API key" };
      }
    } catch (err) {
      result = { success: false, error: String(err) };
    }

    // Update provider status based on test result
    if (result.success && provider.status !== "active") {
      await db.patch("mailProviders", args.providerId, {
        status: "active",
        updatedAt: Date.now(),
      });
    } else if (!result.success && provider.status === "active") {
      await db.patch("mailProviders", args.providerId, {
        status: "error",
        updatedAt: Date.now(),
      });
    }

    return { ...result, providerId: args.providerId };
  },
});
