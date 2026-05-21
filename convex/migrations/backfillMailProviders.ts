import type { RegisteredMutation } from "convex/server";
import { internalMutation } from "../_generated/server";

/**
 * Migration: Rename provider "gmail" -> "google" on existing emails,
 * then match emails to mailProviders by org + fromEmail.
 * Run in batches until processed === 0.
 */
export const backfillEmailProviders: RegisteredMutation<
  "internal",
  Record<string, never>,
  Promise<{ processed: number }>
> = internalMutation({
  handler: async (ctx) => {
    // 1. Rename provider "gmail" -> "google"
    const gmailEmails = await ctx.db
      .query("emails")
      .filter((q) => q.eq(q.field("provider"), "gmail" as any))
      .take(100);

    for (const email of gmailEmails) {
      await ctx.db.patch(email._id, { provider: "google" as any });
    }

    // 2. Match emails to mailProviders by org + fromEmail
    const unmatchedEmails = await ctx.db
      .query("emails")
      .filter((q) => q.eq(q.field("mailProviderId"), undefined))
      .take(100);

    for (const email of unmatchedEmails) {
      if (!email.from) continue;
      const provider = await ctx.db
        .query("mailProviders")
        .withIndex("by_org_email", (q) =>
          q.eq("organizationId", email.organizationId).eq("fromEmail", email.from!)
        )
        .first();

      if (provider) {
        await ctx.db.patch(email._id, { mailProviderId: provider._id });
      }
    }

    return { processed: gmailEmails.length + unmatchedEmails.length };
  },
});

/**
 * Migration: Convert existing emailAccounts to mailProviders.
 * Run once after deploying the new schema.
 */
export const migrateEmailAccounts: RegisteredMutation<
  "internal",
  Record<string, never>,
  Promise<{ migrated: number }>
> = internalMutation({
  handler: async (ctx) => {
    const accounts = await ctx.db.query("emailAccounts").collect();
    let migrated = 0;

    for (const account of accounts) {
      const existing = await ctx.db
        .query("mailProviders")
        .withIndex("by_org_email", (q) =>
          q.eq("organizationId", account.organizationId).eq("fromEmail", account.fromEmail)
        )
        .first();

      if (existing) continue;

      await ctx.db.insert("mailProviders", {
        organizationId: account.organizationId,
        name: account.fromName,
        providerType: "resend",
        fromName: account.fromName,
        fromEmail: account.fromEmail,
        capabilities: { canSend: true, canReceive: false, canSync: false },
        isDefault: account.isDefault,
        isShared: true,
        status: "active",
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      });
      migrated++;
    }

    return { migrated };
  },
});
