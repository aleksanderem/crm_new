import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";
import { logActivity } from "./_helpers/activities";

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

    return notes;
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

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: args.entityType,
      entityId: args.entityId,
      action: "note_added",
      description: `Added a note`,
      performedBy: user._id,
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

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: note.entityType,
      entityId: note.entityId,
      action: "updated",
      description: `Updated a note`,
      performedBy: user._id,
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

    await ctx.db.delete(args.noteId);

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: note.entityType,
      entityId: note.entityId,
      action: "deleted",
      description: `Deleted a note`,
      performedBy: user._id,
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

    return args.noteId;
  },
});
