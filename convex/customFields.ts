import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess, requireOrgAdmin } from "./_helpers/auth";
import { entityTypeValidator, customFieldTypeValidator } from "@cvx/schema";

export const getDefinitions = query({
  args: {
    organizationId: v.id("organizations"),
    entityType: entityTypeValidator,
    activityTypeKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    if (args.activityTypeKey !== undefined) {
      return await ctx.db
        .query("customFieldDefinitions")
        .withIndex("by_orgEntityAndActivityType", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("entityType", args.entityType)
            .eq("activityTypeKey", args.activityTypeKey)
        )
        .collect();
    }

    return await ctx.db
      .query("customFieldDefinitions")
      .withIndex("by_orgAndEntity", (q) =>
        q.eq("organizationId", args.organizationId).eq("entityType", args.entityType)
      )
      .collect();
  },
});

export const createDefinition = mutation({
  args: {
    organizationId: v.id("organizations"),
    entityType: entityTypeValidator,
    name: v.string(),
    fieldKey: v.string(),
    fieldType: customFieldTypeValidator,
    options: v.optional(v.array(v.string())),
    isRequired: v.optional(v.boolean()),
    order: v.number(),
    group: v.optional(v.string()),
    activityTypeKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);
    const now = Date.now();

    // Check for duplicate fieldKey
    const existing = await ctx.db
      .query("customFieldDefinitions")
      .withIndex("by_orgAndKey", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("entityType", args.entityType)
          .eq("fieldKey", args.fieldKey)
      )
      .unique();
    if (existing) throw new Error(`Field key "${args.fieldKey}" already exists`);

    return await ctx.db.insert("customFieldDefinitions", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateDefinition = mutation({
  args: {
    organizationId: v.id("organizations"),
    definitionId: v.id("customFieldDefinitions"),
    name: v.optional(v.string()),
    options: v.optional(v.array(v.string())),
    isRequired: v.optional(v.boolean()),
    order: v.optional(v.number()),
    group: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);

    const def = await ctx.db.get(args.definitionId);
    if (!def || def.organizationId !== args.organizationId) {
      throw new Error("Field definition not found");
    }

    const { organizationId, definitionId, ...updates } = args;
    await ctx.db.patch(definitionId, { ...updates, updatedAt: Date.now() });
    return definitionId;
  },
});

export const deleteDefinition = mutation({
  args: {
    organizationId: v.id("organizations"),
    definitionId: v.id("customFieldDefinitions"),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);

    const def = await ctx.db.get(args.definitionId);
    if (!def || def.organizationId !== args.organizationId) {
      throw new Error("Field definition not found");
    }

    // Delete all values for this field definition
    const values = await ctx.db
      .query("customFieldValues")
      .withIndex("by_fieldDef", (q) => q.eq("fieldDefinitionId", args.definitionId))
      .collect();
    for (const val of values) {
      await ctx.db.delete(val._id);
    }

    await ctx.db.delete(args.definitionId);
    return args.definitionId;
  },
});

export const reorderDefinitions = mutation({
  args: {
    organizationId: v.id("organizations"),
    definitionIds: v.array(v.id("customFieldDefinitions")),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);
    const now = Date.now();

    for (let i = 0; i < args.definitionIds.length; i++) {
      const def = await ctx.db.get(args.definitionIds[i]);
      if (!def || def.organizationId !== args.organizationId) {
        throw new Error("Field definition not found");
      }
      await ctx.db.patch(args.definitionIds[i], { order: i, updatedAt: now });
    }
  },
});

export const getValues = query({
  args: {
    organizationId: v.id("organizations"),
    entityType: entityTypeValidator,
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("customFieldValues")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId)
      )
      .collect();
  },
});

export const getValuesBulk = query({
  args: {
    organizationId: v.id("organizations"),
    entityType: entityTypeValidator,
    entityIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const results: Record<string, Record<string, unknown>> = {};
    for (const entityId of args.entityIds) {
      const values = await ctx.db
        .query("customFieldValues")
        .withIndex("by_orgEntityField", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("entityType", args.entityType)
            .eq("entityId", entityId)
        )
        .collect();
      if (values.length > 0) {
        results[entityId] = {};
        for (const v of values) {
          results[entityId][v.fieldDefinitionId] = v.value;
        }
      }
    }
    return results;
  },
});

export const setValues = mutation({
  args: {
    organizationId: v.id("organizations"),
    entityType: entityTypeValidator,
    entityId: v.string(),
    fields: v.array(v.object({
      fieldDefinitionId: v.id("customFieldDefinitions"),
      value: v.any(),
    })),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();

    for (const field of args.fields) {
      const existing = await ctx.db
        .query("customFieldValues")
        .withIndex("by_orgEntityField", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("entityType", args.entityType)
            .eq("entityId", args.entityId)
            .eq("fieldDefinitionId", field.fieldDefinitionId)
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, { value: field.value, updatedAt: now });
      } else {
        await ctx.db.insert("customFieldValues", {
          organizationId: args.organizationId,
          fieldDefinitionId: field.fieldDefinitionId,
          entityType: args.entityType,
          entityId: args.entityId,
          value: field.value,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  },
});
