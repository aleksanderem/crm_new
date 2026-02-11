import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess, requireOrgAdmin } from "./_helpers/auth";

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

export const upsert = mutation({
  args: {
    organizationId: v.id("organizations"),
    fromName: v.string(),
    fromEmail: v.string(),
    isDefault: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);
    const now = Date.now();

    // If setting as default, clear existing defaults
    if (args.isDefault) {
      const existing = await ctx.db
        .query("emailAccounts")
        .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
        .collect();

      for (const account of existing) {
        if (account.isDefault) {
          await ctx.db.patch(account._id, { isDefault: false, updatedAt: now });
        }
      }
    }

    // Check if account with same fromEmail already exists for this org
    const accounts = await ctx.db
      .query("emailAccounts")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const existingAccount = accounts.find((a) => a.fromEmail === args.fromEmail);

    if (existingAccount) {
      await ctx.db.patch(existingAccount._id, {
        fromName: args.fromName,
        isDefault: args.isDefault,
        updatedAt: now,
      });
      return existingAccount._id;
    }

    const accountId = await ctx.db.insert("emailAccounts", {
      organizationId: args.organizationId,
      fromName: args.fromName,
      fromEmail: args.fromEmail,
      isDefault: args.isDefault,
      createdAt: now,
      updatedAt: now,
    });

    return accountId;
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    accountId: v.id("emailAccounts"),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);

    const account = await ctx.db.get(args.accountId);
    if (!account || account.organizationId !== args.organizationId) {
      throw new Error("Email account not found");
    }

    await ctx.db.delete(args.accountId);
    return args.accountId;
  },
});
