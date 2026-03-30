import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { verifyOrgAccess } from "./_helpers/auth";
import { publishActivityEnvelope } from "./_helpers/activityEnvelope";

// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const writeNoteRef = internal.supabase.notes.writeNoteToSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const updateNoteRef = internal.supabase.notes.updateNoteInSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const deleteNoteRef = internal.supabase.notes.deleteNoteFromSupabase;

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

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    entityType: v.string(),
    entityId: v.string(),
    content: v.string(),
    parentNoteId: v.optional(v.id("notes")),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();

    const noteId = await ctx.db.insert("notes", {
      organizationId: args.organizationId,
      entityType: args.entityType,
      entityId: args.entityId,
      content: args.content,
      parentNoteId: args.parentNoteId,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    await publishActivityEnvelope(ctx, {
      organizationId: args.organizationId,
      action: "note_added",
      performedBy: user._id,
      module: "crm",
      summary: "Added a note",
      occurredAt: now,
      actor: {
        type: "user",
        userId: user._id,
      },
      payload: {
        noteId,
        noteContent: args.content,
      },
      eventKey: `crm:note:${args.entityType}:${args.entityId}:${noteId}:note_added`,
      targets: [
        {
          entityType: args.entityType,
          entityId: args.entityId,
        },
      ],
    });

    // Dual-write: replicate new note to Supabase
    await ctx.scheduler.runAfter(0, writeNoteRef, {
      noteId: noteId as string,
      organizationId: args.organizationId as string,
      entityType: args.entityType,
      entityId: args.entityId,
      content: args.content,
      parentNoteId: args.parentNoteId as string | undefined,
      createdBy: user._id as string,
      createdAt: now,
      updatedAt: now,
    });

    return noteId;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    noteId: v.id("notes"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    const note = await ctx.db.get(args.noteId);
    if (!note || note.organizationId !== args.organizationId) {
      throw new Error("Note not found");
    }

    await ctx.db.patch(args.noteId, {
      content: args.content,
      updatedAt: Date.now(),
    });

    // Dual-write: replicate update to Supabase
    await ctx.scheduler.runAfter(0, updateNoteRef, {
      noteId: args.noteId as string,
      organizationId: args.organizationId as string,
      content: args.content,
      updatedAt: Date.now(),
    });

    await publishActivityEnvelope(ctx, {
      organizationId: args.organizationId,
      action: "updated",
      performedBy: user._id,
      module: "crm",
      summary: "Updated a note",
      occurredAt: Date.now(),
      actor: {
        type: "user",
        userId: user._id,
      },
      payload: {
        noteId: args.noteId,
        noteContent: args.content,
      },
      eventKey: `crm:note:${note.entityType}:${note.entityId}:${args.noteId}:updated`,
      targets: [
        {
          entityType: note.entityType,
          entityId: note.entityId,
        },
      ],
    });

    return args.noteId;
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    noteId: v.id("notes"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    const note = await ctx.db.get(args.noteId);
    if (!note || note.organizationId !== args.organizationId) {
      throw new Error("Note not found");
    }

    // Delete child notes (replies)
    const children = await ctx.db
      .query("notes")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const childNotes = children.filter((n) => n.parentNoteId === args.noteId);
    for (const child of childNotes) {
      await ctx.db.delete(child._id);
    }

    // Dual-write: schedule delete from Supabase BEFORE removing from Convex
    await ctx.scheduler.runAfter(0, deleteNoteRef, {
      noteId: args.noteId as string,
      organizationId: args.organizationId as string,
    });

    await ctx.db.delete(args.noteId);

    await publishActivityEnvelope(ctx, {
      organizationId: args.organizationId,
      action: "deleted",
      performedBy: user._id,
      module: "crm",
      summary: "Deleted a note",
      occurredAt: Date.now(),
      actor: {
        type: "user",
        userId: user._id,
      },
      payload: {
        noteId: args.noteId,
      },
      eventKey: `crm:note:${note.entityType}:${note.entityId}:${args.noteId}:deleted`,
      targets: [
        {
          entityType: note.entityType,
          entityId: note.entityId,
        },
      ],
    });

    return args.noteId;
  },
});

export const togglePin = mutation({
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

    await ctx.db.patch(args.noteId, {
      isPinned: !note.isPinned,
      updatedAt: Date.now(),
    });

    // Dual-write: replicate pin toggle to Supabase
    await ctx.scheduler.runAfter(0, updateNoteRef, {
      noteId: args.noteId as string,
      organizationId: args.organizationId as string,
      isPinned: !note.isPinned,
      updatedAt: Date.now(),
    });

    return args.noteId;
  },
});
