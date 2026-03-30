import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";
import { checkPermission } from "./_helpers/permissions";
import { internal } from "./_generated/api";

// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const writeStageActionRef = internal.supabase.pipelineStageActions.writeStageActionToSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const updateStageActionRef = internal.supabase.pipelineStageActions.updateStageActionInSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const deleteStageActionRef = internal.supabase.pipelineStageActions.deleteStageActionFromSupabase;

const configValidator = v.object({
  activityTypeId: v.optional(v.string()),
  title: v.string(),
  description: v.optional(v.string()),
  dueInDays: v.number(),
  assignToOwner: v.boolean(),
});

export const listByStage = query({
  args: {
    organizationId: v.id("organizations"),
    stageId: v.id("pipelineStages"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "pipelines", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    return await ctx.db
      .query("pipelineStageActions")
      .withIndex("by_stage", (q) => q.eq("stageId", args.stageId))
      .collect();
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    stageId: v.id("pipelineStages"),
    config: configValidator,
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "pipelines", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const stage = await ctx.db.get(args.stageId);
    if (!stage || stage.organizationId !== args.organizationId) {
      throw new Error("Stage not found");
    }

    const now = Date.now();
    const actionId = await ctx.db.insert("pipelineStageActions", {
      organizationId: args.organizationId,
      stageId: args.stageId,
      actionType: "create_activity",
      config: args.config,
      createdAt: now,
      updatedAt: now,
    });

    // Dual-write: replicate stage action to Supabase
    await ctx.scheduler.runAfter(0, writeStageActionRef, {
      actionId: actionId as string,
      organizationId: args.organizationId as string,
      stageId: args.stageId as string,
      actionType: "create_activity",
      config: args.config,
      createdAt: now,
      updatedAt: now,
    });

    return actionId;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    actionId: v.id("pipelineStageActions"),
    config: configValidator,
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "pipelines", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const action = await ctx.db.get(args.actionId);
    if (!action || action.organizationId !== args.organizationId) {
      throw new Error("Stage action not found");
    }

    const now = Date.now();
    await ctx.db.patch(args.actionId, {
      config: args.config,
      updatedAt: now,
    });

    // Dual-write: replicate stage action update to Supabase
    await ctx.scheduler.runAfter(0, updateStageActionRef, {
      actionId: args.actionId as string,
      organizationId: args.organizationId as string,
      config: args.config,
      updatedAt: now,
    });

    return args.actionId;
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    actionId: v.id("pipelineStageActions"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "pipelines", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const action = await ctx.db.get(args.actionId);
    if (!action || action.organizationId !== args.organizationId) {
      throw new Error("Stage action not found");
    }

    await ctx.db.delete(args.actionId);

    // Dual-write: replicate stage action deletion to Supabase
    await ctx.scheduler.runAfter(0, deleteStageActionRef, {
      actionId: args.actionId as string,
      organizationId: args.organizationId as string,
    });

    return args.actionId;
  },
});
