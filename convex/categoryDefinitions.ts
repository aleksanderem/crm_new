import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { entityTypeValidator } from "./schema";
import { verifyOrgAccess } from "./_helpers/auth";
import { checkPermission } from "./_helpers/permissions";

// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const writeCategoryDefRef = internal.supabase.categoryDefinitions.writeCategoryDefinitionToSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const updateCategoryDefRef = internal.supabase.categoryDefinitions.updateCategoryDefinitionInSupabase;

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    entityType: entityTypeValidator,
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const categories = await ctx.db
      .query("categoryDefinitions")
      .withIndex("by_orgAndEntityType", (q) =>
        q.eq("organizationId", args.organizationId).eq("entityType", args.entityType)
      )
      .collect();
    return categories
      .filter((c) => !c.isDeleted)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    entityType: entityTypeValidator,
    name: v.string(),
    parentId: v.optional(v.id("categoryDefinitions")),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "categoryDefinitions", "create");
    if (!perm.allowed) throw new Error("Permission denied");

    // Validate 2-level constraint
    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.isDeleted) throw new Error("Parent category not found");
      if (parent.parentId) throw new Error("Cannot nest deeper than 2 levels");
      if (parent.entityType !== args.entityType) throw new Error("Parent category belongs to different entity type");
    }

    // Get next sortOrder within same level
    const siblings = await ctx.db
      .query("categoryDefinitions")
      .withIndex("by_orgAndEntityType", (q) =>
        q.eq("organizationId", args.organizationId).eq("entityType", args.entityType)
      )
      .collect();
    const sameLevelSiblings = siblings.filter((c) =>
      !c.isDeleted && (args.parentId ? c.parentId === args.parentId : !c.parentId)
    );
    const maxOrder = sameLevelSiblings.reduce((max, c) => Math.max(max, c.sortOrder), -1);

    const now = Date.now();
    const catId = await ctx.db.insert("categoryDefinitions", {
      organizationId: args.organizationId,
      entityType: args.entityType,
      name: args.name.trim(),
      parentId: args.parentId,
      color: args.color,
      sortOrder: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    });

    // Dual-write: replicate to Supabase
    await ctx.scheduler.runAfter(0, writeCategoryDefRef, {
      categoryDefinitionId: catId as string,
      organizationId: args.organizationId as string,
      entityType: args.entityType,
      name: args.name.trim(),
      parentId: args.parentId as string | undefined,
      color: args.color,
      sortOrder: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    });

    return catId;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    categoryId: v.id("categoryDefinitions"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    parentId: v.optional(v.id("categoryDefinitions")),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "categoryDefinitions", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const category = await ctx.db.get(args.categoryId);
    if (!category || category.organizationId !== args.organizationId) {
      throw new Error("Category not found");
    }

    // Validate 2-level constraint on parentId change
    if (args.parentId !== undefined && args.parentId !== category.parentId) {
      if (args.parentId) {
        const parent = await ctx.db.get(args.parentId);
        if (!parent || parent.isDeleted) throw new Error("Parent category not found");
        if (parent.parentId) throw new Error("Cannot nest deeper than 2 levels");
      }
      // If this category has children, it cannot become a child itself
      const children = await ctx.db
        .query("categoryDefinitions")
        .withIndex("by_parent", (q) => q.eq("parentId", args.categoryId))
        .collect();
      if (children.some((c) => !c.isDeleted) && args.parentId) {
        throw new Error("Cannot move a parent category under another category");
      }
    }

    const updatedAt = Date.now();
    await ctx.db.patch(args.categoryId, {
      ...(args.name !== undefined && { name: args.name.trim() }),
      ...(args.color !== undefined && { color: args.color }),
      ...(args.parentId !== undefined && { parentId: args.parentId }),
      updatedAt,
    });

    // Dual-write: replicate update to Supabase
    await ctx.scheduler.runAfter(0, updateCategoryDefRef, {
      categoryDefinitionId: args.categoryId as string,
      name: args.name !== undefined ? args.name.trim() : undefined,
      color: args.color,
      parentId: args.parentId as string | undefined,
      updatedAt,
    });
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    categoryId: v.id("categoryDefinitions"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "categoryDefinitions", "delete");
    if (!perm.allowed) throw new Error("Permission denied");

    const category = await ctx.db.get(args.categoryId);
    if (!category || category.organizationId !== args.organizationId) {
      throw new Error("Category not found");
    }

    const now = Date.now();

    // Soft-delete this category
    await ctx.db.patch(args.categoryId, { isDeleted: true, updatedAt: now });

    // Dual-write: replicate soft-delete to Supabase
    await ctx.scheduler.runAfter(0, updateCategoryDefRef, {
      categoryDefinitionId: args.categoryId as string,
      isDeleted: true,
      updatedAt: now,
    });

    // Cascade soft-delete children
    const children = await ctx.db
      .query("categoryDefinitions")
      .withIndex("by_parent", (q) => q.eq("parentId", args.categoryId))
      .collect();
    for (const child of children) {
      if (!child.isDeleted) {
        await ctx.db.patch(child._id, { isDeleted: true, updatedAt: now });
        // Dual-write: replicate child soft-delete to Supabase
        await ctx.scheduler.runAfter(0, updateCategoryDefRef, {
          categoryDefinitionId: child._id as string,
          isDeleted: true,
          updatedAt: now,
        });
      }
    }

    // Schedule background cleanup of entity references
    await ctx.scheduler.runAfter(0, internal.categoryDefinitions.cleanupCategoryReferences, {
      organizationId: args.organizationId,
      categoryId: args.categoryId,
      entityType: category.entityType,
      childIds: children.filter((c) => !c.isDeleted).map((c) => c._id),
    });
  },
});

export const reorder = mutation({
  args: {
    organizationId: v.id("organizations"),
    entityType: entityTypeValidator,
    categoryIds: v.array(v.id("categoryDefinitions")),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "categoryDefinitions", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const now = Date.now();
    for (let i = 0; i < args.categoryIds.length; i++) {
      await ctx.db.patch(args.categoryIds[i], { sortOrder: i, updatedAt: now });
    }
  },
});

export const cleanupCategoryReferences = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    categoryId: v.id("categoryDefinitions"),
    entityType: v.string(),
    childIds: v.array(v.id("categoryDefinitions")),
  },
  handler: async (ctx, args) => {
    const idsToClean = [args.categoryId, ...args.childIds];

    const tableMap: Record<string, string> = {
      contact: "contacts",
      company: "companies",
      lead: "leads",
      document: "documents",
      activity: "scheduledActivities",
      product: "products",
      call: "calls",
      gabinetPatient: "gabinetPatients",
      gabinetTreatment: "gabinetTreatments",
      gabinetAppointment: "gabinetAppointments",
      gabinetEmployee: "gabinetEmployees",
    };

    const tableName = tableMap[args.entityType];
    if (!tableName) return;

    const entities = await ctx.db
      .query(tableName as any)
      .withIndex("by_org", (q: any) => q.eq("organizationId", args.organizationId))
      .collect();

    for (const entity of entities) {
      if ((entity as any).categoryId && idsToClean.includes((entity as any).categoryId)) {
        await ctx.db.patch(entity._id, { categoryId: undefined } as any);
      }
    }
  },
});
