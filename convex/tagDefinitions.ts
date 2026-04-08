import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";
import { checkPermission } from "./_helpers/permissions";

export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const tags = await ctx.db
      .query("tagDefinitions")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return tags
      .filter((t) => !t.isDeleted)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "tagDefinitions", "create");
    if (!perm.allowed) throw new Error("Permission denied");

    // Enforce unique name per org
    const existing = await ctx.db
      .query("tagDefinitions")
      .withIndex("by_orgAndName", (q) =>
        q.eq("organizationId", args.organizationId).eq("name", args.name.trim())
      )
      .first();
    if (existing && !existing.isDeleted) {
      throw new Error(`Tag "${args.name}" already exists`);
    }

    // Get next sortOrder
    const allTags = await ctx.db
      .query("tagDefinitions")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const maxOrder = allTags.reduce((max, t) => Math.max(max, t.sortOrder), -1);

    const now = Date.now();
    return await ctx.db.insert("tagDefinitions", {
      organizationId: args.organizationId,
      name: args.name.trim(),
      color: args.color,
      sortOrder: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    tagId: v.id("tagDefinitions"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "tagDefinitions", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const tag = await ctx.db.get(args.tagId);
    if (!tag || tag.organizationId !== args.organizationId) {
      throw new Error("Tag not found");
    }

    if (args.name && args.name !== tag.name) {
      const existing = await ctx.db
        .query("tagDefinitions")
        .withIndex("by_orgAndName", (q) =>
          q.eq("organizationId", args.organizationId).eq("name", args.name!.trim())
        )
        .first();
      if (existing && !existing.isDeleted && existing._id !== args.tagId) {
        throw new Error(`Tag "${args.name}" already exists`);
      }
    }

    await ctx.db.patch(args.tagId, {
      ...(args.name !== undefined && { name: args.name.trim() }),
      ...(args.color !== undefined && { color: args.color }),
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    tagId: v.id("tagDefinitions"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "tagDefinitions", "delete");
    if (!perm.allowed) throw new Error("Permission denied");

    const tag = await ctx.db.get(args.tagId);
    if (!tag || tag.organizationId !== args.organizationId) {
      throw new Error("Tag not found");
    }

    // Soft-delete
    await ctx.db.patch(args.tagId, { isDeleted: true, updatedAt: Date.now() });

    // Schedule background cleanup of entity references
    await ctx.scheduler.runAfter(0, internal.tagDefinitions.cleanupTagReferences, {
      organizationId: args.organizationId,
      tagId: args.tagId,
    });
  },
});

export const reorder = mutation({
  args: {
    organizationId: v.id("organizations"),
    tagIds: v.array(v.id("tagDefinitions")),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "tagDefinitions", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const now = Date.now();
    for (let i = 0; i < args.tagIds.length; i++) {
      await ctx.db.patch(args.tagIds[i], { sortOrder: i, updatedAt: now });
    }
  },
});

export const cleanupTagReferences = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    tagId: v.id("tagDefinitions"),
  },
  handler: async (ctx, args) => {
    const crmTables = [
      "contacts", "companies", "leads", "documents",
      "products", "calls",
    ] as const;

    for (const table of crmTables) {
      const entities = await ctx.db
        .query(table)
        .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
        .collect();
      for (const entity of entities) {
        const tagIds = (entity as any).tagIds as string[] | undefined;
        if (tagIds?.includes(args.tagId)) {
          await ctx.db.patch(entity._id, {
            tagIds: tagIds.filter((id) => id !== args.tagId),
          } as any);
        }
      }
    }

    // scheduledActivities
    const activities = await ctx.db
      .query("scheduledActivities")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    for (const entity of activities) {
      const tagIds = (entity as any).tagIds as string[] | undefined;
      if (tagIds?.includes(args.tagId)) {
        await ctx.db.patch(entity._id, {
          tagIds: tagIds.filter((id) => id !== args.tagId),
        } as any);
      }
    }

    const gabinetTables = [
      "gabinetPatients", "gabinetTreatments", "gabinetAppointments",
      "gabinetEmployees",
    ] as const;

    for (const table of gabinetTables) {
      const entities = await ctx.db
        .query(table)
        .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
        .collect();
      for (const entity of entities) {
        const tagIds = (entity as any).tagIds as string[] | undefined;
        if (tagIds?.includes(args.tagId)) {
          await ctx.db.patch(entity._id, {
            tagIds: tagIds.filter((id) => id !== args.tagId),
          } as any);
        }
      }
    }
  },
});
