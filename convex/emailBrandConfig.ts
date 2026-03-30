import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";
import { internal } from "./_generated/api";

// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const writeBrandConfigRef = internal.supabase.emailBrandConfig.writeEmailBrandConfigToSupabase;

export const getForOrg = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("emailBrandConfig")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .first();
  },
});

export const upsert = mutation({
  args: {
    organizationId: v.id("organizations"),
    logoStorageId: v.optional(v.id("_storage")),
    companyName: v.optional(v.string()),
    primaryColor: v.string(),
    backgroundColor: v.string(),
    contentBackgroundColor: v.string(),
    textColor: v.string(),
    secondaryTextColor: v.string(),
    accentColor: v.string(),
    footerText: v.optional(v.string()),
    socialLinks: v.optional(
      v.object({
        website: v.optional(v.string()),
        facebook: v.optional(v.string()),
        instagram: v.optional(v.string()),
        linkedin: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();

    const existing = await ctx.db
      .query("emailBrandConfig")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .first();

    let logoUrl: string | undefined;
    if (args.logoStorageId) {
      logoUrl = (await ctx.storage.getUrl(args.logoStorageId)) ?? undefined;
    }

    const data = {
      organizationId: args.organizationId,
      logoStorageId: args.logoStorageId,
      logoUrl,
      companyName: args.companyName,
      primaryColor: args.primaryColor,
      backgroundColor: args.backgroundColor,
      contentBackgroundColor: args.contentBackgroundColor,
      textColor: args.textColor,
      secondaryTextColor: args.secondaryTextColor,
      accentColor: args.accentColor,
      footerText: args.footerText,
      socialLinks: args.socialLinks,
      updatedBy: user._id,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);

      // Dual-write: replicate update to Supabase
      await ctx.scheduler.runAfter(0, writeBrandConfigRef, {
        configId: existing._id as string,
        organizationId: args.organizationId as string,
        logoStorageId: args.logoStorageId as string | undefined,
        logoUrl,
        companyName: args.companyName,
        primaryColor: args.primaryColor,
        backgroundColor: args.backgroundColor,
        contentBackgroundColor: args.contentBackgroundColor,
        textColor: args.textColor,
        secondaryTextColor: args.secondaryTextColor,
        accentColor: args.accentColor,
        footerText: args.footerText,
        socialLinks: args.socialLinks,
        createdBy: existing.createdBy as string,
        createdAt: existing.createdAt,
        updatedBy: user._id as string,
        updatedAt: now,
      });

      return existing._id;
    } else {
      const configId = await ctx.db.insert("emailBrandConfig", {
        ...data,
        createdBy: user._id,
        createdAt: now,
      });

      // Dual-write: replicate new config to Supabase
      await ctx.scheduler.runAfter(0, writeBrandConfigRef, {
        configId: configId as string,
        organizationId: args.organizationId as string,
        logoStorageId: args.logoStorageId as string | undefined,
        logoUrl,
        companyName: args.companyName,
        primaryColor: args.primaryColor,
        backgroundColor: args.backgroundColor,
        contentBackgroundColor: args.contentBackgroundColor,
        textColor: args.textColor,
        secondaryTextColor: args.secondaryTextColor,
        accentColor: args.accentColor,
        footerText: args.footerText,
        socialLinks: args.socialLinks,
        createdBy: user._id as string,
        createdAt: now,
        updatedBy: user._id as string,
        updatedAt: now,
      });

      return configId;
    }
  },
});
