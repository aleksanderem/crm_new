import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { logActivity } from "./_helpers/activities";
import { Id } from "./_generated/dataModel";

// Dual-write refs removed — Supabase is now primary for company writes
// list query removed — browser reads companies directly from Supabase via use-supabase-companies.ts

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
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runAction(internal._helpers.authAction.checkPermission, {
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

    // --- Write custom field values to Supabase ---
    if (args.customFields) {
      for (const field of args.customFields) {
        await db.insert("customFieldValues", {
          organizationId: String(args.organizationId),
          fieldDefinitionId: field.fieldDefinitionId,
          entityType: "company",
          entityId: companyId,
          value: field.value,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // --- Delegate post-write side effects ---
    try {
      await ctx.runMutation(internal.companies._createSideEffects, {
        companyId,
        organizationId: args.organizationId,
        name: args.name,
        createdBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
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
    createdBy: v.string(),
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const createdByUserId = args.createdBy as Id<"users">;

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "company",
      entityId: args.companyId as Id<"companies">,
      action: "created",
      description: `Created company "${args.name}"`,
      performedBy: createdByUserId,
      actorLabel: args.actorLabel,
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
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
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
    const now = Date.now();
    await db.patch("companies", companyId, { ...updates, updatedAt: now });

    // --- Update custom field values in Supabase ---
    if (customFields) {
      for (const field of customFields) {
        const existing = await db.query("customFieldValues")
          .eq("organizationId", String(organizationId))
          .eq("entityType", "company")
          .eq("entityId", companyId)
          .eq("fieldDefinitionId", field.fieldDefinitionId)
          .unique();
        if (existing) {
          await db.patch("customFieldValues", existing._id as string, { value: field.value, updatedAt: now });
        } else {
          await db.insert("customFieldValues", {
            organizationId: String(organizationId),
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

    // --- Delegate post-write side effects ---
    try {
      await ctx.runMutation(internal.companies._updateSideEffects, {
        companyId,
        organizationId,
        name: (company.name as string) ?? "",
        updatedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
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
    updatedBy: v.string(),
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updatedByUserId = args.updatedBy as Id<"users">;

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "company",
      entityId: args.companyId as Id<"companies">,
      action: "updated",
      description: `Updated company "${args.name}"`,
      performedBy: updatedByUserId,
      actorLabel: args.actorLabel,
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
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
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

    // --- Delegate post-write side effects ---
    try {
      // Delete custom field values from Supabase
      const customValues = await db.query("customFieldValues")
        .eq("entityType", "company")
        .eq("entityId", args.companyId)
        .collect();
      for (const cv of customValues) {
        await db.delete("customFieldValues", cv._id as string);
      }

      // Delete relationships where this company is source or target from Supabase
      const sourceRels = await db.query("objectRelationships")
        .eq("sourceType", "company")
        .eq("sourceId", args.companyId)
        .collect();
      const targetRels = await db.query("objectRelationships")
        .eq("targetType", "company")
        .eq("targetId", args.companyId)
        .collect();
      for (const rel of [...sourceRels, ...targetRels]) {
        await db.delete("objectRelationships", rel._id as string);
      }

      await ctx.runMutation(internal.companies._removeSideEffects, {
        companyId: args.companyId,
        organizationId: args.organizationId,
        name: (company.name as string) ?? "",
        deletedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
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
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const deletedByUserId = args.deletedBy as Id<"users">;

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "company",
      entityId: args.companyId as Id<"companies">,
      action: "deleted",
      description: `Deleted company "${args.name}"`,
      performedBy: deletedByUserId,
      actorLabel: args.actorLabel,
    });
  },
});
