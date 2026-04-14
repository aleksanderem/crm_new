import { query } from "../_generated/server";
import { v } from "convex/values";

/** Get first org + user IDs for dev/seed scripts */
export const getDevIds = query({
  args: {},
  handler: async (ctx) => {
    const org = await ctx.db.query("organizations").first();
    const user = await ctx.db.query("users").first();
    return {
      organizationId: org?._id ?? null,
      userId: user?._id ?? null,
    };
  },
});

/** Count templates + components for a given org (no auth required) */
export const countDocs = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const templates = await ctx.db
      .query("formTemplates")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const components = await ctx.db
      .query("documentComponents")
      .withIndex("by_scope", (q) => q.eq("scope", "system"))
      .collect();
    return {
      templateCount: templates.length,
      templateNames: templates.map((t) => t.name),
      componentCount: components.length,
      componentNames: components.map((c) => c.name),
    };
  },
});
