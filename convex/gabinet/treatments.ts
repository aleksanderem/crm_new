import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { verifyOrgAccess } from "../_helpers/auth";
import { checkPermission } from "../_helpers/permissions";
import { logActivity } from "../_helpers/activities";

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_treatments", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    if (args.search) {
      const results = await ctx.db
        .query("gabinetTreatments")
        .withSearchIndex("search_treatments", (q) =>
          q.search("name", args.search!).eq("organizationId", args.organizationId)
        )
        .take(50);
      if (perm.scope === "own") {
        const filtered = results.filter((r) => r.createdBy === user._id);
        return { page: filtered, isDone: true, continueCursor: "" };
      }
      return { page: results, isDone: true, continueCursor: "" };
    }

    const result = await ctx.db
      .query("gabinetTreatments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .paginate(args.paginationOpts);
    if (perm.scope === "own") {
      return { ...result, page: result.page.filter((r) => r.createdBy === user._id) };
    }
    return result;
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.id("gabinetTreatments"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_treatments", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const treatment = await ctx.db.get(args.treatmentId);
    if (!treatment || treatment.organizationId !== args.organizationId) {
      throw new Error("Treatment not found");
    }
    if (perm.scope === "own" && treatment.createdBy !== user._id) {
      throw new Error("Permission denied: you can only view your own records");
    }

    return treatment;
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    duration: v.number(),
    price: v.number(),
    currency: v.optional(v.string()),
    taxRate: v.optional(v.number()),
    requiredEquipment: v.optional(v.array(v.string())),
    contraindications: v.optional(v.string()),
    preparationInstructions: v.optional(v.string()),
    aftercareInstructions: v.optional(v.string()),
    requiresApproval: v.optional(v.boolean()),
    color: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_treatments", "create");
    if (!perm.allowed) throw new Error("Permission denied");
    const now = Date.now();

    const treatmentId = await ctx.db.insert("gabinetTreatments", {
      ...args,
      isActive: true,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetTreatment",
      entityId: treatmentId,
      action: "created",
      description: `Created treatment "${args.name}"`,
      performedBy: user._id,
    });

    return treatmentId;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.id("gabinetTreatments"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    duration: v.optional(v.number()),
    price: v.optional(v.number()),
    currency: v.optional(v.string()),
    taxRate: v.optional(v.number()),
    requiredEquipment: v.optional(v.array(v.string())),
    contraindications: v.optional(v.string()),
    preparationInstructions: v.optional(v.string()),
    aftercareInstructions: v.optional(v.string()),
    requiresApproval: v.optional(v.boolean()),
    color: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_treatments", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const treatment = await ctx.db.get(args.treatmentId);
    if (!treatment || treatment.organizationId !== args.organizationId) {
      throw new Error("Treatment not found");
    }
    if (perm.scope === "own" && treatment.createdBy !== user._id) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    const { organizationId, treatmentId, ...updates } = args;
    await ctx.db.patch(treatmentId, { ...updates, updatedAt: Date.now() });

    await logActivity(ctx, {
      organizationId,
      entityType: "gabinetTreatment",
      entityId: treatmentId,
      action: "updated",
      description: `Updated treatment "${treatment.name}"`,
      performedBy: user._id,
    });

    return treatmentId;
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.id("gabinetTreatments"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_treatments", "delete");
    if (!perm.allowed) throw new Error("Permission denied");

    const treatment = await ctx.db.get(args.treatmentId);
    if (!treatment || treatment.organizationId !== args.organizationId) {
      throw new Error("Treatment not found");
    }
    if (perm.scope === "own" && treatment.createdBy !== user._id) {
      throw new Error("Permission denied: you can only delete your own records");
    }

    await ctx.db.patch(args.treatmentId, {
      isActive: false,
      updatedAt: Date.now(),
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetTreatment",
      entityId: args.treatmentId,
      action: "deleted",
      description: `Deleted treatment "${treatment.name}"`,
      performedBy: user._id,
    });

    return args.treatmentId;
  },
});

export const listByCategory = query({
  args: {
    organizationId: v.id("organizations"),
    category: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_treatments", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const results = await ctx.db
      .query("gabinetTreatments")
      .withIndex("by_orgAndCategory", (q) =>
        q.eq("organizationId", args.organizationId).eq("category", args.category)
      )
      .collect();
    if (perm.scope === "own") {
      return results.filter((r) => r.createdBy === user._id);
    }
    return results;
  },
});

export const listActive = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_treatments", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const results = await ctx.db
      .query("gabinetTreatments")
      .withIndex("by_orgAndActive", (q) =>
        q.eq("organizationId", args.organizationId).eq("isActive", true)
      )
      .collect();
    if (perm.scope === "own") {
      return results.filter((r) => r.createdBy === user._id);
    }
    return results;
  },
});
