import { query, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { verifyOrgAccess } from "./_helpers/auth";
import { logActivity } from "./_helpers/activities";
import { checkPermission } from "./_helpers/permissions";
import { Id } from "./_generated/dataModel";

// Dual-write refs removed — Supabase is now primary for company writes

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "companies", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    if (args.search) {
      const results = await ctx.db
        .query("companies")
        .withSearchIndex("search_companies", (q) =>
          q.search("name", args.search!).eq("organizationId", args.organizationId)
        )
        .take(50);
      if (perm.scope === "own") {
        return { page: results.filter((r) => r.createdBy === user._id), isDone: true, continueCursor: "" };
      }
      return { page: results, isDone: true, continueCursor: "" };
    }

    const result = await ctx.db
      .query("companies")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .paginate(args.paginationOpts);
    if (perm.scope === "own") {
      return { ...result, page: result.page.filter((r) => r.createdBy === user._id) };
    }
    return result;
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "companies", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const company = await ctx.db.get(args.companyId);
    if (!company || company.organizationId !== args.organizationId) {
      throw new Error("Company not found");
    }
    if (perm.scope === "own" && company.createdBy !== user._id) {
      throw new Error("Permission denied");
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

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    domain: v.optional(v.union(v.string(), v.null())),
    industry: v.optional(v.union(v.string(), v.null())),
    size: v.optional(v.union(v.string(), v.null())),
    website: v.optional(v.union(v.string(), v.null())),
    phone: v.optional(v.union(v.string(), v.null())),
    address: v.optional(v.union(v.object({
      street: v.optional(v.string()),
      city: v.optional(v.string()),
      state: v.optional(v.string()),
      zip: v.optional(v.string()),
      country: v.optional(v.string()),
    }), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
    tags: v.optional(v.array(v.string())),
    customFields: v.optional(v.array(v.object({
      fieldDefinitionId: v.string(),
      value: v.any(),
    }))),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "companies",
      action: "create",
    }).then((perm: { allowed: boolean; scope: string }) => {
      if (!perm.allowed) throw new Error("Permission denied");
    });

    const now = Date.now();
    const db = createSupabaseDb();

    // --- INSERT company directly to Supabase ---
    const companyId = await db.insert("companies", {
      organizationId: String(args.organizationId),
      name: args.name,
      domain: args.domain ?? null,
      industry: args.industry ?? null,
      size: args.size ?? null,
      website: args.website ?? null,
      phone: args.phone ?? null,
      address: args.address ?? null,
      notes: args.notes ?? null,
      tags: args.tags ?? null,
      tagIds: args.tagIds ?? null,
      categoryId: args.categoryId ?? null,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    // --- Delegate Convex-only side effects ---
    try {
      await ctx.runMutation(internal.companies._createSideEffects, {
        companyId,
        organizationId: args.organizationId,
        name: args.name,
        customFields: args.customFields,
        createdBy: String(authResult.userId),
        createdAt: now,
      });
    } catch (e) {
      console.error("[companies.create] Side effects FAILED for company", companyId, ":", e);
    }

    return companyId;
  },
});

export const _createSideEffects = internalMutation({
  args: {
    companyId: v.string(),
    organizationId: v.id("organizations"),
    name: v.string(),
    customFields: v.optional(v.array(v.object({
      fieldDefinitionId: v.string(),
      value: v.any(),
    }))),
    createdBy: v.string(),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    const createdByUserId = args.createdBy as Id<"users">;

    // Insert custom field values into Convex
    if (args.customFields) {
      for (const field of args.customFields) {
        await ctx.db.insert("customFieldValues", {
          organizationId: args.organizationId,
          fieldDefinitionId: field.fieldDefinitionId as Id<"customFieldDefinitions">,
          entityType: "company",
          entityId: args.companyId as Id<"companies">,
          value: field.value,
          createdAt: args.createdAt,
          updatedAt: args.createdAt,
        });
      }
    }

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "company",
      entityId: args.companyId as Id<"companies">,
      action: "created",
      description: `Created company "${args.name}"`,
      performedBy: createdByUserId,
    });
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    companyId: v.string(),
    name: v.optional(v.string()),
    domain: v.optional(v.union(v.string(), v.null())),
    industry: v.optional(v.union(v.string(), v.null())),
    size: v.optional(v.union(v.string(), v.null())),
    website: v.optional(v.union(v.string(), v.null())),
    phone: v.optional(v.union(v.string(), v.null())),
    address: v.optional(v.union(v.object({
      street: v.optional(v.string()),
      city: v.optional(v.string()),
      state: v.optional(v.string()),
      zip: v.optional(v.string()),
      country: v.optional(v.string()),
    }), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
    tags: v.optional(v.array(v.string())),
    customFields: v.optional(v.array(v.object({
      fieldDefinitionId: v.string(),
      value: v.any(),
    }))),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "companies",
        action: "edit",
      },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    // --- Read company from Supabase ---
    const company = await db.get("companies", args.companyId);
    if (!company || String(company.organizationId) !== String(args.organizationId)) {
      throw new Error("Company not found");
    }
    if (perm.scope === "own" && String(company.createdBy) !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    // --- Build updates and PATCH to Supabase ---
    const { organizationId, companyId, customFields, ...updates } = args;
    await db.patch("companies", companyId, { ...updates, updatedAt: Date.now() });

    // --- Delegate Convex-only side effects ---
    try {
      await ctx.runMutation(internal.companies._updateSideEffects, {
        companyId,
        organizationId,
        name: (company.name as string) ?? "",
        customFields,
        updatedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[companies.update] Side effects FAILED for company", companyId, ":", e);
    }

    return companyId;
  },
});

export const _updateSideEffects = internalMutation({
  args: {
    companyId: v.string(),
    organizationId: v.id("organizations"),
    name: v.string(),
    customFields: v.optional(v.array(v.object({
      fieldDefinitionId: v.string(),
      value: v.any(),
    }))),
    updatedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const updatedByUserId = args.updatedBy as Id<"users">;
    const now = Date.now();

    // Update custom field values in Convex
    if (args.customFields) {
      for (const field of args.customFields) {
        const existing = await ctx.db
          .query("customFieldValues")
          .withIndex("by_orgEntityField", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("entityType", "company")
              .eq("entityId", args.companyId as Id<"companies">)
              .eq("fieldDefinitionId", field.fieldDefinitionId as Id<"customFieldDefinitions">)
          )
          .unique();

        if (existing) {
          await ctx.db.patch(existing._id, { value: field.value, updatedAt: now });
        } else {
          await ctx.db.insert("customFieldValues", {
            organizationId: args.organizationId,
            fieldDefinitionId: field.fieldDefinitionId as Id<"customFieldDefinitions">,
            entityType: "company",
            entityId: args.companyId as Id<"companies">,
            value: field.value,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "company",
      entityId: args.companyId as Id<"companies">,
      action: "updated",
      description: `Updated company "${args.name}"`,
      performedBy: updatedByUserId,
    });
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    companyId: v.string(),
  },
  handler: async (ctx, args) => {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "companies",
        action: "delete",
      },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    // --- Read company from Supabase ---
    const company = await db.get("companies", args.companyId);
    if (!company || String(company.organizationId) !== String(args.organizationId)) {
      throw new Error("Company not found");
    }
    if (perm.scope === "own" && String(company.createdBy) !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only delete your own records");
    }

    // --- DELETE from Supabase ---
    await db.delete("companies", args.companyId);

    // --- Delegate Convex-only side effects ---
    try {
      await ctx.runMutation(internal.companies._removeSideEffects, {
        companyId: args.companyId,
        organizationId: args.organizationId,
        name: (company.name as string) ?? "",
        deletedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[companies.remove] Side effects FAILED for company", args.companyId, ":", e);
    }

    return args.companyId;
  },
});

export const _removeSideEffects = internalMutation({
  args: {
    companyId: v.string(),
    organizationId: v.id("organizations"),
    name: v.string(),
    deletedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const deletedByUserId = args.deletedBy as Id<"users">;

    // Delete custom field values from Convex
    const customValues = await ctx.db
      .query("customFieldValues")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "company").eq("entityId", args.companyId as Id<"companies">)
      )
      .collect();
    for (const cv of customValues) {
      await ctx.db.delete(cv._id);
    }

    // Delete relationships where this company is source or target
    const sourceRels = await ctx.db
      .query("objectRelationships")
      .withIndex("by_source", (q) =>
        q.eq("sourceType", "company").eq("sourceId", args.companyId as Id<"companies">)
      )
      .collect();
    const targetRels = await ctx.db
      .query("objectRelationships")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "company").eq("targetId", args.companyId as Id<"companies">)
      )
      .collect();
    for (const rel of [...sourceRels, ...targetRels]) {
      await ctx.db.delete(rel._id);
    }

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "company",
      entityId: args.companyId as Id<"companies">,
      action: "deleted",
      description: `Deleted company "${args.name}"`,
      performedBy: deletedByUserId,
    });
  },
});
