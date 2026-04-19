import { query, action, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { verifyOrgAccess } from "./_helpers/auth";
import { logActivity } from "./_helpers/activities";
import { checkPermission } from "./_helpers/permissions";
import { leadStatusValidator, leadPriorityValidator } from "@cvx/schema";
import { logAudit } from "./auditLog";
import { createNotificationDirect } from "./notifications";
import { Id } from "./_generated/dataModel";

// Dual-write refs removed — Supabase is now primary for lead writes

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    status: v.optional(leadStatusValidator),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(
      ctx,
      args.organizationId,
      "leads",
      "view",
    );
    if (!perm.allowed) throw new Error("Permission denied");

    const isOwn = perm.scope === "own";
    const ownFilter = (r: any) =>
      r.createdBy === user._id || r.assignedTo === user._id;

    if (args.search) {
      const results = await ctx.db
        .query("leads")
        .withSearchIndex("search_leads", (q) => {
          let sq = q
            .search("title", args.search!)
            .eq("organizationId", args.organizationId);
          if (args.status) sq = sq.eq("status", args.status);
          return sq;
        })
        .take(50);
      if (isOwn) {
        return {
          page: results.filter(ownFilter),
          isDone: true,
          continueCursor: "",
        };
      }
      return { page: results, isDone: true, continueCursor: "" };
    }

    if (args.status) {
      const result = await ctx.db
        .query("leads")
        .withIndex("by_orgAndStatus", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("status", args.status!),
        )
        .order("desc")
        .paginate(args.paginationOpts);
      if (isOwn) {
        return { ...result, page: result.page.filter(ownFilter) };
      }
      return result;
    }

    const result = await ctx.db
      .query("leads")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .paginate(args.paginationOpts);
    if (isOwn) {
      return { ...result, page: result.page.filter(ownFilter) };
    }
    return result;
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    leadId: v.id("leads"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(
      ctx,
      args.organizationId,
      "leads",
      "view",
    );
    if (!perm.allowed) throw new Error("Permission denied");

    const lead = await ctx.db.get(args.leadId);
    if (!lead || lead.organizationId !== args.organizationId) {
      throw new Error("Lead not found");
    }
    if (
      perm.scope === "own" &&
      lead.createdBy !== user._id &&
      lead.assignedTo !== user._id
    ) {
      throw new Error("Permission denied");
    }

    const [customFieldValues, company, assignedUser, stage] = await Promise.all(
      [
        ctx.db
          .query("customFieldValues")
          .withIndex("by_entity", (q) =>
            q.eq("entityType", "lead").eq("entityId", args.leadId),
          )
          .collect(),
        lead.companyId ? ctx.db.get(lead.companyId) : null,
        lead.assignedTo ? ctx.db.get(lead.assignedTo) : null,
        lead.pipelineStageId ? ctx.db.get(lead.pipelineStageId) : null,
      ],
    );

    return {
      ...lead,
      customFieldValues,
      company,
      assignedUser: assignedUser
        ? {
            _id: assignedUser._id,
            name: assignedUser.name,
            email: assignedUser.email,
            image: assignedUser.image,
          }
        : null,
      stage,
    };
  },
});

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    title: v.string(),
    value: v.optional(v.number()),
    currency: v.optional(v.string()),
    status: leadStatusValidator,
    priority: v.optional(leadPriorityValidator),
    expectedCloseDate: v.optional(v.number()),
    source: v.optional(v.string()),
    companyId: v.optional(v.string()),
    assignedTo: v.optional(v.string()),
    pipelineStageId: v.optional(v.string()),
    stageOrder: v.optional(v.number()),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    customFields: v.optional(
      v.array(
        v.object({
          fieldDefinitionId: v.string(),
          value: v.any(),
        }),
      ),
    ),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "leads",
      action: "create",
    }).then((perm: { allowed: boolean; scope: string }) => {
      if (!perm.allowed) throw new Error("Permission denied");
    });

    const now = Date.now();
    const db = createSupabaseDb();

    // --- INSERT lead directly to Supabase ---
    const leadId = await db.insert("leads", {
      organizationId: String(args.organizationId),
      title: args.title,
      value: args.value ?? null,
      currency: args.currency ?? null,
      status: args.status,
      priority: args.priority ?? null,
      expectedCloseDate: args.expectedCloseDate ?? null,
      source: args.source ?? null,
      companyId: args.companyId ?? null,
      assignedTo: args.assignedTo ?? null,
      pipelineStageId: args.pipelineStageId ?? null,
      stageOrder: args.stageOrder ?? null,
      notes: args.notes ?? null,
      tags: args.tags ?? null,
      tagIds: args.tagIds ?? null,
      categoryId: args.categoryId ?? null,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    // --- Delegate Convex-only side effects ---
    try {
      await ctx.runMutation(internal.leads._createSideEffects, {
        leadId,
        organizationId: args.organizationId,
        title: args.title,
        assignedTo: args.assignedTo,
        customFields: args.customFields,
        createdBy: String(authResult.userId),
        createdAt: now,
      });
    } catch (e) {
      console.error("[leads.create] Side effects FAILED for lead", leadId, ":", e);
    }

    return leadId;
  },
});

export const _createSideEffects = internalMutation({
  args: {
    leadId: v.string(),
    organizationId: v.id("organizations"),
    title: v.string(),
    assignedTo: v.optional(v.string()),
    customFields: v.optional(
      v.array(
        v.object({
          fieldDefinitionId: v.string(),
          value: v.any(),
        }),
      ),
    ),
    createdBy: v.string(),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    const createdByUserId = args.createdBy as Id<"users">;

    // Insert custom field values into Convex
    if (args.customFields) {
      for (const field of args.customFields) {
        await ctx.db.insert("customFieldValues", {
          organizationId: args.organizationId,
          fieldDefinitionId: field.fieldDefinitionId as Id<"customFieldDefinitions">,
          entityType: "lead",
          entityId: args.leadId as Id<"leads">,
          value: field.value,
          createdAt: args.createdAt,
          updatedAt: args.createdAt,
        });
      }
    }

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "lead",
      entityId: args.leadId as Id<"leads">,
      action: "created",
      description: `Created lead "${args.title}"`,
      performedBy: createdByUserId,
    });

    // Notify assigned user if different from creator
    if (args.assignedTo && args.assignedTo !== args.createdBy) {
      await createNotificationDirect(ctx, {
        organizationId: args.organizationId,
        userId: args.assignedTo as Id<"users">,
        type: "assigned",
        title: "Lead assigned",
        message: `You have been assigned to lead "${args.title}"`,
        link: `/leads/${args.leadId}`,
      });
    }
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    leadId: v.string(),
    title: v.optional(v.string()),
    value: v.optional(v.number()),
    currency: v.optional(v.string()),
    status: v.optional(leadStatusValidator),
    priority: v.optional(leadPriorityValidator),
    expectedCloseDate: v.optional(v.number()),
    source: v.optional(v.string()),
    companyId: v.optional(v.string()),
    assignedTo: v.optional(v.string()),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    lostReason: v.optional(v.string()),
    customFields: v.optional(
      v.array(
        v.object({
          fieldDefinitionId: v.string(),
          value: v.any(),
        }),
      ),
    ),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "leads",
        action: "edit",
      },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    // --- Read lead from Supabase ---
    const lead = await db.get("leads", args.leadId);
    if (!lead || String(lead.organizationId) !== String(args.organizationId)) {
      throw new Error("Lead not found");
    }
    if (
      perm.scope === "own" &&
      String(lead.createdBy) !== String(authResult.userId) &&
      String(lead.assignedTo) !== String(authResult.userId)
    ) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    const now = Date.now();
    const { organizationId, leadId, customFields, ...updates } = args;

    // Track status changes
    const supabaseUpdates: Record<string, unknown> = { ...updates, updatedAt: now };
    if (updates.status && updates.status !== lead.status) {
      if (updates.status === "won") {
        supabaseUpdates.wonAt = now;
      } else if (updates.status === "lost") {
        supabaseUpdates.lostAt = now;
      }
    }

    // --- PATCH to Supabase ---
    await db.patch("leads", leadId, supabaseUpdates);

    // --- Delegate Convex-only side effects ---
    try {
      await ctx.runMutation(internal.leads._updateSideEffects, {
        leadId,
        organizationId,
        title: (lead.title as string) ?? "",
        oldStatus: (lead.status as string) ?? "",
        newStatus: updates.status,
        oldAssignedTo: lead.assignedTo ? String(lead.assignedTo) : undefined,
        newAssignedTo: updates.assignedTo,
        leadOwnerId: String(lead.assignedTo ?? lead.createdBy),
        customFields,
        updatedBy: String(authResult.userId),
        updatedAt: now,
      });
    } catch (e) {
      console.error("[leads.update] Side effects FAILED for lead", leadId, ":", e);
    }

    return leadId;
  },
});

export const _updateSideEffects = internalMutation({
  args: {
    leadId: v.string(),
    organizationId: v.id("organizations"),
    title: v.string(),
    oldStatus: v.string(),
    newStatus: v.optional(v.string()),
    oldAssignedTo: v.optional(v.string()),
    newAssignedTo: v.optional(v.string()),
    leadOwnerId: v.string(),
    customFields: v.optional(
      v.array(
        v.object({
          fieldDefinitionId: v.string(),
          value: v.any(),
        }),
      ),
    ),
    updatedBy: v.string(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const updatedByUserId = args.updatedBy as Id<"users">;
    const now = args.updatedAt;

    // Update custom field values in Convex
    if (args.customFields) {
      for (const field of args.customFields) {
        const existing = await ctx.db
          .query("customFieldValues")
          .withIndex("by_orgEntityField", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("entityType", "lead")
              .eq("entityId", args.leadId as Id<"leads">)
              .eq("fieldDefinitionId", field.fieldDefinitionId as Id<"customFieldDefinitions">),
          )
          .unique();

        if (existing) {
          await ctx.db.patch(existing._id, {
            value: field.value,
            updatedAt: now,
          });
        } else {
          await ctx.db.insert("customFieldValues", {
            organizationId: args.organizationId,
            fieldDefinitionId: field.fieldDefinitionId as Id<"customFieldDefinitions">,
            entityType: "lead",
            entityId: args.leadId as Id<"leads">,
            value: field.value,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }

    if (args.newStatus && args.newStatus !== args.oldStatus) {
      await logActivity(ctx, {
        organizationId: args.organizationId,
        entityType: "lead",
        entityId: args.leadId as Id<"leads">,
        action: "status_changed",
        description: `Changed lead status from "${args.oldStatus}" to "${args.newStatus}"`,
        metadata: { oldStatus: args.oldStatus, newStatus: args.newStatus },
        performedBy: updatedByUserId,
      });

      // Audit log for status changes to won/lost
      if (args.newStatus === "won" || args.newStatus === "lost") {
        await logAudit(ctx, {
          organizationId: args.organizationId,
          userId: updatedByUserId,
          action: "status_changed",
          entityType: "lead",
          entityId: args.leadId as Id<"leads">,
          details: JSON.stringify({
            oldStatus: args.oldStatus,
            newStatus: args.newStatus,
          }),
        });
      }

      // Notify lead owner on won/lost
      const leadOwner = args.leadOwnerId as Id<"users">;
      if (args.newStatus === "won" && leadOwner !== updatedByUserId) {
        await createNotificationDirect(ctx, {
          organizationId: args.organizationId,
          userId: leadOwner,
          type: "deal_won",
          title: "Deal won!",
          message: `Lead "${args.title}" has been marked as won`,
          link: `/leads/${args.leadId}`,
        });
      }
      if (args.newStatus === "lost" && leadOwner !== updatedByUserId) {
        await createNotificationDirect(ctx, {
          organizationId: args.organizationId,
          userId: leadOwner,
          type: "deal_lost",
          title: "Deal lost",
          message: `Lead "${args.title}" has been marked as lost`,
          link: `/leads/${args.leadId}`,
        });
      }

      await ctx.runMutation(internal.automation.emitEvent, {
        organizationId: args.organizationId,
        module: "crm",
        eventType: "crm.lead.status_changed",
        entityType: "lead",
        entityId: args.leadId,
        actorUserId: updatedByUserId,
        correlationKey: `lead:${args.leadId}`,
        eventIdempotencyKey: `automation-event:${args.organizationId}:${args.leadId}:${now}:status:${args.newStatus}`,
        payload: JSON.stringify({
          organizationId: String(args.organizationId),
          leadId: args.leadId,
          title: args.title,
          oldStatus: args.oldStatus,
          newStatus: args.newStatus,
          assignedTo: args.oldAssignedTo ?? null,
          ownerId: args.leadOwnerId,
          createdBy: args.leadOwnerId,
        }),
        occurredAt: now,
      });
    } else {
      await logActivity(ctx, {
        organizationId: args.organizationId,
        entityType: "lead",
        entityId: args.leadId as Id<"leads">,
        action: "updated",
        description: `Updated lead "${args.title}"`,
        performedBy: updatedByUserId,
      });
    }

    // Notify when assignedTo changes to someone other than the current user
    if (
      args.newAssignedTo &&
      args.newAssignedTo !== args.oldAssignedTo &&
      args.newAssignedTo !== args.updatedBy
    ) {
      await createNotificationDirect(ctx, {
        organizationId: args.organizationId,
        userId: args.newAssignedTo as Id<"users">,
        type: "assigned",
        title: "Lead assigned",
        message: `You have been assigned to lead "${args.title}"`,
        link: `/leads/${args.leadId}`,
      });
    }
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    leadId: v.string(),
  },
  handler: async (ctx, args) => {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "leads",
        action: "delete",
      },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    // --- Read lead from Supabase ---
    const lead = await db.get("leads", args.leadId);
    if (!lead || String(lead.organizationId) !== String(args.organizationId)) {
      throw new Error("Lead not found");
    }
    if (
      perm.scope === "own" &&
      String(lead.createdBy) !== String(authResult.userId) &&
      String(lead.assignedTo) !== String(authResult.userId)
    ) {
      throw new Error(
        "Permission denied: you can only delete your own records",
      );
    }

    // --- DELETE from Supabase ---
    await db.delete("leads", args.leadId);

    // --- Delegate Convex-only side effects ---
    try {
      await ctx.runMutation(internal.leads._removeSideEffects, {
        leadId: args.leadId,
        organizationId: args.organizationId,
        title: (lead.title as string) ?? "",
        deletedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[leads.remove] Side effects FAILED for lead", args.leadId, ":", e);
    }

    return args.leadId;
  },
});

export const _removeSideEffects = internalMutation({
  args: {
    leadId: v.string(),
    organizationId: v.id("organizations"),
    title: v.string(),
    deletedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const deletedByUserId = args.deletedBy as Id<"users">;

    // Delete custom field values from Convex
    const customValues = await ctx.db
      .query("customFieldValues")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "lead").eq("entityId", args.leadId as Id<"leads">),
      )
      .collect();
    for (const cv of customValues) {
      await ctx.db.delete(cv._id);
    }

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "lead",
      entityId: args.leadId as Id<"leads">,
      action: "deleted",
      description: `Deleted lead "${args.title}"`,
      performedBy: deletedByUserId,
    });

    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: deletedByUserId,
      action: "entity_deleted",
      entityType: "lead",
      entityId: args.leadId as Id<"leads">,
      details: JSON.stringify({ title: args.title }),
    });
  },
});

export const getByPipeline = query({
  args: {
    organizationId: v.id("organizations"),
    pipelineId: v.id("pipelines"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(
      ctx,
      args.organizationId,
      "leads",
      "view",
    );
    if (!perm.allowed) throw new Error("Permission denied");

    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_pipeline", (q) => q.eq("pipelineId", args.pipelineId))
      .collect();

    const stagesWithLeads = await Promise.all(
      stages.map(async (stage) => {
        const leads = await ctx.db
          .query("leads")
          .withIndex("by_pipelineStage", (q) =>
            q.eq("pipelineStageId", stage._id),
          )
          .collect();

        // Sort by stageOrder client-side since index returns in order
        leads.sort((a, b) => (a.stageOrder ?? 0) - (b.stageOrder ?? 0));

        const filtered =
          perm.scope === "own"
            ? leads.filter(
                (l) => l.createdBy === user._id || l.assignedTo === user._id,
              )
            : leads;

        return { ...stage, leads: filtered };
      }),
    );

    return stagesWithLeads;
  },
});

// moveToStage stays as a mutation — it reads pipeline stages and creates
// scheduledActivities in Convex DB, which are not yet migrated to Supabase.
// It also writes to the leads table in Convex. This will be migrated in a
// follow-up phase once scheduledActivities and pipelineStageActions are on Supabase.
export const moveToStage = mutation({
  args: {
    organizationId: v.id("organizations"),
    leadId: v.id("leads"),
    pipelineStageId: v.id("pipelineStages"),
    stageOrder: v.number(),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(
      ctx,
      args.organizationId,
      "leads",
      "edit",
    );
    if (!perm.allowed) throw new Error("Permission denied");
    const now = Date.now();

    const lead = await ctx.db.get(args.leadId);
    if (!lead || lead.organizationId !== args.organizationId) {
      throw new Error("Lead not found");
    }
    if (
      perm.scope === "own" &&
      lead.createdBy !== user._id &&
      lead.assignedTo !== user._id
    ) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    const stage = await ctx.db.get(args.pipelineStageId);
    if (!stage || stage.organizationId !== args.organizationId) {
      throw new Error("Stage not found");
    }

    const updateData: Record<string, any> = {
      pipelineStageId: args.pipelineStageId,
      stageOrder: args.stageOrder,
      updatedAt: now,
    };

    // Auto-set status based on stage flags
    if (stage.isWonStage) {
      updateData.status = "won";
      updateData.wonAt = now;
    } else if (stage.isLostStage) {
      updateData.status = "lost";
      updateData.lostAt = now;
    } else if (lead.status === "won" || lead.status === "lost") {
      // Moving from a won/lost stage back to a regular stage reopens the lead
      updateData.status = "open";
    }

    await ctx.db.patch(args.leadId, updateData);

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "lead",
      entityId: args.leadId,
      action: "stage_changed",
      description: `Moved lead "${lead.title}" to stage "${stage.name}"`,
      metadata: {
        fromStageId: lead.pipelineStageId,
        toStageId: args.pipelineStageId,
      },
      performedBy: user._id,
    });

    // Execute pipeline stage auto-actions for the new stage
    const stageActions = await ctx.db
      .query("pipelineStageActions")
      .withIndex("by_stage", (q) => q.eq("stageId", args.pipelineStageId))
      .collect();

    for (const stageAction of stageActions) {
      if (stageAction.actionType === "create_activity") {
        const { config } = stageAction;
        const dueDate = now + config.dueInDays * 24 * 60 * 60 * 1000;
        const ownerId = config.assignToOwner
          ? (lead.assignedTo ?? lead.createdBy)
          : user._id;

        await ctx.db.insert("scheduledActivities", {
          organizationId: args.organizationId,
          title: config.title,
          activityType: config.activityTypeId ?? "task",
          dueDate,
          isCompleted: false,
          ownerId,
          description: config.description,
          linkedEntityType: "lead",
          linkedEntityId: args.leadId,
          createdBy: user._id,
          createdAt: now,
          updatedAt: now,
        });

        if (ownerId !== user._id) {
          await createNotificationDirect(ctx, {
            organizationId: args.organizationId,
            userId: ownerId,
            type: "assigned",
            title: "New task from pipeline",
            message: `Task "${config.title}" created for lead "${lead.title}"`,
            link: `/leads/${args.leadId}`,
          });
        }
      }
    }

    // Audit + notify on auto-status changes from stage moves
    if (updateData.status && updateData.status !== lead.status) {
      if (updateData.status === "won" || updateData.status === "lost") {
        await logAudit(ctx, {
          organizationId: args.organizationId,
          userId: user._id,
          action: "status_changed",
          entityType: "lead",
          entityId: args.leadId,
          details: JSON.stringify({
            oldStatus: lead.status,
            newStatus: updateData.status,
          }),
        });

        const leadOwner = lead.assignedTo ?? lead.createdBy;
        if (updateData.status === "won" && leadOwner !== user._id) {
          await createNotificationDirect(ctx, {
            organizationId: args.organizationId,
            userId: leadOwner,
            type: "deal_won",
            title: "Deal won!",
            message: `Lead "${lead.title}" has been marked as won`,
            link: `/leads/${args.leadId}`,
          });
        }
        if (updateData.status === "lost" && leadOwner !== user._id) {
          await createNotificationDirect(ctx, {
            organizationId: args.organizationId,
            userId: leadOwner,
            type: "deal_lost",
            title: "Deal lost",
            message: `Lead "${lead.title}" has been marked as lost`,
            link: `/leads/${args.leadId}`,
          });
        }
      }

      await ctx.runMutation(internal.automation.emitEvent, {
        organizationId: args.organizationId,
        module: "crm",
        eventType: "crm.lead.stage_changed",
        entityType: "lead",
        entityId: String(args.leadId),
        actorUserId: user._id,
        correlationKey: `lead:${args.leadId}`,
        eventIdempotencyKey: `automation-event:${args.organizationId}:${args.leadId}:${now}:stage:${args.pipelineStageId}`,
        payload: JSON.stringify({
          organizationId: String(args.organizationId),
          leadId: String(args.leadId),
          title: lead.title,
          fromStageId: lead.pipelineStageId ? String(lead.pipelineStageId) : null,
          toStageId: String(args.pipelineStageId),
          oldStatus: lead.status,
          newStatus: updateData.status,
          ownerId: String(lead.assignedTo ?? lead.createdBy),
          createdBy: String(lead.createdBy),
        }),
        occurredAt: now,
      });
    }

    return args.leadId;
  },
});
