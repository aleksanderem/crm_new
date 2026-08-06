import { action, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

// Dual-write refs removed — Supabase is now primary for brand config writes

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

export const upsert = action({
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
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const now = Date.now();
    const db = createSupabaseDb();

    // Resolve logo URL from storage
    let logoUrl: string | undefined;
    if (args.logoStorageId) {
      logoUrl = (await ctx.storage.getUrl(args.logoStorageId)) ?? undefined;
    }

    // Check if config already exists for this org
    const existing = await db.query("emailBrandConfig")
      .eq("organizationId", String(args.organizationId))
      .first();

    const data: Record<string, unknown> = {
      organizationId: String(args.organizationId),
      logoStorageId: args.logoStorageId ? String(args.logoStorageId) : null,
      logoUrl: logoUrl ?? null,
      companyName: args.companyName ?? null,
      primaryColor: args.primaryColor,
      backgroundColor: args.backgroundColor,
      contentBackgroundColor: args.contentBackgroundColor,
      textColor: args.textColor,
      secondaryTextColor: args.secondaryTextColor,
      accentColor: args.accentColor,
      footerText: args.footerText ?? null,
      socialLinks: args.socialLinks ?? null,
      updatedBy: String(authResult.userId),
      updatedAt: now,
    };

    if (existing) {
      await db.patch("emailBrandConfig", existing._id as string, data);
      return existing._id as string;
    } else {
      const configId = await db.insert("emailBrandConfig", {
        ...data,
        createdBy: String(authResult.userId),
        createdAt: now,
      });
      return configId;
    }
  },
});
