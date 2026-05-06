import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";

export const list = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<Array<Record<string, unknown>>> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const db = createSupabaseDb();
    const tags = (await db
      .query("tagDefinitions")
      .eq("organizationId", String(args.organizationId))
      .collect()) as Array<Record<string, any>>;
    return tags
      .filter((t) => !t.isDeleted)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  },
});

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "tagDefinitions",
      action: "create",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    // Enforce unique name per org
    const allTags = await db
      .query("tagDefinitions")
      .eq("organizationId", String(args.organizationId))
      .collect();
    const existing = allTags.find(
      (t: any) => t.name === args.name.trim() && !t.isDeleted
    );
    if (existing) {
      throw new Error(`Tag "${args.name}" already exists`);
    }

    const maxOrder = allTags.reduce((max: number, t: any) => Math.max(max, t.sortOrder ?? 0), -1);

    const now = Date.now();
    const tagId = await db.insert("tagDefinitions", {
      organizationId: String(args.organizationId),
      name: args.name.trim(),
      color: args.color,
      sortOrder: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    });

    return tagId;
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    tagId: v.string(),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "tagDefinitions",
      action: "edit",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const tag = await db.get("tagDefinitions", args.tagId);
    if (!tag || tag.organizationId !== String(args.organizationId)) {
      throw new Error("Tag not found");
    }

    if (args.name && args.name !== tag.name) {
      const allTags = await db
        .query("tagDefinitions")
        .eq("organizationId", String(args.organizationId))
        .collect();
      const dup = allTags.find(
        (t: any) => t.name === args.name!.trim() && !t.isDeleted && t._id !== args.tagId
      );
      if (dup) {
        throw new Error(`Tag "${args.name}" already exists`);
      }
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) updates.name = args.name.trim();
    if (args.color !== undefined) updates.color = args.color;

    await db.patch("tagDefinitions", args.tagId, updates);
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    tagId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "tagDefinitions",
      action: "delete",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const tag = await db.get("tagDefinitions", args.tagId);
    if (!tag || tag.organizationId !== String(args.organizationId)) {
      throw new Error("Tag not found");
    }

    // Soft-delete in Supabase
    const deletedAt = Date.now();
    await db.patch("tagDefinitions", args.tagId, { isDeleted: true, updatedAt: deletedAt });

    // Schedule background cleanup of entity references (still uses Convex DB)
    try {
      await ctx.runMutation(internal.tagDefinitions.cleanupTagReferences, {
        organizationId: args.organizationId,
        tagId: args.tagId as any,
      });
    } catch {
      // cleanup is best-effort
    }
  },
});

export const reorder = action({
  args: {
    organizationId: v.id("organizations"),
    tagIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "tagDefinitions",
      action: "edit",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const now = Date.now();

    for (let i = 0; i < args.tagIds.length; i++) {
      await db.patch("tagDefinitions", args.tagIds[i], { sortOrder: i, updatedAt: now });
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
