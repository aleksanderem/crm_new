import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";

const configValidator = v.object({
  activityTypeId: v.optional(v.string()),
  title: v.string(),
  description: v.optional(v.string()),
  dueInDays: v.number(),
  assignToOwner: v.boolean(),
});

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    stageId: v.string(),
    config: configValidator,
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runAction(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "pipelines",
      action: "edit",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    // Verify stage belongs to org
    const stage = await db.get("pipelineStages", args.stageId);
    if (!stage || stage.organizationId !== String(args.organizationId)) {
      throw new Error("Stage not found");
    }

    const now = Date.now();
    const actionId = await db.insert("pipelineStageActions", {
      organizationId: String(args.organizationId),
      stageId: args.stageId,
      actionType: "create_activity",
      config: args.config,
      createdAt: now,
      updatedAt: now,
    });

    return actionId;
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    actionId: v.string(),
    config: configValidator,
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runAction(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "pipelines",
      action: "edit",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const existing = await db.get("pipelineStageActions", args.actionId);
    if (!existing || existing.organizationId !== String(args.organizationId)) {
      throw new Error("Stage action not found");
    }

    const now = Date.now();
    await db.patch("pipelineStageActions", args.actionId, {
      config: args.config,
      updatedAt: now,
    });

    return args.actionId;
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    actionId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runAction(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "pipelines",
      action: "edit",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const existing = await db.get("pipelineStageActions", args.actionId);
    if (!existing || existing.organizationId !== String(args.organizationId)) {
      throw new Error("Stage action not found");
    }

    await db.delete("pipelineStageActions", args.actionId);
    return args.actionId;
  },
});
