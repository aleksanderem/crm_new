import { query, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

// Dual-write refs removed — Supabase is now primary for email account writes

export const list = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    return await ctx.db
      .query("emailAccounts")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

export const upsert = action({
  args: {
    organizationId: v.id("organizations"),
    fromName: v.string(),
    fromEmail: v.string(),
    isDefault: v.boolean(),
  },
  handler: async (ctx, args) => {
    // --- Auth: require admin ---
    const authResult = await ctx.runQuery(
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
    const authResult = await ctx.runQuery(
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
