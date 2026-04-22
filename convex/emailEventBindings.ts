import { query, action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

// Dual-write refs removed — Supabase is now primary for event binding writes

// ---------------------------------------------------------------------------
// Internal Queries (used by processEvent action)
// ---------------------------------------------------------------------------

export const listEnabledBindings = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    eventType: v.string(),
  },
  handler: async (ctx, args) => {
    const bindings = await ctx.db
      .query("emailEventBindings")
      .withIndex("by_orgAndEventType", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("eventType", args.eventType),
      )
      .filter((q) => q.eq(q.field("enabled"), true))
      .collect();

    return bindings.sort((a, b) => a.priority - b.priority);
  },
});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const listBindings = query({
  args: {
    organizationId: v.id("organizations"),
    eventType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const bindings = args.eventType
      ? await ctx.db
          .query("emailEventBindings")
          .withIndex("by_orgAndEventType", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("eventType", args.eventType!),
          )
          .collect()
      : await ctx.db
          .query("emailEventBindings")
          .withIndex("by_org", (q) =>
            q.eq("organizationId", args.organizationId),
          )
          .collect();

    const withTemplates = await Promise.all(
      bindings.map(async (b) => {
        const template = await ctx.db.get(b.templateId);
        return {
          ...b,
          templateName: template?.name ?? null,
          templateIsActive: template?.isActive ?? false,
        };
      }),
    );

    return withTemplates;
  },
});

export const listEventLog = query({
  args: {
    organizationId: v.id("organizations"),
    eventType: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("sent"),
        v.literal("failed"),
        v.literal("skipped"),
      ),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const limit = args.limit ?? 100;

    let entries;
    if (args.status) {
      entries = await ctx.db
        .query("emailEventLog")
        .withIndex("by_orgAndStatus", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("status", args.status!),
        )
        .order("desc")
        .take(limit);
    } else if (args.eventType) {
      entries = await ctx.db
        .query("emailEventLog")
        .withIndex("by_orgAndEventType", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("eventType", args.eventType!),
        )
        .order("desc")
        .take(limit);
    } else {
      entries = await ctx.db
        .query("emailEventLog")
        .withIndex("by_orgAndCreatedAt", (q) =>
          q.eq("organizationId", args.organizationId),
        )
        .order("desc")
        .take(limit);
    }

    const withTemplates = await Promise.all(
      entries.map(async (e) => {
        const template = e.templateId ? await ctx.db.get(e.templateId) : null;
        return {
          ...e,
          templateName: template?.name ?? null,
        };
      }),
    );

    return withTemplates;
  },
});

// ---------------------------------------------------------------------------
// Actions (Supabase-primary)
// ---------------------------------------------------------------------------

export const upsertBinding = action({
  args: {
    organizationId: v.id("organizations"),
    eventType: v.string(),
    templateId: v.string(),
    enabled: v.optional(v.boolean()),
    conditions: v.optional(v.string()),
    priority: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();

    // Validate template exists and belongs to this org
    const template = await db.get("emailTemplates", args.templateId);
    if (!template || String(template.organizationId) !== String(args.organizationId)) {
      throw new Error("Template not found or belongs to another organization");
    }

    // Check for existing binding for this org+eventType
    const existing = await db.query("emailEventBindings")
      .eq("organizationId", String(args.organizationId))
      .eq("eventType", args.eventType)
      .first();

    const now = Date.now();

    if (existing) {
      await db.patch("emailEventBindings", existing._id as string, {
        templateId: args.templateId,
        enabled: args.enabled ?? (existing.enabled as boolean),
        conditions: args.conditions ?? (existing.conditions as string | null),
        priority: args.priority ?? (existing.priority as number),
        updatedAt: now,
      });
      return existing._id as string;
    }

    const newId = await db.insert("emailEventBindings", {
      organizationId: String(args.organizationId),
      eventType: args.eventType,
      templateId: args.templateId,
      enabled: args.enabled ?? true,
      conditions: args.conditions ?? null,
      priority: args.priority ?? 0,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });
    return newId;
  },
});

export const toggleBinding = action({
  args: {
    organizationId: v.id("organizations"),
    bindingId: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();

    const binding = await db.get("emailEventBindings", args.bindingId);
    if (!binding || String(binding.organizationId) !== String(args.organizationId)) {
      throw new Error("Binding not found");
    }

    await db.patch("emailEventBindings", args.bindingId, {
      enabled: args.enabled,
      updatedAt: Date.now(),
    });
  },
});

export const deleteBinding = action({
  args: {
    organizationId: v.id("organizations"),
    bindingId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();

    const binding = await db.get("emailEventBindings", args.bindingId);
    if (!binding || String(binding.organizationId) !== String(args.organizationId)) {
      throw new Error("Binding not found");
    }

    await db.delete("emailEventBindings", args.bindingId);
  },
});
