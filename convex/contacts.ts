import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { logActivity } from "./_helpers/activities";
import { Id } from "./_generated/dataModel";

// Dual-write refs removed — Supabase is now primary for contact writes
// list query removed — browser reads contacts directly from Supabase via use-supabase-contacts.ts

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
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runAction(internal._helpers.authAction.checkPermission, {
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

    // --- Write custom field values to Supabase ---
    if (args.customFields) {
      for (const field of args.customFields) {
        await db.insert("customFieldValues", {
          organizationId: String(args.organizationId),
          fieldDefinitionId: field.fieldDefinitionId,
          entityType: "contact",
          entityId: contactId,
          value: field.value,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // --- Delegate post-write side effects ---
    try {
      await ctx.runMutation(internal.contacts._createSideEffects, {
        contactId,
        organizationId: args.organizationId,
        firstName: args.firstName,
        lastName: args.lastName ?? undefined,
        createdBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
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
    createdBy: v.string(),
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const createdByUserId = args.createdBy as Id<"users">;

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "contact",
      entityId: args.contactId as Id<"contacts">,
      action: "created",
      description: `Created contact "${args.firstName}${args.lastName ? ` ${args.lastName}` : ""}"`,
      performedBy: createdByUserId,
      actorLabel: args.actorLabel,
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
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
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
    const now = Date.now();
    await db.patch("contacts", contactId, { ...updates, updatedAt: now });

    // --- Update custom field values in Supabase ---
    if (customFields) {
      for (const field of customFields) {
        const existing = await db.query("customFieldValues")
          .eq("organizationId", String(organizationId))
          .eq("entityType", "contact")
          .eq("entityId", contactId)
          .eq("fieldDefinitionId", field.fieldDefinitionId)
          .unique();
        if (existing) {
          await db.patch("customFieldValues", existing._id as string, { value: field.value, updatedAt: now });
        } else {
          await db.insert("customFieldValues", {
            organizationId: String(organizationId),
            fieldDefinitionId: field.fieldDefinitionId,
            entityType: "contact",
            entityId: contactId,
            value: field.value,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }

    // --- Delegate post-write side effects ---
    try {
      await ctx.runMutation(internal.contacts._updateSideEffects, {
        contactId,
        organizationId,
        firstName: (contact.firstName as string) ?? "",
        updatedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
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
    updatedBy: v.string(),
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updatedByUserId = args.updatedBy as Id<"users">;

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "contact",
      entityId: args.contactId as Id<"contacts">,
      action: "updated",
      description: `Updated contact "${args.firstName}"`,
      performedBy: updatedByUserId,
      actorLabel: args.actorLabel,
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
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
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

    // --- Delegate post-write side effects ---
    try {
      // Delete custom field values from Supabase
      const customValues = await db.query("customFieldValues")
        .eq("entityType", "contact")
        .eq("entityId", args.contactId)
        .collect();
      for (const cv of customValues) {
        await db.delete("customFieldValues", cv._id as string);
      }

      // Delete relationships where this contact is source or target from Supabase
      const sourceRels = await db.query("objectRelationships")
        .eq("sourceType", "contact")
        .eq("sourceId", args.contactId)
        .collect();
      const targetRels = await db.query("objectRelationships")
        .eq("targetType", "contact")
        .eq("targetId", args.contactId)
        .collect();
      for (const rel of [...sourceRels, ...targetRels]) {
        await db.delete("objectRelationships", rel._id as string);
      }

      await ctx.runMutation(internal.contacts._removeSideEffects, {
        contactId: args.contactId,
        organizationId: args.organizationId,
        firstName: (contact.firstName as string) ?? "",
        deletedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
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
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const deletedByUserId = args.deletedBy as Id<"users">;

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "contact",
      entityId: args.contactId as Id<"contacts">,
      action: "deleted",
      description: `Deleted contact "${args.firstName}"`,
      performedBy: deletedByUserId,
      actorLabel: args.actorLabel,
    });
  },
});
