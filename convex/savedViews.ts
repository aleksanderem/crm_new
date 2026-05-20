import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";

export const listByEntityType = action({
  args: {
    organizationId: v.id("organizations"),
    entityType: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const views = await db
      .query<{ order?: number }>("savedViews")
      .eq("organizationId", String(args.organizationId))
      .eq("entityType", args.entityType)
      .collect();

    views.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return views;
  },
});

export const getById = action({
  args: {
    organizationId: v.id("organizations"),
    viewId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const view = await db.get<{ organizationId: string }>("savedViews", args.viewId);
    if (!view || view.organizationId !== String(args.organizationId)) {
      throw new Error("Saved view not found");
    }

    return view;
  },
});

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    entityType: v.string(),
    name: v.string(),
    filters: v.any(),
    columns: v.optional(v.array(v.string())),
    sortField: v.optional(v.string()),
    sortDirection: v.optional(v.string()),
    selectedId: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
    isSystem: v.boolean(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const now = Date.now();

    // Enforce max 5 custom (non-system) views per entity per org
    if (!args.isSystem) {
      const existing = await db
        .query("savedViews")
        .eq("organizationId", String(args.organizationId))
        .eq("entityType", args.entityType)
        .collect();

      const customViews = existing.filter((v: any) => !v.isSystem);
      if (customViews.length >= 5) {
        throw new Error("Maximum of 5 custom views per entity type reached");
      }
    }

    // Calculate order (append at end)
    const existing = await db
      .query("savedViews")
      .eq("organizationId", String(args.organizationId))
      .eq("entityType", args.entityType)
      .collect();
    const maxOrder = existing.length > 0 ? Math.max(...existing.map((v: any) => v.order ?? 0)) : -1;

    const viewId = await db.insert("savedViews", {
      organizationId: String(args.organizationId),
      entityType: args.entityType,
      name: args.name,
      filters: args.filters,
      columns: args.columns ?? null,
      sortField: args.sortField ?? null,
      sortDirection: args.sortDirection ?? null,
      selectedId: args.selectedId ?? null,
      isDefault: args.isDefault ?? null,
      isSystem: args.isSystem,
      createdBy: String(authResult.userId),
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    });

    return viewId;
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    viewId: v.string(),
    name: v.optional(v.string()),
    filters: v.optional(v.any()),
    columns: v.optional(v.array(v.string())),
    sortField: v.optional(v.string()),
    sortDirection: v.optional(v.string()),
    selectedId: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const view = await db.get("savedViews", args.viewId);
    if (!view || view.organizationId !== String(args.organizationId)) {
      throw new Error("Saved view not found");
    }

    const isOwner = view.createdBy === String(authResult.userId);
    const isAdmin = authResult.role === "owner" || authResult.role === "admin";
    if (!isOwner && !isAdmin) {
      throw new Error("Not authorized to update this view");
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.filters !== undefined) updates.filters = args.filters;
    if (args.columns !== undefined) updates.columns = args.columns;
    if (args.sortField !== undefined) updates.sortField = args.sortField;
    if (args.sortDirection !== undefined) updates.sortDirection = args.sortDirection;
    if (args.selectedId !== undefined) updates.selectedId = args.selectedId;
    if (args.isDefault !== undefined) updates.isDefault = args.isDefault;

    await db.patch("savedViews", args.viewId, updates);
    return args.viewId;
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    viewId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const view = await db.get("savedViews", args.viewId);
    if (!view || view.organizationId !== String(args.organizationId)) {
      throw new Error("Saved view not found");
    }

    const isOwner = view.createdBy === String(authResult.userId);
    const isAdmin = authResult.role === "owner" || authResult.role === "admin";
    if (!isOwner && !isAdmin) {
      throw new Error("Not authorized to delete this view");
    }

    await db.delete("savedViews", args.viewId);
    return args.viewId;
  },
});

export const reorder = action({
  args: {
    organizationId: v.id("organizations"),
    viewIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();

    for (let i = 0; i < args.viewIds.length; i++) {
      const view = await db.get("savedViews", args.viewIds[i]);
      if (!view || view.organizationId !== String(args.organizationId)) {
        throw new Error("Saved view not found");
      }
      await db.patch("savedViews", args.viewIds[i], { order: i, updatedAt: Date.now() });
    }

    return true;
  },
});
