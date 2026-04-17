/**
 * Convex → Supabase OrgSmsConfig Dual-Write Action
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writeOrgSmsConfigToSupabase = internalAction({
  args: {
    orgSmsConfigId: v.string(),
    organizationId: v.string(),
    provider: v.string(),
    apiToken: v.string(),
    apiSecret: v.optional(v.string()),
    senderId: v.optional(v.string()),
    fromNumber: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();

    const row = {
      id: args.orgSmsConfigId,
      organization_id: args.organizationId,
      provider: args.provider,
      api_token: args.apiToken,
      api_secret: args.apiSecret ?? null,
      sender_id: args.senderId ?? null,
      from_number: args.fromNumber ?? null,
      is_active: args.isActive,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("org_sms_config")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for orgSmsConfig: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`OrgSmsConfig written to Supabase id=${data!.id}`);
    return { success: true, id: data!.id };
  },
});
