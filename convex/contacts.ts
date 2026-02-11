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
        .query("contacts")
        .withSearchIndex("search_contacts", (q) =>
          q.search("firstName", args.search!).eq("organizationId", args.organizationId)
        )
        .take(50);
      return { page: results, isDone: true, continueCursor: "" };
    }

    return await ctx.db
      .query("contacts")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.id("contacts"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.organizationId !== args.organizationId) {
      throw new Error("Contact not found");
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

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    title: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
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
    const { customFields, ...contactData } = args;

    const contactId = await ctx.db.insert("contacts", {
      ...contactData,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    if (customFields) {
      for (const field of customFields) {
        await ctx.db.insert("customFieldValues", {
          organizationId: args.organizationId,
          fieldDefinitionId: field.fieldDefinitionId,
          entityType: "contact",
          entityId: contactId,
          value: field.value,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "contact",
      entityId: contactId,
      action: "created",
      description: `Created contact "${args.firstName}${args.lastName ? ` ${args.lastName}` : ""}"`,
      performedBy: user._id,
    });

    return contactId;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.id("contacts"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    title: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
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

    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.organizationId !== args.organizationId) {
      throw new Error("Contact not found");
    }

    const { organizationId, contactId, customFields, ...updates } = args;
    await ctx.db.patch(contactId, { ...updates, updatedAt: now });

    if (customFields) {
      for (const field of customFields) {
        const existing = await ctx.db
          .query("customFieldValues")
          .withIndex("by_orgEntityField", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("entityType", "contact")
              .eq("entityId", contactId)
              .eq("fieldDefinitionId", field.fieldDefinitionId)
          )
          .unique();

        if (existing) {
          await ctx.db.patch(existing._id, { value: field.value, updatedAt: now });
        } else {
          await ctx.db.insert("customFieldValues", {
            organizationId,
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

    await logActivity(ctx, {
      organizationId,
      entityType: "contact",
      entityId: contactId,
      action: "updated",
      description: `Updated contact "${contact.firstName}"`,
      performedBy: user._id,
    });

    return contactId;
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.id("contacts"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.organizationId !== args.organizationId) {
      throw new Error("Contact not found");
    }

    // Delete custom field values
    const customValues = await ctx.db
      .query("customFieldValues")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "contact").eq("entityId", args.contactId)
      )
      .collect();
    for (const cv of customValues) {
      await ctx.db.delete(cv._id);
    }

    // Delete relationships where this contact is source or target
    const sourceRels = await ctx.db
      .query("objectRelationships")
      .withIndex("by_source", (q) =>
        q.eq("sourceType", "contact").eq("sourceId", args.contactId)
      )
      .collect();
    const targetRels = await ctx.db
      .query("objectRelationships")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "contact").eq("targetId", args.contactId)
      )
      .collect();
    for (const rel of [...sourceRels, ...targetRels]) {
      await ctx.db.delete(rel._id);
    }

    await ctx.db.delete(args.contactId);

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "contact",
      entityId: args.contactId,
      action: "deleted",
      description: `Deleted contact "${contact.firstName}"`,
      performedBy: user._id,
    });

    return args.contactId;
  },
});
