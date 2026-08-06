import { internalAction } from "../_generated/server";
import { createServiceRoleClient } from "../supabase/client";

/**
 * Migration: Rename provider "gmail" -> "google" on existing emails,
 * then match emails to mailProviders by org + fromEmail.
 * Run in batches until processed === 0.
 */
export const backfillEmailProviders = internalAction({
  args: {},
  handler: async (_ctx, _args): Promise<{ processed: number }> => {
    const client = createServiceRoleClient();

    // 1. Rename provider "gmail" -> "google"
    const { data: gmailEmails } = await client
      .from("emails")
      .select("id")
      .eq("provider", "gmail")
      .limit(100);

    for (const email of gmailEmails ?? []) {
      await client.from("emails").update({ provider: "google" }).eq("id", email.id);
    }

    // 2. Match emails to mailProviders by org + fromEmail
    const { data: unmatchedEmails } = await client
      .from("emails")
      .select("id, organization_id, from")
      .is("mail_provider_id", null)
      .not("from", "is", null)
      .limit(100);

    for (const email of unmatchedEmails ?? []) {
      const { data: provider } = await client
        .from("mail_providers")
        .select("id")
        .eq("organization_id", email.organization_id)
        .eq("from_email", email.from!)
        .maybeSingle();

      if (provider) {
        await client
          .from("emails")
          .update({ mail_provider_id: provider.id })
          .eq("id", email.id);
      }
    }

    return {
      processed: (gmailEmails?.length ?? 0) + (unmatchedEmails?.length ?? 0),
    };
  },
});

/**
 * Migration: Convert existing emailAccounts to mailProviders.
 * Run once after deploying the new schema.
 */
export const migrateEmailAccounts = internalAction({
  args: {},
  handler: async (_ctx, _args): Promise<{ migrated: number }> => {
    const client = createServiceRoleClient();

    const { data: accounts } = await client.from("email_accounts").select("*");

    let migrated = 0;

    for (const account of accounts ?? []) {
      const { data: existing } = await client
        .from("mail_providers")
        .select("id")
        .eq("organization_id", account.organization_id)
        .eq("from_email", account.from_email)
        .maybeSingle();

      if (existing) continue;

      const { error } = await client.from("mail_providers").insert({
        organization_id: account.organization_id,
        name: account.from_name,
        provider_type: "resend",
        from_name: account.from_name,
        from_email: account.from_email,
        capabilities: { canSend: true, canReceive: false, canSync: false },
        is_default: account.is_default,
        is_shared: true,
        status: "active",
        created_at: account.created_at,
        updated_at: account.updated_at,
      });

      if (!error) migrated++;
    }

    return { migrated };
  },
});
