import { query, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";
import { checkPermission } from "./_helpers/permissions";
import { logActivity } from "./_helpers/activities";

// Writes are Supabase-primary (see actions below, which use createSupabaseDb).
// The queries in this file still read from Convex `ctx.db` — they have not
// been migrated yet, so server-side callers can see slightly stale rows.
// The frontend reads pipelines via supabase-js (see use-supabase-pipelines).

// ── Queries (Convex ctx.db — legacy read path, not yet migrated) ────────────

export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "pipelines", "view");
    if (!perm.allowed) throw new Error("Permission denied");
    const results = await ctx.db
      .query("pipelines")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    if (perm.scope === "own") {
      return results.filter((r) => r.createdBy === user._id);
    }
    return results;
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    pipelineId: v.id("pipelines"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "pipelines", "view");
    if (!perm.allowed) throw new Error("Permission denied");
    const pipeline = await ctx.db.get(args.pipelineId);
    if (!pipeline || pipeline.organizationId !== args.organizationId) {
      throw new Error("Pipeline not found");
    }
    if (perm.scope === "own" && pipeline.createdBy !== user._id) {
      throw new Error("Permission denied");
    }
    return pipeline;
  },
});

export const getStages = query({
  args: {
    organizationId: v.id("organizations"),
    pipelineId: v.id("pipelines"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "pipelines", "view");
    if (!perm.allowed) throw new Error("Permission denied");
    return await ctx.db
      .query("pipelineStages")
      .withIndex("by_pipeline", (q) => q.eq("pipelineId", args.pipelineId))
      .collect();
  },
});

export const getAllStages = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "pipelines", "view");
    if (!perm.allowed) throw new Error("Permission denied");
    return await ctx.db
      .query("pipelineStages")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

// ── Internal mutation for ctx.db-side effects (activity log, lead patches) ──

export const _sideEffects = internalMutation({
  args: {
    type: v.union(
      v.literal("pipeline_created"),
      v.literal("pipeline_updated"),
      v.literal("pipeline_deleted"),
      v.literal("stage_added"),
      v.literal("stage_updated"),
      v.literal("stage_removed"),
      v.literal("stages_reordered"),
    ),
    organizationId: v.id("organizations"),
    userId: v.string(),
    pipelineId: v.optional(v.string()),
    pipelineName: v.optional(v.string()),
    stageName: v.optional(v.string()),
    migrateToStageId: v.optional(v.string()),
    stageId: v.optional(v.string()),
    leadIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = args.userId as any;

    if (args.type === "pipeline_created" && args.pipelineId) {
      await logActivity(ctx, {
        organizationId: args.organizationId,
        entityType: "pipeline",
        entityId: args.pipelineId as any,
        action: "created",
        description: `Created pipeline "${args.pipelineName}"`,
        performedBy: userId,
      });
    } else if (args.type === "pipeline_updated" && args.pipelineId) {
      await logActivity(ctx, {
        organizationId: args.organizationId,
        entityType: "pipeline",
        entityId: args.pipelineId as any,
        action: "updated",
        description: `Updated pipeline "${args.pipelineName}"`,
        performedBy: userId,
      });
    } else if (args.type === "pipeline_deleted" && args.pipelineId) {
      // Unlink leads from deleted stages
      if (args.leadIds && args.leadIds.length > 0) {
        for (const leadId of args.leadIds) {
          try {
            await ctx.db.patch(leadId as any, {
              pipelineStageId: undefined,
              stageOrder: undefined,
              updatedAt: Date.now(),
            });
          } catch { /* lead may not exist */ }
        }
      }
      await logActivity(ctx, {
        organizationId: args.organizationId,
        entityType: "pipeline",
        entityId: args.pipelineId as any,
        action: "deleted",
        description: `Deleted pipeline "${args.pipelineName}"`,
        performedBy: userId,
      });
    } else if (args.type === "stage_added" && args.pipelineId) {
      await logActivity(ctx, {
        organizationId: args.organizationId,
        entityType: "pipeline",
        entityId: args.pipelineId as any,
        action: "updated",
        description: `Added stage "${args.stageName}" to pipeline`,
        performedBy: userId,
      });
    } else if (args.type === "stage_updated" && args.pipelineId) {
      await logActivity(ctx, {
        organizationId: args.organizationId,
        entityType: "pipeline",
        entityId: args.pipelineId as any,
        action: "updated",
        description: `Updated stage "${args.stageName}"`,
        performedBy: userId,
      });
    } else if (args.type === "stage_removed" && args.pipelineId) {
      // Migrate or unlink leads
      if (args.leadIds && args.leadIds.length > 0) {
        for (const leadId of args.leadIds) {
          try {
            if (args.migrateToStageId) {
              await ctx.db.patch(leadId as any, {
                pipelineStageId: args.migrateToStageId as any,
                updatedAt: Date.now(),
              });
            } else {
              await ctx.db.patch(leadId as any, {
                pipelineStageId: undefined,
                stageOrder: undefined,
                updatedAt: Date.now(),
              });
            }
          } catch { /* lead may not exist */ }
        }
      }
      await logActivity(ctx, {
        organizationId: args.organizationId,
        entityType: "pipeline",
        entityId: args.pipelineId as any,
        action: "updated",
        description: `Removed stage "${args.stageName}"${args.migrateToStageId ? " (leads migrated)" : ""}`,
        performedBy: userId,
      });
    } else if (args.type === "stages_reordered" && args.pipelineId) {
      await logActivity(ctx, {
        organizationId: args.organizationId,
        entityType: "pipeline",
        entityId: args.pipelineId as any,
        action: "updated",
        description: "Reordered pipeline stages",
        performedBy: userId,
      });
    }
  },
});

// ── Actions (Supabase-primary writes) ───────────────────────────────────────

export const seed = action({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "pipelines", action: "create" },
    );
    if (!(perm as any).allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const now = Date.now();

    // Check existing pipelines
    const existing = await db.query("pipelines")
      .eq("organizationId", String(args.organizationId))
      .collect();
    if (existing.length > 0) return;

    const pipelineId = await db.insert("pipelines", {
      organizationId: String(args.organizationId),
      name: "Sales Pipeline",
      description: "Default sales pipeline",
      isDefault: true,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    const stages = [
      { name: "New", color: "#3b82f6" },
      { name: "Qualified", color: "#8b5cf6" },
      { name: "Proposal", color: "#f59e0b" },
      { name: "Negotiation", color: "#f97316" },
      { name: "Won", color: "#22c55e", isWonStage: true },
      { name: "Lost", color: "#ef4444", isLostStage: true },
    ];

    for (let i = 0; i < stages.length; i++) {
      await db.insert("pipelineStages", {
        pipelineId,
        organizationId: String(args.organizationId),
        name: stages[i].name,
        color: stages[i].color,
        order: i,
        isWonStage: (stages[i] as any).isWonStage ?? null,
        isLostStage: (stages[i] as any).isLostStage ?? null,
        createdAt: now,
        updatedAt: now,
      });
    }

    return pipelineId;
  },
});

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    type: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
    stages: v.optional(v.array(v.object({
      name: v.string(),
      color: v.optional(v.string()),
      isWonStage: v.optional(v.boolean()),
      isLostStage: v.optional(v.boolean()),
    }))),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "pipelines", action: "create" },
    );
    if (!(perm as any).allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const now = Date.now();
    const { stages, ...pipelineData } = args;

    const pipelineId = await db.insert("pipelines", {
      organizationId: String(pipelineData.organizationId),
      name: pipelineData.name,
      description: pipelineData.description ?? null,
      type: pipelineData.type ?? null,
      isDefault: pipelineData.isDefault ?? null,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    if (stages) {
      for (let i = 0; i < stages.length; i++) {
        await db.insert("pipelineStages", {
          pipelineId,
          organizationId: String(args.organizationId),
          name: stages[i].name,
          color: stages[i].color ?? null,
          order: i,
          isWonStage: stages[i].isWonStage ?? null,
          isLostStage: stages[i].isLostStage ?? null,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Side effects (activity log)
    try {
      await ctx.runMutation(internal.pipelines._sideEffects, {
        type: "pipeline_created",
        organizationId: args.organizationId,
        userId: String(authResult.userId),
        pipelineId,
        pipelineName: args.name,
      });
    } catch (e) {
      console.error("[pipelines.create] side effects error:", e);
    }

    return pipelineId;
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    pipelineId: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    type: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "pipelines", action: "edit" },
    );
    if (!(perm as any).allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const pipeline = await db.get("pipelines", args.pipelineId);
    if (!pipeline || pipeline.organizationId !== String(args.organizationId)) {
      throw new Error("Pipeline not found");
    }
    if ((perm as any).scope === "own" && pipeline.createdBy !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    const now = Date.now();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.type !== undefined) updates.type = args.type;
    if (args.isDefault !== undefined) updates.isDefault = args.isDefault;

    await db.patch("pipelines", args.pipelineId, updates);

    try {
      await ctx.runMutation(internal.pipelines._sideEffects, {
        type: "pipeline_updated",
        organizationId: args.organizationId,
        userId: String(authResult.userId),
        pipelineId: args.pipelineId,
        pipelineName: (args.name ?? pipeline.name) as string,
      });
    } catch (e) {
      console.error("[pipelines.update] side effects error:", e);
    }

    return args.pipelineId;
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    pipelineId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "pipelines", action: "delete" },
    );
    if (!(perm as any).allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const pipeline = await db.get("pipelines", args.pipelineId);
    if (!pipeline || pipeline.organizationId !== String(args.organizationId)) {
      throw new Error("Pipeline not found");
    }
    if ((perm as any).scope === "own" && pipeline.createdBy !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only delete your own records");
    }

    // Find all stages and their linked leads
    const stages = await db.query("pipelineStages")
      .eq("pipelineId", args.pipelineId)
      .collect();

    const allLeadIds: string[] = [];
    for (const stage of stages) {
      const leads = await db.query("leads")
        .eq("pipelineStageId", stage._id as string)
        .collect();
      for (const lead of leads) {
        allLeadIds.push(lead._id as string);
        await db.patch("leads", lead._id as string, {
          pipelineStageId: null,
          stageOrder: null,
          updatedAt: Date.now(),
        });
      }
      await db.delete("pipelineStages", stage._id as string);
    }

    await db.delete("pipelines", args.pipelineId);

    try {
      await ctx.runMutation(internal.pipelines._sideEffects, {
        type: "pipeline_deleted",
        organizationId: args.organizationId,
        userId: String(authResult.userId),
        pipelineId: args.pipelineId,
        pipelineName: pipeline.name as string,
        leadIds: allLeadIds,
      });
    } catch (e) {
      console.error("[pipelines.remove] side effects error:", e);
    }

    return args.pipelineId;
  },
});

export const addStage = action({
  args: {
    organizationId: v.id("organizations"),
    pipelineId: v.string(),
    name: v.string(),
    color: v.optional(v.string()),
    order: v.number(),
    isWonStage: v.optional(v.boolean()),
    isLostStage: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "pipelines", action: "edit" },
    );
    if (!(perm as any).allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const pipeline = await db.get("pipelines", args.pipelineId);
    if (!pipeline || pipeline.organizationId !== String(args.organizationId)) {
      throw new Error("Pipeline not found");
    }
    if ((perm as any).scope === "own" && pipeline.createdBy !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    const now = Date.now();
    const stageId = await db.insert("pipelineStages", {
      pipelineId: args.pipelineId,
      organizationId: String(args.organizationId),
      name: args.name,
      color: args.color ?? null,
      order: args.order,
      isWonStage: args.isWonStage ?? null,
      isLostStage: args.isLostStage ?? null,
      createdAt: now,
      updatedAt: now,
    });

    try {
      await ctx.runMutation(internal.pipelines._sideEffects, {
        type: "stage_added",
        organizationId: args.organizationId,
        userId: String(authResult.userId),
        pipelineId: args.pipelineId,
        stageName: args.name,
      });
    } catch (e) {
      console.error("[pipelines.addStage] side effects error:", e);
    }

    return stageId;
  },
});

export const updateStage = action({
  args: {
    organizationId: v.id("organizations"),
    stageId: v.string(),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    order: v.optional(v.number()),
    isWonStage: v.optional(v.boolean()),
    isLostStage: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "pipelines", action: "edit" },
    );
    if (!(perm as any).allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const stage = await db.get("pipelineStages", args.stageId);
    if (!stage || stage.organizationId !== String(args.organizationId)) {
      throw new Error("Stage not found");
    }

    const now = Date.now();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (args.name !== undefined) updates.name = args.name;
    if (args.color !== undefined) updates.color = args.color;
    if (args.order !== undefined) updates.order = args.order;
    if (args.isWonStage !== undefined) updates.isWonStage = args.isWonStage;
    if (args.isLostStage !== undefined) updates.isLostStage = args.isLostStage;

    await db.patch("pipelineStages", args.stageId, updates);

    try {
      await ctx.runMutation(internal.pipelines._sideEffects, {
        type: "stage_updated",
        organizationId: args.organizationId,
        userId: String(authResult.userId),
        pipelineId: stage.pipelineId as string,
        stageName: (args.name ?? stage.name) as string,
      });
    } catch (e) {
      console.error("[pipelines.updateStage] side effects error:", e);
    }

    return args.stageId;
  },
});

export const removeStage = action({
  args: {
    organizationId: v.id("organizations"),
    stageId: v.string(),
    migrateToStageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "pipelines", action: "edit" },
    );
    if (!(perm as any).allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const stage = await db.get("pipelineStages", args.stageId);
    if (!stage || stage.organizationId !== String(args.organizationId)) {
      throw new Error("Stage not found");
    }

    // Migrate or unlink leads in Supabase
    const leads = await db.query("leads")
      .eq("pipelineStageId", args.stageId)
      .collect();

    const leadIds = leads.map((l) => l._id as string);
    for (const lead of leads) {
      if (args.migrateToStageId) {
        await db.patch("leads", lead._id as string, {
          pipelineStageId: args.migrateToStageId,
          updatedAt: Date.now(),
        });
      } else {
        await db.patch("leads", lead._id as string, {
          pipelineStageId: null,
          stageOrder: null,
          updatedAt: Date.now(),
        });
      }
    }

    await db.delete("pipelineStages", args.stageId);

    try {
      await ctx.runMutation(internal.pipelines._sideEffects, {
        type: "stage_removed",
        organizationId: args.organizationId,
        userId: String(authResult.userId),
        pipelineId: stage.pipelineId as string,
        stageName: stage.name as string,
        stageId: args.stageId,
        migrateToStageId: args.migrateToStageId,
        leadIds,
      });
    } catch (e) {
      console.error("[pipelines.removeStage] side effects error:", e);
    }

    return args.stageId;
  },
});

export const reorderStages = action({
  args: {
    organizationId: v.id("organizations"),
    pipelineId: v.string(),
    stageIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "pipelines", action: "edit" },
    );
    if (!(perm as any).allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const now = Date.now();

    for (let i = 0; i < args.stageIds.length; i++) {
      const stage = await db.get("pipelineStages", args.stageIds[i]);
      if (!stage || stage.organizationId !== String(args.organizationId)) {
        throw new Error("Stage not found");
      }
      await db.patch("pipelineStages", args.stageIds[i], {
        order: i,
        updatedAt: now,
      });
    }

    try {
      await ctx.runMutation(internal.pipelines._sideEffects, {
        type: "stages_reordered",
        organizationId: args.organizationId,
        userId: String(authResult.userId),
        pipelineId: args.pipelineId,
      });
    } catch (e) {
      console.error("[pipelines.reorderStages] side effects error:", e);
    }
  },
});
