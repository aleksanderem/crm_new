import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

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
// Mutations
// ---------------------------------------------------------------------------

export const upsertBinding = mutation({
  args: {
    organizationId: v.id("organizations"),
    eventType: v.string(),
    templateId: v.id("emailTemplates"),
    enabled: v.optional(v.boolean()),
    conditions: v.optional(v.string()),
    priority: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    // Validate template exists and belongs to this org
    const template = await ctx.db.get(args.templateId);
    if (!template || template.organizationId !== args.organizationId) {
      throw new Error("Template not found or belongs to another organization");
    }

    const existing = await ctx.db
      .query("emailEventBindings")
      .withIndex("by_orgAndEventType", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("eventType", args.eventType),
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        templateId: args.templateId,
        enabled: args.enabled ?? existing.enabled,
        conditions: args.conditions ?? existing.conditions,
        priority: args.priority ?? existing.priority,
        updatedAt: now,
      });
      return existing._id;
    }

    return ctx.db.insert("emailEventBindings", {
      organizationId: args.organizationId,
      eventType: args.eventType,
      templateId: args.templateId,
      enabled: args.enabled ?? true,
      conditions: args.conditions,
      priority: args.priority ?? 0,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const toggleBinding = mutation({
  args: {
    organizationId: v.id("organizations"),
    bindingId: v.id("emailEventBindings"),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const binding = await ctx.db.get(args.bindingId);
    if (!binding || binding.organizationId !== args.organizationId) {
      throw new Error("Binding not found");
    }

    await ctx.db.patch(args.bindingId, {
      enabled: args.enabled,
      updatedAt: Date.now(),
    });
  },
});

export const deleteBinding = mutation({
  args: {
    organizationId: v.id("organizations"),
    bindingId: v.id("emailEventBindings"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const binding = await ctx.db.get(args.bindingId);
    if (!binding || binding.organizationId !== args.organizationId) {
      throw new Error("Binding not found");
    }

    await ctx.db.delete(args.bindingId);
  },
});
