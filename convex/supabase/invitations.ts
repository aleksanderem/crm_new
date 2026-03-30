/**
 * Convex → Supabase Invitation Dual-Write Actions
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writeInvitationToSupabase = internalAction({
  args: {
    invitationId: v.string(),
    organizationId: v.string(),
    email: v.string(),
    role: v.string(),
    token: v.string(),
    status: v.string(),
    invitedBy: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();
    const row = {
      id: args.invitationId,
      organization_id: args.organizationId,
      email: args.email,
      role: args.role,
      token: args.token,
      status: args.status,
      invited_by: args.invitedBy,
      expires_at: args.expiresAt,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("invitations")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for invitation: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Invitation written to Supabase id=${data!.id}`);
    return { success: true, id: data!.id };
  },
});

export const updateInvitationInSupabase = internalAction({
  args: {
    invitationId: v.string(),
    status: v.optional(v.string()),
    acceptedAt: v.optional(v.number()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();
    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.status !== undefined) row.status = args.status;
    if (args.acceptedAt !== undefined) row.accepted_at = args.acceptedAt;

    const { data, error } = await client
      .from("invitations")
      .update(row)
      .eq("id", args.invitationId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for invitation ${args.invitationId}: ${error.message}`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Invitation updated in Supabase id=${data!.id}`);
    return { success: true, id: data!.id };
  },
});
