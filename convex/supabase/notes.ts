/**
 * Convex → Supabase Note Write Actions
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writeNoteToSupabase = internalAction({
  args: {
    noteId: v.string(),
    organizationId: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    content: v.string(),
    isPinned: v.optional(v.boolean()),
    parentNoteId: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.noteId,
      organization_id: args.organizationId,
      entity_type: args.entityType,
      entity_id: args.entityId,
      content: args.content,
      is_pinned: args.isPinned ?? null,
      parent_note_id: args.parentNoteId ?? null,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("notes")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for note: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`Note written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateNoteInSupabase = internalAction({
  args: {
    noteId: v.string(),
    organizationId: v.string(),
    content: v.optional(v.string()),
    isPinned: v.optional(v.boolean()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.content !== undefined) row.content = args.content;
    if (args.isPinned !== undefined) row.is_pinned = args.isPinned;

    const { data, error } = await client
      .from("notes")
      .update(row)
      .eq("id", args.noteId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for note ${args.noteId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Note updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteNoteFromSupabase = internalAction({
  args: {
    noteId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("notes")
      .delete()
      .eq("id", args.noteId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for note ${args.noteId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Note deleted from Supabase id=${args.noteId} org=${args.organizationId}`);
    return { success: true, id: args.noteId };
  },
});
