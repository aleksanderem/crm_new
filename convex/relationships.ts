import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";
import { logActivity } from "./_helpers/activities";

export const getForEntity = query({
  args: {
    organizationId: v.id("organizations"),
    entityType: v.string(),
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const [asSource, asTarget] = await Promise.all([
      ctx.db
        .query("objectRelationships")
        .withIndex("by_source", (q) =>
          q.eq("sourceType", args.entityType).eq("sourceId", args.entityId)
        )
        .collect(),
      ctx.db
        .query("objectRelationships")
        .withIndex("by_target", (q) =>
          q.eq("targetType", args.entityType).eq("targetId", args.entityId)
        )
        .collect(),
    ]);

    return [...asSource, ...asTarget];
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    sourceType: v.string(),
    sourceId: v.string(),
    targetType: v.string(),
    targetId: v.string(),
    relationshipType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    // Prevent duplicate relationships
    const existing = await ctx.db
      .query("objectRelationships")
      .withIndex("by_sourceAndTarget", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("sourceType", args.sourceType)
          .eq("sourceId", args.sourceId)
          .eq("targetType", args.targetType)
      )
      .collect();

    const duplicate = existing.find((r) => r.targetId === args.targetId);
    if (duplicate) throw new Error("Relationship already exists");

    const relId = await ctx.db.insert("objectRelationships", {
      ...args,
      createdBy: user._id,
      createdAt: Date.now(),
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: args.sourceType,
      entityId: args.sourceId,
      action: "relationship_added",
      description: `Added relationship to ${args.targetType} entity`,
      metadata: { targetType: args.targetType, targetId: args.targetId },
      performedBy: user._id,
    });

    return relId;
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    relationshipId: v.id("objectRelationships"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    const rel = await ctx.db.get(args.relationshipId);
    if (!rel || rel.organizationId !== args.organizationId) {
      throw new Error("Relationship not found");
    }

    await ctx.db.delete(args.relationshipId);

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: rel.sourceType,
      entityId: rel.sourceId,
      action: "relationship_removed",
      description: `Removed relationship to ${rel.targetType} entity`,
      metadata: { targetType: rel.targetType, targetId: rel.targetId },
      performedBy: user._id,
    });

    return args.relationshipId;
  },
});
