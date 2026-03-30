import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { verifyOrgAccess, requireOrgAdmin } from "./_helpers/auth";
import { entityTypeValidator, customFieldTypeValidator } from "@cvx/schema";

// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const writeDefRef = internal.supabase.customFields.writeDefinitionToSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const updateDefRef = internal.supabase.customFields.updateDefinitionInSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const deleteDefRef = internal.supabase.customFields.deleteDefinitionFromSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const writeValueRef = internal.supabase.customFields.writeValueToSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const updateValueRef = internal.supabase.customFields.updateValueInSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const deleteValueRef = internal.supabase.customFields.deleteValueFromSupabase;

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

    const defId = await ctx.db.insert("customFieldDefinitions", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });

    // Dual-write: replicate new definition to Supabase
    await ctx.scheduler.runAfter(0, writeDefRef, {
      definitionId: defId as string,
      organizationId: args.organizationId as string,
      entityType: args.entityType,
      name: args.name,
      fieldKey: args.fieldKey,
      fieldType: args.fieldType,
      options: args.options,
      isRequired: args.isRequired,
      order: args.order,
      group: args.group,
      activityTypeKey: args.activityTypeKey,
      createdAt: now,
      updatedAt: now,
    });

    return defId;
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
    const now = Date.now();
    await ctx.db.patch(definitionId, { ...updates, updatedAt: now });

    // Dual-write: replicate update to Supabase
    await ctx.scheduler.runAfter(0, updateDefRef, {
      definitionId: definitionId as string,
      organizationId: organizationId as string,
      ...updates,
      updatedAt: now,
    });

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
      // Dual-write: delete each value from Supabase
      await ctx.scheduler.runAfter(0, deleteValueRef, {
        valueId: val._id as string,
        organizationId: args.organizationId as string,
      });
      await ctx.db.delete(val._id);
    }

    // Dual-write: schedule delete from Supabase BEFORE removing from Convex
    await ctx.scheduler.runAfter(0, deleteDefRef, {
      definitionId: args.definitionId as string,
      organizationId: args.organizationId as string,
    });

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
        // Dual-write: replicate value update to Supabase
        await ctx.scheduler.runAfter(0, updateValueRef, {
          valueId: existing._id as string,
          organizationId: args.organizationId as string,
          value: field.value,
          updatedAt: now,
        });
      } else {
        const valueId = await ctx.db.insert("customFieldValues", {
          organizationId: args.organizationId,
          fieldDefinitionId: field.fieldDefinitionId,
          entityType: args.entityType,
          entityId: args.entityId,
          value: field.value,
          createdAt: now,
          updatedAt: now,
        });
        // Dual-write: replicate new value to Supabase
        await ctx.scheduler.runAfter(0, writeValueRef, {
          valueId: valueId as string,
          organizationId: args.organizationId as string,
          fieldDefinitionId: field.fieldDefinitionId as string,
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
