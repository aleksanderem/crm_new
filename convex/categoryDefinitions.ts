import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { entityTypeValidator } from "./schema";

export const list = action({
  args: {
    organizationId: v.id("organizations"),
    entityType: entityTypeValidator,
  },
  handler: async (ctx, args): Promise<Array<Record<string, unknown>>> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const db = createSupabaseDb();
    const categories = (await db
      .query("categoryDefinitions")
      .eq("organizationId", String(args.organizationId))
      .eq("entityType", args.entityType)
      .collect()) as Array<Record<string, any>>;
    return categories
      .filter((c) => !c.isDeleted)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  },
});

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    entityType: entityTypeValidator,
    name: v.string(),
    parentId: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "categoryDefinitions",
      action: "create",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    // Validate 2-level constraint
    if (args.parentId) {
      const parent = await db.get("categoryDefinitions", args.parentId);
      if (!parent || parent.isDeleted) throw new Error("Parent category not found");
      if (parent.parentId) throw new Error("Cannot nest deeper than 2 levels");
      if (parent.entityType !== args.entityType) throw new Error("Parent category belongs to different entity type");
    }

    // Get next sortOrder within same level
    const siblings = await db
      .query("categoryDefinitions")
      .eq("organizationId", String(args.organizationId))
      .eq("entityType", args.entityType)
      .collect();
    const sameLevelSiblings = siblings.filter((c: any) =>
      !c.isDeleted && (args.parentId ? c.parentId === args.parentId : !c.parentId)
    );
    const maxOrder = sameLevelSiblings.reduce((max: number, c: any) => Math.max(max, c.sortOrder ?? 0), -1);

    const now = Date.now();
    const catId = await db.insert("categoryDefinitions", {
      organizationId: String(args.organizationId),
      entityType: args.entityType,
      name: args.name.trim(),
      parentId: args.parentId ?? null,
      color: args.color ?? null,
      sortOrder: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    });

    return catId;
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    categoryId: v.string(),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    parentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "categoryDefinitions",
      action: "edit",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const category = await db.get("categoryDefinitions", args.categoryId);
    if (!category || category.organizationId !== String(args.organizationId)) {
      throw new Error("Category not found");
    }

    // Validate 2-level constraint on parentId change
    if (args.parentId !== undefined && args.parentId !== category.parentId) {
      if (args.parentId) {
        const parent = await db.get("categoryDefinitions", args.parentId);
        if (!parent || parent.isDeleted) throw new Error("Parent category not found");
        if (parent.parentId) throw new Error("Cannot nest deeper than 2 levels");
      }
      // If this category has children, it cannot become a child itself
      const children = await db
        .query("categoryDefinitions")
        .eq("organizationId", String(args.organizationId))
        .collect();
      const activeChildren = children.filter(
        (c: any) => c.parentId === args.categoryId && !c.isDeleted
      );
      if (activeChildren.length > 0 && args.parentId) {
        throw new Error("Cannot move a parent category under another category");
      }
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) updates.name = args.name.trim();
    if (args.color !== undefined) updates.color = args.color;
    if (args.parentId !== undefined) updates.parentId = args.parentId;

    await db.patch("categoryDefinitions", args.categoryId, updates);
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    categoryId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "categoryDefinitions",
      action: "delete",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const category = await db.get("categoryDefinitions", args.categoryId);
    if (!category || category.organizationId !== String(args.organizationId)) {
      throw new Error("Category not found");
    }

    const now = Date.now();

    // Soft-delete this category
    await db.patch("categoryDefinitions", args.categoryId, { isDeleted: true, updatedAt: now });

    // Cascade soft-delete children
    const allCats = await db
      .query("categoryDefinitions")
      .eq("organizationId", String(args.organizationId))
      .collect();
    const children = allCats.filter((c: any) => c.parentId === args.categoryId && !c.isDeleted);
    const childIds: string[] = [];
    for (const child of children) {
      await db.patch("categoryDefinitions", child._id as string, { isDeleted: true, updatedAt: now });
      childIds.push(child._id as string);
    }

    // Schedule background cleanup of entity references (still uses Convex DB)
    try {
      await ctx.runMutation(internal.categoryDefinitions.cleanupCategoryReferences, {
        organizationId: args.organizationId,
        categoryId: args.categoryId as any,
        entityType: category.entityType as string,
        childIds: childIds as any,
      });
    } catch {
      // cleanup is best-effort
    }
  },
});

export const reorder = action({
  args: {
    organizationId: v.id("organizations"),
    entityType: entityTypeValidator,
    categoryIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "categoryDefinitions",
      action: "edit",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const now = Date.now();

    for (let i = 0; i < args.categoryIds.length; i++) {
      await db.patch("categoryDefinitions", args.categoryIds[i], { sortOrder: i, updatedAt: now });
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
