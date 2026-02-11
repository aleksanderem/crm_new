import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { verifyOrgAccess } from "./_helpers/auth";
import { logActivity } from "./_helpers/activities";

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    if (args.search) {
      const results = await ctx.db
        .query("companies")
        .withSearchIndex("search_companies", (q) =>
          q.search("name", args.search!).eq("organizationId", args.organizationId)
        )
        .take(50);
      return { page: results, isDone: true, continueCursor: "" };
    }

    return await ctx.db
      .query("companies")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const company = await ctx.db.get(args.companyId);
    if (!company || company.organizationId !== args.organizationId) {
      throw new Error("Company not found");
    }

    const [customFieldValues, relationships] = await Promise.all([
      ctx.db
        .query("customFieldValues")
        .withIndex("by_entity", (q) =>
          q.eq("entityType", "company").eq("entityId", args.companyId)
        )
        .collect(),
      ctx.db
        .query("objectRelationships")
        .withIndex("by_source", (q) =>
          q.eq("sourceType", "company").eq("sourceId", args.companyId)
        )
        .collect(),
    ]);

    const targetRelationships = await ctx.db
      .query("objectRelationships")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "company").eq("targetId", args.companyId)
      )
      .collect();

    return {
      ...company,
      customFieldValues,
      relationships: [...relationships, ...targetRelationships],
    };
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    domain: v.optional(v.string()),
    industry: v.optional(v.string()),
    size: v.optional(v.string()),
    website: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.object({
      street: v.optional(v.string()),
      city: v.optional(v.string()),
      state: v.optional(v.string()),
      zip: v.optional(v.string()),
      country: v.optional(v.string()),
    })),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    customFields: v.optional(v.array(v.object({
      fieldDefinitionId: v.id("customFieldDefinitions"),
      value: v.any(),
    }))),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();
    const { customFields, ...companyData } = args;

    const companyId = await ctx.db.insert("companies", {
      ...companyData,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    if (customFields) {
      for (const field of customFields) {
        await ctx.db.insert("customFieldValues", {
          organizationId: args.organizationId,
          fieldDefinitionId: field.fieldDefinitionId,
          entityType: "company",
          entityId: companyId,
          value: field.value,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "company",
      entityId: companyId,
      action: "created",
      description: `Created company "${args.name}"`,
      performedBy: user._id,
    });

    return companyId;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    companyId: v.id("companies"),
    name: v.optional(v.string()),
    domain: v.optional(v.string()),
    industry: v.optional(v.string()),
    size: v.optional(v.string()),
    website: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.object({
      street: v.optional(v.string()),
      city: v.optional(v.string()),
      state: v.optional(v.string()),
      zip: v.optional(v.string()),
      country: v.optional(v.string()),
    })),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    customFields: v.optional(v.array(v.object({
      fieldDefinitionId: v.id("customFieldDefinitions"),
      value: v.any(),
    }))),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();

    const company = await ctx.db.get(args.companyId);
    if (!company || company.organizationId !== args.organizationId) {
      throw new Error("Company not found");
    }

    const { organizationId, companyId, customFields, ...updates } = args;
    await ctx.db.patch(companyId, { ...updates, updatedAt: now });

    if (customFields) {
      for (const field of customFields) {
        const existing = await ctx.db
          .query("customFieldValues")
          .withIndex("by_orgEntityField", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("entityType", "company")
              .eq("entityId", companyId)
              .eq("fieldDefinitionId", field.fieldDefinitionId)
          )
          .unique();

        if (existing) {
          await ctx.db.patch(existing._id, { value: field.value, updatedAt: now });
        } else {
          await ctx.db.insert("customFieldValues", {
            organizationId,
            fieldDefinitionId: field.fieldDefinitionId,
            entityType: "company",
            entityId: companyId,
            value: field.value,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }

    await logActivity(ctx, {
      organizationId,
      entityType: "company",
      entityId: companyId,
      action: "updated",
      description: `Updated company "${company.name}"`,
      performedBy: user._id,
    });

    return companyId;
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    const company = await ctx.db.get(args.companyId);
    if (!company || company.organizationId !== args.organizationId) {
      throw new Error("Company not found");
    }

    const customValues = await ctx.db
      .query("customFieldValues")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "company").eq("entityId", args.companyId)
      )
      .collect();
    for (const cv of customValues) {
      await ctx.db.delete(cv._id);
    }

    const sourceRels = await ctx.db
      .query("objectRelationships")
      .withIndex("by_source", (q) =>
        q.eq("sourceType", "company").eq("sourceId", args.companyId)
      )
      .collect();
    const targetRels = await ctx.db
      .query("objectRelationships")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "company").eq("targetId", args.companyId)
      )
      .collect();
    for (const rel of [...sourceRels, ...targetRels]) {
      await ctx.db.delete(rel._id);
    }

    await ctx.db.delete(args.companyId);

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "company",
      entityId: args.companyId,
      action: "deleted",
      description: `Deleted company "${company.name}"`,
      performedBy: user._id,
    });

    return args.companyId;
  },
});
