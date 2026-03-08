import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const get = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    return ctx.db
      .query("emailLayouts")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .first();
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const upsert = mutation({
  args: {
    organizationId: v.id("organizations"),
    headerBlocks: v.string(),
    footerBlocks: v.string(),
    backgroundColor: v.string(),
    contentBackgroundColor: v.string(),
    primaryColor: v.string(),
    logoUrl: v.optional(v.string()),
    companyName: v.optional(v.string()),
    footerText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    const existing = await ctx.db
      .query("emailLayouts")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .first();

    const data = {
      organizationId: args.organizationId,
      headerBlocks: args.headerBlocks,
      footerBlocks: args.footerBlocks,
      backgroundColor: args.backgroundColor,
      contentBackgroundColor: args.contentBackgroundColor,
      primaryColor: args.primaryColor,
      logoUrl: args.logoUrl,
      companyName: args.companyName,
      footerText: args.footerText,
      updatedBy: user._id,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    }

    return ctx.db.insert("emailLayouts", data);
  },
});
