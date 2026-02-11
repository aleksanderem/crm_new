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

    const allRels = [...asSource, ...asTarget];

    // Resolve entity names for each relationship
    const resolved = await Promise.all(
      allRels.map(async (rel) => {
        // For asSource records, the "other" entity is target; for asTarget, it's source
        const isSource = rel.sourceType === args.entityType && rel.sourceId === args.entityId;
        const otherType = isSource ? rel.targetType : rel.sourceType;
        const otherId = isSource ? rel.targetId : rel.sourceId;

        let targetName = otherId;
        let targetSublabel: string | undefined;

        try {
          if (otherType === "contact") {
            const contact = await ctx.db.get(otherId as any);
            if (contact) {
              targetName = `${(contact as any).firstName}${(contact as any).lastName ? ` ${(contact as any).lastName}` : ""}`;
              targetSublabel = (contact as any).email;
            }
          } else if (otherType === "company") {
            const company = await ctx.db.get(otherId as any);
            if (company) {
              targetName = (company as any).name;
              targetSublabel = (company as any).domain;
            }
          } else if (otherType === "lead" || otherType === "deal") {
            const lead = await ctx.db.get(otherId as any);
            if (lead) {
              targetName = (lead as any).title;
              targetSublabel = (lead as any).value
                ? `$${(lead as any).value.toLocaleString()}`
                : undefined;
            }
          } else if (otherType === "document") {
            const doc = await ctx.db.get(otherId as any);
            if (doc) {
              targetName = (doc as any).name;
              targetSublabel = (doc as any).category;
            }
          }
        } catch {
          // Entity may have been deleted — keep the raw ID
        }

        return {
          ...rel,
          // Normalize: always expose the "other" side as target for the frontend
          targetType: otherType,
          targetId: otherId,
          targetName,
          targetSublabel,
        };
      })
    );

    return resolved;
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

    // Prevent duplicate relationships (check both directions)
    const [forward, reverse] = await Promise.all([
      ctx.db
        .query("objectRelationships")
        .withIndex("by_sourceAndTarget", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("sourceType", args.sourceType)
            .eq("sourceId", args.sourceId)
            .eq("targetType", args.targetType)
        )
        .collect(),
      ctx.db
        .query("objectRelationships")
        .withIndex("by_sourceAndTarget", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("sourceType", args.targetType)
            .eq("sourceId", args.targetId)
            .eq("targetType", args.sourceType)
        )
        .collect(),
    ]);

    const duplicate =
      forward.find((r) => r.targetId === args.targetId) ||
      reverse.find((r) => r.targetId === args.sourceId);
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
