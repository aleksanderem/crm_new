/**
 * Convex → Supabase Email Account Write Actions
 *
 * Internal actions that persist email account data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient, upsertWithFkRetry } from "./client";

export const writeEmailAccountToSupabase = internalAction({
  args: {
    accountId: v.string(),
    organizationId: v.string(),
    fromName: v.string(),
    fromEmail: v.string(),
    isDefault: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.accountId,
      organization_id: args.organizationId,
      from_name: args.fromName,
      from_email: args.fromEmail,
      is_default: args.isDefault,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const data = await upsertWithFkRetry(client, "email_accounts", row);

    console.info(`EmailAccount written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteEmailAccountFromSupabase = internalAction({
  args: {
    accountId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("email_accounts")
      .delete()
      .eq("id", args.accountId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for email_account ${args.accountId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`EmailAccount deleted from Supabase id=${args.accountId} org=${args.organizationId}`);
    return { success: true, id: args.accountId };
  },
});
