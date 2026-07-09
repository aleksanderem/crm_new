import { query, action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { verifyOrgAccess } from "./_helpers/auth";
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

export const createDefinition = action({
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
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const now = Date.now();

    // Check for duplicate fieldKey
    const existing = await db
      .query("customFieldDefinitions")
      .eq("organizationId", String(args.organizationId))
      .eq("entityType", args.entityType)
      .collect();
    const dup = existing.find((e: any) => e.fieldKey === args.fieldKey);
    if (dup) throw new Error(`Field key "${args.fieldKey}" already exists`);

    const defId = await db.insert("customFieldDefinitions", {
      organizationId: String(args.organizationId),
      entityType: args.entityType,
      name: args.name,
      fieldKey: args.fieldKey,
      fieldType: args.fieldType,
      options: args.options ?? null,
      isRequired: args.isRequired ?? null,
      order: args.order,
      group: args.group ?? null,
      activityTypeKey: args.activityTypeKey ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return defId;
  },
});

/**
 * Idempotent "ensure a definition exists" by (org, entityType, fieldKey).
 * Returns the existing definition id if one already exists, otherwise creates
 * it. This is the anti-duplication primitive used when a document template
 * field maps to a "new" patient field: repeated template saves / document
 * generations converge on the same definition instead of creating duplicates.
 */
export const ensureDefinition = action({
  args: {
    organizationId: v.id("organizations"),
    entityType: entityTypeValidator,
    name: v.string(),
    fieldKey: v.string(),
    fieldType: customFieldTypeValidator,
    options: v.optional(v.array(v.string())),
    group: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<string> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);

    const existingDefs = await db
      .query("customFieldDefinitions")
      .eq("organizationId", orgIdStr)
      .eq("entityType", args.entityType)
      .collect();

    const found = existingDefs.find((e: any) => e.fieldKey === args.fieldKey);
    if (found) return String(found._id);

    const now = Date.now();
    const nextOrder = existingDefs.reduce(
      (max: number, e: any) => Math.max(max, (e.order ?? 0) + 1),
      0,
    );

    try {
      const defId = await db.insert("customFieldDefinitions", {
        organizationId: orgIdStr,
        entityType: args.entityType,
        name: args.name,
        fieldKey: args.fieldKey,
        fieldType: args.fieldType,
        options: args.options ?? null,
        isRequired: null,
        order: nextOrder,
        group: args.group ?? null,
        activityTypeKey: null,
        createdAt: now,
        updatedAt: now,
      });
      return String(defId);
    } catch {
      // Lost a race on the unique (org, entityType, fieldKey) index — re-select.
      const retry = await db
        .query("customFieldDefinitions")
        .eq("organizationId", orgIdStr)
        .eq("entityType", args.entityType)
        .collect();
      const raced = retry.find((e: any) => e.fieldKey === args.fieldKey);
      if (raced) return String(raced._id);
      throw new Error(`Failed to ensure custom field "${args.fieldKey}"`);
    }
  },
});

export const updateDefinition = action({
  args: {
    organizationId: v.id("organizations"),
    definitionId: v.string(),
    name: v.optional(v.string()),
    options: v.optional(v.array(v.string())),
    isRequired: v.optional(v.boolean()),
    order: v.optional(v.number()),
    group: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const def = await db.get("customFieldDefinitions", args.definitionId);
    if (!def || def.organizationId !== String(args.organizationId)) {
      throw new Error("Field definition not found");
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.options !== undefined) updates.options = args.options;
    if (args.isRequired !== undefined) updates.isRequired = args.isRequired;
    if (args.order !== undefined) updates.order = args.order;
    if (args.group !== undefined) updates.group = args.group;

    await db.patch("customFieldDefinitions", args.definitionId, updates);
    return args.definitionId;
  },
});

export const deleteDefinition = action({
  args: {
    organizationId: v.id("organizations"),
    definitionId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const def = await db.get("customFieldDefinitions", args.definitionId);
    if (!def || def.organizationId !== String(args.organizationId)) {
      throw new Error("Field definition not found");
    }

    // Delete all values for this field definition
    const values = await db
      .query("customFieldValues")
      .eq("fieldDefinitionId", args.definitionId)
      .collect();
    for (const val of values) {
      await db.delete("customFieldValues", val._id as string);
    }

    await db.delete("customFieldDefinitions", args.definitionId);
    return args.definitionId;
  },
});

export const reorderDefinitions = action({
  args: {
    organizationId: v.id("organizations"),
    definitionIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const now = Date.now();

    for (let i = 0; i < args.definitionIds.length; i++) {
      const def = await db.get("customFieldDefinitions", args.definitionIds[i]);
      if (!def || def.organizationId !== String(args.organizationId)) {
        throw new Error("Field definition not found");
      }
      await db.patch("customFieldDefinitions", args.definitionIds[i], { order: i, updatedAt: now });
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

export const setValues = action({
  args: {
    organizationId: v.id("organizations"),
    entityType: entityTypeValidator,
    entityId: v.string(),
    fields: v.array(v.object({
      fieldDefinitionId: v.string(),
      value: v.any(),
    })),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const now = Date.now();

    for (const field of args.fields) {
      // Check for existing value
      const allValues = await db
        .query("customFieldValues")
        .eq("organizationId", String(args.organizationId))
        .eq("entityType", args.entityType)
        .eq("entityId", args.entityId)
        .collect();
      const existing = allValues.find((v: any) => v.fieldDefinitionId === field.fieldDefinitionId);

      if (existing) {
        await db.patch("customFieldValues", existing._id as string, {
          value: field.value,
          updatedAt: now,
        });
      } else {
        await db.insert("customFieldValues", {
          organizationId: String(args.organizationId),
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
