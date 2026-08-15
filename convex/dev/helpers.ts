import { query, action } from "../_generated/server";
import { v } from "convex/values";
import { createSupabaseDb } from "../_helpers/supabaseDb";

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
export const countDocs = action({
  args: { organizationId: v.id("organizations") },
  handler: async (_ctx, args) => {
    const db = createSupabaseDb();
    const templates = await db
      .query("formTemplates")
      .eq("organizationId", String(args.organizationId))
      .collect();
    const components = await db
      .query("documentComponents")
      .eq("scope", "system")
      .collect();
    return {
      templateCount: templates.length,
      templateNames: templates.map((t) => t.name),
      componentCount: components.length,
      componentNames: components.map((c) => c.name),
    };
  },
});
