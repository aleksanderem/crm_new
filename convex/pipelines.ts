import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";
import { logActivity } from "./_helpers/activities";
import { checkPermission } from "./_helpers/permissions";
import { internal } from "./_generated/api";

// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const writePipelineRef = internal.supabase.pipelines.writePipelineToSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const updatePipelineRef = internal.supabase.pipelines.updatePipelineInSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const deletePipelineRef = internal.supabase.pipelines.deletePipelineFromSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const writeStageRef = internal.supabase.pipelines.writeStageToSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const updateStageRef = internal.supabase.pipelines.updateStageInSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const deleteStageRef = internal.supabase.pipelines.deleteStageFromSupabase;

export const seed = mutation({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "pipelines", "create");
    if (!perm.allowed) throw new Error("Permission denied");
    const now = Date.now();

    const existing = await ctx.db
      .query("pipelines")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    if (existing.length > 0) return;

    const pipelineId = await ctx.db.insert("pipelines", {
      organizationId: args.organizationId,
      name: "Sales Pipeline",
      description: "Default sales pipeline",
      isDefault: true,
      createdBy: user._id,
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
      const stageId = await ctx.db.insert("pipelineStages", {
        pipelineId,
        organizationId: args.organizationId,
        name: stages[i].name,
        color: stages[i].color,
        order: i,
        isWonStage: stages[i].isWonStage,
        isLostStage: stages[i].isLostStage,
        createdAt: now,
        updatedAt: now,
      });

      // Dual-write: replicate stage to Supabase
      await ctx.scheduler.runAfter(0, writeStageRef, {
        stageId: stageId as string,
        pipelineId: pipelineId as string,
        organizationId: args.organizationId as string,
        name: stages[i].name,
        color: stages[i].color,
        order: i,
        isWonStage: stages[i].isWonStage,
        isLostStage: stages[i].isLostStage,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Dual-write: replicate pipeline to Supabase
    await ctx.scheduler.runAfter(0, writePipelineRef, {
      pipelineId: pipelineId as string,
      organizationId: args.organizationId as string,
      name: "Sales Pipeline",
      description: "Default sales pipeline",
      isDefault: true,
      createdBy: user._id as string,
      createdAt: now,
      updatedAt: now,
    });

    return pipelineId;
  },
});

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

export const create = mutation({
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
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "pipelines", "create");
    if (!perm.allowed) throw new Error("Permission denied");
    const now = Date.now();
    const { stages, ...pipelineData } = args;

    const pipelineId = await ctx.db.insert("pipelines", {
      ...pipelineData,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    if (stages) {
      for (let i = 0; i < stages.length; i++) {
        const stageId = await ctx.db.insert("pipelineStages", {
          pipelineId,
          organizationId: args.organizationId,
          name: stages[i].name,
          color: stages[i].color,
          order: i,
          isWonStage: stages[i].isWonStage,
          isLostStage: stages[i].isLostStage,
          createdAt: now,
          updatedAt: now,
        });

        // Dual-write: replicate stage to Supabase
        await ctx.scheduler.runAfter(0, writeStageRef, {
          stageId: stageId as string,
          pipelineId: pipelineId as string,
          organizationId: args.organizationId as string,
          name: stages[i].name,
          color: stages[i].color,
          order: i,
          isWonStage: stages[i].isWonStage,
          isLostStage: stages[i].isLostStage,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "pipeline",
      entityId: pipelineId,
      action: "created",
      description: `Created pipeline "${args.name}"`,
      performedBy: user._id,
    });

    // Dual-write: replicate pipeline to Supabase
    await ctx.scheduler.runAfter(0, writePipelineRef, {
      pipelineId: pipelineId as string,
      organizationId: args.organizationId as string,
      name: args.name,
      description: args.description,
      type: args.type,
      isDefault: args.isDefault,
      createdBy: user._id as string,
      createdAt: now,
      updatedAt: now,
    });

    return pipelineId;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    pipelineId: v.id("pipelines"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    type: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "pipelines", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const pipeline = await ctx.db.get(args.pipelineId);
    if (!pipeline || pipeline.organizationId !== args.organizationId) {
      throw new Error("Pipeline not found");
    }
    if (perm.scope === "own" && pipeline.createdBy !== user._id) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    const { organizationId, pipelineId, ...updates } = args;
    const now = Date.now();
    await ctx.db.patch(pipelineId, { ...updates, updatedAt: now });

    await logActivity(ctx, {
      organizationId,
      entityType: "pipeline",
      entityId: pipelineId,
      action: "updated",
      description: `Updated pipeline "${pipeline.name}"`,
      performedBy: user._id,
    });

    // Dual-write: replicate pipeline update to Supabase
    await ctx.scheduler.runAfter(0, updatePipelineRef, {
      pipelineId: pipelineId as string,
      organizationId: organizationId as string,
      ...Object.fromEntries(
        Object.entries({
          name: updates.name,
          description: updates.description,
          type: updates.type,
          isDefault: updates.isDefault,
        }).filter(([, v]) => v !== undefined),
      ),
      updatedAt: now,
    });

    return pipelineId;
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    pipelineId: v.id("pipelines"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "pipelines", "delete");
    if (!perm.allowed) throw new Error("Permission denied");

    const pipeline = await ctx.db.get(args.pipelineId);
    if (!pipeline || pipeline.organizationId !== args.organizationId) {
      throw new Error("Pipeline not found");
    }
    if (perm.scope === "own" && pipeline.createdBy !== user._id) {
      throw new Error("Permission denied: you can only delete your own records");
    }

    // Delete all stages
    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_pipeline", (q) => q.eq("pipelineId", args.pipelineId))
      .collect();

    for (const stage of stages) {
      // Unlink leads from deleted stages
      const leads = await ctx.db
        .query("leads")
        .withIndex("by_pipelineStage", (q) => q.eq("pipelineStageId", stage._id))
        .collect();
      for (const lead of leads) {
        await ctx.db.patch(lead._id, {
          pipelineStageId: undefined,
          stageOrder: undefined,
          updatedAt: Date.now(),
        });
      }
      await ctx.db.delete(stage._id);

      // Dual-write: replicate stage deletion to Supabase
      await ctx.scheduler.runAfter(0, deleteStageRef, {
        stageId: stage._id as string,
        organizationId: args.organizationId as string,
      });
    }

    await ctx.db.delete(args.pipelineId);

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "pipeline",
      entityId: args.pipelineId,
      action: "deleted",
      description: `Deleted pipeline "${pipeline.name}"`,
      performedBy: user._id,
    });

    // Dual-write: replicate pipeline deletion to Supabase
    await ctx.scheduler.runAfter(0, deletePipelineRef, {
      pipelineId: args.pipelineId as string,
      organizationId: args.organizationId as string,
    });

    return args.pipelineId;
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

export const addStage = mutation({
  args: {
    organizationId: v.id("organizations"),
    pipelineId: v.id("pipelines"),
    name: v.string(),
    color: v.optional(v.string()),
    order: v.number(),
    isWonStage: v.optional(v.boolean()),
    isLostStage: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "pipelines", "edit");
    if (!perm.allowed) throw new Error("Permission denied");
    const now = Date.now();

    const pipeline = await ctx.db.get(args.pipelineId);
    if (!pipeline || pipeline.organizationId !== args.organizationId) {
      throw new Error("Pipeline not found");
    }
    if (perm.scope === "own" && pipeline.createdBy !== user._id) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    const stageId = await ctx.db.insert("pipelineStages", {
      pipelineId: args.pipelineId,
      organizationId: args.organizationId,
      name: args.name,
      color: args.color,
      order: args.order,
      isWonStage: args.isWonStage,
      isLostStage: args.isLostStage,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "pipeline",
      entityId: args.pipelineId,
      action: "updated",
      description: `Added stage "${args.name}" to pipeline`,
      performedBy: user._id,
    });

    // Dual-write: replicate new stage to Supabase
    await ctx.scheduler.runAfter(0, writeStageRef, {
      stageId: stageId as string,
      pipelineId: args.pipelineId as string,
      organizationId: args.organizationId as string,
      name: args.name,
      color: args.color,
      order: args.order,
      isWonStage: args.isWonStage,
      isLostStage: args.isLostStage,
      createdAt: now,
      updatedAt: now,
    });

    return stageId;
  },
});

export const updateStage = mutation({
  args: {
    organizationId: v.id("organizations"),
    stageId: v.id("pipelineStages"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    order: v.optional(v.number()),
    isWonStage: v.optional(v.boolean()),
    isLostStage: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "pipelines", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const stage = await ctx.db.get(args.stageId);
    if (!stage || stage.organizationId !== args.organizationId) {
      throw new Error("Stage not found");
    }

    const { organizationId, stageId, ...updates } = args;
    const now = Date.now();
    await ctx.db.patch(stageId, { ...updates, updatedAt: now });

    await logActivity(ctx, {
      organizationId,
      entityType: "pipeline",
      entityId: stage.pipelineId,
      action: "updated",
      description: `Updated stage "${stage.name}"`,
      performedBy: user._id,
    });

    // Dual-write: replicate stage update to Supabase
    await ctx.scheduler.runAfter(0, updateStageRef, {
      stageId: stageId as string,
      organizationId: organizationId as string,
      ...Object.fromEntries(
        Object.entries({
          name: updates.name,
          color: updates.color,
          order: updates.order,
          isWonStage: updates.isWonStage,
          isLostStage: updates.isLostStage,
        }).filter(([, v]) => v !== undefined),
      ),
      updatedAt: now,
    });

    return stageId;
  },
});

export const removeStage = mutation({
  args: {
    organizationId: v.id("organizations"),
    stageId: v.id("pipelineStages"),
    migrateToStageId: v.optional(v.id("pipelineStages")),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "pipelines", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const stage = await ctx.db.get(args.stageId);
    if (!stage || stage.organizationId !== args.organizationId) {
      throw new Error("Stage not found");
    }

    // Migrate leads to another stage or unlink them
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_pipelineStage", (q) => q.eq("pipelineStageId", args.stageId))
      .collect();

    for (const lead of leads) {
      if (args.migrateToStageId) {
        await ctx.db.patch(lead._id, {
          pipelineStageId: args.migrateToStageId,
          updatedAt: Date.now(),
        });
      } else {
        await ctx.db.patch(lead._id, {
          pipelineStageId: undefined,
          stageOrder: undefined,
          updatedAt: Date.now(),
        });
      }
    }

    await ctx.db.delete(args.stageId);

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "pipeline",
      entityId: stage.pipelineId,
      action: "updated",
      description: `Removed stage "${stage.name}"${args.migrateToStageId ? " (leads migrated)" : ""}`,
      performedBy: user._id,
    });

    // Dual-write: replicate stage deletion to Supabase
    await ctx.scheduler.runAfter(0, deleteStageRef, {
      stageId: args.stageId as string,
      organizationId: args.organizationId as string,
    });

    return args.stageId;
  },
});

export const reorderStages = mutation({
  args: {
    organizationId: v.id("organizations"),
    pipelineId: v.id("pipelines"),
    stageIds: v.array(v.id("pipelineStages")),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "pipelines", "edit");
    if (!perm.allowed) throw new Error("Permission denied");
    const now = Date.now();

    for (let i = 0; i < args.stageIds.length; i++) {
      const stage = await ctx.db.get(args.stageIds[i]);
      if (!stage || stage.organizationId !== args.organizationId) {
        throw new Error("Stage not found");
      }
      await ctx.db.patch(args.stageIds[i], { order: i, updatedAt: now });

      // Dual-write: replicate stage reorder to Supabase
      await ctx.scheduler.runAfter(0, updateStageRef, {
        stageId: args.stageIds[i] as string,
        organizationId: args.organizationId as string,
        order: i,
        updatedAt: now,
      });
    }

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "pipeline",
      entityId: args.pipelineId,
      action: "updated",
      description: "Reordered pipeline stages",
      performedBy: user._id,
    });
  },
});
