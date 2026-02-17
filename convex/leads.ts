import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { verifyOrgAccess } from "./_helpers/auth";
import { logActivity } from "./_helpers/activities";
import { checkPermission } from "./_helpers/permissions";
import { leadStatusValidator, leadPriorityValidator } from "@cvx/schema";

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    status: v.optional(leadStatusValidator),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "leads", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const isOwn = perm.scope === "own";
    const ownFilter = (r: any) => r.createdBy === user._id || r.assignedTo === user._id;

    if (args.search) {
      const results = await ctx.db
        .query("leads")
        .withSearchIndex("search_leads", (q) => {
          let sq = q.search("title", args.search!).eq("organizationId", args.organizationId);
          if (args.status) sq = sq.eq("status", args.status);
          return sq;
        })
        .take(50);
      if (isOwn) {
        return { page: results.filter(ownFilter), isDone: true, continueCursor: "" };
      }
      return { page: results, isDone: true, continueCursor: "" };
    }

    if (args.status) {
      const result = await ctx.db
        .query("leads")
        .withIndex("by_orgAndStatus", (q) =>
          q.eq("organizationId", args.organizationId).eq("status", args.status!)
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
    const perm = await checkPermission(ctx, args.organizationId, "leads", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const lead = await ctx.db.get(args.leadId);
    if (!lead || lead.organizationId !== args.organizationId) {
      throw new Error("Lead not found");
    }
    if (perm.scope === "own" && lead.createdBy !== user._id && lead.assignedTo !== user._id) {
      throw new Error("Permission denied");
    }

    const [customFieldValues, company, assignedUser, stage] = await Promise.all([
      ctx.db
        .query("customFieldValues")
        .withIndex("by_entity", (q) =>
          q.eq("entityType", "lead").eq("entityId", args.leadId)
        )
        .collect(),
      lead.companyId ? ctx.db.get(lead.companyId) : null,
      lead.assignedTo ? ctx.db.get(lead.assignedTo) : null,
      lead.pipelineStageId ? ctx.db.get(lead.pipelineStageId) : null,
    ]);

    return {
      ...lead,
      customFieldValues,
      company,
      assignedUser: assignedUser
        ? { _id: assignedUser._id, name: assignedUser.name, email: assignedUser.email, image: assignedUser.image }
        : null,
      stage,
    };
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    title: v.string(),
    value: v.optional(v.number()),
    currency: v.optional(v.string()),
    status: leadStatusValidator,
    priority: v.optional(leadPriorityValidator),
    expectedCloseDate: v.optional(v.number()),
    source: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
    assignedTo: v.optional(v.id("users")),
    pipelineStageId: v.optional(v.id("pipelineStages")),
    stageOrder: v.optional(v.number()),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    customFields: v.optional(v.array(v.object({
      fieldDefinitionId: v.id("customFieldDefinitions"),
      value: v.any(),
    }))),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "leads", "create");
    if (!perm.allowed) throw new Error("Permission denied");
    const now = Date.now();
    const { customFields, ...leadData } = args;

    const leadId = await ctx.db.insert("leads", {
      ...leadData,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    if (customFields) {
      for (const field of customFields) {
        await ctx.db.insert("customFieldValues", {
          organizationId: args.organizationId,
          fieldDefinitionId: field.fieldDefinitionId,
          entityType: "lead",
          entityId: leadId,
          value: field.value,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "lead",
      entityId: leadId,
      action: "created",
      description: `Created lead "${args.title}"`,
      performedBy: user._id,
    });

    return leadId;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    leadId: v.id("leads"),
    title: v.optional(v.string()),
    value: v.optional(v.number()),
    currency: v.optional(v.string()),
    status: v.optional(leadStatusValidator),
    priority: v.optional(leadPriorityValidator),
    expectedCloseDate: v.optional(v.number()),
    source: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
    assignedTo: v.optional(v.id("users")),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    customFields: v.optional(v.array(v.object({
      fieldDefinitionId: v.id("customFieldDefinitions"),
      value: v.any(),
    }))),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "leads", "edit");
    if (!perm.allowed) throw new Error("Permission denied");
    const now = Date.now();

    const lead = await ctx.db.get(args.leadId);
    if (!lead || lead.organizationId !== args.organizationId) {
      throw new Error("Lead not found");
    }
    if (perm.scope === "own" && lead.createdBy !== user._id && lead.assignedTo !== user._id) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    const { organizationId, leadId, customFields, ...updates } = args;

    // Track status changes
    if (updates.status && updates.status !== lead.status) {
      if (updates.status === "won") {
        (updates as any).wonAt = now;
      } else if (updates.status === "lost") {
        (updates as any).lostAt = now;
      }
    }

    await ctx.db.patch(leadId, { ...updates, updatedAt: now });

    if (customFields) {
      for (const field of customFields) {
        const existing = await ctx.db
          .query("customFieldValues")
          .withIndex("by_orgEntityField", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("entityType", "lead")
              .eq("entityId", leadId)
              .eq("fieldDefinitionId", field.fieldDefinitionId)
          )
          .unique();

        if (existing) {
          await ctx.db.patch(existing._id, { value: field.value, updatedAt: now });
        } else {
          await ctx.db.insert("customFieldValues", {
            organizationId,
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

    if (updates.status && updates.status !== lead.status) {
      await logActivity(ctx, {
        organizationId,
        entityType: "lead",
        entityId: leadId,
        action: "status_changed",
        description: `Changed lead status from "${lead.status}" to "${updates.status}"`,
        metadata: { oldStatus: lead.status, newStatus: updates.status },
        performedBy: user._id,
      });
    } else {
      await logActivity(ctx, {
        organizationId,
        entityType: "lead",
        entityId: leadId,
        action: "updated",
        description: `Updated lead "${lead.title}"`,
        performedBy: user._id,
      });
    }

    return leadId;
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    leadId: v.id("leads"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "leads", "delete");
    if (!perm.allowed) throw new Error("Permission denied");

    const lead = await ctx.db.get(args.leadId);
    if (!lead || lead.organizationId !== args.organizationId) {
      throw new Error("Lead not found");
    }
    if (perm.scope === "own" && lead.createdBy !== user._id && lead.assignedTo !== user._id) {
      throw new Error("Permission denied: you can only delete your own records");
    }

    const customValues = await ctx.db
      .query("customFieldValues")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "lead").eq("entityId", args.leadId)
      )
      .collect();
    for (const cv of customValues) {
      await ctx.db.delete(cv._id);
    }

    await ctx.db.delete(args.leadId);

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "lead",
      entityId: args.leadId,
      action: "deleted",
      description: `Deleted lead "${lead.title}"`,
      performedBy: user._id,
    });

    return args.leadId;
  },
});

export const getByPipeline = query({
  args: {
    organizationId: v.id("organizations"),
    pipelineId: v.id("pipelines"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "leads", "view");
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
            q.eq("pipelineStageId", stage._id)
          )
          .collect();

        // Sort by stageOrder client-side since index returns in order
        leads.sort((a, b) => (a.stageOrder ?? 0) - (b.stageOrder ?? 0));

        const filtered = perm.scope === "own"
          ? leads.filter((l) => l.createdBy === user._id || l.assignedTo === user._id)
          : leads;

        return { ...stage, leads: filtered };
      })
    );

    return stagesWithLeads;
  },
});

export const moveToStage = mutation({
  args: {
    organizationId: v.id("organizations"),
    leadId: v.id("leads"),
    pipelineStageId: v.id("pipelineStages"),
    stageOrder: v.number(),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "leads", "edit");
    if (!perm.allowed) throw new Error("Permission denied");
    const now = Date.now();

    const lead = await ctx.db.get(args.leadId);
    if (!lead || lead.organizationId !== args.organizationId) {
      throw new Error("Lead not found");
    }
    if (perm.scope === "own" && lead.createdBy !== user._id && lead.assignedTo !== user._id) {
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

    return args.leadId;
  },
});
