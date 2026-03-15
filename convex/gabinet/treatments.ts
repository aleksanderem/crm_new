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

// --- Treatment Detail Page queries/mutations ---

export const getTreatmentStats = query({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.id("gabinetTreatments"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_treatments", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const allAppointments = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_orgAndTreatment", (q) =>
        q.eq("organizationId", args.organizationId).eq("treatmentId", args.treatmentId)
      )
      .collect();

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const thisMonthAppointments = allAppointments.filter((a) => a.date >= monthStart);
    const completedAppointments = allAppointments.filter((a) => a.status === "completed");

    const treatment = await ctx.db.get(args.treatmentId);
    const revenue = completedAppointments.length * (treatment?.price ?? 0);

    return {
      totalAppointments: allAppointments.length,
      thisMonthAppointments: thisMonthAppointments.length,
      completedAppointments: completedAppointments.length,
      revenue,
    };
  },
});

export const listTreatmentAppointments = query({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.id("gabinetTreatments"),
    status: v.optional(v.string()),
    employeeId: v.optional(v.id("users")),
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_appointments", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    let appointments = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_orgAndTreatment", (q) =>
        q.eq("organizationId", args.organizationId).eq("treatmentId", args.treatmentId)
      )
      .collect();

    if (args.status) {
      appointments = appointments.filter((a) => a.status === args.status);
    }
    if (args.employeeId) {
      appointments = appointments.filter((a) => a.employeeId === args.employeeId);
    }
    if (args.dateFrom) {
      appointments = appointments.filter((a) => a.date >= args.dateFrom!);
    }
    if (args.dateTo) {
      appointments = appointments.filter((a) => a.date <= args.dateTo!);
    }

    // Sort by date descending
    appointments.sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));

    // Enrich with patient and employee names
    const enriched = await Promise.all(
      appointments.map(async (apt) => {
        const patient = await ctx.db.get(apt.patientId);
        const employeeUser = await ctx.db.get(apt.employeeId);
        return {
          ...apt,
          patientName: patient
            ? `${patient.firstName ?? ""} ${patient.lastName ?? ""}`.trim()
            : "—",
          employeeName: employeeUser?.name ?? employeeUser?.email ?? "—",
        };
      })
    );

    return enriched;
  },
});

export const getTreatmentEmployees = query({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.id("gabinetTreatments"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_employees", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    // Employees store qualifiedTreatmentIds — query from that side
    const allEmployees = await ctx.db
      .query("gabinetEmployees")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const assigned = allEmployees.filter((emp) =>
      emp.qualifiedTreatmentIds.includes(args.treatmentId)
    );

    // Enrich with user info
    const enriched = await Promise.all(
      assigned.map(async (emp) => {
        const user = await ctx.db.get(emp.userId);
        return {
          _id: emp._id,
          userId: emp.userId,
          firstName: emp.firstName,
          lastName: emp.lastName,
          role: emp.role,
          specialization: emp.specialization,
          isActive: emp.isActive,
          color: emp.color,
          userName: user?.name ?? user?.email ?? "—",
          userImage: user?.image,
        };
      })
    );

    return enriched;
  },
});

export const getTreatmentDocumentTemplates = query({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.id("gabinetTreatments"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_treatments", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const treatment = await ctx.db.get(args.treatmentId);
    if (!treatment || treatment.organizationId !== args.organizationId) {
      throw new Error("Treatment not found");
    }

    const templateIds = treatment.requiredDocumentTemplateIds ?? [];
    const templates = await Promise.all(
      templateIds.map(async (id) => ctx.db.get(id))
    );

    return templates.filter(
      (t): t is NonNullable<typeof t> => t !== null
    );
  },
});

export const setRequiredDocumentTemplates = mutation({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.id("gabinetTreatments"),
    templateIds: v.array(v.id("gabinetDocumentTemplates")),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_treatments", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const treatment = await ctx.db.get(args.treatmentId);
    if (!treatment || treatment.organizationId !== args.organizationId) {
      throw new Error("Treatment not found");
    }

    await ctx.db.patch(args.treatmentId, {
      requiredDocumentTemplateIds: args.templateIds,
      updatedAt: Date.now(),
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetTreatment",
      entityId: args.treatmentId,
      action: "updated",
      description: `Updated required documents for treatment "${treatment.name}"`,
      performedBy: user._id,
    });

    return args.treatmentId;
  },
});

export const saveTreatmentParameters = mutation({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.id("gabinetTreatments"),
    parameters: v.array(
      v.object({
        name: v.string(),
        value: v.string(),
        unit: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_treatments", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const treatment = await ctx.db.get(args.treatmentId);
    if (!treatment || treatment.organizationId !== args.organizationId) {
      throw new Error("Treatment not found");
    }

    await ctx.db.patch(args.treatmentId, {
      parameters: args.parameters,
      updatedAt: Date.now(),
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetTreatment",
      entityId: args.treatmentId,
      action: "updated",
      description: `Updated parameters for treatment "${treatment.name}"`,
      performedBy: user._id,
    });

    return args.treatmentId;
  },
});

// --- Treatment Variants ---

export const listVariants = query({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.id("gabinetTreatments"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_treatments", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const treatment = await ctx.db.get(args.treatmentId);
    if (!treatment || treatment.organizationId !== args.organizationId) {
      throw new Error("Treatment not found");
    }

    const variants = await ctx.db
      .query("gabinetTreatmentVariants")
      .withIndex("by_treatment", (q) => q.eq("treatmentId", args.treatmentId))
      .collect();

    // Sort by sortOrder, then by creation time
    variants.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a._creationTime - b._creationTime);

    // Resolve inherited fields
    return variants.map((variant) => ({
      ...variant,
      resolvedPrice: variant.price ?? treatment.price,
      resolvedDuration: variant.duration ?? treatment.duration,
      resolvedDescription: variant.description ?? treatment.description,
      resolvedShortDescription: variant.shortDescription ?? treatment.shortDescription,
      resolvedImage: variant.image ?? treatment.image,
      priceInherited: variant.price === undefined,
      durationInherited: variant.duration === undefined,
      descriptionInherited: variant.description === undefined,
      shortDescriptionInherited: variant.shortDescription === undefined,
      imageInherited: variant.image === undefined,
    }));
  },
});

export const getVariant = query({
  args: {
    organizationId: v.id("organizations"),
    variantId: v.id("gabinetTreatmentVariants"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_treatments", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const variant = await ctx.db.get(args.variantId);
    if (!variant || variant.organizationId !== args.organizationId) {
      throw new Error("Variant not found");
    }

    const treatment = await ctx.db.get(variant.treatmentId);
    if (!treatment) throw new Error("Parent treatment not found");

    return {
      ...variant,
      resolvedPrice: variant.price ?? treatment.price,
      resolvedDuration: variant.duration ?? treatment.duration,
      resolvedDescription: variant.description ?? treatment.description,
      resolvedShortDescription: variant.shortDescription ?? treatment.shortDescription,
      resolvedImage: variant.image ?? treatment.image,
      priceInherited: variant.price === undefined,
      durationInherited: variant.duration === undefined,
      descriptionInherited: variant.description === undefined,
      shortDescriptionInherited: variant.shortDescription === undefined,
      imageInherited: variant.image === undefined,
    };
  },
});

export const createVariant = mutation({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.id("gabinetTreatments"),
    name: v.string(),
    price: v.optional(v.number()),
    duration: v.optional(v.number()),
    description: v.optional(v.string()),
    shortDescription: v.optional(v.string()),
    image: v.optional(v.id("_storage")),
    isActive: v.optional(v.boolean()),
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

    const variantId = await ctx.db.insert("gabinetTreatmentVariants", {
      organizationId: args.organizationId,
      treatmentId: args.treatmentId,
      name: args.name,
      price: args.price,
      duration: args.duration,
      description: args.description,
      shortDescription: args.shortDescription,
      image: args.image,
      isActive: args.isActive ?? true,
      sortOrder: args.sortOrder,
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetTreatment",
      entityId: args.treatmentId,
      action: "updated",
      description: `Added variant "${args.name}" to treatment "${treatment.name}"`,
      performedBy: user._id,
    });

    return variantId;
  },
});

export const updateVariant = mutation({
  args: {
    organizationId: v.id("organizations"),
    variantId: v.id("gabinetTreatmentVariants"),
    name: v.optional(v.string()),
    price: v.optional(v.number()),
    duration: v.optional(v.number()),
    description: v.optional(v.string()),
    shortDescription: v.optional(v.string()),
    image: v.optional(v.id("_storage")),
    isActive: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
    // Allow explicitly clearing overrides back to inherited
    clearPrice: v.optional(v.boolean()),
    clearDuration: v.optional(v.boolean()),
    clearDescription: v.optional(v.boolean()),
    clearShortDescription: v.optional(v.boolean()),
    clearImage: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_treatments", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const variant = await ctx.db.get(args.variantId);
    if (!variant || variant.organizationId !== args.organizationId) {
      throw new Error("Variant not found");
    }

    const treatment = await ctx.db.get(variant.treatmentId);
    if (!treatment) throw new Error("Parent treatment not found");

    const updates: Record<string, unknown> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.isActive !== undefined) updates.isActive = args.isActive;
    if (args.sortOrder !== undefined) updates.sortOrder = args.sortOrder;

    // Handle overridable fields — set or clear
    if (args.clearPrice) updates.price = undefined;
    else if (args.price !== undefined) updates.price = args.price;

    if (args.clearDuration) updates.duration = undefined;
    else if (args.duration !== undefined) updates.duration = args.duration;

    if (args.clearDescription) updates.description = undefined;
    else if (args.description !== undefined) updates.description = args.description;

    if (args.clearShortDescription) updates.shortDescription = undefined;
    else if (args.shortDescription !== undefined) updates.shortDescription = args.shortDescription;

    if (args.clearImage) updates.image = undefined;
    else if (args.image !== undefined) updates.image = args.image;

    await ctx.db.patch(args.variantId, updates);

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetTreatment",
      entityId: variant.treatmentId,
      action: "updated",
      description: `Updated variant "${variant.name}" of treatment "${treatment.name}"`,
      performedBy: user._id,
    });

    return args.variantId;
  },
});

export const deleteVariant = mutation({
  args: {
    organizationId: v.id("organizations"),
    variantId: v.id("gabinetTreatmentVariants"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_treatments", "delete");
    if (!perm.allowed) throw new Error("Permission denied");

    const variant = await ctx.db.get(args.variantId);
    if (!variant || variant.organizationId !== args.organizationId) {
      throw new Error("Variant not found");
    }

    const treatment = await ctx.db.get(variant.treatmentId);

    await ctx.db.delete(args.variantId);

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetTreatment",
      entityId: variant.treatmentId,
      action: "updated",
      description: `Deleted variant "${variant.name}" from treatment "${treatment?.name ?? "unknown"}"`,
      performedBy: user._id,
    });

    return args.variantId;
  },
});
