import { query, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";
import { publishActivityEnvelope } from "./_helpers/activityEnvelope";
import { Id } from "./_generated/dataModel";

// Dual-write refs removed — Supabase is now primary for note writes

export const listByEntity = query({
  args: {
    organizationId: v.id("organizations"),
    entityType: v.string(),
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const notes = await ctx.db
      .query("notes")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId)
      )
      .collect();

    // Sort: pinned first, then by createdAt desc
    notes.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.createdAt - a.createdAt;
    });

    // Enrich with author names
    const authorIds = [...new Set(notes.map((n) => n.createdBy))];
    const authors = await Promise.all(authorIds.map((id) => ctx.db.get(id)));
    const authorMap = new Map(
      authors.filter(Boolean).map((u) => [u!._id, u!.name ?? u!.email ?? null]),
    );

    return notes.map((n) => ({
      ...n,
      authorName: authorMap.get(n.createdBy) ?? null,
    }));
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    noteId: v.id("notes"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const note = await ctx.db.get(args.noteId);
    if (!note || note.organizationId !== args.organizationId) {
      throw new Error("Note not found");
    }

    return note;
  },
});

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    entityType: v.string(),
    entityId: v.string(),
    content: v.string(),
    parentNoteId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const now = Date.now();
    const db = createSupabaseDb();

    const noteId = await db.insert("notes", {
      organizationId: String(args.organizationId),
      entityType: args.entityType,
      entityId: args.entityId,
      content: args.content,
      parentNoteId: args.parentNoteId ?? null,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    try {
      await ctx.runMutation(internal.notes._createSideEffects, {
        noteId,
        organizationId: args.organizationId,
        entityType: args.entityType,
        entityId: args.entityId,
        content: args.content,
        createdBy: String(authResult.userId),
        createdAt: now,
      });
    } catch (e) {
      console.error("[notes.create] Side effects FAILED for note", noteId, ":", e);
    }

    return noteId;
  },
});

export const _createSideEffects = internalMutation({
  args: {
    noteId: v.string(),
    organizationId: v.id("organizations"),
    entityType: v.string(),
    entityId: v.string(),
    content: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    await publishActivityEnvelope(ctx, {
      organizationId: args.organizationId,
      action: "note_added",
      performedBy: args.createdBy as Id<"users">,
      module: "crm",
      summary: "Added a note",
      occurredAt: args.createdAt,
      actor: {
        type: "user",
        userId: args.createdBy as Id<"users">,
      },
      payload: {
        noteId: args.noteId,
        noteContent: args.content,
      },
      eventKey: `crm:note:${args.entityType}:${args.entityId}:${args.noteId}:note_added`,
      targets: [
        {
          entityType: args.entityType,
          entityId: args.entityId,
        },
      ],
    });
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    noteId: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();

    const note = await db.get("notes", args.noteId);
    if (!note || String(note.organizationId) !== String(args.organizationId)) {
      throw new Error("Note not found");
    }

    const now = Date.now();
    await db.patch("notes", args.noteId, {
      content: args.content,
      updatedAt: now,
    });

    try {
      await ctx.runMutation(internal.notes._updateSideEffects, {
        noteId: args.noteId,
        organizationId: args.organizationId,
        entityType: String(note.entityType),
        entityId: String(note.entityId),
        content: args.content,
        updatedBy: String(authResult.userId),
        updatedAt: now,
      });
    } catch (e) {
      console.error("[notes.update] Side effects FAILED for note", args.noteId, ":", e);
    }

    return args.noteId;
  },
});

export const _updateSideEffects = internalMutation({
  args: {
    noteId: v.string(),
    organizationId: v.id("organizations"),
    entityType: v.string(),
    entityId: v.string(),
    content: v.string(),
    updatedBy: v.string(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await publishActivityEnvelope(ctx, {
      organizationId: args.organizationId,
      action: "updated",
      performedBy: args.updatedBy as Id<"users">,
      module: "crm",
      summary: "Updated a note",
      occurredAt: args.updatedAt,
      actor: {
        type: "user",
        userId: args.updatedBy as Id<"users">,
      },
      payload: {
        noteId: args.noteId,
        noteContent: args.content,
      },
      eventKey: `crm:note:${args.entityType}:${args.entityId}:${args.noteId}:updated`,
      targets: [
        {
          entityType: args.entityType,
          entityId: args.entityId,
        },
      ],
    });
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    noteId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();

    const note = await db.get("notes", args.noteId);
    if (!note || String(note.organizationId) !== String(args.organizationId)) {
      throw new Error("Note not found");
    }

    // Delete child notes (replies) via internalMutation
    await ctx.runMutation(internal.notes._removeChildNotes, {
      organizationId: args.organizationId,
      parentNoteId: args.noteId,
    });

    // Delete from Supabase
    await db.delete("notes", args.noteId);

    try {
      await ctx.runMutation(internal.notes._removeSideEffects, {
        noteId: args.noteId,
        organizationId: args.organizationId,
        entityType: String(note.entityType),
        entityId: String(note.entityId),
        deletedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[notes.remove] Side effects FAILED for note", args.noteId, ":", e);
    }

    return args.noteId;
  },
});

export const _removeChildNotes = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    parentNoteId: v.string(),
  },
  handler: async (ctx, args) => {
    const children = await ctx.db
      .query("notes")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const childNotes = children.filter((n) => n.parentNoteId === args.parentNoteId as any);
    for (const child of childNotes) {
      await ctx.db.delete(child._id);
    }
  },
});

export const _removeSideEffects = internalMutation({
  args: {
    noteId: v.string(),
    organizationId: v.id("organizations"),
    entityType: v.string(),
    entityId: v.string(),
    deletedBy: v.string(),
  },
  handler: async (ctx, args) => {
    await publishActivityEnvelope(ctx, {
      organizationId: args.organizationId,
      action: "deleted",
      performedBy: args.deletedBy as Id<"users">,
      module: "crm",
      summary: "Deleted a note",
      occurredAt: Date.now(),
      actor: {
        type: "user",
        userId: args.deletedBy as Id<"users">,
      },
      payload: {
        noteId: args.noteId,
      },
      eventKey: `crm:note:${args.entityType}:${args.entityId}:${args.noteId}:deleted`,
      targets: [
        {
          entityType: args.entityType,
          entityId: args.entityId,
        },
      ],
    });
  },
});

export const togglePin = action({
  args: {
    organizationId: v.id("organizations"),
    noteId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();

    const note = await db.get("notes", args.noteId);
    if (!note || String(note.organizationId) !== String(args.organizationId)) {
      throw new Error("Note not found");
    }

    await db.patch("notes", args.noteId, {
      isPinned: !note.isPinned,
      updatedAt: Date.now(),
    });

    return args.noteId;
  },
});
