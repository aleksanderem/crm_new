/**
 * Convex → Supabase Object Relationship Write Actions
 *
 * Relationships are created or deleted — not patched — so only write + delete.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writeRelationshipToSupabase = internalAction({
  args: {
    relationshipId: v.string(),
    organizationId: v.string(),
    sourceType: v.string(),
    sourceId: v.string(),
    targetType: v.string(),
    targetId: v.string(),
    relationshipType: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.relationshipId,
      organization_id: args.organizationId,
      source_type: args.sourceType,
      source_id: args.sourceId,
      target_type: args.targetType,
      target_id: args.targetId,
      relationship_type: args.relationshipType ?? null,
      created_by: args.createdBy,
      created_at: args.createdAt,
    };

    const { data, error } = await client
      .from("object_relationships")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for relationship: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`Relationship written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteRelationshipFromSupabase = internalAction({
  args: {
    relationshipId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("object_relationships")
      .delete()
      .eq("id", args.relationshipId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for relationship ${args.relationshipId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Relationship deleted from Supabase id=${args.relationshipId} org=${args.organizationId}`);
    return { success: true, id: args.relationshipId };
  },
});
