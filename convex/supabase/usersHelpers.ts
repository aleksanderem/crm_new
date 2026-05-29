// V8-side helpers used by the Node-side users mirror action.
// Kept separate because `convex/supabase/users.ts` has `"use node"` and so
// cannot define queries; queries must run in the V8 runtime.

import { v } from "convex/values";
import { internalQuery } from "@cvx/_generated/server";

export const _listAllUsers = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.string(),
      _creationTime: v.number(),
      email: v.optional(v.string()),
      name: v.optional(v.string()),
      username: v.optional(v.string()),
      image: v.optional(v.string()),
      imageStorageId: v.optional(v.string()),
      phone: v.optional(v.string()),
      isAnonymous: v.optional(v.boolean()),
      customerId: v.optional(v.string()),
      language: v.optional(v.string()),
      theme: v.optional(v.string()),
      timezone: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const all = await ctx.db.query("users").collect();
    return all.map((u) => ({
      _id: String(u._id),
      _creationTime: u._creationTime,
      email: u.email,
      name: u.name,
      username: u.username,
      image: u.image,
      imageStorageId: u.imageId ? String(u.imageId) : undefined,
      phone: u.phone,
      isAnonymous: u.isAnonymous,
      customerId: u.customerId,
      language: u.language,
      theme: u.theme,
      timezone: u.timezone,
    }));
  },
});
