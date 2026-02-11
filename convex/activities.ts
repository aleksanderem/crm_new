import { query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { verifyOrgAccess } from "./_helpers/auth";

export const getForEntity = query({
  args: {
    organizationId: v.id("organizations"),
    entityType: v.string(),
    entityId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    return await ctx.db
      .query("activities")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId)
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getRecentForOrg = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const limit = args.limit ?? 20;

    const activities = await ctx.db
      .query("activities")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .take(limit);

    return await Promise.all(
      activities.map(async (activity) => {
        const user = await ctx.db.get(activity.performedBy);
        return {
          ...activity,
          user: user
            ? { _id: user._id, name: user.name, email: user.email, image: user.image }
            : null,
        };
      })
    );
  },
});
