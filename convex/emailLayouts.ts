import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";

// Dual-write refs removed — Supabase is now primary for email layout writes

// ---------------------------------------------------------------------------
// Actions (Supabase-primary)
// ---------------------------------------------------------------------------

export const upsert = action({
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
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const now = Date.now();

    const existing = await db.query("emailLayouts")
      .eq("organizationId", String(args.organizationId))
      .first();

    const data: Record<string, unknown> = {
      organizationId: String(args.organizationId),
      headerBlocks: args.headerBlocks,
      footerBlocks: args.footerBlocks,
      backgroundColor: args.backgroundColor,
      contentBackgroundColor: args.contentBackgroundColor,
      primaryColor: args.primaryColor,
      logoUrl: args.logoUrl ?? null,
      companyName: args.companyName ?? null,
      footerText: args.footerText ?? null,
      updatedBy: String(authResult.userId),
      updatedAt: now,
    };

    if (existing) {
      await db.patch("emailLayouts", existing._id as string, data);
      return existing._id as string;
    }

    const layoutId = await db.insert("emailLayouts", data);
    return layoutId;
  },
});
