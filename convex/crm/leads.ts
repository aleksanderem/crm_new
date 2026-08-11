import { action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { logActivity } from "../_helpers/activities";
import { leadStatusValidator, leadPriorityValidator } from "@cvx/schema";
import { logAudit } from "../auditLog";
import { createNotificationDirect } from "../notifications";
import { Id } from "../_generated/dataModel";

// Dual-write refs removed — Supabase is now primary for lead writes

export const list = action({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    status: v.optional(leadStatusValidator),
  },
  handler: async (ctx, args): Promise<{ page: Array<Record<string, unknown>>; isDone: boolean; continueCursor: string }> => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "leads", action: "view" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    let q = db
      .query<{ createdBy: string; assignedTo: string | null }>("leads")
      .eq("organizationId", String(args.organizationId));
    if (args.status) q = q.eq("status", args.status);

    const rows = await q
      .order("createdAt", false)
      .take(args.paginationOpts.numItems)
      .collect();

    const page: Array<Record<string, unknown>> =
      perm.scope === "own"
        ? rows.filter(
            (r) =>
              r.createdBy === String(authResult.userId) ||
              r.assignedTo === String(authResult.userId),
          )
        : rows;

    return { page, isDone: true, continueCursor: "" };
  },
});


export const create = action({
  args: {
    organizationId: v.id("organizations"),
    title: v.string(),
    value: v.optional(v.union(v.number(), v.null())),
    currency: v.optional(v.union(v.string(), v.null())),
    status: leadStatusValidator,
    priority: v.optional(v.union(leadPriorityValidator, v.null())),
    expectedCloseDate: v.optional(v.union(v.number(), v.null())),
    source: v.optional(v.union(v.string(), v.null())),
    companyId: v.optional(v.union(v.string(), v.null())),
    assignedTo: v.optional(v.union(v.string(), v.null())),
    pipelineStageId: v.optional(v.union(v.string(), v.null())),
    stageOrder: v.optional(v.union(v.number(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
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
    categoryId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runAction(internal._helpers.authAction.checkPermission, {
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

    // --- Write custom field values to Supabase ---
    if (args.customFields) {
      for (const field of args.customFields) {
        await db.insert("customFieldValues", {
          organizationId: String(args.organizationId),
          fieldDefinitionId: field.fieldDefinitionId,
          entityType: "lead",
          entityId: leadId,
          value: field.value,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // --- Delegate post-write side effects ---
    try {
      await ctx.runMutation(internal.crm.leads._createSideEffects, {
        leadId,
        organizationId: args.organizationId,
        title: args.title,
        assignedTo: args.assignedTo ?? undefined,
        createdBy: String(authResult.userId),
        createdAt: now,
        actorLabel: authResult.userName ?? authResult.userEmail,
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
    createdBy: v.string(),
    createdAt: v.number(),
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const createdByUserId = args.createdBy as Id<"users">;

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "lead",
      entityId: args.leadId as Id<"leads">,
      action: "created",
      description: `Created lead "${args.title}"`,
      performedBy: createdByUserId,
      actorLabel: args.actorLabel,
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
    value: v.optional(v.union(v.number(), v.null())),
    currency: v.optional(v.union(v.string(), v.null())),
    status: v.optional(leadStatusValidator),
    priority: v.optional(v.union(leadPriorityValidator, v.null())),
    expectedCloseDate: v.optional(v.union(v.number(), v.null())),
    source: v.optional(v.union(v.string(), v.null())),
    companyId: v.optional(v.union(v.string(), v.null())),
    assignedTo: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
    tags: v.optional(v.array(v.string())),
    lostReason: v.optional(v.union(v.string(), v.null())),
    customFields: v.optional(
      v.array(
        v.object({
          fieldDefinitionId: v.string(),
          value: v.any(),
        }),
      ),
    ),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
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

    // Enforce lostReasonRequired when marking a lead as lost
    if (args.status === "lost") {
      const settings = await ctx.runAction(internal.orgSettings._getSettings, {
        organizationId: args.organizationId,
      });
      if (settings?.lostReasonRequired && !args.lostReason) {
        throw new Error("A lost reason is required");
      }
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

    // --- Update custom field values in Supabase ---
    if (customFields) {
      for (const field of customFields) {
        const existing = await db.query("customFieldValues")
          .eq("organizationId", String(organizationId))
          .eq("entityType", "lead")
          .eq("entityId", leadId)
          .eq("fieldDefinitionId", field.fieldDefinitionId)
          .unique();
        if (existing) {
          await db.patch("customFieldValues", existing._id as string, { value: field.value, updatedAt: now });
        } else {
          await db.insert("customFieldValues", {
            organizationId: String(organizationId),
            fieldDefinitionId: field.fieldDefinitionId,
            entityType: "lead",
            entityId: leadId,
            value: field.value,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }

    // --- Delegate post-write side effects ---
    try {
      await ctx.runMutation(internal.crm.leads._updateSideEffects, {
        leadId,
        organizationId,
        title: (lead.title as string) ?? "",
        oldStatus: (lead.status as string) ?? "",
        newStatus: updates.status,
        oldAssignedTo: lead.assignedTo ? String(lead.assignedTo) : undefined,
        newAssignedTo: updates.assignedTo ?? undefined,
        leadOwnerId: String(lead.assignedTo ?? lead.createdBy),
        updatedBy: String(authResult.userId),
        updatedAt: now,
        actorLabel: authResult.userName ?? authResult.userEmail,
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
    updatedBy: v.string(),
    updatedAt: v.number(),
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updatedByUserId = args.updatedBy as Id<"users">;
    const now = args.updatedAt;

    if (args.newStatus && args.newStatus !== args.oldStatus) {
      await logActivity(ctx, {
        organizationId: args.organizationId,
        entityType: "lead",
        entityId: args.leadId as Id<"leads">,
        action: "status_changed",
        description: `Changed lead status from "${args.oldStatus}" to "${args.newStatus}"`,
        metadata: { oldStatus: args.oldStatus, newStatus: args.newStatus },
        performedBy: updatedByUserId,
        actorLabel: args.actorLabel,
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

      await ctx.scheduler.runAfter(0, internal.automation.emitEvent, {
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
        actorLabel: args.actorLabel,
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
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
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

    // --- Delegate post-write side effects ---
    try {
      // Delete custom field values from Supabase
      const customValues = await db.query("customFieldValues")
        .eq("entityType", "lead")
        .eq("entityId", args.leadId)
        .collect();
      for (const cv of customValues) {
        await db.delete("customFieldValues", cv._id as string);
      }

      // Delete relationships where this lead is source or target from Supabase
      const sourceRels = await db.query("objectRelationships")
        .eq("sourceType", "lead")
        .eq("sourceId", args.leadId)
        .collect();
      const targetRels = await db.query("objectRelationships")
        .eq("targetType", "lead")
        .eq("targetId", args.leadId)
        .collect();
      for (const rel of [...sourceRels, ...targetRels]) {
        await db.delete("objectRelationships", rel._id as string);
      }

      await ctx.runMutation(internal.crm.leads._removeSideEffects, {
        leadId: args.leadId,
        organizationId: args.organizationId,
        title: (lead.title as string) ?? "",
        deletedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
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
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const deletedByUserId = args.deletedBy as Id<"users">;

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "lead",
      entityId: args.leadId as Id<"leads">,
      action: "deleted",
      description: `Deleted lead "${args.title}"`,
      performedBy: deletedByUserId,
      actorLabel: args.actorLabel,
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

export const getByPipeline = action({
  args: {
    organizationId: v.id("organizations"),
    pipelineId: v.id("pipelines"),
  },
  handler: async (ctx, args): Promise<Array<Record<string, unknown> & { leads: Array<Record<string, unknown>> }>> => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "leads", action: "view" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    const stages = await db
      .query("pipelineStages")
      .eq("organizationId", String(args.organizationId))
      .eq("pipelineId", String(args.pipelineId))
      .order("order", true)
      .collect();

    if (stages.length === 0) return [];

    const stageIds = stages.map((s) => String(s._id));

    const allLeads = await db
      .query<{ createdBy: string; assignedTo: string | null; pipelineStageId: string | null; stageOrder: number | null }>("leads")
      .eq("organizationId", String(args.organizationId))
      .in("pipelineStageId", stageIds)
      .collect();

    const filtered: typeof allLeads =
      perm.scope === "own"
        ? allLeads.filter(
            (l) =>
              l.createdBy === String(authResult.userId) ||
              l.assignedTo === String(authResult.userId),
          )
        : allLeads;

    const leadsByStage = new Map<string, typeof filtered>();
    for (const lead of filtered) {
      const sid = String(lead.pipelineStageId);
      if (!leadsByStage.has(sid)) leadsByStage.set(sid, []);
      leadsByStage.get(sid)!.push(lead);
    }
    for (const leads of leadsByStage.values()) {
      leads.sort((a, b) => (a.stageOrder ?? 0) - (b.stageOrder ?? 0));
    }

    return stages.map((stage) => ({
      ...stage,
      leads: leadsByStage.get(String(stage._id)) ?? [],
    }));
  },
});

// moveToStage — Supabase-primary for lead patch, side effects via internalMutation
export const moveToStage = action({
  args: {
    organizationId: v.id("organizations"),
    leadId: v.string(),
    pipelineStageId: v.string(),
    stageOrder: v.number(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "leads",
      action: "edit",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const now = Date.now();

    const lead = await db.get("leads", args.leadId);
    if (!lead || lead.organizationId !== String(args.organizationId)) {
      throw new Error("Lead not found");
    }
    if (
      perm.scope === "own" &&
      lead.createdBy !== String(authResult.userId) &&
      lead.assignedTo !== String(authResult.userId)
    ) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    const stage = await db.get("pipelineStages", args.pipelineStageId);
    if (!stage || stage.organizationId !== String(args.organizationId)) {
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
      updateData.status = "open";
    }

    await db.patch("leads", args.leadId, updateData);

    // --- Record stage entry in lead_stage_history ---
    try {
      await db.raw()
        .from("lead_stage_history")
        .update({ exited_at: now })
        .eq("lead_id", args.leadId)
        .is("exited_at", null);
      await db.insert("leadStageHistory", {
        organizationId: args.organizationId,
        leadId: args.leadId,
        stageId: args.pipelineStageId,
        enteredAt: now,
      });
    } catch (e) {
      console.warn("[moveToStage] stage history write failed:", e);
    }

    // --- Execute pipeline stage auto-actions (create_activity → scheduledActivities) in Supabase ---
    const createdActivities: Array<{ ownerId: string; title: string }> = [];
    try {
      const stageActions = await db
        .query("pipelineStageActions")
        .eq("stageId", args.pipelineStageId)
        .collect();
      for (const stageAction of stageActions) {
        if ((stageAction as any).actionType !== "create_activity") continue;
        const config = (stageAction as any).config as {
          dueInDays: number;
          title: string;
          description?: string;
          activityTypeId?: string;
          assignToOwner?: boolean;
        };
        const dueDate = now + (config.dueInDays ?? 0) * 24 * 60 * 60 * 1000;
        const ownerId = config.assignToOwner
          ? String(lead.assignedTo ?? lead.createdBy ?? authResult.userId)
          : String(authResult.userId);
        await db.insert("scheduledActivities", {
          organizationId: String(args.organizationId),
          title: config.title,
          activityType: config.activityTypeId ?? "task",
          dueDate,
          isCompleted: false,
          ownerId,
          description: config.description ?? null,
          linkedEntityType: "lead",
          linkedEntityId: args.leadId,
          createdBy: String(authResult.userId),
          createdAt: now,
          updatedAt: now,
        });
        createdActivities.push({ ownerId, title: config.title });
      }
    } catch (e) {
      console.warn("[moveToStage] stage action activity inserts failed:", e);
    }

    // Side effects via internalMutation (activity log, notifications for stage actions, audit)
    try {
      await ctx.runMutation(internal.crm.leads._moveToStageSideEffects, {
        organizationId: args.organizationId,
        leadId: args.leadId as any,
        pipelineStageId: args.pipelineStageId as any,
        userId: authResult.userId,
        leadTitle: (lead.title as string) ?? "",
        stageName: (stage.name as string) ?? "",
        oldStatus: (lead.status as string) ?? "",
        newStatus: updateData.status ?? null,
        oldStageId: lead.pipelineStageId ? String(lead.pipelineStageId) : null,
        leadCreatedBy: String(lead.createdBy ?? ""),
        leadAssignedTo: lead.assignedTo ? String(lead.assignedTo) : null,
        createdActivities,
        now,
        actorLabel: authResult.userName ?? authResult.userEmail,
      });
    } catch {
      // side effects are best-effort
    }

    return args.leadId;
  },
});

export const gdprErase = action({
  args: {
    organizationId: v.id("organizations"),
    leadId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Permission denied: GDPR erasure requires owner or admin role");
    }

    const db = createSupabaseDb();
    const lead = await db.get("leads", args.leadId);
    if (!lead || String(lead.organizationId) !== String(args.organizationId)) {
      throw new Error("Lead not found");
    }

    const originalTitle = (lead.title as string) ?? "";
    const orgStr = String(args.organizationId);
    const GDPR_REDACTED = "[RODO: dane usunięte]";

    await db.patch("leads", args.leadId, {
      notes: null,
      updatedAt: Date.now(),
    });

    const client = db.raw();

    await client
      .from("custom_field_values")
      .delete()
      .eq("organization_id", orgStr)
      .eq("entity_type", "lead")
      .eq("entity_id", args.leadId);

    await client
      .from("activities")
      .update({ description: GDPR_REDACTED })
      .eq("organization_id", orgStr)
      .eq("entity_type", "lead")
      .eq("entity_id", args.leadId);

    await client
      .from("notes")
      .update({ content: GDPR_REDACTED, updated_at: Date.now() })
      .eq("organization_id", orgStr)
      .eq("entity_type", "lead")
      .eq("entity_id", args.leadId);

    try {
      await ctx.runMutation(internal.crm.leads._gdprEraseSideEffects, {
        leadId: args.leadId,
        organizationId: args.organizationId,
        originalTitle,
        erasedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
      });
    } catch (e) {
      console.error("[leads.gdprErase] Side effects FAILED for lead", args.leadId, ":", e);
    }

    return args.leadId;
  },
});

export const _gdprEraseSideEffects = internalMutation({
  args: {
    leadId: v.string(),
    organizationId: v.id("organizations"),
    originalTitle: v.string(),
    erasedBy: v.string(),
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const erasedByUserId = args.erasedBy as Id<"users">;
    const GDPR_REDACTED = "[RODO: dane usunięte]";

    const db = createSupabaseDb();

    const existingActivities = await db
      .query("activities")
      .eq("entityType", "lead")
      .eq("entityId", args.leadId)
      .collect();
    for (const activity of existingActivities) {
      await db.patch("activities", String(activity._id), { description: GDPR_REDACTED });
    }

    const existingNotes = await db
      .query("notes")
      .eq("entityType", "lead")
      .eq("entityId", args.leadId)
      .collect();
    for (const note of existingNotes) {
      await db.patch("notes", String(note._id), { content: GDPR_REDACTED, updatedAt: Date.now() });
    }

    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: erasedByUserId,
      action: "gdpr_lead_erased",
      entityType: "lead",
      entityId: args.leadId,
      details: `GDPR erasure performed on lead "${args.originalTitle}" (ID: ${args.leadId})`,
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "lead",
      entityId: args.leadId as Id<"leads">,
      action: "deleted",
      description: "RODO: dane leadu zostały usunięte",
      performedBy: erasedByUserId,
      actorLabel: args.actorLabel,
    });
  },
});

export const gdprExport = action({
  args: {
    organizationId: v.id("organizations"),
    leadId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Permission denied: GDPR export requires owner or admin role");
    }

    const db = createSupabaseDb();
    const lead = await db.get("leads", args.leadId);
    if (!lead || String(lead.organizationId) !== String(args.organizationId)) {
      throw new Error("Lead not found");
    }

    const orgStr = String(args.organizationId);
    const client = db.raw();

    const { data: activities } = await client
      .from("activities")
      .select("action, description, created_at")
      .eq("organization_id", orgStr)
      .eq("entity_type", "lead")
      .eq("entity_id", args.leadId)
      .order("created_at", { ascending: true });

    const { data: notes } = await client
      .from("notes")
      .select("content, created_at, updated_at")
      .eq("organization_id", orgStr)
      .eq("entity_type", "lead")
      .eq("entity_id", args.leadId)
      .order("created_at", { ascending: true });

    const { data: customFieldValues } = await client
      .from("custom_field_values")
      .select("value, created_at, updated_at")
      .eq("organization_id", orgStr)
      .eq("entity_type", "lead")
      .eq("entity_id", args.leadId);

    return {
      exportedAt: new Date().toISOString(),
      lead: {
        id: args.leadId,
        title: lead.title,
        notes: lead.notes,
        value: lead.value,
        currency: lead.currency,
        status: lead.status,
        priority: lead.priority,
        source: lead.source,
        expectedCloseDate: lead.expectedCloseDate,
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt,
      },
      activities: activities ?? [],
      notes: notes ?? [],
      customFieldValues: customFieldValues ?? [],
    };
  },
});

export const _moveToStageSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    leadId: v.id("leads"),
    pipelineStageId: v.id("pipelineStages"),
    userId: v.id("users"),
    leadTitle: v.string(),
    stageName: v.string(),
    oldStatus: v.string(),
    newStatus: v.union(v.string(), v.null()),
    oldStageId: v.union(v.string(), v.null()),
    leadCreatedBy: v.string(),
    leadAssignedTo: v.union(v.string(), v.null()),
    createdActivities: v.optional(v.array(v.object({
      ownerId: v.string(),
      title: v.string(),
    }))),
    now: v.number(),
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "lead",
      entityId: args.leadId,
      action: "stage_changed",
      description: `Moved lead "${args.leadTitle}" to stage "${args.stageName}"`,
      metadata: {
        fromStageId: args.oldStageId,
        toStageId: String(args.pipelineStageId),
      },
      performedBy: args.userId,
      actorLabel: args.actorLabel,
    });

    // scheduledActivities for stage actions are inserted by the parent action in Supabase.
    // Here we only emit "New task from pipeline" notifications for activities that were
    // assigned to someone other than the actor.
    for (const created of args.createdActivities ?? []) {
      if (created.ownerId !== String(args.userId)) {
        await createNotificationDirect(ctx, {
          organizationId: args.organizationId,
          userId: created.ownerId as Id<"users">,
          type: "assigned",
          title: "New task from pipeline",
          message: `Task "${created.title}" created for lead "${args.leadTitle}"`,
          link: `/leads/${args.leadId}`,
        });
      }
    }

    // Audit + notify on auto-status changes
    if (args.newStatus && args.newStatus !== args.oldStatus) {
      if (args.newStatus === "won" || args.newStatus === "lost") {
        await logAudit(ctx, {
          organizationId: args.organizationId,
          userId: args.userId,
          action: "status_changed",
          entityType: "lead",
          entityId: args.leadId,
          details: JSON.stringify({
            oldStatus: args.oldStatus,
            newStatus: args.newStatus,
          }),
        });

        const leadOwner = (args.leadAssignedTo ?? args.leadCreatedBy) as unknown as Id<"users">;
        if (args.newStatus === "won" && leadOwner !== args.userId) {
          await createNotificationDirect(ctx, {
            organizationId: args.organizationId,
            userId: leadOwner,
            type: "deal_won",
            title: "Deal won!",
            message: `Lead "${args.leadTitle}" has been marked as won`,
            link: `/leads/${args.leadId}`,
          });
        }
        if (args.newStatus === "lost" && leadOwner !== args.userId) {
          await createNotificationDirect(ctx, {
            organizationId: args.organizationId,
            userId: leadOwner,
            type: "deal_lost",
            title: "Deal lost",
            message: `Lead "${args.leadTitle}" has been marked as lost`,
            link: `/leads/${args.leadId}`,
          });
        }
      }

      await ctx.scheduler.runAfter(0, internal.automation.emitEvent, {
        organizationId: args.organizationId,
        module: "crm",
        eventType: "crm.lead.stage_changed",
        entityType: "lead",
        entityId: String(args.leadId),
        actorUserId: args.userId,
        correlationKey: `lead:${args.leadId}`,
        eventIdempotencyKey: `automation-event:${args.organizationId}:${args.leadId}:${args.now}:stage:${args.pipelineStageId}`,
        payload: JSON.stringify({
          organizationId: String(args.organizationId),
          leadId: String(args.leadId),
          title: args.leadTitle,
          fromStageId: args.oldStageId,
          toStageId: String(args.pipelineStageId),
          oldStatus: args.oldStatus,
          newStatus: args.newStatus,
          ownerId: args.leadAssignedTo ?? args.leadCreatedBy,
          createdBy: args.leadCreatedBy,
        }),
        occurredAt: args.now,
      });
    }
  },
});
