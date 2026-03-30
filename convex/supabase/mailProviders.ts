/**
 * Convex → Supabase Mail Provider Write Actions
 *
 * Internal actions that persist mail provider data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writeMailProviderToSupabase = internalAction({
  args: {
    providerId: v.string(),
    organizationId: v.string(),
    name: v.string(),
    providerType: v.string(),
    oauthTokens: v.optional(v.any()),
    apiConfig: v.optional(v.any()),
    fromName: v.string(),
    fromEmail: v.string(),
    replyToEmail: v.optional(v.string()),
    capabilities: v.any(),
    isDefault: v.boolean(),
    isShared: v.boolean(),
    assignedUserIds: v.optional(v.array(v.string())),
    status: v.string(),
    lastSyncAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    statusMessage: v.optional(v.string()),
    connectedBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.providerId,
      organization_id: args.organizationId,
      name: args.name,
      provider_type: args.providerType,
      oauth_tokens: args.oauthTokens ?? null,
      api_config: args.apiConfig ?? null,
      from_name: args.fromName,
      from_email: args.fromEmail,
      reply_to_email: args.replyToEmail ?? null,
      capabilities: args.capabilities,
      is_default: args.isDefault,
      is_shared: args.isShared,
      assigned_user_ids: args.assignedUserIds ?? null,
      status: args.status,
      last_sync_at: args.lastSyncAt ?? null,
      last_error: args.lastError ?? null,
      status_message: args.statusMessage ?? null,
      connected_by: args.connectedBy ?? null,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("mail_providers")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for mail_provider: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`MailProvider written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateMailProviderInSupabase = internalAction({
  args: {
    providerId: v.string(),
    organizationId: v.string(),
    name: v.optional(v.string()),
    fromName: v.optional(v.string()),
    fromEmail: v.optional(v.string()),
    replyToEmail: v.optional(v.string()),
    apiConfig: v.optional(v.any()),
    capabilities: v.optional(v.any()),
    isShared: v.optional(v.boolean()),
    isDefault: v.optional(v.boolean()),
    assignedUserIds: v.optional(v.array(v.string())),
    status: v.optional(v.string()),
    lastSyncAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    statusMessage: v.optional(v.string()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.name !== undefined) row.name = args.name;
    if (args.fromName !== undefined) row.from_name = args.fromName;
    if (args.fromEmail !== undefined) row.from_email = args.fromEmail;
    if (args.replyToEmail !== undefined) row.reply_to_email = args.replyToEmail;
    if (args.apiConfig !== undefined) row.api_config = args.apiConfig;
    if (args.capabilities !== undefined) row.capabilities = args.capabilities;
    if (args.isShared !== undefined) row.is_shared = args.isShared;
    if (args.isDefault !== undefined) row.is_default = args.isDefault;
    if (args.assignedUserIds !== undefined) row.assigned_user_ids = args.assignedUserIds;
    if (args.status !== undefined) row.status = args.status;
    if (args.lastSyncAt !== undefined) row.last_sync_at = args.lastSyncAt;
    if (args.lastError !== undefined) row.last_error = args.lastError;
    if (args.statusMessage !== undefined) row.status_message = args.statusMessage;

    const { data, error } = await client
      .from("mail_providers")
      .update(row)
      .eq("id", args.providerId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for mail_provider ${args.providerId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`MailProvider updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteMailProviderFromSupabase = internalAction({
  args: {
    providerId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("mail_providers")
      .delete()
      .eq("id", args.providerId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for mail_provider ${args.providerId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`MailProvider deleted from Supabase id=${args.providerId} org=${args.organizationId}`);
    return { success: true, id: args.providerId };
  },
});
