import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { logActivity } from "./_helpers/activities";
import { Id } from "./_generated/dataModel";

// Dual-write refs removed — Supabase is now primary for relationship writes

export const getForSources = action({
  args: {
    organizationId: v.id("organizations"),
    sourceType: v.string(),
    sourceIds: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<Record<
    string,
    Array<{
      targetType: string;
      targetId: string;
      targetName: string;
      targetSublabel?: string;
    }>
  >> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);

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
      const rels = (await db
        .query("objectRelationships")
        .eq("organizationId", orgIdStr)
        .eq("sourceType", args.sourceType)
        .eq("sourceId", sourceId)
        .collect()) as Array<Record<string, any>>;

      const resolved = await Promise.all(
        rels.map(async (rel) => {
          let targetName = String(rel.targetId);
          let targetSublabel: string | undefined;

          try {
            if (rel.targetType === "contact") {
              const contact = await db.get("contacts", String(rel.targetId));
              if (contact) {
                targetName = `${(contact as any).firstName}${(contact as any).lastName ? ` ${(contact as any).lastName}` : ""}`;
                targetSublabel = (contact as any).email;
              }
            } else if (rel.targetType === "company") {
              const company = await db.get("companies", String(rel.targetId));
              if (company) {
                targetName = (company as any).name;
                targetSublabel = (company as any).domain;
              }
            } else if (rel.targetType === "lead" || rel.targetType === "deal") {
              const lead = await db.get("leads", String(rel.targetId));
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
            targetType: String(rel.targetType),
            targetId: String(rel.targetId),
            targetName,
            targetSublabel,
          };
        }),
      );

      result[sourceId] = resolved;
    }

    return result;
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
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const now = Date.now();
    const db = createSupabaseDb();

    // Check for duplicates in both directions via Supabase
    const orgIdStr = String(args.organizationId);
    const [forward, reverse] = await Promise.all([
      db.query("objectRelationships")
        .eq("organizationId", orgIdStr)
        .eq("sourceType", args.sourceType)
        .eq("sourceId", args.sourceId)
        .eq("targetType", args.targetType)
        .eq("targetId", args.targetId)
        .first(),
      db.query("objectRelationships")
        .eq("organizationId", orgIdStr)
        .eq("sourceType", args.targetType)
        .eq("sourceId", args.targetId)
        .eq("targetType", args.sourceType)
        .eq("targetId", args.sourceId)
        .first(),
    ]);
    if (forward || reverse) throw new Error("Relationship already exists");

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
    const authResult = await ctx.runAction(
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
