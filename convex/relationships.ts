import { query, action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";
import { logActivity } from "./_helpers/activities";
import { Id } from "./_generated/dataModel";

// Dual-write refs removed — Supabase is now primary for relationship writes

export const getForSources = query({
  args: {
    organizationId: v.id("organizations"),
    sourceType: v.string(),
    sourceIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const result: Record<
      string,
      Array<{
        targetType: string;
        targetId: string;
        targetName: string;
        targetSublabel?: string;
      }>
    > = {};

    for (const sourceId of args.sourceIds) {
      const rels = await ctx.db
        .query("objectRelationships")
        .withIndex("by_source", (q) =>
          q.eq("sourceType", args.sourceType).eq("sourceId", sourceId)
        )
        .collect();

      const resolved = await Promise.all(
        rels.map(async (rel) => {
          let targetName = rel.targetId;
          let targetSublabel: string | undefined;

          try {
            if (rel.targetType === "contact") {
              const contact = await ctx.db.get(rel.targetId as any);
              if (contact) {
                targetName = `${(contact as any).firstName}${(contact as any).lastName ? ` ${(contact as any).lastName}` : ""}`;
                targetSublabel = (contact as any).email;
              }
            } else if (rel.targetType === "company") {
              const company = await ctx.db.get(rel.targetId as any);
              if (company) {
                targetName = (company as any).name;
                targetSublabel = (company as any).domain;
              }
            } else if (rel.targetType === "lead" || rel.targetType === "deal") {
              const lead = await ctx.db.get(rel.targetId as any);
              if (lead) {
                targetName = (lead as any).title;
                targetSublabel = (lead as any).value
                  ? `$${(lead as any).value.toLocaleString()}`
                  : undefined;
              }
            }
          } catch {
            // Entity may have been deleted — keep the raw ID
          }

          return {
            targetType: rel.targetType,
            targetId: rel.targetId,
            targetName,
            targetSublabel,
          };
        })
      );

      result[sourceId] = resolved;
    }

    return result;
  },
});

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

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    sourceType: v.string(),
    sourceId: v.string(),
    targetType: v.string(),
    targetId: v.string(),
    relationshipType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    // Check for duplicate via internalMutation (needs ctx.db queries with indexes)
    const hasDuplicate = await ctx.runQuery(
      internal.relationships._checkDuplicate,
      {
        organizationId: args.organizationId,
        sourceType: args.sourceType,
        sourceId: args.sourceId,
        targetType: args.targetType,
        targetId: args.targetId,
      },
    );
    if (hasDuplicate) throw new Error("Relationship already exists");

    const now = Date.now();
    const db = createSupabaseDb();

    const relId = await db.insert("objectRelationships", {
      organizationId: String(args.organizationId),
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      targetType: args.targetType,
      targetId: args.targetId,
      relationshipType: args.relationshipType ?? null,
      createdBy: String(authResult.userId),
      createdAt: now,
    });

    try {
      await ctx.runMutation(internal.relationships._createSideEffects, {
        organizationId: args.organizationId,
        sourceType: args.sourceType,
        sourceId: args.sourceId,
        targetType: args.targetType,
        targetId: args.targetId,
        createdBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[relationships.create] Side effects FAILED for relationship", relId, ":", e);
    }

    return relId;
  },
});

export const _checkDuplicate = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    sourceType: v.string(),
    sourceId: v.string(),
    targetType: v.string(),
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
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
    return !!duplicate;
  },
});

export const _createSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    sourceType: v.string(),
    sourceId: v.string(),
    targetType: v.string(),
    targetId: v.string(),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: args.sourceType,
      entityId: args.sourceId,
      action: "relationship_added",
      description: `Added relationship to ${args.targetType} entity`,
      metadata: { targetType: args.targetType, targetId: args.targetId },
      performedBy: args.createdBy as Id<"users">,
    });
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    relationshipId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();

    const rel = await db.get("objectRelationships", args.relationshipId);
    if (!rel || String(rel.organizationId) !== String(args.organizationId)) {
      throw new Error("Relationship not found");
    }

    // Delete from Supabase
    await db.delete("objectRelationships", args.relationshipId);

    try {
      await ctx.runMutation(internal.relationships._removeSideEffects, {
        organizationId: args.organizationId,
        sourceType: String(rel.sourceType),
        sourceId: String(rel.sourceId),
        targetType: String(rel.targetType),
        targetId: String(rel.targetId),
        deletedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[relationships.remove] Side effects FAILED for relationship", args.relationshipId, ":", e);
    }

    return args.relationshipId;
  },
});

export const _removeSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    sourceType: v.string(),
    sourceId: v.string(),
    targetType: v.string(),
    targetId: v.string(),
    deletedBy: v.string(),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: args.sourceType,
      entityId: args.sourceId,
      action: "relationship_removed",
      description: `Removed relationship to ${args.targetType} entity`,
      metadata: { targetType: args.targetType, targetId: args.targetId },
      performedBy: args.deletedBy as Id<"users">,
    });
  },
});
