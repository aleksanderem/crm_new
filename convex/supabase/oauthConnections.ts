/**
 * Convex → Supabase OAuth Connections Dual-Write Action
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writeOauthConnectionToSupabase = internalAction({
  args: {
    oauthConnectionId: v.string(),
    organizationId: v.string(),
    provider: v.string(),
    providerAccountId: v.string(),
    userId: v.optional(v.string()),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),
    scope: v.string(),
    tokenType: v.string(),
    isActive: v.boolean(),
    lastSyncedAt: v.optional(v.number()),
    connectedBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();

    const row = {
      id: args.oauthConnectionId,
      organization_id: args.organizationId,
      provider: args.provider,
      provider_account_id: args.providerAccountId,
      user_id: args.userId ?? null,
      access_token: args.accessToken,
      refresh_token: args.refreshToken,
      expires_at: args.expiresAt,
      scope: args.scope,
      token_type: args.tokenType,
      is_active: args.isActive,
      last_synced_at: args.lastSyncedAt ?? null,
      connected_by: args.connectedBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("oauth_connections")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for oauthConnection: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`OauthConnection written to Supabase id=${data!.id}`);
    return { success: true, id: data!.id };
  },
});
