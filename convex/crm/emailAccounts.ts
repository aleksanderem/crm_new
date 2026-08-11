import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { v } from "convex/values";

// Source of truth: Supabase `email_accounts`. The Convex `emailAccounts`
// table is the pre-migration schema and is no longer being written to —
// `upsert`/`remove` below go straight to Supabase, and the frontend reads
// via `useSupabaseEmailAccounts` (see src/hooks/use-supabase-email-config.ts).
// The `oauthConnections` table, by contrast, is still Convex-owned (sensitive
// tokens stay in Convex), which is why convex/documents/signing.ts reads the
// default sender from Supabase but the Gmail access token from Convex.

export const upsert = action({
  args: {
    organizationId: v.id("organizations"),
    fromName: v.string(),
    fromEmail: v.string(),
    isDefault: v.boolean(),
  },
  handler: async (ctx, args) => {
    // --- Auth: require admin ---
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Admin access required");
    }

    const now = Date.now();
    const db = createSupabaseDb();

    // If setting as default, clear existing defaults
    if (args.isDefault) {
      const existing = await db.query("emailAccounts")
        .eq("organizationId", String(args.organizationId))
        .collect();

      for (const account of existing) {
        if (account.isDefault) {
          await db.patch("emailAccounts", account._id as string, {
            isDefault: false,
            updatedAt: now,
          });
        }
      }
    }

    // Check if account with same fromEmail already exists for this org
    const accounts = await db.query("emailAccounts")
      .eq("organizationId", String(args.organizationId))
      .collect();
    const existingAccount = accounts.find((a: any) => a.fromEmail === args.fromEmail);

    if (existingAccount) {
      await db.patch("emailAccounts", existingAccount._id as string, {
        fromName: args.fromName,
        isDefault: args.isDefault,
        updatedAt: now,
      });
      return existingAccount._id as string;
    }

    const accountId = await db.insert("emailAccounts", {
      organizationId: String(args.organizationId),
      fromName: args.fromName,
      fromEmail: args.fromEmail,
      isDefault: args.isDefault,
      createdAt: now,
      updatedAt: now,
    });

    return accountId;
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    accountId: v.string(),
  },
  handler: async (ctx, args) => {
    // --- Auth: require admin ---
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Admin access required");
    }

    const db = createSupabaseDb();

    const account = await db.get("emailAccounts", args.accountId);
    if (!account || String(account.organizationId) !== String(args.organizationId)) {
      throw new Error("Email account not found");
    }

    await db.delete("emailAccounts", args.accountId);

    return args.accountId;
  },
});
