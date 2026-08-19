import { action } from "../_generated/server";
import { v } from "convex/values";
import { createSupabaseDb } from "../_helpers/supabaseDb";

/** Get first org + user IDs for dev/seed scripts */
export const getDevIds = action({
  args: {},
  handler: async (_ctx) => {
    const db = createSupabaseDb();
    const org = await db.query("organizations").first();
    const user = await db.query("users").first();
    return {
      organizationId: org?._id ?? null,
      userId: user?._id ?? null,
    };
  },
});

/** Count templates + components for a given org (no auth required) */
export const countDocs = action({
  args: { organizationId: v.string() },
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
