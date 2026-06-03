import { query, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { verifyOrgAccess } from "./_helpers/auth";
import { logActivity } from "./_helpers/activities";
import { checkPermission } from "./_helpers/permissions";
import { Id } from "./_generated/dataModel";

// Dual-write refs removed — Supabase is now primary for contact writes

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "contacts", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const result = await ctx.db
      .query("contacts")
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
    contactId: v.id("contacts"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "contacts", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.organizationId !== args.organizationId) {
      throw new Error("Contact not found");
    }
    if (perm.scope === "own" && contact.createdBy !== user._id) {
      throw new Error("Permission denied");
    }

    const [customFieldValues, relationships] = await Promise.all([
      ctx.db
        .query("customFieldValues")
        .withIndex("by_entity", (q) =>
          q.eq("entityType", "contact").eq("entityId", args.contactId)
        )
        .collect(),
      ctx.db
        .query("objectRelationships")
        .withIndex("by_source", (q) =>
          q.eq("sourceType", "contact").eq("sourceId", args.contactId)
        )
        .collect(),
    ]);

    const targetRelationships = await ctx.db
      .query("objectRelationships")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "contact").eq("targetId", args.contactId)
      )
      .collect();

    return {
      ...contact,
      customFieldValues,
      relationships: [...relationships, ...targetRelationships],
    };
  },
});

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    firstName: v.string(),
    lastName: v.optional(v.union(v.string(), v.null())),
    email: v.optional(v.union(v.string(), v.null())),
    phone: v.optional(v.union(v.string(), v.null())),
    title: v.optional(v.union(v.string(), v.null())),
    avatarUrl: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
    source: v.optional(v.union(v.string(), v.null())),
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
      feature: "contacts",
      action: "create",
    }).then((perm: { allowed: boolean; scope: string }) => {
      if (!perm.allowed) throw new Error("Permission denied");
    });

    const now = Date.now();
    const db = createSupabaseDb();

    // --- INSERT contact directly to Supabase ---
    const contactId = await db.insert("contacts", {
      organizationId: String(args.organizationId),
      firstName: args.firstName,
      lastName: args.lastName ?? null,
      email: args.email ?? null,
      phone: args.phone ?? null,
      title: args.title ?? null,
      avatarUrl: args.avatarUrl ?? null,
      notes: args.notes ?? null,
      source: args.source ?? null,
      tags: args.tags ?? null,
      tagIds: args.tagIds ?? null,
      categoryId: args.categoryId ?? null,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    // --- Delegate Convex-only side effects ---
    try {
      await ctx.runMutation(internal.contacts._createSideEffects, {
        contactId,
        organizationId: args.organizationId,
        firstName: args.firstName,
        lastName: args.lastName ?? undefined,
        customFields: args.customFields,
        createdBy: String(authResult.userId),
        createdAt: now,
      });
    } catch (e) {
      console.error("[contacts.create] Side effects FAILED for contact", contactId, ":", e);
    }

    return contactId;
  },
});

export const _createSideEffects = internalMutation({
  args: {
    contactId: v.string(),
    organizationId: v.id("organizations"),
    firstName: v.string(),
    lastName: v.optional(v.string()),
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
          entityType: "contact",
          entityId: args.contactId as Id<"contacts">,
          value: field.value,
          createdAt: args.createdAt,
          updatedAt: args.createdAt,
        });
      }
    }

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "contact",
      entityId: args.contactId as Id<"contacts">,
      action: "created",
      description: `Created contact "${args.firstName}${args.lastName ? ` ${args.lastName}` : ""}"`,
      performedBy: createdByUserId,
    });
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.union(v.string(), v.null())),
    email: v.optional(v.union(v.string(), v.null())),
    phone: v.optional(v.union(v.string(), v.null())),
    title: v.optional(v.union(v.string(), v.null())),
    avatarUrl: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
    source: v.optional(v.union(v.string(), v.null())),
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
        feature: "contacts",
        action: "edit",
      },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    // --- Read contact from Supabase ---
    const contact = await db.get("contacts", args.contactId);
    if (!contact || String(contact.organizationId) !== String(args.organizationId)) {
      throw new Error("Contact not found");
    }
    if (perm.scope === "own" && String(contact.createdBy) !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    // --- Build updates and PATCH to Supabase ---
    const { organizationId, contactId, customFields, ...updates } = args;
    await db.patch("contacts", contactId, { ...updates, updatedAt: Date.now() });

    // --- Delegate Convex-only side effects ---
    try {
      await ctx.runMutation(internal.contacts._updateSideEffects, {
        contactId,
        organizationId,
        firstName: (contact.firstName as string) ?? "",
        customFields,
        updatedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[contacts.update] Side effects FAILED for contact", contactId, ":", e);
    }

    return contactId;
  },
});

export const _updateSideEffects = internalMutation({
  args: {
    contactId: v.string(),
    organizationId: v.id("organizations"),
    firstName: v.string(),
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
              .eq("entityType", "contact")
              .eq("entityId", args.contactId as Id<"contacts">)
              .eq("fieldDefinitionId", field.fieldDefinitionId as Id<"customFieldDefinitions">)
          )
          .unique();

        if (existing) {
          await ctx.db.patch(existing._id, { value: field.value, updatedAt: now });
        } else {
          await ctx.db.insert("customFieldValues", {
            organizationId: args.organizationId,
            fieldDefinitionId: field.fieldDefinitionId as Id<"customFieldDefinitions">,
            entityType: "contact",
            entityId: args.contactId as Id<"contacts">,
            value: field.value,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "contact",
      entityId: args.contactId as Id<"contacts">,
      action: "updated",
      description: `Updated contact "${args.firstName}"`,
      performedBy: updatedByUserId,
    });
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.string(),
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
        feature: "contacts",
        action: "delete",
      },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    // --- Read contact from Supabase ---
    const contact = await db.get("contacts", args.contactId);
    if (!contact || String(contact.organizationId) !== String(args.organizationId)) {
      throw new Error("Contact not found");
    }
    if (perm.scope === "own" && String(contact.createdBy) !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only delete your own records");
    }

    // --- DELETE from Supabase ---
    await db.delete("contacts", args.contactId);

    // --- Delegate Convex-only side effects ---
    try {
      await ctx.runMutation(internal.contacts._removeSideEffects, {
        contactId: args.contactId,
        organizationId: args.organizationId,
        firstName: (contact.firstName as string) ?? "",
        deletedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[contacts.remove] Side effects FAILED for contact", args.contactId, ":", e);
    }

    return args.contactId;
  },
});

export const _removeSideEffects = internalMutation({
  args: {
    contactId: v.string(),
    organizationId: v.id("organizations"),
    firstName: v.string(),
    deletedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const deletedByUserId = args.deletedBy as Id<"users">;

    // Delete custom field values from Convex
    const customValues = await ctx.db
      .query("customFieldValues")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "contact").eq("entityId", args.contactId as Id<"contacts">)
      )
      .collect();
    for (const cv of customValues) {
      await ctx.db.delete(cv._id);
    }

    // Delete relationships where this contact is source or target
    const sourceRels = await ctx.db
      .query("objectRelationships")
      .withIndex("by_source", (q) =>
        q.eq("sourceType", "contact").eq("sourceId", args.contactId as Id<"contacts">)
      )
      .collect();
    const targetRels = await ctx.db
      .query("objectRelationships")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "contact").eq("targetId", args.contactId as Id<"contacts">)
      )
      .collect();
    for (const rel of [...sourceRels, ...targetRels]) {
      await ctx.db.delete(rel._id);
    }

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "contact",
      entityId: args.contactId as Id<"contacts">,
      action: "deleted",
      description: `Deleted contact "${args.firstName}"`,
      performedBy: deletedByUserId,
    });
  },
});
