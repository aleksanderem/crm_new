import { action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { v } from "convex/values";
import { logActivity } from "../_helpers/activities";
import { logAudit } from "../auditLog";
import { Id } from "../_generated/dataModel";

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
      await ctx.runMutation(internal.crm.contacts._createSideEffects, {
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
      await ctx.runMutation(internal.crm.contacts._updateSideEffects, {
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

      await ctx.runMutation(internal.crm.contacts._removeSideEffects, {
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

export const gdprErase = action({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Permission denied: GDPR erasure requires owner or admin role");
    }

    const db = createSupabaseDb();
    const contact = await db.get("contacts", args.contactId);
    if (!contact || String(contact.organizationId) !== String(args.organizationId)) {
      throw new Error("Contact not found");
    }

    const originalName = `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim();
    const anonSuffix = args.contactId.slice(-6).toUpperCase();
    const orgStr = String(args.organizationId);
    const GDPR_REDACTED = "[RODO: dane usunięte]";

    await db.patch("contacts", args.contactId, {
      firstName: "ANONIMOWY",
      lastName: `#${anonSuffix}`,
      email: `deleted-${anonSuffix}@gdpr.invalid`,
      phone: null,
      title: null,
      avatarUrl: null,
      notes: null,
      tags: null,
      tagIds: null,
      categoryId: null,
      updatedAt: Date.now(),
    });

    const client = db.raw();

    await client
      .from("custom_field_values")
      .delete()
      .eq("organization_id", orgStr)
      .eq("entity_type", "contact")
      .eq("entity_id", args.contactId);

    await client
      .from("activities")
      .update({ description: GDPR_REDACTED })
      .eq("organization_id", orgStr)
      .eq("entity_type", "contact")
      .eq("entity_id", args.contactId);
    await client
      .from("notes")
      .update({ content: GDPR_REDACTED, updated_at: Date.now() })
      .eq("organization_id", orgStr)
      .eq("entity_type", "contact")
      .eq("entity_id", args.contactId);

    try {
      await ctx.runMutation(internal.crm.contacts._gdprEraseSideEffects, {
        contactId: args.contactId,
        organizationId: args.organizationId,
        originalName,
        erasedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
      });
    } catch (e) {
      console.error("[contacts.gdprErase] Side effects FAILED for contact", args.contactId, ":", e);
    }

    return args.contactId;
  },
});

export const _gdprEraseSideEffects = internalMutation({
  args: {
    contactId: v.string(),
    organizationId: v.id("organizations"),
    originalName: v.string(),
    erasedBy: v.string(),
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const erasedByUserId = args.erasedBy as Id<"users">;
    const GDPR_REDACTED = "[RODO: dane usunięte]";

    const db = createSupabaseDb();

    const existingActivities = await db
      .query("activities")
      .eq("entityType", "contact")
      .eq("entityId", args.contactId)
      .collect();
    for (const activity of existingActivities) {
      await db.patch("activities", String(activity._id), { description: GDPR_REDACTED });
    }

    const existingNotes = await db
      .query("notes")
      .eq("entityType", "contact")
      .eq("entityId", args.contactId)
      .collect();
    for (const note of existingNotes) {
      await db.patch("notes", String(note._id), { content: GDPR_REDACTED, updatedAt: Date.now() });
    }

    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: erasedByUserId,
      action: "gdpr_contact_erased",
      entityType: "contact",
      entityId: args.contactId,
      details: `GDPR erasure performed on contact "${args.originalName}" (ID: ${args.contactId})`,
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "contact",
      entityId: args.contactId as Id<"contacts">,
      action: "deleted",
      description: "RODO: dane kontaktu zostały usunięte",
      performedBy: erasedByUserId,
      actorLabel: args.actorLabel,
    });
  },
});

export const gdprExport = action({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Permission denied: GDPR export requires owner or admin role");
    }

    const db = createSupabaseDb();
    const contact = await db.get("contacts", args.contactId);
    if (!contact || String(contact.organizationId) !== String(args.organizationId)) {
      throw new Error("Contact not found");
    }

    const orgStr = String(args.organizationId);
    const client = db.raw();

    const { data: activities } = await client
      .from("activities")
      .select("action, description, created_at")
      .eq("organization_id", orgStr)
      .eq("entity_type", "contact")
      .eq("entity_id", args.contactId)
      .order("created_at", { ascending: true });

    const { data: notes } = await client
      .from("notes")
      .select("content, created_at, updated_at")
      .eq("organization_id", orgStr)
      .eq("entity_type", "contact")
      .eq("entity_id", args.contactId)
      .order("created_at", { ascending: true });

    const { data: customFieldValues } = await client
      .from("custom_field_values")
      .select("value, created_at, updated_at")
      .eq("organization_id", orgStr)
      .eq("entity_type", "contact")
      .eq("entity_id", args.contactId);

    const { data: emailRows } = await client
      .from("emails")
      .select("direction, \"from\", \"to\", cc, subject, body_text, snippet, sent_at")
      .eq("organization_id", orgStr)
      .eq("contact_id", args.contactId)
      .order("sent_at", { ascending: true });

    // Calls are linked to contacts via the polymorphic object_relationships table.
    // Check both directions: call→contact and contact→call.
    const [{ data: callRelsForward }, { data: callRelsReverse }] = await Promise.all([
      client
        .from("object_relationships")
        .select("source_id")
        .eq("organization_id", orgStr)
        .eq("source_type", "call")
        .eq("target_type", "contact")
        .eq("target_id", args.contactId),
      client
        .from("object_relationships")
        .select("target_id")
        .eq("organization_id", orgStr)
        .eq("source_type", "contact")
        .eq("source_id", args.contactId)
        .eq("target_type", "call"),
    ]);

    const callIds = [
      ...((callRelsForward ?? []).map((r: { source_id: string }) => r.source_id)),
      ...((callRelsReverse ?? []).map((r: { target_id: string }) => r.target_id)),
    ];

    let calls: unknown[] = [];
    if (callIds.length > 0) {
      const { data: callRows } = await client
        .from("calls")
        .select("outcome, call_date, note, duration, created_at")
        .in("id", callIds)
        .order("call_date", { ascending: true });
      calls = callRows ?? [];
    }

    return {
      exportedAt: new Date().toISOString(),
      contact: {
        id: args.contactId,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        title: contact.title,
        notes: contact.notes,
        source: contact.source,
        createdAt: contact.createdAt,
        updatedAt: contact.updatedAt,
      },
      activities: activities ?? [],
      notes: notes ?? [],
      customFieldValues: customFieldValues ?? [],
      emails: emailRows ?? [],
      calls,
    };
  },
});
